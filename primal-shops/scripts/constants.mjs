export const MODULE_ID = "primal-shops";

/** The socket the GM listens on for players' trades (module.json has "socket": true). */
export const SOCKET = `module.${MODULE_ID}`;

export const SETTINGS = {
  lists: "lists",
  listsMenu: "listsMenu",
  sellRate: "sellRate",
  buyApproval: "buyApproval",
  sellApproval: "sellApproval",
  playersCanSell: "playersCanSell",
  receipts: "receipts",
  gmDoubleClick: "gmDoubleClick",
  offersPopup: "offersPopup",
  newShop: "newShop"
};

/** Flag keys, all under flags.primal-shops. */
export const FLAGS = {
  /** Actor: this actor is a shop, and how it's set up (see normalizeShop). */
  shop: "shop",
  /** Actor: what the shop has now: stock left, the random pick, offers waiting for the GM (see normalizeState). */
  state: "state",
  /** Item: bought in a shop ({ shop, price, at }). */
  bought: "bought",
  /** ChatMessage: a receipt or a declined offer. */
  card: "card",
  /** Scene: the shops' map pins on it (see pins.mjs). */
  pins: "pins",
  /** Scene: the shops' ribbons at the top of the screen while it's shown (see pins.mjs). */
  ribbons: "ribbons",
  /** Token: the shop it opens (an actor id), whatever its own actor is (see apps/quick-shop.mjs). */
  opens: "opens",
  /** Actor: a stand-in the module made to hold a shop made with New shop. */
  standIn: "standIn",
  /** Folder: the Actors sidebar's folder for stand-in shops. */
  folder: "shopsFolder"
};

/**
 * Localize a key under PRIMAL_SHOPS.
 * @param {string} key
 * @param {object} [data]  Values for {placeholders}.
 * @returns {string}
 */
export function loc(key, data) {
  const path = `PRIMAL_SHOPS.${key}`;
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
