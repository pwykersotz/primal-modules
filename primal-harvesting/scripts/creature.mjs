/**
 * Reading creatures: the corpse being harvested (its type, size and challenge rating, whether it's dead and whether
 * it's been harvested) and the characters who can harvest it (their check modifiers and proficiency).
 */
import { FLAGS, MODULE_ID, SETTINGS, setting } from "./constants.mjs";
import { CREATURE_TYPES } from "./rules.mjs";

/**
 * The TokenDocument of a Token, TokenDocument, or Actor (its active token on the current scene), or null.
 * @param {Token|TokenDocument|Actor} target
 */
export function tokenDocOf(target) {
  if ( !target ) return null;
  if ( target.documentName === "Token" ) return target;
  if ( target.document?.documentName === "Token" ) return target.document;
  if ( target.documentName === "Actor" ) {
    if ( target.token ) return target.token;
    const tokens = target.getActiveTokens?.(false, true) ?? [];
    return tokens[0] ?? null;
  }
  return null;
}

/** The actor of a Token, TokenDocument or Actor. */
export function actorOf(target) {
  if ( !target ) return null;
  if ( target.documentName === "Actor" ) return target;
  return target.actor ?? target.document?.actor ?? null;
}

/** Has this actor's creature been beaten: 0 hit points, the Dead status, or defeated in the combat tracker? */
export function isDefeated(actor, tokenDoc=null) {
  if ( !actor ) return false;
  const hp = actor.system?.attributes?.hp;
  if ( hp && (Number(hp.max) > 0 || Number(hp.effectiveMax) > 0) && (Number(hp.value) <= 0) ) return true;
  const dead = globalThis.CONFIG?.specialStatusEffects?.DEFEATED ?? "dead";
  if ( actor.statuses?.has?.(dead) ) return true;
  if ( tokenDoc?.combatant?.isDefeated ) return true;
  return false;
}

/** Is this a monster or NPC (not a player's character), so something that can be harvested? */
export function isMonster(actor) {
  if ( !actor ) return false;
  if ( actor.type === "character" ) return false;
  if ( ["group", "vehicle"].includes(actor.type) ) return false;
  return true;
}

/** The harvested record of a token, or null. */
export function harvestedRecord(tokenDoc) {
  return tokenDoc?.getFlag?.(MODULE_ID, FLAGS.harvested) ?? null;
}

/**
 * Can the current user harvest this token?
 * @returns {{ok: boolean, reason?: string}}  reason is a localization key under Errors when not.
 */
export function canHarvest(tokenDoc, user=game.user) {
  const actor = tokenDoc?.actor;
  if ( !actor ) return { ok: false, reason: "NoCreature" };
  if ( !isMonster(actor) ) return { ok: false, reason: "NotMonster" };
  if ( !user.isGM && !setting(SETTINGS.playersCanHarvest) ) return { ok: false, reason: "GMOnly" };
  if ( !user.isGM && (setting(SETTINGS.deadOnly) !== false) && !isDefeated(actor, tokenDoc) ) {
    return { ok: false, reason: "NotDead" };
  }
  return { ok: true };
}

/** The dnd5e creature type key of an actor ("ooze"), using a GM's choice first, then dnd5e's type or custom type. */
export function creatureTypeOf(actor) {
  const picked = actor?.getFlag?.(MODULE_ID, FLAGS.type);
  if ( picked ) return picked;
  const details = actor?.system?.details?.type ?? {};
  const value = String(details.value ?? "").toLowerCase();
  if ( value && (value !== "custom") ) return value;
  const custom = String(details.custom ?? "").toLowerCase();
  return CREATURE_TYPES.find(t => custom.includes(t)) ?? (value || "");
}

/**
 * What the harvest window needs to know about a corpse.
 * @param {TokenDocument} tokenDoc
 */
export function creatureInfo(tokenDoc) {
  const actor = tokenDoc?.actor ?? null;
  const base = tokenDoc?.baseActor ?? actor;
  const names = [actor?.name, tokenDoc?.name, base?.name].filter(Boolean);
  const cr = Number(actor?.system?.details?.cr);
  return {
    tokenDoc,
    actor,
    baseActor: base,
    uuid: tokenDoc?.uuid ?? actor?.uuid ?? "",
    name: tokenDoc?.name || actor?.name || "",
    names: [...new Set(names)],
    img: actor?.img || tokenDoc?.texture?.src || "icons/svg/mystery-man.svg",
    type: creatureTypeOf(actor),
    size: actor?.system?.traits?.size ?? "med",
    cr: Number.isFinite(cr) ? cr : null,
    creatureId: base?.getFlag?.(MODULE_ID, FLAGS.creature) ?? actor?.getFlag?.(MODULE_ID, FLAGS.creature) ?? null,
    defeated: isDefeated(actor, tokenDoc),
    harvested: harvestedRecord(tokenDoc)
  };
}

/** "1/8", "1/4", "1/2" or the number. */
export function crLabel(cr) {
  if ( (cr === null) || (cr === undefined) || !Number.isFinite(Number(cr)) ) return "—";
  const value = Number(cr);
  if ( value === 0.125 ) return "1/8";
  if ( value === 0.25 ) return "1/4";
  if ( value === 0.5 ) return "1/2";
  return String(value);
}

/* -------------------------------------------- */
/*  Harvesters                                  */
/* -------------------------------------------- */

/** An actor's proficiency bonus. */
export function profOf(actor) {
  return Number(actor?.system?.attributes?.prof) || 0;
}

/** Is an actor proficient (or better) in a skill? Half proficiency (Jack of All Trades) isn't proficiency. */
export function isProficient(actor, skill) {
  const s = actor?.system?.skills?.[skill];
  if ( !s ) return false;
  const multiplier = s.prof?.multiplier ?? s.proficient ?? s.value ?? 0;
  return Number(multiplier) >= 1;
}

/**
 * About what an actor adds to a check with this skill and ability: the ability modifier, the skill's proficiency
 * (with expertise or half proficiency), and a plain number skill bonus. Dice bonuses and effects are left out; this
 * only picks the default harvesters and estimates the total. The real roll is dnd5e's.
 */
export function checkModifier(actor, skill, ability) {
  const abilityMod = Number(actor?.system?.abilities?.[ability]?.mod) || 0;
  const s = actor?.system?.skills?.[skill];
  let prof = 0;
  if ( s ) {
    if ( Number.isFinite(Number(s.prof?.flat)) ) prof = Number(s.prof.flat);
    else prof = Math.floor((Number(s.proficient ?? s.value) || 0) * profOf(actor));
  }
  const bonus = Number(s?.bonuses?.check);
  return abilityMod + prof + (Number.isFinite(bonus) ? bonus : 0);
}

/**
 * The spellcasting ability an actor carves with in a ritual carving, or null if it can't cast spells.
 * @param {Actor} actor
 */
export function spellcastingAbilityOf(actor) {
  if ( !actor ) return null;
  const classes = actor.spellcastingClasses ?? {};
  if ( Object.keys(classes).length ) return actor.spellcastingAbility ?? null;
  const hasSpells = actor.items?.some?.(i => i.type === "spell") || (Number(actor.system?.attributes?.spell?.level) > 0);
  if ( !hasSpells ) return null;
  return actor.system?.attributes?.spellcasting || actor.spellcastingAbility || null;
}

/** The players logged in now (not GMs). */
export function activePlayers() {
  return [...(game.users ?? [])].filter(u => u?.active && !u.isGM);
}

/** Can this actor take part in a harvest (not a group or vehicle, not the corpse)? */
function canTakePart(actor, exclude) {
  return !!actor && (actor !== exclude) && (actor.documentName === "Actor") && !["group", "vehicle"].includes(actor.type);
}

/**
 * The characters who can do the harvesting.
 * - With players logged in: their characters (each one's assigned character, and the characters they own).
 * - With only the GM: dnd5e's primary party if there is one, else every player's character, plus any other creature a
 *   player owns on the scene (a companion, say), else the GM's controlled tokens.
 * - Either way, the creatures the GM added to this harvest (guests: actor UUIDs).
 * Sorted by name, so every screen lists them the same way.
 * @param {Actor} [exclude]                 The corpse.
 * @param {{guests?: string[]}} [options]
 * @returns {Actor[]}
 */
export function harvesterCandidates(exclude=null, { guests=[] }={}) {
  const out = [];
  const seen = new Set();
  const add = actor => {
    if ( !canTakePart(actor, exclude) ) return;
    const key = actor.uuid ?? actor.id;
    if ( seen.has(key) ) return;
    seen.add(key);
    out.push(actor);
  };
  const players = activePlayers();
  if ( players.length ) {
    for ( const user of players ) {
      add(user.character);
      for ( const actor of game.actors ?? [] ) {
        if ( (actor.type === "character") && actor.testUserPermission?.(user, "OWNER") ) add(actor);
      }
    }
  }
  else {
    let party = [];
    try {
      party = (game.actors?.party?.system?.members ?? []).map(m => m?.actor ?? m).filter(a => a?.documentName === "Actor");
    } catch {
      party = [];
    }
    if ( party.length ) party.forEach(add);
    else {
      for ( const actor of game.actors ?? [] ) {
        if ( (actor.type === "character") && actor.hasPlayerOwner ) add(actor);
      }
    }
    for ( const token of globalThis.canvas?.scene?.tokens ?? [] ) {
      const actor = token.actor;
      if ( actor?.hasPlayerOwner && !isDefeated(actor, token) ) add(actor);
    }
    // A GM with no party still gets someone to pick: their controlled tokens.
    if ( !out.length ) {
      for ( const token of globalThis.canvas?.tokens?.controlled ?? [] ) add(token.actor);
      if ( game.user.character ) add(game.user.character);
    }
  }
  for ( const uuid of guests ?? [] ) {
    let actor = null;
    try {
      actor = globalThis.fromUuidSync?.(uuid) ?? null;
    } catch {
      actor = null;
    }
    add(actor);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || String(a.uuid).localeCompare(String(b.uuid)));
}
