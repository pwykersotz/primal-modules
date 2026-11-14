/**
 * A shared harvest: what a corpse's harvest window shows (the harvest list, who assesses, carves and helps, and who
 * gets the components), kept on its token so the window is the same on every screen. Each change is one small
 * operation, made by the active GM's client in the order they come, so two people clicking at once don't undo each
 * other. Nothing here touches Foundry.
 *
 * A session: { list, extra, guests, assessorId, carverId, ritual, helperIds, helpersTouched, recipientId, harvesting,
 *   approved, rev }
 * - list: the harvest list, copies of components, each with its own uid.
 * - extra: components the GM added for this harvest only.
 * - guests: creatures the GM added to this harvest (actor UUIDs), who can assess, carve or help like the characters.
 * - ritual, helperIds: null until someone chooses (the window works them out until then).
 * - harvesting: { userId, name, at } while someone's harvest is being rolled.
 * - approved: { by, at } once the GM approves the harvest (players can roll it then). A player's change to the list
 *   or to who rolls withdraws it.
 * Every key is always there, so saving a session over another replaces each of its values.
 */

/** The choices of the team, which a "set" can change. */
export const TEAM_FIELDS = ["assessorId", "carverId", "ritual", "helperIds", "helpersTouched", "recipientId"];

/** The team's choices that change the roll (the recipient doesn't). */
const ROLL_FIELDS = ["assessorId", "carverId", "ritual", "helperIds"];

/** How long a "someone is harvesting" mark holds before it's taken as stale (a closed browser). */
export const HARVESTING_STALE_MS = 2 * 60 * 1000;

/** A session with nothing chosen yet. */
export function emptySession() {
  return {
    list: [],
    extra: [],
    guests: [],
    assessorId: null,
    carverId: null,
    ritual: null,
    helperIds: null,
    helpersTouched: false,
    recipientId: null,
    harvesting: null,
    approved: null,
    rev: 0
  };
}

const idOrNull = value => ((typeof value === "string") && value ? value : null);

function component(raw) {
  if ( !raw || (typeof raw !== "object") || !raw.key || !raw.name ) return null;
  return structuredClone(raw);
}

/** A session as stored, with anything missing or broken filled in. */
export function normalizeSession(raw) {
  const s = emptySession();
  if ( !raw || (typeof raw !== "object") ) return s;
  s.list = (Array.isArray(raw.list) ? raw.list : []).map(component).filter(c => c?.uid);
  s.extra = (Array.isArray(raw.extra) ? raw.extra : []).map(component).filter(Boolean);
  s.guests = [...new Set((Array.isArray(raw.guests) ? raw.guests : []).filter(idOrNull))];
  s.assessorId = idOrNull(raw.assessorId);
  s.carverId = idOrNull(raw.carverId);
  s.ritual = (typeof raw.ritual === "boolean") ? raw.ritual : null;
  s.helperIds = Array.isArray(raw.helperIds) ? [...new Set(raw.helperIds.filter(idOrNull))] : null;
  s.helpersTouched = !!raw.helpersTouched;
  s.recipientId = idOrNull(raw.recipientId);
  const h = raw.harvesting;
  s.harvesting = (h && (typeof h === "object") && h.userId) ? { userId: String(h.userId), name: String(h.name ?? ""), at: Number(h.at) || 0 } : null;
  const a = raw.approved;
  s.approved = (a && (typeof a === "object")) ? { by: String(a.by ?? ""), at: Number(a.at) || 0 } : null;
  s.rev = Number(raw.rev) || 0;
  return s;
}

/** Does going from one session to the next change the harvest (the list, or who rolls)? */
export function changesRoll(before, after) {
  const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  const valueOf = (s, k) => ((k === "helperIds") && s.helperIds ? [...s.helperIds].sort() : s[k]);
  if ( !same(before.list.map(c => c.uid), after.list.map(c => c.uid)) ) return true;
  return ROLL_FIELDS.some(k => !same(valueOf(before, k), valueOf(after, k)));
}

/** Is someone other than this user rolling a harvest right now? Their mark, or null. */
export function harvestingBy(session, userId, now=Date.now()) {
  const h = session?.harvesting;
  if ( !h || (h.userId === userId) ) return null;
  return ((now - (Number(h.at) || 0)) > HARVESTING_STALE_MS) ? null : h;
}

/**
 * One change to a session, as a new session.
 * - { op: "add", components }        Put components at the end of the list (each needs a uid), as often as each can go.
 * - { op: "remove", uid }
 * - { op: "move", uid, to }          Move a component to a place in the list.
 * - { op: "clear" }
 * - { op: "set", values }            Change the team (TEAM_FIELDS only).
 * - { op: "extra", component }       A component the GM added for this harvest (GM only).
 * - { op: "guests", guests }         The creatures the GM added to this harvest (GM only).
 * - { op: "harvesting", value }      { userId, name, at } while rolling, null when done.
 * - { op: "approve", value }         { by, at } to let players roll the harvest, null to withdraw it (GM only).
 * - { op: "init", state }            A whole session, to start one.
 * @param {object|null} session
 * @param {object} op
 * @param {{isGM?: boolean}} [who]
 * @returns {object}
 */
export function applyOp(session, op, { isGM=false }={}) {
  let s = normalizeSession(session);
  const before = normalizeSession(session);
  switch ( op?.op ) {
    case "init":
      s = normalizeSession(op.state);
      s.rev = (Number(session?.rev) || 0);
      if ( !isGM ) s.approved = null;
      break;
    case "add":
      for ( const raw of op.components ?? [] ) {
        const c = component(raw);
        if ( !c?.uid || s.list.some(x => x.uid === c.uid) ) continue;
        const count = s.list.filter(x => x.key === c.key).length;
        if ( c.max && (count >= c.max) ) continue;
        s.list.push(c);
      }
      break;
    case "remove":
      s.list = s.list.filter(c => c.uid !== op.uid);
      break;
    case "move": {
      const from = s.list.findIndex(c => c.uid === op.uid);
      if ( from < 0 ) break;
      const to = Math.max(0, Math.min(s.list.length - 1, Math.floor(Number(op.to) || 0)));
      const [item] = s.list.splice(from, 1);
      s.list.splice(to, 0, item);
      break;
    }
    case "clear":
      s.list = [];
      break;
    case "set":
      for ( const key of TEAM_FIELDS ) {
        if ( op.values && (key in op.values) ) s[key] = op.values[key];
      }
      s = { ...normalizeSession(s), rev: s.rev };
      break;
    case "extra": {
      const c = component(op.component);
      if ( isGM && c && !s.extra.some(x => x.key === c.key) ) s.extra.push(c);
      break;
    }
    case "guests":
      if ( isGM ) s.guests = normalizeSession({ guests: op.guests }).guests;
      break;
    case "harvesting":
      s.harvesting = op.value ? normalizeSession({ harvesting: op.value }).harvesting : null;
      break;
    case "approve":
      if ( !isGM ) return s;
      s.approved = op.value ? normalizeSession({ approved: op.value }).approved : null;
      break;
    default:
      return s;
  }
  // The GM approved the harvest as it was: a player changing what's harvested, or who rolls, withdraws it.
  if ( !isGM && s.approved && changesRoll(before, s) ) s.approved = null;
  // Each change has a higher revision than the last (the GM's clock, so a session started again after a reset is
  // still newer than what an open window shows).
  s.rev = Math.max(s.rev + 1, Date.now());
  return s;
}
