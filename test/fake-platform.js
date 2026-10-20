/**
 * A stand-in for the WebExtension API surface TrimReply uses: storage.local,
 * storage.sync, storage.onChanged, i18n.getMessage, permissions.
 *
 * `install()` points Platform.api at a fresh fake and returns it, so each test
 * starts from empty storage.
 */
function area(name, emit) {
  const data = new Map();
  return {
    data,
    async get(keys) {
      const wanted = keys == null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of wanted) if (data.has(k)) out[k] = structuredClone(data.get(k));
      return out;
    },
    async set(items) {
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data.get(k), newValue: structuredClone(v) };
        data.set(k, structuredClone(v));
      }
      emit(changes, name);
    },
  };
}

export function fakeApi({ messages = {}, granted = true } = {}) {
  const listeners = [];
  const emit = (changes, name) => { for (const l of listeners) l(changes, name); };
  return {
    storage: {
      local: area("local", emit),
      sync: area("sync", emit),
      onChanged: { addListener: (l) => listeners.push(l) },
    },
    i18n: { getMessage: (key) => messages[key] ?? "" },
    permissions: {
      contains: async () => granted,
      request: async () => granted,
    },
  };
}

export function install(globals, options) {
  const api = fakeApi(options);
  globals.Platform.api = api;
  return api;
}
