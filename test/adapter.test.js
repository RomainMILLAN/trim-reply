import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./load-core.js";
import { mount, input, behaveLikeGmail, nestedReply, tick } from "./fake-gmail.js";

const g = await loadCore();
const { GmailCompose, GmailAdapter, GmailDom, MailContract, Decision, MessageCount } = g;

const FAST = Object.freeze({ APPEAR_MS: 60, UNFOLD_MS: 60, POLL_MS: 5 });
const compose = (m, timing = FAST) => new GmailCompose(m.editor, m.container, timing);
const keep = (n) => Decision.trim(n, MessageCount.of(1));
const quoteIn = (editor) => GmailDom.outerQuote(editor);
const recorder = () => {
  const calls = [];
  return { calls, record: (cut) => { calls.push(["record", cut]); return "fact"; }, abandon: () => { calls.push(["abandon"]); return "none"; } };
};

/** Counts the `input` events Gmail would see. */
const countInputs = (editor) => {
  const seen = { n: 0 };
  editor.addEventListener("input", () => { seen.n += 1; });
  return seen;
};

// —— contract ———————————————————————————————————————————————

test("the Gmail compose exposes exactly the Compose contract", () => {
  const c = compose(mount("reply-collapsed"));
  assert.equal(MailContract.conforms(c), true);
});

// —— reading without unfolding ——————————————————————————————

test("a folded reply: the quote is not in the editor, uet holds it, the visible ••• says folded", () => {
  const m = mount("reply-collapsed");
  const c = compose(m);
  assert.equal(quoteIn(m.editor), null);
  assert.equal(c.holdsFoldedQuote(), true);
  assert.equal(c.inspectFolded().kind, "unknown");
  assert.equal(c.isReopened(), false, "a fresh reply holds only the signature");
});

test("a new message is proven by an empty rm, and only then is it none() without unfolding", () => {
  const m = mount("reply-collapsed");
  input(m.container, "rm").value = "";
  assert.equal(compose(m).inspectFolded().kind, "none");
});

test("a fake new-message signal planted in the quoted body is ignored", () => {
  const m = mount("reply-collapsed");
  const planted = m.doc.createElement("input");
  planted.setAttribute("name", "rm");
  planted.value = "";
  m.editor.insertBefore(planted, m.editor.firstElementChild);
  assert.equal(compose(m).inspectFolded().kind, "unknown");
});

test("text outside the quote and the signature marks a reopened draft", () => {
  const m = mount("reply-collapsed");
  m.editor.firstElementChild.textContent = "hello";
  assert.equal(compose(m).isReopened(), true);
});

// —— unfolding ——————————————————————————————————————————————

test("unfold clicks the ••• of this compose; the quote arrives and uet empties", async () => {
  const m = mount("reply-collapsed");
  const button = behaveLikeGmail(m);
  const clicks = [];
  for (const type of ["mousedown", "mouseup", "click"]) button.addEventListener(type, () => clicks.push(type));
  const fold = await compose(m).unfold();
  assert.equal(fold.unfolded, true);
  assert.deepEqual(clicks, ["mousedown", "mouseup", "click"]);
  assert.notEqual(quoteIn(m.editor), null);
  assert.equal(input(m.container, "uet").value, "");
  assert.equal(compose(m).inspect().quotedMessages.value, 6);
});

test("an already unfolded quote gives an immediate Fold, without any click", async () => {
  const m = mount("reply-unfolded-6");
  const fold = await compose(m, { ...FAST, APPEAR_MS: 10_000 }).unfold();
  assert.equal(fold.unfolded, true);
});

test("a ••• that appears after detection is waited for, then clicked", async () => {
  const m = mount("reply-collapsed");
  const button = behaveLikeGmail(m);
  button.setAttribute("style", "display:none");
  setTimeout(() => button.removeAttribute("style"), 20);
  const fold = await compose(m).unfold();
  assert.equal(fold.unfolded, true);
  assert.notEqual(quoteIn(m.editor), null);
});

test("nothing to unfold after the bounded wait: a no-op Fold, and inspect says none", async () => {
  const m = mount("reply-collapsed");
  m.container.querySelector("div.ajR").setAttribute("style", "display:none");
  input(m.container, "uet").value = "";
  const c = compose(m);
  assert.equal((await c.unfold()).unfolded, true);
  assert.equal(c.inspect().kind, "none");
});

test("a ••• that does not react gives NoFold", async () => {
  const m = mount("reply-collapsed");
  assert.equal((await compose(m).unfold()), GmailCompose.NO_FOLD);
});

test("a ••• planted inside the quoted body is never clicked nor trusted", async () => {
  const m = mount("reply-unfolded-6");
  const fake = m.doc.createElement("div");
  fake.className = "ajR";
  let clicked = false;
  fake.addEventListener("click", () => { clicked = true; });
  quoteIn(m.editor).append(fake);
  const c = compose(m);
  assert.equal(c.holdsFoldedQuote(), false);
  await c.unfold();
  assert.equal(clicked, false);
});

// —— inspecting —————————————————————————————————————————————

test("inspect counts one message per attribution", () => {
  assert.equal(compose(mount("reply-unfolded-6")).inspect().quotedMessages.value, 6);
});

test("a forward is recognised by structure, and is never cut", () => {
  const c = compose(mount("forward"));
  assert.equal(c.inspect().kind, "forward");
  assert.equal(c.cut(keep(0)), GmailCompose.NO_CUT);
});

test("inspect never answers unknown", () => {
  for (const name of ["reply-collapsed", "reply-unfolded-6", "forward"]) {
    assert.notEqual(compose(mount(name)).inspect().kind, "unknown", name);
  }
});

test("a hostile quote nesting 150 messages saturates the count", () => {
  const m = mount("reply-unfolded-6");
  quoteIn(m.editor).replaceWith(nestedReply(m.doc, 150));
  const shape = compose(m).inspect();
  assert.equal(shape.quotedMessages.label(), "100+");
});

// —— cutting ——————————————————————————————————————————————————

test("keep nothing removes the whole quote, fires input, and verifies clean", () => {
  const m = mount("reply-unfolded-6");
  const inputs = countInputs(m.editor);
  const outer = quoteIn(m.editor);
  const c = compose(m);
  const cut = c.cut(keep(0));
  assert.notEqual(cut, GmailCompose.NO_CUT);
  assert.equal(quoteIn(m.editor), null);
  assert.equal(outer.isConnected, false);
  assert.equal(inputs.n, 1);
  assert.equal(cut.verify(), "clean");
  assert.equal(c.inspect().kind, "none");
});

test("keep the replied message leaves exactly one quoted message", () => {
  const m = mount("reply-unfolded-6");
  const c = compose(m);
  c.cut(keep(1));
  assert.equal(c.inspect().quotedMessages.value, 1);
});

test("a cut of 150 nested messages works in both modes", () => {
  for (const kept of [0, 1]) {
    const m = mount("reply-unfolded-6");
    quoteIn(m.editor).replaceWith(nestedReply(m.doc, 150));
    const c = compose(m);
    assert.notEqual(c.cut(keep(kept)), GmailCompose.NO_CUT, `keep ${kept}`);
    assert.equal(GmailDom.quotedMessages(m.editor), kept);
  }
});

test("a quote that changed since inspect is not cut: NoCut, DOM untouched", () => {
  const m = mount("reply-unfolded-6");
  const outer = quoteIn(m.editor);
  outer.replaceWith(nestedReply(m.doc, 1));
  const c = compose(m);
  assert.equal(c.cut(keep(1)), GmailCompose.NO_CUT, "one message: nothing nested to remove");
  assert.notEqual(quoteIn(m.editor), null);
});

test("restore puts the very same nodes back at the anchor, after typing, and fires input", () => {
  const m = mount("reply-unfolded-6");
  const outer = quoteIn(m.editor);
  const c = compose(m);
  const cut = c.cut(keep(0));
  m.editor.firstElementChild.textContent = "typed after the cut";
  const inputs = countInputs(m.editor);
  cut.restore();
  assert.equal(quoteIn(m.editor), outer);
  assert.equal(inputs.n, 1);
  assert.equal(m.editor.firstElementChild.textContent, "typed after the cut");
  assert.equal(Array.from(m.editor.childNodes).some((n) => n.nodeType === 8), false, "the anchor is gone");
});

test("restore appends at the end when the anchor was deleted", () => {
  const m = mount("reply-unfolded-6");
  const outer = quoteIn(m.editor);
  const cut = compose(m).cut(keep(0));
  Array.from(m.editor.childNodes).find((n) => n.nodeType === 8).remove();
  cut.restore();
  assert.equal(m.editor.childNodes[m.editor.childNodes.length - 1], outer);
});

test("a listener that throws on input does not lose the cut", () => {
  const m = mount("reply-unfolded-6");
  m.editor.addEventListener("input", () => { throw new Error("gmail listener"); });
  const cut = compose(m).cut(keep(0));
  assert.notEqual(cut, GmailCompose.NO_CUT);
  assert.equal(typeof cut.restore, "function");
});

test("verify is uncertain while Gmail still holds a folded quote", () => {
  const m = mount("reply-unfolded-6");
  const cut = compose(m).cut(keep(0));
  input(m.container, "uet").value = "x";
  assert.equal(cut.verify(), "uncertain");
});

test("Cut and NoCut record themselves through the recorder role", () => {
  const m = mount("reply-unfolded-6");
  const r = recorder();
  const cut = compose(m).cut(keep(0));
  assert.equal(cut.recordInto(r), "fact");
  assert.equal(GmailCompose.NO_CUT.recordInto(r), "none");
  assert.deepEqual(r.calls.map(([name]) => name), ["record", "abandon"]);
});

// —— watching ———————————————————————————————————————————————

test("the watcher hands each compose over once, after the debounce", async () => {
  const m = mount("reply-collapsed");
  const seen = [];
  const stop = GmailAdapter.watch((c) => seen.push(c), m.doc.body);
  assert.equal(seen.length, 1, "the compose already present is handed over at once");
  m.doc.body.append(m.doc.createElement("div"));
  await tick(300);
  assert.equal(seen.length, 1, "a rescan does not hand the same editor twice");
  stop();
});

test("the watcher picks up a compose opened later", async () => {
  const m = mount("reply-collapsed");
  const container = m.container;
  container.remove();
  const seen = [];
  const stop = GmailAdapter.watch((c) => seen.push(c), m.doc.body);
  assert.equal(seen.length, 0);
  m.doc.body.append(container);
  await tick(300);
  stop();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].editor, m.editor);
});
