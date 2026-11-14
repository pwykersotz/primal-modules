import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { onButtonSettingsChanged } from "./buttons.mjs";
import { HudButtonsConfig } from "./apps/buttons-config.mjs";
import { onSidebarScaleChanged } from "./sidebar.mjs";
import { onLayoutChanged } from "./layout.mjs";
import { HudLayoutConfig } from "./apps/layout-config.mjs";

/**
 * Register the module settings. Called during the init hook.
 */
export function registerSettings() {
  const L = key => `PRIMAL_HUD.Settings.${key}`;

  // Which Token HUD buttons are shown. Open to players: every user picks their own.
  game.settings.registerMenu(MODULE_ID, "buttonsMenu", {
    name: L("buttonsMenu.Name"),
    label: L("buttonsMenu.Label"),
    hint: L("buttonsMenu.Hint"),
    icon: "fa-solid fa-table-cells",
    type: HudButtonsConfig,
    restricted: false
  });

  // Where each Token HUD button sits. Also open to players, each arranging their own HUD.
  game.settings.registerMenu(MODULE_ID, "layoutMenu", {
    name: L("layoutMenu.Name"),
    label: L("layoutMenu.Label"),
    hint: L("layoutMenu.Hint"),
    icon: "fa-solid fa-arrows-left-right",
    type: HudLayoutConfig,
    restricted: false
  });

  // Stored per user (not per browser), so a player's choices follow them to any device.
  game.settings.register(MODULE_ID, SETTINGS.hiddenButtons, {
    scope: "user",
    config: false,
    type: Array,
    default: [],
    onChange: () => onButtonSettingsChanged()
  });

  game.settings.register(MODULE_ID, SETTINGS.knownButtons, {
    scope: "user",
    config: false,
    type: Array,
    default: []
  });

  // The arrangement from the window above: {left: [ids], right: [ids]}, or {} for Foundry's own.
  game.settings.register(MODULE_ID, SETTINGS.buttonLayout, {
    scope: "user",
    config: false,
    type: Object,
    default: {},
    onChange: () => onLayoutChanged()
  });

  game.settings.register(MODULE_ID, SETTINGS.hpCombineDelay, {
    name: L(`${SETTINGS.hpCombineDelay}.Name`),
    hint: L(`${SETTINGS.hpCombineDelay}.Hint`),
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 1500, step: 50 },
    default: 400
  });

  // Stops a double right-click on a token from opening Token Config (token-clicks.mjs). Read on every click,
  // so changing it needs no reload. Stored per user, like the HUD button choices.
  game.settings.register(MODULE_ID, SETTINGS.disableConfigDoubleClick, {
    name: L(`${SETTINGS.disableConfigDoubleClick}.Name`),
    hint: L(`${SETTINGS.disableConfigDoubleClick}.Hint`),
    scope: "user",
    config: true,
    type: Boolean,
    default: true
  });

  // How big the favorites and spells panel is on screen, per browser (screens differ). 100 is the normal size.
  game.settings.register(MODULE_ID, SETTINGS.sidebarSize, {
    name: L(`${SETTINGS.sidebarSize}.Name`),
    hint: L(`${SETTINGS.sidebarSize}.Hint`),
    scope: "client",
    config: true,
    type: Number,
    range: { min: 40, max: 250, step: 5 },
    default: 100,
    onChange: () => onSidebarScaleChanged()
  });

  // The favorites and spells panel remembers its open tab and whether it is folded away, per browser.
  game.settings.register(MODULE_ID, SETTINGS.sidebarTab, {
    scope: "client",
    config: false,
    type: String,
    default: "favorites"
  });

  game.settings.register(MODULE_ID, SETTINGS.sidebarCollapsed, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });
}
