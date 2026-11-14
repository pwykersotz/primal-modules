import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { applyPatches } from "./patches.mjs";
import CombatCarousel from "./carousel.mjs";
import * as Sides from "./sides.mjs";
import * as TurnEvents from "./turn-events.mjs";
import * as Timer from "./timer.mjs";
import * as Encounter from "./encounter.mjs";
import * as Events from "./events.mjs";
import * as TurnSignal from "./turn-signal.mjs";
import * as Companions from "./companions.mjs";

/** @type {CombatCarousel|null} */
let carousel = null;
const refresh = () => carousel?.refresh();

/** Is this document part of the combat being shown? */
function inViewedCombat({ actor, token }={}) {
  const combat = game.combat;
  if ( !combat?.combatants.size ) return false;
  return combat.combatants.some(c => (token && (c.tokenId === token.id))
    || (actor && ((c.actorId === actor.id) || (c.actor === actor))));
}

Hooks.once("init", () => {
  registerSettings({
    onDisplayChange: refresh,
    onMarkersChange: () => Sides.refreshTurnMarkers()
  });
});

Hooks.once("setup", () => {
  applyPatches();
});

Hooks.once("ready", () => {
  carousel = new CombatCarousel();
  carousel.render({ force: true });

  // Combat changes.
  for ( const hook of ["createCombat", "updateCombat", "deleteCombat", "combatTurnChange", "createCombatant",
    "deleteCombatant", "renderCombatTracker", "canvasReady"] ) Hooks.on(hook, refresh);
  Hooks.on("updateCombatant", (...args) => {
    Sides.onUpdateCombatant(...args);
    refresh();
  });
  Hooks.on("updateCombatant", Companions.onUpdateCombatant); // A rider marked done takes its controlled mount with it.
  Hooks.on("createCombatant", Sides.onCreateCombatant);
  Hooks.on("deleteCombatant", Sides.onDeleteCombatant);
  Hooks.on("updateCombat", (combat, changes) => {
    Sides.onUpdateCombatOrder(combat, changes);
    if ( ("turn" in changes) || ("round" in changes) || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) ) {
      Sides.refreshTurnMarkers(combat);
    }
  });
  Hooks.on("canvasReady", () => Sides.refreshTurnMarkers());

  // The turn timer: when each turn starts, shared by everyone, and stopped while the game is paused.
  Hooks.on("preUpdateCombat", Timer.onPreUpdateCombat);
  Hooks.on("updateCombat", Timer.onUpdateCombat);
  Hooks.on("deleteCombatant", Timer.onDeleteCombatant);
  Hooks.on("pauseGame", () => {
    Timer.onPauseGame();
    refresh();
  });
  Timer.syncTimer(game.combat);

  // Getting into and out of combat: a player's initiative roll with no combat running asks the GM's client to start
  // one, and the GM is offered to end combat once every hostile creature is down.
  Hooks.on("updateUser", Encounter.onUpdateUser);
  Hooks.on("updateActor", actor => Encounter.scheduleCheckFor({ actor }));
  Hooks.on("updateToken", token => Encounter.scheduleCheckFor({ token }));
  for ( const hook of ["createCombatant", "updateCombatant", "deleteCombatant"] ) {
    Hooks.on(hook, combatant => Encounter.scheduleCheck(combatant.parent));
  }
  Hooks.on("updateCombat", (combat, changes) => {
    if ( "round" in changes ) Encounter.scheduleCheck(combat);
  });
  Hooks.on("deleteCombat", Encounter.onDeleteCombat);

  // Lair actions and other events on an initiative count: they keep their count, remind the GM when their turn comes,
  // and come and go with a creature that has lair actions.
  Hooks.on("preUpdateCombatant", Events.onPreUpdateCombatant);
  Hooks.on("dnd5e.preCombatRecovery", Events.onPreCombatRecovery);
  Hooks.on("updateCombat", Events.onUpdateCombat);
  Hooks.on("createCombatant", Events.onCreateCombatant);
  Hooks.on("deleteCombatant", Events.onDeleteCombatant);
  Hooks.on("deleteCombat", Events.onDeleteCombat);

  // Turn start and end for the whole acting side in side initiative (the rest is patched in setup).
  TurnEvents.wrapEffectRegistry();
  Hooks.on("preUpdateCombat", TurnEvents.onPreUpdateCombat); // After DAE's own, which it registers at init.
  Hooks.on("deleteCombat", TurnEvents.onDeleteCombat);

  // The shared turn signal: primal-combat.turnEnd and primal-combat.turnStart, with everyone whose turn ended or starts
  // (turn-signal.mjs).
  Hooks.on("updateCombat", TurnSignal.onUpdateCombat);
  Hooks.on("deleteCombat", TurnSignal.onDeleteCombat);

  // Changes to the creatures in it: names, art, HP, being defeated. Before side initiative starts, an enemy's
  // initiative bonus or a token's disposition can change the enemies' number.
  const recheckEnemies = () => {
    const combat = game.combat;
    if ( combat && !combat.started && Sides.isSideMode(combat) ) Sides.scheduleEnemyInitiative(combat);
  };
  Hooks.on("updateActor", actor => {
    if ( !inViewedCombat({ actor }) ) return;
    refresh();
    recheckEnemies();
  });
  Hooks.on("updateToken", (token, changes) => {
    if ( !inViewedCombat({ token }) ) return;
    refresh();
    if ( "disposition" in changes ) recheckEnemies();
  });
  for ( const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"] ) {
    Hooks.on(hook, effect => {
      const actor = effect.parent instanceof Actor ? effect.parent : effect.parent?.parent;
      if ( actor && inViewedCombat({ actor }) ) refresh();
    });
  }
  Hooks.on("hoverToken", (token, hovered) => carousel?.onHoverToken(token, hovered));

  const module = game.modules.get(MODULE_ID);
  console.log(`${MODULE_ID} | ${module?.version ?? ""} ready`);
  if ( !module ) return;
  module.api = {
    carousel,
    /** Re-draw the carousel. */
    refresh,
    getMode: Sides.getMode,
    /** Switch a combat between "standard" and "side" initiative (GM). */
    setMode: Sides.setMode,
    /** "party", "enemies", or "event" for a lair action or other event. */
    getSide: Sides.getSide,
    /** Everyone acting now: the whole acting side (round 1's opening turn: the party members who beat the enemies). */
    getActingMembers: Sides.getActingMembers,
    /** Whose turn it is now (one combatant, or the acting side), and whose turn ended to get here. */
    getTurnStarters: TurnSignal.getTurnStarters,
    getTurnEnders: TurnSignal.getTurnEnders,
    /** The hooks this module calls at each turn edge, with the combatants: {start, end}. */
    turnHooks: { start: TurnSignal.TURN_START, end: TurnSignal.TURN_END },
    /** The enemies' initiative in side initiative: {value, name} of their best static initiative, or null. */
    getEnemyInitiative: Sides.getEnemyInitiative,
    /** Work out the enemies' number again and give it to every enemy (GM). */
    applyEnemyInitiative: Sides.applyEnemyInitiative,
    /** A creature's static initiative (dnd5e initiative score). */
    staticInitiative: Sides.staticInitiative,
    isDone: Sides.isDone,
    /** The combatants that finish their turn with this one in side initiative: its controlled mount, and companions. */
    getCompanions: Companions.getCompanions,
    /** Mark a combatant done (true), not done (false), or flip it (leave out). */
    setDone: Sides.setDone,
    nextSide: Sides.nextSide,
    previousSide: Sides.previousSide,
    /** When the current turn started: {time, pausedAt} in server time, or null. */
    getTurnTimer: Timer.getTurnTimer,
    /** Start the turn timer again from zero (GM). */
    restartTimer: Timer.restartTimer,
    /** Is this combatant a lair action or other event? */
    isEvent: Sides.isEvent,
    /** Add an event: {name, count, img, notes, hidden, remind} (GM). */
    addEvent: Events.addEvent,
    /** Change an event: any of {name, count, img, notes, hidden, remind} (GM). */
    updateEvent: Events.updateEvent,
    /** The GM's form to add an event, or to change one if a combatant is given. */
    openEventDialog: Events.openEventDialog
  };
});
