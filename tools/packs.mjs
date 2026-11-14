#!/usr/bin/env node
// Compendium packs, kept in the repository as one JSON file per entry instead of Foundry's database files.
//
//   node tools/packs.mjs unpack primal-classes [--from path/to/primal-classes]
//       Reads the module's packs/ (by default the one in this repository; --from reads an installed copy,
//       for example Data/modules/primal-classes after editing the compendiums in Foundry) and writes
//       primal-classes/src/packs/<pack>/*.json.
//   node tools/packs.mjs build primal-classes [--to path/to/primal-classes]
//       Builds packs/ from src/packs/ (into this repository by default). Foundry must not have the world
//       open while writing into an installed copy.
//
// Needs `npm install` once, for Foundry's own command line tools.
import { existsSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPack, compilePack } from "@foundryvtt/foundryvtt-cli";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [command, mod, ...rest] = process.argv.slice(2);
const option = name => { const i = rest.indexOf(name); return i >= 0 ? resolve(rest[i + 1]) : undefined; };
if (!["unpack", "build"].includes(command) || !mod || !existsSync(join(root, mod, "module.json"))) {
  console.error("Usage: node tools/packs.mjs unpack|build <module> [--from dir | --to dir]");
  process.exit(1);
}
const source = join(root, mod, "src", "packs");

if (command === "unpack") {
  const packs = join(option("--from") ?? join(root, mod), "packs");
  for (const name of readdirSync(packs).sort()) {
    const out = join(source, name);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    await extractPack(join(packs, name), out, { clean: true, log: false });
    console.log(`unpacked ${mod}/packs/${name} -> src/packs/${name}`);
  }
} else {
  const packs = join(option("--to") ?? join(root, mod), "packs");
  for (const name of readdirSync(source).sort()) {
    await compilePack(join(source, name), join(packs, name), { recursive: true, log: false });
    console.log(`built ${mod}/src/packs/${name} -> packs/${name}`);
  }
}
