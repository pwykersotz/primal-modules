import { MODULE_ID, loc } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { applyPatches } from "./patches.mjs";
import { registerCastingHooks } from "./casting.mjs";
import { registerGuard } from "./guard.mjs";
import {
  canCastLevel, clearTablesCache, computeState, costFor, getState, isEnabledFor, recordCasterLevel, refreshAll
} from "./spell-points.mjs";
import {
  onGetHeaderControls, onRenderActorSheet, openActorConfig, restoreSpellPoints, setSpellPoints,
  setSpellPointsEnabled, updateCostStyles
} from "./sheet.mjs";
import { SpellPointTablesConfig } from "./apps/tables-config.mjs";

Hooks.once("init", () => {
  registerSettings({
    onRulesChange: refreshAll,
    onTablesChange: () => {
      clearTablesCache();
      updateCostStyles();
      refreshAll();
    }
  });
  // Actors are prepared before the setup hook, so these have to be in place now.
  Hooks.on("dnd5e.prepareSpellSlots", recordCasterLevel);
  applyPatches();
  registerCastingHooks();
  registerGuard();
  Hooks.on("renderActorSheetV2", onRenderActorSheet);
  Hooks.on("getHeaderControlsActorSheetV2", onGetHeaderControls);
});

Hooks.once("setup", () => {
  // Let token bars show spell points (dnd5e fills this list in its own setup hook, which runs first).
  const trackable = CONFIG.Actor.trackableAttributes;
  for ( const type of ["character", "npc"] ) {
    const bar = trackable?.[type]?.bar;
    if ( Array.isArray(bar) && !bar.includes("attributes.spellPoints") ) bar.push("attributes.spellPoints");
  }
});

Hooks.once("ready", () => {
  updateCostStyles();

  if ( game.user.isGM && game.modules.get("dnd5e-spellpoints")?.active ) {
    ui.notifications.warn(loc("Warning.OtherModule"), { permanent: true });
  }

  const module = game.modules.get(MODULE_ID);
  console.log(`${MODULE_ID} | ${module?.version ?? ""} ready`);
  if ( !module ) return;
  module.api = {
    /**
     * An actor's spell points, or null if it doesn't use them.
     * @param {Actor} actor
     * @returns {{value: number, max: number, spent: number, casterLevel: number, maxLevel: number,
     *   highUsed: number[]}|null}
     */
    getSpellPoints(actor) {
      const state = getState(actor);
      if ( !state ) return null;
      const { value, max, spent, casterLevel, maxLevel, highUsed } = state;
      return { value, max, spent, casterLevel, maxLevel, highUsed: [...highUsed] };
    },
    /** Whether the GM has chosen spell points for this actor. */
    isEnabled: actor => isEnabledFor(actor),
    /** Turn spell points on (with a full pool) or off for one actor (GM). */
    setEnabled: setSpellPointsEnabled,
    /** What casting at a spell level costs. */
    costFor,
    /** Whether the actor can pay for a spell of this level now. */
    canCast: (actor, level) => canCastLevel(getState(actor), level),
    /** Set current spell points (GM). */
    setSpellPoints,
    /** Add (positive) or take away (negative) spell points (GM). */
    adjustSpellPoints: (actor, delta) => {
      const state = getState(actor) ?? computeState(actor);
      return setSpellPoints(actor, (state?.value ?? 0) + Number(delta || 0));
    },
    /** Restore all spell points and 6th+ level spells, as a long rest does (GM). */
    restore: restoreSpellPoints,
    /** Open an actor's spell point settings (GM). */
    openConfig: openActorConfig,
    /** Open the cost and points tables (GM). */
    openTables: () => {
      if ( !game.user.isGM ) return ui.notifications.warn(loc("Warning.GMOnly"));
      return new SpellPointTablesConfig().render({ force: true });
    }
  };
});
