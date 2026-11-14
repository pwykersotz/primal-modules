/**
 * The shared turn signal: who starts and who ends a turn, worked out once, for any module that runs something at a turn
 * edge (auras, class features, conditions).
 *
 * In individual initiative that's the one combatant whose turn it is. In side initiative Combat#turn only points at the
 * first creature of the acting side, but the whole side starts and ends its turn together (round 1's opening turn is
 * only the party members who beat the enemies). Working that out in every module is how they went wrong before, so
 * this module does it once.
 *
 * Hooks, on every client, after the combat update, only when the turn moves forward:
 *   Hooks.on("primal-combat.turnEnd", (combat, combatants, context) => ...)    everyone whose turn just ended
 *   Hooks.on("primal-combat.turnStart", (combat, combatants, context) => ...)  everyone whose turn starts now
 * turnEnd comes first. Neither waits for the other's handlers. context is {round, turn, side, mode, isActiveGM}: the
 * round and turn index of the turn that ended or started, the side ("party", "enemies", "event", or null in individual
 * initiative), the combat's mode ("standard" or "side"), and whether this client is the active GM (the one that should
 * change documents, so nothing happens twice).
 *
 * Who ended a turn is who started it, as this client saw it start; a client that only joined part way through works it
 * out from the turn order instead.
 */
import { MODULE_ID } from "./constants.mjs";
import { getMode, getSide, getSideTurnMembers, isSideMode } from "./sides.mjs";

export const TURN_START = `${MODULE_ID}.turnStart`;
export const TURN_END = `${MODULE_ID}.turnEnd`;

/** combat id -> {key, started: combatant ids, ended: combatant ids}, for the turn the combat is on. */
const records = new Map();

/** A turn's key. */
const keyOf = (round, turn) => `${Number(round) || 0}.${Number(turn) || 0}`;

/**
 * The combatant a turn state ({round, turn, combatantId}) points at.
 * @param {Combat} combat
 * @param {object} state
 * @returns {Combatant|null}
 */
function leadOf(combat, state) {
  if ( !state ) return null;
  return (state.combatantId && combat.combatants?.get?.(state.combatantId)) || combat.turns?.[Number(state.turn) || 0] || null;
}

/**
 * Everyone who acts in the turn `lead` leads, in a given round.
 * @param {Combat} combat
 * @param {Combatant|null} lead
 * @param {number} round
 * @returns {Combatant[]}
 */
function membersOf(combat, lead, round) {
  if ( !lead ) return [];
  if ( !isSideMode(combat) ) return [lead];
  try {
    const members = getSideTurnMembers(combat, lead, round);
    return members.includes(lead) ? members : [lead, ...members];
  } catch(err) {
    console.warn(`${MODULE_ID} | Could not work out the acting side; using ${lead.name} only`, err);
    return [lead];
  }
}

/**
 * Who started the combat's current turn, and who ended the turn before it.
 * @param {Combat} combat
 * @returns {{started: Combatant[], ended: Combatant[]}}
 */
export function getTurnChange(combat) {
  if ( !combat?.started || !combat.combatant ) return { started: [], ended: [] };
  const key = keyOf(combat.round, combat.turn);
  let record = records.get(combat.id);
  if ( record?.key !== key ) {
    const prior = combat.previous;
    let ended = [];
    if ( Number(prior?.round) >= 1 ) {
      const lead = leadOf(combat, prior);
      ended = (record?.key === keyOf(prior.round, prior.turn)) ? [...record.started]
        : membersOf(combat, lead, Number(prior.round)).map(c => c.id);
      if ( lead && !ended.includes(lead.id) ) ended.unshift(lead.id);
    }
    record = { key, started: membersOf(combat, combat.combatant, combat.round).map(c => c.id), ended };
    records.set(combat.id, record);
  }
  const get = ids => ids.map(id => combat.combatants.get(id)).filter(Boolean);
  return { started: get(record.started), ended: get(record.ended) };
}

/**
 * Everyone whose turn it is now: one combatant, or the acting side.
 * @param {Combat} combat
 * @returns {Combatant[]}
 */
export function getTurnStarters(combat) {
  return getTurnChange(combat).started;
}

/**
 * Everyone whose turn ended when the combat moved to its current turn.
 * @param {Combat} combat
 * @returns {Combatant[]}
 */
export function getTurnEnders(combat) {
  return getTurnChange(combat).ended;
}

/** Did the combat's last turn change move forward? */
function movedForward(combat, options) {
  if ( options?.direction === -1 ) return false;
  const prior = combat.previous;
  if ( !(Number(prior?.round) >= 0) || (prior.round === null) ) return true;
  if ( combat.round !== prior.round ) return combat.round > prior.round;
  return (Number(combat.turn) || 0) > (Number(prior.turn) || 0);
}

/** Call a hook without letting one listener's error stop the others or the combat update. */
function call(hook, ...args) {
  try {
    Hooks.callAll(hook, ...args);
  } catch(err) {
    console.error(`${MODULE_ID} | A ${hook} listener failed`, err);
  }
}

/**
 * updateCombat hook: work out who ended and who starts, and tell everyone.
 * @param {Combat} combat
 * @param {object} changes
 * @param {object} [options]
 */
export function onUpdateCombat(combat, changes, options) {
  if ( !("turn" in changes) && !("round" in changes) ) return;
  if ( !combat?.started || !combat.combatant ) return;
  const { started, ended } = getTurnChange(combat);
  if ( !movedForward(combat, options) ) return;
  const side = isSideMode(combat);
  const base = { mode: getMode(combat), isActiveGM: !!game.users?.activeGM?.isSelf };
  const prior = combat.previous;
  if ( ended.length ) {
    call(TURN_END, combat, ended, { ...base, round: Number(prior.round), turn: Number(prior.turn) || 0, side: side ? getSide(ended[0]) : null });
  }
  if ( started.length ) {
    call(TURN_START, combat, started, { ...base, round: combat.round, turn: combat.turn ?? 0, side: side ? getSide(started[0]) : null });
  }
}

/** deleteCombat hook. */
export function onDeleteCombat(combat) {
  records.delete(combat?.id);
}
