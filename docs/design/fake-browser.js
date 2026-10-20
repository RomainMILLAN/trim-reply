/**
 * A stand-in WebExtension API so the real popup and options pages render in a
 * plain browser tab, for the README screenshots only (see render.sh). It never
 * ships: docs/ is not part of the packages.
 */
(function () {
  const store = (initial) => {
    const data = { ...initial };
    return {
      async get(keys) {
        const out = {};
        for (const k of keys == null ? Object.keys(data) : [].concat(keys)) if (k in data) out[k] = data[k];
        return out;
      },
      async set(items) { Object.assign(data, items); },
    };
  };
  window.browser = {
    storage: { local: store({ trimmedReplies: 128 }), sync: store({}), onChanged: { addListener() {} } },
    i18n: { getMessage: () => "" },
    permissions: { contains: async () => true, request: async () => true },
    runtime: { getManifest: () => ({ version: "1.0.0" }), openOptionsPage() {} },
  };
})();
