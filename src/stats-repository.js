/**
 * The number of replies TrimReply has lightened. ALWAYS storage.local, even when
 * the settings are synced: a usage statistic has no business on the user's
 * Google or Mozilla account.
 *
 * Read, apply the fact, write. Two Gmail tabs trimming at the same instant can
 * lose one increment; for a local statistic that is an accepted limit
 * (ARCHITECTURE.md), not worth a lock.
 *
 * `apply` never throws: a storage failure must not surface inside Gmail.
 */
(function (global) {
  "use strict";

  const KEY = "trimmedReplies";
  const { Platform, Counter } = global;

  const StatsRepository = Object.freeze({
    KEY,

    async load() {
      try {
        const stored = await Platform.api.storage.local.get(KEY);
        return Counter.of(stored[KEY]);
      } catch {
        return Counter.of(0);
      }
    },

    async apply(fact) {
      try {
        const before = await StatsRepository.load();
        const after = fact.applyTo(before);
        if (after.value !== before.value) await Platform.api.storage.local.set({ [KEY]: after.value });
      } catch {
        // Fail quiet: the statistic is a convenience, never a reason to break a reply.
      }
    },
  });

  global.StatsRepository = StatsRepository;
})(globalThis);
