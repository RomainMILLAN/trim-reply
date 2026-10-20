/**
 * Derives build/firefox from src/.
 *
 * Mozilla's addons-linter rejects background.service_worker. There is no
 * background in v1; the guard stays so that adding one later (phase 2) cannot
 * ship a service_worker to Firefox by accident.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shippableFilter } from "./package-filter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "build", "firefox");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true, filter: shippableFilter });

const path = join(OUT, "manifest.json");
const manifest = JSON.parse(readFileSync(path, "utf8"));

if (manifest.background) {
  delete manifest.background.service_worker;
  if (!manifest.background.scripts) {
    throw new Error("a Firefox background must define background.scripts");
  }
}

writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
console.log("build/firefox ready");
