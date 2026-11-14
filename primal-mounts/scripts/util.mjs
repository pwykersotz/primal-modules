import { INCAPACITATING, MODULE_ID, SIZE_ORDER } from "./constants.mjs";

/* -------------------------------------------- */
/*  General                                     */
/* -------------------------------------------- */

export function loc(key, data) {
  const full = `PRIMAL_MOUNTS.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

/** Console logging for troubleshooting, enabled with the "Debug logging" client setting. */
export function debug(...args) {
  try {
    if ( game.settings.get(MODULE_ID, "debug") ) console.log(`${MODULE_ID} |`, ...args);
  } catch(err) { /* settings not ready */ }
}

export function isMidiActive() {
  return !!game.modules.get("midi-qol")?.active;
}

/** Accept a Token placeable or a TokenDocument and return the document. */
export function asDoc(token) {
  if (!token) return null;
  return token.document ?? token;
}

export function flag(doc, key) {
  return asDoc(doc)?.flags?.[MODULE_ID]?.[key] ?? null;
}

export function escapeHTML(text) {
  const s = String(text ?? "");
  return foundry.utils.escapeHTML ? foundry.utils.escapeHTML(s)
    : s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}

/* -------------------------------------------- */
/*  Pairs                                       */
/* -------------------------------------------- */

/** The mount a rider token is sitting on, if the link is valid in both directions. */
export function getMountOf(riderDoc) {
  const doc = asDoc(riderDoc);
  const id = flag(doc, "mount");
  if ( !id || !doc?.parent ) return null;
  const mount = doc.parent.tokens.get(id);
  return mount && (flag(mount, "rider") === doc.id) ? mount : null;
}

/** The rider sitting on a mount token, if the link is valid in both directions. */
export function getRiderOf(mountDoc) {
  const doc = asDoc(mountDoc);
  const id = flag(doc, "rider");
  if ( !id || !doc?.parent ) return null;
  const rider = doc.parent.tokens.get(id);
  return rider && (flag(rider, "mount") === doc.id) ? rider : null;
}

/** @returns {{rider: TokenDocument, mount: TokenDocument}|null} */
export function getPair(token) {
  const doc = asDoc(token);
  if ( !doc ) return null;
  const mount = getMountOf(doc);
  if ( mount ) return { rider: doc, mount };
  const rider = getRiderOf(doc);
  if ( rider ) return { rider, mount: doc };
  return null;
}

export function controlOf(mountDoc) {
  return flag(mountDoc, "control") === "independent" ? "independent" : "controlled";
}

/**
 * The token documents that stand for this actor right now. A linked actor can have tokens in many scenes and be
 * mounted in only some of them, so only the scene being viewed counts, or the active scene when the actor has no
 * token in the viewed one. A pair left in another scene stays linked there, but does not affect the actor here
 * (its speeds, fall checks or controlled-mount rules) until that scene is viewed again.
 */
export function actorTokenDocs(actor) {
  if ( !actor ) return [];
  if ( actor.isToken ) return actor.token ? [actor.token] : [];
  const linked = scene => scene?.tokens?.filter(t => t.actorLink && (t.actorId === actor.id)) ?? [];
  const viewed = globalThis.canvas?.scene ?? null;
  const here = linked(viewed);
  if ( here.length ) return here;
  const active = game.scenes?.active ?? null;
  return (active && (active !== viewed)) ? linked(active) : [];
}

/** Pair memberships of this actor's tokens. */
export function pairEntries(actor) {
  return actorTokenDocs(actor).map(doc => ({ doc, pair: getPair(doc) })).filter(e => e.pair);
}

/* -------------------------------------------- */
/*  Creature size                               */
/* -------------------------------------------- */

export function sizeOrder() {
  const keys = Object.keys(globalThis.CONFIG?.DND5E?.actorSizes ?? {});
  return keys.length ? keys : SIZE_ORDER;
}

/** Index of the creature's size category (tiny = 0), falling back to the token's footprint. */
export function sizeRank(token) {
  const doc = asDoc(token);
  const order = sizeOrder();
  const size = doc?.actor?.system?.traits?.size;
  const index = order.indexOf(size);
  if ( index >= 0 ) return index;
  const span = Math.max(doc?.width ?? 1, doc?.height ?? 1);
  if ( span < 1 ) return 0;
  if ( span < 2 ) return 2;
  if ( span < 3 ) return 3;
  if ( span < 4 ) return 4;
  return 5;
}

export function sizeLabel(token) {
  const order = sizeOrder();
  const key = order[sizeRank(token)];
  const label = globalThis.CONFIG?.DND5E?.actorSizes?.[key]?.label;
  return label ? game.i18n.localize(label) : key;
}

/* -------------------------------------------- */
/*  Geometry                                    */
/* -------------------------------------------- */

export function gridInfo(scene) {
  const g = scene?.grid ?? canvas?.grid;
  const size = g?.size ?? 100;
  const gridless = !!(g?.isGridless ?? (g?.type === CONST.GRID_TYPES?.GRIDLESS));
  const square = !!(g?.isSquare ?? (g?.type === CONST.GRID_TYPES?.SQUARE));
  return {
    sx: g?.sizeX ?? size, sy: g?.sizeY ?? size, distance: g?.distance ?? 5, units: g?.units || "ft", gridless, square
  };
}

/** The token's footprint in scene pixels, from document data (never from the animated placeable). */
export function tokenRect(token) {
  const doc = asDoc(token);
  let w;
  let h;
  try {
    const s = doc.getSize?.();
    if ( s && Number.isFinite(s.width) && Number.isFinite(s.height) ) ({ width: w, height: h } = s);
  } catch(err) { /* fall through to the grid calculation */ }
  if ( !Number.isFinite(w) ) {
    const { sx, sy } = gridInfo(doc.parent);
    w = doc.width * sx;
    h = doc.height * sy;
  }
  return { x: doc.x, y: doc.y, w, h };
}

export function rectArea(r) {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

export function intersectArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (w > 0) && (h > 0) ? w * h : 0;
}

export function rectCenter(r) {
  return { x: r.x + (r.w / 2), y: r.y + (r.h / 2) };
}

export function rectContains(r, p) {
  return (p.x > r.x) && (p.x < r.x + r.w) && (p.y > r.y) && (p.y < r.y + r.h);
}

/** Gap between two footprints measured in grid spaces (0 when touching or overlapping). */
export function gapInSpaces(a, b, scene) {
  const { sx, sy } = gridInfo(scene);
  const gx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)) / sx;
  const gy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)) / sy;
  return Math.max(gx, gy);
}

/** Is one token within 5 feet (one grid space) of another, horizontally and vertically? */
export function withinFiveFeet(a, b) {
  const da = asDoc(a);
  const db = asDoc(b);
  const { distance } = gridInfo(da.parent);
  if ( Math.abs((da.elevation ?? 0) - (db.elevation ?? 0)) > distance ) return false;
  return gapInSpaces(tokenRect(da), tokenRect(db), da.parent) < 0.99;
}

export function sameLevel(a, b) {
  return !a.level || !b.level || (a.level === b.level);
}

/* -------------------------------------------- */
/*  Actors & rules                              */
/* -------------------------------------------- */

export function isIncapacitated(actor) {
  const statuses = actor?.statuses;
  if ( !statuses ) return false;
  const defeated = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  return INCAPACITATING.some(s => statuses.has(s)) || statuses.has(defeated);
}

/** The rider's Mounted Combatant feat, if they have one. */
export function mountedCombatantItem(actor) {
  if ( !actor?.items ) return null;
  return actor.items.find(item => {
    if ( item.type !== "feat" ) return false;
    const identifier = item.identifier ?? item.system?.identifier;
    if ( identifier === "mounted-combatant" ) return true;
    return /^mounted\s+combatant\b/i.test(item.name?.trim() ?? "");
  }) ?? null;
}

/** Which rules text applies: "modern" (2024) or "legacy" (2014). */
export function rulesVersion(item) {
  const choice = setting("rulesVersion");
  if ( choice === "modern" || choice === "legacy" ) return choice;
  const source = item?.system?.source?.rules;
  if ( source === "2014" ) return "legacy";
  if ( source === "2024" ) return "modern";
  try {
    return game.settings.get("dnd5e", "rulesVersion") === "legacy" ? "legacy" : "modern";
  } catch(err) {
    return "modern";
  }
}

export function walkSpeed(actor) {
  const movement = actor?.system?.attributes?.movement ?? {};
  return Number(movement.walk ?? movement.speeds?.walk) || 0;
}

export function ownerIds(actor) {
  return game.users.filter(u => u.isGM || actor?.testUserPermission?.(u, "OWNER")).map(u => u.id);
}

/* -------------------------------------------- */
/*  Movement                                    */
/* -------------------------------------------- */

/** Ids of tokens this client is currently moving on the module's behalf (our own hooks let these through). */
export const internalMoves = new Set();

/**
 * Move a token through one or more waypoints using the v13+ movement API, falling back to a plain update.
 * @param {TokenDocument} doc
 * @param {object|object[]} waypoints
 * @param {object} [options]
 * @param {boolean} [options.ignoreWalls]  Ignore walls and movement cost (riders being carried).
 * @param {string} [options.method]        Movement method to record.
 * @param {boolean} [options.showRuler]
 * @param {object} [options.extra]         Data stored under options.primalMounts so our hooks skip this move.
 */
export async function moveDoc(doc, waypoints, { ignoreWalls = false, method, showRuler = false, extra = {} } = {}) {
  const list = (Array.isArray(waypoints) ? waypoints : [waypoints]).map(w => clean(w));
  if ( !list.length ) return false;
  const options = { primalMounts: { internal: true, ...extra }, autoRotate: false, showRuler, pan: false };
  if ( ignoreWalls ) options.constrainOptions = { ignoreWalls: true, ignoreCost: true };
  if ( method ) options.method = method;
  internalMoves.add(doc.id);
  try {
    if ( typeof doc.move === "function" ) {
      try {
        return await doc.move(list.length === 1 ? list[0] : list, options);
      } catch(err) {
        console.warn(`${MODULE_ID} | TokenDocument#move failed, falling back to update`, err);
      }
    }
    const { x, y, elevation, level } = list.at(-1);
    await doc.update(clean({ x, y, elevation, level }), { primalMounts: options.primalMounts });
    return true;
  } finally {
    internalMoves.delete(doc.id);
  }
}

/** Is the token document at this position? */
export function isAt(doc, pos) {
  return (doc.x === pos.x) && (doc.y === pos.y)
    && ((pos.elevation === undefined) || (doc.elevation === pos.elevation))
    && (!pos.level || !doc.level || (doc.level === pos.level));
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => (v !== undefined) && (v !== null)));
}
