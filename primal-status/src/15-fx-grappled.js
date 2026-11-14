/* ---------- Grappled: talons, chains and red glow (or your own image) ---------- */

const GRIP = {
  talon: 0x141016,         // glossy black talons
  talonEdge: 0x050406,
  gloss: 0x9C96A6,         // highlight along each talon
  finger: 0x27202A,        // dark knuckled fingers outside the rim
  fingerEdge: 0x0B090C,
  glow: 0xFF0A0A,          // red glow and energy
  chain: 0x8F8F9C, chainDark: 0x2A2A32,
  gripSeconds: 0.9,        // talons close in when the condition is applied
  squeezeSeconds: 3.2      // a hard squeeze every few seconds
};

// Talons: angle around the token where the finger comes in, and how the talon curls (radians)
// (curl > 0 hooks the talon clockwise; each one hooks away from the middle so they grip around the creature)
const GRIP_TALONS = [
  { a: -2.3, curl: -0.85, size: 0.95 }, { a: -1.85, curl: -0.6, size: 1.08 }, { a: -1.29, curl: 0.6, size: 1.08 }, { a: -0.84, curl: 0.85, size: 0.95 },
  { a: 0.84, curl: -0.85, size: 0.95 }, { a: 1.29, curl: -0.6, size: 1.08 }, { a: 1.85, curl: 0.6, size: 1.08 }, { a: 2.3, curl: 0.85, size: 0.95 }
];

/** The user's chosen overlay image for Grappled, if any. */
function grappleImageSrc() {
  try {
    const src = String(game.settings.get(MODULE_ID, "grappleImagePath") ?? "").trim();
    return GRAPPLE_OLD_DEFAULTS.includes(src) ? GRAPPLE_DEFAULT_IMAGE : src;   // upgrade earlier bundled art
  }
  catch { return ""; }
}

function createGrappleFx(token) {
  return grappleImageSrc() ? createGrappleImageFx(token, grappleImageSrc()) : createGrappleTalonFx(token);
}

function updateGrappleFx(token, fx, ctx) {
  return fx.isImage ? updateGrappleImageFx(token, fx, ctx) : updateGrappleTalonFx(token, fx, ctx);
}

/** Grip timing shared by both styles: 0 → 1 as it closes, plus a periodic squeeze. */
function gripState(fx, now) {
  const t = clamp01((now - fx.start) / (GRIP.gripSeconds * 1000));
  const closed = 1 - Math.pow(1 - t, 3);
  const T = now / 1000;
  const squeeze = t < 1 ? 0 : Math.pow(Math.max(0, Math.sin((T / GRIP.squeezeSeconds) * Math.PI * 2)), 6);
  const tremor = squeeze > 0.05 ? Math.sin(T * 31) * squeeze : 0;
  return { t, closed, squeeze, tremor, T };
}

/* ----- Built-in style ----- */

function createGrappleTalonFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { glow: newBlur(8, 4, ADD), chainGlow: newBlur(4, 3, ADD), shadow: newBlur(4, 3) };
  const chainGlow = new PIXI.Graphics(); chainGlow.blendMode = ADD; chainGlow.filters = [blurs.chainGlow];
  const chains = new PIXI.Graphics();
  const glow = new PIXI.Graphics(); glow.blendMode = ADD; glow.filters = [blurs.glow];
  const shadow = new PIXI.Graphics(); shadow.filters = [blurs.shadow];
  const talons = new PIXI.Graphics();
  const sparks = new PIXI.Graphics(); sparks.blendMode = ADD;
  container.addChild(chainGlow, chains, glow, shadow, talons, sparks);
  return { container, blurs, chainGlow, chains, glow, shadow, talons, sparks, start: performance.now(),
    seed: hashString(`${token.document.id ?? token.id ?? ""}-grip`), w: 0, h: 0 };
}

/** Outline of one talon (finger + curved claw) as a polygon, in pixels. */
function talonShape(cx, cy, rx, ry, spec, inset, scale) {
  const a = spec.a, curl = spec.curl, k = spec.size * scale;
  const out = [Math.cos(a), Math.sin(a)], inn = [-out[0], -out[1]], side = [-out[1], out[0]];
  const at = (rad) => [cx + out[0] * rx * rad, cy + out[1] * ry * rad];
  const R = Math.min(rx, ry);
  // Centre line: from outside the rim, over it, curving inward and hooking
  const base = at(1.32 - inset * 0.1), rim = at(1.0 - inset * 0.08);
  const len = R * 0.56 * k;
  const ctrl = [rim[0] + inn[0] * len * 0.7 + side[0] * curl * len * 0.05, rim[1] + inn[1] * len * 0.7 + side[1] * curl * len * 0.05];
  const tip = [rim[0] + inn[0] * len * (0.62 + inset * 0.12) + side[0] * curl * len * 0.7,
    rim[1] + inn[1] * len * (0.62 + inset * 0.12) + side[1] * curl * len * 0.7];
  const steps = 14, wBase = R * 0.19 * k, left = [], right = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const x = u * u * rim[0] + 2 * u * t * ctrl[0] + t * t * tip[0];
    const y = u * u * rim[1] + 2 * u * t * ctrl[1] + t * t * tip[1];
    const dx = 2 * u * (ctrl[0] - rim[0]) + 2 * t * (tip[0] - ctrl[0]), dy = 2 * u * (ctrl[1] - rim[1]) + 2 * t * (tip[1] - ctrl[1]);
    const m = Math.hypot(dx, dy) || 1, nx = -dy / m, ny = dx / m;
    const wd = wBase * 0.5 * Math.pow(1 - t, 0.85);
    left.push([x + nx * wd, y + ny * wd]); right.push([x - nx * wd, y - ny * wd]);
  }
  return { base, rim, tip, left, right, wBase, out, side };
}

function drawTalons(g, w, h, inset, scale, mode) {
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2, R = Math.min(rx, ry);
  const round = PIXI.LINE_CAP?.ROUND ?? "round", join = PIXI.LINE_JOIN?.ROUND ?? "round";
  for (const spec of GRIP_TALONS) {
    const s = talonShape(cx, cy, rx, ry, spec, inset, scale);
    const finger = [s.base, s.rim];
    const fw = s.wBase * 1.05;
    if (mode === "glow" || mode === "shadow") {
      const color = mode === "glow" ? GRIP.glow : 0x000000;
      g.lineStyle({ width: fw * (mode === "glow" ? 1.6 : 1.2), color, alpha: 1, cap: round });
      g.moveTo(...finger[0]); g.lineTo(...finger[1]);
      g.lineStyle({ width: R * (mode === "glow" ? 0.09 : 0.03), color, alpha: 1, join });
      g.beginFill(color, 1).drawPolygon([...s.left.flat(), ...s.right.slice().reverse().flat()]).endFill();
      continue;
    }
    // Finger: dark, heavy and knuckled, reaching over the rim
    const mid = [(s.base[0] + s.rim[0]) / 2, (s.base[1] + s.rim[1]) / 2];
    const edgeW = Math.max(2, R * 0.025);
    g.lineStyle({ width: fw + edgeW, color: GRIP.fingerEdge, alpha: 1, cap: round });
    g.moveTo(...finger[0]); g.lineTo(...finger[1]);
    g.lineStyle(0);
    g.beginFill(GRIP.fingerEdge, 1).drawCircle(mid[0], mid[1], fw * 0.62 + edgeW / 2).endFill();
    g.lineStyle({ width: fw, color: GRIP.finger, alpha: 1, cap: round });
    g.moveTo(...finger[0]); g.lineTo(...finger[1]);
    g.lineStyle(0);
    g.beginFill(GRIP.finger, 1).drawCircle(mid[0], mid[1], fw * 0.62).endFill();
    g.beginFill(GRIP.gloss, 0.3).drawCircle(mid[0] + s.side[0] * fw * 0.25 - s.out[0] * fw * 0.1, mid[1] + s.side[1] * fw * 0.25 - s.out[1] * fw * 0.1, fw * 0.16).endFill();
    g.lineStyle({ width: Math.max(0.75, fw * 0.08), color: GRIP.fingerEdge, alpha: 0.9, cap: round });
    g.moveTo(mid[0] - s.side[0] * fw * 0.42, mid[1] - s.side[1] * fw * 0.42);
    g.lineTo(mid[0] + s.side[0] * fw * 0.42, mid[1] + s.side[1] * fw * 0.42);
    g.lineStyle({ width: Math.max(0.75, fw * 0.16), color: GRIP.gloss, alpha: 0.25, cap: round });
    g.moveTo(s.base[0] + s.side[0] * fw * 0.22, s.base[1] + s.side[1] * fw * 0.22);
    g.lineTo(s.rim[0] + s.side[0] * fw * 0.22, s.rim[1] + s.side[1] * fw * 0.22);
    // Talon: glossy black, curved and tapering to a point
    g.lineStyle({ width: Math.max(1, R * 0.018), color: GRIP.talonEdge, alpha: 1, join });
    g.beginFill(GRIP.talon, 1).drawPolygon([...s.left.flat(), ...s.right.slice().reverse().flat()]).endFill();
    // Gloss: a bright streak along one side, fading toward the tip
    for (let i = 0; i < s.left.length - 2; i++) {
      const t = i / (s.left.length - 1);
      const a = s.left[i], b = s.left[i + 1], ca = s.right[i], cb = s.right[i + 1];
      const p1 = [a[0] * 0.7 + ca[0] * 0.3, a[1] * 0.7 + ca[1] * 0.3], p2 = [b[0] * 0.7 + cb[0] * 0.3, b[1] * 0.7 + cb[1] * 0.3];
      g.lineStyle({ width: Math.max(0.75, s.wBase * 0.13 * (1 - t)), color: GRIP.gloss, alpha: 0.75 * (1 - t), cap: round });
      g.moveTo(...p1); g.lineTo(...p2);
    }
  }
}

/** A chain from p1 to p2 with alternating links, sagging slightly. */
function drawChain(g, p1, p2, R, sag, glow) {
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), linkL = R * 0.11, n = Math.max(3, Math.floor(len / (linkL * 0.75)));
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, u = 1 - t;
    const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2 + sag;
    const x = u * u * p1[0] + 2 * u * t * mx + t * t * p2[0], y = u * u * p1[1] + 2 * u * t * my + t * t * p2[1];
    const dx = 2 * u * (mx - p1[0]) + 2 * t * (p2[0] - mx), dy = 2 * u * (my - p1[1]) + 2 * t * (p2[1] - my);
    const ang = Math.atan2(dy, dx), c = Math.cos(ang), s = Math.sin(ang);
    if (glow) {
      g.lineStyle({ width: R * 0.05, color: GRIP.glow, alpha: 1, cap: round });
      g.moveTo(x - c * linkL * 0.45, y - s * linkL * 0.45); g.lineTo(x + c * linkL * 0.45, y + s * linkL * 0.45);
      continue;
    }
    if (i % 2 === 0) {
      // Link seen face-on: an elongated ring
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const a = (k / 16) * Math.PI * 2, ex = Math.cos(a) * linkL * 0.5, ey = Math.sin(a) * linkL * 0.24;
        pts.push(x + ex * c - ey * s, y + ex * s + ey * c);
      }
      g.lineStyle({ width: Math.max(1.5, R * 0.03), color: GRIP.chainDark, alpha: 1 });
      g.drawPolygon(pts);
      g.lineStyle({ width: Math.max(1, R * 0.018), color: GRIP.chain, alpha: 1 });
      g.drawPolygon(pts);
    } else {
      // Link seen edge-on: a short bar
      g.lineStyle({ width: Math.max(2, R * 0.034), color: GRIP.chainDark, alpha: 1, cap: round });
      g.moveTo(x - c * linkL * 0.42, y - s * linkL * 0.42); g.lineTo(x + c * linkL * 0.42, y + s * linkL * 0.42);
      g.lineStyle({ width: Math.max(1, R * 0.02), color: GRIP.chain, alpha: 1, cap: round });
      g.moveTo(x - c * linkL * 0.4, y - s * linkL * 0.4); g.lineTo(x + c * linkL * 0.4, y + s * linkL * 0.4);
    }
  }
}

function updateGrappleTalonFx(token, fx, { now, zoom }) {
  const w = token.w, h = token.h, R = Math.min(w, h) / 2;
  const { t, closed, squeeze, tremor, T } = gripState(fx, now);
  const sizeChanged = fx.w !== w || fx.h !== h;
  fx.w = w; fx.h = h;
  fx.blurs.glow.blur = R * 0.07 * zoom;
  fx.blurs.chainGlow.blur = Math.max(1, R * 0.04 * zoom);
  fx.blurs.shadow.blur = Math.max(1, R * 0.04 * zoom);

  // Chains crossing the creature (drawn once)
  if (sizeChanged || !fx.chainsDrawn) {
    fx.chains.clear(); fx.chainGlow.clear();
    const P = (u, v) => [w / 2 + u * w / 2, h / 2 + v * h / 2];
    for (const [a, b, sag] of [[P(-1.05, -0.55), P(1.05, 0.6), R * 0.12], [P(-1.05, 0.5), P(1.05, -0.45), R * 0.1]]) {
      drawChain(fx.chainGlow, a, b, R, sag, true);
      drawChain(fx.chains, a, b, R, sag, false);
    }
    fx.chainsDrawn = true;
  }

  // Talons close in, then press harder on each squeeze
  const inset = closed * (0.6 + 0.4 * closed) + 0.35 * squeeze;
  const scale = 0.85 + 0.15 * closed + 0.04 * squeeze;
  if (sizeChanged || fx.lastInset !== inset) {
    fx.talons.clear(); fx.glow.clear(); fx.shadow.clear();
    drawTalons(fx.glow, w, h, inset, scale, "glow");
    drawTalons(fx.shadow, w, h, inset, scale, "shadow");
    drawTalons(fx.talons, w, h, inset, scale, "solid");
    fx.lastInset = inset;
  }
  const jitter = R * 0.008 * tremor;
  fx.talons.position.set(jitter, -jitter * 0.6);
  fx.shadow.position.set(R * 0.03 + jitter, R * 0.05);
  const pulse = 0.5 + 0.5 * Math.sin(T * 2.4);
  fx.glow.alpha = (0.75 + 0.2 * pulse + 0.25 * squeeze) * clamp01(t * 2);
  fx.shadow.alpha = 0.5 * clamp01(t * 2);
  fx.talons.alpha = clamp01(t * 3);
  fx.chains.alpha = fx.chainGlow.alpha = clamp01((t - 0.3) * 2);
  fx.chainGlow.alpha *= 0.35 + 0.25 * pulse + 0.3 * squeeze;

  // Red energy crackling along the chains and near the talons
  const g = fx.sparks;
  g.clear();
  const rand = seededRandom(fx.seed + Math.floor(T * 12));
  for (let k = 0; k < 4; k++) {
    if (rand() > 0.55 + 0.4 * squeeze) continue;
    const a = rand() * Math.PI * 2, rad = 0.65 + rand() * 0.4;
    let x = w / 2 + Math.cos(a) * w / 2 * rad, y = h / 2 + Math.sin(a) * h / 2 * rad;
    g.lineStyle({ width: Math.max(0.75, R * 0.015), color: 0xFF6A6A, alpha: 0.9 });
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (rand() - 0.5) * R * 0.18; y += (rand() - 0.5) * R * 0.18; g.lineTo(x, y); }
  }
  g.alpha = clamp01(t * 2);

  const dark = 1 - 0.1 * squeeze;
  return { tint: [dark, dark * 0.96, dark * 0.96], alpha: 1 };
}

/* ----- Your own image ----- */

function loadTextureFor(src) {
  try {
    const loader = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
    if (typeof loader === "function") return Promise.resolve(loader(src));
    return Promise.resolve(PIXI.Texture.from(src));
  } catch (err) {
    return Promise.reject(err);
  }
}

function createGrappleImageFx(token, src) {
  const container = newFxContainer();
  const holder = new PIXI.Container();
  container.addChild(holder);
  const fx = { container, blurs: {}, holder, isImage: true, src, sprite: null };
  loadTextureFor(src).then(tex => {
    if (container.destroyed || !tex) return;
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor?.set?.(0.5);
    holder.addChild(sprite);
    fx.sprite = sprite;
  }).catch(err => console.warn(`${MODULE_ID} | Could not load the Grappled image "${src}"`, err));
  return fx;
}

// The bundled hand wraps a circle centred in its image with a radius of 0.312 × the image's size.
// GRAPPLE_FIT places that circle just inside the visible edge of the creature's art, so the
// forearm overlaps the token's rim and the claws dig about half way in.
const GRAPPLE_HAND_GRIP = 0.312;
const GRAPPLE_FIT = 0.82;

/** A still image, centred on the visible part of the creature's art and sized to it. */
function updateGrappleImageFx(token, fx) {
  const art = artCircle(token);
  if (fx.sprite) {
    const tex = fx.sprite.texture;
    const size = Math.max(tex?.width ?? 1, tex?.height ?? 1) || 1;
    let k = 1;
    try { k = Number(game.settings.get(MODULE_ID, "grappleImageFit")) || 1; } catch { /* default */ }
    const shown = (art.r * GRAPPLE_FIT * k) / GRAPPLE_HAND_GRIP;   // on-screen size of the image
    fx.sprite.scale.set(shown / size);
  }
  fx.holder.position.set(art.x, art.y);
  return { tint: [1, 1, 1], alpha: 1 };
}

/* ----- Where a token's art actually is ----- */

const artShapes = new Map();   // texture key → visible circle in texture pixels (or null)
const ART_SAMPLE = 128;        // art is measured at this resolution
const ART_OPAQUE = 128;        // alpha (0–255) a pixel needs to count as part of the art

/**
 * The visible part of the token's art as a circle in effect space (the art box: 0, 0 is its
 * top-left, w × h its size). Token images often have a transparent border, so this measures
 * the opaque pixels instead of trusting the image's bounds. Falls back to the whole box.
 */
function artCircle(view) {
  const w = view.w, h = view.h;
  const whole = { x: w / 2, y: h / 2, r: Math.min(w, h) / 2 };
  if (view.document?.ring?.enabled) return whole;   // dynamic token rings fill the box
  const tex = view.mesh?.texture;
  const shape = measureArt(tex);
  if (!shape) return whole;
  const tw = tex.width || 1, th = tex.height || 1;
  const sx = w / tw, sy = h / th;
  let x = shape.x, y = shape.y;
  if (Number(view.document?.texture?.scaleX) < 0) x = tw - x;   // mirrored art
  if (Number(view.document?.texture?.scaleY) < 0) y = th - y;
  return { x: x * sx, y: y * sy, r: shape.r * (sx + sy) / 2 };
}

/** Measure (once per texture) the circle the opaque part of an image fills, in texture pixels. */
function measureArt(tex) {
  const base = tex?.baseTexture;
  if (!base || base.valid === false || !(tex.width > 1 && tex.height > 1)) return null;
  const f = tex.frame ?? { x: 0, y: 0, width: tex.width, height: tex.height };
  const key = `${base.uid ?? base.cacheId ?? ""}|${base.cacheId ?? ""}|${f.x},${f.y},${f.width},${f.height}`;
  if (artShapes.has(key)) return artShapes.get(key);
  let shape = null;
  try {
    const sample = readAlpha(tex);
    const fit = sample && fitArtCircle(sample.alpha, sample.w, sample.h);
    if (fit) {
      const k = tex.width / sample.w;
      shape = { x: fit.x * k, y: fit.y * k, r: fit.r * k };
    }
  } catch (err) {
    console.debug(`${MODULE_ID} | Could not measure token art; using its full size`, err);
  }
  artShapes.set(key, shape);
  return shape;
}

/** The image's alpha channel at a small size: { alpha: Uint8Array, w, h }. */
function readAlpha(tex) {
  const scale = ART_SAMPLE / Math.max(tex.width, tex.height);
  const w = Math.max(1, Math.round(tex.width * scale)), h = Math.max(1, Math.round(tex.height * scale));
  const pick = rgba => {
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    return { alpha, w, h };
  };
  // 1) Draw the source image onto a small 2D canvas (cheap; fails for cross-origin art)
  const base = tex.baseTexture, src = base?.resource?.source;
  const drawable = src && ["HTMLImageElement", "HTMLCanvasElement", "HTMLVideoElement", "ImageBitmap", "OffscreenCanvas"]
    .some(n => typeof globalThis[n] === "function" && src instanceof globalThis[n]);
  if (drawable) {
    try {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      const f = tex.frame ?? { x: 0, y: 0, width: tex.width, height: tex.height }, res = base.resolution || 1;
      ctx.drawImage(src, f.x * res, f.y * res, f.width * res, f.height * res, 0, 0, w, h);
      return pick(ctx.getImageData(0, 0, w, h).data);
    } catch { /* try the renderer instead */ }
  }
  // 2) Render the texture into a small render texture and read it back from the GPU
  const renderer = canvas?.app?.renderer;
  if (!renderer?.extract || !PIXI.RenderTexture) return null;
  const rt = PIXI.RenderTexture.create({ width: w, height: h });
  const sprite = new PIXI.Sprite(tex);
  try {
    sprite.scale.set(w / tex.width, h / tex.height);
    renderer.render(sprite, { renderTexture: rt, clear: true });
    return pick(renderer.extract.pixels(rt));
  } finally {
    sprite.destroy();
    rt.destroy(true);
  }
}

/**
 * Fit a circle to the outline of the opaque pixels: cast rays out from the middle, take the
 * outermost opaque point on each, ignore stray bits (fur, smoke, weapons poking out of a frame)
 * that stick out much further than the rest, and fit a circle through what's left.
 */
function fitArtCircle(alpha, w, h) {
  const opaque = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    return xi >= 0 && yi >= 0 && xi < w && yi < h && alpha[yi * w + xi] >= ART_OPAQUE;
  };
  const median = a => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const rays = 96, far = Math.hypot(w, h);
  let cx = w / 2, cy = h / 2, r = 0;
  for (let pass = 0; pass < 2; pass++) {
    const pts = [];
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      for (let d = far; d > 0; d -= 0.5) {
        const x = cx + dx * d, y = cy + dy * d;
        if (opaque(x, y)) { pts.push([x, y, d]); break; }
      }
    }
    if (pts.length < rays / 3) return null;
    const mid = median(pts.map(p => p[2]));
    const keep = pts.filter(p => Math.abs(p[2] - mid) <= mid * 0.15);
    const fit = keep.length >= 8 ? circleThrough(keep) : null;
    const size = Math.max(w, h);
    if (fit && Math.hypot(fit.x - w / 2, fit.y - h / 2) <= size * 0.2) { cx = fit.x; cy = fit.y; }
    r = median(keep.map(p => Math.hypot(p[0] - cx, p[1] - cy)));
  }
  // Ignore results that can't be the creature (a speck of paint on an otherwise empty image)
  return r >= Math.min(w, h) * 0.12 ? { x: cx, y: cy, r } : null;
}

/** Least-squares circle through points [[x, y], …]. */
function circleThrough(pts) {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const [x, y] of pts) {
    const u = x - mx, v = y - my;
    suu += u * u; svv += v * v; suv += u * v;
    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const bu = (suuu + suvv) / 2, bv = (svvv + svuu) / 2;
  const uc = (bu * svv - bv * suv) / det, vc = (bv * suu - bu * suv) / det;
  return { x: mx + uc, y: my + vc, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / n) };
}

