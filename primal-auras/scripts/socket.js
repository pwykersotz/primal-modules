import { SOCKET_NAME, fromUuidSafe, warn } from "./constants.js";
import { rollSave } from "./system.js";

const pending = new Map();

export function initSocket() {
  game.socket.on(SOCKET_NAME, onMessage);
}

async function onMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.action === "rollSave" && msg.userId === game.user.id) {
    let result = null;
    try {
      const actor = await fromUuidSafe(msg.actorUuid);
      result = await rollSave(actor, msg.ability, msg.dc, { configure: true });
    } catch (err) {
      warn("Remote saving throw failed", err);
    }
    game.socket.emit(SOCKET_NAME, { action: "saveResult", requestId: msg.requestId, result });
  }
  else if (msg.action === "saveResult" && pending.has(msg.requestId)) {
    pending.get(msg.requestId)(msg.result ?? null);
  }
}

/** The best player to roll a save for an actor: its assigned player first, then any active owner. */
export function findPlayerOwner(actor) {
  if (!actor) return null;
  const owners = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
  return owners.find(u => u.character?.id === actor.id) ?? owners[0] ?? null;
}

/**
 * Ask a player's client to roll a save. Resolves to the result, or null if the player cancelled
 * or did not answer in time (the caller then rolls on the GM's side).
 */
export function requestRemoteSave(user, actor, ability, dc, timeoutMs) {
  const requestId = foundry.utils.randomID();
  return new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(requestId); resolve(null); }, timeoutMs);
    pending.set(requestId, result => {
      clearTimeout(timer);
      pending.delete(requestId);
      resolve(result);
    });
    game.socket.emit(SOCKET_NAME, { action: "rollSave", requestId, userId: user.id, actorUuid: actor.uuid, ability, dc });
  });
}
