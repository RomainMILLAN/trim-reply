import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./load-core.js";

const g = await loadCore();
const { Settings, TrimRules, QuoteShape, ComposeContext, TrimPolicy, MessageCount, Counter, Fact } = g;
const SKIP = TrimPolicy.SKIP;

const settings = (over = {}) => Settings.from({
  auto: true,
  rules: { keep: "nothing", threshold: 2 },
  display: { bar: true },
  ...over,
});
const auto = ComposeContext.of("auto", false);
const manual = ComposeContext.of("manual", false);
const reopened = ComposeContext.of("auto", true);

// —— Settings ——————————————————————————————————————————————

test("missing settings fall back to the defaults: auto on, keep nothing, threshold 2, bar shown", () => {
  const s = Settings.defaults();
  assert.equal(s.auto, true);
  assert.equal(s.rules.keep, "nothing");
  assert.equal(s.rules.threshold, 2);
  assert.equal(s.display.bar, true);
});

test("a corrupted stored object never reaches the policy: each bad field falls back alone", () => {
  const s = Settings.from({ auto: "yes", rules: { keep: "everything", threshold: 2.5 }, display: null });
  assert.deepEqual(s.toStorage(), Settings.defaults().toStorage());
  assert.deepEqual(Settings.from([1, 2]).toStorage(), Settings.defaults().toStorage());
  assert.deepEqual(Settings.from("auto").toStorage(), Settings.defaults().toStorage());
});

test("the threshold stays within [1, 100], the range a saturated count can reach", () => {
  for (const bad of [0, -3, 101, 500, NaN, "5"]) {
    assert.equal(TrimRules.from({ threshold: bad }).threshold, 2, `threshold ${String(bad)}`);
  }
  assert.equal(TrimRules.from({ threshold: 1 }).threshold, 1);
  assert.equal(TrimRules.from({ threshold: 100 }).threshold, 100);
});

test("a prototype key in storage is not a keep mode", () => {
  assert.equal(TrimRules.from({ keep: "constructor" }).keep, "nothing");
  assert.equal(TrimRules.from({ keep: "__proto__" }).keep, "nothing");
});

test("toStorage round-trips through from", () => {
  const s = settings({ auto: false, rules: { keep: "repliedMessage", threshold: 7 }, display: { bar: false } });
  assert.deepEqual(Settings.from(s.toStorage()), s);
});

// —— MessageCount ——————————————————————————————————————————

test("counting saturates at 100 and says so", () => {
  const c = MessageCount.of(150);
  assert.equal(c.value, 100);
  assert.equal(c.saturated, true);
  assert.equal(c.label(), "100+");
  assert.equal(MessageCount.of(100).saturated, false);
});

test("minus keeps the saturation flag: 150 minus the kept one is still more than counted", () => {
  const c = MessageCount.of(150).minus(1);
  assert.equal(c.label(), "99+");
  assert.equal(MessageCount.of(3).minus(1).label(), "2");
  assert.equal(MessageCount.of(0).minus(1).value, 0);
});

test("a saturated count reaches any threshold", () => {
  assert.equal(MessageCount.of(150).reaches(100), true);
  assert.equal(MessageCount.of(1).reaches(2), false);
});

// —— QuoteShape ————————————————————————————————————————————

test("a reply quoting no message is a compose without a quote", () => {
  assert.equal(QuoteShape.reply(0).kind, "none");
  assert.equal(QuoteShape.reply(-1).kind, "none");
  assert.equal(QuoteShape.reply(3).quotedMessages.value, 3);
});

// —— TrimPolicy: the decision table ————————————————————————

test("eligibility comes first: a forward is never trimmed, whatever the trigger or the settings", () => {
  for (const ctx of [auto, manual, reopened]) {
    for (const s of [settings(), settings({ auto: false })]) {
      assert.equal(TrimPolicy.decide(QuoteShape.forward(), ctx, s).reason, SKIP.FORWARD);
    }
  }
});

test("eligibility comes first: a new message is no-quote even with auto off, never auto-off", () => {
  const d = TrimPolicy.decide(QuoteShape.none(), auto, settings({ auto: false }));
  assert.equal(d.reason, SKIP.NO_QUOTE);
  assert.equal(d.makesIneligible(), true);
});

test("auto off and reopened drafts skip the auto run without unfolding, and stay eligible", () => {
  const off = TrimPolicy.decide(QuoteShape.unknown(), auto, settings({ auto: false }));
  assert.equal(off.reason, SKIP.AUTO_OFF);
  assert.equal(off.makesIneligible(), false);
  const draft = TrimPolicy.decide(QuoteShape.unknown(), reopened, settings());
  assert.equal(draft.reason, SKIP.REOPENED);
  assert.equal(draft.makesIneligible(), false);
});

test("the manual trigger ignores auto-off, reopened drafts and the threshold", () => {
  const s = settings({ auto: false, rules: { keep: "nothing", threshold: 5 } });
  const reopenedManual = ComposeContext.of("manual", true);
  const d = TrimPolicy.decide(QuoteShape.reply(1), reopenedManual, s);
  assert.equal(d.isTrim(), true);
  assert.equal(d.removedMessages.value, 1);
});

test("a folded quote is Unknown, never a skip, once auto is allowed to run", () => {
  assert.equal(TrimPolicy.decide(QuoteShape.unknown(), auto, settings()).isUnknown(), true);
  assert.equal(TrimPolicy.decide(QuoteShape.unknown(), manual, settings({ auto: false })).isUnknown(), true);
});

test("below the threshold, auto skips and the button stays offered", () => {
  const d = TrimPolicy.decide(QuoteShape.reply(1), auto, settings());
  assert.equal(d.reason, SKIP.BELOW_THRESHOLD);
  assert.equal(d.makesIneligible(), false);
  assert.equal(TrimPolicy.decide(QuoteShape.reply(2), auto, settings()).isTrim(), true);
});

test("keep nothing removes every quoted message", () => {
  const d = TrimPolicy.decide(QuoteShape.reply(6), auto, settings());
  assert.equal(d.keptMessages, 0);
  assert.equal(d.removedMessages.label(), "6");
});

test("keep the replied message removes all but one, and a single quoted message leaves nothing to remove", () => {
  const keepOne = settings({ rules: { keep: "repliedMessage", threshold: 1 } });
  const d = TrimPolicy.decide(QuoteShape.reply(6), auto, keepOne);
  assert.equal(d.keptMessages, 1);
  assert.equal(d.removedMessages.label(), "5");
  const nothing = TrimPolicy.decide(QuoteShape.reply(1), manual, keepOne);
  assert.equal(nothing.reason, SKIP.NOTHING_TO_REMOVE);
  assert.equal(nothing.makesIneligible(), true);
});

test("a saturated quote is trimmed in both modes and labelled N+", () => {
  assert.equal(TrimPolicy.decide(QuoteShape.reply(150), auto, settings()).removedMessages.label(), "100+");
  const keepOne = settings({ rules: { keep: "repliedMessage", threshold: 100 } });
  assert.equal(TrimPolicy.decide(QuoteShape.reply(150), auto, keepOne).removedMessages.label(), "99+");
});

// —— Counter and facts —————————————————————————————————————

test("the counter never goes below zero, and facts apply themselves", () => {
  assert.equal(Counter.of(-4).value, 0);
  assert.equal(Counter.of("3").value, 0);
  assert.equal(Fact.TRIM_UNDONE.applyTo(Counter.of(0)).value, 0);
  assert.equal(Fact.REPLY_TRIMMED.applyTo(Counter.of(2)).value, 3);
  assert.equal(Fact.NONE.applyTo(Counter.of(2)).value, 2);
});
