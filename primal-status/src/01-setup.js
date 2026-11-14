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

