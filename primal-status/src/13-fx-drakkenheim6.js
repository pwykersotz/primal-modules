/* ---------- Painted: Entangled, Addled, Bewildered, Bleeding ---------- */

/*
 * More animations with painted pictures (PICTURE_ART in 13-fx-drakkenheim4.js):
 *   Entangled (Immobilized and Defenseless): thorny vines burst out of a mound of torn-up earth, climb
 *     its sides and bind it across the body, squeezing now and then. One painted vine is cut into
 *     strips and bent along each vine's path, so the vines can grow in, sway and snap. When the status
 *     ends they snap, whip back and wither, and their leaves dry up and fall.
 *   Addled (Intelligence, Wisdom and Charisma rolls at Disadvantage): a thought bubble over its head
 *     with a tangled violet knot inside that keeps twisting; question marks pop out of it.
 *   Bewildered (no spells but cantrips): a wand at its side lifts and its crystal starts to glow, but
 *     the spell sputters out in a puff of grey smoke and a few dying sparks.
 *   Bleeding: a streak of blood along its lower edge (bent the same way) with drips hanging from it;
 *     drops swell at their ends, fall and splat on the ground below.
 *   Shocked (Dazed and Defenseless): bolts of lightning crackle round its edge (bent the same way),
 *     flashing in a new place several times a second, with sparks where they end; now and then a
 *     puff of smoke rises where it's been singed.
 * Nothing shows until a picture has loaded (they load in a moment).
 */
const PAINTED2 = {
  vines: { strips: 36, thick: 1.15, wither: 0x9A7A55 },
  addled: { cycleSeconds: 2.8, tint: [0.96, 0.93, 1] },
  bewildered: { cycleSeconds: 3.4, glow: 0x9BE4FF, core: 0xE6FAFF, ash: 0x8A929A, sparks: 6, tint: [0.96, 0.99, 1] },
  bleeding: { strips: 40, from: 0.8, to: 0.2, radius: 0.97, squash: 0.75, periods: [2.3, 2.7, 3.1], tint: [1, 0.93, 0.93] },
  shocked: { bolts: ["bolt1", "bolt2", "bolt3"], strips: 20, flickerMs: 350, glow: 0xFFB000, height: 0.21, smokeSeconds: 2.6 }
};

/* ---------- bending a picture along a curve ---------- */

const stripCuts = new Map();   // picture name + strip count → its strips

/**
 * A painted picture cut (once) into `count` upright strips, each with how far along the picture its
 * middle is (u, 0 at the left end, 1 at the right). Null until the picture has loaded, or if it can't be cut.
 */
function stripCut(name, count) {
  const key = `${name}:${count}`;
  if (stripCuts.has(key)) return stripCuts.get(key);
  const tex = pictureTexture(name);
  if (!tex || typeof PIXI.Texture !== "function" || typeof PIXI.Rectangle !== "function" || typeof PIXI.Sprite !== "function") return null;
  let cut = null;
  try {
    const W = tex.width, H = tex.height, fx0 = tex.frame?.x ?? 0, fy0 = tex.frame?.y ?? 0;
    const strips = Array.from({ length: count }, (_, k) => {
      const x0 = Math.round((k * W) / count), x1 = Math.round(((k + 1) * W) / count);
      // a pixel wider than its share, so no seam shows between neighbours
      const texture = new PIXI.Texture(tex.baseTexture, new PIXI.Rectangle(fx0 + x0, fy0, Math.min(W, x1 + 1) - x0, H));
      return { texture, u: (x0 + x1) / 2 / W };
    });
    cut = { strips, width: W, height: H };
  } catch (err) {
    console.warn(`${MODULE_ID} | Couldn't cut ${PICTURE_ART[name].file} into strips`, err);
  }
  stripCuts.set(key, cut);
  return cut;
}

/** Sprites for a cut picture's strips, made once (null until the picture can be cut). */
function stripSprites(fx, key, name, count) {
  const have = fx.strips?.[key];
  if (have) return have;
  const cut = stripCut(name, count);
  if (!cut) return null;
  const anchorY = PICTURE_ART[name].anchor[1];
  const sprites = cut.strips.map(strip => {
    const sprite = new PIXI.Sprite(strip.texture);
    sprite.anchor?.set?.(0.5, anchorY);
    sprite.visible = false;
    fx.container.addChild(sprite);
    return sprite;
  });
  (fx.strips ??= {})[key] = { cut, sprites };
  return fx.strips[key];
}

/** A path through some points (in pixels), with the distance along it at each point. */
function measurePath(pts) {
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len, total: len[len.length - 1] };
}

/** The point at distance s along a path, and the way the path runs there (an angle). */
function pathPoint(path, s) {
  const { pts, len } = path;
  let i = 1;
  while (i < len.length - 1 && len[i] < s) i++;
  const a = pts[i - 1], b = pts[i], seg = len[i] - len[i - 1] || 1, t = Math.min(1, Math.max(0, (s - len[i - 1]) / seg));
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

/**
 * Lay a cut picture's strips along a path: its right-hand end (u = 1) at distance `end` along the
 * path, `scale` pixels on the map for each pixel of the picture (times `stretch` along the path and
 * `squash` across it). A strip shows only where `show(s)` says so, thinning towards the start over the
 * first `taper` pixels. (Strips overlap by a pixel so no seam shows, so they're never see-through: a
 * see-through strip would show its overlaps as lines.)
 */
function layStrips({ cut, sprites }, path, { end, scale, stretch = 1, squash = 1, show = () => true, taper = 0, tint = 0xFFFFFF, z = 0 }) {
  const length = cut.width * scale * stretch;
  cut.strips.forEach((strip, k) => {
    const sprite = sprites[k], s = end - (1 - strip.u) * length;
    if (s < 0 || s > path.total + 1 || !show(s)) { sprite.visible = false; return; }
    const p = pathPoint(path, s);
    sprite.visible = true;
    sprite.position.set(p.x, p.y);
    sprite.rotation = p.angle;
    sprite.scale.set(scale * stretch, scale * squash * (taper > 0 ? 0.3 + 0.7 * clamp01(s / taper) : 1));
    sprite.alpha = 1;
    sprite.tint = tint;
    sprite.zIndex = z;
  });
}

/** Hide a set of strips. */
function hideStrips(set) { for (const sprite of set?.sprites ?? []) sprite.visible = false; }

/* ---------- Entangled: thorny vines ---------- */

function createEntangledFx(token) {
  const fx = newPaintedFx(token, "vines");
  fx.plan = vinePlan(fx.rand);
  for (const v of fx.plan) v.leafData = v.leaves.map((t, i) => ({ t, side: i % 2 ? 1 : -1, phase: fx.rand() * TAU, fall: 0.6 + fx.rand() * 0.6, spin: (fx.rand() - 0.5) * 5, size: 0.85 + fx.rand() * 0.3 }));
  fx.born = null;
  return fx;
}

function updateEntangledFx(token, fx, { now, ending }) {
  const V = PAINTED2.vines, art = artCircle(token), r = art.r, T = now / 1000;
  if (fx.born === null) fx.born = now;
  const grown = clamp01((now - fx.born) / (VINES.growSeconds * 1000));
  const end = clamp01(ending ?? 0);                    // 0 → 1 while they snap and wither
  const dry = clamp01(end * 2.2), fade = 1 - clamp01((end - 0.55) / 0.45), shrivel = 1 - 0.4 * clamp01((end - 0.3) / 0.7);
  const tint = { tint: mixTint(VINES.tint, easeOutCubic(grown) * (1 - end)), alpha: 1 };
  fx.g.clear();
  const names = { earth: "earth" };
  fx.plan.forEach((v, i) => v.leafData.forEach((_, j) => { names[`leaf${i}.${j}`] = "leaf"; names[`dry${i}.${j}`] = "leafDry"; }));
  const s = paintedSprites(fx, names);
  const sets = fx.plan.map((_, i) => stripSprites(fx, `vine${i}`, "vine", V.strips));
  if (!s || sets.some(set => !set)) return tint;

  // the torn-up earth they burst out of, at its feet
  const burst = clamp01(grown * 2.5);
  placeSprite(s.earth, "earth", art.x, art.y + r * 1.02, 0, r * (burst > 0 ? easeOutBack(burst) : 0), (1 - end) * clamp01(burst * 4));
  s.earth.zIndex = 5;

  const squeeze = Math.max(0, Math.sin(TAU * T / VINES.squeezeSeconds)) ** 6;   // a sudden tightening now and then
  const witherTint = lerpColor(0xFFFFFF, V.wither, dry);
  fx.plan.forEach((v, i) => {
    const set = sets[i];
    const grow = easeOutCubic(clamp01((grown - v.delay) / Math.max(0.2, 1 - v.delay)));
    // where the vine is now: swaying near its tip, and the binding vines pulled tight
    const n = v.pts.length;
    const path = measurePath(v.pts.map(([x, y], k) => {
      const t = k / (n - 1);
      if (v.bind) { const q = 1 - 0.035 * squeeze * Math.sin(Math.PI * t); return [art.x + x * r * q, art.y + y * r * (q - 0.015 * squeeze)]; }
      const a = Math.atan2(y, x) + Math.sin(T * 1.2 + v.sway + t * 2) * 0.03 * t * t, rad = Math.hypot(x, y);
      return [art.x + Math.cos(a) * rad * r, art.y + Math.sin(a) * rad * r];
    }));
    // the painted vine, as thick as the drawn one was; stretched a little if the path is longer than the picture
    const scale = (v.width * V.thick * r) / (set.cut.height * PICTURE_ART.vine.stem);
    const stretch = Math.max(1, path.total / (set.cut.width * scale));
    const length = set.cut.width * scale * stretch;
    // (the binding vines thin out at their start, as if they wrapped round behind it)
    const look = { scale, stretch, squash: (v.bind ? 1 + 0.06 * squeeze : 1) * shrivel, tint: witherTint, z: v.bind ? 3 : 1, taper: v.bind ? path.total * 0.14 : 0 };
    // growing (or, as they snap, the climbers sinking back): the vine slides out along its path, tip first;
    // the binding vines break in the middle and whip back to their ends
    let shown;
    if (end > 0 && v.bind) {
      const back = 1 - easeOutCubic(end), mid = path.total / 2;
      shown = path.total;
      layStrips(set, path, { ...look, end: shown, show: d => d <= mid * back || d >= path.total - mid * back });
    } else {
      shown = path.total * (end > 0 ? 1 - easeOutCubic(end) : grow);
      if (shown <= path.total * 0.01) hideStrips(set);
      else layStrips(set, path, { ...look, end: shown, show: d => d <= shown });
    }
    // leaves ride out with the vine and unfurl; when it snaps they dry up and fall
    v.leafData.forEach((leaf, j) => {
      const fresh = s[`leaf${i}.${j}`], old = s[`dry${i}.${j}`];
      fresh.zIndex = old.zIndex = 4;
      const d = end > 0 ? leaf.t * path.total : shown - (1 - leaf.t) * path.total;   // where on the path it is now
      const open = end > 0 ? 1 : clamp01(d / (path.total * 0.12));
      if (d < 0 || open <= 0.01 || fade <= 0.02) { fresh.visible = old.visible = false; return; }
      const p = pathPoint(path, d), fall = end;
      const nx = -Math.sin(p.angle) * leaf.side, ny = Math.cos(p.angle) * leaf.side, half = v.width * r * 0.5;
      const x = p.x + nx * half * 0.6 + fall * r * 0.2 * nx;
      const y = p.y + ny * half * 0.6 + fall * fall * r * 1.2 * leaf.fall;
      // pointing out from the stem and a little forward, swaying
      const angle = Math.atan2(ny, nx) - leaf.side * 0.55 + Math.sin(T * 2 + leaf.phase) * 0.12 + leaf.spin * fall;
      const size = r * leaf.size * (v.width / 0.12) ** 0.5 * easeOutBack(open);
      const alpha = (1 - fall) ** 1.2;
      placeSprite(fresh, "leaf", x, y, angle, size, alpha * (1 - dry));
      placeSprite(old, "leafDry", x, y, angle, size, alpha * dry);
    });
  });
  return tint;
}

/* ---------- Addled: a tangled thought ---------- */

function createAddledFx(token) { return newPaintedFx(token, "addled"); }

function updateAddledFx(token, fx, { now }) {
  const A = PAINTED2.addled, art = artCircle(token), r = art.r, T = now / 1000 + fx.phase;
  fx.g.clear();
  const s = paintedSprites(fx, { bubble: "bubble", tangle: "tangle", q0: "question", q1: "question" });
  if (!s) return { tint: A.tint, alpha: 1 };
  // the bubble floats over its head, its little bubbles trailing down to it
  const bx = art.x + r * 0.42 + r * 0.02 * Math.sin(T * 0.8), by = art.y - r * 0.98 + r * 0.03 * Math.sin(T * 1.3);
  placeSprite(s.bubble, "bubble", bx, by, 0.03 * Math.sin(T * 0.6), r);
  s.bubble.zIndex = 1;
  // inside, the knot keeps twisting: a slow turn with sudden jerks, squeezing one way and the other
  const jerk = Math.sin(T * 0.9) + 0.6 * Math.sin(T * 2.3 + 1);
  placeSprite(s.tangle, "tangle", bx, by + r * 0.01, T * 0.5 + 0.5 * jerk, r);
  const knot = 0.08 * Math.sin(T * 2.6);
  s.tangle.scale.x *= 1 + knot; s.tangle.scale.y *= 1 - knot;
  s.tangle.zIndex = 2;
  // question marks pop out of the top of the bubble in turn, one each side, float up and fade
  [s.q0, s.q1].forEach((q, i) => {
    const p = (T / A.cycleSeconds + i * 0.5) % 1, side = i ? -1 : 1;
    q.zIndex = 3;
    if (p > 0.5) { q.visible = false; return; }
    const k = p / 0.5;
    const x = bx + side * r * (0.3 + 0.12 * k), y = by - r * (0.26 + 0.32 * k);
    const pop = easeOutBack(clamp01(k * 4));
    placeSprite(q, "question", x, y, side * 0.25 + 0.12 * Math.sin(T * 5 + i), r * Math.max(0, pop), k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35);
  });
  return { tint: A.tint, alpha: 1 };
}

/* ---------- Bewildered: a wand that fizzles ---------- */

function createBewilderedFx(token) {
  const fx = newPaintedFx(token, "bewildered");
  fx.glow = new PIXI.Graphics();
  fx.glow.blendMode = PIXI.BLEND_MODES.ADD;
  fx.glow.zIndex = 3;
  fx.container.addChild(fx.glow);
  fx.sparks = Array.from({ length: PAINTED2.bewildered.sparks }, () => ({ dx: (fx.rand() - 0.5) * 0.5, dy: -0.1 - fx.rand() * 0.3 }));
  return fx;
}

/** The wand's angle (0 upright, + leaning out to the right), how high it's lifted, and how bright its crystal is. */
function wandPose(p, T) {
  const rest = 0.45;
  if (p < 0.18) { const k = easeOut(p / 0.18); return { a: rest - 0.55 * k, lift: k, glow: 0 }; }                 // lifts
  if (p < 0.5) { const k = (p - 0.18) / 0.32; return { a: -0.1 + 0.02 * Math.sin(T * 40) * k, lift: 1, glow: k * k }; }   // the crystal gathers light
  if (p < 0.58) { const k = (p - 0.5) / 0.08; return { a: -0.1, lift: 1, glow: (Math.sin(T * 90) > 0 ? 1 : 0.3) * (1 - k) }; }   // sputters
  if (p < 0.8) { const k = easeOut((p - 0.58) / 0.22); return { a: -0.1 + (rest + 0.1) * k + 0.06 * Math.sin(k * Math.PI * 3) * (1 - k), lift: 1 - k, glow: 0 }; }   // droops
  return { a: rest, lift: 0, glow: 0 };
}

function updateBewilderedFx(token, fx, { now }) {
  const B = PAINTED2.bewildered, art = artCircle(token), r = art.r, T = now / 1000 + fx.phase;
  const g = fx.g, glow = fx.glow;
  g.clear(); glow.clear();
  const s = paintedSprites(fx, { wand: "wand", smoke: "smoke" });
  if (!s) return { tint: B.tint, alpha: 1 };
  const p = (T / B.cycleSeconds) % 1, pose = wandPose(p, T);
  // held at its right side
  const px = art.x + r * 0.82, py = art.y + r * 0.32 - r * 0.12 * pose.lift;
  placeSprite(s.wand, "wand", px, py, pose.a, r);
  s.wand.zIndex = 1;
  const reach = PICTURE_ART.wand.length * r * (PICTURE_ART.wand.anchor[1] - 0.05);
  const tx = px + Math.sin(pose.a) * reach, ty = py - Math.cos(pose.a) * reach;
  // the crystal's glow, and specks of light drawn into it
  if (pose.glow > 0.01) {
    for (const [k, alpha] of [[2.2, 0.12], [1.5, 0.22], [1, 0.4]]) glow.beginFill(B.glow, alpha * pose.glow).drawCircle(tx, ty, r * 0.07 * k * (0.6 + 0.4 * pose.glow)).endFill();
    glow.beginFill(B.core, 0.8 * pose.glow).drawCircle(tx, ty, r * 0.03).endFill();
    if (p < 0.5) for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + T * 3, d = r * 0.25 * (1 - ((T * 1.5 + i * 0.25) % 1));
      glow.beginFill(B.core, 0.7 * pose.glow).drawCircle(tx + Math.cos(a) * d, ty + Math.sin(a) * d, Math.max(0.6, r * 0.012)).endFill();
    }
  }
  // instead of a spell: a puff of grey smoke, and a few dying sparks dropping from the tip
  if (p > 0.52 && p < 0.95) {
    const k = (p - 0.52) / 0.43;
    placeSprite(s.smoke, "smoke", tx + r * 0.04 * k, ty - r * 0.06 - r * 0.22 * k, 0.3 * k, r * (0.45 + 0.6 * easeOut(Math.min(1, k * 2))), k < 0.5 ? 0.9 : 0.9 * (1 - (k - 0.5) / 0.5));
    s.smoke.zIndex = 2;
    const fall = clamp01((p - 0.52) / 0.3);
    if (fall < 1) for (const sp of fx.sparks) {
      const x = tx + sp.dx * r * fall, y = ty + (sp.dy * fall + 0.9 * fall * fall) * r * 0.5;
      g.beginFill(fall < 0.35 ? B.glow : B.ash, 1 - fall).drawCircle(x, y, Math.max(0.8, r * 0.018 * (1 - 0.5 * fall))).endFill();
    }
    g.zIndex = 3;
  } else s.smoke.visible = false;
  return { tint: B.tint, alpha: 1 };
}

/* ---------- Bleeding: painted drips ---------- */

/**
 * Where the drips hang from the streak (u: how far along it, 0 to 1) and, in their own pictures, where
 * the bead at the end of each is (as fractions of its width and height) and how wide (in streak pixels).
 * The drips' pictures start 0.86 of the way down the streak's (0.37 below the middle it's bent along).
 */
const BLOOD_ART = {
  hangBelow: 0.37,
  drips: [
    { name: "drip1", u: 0.192, bead: [0.497, 0.723], width: 42 },
    { name: "drip2", u: 0.414, bead: [0.502, 0.734], width: 33 },
    { name: "drip3", u: 0.643, bead: [0.511, 0.847], width: 46 }
  ]
};

function createBleedingFx(token) { return newPaintedFx(token, "bleeding"); }

function updateBleedingFx(token, fx, { now }) {
  const B = PAINTED2.bleeding, art = artCircle(token), r = art.r, T = now / 1000;
  fx.g.clear();
  const names = {};
  BLOOD_ART.drips.forEach((d, i) => { names[`drip${i}`] = d.name; names[`drop${i}`] = "drop"; names[`splat${i}`] = "splat"; });
  const s = paintedSprites(fx, names), band = stripSprites(fx, "streak", "streak", B.strips);
  if (!s || !band) return { tint: B.tint, alpha: 1 };
  // the streak, bent along its lower edge from left to right
  const pts = [];
  for (let k = 0; k <= 24; k++) {
    const a = Math.PI * (B.from + (B.to - B.from) * (k / 24));
    pts.push([art.x + Math.cos(a) * r * B.radius, art.y + Math.sin(a) * r * B.radius]);
  }
  const path = measurePath(pts), scale = path.total / band.cut.width;
  layStrips(band, path, { end: path.total, scale, squash: B.squash, z: 2 });
  BLOOD_ART.drips.forEach((d, i) => {
    const drip = s[`drip${i}`], drop = s[`drop${i}`], splat = s[`splat${i}`];
    drip.zIndex = 1; drop.zIndex = 3; splat.zIndex = 0;
    // it hangs straight down from the streak's lower edge
    const at = pathPoint(path, d.u * path.total), below = BLOOD_ART.hangBelow * band.cut.height * scale * B.squash;
    const hx = at.x - Math.sin(at.angle) * below, hy = at.y + Math.cos(at.angle) * below;
    // a drop swells at its end, lets go, falls and splats on the ground below
    const period = B.periods[i % B.periods.length], p = ((T + i * 0.83) / period) % 1;
    const swell = p < 0.6 ? p / 0.6 : 0, falling = p >= 0.6 && p < 0.8 ? (p - 0.6) / 0.2 : -1;
    const stretch = p < 0.6 ? 1 + 0.15 * swell : falling >= 0 ? 1.15 - 0.15 * easeOut(falling) : 1;
    drip.visible = true; drip.alpha = 1; drip.rotation = 0;
    drip.position.set(hx, hy);
    drip.scale.set(scale, scale * stretch);
    const w = drip.texture?.width || 50, h = drip.texture?.height || 100;
    const beadX = hx + (d.bead[0] - PICTURE_ART[d.name].anchor[0]) * w * scale, beadY = hy + d.bead[1] * h * scale * stretch;
    const bead = d.width * scale, ground = Math.max(beadY + r * 0.2, art.y + r * 1.06);
    if (p < 0.6) placeSprite(drop, "drop", beadX, beadY, 0, bead * (0.7 + 0.45 * swell), clamp01(swell * 3));
    else if (falling >= 0) {
      placeSprite(drop, "drop", beadX, beadY + (ground - beadY) * falling * falling, 0, bead * 1.15);
      drop.scale.y *= 1.2;
    } else drop.visible = false;
    // the splat it left, fading before the next one lands
    const age = (p - 0.8 + 1) % 1;
    const spread = age < 0.06 ? easeOutBack(age / 0.06) : 1;
    placeSprite(splat, "splat", beadX, ground, 0, bead * 3.2 * Math.max(0, spread), 1 - clamp01((age - 0.35) / 0.5));
    splat.scale.y *= 0.45;
  });
  return { tint: B.tint, alpha: 1 };
}

/* ---------- Shocked: painted lightning ---------- */

function createShockedFx(token) {
  const fx = newPaintedFx(token, "shocked");
  fx.blurs = { glow: newBlur(3, 2, PIXI.BLEND_MODES.ADD) };
  fx.glow = new PIXI.Graphics();
  fx.glow.blendMode = PIXI.BLEND_MODES.ADD;
  fx.glow.filters = [fx.blurs.glow];
  fx.glow.zIndex = 1;
  fx.container.addChild(fx.glow);
  fx.seed = hashString(`${token.id ?? ""}:shock`);
  return fx;
}

/** Bolts jump round its edge, a new set every split second, each bent along the edge with sparks at its ends. */
function updateShockedFx(token, fx, { now, zoom }) {
  const S = PAINTED2.shocked, art = artCircle(token), r = art.r;
  const glow = fx.glow;
  glow.clear(); fx.g.clear();
  fx.blurs.glow.blur = Math.max(1, r * 0.05 * zoom);
  const names = { smoke: "smoke" };
  S.bolts.forEach((_, i) => { names[`spark${i}a`] = "spark"; names[`spark${i}b`] = "spark"; });
  const s = paintedSprites(fx, names), sets = S.bolts.map((name, i) => stripSprites(fx, `bolt${i}`, name, S.strips));
  const flick = { tint: [1, 1, 0.92 + 0.08 * Math.abs(Math.sin(now / 140))], alpha: 1 };
  if (!s || sets.some(set => !set)) return flick;
  const step = Math.floor(now / S.flickerMs);
  const rand = seededRandom((fx.seed + step * 2654435761) >>> 0);
  // each strike is brightest when it lands, then its glow and sparks die down until the next
  const fade = 1 - 0.55 * ((now % S.flickerMs) / S.flickerMs);
  S.bolts.forEach((name, i) => {
    const set = sets[i], a = s[`spark${i}a`], b = s[`spark${i}b`];
    a.zIndex = b.zIndex = 3;
    // not every bolt every time
    if (rand() < 0.3) { hideStrips(set); a.visible = b.visible = false; return; }
    // somewhere round its edge, either way round, either way up
    const a0 = rand() * TAU, span = (0.45 + rand() * 0.4) * (rand() < 0.5 ? 1 : -1), rad = 1.0 + rand() * 0.07;
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, ang = a0 + span * t, bulge = rad + 0.05 * Math.sin(Math.PI * t);
      pts.push([art.x + Math.cos(ang) * r * bulge, art.y + Math.sin(ang) * r * bulge]);
    }
    const path = measurePath(pts), scale = path.total / set.cut.width;
    const squash = (r * S.height) / (set.cut.height * scale) * (rand() < 0.5 ? 1 : -1);
    layStrips(set, path, { end: path.total, scale, squash, z: 2 });
    // its glow, drawn under it
    glow.lineStyle({ width: Math.max(1, r * 0.12), color: S.glow, alpha: 0.85 * fade, cap: PIXI.LINE_CAP?.ROUND ?? "round" });
    pts.forEach(([x, y], k) => { if (k === 0) glow.moveTo(x, y); else glow.lineTo(x, y); });
    // sparks where it ends (sometimes only one)
    const both = rand() < 0.6;
    placeSprite(a, "spark", pts[0][0], pts[0][1], rand() * TAU, r * (0.6 + 0.5 * rand()), fade);
    if (both) placeSprite(b, "spark", pts[12][0], pts[12][1], rand() * TAU, r * (0.6 + 0.5 * rand()), fade);
    else b.visible = false;
  });
  // now and then a little puff of smoke rises from where it's been singed
  const p = (now / 1000 / S.smokeSeconds) % 1, puff = Math.floor(now / 1000 / S.smokeSeconds);
  if (p < 0.45) {
    const k = p / 0.45, at = seededRandom((fx.seed + puff * 7919) >>> 0)() * Math.PI - Math.PI;   // somewhere round its upper half
    placeSprite(s.smoke, "smoke", art.x + Math.cos(at) * r * 0.9, art.y + Math.sin(at) * r * 0.9 - r * 0.25 * k, 0.3 * k, r * (0.35 + 0.35 * k), 0.7 * Math.sin(Math.PI * k));
    s.smoke.zIndex = 0;
  } else s.smoke.visible = false;
  return flick;
}
