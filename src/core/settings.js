/**
 * The user's settings, as values.
 *
 * Constructors only assign. Everything read from storage goes through
 * `Settings.from(raw)`, which treats the stored object as untrusted: a missing,
 * mistyped or out-of-range field falls back to its default instead of reaching
 * the policy. Storage can be synced from another device, edited by hand, or left
 * by an older build.
 *
 * Composed rather than flat, so each part has one reason to change:
 *   auto      trim on its own when a reply opens
 *   rules     what to trim (TrimRules)
 *   display   what to show (Display)
 */
(function (global) {
  "use strict";

  const KEEP = Object.freeze({ NOTHING: "nothing", REPLIED_MESSAGE: "repliedMessage" });
  const KEPT_MESSAGES = new Map([[KEEP.NOTHING, 0], [KEEP.REPLIED_MESSAGE, 1]]);

  // The threshold is compared with a count that saturates at MessageCount.MAX:
  // a larger threshold could never be reached and would silently disable auto-trim.
  const THRESHOLD = Object.freeze({ MIN: 1, MAX: 100, DEFAULT: 2 });

  class TrimRules {
    constructor(keep, threshold) {
      this.keep = keep;
      this.threshold = threshold;
      Object.freeze(this);
    }

    static from(raw) {
      const source = isPlainObject(raw) ? raw : {};
      const keep = KEPT_MESSAGES.has(source.keep) ? source.keep : KEEP.NOTHING;
      const t = source.threshold;
      const threshold = Number.isInteger(t) && t >= THRESHOLD.MIN && t <= THRESHOLD.MAX
        ? t
        : THRESHOLD.DEFAULT;
      return new TrimRules(keep, threshold);
    }

    /** How many quoted messages survive a trim: 0, or the one being replied to. */
    keptMessages() {
      return KEPT_MESSAGES.get(this.keep);
    }
  }

  class Display {
    constructor(bar) {
      this.bar = bar;
      Object.freeze(this);
    }

    static from(raw) {
      const source = isPlainObject(raw) ? raw : {};
      return new Display(typeof source.bar === "boolean" ? source.bar : true);
    }
  }

  class Settings {
    constructor(auto, rules, display) {
      this.auto = auto;
      this.rules = rules;
      this.display = display;
      Object.freeze(this);
    }

    static from(raw) {
      const source = isPlainObject(raw) ? raw : {};
      return new Settings(
        typeof source.auto === "boolean" ? source.auto : true,
        TrimRules.from(source.rules),
        Display.from(source.display),
      );
    }

    static defaults() {
      return Settings.from(undefined);
    }

    /** The plain object written to storage; `from(toStorage())` is the identity. */
    toStorage() {
      return {
        auto: this.auto,
        rules: { keep: this.rules.keep, threshold: this.rules.threshold },
        display: { bar: this.display.bar },
      };
    }
  }

  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  TrimRules.KEEP = KEEP;
  TrimRules.THRESHOLD = THRESHOLD;

  global.TrimRules = TrimRules;
  global.Display = Display;
  global.Settings = Settings;
})(globalThis);
