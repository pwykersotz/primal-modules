/**
 * Ways into a shop:
 * - double-clicking a shop's token (anyone; a player doesn't need any permission on the shopkeeper). A GM opens the
 *   shop too (a setting), or the actor's sheet with Alt held.
 * - the Shop button on a token's HUD (GM), which also sets up a shop on any token that isn't one yet,
 * - the actor's entry in the Actors sidebar (GM): Open shop, Shop settings,
 * - macros: game.modules.get("primal-shops").api.open(actorOrToken).
 * - a shop's map pin (see apps/pin-layer.mjs), and the Shops here button in the token controls (everyone).
 * - New shop in the token controls (GM): a shop in two clicks, with no shopkeeper (see apps/quick-shop.mjs).
 */
import { MODULE_ID, SETTINGS, loc, setting } from "./constants.mjs";
import { isShop, shopActorOf } from "./store.mjs";
import { ShopWindow } from "./apps/shop-window.mjs";

const TOKEN_PROTO = "foundry.canvas.placeables.Token.prototype";

function shopOfToken(token) {
  const actor = shopActorOf(token?.document);
  return (actor && isShop(actor)) ? actor : null;
}

/** Players may double-click a shop's token though they can't see its actor (Foundry asks for Limited). */
function canView(wrapped, user, event, ...args) {
  if ( shopOfToken(this) && !user.isGM ) {
    if ( !this.layer?.active ) return false;
    if ( globalThis.canvas?.controls?.ruler?.active ) return false;
    return true;
  }
  return wrapped(user, event, ...args);
}

function opensSheet(event) {
  if ( !game.user.isGM ) return false;
  if ( setting(SETTINGS.gmDoubleClick) === false ) return true;
  const alt = event?.altKey ?? event?.nativeEvent?.altKey ?? false;
  return !!alt;
}

function onClickLeft2(wrapped, event, ...args) {
  const actor = shopOfToken(this);
  if ( !actor || opensSheet(event) ) return wrapped(event, ...args);
  if ( !this._propagateLeftClick?.(event) ) event?.stopPropagation?.();
  ShopWindow.open(actor, { token: this.document });
}

/** Wrap Token#_canView and Token#_onClickLeft2. Called once, in the setup hook, before any token is drawn. */
export function registerTokenClicks() {
  if ( globalThis.libWrapper ) {
    globalThis.libWrapper.register(MODULE_ID, `${TOKEN_PROTO}._canView`, canView, "MIXED");
    globalThis.libWrapper.register(MODULE_ID, `${TOKEN_PROTO}._onClickLeft2`, onClickLeft2, "MIXED");
    return;
  }
  const proto = foundry.canvas.placeables.Token.prototype;
  for ( const [name, fn] of [["_canView", canView], ["_onClickLeft2", onClickLeft2]] ) {
    const original = proto[name];
    if ( typeof original !== "function" ) {
      console.warn(`${MODULE_ID} | Could not find ${TOKEN_PROTO}.${name} to extend`);
      continue;
    }
    proto[name] = function(...args) {
      return fn.call(this, original.bind(this), ...args);
    };
  }
}

/** The Shop button on a token's HUD (GM): open the shop, or set one up. */
function onRenderTokenHUD(hud, html) {
  if ( !game.user.isGM ) return;
  const tokenDoc = hud?.object?.document;
  const actor = shopActorOf(tokenDoc);
  if ( !actor || actor.hasPlayerOwner ) return;
  const root = (html instanceof HTMLElement) ? html : (html?.[0] ?? hud.element);
  const col = root?.querySelector(".col.right") ?? root?.querySelector(".col.left");
  if ( !col || col.querySelector(".primal-shops-hud") ) return;
  const shop = isShop(actor);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `control-icon primal-shops-hud${shop ? " is-shop" : ""}`;
  button.dataset.action = "primalShop";
  button.dataset.tooltip = loc(shop ? "Hud.Open" : "Hud.Setup");
  button.setAttribute("aria-label", button.dataset.tooltip);
  button.innerHTML = '<i class="fa-solid fa-store" inert></i>';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if ( isShop(actor) ) ShopWindow.open(actor, { token: tokenDoc });
    else import("./apps/shop-config.mjs").then(({ ShopConfig }) => ShopConfig.open(actor, { setup: true, token: tokenDoc }));
  });
  col.append(button);
}

/** Open shop and Shop settings on the Actors sidebar's right-click menu (GM). */
function onActorContext(app, options) {
  const actorOf = li => game.actors.get(li?.closest?.("[data-entry-id]")?.dataset?.entryId ?? li?.dataset?.entryId);
  options.push({
    label: "PRIMAL_SHOPS.Context.Open",
    icon: "fa-solid fa-store",
    visible: li => game.user.isGM && isShop(actorOf(li)),
    onClick: (event, li) => ShopWindow.open(actorOf(li))
  }, {
    label: "PRIMAL_SHOPS.Context.Settings",
    icon: "fa-solid fa-store",
    visible: li => game.user.isGM && !!actorOf(li),
    onClick: (event, li) => import("./apps/shop-config.mjs").then(({ ShopConfig }) => ShopConfig.open(actorOf(li), { setup: !isShop(actorOf(li)) }))
  });
}

/** In the token controls: Shops here (everyone), the shops on the scene shown; New shop (GM). */
function onGetSceneControlButtons(controls) {
  const tokens = controls?.tokens ?? (Array.isArray(controls) ? controls.find(c => c.name === "token") : null);
  if ( !tokens ) return;
  const tools = [{
    name: "primalShopsHere",
    title: "PRIMAL_SHOPS.Here.Button",
    icon: "fa-solid fa-shop",
    button: true,
    visible: true,
    order: 60,
    onChange: () => import("./apps/shops-here.mjs").then(({ ShopsHere }) => ShopsHere.open())
  }, {
    name: "primalShopsNew",
    title: "PRIMAL_SHOPS.New.Button",
    icon: "fa-solid fa-bookmark",
    button: true,
    visible: !!game.user?.isGM,
    order: 61,
    onChange: () => import("./apps/quick-shop.mjs").then(({ openNewShop }) => openNewShop())
  }];
  for ( const tool of tools ) {
    if ( Array.isArray(tokens.tools) ) tokens.tools.push(tool);
    else if ( tokens.tools ) tokens.tools[tool.name] = tool;
  }
}

export function registerControls() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
  Hooks.on("getActorContextOptions", onActorContext);
  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
}
