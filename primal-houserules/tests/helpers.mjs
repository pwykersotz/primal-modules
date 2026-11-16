/**
 * Shared bits for the checks: the language file, and a small stand-in for Foundry's Roll that can roll a formula
 * like "3d8 + 2" at its maximum.
 */
import { readFileSync } from "node:fs";

/** lang/en.json as loaded. */
export const LANG = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));

/** Every key in the language file, flattened ("PRIMAL_HOUSERULES.MVP.Lit"). */
export function flatKeys(object=LANG, prefix="") {
  const keys = {};
  for ( const [key, value] of Object.entries(object) ) {
    const path = prefix ? `${prefix}.${key}` : key;
    if ( value && (typeof value === "object") ) Object.assign(keys, flatKeys(value, path));
    else keys[path] = value;
  }
  return keys;
}

/** A Roll that understands sums of dice and numbers, enough for the checks. */
export class FakeRoll {
  constructor(formula, data={}, options={}) {
    this.formula = formula;
    this.data = data;
    this.options = options;
    this.total = undefined;
  }

  clone() {
    return new this.constructor(this.formula, this.data, this.options);
  }

  evaluateSync({ maximize=false }={}) {
    let total = 0;
    for ( const raw of this.formula.replace(/\s+/g, "").replace(/-/g, "+-").split("+") ) {
      if ( !raw ) continue;
      const dice = raw.match(/^(-?)(\d*)d(\d+)/i);
      if ( dice ) {
        const sign = dice[1] ? -1 : 1;
        const number = Number(dice[2] || 1);
        const faces = Number(dice[3]);
        total += sign * number * (maximize ? faces : 1);
      } else if ( Number.isFinite(Number(raw)) ) total += Number(raw);
      else throw new Error(`Can't roll ${raw}`);
    }
    this.total = total;
    return this;
  }
}
