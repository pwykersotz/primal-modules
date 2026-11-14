/**
 * New shop (GM): a shop in two clicks, with no shopkeeper to make first. Pick what it sells and press Create: a
 * stand-in actor holds the shop (in the Actors sidebar's Shops folder, out of the way), and its ribbon hangs at the
 * top of the screen, or its pin goes on the map. A token can open it too, though it needn't: the tokens selected when
 * it's made, or any linked later.
 */
import { FLAGS, MODULE_ID, SETTINGS, escapeHTML as e, loc, newId, setting } from "../constants.mjs";
import { MAX_LEVEL } from "../catalog.mjs";
import { addPin, addRibbon, updatePin, updateRibbon } from "../pins.mjs";
import { normalizeShop } from "../shop.mjs";
import { getLists, getPins, getRibbons, savePins, saveRibbons, shopName } from "../store.mjs";
import { stockAfterChange } from "../trade.mjs";
import { viewCenter } from "./pin-layer.mjs";
import { levelLabel } from "./shop-window.mjs";

const DialogV2 = () => foundry.applications.api.DialogV2;
/** A stand-in shop's picture, and its token's. */
export const SHOP_IMG = "icons/svg/item-bag.svg";
const PLACES = ["ribbon", "pin", "none"];

/* -------------------------------------------- */
/*  Tokens that open a shop                     */
/* -------------------------------------------- */

/** The tokens the GM has selected that could open a shop: not players' own. */
export function selectedTokens() {
  return (globalThis.canvas?.tokens?.controlled ?? [])
    .map(t => t.document ?? t)
    .filter(t => (t?.documentName === "Token") && !t.actor?.hasPlayerOwner);
}

/** Make tokens open a shop when double-clicked, whatever their own actor is (GM). */
export async function linkTokens(actor, tokens) {
  if ( !game.user.isGM || !actor ) return 0;
  for ( const t of tokens ) await t.setFlag(MODULE_ID, FLAGS.opens, actor.id);
  return tokens.length;
}

/** The tokens on a scene linked to a shop. */
export function linkedTokens(actor, scene=globalThis.canvas?.scene) {
  const all = scene?.tokens?.contents ?? [...(scene?.tokens?.values?.() ?? [])];
  return all.filter(t => (t.getFlag?.(MODULE_ID, FLAGS.opens) ?? t.flags?.[MODULE_ID]?.[FLAGS.opens]) === actor?.id);
}

/** Stop tokens opening the shop they're linked to (GM). */
export async function unlinkTokens(tokens) {
  if ( !game.user.isGM ) return 0;
  for ( const t of tokens ) await t.unsetFlag(MODULE_ID, FLAGS.opens);
  return tokens.length;
}

/** Link the selected tokens to a shop, and say so (GM). */
export async function linkSelected(actor) {
  const tokens = selectedTokens();
  if ( !tokens.length ) {
    ui.notifications.warn(loc("Link.NoneSelected"));
    return 0;
  }
  await linkTokens(actor, tokens);
  ui.notifications.info(loc("Link.Linked", { n: tokens.length, name: shopName(actor) }));
  return tokens.length;
}

/* -------------------------------------------- */
/*  Making a shop                               */
/* -------------------------------------------- */

/** The Actors sidebar's folder for stand-in shops: ours, made the first time. */
async function shopsFolder() {
  const folders = game.folders;
  const ours = folders?.find?.(f => (f.type === "Actor") && f.getFlag?.(MODULE_ID, FLAGS.folder));
  if ( ours ) return ours;
  const Folder = globalThis.Folder?.implementation ?? globalThis.Folder;
  if ( typeof Folder?.create !== "function" ) return null;
  try {
    return await Folder.create({ name: loc("New.Folder"), type: "Actor", color: "#7a1424", flags: { [MODULE_ID]: { [FLAGS.folder]: true } } });
  } catch ( err ) {
    console.warn(`${MODULE_ID} | Could not make the Shops folder`, err);
    return null;
  }
}

/**
 * Make a shop with a stand-in actor, and put it on the scene shown (GM).
 * @param {object} [o]
 * @param {string} [o.name]      Its name; else its list's.
 * @param {string[]} [o.lists]   The shop lists it sells from (ids).
 * @param {number} [o.level]     Its shop level (the highest rarity it sells).
 * @param {"ribbon"|"pin"|"none"} [o.place]  A ribbon at the top of the screen, a pin in the middle of the view, or
 *   neither yet.
 * @param {boolean} [o.reveal]   Show its ribbon or pin to players at once.
 * @param {TokenDocument[]} [o.tokens]  Tokens that open it too.
 * @returns {Promise<Actor|null>}
 */
export async function createShop({ name="", lists=[], level=MAX_LEVEL, place="ribbon", reveal=false, tokens=[] }={}) {
  if ( !game.user.isGM ) return null;
  const all = getLists().lists;
  const sells = lists.filter(id => all.some(l => l.id === id));
  const title = String(name ?? "").trim() || all.find(l => l.id === sells[0])?.name || loc("New.DefaultName");
  const folder = await shopsFolder();
  // The shop takes the actor's name, so renaming either renames both.
  const shop = normalizeShop({ lists: sells, level, sellOwn: false });
  const ActorClass = globalThis.Actor?.implementation ?? globalThis.Actor;
  const actor = await ActorClass.create({
    name: title,
    type: "npc",
    img: SHOP_IMG,
    folder: folder?.id ?? null,
    prototypeToken: { name: title, actorLink: true, texture: { src: SHOP_IMG } },
    flags: { [MODULE_ID]: { [FLAGS.shop]: shop, [FLAGS.standIn]: true } }
  });
  if ( !actor ) return null;
  await stockAfterChange(actor, { reroll: true });

  const scene = globalThis.canvas?.scene ?? null;
  const where = (scene && PLACES.includes(place)) ? place : "none";
  if ( where === "ribbon" ) {
    const id = newId();
    let ribbons = addRibbon(getRibbons(scene), { id, actor: actor.id });
    if ( reveal ) ribbons = updateRibbon(ribbons, id, { revealed: true });
    await saveRibbons(scene, ribbons);
  } else if ( where === "pin" ) {
    const id = newId();
    const at = viewCenter();
    let pins = addPin(getPins(scene), { id, actor: actor.id, x: at.x, y: at.y });
    if ( reveal ) pins = updatePin(pins, id, { revealed: true });
    await savePins(scene, pins);
  }
  if ( tokens?.length ) await linkTokens(actor, tokens);
  const key = { ribbon: reveal ? "MadeRibbon" : "MadeRibbonHidden", pin: reveal ? "MadePin" : "MadePinHidden", none: "Made" }[where];
  ui.notifications.info(loc(`New.${key}`, { name: title }));
  return actor;
}

/* -------------------------------------------- */
/*  The New shop dialog                         */
/* -------------------------------------------- */

/** What the GM picked last time, to start from. */
function lastChoice() {
  try {
    return setting(SETTINGS.newShop) ?? {};
  } catch {
    return {};
  }
}

/** @param {object} v */
export function renderNewShop(v) {
  const L = v.labels;
  const lists = v.lists.length
    ? `<div class="ps-new-lists">${v.lists.map(l => `
        <label class="ps-chip"><input type="radio" name="list" value="${e(l.id)}"${l.checked ? " checked" : ""}> ${e(l.name)} <span class="ps-faint">${e(l.count)}</span></label>`).join("")}
      </div>`
    : `<p class="ps-faint">${e(L.noLists)}</p>`;
  return `
<div class="ps-new-shop">
  <div class="form-group stacked">
    <label>${e(L.sells)}</label>
    ${lists}
  </div>
  <div class="form-group">
    <label>${e(L.name)}</label>
    <div class="form-fields"><input type="text" name="name" placeholder="${e(L.namePlaceholder)}"></div>
  </div>
  <div class="form-group">
    <label>${e(L.level)}</label>
    <div class="form-fields"><select name="level">${v.levels.map(l => `<option value="${l.value}"${l.selected ? " selected" : ""}>${e(l.label)}</option>`).join("")}</select></div>
  </div>
  ${v.hasScene ? `
  <div class="form-group">
    <label>${e(L.place)}</label>
    <div class="form-fields"><select name="place">${v.places.map(p => `<option value="${p.value}"${p.selected ? " selected" : ""}>${e(p.label)}</option>`).join("")}</select></div>
  </div>
  <label class="ps-check"><input type="checkbox" name="reveal"${v.reveal ? " checked" : ""}> ${e(L.reveal)}</label>` : ""}
  ${v.tokenNames ? `
  <label class="ps-check"><input type="checkbox" name="link" checked> ${e(L.link)}</label>` : ""}
</div>`;
}

/** Ask what the new shop sells, and make it (GM). Two clicks: New shop, then Create. */
export async function openNewShop() {
  if ( !game.user.isGM ) return null;
  const last = lastChoice();
  const all = getLists().lists;
  const listId = all.some(l => l.id === last.list) ? last.list : all[0]?.id;
  const tokens = selectedTokens();
  const level = Number.isFinite(Number(last.level)) ? Number(last.level) : MAX_LEVEL;
  const hasScene = !!globalThis.canvas?.scene;
  const tokenNames = tokens.map(t => t.name).filter(Boolean).join(", ");
  const content = renderNewShop({
    lists: all.map(l => ({ id: l.id, name: l.name, count: loc("Config.ItemCount", { n: l.entries.length }), checked: l.id === listId })),
    levels: Array.from({ length: MAX_LEVEL + 1 }, (_, i) => ({ value: i, label: `${i} · ${levelLabel(i)}`, selected: i === level })),
    places: PLACES.map(p => ({ value: p, label: loc(`New.Place.${p}`), selected: p === (last.place ?? "ribbon") })),
    hasScene,
    reveal: !!last.reveal,
    tokenNames,
    labels: {
      sells: loc("New.Sells"), noLists: loc("New.NoLists"), name: loc("New.Name"), namePlaceholder: loc("New.NamePlaceholder"),
      level: loc("Config.Level"), place: loc("New.PlaceLabel"), reveal: loc("New.Reveal"),
      link: tokenNames ? loc("New.Link", { names: tokenNames }) : ""
    }
  });
  const picked = await DialogV2().wait({
    window: { title: loc("New.Title"), icon: "fa-solid fa-store" },
    classes: ["primal-shops-new"],
    position: { width: 460 },
    content,
    buttons: [{
      action: "create",
      label: loc("New.Create"),
      icon: "fa-solid fa-check",
      default: true,
      callback: (event, button) => {
        const f = button.form.elements;
        return {
          list: button.form.querySelector("input[name=list]:checked")?.value ?? null,
          name: f.name?.value ?? "",
          level: Number(f.level?.value ?? MAX_LEVEL),
          place: f.place?.value ?? "none",
          reveal: !!f.reveal?.checked,
          link: !!f.link?.checked
        };
      }
    }, {
      action: "cancel",
      label: loc("New.Cancel"),
      icon: "fa-solid fa-xmark"
    }],
    rejectClose: false
  });
  if ( !picked || (typeof picked !== "object") ) return null;
  try {
    await game.settings.set(MODULE_ID, SETTINGS.newShop, { list: picked.list, level: picked.level, place: picked.place, reveal: picked.reveal });
  } catch {
    // Remembering is a nicety.
  }
  return createShop({
    name: picked.name,
    lists: picked.list ? [picked.list] : [],
    level: picked.level,
    place: picked.place,
    reveal: picked.reveal,
    tokens: picked.link ? tokens : []
  });
}
