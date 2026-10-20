/**
 * The popup: the auto-trim switch, the counter, Gmail access, and a way to the
 * options page.
 */
(function (global) {
  "use strict";

  const { Platform, SettingsForm } = global;

  async function start(doc) {
    doc.documentElement.lang = Platform.t("@@ui_locale", "en").split("_")[0];
    doc.getElementById("subtitle").textContent = Platform.t("optionsSubtitle", "Strip the quoted history from your Gmail replies.");
    doc.getElementById("version").textContent = `v${Platform.api.runtime.getManifest().version}`;
    const open = doc.getElementById("open-options");
    open.textContent = Platform.t("openOptions", "All settings");
    open.addEventListener("click", () => Platform.api.runtime.openOptionsPage());
    await SettingsForm.mount(doc.getElementById("sections"), ["auto", "counter", "access"]);
  }

  global.TrimReplyPopup = Object.freeze({ start });
  if (global.document && global.document.getElementById("open-options")) start(global.document);
})(globalThis);
