/**
 * Shop lists: named, reusable lists of items (a blacksmith's, an alchemist's), which shops sell from. Each entry is an
 * item from a compendium or the world (by UUID, with what the shop needs to show it copied in), or a custom item typed
 * in by name. An entry can have its own price, stock and level. Nothing here touches Foundry.
 *
 * Lists: { lists: [{ id, name, entries: [entry] }] }
 * Entry: { id, uuid, name, img, type, subtype, rarity, magical, attunement, price: { value, denomination }, weight,
 *   bundle, book, level, priceGp, stock, description }
 * - uuid: the item it gives (null for a custom item, which is made from the entry itself).
 * - bundle: how many come in one (arrows sold by 20).
 * - level: the shop level it needs (null: by its rarity, see levelOf).
 * - priceGp: its price here, in gold pieces (null: the item's own).
 * - stock: how many a shop has ("3", or a roll such as "1d4+1"; null: no limit).
 */

/** dnd5e's rarities, lowest first. */
export const RARITIES = ["common", "uncommon", "rare", "veryRare", "legendary", "artifact"];

/** The highest shop level: everything. */
export const MAX_LEVEL = RARITIES.length;

/** Item types that are things you can carry (and so buy and sell). */
export const PHYSICAL_TYPES = ["weapon", "equipment", "consumable", "tool", "loot", "container"];

/** What the shop window's "kind" filter offers, in this order. */
export const CATEGORIES = [
  "weapon", "armor", "ammo", "potion", "scroll", "food", "consumable", "tool", "container", "gear", "treasure"
];

const ARMOR = new Set(["light", "medium", "heavy", "shield", "natural"]);

/** The kind of thing an entry (or item data) is, for the shop window's filter. */
export function categoryOf({ type, subtype }={}) {
  switch ( type ) {
    case "weapon": return "weapon";
    case "equipment": return ARMOR.has(subtype) ? "armor" : "gear";
    case "consumable":
      if ( (subtype === "potion") || (subtype === "poison") ) return "potion";
      if ( subtype === "scroll" ) return "scroll";
      if ( subtype === "ammo" ) return "ammo";
      if ( subtype === "food" ) return "food";
      return "consumable";
    case "tool": return "tool";
    case "container": return "container";
    case "loot": return ((subtype === "gear") || !subtype) ? "gear" : "treasure";
    default: return "gear";
  }
}

/** A rarity as dnd5e keys it ("veryRare"), from a key or words ("Very Rare", "very rare"), or "" for mundane. */
export function normalizeRarity(raw) {
  const text = String(raw ?? "").trim();
  if ( !text ) return "";
  if ( RARITIES.includes(text) ) return text;
  const squashed = text.toLowerCase().replace(/[^a-z]/g, "");
  return RARITIES.find(r => r.toLowerCase() === squashed) ?? "";
}

/** 0 for mundane, 1 for common … 6 for an artifact. */
export function rarityRank(rarity) {
  return RARITIES.indexOf(normalizeRarity(rarity)) + 1;
}

/** The shop level an entry needs: its own, or its rarity's. */
export function levelOf(entry) {
  const own = entry?.level;
  if ( Number.isInteger(own) ) return Math.max(0, Math.min(MAX_LEVEL, own));
  return rarityRank(entry?.rarity);
}

function newId() {
  const fn = globalThis.foundry?.utils?.randomID;
  if ( typeof fn === "function" ) return fn(12);
  return Math.random().toString(36).slice(2, 14).padEnd(12, "0");
}

const text = (value, max=400) => String(value ?? "").trim().slice(0, max);
const numberOrNull = value => {
  if ( (value === null) || (value === undefined) || (value === "") ) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** A stock as typed: a whole number or a roll ("1d4+1"), else null (no limit). */
export function normalizeStock(raw) {
  if ( (raw === null) || (raw === undefined) ) return null;
  const value = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  if ( !value || ["-", "∞", "inf", "unlimited", "none"].includes(value) ) return null;
  if ( /^\d+$/.test(value) ) return String(Math.min(9999, Number(value)));
  if ( /^(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(value) ) return value;
  return null;
}

/** Is a stock a roll ("1d4"), which a restock rolls, rather than a number? */
export function isRolledStock(stock) {
  return (typeof stock === "string") && /d/.test(stock);
}

/** The price an item has (dnd5e's { value, denomination }, or a plain number of gold pieces). */
export function normalizePrice(raw) {
  if ( (raw === null) || (raw === undefined) ) return { value: 0, denomination: "gp" };
  if ( typeof raw !== "object" ) {
    const value = Number(raw);
    return { value: Number.isFinite(value) && (value > 0) ? value : 0, denomination: "gp" };
  }
  const value = Number(raw.value);
  return {
    value: Number.isFinite(value) && (value > 0) ? value : 0,
    denomination: (typeof raw.denomination === "string") && raw.denomination ? raw.denomination : "gp"
  };
}

/**
 * One entry of a list, with anything missing or broken filled in, or null when it has no name.
 * @param {object|string} raw
 */
export function normalizeEntry(raw) {
  if ( !raw || (typeof raw !== "object") ) return null;
  const name = text(raw.name, 200);
  if ( !name ) return null;
  const level = numberOrNull(raw.level);
  const priceGp = numberOrNull(raw.priceGp);
  const bundle = Math.max(1, Math.floor(Number(raw.bundle) || 1));
  return {
    id: text(raw.id, 40) || newId(),
    uuid: text(raw.uuid, 300) || null,
    name,
    img: text(raw.img, 500) || "icons/svg/item-bag.svg",
    type: PHYSICAL_TYPES.includes(raw.type) ? raw.type : "loot",
    subtype: text(raw.subtype, 40),
    rarity: normalizeRarity(raw.rarity),
    magical: !!raw.magical,
    attunement: !!raw.attunement,
    price: normalizePrice(raw.price),
    weight: Math.max(0, Number(raw.weight) || 0),
    bundle,
    book: text(raw.book, 80),
    level: (level === null) ? null : Math.max(0, Math.min(MAX_LEVEL, Math.round(level))),
    priceGp: (priceGp === null) ? null : Math.max(0, priceGp),
    stock: normalizeStock(raw.stock),
    description: text(raw.description, 4000)
  };
}

/** One list, or null. */
export function normalizeList(raw) {
  if ( !raw || (typeof raw !== "object") ) return null;
  const name = text(raw.name, 120);
  if ( !name ) return null;
  const seen = new Set();
  const entries = [];
  for ( const e of (Array.isArray(raw.entries) ? raw.entries : []) ) {
    const entry = normalizeEntry(e);
    if ( !entry ) continue;
    if ( seen.has(entry.id) ) entry.id = newId();
    seen.add(entry.id);
    entries.push(entry);
  }
  return { id: text(raw.id, 40) || newId(), name, entries };
}

/** Every list, as kept in the world setting. */
export function normalizeLists(raw) {
  const lists = [];
  const seen = new Set();
  for ( const l of (Array.isArray(raw?.lists) ? raw.lists : []) ) {
    const list = normalizeList(l);
    if ( !list ) continue;
    if ( seen.has(list.id) ) list.id = newId();
    seen.add(list.id);
    lists.push(list);
  }
  return { lists };
}

export function emptyLists() {
  return { lists: [] };
}

/** An entry's key in a shop: the item it gives (so an item on two lists is sold once), or the custom entry. */
export function entryKey(entry, listId) {
  return entry.uuid ? `uuid:${entry.uuid}` : `custom:${listId}:${entry.id}`;
}

/* -------------------------------------------- */
/*  Items                                       */
/* -------------------------------------------- */

const asArray = value => {
  if ( !value ) return [];
  if ( Array.isArray(value) ) return value;
  if ( (value instanceof Set) || (typeof value[Symbol.iterator] === "function" && (typeof value !== "string")) ) return [...value];
  if ( typeof value === "object" ) return Object.keys(value).filter(k => value[k]);
  return [value];
};

/**
 * What a shop needs to show an item, from its data (a document's toObject(), a compendium index entry or dnd5e's
 * prepared item: rarity can be dnd5e 6's rarities, or the older rarity).
 * @param {object} item  { name, img, type, system }
 * @param {string|null} [uuid]
 * @returns {object|null}  An entry (see normalizeEntry), or null for something that isn't a physical item.
 */
export function snapshotOf(item, uuid=null) {
  if ( !item || !PHYSICAL_TYPES.includes(item.type) ) return null;
  const s = item.system ?? {};
  const rarities = asArray(s.rarities).map(normalizeRarity).filter(Boolean);
  const rarity = rarities.length
    ? rarities.sort((a, b) => rarityRank(a) - rarityRank(b))[0]
    : normalizeRarity(typeof s.rarity === "string" ? s.rarity : "");
  const properties = asArray(s.properties);
  const weight = (typeof s.weight === "object") ? s.weight?.value : s.weight;
  const attunement = s.attunement;
  return normalizeEntry({
    uuid: uuid ?? item.uuid ?? null,
    name: item.name,
    img: item.img,
    type: item.type,
    subtype: (typeof s.type === "object") ? (s.type?.value ?? "") : "",
    rarity,
    magical: properties.includes("mgc"),
    attunement: (attunement === "required") || (attunement === true) || (attunement === 1),
    price: s.price,
    weight,
    bundle: s.quantity,
    book: (typeof s.source === "object") ? (s.source?.book ?? "") : ""
  });
}

/** A name for matching: lower case, letters and numbers only. */
export function nameKey(name) {
  return String(name ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** A name without what's in brackets ("Rope, Hempen (50 feet)" → "rope hempen"). */
export function looseNameKey(name) {
  return nameKey(String(name ?? "").replace(/\([^)]*\)|\[[^\]]*\]/g, " "));
}

/**
 * Find items by name.
 * @param {object[]} candidates  Entries (from snapshotOf), best source first.
 * @returns {(name: string) => object|null}
 */
export function nameFinder(candidates) {
  const exact = new Map();
  const loose = new Map();
  for ( const c of candidates ) {
    const k = nameKey(c.name);
    if ( k && !exact.has(k) ) exact.set(k, c);
    const l = looseNameKey(c.name);
    if ( l && !loose.has(l) ) loose.set(l, c);
  }
  return name => exact.get(nameKey(name)) ?? loose.get(looseNameKey(name)) ?? exact.get(looseNameKey(name)) ?? null;
}

/* -------------------------------------------- */
/*  Pasted lines                                */
/* -------------------------------------------- */

/**
 * Lines pasted in (from a book, a document or a spreadsheet): a name, then optionally its price, stock and level,
 * split by tabs, | or ;. "Potion of Healing", "Longsword | 20", "Arrows (20)<tab>1 gp<tab>10", "Spyglass; 1000; 1; L3".
 * A price can be a number of gold pieces or coins ("5 sp", "1 gp 5 sp"). Blank lines, lines starting with # and a
 * heading row ("Name | Price") are left out.
 * @param {string} input
 * @param {(text: string) => number|null} parsePrice  In the smallest coin.
 * @param {number} [gp]  The smallest coins in a gold piece.
 * @returns {{rows: {name: string, priceGp: number|null, stock: string|null, level: number|null, line: string}[], skipped: string[]}}
 */
export function parsePaste(input, parsePrice, gp=100) {
  const rows = [];
  const skipped = [];
  for ( const raw of String(input ?? "").split(/\r?\n/) ) {
    const line = raw.trim();
    if ( !line || line.startsWith("#") ) continue;
    const cells = line.split(/\t|\||;/).map(c => c.trim());
    const name = cells.shift()?.replace(/^[-*•]\s*/, "").trim();
    if ( !name ) {
      skipped.push(line);
      continue;
    }
    if ( (nameKey(name) === "name") || (nameKey(name) === "item") ) continue;
    let priceGp = null;
    let stock = null;
    let level = null;
    const [priceCell, stockCell, levelCell] = cells;
    if ( priceCell ) {
      const cp = parsePrice(priceCell);
      if ( cp !== null ) priceGp = Math.round((cp / gp) * 10000) / 10000;
    }
    if ( stockCell ) stock = normalizeStock(stockCell);
    if ( levelCell ) {
      const m = /(\d+)/.exec(levelCell);
      if ( m ) level = Math.max(0, Math.min(MAX_LEVEL, Number(m[1])));
    }
    rows.push({ name, priceGp, stock, level, line });
  }
  return { rows, skipped };
}

/* -------------------------------------------- */
/*  Import and export                           */
/* -------------------------------------------- */

/**
 * Lists from imported JSON: this module's export ({ lists: [...] }), a list of lists, or one list ({ name, entries }).
 * An entry can be written as a pasted line ("Longsword | 20").
 * @param {string|object} json
 * @param {(text: string) => number|null} parsePrice
 * @returns {{lists: object[]}}
 */
export function readImport(json, parsePrice=() => null) {
  const data = (typeof json === "string") ? JSON.parse(json) : json;
  let lists;
  if ( Array.isArray(data) ) lists = data;
  else if ( Array.isArray(data?.lists) ) lists = data.lists;
  else if ( data && (typeof data === "object") && ("entries" in data) ) lists = [data];
  else throw new Error("No shop lists found in it");
  const out = [];
  for ( const l of lists ) {
    if ( !l || (typeof l !== "object") ) continue;
    const entries = (Array.isArray(l.entries) ? l.entries : []).flatMap(e => {
      if ( typeof e !== "string" ) return [e];
      return parsePaste(e, parsePrice).rows.map(r => ({ name: r.name, priceGp: r.priceGp, stock: r.stock, level: r.level }));
    });
    const list = normalizeList({ ...l, entries });
    if ( list ) out.push(list);
  }
  return { lists: out };
}

/**
 * Put imported lists in with the ones there. A list with the same id, or else the same name, is replaced; the rest
 * are added. "replace" drops every list first.
 * @returns {{lists: object, counts: {added: number, replaced: number, entries: number}}}
 */
export function mergeLists(current, imported, mode="merge") {
  const result = normalizeLists(mode === "replace" ? emptyLists() : current);
  const counts = { added: 0, replaced: 0, entries: 0 };
  for ( const list of normalizeLists(imported).lists ) {
    counts.entries += list.entries.length;
    const at = result.lists.findIndex(l => (l.id === list.id) || (nameKey(l.name) === nameKey(list.name)));
    if ( at >= 0 ) {
      result.lists[at] = { ...list, id: result.lists[at].id };
      counts.replaced++;
    } else {
      result.lists.push(list);
      counts.added++;
    }
  }
  return { lists: result, counts };
}

/** The lists as JSON to save (only some, if ids are given). */
export function exportLists(lists, ids=null) {
  const all = normalizeLists(lists).lists;
  const chosen = ids ? all.filter(l => ids.includes(l.id)) : all;
  return JSON.stringify({ primalShops: 1, lists: chosen }, null, 2);
}

/* -------------------------------------------- */
/*  Filters                                     */
/* -------------------------------------------- */

/**
 * Does an entry pass a filter (the Add items window's)?
 * @param {object} entry
 * @param {object} filter
 * @param {string} [filter.text]           Name contains (case doesn't matter).
 * @param {string[]} [filter.categories]   Kinds (see CATEGORIES); none = any.
 * @param {string[]} [filter.rarities]     Rarities, "" for mundane; none = any.
 * @param {string} [filter.magic]          "any", "magic" or "mundane".
 * @param {string} [filter.book]           Its source book is this one ("" = any).
 * @param {number|null} [filter.minCp]     Price at least (the smallest coin).
 * @param {number|null} [filter.maxCp]     Price at most.
 * @param {boolean} [filter.priced]        Leave out items with no price.
 * @param {(entry: object) => number} priceOf  The entry's price in the smallest coin.
 */
export function matchesFilter(entry, filter={}, priceOf=() => 0) {
  if ( filter.text ) {
    const words = nameKey(filter.text).split(" ").filter(Boolean);
    const name = nameKey(entry.name);
    if ( !words.every(w => name.includes(w)) ) return false;
  }
  if ( filter.categories?.length && !filter.categories.includes(categoryOf(entry)) ) return false;
  if ( filter.rarities?.length && !filter.rarities.includes(entry.rarity ?? "") ) return false;
  if ( (filter.magic === "magic") && !(entry.magical || entry.rarity) ) return false;
  if ( (filter.magic === "mundane") && (entry.magical || entry.rarity) ) return false;
  if ( filter.book && (entry.book !== filter.book) ) return false;
  const price = priceOf(entry);
  if ( filter.priced && !(price > 0) ) return false;
  if ( Number.isFinite(filter.minCp) && (price < filter.minCp) ) return false;
  if ( Number.isFinite(filter.maxCp) && (price > filter.maxCp) ) return false;
  return true;
}

/* -------------------------------------------- */
/*  Sorting                                     */
/* -------------------------------------------- */

/** The ways items can be sorted: by name or price, either way. */
export const SORTS = ["nameUp", "nameDown", "priceUp", "priceDown"];

/**
 * Sort items (in place) by name or price, either way, or by rarity. Items with no price go last whichever way prices
 * are sorted; ties go by name. Names sort as people read them ("Potion 2" before "Potion 10", case aside).
 * @param {object[]} rows
 * @param {string} sort    nameUp, nameDown, priceUp, priceDown or rarity.
 * @param {object} [get]   How to read a row.
 * @param {(row: object) => string} [get.name]
 * @param {(row: object) => number} [get.price]  In the smallest coin; 0 or less: no price.
 * @param {(row: object) => number} [get.rank]   Rarity rank.
 * @returns {object[]}  The same array.
 */
export function sortRows(rows, sort, { name=r => r.name, price=r => r.priceCp, rank=r => rarityRank(r.rarity) }={}) {
  const byName = (a, b) => String(name(a) ?? "").localeCompare(String(name(b) ?? ""), undefined, { numeric: true, sensitivity: "base" });
  const value = r => Number(price(r)) || 0;
  const noPriceLast = (a, b) => (value(a) > 0 ? 0 : 1) - (value(b) > 0 ? 0 : 1);
  const compare = {
    nameUp: byName,
    nameDown: (a, b) => byName(b, a),
    priceUp: (a, b) => noPriceLast(a, b) || (value(a) - value(b)) || byName(a, b),
    priceDown: (a, b) => noPriceLast(a, b) || (value(b) - value(a)) || byName(a, b),
    rarity: (a, b) => (rank(a) - rank(b)) || byName(a, b)
  }[sort] ?? byName;
  return rows.sort(compare);
}

/* -------------------------------------------- */
/*  Starter lists                               */
/* -------------------------------------------- */

const ALCHEMY = /\b(alchemist|alchemist.?s|herbalism|poisoner.?s|antitoxin|holy water|perfume|acid|basic poison)\b|healer.?s kit/i;
const SCRIBE = /\b(parchment|paper|ink|ink pen|book|spellbook|map|maps|map case|scroll case|sealing wax|calligrapher.?s|cartographer.?s|chalk|journal)\b/i;
const WEAPON_KINDS = new Set(["simpleM", "simpleR", "martialM", "martialR"]);
const isMagic = e => !!(e.magical || e.rarity);

/**
 * The lists the module can start a world with, each a test of which items go in it. Built from whichever item
 * compendiums the GM picks (the 2024 Player's Handbook, dnd5e's own).
 */
export const STARTER_LISTS = [
  {
    id: "general",
    test: e => !isMagic(e) && !["weapon", "tool"].includes(e.type) && !(e.type === "equipment" && ARMOR.has(e.subtype))
      && !((e.type === "consumable") && ["potion", "poison", "scroll"].includes(e.subtype))
      && !((e.type === "loot") && e.subtype && (e.subtype !== "gear"))
  },
  {
    id: "smith",
    test: e => !isMagic(e) && (((e.type === "weapon") && WEAPON_KINDS.has(e.subtype))
      || ((e.type === "equipment") && ["light", "medium", "heavy", "shield"].includes(e.subtype))
      || ((e.type === "consumable") && (e.subtype === "ammo")))
  },
  {
    id: "alchemist",
    test: e => ((e.type === "consumable") && ["potion", "poison"].includes(e.subtype)) || (!isMagic(e) && ALCHEMY.test(e.name))
  },
  {
    id: "magic",
    test: e => isMagic(e) && !((e.type === "consumable") && ["potion", "poison", "scroll"].includes(e.subtype))
  },
  {
    id: "scribe",
    test: e => ((e.type === "consumable") && (e.subtype === "scroll")) || (!isMagic(e) && (e.type !== "weapon") && SCRIBE.test(e.name))
  },
  {
    id: "tools",
    test: e => (e.type === "tool") && !isMagic(e)
  }
];

/**
 * Build starter lists from items.
 * @param {object[]} items  Entries (from snapshotOf), best source first: an item whose name came earlier is skipped.
 * @param {object} options
 * @param {string[]} options.ids                The starter lists to build (see STARTER_LISTS).
 * @param {Record<string, string>} options.names  Each list's name.
 * @param {(entry: object) => number} options.priceOf  An entry's price, in the smallest coin: priceless items are left out.
 * @returns {object[]}  Lists.
 */
export function buildStarterLists(items, { ids, names, priceOf }) {
  const seen = new Set();
  const unique = [];
  for ( const item of items ) {
    const key = nameKey(item.name);
    if ( !key || seen.has(key) ) continue;
    seen.add(key);
    if ( !(priceOf(item) > 0) ) continue;
    unique.push(item);
  }
  unique.sort((a, b) => a.name.localeCompare(b.name));
  return STARTER_LISTS.filter(s => ids.includes(s.id)).map(s => normalizeList({
    name: names[s.id] ?? s.id,
    entries: unique.filter(s.test).map(e => ({ ...e, id: undefined }))
  })).filter(Boolean);
}
