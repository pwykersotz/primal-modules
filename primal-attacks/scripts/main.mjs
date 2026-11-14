import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { registerPatches } from "./patches.mjs";
import { registerDialogHooks } from "./dialog.mjs";
import { isRunning, registerEngineHooks, stopRun } from "./engine.mjs";
import { registerSummaryHooks } from "./summary.mjs";
import { registerFoldHooks } from "./fold.mjs";
import { openMultiattack, plannedRoutine, registerMultiattackHooks, rollRoutine, routineRows } from "./multiattack.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerDialogHooks();
  registerEngineHooks();
  registerSummaryHooks();
  registerFoldHooks();
  registerMultiattackHooks();
});

// Midi-QOL puts its own activity classes in place during init, so the wrappers go on once setup comes.
Hooks.once("setup", () => {
  registerPatches();
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  console.log(`${MODULE_ID} | ${module?.version ?? ""} ready`);
  if ( !module ) return;
  const actorOf = target => (target?.documentName === "Actor" ? target : target?.actor ?? null);
  module.api = {
    /** Is a set of attacks being rolled for this creature (Actor, Token or TokenDocument)? */
    isRunning: target => isRunning(actorOf(target)),

    /** Stop a set of attacks after the one being rolled (with Midi-QOL). */
    stop: target => stopRun(actorOf(target)),

    /** Open the Multiattack window for a creature: its attacks, each with how many times (Primal CR fills them in). */
    openMultiattack: target => openMultiattack(actorOf(target)),

    /**
     * Roll a routine without the window: [{itemId, activityId?, count}], or with none given, the one Primal CR reads
     * from the creature's Multiattack.
     */
    rollMultiattack: async (target, plan) => {
      const actor = actorOf(target);
      if ( !actor ) return;
      const rows = routineRows(actor, plan ?? plannedRoutine(actor) ?? []).filter(r => r.count > 0);
      return rollRoutine(actor, rows);
    }
  };
});
