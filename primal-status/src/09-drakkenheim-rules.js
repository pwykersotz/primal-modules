/* -------------------------------------------- */
/*  Monsters of Drakkenheim: more conditions     */
/*  and Contamination's rest rules               */
/* -------------------------------------------- */

/*
 * Immobilized: Speed 0 and no Speed bonuses (a flying creature falls). Entangled and Frozen are
 * Immobilized and Defenseless; Frozen also makes bludgeoning weapon attacks against it Critical
 * Hits. Shocked is Dazed and Defenseless. Jinxed (X) takes a die off attack rolls and saving
 * throws, Valor (X) adds one; X is the effect's value, set in the status pane (or read from its
 * name, for example "Jinxed (1d6)"), 1d4 if it doesn't say.
 *
 * Contamination: after a long rest, each contaminated creature rolls 1d20 and gains a level on a 1;
 * from level 2 Hit Point Dice heal half as much on a short rest, and from level 3 a long rest
 * restores no Hit Points.
 */
const DRAKKENHEIM_IMPLIES = {
  entangled: ["immobilized", "defenseless"],
  frozen: ["immobilized", "defenseless"],
  shocked: ["dazed", "defenseless"]
};
const IMMOBILE_STATUSES = ["immobilized", "entangled", "frozen"];
const CONDITION_DICE = { jinxed: -1, valor: 1 };

// Speed 0: dnd5e sets a creature's speeds to 0 for the statuses in its noMovement list
Hooks.once("setup", () => {
  const list = CONFIG.DND5E?.conditionEffects?.noMovement;
  for (const id of IMMOBILE_STATUSES) {
    try { if (list instanceof Set) list.add(id); else if (Array.isArray(list) && !list.includes(id)) list.push(id); }
    catch { /* not dnd5e */ }
  }
});

function contaminationRulesEnabled() {
  try { return !!game.settings.get(MODULE_ID, "contaminationRest"); } catch { return false; }
}

/* ---------- Jinxed and Valor: a die off or on attack rolls and saving throws ---------- */

/** The die a Jinxed or Valor effect carries (its value, see 09-status-values.js), 1d4 if none, null without the status. */
function conditionDie(actor, id) {
  return statusValue(actor, id);
}

/** A value as roll parts, each term labelled and taken away when sign is negative: ("1d6+1", −1) → ["-1d6[Jinxed]", "-1[Jinxed]"]. */
function signedRollParts(value, sign, label) {
  return [...String(value).matchAll(/([+-]?)(\d+d\d+|\d+)/g)].map(([, s, term]) => {
    const negative = (s === "-") !== (sign < 0);
    return `${negative ? "-" : ""}${term}[${label}]`;
  });
}

/** Add Jinxed's and Valor's dice to a pending attack roll or saving throw, and say so in its message. */
function applyConditionDice(actor, config, message) {
  const notes = [];
  for (const [id, sign] of Object.entries(CONDITION_DICE)) {
    if (!hasStatus(actor, id)) continue;
    const die = conditionDie(actor, id);
    if (!die) continue;
    const roll = config.rolls?.[0];
    if (!roll) continue;
    roll.parts ??= [];
    roll.parts.push(...signedRollParts(die, sign, statusDisplayName(id)));
    const compound = /\d[+-]/.test(die);
    notes.push(`${statusDisplayName(id)}: ${sign < 0 ? "−" : "+"}${compound ? `(${die})` : die}`);
  }
  if (notes.length) appendFlavor(message, notes.join("; "));
  return notes.length > 0;
}

/*
 * Dice So Nice: Midi-QOL throws a GM's attack roll with only its d20, hiding every other die in it
 * (Bless's as well), so Valor's or Jinxed's die never rolled across the screen. Their dice are put
 * back into that throw. Only a throw that shows the d20 and has no chat message yet is touched, so a
 * die that has already been thrown isn't thrown again when the roll's chat message appears. Midi
 * lowercases every die's label before throwing it ("valor"), so labels are matched ignoring case.
 */
function revealConditionDice(messageId, context) {
  try {
    if (messageId) return false;
    const dice = context?.roll?.dice ?? [];
    if (dice.length < 2 || !dice[0]?.results?.some(r => !r.hidden)) return false;
    const lower = text => String(text ?? "").trim().toLocaleLowerCase();
    const labels = new Set(Object.keys(CONDITION_DICE).flatMap(id => [lower(statusDisplayName(id)), id]));
    let revealed = false;
    for (const die of dice.slice(1)) {
      if (!labels.has(lower(die?.options?.flavor ?? die?.flavor))) continue;
      for (const result of die.results ?? []) {
        if (!result.hidden || result.discarded || result.rerolled) continue;
        result.hidden = false;
        revealed = true;
      }
    }
    return revealed;
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not show Jinxed's or Valor's die in Dice So Nice`, err);
    return false;
  }
}
Hooks.on("diceSoNiceRollStart", revealConditionDice);

/* ---------- Frozen: bludgeoning weapon attacks are Critical Hits ---------- */

/** The damage types an attack deals (from the activity's damage parts, or the weapon's own damage). */
function attackDamageTypes(activity) {
  const types = new Set();
  const add = t => { for (const x of (t instanceof Set ? [...t] : Array.isArray(t) ? t : [t])) if (typeof x === "string" && x) types.add(x); };
  for (const part of activity?.damage?.parts ?? []) add(part?.types ?? part?.type);
  const base = activity?.item?.system?.damage?.base;
  if (base) add(base.types ?? base.type);
  for (const part of activity?.item?.system?.damage?.parts ?? []) if (Array.isArray(part)) add(part[1]);
  return types;
}

/** Is this a weapon attack that deals bludgeoning damage? */
function bludgeoningWeaponAttack(activity) {
  const item = activity?.item;
  return (item?.type === "weapon" || activity?.attack?.type?.classification === "weapon") && attackDamageTypes(activity).has("bludgeoning");
}

/* ---------- Contamination: long rests and Hit Point Dice ---------- */

/** Change a creature's Contamination level by some levels (dnd5e 6's own level, or this module's). */
async function addContaminationLevels(actor, delta) {
  if (systemHasLeveledConditions()) {
    const effect = [...(actor?.effects ?? [])].find(e => e.statuses?.has?.(CONTAM_ID));
    if (!effect) return;
    const level = Math.max(0, Math.min(CONTAM_MAX, contaminationEffectLevel(effect) + delta));
    if (!level) return effect.delete();
    return effect.update({ "system.level": level });
  }
  return changeContamination(actor, delta);
}

/** After a long rest: 1d20, and a new level of Contamination on a 1. */
async function longRestContaminationCheck(actor) {
  const level = contaminationLevel(actor);
  if (!level) return null;
  const roll = await new Roll("1d20").evaluate();
  const gained = roll.total === 1;
  const flavor = loc(gained ? "MIGHTYGUARD.ContaminationRest.Gained" : "MIGHTYGUARD.ContaminationRest.Safe")
    .replace("{name}", actor.name ?? "").replace("{level}", String(Math.min(CONTAM_MAX, level + 1)));
  try {
    const speaker = globalThis.ChatMessage?.getSpeaker?.({ actor }) ?? {};
    await roll.toMessage?.({ speaker, flavor: `${loc("MIGHTYGUARD.Contamination")}: ${flavor}` });
  } catch (err) { console.warn(`${MODULE_ID} | Could not post the Contamination roll`, err); }
  if (gained) await addContaminationLevels(actor, 1);
  return gained;
}

const isLongRest = (result, config) => result?.longRest === true || config?.type === "long" || config?.longRest === true;

// Level 3 and above: a long rest restores no Hit Points
Hooks.on("dnd5e.preRestCompleted", (actor, result, config) => {
  try {
    if (!contaminationRulesEnabled() || !isLongRest(result, config) || contaminationLevel(actor) < 3) return;
    const data = result?.updateData;
    if (data && "system.attributes.hp.value" in data) data["system.attributes.hp.value"] = actor.system?.attributes?.hp?.value;
    if (data?.system?.attributes?.hp && "value" in data.system.attributes.hp) data.system.attributes.hp.value = actor.system?.attributes?.hp?.value;
    if (result.deltas) result.deltas.hitPoints = 0;
    if ("dhp" in (result ?? {})) result.dhp = 0;
  } catch (err) { console.warn(`${MODULE_ID} | Could not apply Contamination to the long rest`, err); }
});

// After a long rest, the Contamination check (rolled by whoever took the rest)
Hooks.on("dnd5e.restCompleted", (actor, result, config) => {
  if (!contaminationRulesEnabled() || !isLongRest(result, config) || !contaminationLevel(actor)) return;
  if (actor?.isOwner === false) return;
  longRestContaminationCheck(actor).catch(err => console.warn(`${MODULE_ID} | Could not roll for Contamination`, err));
});

const halvedHitDieUpdates = new WeakSet();   // dnd5e 6 calls both hit die hooks with the same updates: halve once

/** Level 2 and above: Hit Point Dice restore half as many Hit Points (rounded down). */
function halveHitDieHealing(actor, updates) {
  if (!contaminationRulesEnabled() || !updates || typeof updates !== "object" || halvedHitDieUpdates.has(updates)) return false;
  if (contaminationLevel(actor) < 2) return false;
  const now = Number(actor?.system?.attributes?.hp?.value);
  const key = "system.attributes.hp.value";
  const after = Number(updates[key] ?? updates.system?.attributes?.hp?.value);
  if (!Number.isFinite(now) || !Number.isFinite(after) || after <= now) return false;
  const halved = now + Math.floor((after - now) / 2);
  if (key in updates) updates[key] = halved; else updates.system.attributes.hp.value = halved;
  halvedHitDieUpdates.add(updates);
  return true;
}

// dnd5e 4 and later (dnd5e 6 calls dnd5e.rollHitDie with these arguments too)
const onHitDieRolled = (rolls, data) => {
  try {
    if (halveHitDieHealing(data?.subject, data?.updates?.actor)) {
      for (const roll of rolls ?? []) roll.options && (roll.options.mgHalvedByContamination = true);
    }
  } catch (err) { console.warn(`${MODULE_ID} | Could not apply Contamination to the Hit Point Die`, err); }
};
Hooks.on("dnd5e.rollHitDieV2", onHitDieRolled);
Hooks.on("dnd5e.rollHitDie", (first, second, third) => {
  if (Array.isArray(first) || second?.subject) return onHitDieRolled(first, second);
  // dnd5e 3 and earlier: (actor, roll, updates)
  try { halveHitDieHealing(first, third?.actor ?? third); } catch { /* not critical */ }
});
