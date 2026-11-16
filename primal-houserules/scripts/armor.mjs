/**
 * Armor Class cap: no creature's AC goes above the cap (24 to start with), however it was worked out (armor, natural
 * armor, a flat or custom formula, bonuses from items and effects, cover). Applied as the last step of preparing an
 * actor's data, so every sheet, roll and module that reads system.attributes.ac.value sees the capped number.
 */
import { MODULE_ID, SETTINGS, setting, wrap } from "./constants.mjs";

/**
 * Cap an Armor Class object in place.
 * @param {object} ac     system.attributes.ac
 * @param {number} cap    0 or less switches the cap off.
 * @returns {boolean}     Whether the value was lowered.
 */
export function capArmorClass(ac, cap) {
  if ( !ac || !Number.isFinite(cap) || (cap <= 0) ) return false;
  if ( !Number.isFinite(ac.value) || (ac.value <= cap) ) return false;
  ac.uncapped = ac.value;
  ac.value = cap;
  ac.capped = true;
  return true;
}

/** Cap AC once each actor's derived data is prepared. Called during init, before any actor is prepared. */
export function registerArmorCap() {
  wrap("CONFIG.Actor.documentClass.prototype", "prepareDerivedData", function(wrapped, ...args) {
    const result = wrapped(...args);
    try {
      capArmorClass(this.system?.attributes?.ac, Number(setting(SETTINGS.acCap, 24)));
    } catch (err) {
      console.error(`${MODULE_ID} | Could not cap the Armor Class of ${this.name}`, err);
    }
    return result;
  });
}
