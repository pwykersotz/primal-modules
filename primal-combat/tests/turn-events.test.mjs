/**
 * Checks for turn start and end in side initiative (scripts/turn-events.mjs), run with `node tests/turn-events.test.mjs`.
 *
 * Foundry, dnd5e, Midi-QOL and DAE are stood in for by small fakes that copy the parts that matter:
 * - Foundry's Combat#_manageTurnEvents: end the prior turn, run passed-over turns as skipped (start then end), end and
 *   start rounds, start the new turn. Run in every combination of: skipped turns on or off; the effect registry refresh
 *   and movement history clearing done by _manageTurnEvents, or inside Combat#_onStartTurn.
 * - dnd5e 6.0.6: Combat5e#_onStartTurn and #_onEndTurn (which drop the context when calling super), and
 *   ActiveEffect5e#isExpiryEvent for its start/end of the affected or originating creature's turn (copied).
 * - Midi-QOL 14.6.2: its WRAPPER on _onStartTurn/_onEndTurn running processTurnOverTime after the wrapped call, put on
 *   the prototype as an accessor the way libWrapper does.
 * - DAE 14.6.2: its preUpdateCombat and updateCombat hooks and processMacroRepeats (copied).
 */
import assert from "node:assert/strict";

/* -------------------------------------------- */
/*  A small Foundry                             */
/* -------------------------------------------- */

const hooks = new Map();
globalThis.Hooks = {
  on(name, fn) { if ( !hooks.has(name) ) hooks.set(name, []); hooks.get(name).push(fn); return fn; },
  once(name, fn) { return this.on(name, fn); },
  callAll(name, ...args) { for ( const fn of hooks.get(name) ?? [] ) fn(...args); return true; },
  call(name, ...args) { for ( const fn of hooks.get(name) ?? [] ) if ( fn(...args) === false ) return false; return true; }
};
const getProperty = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);
const setProperty = (obj, path, value) => {
  const keys = path.split(".");
  const last = keys.pop();
  let target = obj;
  for ( const k of keys ) target = (target[k] ??= {});
  target[last] = value;
  return true;
};
globalThis.foundry = {
  utils: {
    debounce: fn => fn,
    getProperty,
    setProperty,
    hasProperty: (obj, path) => getProperty(obj, path) !== undefined,
    deepClone: v => structuredClone(v),
    escapeHTML: s => s
  },
  documents: {}
};
globalThis.CONST = { TOKEN_DISPOSITIONS: { HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 } };

const log = [];
const record = (...entry) => log.push(entry.join(" "));
let variant = {};

/** The effect registry: checks every effect against an expiry event. */
const registry = {
  effects: new Set(),
  async refresh(event, context={}) {
    record("refresh", event, context.round, context.turn);
    for ( const effect of [...this.effects] ) {
      if ( effect.isExpiryEvent(event, context) ) {
        this.effects.delete(effect);
        effect.actor.effects = effect.actor.effects.filter(e => e !== effect);
        record("expire", effect.name, "on", effect.actor.name);
      }
    }
  }
};

class ActiveEffect {
  constructor({ name, actor, expiry, start, macroRepeat, source }) {
    Object.assign(this, { name, actor, id: name, disabled: false, isSuppressed: false });
    this.duration = { expiry, expired: false };
    this.start = start;
    this.flags = macroRepeat ? { dae: { macroRepeat } } : {};
    this.system = { changes: [] };
    this.source = source;
    actor.effects.push(this);
    if ( expiry ) registry.effects.add(this);
  }
  static PSEUDO_EXPIRIES = new Set(["sourceStart", "sourceEnd", "targetStart", "targetEnd"]);
  get specialDuration() { return ActiveEffect.PSEUDO_EXPIRIES.has(this.duration.expiry) ? this.duration.expiry : null; }
  getSourceActor() { return this.source ?? this.actor; }
  toObject() { return { name: this.name }; }

  /** Foundry's own check, roughly: a turnStart/turnEnd effect ends at the edge of the turn it started in. */
  _coreIsExpiryEvent(event, context) {
    if ( event !== this.duration.expiry ) return false;
    const combat = context.combat ?? game.combat;
    if ( event === "turnStart" ) return (combat.combatant?.id === this.start.combatant) && (context.round > this.start.round);
    if ( event === "turnEnd" ) return (combat.previous.combatantId === this.start.combatant) && (context.round >= this.start.round);
    return false;
  }

  /** dnd5e 6.0.6 ActiveEffect5e#isExpiryEvent, copied. */
  isExpiryEvent(event, context={}) {
    const special = this.specialDuration;
    if ( !special ) return this._coreIsExpiryEvent(event, context);
    if ( (event === "updateWorldTime") && !this.actor?.inCombat ) return true;
    const isStart = special.endsWith("Start");
    if ( event !== (isStart ? "turnStart" : "turnEnd") ) return false;
    if ( !this.start.combat ) return true;
    const combat = context.combat ?? game.combat;
    if ( combat !== this.start.combat ) return false;
    const origin = special.startsWith("target") ? this.actor : this.getSourceActor();
    const [combatant] = combat.getCombatantsByActor(origin);
    if ( !combatant ) return this.start.round < context.round;
    const originTurn = isStart ? (combat.combatant === combatant) : (combat.previous.combatantId === combatant.id);
    if ( !originTurn ) return false;
    return (this.start.round !== context.round) || (this.start.turn !== context.turn);
  }
}
ActiveEffect.registry = registry;
foundry.documents.ActiveEffect = ActiveEffect;

class Actor {
  constructor(name) {
    Object.assign(this, { name, id: name, uuid: `Actor.${name}`, effects: [], items: [], flags: {}, inCombat: true });
  }
  allApplicableEffects() { return this.effects; }
  async unsetFlag(scope, key) {
    record("midi unset", key, "on", this.name);
    const parts = key.split(".");
    const last = parts.pop();
    delete getProperty(this.flags[scope], parts.join("."))?.[last];
  }
}

class Combatant {
  constructor(combat, { name, initiative, side, owner=false, defeated=false }) {
    Object.assign(this, { parent: combat, name, id: name, initiative, isDefeated: defeated, hasPlayerOwner: owner });
    this.actor = new Actor(name);
    this.token = { id: `T${name}`, disposition: side === "enemies" ? -1 : 1 };
    this.tokenId = this.token.id;
    this.flags = {};
  }
  getFlag(scope, key) { return this.flags[scope]?.[key]; }
}

/** Foundry's Combat, cut down to its turn handling. */
class CoreCombat {
  constructor() {
    this.id = "C1";
    this.round = 0;
    this.turn = null;
    this.flags = { "primal-combat": { mode: "side" } };
    this.settings = { skipDefeated: false };
    this.combatantsList = [];
    this.previous = undefined;
    this.current = { round: 0, turn: null, combatantId: null, tokenId: null };
  }
  get combatants() {
    const list = this.combatantsList;
    return Object.assign([...list], { get: id => list.find(c => c.id === id), contents: list, size: list.length });
  }
  get started() { return this.round > 0; }
  get turns() { return [...this.combatantsList].sort((a, b) => b.initiative - a.initiative); }
  get combatant() { return this.turns[this.turn]; }
  getFlag(scope, key) { return this.flags[scope]?.[key]; }
  getCombatantsByActor(actor) { return this.combatantsList.filter(c => c.actor === actor); }
  getTimeDelta() { return 0; }
  async nextTurn() {}
  async previousTurn() {}
  async startCombat() { return this.update({ round: 1, turn: 0 }); }
  async nextRound() { return this.update({ round: this.round + 1, turn: 0 }); }
  _sortCombatants(a, b) { return b.initiative - a.initiative; }

  async update(changes, options={}) {
    if ( !Hooks.call("preUpdateCombat", this, changes, options, "gm") ) return this;
    options = JSON.parse(JSON.stringify(options)); // Options go to the server and back.
    Object.assign(this, changes);
    this.previous = this.current;
    this.current = { round: this.round, turn: this.turn, combatantId: this.combatant?.id ?? null,
      tokenId: this.combatant?.tokenId ?? null };
    const events = (options.turnEvents !== false) ? this._manageTurnEvents() : null;
    Hooks.callAll("updateCombat", this, changes, options, "gm");
    await events;
    return this;
  }

  async _manageTurnEvents() {
    if ( !this.started ) return;
    const { previous, current } = this;
    const advanceRound = current.round > (previous.round ?? -1);
    const advanceTurn = advanceRound || (current.turn > (previous.turn ?? -1));
    const changeCombatant = current.combatantId !== previous.combatantId;
    if ( !(advanceTurn || advanceRound || changeCombatant) ) return;
    const turns = this.turns;

    const prior = this.combatants.get(previous.combatantId);
    if ( (advanceTurn || changeCombatant) && prior ) {
      const context = { round: previous.round, turn: previous.turn, skipped: false };
      await this._onEndTurn(prior, context);
      if ( variant.refreshIn === "manage" ) await registry.refresh("turnEnd", { combat: this, ...context });
    }
    const skip = async (round, turn) => {
      const context = { round, turn, skipped: true };
      await this._onStartTurn(turns[turn], context);
      if ( variant.clearIn === "manage" ) await this._clearMovementHistoryOnStartTurn(turns[turn], context);
      await this._onEndTurn(turns[turn], context);
    };
    if ( variant.skipped && advanceTurn && Number.isFinite(previous.turn) ) {
      const lastTurn = advanceRound ? turns.length : current.turn;
      for ( let t = previous.turn + 1; t < lastTurn; t++ ) await skip(previous.round, t);
    }
    if ( advanceRound && previous.round ) await this._onEndRound({ round: previous.round, skipped: false });
    if ( advanceRound ) await this._onStartRound({ round: current.round, skipped: false });
    if ( variant.skipped && advanceRound && previous.round ) {
      for ( let t = 0; t < current.turn; t++ ) await skip(current.round, t);
    }
    const next = this.combatant;
    if ( (advanceTurn || changeCombatant) && next ) {
      const context = { round: current.round, turn: current.turn, skipped: false };
      await this._onStartTurn(next, context);
      if ( variant.clearIn === "manage" ) await this._clearMovementHistoryOnStartTurn(next, context);
      if ( variant.refreshIn === "manage" ) await registry.refresh("turnStart", { combat: this, ...context });
    }
    Hooks.callAll("combatTurnChange", this, this.previous, this.current);
  }

  async _onStartTurn(combatant, context) {
    record("core start", combatant.name, context?.skipped ? "skipped" : "");
    if ( variant.clearIn === "onStartTurn" ) await this._clearMovementHistoryOnStartTurn(combatant, context);
    if ( variant.refreshIn === "onStartTurn" ) {
      await registry.refresh("turnStart", { combat: this, round: context?.round ?? this.round, turn: context?.turn ?? this.turn });
    }
  }
  async _onEndTurn(combatant, context) {
    record("core end", combatant.name, context?.skipped ? "skipped" : "");
    if ( variant.refreshIn === "onStartTurn" ) {
      await registry.refresh("turnEnd", { combat: this, round: context?.round ?? this.previous.round,
        turn: context?.turn ?? this.previous.turn });
    }
  }
  async _onStartRound() {}
  async _onEndRound() {}
  async _clearMovementHistoryOnStartTurn(combatant, context) {
    record("clear", combatant.name, context?.skipped ? "skipped" : "");
  }
}

/** dnd5e 6.0.6's Combat5e: drops the context when calling super. */
class Combat5e extends CoreCombat {
  async _onStartTurn(combatant) {
    await super._onStartTurn(combatant);
    record("dnd5e recover turnStart", combatant.name);
  }
  async _onEndTurn(combatant) {
    await super._onEndTurn(combatant);
    record("dnd5e recover turnEnd", combatant.name);
  }
}

/** Midi-QOL's WRAPPER, as an accessor on the prototype the way libWrapper installs it. */
for ( const [name, start] of [["_onStartTurn", true], ["_onEndTurn", false]] ) {
  const original = Combat5e.prototype[name];
  const wrapper = async function(combatant, context) {
    await original.call(this, combatant, context);
    if ( (this.previous?.round === this.current.round) && (this.previous?.turn === this.current.turn) ) return;
    record("midi", start ? "start" : "end", combatant.name, context?.skipped ? "skipped" : "");
  };
  Object.defineProperty(Combat5e.prototype, name, { get() { return wrapper; }, configurable: true });
}

globalThis.CONFIG = {
  Combat: { documentClass: Combat5e },
  ActiveEffect: { documentClass: ActiveEffect },
  Token: { objectClass: class { _refreshTurnMarker() {} } }
};

const settings = { defaultMode: "standard", autoAdvance: true, sideTurnMarkers: true };
globalThis.game = {
  user: { isGM: true },
  userId: "gm",
  users: { activeGM: { isSelf: true } },
  combats: new Map(),
  combat: null,
  system: { id: "dnd5e" },
  modules: new Map([["dae", { active: true }], ["midi-qol", { active: true }], ["primal-combat", { active: true }]]),
  settings: { get: (scope, key) => settings[key] },
  i18n: { localize: k => k, format: k => k }
};

/* DAE 14.6.2: hooks registered at init, and processMacroRepeats, copied. */
globalThis.DAE = {
  daeMacro(action, actor, effect, lastArg) { record("dae", lastArg.turn, actor.name); }
};
const getActorEffects = actor => actor.allApplicableEffects();
function processMacroRepeats(combat, update, options) {
  const totalTurns = combat.combatants?.contents.length ?? 0;
  let combatantIndex = 0;
  for (let combatant of combat.turns) {
    if (combatant.actor) {
      let actor = combatant.actor;
      const checkTurn = (update.round ?? combat.round) * totalTurns + (update.turn ?? combat.turn ?? 0);
      let lastCheckedTurn = (foundry.utils.getProperty(options, "dae.combat.round") ?? combat.round) * totalTurns
        + (foundry.utils.getProperty(options, "dae.combat.turn") ?? combat.turn);
      const advanced1Turn = lastCheckedTurn + 1 === checkTurn;
      let combatantNextTurn = (update.round ?? combat.round) * totalTurns + combatantIndex;
      if (combatantNextTurn < checkTurn) combatantNextTurn += totalTurns;
      let combatantLastTurn = (foundry.utils.getProperty(options, "dae.combat.round") ?? combat.round) * totalTurns + combatantIndex;
      for (let effect of getActorEffects(actor)) {
        const macroRepeat = effect.flags?.dae?.macroRepeat;
        switch (macroRepeat) {
          case "startEveryTurn":
          case "startEveryTurnAny":
          case "startEndEveryTurn":
          case "startEndEveryTurnAny":
            if ((checkTurn >= combatantLastTurn && lastCheckedTurn < combatantLastTurn) || checkTurn === combatantNextTurn) {
              if (!(["startEveryTurn", "startEndEveryTurn"].includes(macroRepeat)) || (!effect.disabled && !effect.isSuppressed))
                DAE.daeMacro("each", actor, effect, { turn: "startTurn" });
            }
            if (["startEveryTurn", "startEveryTurnAny"].includes(macroRepeat)) break;
          case "endEveryTurn":
          case "endEveryTurnAny":
            if ((advanced1Turn && combatantLastTurn + 1 === checkTurn)
              || (!advanced1Turn && combatantLastTurn < checkTurn && combatantLastTurn >= lastCheckedTurn)) {
              if (["endEveryTurn", "startEndEveryTurn"].includes(macroRepeat) && (effect.disabled || effect.isSuppressed)) break;
              DAE.daeMacro("each", actor, effect, { turn: "endTurn" });
            }
            break;
        }
      }
    }
    combatantIndex += 1;
  }
}
Hooks.on("preUpdateCombat", (combat, update, options) => {
  foundry.utils.setProperty(options, "dae.combat.round", combat.round);
  foundry.utils.setProperty(options, "dae.combat.turn", combat.turn);
  return true;
});
Hooks.on("updateCombat", (combat, update, options) => {
  if ( update.round === undefined && update.turn === undefined ) return;
  processMacroRepeats(combat, update, options);
});

/* -------------------------------------------- */
/*  Primal Combat, set up as Foundry would      */
/* -------------------------------------------- */

const { applyPatches } = await import("../scripts/patches.mjs");
const TurnEvents = await import("../scripts/turn-events.mjs");
const Sides = await import("../scripts/sides.mjs");
applyPatches();                                            // setup
TurnEvents.wrapEffectRegistry();                           // ready
Hooks.on("preUpdateCombat", TurnEvents.onPreUpdateCombat); // ready, after DAE's (init)

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

let passed = 0;
const TAKE_OVER_NAMES = ["_onStartTurn", "_onEndTurn", "_clearMovementHistoryOnStartTurn"];
function check(name, fn) {
  fn();
  passed++;
}

/** The order in this test: P1 beat the enemies; E1 and E2 act on 14; P2 and P3 after. */
function makeCombat({ mode="side", defeated=[] }={}) {
  const combat = new Combat5e();
  combat.flags["primal-combat"].mode = mode;
  for ( const [name, initiative, side] of [["P1", 20, "party"], ["E1", 14, "enemies"], ["E2", 14, "enemies"],
    ["P2", 12, "party"], ["P3", 5, "party"]] ) {
    combat.combatantsList.push(new Combatant(combat, { name, initiative, side, owner: side === "party",
      defeated: defeated.includes(name) }));
  }
  for ( const c of combat.combatantsList ) {
    new ActiveEffect({ name: `repeat-${c.name}`, actor: c.actor, macroRepeat: "startEndEveryTurn" });
  }
  game.combat = combat;
  game.combats = new Map([[combat.id, combat]]);
  return combat;
}

/** Run a turn change and return what happened, as sorted lines, leaving out what's asked for. */
async function step(fn, { omit=[] }={}) {
  log.length = 0;
  await fn();
  await new Promise(resolve => setTimeout(resolve, 0)); // DAE macros run a moment later
  return log.filter(line => !omit.some(prefix => line.startsWith(prefix)));
}

const by = prefix => lines => lines.filter(l => l.startsWith(prefix)).map(l => l.slice(prefix.length).trim()).sort();
const coreStarts = by("core start");
const coreEnds = by("core end");
const midiStarts = by("midi start");
const midiEnds = by("midi end");
const daeStarts = by("dae startTurn");
const daeEnds = by("dae endTurn");
const clears = by("clear");
const expired = by("expire");
const sorted = list => [...list].sort();

/* -------------------------------------------- */
/*  The checks                                  */
/* -------------------------------------------- */

const variants = [];
for ( const skipped of [true, false] ) {
  for ( const refreshIn of ["manage", "onStartTurn"] ) {
    for ( const clearIn of ["manage", "onStartTurn"] ) variants.push({ skipped, refreshIn, clearIn });
  }
}

for ( const v of variants ) {
  variant = v;
  const label = JSON.stringify(v);
  registry.effects.clear();
  const combat = makeCombat();
  const assertSide = (lines, { start=[], end=[], forward=true }, what) => {
    check(`${label} ${what}`, () => {
      assert.deepEqual(coreStarts(lines), sorted(start), `${label} ${what}: core turn starts`);
      assert.deepEqual(coreEnds(lines), sorted(end), `${label} ${what}: core turn ends`);
      assert.deepEqual(midiStarts(lines), sorted(start), `${label} ${what}: Midi turn starts`);
      assert.deepEqual(midiEnds(lines), sorted(end), `${label} ${what}: Midi turn ends`);
      assert.deepEqual(daeStarts(lines), sorted(start), `${label} ${what}: DAE start repeats`);
      assert.deepEqual(daeEnds(lines), forward ? sorted(end) : [], `${label} ${what}: DAE end repeats`);
      assert.deepEqual(clears(lines), sorted(start), `${label} ${what}: movement history cleared`);
      assert.ok(!lines.some(l => l.includes("skipped")), `${label} ${what}: nothing passed over reaches the turn steps`);
      assert.deepEqual(by("dnd5e recover turnStart")(lines), sorted(start), `${label} ${what}: dnd5e turn start recovery`);
      for ( const name of TAKE_OVER_NAMES ) {
        assert.ok(!Object.prototype.hasOwnProperty.call(combat, name), `${label} ${what}: ${name} given back`);
      }
    });
  };

  // Round 1 opens with P1, who beat the enemies.
  let lines = await step(() => combat.startCombat());
  assertSide(lines, { start: ["P1"] }, "round 1 opening");

  // P1 says "until the start of my next turn" on E2 during the opening turn (dnd5e sourceStart).
  new ActiveEffect({ name: "P1-mark", actor: combat.combatant.parent.combatants.get("E2").actor, expiry: "sourceStart",
    source: combat.combatants.get("P1").actor, start: { combat, combatant: "P1", round: 1, turn: 0 } });

  // The enemies' turn.
  lines = await step(() => Sides.nextSide(combat));
  assertSide(lines, { start: ["E1", "E2"], end: ["P1"] }, "round 1 enemies");

  // During the enemies' turn P1 and P3 use their reactions (Midi's marker: targetStart) and E2 hits P3 with a mark that
  // lasts until the end of E2's next turn (dnd5e sourceEnd).
  for ( const name of ["P1", "P3"] ) {
    new ActiveEffect({ name: `reaction-${name}`, actor: combat.combatants.get(name).actor, expiry: "targetStart",
      start: { combat, combatant: "E1", round: 1, turn: 1 } });
  }
  new ActiveEffect({ name: "E2-mark", actor: combat.combatants.get("P3").actor, expiry: "sourceEnd",
    source: combat.combatants.get("E2").actor, start: { combat, combatant: "E1", round: 1, turn: 1 } });

  // The whole party's turn (P2 is first of it).
  lines = await step(() => Sides.nextSide(combat));
  assertSide(lines, { start: ["P1", "P2", "P3"], end: ["E1", "E2"] }, "round 1 party");
  check(`${label} round 1 party expiry`, () => {
    // E2-mark lasts until the end of E2's next turn, not this one (it was put on in this turn).
    assert.deepEqual(expired(lines), sorted(["P1-mark on E2", "reaction-P1 on P1", "reaction-P3 on P3"]));
  });

  // P3 uses its reaction in its own side's turn: it ends at the start of P3's next turn, not this one.
  new ActiveEffect({ name: "reaction-P3b", actor: combat.combatants.get("P3").actor, expiry: "targetStart",
    start: { combat, combatant: "P2", round: 1, turn: 3 } });

  // Round 2: the enemies (P1 is passed over at the top of the round, and doesn't get a turn here).
  lines = await step(() => Sides.nextSide(combat));
  assertSide(lines, { start: ["E1", "E2"], end: ["P1", "P2", "P3"] }, "round 2 enemies");
  check(`${label} round 2 enemies expiry`, () => assert.deepEqual(expired(lines), []));

  // Round 2: the party. E2's turn ended last time, so E2-mark went then; reaction-P3b goes now.
  lines = await step(() => Sides.nextSide(combat));
  assertSide(lines, { start: ["P1", "P2", "P3"], end: ["E1", "E2"] }, "round 2 party");
  check(`${label} round 2 party expiry`, () => {
    assert.deepEqual(expired(lines), ["E2-mark on P3", "reaction-P3b on P3"]);
  });

  // Round 3 enemies, round 3 party: same again.
  lines = await step(() => Sides.nextSide(combat));
  assertSide(lines, { start: ["E1", "E2"], end: ["P1", "P2", "P3"] }, "round 3 enemies");
  lines = await step(() => Sides.nextSide(combat));
  assertSide(lines, { start: ["P1", "P2", "P3"], end: ["E1", "E2"] }, "round 3 party");

  // Going back a side: Foundry ends the side being left and starts the one returned to (DAE ends only going forward).
  lines = await step(() => Sides.previousSide(combat));
  assertSide(lines, { start: ["E1", "E2"], end: ["P1", "P2", "P3"], forward: false }, "back to round 3 enemies");
}

/* Defeated creatures, with Foundry set to skip them: their steps run as skipped, the way Foundry passes over them. */
{
  variant = { skipped: true, refreshIn: "manage", clearIn: "manage" };
  registry.effects.clear();
  const combat = makeCombat({ defeated: ["E2"] });
  combat.settings.skipDefeated = true;
  await step(() => combat.startCombat());
  const lines = await step(() => Sides.nextSide(combat));
  check("defeated E2 is passed over as skipped", () => {
    assert.deepEqual(midiStarts(lines), ["E1", "E2 skipped"], "E2's turn start runs as skipped");
    assert.deepEqual(coreStarts(lines), ["E1", "E2"]);
    assert.deepEqual(clears(lines), ["E1"], "no movement history clearing for a skipped turn");
    assert.equal(lines.filter(l => l.startsWith("refresh turnStart")).length, 1, "no expiry check for a skipped turn");
  });
}

/* Midi's once-per-turn optional bonuses reset for everyone starting their turn with the side. */
{
  variant = { skipped: true, refreshIn: "manage", clearIn: "manage" };
  registry.effects.clear();
  const combat = makeCombat();
  await step(() => combat.startCombat());
  await step(() => Sides.nextSide(combat));
  const p3 = combat.combatants.get("P3").actor;
  const bonus = new ActiveEffect({ name: "sneaky", actor: p3 });
  bonus.system.changes.push({ key: "flags.midi-qol.optional.sneaky.count", value: "turn" });
  p3.flags["midi-qol"] = { optional: { sneaky: { used: true } } };
  const lines = await step(() => Sides.nextSide(combat));
  check("Midi once-per-turn bonus reset for P3", () => {
    assert.ok(lines.includes("midi unset optional.sneaky.used on P3"));
    assert.equal(p3.flags["midi-qol"].optional.sneaky.used, undefined);
  });
}

/* Individual initiative is left alone: Foundry's own steps, passed-over turns and all. */
{
  variant = { skipped: true, refreshIn: "manage", clearIn: "manage" };
  registry.effects.clear();
  const combat = makeCombat({ mode: "standard" });
  await step(() => combat.startCombat());
  const lines = await step(() => combat.update({ round: 1, turn: 3 }, { direction: 1 }));
  check("individual initiative: Foundry's steps untouched", () => {
    assert.deepEqual(coreStarts(lines), ["E1", "E2", "P2"]);
    assert.deepEqual(coreEnds(lines), ["E1", "E2", "P1"]);
    assert.deepEqual(midiStarts(lines), ["E1 skipped", "E2 skipped", "P2"], "Midi sees the skipped turns as Foundry hands them over");
    assert.deepEqual(daeStarts(lines), ["E1", "E2", "P2"], "DAE works out its own repeats");
    for ( const name of TAKE_OVER_NAMES ) assert.ok(!Object.prototype.hasOwnProperty.call(combat, name));
  });
}

/* A side with one creature in it goes through Foundry's own step only. */
{
  variant = { skipped: false, refreshIn: "manage", clearIn: "manage" };
  registry.effects.clear();
  const combat = makeCombat();
  const lines = await step(() => combat.startCombat());
  check("a one-creature side", () => {
    assert.deepEqual(coreStarts(lines), ["P1"]);
    assert.equal(lines.filter(l => l.startsWith("refresh turnStart")).length, 1);
  });
}

console.log(`turn-events: ${passed} checks passed`);
