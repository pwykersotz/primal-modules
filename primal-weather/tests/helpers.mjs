/**
 * Shared bits for the checks: a seeded random number generator, and a small stand-in for Foundry's game.i18n that
 * reads lang/en.json.
 */
import { readFileSync } from "node:fs";

/** Random numbers from 0 to 1 that come out the same every run (mulberry32). */
export function seeded(seed=1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** lang/en.json as loaded. */
export const LANG = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));

/** Every key in the language file, flattened ("PRIMAL_WEATHER.Bar.Roll"). */
export function flatKeys(object=LANG, prefix="") {
  const keys = {};
  for ( const [key, value] of Object.entries(object) ) {
    const path = prefix ? `${prefix}.${key}` : key;
    if ( value && (typeof value === "object") ) Object.assign(keys, flatKeys(value, path));
    else keys[path] = value;
  }
  return keys;
}

/** A stand-in for game.i18n: missing keys come back as the key itself, as in Foundry, and are recorded. */
export function fakeI18n() {
  const strings = flatKeys();
  const missing = new Set();
  const localize = key => {
    if ( key in strings ) return strings[key];
    missing.add(key);
    return key;
  };
  return {
    missing,
    localize,
    format: (key, data={}) => localize(key).replace(/{(\w+)}/g, (m, k) => (k in data ? String(data[k]) : m))
  };
}
