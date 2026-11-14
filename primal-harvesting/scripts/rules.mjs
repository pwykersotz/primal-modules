/**
 * The harvesting rules of Heliana's Guide to Monster Hunting, as numbers the GM can change (Harvest Rules window).
 * Nothing here touches Foundry, so the checks can run it under Node.
 *
 * The procedure:
 * - The harvesters pick components from the creature's harvest table and put them in order: the harvest list.
 * - Each component's DC is added to the ones before it, so the list's harvest DCs are a running total.
 * - One creature makes the assessment check (Intelligence) and another the carving check (Dexterity, or the
 *   spellcasting ability for ritual carving), both with the skill of the creature's type. One creature making both
 *   rolls both with disadvantage.
 * - Helpers (up to a number set by the creature's size) add their proficiency bonus if they're proficient in that
 *   skill, half of it (rounded down) if not.
 * - The total of both checks and the helpers is compared with the list in order: every component whose harvest DC
 *   the total meets is harvested, and the rest are lost.
 * - Creatures of a high enough challenge rating also hold an essence, whose DC and rarity depend on that rating.
 */

export const CREATURE_TYPES = [
  "aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid",
  "monstrosity", "ooze", "plant", "undead"
];

export const SIZES = ["tiny", "sm", "med", "lg", "huge", "grg"];

/** dnd5e's standard skills, for when the world's own list can't be read. */
export const SKILLS = [
  "acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv", "med", "nat", "prc", "prf", "per", "rel", "slt",
  "ste", "sur"
];

export const RARITIES = ["common", "uncommon", "rare", "veryRare", "legendary", "artifact"];

/** The skill the book names for constructs and elementals, which dnd5e doesn't have. */
const ARTIFICE = "Artifice";

/** The skill a world uses for Artifice when it has none of that name: the closest of dnd5e's own. */
const ARTIFICE_FALLBACK = "inv";

/**
 * The rules as the book gives them. Constructs and elementals use Artifice: the world's skill of that name (a module
 * such as Custom D&D 5e can rename one or add one), else Investigation.
 */
const DEFAULT_RULES = {
  types: {
    aberration: { skill: "arc", ritual: true },
    beast: { skill: "sur", ritual: false },
    celestial: { skill: "rel", ritual: true },
    construct: { skill: ARTIFICE, ritual: false },
    dragon: { skill: "arc", ritual: false },
    elemental: { skill: ARTIFICE, ritual: true },
    fey: { skill: "dec", ritual: true },
    fiend: { skill: "rel", ritual: true },
    giant: { skill: "med", ritual: false },
    humanoid: { skill: "med", ritual: false },
    monstrosity: { skill: "sur", ritual: false },
    ooze: { skill: "nat", ritual: false },
    plant: { skill: "nat", ritual: false },
    undead: { skill: "rel", ritual: false }
  },
  sizes: {
    tiny: { minutes: 5, helpers: 0 },
    sm: { minutes: 10, helpers: 1 },
    med: { minutes: 15, helpers: 2 },
    lg: { minutes: 30, helpers: 4 },
    huge: { minutes: 120, helpers: 6 },
    grg: { minutes: 720, helpers: 10 }
  },
  essences: [
    { name: "Frail", minCR: 3, maxCR: 6, dc: 25, rarity: "uncommon", price: 100 },
    { name: "Robust", minCR: 7, maxCR: 11, dc: 30, rarity: "rare", price: 400 },
    { name: "Potent", minCR: 12, maxCR: 17, dc: 35, rarity: "veryRare", price: 2000 },
    { name: "Mythic", minCR: 18, maxCR: 24, dc: 40, rarity: "legendary", price: 10000 },
    { name: "Deific", minCR: 25, maxCR: null, dc: 50, rarity: "artifact", price: 80000 }
  ],
  /** A component sells for this many gold pieces per point of its DC (0: no price). Essences have their own. */
  pricePerDC: 3,
  /** One creature making both checks rolls both with disadvantage. */
  bothDisadvantage: true
};

/** The world's skills: { key: label } (dnd5e's, renamed ones and ones other modules add), else dnd5e's standard. */
export function worldSkills() {
  const config = globalThis.CONFIG?.DND5E?.skills;
  const entries = (config && (typeof config === "object")) ? Object.entries(config) : [];
  const out = {};
  for ( const [key, entry] of entries ) {
    const raw = (typeof entry === "string") ? entry : (entry?.label ?? key);
    let label = String(raw ?? key);
    try {
      label = globalThis.game?.i18n?.localize?.(label) ?? label;
    } catch {
      // Not ready to localize: keep the key's label as written.
    }
    out[key] = label;
  }
  if ( !Object.keys(out).length ) for ( const key of SKILLS ) out[key] = key;
  return out;
}

/** The key of the world's skill with this name (any case), or null. */
export function skillNamed(name) {
  const want = String(name ?? "").trim().toLowerCase();
  if ( !want ) return null;
  const found = Object.entries(worldSkills()).find(([, label]) => label.trim().toLowerCase() === want);
  return found?.[0] ?? null;
}

/** A fresh copy of the book's rules. */
export function defaultRules() {
  const rules = structuredClone(DEFAULT_RULES);
  const artifice = skillNamed(ARTIFICE) ?? ARTIFICE_FALLBACK;
  for ( const rule of Object.values(rules.types) ) {
    if ( rule.skill === ARTIFICE ) rule.skill = artifice;
  }
  return rules;
}

function num(value, fallback, { min=0, max=Infinity }={}) {
  if ( (value === "") || (value === null) || (value === undefined) ) return fallback;
  const n = Number(value);
  if ( !Number.isFinite(n) ) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * The rules with anything missing or broken filled in from the book's.
 * @param {object} [raw]  The stored rules.
 * @returns {object}
 */
export function normalizeRules(raw) {
  const base = defaultRules();
  if ( !raw || (typeof raw !== "object") ) return base;
  const skills = worldSkills();
  const types = {};
  const rawTypes = (raw.types && (typeof raw.types === "object")) ? raw.types : {};
  for ( const key of new Set([...CREATURE_TYPES, ...Object.keys(rawTypes)]) ) {
    const fallback = base.types[key] ?? { skill: "nat", ritual: false };
    const r = rawTypes[key] ?? {};
    types[key] = {
      skill: (r.skill in skills) ? r.skill : fallback.skill,
      ritual: (typeof r.ritual === "boolean") ? r.ritual : fallback.ritual
    };
  }
  const sizes = {};
  const rawSizes = (raw.sizes && (typeof raw.sizes === "object")) ? raw.sizes : {};
  for ( const key of SIZES ) {
    const fallback = base.sizes[key];
    const r = rawSizes[key] ?? {};
    sizes[key] = {
      minutes: num(r.minutes, fallback.minutes, { min: 0 }),
      helpers: Math.floor(num(r.helpers, fallback.helpers, { min: 0, max: 50 }))
    };
  }
  let essences = base.essences;
  if ( Array.isArray(raw.essences) ) {
    essences = raw.essences
      .filter(e => e && (typeof e === "object") && String(e.name ?? "").trim())
      .map(e => ({
        name: String(e.name).trim(),
        minCR: num(e.minCR, 0, { min: 0 }),
        maxCR: ((e.maxCR === "") || (e.maxCR === null) || (e.maxCR === undefined)) ? null : num(e.maxCR, null, { min: 0 }),
        dc: Math.round(num(e.dc, 0, { min: 0 })),
        rarity: RARITIES.includes(e.rarity) ? e.rarity : "",
        price: ((e.price === "") || (e.price === null) || (e.price === undefined)) ? null : num(e.price, null, { min: 0 })
      }))
      .sort((a, b) => a.minCR - b.minCR);
  }
  return {
    types,
    sizes,
    essences,
    pricePerDC: num(raw.pricePerDC, base.pricePerDC, { min: 0, max: 10000 }),
    bothDisadvantage: (typeof raw.bothDisadvantage === "boolean") ? raw.bothDisadvantage : base.bothDisadvantage
  };
}

/** The rule for a creature type (its skill, and whether ritual carving is allowed), or null for an unknown type. */
export function typeRule(rules, type) {
  return rules.types[type] ?? null;
}

/** The rule for a creature size (harvest minutes and most helpers). Unknown sizes count as Medium. */
export function sizeRule(rules, size) {
  return rules.sizes[size] ?? rules.sizes.med;
}

/**
 * The essence a creature of this challenge rating holds, or null.
 * @param {number} cr
 * @param {object} rules
 */
export function essenceFor(cr, rules) {
  const value = Number(cr);
  if ( !Number.isFinite(value) ) return null;
  return rules.essences.find(e => (value >= e.minCR) && ((e.maxCR === null) || (value <= e.maxCR))) ?? null;
}

/**
 * What a harvested component sells for, in gold pieces, or null: an essence's own price, else its DC (the one on its
 * table, not its running harvest DC) times the rules' price per DC.
 * @param {{dc: number, essence?: string, price?: number|null}} component
 * @param {object} rules
 */
export function priceOf(component, rules) {
  if ( component?.essence ) {
    const price = Number(component.price);
    return (component.price !== null) && (component.price !== undefined) && Number.isFinite(price) ? price : null;
  }
  const per = Number(rules?.pricePerDC) || 0;
  const dc = Number(component?.dc) || 0;
  return (per > 0) && (dc > 0) ? Math.round(dc * per * 100) / 100 : null;
}

/**
 * What a helper adds to the harvesting check: their proficiency bonus if they're proficient in the skill, half of it
 * (rounded down) if not.
 * @param {{prof: number, proficient: boolean}} helper
 */
export function helperBonus({ prof=0, proficient=false }={}) {
  const p = Math.max(0, Number(prof) || 0);
  return proficient ? p : Math.floor(p / 2);
}

/**
 * The harvest DC of each component of a harvest list: its own DC plus every DC before it.
 * @param {{dc: number}[]} list
 * @returns {number[]}
 */
export function harvestDCs(list) {
  let sum = 0;
  return list.map(c => (sum += Math.max(0, Number(c.dc) || 0)));
}

/**
 * Which components of a harvest list a total gets: each one whose harvest DC it meets.
 * @param {object[]} list
 * @param {number} total
 * @returns {object[]}  Copies of the components with harvestDC and harvested.
 */
export function resolveHarvest(list, total) {
  const dcs = harvestDCs(list);
  return list.map((c, i) => ({ ...c, harvestDC: dcs[i], harvested: Number(total) >= dcs[i] }));
}

/** The average of a d20: normal, with advantage or with disadvantage. */
export function averageD20(mode=0) {
  if ( mode > 0 ) return 13.825;
  if ( mode < 0 ) return 7.175;
  return 10.5;
}

/**
 * The total an average roll gets.
 * @param {object} p
 * @param {number} p.assess       The assessment check's modifier.
 * @param {number} p.carve        The carving check's modifier.
 * @param {number} [p.helpers]    What the helpers add.
 * @param {number} [p.mode]       -1 for disadvantage on both checks.
 */
export function expectedTotal({ assess=0, carve=0, helpers=0, mode=0 }) {
  return (2 * averageD20(mode)) + assess + carve + helpers;
}

/**
 * How likely an average roll is to reach a harvest DC: "likely", "maybe" (within 4 of the average) or "unlikely".
 */
export function chance(harvestDC, expected) {
  if ( harvestDC <= expected - 4 ) return "likely";
  if ( harvestDC <= expected + 4 ) return "maybe";
  return "unlikely";
}

/**
 * Minutes as hours and minutes ({ hours: 2, minutes: 0 }).
 * @param {number} minutes
 */
export function splitMinutes(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  return { hours: Math.floor(m / 60), minutes: m % 60 };
}
