/**
 * Derives build/chrome from src/.
 *
 * Chrome rejects nothing in the shared manifest except the gecko settings, which
 * are removed here rather than duplicating the manifest. There is no background
 * in v1, so there is no service_worker/scripts pair to split.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shippableFilter } from "./package-filter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "build", "chrome");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true, filter: shippableFilter });

const path = join(OUT, "manifest.json");
const manifest = JSON.parse(readFileSync(path, "utf8"));

delete manifest.browser_specific_settings;
if (manifest.background) delete manifest.background.scripts;

writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
console.log("build/chrome ready (no gecko settings)");
