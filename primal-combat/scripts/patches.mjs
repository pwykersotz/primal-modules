/**
 * Changes to Foundry's own combat behaviour while a combat uses side initiative:
 * - Next Turn and Previous Turn (from anywhere: the carousel, the sidebar tracker, macros) move a whole side at a time.
 * - Begin Combat gives the enemies their number and posts who goes first.
 * - A party member who ties the enemies goes after them.
 * - Every token on the acting side shows the turn marker until its player marks it done.
 * - Turn start and end steps run for everyone on the acting side (turn-events.mjs).
 * Individual-initiative combats are left exactly as Foundry runs them, except that lair actions and other events
 * (events.mjs) go in their place in the turn order and keep their count when initiative is reset.
 */
import { MODULE_ID } from "./constants.mjs";
import {
  announceOrder, applyEnemyInitiative, compareSides, eventCount, isEvent, isSideMode, nextSide, previousSide,
  rollPartyNPCs, setOwnDone, wantsSideTurnMarker
} from "./sides.mjs";
import { restoreCounts } from "./events.mjs";
import { isExpiryEvent, manageSideTurnEvents } from "./turn-events.mjs";
import { beforeRollInitiative } from "./encounter.mjs";

/**
 * Wrap a method, through libWrapper when it's active so other modules' wrappers keep working.
 * @param {string} path      Dotted path to the object holding the method, from globalThis.
 * @param {string} method
 * @param {Function} fn      Called as fn.call(instance, wrapped, ...args).
 */
function wrap(path, method, fn) {
  if ( globalThis.libWrapper ) {
    globalThis.libWrapper.register(MODULE_ID, `${path}.${method}`, fn, "MIXED");
    return;
  }
  const target = foundry.utils.getProperty(globalThis, path);
  const original = target?.[method];
  if ( typeof original !== "function" ) {
    console.warn(`${MODULE_ID} | Could not find ${path}.${method} to extend`);
    return;
  }
  target[method] = function(...args) {
    return fn.call(this, original.bind(this), ...args);
  };
}

/** Called once, in the setup hook (after the game system has set its document and object classes). */
export function applyPatches() {
  const combatProto = "CONFIG.Combat.documentClass.prototype";

  // Rolling initiative always adds the creature to combat, and a player rolling with no combat running gets one
  // started by the GM's client (encounter.mjs).
  wrap("CONFIG.Actor.documentClass.prototype", "rollInitiative", async function(wrapped, options={}, ...args) {
    options ??= {};
    try {
      await beforeRollInitiative(this, options);
    } catch(err) {
      console.error(`${MODULE_ID} | Could not get ${this.name} into combat`, err);
    }
    return wrapped(options, ...args);
  });

  // For a player, End Turn in side initiative means "I'm done": it marks their own characters, and the side moves on
  // once everyone is. Only the GM's Next Turn ends the whole side's turn.
  wrap(combatProto, "nextTurn", function(wrapped, ...args) {
    if ( this.started && isSideMode(this) ) return game.user.isGM ? nextSide(this) : setOwnDone(this, true);
    return wrapped(...args);
  });

  wrap(combatProto, "previousTurn", function(wrapped, ...args) {
    if ( this.started && isSideMode(this) ) return game.user.isGM ? previousSide(this) : setOwnDone(this, false);
    return wrapped(...args);
  });

  // Before side initiative begins: the GM's creatures on the party's side roll if they haven't, and the enemies get
  // their number (worked out again, in case anyone joined or left). Afterwards, chat says who goes first.
  wrap(combatProto, "startCombat", async function(wrapped, ...args) {
    if ( !isSideMode(this) || !game.user.isGM ) return wrapped(...args);
    await rollPartyNPCs(this);
    await applyEnemyInitiative(this);
    const result = await wrapped(...args);
    await announceOrder(this);
    return result;
  });

  // Resetting initiative leaves lair actions and other events on their counts.
  wrap(combatProto, "resetAll", async function(wrapped, ...args) {
    const counts = this.combatants.filter(isEvent).map(c => ({ _id: c.id, initiative: eventCount(c) }));
    const result = await wrapped(...args);
    if ( counts.length ) await restoreCounts(this, counts);
    return result;
  });

  // A turn change in side initiative: turn start for everyone acting when a side's turn begins, turn end for everyone
  // who acted when it ends, instead of only for the combatant Combat#turn points at.
  wrap(combatProto, "_manageTurnEvents", function(wrapped, ...args) {
    return manageSideTurnEvents(this, () => wrapped(...args));
  });

  // Effects that end at the start or end of a creature's turn (Foundry 14) see each creature's own turn edge.
  if ( typeof CONFIG.ActiveEffect?.documentClass?.prototype?.isExpiryEvent === "function" ) {
    wrap("CONFIG.ActiveEffect.documentClass.prototype", "isExpiryEvent", isExpiryEvent);
  }

  // Ties between a party member and the enemies go to the enemies, and events go where they belong (compareSides).
  // The sort is called without `this`
  // (turns.sort(this._sortCombatants)), so it's patched directly rather than through libWrapper.
  const proto = CONFIG.Combat.documentClass.prototype;
  const sortCombatants = proto._sortCombatants;
  if ( typeof sortCombatants === "function" ) {
    proto._sortCombatants = function(a, b) {
      return compareSides(a, b) ?? sortCombatants.call(this, a, b);
    };
  }

  wrap("CONFIG.Token.objectClass.prototype", "_refreshTurnMarker", function(wrapped, ...args) {
    const wanted = wantsSideTurnMarker(this);
    if ( wanted === null ) return wrapped(...args);

    // The same as Foundry's own Token#_refreshTurnMarker, with "is it this token's turn" replaced.
    const { turnMarker } = this.document;
    const enabled = CONFIG.Combat.settings.turnMarker?.enabled
      && (turnMarker?.mode !== CONST.TOKEN_TURN_MARKER_MODES.DISABLED);
    if ( enabled && wanted ) {
      if ( !this.turnMarker ) {
        const TokenTurnMarker = foundry.canvas.placeables.tokens.TokenTurnMarker;
        this.turnMarker = this.addChildAt(new TokenTurnMarker(this), 0);
      }
      canvas.tokens.turnMarkers.add(this);
      this.turnMarker.draw();
    }
    else if ( this.turnMarker ) {
      canvas.tokens.turnMarkers.delete(this);
      this.turnMarker.destroy();
      this.turnMarker = null;
    }
  });
}
