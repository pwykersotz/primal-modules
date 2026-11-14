import { MODULE_ID, tabFor } from "./constants.mjs";
import { registerSettings } from "./state.mjs";
import { ChooserApp } from "./chooser.mjs";
import {
  allControllers, controllerFor, onDirectorySearched, onRenderDirectory, refreshDirectories
} from "./directories.mjs";
import { addCompendiumContextOptions } from "./compendium-menu.mjs";

/** The chosen compendiums changed (here, in the window, or from a right-click menu). */
function onPacksChanged() {
  refreshDirectories();
  ChooserApp.refresh();
}

Hooks.once("init", () => {
  registerSettings({
    chooser: ChooserApp,
    onPacksChanged,
    onLayoutChanged: () => refreshDirectories()
  });
});

// Everything else is for GMs only. Players get no hooks, no panels and no extra loading.
Hooks.once("setup", () => {
  if ( !game.user?.isGM ) return;

  Hooks.on("renderDocumentDirectory", onRenderDirectory);
  followDirectorySearch();
  Hooks.on("changeSidebarTab", app => controllerFor(app?.tabName)?.onActivate());
  Hooks.on("getCompendiumContextOptions", addCompendiumContextOptions);

  // A compendium's contents changed (an entry added, renamed or deleted in an unlocked compendium).
  Hooks.on("updateCompendium", pack => refreshDirectories(pack?.documentName));

  // A folder inside a compendium changed.
  const onFolder = folder => {
    if ( !folder?.pack ) return;
    refreshDirectories(game.packs.get(folder.pack)?.documentName ?? folder.type);
  };
  Hooks.on("createFolder", onFolder);
  Hooks.on("updateFolder", onFolder);
  Hooks.on("deleteFolder", onFolder);

  // Compendiums were added, removed, locked or unlocked: Foundry re-draws its Compendium sidebar.
  Hooks.on("renderCompendiumDirectory", () => {
    refreshDirectories();
    ChooserApp.refresh();
  });
});

/**
 * Filter a directory again each time its own search runs (it runs after every render, too). The search shows and
 * hides entries and opens and closes folders, so the filters have to follow it. Foundry has no hook here, so the
 * search method is wrapped, once, for the GM, before the sidebar's directories are made (dnd5e's included).
 */
function followDirectorySearch() {
  const DocumentDirectory = foundry.applications.sidebar?.DocumentDirectory;
  const original = DocumentDirectory?.prototype?._onSearchFilter;
  if ( typeof original !== "function" ) return;
  DocumentDirectory.prototype._onSearchFilter = function(...args) {
    const result = original.apply(this, args);
    onDirectorySearched(this);
    return result;
  };
}

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if ( !module ) return;
  module.api = {
    /**
     * Open the Choose Compendiums window.
     * @param {string} [documentName]  Only list compendiums of this type ("Actor", "Item", ...).
     */
    choose: documentName => ChooserApp.open(documentName ?? null),
    /**
     * Open a sidebar directory on one of its sides.
     * @param {string} tab                "actors", "items", "scenes", "journal", "tables", "cards", "macros", "playlists"
     * @param {"world"|"packs"} [mode]   Which side; the Compendiums side by default.
     */
    show: (tab, mode = "packs") => {
      const controller = controllerFor(tab);
      if ( !controller ) return;
      ui.sidebar?.changeTab(tab, "primary");
      controller.switchTo(mode);
    },
    /** The directory controllers made so far. */
    get controllers() {
      return allControllers();
    },
    tabFor
  };
  if ( game.user?.isGM ) console.log(`${MODULE_ID} | ${module.version ?? ""} ready`);
});
