/* ---------- Invisible: a whirl of air (Hiding as well: gone) ---------- */

/*
 * An Invisible creature shows only as a whirl of air, to everyone (the GM and its owners too):
 * the swirl where it stands, which players can target, but not its token art, name, bars,
 * conditions or other effects. Looking through a creature that can perceive it (Truesight,
 * Blindsight, See Invisibility...; for the GM, one they've selected), the creature shows in full
 * with the whirl around it. One that is also Hiding has no whirl: players can't see or target it
 * at all (Foundry's own invisibility), and the GM and owners only find it by hovering or selecting.
 */
const AIR = {
  streak: 0xF2F7FF,        // pale air streaks
  shadow: 0x1A2230,        // soft shade under the vortex, so it reads on light maps
  dustLight: 0xE9E1CF,     // dust and grit caught in the swirl
  dustDark: 0x6E604C,
  lapSeconds: [2.4, 3.6, 5.2],   // inner, middle and outer rings
  motes: 18
};

const INVISIBLE_ID = () => CONFIG.specialStatusEffects?.INVISIBLE ?? "invisible";
const REVEAL_TO_GM = new Set(["fog"]);   // effects the GM still sees on an Invisible and Hiding creature
const whirlEnabled = () => !!settingValue("invisibleWhirl");
const isInvisibleActor = actor => hasStatus(actor, INVISIBLE_ID()) || hasStatus(actor, "invisible");
const isHidingActor = actor => hasStatus(actor, "hiding");

function docHas(doc, id) {
  try { if (doc?.hasStatusEffect?.(id)) return true; } catch { /* older API */ }
  return hasStatus(doc?.actor, id);
}
const docInvisible = doc => docHas(doc, INVISIBLE_ID()) || docHas(doc, "invisible");
const isEtherealActor = actor => hasStatus(actor, "ethereal");
const docEthereal = doc => docHas(doc, "ethereal");
/** Unseen the way an Invisible creature is: Invisible, or Ethereal (from the material plane). */
const isUnseenActor = actor => isInvisibleActor(actor) || isEtherealActor(actor);
const docUnseen = doc => docInvisible(doc) || docEthereal(doc);

/**
 * Can this creature (observer token) perceive the unseen one: see through its invisibility (Truesight,
 * Blindsight, See Invisibility...) and, if it's Ethereal, see into the Ethereal Plane (Truesight,
 * See Invisibility, or being Ethereal itself)?
 */
function perceivesUnseenToken(obs, token) {
  if (isEtherealActor(token.actor) && !seesEthereal(obs.actor, obs, token)) return false;
  if (isInvisibleActor(token.actor) && !perceivesWithoutSight(obs.actor, obs, token.actor, token, { invisible: true })) return false;
  return true;
}

/** The tokens this user looks through: the ones they control, else all they own on the scene. */
function userObservers() {
  const controlled = (canvas?.tokens?.controlled ?? []).filter(t => t.actor);
  if (controlled.length) return controlled;
  return (canvas?.tokens?.placeables ?? []).filter(t => t.isOwner && t.actor);
}

/**
 * Can one of this user's creatures perceive the unseen creature anyway? The GM owns everything,
 * so for the GM only the creatures they've selected count.
 */
function userPerceivesUnseen(token, { controlledOnly = !!game.user?.isGM } = {}) {
  const observers = controlledOnly ? (canvas?.tokens?.controlled ?? []).filter(t => t.actor) : userObservers();
  for (const obs of observers) {
    if (obs === token) continue;
    if (perceivesUnseenToken(obs, token)) return true;
  }
  return false;
}

/**
 * How this user sees an Invisible creature: "perceived" (in full, with the whirl), "perceived-hidden"
 * (in full, no whirl), "whirl" (only the whirl) or "gone" (nothing).
 */
function invisibleViewMode(token) {
  const hiding = isHidingActor(token.actor);
  if (userPerceivesUnseen(token)) return hiding ? "perceived-hidden" : "perceived";
  return hiding ? "gone" : "whirl";
}

function createInvisFx(token) {
  const container = newFxContainer();
  const blurs = { shadow: newBlur(8, 3), haze: newBlur(8, 3), streak: newBlur(1.5, 2) };
  const shadow = new PIXI.Graphics(); shadow.filters = [blurs.shadow];
  const haze = new PIXI.Graphics(); haze.filters = [blurs.haze];
  const rings = AIR.lapSeconds.map(() => { const g = new PIXI.Graphics(); g.filters = [blurs.streak]; return g; });
  const motes = new PIXI.Graphics();
  container.addChild(shadow, haze, ...rings, motes);
  const rand = seededRandom(hashString(`${token.id ?? ""}:whirl`));
  const moteData = Array.from({ length: AIR.motes }, () => ({
    angle: rand() * Math.PI * 2, radius: 0.25 + rand() * 0.7, speed: 0.7 + rand() * 0.9, wobble: rand() * Math.PI * 2,
    size: 0.012 + rand() * 0.016, dark: rand() < 0.45
  }));
  // The Ethereal shimmer is added (after the air's parts) the first time the creature is Ethereal
  const fx = { container, blurs, shadow, haze, rings, motes, moteData, seed: hashString(`${token.id ?? ""}:air`), drawnKey: "", concealed: false, reveal: null, ether: null };
  const placeable = token.placeable;
  fx.onDestroy = () => restoreTokenUI(placeable);
  return fx;
}

/** Air streaks: tapered arcs, bright at the head and fading to the tail. */
function drawAirRing(g, r, ring, seed) {
  g.clear();
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  const rand = seededRandom(seed + ring * 101);
  const count = 3;
  for (let k = 0; k < count; k++) {
    const radius = r * ((0.3 + ring * 0.27) + (rand() - 0.5) * 0.08);
    const start = (k / count) * Math.PI * 2 + rand() * 0.8;
    const span = 1.1 + rand() * 1.2;
    const width = r * (0.1 - ring * 0.016);
    const steps = 18;
    let px = Math.cos(start) * radius, py = Math.sin(start) * radius;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const a = start - span * t;                       // trails behind the direction of spin
      const rr = radius * (1 + 0.06 * t);               // spirals slightly outward along the tail
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      const fade = Math.pow(1 - t, 1.3);
      g.lineStyle({ width: Math.max(0.8, width * (0.25 + 0.75 * fade)), color: AIR.streak, alpha: 0.9 * fade, cap: round });
      g.moveTo(px, py); g.lineTo(x, y);
      px = x; py = y;
    }
  }
}

function updateInvisFx(token, fx, { now, zoom }) {
  const placeable = token.placeable;
  const mode = placeable ? invisibleViewMode(placeable) : "whirl";
  const art = artCircle(token);
  const r = art.r, T = now / 1000;
  const showWhirl = mode === "whirl" || mode === "perceived";   // never while Hiding
  const wasConcealed = fx.concealed;
  fx.concealed = mode === "whirl" || mode === "gone";
  // Invisible and Hiding: the GM alone still sees the Hiding fog, so they know where it is
  fx.reveal = mode === "gone" && game.user?.isGM ? REVEAL_TO_GM : null;
  if (wasConcealed && !fx.concealed && placeable) restoreTokenUI(placeable);   // e.g. a seer was selected

  const key = `${Math.round(r * 4)}`;
  if (fx.drawnKey !== key) {
    fx.rings.forEach((g, i) => drawAirRing(g, r, i, fx.seed));
    fx.shadow.clear();
    fx.shadow.beginFill(AIR.shadow, 1).drawCircle(0, 0, r * 0.75).endFill();
    fx.haze.clear();
    fx.haze.beginFill(AIR.streak, 1).drawCircle(0, 0, r * 0.6).endFill();
    fx.drawnKey = key;
  }
  fx.blurs.shadow.blur = Math.max(1, r * 0.25 * zoom);
  fx.blurs.haze.blur = Math.max(1, r * 0.3 * zoom);
  fx.blurs.streak.blur = Math.max(0.5, r * 0.012 * zoom);

  const strength = mode === "whirl" ? 1 : 0.8;   // a little softer over the creature's art
  // An Ethereal creature shimmers instead (also when it's Invisible as well)
  const ethereal = isEtherealActor(token.actor);
  const showAir = showWhirl && !ethereal;
  fx.shadow.position.set(art.x, art.y);
  fx.shadow.alpha = showAir ? 0.2 * strength * (0.85 + 0.15 * Math.sin(T * 1.7)) : 0;
  fx.haze.position.set(art.x, art.y);
  fx.haze.alpha = showAir ? 0.1 * strength * (0.8 + 0.2 * Math.sin(T * 1.1)) : 0;
  fx.rings.forEach((g, i) => {
    g.position.set(art.x, art.y);
    g.rotation = (T / AIR.lapSeconds[i]) * Math.PI * 2 + i * 1.9;
    g.scale.set(1 + 0.04 * Math.sin(T * (1.3 + i * 0.4) + i));
    g.alpha = showAir ? strength * (0.7 + 0.2 * Math.sin(T * (0.9 + i * 0.5) + i * 2)) : 0;
  });
  if (ethereal || fx.ether) updateEtherShimmer(fx, art, T, zoom, showWhirl && ethereal, strength);

  // Dust and grit circling and bobbing in and out
  const m = fx.motes;
  m.clear();
  if (showAir) {
    for (const d of fx.moteData) {
      const a = d.angle + T * d.speed * 2.2;
      const rad = r * d.radius * (0.85 + 0.15 * Math.sin(T * 1.9 + d.wobble));
      const x = art.x + Math.cos(a) * rad, y = art.y + Math.sin(a) * rad;
      const alpha = strength * (0.45 + 0.4 * Math.sin(T * 2.3 + d.wobble) ** 2);
      m.beginFill(d.dark ? AIR.dustDark : AIR.dustLight, alpha).drawCircle(x, y, Math.max(0.6, r * d.size)).endFill();
    }
  }

  if (fx.concealed && placeable) hideTokenUI(placeable);
  // The creature itself shows only to those who can perceive it (an Ethereal one a little cold and pale)
  const seen = mode.startsWith("perceived");
  return { tint: seen && ethereal ? ETHER.tint : [1, 1, 1], alpha: seen ? 1 : 0 };
}

/* ---------- Ethereal: a ghostly shimmer ---------- */

/*
 * Where an Ethereal creature stands, a cold blue glow breathes, faint violet ripples spread out as
 * if through still water, pale wisps rise and sway, and specks of light twinkle. It's unseen the
 * same way as an Invisible creature (see above); only the look differs from the whirl of air.
 */
const ETHER = {
  glow: 0x9DBEFF,          // cold blue glow
  ripple: 0xC2B4FF,        // faint violet ripples
  wisp: 0xE2ECFF,          // pale rising wisps
  glint: 0xF6F9FF,         // twinkling specks
  tint: [0.84, 0.9, 1],    // the creature's art, when it can be seen: a little cold and pale
  wisps: 7,
  glints: 10,
  rippleSeconds: 3.4,      // each ripple spreading out and fading
  riseSeconds: 3.6         // each wisp rising and fading
};

function createEtherParts(fx) {
  fx.blurs.etherGlow = newBlur(8, 3);
  fx.blurs.etherWisp = newBlur(2, 2);
  const group = new PIXI.Container();
  const glow = new PIXI.Graphics(); glow.filters = [fx.blurs.etherGlow];
  const ripples = new PIXI.Graphics();
  const wisps = new PIXI.Graphics(); wisps.filters = [fx.blurs.etherWisp];
  const glints = new PIXI.Graphics();
  group.addChild(glow, ripples, wisps, glints);
  fx.container.addChild(group);
  const rand = seededRandom((fx.seed ^ 0x5EED) >>> 0);
  const wispData = Array.from({ length: ETHER.wisps }, (_, i) => ({
    x: (i / (ETHER.wisps - 1)) * 1.2 - 0.6 + (rand() - 0.5) * 0.12, phase: rand(), speed: 0.85 + rand() * 0.3,
    sway: rand() * Math.PI * 2, len: 0.32 + rand() * 0.22
  }));
  const glintData = Array.from({ length: ETHER.glints }, () => {
    const a = rand() * Math.PI * 2, d = 0.15 + Math.sqrt(rand()) * 0.75;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, phase: rand() * Math.PI * 2, speed: 1.1 + rand() * 1.5, size: 0.012 + rand() * 0.01 };
  });
  return (fx.ether = { group, glow, ripples, wisps, glints, wispData, glintData, drawnKey: "" });
}

function updateEtherShimmer(fx, art, T, zoom, show, strength) {
  const e = fx.ether ?? createEtherParts(fx);
  e.group.visible = show;
  if (!show) return;
  const r = art.r;
  const key = `${Math.round(r * 4)}`;
  if (e.drawnKey !== key) {
    e.glow.clear();
    e.glow.lineStyle({ width: r * 0.2, color: ETHER.glow, alpha: 1 });
    e.glow.drawCircle(0, 0, r * 0.88);
    e.glow.lineStyle(0);
    e.glow.beginFill(ETHER.glow, 0.3).drawCircle(0, 0, r * 0.62).endFill();
    e.drawnKey = key;
  }
  fx.blurs.etherGlow.blur = Math.max(1, r * 0.2 * zoom);
  fx.blurs.etherWisp.blur = Math.max(0.5, r * 0.025 * zoom);
  e.glow.position.set(art.x, art.y);
  e.glow.alpha = strength * (0.34 + 0.1 * Math.sin(T * 1.3));
  e.glow.scale.set(1 + 0.025 * Math.sin(T * 0.9));

  // Ripples spreading out from the centre and fading
  const g = e.ripples;
  g.clear();
  for (let k = 0; k < 2; k++) {
    const p = (T / ETHER.rippleSeconds + k / 2) % 1;
    const alpha = strength * 0.5 * Math.sin(Math.PI * p) * (1 - p);
    if (alpha < 0.01) continue;
    g.lineStyle({ width: Math.max(0.8, r * 0.028 * (1 - 0.6 * p)), color: ETHER.ripple, alpha });
    g.drawCircle(art.x, art.y, r * (0.3 + 0.8 * p));
  }

  // Wisps rising and swaying, like breath in cold air
  const w = e.wisps;
  w.clear();
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  for (const d of e.wispData) {
    const life = (T * d.speed / ETHER.riseSeconds + d.phase) % 1;
    const fade = Math.sin(Math.PI * life);
    if (fade < 0.03) continue;
    const bx = art.x + d.x * r, by = art.y + r * (0.5 - 1.1 * life), len = r * d.len;
    let px = bx, py = by;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const x = bx + Math.sin(T * 1.6 + d.sway + t * 3) * r * 0.07 * t, y = by - len * t;
      w.lineStyle({ width: Math.max(0.7, r * 0.05 * (1 - 0.8 * t)), color: ETHER.wisp, alpha: strength * 0.5 * fade * (1 - 0.7 * t), cap: round });
      w.moveTo(px, py); w.lineTo(x, y);
      px = x; py = y;
    }
  }

  // Specks of light twinkling in and out
  const s = e.glints;
  s.clear();
  for (const d of e.glintData) {
    const twinkle = Math.max(0, Math.sin(T * d.speed + d.phase)) ** 6;
    if (twinkle < 0.03) continue;
    const x = art.x + d.x * r, y = art.y + d.y * r, size = Math.max(0.8, r * d.size * (0.6 + twinkle));
    s.lineStyle(0);
    s.beginFill(ETHER.glint, strength * 0.9 * twinkle).drawCircle(x, y, size).endFill();
    s.lineStyle({ width: Math.max(0.5, size * 0.4), color: ETHER.glint, alpha: strength * 0.6 * twinkle });
    s.moveTo(x - size * 2.6, y); s.lineTo(x + size * 2.6, y);
    s.moveTo(x, y - size * 2.6); s.lineTo(x, y + size * 2.6);
  }
}

/** Keep an unseen creature's name, bars, condition icons and elevation out of sight. */
function hideTokenUI(token) {
  for (const part of ["nameplate", "bars", "effects", "tooltip"]) {
    const obj = token?.[part];
    if (obj && !obj.destroyed) obj.visible = false;
  }
}

function restoreTokenUI(token) {
  if (!token || token.destroyed) return;
  const known = token.constructor?.RENDER_FLAGS ?? {};
  const flags = {};
  for (const f of ["refreshNameplate", "refreshBars", "refreshEffects", "refreshTooltip", "refreshState", "refreshVisibility"]) if (f in known) flags[f] = true;
  try { token.renderFlags?.set(flags); } catch { /* not critical */ }
  for (const part of ["nameplate", "bars", "effects", "tooltip"]) {
    const obj = token[part];
    if (obj && !obj.destroyed && !("refreshNameplate" in known)) obj.visible = true;
  }
}

/** Re-test which tokens each user can see (after Hiding or Invisible changes). */
function refreshTokenVisibility() {
  try { canvas?.perception?.update?.({ refreshVision: true }); } catch { /* not critical */ }
  for (const token of canvas?.tokens?.placeables ?? []) {
    try { if ("refreshVisibility" in (token.constructor?.RENDER_FLAGS ?? {})) token.renderFlags.set({ refreshVisibility: true }); }
    catch { /* not critical */ }
  }
}

/**
 * Sight (basic sight and light perception) can't detect an Invisible token in Foundry. Let it
 * detect one that isn't Hiding (so players see its whirl and can target it), unless the viewer
 * is Blinded or something else (burrowing) still stops it.
 */
function installInvisibilityWrappers() {
  for (const id of ["basicSight", "lightPerception"]) {
    const mode = CONFIG.Canvas?.detectionModes?.[id];
    if (typeof mode?._canDetect !== "function") continue;
    try { wrap(`CONFIG.Canvas.detectionModes.${id}._canDetect`, function (wrapped, visionSource, target) {
      const result = wrapped(visionSource, target);
      try {
        const tgt = target?.document;
        if (tgt?.documentName !== "Token") return result;
        const src = visionSource?.object?.document;
        // Ethereal creatures see each other normally; from the material plane one is unseen like an Invisible creature
        const ethereal = docEthereal(tgt) && !docEthereal(src);
        if (!ethereal && !docInvisible(tgt)) return result;
        // Foundry's own invisibility (also for a token set to show no animations: it has no whirl)
        if (!whirlEnabled() || animationsOffFor(tgt)) return ethereal ? false : result;
        if (isHidingActor(tgt.actor)) return false;                     // and Hiding: gone
        if (result) return true;                                        // seen as a whirl
        if (docHas(src, CONFIG.specialStatusEffects?.BLIND ?? "blinded")) return result;
        const burrow = CONFIG.specialStatusEffects?.BURROW;
        if (this.walls && burrow && (docHas(src, burrow) || docHas(tgt, burrow))) return result;
        return true;
      } catch { return result; }
    }); } catch (err) { console.warn(`${MODULE_ID} | Could not let sight see Invisible creatures as a whirl`, err); }
  }
  // See Invisibility also sees into the Ethereal Plane
  const seeInvisibility = CONFIG.Canvas?.detectionModes?.seeInvisibility;
  if (typeof seeInvisibility?._canDetect === "function") {
    try { wrap("CONFIG.Canvas.detectionModes.seeInvisibility._canDetect", function (wrapped, visionSource, target) {
      const result = wrapped(visionSource, target);
      if (result) return result;
      try {
        const tgt = target?.document, src = visionSource?.object?.document;
        return tgt?.documentName === "Token" && docEthereal(tgt) && !docHas(src, CONFIG.specialStatusEffects?.BLIND ?? "blinded");
      } catch { return result; }
    }); } catch (err) { console.warn(`${MODULE_ID} | Could not let See Invisibility see Ethereal creatures`, err); }
  }
  installEtherealVision();
  // Without token vision Foundry shows every token; an Invisible and Hiding one should still be gone
  if (CONFIG.Token?.objectClass) wrapGetter("CONFIG.Token.objectClass.prototype.isVisible", function (wrapped) {
    const visible = wrapped();
    if (!visible || !whirlEnabled() || game.user?.isGM || canvas?.visibility?.tokenVision || animationsOffFor(this)) return visible;
    try {
      if (!docUnseen(this.document) || !isHidingActor(this.actor)) return visible;
      if (this.isOwner || this.controlled || userPerceivesUnseen(this, { controlledOnly: false })) return visible;
      return false;
    } catch { return visible; }
  });
}


/* ---------- Ethereal: grey vision, 60 ft ---------- */

/*
 * A creature on the Ethereal Plane sees the material plane in shades of grey and can't see more
 * than 60 feet into it (2024 rules). Its vision source is made monochromatic and capped at 60 ft,
 * for darkness and lit areas alike, and it can't detect creatures beyond that.
 */
const ETHEREAL_RANGE_FEET = 60;
const etherealVisionEnabled = () => !!settingValue("etherealVision");

/** 60 ft in the scene's units (18 if the scene is measured in metres). */
function etherealRangeUnits() {
  const units = String(canvas?.scene?.grid?.units ?? canvas?.scene?.gridUnits ?? canvas?.dimensions?.units ?? "ft").trim();
  return /^m(et(er|re)s?)?\.?$/i.test(units) ? 18 : ETHEREAL_RANGE_FEET;
}

/** The ethereal sight limit in pixels for this token (as Foundry measures sight: from its edge). */
function etherealRangePx(token) {
  const units = etherealRangeUnits();
  if (typeof token?.getLightRadius === "function") return token.getLightRadius(units);
  const d = canvas?.dimensions;
  return d ? units * (d.distancePixels ?? (d.size / d.distance)) : Infinity;
}

/** Limit a vision source's data to grey, 60 ft vision. */
function applyEtherealVision(token, data) {
  const max = etherealRangePx(token);
  if (!Number.isFinite(max)) return data;
  data.radius = Math.min(Number.isFinite(data.radius) ? data.radius : Infinity, max);
  data.lightRadius = Math.min(Number.isFinite(data.lightRadius) ? data.lightRadius : Infinity, max);
  if (CONFIG.Canvas?.visionModes?.monochromatic) data.visionMode = "monochromatic";
  data.saturation = -1;
  return data;
}

function installEtherealVision() {
  const proto = CONFIG.Token?.objectClass?.prototype;
  if (typeof proto?._getVisionSourceData === "function") {
    try { wrap("CONFIG.Token.objectClass.prototype._getVisionSourceData", function (wrapped, ...args) {
      const data = wrapped(...args);
      try { if (data && etherealVisionEnabled() && isEtherealActor(this.actor)) applyEtherealVision(this, data); }
      catch (err) { console.warn(`${MODULE_ID} | Could not limit Ethereal vision`, err); }
      return data;
    }); } catch (err) { console.warn(`${MODULE_ID} | Could not wrap token vision for Ethereal creatures`, err); }
  }
  // Nothing beyond 60 ft can be detected from the Ethereal Plane, by any sense
  const path = foundry.canvas?.perception?.DetectionMode ? "foundry.canvas.perception.DetectionMode.prototype._testRange"
    : (globalThis.DetectionMode ? "DetectionMode.prototype._testRange" : null);
  if (path && typeof foundry.utils.getProperty(globalThis, path) === "function") {
    try { wrap(path, function (wrapped, visionSource, mode, target, test) {
      const inRange = wrapped(visionSource, mode, target, test);
      if (!inRange) return inRange;
      try {
        const viewer = visionSource?.object;
        if (!viewer || !etherealVisionEnabled() || !isEtherealActor(viewer.actor) || !test?.point) return inRange;
        const max = etherealRangePx(viewer);
        const dx = test.point.x - visionSource.x, dy = test.point.y - visionSource.y;
        return (dx * dx) + (dy * dy) <= max * max;
      } catch { return inRange; }
    }); } catch (err) { console.warn(`${MODULE_ID} | Could not limit Ethereal detection range`, err); }
  }
}

/** A token became or stopped being Ethereal: rebuild vision so the grey 60 ft limit applies or lifts. */
function refreshEtherealVision() {
  for (const token of canvas?.tokens?.placeables ?? []) {
    try { if (token.vision || token.hasSight) token.initializeVisionSource?.(); } catch { /* not critical */ }
  }
  for (const flag of ["initializeVision", "initializeVisionModes", "refreshVision", "refreshLighting"]) {
    try { canvas?.perception?.update?.({ [flag]: true }); } catch { /* not in this Foundry version */ }
  }
  refreshTokenVisibility();
}

// Hiding or turning invisible changes who can see the token
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
  Hooks.on(hook, effect => {
    const statuses = [...(effect?.statuses ?? [])];
    if (statuses.some(s => s === "hiding" || s === INVISIBLE_ID() || s === "invisible" || s === "ethereal")) setTimeout(refreshTokenVisibility, 0);
    if (statuses.includes("ethereal")) setTimeout(refreshEtherealVision, 0);
  });
}

/** Rebuild one kind of effect on every token (e.g. after its settings change). */
function resetFxKind(kind) {
  for (const state of effects.values()) {
    if (!state[kind]) continue;
    destroyFx(state[kind]);
    delete state[kind];
  }
}

