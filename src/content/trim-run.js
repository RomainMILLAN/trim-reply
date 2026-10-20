/**
 * One compose's flow: the only code that drives the adapter and the session
 * together.
 *
 *   run("auto")    when the compose is found
 *   run("manual")  on each click of the Trim button
 *   undo()         on each click of Undo
 *
 * Every run starts from the top and plans with its own trigger: a click never
 * re-reads a decision taken for the auto run. A run the session refuses (another
 * one is inspecting, the quote is already cut, the compose is ineligible) stops
 * at once, without unfolding anything.
 *
 * Invariant: no `await` after `confirm` -- confirm, cut and record happen in the
 * same tick, so nothing can slip between the decision and the fact.
 *
 * Fail closed: any exception from the adapter abandons the run (the session goes
 * back to where it was and the button comes back). Nothing is logged: the
 * content script never writes to Gmail's console, and never builds a message out
 * of the page's content.
 */
(function (global) {
  "use strict";

  const { ComposeContext, Run } = global;

  class TrimRun {
    constructor(session, compose, stats) {
      this.session = session;
      this.compose = compose;
      this.stats = stats;
      Object.freeze(this);
    }

    async run(trigger) {
      const { session, compose } = this;
      let planned;
      try {
        const context = ComposeContext.of(trigger, compose.isReopened());
        planned = session.plan(compose.inspectFolded(), context);
      } catch {
        return;
      }
      if (!(planned instanceof Run)) return; // Skip or Rejected: nothing was unfolded

      const run = planned;
      let fact = null;
      try {
        const fold = await compose.unfold();
        if (!fold.unfolded) return;
        const decision = run.confirm(compose.inspect());
        if (decision.isSkip()) {
          fold.refold();
          return;
        }
        if (!decision.isTrim()) return;
        fact = compose.cut(decision).recordInto(run.recorder());
      } catch {
        // Fail closed; the finally below gives the button back.
      } finally {
        run.abandon(); // no-op once the run has left Inspecting
      }
      if (fact) await this.stats.apply(fact);
    }

    async undo() {
      let fact;
      try {
        fact = this.session.undo();
      } catch {
        return;
      }
      await this.stats.apply(fact);
    }
  }

  global.TrimRun = TrimRun;
})(globalThis);
