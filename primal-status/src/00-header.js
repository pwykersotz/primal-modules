/**
 * Primal Status (module id: primal-status). It was "enhanced-status-effects" (Enhanced Status
 * Effects) from 3.0.0 to 3.2.3 and "mighty-guard" before that; see src/22-migrate.js. Started as Mighty Guard: a status effect, toggled from the Token HUD's status effects palette, that forces every DAMAGE ROLL
 * made against the affected creature (i.e. while it is targeted) to roll its
 * minimum possible result. Attack rolls are not affected.
 *
 * Compatible with Foundry VTT v12 and v13.
 * Native damage-roll detection for dnd5e and pf2e, with a generic fallback for other systems.
 *
 * Also gives tokens with any cover status (dnd5e: Half, Three-Quarters, Total Cover) a
 * drifting fog appearance, and sleeping tokens floating green Z's.
 *
 * Adds Haste and Slow statuses (dnd5e 2024 rules) with animated green / dark blue outlines.
 *
 * Adds a search box to the Token HUD status palette, and a settings window to hide statuses from it.
 *
 * Adds a Guidance (+1d4) checkbox to dnd5e ability/skill check dialogs, and floating hearts on
 * charmed creatures.
 *
 * Animated condition effects: dripping blood (bleeding), toxic bubbles and a green haze (poisoned),
 * a fiery aura (burning), rope (restrained), orbiting stars (stunned), Z's (sleeping and unconscious),
 * cracked stone (petrified), electric arcs (paralyzed), sores (diseased), drained and fading (incapacitated),
 * a dark swirl (cursed), crosshairs (marked), afterimages (dodging), blood splatters (bloodied), dust and chevrons (prone), a pulsing red skull (dying, 0 HP),
 * writhing shadow tendrils
 * (frightened), turning rune rings (concentrating) and a clawed hand (grappled). The small status
 * icon is left off tokens for statuses that have an animation.
 *
 * Adds a leveled Contamination status (Monsters of Drakkenheim) with a swirl of octarine light, and
 * bloodshot cracks for Exhaustion; both show their level in Hearthstone-style gems on the token.
 *
 * Monsters of Drakkenheim conditions with their rules and animations (Frozen's ring of ice and
 * Entangled's thorny vines play out when the status ends, see 13-fx-ice-and-vines.js), and a box
 * in the status pane for the X of Jinxed, Valor and Burning (09-status-values.js). Burning deals
 * its damage each turn, and short effects that end on a save end with the combat (09-automation.js).
 *
 * Applies the Advantage / Disadvantage that conditions give to attack rolls (attacker's and
 * target's conditions), ability checks and saving throws, where dnd5e doesn't already.
 */

const MODULE_ID = "primal-status";
const LEGACY_MODULE_IDS = ["enhanced-status-effects", "mighty-guard"];   // earlier IDs, newest first (3.0.0–3.2.3, before 3.0.0)
const STATUS_ID = "mighty-guard";                // the Mighty Guard status keeps its ID
const MODULE_PATH = `modules/${MODULE_ID}`;
const ICON = `${MODULE_PATH}/icons/mighty-guard.svg`;
const GRAPPLE_DEFAULT_IMAGE = `${MODULE_PATH}/images/grapple-hand.webp`;
const GRAPPLE_OLD_DEFAULTS = [`${MODULE_PATH}/images/grapple-claws.webp`, `${MODULE_PATH}/images/grapple-claws-hollow.webp`];
const HASTE_ID = "hasted";
const SLOW_ID = "slowed";
const CONTAM_ID = "contamination";
const CONTAM_ICON = `${MODULE_PATH}/icons/contamination.svg`;
const CONTAM_MAX = 6;

