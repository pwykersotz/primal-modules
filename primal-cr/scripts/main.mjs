/**
 * Primal CR: how dangerous is this fight for this party? For the GM, while planning or mid-fight.
 *
 * Ways in:
 * - the Primal CR tool in the Token controls, and a keybinding (unbound to start with);
 * - right-click an actor (or a folder of actors) in the Actors sidebar, in a compendium window, or on the
 *   Compendiums side that Primal Compendiums adds: Add to Primal CR;
 * - drag actors or folders from any of those into the window;
 * - buttons in the window for the selected tokens, the whole scene, or the current combat;
 * - a button in the Combat Tracker;
 * - macros: game.modules.get("primal-cr").api.
 */
import { MODULE_ID, loc } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { PrimalCRWindow } from "./app.mjs";
import { actorsFromDrop } from "./encounter.mjs";
import { profileOf } from "./adapter.mjs";
import { readActor } from "./reader.mjs";
import { simulate } from "./sim.mjs";
import { judge } from "./verdict.mjs";

const ICON = "fa-solid fa-scale-unbalanced";

async function addToWindow(uuids, side) {
  const app = PrimalCRWindow.open();
  if ( !app ) return;
  const added = await app.add(uuids, side);
  if ( !added ) ui.notifications.info(loc("Errors.NotActor"));
}

/** The uuid of the row a context menu was opened on, in a sidebar directory or a compendium window. */
function uuidOfRow(app, li) {
  const row = li?.closest?.("[data-uuid], [data-entry-id], [data-document-id]");
  if ( !row ) return null;
  if ( row.dataset.uuid ) return row.dataset.uuid;
  const id = row.dataset.entryId ?? row.dataset.documentId;
  const collection = app?.collection;
  if ( !id || !collection ) return null;
  if ( typeof collection.getUuid === "function" ) return collection.getUuid(id);
  return collection.get?.(id)?.uuid ?? null;
}

/** Right-click options for an actor, in the Actors sidebar or an Actor compendium's window. */
function onActorContext(app, options) {
  if ( !game.user.isGM || !Array.isArray(options) ) return;
  options.push({
    label: "PRIMAL_CR.Context.Add",
    icon: ICON,
    visible: li => !!uuidOfRow(app, li),
    onClick: (event, li) => {
      const uuid = uuidOfRow(app, li);
      if ( uuid ) return addToWindow([uuid]);
    }
  });
}

/** Right-click options for an entry on Primal Compendiums' Compendiums side. */
function onPrimalCompendiumsContext(app, options) {
  if ( !game.user.isGM || !Array.isArray(options) || (app?.documentName !== "Actor") ) return;
  onActorContext(app, options);
}

/** Right-click options for a folder of actors. */
function onFolderContext(app, options) {
  if ( !game.user.isGM || !Array.isArray(options) ) return;
  const documentName = app?.documentName ?? app?.collection?.documentName;
  if ( documentName !== "Actor" ) return;
  const folderOf = header => {
    const li = header?.closest?.("[data-folder-id], [data-uuid]");
    if ( !li ) return null;
    if ( li.dataset.uuid && li.dataset.uuid.includes("Folder.") ) return li.dataset.uuid;
    const id = li.dataset.folderId;
    const folder = app?.collection?.folders?.get?.(id) ?? game.folders?.get(id);
    return folder?.uuid ?? null;
  };
  options.push({
    label: "PRIMAL_CR.Context.AddFolder",
    icon: ICON,
    visible: header => !!folderOf(header),
    onClick: async (event, header) => {
      const uuid = folderOf(header);
      if ( !uuid ) return;
      const uuids = await actorsFromDrop({ type: "Folder", uuid });
      return addToWindow(uuids, "enemies");
    }
  });
}

/** The Primal CR tool in the Token controls. */
function onGetSceneControlButtons(controls) {
  if ( !game.user.isGM ) return;
  const tokens = controls?.tokens ?? (Array.isArray(controls) ? controls.find(c => c.name === "token") : null);
  if ( !tokens ) return;
  const tool = {
    name: "primalCR",
    title: "PRIMAL_CR.Controls.Open",
    icon: ICON,
    button: true,
    visible: true,
    order: 60,
    onChange: () => PrimalCRWindow.open()
  };
  if ( Array.isArray(tokens.tools) ) tokens.tools.push(tool);
  else if ( tokens.tools ) tokens.tools[tool.name] = tool;
}

/** A button in the Combat Tracker that loads the fight in progress. */
function onRenderCombatTracker(app, html) {
  if ( !game.user.isGM ) return;
  const root = (html instanceof HTMLElement) ? html : (html?.[0] ?? app?.element);
  const combat = app?.viewed ?? game.combat;
  const holder = root?.querySelector?.(".combat-tracker-header .encounter-controls") ?? root?.querySelector?.(".encounter-controls");
  if ( !holder || !combat || holder.querySelector(".primal-cr-tracker") ) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `inline-control icon ${ICON} primal-cr-tracker`;
  button.dataset.tooltip = loc("Controls.Combat");
  button.setAttribute("aria-label", button.dataset.tooltip);
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    PrimalCRWindow.open()?.addFromMap("combat", { replace: true });
  });
  holder.append(button);
}

/* -------------------------------------------- */

Hooks.once("init", () => {
  registerSettings(() => PrimalCRWindow.instance?.onSettingsChanged());
  game.keybindings.register(MODULE_ID, "open", {
    name: "PRIMAL_CR.Controls.Open",
    hint: "PRIMAL_CR.Controls.OpenHint",
    editable: [],
    restricted: true,
    onDown: () => {
      PrimalCRWindow.open();
      return true;
    }
  });
});

// Everything else is for GMs only.
Hooks.once("setup", () => {
  if ( !game.user?.isGM ) return;
  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
  Hooks.on("getActorContextOptions", onActorContext);
  Hooks.on("getFolderContextOptions", onFolderContext);
  Hooks.on("getPrimalCompendiumsEntryContext", onPrimalCompendiumsContext);
  Hooks.on("renderCombatTracker", onRenderCombatTracker);

  // Keep an open window up to date as the fight goes on.
  const changed = actor => PrimalCRWindow.instance?.onActorChanged(actor);
  const ownerOf = document => {
    let parent = document?.parent;
    while ( parent && (parent.documentName !== "Actor") ) parent = parent.parent;
    return parent ?? null;
  };
  Hooks.on("updateActor", actor => changed(actor));
  Hooks.on("updateToken", token => changed(token?.actor));
  for ( const name of ["ActiveEffect", "Item"] ) {
    for ( const verb of ["create", "update", "delete"] ) {
      Hooks.on(`${verb}${name}`, document => changed(ownerOf(document)));
    }
  }
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if ( !module ) return;
  module.api = {
    /** Open the window. */
    open: () => PrimalCRWindow.open(),
    /**
     * Add creatures to the window.
     * @param {Array<string|Actor|TokenDocument|Token>} things  Uuids, actors or tokens.
     * @param {"party"|"enemies"} [side]  Left out, characters join the party and everything else the enemies.
     */
    add: (things, side) => addToWindow([things].flat().map(t => (typeof t === "string" ? t : (t?.document?.uuid ?? t?.uuid)))
      .filter(Boolean), side),
    /** Load the selected tokens, the whole scene, or the current combat: "selected", "scene", "combat". */
    fromMap: (from = "selected", options) => PrimalCRWindow.open()?.addFromMap(from, options),
    /**
     * Work out a fight without the window.
     * @param {Actor[]} party
     * @param {Actor[]} enemies
     * @param {object} [options]  { runs, tactics, fresh }
     * @returns {{result: object, verdict: object}}
     */
    assess: (party, enemies, { runs = 1000, tactics = "mixed", fresh = false } = {}) => {
      const side = (actors, pc) => actors.map((actor, i) => ({
        key: `${pc ? "p" : "e"}${i}`, pc: pc && ((actor.type === "character") || actor.hasPlayerOwner),
        profile: profileOf(actor, { fresh })
      }));
      const result = simulate(side(party, true), side(enemies, false), { runs, tactics });
      return { result, verdict: judge(result) };
    },
    /** What the module reads from an actor's sheet. */
    read: (actor, options) => profileOf(actor, options),
    readActor, simulate, judge
  };
  if ( game.user?.isGM ) console.log(`${MODULE_ID} | ${module.version ?? ""} ready`);
});
