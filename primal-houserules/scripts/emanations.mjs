/**
 * Emanations like Spirit Guardians hit a creature at most once per round. Primal Auras (1.3.0 or later) limits a
 * "once per turn" aura effect to once in each combatant's turn and asks, through its primal-auras.onceScope hook,
 * whether that limit should last the whole round instead. This answers "the round" for:
 * - an aura on a spell item (cast from the item), or a token aura named after a spell its actor has, such as the
 *   Spirit Guardians preset turned on by casting the spell; or
 * - every once-per-turn aura, when the setting says so.
 */
import { SETTINGS, setting } from "./constants.mjs";

/** Lowercase, without punctuation, so "Spirit Guardians" matches "Spirit guardians (Lvl 3)". */
const simplify = name => String(name ?? "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Whether an aura comes from a spell.
 * @param {object} context   The primal-auras.onceScope context.
 * @returns {boolean}
 */
export function isSpellAura({ aura, entry, source }={}) {
  if ( (entry?.sourceType === "item") && (entry.item?.type === "spell") ) return true;
  const name = simplify(aura?.name);
  if ( !name ) return false;
  const actor = source?.actor ?? entry?.tokenDoc?.actor;
  const items = actor?.items ?? [];
  for ( const item of items ) {
    if ( (item.type === "spell") && (simplify(item.name) === name) ) return true;
  }
  return false;
}

/**
 * primal-auras.onceScope listener.
 * @param {object} context
 */
export function onOnceScope(context) {
  if ( !context || !setting(SETTINGS.emanations, true) ) return;
  const scope = setting(SETTINGS.emanationScope, "spells");
  if ( (scope === "all") || isSpellAura(context) ) context.scope = "round";
}
