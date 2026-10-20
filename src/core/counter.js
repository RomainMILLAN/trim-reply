/**
 * The local statistic, and the facts that move it.
 *
 * A session never touches the counter: each transition returns a FACT, and the
 * fact applies itself (`fact.applyTo(counter)`), so the caller never asks which
 * fact it holds. NO_FACT is the null object every no-op transition returns.
 *
 * The count never goes below zero, whatever a corrupted storage says.
 */
(function (global) {
  "use strict";

  class Counter {
    constructor(value) {
      this.value = value;
      Object.freeze(this);
    }

    static of(raw) {
      return new Counter(Number.isInteger(raw) && raw > 0 ? raw : 0);
    }

    incremented() {
      return new Counter(this.value + 1);
    }

    decremented() {
      return new Counter(Math.max(0, this.value - 1));
    }
  }

  const Fact = Object.freeze({
    REPLY_TRIMMED: Object.freeze({ name: "ReplyTrimmed", applyTo: (counter) => counter.incremented() }),
    TRIM_UNDONE: Object.freeze({ name: "TrimUndone", applyTo: (counter) => counter.decremented() }),
    NONE: Object.freeze({ name: "NoFact", applyTo: (counter) => counter }),
  });

  global.Counter = Counter;
  global.Fact = Fact;
})(globalThis);
