import { DEFAULT_FRAME, MODES, MODULE_ID, SETTINGS } from "./constants.mjs";

/**
 * Register the module settings. Called during the init hook.
 * @param {object} handlers
 * @param {Function} handlers.onDisplayChange   Re-draw the carousel.
 * @param {Function} handlers.onMarkersChange   Re-draw the canvas turn markers.
 */
export function registerSettings({ onDisplayChange, onMarkersChange }) {
  const L = key => `PRIMAL_COMBAT.Settings.${key}`;
  const register = (key, data) => game.settings.register(MODULE_ID, key, {
    name: L(`${key}.Name`),
    hint: L(`${key}.Hint`),
    config: true,
    ...data
  });

  /* ---------- World (GM) ---------- */

  register(SETTINGS.defaultMode, {
    scope: "world",
    type: String,
    choices: {
      [MODES.standard]: L(`${SETTINGS.defaultMode}.Standard`),
      [MODES.side]: L(`${SETTINGS.defaultMode}.Side`)
    },
    default: MODES.standard,
    onChange: onDisplayChange
  });

  register(SETTINGS.autoAdvance, {
    scope: "world",
    type: Boolean,
    default: true
  });

  register(SETTINGS.sideTurnMarkers, {
    scope: "world",
    type: Boolean,
    default: true,
    onChange: onMarkersChange
  });

  register(SETTINGS.frameImage, {
    scope: "world",
    type: String,
    filePicker: "image",
    default: DEFAULT_FRAME,
    onChange: onDisplayChange
  });

  register(SETTINGS.hpBars, {
    scope: "world",
    type: String,
    choices: {
      none: L(`${SETTINGS.hpBars}.None`),
      owner: L(`${SETTINGS.hpBars}.Owner`),
      all: L(`${SETTINGS.hpBars}.All`)
    },
    default: "owner",
    onChange: onDisplayChange
  });

  register(SETTINGS.turnTimer, {
    scope: "world",
    type: String,
    choices: {
      all: L(`${SETTINGS.turnTimer}.All`),
      gm: L(`${SETTINGS.turnTimer}.GM`),
      none: L(`${SETTINGS.turnTimer}.None`)
    },
    default: "all",
    onChange: onDisplayChange
  });

  register(SETTINGS.endCombatPrompt, {
    scope: "world",
    type: Boolean,
    default: true
  });

  register(SETTINGS.autoLairActions, {
    scope: "world",
    type: Boolean,
    default: true
  });

  /* ---------- Per browser ---------- */

  register(SETTINGS.showCarousel, {
    scope: "client",
    type: Boolean,
    default: true,
    onChange: onDisplayChange
  });

  register(SETTINGS.portraitSize, {
    scope: "client",
    type: Number,
    range: { min: 36, max: 110, step: 2 },
    default: 58,
    onChange: onDisplayChange
  });

  register(SETTINGS.portraitSource, {
    scope: "client",
    type: String,
    choices: {
      token: L(`${SETTINGS.portraitSource}.Token`),
      actor: L(`${SETTINGS.portraitSource}.Actor`)
    },
    default: "token",
    onChange: onDisplayChange
  });

  register(SETTINGS.topOffset, {
    scope: "client",
    type: Number,
    range: { min: 0, max: 300, step: 2 },
    default: 0,
    onChange: onDisplayChange
  });
}
