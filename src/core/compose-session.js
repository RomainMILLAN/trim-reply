/**
 * The life of one compose: the only place that knows whether its quote was cut.
 *
 * A pure state machine. It never touches the DOM: it holds the adapter's Cut as
 * an opaque memento and calls `verify()` / `restore()` on it. Every command
 * returns either a value for the caller or a Fact for the counter -- never null.
 *
 * STATES
 *   Untouched            nothing cut yet                         -> Trim offered
 *   Inspecting           a run is unfolding / inspecting / cutting
 *   Trimmed              cut and verified                         -> Undo offered
 *   TrimmedUncertain     cut, but Gmail might still append it     -> Undo + warning
 *   Restored             cut, then undone                         -> Trim offered
 *   Ineligible(reason)   forward, no quote, nothing to remove     -> nothing offered
 *
 * TWO COMMANDS PER RUN, so a concurrent run is stopped by the aggregate itself:
 *   plan(shape, context)  legal in Untouched/Restored only; opens a Run
 *   run.confirm(shape)    legal in the Inspecting state of THAT run only
 * Every other command carries the run id too, so the `finally` of one run can
 * never abandon another.
 *
 * THE FACT BEFORE THE RECORD. The session moves to Trimmed only once the adapter
 * hands back a real Cut. A refused record restores the cut (fail closed): a draft
 * is never left cut without a memento to undo it.
 *
 * The settings are a snapshot taken at creation: changing them in the popup only
 * affects composes opened afterwards.
 */
(function (global) {
  "use strict";

  const STATE = Object.freeze({
    UNTOUCHED: "Untouched",
    INSPECTING: "Inspecting",
    TRIMMED: "Trimmed",
    TRIMMED_UNCERTAIN: "TrimmedUncertain",
    RESTORED: "Restored",
    INELIGIBLE: "Ineligible",
  });

  const OFFERS_TRIM = new Set([STATE.UNTOUCHED, STATE.RESTORED]);
  const OFFERS_UNDO = new Set([STATE.TRIMMED, STATE.TRIMMED_UNCERTAIN]);

  /** One state value; each state carries only the data it needs. */
  class SessionState {
    constructor(name, data) {
      this.name = name;
      this.data = Object.freeze({ ...data });
      this.offersTrim = OFFERS_TRIM.has(name);
      this.offersUndo = OFFERS_UNDO.has(name);
      this.warnsUncertain = name === STATE.TRIMMED_UNCERTAIN;
      Object.freeze(this);
    }

    is(name) {
      return this.name === name;
    }
  }

  const UNTOUCHED = new SessionState(STATE.UNTOUCHED, {});
  const PENDING = Object.freeze({ PLANNED: "planned", CONFIRMED: "confirmed" });

  const { Decision, Fact, TrimPolicy } = global;

  class ComposeSession {
    constructor(settings) {
      this.settings = settings;
      this.state = UNTOUCHED;
      this.observer = () => {};
      this.lastRunId = 0;
    }

    /** The single observer (the bar). Called after every state change. */
    onChange(observer) {
      this.observer = observer;
      observer(this.state);
    }

    /**
     * Opens a run. Returns a Run, a Skip decision, or Decision.REJECTED.
     * A skip that makes the compose ineligible moves it to Ineligible.
     */
    plan(shape, context) {
      if (!this.state.offersTrim) return Decision.REJECTED;
      const decision = TrimPolicy.decide(shape, context, this.settings);
      if (decision.isSkip()) {
        if (decision.makesIneligible()) this.enter(STATE.INELIGIBLE, { reason: decision.reason });
        return decision;
      }
      this.lastRunId += 1;
      const runId = this.lastRunId;
      this.enter(STATE.INSPECTING, {
        runId,
        context,
        origin: this.state,
        pending: PENDING.PLANNED,
        decision,
      });
      return new Run(this, runId);
    }

    confirm(runId, shape) {
      if (!this.inspecting(runId)) return Decision.REJECTED;
      if (shape.kind === global.QuoteShape.KIND.UNKNOWN) {
        this.abandon(runId);
        return Decision.REJECTED;
      }
      const { context, origin } = this.state.data;
      const decision = TrimPolicy.decide(shape, context, this.settings);
      if (decision.isSkip()) {
        if (decision.makesIneligible()) this.enter(STATE.INELIGIBLE, { reason: decision.reason });
        else this.restoreState(origin);
        return decision;
      }
      this.enter(STATE.INSPECTING, { ...this.state.data, pending: PENDING.CONFIRMED, decision });
      return decision;
    }

    /** Records a real cut. Returns the fact for the counter. */
    record(runId, cut) {
      const confirmed = this.inspecting(runId) && this.state.data.pending === PENDING.CONFIRMED;
      if (!confirmed) {
        cut.restore();
        return Fact.NONE;
      }
      const removedMessages = this.state.data.decision.removedMessages;
      // The memento is stored before anything else can throw.
      this.enter(STATE.TRIMMED, { cut, removedMessages });
      if (verdictOf(cut) !== "clean") this.enter(STATE.TRIMMED_UNCERTAIN, { cut, removedMessages });
      return Fact.REPLY_TRIMMED;
    }

    /** Leaves Inspecting without a cut. A no-op outside this run's Inspecting state. */
    abandon(runId) {
      if (this.inspecting(runId)) this.restoreState(this.state.data.origin);
      return Fact.NONE;
    }

    undo() {
      if (!this.state.offersUndo) return Fact.NONE;
      // Restore first: if it throws, the session keeps the memento and Undo stays offered.
      this.state.data.cut.restore();
      this.enter(STATE.RESTORED, {});
      return Fact.TRIM_UNDONE;
    }

    inspecting(runId) {
      return this.state.is(STATE.INSPECTING) && this.state.data.runId === runId;
    }

    enter(name, data) {
      this.restoreState(new SessionState(name, data));
    }

    restoreState(state) {
      this.state = state;
      this.observer(state);
    }
  }

  /** A `verify()` that throws counts as uncertain: a doubt is never a success. */
  function verdictOf(cut) {
    try {
      return cut.verify() === "clean" ? "clean" : "uncertain";
    } catch {
      return "uncertain";
    }
  }

  /**
   * One execution, bound to its run id so the caller never carries it.
   * `recorder()` is the narrow role the adapter's Cut / NoCut talk to.
   */
  class Run {
    constructor(session, runId) {
      this.session = session;
      this.runId = runId;
      Object.freeze(this);
    }

    confirm(shape) {
      return this.session.confirm(this.runId, shape);
    }

    recorder() {
      const { session, runId } = this;
      return Object.freeze({
        record: (cut) => session.record(runId, cut),
        abandon: () => session.abandon(runId),
      });
    }

    abandon() {
      return this.session.abandon(this.runId);
    }
  }

  ComposeSession.STATE = STATE;

  global.ComposeSession = ComposeSession;
  global.Run = Run;
})(globalThis);
