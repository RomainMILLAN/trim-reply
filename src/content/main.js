/**
 * The composition root of the content script: wires an adapter, the settings,
 * the statistic and the bar. It knows the MailAdapter contract and nothing of
 * Gmail -- boot-gmail.js is the one that passes the Gmail adapter in.
 *
 * Each compose gets its own ComposeSession, created with a SNAPSHOT of the
 * current settings: changing a setting affects the composes opened afterwards,
 * never one already in progress.
 */
(function (global) {
  "use strict";

  const { ComposeSession, TrimRun } = global;

  const TrimReplyMain = Object.freeze({
    /**
     * @param adapter    a MailAdapter
     * @param settings   { load(), onChange(listener) }
     * @param stats      { apply(fact) }
     * @param createBar  optional ({ onTrim, onUndo, display }) => { host, render(state) }
     * Returns { stop, sessions } -- sessions is exposed for tests only.
     */
    async start({ adapter, settings, stats, createBar }) {
      let current = await settings.load();
      settings.onChange((next) => { current = next; });
      const sessions = new WeakMap();

      const stop = adapter.watch((compose) => {
        const session = new ComposeSession(current);
        const flow = new TrimRun(session, compose, stats);
        sessions.set(compose, session);
        if (createBar) {
          const bar = createBar({
            onTrim: () => flow.run("manual"),
            onUndo: () => flow.undo(),
            display: current.display,
          });
          compose.placeBar(bar.host);
          session.onChange((state) => bar.render(state));
        }
        flow.run("auto");
      });

      return { stop, sessions };
    },
  });

  global.TrimReplyMain = TrimReplyMain;
})(globalThis);
