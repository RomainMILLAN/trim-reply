/**
 * Reads and writes the settings, in the area the user chose (local by default).
 *
 * Read, normalise through Settings.from, write. No journal, no acknowledgement:
 * a settings object small enough to be rewritten whole.
 */
(function (global) {
  "use strict";

  const KEY = "settings";
  const { Platform, Settings } = global;

  const SettingsRepository = Object.freeze({
    KEY,

    async load() {
      try {
        const area = await Platform.storageArea();
        const stored = await area.get(KEY);
        return Settings.from(stored[KEY]);
      } catch {
        return Settings.defaults();
      }
    },

    async save(settings) {
      const area = await Platform.storageArea();
      await area.set({ [KEY]: settings.toStorage() });
    },

    /** Calls `listener(settings)` whenever the stored settings change, in either area. */
    onChange(listener) {
      Platform.api.storage.onChanged.addListener((changes) => {
        if (KEY in changes || "storageArea" in changes) {
          SettingsRepository.load().then(listener);
        }
      });
    },
  });

  global.SettingsRepository = SettingsRepository;
})(globalThis);
