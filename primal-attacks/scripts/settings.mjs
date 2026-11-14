import { MODULE_ID, SETTINGS } from "./constants.mjs";

/**
 * Register the module settings. Called during the init hook.
 */
export function registerSettings() {
  const L = key => `PRIMAL_ATTACKS.Settings.${key}`;

  // Stored per user, so each player decides for themselves and it follows them to any device.
  game.settings.register(MODULE_ID, SETTINGS.offerOnAttack, {
    name: L(`${SETTINGS.offerOnAttack}.Name`),
    hint: L(`${SETTINGS.offerOnAttack}.Hint`),
    scope: "user",
    config: true,
    type: String,
    choices: {
      all: L(`${SETTINGS.offerOnAttack}.All`),
      characters: L(`${SETTINGS.offerOnAttack}.Characters`),
      monsters: L(`${SETTINGS.offerOnAttack}.Monsters`),
      never: L(`${SETTINGS.offerOnAttack}.Never`)
    },
    default: "all"
  });

  game.settings.register(MODULE_ID, SETTINGS.damagePolicy, {
    name: L(`${SETTINGS.damagePolicy}.Name`),
    hint: L(`${SETTINGS.damagePolicy}.Hint`),
    scope: "world",
    config: true,
    type: String,
    choices: {
      hit: L(`${SETTINGS.damagePolicy}.Hit`),
      always: L(`${SETTINGS.damagePolicy}.Always`),
      none: L(`${SETTINGS.damagePolicy}.None`)
    },
    default: "hit"
  });

  game.settings.register(MODULE_ID, SETTINGS.defeatedTarget, {
    name: L(`${SETTINGS.defeatedTarget}.Name`),
    hint: L(`${SETTINGS.defeatedTarget}.Hint`),
    scope: "world",
    config: true,
    type: String,
    choices: {
      skip: L(`${SETTINGS.defeatedTarget}.Skip`),
      keep: L(`${SETTINGS.defeatedTarget}.Keep`)
    },
    default: "skip"
  });

  game.settings.register(MODULE_ID, SETTINGS.summaryCard, {
    name: L(`${SETTINGS.summaryCard}.Name`),
    hint: L(`${SETTINGS.summaryCard}.Hint`),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.multiattackWindow, {
    name: L(`${SETTINGS.multiattackWindow}.Name`),
    hint: L(`${SETTINGS.multiattackWindow}.Hint`),
    scope: "user",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.foldCards, {
    name: L(`${SETTINGS.foldCards}.Name`),
    hint: L(`${SETTINGS.foldCards}.Hint`),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}
