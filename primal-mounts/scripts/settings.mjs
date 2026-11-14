import { MODULE_ID } from "./constants.mjs";

/**
 * Register the module settings. Called during the init hook.
 * @param {Function} onDisplayChange  Called when a setting that affects token display changes.
 */
export function registerSettings(onDisplayChange) {
  const L = key => `PRIMAL_MOUNTS.Settings.${key}`;
  const register = (key, data) => game.settings.register(MODULE_ID, key, {
    name: L(`${key}.Name`),
    hint: L(`${key}.Hint`),
    config: true,
    ...data
  });

  register("rulesVersion", {
    scope: "world",
    type: String,
    choices: {
      modern: L("rulesVersion.Modern"),
      legacy: L("rulesVersion.Legacy"),
      auto: L("rulesVersion.Auto")
    },
    default: "modern"
  });

  register("enforceSize", { scope: "world", type: Boolean, default: true });
  register("playersMountUnowned", { scope: "world", type: Boolean, default: true });
  register("askControl", { scope: "world", type: Boolean, default: true });

  register("controlledMountActions", {
    scope: "world",
    type: String,
    choices: {
      warn: L("controlledMountActions.Warn"),
      block: L("controlledMountActions.Block"),
      off: L("controlledMountActions.Off")
    },
    default: "warn"
  });

  register("fallSaves", {
    scope: "world",
    type: String,
    choices: {
      auto: L("fallSaves.Auto"),
      prompt: L("fallSaves.Prompt"),
      off: L("fallSaves.Off")
    },
    default: "auto"
  });

  register("removeProneOnSave", { scope: "world", type: Boolean, default: false });
  register("mountedCombatant", { scope: "world", type: Boolean, default: true });
  register("stackOrder", { scope: "world", type: Boolean, default: true });
  register("chatCards", { scope: "world", type: Boolean, default: true });

  register("autoShowHud", { scope: "client", type: Boolean, default: true });
  register("fanOut", { scope: "client", type: Boolean, default: true, onChange: onDisplayChange });
  register("riderScale", {
    scope: "client",
    type: Number,
    range: { min: 0.3, max: 1, step: 0.05 },
    default: 0.65,
    onChange: onDisplayChange
  });
  register("mountBadge", { scope: "client", type: Boolean, default: true, onChange: onDisplayChange });
  register("raisedOpacity", {
    scope: "client",
    type: Number,
    range: { min: 0.2, max: 1, step: 0.05 },
    default: 0.5,
    onChange: onDisplayChange
  });
  register("debug", { scope: "client", type: Boolean, default: false });
}
