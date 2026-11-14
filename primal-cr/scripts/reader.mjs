/**
 * Read a dnd5e actor into a combat profile: what it can take (HP, AC, saves, resistances) and what it can do
 * (attacks, saves it forces, healing, conditions it hands out, limited uses).
 *
 * Works on plain data (an actor's toObject()) so it runs without Foundry. In Foundry the adapter passes an
 * "overlay" of the numbers dnd5e has already worked out (AC, save bonuses, to-hit, damage formulas, DCs, uses);
 * without one, those are worked out here from the source data.
 */
import { average, describe, nothing, parse } from "./dice.mjs";
import { CONDITIONS, DEFEATED, NAMED_IN_TEXT, VALUE_CONDITIONS, known } from "./conditions.mjs";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const NUMBER_WORDS = { a: 1, an: 1, one: 1, once: 1, two: 2, twice: 2, three: 3, thrice: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const PHYSICAL = new Set(["bludgeoning", "piercing", "slashing"]);
const SKIPPED_ITEMS = new Set(["class", "subclass", "background", "race", "species", "container", "tool", "loot",
  "facility"]);

/* -------------------------------------------- */
/*  Small helpers                               */
/* -------------------------------------------- */

const num = (value, fallback = 0) => {
  if ( (value === null) || (value === undefined) || (value === "") ) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const list = value => {
  if ( !value ) return [];
  if ( Array.isArray(value) ) return value;
  if ( value instanceof Set ) return [...value];
  if ( typeof value === "string" ) return [value];
  if ( typeof value[Symbol.iterator] === "function" ) return [...value];
  return [];
};
const modOf = score => Math.floor((num(score, 10) - 10) / 2);

/** Text without its HTML, with dnd5e's enrichers turned into the words they show. */
export function plainText(html, names = {}) {
  return String(html ?? "")
    .replace(/\[\[\/item\s+([^\]]+)\]\](?:\{([^}]*)\})?/g, (m, ref, label) => {
      const key = ref.trim().replace(/^\./, "");
      return label ?? names[key] ?? ref.trim();
    })
    .replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/&(?:amp;)?Reference\[([a-zA-Z]+)[^\]]*\](?:\{([^}]*)\})?/g, (m, id, label) => label ?? id)
    .replace(/\[\[[^\]]*\]\]\{([^}]*)\}/g, "$1")
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How many creatures an area usually catches (the Dungeon Master's Guide's rule of thumb).
 * @param {string} type  cone, cube, cylinder, line, sphere, radius, emanation...
 * @param {number} size  Its size in feet (a sphere's radius, a cone or line's length, a cube's side).
 */
export function targetsInArea(type, size) {
  size = num(size);
  if ( !type || !(size > 0) ) return 1;
  switch ( String(type).toLowerCase() ) {
    case "cone": return Math.ceil(size / 10);
    case "line": case "wall": return Math.ceil(size / 30);
    case "cube": case "square": case "rect": return Math.ceil(size / 5);
    default: return Math.ceil(size / 5); // sphere, cylinder, circle, radius, emanation
  }
}

/* -------------------------------------------- */
/*  Reading an actor                            */
/* -------------------------------------------- */

/**
 * @param {object} data            The actor as plain data.
 * @param {object} [over]          What dnd5e has worked out (see the adapter).
 * @param {object} [options]
 * @param {boolean} [options.fresh]  Read it rested: full HP, every use and spell slot back, no conditions.
 * @returns {object} A profile for the simulation.
 */
export function readActor(data, over = {}, { fresh = false } = {}) {
  const sys = data.system ?? {};
  const items = (data.items ?? []).filter(i => i && (typeof i === "object"));
  const isCharacter = data.type === "character";
  const notes = [];

  // Level, proficiency, abilities
  const classLevels = {};
  for ( const item of items ) {
    if ( item.type !== "class" ) continue;
    const id = item.system?.identifier || String(item.name ?? "").toLowerCase().replace(/[^a-z]+/g, "-");
    classLevels[id] = (classLevels[id] ?? 0) + num(item.system?.levels, 1);
  }
  const level = num(over.level, Object.values(classLevels).reduce((a, b) => a + b, 0) || num(sys.details?.level));
  const cr = (sys.details?.cr === null) || (sys.details?.cr === undefined) ? null : num(sys.details.cr);
  const prof = num(over.prof, isCharacter
    ? 2 + Math.floor(Math.max(level - 1, 0) / 4)
    : 2 + Math.floor(Math.max((cr ?? 0) - 1, 0) / 4));
  const mods = {};
  const saves = {};
  for ( const a of ABILITIES ) {
    const abl = sys.abilities?.[a] ?? {};
    mods[a] = num(over.mods?.[a], modOf(abl.value));
    saves[a] = num(over.saves?.[a], mods[a] + (num(abl.proficient) * prof));
  }

  // Hit points
  const hpSource = (num(over.hp?.max) > 0) ? over.hp : (sys.attributes?.hp ?? {});
  if ( hpSource !== over.hp ) delete over.hp;
  const hpMax = Math.max(1, num(hpSource.max, num(hpSource.value, 1)) + (over.hp ? 0 : num(hpSource.tempmax)));
  const hp = fresh ? hpMax : Math.max(0, Math.min(num(hpSource.value, hpMax), hpMax));
  const temp = fresh ? 0 : Math.max(0, num(hpSource.temp));

  // Spellcasting
  const castAbility = sys.attributes?.spellcasting
    || ["int", "wis", "cha"].reduce((best, a) => (mods[a] > mods[best] ? a : best), "int");
  const spellDc = num(over.spellDc, 8 + prof + mods[castAbility]);
  const spellAtk = num(over.spellAtk, prof + mods[castAbility]);
  const slots = readSlots(sys, over, fresh);
  const spellPoints = readSpellPoints(over, fresh);
  // A spell point caster's leveled slots only mirror what it can afford; it pays from its pool instead.
  if ( spellPoints ) for ( const key of Object.keys(slots) ) if ( key !== "pact" ) delete slots[key];

  const ctx = { data, sys, over, items, isCharacter, fresh, level, classLevels, prof, mods, saves, castAbility,
    spellDc, spellAtk, slots, notes, names: {} };
  for ( const item of items ) {
    ctx.names[item._id] = item.name;
    ctx.names[item.name] = item.name;
  }

  // Traits
  const traits = sys.traits ?? {};
  const profile = {
    name: data.name ?? "?",
    img: data.img ?? null,
    type: data.type,
    kind: String(sys.details?.type?.value ?? "").toLowerCase() || null,
    isCharacter,
    level, cr, prof, mods, saves,
    int: num(sys.abilities?.int?.value, 10),
    hp, hpMax, temp,
    ac: num(over.ac, fallbackAC(ctx)),
    init: num(over.init, mods.dex),
    resist: new Set(list(over.dr ?? traits.dr?.value)),
    immune: new Set(list(over.di ?? traits.di?.value)),
    vulnerable: new Set(list(over.dv ?? traits.dv?.value)),
    resistBypass: new Set(list(over.drBypass ?? traits.dr?.bypasses)),
    immuneBypass: new Set(list(over.diBypass ?? traits.di?.bypasses)),
    condImmune: new Set(list(over.ci ?? traits.ci?.value)),
    reduction: 0,
    legRes: Math.max(0, num(sys.resources?.legres?.max) - (fresh ? 0 : num(sys.resources?.legres?.spent))),
    legAct: Math.max(0, num(sys.resources?.legact?.max)),
    magicRes: false,
    regen: null,
    features: {},
    used: new Set(),
    slots,
    spellPoints,
    spellDc, spellAtk,
    options: [],
    multiattack: null,
    conditions: [],
    deathSaves: { success: 0, failure: 0 },
    defeated: false,
    notes
  };
  if ( over.legRes !== undefined ) profile.legRes = fresh ? num(over.legResMax, over.legRes) : num(over.legRes);
  if ( over.legAct !== undefined ) profile.legAct = num(over.legAct);
  if ( !fresh ) {
    profile.deathSaves.success = num(sys.attributes?.death?.success);
    profile.deathSaves.failure = num(sys.attributes?.death?.failure);
  }
  // "Nonmagical" physical damage in the custom text (older statblocks)
  for ( const [key, bypass] of [["dr", profile.resistBypass], ["di", profile.immuneBypass]] ) {
    const custom = String(traits[key]?.custom ?? "");
    if ( /nonmagical|non-magical|not magical/i.test(custom) ) {
      const target = key === "dr" ? profile.resist : profile.immune;
      for ( const t of PHYSICAL ) target.add(t);
      bypass.add("mgc");
    }
  }

  ctx.resolve = makeResolver(ctx);
  readFlags(profile, over.flags ?? data.flags ?? {});
  readFeatures(profile, ctx);
  readManual(profile, over.manual ?? data.flags?.["primal-cr"]?.manual);
  readOptions(profile, ctx);
  for ( const option of profile.options ) if ( option.itemId ) profile.used.add(option.itemId);
  readMultiattack(profile, ctx);
  readLegendaryReferences(profile, ctx);
  if ( !fresh ) readConditions(profile, ctx);

  profile.options.forEach((o, i) => { o.index = i; });
  for ( const option of profile.options ) option.avg = optionAverage(option);
  profile.dpr = roundDamage(profile);
  profile.summary = summarize(profile);
  if ( !profile.options.some(o => (o.kind !== "heal") && (o.act === "action")) ) {
    notes.push("No attack or damaging action was found on this sheet, so it only soaks up damage.");
  }
  return profile;
}

/* -------------------------------------------- */

/** A Primal Spell Points pool (from the adapter): {left, max, maxLevel, highUsed, limit, costs}, or null. */
function readSpellPoints(over, fresh) {
  const sp = over.spellPoints;
  if ( !sp || !(num(sp.maxLevel) > 0) ) return null;
  const max = Math.max(0, num(sp.max));
  return {
    left: fresh ? max : Math.max(0, Math.min(num(sp.value), max)),
    max, maxLevel: num(sp.maxLevel), limit: sp.limit !== false,
    highUsed: fresh ? [] : (sp.highUsed ?? []).map(Number),
    costs: { ...(sp.costs ?? {}) }
  };
}

function readSlots(sys, over, fresh) {
  const slots = {};
  const source = over.slots ?? sys.spells ?? {};
  for ( const [key, slot] of Object.entries(source) ) {
    if ( !slot ) continue;
    const max = num(slot.max, num(slot.override, num(slot.value)));
    const value = fresh ? max : num(slot.value);
    if ( key === "pact" ) {
      if ( max > 0 || value > 0 ) slots.pact = { level: num(slot.level, 1), left: value };
      continue;
    }
    const m = /^spell(\d)$/.exec(key);
    if ( m && (value > 0) ) slots[m[1]] = value;
  }
  return slots;
}

function fallbackAC(ctx) {
  const ac = ctx.sys.attributes?.ac ?? {};
  if ( Number.isFinite(Number(ac.value)) && (ac.value !== null) ) return Number(ac.value);
  if ( (ac.flat !== null) && (ac.flat !== undefined) && ["flat", "natural"].includes(ac.calc) ) return num(ac.flat, 10);
  let base = 10;
  let dexCap = Infinity;
  let shield = 0;
  for ( const item of ctx.items ) {
    if ( (item.type !== "equipment") || (item.system?.equipped === false) ) continue;
    const kind = item.system?.type?.value;
    const value = num(item.system?.armor?.value) + num(item.system?.armor?.magicalBonus);
    if ( kind === "shield" ) shield = Math.max(shield, value || 2);
    else if ( ["light", "medium", "heavy"].includes(kind) && value ) {
      base = value;
      dexCap = kind === "heavy" ? 0 : (kind === "medium" ? 2 : Infinity);
      const cap = item.system?.armor?.dex;
      if ( (cap !== null) && (cap !== undefined) && (cap !== "") ) dexCap = num(cap, dexCap);
    }
  }
  if ( (ac.flat !== null) && (ac.flat !== undefined) && (ac.calc !== "default") ) return num(ac.flat, 10);
  return base + Math.min(ctx.mods.dex, dexCap) + shield;
}

/** Midi-QOL's flags, where they change the odds. */
function readFlags(profile, flags) {
  const midi = flags?.["midi-qol"];
  if ( !midi ) return;
  const on = value => (value === true) || (value === 1) || (value === "1") || (value === "true");
  const dr = Number(midi.DR?.all);
  if ( Number.isFinite(dr) && (dr > 0) ) profile.reduction = dr;
  if ( on(midi.advantage?.all) || on(midi.advantage?.attack?.all) ) profile.features.attackAdv = true;
  if ( on(midi.disadvantage?.all) || on(midi.disadvantage?.attack?.all) ) profile.features.attackDis = true;
  if ( on(midi.grants?.advantage?.attack?.all) ) profile.features.grantAdv = true;
  if ( on(midi.grants?.disadvantage?.attack?.all) ) profile.features.grantDis = true;
  if ( on(midi.magicResistance?.all) ) profile.magicRes = true;
}

/* -------------------------------------------- */
/*  Features that change the fight              */
/* -------------------------------------------- */

function readFeatures(profile, ctx) {
  const f = profile.features;
  for ( const item of ctx.items ) {
    if ( item.type !== "feat" ) continue;
    const name = String(item.name ?? "").trim();
    // Homebrew classes often number their features: "07. Evasion", "6.Solar Flare"
    const lower = name.toLowerCase().replace(/^\d+\.\s*/, "");
    const text = () => plainText(item.system?.description?.value, ctx.names);
    if ( /^(magic resistance|pack tactics|evasion|uncanny dodge|undead fortitude|relentless endurance|extra attack|two extra attacks|three extra attacks|sneak attack|rage|regeneration|parry|nova|potent spellcasting)$/.test(lower)
      || /^legendary resistance/.test(lower) ) profile.used.add(item._id);
    if ( /^magic resistance$/.test(lower) ) profile.magicRes = true;
    else if ( /^pack tactics$/.test(lower) ) f.packTactics = true;
    else if ( /^evasion$/.test(lower) ) f.evasion = true;
    else if ( /^uncanny dodge$/.test(lower) ) f.uncannyDodge = true;
    else if ( /^undead fortitude$/.test(lower) ) f.undeadFortitude = true;
    else if ( /^relentless endurance$/.test(lower) ) {
      const uses = itemUses(item, ctx);
      if ( !uses || (uses.left > 0) ) f.relentless = true;
    }
    else if ( /^(extra attack|two extra attacks|three extra attacks)$/.test(lower) ) {
      const n = lower.startsWith("three") ? 3 : (lower.startsWith("two") ? 2 : 1);
      f.extraAttacks = Math.max(f.extraAttacks ?? 0, n);
    }
    else if ( /^sneak attack$/.test(lower) ) {
      const rogue = ctx.classLevels.rogue ?? ctx.level;
      const dice = num(ctx.over.sneakDice, Math.ceil(Math.max(rogue, 1) / 2));
      f.sneak = { dice: [[dice, 6]], flat: 0 };
    }
    else if ( /^rage$/.test(lower) ) {
      const uses = itemUses(item, ctx);
      if ( !uses || (uses.left > 0) ) {
        const barbarian = ctx.classLevels.barbarian ?? ctx.level;
        f.rage = num(ctx.over.rageDamage, barbarian >= 16 ? 4 : (barbarian >= 9 ? 3 : 2));
      }
    }
    else if ( /^regeneration$/.test(lower) ) {
      const t = text();
      const m = /regains? (\d+) hit points?/i.exec(t);
      const healing = Object.values(item.system?.activities ?? {}).find(a => a?.type === "heal")?.healing;
      const amount = m ? Number(m[1]) : Math.round(average(parse(ctx.resolve(partFormula(healing), item))));
      if ( amount > 0 ) {
        const blocked = new Set();
        const b = /takes? ([a-z]+)(?: or ([a-z]+))? damage/i.exec(t);
        if ( b ) for ( const type of [b[1], b[2]] ) if ( type ) blocked.add(type.toLowerCase());
        profile.regen = { amount, blocked };
      }
    }
    else if ( /^nova$/.test(lower) ) readNova(profile, ctx);
    else if ( /^potent spellcasting$/.test(lower) ) {
      const m = /your (strength|dexterity|constitution|intelligence|wisdom|charisma) modifier/i.exec(text());
      const mod = ctx.mods[(m?.[1] ?? "wisdom").slice(0, 3).toLowerCase()] ?? 0;
      if ( mod > 0 ) f.cantripBonus = Math.max(f.cantripBonus ?? 0, mod);
    }
    else if ( /^parry$/.test(lower) ) {
      const m = /adds? (\d+) to (?:its|their|his|her) ac/i.exec(text());
      if ( m ) f.parry = Number(m[1]);
    }
    else if ( /^legendary resistance/.test(lower) && !profile.legRes && !ctx.sys.resources?.legres ) {
      const m = /\((\d+)\s*\/\s*day/i.exec(name);
      if ( m ) profile.legRes = Number(m[1]);
    }
  }
  for ( const item of ctx.items ) {
    if ( item.type !== "feat" ) continue;
    const t = plainText(item.system?.description?.value, ctx.names);
    // "Rapid Strike. You can make a melee attack as a Bonus Action."
    if ( /make (?:a|one) melee (?:weapon )?attack as a bonus action/i.test(t) ) {
      f.bonusAttack = "melee";
      profile.used.add(item._id);
    }
    else if ( /unarmed strike as a bonus action/i.test(t) ) {
      f.bonusAttack ??= "unarmed";
      profile.used.add(item._id);
    }
    const extra = onHitFrom(item, t, ctx);
    if ( extra ) profile.used.add(item._id);
    if ( extra && !(f.onHit ?? []).some(e => e.name === extra.name) ) (f.onHit ??= []).push(extra);
  }
  if ( f.extraAttacks && !ctx.isCharacter ) delete f.extraAttacks;
  // The Shield spell, for anyone who can cast it
  const shield = ctx.items.find(i => (i.type === "spell") && /^shield$/i.test(String(i.name ?? "").trim())
    && spellUsable(i, ctx));
  if ( shield ) f.shield = true;
}

/**
 * Extra damage once a turn when an attack hits (Divine Strike, Primal Strike, Finisher, Fury of the Small).
 * Sneak Attack and Nova have their own readers.
 */
function onHitFrom(item, text, ctx) {
  const name = String(item.name ?? "").trim().replace(/^\d+\.\s*/, "");
  if ( /^(sneak attack|nova)$/i.test(name) ) return null;
  const once = /once (?:on each of your turns|per turn|each turn|on your turn)[^.]*when you (?:hit|deal damage|damage)/i.test(text)
    || (/when you damage a creature with an attack/i.test(text) && /no more than once per turn/i.test(text));
  if ( !once || !/extra|additional/i.test(text) ) return null;
  const activity = Object.values(item.system?.activities ?? {}).find(a => (a?.type === "damage") && list(a.damage?.parts).length);
  let dmg = null;
  let type = null;
  if ( activity ) {
    const part = activity.damage.parts[0];
    dmg = parse(ctx.resolve(partFormula(part), item));
    type = list(part.types)[0] ?? null;
  }
  if ( !dmg || !(average(dmg) > 0) ) {
    const m = /extra (\d+d\d+(?:\s*\+\s*\d+)?)/i.exec(text);
    if ( m ) dmg = parse(m[1]);
    else if ( /extra damage equals your proficiency bonus/i.test(text) ) dmg = { dice: [], flat: ctx.prof };
  }
  if ( !dmg || !(average(dmg) > 0) ) return null;
  const uses = itemUses(item, ctx);
  if ( uses && (uses.left <= 0) ) return null;
  return {
    name, dmg: { ...dmg, type },
    weapon: /weapon/i.test(text) && !/attack or a spell/i.test(text),
    bloodied: /bloodied/i.test(text),
    uses: uses ? uses.left : null
  };
}

/**
 * Nova (the Augmented class): spend Willpower to burn brighter each turn. The wielder takes escalating damage
 * that can't be reduced, and once a turn a hit deals escalating bonus dice. The two ladders are read from
 * the "Nova Recoil" and "Nova Burn" items when the sheet has them.
 */
function readNova(profile, ctx) {
  const find = re => ctx.items.find(i => re.test(String(i.name ?? "").trim().replace(/^\d+\.\s*/, "")));
  const ladder = item => Object.values(item?.system?.activities ?? {})
    .filter(a => a?.type === "damage")
    .map(a => {
      const part = list(a.damage?.parts)[0];
      const amount = parse(ctx.resolve(partFormula(part), item));
      return { ...amount, type: list(part?.types)[0] ?? null };
    })
    .filter(a => average(a) > 0)
    .sort((a, b) => average(a) - average(b));
  let recoil = ladder(find(/^nova recoil$/i));
  let burn = ladder(find(/^nova burn$/i));
  if ( !recoil.length ) recoil = Array.from({ length: 10 }, (_, k) => ({ dice: [[k + 1, 6]], flat: 0, type: null }));
  if ( !burn.length ) burn = Array.from({ length: 5 }, (_, k) => ({ dice: [[2 * (k + 1), 6]], flat: 0, type: null }));
  const pool = find(/^willpower$/i);
  const uses = pool ? itemUses(pool, ctx) : null;
  const willpower = uses ? uses.left : (pool ? 0 : 1);
  if ( willpower <= 0 ) return;
  for ( const re of [/^nova recoil$/i, /^nova burn$/i, /^willpower$/i] ) {
    const item = find(re);
    if ( item ) profile.used.add(item._id);
  }
  for ( const item of ctx.items ) if ( /solar flare$/i.test(String(item.name ?? "").trim()) ) profile.used.add(item._id);
  const nova = { recoil, burn, willpower, flare: null };
  const flareItem = ctx.items.filter(i => /solar flare$/i.test(String(i.name ?? "").trim()))
    .sort((a, b) => num(b.system?.uses?.max) - num(a.system?.uses?.max))[0];
  if ( flareItem ) {
    const flareUses = itemUses(flareItem, ctx);
    if ( !flareUses || (flareUses.left > 0) ) {
      const t = plainText(flareItem.system?.description?.value, ctx.names);
      const m = /your (strength|dexterity|constitution|intelligence|wisdom|charisma) modifier \+ your ([a-z' -]+?) level/i.exec(t);
      const mod = ctx.mods[(m?.[1] ?? "intelligence").slice(0, 3).toLowerCase()] ?? 0;
      const cls = m ? ctx.items.find(i => (i.type === "class") && (String(i.name).toLowerCase() === m[2].toLowerCase())) : null;
      const amount = Math.max(1, mod + (cls ? num(cls.system?.levels, ctx.level) : ctx.level));
      nova.flare = { dice: [], flat: amount, type: "radiant" };
    }
  }
  profile.features.nova = nova;
}

/** What the GM has told the module by hand about a homebrew ability (the Scan window). */
function readManual(profile, manual) {
  if ( !manual || (typeof manual !== "object") ) return;
  const onHit = parse(String(manual.onHit ?? ""));
  if ( average(onHit) > 0 ) {
    (profile.features.onHit ??= []).push({ name: "Set by hand", dmg: { ...onHit, type: null }, weapon: false,
      bloodied: false, uses: null });
  }
  const everyHit = parse(String(manual.everyHit ?? ""));
  if ( average(everyHit) > 0 ) profile.features.everyHit = { ...everyHit, type: null };
}

/**
 * What on a sheet looks like it matters in a fight but wasn't used. For the GM's Scan window.
 * @param {object} data     The actor's plain data.
 * @param {object} profile  What readActor made of it.
 * @returns {{unread: {id: string, name: string, type: string, reason: string}[], unprepared: number}}
 */
export function scanActor(data, profile) {
  const unread = [];
  let unprepared = 0;
  const isCharacter = data.type === "character";
  const ctx = { isCharacter };
  const seen = new Set();
  for ( const item of list(data.items) ) {
    if ( !item || (typeof item !== "object") || profile.used.has(item._id) ) continue;
    if ( !["feat", "spell", "weapon", "equipment", "consumable"].includes(item.type) ) continue;
    const s = item.system ?? {};
    const activities = Object.values(s.activities ?? {}).filter(a => a && typeof a === "object");
    const types = activities.map(a => a.type);
    const text = plainText(s.description?.value);
    const fighting = types.some(t => ["attack", "save", "damage", "heal", "summon"].includes(t))
      || /(?:extra|additional|bonus)[^.]{0,40}damage|deals?[^.]{0,40}damage|damage (?:roll|die|dice)|as a bonus action|use your reaction|take a reaction|\d+d\d+/i.test(text);
    if ( !fighting ) continue;
    if ( (item.type === "equipment" || item.type === "consumable") && !types.length ) continue;
    if ( (item.type === "spell") && !spellUsable(item, ctx) ) {
      unprepared++;
      continue;
    }
    let reason = "other";
    if ( isCharacter && ["weapon", "equipment"].includes(item.type) && (s.equipped === false) ) reason = "unequipped";
    else if ( types.includes("summon") || /\bcompanion\b/i.test(item.name ?? "") ) reason = "summon";
    else if ( activities.length && activities.every(a => a.activation?.type === "reaction") ) reason = "reaction";
    else if ( /when (?:you are|you're|a creature|an attack|you or|you take|you fall)[^.]*\breaction\b|use your reaction/i.test(text) ) reason = "reaction";
    else if ( item.type === "spell" ) reason = "utility";
    const key = `${item.name}|${reason}`;
    if ( seen.has(key) ) continue;
    seen.add(key);
    unread.push({ id: item._id, name: item.name ?? "?", type: item.type, reason });
  }
  return { unread, unprepared };
}

function spellUsable(item, ctx) {
  const s = item.system ?? {};
  if ( !num(s.level) ) return true;
  const method = s.method ?? s.preparation?.mode ?? "spell";
  const prepared = s.prepared ?? s.preparation?.prepared;
  if ( ctx.isCharacter && (method === "spell" || method === "prepared") && ((prepared === 0) || (prepared === false)) ) {
    return false;
  }
  return true;
}

/* -------------------------------------------- */
/*  Uses                                        */
/* -------------------------------------------- */

function usesFrom(uses, prepared, ctx, quantity = 1) {
  if ( !uses && !prepared ) return null;
  const maxRaw = prepared?.max ?? uses?.max;
  const max = typeof maxRaw === "number" ? maxRaw : num(average(parse(ctx.resolve(String(maxRaw ?? "")))), 0);
  if ( !(max > 0) ) return null;
  const spent = num(uses?.spent);
  const left = ctx.fresh ? max : Math.max(0, num(prepared?.value, max - spent));
  const recharge = list(uses?.recovery).find(r => r?.period === "recharge");
  return {
    left: left + (Math.max(0, quantity - 1) * max),
    max: max * Math.max(1, quantity),
    recharge: recharge ? Math.min(6, Math.max(2, num(recharge.formula, 6))) : null
  };
}

function itemUses(item, ctx) {
  const quantity = item.type === "consumable" ? Math.max(1, num(item.system?.quantity, 1)) : 1;
  return usesFrom(item.system?.uses, ctx.over.items?.[item._id]?.uses, ctx, quantity);
}

/* -------------------------------------------- */
/*  Options: what a creature can do on a turn   */
/* -------------------------------------------- */

function readOptions(profile, ctx) {
  const linked = new Map(); // spell item id -> the cast activities that use it
  const castSources = new Set();
  for ( const item of ctx.items ) {
    for ( const activity of Object.values(item.system?.activities ?? {}) ) {
      if ( activity?.type !== "cast" ) continue;
      const spell = findCastSpell(item, activity, ctx, linked);
      if ( !spell ) continue;
      if ( activity.spell?.uuid ) castSources.add(activity.spell.uuid);
      if ( !linked.has(spell._id) ) linked.set(spell._id, []);
      linked.get(spell._id).push({ item, activity });
    }
  }

  for ( const item of ctx.items ) {
    if ( SKIPPED_ITEMS.has(item.type) ) continue;
    if ( /^multiattack$/i.test(String(item.name ?? "").trim()) ) continue;
    const s = item.system ?? {};
    if ( ctx.isCharacter && ["weapon", "equipment"].includes(item.type) && (s.equipped === false) ) continue;
    if ( (item.type === "spell") && !spellUsable(item, ctx) ) continue;
    if ( (item.type === "consumable") && !Object.values(s.activities ?? {}).some(a => a?.type === "heal") ) continue;

    const casts = linked.get(item._id);
    if ( !casts && (item.type === "spell") && castSources.has(item._stats?.compendiumSource ?? item.flags?.core?.sourceId) ) {
      continue; // a second copy of a spell some Cast activity already covers
    }
    if ( casts ) {
      for ( const cast of casts ) {
        addItemOptions(profile, ctx, item, {
          act: cast.activity.activation?.type,
          cost: num(cast.activity.activation?.value, 1),
          uses: activityUses(cast.item, cast.activity, ctx),
          castLevel: num(cast.activity.spell?.level, num(s.level)),
          noSlot: true,
          via: cast.item
        });
      }
      continue;
    }
    addItemOptions(profile, ctx, item, {});
  }
}

function findCastSpell(item, activity, ctx, linked) {
  const prepared = ctx.over.items?.[item._id]?.activities?.[activity._id]?.spellId;
  if ( prepared ) return ctx.items.find(i => i._id === prepared) ?? null;
  const uuid = activity.spell?.uuid;
  if ( !uuid ) return null;
  const relative = `.Item.${item._id}.Activity.${activity._id}`;
  const matches = ctx.items.filter(i => (i.type === "spell") && (
    (i.flags?.dnd5e?.cachedFor === relative)
    || (i._stats?.compendiumSource === uuid)
    || (i.flags?.core?.sourceId === uuid)
    || (i.flags?.dnd5e?.sourceId === uuid)));
  // Each cast has its own copy of the spell where there are several: take one no other cast has taken.
  return matches.find(i => i.flags?.dnd5e?.cachedFor === relative) ?? matches.find(i => !linked?.has(i._id))
    ?? matches[0] ?? null;
}

function activityUses(item, activity, ctx) {
  const prepared = ctx.over.items?.[item._id]?.activities?.[activity._id]?.uses;
  const own = usesFrom(activity.uses, prepared, ctx);
  if ( own ) return own;
  const targets = list(activity.consumption?.targets);
  if ( targets.some(t => t?.type === "itemUses" && !t.target) || (item.type === "consumable") ) return itemUses(item, ctx);
  // An item with uses and one way to use it: the uses are that way's.
  if ( !targets.length ) {
    const shared = itemUses(item, ctx);
    if ( shared?.recharge ) return shared;
  }
  return null;
}

/**
 * Add the options one item gives.
 * @param {object} forced  Set by a Cast activity: the action type, uses and level to cast its spell with.
 */
function addItemOptions(profile, ctx, item, forced) {
  const s = item.system ?? {};
  const activities = Object.values(s.activities ?? {}).filter(a => a && typeof a === "object")
    .sort((a, b) => num(a.sort) - num(b.sort));
  if ( !activities.length ) return;
  const isSpell = item.type === "spell";
  const spellLevel = num(s.level);
  const text = plainText(s.description?.value, ctx.names);
  const attacks = [];
  const riders = [];
  const made = [];
  const extras = [];

  for ( const activity of activities ) {
    if ( /\b(dis)?advantage\b/i.test(activity.name ?? "") && (activities.length > 1) ) continue; // the same attack again
    const inherits = isSpell && (activity.activation?.override === false) && s.activation?.type;
    const act = normalizeAct(forced.act ?? (inherits ? s.activation.type : activity.activation?.type));
    const prepared = ctx.over.items?.[item._id]?.activities?.[activity._id] ?? {};
    const common = {
      name: optionName(item, activity, activities, forced),
      itemId: item._id,
      activityId: activity._id ?? null,
      act,
      cost: forced.cost ?? Math.max(1, num(activity.activation?.value, 1)),
      spell: isSpell,
      spellLevel: isSpell ? spellLevel : 0,
      conc: !!(activity.duration?.concentration || list(s.properties).includes("concentration")),
      uses: forced.uses ?? activityUses(item, activity, ctx),
      slot: null,
      targets: 1,
      count: 1,
      dmg: [],
      cond: null
    };
    if ( isSpell && spellLevel && !forced.noSlot ) {
      const method = s.method ?? s.preparation?.mode ?? "spell";
      if ( method === "pact" ) common.slot = "pact";
      else if ( !["innate", "atwill"].includes(method) || !common.uses ) {
        if ( !["innate", "atwill"].includes(method) ) common.slot = spellLevel;
      }
    }
    const castLevel = forced.castLevel ?? spellLevel;

    if ( activity.type === "attack" ) {
      const option = { ...common, kind: "attack" };
      const info = attackInfo(item, activity, prepared, ctx);
      Object.assign(option, info);
      option.dmg = damageParts(item, activity, prepared, ctx, { weapon: info.weapon, ability: info.ability, castLevel });
      option.count = spellCount(item, castLevel, ctx);
      if ( list(activity.effects).length ) {
        const cond = conditionFrom(item, activity, "", {});
        if ( cond ) {
          const timing = durationFromText(text);
          option.rider = { dc: null, ability: null, half: false, dmg: [],
            cond: { ...cond, ...timing, rounds: timing.rounds ?? cond.rounds } };
        }
      }
      attacks.push(option);
      made.push({ option, activity });
    }
    else if ( activity.type === "save" ) {
      const option = { ...common, kind: "save" };
      option.ability = list(activity.save?.ability)[0] ?? "dex";
      option.dc = saveDC(item, activity, prepared, ctx);
      option.half = activity.damage?.onSave === "half";
      option.dmg = damageParts(item, activity, prepared, ctx, { castLevel });
      option.targets = areaTargets(activity, text);
      option.cond = conditionFrom(item, activity, text, { save: true });
      if ( !["action", "bonus", "legendary", "reaction"].includes(act) && !forced.act ) riders.push(option);
      else made.push({ option, activity });
    }
    else if ( activity.type === "damage" ) {
      const option = { ...common, kind: "auto" };
      option.dmg = damageParts(item, activity, prepared, ctx, { castLevel });
      option.count = spellCount(item, castLevel, ctx);
      option.targets = areaTargets(activity, "");
      // Damage with a range of Self and no area isn't aimed at an enemy: it's what a teleport costs its caster,
      // or dice kept on the sheet for a feature that adds to other attacks.
      const ownRange = isSpell && !activity.range?.override ? s.range?.units : activity.range?.units;
      const aimed = activity.target?.template?.type || ["creature", "enemy", "any"].includes(activity.target?.affects?.type);
      const aimless = !aimed && ((ownRange === "self") || /\byou (?:and [^.]{0,60})?(?:each )?take (?:\d+d\d+ )?(?:[a-z]+ )?damage/i.test(text));
      // "While the sword is ablaze, it deals an extra 4d6 damage to any target it hits."
      if ( aimless && (item.type === "weapon") && /extra[^.]*damage to any (?:target|creature) it hits/i.test(text) ) {
        extras.push(...option.dmg.filter(d => d.type));
      }
      else if ( !aimless && option.dmg.some(d => d.type) ) made.push({ option, activity });
    }
    else if ( activity.type === "heal" ) {
      const option = { ...common, kind: "heal" };
      option.heal = healAmount(item, activity, prepared, ctx, castLevel);
      // An activity's own range only counts when it overrides the item's (it reads "self" otherwise).
      const range = (activity.range?.override || !s.range?.units) && (item.type !== "spell" || activity.range?.override)
        ? activity.range?.units : s.range?.units;
      const self = (activity.target?.affects?.type === "self") || (range === "self") || (s.range?.units === "self")
        || (item.type === "consumable") || /^second wind$/i.test(item.name ?? "");
      option.self = self;
      if ( average(option.heal) > 0 ) made.push({ option, activity });
    }
  }

  for ( const attack of attacks ) attack.dmg.push(...extras);
  const reactive = activities.some(a => a.activation?.type === "reaction");
  // A save with no action of its own, on an item with an attack, rides on the attack (a Ghoul's claws).
  if ( attacks.length ) {
    for ( const rider of riders ) {
      for ( const attack of attacks ) {
        attack.rider = { dc: rider.dc, ability: rider.ability, half: rider.half, dmg: rider.dmg, cond: rider.cond };
      }
    }
    // Older statblocks say it in words: "must succeed on a DC 13 Constitution saving throw or be poisoned".
    for ( const attack of attacks ) {
      if ( attack.rider ) continue;
      const rider = riderFromText(text, item, ctx);
      if ( rider ) attack.rider = rider;
    }
  } else {
    // ...unless it follows from a reaction (a monk's Deflect Attacks), which isn't something to do on a turn.
    for ( const rider of riders ) {
      if ( !rider.act && !reactive ) made.push({ option: { ...rider, act: "action" }, activity: null });
    }
  }

  for ( const { option } of made ) {
    if ( !["action", "bonus", "legendary"].includes(option.act) ) continue;
    if ( (option.kind !== "heal") && !option.dmg.length && !option.cond && !option.rider ) continue;
    option.linger = !!(option.conc && option.spell && (optionAverage(option) > 0)
      && lastsRounds(item) && (option.kind !== "heal"));
    if ( option.kind === "attack" || option.kind === "auto" ) option.magical = option.spell || isMagical(item);
    if ( /\bundead\b/i.test(option.name) ) option.only = "undead";
    if ( option.spell && !option.spellLevel && profile.features.cantripBonus && option.dmg.length ) {
      option.dmg = option.dmg.map((d, k) => (k ? d : { ...d, flat: (d.flat ?? 0) + profile.features.cantripBonus }));
    }
    profile.options.push(option);
  }
}

function normalizeAct(type) {
  if ( type === "action" || type === "bonus" || type === "legendary" || type === "reaction" ) return type;
  if ( type === "mythic" ) return "legendary";
  if ( type === "lair" ) return "lair";
  return type ? "other" : "";
}

function optionName(item, activity, activities, forced) {
  const base = item.name ?? "?";
  const own = String(activity.name ?? "").trim();
  if ( own && (activities.length > 1) && !/^(use|attack|save|damage|heal|cast)$/i.test(own) ) return `${base}: ${own}`;
  if ( forced.via && (forced.act === "legendary") ) return `${forced.via.name} (${base})`;
  return base;
}

function isMagical(item) {
  const s = item.system ?? {};
  return list(s.properties).includes("mgc") || (num(s.magicalBonus) > 0);
}

function lastsRounds(item) {
  const d = item.system?.duration ?? {};
  return ["minute", "hour", "day", "round"].includes(d.units) && !((d.units === "round") && (num(d.value, 1) <= 1));
}

/** Spells that are several attacks or darts in one casting. */
function spellCount(item, castLevel, ctx) {
  if ( item.type !== "spell" ) return 1;
  const name = String(item.name ?? "").trim().toLowerCase();
  if ( name === "scorching ray" ) return 3 + Math.max(0, castLevel - 2);
  if ( name === "magic missile" ) return 3 + Math.max(0, castLevel - 1);
  if ( name === "eldritch blast" ) {
    const level = ctx.isCharacter ? ctx.level : Math.max(ctx.level, num(ctx.sys.details?.cr));
    return 1 + (level >= 5) + (level >= 11) + (level >= 17);
  }
  return 1;
}

/* -------------------------------------------- */

function makeResolver(ctx) {
  if ( typeof ctx.over.resolve === "function" ) return (formula, item) => ctx.over.resolve(formula, item?._id);
  return (formula, item, mod) => String(formula ?? "")
    .replace(/@mod\b/g, String(mod ?? 0))
    .replace(/@prof\b/g, String(ctx.prof))
    .replace(/@abilities\.([a-z]{3})\.mod\b/g, (m, a) => String(ctx.mods[a] ?? 0))
    .replace(/@abilities\.([a-z]{3})\.value\b/g, (m, a) => String(num(ctx.sys.abilities?.[a]?.value, 10)))
    .replace(/@classes\.([\w-]+)\.levels\b/g, (m, c) => String(ctx.classLevels[c] ?? 0))
    .replace(/@details\.level\b/g, String(ctx.level))
    .replace(/@details\.cr\b/g, String(num(ctx.sys.details?.cr)))
    .replace(/@item\.level\b/g, String(num(item?.system?.level)))
    .replace(/@attributes\.spell\.dc\b/g, String(ctx.spellDc))
    .replace(/@attributes\.spell\.mod\b/g, String(ctx.mods[ctx.castAbility] ?? 0))
    .replace(/@[\w.-]+/g, "0");
}

function attackAbility(item, activity, ctx) {
  const chosen = activity.attack?.ability;
  if ( ABILITIES.includes(chosen) ) return chosen;
  if ( (item.type === "spell") || (chosen === "spellcasting") || (activity.attack?.type?.classification === "spell") ) {
    return ctx.castAbility;
  }
  const s = item.system ?? {};
  if ( ABILITIES.includes(s.ability) ) return s.ability;
  const props = list(s.properties);
  const ranged = /R$/.test(s.type?.value ?? "") || (activity.attack?.type?.value === "ranged");
  if ( props.includes("fin") ) return ctx.mods.dex > ctx.mods.str ? "dex" : "str";
  if ( ranged && !props.includes("thr") ) return "dex";
  return "str";
}

function attackInfo(item, activity, prepared, ctx) {
  const s = item.system ?? {};
  const ability = attackAbility(item, activity, ctx);
  const isSpellAttack = (item.type === "spell") || (activity.attack?.type?.classification === "spell");
  const weapon = (item.type === "weapon") && !isSpellAttack;
  let toHit;
  if ( prepared.toHit !== undefined ) toHit = average(parse(String(prepared.toHit)));
  else {
    const bonus = average(parse(ctx.resolve(activity.attack?.bonus ?? "", item, ctx.mods[ability])));
    if ( activity.attack?.flat ) toHit = bonus;
    else {
      const proficient = ctx.isCharacter ? ((s.proficient === 0) || (s.proficient === false) ? 0 : 1) : 1;
      toHit = ctx.mods[ability] + (proficient * ctx.prof) + bonus + num(s.magicalBonus);
    }
  }
  const kind = activity.attack?.type?.value || (/R$/.test(s.type?.value ?? "") ? "ranged" : "melee");
  return {
    toHit: Math.round(toHit),
    melee: kind !== "ranged",
    weapon,
    ability,
    critAt: Math.min(20, Math.max(2, num(activity.attack?.critical?.threshold, num(s.critical?.threshold, 20))))
  };
}

function partFormula(part) {
  if ( !part ) return "";
  if ( part.custom?.enabled ) return String(part.custom.formula ?? "");
  const dice = (num(part.number) > 0) && (num(part.denomination) > 0) ? `${part.number}d${part.denomination}` : "";
  const bonus = String(part.bonus ?? "").trim();
  return [dice, bonus].filter(Boolean).join(" + ");
}

/** Extra dice for a spell cast above its own level, or a cantrip from a high-level caster. */
function scaledPart(part, item, castLevel, ctx) {
  if ( item.type !== "spell" ) return part;
  const base = num(item.system?.level);
  const mode = part.scaling?.mode;
  let steps = 0;
  if ( !base ) {
    if ( part.custom?.enabled ) return part;
    if ( /^eldritch blast$/i.test(String(item.name ?? "").trim()) ) return part; // more beams instead
    const level = ctx.isCharacter ? ctx.level : Math.max(ctx.level, num(ctx.sys.details?.cr));
    steps = Math.floor((level + 1) / 6);
    if ( !steps || !(num(part.number) > 0) ) return part;
    return { ...part, number: num(part.number) + (steps * num(part.scaling?.number, 1)) };
  }
  if ( !mode || (castLevel <= base) ) return part;
  steps = castLevel - base;
  if ( mode === "half" ) steps = Math.floor(steps / 2);
  if ( !steps ) return part;
  if ( part.scaling?.formula ) {
    return { ...part, custom: { enabled: true, formula: `${partFormula(part)} + ${steps} * (${part.scaling.formula})` } };
  }
  return { ...part, number: num(part.number) + (steps * num(part.scaling?.number, 1)) };
}

function damageParts(item, activity, prepared, ctx, { weapon = false, ability = null, castLevel = 0 } = {}) {
  const base = num(item.system?.level);
  const upcast = (item.type === "spell") && base && (castLevel > base);
  const cantrip = (item.type === "spell") && !base; // scaled here by the caster's level
  if ( Array.isArray(prepared.damages) && !upcast && !cantrip ) {
    return prepared.damages.map(d => ({ ...parse(d.formula), type: d.type ?? null }))
      .filter(d => d.dice.length || d.flat);
  }
  const parts = [];
  const mod = ability ? ctx.mods[ability] : 0;
  const basePart = item.system?.damage?.base;
  if ( (activity.type === "attack") && (activity.damage?.includeBase !== false) && partFormula(basePart) ) {
    const amount = parse(ctx.resolve(partFormula(basePart), item, mod));
    if ( weapon && !/@mod\b/.test(partFormula(basePart)) ) amount.flat += mod;
    amount.flat += num(item.system?.magicalBonus);
    parts.push({ ...amount, type: list(basePart.types)[0] ?? null });
  }
  for ( const raw of list(activity.damage?.parts) ) {
    const part = scaledPart(raw, item, castLevel, ctx);
    const amount = parse(ctx.resolve(partFormula(part), item, mod));
    if ( amount.dice.length || amount.flat ) parts.push({ ...amount, type: list(part.types)[0] ?? null });
  }
  return parts;
}

function healAmount(item, activity, prepared, ctx, castLevel) {
  const part = scaledPart(activity.healing ?? {}, item, castLevel, ctx);
  const own = parse(ctx.resolve(partFormula(part), item, ctx.mods[ctx.castAbility]));
  if ( prepared.heal === undefined ) return own;
  // dnd5e's own figure, unless it lost the caster's modifier along the way
  const theirs = parse(String(prepared.heal));
  return average(theirs) >= average(own) ? theirs : own;
}

function saveDC(item, activity, prepared, ctx) {
  if ( prepared.dc !== undefined ) return num(prepared.dc, 10);
  const dc = activity.save?.dc ?? {};
  const calc = dc.calculation;
  const flat = average(parse(ctx.resolve(dc.formula ?? "", item)));
  if ( !calc ) return flat > 0 ? Math.round(flat) : 8 + ctx.prof;
  if ( (calc === "spellcasting") || (calc === "initial") ) return ctx.spellDc;
  if ( ABILITIES.includes(calc) ) return 8 + ctx.prof + ctx.mods[calc];
  return flat > 0 ? Math.round(flat) : ctx.spellDc;
}

function areaTargets(activity, text) {
  const template = activity.target?.template ?? {};
  if ( template.type && (num(template.size) > 0) ) return targetsInArea(template.type, template.size);
  const count = num(activity.target?.affects?.count);
  if ( count > 1 ) return count;
  if ( count === 1 ) return 1;
  const sphere = /(\d+)-foot-radius/i.exec(text);
  if ( sphere ) return targetsInArea("sphere", sphere[1]);
  const shape = /(\d+)-foot(?:-long)?[ -](cone|line|cube|emanation|sphere)/i.exec(text);
  if ( shape ) return targetsInArea(shape[2] === "emanation" ? "sphere" : shape[2], shape[1]);
  if ( /each creature|any creature|all creatures/i.test(text) ) return 2;
  return 1;
}

/* -------------------------------------------- */
/*  Conditions an option hands out              */
/* -------------------------------------------- */

function durationFromText(text) {
  const out = {};
  if ( /repeats? th(?:e|is) sav|at the end of each of its turns|end of each of the target's turns/i.test(text) ) {
    out.saveEnds = true;
  }
  const escape = /escape dc (\d+)/i.exec(text);
  if ( escape ) out.escape = Number(escape[1]);
  if ( /until the (?:end|start) of (?:its|the [a-z' ]+?|their|your) next turn/i.test(text) ) out.rounds = 1;
  else if ( /for 1 minute|up to 1 minute/i.test(text) ) out.rounds = 10;
  else if ( /for (\d+) rounds?/i.test(text) ) out.rounds = Number(/for (\d+) rounds?/i.exec(text)[1]);
  return out;
}

function conditionInText(text) {
  const lower = text.toLowerCase();
  for ( const id of NAMED_IN_TEXT ) {
    const re = new RegExp(`(?:has the|have the|is|be|becomes?|falls?|knocked|and) ${id}\\b|\\b${id} condition`, "i");
    if ( re.test(lower) ) return id;
  }
  return null;
}

function conditionFrom(item, activity, text, { save = false } = {}) {
  // "If this reduces the target to 0 hit points, it is paralyzed...": not something that happens mid-fight
  if ( /reduc(?:es|ed|ing)? (?:the target|it|a creature|the creature) to 0 hit points/i.test(text) ) return null;
  // The effects the activity applies
  const ids = new Set(list(activity?.effects).map(e => e?._id));
  let found = null;
  for ( const effect of list(item.effects) ) {
    if ( !effect || (typeof effect !== "object") || !ids.has(effect._id) ) continue;
    const status = list(effect.statuses).filter(id => id in CONDITIONS)
      .sort((a, b) => (CONDITIONS[b].severity ?? 0) - (CONDITIONS[a].severity ?? 0))[0];
    if ( !status ) continue;
    found = { id: status };
    const d = effect.duration ?? {};
    const value = num(d.value ?? d.rounds ?? d.turns);
    if ( value > 0 ) {
      if ( ["rounds", "turns"].includes(d.units) || d.rounds || d.turns ) found.rounds = value;
      else if ( d.units === "minutes" ) found.rounds = value * 10;
      else if ( d.units === "seconds" ) found.rounds = Math.max(1, Math.round(value / 6));
      else if ( !d.units && d.seconds ) found.rounds = Math.max(1, Math.round(num(d.seconds) / 6));
    }
    break;
  }
  if ( !found ) {
    const id = conditionInText(text);
    if ( !id ) return null;
    found = { id };
  }
  const timing = durationFromText(text);
  if ( timing.saveEnds ) found.saveEnds = true;
  if ( timing.escape ) found.escape = timing.escape;
  found.rounds ??= timing.rounds ?? (CONDITIONS[found.id]?.standsUp ? 1 : (found.escape ? 10 : (save ? 10 : 1)));
  // A long-lasting condition with no stated way out: assume the usual save at the end of each turn.
  if ( (found.rounds > 1) && !found.escape && !found.saveEnds && save ) found.saveEnds = true;
  return found;
}

/** "The target must succeed on a DC 13 Constitution saving throw or ..." after an attack's description. */
function riderFromText(text, item, ctx) {
  const m = /dc (\d+) (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw/i.exec(text);
  if ( m ) {
    const tail = text.slice(m.index);
    const id = conditionInText(tail);
    const extra = /(?:or take|taking|takes) (\d+) \((\d+d\d+(?: ?[+-] ?\d+)?)\) ([a-z]+) damage/i.exec(tail);
    if ( !id && !extra ) return null;
    const rider = { dc: Number(m[1]), ability: m[2].slice(0, 3).toLowerCase(), half: /half as much/i.test(tail), dmg: [] };
    if ( extra ) rider.dmg.push({ ...parse(extra[2]), type: extra[3].toLowerCase() });
    if ( id ) {
      const timing = durationFromText(tail);
      rider.cond = { id, rounds: timing.rounds ?? (CONDITIONS[id]?.standsUp ? 1 : 10), saveEnds: timing.saveEnds || undefined,
        escape: timing.escape };
      if ( (rider.cond.rounds > 1) && !rider.cond.saveEnds && !rider.cond.escape ) rider.cond.saveEnds = true;
    }
    return rider;
  }
  // No save: "the target has the Grappled condition (escape DC 14)", "is knocked Prone"
  const id = conditionInText(text);
  if ( !id || !["grappled", "prone", "restrained", "poisoned"].includes(id) ) return null;
  const timing = durationFromText(text);
  return {
    dc: null, ability: null, half: false, dmg: [],
    cond: { id, escape: timing.escape, rounds: timing.rounds ?? (CONDITIONS[id]?.standsUp ? 1 : (timing.escape ? 10 : 1)),
      saveEnds: timing.saveEnds || undefined }
  };
}

/* -------------------------------------------- */
/*  Multiattack and legendary actions           */
/* -------------------------------------------- */

function wordNumber(word) {
  if ( /^\d+$/.test(word) ) return Number(word);
  return NUMBER_WORDS[word] ?? null;
}

function findOptionByName(profile, phrase, { act = "action" } = {}) {
  const clean = phrase.toLowerCase().replace(/[^a-z' -]/g, "").trim();
  if ( !clean ) return null;
  const forms = new Set([clean, clean.replace(/s$/, ""), `${clean}s`, clean.replace(/ies$/, "y")]);
  const pool = profile.options.filter(o => (o.kind !== "heal") && (!act || (o.act === act)));
  const same = pool.find(o => forms.has(o.name.toLowerCase()));
  if ( same ) return same;
  // "claw" for "Claws", or the first words of a longer name ("Longsword" for "Longsword: Two-Handed")
  return pool.find(o => {
    const name = o.name.toLowerCase();
    return [...forms].some(f => (f.length >= 3) && (name.startsWith(`${f}:`) || name.startsWith(`${f} (`)));
  }) ?? null;
}

/**
 * Read "makes two Claw attacks and one Bite attack" into a list of attacks.
 * @returns {Array<{index: number, count: number}>|null}
 */
export function parseAttackList(text, profile) {
  const lower = ` ${text.toLowerCase()} `;
  const alternatives = lower.split(/(?:,|;)? or (?:it )?(?:makes |uses )?/);
  let best = null;
  const attacksOnly = profile.options.filter(o => (o.act === "action") && (o.kind === "attack"));
  const strongest = [...attacksOnly].sort((a, b) => optionAverage(b) - optionAverage(a))[0];
  const numberRe = "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)";

  const consider = result => {
    if ( !result?.length ) return;
    const total = result.reduce((sum, e) => sum + (e.count * optionAverage(profile.options[e.index])), 0);
    if ( !best || (total > best.total) ) best = { total, result };
  };

  // "makes two Javelin or Morningstar attacks": the better of the two, that many times
  const either = new RegExp(`\\b${numberRe}\\s+([a-z' -]+?)\\s+or\\s+([a-z' -]+?)\\s+attacks?\\b`).exec(lower);
  if ( either ) {
    const count = wordNumber(either[1]);
    for ( const phrase of [either[2], either[3]] ) {
      const option = findOptionByName(profile, phrase);
      if ( count && option ) consider([{ index: profile.options.indexOf(option), count }]);
    }
  }
  // A Hydra: "as many Bite attacks as it has heads" (five, to start with)
  const heads = /as many ([a-z' -]+?) attacks as it has heads/.exec(lower);
  if ( heads ) {
    const option = findOptionByName(profile, heads[1]);
    if ( option ) consider([{ index: profile.options.indexOf(option), count: 5 }]);
  }
  // "...and it uses Dreadful Glare": something else done alongside the attacks
  const extras = [];
  const usesRe = /\buses? (?:its )?([a-z' -]+?)(?=,|\.| if | once| and | or |$)/g;
  let used;
  while ( (used = usesRe.exec(lower)) ) {
    const option = findOptionByName(profile, used[1]);
    if ( option && !extras.some(e => e.index === profile.options.indexOf(option)) ) {
      extras.push({ index: profile.options.indexOf(option), count: 1 });
    }
  }

  for ( const alt of alternatives ) {
    const entries = [];
    let generic = 0;
    const re = new RegExp(`\\b${numberRe}\\s+((?:[a-z'-]+\\s+){0,4}?)attacks?\\b`, "g");
    let m;
    while ( (m = re.exec(alt)) ) {
      const count = wordNumber(m[1]);
      if ( !count ) continue;
      const phrase = m[2].replace(/\b(melee|ranged|weapon|spell|of|its|the|with)\b/g, " ").replace(/\s+/g, " ").trim();
      const option = phrase ? findOptionByName(profile, phrase) : null;
      if ( option ) entries.push({ index: profile.options.indexOf(option), count });
      else generic += count;
    }
    // "three attacks: one with its bite and two with its claws"
    const withRe = new RegExp(`\\b${numberRe}\\s+with\\s+(?:its|his|her|their|the)\\s+([a-z' -]+?)(?=,|\\.| and | or |$)`, "g");
    const named = [];
    while ( (m = withRe.exec(alt)) ) {
      const count = wordNumber(m[1]);
      const option = findOptionByName(profile, m[2]);
      if ( count && option ) named.push({ index: profile.options.indexOf(option), count });
    }
    // "uses its Frightful Presence" style extras are left out; "two attacks, using X or Y" falls to the strongest.
    let result = entries;
    if ( named.length ) result = named;
    else if ( !entries.length && generic && strongest ) result = [{ index: profile.options.indexOf(strongest), count: generic }];
    else if ( entries.length && generic && strongest && !named.length ) {
      const namedTotal = entries.reduce((n, e) => n + e.count, 0);
      if ( generic > namedTotal ) result = [...entries, { index: profile.options.indexOf(strongest), count: generic - namedTotal }];
    }
    consider(result);
  }
  if ( !best ) return extras.length ? extras : null;
  return [...best.result, ...extras.filter(e => !best.result.some(r => r.index === e.index))];
}

function readMultiattack(profile, ctx) {
  const item = ctx.items.find(i => /^multiattack$/i.test(String(i.name ?? "").trim()));
  if ( !item ) return;
  const text = plainText(item.system?.description?.value, ctx.names);
  const parsed = parseAttackList(text, profile);
  if ( parsed ) profile.multiattack = mergeAttackList(parsed);
  else ctx.notes.push("Multiattack couldn't be read, so it's counted as one attack a turn.");
}

function mergeAttackList(entries) {
  const merged = new Map();
  for ( const e of entries ) merged.set(e.index, (merged.get(e.index) ?? 0) + e.count);
  return [...merged.entries()].map(([index, count]) => ({ index, count }));
}

/** Legendary actions written as "makes one Rend attack": point them at the attack they use. */
function readLegendaryReferences(profile, ctx) {
  for ( const item of ctx.items ) {
    const activities = Object.values(item.system?.activities ?? {});
    const legendary = activities.find(a => ["legendary", "mythic"].includes(a?.activation?.type));
    if ( !legendary ) continue;
    if ( profile.options.some(o => (o.itemId === item._id) && (o.act === "legendary")) ) continue;
    if ( legendary.type === "cast" ) continue; // already added through its spell, if it has one worth using
    const text = plainText(item.system?.description?.value, ctx.names);
    const parsed = parseAttackList(text, profile);
    if ( !parsed?.length ) continue;
    const source = profile.options[parsed[0].index];
    profile.options.push({
      ...source,
      name: `${item.name} (${source.name})`,
      itemId: item._id,
      act: "legendary",
      cost: Math.max(1, num(legendary.activation?.value, 1)),
      count: (source.count ?? 1) * parsed[0].count,
      uses: null,
      shares: source.uses ? parsed[0].index : undefined
    });
  }
  if ( profile.legAct && !profile.options.some(o => o.act === "legendary") ) {
    const strongest = profile.options.filter(o => (o.act === "action") && (o.kind === "attack") && !o.uses)
      .sort((a, b) => optionAverage(b) - optionAverage(a))[0];
    if ( strongest ) {
      profile.options.push({ ...strongest, name: `Legendary action (${strongest.name})`, act: "legendary", cost: 1 });
      ctx.notes.push("Its legendary actions couldn't be read, so each is counted as one of its attacks.");
    }
  }
}

/* -------------------------------------------- */
/*  Conditions it has right now                 */
/* -------------------------------------------- */

function readConditions(profile, ctx) {
  const seen = new Map();
  const effects = ctx.over.effects ?? list(ctx.data.effects).filter(e => e && (typeof e === "object") && !e.disabled
    && (e.transfer !== false || true));
  for ( const effect of effects ) {
    for ( const id of list(effect.statuses) ) {
      if ( DEFEATED.has(id) ) profile.defeated = true;
      if ( !known(id) ) continue;
      const d = effect.duration ?? {};
      let rounds = null;
      if ( Number.isFinite(d.remainingRounds) ) rounds = Math.max(1, d.remainingRounds);
      else if ( num(d.rounds) > 0 ) rounds = num(d.rounds);
      else if ( (num(d.value) > 0) && ["rounds", "turns"].includes(d.units) ) rounds = num(d.value);
      else if ( (num(d.value) > 0) && (d.units === "minutes") ) rounds = num(d.value) * 10;
      else if ( num(d.seconds) > 0 ) rounds = Math.max(1, Math.round(num(d.seconds) / 6));
      const entry = { id, rounds };
      if ( id in VALUE_CONDITIONS ) {
        const raw = effect.flags?.["primal-status"]?.value ?? /\(([^)]+)\)/.exec(effect.name ?? "")?.[1];
        const typed = /^(.*?)(?:\s+(acid|fire))?$/i.exec(String(raw ?? "").trim());
        entry.amount = parse(typed?.[1] || VALUE_CONDITIONS[id].fallback || "0");
        if ( !average(entry.amount) ) entry.amount = parse(VALUE_CONDITIONS[id].fallback ?? "1d4");
        if ( id === "burning" ) entry.type = (typed?.[2] ?? "fire").toLowerCase();
      }
      if ( !seen.has(id) || ((seen.get(id).rounds ?? Infinity) < (rounds ?? Infinity)) ) seen.set(id, entry);
    }
  }
  for ( const id of list(ctx.over.statuses) ) {
    if ( DEFEATED.has(id) ) profile.defeated = true;
    if ( known(id) && !seen.has(id) ) seen.set(id, { id, rounds: null });
  }
  profile.conditions = [...seen.values()];
}

/* -------------------------------------------- */
/*  Averages and the summary                    */
/* -------------------------------------------- */

/** The average damage of one use of an option that lands on every target, before AC and saves. */
export function optionAverage(option) {
  if ( !option || (option.kind === "heal") ) return 0;
  let one = option.dmg.reduce((sum, d) => sum + Math.max(0, average(d)), 0);
  if ( option.rider ) one += option.rider.dmg.reduce((sum, d) => sum + Math.max(0, average(d)), 0) * 0.5;
  return one * (option.count ?? 1) * (option.targets ?? 1);
}

/** A rough damage-per-round figure against a typical defender, for comparing creatures. */
function roundDamage(profile) {
  const landed = option => {
    if ( option.kind === "attack" ) return Math.min(0.95, Math.max(0.05, (21 + option.toHit - 15) / 20));
    if ( option.kind === "save" ) return option.half ? 0.75 : 0.55;
    return 1;
  };
  const actions = profile.options.filter(o => (o.act === "action") && (o.kind !== "heal"));
  let best = 0;
  for ( const o of actions ) {
    const times = (o.kind === "attack") && o.weapon ? 1 + (profile.features.extraAttacks ?? 0) : 1;
    const weight = o.uses?.recharge ? 0.45 : 1;
    best = Math.max(best, optionAverage(o) * landed(o) * times * weight);
  }
  if ( profile.multiattack ) {
    const total = profile.multiattack.reduce((sum, e) => {
      const o = profile.options[e.index];
      return sum + (optionAverage(o) * landed(o) * e.count);
    }, 0);
    best = Math.max(best, total);
  }
  const bonus = Math.max(0, ...profile.options.filter(o => (o.act === "bonus") && (o.kind !== "heal"))
    .map(o => optionAverage(o) * landed(o)));
  const legendary = profile.legAct ? Math.max(0, ...profile.options.filter(o => o.act === "legendary")
    .map(o => (optionAverage(o) * landed(o) * profile.legAct) / Math.max(1, o.cost ?? 1))) : 0;
  return best + bonus + legendary;
}

const signed = n => (n >= 0 ? `+${n}` : String(n));
const ABILITY_NAMES = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };

function damageText(parts) {
  return parts.map(d => `${describe(d)}${d.type ? ` ${d.type}` : ""}`).join(" + ");
}

function conditionText(cond) {
  if ( !cond ) return "";
  const name = cond.id.charAt(0).toUpperCase() + cond.id.slice(1);
  const how = cond.escape ? `escape DC ${cond.escape}` : (cond.saveEnds ? "save ends" : (cond.rounds > 1 ? `${cond.rounds} rounds` : "1 round"));
  return `${name} (${how})`;
}

/** One line for an option, as shown in the window: "Bite: +5 to hit, 2d6 + 3 piercing". */
export function describeOption(option) {
  const bits = [];
  if ( option.kind === "attack" ) {
    bits.push(`${signed(option.toHit)} to hit`);
    if ( option.dmg.length ) bits.push(damageText(option.dmg));
    if ( option.count > 1 ) bits.push(`× ${option.count}`);
    if ( option.rider ) {
      const r = option.rider;
      const parts = [];
      if ( r.dc ) parts.push(`DC ${r.dc} ${ABILITY_NAMES[r.ability] ?? r.ability}`);
      if ( r.dmg.length ) parts.push(damageText(r.dmg));
      if ( r.cond ) parts.push(conditionText(r.cond));
      bits.push(`then ${parts.join(", ")}`);
    }
  } else if ( option.kind === "save" ) {
    bits.push(`DC ${option.dc} ${ABILITY_NAMES[option.ability] ?? option.ability}`);
    if ( option.dmg.length ) bits.push(`${damageText(option.dmg)}${option.half ? " (half on a save)" : ""}`);
    if ( option.cond ) bits.push(conditionText(option.cond));
    if ( option.targets > 1 ) bits.push(`up to ${option.targets} targets`);
  } else if ( option.kind === "auto" ) {
    bits.push(`${damageText(option.dmg)}, no roll`);
    if ( option.count > 1 ) bits.push(`× ${option.count}`);
  } else if ( option.kind === "heal" ) {
    bits.push(`heals ${describe(option.heal)}${option.self ? " (self)" : ""}`);
  }
  const tags = [];
  if ( option.act === "bonus" ) tags.push("bonus action");
  if ( option.act === "legendary" ) tags.push(option.cost > 1 ? `legendary, costs ${option.cost}` : "legendary");
  if ( option.uses?.recharge ) tags.push(option.uses.recharge >= 6 ? "recharge 6" : `recharge ${option.uses.recharge}–6`);
  else if ( option.uses ) tags.push(`${option.uses.left} of ${option.uses.max} uses`);
  if ( option.slot === "pact" ) tags.push("pact slot");
  else if ( option.slot ) tags.push(`level ${option.slot} slot`);
  if ( option.linger ) tags.push("keeps going while concentrating");
  return `${option.name}${tags.length ? ` (${tags.join(", ")})` : ""}: ${bits.join(", ")}`;
}

function summarize(profile) {
  const lines = [];
  if ( profile.multiattack ) {
    lines.push(`Multiattack: ${profile.multiattack.map(e => `${e.count} × ${profile.options[e.index].name}`).join(", ")}`);
  }
  if ( profile.features.extraAttacks ) lines.push(`Extra Attack: ${1 + profile.features.extraAttacks} weapon attacks an action`);
  const shown = [...profile.options].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)).slice(0, 12);
  for ( const option of shown ) lines.push(describeOption(option));
  if ( profile.options.length > shown.length ) lines.push(`…and ${profile.options.length - shown.length} more`);
  const defence = [];
  if ( profile.resist.size ) defence.push(`resists ${[...profile.resist].join(", ")}${profile.resistBypass.has("mgc") ? " (not from magical attacks)" : ""}`);
  if ( profile.immune.size ) defence.push(`immune to ${[...profile.immune].join(", ")}${profile.immuneBypass.has("mgc") ? " (not from magical attacks)" : ""}`);
  if ( profile.vulnerable.size ) defence.push(`vulnerable to ${[...profile.vulnerable].join(", ")}`);
  if ( profile.condImmune.size ) defence.push(`can't be ${[...profile.condImmune].join(", ")}`);
  if ( defence.length ) lines.push(`Defences: ${defence.join("; ")}`);
  const extras = [];
  if ( profile.legRes ) extras.push(`${profile.legRes} legendary resistance${profile.legRes > 1 ? "s" : ""}`);
  if ( profile.legAct ) extras.push(`${profile.legAct} legendary action${profile.legAct > 1 ? "s" : ""} a round`);
  if ( profile.magicRes ) extras.push("Magic Resistance");
  if ( profile.regen ) extras.push(`regenerates ${profile.regen.amount} a turn`);
  const f = profile.features;
  if ( f.packTactics ) extras.push("Pack Tactics");
  if ( f.sneak ) extras.push(`Sneak Attack ${describe(f.sneak)}`);
  if ( f.rage ) extras.push(`Rage (+${f.rage} damage, resists weapon damage)`);
  if ( f.evasion ) extras.push("Evasion");
  if ( f.uncannyDodge ) extras.push("Uncanny Dodge");
  if ( f.shield ) extras.push("Shield spell");
  if ( f.parry ) extras.push(`Parry (+${f.parry} AC)`);
  if ( f.undeadFortitude ) extras.push("Undead Fortitude");
  if ( f.relentless ) extras.push("Relentless Endurance");
  if ( f.bonusAttack ) extras.push(`a ${f.bonusAttack} attack as a bonus action`);
  if ( f.cantripBonus ) extras.push(`+${f.cantripBonus} cantrip damage`);
  for ( const e of f.onHit ?? [] ) {
    extras.push(`${e.name}: +${describe(e.dmg)}${e.dmg.type ? ` ${e.dmg.type}` : ""} once a turn on a hit`
      + `${e.weapon ? " with a weapon" : ""}${e.bloodied ? " against a bloodied target" : ""}`
      + `${e.uses !== null ? ` (${e.uses} uses)` : ""}`);
  }
  if ( f.everyHit ) extras.push(`+${describe(f.everyHit)} on every hit (set by hand)`);
  if ( f.nova ) {
    extras.push(`Nova (${f.nova.willpower} Willpower): takes ${describe(f.nova.recoil[0])} then more each turn, `
      + `adds ${describe(f.nova.burn[0])} up to ${describe(f.nova.burn.at(-1))} to one hit a turn`
      + `${f.nova.flare ? `; Solar Flare ${f.nova.flare.flat} radiant to every enemy instead of dropping` : ""}`);
  }
  if ( profile.reduction ) extras.push(`takes ${profile.reduction} less from each hit`);
  if ( extras.length ) lines.push(`Also: ${extras.join("; ")}`);
  if ( profile.conditions.length ) lines.push(`Right now: ${profile.conditions.map(c => c.id).join(", ")}`);
  return lines;
}
