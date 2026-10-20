/**
 * The sections shared by the popup and the options page.
 *
 * Each section is a function `(ctx) -> Element`, built with Dom.el only. `ctx`
 * carries what was read once at mount time and the one way to change a setting:
 *
 *   ctx.settings   the current Settings
 *   ctx.update(fn) builds the next Settings from a plain object and saves it
 *   ctx.count      the number of replies lightened
 *   ctx.area       "local" | "sync"
 *   ctx.access     { granted, request() } for mail.google.com
 *
 * Every value written goes back through Settings.from, so the page cannot store
 * what the content script would refuse to read.
 */
(function (global) {
  "use strict";

  const { Dom, Platform, Settings, TrimRules } = global;
  const t = (key, fallback, subs) => Platform.t(key, fallback, subs);
  const GMAIL = ["https://mail.google.com/*"];

  function section(id, title, children) {
    return Dom.el("section", { class: "section", id: `section-${id}` }, [
      Dom.el("h2", { text: title }),
      ...children,
    ]);
  }

  function checkbox(id, label, checked, onChange) {
    const input = Dom.el("input", { type: "checkbox", id, checked });
    input.addEventListener("change", () => onChange(input.checked));
    return Dom.el("div", { class: "field check" }, [input, Dom.el("label", { for: id, text: label })]);
  }

  function radio(name, value, label, checked, onChange) {
    const id = `${name}-${value}`;
    const input = Dom.el("input", { type: "radio", name, id, value, checked });
    input.addEventListener("change", () => { if (input.checked) onChange(value); });
    return Dom.el("div", { class: "field check" }, [input, Dom.el("label", { for: id, text: label })]);
  }

  const SECTIONS = Object.freeze({
    auto(ctx) {
      return section("auto", t("sectionAuto", "Automatic trim"), [
        checkbox("auto", t("autoLabel", "Trim the quoted history as soon as a reply opens"), ctx.settings.auto,
          (auto) => ctx.update((raw) => ({ ...raw, auto }))),
        Dom.el("p", { class: "hint", text: t("autoHint", "When off, a Trim button is offered in each reply instead.") }),
      ]);
    },

    mode(ctx) {
      const keep = ctx.settings.rules.keep;
      const set = (value) => ctx.update((raw) => ({ ...raw, rules: { ...raw.rules, keep: value } }));
      return section("mode", t("sectionMode", "What to remove"), [
        radio("keep", TrimRules.KEEP.NOTHING, t("keepNothing", "All the quoted history (recommended)"),
          keep === TrimRules.KEEP.NOTHING, set),
        radio("keep", TrimRules.KEEP.REPLIED_MESSAGE, t("keepReplied", "All but the message I am replying to"),
          keep === TrimRules.KEEP.REPLIED_MESSAGE, set),
      ]);
    },

    threshold(ctx) {
      const { MIN, MAX } = TrimRules.THRESHOLD;
      const input = Dom.el("input", {
        type: "number", id: "threshold", min: MIN, max: MAX, step: 1, value: ctx.settings.rules.threshold,
      });
      input.addEventListener("change", () => {
        const threshold = Number(input.value);
        ctx.update((raw) => ({ ...raw, rules: { ...raw.rules, threshold } }));
      });
      return section("threshold", t("sectionThreshold", "Short threads"), [
        Dom.el("div", { class: "field" }, [
          Dom.el("label", { for: "threshold", text: t("thresholdLabel", "Trim automatically only when the quote holds at least this many emails") }),
          input,
        ]),
        Dom.el("p", { class: "hint", text: t("thresholdHint", "The Trim button ignores this limit.") }),
      ]);
    },

    bar(ctx) {
      return section("bar", t("sectionBar", "In Gmail"), [
        checkbox("bar", t("barLabel", "Show what was removed, with Undo, after a trim"), ctx.settings.display.bar,
          (bar) => ctx.update((raw) => ({ ...raw, display: { ...raw.display, bar } }))),
        Dom.el("p", { class: "hint", text: t("barHint", "The Trim button and the uncertain-trim warning are always shown.") }),
      ]);
    },

    storage(ctx) {
      const set = (area) => ctx.moveTo(area);
      return section("storage", t("sectionStorage", "Where settings are kept"), [
        radio("area", "local", t("areaLocal", "This browser only (recommended)"), ctx.area === "local", set),
        radio("area", "sync", t("areaSync", "Synced with my browser account"), ctx.area === "sync", set),
        Dom.el("p", { class: "hint", text: t("areaHint", "Only the settings are synced. The counter and your emails never leave this browser.") }),
      ]);
    },

    counter(ctx) {
      return section("counter", t("sectionCounter", "Counter"), [
        Dom.el("p", { class: "count", id: "count", text: t("counterValue", `Replies lightened: ${ctx.count}`, [String(ctx.count)]) }),
      ]);
    },

    access(ctx) {
      const status = Dom.el("p", { class: "status", role: "status" });
      const button = Dom.el("button", { type: "button", class: "primary", text: t("accessGrant", "Allow access to Gmail") });
      const paint = (granted, message) => {
        status.textContent = granted
          ? t("accessGranted", "TrimReply can work on mail.google.com.")
          : message || t("accessMissing", "TrimReply has no access to mail.google.com: it does nothing in Gmail.");
        status.classList.toggle("warn", !granted);
        Dom.show(button, !granted);
      };
      button.addEventListener("click", async () => {
        const result = await ctx.access.request();
        paint(result.granted, result.ok ? "" : t("accessRefused", "The browser refused the request: grant it from the extension's site access settings."));
      });
      paint(ctx.access.granted);
      return section("access", t("sectionAccess", "Access to Gmail"), [status, button]);
    },
  });

  /** Reads everything once, builds the requested sections into `root`, and wires the saves. */
  async function mount(root, names) {
    const repository = global.SettingsRepository;
    const ctx = {
      settings: await repository.load(),
      count: (await global.StatsRepository.load()).value,
      area: await Platform.storageAreaName(),
      access: {
        granted: await Platform.grantedOrigins(GMAIL),
        request: () => Platform.requestOrigins(GMAIL),
      },
      async update(change) {
        ctx.settings = Settings.from(change(ctx.settings.toStorage()));
        await repository.save(ctx.settings);
      },
      /** Copies the settings to the other area first, then switches: never a moment without them. */
      async moveTo(area) {
        if (area === ctx.area) return;
        await Platform.storageAreaFor(area).set({ [repository.KEY]: ctx.settings.toStorage() });
        await Platform.setStorageArea(area);
        ctx.area = area;
      },
    };
    for (const name of names) root.appendChild(SECTIONS[name](ctx));
    return ctx;
  }

  global.SettingsForm = Object.freeze({ SECTIONS, mount });
})(globalThis);
