export const MODULE_ID = "primal-houserules";

/** Setting keys. */
export const SETTINGS = {
  saveExtremes: "saveExtremes",
  acCap: "acCap",
  halfHitPoints: "halfHitPoints",
  emanations: "emanationsOncePerRound",
  emanationScope: "emanationScope",
  mvp: "mvpPip",
  quickRest: "quickRest",
  gearBonuses: "gearBonusesHighestOnly"
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

/* -------------------------------------------- */

/**
 * Wrap a method, through libWrapper when it's active so other modules' wrappers keep working.
 * @param {string} path      Dotted path to the object holding the method, from globalThis.
 * @param {string} method
 * @param {Function} fn      Called as fn.call(instance, wrapped, ...args).
 * @param {string} [type]    libWrapper type: "MIXED" when fn sometimes doesn't call the wrapped method.
 */
export function wrap(path, method, fn, type="WRAPPER") {
  if ( globalThis.libWrapper ) {
    try {
      globalThis.libWrapper.register(MODULE_ID, `${path}.${method}`, fn, type);
      return;
    } catch (err) {
      console.warn(`${MODULE_ID} | libWrapper could not wrap ${path}.${method}, patching directly`, err);
    }
  }
  const target = foundry.utils.getProperty(globalThis, path);
  const original = target?.[method];
  if ( typeof original !== "function" ) {
    console.warn(`${MODULE_ID} | Could not find ${path}.${method} to extend`);
    return;
  }
  target[method] = function(...args) {
    return fn.call(this, original.bind(this), ...args);
  };
}
