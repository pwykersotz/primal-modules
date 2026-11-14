/**
 * Optionally stop a double right-click on a token from opening its Token Config.
 *
 * In Foundry V14, Token#_onClickRight2 opens the token's configuration sheet for a user who owns the token and may
 * configure tokens, and toggles the token's target for everyone else. With the setting on, the first case does
 * nothing instead: the first right-click has already opened the Token HUD, so a double right-click just leaves the
 * HUD open. Targeting by double right-click, for users who can't configure the token, is left as Foundry has it.
 */
import { MODULE_ID, SETTINGS } from "./constants.mjs";

const TOKEN_PROTO = "foundry.canvas.placeables.Token.prototype";

/** Called once, in the setup hook. */
export function registerTokenClicks() {
  if ( globalThis.libWrapper ) {
    globalThis.libWrapper.register(MODULE_ID, `${TOKEN_PROTO}._onClickRight2`, onClickRight2, "MIXED");
    return;
  }
  const proto = foundry.canvas.placeables.Token.prototype;
  const original = proto._onClickRight2;
  if ( typeof original !== "function" ) {
    console.warn(`${MODULE_ID} | Could not find ${TOKEN_PROTO}._onClickRight2 to extend`);
    return;
  }
  proto._onClickRight2 = function(...args) {
    return onClickRight2.call(this, original.bind(this), ...args);
  };
}

/**
 * @this {foundry.canvas.placeables.Token}
 * @param {Function} wrapped
 * @param {PIXI.FederatedEvent} event
 */
function onClickRight2(wrapped, event, ...args) {
  if ( wouldOpenConfig(this) && isDisabled() ) {
    if ( !this._propagateRightClick(event) ) event.stopPropagation();
    return;
  }
  return wrapped(event, ...args);
}

/** The same test Foundry uses to choose between opening Token Config and targeting. */
function wouldOpenConfig(token) {
  return token.isOwner && game.user.can("TOKEN_CONFIGURE");
}

function isDisabled() {
  try {
    return game.settings.get(MODULE_ID, SETTINGS.disableConfigDoubleClick) !== false;
  } catch(err) {
    return true;
  }
}
