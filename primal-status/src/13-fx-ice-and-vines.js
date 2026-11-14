/* ---------- Frozen and Entangled: sealed in ice, bound by vines ---------- */

/*
 * Frozen: the creature turns to ice (a recoloured copy of its art, pale cyan with deep teal shadows)
 * inside a thick ring of faceted ice that glows a strong cold blue. Splinters fly off it and frost
 * mist rolls away. It freezes with a flash, a burst of splinters and a jolt, and cracks and shatters
 * when the status ends.
 *
 * Entangled: the paths of its vines (vinePlan), climbing its sides from the ground and binding it
 * across the body; the painted vines that follow them are in 13-fx-drakkenheim6.js.
 *
 * Both are laid out in the art's own circle, in units of its radius (the unit circle is the art's edge).
 */

const ICE = {
  light: [0xF4FCFF, 0xE4F7FF, 0xD0EFFF],     // facets facing the light (upper left)
  dark: [0xAEDDF5, 0x93CEEE, 0x7ABBE2],      // facets turned away from it
  deep: [0x5FB4E6, 0x4FA3DB],                 // the ring's darkest facets, where the ice is thickest
  edge: 0xFFFFFF,                             // facet edges, rims and glints
  outline: 0x1F5E8C,                          // a thin deep-blue line round the ice, so it reads on any map
  frost: 0xF2FBFF,                            // frost thickening inside the ring
  glow: 0x2FA8FF,                             // the strong cold glow round it
  mist: 0xDDF3FF,                             // frost mist billowing off it
  crystal: { light: 0xF2FBFF, mid: 0xB4E2FA, dark: 0x6FAED8, line: 0x2A6796 },
  ringInner: 0.93, ringOuter: 1.15,           // the ice ring, in units of the art's radius
  tint: [0.6, 0.79, 1],                       // the art beneath, turned cold (when it can't be turned to ice)
  appearSeconds: 0.9,
  shatterSeconds: 0.9,
  sheenEvery: 5.5,                            // a cold sheen sweeps across every few seconds…
  sheenSeconds: 1.3,                          // …taking this long
  shards: 14,                                 // splinters of ice flying off it all the time
  burst: 28,                                  // …and in a burst as it freezes and as it shatters
  mistPuffs: 7
};

const VINES = {
  growSeconds: 1.1,
  snapSeconds: 0.7,
  squeezeSeconds: 3.4,                        // the binding vines tighten every few seconds
  tint: [0.9, 0.97, 0.85]
};

const TAU = Math.PI * 2;
const easeOutCubic = x => 1 - (1 - x) ** 3;
const easeOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
const mixTint = (tint, k) => tint.map(c => 1 + (c - 1) * k);

/* ---------- Frozen ---------- */

/** Points round two rings joined into triangles (each ring sorted by angle, both starting near 0). */
function zipRings(A, B) {
  const tris = [], n = A.length, m = B.length;
  const angA = i => A[i % n].a + TAU * Math.floor(i / n), angB = j => B[j % m].a + TAU * Math.floor(j / m);
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (j >= m || (i < n && angA(i + 1) <= angB(j + 1))) { tris.push([A[i % n], A[(i + 1) % n], B[j % m]]); i++; }
    else { tris.push([A[i % n], B[j % m], B[(j + 1) % m]]); j++; }
  }
  return tris;
}

/** How far round from the top a point is: 0 at the top, 1 at the bottom. */
function fromTop(x, y) {
  const a = Math.atan2(y, x) + Math.PI / 2;
  return Math.abs(((a + Math.PI) % TAU + TAU) % TAU - Math.PI) / Math.PI;
}

/** A triangle as a shaded piece of ice: its points, centre, which way it flies when the ice shatters, and how it's lit. */
function icePiece(t, rand, pickShade) {
  const cx = (t[0].x + t[1].x + t[2].x) / 3, cy = (t[0].y + t[1].y + t[2].y) / 3;
  const dist = Math.hypot(cx, cy);
  const out = dist > 0.05 ? [cx / dist, cy / dist] : [Math.cos(rand() * TAU), Math.sin(rand() * TAU)];
  // lit from the upper left, with some facets catching more light than their neighbours
  const lit = clamp01(0.5 + (-cx * 0.5 - cy * 0.7) * 0.55 + (rand() - 0.5) * 0.6);
  const shades = pickShade(lit);
  return { pts: t.flatMap(p => [p.x, p.y]), cx, cy, dist, out, color: shades[Math.floor(rand() * shades.length)],
    speed: 0.55 + rand() * 0.75, spin: (rand() - 0.5) * 7 };
}

/** Facets over the art itself, so it looks carved from ice: clearer in the middle, frostier toward the ring. */
function iceFacets(rand) {
  const rings = [[0, 1], [0.33, 6], [0.66, 11], [0.95, 17]];
  const pts = rings.map(([rad, n], k) => {
    if (n === 1) return [{ x: (rand() - 0.5) * 0.1, y: (rand() - 0.5) * 0.1, a: 0 }];
    return Array.from({ length: n }, (_, i) => {
      const a = ((i + rand() * 0.4) / n) * TAU;
      const rr = k === rings.length - 1 ? rad : rad * (0.88 + rand() * 0.24);
      return { x: Math.cos(a) * rr, y: Math.sin(a) * rr, a };
    });
  });
  const tris = [];
  const centre = pts[0][0], first = pts[1];
  for (let i = 0; i < first.length; i++) tris.push([centre, first[i], first[(i + 1) % first.length]]);
  for (let k = 1; k < pts.length - 1; k++) tris.push(...zipRings(pts[k], pts[k + 1]));
  return tris.map(t => {
    const f = icePiece(t, rand, lit => lit > 0.5 ? ICE.light : ICE.dark);
    return { ...f, alpha: 0.2 + 0.3 * f.dist + rand() * 0.14, edgeAlpha: rand() < 0.35 ? 0.05 : 0.15 + rand() * 0.3,
      reveal: 0.15 + (1 - Math.min(1, f.dist)) * 0.45 };   // the edge freezes first, the middle last
  });
}

/** Fine frost cracks creeping in from the edge, each with a branch. */
function iceVeins(rand) {
  return Array.from({ length: 8 }, (_, i) => {
    let a = ((i + 0.2 + rand() * 0.6) / 8) * TAU, rad = 0.93;
    const reach = 0.5 + rand() * 0.25, pts = [[Math.cos(a) * rad, Math.sin(a) * rad]];
    for (let k = 1; k <= 4; k++) {
      rad -= (0.93 - reach) / 4; a += (rand() - 0.5) * 0.22;
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    const [bx, by] = pts[2], side = rand() < 0.5 ? -1 : 1, ba = Math.atan2(by, bx) + side * (0.35 + rand() * 0.3);
    const branch = [[bx, by], [bx - Math.cos(ba) * 0.16, by - Math.sin(ba) * 0.16]];
    return { pts, branch };
  });
}

/** The thick ring of ice round the art: three rings of points, jagged outside, joined into shaded facets. */
function iceRing(rand) {
  const n = 36;
  const ring = (rad, jag) => Array.from({ length: n }, (_, i) => {
    const a = ((i + (rand() - 0.5) * 0.5) / n) * TAU;
    const rr = rad * (1 + (rand() - 0.5) * jag);
    return { x: Math.cos(a) * rr, y: Math.sin(a) * rr, a };
  });
  const inner = ring(ICE.ringInner, 0.03), mid = ring((ICE.ringInner + ICE.ringOuter) / 2, 0.05), outer = ring(ICE.ringOuter, 0.09);
  const facets = [...zipRings(inner, mid), ...zipRings(mid, outer)].map(t => {
    const f = icePiece(t, rand, lit => lit > 0.62 ? ICE.light : lit > 0.3 ? ICE.dark : ICE.deep);
    return { ...f, alpha: 0.84 + rand() * 0.14, edgeAlpha: 0.2 + rand() * 0.35, reveal: fromTop(f.cx, f.cy) * 0.4 };   // freezing round from the top
  });
  // cracks right across the ring, just before it shatters
  const cracks = Array.from({ length: 9 }, (_, i) => {
    const a = ((i + 0.3 + rand() * 0.4) / 9) * TAU;
    return [0, 1, 2, 3].map(k => { const rad = ICE.ringInner - 0.02 + (ICE.ringOuter - ICE.ringInner + 0.04) * k / 3, w = a + (k % 2 ? 1 : -1) * 0.03 * rand();
      return [Math.cos(w) * rad, Math.sin(w) * rad]; });
  });
  return { facets, inner: inner.flatMap(p => [p.x, p.y]), outer: outer.flatMap(p => [p.x, p.y]), cracks };
}

/** Splinters of ice: flying off all the time, or in a burst (as it freezes and as it shatters). */
function iceShardData(rand, n, burst) {
  return Array.from({ length: n }, () => {
    let a = rand() * TAU;
    if (!burst && rand() < 0.5) a = (-80 + rand() * 100) * Math.PI / 180;   // more off the upper right, as if blown off
    return { a, phase: rand(), speed: 0.3 + rand() * 0.3, reach: burst ? 0.7 + rand() * 1.1 : 0.5 + rand() * 0.6,
      size: 0.022 + rand() * 0.04, spin: (rand() - 0.5) * 9, rot: rand() * TAU, stretch: 1.4 + rand() * 1.4, delay: burst ? rand() * 0.2 : 0 };
  });
}

/** A colour matrix that turns the art into ice: its light and shade kept, coloured from deep teal to near white. */
function iceMatrix() {
  const contrast = 1.25, shift = -0.1;                  // crisper light and shade, like carved ice
  const row = (k, o) => [0.299 * k * contrast, 0.587 * k * contrast, 0.114 * k * contrast, 0, o + k * shift];
  return [...row(0.9, -0.05), ...row(0.85, 0.25), ...row(0.55, 0.5), 0, 0, 0, 1, 0];
}

function createFrozenFx(token) {
  const container = newFxContainer();
  const ADD = PIXI.BLEND_MODES.ADD;
  const blurs = { glow: newBlur(10, 3, ADD), mist: newBlur(8, 2), frost: newBlur(5, 3) };
  const part = (name, blur, blend) => { const g = new PIXI.Graphics(); g.name = name; if (blur) g.filters = [blur]; if (blend) g.blendMode = blend; return g; };
  const glow = part("glow", blurs.glow, ADD);
  const mist = part("mist", blurs.mist);
  // the creature itself turned to ice: a recoloured copy of its art (token rings get the frost and a cold tint instead)
  const statue = makeArtCopy(token, iceMatrix(), blurs);
  if (statue) statue.alpha = 0;
  const frost = part("frost", blurs.frost);
  const block = part("block");
  const ring = part("ring");
  const sheen = part("sheen", null, ADD);
  const shards = part("shards");
  const sparkle = part("sparkle", null, ADD);
  container.addChild(glow, mist, ...(statue ? [statue] : []), frost, block, ring, sheen, shards, sparkle);
  const rand = seededRandom(hashString(`${token.id ?? ""}:ice`));
  const ringData = iceRing(rand);
  // glints winking on the ring, mostly on its upper left where the light catches it
  const tips = Array.from({ length: 6 }, (_, i) => {
    const a = (i < 4 ? -2.9 + rand() * 1.6 : rand() * TAU), d = ICE.ringInner + 0.03 + rand() * (ICE.ringOuter - ICE.ringInner - 0.06);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, phase: rand() * TAU, speed: 0.6 + rand() * 0.8 };
  });
  const mistData = Array.from({ length: ICE.mistPuffs }, (_, i) => ({ a: ((i + rand() * 0.8) / ICE.mistPuffs) * TAU, phase: rand(), speed: 0.12 + rand() * 0.1,
    size: 0.18 + rand() * 0.14, drift: 0.25 + rand() * 0.25 }));
  return { container, blurs, glow, mist, statue, frost, block, ring, sheen, shards, sparkle,
    facets: iceFacets(rand), veins: iceVeins(rand), ringData, tips, mistData,
    flying: iceShardData(rand, ICE.shards, false), burstIn: iceShardData(rand, ICE.burst, true), burstOut: iceShardData(rand, ICE.burst, true),
    born: null, drawnKey: "", ringKey: "" };
}

/** Rotate flat [x, y, …] points by an angle round (cx, cy), then move them. */
function movePoints(pts, cx, cy, angle, dx, dy, scale = 1) {
  const c = Math.cos(angle), s = Math.sin(angle), out = new Array(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] - cx, y = pts[i + 1] - cy;
    out[i] = (cx + (x * c - y * s)) * scale + dx * scale;
    out[i + 1] = (cy + (x * s + y * c)) * scale + dy * scale;
  }
  return out;
}

/** Shaded pieces of ice, each shown as it freezes over and flying off (spinning, falling) as it shatters. */
function drawIcePieces(g, list, r, appear, fly, alphaScale) {
  const thin = Math.max(0.5, r * 0.008);
  const fade = (1 - fly) ** 1.3;
  if (fade <= 0.01) return;
  for (const f of list) {
    const shown = clamp01((appear - f.reveal) / 0.3);
    if (shown <= 0) continue;
    const pts = fly > 0
      ? movePoints(f.pts, f.cx, f.cy, f.spin * fly * 0.6, f.out[0] * f.speed * fly, f.out[1] * f.speed * fly + 1.4 * fly * fly, r)
      : f.pts.map(v => v * r);
    g.lineStyle({ width: thin, color: ICE.edge, alpha: f.edgeAlpha * shown * fade });
    g.beginFill(f.color, f.alpha * alphaScale * shown * fade).drawPolygon(pts).endFill();
  }
  g.lineStyle(0);
}

/** The faint facets and frost cracks over the art (brighter as the ice cracks before it shatters). */
function drawIceBlock(fx, r, appear, crack, fly) {
  const g = fx.block;
  g.clear();
  drawIcePieces(g, fx.facets, r, appear, fly, fx.statue ? 0.28 : 1);
  if (fly > 0.3) return;
  const veinAlpha = ((fx.statue ? 0.26 : 0.38) + 0.6 * crack) * clamp01((appear - 0.4) / 0.4) * (1 - fly / 0.3);
  if (veinAlpha <= 0.01) return;
  g.lineStyle({ width: Math.max(0.6, r * (0.012 + 0.012 * crack)), color: ICE.edge, alpha: veinAlpha });
  for (const v of fx.veins) {
    v.pts.forEach(([x, y], i) => { if (i === 0) g.moveTo(x * r, y * r); else g.lineTo(x * r, y * r); });
    g.moveTo(v.branch[0][0] * r, v.branch[0][1] * r); g.lineTo(v.branch[1][0] * r, v.branch[1][1] * r);
    if (crack > 0) {
      const [x, y] = v.pts[v.pts.length - 1];
      g.moveTo(x * r, y * r); g.lineTo(x * r * (1 - crack), y * r * (1 - crack));
    }
  }
  g.lineStyle(0);
}

/** The ice ring with its glossy highlights, and the cracks across it just before it shatters. */
function drawIceRing(fx, r, appear, crack, fly) {
  const g = fx.ring, R = fx.ringData;
  g.clear();
  drawIcePieces(g, R.facets, r, appear, fly, 1);
  const whole = clamp01((appear - 0.35) / 0.3) * (1 - clamp01(fly / 0.15));
  if (whole > 0.01) {
    // a thin deep-blue line round both edges, so the ring reads on light maps too, and a bright inner rim
    g.lineStyle({ width: Math.max(0.6, r * 0.012), color: ICE.outline, alpha: 0.5 * whole });
    g.drawPolygon(R.outer.map(v => v * r));
    g.drawPolygon(R.inner.map(v => v * r * 0.995));
    g.lineStyle({ width: Math.max(0.6, r * 0.016), color: ICE.edge, alpha: 0.65 * whole });
    g.drawPolygon(R.inner.map(v => v * r * 1.01));
    // glossy highlights on the upper left and lower right
    const arc = (rad, a0, a1, width, alpha) => {
      g.lineStyle({ width: Math.max(0.8, r * width), color: ICE.edge, alpha: alpha * whole });
      g.moveTo(Math.cos(a0) * rad * r, Math.sin(a0) * rad * r);
      g.arc(0, 0, rad * r, a0, a1);
    };
    arc(1.065, -2.95, -1.95, 0.038, 0.8);
    arc(1.03, -1.75, -1.5, 0.02, 0.6);
    arc(1.02, 0.35, 0.95, 0.022, 0.45);
    g.lineStyle(0);
  }
  if (crack > 0 && fly < 0.15) {
    g.lineStyle({ width: Math.max(0.8, r * 0.022), color: ICE.edge, alpha: crack * (1 - fly / 0.15) });
    for (const c of R.cracks) c.forEach(([x, y], i) => { if (i === 0) g.moveTo(x * r, y * r); else g.lineTo(x * r, y * r); });
    g.lineStyle(0);
  }
}

/** A thin splinter of ice: a long diamond, half of it shaded. */
function drawShard(g, x, y, s, rot, stretch, alpha) {
  const c = Math.cos(rot), sn = Math.sin(rot), L = s * stretch, W = s * 0.5;
  const pts = [x + c * L, y + sn * L, x - sn * W, y + c * W, x - c * L * 0.6, y - sn * L * 0.6, x + sn * W, y - c * W];
  g.lineStyle({ width: Math.max(0.5, s * 0.16), color: ICE.outline, alpha: alpha * 0.45 });
  g.beginFill(ICE.crystal.light, alpha).drawPolygon(pts).endFill();
  g.lineStyle(0);
  g.beginFill(ICE.crystal.mid, alpha * 0.85).drawPolygon(pts.slice(0, 6)).endFill();
}

/** A burst of splinters flying out from the ring and falling, `age` seconds after it started. */
function drawIceBurst(g, list, r, age) {
  const k = age / 1.1;
  if (k <= 0 || k >= 1) return;
  for (const s of list) {
    const q = easeOutCubic(clamp01((k - s.delay) / (1 - s.delay)));
    if (q <= 0) continue;
    const d = ICE.ringInner + q * s.reach;
    const x = Math.cos(s.a) * d * r, y = (Math.sin(s.a) * d + 0.5 * k * k) * r;
    drawShard(g, x, y, s.size * r * 1.3, s.rot + s.spin * k, s.stretch, 0.95 * (1 - k) ** 1.2);
  }
}

/** A four-pointed glint. */
function drawGlint(g, x, y, s, alpha) {
  const k = s * 0.2;
  g.beginFill(ICE.edge, alpha).drawPolygon([x, y - s, x + k, y - k, x + s, y, x + k, y + k, x, y + s, x - k, y + k, x - s, y, x - k, y - k]).endFill();
}

/**
 * Frozen solid: the creature turned to ice inside a thick, glowing ring of it, splinters flying off
 * and frost mist rolling away. It freezes with a flash, a burst of splinters and a jolt, and
 * shatters when the status ends.
 */
function updateFrozenFx(token, fx, { now, zoom, ending }) {
  const art = artCircle(token);
  const r = art.r, T = now / 1000;
  if (fx.born === null) fx.born = now;
  const age = Math.max(0, (now - fx.born) / 1000);
  const appear = clamp01(age / ICE.appearSeconds);
  const end = clamp01(ending ?? 0);                    // 0 → 1 while it shatters
  const crack = clamp01(end / 0.15), fly = clamp01((end - 0.12) / 0.88);
  // a jolt as it freezes
  const shake = age < 0.45 ? Math.sin(age * 70) * r * 0.035 * (1 - age / 0.45) ** 2 : 0;
  for (const p of [fx.glow, fx.mist, fx.frost, fx.block, fx.ring, fx.sheen, fx.shards, fx.sparkle]) p.position.set(art.x + shake, art.y);
  syncArtCopy(token, fx.statue, shake);
  if (fx.statue) fx.statue.alpha = easeOutCubic(clamp01((appear - 0.1) / 0.4)) * (1 - clamp01(fly * 1.8));

  // the glow round it and the frost inside the ring: drawn once per size, faded in and out
  const key = `${Math.round(r * 4)}`;
  if (key !== fx.ringKey) {
    fx.glow.clear();
    fx.glow.lineStyle({ width: r * 0.42, color: ICE.glow, alpha: 1 });
    fx.glow.drawCircle(0, 0, r * 1.06);
    fx.glow.lineStyle(0);
    fx.glow.beginFill(ICE.glow, 0.22).drawCircle(0, 0, r * 0.9).endFill();
    fx.frost.clear();
    fx.frost.lineStyle({ width: r * 0.2, color: ICE.frost, alpha: 1 });
    fx.frost.drawCircle(0, 0, r * 0.86);
    fx.ringKey = key;
  }
  fx.blurs.glow.blur = Math.max(1, r * 0.2 * zoom);
  fx.blurs.mist.blur = Math.max(1, r * 0.14 * zoom);
  fx.blurs.frost.blur = Math.max(1, r * 0.07 * zoom);
  const fadeOut = 1 - clamp01(end / 0.35);
  fx.glow.alpha = (0.72 + 0.12 * Math.sin(T * 1.3)) * easeOutCubic(appear) * fadeOut + (crack > 0 ? 0.3 * crack * fadeOut : 0);
  fx.frost.alpha = (fx.statue ? 0.36 : 0.6) * easeOutCubic(clamp01((appear - 0.2) / 0.5)) * fadeOut;

  // the ice itself: redrawn while it forms or shatters, then held
  const settled = appear >= 1 && end === 0;
  if (!settled || fx.drawnKey !== key) {
    drawIceBlock(fx, r, appear, crack, fly);
    drawIceRing(fx, r, appear, crack, fly);
    fx.drawnKey = settled ? key : "";
  }

  // frost mist rolling off the ring, and a cold puff as it freezes and as it bursts
  const m = fx.mist;
  m.clear();
  const mistAlpha = appear * (1 - end);
  for (const p of fx.mistData) {
    const life = (T * p.speed + p.phase) % 1, a = 0.3 * Math.sin(Math.PI * life) * mistAlpha;
    if (a < 0.02) continue;
    const d = 1.0 + life * p.drift;
    m.beginFill(ICE.mist, a).drawCircle(Math.cos(p.a) * d * r, (Math.sin(p.a) * d - life * 0.12) * r, p.size * r * (0.8 + 0.5 * life)).endFill();
  }
  const puff = (k, alpha) => {
    if (k <= 0 || k >= 1) return;
    m.lineStyle({ width: r * 0.3 * (1 - k) + 1, color: ICE.mist, alpha: alpha * (1 - k) });
    m.drawCircle(0, 0, r * (0.95 + 0.7 * easeOutCubic(k)));
    m.lineStyle(0);
  };
  puff(age / 0.9, 0.55);
  puff(fly / 0.7, 0.5);

  // a cold sheen sweeping across the ice now and then (diagonal chords clipped to the ring)
  const s = fx.sheen;
  s.clear();
  const cycle = ((T + 1.7) % ICE.sheenEvery) / ICE.sheenSeconds;
  if (cycle < 1 && end === 0 && appear >= 1) {
    const RR = r * 1.1, centre = (-1.2 + 2.4 * easeOutCubic(cycle)) * RR, step = r * 0.05;
    const nx = Math.SQRT1_2, ny = Math.SQRT1_2, tx = Math.SQRT1_2, ty = -Math.SQRT1_2;
    for (let k = -4; k <= 4; k++) {
      const off = centre + k * step;
      if (Math.abs(off) >= RR) continue;
      const half = Math.sqrt(RR * RR - off * off), a = 0.3 * Math.exp(-(k * k) / 6) * Math.sin(Math.PI * cycle);
      if (a < 0.01) continue;
      s.lineStyle({ width: step * 1.05, color: ICE.edge, alpha: a });
      s.moveTo(nx * off - tx * half, ny * off - ty * half); s.lineTo(nx * off + tx * half, ny * off + ty * half);
    }
    s.lineStyle(0);
  }

  // splinters flying off all the time, and in bursts as it freezes and as it shatters
  const sh = fx.shards;
  sh.clear();
  if (appear >= 0.5 && end === 0) {
    const on = clamp01((appear - 0.5) / 0.5);
    for (const p of fx.flying) {
      const life = (T * p.speed + p.phase) % 1, a = Math.sin(Math.PI * life) ** 0.8 * 0.85 * on;
      if (a < 0.03) continue;
      const d = ICE.ringOuter + life * p.reach;
      drawShard(sh, Math.cos(p.a) * d * r, (Math.sin(p.a) * d + 0.25 * life * life) * r, p.size * r * (1 - 0.4 * life), p.rot + p.spin * T * 0.3, p.stretch, a);
    }
  }
  drawIceBurst(sh, fx.burstIn, r, age);
  if (end > 0) drawIceBurst(sh, fx.burstOut, r, (end - 0.12) * ICE.shatterSeconds);

  // glints on the ring, and the flashes as it forms and cracks
  const g = fx.sparkle;
  g.clear();
  if (end === 0 && appear > 0.6) {
    for (const d of fx.tips) {
      const tw = Math.max(0, Math.sin(T * d.speed + d.phase)) ** 12;
      if (tw < 0.04) continue;
      drawGlint(g, d.x * r, d.y * r, r * 0.08 * (0.5 + 0.5 * tw), tw);
    }
  }
  if (appear < 1) {
    const k = easeOutCubic(appear);
    g.beginFill(ICE.edge, 0.5 * (1 - k) ** 2).drawCircle(0, 0, r * 1.05).endFill();
    g.lineStyle({ width: r * 0.1 * (1 - k) + 0.5, color: ICE.edge, alpha: 0.9 * (1 - k) });
    g.drawCircle(0, 0, r * (0.75 + 0.6 * k));
    g.lineStyle(0);
  }
  if (end > 0 && end < 0.3) g.beginFill(ICE.edge, 0.55 * (1 - end / 0.3)).drawCircle(0, 0, r * (1.05 + 0.3 * end)).endFill();

  return { tint: mixTint(ICE.tint, easeOutCubic(appear) * (1 - easeOutCubic(fly))), alpha: 1 };
}

/* ---------- Entangled ---------- */

/** A smooth curve through some points (Catmull-Rom), as `steps` points with the distance along it. */
function smoothPath(ctrl, steps) {
  const out = [];
  const at = (i) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let s = 0; s <= steps; s++) {
    const u = (s / steps) * (ctrl.length - 1), i = Math.min(ctrl.length - 2, Math.floor(u)), t = u - i;
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

/** The vines: some climbing the creature's sides from the ground, two binding it across the body. */
function vinePlan(rand) {
  const jit = v => v + (rand() - 0.5) * 0.18;
  const climb = (from, to, rad, wave, width, delay, leaves) => {
    const a0 = jit(from), a1 = jit(to), ph = rand() * TAU, ctrl = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, a = a0 + (a1 - a0) * t;
      const rr = (k === 0 ? 1.14 : rad) + wave * Math.sin(t * Math.PI * 2.5 + ph);
      ctrl.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    return { pts: smoothPath(ctrl, 26), width, delay, leaves, sway: ph, bind: false };
  };
  const bind = (ctrl, delay, leaves) => ({ pts: smoothPath(ctrl.map(([x, y]) => [x, jit(y)]), 30), width: 0.105, delay, leaves, sway: rand() * TAU, bind: true });
  return [
    climb(Math.PI * 0.6, Math.PI * 1.18, 1.02, 0.05, 0.12, 0, [0.3, 0.52, 0.72, 0.92]),
    climb(Math.PI * 0.4, -Math.PI * 0.16, 1.02, 0.05, 0.12, 0.05, [0.26, 0.48, 0.7, 0.9]),
    climb(Math.PI * 0.55, Math.PI * 1.36, 0.99, 0.06, 0.085, 0.15, [0.5, 0.92]),
    climb(Math.PI * 0.45, -Math.PI * 0.34, 0.99, 0.06, 0.085, 0.18, [0.55, 0.93]),
    climb(Math.PI * 0.68, Math.PI * 0.95, 0.93, 0.04, 0.07, 0.1, [0.85]),
    climb(Math.PI * 0.32, Math.PI * 0.05, 0.93, 0.04, 0.07, 0.12, [0.8]),
    // binding vines, crossing over the body below the face
    bind([[-1.04, 0.62], [-0.6, 0.55], [-0.1, 0.36], [0.45, 0.14], [1.04, 0.02]], 0.32, [0.82]),
    bind([[1.04, 0.66], [0.55, 0.6], [0.05, 0.42], [-0.5, 0.2], [-1.04, 0.07]], 0.4, [0.18])
  ];
}
