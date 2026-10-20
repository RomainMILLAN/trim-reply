/**
 * The invariants of the repository, checked on every run.
 *
 * Several promises this extension makes cannot be enforced by the browser:
 * the content script runs under GMAIL's CSP, not ours, so "no network" is only
 * true because nothing in src/ can reach the network. This file is that proof.
 * It scans the code WITHOUT ITS COMMENTS, with word boundaries, so a comment can
 * explain a rule without breaking it and `allocation` is not `location`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "../scripts/html-lite.mjs";
import { ORDER } from "./load-core.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [relative(SRC, full)];
  });
}
const FILES = walk(SRC);
const JS = FILES.filter((f) => f.endsWith(".js"));
const CSS = FILES.filter((f) => f.endsWith(".css"));
const HTML = FILES.filter((f) => f.endsWith(".html"));

/** The code without comments and without string contents of comments-in-strings. */
function codeOf(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}
const code = (f) => codeOf(readFileSync(join(SRC, f), "utf8"));

const manifest = json("src/manifest.json");

// —— manifest ——————————————————————————————————————————————

test("the only permission is storage; no host permission of any kind", () => {
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal("host_permissions" in manifest, false);
  assert.equal("optional_host_permissions" in manifest, false);
  assert.equal("optional_permissions" in manifest, false);
});

test("one content script, on mail.google.com only, top frame only", () => {
  assert.equal(manifest.content_scripts.length, 1);
  const [cs] = manifest.content_scripts;
  assert.deepEqual(cs.matches, ["https://mail.google.com/*"]);
  for (const key of ["all_frames", "match_about_blank", "match_origin_as_fallback", "world", "css"]) {
    assert.equal(key in cs, false, key);
  }
});

test("nothing is exposed to web pages and there is no background", () => {
  assert.equal("web_accessible_resources" in manifest, false);
  assert.equal("background" in manifest, false);
  assert.equal("externally_connectable" in manifest, false);
});

test("the extension pages CSP closes every network channel", () => {
  assert.equal(
    manifest.content_security_policy.extension_pages,
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; worker-src 'self'",
  );
});

test("Firefox: data collection declared as none, desktop only", () => {
  const gecko = manifest.browser_specific_settings.gecko;
  assert.deepEqual(gecko.data_collection_permissions, { required: ["none"] });
  assert.equal(gecko.strict_min_version, "140.0");
  assert.equal("gecko_android" in manifest.browser_specific_settings, false);
});

test("the manifest and package.json carry the same version", () => {
  assert.equal(manifest.version, json("package.json").version);
});

test("no runtime dependency, and every dev dependency pinned exactly", () => {
  const pkg = json("package.json");
  assert.equal("dependencies" in pkg, false);
  for (const [name, version] of Object.entries(pkg.devDependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, name);
  }
});

// —— no network, no dangerous sink ———————————————————————————

const NETWORK = [
  /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bEventSource\b/, /\bsendBeacon\b/,
  /\bimport\s*\(/, /\bSharedWorker\b/, /\bWorker\s*\(/, /(^|[^\w.])open\s*\(/, /\blocation\b/,
  /\.\s*(src|href|srcset|action|formAction|poster)\s*=[^=]/,
];
const SINKS = [
  /\binnerHTML\b/, /\bouterHTML\b/, /\binsertAdjacentHTML\b/, /\bdocument\s*\.\s*write/, /\bsetHTMLUnsafe\b/,
  /\bDOMParser\b/, /\bcreateContextualFragment\b/, /\bsrcdoc\b/, /\beval\s*\(/, /\bFunction\s*\(/,
  /javascript:/i, /\bset(Timeout|Interval)\s*\(\s*[`'"]/,
];

test("no network channel anywhere in the shipped JavaScript", () => {
  for (const f of JS) {
    for (const pattern of NETWORK) assert.doesNotMatch(code(f), pattern, `${f}: ${pattern}`);
  }
});

test("no HTML sink, no eval, no string timer anywhere in the shipped JavaScript", () => {
  for (const f of JS) {
    for (const pattern of SINKS) assert.doesNotMatch(code(f), pattern, `${f}: ${pattern}`);
  }
});

test("setAttribute only in ui/dom.js, whose attribute list is closed", () => {
  for (const f of JS.filter((f) => f !== "ui/dom.js")) {
    assert.doesNotMatch(code(f), /\.setAttribute\s*\(/, f);
  }
  assert.doesNotMatch(code("ui/dom.js"), /"(href|src|srcdoc|style|on\w+)"/);
});

test("the content script never logs and never builds an error message", () => {
  for (const f of JS.filter((f) => f.startsWith("mail/") || f.startsWith("content/"))) {
    assert.doesNotMatch(code(f), /\bconsole\s*\./, f);
    assert.doesNotMatch(code(f), /\bnew\s+Error\s*\(/, f);
    assert.doesNotMatch(code(f), /\bthrow\s+[`'"]/, f);
  }
});

test("stylesheets load nothing: no remote url(), no @import", () => {
  for (const f of CSS) {
    const css = readFileSync(join(SRC, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(css, /@import/i, f);
    for (const [, target] of css.matchAll(/url\(\s*['"]?([^'")]+)/gi)) {
      assert.doesNotMatch(target, /^(https?:|\/\/|data:|blob:)/i, `${f}: url(${target})`);
    }
  }
});

test("pages load local scripts only, and link out to the author's site only", () => {
  for (const f of HTML) {
    const nodes = [];
    const visit = (list) => { for (const n of list) { nodes.push(n); if (n.children) visit(n.children); } };
    visit(parseHTML(readFileSync(join(SRC, f), "utf8")));
    for (const n of nodes.filter((n) => n.type === "element")) {
      const attrs = Object.fromEntries(n.attrs);
      assert.equal(Object.keys(attrs).some((a) => a.startsWith("on")), false, `${f}: inline handler`);
      if (n.tag === "script") {
        assert.ok(attrs.src && !/^(https?:|\/\/)/.test(attrs.src), `${f}: script ${attrs.src}`);
        assert.equal(n.children.length, 0, `${f}: inline script`);
      }
      if (n.tag === "style") assert.fail(`${f}: inline <style>`);
      if (attrs.style !== undefined) assert.fail(`${f}: inline style attribute`);
      if (attrs.href && /^(https?:|\/\/)/.test(attrs.href)) {
        assert.equal(attrs.href, "https://romainmillan.fr/", `${f}: external link`);
        assert.equal(attrs.target, undefined);
      }
      if (attrs.src && n.tag !== "script") assert.doesNotMatch(attrs.src, /^(https?:|\/\/)/, `${f}: remote src`);
    }
  }
});

test("pages carry no hard-coded visible text other than the product and author names", () => {
  const allowed = new Set(["TrimReply", "romainmillan.fr"]);
  for (const f of HTML) {
    const texts = [];
    const visit = (list) => {
      for (const n of list) {
        if (n.type === "text" && n.text.trim()) texts.push(n.text.trim());
        if (n.type === "element" && n.tag !== "script" && n.tag !== "svg") visit(n.children);
      }
    };
    visit(parseHTML(readFileSync(join(SRC, f), "utf8")));
    for (const text of texts) assert.ok(allowed.has(text), `${f}: "${text}"`);
  }
});

// —— i18n ——————————————————————————————————————————————————————

test("English and French define exactly the same keys and placeholders", () => {
  const en = json("src/_locales/en/messages.json");
  const fr = json("src/_locales/fr/messages.json");
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en)) {
    assert.deepEqual(Object.keys(fr[key].placeholders || {}), Object.keys(en[key].placeholders || {}), key);
  }
});

test("every key the code asks for exists, and every key exists for a reason", () => {
  const en = json("src/_locales/en/messages.json");
  const used = new Set();
  for (const f of JS) {
    for (const [, key] of readFileSync(join(SRC, f), "utf8").matchAll(/\bt\(\s*"([A-Za-z@_]+)"/g)) used.add(key);
  }
  const fromManifest = JSON.stringify(manifest).match(/__MSG_(\w+)__/g).map((m) => m.slice(6, -2));
  for (const key of fromManifest) used.add(key);
  for (const key of used) {
    if (key.startsWith("@@")) continue;
    assert.ok(key in en, `missing message: ${key}`);
  }
  for (const key of Object.keys(en)) assert.ok(used.has(key), `unused message: ${key}`);
});

// —— load order ————————————————————————————————————————————

const SHARED_PREFIX = ORDER.filter((f) => f === "platform.js" || f.startsWith("core/"));
const scriptsOf = (f) => {
  const list = [];
  const visit = (nodes) => { for (const n of nodes) { if (n.tag === "script") list.push(Object.fromEntries(n.attrs).src); if (n.children) visit(n.children); } };
  visit(parseHTML(readFileSync(join(SRC, f), "utf8")));
  return list;
};
const SURFACES = {
  content: manifest.content_scripts[0].js,
  options: scriptsOf("options.html"),
  popup: scriptsOf("popup.html"),
};
// Entry points start the surface on load; the test loader leaves them out on purpose.
const ENTRY = new Set(["content/boot-gmail.js", "options.js", "popup.js"]);

test("every surface starts with the same prefix: platform.js, then core/ in the same order", () => {
  for (const [name, list] of Object.entries(SURFACES)) {
    assert.deepEqual(list.slice(0, SHARED_PREFIX.length), SHARED_PREFIX, name);
  }
});

test("every surface loads its files in the order the tests load them", () => {
  for (const [name, list] of Object.entries(SURFACES)) {
    const tested = list.filter((f) => !ENTRY.has(f));
    const positions = tested.map((f) => ORDER.indexOf(f));
    assert.ok(positions.every((p) => p >= 0), `${name}: a file the tests never load`);
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `${name}: order differs from test/load-core.js`);
    assert.equal(ENTRY.has(list[list.length - 1]), true, `${name}: the entry point comes last`);
  }
});

test("every listed file exists, and every shipped script is loaded somewhere", () => {
  const loaded = new Set(Object.values(SURFACES).flat());
  for (const f of loaded) assert.ok(existsSync(join(SRC, f)), f);
  for (const f of JS) assert.ok(loaded.has(f), `orphan script: ${f}`);
});

// —— provenance and consistency ———————————————————————————————

test("the vendored signature names its upstream commit", () => {
  assert.match(read("src/ui/author-signature.css"),
    /^\/\*!\n \* Vendored from github\.com\/RomainMILLAN\/Romain-MILLAN-Tag@[0-9a-f]{40}\n/);
});

test("the icon's brand colour is the pages' --brand", async () => {
  const { BRAND } = await import("../scripts/make-icons.mjs");
  const hex = "#" + BRAND.map((c) => c.toString(16).padStart(2, "0")).join("");
  assert.match(read("src/ui/tokens.css"), new RegExp(`--brand: ${hex};`));
});

// —— workflows ——————————————————————————————————————————————

const WORKFLOWS = [".github/workflows/ci.yml", ".github/workflows/release.yml"];

test("every action is pinned to a full commit SHA", () => {
  for (const f of WORKFLOWS) {
    for (const [, ref] of read(f).matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
      assert.match(ref, /@[0-9a-f]{40}$/, `${f}: ${ref}`);
    }
  }
});

test("workflows grant nothing by default", () => {
  for (const f of WORKFLOWS) assert.match(read(f), /^permissions: \{\}$/m, f);
});

test("CI never sees a secret: a fork pull request runs it with untrusted code", () => {
  assert.doesNotMatch(read(".github/workflows/ci.yml").replace(/#.*$/gm, ""), /secrets\./);
});

test("in the release, secrets reach only the steps that need them, behind the protected environment", () => {
  const release = read(".github/workflows/release.yml").replace(/#.*$/gm, "");
  const publish = release.slice(release.indexOf("  publish:"));
  assert.match(publish, /environment: release/);
  assert.doesNotMatch(release.slice(0, release.indexOf("  publish:")), /secrets\./, "the build job holds no secret");
  for (const line of publish.split("\n").filter((l) => l.includes("secrets."))) {
    assert.match(line, /^\s+(HAS_AMO_CREDENTIALS|WEB_EXT_API_KEY|WEB_EXT_API_SECRET|CWS_\w+): \$\{\{ secrets\./, line.trim());
  }
});

test("installs never run dependency scripts, and never rewrite the lock file", () => {
  for (const f of WORKFLOWS) {
    for (const [line] of read(f).replace(/#.*$/gm, "").matchAll(/^.*\byarn install\b.*$/gm)) {
      assert.match(line, /--frozen-lockfile/, `${f}: ${line.trim()}`);
      assert.match(line, /--ignore-scripts/, `${f}: ${line.trim()}`);
    }
    assert.doesNotMatch(read(f).replace(/#.*$/gm, ""), /\bnpm (ci|install)\b/, f);
  }
});

test("the Chrome Web Store gets a draft, never an automatic publication", () => {
  assert.doesNotMatch(read(".github/workflows/release.yml").replace(/#.*$/gm, ""), /auto-publish/);
});
