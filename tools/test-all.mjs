#!/usr/bin/env node
// Runs every module's Node checks and prints one line per module.
//
//   node tools/test-all.mjs                    every module
//   node tools/test-all.mjs primal-auras ...   only these modules
//
// Browser checks (tests/browser) need Foundry and Playwright, so they're left to each module's own
// instructions. Exit code is 0 only when every check passed.
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv.slice(2);
const modules = readdirSync(root)
  .filter(d => existsSync(join(root, d, "module.json")))
  .filter(d => !only.length || only.includes(d))
  .sort();

const testFiles = dir => {
  const files = [];
  for (const sub of ["tests", "test", "tests/unit"]) {
    const full = join(dir, sub);
    if (!existsSync(full) || !statSync(full).isDirectory()) continue;
    for (const f of readdirSync(full).sort()) if (f.endsWith(".test.mjs")) files.push(join(sub, f));
  }
  return files;
};

let failed = [];
for (const mod of modules) {
  const dir = join(root, mod);
  let runs;
  if (existsSync(join(dir, "tests/run-all.sh"))) runs = [["bash", ["tests/run-all.sh", "--unit"]]];
  else runs = testFiles(dir).map(f => [process.execPath, ["--test", "--test-reporter=dot", f]]);
  if (!runs.length) { console.log(`  ${mod.padEnd(28)} no automated checks yet`); continue; }
  const bad = [];
  for (const [cmd, args] of runs) {
    const r = spawnSync(cmd, args, { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) bad.push({ what: args.at(-1) === "--unit" ? "tests/run-all.sh" : args.at(-1), out: (r.stdout + r.stderr).trim() });
  }
  if (bad.length) {
    failed.push(mod);
    console.log(`  ${mod.padEnd(28)} FAILED: ${bad.map(b => b.what).join(", ")}`);
    for (const b of bad) console.log(b.out.split("\n").slice(-25).map(l => "      " + l).join("\n"));
  } else console.log(`  ${mod.padEnd(28)} ${runs.length} file(s) passed`);
}
console.log(failed.length ? `\nFailed: ${failed.join(", ")}` : "\nEverything passed.");
process.exit(failed.length ? 1 : 0);
