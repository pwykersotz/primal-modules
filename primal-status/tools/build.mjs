#!/usr/bin/env node
// Builds scripts/primal-status.js (the single file Foundry loads) by joining src/*.js in name order.
//   node tools/build.mjs           write scripts/primal-status.js
//   node tools/build.mjs --check   check it's up to date with src/ (prints PASS or FAIL)
// Edit the files in src/, then build. Don't edit scripts/primal-status.js directly.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src"), out = join(root, "scripts", "primal-status.js");
const parts = readdirSync(srcDir).filter(f => f.endsWith(".js")).sort();
const banner = "// Primal Status: built by tools/build.mjs from the files in src/. Edit those, not this file.\n";
const built = banner + parts.map(f => `// ===== src/${f} =====\n` + readFileSync(join(srcDir, f), "utf8")).join("");

if (process.argv.includes("--check")) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current === built) { console.log(`PASS scripts/primal-status.js matches the ${parts.length} files in src/`); process.exit(0); }
  console.log("FAIL scripts/primal-status.js is out of date with src/ (run: node tools/build.mjs)");
  process.exit(1);
}
writeFileSync(out, built);
console.log(`Built scripts/primal-status.js from ${parts.length} files in src/ (${built.split("\n").length - 1} lines)`);
