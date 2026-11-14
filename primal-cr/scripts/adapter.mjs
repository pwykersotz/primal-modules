/**
 * Between Foundry and the reader: turn an Actor document into plain data plus the numbers dnd5e has already
 * worked out for it (AC, saves, to-hit, damage formulas, DCs, uses left).
 */
import { readActor } from "./reader.mjs";

const arr = value => {
  if ( !value ) return [];
  if ( Array.isArray(value) ) return value;
  try {
    return [...value];
  } catch {
    return [];
  }
};
const finite = value => (Number.isFinite(Number(value)) && (value !== null) && (value !== "") ? Number(value) : undefined);

function usesOf(uses) {
  if ( !uses ) return undefined;
  const max = finite(uses.max);
  if ( !(max > 0) ) return undefined;
  return { max, value: finite(uses.value) ?? Math.max(0, max - (finite(uses.spent) ?? 0)) };
}

/**
 * What dnd5e knows about an actor, for the reader.
 * @param {Actor} actor
 * @returns {{data: object, over: object}}
 */
/**
 * A Primal Spell Points caster's pool, with what each level costs, or undefined. Its leveled spell slots then only
 * say which levels it can afford, so the reader plays the pool instead.
 */
export function spellPointsOf(actor) {
  const module = globalThis.game?.modules?.get?.("primal-spell-points");
  const api = module?.active ? module.api : null;
  if ( (typeof api?.getSpellPoints !== "function") ) return undefined;
  try {
    const state = api.getSpellPoints(actor);
    if ( !state ) return undefined;
    let limit = true;
    try { limit = game.settings.get("primal-spell-points", "highLevelLimit") !== false; }
    catch { /* No such setting. */ }
    const costs = {};
    for ( let level = 1; level <= 9; level++ ) costs[level] = finite(api.costFor?.(level)) ?? 0;
    return {
      value: finite(state.value) ?? 0, max: finite(state.max) ?? 0, maxLevel: finite(state.maxLevel) ?? 0,
      highUsed: arr(state.highUsed).map(Number), limit, costs
    };
  } catch ( err ) {
    console.warn(`primal-cr | Could not read spell points for ${actor?.name}`, err);
    return undefined;
  }
}

export function snapshot(actor) {
  const sys = actor.system ?? {};
  const a = sys.attributes ?? {};
  const data = actor.toObject();
  const over = {};

  // A level of 0 means the system could not work it out; the reader then counts the class items itself.
  over.level = finite(sys.details?.level) || undefined;
  over.prof = over.level || actor.type !== "character" ? finite(a.prof) : undefined;
  over.mods = {};
  over.saves = {};
  for ( const [key, abl] of Object.entries(sys.abilities ?? {}) ) {
    const mod = finite(abl?.mod);
    if ( mod !== undefined ) over.mods[key] = mod;
    const save = finite(abl?.save?.value ?? abl?.save);
    if ( save !== undefined ) over.saves[key] = save;
  }
  const hp = a.hp ?? {};
  const max = finite(hp.effectiveMax) ?? finite(hp.max);
  if ( max !== undefined ) over.hp = { value: finite(hp.value) ?? max, max, temp: finite(hp.temp) ?? 0 };
  over.ac = finite(a.ac?.value);
  over.init = finite(a.init?.total) ?? finite(a.init?.mod);
  over.spellDc = finite(a.spell?.dc) ?? finite(a.spelldc);
  over.spellAtk = finite(a.spell?.attack);

  over.slots = {};
  for ( const [key, slot] of Object.entries(sys.spells ?? {}) ) {
    if ( !slot ) continue;
    over.slots[key] = { value: finite(slot.value) ?? 0, max: finite(slot.max) ?? 0, level: finite(slot.level) };
  }
  const points = spellPointsOf(actor);
  if ( points ) over.spellPoints = points;

  const traits = sys.traits ?? {};
  over.dr = arr(traits.dr?.value);
  over.di = arr(traits.di?.value);
  over.dv = arr(traits.dv?.value);
  over.ci = arr(traits.ci?.value);
  over.drBypass = arr(traits.dr?.bypasses);
  over.diBypass = arr(traits.di?.bypasses);

  const res = sys.resources ?? {};
  if ( res.legres ) {
    over.legResMax = finite(res.legres.max) ?? 0;
    over.legRes = finite(res.legres.value) ?? Math.max(0, over.legResMax - (finite(res.legres.spent) ?? 0));
  }
  if ( res.legact ) over.legAct = finite(res.legact.max) ?? 0;

  over.flags = actor.flags ?? {};
  over.statuses = arr(actor.statuses);
  over.effects = arr(actor.appliedEffects ?? actor.effects).filter(e => e && !e.disabled).map(e => {
    const d = e.duration ?? {};
    let remainingRounds;
    if ( ["rounds", "turns"].includes(d.units) && Number.isFinite(d.remaining) ) remainingRounds = d.remaining;
    else if ( Number.isFinite(d.secondsRemaining) ) remainingRounds = Math.ceil(d.secondsRemaining / 6);
    return { name: e.name, statuses: arr(e.statuses), flags: e.flags ?? {}, duration: { remainingRounds } };
  });

  const scale = sys.scale ?? {};
  const sneak = scale.rogue?.["sneak-attack"];
  if ( sneak ) over.sneakDice = finite(sneak.number) ?? finite(String(sneak.formula ?? sneak).match(/^(\d+)d/)?.[1]);
  const rage = scale.barbarian?.["rage-damage"] ?? scale.barbarian?.["rage"];
  if ( rage ) over.rageDamage = finite(rage.value ?? rage);

  over.items = {};
  const itemsById = new Map();
  for ( const item of actor.items ?? [] ) {
    itemsById.set(item.id, item);
    const entry = { uses: usesOf(item.system?.uses), activities: {} };
    for ( const activity of item.system?.activities ?? [] ) {
      const info = {};
      const toHit = activity.labels?.toHit;
      if ( (activity.type === "attack") && (typeof toHit === "string") && toHit.trim() ) info.toHit = toHit;
      const damages = activity.labels?.damages ?? activity.labels?.damage;
      if ( Array.isArray(damages) && ["attack", "save", "damage"].includes(activity.type) ) {
        const parts = arr(activity.damage?.parts);
        if ( damages.length === parts.length ) {
          info.damages = damages.map((d, i) => ({
            formula: String(d.formula ?? ""),
            type: d.damageType ?? arr(parts[i]?.types)[0] ?? null
          }));
        } else if ( damages.length ) {
          info.damages = damages.map(d => ({ formula: String(d.formula ?? ""), type: d.damageType ?? null }));
        }
      }
      if ( (activity.type === "heal") && Array.isArray(damages) && damages[0]?.formula ) info.heal = damages[0].formula;
      const dc = finite(activity.save?.dc?.value);
      if ( (activity.type === "save") && (dc !== undefined) ) info.dc = dc;
      const uses = usesOf(activity.uses);
      if ( uses ) info.uses = uses;
      if ( activity.type === "cast" ) {
        const spell = activity.cachedSpell;
        if ( spell?.id ) info.spellId = spell.id;
      }
      entry.activities[activity.id] = info;
    }
    over.items[item.id] = entry;
  }

  const actorData = (() => {
    try {
      return actor.getRollData({ deterministic: true });
    } catch {
      return {};
    }
  })();
  over.resolve = (formula, itemId) => {
    const text = String(formula ?? "");
    if ( !text.includes("@") ) return text;
    let rollData = actorData;
    const item = itemsById.get(itemId);
    try {
      if ( item ) rollData = item.getRollData({ deterministic: true }) ?? actorData;
    } catch { /* the actor's will do */ }
    try {
      return Roll.replaceFormulaData(text, rollData, { missing: "0", warn: false });
    } catch {
      return text.replace(/@[\w.-]+/g, "0");
    }
  };

  // Leave out what couldn't be read, so the reader falls back to working it out.
  for ( const key of Object.keys(over) ) if ( over[key] === undefined ) delete over[key];
  if ( !Object.keys(over.mods).length ) delete over.mods;
  if ( !Object.keys(over.saves).length ) delete over.saves;
  return { data, over };
}

/**
 * Read an actor into a profile.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {boolean} [options.fresh]  As if rested: full HP, all uses and slots, no conditions.
 */
export function profileOf(actor, { fresh = false } = {}) {
  const { data, over } = snapshot(actor);
  const profile = readActor(data, over, { fresh });
  profile.img = actor.img ?? profile.img;
  return profile;
}

/** Is this one of the players' characters? */
export function isPlayerCharacter(actor) {
  return (actor?.type === "character") || !!actor?.hasPlayerOwner;
}

/** The XP a creature is worth, by the book. */
export function xpOf(actor) {
  const own = Number(actor?.system?.details?.xp?.value);
  if ( Number.isFinite(own) && (own > 0) ) return own;
  const cr = Number(actor?.system?.details?.cr);
  if ( !Number.isFinite(cr) ) return 0;
  if ( cr < 1 ) return Math.max(200 * cr, 10);
  return CONFIG.DND5E?.CR_EXP_LEVELS?.[cr] ?? 0;
}
