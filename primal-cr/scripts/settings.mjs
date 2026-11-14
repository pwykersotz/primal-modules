import { MODULE_ID, SETTINGS, setting } from "./constants.mjs";
import { DEFAULT_THRESHOLDS } from "./verdict.mjs";

/** Register the module settings. Called during the init hook. */
export function registerSettings(onChange) {
  const L = key => `PRIMAL_CR.Settings.${key}`;

  game.settings.register(MODULE_ID, SETTINGS.runs, {
    name: L("runs.Name"),
    hint: L("runs.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 200, max: 5000, step: 100 },
    default: 1000,
    onChange
  });

  game.settings.register(MODULE_ID, SETTINGS.tactics, {
    name: L("tactics.Name"),
    hint: L("tactics.Hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      mixed: L("tactics.Mixed"),
      focus: L("tactics.Focus"),
      random: L("tactics.Random")
    },
    default: "mixed",
    onChange
  });

  const threshold = (key, name) => game.settings.register(MODULE_ID, key, {
    name: L(`${name}.Name`),
    hint: L(`${name}.Hint`),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 95, step: 1 },
    default: Math.round(DEFAULT_THRESHOLDS[name] * 100),
    onChange
  });
  threshold(SETTINGS.medium, "medium");
  threshold(SETTINGS.hard, "hard");
  threshold(SETTINGS.boss, "boss");
  threshold(SETTINGS.impossible, "impossible");

  game.settings.register(MODULE_ID, SETTINGS.encounter, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
}

/** The thresholds as fractions. */
export function thresholds() {
  const read = (key, name) => {
    const value = Number(setting(key));
    return Number.isFinite(value) && (value > 0) ? value / 100 : DEFAULT_THRESHOLDS[name];
  };
  return {
    impossible: read(SETTINGS.impossible, "impossible"),
    boss: read(SETTINGS.boss, "boss"),
    hard: read(SETTINGS.hard, "hard"),
    medium: read(SETTINGS.medium, "medium")
  };
}
