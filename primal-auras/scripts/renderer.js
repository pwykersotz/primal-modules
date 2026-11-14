import { getSetting } from "./constants.js";
import { getTokenAuras, isAuraActive, effectiveShape } from "./data.js";
import { computeGridCells, circleGeometry, pixelsPerUnit } from "./geometry.js";

const CHILD = Symbol("paAuras");

const colorNumber = hex => {
  try { return Number(foundry.utils.Color.from(hex)); }
  catch { return parseInt(String(hex).replace("#", ""), 16) || 0x3a86ff; }
};

/** Can the current user see this aura? */
function isVisibleTo(entry, token) {
  const { aura } = entry;
  const user = game.user;
  if (aura.visibility === "gm" && !user.isGM) return false;
  if (aura.visibility === "owner" && !(user.isGM || token.document.isOwner)) return false;
  switch (aura.showWhen) {
    case "hover": return !!(token.hover || token.controlled);
    case "controlled": return !!token.controlled;
    case "combat": return !!token.document.inCombat;
    default: return true;
  }
}

function container(token) {
  let c = token[CHILD];
  if (!c || c.destroyed || c.parent !== token) {
    c = new PIXI.Container();
    c.eventMode = "none";
    c.zIndex = -10;
    c.name = "primal-auras";
    token.addChildAt(c, 0);
    token[CHILD] = c;
  }
  return c;
}

/** Redraw every aura attached to a Token placeable. Safe to call often. */
export function refreshTokenAuras(token) {
  if (!token || token.destroyed || !token.document) return;
  const scene = token.document.parent;
  const entries = (getSetting("showAuras") === false) ? [] : getTokenAuras(token.document)
    .filter(e => isAuraActive(e) && isVisibleTo(e, token));
  if (!entries.length && !token[CHILD]) return;
  const c = container(token);
  for (const child of c.removeChildren()) child.destroy({ children: true });
  for (const entry of entries) {
    try {
      const g = drawAura(token, entry.aura, scene);
      if (g) c.addChild(g);
    } catch (err) {
      console.error("Primal Auras | Failed to draw aura", entry.aura.name, err);
    }
  }
}

export function refreshAllAuras() {
  if (!canvas?.ready) return;
  for (const token of canvas.tokens.placeables) refreshTokenAuras(token);
}

export function refreshActorAuras(actor) {
  if (!canvas?.ready || !actor) return;
  for (const token of actor.getActiveTokens?.() ?? []) refreshTokenAuras(token);
}

/* -------------------------------------------- */
/*  Drawing                                     */
/* -------------------------------------------- */

function drawAura(token, aura, scene) {
  const g = new PIXI.Graphics();
  const doc = token.document;
  const origin = { x: doc.x, y: doc.y };
  const shape = effectiveShape(aura, scene);
  if (shape === "grid") drawGrid(g, doc, aura, origin);
  else drawCircle(g, doc, aura, origin, scene);
  return g;
}

function wallPolygon(center, radius, doc) {
  const backend = CONFIG.Canvas?.polygonBackends?.move;
  if (!backend?.create) return null;
  try {
    const poly = backend.create({ x: center.x, y: center.y, elevation: doc.elevation ?? 0 }, { type: "move", radius });
    return poly?.points?.length >= 6 ? poly.points : null;
  } catch {
    return null;
  }
}

function drawCircle(g, doc, aura, origin, scene) {
  const { center, outer, inner } = circleGeometry(doc, aura);
  const cx = center.x - origin.x;
  const cy = center.y - origin.y;
  const fill = colorNumber(aura.fillColor);
  const border = colorNumber(aura.borderColor);

  let outerPoints = null;
  if (aura.wallsBlock && canvas.scene?.id === scene.id) {
    const pts = wallPolygon(center, outer, doc);
    if (pts) outerPoints = pts.map((v, i) => v - (i % 2 === 0 ? origin.x : origin.y));
  }
  const drawOuter = () => outerPoints ? g.drawPolygon(outerPoints) : g.drawCircle(cx, cy, outer);

  // Fill
  if (aura.fillAlpha > 0) {
    g.lineStyle(0);
    g.beginFill(fill, aura.fillAlpha);
    drawOuter();
    if (inner > 0) {
      g.beginHole();
      g.drawCircle(cx, cy, inner);
      g.endHole();
    }
    g.endFill();
  }
  // Borders
  if (aura.borderWidth > 0 && aura.borderAlpha > 0) {
    g.lineStyle({ width: aura.borderWidth, color: border, alpha: aura.borderAlpha, alignment: 0.5 });
    drawOuter();
    if (inner > 0) g.drawCircle(cx, cy, inner);
    g.lineStyle(0);
  }
}

function drawGrid(g, doc, aura, origin) {
  const grid = doc.parent.grid;
  const cells = computeGridCells(doc, aura);
  if (!cells.size) return;
  const fill = colorNumber(aura.fillColor);
  const border = colorNumber(aura.borderColor);
  const polys = [];
  for (const offset of cells.values()) {
    const verts = grid.getVertices(offset);
    polys.push(verts.map(p => ({ x: p.x - origin.x, y: p.y - origin.y })));
  }

  if (aura.fillAlpha > 0) {
    g.lineStyle(0);
    g.beginFill(fill, aura.fillAlpha);
    for (const poly of polys) g.drawPolygon(poly.flatMap(p => [p.x, p.y]));
    g.endFill();
  }

  if (aura.borderWidth > 0 && aura.borderAlpha > 0) {
    // Draw only the outline of the covered area: edges that belong to exactly one cell.
    const edges = new Map();
    const k = p => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;
    for (const poly of polys) {
      for (let n = 0; n < poly.length; n++) {
        const a = poly[n], b = poly[(n + 1) % poly.length];
        const ka = k(a), kb = k(b);
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const e = edges.get(key);
        if (e) e.count++;
        else edges.set(key, { a, b, count: 1 });
      }
    }
    g.lineStyle({ width: aura.borderWidth, color: border, alpha: aura.borderAlpha, alignment: 0.5 });
    for (const { a, b, count } of edges.values()) {
      if (count !== 1) continue;
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    g.lineStyle(0);
  }
}

/** Used by the HUD: approximate pixel size of one distance unit, for step sizes. */
export function unitStep(scene) {
  return scene?.grid?.distance || 5;
}
export { pixelsPerUnit };
