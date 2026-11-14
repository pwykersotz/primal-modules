/* -------------------------------------------- */
/*  Automation: Dodging ends, Dead at 3 failures */
/* -------------------------------------------- */

/**
 * Changes to creatures are made by one client only: the active GM's (or, with no GM connected,
 * the user who made the change), so they never happen twice.
 */
function isAutomationClient(userId) {
  const gm = game.users?.activeGM;
  if (gm) return gm.isSelf ?? gm.id === game.user?.id;
  return !userId || userId === game.user?.id;
}

function automationSetting(key) {
  try { return !!game.settings.get(MODULE_ID, key); } catch { return false; }
}

const DODGING_PATTERN = /(^|[^a-z])dodg(e|ing)$/i;
const isDodgingEffect = effect => !effect?.disabled && [...(effect?.statuses ?? [])].some(s => typeof s === "string" && DODGING_PATTERN.test(s));

/** The creature's own effects (not ones its items carry). */
function ownEffects(actor) {
  const list = actor?.effects;
  if (!list) return [];
  return Array.isArray(list) ? list : [...(list.contents ?? list)];
}

/** Is this the creature's Dodging, in a fight where it will end at the start of the creature's next turn? */
function endsAtNextTurn(effect) {
  if (!isDodgingEffect(effect) || !automationSetting("dodgeExpiry")) return false;
  const actor = effect.parent?.documentName === "Item" ? null : effect.parent;
  const combat = game.combat;
  if (!actor || !combat?.started) return false;
  const combatants = combat.combatants?.contents ?? [...(combat.combatants ?? [])];
  return combatants.some(c => c?.actor === actor || (c?.actor?.uuid && c.actor.uuid === actor.uuid));
}

/* ---------- Dodging: until the start of your next turn ---------- */

/** Did the combat move forward to a new turn (not back, and not just a change of order)? */
function combatMovedForward(combat, change, options) {
  if (!("turn" in (change ?? {})) && !("round" in (change ?? {}))) return false;
  if (Number.isFinite(options?.direction)) return options.direction > 0;
  const prev = combat.previous ?? {}, cur = combat.current ?? { round: combat.round, turn: combat.turn };
  if (!Number.isFinite(prev.round)) return true;
  return cur.round > prev.round || (cur.round === prev.round && (cur.turn ?? 0) > (prev.turn ?? 0));
}

/* ---------- Whose turn starts: one creature, or a whole side (Primal Combat) ---------- */

/** Primal Combat's API, when that module is on. */
function primalCombatApi() {
  const mod = game.modules?.get?.("primal-combat");
  return mod?.active ? (mod.api ?? null) : null;
}

/** Does this combat use Primal Combat's side initiative (the whole side acts together)? */
function isSideInitiative(combat) {
  const api = primalCombatApi();
  try { return typeof api?.getMode === "function" && typeof api.getSide === "function" && api.getMode(combat) === "side"; }
  catch { return false; }
}

/**
 * The creatures whose turn starts now. Usually just the current combatant. In Primal Combat's side
 * initiative the combat's turn points at the first creature of the acting side, but the whole side
 * acts together, so it's everyone acting: the whole side, except in round 1's opening turn, which
 * is only the party members ahead of the enemies (the ones who beat them). This follows Primal
 * Combat's own rule, and uses its list when it offers one.
 */
function turnStartCombatants(combat) {
  const current = combat?.combatant;
  if (!current) return [];
  if (!isSideInitiative(combat)) return [current];
  const api = primalCombatApi();
  try {
    if (typeof api.getActingMembers === "function") return [...api.getActingMembers(combat)];
    const turns = [...(combat.turns ?? [])], side = api.getSide(current);
    const opening = combat.round === 1 && side === "party" && turns.slice((combat.turn ?? 0) + 1).some(c => api.getSide(c) === "enemies");
    if (opening) {
      const firstEnemy = turns.findIndex(c => api.getSide(c) === "enemies");
      return turns.slice(0, firstEnemy).filter(c => api.getSide(c) === "party");
    }
    return turns.filter(c => api.getSide(c) === side);
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not read Primal Combat's acting side`, err);
    return [current];
  }
}

/**
 * The creatures whose turn has just ended, given the turn before the change ({round, turn,
 * combatantId}, as Foundry reports it): the creature that was acting, or in Primal Combat's side
 * initiative everyone who was acting with it. Worked out from the combat as it was then.
 */
function turnEndCombatants(combat, prior) {
  if (!combat || !prior || !(Number(prior.round) >= 1)) return [];         // round 0: the combat hadn't started
  const turns = [...(combat.turns ?? [])];
  const lead = (prior.combatantId && (combat.combatants?.get?.(prior.combatantId) ?? turns.find(c => c?.id === prior.combatantId)))
    || turns[Number(prior.turn) || 0] || null;
  if (!lead) return [];
  if (!isSideInitiative(combat)) return [lead];
  // Primal Combat's turn signal says who ended the turn the combat just left, as it saw them start
  const api = primalCombatApi();
  const previous = combat.previous;
  if (typeof api?.getTurnEnders === "function" && previous
    && Number(previous.round) === Number(prior.round) && (Number(previous.turn) || 0) === (Number(prior.turn) || 0)) {
    try {
      const ended = [...api.getTurnEnders(combat)];
      if (ended.length) return ended.includes(lead) ? ended : [lead, ...ended];
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not read Primal Combat's turn signal`, err);
    }
  }
  try {
    // The combat as it stood: the same combat, pointing at that turn
    const then = Object.create(combat, {
      combatant: { value: lead }, round: { value: Number(prior.round) }, turn: { value: Number(prior.turn) || 0 }, started: { value: true }
    });
    const acting = turnStartCombatants(then);
    return acting.length ? acting : [lead];
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not work out whose turn ended`, err);
    return [lead];
  }
}

/** At the start of a creature's turn, its Dodging from an earlier turn ends. */
async function endDodgingAtTurnStart(combatant) {
  const actor = combatant?.actor;
  if (!actor) return;
  const ids = ownEffects(actor).filter(isDodgingEffect).map(e => e.id).filter(Boolean);
  if (!ids.length) return;
  try { await actor.deleteEmbeddedDocuments("ActiveEffect", ids); }
  catch (err) { console.warn(`${MODULE_ID} | Could not end Dodging`, err); }
}

Hooks.on("updateCombat", (combat, change, options, userId) => {
  if (!automationSetting("dodgeExpiry") || !combat?.started || !isAutomationClient(userId)) return;
  if (!combatMovedForward(combat, change, options)) return;
  for (const combatant of turnStartCombatants(combat)) endDodgingAtTurnStart(combatant);
});

/* ---------- Three failed death saves (or a monster at 0 HP): Dead ---------- */

const DEFEATED_ID = () => CONFIG.specialStatusEffects?.DEFEATED ?? "dead";

async function markDead(actor) {
  const id = DEFEATED_ID();
  if (actor.statuses?.has?.(id)) return;
  try {
    await actor.toggleStatusEffect?.(id, { active: true, overlay: true });
    await actor.setFlag?.(MODULE_ID, "autoDead", true);
  } catch (err) { console.warn(`${MODULE_ID} | Could not mark the creature Dead`, err); }
}

/** The Dead this module applied comes off again if the failures are corrected (still at 0 HP). */
async function unmarkDead(actor) {
  try {
    await actor.toggleStatusEffect?.(DEFEATED_ID(), { active: false });
    await forgetAutoDead(actor);
  } catch (err) { console.warn(`${MODULE_ID} | Could not remove Dead`, err); }
}

/** Clear the note that this module applied Dead (also one kept under the old module ID). */
async function forgetAutoDead(actor) {
  if (actor?.flags?.[MODULE_ID]?.autoDead !== undefined) await actor.unsetFlag?.(MODULE_ID, "autoDead");
  for (const id of LEGACY_MODULE_IDS) {
    if (actor?.flags?.[id]?.autoDead !== undefined) await actor.update?.({ [`flags.${id}.-=autoDead`]: null });
  }
}

Hooks.on("updateActor", (actor, change, options, userId) => {
  if (!automationSetting("autoDead") || !isAutomationClient(userId)) return;
  const get = foundry.utils?.getProperty;
  if (typeof get !== "function") return;
  // Monsters die at 0 Hit Points (no death saves); brought back above 0 (damage undone, healed), the
  // Dead this module applied comes off again
  if (isMonster(actor) && get(change, "system.attributes.hp.value") !== undefined) {
    const hp = Number(actor.system?.attributes?.hp?.value), max = Number(actor.system?.attributes?.hp?.max);
    const dead = !!actor.statuses?.has?.(DEFEATED_ID());
    if (hp <= 0 && max > 0) { if (!dead) markDead(actor); }
    else if (hp > 0 && dead && moduleFlag(actor, "autoDead")) unmarkDead(actor);
    return;
  }
  if (get(change, "system.attributes.death.failure") === undefined) return;
  const attrs = actor?.system?.attributes;
  const failures = Number(attrs?.death?.failure) || 0;
  const hp = Number(attrs?.hp?.value), max = Number(attrs?.hp?.max);
  const dead = !!actor.statuses?.has?.(DEFEATED_ID());
  if (failures >= 3 && hp <= 0 && max > 0) { if (!dead) markDead(actor); }
  else if (failures < 3 && hp <= 0 && dead && moduleFlag(actor, "autoDead")) unmarkDead(actor);
});

// Dead removed by hand: forget that this module applied it
Hooks.on("deleteActiveEffect", (effect, options, userId) => {
  const actor = effect?.parent;
  if (!actor || actor.documentName === "Item" || !isAutomationClient(userId)) return;
  if (!effect.statuses?.has?.(DEFEATED_ID()) || !moduleFlag(actor, "autoDead")) return;
  forgetAutoDead(actor).catch?.(() => {});
});

/* ---------- When combat ends: short effects a successful save would end ---------- */

/*
 * An effect that lasts 1 minute or less and ends on a successful saving throw (the creature repeats
 * the save at the end of each of its turns, and so on) is removed from every creature in the fight
 * when the combat ends. "Ends on a save" is read from Midi-QOL's OverTime saves, DAE's "save"
 * special durations, and the effect's own text or its item's description ("…repeats the save,
 * ending the effect on itself on a success", "On a successful save, the spell ends", "(save ends)").
 */
const SAVE_ENDS_TEXT = [
  /\b(repeats?|repeating|another|again|makes?|attempts?|rolls?)\b[^.]{0,60}\b(save|saves|saving throws?)\b[^.]{0,80}\b(end|ends|ending)\b[^.]{0,60}\bsuccess/i,
  /\bon a success(ful (save|saving throw))?\b[^.]{0,60}\b(ends?|ending)\b/i,
  /\b(ends?|ending)\b[^.]{0,40}\bon a successful (save|saving throw)\b/i,
  /\(\s*save ends\s*\)/i
];

/** The effect's changes (Foundry 14 keeps them in system.changes, earlier versions in changes). */
function effectChangeList(effect) {
  const list = [];
  for (const source of [effect?.system?.changes, effect?.changes]) if (Array.isArray(source)) list.push(...source);
  return list;
}

/** The item (or other document) an effect came from, if it can be found. */
function effectOriginDocument(effect) {
  if (typeof fromUuidSync !== "function") return null;
  const o = effect?.system?.origin ?? {};
  for (const uuid of [o.item, o.activity, effect?.origin]) {
    if (typeof uuid !== "string" || !uuid) continue;
    try {
      const doc = fromUuidSync(uuid, { strict: false });
      if (doc) return doc.documentName === "Item" || !doc.item ? doc : doc.item;
    } catch { /* not available */ }
  }
  return null;
}

const plainText = html => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

/** Does this effect end on a successful saving throw? */
function effectEndsOnSave(effect) {
  if (!effect) return false;
  // Midi-QOL: an OverTime save that removes the effect
  for (const change of effectChangeList(effect)) {
    const value = String(change?.value ?? "");
    if (/overtime/i.test(String(change?.key ?? "")) && /\bsave(dc|ability)\s*=/i.test(value) && !/\bsaveremove\s*=\s*false\b/i.test(value)) return true;
  }
  // DAE: removed when the creature makes (or succeeds on) a save
  const special = effect.flags?.dae?.specialDuration;
  if (Array.isArray(special) && special.some(s => /^isSave(?!Failure)/i.test(String(s)))) return true;
  // The rules text: the effect's own, then its item's
  const texts = [effect.description];
  const origin = effectOriginDocument(effect);
  if (origin) texts.push(origin.system?.description?.value, origin.description);
  return texts.some(t => { const text = plainText(t); return !!text.trim() && SAVE_ENDS_TEXT.some(re => re.test(text)); });
}

const TIME_UNIT_SECONDS = { second: 1, seconds: 1, round: 6, rounds: 6, turn: 6, turns: 6, minute: 60, minutes: 60, hour: 3600, hours: 3600,
  day: 86400, days: 86400, week: 604800, weeks: 604800, month: 2629800, months: 2629800, year: 31557600, years: 31557600 };

/** How long an effect lasts in all, in seconds (a round is 6 seconds), or null if it doesn't say. */
function effectTotalSeconds(effect) {
  const d = effect?.duration ?? {};
  const roundSeconds = Number(CONFIG?.time?.roundTime) || 6;
  const per = unit => (/^(round|turn)s?$/.test(unit) ? roundSeconds : TIME_UNIT_SECONDS[unit]);
  // Foundry 14: a value and its units
  const value = Number(d.value);
  if (typeof d.units === "string" && Number.isFinite(value) && value > 0 && per(d.units)) return value * per(d.units);
  // Foundry 12 and 13: seconds, rounds and turns
  const seconds = Number(d.seconds), rounds = Number(d.rounds) || 0, turns = Number(d.turns) || 0;
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  if (rounds > 0 || turns > 0) return (rounds + turns) * roundSeconds;
  // No duration of its own: its item's (dnd5e: system.duration, e.g. 1 minute)
  const itemDuration = effectOriginDocument(effect)?.system?.duration;
  const itemValue = Number(itemDuration?.value);
  if (itemDuration && Number.isFinite(itemValue) && itemValue > 0 && per(itemDuration.units)) return itemValue * per(itemDuration.units);
  return null;
}

/** Does this effect come off when the combat ends? (1 minute or less, ends on a save, the creature's own.) */
function endsWhenCombatEnds(effect) {
  if (!effect || effect.parent?.documentName === "Item") return false;
  const seconds = effectTotalSeconds(effect);
  return seconds !== null && seconds <= 60 && effectEndsOnSave(effect);
}

/** Remove those effects from everyone in a combat that just ended. */
async function endShortSaveEffects(combat) {
  const actors = new Set();
  for (const combatant of combat?.combatants ?? []) if (combatant?.actor) actors.add(combatant.actor);
  const removed = [];
  for (const actor of actors) {
    const ids = ownEffects(actor).filter(endsWhenCombatEnds).map(e => e.id).filter(Boolean);
    if (!ids.length) continue;
    const stillThere = () => ids.filter(id => (actor.effects?.get?.(id) ?? ownEffects(actor).find(e => e.id === id)));
    try { await actor.deleteEmbeddedDocuments("ActiveEffect", stillThere()); }
    catch {
      // something else (the system ending expired effects) got to some of them first: the rest one by one
      for (const id of stillThere()) { try { await actor.deleteEmbeddedDocuments("ActiveEffect", [id]); } catch { /* already gone */ } }
    }
    removed.push(...ids);
  }
  return removed;
}

Hooks.on("deleteCombat", (combat, options, userId) => {
  if (!automationSetting("saveEndsCombatEnd") || !isAutomationClient(userId)) return;
  if (!combat?.started && !(Number(combat?.round) > 0)) return;
  endShortSaveEffects(combat).catch(err => console.warn(`${MODULE_ID} | Could not end effects when the combat ended`, err));
});
