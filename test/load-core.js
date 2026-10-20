/**
 * Loads the classic scripts once and hands back the globals.
 *
 * The files are IIFEs populating globalThis, because the same code runs as a
 * content script, in the popup and in the options page. THE ORDER IS THE ONE
 * THAT SHIPS: the shared prefix below must match the manifest's content_scripts
 * and both pages, which structure.test.js checks.
 */
const ORDER = [
  "platform.js",
  "core/message-count.js",
  "core/settings.js",
  "core/quote-shape.js",
  "core/compose-context.js",
  "core/trim-policy.js",
  "core/counter.js",
  "core/compose-session.js",
  "settings-repository.js",
  "stats-repository.js",
  "mail/mail-contract.js",
  "mail/gmail/selectors.js",
  "mail/gmail/compose.js",
  "mail/gmail/gmail-adapter.js",
  "ui/dom.js",
  "content/bar.js",
  "content/trim-run.js",
  "content/main.js",
  // content/boot-gmail.js is NOT loaded: it starts the extension on import.
];

let loaded = false;

export async function loadCore() {
  if (!loaded) {
    for (const file of ORDER) await import(`../src/${file}`);
    loaded = true;
  }
  return globalThis;
}

export { ORDER };
