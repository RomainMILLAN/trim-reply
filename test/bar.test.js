import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./load-core.js";
import { mount, behaveLikeGmail, tick } from "./fake-gmail.js";
import { install } from "./fake-platform.js";
import { installDocument, MouseEvent, trusted } from "./fake-dom.js";

const g = await loadCore();
const { TrimReplyBar, ComposeSession, Settings, QuoteShape, ComposeContext, GmailCompose, GmailDom,
  TrimReplyMain, SettingsRepository, StatsRepository, Display } = g;

const FAST = Object.freeze({ APPEAR_MS: 40, UNFOLD_MS: 40, POLL_MS: 5 });

function makeBar({ bar = true, messages } = {}) {
  install(g, { messages });
  installDocument();
  const calls = { trim: 0, undo: 0 };
  const view = TrimReplyBar.create({
    onTrim: () => { calls.trim += 1; },
    onUndo: () => { calls.undo += 1; },
    display: Display.from({ bar }),
  });
  const q = (sel) => view.shadow.querySelector(sel);
  const visible = (sel) => !q(sel).hasAttribute("hidden");
  return { view, calls, q, visible };
}

/** Session states produced by the real session, not hand-made. */
function states() {
  const fakeCut = (verdict) => ({ restore() {}, verify: () => verdict });
  const s = new ComposeSession(Settings.from({}));
  const seen = new Map();
  s.onChange((st) => { if (!seen.has(st.name)) seen.set(st.name, st); });
  const run = s.plan(QuoteShape.unknown(), ComposeContext.of("manual", false));
  run.confirm(QuoteShape.reply(6));
  run.recorder().record(fakeCut("clean"));
  s.undo();
  const u = new ComposeSession(Settings.from({}));
  u.onChange((st) => { if (!seen.has(st.name)) seen.set(st.name, st); });
  const r2 = u.plan(QuoteShape.unknown(), ComposeContext.of("manual", false));
  r2.confirm(QuoteShape.reply(150));
  r2.recorder().record(fakeCut("uncertain"));
  const f = new ComposeSession(Settings.from({}));
  f.onChange((st) => { if (!seen.has(st.name)) seen.set(st.name, st); });
  f.plan(QuoteShape.forward(), ComposeContext.of("auto", false));
  return Object.fromEntries(seen);
}
const S = states();

test("the bar lives in a closed shadow root with a constructed stylesheet", () => {
  const { view } = makeBar();
  assert.equal(view.host.shadowRoot, null, "the page cannot reach into a closed root");
  assert.equal(view.shadow.adoptedStyleSheets.length, 1);
  assert.match(view.shadow.adoptedStyleSheets[0].cssText, /\.bar/);
});

test("Untouched and Restored offer Trim, and nothing else", () => {
  for (const name of ["Untouched", "Restored"]) {
    const { view, visible } = makeBar();
    view.render(S[name]);
    assert.equal(visible(".bar"), true, name);
    assert.equal(visible("button.trim"), true, name);
    assert.equal(visible("button.undo"), false, name);
    assert.equal(visible(".message"), false, name);
  }
});

test("Inspecting and Ineligible show nothing", () => {
  for (const name of ["Inspecting", "Ineligible"]) {
    const { view, visible } = makeBar();
    view.render(S[name]);
    assert.equal(visible(".bar"), false, name);
  }
});

test("Trimmed shows how much was removed, and Undo", () => {
  const { view, visible, q } = makeBar();
  view.render(S.Trimmed);
  assert.equal(visible(".bar"), true);
  assert.equal(visible("button.trim"), false);
  assert.equal(visible("button.undo"), true);
  assert.equal(q(".message").textContent, "Quoted history removed (6)");
  assert.equal(q(".bar").classList.contains("warning"), false);
});

test("a masked bar shows nothing after a clean trim", () => {
  const { view, visible } = makeBar({ bar: false });
  view.render(S.Trimmed);
  assert.equal(visible(".bar"), false);
});

test("a masked bar still offers the Trim button", () => {
  const { view, visible } = makeBar({ bar: false });
  view.render(S.Untouched);
  assert.equal(visible("button.trim"), true);
});

test("an uncertain trim is always shown, as a warning, with Undo -- even with the bar masked", () => {
  for (const bar of [true, false]) {
    const { view, visible, q } = makeBar({ bar });
    view.render(S.TrimmedUncertain);
    assert.equal(visible(".bar"), true, `bar ${bar}`);
    assert.equal(q(".bar").classList.contains("warning"), true);
    assert.match(q(".message").textContent, /uncertain/i);
    assert.equal(visible("button.undo"), true);
  }
});

test("clicks a script synthesises are ignored; a user's click goes through", () => {
  const { calls, q } = makeBar();
  q("button.trim").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  q("button.undo").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.deepEqual(calls, { trim: 0, undo: 0 });
  q("button.trim").dispatchEvent(trusted(new MouseEvent("click", { bubbles: true })));
  q("button.undo").dispatchEvent(trusted(new MouseEvent("click", { bubbles: true })));
  assert.deepEqual(calls, { trim: 1, undo: 1 });
});

test("every label goes through i18n", () => {
  const { view, q } = makeBar({
    messages: { barTrim: "Couper l'historique", barUndo: "Annuler", barRemoved: "Historique cité retiré" },
  });
  view.render(S.Trimmed);
  assert.equal(q("button.trim").textContent, "Couper l'historique");
  assert.equal(q("button.undo").textContent, "Annuler");
  assert.equal(q(".message").textContent, "Historique cité retiré");
});

test("in a compose: placed after the editor, it reports the trim and Undo brings the quote back", async () => {
  install(g);
  const m = mount("reply-collapsed");
  behaveLikeGmail(m);
  let view;
  const createBar = (opts) => { view = TrimReplyBar.create(opts); return view; };
  const adapter = { watch(onCompose) { onCompose(new GmailCompose(m.editor, m.container, FAST)); return () => {}; } };
  await TrimReplyMain.start({ adapter, settings: SettingsRepository, stats: StatsRepository, createBar });
  await tick(100);

  assert.equal(m.container.contains(view.host), true);
  assert.equal(m.editor.contains(view.host), false, "never inside the draft");
  assert.equal(view.shadow.querySelector(".message").textContent, "Quoted history removed (6)");

  view.shadow.querySelector("button.undo").dispatchEvent(trusted(new MouseEvent("click", { bubbles: true })));
  await tick(10);
  assert.notEqual(GmailDom.outerQuote(m.editor), null);
  assert.equal(view.shadow.querySelector("button.undo").hasAttribute("hidden"), true);
  assert.equal(view.shadow.querySelector("button.trim").hasAttribute("hidden"), false);
});
