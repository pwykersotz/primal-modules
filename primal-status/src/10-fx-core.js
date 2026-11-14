/* -------------------------------------------- */
/*  Token visual effects                        */
/*  - Mighty Guard: spectral rim, cracks, wisps */
/*  - Cover: drifting, swirling fog             */
/* -------------------------------------------- */

const FX = {
  auraColor: 0x6FE6FF,           // soft glow around the token
  rimColor: 0xA6F6FF,            // bright oval edge
  crackGlowColor: 0x38CFFF,      // halo around each crack
  crackCoreColor: 0xE6FFFF,      // bright centre line of each crack
  mistColor: 0x9FEFFF,           // pale shimmer over the token art
  wispColor: 0xD8FCFF,           // motes drifting upward
  ghostTint: [0.66, 0.9, 1.0],   // spectral blue tint applied to the art (0–1 RGB)
  ghostAlpha: [0.75, 0.9],       // art opacity range, so the creature looks slightly translucent
  crackCount: 9,                 // main cracks spreading in from the rim
  wispCount: 14
};

const FOG = {
  puffColor: 0xDCE3EA,           // soft grey-white fog banks
  tendrilColor: 0xF3F6F8,        // brighter swirling smoke streaks
  puffCount: 8,
  tendrilCount: 4,
  artTint: [0.82, 0.86, 0.92],   // art greyed slightly at full density (0–1 RGB)
  artAlpha: 0.82,                // art opacity at full density
  driftSeconds: 16               // roughly one slow swirl
};

const CHARM = {
  fill: 0xFF4F86,                // heart colour
  stroke: 0x7A1030,              // dark outline
  glow: 0xFF9CC2,                // soft pink glow
  count: 4,                      // hearts in flight at once
  cycleSeconds: 3.0,             // time for one heart to float up and fade
  size: 0.2,                     // heart width at full size, relative to the token
  beatsPerSecond: 1.6            // gentle heartbeat pulse
};

const SLEEP = {
  fill: ["#E4FFB8", "#5FE35A"],  // letter gradient, top → bottom
  stroke: "#0E4A14",             // dark green outline
  glow: "#8CFF6E",               // soft green glow
  count: 3,                      // Z's in flight at once
  cycleSeconds: 3.2,             // time for one Z to float up and fade
  size: 0.26                     // Z height at full size, relative to the token
};

/** How thick the fog is for each cover status (1 = densest). */
const COVER_DENSITY = { coverHalf: 0.65, coverThreeQuarters: 0.85, coverTotal: 1 };
const HIDING_FOG_DENSITY = 0.75;   // Hiding gets the cover fog too, between Half and Three-Quarters

/** Draw order of effect layers on a token (higher draws on top). */
// Counters (level gems) go on top of everything on the token, bars and status icons included.
// Stone goes under everything: it replaces the art itself.
const FX_RANK = { stone: -1, dodge: -0.5, guard: 0, bloodied: 0.1, exhaust: 0.2, valor: 0.29, drain: 0.3, focus: 0.5, haste: 1, slow: 1, contam: 1.6, fog: 2, prone: 2.1, invis: 2.2, curse: 2.4, madness: 2.3, fear: 2.5, immobilized: 2.9, entangled: 2.95, rope: 3, grapple: 3.2, bleed: 4, poison: 4, disease: 4.1, sickened: 4.3, burn: 5, arcs: 5.5, shocked: 5.6, frozen: 5.7, charm: 6, addled: 6.5, bewildered: 6.6, weakened: 6.61, clumsy: 6.62, enfeebled: 6.63, defenseless: 6.64, helpless: 6.65, staggered: 6.66, jinxed: 6.67, dazed: 6.68, distracted: 6.7, stun: 7, mark: 7.5, dying: 7.8, sleep: 8, counters: 100 };
const TOP_RANK = 100;

/** Token → { guard?: fx, fog?: fx } */
const effects = new Map();
let tickerAdded = false;
let lastTime = performance.now();

Hooks.on("canvasReady", () => {
  effects.clear();
  if (tickerAdded) return;
  canvas.app.ticker.add(fxTick, null, PIXI.UPDATE_PRIORITY.NORMAL);
  tickerAdded = true;
});

Hooks.on("canvasTearDown", () => effects.clear());

/* ---------- Shared helpers ---------- */

/** The token's own tint (normally white), as 0–1 RGB. */
function baseTint(token) {
  try { return foundry.utils.Color.from(token.document.texture.tint ?? 0xFFFFFF).rgb; }
  catch { return [1, 1, 1]; }
}

/** The opacity Foundry itself gives the token art. */
function baseAlpha(token) {
  return (token.alpha ?? 1) * (token.document.alpha ?? 1);
}

const clamp01 = v => Math.min(1, Math.max(0, v));

/**
 * Has this token been set to show no animations (its Token settings, Appearance tab)? Then it
 * looks as Foundry draws it: its own status icons, Foundry's Dead overlay and Foundry's invisibility.
 * Takes a token, a token document or a prototype token.
 */
function animationsOffFor(token) {
  const doc = token?.document ?? token;
  return moduleFlag(doc, "animations") === false;
}

/**
 * A flag this module keeps on a document. Flags set under an earlier module ID (enhanced-status-effects,
 * mighty-guard) are read from there when there's none under the current ID (the newest wins).
 */
function moduleFlag(doc, key) {
  const flags = doc?.flags;
  for (const id of [MODULE_ID, ...LEGACY_MODULE_IDS]) {
    const value = flags?.[id]?.[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function hashString(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function seededRandom(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newFxContainer() {
  const container = new PIXI.Container();
  container.eventMode = "none";
  container.interactiveChildren = false;
  return container;
}

function newBlur(strength, quality, blendMode) {
  const f = new PIXI.BlurFilter(strength, quality);
  if (blendMode !== undefined) f.blendMode = blendMode; // keep the blend mode through the blur
  return f;
}

/**
 * Put an effect container on the token. Foundry's "void" mesh cuts the token's silhouette
 * out of everything drawn before it, so effects must sit just above it (but below bars and
 * status icons). Effects are ordered among themselves by FX_RANK.
 */
function insertFx(token, container, rank) {
  container._mgRank = rank;
  if (rank >= TOP_RANK) { token.addChild(container); return; }
  const voidMesh = token.voidMesh;
  let index = (voidMesh && voidMesh.parent === token) ? token.getChildIndex(voidMesh) + 1 : token.children.length;
  while (index < token.children.length && (token.children[index]._mgRank ?? Infinity) <= rank) index++;
  token.addChildAt(container, index);
}

function destroyFx(fx) {
  try { fx.onDestroy?.(); } catch { /* token already gone */ }
  if (!fx.container.destroyed) fx.container.destroy({ children: true });
  for (const f of Object.values(fx.blurs ?? {})) { try { f.destroy(); } catch { /* already gone */ } }
}

/* ---------- Status checks ---------- */

/** Is this status ID a cover status? (dnd5e: coverHalf, coverThreeQuarters, coverTotal; also e.g. "half-cover") */
function isCoverStatus(id) {
  return typeof id === "string" && (/^cover/i.test(id) || /[^a-zA-Z]cover/i.test(id) || /[a-z]Cover/.test(id));
}

/*
 * Per-frame caches. The animation loop asks every token about every animation (around 30 checks)
 * each frame; while it runs, each actor's statuses and the settings it reads are worked out once per
 * frame. Outside the loop (rolls, hooks, windows) everything is worked out fresh, so a change made
 * a moment ago is never missed.
 */
const frameCache = { active: false, frame: 0, actors: new WeakMap(), settings: new Map() };

function cacheEntry(actor) {
  if (!frameCache.active || !actor || typeof actor !== "object") return null;
  let entry = frameCache.actors.get(actor);
  if (!entry || entry.frame !== frameCache.frame) {
    entry = { frame: frameCache.frame, ids: null, active: null };
    frameCache.actors.set(actor, entry);
  }
  return entry;
}

/** A module setting (read once per frame while the animation loop runs). */
function settingValue(key) {
  const read = () => { try { return game.settings.get(MODULE_ID, key); } catch { return undefined; } };
  if (!frameCache.active) return read();
  if (!frameCache.settings.has(key)) frameCache.settings.set(key, read());
  return frameCache.settings.get(key);
}

function computeStatusIds(actor) {
  const ids = new Set(actor?.statuses ?? []);
  // Not effects that are off, or suppressed (e.g. expired: Foundry 14 keeps those on the actor)
  for (const e of actor?.effects ?? []) if (!e.disabled && !e.isSuppressed) for (const s of e.statuses ?? []) ids.add(s);
  return ids;
}

/** All status IDs currently on an actor (callers must not change the set). */
function actorStatusIds(actor) {
  const entry = cacheEntry(actor);
  if (!entry) return computeStatusIds(actor);
  return entry.ids ??= computeStatusIds(actor);
}

/** Statuses from the actor and its active, unsuppressed effects (what hasStatus checks). */
function activeStatusIds(actor) {
  const ids = new Set(actor?.statuses ?? []);
  for (const effect of actor?.effects ?? []) {
    if (effect.disabled || effect.active === false || effect.isSuppressed) continue;
    for (const s of effect.statuses ?? []) ids.add(s);
  }
  return ids;
}

/** Is the token, with room for its effects (Z's, auras), anywhere on screen? */
function tokenOnScreen(token) {
  const wt = canvas?.stage?.worldTransform, screen = canvas?.app?.renderer?.screen;
  if (!wt || !screen || !Number.isFinite(wt.a) || !(screen.width > 0)) return true;
  const x = Number(token.x) || 0, y = Number(token.y) || 0, w = Number(token.w) || 0, h = Number(token.h) || 0;
  const m = Math.max(w, h) * 1.5;
  const left = wt.a * (x - m) + wt.tx, right = wt.a * (x + w + m) + wt.tx;
  const top = wt.d * (y - m) + wt.ty, bottom = wt.d * (y + h + m) + wt.ty;
  return right >= screen.x && left <= screen.x + screen.width && bottom >= screen.y && top <= screen.y + screen.height;
}

/**
 * Blurs are the costliest part of the animations on the graphics card. Reduced quality draws them
 * in a single pass at half resolution. Full and Still leave every blur exactly as the effect made
 * it: rendered at half resolution, slow soft movement (drifting fog, turning glows) steps in
 * two-pixel jumps and looks like stuttering, so that's only done when a player chooses Reduced.
 */
function tuneBlur(filter, mode) {
  if (!filter || typeof filter.blur !== "number") return;
  // What the effect gave it (a resolution of null means "the screen's own")
  if (!filter._mgBase) filter._mgBase = { resolution: filter.resolution, quality: filter.quality };
  const base = filter._mgBase;
  if (mode === "reduced") {
    const res = (Number(base.resolution) || Number(canvas?.app?.renderer?.resolution) || 1) * 0.5;
    if (filter.resolution !== res) filter.resolution = res;
    if (filter.quality !== 1) filter.quality = 1;
  } else {
    if (filter.resolution !== base.resolution) filter.resolution = base.resolution;
    if (filter.quality !== base.quality) filter.quality = base.quality;
  }
}

let reducedMotionQuery = null;   // the system's "reduce motion" preference (looked up once; it updates itself)

/** Full, Reduced or Still: the player's choice, or Still when their system asks for reduced motion. */
function animationMode() {
  const choice = settingValue("animationQuality") ?? "auto";
  if (choice === "full" || choice === "reduced" || choice === "still") return choice;
  try {
    reducedMotionQuery ??= globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    if (reducedMotionQuery?.matches) return "still";
  } catch { /* no media queries */ }
  return "full";
}

/** Fog density for an actor's cover (0 = no cover). */
function coverDensity(actor) {
  if (!actor) return 0;
  let density = 0;
  for (const id of actorStatusIds(actor)) {
    if (!isCoverStatus(id)) continue;
    density = Math.max(density, COVER_DENSITY[id] ?? 0.85);
  }
  return density;
}

/** Is the actor Hiding? (dnd5e: "hiding"; also e.g. pf2e's "hidden", optionally prefixed) */
function isHidingForFog(actor) {
  return hasStatusMatching(actor, /(^|[^a-z])(hiding|hidden)$/i);
}

/** Fog density for cover and Hiding (0 = no fog); the thicker one wins when both apply. */
function fogDensity(actor) {
  if (!actor) return 0;
  return Math.max(coverDensity(actor), isHidingForFog(actor) ? HIDING_FOG_DENSITY : 0);
}

const isUnconscious = actor => hasStatusMatching(actor, /(^|[^a-z])unconscious$/i);
const isPetrified = actor => hasStatusMatching(actor, /(^|[^a-z])petrified$/i);
const isParalyzed = actor => hasStatusMatching(actor, /(^|[^a-z])paraly[sz]ed$/i);
const isDiseased = actor => hasStatusMatching(actor, /(^|[^a-z])diseased?$/i);
/**
 * Incapacitated, unless it comes with a condition that has its own animation (dnd5e's Paralyzed,
 * Petrified, Stunned and Unconscious all make a creature Incapacitated too).
 */
const isCursed = actor => hasStatusMatching(actor, /(^|[^a-z])cursed$/i);
const isMarked = actor => hasStatusMatching(actor, /(^|[^a-z])marked$/i);
const isBloodied = actor => hasStatusMatching(actor, /(^|[^a-z])bloodied$/i);
const isProne = actor => hasStatusMatching(actor, /(^|[^a-z])prone$/i);
const isDodging = actor => hasStatusMatching(actor, /(^|[^a-z])dodg(e|ing)$/i);
const isIncapacitatedOnly = actor => hasStatusMatching(actor, /(^|[^a-z])incapacitated$/i)
  && !isParalyzed(actor) && !isPetrified(actor) && !isUnconscious(actor) && !hasStatusMatching(actor, /(^|[^a-z])stunned$/i);

/** Is the actor asleep? (dnd5e: "sleeping"; also "asleep"/"sleep", optionally prefixed) */
function isSleeping(actor) {
  if (!actor) return false;
  for (const id of actorStatusIds(actor)) {
    if (typeof id === "string" && /(^|[^a-z])a?sleep(ing)?$/i.test(id)) return true;
  }
  return false;
}

/** Does the actor have a status whose ID matches the pattern (optionally prefixed, e.g. "pf2e.stunned")? */
function hasStatusMatching(actor, pattern) {
  if (!actor) return false;
  const ids = actorStatusIds(actor);
  if (!ids.size) return false;
  for (const id of ids) if (typeof id === "string" && pattern.test(id)) return true;
  return false;
}

const isBleeding = actor => hasStatusMatching(actor, /(^|[^a-z])bleed(ing)?$/i);
const isPoisoned = actor => hasStatusMatching(actor, /(^|[^a-z])poison(ed)?$/i);
const isBurning = actor => hasStatusMatching(actor, /(^|[^a-z])(burning|on-?fire|aflame|ignited)$/i);
const isGrappled = actor => hasStatusMatching(actor, /(^|[^a-z])grappled$/i);
const isRestrained = actor => hasStatusMatching(actor, /(^|[^a-z])restrained$/i);
const isStunned = actor => hasStatusMatching(actor, /(^|[^a-z])stunned$/i);
const isConcentrating = actor => hasStatusMatching(actor, /(^|[^a-z])concentrat(ing|ion)$/i);
const isFrightened = actor => hasStatusMatching(actor, /(^|[^a-z])(frightened|afraid|scared)$/i);

const CONTAM_PATTERN = /(^|[^a-z])contaminat(ion|ed)$/i;
const EXHAUST_PATTERN = /(^|[^a-z])exhaust(ion|ed)$/i;

/**
 * The level of a leveled status on an actor (0 if it doesn't have it): dnd5e 6 keeps it in the
 * effect's `system.level`, older dnd5e in a flag, this module's own fallback in a flag; a
 * matching status without a level counts as 1.
 */
function statusLevel(actor, pattern, max) {
  if (!actor || !hasStatusMatching(actor, pattern)) return 0;
  let level = 0;
  for (const effect of actor.effects ?? []) {
    if (effect.disabled || effect.active === false) continue;
    if (![...(effect.statuses ?? [])].some(s => typeof s === "string" && pattern.test(s))) continue;
    const n = Number(effect.system?.level ?? moduleFlag(effect, "level") ?? effect.flags?.dnd5e?.exhaustionLevel ?? 1);
    level = Math.max(level, Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);
  }
  // A status the actor has without a matching effect of its own (e.g. granted by another effect)
  if (!level && [...(actor.statuses ?? [])].some(s => typeof s === "string" && pattern.test(s))) level = 1;
  return Math.min(max, level);
}

/** Contamination level, 0–6 (Monsters of Drakkenheim). */
const contaminationLevel = actor => statusLevel(actor, CONTAM_PATTERN, CONTAM_MAX);

/** Exhaustion level (dnd5e keeps it on the actor as well as on the effect). */
function exhaustionLevel(actor) {
  const fromActor = Number(actor?.system?.attributes?.exhaustion);
  if (Number.isFinite(fromActor) && fromActor > 0) return Math.min(9, Math.floor(fromActor));
  return statusLevel(actor, EXHAUST_PATTERN, 9);
}

/** Is the actor charmed? (dnd5e: "charmed") */
function isCharmed(actor) {
  if (!actor) return false;
  for (const id of actorStatusIds(actor)) {
    if (typeof id === "string" && /(^|[^a-z])charmed$/i.test(id)) return true;
  }
  return false;
}

/** Has a status (by ID) or an active effect with a matching name (e.g. dnd5e's "Hasted" spell effect)? */
function hasStatusOrNamedEffect(actor, ids, namePattern) {
  if (!actor) return false;
  const statuses = actorStatusIds(actor);
  if (ids.some(id => statuses.has(id))) return true;
  return actor.effects?.some(e => (e.active ?? !e.disabled) && namePattern.test(e.name ?? "")) ?? false;
}

const isHasted = actor => hasStatusOrNamedEffect(actor, [HASTE_ID, "haste"], /^hasted?$/i);
const isSlowed = actor => hasStatusOrNamedEffect(actor, [SLOW_ID, "slow", "drakkenheimSlowed"], /^slow(ed)?$/i);

