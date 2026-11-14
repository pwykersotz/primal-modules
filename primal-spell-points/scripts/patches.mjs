/**
 * Extensions to dnd5e:
 * - After an actor's data is prepared, set up its spell points (see spell-points.mjs).
 * - The casting dialog lists each spell level with its spell point cost, says how many points are left, and names the
 *   "Consume Spell Slot" box "Spend Spell Points".
 */
import { MODULE_ID, SLOT_METHOD, levelLabel, loc } from "./constants.mjs";
import { costFor, getState, isHighLevelUsed, prepareSpellPoints } from "./spell-points.mjs";

/**
 * Wrap a method, through libWrapper when it's active so other modules' wrappers keep working.
 * @param {string} path      Dotted path to the object holding the method, from globalThis.
 * @param {string} method
 * @param {Function} fn      Called as fn.call(instance, wrapped, ...args).
 * @param {string} [type]    libWrapper type.
 */
function wrap(path, method, fn, type="WRAPPER") {
  if ( globalThis.libWrapper ) {
    try {
      globalThis.libWrapper.register(MODULE_ID, `${path}.${method}`, fn, type);
      return;
    } catch (err) {
      console.warn(`${MODULE_ID} | libWrapper could not wrap ${path}.${method}, patching directly`, err);
    }
  }
  const target = foundry.utils.getProperty(globalThis, path);
  const original = target?.[method];
  if ( typeof original !== "function" ) {
    console.warn(`${MODULE_ID} | Could not find ${path}.${method} to extend`);
    return;
  }
  target[method] = function(...args) {
    return fn.call(this, original.bind(this), ...args);
  };
}

/**
 * The spell slot level the casting dialog has selected (or will select), for a spell point caster.
 * @param {ActivityUsageDialog} dialog
 * @returns {number|null}
 */
function selectedLevel(dialog) {
  const spells = dialog.actor?.system.spells ?? {};
  const chosen = spells[dialog.config.spell?.slot];
  const consume = (dialog.config.consume === true) || dialog.config.consume?.spellSlot;
  if ( chosen?.type !== SLOT_METHOD ) return null;
  if ( chosen.value || !consume ) return chosen.level;
  // dnd5e falls back to the lowest level the caster can use when the chosen one is empty.
  const minimum = dialog.item?.system.level ?? 1;
  const fallback = Object.values(spells)
    .filter(s => (s?.type === SLOT_METHOD) && s.max && s.value && (s.level >= minimum))
    .sort((a, b) => a.level - b.level)[0];
  return fallback?.level ?? chosen.level;
}

/**
 * Relabel the spell level choices with their costs.
 * @this {ActivityUsageDialog}
 * @param {object} context
 */
function decorateScaling(context) {
  const state = getState(this.actor);
  if ( !state?.active || context.linkedActivity || !context.spellSlots?.options?.length ) return;
  const consume = (this.config.consume === true) || this.config.consume?.spellSlot;
  let any = false;
  for ( const option of context.spellSlots.options ) {
    const slot = this.actor.system.spells?.[option.value];
    if ( slot?.type !== SLOT_METHOD ) continue;
    any = true;
    const data = { level: levelLabel(slot.level), cost: costFor(slot.level) };
    option.label = isHighLevelUsed(state, slot.level) ? loc("Dialog.OptionUsed", data) : loc("Dialog.Option", data);
  }
  if ( !any ) return;

  // dnd5e's "no spell slots left" warning becomes a spell point one.
  const noSlots = game.i18n.format("DND5E.SpellCastNoSlotsLeft", { name: this.item.name });
  context.notes = (context.notes ?? []).filter(n => n.message !== noSlots);
  if ( consume && !context.spellSlots.options.some(o => !o.disabled) ) {
    context.notes.push({ type: "warn", message: loc("Dialog.NoneAffordable", { name: this.item.name }) });
  }
  context.notes.push({ type: "info", message: loc("Dialog.Available", { value: state.value, max: state.max }) });
}

/**
 * Rename "Consume Spell Slot" to "Spend Spell Points" with the cost.
 * @this {ActivityUsageDialog}
 * @param {object} context
 */
function decorateConsumption(context) {
  const state = getState(this.actor);
  if ( !state?.active ) return;
  const entry = context.fields?.find(f => f.name === "consume.spellSlot");
  if ( !entry ) return;
  const level = selectedLevel(this);
  if ( !level ) return;
  entry.field = new foundry.data.fields.BooleanField({
    label: loc("Dialog.Spend", { cost: costFor(level) }),
    hint: loc("Dialog.SpendHint", { value: state.value, max: state.max })
  });
}

/** Called once, in the init hook (actors are prepared before setup, so this can't wait). */
export function applyPatches() {
  wrap("CONFIG.Actor.documentClass.prototype", "prepareData", function(wrapped, ...args) {
    const result = wrapped(...args);
    try {
      prepareSpellPoints(this);
    } catch (err) {
      console.error(`${MODULE_ID} | Could not prepare spell points for ${this.name}`, err);
    }
    return result;
  });

  const dialog = "dnd5e.applications.activity.ActivityUsageDialog.prototype";
  wrap(dialog, "_prepareScalingContext", async function(wrapped, ...args) {
    const context = await wrapped(...args);
    try {
      decorateScaling.call(this, context);
    } catch (err) {
      console.error(`${MODULE_ID} | Could not label spell levels`, err);
    }
    return context;
  });
  wrap(dialog, "_prepareConsumptionContext", async function(wrapped, ...args) {
    const context = await wrapped(...args);
    try {
      decorateConsumption.call(this, context);
    } catch (err) {
      console.error(`${MODULE_ID} | Could not label spell point use`, err);
    }
    return context;
  });
}
