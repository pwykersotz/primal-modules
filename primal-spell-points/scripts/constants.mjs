export const MODULE_ID = "primal-spell-points";

/** Actor flags (flags.primal-spell-points.*). */
export const FLAGS = {
  /** Spell points used since the last long rest. */
  spent: "spent",
  /** Spell levels of 6th and higher already cast since the last long rest, e.g. [6, 8]. */
  highUsed: "highUsed",
  /** True when the GM has chosen spell points for this actor. Off unless set. */
  enabled: "enabled",
  /** A fixed maximum set by the GM, or null to use the table. */
  maxOverride: "maxOverride",
  /** Extra points added to the table's maximum (can be negative). */
  bonus: "bonus"
};

export const SETTINGS = {
  highLevelLimit: "highLevelLimit",
  tables: "tables",
  tablesMenu: "tablesMenu"
};

/** Spells of this level and higher can each be cast once per long rest with spell points. */
export const HIGH_LEVEL = 6;

/** The spellcasting method whose slots are replaced. Pact Magic and other methods keep their slots. */
export const SLOT_METHOD = "spell";

/** The Dungeon Master's Guide spell points variant. */
export const DMG_TABLES = Object.freeze({
  /** Spell point cost by spell level. */
  cost: Object.freeze({ 1: 2, 2: 3, 3: 5, 4: 6, 5: 7, 6: 9, 7: 10, 8: 11, 9: 13 }),
  /** Spell points by spellcaster level 1 to 20 (index 0 is level 1). */
  points: Object.freeze([4, 6, 14, 17, 27, 32, 38, 44, 57, 64, 73, 73, 83, 83, 94, 94, 107, 114, 123, 133])
});

/**
 * Localize a key under PRIMAL_SPELL_POINTS.
 * @param {string} key
 * @param {object} [data]  Values for {placeholders}.
 * @returns {string}
 */
export function loc(key, data) {
  const path = `PRIMAL_SPELL_POINTS.${key}`;
  return data ? game.i18n.format(path, data) : game.i18n.localize(path);
}

/**
 * The name of a spell level, such as "3rd Level".
 * @param {number} level
 * @returns {string}
 */
export function levelLabel(level) {
  return CONFIG.DND5E?.spellLevels?.[level] ?? String(level);
}
