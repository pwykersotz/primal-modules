/* ---------- Cover: drifting fog ---------- */

function createFogFx(token) {
  const container = newFxContainer();
  const puffLayer = new PIXI.Container();
  const tendrilLayer = new PIXI.Container();
  const blurs = { puff: newBlur(8, 4), tendril: newBlur(4, 3) };
  puffLayer.filters = [blurs.puff];
  tendrilLayer.filters = [blurs.tendril];
  container.addChild(puffLayer, tendrilLayer);

  const rand = seededRandom(hashString(`${token.document.id ?? token.id ?? Math.random()}-fog`));
  const dir = () => (rand() < 0.5 ? -1 : 1);

  const puffs = [];
  for (let i = 0; i < FOG.puffCount; i++) {
    const g = new PIXI.Graphics();
    g.beginFill(FOG.puffColor, 1).drawCircle(0, 0, 1).endFill();
    puffLayer.addChild(g);
    puffs.push({
      g, orbit: 0.12 + rand() * 0.5, speed: (0.5 + rand() * 0.8) * dir(), phase: rand() * Math.PI * 2,
      size: 0.3 + rand() * 0.22, breathe: rand() * Math.PI * 2, alpha: 0.28 + rand() * 0.18, squash: 0.75 + rand() * 0.25
    });
  }

  const tendrils = [];
  for (let i = 0; i < FOG.tendrilCount; i++) {
    const g = new PIXI.Graphics();
    tendrilLayer.addChild(g);
    tendrils.push({
      g, radius: 0.45 + rand() * 0.4, sweep: 1.3 + rand() * 1.4, speed: (0.6 + rand() * 0.7) * dir(),
      phase: rand() * Math.PI * 2, width: 0.07 + rand() * 0.06, alpha: 0.3 + rand() * 0.18
    });
  }

  return { container, blurs, puffs, tendrils, w: 0, h: 0 };
}

/** Draw each smoke tendril as a tapered arc around (0, 0); it is rotated in place each frame. */
function layoutFogFx(token, fx) {
  fx.w = token.w; fx.h = token.h;
  const r = Math.min(fx.w, fx.h) / 2;
  const segments = 18;
  for (const t of fx.tendrils) {
    const g = t.g;
    g.clear();
    for (let j = 0; j < segments; j++) {
      const a0 = (j / segments) * t.sweep, a1 = ((j + 1) / segments) * t.sweep;
      const taper = Math.sin(Math.PI * (j + 0.5) / segments); // thin at both ends
      const rr = t.radius * r;
      g.lineStyle({ width: Math.max(1, t.width * r * taper), color: FOG.tendrilColor, alpha: 1,
        cap: PIXI.LINE_CAP?.ROUND ?? "round" });
      g.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr * 0.92);
      g.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr * 0.92);
    }
    g.position.set(fx.w / 2, fx.h / 2);
  }
}

/** Animate the fog; returns how it modifies the token art. */
function updateFogFx(token, fx, { now, zoom }) {
  if (fx.w !== token.w || fx.h !== token.h) layoutFogFx(token, fx);
  const density = fogDensity(token.actor) || 0.85;
  const r = Math.min(fx.w, fx.h) / 2, cx = fx.w / 2, cy = fx.h / 2;
  const T = now / 1000;
  const swirl = (Math.PI * 2) / FOG.driftSeconds;

  fx.blurs.puff.blur = r * 0.3 * zoom;
  fx.blurs.tendril.blur = Math.max(1, r * 0.05 * zoom);

  for (const p of fx.puffs) {
    const a = p.phase + p.speed * T * swirl;
    p.g.x = cx + Math.cos(a) * p.orbit * r;
    p.g.y = cy + Math.sin(a) * p.orbit * r * 0.85;
    const s = p.size * r * (1 + 0.12 * Math.sin(T * 0.7 + p.breathe));
    p.g.scale.set(s, s * p.squash);
    p.g.rotation = a * 0.5;
    p.g.alpha = p.alpha * density * (0.8 + 0.2 * Math.sin(T * 0.5 + p.breathe));
  }

  for (const t of fx.tendrils) {
    t.g.rotation = t.phase + t.speed * T * swirl * 1.4;
    t.g.alpha = t.alpha * density * (0.7 + 0.3 * Math.sin(T * 0.45 + t.phase));
  }

  // Greyed, slightly faded art, more so in heavier cover
  return {
    tint: FOG.artTint.map(c => 1 + (c - 1) * density),
    alpha: 1 - (1 - FOG.artAlpha) * density
  };
}

/* ---------- Sleeping: floating Z's ---------- */

const Z_FONT_SIZE = 72; // drawn large and scaled down so it stays crisp when zoomed in

function createSleepFx(token) {
  const container = newFxContainer();
  const style = new PIXI.TextStyle({
    fontFamily: CONFIG.canvasTextStyle?.fontFamily ?? "Signika",
    fontSize: Z_FONT_SIZE,
    fontWeight: "bold",
    fill: SLEEP.fill,
    stroke: SLEEP.stroke,
    strokeThickness: 9,
    lineJoin: "round",
    dropShadow: true,
    dropShadowColor: SLEEP.glow,
    dropShadowBlur: 14,
    dropShadowDistance: 0,
    dropShadowAlpha: 0.9,
    padding: 24
  });
  const zs = [];
  for (let i = 0; i < SLEEP.count; i++) {
    const text = new PIXI.Text("Z", style);
    text.anchor.set(0.5);
    text.alpha = 0;
    container.addChild(text);
    zs.push({ text, offset: i / SLEEP.count });
  }
  return { container, blurs: {}, zs };
}

/** Float the Z's up and to the right from the top of the token, growing and fading. */
function updateSleepFx(token, fx, { now }) {
  const w = token.w, h = token.h, size = Math.max(w, h);
  const T = now / 1000;
  for (const z of fx.zs) {
    const t = ((T / SLEEP.cycleSeconds) + z.offset) % 1; // 0 → 1 over a Z's life
    const x = w * 0.6 + w * 0.32 * t + Math.sin(t * Math.PI * 2 + z.offset * 5) * w * 0.05;
    const y = h * 0.28 - h * 0.62 * t;
    z.text.position.set(x, y);
    z.text.scale.set((size * SLEEP.size * (0.4 + 0.6 * t)) / Z_FONT_SIZE);
    z.text.rotation = -0.22 + 0.14 * Math.sin(t * Math.PI * 2 + z.offset * 3);
    z.text.alpha = t < 0.15 ? t / 0.15 : (t > 0.65 ? (1 - t) / 0.35 : 1);
  }
  return { tint: [1, 1, 1], alpha: 1 }; // leaves the token art unchanged
}

/* ---------- Haste / Slow: animated outline ---------- */

const MOTION = {
  hasted: { glow: 0x3BFF2E, ring: 0xB9FF9E, spark: 0xF0FFD8, blend: "ADD" },     // bright green
  slowed: { glow: 0x1A2C9A, ring: 0x3C5FE0, spark: 0xA9BCFF, blend: "NORMAL", lapSeconds: 10 },  // dark blue, slow crawl
  pulseSeconds: 1.4,    // glow throb
  lapSeconds: 2.4,      // default time for the running highlights to circle the token
  comets: 2,
  sparkCount: 10
};

function createMotionFx(token, palette) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const base = PIXI.BLEND_MODES[palette.blend] ?? PIXI.BLEND_MODES.NORMAL;
  const container = newFxContainer();
  const blurs = { glow: newBlur(8, 4, base), comet: newBlur(3, 3, ADD), spark: newBlur(1, 2, ADD) };

  const glow = new PIXI.Graphics();
  glow.blendMode = base;
  glow.filters = [blurs.glow];
  const ring = new PIXI.Graphics();
  ring.blendMode = base;
  const comets = new PIXI.Container();
  comets.filters = [blurs.comet];
  const sparks = new PIXI.Container();
  sparks.filters = [blurs.spark];
  container.addChild(glow, ring, comets, sparks);

  const fx = {
    container, blurs, palette, glow, ring, comets, sparks, cometGfx: [], sparkList: [], w: 0, h: 0,
    phase: (hashString(token.document.id ?? token.id ?? "") % 1000) / 1000 * Math.PI * 2
  };
  for (let i = 0; i < MOTION.comets; i++) {
    const g = new PIXI.Graphics();
    g.blendMode = ADD;
    comets.addChild(g);
    fx.cometGfx.push(g);
  }
  for (let i = 0; i < MOTION.sparkCount; i++) {
    const g = new PIXI.Graphics();
    g.blendMode = ADD;
    // Four-pointed star
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
      const rad = k % 2 ? 0.28 : 1;
      pts.push(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.beginFill(palette.spark, 1).drawPolygon(pts).endFill();
    sparks.addChild(g);
    fx.sparkList.push({ g });
  }
  return fx;
}

function layoutMotionFx(token, fx) {
  const w = token.w, h = token.h, r = Math.max(w, h) / 2;
  fx.w = w; fx.h = h;
  const { glow, ring, spark } = fx.palette;

  fx.glow.clear();
  fx.glow.lineStyle({ width: r * 0.2, color: glow, alpha: 1 });
  fx.glow.drawEllipse(w / 2, h / 2, (w / 2) * 1.04, (h / 2) * 1.04);

  fx.ring.clear();
  fx.ring.lineStyle({ width: r * 0.045, color: ring, alpha: 1 });
  fx.ring.drawEllipse(w / 2, h / 2, (w / 2) * 1.0, (h / 2) * 1.0);

  // Each comet is a bright head with a fading tail along the rim, drawn around (0, 0)
  // and spun around the token centre each frame.
  const segments = 16, sweep = 1.2, rr = r * 1.01;
  fx.cometGfx.forEach((g, i) => {
    g.clear();
    for (let j = 0; j < segments; j++) {
      const t = j / segments;                   // 0 = tail, 1 = head
      const a0 = -sweep + t * sweep, a1 = -sweep + ((j + 1) / segments) * sweep;
      g.lineStyle({ width: r * (0.03 + 0.07 * t), color: spark, alpha: 0.15 + 0.85 * t,
        cap: PIXI.LINE_CAP?.ROUND ?? "round" });
      g.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
      g.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
    }
    g.position.set(w / 2, h / 2);
    g.scale.set(1, h / w);                       // follow oval tokens
    g._offset = (i / MOTION.comets) * Math.PI * 2;
  });

  for (const s of fx.sparkList) resetSpark(s, w, h, true);
}

function resetSpark(s, w, h, randomAge) {
  const a = Math.random() * Math.PI * 2;
  const d = 0.92 + Math.random() * 0.2;
  s.x = w / 2 + Math.cos(a) * (w / 2) * d;
  s.y = h / 2 + Math.sin(a) * (h / 2) * d;
  s.life = 0.5 + Math.random() * 0.7;
  s.age = randomAge ? Math.random() * s.life : 0;
  s.size = Math.max(w, h) * (0.03 + Math.random() * 0.035);
  s.spin = (Math.random() - 0.5) * 3;
}

/** Animate a Haste/Slow outline; leaves the token art unchanged. */
function updateMotionFx(token, fx, { now, dt, zoom }) {
  if (fx.w !== token.w || fx.h !== token.h) layoutMotionFx(token, fx);
  const r = Math.max(fx.w, fx.h) / 2;
  const T = now / 1000;

  fx.blurs.glow.blur = r * 0.14 * zoom;
  fx.blurs.comet.blur = Math.max(1, r * 0.035 * zoom);
  fx.blurs.spark.blur = Math.max(0.5, r * 0.01 * zoom);

  const throb = (Math.sin((T / MOTION.pulseSeconds) * Math.PI * 2 + fx.phase) + 1) / 2;
  const flicker = 0.12 * Math.sin(T * 23 + fx.phase) * Math.sin(T * 7.3 + fx.phase);
  fx.glow.alpha = clamp01(0.55 + 0.4 * throb + flicker);
  fx.ring.alpha = clamp01(0.75 + 0.25 * throb);

  const spin = (T / (fx.palette.lapSeconds ?? MOTION.lapSeconds)) * Math.PI * 2 + fx.phase;
  for (const g of fx.cometGfx) {
    g.rotation = spin + g._offset;
    g.alpha = clamp01(0.7 + 0.3 * throb);
  }

  for (const s of fx.sparkList) {
    s.age += dt;
    if (s.age >= s.life) resetSpark(s, fx.w, fx.h, false);
    const t = s.age / s.life;
    const pop = Math.sin(t * Math.PI);           // grow then shrink
    s.g.position.set(s.x, s.y);
    s.g.scale.set(s.size * pop);
    s.g.rotation = s.spin * t;
    s.g.alpha = pop;
  }

  return { tint: [1, 1, 1], alpha: 1 };
}

/* ---------- Charmed: floating hearts ---------- */

/** Draw a heart about 100 units wide, centred on (0, 0). */
function drawHeart(g) {
  g.moveTo(0, 46);
  g.bezierCurveTo(-18, 30, -50, 8, -50, -16);
  g.bezierCurveTo(-50, -38, -32, -50, -18, -50);
  g.bezierCurveTo(-8, -50, -2, -44, 0, -34);
  g.bezierCurveTo(2, -44, 8, -50, 18, -50);
  g.bezierCurveTo(32, -50, 50, -38, 50, -16);
  g.bezierCurveTo(50, 8, 18, 30, 0, 46);
  g.closePath();
  return g;
}

/** Deterministic 0–1 noise, so each heart's path varies from cycle to cycle. */
function noise(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function createCharmFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const glowLayer = new PIXI.Container();
  const heartLayer = new PIXI.Container();
  const blurs = { glow: newBlur(6, 3, ADD) };
  glowLayer.filters = [blurs.glow];
  container.addChild(glowLayer, heartLayer);

  const hearts = [];
  for (let i = 0; i < CHARM.count; i++) {
    const glow = drawHeart(new PIXI.Graphics().beginFill(CHARM.glow, 1)).endFill();
    glow.blendMode = ADD;
    glowLayer.addChild(glow);

    const heart = new PIXI.Container();
    const body = new PIXI.Graphics();
    body.lineStyle({ width: 9, color: CHARM.stroke, alpha: 1, join: PIXI.LINE_JOIN?.ROUND ?? "round" });
    drawHeart(body.beginFill(CHARM.fill, 1)).endFill();
    const shine = new PIXI.Graphics().beginFill(0xFFFFFF, 0.55).drawEllipse(-26, -24, 11, 7).endFill();
    shine.rotation = -0.5;
    heart.addChild(body, shine);
    heartLayer.addChild(heart);

    hearts.push({ glow, heart, offset: i / CHARM.count });
  }
  return { container, blurs, hearts, seed: hashString(token.document.id ?? token.id ?? "") % 1000 };
}

/** Float hearts up from the top-left of the token, growing, beating and fading. */
function updateCharmFx(token, fx, { now, zoom }) {
  const w = token.w, h = token.h, size = Math.max(w, h);
  const T = now / 1000;
  fx.blurs.glow.blur = Math.max(1, size * 0.03 * zoom);
  const beat = 1 + 0.08 * Math.max(0, Math.sin(T * Math.PI * 2 * CHARM.beatsPerSecond));

  for (const p of fx.hearts) {
    const cycle = (T / CHARM.cycleSeconds) + p.offset;
    const t = cycle % 1;                                  // 0 → 1 over a heart's life
    const n = Math.floor(cycle) * 7 + p.offset * 13 + fx.seed;
    const startX = w * (0.18 + 0.3 * noise(n));           // varies each time a heart respawns
    const drift = (noise(n + 1) - 0.5) * w * 0.25;
    const x = startX + drift * t + Math.sin(t * Math.PI * 2 + p.offset * 6) * w * 0.05;
    const y = h * 0.3 - h * 0.65 * t;
    const scale = (size * CHARM.size * (0.45 + 0.55 * t) * beat) / 100;
    const alpha = t < 0.15 ? t / 0.15 : (t > 0.65 ? (1 - t) / 0.35 : 1);
    const tilt = (noise(n + 2) - 0.5) * 0.5 + 0.12 * Math.sin(t * Math.PI * 2);

    for (const o of [p.heart, p.glow]) {
      o.position.set(x, y);
      o.rotation = tilt;
    }
    p.heart.scale.set(scale);
    p.glow.scale.set(scale * 1.25);
    p.heart.alpha = alpha;
    p.glow.alpha = alpha * 0.8;
  }
  return { tint: [1, 1, 1], alpha: 1 }; // leaves the token art unchanged
}

/* ---------- Poisoned: bubbles (Bleeding's painted drips are in 13-fx-drakkenheim6.js) ---------- */

const DRIP = {
  // no drops and no stain (those were Bleeding's), just bubbles, a green haze and the tint
  poison: { count: 0, stain: null, tint: [0.84, 1, 0.82] }
};

const POISON_BUBBLES = { fill: 0x9CFF5A, outline: 0xD2FF95, haze: 0x6BE03A, count: 6 };

/** Draw a drop about 40 units wide: point at the top (0, -36), round bottom centred on (0, 0). */
function drawDrop(g, body, shine) {
  g.beginFill(body, 1);
  g.moveTo(0, -36);
  g.bezierCurveTo(7, -20, 20, -12, 20, 0);
  g.arc(0, 0, 20, 0, Math.PI);
  g.bezierCurveTo(-20, -12, -7, -20, 0, -36);
  g.closePath();
  g.endFill();
  g.beginFill(shine, 0.7).drawEllipse(-7, -3, 4.5, 7).endFill();
  return g;
}

function createDripFx(token, palette, withBubbles) {
  const container = newFxContainer();
  const blurs = {};
  const stain = new PIXI.Graphics();
  if (palette.stain != null) {
    blurs.stain = newBlur(6, 3);
    stain.filters = [blurs.stain];
  }
  const haze = new PIXI.Graphics();
  const bubbleLayer = new PIXI.Container();
  const strands = new PIXI.Graphics();
  const dropLayer = new PIXI.Container();
  container.addChild(haze, stain, bubbleLayer, strands, dropLayer);
  if (withBubbles) {
    blurs.haze = newBlur(10, 3);
    haze.filters = [blurs.haze];
  }

  const drops = [];
  for (let i = 0; i < palette.count; i++) {
    const g = drawDrop(new PIXI.Graphics(), palette.body, palette.shine);
    dropLayer.addChild(g);
    drops.push({ g });
  }
  const bubbles = [];
  if (withBubbles) {
    for (let i = 0; i < POISON_BUBBLES.count; i++) {
      const g = new PIXI.Graphics();
      bubbleLayer.addChild(g);
      bubbles.push({ g });
    }
  }
  return { container, blurs, palette, stain, haze, strands, drops, bubbles, withBubbles, w: 0, h: 0 };
}

function layoutDripFx(token, fx) {
  const w = token.w, h = token.h, r = Math.max(w, h) / 2;
  fx.w = w; fx.h = h;
  // Stain pooling along the lower rim (bleeding only)
  fx.stain.clear();
  if (fx.palette.stain != null) {
    fx.stain.lineStyle({ width: r * 0.12, color: fx.palette.stain, alpha: 1, cap: PIXI.LINE_CAP?.ROUND ?? "round" });
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI * (0.12 + 0.76 * (i / steps));
      const x = w / 2 + Math.cos(a) * (w / 2) * 0.95, y = h / 2 + Math.sin(a) * (h / 2) * 0.95;
      if (i === 0) fx.stain.moveTo(x, y); else fx.stain.lineTo(x, y);
    }
  }
  if (fx.withBubbles) {
    fx.haze.clear();
    fx.haze.beginFill(POISON_BUBBLES.haze, 1).drawEllipse(w / 2, h * 0.72, w * 0.4, h * 0.2).endFill();
  }
  for (const d of fx.drops) resetDrop(d, fx, true);
  for (const b of fx.bubbles) resetBubble(b, fx, true);
}

function resetDrop(d, fx, randomAge) {
  const a = Math.PI * (0.18 + Math.random() * 0.64);    // somewhere on the lower rim
  d.x = fx.w / 2 + Math.cos(a) * (fx.w / 2) * 0.96;
  d.y0 = fx.h / 2 + Math.sin(a) * (fx.h / 2) * 0.96;
  const [lo, hi] = fx.palette.life;
  d.life = lo + Math.random() * (hi - lo);
  d.age = randomAge ? Math.random() * d.life : 0;
  d.size = Math.max(fx.w, fx.h) * fx.palette.size * (0.7 + Math.random() * 0.5);
}

function resetBubble(b, fx, randomAge) {
  b.x = fx.w * (0.25 + Math.random() * 0.5);
  b.y0 = fx.h * (0.7 + Math.random() * 0.15);
  b.life = 1.4 + Math.random() * 1.4;
  b.age = randomAge ? Math.random() * b.life : 0;
  b.size = Math.max(fx.w, fx.h) * (0.025 + Math.random() * 0.03);
  b.rise = fx.h * (0.25 + Math.random() * 0.2);
  b.phase = Math.random() * Math.PI * 2;
}

/** Animate drips (bleeding) or bubbles (poison); returns how it tints the token art. */
function updateDripFx(token, fx, { now, dt, zoom }) {
  if (fx.w !== token.w || fx.h !== token.h) layoutDripFx(token, fx);
  const r = Math.max(fx.w, fx.h) / 2, T = now / 1000;
  if (fx.blurs.stain) fx.blurs.stain.blur = Math.max(1, r * 0.06 * zoom);
  if (fx.blurs.haze) fx.blurs.haze.blur = r * 0.2 * zoom;
  fx.stain.alpha = 0.45 + 0.1 * Math.sin(T * 1.3);
  if (fx.withBubbles) fx.haze.alpha = 0.16 + 0.06 * Math.sin(T * 0.9);

  // Drops: bead on the rim (hanging from a strand), then fall and fade (none for poison)
  fx.strands.clear();
  for (const d of fx.drops) {
    d.age += dt;
    if (d.age >= d.life) resetDrop(d, fx, false);
    const t = d.age / d.life;
    const unit = d.size / 40;
    let y, sx, sy, alpha;
    if (t < 0.45) {                                     // swelling on the rim
      const k = t / 0.45;
      y = d.y0 + d.size * 0.5 * k;
      sx = unit * (0.3 + 0.7 * k);
      sy = unit * (0.3 + 0.9 * k);
      alpha = Math.min(1, k * 3);
    } else {                                            // falling, accelerating
      const k = (t - 0.45) / 0.55;
      y = d.y0 + d.size * 0.5 + (fx.h * fx.palette.fall) * k * k;
      sx = unit * (1 - 0.15 * k);
      sy = unit * (1.2 + 0.5 * k);
      alpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    }
    d.g.position.set(d.x, y);
    d.g.scale.set(sx, sy);
    d.g.alpha = clamp01(alpha);
    // A thin strand connects the drop to the rim while it hangs (and briefly as it lets go)
    const strandFade = t < 0.45 ? 1 : clamp01(1 - (t - 0.45) / 0.12);
    if (strandFade > 0) {
      fx.strands.lineStyle({ width: Math.max(1, d.size * 0.12), color: fx.palette.strand, alpha: 0.85 * strandFade,
        cap: PIXI.LINE_CAP?.ROUND ?? "round" });
      fx.strands.moveTo(d.x, d.y0 - d.size * 0.2);
      fx.strands.lineTo(d.x, y - 36 * sy * 0.8);
    }
  }

  // Poison bubbles: rise, wobble, then pop into a ring
  for (const b of fx.bubbles) {
    b.age += dt;
    if (b.age >= b.life) resetBubble(b, fx, false);
    const t = b.age / b.life;
    const g = b.g;
    g.clear();
    const x = b.x + Math.sin(T * 3 + b.phase) * b.size * 0.6;
    if (t < 0.85) {
      const k = t / 0.85;
      const y = b.y0 - b.rise * k;
      const rad = b.size * (0.5 + 0.5 * k);
      g.lineStyle({ width: Math.max(1, rad * 0.25), color: POISON_BUBBLES.outline, alpha: 0.9 });
      g.beginFill(POISON_BUBBLES.fill, 0.35).drawCircle(x, y, rad).endFill();
      g.lineStyle(0);
      g.beginFill(0xFFFFFF, 0.6).drawCircle(x - rad * 0.35, y - rad * 0.35, rad * 0.25).endFill();
    } else {
      const k = (t - 0.85) / 0.15;
      const y = b.y0 - b.rise;
      g.lineStyle({ width: Math.max(1, b.size * 0.2 * (1 - k)), color: POISON_BUBBLES.outline, alpha: 1 - k });
      g.drawCircle(x, y, b.size * (1 + 0.8 * k));
    }
  }

  return { tint: fx.palette.tint, alpha: 1 };
}

/* ---------- Burning: fiery aura (or a corrosive green one, for acid) ---------- */

/*
 * Burning's value can name its damage type (the status pane's Fire / Acid buttons). Fire: flame
 * licks rising from the rim and embers drifting up. Acid: the same ring, but green, the licks
 * rounder and slower like fizzing froth, and drops of acid dripping from the lower rim. The type is
 * looked at a few times a second, so changing it in the pane changes the aura straight away.
 */
const FIRE = {
  // Colour of a flame lick over its life: hot core → orange → deep red as it cools
  ramp: [[0, 0xFFE08A], [0.2, 0xFFA733], [0.45, 0xFF6A1A], [0.75, 0xC72A0C], [1, 0x6A1004]],
  glow: 0xFF6A1A,
  count: 96,            // flame licks alive at once
  emberCount: 10,
  emberColor: 0xFFB347,
  stretch: [0.85, 2.1], // a lick's width and height (tall tongues)
  rise: 1, flutter: 1,
  tint: [1, 0.9, 0.8], warm: [0, 1, 1]
};
const ACID = {
  // froth over its life: bright lime → acid green → dark, burnt olive
  ramp: [[0, 0xF2FFB0], [0.2, 0xC8FF4D], [0.45, 0x86E62A], [0.75, 0x3F9A16], [1, 0x14400A]],
  glow: 0x7CFF2A,
  emberColor: 0xC6FF5A,
  stretch: [1.05, 1.3], // rounder blobs
  rise: 0.45, flutter: 0.5,
  drip: true,           // the drops fall from the lower rim instead of rising
  tint: [0.86, 1, 0.8], warm: [1, 0, 1]
};
const BURN_TYPE_CHECK_MS = 300;

/** The aura's look for this creature: ACID if its Burning is acid, else FIRE. */
function burnLook(token) {
  let type = null;
  try { type = burningType(token?.actor); } catch { type = null; }
  return type === "acid" ? "acid" : "fire";
}

/** Linear blend between two 0xRRGGBB colours. */
function lerpColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

function fireColor(t, ramp = FIRE.ramp) {
  for (let i = 1; i < ramp.length; i++) {
    if (t <= ramp[i][0]) {
      const [t0, c0] = ramp[i - 1], [t1, c1] = ramp[i];
      return lerpColor(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return ramp[ramp.length - 1][1];
}

function createBurnFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { glow: newBlur(10, 4, ADD), outer: newBlur(6, 4, ADD), core: newBlur(3, 3, ADD), ember: newBlur(1, 2, ADD) };
  const glow = new PIXI.Graphics();
  glow.blendMode = ADD;
  glow.filters = [blurs.glow];
  const outer = new PIXI.Container();                  // larger, cooler flame bodies
  outer.filters = [blurs.outer];
  const core = new PIXI.Container();                   // small, hot cores
  core.filters = [blurs.core];
  const embers = new PIXI.Container();
  embers.filters = [blurs.ember];
  container.addChild(glow, outer, core, embers);

  const licks = [];
  for (let i = 0; i < FIRE.count; i++) {
    const body = new PIXI.Graphics().beginFill(0xFFFFFF, 1).drawCircle(0, 0, 10).endFill();
    body.blendMode = ADD;
    const hot = new PIXI.Graphics().beginFill(0xFFFFFF, 1).drawCircle(0, 0, 10).endFill();
    hot.blendMode = ADD;
    outer.addChild(body);
    core.addChild(hot);
    licks.push({ body, hot });
  }
  const sparks = [];
  for (let i = 0; i < FIRE.emberCount; i++) {
    const g = new PIXI.Graphics().beginFill(0xFFFFFF, 1).drawCircle(0, 0, 1).endFill();
    g.blendMode = ADD;
    embers.addChild(g);
    sparks.push({ g });
  }
  const kind = burnLook(token);
  return { container, blurs, glow, licks, sparks, w: 0, h: 0, kind, look: kind === "acid" ? ACID : FIRE, checkedAt: 0 };
}

function layoutBurnFx(token, fx) {
  const w = token.w, h = token.h, r = Math.max(w, h) / 2;
  fx.w = w; fx.h = h;
  fx.glow.clear();
  fx.glow.lineStyle({ width: r * 0.22, color: (fx.look ?? FIRE).glow, alpha: 1 });
  fx.glow.drawEllipse(w / 2, h / 2, (w / 2) * 1.02, (h / 2) * 1.02);
  for (const l of fx.licks) resetLick(l, fx, true);
  for (const s of fx.sparks) resetEmber(s, fx, true);
}

function resetLick(l, fx, randomAge) {
  const a = Math.random() * Math.PI * 2;
  const d = 0.94 + Math.random() * 0.08;
  l.ox = Math.cos(a); l.oy = Math.sin(a);               // outward direction
  l.x = fx.w / 2 + l.ox * (fx.w / 2) * d;
  l.y = fx.h / 2 + l.oy * (fx.h / 2) * d;
  l.life = 0.45 + Math.random() * 0.45;
  l.age = randomAge ? Math.random() * l.life : 0;
  l.size = Math.max(fx.w, fx.h) * (0.035 + Math.random() * 0.03);
  l.out = 0.18 + Math.random() * 0.12;                  // outward drift (token radii per second)
  l.up = 0.32 + Math.random() * 0.2;                    // rise (token radii per second)
  l.wobble = Math.random() * Math.PI * 2;
}

function resetEmber(e, fx, randomAge) {
  const drip = !!fx.look?.drip;
  // embers rise from the upper rim; drops of acid fall from the lower one
  const a = drip ? Math.PI * (0.15 + Math.random() * 0.7) : Math.PI * (1.1 + Math.random() * 0.8);
  e.x = fx.w / 2 + Math.cos(a) * (fx.w / 2) * 1.02;
  e.y0 = fx.h / 2 + Math.sin(a) * (fx.h / 2) * (drip ? 0.98 : 1.02);
  e.life = drip ? 0.7 + Math.random() * 0.7 : 0.9 + Math.random() * 0.9;
  e.age = randomAge ? Math.random() * e.life : 0;
  e.rise = drip ? -fx.h * (0.12 + Math.random() * 0.14) : fx.h * (0.35 + Math.random() * 0.35);
  e.sway = fx.w * (0.02 + Math.random() * 0.04);
  e.size = Math.max(fx.w, fx.h) * (0.006 + Math.random() * 0.008);
  e.phase = Math.random() * Math.PI * 2;
}

/** Animate the fire (or acid) aura; returns a warm (or sickly green) flicker for the token art. */
function updateBurnFx(token, fx, { now, dt, zoom }) {
  if (!(now - (fx.checkedAt ?? 0) < BURN_TYPE_CHECK_MS) || now < fx.checkedAt) {
    fx.checkedAt = now;
    const kind = burnLook(token);
    if (kind !== fx.kind) {          // Fire ↔ Acid picked in the pane: redo the ring and the drops
      fx.kind = kind; fx.look = kind === "acid" ? ACID : FIRE;
      fx.w = 0;
    }
  }
  const P = fx.look ?? FIRE;
  if (fx.w !== token.w || fx.h !== token.h) layoutBurnFx(token, fx);
  const r = Math.max(fx.w, fx.h) / 2, T = now / 1000;
  fx.blurs.glow.blur = r * 0.2 * zoom;
  fx.blurs.outer.blur = Math.max(1, r * 0.1 * zoom);
  fx.blurs.core.blur = Math.max(1, r * 0.035 * zoom);
  fx.blurs.ember.blur = Math.max(0.5, r * 0.01 * zoom);
  const flick = 0.5 + 0.25 * Math.sin(T * 11.3) + 0.25 * Math.sin(T * 17.9 + 1.3);
  fx.glow.alpha = 0.35 + 0.3 * flick;

  for (const l of fx.licks) {
    l.age += dt;
    if (l.age >= l.life) resetLick(l, fx, false);
    const t = l.age / l.life;
    // Drift outward and upward, with a little sideways flutter
    const flutter = Math.sin(T * 9 + l.wobble) * r * 0.02 * P.flutter;
    const x = l.x + l.ox * r * l.out * l.age + flutter;
    const y = l.y + l.oy * r * l.out * l.age - r * l.up * l.age * P.rise;
    const grow = Math.sin(Math.min(1, t * 1.15) * Math.PI);      // swell then shrink
    const s = l.size * (0.35 + 0.9 * grow) / 10;
    l.body.position.set(x, y);
    l.body.scale.set(s * P.stretch[0], s * P.stretch[1]);         // fire: tall, tongue-like; acid: round froth
    l.body.tint = fireColor(Math.min(1, t * 1.1 + 0.15), P.ramp);
    l.body.alpha = clamp01((1 - t) * 1.2) * 0.6;
    l.hot.position.set(x, y + l.size * 0.25);
    l.hot.scale.set(s * 0.35, s * (P.drip ? 0.4 : 0.75));
    l.hot.tint = fireColor(t * 0.6, P.ramp);
    l.hot.alpha = clamp01(1 - t * 1.6) * 0.45;
  }

  for (const e of fx.sparks) {
    e.age += dt;
    if (e.age >= e.life) resetEmber(e, fx, false);
    const t = e.age / e.life;
    e.g.tint = P.emberColor;
    if (P.drip) {
      // a drop gathers on the rim, then falls faster and faster, stretching as it goes
      const fall = t < 0.3 ? 0 : ((t - 0.3) / 0.7) ** 2;
      e.g.position.set(e.x, e.y0 - e.rise * fall);
      e.g.scale.set(e.size * 1.9 * (1 - 0.3 * fall), e.size * (1.9 + 2.2 * fall));
      e.g.alpha = clamp01(t < 0.3 ? t / 0.3 : 1 - (t - 0.85) / 0.15);
    } else {
      e.g.position.set(e.x + Math.sin(e.phase + t * Math.PI * 3) * e.sway, e.y0 - e.rise * t);
      e.g.scale.set(e.size * (1 - 0.5 * t));
      e.g.alpha = clamp01(t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
    }
  }

  const warm = 0.04 * flick;
  return { tint: P.tint.map((c, i) => Math.min(1, c + warm * P.warm[i])), alpha: 1 };
}

/* ---------- Restrained: rope ---------- */

const ROPE = {
  strands: [0xB39367, 0x9C7D52, 0xC4A77A],   // three twisted strands (hemp)
  seam: 0x4A3720,                            // dark line between strands
  shadow: 0x1E150B,                          // soft shadow cast on the token
  highlight: 0xEEE0C0,
  bands: [{ y0: -0.4, slope: 0.18 }, { y0: 0.02, slope: 0.18 }, { y0: 0.44, slope: 0.18 }],
  width: 0.075,           // rope thickness relative to the token radius
  sag: 0.09,              // how much each band bows, as if wrapped around a body
  wrapSeconds: 0.9,       // time for the rope to wind on when the condition is applied
  tightenSeconds: 3.2     // gentle squeeze cycle
};

/** Where a band (y = y0 + slope·x in unit-circle space) crosses the token's edge, extended slightly. */
function bandChord(y0, slope) {
  const a = 1 + slope * slope, b = 2 * y0 * slope, c = y0 * y0 - 1;
  const disc = Math.max(0, b * b - 4 * a * c);
  const x1 = (-b - Math.sqrt(disc)) / (2 * a) * 1.02, x2 = (-b + Math.sqrt(disc)) / (2 * a) * 1.02;
  return [[x1, y0 + slope * x1], [x2, y0 + slope * x2]];
}

/** Sample a gently sagging curve between two points: [{x, y, tx, ty}] with unit tangents. */
function ropePath(p1, p2, sag, step) {
  const cx = (p1[0] + p2[0]) / 2, cy = (p1[1] + p2[1]) / 2 + sag;
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.abs(sag);
  const n = Math.max(2, Math.ceil(len / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * p1[0] + 2 * u * t * cx + t * t * p2[0];
    const y = u * u * p1[1] + 2 * u * t * cy + t * t * p2[1];
    let tx = 2 * u * (cx - p1[0]) + 2 * t * (p2[0] - cx), ty = 2 * u * (cy - p1[1]) + 2 * t * (p2[1] - cy);
    const m = Math.hypot(tx, ty) || 1;
    pts.push({ x, y, tx: tx / m, ty: ty / m });
  }
  return pts;
}

/**
 * Draw twisted three-strand rope along `pts`, showing only the first `portion` of it.
 * `fadeEnds` darkens the ends where the rope passes behind the token.
 */
function drawRopeAlong(g, shadow, pts, bw, portion, fadeEnds) {
  const count = Math.floor((pts.length - 1) * clamp01(portion));
  if (count < 1) return;
  const half = bw / 2, slant = bw * 0.38;

  // Soft shadow cast onto the token
  shadow.lineStyle({ width: bw * 1.1, color: ROPE.shadow, alpha: 0.55, cap: PIXI.LINE_CAP?.ROUND ?? "round" });
  shadow.moveTo(pts[0].x, pts[0].y + bw * 0.35);
  for (let i = 1; i <= count; i++) shadow.lineTo(pts[i].x, pts[i].y + bw * 0.35);

  // Twisted strands: slanted segments cycling through three tones, separated by thin seams
  for (let i = 0; i < count; i++) {
    const a = pts[i], b = pts[i + 1];
    const nx = -a.ty, ny = a.tx;
    const quad = [
      a.x + nx * half + a.tx * slant, a.y + ny * half + a.ty * slant,
      b.x + nx * half + b.tx * slant, b.y + ny * half + b.ty * slant,
      b.x - nx * half - b.tx * slant, b.y - ny * half - b.ty * slant,
      a.x - nx * half - a.tx * slant, a.y - ny * half - a.ty * slant
    ];
    g.lineStyle({ width: Math.max(0.75, bw * 0.07), color: ROPE.seam, alpha: 0.85 });
    g.beginFill(ROPE.strands[i % 3], 1).drawPolygon(quad).endFill();

    // Darken where the rope wraps behind the token
    if (fadeEnds) {
      const t = i / (pts.length - 1);
      const edge = Math.max(0, 1 - Math.min(t, 1 - t) / 0.1);
      if (edge > 0) {
        g.lineStyle(0);
        g.beginFill(0x000000, 0.6 * edge).drawPolygon(quad).endFill();
      }
    }
  }

  // Rounded shading: light along the upper edge, shade along the lower edge
  const stripe = (offset, width, color, alpha) => {
    g.lineStyle({ width, color, alpha, cap: PIXI.LINE_CAP?.ROUND ?? "round" });
    for (let i = 0; i <= count; i++) {
      const p = pts[i], nx = -p.ty, ny = p.tx;
      const x = p.x + nx * offset, y = p.y + ny * offset;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  };
  stripe(-bw * 0.22, bw * 0.16, ROPE.highlight, 0.22);
  stripe(bw * 0.3, bw * 0.18, 0x000000, 0.22);
}

function createRopeFx(token) {
  const container = newFxContainer();
  const blurs = { shadow: newBlur(3, 3) };
  const shadow = new PIXI.Graphics();
  shadow.filters = [blurs.shadow];
  const bands = new PIXI.Graphics();
  const knot = new PIXI.Container();
  const knotShadow = new PIXI.Graphics();
  const knotRope = new PIXI.Graphics();
  const tail = new PIXI.Graphics();
  knot.addChild(knotShadow, knotRope, tail);
  const body = new PIXI.Container();                    // squeezed as the rope tightens
  body.addChild(shadow, bands, knot);
  container.addChild(body);
  return { container, body, blurs, shadow, bands, knot, knotShadow, knotRope, tail, start: performance.now(), drawn: -1, w: 0, h: 0 };
}

/** Animate the rope winding on, then an occasional tightening; leaves the token art unchanged. */
function updateRopeFx(token, fx, { now, zoom }) {
  const w = token.w, h = token.h, r = Math.max(w, h) / 2, bw = r * ROPE.width;
  const progress = clamp01((now - fx.start) / (ROPE.wrapSeconds * 1000));
  const sizeChanged = fx.w !== w || fx.h !== h;
  fx.w = w; fx.h = h;
  fx.blurs.shadow.blur = Math.max(1, bw * 0.6 * zoom);
  const toPx = ([x, y]) => [w / 2 + x * (w / 2), h / 2 + y * (h / 2)];

  // Redraw while winding on (or if the token was resized)
  if (progress < 1 || fx.drawn < 1 || sizeChanged) {
    fx.bands.clear();
    fx.shadow.clear();
    ROPE.bands.forEach((band, i) => {
      const portion = clamp01(progress * ROPE.bands.length - i);
      const [a, b] = bandChord(band.y0, band.slope).map(toPx);
      drawRopeAlong(fx.bands, fx.shadow, ropePath(a, b, r * ROPE.sag, bw * 0.55), bw, portion, true);
    });
    fx.drawn = progress;
  }

  // Small knot on the middle band, with a short frayed end hanging from it
  const mid = ROPE.bands[Math.floor(ROPE.bands.length / 2)];
  const kx = 0.18, k = toPx([kx, mid.y0 + mid.slope * kx]);
  const sagAt = r * ROPE.sag * (1 - kx * kx);           // follow the band's bow
  fx.knot.position.set(k[0], k[1] + sagAt);
  fx.knot.alpha = clamp01((progress - 0.8) / 0.2);
  if (!fx.knotDrawn || sizeChanged) {
    fx.knotRope.clear(); fx.knotShadow.clear(); fx.tail.clear();
    // Two short turns crossing over the band
    drawRopeAlong(fx.knotRope, fx.knotShadow, ropePath([-bw * 0.9, -bw * 0.9], [bw * 0.9, bw * 0.9], bw * 0.2, bw * 0.45), bw * 0.95, 1, false);
    drawRopeAlong(fx.knotRope, fx.knotShadow, ropePath([bw * 0.9, -bw * 0.8], [-bw * 0.8, bw * 0.9], -bw * 0.2, bw * 0.45), bw * 0.95, 1, false);
    // Hanging end, then a few loose fibres at its tip
    const endLen = r * 0.26;
    drawRopeAlong(fx.tail, fx.knotShadow, ropePath([0, bw * 0.4], [0, endLen], 0, bw * 0.5), bw * 0.85, 1, false);
    fx.tail.lineStyle({ width: Math.max(0.6, bw * 0.06), color: ROPE.strands[2], alpha: 0.9, cap: PIXI.LINE_CAP?.ROUND ?? "round" });
    for (const dx of [-0.35, -0.12, 0.1, 0.3]) {
      fx.tail.moveTo(dx * bw, endLen);
      fx.tail.lineTo(dx * bw * 1.8, endLen + bw * (0.5 + Math.abs(dx)));
    }
    fx.knotDrawn = true;
  }
  const T = now / 1000;
  fx.tail.rotation = 0.12 + 0.05 * Math.sin(T * 1.4);

  // Occasional tightening squeeze around the token centre
  const squeeze = progress < 1 ? 0 : Math.pow(Math.max(0, Math.sin((T / ROPE.tightenSeconds) * Math.PI * 2)), 8);
  fx.body.pivot.set(w / 2, h / 2);
  fx.body.position.set(w / 2, h / 2);
  fx.body.scale.set(1 - 0.015 * squeeze, 1 + 0.008 * squeeze);

  return { tint: [1, 1, 1], alpha: 1 };
}

/* ---------- Stunned: orbiting stars ---------- */

const STUN = {
  star: 0xFFE14D, outline: 0xB86E00, ring: 0xFFD25A,
  count: 5, lapSeconds: 6,
  centerY: 0.2,           // ring height (fraction of the token from the top)
  radiusX: 0.44, radiusY: 0.12
};

/** Draw a five-pointed star about 60 units across, centred on (0, 0). */
function drawStar(g) {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const rad = k % 2 ? 13 : 30;
    pts.push(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  g.lineStyle({ width: 5, color: STUN.outline, alpha: 1, join: PIXI.LINE_JOIN?.ROUND ?? "round" });
  g.beginFill(STUN.star, 1).drawPolygon(pts).endFill();
  g.lineStyle(0);
  g.beginFill(0xFFFFFF, 0.6).drawCircle(-6, -8, 5).endFill();
  return g;
}

function createStunFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { ring: newBlur(2, 2, ADD) };
  const orbit = new PIXI.Container();
  orbit.sortableChildren = true;                        // stars in front draw over stars behind
  const ringBack = new PIXI.Graphics();
  ringBack.zIndex = -2;
  ringBack.blendMode = ADD;
  ringBack.filters = [blurs.ring];
  const ringFront = new PIXI.Graphics();
  ringFront.zIndex = 0;
  ringFront.blendMode = ADD;
  orbit.addChild(ringBack, ringFront);
  container.addChild(orbit);

  const stars = [];
  for (let i = 0; i < STUN.count; i++) {
    const g = drawStar(new PIXI.Graphics());
    orbit.addChild(g);
    stars.push({ g, offset: (i / STUN.count) * Math.PI * 2 });
  }
  return { container, blurs, orbit, ringBack, ringFront, stars, w: 0, h: 0 };
}

function layoutStunFx(token, fx) {
  const w = token.w, h = token.h, r = Math.max(w, h) / 2;
  fx.w = w; fx.h = h;
  const rx = w * STUN.radiusX, ry = h * STUN.radiusY;
  const arc = (g, from, to, width, alpha) => {
    g.clear();
    g.lineStyle({ width, color: STUN.ring, alpha, cap: PIXI.LINE_CAP?.ROUND ?? "round" });
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const a = from + (to - from) * (i / steps);
      if (i === 0) g.moveTo(Math.cos(a) * rx, Math.sin(a) * ry); else g.lineTo(Math.cos(a) * rx, Math.sin(a) * ry);
    }
  };
  arc(fx.ringBack, Math.PI, Math.PI * 2, r * 0.035, 0.4);   // far half (top of the ellipse), faint
  arc(fx.ringFront, 0, Math.PI, r * 0.05, 0.75);            // near half (bottom of the ellipse), brighter
}

/** Spin the stars around a tilted ring; leaves the token art unchanged. */
function updateStunFx(token, fx, { now, zoom }) {
  if (fx.w !== token.w || fx.h !== token.h) layoutStunFx(token, fx);
  const w = fx.w, h = fx.h, r = Math.max(w, h) / 2, T = now / 1000;
  fx.blurs.ring.blur = Math.max(0.5, r * 0.015 * zoom);
  fx.orbit.position.set(w / 2, h * STUN.centerY);
  fx.orbit.rotation = 0.08 * Math.sin(T * 0.6);             // slow, dizzy wobble

  const rx = w * STUN.radiusX, ry = h * STUN.radiusY;
  const spin = (T / STUN.lapSeconds) * Math.PI * 2;
  const base = (r * 0.3) / 60;
  for (const s of fx.stars) {
    const a = spin + s.offset;
    const depth = Math.sin(a);                              // +1 = nearest the viewer
    const near = (depth + 1) / 2;
    s.g.position.set(Math.cos(a) * rx, Math.sin(a) * ry);
    s.g.scale.set(base * (0.6 + 0.5 * near));
    s.g.alpha = 0.5 + 0.5 * near;
    s.g.rotation = T * 0.9 + s.offset;
    s.g.zIndex = depth;
  }
  if (typeof fx.orbit.sortChildren === "function") fx.orbit.sortChildren();
  return { tint: [1, 1, 1], alpha: 1 };
}

