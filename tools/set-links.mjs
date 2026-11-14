#!/usr/bin/env node
// Writes the install and update links into every module's module.json (or the ones named), for the version each
// is at now. Run it after raising a version; the Release workflow checks they match.
//   node tools/set-links.mjs [--repo owner/name] [module...]
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseLinks } from "./links.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const at = args.indexOf("--repo");
const repo = at >= 0 ? args.splice(at, 2)[1] : JSON.parse(readFileSync(join(root, "package.json"), "utf8")).repository;
if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) { console.error("Give --repo owner/name, or set repository in package.json"); process.exit(1); }
const modules = readdirSync(root).filter(d => existsSync(join(root, d, "module.json"))).filter(d => !args.length || args.includes(d));
for (const id of modules) {
  const path = join(root, id, "module.json");
  const raw = readFileSync(path, "utf8");
  const manifest = JSON.parse(raw);
  const links = releaseLinks(repo, id, manifest.version);
  if (!existsSync(join(root, id, "CHANGELOG.md"))) delete links.changelog;
  if (Object.entries(links).every(([k, v]) => manifest[k] === v)) continue;
  Object.assign(manifest, links);
  const indent = raw.match(/\n([ \t]+)"/)?.[1] ?? "  ";
  writeFileSync(path, JSON.stringify(manifest, null, indent) + "\n");
  console.log(`${id}: links for ${manifest.version}`);
}
