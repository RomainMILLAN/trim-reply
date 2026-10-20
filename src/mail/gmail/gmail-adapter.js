/**
 * The Gmail adapter: finds composes and hands each one, once, to the caller.
 *
 * A MutationObserver on the body, debounced, and a WeakSet of editors already
 * handed out. It covers every way a compose opens -- the Reply buttons, the r / a
 * / f shortcuts, a floating window -- because it watches for the editor, not for
 * the gesture that created it.
 */
(function (global) {
  "use strict";

  const { GmailDom, GmailCompose } = global;
  const DEBOUNCE_MS = 250;

  const GmailAdapter = Object.freeze({
    /** Calls `onCompose(compose)` for each new compose. Returns a stop function. */
    watch(onCompose, root = global.document.body) {
      const seen = new WeakSet();
      let timer = null;

      const scan = () => {
        timer = null;
        for (const editor of GmailDom.editors(root)) {
          if (seen.has(editor)) continue;
          const container = GmailDom.composeOf(editor);
          if (!container) continue;
          seen.add(editor);
          onCompose(new GmailCompose(editor, container));
        }
      };

      const observer = new global.MutationObserver(() => {
        if (timer === null) timer = setTimeout(scan, DEBOUNCE_MS);
      });
      observer.observe(root, { childList: true, subtree: true });
      scan();

      return () => {
        observer.disconnect();
        if (timer !== null) clearTimeout(timer);
      };
    },
  });

  global.GmailAdapter = GmailAdapter;
})(globalThis);
