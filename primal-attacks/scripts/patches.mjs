/**
 * Where Primal Attacks steps in.
 *
 * - dnd5e's AttackActivity#rollAttack: after the Attack Roll window's rolls are made, the set of attacks is finished
 *   (engine.mjs). Midi-QOL's attack activity calls it for its own rolls too, so this is where the Midi-QOL workflows
 *   of the other attacks are handed the rolls already made for them.
 * - With Midi-QOL, a plain click on an attack makes sure the Attack Roll window comes up (where the number of attacks
 *   is picked), even if Midi-QOL would otherwise skip it. Shift, Alt and Ctrl still do what they always do.
 */
import { MODULE_ID, isMidiActivity } from "./constants.mjs";
import { offersCount } from "./dialog.mjs";
import { onRollAttack } from "./engine.mjs";

/**
 * Wrap a method, with libWrapper when it's there.
 * @param {string} path     Where the object is, from globalThis ("CONFIG.Item.documentClass.prototype").
 * @param {string} method
 * @param {function} fn      (wrapped, ...args) => result
 * @param {string} [type]
 */
function wrap(path, method, fn, type="WRAPPER") {
  if ( globalThis.libWrapper ) {
    try {
      globalThis.libWrapper.register(MODULE_ID, `${path}.${method}`, fn, type);
      return true;
    } catch (err) {
      console.warn(`${MODULE_ID} | libWrapper could not wrap ${path}.${method}; wrapping it directly`, err);
    }
  }
  const target = foundry.utils.getProperty(globalThis, path);
  const original = target?.[method];
  if ( typeof original !== "function" ) {
    console.warn(`${MODULE_ID} | ${path}.${method} isn't there to wrap`);
    return false;
  }
  target[method] = function(...args) {
    return fn.call(this, original.bind(this), ...args);
  };
  return true;
}

/** A click by a person with no key held (Shift, Alt and Ctrl change how dnd5e and Midi-QOL roll). */
function plainClick(usage) {
  const event = usage?.event;
  return !!event && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

/** Attack activity #use: with Midi-QOL, show the Attack Roll window for a plain click. */
function onAttackUse(wrapped, usage={}, ...rest) {
  try {
    if ( !usage?.[MODULE_ID]?.skip && plainClick(usage) && isMidiActivity(this) && offersCount(this) ) {
      usage.midiOptions ??= {};
      usage.midiOptions.workflowOptions ??= {};
      usage.midiOptions.workflowOptions.autoFastAttack ??= false;
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not ask Midi-QOL for the roll window`, err);
  }
  return wrapped(usage, ...rest);
}

/** Called once the game is set up (after Midi-QOL has put its activity classes in place). */
export function registerPatches() {
  const base = globalThis.dnd5e?.documents?.activity?.AttackActivity;
  const basePath = typeof base?.prototype?.rollAttack === "function"
    ? "dnd5e.documents.activity.AttackActivity.prototype"
    : "CONFIG.DND5E.activityTypes.attack.documentClass.prototype";
  wrap(basePath, "rollAttack", onRollAttack, "MIXED");
  wrap("CONFIG.DND5E.activityTypes.attack.documentClass.prototype", "use", onAttackUse, "WRAPPER");
}
