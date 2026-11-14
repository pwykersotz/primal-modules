/**
 * The turn timer: how long the current turn has taken (in side initiative, the current side's turn).
 *
 * There is one timer per combat, kept in a combat flag that every client reads: {round, turn, combatantId, time,
 * pausedAt, server}. Times are Foundry's server time (game.time.serverTime), so it doesn't matter if computer clocks
 * disagree. Server time counts from when the world was launched, so `server` records roughly when that was, and a
 * timer from an earlier launch is started afresh. The timer belongs to a round and turn index, which are the combat's
 * own data and so the same on every client.
 *
 * Only the active GM's client writes it. Whenever anything that matters happens (the turn moves, the game is paused or
 * unpaused, a creature is removed, the GM's carousel redraws) the GM's client checks the flag against the combat and
 * the pause state and corrects it, so a missed event can't leave clients disagreeing. A GM's own turn changes carry
 * the new timer in the same update, so it starts at the same moment for everyone. Players never start a timer of their
 * own while a GM is online; with no GM online (nobody can pause then) each client counts from when it saw the turn
 * change.
 */
import { FLAGS, MODULE_ID, SETTINGS, setting } from "./constants.mjs";

/** With no GM online: each client's own record of when it saw the turn change. */
const seen = new Map();

/** Combats whose timer the GM's client is writing right now. */
const writing = new Set();

/** Foundry's server time in milliseconds. */
export function now() {
  const time = game.time?.serverTime;
  return Number.isFinite(time) ? time : Date.now();
}

/**
 * Roughly when the world was launched, by this computer's clock. Server time restarts from zero at each launch.
 * @returns {number|null}
 */
function serverStart() {
  const time = game.time?.serverTime;
  return Number.isFinite(time) ? Math.round(Date.now() - time) : null;
}

/**
 * Was this timer started since the world was last launched? (Its times mean nothing otherwise.)
 * Older timers without a launch time just have to be in the past.
 */
function isThisLaunch(timer) {
  if ( !Number.isFinite(timer?.time) || (timer.time > now() + 5000) ) return false;
  const start = serverStart();
  if ( !Number.isFinite(timer.server) || (start === null) ) return true;
  return Math.abs(timer.server - start) < 120_000;
}

/**
 * A new timer for a turn, starting now (stopped straight away if the game is paused).
 * @param {Combat} combat
 * @param {number} [round]
 * @param {number|null} [turn]
 */
function startTimer(combat, round=combat.round, turn=combat.turn) {
  const time = now();
  const combatantId = Number.isInteger(turn) ? (combat.turns[turn]?.id ?? null) : null;
  return { round, turn, combatantId, time, pausedAt: game.paused ? time : null, server: serverStart() };
}

/** Is this timer for the combat's current round and turn? */
function isCurrent(timer, combat) {
  return !!timer && Number.isFinite(timer.time) && (timer.round === combat.round) && (timer.turn === combat.turn);
}

/**
 * The current turn's timer, or null (before combat starts, or for a moment while the GM's client records it).
 * @param {Combat} combat
 * @returns {{time: number, pausedAt: number|null}|null}
 */
export function getTurnTimer(combat) {
  if ( !combat?.started || !Number.isInteger(combat.turn) ) return null;
  const flag = combat.getFlag(MODULE_ID, FLAGS.turnTimer);
  if ( isCurrent(flag, combat) ) return flag;
  if ( game.users.activeGM ) return null;
  let local = seen.get(combat.id);
  if ( !isCurrent(local, combat) ) seen.set(combat.id, local = startTimer(combat));
  return local;
}

/**
 * How long the current turn has taken, in milliseconds.
 * @param {{time: number, pausedAt: number|null}} timer
 */
export function elapsed(timer) {
  return Math.max(0, (Number.isFinite(timer.pausedAt) ? timer.pausedAt : now()) - timer.time);
}

/**
 * Minutes and seconds (1:05), or hours too once it gets that long (1:02:05).
 * @param {number} ms
 */
export function formatDuration(ms) {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Does the current user see the timer? */
export function isTimerVisible() {
  const mode = setting(SETTINGS.turnTimer);
  return (mode === "all") || ((mode === "gm") && game.user.isGM);
}

/* -------------------------------------------- */
/*  Keeping the timer right (active GM only)    */
/* -------------------------------------------- */

/**
 * Correct the combat's timer: start one for a new turn, and stop or restart it to match the game's pause state.
 * Only the active GM's client writes; it's safe to call as often as you like.
 * @param {Combat} combat
 * @param {object} [options]
 * @param {boolean} [options.restart]   Start the current turn's timer again from zero.
 */
export async function syncTimer(combat, { restart=false }={}) {
  if ( !combat?.started || !Number.isInteger(combat.turn) || !game.users.activeGM?.isSelf ) return;
  if ( writing.has(combat.id) ) return;
  const flag = combat.getFlag(MODULE_ID, FLAGS.turnTimer);
  const currentId = combat.combatant?.id ?? null;
  let next;
  if ( restart || !flag || !isThisLaunch(flag) || (flag.round !== combat.round) ) next = startTimer(combat);
  else if ( flag.turn === combat.turn ) {
    // The creature whose turn it was has been removed and the next one has slid into its place: a new turn.
    const removed = flag.combatantId && (flag.combatantId !== currentId) && !combat.combatants.get(flag.combatantId);
    next = removed ? startTimer(combat) : { ...flag, combatantId: currentId };
  }
  // Same creature's turn, it just moved in the order (someone rolled late): keep counting.
  else if ( flag.combatantId && (flag.combatantId === currentId) ) next = { ...flag, turn: combat.turn };
  else next = startTimer(combat);

  next.server ??= serverStart();

  // Stopped while the game is paused, and carrying on from the same time afterwards.
  const time = now();
  const stopped = Number.isFinite(next.pausedAt);
  if ( game.paused && !stopped ) next.pausedAt = time;
  else if ( !game.paused && stopped ) {
    next.time += time - next.pausedAt;
    next.pausedAt = null;
  }

  const keys = ["round", "turn", "combatantId", "time", "pausedAt", "server"];
  if ( flag && keys.every(k => (flag[k] ?? null) === (next[k] ?? null)) ) return;
  writing.add(combat.id);
  try {
    await combat.setFlag(MODULE_ID, FLAGS.turnTimer, next);
  } catch(err) {
    console.error(`${MODULE_ID} | Could not update the turn timer`, err);
  } finally {
    writing.delete(combat.id);
  }
}

/**
 * Start the timer again from zero (GM only). Handy after a break the game wasn't paused for.
 * @param {Combat} combat
 */
export async function restartTimer(combat) {
  if ( !game.user.isGM || !combat?.started ) return;
  if ( game.users.activeGM?.isSelf ) return syncTimer(combat, { restart: true });
  await combat.setFlag(MODULE_ID, FLAGS.turnTimer, startTimer(combat));
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/**
 * preUpdateCombat: when a GM moves the turn, the new timer goes in the same update, so it starts at the same moment
 * for everyone.
 */
export function onPreUpdateCombat(combat, changes) {
  if ( !game.user.isGM || !(("round" in changes) || ("turn" in changes)) ) return;
  const round = changes.round ?? combat.round;
  const turn = ("turn" in changes) ? changes.turn : combat.turn;
  if ( !round || !Number.isInteger(turn) ) return; // Combat is being un-started.
  if ( (round === combat.round) && (turn === combat.turn) ) return;
  // The same creature's turn at a new place in the order (the order was sorted again): it keeps its time.
  const flag = combat.getFlag(MODULE_ID, FLAGS.turnTimer);
  const nextId = combat.turns?.[turn]?.id;
  if ( (round === combat.round) && nextId && (flag?.round === round) && (flag.combatantId === nextId) ) return;
  foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FLAGS.turnTimer}`, startTimer(combat, round, turn));
}

/** updateCombat: check the timer whenever the turn moves (a player may have moved it). */
export function onUpdateCombat(combat, changes) {
  if ( ("round" in changes) || ("turn" in changes) ) syncTimer(combat);
}

/** deleteCombatant: removing the creature whose turn it is moves the turn on. */
export function onDeleteCombatant(combatant) {
  syncTimer(combatant.parent);
}

/** pauseGame: stop or restart the timer of the combat on screen. */
export function onPauseGame() {
  syncTimer(game.combat);
}
