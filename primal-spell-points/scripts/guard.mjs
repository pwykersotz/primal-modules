/**
 * Only the GM changes spell points by hand.
 *
 * Players own their characters, so Foundry lets them change any of their actor's flags. This removes spell point
 * changes a player's client tries to make, except the ones that happen in play:
 * - casting a spell (points spent only go up, and high-level spells are only added);
 * - a long rest (everything restored).
 * A GM (or Assistant GM) can change anything, including refunding a cast from its chat card.
 */
import { FLAGS, MODULE_ID, loc } from "./constants.mjs";
import { getState } from "./spell-points.mjs";

/** The update key of every spell point flag, in its dotted form. */
const PREFIX = `flags.${MODULE_ID}`;

/**
 * Delete a dotted key from an update, whether it was written nested or dotted.
 * @param {object} changes
 * @param {string} key
 */
function removeKey(changes, key) {
  if ( key in changes ) {
    delete changes[key];
    return;
  }
  const parts = key.split(".");
  // A partly dotted key (e.g. { flags: { "primal-spell-points.spent": 5 } }).
  for ( let i = parts.length - 1; i > 0; i-- ) {
    const parent = foundry.utils.getProperty(changes, parts.slice(0, i).join("."));
    const rest = parts.slice(i).join(".");
    if ( parent && (typeof parent === "object") && (rest in parent) ) {
      delete parent[rest];
      return;
    }
  }
}

/**
 * The actor a pre-update hook is about (ActorDelta updates are for unlinked tokens).
 * @param {Document} doc
 * @returns {Actor|null}
 */
function actorFor(doc) {
  if ( doc instanceof Actor ) return doc;
  return doc?.parent?.actor ?? null;
}

/**
 * preUpdateActor / preUpdateActorDelta.
 * @param {Document} doc
 * @param {object} changes
 * @param {object} options
 */
function guardUpdate(doc, changes, options) {
  if ( game.user.isGM ) return;
  const flat = foundry.utils.flattenObject(changes);
  const keys = Object.keys(flat).filter(k => k.startsWith(PREFIX) || k.startsWith(`flags.-=${MODULE_ID}`));
  if ( !keys.length ) return;

  const actor = actorFor(doc);
  const stored = actor?.flags?.[MODULE_ID] ?? {};
  const currentSpent = getState(actor)?.spent ?? Math.max(0, Number(stored[FLAGS.spent]) || 0);
  const currentHigh = Array.isArray(stored[FLAGS.highUsed]) ? stored[FLAGS.highUsed].map(Number) : [];

  let blocked = false;
  for ( const key of keys ) {
    const value = flat[key];
    if ( key === `${PREFIX}.${FLAGS.spent}` ) {
      if ( options?.isRest ) continue;
      if ( Number(value) >= currentSpent ) continue;
    }
    else if ( key === `${PREFIX}.${FLAGS.highUsed}` ) {
      if ( options?.isRest ) continue;
      const next = Array.isArray(value) ? value.map(Number) : [];
      if ( currentHigh.every(level => next.includes(level)) ) continue;
    }
    removeKey(changes, key);
    blocked = true;
  }
  if ( blocked ) ui.notifications.warn(loc("Warning.GMOnly"));
}

/** Register the update guards. Called during init. */
export function registerGuard() {
  Hooks.on("preUpdateActor", guardUpdate);
  Hooks.on("preUpdateActorDelta", guardUpdate);
}
