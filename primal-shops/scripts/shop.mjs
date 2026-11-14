/**
 * A shop: an actor (the shopkeeper) that sells from shop lists, and from its own inventory if the GM wants. What it
 * sells is worked out here from the shop's settings, its lists and what it has now. Nothing here touches Foundry.
 *
 * Shop (actor flag "shop"): { enabled, name, greeting, open, lists, level, maxPriceGp, markup, sellRate, buys, sellOwn,
 *   keepBought, purse, random: { enabled, counts }, range, hidden }
 * - level: the highest shop level of what it sells (0 mundane only … 6 everything, see catalog.levelOf).
 * - maxPriceGp: it sells nothing that costs more than this (null: no limit).
 * - markup: its prices, as a percentage of the list price (100: as listed).
 * - sellRate: what it pays for what it buys, as a percentage of the item's price (null: the world's setting).
 * - buys: "all" (anything), "same" (only the kinds of thing it sells) or "none".
 * - sellOwn: it also sells the shopkeeper's own items (anything not equipped).
 * - keepBought: what it buys goes back on its shelves: into the stock of the entry it sells already (see restockRowFor),
 *   else into the shopkeeper's inventory (and so is sold again, with sellOwn).
 * - purse: it pays from, and is paid into, the shopkeeper's own coins.
 * - random: it shows a random pick of its lists' items: counts says how many of each rarity ("mundane" for the
 *   rest; null: all).
 * - range: players must stand within this many grid units of the shop's token to trade (null: anywhere).
 * - hidden: keys of entries the GM took out of this shop.
 *
 * State (actor flag "state"): { stock, selection, stockedAt, offers }
 * - stock: how many of each limited entry are left (by key), set when the shop is stocked. Kept as a list of
 *   { key, n } (keys have dots in them, which Foundry would read as paths), and read into an object.
 * - selection: the keys of the random pick (null until picked).
 * - offers: trades waiting for the GM's approval.
 */
import {
  CATEGORIES, MAX_LEVEL, PHYSICAL_TYPES, RARITIES, categoryOf, entryKey, isRolledStock, levelOf, nameKey, normalizeRarity
} from "./catalog.mjs";
import { gpToCp, toCp } from "./money.mjs";

export const BUYS = ["all", "same", "none"];

/** The rarity groups a random pick counts: mundane, then each rarity. */
export const PICK_GROUPS = ["mundane", ...RARITIES];

/** The random pick's group of an entry. */
export function pickGroupOf(entry) {
  return normalizeRarity(entry?.rarity) || "mundane";
}

const numberOrNull = value => {
  if ( (value === null) || (value === undefined) || (value === "") ) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** A ribbon's colors when the shop has none of its own: crimson, with gold trim and lettering. */
export const RIBBON_COLORS = Object.freeze({ color: "#7a1424", trim: "#f0c75e" });

/** A colour as #rrggbb, or the fallback. */
export function hexColor(value, fallback) {
  const s = String(value ?? "").trim();
  if ( /^#[0-9a-f]{6}$/i.test(s) ) return s.toLowerCase();
  if ( /^#[0-9a-f]{3}$/i.test(s) ) return `#${[...s.slice(1)].map(c => c + c).join("")}`.toLowerCase();
  return fallback;
}

export function defaultShop() {
  return {
    enabled: true,
    name: "",
    greeting: "",
    open: true,
    lists: [],
    level: MAX_LEVEL,
    maxPriceGp: null,
    markup: 100,
    sellRate: null,
    buys: "all",
    sellOwn: true,
    keepBought: true,
    purse: false,
    random: { enabled: false, counts: Object.fromEntries(PICK_GROUPS.map(g => [g, null])) },
    range: null,
    hidden: [],
    ribbon: { ...RIBBON_COLORS }
  };
}

/** A shop's settings, with anything missing or broken filled in. */
export function normalizeShop(raw) {
  const s = defaultShop();
  if ( !raw || (typeof raw !== "object") ) return s;
  s.enabled = raw.enabled !== false;
  s.name = String(raw.name ?? "").trim().slice(0, 120);
  s.greeting = String(raw.greeting ?? "").trim().slice(0, 2000);
  s.open = raw.open !== false;
  s.lists = [...new Set((Array.isArray(raw.lists) ? raw.lists : []).filter(id => (typeof id === "string") && id))];
  const level = numberOrNull(raw.level);
  s.level = (level === null) ? MAX_LEVEL : Math.max(0, Math.min(MAX_LEVEL, Math.round(level)));
  const maxPrice = numberOrNull(raw.maxPriceGp);
  s.maxPriceGp = (maxPrice === null) || (maxPrice <= 0) ? null : maxPrice;
  const markup = numberOrNull(raw.markup);
  s.markup = (markup === null) ? 100 : Math.max(0, Math.min(10000, markup));
  const sellRate = numberOrNull(raw.sellRate);
  s.sellRate = (sellRate === null) ? null : Math.max(0, Math.min(1000, sellRate));
  s.buys = BUYS.includes(raw.buys) ? raw.buys : "all";
  s.sellOwn = raw.sellOwn !== false;
  s.keepBought = raw.keepBought !== false;
  s.purse = !!raw.purse;
  const random = raw.random ?? {};
  s.random.enabled = !!random.enabled;
  for ( const g of PICK_GROUPS ) {
    const n = numberOrNull(random.counts?.[g]);
    s.random.counts[g] = (n === null) ? null : Math.max(0, Math.round(n));
  }
  const range = numberOrNull(raw.range);
  s.range = (range === null) || (range <= 0) ? null : range;
  s.hidden = [...new Set((Array.isArray(raw.hidden) ? raw.hidden : []).filter(k => (typeof k === "string") && k))];
  s.ribbon = { color: hexColor(raw.ribbon?.color, RIBBON_COLORS.color), trim: hexColor(raw.ribbon?.trim, RIBBON_COLORS.trim) };
  return s;
}

/** One offer waiting for the GM, or null. */
export function normalizeOffer(raw) {
  if ( !raw || (typeof raw !== "object") || !raw.id ) return null;
  const kind = (raw.kind === "buy") ? "buy" : "sell";
  const lines = (Array.isArray(raw.lines) ? raw.lines : []).map(l => {
    const qty = Math.max(0, Math.floor(Number(l?.qty) || 0));
    if ( !qty ) return null;
    return {
      key: (typeof l.key === "string") ? l.key : null,
      itemId: (typeof l.itemId === "string") ? l.itemId : null,
      name: String(l.name ?? ""),
      img: String(l.img ?? ""),
      qty,
      unitCp: Math.max(0, Math.round(Number(l.unitCp) || 0))
    };
  }).filter(Boolean);
  if ( !lines.length ) return null;
  return {
    id: String(raw.id),
    kind,
    userId: String(raw.userId ?? ""),
    userName: String(raw.userName ?? ""),
    actorUuid: String(raw.actorUuid ?? ""),
    actorName: String(raw.actorName ?? ""),
    lines,
    at: Number(raw.at) || 0
  };
}

/** What a shop has now, with anything missing or broken filled in. */
export function normalizeState(raw) {
  const state = { stock: {}, selection: null, stockedAt: 0, offers: [] };
  if ( !raw || (typeof raw !== "object") ) return state;
  const pairs = Array.isArray(raw.stock) ? raw.stock.map(p => [p?.key, p?.n]) : Object.entries(raw.stock ?? {});
  for ( const [key, n] of pairs ) {
    const v = Math.floor(Number(n));
    if ( (typeof key === "string") && key && Number.isFinite(v) ) state.stock[key] = Math.max(0, v);
  }
  state.selection = Array.isArray(raw.selection) ? [...new Set(raw.selection.filter(k => typeof k === "string"))] : null;
  state.stockedAt = Number(raw.stockedAt) || 0;
  state.offers = (Array.isArray(raw.offers) ? raw.offers : []).map(normalizeOffer).filter(Boolean);
  return state;
}

/** A state as it's saved on the actor (stock as a list). */
export function serializeState(state) {
  const s = normalizeState(state);
  return { ...s, stock: Object.entries(s.stock).map(([key, n]) => ({ key, n })) };
}

/* -------------------------------------------- */
/*  What it sells                               */
/* -------------------------------------------- */

/**
 * Every entry a shop could sell: its lists' (an item on two lists once, as the first list has it), then the
 * shopkeeper's own items.
 * @param {object} shop
 * @param {{lists: object[]}} lists
 * @param {object[]} [own]  The shopkeeper's items as entries ({ key: "own:<id>", itemId, quantity, ... }).
 * @returns {object[]}  Entries with key, source ("list" or "own") and listName.
 */
export function shopEntries(shop, lists, own=[]) {
  const byKey = new Map();
  for ( const listId of shop.lists ) {
    const list = lists.lists.find(l => l.id === listId);
    if ( !list ) continue;
    for ( const entry of list.entries ) {
      const key = entryKey(entry, list.id);
      if ( byKey.has(key) ) continue;
      byKey.set(key, { ...entry, key, source: "list", listId: list.id, listName: list.name });
    }
  }
  if ( shop.sellOwn ) {
    for ( const o of own ) byKey.set(o.key, { ...o, source: "own", listName: "" });
  }
  return [...byKey.values()];
}

/** An entry's price before the shop's markup, in the smallest coin. */
export function basePriceCp(entry, rates) {
  if ( (entry.priceGp !== null) && (entry.priceGp !== undefined) ) return gpToCp(entry.priceGp, rates);
  return toCp(entry.price, rates);
}

/** What one of an entry costs in this shop, in the smallest coin (0 for an entry with no price). */
export function unitPriceCp(entry, shop, rates) {
  const base = basePriceCp(entry, rates);
  if ( !(base > 0) ) return 0;
  return Math.max(1, Math.round(base * (shop.markup / 100)));
}

/**
 * How many of an entry are left: a number, null for no limit, or undefined while a rolled stock ("1d4") hasn't been
 * rolled. A restock sets each back to its list's stock.
 */
export function stockLeft(entry, state) {
  if ( entry.source === "own" ) return Math.max(0, Math.floor(Number(entry.quantity) || 0));
  // What the shop has left (or what the GM set for this shop, even for an entry with no limit on its list).
  const n = state.stock?.[entry.key];
  if ( Number.isInteger(n) ) return Math.max(0, n);
  if ( (entry.stock === null) || (entry.stock === undefined) ) return null;
  if ( !isRolledStock(entry.stock) ) return Math.max(0, Number(entry.stock) || 0);
  return undefined;
}

/**
 * Why an entry isn't on sale (before the random pick and stock), or "".
 * - hidden: the GM took it out of this shop. level: above the shop's level. price: dearer than the shop's highest
 *   price. noPrice: it has no price.
 */
function baseReason(entry, shop, rates) {
  if ( shop.hidden.includes(entry.key) ) return "hidden";
  if ( entry.source === "list" ) {
    if ( levelOf(entry) > shop.level ) return "level";
    if ( (shop.maxPriceGp !== null) && (basePriceCp(entry, rates) > gpToCp(shop.maxPriceGp, rates)) ) return "price";
  }
  if ( !(basePriceCp(entry, rates) > 0) ) return "noPrice";
  return "";
}

/** The entries a random pick can choose from. */
export function pickable(entries, shop, rates) {
  return entries.filter(e => (e.source === "list") && !baseReason(e, shop, rates));
}

/**
 * Pick a shop's random selection: so many of each rarity (all of a rarity with no count).
 * @param {object[]} entries
 * @param {object} shop
 * @param {object} rates
 * @param {() => number} [random]
 * @returns {string[]}  The keys picked.
 */
export function pickSelection(entries, shop, rates, random=Math.random) {
  const groups = new Map(PICK_GROUPS.map(g => [g, []]));
  for ( const e of pickable(entries, shop, rates) ) groups.get(pickGroupOf(e))?.push(e);
  const keys = [];
  for ( const [group, list] of groups ) {
    const count = shop.random.counts[group];
    const pool = [...list];
    if ( (count === null) || (count >= pool.length) ) {
      keys.push(...pool.map(e => e.key));
      continue;
    }
    for ( let i = 0; i < count; i++ ) {
      const at = Math.floor(random() * pool.length);
      keys.push(pool.splice(at, 1)[0].key);
    }
  }
  return keys;
}

/**
 * The stock to give each limited entry when the shop is stocked: a number, or a roll to make.
 * @returns {Record<string, string>}
 */
export function restockPlan(entries) {
  const plan = {};
  for ( const e of entries ) {
    if ( (e.source === "list") && (e.stock !== null) && (e.stock !== undefined) ) plan[e.key] = e.stock;
  }
  return plan;
}

/** Does a shop need stocking before it opens (a random pick or a rolled stock not made yet)? */
export function needsStocking(entries, shop, state) {
  if ( shop.random.enabled && !state.selection ) return true;
  return entries.some(e => (e.source === "list") && isRolledStock(e.stock) && !Number.isInteger(state.stock?.[e.key]));
}

/**
 * Everything a shop shows, each with its price, its stock left (stock; listStock is its list's) and why it isn't on
 * sale ("" when it is).
 * Reasons: hidden, level, price, noPrice (see baseReason), notPicked (not in the random pick), soldOut.
 * @returns {object[]}
 */
export function stockView({ shop, state, entries, rates }) {
  const picked = (shop.random.enabled && state.selection) ? new Set(state.selection) : null;
  return entries.map(entry => {
    const priceCp = unitPriceCp(entry, shop, rates);
    const stock = stockLeft(entry, state);
    let reason = baseReason(entry, shop, rates);
    if ( !reason && picked && (entry.source === "list") && !picked.has(entry.key) ) reason = "notPicked";
    if ( !reason && (stock === 0) ) reason = "soldOut";
    return { ...entry, category: categoryOf(entry), priceCp, listStock: entry.stock ?? null, stock, reason };
  });
}

/**
 * The entry a shop has on sale that an item a player sells it is one of, so the sale goes back into that entry's stock
 * rather than the shop keeping a second one of it: the entry it was bought as, else the same compendium item, else
 * the same name. Only entries on sale here count (sold out is on sale).
 * @param {object[]} rows  From stockView.
 * @param {{name: string, key?: string|null, uuid?: string|null}} item  key: the entry it was bought as; uuid: the item
 *   it was made from.
 * @returns {object|null}
 */
export function restockRowFor(rows, { name, key=null, uuid=null }) {
  const onSale = rows.filter(r => (r.source === "list") && (!r.reason || (r.reason === "soldOut")));
  const named = nameKey(name ?? "");
  return (key && onSale.find(r => r.key === key))
    || (uuid && onSale.find(r => r.uuid === uuid))
    || (named && onSale.find(r => nameKey(r.name) === named))
    || null;
}

/**
 * How a sale restocks a shop's limited entries: so many bundles back on each (a bundle of 20 arrows is one); entries
 * with no limit need nothing.
 * @param {{row: object, qty: number}[]} returns  Each sold line and the entry it goes back to.
 * @returns {Record<string, number>}  Each entry's new stock, by key.
 */
export function restockFromSale(returns) {
  const stock = {};
  for ( const { row, qty } of returns ) {
    if ( !Number.isInteger(row.stock) ) continue;
    const bundles = Math.floor(qty / Math.max(1, Math.floor(Number(row.bundle) || 1)));
    stock[row.key] = (stock[row.key] ?? row.stock) + bundles;
  }
  return stock;
}

/**
 * Check a purchase against what the shop has now.
 * @param {object[]} rows  From stockView.
 * @param {{key: string, qty: number, unitCp?: number}[]} lines  unitCp: a price the GM set (an approved offer).
 * @returns {{ok: boolean, lines: object[], totalCp: number, error: {code: string, name: string, left?: number}|null}}
 */
export function checkPurchase(rows, lines) {
  const byKey = new Map(rows.map(r => [r.key, r]));
  const counted = new Map();
  for ( const line of lines ?? [] ) {
    const qty = Math.max(0, Math.floor(Number(line?.qty) || 0));
    if ( !qty || !line.key ) continue;
    const before = counted.get(line.key);
    counted.set(line.key, { key: line.key, qty: (before?.qty ?? 0) + qty, unitCp: line.unitCp ?? before?.unitCp });
  }
  const out = [];
  let totalCp = 0;
  for ( const line of counted.values() ) {
    const row = byKey.get(line.key);
    if ( !row ) return { ok: false, lines: [], totalCp: 0, error: { code: "gone", name: line.key } };
    if ( row.reason && (row.reason !== "soldOut") ) return { ok: false, lines: [], totalCp: 0, error: { code: "unavailable", name: row.name } };
    if ( (row.stock !== null) && (row.stock !== undefined) && (row.stock < line.qty) ) {
      return { ok: false, lines: [], totalCp: 0, error: { code: row.stock ? "notEnough" : "soldOut", name: row.name, left: row.stock } };
    }
    const unitCp = Number.isFinite(line.unitCp) ? Math.max(0, Math.round(line.unitCp)) : row.priceCp;
    out.push({ row, qty: line.qty, unitCp, totalCp: unitCp * line.qty });
    totalCp += unitCp * line.qty;
  }
  if ( !out.length ) return { ok: false, lines: [], totalCp: 0, error: { code: "empty", name: "" } };
  return { ok: true, lines: out, totalCp, error: null };
}

/* -------------------------------------------- */
/*  What it buys                                */
/* -------------------------------------------- */

/** What a shop pays for things, as a percentage of their price. */
export function sellRateOf(shop, worldRate=50) {
  const rate = (shop.sellRate === null) ? Number(worldRate) : shop.sellRate;
  return Number.isFinite(rate) ? Math.max(0, rate) : 50;
}

/**
 * Is this a monster component from Primal Harvesting? Its price is already what it sells for (Heliana's "sells for"
 * value), so a shop pays all of it rather than its usual share.
 */
export function isHarvestedComponent(item) {
  return !!item?.flags?.["primal-harvesting"]?.component;
}

/**
 * What a shop pays for one of an item (its own price × the rate), in the smallest coin. An item priced by the bundle
 * (bundle: 20 for arrows) is paid for one at a time. A harvested component is paid its full price.
 */
export function sellPriceCp(item, rate, rates) {
  if ( isHarvestedComponent(item) ) rate = 100;
  const price = toCp(item?.system?.price ?? item?.price, rates);
  const bundle = Math.max(1, Math.floor(Number(item?.bundle) || 1));
  return Math.floor((price * (rate / 100)) / bundle);
}

/** The kinds of thing a shop sells (for a shop that buys only those). */
export function categoriesSold(rows) {
  return new Set(rows.filter(r => !r.reason || (r.reason === "soldOut") || (r.reason === "notPicked")).map(r => r.category));
}

/** Does this shop buy this kind of thing? */
export function buysCategory(shop, category, sold) {
  if ( shop.buys === "none" ) return false;
  if ( shop.buys === "same" ) return sold.has(category);
  return true;
}

/**
 * What an actor could sell, from its items' data: things you can carry, with why each can't be sold ("" when it can).
 * Natural weapons are left out. Reasons: container (it has things in it), notBought (the shop doesn't buy that kind of
 * thing), noPrice (it has no price, and there's no GM to name one).
 * @param {object[]} items  { id, name, img, type, system }
 * @param {object} options
 * @param {object} options.shop
 * @param {Set<string>} options.sold    The kinds of thing the shop sells.
 * @param {number} options.rate         What the shop pays, as a percentage.
 * @param {object} options.rates
 * @param {boolean} options.gmPrices    The GM approves sales, and can name a price for priceless things.
 * @returns {object[]}
 */
export function sellableItems(items, { shop, sold, rate, rates, gmPrices=false }) {
  const full = new Set(items.map(i => i.system?.container).filter(Boolean));
  const rows = [];
  for ( const item of items ) {
    if ( !PHYSICAL_TYPES.includes(item.type) ) continue;
    const s = item.system ?? {};
    if ( (item.type === "weapon") && (s.type?.value === "natural") ) continue;
    const quantity = Math.max(0, Math.floor(Number(s.quantity) || 0));
    if ( !quantity ) continue;
    const category = categoryOf({ type: item.type, subtype: s.type?.value ?? "" });
    const unitCp = sellPriceCp(item, rate, rates);
    let reason = "";
    if ( (item.type === "container") && full.has(item.id) ) reason = "container";
    else if ( !buysCategory(shop, category, sold) ) reason = "notBought";
    else if ( !(unitCp > 0) && !gmPrices ) reason = "noPrice";
    rows.push({
      id: item.id,
      name: item.name,
      img: item.img,
      type: item.type,
      category,
      quantity,
      unitCp,
      equipped: !!s.equipped,
      attuned: (s.attuned === true) || (s.attunement === "attuned"),
      reason
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** The kinds of thing, in the order the shop window lists them. */
export function categoryOrder(category) {
  const at = CATEGORIES.indexOf(category);
  return at < 0 ? CATEGORIES.length : at;
}
