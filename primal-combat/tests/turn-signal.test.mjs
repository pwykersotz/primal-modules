/**
 * Checks for the shared turn signal (scripts/turn-signal.mjs), run with `node tests/turn-signal.test.mjs`: who starts
 * and who ends each turn, in individual and side initiative, and the primal-combat.turnStart and turnEnd hooks.
 */
import assert from "node:assert/strict";

const MODULE = "primal-combat";
const settings = { defaultMode: "standard" };
const calls = [];
const listeners = new Map();
globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1, SECRET: -2 } };
globalThis.Hooks = {
  on(name, fn) { if ( !listeners.has(name) ) listeners.set(name, []); listeners.get(name).push(fn); },
  callAll(name, ...args) {
    calls.push([name, ...args]);
    for ( const fn of listeners.get(name) ?? [] ) {
      try { fn(...args); } catch(err) { /* Foundry logs a listener's error and carries on. */ }
    }
    return true;
  }
};
globalThis.game = {
  settings: { get: (m, k) => settings[k] },
  i18n: { localize: k => k, format: k => k },
  users: { activeGM: { isSelf: true } }
};
globalThis.foundry = { utils: { debounce: fn => fn, getProperty: (o, p) => p.split(".").reduce((x, k) => x?.[k], o) } };

const Signal = await import(new URL("../scripts/turn-signal.mjs", import.meta.url).href);

let nextId = 1;
class Combatant {
  constructor(combat, { name, initiative, pc=false, hostile=false, event=false }) {
    Object.assign(this, { parent: combat, id: `c${nextId++}`, name, initiative, hasPlayerOwner: pc });
    this.flags = event ? { [MODULE]: { event: { count: initiative } } } : {};
    this.token = { disposition: hostile ? -1 : 1 };
  }
  getFlag(scope, key) { return this.flags[scope]?.[key]; }
}

class Combat {
  constructor(mode) {
    this.id = `combat${nextId++}`;
    this.flags = { [MODULE]: { mode } };
    this.round = 0;
    this.turn = null;
    this.previous = undefined;
    const list = [];
    list.get = id => list.find(c => c.id === id);
    this.combatants = list;
    this.turns = [];
  }
  get started() { return this.round > 0; }
  get combatant() { return Number.isInteger(this.turn) ? (this.turns[this.turn] ?? null) : null; }
  getFlag(scope, key) { return this.flags[scope]?.[key]; }
  add(...data) {
    for ( const d of data ) this.combatants.push(new Combatant(this, d));
    this.turns = [...this.combatants].sort((a, b) => b.initiative - a.initiative);
  }
  /** Move to a turn, the way Foundry records it: previous is the turn it left. */
  go(round, turn, options={}) {
    this.previous = { round: this.round, turn: this.turn, combatantId: this.combatant?.id ?? null };
    const changes = {};
    if ( round !== this.round ) changes.round = round;
    if ( turn !== this.turn ) changes.turn = turn;
    this.round = round;
    this.turn = turn;
    Signal.onUpdateCombat(this, changes, options);
  }
}

const names = list => list.map(c => c.name).join(",");
const fired = () => calls.splice(0).map(([hook, , list, ctx]) => `${hook.split(".")[1]}:${names(list)}@${ctx.round}.${ctx.turn}${ctx.side ? `/${ctx.side}` : ""}`);

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

/* ---- Individual initiative ---- */
{
  const combat = new Combat("standard");
  combat.add({ name: "Ann", initiative: 20, pc: true }, { name: "Orc", initiative: 15, hostile: true }, { name: "Bo", initiative: 10, pc: true });
  check("combat start: Ann's turn starts, no one's ends", () => {
    combat.go(1, 0);
    assert.deepEqual(fired(), ["turnStart:Ann@1.0"]);
  });
  check("next turn: Ann ends, Orc starts", () => {
    combat.go(1, 1);
    assert.deepEqual(fired(), ["turnEnd:Ann@1.0", "turnStart:Orc@1.1"]);
    assert.equal(names(Signal.getTurnStarters(combat)), "Orc");
    assert.equal(names(Signal.getTurnEnders(combat)), "Ann");
  });
  check("new round: Bo ends, Ann starts round 2", () => {
    combat.go(1, 2);
    fired();
    combat.go(2, 0);
    assert.deepEqual(fired(), ["turnEnd:Bo@1.2", "turnStart:Ann@2.0"]);
  });
  check("stepping back fires nothing", () => {
    combat.go(1, 2, { direction: -1 });
    assert.deepEqual(fired(), []);
    assert.equal(names(Signal.getTurnStarters(combat)), "Bo");
  });
  check("a change that isn't a turn change fires nothing", () => {
    Signal.onUpdateCombat(combat, { flags: {} });
    assert.deepEqual(fired(), []);
  });
}

/* ---- Side initiative ---- */
{
  // Enemies on 15. Ann beat them; Bo and Cy didn't.
  const combat = new Combat("side");
  combat.add({ name: "Ann", initiative: 20, pc: true }, { name: "Orc", initiative: 15, hostile: true },
    { name: "Gob", initiative: 15, hostile: true }, { name: "Bo", initiative: 10, pc: true }, { name: "Cy", initiative: 5, pc: true });
  check("round 1's opening turn is only the party members who beat the enemies", () => {
    combat.go(1, 0);
    assert.deepEqual(fired(), ["turnStart:Ann@1.0/party"]);
  });
  check("the enemies' turn: Ann ends, both enemies start", () => {
    combat.go(1, 1);
    assert.deepEqual(fired(), ["turnEnd:Ann@1.0/party", "turnStart:Orc,Gob@1.1/enemies"]);
  });
  check("the party's turn: both enemies end, the whole party starts", () => {
    combat.go(1, 3);
    assert.deepEqual(fired(), ["turnEnd:Orc,Gob@1.1/enemies", "turnStart:Ann,Bo,Cy@1.3/party"]);
  });
  check("round 2: the whole party ends, as it started", () => {
    combat.go(2, 1);
    assert.deepEqual(fired(), ["turnEnd:Ann,Bo,Cy@1.3/party", "turnStart:Orc,Gob@2.1/enemies"]);
  });
  check("a client that joined part way works out who ended from the turn order", () => {
    // Forget what this client saw start, as a client that reloaded would have.
    Signal.onDeleteCombat(combat);
    combat.go(2, 3);
    assert.deepEqual(fired(), ["turnEnd:Orc,Gob@2.1/enemies", "turnStart:Ann,Bo,Cy@2.3/party"]);
  });
  check("asking before the hook gives the same answer and the hook still fires once", () => {
    combat.previous = { round: 2, turn: 3, combatantId: combat.combatant.id };
    combat.round = 3; combat.turn = 1;
    assert.equal(names(Signal.getTurnStarters(combat)), "Orc,Gob");
    assert.equal(names(Signal.getTurnEnders(combat)), "Ann,Bo,Cy");
    Signal.onUpdateCombat(combat, { round: 3, turn: 1 });
    assert.deepEqual(fired(), ["turnEnd:Ann,Bo,Cy@2.3/party", "turnStart:Orc,Gob@3.1/enemies"]);
  });
  check("context says whether this client is the active GM", () => {
    game.users.activeGM = { isSelf: false };
    combat.go(3, 3);
    const contexts = calls.splice(0).map(c => c[3].isActiveGM);
    assert.deepEqual(contexts, [false, false]);
    game.users.activeGM = { isSelf: true };
  });
  check("a listener that throws doesn't stop the others", () => {
    const seen = [];
    Hooks.on("primal-combat.turnStart", () => { throw new Error("boom"); });
    Hooks.on("primal-combat.turnStart", (c, list) => seen.push(names(list)));
    combat.go(4, 1);
    fired();
    assert.deepEqual(seen, ["Orc,Gob"]);
  });
}

console.log(`\n${passed} checks passed`);
