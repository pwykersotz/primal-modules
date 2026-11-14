#!/usr/bin/env node
// Packages Primal Status for sharing: dist/module.json and dist/module.zip.
//
//   node tools/package.mjs                          zip for installing by hand (no update links)
//   node tools/package.mjs --repo owner/name        adds the links Foundry needs to install and update
//                                                    from GitHub releases (see RELEASING.md)
//   node tools/package.mjs --out some/folder        write somewhere other than dist/
//
// The zip holds only what Foundry loads (module.json, the built script, styles, language file,
// icons, images, sounds) plus the README and changelog; src/, tests/ and tools/ stay in the repository.
// It's reproducible: the same files always give the same zip.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const repo = option("--repo");
const outDir = resolve(option("--out") ?? join(root, "dist"));

if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error(`--repo should look like owner/name, not "${repo}"`);
  process.exit(1);
}

// The built script must match src/ before it's shared
const check = spawnSync(process.execPath, [join(root, "tools", "build.mjs"), "--check"], { encoding: "utf8" });
if (check.status !== 0) {
  console.error("scripts/primal-status.js is out of date with src/: run node tools/build.mjs first");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
const version = manifest.version;
if (repo) {
  const base = `https://github.com/${repo}`;
  Object.assign(manifest, {
    url: base,
    manifest: `${base}/releases/latest/download/module.json`,
    download: `${base}/releases/download/v${version}/module.zip`,
    bugs: `${base}/issues`,
    readme: `${base}/blob/main/README.md`,
    changelog: `${base}/blob/main/CHANGELOG.md`
  });
}
if ((manifest.authors ?? []).some(a => a?.name === "You")) console.warn("Note: module.json still lists the author as \"You\"; put your name there before sharing.");
const manifestText = JSON.stringify(manifest, null, 2) + "\n";

/** Files Foundry needs, as [path in the zip, contents]. */
function collect() {
  const files = new Map([["module.json", Buffer.from(manifestText)]]);
  const add = path => { const full = join(root, path); if (existsSync(full)) files.set(path.split(sep).join("/"), readFileSync(full)); };
  const addDir = dir => {
    const full = join(root, dir);
    if (!existsSync(full)) return;
    for (const name of readdirSync(full).sort()) {
      const path = join(dir, name);
      if (statSync(join(root, path)).isDirectory()) addDir(path); else add(path);
    }
  };
  for (const f of ["README.md", "CHANGELOG.md", "LICENSE", "LICENSE.md", "LICENSE.txt", "scripts/primal-status.js"]) add(f);
  for (const d of ["styles", "lang", "icons", "images", "sounds"]) addDir(d);
  // Everything module.json points at must be there
  const wanted = [...(manifest.esmodules ?? []), ...(manifest.scripts ?? []), ...(manifest.styles ?? []), ...(manifest.languages ?? []).map(l => l.path)];
  const missing = wanted.filter(p => !files.has(p));
  if (missing.length) { console.error(`module.json points at files that don't exist: ${missing.join(", ")}`); process.exit(1); }
  return [...files.entries()].sort(([a], [b]) => (a === "module.json" ? -1 : b === "module.json" ? 1 : a.localeCompare(b)));
}

/* ---------- a small zip writer (deflate, fixed timestamps) ---------- */
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

const entries = collect();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "module.json"), manifestText);
const archive = zip(entries);
writeFileSync(join(outDir, "module.zip"), archive);
console.log(`Packaged Primal Status ${version}: ${entries.length} files, ${(archive.length / 1024).toFixed(0)} KB`);
console.log(`  ${relative(process.cwd(), join(outDir, "module.zip"))}`);
console.log(`  ${relative(process.cwd(), join(outDir, "module.json"))}${repo ? ` (install link: ${manifest.manifest})` : " (no update links: add --repo owner/name for those)"}`);
