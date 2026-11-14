/**
 * Passing through an aura. Entering an aura is otherwise checked where a move ends, so a creature that walks through
 * Spirit Guardians and out the other side, or a cleric who walks past enemies with it, would never trigger it.
 *
 * Foundry 13 and 14 report each move with its path (the moveToken hook). For each move this checks points along that
 * path, every half grid space, and a creature that's inside an aura somewhere along the way but outside it at both
 * ends gets that aura's "on enter" effects (and then its "on leave" ones). A creature that ends its move inside is
 * left to the usual check at the end of the move, so nothing happens twice. Teleports (a movement action that doesn't
 * cross the space between) and undoing a move don't count. "Once per turn" still limits it.
 *
 * Runs on the active GM only, like the rest of the automation, and can be turned off in the settings.
 */
import { getSetting, error } from "./constants.js";
import { isTokenInAura } from "./geometry.js";
import { isDefeated } from "./system.js";

/** Points along the path are checked this far apart, in grid spaces. */
const STEP = 0.5;

/** A token's position and size at a point of its move: {x, y, elevation, width, height, level}. */
function positionAt(doc, point) {
  return {
    x: Number(point.x), y: Number(point.y),
    elevation: Number.isFinite(point.elevation) ? point.elevation : (doc.elevation ?? 0),
    width: Number.isFinite(point.width) ? point.width : doc.width,
    height: Number.isFinite(point.height) ? point.height : doc.height,
    level: point.level ?? doc.level
  };
}

/** The points along a move between its start and its end, both left out. */
export function pathPoints(doc, movement) {
  const origin = movement?.origin;
  const waypoints = movement?.passed?.waypoints ?? [];
  if (!origin || !waypoints.length) return [];
  const size = doc.parent?.grid?.size || 100;
  const actions = globalThis.CONFIG?.Token?.movement?.actions ?? {};
  const points = [];
  let from = positionAt(doc, origin);
  for (const waypoint of waypoints) {
    const to = positionAt(doc, waypoint);
    if (!actions[waypoint.action]?.teleport) {
      const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (size * STEP)));
      for (let k = 1; k < steps; k++) {
        const f = k / steps;
        points.push({ ...to, x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f,
          elevation: from.elevation + (to.elevation - from.elevation) * f });
      }
    }
    points.push(to);
    from = to;
  }
  points.pop(); // The end of the move: the usual check handles it.
  return points;
}

/** A stand-in for a token at another place, for the containment tests (which only read its data). */
function ghost(doc, position) {
  return { id: doc.id, parent: doc.parent, actor: doc.actor, disposition: doc.disposition, ...position };
}

const triggersOnEnter = inst => inst.aura.effects.some(e => e.mode === "triggered" && e.triggers?.onEnter);

/**
 * Who passed through which aura in a move: [{inst, targetId}]. The mover through others' auras, and others through the
 * mover's own auras as it carries them past.
 * @param {Scene} scene
 * @param {TokenDocument} doc     The token that moved.
 * @param {object} movement      The moveToken hook's movement data.
 * @param {object[]} instances   The scene's active auras (AuraEngine#collectInstances).
 */
export function findPassThroughs(scene, doc, movement, instances) {
  const points = pathPoints(doc, movement);
  if (!points.length) return [];
  const start = positionAt(doc, movement.origin);
  const end = positionAt(doc, movement.passed.waypoints.at(-1));
  const ignoreDefeated = getSetting("ignoreDefeated");
  const inside = (inst, target) => {
    try { return isTokenInAura(inst, target); }
    catch (err) { error("Containment test failed", err); return false; }
  };
  const found = [];

  // The mover, through other creatures' auras.
  if (doc.actor && !(ignoreDefeated && isDefeated(doc))) {
    for (const inst of instances) {
      if ((inst.sourceDoc.id === doc.id) || !triggersOnEnter(inst)) continue;
      if (inside(inst, ghost(doc, start)) || inside(inst, ghost(doc, end))) continue;
      if (points.some(p => inside(inst, ghost(doc, p)))) found.push({ inst, targetId: doc.id });
    }
  }

  // Other creatures, through the mover's own auras as it moves past them.
  for (const inst of instances) {
    if ((inst.sourceDoc.id !== doc.id) || !triggersOnEnter(inst)) continue;
    const at = position => ({ ...inst, sourceDoc: ghost(doc, position), circle: undefined, cells: undefined });
    const first = at(start), last = at(end), along = points.map(at);
    for (const target of scene.tokens) {
      if ((target.id === doc.id) || !target.actor || (ignoreDefeated && isDefeated(target))) continue;
      if (inside(first, target) || inside(last, target)) continue;
      if (along.some(a => inside(a, target))) found.push({ inst, targetId: target.id });
    }
  }
  return found;
}

/**
 * moveToken hook: queue the pass-through check for the aura engine.
 * @param {AuraEngine} engine
 */
export function onMoveToken(engine, doc, movement) {
  if (!engine.enabled || !getSetting("passThrough")) return;
  if (movement?.method === "undo") return;
  const scene = doc?.parent;
  if (!scene || !movement?.passed?.waypoints?.length) return;
  engine.enqueue(async () => {
    if (!game.scenes.get(scene.id)) return;
    const instances = engine.collectInstances(scene);
    const passed = findPassThroughs(scene, doc, movement, instances);
    if (!passed.length) return;
    const combat = engine.combatFor(scene);
    const turnKey = combat ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    const jobs = [];
    for (const trigger of ["onEnter", "onLeave"]) {
      for (const { inst, targetId } of passed) {
        for (const effect of inst.aura.effects) {
          if ((effect.mode === "triggered") && effect.triggers?.[trigger]) jobs.push({ inst, effect, targetId, trigger, turnKey });
        }
      }
    }
    await engine.runJobs(scene, jobs, combat);
  });
}
