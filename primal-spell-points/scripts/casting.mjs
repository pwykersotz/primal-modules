/**
 * Paying for spells with spell points, and getting them back on a long rest.
 *
 * dnd5e runs every cast through Activity#consume, which calls dnd5e.preActivityConsumption, works out the updates,
 * calls dnd5e.activityConsumption, then saves them. For a spell point caster casting with a leveled spell slot:
 * - before: check the caster can pay (enough points, level not too high, 6th+ not already used) and tell dnd5e not to
 *   spend a slot;
 * - during: add the spell points to the same update, so the chat card lists "Spell Points -5" and dnd5e's Refund
 *   gives them back.
 * Pact Magic, at-will, innate and ritual casting, and spells cast from items are left exactly as dnd5e runs them.
 */
import { FLAGS, HIGH_LEVEL, MODULE_ID, SLOT_METHOD, loc } from "./constants.mjs";
import { castProblem, costFor, getState } from "./spell-points.mjs";

/** @type {WeakMap<object, {level: number, cost: number}>} Casts being paid for, by usage config. */
const pending = new WeakMap();

/**
 * The spell slot a cast would use, as dnd5e picks it.
 * @param {Activity} activity
 * @param {object} usageConfig
 * @returns {{key: string, slot: object}|null}
 */
export function slotForUsage(activity, usageConfig) {
  const item = activity.item;
  const spellcasting = CONFIG.DND5E.spellcasting[item.system.method];
  const effectiveLevel = (item.system.level ?? 0) + (usageConfig.scaling || 0);
  const key = usageConfig.spell?.slot ?? spellcasting?.getSpellSlotKey?.(effectiveLevel) ?? item.system.method;
  const slot = activity.actor?.system.spells?.[key];
  return slot ? { key, slot } : null;
}

/**
 * dnd5e.preActivityConsumption: check the caster can pay, and take the cast off spell slots.
 * @param {Activity} activity
 * @param {object} usageConfig
 * @returns {boolean|void}  False stops the cast.
 */
function onPreConsumption(activity, usageConfig) {
  const actor = activity.actor;
  const state = getState(actor);
  if ( !state?.active ) return;
  if ( !activity.requiresSpellSlot || !activity.consumption?.spellSlot ) return;
  if ( usageConfig.cause ) return; // Cast through another item's activity: dnd5e doesn't spend a slot either.
  const consume = usageConfig.consume;
  if ( !consume ) return;
  if ( (consume !== true) && !consume.spellSlot ) return; // "Consume spell slot" unticked: free cast.

  const found = slotForUsage(activity, usageConfig);
  if ( found?.slot.type !== SLOT_METHOD ) return; // Pact slots and anything else stay as they are.
  const level = found.slot.level;

  const problem = castProblem(actor, state, level, activity.item.name);
  if ( problem ) {
    ui.notifications.warn(problem);
    return false;
  }

  if ( consume === true ) usageConfig.consume = { action: true, resources: true, spellSlot: false };
  else consume.spellSlot = false;
  pending.set(usageConfig, { level, cost: costFor(level) });
}

/**
 * dnd5e.activityConsumption: add the spell points to the cast's updates.
 * @param {Activity} activity
 * @param {object} usageConfig
 * @param {object} messageConfig
 * @param {object} updates
 */
function onConsumption(activity, usageConfig, messageConfig, updates) {
  const entry = pending.get(usageConfig);
  if ( !entry ) return;
  pending.delete(usageConfig);
  const state = getState(activity.actor);
  if ( !state ) return;
  updates.actor ??= {};
  updates.actor[`flags.${MODULE_ID}.${FLAGS.spent}`] = state.spent + entry.cost;
  if ( state.limit && (entry.level >= HIGH_LEVEL) && !state.highUsed.includes(entry.level) ) {
    updates.actor[`flags.${MODULE_ID}.${FLAGS.highUsed}`] = [...state.highUsed, entry.level].sort((a, b) => a - b);
  }
}

/**
 * dnd5e.preRestCompleted: a rest that restores spell slots (a long rest) restores spell points and high-level spells.
 * @param {Actor} actor
 * @param {object} result
 * @param {object} config
 */
function onPreRestCompleted(actor, result, config) {
  const state = getState(actor);
  if ( !state?.active ) return;
  const restType = CONFIG.DND5E.restTypes?.[result.type ?? config.type];
  if ( !restType?.recoverSpellSlotTypes?.has(SLOT_METHOD) ) return;
  result.updateData ??= {};
  if ( state.spent ) result.updateData[`flags.${MODULE_ID}.${FLAGS.spent}`] = 0;
  if ( state.highUsed.length ) result.updateData[`flags.${MODULE_ID}.${FLAGS.highUsed}`] = [];
}

/**
 * dnd5e.getUnknownAttributeLabel: name the spell point flag on chat cards ("Spell Points -5") and in token bar lists.
 * @param {string} attr
 * @param {object} options
 */
function onAttributeLabel(attr, options) {
  if ( (attr === `flags.${MODULE_ID}.${FLAGS.spent}`) || attr.startsWith("attributes.spellPoints") ) {
    options.label = loc("SpellPoints");
  }
}

/** Register the casting and rest hooks. Called during init. */
export function registerCastingHooks() {
  Hooks.on("dnd5e.preActivityConsumption", onPreConsumption);
  Hooks.on("dnd5e.activityConsumption", onConsumption);
  Hooks.on("dnd5e.preRestCompleted", onPreRestCompleted);
  Hooks.on("dnd5e.getUnknownAttributeLabel", onAttributeLabel);
}
