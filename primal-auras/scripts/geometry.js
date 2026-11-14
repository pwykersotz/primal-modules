import { getSetting } from "./constants.js";
import { effectiveShape } from "./data.js";

const EPS = 1e-4;

/* -------------------------------------------- */
/*  Token measurements (document based, so they */
/*  work for any scene, not just the canvas)    */
/* -------------------------------------------- */

export function tokenSize(doc) {
  const grid = doc.parent?.grid;
  if (typeof doc.getSize === "function") {
    try { const s = doc.getSize(); if (s?.width) return { width: s.width, height: s.height }; } catch { /* fall through */ }
  }
  const sx = grid?.sizeX ?? grid?.size ?? 100;
  const sy = grid?.sizeY ?? grid?.size ?? 100;
  return { width: doc.width * sx, height: doc.height * sy };
}

export function tokenCenter(doc) {
  if (typeof doc.getCenterPoint === "function") {
    try { const c = doc.getCenterPoint(); if (Number.isFinite(c?.x)) return { x: c.x, y: c.y }; } catch { /* fall through */ }
  }
  const { width, height } = tokenSize(doc);
  return { x: doc.x + width / 2, y: doc.y + height / 2 };
}

export function tokenRect(doc) {
  const { width, height } = tokenSize(doc);
  return { x: doc.x, y: doc.y, w: width, h: height };
}

export function occupiedOffsets(doc) {
  const grid = doc.parent?.grid;
  if (!grid || grid.isGridless) return [];
  if (typeof doc.getOccupiedGridSpaceOffsets === "function") {
    try { const o = doc.getOccupiedGridSpaceOffsets(); if (o?.length) return o.map(({ i, j }) => ({ i, j })); } catch { /* fall through */ }
  }
  if (grid.isSquare) {
    const i0 = Math.floor((doc.y + 1) / grid.sizeY);
    const j0 = Math.floor((doc.x + 1) / grid.sizeX);
    const h = Math.max(1, Math.round(doc.height));
    const w = Math.max(1, Math.round(doc.width));
    const out = [];
    for (let di = 0; di < h; di++) for (let dj = 0; dj < w; dj++) out.push({ i: i0 + di, j: j0 + dj });
    return out;
  }
  return [grid.getOffset(tokenCenter(doc))];
}

export function pixelsPerUnit(scene) {
  const d = scene?.dimensions;
  if (d?.distancePixels) return d.distancePixels;
  const grid = scene?.grid;
  return (grid?.size ?? 100) / (grid?.distance || 5);
}

/* -------------------------------------------- */
/*  Grid distance                               */
/* -------------------------------------------- */

/** Number of grid steps between two squares that are dx, dy squares apart, honouring the scene's diagonal rule. */
export function squareSteps(dx, dy, diagonals) {
  const D = CONST.GRID_DIAGONALS ?? {};
  const mx = Math.max(dx, dy);
  const mn = Math.min(dx, dy);
  switch (diagonals) {
    case D.EXACT: return (mx - mn) + mn * Math.SQRT2;
    case D.APPROXIMATE: return (mx - mn) + mn * 1.5;
    case D.RECTILINEAR:
    case D.ILLEGAL: return dx + dy;
    case D.ALTERNATING_1: return mx + Math.floor(mn / 2);
    case D.ALTERNATING_2: return mx + Math.ceil(mn / 2);
    case D.EQUIDISTANT:
    default: return mx;
  }
}

function cubeOf(grid, offset) {
  const c = grid.offsetToCube(offset);
  return { q: c.q, r: c.r, s: c.s ?? (-c.q - c.r) };
}
const cubeDistance = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;

/**
 * Grid spaces covered by a grid-shaped aura, measured outward from the spaces the token occupies.
 * @returns {Map<string,{i:number,j:number}>}
 */
export function computeGridCells(doc, aura) {
  const scene = doc.parent;
  const grid = scene?.grid;
  const cells = new Map();
  if (!grid || grid.isGridless) return cells;
  const occ = occupiedOffsets(doc);
  if (!occ.length) return cells;
  const unit = grid.distance || 5;
  const R = aura.radius;
  const inner = aura.innerRadius > 0 ? aura.innerRadius : -1;
  const reach = Math.ceil(R / unit) + 1;
  const keep = d => d <= R + EPS && d > inner + EPS;

  if (grid.isSquare) {
    const iMin = Math.min(...occ.map(o => o.i)), iMax = Math.max(...occ.map(o => o.i));
    const jMin = Math.min(...occ.map(o => o.j)), jMax = Math.max(...occ.map(o => o.j));
    for (let i = iMin - reach; i <= iMax + reach; i++) {
      for (let j = jMin - reach; j <= jMax + reach; j++) {
        const di = Math.max(0, iMin - i, i - iMax);
        const dj = Math.max(0, jMin - j, j - jMax);
        const d = squareSteps(di, dj, grid.diagonals) * unit;
        if (keep(d)) cells.set(`${i},${j}`, { i, j });
      }
    }
    return cells;
  }

  // Hexagonal grids
  const occCubes = occ.map(o => cubeOf(grid, o));
  const center = grid.getOffset(tokenCenter(doc));
  const span = reach + Math.ceil(Math.max(doc.width, doc.height)) + 1;
  for (let i = center.i - span; i <= center.i + span; i++) {
    for (let j = center.j - span; j <= center.j + span; j++) {
      const cube = cubeOf(grid, { i, j });
      let best = Infinity;
      for (const oc of occCubes) best = Math.min(best, cubeDistance(cube, oc));
      const d = best * unit;
      if (keep(d)) cells.set(`${i},${j}`, { i, j });
    }
  }
  return cells;
}

/** Circle radii in pixels (outer, and inner when the aura is a donut). */
export function circleGeometry(doc, aura) {
  const ppu = pixelsPerUnit(doc.parent);
  const { width, height } = tokenSize(doc);
  const base = aura.measureFrom === "edge" ? Math.max(width, height) / 2 : 0;
  return {
    center: tokenCenter(doc),
    outer: base + aura.radius * ppu,
    inner: aura.innerRadius > 0 ? base + aura.innerRadius * ppu : 0
  };
}

/* -------------------------------------------- */
/*  Containment                                 */
/* -------------------------------------------- */

function wallBlocked(scene, from, to) {
  if (!canvas?.ready || canvas.scene?.id !== scene.id) return false;
  const backend = CONFIG.Canvas?.polygonBackends?.move;
  if (!backend?.testCollision) return false;
  try {
    return !!backend.testCollision(from, to, { type: "move", mode: "any" });
  } catch {
    return false;
  }
}

/**
 * Is a target token inside an aura instance?
 * @param {{sourceDoc:TokenDocument, aura:object, shape?:string, cells?:Map}} inst
 */
export function isTokenInAura(inst, targetDoc) {
  const { sourceDoc, aura } = inst;
  const scene = sourceDoc.parent;
  if (!scene || targetDoc.parent?.id !== scene.id) return false;

  // Scene levels (v14): tokens on different levels never share an aura.
  if (sourceDoc.level != null && targetDoc.level != null && sourceDoc.level !== targetDoc.level) return false;
  if (getSetting("considerElevation")) {
    const dz = Math.abs((sourceDoc.elevation ?? 0) - (targetDoc.elevation ?? 0));
    if (dz > aura.radius + EPS) return false;
  }

  const mode = getSetting("targetInclusion") ?? "any";
  const shape = inst.shape ?? effectiveShape(aura, scene);
  let inside;

  if (shape === "grid") {
    inst.cells ??= computeGridCells(sourceDoc, aura);
    if (mode === "center") {
      const o = scene.grid.getOffset(tokenCenter(targetDoc));
      inside = inst.cells.has(`${o.i},${o.j}`);
    } else {
      inside = occupiedOffsets(targetDoc).some(o => inst.cells.has(`${o.i},${o.j}`));
    }
  } else {
    inst.circle ??= circleGeometry(sourceDoc, aura);
    const { center, outer, inner } = inst.circle;
    if (mode === "center") {
      const c = tokenCenter(targetDoc);
      const d = Math.hypot(c.x - center.x, c.y - center.y);
      inside = d <= outer + EPS && (inner <= 0 || d > inner + EPS);
    } else {
      const r = tokenRect(targetDoc);
      const nx = Math.max(r.x - center.x, 0, center.x - (r.x + r.w));
      const ny = Math.max(r.y - center.y, 0, center.y - (r.y + r.h));
      // Distance to the closest point of the target's space: inside the outer edge, and (for a
      // donut) not reaching into the hole, i.e. the creature is between `inner` and `outer` away.
      const near = Math.hypot(nx, ny);
      inside = near < outer - EPS && (inner <= 0 || near > inner - EPS);
    }
  }
  if (!inside) return false;
  if (aura.wallsBlock && sourceDoc.id !== targetDoc.id) {
    const from = { ...tokenCenter(sourceDoc), elevation: sourceDoc.elevation ?? 0 };
    const to = { ...tokenCenter(targetDoc), elevation: targetDoc.elevation ?? 0 };
    if (wallBlocked(scene, from, to)) return false;
  }
  return true;
}
