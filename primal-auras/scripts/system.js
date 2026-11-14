/**
 * Game-system adapters. D&D 5e is supported natively (saves, typed damage with resistances,
 * healing), PF2e saves are supported, and every other system falls back to configurable formulas.
 */
import { MODULE_ID, getSetting, localize, warn, RollClass, generation } from "./constants.js";

export const systemId = () => game.system?.id;

const labelOf = v => (typeof v === "string" ? localize(v) : localize(v?.label ?? v?.name ?? ""));

/* -------------------------------------------- */
/*  Choice lists for the configuration UI       */
/* -------------------------------------------- */

export function getAbilityChoices() {
  if (systemId() === "dnd5e" && CONFIG.DND5E?.abilities) {
    return Object.fromEntries(Object.entries(CONFIG.DND5E.abilities).map(([k, v]) => [k, labelOf(v) || k]));
  }
  if (systemId() === "pf2e" && CONFIG.PF2E?.saves) {
    return Object.fromEntries(Object.entries(CONFIG.PF2E.saves).map(([k, v]) => [k, labelOf(v) || k]));
  }
  return null;
}

export function getDamageTypeChoices() {
  if (systemId() === "dnd5e" && CONFIG.DND5E?.damageTypes) {
    return Object.fromEntries(Object.entries(CONFIG.DND5E.damageTypes).map(([k, v]) => [k, labelOf(v) || k]));
  }
  return null;
}

export function getHealingTypeChoices() {
  if (systemId() === "dnd5e" && CONFIG.DND5E?.healingTypes) {
    return Object.fromEntries(Object.entries(CONFIG.DND5E.healingTypes).map(([k, v]) => [k, labelOf(v) || k]));
  }
  return { healing: localize("PRIMAL_AURAS.Effect.Healing"), temphp: localize("PRIMAL_AURAS.Effect.TempHP") };
}

export function getStatusChoices() {
  return (CONFIG.statusEffects ?? [])
    .filter(s => s?.id)
    .map(s => ({ id: s.id, label: localize(s.name ?? s.label ?? s.id), img: s.img ?? s.icon ?? "" }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const LEGACY_TYPES = ["add", "multiply", "override", "upgrade", "downgrade", "custom"];

export function getChangeTypeChoices() {
  const types = CONFIG.ActiveEffect?.changeTypes;
  if (generation() >= 14 && types && Object.keys(types).length) {
    return Object.fromEntries(Object.entries(types).map(([k, v]) => [k, labelOf(v) || k]));
  }
  return Object.fromEntries(LEGACY_TYPES.map(t => [t, localize(`PRIMAL_AURAS.ChangeType.${t}`)]));
}

export function abilityLabel(id) {
  return getAbilityChoices()?.[id] ?? String(id).toUpperCase();
}

export function damageTypeLabel(id) {
  if (!id) return "";
  return getDamageTypeChoices()?.[id] ?? getHealingTypeChoices()?.[id] ?? id;
}

/* -------------------------------------------- */
/*  Active Effect data (v13 vs v14 schema)      */
/* -------------------------------------------- */

function resolveChangeType(type) {
  const types = CONFIG.ActiveEffect?.changeTypes ?? {};
  if (type in types) return type;
  const lower = String(type).toLowerCase();
  const match = Object.keys(types).find(k => k.toLowerCase() === lower);
  return match ?? (("add" in types) ? "add" : Object.keys(types)[0] ?? "add");
}

function legacyMode(type) {
  const MODES = CONST.ACTIVE_EFFECT_MODES ?? { CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5 };
  return MODES[String(type).toUpperCase()] ?? MODES.ADD ?? 2;
}

/** Write effect changes into ActiveEffect creation data using the schema of the running core version. */
export function writeChanges(data, changes) {
  const list = changes.filter(c => c.key);
  if (!list.length) return data;
  if (generation() >= 14) {
    data.system ??= {};
    data.system.changes = list.map(c => ({ key: c.key, type: resolveChangeType(c.type), value: String(c.value) }));
  } else {
    data.changes = list.map(c => ({ key: c.key, mode: legacyMode(c.type), value: String(c.value) }));
  }
  return data;
}

/** Core duration data, mainly so sheets display how long the effect lasts. Expiry itself is handled by this module. */
export function writeDuration(data, rounds, combat) {
  if (!(rounds > 0)) return data;
  if (generation() >= 14) {
    data.duration = { value: rounds, units: "rounds" };
  } else {
    data.duration = {
      rounds,
      startRound: combat?.round ?? 0,
      startTurn: combat?.turn ?? 0,
      combat: combat?.id ?? null,
      startTime: game.time.worldTime
    };
  }
  return data;
}

/* -------------------------------------------- */
/*  Formulas                                    */
/* -------------------------------------------- */

export async function evaluateFormula(formula, rollData, fallback = 0) {
  if (formula === null || formula === undefined || String(formula).trim() === "") return fallback;
  if (typeof formula === "number") return formula;
  try {
    const Roll = RollClass();
    const roll = new Roll(String(formula), rollData);
    await roll.evaluate({ allowInteractive: false });
    return Number.isFinite(roll.total) ? roll.total : fallback;
  } catch (err) {
    warn(`Could not evaluate formula "${formula}"`, err);
    return fallback;
  }
}

/**
 * Resolve @-references in an Active Effect change value against the aura SOURCE's data, so a
 * paladin's aura grants the paladin's Charisma modifier rather than the target's.
 */
export function resolveStaticValue(value, rollData) {
  const str = String(value ?? "");
  if (!str.includes("@")) return str;
  const Roll = RollClass();
  let replaced;
  try { replaced = Roll.replaceFormulaData(str, rollData ?? {}, { missing: "0", warn: false }); }
  catch { return str; }
  if (/\d*d\d/i.test(replaced)) return replaced;
  try {
    const n = Roll.safeEval(replaced);
    return Number.isFinite(n) ? String(n) : replaced;
  } catch {
    return replaced;
  }
}

export function getSourceRollData(entry) {
  try {
    if (entry.sourceType === "item" && entry.item?.getRollData) return entry.item.getRollData();
    return entry.tokenDoc?.actor?.getRollData?.() ?? {};
  } catch {
    return {};
  }
}

/* -------------------------------------------- */
/*  Saving throws                               */
/* -------------------------------------------- */

/**
 * Roll a saving throw for an actor.
 * @returns {Promise<{total:number, success:boolean}|null>} null when the roll was cancelled.
 */
export async function rollSave(actor, ability, dc, { configure = false } = {}) {
  if (!actor) return null;
  const sys = systemId();

  if (sys === "dnd5e" && typeof actor.rollSavingThrow === "function") {
    const result = await actor.rollSavingThrow({ ability, target: dc }, { configure }, { create: true });
    const roll = Array.isArray(result) ? result[0] : result;
    if (!roll) return null;
    return { total: roll.total, success: roll.total >= dc };
  }
  if (typeof actor.rollAbilitySave === "function") {
    const roll = await actor.rollAbilitySave(ability, { targetValue: dc, fastForward: !configure, chatMessage: true });
    if (!roll) return null;
    return { total: roll.total, success: roll.total >= dc };
  }
  if (sys === "pf2e" && actor.saves?.[ability]?.roll) {
    const roll = await actor.saves[ability].roll({ dc: { value: dc }, skipDialog: !configure });
    if (!roll) return null;
    return { total: roll.total, success: roll.total >= dc };
  }

  // Generic fallback
  const Roll = RollClass();
  const formula = String(getSetting("genericSaveFormula") || "1d20").replaceAll("{ability}", ability);
  const roll = new Roll(formula, actor.getRollData?.() ?? {});
  await roll.evaluate({ allowInteractive: false });
  const ChatMessage = CONFIG.ChatMessage.documentClass;
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: localize("PRIMAL_AURAS.Chat.SaveFlavor", { ability: abilityLabel(ability), dc })
  });
  return { total: roll.total, success: roll.total >= dc };
}

/* -------------------------------------------- */
/*  Damage & healing                            */
/* -------------------------------------------- */

export async function applyHpChange(actor, amount, type, isHealing) {
  amount = Math.floor(Number(amount) || 0);
  if (!actor || amount <= 0) return;

  if (systemId() === "dnd5e" && typeof actor.applyDamage === "function") {
    const t = isHealing ? (type || "healing") : (type || "");
    try {
      await actor.applyDamage([{ value: amount, type: t, properties: new Set() }], {});
      return;
    } catch (err) {
      warn("Typed damage application failed, applying untyped", err);
      await actor.applyDamage(isHealing ? -amount : amount);
      return;
    }
  }

  const path = String(getSetting("genericHpPath") || "system.attributes.hp.value");
  if (isHealing && type === "temphp") {
    const tempPath = path.replace(/\.value$/, ".temp");
    const current = Number(foundry.utils.getProperty(actor, tempPath)) || 0;
    await actor.update({ [tempPath]: Math.max(current, amount) });
    return;
  }
  const current = Number(foundry.utils.getProperty(actor, path)) || 0;
  const max = Number(foundry.utils.getProperty(actor, path.replace(/\.value$/, ".max")));
  let next = isHealing ? current + amount : current - amount;
  if (isHealing && Number.isFinite(max) && max > 0) next = Math.min(next, max);
  await actor.update({ [path]: Math.max(0, next) });
}

export function isDefeated(tokenDoc) {
  const id = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  return !!(tokenDoc.actor?.statuses?.has?.(id) || tokenDoc.combatant?.defeated);
}

export const MODULE = MODULE_ID;
