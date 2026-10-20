/**
 * The situation a compose is in when a run starts: who asked, and whether the
 * draft was already there.
 *
 *   trigger    auto (the reply just opened) or manual (the Trim button)
 *   reopened   Gmail reloaded an existing draft rather than opening a fresh reply
 *
 * Kept apart from QuoteShape: the shape is what the quote looks like, the
 * context is how we got here. They change for different reasons.
 */
(function (global) {
  "use strict";

  const TRIGGER = Object.freeze({ AUTO: "auto", MANUAL: "manual" });

  class ComposeContext {
    constructor(trigger, reopened) {
      this.trigger = trigger;
      this.reopened = reopened;
      Object.freeze(this);
    }

    static of(trigger, reopened) {
      if (trigger !== TRIGGER.AUTO && trigger !== TRIGGER.MANUAL) {
        throw new TypeError(`unknown trigger: ${String(trigger)}`);
      }
      return new ComposeContext(trigger, reopened === true);
    }

    isAuto() {
      return this.trigger === TRIGGER.AUTO;
    }
  }

  ComposeContext.TRIGGER = TRIGGER;

  global.ComposeContext = ComposeContext;
})(globalThis);
