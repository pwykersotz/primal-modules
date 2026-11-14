/* ---------- Dying (0 HP): a faint, pulsing red skull ---------- */

const DYING = {
  tint: 0xC8102E,               // the same blood red as the Dead skull
  alpha: [0.12, 0.38],          // faint: at the bottom and top of a pulse
  beatSeconds: 2.6,             // one slow pulse
  failBoost: 0.07,              // each failed death save makes the pulse a little stronger…
  failQuicken: 0.2,             // …and quicker
  fill: 0.95,                   // the skull fills the token
  settleSeconds: 0.6,           // at three failed death saves it settles into the solid Dead skull
  artTint: [0.9, 0.85, 0.85]    // the creature looks a little pale
};

/** At 0 HP and not dead or stabilised (creatures without Hit Points never count). */
function isDying(actor) {
  const hp = actor?.system?.attributes?.hp;
  if (!hp) return false;
  const value = Number(hp.value), max = Number(hp.effectiveMax ?? hp.max);
  if (!Number.isFinite(value) || value > 0) return false;
  if (!(max > 0)) return false;
  if (isDefeatedActor(actor) || hasStatus(actor, "stable")) return false;
  return true;
}

/**
 * A monster: dnd5e's "npc" creatures that no player owns. Player characters (and anything a player
 * owns: a wild shape, a polymorph, a companion) make death saves; monsters die at 0 Hit Points.
 * Creatures of other types or systems count as player characters, as before.
 */
function isMonster(actor) {
  return actor?.type === "npc" && actor.hasPlayerOwner !== true;
}

function isDefeatedActor(actor) {
  const id = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  return hasStatus(actor, id) || hasStatus(actor, "dead");
}

function dyingShown(actor) {
  return isDying(actor) && !!settingValue("dyingFx");
}

/** The image the Dead status uses (Foundry's or the system's skull). */
function deadSkullImage() {
  const id = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  return statusConfig(id)?.img ?? statusConfig(id)?.icon ?? statusConfig("dead")?.img ?? "icons/svg/skull.svg";
}

/** A simple skull, about 100 units tall, centred on (0, 0): shown until (or if) the skull image can't load. */
function drawFallbackSkull(g) {
  g.clear();
  g.beginFill(0xFFFFFF, 1);
  g.drawEllipse(0, -12, 40, 38);                        // cranium
  g.drawRoundedRect(-24, 14, 48, 30, 8);                // jaw
  g.endFill();
  g.beginFill(0x000000, 0.75);
  g.drawEllipse(-16, -8, 11, 13); g.drawEllipse(16, -8, 11, 13);   // eye sockets
  g.drawPolygon([0, 6, -6, 18, 6, 18]);                 // nose
  for (const x of [-15, -5, 5, 15]) g.drawRect(x - 2, 30, 4, 12);  // teeth gaps
  g.endFill();
  return g;
}

function createDyingFx() {
  const container = newFxContainer();
  const skull = new PIXI.Container();
  const fallback = drawFallbackSkull(new PIXI.Graphics());
  fallback.tint = DYING.tint;
  skull.addChild(fallback);
  container.addChild(skull);
  const fx = { container, blurs: {}, skull, fallback, sprite: null };
  const loader = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
  if (typeof loader === "function" && typeof PIXI.Sprite === "function") {
    Promise.resolve(loader(deadSkullImage())).then(tex => {
      if (container.destroyed || !tex) return;
      const sprite = new PIXI.Sprite(tex);
      sprite.anchor?.set?.(0.5);
      sprite.tint = DYING.tint;
      skull.addChild(sprite);
      fallback.visible = false;
      fx.sprite = sprite;
    }).catch(() => { /* keep the drawn skull */ });
  }
  return fx;
}

/**
 * The large red skull, pulsing faintly; stronger and quicker with each failed death save. At three
 * failures it stops pulsing and settles into the solid, full-size Dead skull. A monster at 0 HP
 * shows that solid Dead skull straight away (monsters don't make death saves).
 */
function updateDyingFx(token, fx, { now }) {
  const w = token.w, h = token.h, T = now / 1000;
  const monster = isMonster(token.actor);
  const fails = monster ? 3 : Math.min(3, Math.max(0, Number(token.actor?.system?.attributes?.death?.failure) || 0));
  if (monster && (fx.diedAt === undefined || fx.diedAt === null)) { fx.diedAt = now - DYING.settleSeconds * 1000; fx.deathFrom = DEAD_SKULL.alpha; }
  let settle = 0;                                                       // 0 = dying, 1 = dead
  if (fails >= 3) {
    if (fx.diedAt === undefined || fx.diedAt === null) { fx.diedAt = now; fx.deathFrom = fx.skull.alpha; }
    const k = clamp01((now - fx.diedAt) / (DYING.settleSeconds * 1000));
    settle = 1 - (1 - k) * (1 - k);
  } else fx.diedAt = null;
  const size = Math.min(w, h) * (DYING.fill + (DEAD_SKULL.fill - DYING.fill) * settle);
  fx.skull.position.set(w / 2, h / 2);
  if (fx.sprite) {
    const tex = fx.sprite.texture;
    fx.sprite.scale.set(size / (Math.max(tex?.width ?? 1, tex?.height ?? 1) || 1));
  }
  fx.fallback.scale.set(size / 100);
  if (fails >= 3) {
    fx.skull.alpha = fx.deathFrom + (DEAD_SKULL.alpha - fx.deathFrom) * settle;
    fx.skull.scale.set(1);
    return { tint: [1, 1, 1], alpha: 1 };
  }
  const period = DYING.beatSeconds / (1 + DYING.failQuicken * fails);
  const [lo, hi] = DYING.alpha;
  const peak = hi + DYING.failBoost * fails;
  const beat = Math.sin(((T / period) % 1) * Math.PI) ** 2;            // a soft swell and fade
  fx.skull.alpha = lo + (peak - lo) * beat;
  fx.skull.scale.set(0.97 + 0.03 * beat);
  return { tint: DYING.artTint, alpha: 1 };
}

/* ---------- Bloodied: blood splatters ---------- */

const SPLATTER = {
  blood: 0x7E0B12,              // fresh blood
  edge: 0x40040A,               // darker where it pools at the edges
  sheen: 0xFFC2C2,              // the wet highlight
  splatters: [3, 5],            // how many per creature
  splashSeconds: 0.3,           // they splash in when the creature becomes Bloodied
  tint: [1, 0.95, 0.95]
};

/** An irregular blob around (0, 0), as a flat polygon. */
function blobPolygon(rand, radius, squash = 0.9) {
  const p1 = rand() * 6.28, p2 = rand() * 6.28, pts = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const wob = 1 + 0.18 * Math.sin(a * 3 + p1) + 0.11 * Math.sin(a * 5 + p2) + (rand() - 0.5) * 0.14;
    pts.push(Math.cos(a) * radius * wob, Math.sin(a) * radius * wob * squash);
  }
  return pts;
}

/** A drop stretched along an angle (a teardrop pointing back towards the splash). */
function dropPolygon(x, y, radius, angle, stretch) {
  const pts = [], c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    let u = Math.cos(a) * radius, v = Math.sin(a) * radius;
    if (u < 0) u *= stretch;                                            // the tail trails back
    pts.push(x + u * c - v * s, y + u * s + v * c);
  }
  return pts;
}

/** Seeded splatter layout in unit-radius art space (stays the same for the same creature). */
function makeSplatterLayout(seed) {
  const rand = seededRandom(seed);
  const [lo, hi] = SPLATTER.splatters;
  const count = lo + Math.floor(rand() * (hi - lo + 1));
  const splats = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 1.2, d = 0.2 + rand() * 0.45;
    const size = 0.1 + rand() * 0.1;
    const drops = Array.from({ length: 5 + Math.floor(rand() * 5) }, () => {
      const dir = rand() * Math.PI * 2, dist = size * (1.3 + rand() * 1.6);
      return { dir, dist, r: size * (0.08 + rand() * 0.18), stretch: 1 + rand() * 2.2 };
    });
    splats.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, size, blob: blobPolygon(rand, 1), drops, phase: rand() * 6.28 });
  }
  // A smear, as if a bloody hand swiped across
  const sa = rand() * Math.PI * 2, sd = 0.15 + rand() * 0.3;
  const smear = { x: Math.cos(sa) * sd, y: Math.sin(sa) * sd, dir: rand() * Math.PI * 2, length: 0.45 + rand() * 0.25, width: 0.07 + rand() * 0.03, bend: (rand() - 0.5) * 0.5 };
  return { splats, smear };
}

function createSplatterFx(token) {
  const container = newFxContainer();
  const blurs = { edge: newBlur(1.5, 2) };
  const seed = hashString(`${token.document?.id ?? token.id ?? ""}:bloodied`);
  const layout = makeSplatterLayout(seed);
  const smear = new PIXI.Graphics();
  container.addChild(smear);
  const splats = layout.splats.map(sp => {
    const group = new PIXI.Container();
    const edge = new PIXI.Graphics(); edge.filters = [blurs.edge];
    const blood = new PIXI.Graphics();
    const sheen = new PIXI.Graphics();
    group.addChild(edge, blood, sheen);
    container.addChild(group);
    return { ...sp, group, edge, blood, sheen };
  });
  return { container, blurs, layout, smear, splats, born: null, drawnKey: "" };
}

/** Draw the splatters for the current size of the art. */
function layoutSplatterFx(fx, art) {
  const { r } = art;
  for (const sp of fx.splats) {
    const size = sp.size * r;
    const blob = sp.blob.map(v => v * size);
    sp.edge.clear(); sp.blood.clear(); sp.sheen.clear();
    sp.edge.beginFill(SPLATTER.edge, 0.9).drawPolygon(blob.map(v => v * 1.12)).endFill();
    sp.blood.beginFill(SPLATTER.blood, 0.92).drawPolygon(blob).endFill();
    for (const d of sp.drops) {
      const x = Math.cos(d.dir) * d.dist * r, y = Math.sin(d.dir) * d.dist * r;
      if (Math.hypot(sp.x * r + x, sp.y * r + y) > r * 0.93) continue;          // keep it on the art
      const poly = dropPolygon(x, y, d.r * r, d.dir, d.stretch);
      sp.edge.beginFill(SPLATTER.edge, 0.8).drawPolygon(poly.map(v => v * 1.0)).endFill();
      sp.blood.beginFill(SPLATTER.blood, 0.9).drawPolygon(poly).endFill();
    }
    // the wet highlight: a thin crescent at the blob's upper left
    sp.sheen.beginFill(SPLATTER.sheen, 1).drawEllipse(-size * 0.32, -size * 0.34, size * 0.3, size * 0.12).endFill();
    sp.sheen.beginFill(SPLATTER.sheen, 1).drawCircle(size * 0.25, -size * 0.15, size * 0.06).endFill();
  }
  // the smear: a tapering, slightly curved stroke
  const sm = fx.layout.smear, g = fx.smear;
  g.clear();
  const steps = 16, left = [], right = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = sm.dir + sm.bend * (t - 0.5);
    const along = (t - 0.5) * sm.length;
    const cx = (sm.x + Math.cos(sm.dir) * along + Math.cos(sm.dir + Math.PI / 2) * sm.bend * 0.15 * Math.sin(t * Math.PI)) * r;
    const cy = (sm.y + Math.sin(sm.dir) * along + Math.sin(sm.dir + Math.PI / 2) * sm.bend * 0.15 * Math.sin(t * Math.PI)) * r;
    const w = sm.width * r * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.3)) ** 0.7) * (1 - 0.5 * t);
    const nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
    left.push(cx + nx * w, cy + ny * w); right.unshift(cx - nx * w, cy - ny * w);
  }
  const clampToArt = pts => { const out = []; for (let i = 0; i < pts.length; i += 2) { const d = Math.hypot(pts[i], pts[i + 1]), k = d > r * 0.93 ? (r * 0.93) / d : 1; out.push(pts[i] * k, pts[i + 1] * k); } return out; };
  g.beginFill(SPLATTER.blood, 0.6).drawPolygon(clampToArt([...left, ...right])).endFill();
}

/** Blood splatters on the art, splashing in when the creature becomes Bloodied, with a faint wet sheen. */
function updateSplatterFx(token, fx, { now, zoom }) {
  const art = artCircle(token);
  const { x, y, r } = art, T = now / 1000;
  if (fx.born === null) fx.born = now;
  const key = `${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) { layoutSplatterFx(fx, art); fx.drawnKey = key; }
  fx.blurs.edge.blur = Math.max(0.5, r * 0.012 * zoom);
  const k = clamp01((now - fx.born) / (SPLATTER.splashSeconds * 1000));
  const splash = 1 - (1 - k) ** 3;
  fx.smear.position.set(x, y);
  fx.smear.alpha = splash;
  fx.splats.forEach((sp, i) => {
    sp.group.position.set(x + sp.x * r, y + sp.y * r);
    sp.group.scale.set(0.55 + 0.45 * clamp01(splash * 1.15 - i * 0.04));
    sp.group.alpha = clamp01(splash * 1.5);
    sp.sheen.alpha = 0.16 + 0.16 * (0.5 + 0.5 * Math.sin(T * 0.8 + sp.phase));   // a slow glint
  });
  return { tint: SPLATTER.tint, alpha: 1 };
}

/* ---------- Prone: dust and chevrons ---------- */

const PRONE = {
  dust: 0xB8A88C,               // dust kicked up at the creature's base
  speck: 0x6E604C,
  chevron: 0xF4EEE2,            // pale chevrons…
  outline: 0x2A241C,            // …with a dark edge, so they read on any art
  puffs: 6, specks: 8, chevrons: 3,
  settleSeconds: 1.2,           // the puff of dust when the creature goes down settles into a low haze
  cycleSeconds: 2.4             // one run of the chevrons, top to bottom
};

/** A downward chevron about 100 units wide, centred on (0, 0). */
function drawChevron(g, width, color) {
  g.clear();
  const round = PIXI.LINE_CAP?.ROUND ?? "round", join = PIXI.LINE_JOIN?.ROUND ?? "round";
  g.lineStyle({ width, color, alpha: 1, cap: round, join });
  g.moveTo(-50, -18); g.lineTo(0, 18); g.lineTo(50, -18);
  return g;
}

function createProneFx(token) {
  const container = newFxContainer();
  const blurs = { dust: newBlur(6, 3) };
  const dust = new PIXI.Container(); dust.filters = [blurs.dust];
  const puffs = Array.from({ length: PRONE.puffs }, () => {
    const g = new PIXI.Graphics();
    g.beginFill(PRONE.dust, 1).drawCircle(0, 0, 1).endFill();
    dust.addChild(g);
    return g;
  });
  const specks = new PIXI.Graphics();
  const chevrons = Array.from({ length: PRONE.chevrons }, () => {
    const group = new PIXI.Container();
    group.addChild(drawChevron(new PIXI.Graphics(), 22, PRONE.outline), drawChevron(new PIXI.Graphics(), 11, PRONE.chevron));
    return group;
  });
  container.addChild(dust, specks, ...chevrons);
  const rand = seededRandom(hashString(`${token.document?.id ?? token.id ?? ""}:prone`));
  const puffData = puffs.map((g, i) => ({ g, spread: (i / (PRONE.puffs - 1)) - 0.5, size: 0.15 + rand() * 0.09, phase: rand() * 6.28 }));
  const speckData = Array.from({ length: PRONE.specks }, () => ({ x: rand() - 0.5, offset: rand(), size: 0.008 + rand() * 0.008 }));
  return { container, blurs, dust, puffData, specks, speckData, chevrons, born: null };
}

/** Dust settles at the creature's base and faint chevrons pulse downward over its lower half. */
function updateProneFx(token, fx, { now, zoom }) {
  const art = artCircle(token);
  const { x, y, r } = art, T = now / 1000;
  if (fx.born === null) fx.born = now;
  const k = clamp01((now - fx.born) / (PRONE.settleSeconds * 1000));
  const settle = 1 - (1 - k) ** 2;
  fx.blurs.dust.blur = Math.max(1, r * 0.1 * zoom);
  const base = y + r * 0.84;
  for (const p of fx.puffData) {
    const spread = r * 1.5 * (0.55 + 0.45 * settle);
    p.g.position.set(x + p.spread * spread + Math.sin(T * 0.5 + p.phase) * r * 0.03, base - r * 0.04 * Math.sin(T * 0.7 + p.phase) - r * 0.06 * (1 - settle));
    p.g.scale.set(r * p.size * (0.75 + 0.35 * settle), r * p.size * 0.6 * (0.75 + 0.35 * settle));
    p.g.alpha = 0.3 + 0.35 * (1 - settle) + 0.05 * Math.sin(T * 0.9 + p.phase);
  }
  fx.specks.clear();
  for (const sp of fx.speckData) {
    const t = ((T / 3.5) + sp.offset) % 1;                                  // drifting down, slowly
    const sx = x + sp.x * r * 1.3, sy = base - r * 0.25 + t * r * 0.3;
    fx.specks.beginFill(PRONE.speck, 0.5 * Math.sin(t * Math.PI)).drawCircle(sx, sy, Math.max(0.6, r * sp.size)).endFill();
  }
  const run = (T / PRONE.cycleSeconds) % 1;
  fx.chevrons.forEach((c, i) => {
    c.position.set(x, y + r * (0.3 + i * 0.17));
    c.scale.set((r * 0.26) / 50 * (1 - i * 0.12));
    const centre = (i + 0.5) / (PRONE.chevrons + 1);                        // each lights up in turn, top to bottom
    const d = Math.min(Math.abs(run - centre), 1 - Math.abs(run - centre));
    c.alpha = (0.22 + 0.5 * Math.max(0, 1 - d / 0.2)) * clamp01(settle * 2);
  });
  return { tint: [1, 1, 1], alpha: 1 };
}

/* ---------- Frightened: writhing shadow tendrils ---------- */

const FEAR = {
  shadow: 0x050308,           // near-black tendrils
  root: 0x08050C,             // faint shadow at the rim they grow from
  tint: [0.84, 0.87, 0.95],   // colour drains from the creature (cold, pale)
  tendrils: 13
};

function createFearFx(token) {
  const container = newFxContainer();
  const blurs = { root: newBlur(8, 4), tendrils: newBlur(1.5, 3) };
  const root = new PIXI.Graphics();
  root.filters = [blurs.root];
  const tendrils = new PIXI.Graphics();
  tendrils.filters = [blurs.tendrils];
  container.addChild(root, tendrils);
  const rand = seededRandom(hashString(`${token.document.id ?? token.id ?? ""}-fear`));
  const list = [];
  for (let i = 0; i < FEAR.tendrils; i++) {
    list.push({
      angle: (i / FEAR.tendrils) * Math.PI * 2 + (rand() - 0.5) * 0.35,
      phase: rand() * Math.PI * 2, phase2: rand() * Math.PI * 2,
      reach: 0.6 + rand() * 0.25,          // fraction of the radius at full stretch
      speed: 0.45 + rand() * 0.4, curl: (rand() < 0.5 ? -1 : 1) * (0.6 + rand() * 0.6),
      width: 0.85 + rand() * 0.35
    });
  }
  return { container, blurs, root, tendrils, list, w: 0, h: 0 };
}

function layoutFearFx(token, fx) {
  const w = token.w, h = token.h, r = Math.max(w, h) / 2;
  fx.w = w; fx.h = h;
  fx.root.clear();
  fx.root.lineStyle({ width: r * 0.22, color: FEAR.root, alpha: 1 });
  fx.root.drawEllipse(w / 2, h / 2, (w / 2) * 0.93, (h / 2) * 0.93);
}

/** Animate writhing tendrils reaching in from the rim; returns a cold, pale tint for the token art. */
function updateFearFx(token, fx, { now, zoom }) {
  if (fx.w !== token.w || fx.h !== token.h) layoutFearFx(token, fx);
  const w = fx.w, h = fx.h, r = Math.max(w, h) / 2, T = now / 1000;
  fx.blurs.root.blur = r * 0.15 * zoom;
  fx.blurs.tendrils.blur = Math.max(0.75, r * 0.018 * zoom);
  fx.root.alpha = 0.3;

  const g = fx.tendrils;
  g.clear();
  const segments = 22, baseWidth = r * 0.12;
  for (const t of fx.list) {
    const ox = Math.cos(t.angle), oy = Math.sin(t.angle);
    const bx = w / 2 + ox * (w / 2) * 0.99, by = h / 2 + oy * (h / 2) * 0.99;
    const ix = -ox, iy = -oy, lx = -iy, ly = ix;           // inward and sideways
    // Slowly stretch in and draw back
    const stretch = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(T * t.speed + t.phase));
    const len = r * t.reach * stretch;
    let px = bx, py = by, heading = 0;
    for (let k = 1; k <= segments; k++) {
      const s = k / segments;
      // Writhing: a wave travelling down the tendril plus a slower sway, growing toward the tip,
      // and a curl that bends the tip around
      const travel = Math.sin(s * 5.5 - T * 2.6 * t.speed + t.phase) * 0.55;
      const sway = Math.sin(T * 0.9 * t.speed + t.phase2) * 0.35;
      heading = (travel + sway) * s + t.curl * s * s * (0.6 + 0.4 * Math.sin(T * 0.7 + t.phase2));
      const step = len / segments;
      const dx = ix * Math.cos(heading) + lx * Math.sin(heading);
      const dy = iy * Math.cos(heading) + ly * Math.sin(heading);
      const x = px + dx * step, y = py + dy * step;
      const taper = Math.pow(1 - (k - 0.5) / segments, 1.15);
      g.lineStyle({ width: Math.max(0.6, baseWidth * t.width * taper), color: FEAR.shadow, alpha: 0.9 * (1 - s * 0.45),
        cap: PIXI.LINE_CAP?.ROUND ?? "round" });
      g.moveTo(px, py);
      g.lineTo(x, y);
      px = x; py = y;
    }
  }
  return { tint: FEAR.tint, alpha: 1 };
}

/* ---------- Concentration: turning rune rings ---------- */

const FOCUS = {
  color: 0xB7A6FF,            // soft arcane violet
  glow: 0x7F6BFF,
  mote: 0xCBBEFF,
  outerGlyphs: 28, innerGlyphs: 20,
  outerSeconds: 40, innerSeconds: 28,   // seconds per turn (opposite directions)
  breatheSeconds: 4,
  motes: 12
};

/** Draw a ring of small rune-like glyphs (procedural strokes) around (0, 0). */
function drawRuneRing(g, rand, radius, count, size, color) {
  const lw = Math.max(1, size * 0.22);
  g.lineStyle({ width: lw * 0.75, color, alpha: 0.75 });
  g.drawCircle(0, 0, radius - size * 0.75);
  g.drawCircle(0, 0, radius + size * 0.75);
  g.lineStyle({ width: lw, color, alpha: 1, cap: PIXI.LINE_CAP?.ROUND ?? "round", join: PIXI.LINE_JOIN?.ROUND ?? "round" });
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const cx = Math.cos(a) * radius, cy = Math.sin(a) * radius;
    const tx = -Math.sin(a), ty = Math.cos(a);               // along the ring
    const nx = Math.cos(a), ny = Math.sin(a);                // outward
    const P = (u, v) => [cx + tx * u * size + nx * v * size, cy + ty * u * size + ny * v * size];
    const line = (u1, v1, u2, v2) => { const [x1, y1] = P(u1, v1), [x2, y2] = P(u2, v2); g.moveTo(x1, y1); g.lineTo(x2, y2); };
    // Each glyph: a stem plus one or two random marks
    const kind = Math.floor(rand() * 5);
    line(0, -0.55, 0, 0.55);
    if (kind === 0) { line(0, 0.55, 0.4, 0.15); }
    else if (kind === 1) { line(-0.35, -0.1, 0.35, -0.1); line(-0.25, 0.3, 0.25, 0.3); }
    else if (kind === 2) { line(0, -0.1, 0.4, -0.45); line(0, -0.1, -0.4, -0.45); }
    else if (kind === 3) { line(0, 0.1, 0.38, 0.4); line(0.38, 0.4, 0.38, -0.2); }
    else { line(-0.4, 0.55, 0, 0.2); line(0, 0.2, 0.4, 0.55); }
    if (rand() < 0.35) { const [dx, dy] = P(rand() < 0.5 ? -0.45 : 0.45, 0); g.drawCircle(dx, dy, lw * 0.6); }
  }
}

function createFocusFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { glow: newBlur(4, 3, ADD), motes: newBlur(1, 2, ADD) };
  const glowRings = new PIXI.Container();                  // blurred copy for a soft halo
  glowRings.filters = [blurs.glow];
  const crispRings = new PIXI.Container();
  const motes = new PIXI.Container();
  motes.filters = [blurs.motes];
  container.addChild(glowRings, crispRings, motes);
  const outer = [new PIXI.Graphics(), new PIXI.Graphics()];
  const inner = [new PIXI.Graphics(), new PIXI.Graphics()];
  for (const g of [...outer, ...inner]) g.blendMode = ADD;
  glowRings.addChild(outer[0], inner[0]);
  crispRings.addChild(outer[1], inner[1]);
  const list = [];
  for (let i = 0; i < FOCUS.motes; i++) {
    const g = new PIXI.Graphics().beginFill(FOCUS.mote, 1).drawCircle(0, 0, 1).endFill();
    g.blendMode = ADD;
    motes.addChild(g);
    list.push({ g });
  }
  return { container, blurs, glowRings, crispRings, outer, inner, motes: list,
    seed: hashString(`${token.document.id ?? token.id ?? ""}-focus`), w: 0, h: 0 };
}

function layoutFocusFx(token, fx) {
  const w = token.w, h = token.h, r = Math.max(w, h) / 2;
  fx.w = w; fx.h = h;
  for (const [ring, radius, count, size, k] of [[fx.outer, 1.16, FOCUS.outerGlyphs, 0.065, 1], [fx.inner, 1.05, FOCUS.innerGlyphs, 0.048, 2]]) {
    ring.forEach((g, i) => {
      g.clear();
      drawRuneRing(g, seededRandom(fx.seed + k), r * radius, count, r * size, i === 0 ? FOCUS.glow : FOCUS.color);
      g.position.set(w / 2, h / 2);
      g.scale.set(1, h / w);                               // follow oval tokens
    });
  }
  for (const m of fx.motes) resetMote(m, fx, true);
}

function resetMote(m, fx, randomAge) {
  m.a = Math.random() * Math.PI * 2;
  m.d0 = 1.28 + Math.random() * 0.2;                       // start just outside the rings
  m.life = 2.2 + Math.random() * 1.8;
  m.age = randomAge ? Math.random() * m.life : 0;
  m.size = Math.max(fx.w, fx.h) * (0.006 + Math.random() * 0.006);
  m.spiral = (Math.random() - 0.5) * 0.8;
}

/** Turn the rune rings and draw motes inward; leaves the token art unchanged. */
function updateFocusFx(token, fx, { now, dt, zoom }) {
  if (fx.w !== token.w || fx.h !== token.h) layoutFocusFx(token, fx);
  const w = fx.w, h = fx.h, r = Math.max(w, h) / 2, T = now / 1000;
  fx.blurs.glow.blur = Math.max(1, r * 0.04 * zoom);
  fx.blurs.motes.blur = Math.max(0.5, r * 0.012 * zoom);
  const breathe = 0.5 + 0.5 * Math.sin((T / FOCUS.breatheSeconds) * Math.PI * 2);
  const outerRot = (T / FOCUS.outerSeconds) * Math.PI * 2, innerRot = -(T / FOCUS.innerSeconds) * Math.PI * 2;
  fx.outer.forEach(g => { g.rotation = outerRot; });
  fx.inner.forEach(g => { g.rotation = innerRot; });
  fx.glowRings.alpha = 0.7 + 0.3 * breathe;
  fx.crispRings.alpha = 0.75 + 0.25 * breathe;

  for (const m of fx.motes) {
    m.age += dt;
    if (m.age >= m.life) resetMote(m, fx, false);
    const t = m.age / m.life;
    const d = m.d0 + (1.0 - m.d0) * (t * t);               // accelerate inward to the rim
    const a = m.a + m.spiral * t;
    m.g.position.set(w / 2 + Math.cos(a) * (w / 2) * d, h / 2 + Math.sin(a) * (h / 2) * d);
    m.g.scale.set(m.size * (0.6 + 0.6 * t));
    m.g.alpha = clamp01(t < 0.2 ? t / 0.2 : (t > 0.85 ? (1 - t) / 0.15 : 1)) * 0.75;
  }
  return { tint: [1, 1, 1], alpha: 1 };
}

