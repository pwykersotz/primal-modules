export const MODULE_ID = "primal-harvesting";

/** The socket the GM listens on for players' harvests (module.json has "socket": true). */
export const SOCKET = `module.${MODULE_ID}`;

export const SETTINGS = {
  playersCanHarvest: "playersCanHarvest",
  deadOnly: "deadOnly",
  offerInChat: "offerInChat",
  addItems: "addItems",
  advanceTime: "advanceTime",
  showRollDialogs: "showRollDialogs",
  shareWindow: "shareWindow",
  requireApproval: "requireApproval",
  splash: "splash",
  tables: "tables",
  rules: "rules",
  tablesMenu: "tablesMenu",
  rulesMenu: "rulesMenu"
};

/** Flag keys, all under flags.primal-harvesting. */
export const FLAGS = {
  /** TokenDocument: this corpse has been harvested ({ at, userId, total, harvested, lost, recipient }). */
  harvested: "harvested",
  /** Actor: the creature table (its id) this creature uses, picked by the GM in the harvest window. */
  creature: "creature",
  /** Actor: the creature type to harvest it as, picked by the GM in the harvest window. */
  type: "type",
  /** Item: a harvested component ({ key, component, creature, type, cr, tags, essence }). */
  component: "component",
  /** ChatMessage: a harvest result card. */
  card: "card",
  /** ChatMessage: a "ready to harvest" card listing creatures that can be harvested. */
  ready: "ready",
  /** TokenDocument: the harvest window everyone shares while it's open (see session.mjs). */
  session: "session",
  /** TokenDocument: what its random components roll gave ({ at, userId, rolls, components }). */
  random: "random",
  /** ChatMessage: a random components roll. */
  randomCard: "randomCard"
};

/**
 * Localize a key under PRIMAL_HARVESTING.
 * @param {string} key
 * @param {object} [data]  Values for {placeholders}.
 * @returns {string}
 */
export function loc(key, data) {
  const path = `PRIMAL_HARVESTING.${key}`;
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

/** Escape text for HTML. */
export function escapeHTML(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}

/** A short random id. */
export function newId() {
  const fn = globalThis.foundry?.utils?.randomID;
  if ( typeof fn === "function" ) return fn(12);
  return Math.random().toString(36).slice(2, 14).padEnd(12, "0");
}

/** A localized label from one of dnd5e's config tables (CONFIG.DND5E[table][key]), or the key itself. */
export function dnd5eLabel(table, key) {
  const entry = globalThis.CONFIG?.DND5E?.[table]?.[key];
  const label = (typeof entry === "string") ? entry : (entry?.label ?? null);
  if ( !label ) return key ? String(key).replace(/^./, c => c.toUpperCase()) : "";
  return game.i18n.localize(label);
}
