import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./load-core.js";

const g = await loadCore();
const { Settings, QuoteShape, ComposeContext, ComposeSession, Decision, Fact, Run } = g;
const STATE = ComposeSession.STATE;

const auto = ComposeContext.of("auto", false);
const manual = ComposeContext.of("manual", false);

const session = (raw = {}) => new ComposeSession(Settings.from({
  rules: { keep: "nothing", threshold: 2 },
  ...raw,
}));

/** A stand-in for the adapter's Cut: counts restores, answers a scripted verdict. */
function fakeCut(verdict = "clean") {
  const cut = {
    restores: 0,
    restore() { cut.restores += 1; },
    verify() {
      if (verdict === "throws") throw new Error("boom");
      return verdict;
    },
  };
  return cut;
}

/** Drives a full run up to a confirmed Trim. */
function confirmedRun(s, shape = QuoteShape.reply(5), ctx = auto) {
  const run = s.plan(QuoteShape.unknown(), ctx);
  assert.ok(run instanceof Run, "plan should open a run");
  const d = run.confirm(shape);
  assert.equal(d.isTrim(), true);
  return run;
}

test("a fresh session offers Trim and nothing else", () => {
  const s = session();
  assert.equal(s.state.name, STATE.UNTOUCHED);
  assert.equal(s.state.offersTrim, true);
  assert.equal(s.state.offersUndo, false);
  assert.equal(s.state.warnsUncertain, false);
});

test("the nominal path: plan(unknown), confirm, record a clean cut -> Trimmed, one ReplyTrimmed", () => {
  const s = session();
  const run = confirmedRun(s);
  assert.equal(s.state.name, STATE.INSPECTING);
  assert.equal(s.state.offersTrim, false, "the button is hidden while a run is inspecting");
  const fact = run.recorder().record(fakeCut());
  assert.equal(fact, Fact.REPLY_TRIMMED);
  assert.equal(s.state.name, STATE.TRIMMED);
  assert.equal(s.state.data.removedMessages.value, 5);
  assert.equal(s.state.offersUndo, true);
});

test("the manual context survives Unknown: plan(unknown) by hand, then a single quoted message is trimmed", () => {
  const s = session();
  const run = s.plan(QuoteShape.unknown(), manual);
  assert.ok(run instanceof Run);
  assert.equal(run.confirm(QuoteShape.reply(1)).isTrim(), true, "manual ignores the threshold");
});

test("in auto, the same Unknown run skips below the threshold and goes back to Untouched", () => {
  const s = session();
  const run = s.plan(QuoteShape.unknown(), auto);
  const d = run.confirm(QuoteShape.reply(1));
  assert.equal(d.reason, "below-threshold");
  assert.equal(s.state.name, STATE.UNTOUCHED);
  assert.equal(s.state.offersTrim, true);
});

test("an uncertain verify still counts, keeps Undo, and raises the warning", () => {
  const s = session();
  const run = confirmedRun(s);
  assert.equal(run.recorder().record(fakeCut("uncertain")), Fact.REPLY_TRIMMED);
  assert.equal(s.state.name, STATE.TRIMMED_UNCERTAIN);
  assert.equal(s.state.warnsUncertain, true);
  assert.equal(s.state.offersUndo, true);
});

test("a verify that throws is uncertain, and the memento is kept so Undo works", () => {
  const s = session();
  const run = confirmedRun(s);
  const cut = fakeCut("throws");
  run.recorder().record(cut);
  assert.equal(s.state.name, STATE.TRIMMED_UNCERTAIN);
  assert.equal(s.undo(), Fact.TRIM_UNDONE);
  assert.equal(cut.restores, 1);
});

test("undo restores once, moves to Restored and offers Trim again; a second undo is a no-op", () => {
  const s = session();
  const cut = fakeCut();
  confirmedRun(s).recorder().record(cut);
  assert.equal(s.undo(), Fact.TRIM_UNDONE);
  assert.equal(s.state.name, STATE.RESTORED);
  assert.equal(s.state.offersTrim, true);
  assert.equal(s.undo(), Fact.NONE);
  assert.equal(cut.restores, 1);
});

test("undo without a cut is a no-op", () => {
  assert.equal(session().undo(), Fact.NONE);
});

test("trim again after undo: a new run, a new cut, the old one released", () => {
  const s = session();
  const first = fakeCut();
  confirmedRun(s).recorder().record(first);
  s.undo();
  const second = fakeCut();
  confirmedRun(s, QuoteShape.reply(5), manual).recorder().record(second);
  assert.equal(s.state.name, STATE.TRIMMED);
  assert.equal(s.state.data.cut, second);
  s.undo();
  assert.equal(first.restores, 1);
  assert.equal(second.restores, 1);
});

test("a record on a merely planned Trim is refused, restores the cut, and counts nothing", () => {
  const s = session();
  const run = s.plan(QuoteShape.reply(5), auto);
  assert.ok(run instanceof Run, "a known shape plans a Trim directly");
  const cut = fakeCut();
  assert.equal(run.recorder().record(cut), Fact.NONE);
  assert.equal(cut.restores, 1, "fail closed: never leave a cut without a memento");
  assert.equal(s.state.name, STATE.INSPECTING);
});

test("a record outside Inspecting is refused and restores the cut", () => {
  const s = session();
  const run = confirmedRun(s);
  run.recorder().record(fakeCut());
  const stray = fakeCut();
  assert.equal(run.recorder().record(stray), Fact.NONE);
  assert.equal(stray.restores, 1);
  assert.equal(s.state.name, STATE.TRIMMED);
});

test("plan is refused while a run inspects: a concurrent run is stopped by the aggregate itself", () => {
  const s = session();
  const first = confirmedRun(s);
  assert.equal(s.plan(QuoteShape.unknown(), manual), Decision.REJECTED);
  assert.equal(s.state.name, STATE.INSPECTING);
  assert.equal(first.recorder().record(fakeCut()), Fact.REPLY_TRIMMED);
});

test("plan is refused in Trimmed, TrimmedUncertain and Ineligible, without touching the state", () => {
  const trimmed = session();
  confirmedRun(trimmed).recorder().record(fakeCut());
  assert.equal(trimmed.plan(QuoteShape.unknown(), manual), Decision.REJECTED);
  assert.equal(trimmed.state.name, STATE.TRIMMED);

  const uncertain = session();
  confirmedRun(uncertain).recorder().record(fakeCut("uncertain"));
  assert.equal(uncertain.plan(QuoteShape.unknown(), manual), Decision.REJECTED);

  const ineligible = session();
  ineligible.plan(QuoteShape.forward(), auto);
  assert.equal(ineligible.plan(QuoteShape.unknown(), manual), Decision.REJECTED);
  assert.equal(ineligible.state.name, STATE.INELIGIBLE);
});

test("a run cannot confirm, record or abandon another run's Inspecting state", () => {
  const s = session();
  const stale = s.plan(QuoteShape.unknown(), auto);
  stale.abandon();
  const current = s.plan(QuoteShape.unknown(), manual);
  assert.equal(stale.confirm(QuoteShape.reply(5)), Decision.REJECTED);
  assert.equal(stale.abandon(), Fact.NONE);
  assert.equal(s.state.name, STATE.INSPECTING, "the stale finally must not abandon the current run");
  assert.equal(current.confirm(QuoteShape.reply(5)).isTrim(), true);
});

test("abandon goes back to the stable state the run started from", () => {
  const fresh = session();
  fresh.plan(QuoteShape.unknown(), auto).abandon();
  assert.equal(fresh.state.name, STATE.UNTOUCHED);

  const restored = session();
  confirmedRun(restored).recorder().record(fakeCut());
  restored.undo();
  restored.plan(QuoteShape.unknown(), manual).abandon();
  assert.equal(restored.state.name, STATE.RESTORED);
});

test("abandon outside Inspecting changes nothing", () => {
  const s = session();
  const run = confirmedRun(s);
  run.recorder().record(fakeCut());
  assert.equal(run.abandon(), Fact.NONE);
  assert.equal(s.state.name, STATE.TRIMMED);
});

test("a NoCut-style abandon through the recorder goes back to Untouched and counts nothing", () => {
  const s = session();
  const run = confirmedRun(s);
  assert.equal(run.recorder().abandon(), Fact.NONE);
  assert.equal(s.state.name, STATE.UNTOUCHED);
});

test("confirm with an unknown shape abandons the run", () => {
  const s = session();
  const run = s.plan(QuoteShape.unknown(), auto);
  assert.equal(run.confirm(QuoteShape.unknown()), Decision.REJECTED);
  assert.equal(s.state.name, STATE.UNTOUCHED);
});

test("forward, no quote and nothing-to-remove make the compose Ineligible: no button", () => {
  for (const shape of [QuoteShape.forward(), QuoteShape.none()]) {
    const s = session({ auto: false });
    assert.equal(s.plan(shape, auto).isSkip(), true);
    assert.equal(s.state.name, STATE.INELIGIBLE);
    assert.equal(s.state.offersTrim, false);
  }
  const keepOne = session({ rules: { keep: "repliedMessage", threshold: 1 } });
  keepOne.plan(QuoteShape.unknown(), manual).confirm(QuoteShape.reply(1));
  assert.equal(keepOne.state.name, STATE.INELIGIBLE);
});

test("auto off and reopened drafts open no run and keep the button offered", () => {
  const off = session({ auto: false });
  assert.equal(off.plan(QuoteShape.unknown(), auto).reason, "auto-off");
  assert.equal(off.state.name, STATE.UNTOUCHED);
  assert.equal(off.state.offersTrim, true);

  const draft = session();
  assert.equal(draft.plan(QuoteShape.unknown(), ComposeContext.of("auto", true)).reason, "reopened");
  assert.equal(draft.state.offersTrim, true);
});

test("the session decides with its snapshot, not with settings changed afterwards", () => {
  const raw = { auto: true, rules: { keep: "nothing", threshold: 2 } };
  const s = new ComposeSession(Settings.from(raw));
  raw.auto = false;
  assert.ok(s.plan(QuoteShape.unknown(), auto) instanceof Run);
});

test("the observer sees every state change, starting with the current one", () => {
  const s = session();
  const seen = [];
  s.onChange((state) => seen.push(state.name));
  confirmedRun(s).recorder().record(fakeCut());
  s.undo();
  assert.deepEqual(seen, [STATE.UNTOUCHED, STATE.INSPECTING, STATE.INSPECTING, STATE.TRIMMED, STATE.RESTORED]);
});

test("the three predicates for every state", () => {
  const expected = new Map([
    [STATE.UNTOUCHED, [true, false, false]],
    [STATE.INSPECTING, [false, false, false]],
    [STATE.TRIMMED, [false, true, false]],
    [STATE.TRIMMED_UNCERTAIN, [false, true, true]],
    [STATE.RESTORED, [true, false, false]],
    [STATE.INELIGIBLE, [false, false, false]],
  ]);
  const seen = new Map();
  const record = (s) => s.onChange((st) => seen.set(st.name, [st.offersTrim, st.offersUndo, st.warnsUncertain]));

  const a = session(); record(a);
  confirmedRun(a).recorder().record(fakeCut()); a.undo();
  const b = session(); record(b);
  confirmedRun(b).recorder().record(fakeCut("uncertain"));
  const c = session(); record(c);
  c.plan(QuoteShape.forward(), auto);

  assert.deepEqual(seen, expected);
});
