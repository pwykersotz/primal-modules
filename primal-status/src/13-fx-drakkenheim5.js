/* ---------- Monsters of Drakkenheim, painted: Weakened, Staggered, Sickened, Jinxed, Immobilized ---------- */

/*
 * Each shows what the condition does, with painted pictures (PICTURE_ART in 13-fx-drakkenheim4.js):
 *   Weakened (half damage): a sword beside it goes limp and droops like a wilting flower, then perks up.
 *   Staggered (one weapon attack a turn): an axe swings once, then a padlock snaps shut on it and it
 *     can't swing again until the lock falls open.
 *   Sickened (Constitution saves at Disadvantage): sickly green fumes rise off it and flies buzz round it.
 *   Jinxed (a die off its attacks and saves): a little storm cloud rains on it (painted drops that
 *     splash on its head) and drops a d20 that lands on a 1.
 *   Immobilized (Speed 0): an iron cuff at its feet is chained to a heavy iron ball; every few
 *     seconds it tries to step away, the chain snaps taut and the ball scrapes along and stops it.
 * Nothing shows until a picture has loaded (they load in a moment).
 */
const PAINTED = {
  weakened: { cycleSeconds: 3.6 },
  staggered: { cycleSeconds: 3.4, swoosh: 0xFFFFFF, clang: 0xFFF2B0 },
  sickened: { fumes: 3, riseSeconds: 3.2, flies: 2, tint: [0.94, 1, 0.82] },
  jinxed: { cycleSeconds: 3.6, drops: 7, rainSeconds: 0.6, wind: 0.18, tint: [0.95, 0.92, 0.97] },
  immobilized: { cycleSeconds: 3.2, links: 8, dust: 0xB8AE9C }
};
const NO_TINT = { tint: [1, 1, 1], alpha: 1 };

/** The Weakened status itself (Contamination 4+ adds it; the level alone shows only Contamination's swirl). */
const isWeakenedStatus = actor => hasStatusMatching(actor, /(^|[^a-z])weakened$/i);

/** A container for painted pictures, drawn in the order of their zIndex, with a Graphics (g) under them for drawn touches. */
function newPaintedFx(token, kind) {
  const container = newFxContainer();
  container.sortableChildren = true;
  const g = new PIXI.Graphics();
  g.zIndex = 0;
  container.addChild(g);
  const rand = seededRandom(hashString(`${token.id ?? ""}:${kind}`));
  return { container, g, phase: rand() * 10, rand };
}

/** The sprites of these pictures (as {key: sprite}), or null until all of them have loaded (all are asked for at once). */
function paintedSprites(fx, names) {
  const out = Object.fromEntries(Object.entries(names).map(([key, name]) => [key, pictureSprite(fx, name, key)]));
  return Object.values(out).every(Boolean) ? out : null;
}

/* ---------- Weakened: the wilting sword ---------- */

function createWeakenedFx(token) { return newPaintedFx(token, "weakened"); }

function updateWeakenedFx(token, fx, { now }) {
  const art = artCircle(token), r = art.r, T = now / 1000 + fx.phase;
  fx.g.clear();
  const s = paintedSprites(fx, { blade: "swordBlade", wilted: "swordWilted", hilt: "swordHilt" });
  if (!s) return NO_TINT;
  const p = (T / PAINTED.weakened.cycleSeconds) % 1;
  // stands up straight; strains, trembling; wilts (the blades cross-fade as it sags); hangs limp; perks up with a hop
  let limp = 0, dy = 0, tilt = 0;
  if (p < 0.3) dy = -r * 0.015 * Math.sin((p / 0.3) * Math.PI);
  else if (p < 0.4) tilt = 0.05 * ((p - 0.3) / 0.1) * Math.sin(T * 60);
  else if (p < 0.5) { limp = easeOut((p - 0.4) / 0.1); dy = r * 0.04 * limp; tilt = 0.08 * limp; }
  else if (p < 0.82) { limp = 1; dy = r * 0.04; tilt = 0.08 + 0.03 * Math.sin(((p - 0.5) / 0.32) * Math.PI * 3); }
  else if (p < 0.9) { const e = easeOut((p - 0.82) / 0.08); limp = 1 - e; dy = r * 0.04 * (1 - e) - r * 0.05 * Math.sin(e * Math.PI); tilt = 0.08 * (1 - e); }
  // its crossguard, at the creature's left side
  const x = art.x - r * 0.95, y = art.y + r * 0.2 + dy;
  placeSprite(s.blade, "swordBlade", x, y, tilt, r, 1 - limp);
  placeSprite(s.wilted, "swordWilted", x, y, tilt, r, limp);
  placeSprite(s.hilt, "swordHilt", x, y, tilt, r);
  s.blade.zIndex = 1; s.wilted.zIndex = 2; s.hilt.zIndex = 3;
  return NO_TINT;
}

/* ---------- Staggered: one swing, then padlocked ---------- */

function createStaggeredFx(token) { return newPaintedFx(token, "staggered"); }

/** The axe's angle (0 upright, + chopping to the right) through the cycle, and the padlock's state. */
function axePose(p, T) {
  if (p < 0.18) return { a: -0.65 * easeOut(p / 0.18) };                              // winds up
  if (p < 0.26) { const k = (p - 0.18) / 0.08; return { a: -0.65 + 1.7 * k * k, swing: k }; }   // chops
  if (p < 0.4) return { a: 1.05 * (1 - easeOut((p - 0.26) / 0.14)), swing: 1 + (p - 0.26) / 0.14 };   // back up
  if (p < 0.5) { const k = (p - 0.4) / 0.1; return { a: 0, lock: "falling", fall: k * k }; }          // a padlock drops onto it
  if (p < 0.82) {                                                                       // locked: it tries to swing, and can't
    const k = (p - 0.5) / 0.32;
    return { a: -0.12 * Math.abs(Math.sin(k * Math.PI * 3)) + 0.025 * Math.sin(T * 70) * Math.sin(k * Math.PI), lock: "shut", clang: k };
  }
  if (p < 0.92) return { a: 0, lock: "dropping", drop: (p - 0.82) / 0.1 };              // the lock falls open
  return { a: 0 };
}

function updateStaggeredFx(token, fx, { now }) {
  const S = PAINTED.staggered, art = artCircle(token), r = art.r, T = now / 1000 + fx.phase;
  const g = fx.g;
  g.clear();
  const s = paintedSprites(fx, { axe: "axe", open: "lockOpen", shut: "lockShut" });
  if (!s) return NO_TINT;
  const p = (T / S.cycleSeconds) % 1, pose = axePose(p, T);
  // the axe turns about its grip, at the creature's right side
  const px = art.x + r * 0.74, py = art.y + r * 0.36;
  placeSprite(s.axe, "axe", px, py, pose.a, r);
  s.axe.zIndex = 1;
  // the swoosh behind its head as it chops
  if (pose.swing !== undefined && pose.swing < 1.6) {
    const reach = r * 0.6, from = -0.65 - Math.PI / 2, to = pose.a - Math.PI / 2;
    const fade = pose.swing <= 1 ? 1 : 1 - (pose.swing - 1) / 0.6;
    g.lineStyle(0);
    for (let k = 0; k < 3; k++) {
      g.lineStyle({ width: r * (0.06 - k * 0.015), color: S.swoosh, alpha: (0.35 - k * 0.08) * fade, cap: PIXI.LINE_CAP?.ROUND ?? "round" });
      const rr = reach - k * r * 0.07;
      g.moveTo(px + Math.cos(from) * rr, py + Math.sin(from) * rr);
      g.arc(px, py, rr, from, Math.max(from, to));
    }
  }
  // the padlock hangs on the haft, a fifth of r above the grip
  const hx = px + r * 0.2 * Math.sin(pose.a), hy = py - r * 0.2 * Math.cos(pose.a);
  const swing = -pose.a * 1.4 + (pose.lock === "shut" ? 0.06 * Math.sin(T * 9) : 0);
  if (pose.lock === "falling") {
    placeSprite(s.open, "lockOpen", hx, hy - r * 0.55 * (1 - pose.fall), 0.3 * (1 - pose.fall), r, clamp01(pose.fall * 3));
    s.shut.visible = false;
  } else if (pose.lock === "shut") {
    placeSprite(s.shut, "lockShut", hx, hy, swing, r);
    s.open.visible = false;
    // clank!
    if (pose.clang < 0.2) {
      const k = pose.clang / 0.2;
      g.lineStyle({ width: Math.max(1, r * 0.025), color: S.clang, alpha: 1 - k, cap: PIXI.LINE_CAP?.ROUND ?? "round" });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3, r0 = r * (0.1 + 0.08 * k), r1 = r * (0.17 + 0.1 * k);
        g.moveTo(hx + Math.cos(a) * r0, hy + r * 0.05 + Math.sin(a) * r0); g.lineTo(hx + Math.cos(a) * r1, hy + r * 0.05 + Math.sin(a) * r1);
      }
    }
  } else if (pose.lock === "dropping") {
    const k = pose.drop;
    placeSprite(s.open, "lockOpen", hx + r * 0.05 * k, hy + r * 0.5 * k * k, 0.5 * k, r, 1 - k);
    s.shut.visible = false;
  } else { s.open.visible = false; s.shut.visible = false; }
  s.open.zIndex = s.shut.zIndex = 2;
  return NO_TINT;
}

/* ---------- Sickened: green fumes and flies ---------- */

function createSickenedFx(token) {
  const fx = newPaintedFx(token, "sickened");
  fx.flies = Array.from({ length: PAINTED.sickened.flies }, () => ({ dir: fx.rand() < 0.5 ? -1 : 1, seed: fx.rand() * 20 }));
  return fx;
}

/** Where a fly is at time T: looping round the creature, darting about. */
function flyPoint(art, fly, T) {
  const r = art.r, t = T + fly.seed, a = fly.dir * t * 1.6;
  return [art.x + r * (0.72 * Math.cos(a) + 0.16 * Math.sin(t * 5.3) + 0.06 * Math.sin(t * 13.1)),
    art.y - r * 0.15 + r * (0.5 * Math.sin(a) + 0.16 * Math.cos(t * 4.1) + 0.06 * Math.cos(t * 11.7))];
}

function updateSickenedFx(token, fx, { now }) {
  const S = PAINTED.sickened, art = artCircle(token), r = art.r, T = now / 1000 + fx.phase;
  fx.g.clear();
  const queasy = 0.5 + 0.5 * Math.sin(T * 1.3);
  const tint = { tint: S.tint.map(c => 1 - (1 - c) * (0.7 + 0.3 * queasy)), alpha: 1 };
  const names = {};
  for (let i = 0; i < S.fumes; i++) names[`fumes${i}`] = "fumes";
  fx.flies.forEach((_, i) => { names[`fly${i}`] = "fly"; });
  const s = paintedSprites(fx, names);
  if (!s) return tint;
  // puffs of fumes rise off its head, growing and fading, one after another
  for (let i = 0; i < S.fumes; i++) {
    const life = (T / S.riseSeconds + i / S.fumes) % 1;
    const x = art.x + r * (0.3 * (i - 1) + 0.08 * Math.sin(T * 1.1 + i * 2));
    const y = art.y - r * (0.45 + 0.6 * life);
    const sprite = s[`fumes${i}`];
    placeSprite(sprite, "fumes", x, y, 0.4 * Math.sin(life * 2 + i), r * (0.6 + 0.5 * life), 0.85 * Math.sin(Math.PI * life));
    sprite.zIndex = 1 + life * 0.1;
  }
  // flies buzz round it, facing the way they're going, wings a blur
  fx.flies.forEach((fly, i) => {
    const [x, y] = flyPoint(art, fly, T), [nx, ny] = flyPoint(art, fly, T + 0.03);
    const sprite = s[`fly${i}`];
    placeSprite(sprite, "fly", x, y, Math.atan2(ny - y, nx - x) + Math.PI / 2, r);
    sprite.scale.x *= 1 + 0.08 * Math.sin(T * 95 + i);
    sprite.zIndex = 2;
  });
  return tint;
}

/* ---------- Jinxed: a rain cloud and a die that rolls a 1 ---------- */

function createJinxedFx(token) {
  const fx = newPaintedFx(token, "jinxed");
  // where each raindrop falls from (across the cloud) and lands (on its head), and when
  fx.drops = Array.from({ length: PAINTED.jinxed.drops }, (_, i) => ({ across: (i + 0.5) / PAINTED.jinxed.drops - 0.5 + (fx.rand() - 0.5) * 0.08,
    land: fx.rand(), phase: fx.rand(), speed: 0.85 + fx.rand() * 0.3 }));
  return fx;
}

function updateJinxedFx(token, fx, { now }) {
  const J = PAINTED.jinxed, art = artCircle(token), r = art.r, T = now / 1000 + fx.phase;
  fx.g.clear();
  const names = { cloud: "cloud", die: "d20" };
  fx.drops.forEach((_, i) => { names[`drop${i}`] = "raindrop"; names[`splash${i}`] = "splash"; });
  const s = paintedSprites(fx, names);
  if (!s) return { tint: J.tint, alpha: 1 };
  // the cloud hangs over its head, bobbing; rain falls from it onto the creature
  const cx = art.x + r * 0.05 + r * 0.03 * Math.sin(T * 0.9), cy = art.y - r * 1.0 + r * 0.02 * Math.sin(T * 1.7);
  placeSprite(s.cloud, "cloud", cx, cy, 0.03 * Math.sin(T * 0.7), r);
  s.cloud.zIndex = 2;
  // raindrops fall from under it, slanting a little in the wind, and burst into a splash on its head
  const top = cy + r * 0.08;
  fx.drops.forEach((d, i) => {
    const drop = s[`drop${i}`], splash = s[`splash${i}`];
    drop.zIndex = splash.zIndex = 1;
    const p = (T * d.speed / J.rainSeconds + d.phase) % 1;
    const x0 = cx + r * 0.5 * d.across, land = art.y - r * (0.12 + 0.18 * d.land), drift = (land - top) * Math.tan(J.wind);
    if (p < 0.7) {
      const k = p / 0.7;
      placeSprite(drop, "raindrop", x0 - drift * k, top + (land - top) * k, J.wind, r, clamp01(k * 6));
      drop.scale.y *= 1.35;                                              // stretched as it falls fast
      splash.visible = false;
    } else {
      const k = (p - 0.7) / 0.3;
      drop.visible = false;
      placeSprite(splash, "splash", x0 - drift, land, 0, r * (0.5 + 0.5 * easeOut(Math.min(1, k * 2))), 1 - k * k);
      splash.scale.y *= 0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, k * 1.4));
    }
  });
  // now and then a d20 drops out of the cloud, tumbles, bounces and lands showing a 1
  const p = (T / J.cycleSeconds) % 1, landX = art.x + r * 0.5, landY = art.y - r * 0.4;
  s.die.zIndex = 3;
  if (p < 0.08 || p > 0.85) { s.die.visible = false; return { tint: J.tint, alpha: 1 }; }
  let x = landX, y = landY, a = 0, size = 1, alpha = 1;
  if (p < 0.3) {
    const k = (p - 0.08) / 0.22;
    x = cx + (landX - cx) * k; y = top + (landY - top) * k * k; a = (1 - k) * Math.PI * 4; size = 0.6 + 0.4 * k; alpha = clamp01(k * 5);
  } else if (p < 0.42) {
    const k = (p - 0.3) / 0.12, hop = Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k);
    y = landY - r * 0.12 * hop; a = 0.4 * hop * (k < 0.5 ? 1 : -1);
  } else alpha = 1 - clamp01((p - 0.75) / 0.1);
  placeSprite(s.die, "d20", x, y, a, r * size, alpha);
  return { tint: J.tint, alpha: 1 };
}

/* ---------- Immobilized: a ball and chain ---------- */

function createImmobilizedFx(token) { return newPaintedFx(token, "immobilized"); }

function updateImmobilizedFx(token, fx, { now }) {
  const I = PAINTED.immobilized, art = artCircle(token), r = art.r, T = now / 1000 + fx.phase;
  const g = fx.g;
  g.clear();
  const names = { cuff: "cuff", ball: "ball" };
  for (let i = 0; i < I.links; i++) names[`link${i}`] = "chainLink";
  const s = paintedSprites(fx, names);
  if (!s) return NO_TINT;
  // it tries to step away: the cuff jerks, the chain snaps taut, the ball scrapes along a little and stops it
  const p = (T / I.cycleSeconds) % 1;
  const pull = p < 0.6 ? 0 : p < 0.66 ? easeOut((p - 0.6) / 0.06) : p < 0.8 ? 1 : 1 - easeOut((p - 0.8) / 0.12);
  const scrape = p < 0.63 ? 0 : p < 0.72 ? Math.sin(((p - 0.63) / 0.09) * Math.PI) : 0;
  const cuffX = art.x - r * 0.08 + r * 0.06 * pull, cuffY = art.y + r * 0.8;
  const ballX = art.x - r * 0.92 + r * 0.03 * scrape, ballY = art.y + r * 0.9;
  placeSprite(s.cuff, "cuff", cuffX, cuffY, 0.05 * pull, r);
  placeSprite(s.ball, "ball", ballX, ballY, -0.08 * scrape, r);
  s.cuff.zIndex = 3; s.ball.zIndex = 2;
  // the chain runs from the ring on the cuff's side to the ball's ring, sagging until it's pulled taut
  const cw = PICTURE_ART.cuff.length * r, bw = PICTURE_ART.ball.length * r;
  const ax = cuffX - cw * 0.44, ay = cuffY + cw * 0.22;               // the cuff's ring (its anchor is the middle)
  const bx = ballX + bw * 0.14, by = ballY - bw * 0.3;                  // the ball's ring
  const sag = r * 0.12 * (1 - pull);
  for (let i = 0; i < I.links; i++) {
    const t = (i + 0.5) / I.links;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t + 4 * sag * t * (1 - t);
    const slope = Math.atan2((by - ay) + 4 * sag * (1 - 2 * t), bx - ax);
    const link = s[`link${i}`];
    placeSprite(link, "chainLink", x, y, slope, r);
    // every other link is seen edge-on
    if (i % 2) link.scale.y *= 0.32;
    link.zIndex = 1;
  }
  // a puff of dust as the ball scrapes
  if (scrape > 0) {
    g.lineStyle(0);
    for (let k = 0; k < 3; k++) g.beginFill(I.dust, 0.35 * scrape).drawCircle(ballX - r * (0.12 + 0.06 * k), ballY + r * 0.13, r * (0.04 + 0.015 * k)).endFill();
  }
  return NO_TINT;
}
