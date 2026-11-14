/**
 * Where things are kept: the shop lists in a world setting (every user can read it; only a GM can change it), and each
 * shop on its actor (flags "shop" and "state"). A shop belongs to the world actor: every token of it, linked or not,
 * opens the same shop.
 */
import { FLAGS, MODULE_ID, SETTINGS, setting } from "./constants.mjs";
import { normalizeLists } from "./catalog.mjs";
import { normalizeShop, normalizeState, serializeState } from "./shop.mjs";
import { currencyRates } from "./money.mjs";
import { normalizePins, normalizeRibbons } from "./pins.mjs";

export function getLists() {
  return normalizeLists(setting(SETTINGS.lists));
}

export async function saveLists(lists) {
  return game.settings.set(MODULE_ID, SETTINGS.lists, normalizeLists(lists));
}

/** The coins of the system, worth so many of the smallest each. */
export function rates() {
  return currencyRates();
}

/**
 * The world actor of a shop: from an Actor, a Token, a TokenDocument or a UUID string's document.
 * @returns {Actor|null}
 */
export function shopActorOf(target) {
  if ( !target ) return null;
  let doc = target;
  if ( doc.document && (doc.document.documentName === "Token") ) doc = doc.document;
  if ( doc.documentName === "Token" ) {
    // A token linked to a shop opens that shop (see apps/quick-shop.mjs).
    const linked = linkedShopOf(doc);
    if ( linked ) return linked;
    const base = doc.baseActor ?? doc.actor;
    if ( !base ) return null;
    return game.actors?.get(base.id) ?? base;
  }
  if ( doc.documentName === "Actor" ) {
    if ( doc.isToken ) {
      const linked = linkedShopOf(doc.token);
      if ( linked ) return linked;
      const base = doc.token?.baseActor ?? (doc.id ? game.actors?.get(doc.id) : null);
      return base ?? doc;
    }
    return doc;
  }
  return null;
}

/** The shop a token is linked to, if it is and the shop's actor is still there. */
function linkedShopOf(tokenDoc) {
  const id = tokenDoc?.getFlag?.(MODULE_ID, FLAGS.opens) ?? tokenDoc?.flags?.[MODULE_ID]?.[FLAGS.opens];
  return id ? (game.actors?.get(id) ?? null) : null;
}

/** The token a shop was opened from, if it was. */
export function tokenDocOf(target) {
  if ( !target ) return null;
  if ( target.document?.documentName === "Token" ) return target.document;
  if ( target.documentName === "Token" ) return target;
  return null;
}

/** Is this actor a shop? */
export function isShop(actor) {
  const raw = actor?.getFlag?.(MODULE_ID, FLAGS.shop);
  return !!raw && (raw.enabled !== false);
}

export function getShop(actor) {
  return normalizeShop(actor?.getFlag?.(MODULE_ID, FLAGS.shop));
}

export function getState(actor) {
  return normalizeState(actor?.getFlag?.(MODULE_ID, FLAGS.state));
}

/** The shop's name: its own, else its actor's. */
export function shopName(actor, shop=getShop(actor)) {
  return shop.name || actor?.name || "";
}

/**
 * Save a shop's settings (GM). Every key is always there and every collection is a list, so saving over the old
 * settings replaces each value.
 */
export async function saveShop(actor, shop) {
  return actor.setFlag(MODULE_ID, FLAGS.shop, normalizeShop(shop));
}

/** Save what a shop has now (GM). */
export async function saveState(actor, state) {
  return actor.setFlag(MODULE_ID, FLAGS.state, serializeState(state));
}

/** Every shop in the world. */
export function allShops() {
  return [...(game.actors ?? [])].filter(isShop).sort((a, b) => shopName(a).localeCompare(shopName(b)));
}

/** A scene's shop pins. */
export function getPins(scene) {
  return normalizePins(scene?.getFlag?.(MODULE_ID, FLAGS.pins));
}

/** Save a scene's shop pins (GM). Kept as a list, so saving replaces them all. */
export async function savePins(scene, pins) {
  return scene.setFlag(MODULE_ID, FLAGS.pins, normalizePins(pins));
}

/** A scene's shop ribbons, left to right. */
export function getRibbons(scene) {
  return normalizeRibbons(scene?.getFlag?.(MODULE_ID, FLAGS.ribbons));
}

/** Save a scene's shop ribbons (GM). */
export async function saveRibbons(scene, ribbons) {
  return scene.setFlag(MODULE_ID, FLAGS.ribbons, normalizeRibbons(ribbons));
}
