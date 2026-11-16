/**
 * Rolled hit points at level up: half the hit die is fixed and only the other half is rolled, so a d6 rolls 1d3 + 3
 * (4 to 6), a d8 rolls 1d4 + 4, a d10 1d5 + 5 and a d12 1d6 + 6. The Constitution modifier is still added by the
 * Hit Points advancement as usual. Taking the average or the maximum is unchanged.
 */
import { SETTINGS, setting } from "./constants.mjs";

/**
 * The houserule formula for one hit die.
 * @param {number} faces
 * @returns {string|null}   null for a die it can't split (fewer than 2 faces).
 */
export function halfDieFormula(faces) {
  if ( !Number.isInteger(faces) || (faces < 2) ) return null;
  const half = Math.floor(faces / 2);
  return `1d${faces - half} + ${half}`;
}

/**
 * dnd5e.preRollClassHitPoints: swap the plain hit die for the houserule formula. Left alone if another module already
 * replaced the formula with something that isn't one roll of the class's hit die.
 * @param {Actor} actor
 * @param {Item} item
 * @param {object} config
 */
export function onPreRollClassHitPoints(actor, item, config) {
  if ( !setting(SETTINGS.halfHitPoints, true) || !config ) return;
  const denomination = String(item?.system?.hd?.denomination ?? "");
  const faces = Number(denomination.replace(/^d/i, ""));
  const formula = halfDieFormula(faces);
  if ( !formula ) return;
  const current = String(config.formula ?? `1d${faces}`);
  // "1d8", or "1d8rr2" / "1d8r<2" from a minimum-roll setting in another module.
  const match = current.trim().match(/^1d(\d+)(?:[a-z<>=!]+\d*)*$/i);
  if ( !match || (Number(match[1]) !== faces) ) return;
  config.formula = formula;
}
