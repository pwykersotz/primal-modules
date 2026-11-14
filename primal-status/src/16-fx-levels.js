/* ---------- Contamination (Monsters of Drakkenheim): a swirl of octarine light ---------- */

// Octarine, the colour of raw magic: mostly violet, shading through magenta and pink, with an
// eerie glint of mint now and then. The glow keeps to the violets.
const OCTARINE = [0x8A3CFF, 0xB84DFF, 0xE55CFF, 0xFF6AD5, 0xB84DFF, 0x7B5CFF, 0x7CFFC8, 0x8A3CFF];
const OCTARINE_GLOW = [0x8A3CFF, 0xA94DFF, 0xC85CFF, 0x7A4DFF, 0x8A3CFF];
const CONTAM = {
  core: 0xF4E2FF,          // bright lilac light along each strand
  lapSeconds: 16,          // one turn of the outer swirl
  innerLapSeconds: 10,     // the inner swirl turns faster
  shimmerSeconds: 8,       // one cycle of the glow's colour
  maxMotes: 21
};

/** A colour on the octarine cycle (t wraps around 0–1). */
function octarine(t, ramp = OCTARINE) {
  const n = ramp.length - 1;
  const x = (((t % 1) + 1) % 1) * n, i = Math.min(n - 1, Math.floor(x));
  return lerpColor(ramp[i], ramp[i + 1], x - i);
}

function createContamFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { halo: newBlur(10, 4, ADD), veil: newBlur(12, 4, ADD), glow: newBlur(5, 4, ADD), core: newBlur(1, 2, ADD) };
  const glowing = (blur) => { const g = new PIXI.Graphics(); g.blendMode = ADD; g.filters = [blur]; return g; };
  const halo = glowing(blurs.halo), veil = glowing(blurs.veil);
  const outer = new PIXI.Container(), inner = new PIXI.Container();
  const outerGlow = glowing(blurs.glow), outerCore = glowing(blurs.core);
  const innerGlow = glowing(blurs.glow), innerCore = glowing(blurs.core);
  outer.addChild(outerGlow, outerCore);
  inner.addChild(innerGlow, innerCore);
  const motes = new PIXI.Graphics(); motes.blendMode = ADD;
  container.addChild(veil, halo, inner, outer, motes);
  const rand = seededRandom(hashString(`${token.id ?? ""}:contamination`));
  const moteData = Array.from({ length: CONTAM.maxMotes }, () => ({
    angle: rand() * Math.PI * 2, period: 3.5 + rand() * 3, offset: rand(), size: 0.016 + rand() * 0.014, hue: rand()
  }));
  return { container, blurs, halo, veil, outer, inner, outerGlow, outerCore, innerGlow, innerCore, motes, moteData,
    seed: hashString(`${token.id ?? ""}:swirl`), shown: 0, drawnKey: "" };
}

/** Spiral arms curling in from outside the rim (drawn once; the layer rotates). */
function drawSwirlArms(glow, core, r, { arms, rOut, rIn, twist, width, seed, colorOffset }) {
  glow.clear(); core.clear();
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  const rand = seededRandom(seed);
  const steps = 28;
  for (let a = 0; a < arms; a++) {
    const base = (a / arms) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const tw = twist * (0.85 + rand() * 0.3);
    const reachIn = rIn * (0.9 + rand() * 0.2);
    const tint = colorOffset + a / arms;
    let px = 0, py = 0;
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const rho = rOut - (rOut - reachIn) * Math.pow(s, 0.85);
      const th = base + tw * s;
      const x = Math.cos(th) * rho, y = Math.sin(th) * rho;
      if (i > 0) {
        const fade = Math.min(1, s / 0.18) * Math.min(1, (1 - s) / 0.35);   // soft at both ends
        const w = width * r * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, s * 1.15)));
        const color = octarine(tint + s * 0.45);
        glow.lineStyle({ width: w * 2.8, color, alpha: 0.45 * fade, cap: round });
        glow.moveTo(px, py); glow.lineTo(x, y);
        core.lineStyle({ width: Math.max(0.6, w * 0.5), color: lerpColor(CONTAM.core, color, 0.3), alpha: 0.85 * fade, cap: round });
        core.moveTo(px, py); core.lineTo(x, y);
      }
      px = x; py = y;
    }
  }
}

/** A slowly turning vortex of octarine light; more of it, reaching further in, at each level. */
function updateContamFx(token, fx, { now, dt, zoom }) {
  const level = contaminationLevel(token.actor);
  const art = artCircle(token);
  const r = art.r, T = now / 1000;
  fx.shown += (level - fx.shown) * Math.min(1, (dt || 1 / 60) * 2.5);   // swell in rather than pop
  const k = clamp01(fx.shown / CONTAM_MAX);

  const key = `${level}|${Math.round(r * 4)}`;
  if (fx.drawnKey !== key) {
    const L = Math.max(1, Math.min(CONTAM_MAX, level));
    drawSwirlArms(fx.outerGlow, fx.outerCore, r, { arms: 2 + L, rOut: r * 1.16, rIn: r * (0.86 - 0.09 * L), twist: 2.4, width: 0.045, seed: fx.seed, colorOffset: 0 });
    if (L >= 2) drawSwirlArms(fx.innerGlow, fx.innerCore, r, { arms: L - 1, rOut: r * 0.98, rIn: r * (0.78 - 0.09 * L), twist: 3.1, width: 0.03, seed: fx.seed + 1, colorOffset: 0.5 });
    else { fx.innerGlow.clear(); fx.innerCore.clear(); }
    fx.halo.clear();
    fx.halo.lineStyle({ width: r * 0.24, color: 0xFFFFFF, alpha: 1 }).drawCircle(0, 0, r * 1.02);
    fx.veil.clear();
    fx.veil.beginFill(0xFFFFFF, 1).drawCircle(0, 0, r * 0.88).endFill();
    fx.drawnKey = key;
  }

  fx.blurs.halo.blur = Math.max(1, r * 0.12 * zoom);
  fx.blurs.veil.blur = Math.max(1, r * 0.2 * zoom);
  fx.blurs.glow.blur = Math.max(1, r * 0.05 * zoom);
  fx.blurs.core.blur = Math.max(0.5, r * 0.008 * zoom);

  const shimmer = T / CONTAM.shimmerSeconds;
  for (const layer of [fx.halo, fx.veil, fx.outer, fx.inner]) layer.position.set(art.x, art.y);
  fx.halo.tint = octarine(shimmer, OCTARINE_GLOW);
  fx.halo.alpha = (0.15 + 0.55 * k) * (0.9 + 0.1 * Math.sin(T * 1.3));
  fx.veil.tint = octarine(shimmer + 0.5, OCTARINE_GLOW);
  fx.veil.alpha = 0.2 * Math.pow(k, 1.2);
  // Turning against the curl of the arms makes the light seem to pour inward
  fx.outer.rotation = -(T / CONTAM.lapSeconds) * Math.PI * 2;
  fx.inner.rotation = -(T / CONTAM.innerLapSeconds) * Math.PI * 2 + 1.3;
  fx.outer.scale.set(1 + 0.02 * Math.sin(T * 0.9));
  fx.outer.alpha = 0.3 + 0.7 * k;
  fx.inner.alpha = 0.25 + 0.75 * k;

  // Motes of light drawn in along the swirl
  const g = fx.motes;
  g.clear();
  const count = Math.min(CONTAM.maxMotes, Math.round(3 + 3 * fx.shown));
  const rOut = r * 1.2, rIn = r * Math.max(0.2, 0.8 - 0.09 * fx.shown);
  for (let i = 0; i < count; i++) {
    const m = fx.moteData[i];
    const p = (((T / m.period) + m.offset) % 1 + 1) % 1;
    const rho = rOut - (rOut - rIn) * p;
    const a = m.angle + p * 2.6 - (T / CONTAM.lapSeconds) * Math.PI * 2;
    const size = Math.max(0.6, r * m.size * (1 - 0.5 * p));
    const alpha = Math.sin(Math.PI * p) * (0.55 + 0.45 * k);
    const color = octarine(m.hue + shimmer);
    const x = art.x + Math.cos(a) * rho, y = art.y + Math.sin(a) * rho;
    g.beginFill(color, alpha * 0.35).drawCircle(x, y, size * 2.4).endFill();
    g.beginFill(lerpColor(CONTAM.core, color, 0.4), alpha).drawCircle(x, y, size).endFill();
  }

  // A faint violet cast over the creature as the contamination deepens
  return { tint: [1 - 0.02 * fx.shown, 1 - 0.035 * fx.shown, 1], alpha: 1 };
}

/* ---------- Exhaustion: bloodshot cracks creeping in from the edge ---------- */

const VEIN = {
  core: 0xB00E17,          // the cracks themselves
  glow: 0xE0141E,          // blood seeping out around each crack
  bleed: 0x8A0710,         // red flush around the rim
  roots: 15,               // main cracks around the rim
  capillaries: 30,         // short fine ones in between
  growPerSecond: 0.35      // how fast cracks lengthen (fraction of the radius per second)
};

/** How far in (fraction of the radius, along each crack) the cracks reach at each level. */
function exhaustionReach(level) {
  return level <= 0 ? 0 : 0.1 + 0.135 * (Math.min(6, level) - 1);
}

/**
 * A branching network of fine cracks in unit space (rim at radius 1), the same every time for
 * a token. Each crack meanders like a blood vessel, with the odd sharp kink of a crack.
 */
function growVeinTree(seed) {
  const rand = seededRandom(seed);
  const segs = [];
  const step = 0.025;
  const turnToward = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const walk = (x, y, dir, depth, end, width, gen) => {
    const start = depth;
    let d = depth, turn = 0, guard = 0;
    while (d < end && guard++ < 300) {
      turn = turn * 0.75 + (rand() - 0.5) * 0.32;          // meander
      if (rand() < 0.08) turn += (rand() - 0.5) * 1.2;      // the odd sharp kink
      dir += turn;
      dir += turnToward(dir, Math.atan2(-y, -x)) * 0.08;    // always working inward
      let nx = x + Math.cos(dir) * step, ny = y + Math.sin(dir) * step;
      const out = Math.hypot(nx, ny);
      if (out > 0.99) { nx *= 0.99 / out; ny *= 0.99 / out; }
      segs.push({ x1: x, y1: y, x2: nx, y2: ny, d1: d, d2: d + step, d0: start, end, w: width, gen });
      x = nx; y = ny; d += step;
      if (gen < 3 && rand() < (gen === 0 ? 0.13 : 0.08)) {
        const side = rand() < 0.5 ? -1 : 1;
        walk(x, y, dir + side * (0.5 + rand() * 0.6), d, Math.min(end, d + (0.1 + rand() * 0.28) / (gen + 1)), width * 0.6, gen + 1);
      }
    }
  };
  for (let i = 0; i < VEIN.roots; i++) {
    const a = (i / VEIN.roots) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    walk(Math.cos(a) * 0.985, Math.sin(a) * 0.985, a + Math.PI + (rand() - 0.5) * 0.6, 0, 0.55 + rand() * 0.35, 1, 0);
  }
  for (let i = 0; i < VEIN.capillaries; i++) {
    const a = rand() * Math.PI * 2;
    walk(Math.cos(a) * 0.985, Math.sin(a) * 0.985, a + Math.PI + (rand() - 0.5) * 0.9, 0, 0.06 + rand() * 0.2, 0.4, 2);
  }
  return segs;
}

function createExhaustFx(token) {
  const container = newFxContainer();
  const blurs = { bleed: newBlur(10, 4), glow: newBlur(3, 3) };
  const bleed = new PIXI.Graphics(); bleed.filters = [blurs.bleed];
  const glow = new PIXI.Graphics(); glow.filters = [blurs.glow];
  const veins = new PIXI.Graphics();
  container.addChild(bleed, glow, veins);
  return { container, blurs, bleed, glow, veins, tree: growVeinTree(hashString(`${token.id ?? ""}:veins`)), reach: 0, drawnKey: "" };
}

/** Red cracks spreading in from the rim like bloodshot eyes; deeper at each level. */
function updateExhaustFx(token, fx, { dt, zoom }) {
  const level = exhaustionLevel(token.actor);
  const art = artCircle(token);
  const { x: cx, y: cy, r } = art;
  const target = exhaustionReach(level);
  const stepBy = VEIN.growPerSecond * (dt || 1 / 60);
  fx.reach = fx.reach < target ? Math.min(target, fx.reach + stepBy) : Math.max(target, fx.reach - stepBy * 2);
  const shown = fx.reach / exhaustionReach(6);            // 0 → 1 across the levels

  fx.blurs.bleed.blur = Math.max(1, r * 0.1 * zoom);
  fx.blurs.glow.blur = Math.max(0.5, r * 0.02 * zoom);

  const key = `${fx.reach.toFixed(3)}|${Math.round(cx)},${Math.round(cy)},${Math.round(r * 4)}`;
  if (fx.drawnKey !== key) {
    fx.drawnKey = key;
    const round = PIXI.LINE_CAP?.ROUND ?? "round";
    // A flush of red around the edge that widens as the cracks deepen
    const band = r * (0.1 + 0.3 * shown);
    fx.bleed.clear();
    fx.bleed.lineStyle({ width: band, color: VEIN.bleed, alpha: 0.15 + 0.3 * shown }).drawCircle(cx, cy, r - band * 0.6);
    fx.glow.clear(); fx.veins.clear();
    const reach = fx.reach;
    for (const s of fx.tree) {
      if (s.d1 >= reach) continue;
      const f = Math.min(1, (reach - s.d1) / (s.d2 - s.d1));           // the growing tip
      const tip = Math.min(s.end, reach);
      const taper = clamp01((tip - s.d1) / Math.max(0.03, tip - s.d0));  // thick at its root, a hairline at its tip
      const w = r * 0.017 * s.w * (0.25 + 0.75 * Math.pow(taper, 0.9));
      const x1 = cx + s.x1 * r, y1 = cy + s.y1 * r;
      const x2 = cx + (s.x1 + (s.x2 - s.x1) * f) * r, y2 = cy + (s.y1 + (s.y2 - s.y1) * f) * r;
      fx.glow.lineStyle({ width: w * 4, color: VEIN.glow, alpha: 0.3, cap: round });
      fx.glow.moveTo(x1, y1); fx.glow.lineTo(x2, y2);
      fx.veins.lineStyle({ width: Math.max(0.5, w), color: VEIN.core, alpha: 0.6 + 0.35 * taper, cap: round });
      fx.veins.moveTo(x1, y1); fx.veins.lineTo(x2, y2);
    }
  }
  // The creature looks drained and flushed
  return { tint: [1 - 0.06 * shown, 1 - 0.2 * shown, 1 - 0.2 * shown], alpha: 1 };
}

/* ---------- Level counters (Hearthstone-style gems) ---------- */

const BADGE = {
  size: 50,                // gems are drawn at this radius and scaled to fit
  outline: 0x0A0710,
  // Contamination: an octarine gem in a pewter setting, with shards of delerium behind it
  rim: 0x8C7BA0, rimLight: 0xE9DFF6, rimDark: 0x3E3050,
  gem: 0x6A1FC2, gemLight: 0xC48CFF, gemDark: 0x320A6E,
  shard: 0x4A1B88, shardLight: 0xA67AF5,
  // Exhaustion: a blood-red drop in a dark red setting
  dropRim: 0x7E2A25, dropRimLight: 0xE08474, dropRimDark: 0x340908,
  drop: 0xC2141C, dropLight: 0xFF7262, dropDark: 0x5E0408,
  popMs: 320
};

function badgeTextStyle() {
  return new PIXI.TextStyle({
    fontFamily: ["Modesto Condensed", "Signika", "serif"], fontSize: 66, fontWeight: "bold",
    fill: ["#FFFFFF", "#EFE9F5"], stroke: "#000000", strokeThickness: 12, lineJoin: "round",
    dropShadow: true, dropShadowColor: "#000000", dropShadowBlur: 4, dropShadowDistance: 3, dropShadowAngle: Math.PI / 2,
    padding: 10
  });
}

/** Circle drawn as three offset discs: a dark lower-right edge, a bright upper-left edge, the body. */
function bevelDisc(g, x, y, r, dark, light, body, shift) {
  g.beginFill(dark, 1).drawCircle(x, y, r).endFill();
  g.beginFill(light, 1).drawCircle(x - shift, y - shift, r * 0.975).endFill();
  g.beginFill(body, 1).drawCircle(x + shift * 0.3, y + shift * 0.3, r * 0.94).endFill();
}

function drawContamBadge(g) {
  const R = BADGE.size;
  // A cluster of delerium crystals behind the gem, the big one crossing it like the sword
  // behind a Hearthstone attack gem
  const crystal = (deg, from, to, half) => {
    const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const P = (along, side) => [ux * along * R + vx * side * R, uy * along * R + vy * side * R];
    const shoulder = to - half * 1.6;
    g.lineStyle({ width: R * 0.08, color: BADGE.outline, alpha: 1, join: PIXI.LINE_JOIN?.ROUND ?? "round" });
    g.beginFill(BADGE.shard, 1).drawPolygon([...P(from, -half), ...P(shoulder, -half), ...P(to, 0), ...P(shoulder, half), ...P(from, half)]).endFill();
    g.lineStyle(0);
    g.beginFill(BADGE.shardLight, 0.85).drawPolygon([...P(from, 0), ...P(to - half * 0.2, 0), ...P(shoulder, -half * 0.8), ...P(from, -half * 0.8)]).endFill();
  };
  crystal(-165, 0.2, 1.3, 0.17);
  crystal(-100, 0.2, 1.35, 0.17);
  crystal(45, 0.2, 1.22, 0.19);                 // the big crystal's butt, lower right
  crystal(-135, 0.2, 1.85, 0.23);               // and its point, upper left
  g.beginFill(BADGE.outline, 1).drawCircle(0, 0, R).endFill();
  bevelDisc(g, 0, 0, R * 0.92, BADGE.rimDark, BADGE.rimLight, BADGE.rim, R * 0.05);
  g.beginFill(BADGE.outline, 1).drawCircle(0, 0, R * 0.74).endFill();
  bevelDisc(g, 0, 0, R * 0.7, BADGE.gemDark, lerpColor(BADGE.gem, BADGE.gemLight, 0.4), BADGE.gem, R * 0.04);
  g.beginFill(lerpColor(BADGE.gem, BADGE.gemLight, 0.45), 0.8).drawCircle(-R * 0.12, -R * 0.15, R * 0.42).endFill();
  g.beginFill(BADGE.gemLight, 0.65).drawCircle(-R * 0.2, -R * 0.26, R * 0.2).endFill();
  g.beginFill(0xFFFFFF, 0.35).drawEllipse(-R * 0.2, -R * 0.4, R * 0.3, R * 0.12).endFill();
}

/** Points around a drop shape (a circle with a point on top) centred on its round part. */
function dropPoints(s) {
  const R = BADGE.size, c = R * 0.14, rr = R * 0.84 * s;
  const pts = [0, c - 1.221 * rr];                                         // tip (tangent to the circle at ±55°)
  for (let deg = -55; deg <= 235; deg += 10) {
    const a = deg * Math.PI / 180;
    pts.push(Math.cos(a) * rr, c + Math.sin(a) * rr);
  }
  return pts;
}

function drawExhaustBadge(g) {
  const R = BADGE.size;
  const shifted = (pts, dx, dy) => pts.map((v, i) => v + (i % 2 ? dy : dx));
  g.beginFill(BADGE.outline, 1).drawPolygon(dropPoints(1.12)).endFill();
  g.beginFill(BADGE.dropRimDark, 1).drawPolygon(dropPoints(1.0)).endFill();
  g.beginFill(BADGE.dropRimLight, 1).drawPolygon(shifted(dropPoints(0.97), -R * 0.05, -R * 0.05)).endFill();
  g.beginFill(BADGE.dropRim, 1).drawPolygon(shifted(dropPoints(0.93), R * 0.015, R * 0.015)).endFill();
  g.beginFill(BADGE.outline, 1).drawPolygon(dropPoints(0.79)).endFill();
  g.beginFill(BADGE.dropDark, 1).drawPolygon(dropPoints(0.75)).endFill();
  g.beginFill(BADGE.drop, 1).drawPolygon(shifted(dropPoints(0.69), -R * 0.03, -R * 0.03)).endFill();
  g.beginFill(lerpColor(BADGE.drop, BADGE.dropLight, 0.45), 0.8).drawCircle(-R * 0.12, R * 0.02, R * 0.36).endFill();
  g.beginFill(BADGE.dropLight, 0.6).drawCircle(-R * 0.2, -R * 0.1, R * 0.17).endFill();
  g.beginFill(0xFFFFFF, 0.35).drawEllipse(-R * 0.16, -R * 0.3, R * 0.18, R * 0.1).endFill();
}

function createBadge(draw, textY) {
  const holder = new PIXI.Container();
  const shape = new PIXI.Graphics();
  draw(shape);
  const sheen = new PIXI.Graphics();
  sheen.blendMode = PIXI.BLEND_MODES.ADD;
  const text = new PIXI.Text("", badgeTextStyle());
  text.anchor?.set?.(0.5);
  text.position.set(0, textY);
  holder.addChild(shape, sheen, text);
  holder.visible = false;
  return { holder, shape, sheen, text, value: 0, popAt: -Infinity };
}

function createCounterFx(token) {
  const container = newFxContainer();
  const contam = createBadge(drawContamBadge, BADGE.size * 0.04);
  const exhaust = createBadge(drawExhaustBadge, BADGE.size * 0.2);
  // An octarine sheen that slides around the contamination gem's lower edge
  contam.sheen.lineStyle({ width: BADGE.size * 0.1, color: 0xFFFFFF, alpha: 1, cap: PIXI.LINE_CAP?.ROUND ?? "round" });
  contam.sheen.moveTo(Math.cos(0.3) * BADGE.size * 0.55, Math.sin(0.3) * BADGE.size * 0.55);
  contam.sheen.arc(0, 0, BADGE.size * 0.55, 0.3, 1.9);
  container.addChild(contam.holder, exhaust.holder);
  return { container, blurs: {}, contam, exhaust };
}

/** Keep one gem in step with its level: hidden at 0, a little pop when the number changes. */
function updateBadge(badge, level, x, y, scale, now) {
  badge.holder.visible = level > 0;
  if (level <= 0) { badge.value = 0; return; }
  if (badge.value !== level) {
    badge.text.text = String(level);
    badge.value = level;
    badge.popAt = now;
  }
  const e = clamp01((now - badge.popAt) / BADGE.popMs);
  badge.holder.position.set(x, y);
  badge.holder.scale.set(scale * (1 + 0.35 * Math.pow(1 - e, 2)));
}

function updateCounterFx(token, fx, { now }) {
  const art = artCircle(token);
  const grid = Number(canvas?.dimensions?.size) || 100;
  // in step with the token's own size, so a small creature's portrait isn't buried under them
  const R = Math.min(grid * 0.32, Math.max(grid * 0.04, art.r * 0.28));
  const scale = R / BADGE.size;
  const ox = art.r * 0.74, oy = art.r * 0.7;
  updateBadge(fx.contam, contaminationLevel(token.actor), art.x - ox, art.y + oy, scale, now);
  updateBadge(fx.exhaust, exhaustionLevel(token.actor), art.x + ox, art.y + oy, scale, now);
  fx.contam.sheen.tint = octarine(now / 1000 / CONTAM.shimmerSeconds);
  fx.contam.sheen.alpha = 0.45 + 0.15 * Math.sin(now / 700);
  return { tint: [1, 1, 1], alpha: 1 };
}

