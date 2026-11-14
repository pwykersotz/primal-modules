/**
 * Asking the GM. A player can't change the shopkeeper (its stock, its offers, its inventory and coins), read every
 * compendium, or put an item made from a compendium the player can't see into their inventory, so every trade is made
 * by the active GM's client, over the module's socket. A GM makes them at once. The socket also carries messages to
 * every client (an offer made, an offer answered).
 */
import { MODULE_ID, SOCKET, loc, newId } from "./constants.mjs";

const PENDING = new Map();
const TIMEOUT_MS = 30000;

/** What the GM can be asked to do (filled in by trade.mjs). */
export const HANDLERS = {};

/** What other clients can tell every client (see broadcast). */
const BROADCASTS = new Map();

/** Listen for a message sent to every client. */
export function onBroadcast(type, fn) {
  BROADCASTS.set(type, fn);
}

/** Tell every other client something (and this one, with self: true). */
export function broadcast(type, data, { self=false }={}) {
  game.socket?.emit(SOCKET, { kind: "broadcast", type, data, from: game.user.id });
  if ( self ) runBroadcast(type, data, game.user);
}

function runBroadcast(type, data, user) {
  try {
    BROADCASTS.get(type)?.(data ?? {}, user ?? null);
  } catch (err) {
    console.error(`${MODULE_ID} | Could not handle ${type}`, err);
  }
}

/** Listen for requests (as the GM) and answers (as a player). Called once the game is ready. */
export function registerSocket() {
  game.socket?.on(SOCKET, onMessage);
}

function isActiveGM() {
  return game.user.isGM && (game.users.activeGM?.isSelf ?? true);
}

export function onMessage(message) {
  if ( !message || (typeof message !== "object") ) return;
  if ( message.kind === "broadcast" ) {
    if ( message.from === game.user.id ) return;
    runBroadcast(message.type, message.data, game.users.get(message.from));
    return;
  }
  if ( message.kind === "tell" ) {
    if ( !isActiveGM() ) return;
    const user = game.users.get(message.userId);
    const handler = HANDLERS[message.action];
    if ( !user || !handler ) return;
    Promise.resolve()
      .then(() => handler(message.data ?? {}, user))
      .catch(err => console.warn(`${MODULE_ID} | Could not do ${user.name}'s ${message.action}`, err));
    return;
  }
  if ( message.kind === "request" ) {
    if ( !isActiveGM() ) return;
    const user = game.users.get(message.userId);
    const handler = HANDLERS[message.action];
    const reply = data => game.socket.emit(SOCKET, { kind: "response", id: message.id, to: message.userId, ...data });
    if ( !user || !handler ) return reply({ ok: false, error: "Unknown request" });
    Promise.resolve()
      .then(() => handler(message.data ?? {}, user))
      .then(result => reply({ ok: true, result }))
      .catch(err => {
        console.warn(`${MODULE_ID} | Could not do ${user.name}'s ${message.action}`, err);
        reply({ ok: false, error: err?.message ?? String(err) });
      });
    return;
  }
  if ( (message.kind === "response") && (message.to === game.user.id) ) {
    const pending = PENDING.get(message.id);
    if ( !pending ) return;
    PENDING.delete(message.id);
    clearTimeout(pending.timer);
    if ( message.ok ) pending.resolve(message.result);
    else pending.reject(new Error(message.error ?? loc("Errors.GMFailed")));
  }
}

/** Is a GM logged in to make trades? */
export function gmOnline() {
  return game.user.isGM || !!game.users.activeGM;
}

/**
 * Do something as the GM: here if this user is a GM, otherwise by asking the active GM.
 * @param {string} action
 * @param {object} data
 * @returns {Promise<any>}
 */
export function runAsGM(action, data) {
  if ( game.user.isGM ) return Promise.resolve().then(() => HANDLERS[action](data, game.user));
  const gm = game.users.activeGM;
  if ( !gm ) return Promise.reject(new Error(loc("Errors.NoGM")));
  const id = newId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      PENDING.delete(id);
      reject(new Error(loc("Errors.GMTimeout")));
    }, TIMEOUT_MS);
    PENDING.set(id, { resolve, reject, timer });
    game.socket.emit(SOCKET, { kind: "request", id, action, data, userId: game.user.id });
  });
}

/** Ask the active GM to do something, without waiting for an answer. Done here if this user is a GM. */
export async function tellGM(action, data) {
  if ( game.user.isGM ) {
    await HANDLERS[action](data, game.user);
    return;
  }
  if ( !game.users.activeGM ) return;
  game.socket.emit(SOCKET, { kind: "tell", action, data, userId: game.user.id });
}

/** Changes waiting to be made, by shop: each waits for the one before, so two buyers can't buy the last one. */
const QUEUES = new Map();

export function queued(key, fn) {
  const before = QUEUES.get(key) ?? Promise.resolve();
  const next = before.catch(() => null).then(fn);
  QUEUES.set(key, next);
  next.finally(() => {
    if ( QUEUES.get(key) === next ) QUEUES.delete(key);
  }).catch(() => null);
  return next;
}
