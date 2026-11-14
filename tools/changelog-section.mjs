#!/usr/bin/env node
// Prints the CHANGELOG.md section for one version of a module, for release notes.
//   node tools/changelog-section.mjs primal-auras 1.2.0
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [id, version] = process.argv.slice(2);
const file = join(root, id, "CHANGELOG.md");
if (!existsSync(file)) { console.log(`${id} ${version}`); process.exit(0); }
const lines = readFileSync(file, "utf8").split("\n");
const start = lines.findIndex(l => /^#{1,3}\s/.test(l) && l.includes(version));
if (start < 0) { console.log(`${id} ${version}`); process.exit(0); }
const level = lines[start].match(/^#+/)[0].length;
let end = lines.findIndex((l, i) => i > start && new RegExp(`^#{1,${level}}\\s`).test(l));
if (end < 0) end = lines.length;
console.log(lines.slice(start + 1, end).join("\n").trim() || `${id} ${version}`);
