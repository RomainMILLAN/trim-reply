/**
 * EVERYTHING THIS EXTENSION KNOWS ABOUT GMAIL'S DOM, in one file.
 *
 * Gmail's class names are obfuscated and change without notice. When the
 * extension stops working, this is the file to update -- and the only one. The
 * values come from the step-0 spike (docs/gmail-spike.md):
 *
 *   compose container  `.M9`: holds the editor, the `•••` button and the hidden
 *                      inputs. Inline replies and floating windows alike, no iframe.
 *   editor             `div[contenteditable][g_editable]` -- attributes, not classes.
 *   `•••` button       `div.ajR`, OUTSIDE the editor. It also exists, hidden, in a new
 *                      message: only a VISIBLE one means "the quote is folded".
 *   `rm` input         empty in a new message, filled in a reply or a forward.
 *   `uet` input        holds the folded quote as an HTML string, which Gmail appends
 *                      on send. It empties synchronously when the `•••` is clicked.
 *   quote              `div.gmail_quote_container`, a direct child of the editor:
 *                        reply   > div.gmail_attr + blockquote.gmail_quote
 *                        forward > div.gmail_attr, br, ..., div.gmail_quote (no blockquote)
 *                      one `.gmail_attr` per quoted message.
 *   signature          `[data-smartmail="gmail_signature"]`
 *
 * Nothing here reads text: the extension behaves the same in every UI language.
 * Everything that decides is read OUTSIDE the editor (button, inputs), except the
 * quote itself -- whose content is written by other people, which is why counts
 * saturate and the trim is checked on what remains.
 */
(function (global) {
  "use strict";

  const SELECTOR = Object.freeze({
    editor: 'div[contenteditable="true"][g_editable="true"]',
    compose: ".M9",
    foldButton: "div.ajR",
    replyToInput: 'input[name="rm"]',
    foldedQuoteInput: 'input[name="uet"]',
    quoteContainer: "gmail_quote_container",
    replyBlock: "blockquote.gmail_quote",
    nestedQuote: ".gmail_quote_container, div.gmail_quote",
    attribution: ".gmail_attr",
    signature: '[data-smartmail="gmail_signature"]',
  });

  function isVisible(el) {
    return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  const GmailDom = Object.freeze({
    SELECTOR,

    editors(root) {
      return root.querySelectorAll(SELECTOR.editor);
    },

    composeOf(editor) {
      return editor.closest(SELECTOR.compose);
    },

    /** The visible `•••` of THIS compose, never one inside the editor (quoted content). */
    visibleFoldButton(compose, editor) {
      return Array.from(compose.querySelectorAll(SELECTOR.foldButton))
        .find((button) => !editor.contains(button) && isVisible(button)) || null;
    },

    /** A hidden input of the compose -- never a lookalike planted in the quoted content. */
    hiddenValue(compose, editor, selector) {
      const input = Array.from(compose.querySelectorAll(selector)).find((el) => !editor.contains(el));
      return input ? input.value : null;
    },

    /** The outer quote: a direct child of the editor, never a pasted lookalike deeper down. */
    outerQuote(editor) {
      return Array.from(editor.children).find((child) => child.classList.contains(SELECTOR.quoteContainer)) || null;
    },

    isForward(outer) {
      return !Array.from(outer.children).some((child) => child.matches(SELECTOR.replyBlock));
    },

    quotedMessages(node) {
      return node.querySelectorAll(SELECTOR.attribution).length;
    },

    /** What "keep the replied message" removes: the quote nested in the first quoted message. */
    nestedQuoteOf(outer) {
      const block = Array.from(outer.children).find((child) => child.matches(SELECTOR.replyBlock));
      return block ? block.querySelector(SELECTOR.nestedQuote) : null;
    },

    /** True when the editor holds text outside the quote and the signature: a reopened draft. */
    hasUserText(editor) {
      const outer = GmailDom.outerQuote(editor);
      const visit = (node) => {
        for (const child of node.childNodes) {
          if (child.nodeType === 3 && child.data.trim() !== "") return true;
          if (child.nodeType !== 1 || child === outer || child.matches(SELECTOR.signature)) continue;
          if (visit(child)) return true;
        }
        return false;
      };
      return visit(editor);
    },

    isVisible,
  });

  global.GmailDom = GmailDom;
})(globalThis);
