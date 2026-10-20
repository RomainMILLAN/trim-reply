/**
 * The only way this project builds DOM, in the popup, the options page and the
 * bar inside Gmail. Adapted from Quick Jump for Jira (ui/dom.js).
 *
 * There is deliberately NO html`` helper and no string templating: if one
 * existed, someone would eventually pass an unescaped value through it. Text
 * goes through textContent, and attributes are set from a closed list -- no
 * href, no src, no inline handler, nothing that carries a URL or code.
 * `setAttribute` is allowed in this file only (test/structure.test.js).
 *
 * The download and drag helpers of the original are left out on purpose: this
 * extension needs neither, and `Dom.downloadFile` assigned an `href`.
 */
(function (global) {
  "use strict";

  const ATTRS = new Set([
    "class", "id", "type", "for", "role", "title", "value", "name", "min", "max", "step",
    "checked", "disabled", "hidden", "tabindex", "lang", "dir",
    "aria-label", "aria-live", "aria-hidden", "aria-describedby", "aria-pressed", "aria-checked",
  ]);

  const Dom = {
    el(tag, props = {}, children = []) {
      const node = global.document.createElement(tag);

      for (const [name, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue;
        if (name === "text") {
          node.textContent = String(value);
          continue;
        }
        if (name.startsWith("on") && typeof value === "function") {
          node.addEventListener(name.slice(2).toLowerCase(), value);
          continue;
        }
        if (!ATTRS.has(name)) {
          throw new Error(`refusing to set attribute "${name}"`);
        }
        node.setAttribute(name, value === true ? "" : String(value));
      }

      for (const child of [].concat(children)) {
        if (child === null || child === undefined || child === false) continue;
        node.appendChild(typeof child === "string" ? global.document.createTextNode(child) : child);
      }
      return node;
    },

    /** Shows or hides a node through the `hidden` attribute, the one switch every surface uses. */
    show(node, visible) {
      if (visible) node.removeAttribute("hidden");
      else node.setAttribute("hidden", "");
    },

    clear(node) {
      while (node.firstChild) node.removeChild(node.firstChild);
    },
  };

  global.Dom = Dom;
})(globalThis);
