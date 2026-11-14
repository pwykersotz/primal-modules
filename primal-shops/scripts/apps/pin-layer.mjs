/**
 * Shops' map pins on the canvas, drawn as HTML over the map in Foundry's heads-up display (which follows the canvas as
 * it pans and zooms), so they can be double-clicked whichever tool is in use.
 * - Everyone: double-click a revealed pin to open its shop. A closed shop says so instead.
 * - The GM: sees hidden pins faded; drags a pin to move it; right-clicks it to reveal or hide it, set its range, open
 *   the shop or its settings, or remove it. Dropping a shop's actor on the map asks whether to make a token, a pin or
 *   a ribbon (see ribbons.mjs).
 */
import { MODULE_ID, escapeHTML as e, loc, newId } from "../constants.mjs";
import { addPin, removePin, revealAll, revealAllRibbons, updatePin, visiblePins } from "../pins.mjs";
import { getPins, getRibbons, getShop, isShop, savePins, saveRibbons, shopName } from "../store.mjs";
import { ShopWindow } from "./shop-window.mjs";

const ROOT_ID = "primal-shops-pins";
const DialogV2 = () => foundry.applications.api.DialogV2;

/** The right-click menu open now. */
let menu = null;
/** A pin being dragged: { el, pin, startX, startY, x, y, moved }. */
let drag = null;

/* -------------------------------------------- */
/*  Drawing                                     */
/* -------------------------------------------- */

/**
 * The element pins are drawn in: in Foundry's heads-up display, which is laid over the canvas and follows it; else
 * one of our own, kept over the canvas as it pans.
 */
function rootElement() {
  const hud = globalThis.canvas?.hud?.element;
  const parent = (hud instanceof HTMLElement) ? hud : document.body;
  let root = document.getElementById(ROOT_ID);
  if ( !root ) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "primal-shops-pins";
    listen(root);
  }
  if ( root.parentElement !== parent ) parent.append(root);
  root.classList.toggle("ps-pins-own", parent === document.body);
  align(root);
  return root;
}

/** Our own layer (no heads-up display to draw in): put it over the canvas, panned and zoomed as the canvas is. */
function align(root=globalThis.document?.getElementById(ROOT_ID)) {
  if ( !root?.classList.contains("ps-pins-own") || !globalThis.canvas?.clientCoordinatesFromCanvas ) return;
  const origin = canvas.clientCoordinatesFromCanvas({ x: 0, y: 0 });
  const scale = canvas.stage?.scale?.x ?? 1;
  Object.assign(root.style, { left: `${origin.x}px`, top: `${origin.y}px`, transform: `scale(${scale})` });
}

const isShopId = id => isShop(game.actors?.get(id));

/** How many tokens the GM has selected (that aren't players'), to link to a shop. */
const selectedCount = () => (globalThis.canvas?.tokens?.controlled ?? []).filter(t => !(t.document ?? t).actor?.hasPlayerOwner).length;

/** Draw the pins of the scene shown, as this user sees them. */
export function drawPins() {
  if ( !globalThis.HTMLElement || !globalThis.document?.createElement ) return;
  const scene = globalThis.canvas?.scene ?? null;
  if ( !scene ) {
    document.getElementById(ROOT_ID)?.replaceChildren();
    return;
  }
  const root = rootElement();
  const isGM = !!game.user?.isGM;
  const pins = visiblePins(getPins(scene), { isGM, isShop: isShopId });
  const grid = scene.grid?.size ?? canvas.grid?.size ?? 100;
  root.style.setProperty("--ps-pin-size", `${Math.round(grid * 0.8)}px`);
  root.innerHTML = pins.map(p => pinHTML(p, isGM)).join("");
}

function pinHTML(pin, isGM) {
  const actor = game.actors?.get(pin.actor) ?? null;
  const shop = (actor && isShop(actor)) ? getShop(actor) : null;
  const name = shop ? shopName(actor, shop) : (actor?.name ?? loc("Pins.Missing"));
  // Our own class names: Foundry's "hidden" class (and others like it) would hide the pin outright.
  const classes = ["ps-pin", pin.revealed ? "ps-revealed" : "ps-hidden", (shop && !shop.open) ? "ps-closed" : "", shop ? "" : "ps-missing"];
  return `
  <div class="${classes.filter(Boolean).join(" ")}" data-pin="${e(pin.id)}" style="left: ${pin.x}px; top: ${pin.y}px;"
    role="button" aria-label="${e(name)}">
    <img src="${e(actor?.img || "icons/svg/item-bag.svg")}" alt="" draggable="false">
    ${(isGM && !pin.revealed) ? '<i class="fa-solid fa-eye-slash ps-pin-badge" inert></i>' : ""}
    ${(shop && !shop.open) ? '<i class="fa-solid fa-lock ps-pin-badge ps-pin-lock" inert></i>' : ""}
    <span class="ps-pin-label">${e(name)}</span>
  </div>`;
}

/* -------------------------------------------- */
/*  Opening a shop from the map                 */
/* -------------------------------------------- */

/** Open a shop from the map (a pin, or the Shops here list). A player finds a closed shop closed. */
export function openShopHere(actor) {
  if ( !actor || !isShop(actor) ) {
    ui.notifications.warn(loc("Errors.NoShop"));
    return null;
  }
  const shop = getShop(actor);
  if ( !game.user.isGM && !shop.open ) {
    ui.notifications.info(loc("Pins.Closed", { name: shopName(actor, shop) }));
    return null;
  }
  return ShopWindow.open(actor);
}

/** Open the shop of a pin on the scene shown. */
export function openPin(id) {
  const pin = getPins(globalThis.canvas?.scene).find(p => p.id === id);
  if ( !pin ) return null;
  if ( !game.user.isGM && !pin.revealed ) return null;
  return openShopHere(game.actors?.get(pin.actor));
}

/* -------------------------------------------- */
/*  The GM's pins                               */
/* -------------------------------------------- */

/** The middle of the view, in the scene's pixels. */
export function viewCenter() {
  const view = globalThis.window ?? { innerWidth: 0, innerHeight: 0 };
  const point = globalThis.canvas?.canvasCoordinatesFromClient?.({ x: view.innerWidth / 2, y: view.innerHeight / 2 });
  if ( point && Number.isFinite(point.x) ) return { x: point.x, y: point.y };
  const d = globalThis.canvas?.dimensions;
  return { x: (d?.width ?? 0) / 2, y: (d?.height ?? 0) / 2 };
}

/** Put a pin for a shop on a scene (GM): hidden from players until revealed. */
export async function placePin(actor, point=viewCenter(), scene=globalThis.canvas?.scene) {
  if ( !game.user.isGM || !actor ) return null;
  if ( !scene ) {
    ui.notifications.warn(loc("Pins.NoScene"));
    return null;
  }
  const id = newId();
  await savePins(scene, addPin(getPins(scene), { id, actor: actor.id, x: point.x, y: point.y }));
  ui.notifications.info(loc("Pins.Placed", { name: shopName(actor) }));
  return getPins(scene).find(p => p.id === id) ?? null;
}

/** Reveal every pin and ribbon on a scene, or hide them all (GM). */
export async function revealAllHere(revealed=true, scene=globalThis.canvas?.scene) {
  if ( !game.user.isGM || !scene ) return;
  await savePins(scene, revealAll(getPins(scene), revealed));
  const ribbons = getRibbons(scene);
  if ( ribbons.length ) await saveRibbons(scene, revealAllRibbons(ribbons, revealed));
}

async function pinAction(id, action) {
  const scene = globalThis.canvas?.scene;
  const pin = getPins(scene).find(p => p.id === id);
  if ( !pin ) return;
  const actor = game.actors?.get(pin.actor) ?? null;
  switch ( action ) {
    case "reveal":
      return savePins(scene, updatePin(getPins(scene), id, { revealed: !pin.revealed }));
    case "range": {
      const shop = actor ? getShop(actor) : null;
      const units = scene.grid?.units ?? "";
      const shopRange = shop?.range ? `${shop.range} ${units}`.trim() : loc("Pins.Anywhere");
      const value = await DialogV2().prompt({
        window: { title: loc("Pins.RangeTitle", { name: actor ? shopName(actor) : "" }), icon: "fa-solid fa-ruler" },
        content: `
          <div class="form-group">
            <label>${e(loc("Pins.RangeLabel"))}</label>
            <div class="form-fields"><input type="number" name="range" min="0" step="1" value="${e(pin.range ?? "")}" placeholder="${e(shopRange)}" autofocus> ${e(units)}</div>
            <p class="hint">${e(loc("Pins.RangeHint", { range: shopRange }))}</p>
          </div>`,
        ok: { label: loc("Pins.Save"), icon: "fa-solid fa-check", callback: (event, button) => button.form.elements.range.value },
        rejectClose: false
      });
      if ( (value === null) || (value === undefined) ) return;
      return savePins(scene, updatePin(getPins(scene), id, { range: (String(value).trim() === "") ? null : Number(value) }));
    }
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
    case "remove": {
      const ok = await DialogV2().confirm({
        window: { title: loc("Pins.Remove"), icon: "fa-solid fa-trash" },
        content: `<p>${e(loc("Pins.RemoveConfirm", { name: actor ? shopName(actor) : loc("Pins.Missing") }))}</p>`,
        rejectClose: false
      });
      if ( ok ) return savePins(scene, removePin(getPins(scene), id));
    }
  }
}

/* -------------------------------------------- */
/*  The right-click menu (GM)                   */
/* -------------------------------------------- */

/**
 * A right-click menu at the pointer, for a pin or a ribbon (GM).
 * @param {MouseEvent} event
 * @param {{action: string, icon: string, label: string, danger?: boolean}[]} items
 * @param {(action: string) => unknown} onPick
 * @returns {HTMLElement}
 */
export function openMenu(event, items, onPick) {
  closeMenu();
  menu = document.createElement("nav");
  menu.className = "ps-pin-menu";
  menu.innerHTML = items.map(i => `
    <button type="button" data-pin-action="${i.action}"${i.danger ? ' class="ps-danger"' : ""}><i class="fa-solid ${i.icon}" inert></i> ${e(i.label)}</button>`).join("");
  document.body.append(menu);
  const { innerWidth: w, innerHeight: h } = window;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(event.clientX, w - rect.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(event.clientY, h - rect.height - 4))}px`;
  menu.addEventListener("click", ev => {
    const button = ev.target.closest("[data-pin-action]");
    if ( !button ) return;
    ev.preventDefault();
    closeMenu();
    onPick(button.dataset.pinAction);
  });
  document.addEventListener("pointerdown", onOutside, true);
  document.addEventListener("keydown", onKey, true);
  return menu;
}

export function closeMenu() {
  menu?.remove();
  menu = null;
  globalThis.document?.removeEventListener("pointerdown", onOutside, true);
  globalThis.document?.removeEventListener("keydown", onKey, true);
}

function onOutside(event) {
  if ( menu && !menu.contains(event.target) ) closeMenu();
}

function onKey(event) {
  if ( event.key === "Escape" ) closeMenu();
}

function showMenu(id, event) {
  const pin = getPins(globalThis.canvas?.scene).find(p => p.id === id);
  if ( !pin ) return;
  const actor = game.actors?.get(pin.actor) ?? null;
  const items = [
    { action: "reveal", icon: pin.revealed ? "fa-eye-slash" : "fa-eye", label: loc(pin.revealed ? "Pins.Hide" : "Pins.Reveal") },
    { action: "range", icon: "fa-ruler", label: loc("Pins.Range") },
    (actor && isShop(actor)) ? { action: "open", icon: "fa-store", label: loc("Pins.Open") } : null,
    actor ? { action: "settings", icon: "fa-gear", label: loc("Pins.Settings") } : null,
    (actor && isShop(actor) && selectedCount()) ? { action: "link", icon: "fa-link", label: loc("Link.Selected", { n: selectedCount() }) } : null,
    { action: "remove", icon: "fa-trash", label: loc("Pins.Remove"), danger: true }
  ].filter(Boolean);
  openMenu(event, items, action => pinAction(id, action)).dataset.pin = id;
}

/* -------------------------------------------- */
/*  Clicks and drags on pins                    */
/* -------------------------------------------- */

function listen(root) {
  const pinOf = event => event.target?.closest?.(".ps-pin");
  root.addEventListener("dblclick", event => {
    const el = pinOf(event);
    if ( !el ) return;
    event.preventDefault();
    event.stopPropagation();
    openPin(el.dataset.pin);
  });
  root.addEventListener("contextmenu", event => {
    const el = pinOf(event);
    if ( !el ) return;
    event.preventDefault();
    event.stopPropagation();
    if ( game.user.isGM ) showMenu(el.dataset.pin, event);
  });
  root.addEventListener("pointerdown", event => {
    const el = pinOf(event);
    if ( !el ) return;
    event.stopPropagation();
    if ( game.user.isGM && (event.button === 0) ) startDrag(el, event);
  });
}

function startDrag(el, event) {
  const pin = getPins(globalThis.canvas?.scene).find(p => p.id === el.dataset.pin);
  if ( !pin ) return;
  drag = { el, pin, startX: event.clientX, startY: event.clientY, x: pin.x, y: pin.y, moved: false };
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd, { once: true });
}

function onDragMove(event) {
  if ( !drag ) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if ( !drag.moved && (Math.hypot(dx, dy) < 4) ) return;
  drag.moved = true;
  drag.el.classList.add("ps-dragging");
  const scale = globalThis.canvas?.stage?.scale?.x || 1;
  drag.x = Math.round(drag.pin.x + (dx / scale));
  drag.y = Math.round(drag.pin.y + (dy / scale));
  drag.el.style.left = `${drag.x}px`;
  drag.el.style.top = `${drag.y}px`;
}

async function onDragEnd() {
  window.removeEventListener("pointermove", onDragMove);
  const done = drag;
  drag = null;
  if ( !done?.moved ) return;
  done.el.classList.remove("ps-dragging");
  const scene = globalThis.canvas?.scene;
  await savePins(scene, updatePin(getPins(scene), done.pin.id, { x: done.x, y: done.y }));
}

/* -------------------------------------------- */
/*  Dropping a shop on the map (GM)             */
/* -------------------------------------------- */

/** A shop's actor dropped on the map: ask whether it goes down as a token, a pin or a ribbon. */
function onDropCanvasData(canvasRef, data, event) {
  if ( !game.user.isGM || (data?.type !== "Actor") || data.primalShopsPlaced ) return;
  let actor = null;
  try {
    actor = data.uuid ? fromUuidSync(data.uuid) : game.actors?.get(data.id);
  } catch {
    actor = null;
  }
  if ( !actor || actor.pack || !isShop(actor) ) return;
  askDrop(actor, data, event);
  return false;
}

async function askDrop(actor, data, event) {
  const name = shopName(actor);
  const choice = await DialogV2().wait({
    window: { title: loc("Pins.DropTitle", { name }), icon: "fa-solid fa-store" },
    content: `<p>${e(loc("Pins.DropQuestion", { name }))}</p>`,
    buttons: [
      { action: "token", label: loc("Pins.DropToken"), icon: "fa-solid fa-user", default: true },
      { action: "pin", label: loc("Pins.DropPin"), icon: "fa-solid fa-location-dot" },
      { action: "ribbon", label: loc("Pins.DropRibbon"), icon: "fa-solid fa-bookmark" }
    ],
    rejectClose: false
  });
  if ( choice === "pin" ) return placePin(actor, { x: data.x, y: data.y });
  if ( choice === "ribbon" ) {
    const { placeRibbon } = await import("./ribbons.mjs");
    return placeRibbon(actor);
  }
  if ( choice !== "token" ) return null;
  data.primalShopsPlaced = true;
  const layer = globalThis.canvas?.tokens;
  if ( typeof layer?._onDropActorData === "function" ) return layer._onDropActorData(event, data);
  // Foundry's own drop isn't there to call: make the token here, centred where it was dropped.
  const tokenDoc = await actor.getTokenDocument();
  const size = canvas.grid?.size ?? 100;
  const tokenData = tokenDoc.toObject();
  tokenData.x = Math.round(data.x - ((tokenData.width ?? 1) * size) / 2);
  tokenData.y = Math.round(data.y - ((tokenData.height ?? 1) * size) / 2);
  return canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/** Draw pins as scenes are shown and change. Called once the game is ready. */
export function registerPins() {
  Hooks.on("canvasReady", () => drawPins());
  Hooks.on("canvasPan", () => align());
  Hooks.on("canvasTearDown", () => {
    closeMenu();
    globalThis.document?.getElementById(ROOT_ID)?.replaceChildren();
  });
  // Foundry re-drew its heads-up display: the pins go back in.
  Hooks.on("renderHeadsUpDisplayContainer", () => drawPins());
  Hooks.on("updateScene", (scene, changes) => {
    if ( scene !== globalThis.canvas?.scene ) return;
    if ( !foundry.utils.hasProperty(changes ?? {}, `flags.${MODULE_ID}`) && !("grid" in (changes ?? {})) ) return;
    drawPins();
  });
  // A shop renamed, opened or closed, or given a new picture.
  Hooks.on("updateActor", actor => {
    if ( getPins(globalThis.canvas?.scene).some(p => p.actor === actor.id) ) drawPins();
  });
  Hooks.on("deleteActor", () => drawPins());
  Hooks.on("dropCanvasData", onDropCanvasData);
  globalThis.window?.addEventListener?.("resize", () => align());
  if ( globalThis.canvas?.ready || globalThis.canvas?.scene ) drawPins();
}
