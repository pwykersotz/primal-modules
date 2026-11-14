/* -------------------------------------------- */
/*  Logic                                       */
/* -------------------------------------------- */

/** Add Mighty Guard to the core status list (idempotent). */
/** A valid 16-character document ID for one of this module's statuses. */
function statusDocId(id) {
  return `mg${id}`.replace(/[^a-zA-Z0-9]/g, "").padEnd(16, "0").slice(0, 16);
}

function loc(key) {
  return game.i18n?.has?.(key) ? game.i18n.localize(key) : key;
}

const isV14 = () => (game.release?.generation ?? 12) >= 14;

/**
 * Build an Active Effect change. Foundry v14 stores changes in `system.changes` with a
 * named type; earlier versions use `changes` with a numeric mode.
 */
function effectChange(key, type, value) {
  return isV14()
    ? { key, type, value, phase: "initial", priority: null }
    : { key, mode: { multiply: 1, add: 2, override: 5 }[type], value: String(value) };
}

/** Changes that multiply (or, with "override", set) a creature's speed. */
function speedChanges(type, factor) {
  return isV14()
    ? [effectChange("system.attributes.movement.multiplier", type, factor)]
    : ["walk", "fly", "swim", "climb", "burrow"].map(m => effectChange(`system.attributes.movement.${m}`, type, factor));
}

function withChanges(data, changes) {
  return isV14() ? { ...data, system: { changes } } : { ...data, changes };
}

/** The statuses this module adds, with the rules they apply (dnd5e). */
function moduleStatusEffects() {
  const dnd5e = game.system?.id === "dnd5e";
  return [
    { id: STATUS_ID, name: "MIGHTYGUARD.Name", img: ICON, description: "MIGHTYGUARD.Desc.MightyGuard" },
    withChanges(
      { id: HASTE_ID, name: "MIGHTYGUARD.Haste", img: `${MODULE_PATH}/icons/haste.svg`, description: "MIGHTYGUARD.Desc.Haste" },
      dnd5e ? [
        ...speedChanges("multiply", 2),                                   // Speed doubled
        effectChange("system.attributes.ac.bonus", "add", 2),             // +2 AC
        effectChange("system.abilities.dex.save.roll.mode", "add", 1)     // Advantage on Dex saves
      ] : []
    ),
    withChanges(
      { id: SLOW_ID, name: "MIGHTYGUARD.Slow", img: `${MODULE_PATH}/icons/slow.svg`, description: "MIGHTYGUARD.Desc.Slow" },
      dnd5e ? [
        ...speedChanges("multiply", 0.5),                                 // Speed halved
        effectChange("system.attributes.ac.bonus", "add", -2),            // −2 AC
        effectChange("system.abilities.dex.bonuses.save", "add", -2)      // −2 to Dex saves
      ] : []
    ),
    // Leveled: dnd5e 6 tracks the level itself (see registerContaminationCondition); elsewhere this module does.
    { id: CONTAM_ID, name: "MIGHTYGUARD.Contamination", img: CONTAM_ICON, description: "MIGHTYGUARD.Desc.Contamination", _id: contaminationDocId() },
    // Monsters of Drakkenheim conditions (left alone if another module or the system already has them)
    ...DRAKKENHEIM_CONDITIONS.map(id => {
      const data = { id, name: `MIGHTYGUARD.Drakkenheim.${settingLabel(id)}`, img: `${MODULE_PATH}/icons/${drakkenheimIcon(id)}.svg`,
        description: `MIGHTYGUARD.Desc.${settingLabel(id)}`, optional: true, ...(DRAKKENHEIM_IMPLIES[id] ? { statuses: DRAKKENHEIM_IMPLIES[id] } : {}) };
      const changes = dnd5e ? drakkenheimChanges(id) : [];
      return changes.length ? withChanges(data, changes) : data;
    })
  ];
}

const DRAKKENHEIM_CONDITIONS = ["addled", "clumsy", "enfeebled", "sickened", "defenseless", "helpless", "weakened", "dazed",
  "immobilized", "entangled", "frozen", "shocked", "jinxed", "valor",
  "bewildered", "distracted", "staggered", "drakkenheimSlowed", "drakkenheimMadness"];

/** The icon's file name: the status ID, in lower case with dashes ("drakkenheimMadness" → "drakkenheim-madness"). */
function drakkenheimIcon(id) {
  return id.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
}

/**
 * The rules some of these statuses apply through the effect itself: Slowed halves Speed, and
 * Distracted tells Midi-QOL the creature has no Reaction to take (Midi then offers it none).
 * (Slowed's ID isn't "slowed": that's this module's Slow, the spell, which does more.)
 */
function drakkenheimChanges(id) {
  if (id === "drakkenheimSlowed") return speedChanges("multiply", 0.5);
  if (id === "distracted") return [effectChange("flags.midi-qol.actions.reactionsMax", "override", 0)];
  return [];
}
const ownOptionalStatuses = new Set();   // optional statuses this module added (not someone else's)

/** Does the game system handle leveled conditions itself? (dnd5e 6+: level up/down from the token HUD) */
function systemHasLeveledConditions() {
  return !!(CONFIG.DND5E?.conditionTypes && CONFIG.ActiveEffect?.dataModels?.condition?.hasLevels);
}

function contaminationDocId() {
  const staticID = globalThis.dnd5e?.utils?.staticID;
  return (systemHasLeveledConditions() && typeof staticID === "function") ? staticID(`dnd5e${CONTAM_ID}`) : statusDocId(CONTAM_ID);
}

/**
 * On dnd5e 6, make Contamination a leveled condition like Exhaustion: left-click in the token
 * HUD adds a level, right-click removes one, the name shows the level, and levels 4 and 5 add
 * the Weakened and Dazed statuses. dnd5e turns this into a status effect during i18nInit.
 */
function registerContaminationCondition() {
  if (!systemHasLeveledConditions()) return false;
  const types = CONFIG.DND5E.conditionTypes;
  types[CONTAM_ID] = {
    ...(types[CONTAM_ID] ?? {}),
    name: loc("MIGHTYGUARD.Contamination"),
    img: CONTAM_ICON,
    levels: CONTAM_MAX,
    conditions: { 4: ["weakened"], 5: ["dazed"] }
  };
  return true;
}

/** The status icon for a contamination level (contamination-3.svg etc.). */
function contaminationIcon(level) {
  return level > 0 ? CONTAM_ICON.replace(/\.svg$/, `-${Math.min(CONTAM_MAX, level)}.svg`) : CONTAM_ICON;
}

/**
 * Change an actor's contamination by some levels, for systems that don't track leveled
 * conditions themselves. The level is kept in a flag on the effect.
 */
async function changeContamination(actor, delta) {
  if (!actor) return;
  const existing = actor.effects.find(e => e.statuses?.has(CONTAM_ID));
  const current = existing ? contaminationLevel({ effects: [existing] }) : 0;
  const level = Math.max(0, Math.min(CONTAM_MAX, current + delta));
  if (level === current) return;
  if (!level) return existing.delete();
  const changes = { name: `${loc("MIGHTYGUARD.Contamination")} (${level})`, img: contaminationIcon(level), flags: { [MODULE_ID]: { level } } };
  if (existing) return existing.update(changes);
  const cls = CONFIG.ActiveEffect.documentClass;
  const data = typeof cls.fromStatusEffect === "function"
    ? (await cls.fromStatusEffect(CONTAM_ID)).toObject()
    : { name: loc("MIGHTYGUARD.Contamination"), img: CONTAM_ICON, statuses: [CONTAM_ID], description: loc("MIGHTYGUARD.Desc.Contamination") };
  return cls.create(foundry.utils.mergeObject(data, changes), { parent: actor, keepId: true });
}

/**
 * Add this module's statuses to the status palette. Foundry v14 / dnd5e 6 keep
 * CONFIG.statusEffects as a record keyed by ID; earlier versions use an array.
 * Safe to call repeatedly (it refreshes names once translations are loaded).
 */
function registerStatuses() {
  const list = CONFIG.statusEffects;
  if (!list) return;
  moduleStatusEffects().forEach(({ optional, ...data }, i) => {
    if (optional && isRegisteredStatus(data.id)) {
      // Someone else's (from the start, or registered over ours since): leave it as it is
      const current = statusConfig(data.id);
      if (!ownOptionalStatuses.has(data.id) || (current?.img ?? current?.icon) !== data.img) return;
    }
    if (optional) ownOptionalStatuses.add(data.id);
    const entry = { ...data, _id: data._id ?? statusDocId(data.id), order: 90 + i, name: loc(data.name) };
    if (data.description) entry.description = loc(data.description);
    if (Array.isArray(list)) {
      const index = list.findIndex(e => e.id === data.id);
      if (index >= 0) list[index] = { ...list[index], ...entry };
      else list.push(entry);
    } else if (typeof list === "object") {
      list[data.id] = { ...(list[data.id] ?? {}), ...entry };
    }
  });
  decorateSystemStatuses();
}

/**
 * Statuses the system provides that this module renames or describes: the cover statuses are
 * named "Cover (Half)" and so on, so they sit together in the palette's alphabetical order, and
 * Burning and Bleeding get their Monsters of Drakkenheim text (their value and the damage each turn).
 */
const SYSTEM_STATUS_NAMES = { coverHalf: "MIGHTYGUARD.Cover.Half", coverThreeQuarters: "MIGHTYGUARD.Cover.ThreeQuarters", coverTotal: "MIGHTYGUARD.Cover.Total" };
const SYSTEM_STATUS_DESCRIPTIONS = { burning: "MIGHTYGUARD.Desc.Burning", bleeding: "MIGHTYGUARD.Desc.Bleeding" };

function decorateSystemStatuses() {
  for (const [id, key] of Object.entries(SYSTEM_STATUS_NAMES)) {
    const status = statusConfig(id);
    if (status) status.name = loc(key);
  }
  for (const [id, key] of Object.entries(SYSTEM_STATUS_DESCRIPTIONS)) {
    const status = statusConfig(id);
    // only replace text this module put there (or none), not another module's
    if (!status || (status.description && status.description !== status._mgDescription)) continue;
    status.description = status._mgDescription = loc(key);
  }
}

function isRegisteredStatus(id) {
  const list = CONFIG.statusEffects;
  return Array.isArray(list) ? list.some(e => e.id === id) : !!list?.[id];
}

/** Turn Mighty Guard on or off for an actor. */
async function toggleGuard(actor) {
  if (!actor) return;
  if (isRegisteredStatus(STATUS_ID) && typeof actor.toggleStatusEffect === "function") {
    try { await actor.toggleStatusEffect(STATUS_ID); return; }
    catch (err) { console.warn(`${MODULE_ID} | toggleStatusEffect failed, creating the effect directly`, err); }
  }
  const existing = actor.effects.filter(e => e.statuses?.has(STATUS_ID));
  if (existing.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
  } else {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n.localize("MIGHTYGUARD.Name"),
      img: ICON,
      statuses: [STATUS_ID]
    }]);
  }
}

/** Does this actor currently have Mighty Guard? */
function isGuarded(actor) {
  if (!actor) return false;
  if (actor.statuses?.has(STATUS_ID)) return true;
  return actor.effects?.some(e => !e.disabled && e.statuses?.has(STATUS_ID)) ?? false;
}

/** Is the rolling user currently targeting at least one guarded creature? */
function targetingGuarded() {
  for (const token of game.user?.targets ?? []) {
    if (isGuarded(token.actor)) return true;
  }
  return false;
}

function hasD20(roll) {
  try { return roll.dice.some(d => d.faces === 20); }
  catch { return false; }
}

/** Does any class in the roll's prototype chain look like a damage roll class? */
function isDamageClass(roll) {
  if (CONFIG.Dice?.DamageRoll && roll instanceof CONFIG.Dice.DamageRoll) return true; // dnd5e
  for (let c = roll.constructor; c && c !== Object; c = Object.getPrototypeOf(c)) {
    if (/damage/i.test(c.name ?? "")) return true; // pf2e DamageRoll and similar
  }
  return false;
}

/** Is this roll a damage roll? */
function isDamageRoll(roll) {
  // Never touch attack rolls / checks.
  if (hasD20(roll)) return false;

  // Loosest mode: any roll without a d20 made while targeting a guarded creature.
  if (game.settings.get(MODULE_ID, "detection") === "nonD20") return roll.dice.length > 0;

  if (isDamageClass(roll)) return true;

  // pf2e nested rolls / generic systems: look for damage hints in the roll options.
  const opt = roll.options ?? {};
  const hints = [opt.type, opt.rollType, opt.kind, opt.flavor]
    .filter(v => typeof v === "string")
    .join(" ")
    .toLowerCase();
  return /damage/.test(hints);
}

/** Return evaluation options, forcing minimum results for damage against a guarded creature. */
function applyGuard(roll, options) {
  let guard = false;
  try { guard = targetingGuarded() && isDamageRoll(roll); }
  catch (err) { console.warn(`${MODULE_ID} | Could not evaluate roll`, err); }
  if (!guard) return options;

  roll.options[MODULE_ID] = true;
  return {
    ...options,
    minimize: true,
    maximize: false,
    allowInteractive: false // skip manual dice entry (v13) so the minimum is enforced
  };
}

