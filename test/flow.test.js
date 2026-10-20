import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./load-core.js";
import { mount, input, behaveLikeGmail, tick } from "./fake-gmail.js";
import { install } from "./fake-platform.js";

const g = await loadCore();
const { GmailCompose, GmailAdapter, GmailDom, ComposeSession, Settings, TrimRun, TrimReplyMain,
  SettingsRepository, StatsRepository } = g;
const STATE = ComposeSession.STATE;

const FAST = Object.freeze({ APPEAR_MS: 40, UNFOLD_MS: 40, POLL_MS: 5 });

/** A folded reply that behaves like Gmail, a session, and its flow. */
async function setup({ raw = {}, fixture = "reply-collapsed", gmail = true } = {}) {
  const api = install(g);
  const m = mount(fixture);
  const button = gmail && fixture === "reply-collapsed" ? behaveLikeGmail(m) : null;
  const clicks = { n: 0 };
  if (button) button.addEventListener("click", () => { clicks.n += 1; });
  const compose = new GmailCompose(m.editor, m.container, FAST);
  const session = new ComposeSession(Settings.from(raw));
  const flow = new TrimRun(session, compose, StatsRepository);
  return { api, m, compose, session, flow, clicks };
}

const quoteIn = (m) => GmailDom.outerQuote(m.editor);
const count = async () => (await StatsRepository.load()).value;

test("the main path: an auto run unfolds, trims everything, records and counts one", async () => {
  const { m, session, flow, clicks } = await setup();
  await flow.run("auto");
  assert.equal(clicks.n, 1);
  assert.equal(quoteIn(m), null);
  assert.equal(input(m.container, "uet").value, "");
  assert.equal(session.state.name, STATE.TRIMMED);
  assert.equal(await count(), 1);
});

test("undo puts the quote back and takes the count back", async () => {
  const { m, session, flow } = await setup();
  await flow.run("auto");
  await flow.undo();
  assert.notEqual(quoteIn(m), null);
  assert.equal(session.state.name, STATE.RESTORED);
  assert.equal(await count(), 0);
});

test("undo, then Trim by hand: a fresh manual run cuts again", async () => {
  const { m, session, flow } = await setup();
  await flow.run("auto");
  await flow.undo();
  await flow.run("manual");
  assert.equal(quoteIn(m), null);
  assert.equal(session.state.name, STATE.TRIMMED);
  assert.equal(await count(), 1);
});

test("a quote unfolded by hand is cut without any click", async () => {
  const { m, flow, clicks, session } = await setup({ fixture: "reply-unfolded-6" });
  await flow.run("manual");
  assert.equal(clicks.n, 0);
  assert.equal(quoteIn(m), null);
  assert.equal(session.state.name, STATE.TRIMMED);
});

test("below the threshold in auto: unfolded, not cut, button offered; then the click cuts", async () => {
  const { m, session, flow } = await setup({ raw: { rules: { keep: "nothing", threshold: 7 } } });
  await flow.run("auto");
  assert.notEqual(quoteIn(m), null, "6 messages < 7: nothing cut");
  assert.equal(session.state.name, STATE.UNTOUCHED);
  assert.equal(session.state.offersTrim, true);
  await flow.run("manual");
  assert.equal(quoteIn(m), null);
  assert.equal(session.state.name, STATE.TRIMMED);
});

test("auto off: nothing is unfolded, the button is offered, the click cuts", async () => {
  const { m, session, flow, clicks } = await setup({ raw: { auto: false } });
  await flow.run("auto");
  assert.equal(clicks.n, 0);
  assert.equal(session.state.offersTrim, true);
  await flow.run("manual");
  assert.equal(quoteIn(m), null);
});

test("a reopened draft is not trimmed automatically, and nothing is unfolded", async () => {
  const { m, session, flow, clicks } = await setup();
  m.editor.firstElementChild.textContent = "draft text";
  await flow.run("auto");
  assert.equal(clicks.n, 0);
  assert.equal(session.state.name, STATE.UNTOUCHED);
});

test("a new message is ineligible at once: no unfold, no button", async () => {
  const { m, session, flow, clicks } = await setup();
  input(m.container, "rm").value = "";
  await flow.run("auto");
  assert.equal(clicks.n, 0);
  assert.equal(session.state.name, STATE.INELIGIBLE);
  assert.equal(session.state.offersTrim, false);
});

test("a forward is never cut and becomes ineligible", async () => {
  const { m, session, flow } = await setup({ fixture: "forward" });
  await flow.run("auto");
  assert.notEqual(quoteIn(m), null);
  assert.equal(session.state.name, STATE.INELIGIBLE);
});

test("a ••• that never reacts: NoFold, no exception, button offered", async () => {
  const { session, flow } = await setup({ gmail: false });
  await flow.run("auto");
  assert.equal(session.state.name, STATE.UNTOUCHED);
  assert.equal(session.state.offersTrim, true);
  assert.equal(await count(), 0);
});

/** The same compose with one method replaced (GmailCompose instances are frozen). */
const withMethod = (compose, name, fn) => Object.create(compose, { [name]: { value: fn } });

test("an adapter that throws: the run is abandoned, the button comes back", async () => {
  const { compose, session } = await setup();
  const broken = withMethod(compose, "inspect", () => { throw new Error("gmail changed"); });
  await new TrimRun(session, broken, StatsRepository).run("auto");
  assert.equal(session.state.name, STATE.UNTOUCHED);
  assert.equal(session.state.offersTrim, true);
});

test("a NoCut counts nothing and offers the button", async () => {
  const { compose, session } = await setup();
  await new TrimRun(session, withMethod(compose, "cut", () => GmailCompose.NO_CUT), StatsRepository).run("auto");
  assert.equal(session.state.name, STATE.UNTOUCHED);
  assert.equal(await count(), 0);
});

test("a click during the auto run's unfold is refused by the session itself", async () => {
  const { m, session, flow } = await setup({ raw: { rules: { keep: "repliedMessage", threshold: 2 } } });
  const auto = flow.run("auto");
  const manual = flow.run("manual"); // arrives while auto awaits unfold
  await Promise.all([auto, manual]);
  assert.equal(session.state.name, STATE.TRIMMED, "the second run must not turn Trimmed into Ineligible");
  assert.equal(session.state.offersUndo, true);
  assert.equal(GmailDom.quotedMessages(m.editor), 1);
  assert.equal(await count(), 1);
});

test("a double click while inspecting counts once", async () => {
  const { session, flow } = await setup({ raw: { auto: false } });
  await Promise.all([flow.run("manual"), flow.run("manual")]);
  assert.equal(session.state.name, STATE.TRIMMED);
  assert.equal(await count(), 1);
});

test("a stats failure never breaks the reply", async () => {
  const { api, session, flow } = await setup();
  api.storage.local.set = async () => { throw new Error("quota"); };
  await flow.run("auto");
  assert.equal(session.state.name, STATE.TRIMMED);
});

// —— composition root ——————————————————————————————————————

test("main: each compose found gets its own session with the current settings, and is trimmed", async () => {
  const api = install(g);
  await api.storage.local.set({ settings: { auto: true, rules: { keep: "nothing", threshold: 2 } } });
  const m = mount("reply-collapsed");
  behaveLikeGmail(m);
  const adapter = {
    watch(onCompose) {
      onCompose(new GmailCompose(m.editor, m.container, FAST));
      return () => {};
    },
  };
  const rendered = [];
  const createBar = () => ({ host: m.doc.createElement("div"), render: (state) => rendered.push(state.name) });
  await TrimReplyMain.start({ adapter, settings: SettingsRepository, stats: StatsRepository, createBar });
  await tick(100);
  assert.equal(quoteIn(m), null);
  // Inspecting twice: planned, then confirmed.
  assert.deepEqual(rendered, [STATE.UNTOUCHED, STATE.INSPECTING, STATE.INSPECTING, STATE.TRIMMED]);
});

test("main: settings changed later apply to the next compose, not to the one already open", async () => {
  const api = install(g);
  const first = mount("reply-collapsed");
  let hand;
  const adapter = { watch(onCompose) { hand = onCompose; return () => {}; } };
  const { sessions } = await TrimReplyMain.start({ adapter, settings: SettingsRepository, stats: StatsRepository });
  const c1 = new GmailCompose(first.editor, first.container, FAST);
  hand(c1);
  await api.storage.local.set({ settings: { auto: false } });
  await tick(10);
  const second = mount("reply-collapsed");
  const c2 = new GmailCompose(second.editor, second.container, FAST);
  hand(c2);
  assert.equal(sessions.get(c1).settings.auto, true);
  assert.equal(sessions.get(c2).settings.auto, false);
});

test("the real Gmail adapter, end to end: a compose that appears is trimmed", async () => {
  install(g);
  const m = mount("reply-collapsed");
  const container = m.container;
  container.remove();
  behaveLikeGmail(m);
  const { stop } = await TrimReplyMain.start({ adapter: GmailAdapter, settings: SettingsRepository, stats: StatsRepository });
  m.doc.body.append(container);
  await tick(500);
  stop();
  assert.equal(quoteIn(m), null);
  assert.equal(await count(), 1);
});
