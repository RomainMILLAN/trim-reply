import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./load-core.js";
import { install } from "./fake-platform.js";
import { installDocument, Event, MouseEvent } from "./fake-dom.js";

const g = await loadCore();
const { SettingsForm, Settings } = g;

const ALL = ["auto", "mode", "threshold", "bar", "storage", "counter", "access"];

async function mountForm({ stored, count, granted = true, request } = {}) {
  const api = install(g, { granted });
  if (request) api.permissions.request = request;
  if (stored) await api.storage.local.set({ settings: stored });
  if (count !== undefined) await api.storage.local.set({ trimmedReplies: count });
  const doc = installDocument();
  const root = doc.createElement("div");
  doc.body.append(root);
  const ctx = await SettingsForm.mount(root, ALL);
  const $ = (sel) => root.querySelector(sel);
  return { api, root, ctx, $ };
}

const change = (input) => input.dispatchEvent(new Event("change", { bubbles: true }));
const tick = () => new Promise((r) => setTimeout(r, 0));
const saved = async (api, area = "local") => Settings.from((await api.storage[area].get("settings")).settings);

function choose(root, input) {
  for (const other of root.querySelectorAll(`input[name="${input.getAttribute("name")}"]`)) other.checked = false;
  input.checked = true;
  change(input);
}

test("the options page mounts every section, in order", async () => {
  const { root } = await mountForm();
  const ids = Array.from(root.querySelectorAll("section")).map((s) => s.getAttribute("id"));
  assert.deepEqual(ids, ALL.map((n) => `section-${n}`));
});

test("controls start from the stored settings", async () => {
  const { $ } = await mountForm({ stored: { auto: false, rules: { keep: "repliedMessage", threshold: 5 }, display: { bar: false } } });
  assert.equal($("#auto").checked, false);
  assert.equal($("#keep-repliedMessage").checked, true);
  assert.equal($("#keep-nothing").checked, false);
  assert.equal($("#threshold").value, "5");
  assert.equal($("#bar").checked, false);
  assert.equal($("#area-local").checked, true);
});

test("switching auto off saves it", async () => {
  const { api, $ } = await mountForm();
  $("#auto").checked = false;
  change($("#auto"));
  await tick();
  assert.equal((await saved(api)).auto, false);
});

test("choosing the keep mode saves it", async () => {
  const { api, root, $ } = await mountForm();
  choose(root, $("#keep-repliedMessage"));
  await tick();
  assert.equal((await saved(api)).rules.keep, "repliedMessage");
});

const typeInto = (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

test("the threshold is saved while typing, without waiting for the field to lose focus", async () => {
  const { api, $ } = await mountForm();
  typeInto($("#threshold"), "1");
  await tick();
  assert.equal((await saved(api)).rules.threshold, 1, "switching to Gmail does not blur the field");
});

test("a partial or out-of-range threshold is never saved while typing", async () => {
  const { api, $ } = await mountForm({ stored: { rules: { threshold: 3 } } });
  for (const value of ["", "0", "500", "1.5"]) {
    typeInto($("#threshold"), value);
    await tick();
    assert.equal((await saved(api)).rules.threshold, 3, `"${value}"`);
  }
});

test("leaving the field shows the value actually kept", async () => {
  const { api, $ } = await mountForm({ stored: { rules: { threshold: 3 } } });
  $("#threshold").value = "500";
  change($("#threshold"));
  await tick(); await tick();
  assert.equal($("#threshold").value, "3");
  assert.equal((await saved(api)).rules.threshold, 3);
  $("#threshold").value = "7";
  change($("#threshold"));
  await tick(); await tick();
  assert.equal($("#threshold").value, "7");
  assert.equal((await saved(api)).rules.threshold, 7);
});

test("masking the bar saves it, and keeps the rest untouched", async () => {
  const { api, $ } = await mountForm({ stored: { auto: false } });
  $("#bar").checked = false;
  change($("#bar"));
  await tick();
  const s = await saved(api);
  assert.equal(s.display.bar, false);
  assert.equal(s.auto, false);
});

test("moving to sync copies the settings first, then switches; later saves go to sync", async () => {
  const { api, root, $ } = await mountForm({ stored: { auto: false } });
  choose(root, $("#area-sync"));
  await tick(); await tick();
  assert.equal((await api.storage.local.get("storageArea")).storageArea, "sync");
  assert.equal((await saved(api, "sync")).auto, false);
  $("#auto").checked = true;
  change($("#auto"));
  await tick(); await tick();
  assert.equal((await saved(api, "sync")).auto, true);
});

test("the counter shows the stored number", async () => {
  const { $ } = await mountForm({ count: 12 });
  assert.match($("#count").textContent, /12/);
});

test("with access to Gmail, no button and no warning", async () => {
  const { $ } = await mountForm({ granted: true });
  assert.equal($("#section-access button").hasAttribute("hidden"), true);
  assert.equal($("#section-access .status").classList.contains("warn"), false);
});

test("without access, a warning and a button that asks the browser", async () => {
  let asked = 0;
  const { $ } = await mountForm({ granted: false, request: async () => { asked += 1; return true; } });
  const button = $("#section-access button");
  assert.equal(button.hasAttribute("hidden"), false);
  assert.equal($("#section-access .status").classList.contains("warn"), true);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await tick(); await tick();
  assert.equal(asked, 1);
  assert.equal(button.hasAttribute("hidden"), true);
});

test("a refused request is explained, never swallowed", async () => {
  const { $ } = await mountForm({ granted: false, request: async () => { throw new Error("not optional"); } });
  $("#section-access button").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await tick(); await tick();
  assert.match($("#section-access .status").textContent, /refused/);
});
