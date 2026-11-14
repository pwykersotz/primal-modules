/**
 * Shops' ribbons: a shop hung from the top of the screen while a scene is shown, for when it shouldn't be anywhere on
 * the map. Each ribbon has the shop's name written down it, in the shop's colors.
 * - Everyone: click a revealed ribbon to open its shop. A closed shop says so instead.
 * - The GM: sees hidden ribbons faded; right-clicks one to reveal or hide it, open the shop or its settings, move it
 *   along, or take it down.
 */
import { MODULE_ID, escapeHTML as e, loc, newId } from "../constants.mjs";
import { addRibbon, moveRibbon, removeRibbon, updateRibbon, visibleRibbons } from "../pins.mjs";
import { getRibbons, getShop, isShop, saveRibbons, shopName } from "../store.mjs";
import { RIBBON_COLORS } from "../shop.mjs";
import { closeMenu, openMenu, openShopHere } from "./pin-layer.mjs";

const ROOT_ID = "primal-shops-ribbons";
const DialogV2 = () => foundry.applications.api.DialogV2;
const hasDOM = () => !!(globalThis.HTMLElement && globalThis.document?.createElement);

/* -------------------------------------------- */
/*  Drawing                                     */
/* -------------------------------------------- */

/** The strip the ribbons hang in: in Foundry's interface (so it hides with it), else the page. */
function rootElement() {
  const parent = document.getElementById("interface") ?? document.body;
  let root = document.getElementById(ROOT_ID);
  if ( !root ) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "primal-shops-ribbons";
    listen(root);
  }
  if ( root.parentElement !== parent ) parent.append(root);
  return root;
}

/** Keep the strip at the top right of the space between the scene controls and the sidebar. */
export function placeStrip(root=globalThis.document?.getElementById(ROOT_ID)) {
  if ( !root ) return;
  const side = document.getElementById("ui-right") ?? document.getElementById("sidebar");
  const left = side?.getBoundingClientRect?.().left;
  const gap = (Number.isFinite(left) && (left > 0) && (left < window.innerWidth)) ? (window.innerWidth - left) : 0;
  root.style.setProperty("--ps-ribbons-right", `${Math.round(gap + 16)}px`);
}

const isShopId = id => isShop(game.actors?.get(id));

/** How many tokens the GM has selected (that aren't players'), to link to a shop. */
const selected = () => (globalThis.canvas?.tokens?.controlled ?? []).filter(t => !(t.document ?? t).actor?.hasPlayerOwner).length;

/** Hang the ribbons of the scene shown, as this user sees them. */
export function drawRibbons() {
  if ( !hasDOM() ) return;
  const scene = globalThis.canvas?.scene ?? null;
  if ( !scene ) {
    document.getElementById(ROOT_ID)?.replaceChildren();
    return;
  }
  const root = rootElement();
  const isGM = !!game.user?.isGM;
  root.innerHTML = visibleRibbons(getRibbons(scene), { isGM, isShop: isShopId }).map(r => ribbonHTML(r, isGM)).join("");
  placeStrip(root);
}

/** A ribbon's look: the shop's colors (a shop that's gone: grey). */
export function ribbonStyle(shop) {
  const c = shop?.ribbon ?? { color: "#555a63", trim: "#d8d2c6" };
  return `--ps-ribbon: ${c.color || RIBBON_COLORS.color}; --ps-ribbon-trim: ${c.trim || RIBBON_COLORS.trim};`;
}

/** A ribbon's inside: the name written down it, and a seal at the foot (a store, a lock when closed). */
export function ribbonInner(name, { icon="fa-store" }={}) {
  return `
    <span class="ps-ribbon-body">
      <span class="ps-ribbon-name">${e(name)}</span>
      <span class="ps-ribbon-seal"><i class="fa-solid ${icon}" inert></i></span>
    </span>`;
}

function ribbonHTML(ribbon, isGM) {
  const actor = game.actors?.get(ribbon.actor) ?? null;
  const shop = (actor && isShop(actor)) ? getShop(actor) : null;
  const name = shop ? shopName(actor, shop) : (actor?.name ?? loc("Pins.Missing"));
  const closed = !!shop && !shop.open;
  const hidden = isGM && !ribbon.revealed;
  // Our own class names: Foundry's "hidden" would hide it outright.
  const classes = ["ps-ribbon", ribbon.revealed ? "ps-revealed" : "ps-hidden", closed ? "ps-closed" : "", shop ? "" : "ps-missing"];
  const icon = hidden ? "fa-eye-slash" : (closed ? "fa-lock" : "fa-store");
  return `
  <div class="${classes.filter(Boolean).join(" ")}" data-ribbon="${e(ribbon.id)}" style="${ribbonStyle(shop)}"
    role="button" tabindex="0" aria-label="${e(name)}">${ribbonInner(name, { icon })}
  </div>`;
}

/* -------------------------------------------- */
/*  Opening, and the GM's ribbons               */
/* -------------------------------------------- */

/** Open the shop of a ribbon on the scene shown. */
export function openRibbon(id) {
  const ribbon = getRibbons(globalThis.canvas?.scene).find(r => r.id === id);
  if ( !ribbon ) return null;
  if ( !game.user.isGM && !ribbon.revealed ) return null;
  return openShopHere(game.actors?.get(ribbon.actor));
}

/** Hang a ribbon for a shop on a scene (GM): hidden from players until revealed. One per shop on a scene. */
export async function placeRibbon(actor, scene=globalThis.canvas?.scene) {
  if ( !game.user.isGM || !actor ) return null;
  if ( !scene ) {
    ui.notifications.warn(loc("Pins.NoScene"));
    return null;
  }
  const name = shopName(actor);
  const had = getRibbons(scene).find(r => r.actor === actor.id);
  if ( had ) {
    ui.notifications.info(loc("Ribbons.Already", { name }));
    return had;
  }
  const id = newId();
  await saveRibbons(scene, addRibbon(getRibbons(scene), { id, actor: actor.id }));
  ui.notifications.info(loc("Ribbons.Placed", { name }));
  return getRibbons(scene).find(r => r.id === id) ?? null;
}

async function ribbonAction(id, action) {
  const scene = globalThis.canvas?.scene;
  const ribbon = getRibbons(scene).find(r => r.id === id);
  if ( !ribbon ) return;
  const actor = game.actors?.get(ribbon.actor) ?? null;
  switch ( action ) {
    case "reveal":
      return saveRibbons(scene, updateRibbon(getRibbons(scene), id, { revealed: !ribbon.revealed }));
    case "open":
      return openShopHere(actor);
    case "settings": {
      if ( !actor ) return;
      const { ShopConfig } = await import("./shop-config.mjs");
      return ShopConfig.open(actor);
    }
    case "link": {
      const { linkSelected } = await import("./quick-shop.mjs");
      return actor ? linkSelected(actor) : null;
    }
    case "left":
      return saveRibbons(scene, moveRibbon(getRibbons(scene), id, -1));
    case "right":
      return saveRibbons(scene, moveRibbon(getRibbons(scene), id, 1));
    case "remove": {
      const ok = await DialogV2().confirm({
        window: { title: loc("Ribbons.Remove"), icon: "fa-solid fa-trash" },
        content: `<p>${e(loc("Ribbons.RemoveConfirm", { name: actor ? shopName(actor) : loc("Pins.Missing") }))}</p>`,
        rejectClose: false
      });
      if ( ok ) return saveRibbons(scene, removeRibbon(getRibbons(scene), id));
    }
  }
}

function showMenu(id, event) {
  const ribbons = getRibbons(globalThis.canvas?.scene);
  const at = ribbons.findIndex(r => r.id === id);
  if ( at < 0 ) return;
  const ribbon = ribbons[at];
  const actor = game.actors?.get(ribbon.actor) ?? null;
  const items = [
    { action: "reveal", icon: ribbon.revealed ? "fa-eye-slash" : "fa-eye", label: loc(ribbon.revealed ? "Pins.Hide" : "Pins.Reveal") },
    (actor && isShop(actor)) ? { action: "open", icon: "fa-store", label: loc("Pins.Open") } : null,
    actor ? { action: "settings", icon: "fa-palette", label: loc("Ribbons.Settings") } : null,
    (at > 0) ? { action: "left", icon: "fa-arrow-left", label: loc("Ribbons.Left") } : null,
    (at < ribbons.length - 1) ? { action: "right", icon: "fa-arrow-right", label: loc("Ribbons.Right") } : null,
    (actor && isShop(actor) && selected()) ? { action: "link", icon: "fa-link", label: loc("Link.Selected", { n: selected() }) } : null,
    { action: "remove", icon: "fa-trash", label: loc("Ribbons.Remove"), danger: true }
  ].filter(Boolean);
  openMenu(event, items, action => ribbonAction(id, action)).dataset.ribbon = id;
}

function listen(root) {
  const ribbonOf = event => event.target?.closest?.(".ps-ribbon");
  root.addEventListener("click", event => {
    const el = ribbonOf(event);
    if ( !el ) return;
    event.preventDefault();
    openRibbon(el.dataset.ribbon);
  });
  root.addEventListener("keydown", event => {
    const el = ribbonOf(event);
    if ( !el || !["Enter", " "].includes(event.key) ) return;
    event.preventDefault();
    openRibbon(el.dataset.ribbon);
  });
  root.addEventListener("contextmenu", event => {
    const el = ribbonOf(event);
    if ( !el ) return;
    event.preventDefault();
    event.stopPropagation();
    if ( game.user.isGM ) showMenu(el.dataset.ribbon, event);
  });
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/** Hang the ribbons as scenes are shown and change. Called once the game is ready. */
export function registerRibbons() {
  Hooks.on("canvasReady", () => drawRibbons());
  Hooks.on("canvasTearDown", () => {
    closeMenu();
    globalThis.document?.getElementById(ROOT_ID)?.replaceChildren();
  });
  Hooks.on("updateScene", (scene, changes) => {
    if ( (scene === globalThis.canvas?.scene) && foundry.utils.hasProperty(changes ?? {}, `flags.${MODULE_ID}`) ) drawRibbons();
  });
  // A shop renamed, opened or closed, or given new colors.
  Hooks.on("updateActor", actor => {
    if ( getRibbons(globalThis.canvas?.scene).some(r => r.actor === actor.id) ) drawRibbons();
  });
  Hooks.on("deleteActor", () => drawRibbons());
  // The sidebar opened or closed: keep clear of it.
  const follow = () => {
    placeStrip();
    setTimeout(() => placeStrip(), 400);
  };
  Hooks.on("collapseSidebar", follow);
  globalThis.window?.addEventListener?.("resize", () => placeStrip());
  if ( hasDOM() && globalThis.ResizeObserver ) {
    const side = document.getElementById("ui-right") ?? document.getElementById("sidebar");
    if ( side ) new ResizeObserver(() => placeStrip()).observe(side);
  }
  if ( globalThis.canvas?.ready || globalThis.canvas?.scene ) drawRibbons();
}
