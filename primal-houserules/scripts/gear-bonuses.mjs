/**
 * Gear bonuses don't stack: when several pieces of gear give a bonus of the same kind, only the highest one counts.
 *
 * Two kinds are covered:
 * - Attack rolls. A gear bonus to all attacks, a gear bonus to one type of attack (melee weapon, ranged weapon, melee
 *   spell, ranged spell), and a weapon's (or its ammunition's) own +X. The highest of these counts for an attack.
 * - Saving throws. A gear bonus to all saves and a gear bonus to one ability's saves. The highest counts.
 *
 * "Gear" is an effect that comes from an item the creature carries (a weapon, armor, a ring, a cloak, a badge...).
 * Bonuses from spells, features, conditions and anything else still stack as normal, and so do penalties and dice
 * (a cursed -1 or a 1d4 from an item is left alone). Only flat bonuses above 0 are compared.
 *
 * How: when Foundry starts applying an actor's effects, the gear bonuses are collected and the lower ones are marked.
 * Foundry is then told a marked change doesn't apply (or, for a single-ability or single-attack-type bonus that beats a
 * smaller all-round one, cut down to the difference). A weapon's own +X is compared when its attack bonus is worked
 * out, which covers the to-hit shown on the sheet as well as the roll.
 */
import { MODULE_ID, SETTINGS, setting, wrap } from "./constants.mjs";

/** Item types that are gear: things that are carried, worn or wielded. */
export const GEAR_ITEM_TYPES = new Set(["weapon", "equipment", "consumable", "tool", "loot", "container"]);

/** Attack types with their own bonus. */
export const ATTACK_TYPES = ["mwak", "rwak", "msak", "rsak"];

/** Keys from before dnd5e 6, as items made earlier still use them, with the key dnd5e moves them to. */
const LEGACY_KEYS = {
  "system.bonuses.mwak.attack": "system.rolls.attack.mwak.bonus",
  "system.bonuses.rwak.attack": "system.rolls.attack.rwak.bonus",
  "system.bonuses.msak.attack": "system.rolls.attack.msak.bonus",
  "system.bonuses.rsak.attack": "system.rolls.attack.rsak.bonus",
  "system.bonuses.abilities.save": "system.rolls.ability.save.bonus"
};

/** The plan worked out for each actor the last time its effects were applied. */
const plans = new WeakMap();

/**
 * The key a change really lands on, after dnd5e's moves of old keys.
 * @param {string} key
 * @returns {string}
 */
export function currentKey(key) {
  if ( typeof key !== "string" ) return "";
  if ( LEGACY_KEYS[key] ) return LEGACY_KEYS[key];
  const old = key.match(/^system\.abilities\.(\w+)\.bonuses\.save$/);
  if ( old ) return `system.abilities.${old[1]}.save.roll.bonus`;
  return key;
}

/**
 * Which kind of bonus a key is, and how wide.
 * @param {string} key   A current key (see currentKey).
 * @returns {{kind: "attack"|"save", scope: string}|null}   scope is "all", an attack type, or an ability.
 */
export function bonusKind(key) {
  if ( key === "system.rolls.attack.bonus" ) return { kind: "attack", scope: "all" };
  let match = key.match(/^system\.rolls\.attack\.(mwak|rwak|msak|rsak)\.bonus$/);
  if ( match ) return { kind: "attack", scope: match[1] };
  if ( key === "system.rolls.ability.save.bonus" ) return { kind: "save", scope: "all" };
  match = key.match(/^system\.abilities\.(\w+)\.save\.roll\.bonus$/);
  if ( match ) return { kind: "save", scope: match[1] };
  return null;
}

/**
 * A bonus as a number, when it is a flat one. Dice, and anything that can't be worked out, give null.
 * @param {*} value
 * @param {object} [data]   Roll data for @ references.
 * @returns {number|null}
 */
export function flatBonus(value, data) {
  if ( typeof value === "number" ) return Number.isFinite(value) ? value : null;
  if ( typeof value !== "string" ) return null;
  let text = value.trim();
  if ( !text ) return null;
  if ( text.includes("@") ) {
    if ( !data || !globalThis.Roll?.replaceFormulaData ) return null;
    try {
      text = globalThis.Roll.replaceFormulaData(text, data, { missing: "0" });
    } catch {
      return null;
    }
  }
  if ( /\d*d\d/i.test(text) ) return null;
  const plain = Number(text.replace(/\s+/g, "").replace(/^\+/, ""));
  if ( Number.isFinite(plain) ) return plain;
  try {
    const roll = new globalThis.Roll(text, data);
    if ( roll.isDeterministic === false ) return null;
    roll.evaluateSync();
    return Number.isFinite(roll.total) ? roll.total : null;
  } catch {
    return null;
  }
}

/**
 * Whether an effect comes from gear the creature carries.
 * @param {ActiveEffect} effect
 * @returns {boolean}
 */
export function isGearEffect(effect) {
  const item = effect?.parent;
  if ( !item || (item.documentName !== "Item") ) return false;
  return GEAR_ITEM_TYPES.has(item.type);
}

/**
 * A name for one change of one effect that survives Foundry copying the change before applying it.
 * @param {ActiveEffect} effect
 * @param {object} change
 * @returns {string}
 */
export function changeId(effect, change) {
  const id = change?._id ?? `${change?.key}=${change?.value}`;
  return `${effect?.uuid ?? effect?.id ?? ""}#${id}`;
}

/**
 * Work out which gear bonuses count.
 * @param {Array<{id: string, key: string, value: number, label?: string}>} entries
 *   Gear bonuses above 0, with their current keys, in the order the effects come.
 * @returns {{skip: Set<string>, reduce: Map<string, number>, totals: {attack: object, save: object}}}
 *   skip: changes not to apply. reduce: changes to apply with a smaller value. totals: the gear bonus that ends up
 *   counting, per kind and scope ("all" and each scope that has a bonus of its own).
 */
export function planGearBonuses(entries) {
  const skip = new Set();
  const reduce = new Map();
  const totals = { attack: {}, save: {} };

  // The highest bonus on each key; the others on that key don't count.
  const best = new Map();
  for ( const entry of entries ) {
    const kind = bonusKind(entry.key);
    if ( !kind || !(entry.value > 0) ) continue;
    const current = best.get(entry.key);
    if ( !current ) best.set(entry.key, { ...entry, ...kind });
    else if ( entry.value > current.value ) {
      skip.add(current.id);
      best.set(entry.key, { ...entry, ...kind });
    }
    else skip.add(entry.id);
  }

  // An all-round bonus and a narrower one: the narrower one only adds what it has over the all-round one.
  for ( const kind of ["attack", "save"] ) {
    const all = [...best.values()].find(e => (e.kind === kind) && (e.scope === "all"));
    const allValue = all?.value ?? 0;
    if ( all ) totals[kind].all = allValue;
    for ( const entry of best.values() ) {
      if ( (entry.kind !== kind) || (entry.scope === "all") ) continue;
      totals[kind][entry.scope] = Math.max(allValue, entry.value);
      if ( entry.value <= allValue ) skip.add(entry.id);
      else if ( allValue > 0 ) reduce.set(entry.id, entry.value - allValue);
    }
  }
  return { skip, reduce, totals };
}

/**
 * The gear bonus that counts for one kind of roll.
 * @param {object} totals   From planGearBonuses.
 * @param {"attack"|"save"} kind
 * @param {string} scope    An attack type or an ability.
 * @returns {number}
 */
export function gearTotal(totals, kind, scope) {
  const group = totals?.[kind] ?? {};
  return Math.max(group.all ?? 0, group[scope] ?? 0);
}

/**
 * How much to take off an attack so that only the highest of the weapon's +X, its ammunition's +X and the gear
 * bonus counts.
 * @param {object} values
 * @param {number|null} [values.weapon]
 * @param {number|null} [values.ammo]
 * @param {number|null} [values.gear]
 * @returns {number}   0 or more.
 */
export function attackOverlap({ weapon, ammo, gear }={}) {
  const bonuses = [weapon, ammo, gear].filter(v => Number.isFinite(v) && (v > 0));
  if ( bonuses.length < 2 ) return 0;
  return bonuses.reduce((a, b) => a + b, 0) - Math.max(...bonuses);
}

/**
 * Collect an actor's gear bonuses to attacks and saves.
 * @param {Actor} actor
 * @returns {Array<{id: string, key: string, value: number, label: string}>}
 */
export function collectGearBonuses(actor) {
  const entries = [];
  let rollData;
  const getRollData = () => rollData ??= (actor.getRollData?.() ?? {});
  for ( const effect of actor.allApplicableEffects?.() ?? [] ) {
    if ( !effect.active || !isGearEffect(effect) ) continue;
    for ( const change of effect.system?.changes ?? effect.changes ?? [] ) {
      if ( (change.type ?? "add") !== "add" ) continue;
      const key = currentKey(change.key);
      if ( !bonusKind(key) ) continue;
      // The same data and checks Foundry uses when it applies the change.
      const data = effect.getReplacementData?.(getRollData()) ?? getRollData();
      const value = flatBonus(change.value, data);
      if ( !(value > 0) ) continue;
      // Some modules (DAE) move a change to another phase, so it counts if it applies in either one.
      const phases = [...new Set([change.phase ?? "initial", "initial", "final"])];
      let applies = !effect.shouldApplyChange;
      try {
        applies ||= phases.some(phase => effect.shouldApplyChange(change, { phase, replacementData: data }));
      } catch {
        applies = false;
      }
      if ( !applies ) continue;
      entries.push({ id: changeId(effect, change), key, value, label: `${effect.parent.name}: ${effect.name}` });
    }
  }
  return entries;
}

/** Marks an actor whose plan is still to be worked out in this round of data preparation. */
const PENDING = Symbol("pending");

/**
 * The plan for an actor in this round of data preparation, worked out the first time it's needed: once dnd5e has
 * prepared the actor's items and Foundry starts applying its effects.
 * @param {Actor} actor
 * @returns {object|undefined}
 */
export function gearPlan(actor) {
  if ( !actor ) return undefined;
  let plan = plans.get(actor);
  if ( (plan !== PENDING) || computing.has(actor) ) return plan === PENDING ? undefined : plan;
  plan = undefined;
  computing.add(actor);
  try {
    const entries = collectGearBonuses(actor);
    if ( entries.length ) plan = planGearBonuses(entries);
  } catch (err) {
    console.error(`${MODULE_ID} | Could not compare the gear bonuses of ${actor.name}`, err);
  } finally {
    computing.delete(actor);
  }
  if ( plan ) plans.set(actor, plan);
  else plans.delete(actor);
  return plan;
}

/** Actors whose plan is being worked out right now (collecting asks each effect whether it applies). */
const computing = new WeakSet();

/**
 * The actor a gear effect's changes go to.
 * @param {ActiveEffect} effect
 * @returns {Actor|null}
 */
function gearActor(effect) {
  if ( !isGearEffect(effect) ) return null;
  const actor = effect.parent?.parent;
  return actor?.documentName === "Actor" ? actor : null;
}

/** Whether the rule is on. */
function enabled() {
  return setting(SETTINGS.gearBonuses, true) !== false;
}

/** Set the rule up. Called during init, before any actor is prepared. */
export function registerGearBonuses() {
  // 1. Start a new plan each time an actor's effects are applied from the start.
  wrap("CONFIG.Actor.documentClass.prototype", "applyActiveEffects", function(wrapped, phase, ...rest) {
    if ( (phase === "initial") || (typeof phase !== "string") ) {
      if ( enabled() ) plans.set(this, PENDING);
      else plans.delete(this);
    }
    return wrapped(phase, ...rest);
  });

  // 2. A gear bonus that doesn't count isn't applied. Done by answering "no" when Foundry asks whether the change
  //    applies, after every other module has had its say, so no one else's wrapper is ever skipped.
  wrap("CONFIG.ActiveEffect.documentClass.prototype", "shouldApplyChange", function(wrapped, change, ...rest) {
    const result = wrapped(change, ...rest);
    if ( !result ) return result;
    const actor = gearActor(this);
    const plan = actor ? gearPlan(actor) : null;
    if ( plan?.skip.has(changeId(this, change)) ) {
      if ( change && ("applied" in change) ) change.applied = false;
      return false;
    }
    return result;
  });

  //    A single-ability or single-attack-type bonus that beats a smaller all-round one adds only the difference.
  wrap("CONFIG.ActiveEffect.documentClass", "applyChange", function(wrapped, model, change, ...rest) {
    const plan = (model?.documentName === "Actor") && change?.effect ? gearPlan(model) : null;
    const id = plan ? changeId(change.effect, change) : null;
    if ( plan?.reduce.has(id) ) return wrapped(model, { ...change, value: String(plan.reduce.get(id)) }, ...rest);
    return wrapped(model, change, ...rest);
  });

  // 3. A weapon's own +X against the gear bonus to that attack.
  const attackClass = "CONFIG.DND5E.activityTypes.attack.documentClass.prototype";
  wrap(attackClass, "getAttackData", function(wrapped, options={}, ...rest) {
    const result = wrapped(options, ...rest);
    try {
      if ( !enabled() || !result?.data || !this.actor ) return result;
      const { data, parts } = result;
      if ( (data.weaponMagic === undefined) && (data.ammoMagic === undefined) ) return result;
      const type = this.getActionType?.(options?.attackMode);
      const overlap = attackOverlap({
        weapon: flatBonus(data.weaponMagic, data),
        ammo: flatBonus(data.ammoMagic, data),
        gear: gearTotal(gearPlan(this.actor)?.totals, "attack", type)
      });
      if ( overlap > 0 ) {
        data.gearOverlap = -overlap;
        parts.push("@gearOverlap");
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Could not compare the gear bonuses on ${this.item?.name}`, err);
    }
    return result;
  });
}
