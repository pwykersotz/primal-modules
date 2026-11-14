/* -------------------------------------------- */
/*  Contamination symptoms: Weakened and Dazed   */
/* -------------------------------------------- */

/*
 * Monsters of Drakkenheim: at Contamination level 4 a creature is Weakened (it deals half damage with
 * weapon attacks and spells), and at level 5 it's Dazed as well. The Contamination effect carries
 * those statuses itself (the way Unconscious carries Incapacitated and Prone), so they show in the
 * status palette and pane, and come off again when the level drops. Weakened halves the creature's
 * weapon and spell damage rolls (with "Advantage and Disadvantage from conditions" on); Dazed is
 * a reminder only.
 */
const WEAKENED_ID = "weakened";
const DAZED_ID = "dazed";
const CONTAM_SYMPTOMS = [{ level: 4, status: WEAKENED_ID }, { level: 5, status: DAZED_ID }];

/** The statuses a Contamination effect at this level gives besides Contamination itself. */
function contaminationSymptoms(level) {
  return CONTAM_SYMPTOMS.filter(s => level >= s.level).map(s => s.status);
}

/** A Contamination effect's level: dnd5e 6 keeps it in system.level, otherwise this module's flag. */
function contaminationEffectLevel(effect, changes = null) {
  const get = foundry.utils?.getProperty ?? ((o, p) => p.split(".").reduce((a, k) => a?.[k], o));
  const pick = path => (changes ? get(changes, path) : undefined) ?? get(effect, path);
  const n = Number(pick("system.level") ?? [MODULE_ID, ...LEGACY_MODULE_IDS].map(id => pick(`flags.${id}.level`)).find(v => v !== undefined) ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.min(CONTAM_MAX, Math.floor(n)) : 1;
}

const isContaminationEffect = (effect, statuses = effect?.statuses) => [...(statuses ?? [])].includes(CONTAM_ID);

/** The statuses the effect should have: what it has, minus old symptoms, plus the ones for its level. */
function statusesForLevel(statuses, level) {
  const symptoms = new Set(CONTAM_SYMPTOMS.map(s => s.status));
  return [...new Set([...[...(statuses ?? [])].filter(s => !symptoms.has(s)), ...contaminationSymptoms(level)])];
}

const sameStatuses = (a, b) => { const x = new Set(a), y = new Set(b); return x.size === y.size && [...x].every(s => y.has(s)); };

// A new Contamination effect gets the symptoms for its level
Hooks.on("preCreateActiveEffect", (effect, data) => {
  try {
    const statuses = data?.statuses ?? effect?.statuses;
    if (!isContaminationEffect(effect, statuses)) return;
    const wanted = statusesForLevel(statuses, contaminationEffectLevel(effect, data));
    if (!sameStatuses(statuses, wanted)) effect.updateSource({ statuses: wanted });
  } catch (err) { console.warn(`${MODULE_ID} | Could not add the Contamination symptoms`, err); }
});

// A level change adds or removes them (the same update, so they're never out of step)
Hooks.on("preUpdateActiveEffect", (effect, changes) => {
  try {
    const statuses = changes?.statuses ?? effect?.statuses;
    if (!isContaminationEffect(effect, statuses)) return;
    const wanted = statusesForLevel(statuses, contaminationEffectLevel(effect, changes));
    if (!sameStatuses(effect?.statuses ?? [], wanted) || changes.statuses) changes.statuses = wanted;
  } catch (err) { console.warn(`${MODULE_ID} | Could not update the Contamination symptoms`, err); }
});

/** Contamination effects made before this (on creatures in the sidebar and on every scene) get their symptoms. */
async function syncContaminationSymptoms() {
  const actors = new Set();
  for (const actor of game.actors ?? []) actors.add(actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (!token.actorLink && token.actor) actors.add(token.actor);
  let fixed = 0;
  for (const actor of actors) {
    const updates = [];
    for (const effect of actor.effects ?? []) {
      if (!effect?.id || !isContaminationEffect(effect)) continue;
      const wanted = statusesForLevel(effect.statuses, contaminationEffectLevel(effect));
      if (!sameStatuses(effect.statuses, wanted)) updates.push({ _id: effect.id, statuses: wanted });
    }
    if (!updates.length) continue;
    try { await actor.updateEmbeddedDocuments("ActiveEffect", updates); fixed += updates.length; }
    catch (err) { console.warn(`${MODULE_ID} | Could not update Contamination on ${actor.name}`, err); }
  }
  return fixed;
}

Hooks.once("ready", () => {
  const gm = game.users?.activeGM;
  if (!game.user?.isGM || (gm && !(gm.isSelf ?? gm.id === game.user.id))) return;
  syncContaminationSymptoms().catch(err => console.warn(`${MODULE_ID} | Could not update Contamination`, err));
});

/** Is the creature Weakened (the status, or Contamination at level 4 or more)? */
function isWeakened(actor) {
  return hasStatus(actor, WEAKENED_ID) || contaminationLevel(actor) >= 4;
}

/* ---------- Weakened: half damage with weapon attacks and spells ---------- */

/** Is this damage from a weapon attack or a spell? (A weapon or spell item, or any attack.) */
function weaponOrSpellDamage(activity) {
  const item = activity?.item ?? activity?.parent?.parent;
  return ["weapon", "spell"].includes(item?.type) || activity?.type === "attack";
}

/** dnd5e pre-roll: mark the damage of a Weakened creature's weapon attack or spell to be halved. */
function damageRollConditions(config, message) {
  const activity = config?.subject;
  const actor = activity?.actor ?? activity?.item?.actor;
  if (!actor || !weaponOrSpellDamage(activity) || !isWeakened(actor)) return false;
  for (const roll of config.rolls ?? []) { roll.options ??= {}; roll.options.mgHalfDamage = true; }
  appendFlavor(message, `${loc("MIGHTYGUARD.Rolls.HalfDamage")}: ${statusDisplayName(WEAKENED_ID)}`);
  return true;
}

/**
 * Halve a rolled damage roll, rounding down, by adding a subtraction for each damage type (so
 * the total, the formula shown in chat and the damage each type deals all agree).
 */
function halveDamageRoll(roll) {
  adjustDamageByType(roll, share => { const cut = share - Math.floor(share / 2); return cut > 0 ? -cut : 0; }, total => Math.floor(total / 2));
}

/**
 * Change a rolled damage roll type by type: delta(share) is added to each damage type's share as a
 * term of that type, so the total, the formula shown in chat and the damage each type deals agree.
 * A formula with multiplication or division at the top level is changed as a whole; with no terms
 * to add to, the total is set to whole(total).
 */
function adjustDamageByType(roll, delta, whole) {
  const T = foundry.dice?.terms ?? {};
  const Numeric = T.NumericTerm ?? globalThis.NumericTerm, Operator = T.OperatorTerm ?? globalThis.OperatorTerm;
  const total = Number(roll._total ?? roll.total);
  if (!Number.isFinite(total) || total <= 0) return;
  const shares = new Map();
  let sign = 1, simple = Array.isArray(roll.terms) && !!Numeric && !!Operator;
  for (const term of simple ? roll.terms : []) {
    if (term instanceof Operator) {
      if (term.operator === "+") sign = 1; else if (term.operator === "-") sign = -1; else simple = false;
      continue;
    }
    const value = Number(term.total);
    if (!Number.isFinite(value)) { simple = false; break; }
    const type = term.flavor || roll.options?.type || "";
    shares.set(type, (shares.get(type) ?? 0) + sign * value);
    sign = 1;
  }
  if (!simple) {
    if (!Array.isArray(roll.terms) || !Numeric || !Operator) { roll._total = whole(total); return; }
    shares.clear();
    shares.set(roll.options?.type ?? "", total);
  }
  for (const [type, share] of shares) {
    const change = Number(delta(share));
    if (!Number.isFinite(change) || change === 0) continue;
    const op = new Operator({ operator: change < 0 ? "-" : "+" });
    const num = new Numeric({ number: Math.abs(change), options: type ? { flavor: type } : {} });
    op._evaluated = true; num._evaluated = true;
    roll.terms.push(op, num);
  }
  if (typeof roll.resetFormula === "function") roll.resetFormula();
  else if (typeof roll.constructor?.getFormula === "function") roll._formula = roll.constructor.getFormula(roll.terms);
  const recomputed = typeof roll._evaluateTotal === "function" ? Number(roll._evaluateTotal()) : NaN;
  roll._total = Number.isFinite(recomputed) ? recomputed : whole(total);
}
