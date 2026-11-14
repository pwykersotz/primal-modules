// The sharing package: tools/package.mjs builds a valid, complete, reproducible module.zip.
//   node package.mjs <path to scripts/primal-status.js>
import { readFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";

const mod = resolve(process.argv[2]);
const root = dirname(dirname(mod));
const out = join(root, "tests", "out", "package");
const ok = (label, cond) => console.log((cond ? "PASS " : "FAIL ") + label);

rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const run = (...extra) => spawnSync(process.execPath, [join(root, "tools", "package.mjs"), "--out", out, ...extra], { encoding: "utf8" });
const first = run("--repo", "someone/primal-status");
ok("the packaging script runs", first.status === 0);
if (first.status !== 0) { console.log(first.stderr); process.exit(1); }

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

/** Read a zip: every entry's name and contents, checking sizes and CRCs as it goes. */
function readZip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10), cdOffset = buf.readUInt32LE(end + 16);
  const files = new Map(); let p = cdOffset, sound = true;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) { sound = false; break; }
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(local + 26), lxlen = buf.readUInt16LE(local + 28);
    const raw = buf.subarray(local + 30 + lnlen + lxlen, local + 30 + lnlen + lxlen + csize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    if (data.length !== size || crc32(data) !== crc || buf.readUInt32LE(local) !== 0x04034b50) sound = false;
    files.set(name, data);
    p += 46 + nlen + xlen + clen;
  }
  return { files, sound };
}

const zipBuf = readFileSync(join(out, "module.zip"));
const { files, sound } = readZip(zipBuf);
const names = [...files.keys()];
ok(`a valid zip: every entry's size and checksum match (${names.length} files)`, sound && names.length > 20);
ok("module.json is at the top of the zip (Foundry unpacks it into modules/primal-status/)", names[0] === "module.json");
const manifest = JSON.parse(files.get("module.json").toString("utf8"));
const source = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
ok("same ID and version as module.json", manifest.id === "primal-status" && manifest.version === source.version);
ok("install and update links for GitHub releases", manifest.manifest === "https://github.com/someone/primal-status/releases/latest/download/module.json"
  && manifest.download === `https://github.com/someone/primal-status/releases/download/v${source.version}/module.zip` && manifest.url === "https://github.com/someone/primal-status");
ok("the module.json beside the zip is the same one", readFileSync(join(out, "module.json"), "utf8") === files.get("module.json").toString("utf8"));
const needed = [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(l => l.path), "README.md", "CHANGELOG.md", "images/grapple-hand.webp", "images/fx/clumsy-dagger.webp", "images/fx/enfeebled-barbell.webp", "images/fx/enfeebled-sweat.webp", "images/fx/dazed-bird-up.webp", "images/fx/dazed-bird-down.webp",
  "images/fx/defenseless-shield.webp", "images/fx/defenseless-left.webp", "images/fx/defenseless-right.webp", "images/fx/defenseless-chips.webp", "images/fx/helpless-flag.webp",
  "images/fx/distracted-eye.webp", "images/fx/distracted-lids.webp", "images/fx/distracted-iris.webp", "images/fx/distracted-glint.webp",
  "images/fx/weakened-hilt.webp", "images/fx/weakened-blade.webp", "images/fx/weakened-wilted.webp", "images/fx/staggered-axe.webp", "images/fx/staggered-lock-open.webp", "images/fx/staggered-lock-shut.webp", "images/fx/sickened-fumes.webp", "images/fx/sickened-fly.webp", "images/fx/jinxed-cloud.webp", "images/fx/jinxed-d20.webp", "images/fx/immobilized-cuff.webp", "images/fx/immobilized-ball.webp", "images/fx/immobilized-link.webp"];
ok(`everything Foundry loads is in it (${needed.length} files)`, needed.every(n => files.has(n)));
ok("the script in the zip is the built one", files.get("scripts/primal-status.js").equals(readFileSync(mod)));
const assets = ["icons", "sounds"].flatMap(d => readdirSync(join(root, d)).map(f => `${d}/${f}`));
ok(`every icon and sound is included (${assets.length})`, assets.every(a => files.has(a)));
const script = readFileSync(mod, "utf8");
const drakkenheim = JSON.parse((script.match(/const DRAKKENHEIM_CONDITIONS = (\[[^\]]*\])/)?.[1] ?? "[]").replace(/'/g, '"'));
const icons = [...script.matchAll(/\/icons\/([a-z0-9-]+\.svg)/g)].map(m => `icons/${m[1]}`).concat(drakkenheim.map(id => `icons/${id.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}.svg`));   // drakkenheimIcon()
const cues = [...script.matchAll(/cue: "([a-z]+)"/g)].map(m => `sounds/${m[1]}.ogg`).concat(["sounds/heartbeat.ogg", "sounds/chime.ogg"]);
ok("every icon and sound the script names is in the zip", [...icons, ...cues].every(n => files.has(n)) && icons.length >= 6 && cues.length >= 12);
ok("no sources, tests, tools or repository files", !names.some(n => /^(src|tests|tools|\.git|\.github|node_modules|dist)\//.test(n) || n === "RELEASING.md"));
const again = run("--repo", "someone/primal-status");
ok("reproducible: packaging again gives the identical zip", again.status === 0 && readFileSync(join(out, "module.zip")).equals(zipBuf));
const plain = run();
const plainManifest = JSON.parse(readFileSync(join(out, "module.json"), "utf8"));
ok("without --repo: a zip for installing by hand, with no update links", plain.status === 0 && !plainManifest.manifest && !plainManifest.download);
const bad = run("--repo", "not a repo");
ok("a malformed --repo is refused", bad.status !== 0);
rmSync(out, { recursive: true, force: true });

// The language file, read the way Foundry reads it: dotted keys become nested objects, so a key
// can't also be the start of another key ("A.B" and "A.B.C"), or Foundry drops the whole file.
{
  const lang = JSON.parse(readFileSync(join(root, "lang", "en.json"), "utf8"));
  const keys = new Set(Object.keys(lang));
  const clashes = [...keys].filter(k => k.split(".").some((_, i, parts) => i > 0 && keys.has(parts.slice(0, i).join("."))));
  ok(`no language key is also the start of another (${clashes.join(", ") || "none"})`, clashes.length === 0);
  const expanded = {};
  let expandError = null;
  try {
    for (const [k, v] of Object.entries(lang)) {
      const parts = k.split("."); let o = expanded;
      parts.slice(0, -1).forEach(p => { if (typeof o[p] === "string") throw new Error(`${k} under a string`); o = o[p] ??= {}; });
      if (typeof o[parts.at(-1)] === "object") throw new Error(`${k} over an object`);
      o[parts.at(-1)] = v;
    }
  } catch (err) { expandError = err.message; }
  ok(`…so it expands into nested keys as Foundry does (${expandError ?? "fine"})`, !expandError);
  // Every key written out in full in the code is in the file
  const src = readdirSync(join(root, "src")).filter(f => f.endsWith(".js")).map(f => readFileSync(join(root, "src", f), "utf8")).join("\n");
  const used = new Set([...src.matchAll(/["'`](MIGHTYGUARD\.[A-Za-z0-9.]+[A-Za-z0-9])["'`]/g)].map(m => m[1]));
  const missing = [...used].filter(k => !keys.has(k));
  ok(`every language key the code names is in the file (${missing.join(", ") || "all there"})`, missing.length === 0);
}
