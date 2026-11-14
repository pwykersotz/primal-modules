export const MODULE_ID = "primal-compendiums";

/**
 * The sidebar directories that get a Compendiums tab: the sidebar tab name and the document type it lists.
 * Adventures have no sidebar directory, so they are left out.
 */
export const DIRECTORIES = Object.freeze({
  actors: "Actor",
  items: "Item",
  scenes: "Scene",
  journal: "JournalEntry",
  tables: "RollTable",
  cards: "Cards",
  macros: "Macro",
  playlists: "Playlist"
});

export const SETTINGS = Object.freeze({
  /** The chosen compendiums (pack ids), for every directory at once. Each GM keeps their own. */
  packs: "packs",
  /** Which side each directory shows, "world" or "packs" (this device). */
  modes: "modes",
  /** Which compendiums are opened up in their directory's Compendiums tab (this device). */
  expanded: "expanded",
  /** Leave the tab off directories that have no compendiums chosen (each GM). */
  hideUnused: "hideUnused",
  /** Filters and sort for each side of each directory (this device). */
  filters: "filters"
});

/** The two sides of a directory. */
export const MODES = Object.freeze({ world: "world", packs: "packs" });

/** How long a dragged entry has to hover over World or Compendiums before the directory switches (ms). */
export const DRAG_SWITCH_DELAY = 450;

/**
 * Localize a key under PRIMAL_COMPENDIUMS.
 * @param {string} key
 * @param {object} [data]  Values for {placeholders}.
 * @returns {string}
 */
export function loc(key, data) {
  const path = `PRIMAL_COMPENDIUMS.${key}`;
  return data ? game.i18n.format(path, data) : game.i18n.localize(path);
}

/**
 * Read one of this module's settings.
 * @param {string} key
 */
export function setting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

/**
 * The plural label of a document type ("Actors"), as Foundry shows it on the sidebar.
 * @param {string} documentName
 * @returns {string}
 */
export function pluralLabel(documentName) {
  const cls = CONFIG[documentName]?.documentClass;
  const label = cls?.metadata?.labelPlural;
  return label ? game.i18n.localize(label) : documentName;
}

/**
 * The singular label of a document type ("Actor").
 * @param {string} documentName
 * @returns {string}
 */
export function singularLabel(documentName) {
  const cls = CONFIG[documentName]?.documentClass;
  const label = cls?.metadata?.label;
  return label ? game.i18n.localize(label) : documentName;
}

/** The sidebar tab name for a document type, or undefined. */
export function tabFor(documentName) {
  return Object.keys(DIRECTORIES).find(tab => DIRECTORIES[tab] === documentName);
}

/**
 * Split a compendium entry's uuid ("Compendium.dnd5e.monsters.Actor.abc") into its pack and id.
 * @param {string} uuid
 * @returns {{pack: CompendiumCollection|undefined, id: string|undefined}}
 */
export function splitUuid(uuid) {
  const parts = String(uuid ?? "").split(".");
  if ( (parts[0] !== "Compendium") || (parts.length < 5) ) return { pack: undefined, id: undefined };
  return { pack: game.packs.get(`${parts[1]}.${parts[2]}`), id: parts[4] };
}

/**
 * The name of the package a compendium comes from, for showing next to it.
 * @param {CompendiumCollection} pack
 * @returns {string}
 */
export function sourceLabel(pack) {
  const { packageType, packageName } = pack.metadata ?? {};
  if ( packageType === "world" ) return game.world?.title ?? packageName ?? "";
  if ( packageType === "system" ) return game.system?.title ?? packageName ?? "";
  return game.modules.get(packageName)?.title ?? packageName ?? "";
}
