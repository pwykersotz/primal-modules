/* ---------- Mighty Guard: crack pattern ---------- */

/**
 * Generate jagged, branching cracks inside a unit circle, starting at the rim and
 * working inward. Returns [{ points: [[x, y], ...], width }] with width relative (0–1).
 */
function generateCracks(seed, count) {
  const rand = seededRandom(seed);
  const cracks = [];
  const grow = (x, y, angle, length, width, depth) => {
    const pts = [[x, y]];
    const steps = Math.max(2, Math.round(length / 0.07));
    for (let i = 0; i < steps; i++) {
      angle += (rand() - 0.5) * 1.0;
      const seg = (length / steps) * (0.7 + rand() * 0.6);
      x += Math.cos(angle) * seg;
      y += Math.sin(angle) * seg;
      if ((x * x) + (y * y) > 0.97) break;
      pts.push([x, y]);
      if (depth < 1 && rand() < 0.28) {
        const side = rand() < 0.5 ? -1 : 1;
        grow(x, y, angle + side * (0.5 + rand() * 0.7), length * (0.3 + rand() * 0.25), width * 0.6, depth + 1);
      }
    }
    if (pts.length > 1) cracks.push({ points: pts, width });
  };
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * (Math.PI / count);
    const inward = a + Math.PI + (rand() - 0.5) * 0.8;
    grow(Math.cos(a) * 0.96, Math.sin(a) * 0.96, inward, 0.35 + rand() * 0.3, 1, 0);
  }
  return cracks;
}

function drawCracks(g, cracks, w, h, lineWidth, color) {
  g.clear();
  for (const c of cracks) {
    g.lineStyle({
      width: Math.max(1, lineWidth * c.width), color, alpha: 1,
      cap: PIXI.LINE_CAP?.ROUND ?? "round", join: PIXI.LINE_JOIN?.ROUND ?? "round"
    });
    const [x0, y0] = c.points[0];
    g.moveTo(w / 2 + x0 * (w / 2), h / 2 + y0 * (h / 2));
    for (let i = 1; i < c.points.length; i++) {
      const [x, y] = c.points[i];
      g.lineTo(w / 2 + x * (w / 2), h / 2 + y * (h / 2));
    }
  }
}

/* ---------- Mighty Guard: effect ---------- */

function createGuardFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = {};
  const layer = (name, blur, quality = 4) => {
    const g = name === "wisps" ? new PIXI.Container() : new PIXI.Graphics();
    if (name !== "wisps") g.blendMode = ADD;
    if (blur) g.filters = [blurs[name] = newBlur(blur, quality, ADD)];
    container.addChild(g);
    return g;
  };

  const fx = {
    container, blurs, particles: [], w: 0, h: 0,
    seed: hashString(token.document.id ?? token.id ?? Math.random()),
    mist: layer("mist", 8),
    aura: layer("aura", 8),
    crackGlow: layer("crackGlow", 4),
    crackCore: layer("crackCore", 0),
    rim: layer("rim", 1, 2),
    wisps: layer("wisps", 2, 2)
  };
  fx.phase = (fx.seed % 1000) / 1000 * Math.PI * 2;

  for (let i = 0; i < FX.wispCount; i++) {
    const g = new PIXI.Graphics();
    g.blendMode = ADD;
    g.beginFill(FX.wispColor, 1).drawCircle(0, 0, 1).endFill();
    fx.wisps.addChild(g);
    fx.particles.push({ g });
  }
  return fx;
}

function layoutGuardFx(token, fx) {
  const w = token.w, h = token.h, r = Math.max(w, h) / 2;
  fx.w = w; fx.h = h;

  fx.aura.clear();
  fx.aura.lineStyle({ width: r * 0.16, color: FX.auraColor, alpha: 1 });
  fx.aura.drawEllipse(w / 2, h / 2, (w / 2) * 1.02, (h / 2) * 1.02);

  fx.rim.clear();
  fx.rim.lineStyle({ width: r * 0.05, color: FX.rimColor, alpha: 1 });
  fx.rim.drawEllipse(w / 2, h / 2, (w / 2) * 0.99, (h / 2) * 0.99);

  fx.mist.clear();
  fx.mist.beginFill(FX.mistColor, 1).drawEllipse(w / 2, h / 2, (w / 2) * 0.85, (h / 2) * 0.85).endFill();

  const cracks = generateCracks(fx.seed, FX.crackCount);
  drawCracks(fx.crackGlow, cracks, w, h, r * 0.1, FX.crackGlowColor);
  drawCracks(fx.crackCore, cracks, w, h, r * 0.032, FX.crackCoreColor);

  for (const p of fx.particles) resetWisp(p, w, h, true);
}

function resetWisp(p, w, h, randomAge) {
  const a = Math.random() * Math.PI * 2;
  const d = 0.55 + Math.random() * 0.5;
  p.x0 = w / 2 + Math.cos(a) * (w / 2) * d;
  p.y0 = h / 2 + Math.sin(a) * (h / 2) * d;
  p.life = 1.8 + Math.random() * 2.4;              // seconds
  p.age = randomAge ? Math.random() * p.life : 0;
  p.rise = h * (0.25 + Math.random() * 0.3);        // pixels risen over its life
  p.sway = w * (0.03 + Math.random() * 0.05);
  p.phase = Math.random() * Math.PI * 2;
  p.radius = Math.max(w, h) * (0.01 + Math.random() * 0.015);
}

/** Animate the Mighty Guard effect; returns how it modifies the token art. */
function updateGuardFx(token, fx, { wave, dt, now, zoom }) {
  if (fx.w !== token.w || fx.h !== token.h) layoutGuardFx(token, fx);

  // Blur is applied in screen pixels, so scale it with the canvas zoom.
  const r = Math.max(fx.w, fx.h) / 2;
  fx.blurs.mist.blur = r * 0.35 * zoom;
  fx.blurs.aura.blur = r * 0.12 * zoom;
  fx.blurs.crackGlow.blur = Math.max(1, r * 0.04 * zoom);
  fx.blurs.rim.blur = Math.max(0.5, r * 0.012 * zoom);
  fx.blurs.wisps.blur = Math.max(1, r * 0.03 * zoom);

  // Breathing glow, with a faint crackle on the cracks
  const flicker = 0.1 * Math.sin(now * 0.011 + fx.phase) * Math.sin(now * 0.0037 + fx.phase * 2);
  fx.aura.alpha = 0.35 + 0.5 * wave;
  fx.rim.alpha = 0.6 + 0.4 * wave;
  fx.mist.alpha = 0.06 + 0.12 * wave;
  fx.crackGlow.alpha = clamp01(0.6 + 0.4 * wave + flicker);
  fx.crackCore.alpha = clamp01(0.8 + 0.2 * wave + flicker);

  // Rising wisps
  for (const p of fx.particles) {
    p.age += dt;
    if (p.age >= p.life) resetWisp(p, fx.w, fx.h, false);
    const t = p.age / p.life;
    p.g.x = p.x0 + Math.sin(p.phase + t * Math.PI * 2) * p.sway;
    p.g.y = p.y0 - p.rise * t;
    p.g.alpha = Math.sin(t * Math.PI) * 0.8;
    p.g.scale.set(p.radius * (1 - 0.4 * t));
  }

  // Spectral blue, slightly translucent art
  const k = 0.6 + 0.4 * wave;
  const [lo, hi] = FX.ghostAlpha;
  return {
    tint: FX.ghostTint.map(g => 1 + (g - 1) * k),
    alpha: hi - (hi - lo) * wave
  };
}

