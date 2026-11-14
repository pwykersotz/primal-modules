/* -------------------------------------------- */
/*  Advantage & disadvantage from conditions    */
/* -------------------------------------------- */

/*
 * dnd5e already handles some of these itself (Poisoned and Exhaustion on checks, Dodging and
 * Restrained on Dexterity saves, Invisible / Incapacitated / Surprised on initiative). This adds
 * the rest, mostly attack rolls, which depend on both the attacker's and the target's conditions.
 * Sight is judged from conditions and special senses (Blindsight, Tremorsense, Truesight and the
 * token's detection modes), not from walls or lighting.
 */
const COND_RULES = {
  hidden: ["invisible", "ethereal"],                                        // unseen (Hiding alone doesn't count; add Invisible too)
  ownAttackDisadvantage: ["frightened", "poisoned", "prone", "restrained"],
  targetGrantsAdvantage: ["paralyzed", "petrified", "restrained", "stunned", "unconscious", "defenseless"],
  // Monsters of Drakkenheim: Disadvantage on attack rolls, ability checks and saving throws with these abilities
  abilityDisadvantage: { addled: ["int", "wis", "cha"], clumsy: ["dex"], enfeebled: ["str"] },
  saveDisadvantage: { sickened: ["con"] }
};

/** Does the actor have this status, from its status set or any of its active effects? */
function hasStatus(actor, id) {
  if (!actor) return false;
  const entry = cacheEntry(actor);                 // the animation loop's per-frame cache
  if (entry) return (entry.active ??= activeStatusIds(actor)).has(id);
  if (actor.statuses?.has?.(id)) return true;
  for (const effect of actor.effects ?? []) {
    if (effect.disabled || effect.active === false || effect.isSuppressed) continue;
    if (effect.statuses?.has?.(id)) return true;
  }
  return false;
}

/** Is this creature able to use Dodge right now? (not while Incapacitated or its Speed is 0) */
function dodgeActive(actor) {
  if (!hasStatus(actor, "dodging") || hasStatus(actor, "incapacitated")) return false;
  const noMovement = ["grappled", "paralyzed", "petrified", "restrained", "unconscious", ...(CONFIG.DND5E?.conditionEffects?.noMovement ?? [])];
  return !noMovement.some(s => typeof s === "string" && !s.includes("-") && hasStatus(actor, s));
}

/** The token standing in for an actor on the current scene. */
function tokenForActor(actor) {
  if (!actor) return null;
  if (actor.token?.object) return actor.token.object;
  const controlled = canvas?.tokens?.controlled?.find(t => t.actor === actor);
  if (controlled) return controlled;
  try { return actor.getActiveTokens?.(true)?.[0] ?? actor.getActiveTokens?.()?.[0] ?? null; }
  catch { return null; }
}

/** Distance in feet between two tokens' nearest edges (5 for creatures in adjacent squares). */
function tokenDistance(a, b) {
  const dims = canvas?.dimensions;
  if (!a || !b || !dims) return null;
  const size = dims.size || 100, dist = dims.distance || 5;
  const box = t => {
    const x = t.document?.x ?? t.x ?? 0, y = t.document?.y ?? t.y ?? 0;
    return { x0: x, y0: y, x1: x + (t.document?.width ?? 1) * size, y1: y + (t.document?.height ?? 1) * size };
  };
  const A = box(a), B = box(b);
  const gx = Math.max(0, B.x0 - A.x1, A.x0 - B.x1) / size;
  const gy = Math.max(0, B.y0 - A.y1, A.y0 - B.y1) / size;
  const gz = Math.max(0, Math.abs((a.document?.elevation ?? 0) - (b.document?.elevation ?? 0)) / dist - 1);
  return (Math.max(gx, gy, gz) + 1) * dist;
}

function senseRange(actor, sense) {
  const senses = actor?.system?.attributes?.senses ?? {};
  return Number(senses.ranges?.[sense] ?? senses[sense]) || 0;
}

function detectionRange(token, ids) {
  const modes = token?.document?.detectionModes;
  const list = Array.isArray(modes) ? modes : Object.entries(modes ?? {}).map(([id, m]) => ({ id, ...m }));
  let best = 0;
  for (const m of list) {
    if (!ids.includes(m?.id) || m.enabled === false) continue;
    best = Math.max(best, (m.range === null || m.range === undefined) ? Infinity : Number(m.range) || 0);
  }
  return best;
}

/** Can the observer perceive the subject without ordinary sight (Blindsight, Tremorsense, Truesight)? */
function perceivesWithoutSight(observer, observerToken, subject, subjectToken, { invisible = false } = {}) {
  const d = tokenDistance(observerToken, subjectToken) ?? Infinity;
  const within = range => range > 0 && d <= range;
  if (within(senseRange(observer, "blindsight")) || within(detectionRange(observerToken, ["senseAll", "blindsight"]))) return true;
  const grounded = !hasStatus(subject, "flying") && !hasStatus(subject, "hovering");
  if (grounded && (within(senseRange(observer, "tremorsense")) || within(detectionRange(observerToken, ["feelTremor"])))) return true;
  if (invisible && !hasStatus(observer, "blinded")) {
    if (within(senseRange(observer, "truesight")) || within(detectionRange(observerToken, ["seeAll", "seeInvisibility", "senseInvisibility"]))) return true;
  }
  return false;
}

/**
 * Can the observer see a creature on the Ethereal Plane? Only from the Ethereal Plane itself, or
 * with Truesight or See Invisibility (or a similar detection mode) in range.
 */
function seesEthereal(observer, observerToken, subjectToken) {
  if (hasStatus(observer, "ethereal")) return true;
  if (hasStatus(observer, "blinded")) return false;
  const d = tokenDistance(observerToken, subjectToken) ?? Infinity;
  const within = range => range > 0 && d <= range;
  return within(senseRange(observer, "truesight")) || within(detectionRange(observerToken, ["seeAll", "seeInvisibility", "senseInvisibility"]));
}

/** Can the observer see the subject, as far as conditions and senses go? */
function canSeeCreature(observer, observerToken, subject, subjectToken) {
  if (hasStatus(subject, "ethereal") && !seesEthereal(observer, observerToken, subjectToken)) return false;
  const blind = hasStatus(observer, "blinded");
  const invisible = hasStatus(subject, "invisible");
  if (!blind && !invisible) return true;
  return perceivesWithoutSight(observer, observerToken, subject, subjectToken, { invisible: invisible && !blind });
}

/** dnd5e's own condition sets (e.g. Poisoned, Exhaustion 3 under the 2014 rules), with the statuses that trigger them. */
function dnd5eConditionReasons(actor, key) {
  if (typeof actor?.hasConditionEffect !== "function" || !actor.hasConditionEffect(key)) return [];
  const reasons = [];
  for (const prop of CONFIG.DND5E?.conditionEffects?.[key] ?? []) {
    const [status] = String(prop).split("-");
    if (hasStatus(actor, status)) reasons.push(statusDisplayName(status));
  }
  return reasons.length ? reasons : [statusDisplayName(key)];
}

/** The creature behind one of this creature's conditions (e.g. its grappler or charmer), from the effect's origin. */
function conditionSource(actor, status) {
  for (const effect of actor?.effects ?? []) {
    if (effect.disabled || effect.active === false || !effect.statuses?.has?.(status) || !effect.origin) continue;
    try {
      const origin = typeof fromUuidSync === "function" ? fromUuidSync(effect.origin, { strict: false }) : null;
      const source = origin?.documentName === "Actor" ? origin : (origin?.actor ?? origin?.parent?.actor ?? null);
      if (source) return source;
    } catch { /* unknown origin */ }
  }
  return null;
}

const sameActor = (a, b) => !!a && !!b && (a === b || (a.uuid && a.uuid === b.uuid));

/** Why an attack roll has Advantage or Disadvantage, from the attacker's and the target's conditions. */
function attackModifiers(attacker, attackerToken, target, targetToken, ability) {
  const adv = new Set(), dis = new Set();
  const name = statusDisplayName;
  const versus = id => loc("MIGHTYGUARD.Rolls.Target").replace("{status}", name(id));

  // The attacker's own conditions
  for (const id of COND_RULES.ownAttackDisadvantage) if (hasStatus(attacker, id)) dis.add(name(id));
  dnd5eConditionReasons(attacker, "attackDisadvantage").forEach(r => dis.add(r));
  if (CONFIG.DND5E?.abilities?.[ability]?.type === "physical") dnd5eConditionReasons(attacker, "physicalAttackDisadvantage").forEach(r => dis.add(r));
  for (const [id, abilities] of Object.entries(COND_RULES.abilityDisadvantage)) {
    if (hasStatus(attacker, id) && abilities.includes(ability)) dis.add(name(id));
  }
  if (hasStatus(attacker, "blinded") && !(target && perceivesWithoutSight(attacker, attackerToken, target, targetToken))) dis.add(name("blinded"));
  for (const id of COND_RULES.hidden) {
    if (hasStatus(attacker, id) && !(target && canSeeCreature(target, targetToken, attacker, attackerToken))) adv.add(name(id));
  }
  if (hasStatus(attacker, "grappled") && target) {
    const grappler = conditionSource(attacker, "grappled");
    if (grappler && !sameActor(grappler, target)) dis.add(name("grappled"));
  }
  if (!target) return { adv, dis };

  // The target's conditions
  for (const id of COND_RULES.targetGrantsAdvantage) if (hasStatus(target, id)) adv.add(versus(id));
  if (hasStatus(target, "blinded") && !perceivesWithoutSight(target, targetToken, attacker, attackerToken)) adv.add(versus("blinded"));
  for (const id of COND_RULES.hidden) {
    if (hasStatus(target, id) && !canSeeCreature(attacker, attackerToken, target, targetToken)) dis.add(versus(id));
  }
  if (hasStatus(target, "prone")) {
    const d = tokenDistance(attackerToken, targetToken);
    if (d !== null) (d <= 5 ? adv : dis).add(versus("prone"));
  }
  if (dodgeActive(target) && canSeeCreature(target, targetToken, attacker, attackerToken)) dis.add(versus("dodging"));
  return { adv, dis };
}

// Strength and Dexterity saving throws fail automatically; hits from within 5 ft are Critical Hits
const AUTO_FAIL_STATUSES = ["paralyzed", "petrified", "stunned", "unconscious"];
const AUTO_FAIL_ABILITIES = ["str", "dex"];
const CRIT_WITHIN_5FT_STATUSES = ["paralyzed", "unconscious"];
const CRIT_ANY_RANGE_STATUSES = ["helpless"];   // Monsters of Drakkenheim: any hit against you is a Critical Hit

/** The conditions that make this saving throw fail automatically. */
function autoFailReasons(actor, ability) {
  if (!AUTO_FAIL_ABILITIES.includes(ability)) return [];
  return AUTO_FAIL_STATUSES.filter(id => hasStatus(actor, id)).map(statusDisplayName);
}

/** The target's conditions that turn a hit from this attacker into a Critical Hit. */
function autoCritReasons(attackerToken, target, targetToken) {
  if (!target) return [];
  const reasons = CRIT_ANY_RANGE_STATUSES.filter(id => hasStatus(target, id));
  const d = tokenDistance(attackerToken, targetToken);
  if (d !== null && d <= 5) reasons.push(...CRIT_WITHIN_5FT_STATUSES.filter(id => hasStatus(target, id)));
  return reasons.map(id => loc("MIGHTYGUARD.Rolls.Target").replace("{status}", statusDisplayName(id)));
}

function appendFlavor(message, note) {
  const data = message?.data;
  if (!note || !data || typeof data !== "object") return;
  data.flavor = data.flavor ? `${data.flavor} (${note})` : note;
}

/**
 * Once a roll's dice are rolled: an automatic failure totals −1 (whatever was rolled), a
 * desperation attack hits and its damage is raised (09-desperation.js), and an attack marked
 * "critical on a hit" that hits (meets the target's AC, and isn't a natural 1) becomes a Critical
 * Hit, so its damage is rolled as critical.
 */
function afterRollEvaluated(roll) {
  try {
    const o = roll?.options;
    if (!o || !roll._evaluated) return;
    if (o.mgAutoFail && roll._total !== -1) roll._total = -1;
    if (o.mgDesperationCheck || o.mgDesperation) desperationAfterRoll(roll);
    if (o.mgDesperateDamage && !roll._mgDesperateDamage) { roll._mgDesperateDamage = true; boostDesperateDamage(roll); }
    if (o.mgHalfDamage && !roll._mgHalved) { roll._mgHalved = true; halveDamageRoll(roll); }
    const crit = o.mgCritOnHit;
    if (crit && !roll.isCritical) {
      const d20 = roll.d20, natural = Number(d20?.total);
      if (Number.isFinite(natural) && natural > 1 && Number.isFinite(Number(crit.ac)) && roll.total >= Number(crit.ac)) {
        o.criticalSuccess = Math.min(Number(o.criticalSuccess) || 20, natural);
        if (d20.options) d20.options.criticalSuccess = o.criticalSuccess;
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not finish a roll's automatic result`, err);
  }
}

/** Why a saving throw has Disadvantage (the ones dnd5e doesn't handle itself). */
function saveModifiers(actor, ability) {
  const adv = new Set(), dis = new Set();
  const physical = CONFIG.DND5E?.abilities?.[ability]?.type === "physical" || ["str", "dex", "con"].includes(ability);
  // The rules dnd5e prepares itself are applied here as well, so they hold even if they don't reach the roll
  if (ability === "dex") {
    if (dodgeActive(actor)) adv.add(statusDisplayName("dodging"));
    if (hasStatus(actor, HASTE_ID)) adv.add(statusDisplayName(HASTE_ID));
    if (hasStatus(actor, "restrained")) dis.add(statusDisplayName("restrained"));
    dnd5eConditionReasons(actor, "dexteritySaveAdvantage").forEach(r => adv.add(r));
    dnd5eConditionReasons(actor, "dexteritySaveDisadvantage").forEach(r => dis.add(r));
  }
  dnd5eConditionReasons(actor, "abilitySaveDisadvantage").forEach(r => dis.add(r));
  if (physical) dnd5eConditionReasons(actor, "physicalSaveDisadvantage").forEach(r => dis.add(r));
  for (const [id, abilities] of Object.entries({ ...COND_RULES.abilityDisadvantage, ...COND_RULES.saveDisadvantage })) {
    if (hasStatus(actor, id) && abilities.includes(ability)) dis.add(statusDisplayName(id));
  }
  return { adv, dis };
}

/** Why an ability check (or initiative) has Advantage or Disadvantage. */
function checkModifiers(actor, ability, initiative, target = null) {
  const adv = new Set(), dis = new Set();
  // The charmer has Advantage on Charisma checks to deal with the creature it has Charmed
  if (target && ability === "cha" && hasStatus(target, "charmed") && sameActor(conditionSource(target, "charmed"), actor)) {
    adv.add(loc("MIGHTYGUARD.Rolls.Target").replace("{status}", statusDisplayName("charmed")));
  }
  if (hasStatus(actor, "frightened")) dis.add(statusDisplayName("frightened"));
  if (hasStatus(actor, "poisoned")) dis.add(statusDisplayName("poisoned"));
  const physical = CONFIG.DND5E?.abilities?.[ability]?.type === "physical" || ["str", "dex", "con"].includes(ability);
  // The rules dnd5e prepares itself are applied here as well, so they hold even if they don't reach the roll
  dnd5eConditionReasons(actor, "abilityCheckDisadvantage").forEach(r => dis.add(r));
  if (physical) dnd5eConditionReasons(actor, "physicalCheckDisadvantage").forEach(r => dis.add(r));
  if (initiative) {
    dnd5eConditionReasons(actor, "initiativeAdvantage").forEach(r => adv.add(r));
    dnd5eConditionReasons(actor, "initiativeDisadvantage").forEach(r => dis.add(r));
  }
  for (const [id, abilities] of Object.entries(COND_RULES.abilityDisadvantage)) {
    if (hasStatus(actor, id) && abilities.includes(ability)) dis.add(statusDisplayName(id));
  }
  return { adv, dis };
}

/*
 * The roll window's highlighted button is what Enter (or a quick click) rolls, and it can be picked
 * before this module adds its conditions: Midi-QOL sets it from its own Advantage flags on an earlier
 * hook, so a Sickened Constitution save showed "Normal" and rolled without Disadvantage. Once the
 * conditions are in, the default button is set again from everything the roll now has.
 */
function syncDialogDefault(config, dialog) {
  if (!dialog || typeof dialog !== "object") return;
  try {
    const first = config.rolls?.[0]?.options ?? {};
    const adv = !!(first.advantage || config.advantage), dis = !!(first.disadvantage || config.disadvantage);
    const button = adv && !dis ? "advantage" : (dis && !adv ? "disadvantage" : "normal");
    dialog.options ??= {};
    dialog.options.defaultButton = button;
    const modes = CONFIG.Dice?.D20Roll?.ADV_MODE;
    if (modes && dialog.options.advantageMode !== undefined) dialog.options.advantageMode = modes[button.toUpperCase()];
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not set the roll window's default button`, err);
  }
}

/** Put Advantage / Disadvantage on a pending dnd5e roll and say why in its chat message. */
function applyRollModifiers(config, message, { adv, dis }, dialog = null) {
  if (!adv.size && !dis.size) return false;
  for (const roll of config.rolls ?? []) {
    roll.options ??= {};
    if (adv.size) roll.options.advantage = true;
    if (dis.size) roll.options.disadvantage = true;
  }
  if (adv.size) config.advantage = true;
  if (dis.size) config.disadvantage = true;
  syncDialogDefault(config, dialog);
  const parts = [];
  if (adv.size) parts.push(`${loc("MIGHTYGUARD.Rolls.Advantage")}: ${[...adv].join(", ")}`);
  if (dis.size) parts.push(`${loc("MIGHTYGUARD.Rolls.Disadvantage")}: ${[...dis].join(", ")}`);
  appendFlavor(message, parts.join("; "));
  return true;
}

function conditionRollsEnabled() {
  try { return game.system?.id === "dnd5e" && game.settings.get(MODULE_ID, "conditionRolls"); }
  catch { return false; }
}

function attackRollConditions(config, message, dialog) {
  const activity = config.subject;
  const attacker = activity?.actor ?? activity?.item?.actor;
  if (!attacker) return;
  const targets = [...(game.user?.targets ?? [])].filter(t => t.actor);
  const targetToken = targets.length === 1 ? targets[0] : null;   // several targets: only the attacker's own conditions
  const ability = config.ability ?? config.rolls?.[0]?.options?.ability ?? activity?.ability;
  const attackerToken = tokenForActor(attacker), target = targetToken?.actor ?? null;
  applyRollModifiers(config, message, attackModifiers(attacker, attackerToken, target, targetToken, ability), dialog);
  applyConditionDice(attacker, config, message);
  const crit = autoCritReasons(attackerToken, target, targetToken);
  // Frozen (Monsters of Drakkenheim): Helpless against bludgeoning weapon attacks
  if (target && hasStatus(target, "frozen") && !hasStatus(target, "helpless") && bludgeoningWeaponAttack(activity)) {
    crit.push(loc("MIGHTYGUARD.Rolls.Target").replace("{status}", statusDisplayName("frozen")));
  }
  const ac = Number(target?.system?.attributes?.ac?.value);
  if (crit.length && Number.isFinite(ac)) {
    for (const roll of config.rolls ?? []) { roll.options ??= {}; roll.options.mgCritOnHit = { ac }; }
    appendFlavor(message, `${loc("MIGHTYGUARD.Rolls.CritOnHit")}: ${crit.join(", ")}`);
  }
}

function savingThrowConditions(config, message, dialog) {
  const actor = config.subject;
  if (actor?.documentName !== "Actor") return;
  const fails = autoFailReasons(actor, config.ability);
  if (fails.length) {
    for (const roll of config.rolls ?? []) { roll.options ??= {}; roll.options.mgAutoFail = true; }
    appendFlavor(message, `${loc("MIGHTYGUARD.Rolls.AutoFail")}: ${fails.join(", ")}`);
    return;
  }
  applyRollModifiers(config, message, saveModifiers(actor, config.ability), dialog);
  applyConditionDice(actor, config, message);
}

function abilityCheckConditions(config, message, hookNames, dialog) {
  const actor = config.subject;
  if (actor?.documentName !== "Actor") return;
  const initiative = hookNames.includes("initiativedialog");
  const ability = config.ability ?? config.rolls?.[0]?.data?.abilityId
    ?? (initiative ? (actor.system?.attributes?.init?.ability || "dex") : undefined);
  const targets = [...(game.user?.targets ?? [])].filter(t => t.actor && t.actor !== actor);
  applyRollModifiers(config, message, checkModifiers(actor, ability, initiative, targets.length === 1 ? targets[0].actor : null), dialog);
}

/*
 * dnd5e calls a chain of pre-roll hooks for each roll (e.g. preRollSkillV2, preRollAbilityCheckV2,
 * preRollD20TestV2) and ends with the generic dnd5e.preRollV2. Applying the conditions there,
 * last, means another module's own advantage handling on the specific hooks can't clear them.
 */
Hooks.on("dnd5e.preRollV2", (config, dialog, message) => {
  if (!conditionRollsEnabled()) return;
  const hookNames = (config?.hookNames ?? []).map(h => String(h).toLowerCase());
  try {
    if (hookNames.includes("attack")) attackRollConditions(config, message, dialog);
    else if (hookNames.includes("damage")) damageRollConditions(config, message);
    else if (hookNames.includes("savingthrow")) savingThrowConditions(config, message, dialog);
    else if (hookNames.includes("abilitycheck")) abilityCheckConditions(config, message, hookNames, dialog);
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not apply conditions to the roll`, err);
  }
});

