import { ICONS, MODULE_ID } from "./constants.mjs";
import {
  controlOf, getMountOf, getPair, getRiderOf, intersectArea, rectArea, rectCenter, rectContains, sameLevel, setting, sizeRank, tokenRect
} from "./util.mjs";

/**
 * Display-only presentation of tokens. Nothing here changes document data except stacking order (sort),
 * which the active GM keeps so that smaller tokens sit on top of the larger tokens they overlap.
 *
 *  - Riders are drawn at a reduced scale on the centre of their mount, so the pair reads as one united token
 *    and both halves stay clickable (rider in the middle, mount around it).
 *  - Same-size tokens that sit on top of each other are shrunk and fanned out so every one of them can be seen
 *    and clicked.
 */

/** tokenId -> {f, dx, dy}: scale factor and pixel offset to present the token with. */
let desired = new Map();

/** The value we last wrote to a PIXI point and what it was before, so re-applying never compounds. */
const records = new WeakMap();
const scalarRecords = new WeakMap();

let displayTimer = null;
const sortTimers = new Map();

export function registerDisplay() {
  Hooks.on("refreshToken", token => applyTransform(token));
  Hooks.on("canvasReady", () => {
    scheduleDisplay();
    scheduleSort(canvas.scene);
  });
  Hooks.on("canvasTearDown", () => {
    desired = new Map();
  });
  Hooks.on("createToken", doc => {
    scheduleDisplay();
    scheduleSort(doc.parent);
  });
  Hooks.on("deleteToken", () => scheduleDisplay());
  Hooks.on("updateToken", (doc, changes, options) => {
    const keys = ["x", "y", "width", "height", "elevation", "level", "hidden", "sort"];
    const flagsChanged = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`);
    if ( flagsChanged || keys.some(k => k in changes) ) scheduleDisplay();
    const geometry = ["x", "y", "width", "height", "elevation", "level"].some(k => k in changes);
    if ( (geometry || flagsChanged) && !options?.primalMounts?.sort ) scheduleSort(doc.parent);
  });
  Hooks.on("sightRefresh", () => scheduleDisplay());
}

/* -------------------------------------------- */
/*  Transforms                                  */
/* -------------------------------------------- */

/**
 * Write a transformed value to a PIXI point. If the point still holds the value we wrote last time, core did not
 * reset it since, so restore the original first. Returns the untransformed (base) value.
 */
function adjust(point, compute) {
  if ( !point ) return { x: 0, y: 0 };
  const record = records.get(point);
  if ( record && (point.x === record.ax) && (point.y === record.ay) ) point.set(record.bx, record.by);
  const bx = point.x;
  const by = point.y;
  const [ax, ay] = compute(bx, by);
  if ( (ax === bx) && (ay === by) ) {
    records.delete(point);
    return { x: bx, y: by };
  }
  point.set(ax, ay);
  records.set(point, { bx, by, ax: point.x, ay: point.y });
  return { x: bx, y: by };
}

export function applyTransform(token) {
  if ( !token || token.destroyed || token.isPreview ) return;
  const tf = desired.get(token.id);
  const f = tf?.f ?? 1;
  const dx = tf?.dx ?? 0;
  const dy = tf?.dy ?? 0;
  const w = token.w ?? 0;
  const h = token.h ?? 0;
  const pivot = token.pivot ?? { x: 0, y: 0 };

  // The placeable holds the border, bars, effects, nameplate and hit area: scale it about its centre.
  const baseScale = adjust(token.scale, (x, y) => [x * f, y * f]);
  adjust(token.position, (x, y) => [
    x + (baseScale.x * (1 - f) * ((w / 2) - pivot.x)) + dx,
    y + (baseScale.y * (1 - f) * ((h / 2) - pivot.y)) + dy
  ]);

  // The artwork lives in the primary canvas group, anchored on the token centre.
  const mesh = token.mesh;
  if ( mesh && !mesh.destroyed ) {
    adjust(mesh.scale, (x, y) => [x * f, y * f]);
    adjust(mesh.position, (x, y) => [x + dx, y + dy]);
    // A raised token over a smaller one is see-through, except while hovered so it can still be inspected.
    const alpha = token.hover ? 1 : (tf?.alpha ?? 1);
    adjustScalar(mesh, "alpha", v => v * alpha);
  }

  // Clicks over a lower token covered by a raised one pass through to the lower token.
  setHitHoles(token, tf?.holes);

  // Mounts carry a small saddle badge on their top-left corner.
  setBadge(token, tf?.badge);
}

/* -------------------------------------------- */
/*  Mount badge                                 */
/* -------------------------------------------- */

const badges = new WeakMap();
const BADGE_COLORS = { controlled: 0xe8a33d, independent: 0x9aa4ad };

/**
 * Show (or remove) the saddle badge on a mount. It sits on the token's top-left corner, takes no clicks, and is
 * gold for a controlled mount, grey for an independent one.
 * @param {Token} token
 * @param {"controlled"|"independent"|undefined} kind
 */
function setBadge(token, kind) {
  let badge = badges.get(token);
  if ( badge && (badge.destroyed || (badge.parent !== token)) ) {
    badges.delete(token);
    badge = null;
  }
  if ( !kind || (typeof PIXI === "undefined") ) {
    if ( badge ) {
      badge.destroy({ children: true });
      badges.delete(token);
    }
    return;
  }
  if ( !badge ) {
    badge = new PIXI.Container();
    badge.eventMode = "none";
    badge.name = `${MODULE_ID}-badge`;
    badge.ring = badge.addChild(new PIXI.Graphics());
    badge.icon = badge.addChild(PIXI.Sprite.from(ICONS.mountedEffect));
    badge.icon.anchor?.set(0.5, 0.5);
    token.addChild(badge);
    badges.set(token, badge);
  }
  // About a fifth of the token's width across, like an effect icon.
  const r = Math.max(7, Math.min(26, Math.min(token.w ?? 100, token.h ?? 100) * 0.1));
  const color = BADGE_COLORS[kind] ?? BADGE_COLORS.controlled;
  if ( (badge.kind !== kind) || (badge.radius !== r) ) {
    badge.ring.clear();
    badge.ring.lineStyle(Math.max(1.5, r * 0.16), color, 1);
    badge.ring.beginFill(0x1b1b1b, 0.85);
    badge.ring.drawCircle(0, 0, r);
    badge.ring.endFill();
    badge.icon.width = badge.icon.height = r * 1.5;
    badge.icon.tint = color;
    badge.kind = kind;
    badge.radius = r;
  }
  // Centred on the token's top-left corner, where effect icons sit, clear of a round token's artwork.
  badge.position.set(0, 0);
}

/** Scalar version of adjust(): transform obj[key] without ever compounding. */
function adjustScalar(obj, key, compute) {
  const all = scalarRecords.get(obj) ?? {};
  const record = all[key];
  if ( record && (obj[key] === record.after) ) obj[key] = record.base;
  const base = obj[key];
  const after = compute(base);
  if ( after === base ) delete all[key];
  else {
    obj[key] = after;
    all[key] = { base, after: obj[key] };
  }
  scalarRecords.set(obj, all);
}

/** Hit areas we created, mapped to the hit area core had set. */
const holeAreas = new WeakSet();

function setHitHoles(token, holes) {
  const current = token.hitArea;
  const ours = current && holeAreas.has(current);
  const base = ours ? current.base : current;
  if ( !holes?.length ) {
    if ( ours ) token.hitArea = base ?? null;
    return;
  }
  const area = base ?? ((typeof PIXI !== "undefined") ? new PIXI.Rectangle(0, 0, token.w, token.h) : null);
  if ( !area ) return;
  const wrapper = {
    base,
    holes,
    get x() { return area.x; },
    get y() { return area.y; },
    get width() { return area.width; },
    get height() { return area.height; },
    contains(x, y) {
      if ( !area.contains(x, y) ) return false;
      return !holes.some(h => (x >= h.x) && (x <= h.x + h.w) && (y >= h.y) && (y <= h.y + h.h));
    }
  };
  holeAreas.add(wrapper);
  token.hitArea = wrapper;
}

function sameTransform(a, b) {
  const f1 = a?.f ?? 1;
  const f2 = b?.f ?? 1;
  const holes = h => JSON.stringify(h ?? []);
  return (Math.abs(f1 - f2) < 1e-6) && (Math.abs((a?.dx ?? 0) - (b?.dx ?? 0)) < 0.01)
    && (Math.abs((a?.dy ?? 0) - (b?.dy ?? 0)) < 0.01)
    && (Math.abs((a?.alpha ?? 1) - (b?.alpha ?? 1)) < 1e-6)
    && (holes(a?.holes) === holes(b?.holes))
    && ((a?.badge ?? null) === (b?.badge ?? null));
}

export function scheduleDisplay() {
  clearTimeout(displayTimer);
  displayTimer = setTimeout(() => {
    try {
      recomputeDisplay();
    } catch(err) {
      console.error(`${MODULE_ID} | display update failed`, err);
    }
  }, 30);
}

/** Slot layout for n same-size tokens stacked on one spot. */
export function fanLayout(n, i, w, h) {
  if ( n === 2 ) {
    const f = 0.7;
    const s = ((1 - f) / 2) * (i === 0 ? -1 : 1);
    return { f, dx: s * w, dy: s * h };
  }
  if ( n === 3 ) {
    const f = 0.6;
    const s = (1 - f) / 2;
    const slots = [[-s, -s], [s, -s], [0, s]];
    return { f, dx: slots[i][0] * w, dy: slots[i][1] * h };
  }
  if ( n === 4 ) {
    const f = 0.55;
    const s = (1 - f) / 2;
    const slots = [[-s, -s], [s, -s], [-s, s], [s, s]];
    return { f, dx: slots[i][0] * w, dy: slots[i][1] * h };
  }
  const f = 0.5;
  const r = (1 - f) / 2;
  const angle = (-Math.PI / 2) + ((i * 2 * Math.PI) / n);
  return { f, dx: Math.cos(angle) * r * w, dy: Math.sin(angle) * r * h };
}

function isShown(token) {
  if ( token.document.hidden && !game.user.isGM ) return false;
  const visible = token.isVisible ?? token.visible;
  return visible !== false;
}

/**
 * Find raised tokens that cover smaller tokens below them.
 * @param {Token[]} tokens              Tokens this user can see.
 * @param {Map<string, object>} rects   Footprints by token id.
 * @returns {Map<Token, object[]>}      Each covering token with the footprints (in its local space) it covers.
 */
export function raisedCover(tokens, rects) {
  const out = new Map();
  for ( const upper of tokens ) {
    const du = upper.document;
    if ( getMountOf(du) ) continue; // riders sit on their mount, not over other tokens
    const ru = rects.get(upper.id);
    const holes = [];
    for ( const lower of tokens ) {
      const dl = lower.document;
      if ( (lower === upper) || ((dl.elevation ?? 0) >= (du.elevation ?? 0)) || !sameLevel(du, dl) ) continue;
      // Same size is handled by fanning out; a larger lower token already shows around the raised one.
      if ( (dl.width === du.width) && (dl.height === du.height) ) continue;
      const rl = rects.get(lower.id);
      if ( rectArea(rl) > rectArea(ru) ) continue;
      const overlap = intersectArea(ru, rl);
      if ( overlap <= 0 ) continue;
      if ( !rectContains(ru, rectCenter(rl)) && (overlap < 0.5 * rectArea(rl)) ) continue;
      holes.push({ x: rl.x - ru.x, y: rl.y - ru.y, w: rl.w, h: rl.h });
    }
    if ( holes.length ) out.set(upper, holes);
  }
  return out;
}

/** Group documents with union-find over a pairwise predicate. */
export function groupBy(items, linked) {
  const parent = items.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for ( let i = 0; i < items.length; i++ ) {
    for ( let j = i + 1; j < items.length; j++ ) {
      if ( linked(items[i], items[j]) ) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  items.forEach((item, i) => {
    const root = find(i);
    if ( !groups.has(root) ) groups.set(root, []);
    groups.get(root).push(item);
  });
  return [...groups.values()];
}

export function recomputeDisplay() {
  if ( !canvas?.ready || !canvas.tokens ) return;
  const tokens = canvas.tokens.placeables.filter(t => t.document && !t.isPreview && !t.destroyed);
  const next = new Map();

  // Riders: shrink so the mount shows around them.
  const riderScale = setting("riderScale");
  for ( const t of tokens ) {
    const mount = getMountOf(t.document);
    if ( !mount ) continue;
    const ratio = Math.min(mount.width / t.document.width, mount.height / t.document.height);
    const f = Math.min(1, riderScale * ratio);
    if ( f < 0.999 ) next.set(t.id, { f, dx: 0, dy: 0 });
  }

  const shown = tokens.filter(t => isShown(t));
  const rects = new Map(shown.map(t => [t.id, tokenRect(t.document)]));

  // Same-size stacks, at any elevation: fan out so every token is visible and clickable.
  if ( setting("fanOut") ) {
    const pool = shown.filter(t => !getPair(t.document));
    const groups = groupBy(pool, (a, b) => {
      const da = a.document;
      const db = b.document;
      if ( (da.width !== db.width) || (da.height !== db.height) || !sameLevel(da, db) ) return false;
      const ra = rects.get(a.id);
      return intersectArea(ra, rects.get(b.id)) >= 0.5 * rectArea(ra);
    });
    for ( const group of groups ) {
      if ( group.length < 2 ) continue;
      group.sort((a, b) => ((a.document.elevation ?? 0) - (b.document.elevation ?? 0))
        || (a.document.sort - b.document.sort) || a.id.localeCompare(b.id));
      group.forEach((t, i) => {
        const r = rects.get(t.id);
        next.set(t.id, fanLayout(group.length, i, r.w, r.h));
      });
    }
  }

  // A raised token covering a smaller, lower token: it stays on top but turns see-through, and clicks over the
  // lower token reach it.
  const opacity = setting("raisedOpacity");
  if ( opacity < 1 ) {
    for ( const [upper, holes] of raisedCover(shown, rects) ) {
      next.set(upper.id, { ...(next.get(upper.id) ?? { f: 1, dx: 0, dy: 0 }), alpha: opacity, holes });
    }
  }

  // Mounts: a saddle badge outside the corner marks the pair without covering either token.
  if ( setting("mountBadge") ) {
    for ( const t of tokens ) {
      if ( !getRiderOf(t.document) ) continue;
      next.set(t.id, { ...(next.get(t.id) ?? { f: 1, dx: 0, dy: 0 }), badge: controlOf(t.document) });
    }
  }

  const previous = desired;
  desired = next;
  for ( const t of tokens ) {
    if ( !sameTransform(previous.get(t.id), next.get(t.id)) ) t.renderFlags.set({ refreshPosition: true });
  }
}

/* -------------------------------------------- */
/*  Stacking order (GM)                         */
/* -------------------------------------------- */

export function scheduleSort(scene) {
  if ( !scene || !game.user?.isActiveGM || !setting("stackOrder") ) return;
  clearTimeout(sortTimers.get(scene.id));
  sortTimers.set(scene.id, setTimeout(() => {
    sortTimers.delete(scene.id);
    applyStackOrder(scene).catch(err => console.error(`${MODULE_ID} | stacking order update failed`, err));
  }, 250));
}

/** Bottom-to-top order for overlapping tokens: larger first, riders above their mounts, otherwise keep order. */
export function compareStack(a, b) {
  const area = d => d.width * d.height;
  return (area(b) - area(a))
    || (sizeRank(b) - sizeRank(a))
    || ((getMountOf(a) ? 1 : 0) - (getMountOf(b) ? 1 : 0))
    || ((a.sort ?? 0) - (b.sort ?? 0))
    || a.id.localeCompare(b.id);
}

/** Compute the sort updates needed so smaller tokens render and click above the larger tokens they overlap. */
export function stackOrderUpdates(docs) {
  const rects = new Map(docs.map(d => [d.id, tokenRect(d)]));
  const clusters = groupBy(docs, (a, b) => (a.elevation === b.elevation) && sameLevel(a, b)
    && (intersectArea(rects.get(a.id), rects.get(b.id)) > 1));
  const updates = [];
  for ( const cluster of clusters ) {
    if ( cluster.length < 2 ) continue;
    const order = [...cluster].sort(compareStack);
    const current = cluster.map(d => d.sort ?? 0).sort((x, y) => x - y);
    const distinct = current.every((v, i) => (i === 0) || (v > current[i - 1]));
    const values = distinct ? current : current.map((_, i) => current[0] + i);
    order.forEach((d, i) => {
      if ( (d.sort ?? 0) !== values[i] ) updates.push({ _id: d.id, sort: values[i] });
    });
  }
  return updates;
}

async function applyStackOrder(scene) {
  if ( !game.user.isActiveGM || !setting("stackOrder") ) return;
  const updates = stackOrderUpdates(scene.tokens.contents);
  if ( updates.length ) {
    await scene.updateEmbeddedDocuments("Token", updates, { primalMounts: { sort: true, internal: true } });
  }
}
