import { MODULE_ID, SOCKET } from "./constants.mjs";
import { loc } from "./util.mjs";

const handlers = {};

/**
 * Register an operation that may need to run with GM permissions.
 * @param {string} name
 * @param {(payload: object, user: User) => Promise<any>} fn
 */
export function registerHandler(name, fn) {
  handlers[name] = fn;
}

export function initSocket() {
  game.socket.on(SOCKET, async message => {
    if ( message?.type === "notify" ) {
      if ( message.userId === game.user.id ) ui.notifications[message.level ?? "warn"](message.text);
      return;
    }
    if ( (message?.type !== "request") || !game.user.isActiveGM ) return;
    const user = game.users.get(message.userId);
    const fn = handlers[message.action];
    if ( !user || !fn ) return;
    try {
      await fn(message.payload ?? {}, user);
    } catch(err) {
      console.error(`${MODULE_ID} | "${message.action}" requested by ${user.name} failed`, err);
    }
  });
}

/**
 * Run an operation here when this user is allowed to, otherwise ask the active GM to run it.
 * @param {string} action
 * @param {object} payload
 * @param {object} [options]
 * @param {boolean} [options.local]  This user has every permission the operation needs.
 */
export async function execute(action, payload, { local = false } = {}) {
  const fn = handlers[action];
  if ( !fn ) throw new Error(`${MODULE_ID} | unknown action "${action}"`);
  if ( local || game.user.isGM ) return fn(payload, game.user);
  if ( !game.users.activeGM ) {
    ui.notifications.warn(loc("Notify.NoGM"));
    return null;
  }
  game.socket.emit(SOCKET, { type: "request", action, payload, userId: game.user.id });
  return null;
}

/** Show a notification to a specific user, wherever they are connected. */
export function notifyUser(user, text, level = "warn") {
  if ( !user || user.isSelf ) return ui.notifications[level](text);
  game.socket.emit(SOCKET, { type: "notify", userId: user.id, text, level });
}
