import { MODULE_ID, SETTINGS } from "./constants.mjs";

/**
 * Register the module settings. Called during the init hook. Every rule is a world setting, so only a GM can change
 * it, and each one can be switched off on its own.
 * @param {object} handlers
 * @param {Function} handlers.onArmorChange   The AC cap changed: prepare actors again.
 * @param {Function} handlers.onSheetChange   A sheet addition was switched: draw open sheets again.
 * @param {Function} handlers.onGearChange    The gear bonus rule was switched: prepare actors again.
 */
export function registerSettings({ onArmorChange, onSheetChange, onGearChange }={}) {
  const L = key => `PRIMAL_HOUSERULES.Settings.${key}`;
  const register = (key, data) => game.settings.register(MODULE_ID, key, {
    name: L(`${key}.Name`),
    hint: L(`${key}.Hint`),
    scope: "world",
    config: true,
    ...data
  });

  register(SETTINGS.saveExtremes, { type: Boolean, default: true });
  register(SETTINGS.acCap, {
    type: new foundry.data.fields.NumberField({ min: 0, max: 99, step: 1, integer: true, nullable: false }),
    default: 24,
    onChange: onArmorChange
  });
  register(SETTINGS.gearBonuses, { type: Boolean, default: true, onChange: onGearChange });
  register(SETTINGS.halfHitPoints, { type: Boolean, default: true });
  register(SETTINGS.emanations, { type: Boolean, default: true });
  register(SETTINGS.emanationScope, {
    type: String,
    default: "spells",
    choices: {
      spells: L(`${SETTINGS.emanationScope}.Spells`),
      all: L(`${SETTINGS.emanationScope}.All`)
    }
  });
  register(SETTINGS.mvp, { type: Boolean, default: true, onChange: onSheetChange });
  register(SETTINGS.quickRest, { type: Boolean, default: true, requiresReload: true });
}
