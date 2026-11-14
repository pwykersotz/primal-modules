/**
 * Harvest tables: the components each creature type gives (Aberration, Beast, ...), and tables of their own for
 * particular creatures (an Owlbear, a Polyhedrooze). The GM fills them in from the book in the Harvest Tables window,
 * pastes rows copied from the book, or imports a JSON file. Nothing here touches Foundry.
 *
 * A component: { id, name, dc, tags, max, note, uuid }
 * - tags use the book's marks: "E" (edible), "E+" (edible, and used in crafting), "V" (volatile), "*" (see the note),
 *   "**" (monster-forged items only). Any other word is kept as written.
 * - max: how many times it can go in one harvest list (two eyes), or null for no limit.
 * - uuid: an Item to give instead of a plain component item (a compendium item, say).
 *
 * A creature table: { id, name, aliases, useTypeTable, note, components }. It's used for creatures whose name (or
 * alias) matches, or that the GM picked it for. With useTypeTable, the creature type's table is offered too.
 *
 * A type can also have a note (the book's rules for harvesting that type, shown in the harvest window) and a table of
 * random components, rolled once per creature (the book's d100 table of what an ooze has inside it):
 * { name, rows: [{ min, max, name, from, dc, tags, rolls }] }. A row with no name gives nothing; rolls is how many
 * more times to roll; from is the creature type (or types, "celestial/fey/fiend") it came from, whose table gives the
 * DC when the row has none.
 *
 * The tables: { types: { [type]: component[] }, notes: { [type]: string }, random: { [type]: table },
 *   creatures: creature[] }
 */
import { CREATURE_TYPES } from "./rules.mjs";
import { newId } from "./constants.mjs";

/** The book's marks, in the order they're shown. */
export const TAG_CODES = ["E", "E+", "V", "*", "**"];

/** Words that mean one of the marks. */
const TAG_WORDS = {
  edible: "E",
  "edible+": "E+",
  volatile: "V"
};

/** An empty set of tables. */
export function emptyTables() {
  return { types: Object.fromEntries(CREATURE_TYPES.map(t => [t, []])), notes: {}, random: {}, creatures: [] };
}

/** A note as stored: text with its line breaks, trimmed. */
function normalizeNote(note) {
  return String(note ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

/** One tag as stored ("e+" is "E+", "volatile" is "V"), or null for nothing. */
export function normalizeTag(tag) {
  const t = String(tag ?? "").trim().replace(/^[,;]+|[,;]+$/g, "");
  if ( !t ) return null;
  const upper = t.toUpperCase();
  if ( TAG_CODES.includes(upper) ) return upper;
  const word = TAG_WORDS[t.toLowerCase()];
  if ( word ) return word;
  return t;
}

/** Tags from an array or a string ("E+, V" or "E+ V"), without repeats. */
export function normalizeTags(tags) {
  let list = [];
  if ( Array.isArray(tags) ) list = tags;
  else if ( typeof tags === "string" ) list = tags.split(/[,;\s]+/);
  const out = [];
  for ( const tag of list ) {
    const t = normalizeTag(tag);
    if ( t && !out.includes(t) ) out.push(t);
  }
  return out;
}

function intOrNull(value, { min=0, max=999 }={}) {
  if ( (value === "") || (value === null) || (value === undefined) ) return null;
  const n = Math.floor(Number(value));
  if ( !Number.isFinite(n) ) return null;
  return Math.min(max, Math.max(min, n));
}

/**
 * A component as stored, or null if it has no name.
 * @param {object|string} raw
 */
export function normalizeComponent(raw) {
  if ( typeof raw === "string" ) {
    const parsed = parseRow(raw);
    return parsed ? normalizeComponent(parsed) : null;
  }
  if ( !raw || (typeof raw !== "object") ) return null;
  const name = String(raw.name ?? raw.component ?? "").trim();
  if ( !name ) return null;
  return {
    id: (typeof raw.id === "string") && raw.id ? raw.id : newId(),
    name,
    dc: intOrNull(raw.dc ?? raw.DC, { min: 0, max: 99 }) ?? 0,
    tags: normalizeTags(raw.tags ?? raw.metatags ?? []),
    max: intOrNull(raw.max ?? raw.count, { min: 1, max: 99 }),
    note: String(raw.note ?? raw.description ?? "").trim(),
    uuid: String(raw.uuid ?? raw.item ?? "").trim()
  };
}

function normalizeComponents(list) {
  if ( !Array.isArray(list) ) return [];
  return list.map(normalizeComponent).filter(Boolean);
}

/** A creature table as stored, or null if it has no name. */
export function normalizeCreature(raw) {
  if ( !raw || (typeof raw !== "object") ) return null;
  const name = String(raw.name ?? "").trim();
  if ( !name ) return null;
  let aliases = raw.aliases ?? raw.match ?? [];
  if ( typeof aliases === "string" ) aliases = aliases.split(/[,;\n]+/);
  aliases = (Array.isArray(aliases) ? aliases : []).map(a => String(a ?? "").trim()).filter(Boolean);
  return {
    id: (typeof raw.id === "string") && raw.id ? raw.id : newId(),
    name,
    aliases: [...new Set(aliases)],
    useTypeTable: !!raw.useTypeTable,
    note: normalizeNote(raw.note),
    components: normalizeComponents(raw.components)
  };
}

/**
 * A type's entry as written in a file or the stored tables: a list of components, or { components, note, random }.
 * @returns {{components: object[]|null, note: string|null, random: object|null|undefined}}  null: not given.
 */
function readTypeEntry(value) {
  if ( Array.isArray(value) ) return { components: normalizeComponents(value), note: null, random: undefined };
  if ( !value || (typeof value !== "object") ) return { components: null, note: null, random: undefined };
  return {
    components: Array.isArray(value.components) ? normalizeComponents(value.components) : null,
    note: ("note" in value) ? normalizeNote(value.note) : null,
    random: ("random" in value) ? normalizeRandomTable(value.random) : undefined
  };
}

/** The stored tables with anything missing filled in. */
export function normalizeTables(raw) {
  const tables = emptyTables();
  if ( !raw || (typeof raw !== "object") ) return tables;
  const types = (raw.types && (typeof raw.types === "object")) ? raw.types : {};
  for ( const [key, value] of Object.entries(types) ) {
    const type = String(key).toLowerCase();
    const entry = readTypeEntry(value);
    tables.types[type] = entry.components ?? [];
    if ( entry.note ) tables.notes[type] = entry.note;
    if ( entry.random ) tables.random[type] = entry.random;
  }
  for ( const [key, note] of Object.entries((raw.notes && (typeof raw.notes === "object")) ? raw.notes : {}) ) {
    const text = normalizeNote(note);
    if ( text ) tables.notes[String(key).toLowerCase()] = text;
  }
  for ( const [key, table] of Object.entries((raw.random && (typeof raw.random === "object")) ? raw.random : {}) ) {
    const random = normalizeRandomTable(table);
    if ( random ) tables.random[String(key).toLowerCase()] = random;
  }
  const creatures = Array.isArray(raw.creatures) ? raw.creatures : [];
  tables.creatures = creatures.map(normalizeCreature).filter(Boolean);
  return tables;
}

/* -------------------------------------------- */
/*  Pasted rows                                 */
/* -------------------------------------------- */

const TAG_TOKEN = /^(E\+?|V|\*{1,2})[,;]?$/i;

/**
 * One row of a table copied from the book: a DC (a whole number), the component's name, and its marks, in any order
 * ("Eye 5 E", "5 Eye E+, V", "Eye<tab>5<tab>E"). Null if there's no DC or no name (a heading, say).
 * @param {string} line
 * @returns {{name: string, dc: number, tags: string[]}|null}
 */
export function parseRow(line) {
  const text = String(line ?? "").replace(/ /g, " ").trim();
  if ( !text ) return null;
  let cells = text.split(/\t+|\s{2,}|\s*\|\s*/).map(c => c.trim()).filter(Boolean);
  if ( cells.length < 2 ) cells = text.split(/\s+/);
  // Marks stuck to the end of a cell ("Brain*", "Eye,E") come off it.
  const tokens = [];
  for ( const cell of cells ) {
    for ( const word of cell.split(/\s+/) ) {
      const stuck = word.match(/^(.+?[^*\s])(\*{1,2})$/);
      if ( stuck && !/^\d+$/.test(stuck[1]) ) tokens.push({ cell, text: stuck[1] }, { cell, text: stuck[2] });
      else tokens.push({ cell, text: word });
    }
  }
  // The DC is the number at the start of the row, else the last number in it ("2 eyes 5" is DC 5 only if no
  // number starts it; "Eye 5" and "5 Eye" are both DC 5).
  const cleanOf = t => t.replace(/^[(\[]|[)\],;:.]$/g, "");
  const isNumber = t => /^(DC)?\d{1,2}$/i.test(cleanOf(t));
  let dcAt = isNumber(tokens[0]?.text ?? "") ? 0 : -1;
  if ( dcAt < 0 ) tokens.forEach((tok, i) => { if ( isNumber(tok.text) ) dcAt = i; });
  let dc = null;
  const tags = [];
  const name = [];
  for ( const [i, { text: t }] of tokens.entries() ) {
    const clean = cleanOf(t);
    if ( i === dcAt ) {
      dc = Number(clean.replace(/^DC/i, ""));
      continue;
    }
    if ( /^DC$/i.test(clean) ) continue;
    if ( TAG_TOKEN.test(t) || TAG_TOKEN.test(clean) ) {
      const tag = normalizeTag(clean.replace(/[,;]$/, ""));
      if ( tag && !tags.includes(tag) ) tags.push(tag);
      continue;
    }
    if ( t.includes(",") && t.split(",").every(p => !p || TAG_TOKEN.test(p)) ) {
      for ( const p of t.split(",") ) {
        const tag = normalizeTag(p);
        if ( tag && !tags.includes(tag) ) tags.push(tag);
      }
      continue;
    }
    name.push(t);
  }
  const label = name.join(" ").replace(/\s+/g, " ").replace(/^[-–—:,.\s]+|[-–—:,\s]+$/g, "").trim();
  if ( (dc === null) || !label ) return null;
  return { name: label, dc, tags };
}

/**
 * Rows pasted from the book, one per line.
 * @param {string} text
 * @returns {{rows: object[], skipped: string[]}}  The components, and the lines that weren't rows.
 */
export function parseRows(text) {
  const rows = [];
  const skipped = [];
  for ( const line of String(text ?? "").split(/\r?\n/) ) {
    if ( !line.trim() ) continue;
    const row = parseRow(line);
    if ( row ) rows.push(normalizeComponent(row));
    else skipped.push(line.trim());
  }
  return { rows, skipped };
}

/* -------------------------------------------- */
/*  Random components                           */
/* -------------------------------------------- */

const ROLL_WORDS = { once: 1, one: 1, twice: 2, two: 2, thrice: 3, three: 3, four: 4, five: 5 };

/**
 * One row of a random components table, as written in the book or the tables window:
 * "1-20 Nothing", "21 Pouch of claws (aberration)", "36 Horn* (celestial/fey/fiend)", "50-56 Pouch of teeth
 * (humanoid) DC 10", "97-99 Roll twice more on this table". Null if it doesn't start with a number or range.
 * @param {string} line
 */
export function parseRandomRow(line) {
  const text = String(line ?? "").replace(/\u00a0/g, " ").trim();
  const m = text.match(/^(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?(?:\s*[.:)|]\s*|\s+)(.*)$/);
  if ( !m ) return null;
  const min = (m[1] === "00") ? 100 : Number(m[1]);
  const max = (m[2] === undefined) ? min : ((m[2] === "00") ? 100 : Number(m[2]));
  let rest = m[3].trim();
  const row = { min: Math.min(min, max), max: Math.max(min, max), name: "", from: "", dc: null, tags: [], rolls: 0 };
  const again = rest.match(/^roll\s+(\w+)\s*(?:more|again|times)?/i);
  if ( again ) {
    const word = again[1].toLowerCase();
    row.rolls = Math.max(1, Math.min(5, ROLL_WORDS[word] ?? (Number(word) || 1)));
    return row;
  }
  if ( !rest || /^(nothing|none|no components?|[-–—])\.?$/i.test(rest) ) return row;
  const dc = rest.match(/\bDC\s*(\d{1,2})\b/i);
  if ( dc ) {
    row.dc = Number(dc[1]);
    rest = rest.replace(dc[0], " ");
  }
  const from = rest.match(/\(([^)]*)\)/);
  if ( from ) {
    row.from = from[1].trim().toLowerCase();
    rest = rest.replace(from[0], " ");
  }
  const name = [];
  for ( const word of rest.split(/\s+/).filter(Boolean) ) {
    const stuck = word.match(/^(.+?[^*])(\*{1,2})$/);
    if ( stuck ) {
      name.push(stuck[1]);
      row.tags.push(stuck[2]);
    }
    else if ( TAG_TOKEN.test(word) && name.length ) row.tags.push(normalizeTag(word.replace(/[,;]$/, "")));
    else name.push(word);
  }
  row.name = name.join(" ").replace(/^[-–—:,.\s]+|[-–—:,\s]+$/g, "").trim();
  row.tags = normalizeTags(row.tags);
  return row;
}

/** A row of a random components table as text (the way parseRandomRow reads it). */
export function randomRowText(row) {
  const range = (row.min === row.max) ? `${row.min}` : `${row.min}-${row.max}`;
  if ( row.rolls ) {
    const word = { 1: "once", 2: "twice", 3: "thrice" }[row.rolls] ?? `${row.rolls} times`;
    return `${range} Roll ${word} more`;
  }
  if ( !row.name ) return `${range} Nothing`;
  const parts = [range, row.name];
  if ( row.from ) parts.push(`(${row.from})`);
  if ( row.dc !== null ) parts.push(`DC ${row.dc}`);
  if ( row.tags?.length ) parts.push(row.tags.join(" "));
  return parts.join(" ");
}

/** A row of a random components table as stored (from an object or a line of text), or null. */
export function normalizeRandomRow(raw) {
  if ( typeof raw === "string" ) return parseRandomRow(raw);
  if ( !raw || (typeof raw !== "object") ) return null;
  const min = intOrNull(raw.min ?? raw.roll, { min: 1, max: 1000 });
  if ( min === null ) return null;
  const max = intOrNull(raw.max, { min: 1, max: 1000 }) ?? min;
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    name: String(raw.name ?? "").trim(),
    from: String(raw.from ?? raw.type ?? "").trim().toLowerCase(),
    dc: intOrNull(raw.dc, { min: 0, max: 99 }),
    tags: normalizeTags(raw.tags ?? []),
    rolls: intOrNull(raw.rolls, { min: 0, max: 5 }) ?? 0
  };
}

/**
 * A random components table as stored, or null if it has no rows. Takes { name, rows } or a list of rows (objects or
 * lines of text) or the lines as one string.
 */
export function normalizeRandomTable(raw) {
  let name = "";
  let rows = raw;
  if ( raw && (typeof raw === "object") && !Array.isArray(raw) ) {
    name = String(raw.name ?? "").trim();
    rows = raw.rows;
  }
  if ( typeof rows === "string" ) rows = rows.split(/\r?\n/);
  if ( !Array.isArray(rows) ) return null;
  const list = rows.map(normalizeRandomRow).filter(Boolean).sort((a, b) => a.min - b.min);
  return list.length ? { name, rows: list } : null;
}

/** Lines of text pasted or typed for a random table: its rows and the lines that weren't rows. */
export function parseRandomRows(text) {
  const rows = [];
  const skipped = [];
  for ( const line of String(text ?? "").split(/\r?\n/) ) {
    if ( !line.trim() ) continue;
    const row = parseRandomRow(line);
    if ( row ) rows.push(row);
    else skipped.push(line.trim());
  }
  return { rows: rows.sort((a, b) => a.min - b.min), skipped };
}

/** The die a random table is rolled with: its highest number (100 for a d100 table). */
export function randomDie(table) {
  return Math.max(1, ...(table?.rows ?? []).map(r => r.max));
}

/** The row of a random table a roll lands on, or null. */
export function randomRowFor(table, total) {
  return (table?.rows ?? []).find(r => (total >= r.min) && (total <= r.max)) ?? null;
}

/** The creature types a row's from names ("celestial/fey/fiend", "celestial, fey or fiend"). */
export function fromTypes(from) {
  return String(from ?? "").toLowerCase().split(/\s*(?:\/|,|\bor\b|&|\band\b)\s*/).map(t => t.trim()).filter(Boolean);
}

/**
 * The DC of a random row's component: its own, else the one on its creature type's table (the first of its types
 * that has a component of that name), else null.
 */
export function randomRowDC(row, tables) {
  if ( (row.dc !== null) && (row.dc !== undefined) ) return row.dc;
  const want = matchName(row.name);
  for ( const type of fromTypes(row.from) ) {
    const found = (tables?.types?.[type] ?? []).find(c => matchName(c.name) === want);
    if ( found ) return found.dc;
  }
  return null;
}

/* -------------------------------------------- */
/*  Import and export                           */
/* -------------------------------------------- */

/** Is this key a creature type (a table of types, rather than of creatures)? */
function isTypeKey(key) {
  return CREATURE_TYPES.includes(String(key).toLowerCase());
}

/**
 * Read tables from imported JSON. Takes this module's own export ({ types, creatures }), and also:
 * - an object of types alone ({ "aberration": [...], "beast": [...] }),
 * - creatures as an object ({ "Owlbear": [...] } or { "Owlbear": { aliases, components } }),
 * - a list of creature tables.
 * A type can be a list of components, or { note, components, random } with its note and random components table.
 * @param {string|object} input
 * @returns {{types: Record<string, object[]>, notes: Record<string, string>, random: Record<string, object|null>,
 *   creatures: object[]}}
 * @throws {Error} When it isn't JSON or holds no tables.
 */
export function readImport(input) {
  let data = input;
  if ( typeof input === "string" ) {
    try {
      data = JSON.parse(input);
    } catch (err) {
      throw new Error(`Not JSON: ${err.message}`);
    }
  }
  const out = { types: {}, notes: {}, random: {}, creatures: [] };
  const addType = (key, value) => {
    const type = String(key).toLowerCase();
    const entry = readTypeEntry(value);
    if ( entry.components ) out.types[type] = entry.components;
    if ( entry.note !== null ) out.notes[type] = entry.note;
    if ( entry.random !== undefined ) out.random[type] = entry.random;
  };
  const addCreatures = value => {
    if ( Array.isArray(value) ) {
      for ( const c of value ) {
        const creature = normalizeCreature(c);
        if ( creature ) out.creatures.push(creature);
      }
    }
    else if ( value && (typeof value === "object") ) {
      for ( const [name, v] of Object.entries(value) ) {
        const creature = normalizeCreature(Array.isArray(v) ? { name, components: v } : { name, ...v });
        if ( creature ) out.creatures.push(creature);
      }
    }
  };
  if ( Array.isArray(data) ) addCreatures(data);
  else if ( data && (typeof data === "object") ) {
    const hasOwn = ("types" in data) || ("creatures" in data);
    if ( hasOwn ) {
      for ( const [key, value] of Object.entries(data.types ?? {}) ) addType(key, value);
      for ( const [key, note] of Object.entries(data.notes ?? {}) ) out.notes[String(key).toLowerCase()] = normalizeNote(note);
      for ( const [key, table] of Object.entries(data.random ?? {}) ) out.random[String(key).toLowerCase()] = normalizeRandomTable(table);
      addCreatures(data.creatures);
    }
    else {
      const creatures = {};
      for ( const [key, value] of Object.entries(data) ) {
        if ( isTypeKey(key) && (Array.isArray(value) || Array.isArray(value?.components)) ) addType(key, value);
        else creatures[key] = value;
      }
      addCreatures(creatures);
    }
  }
  const any = [out.types, out.notes, out.random].some(o => Object.keys(o).length) || out.creatures.length;
  if ( !any ) throw new Error("No harvest tables found");
  return out;
}

/**
 * Put imported tables into the current ones. A type table that's imported replaces that type's table (and its note
 * and random table, when the file has them); a creature table replaces the one of the same name, or is added.
 * "replace" empties everything first.
 * @param {object} current            The current tables (normalized).
 * @param {object} imported           From readImport.
 * @param {"merge"|"replace"} [mode]
 * @returns {{tables: object, counts: {types: number, creatures: number, components: number}}}
 */
export function mergeTables(current, imported, mode="merge") {
  const tables = (mode === "replace") ? emptyTables() : structuredClone(normalizeTables(current));
  let components = 0;
  for ( const [type, list] of Object.entries(imported.types ?? {}) ) {
    tables.types[type] = list.map(c => ({ ...c }));
    components += list.length;
  }
  for ( const [type, note] of Object.entries(imported.notes ?? {}) ) {
    if ( note ) tables.notes[type] = note;
    else delete tables.notes[type];
  }
  for ( const [type, random] of Object.entries(imported.random ?? {}) ) {
    if ( random ) tables.random[type] = structuredClone(random);
    else delete tables.random[type];
  }
  for ( const creature of imported.creatures ?? [] ) {
    const at = tables.creatures.findIndex(c => c.name.toLowerCase() === creature.name.toLowerCase());
    const copy = structuredClone(creature);
    if ( at >= 0 ) {
      copy.id = tables.creatures[at].id;
      tables.creatures[at] = copy;
    }
    else tables.creatures.push(copy);
    components += creature.components.length;
  }
  tables.creatures.sort((a, b) => a.name.localeCompare(b.name));
  return {
    tables,
    counts: {
      types: new Set([...Object.keys(imported.types ?? {}), ...Object.keys(imported.notes ?? {}),
        ...Object.keys(imported.random ?? {})]).size,
      creatures: (imported.creatures ?? []).length,
      components
    }
  };
}

function exportComponent(c) {
  const out = { name: c.name, dc: c.dc };
  if ( c.tags?.length ) out.tags = [...c.tags];
  if ( c.max ) out.max = c.max;
  if ( c.note ) out.note = c.note;
  if ( c.uuid ) out.uuid = c.uuid;
  return out;
}

/**
 * The tables as JSON for a file: no ids, and empty type tables left out. A type with a note or a random table is
 * written as { note, components, random }, with the random table's rows as lines of text.
 */
export function exportTables(tables) {
  const t = normalizeTables(tables);
  const types = {};
  for ( const [type, list] of Object.entries(t.types) ) {
    const note = t.notes[type];
    const random = t.random[type];
    if ( !list.length && !note && !random ) continue;
    if ( !note && !random ) {
      types[type] = list.map(exportComponent);
      continue;
    }
    const entry = {};
    if ( note ) entry.note = note;
    entry.components = list.map(exportComponent);
    if ( random ) {
      entry.random = { rows: random.rows.map(randomRowText) };
      if ( random.name ) entry.random = { name: random.name, ...entry.random };
    }
    types[type] = entry;
  }
  const creatures = t.creatures.map(c => {
    const out = { name: c.name };
    if ( c.aliases.length ) out.aliases = [...c.aliases];
    if ( c.useTypeTable ) out.useTypeTable = true;
    if ( c.note ) out.note = c.note;
    out.components = c.components.map(exportComponent);
    return out;
  });
  return JSON.stringify({ types, creatures }, null, 2);
}

/* -------------------------------------------- */
/*  Which components a creature gives           */
/* -------------------------------------------- */

/** A name for matching: lower case, single spaces, without a trailing number ("Ghoul 3"). */
export function matchName(name) {
  return String(name ?? "").toLowerCase().replace(/\s+/g, " ").replace(/\s*\(?#?\d+\)?$/, "").trim();
}

/**
 * The creature table a creature uses: the one the GM picked for it, else the first whose name or alias matches one
 * of its names (actor and token names).
 * @param {object} tables
 * @param {{names?: string[], creatureId?: string|null}} who
 */
export function matchCreature(tables, { names=[], creatureId=null }={}) {
  if ( creatureId ) {
    const picked = tables.creatures.find(c => c.id === creatureId);
    if ( picked ) return picked;
  }
  const wanted = new Set(names.map(matchName).filter(Boolean));
  if ( !wanted.size ) return null;
  return tables.creatures.find(c => [c.name, ...c.aliases].some(n => wanted.has(matchName(n)))) ?? null;
}

/**
 * The components a creature can give: its creature table's, then (if that table says so, or there's no creature
 * table) its type's.
 * @param {object} tables
 * @param {{type: string, names?: string[], creatureId?: string|null}} who
 * @returns {{creature: object|null, components: object[]}}  Components carry source ("creature" or "type") and key.
 */
export function componentsFor(tables, { type, names=[], creatureId=null }) {
  const creature = matchCreature(tables, { names, creatureId });
  const components = [];
  if ( creature ) {
    for ( const c of creature.components ) components.push({ ...c, source: "creature", key: `creature:${c.id}` });
  }
  if ( !creature || creature.useTypeTable ) {
    for ( const c of tables.types[type] ?? [] ) components.push({ ...c, source: "type", key: `type:${c.id}` });
  }
  return { creature, components };
}
