import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { FakeRoll, flatKeys } from "./helpers.mjs";

// Settings aren't registered in the checks, so every rule reads its default (on).
globalThis.game = { settings: { get() { throw new Error("not registered"); } } };
globalThis.Roll = FakeRoll;
globalThis.CONFIG = { DND5E: { healingTypes: { healing: {}, temphp: {} } }, Dice: {} };

const { capArmorClass } = await import("../scripts/armor.mjs");
const { halfDieFormula, onPreRollClassHitPoints } = await import("../scripts/hit-points.mjs");
const { maxOfFormula, maximumDamages, onPreCalculateDamage, saveExtreme } = await import("../scripts/saves.mjs");
const { isSpellAura, onOnceScope } = await import("../scripts/emanations.mjs");
const { hasMvp } = await import("../scripts/mvp.mjs");
const { makeQuickRestDialog, quickRestType, registerQuickRest } = await import("../scripts/quick-rest.mjs");
const { runFirst } = await import("../scripts/constants.mjs");

/* ---------- Armor Class ---------- */

test("AC above the cap comes down to it, AC at or under it is left alone", () => {
  const high = { value: 27 };
  assert.equal(capArmorClass(high, 24), true);
  assert.equal(high.value, 24);
  assert.equal(high.uncapped, 27);

  const low = { value: 18 };
  assert.equal(capArmorClass(low, 24), false);
  assert.equal(low.value, 18);

  const exact = { value: 24 };
  assert.equal(capArmorClass(exact, 24), false);

  const off = { value: 30 };
  assert.equal(capArmorClass(off, 0), false);
  assert.equal(off.value, 30);
  assert.equal(capArmorClass(undefined, 24), false);
});

/* ---------- Hit points ---------- */

test("half-die formulas: d6 is 1d3 + 3 and so on", () => {
  assert.equal(halfDieFormula(6), "1d3 + 3");
  assert.equal(halfDieFormula(8), "1d4 + 4");
  assert.equal(halfDieFormula(10), "1d5 + 5");
  assert.equal(halfDieFormula(12), "1d6 + 6");
  assert.equal(halfDieFormula(1), null);
  assert.equal(halfDieFormula(NaN), null);
});

test("the class hit point roll is swapped, including a minimum-roll formula from another module", () => {
  const item = { system: { hd: { denomination: "d8" } } };
  const plain = { formula: "1d8" };
  onPreRollClassHitPoints({}, item, plain);
  assert.equal(plain.formula, "1d4 + 4");

  const reroll = { formula: "1d8rr2" };
  onPreRollClassHitPoints({}, item, reroll);
  assert.equal(reroll.formula, "1d4 + 4");

  const other = { formula: "2d8kh" };
  onPreRollClassHitPoints({}, item, other);
  assert.equal(other.formula, "2d8kh", "a formula that isn't one hit die is left alone");

  const wrongDie = { formula: "1d10" };
  onPreRollClassHitPoints({}, item, wrongDie);
  assert.equal(wrongDie.formula, "1d10");

  // The range is right: 1d4 + 4 rolls 5 to 8 on a d8.
  assert.equal(new FakeRoll(plain.formula).evaluateSync({ maximize: true }).total, 8);
  assert.equal(new FakeRoll(plain.formula).evaluateSync().total, 5);
});

/* ---------- Saves ---------- */

const midiOptions = flags => ({ midi: { saved: false, saveMultiplier: 0.5, ...flags } });

test("Midi-QOL: which targets rolled a natural 20 or 1", () => {
  assert.equal(saveExtreme({}, midiOptions({ criticalSave: true })), "critical");
  assert.equal(saveExtreme({}, midiOptions({ fumbleSave: true })), "fumble");
  assert.equal(saveExtreme({}, midiOptions({})), null);
  assert.equal(saveExtreme({}, {}), null);
});

test("dnd5e alone: the actor's save from the usage message", () => {
  const actor = { id: "a1", uuid: "Actor.a1" };
  const other = { id: "b2", uuid: "Actor.b2" };
  const save = (who, roll) => ({ getAssociatedToken: () => ({ actor: who }), rolls: [roll] });
  const usage = {
    getAssociatedRolls: type => (type === "save") ? [
      save(other, { isCritical: true, isFumble: false }),
      save(actor, { isCritical: false, isFumble: true })
    ] : []
  };
  const damageMessage = { getOriginatingMessage: () => usage, rolls: [] };
  assert.equal(saveExtreme(actor, { originatingMessage: damageMessage }), "fumble");
  assert.equal(saveExtreme(other, { originatingMessage: damageMessage }), "critical");
  assert.equal(saveExtreme({ id: "c3" }, { originatingMessage: damageMessage }), null);
});

test("maximum damage from a formula, or from the damage message's rolls in the same order", () => {
  assert.equal(maxOfFormula("3d8 + 2"), 26);
  assert.equal(maxOfFormula("nonsense"), null);
  assert.deepEqual(maximumDamages([{ type: "fire", value: 7, formula: "2d6" }]), [12]);

  const rolls = [new FakeRoll("8d6", {}, { type: "fire" }), new FakeRoll("1d4", {}, { type: "cold" })];
  const options = { originatingMessage: { rolls } };
  assert.deepEqual(maximumDamages([{ type: "fire", value: 20 }, { type: "cold", value: 2 }], options), [48, 4]);
  // Entries that don't line up with the rolls are left as they are.
  assert.deepEqual(maximumDamages([{ type: "acid", value: 20 }, { type: "cold", value: 2 }], options), [null, 4]);
});

test("a natural 20 takes no damage, healing in the same roll still lands", () => {
  const damages = [{ type: "radiant", value: 14 }, { type: "healing", value: 5 }];
  const options = midiOptions({ criticalSave: true, saved: true });
  onPreCalculateDamage({}, damages, options);
  assert.equal(damages[0].value, 0);
  assert.equal(damages[0].active.multiplier, 0);
  assert.equal(damages[1].value, 5);
  assert.equal(options["primal-houserules"].save, "critical");
});

test("a natural 1 takes maximum damage and loses the save's reduction", () => {
  // With Midi-QOL: maximum from the formula, and Midi is told the save failed so it doesn't halve.
  const midiDamages = [{ type: "radiant", value: 9, formula: "3d8" }];
  const midi = midiOptions({ fumbleSave: true, saved: true });
  onPreCalculateDamage({}, midiDamages, midi);
  assert.equal(midiDamages[0].value, 24);
  assert.equal(midi.midi.saved, false);

  // Without it: maximum from the damage message, and dnd5e's half-on-save multiplier is put back to full.
  const actor = { id: "a1" };
  const usage = {
    getAssociatedRolls: () => [{ getAssociatedToken: () => ({ actor }), rolls: [{ isCritical: false, isFumble: true }] }]
  };
  const options = {
    multiplier: 0.5,
    originatingMessage: { getOriginatingMessage: () => usage, rolls: [new FakeRoll("8d6", {}, { type: "fire" })] }
  };
  const damages = [{ type: "fire", value: 28 }];
  onPreCalculateDamage(actor, damages, options);
  assert.equal(damages[0].value, 48);
  assert.equal(options.multiplier, 1);
});

test("ordinary saves and damage without a save are left alone", () => {
  const damages = [{ type: "fire", value: 10, formula: "3d6" }];
  const options = midiOptions({ saved: true });
  onPreCalculateDamage({}, damages, options);
  assert.equal(damages[0].value, 10);
  assert.equal(options.midi.saved, true);

  const plain = [{ type: "fire", value: 10 }];
  const none = { multiplier: 1 };
  onPreCalculateDamage({}, plain, none);
  assert.equal(plain[0].value, 10);
  assert.equal(none.multiplier, 1);
});

/* ---------- Emanations ---------- */

test("spell auras are once per round, other auras keep once per turn", () => {
  const actor = { items: [{ type: "spell", name: "Spirit Guardians" }, { type: "feat", name: "Burning Aura" }] };
  const source = { actor };

  const fromItem = { scope: "turn", entry: { sourceType: "item", item: { type: "spell" } }, aura: { name: "x" } };
  onOnceScope(fromItem);
  assert.equal(fromItem.scope, "round");

  const preset = { scope: "turn", entry: { sourceType: "token" }, aura: { name: "Spirit Guardians" }, source };
  onOnceScope(preset);
  assert.equal(preset.scope, "round");

  const feature = { scope: "turn", entry: { sourceType: "token" }, aura: { name: "Burning Aura" }, source };
  onOnceScope(feature);
  assert.equal(feature.scope, "turn");

  assert.equal(isSpellAura({ aura: { name: "spirit guardians (3rd level)" }, source }), true);
  assert.equal(isSpellAura({ aura: { name: "" }, source }), false);
});

/* ---------- MVP ---------- */

test("the MVP pip reads the actor flag", () => {
  assert.equal(hasMvp({ getFlag: (scope, key) => (scope === "primal-houserules") && (key === "mvp") }), true);
  assert.equal(hasMvp({ getFlag: () => undefined }), false);
  assert.equal(hasMvp(null), false);
});

/* ---------- Quick Break ---------- */

test("the Quick Break is registered first, recovers nothing and keeps the other rests", () => {
  class ShortRestDialog { static PARTS = { content: { template: "short.hbs" }, footer: { template: "f.hbs" } }; }
  const short = { label: "Short", dialogClass: ShortRestDialog };
  const long = { label: "Long" };
  globalThis.CONFIG.DND5E.restTypes = { short, long };
  registerQuickRest();
  const types = globalThis.CONFIG.DND5E.restTypes;
  assert.deepEqual(Object.keys(types), ["quick", "short", "long"]);
  assert.equal(types.short, short);
  const quick = types.quick;
  assert.equal(quick.duration.normal, 10);
  assert.equal(quick.recoverSpellSlotTypes.size, 0);
  assert.deepEqual(quick.recoverPeriods, []);
  assert.deepEqual(quick.expiryEvents, []);
  assert.ok(!quick.recoverHitPoints && !quick.recoverHitDice);
  assert.equal(quick.autoHD, false);
  assert.equal(Object.getPrototypeOf(quick.dialogClass), ShortRestDialog);
  assert.equal(quick.dialogClass.PARTS.content.template, "modules/primal-houserules/templates/quick-rest.hbs");
  assert.equal(quick.dialogClass.PARTS.footer.template, "f.hbs");

  registerQuickRest();
  assert.deepEqual(Object.keys(types), ["quick", "short", "long"], "registering twice adds nothing");
  assert.equal(typeof makeQuickRestDialog, "function");
  assert.equal(quickRestType(null).icon, "fa-solid fa-mug-hot");
});

/* ---------- Hooks ---------- */

test("runFirst moves a listener to the front of its hook", () => {
  globalThis.Hooks = { events: { x: [{ id: 1 }, { id: 2 }, { id: 3 }] } };
  assert.equal(runFirst("x", 3), true);
  assert.deepEqual(globalThis.Hooks.events.x.map(e => e.id), [3, 1, 2]);
  assert.equal(runFirst("x", 3), true);
  assert.equal(runFirst("x", 9), false);
  assert.equal(runFirst("missing", 1), false);
});

/* ---------- Text ---------- */

test("every text key the scripts and templates use is in lang/en.json", () => {
  const keys = flatKeys();
  const used = new Set();
  const root = new URL("../", import.meta.url);
  const read = path => readFileSync(new URL(path, root), "utf8");
  for ( const dir of ["scripts", "templates"] ) {
    for ( const file of readdirSync(new URL(`${dir}/`, root)) ) {
      const text = read(`${dir}/${file}`);
      for ( const [, key] of text.matchAll(/PRIMAL_HOUSERULES\.([A-Za-z.]+[A-Za-z])/g) ) used.add(`PRIMAL_HOUSERULES.${key}`);
      for ( const [, key] of text.matchAll(/\bloc\("([A-Za-z.]+)"/g) ) used.add(`PRIMAL_HOUSERULES.${key}`);
    }
  }
  // Settings: every registered key needs a name and a hint.
  const settings = read("scripts/constants.mjs").match(/SETTINGS = \{([\s\S]*?)\};/)[1];
  for ( const [, key] of settings.matchAll(/:\s*"(\w+)"/g) ) {
    used.add(`PRIMAL_HOUSERULES.Settings.${key}.Name`);
    used.add(`PRIMAL_HOUSERULES.Settings.${key}.Hint`);
  }
  used.add("PRIMAL_HOUSERULES.Settings.emanationScope.Spells");
  used.add("PRIMAL_HOUSERULES.Settings.emanationScope.All");
  used.delete("PRIMAL_HOUSERULES.Settings");
  const missing = [...used].filter(key => !(key in keys));
  assert.deepEqual(missing, []);
});
