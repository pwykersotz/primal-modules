export const MODULE_ID = "primal-combat";

/** The two ways a combat can run. Stored per combat as a flag, with a world setting for new combats. */
export const MODES = {
  standard: "standard",
  side: "side"
};

/**
 * The two sides in side initiative, and the events (lair actions and the like) that happen between them. In individual
 * initiative only "event" matters.
 */
export const SIDES = {
  party: "party",
  enemies: "enemies",
  event: "event"
};

export const SETTINGS = {
  defaultMode: "defaultMode",
  autoAdvance: "autoAdvance",
  sideTurnMarkers: "sideTurnMarkers",
  frameImage: "frameImage",
  hpBars: "hpBars",
  turnTimer: "turnTimer",
  endCombatPrompt: "endCombatPrompt",
  autoLairActions: "autoLairActions",
  showCarousel: "showCarousel",
  portraitSize: "portraitSize",
  portraitSource: "portraitSource",
  topOffset: "topOffset"
};

/** Flag keys, all under flags.primal-combat. */
export const FLAGS = {
  mode: "mode",           // Combat: "standard" | "side"
  enemyInit: "enemyInit", // Combat: {value, name}, the enemies' initiative (their best static initiative) and whose it is
  side: "side",           // Combatant: "party" | "enemies", set when the GM moves a combatant to the other side
  combatRequest: "combatRequest", // User: {id, sceneId}, a player asking the GM's client to start a combat
  turnTimer: "turnTimer", // Combat: {round, turn, combatantId, time, pausedAt, server}, when the current turn started
  actsWith: "actsWith",   // Actor: the actor id of the creature it finishes its turn with, in side initiative (companions.mjs)
  done: "done",           // Combatant: the side's turn in which this combatant finished, as "round.combatantId"
  event: "event",         // Combatant: {count, notes, remind, source}, marks a lair action or other event (no actor)
  fixedInitiative: "fixedInitiative" // Combatant: a number the creature always acts on (an Epic Boss's 20), set by another module
};

/** Default art for a lair action, and for any other event on an initiative count. */
export const LAIR_IMAGE = "icons/environment/wilderness/cave-entrance-mountain.webp";
export const EVENT_IMAGE = "icons/magic/time/hourglass-tilted-glowing-gold.webp";

/** The turn marker art that frames whoever is acting. A copy of Foundry's default turn marker. */
export const DEFAULT_FRAME = `modules/${MODULE_ID}/assets/turn-frame.webp`;

/**
 * Localize a key under PRIMAL_COMBAT.
 * @param {string} key
 * @param {object} [data]  Values for {placeholders}.
 * @returns {string}
 */
export function loc(key, data) {
  const path = `PRIMAL_COMBAT.${key}`;
  return data ? game.i18n.format(path, data) : game.i18n.localize(path);
}

/**
 * Read one of this module's settings.
 * @param {string} key
 */
export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}
