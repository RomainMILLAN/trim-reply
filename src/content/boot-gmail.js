/**
 * Entry point on mail.google.com: the only file that names the Gmail adapter.
 * Phase 2 adds boot-outlook.js next to it, with no change to main.js.
 */
(function (global) {
  "use strict";

  const bar = global.TrimReplyBar;

  global.TrimReplyMain.start({
    adapter: global.GmailAdapter,
    settings: global.SettingsRepository,
    stats: global.StatsRepository,
    createBar: bar ? bar.create : undefined,
  }).catch(() => {
    // Fail closed: if the content script cannot start, Gmail behaves as without it.
  });
})(globalThis);
