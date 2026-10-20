/**
 * Mounts the sanitized Gmail fixtures into a fake document, and plays Gmail's
 * part where the fixtures cannot: clicking the `•••` of a folded reply moves the
 * quote into the editor, hides the button and empties `uet` -- in the same tick,
 * as the spike measured.
 */
import { readFileSync } from "node:fs";
import { fromHTML, installDocument } from "./fake-dom.js";

const FIXTURES = new URL("./fixtures/gmail/", import.meta.url);

export const fixture = (name) => readFileSync(new URL(`${name}.html`, FIXTURES), "utf8");

const EDITOR = 'div[contenteditable="true"][g_editable="true"]';

/** A fresh document with one compose mounted from a fixture. */
export function mount(name) {
  const doc = installDocument();
  const [container] = fromHTML(doc, fixture(name)).filter((n) => n.nodeType === 1);
  doc.body.append(container);
  return { doc, container, editor: container.querySelector(EDITOR) };
}

export const input = (container, name) =>
  Array.from(container.querySelectorAll(`input[name="${name}"]`))[0];

/** The outer quote of the 6-message reply, as fresh nodes owned by `doc`. */
export function quoteOfSix(doc) {
  const [container] = fromHTML(doc, fixture("reply-unfolded-6")).filter((n) => n.nodeType === 1);
  const editor = container.querySelector(EDITOR);
  return Array.from(editor.children).find((c) => c.classList.contains("gmail_quote_container"));
}

/** Makes the folded reply behave like Gmail when its `•••` is clicked. */
export function behaveLikeGmail({ doc, container, editor }) {
  const button = container.querySelector("div.ajR");
  button.addEventListener("click", () => {
    editor.append(quoteOfSix(doc));
    button.setAttribute("style", "display:none");
    input(container, "uet").value = "";
  });
  return button;
}

/** A reply whose quote nests `n` messages: built, not captured, for hostile and large cases. */
export function nestedReply(doc, n) {
  const outer = doc.createElement("div");
  outer.className = "gmail_quote gmail_quote_container";
  let parent = outer;
  for (let i = 0; i < n; i += 1) {
    const attr = doc.createElement("div");
    attr.className = "gmail_attr";
    attr.textContent = "lorem ipsum";
    const block = doc.createElement("blockquote");
    block.className = "gmail_quote";
    parent.append(attr, block);
    if (i < n - 1) {
      const nested = doc.createElement("div");
      nested.className = "gmail_quote";
      block.append(doc.createTextNode("lorem ipsum"), nested);
      parent = nested;
    }
  }
  return outer;
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
