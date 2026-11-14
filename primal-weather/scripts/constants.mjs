export const MODULE_ID = "primal-weather";

export const SETTINGS = {
  state: "state",
  climate: "climate",
  season: "season",
  autoRoll: "autoRoll",
  visibility: "visibility",
  sceneEffects: "sceneEffects",
  announce: "announce",
  showBar: "showBar",
  units: "units",
  rollRules: "rollRules"
};

/** Flag keys, all under flags.primal-weather. */
export const FLAGS = {
  sceneWeather: "sceneWeather" // Scene: true to show the weather on this scene's map, false to never show it
};

/**
 * Localize a key under PRIMAL_WEATHER.
 * @param {string} key
 * @param {object} [data]  Values for {placeholders}.
 * @returns {string}
 */
export function loc(key, data) {
  const path = `PRIMAL_WEATHER.${key}`;
  return data ? game.i18n.format(path, data) : game.i18n.localize(path);
}

/**
 * Read one of this module's settings.
 * @param {string} key
 */
export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}
