/**
 * The options page: every section, in a tab of its own.
 */
(function (global) {
  "use strict";

  const { Platform, SettingsForm } = global;

  async function start(doc) {
    doc.documentElement.lang = Platform.t("@@ui_locale", "en").split("_")[0];
    doc.getElementById("subtitle").textContent = Platform.t("optionsSubtitle", "Strip the quoted history from your Gmail replies.");
    doc.getElementById("version").textContent = `v${Platform.api.runtime.getManifest().version}`;
    await SettingsForm.mount(doc.getElementById("sections"),
      ["auto", "mode", "threshold", "bar", "storage", "counter", "access"]);
  }

  global.TrimReplyOptions = Object.freeze({ start });
  if (global.document && global.document.getElementById("sections")) start(global.document);
})(globalThis);
