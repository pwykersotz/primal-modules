/**
 * Primal Houserules: table houserules for dnd5e, each with its own switch in the module settings.
 * Made with AI: written with Claude (Anthropic).
 */
import { MODULE_ID, SETTINGS, runFirst, setting } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { onPreCalculateDamage } from "./saves.mjs";
import { registerArmorCap } from "./armor.mjs";
import { gearPlan, registerGearBonuses } from "./gear-bonuses.mjs";
import { onPreRollClassHitPoints } from "./hit-points.mjs";
import { onOnceScope } from "./emanations.mjs";
import { hasMvp, onRenderActorSheet, onUpdateActor, setMvp } from "./mvp.mjs";
import { registerQuickRest } from "./quick-rest.mjs";

let damageHook = null;

/** Prepare every actor again, so a new AC cap or gear bonus rule shows straight away. */
function refreshActors() {
  for ( const actor of game.actors ?? [] ) {
    actor.reset?.();
    actor.render?.(false);
  }
  for ( const token of canvas?.tokens?.placeables ?? [] ) {
    if ( token.document?.actorLink === false ) {
      token.actor?.reset?.();
      token.actor?.render?.(false);
    }
  }
}

/** Draw open character sheets again. */
function redrawSheets() {
  for ( const actor of game.actors ?? [] ) {
    if ( actor.type === "character" ) actor.render?.(false);
  }
}

Hooks.once("init", () => {
  registerSettings({ onArmorChange: refreshActors, onSheetChange: redrawSheets, onGearChange: refreshActors });

  // Actors are prepared before the setup hook, so the AC cap and the gear bonus rule have to be in place now.
  registerArmorCap();
  registerGearBonuses();

  // Natural 20s and 1s on saves: ahead of Midi-QOL's own handler, which halves damage on a successful save.
  damageHook = Hooks.on("dnd5e.preCalculateDamage", onPreCalculateDamage);
  runFirst("dnd5e.preCalculateDamage", damageHook);

  Hooks.on("primal-auras.onceScope", onOnceScope);
  Hooks.on("renderActorSheetV2", onRenderActorSheet);
  Hooks.on("updateActor", onUpdateActor);

  if ( setting(SETTINGS.quickRest, true) ) registerQuickRest();
});

Hooks.once("ready", () => {
  // Registered now so it runs after other modules' listeners (custom-dnd5e changes the same formula).
  Hooks.on("dnd5e.preRollClassHitPoints", onPreRollClassHitPoints);
  // In case a module added its damage listener after this one's init.
  if ( damageHook !== null ) runFirst("dnd5e.preCalculateDamage", damageHook);

  if ( game.user.isGM && setting(SETTINGS.emanations, true) ) {
    const auras = game.modules.get("primal-auras");
    const newer = (a, b) => foundry.utils.isNewerVersion(a, b) || (a === b);
    if ( auras?.active && !newer(auras.version ?? "0", "1.3.0") ) {
      console.warn(`${MODULE_ID} | Primal Auras ${auras.version} can't limit emanations to once per round; 1.3.0 or later can.`);
    }
  }

  const module = game.modules.get(MODULE_ID);
  console.log(`${MODULE_ID} | ${module?.version ?? ""} ready`);
  if ( module ) module.api = { hasMvp, setMvp, gearPlan };
});
