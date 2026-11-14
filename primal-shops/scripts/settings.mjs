import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { emptyLists } from "./catalog.mjs";
import { ShopListsMenu } from "./apps/lists-editor.mjs";
import { ShopWindow } from "./apps/shop-window.mjs";

/** Register the module settings and the Shop Lists window. Called during the init hook. */
export function registerSettings() {
  const L = key => `PRIMAL_SHOPS.Settings.${key}`;
  const refresh = () => ShopWindow.refreshAll();

  game.settings.registerMenu(MODULE_ID, SETTINGS.listsMenu, {
    name: L("listsMenu.Name"),
    label: L("listsMenu.Label"),
    hint: L("listsMenu.Hint"),
    icon: "fa-solid fa-list-check",
    type: ShopListsMenu,
    restricted: true
  });

  game.settings.register(MODULE_ID, SETTINGS.sellRate, {
    name: L("sellRate.Name"),
    hint: L("sellRate.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 200, step: 5 },
    default: 50,
    onChange: refresh
  });

  game.settings.register(MODULE_ID, SETTINGS.sellApproval, {
    name: L("sellApproval.Name"),
    hint: L("sellApproval.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: refresh
  });

  game.settings.register(MODULE_ID, SETTINGS.buyApproval, {
    name: L("buyApproval.Name"),
    hint: L("buyApproval.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: refresh
  });

  game.settings.register(MODULE_ID, SETTINGS.playersCanSell, {
    name: L("playersCanSell.Name"),
    hint: L("playersCanSell.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: refresh
  });

  game.settings.register(MODULE_ID, SETTINGS.receipts, {
    name: L("receipts.Name"),
    hint: L("receipts.Hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      everyone: L("receipts.Everyone"),
      private: L("receipts.Private"),
      none: L("receipts.None")
    },
    default: "everyone"
  });

  game.settings.register(MODULE_ID, SETTINGS.gmDoubleClick, {
    name: L("gmDoubleClick.Name"),
    hint: L("gmDoubleClick.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.offersPopup, {
    name: L("offersPopup.Name"),
    hint: L("offersPopup.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  // What the GM picked in the New shop window last, to start from next time.
  game.settings.register(MODULE_ID, SETTINGS.newShop, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.lists, {
    scope: "world",
    config: false,
    type: Object,
    default: emptyLists(),
    onChange: refresh
  });
}
