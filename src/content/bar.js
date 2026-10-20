/**
 * The bar inside a Gmail compose: the Trim button, the "removed" line, Undo,
 * and the uncertain-trim warning.
 *
 * It lives in a CLOSED shadow root, outside the editor: Gmail's styles cannot
 * reach it, the page's scripts cannot walk into it, and none of it is ever sent
 * as part of the draft. Its styles are a constructed stylesheet
 * (adoptedStyleSheets): no <style> element and no extension URL exposed to the
 * page -- checked against Gmail's CSP in the spike (point h).
 *
 * It decides nothing. It renders the session's state through the state's own
 * predicates (offersTrim, offersUndo, warnsUncertain) and calls back onTrim /
 * onUndo. Clicks a script synthesises (`isTrusted` false) are ignored: only the
 * user trims or undoes.
 *
 * Masked bar (display.bar false, a default chosen for the user and changeable):
 * no information and no Undo after a CLEAN trim. The Trim button stays -- it is
 * the only way to trim when auto-trim is off -- and so does the uncertain-trim
 * warning, which protects the user rather than informing them.
 */
(function (global) {
  "use strict";

  const { Dom, Platform } = global;

  const CSS = `
    :host { all: initial; display: block; }
    .bar {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      margin: 6px 0; padding: 4px 8px; border-radius: 6px;
      font: 12px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #134e4a; background: #f0fdfa; border: 1px solid #99f6e4;
    }
    .bar.warning { color: #7c2d12; background: #fff7ed; border-color: #fdba74; }
    .bar[hidden], button[hidden], .message[hidden] { display: none; }
    button {
      font: inherit; cursor: pointer; padding: 2px 10px; border-radius: 4px;
      color: #ffffff; background: #0f766e; border: 1px solid #0f766e;
    }
    button.secondary { color: #0f766e; background: transparent; }
    .bar.warning button.secondary { color: #9a3412; border-color: #9a3412; }
    button:focus-visible { outline: 2px solid #134e4a; outline-offset: 2px; }
    @media (prefers-color-scheme: dark) {
      .bar { color: #ccfbf1; background: #042f2e; border-color: #115e59; }
      .bar.warning { color: #ffedd5; background: #431407; border-color: #9a3412; }
      button.secondary, .bar.warning button.secondary { color: #ccfbf1; border-color: #5eead4; }
    }
  `;

  const t = (key, fallback, subs) => Platform.t(key, fallback, subs);

  function trustedOnly(handler) {
    return (event) => {
      if (!event.isTrusted) return;
      event.preventDefault();
      handler();
    };
  }

  function create({ onTrim, onUndo, display }) {
    const host = Dom.el("div", { class: "trimreply" });
    const shadow = host.attachShadow({ mode: "closed" });
    const sheet = new global.CSSStyleSheet();
    sheet.replaceSync(CSS);
    shadow.adoptedStyleSheets = [sheet];

    const message = Dom.el("span", { class: "message", role: "status", "aria-live": "polite" });
    const trim = Dom.el("button", {
      type: "button",
      class: "trim",
      text: t("barTrim", "Trim quoted history"),
      onclick: trustedOnly(onTrim),
    });
    const undo = Dom.el("button", {
      type: "button",
      class: "secondary undo",
      text: t("barUndo", "Undo"),
      onclick: trustedOnly(onUndo),
    });
    const bar = Dom.el("div", { class: "bar", hidden: true }, [message, trim, undo]);
    shadow.appendChild(bar);

    function render(state) {
      const uncertain = state.warnsUncertain;
      const informs = state.offersUndo && (display.bar || uncertain);

      Dom.show(trim, state.offersTrim);
      Dom.show(undo, informs);
      Dom.show(message, informs);
      bar.classList.toggle("warning", uncertain);
      if (uncertain) {
        message.textContent = t("barUncertain", "Trim uncertain: check the quote is gone before sending.");
      } else if (informs) {
        const count = state.data.removedMessages.label();
        message.textContent = t("barRemoved", `Quoted history removed (${count})`, [count]);
      }
      Dom.show(bar, state.offersTrim || informs);
    }

    // `shadow` is returned for tests only: the page never gets this object.
    return { host, render, shadow };
  }

  global.TrimReplyBar = Object.freeze({ create, CSS });
})(globalThis);
