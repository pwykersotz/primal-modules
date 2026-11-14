/**
 * Turn start and turn end for the whole acting side, in side initiative.
 *
 * Foundry runs a combatant's turn start and end steps (Combat#_onStartTurn and Combat#_onEndTurn, which carry dnd5e's
 * start-of-turn recovery, Midi-QOL's OverTime effects and action reset, region behaviours and so on), clears its
 * movement history, and expires effects that end at the start or end of a turn, for the combatant Combat#turn points
 * at. In side initiative that's only the first creature of the acting side. The others would only get theirs as a
 * "skipped" turn when the turn moves past them, at the end of the side's turn: start-of-turn things late, start and end
 * together.
 *
 * So while a side-initiative combat handles a turn change (Combat#_manageTurnEvents), this module takes those steps
 * over for that combat:
 * - When a side's turn starts, everyone acting gets their turn start, in turn order.
 * - When a side's turn ends, everyone who acted gets their turn end.
 * - The skipped turns Foundry would run as the turn passes over the side are dropped, so nothing runs twice.
 * - Effects that end at the start or end of a creature's turn (Foundry's turnStart and turnEnd, dnd5e's "start of your
 *   next turn" and the like, Midi's reaction and bonus action markers) see each creature's own turn edge.
 * - DAE's macro repeats (startEveryTurn and so on) fire for each creature at its side's turn start and end, and
 *   Midi-QOL's once-per-turn optional bonuses reset for each creature.
 * Individual-initiative combats are left exactly as Foundry runs them.
 */
import { MODULE_ID } from "./constants.mjs";
import { getActingMembers, getSide, getSideTurnMembers, isSideMode } from "./sides.mjs";

/** Methods taken over on a side-initiative combat while it handles a turn change. */
const TAKEN_OVER = ["_onStartTurn", "_onEndTurn", "_clearMovementHistoryOnStartTurn"];

/** Marks the context of a turn step this module ran for someone other than the combatant Combat#turn points at. */
export const SIDE_CONTEXT = "primalCombatSide";

/** combat -> how many turn changes it's handling right now. */
const handling = new Map();

/** combat id -> {key, ids}: who got their turn start in the side's turn now running ("round.leadId"). */
const started = new Map();

/** combat -> the creature whose turn step is running for its side, while it runs: {combatant, phase, refreshed, cleared, expiring}. */
const steps = new Map();

/* -------------------------------------------- */
/*  Taking over a combat's turn steps           */
/* -------------------------------------------- */

/**
 * The class's own method (with any wrappers other modules put on it), not the stand-in on the instance.
 * @param {Combat} combat
 * @param {string} name
 * @returns {Function|undefined}
 */
function classMethod(combat, name) {
  for ( let proto = Object.getPrototypeOf(combat); proto; proto = Object.getPrototypeOf(proto) ) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if ( descriptor ) return descriptor.get ? descriptor.get.call(combat) : descriptor.value;
  }
  return undefined;
}

const STAND_INS = {
  _onStartTurn: onStartTurn,
  _onEndTurn: onEndTurn,
  _clearMovementHistoryOnStartTurn: onClearMovementHistory
};

/**
 * Run a combat's turn change (Combat#_manageTurnEvents) with its turn steps taken over, if it uses side initiative.
 * The stand-ins are own properties of the combat, so they come before the class's methods and every wrapper on them
 * (Midi-QOL's, for one), and they're removed as soon as the turn change is handled.
 * @param {Combat} combat
 * @param {Function} manage   The original turn change handling.
 */
export async function manageSideTurnEvents(combat, manage) {
  if ( !isSideMode(combat) ) return manage();
  const depth = handling.get(combat) ?? 0;
  if ( !depth ) {
    try {
      for ( const name of TAKEN_OVER ) {
        if ( typeof classMethod(combat, name) !== "function" ) continue;
        Object.defineProperty(combat, name, { value: STAND_INS[name], configurable: true, writable: true });
      }
    } catch(err) {
      release(combat);
      console.warn(`${MODULE_ID} | Could not take over the turn steps; Foundry will run them for the first of each side only`, err);
      return manage();
    }
  }
  handling.set(combat, depth + 1);
  try {
    return await manage();
  } finally {
    const left = (handling.get(combat) ?? 1) - 1;
    if ( left > 0 ) handling.set(combat, left);
    else {
      handling.delete(combat);
      release(combat);
    }
  }
}

/** Remove the stand-ins from a combat. */
function release(combat) {
  for ( const name of TAKEN_OVER ) {
    if ( Object.prototype.hasOwnProperty.call(combat, name) ) delete combat[name];
  }
}

/* -------------------------------------------- */
/*  The stand-ins                               */
/* -------------------------------------------- */

/** Should a combatant's turn step count as skipped, the way Foundry passes over defeated creatures? */
function isSkipped(combat, combatant) {
  return !!(combat.settings?.skipDefeated && combatant.isDefeated);
}

/** Did this turn change move forward? */
function movedForward(combat) {
  const previous = combat.previous;
  const current = combat.current ?? { round: combat.round, turn: combat.turn };
  if ( !Number.isFinite(previous?.round) ) return true;
  if ( current.round !== previous.round ) return current.round > previous.round;
  return (current.turn ?? 0) > (previous.turn ?? -1);
}

/**
 * Run one creature's turn step so that a failure (another module's error, say) doesn't stop the rest of the side's.
 * @param {Combatant} combatant
 * @param {"start"|"end"} phase
 * @param {Function} fn
 */
async function guarded(combatant, phase, fn) {
  try {
    await fn();
  } catch(err) {
    console.error(`${MODULE_ID} | Turn ${phase} for ${combatant.name} failed`, err);
  }
}

/** Names for the console. */
function names(combatants) {
  return combatants.map(c => c.name).join(", ");
}

/**
 * Combat#_onStartTurn while a side-initiative combat handles a turn change. Foundry calls it for the combatant
 * Combat#turn now points at, which starts the side's turn for everyone acting; and for each combatant it passed over,
 * as skipped, which is dropped (those creatures get their turn start with their side).
 * @this {Combat}
 */
async function onStartTurn(combatant, context, ...rest) {
  const startTurn = classMethod(this, "_onStartTurn");
  if ( context?.[SIDE_CONTEXT] ) return startTurn.call(this, combatant, context, ...rest);
  if ( context?.skipped ) return; // Passed over: this creature's turn start comes with its side's.
  context ??= { round: this.round, turn: this.turn, skipped: false };
  const members = (this.combatant === combatant) ? getActingMembers(this) : getSideTurnMembers(this, combatant, context.round);
  if ( !members.includes(combatant) ) members.unshift(combatant);
  started.set(this.id, { key: `${context.round}.${combatant.id}`, ids: members.map(c => c.id) });
  if ( members.length > 1 ) console.log(`${MODULE_ID} | Turn start for the ${getSide(combatant)} (round ${context.round}): ${names(members)}`);
  for ( const member of members ) {
    if ( member === combatant ) await guarded(combatant, "start", () => startTurn.call(this, combatant, context, ...rest));
    else await runStep(this, member, "start", { ...context, skipped: isSkipped(this, member), [SIDE_CONTEXT]: true });
  }
}

/**
 * Combat#_onEndTurn while a side-initiative combat handles a turn change. Foundry calls it for the combatant Combat#turn
 * pointed at, which ends the side's turn for everyone who acted in it; and for each combatant it passed over, as
 * skipped, which is dropped.
 * @this {Combat}
 */
async function onEndTurn(combatant, context, ...rest) {
  const endTurn = classMethod(this, "_onEndTurn");
  if ( context?.[SIDE_CONTEXT] ) return endTurn.call(this, combatant, context, ...rest);
  if ( context?.skipped ) return; // Passed over: this creature's turn end came with its side's.
  context ??= { round: this.previous?.round ?? this.round, turn: this.previous?.turn ?? this.turn, skipped: false };
  const round = context.round ?? this.round;

  // Everyone who got a turn start in that side's turn, and anyone else acting in it now (someone who joined part way).
  const ids = new Set([combatant.id, ...getSideTurnMembers(this, combatant, round).map(c => c.id)]);
  const record = started.get(this.id);
  if ( record?.key === `${round}.${combatant.id}` ) record.ids.forEach(id => ids.add(id));
  const members = this.turns.filter(c => ids.has(c.id));
  if ( !members.includes(combatant) ) members.unshift(combatant);

  const forward = movedForward(this);
  if ( members.length > 1 ) console.log(`${MODULE_ID} | Turn end for the ${getSide(combatant)} (round ${round}): ${names(members)}`);
  for ( const member of members ) {
    if ( member === combatant ) {
      await guarded(combatant, "end", () => endTurn.call(this, combatant, context, ...rest));
      // DAE's own macro repeats only start the turn of the combatant Combat#turn points at (see onPreUpdateCombat).
      if ( forward ) runDaeRepeats(combatant, "end");
    }
    else await runStep(this, member, "end", { ...context, skipped: isSkipped(this, member), [SIDE_CONTEXT]: true }, forward);
  }
}

/**
 * Combat#_clearMovementHistoryOnStartTurn while a side-initiative combat handles a turn change. A passed-over
 * combatant's history is left alone (it's cleared when its side's turn starts).
 * @this {Combat}
 */
async function onClearMovementHistory(combatant, context, ...rest) {
  if ( context?.skipped && !context[SIDE_CONTEXT] ) return;
  const step = steps.get(this);
  if ( step?.combatant === combatant ) step.cleared = true;
  return classMethod(this, "_clearMovementHistoryOnStartTurn").call(this, combatant, context, ...rest);
}

/**
 * One creature's turn start or end, as part of its side's, for a creature other than the one Combat#turn points at.
 * Runs what Foundry runs for a turn edge: the turn step itself, then (if that didn't do it already) clearing movement
 * history and expiring effects whose turn edge this is.
 * @param {Combat} combat
 * @param {Combatant} combatant
 * @param {"start"|"end"} phase
 * @param {object} context      The turn step's context: {round, turn, skipped}, turn being Combat#turn.
 * @param {boolean} [forward]   Did the turn move forward (turn end only)?
 */
async function runStep(combat, combatant, phase, context, forward=true) {
  const step = { combatant, phase, refreshed: false, cleared: false, expiring: 0 };
  steps.set(combat, step);
  try {
    if ( phase === "start" ) {
      await classMethod(combat, "_onStartTurn").call(combat, combatant, context);
      if ( context.skipped ) return;
      const clear = classMethod(combat, "_clearMovementHistoryOnStartTurn");
      if ( !step.cleared && combatant.token && (typeof clear === "function") ) await clear.call(combat, combatant, context);
      if ( !step.refreshed ) await refreshExpiry("turnStart", combat, context);
      await resetMidiTurnCounts(combatant.actor);
      runDaeRepeats(combatant, "start");
    }
    else {
      await classMethod(combat, "_onEndTurn").call(combat, combatant, context);
      if ( context.skipped ) return;
      if ( !step.refreshed ) await refreshExpiry("turnEnd", combat, context);
      if ( forward ) runDaeRepeats(combatant, "end");
    }
  } catch(err) {
    console.error(`${MODULE_ID} | Turn ${phase} for ${combatant.name} failed`, err);
  } finally {
    if ( steps.get(combat) === step ) steps.delete(combat);
  }
}

/* -------------------------------------------- */
/*  Effects that end at a turn edge             */
/* -------------------------------------------- */

/** Foundry's ActiveEffect registry (v14), which expires effects. */
function effectRegistry() {
  return foundry.documents?.ActiveEffect?.registry ?? CONFIG.ActiveEffect?.documentClass?.registry ?? null;
}

/**
 * Ask Foundry to expire effects whose turn edge this is, for the creature whose step is running.
 * @param {"turnStart"|"turnEnd"} event
 * @param {Combat} combat
 * @param {object} context
 */
async function refreshExpiry(event, combat, context) {
  const registry = effectRegistry();
  if ( typeof registry?.refresh !== "function" ) return;
  await registry.refresh(event, { combat, round: context.round, turn: context.turn });
}

/** The step running for a combat named in an expiry check's context (a Combat or its id), or for the viewed combat. */
function stepFor(combat) {
  if ( typeof combat === "string" ) combat = game.combats?.get(combat);
  combat ??= game.combat;
  return combat ? steps.get(combat) : undefined;
}

/** Is this expiry event the turn edge of the step running? */
function isStepEvent(step, event) {
  return (event === "turnStart") ? (step.phase === "start") : (event === "turnEnd") && (step.phase === "end");
}

/**
 * Wrap Foundry's ActiveEffect registry refresh (v14). While a creature's step runs for its side, a refresh for that
 * turn edge (from Foundry's own turn step, or from runStep) checks effects against that creature's turn.
 */
export function wrapEffectRegistry() {
  const registry = effectRegistry();
  if ( typeof registry?.refresh !== "function" ) return;
  const refresh = registry.refresh;
  registry.refresh = async function(event, context={}) {
    const combat = context?.combat;
    const step = combat ? stepFor(combat) : ((steps.size === 1) ? steps.values().next().value : undefined);
    if ( !step || !isStepEvent(step, event) ) return refresh.call(this, event, context);
    if ( !context?.actors ) step.refreshed = true; // One limited to some actors would miss effects others put on them.
    step.expiring++;
    try {
      return await refresh.call(this, event, context);
    } finally {
      step.expiring--;
    }
  };
}

/**
 * ActiveEffect#isExpiryEvent (v14), wrapped. While a creature's step runs for its side, "whose turn is starting" is that
 * creature (Combat#combatant and Combat#current), and "whose turn just ended" is that creature (Combat#previous), for
 * just as long as the check takes. That's what Foundry and dnd5e look at for turnStart and turnEnd expiry, and for
 * dnd5e's start or end of the affected or originating creature's turn.
 * @this {ActiveEffect}
 */
export function isExpiryEvent(wrapped, event, context={}, ...args) {
  const step = stepFor(context?.combat);
  if ( !step?.expiring || !isStepEvent(step, event) ) return wrapped(event, context, ...args);
  const combat = step.combatant.parent;
  return (step.phase === "start") ? asCurrent(combat, step.combatant, () => wrapped(event, context, ...args))
    : asPrevious(combat, step.combatant, () => wrapped(event, context, ...args));
}

/**
 * Run a synchronous check as though it were this combatant's turn now.
 * @param {Combat} combat
 * @param {Combatant} combatant
 * @param {Function} fn
 */
function asCurrent(combat, combatant, fn) {
  const own = Object.getOwnPropertyDescriptor(combat, "combatant");
  const current = combat.current;
  let shadowed = false;
  let replaced = false;
  try {
    Object.defineProperty(combat, "combatant", { get: () => combatant, configurable: true });
    shadowed = true;
    if ( current ) {
      combat.current = { ...current, combatantId: combatant.id, tokenId: combatant.tokenId ?? null };
      replaced = true;
    }
  } catch(err) { /* Checked as Foundry has it. */ }
  try {
    return fn();
  } finally {
    if ( shadowed ) {
      if ( own ) Object.defineProperty(combat, "combatant", own);
      else delete combat.combatant;
    }
    if ( replaced ) combat.current = current;
  }
}

/**
 * Run a synchronous check as though this combatant's turn had just ended.
 * @param {Combat} combat
 * @param {Combatant} combatant
 * @param {Function} fn
 */
function asPrevious(combat, combatant, fn) {
  const previous = combat.previous;
  let replaced = false;
  try {
    combat.previous = { ...(previous ?? {}), combatantId: combatant.id, tokenId: combatant.tokenId ?? null };
    replaced = true;
  } catch(err) { /* Checked as Foundry has it. */ }
  try {
    return fn();
  } finally {
    if ( replaced ) combat.previous = previous;
  }
}

/* -------------------------------------------- */
/*  DAE macro repeats                           */
/* -------------------------------------------- */

const DAE_REPEATS = {
  start: ["startEveryTurn", "startEveryTurnAny", "startEndEveryTurn", "startEndEveryTurnAny"],
  end: ["endEveryTurn", "endEveryTurnAny", "startEndEveryTurn", "startEndEveryTurnAny"]
};

/** Repeats that only fire while the effect applies (the "Any" ones fire anyway). */
const DAE_ACTIVE_ONLY = {
  start: ["startEveryTurn", "startEndEveryTurn"],
  end: ["endEveryTurn", "startEndEveryTurn"]
};

/** DAE's API, when DAE is on and can run an effect's macro. */
function daeApi() {
  if ( !game.modules.get("dae")?.active ) return null;
  const api = globalThis.DAE ?? game.modules.get("dae")?.api;
  return (typeof api?.daeMacro === "function") ? api : null;
}

/** The effects DAE looks at for macro repeats: the actor's (not expired), and enchantments applied to its items. */
function daeEffects(actor) {
  const effects = [];
  for ( const effect of actor.allApplicableEffects?.() ?? actor.effects ?? [] ) {
    if ( !effect.duration?.expired ) effects.push(effect);
  }
  for ( const item of actor.items ?? [] ) {
    for ( const effect of item.effects ?? [] ) {
      if ( effect.isAppliedEnchantment && !effect.duration?.expired ) effects.push(effect);
    }
  }
  return effects;
}

/**
 * Fire DAE's macro repeats for one creature's turn start or end, the same way DAE does for the combatant whose turn it
 * is.
 * @param {Combatant} combatant
 * @param {"start"|"end"} phase
 */
export function runDaeRepeats(combatant, phase) {
  const api = daeApi();
  const actor = combatant?.actor;
  if ( !api || !actor ) return;
  for ( const effect of daeEffects(actor) ) {
    const repeat = effect.flags?.dae?.macroRepeat;
    if ( !DAE_REPEATS[phase].includes(repeat) ) continue;
    if ( DAE_ACTIVE_ONLY[phase].includes(repeat) && (effect.disabled || effect.isSuppressed) ) continue;
    const lastArg = {
      actor, effectId: effect.id, tokenId: combatant.token?.id, actorUuid: actor.uuid, actorID: actor.id,
      efData: effect.toObject(), turn: phase === "start" ? "startTurn" : "endTurn"
    };
    Promise.resolve()
      .then(() => api.daeMacro("each", actor, effect, lastArg))
      .catch(err => console.error(`${MODULE_ID} | DAE macro repeat for ${effect.name} on ${actor.name} failed`, err));
  }
}

/**
 * preUpdateCombat hook (registered after DAE's own). DAE works out whose macro repeats are due from the turn indexes
 * the turn passed over, which can't describe a side spread across the turn order (round 1's fast party sits before
 * the enemies). In side initiative it's told the turn didn't pass over anyone, so it only fires the turn start of the
 * combatant Combat#turn lands on, and this module fires everyone else's (runDaeRepeats).
 */
export function onPreUpdateCombat(combat, changes, options) {
  if ( !("round" in changes) && !("turn" in changes) ) return;
  if ( (options?.turnEvents === false) || !isSideMode(combat) || !daeApi() ) return;
  foundry.utils.setProperty(options, "dae.combat.round", changes.round ?? combat.round);
  foundry.utils.setProperty(options, "dae.combat.turn", changes.turn ?? combat.turn);
}

/* -------------------------------------------- */
/*  Midi-QOL once-per-turn bonuses              */
/* -------------------------------------------- */

const MIDI_OPTIONAL_COUNT = /^flags\.midi-qol\.optional\.([^.]+)\.(count|countAlt)$/;

/**
 * Midi-QOL resets optional bonuses usable once per turn (count "turn") for the combatant Combat#turn lands on. Do the
 * same for another creature starting its turn with its side.
 * @param {Actor} actor
 */
async function resetMidiTurnCounts(actor) {
  if ( !actor || !game.modules.get("midi-qol")?.active ) return;
  const keys = new Set();
  for ( const effect of actor.allApplicableEffects?.() ?? [] ) {
    for ( const change of effect.system?.changes ?? effect.changes ?? [] ) {
      const match = MIDI_OPTIONAL_COUNT.exec(change.key ?? "");
      if ( match && (change.value === "turn") ) keys.add(`optional.${match[1]}.used`);
    }
  }
  for ( const key of keys ) {
    if ( foundry.utils.getProperty(actor, `flags.midi-qol.${key}`) ) await actor.unsetFlag("midi-qol", key);
  }
}

/** deleteCombat hook. */
export function onDeleteCombat(combat) {
  started.delete(combat.id);
}
