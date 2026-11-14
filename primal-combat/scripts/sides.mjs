/**
 * Side initiative, the way this table plays it:
 *
 * - Everyone on the party's side rolls their own initiative as usual.
 * - The enemies don't roll. They all act on the highest static initiative in their group (dnd5e's initiative score,
 *   10 + the initiative bonus).
 * - In round 1, party members who beat that number go first. Then the enemies, then the whole party, then the
 *   enemies, and so on. A tie goes to the enemies.
 *
 * In Foundry terms: party members keep their rolls, every enemy gets the enemies' number as its initiative, so the
 * turn order reads [party who beat them] [enemies] [rest of the party]. Combat#turn always points at the first member
 * of whichever side is acting, and moving to the other side moves it forward to the next block, wrapping into the next
 * round when it runs out. Round 1 therefore runs fast party, enemies, whole party; every later round runs enemies,
 * whole party. Foundry would only run its turn start and end steps for the combatant Combat#turn points at, so
 * turn-events.mjs runs them for everyone acting: turn start for the whole side when its turn begins, turn end when it
 * ends.
 *
 * Players mark their own combatant done by clicking its portrait. That's stored in a combatant flag (owners may change
 * flags, so no socket is needed) naming the side's turn it belongs to, so it clears itself when the next side's turn
 * starts. When everyone acting is done, the active GM's client (or, with no GM online, the player
 * who clicked) moves on to the other side.
 *
 * Lair actions and other events on an initiative count (events.mjs) are combatants without an actor, on a side of
 * their own. In side initiative an event whose count beats the enemies' number happens just before the enemies' turn,
 * and any other event just after it, before the party. Each run of events in the turn order is a turn of its own.
 */
import { FLAGS, MODES, MODULE_ID, SETTINGS, SIDES, loc, setting } from "./constants.mjs";

/* -------------------------------------------- */
/*  Reading state                               */
/* -------------------------------------------- */

/**
 * Which way a combat runs: its own flag, or the world default.
 * @param {Combat} combat
 * @returns {"standard"|"side"}
 */
export function getMode(combat) {
  const mode = combat?.getFlag(MODULE_ID, FLAGS.mode);
  return Object.values(MODES).includes(mode) ? mode : setting(SETTINGS.defaultMode);
}

/** @param {Combat} combat */
export function isSideMode(combat) {
  return !!combat && (getMode(combat) === MODES.side);
}

/**
 * Is this combatant a lair action or other event on an initiative count, rather than a creature?
 * @param {Combatant} combatant
 */
export function isEvent(combatant) {
  const data = combatant?.getFlag?.(MODULE_ID, FLAGS.event);
  return !!data && (typeof data === "object");
}

/**
 * The initiative count an event happens on: its initiative, or the count it was given if that has been cleared.
 * @param {Combatant} combatant
 * @returns {number|null}
 */
export function eventCount(combatant) {
  if ( Number.isFinite(combatant.initiative) ) return combatant.initiative;
  const count = Number(combatant.getFlag(MODULE_ID, FLAGS.event)?.count);
  return Number.isFinite(count) ? count : null;
}

/**
 * Which side a combatant fights on. The GM can move a combatant with the carousel's right-click menu. Otherwise
 * player characters and every creature not marked hostile are on the party's side. Events are on a side of their own.
 * @param {Combatant} combatant
 * @returns {"party"|"enemies"|"event"}
 */
export function getSide(combatant) {
  if ( isEvent(combatant) ) return SIDES.event;
  const flag = combatant.getFlag(MODULE_ID, FLAGS.side);
  if ( (flag === SIDES.party) || (flag === SIDES.enemies) ) return flag;
  if ( combatant.hasPlayerOwner ) return SIDES.party;
  const disposition = combatant.token?.disposition ?? combatant.actor?.prototypeToken?.disposition;
  return disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE ? SIDES.enemies : SIDES.party;
}

/** @param {"party"|"enemies"} side */
export function otherSide(side) {
  return side === SIDES.party ? SIDES.enemies : SIDES.party;
}

/**
 * A creature's static initiative: dnd5e's initiative score (10 + initiative bonus, ±5 for advantage or
 * disadvantage), plus the Dexterity tie-breaker when that dnd5e setting is on, so it compares fairly with rolls.
 * @param {Actor} actor
 * @returns {number|null}
 */
export function staticInitiative(actor) {
  const init = actor?.system?.attributes?.init;
  if ( !init ) return null;
  let score = Number(init.score);
  if ( !Number.isFinite(score) ) {
    const bonus = Number(init.total ?? init.mod);
    if ( !Number.isFinite(bonus) ) return null;
    score = 10 + bonus;
  }
  try {
    if ( (game.system.id === "dnd5e") && game.settings.get("dnd5e", "initiativeDexTiebreaker") ) {
      const ability = actor.system.abilities?.[init.ability || "dex"];
      if ( Number.isNumeric(ability?.value) ) score += Number(ability.value) / 100;
    }
  } catch(err) { /* The setting may not exist in other systems or versions. */ }
  return score;
}

/**
 * A number a combatant always acts on, set by another module (Primal Drakkenheim's Epic Bosses act on 20), or null.
 * @param {Combatant} combatant
 * @returns {number|null}
 */
export function fixedInitiative(combatant) {
  const value = combatant?.flags?.[MODULE_ID]?.[FLAGS.fixedInitiative];
  return ((value !== null) && (value !== undefined) && (value !== "") && Number.isFinite(Number(value))) ? Number(value) : null;
}

/**
 * The enemies' initiative: the highest static initiative among them (a fixed initiative counts as theirs).
 * @param {Combat} combat
 * @returns {{value: number, name: string}|null}
 */
export function computeEnemyInitiative(combat) {
  let best = null;
  for ( const combatant of combat.combatants ) {
    if ( getSide(combatant) !== SIDES.enemies ) continue;
    const value = fixedInitiative(combatant) ?? staticInitiative(combatant.actor);
    if ( !Number.isFinite(value) ) continue;
    if ( !best || (value > best.value) ) best = { value, name: combatant.name };
  }
  return best;
}

/**
 * The enemies' initiative as last applied to the combat.
 * @param {Combat} combat
 * @returns {{value: number, name: string}|null}
 */
export function getEnemyInitiative(combat) {
  const data = combat?.getFlag(MODULE_ID, FLAGS.enemyInit);
  return Number.isFinite(data?.value) ? data : null;
}

/**
 * The side that is acting now, or null before combat starts.
 * @param {Combat} combat
 * @returns {"party"|"enemies"|null}
 */
export function getActiveSide(combat) {
  if ( !combat?.started ) return null;
  const combatant = combat.combatant;
  return combatant ? getSide(combatant) : null;
}

/**
 * Is this round 1's opening turn, where only the party members who beat the enemies act?
 * @param {Combat} combat
 */
export function isOpeningTurn(combat) {
  if ( !combat?.started || (combat.round !== 1) || (getActiveSide(combat) !== SIDES.party) ) return false;
  return combat.turns.slice((combat.turn ?? 0) + 1).some(c => getSide(c) === SIDES.enemies);
}

/**
 * Everyone acting right now: the whole acting side, except in round 1's opening turn, which is only the party
 * members ahead of the enemies in the turn order (the ones who beat them).
 * @param {Combat} combat
 * @returns {Combatant[]}
 */
export function getActingMembers(combat) {
  if ( !combat?.started || !combat.combatant ) return [];
  return getSideTurnMembers(combat, combat.combatant, combat.round);
}

/**
 * Everyone who acts in the side's turn that Combat#turn points at `lead` for, in a given round, in turn order: the
 * whole of the lead's side, except in round 1's opening turn (the party, with enemies still to come after the lead),
 * which is only the party members ahead of the enemies. For an event, it's the run of events next to each other in the
 * turn order that the lead is part of. The lead is always included.
 * @param {Combat} combat
 * @param {Combatant} lead   The combatant Combat#turn points at for that side's turn.
 * @param {number} round
 * @returns {Combatant[]}
 */
export function getSideTurnMembers(combat, lead, round) {
  const side = getSide(lead);
  const turns = combat.turns;
  const index = turns.indexOf(lead);
  if ( side === SIDES.event ) {
    if ( index === -1 ) return [lead];
    let start = index;
    let end = index;
    while ( (start > 0) && isEvent(turns[start - 1]) ) start--;
    while ( (end < turns.length - 1) && isEvent(turns[end + 1]) ) end++;
    return turns.slice(start, end + 1);
  }
  let members;
  if ( (round === 1) && (side === SIDES.party) && turns.slice(index + 1).some(c => getSide(c) === SIDES.enemies) ) {
    const firstEnemy = turns.findIndex(c => getSide(c) === SIDES.enemies);
    members = turns.slice(0, firstEnemy).filter(c => getSide(c) === SIDES.party);
  }
  else members = getMembers(combat, side);
  if ( (index !== -1) && !members.includes(lead) ) members = turns.filter(c => (c === lead) || members.includes(c));
  return members;
}

/** @param {Combatant} combatant */
export function isActing(combatant) {
  return getActingMembers(combatant.parent).includes(combatant);
}

/**
 * The members of a side, in turn order.
 * @param {Combat} combat
 * @param {"party"|"enemies"} side
 * @returns {Combatant[]}
 */
export function getMembers(combat, side) {
  return combat.turns.filter(c => getSide(c) === side);
}

/**
 * Which side's turn this is, as "round.combatantId" (the combatant Combat#turn points at). Done marks only count for
 * the side's turn they were made in. The combatant rather than the turn index is used because Foundry keeps the same
 * combatant current when someone rolls late and the order shifts, but the index changes.
 * @param {Combat} combat
 * @returns {string|null}
 */
function turnKey(combat) {
  if ( !combat?.started ) return null;
  const id = combat.combatant?.id ?? combat.turn ?? 0;
  return `${combat.round}.${id}`;
}

/**
 * Has this combatant finished its turn? Only used in side initiative.
 * @param {Combatant} combatant
 */
export function isDone(combatant) {
  const key = turnKey(combatant.parent);
  return !!key && (combatant.getFlag(MODULE_ID, FLAGS.done) === key);
}

/**
 * Can the current user mark this combatant done or not done right now?
 * @param {Combatant} combatant
 */
export function canToggleDone(combatant) {
  const combat = combatant.parent;
  if ( !combat?.started || !isSideMode(combat) || !combatant.isOwner || combatant.isDefeated ) return false;
  return isActing(combatant);
}

/**
 * Is the acting side the last to go this round?
 * @param {Combat} combat
 */
export function isLastSideTurn(combat) {
  if ( !combat?.started || !combat.turns.length || (combat.turn === null) ) return false;
  return forwardTarget(combat, combat.turn) === null;
}

/**
 * How the carousel groups portraits in side initiative, in the order they'll act.
 * Before combat: blocks of the turn order (party who beat the enemies, enemies, rest of the party).
 * During combat: whoever is acting, then everyone else in turn order, in blocks by side.
 * @param {Combat} combat
 * @returns {{side: string, members: Combatant[], acting: boolean, opening: boolean, nextRound: boolean}[]}
 */
export function getDisplayGroups(combat) {
  const groups = [];
  const addBlocks = (combatants, nextRound=false) => {
    for ( const combatant of combatants ) {
      const side = getSide(combatant);
      const last = groups.at(-1);
      if ( last && !last.acting && (last.side === side) ) last.members.push(combatant);
      else groups.push({ side, members: [combatant], acting: false, opening: false, nextRound });
    }
  };
  if ( !combat.started ) {
    addBlocks(combat.turns);
    // The first block is the party members who beat the enemies, once the enemies' number has been worked out.
    const hasEnemies = groups.some(g => g.side === SIDES.enemies);
    if ( (groups[0]?.side === SIDES.party) && hasEnemies && getEnemyInitiative(combat) ) groups[0].opening = true;
    return groups;
  }
  const acting = getActingMembers(combat);
  if ( acting.length ) {
    groups.push({ side: getActiveSide(combat), members: acting, acting: true, opening: isOpeningTurn(combat),
      nextRound: false });
  }
  addBlocks(combat.turns.filter(c => !acting.includes(c)), isLastSideTurn(combat));
  return groups;
}

/* -------------------------------------------- */
/*  Changing state                              */
/* -------------------------------------------- */

/**
 * Mark a combatant done (faded) or not done for this side's turn.
 * @param {Combatant} combatant
 * @param {boolean} [done]   Leave out to flip it.
 */
export async function setDone(combatant, done) {
  const key = turnKey(combatant.parent);
  if ( !key ) return;
  done ??= !isDone(combatant);
  await combatant.update({ [`flags.${MODULE_ID}.${FLAGS.done}`]: done ? key : null });
}

/**
 * Mark (or un-mark) everything the current user owns that is acting. This is what a player's End Turn does in side
 * initiative, so the sidebar's End Turn button can't end the whole side's turn for everyone.
 * @param {Combat} combat
 * @param {boolean} [done=true]
 * @returns {Promise<Combat>}
 */
export async function setOwnDone(combat, done=true) {
  const mine = getActingMembers(combat).filter(c => c.isOwner && !c.isDefeated && (isDone(c) !== done));
  for ( const combatant of mine ) await setDone(combatant, done);
  return combat;
}

/**
 * Switch a combat between individual and side initiative.
 * @param {Combat} combat
 * @param {"standard"|"side"} mode
 */
export async function setMode(combat, mode) {
  const currentId = combat.combatant?.id ?? null;
  await combat.setFlag(MODULE_ID, FLAGS.mode, mode);
  if ( mode === MODES.side ) await applyEnemyInitiative(combat);
  await keepCurrentTurn(combat, currentId);
  refreshTurnMarkers(combat);
}

/**
 * Sort the turn order again on this client. Where events go depends on the mode and the enemies' number, which are
 * combat flags, and Foundry only sorts again when a combatant changes.
 * @param {Combat} combat
 */
export function resortTurns(combat) {
  if ( combat?.combatants?.size && (typeof combat.setupTurns === "function") ) combat.setupTurns();
}

/**
 * After the turn order has been sorted again, point Combat#turn back at the combatant whose turn it was (GM only).
 * @param {Combat} combat
 * @param {string|null} currentId
 */
async function keepCurrentTurn(combat, currentId) {
  resortTurns(combat);
  if ( !combat.started || !currentId || !game.user.isGM ) return;
  const turn = combat.turns.findIndex(c => c.id === currentId);
  if ( (turn !== -1) && (turn !== combat.turn) ) await combat.update({ turn }, { turnEvents: false });
}

/**
 * updateCombat hook: when the mode or the enemies' number changes, sort the turn order again (every client).
 */
export function onUpdateCombatOrder(combat, changes) {
  const flags = changes.flags?.[MODULE_ID];
  if ( !flags ) return;
  const keys = [FLAGS.mode, FLAGS.enemyInit];
  if ( keys.some(k => (k in flags) || (`-=${k}` in flags)) ) resortTurns(combat);
}

/**
 * Move a combatant to the other side (GM only).
 * @param {Combatant} combatant
 */
export async function switchSide(combatant) {
  const combat = combatant.parent;
  const side = otherSide(getSide(combatant));
  const update = { [`flags.${MODULE_ID}.${FLAGS.side}`]: side };
  if ( isSideMode(combat) ) {
    // Party members roll their own initiative; enemies act on the enemies' number.
    const enemyInit = getEnemyInitiative(combat);
    if ( side === SIDES.party ) update.initiative = null;
    else if ( enemyInit && combat.started ) update.initiative = enemyInit.value;
  }
  await combatant.update(update);
  if ( isSideMode(combat) && !combat.started ) await applyEnemyInitiative(combat);
}

/**
 * Work out the enemies' initiative (their highest static initiative) and give it to every enemy (GM only).
 * Before combat starts it's worked out afresh; once combat is running, newcomers just take the existing number.
 * @param {Combat} combat
 */
export async function applyEnemyInitiative(combat) {
  if ( !game.user.isGM || !combat ) return;
  let enemyInit = getEnemyInitiative(combat);
  if ( !combat.started || !enemyInit ) {
    enemyInit = computeEnemyInitiative(combat);
    if ( !enemyInit ) return;
    const stored = getEnemyInitiative(combat);
    if ( (stored?.value !== enemyInit.value) || (stored?.name !== enemyInit.name) ) {
      await combat.setFlag(MODULE_ID, FLAGS.enemyInit, enemyInit);
    }
  }
  const updates = [];
  for ( const combatant of combat.combatants ) {
    if ( getSide(combatant) !== SIDES.enemies ) continue;
    if ( combatant.initiative !== enemyInit.value ) updates.push({ _id: combatant.id, initiative: enemyInit.value });
  }
  if ( updates.length ) await combat.updateEmbeddedDocuments("Combatant", updates, { turnEvents: false });
}

/**
 * Roll initiative for the GM's creatures on the party's side that haven't rolled (GM only).
 * @param {Combat} combat
 */
export async function rollPartyNPCs(combat) {
  const ids = combat.combatants
    .filter(c => (getSide(c) === SIDES.party) && c.isNPC && c.isOwner && !Number.isFinite(c.initiative))
    .map(c => c.id);
  if ( ids.length ) await combat.rollInitiative(ids);
}

/**
 * Clear the party's initiative rolls so they can roll again (GM only). The enemies keep their number.
 * @param {Combat} combat
 */
export async function resetParty(combat) {
  const updates = getMembers(combat, SIDES.party).filter(c => c.initiative !== null)
    .map(c => ({ _id: c.id, initiative: null }));
  if ( updates.length ) await combat.updateEmbeddedDocuments("Combatant", updates);
}

/**
 * Roll for everyone in the party who hasn't rolled yet (GM only), for when players are slow to roll.
 * @param {Combat} combat
 */
export async function rollParty(combat) {
  const ids = getMembers(combat, SIDES.party).filter(c => !Number.isFinite(c.initiative)).map(c => c.id);
  if ( ids.length ) await combat.rollInitiative(ids);
}

/**
 * Post who goes first, once combat begins.
 * @param {Combat} combat
 */
export async function announceOrder(combat) {
  const enemyInit = getEnemyInitiative(combat);
  if ( !enemyInit ) return;
  const value = Math.trunc(enemyInit.value);
  const party = getMembers(combat, SIDES.party);
  const first = party.filter(c => Number.isFinite(c.initiative) && (c.initiative > enemyInit.value) && !c.hidden);
  const unrolled = party.filter(c => !Number.isFinite(c.initiative) && !c.hidden);
  const esc = foundry.utils.escapeHTML;
  const names = list => list.map(c => esc(c.name)).join(", ");
  const lines = [`<p>${loc("Chat.EnemiesAct", { value })}</p>`];
  if ( first.length ) lines.push(`<p>${loc("Chat.FirstUp", { names: names(first) })}</p>`);
  else lines.push(`<p>${loc("Chat.EnemiesFirst")}</p>`);
  if ( unrolled.length ) lines.push(`<p class="unrolled">${loc("Chat.NotRolled", { names: names(unrolled) })}</p>`);
  await foundry.documents.ChatMessage.implementation.create({
    speaker: { alias: loc("Chat.Speaker") },
    content: `<div class="primal-combat-side-message">${lines.join("")}</div>`
  });
}

/* -------------------------------------------- */
/*  Moving between sides                        */
/* -------------------------------------------- */

/** Can the turn land on this index? Not on a defeated combatant, if Foundry is set to skip them. */
function isValidTurn(combat, index) {
  return !combat.settings.skipDefeated || !combat.turns[index].isDefeated;
}

/** The next index after `from`, in the same round, where the other side starts. */
function forwardTarget(combat, from) {
  const side = getSide(combat.turns[from]);
  for ( let i = from + 1; i < combat.turns.length; i++ ) {
    if ( (getSide(combat.turns[i]) !== side) && isValidTurn(combat, i) ) return i;
  }
  return null;
}

/** Where the next round starts, after a side's turn at `from`: the first index of the other side. */
function wrapTarget(combat, from) {
  const side = getSide(combat.turns[from]);
  for ( let i = 0; i < combat.turns.length; i++ ) {
    if ( (getSide(combat.turns[i]) !== side) && isValidTurn(combat, i) ) return i;
  }
  return null;
}

/** The first index the turn can land on. */
function firstValidTurn(combat) {
  const index = combat.turns.findIndex((c, i) => isValidTurn(combat, i));
  return index === -1 ? 0 : index;
}

/**
 * Where Combat#turn points for each side's turn in a round.
 * @param {Combat} combat
 * @param {number} round
 * @returns {number[]}
 */
function sideTurnsInRound(combat, round) {
  const chain = start => {
    const list = [start];
    for ( let next = forwardTarget(combat, start); next !== null; next = forwardTarget(combat, next) ) list.push(next);
    return list;
  };
  const first = chain(firstValidTurn(combat));
  if ( round <= 1 ) return first;
  const start = wrapTarget(combat, first.at(-1));
  return start === null ? first : chain(start);
}

/**
 * Move Combat#turn, the way Foundry's own Next Turn and Previous Turn do (hooks, world time and all).
 */
async function moveTurn(combat, round, turn, direction) {
  const updateData = { round, turn };
  const updateOptions = {
    direction,
    worldTime: { delta: combat.getTimeDelta(combat.round, combat.turn, round, turn) }
  };
  Hooks.callAll(round === combat.round ? "combatTurn" : "combatRound", combat, updateData, updateOptions);
  await combat.update(updateData, updateOptions);
  return combat;
}

/**
 * End the acting side's turn: move to the other side's next block, or into the next round.
 * @param {Combat} combat
 * @returns {Promise<Combat>}
 */
export async function nextSide(combat) {
  if ( !combat.started || !combat.turns.length ) return combat.nextRound();
  const from = combat.turn ?? 0;
  const forward = forwardTarget(combat, from);
  if ( forward !== null ) return moveTurn(combat, combat.round, forward, 1);
  const wrap = wrapTarget(combat, from);
  if ( wrap === null ) return combat.nextRound(); // Nobody left on the other side.
  return moveTurn(combat, combat.round + 1, wrap, 1);
}

/**
 * Go back to the previous side's turn. That side (and anything after it) is no longer marked done.
 * @param {Combat} combat
 * @returns {Promise<Combat>}
 */
export async function previousSide(combat) {
  if ( !combat.started ) return combat;
  if ( !combat.turns.length || (combat.turn === null) ) return combat.previousRound();
  const current = combat.turn;
  const starts = sideTurnsInRound(combat, combat.round);
  let index = -1;
  starts.forEach((start, i) => {
    if ( start <= current ) index = i;
  });

  let round = combat.round;
  let target;
  if ( index > 0 ) target = starts[index - 1];
  else {
    // Going back past round 1's first side un-starts the combat, the same as Foundry's own Previous Turn.
    if ( round <= 1 ) return combat.previousRound();
    round -= 1;
    target = sideTurnsInRound(combat, round).at(-1);
  }
  await clearDoneFrom(combat, round, target);
  return moveTurn(combat, round, target, -1);
}

/**
 * Un-mark combatants that were marked done at or after a point in the combat (GM only).
 * @param {Combat} combat
 * @param {number} round
 * @param {number} turn
 */
async function clearDoneFrom(combat, round, turn) {
  if ( !game.user.isGM ) return;
  const updates = [];
  for ( const combatant of combat.combatants ) {
    const key = combatant.getFlag(MODULE_ID, FLAGS.done);
    if ( typeof key !== "string" ) continue;
    const [r, id] = key.split(".");
    const t = combat.turns.findIndex(c => c.id === id);
    if ( (Number(r) > round) || ((Number(r) === round) && ((t === -1) || (t >= turn))) ) {
      updates.push({ _id: combatant.id, [`flags.${MODULE_ID}.${FLAGS.done}`]: null });
    }
  }
  if ( updates.length ) await combat.updateEmbeddedDocuments("Combatant", updates, { turnEvents: false });
}

/* -------------------------------------------- */
/*  Reacting to changes                         */
/* -------------------------------------------- */

/**
 * Should this client act on a change? The active GM does; with no GM online, the user who made the change does.
 * @param {string} userId   The user who made the change.
 */
function isResponsible(userId) {
  const gm = game.users.activeGM;
  return gm ? gm.isSelf : (userId === game.userId);
}

let advanceTimer = null;

/**
 * After someone is marked done (or defeated), move on to the other side if nobody acting is left.
 * Waits a moment so everyone sees the last portrait fade first.
 * @param {Combat} combat
 * @param {string} userId
 */
function scheduleAutoAdvance(combat, userId) {
  if ( !combat?.started || !isSideMode(combat) || !setting(SETTINGS.autoAdvance) || !isResponsible(userId) ) return;
  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(() => {
    advanceTimer = null;
    if ( !game.combats.has(combat.id) || !combat.started || !isSideMode(combat) ) return;
    const standing = getActingMembers(combat).filter(c => !c.isDefeated);
    if ( !standing.length || standing.some(c => !isDone(c)) ) return;
    nextSide(combat).catch(err => console.error(`${MODULE_ID} | Could not move to the next side`, err));
  }, 900);
}

/**
 * Before combat starts, work the enemies' number out again whenever who's fighting changes (GM only).
 * @param {Combat} combat
 */
export const scheduleEnemyInitiative = foundry.utils.debounce(combat => {
  if ( !game.combats.has(combat.id) || combat.started || !isSideMode(combat) || !game.users.activeGM?.isSelf ) return;
  applyEnemyInitiative(combat).catch(err => console.error(`${MODULE_ID} | Could not set the enemies' initiative`, err));
}, 250);

/**
 * updateCombatant hook.
 */
export function onUpdateCombatant(combatant, changes, options, userId) {
  const combat = combatant.parent;
  if ( !combat ) return;
  const doneChanged = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${FLAGS.done}`);
  const sideChanged = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${FLAGS.side}`);
  if ( doneChanged || ("defeated" in changes) ) scheduleAutoAdvance(combat, userId);
  if ( doneChanged || sideChanged || ("defeated" in changes) || ("initiative" in changes) ) refreshTurnMarkers(combat);
  if ( !isSideMode(combat) || !game.users.activeGM?.isSelf ) return;
  if ( sideChanged && !combat.started ) scheduleEnemyInitiative(combat);

  // Enemies always act on the enemies' number. Rolling one individually (from the sidebar, say) is undone.
  if ( ("initiative" in changes) && (getSide(combatant) === SIDES.enemies) ) {
    const value = getEnemyInitiative(combat)?.value;
    if ( Number.isFinite(value) && (combatant.initiative !== value) ) {
      combatant.update({ initiative: value }).catch(() => null);
    }
  }
}

/**
 * createCombatant hook: an enemy joining a side-initiative fight takes the enemies' number.
 */
export function onCreateCombatant(combatant) {
  const combat = combatant.parent;
  if ( !combat || !isSideMode(combat) || !game.users.activeGM?.isSelf ) return;
  if ( !combat.started ) return scheduleEnemyInitiative(combat);
  const value = getEnemyInitiative(combat)?.value;
  if ( (getSide(combatant) === SIDES.enemies) && Number.isFinite(value) && (combatant.initiative !== value) ) {
    combatant.update({ initiative: value }).catch(() => null);
  }
}

/**
 * deleteCombatant hook: before combat starts, removing the toughest enemy lowers the enemies' number.
 */
export function onDeleteCombatant(combatant) {
  const combat = combatant.parent;
  if ( combat && !combat.started && isSideMode(combat) && game.users.activeGM?.isSelf ) scheduleEnemyInitiative(combat);
}

/* -------------------------------------------- */
/*  Turn order and canvas turn markers          */
/* -------------------------------------------- */

/**
 * Turn order. Between creatures this only breaks ties: when a party member ties the enemies' number, the enemies go
 * first ("beat" means beat). Anything involving an event is decided here (see orderKey).
 * @param {Combatant} a
 * @param {Combatant} b
 * @returns {number|null}   null leaves the order to the system.
 */
export function compareSides(a, b) {
  const combat = a.parent ?? b.parent;
  const eventA = isEvent(a);
  const eventB = isEvent(b);
  if ( !eventA && !eventB ) {
    if ( (a.initiative !== b.initiative) || !Number.isFinite(a.initiative) ) return null;
    if ( !isSideMode(combat) ) return null;
    const sideA = getSide(a);
    const sideB = getSide(b);
    if ( sideA === sideB ) return null;
    return sideA === SIDES.enemies ? -1 : 1;
  }
  const sides = isSideMode(combat) ? { anchor: sideAnchor(combat) } : null;
  const [valueA, tierA] = orderKey(a, sides);
  const [valueB, tierB] = orderKey(b, sides);
  if ( valueA !== valueB ) return valueA > valueB ? -1 : 1;
  if ( tierA !== tierB ) return tierA - tierB;
  if ( !eventA || !eventB ) return eventA ? 1 : -1;
  // Two events in the same place: the higher count first, then by name.
  const countA = eventCount(a) ?? -Infinity;
  const countB = eventCount(b) ?? -Infinity;
  if ( countA !== countB ) return countA > countB ? -1 : 1;
  return String(a.name ?? "").localeCompare(String(b.name ?? "")) || (a.id > b.id ? 1 : -1);
}

/**
 * In side initiative, the number events are placed around: the enemies' number, while there are enemies.
 * @param {Combat} combat
 * @returns {number|null}
 */
function sideAnchor(combat) {
  const value = getEnemyInitiative(combat)?.value;
  if ( !Number.isFinite(value) ) return null;
  return combat.combatants.some(c => getSide(c) === SIDES.enemies) ? value : null;
}

/**
 * In side initiative, when an event happens: just before the enemies' turn, just after it, or (with no enemies) at
 * the start of the round.
 * @param {Combatant} combatant
 * @returns {"before"|"after"|"top"|null}   null for a creature, or in individual initiative.
 */
export function eventPlacement(combatant) {
  const combat = combatant?.parent;
  if ( !isEvent(combatant) || !isSideMode(combat) ) return null;
  const anchor = sideAnchor(combat);
  if ( anchor === null ) return "top";
  const count = eventCount(combatant);
  return (count !== null) && (count > anchor) ? "before" : "after";
}

/**
 * Where a combatant goes in the turn order, as [value, tier]: higher values first, and on equal values lower tiers
 * first.
 * - Individual initiative: creatures by initiative, events by count, and an event loses ties (as lair actions do).
 * - Side initiative: party members by their roll and enemies by the enemies' number, enemies winning ties. An event
 *   whose count beats the enemies' number goes just before the enemies, any other event just after them (before any
 *   party member who tied them). With no enemies, events open the round.
 * @param {Combatant} combatant
 * @param {{anchor: number|null}|null} sides   null in individual initiative.
 * @returns {[number, number]}
 */
function orderKey(combatant, sides) {
  const initiative = Number.isFinite(combatant.initiative) ? combatant.initiative : -Infinity;
  if ( !isEvent(combatant) ) {
    if ( !sides ) return [initiative, 0];
    return [initiative, getSide(combatant) === SIDES.enemies ? 0 : 2];
  }
  const count = eventCount(combatant);
  if ( !sides ) return [count ?? -Infinity, 1];
  if ( sides.anchor === null ) return [Infinity, 0];
  return (count !== null) && (count > sides.anchor) ? [sides.anchor, -1] : [sides.anchor, 1];
}

/**
 * In side initiative, should this token show the turn marker? Everyone acting does until they're done.
 * @param {Token} token
 * @returns {boolean|null}   null leaves the decision to Foundry (individual initiative, or not in this combat).
 */
export function wantsSideTurnMarker(token) {
  const combat = game.combat;
  if ( !combat?.started || !isSideMode(combat) || !setting(SETTINGS.sideTurnMarkers) ) return null;
  const sceneId = token.document.parent?.id;
  const combatant = combat.combatants.find(c => (c.tokenId === token.id) && (!c.sceneId || (c.sceneId === sceneId)));
  if ( !combatant ) return null;
  return isActing(combatant) && !isDone(combatant) && !combatant.isDefeated;
}

/**
 * Ask every token in a combat to redraw its turn marker.
 * @param {Combat} [combat]
 */
export function refreshTurnMarkers(combat=game.combat) {
  if ( !canvas?.ready || !combat ) return;
  for ( const combatant of combat.combatants ) {
    const token = combatant.token?.object;
    if ( token && !token.destroyed ) token.renderFlags.set({ refreshTurnMarker: true });
  }
}
