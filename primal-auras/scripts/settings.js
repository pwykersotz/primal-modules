import { MODULE_ID, localize } from "./constants.js";
import { DEFAULT_PRESETS } from "./presets.js";

/**
 * @param {object} hooks
 * @param {Function} hooks.onDisplayChange      Redraw auras
 * @param {Function} hooks.onAutomationChange   Re-run or clean up automation
 * @param {Function} hooks.presetManagerClass   Application class for the preset library menu
 */
export function registerSettings({ onDisplayChange, onAutomationChange, presetManagerClass }) {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, data);
  const L = k => `PRIMAL_AURAS.Settings.${k}`;

  game.settings.registerMenu(MODULE_ID, "presetLibrary", {
    name: L("Library.Name"),
    label: L("Library.Label"),
    hint: L("Library.Hint"),
    icon: "fa-solid fa-book",
    type: presetManagerClass,
    restricted: true
  });

  reg("legacyMigrated", {
    scope: "world", config: false, type: Boolean, default: false
  });

  reg("presets", {
    scope: "world", config: false, type: Array,
    default: foundry.utils.deepClone(DEFAULT_PRESETS)
  });

  reg("showAuras", {
    name: L("ShowAuras.Name"), hint: L("ShowAuras.Hint"),
    scope: "client", config: true, type: Boolean, default: true,
    onChange: onDisplayChange
  });

  reg("defaultShape", {
    name: L("DefaultShape.Name"), hint: L("DefaultShape.Hint"),
    scope: "world", config: true, type: String, default: "circle",
    choices: { circle: "PRIMAL_AURAS.Shape.circle", grid: "PRIMAL_AURAS.Shape.grid" }
  });

  reg("shapeOverride", {
    name: L("ShapeOverride.Name"), hint: L("ShapeOverride.Hint"),
    scope: "world", config: true, type: String, default: "none",
    choices: { none: "PRIMAL_AURAS.Shape.none", circle: "PRIMAL_AURAS.Shape.circle", grid: "PRIMAL_AURAS.Shape.grid" },
    onChange: () => { onDisplayChange(); onAutomationChange(true); }
  });

  reg("targetInclusion", {
    name: L("TargetInclusion.Name"), hint: L("TargetInclusion.Hint"),
    scope: "world", config: true, type: String, default: "any",
    choices: { any: L("TargetInclusion.any"), center: L("TargetInclusion.center") },
    onChange: () => onAutomationChange(true)
  });

  reg("passThrough", {
    name: L("PassThrough.Name"), hint: L("PassThrough.Hint"),
    scope: "world", config: true, type: Boolean, default: true
  });

  reg("considerElevation", {
    name: L("ConsiderElevation.Name"), hint: L("ConsiderElevation.Hint"),
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => onAutomationChange(true)
  });

  reg("automation", {
    name: L("Automation.Name"), hint: L("Automation.Hint"),
    scope: "world", config: true, type: Boolean, default: true,
    onChange: value => onAutomationChange(!!value)
  });

  reg("ignoreDefeated", {
    name: L("IgnoreDefeated.Name"), hint: L("IgnoreDefeated.Hint"),
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => onAutomationChange(true)
  });

  reg("playerSaves", {
    name: L("PlayerSaves.Name"), hint: L("PlayerSaves.Hint"),
    scope: "world", config: true, type: Boolean, default: true
  });

  reg("saveTimeout", {
    name: L("SaveTimeout.Name"), hint: L("SaveTimeout.Hint"),
    scope: "world", config: true, type: Number, default: 30,
    range: { min: 5, max: 120, step: 5 }
  });

  reg("autoExpire", {
    name: L("AutoExpire.Name"), hint: L("AutoExpire.Hint"),
    scope: "world", config: true, type: Boolean, default: true
  });

  reg("chatMode", {
    name: L("ChatMode.Name"), hint: L("ChatMode.Hint"),
    scope: "world", config: true, type: String, default: "public",
    choices: { public: L("ChatMode.public"), gm: L("ChatMode.gm"), none: L("ChatMode.none") }
  });

  reg("genericSaveFormula", {
    name: L("GenericSave.Name"), hint: L("GenericSave.Hint"),
    scope: "world", config: true, type: String, default: "1d20 + @abilities.{ability}.mod"
  });

  reg("genericHpPath", {
    name: L("GenericHp.Name"), hint: L("GenericHp.Hint"),
    scope: "world", config: true, type: String, default: "system.attributes.hp.value"
  });
}

export function registerKeybindings({ onDisplayChange }) {
  game.keybindings.register(MODULE_ID, "toggleDisplay", {
    name: "PRIMAL_AURAS.Keybindings.Toggle.Name",
    hint: "PRIMAL_AURAS.Keybindings.Toggle.Hint",
    editable: [],
    onDown: () => {
      const next = !game.settings.get(MODULE_ID, "showAuras");
      game.settings.set(MODULE_ID, "showAuras", next);
      ui.notifications.info(localize(next ? "PRIMAL_AURAS.Notify.DisplayOn" : "PRIMAL_AURAS.Notify.DisplayOff"));
      return true;
    }
  });

  game.keybindings.register(MODULE_ID, "cycleShape", {
    name: "PRIMAL_AURAS.Keybindings.CycleShape.Name",
    hint: "PRIMAL_AURAS.Keybindings.CycleShape.Hint",
    editable: [],
    restricted: true,
    onDown: () => {
      const order = ["none", "circle", "grid"];
      const cur = game.settings.get(MODULE_ID, "shapeOverride");
      const next = order[(order.indexOf(cur) + 1) % order.length];
      game.settings.set(MODULE_ID, "shapeOverride", next);
      ui.notifications.info(localize("PRIMAL_AURAS.Notify.ShapeOverride", { shape: localize(`PRIMAL_AURAS.Shape.${next}`) }));
      return true;
    }
  });
}
