export const MODULE_ID = "primal-attacks";

export const SETTINGS = {
  offerOnAttack: "offerOnAttack",
  damagePolicy: "damagePolicy",
  summaryCard: "summaryCard",
  foldCards: "foldCards",
  defeatedTarget: "defeatedTarget",
  multiattackWindow: "multiattackWindow"
};

/** Flag keys, all under flags.primal-attacks. */
export const FLAGS = {
  /** ChatMessage: the summary of a set of attacks. */
  summary: "summary",
  /** ChatMessage: the set of attacks an attack roll message holds. */
  group: "group",
  /** ChatMessage: a card (Midi-QOL's) of one attack of a set, folded into the set's summary. */
  member: "member"
};

/** The most attacks one roll window can make. */
export const MAX_ATTACKS = 20;

/**
 * Localize a key under PRIMAL_ATTACKS.
 * @param {string} key
 * @param {object} [data]  Values for {placeholders}.
 * @returns {string}
 */
export function loc(key, data) {
  const path = `PRIMAL_ATTACKS.${key}`;
  return data ? game.i18n.format(path, data) : game.i18n.localize(path);
}

/**
 * Read one of this module's settings.
 * @param {string} key
 */
export function setting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

/** Is Midi-QOL running? */
export function midiActive() {
  return !!(game.modules.get("midi-qol")?.active && globalThis.MidiQOL);
}

/**
 * Does this activity run through Midi-QOL's workflow? Midi replaces dnd5e's activity classes with its own unless its
 * "replace default activities" setting is off, so the activity itself is checked.
 * @param {Activity} activity
 */
export function isMidiActivity(activity) {
  return midiActive() && (typeof activity?.preTargetingChecks === "function");
}

/** Escape text for HTML. */
export function escapeHTML(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}
