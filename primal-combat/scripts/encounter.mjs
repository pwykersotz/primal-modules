/**
 * Getting into and out of combat.
 *
 * Joining: rolling initiative (from a character sheet, say) always adds the creature to combat. Foundry already does
 * that when a combat exists, and starts one when the GM rolls with none running. A player can't start a combat, so
 * when a player rolls with none running, their client asks the GM's client to start one (by writing a request to the
 * player's own User flags, which players are allowed to change), waits for it to appear, and then rolls as normal.
 *
 * Leaving: once every hostile creature in a running combat is at 0 HP (or marked defeated), the GM is asked whether to
 * end the combat. If the GM says no, they're asked again only after a hostile is back on its feet (or a new one joins)
 * and then goes down again.
 */
import { FLAGS, MODULE_ID, SETTINGS, SIDES, loc, setting } from "./constants.mjs";
import { getSide } from "./sides.mjs";

/* -------------------------------------------- */
/*  Joining combat by rolling initiative        */
/* -------------------------------------------- */

/** How long a player's client waits for the GM's client to start a combat. */
const REQUEST_TIMEOUT = 5000;

/**
 * Is this actor (or its token) already a combatant in a combat?
 * @param {Actor} actor
 * @param {Combat} combat
 */
function hasCombatant(actor, combat) {
  return combat.combatants.some(c => (actor.isToken ? (c.token === actor.token) : (c.actor === actor)));
}

/**
 * Before an actor rolls initiative: make sure it joins combat, starting one through the GM if a player has none.
 * Called from the Actor#rollInitiative wrapper with the options it was given.
 * @param {Actor} actor
 * @param {object} options   Actor#rollInitiative options. createCombatants is switched on here.
 */
export async function beforeRollInitiative(actor, options) {
  const combat = game.combat;
  // Always join: a roll for a creature that isn't in combat yet adds it, wherever the roll came from.
  if ( !combat || !hasCombatant(actor, combat) ) options.createCombatants = true;
  if ( combat || game.user.isGM || !canvas?.scene ) return;
  await requestCombat(canvas.scene);
}

/**
 * Ask the GM's client to start a combat on a scene, and wait until it exists here (or give up after a few seconds,
 * in which case Foundry's own "no active combat" warning follows).
 * @param {Scene} scene
 * @returns {Promise<Combat|null>}
 */
export async function requestCombat(scene) {
  if ( !game.users.activeGM ) return null;
  const hooks = {};
  let timer;
  const created = new Promise(resolve => {
    const finish = () => {
      for ( const [name, id] of Object.entries(hooks) ) Hooks.off(name, id);
      clearTimeout(timer);
      resolve(game.combat ?? null);
    };
    // A new combat, or (if one already existed for this scene) the GM making it the active one.
    for ( const name of ["createCombat", "updateCombat"] ) {
      hooks[name] = Hooks.on(name, () => {
        if ( game.combat ) finish();
      });
    }
    timer = setTimeout(finish, REQUEST_TIMEOUT);
  });
  await game.user.setFlag(MODULE_ID, FLAGS.combatRequest, { id: foundry.utils.randomID(), sceneId: scene.id });
  return created;
}

/**
 * updateUser hook: the active GM's client starts a combat when a player asks for one.
 */
export async function onUpdateUser(user, changes) {
  const request = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.${FLAGS.combatRequest}`);
  if ( !request?.sceneId || !game.users.activeGM?.isSelf || user.isSelf ) return;
  const scene = game.scenes.get(request.sceneId);
  if ( !scene ) return;
  // Someone else may have started one in the meantime, or there's one for this scene that isn't active yet.
  const existing = game.combats.find(c => (c.scene === scene) || (!c.scene && c.active));
  if ( existing ) {
    if ( !existing.active ) await existing.activate();
    return;
  }
  const cls = foundry.utils.getDocumentClass("Combat");
  await cls.create({ scene: scene.id, active: true });
}

/* -------------------------------------------- */
/*  Offering to end combat                      */
/* -------------------------------------------- */

/** Combats whose GM has said "keep fighting" since their hostiles last went down. */
const declined = new Set();

/** Is the end-of-combat question on screen? */
let asking = false;

/**
 * Is this combatant out of the fight: at 0 HP or marked defeated?
 * @param {Combatant} combatant
 * @returns {boolean|null}   null if it has no hit points to go by (a hazard, say).
 */
export function isDown(combatant) {
  if ( combatant.isDefeated ) return true;
  const hp = combatant.actor?.system?.attributes?.hp;
  const value = Number(hp?.value);
  const max = Number(hp?.effectiveMax ?? hp?.max);
  if ( (hp?.value === null) || (hp?.value === undefined) || (hp?.value === "") || !Number.isFinite(value) ) return null;
  if ( !Number.isFinite(max) || (max <= 0) ) return null;
  return value <= 0;
}

/**
 * Are all the hostile creatures in this combat down? Hostile means on the enemies' side: hostile tokens, plus anyone
 * the GM moved there. Creatures without hit points don't count either way.
 * @param {Combat} combat
 */
export function allHostilesDown(combat) {
  const states = combat.combatants.filter(c => getSide(c) === SIDES.enemies).map(isDown).filter(s => s !== null);
  return (states.length > 0) && states.every(Boolean);
}

/**
 * Check a combat, and ask the GM whether to end it if every hostile is down. Only the active GM's client asks.
 * @param {Combat} combat
 */
export async function checkForEnd(combat) {
  if ( !combat?.started || !game.combats.has(combat.id) || !game.users.activeGM?.isSelf ) return;
  if ( !setting(SETTINGS.endCombatPrompt) ) return;
  if ( !allHostilesDown(combat) ) {
    declined.delete(combat.id);
    return;
  }
  if ( declined.has(combat.id) || asking ) return;

  asking = true;
  let end = false;
  try {
    end = await foundry.applications.api.DialogV2.confirm({
      window: { title: loc("EndPrompt.Title"), icon: "fa-solid fa-flag-checkered" },
      content: `<p>${loc("EndPrompt.Content")}</p>`,
      yes: { label: loc("EndPrompt.End"), icon: "fa-solid fa-flag-checkered" },
      no: { label: loc("EndPrompt.Keep"), icon: "fa-solid fa-swords" },
      rejectClose: false
    });
  } finally {
    asking = false;
  }
  if ( end && game.combats.has(combat.id) ) await combat.delete();
  else declined.add(combat.id);
}

/** Many changes arrive at once (an area spell, say), so wait a moment and check each combat once. */
const pending = new Set();
const flush = foundry.utils.debounce(() => {
  const combats = [...pending];
  pending.clear();
  for ( const combat of combats ) {
    checkForEnd(combat).catch(err => console.error(`${MODULE_ID} | Could not check whether combat is over`, err));
  }
}, 600);

/**
 * Check a combat for its end soon.
 * @param {Combat} combat
 */
export function scheduleCheck(combat) {
  if ( !combat?.started || !game.users.activeGM?.isSelf ) return;
  pending.add(combat);
  flush();
}

/**
 * Check every running combat that has this actor or token in it.
 * @param {object} documents
 * @param {Actor} [documents.actor]
 * @param {TokenDocument} [documents.token]
 */
export function scheduleCheckFor({ actor, token }={}) {
  if ( !game.users.activeGM?.isSelf ) return;
  for ( const combat of game.combats ) {
    if ( !combat.started ) continue;
    const involved = combat.combatants.some(c => (token && (c.tokenId === token.id))
      || (actor && ((c.actor === actor) || (!actor.isToken && (c.actorId === actor.id)))));
    if ( involved ) scheduleCheck(combat);
  }
}

/** deleteCombat hook: forget a combat that has ended. */
export function onDeleteCombat(combat) {
  declined.delete(combat.id);
  pending.delete(combat);
}
