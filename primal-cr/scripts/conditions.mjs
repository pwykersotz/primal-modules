/**
 * What each condition does in a simulated fight. Covers the dnd5e conditions and the Monsters of Drakkenheim ones
 * that Primal Status adds. Anything not listed here changes nothing in the simulation.
 *
 * - noActions:   the creature loses its turn (and its reactions and legendary actions)
 * - attackDis:   its attack rolls have Disadvantage
 * - attackAdv:   its attack rolls have Advantage
 * - grantAdv:    attack rolls against it have Advantage
 * - grantDis:    attack rolls against it have Disadvantage
 * - meleeCrit:   melee hits against it are critical hits
 * - allCrit:     every hit against it is a critical hit
 * - failStrDex:  it fails Strength and Dexterity saving throws
 * - dexDis:      Disadvantage on Dexterity saving throws
 * - conDis:      Disadvantage on Constitution saving throws
 * - halfDamage:  it deals half damage
 * - resistAll:   it has Resistance to all damage
 * - noBonus:     it can't take Bonus Actions
 * - noReactions: it can't take Reactions
 * - oneAttack:   one weapon attack a turn at most
 * - noSpells:    it can't cast levelled spells
 * - standsUp:    it ends at the start of the creature's own turn (Prone)
 * - severity:    how bad it is to have, for choosing what to use (1 = loses turns)
 */
export const CONDITIONS = Object.freeze({
  blinded: { attackDis: true, grantAdv: true, severity: 0.45 },
  charmed: { severity: 0.5, charm: true },
  frightened: { attackDis: true, severity: 0.3 },
  grappled: { severity: 0.15, grapple: true },
  incapacitated: { noActions: true, severity: 1 },
  invisible: { attackAdv: true, grantDis: true, severity: 0 },
  paralyzed: { noActions: true, grantAdv: true, meleeCrit: true, failStrDex: true, severity: 1.3 },
  petrified: { noActions: true, grantAdv: true, failStrDex: true, resistAll: true, severity: 1.2 },
  poisoned: { attackDis: true, severity: 0.3 },
  prone: { attackDis: true, grantAdvMelee: true, standsUp: true, severity: 0.15 },
  restrained: { attackDis: true, grantAdv: true, dexDis: true, severity: 0.45 },
  stunned: { noActions: true, grantAdv: true, failStrDex: true, severity: 1.15 },
  unconscious: { noActions: true, grantAdv: true, meleeCrit: true, failStrDex: true, severity: 1.3 },
  sleeping: { noActions: true, grantAdv: true, meleeCrit: true, failStrDex: true, severity: 1.3 },
  dodging: { grantDis: true, severity: 0 },
  hasted: { severity: 0 },
  slowed: { noBonus: true, noReactions: true, oneAttack: true, severity: 0.4 },

  // Monsters of Drakkenheim (Primal Status)
  addled: { attackDisSpell: true, severity: 0.15 },
  clumsy: { attackDisDex: true, dexDis: true, severity: 0.15 },
  enfeebled: { attackDisStr: true, severity: 0.15 },
  sickened: { conDis: true, severity: 0.1 },
  defenseless: { grantAdv: true, severity: 0.3 },
  helpless: { allCrit: true, severity: 0.5 },
  weakened: { halfDamage: true, severity: 0.5 },
  dazed: { noBonus: true, severity: 0.15 },
  immobilized: { severity: 0.1 },
  entangled: { grantAdv: true, severity: 0.35 },
  frozen: { grantAdv: true, severity: 0.4 },
  shocked: { grantAdv: true, noBonus: true, severity: 0.4 },
  bewildered: { noSpells: true, severity: 0.3 },
  distracted: { noReactions: true, severity: 0.1 },
  staggered: { oneAttack: true, severity: 0.35 }
});

/** Conditions whose value is a die or a number: Jinxed, Valor, Burning, Bleeding. */
export const VALUE_CONDITIONS = Object.freeze({
  jinxed: { roll: -1 },
  valor: { roll: 1 },
  burning: { damage: "fire", fallback: "1d4" },
  bleeding: { damage: "none", fallback: "1d4" }
});

/** The conditions a description can name, worst first. */
export const NAMED_IN_TEXT = ["paralyzed", "unconscious", "petrified", "stunned", "incapacitated", "restrained",
  "blinded", "frightened", "poisoned", "charmed", "grappled", "prone"];

/** Statuses that mean the creature is out of the fight. */
export const DEFEATED = new Set(["dead", "defeated"]);

/** Is this status one the simulation knows? */
export function known(id) {
  return (id in CONDITIONS) || (id in VALUE_CONDITIONS);
}
