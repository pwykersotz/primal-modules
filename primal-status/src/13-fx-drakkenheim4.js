/* ---------- Monsters of Drakkenheim: pictures of what the condition does ---------- */

/*
 * Each of these shows what the condition does, as a small picture beside the creature:
 *   Clumsy (Dexterity rolls at Disadvantage): it fumbles its dagger, which tumbles to the ground.
 *   Enfeebled (Strength rolls at Disadvantage): it strains to lift a barbell, sweating, and drops it.
 *   Dazed (move or act, not both): little birds circle its head.
 *   Defenseless (attacks against it have Advantage): its shield cracks and splits in two.
 *   Distracted (no Reactions): an eye over its head keeps following a glint flitting about nearby.
 *   Helpless (any hit is a Critical Hit): a white flag waves beside it.
 * Everything is measured from the art (artCircle), so it follows shrunk and moved tokens.
 *
 * Painted pictures (images/fx, cut out of art made for the module) replace the drawn shapes as they
 * arrive: an object with a picture uses it once it has loaded, and the drawn shape until then, or if
 * it can't be loaded: Clumsy's dagger, Enfeebled's barbell and sweat, Dazed's birds, Defenseless's shield,
 * Distracted's eye and glint, and Helpless's flag.
 */
const isDazed = actor => hasStatusMatching(actor, /(^|[^a-z])dazed$/i);
const isDistracted = actor => hasStatusMatching(actor, /(^|[^a-z])distracted$/i);
/** Dazed on its own: Shocked's sparks and Stunned's stars already say it. */
const isDazedOnly = actor => isDazed(actor) && !isShocked(actor) && !isStunned(actor);

const PICTURE = {
  outline: 0x15181C,
  clumsy: { blade: 0xDCE3EA, shine: 0xFFFFFF, guard: 0xC99A3A, grip: 0x6B4423, clang: 0xFFF2B0, dust: 0xB8AE9C, cycleSeconds: 2.6 },
  enfeebled: { bar: 0xB9C0C8, plate: 0x30353C, plateLight: 0x6E7783, sweat: 0x8FD3FF, dust: 0xB8AE9C, cycleSeconds: 3.2, tint: [0.93, 0.9, 0.86] },
  dazed: { body: 0xFFE14D, wing: 0xF2C318, beak: 0xFF8A1F, eye: 0x111111, ring: 0xFFFFFF, birds: 3, orbitSeconds: 2.4 },
  defenseless: { face: 0x3D6FA8, rim: 0xC8D1DB, shine: 0xA9C8EC, crack: 0xFF7A3D, cycleSeconds: 3.4 },
  distracted: { white: 0xF6F4EE, iris: 0x3C7BD0, pupil: 0x0E0E12, glint: 0xFFF1A0, glow: 0xFFD860, blinkSeconds: 3.7 },
  helpless: { cloth: 0xF7F7F2, shade: 0x8C8C8C, pole: 0x8A6239, knob: 0xE0C060 }
};

/* ---------- painted pictures ---------- */

/**
 * Each picture: its file in images/fx, the point it turns about (as a fraction of its width and
 * height) and how big it's drawn, in units of the art's radius: its height, or its width with
 * fit "width".
 */
const PICTURE_ART = {
  dagger: { file: "clumsy-dagger.webp", anchor: [0.5, 0.74], length: 1.0 },                // turns about the middle of the grip
  barbell: { file: "enfeebled-barbell.webp", anchor: [0.5, 0.5], length: 1.15, fit: "width" },
  sweat: { file: "enfeebled-sweat.webp", anchor: [0.5, 0.66], length: 0.17 },               // the middle of the round part
  // the two frames of a flap, cut with the same box so the body stays put; they face right
  birdUp: { file: "dazed-bird-up.webp", anchor: [0.6, 0.6], length: 0.46, fit: "width" },
  birdDown: { file: "dazed-bird-down.webp", anchor: [0.6, 0.6], length: 0.46, fit: "width" },
  // the whole shield and the pieces it splits into, all cut with one box, so they line up; they turn
  // about the bottom of the crack
  shield: { file: "defenseless-shield.webp", anchor: [0.5, 0.98], length: 0.82 },
  shieldLeft: { file: "defenseless-left.webp", anchor: [0.5, 0.98], length: 0.82 },
  shieldRight: { file: "defenseless-right.webp", anchor: [0.5, 0.98], length: 0.82 },
  shieldChips: { file: "defenseless-chips.webp", anchor: [0.5, 0.98], length: 0.82 },
  // cut into the pole and upright strips of cloth (FLAG_ART), so the cloth can ripple
  flag: { file: "helpless-flag.webp", anchor: [0, 0], length: 0.95 },
  // the eye in two layers, its white and its lids (cut with one box, centred on the white), so the
  // iris slides between them and goes under the lids; the iris is 340 of the eye picture's 963 px wide
  eyeWhite: { file: "distracted-eye.webp", anchor: [0.494, 0.496], length: 0.66, fit: "width" },
  eyeLids: { file: "distracted-lids.webp", anchor: [0.494, 0.496], length: 0.66, fit: "width" },
  iris: { file: "distracted-iris.webp", anchor: [0.5, 0.5], length: 0.233, fit: "width" },
  glint: { file: "distracted-glint.webp", anchor: [0.5, 0.5], length: 0.3, fit: "width" },
  // (13-fx-drakkenheim5.js) Weakened: the hilt and the blade, straight and wilted, cut with one box
  // so they line up; they turn about the middle of the crossguard
  swordHilt: { file: "weakened-hilt.webp", anchor: [0.366, 0.604], length: 1.0 },
  swordBlade: { file: "weakened-blade.webp", anchor: [0.366, 0.604], length: 1.0 },
  swordWilted: { file: "weakened-wilted.webp", anchor: [0.366, 0.604], length: 1.0 },
  // Staggered: the axe turns about the middle of its grip; the padlock (open and shut, one box) hangs
  // from the inside of its shackle
  axe: { file: "staggered-axe.webp", anchor: [0.353, 0.782], length: 1.05 },
  lockOpen: { file: "staggered-lock-open.webp", anchor: [0.377, 0.129], length: 0.36 },
  lockShut: { file: "staggered-lock-shut.webp", anchor: [0.377, 0.129], length: 0.36 },
  // Sickened
  fumes: { file: "sickened-fumes.webp", anchor: [0.5, 0.5], length: 0.5, fit: "width" },
  fly: { file: "sickened-fly.webp", anchor: [0.5, 0.55], length: 0.18, fit: "width" },
  // Jinxed: the raindrop turns about the middle of its round part, the splash sits on the bottom of its bowl
  cloud: { file: "jinxed-cloud.webp", anchor: [0.5, 0.5], length: 0.7, fit: "width" },
  d20: { file: "jinxed-d20.webp", anchor: [0.5, 0.5], length: 0.32 },
  raindrop: { file: "jinxed-raindrop.webp", anchor: [0.5, 0.7], length: 0.13 },
  splash: { file: "jinxed-splash.webp", anchor: [0.5, 0.9], length: 0.26, fit: "width" },
  // Immobilized: one chain link, repeated along the chain
  cuff: { file: "immobilized-cuff.webp", anchor: [0.5, 0.5], length: 0.4, fit: "width" },
  ball: { file: "immobilized-ball.webp", anchor: [0.5, 0.5], length: 0.42 },
  chainLink: { file: "immobilized-link.webp", anchor: [0.5, 0.5], length: 0.13, fit: "width" },
  // (13-fx-drakkenheim6.js) Entangled: one vine, cut into strips and bent along each vine's path (its
  // stem runs along the middle, 0.43 of the picture's height thick at the cut end, and it ends in a
  // curl on the right); the leaf fresh and withered (one box), turning about the end of its stalk;
  // the torn-up earth the vines come out of
  vine: { file: "entangled-vine.webp", anchor: [0.5, 0.5], length: 1, stem: 0.43 },
  leaf: { file: "entangled-leaf.webp", anchor: [0.03, 0.555], length: 0.26, fit: "width" },
  leafDry: { file: "entangled-leaf-dry.webp", anchor: [0.03, 0.555], length: 0.26, fit: "width" },
  earth: { file: "entangled-earth.webp", anchor: [0.5, 0.6], length: 1.3, fit: "width" },
  // Addled: the thought bubble turns about the middle of its cloud
  bubble: { file: "addled-bubble.webp", anchor: [0.5, 0.435], length: 1.15, fit: "width" },
  tangle: { file: "addled-tangle.webp", anchor: [0.5, 0.5], length: 0.44, fit: "width" },
  question: { file: "addled-question.webp", anchor: [0.5, 0.5], length: 0.3 },
  // Bewildered: the wand turns about its grip; its crystal is 0.05 of the way down
  wand: { file: "bewildered-wand.webp", anchor: [0.5, 0.8], length: 1.1 },
  smoke: { file: "bewildered-smoke.webp", anchor: [0.5, 0.5], length: 0.42, fit: "width" },
  // Bleeding: the streak, bent along the lower rim, and the three drips cut from under it at the same
  // scale (BLOOD_ART says where they hang); a drop (turning about the middle of its round part) and a splat
  streak: { file: "bleeding-streak.webp", anchor: [0.5, 0.49], length: 1 },
  drip1: { file: "bleeding-drip1.webp", anchor: [0.47, 0], length: 1 },
  drip2: { file: "bleeding-drip2.webp", anchor: [0.509, 0], length: 1 },
  drip3: { file: "bleeding-drip3.webp", anchor: [0.466, 0], length: 1 },
  drop: { file: "bleeding-drop.webp", anchor: [0.5, 0.63], length: 1, fit: "width" },
  splat: { file: "bleeding-splat.webp", anchor: [0.5, 0.5], length: 1, fit: "width" },
  // Shocked: three bolts, cut into strips and bent along its edge (each turns about the line between
  // its two tips), and a spark for their ends
  bolt1: { file: "shocked-bolt1.webp", anchor: [0.5, 0.56], length: 1 },
  bolt2: { file: "shocked-bolt2.webp", anchor: [0.5, 0.6], length: 1 },
  bolt3: { file: "shocked-bolt3.webp", anchor: [0.5, 0.58], length: 1 },
  spark: { file: "shocked-spark.webp", anchor: [0.5, 0.5], length: 0.24 }
};
const pictureArt = new Map();   // name → { state: "loading" | "ready" | "failed", texture }
let pictureArtLoaded = 0;       // goes up as pictures arrive, so a Still picture is drawn again

/** A painted picture's texture once it has loaded; null until then, or if it can't be (the shape is drawn instead). */
function pictureTexture(name) {
  const def = PICTURE_ART[name];
  if (!def) return null;
  let entry = pictureArt.get(name);
  if (!entry) {
    entry = { state: "loading", texture: null };
    pictureArt.set(name, entry);
    loadTextureFor(`${MODULE_PATH}/images/fx/${def.file}`)
      .then(tex => {
        entry.texture = tex ?? null; entry.state = tex ? "ready" : "failed";
        if (tex) pictureArtLoaded++;
      })
      .catch(err => { entry.state = "failed"; console.warn(`${MODULE_ID} | Could not load ${def.file}; drawing it instead`, err); });
  }
  return entry.state === "ready" ? entry.texture : null;
}

/** The effect's sprite of a painted picture (key: one of several copies), made the first time its texture is ready (null until then). */
function pictureSprite(fx, name, key = name) {
  const have = fx.sprites?.[key];
  if (have && !have.destroyed) return have;
  const tex = pictureTexture(name);
  if (!tex || typeof PIXI.Sprite !== "function") return null;
  const sprite = new PIXI.Sprite(tex);
  const [ax, ay] = PICTURE_ART[name].anchor;
  sprite.anchor?.set?.(ax, ay);
  sprite.visible = false;   // until it's placed
  fx.container.addChildAt?.(sprite, 0) ?? fx.container.addChild(sprite);
  (fx.sprites ??= {})[key] = sprite;
  return sprite;
}

/** Place a picture's sprite: at (x, y), turned by angle, sized to its length in units of r. */
function placeSprite(sprite, name, x, y, angle, r, alpha = 1) {
  const def = PICTURE_ART[name];
  const along = (def.fit === "width" ? sprite.texture?.width : sprite.texture?.height) || 256;
  const scale = (def.length * r) / along;
  sprite.position.set(x, y);
  sprite.rotation = angle;
  sprite.scale.set(scale, scale);
  sprite.alpha = alpha;
  sprite.visible = alpha > 0.02;
}

/* ---------- small drawing helpers ---------- */

/** Points given around (0, 0) in units of r, turned by angle and placed at (cx, cy): a flat array for drawPolygon. */
function placePoints(points, cx, cy, r, angle = 0, sx = 1, sy = sx) {
  const c = Math.cos(angle), s = Math.sin(angle), out = [];
  for (const [x, y] of points) {
    const px = x * r * sx, py = y * r * sy;
    out.push(cx + px * c - py * s, cy + px * s + py * c);
  }
  return out;
}

/** A filled shape with a dark outline. */
function drawShape(g, flat, fill, width, alpha = 1, outline = PICTURE.outline) {
  g.lineStyle({ width, color: outline, alpha, join: PIXI.LINE_JOIN?.ROUND ?? "round" });
  g.beginFill(fill, alpha).drawPolygon(flat).endFill();
}

/** A rectangle from (x0, y0) to (x1, y1), as points. */
const rectPoints = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** A drop of sweat (or acid): a round bottom with a point on top, centred on (x, y). */
function drawSweatDrop(g, x, y, size, color, width, alpha) {
  const pts = [[0, -1.6]];
  for (let k = 0; k <= 10; k++) { const a = -Math.PI * 0.15 + (Math.PI * 1.3) * (k / 10); pts.push([Math.cos(a), Math.sin(a)]); }
  drawShape(g, placePoints(pts, x, y, size), color, width, alpha);
}

const easeOut = t => 1 - (1 - t) * (1 - t);
const lineWidthFor = r => Math.max(1.2, r * 0.025);

/* ---------- Clumsy: a fumbled dagger ---------- */

const DAGGER = {
  blade: [[-0.035, -0.06], [0.035, -0.06], [0.03, -0.31], [0, -0.4], [-0.03, -0.31]],
  guard: rectPoints(-0.095, -0.065, 0.095, -0.03),
  grip: rectPoints(-0.026, -0.03, 0.026, 0.075)
};

function createClumsyFx() {
  const container = newFxContainer();
  const g = new PIXI.Graphics();
  container.addChild(g);
  return { container, g };
}

/** Where the dagger is, how it's turned and how visible, a moment p (0–1) into the fumble. */
function daggerPose(art, p, rest = 0.03) {
  const r = art.r;
  const hand = [art.x + r * 0.7, art.y + r * 0.1], ground = art.y + r * 0.95, land = hand[0] + r * 0.12;
  const held = 0.5, flat = Math.PI / 2 + Math.PI * 2;
  if (p < 0.24) {
    const k = p / 0.24;    // held, then fumbling more and more
    return { x: hand[0], y: hand[1] - r * 0.02 * Math.sin(k * Math.PI), a: held + 0.16 * k * Math.sin(p * 120), alpha: clamp01(p / 0.05) };
  }
  if (p < 0.56) {
    const k = (p - 0.24) / 0.32;   // slips: a little hop, then falls spinning
    return { x: hand[0] + (land - hand[0]) * k, y: hand[1] + (ground - r * rest - hand[1]) * k * k - r * 0.5 * k * (1 - k), a: held + (flat - held) * k, alpha: 1 };
  }
  if (p < 0.68) {
    const k = (p - 0.56) / 0.12;   // bounces once
    return { x: land + r * 0.04 * k, y: ground - r * rest - r * 0.07 * Math.sin(k * Math.PI), a: flat + 0.3 * Math.sin(k * Math.PI), alpha: 1 };
  }
  return { x: land + r * 0.04, y: ground - r * rest, a: flat, alpha: 1 - clamp01((p - 0.84) / 0.14) };
}

function updateClumsyFx(token, fx, { now }) {
  const C = PICTURE.clumsy, art = artCircle(token);
  const r = art.r, T = now / 1000, g = fx.g;
  const p = (T / C.cycleSeconds) % 1;
  const w = lineWidthFor(r), size = 1.6;
  g.clear();
  const sprite = pictureSprite(fx, "dagger");
  // the painted dagger's crossguard is broad, so it lies a little higher on the ground
  const d = daggerPose(art, p, sprite ? 0.12 : 0.03);
  if (sprite) placeSprite(sprite, "dagger", d.x, d.y, d.a, r, d.alpha);
  else if (d.alpha > 0.02) {
    drawShape(g, placePoints(DAGGER.blade, d.x, d.y, r, d.a, size), C.blade, w, d.alpha);
    g.lineStyle({ width: Math.max(0.8, w * 0.6), color: C.shine, alpha: 0.8 * d.alpha });
    const shine = placePoints([[0, -0.08], [0, -0.33]], d.x, d.y, r, d.a, size);
    g.moveTo(shine[0], shine[1]); g.lineTo(shine[2], shine[3]);
    drawShape(g, placePoints(DAGGER.grip, d.x, d.y, r, d.a, size), C.grip, w, d.alpha);
    drawShape(g, placePoints(DAGGER.guard, d.x, d.y, r, d.a, size), C.guard, w, d.alpha);
    const [px, py] = placePoints([[0, 0.095]], d.x, d.y, r, d.a, size);
    g.lineStyle({ width: w, color: PICTURE.outline, alpha: d.alpha }).beginFill(C.guard, d.alpha).drawCircle(px, py, r * 0.035 * size).endFill();
  }
  // "whoops": two quick lines where it slips out of the hand
  if (p > 0.2 && p < 0.36) {
    const k = (p - 0.2) / 0.16, a = Math.sin(k * Math.PI);
    const hx = art.x + r * 0.7, hy = art.y + r * 0.1;
    g.lineStyle({ width: Math.max(1, w * 0.9), color: C.clang, alpha: a, cap: PIXI.LINE_CAP?.ROUND ?? "round" });
    for (const [dx, dy, ex, ey] of [[0.12, -0.16, 0.2, -0.24], [0.18, -0.06, 0.28, -0.1]]) {
      g.moveTo(hx + r * dx, hy + r * dy); g.lineTo(hx + r * ex, hy + r * ey);
    }
  }
  // clatter: short lines and a puff of dust where it lands
  if (p > 0.55 && p < 0.72) {
    const k = (p - 0.55) / 0.17, a = 1 - k;
    const lx = art.x + r * 0.95, ly = art.y + r * 0.93;
    g.lineStyle({ width: Math.max(1, w * 0.9), color: C.clang, alpha: a, cap: PIXI.LINE_CAP?.ROUND ?? "round" });
    for (const ang of [-2.4, -1.57, -0.75]) {
      const r0 = r * (0.1 + 0.08 * k), r1 = r0 + r * 0.08;
      g.moveTo(lx + Math.cos(ang) * r0, ly + Math.sin(ang) * r0); g.lineTo(lx + Math.cos(ang) * r1, ly + Math.sin(ang) * r1);
    }
    g.lineStyle(0);
    for (const side of [-1, 1]) g.beginFill(C.dust, 0.45 * a).drawEllipse(lx + side * r * (0.08 + 0.12 * k), ly + r * 0.03, r * (0.05 + 0.05 * k), r * (0.025 + 0.02 * k)).endFill();
  }
  return { tint: [1, 1, 1], alpha: 1 };
}

/* ---------- Enfeebled: a barbell too heavy to lift ---------- */

const BARBELL = {
  bar: rectPoints(-0.44, -0.018, 0.44, 0.018),
  plates: [rectPoints(-0.33, -0.15, -0.26, 0.15), rectPoints(0.26, -0.15, 0.33, 0.15), rectPoints(-0.385, -0.11, -0.33, 0.11), rectPoints(0.33, -0.11, 0.385, 0.11)],
  collars: [rectPoints(-0.415, -0.04, -0.385, 0.04), rectPoints(0.385, -0.04, 0.415, 0.04)]
};

function createEnfeebledFx() {
  const container = newFxContainer();
  const g = new PIXI.Graphics();
  container.addChild(g);
  return { container, g };
}

function updateEnfeebledFx(token, fx, { now }) {
  const E = PICTURE.enfeebled, art = artCircle(token);
  const r = art.r, T = now / 1000, g = fx.g;
  const p = (T / E.cycleSeconds) % 1;
  const w = lineWidthFor(r);
  g.clear();
  // resting, straining (trembling, a little lopsided), dropped, a thud
  let lift = 0, tilt = 0, jitter = 0;
  if (p >= 0.12 && p < 0.52) {
    const k = (p - 0.12) / 0.4;
    lift = r * 0.14 * easeOut(k);
    jitter = r * 0.014 * Math.sin(T * 47) * k;
    tilt = 0.07 * k + 0.05 * Math.sin(T * 31) * k;
  } else if (p >= 0.52 && p < 0.6) {
    const k = (p - 0.52) / 0.08;
    lift = r * 0.14 * (1 - k * k); tilt = 0.12 * (1 - k);
  } else if (p >= 0.6 && p < 0.7) {
    lift = r * 0.025 * Math.sin(((p - 0.6) / 0.1) * Math.PI);
  }
  const barbell = pictureSprite(fx, "barbell");
  // the painted plates are taller, so its middle sits a little higher to rest on the ground
  const cx = art.x + jitter, cy = art.y + r * (barbell ? 0.74 : 0.8) - lift;
  if (barbell) placeSprite(barbell, "barbell", cx, cy, tilt, r);
  else {
    const size = 1.3;
    drawShape(g, placePoints(BARBELL.bar, cx, cy, r, tilt, size), E.bar, w);
    for (const plate of BARBELL.plates) drawShape(g, placePoints(plate, cx, cy, r, tilt, size), E.plate, w);
    for (const collar of BARBELL.collars) drawShape(g, placePoints(collar, cx, cy, r, tilt, size), E.bar, w);
    // a highlight down each big plate
    g.lineStyle({ width: Math.max(0.8, w * 0.7), color: E.plateLight, alpha: 0.9 });
    for (const x of [-0.295, 0.295]) {
      const line = placePoints([[x, -0.12], [x, 0.12]], cx, cy, r, tilt, size);
      g.moveTo(line[0], line[1]); g.lineTo(line[2], line[3]);
    }
  }
  // the thud: dust puffs under the plates
  if (p >= 0.58 && p < 0.78) {
    const k = (p - 0.58) / 0.2, a = 0.5 * (1 - k);
    g.lineStyle(0);
    for (const side of [-1, 1]) {
      g.beginFill(E.dust, a).drawEllipse(art.x + side * r * (0.4 + 0.12 * k), art.y + r * 1.0, r * (0.07 + 0.07 * k), r * (0.03 + 0.02 * k)).endFill();
    }
  }
  // sweat flying off its head while it strains
  [[0.24, 1], [0.36, -1]].forEach(([start, side], i) => {
    const k = (p - start) / 0.32;
    const drop = pictureSprite(fx, "sweat", `sweat${i}`);
    if (k <= 0 || k >= 1) { if (drop) drop.visible = false; return; }
    const x = art.x + side * r * (0.4 + 0.22 * k), y = art.y - r * 0.6 - r * 0.12 * Math.sin(k * Math.PI) + r * 0.25 * k * k;
    const alpha = 1 - clamp01((k - 0.7) / 0.3);
    // tipped the way it flies
    if (drop) placeSprite(drop, "sweat", x, y, side * (0.35 + 0.9 * k), r, alpha);
    else drawSweatDrop(g, x, y, r * 0.06, E.sweat, Math.max(1, w * 0.8), alpha);
  });
  return { tint: E.tint, alpha: 1 };
}

/* ---------- Dazed: little birds circling its head ---------- */

function createDazedFx(token) {
  const container = newFxContainer();
  const ring = new PIXI.Graphics(), g = new PIXI.Graphics();
  container.addChild(ring, g);
  // the painted birds pass in front of and behind each other by depth
  container.sortableChildren = true;
  ring.zIndex = -1;
  const rand = seededRandom(hashString(`${token.id ?? ""}:dazed`));
  const birds = Array.from({ length: PICTURE.dazed.birds }, (_, i) => ({ index: i, offset: (i / PICTURE.dazed.birds) * Math.PI * 2, flap: rand() * 6.3 }));
  return { container, ring, g, birds };
}

/** One little bird facing dir (1 right, −1 left), body size s, wings at flap (−1 down to 1 up). */
function drawBird(g, x, y, s, dir, flap, w, alpha) {
  const D = PICTURE.dazed;
  const pts = (list) => list.flatMap(([px, py]) => [x + dir * px * s, y + py * s]);
  drawShape(g, pts([[-0.85, -0.1], [-1.45, -0.4], [-1.35, 0.15]]), D.wing, w, alpha);                       // tail
  g.lineStyle({ width: w, color: PICTURE.outline, alpha });
  g.beginFill(D.body, alpha).drawEllipse(x, y, s, s * 0.72).endFill();                                      // body
  g.beginFill(D.body, alpha).drawCircle(x + dir * s * 0.82, y - s * 0.5, s * 0.5).endFill();                // head
  drawShape(g, pts([[1.24, -0.62], [1.68, -0.46], [1.24, -0.32]]), D.beak, w, alpha);                       // beak
  g.lineStyle(0).beginFill(D.eye, alpha).drawCircle(x + dir * s * 0.98, y - s * 0.62, Math.max(0.6, s * 0.1)).endFill();
  drawShape(g, pts([[-0.3, -0.1], [0.4, -0.1], [-0.15, -0.1 - 1.1 * flap]]), D.wing, w, alpha);            // wing
}

function updateDazedFx(token, fx, { now }) {
  const D = PICTURE.dazed, art = artCircle(token);
  const r = art.r, T = now / 1000;
  const cx = art.x, cy = art.y - r * 0.86, rx = r * 0.62, ry = r * 0.2;
  const w = Math.max(1, r * 0.022);
  const spin = (T / D.orbitSeconds) * Math.PI * 2;
  // a faint dotted ring they fly along
  fx.ring.clear();
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2 + spin * 0.3;
    fx.ring.beginFill(D.ring, 0.18 + 0.14 * Math.sin(a)).drawCircle(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, Math.max(0.8, r * 0.016)).endFill();
  }
  const g = fx.g;
  g.clear();
  // the far side first, so the near birds pass in front
  const birds = fx.birds.map(b => {
    const a = b.offset + spin;
    return { b, a, depth: (Math.sin(a) + 1) / 2 };
  }).sort((p, q) => p.depth - q.depth);
  for (const { b, a, depth } of birds) {
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry + Math.sin(T * 7 + b.flap) * r * 0.015;
    const dir = -Math.sin(a) >= 0 ? 1 : -1;
    const near = 0.78 + 0.3 * depth, alpha = 0.6 + 0.4 * depth, flap = Math.sin(T * 16 + b.flap);
    const up = pictureSprite(fx, "birdUp", `birdUp${b.index}`), down = pictureSprite(fx, "birdDown", `birdDown${b.index}`);
    if (up && down) {
      // two painted frames, wings up and wings down, turned to face the way it's flying
      for (const [sprite, name, shown] of [[up, "birdUp", flap > 0], [down, "birdDown", flap <= 0]]) {
        placeSprite(sprite, name, x, y, 0, r * near, shown ? alpha : 0);
        sprite.scale.x *= dir;
        sprite.zIndex = depth;
      }
    } else drawBird(g, x, y, r * 0.12 * near, dir, flap, w, alpha);
  }
  return { tint: [1, 1, 1], alpha: 1 };
}

/* ---------- Defenseless: its shield splits in two ---------- */

/** The two halves of a cracked heater shield (units of r, centred on 0, 0), split along a jagged crack. */
const SHIELD = (() => {
  const top = -0.24, shoulder = -0.05, tip = 0.24, half = 0.2;
  const curve = side => Array.from({ length: 9 }, (_, i) => {
    const t = (i + 1) / 9;
    return [side * half * Math.cos(t * Math.PI / 2), shoulder + (tip - shoulder) * Math.sin(t * Math.PI / 2)];
  });
  const crack = [[0.01, top], [-0.03, -0.12], [0.035, -0.02], [-0.02, 0.08], [0.015, 0.16], [0, tip]];
  const left = [...crack.slice(0, 1), [-half, top], [-half, shoulder], ...curve(-1).slice(0, -1), ...crack.slice().reverse()];
  const right = [...crack, ...curve(1).slice(0, -1).reverse(), [half, shoulder], [half, top]];
  return { left, right, crack };
})();

function createDefenselessFx() {
  const container = newFxContainer();
  const g = new PIXI.Graphics();
  container.addChild(g);
  return { container, g };
}

/** Where the painted shield splits, top to bottom, as fractions of its picture's width and height. */
const SHIELD_ART_CRACK = [[0.536, 0.046], [0.53, 0.108], [0.531, 0.171], [0.533, 0.234], [0.552, 0.295], [0.514, 0.358],
  [0.518, 0.421], [0.496, 0.484], [0.493, 0.545], [0.495, 0.608], [0.501, 0.671], [0.501, 0.734], [0.515, 0.795],
  [0.502, 0.858], [0.488, 0.921], [0.488, 0.984]];

/**
 * The painted shield: whole and shaking while a crack runs down it, then the two halves fall apart
 * (turning about the bottom of the crack) and chips drop out of the gap.
 */
function paintShield(fx, sprites, art, T, p, open, sway, alpha) {
  const D = PICTURE.defenseless, r = art.r, g = fx.g;
  const pivotX = art.x - r * 0.66, pivotY = art.y + r * 0.88;
  const { whole, left, right, chips } = sprites;
  const intact = p < 0.26;
  const strain = clamp01((p - 0.1) / 0.16);
  const shake = intact ? r * 0.012 * strain * Math.sin(T * 55) : 0;
  placeSprite(whole, "shield", pivotX + shake, pivotY, 0, r, intact ? alpha : 0);
  for (const [sprite, name, side] of [[left, "shieldLeft", -1], [right, "shieldRight", 1]]) {
    placeSprite(sprite, name, pivotX + side * r * 0.1 * open, pivotY + r * 0.06 * open, side * (0.16 * open + sway), r, intact ? 0 : alpha);
  }
  // chips drop out of the gap as it opens
  const fall = clamp01((p - 0.26) / 0.3);
  placeSprite(chips, "shieldChips", pivotX, pivotY + r * 0.5 * fall * fall, 0, r, intact || fall >= 1 ? 0 : alpha * (1 - fall));
  // the crack runs down from the top while it strains, glowing
  if (intact && strain > 0) {
    const tex = whole.texture, s = (PICTURE_ART.shield.length * r) / (tex?.height || 256);
    const W = (tex?.width || 256) * s, H = (tex?.height || 256) * s;
    const pts = SHIELD_ART_CRACK.map(([u, v]) => [pivotX + shake + (u - 0.5) * W, pivotY + (v - 0.98) * H]);
    const reach = strain * (pts.length - 1), last = Math.floor(reach);
    const path = pts.slice(0, last + 1);
    if (last < pts.length - 1) {
      const f = reach - last, [ax, ay] = pts[last], [bx, by] = pts[last + 1];
      path.push([ax + (bx - ax) * f, ay + (by - ay) * f]);
    }
    const w = lineWidthFor(r), round = PIXI.LINE_JOIN?.ROUND ?? "round";
    for (const [width, color, a] of [[w * 2.4, D.crack, 0.35 + 0.25 * Math.sin(T * 40)], [w * 0.8, PICTURE.outline, 1]]) {
      g.lineStyle({ width, color, alpha: a * alpha, join: round, cap: round });
      g.moveTo(path[0][0], path[0][1]);
      for (const [x, y] of path.slice(1)) g.lineTo(x, y);
    }
  }
}

function updateDefenselessFx(token, fx, { now }) {
  const D = PICTURE.defenseless, art = artCircle(token);
  const r = art.r, T = now / 1000, g = fx.g;
  const p = (T / D.cycleSeconds) % 1;
  const w = lineWidthFor(r), size = 1.5;
  const cx = art.x - r * 0.66, cy = art.y + r * 0.5;
  g.clear();
  // whole, the crack glowing; it splits and the halves sag apart; they fade, and it's whole again
  const open = p < 0.26 ? 0 : p < 0.36 ? easeOut((p - 0.26) / 0.1) : 1;
  const sway = open * 0.03 * Math.sin(T * 3);
  const alpha = p < 0.04 ? p / 0.04 : 1 - clamp01((p - 0.9) / 0.07);
  const sprites = { whole: pictureSprite(fx, "shield"), left: pictureSprite(fx, "shieldLeft"), right: pictureSprite(fx, "shieldRight"), chips: pictureSprite(fx, "shieldChips") };
  if (Object.values(sprites).every(Boolean)) {
    paintShield(fx, sprites, art, T, p, open, sway, alpha);
    return { tint: [1, 1, 1], alpha: 1 };
  }
  for (const [points, side] of [[SHIELD.left, -1], [SHIELD.right, 1]]) {
    // each half turns about the bottom of the crack, so its top falls outward, and drops apart a little
    const a = side * (0.16 * open + sway);
    const pivotX = cx, pivotY = cy + r * 0.24 * size;
    const moveX = side * r * 0.1 * open, moveY = r * 0.06 * open;
    const flat = placePoints(points, cx, cy, r, 0, size), turned = [];
    for (let i = 0; i < flat.length; i += 2) {
      const dx = flat[i] - pivotX, dy = flat[i + 1] - pivotY;
      turned.push(pivotX + moveX + dx * Math.cos(a) - dy * Math.sin(a), pivotY + moveY + dx * Math.sin(a) + dy * Math.cos(a));
    }
    g.lineStyle({ width: w * 2.4, color: D.rim, alpha });
    g.beginFill(D.face, alpha).drawPolygon(turned).endFill();
    g.lineStyle({ width: w, color: PICTURE.outline, alpha }).drawPolygon(turned);
  }
  // a shine across the shield while it's whole
  if (open === 0) {
    g.lineStyle({ width: Math.max(1, w), color: D.shine, alpha: 0.6 * alpha });
    const s = placePoints([[-0.13, -0.17], [-0.13, 0.04]], cx, cy, r, 0, size);
    g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]);
  }
  // the crack glows hotter and hotter just before it splits, then sparks fly from it
  if (p > 0.1 && p < 0.3) {
    const k = (p - 0.1) / 0.2;
    g.lineStyle({ width: Math.max(1, w * (0.8 + k)), color: D.crack, alpha: k * (0.6 + 0.4 * Math.sin(T * 40)), join: PIXI.LINE_JOIN?.ROUND ?? "round" });
    const c = placePoints(SHIELD.crack, cx, cy, r, 0, size);
    g.moveTo(c[0], c[1]);
    for (let i = 2; i < c.length; i += 2) g.lineTo(c[i], c[i + 1]);
  }
  if (p > 0.26 && p < 0.5) {
    const k = (p - 0.26) / 0.24;
    g.lineStyle(0);
    for (let i = 0; i < 5; i++) {
      const x = cx + r * size * (0.06 * Math.sin(i * 2.1) + (i - 2) * 0.03 * k * 3), y = cy + r * size * (-0.15 + i * 0.07) + r * 0.35 * k * k;
      g.beginFill(i % 2 ? D.crack : D.shine, 1 - k).drawCircle(x, y, Math.max(0.8, r * 0.018)).endFill();
    }
  }
  return { tint: [1, 1, 1], alpha: 1 };
}

/* ---------- Distracted: an eye following a glint somewhere else ---------- */

function createDistractedFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { glow: newBlur(4, 2, ADD) };
  const glow = new PIXI.Graphics(); glow.blendMode = ADD; glow.filters = [blurs.glow];
  const g = new PIXI.Graphics();
  container.addChild(glow, g);
  // the painted eye's layers go above these, in order (PAINTED_EYE_LAYERS)
  container.sortableChildren = true;
  glow.zIndex = 0; g.zIndex = 1;
  const rand = seededRandom(hashString(`${token.id ?? ""}:distracted`));
  return { container, blurs, glow, g, phase: rand() * 10 };
}

/** The painted eye's layers, back to front, above the glow and the dots. */
const PAINTED_EYE_LAYERS = { white: 2, iris: 3, lids: 4, glint: 5 };

/** The painted eye at (ex, ey), its iris turned towards (gx, gy) and sliding under the lids; open squashes it for a blink. */
function paintEye(parts, art, ex, ey, gx, gy, open) {
  const r = art.r, squash = Math.max(0.08, open);
  const dx = gx - ex, dy = gy - ey, len = Math.hypot(dx, dy) || 1;
  for (const [key, sprite] of Object.entries(parts)) sprite.zIndex = PAINTED_EYE_LAYERS[key];
  const look = [[parts.white, "eyeWhite", 0, 0], [parts.iris, "iris", (dx / len) * r * 0.1, (dy / len) * r * 0.045], [parts.lids, "eyeLids", 0, 0]];
  for (const [sprite, name, ox, oy] of look) {
    placeSprite(sprite, name, ex + ox, ey + oy * squash, 0, r);
    sprite.scale.y *= squash;
  }
}

/** Where the glint is at time T: wandering round the eye, so the eye keeps looking this way and that. */
function glintPoint(art, ex, ey, T) {
  const r = art.r;
  return [ex - r * 0.15 + r * 0.55 * Math.sin(T * 0.9) + r * 0.15 * Math.sin(T * 2.3 + 1),
    ey + r * 0.3 + r * 0.28 * Math.sin(T * 1.3 + 2) + r * 0.08 * Math.sin(T * 3.1)];
}

function updateDistractedFx(token, fx, { now, zoom }) {
  const D = PICTURE.distracted, art = artCircle(token);
  const r = art.r, T = now / 1000 + fx.phase;
  const ex = art.x + r * 0.52, ey = art.y - r * 0.84, a = r * 0.26, b = r * 0.14;
  const w = lineWidthFor(r);
  const [gx, gy] = glintPoint(art, ex, ey, T);
  const g = fx.g, glow = fx.glow;
  g.clear(); glow.clear();
  fx.blurs.glow.blur = Math.max(1, r * 0.05 * zoom);
  // a few dots from the eye to what it's looking at
  g.lineStyle(0);
  for (let k = 1; k <= 4; k++) {
    const t = k / 5;
    g.beginFill(D.white, 0.55).drawCircle(ex + (gx - ex) * t, ey + (gy - ey) * t, Math.max(0.8, r * 0.016)).endFill();
  }
  // the glint: a twinkling four-pointed sparkle
  const tw = 0.75 + 0.25 * Math.sin(T * 9), sr = r * 0.13 * tw, si = sr * 0.25, rot = T * 0.8;
  const bp = (T / D.blinkSeconds) % 1;
  const open = bp > 0.94 ? Math.abs(Math.cos(((bp - 0.94) / 0.06) * Math.PI)) : 1;
  const parts = { white: pictureSprite(fx, "eyeWhite"), iris: pictureSprite(fx, "iris"), lids: pictureSprite(fx, "eyeLids"), glint: pictureSprite(fx, "glint") };
  if (Object.values(parts).every(Boolean)) {
    glow.beginFill(D.glow, 0.7).drawCircle(gx, gy, sr * 0.9).endFill();
    paintEye(parts, art, ex, ey, gx, gy, open);
    placeSprite(parts.glint, "glint", gx, gy, rot * 0.4, r * tw);
    return { tint: [1, 1, 1], alpha: 1 };
  }
  const star = [];
  for (let k = 0; k < 8; k++) { const ang = rot + (k * Math.PI) / 4; const rr = k % 2 ? si : sr; star.push(gx + Math.cos(ang) * rr, gy + Math.sin(ang) * rr); }
  glow.beginFill(D.glow, 0.7).drawCircle(gx, gy, sr * 0.8).endFill();
  g.lineStyle(0).beginFill(D.glint, 1).drawPolygon(star).endFill();
  // the eye: almond-shaped, blinking now and then, its iris turned towards the glint
  const lid = [];
  for (let k = 0; k <= 12; k++) { const x = -a + (2 * a * k) / 12; lid.push(ex + x, ey - b * open * Math.sin((Math.PI * k) / 12)); }
  for (let k = 12; k >= 0; k--) { const x = -a + (2 * a * k) / 12; lid.push(ex + x, ey + b * open * Math.sin((Math.PI * k) / 12)); }
  g.lineStyle({ width: w, color: PICTURE.outline, alpha: 1, join: PIXI.LINE_JOIN?.ROUND ?? "round" });
  g.beginFill(D.white, 1).drawPolygon(lid).endFill();
  if (open > 0.35) {
    const dx = gx - ex, dy = gy - ey, len = Math.hypot(dx, dy) || 1;
    const ix = ex + (dx / len) * a * 0.45, iy = ey + (dy / len) * b * 0.35 * open;
    const ir = Math.min(r * 0.1, b * open * 0.95);
    g.lineStyle(0);
    g.beginFill(D.iris, 1).drawCircle(ix, iy, ir).endFill();
    g.beginFill(D.pupil, 1).drawCircle(ix, iy, ir * 0.5).endFill();
    g.beginFill(D.white, 0.95).drawCircle(ix - ir * 0.35, iy - ir * 0.35, ir * 0.22).endFill();
    g.lineStyle({ width: w, color: PICTURE.outline, alpha: 1 }).drawPolygon(lid);
  }
  return { tint: [1, 1, 1], alpha: 1 };
}

/* ---------- Helpless: a white flag ---------- */

function createHelplessFx() {
  const container = newFxContainer();
  const g = new PIXI.Graphics();
  container.addChild(g);
  return { container, g };
}

/** Where the painted flag's cloth starts and the middle of its pole (fractions of its width), and how many strips the cloth is cut into. */
const FLAG_ART = { cloth: 34 / 292, pole: 20 / 292, strips: 48 };
let flagCut = null;

/**
 * The flag's picture cut (once) into the pole and narrow strips of cloth, each with where it starts
 * (x, in the picture's pixels) and how far along the cloth its middle is (u, 0 at the pole, 1 at the
 * free end). Null until the picture is loaded, or if it can't be cut.
 */
function flagTextures() {
  if (flagCut) return flagCut.pole ? flagCut : null;
  const tex = pictureTexture("flag");
  if (!tex) return null;
  try {
    const W = tex.width, H = tex.height, fx0 = tex.frame?.x ?? 0, fy0 = tex.frame?.y ?? 0, start = Math.round(W * FLAG_ART.cloth);
    const cut = (x0, x1) => new PIXI.Texture(tex.baseTexture, new PIXI.Rectangle(fx0 + x0, fy0, x1 - x0, H));
    const strips = Array.from({ length: FLAG_ART.strips }, (_, k) => {
      const x0 = start + Math.round((k * (W - start)) / FLAG_ART.strips);
      // a pixel wider than its share, so no seam shows between neighbours
      const x1 = Math.min(W, start + Math.round(((k + 1) * (W - start)) / FLAG_ART.strips) + 1);
      return { texture: cut(x0, x1), x: x0, u: ((x0 + x1) / 2 - start) / (W - start) };
    });
    flagCut = { pole: cut(0, start), strips, width: W, height: H };
  } catch (err) {
    console.warn("Primal Status | couldn't cut the flag picture, so it's drawn instead", err);
    flagCut = {};
  }
  return flagCut.pole ? flagCut : null;
}

/** The painted flag: the cloth ripples (more towards its free end), shaded where it turns away. */
function paintFlag(fx, cut, art, T) {
  const r = art.r, s = (PICTURE_ART.flag.length * r) / cut.height;
  const left = art.x - r * 0.88 - FLAG_ART.pole * cut.width * s, top = art.y - r * 1.1;
  if (!fx.flag) {
    const make = texture => { const sprite = new PIXI.Sprite(texture); fx.container.addChild(sprite); return sprite; };
    fx.flag = { pole: make(cut.pole), strips: cut.strips.map(strip => ({ ...strip, sprite: make(strip.texture) })) };
  }
  fx.flag.pole.position.set(left, top);
  fx.flag.pole.scale.set(s, s);
  for (const { sprite, x, u } of fx.flag.strips) {
    const phase = u * Math.PI * 2.2 - T * 5.5;
    sprite.position.set(left + x * s, top + r * 0.06 * u * Math.sin(phase));
    sprite.scale.set(s, s);
    const v = Math.round(255 * (1 - 0.22 * u * Math.max(0, Math.cos(phase))));
    sprite.tint = (v << 16) | (v << 8) | v;
  }
}

function updateHelplessFx(token, fx, { now }) {
  const H = PICTURE.helpless, art = artCircle(token);
  const r = art.r, T = now / 1000, g = fx.g;
  const w = lineWidthFor(r);
  const px = art.x - r * 0.8, base = art.y + r * 0.3, top = art.y - r * 0.98;
  g.clear();
  const cut = typeof PIXI.Texture === "function" && typeof PIXI.Rectangle === "function" && typeof PIXI.Sprite === "function" ? flagTextures() : null;
  if (cut) {
    paintFlag(fx, cut, art, T);
    return { tint: [1, 1, 1], alpha: 1 };
  }
  // the pole
  drawShape(g, [px - r * 0.02, top, px + r * 0.02, top, px + r * 0.02, base, px - r * 0.02, base], H.pole, w);
  // the cloth, rippling in the wind (more towards its free end)
  const len = r * 0.62, height = r * 0.38, n = 14;
  const wave = u => r * 0.05 * u * Math.sin(u * Math.PI * 2.2 - T * 5.5);
  const topEdge = [], bottomEdge = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n, x = px + r * 0.02 + len * u * (1 - 0.05 * (1 + Math.sin(T * 2.7 + u * 3)));
    topEdge.push([x, top + r * 0.05 + wave(u)]);
    bottomEdge.push([x, top + r * 0.05 + height * (1 - 0.1 * u) + wave(u) * 1.15]);
  }
  const cloth = [...topEdge, ...bottomEdge.slice().reverse()].flat();
  g.lineStyle(0).beginFill(H.cloth, 1).drawPolygon(cloth).endFill();
  // folds: shade where the cloth turns away
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n, shade = Math.max(0, Math.cos(u * Math.PI * 2.2 - T * 5.5)) * 0.28 * u;
    if (shade < 0.02) continue;
    g.beginFill(H.shade, shade).drawPolygon([...topEdge[k], ...topEdge[k + 1], ...bottomEdge[k + 1], ...bottomEdge[k]]).endFill();
  }
  g.lineStyle({ width: w, color: PICTURE.outline, alpha: 1, join: PIXI.LINE_JOIN?.ROUND ?? "round" }).drawPolygon(cloth);
  // the knob on top
  g.beginFill(H.knob, 1).drawCircle(px, top - r * 0.02, r * 0.04).endFill();
  return { tint: [1, 1, 1], alpha: 1 };
}
