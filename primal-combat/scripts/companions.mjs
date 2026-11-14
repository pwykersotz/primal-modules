/**
 * Companions that finish their turn with someone, in side initiative.
 *
 * A controlled mount, a beast companion or a familiar is a combatant of its own on the party's side, so the side waits
 * until someone clicks it done as well. Here marking the leader done (by clicking its portrait, or a player's End Turn)
 * marks its companions done too, and marking it not done brings them back. A companion can still be marked on its own.
 *
 * Who counts as a companion:
 * - A controlled mount its rider is on, when Primal Mounts is on (an independent mount acts on its own).
 * - Any creature the GM set to finish with another, from the carousel's right-click menu. That's stored on the
 *   companion's actor (flags.primal-combat.actsWith: the leader's actor id), so it lasts from one fight to the next.
 *
 * The active GM's client makes the changes, since a player may not own the companion; with no GM online, the client
 * of whoever marked the leader does what it's allowed to.
 */
import { FLAGS, MODULE_ID, SIDES, loc } from "./constants.mjs";
import { getActingMembers, getSide, isDone, isSideMode, setDone } from "./sides.mjs";

/**
 * The leader a creature finishes its turn with, by the GM's choice: an actor id, or null.
 * @param {Actor} actor
 * @returns {string|null}
 */
export function leaderOf(actor) {
  const ref = actor?.getFlag?.(MODULE_ID, FLAGS.actsWith);
  return (typeof ref === "string") && ref ? ref : null;
}

/** The controlled mount this combatant's token rides, from Primal Mounts: its token document, or null. */
function controlledMountOf(combatant) {
  const mounts = game.modules?.get("primal-mounts");
  const token = combatant?.token;
  if ( !mounts?.active || (typeof mounts.api?.getPair !== "function") || !token ) return null;
  try {
    const pair = mounts.api.getPair(token);
    if ( !pair?.mount || (pair.rider?.id !== token.id) ) return null;
    return pair.mount.getFlag?.("primal-mounts", "control") === "independent" ? null : pair.mount;
  } catch(err) {
    console.warn(`${MODULE_ID} | Could not read Primal Mounts' pair for ${combatant.name}`, err);
    return null;
  }
}

/**
 * The combatants that finish their turn with this one.
 * @param {Combatant} combatant
 * @returns {Combatant[]}
 */
export function getCompanions(combatant) {
  const combat = combatant?.parent;
  if ( !combat ) return [];
  const found = new Set();
  const leaderId = combatant.actor?.id;
  if ( leaderId ) {
    for ( const other of combat.combatants ) {
      if ( (other !== combatant) && other.actor && (other.actor.id !== leaderId) && (leaderOf(other.actor) === leaderId) ) found.add(other);
    }
  }
  const mount = controlledMountOf(combatant);
  if ( mount ) {
    const ridden = combat.combatants.find(c => (c.tokenId === mount.id) && (!c.sceneId || (c.sceneId === mount.parent?.id)));
    if ( ridden && (ridden !== combatant) ) found.add(ridden);
  }
  return combat.turns.filter(c => found.has(c));
}

/** Should this client carry a done mark over to the companions? */
function isResponsible(userId) {
  const gm = game.users?.activeGM;
  return gm ? gm.isSelf : (userId === game.userId);
}

/**
 * updateCombatant hook: when someone acting is marked done or not done, their companions acting with them follow.
 * @param {Combatant} combatant
 * @param {object} changes
 * @param {object} options
 * @param {string} userId
 */
export async function onUpdateCombatant(combatant, changes, options, userId) {
  if ( !foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${FLAGS.done}`) ) return;
  const combat = combatant.parent;
  if ( !combat?.started || !isSideMode(combat) || !isResponsible(userId) ) return;
  const acting = getActingMembers(combat);
  if ( !acting.includes(combatant) ) return;
  const done = isDone(combatant);
  for ( const companion of getCompanions(combatant) ) {
    if ( !acting.includes(companion) || companion.isDefeated || (isDone(companion) === done) ) continue;
    if ( !companion.isOwner ) continue;
    try {
      await setDone(companion, done);
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not mark ${companion.name} ${done ? "done" : "not done"} with ${combatant.name}`, err);
    }
  }
}

/**
 * The GM's form to choose who a creature finishes its turn with.
 * @param {Combatant} combatant
 */
export async function chooseLeader(combatant) {
  const actor = combatant?.actor;
  if ( !actor || !game.user.isGM ) return;
  const combat = combatant.parent;
  const seen = new Set([actor.id]);
  const choices = [];
  for ( const c of combat.turns ) {
    if ( !c.actor || seen.has(c.actor.id) || (getSide(c) === SIDES.event) ) continue;
    seen.add(c.actor.id);
    choices.push({ id: c.actor.id, name: c.name });
  }
  const current = leaderOf(actor);
  const escape = foundry.utils.escapeHTML ?? (s => s);
  const options = [`<option value="">${loc("Companion.Nobody")}</option>`]
    .concat(choices.map(c => `<option value="${c.id}" ${c.id === current ? "selected" : ""}>${escape(c.name)}</option>`));
  const content = `<p>${loc("Companion.Hint", { name: escape(combatant.name) })}</p>
    <div class="form-group">
      <label for="pc-acts-with">${loc("Companion.Label")}</label>
      <div class="form-fields"><select id="pc-acts-with" name="leader">${options.join("")}</select></div>
    </div>`;
  const data = await foundry.applications.api.DialogV2.input({
    window: { title: loc("Companion.Title", { name: combatant.name }), icon: "fa-solid fa-link" },
    position: { width: 420 },
    content,
    ok: { label: loc("Companion.Save"), icon: "fa-solid fa-check" },
    rejectClose: false
  });
  if ( !data ) return;
  const leader = data.leader || null;
  if ( leader ) await actor.setFlag(MODULE_ID, FLAGS.actsWith, leader);
  else if ( current ) await actor.unsetFlag(MODULE_ID, FLAGS.actsWith);
}
