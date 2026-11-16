export const MODULE_ID = "primal-houserules";

/** Setting keys. */
export const SETTINGS = {
  saveExtremes: "saveExtremes",
  acCap: "acCap",
  halfHitPoints: "halfHitPoints",
  emanations: "emanationsOncePerRound",
  emanationScope: "emanationScope",
  mvp: "mvpPip",
  quickRest: "quickRest"
};

/** Actor flag keys. */
export const FLAGS = {
  mvp: "mvp"
};

/** The rest type key the Quick Break is registered under in CONFIG.DND5E.restTypes. */
export const QUICK_REST = "quick";

/**
 * Read one of this module's settings, or a fallback when settings aren't ready yet (or in the checks).
 * @param {string} key
 * @param {*} [fallback]
 * @returns {*}
 */
export function setting(key, fallback) {
  try {
    const value = game.settings.get(MODULE_ID, key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Localize a key under PRIMAL_HOUSERULES, with optional data to format in.
 * @param {string} key
 * @param {object} [data]
 * @returns {string}
 */
export function loc(key, data) {
  const full = `PRIMAL_HOUSERULES.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

/**
 * Move a hook listener to the front of its hook's list, so it runs before listeners other modules registered first.
 * Foundry keeps each hook's listeners in an array on Hooks.events; reordering it is the only way to go first.
 * @param {string} hook
 * @param {number} id    The id Hooks.on returned.
 * @returns {boolean}    Whether it was moved.
 */
export function runFirst(hook, id) {
  const list = globalThis.Hooks?.events?.[hook];
  if ( !Array.isArray(list) ) return false;
  const index = list.findIndex(entry => entry.id === id);
  if ( index <= 0 ) return index === 0;
  const [entry] = list.splice(index, 1);
  list.unshift(entry);
  return true;
}
