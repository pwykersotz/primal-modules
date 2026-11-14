#!/usr/bin/env node
// Packages one module for installing or for a GitHub release: dist/<module>/module.json and
// dist/<module>/<module>.zip.
//
//   node tools/package.mjs primal-auras                       zip for installing by hand
//   node tools/package.mjs primal-auras --repo owner/name     also sets the links Foundry uses to install
//                                                             and update it from this repository
//   node tools/package.mjs --all [--repo owner/name]          every module
//
// The zip holds what Foundry loads, plus README, CHANGELOG and LICENSE. tests/, test/, tools/, src/ and
// other development files stay in the repository. Compendium packs are built from src/packs/ first.
// The same files always give the same zip.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync, mkdtempSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { releaseLinks } from "./links.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const repo = option("--repo");
const outRoot = resolve(option("--out") ?? join(root, "dist"));
if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) { console.error(`--repo should look like owner/name, not "${repo}"`); process.exit(1); }

const allModules = readdirSync(root).filter(d => existsSync(join(root, d, "module.json"))).sort();
const wanted = args.includes("--all") ? allModules : args.filter(a => !a.startsWith("--") && allModules.includes(a));
if (!wanted.length) { console.error("Usage: node tools/package.mjs <module>... | --all [--repo owner/name] [--out dir]"); process.exit(1); }

/** Development files and folders that never go in a zip. */
const SKIP_DIRS = new Set(["tests", "test", "tools", "src", "node_modules", "dist", ".github", ".git"]);
const SKIP_FILES = new Set(["RELEASING.md", ".gitignore", ".gitattributes", "package.json", "package-lock.json", "LOCK", "LOG", "LOG.old"]);
const SKIP_EXT = [".zip", ".tar.gz", ".tgz"];

function packageModule(id) {
  const dir = join(root, id);
  const manifest = JSON.parse(readFileSync(join(dir, "module.json"), "utf8"));
  if (manifest.id !== id) throw new Error(`${id}/module.json has id "${manifest.id}"; the folder and id must match`);
  if (repo) Object.assign(manifest, releaseLinks(repo, id, manifest.version));

  // Primal Status's script is built from src/: it must be up to date
  if (existsSync(join(dir, "tools", "build.mjs"))) {
    const check = spawnSync(process.execPath, [join(dir, "tools", "build.mjs"), "--check"], { encoding: "utf8" });
    if (check.status !== 0) throw new Error(`${id}: the built script is out of date with src/; run node ${id}/tools/build.mjs`);
  }

  const files = new Map([["module.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n")]]);
  const walk = (base, rel = "", builtPacks = false) => {
    for (const name of readdirSync(join(base, rel)).sort()) {
      const path = rel ? `${rel}/${name}` : name;
      const full = join(base, path);
      if (statSync(full).isDirectory()) {
        if (!rel && SKIP_DIRS.has(name)) continue;
        if (!rel && name === "packs" && !builtPacks && existsSync(join(dir, "src", "packs"))) continue;   // built below
        walk(base, path, builtPacks);
      } else if (path !== "module.json" && !SKIP_FILES.has(name) && !SKIP_EXT.some(e => name.endsWith(e))) {
        files.set(path, readFileSync(full));
      }
    }
  };
  walk(dir);

  // Compendium packs: built fresh from src/packs/
  if (existsSync(join(dir, "src", "packs"))) {
    const tmp = mkdtempSync(join(tmpdir(), `${id}-packs-`));
    const built = spawnSync(process.execPath, [join(root, "tools", "packs.mjs"), "build", id, "--to", tmp], { encoding: "utf8" });
    if (built.status !== 0) throw new Error(`${id}: building packs failed (run npm install first?)\n${built.stderr}`);
    walk(tmp, "", true);
    rmSync(tmp, { recursive: true, force: true });
  }

  // Everything module.json points at must be in the zip
  const needed = [...(manifest.esmodules ?? []), ...(manifest.scripts ?? []), ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map(l => l.path), ...(manifest.packs ?? []).map(p => `${p.path}/CURRENT`)];
  const missing = needed.filter(p => !files.has(p));
  if (missing.length) throw new Error(`${id}: module.json points at files that aren't there: ${missing.join(", ")}`);

  const entries = [...files.entries()].sort(([a], [b]) => (a === "module.json" ? -1 : b === "module.json" ? 1 : a.localeCompare(b)));
  const out = join(outRoot, id);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "module.json"), files.get("module.json"));
  const archive = zip(entries);
  writeFileSync(join(out, `${id}.zip`), archive);
  console.log(`${id} ${manifest.version}: ${entries.length} files, ${(archive.length / 1024).toFixed(0)} KB -> ${relative(process.cwd(), out)}`);
}

/* ---------- a small zip writer (deflate, fixed timestamps), from Primal Status ---------- */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zip(entries) {
  const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1;   // 1980-01-01 00:00, so builds are identical
  const chunks = [], central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const packed = deflateRawSync(data, { level: 9 });
    const stored = packed.length >= data.length;
    const body = stored ? data : packed;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8); local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE((3 << 8) | 20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(stored ? 0 : 8, 10); cen.writeUInt16LE(DOS_TIME, 12); cen.writeUInt16LE(DOS_DATE, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(0, 30); cen.writeUInt32LE(0, 34); cen.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

let failed = false;
for (const id of wanted) {
  try { packageModule(id); } catch (err) { failed = true; console.error(err.message); }
}
process.exit(failed ? 1 : 0);
