// Primal Status: built by tools/build.mjs from the files in src/. Edit those, not this file.
// ===== src/00-header.js =====
/**
 * Primal Status (module id: primal-status). It was "enhanced-status-effects" (Enhanced Status
 * Effects) from 3.0.0 to 3.2.3 and "mighty-guard" before that; see src/22-migrate.js. Started as Mighty Guard: a status effect, toggled from the Token HUD's status effects palette, that forces every DAMAGE ROLL
 * made against the affected creature (i.e. while it is targeted) to roll its
 * minimum possible result. Attack rolls are not affected.
 *
 * Compatible with Foundry VTT v12 and v13.
 * Native damage-roll detection for dnd5e and pf2e, with a generic fallback for other systems.
 *
 * Also gives tokens with any cover status (dnd5e: Half, Three-Quarters, Total Cover) a
 * drifting fog appearance, and sleeping tokens floating green Z's.
 *
 * Adds Haste and Slow statuses (dnd5e 2024 rules) with animated green / dark blue outlines.
 *
 * Adds a search box to the Token HUD status palette, and a settings window to hide statuses from it.
 *
 * Adds a Guidance (+1d4) checkbox to dnd5e ability/skill check dialogs, and floating hearts on
 * charmed creatures.
 *
 * Animated condition effects: dripping blood (bleeding), toxic bubbles and a green haze (poisoned),
 * a fiery aura (burning), rope (restrained), orbiting stars (stunned), Z's (sleeping and unconscious),
 * cracked stone (petrified), electric arcs (paralyzed), sores (diseased), drained and fading (incapacitated),
 * a dark swirl (cursed), crosshairs (marked), afterimages (dodging), blood splatters (bloodied), dust and chevrons (prone), a pulsing red skull (dying, 0 HP),
 * writhing shadow tendrils
 * (frightened), turning rune rings (concentrating) and a clawed hand (grappled). The small status
 * icon is left off tokens for statuses that have an animation.
 *
 * Adds a leveled Contamination status (Monsters of Drakkenheim) with a swirl of octarine light, and
 * bloodshot cracks for Exhaustion; both show their level in Hearthstone-style gems on the token.
 *
 * Monsters of Drakkenheim conditions with their rules and animations (Frozen's ring of ice and
 * Entangled's thorny vines play out when the status ends, see 13-fx-ice-and-vines.js), and a box
 * in the status pane for the X of Jinxed, Valor and Burning (09-status-values.js). Burning deals
 * its damage each turn, and short effects that end on a save end with the combat (09-automation.js).
 *
 * Applies the Advantage / Disadvantage that conditions give to attack rolls (attacker's and
 * target's conditions), ability checks and saving throws, where dnd5e doesn't already.
 */

const MODULE_ID = "primal-status";
const LEGACY_MODULE_IDS = ["enhanced-status-effects", "mighty-guard"];   // earlier IDs, newest first (3.0.0–3.2.3, before 3.0.0)
const STATUS_ID = "mighty-guard";                // the Mighty Guard status keeps its ID
const MODULE_PATH = `modules/${MODULE_ID}`;
const ICON = `${MODULE_PATH}/icons/mighty-guard.svg`;
const GRAPPLE_DEFAULT_IMAGE = `${MODULE_PATH}/images/grapple-hand.webp`;
const GRAPPLE_OLD_DEFAULTS = [`${MODULE_PATH}/images/grapple-claws.webp`, `${MODULE_PATH}/images/grapple-claws-hollow.webp`];
const HASTE_ID = "hasted";
const SLOW_ID = "slowed";
const CONTAM_ID = "contamination";
const CONTAM_ICON = `${MODULE_PATH}/icons/contamination.svg`;
const CONTAM_MAX = 6;

// ===== src/01-setup.js =====
/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  loadStylesheet();
  // 2024 rules: Frightened gives Disadvantage on ability checks; let dnd5e's own roll modes include it too
  try { CONFIG.DND5E?.conditionEffects?.abilityCheckDisadvantage?.add?.("frightened"); } catch { /* not dnd5e */ }
  registerContaminationCondition();
  registerStatuses();

  /*
   * Module Settings shows two windows and a few rules settings; everything else is set from the
   * windows (config: false). Keys are unchanged, so everyone's earlier choices carry over.
   */

  // Token animations: each player chooses their own, in the Token animations window
  for (const key of ANIMATION_KEYS) {
    game.settings.register(MODULE_ID, key, {
      name: `MIGHTYGUARD.Settings.${settingLabel(key)}.Name`,
      hint: `MIGHTYGUARD.Settings.${settingLabel(key)}.Hint`,
      scope: "client",
      config: false,
      type: Boolean,
      default: true,
      ...(["hideAnimatedIcons", "deadSkull"].includes(key) ? { onChange: () => redrawTokenEffectIcons() } : {})
    });
  }

  // How much the animations move: per player, in the same window
  game.settings.register(MODULE_ID, "animationQuality", {
    name: "MIGHTYGUARD.Settings.AnimationQuality.Name",
    hint: "MIGHTYGUARD.Settings.AnimationQuality.Hint",
    scope: "client",
    config: false,
    type: String,
    choices: Object.fromEntries(ANIMATION_QUALITIES.map(q => [q, `MIGHTYGUARD.Settings.AnimationQuality.${q}`])),
    default: "auto",
    onChange: () => { for (const state of effects.values()) for (const fx of Object.values(state)) delete fx._stillMod; }
  });

  // The GM can give every player the same animation choices; each player takes them once (then can
  // change their own again), and new players start with them
  game.settings.register(MODULE_ID, "animationDefaults", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => applyAnimationDefaults()
  });
  game.settings.register(MODULE_ID, "animationDefaultsApplied", {   // which of the GM's sets this player has taken
    scope: "client",
    config: false,
    type: Number,
    default: 0
  });

  // Leave statuses that Token Magic FX or Sequencer already animate to them (GM, same window)
  game.settings.register(MODULE_ID, "deferToOtherModules", {
    name: "MIGHTYGUARD.Settings.DeferToOtherModules.Name",
    hint: "MIGHTYGUARD.Settings.DeferToOtherModules.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: () => redrawTokenEffectIcons()
  });

  // Sound cues: each player's own choice, in the same window (off unless turned on)
  game.settings.register(MODULE_ID, "soundCues", {
    name: "MIGHTYGUARD.Settings.SoundCues.Name",
    hint: "MIGHTYGUARD.Settings.SoundCues.Hint",
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });
  game.settings.register(MODULE_ID, "soundVolume", {
    name: "MIGHTYGUARD.Settings.SoundVolume.Name",
    scope: "client",
    config: false,
    type: Number,
    range: { min: 0, max: 100, step: 5 },
    default: 50
  });

  // Shared animation options: set by the GM in the same window
  game.settings.register(MODULE_ID, "pulseSeconds", {
    name: "MIGHTYGUARD.Settings.PulseSeconds.Name",
    hint: "MIGHTYGUARD.Settings.PulseSeconds.Hint",
    scope: "world",
    config: false,
    type: Number,
    range: { min: 1, max: 20, step: 0.5 },
    default: 8
  });

  game.settings.register(MODULE_ID, "grappleImagePath", {
    name: "MIGHTYGUARD.Settings.GrappleImage.Name",
    hint: "MIGHTYGUARD.Settings.GrappleImage.Hint",
    scope: "world",
    config: false,
    type: String,
    filePicker: "image",
    default: GRAPPLE_DEFAULT_IMAGE,
    onChange: () => resetFxKind("grapple")
  });

  // Size relative to the visible edge of each token's art (1 = the hand wraps the edge).
  // A new key, so values saved under the old "relative to the whole image" setting don't carry over.
  game.settings.register(MODULE_ID, "grappleImageFit", {
    name: "MIGHTYGUARD.Settings.GrappleImageScale.Name",
    hint: "MIGHTYGUARD.Settings.GrappleImageScale.Hint",
    scope: "world",
    config: false,
    type: Number,
    range: { min: 0.5, max: 1.6, step: 0.05 },
    default: 1
  });

  // Settings, images and macros carried over from the earlier module IDs: once per world, once per browser
  game.settings.register(MODULE_ID, "migratedWorld", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "migratedClient", { scope: "client", config: false, type: Boolean, default: false });

  game.settings.register(MODULE_ID, "hiddenStatuses", {
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => applyHiddenStatuses()
  });

  // The two windows
  game.settings.registerMenu(MODULE_ID, "animationsMenu", {
    name: "MIGHTYGUARD.Animations.Name",
    label: "MIGHTYGUARD.Animations.Label",
    hint: "MIGHTYGUARD.Animations.Hint",
    icon: "fas fa-wand-magic-sparkles",
    type: makeAnimationsConfig(),
    restricted: false
  });

  game.settings.registerMenu(MODULE_ID, "hiddenStatusesMenu", {
    name: "MIGHTYGUARD.HiddenStatuses.Name",
    label: "MIGHTYGUARD.HiddenStatuses.Label",
    hint: "MIGHTYGUARD.HiddenStatuses.Hint",
    icon: "fas fa-eye-slash",
    type: makeHiddenStatusesConfig(),
    restricted: true
  });

  // Shown in Module Settings, in this order
  game.settings.register(MODULE_ID, "statusTooltips", {   // key kept from when this was a tooltip
    name: "MIGHTYGUARD.Settings.StatusTooltips.Name",
    hint: "MIGHTYGUARD.Settings.StatusTooltips.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refreshOpenHudPane()
  });

  game.settings.register(MODULE_ID, "conditionRolls", {
    name: "MIGHTYGUARD.Settings.ConditionRolls.Name",
    hint: "MIGHTYGUARD.Settings.ConditionRolls.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Monsters of Drakkenheim: Bewildered, Distracted and Staggered enforced, Drakkenheim Madness's trait rolled (09-condition-limits.js)
  game.settings.register(MODULE_ID, "drakkenheimAutomation", {
    name: "MIGHTYGUARD.Settings.DrakkenheimAutomation.Name",
    hint: "MIGHTYGUARD.Settings.DrakkenheimAutomation.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "dodgeExpiry", {
    name: "MIGHTYGUARD.Settings.DodgeExpiry.Name",
    hint: "MIGHTYGUARD.Settings.DodgeExpiry.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "autoDead", {
    name: "MIGHTYGUARD.Settings.AutoDead.Name",
    hint: "MIGHTYGUARD.Settings.AutoDead.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "saveEndsCombatEnd", {
    name: "MIGHTYGUARD.Settings.SaveEndsCombatEnd.Name",
    hint: "MIGHTYGUARD.Settings.SaveEndsCombatEnd.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "burningDamage", {
    name: "MIGHTYGUARD.Settings.BurningDamage.Name",
    hint: "MIGHTYGUARD.Settings.BurningDamage.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      apply: "MIGHTYGUARD.Settings.BurningDamage.Apply",
      roll: "MIGHTYGUARD.Settings.BurningDamage.Roll",
      off: "MIGHTYGUARD.Settings.BurningDamage.Off"
    },
    default: "apply"
  });

  // A hidden GM option: a world setting, so players never see it in Module Settings (09-desperation.js)
  game.settings.register(MODULE_ID, "desperationAttacks", {
    name: "MIGHTYGUARD.Settings.DesperationAttacks.Name",
    hint: "MIGHTYGUARD.Settings.DesperationAttacks.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // How likely a Desperation Attack is, in percent (also hidden from players: a world setting)
  game.settings.register(MODULE_ID, "desperationChance", {
    name: "MIGHTYGUARD.Settings.DesperationChance.Name",
    hint: "MIGHTYGUARD.Settings.DesperationChance.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 100, step: 1 },
    default: 50
  });

  game.settings.register(MODULE_ID, "contaminationRest", {
    name: "MIGHTYGUARD.Settings.ContaminationRest.Name",
    hint: "MIGHTYGUARD.Settings.ContaminationRest.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "invisibleWhirl", {
    name: "MIGHTYGUARD.Settings.InvisibleWhirl.Name",
    hint: "MIGHTYGUARD.Settings.InvisibleWhirl.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refreshTokenVisibility()
  });

  game.settings.register(MODULE_ID, "etherealVision", {
    name: "MIGHTYGUARD.Settings.EtherealVision.Name",
    hint: "MIGHTYGUARD.Settings.EtherealVision.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refreshEtherealVision()
  });

  game.settings.register(MODULE_ID, "guidanceCheckbox", {
    name: "MIGHTYGUARD.Settings.GuidanceCheckbox.Name",
    hint: "MIGHTYGUARD.Settings.GuidanceCheckbox.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "detection", {
    name: "MIGHTYGUARD.Settings.Detection.Name",
    hint: "MIGHTYGUARD.Settings.Detection.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      damage: "MIGHTYGUARD.Settings.Detection.Damage",
      nonD20: "MIGHTYGUARD.Settings.Detection.NonD20"
    },
    default: "damage"
  });
});

Hooks.once("setup", () => {
  registerContaminationCondition();
  registerStatuses();

  // Skip the small status icon on tokens for statuses that are shown by an animation instead.
  const tokenProto = CONFIG.Token?.objectClass?.prototype;
  if (typeof tokenProto?._drawEffect === "function") {
    // Foundry chains `.then()` onto this call, so a skipped icon must still return a promise.
    // MIXED: this wrapper deliberately doesn't call the original when it skips an icon.
    wrap("CONFIG.Token.objectClass.prototype._drawEffect", function (wrapped, src, ...rest) {
      let hide = false;
      try { hide = hideWhileDown(this, src) || shouldHideEffectIcon(this, src); }
      catch (err) { console.warn(`${MODULE_ID} | Could not check effect icon`, err); }
      if (hide) return Promise.resolve(null);
      const result = wrapped(src, ...rest);
      let skull = false;
      try { skull = isDeadSkullIcon(this, src); } catch { /* draw it as usual */ }
      if (!skull) return result;
      // The Dead icon becomes the token's overlay (out of the row of small icons), even when Dead
      // was set as an ordinary status; the refresh below then enlarges it and turns it red
      return Promise.resolve(result).then(icon => {
        if (icon && !icon.destroyed && this.effects && !this.effects.destroyed) {
          icon._mgDeadSkull = true;
          this.effects.overlay = icon;
        }
        return icon;
      });
    }, "MIXED");
  }
  // Turning an animation on or off changes which icons are hidden
  for (const def of Object.values(FX_KINDS)) {
    const config = game.settings.settings?.get?.(`${MODULE_ID}.${def.setting}`);
    if (!config) continue;
    const previous = config.onChange;
    config.onChange = (...args) => { previous?.(...args); redrawTokenEffectIcons(); };
  }
  installInvisibilityWrappers();
  // Dead: Foundry draws the skull over the token at 60% size in the icon's own colour; make it a big red skull
  if (typeof tokenProto?._refreshEffects === "function") {
    wrap("CONFIG.Token.objectClass.prototype._refreshEffects", function (wrapped, ...args) {
      const result = wrapped(...args);
      try { styleDeadOverlay(this); } catch (err) { console.warn(`${MODULE_ID} | Could not restyle the Dead skull`, err); }
      return result;
    });
  }
  wrap("Roll.prototype.evaluate", function (wrapped, options = {}) {
    const result = wrapped(applyGuard(this, options));
    if (result && typeof result.then === "function") return result.then(roll => { afterRollEvaluated(roll ?? this); return roll; });
    afterRollEvaluated(this);
    return result;
  });
  if (typeof Roll.prototype.evaluateSync === "function") {
    wrap("Roll.prototype.evaluateSync", function (wrapped, options = {}) {
      const result = wrapped(applyGuard(this, options));
      afterRollEvaluated(result ?? this);
      return result;
    });
  }
});

Hooks.once("ready", async () => {
  registerStatuses();
  applyHiddenStatuses();

  // Macro API: game.modules.get("primal-status").api.toggle()
  game.modules.get(MODULE_ID).api = {
    STATUS_ID,
    isGuarded,
    /** Toggle Mighty Guard on the given token (or all controlled tokens). */
    async toggle(token) {
      const tokens = token ? [token] : canvas.tokens.controlled;
      for (const t of tokens) await toggleGuard(t.actor);
    },
    /** Turn status animations on or off for the given token (or all controlled tokens), for everyone. */
    async setAnimations(on, token) {
      const tokens = token ? [token] : canvas.tokens.controlled;
      for (const t of tokens) await setTokenAnimations(t, on);
    }
  };

  // Carry settings and images over from the old module ID, then take the GM's choices for everyone
  try { await migrateFromOldModuleId(); }
  catch (err) { console.warn(`${MODULE_ID} | Could not carry over settings from ${LEGACY_MODULE_IDS.join(" or ")}`, err); }
  applyAnimationDefaults();
});

// ===== src/02-guidance.js =====
/* -------------------------------------------- */
/*  Guidance checkbox on ability / skill checks */
/* -------------------------------------------- */

const GUIDANCE_FIELD = "mgGuidance";
const GUIDANCE_DIE = "1d4";

/** Which rolls in an open dialog have Guidance ticked (survives the dialog re-rendering). */
const guidanceState = new WeakMap();

/** Is this dnd5e roll dialog for an ability check (plain, skill, tool or initiative)? */
function isAbilityCheckDialog(app) {
  return !!app?.config?.hookNames?.includes?.("abilityCheck");
}

function formFlag(formData, key) {
  const v = formData?.object?.[key] ?? formData?.get?.(key);
  return v === true || v === "true" || v === "on";
}

// Add the checkbox under each "Situational Bonus" field.
Hooks.on("renderRollConfigurationDialog", (app, element) => {
  if (game.system.id !== "dnd5e" || !isAbilityCheckDialog(app)) return;
  if (!game.settings.get(MODULE_ID, "guidanceCheckbox")) return;
  const root = element instanceof HTMLElement ? element : (app.element ?? element?.[0]);
  const state = guidanceState.get(app) ?? new Set();
  guidanceState.set(app, state);

  for (const situational of root?.querySelectorAll('input[name^="roll."][name$=".situational"]') ?? []) {
    const index = Number(situational.name.split(".")[1]);
    const name = `roll.${index}.${GUIDANCE_FIELD}`;
    if (root.querySelector(`[name="${name}"]`)) continue;
    const group = situational.closest(".form-group") ?? situational.parentElement;
    const id = `${app.id}-${GUIDANCE_FIELD}-${index}`;
    const row = document.createElement("div");
    row.className = "form-group mg-guidance";
    row.style.marginTop = "4px";
    row.innerHTML = `
      <label class="checkbox" for="${id}" style="display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" id="${id}" name="${name}" ${state.has(index) ? "checked" : ""}>
        <span>${game.i18n.localize("MIGHTYGUARD.Guidance.Label")}</span>
        <span class="hint" style="margin:0;">${game.i18n.localize("MIGHTYGUARD.Guidance.Hint")}</span>
      </label>`;
    row.querySelector("input").addEventListener("change", ev => {
      if (ev.currentTarget.checked) state.add(index); else state.delete(index);
    });
    group.after(row);
  }
});

// When the dialog builds the roll, add 1d4 if Guidance is ticked.
Hooks.on("dnd5e.buildAbilityCheckRollConfig", (app, config, formData, index) => {
  if (!game.settings.get(MODULE_ID, "guidanceCheckbox")) return;
  const key = `roll.${index}.${GUIDANCE_FIELD}`;
  const on = formData ? formFlag(formData, key) : !!guidanceState.get(app)?.has(index);
  if (!on || !Array.isArray(config.parts)) return;
  config.parts.push(GUIDANCE_DIE);
});

// ===== src/03-roll-rules.js =====
/* -------------------------------------------- */
/*  Advantage & disadvantage from conditions    */
/* -------------------------------------------- */

/*
 * dnd5e already handles some of these itself (Poisoned and Exhaustion on checks, Dodging and
 * Restrained on Dexterity saves, Invisible / Incapacitated / Surprised on initiative). This adds
 * the rest, mostly attack rolls, which depend on both the attacker's and the target's conditions.
 * Sight is judged from conditions and special senses (Blindsight, Tremorsense, Truesight and the
 * token's detection modes), not from walls or lighting.
 */
const COND_RULES = {
  hidden: ["invisible", "ethereal"],                                        // unseen (Hiding alone doesn't count; add Invisible too)
  ownAttackDisadvantage: ["frightened", "poisoned", "prone", "restrained"],
  targetGrantsAdvantage: ["paralyzed", "petrified", "restrained", "stunned", "unconscious", "defenseless"],
  // Monsters of Drakkenheim: Disadvantage on attack rolls, ability checks and saving throws with these abilities
  abilityDisadvantage: { addled: ["int", "wis", "cha"], clumsy: ["dex"], enfeebled: ["str"] },
  saveDisadvantage: { sickened: ["con"] }
};

/** Does the actor have this status, from its status set or any of its active effects? */
function hasStatus(actor, id) {
  if (!actor) return false;
  const entry = cacheEntry(actor);                 // the animation loop's per-frame cache
  if (entry) return (entry.active ??= activeStatusIds(actor)).has(id);
  if (actor.statuses?.has?.(id)) return true;
  for (const effect of actor.effects ?? []) {
    if (effect.disabled || effect.active === false || effect.isSuppressed) continue;
    if (effect.statuses?.has?.(id)) return true;
  }
  return false;
}

/** Is this creature able to use Dodge right now? (not while Incapacitated or its Speed is 0) */
function dodgeActive(actor) {
  if (!hasStatus(actor, "dodging") || hasStatus(actor, "incapacitated")) return false;
  const noMovement = ["grappled", "paralyzed", "petrified", "restrained", "unconscious", ...(CONFIG.DND5E?.conditionEffects?.noMovement ?? [])];
  return !noMovement.some(s => typeof s === "string" && !s.includes("-") && hasStatus(actor, s));
}

/** The token standing in for an actor on the current scene. */
function tokenForActor(actor) {
  if (!actor) return null;
  if (actor.token?.object) return actor.token.object;
  const controlled = canvas?.tokens?.controlled?.find(t => t.actor === actor);
  if (controlled) return controlled;
  try { return actor.getActiveTokens?.(true)?.[0] ?? actor.getActiveTokens?.()?.[0] ?? null; }
  catch { return null; }
}

/** Distance in feet between two tokens' nearest edges (5 for creatures in adjacent squares). */
function tokenDistance(a, b) {
  const dims = canvas?.dimensions;
  if (!a || !b || !dims) return null;
  const size = dims.size || 100, dist = dims.distance || 5;
  const box = t => {
    const x = t.document?.x ?? t.x ?? 0, y = t.document?.y ?? t.y ?? 0;
    return { x0: x, y0: y, x1: x + (t.document?.width ?? 1) * size, y1: y + (t.document?.height ?? 1) * size };
  };
  const A = box(a), B = box(b);
  const gx = Math.max(0, B.x0 - A.x1, A.x0 - B.x1) / size;
  const gy = Math.max(0, B.y0 - A.y1, A.y0 - B.y1) / size;
  const gz = Math.max(0, Math.abs((a.document?.elevation ?? 0) - (b.document?.elevation ?? 0)) / dist - 1);
  return (Math.max(gx, gy, gz) + 1) * dist;
}

function senseRange(actor, sense) {
  const senses = actor?.system?.attributes?.senses ?? {};
  return Number(senses.ranges?.[sense] ?? senses[sense]) || 0;
}

function detectionRange(token, ids) {
  const modes = token?.document?.detectionModes;
  const list = Array.isArray(modes) ? modes : Object.entries(modes ?? {}).map(([id, m]) => ({ id, ...m }));
  let best = 0;
  for (const m of list) {
    if (!ids.includes(m?.id) || m.enabled === false) continue;
    best = Math.max(best, (m.range === null || m.range === undefined) ? Infinity : Number(m.range) || 0);
  }
  return best;
}

/** Can the observer perceive the subject without ordinary sight (Blindsight, Tremorsense, Truesight)? */
function perceivesWithoutSight(observer, observerToken, subject, subjectToken, { invisible = false } = {}) {
  const d = tokenDistance(observerToken, subjectToken) ?? Infinity;
  const within = range => range > 0 && d <= range;
  if (within(senseRange(observer, "blindsight")) || within(detectionRange(observerToken, ["senseAll", "blindsight"]))) return true;
  const grounded = !hasStatus(subject, "flying") && !hasStatus(subject, "hovering");
  if (grounded && (within(senseRange(observer, "tremorsense")) || within(detectionRange(observerToken, ["feelTremor"])))) return true;
  if (invisible && !hasStatus(observer, "blinded")) {
    if (within(senseRange(observer, "truesight")) || within(detectionRange(observerToken, ["seeAll", "seeInvisibility", "senseInvisibility"]))) return true;
  }
  return false;
}

/**
 * Can the observer see a creature on the Ethereal Plane? Only from the Ethereal Plane itself, or
 * with Truesight or See Invisibility (or a similar detection mode) in range.
 */
function seesEthereal(observer, observerToken, subjectToken) {
  if (hasStatus(observer, "ethereal")) return true;
  if (hasStatus(observer, "blinded")) return false;
  const d = tokenDistance(observerToken, subjectToken) ?? Infinity;
  const within = range => range > 0 && d <= range;
  return within(senseRange(observer, "truesight")) || within(detectionRange(observerToken, ["seeAll", "seeInvisibility", "senseInvisibility"]));
}

/** Can the observer see the subject, as far as conditions and senses go? */
function canSeeCreature(observer, observerToken, subject, subjectToken) {
  if (hasStatus(subject, "ethereal") && !seesEthereal(observer, observerToken, subjectToken)) return false;
  const blind = hasStatus(observer, "blinded");
  const invisible = hasStatus(subject, "invisible");
  if (!blind && !invisible) return true;
  return perceivesWithoutSight(observer, observerToken, subject, subjectToken, { invisible: invisible && !blind });
}

/** dnd5e's own condition sets (e.g. Poisoned, Exhaustion 3 under the 2014 rules), with the statuses that trigger them. */
function dnd5eConditionReasons(actor, key) {
  if (typeof actor?.hasConditionEffect !== "function" || !actor.hasConditionEffect(key)) return [];
  const reasons = [];
  for (const prop of CONFIG.DND5E?.conditionEffects?.[key] ?? []) {
    const [status] = String(prop).split("-");
    if (hasStatus(actor, status)) reasons.push(statusDisplayName(status));
  }
  return reasons.length ? reasons : [statusDisplayName(key)];
}

/** The creature behind one of this creature's conditions (e.g. its grappler or charmer), from the effect's origin. */
function conditionSource(actor, status) {
  for (const effect of actor?.effects ?? []) {
    if (effect.disabled || effect.active === false || !effect.statuses?.has?.(status) || !effect.origin) continue;
    try {
      const origin = typeof fromUuidSync === "function" ? fromUuidSync(effect.origin, { strict: false }) : null;
      const source = origin?.documentName === "Actor" ? origin : (origin?.actor ?? origin?.parent?.actor ?? null);
      if (source) return source;
    } catch { /* unknown origin */ }
  }
  return null;
}

const sameActor = (a, b) => !!a && !!b && (a === b || (a.uuid && a.uuid === b.uuid));

/** Why an attack roll has Advantage or Disadvantage, from the attacker's and the target's conditions. */
function attackModifiers(attacker, attackerToken, target, targetToken, ability) {
  const adv = new Set(), dis = new Set();
  const name = statusDisplayName;
  const versus = id => loc("MIGHTYGUARD.Rolls.Target").replace("{status}", name(id));

  // The attacker's own conditions
  for (const id of COND_RULES.ownAttackDisadvantage) if (hasStatus(attacker, id)) dis.add(name(id));
  dnd5eConditionReasons(attacker, "attackDisadvantage").forEach(r => dis.add(r));
  if (CONFIG.DND5E?.abilities?.[ability]?.type === "physical") dnd5eConditionReasons(attacker, "physicalAttackDisadvantage").forEach(r => dis.add(r));
  for (const [id, abilities] of Object.entries(COND_RULES.abilityDisadvantage)) {
    if (hasStatus(attacker, id) && abilities.includes(ability)) dis.add(name(id));
  }
  if (hasStatus(attacker, "blinded") && !(target && perceivesWithoutSight(attacker, attackerToken, target, targetToken))) dis.add(name("blinded"));
  for (const id of COND_RULES.hidden) {
    if (hasStatus(attacker, id) && !(target && canSeeCreature(target, targetToken, attacker, attackerToken))) adv.add(name(id));
  }
  if (hasStatus(attacker, "grappled") && target) {
    const grappler = conditionSource(attacker, "grappled");
    if (grappler && !sameActor(grappler, target)) dis.add(name("grappled"));
  }
  if (!target) return { adv, dis };

  // The target's conditions
  for (const id of COND_RULES.targetGrantsAdvantage) if (hasStatus(target, id)) adv.add(versus(id));
  if (hasStatus(target, "blinded") && !perceivesWithoutSight(target, targetToken, attacker, attackerToken)) adv.add(versus("blinded"));
  for (const id of COND_RULES.hidden) {
    if (hasStatus(target, id) && !canSeeCreature(attacker, attackerToken, target, targetToken)) dis.add(versus(id));
  }
  if (hasStatus(target, "prone")) {
    const d = tokenDistance(attackerToken, targetToken);
    if (d !== null) (d <= 5 ? adv : dis).add(versus("prone"));
  }
  if (dodgeActive(target) && canSeeCreature(target, targetToken, attacker, attackerToken)) dis.add(versus("dodging"));
  return { adv, dis };
}

// Strength and Dexterity saving throws fail automatically; hits from within 5 ft are Critical Hits
const AUTO_FAIL_STATUSES = ["paralyzed", "petrified", "stunned", "unconscious"];
const AUTO_FAIL_ABILITIES = ["str", "dex"];
const CRIT_WITHIN_5FT_STATUSES = ["paralyzed", "unconscious"];
const CRIT_ANY_RANGE_STATUSES = ["helpless"];   // Monsters of Drakkenheim: any hit against you is a Critical Hit

/** The conditions that make this saving throw fail automatically. */
function autoFailReasons(actor, ability) {
  if (!AUTO_FAIL_ABILITIES.includes(ability)) return [];
  return AUTO_FAIL_STATUSES.filter(id => hasStatus(actor, id)).map(statusDisplayName);
}

/** The target's conditions that turn a hit from this attacker into a Critical Hit. */
function autoCritReasons(attackerToken, target, targetToken) {
  if (!target) return [];
  const reasons = CRIT_ANY_RANGE_STATUSES.filter(id => hasStatus(target, id));
  const d = tokenDistance(attackerToken, targetToken);
  if (d !== null && d <= 5) reasons.push(...CRIT_WITHIN_5FT_STATUSES.filter(id => hasStatus(target, id)));
  return reasons.map(id => loc("MIGHTYGUARD.Rolls.Target").replace("{status}", statusDisplayName(id)));
}

function appendFlavor(message, note) {
  const data = message?.data;
  if (!note || !data || typeof data !== "object") return;
  data.flavor = data.flavor ? `${data.flavor} (${note})` : note;
}

/**
 * Once a roll's dice are rolled: an automatic failure totals −1 (whatever was rolled), a
 * desperation attack hits and its damage is raised (09-desperation.js), and an attack marked
 * "critical on a hit" that hits (meets the target's AC, and isn't a natural 1) becomes a Critical
 * Hit, so its damage is rolled as critical.
 */
function afterRollEvaluated(roll) {
  try {
    const o = roll?.options;
    if (!o || !roll._evaluated) return;
    if (o.mgAutoFail && roll._total !== -1) roll._total = -1;
    if (o.mgDesperationCheck || o.mgDesperation) desperationAfterRoll(roll);
    if (o.mgDesperateDamage && !roll._mgDesperateDamage) { roll._mgDesperateDamage = true; boostDesperateDamage(roll); }
    if (o.mgHalfDamage && !roll._mgHalved) { roll._mgHalved = true; halveDamageRoll(roll); }
    const crit = o.mgCritOnHit;
    if (crit && !roll.isCritical) {
      const d20 = roll.d20, natural = Number(d20?.total);
      if (Number.isFinite(natural) && natural > 1 && Number.isFinite(Number(crit.ac)) && roll.total >= Number(crit.ac)) {
        o.criticalSuccess = Math.min(Number(o.criticalSuccess) || 20, natural);
        if (d20.options) d20.options.criticalSuccess = o.criticalSuccess;
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not finish a roll's automatic result`, err);
  }
}

/** Why a saving throw has Disadvantage (the ones dnd5e doesn't handle itself). */
function saveModifiers(actor, ability) {
  const adv = new Set(), dis = new Set();
  const physical = CONFIG.DND5E?.abilities?.[ability]?.type === "physical" || ["str", "dex", "con"].includes(ability);
  // The rules dnd5e prepares itself are applied here as well, so they hold even if they don't reach the roll
  if (ability === "dex") {
    if (dodgeActive(actor)) adv.add(statusDisplayName("dodging"));
    if (hasStatus(actor, HASTE_ID)) adv.add(statusDisplayName(HASTE_ID));
    if (hasStatus(actor, "restrained")) dis.add(statusDisplayName("restrained"));
    dnd5eConditionReasons(actor, "dexteritySaveAdvantage").forEach(r => adv.add(r));
    dnd5eConditionReasons(actor, "dexteritySaveDisadvantage").forEach(r => dis.add(r));
  }
  dnd5eConditionReasons(actor, "abilitySaveDisadvantage").forEach(r => dis.add(r));
  if (physical) dnd5eConditionReasons(actor, "physicalSaveDisadvantage").forEach(r => dis.add(r));
  for (const [id, abilities] of Object.entries({ ...COND_RULES.abilityDisadvantage, ...COND_RULES.saveDisadvantage })) {
    if (hasStatus(actor, id) && abilities.includes(ability)) dis.add(statusDisplayName(id));
  }
  return { adv, dis };
}

/** Why an ability check (or initiative) has Advantage or Disadvantage. */
function checkModifiers(actor, ability, initiative, target = null) {
  const adv = new Set(), dis = new Set();
  // The charmer has Advantage on Charisma checks to deal with the creature it has Charmed
  if (target && ability === "cha" && hasStatus(target, "charmed") && sameActor(conditionSource(target, "charmed"), actor)) {
    adv.add(loc("MIGHTYGUARD.Rolls.Target").replace("{status}", statusDisplayName("charmed")));
  }
  if (hasStatus(actor, "frightened")) dis.add(statusDisplayName("frightened"));
  if (hasStatus(actor, "poisoned")) dis.add(statusDisplayName("poisoned"));
  const physical = CONFIG.DND5E?.abilities?.[ability]?.type === "physical" || ["str", "dex", "con"].includes(ability);
  // The rules dnd5e prepares itself are applied here as well, so they hold even if they don't reach the roll
  dnd5eConditionReasons(actor, "abilityCheckDisadvantage").forEach(r => dis.add(r));
  if (physical) dnd5eConditionReasons(actor, "physicalCheckDisadvantage").forEach(r => dis.add(r));
  if (initiative) {
    dnd5eConditionReasons(actor, "initiativeAdvantage").forEach(r => adv.add(r));
    dnd5eConditionReasons(actor, "initiativeDisadvantage").forEach(r => dis.add(r));
  }
  for (const [id, abilities] of Object.entries(COND_RULES.abilityDisadvantage)) {
    if (hasStatus(actor, id) && abilities.includes(ability)) dis.add(statusDisplayName(id));
  }
  return { adv, dis };
}

/*
 * The roll window's highlighted button is what Enter (or a quick click) rolls, and it can be picked
 * before this module adds its conditions: Midi-QOL sets it from its own Advantage flags on an earlier
 * hook, so a Sickened Constitution save showed "Normal" and rolled without Disadvantage. Once the
 * conditions are in, the default button is set again from everything the roll now has.
 */
function syncDialogDefault(config, dialog) {
  if (!dialog || typeof dialog !== "object") return;
  try {
    const first = config.rolls?.[0]?.options ?? {};
    const adv = !!(first.advantage || config.advantage), dis = !!(first.disadvantage || config.disadvantage);
    const button = adv && !dis ? "advantage" : (dis && !adv ? "disadvantage" : "normal");
    dialog.options ??= {};
    dialog.options.defaultButton = button;
    const modes = CONFIG.Dice?.D20Roll?.ADV_MODE;
    if (modes && dialog.options.advantageMode !== undefined) dialog.options.advantageMode = modes[button.toUpperCase()];
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not set the roll window's default button`, err);
  }
}

/** Put Advantage / Disadvantage on a pending dnd5e roll and say why in its chat message. */
function applyRollModifiers(config, message, { adv, dis }, dialog = null) {
  if (!adv.size && !dis.size) return false;
  for (const roll of config.rolls ?? []) {
    roll.options ??= {};
    if (adv.size) roll.options.advantage = true;
    if (dis.size) roll.options.disadvantage = true;
  }
  if (adv.size) config.advantage = true;
  if (dis.size) config.disadvantage = true;
  syncDialogDefault(config, dialog);
  const parts = [];
  if (adv.size) parts.push(`${loc("MIGHTYGUARD.Rolls.Advantage")}: ${[...adv].join(", ")}`);
  if (dis.size) parts.push(`${loc("MIGHTYGUARD.Rolls.Disadvantage")}: ${[...dis].join(", ")}`);
  appendFlavor(message, parts.join("; "));
  return true;
}

function conditionRollsEnabled() {
  try { return game.system?.id === "dnd5e" && game.settings.get(MODULE_ID, "conditionRolls"); }
  catch { return false; }
}

function attackRollConditions(config, message, dialog) {
  const activity = config.subject;
  const attacker = activity?.actor ?? activity?.item?.actor;
  if (!attacker) return;
  const targets = [...(game.user?.targets ?? [])].filter(t => t.actor);
  const targetToken = targets.length === 1 ? targets[0] : null;   // several targets: only the attacker's own conditions
  const ability = config.ability ?? config.rolls?.[0]?.options?.ability ?? activity?.ability;
  const attackerToken = tokenForActor(attacker), target = targetToken?.actor ?? null;
  applyRollModifiers(config, message, attackModifiers(attacker, attackerToken, target, targetToken, ability), dialog);
  applyConditionDice(attacker, config, message);
  const crit = autoCritReasons(attackerToken, target, targetToken);
  // Frozen (Monsters of Drakkenheim): Helpless against bludgeoning weapon attacks
  if (target && hasStatus(target, "frozen") && !hasStatus(target, "helpless") && bludgeoningWeaponAttack(activity)) {
    crit.push(loc("MIGHTYGUARD.Rolls.Target").replace("{status}", statusDisplayName("frozen")));
  }
  const ac = Number(target?.system?.attributes?.ac?.value);
  if (crit.length && Number.isFinite(ac)) {
    for (const roll of config.rolls ?? []) { roll.options ??= {}; roll.options.mgCritOnHit = { ac }; }
    appendFlavor(message, `${loc("MIGHTYGUARD.Rolls.CritOnHit")}: ${crit.join(", ")}`);
  }
}

function savingThrowConditions(config, message, dialog) {
  const actor = config.subject;
  if (actor?.documentName !== "Actor") return;
  const fails = autoFailReasons(actor, config.ability);
  if (fails.length) {
    for (const roll of config.rolls ?? []) { roll.options ??= {}; roll.options.mgAutoFail = true; }
    appendFlavor(message, `${loc("MIGHTYGUARD.Rolls.AutoFail")}: ${fails.join(", ")}`);
    return;
  }
  applyRollModifiers(config, message, saveModifiers(actor, config.ability), dialog);
  applyConditionDice(actor, config, message);
}

function abilityCheckConditions(config, message, hookNames, dialog) {
  const actor = config.subject;
  if (actor?.documentName !== "Actor") return;
  const initiative = hookNames.includes("initiativedialog");
  const ability = config.ability ?? config.rolls?.[0]?.data?.abilityId
    ?? (initiative ? (actor.system?.attributes?.init?.ability || "dex") : undefined);
  const targets = [...(game.user?.targets ?? [])].filter(t => t.actor && t.actor !== actor);
  applyRollModifiers(config, message, checkModifiers(actor, ability, initiative, targets.length === 1 ? targets[0].actor : null), dialog);
}

/*
 * dnd5e calls a chain of pre-roll hooks for each roll (e.g. preRollSkillV2, preRollAbilityCheckV2,
 * preRollD20TestV2) and ends with the generic dnd5e.preRollV2. Applying the conditions there,
 * last, means another module's own advantage handling on the specific hooks can't clear them.
 */
Hooks.on("dnd5e.preRollV2", (config, dialog, message) => {
  if (!conditionRollsEnabled()) return;
  const hookNames = (config?.hookNames ?? []).map(h => String(h).toLowerCase());
  try {
    if (hookNames.includes("attack")) attackRollConditions(config, message, dialog);
    else if (hookNames.includes("damage")) damageRollConditions(config, message);
    else if (hookNames.includes("savingthrow")) savingThrowConditions(config, message, dialog);
    else if (hookNames.includes("abilitycheck")) abilityCheckConditions(config, message, hookNames, dialog);
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not apply conditions to the roll`, err);
  }
});

// ===== src/04-status-palette.js =====
/* -------------------------------------------- */
/*  Status palette: search box and hidden icons */
/* -------------------------------------------- */

/** Remembers the search text while the HUD re-renders after each toggle. */
const paletteSearch = { tokenId: null, query: "" };

/** Iterate CONFIG.statusEffects whether it's an array (v12/v13) or a record (v14). */
function allStatusEffects() {
  const list = CONFIG.statusEffects;
  return Array.isArray(list) ? list : Object.values(list ?? {});
}

function hiddenStatusIds() {
  try { return new Set(game.settings.get(MODULE_ID, "hiddenStatuses") ?? []); }
  catch { return new Set(); }
}

/** Statuses a GM can choose to hide (the ones the system itself shows in the palette). */
function hideableStatuses() {
  return allStatusEffects().filter(s => s?.id && (("_mgOrigHud" in s) ? s._mgOrigHud : s.hud) !== false);
}

/** Keep hidden statuses out of the Token HUD palette using Foundry's own `hud: false` flag. */
function applyHiddenStatuses() {
  const hidden = hiddenStatusIds();
  for (const status of allStatusEffects()) {
    if (!status?.id) continue;
    if (!("_mgOrigHud" in status)) status._mgOrigHud = status.hud;
    if (hidden.has(status.id)) status.hud = false;
    else if (status._mgOrigHud === undefined) delete status.hud;
    else status.hud = status._mgOrigHud;
  }
  const hud = canvas?.tokens?.hud;
  if (hud?.rendered) hud.render();
}

function statusLabel(el) {
  const id = el.dataset.statusId;
  const fromConfig = allStatusEffects().find(s => s.id === id)?.name;
  return String(el.dataset.tooltipText ?? el.dataset.tooltip ?? el.getAttribute("title") ?? el.getAttribute("alt")
    ?? (fromConfig ? game.i18n.localize(fromConfig) : id) ?? "");
}

/**
 * Monsters of Drakkenheim statuses (its conditions, Contamination, and Burning, which the system
 * provides), listed in a section of their own.
 */
const DRAKKENHEIM_SECTION_EXTRAS = ["burning", "bleeding"];
function isDrakkenheimStatus(id) {
  return id === CONTAM_ID || DRAKKENHEIM_CONDITIONS.includes(id) || DRAKKENHEIM_SECTION_EXTRAS.includes(id);
}

/** Sort by name, the way people read them (ignoring case and accents). */
function byName(getName) {
  const collator = new Intl.Collator(game.i18n?.lang || undefined, { sensitivity: "base", numeric: true });
  return (a, b) => collator.compare(getName(a), getName(b));
}

/**
 * Put the palette's icons in alphabetical order, with the Monsters of Drakkenheim ones after a
 * heading of their own. Returns the heading (or null when there are none).
 */
function sortPaletteIcons(palette, icons) {
  const sorted = [...icons].sort(byName(statusLabel));
  const main = sorted.filter(i => !isDrakkenheimStatus(i.dataset.statusId));
  const drakk = sorted.filter(i => isDrakkenheimStatus(i.dataset.statusId));
  palette.querySelector(".mg-palette-heading")?.remove();
  let heading = null;
  if (drakk.length) {
    heading = document.createElement("div");
    heading.className = "mg-palette-heading";
    heading.textContent = loc("MIGHTYGUARD.Animations.Group.drakkenheim");
    Object.assign(heading.style, {
      gridColumn: "1 / -1", margin: "4px 0 2px", padding: "3px 0 0", borderTop: "1px solid rgba(201, 170, 113, 0.5)",
      color: "#c9aa71", fontSize: "11px", lineHeight: "13px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden",
      textOverflow: "ellipsis", pointerEvents: "none"
    });
  }
  palette.append(...main, ...(heading ? [heading] : []), ...drakk);
  return heading;
}

/**
 * Show every icon without scrolling: Foundry caps the palette's height and scrolls the rest, so the
 * cap is lifted. If the whole palette would then run off the bottom of the screen, it gets more
 * columns (as many as it takes, while it stays on screen sideways); only if even that can't fit it
 * does it keep a scrollbar, limited to the screen.
 */
const PALETTE_MAX_COLUMNS = 12;

function fitPaletteToScreen(palette) {
  if (!palette?.isConnected || !palette.classList.contains("active")) return;
  palette.style.maxHeight = "none";
  palette.style.overflowY = "visible";
  const base = paletteColumns(palette);
  const rect = palette.getBoundingClientRect();
  if (!base || !(rect.height > 0)) return;
  const margin = 8, vh = window.innerHeight, vw = window.innerWidth;
  const fits = r => r.bottom <= vh - margin;
  if (fits(rect)) return;
  const icons = palette.querySelectorAll("[data-status-id]").length;
  const setColumns = n => { palette.style.gridTemplateColumns = `repeat(${n}, ${base.size})`; };
  const most = Math.min(icons, PALETTE_MAX_COLUMNS);
  let count = base.count, widest = base.count, found = false;
  for (let n = base.count + 1; n <= most; n++) {
    setColumns(n);
    const r = palette.getBoundingClientRect();
    if (r.right > vw - margin) break;            // no wider than the screen
    widest = n;
    if (fits(r)) { count = n; found = true; break; }
  }
  // Nothing fits: as wide as allowed, and the rest scrolls (below)
  if (!found) count = widest;
  setColumns(count);
  palette.dataset.mgFitColumns = String(count);
  // Still too tall (a tiny screen): scroll, but only within the screen
  const r = palette.getBoundingClientRect();
  if (!fits(r)) {
    const scale = r.height / (palette.offsetHeight || r.height) || 1;   // the HUD is scaled with the canvas zoom
    palette.style.maxHeight = `${Math.max(80, Math.floor((vh - margin - r.top) / scale))}px`;
    palette.style.overflowY = "auto";
  }
}

/** Parse the palette's grid columns, e.g. "repeat(5, 25px)" or "25px 25px 25px". */
function paletteColumns(palette) {
  const template = palette.dataset.mgColumns ?? getComputedStyle(palette).gridTemplateColumns ?? "";
  palette.dataset.mgColumns = template;
  const repeat = template.match(/repeat\(\s*(\d+)\s*,\s*([^)]+)\)/);
  if (repeat) return { count: Number(repeat[1]), size: repeat[2].trim() };
  const parts = template.split(/\s+/).filter(p => p && p !== "none");
  return parts.length ? { count: parts.length, size: parts[0] } : null;
}

Hooks.on("renderTokenHUD", (hud, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const palette = root?.querySelector(".status-effects, .palette[data-palette='effects']");
  if (!palette || palette.querySelector(".mg-status-search")) return;

  // Fallback for systems that ignore `hud: false`: hide the icons directly.
  const hidden = hiddenStatusIds();
  const icons = [...palette.querySelectorAll("[data-status-id]")];
  for (const icon of icons) {
    if (hidden.has(icon.dataset.statusId)) { icon.style.display = "none"; icon.dataset.mgHidden = "true"; }
  }
  // Alphabetical, with the Monsters of Drakkenheim statuses in their own section
  const heading = sortPaletteIcons(palette, icons);
  const shown = [...palette.querySelectorAll("[data-status-id]")].filter(i => !i.dataset.mgHidden);

  // Shrink the grid to fit when only a few icons remain (rows shrink on their own).
  const cols = paletteColumns(palette);
  if (cols && shown.length < cols.count) {
    const count = Math.max(Math.min(cols.count, 3), shown.length);
    palette.style.gridTemplateColumns = `repeat(${count}, ${cols.size})`;
  }

  // Search box spanning the full width of the palette
  const input = document.createElement("input");
  input.type = "search";
  input.className = "mg-status-search";
  input.placeholder = game.i18n.localize("MIGHTYGUARD.Search.Placeholder");
  input.setAttribute("aria-label", input.placeholder);
  input.autocomplete = "off";
  Object.assign(input.style, {
    gridColumn: "1 / -1", width: "100%", height: "24px", minWidth: "0", boxSizing: "border-box",
    margin: "0 0 4px 0", padding: "0 6px", fontSize: "12px", color: "#f0f0e0",
    background: "rgba(0, 0, 0, 0.65)", border: "1px solid #7a7971", borderRadius: "4px"
  });
  palette.prepend(input);

  const filter = () => {
    const q = input.value.trim().toLowerCase();
    paletteSearch.query = input.value;
    for (const icon of shown) {
      icon.style.display = (!q || statusLabel(icon).toLowerCase().includes(q)) ? "" : "none";
    }
    // The heading shows only while some Drakkenheim status is showing under it
    if (heading) heading.style.display = shown.some(i => i.style.display !== "none" && isDrakkenheimStatus(i.dataset.statusId)) ? "" : "none";
  };

  input.addEventListener("input", filter);
  input.addEventListener("keydown", event => {
    event.stopPropagation(); // don't trigger Foundry keybindings while typing
    if (event.key === "Escape") {
      if (input.value) { input.value = ""; filter(); } else input.blur();
      event.preventDefault();
    } else if (event.key === "Enter") {
      shown.find(i => i.style.display !== "none")?.click(); // toggle the first match
      event.preventDefault();
    }
  });
  for (const type of ["click", "pointerdown", "mousedown", "contextmenu"]) {
    input.addEventListener(type, event => event.stopPropagation());
  }

  // Keep the search text when the HUD re-renders for the same token.
  const tokenId = hud.object?.id ?? null;
  if (tokenId !== paletteSearch.tokenId) { paletteSearch.tokenId = tokenId; paletteSearch.query = ""; }
  input.value = paletteSearch.query;
  filter();

  // Focus the search box whenever the palette is opened.
  const focusIfOpen = () => {
    if (!palette.classList.contains("active")) return;
    fitPaletteToScreen(palette);
    input.focus({ preventScroll: true });
  };
  new MutationObserver(focusIfOpen).observe(palette, { attributes: true, attributeFilter: ["class"] });
  fitPaletteToScreen(palette);
});

/**
 * Contamination levels from the status palette when the system doesn't do it (dnd5e 6 does):
 * left-click adds a level, right-click removes one, and the icon shows the current level.
 */
Hooks.on("renderTokenHUD", (hud, html) => {
  if (systemHasLeveledConditions()) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const icon = root?.querySelector(`[data-status-id="${CONTAM_ID}"]`);
  const actor = hud.object?.actor ?? hud.actor;
  if (!icon || !actor || icon.dataset.mgLevels) return;
  icon.dataset.mgLevels = "true";
  const paint = () => {
    const level = contaminationLevel(actor);
    icon.style.objectPosition = level ? "-100px" : "";
    icon.style.background = level ? `url("${contaminationIcon(level)}") no-repeat center / contain` : "";
  };
  paint();
  const change = delta => event => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    changeContamination(actor, delta)
      .then(paint)
      .catch(err => console.error(`${MODULE_ID} | Could not change contamination`, err));
  };
  icon.addEventListener("click", change(1));
  icon.addEventListener("contextmenu", change(-1));
});

// ===== src/05-status-pane.js =====
/* -------------------------------------------- */
/*  Status palette: pane with the status text   */
/* -------------------------------------------- */

/**
 * Foundry only reads a module's stylesheets from module.json when it rescans packages (on
 * restart or returning to setup), so add the link ourselves if it isn't on the page yet.
 */
function loadStylesheet() {
  if (typeof document === "undefined") return;
  const href = `${MODULE_PATH}/styles/${MODULE_ID}.css`;
  if ([...document.querySelectorAll("link[rel=stylesheet]")].some(l => (l.getAttribute("href") ?? "").includes(href))) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

const statusTextCache = new Map();   // effect text / status rules → enriched HTML

function textEditorClass() {
  return foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
}

/** Every effect that applies to the actor, including ones carried by its items. */
function applicableEffects(actor) {
  try {
    if (typeof actor?.allApplicableEffects === "function") return [...actor.allApplicableEffects()];
  } catch { /* fall back to the actor's own effects */ }
  return [...(actor?.effects ?? [])];
}

function statusConfig(id) {
  const list = CONFIG.statusEffects;
  return Array.isArray(list) ? list.find(s => s.id === id) : list?.[id];
}

/**
 * Rules for statuses that dnd5e doesn't link to a rules page itself. These are the 2024 Rules
 * Glossary entries (the same wording as 5e.tools' XPHB entries, which are in the SRD 5.2), taken
 * from dnd5e's own SRD rules compendium: first by the key dnd5e uses for the rule (so the right
 * page is used for legacy rules too), then by the page in the 2024 rules.
 */
const SRD_RULES = "Compendium.dnd5e.content24.JournalEntry.phbAppendixCRule.JournalEntryPage";
const STATUS_RULES = {
  concentrating: { keys: ["concentrating", "concentration"], page: "0a2umg2mJMAzM9Q3" },
  coverHalf: { keys: ["cover"], page: "pGXkTaY8kLgqQuDa" },
  coverThreeQuarters: { keys: ["cover"], page: "pGXkTaY8kLgqQuDa" },
  coverTotal: { keys: ["cover"], page: "pGXkTaY8kLgqQuDa" },
  surprised: { keys: ["surprise"], page: "8gPSPovZD9reqFet" },
  dodging: { keys: ["dodge"], page: "3YJIuyCMmuUrfmuX" },
  hiding: { keys: ["hide"], page: "rqhOsUY4wWa1oHTy" },
  flying: { keys: ["flying"], page: "ozHhbP8JVHCJAx0b" },
  hovering: { keys: ["hover"], page: "HiJGoeVyu4nhm6a3" },
  burrowing: { keys: ["burrowspeed", "burrow"], page: "g7DDgHsdjxZUqGD2" },
  bloodied: { keys: ["bloodied"], page: "shZaSIlFPpHufPFn" },
  stable: { keys: ["stable"], page: "klXWp4c90n7Kt5LB" },
  dead: { keys: ["dead"], page: "OP0YhS6iOm4yfPIt" }
};

/** The rules page for a status, if one is known (dnd5e only). */
function statusRulesReference(id) {
  const status = statusConfig(id);
  const reference = status?.reference ?? CONFIG.DND5E?.conditionTypes?.[id]?.reference;
  if (reference) return reference;
  const known = STATUS_RULES[id];
  if (!known || game.system?.id !== "dnd5e") return null;
  for (const key of known.keys) {
    const rule = CONFIG.DND5E?.rules?.[key];
    const uuid = typeof rule === "string" ? rule : rule?.reference;
    if (uuid) return uuid;
  }
  return game.packs?.get?.("dnd5e.content24") ? `${SRD_RULES}.${known.page}` : null;
}

/** A status's own rules text: its description, or its rules page embedded. */
function statusRulesText(id) {
  const status = statusConfig(id);
  if (status?.description) return loc(status.description);
  const reference = statusRulesReference(id);
  return reference ? `@Embed[${reference} inline]` : "";
}

function statusDisplayName(id) {
  const status = statusConfig(id);
  return loc(status?.name ?? status?.label ?? id);
}

async function enrichText(text, effect) {
  if (!text) return "";
  try {
    return await textEditorClass().enrichHTML(text, { async: true, relativeTo: effect, secrets: !!effect?.isOwner });
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not enrich effect text`, err);
    return text;
  }
}

/** Where an effect comes from (its item, or the item or creature it originated from), if known. */
function effectSource(effect) {
  try {
    if (effect.parent?.documentName === "Item") return effect.parent.name ?? "";
    if (effect.origin && typeof fromUuidSync === "function") {
      const origin = fromUuidSync(effect.origin, { strict: false });
      if (origin?.name && origin !== effect.parent) return origin.name;
    }
  } catch { /* origin not available */ }
  return "";
}

/**
 * How long an effect has left ("2 Rounds", "9 Minutes"), or "" if it lasts until removed. Dodging
 * that this module ends at the creature's next turn says so.
 */
function effectRemaining(effect) {
  try {
    const d = effect.duration;
    const label = typeof d?.label === "string" ? d.label.trim() : "";
    const limited = !d || !("remaining" in d) || Number.isFinite(d.remaining);
    if (label && limited && !/^none$/i.test(label)) return label;
  } catch { /* no duration */ }
  if (endsAtNextTurn(effect)) return loc("MIGHTYGUARD.StatusPane.UntilNextTurn");
  return "";
}

/** Can this user remove the effect from the pane? (Its own effect on a creature they own; not one an item carries.) */
function effectRemovable(effect) {
  if (!effect || typeof effect.delete !== "function" || !effect.id) return false;
  if (effect.parent?.documentName === "Item") return false;
  return !!(effect.isOwner ?? effect.parent?.isOwner);
}

/** Keep pictures inside the text small (they're mostly icons). */
function shrinkImages(html) {
  if (!html || !html.includes("<img") || typeof document === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const img of template.content.querySelectorAll("img")) {
    img.removeAttribute("width");
    img.removeAttribute("height");
    Object.assign(img.style, { maxWidth: "32px", maxHeight: "32px", width: "auto", height: "auto", verticalAlign: "middle", border: "none" });
  }
  return template.innerHTML;
}

/** Enrich text once and keep it (rules pages and effect descriptions rarely change). */
async function enrichCached(key, text, effect) {
  if (!text) return "";
  if (statusTextCache.size > 400) statusTextCache.clear();
  if (!statusTextCache.has(key)) statusTextCache.set(key, shrinkImages(await enrichText(text, effect)));
  return statusTextCache.get(key);
}

function effectTextKey(effect) {
  return `${effect.uuid ?? effect.id}|${effect._stats?.modifiedTime ?? ""}|${effect.name}|${effect.description?.length ?? 0}`;
}

/** Active effects that give the actor a status, in the order their statuses sit in the palette. */
function paneEffects(actor, order) {
  const effects = applicableEffects(actor).filter(e => !e.disabled && e.active !== false && !e.isSuppressed && e.statuses?.size);
  const rank = id => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  const first = e => Math.min(...[...e.statuses].map(rank));
  return effects.map((e, i) => ({ e, r: first(e), i })).sort((a, b) => (a.r - b.r) || (a.i - b.i)).map(x => x.e);
}

/**
 * One effect in the pane: icon, name, source and duration, then its own text (if it has any)
 * and the rules for each status it gives. A status's rules appear once, under the first effect
 * giving it (so Unconscious shows the Incapacitated and Prone rules, and they aren't repeated).
 */
async function effectPaneSection(effect, shownRules) {
  const statuses = [...effect.statuses];
  const own = String(effect.description ?? "").trim();
  const body = [];
  if (own) {
    // The effect's text may already be a status's rules (e.g. an embedded rules page)
    const ownIs = statuses.find(id => {
      const rules = statusRulesText(id), reference = statusRulesReference(id);
      return own === rules || (reference && own.includes(reference));
    });
    if (ownIs) shownRules.add(ownIs);
    const html = await enrichCached(`own|${effectTextKey(effect)}`, own, effect);
    if (html) body.push(`<div class="mg-sp-own"${ownIs ? ` data-status-id="${escapeHTML(ownIs)}"` : ""}>${html}</div>`);
  }
  for (const id of statuses) {
    if (shownRules.has(id)) continue;
    shownRules.add(id);
    const html = await enrichCached(`rules|${id}`, statusRulesText(id), effect);
    if (!html) continue;
    const name = statusDisplayName(id);
    const named = body.length > 0 || !String(effect.name ?? "").toLowerCase().startsWith(name.toLowerCase());
    body.push(`<div class="mg-sp-rules" data-status-id="${escapeHTML(id)}">${named ? `<strong>${escapeHTML(name)}</strong>` : ""}${html}</div>`);
  }
  const source = effectSource(effect);
  const remaining = effectRemaining(effect);
  const img = effect.img
    ? `<img src="${escapeHTML(effect.img)}" alt="" width="28" height="28" style="width:28px;height:28px;max-width:28px;max-height:28px;object-fit:contain;flex:none;">`
    : "";
  const time = remaining
    ? `<span class="mg-sp-time" data-tooltip="${escapeHTML(loc("MIGHTYGUARD.StatusPane.Remaining"))}"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ${escapeHTML(remaining)}</span>`
    : "";
  const removeLabel = escapeHTML(loc("MIGHTYGUARD.StatusPane.Remove").replace("{name}", effect.name ?? ""));
  const remove = effectRemovable(effect)
    ? `<button type="button" class="mg-sp-remove" data-effect-id="${escapeHTML(effect.id)}" aria-label="${removeLabel}" data-tooltip="${removeLabel}">&times;</button>`
    : "";
  return `<section class="mg-sp-effect" data-statuses="${escapeHTML(statuses.join(" "))}">`
    + `<header style="display:flex;align-items:center;gap:0.5rem;">${img}<div class="mg-sp-title"><strong>${escapeHTML(effect.name)}</strong>`
    + `${source ? `<small>${escapeHTML(source)}</small>` : ""}</div>${time}${remove}</header>`
    + valueRowHTML(effect)
    + `<div class="mg-sp-text">${body.join("") || `<p class="mg-sp-none">${escapeHTML(loc("MIGHTYGUARD.Tooltip.NoText"))}</p>`}</div></section>`;
}

/**
 * Jinxed (X), Valor (X), Burning (X) and Bleeding (X): a box for X under the effect's name, with
 * buttons for the usual values. Burning also has buttons for its damage type (Fire or Acid), apart
 * from the box: the box holds only the dice. Shown as plain text to someone who can't change it.
 */
function valueRowHTML(effect) {
  const id = valueStatusOf(effect);
  if (!id) return "";
  const config = VALUE_STATUSES[id];
  const value = effectStatusValue(effect) ?? config.fallback;
  const label = escapeHTML(loc(`MIGHTYGUARD.StatusValue.${settingLabel(id)}`));
  if (!effectRemovable(effect)) return `<div class="mg-sp-value"><span class="mg-sp-value-label">${label}</span> <strong>${escapeHTML(value)}</strong></div>`;
  const eid = escapeHTML(effect.id);
  const { formula, type } = config.types ? splitValueType(value) : { formula: value, type: null };
  const chips = config.choices.map(v => `<button type="button" class="mg-sp-chip${v === formula ? " active" : ""}" data-effect-id="${eid}" data-value="${escapeHTML(v)}" aria-pressed="${v === formula}">${escapeHTML(v)}</button>`).join("");
  let types = "";
  if (config.types) {
    const current = type ?? config.defaultType;
    const list = config.types.includes(current) ? config.types : [...config.types, current];   // a type named some other way still shows
    types = `<span class="mg-sp-types" role="group" aria-label="${escapeHTML(loc("MIGHTYGUARD.StatusValue.Type"))}">`
      + list.map(t => `<button type="button" class="mg-sp-chip mg-sp-type${t === current ? " active" : ""}" data-effect-id="${eid}" data-type="${escapeHTML(t)}" aria-pressed="${t === current}">${escapeHTML(damageTypeLabel(t))}</button>`).join("")
      + `</span>`;
  }
  return `<div class="mg-sp-value${config.types ? " mg-sp-typed" : ""}"${config.types ? ` data-type="${escapeHTML(type ?? config.defaultType)}"` : ""}><label class="mg-sp-value-label" for="mg-sp-value-${eid}">${label}</label>`
    + types
    + `<input type="text" id="mg-sp-value-${eid}" class="mg-sp-value-input" data-effect-id="${eid}" value="${escapeHTML(formula)}" placeholder="${escapeHTML(config.fallback)}"`
    + ` size="7" maxlength="40" spellcheck="false" autocomplete="off" data-tooltip="${escapeHTML(loc("MIGHTYGUARD.StatusValue.Hint"))}">`
    + `<span class="mg-sp-chips">${chips}</span></div>`;
}

/** The pane's contents: every active status effect on the actor, in full ("" if there are none). */
async function statusPaneHTML(actor, order, title) {
  const effects = paneEffects(actor, order);
  if (!effects.length) return "";
  const shownRules = new Set();
  const sections = [];
  for (const effect of effects) sections.push(await effectPaneSection(effect, shownRules));
  return `<header class="mg-sp-head"><span>${escapeHTML(loc("MIGHTYGUARD.StatusPane.Title"))}</span>`
    + `${title ? `<span class="mg-sp-who">${escapeHTML(title)}</span>` : ""}</header><div class="mg-sp-body">${sections.join("")}</div>`;
}

/*
 * The pane lives outside the HUD (so it doesn't shrink with the canvas zoom) and is placed beside
 * the open palette: to its right, or to the left of the whole HUD when there isn't room, never over
 * the icons. While it's showing, it follows the HUD each frame (panning, zooming, a moved token).
 */
const PANE = { width: 380, minWidth: 200, minHeight: 360, gap: 10, margin: 8, minColumn: 230, columnGap: 14, maxColumns: 4 };
const statusPane = { el: null, palette: null, hud: null, actor: null, html: "", run: 0, raf: 0, placed: "", highlight: null, focusValue: null };

function statusPaneEnabled() {
  try { return !!game.settings.get(MODULE_ID, "statusTooltips"); } catch { return false; }
}

function statusPaneElement() {
  if (statusPane.el?.isConnected) return statusPane.el;
  const el = document.createElement("aside");
  el.id = "mg-status-pane";
  el.className = "mg-status-pane";
  el.hidden = true;
  el.setAttribute("aria-live", "polite");
  el.addEventListener("click", event => {
    const chip = event.target?.closest?.(".mg-sp-chip");
    if (chip && el.contains(chip)) {
      event.preventDefault();
      event.stopPropagation();
      if (chip.dataset.type) setPaneEffectType(chip.dataset.effectId, chip.dataset.type);
      else setPaneEffectValue(chip.dataset.effectId, chip.dataset.value, chip);
      return;
    }
    const button = event.target?.closest?.(".mg-sp-remove");
    if (!button || !el.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    removePaneEffect(button.dataset.effectId, button);
  });
  // The value box: Enter (or leaving it) saves, Escape puts it back; typing never reaches Foundry's keys
  for (const type of ["keydown", "keyup", "keypress"]) {
    el.addEventListener(type, event => {
      const input = event.target?.closest?.(".mg-sp-value-input");
      if (!input) return;
      event.stopPropagation();
      if (type !== "keydown") return;
      input.classList.remove("mg-sp-invalid");
      if (event.key === "Enter") { event.preventDefault(); setPaneEffectValue(input.dataset.effectId, input.value, input); }
      else if (event.key === "Escape") { event.preventDefault(); input.value = input.defaultValue; input.blur(); }
    });
  }
  el.addEventListener("change", event => {
    const input = event.target?.closest?.(".mg-sp-value-input");
    if (input) setPaneEffectValue(input.dataset.effectId, input.value, input);
  });
  document.body.append(el);
  statusPane.el = el;
  statusPane.placed = "";
  return el;
}

/** The pane's remove button: delete the effect, then show its statuses as off in the palette. */
async function removePaneEffect(id, button) {
  const { actor, palette, hud } = statusPane;
  const effect = applicableEffects(actor).find(e => e?.id === id);
  if (!effect || !effectRemovable(effect)) return;
  if (button) button.disabled = true;
  const statuses = [...(effect.statuses ?? [])];
  try { await effect.delete(); }
  catch (err) {
    console.warn(`${MODULE_ID} | Could not remove the effect`, err);
    if (button) button.disabled = false;
    return;
  }
  // Foundry redraws the palette on its next render; until then, show the statuses as off here
  for (const sid of statuses) {
    if (actor?.statuses?.has?.(sid)) continue;
    const sel = globalThis.CSS?.escape ? CSS.escape(sid) : String(sid).replace(/["\\]/g, "\\$&");
    palette?.querySelector?.(`[data-status-id="${sel}"]`)?.classList.remove("active");
  }
  refreshStatusPane(palette, actor, hud);
}

/**
 * Save a value typed (or picked) in the pane on its effect; an invalid one is marked and not saved.
 * For Burning the box holds only the dice: the damage type picked beside it is kept, unless what was
 * typed names one ("2d4 acid").
 */
async function setPaneEffectValue(id, raw, control) {
  const effect = applicableEffects(statusPane.actor).find(e => e?.id === id);
  if (!effect || !effectRemovable(effect)) return false;
  const sid = valueStatusOf(effect);
  let value = normalizeStatusValue(raw, sid);
  if (value && VALUE_STATUSES[sid]?.types && !splitValueType(value).type) {
    const current = splitValueType(effectStatusValue(effect) ?? "").type;
    value = valueWithType(value, current, sid);
  }
  const input = control?.classList?.contains("mg-sp-value-input") ? control : statusPane.el?.querySelector?.(`.mg-sp-value-input[data-effect-id="${id}"]`);
  if (!value) {
    input?.classList.add("mg-sp-invalid");
    input?.setAttribute("aria-invalid", "true");
    return false;
  }
  input?.classList.remove("mg-sp-invalid");
  input?.removeAttribute("aria-invalid");
  if (input) input.value = VALUE_STATUSES[sid]?.types ? splitValueType(value).formula : value;
  const wantedName = nameWithValue(effect, valueStatusOf(effect), value);
  if (normalizeStatusValue(moduleFlag(effect, "value"), valueStatusOf(effect)) === value && (!wantedName || wantedName === effect.name)) return true;   // nothing to change
  try { return await setEffectStatusValue(effect, value); }
  catch (err) { console.warn(`${MODULE_ID} | Could not set the value`, err); return false; }
}

/** Burning's damage type, picked in the pane: the dice stay as they are. */
async function setPaneEffectType(id, type) {
  const effect = applicableEffects(statusPane.actor).find(e => e?.id === id);
  if (!effect || !effectRemovable(effect)) return false;
  const sid = valueStatusOf(effect);
  if (!VALUE_STATUSES[sid]?.types) return false;
  const config = VALUE_STATUSES[sid];
  const now = effectStatusValue(effect) ?? config.fallback;
  const value = valueWithType(splitValueType(now).formula, type, sid);
  if (!value) return false;
  const wantedName = nameWithValue(effect, sid, value);
  if (normalizeStatusValue(moduleFlag(effect, "value"), sid) === value && (!wantedName || wantedName === effect.name)) return true;
  try { return await setEffectStatusValue(effect, value); }
  catch (err) { console.warn(`${MODULE_ID} | Could not set the damage type`, err); return false; }
}

function hideStatusPane() {
  if (statusPane.raf) cancelAnimationFrame(statusPane.raf);
  statusPane.raf = 0;
  statusPane.placed = "";
  if (statusPane.el) statusPane.el.hidden = true;
}

/** Room on screen not taken by the sidebar (right) or the scene controls (left). */
function paneScreenEdges() {
  const vw = window.innerWidth;
  let lo = 0, hi = vw;
  for (const sel of ["#sidebar", "#ui-right"]) {
    const r = document.querySelector(sel)?.getBoundingClientRect?.();
    if (r?.width && r.left > vw / 2) { hi = r.left; break; }
  }
  for (const sel of ["#scene-controls", "#controls"]) {
    const r = document.querySelector(sel)?.getBoundingClientRect?.();
    if (r?.width && r.right < vw / 2) { lo = r.right; break; }
  }
  return { lo: lo + PANE.margin, hi: hi - PANE.margin };
}

/** Place the pane beside the open palette; false when there's nothing to show (stops the loop). */
function placeStatusPane() {
  const { el, palette } = statusPane;
  if (!el) return false;
  const open = palette?.isConnected && palette.classList.contains("active") && statusPane.html && statusPaneEnabled();
  const rect = open ? palette.getBoundingClientRect() : null;
  if (!rect?.width || !rect?.height) { el.hidden = true; statusPane.placed = ""; return false; }
  const hudEl = statusPane.hud?.element instanceof HTMLElement ? statusPane.hud.element : statusPane.hud?.element?.[0];
  const hudRect = hudEl?.isConnected ? hudEl.getBoundingClientRect() : null;
  const left = Math.min(rect.left, hudRect?.width ? hudRect.left : rect.left);
  const right = Math.max(rect.right, hudRect?.width ? hudRect.right : rect.right);
  const { lo, hi } = paneScreenEdges();
  const vh = window.innerHeight;
  const key = [rect.left, rect.top, left, right, lo, hi, vh, statusPane.html.length].map(Math.round).join("|");
  if (el.hidden) el.hidden = false;
  if (key === statusPane.placed) return true;
  statusPane.placed = key;

  const roomR = hi - (right + PANE.gap), roomL = (left - PANE.gap) - lo;
  let side, w;
  if (roomR >= PANE.width) { w = PANE.width; side = "right"; }
  else if (roomL >= PANE.width) { w = PANE.width; side = "left"; }
  else if (roomR >= roomL) { w = Math.max(PANE.minWidth, roomR); side = "right"; }
  else { w = Math.max(PANE.minWidth, roomL); side = "left"; }
  // Tall enough to show everything: when one column would run past the screen, more columns side
  // by side (as many as fit beside the HUD, on whichever side has room for them)
  const scroll = el.scrollTop;   // measuring the layout loses it
  const fit = fitPaneColumns(el, side, w, { right: roomR, left: roomL }, vh - 2 * PANE.margin);
  side = fit.side; w = fit.width;
  const x = side === "right" ? right + PANE.gap : left - PANE.gap - w;
  el.style.width = `${Math.round(w)}px`;
  el.style.left = `${Math.round(x)}px`;
  // Level with the top of the palette and down to the bottom of the screen (scrolling only if even
  // the columns can't hold it all); moved up as far as it takes to show everything.
  el.style.maxHeight = `${Math.max(120, vh - 2 * PANE.margin)}px`;
  const natural = el.offsetHeight;
  const anchor = Math.max(rect.top, PANE.margin);
  const height = Math.min(natural, vh - 2 * PANE.margin);
  const top = Math.max(PANE.margin, Math.min(anchor, vh - PANE.margin - height));
  el.style.top = `${Math.round(top)}px`;
  el.style.maxHeight = `${Math.max(120, Math.round(vh - PANE.margin - top))}px`;
  if (scroll) el.scrollTop = scroll;
  return true;
}

/**
 * Show the whole pane within the screen's height: one column if it fits, else two, three... while
 * they fit (each at least PANE.minColumn wide) beside the HUD, trying the other side of the HUD too
 * when it has more room; failing that, the rules text a little smaller (12px, then 11px). Only if
 * none of that is enough does the pane scroll. Returns the side and width; leaves the layout set.
 */
function fitPaneColumns(el, side, width, room, avail) {
  const body = el.querySelector(".mg-sp-body");
  const measure = (cols, w, font) => {
    el.style.width = `${Math.round(w)}px`;
    el.style.fontSize = font ? `${font}px` : "";
    if (body) body.style.columnCount = cols > 1 ? String(cols) : "";
    return el.offsetHeight;
  };
  el.style.maxHeight = "none";
  if (!body || measure(1, width) <= avail) return { side, width };
  const other = side === "right" ? "left" : "right";
  const sides = room[other] > room[side] ? [side, other] : [side];
  let best = null;
  for (const font of [null, 12, 11]) {
    const tries = [{ side, width, cols: 1 }];
    for (const s of sides) {
      const most = Math.min(PANE.maxColumns, Math.floor((room[s] + PANE.columnGap) / (PANE.minColumn + PANE.columnGap)));
      for (let cols = 2; cols <= most; cols++) {
        const column = Math.min(PANE.width, (room[s] - (cols - 1) * PANE.columnGap) / cols);
        tries.push({ side: s, width: cols * column + (cols - 1) * PANE.columnGap, cols });
      }
    }
    for (const t of tries) {
      if (!font && t.cols === 1) continue;   // already measured
      const h = measure(t.cols, t.width, font);
      if (!best || h < best.h) best = { ...t, font, h };
      if (h <= avail) return { side: t.side, width: t.width };
    }
  }
  // Too much even so: the layout that comes closest, scrolling the rest
  measure(best.cols, best.width, best.font);
  return { side: best.side, width: best.width };
}

function startStatusPaneLoop() {
  if (statusPane.raf || typeof requestAnimationFrame !== "function") return;
  const step = () => {
    statusPane.raf = 0;
    if (placeStatusPane()) statusPane.raf = requestAnimationFrame(step);
  };
  step();
}

/** Hovering a status in the palette highlights its text in the pane. */
function highlightPaneStatus(id) {
  statusPane.highlight = id ?? null;
  const el = statusPane.el;
  if (!el) return null;
  for (const n of el.querySelectorAll(".mg-sp-hl")) n.classList.remove("mg-sp-hl");
  if (!id) return null;
  const sel = globalThis.CSS?.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, "\\$&");
  const block = el.querySelector(`[data-status-id="${sel}"]`);
  const section = block?.closest(".mg-sp-effect")
    ?? [...el.querySelectorAll(".mg-sp-effect")].find(s => (s.dataset.statuses ?? "").split(" ").includes(id));
  if (!section) return null;
  section.classList.add("mg-sp-hl");
  block?.classList.add("mg-sp-hl");
  return block ?? section;
}

function watchPaneHover(palette) {
  if (palette._mgPaneHover) return;
  palette._mgPaneHover = true;
  palette.addEventListener("pointerover", event => {
    const icon = event.target?.closest?.("[data-status-id]");
    const id = icon?.dataset.statusId ?? null;
    if (id === statusPane.highlight) return;
    const target = highlightPaneStatus(id);
    try { target?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); } catch { /* old browsers */ }
  });
  palette.addEventListener("pointerleave", () => highlightPaneStatus(null));
}

/** Rebuild the pane for the creature whose HUD is open. */
async function refreshStatusPane(palette, actor, hud) {
  const run = ++statusPane.run;
  if (!palette || !actor || !statusPaneEnabled() || typeof document === "undefined") {
    statusPane.html = "";
    hideStatusPane();
    return;
  }
  Object.assign(statusPane, { palette, actor, hud });
  watchPaneHover(palette);
  const order = [...palette.querySelectorAll("[data-status-id]")].map(i => i.dataset.statusId);
  let html = "";
  try { html = await statusPaneHTML(actor, order, hud?.object?.name ?? actor.name); }
  catch (err) { console.warn(`${MODULE_ID} | Could not build the status pane`, err); }
  if (run !== statusPane.run) return;   // a newer refresh has taken over
  const el = statusPaneElement();
  if (html !== statusPane.html || !el.innerHTML) {
    const scroll = el.scrollTop;
    // someone typing in a value box keeps their place (and what they've typed) through the redraw
    const typing = document.activeElement?.closest?.(".mg-sp-value-input") && el.contains(document.activeElement) ? document.activeElement : null;
    const kept = typing ? { id: typing.dataset.effectId, value: typing.value, changed: typing.value !== typing.defaultValue, start: typing.selectionStart, end: typing.selectionEnd } : null;
    el.innerHTML = html;
    el.scrollTop = scroll;
    statusPane.html = html;
    statusPane.placed = "";
    if (statusPane.highlight) highlightPaneStatus(statusPane.highlight);
    if (kept) {
      const again = el.querySelector(`.mg-sp-value-input[data-effect-id="${kept.id}"]`);
      if (again) {
        if (kept.changed) again.value = kept.value;
        again.focus({ preventScroll: true });
        try { again.setSelectionRange(kept.start, kept.end); } catch { /* not a text box */ }
      }
    }
  }
  focusNewValue(el);
  if (html) startStatusPaneLoop();
  else hideStatusPane();
}

/**
 * A value status this user has just put on (from the palette, say): its box gets the focus, with its
 * value selected, so typing a new one and pressing Enter is all it takes.
 */
const VALUE_FOCUS_MS = 4000;
function focusNewValue(el) {
  const wanted = statusPane.focusValue;
  if (!wanted || !el) return;
  if (Date.now() > wanted.until) { statusPane.focusValue = null; return; }
  const input = el.querySelector(`.mg-sp-value-input[data-effect-id="${wanted.id}"]`);
  if (!input || el.hidden) return;
  statusPane.focusValue = null;
  input.focus({ preventScroll: true });
  try { input.select(); } catch { /* not a text box */ }
}

Hooks.on("createActiveEffect", (effect, options, userId) => {
  if (userId !== game.user?.id || !valueStatusOf(effect) || !effect?.id) return;
  statusPane.focusValue = { id: effect.id, until: Date.now() + VALUE_FOCUS_MS };
});

function hudPalette(hud) {
  const el = hud?.element;
  const root = el instanceof HTMLElement ? el : el?.[0];
  return root?.querySelector?.(".status-effects, .palette[data-palette='effects']") ?? null;
}

function refreshOpenHudPane() {
  const hud = canvas?.tokens?.hud;
  const actor = hud?.object?.actor ?? hud?.actor;
  if (hud?.rendered && actor) refreshStatusPane(hudPalette(hud), actor, hud);
  else { statusPane.html = ""; hideStatusPane(); }
}

Hooks.on("renderTokenHUD", (hud, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const palette = root?.querySelector(".status-effects, .palette[data-palette='effects']");
  const actor = hud.object?.actor ?? hud.actor;
  if (!palette || !actor) { hideStatusPane(); return; }
  refreshStatusPane(palette, actor, hud);
  // Opening the palette, or toggling a status while the HUD stays open, only changes classes.
  if (!palette._mgPaneObserver) {
    let pending = null;
    palette._mgPaneObserver = new MutationObserver(records => {
      if (records.some(r => r.target === palette)) startStatusPaneLoop();
      if (!records.some(r => r.target?.dataset?.statusId && r.attributeName === "class")) return;
      clearTimeout(pending);
      pending = setTimeout(() => refreshStatusPane(palette, hud.object?.actor ?? actor, hud), 50);
    });
    palette._mgPaneObserver.observe(palette, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }
});

Hooks.on("closeTokenHUD", () => hideStatusPane());

// An effect changed on the creature whose HUD is open (e.g. a new level): refresh the pane.
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
  Hooks.on(hook, effect => {
    const hud = canvas?.tokens?.hud;
    const actor = hud?.object?.actor;
    if (!actor || !hud.rendered) return;
    const owner = effect?.parent?.documentName === "Item" ? effect.parent.parent : effect?.parent;
    if (owner !== actor && owner?.uuid !== actor.uuid) return;
    setTimeout(() => refreshStatusPane(hudPalette(hud), actor, hud), 0);
  });
}

// ===== src/06-settings-windows.js =====
/* -------------------------------------------- */
/*  Settings window: token animations           */
/* -------------------------------------------- */

/** Every animation toggle, in the groups the Token animations window shows them in. */
const ANIMATION_GROUPS = [
  { id: "statuses", keys: ["pulse", "motionOutline", "concentrationFx", "coverFog", "charmHearts", "sleepZs", "markedFx", "dodgingFx", "deadSkull", "dyingFx"] },
  { id: "conditions", keys: ["bloodiedFx", "proneFx", "bleedingFx", "poisonedFx", "restrainedFx", "grappledFx", "stunnedFx", "frightenedFx",
    "petrifiedFx", "paralyzedFx", "diseasedFx", "incapacitatedFx", "cursedFx"] },
  { id: "levels", keys: ["contaminationFx", "exhaustionFx", "levelCounters"] },
  { id: "drakkenheim", keys: ["addledFx", "clumsyFx", "enfeebledFx", "sickenedFx", "defenselessFx", "helplessFx",
    "immobilizedFx", "entangledFx", "frozenFx", "shockedFx", "jinxedFx", "valorFx", "burningFx",
    "bewilderedFx", "distractedFx", "staggeredFx", "madnessFx", "dazedFx", "weakenedFx"] },
  { id: "display", keys: ["hideAnimatedIcons"] }
];
const ANIMATION_KEYS = ANIMATION_GROUPS.flatMap(g => g.keys);
const ANIMATION_QUALITIES = ["auto", "full", "reduced", "still"];

/**
 * The GM's animation choices for everyone: each player takes them once, when the GM gives them or
 * the next time they log in, and can change their own again afterwards. Animation quality isn't
 * included: it depends on each player's computer (and their system's reduced-motion setting).
 */
async function applyAnimationDefaults() {
  let defaults, applied;
  try {
    defaults = game.settings.get(MODULE_ID, "animationDefaults");
    applied = Number(game.settings.get(MODULE_ID, "animationDefaultsApplied")) || 0;
  } catch { return; }
  const stamp = Number(defaults?.stamp) || 0;
  const values = defaults?.values;
  if (!stamp || stamp <= applied || !values || typeof values !== "object") return;
  const jobs = [];
  for (const key of ANIMATION_KEYS) {
    if (typeof values[key] === "boolean" && values[key] !== game.settings.get(MODULE_ID, key)) jobs.push(game.settings.set(MODULE_ID, key, values[key]));
  }
  const changed = jobs.length;
  jobs.push(game.settings.set(MODULE_ID, "animationDefaultsApplied", stamp));
  try { await Promise.all(jobs); } catch (err) { console.warn(`${MODULE_ID} | Could not apply the GM's animation choices`, err); return; }
  if (changed && !game.user?.isGM) globalThis.ui?.notifications?.info?.(loc("MIGHTYGUARD.Animations.ApplyToEveryone.Applied"));
}

/** "bleedingFx" → "BleedingFx", the part of its language keys. */
function settingLabel(key) {
  return key[0].toUpperCase() + key.slice(1);
}

/** The settings the Token animations window saves, and who may change them. */
const ANIMATION_WINDOW_FIELDS = {
  animationQuality: { kind: "choice", gm: false },
  soundCues: { kind: "bool", gm: false },
  soundVolume: { kind: "number", gm: false, min: 0, max: 100 },
  pulseSeconds: { kind: "number", gm: true },
  grappleImagePath: { kind: "text", gm: true },
  grappleImageFit: { kind: "number", gm: true },
  deferToOtherModules: { kind: "bool", gm: true },
  ...Object.fromEntries(ANIMATION_KEYS.map(key => [key, { kind: "bool", gm: false }]))
};

/** The value an input in the Token animations window stands for, or undefined if it isn't valid. */
function animationFieldValue(key, input) {
  const field = ANIMATION_WINDOW_FIELDS[key];
  if (!field || !input) return undefined;
  if (field.kind === "bool") return !!input.checked;
  if (field.kind === "text") return String(input.value ?? "").trim();
  if (field.kind === "choice") return ANIMATION_QUALITIES.includes(input.value) ? input.value : undefined;
  const n = Number(input.value);
  if (!Number.isFinite(n)) return undefined;
  return field.max !== undefined ? Math.min(field.max, Math.max(field.min ?? n, n)) : n;
}

/** Save one setting from the window if it changed (and this user may change it). */
async function saveAnimationField(key, input) {
  const field = ANIMATION_WINDOW_FIELDS[key];
  if (!field || (field.gm && !game.user?.isGM)) return false;
  const value = animationFieldValue(key, input);
  if (value === undefined || value === game.settings.get(MODULE_ID, key)) return false;
  await game.settings.set(MODULE_ID, key, value);
  return true;
}

function makeAnimationsConfig() {
  const { ApplicationV2 } = foundry.applications.api;

  /*
   * Every choice is saved the moment it's made (ticked, picked, or a slider let go), so nothing
   * depends on reaching a save button; Done just closes the window. The window never grows taller
   * than the screen: its contents scroll instead.
   */
  return class AnimationsConfig extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: "mighty-guard-animations",
      tag: "form",
      classes: ["mighty-guard-animations"],
      window: { title: "MIGHTYGUARD.Animations.Title", icon: "fas fa-wand-magic-sparkles", contentClasses: ["standard-form"], resizable: true },
      position: { width: 620, height: "auto" },
      form: { handler: AnimationsConfig.onSubmit, closeOnSubmit: true },
      actions: {
        allOn: AnimationsConfig.onAllOn,
        allOff: AnimationsConfig.onAllOff,
        browse: AnimationsConfig.onBrowse,
        testSound: AnimationsConfig.onTestSound,
        giveEveryone: AnimationsConfig.onGiveEveryone
      }
    };

    async _renderHTML() {
      const L = key => escapeHTML(loc(key));
      const get = key => game.settings.get(MODULE_ID, key);
      const box = key => `
        <label class="mg-anim-row" data-tooltip="${escapeHTML(loc(`MIGHTYGUARD.Settings.${settingLabel(key)}.Hint`))}"
               style="display:flex;align-items:center;gap:6px;padding:1px 2px;min-width:0;">
          <input type="checkbox" name="${key}" ${get(key) ? "checked" : ""} style="flex:none;margin:0;">
          <span style="min-width:0;overflow-wrap:anywhere;">${L(`MIGHTYGUARD.Animations.Key.${key}`)}</span>
        </label>`;
      const quality = settingValue("animationQuality") ?? "auto";
      const qualityRow = `
        <div class="form-group mg-anim-quality" data-tooltip="${escapeHTML(loc("MIGHTYGUARD.Settings.AnimationQuality.Hint"))}" style="margin:0 0 4px;min-width:0;">
          <label style="min-width:0;overflow-wrap:anywhere;">${L("MIGHTYGUARD.Settings.AnimationQuality.Name")}</label>
          <div class="form-fields" style="min-width:0;"><select name="animationQuality" style="min-width:0;max-width:100%;">${ANIMATION_QUALITIES.map(q =>
            `<option value="${q}" ${q === quality ? "selected" : ""}>${L(`MIGHTYGUARD.Settings.AnimationQuality.${q}`)}</option>`).join("")}</select></div>
        </div>`;
      const volume = Number(get("soundVolume")) || 0;
      const soundRow = `
        <div class="mg-anim-sound" style="display:flex;align-items:center;gap:8px;">
          <label class="mg-anim-row" data-tooltip="${escapeHTML(loc("MIGHTYGUARD.Settings.SoundCues.Hint"))}" style="display:flex;align-items:center;gap:6px;padding:1px 2px;flex:1 1 auto;min-width:0;">
            <input type="checkbox" name="soundCues" ${get("soundCues") ? "checked" : ""} style="flex:none;margin:0;">
            <span style="min-width:0;overflow-wrap:anywhere;">${L("MIGHTYGUARD.Settings.SoundCues.Name")}</span>
          </label>
          <input type="range" name="soundVolume" min="0" max="100" step="5" value="${volume}" aria-label="${L("MIGHTYGUARD.Settings.SoundVolume.Name")}"
                 data-tooltip="${L("MIGHTYGUARD.Settings.SoundVolume.Name")}" style="flex:0 0 110px;">
          <span class="mg-range-value" style="flex:0 0 2.2em;text-align:right;">${volume}</span>
          <button type="button" data-action="testSound" style="flex:0 0 auto;width:auto;" data-tooltip="${L("MIGHTYGUARD.Animations.TestSound")}" aria-label="${L("MIGHTYGUARD.Animations.TestSound")}"><i class="fas fa-volume-high"></i></button>
        </div>`;
      const groups = ANIMATION_GROUPS.map(g => `
        <fieldset class="mg-anim-group" data-group="${g.id}" style="margin:0 0 8px;padding:4px 8px 6px;min-width:0;">
          <legend>${L(`MIGHTYGUARD.Animations.Group.${g.id}`)}</legend>
          ${g.id === "display" ? qualityRow : ""}
          <div class="mg-anim-grid" style="display:grid;grid-template-columns:${g.keys.length > 1 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)"};grid-template-rows:repeat(${Math.ceil(g.keys.length / (g.keys.length > 1 ? 2 : 1))}, auto);grid-auto-flow:column;gap:1px 12px;">${[...g.keys].sort(byName(key => loc(`MIGHTYGUARD.Animations.Key.${key}`))).map(box).join("")}</div>
          ${g.id === "display" ? soundRow : ""}
        </fieldset>`).join("");
      const range = (key, min, max, step) => `
        <div class="form-group" style="min-width:0;">
          <label style="min-width:0;overflow-wrap:anywhere;">${L(`MIGHTYGUARD.Settings.${key === "grappleImageFit" ? "GrappleImageScale" : settingLabel(key)}.Name`)}</label>
          <div class="form-fields">
            <input type="range" name="${key}" min="${min}" max="${max}" step="${step}" value="${escapeHTML(get(key))}">
            <span class="mg-range-value" style="flex:0 0 3em;text-align:right;">${escapeHTML(get(key))}</span>
          </div>
        </div>`;
      const shared = game.user?.isGM ? `
        <fieldset class="mg-anim-group" data-group="shared" style="margin:0 0 8px;padding:4px 8px 6px;min-width:0;">
          <legend>${L("MIGHTYGUARD.Animations.Group.shared")}</legend>
          ${range("pulseSeconds", 1, 20, 0.5)}
          <div class="form-group">
            <label>${L("MIGHTYGUARD.Settings.GrappleImage.Name")}</label>
            <div class="form-fields">
              <input type="text" name="grappleImagePath" value="${escapeHTML(get("grappleImagePath"))}" placeholder="${L("MIGHTYGUARD.Animations.DrawnTalons")}">
              <button type="button" data-action="browse" style="flex:0 0 auto;width:auto;" data-tooltip="${L("MIGHTYGUARD.Animations.Browse")}"><i class="fas fa-file-import"></i></button>
            </div>
          </div>
          ${range("grappleImageFit", 0.5, 1.6, 0.05)}
          <label class="mg-shared-row mg-anim-defer" data-tooltip="${L("MIGHTYGUARD.Settings.DeferToOtherModules.Hint")}"
                 style="display:flex;align-items:center;gap:6px;padding:3px 2px 1px;min-width:0;">
            <input type="checkbox" name="deferToOtherModules" ${get("deferToOtherModules") ? "checked" : ""} style="flex:none;margin:0;">
            <span style="min-width:0;overflow-wrap:anywhere;">${L("MIGHTYGUARD.Settings.DeferToOtherModules.Name")}</span>
          </label>
          <div class="mg-shared-row mg-anim-everyone" data-tooltip="${L("MIGHTYGUARD.Animations.ApplyToEveryone.Hint")}"
               style="display:flex;align-items:center;gap:8px;padding:4px 2px 1px;flex-wrap:wrap;">
            <button type="button" data-action="giveEveryone" style="flex:none;width:auto;"><i class="fas fa-users"></i> ${L("MIGHTYGUARD.Animations.ApplyToEveryone.Name")}</button>
            <span class="hint mg-last-given" style="margin:0;font-size:var(--font-size-12, 12px);">${AnimationsConfig.lastGivenText()}</span>
          </div>
        </fieldset>` : "";
      const div = document.createElement("div");
      div.innerHTML = `
        <p class="hint" style="margin-top:0;">${L("MIGHTYGUARD.Animations.Intro")}</p>
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-bottom:6px;">
          <button type="button" data-action="allOn" style="flex:none;width:auto;">${L("MIGHTYGUARD.Animations.AllOn")}</button>
          <button type="button" data-action="allOff" style="flex:none;width:auto;">${L("MIGHTYGUARD.Animations.AllOff")}</button>
        </div>
        ${groups}${shared}
        <footer class="form-footer" style="margin-top:4px;">
          <button type="submit"><i class="fas fa-check"></i> ${L("MIGHTYGUARD.Animations.Done")}</button>
        </footer>`;
      return div;
    }

    static lastGivenText() {
      const givenAt = Number(game.settings.get(MODULE_ID, "animationDefaults")?.stamp) || 0;
      return givenAt ? escapeHTML(loc("MIGHTYGUARD.Animations.ApplyToEveryone.Last").replace("{date}", new Date(givenAt).toLocaleString())) : "";
    }

    _replaceHTML(result, content) {
      content.replaceChildren(result);
      // Never taller than the screen: the contents scroll instead
      content.style.overflowY = "auto";
      if (this.element) this.element.style.maxHeight = "calc(100vh - 20px)";
      for (const input of content.querySelectorAll("input[type=range]")) {
        const out = input.parentElement?.querySelector(".mg-range-value");
        input.addEventListener("input", () => { if (out) out.textContent = input.value; });
      }
      // Save each choice as it's made ("change": a box ticked, a menu picked, a slider let go, text entered)
      content.addEventListener("change", event => {
        const input = event.target;
        if (input?.name in ANIMATION_WINDOW_FIELDS) this.queueSave(() => saveAnimationField(input.name, input));
      });
      content.querySelector('[name="grappleImagePath"]')?.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); e.target.dispatchEvent(new Event("change", { bubbles: true })); }
      });
    }

    /** Run saves one after another (so "give everyone" sees the latest choices). */
    queueSave(job) {
      this._mgSaving = (this._mgSaving ?? Promise.resolve()).then(job).catch(err => {
        console.warn(`${MODULE_ID} | Could not save an animation choice`, err);
      });
      return this._mgSaving;
    }

    /** The animation checkboxes (not the status-icon option). */
    static animationBoxes(root) {
      return [...root.querySelectorAll(".mg-anim-group:not([data-group=display]):not([data-group=shared]) input[type=checkbox]")];
    }
    static setAll(app, on) {
      const boxes = AnimationsConfig.animationBoxes(app.element);
      boxes.forEach(c => { c.checked = on; });
      return app.queueSave(() => Promise.all(boxes.map(c => saveAnimationField(c.name, c))));
    }
    static onAllOn() { return AnimationsConfig.setAll(this, true); }
    static onAllOff() { return AnimationsConfig.setAll(this, false); }

    /** Play a sample at the volume the slider shows. */
    static onTestSound() {
      const helper = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
      const volume = Number(this.element.querySelector('[name="soundVolume"]')?.value ?? 50) / 100;
      try { helper?.play?.({ src: `${MODULE_PATH}/sounds/chime.ogg`, volume, autoplay: true, loop: false }, false); } catch { /* no audio */ }
    }

    static onBrowse() {
      const input = this.element.querySelector('[name="grappleImagePath"]');
      const Picker = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
      if (!input || !Picker) return;
      new Picker({ type: "image", current: input.value, callback: path => { input.value = path; input.dispatchEvent(new Event("change", { bubbles: true })); } }).render(true);
    }

    /** GM: give every player the animation choices as they are now. */
    static async onGiveEveryone() {
      if (!game.user?.isGM) return;
      await this.queueSave(async () => {
        const values = Object.fromEntries(ANIMATION_KEYS.map(key => [key, !!game.settings.get(MODULE_ID, key)]));
        await game.settings.set(MODULE_ID, "animationDefaults", { values, stamp: Date.now() });
      });
      const note = this.element?.querySelector(".mg-last-given");
      if (note) note.textContent = loc("MIGHTYGUARD.Animations.ApplyToEveryone.Last").replace("{date}", new Date(Number(game.settings.get(MODULE_ID, "animationDefaults")?.stamp) || Date.now()).toLocaleString());
      globalThis.ui?.notifications?.info?.(loc("MIGHTYGUARD.Animations.ApplyToEveryone.Given"));
    }

    /** Done (or Enter): anything not yet saved is saved, then the window closes. */
    static async onSubmit(event, form) {
      await this.queueSave(() => Promise.all(Object.keys(ANIMATION_WINDOW_FIELDS).map(key => {
        const input = form.querySelector(`[name="${key}"]`);
        return input ? saveAnimationField(key, input) : false;
      })));
    }
  };
}

/* -------------------------------------------- */
/*  Settings window: choose hidden statuses     */
/* -------------------------------------------- */

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function makeHiddenStatusesConfig() {
  const { ApplicationV2 } = foundry.applications.api;

  return class HiddenStatusesConfig extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: "mighty-guard-hidden-statuses",
      tag: "form",
      classes: ["mighty-guard-hidden-statuses"],
      window: { title: "MIGHTYGUARD.HiddenStatuses.Title", icon: "fas fa-eye-slash", contentClasses: ["standard-form"] },
      position: { width: 440, height: "auto" },
      form: { handler: HiddenStatusesConfig.onSubmit, closeOnSubmit: true },
      actions: {
        showAll: HiddenStatusesConfig.onShowAll,
        hideAll: HiddenStatusesConfig.onHideAll
      }
    };

    async _renderHTML() {
      const hidden = hiddenStatusIds();
      const all = hideableStatuses()
        .map(s => ({ id: s.id, name: game.i18n.localize(s.name ?? s.label ?? s.id), img: s.img ?? s.icon ?? "" }))
        .sort(byName(s => s.name));
      const row = s => `
          <label class="mg-status-row" data-name="${escapeHTML(s.name.toLowerCase())}"
                 style="display:flex;align-items:center;gap:8px;padding:2px 4px;">
            <input type="checkbox" name="show.${escapeHTML(s.id)}" ${hidden.has(s.id) ? "" : "checked"}>
            <img src="${escapeHTML(s.img)}" alt="" width="24" height="24" style="border:none;flex:none;background:rgba(0,0,0,0.5);border-radius:3px;">
            <span>${escapeHTML(s.name)}</span>
          </label>`;
      // Two columns, read down the first and then the second
      const grid = list => `<div class="mg-status-grid" style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));grid-template-rows:repeat(${Math.ceil(list.length / 2)}, auto);grid-auto-flow:column;gap:2px 8px;">${list.map(row).join("")}</div>`;
      const drakk = all.filter(s => isDrakkenheimStatus(s.id));
      const rows = grid(all.filter(s => !isDrakkenheimStatus(s.id))) + (drakk.length ? `
          <div class="mg-status-heading" style="margin:6px 0 2px;padding-top:4px;border-top:1px solid var(--color-border-light-2, #7a7971);font-weight:bold;">
            ${escapeHTML(loc("MIGHTYGUARD.Animations.Group.drakkenheim"))}</div>${grid(drakk)}` : "");
      const div = document.createElement("div");
      div.innerHTML = `
        <p class="hint">${escapeHTML(game.i18n.localize("MIGHTYGUARD.HiddenStatuses.Instructions"))}</p>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <input type="search" class="mg-config-search" placeholder="${escapeHTML(game.i18n.localize("MIGHTYGUARD.Search.Placeholder"))}" style="flex:1;">
          <button type="button" data-action="showAll" style="flex:none;width:auto;">${escapeHTML(game.i18n.localize("MIGHTYGUARD.HiddenStatuses.ShowAll"))}</button>
          <button type="button" data-action="hideAll" style="flex:none;width:auto;">${escapeHTML(game.i18n.localize("MIGHTYGUARD.HiddenStatuses.HideAll"))}</button>
        </div>
        <div class="mg-status-list" style="max-height:60vh;overflow-y:auto;">${rows}</div>
        <footer class="form-footer" style="margin-top:8px;">
          <button type="submit"><i class="fas fa-save"></i> ${escapeHTML(game.i18n.localize("MIGHTYGUARD.HiddenStatuses.Save"))}</button>
        </footer>`;
      return div;
    }

    _replaceHTML(result, content) {
      content.replaceChildren(result);
      const search = content.querySelector(".mg-config-search");
      search?.addEventListener("input", () => {
        const q = search.value.trim().toLowerCase();
        for (const row of content.querySelectorAll(".mg-status-row")) {
          row.style.display = (!q || row.dataset.name.includes(q)) ? "flex" : "none";
        }
        const heading = content.querySelector(".mg-status-heading");
        if (heading) heading.style.display = [...content.querySelectorAll(".mg-status-heading + .mg-status-grid .mg-status-row")].some(r => r.style.display !== "none") ? "" : "none";
      });
      search?.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });
    }

    static onShowAll() { this.element.querySelectorAll(".mg-status-row input[type=checkbox]").forEach(c => { c.checked = true; }); }
    static onHideAll() { this.element.querySelectorAll(".mg-status-row input[type=checkbox]").forEach(c => { c.checked = false; }); }

    static async onSubmit(event, form) {
      const hidden = [...form.querySelectorAll(".mg-status-row input[type=checkbox]")]
        .filter(c => !c.checked)
        .map(c => c.name.slice("show.".length));
      await game.settings.set(MODULE_ID, "hiddenStatuses", hidden);
    }
  };
}

// ===== src/07-token-config.js =====
/* -------------------------------------------- */
/*  Token settings: animations for one token    */
/* -------------------------------------------- */

const TOKEN_ANIMATIONS_FIELD = `flags.${MODULE_ID}.animations`;

/**
 * Add "Animate this token's statuses" to the Appearance tab of a token's settings (and of an actor's
 * prototype token), as the token's flag; unticked, the token shows no animations for anyone. It's
 * saved the moment it's ticked or unticked, so it doesn't depend on the window having (or showing)
 * a save button; it also stays part of the form, so saving the form saves the same value.
 */
function addTokenAnimationsField(app, html) {
  try {
    const root = html instanceof HTMLElement ? html : (html?.[0] ?? app?.element ?? null);
    if (!(root instanceof HTMLElement) || root.querySelector(`[name="${TOKEN_ANIMATIONS_FIELD}"]`)) return;
    const tab = root.querySelector('.tab[data-tab="appearance"]') ?? root.querySelector('.tab[data-tab="identity"]');
    if (!tab) return;
    const doc = app?.token ?? app?.document ?? app?.object;
    const group = document.createElement("div");
    group.className = "form-group mg-token-animations";
    group.innerHTML = `
      <label>${escapeHTML(loc("MIGHTYGUARD.TokenConfig.Animations.Name"))}</label>
      <div class="form-fields"><input type="checkbox" name="${TOKEN_ANIMATIONS_FIELD}" ${animationsOffFor(doc) ? "" : "checked"}></div>
      <p class="hint">${escapeHTML(loc("MIGHTYGUARD.TokenConfig.Animations.Hint"))}</p>`;
    tab.append(group);
    const input = group.querySelector("input");
    input.addEventListener("change", () => saveTokenAnimationsNow(app, doc, input.checked));
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not add the animations option to the token settings`, err);
  }
}

/**
 * Save the choice straight away: on the token itself, or on the actor's prototype token. The window
 * isn't redrawn (render: false), so other changes not yet saved in it are kept.
 */
async function saveTokenAnimationsNow(app, doc, on) {
  try {
    // The token in the scene (not a preview copy the window may be showing)
    if (app?.document?.documentName === "Token") doc = app.document;
    if (doc?.documentName === "Token") {
      if (!doc.id || typeof doc.update !== "function") return false;   // a token not created yet: saved with the form
      await doc.update({ [TOKEN_ANIMATIONS_FIELD]: !!on }, { render: false });
      return true;
    }
    const actor = app?.actor ?? doc?.parent ?? doc?.actor;
    if (actor?.documentName !== "Actor" || typeof actor.update !== "function") return false;
    await actor.update({ [`prototypeToken.${TOKEN_ANIMATIONS_FIELD}`]: !!on }, { render: false });
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not save the token's animation choice`, err);
    globalThis.ui?.notifications?.warn?.(loc("MIGHTYGUARD.TokenConfig.Animations.NotSaved"));
    return false;
  }
}

Hooks.on("renderTokenConfig", addTokenAnimationsField);
Hooks.on("renderPrototypeTokenConfig", addTokenAnimationsField);

/** Turn a token's animations on or off (for everyone who sees it). */
async function setTokenAnimations(token, on) {
  const doc = token?.document ?? token;
  if (!doc?.update) return;
  await doc.update({ [TOKEN_ANIMATIONS_FIELD]: !!on });
}

// Turning a token's animations on or off changes its icons (hidden or not, the Dead skull) and who can see it
Hooks.on("updateToken", (doc, change) => {
  const has = foundry.utils?.hasProperty;
  if (![MODULE_ID, ...LEGACY_MODULE_IDS].some(id => has?.(change ?? {}, `flags.${id}`))) return;
  const token = doc?.object;
  try {
    if (token && "redrawEffects" in (token.constructor?.RENDER_FLAGS ?? {})) token.renderFlags.set({ redrawEffects: true });
    else token?.drawEffects?.();
  } catch { /* not critical */ }
  setTimeout(refreshTokenVisibility, 0);
});
// ===== src/08-sounds.js =====
/* -------------------------------------------- */
/*  Sound cues (optional, per player)           */
/* -------------------------------------------- */

/*
 * A short sound when a status lands on a creature you can see: off unless a player turns it on in
 * the Token animations window. The sounds are synthesised by tools/make-sounds.py. Nothing plays
 * for creatures this player can't see (or that are unseen: Invisible, Ethereal), for tokens set to
 * show no animations, or on a canvas that isn't showing the creature.
 */
const SOUND_CUES = [
  { cue: "toll", pattern: /(^|[^a-z])dead$/i },
  { cue: "zap", pattern: /(^|[^a-z])(paraly[sz]ed|stunned|shocked)$/i },
  { cue: "stone", pattern: /(^|[^a-z])(petrified|frozen)$/i },
  { cue: "sleep", pattern: /(^|[^a-z])(unconscious|a?sleep(ing)?|incapacitated)$/i },
  { cue: "whoosh", pattern: /(^|[^a-z])(invisible|ethereal|dodg(e|ing))$/i },
  { cue: "flame", pattern: /(^|[^a-z])(burning|on-?fire|aflame|ignited)$/i },
  { cue: "splat", pattern: /(^|[^a-z])(bleed(ing)?|bloodied)$/i },
  { cue: "bubble", pattern: /(^|[^a-z])(poison(ed)?|diseased?|sickened)$/i },
  { cue: "drone", pattern: /(^|[^a-z])(frightened|afraid|scared|cursed|slow(ed)?|drakkenheimslowed|addled|jinxed|bewildered|distracted|drakkenheimmadness|madness)$/i },
  { cue: "chime", pattern: /(^|[^a-z])(charmed|hasted?|mighty-guard|valou?r)$/i },
  { cue: "ping", pattern: /(^|[^a-z])(marked|helpless)$/i },
  { cue: "thud", pattern: /(^|[^a-z])(prone|grappled|restrained|clumsy|enfeebled|defen[cs]eless|immobili[sz]ed|entangled|staggered)$/i }
];
const SOUND_GAP_MS = 400;          // one cue per creature at a time (Unconscious also adds Prone, ...)
const SOUND_BURST = { ms: 1000, max: 3 };
const soundLog = { byActor: new Map(), recent: [] };

function soundsEnabled() {
  try { return !!game.settings.get(MODULE_ID, "soundCues"); } catch { return false; }
}

/** The cue for a set of status IDs (the first match in the list above), or null. */
function soundCueFor(statuses) {
  const ids = [...(statuses ?? [])].filter(s => typeof s === "string");
  for (const { cue, pattern } of SOUND_CUES) if (ids.some(id => pattern.test(id))) return cue;
  return null;
}

/** Can this player see the creature on the current scene (and is it shown with animations)? */
function creatureAudible(actor) {
  let tokens = [];
  try { tokens = actor?.getActiveTokens?.(true) ?? []; } catch { return false; }
  return tokens.some(t => t && !t.destroyed && t.visible !== false && !animationsOffFor(t) && !effects.get(t)?.invis?.concealed);
}

function playSoundCue(cue) {
  const helper = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
  if (!cue || typeof helper?.play !== "function") return false;
  const volume = Math.min(1, Math.max(0, (Number(settingValue("soundVolume")) || 0) / 100));
  if (!(volume > 0)) return false;
  try { helper.play({ src: `${MODULE_PATH}/sounds/${cue}.ogg`, volume, autoplay: true, loop: false }, false); return true; }
  catch (err) { console.warn(`${MODULE_ID} | Could not play a sound`, err); return false; }
}

/** Play a cue for a creature, if this player wants sounds and can see it (and it isn't too soon). */
function soundForActor(actor, cue) {
  if (!cue || !actor || !soundsEnabled() || !creatureAudible(actor)) return false;
  const now = Date.now();
  const key = actor.uuid ?? actor;
  if (now - (soundLog.byActor.get(key) ?? 0) < SOUND_GAP_MS) return false;
  soundLog.recent = soundLog.recent.filter(t => now - t < SOUND_BURST.ms);
  if (soundLog.recent.length >= SOUND_BURST.max) return false;
  soundLog.byActor.set(key, now);
  soundLog.recent.push(now);
  return playSoundCue(cue);
}

// A status lands on a creature
Hooks.on("createActiveEffect", effect => {
  if (effect?.disabled || !soundsEnabled()) return;
  const actor = effect.parent?.documentName === "Item" ? effect.parent.parent : effect.parent;
  let cue = soundCueFor(effect.statuses);
  if (cue === "sleep" && isDying(actor)) cue = isMonster(actor) ? "toll" : "heartbeat";   // falling unconscious at 0 HP
  soundForActor(actor, cue);
});

// Dropping to 0 Hit Points: a heartbeat (a monster: the bell, as it dies)
Hooks.on("updateActor", (actor, change) => {
  if (!soundsEnabled()) return;
  const value = foundry.utils?.getProperty?.(change, "system.attributes.hp.value");
  if (value === undefined || Number(value) > 0) return;
  if (!(Number(actor?.system?.attributes?.hp?.max) > 0)) return;
  soundForActor(actor, isMonster(actor) ? "toll" : "heartbeat");
});
// ===== src/09-automation.js =====
/* -------------------------------------------- */
/*  Automation: Dodging ends, Dead at 3 failures */
/* -------------------------------------------- */

/**
 * Changes to creatures are made by one client only: the active GM's (or, with no GM connected,
 * the user who made the change), so they never happen twice.
 */
function isAutomationClient(userId) {
  const gm = game.users?.activeGM;
  if (gm) return gm.isSelf ?? gm.id === game.user?.id;
  return !userId || userId === game.user?.id;
}

function automationSetting(key) {
  try { return !!game.settings.get(MODULE_ID, key); } catch { return false; }
}

const DODGING_PATTERN = /(^|[^a-z])dodg(e|ing)$/i;
const isDodgingEffect = effect => !effect?.disabled && [...(effect?.statuses ?? [])].some(s => typeof s === "string" && DODGING_PATTERN.test(s));

/** The creature's own effects (not ones its items carry). */
function ownEffects(actor) {
  const list = actor?.effects;
  if (!list) return [];
  return Array.isArray(list) ? list : [...(list.contents ?? list)];
}

/** Is this the creature's Dodging, in a fight where it will end at the start of the creature's next turn? */
function endsAtNextTurn(effect) {
  if (!isDodgingEffect(effect) || !automationSetting("dodgeExpiry")) return false;
  const actor = effect.parent?.documentName === "Item" ? null : effect.parent;
  const combat = game.combat;
  if (!actor || !combat?.started) return false;
  const combatants = combat.combatants?.contents ?? [...(combat.combatants ?? [])];
  return combatants.some(c => c?.actor === actor || (c?.actor?.uuid && c.actor.uuid === actor.uuid));
}

/* ---------- Dodging: until the start of your next turn ---------- */

/** Did the combat move forward to a new turn (not back, and not just a change of order)? */
function combatMovedForward(combat, change, options) {
  if (!("turn" in (change ?? {})) && !("round" in (change ?? {}))) return false;
  if (Number.isFinite(options?.direction)) return options.direction > 0;
  const prev = combat.previous ?? {}, cur = combat.current ?? { round: combat.round, turn: combat.turn };
  if (!Number.isFinite(prev.round)) return true;
  return cur.round > prev.round || (cur.round === prev.round && (cur.turn ?? 0) > (prev.turn ?? 0));
}

/* ---------- Whose turn starts: one creature, or a whole side (Primal Combat) ---------- */

/** Primal Combat's API, when that module is on. */
function primalCombatApi() {
  const mod = game.modules?.get?.("primal-combat");
  return mod?.active ? (mod.api ?? null) : null;
}

/** Does this combat use Primal Combat's side initiative (the whole side acts together)? */
function isSideInitiative(combat) {
  const api = primalCombatApi();
  try { return typeof api?.getMode === "function" && typeof api.getSide === "function" && api.getMode(combat) === "side"; }
  catch { return false; }
}

/**
 * The creatures whose turn starts now. Usually just the current combatant. In Primal Combat's side
 * initiative the combat's turn points at the first creature of the acting side, but the whole side
 * acts together, so it's everyone acting: the whole side, except in round 1's opening turn, which
 * is only the party members ahead of the enemies (the ones who beat them). This follows Primal
 * Combat's own rule, and uses its list when it offers one.
 */
function turnStartCombatants(combat) {
  const current = combat?.combatant;
  if (!current) return [];
  if (!isSideInitiative(combat)) return [current];
  const api = primalCombatApi();
  try {
    if (typeof api.getActingMembers === "function") return [...api.getActingMembers(combat)];
    const turns = [...(combat.turns ?? [])], side = api.getSide(current);
    const opening = combat.round === 1 && side === "party" && turns.slice((combat.turn ?? 0) + 1).some(c => api.getSide(c) === "enemies");
    if (opening) {
      const firstEnemy = turns.findIndex(c => api.getSide(c) === "enemies");
      return turns.slice(0, firstEnemy).filter(c => api.getSide(c) === "party");
    }
    return turns.filter(c => api.getSide(c) === side);
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not read Primal Combat's acting side`, err);
    return [current];
  }
}

/**
 * The creatures whose turn has just ended, given the turn before the change ({round, turn,
 * combatantId}, as Foundry reports it): the creature that was acting, or in Primal Combat's side
 * initiative everyone who was acting with it. Worked out from the combat as it was then.
 */
function turnEndCombatants(combat, prior) {
  if (!combat || !prior || !(Number(prior.round) >= 1)) return [];         // round 0: the combat hadn't started
  const turns = [...(combat.turns ?? [])];
  const lead = (prior.combatantId && (combat.combatants?.get?.(prior.combatantId) ?? turns.find(c => c?.id === prior.combatantId)))
    || turns[Number(prior.turn) || 0] || null;
  if (!lead) return [];
  if (!isSideInitiative(combat)) return [lead];
  // Primal Combat's turn signal says who ended the turn the combat just left, as it saw them start
  const api = primalCombatApi();
  const previous = combat.previous;
  if (typeof api?.getTurnEnders === "function" && previous
    && Number(previous.round) === Number(prior.round) && (Number(previous.turn) || 0) === (Number(prior.turn) || 0)) {
    try {
      const ended = [...api.getTurnEnders(combat)];
      if (ended.length) return ended.includes(lead) ? ended : [lead, ...ended];
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not read Primal Combat's turn signal`, err);
    }
  }
  try {
    // The combat as it stood: the same combat, pointing at that turn
    const then = Object.create(combat, {
      combatant: { value: lead }, round: { value: Number(prior.round) }, turn: { value: Number(prior.turn) || 0 }, started: { value: true }
    });
    const acting = turnStartCombatants(then);
    return acting.length ? acting : [lead];
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not work out whose turn ended`, err);
    return [lead];
  }
}

/** At the start of a creature's turn, its Dodging from an earlier turn ends. */
async function endDodgingAtTurnStart(combatant) {
  const actor = combatant?.actor;
  if (!actor) return;
  const ids = ownEffects(actor).filter(isDodgingEffect).map(e => e.id).filter(Boolean);
  if (!ids.length) return;
  try { await actor.deleteEmbeddedDocuments("ActiveEffect", ids); }
  catch (err) { console.warn(`${MODULE_ID} | Could not end Dodging`, err); }
}

Hooks.on("updateCombat", (combat, change, options, userId) => {
  if (!automationSetting("dodgeExpiry") || !combat?.started || !isAutomationClient(userId)) return;
  if (!combatMovedForward(combat, change, options)) return;
  for (const combatant of turnStartCombatants(combat)) endDodgingAtTurnStart(combatant);
});

/* ---------- Three failed death saves (or a monster at 0 HP): Dead ---------- */

const DEFEATED_ID = () => CONFIG.specialStatusEffects?.DEFEATED ?? "dead";

async function markDead(actor) {
  const id = DEFEATED_ID();
  if (actor.statuses?.has?.(id)) return;
  try {
    await actor.toggleStatusEffect?.(id, { active: true, overlay: true });
    await actor.setFlag?.(MODULE_ID, "autoDead", true);
  } catch (err) { console.warn(`${MODULE_ID} | Could not mark the creature Dead`, err); }
}

/** The Dead this module applied comes off again if the failures are corrected (still at 0 HP). */
async function unmarkDead(actor) {
  try {
    await actor.toggleStatusEffect?.(DEFEATED_ID(), { active: false });
    await forgetAutoDead(actor);
  } catch (err) { console.warn(`${MODULE_ID} | Could not remove Dead`, err); }
}

/** Clear the note that this module applied Dead (also one kept under the old module ID). */
async function forgetAutoDead(actor) {
  if (actor?.flags?.[MODULE_ID]?.autoDead !== undefined) await actor.unsetFlag?.(MODULE_ID, "autoDead");
  for (const id of LEGACY_MODULE_IDS) {
    if (actor?.flags?.[id]?.autoDead !== undefined) await actor.update?.({ [`flags.${id}.-=autoDead`]: null });
  }
}

Hooks.on("updateActor", (actor, change, options, userId) => {
  if (!automationSetting("autoDead") || !isAutomationClient(userId)) return;
  const get = foundry.utils?.getProperty;
  if (typeof get !== "function") return;
  // Monsters die at 0 Hit Points (no death saves); brought back above 0 (damage undone, healed), the
  // Dead this module applied comes off again
  if (isMonster(actor) && get(change, "system.attributes.hp.value") !== undefined) {
    const hp = Number(actor.system?.attributes?.hp?.value), max = Number(actor.system?.attributes?.hp?.max);
    const dead = !!actor.statuses?.has?.(DEFEATED_ID());
    if (hp <= 0 && max > 0) { if (!dead) markDead(actor); }
    else if (hp > 0 && dead && moduleFlag(actor, "autoDead")) unmarkDead(actor);
    return;
  }
  if (get(change, "system.attributes.death.failure") === undefined) return;
  const attrs = actor?.system?.attributes;
  const failures = Number(attrs?.death?.failure) || 0;
  const hp = Number(attrs?.hp?.value), max = Number(attrs?.hp?.max);
  const dead = !!actor.statuses?.has?.(DEFEATED_ID());
  if (failures >= 3 && hp <= 0 && max > 0) { if (!dead) markDead(actor); }
  else if (failures < 3 && hp <= 0 && dead && moduleFlag(actor, "autoDead")) unmarkDead(actor);
});

// Dead removed by hand: forget that this module applied it
Hooks.on("deleteActiveEffect", (effect, options, userId) => {
  const actor = effect?.parent;
  if (!actor || actor.documentName === "Item" || !isAutomationClient(userId)) return;
  if (!effect.statuses?.has?.(DEFEATED_ID()) || !moduleFlag(actor, "autoDead")) return;
  forgetAutoDead(actor).catch?.(() => {});
});

/* ---------- When combat ends: short effects a successful save would end ---------- */

/*
 * An effect that lasts 1 minute or less and ends on a successful saving throw (the creature repeats
 * the save at the end of each of its turns, and so on) is removed from every creature in the fight
 * when the combat ends. "Ends on a save" is read from Midi-QOL's OverTime saves, DAE's "save"
 * special durations, and the effect's own text or its item's description ("…repeats the save,
 * ending the effect on itself on a success", "On a successful save, the spell ends", "(save ends)").
 */
const SAVE_ENDS_TEXT = [
  /\b(repeats?|repeating|another|again|makes?|attempts?|rolls?)\b[^.]{0,60}\b(save|saves|saving throws?)\b[^.]{0,80}\b(end|ends|ending)\b[^.]{0,60}\bsuccess/i,
  /\bon a success(ful (save|saving throw))?\b[^.]{0,60}\b(ends?|ending)\b/i,
  /\b(ends?|ending)\b[^.]{0,40}\bon a successful (save|saving throw)\b/i,
  /\(\s*save ends\s*\)/i
];

/** The effect's changes (Foundry 14 keeps them in system.changes, earlier versions in changes). */
function effectChangeList(effect) {
  const list = [];
  for (const source of [effect?.system?.changes, effect?.changes]) if (Array.isArray(source)) list.push(...source);
  return list;
}

/** The item (or other document) an effect came from, if it can be found. */
function effectOriginDocument(effect) {
  if (typeof fromUuidSync !== "function") return null;
  const o = effect?.system?.origin ?? {};
  for (const uuid of [o.item, o.activity, effect?.origin]) {
    if (typeof uuid !== "string" || !uuid) continue;
    try {
      const doc = fromUuidSync(uuid, { strict: false });
      if (doc) return doc.documentName === "Item" || !doc.item ? doc : doc.item;
    } catch { /* not available */ }
  }
  return null;
}

const plainText = html => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

/** Does this effect end on a successful saving throw? */
function effectEndsOnSave(effect) {
  if (!effect) return false;
  // Midi-QOL: an OverTime save that removes the effect
  for (const change of effectChangeList(effect)) {
    const value = String(change?.value ?? "");
    if (/overtime/i.test(String(change?.key ?? "")) && /\bsave(dc|ability)\s*=/i.test(value) && !/\bsaveremove\s*=\s*false\b/i.test(value)) return true;
  }
  // DAE: removed when the creature makes (or succeeds on) a save
  const special = effect.flags?.dae?.specialDuration;
  if (Array.isArray(special) && special.some(s => /^isSave(?!Failure)/i.test(String(s)))) return true;
  // The rules text: the effect's own, then its item's
  const texts = [effect.description];
  const origin = effectOriginDocument(effect);
  if (origin) texts.push(origin.system?.description?.value, origin.description);
  return texts.some(t => { const text = plainText(t); return !!text.trim() && SAVE_ENDS_TEXT.some(re => re.test(text)); });
}

const TIME_UNIT_SECONDS = { second: 1, seconds: 1, round: 6, rounds: 6, turn: 6, turns: 6, minute: 60, minutes: 60, hour: 3600, hours: 3600,
  day: 86400, days: 86400, week: 604800, weeks: 604800, month: 2629800, months: 2629800, year: 31557600, years: 31557600 };

/** How long an effect lasts in all, in seconds (a round is 6 seconds), or null if it doesn't say. */
function effectTotalSeconds(effect) {
  const d = effect?.duration ?? {};
  const roundSeconds = Number(CONFIG?.time?.roundTime) || 6;
  const per = unit => (/^(round|turn)s?$/.test(unit) ? roundSeconds : TIME_UNIT_SECONDS[unit]);
  // Foundry 14: a value and its units
  const value = Number(d.value);
  if (typeof d.units === "string" && Number.isFinite(value) && value > 0 && per(d.units)) return value * per(d.units);
  // Foundry 12 and 13: seconds, rounds and turns
  const seconds = Number(d.seconds), rounds = Number(d.rounds) || 0, turns = Number(d.turns) || 0;
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  if (rounds > 0 || turns > 0) return (rounds + turns) * roundSeconds;
  // No duration of its own: its item's (dnd5e: system.duration, e.g. 1 minute)
  const itemDuration = effectOriginDocument(effect)?.system?.duration;
  const itemValue = Number(itemDuration?.value);
  if (itemDuration && Number.isFinite(itemValue) && itemValue > 0 && per(itemDuration.units)) return itemValue * per(itemDuration.units);
  return null;
}

/** Does this effect come off when the combat ends? (1 minute or less, ends on a save, the creature's own.) */
function endsWhenCombatEnds(effect) {
  if (!effect || effect.parent?.documentName === "Item") return false;
  const seconds = effectTotalSeconds(effect);
  return seconds !== null && seconds <= 60 && effectEndsOnSave(effect);
}

/** Remove those effects from everyone in a combat that just ended. */
async function endShortSaveEffects(combat) {
  const actors = new Set();
  for (const combatant of combat?.combatants ?? []) if (combatant?.actor) actors.add(combatant.actor);
  const removed = [];
  for (const actor of actors) {
    const ids = ownEffects(actor).filter(endsWhenCombatEnds).map(e => e.id).filter(Boolean);
    if (!ids.length) continue;
    const stillThere = () => ids.filter(id => (actor.effects?.get?.(id) ?? ownEffects(actor).find(e => e.id === id)));
    try { await actor.deleteEmbeddedDocuments("ActiveEffect", stillThere()); }
    catch {
      // something else (the system ending expired effects) got to some of them first: the rest one by one
      for (const id of stillThere()) { try { await actor.deleteEmbeddedDocuments("ActiveEffect", [id]); } catch { /* already gone */ } }
    }
    removed.push(...ids);
  }
  return removed;
}

Hooks.on("deleteCombat", (combat, options, userId) => {
  if (!automationSetting("saveEndsCombatEnd") || !isAutomationClient(userId)) return;
  if (!combat?.started && !(Number(combat?.round) > 0)) return;
  endShortSaveEffects(combat).catch(err => console.warn(`${MODULE_ID} | Could not end effects when the combat ended`, err));
});
// ===== src/09-condition-limits.js =====
/* -------------------------------------------- */
/*  Monsters of Drakkenheim: Bewildered,         */
/*  Distracted, Staggered, Drakkenheim Madness   */
/* -------------------------------------------- */

/*
 * What these conditions forbid is checked when a creature uses something (dnd5e's
 * dnd5e.preUseActivity, before anything is spent or rolled):
 *   Bewildered: no spells, except cantrips with a casting time of an action.
 *   Distracted: no Reactions (anything used as a Reaction). Midi-QOL also offers it none, through
 *     the status's own change (see drakkenheimChanges).
 *   Staggered: one weapon attack during its own turn. The first weapon attack it rolls on its turn
 *     is noted on the Staggered effect, so every client knows; Primal Combat's side initiative
 *     counts the whole side's turn as each member's own.
 * A player who tries is told why, and nothing happens. The GM is told why and asked whether to go
 * ahead anyway (the GM makes the rulings). The GM can turn all of this off in Module Settings.
 *
 * Drakkenheim Madness: when a creature gains it, 1d10 picks its trait. The trait is written on the
 * effect (the status pane shows it) and whispered to the GM and the creature's owners.
 */
const LIMIT_PATTERNS = {
  bewildered: /(^|[^a-z])bewildered$/i,
  distracted: /(^|[^a-z])distracted$/i,
  staggered: /(^|[^a-z])staggered$/i
};
const MADNESS_ID = "drakkenheimMadness";
const MADNESS_TRAITS = 10;
const limitBypass = new Set();   // "actor uuid|activity id" the GM let through once

function drakkenheimAutomation() {
  try { return !!game.settings.get(MODULE_ID, "drakkenheimAutomation"); } catch { return false; }
}


/** Is it this creature's own turn in the current combat (its side's turn, in Primal Combat)? The turn's key, or null. */
function ownTurnKey(actor) {
  const combat = game.combat;
  if (!actor || !combat?.started || !combat.combatant) return null;
  let acting = [];
  try { acting = turnStartCombatants(combat); } catch { acting = [combat.combatant]; }
  if (!acting.some(c => sameActor(c?.actor, actor))) return null;
  return `${combat.id}:${combat.round}:${combat.turn}`;
}

/** A spell this activity casts: its level and casting time, or null if it isn't a spell. */
function activitySpell(activity) {
  const item = activity?.item;
  if (item?.type !== "spell") return null;
  return { level: Number(item.system?.level) || 0, activation: activity.activation?.type ?? item.system?.activation?.type ?? "" };
}

/** A weapon attack (with a weapon or unarmed, not a spell attack)? */
function isWeaponAttack(activity) {
  return activity?.type === "attack" && (activity.attack?.type?.classification ?? "weapon") !== "spell";
}

/** The creature's own Staggered effects. */
function staggeredEffects(actor) {
  return ownEffects(actor).filter(e => !e.disabled && [...(e.statuses ?? [])].some(s => typeof s === "string" && LIMIT_PATTERNS.staggered.test(s)));
}

/** Has the Staggered creature already made a weapon attack this turn (noted on its Staggered effect)? */
function staggeredAttackMade(actor, turn) {
  return staggeredEffects(actor).some(e => moduleFlag(e, "attackedTurn") === turn);
}

/**
 * Why this creature can't use this, as a sentence for the notification, or null if it can. Checked
 * in the order the book lists them; the first reason found is given.
 */
function activityLimit(actor, activity) {
  if (!actor || !activity) return null;
  const name = actor.name ?? "";
  const label = activity.item?.name ?? activity.name ?? "";
  const say = (key, extra = {}) => Object.entries({ name, item: label, ...extra }).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), loc(key));
  const spell = activitySpell(activity);
  if (spell && hasStatusMatching(actor, LIMIT_PATTERNS.bewildered) && !(spell.level === 0 && spell.activation === "action")) {
    return say("MIGHTYGUARD.Limits.Bewildered");
  }
  if ((activity.activation?.type ?? "") === "reaction" && hasStatusMatching(actor, LIMIT_PATTERNS.distracted)) {
    return say("MIGHTYGUARD.Limits.Distracted");
  }
  if (isWeaponAttack(activity) && hasStatusMatching(actor, LIMIT_PATTERNS.staggered)) {
    const turn = ownTurnKey(actor);
    if (turn && staggeredAttackMade(actor, turn)) return say("MIGHTYGUARD.Limits.Staggered");
  }
  return null;
}

/** The activity as the creature has it (Midi-QOL hands the hook a copy of the item). */
function ownedActivity(actor, activity) {
  try { return actor?.items?.get?.(activity?.item?.id)?.system?.activities?.get?.(activity.id) ?? activity; }
  catch { return activity; }
}

/** The GM is asked whether to go ahead anyway; yes uses it again, let through this once. */
async function offerLimitOverride(actor, activity, reason) {
  const dialog = foundry.applications?.api?.DialogV2;
  if (typeof dialog?.confirm !== "function") return false;
  let go = false;
  try {
    go = await dialog.confirm({
      window: { title: loc("MIGHTYGUARD.Limits.Title") },
      content: `<p>${escapeHTML(reason)}</p><p>${escapeHTML(loc("MIGHTYGUARD.Limits.Anyway"))}</p>`
    });
  } catch { go = false; }
  if (!go) return false;
  const real = ownedActivity(actor, activity);
  limitBypass.add(`${actor.uuid}|${real.id}`);
  try { await real.use?.(); }
  catch (err) { console.warn(`${MODULE_ID} | Could not use it after all`, err); }
  finally { limitBypass.delete(`${actor.uuid}|${real.id}`); }
  return true;
}

Hooks.on("dnd5e.preUseActivity", (activity, usageConfig) => {
  try {
    if (!drakkenheimAutomation()) return true;
    const actor = activity?.actor ?? activity?.item?.actor;
    if (!actor) return true;
    if (limitBypass.delete(`${actor.uuid}|${activity.id}`)) return true;         // the GM said go ahead
    const reason = activityLimit(actor, activity);
    if (!reason) return true;
    globalThis.ui?.notifications?.warn?.(reason);
    if (game.user?.isGM) offerLimitOverride(actor, activity, reason);
    return false;
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not check Bewildered, Distracted or Staggered`, err);
    return true;
  }
});

// Staggered: note its first weapon attack on its turn, on the Staggered effect itself (once per turn)
Hooks.on("dnd5e.rollAttackV2", (rolls, data) => {
  try {
    const activity = data?.subject;
    const actor = activity?.actor ?? activity?.item?.actor;
    if (!drakkenheimAutomation() || !isWeaponAttack(activity) || !hasStatusMatching(actor, LIMIT_PATTERNS.staggered)) return;
    const turn = ownTurnKey(actor);
    if (!turn) return;
    for (const effect of staggeredEffects(actor)) {
      if (moduleFlag(effect, "attackedTurn") === turn || effect.isOwner === false) continue;
      effect.update?.({ [`flags.${MODULE_ID}.attackedTurn`]: turn })?.catch?.(err => console.warn(`${MODULE_ID} | Could not note Staggered's attack`, err));
    }
  } catch (err) { console.warn(`${MODULE_ID} | Could not note Staggered's attack`, err); }
});

/* ---------- Drakkenheim Madness: a trait, rolled when it starts ---------- */

/** Roll the creature's madness trait, write it on the effect and whisper it to the GM and the creature's owners. */
async function rollMadnessTrait(actor, effect) {
  const roll = await new Roll(`1d${MADNESS_TRAITS}`).evaluate();
  const n = Math.min(MADNESS_TRAITS, Math.max(1, Math.round(Number(roll.total) || 1)));
  const trait = loc(`MIGHTYGUARD.Madness.Trait${n}`);
  const text = `<p><strong>${escapeHTML(loc("MIGHTYGUARD.Madness.Trait"))} ${n}:</strong> ${escapeHTML(trait)}</p>`;
  try { await effect.update?.({ [`flags.${MODULE_ID}.madnessTrait`]: n, description: text }); }
  catch (err) { console.warn(`${MODULE_ID} | Could not write the madness trait on the effect`, err); }
  try {
    const all = game.users?.contents ?? (typeof game.users?.[Symbol.iterator] === "function" ? [...game.users] : []);
    const users = all.filter(u => u?.isGM || actor.testUserPermission?.(u, "OWNER"));
    const speaker = globalThis.ChatMessage?.getSpeaker?.({ actor }) ?? {};
    const flavor = loc("MIGHTYGUARD.Madness.Flavor").replace("{name}", actor.name ?? "").replace("{trait}", trait);
    await roll.toMessage?.({ speaker, flavor: `${statusDisplayName(MADNESS_ID)}: ${flavor}`, whisper: users.map(u => u.id) });
  } catch (err) { console.warn(`${MODULE_ID} | Could not post the madness trait`, err); }
  return { n, trait };
}

Hooks.on("createActiveEffect", (effect, options, userId) => {
  if (!drakkenheimAutomation() || !isAutomationClient(userId)) return;
  const actor = effect?.parent;
  if (!actor || actor.documentName !== "Actor" || !effect.statuses?.has?.(MADNESS_ID) || moduleFlag(effect, "madnessTrait")) return;
  rollMadnessTrait(actor, effect).catch(err => console.warn(`${MODULE_ID} | Could not roll a madness trait`, err));
});
// ===== src/09-desperation.js =====
/* -------------------------------------------- */
/*  Desperation attacks (a hidden GM option)     */
/* -------------------------------------------- */

/*
 * A GM-only rule that players never see. When a player's character is at 10% of its Hit Points or
 * less, the first attack roll it makes in a turn of combat has a chance of being a Desperation
 * Attack: it hits every target automatically (never a critical hit), and its damage is the attack's
 * maximum damage times 1.5, rounded down. One chance per character per turn, whether or not it
 * comes up. The chat card only calls it a Desperation Attack and is coloured to stand out; it
 * doesn't say how it works. The chance is the GM's setting, in percent (50% unless changed).
 *
 * How: the attack roll is marked on dnd5e's last pre-roll hook. Once its dice are rolled the chance
 * is rolled; on a success the d20 is set to a natural result that hits every target (a natural 1 or
 * a critical is never shown), Midi-QOL is told every target is hit (so a Shield cast in reaction
 * can't turn it into a miss), and the attack's damage roll is maximised and raised by half.
 */
const DESPERATION = { hpFraction: 0.1, chance: 0.5, damageFactor: 1.5 };
const desperationTurns = new Map();     // actor uuid → the combat turn its chance was last rolled in
const desperatePending = new Map();     // actor uuid → { activity, turn }: a Desperation Attack awaiting its damage

function desperationEnabled() {
  try { return !!game.settings.get(MODULE_ID, "desperationAttacks"); } catch { return false; }
}

/** A player character: a character that a player owns. */
function isPlayerCharacter(actor) {
  return actor?.type === "character" && !!actor.hasPlayerOwner;
}

/** At 10% of its Hit Points or less (but still standing). */
function isDesperate(actor) {
  const hp = actor?.system?.attributes?.hp;
  const max = Number(hp?.effectiveMax ?? hp?.max), value = Number(hp?.value);
  return Number.isFinite(max) && max > 0 && Number.isFinite(value) && value > 0 && value <= max * DESPERATION.hpFraction;
}

/** A key for the turn of the started combat this creature is fighting in, or null outside combat. */
function desperationTurnKey(actor) {
  if (!actor) return null;
  const fights = c => c?.started && [...(c.combatants ?? [])].some(cb => cb?.actor === actor || (!!actor.uuid && cb?.actor?.uuid === actor.uuid));
  const combat = [game.combat, ...(game.combats ?? [])].find(fights);
  return combat ? `${combat.id}:${combat.round}:${combat.turn}` : null;
}

/** The chance of a Desperation Attack, from 0 to 1: the GM's setting in percent (50% if it can't be read). */
function desperationChance() {
  let percent = NaN;
  try { percent = Number(game.settings.get(MODULE_ID, "desperationChance")); } catch { percent = NaN; }
  if (!Number.isFinite(percent)) return DESPERATION.chance;
  return Math.min(Math.max(percent, 0), 100) / 100;
}

function desperationRandom() {
  const r = CONFIG.Dice?.randomUniform?.();
  return Number.isFinite(r) ? r : Math.random();
}

/** What a target's cover adds to its AC (Midi-QOL may count it on top of the AC). */
function desperationCoverBonus(actor) {
  if (hasStatus(actor, "coverThreeQuarters")) return 5;
  if (hasStatus(actor, "coverHalf")) return 2;
  return 0;
}

/** The total an attack needs to hit every target, or null with no targets. */
function desperationNeeded(attacker, targets) {
  const acs = targets.filter(t => t?.actor && t.actor !== attacker)
    .map(t => (Number(t.actor.system?.attributes?.ac?.value) || 10) + desperationCoverBonus(t.actor));
  return acs.length ? Math.max(...acs) : null;
}

/** dnd5e pre-roll, attack: give the attack its chance if the character qualifies. */
function markDesperationCheck(config) {
  const activity = config?.subject;
  const actor = activity?.actor ?? activity?.item?.actor;
  if (!actor?.uuid) return false;
  desperatePending.delete(actor.uuid);                  // a new attack: any earlier Desperation Attack's damage is done
  if (!isPlayerCharacter(actor) || !isDesperate(actor)) return false;
  const turn = desperationTurnKey(actor);
  if (!turn || desperationTurns.get(actor.uuid) === turn) return false;
  const roll = config.rolls?.[0];
  if (!roll) return false;
  roll.options ??= {};
  roll.options.mgDesperationCheck = { actor: actor.uuid, activity: activity?.uuid ?? null, turn, needed: desperationNeeded(actor, [...(game.user?.targets ?? [])]) };
  return true;
}

/** dnd5e pre-roll, damage: the damage of a Desperation Attack is maximised and raised by half. */
function markDesperateDamage(config, dialog) {
  const activity = config?.subject;
  const actor = activity?.actor ?? activity?.item?.actor;
  if (!actor?.uuid) return false;
  const workflow = config.workflow ?? config.midiOptions?.workflow;
  let desperate;
  if (workflow?.attackRoll) desperate = !!workflow.attackRoll.options?.mgDesperation;   // Midi-QOL: its own attack
  else {
    const pending = desperatePending.get(actor.uuid);
    desperate = !!pending && pending.turn === desperationTurnKey(actor) && (!pending.activity || !activity?.uuid || pending.activity === activity.uuid);
  }
  if (!desperate) return false;
  desperatePending.delete(actor.uuid);
  config.isCritical = false;
  for (const roll of config.rolls ?? []) {
    roll.options ??= {};
    roll.options.isCritical = false;
    roll.options.mgDesperateDamage = actor.uuid;
  }
  if (dialog && typeof dialog === "object") { dialog.options ??= {}; dialog.options.defaultButton = "normal"; }
  return true;
}

Hooks.on("dnd5e.preRollV2", (config, dialog) => {
  if (!desperationEnabled()) return;
  const hookNames = (config?.hookNames ?? []).map(h => String(h).toLowerCase());
  try {
    if (hookNames.includes("attack")) markDesperationCheck(config);
    else if (hookNames.includes("damage")) markDesperateDamage(config, dialog);
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not set up a desperation attack`, err);
  }
});

/**
 * Set a rolled attack's d20 so the attack hits: the natural result it rolled if that already hits
 * (and isn't a critical), otherwise a random one that does. Never a natural 1 or a critical; if
 * nothing short of a critical would hit, the total is raised instead.
 */
function forceDesperateHit(roll, needed) {
  const d20 = roll.d20 ?? roll.dice?.[0];
  const results = d20?.results;
  if (!results?.length) return;
  const natural = Number(d20.total);
  const total = Number(roll._total ?? roll.total);
  if (!Number.isFinite(natural) || !Number.isFinite(total)) return;
  const rest = total - natural;
  const crit = Number(d20.options?.criticalSuccess ?? roll.options?.criticalSuccess) || 20;
  const fumble = Number(d20.options?.criticalFailure ?? roll.options?.criticalFailure) || 1;
  const hasTarget = Number.isFinite(Number(needed)) && needed !== null;
  const lo = Math.max(fumble + 1, hasTarget ? Math.ceil(Number(needed) - rest) : fumble + 1);
  const hi = crit - 1;
  let value;
  if (lo <= hi) value = (natural >= lo && natural <= hi) ? natural : lo + Math.floor(desperationRandom() * (hi - lo + 1));
  else value = Math.max(fumble + 1, hi);
  const ADV = CONFIG.Dice?.D20Roll?.ADV_MODE ?? { ADVANTAGE: 1, DISADVANTAGE: -1 };
  const mode = d20.options?.advantageMode ?? roll.options?.advantageMode;
  for (const r of results) {
    if (r.active !== false && !r.discarded) r.result = value;
    else if (mode === ADV.ADVANTAGE) r.result = Math.min(r.result, value);       // the kept die stays the highest
    else if (mode === ADV.DISADVANTAGE) r.result = Math.max(r.result, value);    // …or the lowest
    else r.result = value;
  }
  const recomputed = typeof roll._evaluateTotal === "function" ? Number(roll._evaluateTotal()) : NaN;
  roll._total = Number.isFinite(recomputed) ? recomputed : rest + value;
  if (hasTarget && roll._total < Number(needed)) roll._total = Number(needed);
}

/** Once an attack roll's dice are rolled: roll its chance, and make a Desperation Attack hit. */
function desperationAfterRoll(roll) {
  const o = roll.options;
  const check = o.mgDesperationCheck;
  if (check) {
    delete o.mgDesperationCheck;
    if (desperationTurns.get(check.actor) !== check.turn) {
      desperationTurns.set(check.actor, check.turn);
      if (desperationRandom() < desperationChance()) {
        o.mgDesperation = true;
        if (check.needed !== null && check.needed !== undefined) o.mgDesperationNeeded = check.needed;
        desperatePending.set(check.actor, { activity: check.activity, turn: check.turn });
      }
    }
  }
  if (o.mgDesperation && !roll._mgDesperate) {
    roll._mgDesperate = true;
    delete o.mgCritOnHit;                                 // it hits, but never as a critical
    forceDesperateHit(roll, o.mgDesperationNeeded ?? null);
  }
}

/** A Desperation Attack's damage roll: every die at its highest, then half as much again (per damage type). */
function boostDesperateDamage(roll) {
  for (const die of roll.dice ?? []) {
    const faces = Number(die?.faces);
    if (!(faces > 0)) continue;
    for (const r of die.results ?? []) if (r.active !== false && !r.discarded) r.result = faces;
  }
  const recomputed = typeof roll._evaluateTotal === "function" ? Number(roll._evaluateTotal()) : NaN;
  if (Number.isFinite(recomputed)) roll._total = recomputed;
  const extra = DESPERATION.damageFactor - 1;
  adjustDamageByType(roll, share => Math.floor(share * extra), total => Math.floor(total * DESPERATION.damageFactor));
}

/* Midi-QOL: once it has checked the hits, every target of a Desperation Attack is hit. */
Hooks.on("midi-qol.hitsChecked", workflow => {
  try {
    if (!workflow?.attackRoll?.options?.mgDesperation) return;
    workflow.hitTargets = new Set(workflow.targets ?? []);
    workflow.hitTargetsEC = new Set();
    workflow.isFumble = false;
    const hits = game.i18n?.localize?.("midi-qol.hits");
    for (const data of Object.values(workflow.hitDisplayData ?? {})) {
      if (!data || data.isHit === true) continue;
      data.isHit = true;
      data.hitClass = "success";
      if (hits && hits !== "midi-qol.hits") data.hitString = hits;
      if (typeof data.hitStyle === "string") data.hitStyle = data.hitStyle.replace(/red/g, "green");
      if (data.hitResultNumeric !== undefined) data.hitResultNumeric = "--";
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not mark a desperation attack's hits`, err);
  }
});

/* ---------- The chat card: "Desperation Attack", coloured to stand out ---------- */

/** The options of every roll on a chat message (its rolls, and the ones Midi-QOL keeps in its flags). */
function messageRollOptions(message) {
  const list = [];
  const add = r => {
    if (typeof r === "string") { try { r = JSON.parse(r); } catch { return; } }
    if (Array.isArray(r)) { r.forEach(add); return; }
    if (r && typeof r === "object" && r.options) list.push(r.options);
  };
  for (const roll of message?.rolls ?? []) add(roll);
  const midi = message?.flags?.["midi-qol"];
  if (midi && typeof midi === "object") for (const key of ["attackRoll", "damageRoll", "damageRolls", "otherDamageRoll", "otherDamageRolls"]) add(midi[key]);
  return list;
}

function isDesperationMessage(message) {
  return messageRollOptions(message).some(o => o?.mgDesperation || o?.mgDesperateDamage);
}

function styleDesperationCard(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || !isDesperationMessage(message)) return false;
  const name = loc("MIGHTYGUARD.Desperation.Name");
  root.classList.add("primal-desperation");
  let itemName = null;
  try { itemName = message.getAssociatedItem?.()?.name ?? null; } catch { /* no item */ }
  const title = root.querySelector(".card-header .title");
  itemName ??= title?.textContent?.trim() || null;
  if (title) {
    title.textContent = name;                          // (also clears the icon from an earlier pass)
    if (typeof document !== "undefined" && typeof title.prepend === "function") {
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-fire primal-desperation-icon";
      icon.setAttribute?.("inert", "");
      title.prepend(icon);
    }
  }
  const swap = el => {
    const text = el.textContent ?? "";
    if (itemName && text.includes(itemName)) el.textContent = text.split(itemName).join(name);
    else if (!title) el.textContent = name;            // a roll card of its own: its flavor is the attack's name
  };
  for (const el of root.querySelectorAll(".message-header .flavor-text, .dice-flavor")) swap(el);
  // Players see the totals but not the dice and formulas behind them
  if (!game.user?.isGM) for (const el of root.querySelectorAll(".dice-formula, .dice-tooltip")) el.remove();
  return true;
}

/*
 * Core's renderChatMessageHTML fires before dnd5e 6 fills the card in from the message's data, so
 * the card is styled again on dnd5e.renderChatMessage, which fires once dnd5e (and Midi-QOL, which
 * works inside dnd5e's card enrichment) have finished. Styling twice changes nothing.
 */
for (const hook of ["renderChatMessageHTML", "dnd5e.renderChatMessage"]) {
  Hooks.on(hook, (message, html) => {
    try { styleDesperationCard(message, html); }
    catch (err) { console.warn(`${MODULE_ID} | Could not style a desperation attack's card`, err); }
  });
}
// ===== src/09-drakkenheim-rules.js =====
/* -------------------------------------------- */
/*  Monsters of Drakkenheim: more conditions     */
/*  and Contamination's rest rules               */
/* -------------------------------------------- */

/*
 * Immobilized: Speed 0 and no Speed bonuses (a flying creature falls). Entangled and Frozen are
 * Immobilized and Defenseless; Frozen also makes bludgeoning weapon attacks against it Critical
 * Hits. Shocked is Dazed and Defenseless. Jinxed (X) takes a die off attack rolls and saving
 * throws, Valor (X) adds one; X is the effect's value, set in the status pane (or read from its
 * name, for example "Jinxed (1d6)"), 1d4 if it doesn't say.
 *
 * Contamination: after a long rest, each contaminated creature rolls 1d20 and gains a level on a 1;
 * from level 2 Hit Point Dice heal half as much on a short rest, and from level 3 a long rest
 * restores no Hit Points.
 */
const DRAKKENHEIM_IMPLIES = {
  entangled: ["immobilized", "defenseless"],
  frozen: ["immobilized", "defenseless"],
  shocked: ["dazed", "defenseless"]
};
const IMMOBILE_STATUSES = ["immobilized", "entangled", "frozen"];
const CONDITION_DICE = { jinxed: -1, valor: 1 };

// Speed 0: dnd5e sets a creature's speeds to 0 for the statuses in its noMovement list
Hooks.once("setup", () => {
  const list = CONFIG.DND5E?.conditionEffects?.noMovement;
  for (const id of IMMOBILE_STATUSES) {
    try { if (list instanceof Set) list.add(id); else if (Array.isArray(list) && !list.includes(id)) list.push(id); }
    catch { /* not dnd5e */ }
  }
});

function contaminationRulesEnabled() {
  try { return !!game.settings.get(MODULE_ID, "contaminationRest"); } catch { return false; }
}

/* ---------- Jinxed and Valor: a die off or on attack rolls and saving throws ---------- */

/** The die a Jinxed or Valor effect carries (its value, see 09-status-values.js), 1d4 if none, null without the status. */
function conditionDie(actor, id) {
  return statusValue(actor, id);
}

/** A value as roll parts, each term labelled and taken away when sign is negative: ("1d6+1", −1) → ["-1d6[Jinxed]", "-1[Jinxed]"]. */
function signedRollParts(value, sign, label) {
  return [...String(value).matchAll(/([+-]?)(\d+d\d+|\d+)/g)].map(([, s, term]) => {
    const negative = (s === "-") !== (sign < 0);
    return `${negative ? "-" : ""}${term}[${label}]`;
  });
}

/** Add Jinxed's and Valor's dice to a pending attack roll or saving throw, and say so in its message. */
function applyConditionDice(actor, config, message) {
  const notes = [];
  for (const [id, sign] of Object.entries(CONDITION_DICE)) {
    if (!hasStatus(actor, id)) continue;
    const die = conditionDie(actor, id);
    if (!die) continue;
    const roll = config.rolls?.[0];
    if (!roll) continue;
    roll.parts ??= [];
    roll.parts.push(...signedRollParts(die, sign, statusDisplayName(id)));
    const compound = /\d[+-]/.test(die);
    notes.push(`${statusDisplayName(id)}: ${sign < 0 ? "−" : "+"}${compound ? `(${die})` : die}`);
  }
  if (notes.length) appendFlavor(message, notes.join("; "));
  return notes.length > 0;
}

/*
 * Dice So Nice: Midi-QOL throws a GM's attack roll with only its d20, hiding every other die in it
 * (Bless's as well), so Valor's or Jinxed's die never rolled across the screen. Their dice are put
 * back into that throw. Only a throw that shows the d20 and has no chat message yet is touched, so a
 * die that has already been thrown isn't thrown again when the roll's chat message appears. Midi
 * lowercases every die's label before throwing it ("valor"), so labels are matched ignoring case.
 */
function revealConditionDice(messageId, context) {
  try {
    if (messageId) return false;
    const dice = context?.roll?.dice ?? [];
    if (dice.length < 2 || !dice[0]?.results?.some(r => !r.hidden)) return false;
    const lower = text => String(text ?? "").trim().toLocaleLowerCase();
    const labels = new Set(Object.keys(CONDITION_DICE).flatMap(id => [lower(statusDisplayName(id)), id]));
    let revealed = false;
    for (const die of dice.slice(1)) {
      if (!labels.has(lower(die?.options?.flavor ?? die?.flavor))) continue;
      for (const result of die.results ?? []) {
        if (!result.hidden || result.discarded || result.rerolled) continue;
        result.hidden = false;
        revealed = true;
      }
    }
    return revealed;
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not show Jinxed's or Valor's die in Dice So Nice`, err);
    return false;
  }
}
Hooks.on("diceSoNiceRollStart", revealConditionDice);

/* ---------- Frozen: bludgeoning weapon attacks are Critical Hits ---------- */

/** The damage types an attack deals (from the activity's damage parts, or the weapon's own damage). */
function attackDamageTypes(activity) {
  const types = new Set();
  const add = t => { for (const x of (t instanceof Set ? [...t] : Array.isArray(t) ? t : [t])) if (typeof x === "string" && x) types.add(x); };
  for (const part of activity?.damage?.parts ?? []) add(part?.types ?? part?.type);
  const base = activity?.item?.system?.damage?.base;
  if (base) add(base.types ?? base.type);
  for (const part of activity?.item?.system?.damage?.parts ?? []) if (Array.isArray(part)) add(part[1]);
  return types;
}

/** Is this a weapon attack that deals bludgeoning damage? */
function bludgeoningWeaponAttack(activity) {
  const item = activity?.item;
  return (item?.type === "weapon" || activity?.attack?.type?.classification === "weapon") && attackDamageTypes(activity).has("bludgeoning");
}

/* ---------- Contamination: long rests and Hit Point Dice ---------- */

/** Change a creature's Contamination level by some levels (dnd5e 6's own level, or this module's). */
async function addContaminationLevels(actor, delta) {
  if (systemHasLeveledConditions()) {
    const effect = [...(actor?.effects ?? [])].find(e => e.statuses?.has?.(CONTAM_ID));
    if (!effect) return;
    const level = Math.max(0, Math.min(CONTAM_MAX, contaminationEffectLevel(effect) + delta));
    if (!level) return effect.delete();
    return effect.update({ "system.level": level });
  }
  return changeContamination(actor, delta);
}

/** After a long rest: 1d20, and a new level of Contamination on a 1. */
async function longRestContaminationCheck(actor) {
  const level = contaminationLevel(actor);
  if (!level) return null;
  const roll = await new Roll("1d20").evaluate();
  const gained = roll.total === 1;
  const flavor = loc(gained ? "MIGHTYGUARD.ContaminationRest.Gained" : "MIGHTYGUARD.ContaminationRest.Safe")
    .replace("{name}", actor.name ?? "").replace("{level}", String(Math.min(CONTAM_MAX, level + 1)));
  try {
    const speaker = globalThis.ChatMessage?.getSpeaker?.({ actor }) ?? {};
    await roll.toMessage?.({ speaker, flavor: `${loc("MIGHTYGUARD.Contamination")}: ${flavor}` });
  } catch (err) { console.warn(`${MODULE_ID} | Could not post the Contamination roll`, err); }
  if (gained) await addContaminationLevels(actor, 1);
  return gained;
}

const isLongRest = (result, config) => result?.longRest === true || config?.type === "long" || config?.longRest === true;

// Level 3 and above: a long rest restores no Hit Points
Hooks.on("dnd5e.preRestCompleted", (actor, result, config) => {
  try {
    if (!contaminationRulesEnabled() || !isLongRest(result, config) || contaminationLevel(actor) < 3) return;
    const data = result?.updateData;
    if (data && "system.attributes.hp.value" in data) data["system.attributes.hp.value"] = actor.system?.attributes?.hp?.value;
    if (data?.system?.attributes?.hp && "value" in data.system.attributes.hp) data.system.attributes.hp.value = actor.system?.attributes?.hp?.value;
    if (result.deltas) result.deltas.hitPoints = 0;
    if ("dhp" in (result ?? {})) result.dhp = 0;
  } catch (err) { console.warn(`${MODULE_ID} | Could not apply Contamination to the long rest`, err); }
});

// After a long rest, the Contamination check (rolled by whoever took the rest)
Hooks.on("dnd5e.restCompleted", (actor, result, config) => {
  if (!contaminationRulesEnabled() || !isLongRest(result, config) || !contaminationLevel(actor)) return;
  if (actor?.isOwner === false) return;
  longRestContaminationCheck(actor).catch(err => console.warn(`${MODULE_ID} | Could not roll for Contamination`, err));
});

const halvedHitDieUpdates = new WeakSet();   // dnd5e 6 calls both hit die hooks with the same updates: halve once

/** Level 2 and above: Hit Point Dice restore half as many Hit Points (rounded down). */
function halveHitDieHealing(actor, updates) {
  if (!contaminationRulesEnabled() || !updates || typeof updates !== "object" || halvedHitDieUpdates.has(updates)) return false;
  if (contaminationLevel(actor) < 2) return false;
  const now = Number(actor?.system?.attributes?.hp?.value);
  const key = "system.attributes.hp.value";
  const after = Number(updates[key] ?? updates.system?.attributes?.hp?.value);
  if (!Number.isFinite(now) || !Number.isFinite(after) || after <= now) return false;
  const halved = now + Math.floor((after - now) / 2);
  if (key in updates) updates[key] = halved; else updates.system.attributes.hp.value = halved;
  halvedHitDieUpdates.add(updates);
  return true;
}

// dnd5e 4 and later (dnd5e 6 calls dnd5e.rollHitDie with these arguments too)
const onHitDieRolled = (rolls, data) => {
  try {
    if (halveHitDieHealing(data?.subject, data?.updates?.actor)) {
      for (const roll of rolls ?? []) roll.options && (roll.options.mgHalvedByContamination = true);
    }
  } catch (err) { console.warn(`${MODULE_ID} | Could not apply Contamination to the Hit Point Die`, err); }
};
Hooks.on("dnd5e.rollHitDieV2", onHitDieRolled);
Hooks.on("dnd5e.rollHitDie", (first, second, third) => {
  if (Array.isArray(first) || second?.subject) return onHitDieRolled(first, second);
  // dnd5e 3 and earlier: (actor, roll, updates)
  try { halveHitDieHealing(first, third?.actor ?? third); } catch { /* not critical */ }
});
// ===== src/09-status-values.js =====
/* -------------------------------------------- */
/*  Statuses with a value: Jinxed (X), Valor (X), */
/*  Burning (X) and Bleeding (X)                 */
/* -------------------------------------------- */

/*
 * Monsters of Drakkenheim gives some conditions a value: Jinxed (1d6), Valor (1d4), Burning (4d6
 * Fire) or Burning (2d4 Acid), Bleeding (2d4). The value is kept on the effect
 * (flags.primal-status.value) and shown in its name, "Valor (1d6)", and it's set in the status pane
 * beside the palette: a box under the effect's name with buttons for the usual values. It's read
 * again every time it's used, so it keeps applying round after round: Jinxed and Valor on each
 * attack roll and saving throw, Burning and Bleeding at the end of each of the creature's turns
 * (rolled, and applied if the GM chooses).
 *
 * An effect without a value of its own uses the one in its name ("Valor (1d6)", or any die it
 * names), then 1d4. Burning's value may end in a damage type ("2d4 Acid"); without one it's fire.
 * In the pane, Burning's type is picked with its own buttons (Fire or Acid, the book's two), apart
 * from the damage box; it's still kept in the one value, so the name reads "Burning (2d4 Acid)".
 */
const VALUE_STATUSES = {
  jinxed: { fallback: "1d4", choices: ["1d4", "1d6", "1d8", "1d10", "1d12"] },
  valor: { fallback: "1d4", choices: ["1d4", "1d6", "1d8", "1d10", "1d12"] },
  burning: { fallback: "1d4", choices: ["1d4", "1d6", "2d4", "2d6", "4d6"], typed: true, types: ["fire", "acid"], defaultType: "fire" },
  bleeding: { fallback: "1d4", choices: ["1d4", "2d4", "1d6", "2d6", "1d8"] }
};
const BURNING_PATTERN = /(^|[^a-z])(burning|on-?fire|aflame|ignited)$/i;
const BLEEDING_PATTERN = /(^|[^a-z])bleed(ing)?$/i;
/** Statuses matched by a pattern (other modules' "on-fire" counts as Burning), the rest by their ID. */
const VALUE_STATUS_PATTERNS = { burning: BURNING_PATTERN, bleeding: BLEEDING_PATTERN };
const DAMAGE_TYPE_WORDS = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];

/** "2d4 Acid" → { formula: "2d4", type: "acid" }; a value without a damage type → { formula, type: null }. */
function splitValueType(value) {
  const text = String(value ?? "").trim();
  const m = text.match(new RegExp(`^(.*?)\\s*\\b(${DAMAGE_TYPE_WORDS.join("|")})$`, "i"));
  return m && m[1] ? { formula: m[1], type: m[2].toLowerCase() } : { formula: text, type: null };
}

/** A damage type as it's written in a value: "acid" → "Acid". */
const typeWord = type => type ? type[0].toUpperCase() + type.slice(1) : "";

/**
 * A value made of a damage formula and a type: ("2d4", "acid") → "2d4 Acid". The status's own
 * type (Burning's fire) isn't written, so "Burning (1d6)" stays as it was.
 */
function valueWithType(formula, type, id = "burning") {
  const plain = normalizeStatusValue(formula);
  if (!plain) return null;
  const t = String(type ?? "").toLowerCase();
  return t && DAMAGE_TYPE_WORDS.includes(t) && t !== VALUE_STATUSES[id]?.defaultType ? `${plain} ${typeWord(t)}` : plain;
}

/** The damage type a Burning creature takes: "fire", "acid", or another its value names. Null if it isn't Burning. */
function burningType(actor) {
  const value = statusValue(actor, "burning");
  return value ? (splitValueType(value).type ?? VALUE_STATUSES.burning.defaultType) : null;
}

/**
 * A value typed in by someone, tidied up ("d6" → "1d6", "2D6 + 1" → "2d6+1"), or null if it isn't a
 * simple roll: dice and whole numbers added or taken away, up to 20 dice of up to 100 sides. For a
 * status whose value may name a damage type (Burning), that word is kept: "2d4 acid" → "2d4 Acid".
 */
function normalizeStatusValue(text, id = null) {
  if (text === null || text === undefined) return null;
  if (id && VALUE_STATUSES[id]?.typed) {
    const { formula, type } = splitValueType(text);
    const plain = normalizeStatusValue(formula);
    return plain && type ? `${plain} ${typeWord(type)}` : plain;
  }
  let s = String(text).trim().toLowerCase().replace(/\s+/g, "");
  if (!s || s.length > 40) return null;
  s = s.replace(/(^|[+-])d(\d)/g, "$11d$2");
  if (!/^(\d+d\d+|\d+)([+-](\d+d\d+|\d+))*$/.test(s)) return null;
  for (const m of s.matchAll(/(\d+)d(\d+)/g)) {
    const count = Number(m[1]), faces = Number(m[2]);
    if (count < 1 || count > 20 || faces < 2 || faces > 100) return null;
  }
  if (s.split(/[+-]/).some(part => !part.includes("d") && Number(part) > 999)) return null;
  return s.replace(/(^|[+-])0+(\d)/g, "$1$2");
}

/** The average of a value ("1d6+1" → 4.5), to pick the strongest of several. */
function statusValueAverage(value) {
  let total = 0;
  for (const m of String(value ?? "").matchAll(/([+-]?)(\d+d\d+|\d+)/g)) {
    const sign = m[1] === "-" ? -1 : 1;
    const [count, faces] = m[2].includes("d") ? m[2].split("d").map(Number) : [null, null];
    total += sign * (faces ? count * (faces + 1) / 2 : Number(m[2]));
  }
  return total;
}

/** The status on this effect that takes a value (jinxed, valor, burning or bleeding), or null. */
function valueStatusOf(effect) {
  const statuses = [...(effect?.statuses ?? [])];
  for (const id of Object.keys(VALUE_STATUSES)) {
    const pattern = VALUE_STATUS_PATTERNS[id];
    if (pattern ? statuses.some(s => typeof s === "string" && pattern.test(s)) : statuses.includes(id)) return id;
  }
  return null;
}

/** Does the effect give this value status? (Burning also counts other modules' "on-fire" and the like.) */
function effectGivesValueStatus(effect, id) {
  const statuses = effect?.statuses;
  if (!statuses) return false;
  const pattern = VALUE_STATUS_PATTERNS[id];
  if (pattern) return [...statuses].some(s => typeof s === "string" && pattern.test(s));
  return statuses.has?.(id) ?? [...statuses].includes(id);
}

/** Does the creature have this value status? */
function hasValueStatus(actor, id) {
  const pattern = VALUE_STATUS_PATTERNS[id];
  return pattern ? hasStatusMatching(actor, pattern) : hasStatus(actor, id);
}

/** The value an effect carries: set on it, or in its name ("Valor (1d6)", "Hex d8", "Burning 2d4 acid"), else null. */
function effectStatusValue(effect) {
  const id = valueStatusOf(effect);
  const set = normalizeStatusValue(moduleFlag(effect, "value"), id) ?? normalizeStatusValue(moduleFlag(effect, "die"), id);
  if (set) return set;
  const name = String(effect?.name ?? "");
  const bracketed = [...name.matchAll(/\(([^()]*)\)/g)].map(m => normalizeStatusValue(m[1], id)).filter(Boolean);
  if (bracketed.length) return bracketed[bracketed.length - 1];
  const die = name.match(/(\d*)d(4|6|8|10|12|20)\b/i);
  if (!die) return null;
  const value = `${Math.max(1, Number(die[1]) || 1)}d${die[2]}`;
  const after = VALUE_STATUSES[id]?.typed ? name.slice(die.index + die[0].length).match(new RegExp(`^\\s*(${DAMAGE_TYPE_WORDS.join("|")})\\b`, "i")) : null;
  return after ? `${value} ${typeWord(after[1].toLowerCase())}` : value;
}

/**
 * A creature's value for a status: the strongest of the effects giving it (by average), 1d4 if none
 * says, or null if the creature doesn't have the status.
 */
function statusValue(actor, id) {
  let best = null, bestAverage = -Infinity, found = false;
  for (const effect of applicableEffects(actor)) {
    if (!effect || effect.disabled || effect.isSuppressed || !effectGivesValueStatus(effect, id)) continue;
    found = true;
    const value = effectStatusValue(effect);
    if (value && statusValueAverage(value) > bestAverage) { best = value; bestAverage = statusValueAverage(value); }
  }
  if (best) return best;
  const has = found || hasValueStatus(actor, id);
  return has ? (VALUE_STATUSES[id]?.fallback ?? "1d4") : null;
}

/** The effect's name with this value in it: "Valor" → "Valor (1d6)". A name of its own is kept. */
function nameWithValue(effect, id, value) {
  const base = statusDisplayName(id);
  const name = String(effect?.name ?? "").trim();
  const plain = name.replace(/\s*\([^()]*\)\s*$/, "").trim();
  if (name && plain.toLowerCase() !== base.toLowerCase()) return null;
  return `${plain || base} (${value})`;
}

/** Set the value on an effect (and in its name). False if the value isn't valid. */
async function setEffectStatusValue(effect, raw) {
  const id = valueStatusOf(effect);
  const value = normalizeStatusValue(raw, id);
  if (!id || !value || typeof effect?.update !== "function") return false;
  const changes = { [`flags.${MODULE_ID}.value`]: value };
  const name = nameWithValue(effect, id, value);
  if (name && name !== effect.name) changes.name = name;
  await effect.update(changes);
  return true;
}

/* ---------- Burning and Bleeding: at the end of each of the creature's turns ---------- */

/*
 * Monsters of Drakkenheim: a Burning creature takes its X (fire, or the damage type its value names,
 * "Burning (2d4 Acid)") at the end of each of its turns, through dnd5e's damage so resistances count.
 * A Bleeding creature loses X Hit Points at the end of each of its turns (lost, not damage: no
 * resistance), and stops bleeding when it regains any Hit Points. The GM's setting (Burning and
 * Bleeding damage) chooses: roll and apply, roll in the chat only, or off.
 */
function burningDamageMode() {
  try { return game.settings.get(MODULE_ID, "burningDamage") ?? "apply"; } catch { return "off"; }
}

const endedTurns = new Map();   // combat → the turns already handled (so going back and forth doesn't burn twice)

/** Roll a burning creature's damage (fire, or the type its value names), say so in the chat and (if the GM chose) apply it. */
async function rollBurningDamage(actor, { apply = true, token = null } = {}) {
  const value = statusValue(actor, "burning");
  if (!value) return null;
  const { formula, type: named } = splitValueType(value);
  const type = named ?? "fire";
  const roll = await new Roll(formula).evaluate();
  const total = Math.max(0, Math.floor(Number(roll.total) || 0));
  const flavor = loc("MIGHTYGUARD.Burning.Flavor").replace("{name}", actor.name ?? "").replace("{value}", formula).replace("{type}", damageTypeLabel(type));
  try {
    const speaker = globalThis.ChatMessage?.getSpeaker?.({ actor, token }) ?? {};
    await roll.toMessage?.({ speaker, flavor: `${statusDisplayName("burning")}: ${flavor}` });
  } catch (err) { console.warn(`${MODULE_ID} | Could not post the Burning roll`, err); }
  if (apply && total > 0 && typeof actor.applyDamage === "function") {
    try { await actor.applyDamage([{ value: total, type, properties: new Set() }]); }
    catch (err) { console.warn(`${MODULE_ID} | Could not apply the Burning damage`, err); }
  }
  return { formula, type, total, roll };
}

/** Roll a bleeding creature's Hit Point loss, say so in the chat and (if the GM chose) take it off. */
async function rollBleedingLoss(actor, { apply = true, token = null } = {}) {
  const value = statusValue(actor, "bleeding");
  if (!value) return null;
  const formula = splitValueType(value).formula;
  const roll = await new Roll(formula).evaluate();
  const total = Math.max(0, Math.floor(Number(roll.total) || 0));
  const flavor = loc("MIGHTYGUARD.Bleeding.Flavor").replace("{name}", actor.name ?? "").replace("{value}", formula);
  try {
    const speaker = globalThis.ChatMessage?.getSpeaker?.({ actor, token }) ?? {};
    await roll.toMessage?.({ speaker, flavor: `${statusDisplayName("bleeding")}: ${flavor}` });
  } catch (err) { console.warn(`${MODULE_ID} | Could not post the Bleeding roll`, err); }
  if (apply && total > 0 && typeof actor.applyDamage === "function") {
    // Hit Points lost, not damage: no type, so no resistance or immunity applies
    try { await actor.applyDamage(total); }
    catch (err) { console.warn(`${MODULE_ID} | Could not take off the Bleeding Hit Points`, err); }
  }
  return { formula, total, roll };
}

/** The name dnd5e gives a damage type ("acid" → "Acid"), or the word itself. */
function damageTypeLabel(type) {
  const label = CONFIG.DND5E?.damageTypes?.[type]?.label;
  return label ? loc(label) : typeWord(type);
}

/** Say in the console what Burning or Bleeding did at the end of a turn (or why it didn't), to help when it seems not to work. */
function logBurning(text) {
  console.log(`${MODULE_ID} | Burning: ${text}`);
}
function logBleeding(text) {
  console.log(`${MODULE_ID} | Bleeding: ${text}`);
}

/** A creature's turn has ended (moving forward, on the GM's client): if it's Burning or Bleeding, roll for it. */
function endOfTurnFor(combatant, mode, round, source) {
  const actor = combatant?.actor;
  if (!actor) return [];
  const burning = statusValue(actor, "burning"), bleeding = statusValue(actor, "bleeding");
  if (!burning && !bleeding) return [];                 // neither: nothing to do or say
  const name = actor.name ?? "";
  const log = burning ? logBurning : logBleeding;
  if (mode === "off") { log(`${name}'s turn ended, but Burning and Bleeding damage is set to Off in the module settings.`); return []; }
  if (combatant.isDefeated) { log(`${name} is defeated, so it takes no Burning or Bleeding damage.`); return []; }
  const jobs = [];
  const token = combatant.token ?? null, apply = mode === "apply";
  const note = apply ? "" : " (not applied: Roll in the chat only)";
  if (burning) {
    const { formula, type } = splitValueType(burning);
    logBurning(`${name}'s turn ended (round ${round}): rolling ${formula} ${type ?? "fire"} damage${apply ? " and applying it" : note}. [${source}]`);
    jobs.push(rollBurningDamage(actor, { apply, token }));
  }
  if (bleeding) {
    logBleeding(`${name}'s turn ended (round ${round}): rolling ${splitValueType(bleeding).formula} Hit Points lost${apply ? " and taking them off" : note}. [${source}]`);
    // after the burn, so the two are applied one after the other
    const after = jobs.length ? jobs[jobs.length - 1].then(() => rollBleedingLoss(actor, { apply, token })) : rollBleedingLoss(actor, { apply, token });
    jobs.push(after);
  }
  for (const job of jobs) job.catch?.(err => console.warn(`${MODULE_ID} | Could not roll Burning or Bleeding`, err));
  return jobs;
}

/**
 * A turn has ended: everyone who was acting (one creature, or the whole side in Primal Combat's
 * side initiative) takes its Burning damage and loses its Bleeding Hit Points, once per turn
 * however many events report it.
 */
function burnAtTurnEnd(combat, prior, source) {
  if (!combat || !prior || !(Number(prior.round) >= 1)) return [];
  const turn = `${prior.round}.${prior.turn}.${prior.combatantId ?? ""}`;
  const key = combat.id ?? combat;
  if (!endedTurns.has(key)) endedTurns.set(key, new Set());
  const handled = endedTurns.get(key);
  if (handled.has(turn)) return [];                      // already handled (both events report a turn, and the GM may step back)
  handled.add(turn);
  const mode = burningDamageMode();
  return turnEndCombatants(combat, prior).flatMap(c => endOfTurnFor(c, mode, prior.round, source));
}

/** Did the turn order move forward from one turn state to the next? */
function turnStateMovedForward(prior, current) {
  const pr = Number(prior?.round) || 0, cr = Number(current?.round) || 0;
  return cr > pr || (cr === pr && (Number(current?.turn) || 0) > (Number(prior?.turn) || 0));
}

// The Combat update: every Foundry version (the turn before it is the combat's "previous")
Hooks.on("updateCombat", (combat, change, options, userId) => {
  if (!combat?.started || !isAutomationClient(userId)) return;
  if (!combatMovedForward(combat, change, options)) return;
  burnAtTurnEnd(combat, combat.previous, "updateCombat");
});

// Foundry 13 and later also announce the turn change itself, after the update, on every client
Hooks.on("combatTurnChange", (combat, prior, current) => {
  if (!combat?.started || !isAutomationClient()) return;
  if (!turnStateMovedForward(prior, current)) return;
  burnAtTurnEnd(combat, prior, "combatTurnChange");
});

Hooks.on("deleteCombat", combat => endedTurns.delete(combat?.id ?? combat));

/* ---------- Bleeding ends when the creature regains Hit Points ---------- */

/** Did this update give the creature back Hit Points (not temporary ones)? dnd5e notes the Hit Points before it. */
function regainedHitPoints(actor, change, options) {
  const get = foundry.utils?.getProperty;
  if (typeof get !== "function" || get(change, "system.attributes.hp.value") === undefined) return false;
  const before = Number(options?.dnd5e?.hp?.value), now = Number(actor?.system?.attributes?.hp?.value);
  return Number.isFinite(before) && Number.isFinite(now) && now > before;
}

Hooks.on("updateActor", (actor, change, options, userId) => {
  if (!isAutomationClient(userId) || burningDamageMode() === "off") return;
  if (!regainedHitPoints(actor, change, options) || !hasValueStatus(actor, "bleeding")) return;
  const ids = ownEffects(actor).filter(e => effectGivesValueStatus(e, "bleeding")).map(e => e.id).filter(Boolean);
  if (!ids.length) return;
  logBleeding(`${actor.name ?? ""} regained Hit Points, so it stops bleeding.`);
  actor.deleteEmbeddedDocuments?.("ActiveEffect", ids)?.catch?.(err => console.warn(`${MODULE_ID} | Could not end Bleeding`, err));
});
// ===== src/09-weakened-and-dazed.js =====
/* -------------------------------------------- */
/*  Contamination symptoms: Weakened and Dazed   */
/* -------------------------------------------- */

/*
 * Monsters of Drakkenheim: at Contamination level 4 a creature is Weakened (it deals half damage with
 * weapon attacks and spells), and at level 5 it's Dazed as well. The Contamination effect carries
 * those statuses itself (the way Unconscious carries Incapacitated and Prone), so they show in the
 * status palette and pane, and come off again when the level drops. Weakened halves the creature's
 * weapon and spell damage rolls (with "Advantage and Disadvantage from conditions" on); Dazed is
 * a reminder only.
 */
const WEAKENED_ID = "weakened";
const DAZED_ID = "dazed";
const CONTAM_SYMPTOMS = [{ level: 4, status: WEAKENED_ID }, { level: 5, status: DAZED_ID }];

/** The statuses a Contamination effect at this level gives besides Contamination itself. */
function contaminationSymptoms(level) {
  return CONTAM_SYMPTOMS.filter(s => level >= s.level).map(s => s.status);
}

/** A Contamination effect's level: dnd5e 6 keeps it in system.level, otherwise this module's flag. */
function contaminationEffectLevel(effect, changes = null) {
  const get = foundry.utils?.getProperty ?? ((o, p) => p.split(".").reduce((a, k) => a?.[k], o));
  const pick = path => (changes ? get(changes, path) : undefined) ?? get(effect, path);
  const n = Number(pick("system.level") ?? [MODULE_ID, ...LEGACY_MODULE_IDS].map(id => pick(`flags.${id}.level`)).find(v => v !== undefined) ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.min(CONTAM_MAX, Math.floor(n)) : 1;
}

const isContaminationEffect = (effect, statuses = effect?.statuses) => [...(statuses ?? [])].includes(CONTAM_ID);

/** The statuses the effect should have: what it has, minus old symptoms, plus the ones for its level. */
function statusesForLevel(statuses, level) {
  const symptoms = new Set(CONTAM_SYMPTOMS.map(s => s.status));
  return [...new Set([...[...(statuses ?? [])].filter(s => !symptoms.has(s)), ...contaminationSymptoms(level)])];
}

const sameStatuses = (a, b) => { const x = new Set(a), y = new Set(b); return x.size === y.size && [...x].every(s => y.has(s)); };

// A new Contamination effect gets the symptoms for its level
Hooks.on("preCreateActiveEffect", (effect, data) => {
  try {
    const statuses = data?.statuses ?? effect?.statuses;
    if (!isContaminationEffect(effect, statuses)) return;
    const wanted = statusesForLevel(statuses, contaminationEffectLevel(effect, data));
    if (!sameStatuses(statuses, wanted)) effect.updateSource({ statuses: wanted });
  } catch (err) { console.warn(`${MODULE_ID} | Could not add the Contamination symptoms`, err); }
});

// A level change adds or removes them (the same update, so they're never out of step)
Hooks.on("preUpdateActiveEffect", (effect, changes) => {
  try {
    const statuses = changes?.statuses ?? effect?.statuses;
    if (!isContaminationEffect(effect, statuses)) return;
    const wanted = statusesForLevel(statuses, contaminationEffectLevel(effect, changes));
    if (!sameStatuses(effect?.statuses ?? [], wanted) || changes.statuses) changes.statuses = wanted;
  } catch (err) { console.warn(`${MODULE_ID} | Could not update the Contamination symptoms`, err); }
});

/** Contamination effects made before this (on creatures in the sidebar and on every scene) get their symptoms. */
async function syncContaminationSymptoms() {
  const actors = new Set();
  for (const actor of game.actors ?? []) actors.add(actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (!token.actorLink && token.actor) actors.add(token.actor);
  let fixed = 0;
  for (const actor of actors) {
    const updates = [];
    for (const effect of actor.effects ?? []) {
      if (!effect?.id || !isContaminationEffect(effect)) continue;
      const wanted = statusesForLevel(effect.statuses, contaminationEffectLevel(effect));
      if (!sameStatuses(effect.statuses, wanted)) updates.push({ _id: effect.id, statuses: wanted });
    }
    if (!updates.length) continue;
    try { await actor.updateEmbeddedDocuments("ActiveEffect", updates); fixed += updates.length; }
    catch (err) { console.warn(`${MODULE_ID} | Could not update Contamination on ${actor.name}`, err); }
  }
  return fixed;
}

Hooks.once("ready", () => {
  const gm = game.users?.activeGM;
  if (!game.user?.isGM || (gm && !(gm.isSelf ?? gm.id === game.user.id))) return;
  syncContaminationSymptoms().catch(err => console.warn(`${MODULE_ID} | Could not update Contamination`, err));
});

/** Is the creature Weakened (the status, or Contamination at level 4 or more)? */
function isWeakened(actor) {
  return hasStatus(actor, WEAKENED_ID) || contaminationLevel(actor) >= 4;
}

/* ---------- Weakened: half damage with weapon attacks and spells ---------- */

/** Is this damage from a weapon attack or a spell? (A weapon or spell item, or any attack.) */
function weaponOrSpellDamage(activity) {
  const item = activity?.item ?? activity?.parent?.parent;
  return ["weapon", "spell"].includes(item?.type) || activity?.type === "attack";
}

/** dnd5e pre-roll: mark the damage of a Weakened creature's weapon attack or spell to be halved. */
function damageRollConditions(config, message) {
  const activity = config?.subject;
  const actor = activity?.actor ?? activity?.item?.actor;
  if (!actor || !weaponOrSpellDamage(activity) || !isWeakened(actor)) return false;
  for (const roll of config.rolls ?? []) { roll.options ??= {}; roll.options.mgHalfDamage = true; }
  appendFlavor(message, `${loc("MIGHTYGUARD.Rolls.HalfDamage")}: ${statusDisplayName(WEAKENED_ID)}`);
  return true;
}

/**
 * Halve a rolled damage roll, rounding down, by adding a subtraction for each damage type (so
 * the total, the formula shown in chat and the damage each type deals all agree).
 */
function halveDamageRoll(roll) {
  adjustDamageByType(roll, share => { const cut = share - Math.floor(share / 2); return cut > 0 ? -cut : 0; }, total => Math.floor(total / 2));
}

/**
 * Change a rolled damage roll type by type: delta(share) is added to each damage type's share as a
 * term of that type, so the total, the formula shown in chat and the damage each type deals agree.
 * A formula with multiplication or division at the top level is changed as a whole; with no terms
 * to add to, the total is set to whole(total).
 */
function adjustDamageByType(roll, delta, whole) {
  const T = foundry.dice?.terms ?? {};
  const Numeric = T.NumericTerm ?? globalThis.NumericTerm, Operator = T.OperatorTerm ?? globalThis.OperatorTerm;
  const total = Number(roll._total ?? roll.total);
  if (!Number.isFinite(total) || total <= 0) return;
  const shares = new Map();
  let sign = 1, simple = Array.isArray(roll.terms) && !!Numeric && !!Operator;
  for (const term of simple ? roll.terms : []) {
    if (term instanceof Operator) {
      if (term.operator === "+") sign = 1; else if (term.operator === "-") sign = -1; else simple = false;
      continue;
    }
    const value = Number(term.total);
    if (!Number.isFinite(value)) { simple = false; break; }
    const type = term.flavor || roll.options?.type || "";
    shares.set(type, (shares.get(type) ?? 0) + sign * value);
    sign = 1;
  }
  if (!simple) {
    if (!Array.isArray(roll.terms) || !Numeric || !Operator) { roll._total = whole(total); return; }
    shares.clear();
    shares.set(roll.options?.type ?? "", total);
  }
  for (const [type, share] of shares) {
    const change = Number(delta(share));
    if (!Number.isFinite(change) || change === 0) continue;
    const op = new Operator({ operator: change < 0 ? "-" : "+" });
    const num = new Numeric({ number: Math.abs(change), options: type ? { flavor: type } : {} });
    op._evaluated = true; num._evaluated = true;
    roll.terms.push(op, num);
  }
  if (typeof roll.resetFormula === "function") roll.resetFormula();
  else if (typeof roll.constructor?.getFormula === "function") roll._formula = roll.constructor.getFormula(roll.terms);
  const recomputed = typeof roll._evaluateTotal === "function" ? Number(roll._evaluateTotal()) : NaN;
  roll._total = Number.isFinite(recomputed) ? recomputed : whole(total);
}
// ===== src/09-weather-rolls.js =====
/* ---------- Weather on rolls, from Primal Weather ---------- */

/*
 * Primal Weather says what today's weather does to rolls on an outdoor scene (heavy rain, fog,
 * blowing sand: Disadvantage on Wisdom (Perception) checks; strong wind: on ranged weapon attacks
 * too). It's put on the roll here like a condition's, with the reason in the roll window and in
 * chat, so a player can roll normally when the check doesn't rely on that sense. Primal Weather's
 * "Weather rules apply to rolls" setting turns it off. Without Primal Weather nothing changes.
 */

/** What the weather does to rolls where this creature is: Primal Weather's rollModifiers, or null. */
function weatherRollModifiers(actor) {
  const mod = game.modules?.get?.("primal-weather");
  const api = mod?.active ? mod.api : null;
  if (typeof api?.rollModifiers !== "function") return null;
  const token = tokenForActor(actor);
  const scene = token?.document?.parent ?? token?.scene ?? canvas?.scene ?? null;
  try { return api.rollModifiers(scene); }
  catch (err) { console.warn(`${MODULE_ID} | Could not read the weather's roll rules`, err); return null; }
}

/** A ranged weapon attack (a ranged weapon, or a thrown one), not a spell attack? */
function isRangedWeaponAttack(activity, config) {
  const type = activity?.attack?.type ?? {};
  if ((type.classification ?? "weapon") === "spell") return false;
  const mode = String(config?.attackMode ?? config?.rolls?.[0]?.options?.attackMode ?? "");
  return type.value === "ranged" || mode === "ranged" || mode.startsWith("thrown");
}

Hooks.on("dnd5e.preRollV2", (config, dialog, message) => {
  if (game.system?.id !== "dnd5e") return;
  const hookNames = (config?.hookNames ?? []).map(h => String(h).toLowerCase());
  try {
    if (hookNames.includes("attack")) {
      const activity = config.subject;
      const actor = activity?.actor ?? activity?.item?.actor;
      if (!actor || !isRangedWeaponAttack(activity, config)) return;
      const reasons = weatherRollModifiers(actor)?.rangedWeaponAttack?.map(r => r.reason) ?? [];
      if (reasons.length) applyRollModifiers(config, message, { adv: new Set(), dis: new Set(reasons) }, dialog);
    }
    else if (hookNames.includes("skill")) {
      const actor = config.subject;
      const skill = config.skill ?? config.rolls?.[0]?.data?.skillId ?? config.rolls?.[0]?.options?.skill;
      if (actor?.documentName !== "Actor" || skill !== "prc") return;
      const reasons = weatherRollModifiers(actor)?.perception?.map(r => r.reason) ?? [];
      if (reasons.length) applyRollModifiers(config, message, { adv: new Set(), dis: new Set(reasons) }, dialog);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not apply the weather to the roll`, err);
  }
});
// ===== src/10-fx-core.js =====
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

// ===== src/11-fx-mighty-guard.js =====
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

// ===== src/12-fx-classic.js =====
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

// ===== src/13-fx-conditions.js =====
/* ---------- Petrified: cracked stone ---------- */

const STONE = {
  tone: [0.80, 0.78, 0.74],     // warm grey of the stone (scales the art's brightness)
  lift: 0.08,                   // stone is never black: shadows lifted this much
  contrast: 1.0,
  wash: 0x9C978D,               // stone colour laid over the art
  shade: 0x1E1B18,              // darker towards the rim, like carved stone
  crack: 0x221E1A, crackLight: 0xF1EDE4,
  grainDark: 0x3B3732, grainLight: 0xF4F0E8,
  dust: 0xB9B2A6,
  tint: [0.72, 0.71, 0.69],     // the art underneath, greyed
  cracks: 7, grains: 70, dustPerSecond: 1.4
};

/** A colour matrix that turns art into toned grey stone (PIXI offsets are 0–1). */
function stoneMatrix() {
  const c = STONE.contrast, l = STONE.lift;
  const row = t => [0.299 * t * c, 0.587 * t * c, 0.114 * t * c, 0, l];
  return [...row(STONE.tone[0]), ...row(STONE.tone[1]), ...row(STONE.tone[2]), 0, 0, 0, 1, 0];
}

/**
 * A copy of the token's own art, recoloured by a colour matrix, to lay over it. Not for token
 * rings, whose art is drawn by a special shader (null then, and the effect falls back to a wash).
 * The matrix filter goes into `blurs` so it's destroyed with the effect; the token's texture never is.
 */
function makeArtCopy(token, matrix, blurs) {
  const tex = token.mesh?.texture;
  if (!tex || token.document?.ring?.enabled || typeof PIXI.Sprite !== "function") return null;
  if (matrix && typeof PIXI.ColorMatrixFilter !== "function") return null;
  try {
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor.set(0.5);
    if (matrix) {
      const filter = new PIXI.ColorMatrixFilter();
      filter.matrix = matrix;
      sprite.filters = [filter];
      blurs.matrix = filter;
    }
    return sprite;
  } catch { return null; }
}

/** Keep an art copy on top of the art (or shifted sideways by dx): same image, size, mirroring and rotation. */
function syncArtCopy(token, sprite, dx = 0) {
  if (!sprite || sprite.destroyed) return;
  const tex = token.mesh?.texture;
  if (tex && sprite.texture !== tex) sprite.texture = tex;               // the token's image changed
  const tw = sprite.texture?.width || 1, th = sprite.texture?.height || 1;
  const mx = Number(token.document?.texture?.scaleX) < 0 ? -1 : 1, my = Number(token.document?.texture?.scaleY) < 0 ? -1 : 1;
  sprite.position.set(token.w / 2 + dx, token.h / 2);
  sprite.scale.set(mx * token.w / tw, my * token.h / th);
  sprite.rotation = Number(token.mesh?.rotation) || 0;
}

function createStoneFx(token) {
  const container = newFxContainer();
  const blurs = { shade: newBlur(6, 3), grain: newBlur(1, 2) };
  // A grey copy of the token's own art, so the whole picture turns to stone (token rings get a
  // heavier stone wash instead).
  const statue = makeArtCopy(token, stoneMatrix(), blurs);
  const wash = new PIXI.Graphics();
  const shade = new PIXI.Graphics(); shade.filters = [blurs.shade];
  const grain = new PIXI.Graphics(); grain.filters = [blurs.grain];
  const cracks = new PIXI.Graphics();
  const dust = new PIXI.Graphics();
  container.addChild(...(statue ? [statue] : []), wash, shade, grain, cracks, dust);
  const seed = hashString(`${token.document?.id ?? token.id ?? ""}:stone`);
  return { container, blurs, statue, wash, shade, grain, cracks, dust, seed, crackList: generateCracks(seed, STONE.cracks),
    motes: [], spawn: 0, dustFrom: [], drawnKey: "" };
}

function layoutStoneFx(fx, art) {
  const { x, y, r } = art;
  const round = PIXI.LINE_CAP?.ROUND ?? "round", join = PIXI.LINE_JOIN?.ROUND ?? "round";
  fx.wash.clear();
  fx.wash.beginFill(STONE.wash, 1).drawCircle(x, y, r * 0.98).endFill();
  fx.wash.alpha = fx.statue ? 0.1 : 0.7;
  fx.shade.clear();
  fx.shade.lineStyle({ width: r * 0.2, color: STONE.shade, alpha: 1 });
  fx.shade.drawCircle(x, y, r * 0.86);
  fx.shade.alpha = 0.24;
  // Grain: dark and light flecks, like granite
  const rand = seededRandom(fx.seed + 7);
  fx.grain.clear();
  for (let i = 0; i < STONE.grains; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 0.93;
    const dark = rand() < 0.55;
    fx.grain.beginFill(dark ? STONE.grainDark : STONE.grainLight, dark ? 0.32 : 0.22)
      .drawCircle(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.006 + rand() * 0.016)).endFill();
  }
  // Cracks: a dark core with a light lower edge, as if chiselled
  fx.cracks.clear();
  const lw = r * 0.032;
  for (const pass of [{ color: STONE.crackLight, alpha: 0.45, d: lw * 0.5, w: 0.75 }, { color: STONE.crack, alpha: 0.9, d: 0, w: 1 }]) {
    for (const c of fx.crackList) {
      fx.cracks.lineStyle({ width: Math.max(1, lw * c.width * pass.w), color: pass.color, alpha: pass.alpha, cap: round, join });
      c.points.forEach(([px, py], i) => {
        const X = x + px * r + pass.d, Y = y + py * r + pass.d;
        if (i === 0) fx.cracks.moveTo(X, Y); else fx.cracks.lineTo(X, Y);
      });
    }
  }
  fx.dustFrom = fx.crackList.flatMap(c => c.points.slice(1)).map(([px, py]) => [x + px * r, y + py * r]);
}

/** Grey stone art, cracks and grain, with a little dust trickling from the cracks. */
function updateStoneFx(token, fx, { now, dt, zoom }) {
  const art = artCircle(token);
  const r = art.r;
  const key = `${Math.round(art.x)}|${Math.round(art.y)}|${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) { layoutStoneFx(fx, art); fx.drawnKey = key; }
  fx.blurs.shade.blur = Math.max(1, r * 0.12 * zoom);
  fx.blurs.grain.blur = Math.max(0.3, r * 0.004 * zoom);

  syncArtCopy(token, fx.statue);

  // Dust: grains break off the cracks now and then and fall
  fx.spawn += dt * STONE.dustPerSecond;
  while (fx.spawn >= 1 && fx.dustFrom.length) {
    fx.spawn -= 1;
    const [sx, sy] = fx.dustFrom[Math.floor(Math.random() * fx.dustFrom.length)];
    for (let k = 0, n = 2 + Math.floor(Math.random() * 3); k < n; k++) {
      fx.motes.push({ x: sx + (Math.random() - 0.5) * r * 0.04, y: sy, vx: (Math.random() - 0.5) * r * 0.08, vy: Math.random() * r * 0.05,
        age: 0, life: 0.9 + Math.random() * 0.8, size: r * (0.008 + Math.random() * 0.01) });
    }
  }
  if (fx.motes.length > 60) fx.motes.splice(0, fx.motes.length - 60);
  fx.dust.clear();
  fx.motes = fx.motes.filter(m => (m.age += dt) < m.life);
  for (const m of fx.motes) {
    m.vy += r * 1.1 * dt;
    m.x += m.vx * dt; m.y += m.vy * dt;
    const k = m.age / m.life;
    fx.dust.beginFill(STONE.dust, 0.85 * (1 - k)).drawCircle(m.x, m.y, Math.max(0.5, m.size)).endFill();
  }
  return { tint: STONE.tint, alpha: 1 };
}

/* ---------- Paralyzed: crackling electric arcs ---------- */

const ARC = {
  core: 0xF5FCFF,               // white-hot centre of a bolt
  glow: 0x74D7FF,               // electric blue glow around it
  halo: 0x2F6BFF,               // the flash that lights up the creature
  bolts: 1,                     // arcs across the creature at once
  forkChance: 0.5,              // chance an arc has a single fork
  rough: 0.32,                  // how jagged an arc is (relative to the art's radius)
  holdSeconds: [0.9, 1.6],      // how long one shape holds before it fades into the next
  fadeSeconds: 0.25,            // cross-fade between shapes
  sway: 0.018,                  // gentle drift of a held arc (relative to the radius)
  tint: [0.88, 0.93, 1]         // a cold blue cast on the art
};

/** A jagged path from p0 to p1 by midpoint displacement. */
function jaggedPath(x0, y0, x1, y1, rough, levels) {
  let pts = [[x0, y0], [x1, y1]];
  for (let l = 0; l < levels; l++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const off = (Math.random() - 0.5) * rough;
      next.push([(ax + bx) / 2 - (dy / len) * off, (ay + by) / 2 + (dx / len) * off], pts[i]);
    }
    pts = next;
    rough *= 0.55;
  }
  return pts;
}

/** New bolts across the art circle, each with a fork or two. */
function makeBolts(art) {
  const { x, y, r } = art;
  const bolts = [];
  for (let k = 0; k < ARC.bolts; k++) {
    const a = Math.random() * Math.PI * 2, b = a + Math.PI + (Math.random() - 0.5) * 1.5;
    const main = jaggedPath(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95, x + Math.cos(b) * r * 0.95, y + Math.sin(b) * r * 0.95, r * ARC.rough, 4);
    bolts.push({ points: main, width: 1 });
    const forks = Math.random() < ARC.forkChance ? 1 : 0;
    for (let f = 0; f < forks; f++) {
      const i = 3 + Math.floor(Math.random() * (main.length - 6));
      const [fx0, fy0] = main[i], [nx, ny] = main[i + 1];
      const dir = Math.atan2(ny - fy0, nx - fx0) + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6);
      const len = r * (0.25 + Math.random() * 0.25);
      let ex = fx0 + Math.cos(dir) * len, ey = fy0 + Math.sin(dir) * len;
      const d = Math.hypot(ex - x, ey - y);
      if (d > r * 0.95) { ex = x + (ex - x) * (r * 0.95 / d); ey = y + (ey - y) * (r * 0.95 / d); }
      bolts.push({ points: jaggedPath(fx0, fy0, ex, ey, r * 0.14, 3), width: 0.55 });
    }
  }
  // Each point sways a little on its own while the shape holds (the ends stay put on the rim)
  for (const b of bolts) b.sway = b.points.map((_, i) => (i === 0 || i === b.points.length - 1) ? null : { p: Math.random() * Math.PI * 2, f: 1.5 + Math.random() * 1.5 });
  return bolts;
}

function createArcFx() {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { halo: newBlur(10, 3, ADD), glow: newBlur(4, 3, ADD) };
  const halo = new PIXI.Graphics(); halo.blendMode = ADD; halo.filters = [blurs.halo];
  const glow = new PIXI.Graphics(); glow.blendMode = ADD; glow.filters = [blurs.glow];
  const core = new PIXI.Graphics(); core.blendMode = ADD;
  const sparks = new PIXI.Graphics(); sparks.blendMode = ADD;
  container.addChild(halo, glow, core, sparks);
  return { container, blurs, halo, glow, core, sparks, bolts: [], prev: [], swapped: 0, next: 0, flash: 0, sparkList: [] };
}

/**
 * An arc that holds its shape for a second or so, swaying slightly and humming, then fades into a
 * new shape, with a soft flash and a few sparks where it meets the rim.
 */
function updateArcFx(token, fx, { now, dt, zoom }) {
  const art = artCircle(token);
  const r = art.r;
  fx.blurs.halo.blur = Math.max(1, r * 0.3 * zoom);
  fx.blurs.glow.blur = Math.max(1, r * 0.05 * zoom);
  if (now >= fx.next || !fx.bolts.length) {
    fx.prev = fx.bolts;
    fx.bolts = makeBolts(art);
    fx.swapped = fx.prev.length ? now : now - ARC.fadeSeconds * 1000;   // the first arc shows at once
    const [lo, hi] = ARC.holdSeconds;
    fx.next = now + (lo + Math.random() * (hi - lo)) * 1000;
    fx.flash = Math.min(1, fx.flash + 0.35);
    for (const b of fx.bolts) {
      if (b.width < 1) continue;
      for (const end of [b.points[0], b.points[b.points.length - 1]]) {
        if (Math.random() < 0.5) continue;
        for (let k = 0; k < 2; k++) {
          const a = Math.random() * Math.PI * 2, v = r * (0.25 + Math.random() * 0.4);
          fx.sparkList.push({ x: end[0], y: end[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.25 + Math.random() * 0.25 });
        }
      }
    }
  }
  fx.flash = Math.max(0, fx.flash - dt * 2.5);
  const T = now / 1000;
  const fade = clamp01((now - fx.swapped) / (ARC.fadeSeconds * 1000));
  const hum = 0.88 + 0.12 * Math.sin(T * 7);               // a steady hum, not a random flicker
  const round = PIXI.LINE_CAP?.ROUND ?? "round", join = PIXI.LINE_JOIN?.ROUND ?? "round";
  fx.glow.clear(); fx.core.clear();
  const drawSet = (bolts, strength) => {
    if (strength <= 0.01) return;
    for (const b of bolts) {
      fx.glow.lineStyle({ width: r * 0.08 * b.width, color: ARC.glow, alpha: 0.8 * hum * strength, cap: round, join });
      fx.core.lineStyle({ width: Math.max(1, r * 0.02 * b.width), color: ARC.core, alpha: hum * strength, cap: round, join });
      const pts = b.points.map(([px, py], i) => {
        const s = b.sway?.[i];
        if (!s) return [px, py];
        const d = r * ARC.sway;
        return [px + Math.sin(T * s.f + s.p) * d, py + Math.cos(T * s.f * 0.8 + s.p) * d];
      });
      for (const g of [fx.glow, fx.core]) pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    }
  };
  drawSet(fx.prev, 1 - fade);
  drawSet(fx.bolts, fade);
  fx.halo.clear();
  fx.halo.beginFill(ARC.halo, 1).drawCircle(art.x, art.y, r * 0.8).endFill();
  fx.halo.alpha = 0.07 + 0.12 * fx.flash;
  if (fx.sparkList.length > 40) fx.sparkList.splice(0, fx.sparkList.length - 40);
  fx.sparks.clear();
  fx.sparkList = fx.sparkList.filter(p => (p.age += dt) < p.life);
  for (const p of fx.sparkList) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    fx.sparks.beginFill(ARC.core, 1 - p.age / p.life).drawCircle(p.x, p.y, Math.max(0.6, r * 0.012)).endFill();
  }
  const lift = 0.05 * fx.flash;
  return { tint: ARC.tint.map(c => Math.min(1, c + lift)), alpha: 1 };
}

/* ---------- Diseased: sores and a sickly haze ---------- */

const DISEASE = {
  tint: [0.97, 0.93, 0.72],     // sallow, jaundiced skin
  blotch: 0x7A2E3A,             // inflamed, bruise-purple patches
  pustule: 0xE6D45C, pustuleRim: 0x8A5E22,
  miasma: 0xA8A44A,             // yellow-brown haze
  sores: 6, wisps: 4,
  soreSeconds: [3, 5.5]         // a sore swells for this long, then bursts
};

function createDiseaseFx(token) {
  const container = newFxContainer();
  const blurs = { blotch: newBlur(4, 3), miasma: newBlur(10, 3) };
  const miasma = new PIXI.Graphics(); miasma.filters = [blurs.miasma];
  const blotches = new PIXI.Graphics(); blotches.filters = [blurs.blotch];
  const pustules = new PIXI.Graphics();
  container.addChild(miasma, blotches, pustules);
  const rand = seededRandom(hashString(`${token.document?.id ?? token.id ?? ""}:disease`));
  const sores = Array.from({ length: DISEASE.sores }, () => ({
    a: rand() * Math.PI * 2, d: 0.2 + Math.sqrt(rand()) * 0.55, size: 0.055 + rand() * 0.045,
    period: DISEASE.soreSeconds[0] + rand() * (DISEASE.soreSeconds[1] - DISEASE.soreSeconds[0]), phase: rand()
  }));
  const wispData = Array.from({ length: DISEASE.wisps }, (_, i) => ({ x: rand() - 0.5, offset: i / DISEASE.wisps, size: 0.25 + rand() * 0.15 }));
  return { container, blurs, miasma, blotches, pustules, sores, wispData, drawnKey: "" };
}

/** Sores that swell and burst, and a sickly haze rising. */
function updateDiseaseFx(token, fx, { now, zoom }) {
  const art = artCircle(token);
  const { x, y, r } = art;
  const T = now / 1000;
  fx.blurs.blotch.blur = Math.max(1, r * 0.05 * zoom);
  fx.blurs.miasma.blur = Math.max(1, r * 0.2 * zoom);
  const key = `${Math.round(x)}|${Math.round(y)}|${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) {
    fx.blotches.clear();
    for (const s of fx.sores) {
      const sx = x + Math.cos(s.a) * s.d * r, sy = y + Math.sin(s.a) * s.d * r;
      fx.blotches.beginFill(DISEASE.blotch, 1).drawEllipse(sx, sy, s.size * r * 2.1, s.size * r * 1.7).endFill();
    }
    fx.drawnKey = key;
  }
  fx.blotches.alpha = 0.4 + 0.08 * Math.sin(T * 1.3);

  // Pustules: swell, then burst into a ring and start again
  const p = fx.pustules;
  p.clear();
  for (const s of fx.sores) {
    const sx = x + Math.cos(s.a) * s.d * r, sy = y + Math.sin(s.a) * s.d * r;
    const t = ((T / s.period) + s.phase) % 1;
    const size = s.size * r;
    if (t < 0.9) {
      const rad = size * (0.35 + 0.65 * (t / 0.9));
      p.lineStyle({ width: Math.max(0.8, rad * 0.22), color: DISEASE.pustuleRim, alpha: 0.75 });
      p.beginFill(DISEASE.pustule, 0.9).drawCircle(sx, sy, rad).endFill();
      p.lineStyle(0);
      p.beginFill(0xFFFFF0, 0.55).drawCircle(sx - rad * 0.3, sy - rad * 0.3, rad * 0.28).endFill();
    } else {
      const k = (t - 0.9) / 0.1;
      p.lineStyle({ width: Math.max(0.8, size * 0.2 * (1 - k)), color: DISEASE.pustule, alpha: 1 - k });
      p.drawCircle(sx, sy, size * (1 + 0.9 * k));
      p.lineStyle(0);
    }
  }

  // Miasma: faint yellow-brown puffs drifting up and fading
  fx.miasma.clear();
  for (const w of fx.wispData) {
    const t = ((T / 5) + w.offset) % 1;
    const wx = x + w.x * r * 0.9 + Math.sin(t * Math.PI * 2 + w.offset * 6) * r * 0.08;
    const wy = y + r * 0.45 - t * r * 1.2;
    const alpha = 0.3 * Math.sin(t * Math.PI);
    fx.miasma.beginFill(DISEASE.miasma, alpha).drawCircle(wx, wy, r * w.size * (0.7 + 0.5 * t)).endFill();
  }
  return { tint: DISEASE.tint, alpha: 1 };
}

/* ---------- Cursed: a dark swirl around the token ---------- */

const CURSE = {
  dark: 0x0C0914,               // near-black violet smoke
  mid: 0x2A1F3D,                // the body of the swirl
  sheen: 0x8A76B4,              // faint violet edge, so it reads on dark maps
  rings: [{ radius: 1.06, lapSeconds: 7, width: 0.1 }, { radius: 1.15, lapSeconds: 11, width: 0.075 }],
  armsPerRing: 4,
  motes: 14,
  tint: [0.86, 0.86, 0.9]       // the creature looks a little dimmed
};

/** Smoky streaks circling just outside the art's edge: tapered arcs that spiral slightly outward. */
function drawCurseRing(g, r, ring, seed, color, alphaScale, widthScale) {
  g.clear();
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  const rand = seededRandom(seed + ring.radius * 1000);
  for (let k = 0; k < CURSE.armsPerRing; k++) {
    const radius = r * (ring.radius + (rand() - 0.5) * 0.04);
    const start = (k / CURSE.armsPerRing) * Math.PI * 2 + rand() * 0.6;
    const span = 1.0 + rand() * 0.8;
    const width = r * ring.width * widthScale;
    const steps = 20;
    let px = Math.cos(start) * radius, py = Math.sin(start) * radius;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const a = start - span * t;                       // trails behind the direction of spin
      const rr = radius * (1 + 0.07 * t);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      const fade = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.8;   // thin at both ends
      g.lineStyle({ width: Math.max(0.8, width * (0.2 + 0.8 * fade)), color, alpha: alphaScale * (0.25 + 0.75 * fade), cap: round });
      g.moveTo(px, py); g.lineTo(x, y);
      px = x; py = y;
    }
  }
}

function createCurseFx(token) {
  const container = newFxContainer();
  const blurs = { shadow: newBlur(8, 3), smoke: newBlur(3, 3), sheen: newBlur(1.5, 2) };
  const shadow = new PIXI.Graphics(); shadow.filters = [blurs.shadow];
  const rings = CURSE.rings.map(() => {
    const smoke = new PIXI.Graphics(); smoke.filters = [blurs.smoke];
    const sheen = new PIXI.Graphics(); sheen.filters = [blurs.sheen];
    const group = new PIXI.Container(); group.addChild(smoke, sheen);
    return { group, smoke, sheen };
  });
  const motes = new PIXI.Graphics();
  container.addChild(shadow, ...rings.map(x => x.group), motes);
  const seed = hashString(`${token.document?.id ?? token.id ?? ""}:curse`);
  const rand = seededRandom(seed + 3);
  const moteData = Array.from({ length: CURSE.motes }, () => ({ a: rand() * Math.PI * 2, d: 1.02 + rand() * 0.2, speed: 0.5 + rand() * 0.5, size: 0.012 + rand() * 0.014, phase: rand() * 6.3 }));
  return { container, blurs, shadow, rings, motes, moteData, seed, drawnKey: "" };
}

/** Swirl the dark smoke slowly around the outside of the art; dims the art a little. */
function updateCurseFx(token, fx, { now, zoom }) {
  const art = artCircle(token);
  const r = art.r, T = now / 1000;
  const key = `${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) {
    fx.rings.forEach((ring, i) => {
      drawCurseRing(ring.smoke, r, CURSE.rings[i], fx.seed, i ? CURSE.dark : CURSE.mid, 0.9, 1);
      drawCurseRing(ring.sheen, r, CURSE.rings[i], fx.seed, CURSE.sheen, 0.35, 0.25);
    });
    fx.shadow.clear();
    fx.shadow.lineStyle({ width: r * 0.2, color: CURSE.dark, alpha: 1 });
    fx.shadow.drawCircle(0, 0, r * 1.08);
    fx.drawnKey = key;
  }
  fx.blurs.shadow.blur = Math.max(1, r * 0.15 * zoom);
  fx.blurs.smoke.blur = Math.max(0.5, r * 0.035 * zoom);
  fx.blurs.sheen.blur = Math.max(0.5, r * 0.012 * zoom);
  fx.shadow.position.set(art.x, art.y);
  fx.shadow.alpha = 0.38 + 0.07 * Math.sin(T * 0.9);
  fx.rings.forEach((ring, i) => {
    ring.group.position.set(art.x, art.y);
    ring.group.rotation = (T / CURSE.rings[i].lapSeconds) * Math.PI * 2 + i * 1.3;
    ring.group.scale.set(1 + 0.025 * Math.sin(T * (0.8 + i * 0.3) + i));
    ring.group.alpha = 0.85 + 0.15 * Math.sin(T * (0.6 + i * 0.4) + i * 2);
  });
  const m = fx.motes;
  m.clear();
  for (const d of fx.moteData) {
    const a = d.a + T * d.speed;
    const rad = r * d.d * (1 + 0.03 * Math.sin(T * 1.7 + d.phase));
    m.beginFill(CURSE.dark, 0.55 + 0.3 * Math.sin(T * 2 + d.phase) ** 2)
      .drawCircle(art.x + Math.cos(a) * rad, art.y + Math.sin(a) * rad, Math.max(0.6, r * d.size)).endFill();
  }
  return { tint: CURSE.tint, alpha: 1 };
}

/* ---------- Incapacitated: drained and fading ---------- */

const DRAIN = {
  tone: [0.9, 0.92, 0.97],      // the grey the art drains to (a little cool)
  wash: 0x8C9099,               // grey laid over art that can't be copied (token rings)
  pulse: 0xD4D8E0,              // the faint ring of a weak heartbeat
  fade: [0.4, 0.85],            // how visible the creature is, at its faintest and strongest
  fadeSeconds: 5.5,             // one slow fade out and back in
  beatSeconds: 3.4,             // one weak "lub-dub", then a long pause
  tint: [0.8, 0.8, 0.83]        // the art under the grey copy (or alone, for token rings)
};

/** Greyscale, toned: each channel is the art's brightness scaled by the tone. */
function drainMatrix() {
  const row = t => [0.299 * t, 0.587 * t, 0.114 * t, 0, 0.03];
  return [...row(DRAIN.tone[0]), ...row(DRAIN.tone[1]), ...row(DRAIN.tone[2]), 0, 0, 0, 1, 0];
}

function createDrainFx(token) {
  const container = newFxContainer();
  const blurs = { pulse: newBlur(2, 2) };
  const grey = makeArtCopy(token, drainMatrix(), blurs);
  const wash = new PIXI.Graphics();
  const pulse = new PIXI.Graphics(); pulse.filters = [blurs.pulse];
  container.addChild(...(grey ? [grey] : []), wash, pulse);
  const phase = (hashString(`${token.document?.id ?? token.id ?? ""}:drain`) % 1000) / 1000;
  return { container, blurs, grey, wash, pulse, phase, drawnKey: "" };
}

/** How visible the creature is now: a slow, uneven fade out and back in. */
function drainVisibility(T, phase) {
  const [lo, hi] = DRAIN.fade;
  const t = (T / DRAIN.fadeSeconds) + phase;
  const wave = 0.5 + 0.5 * Math.cos(t * Math.PI * 2);                    // 1 = strongest
  const drift = 0.5 + 0.5 * Math.cos(t * Math.PI * 2 * 0.37 + 1.7);      // keeps each fade a little different
  return lo + (hi - lo) * Math.min(1, Math.max(0, 0.8 * wave + 0.2 * drift));
}

/** The art drains to grey and fades in and out, with a faint, slow heartbeat ring. */
function updateDrainFx(token, fx, { now, zoom }) {
  const art = artCircle(token);
  const { x, y, r } = art;
  const T = now / 1000;
  fx.blurs.pulse.blur = Math.max(0.5, r * 0.03 * zoom);
  const key = `${Math.round(x)}|${Math.round(y)}|${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) {
    fx.wash.clear();
    if (!fx.grey) fx.wash.beginFill(DRAIN.wash, 1).drawCircle(x, y, r * 0.98).endFill();
    fx.drawnKey = key;
  }
  const visible = drainVisibility(T, fx.phase);
  syncArtCopy(token, fx.grey);
  if (fx.grey) fx.grey.alpha = visible;
  fx.wash.alpha = fx.grey ? 0 : 0.45 * visible;

  // A weak heartbeat: two faint rings close together ("lub-dub"), then a long pause
  fx.pulse.clear();
  const beat = ((T / DRAIN.beatSeconds) + fx.phase) % 1;
  for (const [start, strength] of [[0, 1], [0.12, 0.6]]) {
    const k = (beat - start) / 0.3;
    if (k < 0 || k > 1) continue;
    fx.pulse.lineStyle({ width: Math.max(1, r * 0.035 * (1 - k)), color: DRAIN.pulse, alpha: 0.28 * strength * (1 - k) });
    fx.pulse.drawCircle(x, y, r * (1.0 + 0.14 * k));
  }
  // With a grey copy on top, the coloured art underneath is mostly hidden so the colour drains away
  return { tint: DRAIN.tint, alpha: fx.grey ? visible * 0.3 : visible };
}

/* ---------- Marked: crosshairs ---------- */

const MARK = {
  color: 0xFF3B30,              // red reticle
  outline: 0x2A0000,            // dark edge, so it reads on any art
  glow: 0xFF5A4A,
  spinSeconds: 24,              // the corner brackets turn slowly
  pulseSeconds: 2.2,            // a gentle "locked on" pulse
  lockSeconds: 0.6              // brackets close in when the mark is applied
};

/** The fixed part of the reticle, centred on (0, 0): a thin ring, a cross with a gap and a dot. */
function drawReticle(g, r, color, width) {
  g.clear();
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  g.lineStyle({ width, color, alpha: 1, cap: round });
  g.drawCircle(0, 0, r * 0.46);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    g.moveTo(c * r * 0.16, s * r * 0.16); g.lineTo(c * r * 0.34, s * r * 0.34);   // inside the ring
    g.moveTo(c * r * 0.56, s * r * 0.56); g.lineTo(c * r * 0.8, s * r * 0.8);     // outside it
  }
  g.lineStyle(0);
  g.beginFill(color, 1).drawCircle(0, 0, Math.max(1, width * 0.9)).endFill();
}

/** Four corner brackets: short arcs at 45°, 135°, 225° and 315°. */
function drawBrackets(g, r, color, width) {
  g.clear();
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  g.lineStyle({ width, color, alpha: 1, cap: round });
  for (let k = 0; k < 4; k++) {
    const mid = Math.PI / 4 + k * Math.PI / 2, half = 0.36;
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const a = mid - half + (2 * half * i) / steps;
      const x = Math.cos(a) * r * 0.92, y = Math.sin(a) * r * 0.92;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }
}

function createMarkFx() {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { glow: newBlur(3, 3, ADD) };
  const glow = new PIXI.Container(); glow.filters = [blurs.glow];
  const glowReticle = new PIXI.Graphics(); glowReticle.blendMode = ADD;
  const glowBrackets = new PIXI.Graphics(); glowBrackets.blendMode = ADD;
  glow.addChild(glowReticle, glowBrackets);
  const reticle = new PIXI.Container();
  const reticleDark = new PIXI.Graphics(), reticleRed = new PIXI.Graphics();
  reticle.addChild(reticleDark, reticleRed);
  const brackets = new PIXI.Container();
  const bracketsDark = new PIXI.Graphics(), bracketsRed = new PIXI.Graphics();
  brackets.addChild(bracketsDark, bracketsRed);
  container.addChild(glow, reticle, brackets);
  return { container, blurs, glow, glowReticle, glowBrackets, reticle, reticleDark, reticleRed, brackets, bracketsDark, bracketsRed, born: null, drawnKey: "" };
}

/** Crosshairs over the creature: brackets lock on, then turn slowly; the reticle pulses gently. */
function updateMarkFx(token, fx, { now, zoom }) {
  const art = artCircle(token);
  const r = art.r, T = now / 1000;
  if (fx.born === null) fx.born = now;
  const key = `${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) {
    const core = Math.max(1, r * 0.022), edge = core + Math.max(1.5, r * 0.022);
    drawReticle(fx.reticleDark, r, MARK.outline, edge);
    drawReticle(fx.reticleRed, r, MARK.color, core);
    drawBrackets(fx.bracketsDark, r, MARK.outline, edge * 1.15);
    drawBrackets(fx.bracketsRed, r, MARK.color, core * 1.3);
    drawReticle(fx.glowReticle, r, MARK.glow, core * 2.5);
    drawBrackets(fx.glowBrackets, r, MARK.glow, core * 3);
    fx.drawnKey = key;
  }
  fx.blurs.glow.blur = Math.max(1, r * 0.04 * zoom);
  const lock = clamp01((now - fx.born) / (MARK.lockSeconds * 1000));
  const settle = 1 - (1 - lock) ** 3;                                     // fast, then easing in
  const pulse = Math.sin((T / MARK.pulseSeconds) * Math.PI * 2);
  const spin = (T / MARK.spinSeconds) * Math.PI * 2;
  for (const part of [fx.reticle, fx.brackets, fx.glow]) part.position.set(art.x, art.y);
  fx.reticle.scale.set(1 + 0.025 * pulse);
  fx.reticle.alpha = 0.9 + 0.1 * pulse;
  fx.brackets.scale.set((1.35 - 0.35 * settle) * (1 + 0.02 * pulse));
  fx.brackets.rotation = spin + (1 - settle) * 0.8;
  fx.brackets.alpha = 0.4 + 0.6 * settle;
  fx.glowBrackets.scale.set(fx.brackets.scale.x); fx.glowBrackets.rotation = fx.brackets.rotation;
  fx.glowReticle.scale.set(fx.reticle.scale.x);
  fx.glow.alpha = 0.35 + 0.15 * pulse;
  return { tint: [1, 1, 1], alpha: 1 };
}

/* ---------- Dodging: afterimages ---------- */

const DODGE = {
  ghosts: [{ side: 1, lag: 0, alpha: 0.42 }, { side: -1, lag: 0.18, alpha: 0.32 }],
  weaveSeconds: 1.8,            // one weave left and right
  reach: 0.2,                   // how far the afterimages slip aside (relative to the art's radius)
  ring: 0xE8ECF2,               // outline afterimages for art that can't be copied (token rings)
  artAlpha: 0.85                // the creature itself, a little see-through
};

function createDodgeFx(token) {
  const container = newFxContainer();
  const blurs = {};
  const ghosts = DODGE.ghosts.map((g, i) => {
    const sprite = makeArtCopy(token, null, {});
    const blur = newBlur(2, 2);
    blurs[`ghost${i}`] = blur;
    const shape = sprite ?? new PIXI.Graphics();                         // outline ghost without a copy
    shape.filters = [blur];
    return { ...g, shape, sprite };
  });
  container.addChild(...ghosts.map(g => g.shape));
  const phase = (hashString(`${token.document?.id ?? token.id ?? ""}:dodge`) % 1000) / 1000;
  return { container, blurs, ghosts, phase, drawnKey: "" };
}

/** Blurred afterimages of the creature weave side to side, as if it's in several places at once. */
function updateDodgeFx(token, fx, { now, zoom }) {
  const art = artCircle(token);
  const r = art.r, T = now / 1000;
  const key = `${Math.round(art.x)}|${Math.round(art.y)}|${Math.round(r * 4)}`;
  for (const g of fx.ghosts) {
    const weave = Math.sin(((T / DODGE.weaveSeconds) + fx.phase - g.lag) * Math.PI * 2);
    const dx = g.side * r * DODGE.reach * (0.55 + 0.45 * weave);
    const blur = g.shape.filters?.[0];
    if (blur) { blur.blur = Math.max(1, r * 0.05 * zoom); if ("blurY" in blur) blur.blurY = Math.max(0.5, r * 0.01 * zoom); }
    if (g.sprite) {
      syncArtCopy(token, g.sprite, dx);
    } else {
      if (key !== fx.drawnKey) {
        g.shape.clear();
        g.shape.lineStyle({ width: Math.max(1, r * 0.05), color: DODGE.ring, alpha: 1 });
        g.shape.beginFill(DODGE.ring, 0.25).drawCircle(0, 0, r * 0.97).endFill();
      }
      g.shape.position.set(art.x + dx, art.y);
    }
    g.shape.alpha = g.alpha * (0.8 + 0.2 * Math.abs(weave));
  }
  fx.drawnKey = key;
  return { tint: [1, 1, 1], alpha: DODGE.artAlpha };
}

// ===== src/13-fx-drakkenheim.js =====
/* ---------- Monsters of Drakkenheim conditions ---------- */

/*
 * Which creatures have them. The animations: Clumsy, Enfeebled, Defenseless and Helpless are in
 * 13-fx-drakkenheim4.js, Sickened in 13-fx-drakkenheim5.js, Addled in 13-fx-drakkenheim6.js.
 */
const isAddled = actor => hasStatusMatching(actor, /(^|[^a-z])addled$/i);
const isClumsy = actor => hasStatusMatching(actor, /(^|[^a-z])clumsy$/i);
const isEnfeebled = actor => hasStatusMatching(actor, /(^|[^a-z])enfeebled$/i);
const isSickened = actor => hasStatusMatching(actor, /(^|[^a-z])sickened$/i);
const isDefenseless = actor => hasStatusMatching(actor, /(^|[^a-z])defen[cs]eless$/i);
const isHelpless = actor => hasStatusMatching(actor, /(^|[^a-z])helpless$/i);
// ===== src/13-fx-drakkenheim2.js =====
/* ---------- More Monsters of Drakkenheim conditions ---------- */

/*
 * Valor: a warm golden glow with rising sparks. (Shocked's lightning is in 13-fx-drakkenheim6.js,
 * Immobilized and Jinxed in 13-fx-drakkenheim5.js, Entangled's vines and Frozen's ice in
 * 13-fx-ice-and-vines.js.) Entangled and Frozen also make a creature Immobilized and Defenseless, and
 * Shocked makes it Defenseless: those show only their own animation.
 */
const isImmobilizedOnly = actor => hasStatusMatching(actor, /(^|[^a-z])immobili[sz]ed$/i) && !isEntangled(actor) && !isFrozen(actor);
const isEntangled = actor => hasStatusMatching(actor, /(^|[^a-z])entangled$/i);
const isFrozen = actor => hasStatusMatching(actor, /(^|[^a-z])frozen$/i);
const isShocked = actor => hasStatusMatching(actor, /(^|[^a-z])shocked$/i);
const isJinxed = actor => hasStatusMatching(actor, /(^|[^a-z])jinxed$/i);
const isValorous = actor => hasStatusMatching(actor, /(^|[^a-z])valou?r$/i);
/** Defenseless on its own (not as part of Entangled, Frozen or Shocked, which have their own look). */
const isDefenselessOnly = actor => isDefenseless(actor) && !isEntangled(actor) && !isFrozen(actor) && !isShocked(actor);

const DRAKK2 = {
  valor: { glow: 0xFFC94A, ray: 0xFFE8A0, spark: 0xFFF2C0, sparks: 12, riseSeconds: 2.2, tint: [1, 0.97, 0.88] }
};

/* ---------- Valor ---------- */

function createValorFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { glow: newBlur(8, 3, ADD) };
  const glow = new PIXI.Graphics(); glow.blendMode = ADD; glow.filters = [blurs.glow];
  const sparks = new PIXI.Graphics(); sparks.blendMode = ADD;
  container.addChild(glow, sparks);
  const rand = seededRandom(hashString(`${token.id ?? ""}:valor`));
  const sparkData = Array.from({ length: DRAKK2.valor.sparks }, (_, i) => ({ side: i % 2 ? 1 : -1, out: 0.85 + rand() * 0.3, phase: rand(), speed: 0.8 + rand() * 0.5, size: 0.02 + rand() * 0.02 }));
  return { container, blurs, glow, sparks, sparkData, drawnKey: "" };
}

/** A warm golden glow breathes round the creature and golden sparks rise from it. */
function updateValorFx(token, fx, { now, zoom }) {
  const V = DRAKK2.valor, art = artCircle(token);
  const r = art.r, T = now / 1000;
  const key = `${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) {
    fx.glow.clear();
    fx.glow.lineStyle({ width: r * 0.16, color: V.glow, alpha: 1 });
    fx.glow.drawCircle(0, 0, r * 0.95);
    for (let k = 0; k < 8; k++) {                                        // soft rays
      const a = (k / 8) * Math.PI * 2;
      fx.glow.lineStyle({ width: r * 0.05, color: V.ray, alpha: 0.6 });
      fx.glow.moveTo(Math.cos(a) * r, Math.sin(a) * r); fx.glow.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25);
    }
    fx.drawnKey = key;
  }
  fx.blurs.glow.blur = Math.max(1, r * 0.1 * zoom);
  fx.glow.position.set(art.x, art.y);
  fx.glow.alpha = 0.4 + 0.15 * Math.sin(T * 1.4);
  fx.glow.rotation = T * 0.15;
  const g = fx.sparks;
  g.clear();
  for (const d of fx.sparkData) {
    const life = (T * d.speed / V.riseSeconds + d.phase) % 1;
    const alpha = Math.sin(Math.PI * life);
    if (alpha < 0.03) continue;
    const y = art.y + r * (0.7 - 1.6 * life);                         // up the sides, curving in over the head
    const across = Math.sqrt(Math.max(0, 1 - ((y - art.y) / (r * 1.05)) ** 2));
    const x = art.x + d.side * r * d.out * Math.max(0.25, across);
    g.beginFill(V.spark, 0.9 * alpha).drawCircle(x, y, Math.max(0.7, r * d.size)).endFill();
  }
  return { tint: V.tint, alpha: 1 };
}
// ===== src/13-fx-drakkenheim3.js =====
/* ---------- Monsters of Drakkenheim: Madness ---------- */

/*
 * (Bewildered's wand is in 13-fx-drakkenheim6.js, Distracted in 13-fx-drakkenheim4.js, Staggered in 13-fx-drakkenheim5.js.)
 * Drakkenheim Madness: dark violet tendrils curling up from behind it, and now and then a twitch.
 * Slowed shares the Slow spell's dragging outline (10-fx-core.js, isSlowed).
 */
const isBewildered = actor => hasStatusMatching(actor, /(^|[^a-z])bewildered$/i);
const isStaggered = actor => hasStatusMatching(actor, /(^|[^a-z])staggered$/i);
const isMaddened = actor => hasStatusMatching(actor, /(^|[^a-z])drakkenheim-?madness$/i);

const DRAKK3 = {
  madness: { tendril: 0x7B2FBF, edge: 0x14041F, glow: 0xC23BFF, tendrils: 6, twitchSeconds: 3.4, tint: [0.93, 0.86, 1] }
};

/* ---------- Drakkenheim Madness ---------- */

function createMadnessFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { glow: newBlur(8, 3, ADD) };
  const glow = new PIXI.Graphics(); glow.blendMode = ADD; glow.filters = [blurs.glow];
  const tendrils = new PIXI.Graphics();
  container.addChild(glow, tendrils);
  const rand = seededRandom(hashString(`${token.id ?? ""}:madness`));
  const count = DRAKK3.madness.tendrils;
  const list = Array.from({ length: count }, (_, i) => ({
    a: -Math.PI * (0.08 + 0.84 * ((i + 0.2 + rand() * 0.6) / count)),   // round the upper half
    len: 0.26 + rand() * 0.16, curl: (rand() < 0.5 ? -1 : 1) * (0.7 + rand() * 0.6), phase: rand() * 6.3, speed: 0.9 + rand() * 0.7
  }));
  const seed = hashString(`${token.id ?? ""}:twitch`);
  return { container, blurs, glow, tendrils, list, seed };
}

function updateMadnessFx(token, fx, { now, zoom }) {
  const M = DRAKK3.madness, art = artCircle(token);
  const r = art.r, T = now / 1000;
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  const g = fx.tendrils, glow = fx.glow;
  g.clear(); glow.clear();
  fx.blurs.glow.blur = Math.max(1, r * 0.1 * zoom);
  // a twitch: now and then (a different moment each cycle), everything jerks and the art flashes
  const cycle = Math.floor(T / M.twitchSeconds);
  const at = seededRandom((fx.seed + cycle * 7919) >>> 0)() * 0.7;
  const p = (T / M.twitchSeconds) % 1;
  const twitch = Math.exp(-(((p - at) * 30) ** 2));
  glow.beginFill(M.glow, 0.16 + 0.1 * Math.sin(T * 1.1) + 0.25 * twitch).drawEllipse(art.x, art.y - r * 0.55, r * 0.95, r * 0.55).endFill();
  for (const t of fx.list) {
    const writhe = Math.sin(T * t.speed + t.phase);
    const len = r * t.len * (0.85 + 0.15 * writhe) * (1 + 0.15 * twitch);
    const bx = art.x + Math.cos(t.a) * r * 0.9, by = art.y + Math.sin(t.a) * r * 0.9;
    const ox = Math.cos(t.a), oy = Math.sin(t.a), px = -oy, py = ox;
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const s = k / 10;
      const bend = t.curl * s * s * (1.2 + 0.4 * writhe) + 0.25 * Math.sin(s * 5 + T * 2 * t.speed + t.phase) * s;
      pts.push([bx + ox * len * s + px * bend * r * 0.18, by + oy * len * s + py * bend * r * 0.18]);
    }
    // tapering: drawn in pieces, thinner towards the tip
    for (let k = 1; k < pts.length; k++) {
      const s = k / (pts.length - 1), core = Math.max(0.8, r * 0.05 * (1 - 0.8 * s));
      for (const [color, width, alpha] of [[M.edge, core + Math.max(1.2, r * 0.02), 0.9], [M.tendril, core, 0.95]]) {
        g.lineStyle({ width, color, alpha: alpha * (1 - 0.35 * s), cap: round });
        g.moveTo(pts[k - 1][0], pts[k - 1][1]); g.lineTo(pts[k][0], pts[k][1]);
      }
    }
  }
  const t = M.tint.map(c => 1 - (1 - c) * (0.6 + 0.4 * twitch));
  return { tint: t, alpha: 1 };
}
// ===== src/13-fx-drakkenheim4.js =====
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
// ===== src/13-fx-drakkenheim5.js =====
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
// ===== src/13-fx-drakkenheim6.js =====
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
// ===== src/13-fx-ice-and-vines.js =====
/* ---------- Frozen and Entangled: sealed in ice, bound by vines ---------- */

/*
 * Frozen: the creature turns to ice (a recoloured copy of its art, pale cyan with deep teal shadows)
 * inside a thick ring of faceted ice that glows a strong cold blue. Splinters fly off it and frost
 * mist rolls away. It freezes with a flash, a burst of splinters and a jolt, and cracks and shatters
 * when the status ends.
 *
 * Entangled: the paths of its vines (vinePlan), climbing its sides from the ground and binding it
 * across the body; the painted vines that follow them are in 13-fx-drakkenheim6.js.
 *
 * Both are laid out in the art's own circle, in units of its radius (the unit circle is the art's edge).
 */

const ICE = {
  light: [0xF4FCFF, 0xE4F7FF, 0xD0EFFF],     // facets facing the light (upper left)
  dark: [0xAEDDF5, 0x93CEEE, 0x7ABBE2],      // facets turned away from it
  deep: [0x5FB4E6, 0x4FA3DB],                 // the ring's darkest facets, where the ice is thickest
  edge: 0xFFFFFF,                             // facet edges, rims and glints
  outline: 0x1F5E8C,                          // a thin deep-blue line round the ice, so it reads on any map
  frost: 0xF2FBFF,                            // frost thickening inside the ring
  glow: 0x2FA8FF,                             // the strong cold glow round it
  mist: 0xDDF3FF,                             // frost mist billowing off it
  crystal: { light: 0xF2FBFF, mid: 0xB4E2FA, dark: 0x6FAED8, line: 0x2A6796 },
  ringInner: 0.93, ringOuter: 1.15,           // the ice ring, in units of the art's radius
  tint: [0.6, 0.79, 1],                       // the art beneath, turned cold (when it can't be turned to ice)
  appearSeconds: 0.9,
  shatterSeconds: 0.9,
  sheenEvery: 5.5,                            // a cold sheen sweeps across every few seconds…
  sheenSeconds: 1.3,                          // …taking this long
  shards: 14,                                 // splinters of ice flying off it all the time
  burst: 28,                                  // …and in a burst as it freezes and as it shatters
  mistPuffs: 7
};

const VINES = {
  growSeconds: 1.1,
  snapSeconds: 0.7,
  squeezeSeconds: 3.4,                        // the binding vines tighten every few seconds
  tint: [0.9, 0.97, 0.85]
};

const TAU = Math.PI * 2;
const easeOutCubic = x => 1 - (1 - x) ** 3;
const easeOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
const mixTint = (tint, k) => tint.map(c => 1 + (c - 1) * k);

/* ---------- Frozen ---------- */

/** Points round two rings joined into triangles (each ring sorted by angle, both starting near 0). */
function zipRings(A, B) {
  const tris = [], n = A.length, m = B.length;
  const angA = i => A[i % n].a + TAU * Math.floor(i / n), angB = j => B[j % m].a + TAU * Math.floor(j / m);
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (j >= m || (i < n && angA(i + 1) <= angB(j + 1))) { tris.push([A[i % n], A[(i + 1) % n], B[j % m]]); i++; }
    else { tris.push([A[i % n], B[j % m], B[(j + 1) % m]]); j++; }
  }
  return tris;
}

/** How far round from the top a point is: 0 at the top, 1 at the bottom. */
function fromTop(x, y) {
  const a = Math.atan2(y, x) + Math.PI / 2;
  return Math.abs(((a + Math.PI) % TAU + TAU) % TAU - Math.PI) / Math.PI;
}

/** A triangle as a shaded piece of ice: its points, centre, which way it flies when the ice shatters, and how it's lit. */
function icePiece(t, rand, pickShade) {
  const cx = (t[0].x + t[1].x + t[2].x) / 3, cy = (t[0].y + t[1].y + t[2].y) / 3;
  const dist = Math.hypot(cx, cy);
  const out = dist > 0.05 ? [cx / dist, cy / dist] : [Math.cos(rand() * TAU), Math.sin(rand() * TAU)];
  // lit from the upper left, with some facets catching more light than their neighbours
  const lit = clamp01(0.5 + (-cx * 0.5 - cy * 0.7) * 0.55 + (rand() - 0.5) * 0.6);
  const shades = pickShade(lit);
  return { pts: t.flatMap(p => [p.x, p.y]), cx, cy, dist, out, color: shades[Math.floor(rand() * shades.length)],
    speed: 0.55 + rand() * 0.75, spin: (rand() - 0.5) * 7 };
}

/** Facets over the art itself, so it looks carved from ice: clearer in the middle, frostier toward the ring. */
function iceFacets(rand) {
  const rings = [[0, 1], [0.33, 6], [0.66, 11], [0.95, 17]];
  const pts = rings.map(([rad, n], k) => {
    if (n === 1) return [{ x: (rand() - 0.5) * 0.1, y: (rand() - 0.5) * 0.1, a: 0 }];
    return Array.from({ length: n }, (_, i) => {
      const a = ((i + rand() * 0.4) / n) * TAU;
      const rr = k === rings.length - 1 ? rad : rad * (0.88 + rand() * 0.24);
      return { x: Math.cos(a) * rr, y: Math.sin(a) * rr, a };
    });
  });
  const tris = [];
  const centre = pts[0][0], first = pts[1];
  for (let i = 0; i < first.length; i++) tris.push([centre, first[i], first[(i + 1) % first.length]]);
  for (let k = 1; k < pts.length - 1; k++) tris.push(...zipRings(pts[k], pts[k + 1]));
  return tris.map(t => {
    const f = icePiece(t, rand, lit => lit > 0.5 ? ICE.light : ICE.dark);
    return { ...f, alpha: 0.2 + 0.3 * f.dist + rand() * 0.14, edgeAlpha: rand() < 0.35 ? 0.05 : 0.15 + rand() * 0.3,
      reveal: 0.15 + (1 - Math.min(1, f.dist)) * 0.45 };   // the edge freezes first, the middle last
  });
}

/** Fine frost cracks creeping in from the edge, each with a branch. */
function iceVeins(rand) {
  return Array.from({ length: 8 }, (_, i) => {
    let a = ((i + 0.2 + rand() * 0.6) / 8) * TAU, rad = 0.93;
    const reach = 0.5 + rand() * 0.25, pts = [[Math.cos(a) * rad, Math.sin(a) * rad]];
    for (let k = 1; k <= 4; k++) {
      rad -= (0.93 - reach) / 4; a += (rand() - 0.5) * 0.22;
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    const [bx, by] = pts[2], side = rand() < 0.5 ? -1 : 1, ba = Math.atan2(by, bx) + side * (0.35 + rand() * 0.3);
    const branch = [[bx, by], [bx - Math.cos(ba) * 0.16, by - Math.sin(ba) * 0.16]];
    return { pts, branch };
  });
}

/** The thick ring of ice round the art: three rings of points, jagged outside, joined into shaded facets. */
function iceRing(rand) {
  const n = 36;
  const ring = (rad, jag) => Array.from({ length: n }, (_, i) => {
    const a = ((i + (rand() - 0.5) * 0.5) / n) * TAU;
    const rr = rad * (1 + (rand() - 0.5) * jag);
    return { x: Math.cos(a) * rr, y: Math.sin(a) * rr, a };
  });
  const inner = ring(ICE.ringInner, 0.03), mid = ring((ICE.ringInner + ICE.ringOuter) / 2, 0.05), outer = ring(ICE.ringOuter, 0.09);
  const facets = [...zipRings(inner, mid), ...zipRings(mid, outer)].map(t => {
    const f = icePiece(t, rand, lit => lit > 0.62 ? ICE.light : lit > 0.3 ? ICE.dark : ICE.deep);
    return { ...f, alpha: 0.84 + rand() * 0.14, edgeAlpha: 0.2 + rand() * 0.35, reveal: fromTop(f.cx, f.cy) * 0.4 };   // freezing round from the top
  });
  // cracks right across the ring, just before it shatters
  const cracks = Array.from({ length: 9 }, (_, i) => {
    const a = ((i + 0.3 + rand() * 0.4) / 9) * TAU;
    return [0, 1, 2, 3].map(k => { const rad = ICE.ringInner - 0.02 + (ICE.ringOuter - ICE.ringInner + 0.04) * k / 3, w = a + (k % 2 ? 1 : -1) * 0.03 * rand();
      return [Math.cos(w) * rad, Math.sin(w) * rad]; });
  });
  return { facets, inner: inner.flatMap(p => [p.x, p.y]), outer: outer.flatMap(p => [p.x, p.y]), cracks };
}

/** Splinters of ice: flying off all the time, or in a burst (as it freezes and as it shatters). */
function iceShardData(rand, n, burst) {
  return Array.from({ length: n }, () => {
    let a = rand() * TAU;
    if (!burst && rand() < 0.5) a = (-80 + rand() * 100) * Math.PI / 180;   // more off the upper right, as if blown off
    return { a, phase: rand(), speed: 0.3 + rand() * 0.3, reach: burst ? 0.7 + rand() * 1.1 : 0.5 + rand() * 0.6,
      size: 0.022 + rand() * 0.04, spin: (rand() - 0.5) * 9, rot: rand() * TAU, stretch: 1.4 + rand() * 1.4, delay: burst ? rand() * 0.2 : 0 };
  });
}

/** A colour matrix that turns the art into ice: its light and shade kept, coloured from deep teal to near white. */
function iceMatrix() {
  const contrast = 1.25, shift = -0.1;                  // crisper light and shade, like carved ice
  const row = (k, o) => [0.299 * k * contrast, 0.587 * k * contrast, 0.114 * k * contrast, 0, o + k * shift];
  return [...row(0.9, -0.05), ...row(0.85, 0.25), ...row(0.55, 0.5), 0, 0, 0, 1, 0];
}

function createFrozenFx(token) {
  const container = newFxContainer();
  const ADD = PIXI.BLEND_MODES.ADD;
  const blurs = { glow: newBlur(10, 3, ADD), mist: newBlur(8, 2), frost: newBlur(5, 3) };
  const part = (name, blur, blend) => { const g = new PIXI.Graphics(); g.name = name; if (blur) g.filters = [blur]; if (blend) g.blendMode = blend; return g; };
  const glow = part("glow", blurs.glow, ADD);
  const mist = part("mist", blurs.mist);
  // the creature itself turned to ice: a recoloured copy of its art (token rings get the frost and a cold tint instead)
  const statue = makeArtCopy(token, iceMatrix(), blurs);
  if (statue) statue.alpha = 0;
  const frost = part("frost", blurs.frost);
  const block = part("block");
  const ring = part("ring");
  const sheen = part("sheen", null, ADD);
  const shards = part("shards");
  const sparkle = part("sparkle", null, ADD);
  container.addChild(glow, mist, ...(statue ? [statue] : []), frost, block, ring, sheen, shards, sparkle);
  const rand = seededRandom(hashString(`${token.id ?? ""}:ice`));
  const ringData = iceRing(rand);
  // glints winking on the ring, mostly on its upper left where the light catches it
  const tips = Array.from({ length: 6 }, (_, i) => {
    const a = (i < 4 ? -2.9 + rand() * 1.6 : rand() * TAU), d = ICE.ringInner + 0.03 + rand() * (ICE.ringOuter - ICE.ringInner - 0.06);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, phase: rand() * TAU, speed: 0.6 + rand() * 0.8 };
  });
  const mistData = Array.from({ length: ICE.mistPuffs }, (_, i) => ({ a: ((i + rand() * 0.8) / ICE.mistPuffs) * TAU, phase: rand(), speed: 0.12 + rand() * 0.1,
    size: 0.18 + rand() * 0.14, drift: 0.25 + rand() * 0.25 }));
  return { container, blurs, glow, mist, statue, frost, block, ring, sheen, shards, sparkle,
    facets: iceFacets(rand), veins: iceVeins(rand), ringData, tips, mistData,
    flying: iceShardData(rand, ICE.shards, false), burstIn: iceShardData(rand, ICE.burst, true), burstOut: iceShardData(rand, ICE.burst, true),
    born: null, drawnKey: "", ringKey: "" };
}

/** Rotate flat [x, y, …] points by an angle round (cx, cy), then move them. */
function movePoints(pts, cx, cy, angle, dx, dy, scale = 1) {
  const c = Math.cos(angle), s = Math.sin(angle), out = new Array(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] - cx, y = pts[i + 1] - cy;
    out[i] = (cx + (x * c - y * s)) * scale + dx * scale;
    out[i + 1] = (cy + (x * s + y * c)) * scale + dy * scale;
  }
  return out;
}

/** Shaded pieces of ice, each shown as it freezes over and flying off (spinning, falling) as it shatters. */
function drawIcePieces(g, list, r, appear, fly, alphaScale) {
  const thin = Math.max(0.5, r * 0.008);
  const fade = (1 - fly) ** 1.3;
  if (fade <= 0.01) return;
  for (const f of list) {
    const shown = clamp01((appear - f.reveal) / 0.3);
    if (shown <= 0) continue;
    const pts = fly > 0
      ? movePoints(f.pts, f.cx, f.cy, f.spin * fly * 0.6, f.out[0] * f.speed * fly, f.out[1] * f.speed * fly + 1.4 * fly * fly, r)
      : f.pts.map(v => v * r);
    g.lineStyle({ width: thin, color: ICE.edge, alpha: f.edgeAlpha * shown * fade });
    g.beginFill(f.color, f.alpha * alphaScale * shown * fade).drawPolygon(pts).endFill();
  }
  g.lineStyle(0);
}

/** The faint facets and frost cracks over the art (brighter as the ice cracks before it shatters). */
function drawIceBlock(fx, r, appear, crack, fly) {
  const g = fx.block;
  g.clear();
  drawIcePieces(g, fx.facets, r, appear, fly, fx.statue ? 0.28 : 1);
  if (fly > 0.3) return;
  const veinAlpha = ((fx.statue ? 0.26 : 0.38) + 0.6 * crack) * clamp01((appear - 0.4) / 0.4) * (1 - fly / 0.3);
  if (veinAlpha <= 0.01) return;
  g.lineStyle({ width: Math.max(0.6, r * (0.012 + 0.012 * crack)), color: ICE.edge, alpha: veinAlpha });
  for (const v of fx.veins) {
    v.pts.forEach(([x, y], i) => { if (i === 0) g.moveTo(x * r, y * r); else g.lineTo(x * r, y * r); });
    g.moveTo(v.branch[0][0] * r, v.branch[0][1] * r); g.lineTo(v.branch[1][0] * r, v.branch[1][1] * r);
    if (crack > 0) {
      const [x, y] = v.pts[v.pts.length - 1];
      g.moveTo(x * r, y * r); g.lineTo(x * r * (1 - crack), y * r * (1 - crack));
    }
  }
  g.lineStyle(0);
}

/** The ice ring with its glossy highlights, and the cracks across it just before it shatters. */
function drawIceRing(fx, r, appear, crack, fly) {
  const g = fx.ring, R = fx.ringData;
  g.clear();
  drawIcePieces(g, R.facets, r, appear, fly, 1);
  const whole = clamp01((appear - 0.35) / 0.3) * (1 - clamp01(fly / 0.15));
  if (whole > 0.01) {
    // a thin deep-blue line round both edges, so the ring reads on light maps too, and a bright inner rim
    g.lineStyle({ width: Math.max(0.6, r * 0.012), color: ICE.outline, alpha: 0.5 * whole });
    g.drawPolygon(R.outer.map(v => v * r));
    g.drawPolygon(R.inner.map(v => v * r * 0.995));
    g.lineStyle({ width: Math.max(0.6, r * 0.016), color: ICE.edge, alpha: 0.65 * whole });
    g.drawPolygon(R.inner.map(v => v * r * 1.01));
    // glossy highlights on the upper left and lower right
    const arc = (rad, a0, a1, width, alpha) => {
      g.lineStyle({ width: Math.max(0.8, r * width), color: ICE.edge, alpha: alpha * whole });
      g.moveTo(Math.cos(a0) * rad * r, Math.sin(a0) * rad * r);
      g.arc(0, 0, rad * r, a0, a1);
    };
    arc(1.065, -2.95, -1.95, 0.038, 0.8);
    arc(1.03, -1.75, -1.5, 0.02, 0.6);
    arc(1.02, 0.35, 0.95, 0.022, 0.45);
    g.lineStyle(0);
  }
  if (crack > 0 && fly < 0.15) {
    g.lineStyle({ width: Math.max(0.8, r * 0.022), color: ICE.edge, alpha: crack * (1 - fly / 0.15) });
    for (const c of R.cracks) c.forEach(([x, y], i) => { if (i === 0) g.moveTo(x * r, y * r); else g.lineTo(x * r, y * r); });
    g.lineStyle(0);
  }
}

/** A thin splinter of ice: a long diamond, half of it shaded. */
function drawShard(g, x, y, s, rot, stretch, alpha) {
  const c = Math.cos(rot), sn = Math.sin(rot), L = s * stretch, W = s * 0.5;
  const pts = [x + c * L, y + sn * L, x - sn * W, y + c * W, x - c * L * 0.6, y - sn * L * 0.6, x + sn * W, y - c * W];
  g.lineStyle({ width: Math.max(0.5, s * 0.16), color: ICE.outline, alpha: alpha * 0.45 });
  g.beginFill(ICE.crystal.light, alpha).drawPolygon(pts).endFill();
  g.lineStyle(0);
  g.beginFill(ICE.crystal.mid, alpha * 0.85).drawPolygon(pts.slice(0, 6)).endFill();
}

/** A burst of splinters flying out from the ring and falling, `age` seconds after it started. */
function drawIceBurst(g, list, r, age) {
  const k = age / 1.1;
  if (k <= 0 || k >= 1) return;
  for (const s of list) {
    const q = easeOutCubic(clamp01((k - s.delay) / (1 - s.delay)));
    if (q <= 0) continue;
    const d = ICE.ringInner + q * s.reach;
    const x = Math.cos(s.a) * d * r, y = (Math.sin(s.a) * d + 0.5 * k * k) * r;
    drawShard(g, x, y, s.size * r * 1.3, s.rot + s.spin * k, s.stretch, 0.95 * (1 - k) ** 1.2);
  }
}

/** A four-pointed glint. */
function drawGlint(g, x, y, s, alpha) {
  const k = s * 0.2;
  g.beginFill(ICE.edge, alpha).drawPolygon([x, y - s, x + k, y - k, x + s, y, x + k, y + k, x, y + s, x - k, y + k, x - s, y, x - k, y - k]).endFill();
}

/**
 * Frozen solid: the creature turned to ice inside a thick, glowing ring of it, splinters flying off
 * and frost mist rolling away. It freezes with a flash, a burst of splinters and a jolt, and
 * shatters when the status ends.
 */
function updateFrozenFx(token, fx, { now, zoom, ending }) {
  const art = artCircle(token);
  const r = art.r, T = now / 1000;
  if (fx.born === null) fx.born = now;
  const age = Math.max(0, (now - fx.born) / 1000);
  const appear = clamp01(age / ICE.appearSeconds);
  const end = clamp01(ending ?? 0);                    // 0 → 1 while it shatters
  const crack = clamp01(end / 0.15), fly = clamp01((end - 0.12) / 0.88);
  // a jolt as it freezes
  const shake = age < 0.45 ? Math.sin(age * 70) * r * 0.035 * (1 - age / 0.45) ** 2 : 0;
  for (const p of [fx.glow, fx.mist, fx.frost, fx.block, fx.ring, fx.sheen, fx.shards, fx.sparkle]) p.position.set(art.x + shake, art.y);
  syncArtCopy(token, fx.statue, shake);
  if (fx.statue) fx.statue.alpha = easeOutCubic(clamp01((appear - 0.1) / 0.4)) * (1 - clamp01(fly * 1.8));

  // the glow round it and the frost inside the ring: drawn once per size, faded in and out
  const key = `${Math.round(r * 4)}`;
  if (key !== fx.ringKey) {
    fx.glow.clear();
    fx.glow.lineStyle({ width: r * 0.42, color: ICE.glow, alpha: 1 });
    fx.glow.drawCircle(0, 0, r * 1.06);
    fx.glow.lineStyle(0);
    fx.glow.beginFill(ICE.glow, 0.22).drawCircle(0, 0, r * 0.9).endFill();
    fx.frost.clear();
    fx.frost.lineStyle({ width: r * 0.2, color: ICE.frost, alpha: 1 });
    fx.frost.drawCircle(0, 0, r * 0.86);
    fx.ringKey = key;
  }
  fx.blurs.glow.blur = Math.max(1, r * 0.2 * zoom);
  fx.blurs.mist.blur = Math.max(1, r * 0.14 * zoom);
  fx.blurs.frost.blur = Math.max(1, r * 0.07 * zoom);
  const fadeOut = 1 - clamp01(end / 0.35);
  fx.glow.alpha = (0.72 + 0.12 * Math.sin(T * 1.3)) * easeOutCubic(appear) * fadeOut + (crack > 0 ? 0.3 * crack * fadeOut : 0);
  fx.frost.alpha = (fx.statue ? 0.36 : 0.6) * easeOutCubic(clamp01((appear - 0.2) / 0.5)) * fadeOut;

  // the ice itself: redrawn while it forms or shatters, then held
  const settled = appear >= 1 && end === 0;
  if (!settled || fx.drawnKey !== key) {
    drawIceBlock(fx, r, appear, crack, fly);
    drawIceRing(fx, r, appear, crack, fly);
    fx.drawnKey = settled ? key : "";
  }

  // frost mist rolling off the ring, and a cold puff as it freezes and as it bursts
  const m = fx.mist;
  m.clear();
  const mistAlpha = appear * (1 - end);
  for (const p of fx.mistData) {
    const life = (T * p.speed + p.phase) % 1, a = 0.3 * Math.sin(Math.PI * life) * mistAlpha;
    if (a < 0.02) continue;
    const d = 1.0 + life * p.drift;
    m.beginFill(ICE.mist, a).drawCircle(Math.cos(p.a) * d * r, (Math.sin(p.a) * d - life * 0.12) * r, p.size * r * (0.8 + 0.5 * life)).endFill();
  }
  const puff = (k, alpha) => {
    if (k <= 0 || k >= 1) return;
    m.lineStyle({ width: r * 0.3 * (1 - k) + 1, color: ICE.mist, alpha: alpha * (1 - k) });
    m.drawCircle(0, 0, r * (0.95 + 0.7 * easeOutCubic(k)));
    m.lineStyle(0);
  };
  puff(age / 0.9, 0.55);
  puff(fly / 0.7, 0.5);

  // a cold sheen sweeping across the ice now and then (diagonal chords clipped to the ring)
  const s = fx.sheen;
  s.clear();
  const cycle = ((T + 1.7) % ICE.sheenEvery) / ICE.sheenSeconds;
  if (cycle < 1 && end === 0 && appear >= 1) {
    const RR = r * 1.1, centre = (-1.2 + 2.4 * easeOutCubic(cycle)) * RR, step = r * 0.05;
    const nx = Math.SQRT1_2, ny = Math.SQRT1_2, tx = Math.SQRT1_2, ty = -Math.SQRT1_2;
    for (let k = -4; k <= 4; k++) {
      const off = centre + k * step;
      if (Math.abs(off) >= RR) continue;
      const half = Math.sqrt(RR * RR - off * off), a = 0.3 * Math.exp(-(k * k) / 6) * Math.sin(Math.PI * cycle);
      if (a < 0.01) continue;
      s.lineStyle({ width: step * 1.05, color: ICE.edge, alpha: a });
      s.moveTo(nx * off - tx * half, ny * off - ty * half); s.lineTo(nx * off + tx * half, ny * off + ty * half);
    }
    s.lineStyle(0);
  }

  // splinters flying off all the time, and in bursts as it freezes and as it shatters
  const sh = fx.shards;
  sh.clear();
  if (appear >= 0.5 && end === 0) {
    const on = clamp01((appear - 0.5) / 0.5);
    for (const p of fx.flying) {
      const life = (T * p.speed + p.phase) % 1, a = Math.sin(Math.PI * life) ** 0.8 * 0.85 * on;
      if (a < 0.03) continue;
      const d = ICE.ringOuter + life * p.reach;
      drawShard(sh, Math.cos(p.a) * d * r, (Math.sin(p.a) * d + 0.25 * life * life) * r, p.size * r * (1 - 0.4 * life), p.rot + p.spin * T * 0.3, p.stretch, a);
    }
  }
  drawIceBurst(sh, fx.burstIn, r, age);
  if (end > 0) drawIceBurst(sh, fx.burstOut, r, (end - 0.12) * ICE.shatterSeconds);

  // glints on the ring, and the flashes as it forms and cracks
  const g = fx.sparkle;
  g.clear();
  if (end === 0 && appear > 0.6) {
    for (const d of fx.tips) {
      const tw = Math.max(0, Math.sin(T * d.speed + d.phase)) ** 12;
      if (tw < 0.04) continue;
      drawGlint(g, d.x * r, d.y * r, r * 0.08 * (0.5 + 0.5 * tw), tw);
    }
  }
  if (appear < 1) {
    const k = easeOutCubic(appear);
    g.beginFill(ICE.edge, 0.5 * (1 - k) ** 2).drawCircle(0, 0, r * 1.05).endFill();
    g.lineStyle({ width: r * 0.1 * (1 - k) + 0.5, color: ICE.edge, alpha: 0.9 * (1 - k) });
    g.drawCircle(0, 0, r * (0.75 + 0.6 * k));
    g.lineStyle(0);
  }
  if (end > 0 && end < 0.3) g.beginFill(ICE.edge, 0.55 * (1 - end / 0.3)).drawCircle(0, 0, r * (1.05 + 0.3 * end)).endFill();

  return { tint: mixTint(ICE.tint, easeOutCubic(appear) * (1 - easeOutCubic(fly))), alpha: 1 };
}

/* ---------- Entangled ---------- */

/** A smooth curve through some points (Catmull-Rom), as `steps` points with the distance along it. */
function smoothPath(ctrl, steps) {
  const out = [];
  const at = (i) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let s = 0; s <= steps; s++) {
    const u = (s / steps) * (ctrl.length - 1), i = Math.min(ctrl.length - 2, Math.floor(u)), t = u - i;
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

/** The vines: some climbing the creature's sides from the ground, two binding it across the body. */
function vinePlan(rand) {
  const jit = v => v + (rand() - 0.5) * 0.18;
  const climb = (from, to, rad, wave, width, delay, leaves) => {
    const a0 = jit(from), a1 = jit(to), ph = rand() * TAU, ctrl = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, a = a0 + (a1 - a0) * t;
      const rr = (k === 0 ? 1.14 : rad) + wave * Math.sin(t * Math.PI * 2.5 + ph);
      ctrl.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    return { pts: smoothPath(ctrl, 26), width, delay, leaves, sway: ph, bind: false };
  };
  const bind = (ctrl, delay, leaves) => ({ pts: smoothPath(ctrl.map(([x, y]) => [x, jit(y)]), 30), width: 0.105, delay, leaves, sway: rand() * TAU, bind: true });
  return [
    climb(Math.PI * 0.6, Math.PI * 1.18, 1.02, 0.05, 0.12, 0, [0.3, 0.52, 0.72, 0.92]),
    climb(Math.PI * 0.4, -Math.PI * 0.16, 1.02, 0.05, 0.12, 0.05, [0.26, 0.48, 0.7, 0.9]),
    climb(Math.PI * 0.55, Math.PI * 1.36, 0.99, 0.06, 0.085, 0.15, [0.5, 0.92]),
    climb(Math.PI * 0.45, -Math.PI * 0.34, 0.99, 0.06, 0.085, 0.18, [0.55, 0.93]),
    climb(Math.PI * 0.68, Math.PI * 0.95, 0.93, 0.04, 0.07, 0.1, [0.85]),
    climb(Math.PI * 0.32, Math.PI * 0.05, 0.93, 0.04, 0.07, 0.12, [0.8]),
    // binding vines, crossing over the body below the face
    bind([[-1.04, 0.62], [-0.6, 0.55], [-0.1, 0.36], [0.45, 0.14], [1.04, 0.02]], 0.32, [0.82]),
    bind([[1.04, 0.66], [0.55, 0.6], [0.05, 0.42], [-0.5, 0.2], [-1.04, 0.07]], 0.4, [0.18])
  ];
}
// ===== src/14-fx-down-and-ground.js =====
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

// ===== src/15-fx-grappled.js =====
/* ---------- Grappled: talons, chains and red glow (or your own image) ---------- */

const GRIP = {
  talon: 0x141016,         // glossy black talons
  talonEdge: 0x050406,
  gloss: 0x9C96A6,         // highlight along each talon
  finger: 0x27202A,        // dark knuckled fingers outside the rim
  fingerEdge: 0x0B090C,
  glow: 0xFF0A0A,          // red glow and energy
  chain: 0x8F8F9C, chainDark: 0x2A2A32,
  gripSeconds: 0.9,        // talons close in when the condition is applied
  squeezeSeconds: 3.2      // a hard squeeze every few seconds
};

// Talons: angle around the token where the finger comes in, and how the talon curls (radians)
// (curl > 0 hooks the talon clockwise; each one hooks away from the middle so they grip around the creature)
const GRIP_TALONS = [
  { a: -2.3, curl: -0.85, size: 0.95 }, { a: -1.85, curl: -0.6, size: 1.08 }, { a: -1.29, curl: 0.6, size: 1.08 }, { a: -0.84, curl: 0.85, size: 0.95 },
  { a: 0.84, curl: -0.85, size: 0.95 }, { a: 1.29, curl: -0.6, size: 1.08 }, { a: 1.85, curl: 0.6, size: 1.08 }, { a: 2.3, curl: 0.85, size: 0.95 }
];

/** The user's chosen overlay image for Grappled, if any. */
function grappleImageSrc() {
  try {
    const src = String(game.settings.get(MODULE_ID, "grappleImagePath") ?? "").trim();
    return GRAPPLE_OLD_DEFAULTS.includes(src) ? GRAPPLE_DEFAULT_IMAGE : src;   // upgrade earlier bundled art
  }
  catch { return ""; }
}

function createGrappleFx(token) {
  return grappleImageSrc() ? createGrappleImageFx(token, grappleImageSrc()) : createGrappleTalonFx(token);
}

function updateGrappleFx(token, fx, ctx) {
  return fx.isImage ? updateGrappleImageFx(token, fx, ctx) : updateGrappleTalonFx(token, fx, ctx);
}

/** Grip timing shared by both styles: 0 → 1 as it closes, plus a periodic squeeze. */
function gripState(fx, now) {
  const t = clamp01((now - fx.start) / (GRIP.gripSeconds * 1000));
  const closed = 1 - Math.pow(1 - t, 3);
  const T = now / 1000;
  const squeeze = t < 1 ? 0 : Math.pow(Math.max(0, Math.sin((T / GRIP.squeezeSeconds) * Math.PI * 2)), 6);
  const tremor = squeeze > 0.05 ? Math.sin(T * 31) * squeeze : 0;
  return { t, closed, squeeze, tremor, T };
}

/* ----- Built-in style ----- */

function createGrappleTalonFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { glow: newBlur(8, 4, ADD), chainGlow: newBlur(4, 3, ADD), shadow: newBlur(4, 3) };
  const chainGlow = new PIXI.Graphics(); chainGlow.blendMode = ADD; chainGlow.filters = [blurs.chainGlow];
  const chains = new PIXI.Graphics();
  const glow = new PIXI.Graphics(); glow.blendMode = ADD; glow.filters = [blurs.glow];
  const shadow = new PIXI.Graphics(); shadow.filters = [blurs.shadow];
  const talons = new PIXI.Graphics();
  const sparks = new PIXI.Graphics(); sparks.blendMode = ADD;
  container.addChild(chainGlow, chains, glow, shadow, talons, sparks);
  return { container, blurs, chainGlow, chains, glow, shadow, talons, sparks, start: performance.now(),
    seed: hashString(`${token.document.id ?? token.id ?? ""}-grip`), w: 0, h: 0 };
}

/** Outline of one talon (finger + curved claw) as a polygon, in pixels. */
function talonShape(cx, cy, rx, ry, spec, inset, scale) {
  const a = spec.a, curl = spec.curl, k = spec.size * scale;
  const out = [Math.cos(a), Math.sin(a)], inn = [-out[0], -out[1]], side = [-out[1], out[0]];
  const at = (rad) => [cx + out[0] * rx * rad, cy + out[1] * ry * rad];
  const R = Math.min(rx, ry);
  // Centre line: from outside the rim, over it, curving inward and hooking
  const base = at(1.32 - inset * 0.1), rim = at(1.0 - inset * 0.08);
  const len = R * 0.56 * k;
  const ctrl = [rim[0] + inn[0] * len * 0.7 + side[0] * curl * len * 0.05, rim[1] + inn[1] * len * 0.7 + side[1] * curl * len * 0.05];
  const tip = [rim[0] + inn[0] * len * (0.62 + inset * 0.12) + side[0] * curl * len * 0.7,
    rim[1] + inn[1] * len * (0.62 + inset * 0.12) + side[1] * curl * len * 0.7];
  const steps = 14, wBase = R * 0.19 * k, left = [], right = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const x = u * u * rim[0] + 2 * u * t * ctrl[0] + t * t * tip[0];
    const y = u * u * rim[1] + 2 * u * t * ctrl[1] + t * t * tip[1];
    const dx = 2 * u * (ctrl[0] - rim[0]) + 2 * t * (tip[0] - ctrl[0]), dy = 2 * u * (ctrl[1] - rim[1]) + 2 * t * (tip[1] - ctrl[1]);
    const m = Math.hypot(dx, dy) || 1, nx = -dy / m, ny = dx / m;
    const wd = wBase * 0.5 * Math.pow(1 - t, 0.85);
    left.push([x + nx * wd, y + ny * wd]); right.push([x - nx * wd, y - ny * wd]);
  }
  return { base, rim, tip, left, right, wBase, out, side };
}

function drawTalons(g, w, h, inset, scale, mode) {
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2, R = Math.min(rx, ry);
  const round = PIXI.LINE_CAP?.ROUND ?? "round", join = PIXI.LINE_JOIN?.ROUND ?? "round";
  for (const spec of GRIP_TALONS) {
    const s = talonShape(cx, cy, rx, ry, spec, inset, scale);
    const finger = [s.base, s.rim];
    const fw = s.wBase * 1.05;
    if (mode === "glow" || mode === "shadow") {
      const color = mode === "glow" ? GRIP.glow : 0x000000;
      g.lineStyle({ width: fw * (mode === "glow" ? 1.6 : 1.2), color, alpha: 1, cap: round });
      g.moveTo(...finger[0]); g.lineTo(...finger[1]);
      g.lineStyle({ width: R * (mode === "glow" ? 0.09 : 0.03), color, alpha: 1, join });
      g.beginFill(color, 1).drawPolygon([...s.left.flat(), ...s.right.slice().reverse().flat()]).endFill();
      continue;
    }
    // Finger: dark, heavy and knuckled, reaching over the rim
    const mid = [(s.base[0] + s.rim[0]) / 2, (s.base[1] + s.rim[1]) / 2];
    const edgeW = Math.max(2, R * 0.025);
    g.lineStyle({ width: fw + edgeW, color: GRIP.fingerEdge, alpha: 1, cap: round });
    g.moveTo(...finger[0]); g.lineTo(...finger[1]);
    g.lineStyle(0);
    g.beginFill(GRIP.fingerEdge, 1).drawCircle(mid[0], mid[1], fw * 0.62 + edgeW / 2).endFill();
    g.lineStyle({ width: fw, color: GRIP.finger, alpha: 1, cap: round });
    g.moveTo(...finger[0]); g.lineTo(...finger[1]);
    g.lineStyle(0);
    g.beginFill(GRIP.finger, 1).drawCircle(mid[0], mid[1], fw * 0.62).endFill();
    g.beginFill(GRIP.gloss, 0.3).drawCircle(mid[0] + s.side[0] * fw * 0.25 - s.out[0] * fw * 0.1, mid[1] + s.side[1] * fw * 0.25 - s.out[1] * fw * 0.1, fw * 0.16).endFill();
    g.lineStyle({ width: Math.max(0.75, fw * 0.08), color: GRIP.fingerEdge, alpha: 0.9, cap: round });
    g.moveTo(mid[0] - s.side[0] * fw * 0.42, mid[1] - s.side[1] * fw * 0.42);
    g.lineTo(mid[0] + s.side[0] * fw * 0.42, mid[1] + s.side[1] * fw * 0.42);
    g.lineStyle({ width: Math.max(0.75, fw * 0.16), color: GRIP.gloss, alpha: 0.25, cap: round });
    g.moveTo(s.base[0] + s.side[0] * fw * 0.22, s.base[1] + s.side[1] * fw * 0.22);
    g.lineTo(s.rim[0] + s.side[0] * fw * 0.22, s.rim[1] + s.side[1] * fw * 0.22);
    // Talon: glossy black, curved and tapering to a point
    g.lineStyle({ width: Math.max(1, R * 0.018), color: GRIP.talonEdge, alpha: 1, join });
    g.beginFill(GRIP.talon, 1).drawPolygon([...s.left.flat(), ...s.right.slice().reverse().flat()]).endFill();
    // Gloss: a bright streak along one side, fading toward the tip
    for (let i = 0; i < s.left.length - 2; i++) {
      const t = i / (s.left.length - 1);
      const a = s.left[i], b = s.left[i + 1], ca = s.right[i], cb = s.right[i + 1];
      const p1 = [a[0] * 0.7 + ca[0] * 0.3, a[1] * 0.7 + ca[1] * 0.3], p2 = [b[0] * 0.7 + cb[0] * 0.3, b[1] * 0.7 + cb[1] * 0.3];
      g.lineStyle({ width: Math.max(0.75, s.wBase * 0.13 * (1 - t)), color: GRIP.gloss, alpha: 0.75 * (1 - t), cap: round });
      g.moveTo(...p1); g.lineTo(...p2);
    }
  }
}

/** A chain from p1 to p2 with alternating links, sagging slightly. */
function drawChain(g, p1, p2, R, sag, glow) {
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), linkL = R * 0.11, n = Math.max(3, Math.floor(len / (linkL * 0.75)));
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, u = 1 - t;
    const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2 + sag;
    const x = u * u * p1[0] + 2 * u * t * mx + t * t * p2[0], y = u * u * p1[1] + 2 * u * t * my + t * t * p2[1];
    const dx = 2 * u * (mx - p1[0]) + 2 * t * (p2[0] - mx), dy = 2 * u * (my - p1[1]) + 2 * t * (p2[1] - my);
    const ang = Math.atan2(dy, dx), c = Math.cos(ang), s = Math.sin(ang);
    if (glow) {
      g.lineStyle({ width: R * 0.05, color: GRIP.glow, alpha: 1, cap: round });
      g.moveTo(x - c * linkL * 0.45, y - s * linkL * 0.45); g.lineTo(x + c * linkL * 0.45, y + s * linkL * 0.45);
      continue;
    }
    if (i % 2 === 0) {
      // Link seen face-on: an elongated ring
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const a = (k / 16) * Math.PI * 2, ex = Math.cos(a) * linkL * 0.5, ey = Math.sin(a) * linkL * 0.24;
        pts.push(x + ex * c - ey * s, y + ex * s + ey * c);
      }
      g.lineStyle({ width: Math.max(1.5, R * 0.03), color: GRIP.chainDark, alpha: 1 });
      g.drawPolygon(pts);
      g.lineStyle({ width: Math.max(1, R * 0.018), color: GRIP.chain, alpha: 1 });
      g.drawPolygon(pts);
    } else {
      // Link seen edge-on: a short bar
      g.lineStyle({ width: Math.max(2, R * 0.034), color: GRIP.chainDark, alpha: 1, cap: round });
      g.moveTo(x - c * linkL * 0.42, y - s * linkL * 0.42); g.lineTo(x + c * linkL * 0.42, y + s * linkL * 0.42);
      g.lineStyle({ width: Math.max(1, R * 0.02), color: GRIP.chain, alpha: 1, cap: round });
      g.moveTo(x - c * linkL * 0.4, y - s * linkL * 0.4); g.lineTo(x + c * linkL * 0.4, y + s * linkL * 0.4);
    }
  }
}

function updateGrappleTalonFx(token, fx, { now, zoom }) {
  const w = token.w, h = token.h, R = Math.min(w, h) / 2;
  const { t, closed, squeeze, tremor, T } = gripState(fx, now);
  const sizeChanged = fx.w !== w || fx.h !== h;
  fx.w = w; fx.h = h;
  fx.blurs.glow.blur = R * 0.07 * zoom;
  fx.blurs.chainGlow.blur = Math.max(1, R * 0.04 * zoom);
  fx.blurs.shadow.blur = Math.max(1, R * 0.04 * zoom);

  // Chains crossing the creature (drawn once)
  if (sizeChanged || !fx.chainsDrawn) {
    fx.chains.clear(); fx.chainGlow.clear();
    const P = (u, v) => [w / 2 + u * w / 2, h / 2 + v * h / 2];
    for (const [a, b, sag] of [[P(-1.05, -0.55), P(1.05, 0.6), R * 0.12], [P(-1.05, 0.5), P(1.05, -0.45), R * 0.1]]) {
      drawChain(fx.chainGlow, a, b, R, sag, true);
      drawChain(fx.chains, a, b, R, sag, false);
    }
    fx.chainsDrawn = true;
  }

  // Talons close in, then press harder on each squeeze
  const inset = closed * (0.6 + 0.4 * closed) + 0.35 * squeeze;
  const scale = 0.85 + 0.15 * closed + 0.04 * squeeze;
  if (sizeChanged || fx.lastInset !== inset) {
    fx.talons.clear(); fx.glow.clear(); fx.shadow.clear();
    drawTalons(fx.glow, w, h, inset, scale, "glow");
    drawTalons(fx.shadow, w, h, inset, scale, "shadow");
    drawTalons(fx.talons, w, h, inset, scale, "solid");
    fx.lastInset = inset;
  }
  const jitter = R * 0.008 * tremor;
  fx.talons.position.set(jitter, -jitter * 0.6);
  fx.shadow.position.set(R * 0.03 + jitter, R * 0.05);
  const pulse = 0.5 + 0.5 * Math.sin(T * 2.4);
  fx.glow.alpha = (0.75 + 0.2 * pulse + 0.25 * squeeze) * clamp01(t * 2);
  fx.shadow.alpha = 0.5 * clamp01(t * 2);
  fx.talons.alpha = clamp01(t * 3);
  fx.chains.alpha = fx.chainGlow.alpha = clamp01((t - 0.3) * 2);
  fx.chainGlow.alpha *= 0.35 + 0.25 * pulse + 0.3 * squeeze;

  // Red energy crackling along the chains and near the talons
  const g = fx.sparks;
  g.clear();
  const rand = seededRandom(fx.seed + Math.floor(T * 12));
  for (let k = 0; k < 4; k++) {
    if (rand() > 0.55 + 0.4 * squeeze) continue;
    const a = rand() * Math.PI * 2, rad = 0.65 + rand() * 0.4;
    let x = w / 2 + Math.cos(a) * w / 2 * rad, y = h / 2 + Math.sin(a) * h / 2 * rad;
    g.lineStyle({ width: Math.max(0.75, R * 0.015), color: 0xFF6A6A, alpha: 0.9 });
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (rand() - 0.5) * R * 0.18; y += (rand() - 0.5) * R * 0.18; g.lineTo(x, y); }
  }
  g.alpha = clamp01(t * 2);

  const dark = 1 - 0.1 * squeeze;
  return { tint: [dark, dark * 0.96, dark * 0.96], alpha: 1 };
}

/* ----- Your own image ----- */

function loadTextureFor(src) {
  try {
    const loader = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
    if (typeof loader === "function") return Promise.resolve(loader(src));
    return Promise.resolve(PIXI.Texture.from(src));
  } catch (err) {
    return Promise.reject(err);
  }
}

function createGrappleImageFx(token, src) {
  const container = newFxContainer();
  const holder = new PIXI.Container();
  container.addChild(holder);
  const fx = { container, blurs: {}, holder, isImage: true, src, sprite: null };
  loadTextureFor(src).then(tex => {
    if (container.destroyed || !tex) return;
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor?.set?.(0.5);
    holder.addChild(sprite);
    fx.sprite = sprite;
  }).catch(err => console.warn(`${MODULE_ID} | Could not load the Grappled image "${src}"`, err));
  return fx;
}

// The bundled hand wraps a circle centred in its image with a radius of 0.312 × the image's size.
// GRAPPLE_FIT places that circle just inside the visible edge of the creature's art, so the
// forearm overlaps the token's rim and the claws dig about half way in.
const GRAPPLE_HAND_GRIP = 0.312;
const GRAPPLE_FIT = 0.82;

/** A still image, centred on the visible part of the creature's art and sized to it. */
function updateGrappleImageFx(token, fx) {
  const art = artCircle(token);
  if (fx.sprite) {
    const tex = fx.sprite.texture;
    const size = Math.max(tex?.width ?? 1, tex?.height ?? 1) || 1;
    let k = 1;
    try { k = Number(game.settings.get(MODULE_ID, "grappleImageFit")) || 1; } catch { /* default */ }
    const shown = (art.r * GRAPPLE_FIT * k) / GRAPPLE_HAND_GRIP;   // on-screen size of the image
    fx.sprite.scale.set(shown / size);
  }
  fx.holder.position.set(art.x, art.y);
  return { tint: [1, 1, 1], alpha: 1 };
}

/* ----- Where a token's art actually is ----- */

const artShapes = new Map();   // texture key → visible circle in texture pixels (or null)
const ART_SAMPLE = 128;        // art is measured at this resolution
const ART_OPAQUE = 128;        // alpha (0–255) a pixel needs to count as part of the art

/**
 * The visible part of the token's art as a circle in effect space (the art box: 0, 0 is its
 * top-left, w × h its size). Token images often have a transparent border, so this measures
 * the opaque pixels instead of trusting the image's bounds. Falls back to the whole box.
 */
function artCircle(view) {
  const w = view.w, h = view.h;
  const whole = { x: w / 2, y: h / 2, r: Math.min(w, h) / 2 };
  if (view.document?.ring?.enabled) return whole;   // dynamic token rings fill the box
  const tex = view.mesh?.texture;
  const shape = measureArt(tex);
  if (!shape) return whole;
  const tw = tex.width || 1, th = tex.height || 1;
  const sx = w / tw, sy = h / th;
  let x = shape.x, y = shape.y;
  if (Number(view.document?.texture?.scaleX) < 0) x = tw - x;   // mirrored art
  if (Number(view.document?.texture?.scaleY) < 0) y = th - y;
  return { x: x * sx, y: y * sy, r: shape.r * (sx + sy) / 2 };
}

/** Measure (once per texture) the circle the opaque part of an image fills, in texture pixels. */
function measureArt(tex) {
  const base = tex?.baseTexture;
  if (!base || base.valid === false || !(tex.width > 1 && tex.height > 1)) return null;
  const f = tex.frame ?? { x: 0, y: 0, width: tex.width, height: tex.height };
  const key = `${base.uid ?? base.cacheId ?? ""}|${base.cacheId ?? ""}|${f.x},${f.y},${f.width},${f.height}`;
  if (artShapes.has(key)) return artShapes.get(key);
  let shape = null;
  try {
    const sample = readAlpha(tex);
    const fit = sample && fitArtCircle(sample.alpha, sample.w, sample.h);
    if (fit) {
      const k = tex.width / sample.w;
      shape = { x: fit.x * k, y: fit.y * k, r: fit.r * k };
    }
  } catch (err) {
    console.debug(`${MODULE_ID} | Could not measure token art; using its full size`, err);
  }
  artShapes.set(key, shape);
  return shape;
}

/** The image's alpha channel at a small size: { alpha: Uint8Array, w, h }. */
function readAlpha(tex) {
  const scale = ART_SAMPLE / Math.max(tex.width, tex.height);
  const w = Math.max(1, Math.round(tex.width * scale)), h = Math.max(1, Math.round(tex.height * scale));
  const pick = rgba => {
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    return { alpha, w, h };
  };
  // 1) Draw the source image onto a small 2D canvas (cheap; fails for cross-origin art)
  const base = tex.baseTexture, src = base?.resource?.source;
  const drawable = src && ["HTMLImageElement", "HTMLCanvasElement", "HTMLVideoElement", "ImageBitmap", "OffscreenCanvas"]
    .some(n => typeof globalThis[n] === "function" && src instanceof globalThis[n]);
  if (drawable) {
    try {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      const f = tex.frame ?? { x: 0, y: 0, width: tex.width, height: tex.height }, res = base.resolution || 1;
      ctx.drawImage(src, f.x * res, f.y * res, f.width * res, f.height * res, 0, 0, w, h);
      return pick(ctx.getImageData(0, 0, w, h).data);
    } catch { /* try the renderer instead */ }
  }
  // 2) Render the texture into a small render texture and read it back from the GPU
  const renderer = canvas?.app?.renderer;
  if (!renderer?.extract || !PIXI.RenderTexture) return null;
  const rt = PIXI.RenderTexture.create({ width: w, height: h });
  const sprite = new PIXI.Sprite(tex);
  try {
    sprite.scale.set(w / tex.width, h / tex.height);
    renderer.render(sprite, { renderTexture: rt, clear: true });
    return pick(renderer.extract.pixels(rt));
  } finally {
    sprite.destroy();
    rt.destroy(true);
  }
}

/**
 * Fit a circle to the outline of the opaque pixels: cast rays out from the middle, take the
 * outermost opaque point on each, ignore stray bits (fur, smoke, weapons poking out of a frame)
 * that stick out much further than the rest, and fit a circle through what's left.
 */
function fitArtCircle(alpha, w, h) {
  const opaque = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    return xi >= 0 && yi >= 0 && xi < w && yi < h && alpha[yi * w + xi] >= ART_OPAQUE;
  };
  const median = a => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const rays = 96, far = Math.hypot(w, h);
  let cx = w / 2, cy = h / 2, r = 0;
  for (let pass = 0; pass < 2; pass++) {
    const pts = [];
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      for (let d = far; d > 0; d -= 0.5) {
        const x = cx + dx * d, y = cy + dy * d;
        if (opaque(x, y)) { pts.push([x, y, d]); break; }
      }
    }
    if (pts.length < rays / 3) return null;
    const mid = median(pts.map(p => p[2]));
    const keep = pts.filter(p => Math.abs(p[2] - mid) <= mid * 0.15);
    const fit = keep.length >= 8 ? circleThrough(keep) : null;
    const size = Math.max(w, h);
    if (fit && Math.hypot(fit.x - w / 2, fit.y - h / 2) <= size * 0.2) { cx = fit.x; cy = fit.y; }
    r = median(keep.map(p => Math.hypot(p[0] - cx, p[1] - cy)));
  }
  // Ignore results that can't be the creature (a speck of paint on an otherwise empty image)
  return r >= Math.min(w, h) * 0.12 ? { x: cx, y: cy, r } : null;
}

/** Least-squares circle through points [[x, y], …]. */
function circleThrough(pts) {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const [x, y] of pts) {
    const u = x - mx, v = y - my;
    suu += u * u; svv += v * v; suv += u * v;
    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const bu = (suuu + suvv) / 2, bv = (svvv + svuu) / 2;
  const uc = (bu * svv - bv * suv) / det, vc = (bv * suu - bu * suv) / det;
  return { x: mx + uc, y: my + vc, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / n) };
}

// ===== src/16-fx-levels.js =====
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

// ===== src/17-fx-invisible-ethereal.js =====
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

// ===== src/18-fx-driver.js =====
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

// ===== src/19-other-modules.js =====
/* ---------- Other animation modules: Token Magic FX and Sequencer ---------- */

/*
 * A status another module already animates on the token gets no animation from this module (and
 * keeps its icon), so the two don't pile up. Recognised:
 *  - Token Magic FX through an effect change (DAE's "macro.tokenMagic", as Convenient Effects and
 *    many effect packs use), or a Token Magic filter on the token named after the status or effect;
 *  - a Sequencer effect on the token whose origin is the effect (Automated Animations' active-effect
 *    animations) or that is named after the status or effect.
 * The GM can turn this off in the Token animations window.
 */
const TMFX_CHANGE_KEY = /^macro\.tokenmagic$/i;
// Never handed over: the whirl or shimmer is what keeps an unseen creature hidden from players
const NEVER_DEFERRED = new Set(["invis"]);

function moduleActive(id) {
  try { return !!game.modules?.get?.(id)?.active; } catch { return false; }
}

/** Lower-case names to match a status effect by: its status IDs and its own name. */
function effectMatchNames(effect) {
  const names = new Set();
  for (const s of effect?.statuses ?? []) if (typeof s === "string") names.add(s.toLowerCase());
  if (typeof effect?.name === "string" && effect.name) names.add(effect.name.toLowerCase());
  return names;
}

/** The Token Magic filter IDs on a token (lower case). */
function tokenMagicFilterIds(token) {
  const ids = new Set();
  const filters = token?.document?.flags?.tokenmagic?.filters;
  if (!Array.isArray(filters)) return ids;
  for (const f of filters) {
    const id = f?.tmFilters?.tmFilterId ?? f?.tmFilters?.tmParams?.filterId ?? f?.filterId;
    if (typeof id === "string" && id) ids.add(id.toLowerCase());
  }
  return ids;
}

/** The Sequencer effects attached to a token. */
function sequencerEffectsOn(token) {
  const manager = globalThis.Sequencer?.EffectManager;
  if (typeof manager?.getEffects !== "function") return [];
  try { return manager.getEffects({ object: token }) ?? []; } catch { return []; }
}

function sequencerEffectMatches(seqEffect, effect, names) {
  const data = seqEffect?.data ?? seqEffect ?? {};
  const origin = typeof data.origin === "string" ? data.origin : "";
  if (origin && (origin === effect.uuid || origin === effect.id || (effect.id && origin.endsWith(`.${effect.id}`)))) return true;
  const name = typeof data.name === "string" ? data.name.toLowerCase() : "";
  if (!name) return false;
  for (const n of names) if (name === n || name.startsWith(`${n}-`)) return true;
  return false;
}

/**
 * What other modules animate on this token: a test for single effects, or null when nothing is
 * (the setting is off, neither module is active, or there's nothing to match).
 */
function otherModuleAnimations(token) {
  if (!token?.actor || !settingValue("deferToOtherModules")) return null;
  const tmfx = moduleActive("tokenmagic"), sequencer = moduleActive("sequencer");
  if (!tmfx && !sequencer) return null;
  const filterIds = tmfx ? tokenMagicFilterIds(token) : new Set();
  const seqEffects = sequencer ? sequencerEffectsOn(token) : [];
  return effect => {
    if (!effect || effect.disabled) return false;
    if (tmfx && Array.isArray(effect.changes) && effect.changes.some(c => TMFX_CHANGE_KEY.test(String(c?.key ?? "")))) return true;
    if (!filterIds.size && !seqEffects.length) return false;
    const names = effectMatchNames(effect);
    for (const n of names) if (filterIds.has(n)) return true;
    return seqEffects.some(se => sequencerEffectMatches(se, effect, names));
  };
}

/** The token's effects that another module animates (empty when none). */
function otherModuleEffects(token) {
  const animated = otherModuleAnimations(token);
  if (!animated) return [];
  const out = [];
  const seen = new Set();
  for (const effect of [...(token.actor.temporaryEffects ?? []), ...(token.actor.effects ?? [])]) {
    if (!effect || seen.has(effect)) continue;
    seen.add(effect);
    if (animated(effect)) out.push(effect);
  }
  return out;
}

/** An effect on its own, as an actor-like object the animation checks understand. */
function soloEffectActor(effect) {
  return { statuses: new Set(effect?.statuses ?? []), effects: [effect] };
}

/** Leave out the animations whose statuses another module already animates on this token. */
function dropOtherModuleKinds(token, wanted) {
  const others = otherModuleEffects(token);
  if (!others.length) return wanted;
  const solos = others.map(soloEffectActor);
  for (const kind of [...wanted]) {
    if (NEVER_DEFERRED.has(kind)) continue;
    if (solos.some(solo => { try { return FX_KINDS[kind].applies(solo); } catch { return false; } })) wanted.delete(kind);
  }
  return wanted.size ? wanted : null;
}
// ===== src/20-statuses-and-mighty-guard.js =====
/* -------------------------------------------- */
/*  Logic                                       */
/* -------------------------------------------- */

/** Add Mighty Guard to the core status list (idempotent). */
/** A valid 16-character document ID for one of this module's statuses. */
function statusDocId(id) {
  return `mg${id}`.replace(/[^a-zA-Z0-9]/g, "").padEnd(16, "0").slice(0, 16);
}

function loc(key) {
  return game.i18n?.has?.(key) ? game.i18n.localize(key) : key;
}

const isV14 = () => (game.release?.generation ?? 12) >= 14;

/**
 * Build an Active Effect change. Foundry v14 stores changes in `system.changes` with a
 * named type; earlier versions use `changes` with a numeric mode.
 */
function effectChange(key, type, value) {
  return isV14()
    ? { key, type, value, phase: "initial", priority: null }
    : { key, mode: { multiply: 1, add: 2, override: 5 }[type], value: String(value) };
}

/** Changes that multiply (or, with "override", set) a creature's speed. */
function speedChanges(type, factor) {
  return isV14()
    ? [effectChange("system.attributes.movement.multiplier", type, factor)]
    : ["walk", "fly", "swim", "climb", "burrow"].map(m => effectChange(`system.attributes.movement.${m}`, type, factor));
}

function withChanges(data, changes) {
  return isV14() ? { ...data, system: { changes } } : { ...data, changes };
}

/** The statuses this module adds, with the rules they apply (dnd5e). */
function moduleStatusEffects() {
  const dnd5e = game.system?.id === "dnd5e";
  return [
    { id: STATUS_ID, name: "MIGHTYGUARD.Name", img: ICON, description: "MIGHTYGUARD.Desc.MightyGuard" },
    withChanges(
      { id: HASTE_ID, name: "MIGHTYGUARD.Haste", img: `${MODULE_PATH}/icons/haste.svg`, description: "MIGHTYGUARD.Desc.Haste" },
      dnd5e ? [
        ...speedChanges("multiply", 2),                                   // Speed doubled
        effectChange("system.attributes.ac.bonus", "add", 2),             // +2 AC
        effectChange("system.abilities.dex.save.roll.mode", "add", 1)     // Advantage on Dex saves
      ] : []
    ),
    withChanges(
      { id: SLOW_ID, name: "MIGHTYGUARD.Slow", img: `${MODULE_PATH}/icons/slow.svg`, description: "MIGHTYGUARD.Desc.Slow" },
      dnd5e ? [
        ...speedChanges("multiply", 0.5),                                 // Speed halved
        effectChange("system.attributes.ac.bonus", "add", -2),            // −2 AC
        effectChange("system.abilities.dex.bonuses.save", "add", -2)      // −2 to Dex saves
      ] : []
    ),
    // Leveled: dnd5e 6 tracks the level itself (see registerContaminationCondition); elsewhere this module does.
    { id: CONTAM_ID, name: "MIGHTYGUARD.Contamination", img: CONTAM_ICON, description: "MIGHTYGUARD.Desc.Contamination", _id: contaminationDocId() },
    // Monsters of Drakkenheim conditions (left alone if another module or the system already has them)
    ...DRAKKENHEIM_CONDITIONS.map(id => {
      const data = { id, name: `MIGHTYGUARD.Drakkenheim.${settingLabel(id)}`, img: `${MODULE_PATH}/icons/${drakkenheimIcon(id)}.svg`,
        description: `MIGHTYGUARD.Desc.${settingLabel(id)}`, optional: true, ...(DRAKKENHEIM_IMPLIES[id] ? { statuses: DRAKKENHEIM_IMPLIES[id] } : {}) };
      const changes = dnd5e ? drakkenheimChanges(id) : [];
      return changes.length ? withChanges(data, changes) : data;
    })
  ];
}

const DRAKKENHEIM_CONDITIONS = ["addled", "clumsy", "enfeebled", "sickened", "defenseless", "helpless", "weakened", "dazed",
  "immobilized", "entangled", "frozen", "shocked", "jinxed", "valor",
  "bewildered", "distracted", "staggered", "drakkenheimSlowed", "drakkenheimMadness"];

/** The icon's file name: the status ID, in lower case with dashes ("drakkenheimMadness" → "drakkenheim-madness"). */
function drakkenheimIcon(id) {
  return id.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
}

/**
 * The rules some of these statuses apply through the effect itself: Slowed halves Speed, and
 * Distracted tells Midi-QOL the creature has no Reaction to take (Midi then offers it none).
 * (Slowed's ID isn't "slowed": that's this module's Slow, the spell, which does more.)
 */
function drakkenheimChanges(id) {
  if (id === "drakkenheimSlowed") return speedChanges("multiply", 0.5);
  if (id === "distracted") return [effectChange("flags.midi-qol.actions.reactionsMax", "override", 0)];
  return [];
}
const ownOptionalStatuses = new Set();   // optional statuses this module added (not someone else's)

/** Does the game system handle leveled conditions itself? (dnd5e 6+: level up/down from the token HUD) */
function systemHasLeveledConditions() {
  return !!(CONFIG.DND5E?.conditionTypes && CONFIG.ActiveEffect?.dataModels?.condition?.hasLevels);
}

function contaminationDocId() {
  const staticID = globalThis.dnd5e?.utils?.staticID;
  return (systemHasLeveledConditions() && typeof staticID === "function") ? staticID(`dnd5e${CONTAM_ID}`) : statusDocId(CONTAM_ID);
}

/**
 * On dnd5e 6, make Contamination a leveled condition like Exhaustion: left-click in the token
 * HUD adds a level, right-click removes one, the name shows the level, and levels 4 and 5 add
 * the Weakened and Dazed statuses. dnd5e turns this into a status effect during i18nInit.
 */
function registerContaminationCondition() {
  if (!systemHasLeveledConditions()) return false;
  const types = CONFIG.DND5E.conditionTypes;
  types[CONTAM_ID] = {
    ...(types[CONTAM_ID] ?? {}),
    name: loc("MIGHTYGUARD.Contamination"),
    img: CONTAM_ICON,
    levels: CONTAM_MAX,
    conditions: { 4: ["weakened"], 5: ["dazed"] }
  };
  return true;
}

/** The status icon for a contamination level (contamination-3.svg etc.). */
function contaminationIcon(level) {
  return level > 0 ? CONTAM_ICON.replace(/\.svg$/, `-${Math.min(CONTAM_MAX, level)}.svg`) : CONTAM_ICON;
}

/**
 * Change an actor's contamination by some levels, for systems that don't track leveled
 * conditions themselves. The level is kept in a flag on the effect.
 */
async function changeContamination(actor, delta) {
  if (!actor) return;
  const existing = actor.effects.find(e => e.statuses?.has(CONTAM_ID));
  const current = existing ? contaminationLevel({ effects: [existing] }) : 0;
  const level = Math.max(0, Math.min(CONTAM_MAX, current + delta));
  if (level === current) return;
  if (!level) return existing.delete();
  const changes = { name: `${loc("MIGHTYGUARD.Contamination")} (${level})`, img: contaminationIcon(level), flags: { [MODULE_ID]: { level } } };
  if (existing) return existing.update(changes);
  const cls = CONFIG.ActiveEffect.documentClass;
  const data = typeof cls.fromStatusEffect === "function"
    ? (await cls.fromStatusEffect(CONTAM_ID)).toObject()
    : { name: loc("MIGHTYGUARD.Contamination"), img: CONTAM_ICON, statuses: [CONTAM_ID], description: loc("MIGHTYGUARD.Desc.Contamination") };
  return cls.create(foundry.utils.mergeObject(data, changes), { parent: actor, keepId: true });
}

/**
 * Add this module's statuses to the status palette. Foundry v14 / dnd5e 6 keep
 * CONFIG.statusEffects as a record keyed by ID; earlier versions use an array.
 * Safe to call repeatedly (it refreshes names once translations are loaded).
 */
function registerStatuses() {
  const list = CONFIG.statusEffects;
  if (!list) return;
  moduleStatusEffects().forEach(({ optional, ...data }, i) => {
    if (optional && isRegisteredStatus(data.id)) {
      // Someone else's (from the start, or registered over ours since): leave it as it is
      const current = statusConfig(data.id);
      if (!ownOptionalStatuses.has(data.id) || (current?.img ?? current?.icon) !== data.img) return;
    }
    if (optional) ownOptionalStatuses.add(data.id);
    const entry = { ...data, _id: data._id ?? statusDocId(data.id), order: 90 + i, name: loc(data.name) };
    if (data.description) entry.description = loc(data.description);
    if (Array.isArray(list)) {
      const index = list.findIndex(e => e.id === data.id);
      if (index >= 0) list[index] = { ...list[index], ...entry };
      else list.push(entry);
    } else if (typeof list === "object") {
      list[data.id] = { ...(list[data.id] ?? {}), ...entry };
    }
  });
  decorateSystemStatuses();
}

/**
 * Statuses the system provides that this module renames or describes: the cover statuses are
 * named "Cover (Half)" and so on, so they sit together in the palette's alphabetical order, and
 * Burning and Bleeding get their Monsters of Drakkenheim text (their value and the damage each turn).
 */
const SYSTEM_STATUS_NAMES = { coverHalf: "MIGHTYGUARD.Cover.Half", coverThreeQuarters: "MIGHTYGUARD.Cover.ThreeQuarters", coverTotal: "MIGHTYGUARD.Cover.Total" };
const SYSTEM_STATUS_DESCRIPTIONS = { burning: "MIGHTYGUARD.Desc.Burning", bleeding: "MIGHTYGUARD.Desc.Bleeding" };

function decorateSystemStatuses() {
  for (const [id, key] of Object.entries(SYSTEM_STATUS_NAMES)) {
    const status = statusConfig(id);
    if (status) status.name = loc(key);
  }
  for (const [id, key] of Object.entries(SYSTEM_STATUS_DESCRIPTIONS)) {
    const status = statusConfig(id);
    // only replace text this module put there (or none), not another module's
    if (!status || (status.description && status.description !== status._mgDescription)) continue;
    status.description = status._mgDescription = loc(key);
  }
}

function isRegisteredStatus(id) {
  const list = CONFIG.statusEffects;
  return Array.isArray(list) ? list.some(e => e.id === id) : !!list?.[id];
}

/** Turn Mighty Guard on or off for an actor. */
async function toggleGuard(actor) {
  if (!actor) return;
  if (isRegisteredStatus(STATUS_ID) && typeof actor.toggleStatusEffect === "function") {
    try { await actor.toggleStatusEffect(STATUS_ID); return; }
    catch (err) { console.warn(`${MODULE_ID} | toggleStatusEffect failed, creating the effect directly`, err); }
  }
  const existing = actor.effects.filter(e => e.statuses?.has(STATUS_ID));
  if (existing.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
  } else {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n.localize("MIGHTYGUARD.Name"),
      img: ICON,
      statuses: [STATUS_ID]
    }]);
  }
}

/** Does this actor currently have Mighty Guard? */
function isGuarded(actor) {
  if (!actor) return false;
  if (actor.statuses?.has(STATUS_ID)) return true;
  return actor.effects?.some(e => !e.disabled && e.statuses?.has(STATUS_ID)) ?? false;
}

/** Is the rolling user currently targeting at least one guarded creature? */
function targetingGuarded() {
  for (const token of game.user?.targets ?? []) {
    if (isGuarded(token.actor)) return true;
  }
  return false;
}

function hasD20(roll) {
  try { return roll.dice.some(d => d.faces === 20); }
  catch { return false; }
}

/** Does any class in the roll's prototype chain look like a damage roll class? */
function isDamageClass(roll) {
  if (CONFIG.Dice?.DamageRoll && roll instanceof CONFIG.Dice.DamageRoll) return true; // dnd5e
  for (let c = roll.constructor; c && c !== Object; c = Object.getPrototypeOf(c)) {
    if (/damage/i.test(c.name ?? "")) return true; // pf2e DamageRoll and similar
  }
  return false;
}

/** Is this roll a damage roll? */
function isDamageRoll(roll) {
  // Never touch attack rolls / checks.
  if (hasD20(roll)) return false;

  // Loosest mode: any roll without a d20 made while targeting a guarded creature.
  if (game.settings.get(MODULE_ID, "detection") === "nonD20") return roll.dice.length > 0;

  if (isDamageClass(roll)) return true;

  // pf2e nested rolls / generic systems: look for damage hints in the roll options.
  const opt = roll.options ?? {};
  const hints = [opt.type, opt.rollType, opt.kind, opt.flavor]
    .filter(v => typeof v === "string")
    .join(" ")
    .toLowerCase();
  return /damage/.test(hints);
}

/** Return evaluation options, forcing minimum results for damage against a guarded creature. */
function applyGuard(roll, options) {
  let guard = false;
  try { guard = targetingGuarded() && isDamageRoll(roll); }
  catch (err) { console.warn(`${MODULE_ID} | Could not evaluate roll`, err); }
  if (!guard) return options;

  roll.options[MODULE_ID] = true;
  return {
    ...options,
    minimize: true,
    maximize: false,
    allowInteractive: false // skip manual dice entry (v13) so the minimum is enforced
  };
}

// ===== src/21-wrap.js =====
/* -------------------------------------------- */
/*  Wrapping helper (uses libWrapper if active) */
/* -------------------------------------------- */

/** Wrap a property getter (libWrapper if active, otherwise by redefining the property). */
function wrapGetter(path, fn) {
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    try { libWrapper.register(MODULE_ID, path, fn, "WRAPPER"); return; }
    catch (err) { console.warn(`${MODULE_ID} | Could not wrap ${path}`, err); return; }
  }
  const parts = path.split(".");
  const prop = parts.pop();
  const owner = foundry.utils.getProperty(globalThis, parts.join("."));
  if (!owner) return;
  let descriptor = null;
  for (let o = owner; o && !descriptor; o = Object.getPrototypeOf(o)) descriptor = Object.getOwnPropertyDescriptor(o, prop);
  if (!descriptor?.get) return;
  const original = descriptor.get;
  Object.defineProperty(owner, prop, {
    configurable: true, enumerable: descriptor.enumerable,
    get() { return fn.call(this, original.bind(this)); },
    set: descriptor.set
  });
}

function wrap(path, fn, type = "WRAPPER") {
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    libWrapper.register(MODULE_ID, path, fn, type);
    return;
  }
  const parts = path.split(".");
  const method = parts.pop();
  const owner = foundry.utils.getProperty(globalThis, parts.join("."));
  const original = owner[method];
  owner[method] = function (...args) {
    return fn.call(this, original.bind(this), ...args);
  };
}
// ===== src/22-migrate.js =====
/* -------------------------------------------- */
/*  Moving over from earlier module IDs         */
/* -------------------------------------------- */

/*
 * This module was installed as "mighty-guard" before 3.0.0 and as "enhanced-status-effects" (Enhanced
 * Status Effects) from 3.0.0 to 3.2.3. Foundry keys settings and file paths by the module's ID, so the
 * first time it runs as "primal-status" it carries everything over, once, from whichever earlier ID
 * has it (the newest first):
 *  - the world's settings (by the GM) and each player's own settings (in their own browser), unless
 *    they've already been set under the new ID;
 *  - the images of status effects already on creatures (modules/enhanced-status-effects/... and
 *    modules/mighty-guard/... become modules/primal-status/...), and the Grappled overlay image if it
 *    was the module's own;
 *  - macros that call the module's API through game.modules.get("enhanced-status-effects") (or the
 *    older ID).
 * Flags kept under an earlier ID (a token's "Animate this token's statuses", Contamination levels, Dead
 * applied by this module) are read from any of them (see moduleFlag), so they stay where they are.
 */

/** Settings that only record this carrying-over: never copied themselves. */
const MIGRATION_MARKERS = new Set(["migratedWorld", "migratedClient"]);

/** A value as Foundry stored it (a JSON string), or as it was if it isn't JSON. */
function storedValue(raw) {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

/** The settings this module registers, as { key, scope, type }. */
function ownSettings() {
  const out = [];
  for (const [id, config] of game.settings?.settings ?? []) {
    if (typeof id !== "string" || !id.startsWith(`${MODULE_ID}.`)) continue;
    if (MIGRATION_MARKERS.has(config?.key ?? id.slice(MODULE_ID.length + 1))) continue;
    out.push({ key: config?.key ?? id.slice(MODULE_ID.length + 1), scope: config?.scope, type: config?.type });
  }
  return out;
}

/** A stored value in the type the setting expects, or undefined if it can't be one. */
function settingValueOfType(type, value) {
  if (value === undefined || value === null) return undefined;
  if (type === Boolean) return typeof value === "boolean" ? value : (value === "true" ? true : value === "false" ? false : undefined);
  if (type === Number) { const n = Number(value); return Number.isFinite(n) ? n : undefined; }
  if (type === String) return typeof value === "string" ? value : String(value);
  if (type === Array) return Array.isArray(value) ? value : undefined;
  if (type === Object) return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  return value;
}

/** Copy the world's settings from the earlier IDs (the GM's client). Returns how many were copied. */
async function migrateWorldSettings() {
  const store = game.settings?.storage?.get?.("world");
  if (!store) return 0;
  const all = typeof store.contents === "object" ? store.contents : [...store];
  const stored = key => all.find(s => s?.key === key);
  let moved = 0;
  for (const { key, scope, type } of ownSettings()) {
    if (scope !== "world" || stored(`${MODULE_ID}.${key}`)) continue;
    const old = LEGACY_MODULE_IDS.map(id => stored(`${id}.${key}`)).find(Boolean);
    const value = settingValueOfType(type, storedValue(old?.value));
    if (value === undefined) continue;
    try { await game.settings.set(MODULE_ID, key, value); moved++; }
    catch (err) { console.warn(`${MODULE_ID} | Could not carry over the setting ${key}`, err); }
  }
  return moved;
}

/** Copy this player's own settings from the earlier IDs (kept in their browser). Returns how many were copied. */
async function migrateClientSettings() {
  let storage = null;
  try { storage = game.settings?.storage?.get?.("client") ?? globalThis.localStorage; } catch { return 0; }
  if (typeof storage?.getItem !== "function") return 0;
  let moved = 0;
  for (const { key, scope, type } of ownSettings()) {
    if (scope !== "client" || storage.getItem(`${MODULE_ID}.${key}`) !== null) continue;
    const raw = LEGACY_MODULE_IDS.map(id => storage.getItem(`${id}.${key}`)).find(v => v !== null && v !== undefined);
    if (raw === null || raw === undefined) continue;
    const value = settingValueOfType(type, storedValue(raw));
    if (value === undefined) continue;
    try { await game.settings.set(MODULE_ID, key, value); moved++; }
    catch (err) { console.warn(`${MODULE_ID} | Could not carry over your setting ${key}`, err); }
  }
  return moved;
}

/** The new path for a file in an earlier module folder, or null if it isn't one. */
function movedModulePath(src) {
  if (typeof src !== "string") return null;
  for (const id of LEGACY_MODULE_IDS) {
    const prefix = `modules/${id}/`;
    if (src.startsWith(prefix)) return `${MODULE_PATH}/${src.slice(prefix.length)}`;
  }
  return null;
}

/** Point status effects on creatures (in the sidebar and on every scene) at the new folder. */
async function migrateEffectImages() {
  const actors = new Set();
  for (const actor of game.actors ?? []) actors.add(actor);
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) if (!token.actorLink && token.actor) actors.add(token.actor);
  }
  let moved = 0;
  for (const actor of actors) {
    const updates = [];
    for (const effect of actor.effects ?? []) {
      const img = movedModulePath(effect.img);
      if (img && effect.id) updates.push({ _id: effect.id, img });
    }
    if (!updates.length) continue;
    try { await actor.updateEmbeddedDocuments("ActiveEffect", updates); moved += updates.length; }
    catch (err) { console.warn(`${MODULE_ID} | Could not update the status images on ${actor.name}`, err); }
  }
  return moved;
}

const OLD_API_CALL = new RegExp(`game\\.modules\\.get\\(\\s*(["'\`])(?:${LEGACY_MODULE_IDS.join("|")})\\1\\s*\\)`, "g");

/** Macros that reach the module's API by an earlier ID. */
async function migrateMacros() {
  let moved = 0;
  for (const macro of game.macros ?? []) {
    const command = macro?.command;
    if (typeof command !== "string" || !OLD_API_CALL.test(command)) continue;
    OLD_API_CALL.lastIndex = 0;
    const updated = command.replace(OLD_API_CALL, (m, q) => `game.modules.get(${q}${MODULE_ID}${q})`);
    try { await macro.update({ command: updated }); moved++; }
    catch (err) { console.warn(`${MODULE_ID} | Could not update the macro ${macro.name}`, err); }
  }
  OLD_API_CALL.lastIndex = 0;
  return moved;
}

/**
 * Carry everything over from the old module ID, once per world (by the active GM) and once per
 * player's browser. Safe to call again: nothing already set under the new ID is overwritten.
 */
async function migrateFromOldModuleId() {
  const done = key => { try { return !!game.settings.get(MODULE_ID, key); } catch { return true; } };
  const report = { settings: 0, images: 0, macros: 0 };
  if (typeof game.settings?.set !== "function") return report;
  if (!done("migratedClient")) {
    report.settings += await migrateClientSettings();
    await game.settings.set(MODULE_ID, "migratedClient", true);
  }
  const gm = game.users?.activeGM;
  const isActiveGM = !!game.user?.isGM && (!gm || (gm.isSelf ?? gm.id === game.user.id));
  if (isActiveGM && !done("migratedWorld")) {
    report.settings += await migrateWorldSettings();
    const grapple = movedModulePath(game.settings.get(MODULE_ID, "grappleImagePath"));
    if (grapple) { await game.settings.set(MODULE_ID, "grappleImagePath", grapple); report.settings++; }
    report.images = await migrateEffectImages();
    report.macros = await migrateMacros();
    await game.settings.set(MODULE_ID, "migratedWorld", true);
  }
  if (report.settings || report.images || report.macros) {
    const text = loc("MIGHTYGUARD.Migrate.Done").replace("{settings}", report.settings).replace("{images}", report.images).replace("{macros}", report.macros);
    globalThis.ui?.notifications?.info?.(text);
    console.log(`${MODULE_ID} | ${text}`);
  }
  // An old copy still switched on as well would run everything twice
  const oldActive = LEGACY_MODULE_IDS.find(id => game.modules?.get?.(id)?.active);
  if (game.user?.isGM && oldActive) {
    globalThis.ui?.notifications?.warn?.(loc("MIGHTYGUARD.Migrate.OldActive").replace("{id}", oldActive), { permanent: true });
  }
  return report;
}
