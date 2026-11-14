/**
 * Working out each actor's spell points.
 *
 * The pool lives in actor flags (points spent, high-level spells used, and the GM's per-actor choices). Everything
 * else is worked out each time the actor's data is prepared: the maximum comes from the actor's spellcaster level
 * (dnd5e's own multiclass calculation) and the GM's tables. The result is kept in memory for the casting hooks and
 * the sheets, and a copy is put at `actor.system.attributes.spellPoints` for roll data, macros and token bars.
 *
 * The spell slots of a spell point caster are rewritten while the data is prepared so that each slot level shows
 * as full when the caster can afford a spell of that level and empty when they can't. That way dnd5e's casting
 * dialog, Midi-QOL and other modules that read slots offer exactly the levels the caster can pay for. Nothing is
 * saved to the slots; the real pool is the flags.
 */
import { DMG_TABLES, FLAGS, HIGH_LEVEL, MODULE_ID, SETTINGS, SLOT_METHOD, loc } from "./constants.mjs";

/** @type {WeakMap<Actor, number>} The leveled spellcaster level dnd5e worked out, by actor. */
const casterLevels = new WeakMap();

/** @type {WeakMap<Actor, SpellPointState>} The state of every actor currently using spell points. */
const states = new WeakMap();

/** @type {{cost: Record<number, number>, points: number[]}|null} */
let cachedTables = null;

/**
 * @typedef {object} SpellPointState
 * @property {boolean} active        Whether the actor uses spell points right now.
 * @property {boolean} enabled      Whether the GM has chosen spell points for this actor.
 * @property {number} casterLevel    Spellcaster level used for the table (multiclass levels combined).
 * @property {number} base           Maximum from the table.
 * @property {number} bonus          GM's bonus to the maximum.
 * @property {number|null} override  GM's fixed maximum, if any.
 * @property {number} max
 * @property {number} spent
 * @property {number} value          Points left.
 * @property {number} maxLevel       Highest spell level the caster has slots for.
 * @property {boolean} limit         Whether 6th level and higher are once per long rest.
 * @property {number[]} highUsed     High levels already cast since the last long rest.
 * @property {Record<number, number>} cost
 */

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

const DEFAULTS = {
  [SETTINGS.highLevelLimit]: true,
  [SETTINGS.tables]: DMG_TABLES
};

/**
 * Read a setting, falling back to its default if settings can't be read yet.
 * @param {string} key
 * @returns {*}
 */
export function getSetting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return DEFAULTS[key];
  }
}

/**
 * The cost and points tables, checked and filled in from the Dungeon Master's Guide where anything is missing.
 * @returns {{cost: Record<number, number>, points: number[]}}
 */
export function getTables() {
  if ( cachedTables ) return cachedTables;
  const stored = getSetting(SETTINGS.tables) ?? {};
  const whole = (n, fallback) => {
    const v = Number(n);
    return (Number.isFinite(v) && (v >= 0)) ? Math.floor(v) : fallback;
  };
  const cost = {};
  for ( let level = 1; level <= 9; level++ ) cost[level] = whole(stored.cost?.[level], DMG_TABLES.cost[level]);
  const points = DMG_TABLES.points.map((fallback, i) => whole(stored.points?.[i], fallback));
  cachedTables = { cost, points };
  return cachedTables;
}

/** Forget the cached tables after the setting changes. */
export function clearTablesCache() {
  cachedTables = null;
}

/**
 * The spell point cost of casting at a spell level.
 * @param {number} level
 * @returns {number}
 */
export function costFor(level) {
  return getTables().cost[level] ?? DMG_TABLES.cost[level] ?? 0;
}

/* -------------------------------------------- */
/*  Preparation                                 */
/* -------------------------------------------- */

/**
 * The `dnd5e.prepareSpellSlots` hook: note the actor's leveled spellcaster level.
 * @param {object} spells
 * @param {Actor|void} actor
 * @param {object} progression
 */
export function recordCasterLevel(spells, actor, progression) {
  if ( !(actor instanceof Actor) ) return;
  casterLevels.set(actor, Math.max(0, Number(progression?.[SLOT_METHOD]) || 0));
}

/**
 * Whether the GM has chosen spell points for this actor. Each actor is chosen on its own; nothing is on by default.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isEnabledFor(actor) {
  if ( !actor?.system?.spells ) return false;
  return actor.flags?.[MODULE_ID]?.[FLAGS.enabled] === true;
}

/**
 * Work out an actor's spell points from its prepared data, whether or not it uses them.
 * @param {Actor} actor
 * @returns {SpellPointState|null}  Null for actors without spellcasting data.
 */
export function computeState(actor) {
  const spells = actor?.system?.spells;
  if ( !spells ) return null;

  let maxLevel = 0;
  for ( const slot of Object.values(spells) ) {
    if ( (slot?.type === SLOT_METHOD) && (slot.level > 0) && (slot.max > 0) ) maxLevel = Math.max(maxLevel, slot.level);
  }

  const flags = actor.flags?.[MODULE_ID] ?? {};
  const { cost, points } = getTables();
  const casterLevel = casterLevels.get(actor) ?? 0;
  const base = casterLevel > 0 ? (points[Math.min(casterLevel, points.length) - 1] ?? 0) : 0;
  const rawOverride = flags[FLAGS.maxOverride];
  const override = ((rawOverride === null) || (rawOverride === undefined) || (rawOverride === "")
    || !Number.isFinite(Number(rawOverride))) ? null : Math.max(0, Math.floor(Number(rawOverride)));
  const bonus = Math.trunc(Number(flags[FLAGS.bonus]) || 0);
  const max = Math.max(0, override ?? (base + bonus));
  const spent = Math.max(0, Math.trunc(Number(flags[FLAGS.spent]) || 0));
  const value = Math.clamp(max - spent, 0, max);
  const highUsed = Array.from(new Set((Array.isArray(flags[FLAGS.highUsed]) ? flags[FLAGS.highUsed] : [])
    .map(Number).filter(n => Number.isInteger(n) && (n >= HIGH_LEVEL) && (n <= 9)))).sort((a, b) => a - b);

  return {
    active: false,
    enabled: flags[FLAGS.enabled] === true,
    casterLevel, base, bonus, override, max, spent, value, maxLevel, highUsed,
    limit: !!getSetting(SETTINGS.highLevelLimit),
    cost
  };
}

/**
 * Called after an actor's data is fully prepared (including active effects). Sets up its spell points and makes its
 * spell slots match what it can afford.
 * @param {Actor} actor
 */
export function prepareSpellPoints(actor) {
  states.delete(actor);
  if ( !isEnabledFor(actor) ) return;
  const state = computeState(actor);
  if ( !state?.maxLevel ) return;
  state.active = true;
  states.set(actor, state);

  // Make sure the flag exists in the prepared data so dnd5e can record what a cast spent (for chat cards and refunds).
  // Prepared flags are a copy of the stored ones, so this saves nothing.
  if ( actor.flags ) {
    actor.flags[MODULE_ID] ??= {};
    actor.flags[MODULE_ID][FLAGS.spent] ??= 0;
  }

  if ( actor.system.attributes ) {
    actor.system.attributes.spellPoints = {
      value: state.value,
      max: state.max,
      spent: state.spent,
      casterLevel: state.casterLevel,
      label: loc("SpellPoints")
    };
  }

  for ( const slot of Object.values(actor.system.spells) ) {
    if ( (slot?.type !== SLOT_METHOD) || !(slot.level > 0) ) continue;
    slot.value = ((slot.max > 0) && canCastLevel(state, slot.level)) ? slot.max : 0;
  }
}

/* -------------------------------------------- */
/*  Queries                                     */
/* -------------------------------------------- */

/**
 * The spell points of an actor that uses them, or null.
 * @param {Actor} actor
 * @returns {SpellPointState|null}
 */
export function getState(actor) {
  if ( !actor ) return null;
  return states.get(actor) ?? null;
}

/**
 * Whether a high-level spell of this level has already been cast since the last long rest.
 * @param {SpellPointState} state
 * @param {number} level
 * @returns {boolean}
 */
export function isHighLevelUsed(state, level) {
  return !!state?.limit && (level >= HIGH_LEVEL) && state.highUsed.includes(level);
}

/**
 * Why a spell of this level can't be cast with spell points right now, or null if it can.
 * @param {Actor} actor
 * @param {SpellPointState} state
 * @param {number} level
 * @param {string} [spellName]
 * @returns {string|null}
 */
export function castProblem(actor, state, level, spellName) {
  const data = { actor: actor?.name ?? "", spell: spellName ?? "", level: CONFIG.DND5E.spellLevels[level] ?? level };
  if ( !state?.active ) return null;
  if ( !(level >= 1) || (level > state.maxLevel) ) return loc("Warning.TooHigh", data);
  if ( isHighLevelUsed(state, level) ) return loc("Warning.HighLevelUsed", data);
  const cost = costFor(level);
  if ( cost > state.value ) return loc("Warning.NotEnough", { ...data, cost, value: state.value });
  return null;
}

/**
 * Whether the actor can afford a spell of this level now.
 * @param {SpellPointState} state
 * @param {number} level
 * @returns {boolean}
 */
export function canCastLevel(state, level) {
  if ( !state?.active || !(level >= 1) || (level > state.maxLevel) ) return false;
  if ( isHighLevelUsed(state, level) ) return false;
  return costFor(level) <= state.value;
}

/**
 * Spell levels with slots that the actor can't afford right now.
 * @param {SpellPointState} state
 * @returns {number[]}
 */
export function unaffordableLevels(state) {
  const levels = [];
  for ( let level = 1; level <= (state?.maxLevel ?? 0); level++ ) {
    if ( !canCastLevel(state, level) ) levels.push(level);
  }
  return levels;
}

/* -------------------------------------------- */
/*  Refresh                                     */
/* -------------------------------------------- */

/**
 * Prepare every loaded actor again and redraw open actor sheets (after a setting changes).
 */
export function refreshAll() {
  const actors = new Set(game.actors ?? []);
  for ( const token of canvas?.scene?.tokens ?? [] ) {
    if ( !token.actorLink && token.actor ) actors.add(token.actor);
  }
  for ( const app of foundry.applications.instances?.values() ?? [] ) {
    if ( app.document instanceof Actor ) actors.add(app.document);
  }
  for ( const actor of actors ) {
    try {
      actor.reset();
    } catch (err) {
      console.error(`${MODULE_ID} | Could not refresh ${actor.name}`, err);
    }
  }
  for ( const app of foundry.applications.instances?.values() ?? [] ) {
    if ( (app.document instanceof Actor) && app.rendered ) app.render();
  }
}
