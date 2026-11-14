/** The harvest tables and rules, kept in two world settings (every user can read them; only a GM can change them). */
import { MODULE_ID, SETTINGS, setting } from "./constants.mjs";
import { normalizeRules } from "./rules.mjs";
import { normalizeTables } from "./tables.mjs";

/** The harvest rules, with the book's numbers for anything not set. */
export function getRules() {
  return normalizeRules(setting(SETTINGS.rules));
}

/** The harvest tables. */
export function getTables() {
  return normalizeTables(setting(SETTINGS.tables));
}

export async function saveRules(rules) {
  return game.settings.set(MODULE_ID, SETTINGS.rules, normalizeRules(rules));
}

export async function saveTables(tables) {
  return game.settings.set(MODULE_ID, SETTINGS.tables, normalizeTables(tables));
}
