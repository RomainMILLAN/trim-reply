/**
 * How many quoted messages, saturated at MAX.
 *
 * The quote is written by other people: a crafted message can nest thousands of
 * `gmail_quote` blocks. Counting stops at MAX and remembers that it stopped, so
 * the bar shows "100+" instead of a number the page chose for us.
 *
 * `minus(1)` keeps the flag: 150 messages minus the kept one is still "more than
 * we counted", never an exact 99.
 */
(function (global) {
  "use strict";

  const MAX = 100;

  class MessageCount {
    constructor(value, saturated) {
      this.value = value;
      this.saturated = saturated;
      Object.freeze(this);
    }

    static of(raw) {
      const n = Number.isInteger(raw) && raw > 0 ? raw : 0;
      return n > MAX ? new MessageCount(MAX, true) : new MessageCount(n, false);
    }

    minus(n) {
      return new MessageCount(Math.max(0, this.value - n), this.saturated);
    }

    /** True when at least `n` messages are quoted; a saturated count reaches any bound. */
    reaches(n) {
      return this.saturated || this.value >= n;
    }

    label() {
      return this.saturated ? `${this.value}+` : String(this.value);
    }
  }

  MessageCount.MAX = MAX;

  global.MessageCount = MessageCount;
})(globalThis);
