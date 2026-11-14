/* ---------- Petrified: cracked stone ---------- */

const STONE = {
  tone: [0.80, 0.78, 0.74],     // warm grey of the stone (scales the art's brightness)
  lift: 0.08,                   // stone is never black: shadows lifted this much
  contrast: 1.0,
  wash: 0x9C978D,               // stone colour laid over the art
  shade: 0x1E1B18,              // darker towards the rim, like carved stone
  crack: 0x221E1A, crackLight: 0xF1EDE4,
  grainDark: 0x3B3732, grainLight: 0xF4F0E8,
  dust: 0xB9B2A6,
  tint: [0.72, 0.71, 0.69],     // the art underneath, greyed
  cracks: 7, grains: 70, dustPerSecond: 1.4
};

/** A colour matrix that turns art into toned grey stone (PIXI offsets are 0–1). */
function stoneMatrix() {
  const c = STONE.contrast, l = STONE.lift;
  const row = t => [0.299 * t * c, 0.587 * t * c, 0.114 * t * c, 0, l];
  return [...row(STONE.tone[0]), ...row(STONE.tone[1]), ...row(STONE.tone[2]), 0, 0, 0, 1, 0];
}

/**
 * A copy of the token's own art, recoloured by a colour matrix, to lay over it. Not for token
 * rings, whose art is drawn by a special shader (null then, and the effect falls back to a wash).
 * The matrix filter goes into `blurs` so it's destroyed with the effect; the token's texture never is.
 */
function makeArtCopy(token, matrix, blurs) {
  const tex = token.mesh?.texture;
  if (!tex || token.document?.ring?.enabled || typeof PIXI.Sprite !== "function") return null;
  if (matrix && typeof PIXI.ColorMatrixFilter !== "function") return null;
  try {
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor.set(0.5);
    if (matrix) {
      const filter = new PIXI.ColorMatrixFilter();
      filter.matrix = matrix;
      sprite.filters = [filter];
      blurs.matrix = filter;
    }
    return sprite;
  } catch { return null; }
}

/** Keep an art copy on top of the art (or shifted sideways by dx): same image, size, mirroring and rotation. */
function syncArtCopy(token, sprite, dx = 0) {
  if (!sprite || sprite.destroyed) return;
  const tex = token.mesh?.texture;
  if (tex && sprite.texture !== tex) sprite.texture = tex;               // the token's image changed
  const tw = sprite.texture?.width || 1, th = sprite.texture?.height || 1;
  const mx = Number(token.document?.texture?.scaleX) < 0 ? -1 : 1, my = Number(token.document?.texture?.scaleY) < 0 ? -1 : 1;
  sprite.position.set(token.w / 2 + dx, token.h / 2);
  sprite.scale.set(mx * token.w / tw, my * token.h / th);
  sprite.rotation = Number(token.mesh?.rotation) || 0;
}

function createStoneFx(token) {
  const container = newFxContainer();
  const blurs = { shade: newBlur(6, 3), grain: newBlur(1, 2) };
  // A grey copy of the token's own art, so the whole picture turns to stone (token rings get a
  // heavier stone wash instead).
  const statue = makeArtCopy(token, stoneMatrix(), blurs);
  const wash = new PIXI.Graphics();
  const shade = new PIXI.Graphics(); shade.filters = [blurs.shade];
  const grain = new PIXI.Graphics(); grain.filters = [blurs.grain];
  const cracks = new PIXI.Graphics();
  const dust = new PIXI.Graphics();
  container.addChild(...(statue ? [statue] : []), wash, shade, grain, cracks, dust);
  const seed = hashString(`${token.document?.id ?? token.id ?? ""}:stone`);
  return { container, blurs, statue, wash, shade, grain, cracks, dust, seed, crackList: generateCracks(seed, STONE.cracks),
    motes: [], spawn: 0, dustFrom: [], drawnKey: "" };
}

function layoutStoneFx(fx, art) {
  const { x, y, r } = art;
  const round = PIXI.LINE_CAP?.ROUND ?? "round", join = PIXI.LINE_JOIN?.ROUND ?? "round";
  fx.wash.clear();
  fx.wash.beginFill(STONE.wash, 1).drawCircle(x, y, r * 0.98).endFill();
  fx.wash.alpha = fx.statue ? 0.1 : 0.7;
  fx.shade.clear();
  fx.shade.lineStyle({ width: r * 0.2, color: STONE.shade, alpha: 1 });
  fx.shade.drawCircle(x, y, r * 0.86);
  fx.shade.alpha = 0.24;
  // Grain: dark and light flecks, like granite
  const rand = seededRandom(fx.seed + 7);
  fx.grain.clear();
  for (let i = 0; i < STONE.grains; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 0.93;
    const dark = rand() < 0.55;
    fx.grain.beginFill(dark ? STONE.grainDark : STONE.grainLight, dark ? 0.32 : 0.22)
      .drawCircle(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.006 + rand() * 0.016)).endFill();
  }
  // Cracks: a dark core with a light lower edge, as if chiselled
  fx.cracks.clear();
  const lw = r * 0.032;
  for (const pass of [{ color: STONE.crackLight, alpha: 0.45, d: lw * 0.5, w: 0.75 }, { color: STONE.crack, alpha: 0.9, d: 0, w: 1 }]) {
    for (const c of fx.crackList) {
      fx.cracks.lineStyle({ width: Math.max(1, lw * c.width * pass.w), color: pass.color, alpha: pass.alpha, cap: round, join });
      c.points.forEach(([px, py], i) => {
        const X = x + px * r + pass.d, Y = y + py * r + pass.d;
        if (i === 0) fx.cracks.moveTo(X, Y); else fx.cracks.lineTo(X, Y);
      });
    }
  }
  fx.dustFrom = fx.crackList.flatMap(c => c.points.slice(1)).map(([px, py]) => [x + px * r, y + py * r]);
}

/** Grey stone art, cracks and grain, with a little dust trickling from the cracks. */
function updateStoneFx(token, fx, { now, dt, zoom }) {
  const art = artCircle(token);
  const r = art.r;
  const key = `${Math.round(art.x)}|${Math.round(art.y)}|${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) { layoutStoneFx(fx, art); fx.drawnKey = key; }
  fx.blurs.shade.blur = Math.max(1, r * 0.12 * zoom);
  fx.blurs.grain.blur = Math.max(0.3, r * 0.004 * zoom);

  syncArtCopy(token, fx.statue);

  // Dust: grains break off the cracks now and then and fall
  fx.spawn += dt * STONE.dustPerSecond;
  while (fx.spawn >= 1 && fx.dustFrom.length) {
    fx.spawn -= 1;
    const [sx, sy] = fx.dustFrom[Math.floor(Math.random() * fx.dustFrom.length)];
    for (let k = 0, n = 2 + Math.floor(Math.random() * 3); k < n; k++) {
      fx.motes.push({ x: sx + (Math.random() - 0.5) * r * 0.04, y: sy, vx: (Math.random() - 0.5) * r * 0.08, vy: Math.random() * r * 0.05,
        age: 0, life: 0.9 + Math.random() * 0.8, size: r * (0.008 + Math.random() * 0.01) });
    }
  }
  if (fx.motes.length > 60) fx.motes.splice(0, fx.motes.length - 60);
  fx.dust.clear();
  fx.motes = fx.motes.filter(m => (m.age += dt) < m.life);
  for (const m of fx.motes) {
    m.vy += r * 1.1 * dt;
    m.x += m.vx * dt; m.y += m.vy * dt;
    const k = m.age / m.life;
    fx.dust.beginFill(STONE.dust, 0.85 * (1 - k)).drawCircle(m.x, m.y, Math.max(0.5, m.size)).endFill();
  }
  return { tint: STONE.tint, alpha: 1 };
}

/* ---------- Paralyzed: crackling electric arcs ---------- */

const ARC = {
  core: 0xF5FCFF,               // white-hot centre of a bolt
  glow: 0x74D7FF,               // electric blue glow around it
  halo: 0x2F6BFF,               // the flash that lights up the creature
  bolts: 1,                     // arcs across the creature at once
  forkChance: 0.5,              // chance an arc has a single fork
  rough: 0.32,                  // how jagged an arc is (relative to the art's radius)
  holdSeconds: [0.9, 1.6],      // how long one shape holds before it fades into the next
  fadeSeconds: 0.25,            // cross-fade between shapes
  sway: 0.018,                  // gentle drift of a held arc (relative to the radius)
  tint: [0.88, 0.93, 1]         // a cold blue cast on the art
};

/** A jagged path from p0 to p1 by midpoint displacement. */
function jaggedPath(x0, y0, x1, y1, rough, levels) {
  let pts = [[x0, y0], [x1, y1]];
  for (let l = 0; l < levels; l++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const off = (Math.random() - 0.5) * rough;
      next.push([(ax + bx) / 2 - (dy / len) * off, (ay + by) / 2 + (dx / len) * off], pts[i]);
    }
    pts = next;
    rough *= 0.55;
  }
  return pts;
}

/** New bolts across the art circle, each with a fork or two. */
function makeBolts(art) {
  const { x, y, r } = art;
  const bolts = [];
  for (let k = 0; k < ARC.bolts; k++) {
    const a = Math.random() * Math.PI * 2, b = a + Math.PI + (Math.random() - 0.5) * 1.5;
    const main = jaggedPath(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95, x + Math.cos(b) * r * 0.95, y + Math.sin(b) * r * 0.95, r * ARC.rough, 4);
    bolts.push({ points: main, width: 1 });
    const forks = Math.random() < ARC.forkChance ? 1 : 0;
    for (let f = 0; f < forks; f++) {
      const i = 3 + Math.floor(Math.random() * (main.length - 6));
      const [fx0, fy0] = main[i], [nx, ny] = main[i + 1];
      const dir = Math.atan2(ny - fy0, nx - fx0) + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6);
      const len = r * (0.25 + Math.random() * 0.25);
      let ex = fx0 + Math.cos(dir) * len, ey = fy0 + Math.sin(dir) * len;
      const d = Math.hypot(ex - x, ey - y);
      if (d > r * 0.95) { ex = x + (ex - x) * (r * 0.95 / d); ey = y + (ey - y) * (r * 0.95 / d); }
      bolts.push({ points: jaggedPath(fx0, fy0, ex, ey, r * 0.14, 3), width: 0.55 });
    }
  }
  // Each point sways a little on its own while the shape holds (the ends stay put on the rim)
  for (const b of bolts) b.sway = b.points.map((_, i) => (i === 0 || i === b.points.length - 1) ? null : { p: Math.random() * Math.PI * 2, f: 1.5 + Math.random() * 1.5 });
  return bolts;
}

function createArcFx() {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { halo: newBlur(10, 3, ADD), glow: newBlur(4, 3, ADD) };
  const halo = new PIXI.Graphics(); halo.blendMode = ADD; halo.filters = [blurs.halo];
  const glow = new PIXI.Graphics(); glow.blendMode = ADD; glow.filters = [blurs.glow];
  const core = new PIXI.Graphics(); core.blendMode = ADD;
  const sparks = new PIXI.Graphics(); sparks.blendMode = ADD;
  container.addChild(halo, glow, core, sparks);
  return { container, blurs, halo, glow, core, sparks, bolts: [], prev: [], swapped: 0, next: 0, flash: 0, sparkList: [] };
}

/**
 * An arc that holds its shape for a second or so, swaying slightly and humming, then fades into a
 * new shape, with a soft flash and a few sparks where it meets the rim.
 */
function updateArcFx(token, fx, { now, dt, zoom }) {
  const art = artCircle(token);
  const r = art.r;
  fx.blurs.halo.blur = Math.max(1, r * 0.3 * zoom);
  fx.blurs.glow.blur = Math.max(1, r * 0.05 * zoom);
  if (now >= fx.next || !fx.bolts.length) {
    fx.prev = fx.bolts;
    fx.bolts = makeBolts(art);
    fx.swapped = fx.prev.length ? now : now - ARC.fadeSeconds * 1000;   // the first arc shows at once
    const [lo, hi] = ARC.holdSeconds;
    fx.next = now + (lo + Math.random() * (hi - lo)) * 1000;
    fx.flash = Math.min(1, fx.flash + 0.35);
    for (const b of fx.bolts) {
      if (b.width < 1) continue;
      for (const end of [b.points[0], b.points[b.points.length - 1]]) {
        if (Math.random() < 0.5) continue;
        for (let k = 0; k < 2; k++) {
          const a = Math.random() * Math.PI * 2, v = r * (0.25 + Math.random() * 0.4);
          fx.sparkList.push({ x: end[0], y: end[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.25 + Math.random() * 0.25 });
        }
      }
    }
  }
  fx.flash = Math.max(0, fx.flash - dt * 2.5);
  const T = now / 1000;
  const fade = clamp01((now - fx.swapped) / (ARC.fadeSeconds * 1000));
  const hum = 0.88 + 0.12 * Math.sin(T * 7);               // a steady hum, not a random flicker
  const round = PIXI.LINE_CAP?.ROUND ?? "round", join = PIXI.LINE_JOIN?.ROUND ?? "round";
  fx.glow.clear(); fx.core.clear();
  const drawSet = (bolts, strength) => {
    if (strength <= 0.01) return;
    for (const b of bolts) {
      fx.glow.lineStyle({ width: r * 0.08 * b.width, color: ARC.glow, alpha: 0.8 * hum * strength, cap: round, join });
      fx.core.lineStyle({ width: Math.max(1, r * 0.02 * b.width), color: ARC.core, alpha: hum * strength, cap: round, join });
      const pts = b.points.map(([px, py], i) => {
        const s = b.sway?.[i];
        if (!s) return [px, py];
        const d = r * ARC.sway;
        return [px + Math.sin(T * s.f + s.p) * d, py + Math.cos(T * s.f * 0.8 + s.p) * d];
      });
      for (const g of [fx.glow, fx.core]) pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    }
  };
  drawSet(fx.prev, 1 - fade);
  drawSet(fx.bolts, fade);
  fx.halo.clear();
  fx.halo.beginFill(ARC.halo, 1).drawCircle(art.x, art.y, r * 0.8).endFill();
  fx.halo.alpha = 0.07 + 0.12 * fx.flash;
  if (fx.sparkList.length > 40) fx.sparkList.splice(0, fx.sparkList.length - 40);
  fx.sparks.clear();
  fx.sparkList = fx.sparkList.filter(p => (p.age += dt) < p.life);
  for (const p of fx.sparkList) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    fx.sparks.beginFill(ARC.core, 1 - p.age / p.life).drawCircle(p.x, p.y, Math.max(0.6, r * 0.012)).endFill();
  }
  const lift = 0.05 * fx.flash;
  return { tint: ARC.tint.map(c => Math.min(1, c + lift)), alpha: 1 };
}

/* ---------- Diseased: sores and a sickly haze ---------- */

const DISEASE = {
  tint: [0.97, 0.93, 0.72],     // sallow, jaundiced skin
  blotch: 0x7A2E3A,             // inflamed, bruise-purple patches
  pustule: 0xE6D45C, pustuleRim: 0x8A5E22,
  miasma: 0xA8A44A,             // yellow-brown haze
  sores: 6, wisps: 4,
  soreSeconds: [3, 5.5]         // a sore swells for this long, then bursts
};

function createDiseaseFx(token) {
  const container = newFxContainer();
  const blurs = { blotch: newBlur(4, 3), miasma: newBlur(10, 3) };
  const miasma = new PIXI.Graphics(); miasma.filters = [blurs.miasma];
  const blotches = new PIXI.Graphics(); blotches.filters = [blurs.blotch];
  const pustules = new PIXI.Graphics();
  container.addChild(miasma, blotches, pustules);
  const rand = seededRandom(hashString(`${token.document?.id ?? token.id ?? ""}:disease`));
  const sores = Array.from({ length: DISEASE.sores }, () => ({
    a: rand() * Math.PI * 2, d: 0.2 + Math.sqrt(rand()) * 0.55, size: 0.055 + rand() * 0.045,
    period: DISEASE.soreSeconds[0] + rand() * (DISEASE.soreSeconds[1] - DISEASE.soreSeconds[0]), phase: rand()
  }));
  const wispData = Array.from({ length: DISEASE.wisps }, (_, i) => ({ x: rand() - 0.5, offset: i / DISEASE.wisps, size: 0.25 + rand() * 0.15 }));
  return { container, blurs, miasma, blotches, pustules, sores, wispData, drawnKey: "" };
}

/** Sores that swell and burst, and a sickly haze rising. */
function updateDiseaseFx(token, fx, { now, zoom }) {
  const art = artCircle(token);
  const { x, y, r } = art;
  const T = now / 1000;
  fx.blurs.blotch.blur = Math.max(1, r * 0.05 * zoom);
  fx.blurs.miasma.blur = Math.max(1, r * 0.2 * zoom);
  const key = `${Math.round(x)}|${Math.round(y)}|${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) {
    fx.blotches.clear();
    for (const s of fx.sores) {
      const sx = x + Math.cos(s.a) * s.d * r, sy = y + Math.sin(s.a) * s.d * r;
      fx.blotches.beginFill(DISEASE.blotch, 1).drawEllipse(sx, sy, s.size * r * 2.1, s.size * r * 1.7).endFill();
    }
    fx.drawnKey = key;
  }
  fx.blotches.alpha = 0.4 + 0.08 * Math.sin(T * 1.3);

  // Pustules: swell, then burst into a ring and start again
  const p = fx.pustules;
  p.clear();
  for (const s of fx.sores) {
    const sx = x + Math.cos(s.a) * s.d * r, sy = y + Math.sin(s.a) * s.d * r;
    const t = ((T / s.period) + s.phase) % 1;
    const size = s.size * r;
    if (t < 0.9) {
      const rad = size * (0.35 + 0.65 * (t / 0.9));
      p.lineStyle({ width: Math.max(0.8, rad * 0.22), color: DISEASE.pustuleRim, alpha: 0.75 });
      p.beginFill(DISEASE.pustule, 0.9).drawCircle(sx, sy, rad).endFill();
      p.lineStyle(0);
      p.beginFill(0xFFFFF0, 0.55).drawCircle(sx - rad * 0.3, sy - rad * 0.3, rad * 0.28).endFill();
    } else {
      const k = (t - 0.9) / 0.1;
      p.lineStyle({ width: Math.max(0.8, size * 0.2 * (1 - k)), color: DISEASE.pustule, alpha: 1 - k });
      p.drawCircle(sx, sy, size * (1 + 0.9 * k));
      p.lineStyle(0);
    }
  }

  // Miasma: faint yellow-brown puffs drifting up and fading
  fx.miasma.clear();
  for (const w of fx.wispData) {
    const t = ((T / 5) + w.offset) % 1;
    const wx = x + w.x * r * 0.9 + Math.sin(t * Math.PI * 2 + w.offset * 6) * r * 0.08;
    const wy = y + r * 0.45 - t * r * 1.2;
    const alpha = 0.3 * Math.sin(t * Math.PI);
    fx.miasma.beginFill(DISEASE.miasma, alpha).drawCircle(wx, wy, r * w.size * (0.7 + 0.5 * t)).endFill();
  }
  return { tint: DISEASE.tint, alpha: 1 };
}

/* ---------- Cursed: a dark swirl around the token ---------- */

const CURSE = {
  dark: 0x0C0914,               // near-black violet smoke
  mid: 0x2A1F3D,                // the body of the swirl
  sheen: 0x8A76B4,              // faint violet edge, so it reads on dark maps
  rings: [{ radius: 1.06, lapSeconds: 7, width: 0.1 }, { radius: 1.15, lapSeconds: 11, width: 0.075 }],
  armsPerRing: 4,
  motes: 14,
  tint: [0.86, 0.86, 0.9]       // the creature looks a little dimmed
};

/** Smoky streaks circling just outside the art's edge: tapered arcs that spiral slightly outward. */
function drawCurseRing(g, r, ring, seed, color, alphaScale, widthScale) {
  g.clear();
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  const rand = seededRandom(seed + ring.radius * 1000);
  for (let k = 0; k < CURSE.armsPerRing; k++) {
    const radius = r * (ring.radius + (rand() - 0.5) * 0.04);
    const start = (k / CURSE.armsPerRing) * Math.PI * 2 + rand() * 0.6;
    const span = 1.0 + rand() * 0.8;
    const width = r * ring.width * widthScale;
    const steps = 20;
    let px = Math.cos(start) * radius, py = Math.sin(start) * radius;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const a = start - span * t;                       // trails behind the direction of spin
      const rr = radius * (1 + 0.07 * t);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      const fade = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.8;   // thin at both ends
      g.lineStyle({ width: Math.max(0.8, width * (0.2 + 0.8 * fade)), color, alpha: alphaScale * (0.25 + 0.75 * fade), cap: round });
      g.moveTo(px, py); g.lineTo(x, y);
      px = x; py = y;
    }
  }
}

function createCurseFx(token) {
  const container = newFxContainer();
  const blurs = { shadow: newBlur(8, 3), smoke: newBlur(3, 3), sheen: newBlur(1.5, 2) };
  const shadow = new PIXI.Graphics(); shadow.filters = [blurs.shadow];
  const rings = CURSE.rings.map(() => {
    const smoke = new PIXI.Graphics(); smoke.filters = [blurs.smoke];
    const sheen = new PIXI.Graphics(); sheen.filters = [blurs.sheen];
    const group = new PIXI.Container(); group.addChild(smoke, sheen);
    return { group, smoke, sheen };
  });
  const motes = new PIXI.Graphics();
  container.addChild(shadow, ...rings.map(x => x.group), motes);
  const seed = hashString(`${token.document?.id ?? token.id ?? ""}:curse`);
  const rand = seededRandom(seed + 3);
  const moteData = Array.from({ length: CURSE.motes }, () => ({ a: rand() * Math.PI * 2, d: 1.02 + rand() * 0.2, speed: 0.5 + rand() * 0.5, size: 0.012 + rand() * 0.014, phase: rand() * 6.3 }));
  return { container, blurs, shadow, rings, motes, moteData, seed, drawnKey: "" };
}

/** Swirl the dark smoke slowly around the outside of the art; dims the art a little. */
function updateCurseFx(token, fx, { now, zoom }) {
  const art = artCircle(token);
  const r = art.r, T = now / 1000;
  const key = `${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) {
    fx.rings.forEach((ring, i) => {
      drawCurseRing(ring.smoke, r, CURSE.rings[i], fx.seed, i ? CURSE.dark : CURSE.mid, 0.9, 1);
      drawCurseRing(ring.sheen, r, CURSE.rings[i], fx.seed, CURSE.sheen, 0.35, 0.25);
    });
    fx.shadow.clear();
    fx.shadow.lineStyle({ width: r * 0.2, color: CURSE.dark, alpha: 1 });
    fx.shadow.drawCircle(0, 0, r * 1.08);
    fx.drawnKey = key;
  }
  fx.blurs.shadow.blur = Math.max(1, r * 0.15 * zoom);
  fx.blurs.smoke.blur = Math.max(0.5, r * 0.035 * zoom);
  fx.blurs.sheen.blur = Math.max(0.5, r * 0.012 * zoom);
  fx.shadow.position.set(art.x, art.y);
  fx.shadow.alpha = 0.38 + 0.07 * Math.sin(T * 0.9);
  fx.rings.forEach((ring, i) => {
    ring.group.position.set(art.x, art.y);
    ring.group.rotation = (T / CURSE.rings[i].lapSeconds) * Math.PI * 2 + i * 1.3;
    ring.group.scale.set(1 + 0.025 * Math.sin(T * (0.8 + i * 0.3) + i));
    ring.group.alpha = 0.85 + 0.15 * Math.sin(T * (0.6 + i * 0.4) + i * 2);
  });
  const m = fx.motes;
  m.clear();
  for (const d of fx.moteData) {
    const a = d.a + T * d.speed;
    const rad = r * d.d * (1 + 0.03 * Math.sin(T * 1.7 + d.phase));
    m.beginFill(CURSE.dark, 0.55 + 0.3 * Math.sin(T * 2 + d.phase) ** 2)
      .drawCircle(art.x + Math.cos(a) * rad, art.y + Math.sin(a) * rad, Math.max(0.6, r * d.size)).endFill();
  }
  return { tint: CURSE.tint, alpha: 1 };
}

/* ---------- Incapacitated: drained and fading ---------- */

const DRAIN = {
  tone: [0.9, 0.92, 0.97],      // the grey the art drains to (a little cool)
  wash: 0x8C9099,               // grey laid over art that can't be copied (token rings)
  pulse: 0xD4D8E0,              // the faint ring of a weak heartbeat
  fade: [0.4, 0.85],            // how visible the creature is, at its faintest and strongest
  fadeSeconds: 5.5,             // one slow fade out and back in
  beatSeconds: 3.4,             // one weak "lub-dub", then a long pause
  tint: [0.8, 0.8, 0.83]        // the art under the grey copy (or alone, for token rings)
};

/** Greyscale, toned: each channel is the art's brightness scaled by the tone. */
function drainMatrix() {
  const row = t => [0.299 * t, 0.587 * t, 0.114 * t, 0, 0.03];
  return [...row(DRAIN.tone[0]), ...row(DRAIN.tone[1]), ...row(DRAIN.tone[2]), 0, 0, 0, 1, 0];
}

function createDrainFx(token) {
  const container = newFxContainer();
  const blurs = { pulse: newBlur(2, 2) };
  const grey = makeArtCopy(token, drainMatrix(), blurs);
  const wash = new PIXI.Graphics();
  const pulse = new PIXI.Graphics(); pulse.filters = [blurs.pulse];
  container.addChild(...(grey ? [grey] : []), wash, pulse);
  const phase = (hashString(`${token.document?.id ?? token.id ?? ""}:drain`) % 1000) / 1000;
  return { container, blurs, grey, wash, pulse, phase, drawnKey: "" };
}

/** How visible the creature is now: a slow, uneven fade out and back in. */
function drainVisibility(T, phase) {
  const [lo, hi] = DRAIN.fade;
  const t = (T / DRAIN.fadeSeconds) + phase;
  const wave = 0.5 + 0.5 * Math.cos(t * Math.PI * 2);                    // 1 = strongest
  const drift = 0.5 + 0.5 * Math.cos(t * Math.PI * 2 * 0.37 + 1.7);      // keeps each fade a little different
  return lo + (hi - lo) * Math.min(1, Math.max(0, 0.8 * wave + 0.2 * drift));
}

/** The art drains to grey and fades in and out, with a faint, slow heartbeat ring. */
function updateDrainFx(token, fx, { now, zoom }) {
  const art = artCircle(token);
  const { x, y, r } = art;
  const T = now / 1000;
  fx.blurs.pulse.blur = Math.max(0.5, r * 0.03 * zoom);
  const key = `${Math.round(x)}|${Math.round(y)}|${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) {
    fx.wash.clear();
    if (!fx.grey) fx.wash.beginFill(DRAIN.wash, 1).drawCircle(x, y, r * 0.98).endFill();
    fx.drawnKey = key;
  }
  const visible = drainVisibility(T, fx.phase);
  syncArtCopy(token, fx.grey);
  if (fx.grey) fx.grey.alpha = visible;
  fx.wash.alpha = fx.grey ? 0 : 0.45 * visible;

  // A weak heartbeat: two faint rings close together ("lub-dub"), then a long pause
  fx.pulse.clear();
  const beat = ((T / DRAIN.beatSeconds) + fx.phase) % 1;
  for (const [start, strength] of [[0, 1], [0.12, 0.6]]) {
    const k = (beat - start) / 0.3;
    if (k < 0 || k > 1) continue;
    fx.pulse.lineStyle({ width: Math.max(1, r * 0.035 * (1 - k)), color: DRAIN.pulse, alpha: 0.28 * strength * (1 - k) });
    fx.pulse.drawCircle(x, y, r * (1.0 + 0.14 * k));
  }
  // With a grey copy on top, the coloured art underneath is mostly hidden so the colour drains away
  return { tint: DRAIN.tint, alpha: fx.grey ? visible * 0.3 : visible };
}

/* ---------- Marked: crosshairs ---------- */

const MARK = {
  color: 0xFF3B30,              // red reticle
  outline: 0x2A0000,            // dark edge, so it reads on any art
  glow: 0xFF5A4A,
  spinSeconds: 24,              // the corner brackets turn slowly
  pulseSeconds: 2.2,            // a gentle "locked on" pulse
  lockSeconds: 0.6              // brackets close in when the mark is applied
};

/** The fixed part of the reticle, centred on (0, 0): a thin ring, a cross with a gap and a dot. */
function drawReticle(g, r, color, width) {
  g.clear();
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  g.lineStyle({ width, color, alpha: 1, cap: round });
  g.drawCircle(0, 0, r * 0.46);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    g.moveTo(c * r * 0.16, s * r * 0.16); g.lineTo(c * r * 0.34, s * r * 0.34);   // inside the ring
    g.moveTo(c * r * 0.56, s * r * 0.56); g.lineTo(c * r * 0.8, s * r * 0.8);     // outside it
  }
  g.lineStyle(0);
  g.beginFill(color, 1).drawCircle(0, 0, Math.max(1, width * 0.9)).endFill();
}

/** Four corner brackets: short arcs at 45°, 135°, 225° and 315°. */
function drawBrackets(g, r, color, width) {
  g.clear();
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  g.lineStyle({ width, color, alpha: 1, cap: round });
  for (let k = 0; k < 4; k++) {
    const mid = Math.PI / 4 + k * Math.PI / 2, half = 0.36;
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const a = mid - half + (2 * half * i) / steps;
      const x = Math.cos(a) * r * 0.92, y = Math.sin(a) * r * 0.92;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }
}

function createMarkFx() {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { glow: newBlur(3, 3, ADD) };
  const glow = new PIXI.Container(); glow.filters = [blurs.glow];
  const glowReticle = new PIXI.Graphics(); glowReticle.blendMode = ADD;
  const glowBrackets = new PIXI.Graphics(); glowBrackets.blendMode = ADD;
  glow.addChild(glowReticle, glowBrackets);
  const reticle = new PIXI.Container();
  const reticleDark = new PIXI.Graphics(), reticleRed = new PIXI.Graphics();
  reticle.addChild(reticleDark, reticleRed);
  const brackets = new PIXI.Container();
  const bracketsDark = new PIXI.Graphics(), bracketsRed = new PIXI.Graphics();
  brackets.addChild(bracketsDark, bracketsRed);
  container.addChild(glow, reticle, brackets);
  return { container, blurs, glow, glowReticle, glowBrackets, reticle, reticleDark, reticleRed, brackets, bracketsDark, bracketsRed, born: null, drawnKey: "" };
}

/** Crosshairs over the creature: brackets lock on, then turn slowly; the reticle pulses gently. */
function updateMarkFx(token, fx, { now, zoom }) {
  const art = artCircle(token);
  const r = art.r, T = now / 1000;
  if (fx.born === null) fx.born = now;
  const key = `${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) {
    const core = Math.max(1, r * 0.022), edge = core + Math.max(1.5, r * 0.022);
    drawReticle(fx.reticleDark, r, MARK.outline, edge);
    drawReticle(fx.reticleRed, r, MARK.color, core);
    drawBrackets(fx.bracketsDark, r, MARK.outline, edge * 1.15);
    drawBrackets(fx.bracketsRed, r, MARK.color, core * 1.3);
    drawReticle(fx.glowReticle, r, MARK.glow, core * 2.5);
    drawBrackets(fx.glowBrackets, r, MARK.glow, core * 3);
    fx.drawnKey = key;
  }
  fx.blurs.glow.blur = Math.max(1, r * 0.04 * zoom);
  const lock = clamp01((now - fx.born) / (MARK.lockSeconds * 1000));
  const settle = 1 - (1 - lock) ** 3;                                     // fast, then easing in
  const pulse = Math.sin((T / MARK.pulseSeconds) * Math.PI * 2);
  const spin = (T / MARK.spinSeconds) * Math.PI * 2;
  for (const part of [fx.reticle, fx.brackets, fx.glow]) part.position.set(art.x, art.y);
  fx.reticle.scale.set(1 + 0.025 * pulse);
  fx.reticle.alpha = 0.9 + 0.1 * pulse;
  fx.brackets.scale.set((1.35 - 0.35 * settle) * (1 + 0.02 * pulse));
  fx.brackets.rotation = spin + (1 - settle) * 0.8;
  fx.brackets.alpha = 0.4 + 0.6 * settle;
  fx.glowBrackets.scale.set(fx.brackets.scale.x); fx.glowBrackets.rotation = fx.brackets.rotation;
  fx.glowReticle.scale.set(fx.reticle.scale.x);
  fx.glow.alpha = 0.35 + 0.15 * pulse;
  return { tint: [1, 1, 1], alpha: 1 };
}

/* ---------- Dodging: afterimages ---------- */

const DODGE = {
  ghosts: [{ side: 1, lag: 0, alpha: 0.42 }, { side: -1, lag: 0.18, alpha: 0.32 }],
  weaveSeconds: 1.8,            // one weave left and right
  reach: 0.2,                   // how far the afterimages slip aside (relative to the art's radius)
  ring: 0xE8ECF2,               // outline afterimages for art that can't be copied (token rings)
  artAlpha: 0.85                // the creature itself, a little see-through
};

function createDodgeFx(token) {
  const container = newFxContainer();
  const blurs = {};
  const ghosts = DODGE.ghosts.map((g, i) => {
    const sprite = makeArtCopy(token, null, {});
    const blur = newBlur(2, 2);
    blurs[`ghost${i}`] = blur;
    const shape = sprite ?? new PIXI.Graphics();                         // outline ghost without a copy
    shape.filters = [blur];
    return { ...g, shape, sprite };
  });
  container.addChild(...ghosts.map(g => g.shape));
  const phase = (hashString(`${token.document?.id ?? token.id ?? ""}:dodge`) % 1000) / 1000;
  return { container, blurs, ghosts, phase, drawnKey: "" };
}

/** Blurred afterimages of the creature weave side to side, as if it's in several places at once. */
function updateDodgeFx(token, fx, { now, zoom }) {
  const art = artCircle(token);
  const r = art.r, T = now / 1000;
  const key = `${Math.round(art.x)}|${Math.round(art.y)}|${Math.round(r * 4)}`;
  for (const g of fx.ghosts) {
    const weave = Math.sin(((T / DODGE.weaveSeconds) + fx.phase - g.lag) * Math.PI * 2);
    const dx = g.side * r * DODGE.reach * (0.55 + 0.45 * weave);
    const blur = g.shape.filters?.[0];
    if (blur) { blur.blur = Math.max(1, r * 0.05 * zoom); if ("blurY" in blur) blur.blurY = Math.max(0.5, r * 0.01 * zoom); }
    if (g.sprite) {
      syncArtCopy(token, g.sprite, dx);
    } else {
      if (key !== fx.drawnKey) {
        g.shape.clear();
        g.shape.lineStyle({ width: Math.max(1, r * 0.05), color: DODGE.ring, alpha: 1 });
        g.shape.beginFill(DODGE.ring, 0.25).drawCircle(0, 0, r * 0.97).endFill();
      }
      g.shape.position.set(art.x + dx, art.y);
    }
    g.shape.alpha = g.alpha * (0.8 + 0.2 * Math.abs(weave));
  }
  fx.drawnKey = key;
  return { tint: [1, 1, 1], alpha: DODGE.artAlpha };
}

