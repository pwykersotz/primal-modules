/* ---------- Driver ---------- */

const FX_KINDS = {
  guard: { setting: "pulse", applies: actor => isGuarded(actor), create: createGuardFx, update: updateGuardFx },
  fog: { setting: "coverFog", applies: actor => fogDensity(actor) > 0, create: createFogFx, update: updateFogFx },
  haste: { setting: "motionOutline", applies: actor => isHasted(actor), create: t => createMotionFx(t, MOTION.hasted), update: updateMotionFx },
  slow: { setting: "motionOutline", applies: actor => isSlowed(actor), create: t => createMotionFx(t, MOTION.slowed), update: updateMotionFx },
  focus: { setting: "concentrationFx", applies: isConcentrating, create: createFocusFx, update: updateFocusFx },
  fear: { setting: "frightenedFx", applies: isFrightened, create: createFearFx, update: updateFearFx },
  grapple: { setting: "grappledFx", applies: isGrappled, create: createGrappleFx, update: updateGrappleFx },
  rope: { setting: "restrainedFx", applies: isRestrained, create: createRopeFx, update: updateRopeFx },
  bleed: { setting: "bleedingFx", applies: isBleeding, create: createBleedingFx, update: updateBleedingFx },
  poison: { setting: "poisonedFx", applies: isPoisoned, create: t => createDripFx(t, DRIP.poison, true), update: updateDripFx },
  burn: { setting: "burningFx", applies: isBurning, create: createBurnFx, update: updateBurnFx },
  charm: { setting: "charmHearts", applies: actor => isCharmed(actor), create: createCharmFx, update: updateCharmFx },
  stun: { setting: "stunnedFx", applies: isStunned, create: createStunFx, update: updateStunFx },
  // Z's for sleeping or unconscious creatures, but not while dying (the skull shows instead) or dead
  sleep: { setting: "sleepZs", applies: actor => (isSleeping(actor) || isUnconscious(actor)) && !dyingShown(actor) && !isDefeatedActor(actor), create: createSleepFx, update: updateSleepFx },
  dying: { setting: "dyingFx", applies: isDying, create: createDyingFx, update: updateDyingFx },
  stone: { setting: "petrifiedFx", applies: isPetrified, create: createStoneFx, update: updateStoneFx },
  arcs: { setting: "paralyzedFx", applies: isParalyzed, create: createArcFx, update: updateArcFx },
  disease: { setting: "diseasedFx", applies: isDiseased, create: createDiseaseFx, update: updateDiseaseFx },
  drain: { setting: "incapacitatedFx", applies: isIncapacitatedOnly, create: createDrainFx, update: updateDrainFx },
  curse: { setting: "cursedFx", applies: isCursed, create: createCurseFx, update: updateCurseFx },
  mark: { setting: "markedFx", applies: isMarked, create: createMarkFx, update: updateMarkFx },
  // Monsters of Drakkenheim
  addled: { setting: "addledFx", applies: isAddled, create: createAddledFx, update: updateAddledFx },
  clumsy: { setting: "clumsyFx", applies: isClumsy, create: createClumsyFx, update: updateClumsyFx },
  enfeebled: { setting: "enfeebledFx", applies: isEnfeebled, create: createEnfeebledFx, update: updateEnfeebledFx },
  sickened: { setting: "sickenedFx", applies: isSickened, create: createSickenedFx, update: updateSickenedFx },
  defenseless: { setting: "defenselessFx", applies: isDefenselessOnly, create: createDefenselessFx, update: updateDefenselessFx },
  helpless: { setting: "helplessFx", applies: isHelpless, create: createHelplessFx, update: updateHelplessFx },
  immobilized: { setting: "immobilizedFx", applies: isImmobilizedOnly, create: createImmobilizedFx, update: updateImmobilizedFx },
  // These two play out when the status ends (the vines snap, the ice shatters) before they go
  entangled: { setting: "entangledFx", applies: isEntangled, create: createEntangledFx, update: updateEntangledFx, outroMs: VINES.snapSeconds * 1000 },
  frozen: { setting: "frozenFx", applies: isFrozen, create: createFrozenFx, update: updateFrozenFx, outroMs: ICE.shatterSeconds * 1000 },
  shocked: { setting: "shockedFx", applies: isShocked, create: createShockedFx, update: updateShockedFx },
  jinxed: { setting: "jinxedFx", applies: isJinxed, create: createJinxedFx, update: updateJinxedFx },
  valor: { setting: "valorFx", applies: isValorous, create: createValorFx, update: updateValorFx },
  bewildered: { setting: "bewilderedFx", applies: isBewildered, create: createBewilderedFx, update: updateBewilderedFx },
  distracted: { setting: "distractedFx", applies: isDistracted, create: createDistractedFx, update: updateDistractedFx },
  dazed: { setting: "dazedFx", applies: isDazedOnly, create: createDazedFx, update: updateDazedFx },
  weakened: { setting: "weakenedFx", applies: isWeakenedStatus, create: createWeakenedFx, update: updateWeakenedFx },
  staggered: { setting: "staggeredFx", applies: isStaggered, create: createStaggeredFx, update: updateStaggeredFx },
  madness: { setting: "madnessFx", applies: isMaddened, create: createMadnessFx, update: updateMadnessFx },
  // Hidden while dying or dead, like the Bloodied icon
  bloodied: { setting: "bloodiedFx", applies: actor => isBloodied(actor) && !shownAsDown(actor), create: createSplatterFx, update: updateSplatterFx },
  prone: { setting: "proneFx", applies: actor => isProne(actor) && !shownAsDown(actor), create: createProneFx, update: updateProneFx },
  dodge: { setting: "dodgingFx", applies: isDodging, create: createDodgeFx, update: updateDodgeFx },
  contam: { setting: "contaminationFx", applies: actor => contaminationLevel(actor) > 0, create: createContamFx, update: updateContamFx },
  exhaust: { setting: "exhaustionFx", applies: actor => exhaustionLevel(actor) > 0, create: createExhaustFx, update: updateExhaustFx },
  invis: { setting: "invisibleWhirl", applies: actor => isUnseenActor(actor), create: createInvisFx, update: updateInvisFx },
  counters: { setting: "levelCounters", applies: actor => contaminationLevel(actor) > 0 || exhaustionLevel(actor) > 0, create: createCounterFx, update: updateCounterFx }
};

/**
 * Should the status icon with this image be left off the token? Yes when an effect using that
 * image would, on its own, trigger one of this module's animations (and that animation is on).
 */
function shouldHideEffectIcon(token, src) {
  if (!src || animationsOffFor(token) || !game.settings.get(MODULE_ID, "hideAnimatedIcons")) return false;
  const actor = token?.actor;
  if (!actor) return false;
  const candidates = new Set([...(actor.temporaryEffects ?? []), ...(actor.effects ?? [])]);
  const others = otherModuleAnimations(token);
  for (const effect of candidates) {
    if (effect?.img !== src || effect.disabled) continue;
    // Another module animates it (Token Magic FX, Sequencer): this module doesn't, so keep its icon
    const deferred = !!others?.(effect);
    const solo = { statuses: new Set(effect.statuses ?? []), effects: [effect] };
    for (const [kind, def] of Object.entries(FX_KINDS)) {
      if (deferred && !NEVER_DEFERRED.has(kind)) continue;
      if (game.settings.get(MODULE_ID, def.setting) && def.applies(solo)) return true;
    }
  }
  return false;
}

/* ---------- Dying or dead: fewer icons ---------- */

const HIDDEN_WHEN_DOWN = new Set(["bloodied", "prone"]);

/** Dying (0 HP) or dead, and shown that way (the dying or Dead skull is on). */
function shownAsDown(actor) {
  return (isDying(actor) && !!settingValue("dyingFx")) || (isDefeatedActor(actor) && !!settingValue("deadSkull"));
}

/** Is this icon a Bloodied or Prone status on a creature that's dying (0 HP) or dead? Then leave it off. */
function hideWhileDown(token, src) {
  const actor = token?.actor;
  if (!actor || !src || animationsOffFor(token)) return false;
  if (!shownAsDown(actor)) return false;
  for (const effect of [...(actor.temporaryEffects ?? []), ...(actor.effects ?? [])]) {
    if (effect?.img !== src || effect.disabled) continue;
    const statuses = [...(effect.statuses ?? [])];
    if (statuses.length && statuses.every(id => HIDDEN_WHEN_DOWN.has(id))) return true;
  }
  return false;
}

// Dropping to 0 HP (or a death save) doesn't always change any status, so redraw the token's icons
Hooks.on("updateActor", (actor, change) => {
  const get = foundry.utils?.getProperty;
  if (typeof get !== "function") return;
  if (get(change, "system.attributes.hp") === undefined && get(change, "system.attributes.death") === undefined) return;
  let tokens = [];
  try { tokens = actor.getActiveTokens?.(true) ?? []; } catch { /* no scene */ }
  for (const token of tokens) {
    try {
      if ("redrawEffects" in (token.constructor?.RENDER_FLAGS ?? {})) token.renderFlags.set({ redrawEffects: true });
      else token.drawEffects?.();
    } catch { /* not critical */ }
  }
});

/* ---------- Dead: a big red skull ---------- */

const DEAD_SKULL = { tint: 0xC8102E, alpha: 0.9, fill: 1 };   // blood red, filling the token's square

/** Is the token defeated (dnd5e's and Foundry's Dead status)? */
function isDefeatedToken(token) {
  const id = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  return docHas(token?.document, id) || (id !== "dead" && docHas(token?.document, "dead"));
}

function deadSkullEnabled() {
  return !!settingValue("deadSkull");
}

/** Is this icon the token's Dead status (its effect's image, or the Dead status's own image)? */
function isDeadSkullIcon(token, src) {
  if (!src || animationsOffFor(token) || !deadSkullEnabled() || !isDefeatedToken(token)) return false;
  const id = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  const images = new Set([statusConfig(id)?.img, statusConfig(id)?.icon, statusConfig("dead")?.img]);
  const actor = token.actor;
  for (const effect of [...(actor?.temporaryEffects ?? []), ...(actor?.effects ?? [])]) {
    if (effect?.statuses?.has?.(id) || effect?.statuses?.has?.("dead")) images.add(effect.img);
  }
  images.delete(undefined); images.delete(null);
  return images.has(src);
}

/**
 * Enlarge the Dead skull to fill the token, centre it and turn it red. Foundry sizes its overlay
 * (and lays out ordinary icons) on every refresh, so this runs after each one.
 */
function styleDeadOverlay(token) {
  const effects = token?.effects;
  if (!effects || animationsOffFor(token) || !deadSkullEnabled() || !isDefeatedToken(token)) return;
  const skull = (effects.overlay && !effects.overlay.destroyed) ? effects.overlay
    : (effects.children ?? []).find(c => c?._mgDeadSkull && !c.destroyed);
  if (!skull) return;
  // Over the art, wherever it's drawn and however big (in the icons' own space)
  const box = artBox(token);
  const size = Math.min(box.w, box.h) * DEAD_SKULL.fill;
  if (!(size > 0)) return;
  skull.anchor?.set?.(0.5, 0.5);
  const ox = Number(effects.position?.x ?? effects.x) || 0, oy = Number(effects.position?.y ?? effects.y) || 0;
  const centre = { x: box.x + box.w / 2 - ox, y: box.y + box.h / 2 - oy };
  if (skull.position?.set) skull.position.set(centre.x, centre.y); else skull.position = centre;
  skull.width = skull.height = size;
  skull.tint = DEAD_SKULL.tint;
  skull.alpha = DEAD_SKULL.alpha;
}

/** Redraw the status icons on every token (after a setting changes). */
function redrawTokenEffectIcons() {
  for (const token of canvas?.tokens?.placeables ?? []) {
    try {
      if ("redrawEffects" in (token.constructor.RENDER_FLAGS ?? {})) token.renderFlags.set({ redrawEffects: true });
      else token.drawEffects?.();
    } catch { /* not critical */ }
  }
}

/**
 * The area the token's art actually covers, in the token's own space (0, 0 is its top-left).
 * Tokens whose art is scaled down (or up) inside their grid square get effects sized to the art,
 * not the square. The art is measured where it's really drawn, through the display transforms, so
 * it's right however the art is changed: its texture scale or offset, another module scaling or
 * moving the art (or the whole token) while the game runs, or the token being rotated.
 */
function artBox(token) {
  const measured = meshBoxInToken(token);
  if (measured) return measured;
  const w = token.w, h = token.h;
  const tex = token.document?.texture ?? {};
  const mesh = token.mesh;
  let bw = Math.abs(Number(mesh?.width)) || 0, bh = Math.abs(Number(mesh?.height)) || 0;
  if (!(bw > 1 && bh > 1)) {
    bw = w * Math.abs(Number(tex.scaleX ?? 1) || 1);
    bh = h * Math.abs(Number(tex.scaleY ?? 1) || 1);
  }
  // Centre: where the mesh actually sits (accounts for texture anchor/offset), else the token centre.
  let cx = w / 2, cy = h / 2;
  const mx = Number(mesh?.position?.x ?? mesh?.x), my = Number(mesh?.position?.y ?? mesh?.y);
  const tx = Number(token.x), ty = Number(token.y);
  if ([mx, my, tx, ty].every(Number.isFinite)) {
    const ax = Number(mesh.anchor?.x ?? 0.5), ay = Number(mesh.anchor?.y ?? 0.5);
    const rx = mx - tx + (0.5 - ax) * bw, ry = my - ty + (0.5 - ay) * bh;
    if (rx >= -w * 0.5 && rx <= w * 1.5 && ry >= -h * 0.5 && ry <= h * 1.5) { cx = rx; cy = ry; }
  }
  bw = Math.max(4, bw); bh = Math.max(4, bh);
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}

/**
 * The art's box measured through the display transforms: the middle of the art and the middles of
 * its right and bottom edges, carried from the art's own space into the token's. Null when that
 * can't be done (no art yet, or a display object without transforms).
 */
function meshBoxInToken(token) {
  const mesh = token?.mesh;
  if (!mesh || mesh.destroyed || !mesh.parent || typeof mesh.toGlobal !== "function" || typeof token.toLocal !== "function") return null;
  const tex = mesh.texture;
  const tw = Number(tex?.orig?.width ?? tex?.width), th = Number(tex?.orig?.height ?? tex?.height);
  if (!(tw > 1 && th > 1)) return null;
  try {
    const ax = Number(mesh.anchor?.x ?? 0.5), ay = Number(mesh.anchor?.y ?? 0.5);
    const Point = PIXI.Point ?? class { constructor(x, y) { this.x = x; this.y = y; } };
    const toToken = (x, y) => token.toLocal(mesh.toGlobal(new Point(x, y)));
    const c = toToken((0.5 - ax) * tw, (0.5 - ay) * th);
    const r = toToken((1 - ax) * tw, (0.5 - ay) * th);
    const b = toToken((0.5 - ax) * tw, (1 - ay) * th);
    const bw = 2 * Math.hypot(r.x - c.x, r.y - c.y), bh = 2 * Math.hypot(b.x - c.x, b.y - c.y);
    const span = Math.max(Number(token.w) || 0, Number(token.h) || 0, 1);
    if (![c.x, c.y, bw, bh].every(Number.isFinite) || bw < 2 || bh < 2) return null;
    // Nonsense (art far from the token, or absurdly large): fall back to the token's own data
    if (Math.abs(c.x) > span * 20 || Math.abs(c.y) > span * 20 || bw > span * 20 || bh > span * 20) return null;
    return { x: c.x - bw / 2, y: c.y - bh / 2, w: bw, h: bh };
  } catch {
    return null;
  }
}

/** How many screen pixels one unit of the token's own space covers (the canvas zoom, and any scale on the token). */
function tokenZoom(token, fallback) {
  const wt = token?.worldTransform;
  const z = wt ? Math.hypot(Number(wt.a) || 0, Number(wt.b) || 0) : 0;
  return z > 0 && Number.isFinite(z) ? z : fallback;
}

function restoreMesh(token) {
  if (token.destroyed || !token.mesh) return;
  token.mesh.tint = Number(foundry.utils.Color.fromRGB(baseTint(token)));
  token.mesh.alpha = baseAlpha(token);
  const known = token.constructor.RENDER_FLAGS ?? {};
  const flags = {};
  for (const f of ["refreshState", "refreshMesh"]) if (f in known) flags[f] = true;
  try { token.renderFlags?.set(flags); } catch { /* not critical */ }
}

const REDUCED_FRAME_MS = 33;          // Reduced quality: about 30 updates a second
let lastFullTick = 0;
const stillSignatures = new WeakMap(); // Still quality: what each token looked like when last drawn

function fxTick() {
  const now = performance.now();
  if (!canvas?.ready || !canvas.tokens) { lastTime = now; return; }
  const mode = animationMode();
  if (mode === "reduced" && now - lastFullTick < REDUCED_FRAME_MS) { keepConcealed(); return; }
  lastFullTick = now;
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  frameCache.active = true;
  frameCache.frame++;
  frameCache.settings.clear();
  try { runFxFrame(now, dt, mode); }
  finally { frameCache.active = false; }
}

/** Between Reduced-quality updates, unseen creatures must still never show their name, bars or icons. */
function keepConcealed() {
  for (const [token, state] of effects) if (!token.destroyed && state.invis?.concealed) hideTokenUI(token);
}

/** Everything a Still-quality token's look depends on: when this changes, it's drawn again. */
function stillSignature(token, box, zoom) {
  const actor = token.actor, attrs = actor?.system?.attributes;
  const viewer = (canvas.tokens.controlled ?? []).map(t => t.id).join(",");
  return [[...actorStatusIds(actor)].sort().join(","), attrs?.hp?.value ?? "", attrs?.death?.failure ?? "",
    contaminationLevel(actor), exhaustionLevel(actor), viewer, game.user?.isGM ? 1 : 0,
    Math.round(box.w), Math.round(box.h), Math.round(zoom * 20), token.document?.texture?.src ?? "", stillBurnType(actor), pictureArtLoaded].join("|");
}

/** Burning's damage type, so a still picture turns from fire to acid when it's changed in the pane. */
function stillBurnType(actor) {
  try { return burningType(actor) ?? ""; } catch { return ""; }
}

function runFxFrame(now, dt, mode) {
  const enabled = {};
  const kindOrder = Object.keys(FX_KINDS);
  for (const kind of kindOrder) enabled[kind] = !!settingValue(FX_KINDS[kind].setting);
  const periodMs = Math.max(0.5, Number(settingValue("pulseSeconds")) || 8) * 1000;
  const ctx = {
    now, dt,
    wave: (Math.sin((now / periodMs) * 2 * Math.PI) + 1) / 2, // 0 → 1 → 0 each Mighty Guard pulse
    zoom: canvas.stage?.scale?.x ?? 1
  };
  const stageZoom = ctx.zoom;
  const still = mode === "still";
  const deferring = !!settingValue("deferToOtherModules") && (moduleActive("tokenmagic") || moduleActive("sequencer"));

  const active = new Set();
  for (const token of canvas.tokens.placeables) {
    if (token.destroyed || !token.mesh) continue;
    let state = effects.get(token);
    // Off screen, or not visible to this user: keep its effects as they are until it's back in view
    if (token.visible === false || !tokenOnScreen(token)) {
      if (state) { active.add(token); if (state.invis?.concealed) hideTokenUI(token); }
      continue;
    }
    // Which animations apply (most tokens have none: nothing more to do for those). A token set to
    // show no animations wants none, so anything it had is cleared below.
    let wanted = null;
    if (!animationsOffFor(token)) for (const kind of kindOrder) {
      if (enabled[kind] && FX_KINDS[kind].applies(token.actor)) (wanted ??= new Set()).add(kind);
    }
    if (wanted && deferring) wanted = dropOtherModuleKinds(token, wanted);
    // The Dead skull follows the art if something moves or resizes it between Foundry's own refreshes
    if (isDefeatedToken(token) && token.effects) { try { styleDeadOverlay(token); } catch { /* not critical */ } }
    if (!wanted && !state) continue;
    let tint = [1, 1, 1], alpha = 1, any = false;
    const box = artBox(token);
    ctx.zoom = tokenZoom(token, stageZoom);   // blurs and line widths are in screen pixels
    // Effects draw in the art's own space: (0, 0) is the art's top-left, w × h its size.
    const view = { w: box.w, h: box.h, id: token.id, document: token.document, actor: token.actor, mesh: token.mesh, placeable: token };
    const signature = still ? stillSignature(token, box, ctx.zoom) : null;
    const redrawStill = still && stillSignatures.get(token) !== signature;

    for (const kind of kindOrder) {
      const def = FX_KINDS[kind];
      const on = !!wanted?.has(kind);
      let fx = state?.[kind];
      if (!on) {
        if (!fx) continue;
        // The status ended: an animation with an ending plays it out first (not when it was turned
        // off, for a token set to show none, or in Still quality)
        if (def.outroMs && enabled[kind] && !still && !animationsOffFor(token) && !fx.container.destroyed && fx.container.parent === token) {
          fx.endedAt ??= now;
          const ending = (now - fx.endedAt) / def.outroMs;
          if (ending < 1) {
            fx.container.position.set(box.x, box.y);
            const mod = def.update(view, fx, { ...ctx, ending });
            tint = tint.map((c, i) => c * mod.tint[i]);
            alpha *= mod.alpha;
            any = true;
            continue;
          }
        }
        destroyFx(fx); delete state[kind];
        continue;
      }
      // Back while it was ending: start again from the beginning
      if (fx && fx.endedAt != null) { destroyFx(fx); delete state[kind]; fx = null; }
      // Foundry rebuilds a token's children when it redraws; recreate the effect if so.
      if (!fx || fx.container.destroyed || fx.container.parent !== token) {
        if (fx) destroyFx(fx);
        fx = def.create(view);
        insertFx(token, fx.container, FX_RANK[kind]);
        if (!state) effects.set(token, state = {});
        state[kind] = fx;
      }
      fx.container.position.set(box.x, box.y);
      let mod;
      if (!still) mod = def.update(view, fx, ctx);
      else if (!redrawStill && fx._stillMod) mod = fx._stillMod;
      else {
        // Still: draw it as it looks once it has settled (appearing animations finished), then hold it
        def.update(view, fx, { ...ctx, dt: 0 });
        mod = fx._stillMod = def.update(view, fx, { ...ctx, now: now + 10000, dt: 0 });
      }
      if (!still || redrawStill || mod !== fx._stillTuned) {
        for (const filter of Object.values(fx.blurs ?? {})) tuneBlur(filter, mode);
        fx._stillTuned = mod;
      }
      tint = tint.map((c, i) => c * mod.tint[i]);
      alpha *= mod.alpha;
      any = true;
    }
    if (still) stillSignatures.set(token, signature);

    if (!any) continue;
    active.add(token);
    // An unseen creature shows nothing but its whirl: no other effect may give it away
    // (except the Hiding fog, for the GM, on one that is Invisible and Hiding)
    const concealed = !!state?.invis?.concealed;
    const reveal = state?.invis?.reveal;
    for (const [kind, fx] of Object.entries(state ?? {})) {
      if (kind !== "invis" && fx?.container && !fx.container.destroyed) fx.container.visible = !concealed || !!reveal?.has(kind);
    }
    if (concealed) hideTokenUI(token);
    const base = baseTint(token);
    token.mesh.tint = Number(foundry.utils.Color.fromRGB(base.map((c, i) => c * tint[i])));
    token.mesh.alpha = baseAlpha(token) * alpha;
  }

  // Clean up tokens that no longer have any effect.
  for (const [token, state] of effects) {
    if (active.has(token)) continue;
    for (const fx of Object.values(state)) destroyFx(fx);
    effects.delete(token);
    restoreMesh(token);
  }
}

