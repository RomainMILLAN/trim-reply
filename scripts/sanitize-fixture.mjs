/**
 * Turns a raw Gmail capture into a fixture that may be committed.
 *
 *   node scripts/sanitize-fixture.mjs <raw.html> <test/fixtures/gmail/name.html>
 *
 * A raw capture of a compose is full of identity: addresses, names, thread and
 * message ids in `jslog` and `data-*`, the whole quoted history inside the hidden
 * `uet` input. "Anonymised by hand" is not a control, so this script works by
 * ALLOW-LIST, and test/fixtures-hygiene.test.js fails if anything slips through:
 *
 *   - elements: everything except script, style, svg, img, textarea, iframe;
 *   - classes: only those the adapter or a reader of the fixture needs;
 *   - attributes: only the few the selectors read; `style` survives only as
 *     `display:none`, which is how Gmail hides the folded-quote button;
 *   - hidden inputs: only rm, lts and uet, with their values replaced by a
 *     placeholder that keeps the one fact we need -- empty or not;
 *   - text: every non-blank text node becomes "lorem ipsum".
 *
 * The input may be the raw HTML or the JSON string Playwright saves.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseHTML, serialize } from "./html-lite.mjs";

export const KEPT_CLASSES = new Set([
  "M9", "AO", "AD", "gA", "gt", "ip", "et", "ajR", "uC", "aoO", "oh",
  "Am", "editable",
  "gmail_quote", "gmail_quote_container", "gmail_attr", "gmail_signature",
]);
export const KEPT_ATTRIBUTES = new Set(["class", "contenteditable", "g_editable", "role", "style", "data-smartmail"]);
export const KEPT_INPUTS = new Set(["rm", "lts", "uet"]);
const DROPPED_ELEMENTS = new Set(["script", "style", "svg", "img", "textarea", "iframe"]);

function sanitizeAttrs(tag, attrs) {
  const get = (name) => attrs.find(([k]) => k === name)?.[1];
  if (tag === "input") {
    const name = get("name");
    const value = get("value") ?? "";
    return [["type", "hidden"], ["name", name], ["value", value === "" ? "" : "x"]];
  }
  const out = [];
  for (const [name, value] of attrs) {
    if (!KEPT_ATTRIBUTES.has(name)) continue;
    if (name === "class") {
      const kept = value.split(/\s+/).filter((c) => KEPT_CLASSES.has(c));
      if (kept.length) out.push(["class", kept.join(" ")]);
    } else if (name === "style") {
      if (/display\s*:\s*none/i.test(value)) out.push(["style", "display:none"]);
    } else {
      out.push([name, value]);
    }
  }
  return out;
}

export function sanitize(nodes) {
  const out = [];
  for (const node of nodes) {
    if (node.type === "comment") continue;
    if (node.type === "text") {
      out.push({ type: "text", text: node.text.trim() ? "lorem ipsum" : node.text.replace(/\s+/g, " ") });
      continue;
    }
    if (DROPPED_ELEMENTS.has(node.tag)) continue;
    if (node.tag === "input") {
      const name = node.attrs.find(([k]) => k === "name")?.[1];
      if (!KEPT_INPUTS.has(name)) continue;
    }
    out.push({
      type: "element",
      tag: node.tag,
      attrs: sanitizeAttrs(node.tag, node.attrs),
      children: sanitize(node.children),
    });
  }
  return out;
}

export function sanitizeHTML(raw) {
  const html = raw.trimStart().startsWith('"') ? JSON.parse(raw) : raw;
  return serialize(sanitize(parseHTML(html))) + "\n";
}

const [, , input, output] = process.argv;
if (input && output) {
  writeFileSync(output, sanitizeHTML(readFileSync(input, "utf8")));
  console.log(`${output} written`);
}
