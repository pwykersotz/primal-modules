import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { emptyTables } from "./tables.mjs";
import { HarvestTablesEditor } from "./apps/tables-editor.mjs";
import { HarvestRulesEditor } from "./apps/rules-editor.mjs";
import { HarvestWindow } from "./apps/harvest-window.mjs";

/** Register the module settings and the two GM windows. Called during the init hook. */
export function registerSettings() {
  const L = key => `PRIMAL_HARVESTING.Settings.${key}`;

  game.settings.registerMenu(MODULE_ID, SETTINGS.tablesMenu, {
    name: L("tablesMenu.Name"),
    label: L("tablesMenu.Label"),
    hint: L("tablesMenu.Hint"),
    icon: "fa-solid fa-table-list",
    type: HarvestTablesEditor,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, SETTINGS.rulesMenu, {
    name: L("rulesMenu.Name"),
    label: L("rulesMenu.Label"),
    hint: L("rulesMenu.Hint"),
    icon: "fa-solid fa-scale-balanced",
    type: HarvestRulesEditor,
    restricted: true
  });

  game.settings.register(MODULE_ID, SETTINGS.playersCanHarvest, {
    name: L("playersCanHarvest.Name"),
    hint: L("playersCanHarvest.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.deadOnly, {
    name: L("deadOnly.Name"),
    hint: L("deadOnly.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.offerInChat, {
    name: L("offerInChat.Name"),
    hint: L("offerInChat.Hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      combat: L("offerInChat.Combat"),
      death: L("offerInChat.Death"),
      never: L("offerInChat.Never")
    },
    default: "combat"
  });

  game.settings.register(MODULE_ID, SETTINGS.addItems, {
    name: L("addItems.Name"),
    hint: L("addItems.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.advanceTime, {
    name: L("advanceTime.Name"),
    hint: L("advanceTime.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.shareWindow, {
    name: L("shareWindow.Name"),
    hint: L("shareWindow.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.requireApproval, {
    name: L("requireApproval.Name"),
    hint: L("requireApproval.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => HarvestWindow.refreshAll()
  });

  game.settings.register(MODULE_ID, SETTINGS.splash, {
    name: L("splash.Name"),
    hint: L("splash.Hint"),
    scope: "user",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.showRollDialogs, {
    name: L("showRollDialogs.Name"),
    hint: L("showRollDialogs.Hint"),
    scope: "user",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.tables, {
    scope: "world",
    config: false,
    type: Object,
    default: emptyTables(),
    onChange: () => HarvestWindow.refreshAll()
  });

  // Saved rules are only what the GM changed; anything missing is the book's (see normalizeRules), worked out when
  // it's read, so the world's own skills (Artifice) are known by then.
  game.settings.register(MODULE_ID, SETTINGS.rules, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => HarvestWindow.refreshAll()
  });
}
