import { FLAGS, MODULE_ID } from "./constants.mjs";
import { mergeLists, readImport } from "./catalog.mjs";
import { parsePrice } from "./money.mjs";
import { registerSettings } from "./settings.mjs";
import { registerSocket } from "./gm.mjs";
import { registerControls, registerTokenClicks } from "./controls.mjs";
import { WORLD, clearSourceCache } from "./sources.mjs";
import { getLists, getShop, getState, isShop, rates, saveLists, saveShop, shopActorOf } from "./store.mjs";
import { restockShop, stockAfterChange } from "./trade.mjs";
import { ShopWindow } from "./apps/shop-window.mjs";
import { ShopConfig } from "./apps/shop-config.mjs";
import { OffersWindow } from "./apps/offers-window.mjs";
import { ShopListsEditor } from "./apps/lists-editor.mjs";
import { drawPins, openPin, placePin, registerPins, revealAllHere } from "./apps/pin-layer.mjs";
import { ShopsHere, registerShopsHere } from "./apps/shops-here.mjs";
import { drawRibbons, openRibbon, placeRibbon, registerRibbons } from "./apps/ribbons.mjs";

export function init() {
  registerSettings();
  registerControls();
}

/** Before any token is drawn: double-clicking a shop's token opens the shop. */
export function setup() {
  registerTokenClicks();
}

export function ready() {
  registerSocket();
  ShopWindow.listen();
  registerPins();
  registerRibbons();
  registerShopsHere();

  Hooks.on("updateActor", (actor, changes) => {
    ShopWindow.refreshFor(actor);
    if ( foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) || foundry.utils.hasProperty(changes, `flags.-=${MODULE_ID}`) ) {
      OffersWindow.refresh();
    }
  });
  // Items coming and going on a trader (their inventory) or a shopkeeper (what they sell of their own).
  const onItem = item => {
    if ( item.parent?.documentName === "Actor" ) ShopWindow.refreshFor(item.parent);
    else if ( !item.parent && !item.pack ) clearSourceCache(WORLD);
  };
  Hooks.on("createItem", onItem);
  Hooks.on("updateItem", onItem);
  Hooks.on("deleteItem", onItem);
  // Tokens moving, coming and going, or another scene shown (a shop's range).
  Hooks.on("updateToken", (tokenDoc, changes) => {
    if ( ("x" in changes) || ("y" in changes) ) ShopWindow.refreshAll();
  });
  Hooks.on("updateScene", (scene, changes) => {
    if ( (scene === globalThis.canvas?.scene) && foundry.utils.hasProperty(changes ?? {}, `flags.${MODULE_ID}`) ) ShopWindow.refreshAll();
  });
  Hooks.on("createToken", () => ShopWindow.refreshAll());
  Hooks.on("deleteToken", () => ShopWindow.refreshAll());
  Hooks.on("canvasReady", () => ShopWindow.refreshAll());
  Hooks.on("deleteActor", () => OffersWindow.refresh());

  const module = game.modules.get(MODULE_ID);
  console.log(`${MODULE_ID} | ${module?.version ?? ""} ready`);
  if ( !module ) return;
  module.api = {
    /** Open a shop (an Actor, Token or TokenDocument). A GM opens the shop settings for one that isn't a shop yet. */
    open: (target, options) => ShopWindow.open(target, options),

    /** Open a shop's settings (GM), or set one up. */
    config: target => ShopConfig.open(target),

    /** Is this actor (or token) a shop? */
    isShop: target => isShop(shopActorOf(target)),

    /** A shop's settings and what it has now. */
    shop: target => {
      const actor = shopActorOf(target);
      return (actor && isShop(actor)) ? { settings: getShop(actor), state: getState(actor) } : null;
    },

    /**
     * Make an actor (or token's actor) a shop (GM), or change one: settings as in the Shop settings window, e.g.
     * { lists: ["<list id>"], level: 2, markup: 10, random: { enabled: true, counts: { common: 4 } } }.
     */
    makeShop: async (target, settings={}) => {
      const actor = shopActorOf(target);
      if ( !game.user.isGM || !actor ) return null;
      const before = getShop(actor);
      await saveShop(actor, { ...before, ...settings, enabled: true });
      await stockAfterChange(actor, { reroll: true });
      return getShop(actor);
    },

    /** Restock a shop (GM): every limited item back to its full stock. reroll: a new random pick too. */
    restock: (target, { reroll=false }={}) => {
      const actor = shopActorOf(target);
      if ( !game.user.isGM || !actor || !isShop(actor) ) return null;
      return restockShop(actor, { reroll });
    },

    /** The shop lists as they are now. */
    lists: () => getLists(),

    /** A shop list by name or id. */
    list: nameOrId => getLists().lists.find(l => (l.id === nameOrId) || (l.name === nameOrId)) ?? null,

    /** Import shop lists from JSON (a string or an object), merged into the ones there, or replacing them (GM). */
    importLists: async (json, { replace=false }={}) => {
      const r = rates();
      const { lists, counts } = mergeLists(getLists(), readImport(json, t => parsePrice(t, r)), replace ? "replace" : "merge");
      await saveLists(lists);
      return counts;
    },

    /** The windows, for macros. */
    openLists: listId => ShopListsEditor.openTo(listId ?? null),
    openOffers: () => OffersWindow.open(),
    shopsHere: () => ShopsHere.open(),

    /** Map pins (GM): put one for a shop on the scene shown ({x, y}: where; the middle of the view if left out). */
    placePin: (target, point) => placePin(shopActorOf(target), point),
    /** Ribbons (GM): hang one for a shop at the top of the screen while the scene shown is shown, hidden. */
    placeRibbon: target => placeRibbon(shopActorOf(target)),
    /** Open the shop of a ribbon on the scene shown, by the ribbon's id. */
    openRibbon: id => openRibbon(id),
    /** New shop (GM): the window, or a shop made at once ({ name, lists, level, place, reveal, tokens }). */
    newShop: () => import("./apps/quick-shop.mjs").then(m => m.openNewShop()),
    createShop: options => import("./apps/quick-shop.mjs").then(m => m.createShop(options)),
    /** Make tokens open a shop when double-clicked, whatever their own actor (GM). */
    linkTokens: (target, tokens) => import("./apps/quick-shop.mjs").then(m => m.linkTokens(shopActorOf(target), tokens)),
    /** Reveal (or hide, with false) every shop pin and ribbon on the scene shown (GM). */
    revealPins: (revealed=true) => revealAllHere(revealed),
    /** Open the shop of a pin on the scene shown, by the pin's id. */
    openPin: id => openPin(id),
    /** Draw the pins again. */
    drawPins: () => {
      drawPins();
      drawRibbons();
    },

    /** Flag keys, for other modules. */
    flags: { ...FLAGS }
  };
}

Hooks.once("init", init);
Hooks.once("setup", setup);
Hooks.once("ready", ready);
