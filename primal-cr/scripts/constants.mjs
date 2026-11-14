export const MODULE_ID = "primal-cr";

export const SETTINGS = Object.freeze({
  /** How many times each fight is played out. */
  runs: "runs",
  /** How the enemies choose who to attack. */
  tactics: "tactics",
  /** The four thresholds between the danger levels, in percent. */
  impossible: "thresholdImpossible",
  boss: "thresholdBoss",
  hard: "thresholdHard",
  medium: "thresholdMedium",
  /** The encounter being planned (this GM, this computer). */
  encounter: "encounter"
});

/** Localize a key under PRIMAL_CR. */
export function loc(key, data) {
  const path = `PRIMAL_CR.${key}`;
  return data ? game.i18n.format(path, data) : game.i18n.localize(path);
}

/** Read one of this module's settings. */
export function setting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

export function escapeHTML(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}

/** A short random id. */
export function newId() {
  const fn = globalThis.foundry?.utils?.randomID;
  if ( typeof fn === "function" ) return fn(12);
  return Math.random().toString(36).slice(2, 14).padEnd(12, "0");
}
