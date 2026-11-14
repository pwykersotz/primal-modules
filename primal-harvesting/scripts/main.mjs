import { FLAGS, MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { registerSocket } from "./gm.mjs";
import { registerControls, harvestTarget } from "./controls.mjs";
import { onActorUpdated, onCombatEnded, postReadyCard } from "./harvest.mjs";
import { HarvestWindow } from "./apps/harvest-window.mjs";
import { onChatMessage } from "./splash.mjs";
import { HarvestTablesEditor } from "./apps/tables-editor.mjs";
import { HarvestRulesEditor } from "./apps/rules-editor.mjs";
import { tokenDocOf } from "./creature.mjs";
import { getRules, getTables, saveTables } from "./store.mjs";
import { mergeTables, readImport } from "./tables.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerControls();
});

Hooks.once("ready", () => {
  registerSocket();
  HarvestWindow.listen();

  Hooks.on("deleteCombat", combat => {
    onCombatEnded(combat).catch(err => console.error(`${MODULE_ID} | Could not post the harvest card`, err));
  });
  Hooks.on("updateActor", (actor, changes) => {
    onActorUpdated(actor, changes).catch(err => console.error(`${MODULE_ID} | Could not post the harvest card`, err));
    HarvestWindow.refreshForActor(actor);
  });
  Hooks.on("updateToken", tokenDoc => HarvestWindow.refreshFor(tokenDoc));
  // Who can take part is the characters of the players logged in: a player coming or going changes it.
  Hooks.on("userConnected", () => HarvestWindow.refreshAll());
  Hooks.on("updateUser", () => HarvestWindow.refreshAll());
  // A harvest rolled (by anyone): its splash, once the dice land.
  Hooks.on("createChatMessage", message => {
    onChatMessage(message).catch(err => console.warn(`${MODULE_ID} | Could not show the harvest splash`, err));
  });

  const module = game.modules.get(MODULE_ID);
  console.log(`${MODULE_ID} | ${module?.version ?? ""} ready`);
  if ( !module ) return;
  module.api = {
    /** Open the harvest window for a corpse (a Token, TokenDocument or Actor), or for your target with none. */
    open: target => (target ? HarvestWindow.open(target) : harvestTarget()),

    /** Has this corpse been harvested? Returns what was harvested, or null. */
    harvested: target => tokenDocOf(target)?.getFlag(MODULE_ID, FLAGS.harvested) ?? null,

    /** Let a corpse be harvested again, as if it had never been (GM): its harvest, random components and window. */
    reset: async target => {
      const tokenDoc = tokenDocOf(target);
      if ( !game.user.isGM || !tokenDoc ) return;
      for ( const key of [FLAGS.harvested, FLAGS.random, FLAGS.session] ) {
        if ( tokenDoc.getFlag(MODULE_ID, key) !== undefined ) await tokenDoc.unsetFlag(MODULE_ID, key);
      }
    },

    /** Post a "ready to harvest" card for these corpses (GM). */
    offer: targets => postReadyCard([targets].flat().map(tokenDocOf).filter(Boolean), "death"),

    /** The harvest tables and rules as they are now. */
    tables: () => getTables(),
    rules: () => getRules(),

    /** Import harvest tables from JSON (a string or an object), merged into the ones there, or replacing them. */
    importTables: async (json, { replace=false }={}) => {
      const { tables, counts } = mergeTables(getTables(), readImport(json), replace ? "replace" : "merge");
      await saveTables(tables);
      return counts;
    },

    /** The windows, for macros. */
    openTables: selected => HarvestTablesEditor.openTo(selected),
    openRules: () => new HarvestRulesEditor().render({ force: true })
  };
});
