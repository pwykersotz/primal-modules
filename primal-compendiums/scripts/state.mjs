import { MODULE_ID, SETTINGS, MODES, setting } from "./constants.mjs";
import { toggleChoice } from "./logic.mjs";

/**
 * Register the module's settings. Called during the init hook.
 * Registering is all that happens for players: nothing is read or built for them.
 * @param {object} hooks
 * @param {Function} hooks.chooser          The Choose Compendiums window class, for the settings menu.
 * @param {Function} hooks.onPacksChanged   Called when the chosen compendiums change.
 * @param {Function} hooks.onLayoutChanged  Called when the hide-unused option changes.
 */
export function registerSettings({ chooser, onPacksChanged, onLayoutChanged }) {
  const L = key => `PRIMAL_COMPENDIUMS.Settings.${key}`;

  game.settings.registerMenu(MODULE_ID, "chooser", {
    name: L("chooser.Name"),
    label: L("chooser.Label"),
    hint: L("chooser.Hint"),
    icon: "fa-solid fa-book-atlas",
    type: chooser,
    restricted: true
  });

  // Each GM picks their own compendiums, and the choice follows them to any device.
  game.settings.register(MODULE_ID, SETTINGS.packs, {
    scope: "user",
    config: false,
    type: Array,
    default: [],
    onChange: () => onPacksChanged?.()
  });

  // Set from the Choose Compendiums window, so players never see it in their settings.
  game.settings.register(MODULE_ID, SETTINGS.hideUnused, {
    scope: "user",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => onLayoutChanged?.()
  });

  // Which side each directory was left on, and which compendiums are opened up: this device only.
  game.settings.register(MODULE_ID, SETTINGS.modes, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.filters, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.expanded, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
}

/** The chosen pack ids. */
export function getChosen() {
  const value = setting(SETTINGS.packs);
  return Array.isArray(value) ? value.filter(id => typeof id === "string") : [];
}

/**
 * Save the chosen pack ids.
 * @param {string[]} ids
 */
export function setChosen(ids) {
  return game.settings.set(MODULE_ID, SETTINGS.packs, Array.from(new Set(ids)));
}

/**
 * Turn one compendium on or off.
 * @param {string} id
 * @param {boolean} on
 */
export function chooseOne(id, on) {
  return setChosen(toggleChoice(getChosen(), id, on));
}

/** Whether a pack is chosen. */
export function isChosen(id) {
  return getChosen().includes(id);
}

/**
 * The side a directory is on.
 * @param {string} tab
 * @returns {"world"|"packs"}
 */
export function getMode(tab) {
  const modes = setting(SETTINGS.modes) ?? {};
  return modes[tab] === MODES.packs ? MODES.packs : MODES.world;
}

/**
 * Remember the side a directory is on.
 * @param {string} tab
 * @param {"world"|"packs"} mode
 */
export function setMode(tab, mode) {
  const modes = { ...(setting(SETTINGS.modes) ?? {}) };
  if ( modes[tab] === mode ) return;
  modes[tab] = mode;
  return game.settings.set(MODULE_ID, SETTINGS.modes, modes);
}

/** Opened-up state of every compendium, by pack id. */
export function getExpanded() {
  return setting(SETTINGS.expanded) ?? {};
}

/**
 * Remember whether a compendium is opened up.
 * @param {string} id
 * @param {boolean} open
 */
export function setExpanded(id, open) {
  const expanded = { ...getExpanded(), [id]: !!open };
  return game.settings.set(MODULE_ID, SETTINGS.expanded, expanded);
}

/**
 * Remember several compendiums' opened-up state at once.
 * @param {Record<string, boolean>} changes
 */
export function setExpandedMany(changes) {
  const expanded = { ...getExpanded(), ...changes };
  return game.settings.set(MODULE_ID, SETTINGS.expanded, expanded);
}

/** Whether directories with nothing chosen leave the tab off. */
export function hideUnused() {
  return setting(SETTINGS.hideUnused) === true;
}

/**
 * The filter and sort state of one side of a directory, as saved.
 * @param {string} tab
 * @param {"world"|"packs"} side
 * @returns {object|undefined}
 */
export function getFilterState(tab, side) {
  return (setting(SETTINGS.filters) ?? {})[tab]?.[side];
}

/**
 * Save the filter and sort state of one side of a directory.
 * @param {string} tab
 * @param {"world"|"packs"} side
 * @param {object} state
 */
export function setFilterState(tab, side, state) {
  const all = foundry.utils.deepClone(setting(SETTINGS.filters) ?? {});
  all[tab] = { ...(all[tab] ?? {}), [side]: state };
  return game.settings.set(MODULE_ID, SETTINGS.filters, all);
}
