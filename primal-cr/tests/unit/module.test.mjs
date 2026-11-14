import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const json = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const manifest = json("module.json");
const lang = json("lang/en.json");

function flatten(object, prefix = "", out = {}) {
  for ( const [key, value] of Object.entries(object) ) {
    const full = prefix ? `${prefix}.${key}` : key;
    if ( value && typeof value === "object" ) flatten(value, full, out);
    else out[full] = value;
  }
  return out;
}
const strings = flatten(lang);
const scripts = fs.readdirSync(path.join(root, "scripts")).filter(f => f.endsWith(".mjs"));
const source = Object.fromEntries(scripts.map(f => [f, fs.readFileSync(path.join(root, "scripts", f), "utf8")]));

test("manifest: every file it names exists", () => {
  assert.equal(manifest.id, "primal-cr");
  for ( const file of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(l => l.path)] ) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
  }
});

test("scripts: every local import resolves", () => {
  for ( const [file, text] of Object.entries(source) ) {
    for ( const match of text.matchAll(/from "(\.\/[^"]+)"/g) ) {
      assert.ok(fs.existsSync(path.join(root, "scripts", match[1])), `${file} imports ${match[1]}`);
    }
  }
});

test("lang: every key written out in the scripts exists", () => {
  for ( const [file, text] of Object.entries(source) ) {
    for ( const match of text.matchAll(/"(PRIMAL_CR\.[A-Za-z0-9_.]+[A-Za-z0-9_])"/g) ) {
      const key = match[1];
      const found = key in strings || Object.keys(strings).some(k => k.startsWith(`${key}.`));
      assert.ok(found, `${file} uses ${key}`);
    }
  }
});

test("lang: every setting has a name and a hint, and every level a name, hint and sentence", async () => {
  const { SETTINGS } = await import("../../scripts/constants.mjs");
  const { LEVELS } = await import("../../scripts/verdict.mjs");
  for ( const level of LEVELS ) {
    assert.ok(Object.keys(strings).some(k => k.startsWith("PRIMAL_CR.Level.") && k.toLowerCase().endsWith(level)), `Level ${level}`);
  }
  assert.ok(Object.keys(SETTINGS).length > 0);
  assert.ok(Object.keys(strings).some(k => k.startsWith("PRIMAL_CR.Settings.")));
});

test("lang: no string is empty and no key is a prefix of another", () => {
  const keys = Object.keys(strings);
  for ( const key of keys ) {
    assert.ok(String(strings[key]).trim().length > 0, `${key} is empty`);
    assert.ok(!keys.some(other => other.startsWith(`${key}.`)), `${key} is both a string and a group`);
  }
});
