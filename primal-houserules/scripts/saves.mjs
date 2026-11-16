/**
 * Natural 20s and 1s on saving throws against damage:
 * - a natural 20 takes no damage;
 * - a natural 1 takes the most damage the dice could have rolled, and never the reduced damage of a save.
 *
 * Works on dnd5e's dnd5e.preCalculateDamage hook, which every way of applying damage goes through:
 * - with Midi-QOL, its workflow says which targets rolled a natural 20 (criticalSave) or 1 (fumbleSave) in the
 *   damage options (`options.midi`), and each damage entry carries its rolled formula;
 * - without it, the damage card's apply buttons pass the damage message, whose usage message lists the saves
 *   rolled from it (the same link dnd5e uses to halve damage on a save).
 * Resistance, vulnerability, immunity and damage reduction still apply afterwards, as usual.
 */
import { SETTINGS, setting } from "./constants.mjs";

/** Damage types that heal rather than hurt: never touched. */
const isHealing = type => !!globalThis.CONFIG?.DND5E?.healingTypes?.[type] || (type === "healing") || (type === "temphp");

/**
 * The saving throw messages rolled against a usage, for one actor, newest last.
 * @param {ChatMessage} usage
 * @param {Actor} actor
 * @returns {ChatMessage[]}
 */
function savesBy(usage, actor) {
  const messages = usage?.getAssociatedRolls?.("save") ?? [];
  return messages.filter(message => {
    const token = message.getAssociatedToken?.();
    if ( token ) return (token.actor === actor) || (!!actor?.uuid && (token.actor?.uuid === actor.uuid));
    return !!actor?.id && (message.speaker?.actor === actor.id) && !actor.isToken;
  });
}

/**
 * How this actor's saving throw against the damage came out, if it was a natural 20 or a natural 1.
 * @param {Actor} actor
 * @param {object} options  The damage application options.
 * @returns {"critical"|"fumble"|null}
 */
export function saveExtreme(actor, options={}) {
  const midi = options.midi;
  if ( midi ) {
    if ( midi.criticalSave ) return "critical";
    if ( midi.fumbleSave ) return "fumble";
    return null;
  }
  const message = options.originatingMessage;
  if ( !message ) return null;
  const usage = message.getOriginatingMessage?.() ?? message.system?.origin;
  if ( !usage || (usage === message && !usage.getAssociatedRolls) ) return null;
  const saves = savesBy(usage, actor);
  const roll = saves.at(-1)?.rolls?.[0];
  if ( !roll ) return null;
  if ( roll.isCritical ) return "critical";
  if ( roll.isFumble ) return "fumble";
  return null;
}

/**
 * The largest total a formula can roll, or null if it can't be worked out.
 * @param {string} formula
 * @returns {number|null}
 */
export function maxOfFormula(formula) {
  if ( !formula || (typeof formula !== "string") ) return null;
  try {
    const RollClass = globalThis.foundry?.dice?.Roll ?? globalThis.Roll;
    const total = new RollClass(formula).evaluateSync({ maximize: true }).total;
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

/**
 * The largest total a rolled roll could have come out at, or null.
 * @param {Roll} roll
 * @returns {number|null}
 */
export function maxOfRoll(roll) {
  if ( !roll ) return null;
  try {
    const total = roll.clone().evaluateSync({ maximize: true }).total;
    return Number.isFinite(total) ? total : null;
  } catch {
    return maxOfFormula(roll.formula);
  }
}

/**
 * The maximum value of each damage entry, in the same order. Midi-QOL's entries carry their formula. dnd5e's damage
 * card builds its entries from the message's damage rolls with aggregateDamageRolls, so rebuilding them the same way
 * gives the same entries in the same order.
 * @param {object[]} damages
 * @param {object} options
 * @returns {(number|null)[]}
 */
export function maximumDamages(damages, options={}) {
  let aggregated = null;
  const fromMessage = () => {
    if ( aggregated ) return aggregated;
    const DamageRoll = globalThis.CONFIG?.Dice?.DamageRoll;
    const rolls = (options.originatingMessage?.rolls ?? []).filter(r => !DamageRoll || (r instanceof DamageRoll));
    const aggregate = globalThis.dnd5e?.dice?.aggregateDamageRolls;
    try { aggregated = aggregate ? aggregate(rolls, { respectProperties: true }) : rolls; }
    catch { aggregated = rolls; }
    return aggregated;
  };
  return damages.map((damage, index) => {
    if ( damage.formula ) return maxOfFormula(damage.formula);
    const rolls = fromMessage();
    if ( rolls.length !== damages.length ) return null;
    const roll = rolls[index];
    if ( !roll || ((roll.options?.type ?? damage.type) !== damage.type) ) return null;
    return maxOfRoll(roll);
  });
}

/**
 * dnd5e.preCalculateDamage: apply the natural 20 and natural 1 rule.
 * @param {Actor} actor
 * @param {object[]} damages
 * @param {object} options
 */
export function onPreCalculateDamage(actor, damages, options={}) {
  if ( !setting(SETTINGS.saveExtremes, true) ) return;
  if ( !Array.isArray(damages) || !damages.length ) return;
  if ( damages.every(d => isHealing(d.type)) ) return;
  const extreme = saveExtreme(actor, options);
  if ( !extreme ) return;
  options["primal-houserules"] = { save: extreme };

  if ( extreme === "critical" ) {
    // Zero the harmful entries themselves (healing in the same roll still lands), and mark them the way dnd5e marks
    // damage a multiplier removed, so the damage card shows why.
    for ( const damage of damages ) {
      if ( isHealing(damage.type) ) continue;
      damage.value = 0;
      damage.active ??= {};
      damage.active.multiplier = 0;
    }
    return;
  }

  // Natural 1: maximum damage, and no save reduction (it might still have beaten a low DC).
  const maxima = maximumDamages(damages, options);
  damages.forEach((damage, index) => {
    if ( isHealing(damage.type) ) return;
    const max = maxima[index];
    if ( Number.isFinite(max) && (max > (damage.value ?? 0)) ) damage.value = max;
  });
  if ( options.midi ) options.midi.saved = false;
  else if ( Number.isFinite(options.multiplier) && (options.multiplier >= 0) && (options.multiplier < 1) ) {
    options.multiplier = 1;
  }
}
