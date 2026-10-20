import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { parseHTML } from "../scripts/html-lite.mjs";
import { KEPT_ATTRIBUTES, KEPT_CLASSES, KEPT_INPUTS } from "../scripts/sanitize-fixture.mjs";

/**
 * The fixtures were captured in a real Gmail account and live in a public
 * repository. This test is the control behind "sanitized": it fails on anything
 * scripts/sanitize-fixture.mjs would not have let through.
 */
const DIR = new URL("./fixtures/gmail/", import.meta.url);
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".html"));

function* walk(nodes) {
  for (const node of nodes) {
    yield node;
    if (node.type === "element") yield* walk(node.children);
  }
}

test("there are fixtures to check", () => {
  assert.ok(FILES.length >= 3);
});

for (const file of FILES) {
  const html = readFileSync(new URL(file, DIR), "utf8");
  const nodes = [...walk(parseHTML(html))];

  test(`${file}: no address other than @example.invalid`, () => {
    const addresses = html.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || [];
    assert.deepEqual(addresses.filter((a) => !a.endsWith("@example.invalid")), []);
  });

  test(`${file}: only allow-listed attributes, classes and inputs`, () => {
    for (const node of nodes.filter((n) => n.type === "element")) {
      if (node.tag === "input") {
        const attrs = Object.fromEntries(node.attrs);
        assert.ok(KEPT_INPUTS.has(attrs.name), `input ${attrs.name}`);
        assert.ok(attrs.value === "" || attrs.value === "x", `input ${attrs.name} keeps a real value`);
        continue;
      }
      for (const [name, value] of node.attrs) {
        assert.ok(KEPT_ATTRIBUTES.has(name), `attribute ${name} on <${node.tag}>`);
        if (name === "class") {
          for (const cls of value.split(/\s+/)) assert.ok(KEPT_CLASSES.has(cls), `class ${cls}`);
        }
        if (name === "style") assert.equal(value, "display:none");
      }
    }
  });

  test(`${file}: every text is placeholder text`, () => {
    for (const node of nodes.filter((n) => n.type === "text" && n.text.trim())) {
      assert.equal(node.text.trim(), "lorem ipsum");
    }
  });

  test(`${file}: no identity-bearing attribute survives`, () => {
    assert.doesNotMatch(html, /\s(email|title|jslog|data-hovercard-id|data-legacy-message-id|id|href|src)=/);
  });
}
