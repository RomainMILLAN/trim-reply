/**
 * Whether to trim, decided once, here.
 *
 * Stateless. ComposeSession calls it with its own settings snapshot; nothing
 * else does.
 *
 * Rules, in this order:
 *   1. ELIGIBILITY, whatever the trigger: a forward or a compose without a quote
 *      is never trimmed and never offers the button.
 *   2. AUTO ONLY: auto-trim switched off, or a reopened draft -- the user may have
 *      restored the quote on purpose. Nothing is unfolded; the button is offered.
 *   3. SHAPE: a folded quote is Unknown (unfold first, never a refusal); below the
 *      threshold is skipped in auto only, the button ignores the threshold; a trim
 *      that would remove nothing is not a trim.
 *
 * `removedMessages` is computed here and only here. The adapter does not trim a
 * number: it keeps 0 or 1 message and checks that this is what remains. The
 * number is for the bar.
 */
(function (global) {
  "use strict";

  const SKIP = Object.freeze({
    FORWARD: "forward",
    NO_QUOTE: "no-quote",
    AUTO_OFF: "auto-off",
    REOPENED: "reopened",
    BELOW_THRESHOLD: "below-threshold",
    NOTHING_TO_REMOVE: "nothing-to-remove",
  });

  // A compose skipped for these reasons has nothing a click could ever trim.
  const INELIGIBLE = new Set([SKIP.FORWARD, SKIP.NO_QUOTE, SKIP.NOTHING_TO_REMOVE]);

  const KIND = Object.freeze({ TRIM: "trim", SKIP: "skip", UNKNOWN: "unknown", REJECTED: "rejected" });

  class Decision {
    constructor(kind, reason, keptMessages, removedMessages) {
      this.kind = kind;
      this.reason = reason;
      this.keptMessages = keptMessages;
      this.removedMessages = removedMessages;
      Object.freeze(this);
    }

    static trim(keptMessages, removedMessages) {
      return new Decision(KIND.TRIM, "", keptMessages, removedMessages);
    }

    static skip(reason) {
      return new Decision(KIND.SKIP, reason, 0, global.MessageCount.of(0));
    }

    isTrim() { return this.kind === KIND.TRIM; }
    isSkip() { return this.kind === KIND.SKIP; }
    isUnknown() { return this.kind === KIND.UNKNOWN; }
    isRejected() { return this.kind === KIND.REJECTED; }

    /** Only meaningful on a skip: true when no later click could trim this compose. */
    makesIneligible() {
      return this.isSkip() && INELIGIBLE.has(this.reason);
    }
  }

  // Unknown is not a skip: it means "unfold, then ask again".
  Decision.UNKNOWN = new Decision(KIND.UNKNOWN, "", 0, global.MessageCount.of(0));
  // A command refused by the session's state. Not a decision about the quote.
  Decision.REJECTED = new Decision(KIND.REJECTED, "", 0, global.MessageCount.of(0));

  const KIND_OF = global.QuoteShape.KIND;

  const TrimPolicy = Object.freeze({
    SKIP,

    decide(shape, context, settings) {
      if (shape.kind === KIND_OF.FORWARD) return Decision.skip(SKIP.FORWARD);
      if (shape.kind === KIND_OF.NONE) return Decision.skip(SKIP.NO_QUOTE);

      if (context.isAuto()) {
        if (!settings.auto) return Decision.skip(SKIP.AUTO_OFF);
        if (context.reopened) return Decision.skip(SKIP.REOPENED);
      }

      if (shape.kind === KIND_OF.UNKNOWN) return Decision.UNKNOWN;

      const rules = settings.rules;
      if (context.isAuto() && !shape.quotedMessages.reaches(rules.threshold)) {
        return Decision.skip(SKIP.BELOW_THRESHOLD);
      }

      const kept = rules.keptMessages();
      const removed = shape.quotedMessages.minus(kept);
      if (removed.value === 0) return Decision.skip(SKIP.NOTHING_TO_REMOVE);
      return Decision.trim(kept, removed);
    },
  });

  global.Decision = Decision;
  global.TrimPolicy = TrimPolicy;
})(globalThis);
