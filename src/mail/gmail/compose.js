/**
 * One Gmail compose, behind the `Compose` contract (src/mail/mail-contract.js).
 *
 * The domain never sees a DOM node: it gets QuoteShapes, Folds and Cuts. Every
 * failure has a null object -- NO_FOLD, NO_CUT -- so the caller never tests for
 * null.
 *
 * THE CUT IS ATOMIC. Everything is checked first, on the untouched DOM; then a
 * single mutation (anchor + detach). The Cut object exists before the mutation,
 * and the `input` event that makes Gmail save the draft is fired in a local try,
 * so nothing thrown after the mutation can lose the memento.
 */
(function (global) {
  "use strict";

  const { GmailDom, QuoteShape } = global;
  const S = GmailDom.SELECTOR;

  // Spike: the `•••` appears in the same mutation batch as the editor, and the
  // quote moves into the editor in the same tick as the click. These bounds are
  // generous margins over that, not tuned delays.
  const TIMING = Object.freeze({ APPEAR_MS: 500, UNFOLD_MS: 1000, POLL_MS: 25 });

  const NO_FOLD = Object.freeze({ unfolded: false, refold() {} });
  // Gmail offers no way to fold a quote back once expanded (spike, point j).
  const FOLD = Object.freeze({ unfolded: true, refold() {} });

  const NO_CUT = Object.freeze({
    recordInto: (recorder) => recorder.abandon(),
  });

  class GmailCut {
    constructor(compose, removed, anchor) {
      this.compose = compose;
      this.removed = removed;
      this.anchor = anchor;
      Object.freeze(this);
    }

    /** Puts the very same nodes back, at the anchor -- or at the end if the anchor is gone. */
    restore() {
      if (this.anchor.isConnected && this.compose.editor.contains(this.anchor)) {
        this.anchor.replaceWith(this.removed);
      } else {
        this.anchor.remove();
        this.compose.editor.append(this.removed);
      }
      this.compose.notifyInput();
    }

    /** Clean when Gmail holds no folded quote it could still append on send. */
    verify() {
      return this.compose.holdsFoldedQuote() ? "uncertain" : "clean";
    }

    recordInto(recorder) {
      return recorder.record(this);
    }
  }

  class GmailCompose {
    constructor(editor, container, timing = TIMING) {
      this.editor = editor;
      this.container = container;
      this.timing = timing;
      Object.freeze(this);
    }

    isReopened() {
      return GmailDom.hasUserText(this.editor);
    }

    /**
     * Without unfolding. Only the positive new-message signal answers `none()`;
     * everything else is unknown, because a reply's `•••` can still be on its way.
     */
    inspectFolded() {
      return GmailDom.hiddenValue(this.container, this.editor, S.replyToInput) === ""
        ? QuoteShape.none()
        : QuoteShape.unknown();
    }

    async unfold() {
      let button = GmailDom.visibleFoldButton(this.container, this.editor);
      if (!button) {
        if (GmailDom.outerQuote(this.editor)) return FOLD; // already unfolded
        button = await this.waitFor(
          () => GmailDom.visibleFoldButton(this.container, this.editor),
          this.timing.APPEAR_MS,
        );
        if (!button) return FOLD; // nothing to unfold: inspect() will say none
      }
      for (const type of ["mousedown", "mouseup", "click"]) {
        button.dispatchEvent(new global.MouseEvent(type, { bubbles: true, cancelable: true }));
      }
      const done = await this.waitFor(() => !this.holdsFoldedQuote(), this.timing.UNFOLD_MS);
      return done ? FOLD : NO_FOLD;
    }

    inspect() {
      const outer = GmailDom.outerQuote(this.editor);
      if (!outer) return QuoteShape.none();
      if (GmailDom.isForward(outer)) return QuoteShape.forward();
      return QuoteShape.reply(GmailDom.quotedMessages(outer));
    }

    /** Leaves exactly `decision.keptMessages` quoted messages, or touches nothing. */
    cut(decision) {
      const outer = GmailDom.outerQuote(this.editor);
      if (!outer || GmailDom.isForward(outer)) return NO_CUT;
      const target = decision.keptMessages === 0 ? outer : GmailDom.nestedQuoteOf(outer);
      if (!target) return NO_CUT;
      // Checked on what REMAINS, on the raw counts: never on a saturated number.
      const remaining = GmailDom.quotedMessages(outer) - GmailDom.quotedMessages(target);
      if (remaining !== decision.keptMessages) return NO_CUT;

      const anchor = this.editor.ownerDocument.createComment("trimreply");
      const cut = new GmailCut(this, target, anchor);
      target.before(anchor);
      target.remove();
      this.notifyInput();
      return cut;
    }

    /** True while a visible `•••` or a non-empty `uet` says Gmail still holds a folded quote. */
    holdsFoldedQuote() {
      return Boolean(GmailDom.visibleFoldButton(this.container, this.editor))
        || Boolean(GmailDom.hiddenValue(this.container, this.editor, S.foldedQuoteInput));
    }

    /** Fires the event Gmail listens to before saving the draft. Never throws. */
    notifyInput() {
      try {
        this.editor.dispatchEvent(new global.InputEvent("input", { bubbles: true }));
      } catch {
        // The DOM change is done; a failing listener must not lose the memento.
      }
    }

    /** Puts the bar's host right after the editor's wrapper, inside this compose. */
    placeBar(host) {
      this.editor.parentNode.after(host);
    }

    waitFor(probe, timeoutMs) {
      return new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          const found = probe();
          if (found) resolve(found);
          else if (Date.now() - started >= timeoutMs) resolve(null);
          else setTimeout(tick, this.timing.POLL_MS);
        };
        tick();
      });
    }
  }

  GmailCompose.TIMING = TIMING;
  GmailCompose.FOLD = FOLD;
  GmailCompose.NO_FOLD = NO_FOLD;
  GmailCompose.NO_CUT = NO_CUT;

  global.GmailCompose = GmailCompose;
})(globalThis);
