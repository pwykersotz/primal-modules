import { MODULE_ID } from "./constants.mjs";
import { centerOffset, mountCandidates } from "./mounting.mjs";
import { execute, registerHandler } from "./socket.mjs";
import {
  controlOf, debug, flag, getMountOf, getPair, getRiderOf, gridInfo, internalMoves, isAt, loc, moveDoc, setting
} from "./util.mjs";

/**
 * Linked movement. The mount is the anchor of the united token:
 *  - when the mount's position changes (updateToken), the rider is carried to its seat on the mount;
 *  - when the rider is moved (preUpdateToken), the position change is removed from the rider's update and the
 *    mount is moved by the same amount instead, which then carries the rider.
 * Both steps read the position from the update itself, which is what core applies.
 */
export function registerMovement() {
  Hooks.on("preUpdateToken", onPreUpdateToken);
  Hooks.on("updateToken", onUpdateToken);
  Hooks.on("moveToken", onMoveToken);
}

const POSITION_KEYS = ["x", "y", "elevation", "level"];

/** Keyboard codes for each direction (WASD, arrows, numpad). */
const KEYS = {
  up: ["KeyW", "ArrowUp", "Numpad7", "Numpad8", "Numpad9"],
  down: ["KeyS", "ArrowDown", "Numpad1", "Numpad2", "Numpad3"],
  left: ["KeyA", "ArrowLeft", "Numpad1", "Numpad4", "Numpad7"],
  right: ["KeyD", "ArrowRight", "Numpad3", "Numpad6", "Numpad9"]
};

/** riderId -> number of the latest carry, so a superseded carry never overrides a newer one. */
const carrySeq = new Map();

/** Where the rider sits when the mount is at the given position. */
export function riderTarget(rider, mount, pos = mount) {
  const offset = flag(rider, "offset") ?? centerOffset(rider, mount);
  const target = {
    x: Math.round(pos.x + offset.x),
    y: Math.round(pos.y + offset.y),
    elevation: Number.isFinite(pos.elevation) ? pos.elevation : mount.elevation
  };
  const level = pos.level ?? mount.level;
  if ( level ) target.level = level;
  return target;
}

/**
 * Round a pixel distance to whole grid spaces, with halves rounding away from zero so a half-space nudge in any
 * direction still moves the mount (a rider centred on an even-sized mount sits half a space off the grid).
 * Keyboard moves always move at least one space.
 */
export function gridStep(d, size, keyboard = false) {
  if ( !d ) return 0;
  let n = Math.floor((Math.abs(d) / size) + 0.5 + 1e-9);
  if ( keyboard && (n === 0) ) n = 1;
  return Math.sign(d) * n * size;
}

/** Direction of the movement keys currently held down: {x: -1|0|1, y: -1|0|1}. */
export function heldDirection() {
  const down = game.keyboard?.downKeys;
  if ( !down?.size ) return { x: 0, y: 0 };
  const held = list => list.some(k => down.has(k));
  return {
    x: (held(KEYS.right) ? 1 : 0) - (held(KEYS.left) ? 1 : 0),
    y: (held(KEYS.down) ? 1 : 0) - (held(KEYS.up) ? 1 : 0)
  };
}

/**
 * Where the mount should go when the rider was asked to move from its current position to `changes`.
 * @returns {object|null}  A destination for the mount, or null if it would not move.
 */
export function mountTargetFromRider(rider, mount, changes, { keyboard = false } = {}) {
  let dx = ("x" in changes) ? (changes.x - rider.x) : 0;
  let dy = ("y" in changes) ? (changes.y - rider.y) : 0;
  const dz = ("elevation" in changes) ? (changes.elevation - rider.elevation) : 0;
  const { sx, sy, gridless, square } = gridInfo(mount.parent);
  if ( keyboard ) {
    // Keyboard moves are one space in the direction pressed, whatever the rider's off-grid shift came out as.
    const dir = heldDirection();
    if ( dir.x || dir.y ) {
      dx = dir.x * sx;
      dy = dir.y * sy;
    }
  }
  let x;
  let y;
  if ( gridless ) {
    x = mount.x + dx;
    y = mount.y + dy;
  } else if ( !square && (typeof mount.object?.getSnappedPosition === "function") ) {
    let snapped = mount.object.getSnappedPosition({ x: mount.x + dx, y: mount.y + dy });
    if ( (snapped.x === mount.x) && (snapped.y === mount.y) && (dx || dy) ) {
      snapped = mount.object.getSnappedPosition({ x: mount.x + (2 * dx), y: mount.y + (2 * dy) });
    }
    ({ x, y } = snapped);
  } else {
    x = mount.x + gridStep(dx, sx, keyboard);
    y = mount.y + gridStep(dy, sy, keyboard);
  }
  const target = { x: Math.round(x), y: Math.round(y), elevation: mount.elevation + dz };
  if ( changes.level && (changes.level !== rider.level) ) target.level = changes.level;
  const moved = (target.x !== mount.x) || (target.y !== mount.y) || (target.elevation !== mount.elevation)
    || (target.level && (target.level !== mount.level));
  return moved ? target : null;
}

function movesTogether(options, id) {
  const movement = options?.movement;
  if ( movement && (typeof movement === "object") && (id in movement) ) return true;
  return Array.isArray(options?.updates) && options.updates.some(u => u?._id === id);
}

function movementMethod(doc, options) {
  const method = options?.movement?.[doc.id]?.method;
  if ( method ) return method;
  const dir = heldDirection();
  return (dir.x || dir.y) ? "keyboard" : undefined;
}

/* -------------------------------------------- */
/*  The rider is moved                          */
/* -------------------------------------------- */

function onPreUpdateToken(doc, changes, options) {
  if ( options?.primalMounts || internalMoves.has(doc.id) ) return;
  if ( !POSITION_KEYS.some(k => (k in changes) && (changes[k] !== doc[k])) ) return;
  const mount = getMountOf(doc);
  if ( !mount ) return;

  // A rider never drops off its mount on its own: a fall is the mount's (see patchFalling).
  if ( options?.dnd5e?.fall ) {
    for ( const k of POSITION_KEYS ) delete changes[k];
    return;
  }

  // Already heading to its seat on the mount: let it through.
  const seat = riderTarget(doc, mount);
  if ( (("x" in changes) || ("y" in changes)) && ((changes.x ?? doc.x) === seat.x) && ((changes.y ?? doc.y) === seat.y) ) {
    return;
  }

  const method = movementMethod(doc, options);
  debug("rider update", { rider: doc.name, from: { x: doc.x, y: doc.y }, to: { x: changes.x, y: changes.y }, method });

  // Both tokens selected and moved together: core moves the mount too, and the mount then re-seats the rider.
  if ( movesTogether(options, mount.id) ) return;
  if ( ["dragging", "keyboard"].includes(method) && mount.object?.controlled ) return;

  const independent = (controlOf(mount) === "independent") && !game.user.isGM;
  const target = independent ? null : mountTargetFromRider(doc, mount, changes, { keyboard: method === "keyboard" });

  // The rider stays in the saddle: drop the position change from its own update.
  for ( const k of POSITION_KEYS ) delete changes[k];

  if ( independent ) {
    ui.notifications.warn(loc("Notify.IndependentMount", { mount: mount.name }));
    return;
  }
  if ( !target ) return;
  debug("drive mount", { mount: mount.name, from: { x: mount.x, y: mount.y }, to: target });
  execute("driveMount", { sceneId: doc.parent.id, mountId: mount.id, riderId: doc.id, target }, { local: mount.isOwner })
    .catch(err => console.error(`${MODULE_ID} | could not move the mount`, err));
}

registerHandler("driveMount", async ({ sceneId, mountId, riderId, target }, user) => {
  const scene = game.scenes.get(sceneId);
  const mount = scene?.tokens.get(mountId);
  const rider = scene?.tokens.get(riderId);
  if ( !mount || !rider || (getMountOf(rider) !== mount) || !target ) return;
  if ( !user.isGM && !rider.canUserModify(user, "update") ) return;
  if ( !user.isGM && (controlOf(mount) === "independent") ) return;
  await moveDoc(mount, target, { extra: { driver: riderId } });
});

/* -------------------------------------------- */
/*  The mount is moved                          */
/* -------------------------------------------- */

function onUpdateToken(doc, changes, options, userId) {
  const moved = POSITION_KEYS.some(k => k in changes);
  const resized = ("width" in changes) || ("height" in changes);
  if ( !moved && !resized ) return;
  const rider = getRiderOf(doc);
  if ( !rider ) {
    const mount = getMountOf(doc);
    if ( !mount || !game.user.isActiveGM ) return;
    // The rider itself was resized: re-centre it on its mount.
    if ( resized ) recentre(doc, mount);
    // The rider was moved by something other than this module: put it back in the saddle, at the mount's
    // elevation.
    else if ( !options?.primalMounts ) {
      const seat = riderTarget(doc, mount);
      if ( !isAt(doc, seat) ) setTimeout(() => {
        if ( (getMountOf(doc) === mount) && !isAt(doc, riderTarget(doc, mount)) ) carry(doc, riderTarget(doc, mount));
      }, 250);
    }
    return;
  }
  if ( resized ) {
    if ( game.user.isActiveGM ) recentre(rider, doc);
    return;
  }
  // Whoever moved the mount carries the rider if they may; otherwise the active GM does.
  const user = game.users.get(userId);
  const executor = (user && rider.canUserModify(user, "update")) ? (userId === game.user.id) : game.user.isActiveGM;
  if ( !executor ) return;
  const pos = {
    x: changes.x ?? doc.x,
    y: changes.y ?? doc.y,
    elevation: changes.elevation ?? doc.elevation,
    level: changes.level ?? doc.level
  };
  const seat = riderTarget(rider, doc, pos);
  debug("mount moved", { mount: doc.name, to: pos, seat, rider: { x: rider.x, y: rider.y } });
  if ( isAt(rider, seat) ) return;
  carry(rider, seat, { animate: options?.animate !== false });
}

function recentre(rider, mount) {
  const offset = centerOffset(rider, mount);
  rider.update({ [`flags.${MODULE_ID}.offset`]: offset }, { primalMounts: { internal: true } })
    .then(() => carry(rider, riderTarget(rider, mount)))
    .catch(err => console.error(`${MODULE_ID} | could not re-centre the rider`, err));
}

/** Move the rider to its seat, making sure it gets there even if the animated move is refused. */
async function carry(rider, seat, { animate = true } = {}) {
  const seq = (carrySeq.get(rider.id) ?? 0) + 1;
  carrySeq.set(rider.id, seq);
  try {
    if ( animate ) await moveDoc(rider, seat, { ignoreWalls: true, extra: { follow: true } });
    if ( carrySeq.get(rider.id) !== seq ) return;
    if ( !isAt(rider, seat) ) await placeDirectly(rider, seat);
    debug("rider carried", { rider: rider.name, seat, at: { x: rider.x, y: rider.y } });
  } catch(err) {
    console.error(`${MODULE_ID} | could not carry the rider`, err);
  }
}

async function placeDirectly(rider, seat) {
  try {
    await moveDoc(rider, { ...seat, action: "displace" }, { ignoreWalls: true, extra: { follow: true } });
  } catch(err) { /* fall back to a plain update */ }
  if ( isAt(rider, seat) ) return;
  internalMoves.add(rider.id);
  try {
    const data = { x: seat.x, y: seat.y, elevation: seat.elevation };
    if ( seat.level ) data.level = seat.level;
    await rider.update(data, { primalMounts: { internal: true, follow: true }, animate: false });
  } finally {
    internalMoves.delete(rider.id);
  }
}

/* -------------------------------------------- */
/*  Dropping a token onto a creature            */
/* -------------------------------------------- */

function onMoveToken(doc, movement, operation, user) {
  if ( operation?.primalMounts ) return;
  maybeShowHud(doc, movement, user);
}

/** After a token is dropped onto another, open its HUD so the Mount button is right there. */
async function maybeShowHud(doc, movement, user) {
  if ( !user?.isSelf || !setting("autoShowHud") ) return;
  if ( movement?.method && (movement.method !== "dragging") ) return;
  if ( movement?.pending?.waypoints?.length ) return;
  const token = doc.object;
  if ( !token?.controlled || getPair(doc) || !mountCandidates(doc).length ) return;
  try {
    await token.movementAnimationPromise;
  } catch(err) { /* animation interrupted */ }
  if ( token.destroyed || !token.controlled || getPair(doc) ) return;
  canvas.tokens?.hud?.bind(token);
}
