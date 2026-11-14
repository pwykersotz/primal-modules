/**
 * Map pins: a shop shown on a scene as a pin rather than a token (a town map with no party on it, or a stall drawn on
 * a battle map). The shopkeeper actor holds the shop as always and needn't be on the map. Nothing here touches
 * Foundry.
 *
 * Pins (scene flag "pins"): a list of { id, actor, x, y, revealed, range }.
 * - actor: the shop's actor id.
 * - x, y: the pin's centre, in the scene's pixels.
 * - revealed: players see it. They never see a hidden pin; the GM sees it faded.
 * - range: how close a player's token must be to this pin to trade (null: the shop's own range).
 */

/** A pin as kept, or null for one that can't be one. */
export function normalizePin(raw) {
  if ( !raw || (typeof raw !== "object") ) return null;
  const actor = (typeof raw.actor === "string") ? raw.actor.trim() : "";
  const x = Number(raw.x);
  const y = Number(raw.y);
  if ( !actor || !Number.isFinite(x) || !Number.isFinite(y) ) return null;
  const range = ((raw.range === null) || (raw.range === undefined) || (raw.range === "")) ? null : Number(raw.range);
  return {
    id: String(raw.id || "").trim() || `pin${Math.round(x)}x${Math.round(y)}`,
    actor,
    x: Math.round(x),
    y: Math.round(y),
    revealed: !!raw.revealed,
    range: (Number.isFinite(range) && (range > 0)) ? range : null
  };
}

/** A scene's pins as kept: each a proper pin, no id twice. */
export function normalizePins(raw) {
  const out = [];
  const ids = new Set();
  for ( const p of Array.isArray(raw) ? raw : [] ) {
    const pin = normalizePin(p);
    if ( !pin || ids.has(pin.id) ) continue;
    ids.add(pin.id);
    out.push(pin);
  }
  return out;
}

/** The pins with a new one: hidden until the GM reveals it. */
export function addPin(pins, { id, actor, x, y, range=null }) {
  const pin = normalizePin({ id, actor, x, y, range, revealed: false });
  if ( !pin ) return normalizePins(pins);
  return [...normalizePins(pins).filter(p => p.id !== pin.id), pin];
}

/** The pins with one changed (x, y, revealed, range). */
export function updatePin(pins, id, changes) {
  return normalizePins(pins).map(p => (p.id === id) ? (normalizePin({ ...p, ...changes, id: p.id, actor: p.actor }) ?? p) : p);
}

/** The pins without one. */
export function removePin(pins, id) {
  return normalizePins(pins).filter(p => p.id !== id);
}

/** Every pin revealed, or every pin hidden. */
export function revealAll(pins, revealed=true) {
  return normalizePins(pins).map(p => ({ ...p, revealed: !!revealed }));
}

/* -------------------------------------------- */
/*  Ribbons                                     */
/* -------------------------------------------- */

/**
 * Ribbons (scene flag "ribbons"): shops hung from the top of the screen while the scene is shown, rather than put on
 * the map. A list of { id, actor, revealed }, left to right, one for each shop at most. A ribbon has no place on the
 * map, so it lets players trade from anywhere.
 */
export function normalizeRibbon(raw) {
  if ( !raw || (typeof raw !== "object") ) return null;
  const actor = (typeof raw.actor === "string") ? raw.actor.trim() : "";
  if ( !actor ) return null;
  return { id: String(raw.id || "").trim() || `ribbon${actor}`, actor, revealed: !!raw.revealed };
}

/** A scene's ribbons as kept: each a proper ribbon, no id or shop twice. */
export function normalizeRibbons(raw) {
  const out = [];
  const ids = new Set();
  const actors = new Set();
  for ( const r of Array.isArray(raw) ? raw : [] ) {
    const ribbon = normalizeRibbon(r);
    if ( !ribbon || ids.has(ribbon.id) || actors.has(ribbon.actor) ) continue;
    ids.add(ribbon.id);
    actors.add(ribbon.actor);
    out.push(ribbon);
  }
  return out;
}

/** The ribbons with a new one at the right end, hidden until the GM reveals it. A shop with one already keeps it. */
export function addRibbon(ribbons, { id, actor }) {
  const list = normalizeRibbons(ribbons);
  const ribbon = normalizeRibbon({ id, actor, revealed: false });
  if ( !ribbon || list.some(r => (r.actor === ribbon.actor) || (r.id === ribbon.id)) ) return list;
  return [...list, ribbon];
}

/** The ribbons with one revealed or hidden. */
export function updateRibbon(ribbons, id, { revealed }) {
  return normalizeRibbons(ribbons).map(r => (r.id === id) ? { ...r, revealed: !!revealed } : r);
}

/** The ribbons without one. */
export function removeRibbon(ribbons, id) {
  return normalizeRibbons(ribbons).filter(r => r.id !== id);
}

/** The ribbons with one moved along: by -1 to the left, 1 to the right. */
export function moveRibbon(ribbons, id, by) {
  const list = normalizeRibbons(ribbons);
  const from = list.findIndex(r => r.id === id);
  if ( from < 0 ) return list;
  const to = Math.max(0, Math.min(list.length - 1, from + Math.sign(by)));
  const [ribbon] = list.splice(from, 1);
  list.splice(to, 0, ribbon);
  return list;
}

/** Every ribbon revealed, or every one hidden. */
export function revealAllRibbons(ribbons, revealed=true) {
  return normalizeRibbons(ribbons).map(r => ({ ...r, revealed: !!revealed }));
}

/** The ribbons a user sees: the GM every one; a player the revealed ribbons of actors that are shops. */
export function visibleRibbons(ribbons, { isGM, isShop }) {
  return normalizeRibbons(ribbons).filter(r => isGM || (r.revealed && isShop(r.actor)));
}

/**
 * The pins a user sees: the GM every one; a player the revealed pins of actors that are shops.
 * @param {object[]} pins
 * @param {{isGM: boolean, isShop: (actorId: string) => boolean}} who
 */
export function visiblePins(pins, { isGM, isShop }) {
  return normalizePins(pins).filter(p => isGM || (p.revealed && isShop(p.actor)));
}

/**
 * Is a trader too far from a shop to trade, and from how far may they?
 * @param {object} o
 * @param {{x: number, y: number, range: number|null, pin?: boolean}[]} o.places  Where the shop is on the scene shown:
 *   its tokens (with the shop's range) and its revealed pins (with theirs, else the shop's). range null: anywhere.
 * @param {{x: number, y: number}[]} o.traders  The trader's tokens on that scene.
 * @param {(a: object, b: object) => number} o.measure  The distance between two points.
 * @returns {{far: boolean, range: number|null}}  range: the range the trader must come within (when far).
 * - No place on the scene: nothing to stand near, so no limit.
 * - A place with no range: trade from anywhere.
 * - No token of the trader's on the scene: a pin lets them trade (a town map the party isn't on), a token doesn't.
 * - Otherwise: within the range of any place.
 */
export function rangeCheck({ places, traders, measure }) {
  if ( !places?.length ) return { far: false, range: null };
  if ( places.some(p => !(p.range > 0)) ) return { far: false, range: null };
  const nearestRange = Math.min(...places.map(p => p.range));
  if ( !traders?.length ) {
    return places.some(p => p.pin) ? { far: false, range: null } : { far: true, range: nearestRange };
  }
  const near = places.some(p => traders.some(t => measure(p, t) <= p.range));
  return { far: !near, range: near ? null : nearestRange };
}

/**
 * The shops a user finds on a scene, one row each: from its pins, its ribbon and its tokens.
 * @param {object} o
 * @param {object[]} o.pins     The scene's pins.
 * @param {object[]} [o.ribbons]  The scene's ribbons.
 * @param {{actor: string, hidden: boolean}[]} o.tokens  The scene's tokens of shop actors.
 * @param {boolean} o.isGM
 * @param {(actorId: string) => boolean} o.isShop
 * @returns {{actor: string, pins: number, ribbons: number, tokens: number, revealed: boolean}[]}  revealed: a player
 *   can see it here.
 */
export function shopsOnScene({ pins, ribbons=[], tokens, isGM, isShop }) {
  const rows = new Map();
  const row = actor => rows.get(actor) ?? rows.set(actor, { actor, pins: 0, ribbons: 0, tokens: 0, revealed: false }).get(actor);
  for ( const p of normalizePins(pins) ) {
    if ( !isShop(p.actor) || (!isGM && !p.revealed) ) continue;
    const r = row(p.actor);
    r.pins += 1;
    r.revealed ||= p.revealed;
  }
  for ( const b of normalizeRibbons(ribbons) ) {
    if ( !isShop(b.actor) || (!isGM && !b.revealed) ) continue;
    const r = row(b.actor);
    r.ribbons += 1;
    r.revealed ||= b.revealed;
  }
  for ( const t of tokens ?? [] ) {
    if ( !isShop(t.actor) || (!isGM && t.hidden) ) continue;
    const r = row(t.actor);
    r.tokens += 1;
    r.revealed ||= !t.hidden;
  }
  return [...rows.values()];
}
