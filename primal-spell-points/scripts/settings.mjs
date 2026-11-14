import { DMG_TABLES, MODULE_ID, SETTINGS } from "./constants.mjs";
import { SpellPointTablesConfig } from "./apps/tables-config.mjs";

/**
 * Register the module settings. Called during the init hook. Every setting is world-scoped, so only a GM (or an
 * Assistant GM) can change them, and the tables window is GM-only. Which actors use spell points is chosen one actor
 * at a time (see the actor's Spell Points settings), not here.
 * @param {object} handlers
 * @param {Function} handlers.onRulesChange    Prepare actors again with the new rules.
 * @param {Function} handlers.onTablesChange   The cost or points table changed.
 */
export function registerSettings({ onRulesChange, onTablesChange }) {
  const L = key => `PRIMAL_SPELL_POINTS.Settings.${key}`;
  const register = (key, data) => game.settings.register(MODULE_ID, key, {
    name: L(`${key}.Name`),
    hint: L(`${key}.Hint`),
    scope: "world",
    config: true,
    ...data
  });

  game.settings.registerMenu(MODULE_ID, SETTINGS.tablesMenu, {
    name: L(`${SETTINGS.tablesMenu}.Name`),
    label: L(`${SETTINGS.tablesMenu}.Label`),
    hint: L(`${SETTINGS.tablesMenu}.Hint`),
    icon: "fa-solid fa-table",
    type: SpellPointTablesConfig,
    restricted: true
  });

  register(SETTINGS.highLevelLimit, {
    type: Boolean,
    default: true,
    onChange: onRulesChange
  });

  game.settings.register(MODULE_ID, SETTINGS.tables, {
    scope: "world",
    config: false,
    type: Object,
    default: { cost: { ...DMG_TABLES.cost }, points: [...DMG_TABLES.points] },
    onChange: onTablesChange
  });
}
