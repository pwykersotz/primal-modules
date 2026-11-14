import { CLIMATES, DEFAULT_CLIMATE, SEASONS } from "./climates.mjs";
import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { emptyState } from "./ledger.mjs";

/**
 * Register the module settings. Called during the init hook.
 * @param {object} handlers
 * @param {Function} handlers.onDisplayChange    Re-draw the weather bar.
 * @param {Function} handlers.onWeatherChange    The weather itself changed: re-draw the bar and the map.
 * @param {Function} handlers.onMapChange        Which scenes show the weather changed.
 * @param {Function} handlers.onClimateChange    The climate or season changed: roll tomorrow's forecast again.
 * @param {Function} handlers.onAutoRollChange   Automatic rolling was turned on or off.
 */
export function registerSettings({ onDisplayChange, onWeatherChange, onMapChange, onClimateChange, onAutoRollChange }) {
  const L = key => `PRIMAL_WEATHER.Settings.${key}`;
  const register = (key, data) => game.settings.register(MODULE_ID, key, {
    name: L(`${key}.Name`),
    hint: L(`${key}.Hint`),
    config: true,
    ...data
  });

  /* ---------- The weather itself (world, not shown) ---------- */

  game.settings.register(MODULE_ID, SETTINGS.state, {
    scope: "world",
    config: false,
    type: Object,
    default: emptyState(),
    onChange: onWeatherChange
  });

  /* ---------- World (GM) ---------- */

  register(SETTINGS.climate, {
    scope: "world",
    type: String,
    choices: Object.fromEntries(Object.keys(CLIMATES).map(id => [id, `PRIMAL_WEATHER.Climate.${id}.Name`])),
    default: DEFAULT_CLIMATE,
    onChange: onClimateChange
  });

  register(SETTINGS.season, {
    scope: "world",
    type: String,
    choices: {
      calendar: L(`${SETTINGS.season}.Calendar`),
      ...Object.fromEntries(SEASONS.map(id => [id, `PRIMAL_WEATHER.Season.${id}`]))
    },
    default: "calendar",
    onChange: onClimateChange
  });

  register(SETTINGS.autoRoll, {
    scope: "world",
    type: Boolean,
    default: true,
    onChange: onAutoRollChange
  });

  register(SETTINGS.visibility, {
    scope: "world",
    type: String,
    choices: {
      all: L(`${SETTINGS.visibility}.All`),
      gm: L(`${SETTINGS.visibility}.GM`)
    },
    default: "all",
    onChange: onDisplayChange
  });

  register(SETTINGS.sceneEffects, {
    scope: "world",
    type: String,
    choices: {
      off: L(`${SETTINGS.sceneEffects}.Off`),
      marked: L(`${SETTINGS.sceneEffects}.Marked`),
      all: L(`${SETTINGS.sceneEffects}.All`)
    },
    default: "marked",
    onChange: onMapChange
  });

  register(SETTINGS.announce, {
    scope: "world",
    type: String,
    choices: {
      off: L(`${SETTINGS.announce}.Off`),
      gm: L(`${SETTINGS.announce}.GM`),
      all: L(`${SETTINGS.announce}.All`)
    },
    default: "off"
  });

  register(SETTINGS.rollRules, {
    scope: "world",
    type: Boolean,
    default: true
  });

  /* ---------- Per browser ---------- */

  register(SETTINGS.showBar, {
    scope: "client",
    type: Boolean,
    default: true,
    onChange: onDisplayChange
  });

  register(SETTINGS.units, {
    scope: "client",
    type: String,
    choices: {
      f: L(`${SETTINGS.units}.F`),
      c: L(`${SETTINGS.units}.C`),
      both: L(`${SETTINGS.units}.Both`)
    },
    default: "f",
    onChange: onDisplayChange
  });
}
