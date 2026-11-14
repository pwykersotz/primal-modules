/**
 * Filtering and sorting, with no Foundry in it, so it can be checked in plain Node (tests/filter.test.mjs).
 *
 * Every directory entry, world document or compendium index entry, is first turned into a small record:
 *   { name, cr, level, type, source, rarity, itemType }
 * where cr and level are numbers (or null) and the others are { value, label, title?, rank? } (or null). Filters and sorts
 * only ever look at records.
 *
 * A filter state is:
 *   { sort: "" | "name" | "cr" | ..., desc: boolean, open: boolean,
 *     flat: boolean,                              ignore folders: everything in one list
 *     sets: { [facet]: { [value]: 1 | -1 } },    1 = must be one of these, -1 = must not be
 *     range: { [facet]: [min | null, max | null] } }
 */

/** Challenge ratings, in order. */
export const CR_STEPS = Object.freeze([0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)]);

/** dnd5e's rarities, lowest first. Items with no rarity at all (mundane) come before common. */
export const RARITY_ORDER = Object.freeze(["mundane", "common", "uncommon", "rare", "veryRare", "legendary", "artifact"]);

/**
 * What each kind of directory can be filtered and sorted by.
 * Facets are "set" (tags to require or exclude) or "range" (a from / to pair).
 */
export const FILTERS = Object.freeze({
  Actor: {
    facets: [{ id: "cr", kind: "range" }, { id: "type", kind: "set" }, { id: "source", kind: "set" }],
    sorts: ["name", "cr", "type", "source"],
    fields: ["system.details.cr", "system.details.type", "system.source"],
    // Each entry shows its CR (or level): compendium entries need their details read to have one.
    badge: true
  },
  Item: {
    facets: [{ id: "rarity", kind: "set" }, { id: "itemType", kind: "set" }, { id: "source", kind: "set" }],
    sorts: ["name", "rarity", "itemType", "source"],
    fields: ["system.rarity", "system.source"]
  },
  default: {
    facets: [],
    sorts: ["name"],
    fields: []
  }
});

/**
 * The filters for a kind of document.
 * @param {string} documentName
 */
export function filtersFor(documentName) {
  return FILTERS[documentName] ?? FILTERS.default;
}

/* -------------------------------------------- */
/*  State                                       */
/* -------------------------------------------- */

/** A fresh, empty filter state. */
export function emptyState() {
  return { sort: "", desc: false, open: false, flat: false, sets: {}, range: {} };
}

/**
 * A filter state read back from storage, made safe to use.
 * @param {object} [stored]
 * @param {string} [documentName]  Drop sorts and facets this kind of directory doesn't have.
 */
export function normalizeState(stored, documentName) {
  const state = emptyState();
  if ( !stored || (typeof stored !== "object") ) return state;
  const def = documentName ? filtersFor(documentName) : null;
  const facetIds = def ? new Set(def.facets.map(f => f.id)) : null;
  if ( (typeof stored.sort === "string") && (!def || def.sorts.includes(stored.sort)) ) state.sort = stored.sort;
  state.desc = stored.desc === true;
  state.open = stored.open === true;
  state.flat = stored.flat === true;
  for ( const [id, picks] of Object.entries(stored.sets ?? {}) ) {
    if ( facetIds && !facetIds.has(id) ) continue;
    const clean = {};
    for ( const [value, pick] of Object.entries(picks ?? {}) ) {
      if ( (pick === 1) || (pick === -1) ) clean[value] = pick;
    }
    if ( Object.keys(clean).length ) state.sets[id] = clean;
  }
  for ( const [id, bounds] of Object.entries(stored.range ?? {}) ) {
    if ( facetIds && !facetIds.has(id) ) continue;
    const [min, max] = Array.isArray(bounds) ? bounds : [];
    const num = v => (Number.isFinite(v) ? v : null);
    if ( (num(min) !== null) || (num(max) !== null) ) state.range[id] = [num(min), num(max)];
  }
  return state;
}

/** Whether a state hides anything. */
export function isFiltering(state) {
  if ( !state ) return false;
  if ( Object.values(state.sets ?? {}).some(picks => Object.keys(picks ?? {}).length) ) return true;
  return Object.values(state.range ?? {}).some(([min, max] = []) => (min ?? null) !== null || (max ?? null) !== null);
}

/** How many filters are set: each tag picked and each range bound. */
export function countActive(state) {
  let n = 0;
  for ( const picks of Object.values(state?.sets ?? {}) ) n += Object.keys(picks ?? {}).length;
  for ( const [min, max] of Object.values(state?.range ?? {}) ) {
    if ( (min ?? null) !== null ) n++;
    if ( (max ?? null) !== null ) n++;
  }
  return n;
}

/**
 * The next state of a tag when clicked: off, then required, then excluded, then off again.
 * @param {1|-1|undefined} current
 * @returns {1|-1|undefined}
 */
export function cyclePick(current) {
  if ( current === 1 ) return -1;
  if ( current === -1 ) return undefined;
  return 1;
}

/**
 * A copy of the state with one tag moved on.
 * @param {object} state
 * @param {string} facet
 * @param {string} value
 * @param {1|-1|undefined} [pick]  Set this instead of moving on.
 */
export function withPick(state, facet, value, pick) {
  const next = structuredClone(state);
  const picks = { ...(next.sets[facet] ?? {}) };
  const to = arguments.length > 3 ? pick : cyclePick(picks[value]);
  if ( to === undefined ) delete picks[value];
  else picks[value] = to;
  if ( Object.keys(picks).length ) next.sets[facet] = picks;
  else delete next.sets[facet];
  return next;
}

/**
 * A copy of the state with one end of a range set.
 * @param {object} state
 * @param {string} facet
 * @param {0|1} end        0 for the low end, 1 for the high end.
 * @param {number|null} value
 */
export function withBound(state, facet, end, value) {
  const next = structuredClone(state);
  const bounds = [...(next.range[facet] ?? [null, null])];
  bounds[end] = Number.isFinite(value) ? value : null;
  // Keep the ends the right way round.
  if ( (bounds[0] !== null) && (bounds[1] !== null) && (bounds[0] > bounds[1]) ) {
    if ( end === 0 ) bounds[1] = bounds[0];
    else bounds[0] = bounds[1];
  }
  if ( (bounds[0] === null) && (bounds[1] === null) ) delete next.range[facet];
  else next.range[facet] = bounds;
  return next;
}

/**
 * The sort actually used: the chosen one, or by name when folders are ignored and nothing is chosen (one long list
 * has no folder order to fall back on).
 * @param {object} state
 * @returns {{sort: string, desc: boolean}}
 */
export function effectiveSort(state) {
  if ( state?.sort ) return { sort: state.sort, desc: !!state.desc };
  return { sort: state?.flat ? "name" : "", desc: false };
}

/** A copy of the state with every filter cleared (the sort and the open panel stay). */
export function withoutFilters(state) {
  return { ...structuredClone(state), sets: {}, range: {} };
}

/* -------------------------------------------- */
/*  Matching                                    */
/* -------------------------------------------- */

/**
 * The values a record has for a set facet.
 * @param {object} record
 * @param {string} facet
 * @returns {string[]}
 */
export function valuesOf(record, facet) {
  const v = record?.[facet];
  if ( !v ) return [];
  if ( Array.isArray(v) ) return v.map(x => x.value).filter(Boolean);
  return v.value ? [v.value] : [];
}

/**
 * Whether a record gets through the filters.
 * Tags in one facet are alternatives (any of them will do); different facets must all be met.
 * @param {object} state
 * @param {object} record
 */
export function passes(state, record) {
  if ( !record ) return !isFiltering(state);
  for ( const [facet, picks] of Object.entries(state?.sets ?? {}) ) {
    const values = valuesOf(record, facet);
    const wanted = [];
    const unwanted = [];
    for ( const [value, pick] of Object.entries(picks) ) (pick === 1 ? wanted : unwanted).push(value);
    if ( wanted.length && !values.some(v => wanted.includes(v)) ) return false;
    if ( values.some(v => unwanted.includes(v)) ) return false;
  }
  for ( const [facet, [min, max] = []] of Object.entries(state?.range ?? {}) ) {
    const lo = min ?? null;
    const hi = max ?? null;
    if ( (lo === null) && (hi === null) ) continue;
    const v = record[facet];
    if ( !Number.isFinite(v) ) return false;
    if ( (lo !== null) && (v < lo) ) return false;
    if ( (hi !== null) && (v > hi) ) return false;
  }
  return true;
}

/* -------------------------------------------- */
/*  Sorting                                     */
/* -------------------------------------------- */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** The sort key of a record: a number, a string, or null when it has none (those always go last). */
function sortKey(record, sort) {
  switch ( sort ) {
    case "name": return record?.name ?? "";
    case "cr": return Number.isFinite(record?.cr) ? record.cr : null;
    case "rarity": return Number.isFinite(record?.rarity?.rank) ? record.rarity.rank : null;
    default: return record?.[sort]?.label || null;
  }
}

/**
 * Compare two records for a sort. Records without the sorted value go last either way round, and ties go by name.
 * @param {object} a
 * @param {object} b
 * @param {string} sort
 * @param {boolean} [desc]
 * @returns {number}
 */
export function compareRecords(a, b, sort, desc = false) {
  const byName = () => collator.compare(a?.name ?? "", b?.name ?? "");
  if ( !sort ) return 0;
  if ( sort === "name" ) return desc ? -byName() : byName();
  const ka = sortKey(a, sort);
  const kb = sortKey(b, sort);
  if ( (ka === null) || (kb === null) ) {
    if ( ka === kb ) return byName();
    return ka === null ? 1 : -1;
  }
  const c = (typeof ka === "number") && (typeof kb === "number") ? ka - kb : collator.compare(String(ka), String(kb));
  if ( c ) return desc ? -c : c;
  return byName();
}

/* -------------------------------------------- */
/*  Tags to offer                               */
/* -------------------------------------------- */

/**
 * The tags to offer for a set facet: every value the records have, with how many have it.
 * Rarities are in rarity order; everything else by name.
 * @param {object[]} records
 * @param {string} facet
 * @param {object} [picks]  Picked values are always offered, even if no record has them now.
 * @returns {{value: string, label: string, title?: string, count: number}[]}
 */
export function choicesFor(records, facet, picks = {}) {
  return choicesFrom(tallyFacet(records, facet), picks);
}

/**
 * Count the values the records have for a set facet. This is the slow part of choicesFor when there are tens of
 * thousands of records, so it can be done once and kept.
 * @param {object[]} records
 * @param {string} facet
 * @returns {Map<string, {value: string, label: string, title?: string, rank?: number, count: number}>}
 */
export function tallyFacet(records, facet) {
  const map = new Map();
  for ( const record of records ?? [] ) {
    const v = record?.[facet];
    for ( const item of (Array.isArray(v) ? v : (v ? [v] : [])) ) {
      if ( !item?.value ) continue;
      let entry = map.get(item.value);
      if ( !entry ) {
        entry = { value: item.value, label: item.label || item.value, title: item.title, rank: item.rank, count: 0 };
        map.set(item.value, entry);
      }
      entry.count++;
    }
  }
  return map;
}

/**
 * The tags to offer, from a count of values (tallyFacet).
 * @param {Map} tally
 * @param {object} [picks]  Picked values are always offered, even if no record has them now.
 * @returns {{value: string, label: string, title?: string, count: number}[]}
 */
export function choicesFrom(tally, picks = {}) {
  const list = Array.from(tally?.values() ?? []);
  for ( const value of Object.keys(picks ?? {}) ) {
    if ( !tally?.has(value) ) list.push({ value, label: value, count: 0 });
  }
  list.sort((a, b) => {
    if ( Number.isFinite(a.rank) || Number.isFinite(b.rank) ) return (a.rank ?? 99) - (b.rank ?? 99);
    return collator.compare(a.label, b.label);
  });
  return list.map(({ rank, ...rest }) => rest);
}

/* -------------------------------------------- */
/*  Records                                     */
/* -------------------------------------------- */

/**
 * A challenge rating as it is written: 1/8, 1/4, 1/2, 1, 2...
 * @param {number|null} cr
 */
export function formatCR(cr) {
  if ( !Number.isFinite(cr) ) return "";
  if ( cr === 0.125 ) return "1/8";
  if ( cr === 0.25 ) return "1/4";
  if ( cr === 0.5 ) return "1/2";
  return String(cr);
}

/**
 * The badge an actor's entry shows: its CR, or its level when it has no CR (a player character).
 * @param {object} record
 * @returns {{kind: "cr"|"level", value: string}|null}
 */
export function badgeFor(record) {
  if ( Number.isFinite(record?.cr) ) return { kind: "cr", value: formatCR(record.cr) };
  if ( Number.isFinite(record?.level) && (record.level > 0) ) return { kind: "level", value: String(record.level) };
  return null;
}

/** A number, or null. Accepts "1/4" too. */
export function toNumber(value) {
  if ( typeof value === "number" ) return Number.isFinite(value) ? value : null;
  if ( typeof value !== "string" || !value.trim() ) return null;
  const s = value.trim();
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if ( frac ) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** The label of a CONFIG entry, which may be a string or { label }. */
function labelOf(entry, localize) {
  const text = typeof entry === "string" ? entry : entry?.label;
  return text ? localize(text) : "";
}

/**
 * The record for a world document or a compendium index entry.
 *
 * @param {object} data                 The document, or the index entry (with the fields in FILTERS read in).
 * @param {object} context
 * @param {string} context.documentName "Actor", "Item", ...
 * @param {object} [context.config]     dnd5e's CONFIG.DND5E (creatureTypes, itemRarity, sourceBooks), if there is one.
 * @param {object} [context.typeLabels] CONFIG[documentName].typeLabels.
 * @param {Function} [context.localize] Translates a label.
 * @param {string} [context.fallbackSource]  The source for entries that name no book: for a compendium, the book
 *                                      its package declares, or the package's title (as dnd5e does).
 * @param {object} [context.labels]     { mundane, custom }: words for things with no CONFIG label.
 * @returns {object}
 */
export function recordOf(data, { documentName, config = {}, typeLabels = {}, localize = s => s, fallbackSource = "",
  labels = {} } = {}) {
  const system = data?.system ?? {};
  const record = { name: String(data?.name ?? "") };

  if ( documentName === "Actor" ) {
    record.cr = toNumber(system.details?.cr);
    record.level = toNumber(system.details?.level);
    record.type = creatureType(data, { config, typeLabels, localize, labels });
    record.source = sourceOf(system, { config, localize, fallbackSource });
  }

  else if ( documentName === "Item" ) {
    const kind = data?.type;
    record.itemType = kind && (kind !== "base")
      ? { value: kind, label: localize(typeLabels[kind] ?? "") || kind }
      : null;
    record.rarity = rarityOf(system, { config, localize, labels });
    record.source = sourceOf(system, { config, localize, fallbackSource });
  }

  return record;
}

/** An actor's creature type: the NPC's type, or what kind of actor it is (character, vehicle, group...). */
function creatureType(data, { config, typeLabels, localize, labels }) {
  const t = data?.system?.details?.type;
  if ( t && (typeof t === "object") && t.value ) {
    if ( t.value === "custom" ) {
      const custom = String(t.custom ?? "").trim();
      if ( custom ) return { value: `custom:${custom.toLowerCase()}`, label: custom };
      return { value: "custom", label: labels.custom ?? "Custom" };
    }
    return { value: t.value, label: labelOf(config.creatureTypes?.[t.value], localize) || capitalize(t.value) };
  }
  const kind = data?.type;
  if ( kind && (kind !== "npc") && (kind !== "base") ) {
    return { value: `kind:${kind}`, label: localize(typeLabels[kind] ?? "") || capitalize(kind) };
  }
  return null;
}

/** An item's rarity. Items that can have a rarity but have none are mundane; items that can't have one get none. */
function rarityOf(system, { config, localize, labels }) {
  if ( !("rarity" in system) ) return null;
  const value = String(system.rarity ?? "").trim() || "mundane";
  const rank = RARITY_ORDER.indexOf(value);
  const label = value === "mundane"
    ? (labels.mundane ?? "Mundane")
    : (labelOf(config.itemRarity?.[value], localize) || capitalize(value));
  return { value, label, rank: rank === -1 ? RARITY_ORDER.length : rank };
}

/** Where something comes from: the book it names, or the fallback. */
function sourceOf(system, { config, localize, fallbackSource }) {
  const s = system.source;
  let book = "";
  if ( typeof s === "string" ) book = s;
  else if ( s && (typeof s === "object") ) book = s.book || s.custom || "";
  book = String(book).trim() || String(fallbackSource ?? "").trim();
  if ( !book ) return null;
  const full = labelOf(config.sourceBooks?.[book], localize);
  return { value: book, label: book, title: full && (full !== book) ? full : undefined };
}

function capitalize(s) {
  const str = String(s ?? "");
  return str.charAt(0).toUpperCase() + str.slice(1);
}
