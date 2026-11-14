/**
 * Checks for the weather rules that apply (scripts/rules.mjs), run with `node tests/rules.test.mjs`: which scenes are
 * outdoors, what each rule does to rolls, and the hourly reminder in extreme heat or cold.
 */
import assert from "node:assert/strict";
import { fakeI18n } from "./helpers.mjs";

const settings = { rollRules: true, sceneEffects: "marked" };
const i18n = fakeI18n();
globalThis.game = { i18n, settings: { get: (m, k) => settings[k] } };
globalThis.foundry = { utils: { escapeHTML: s => String(s).replace(/</g, "&lt;") } };
const Rules = await import(new URL("../scripts/rules.mjs", import.meta.url).href);

const scene = flag => ({ name: "Old Town", getFlag: (m, k) => (k === "sceneWeather" ? flag : undefined) });
const day = (condition, extra = {}) => ({ condition, high: 70, low: 50, wind: "light", ...extra });
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

check("outdoors: marked scenes, or every scene not turned off when the weather shows on all of them", () => {
  assert.equal(Rules.isOutdoors(scene(true)), true);
  assert.equal(Rules.isOutdoors(scene(undefined)), false);
  assert.equal(Rules.isOutdoors(scene(false)), false);
  settings.sceneEffects = "all";
  assert.equal(Rules.isOutdoors(scene(undefined)), true);
  assert.equal(Rules.isOutdoors(scene(false)), false);
  settings.sceneEffects = "marked";
  assert.equal(Rules.isOutdoors(null), false);
});

check("heavy rain: Disadvantage on Perception, for sight and for hearing", () => {
  const mods = Rules.rollModifiers(scene(true), day("heavyRain"));
  assert.deepEqual(mods.perception.map(p => `${p.id}:${p.sense}`), ["heavyPrecipitation:sight", "heavyRain:hearing"]);
  assert.equal(mods.perception[1].reason, "Heavy rain (if it relies on hearing)");
  assert.deepEqual(mods.rangedWeaponAttack, []);
});

check("strong wind: ranged weapon attacks too", () => {
  const mods = Rules.rollModifiers(scene(true), day("clear", { wind: "gale" }));
  assert.deepEqual(mods.rangedWeaponAttack.map(r => r.reason), ["Strong wind"]);
  assert.deepEqual(mods.perception.map(p => p.id), ["strongWind"]);
});

check("fog and blowing sand: sight", () => {
  assert.deepEqual(Rules.rollModifiers(scene(true), day("fog")).perception.map(p => p.sense), ["sight"]);
  assert.deepEqual(Rules.rollModifiers(scene(true), day("duststorm")).perception.map(p => p.sense), ["sight"]);
});

check("indoors, clear weather, or the setting off: nothing", () => {
  assert.deepEqual(Rules.rollModifiers(scene(false), day("heavyRain")), { perception: [], rangedWeaponAttack: [] });
  assert.deepEqual(Rules.rollModifiers(scene(true), day("clear")), { perception: [], rangedWeaponAttack: [] });
  assert.deepEqual(Rules.rollModifiers(scene(true), null), { perception: [], rangedWeaponAttack: [] });
  settings.rollRules = false;
  assert.deepEqual(Rules.rollModifiers(scene(true), day("heavyRain")), { perception: [], rangedWeaponAttack: [] });
  settings.rollRules = true;
});

check("hours passed on the clock", () => {
  assert.equal(Rules.hoursPassed(3600 * 5 + 10, 20, 3600), 1);
  assert.equal(Rules.hoursPassed(3600 * 5 + 30, 20, 3600), 0);
  assert.equal(Rules.hoursPassed(3600 * 13, 3600 * 8, 3600), 8);
  assert.equal(Rules.hoursPassed(3600 * 13, -3600, 3600), 0, "moving the clock back doesn't count");
});

check("the hourly reminder in extreme cold, outdoors only", () => {
  const cold = day("snow", { high: -5, low: -20 });
  const one = Rules.hourlyReminder(scene(true), cold, 1);
  assert.match(one, /An hour has passed outdoors on Old Town/);
  assert.match(one, /Extreme cold/);
  assert.match(Rules.hourlyReminder(scene(true), cold, 8), /8 hours have passed/);
  assert.equal(Rules.hourlyReminder(scene(false), cold, 1), null);
  assert.equal(Rules.hourlyReminder(scene(true), cold, 0), null);
  assert.equal(Rules.hourlyReminder(scene(true), day("clear"), 3), null);
  assert.match(Rules.hourlyReminder(scene(true), day("clear", { high: 110, low: 85 }), 1), /Extreme heat/);
});

check("every text it uses is in the language file", () => {
  assert.deepEqual([...i18n.missing], []);
});
console.log(`\nrules: ${passed} checks passed`);
