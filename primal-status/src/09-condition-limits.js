/* -------------------------------------------- */
/*  Monsters of Drakkenheim: Bewildered,         */
/*  Distracted, Staggered, Drakkenheim Madness   */
/* -------------------------------------------- */

/*
 * What these conditions forbid is checked when a creature uses something (dnd5e's
 * dnd5e.preUseActivity, before anything is spent or rolled):
 *   Bewildered: no spells, except cantrips with a casting time of an action.
 *   Distracted: no Reactions (anything used as a Reaction). Midi-QOL also offers it none, through
 *     the status's own change (see drakkenheimChanges).
 *   Staggered: one weapon attack during its own turn. The first weapon attack it rolls on its turn
 *     is noted on the Staggered effect, so every client knows; Primal Combat's side initiative
 *     counts the whole side's turn as each member's own.
 * A player who tries is told why, and nothing happens. The GM is told why and asked whether to go
 * ahead anyway (the GM makes the rulings). The GM can turn all of this off in Module Settings.
 *
 * Drakkenheim Madness: when a creature gains it, 1d10 picks its trait. The trait is written on the
 * effect (the status pane shows it) and whispered to the GM and the creature's owners.
 */
const LIMIT_PATTERNS = {
  bewildered: /(^|[^a-z])bewildered$/i,
  distracted: /(^|[^a-z])distracted$/i,
  staggered: /(^|[^a-z])staggered$/i
};
const MADNESS_ID = "drakkenheimMadness";
const MADNESS_TRAITS = 10;
const limitBypass = new Set();   // "actor uuid|activity id" the GM let through once

function drakkenheimAutomation() {
  try { return !!game.settings.get(MODULE_ID, "drakkenheimAutomation"); } catch { return false; }
}


/** Is it this creature's own turn in the current combat (its side's turn, in Primal Combat)? The turn's key, or null. */
function ownTurnKey(actor) {
  const combat = game.combat;
  if (!actor || !combat?.started || !combat.combatant) return null;
  let acting = [];
  try { acting = turnStartCombatants(combat); } catch { acting = [combat.combatant]; }
  if (!acting.some(c => sameActor(c?.actor, actor))) return null;
  return `${combat.id}:${combat.round}:${combat.turn}`;
}

/** A spell this activity casts: its level and casting time, or null if it isn't a spell. */
function activitySpell(activity) {
  const item = activity?.item;
  if (item?.type !== "spell") return null;
  return { level: Number(item.system?.level) || 0, activation: activity.activation?.type ?? item.system?.activation?.type ?? "" };
}

/** A weapon attack (with a weapon or unarmed, not a spell attack)? */
function isWeaponAttack(activity) {
  return activity?.type === "attack" && (activity.attack?.type?.classification ?? "weapon") !== "spell";
}

/** The creature's own Staggered effects. */
function staggeredEffects(actor) {
  return ownEffects(actor).filter(e => !e.disabled && [...(e.statuses ?? [])].some(s => typeof s === "string" && LIMIT_PATTERNS.staggered.test(s)));
}

/** Has the Staggered creature already made a weapon attack this turn (noted on its Staggered effect)? */
function staggeredAttackMade(actor, turn) {
  return staggeredEffects(actor).some(e => moduleFlag(e, "attackedTurn") === turn);
}

/**
 * Why this creature can't use this, as a sentence for the notification, or null if it can. Checked
 * in the order the book lists them; the first reason found is given.
 */
function activityLimit(actor, activity) {
  if (!actor || !activity) return null;
  const name = actor.name ?? "";
  const label = activity.item?.name ?? activity.name ?? "";
  const say = (key, extra = {}) => Object.entries({ name, item: label, ...extra }).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), loc(key));
  const spell = activitySpell(activity);
  if (spell && hasStatusMatching(actor, LIMIT_PATTERNS.bewildered) && !(spell.level === 0 && spell.activation === "action")) {
    return say("MIGHTYGUARD.Limits.Bewildered");
  }
  if ((activity.activation?.type ?? "") === "reaction" && hasStatusMatching(actor, LIMIT_PATTERNS.distracted)) {
    return say("MIGHTYGUARD.Limits.Distracted");
  }
  if (isWeaponAttack(activity) && hasStatusMatching(actor, LIMIT_PATTERNS.staggered)) {
    const turn = ownTurnKey(actor);
    if (turn && staggeredAttackMade(actor, turn)) return say("MIGHTYGUARD.Limits.Staggered");
  }
  return null;
}

/** The activity as the creature has it (Midi-QOL hands the hook a copy of the item). */
function ownedActivity(actor, activity) {
  try { return actor?.items?.get?.(activity?.item?.id)?.system?.activities?.get?.(activity.id) ?? activity; }
  catch { return activity; }
}

/** The GM is asked whether to go ahead anyway; yes uses it again, let through this once. */
async function offerLimitOverride(actor, activity, reason) {
  const dialog = foundry.applications?.api?.DialogV2;
  if (typeof dialog?.confirm !== "function") return false;
  let go = false;
  try {
    go = await dialog.confirm({
      window: { title: loc("MIGHTYGUARD.Limits.Title") },
      content: `<p>${escapeHTML(reason)}</p><p>${escapeHTML(loc("MIGHTYGUARD.Limits.Anyway"))}</p>`
    });
  } catch { go = false; }
  if (!go) return false;
  const real = ownedActivity(actor, activity);
  limitBypass.add(`${actor.uuid}|${real.id}`);
  try { await real.use?.(); }
  catch (err) { console.warn(`${MODULE_ID} | Could not use it after all`, err); }
  finally { limitBypass.delete(`${actor.uuid}|${real.id}`); }
  return true;
}

Hooks.on("dnd5e.preUseActivity", (activity, usageConfig) => {
  try {
    if (!drakkenheimAutomation()) return true;
    const actor = activity?.actor ?? activity?.item?.actor;
    if (!actor) return true;
    if (limitBypass.delete(`${actor.uuid}|${activity.id}`)) return true;         // the GM said go ahead
    const reason = activityLimit(actor, activity);
    if (!reason) return true;
    globalThis.ui?.notifications?.warn?.(reason);
    if (game.user?.isGM) offerLimitOverride(actor, activity, reason);
    return false;
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not check Bewildered, Distracted or Staggered`, err);
    return true;
  }
});

// Staggered: note its first weapon attack on its turn, on the Staggered effect itself (once per turn)
Hooks.on("dnd5e.rollAttackV2", (rolls, data) => {
  try {
    const activity = data?.subject;
    const actor = activity?.actor ?? activity?.item?.actor;
    if (!drakkenheimAutomation() || !isWeaponAttack(activity) || !hasStatusMatching(actor, LIMIT_PATTERNS.staggered)) return;
    const turn = ownTurnKey(actor);
    if (!turn) return;
    for (const effect of staggeredEffects(actor)) {
      if (moduleFlag(effect, "attackedTurn") === turn || effect.isOwner === false) continue;
      effect.update?.({ [`flags.${MODULE_ID}.attackedTurn`]: turn })?.catch?.(err => console.warn(`${MODULE_ID} | Could not note Staggered's attack`, err));
    }
  } catch (err) { console.warn(`${MODULE_ID} | Could not note Staggered's attack`, err); }
});

/* ---------- Drakkenheim Madness: a trait, rolled when it starts ---------- */

/** Roll the creature's madness trait, write it on the effect and whisper it to the GM and the creature's owners. */
async function rollMadnessTrait(actor, effect) {
  const roll = await new Roll(`1d${MADNESS_TRAITS}`).evaluate();
  const n = Math.min(MADNESS_TRAITS, Math.max(1, Math.round(Number(roll.total) || 1)));
  const trait = loc(`MIGHTYGUARD.Madness.Trait${n}`);
  const text = `<p><strong>${escapeHTML(loc("MIGHTYGUARD.Madness.Trait"))} ${n}:</strong> ${escapeHTML(trait)}</p>`;
  try { await effect.update?.({ [`flags.${MODULE_ID}.madnessTrait`]: n, description: text }); }
  catch (err) { console.warn(`${MODULE_ID} | Could not write the madness trait on the effect`, err); }
  try {
    const all = game.users?.contents ?? (typeof game.users?.[Symbol.iterator] === "function" ? [...game.users] : []);
    const users = all.filter(u => u?.isGM || actor.testUserPermission?.(u, "OWNER"));
    const speaker = globalThis.ChatMessage?.getSpeaker?.({ actor }) ?? {};
    const flavor = loc("MIGHTYGUARD.Madness.Flavor").replace("{name}", actor.name ?? "").replace("{trait}", trait);
    await roll.toMessage?.({ speaker, flavor: `${statusDisplayName(MADNESS_ID)}: ${flavor}`, whisper: users.map(u => u.id) });
  } catch (err) { console.warn(`${MODULE_ID} | Could not post the madness trait`, err); }
  return { n, trait };
}

Hooks.on("createActiveEffect", (effect, options, userId) => {
  if (!drakkenheimAutomation() || !isAutomationClient(userId)) return;
  const actor = effect?.parent;
  if (!actor || actor.documentName !== "Actor" || !effect.statuses?.has?.(MADNESS_ID) || moduleFlag(effect, "madnessTrait")) return;
  rollMadnessTrait(actor, effect).catch(err => console.warn(`${MODULE_ID} | Could not roll a madness trait`, err));
});
