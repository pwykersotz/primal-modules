export const MODULE_ID = "primal-hud";

/** The actor data path of hit points (dnd5e). */
export const HP_ATTRIBUTE = "attributes.hp";

/** The HP buttons, in the order they appear: losses on the left, gains on the right. */
export const HP_STEPS = [-10, -1, 1, 10];

export const SETTINGS = {
  hiddenButtons: "hiddenButtons",
  knownButtons: "knownButtons",
  hpCombineDelay: "hpCombineDelay",
  disableConfigDoubleClick: "disableConfigDoubleClick",
  sidebarTab: "sidebarTab",
  sidebarCollapsed: "sidebarCollapsed",
  sidebarSize: "sidebarSize",
  buttonLayout: "buttonLayout"
};

/**
 * Localize a key under PRIMAL_HUD.
 * @param {string} key
 * @param {object} [data]  Values for {placeholders}.
 * @returns {string}
 */
export function loc(key, data) {
  const path = `PRIMAL_HUD.${key}`;
  return data ? game.i18n.format(path, data) : game.i18n.localize(path);
}
