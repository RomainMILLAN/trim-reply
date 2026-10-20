/**
 * The shape of a compose's quote, and nothing else.
 *
 * Built by the mail adapter, which is the only place that knows how a webmail
 * draws a quote. The DOM depth never leaves the adapter: what crosses into the
 * domain is a number of quoted messages.
 *
 *   none()        no quote: a new message, or a reply whose quote was deleted
 *   forward()     a forward: never trimmed
 *   reply(n)      a reply quoting n messages
 *   unknown()     the quote is folded and cannot be counted without unfolding
 *
 * Only `inspectFolded` may answer `unknown()`. Once unfolded, a quote is always
 * one of the other three.
 */
(function (global) {
  "use strict";

  const KIND = Object.freeze({ NONE: "none", FORWARD: "forward", REPLY: "reply", UNKNOWN: "unknown" });

  class QuoteShape {
    constructor(kind, quotedMessages) {
      this.kind = kind;
      this.quotedMessages = quotedMessages;
      Object.freeze(this);
    }

    static none() {
      return new QuoteShape(KIND.NONE, global.MessageCount.of(0));
    }

    static forward() {
      return new QuoteShape(KIND.FORWARD, global.MessageCount.of(0));
    }

    static unknown() {
      return new QuoteShape(KIND.UNKNOWN, global.MessageCount.of(0));
    }

    /** A reply quoting no message is a reply without a quote. */
    static reply(count) {
      const quoted = global.MessageCount.of(count);
      return quoted.value === 0 ? QuoteShape.none() : new QuoteShape(KIND.REPLY, quoted);
    }
  }

  QuoteShape.KIND = KIND;

  global.QuoteShape = QuoteShape;
})(globalThis);
