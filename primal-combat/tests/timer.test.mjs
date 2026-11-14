/**
 * Checks for the turn timer (scripts/timer.mjs), run with `node tests/timer.test.mjs`.
 *
 * One process plays both the GM's client and a player's: `asGM()` and `asPlayer()` switch which one is running.
 * Flag writes reach "both" at once, as they would once the server has broadcast them.
 */
import assert from "node:assert/strict";

let clock = 24_000_000;               // server time: milliseconds since the world was launched
let wallClock = 1_793_573_539_625;      // this computer's clock
const settings = { turnTimer: "all" };
const gmUser = { isSelf: true };
let gmOnline = true;
globalThis.game = {
  settings: { get: (m, k) => settings[k] }, user: { isGM: true }, paused: false,
  users: { get activeGM() { return gmOnline ? gmUser : null; } },
  time: { get serverTime() { return clock; } }
};
Date.now = () => wallClock + clock;
const asGM = () => { game.user.isGM = true; gmUser.isSelf = true; };
const asPlayer = () => { game.user.isGM = false; gmUser.isSelf = false; };
const getProperty = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
const setProperty = (o, p, v) => {
  const ks = p.split(".");
  let x = o;
  for ( const k of ks.slice(0, -1) ) x = (x[k] ??= {});
  x[ks.at(-1)] = v;
};
globalThis.foundry = { utils: { getProperty, setProperty } };
const T = await import(new URL("../scripts/timer.mjs", import.meta.url).href);
const settle = () => new Promise(r => setTimeout(r, 0));

function makeCombat(ids) {
  const combat = {
    id: "c1", round: 0, turn: null, flags: {}, get started() { return this.round > 0; },
    getFlag(m, k) { return this.flags[k]; },
    async setFlag(m, k, v) {
      // Like Foundry: the object is merged into what's stored, then updateCombat runs.
      this.flags[k] = { ...(this.flags[k] ?? {}), ...structuredClone(v) };
      T.onUpdateCombat(this, { flags: {} });
    },
    // The updating client runs preUpdateCombat, then every client gets updateCombat.
    async update(changes) {
      T.onPreUpdateCombat(this, changes);
      const flag = changes.flags?.["primal-combat"]?.turnTimer;
      if ( flag ) this.flags.turnTimer = flag;
      if ( "round" in changes ) this.round = changes.round;
      if ( "turn" in changes ) this.turn = changes.turn;
      const wasGM = game.user.isGM;
      asGM(); T.onUpdateCombat(this, changes);       // the GM's client
      if ( !wasGM ) asPlayer();
    }
  };
  combat.turns = ids.map(id => ({ id }));
  combat.combatants = { get: id => combat.turns.find(c => c.id === id) };
  Object.defineProperty(combat, "combatant", {
    get() { return Number.isInteger(this.turn) ? (this.turns[this.turn] ?? null) : null; }
  });
  return combat;
}
const shown = c => {
  const t = T.getTurnTimer(c);
  return t ? T.formatDuration(T.elapsed(t)) : "hidden";
};
const both = c => {
  asPlayer(); const player = shown(c);
  asGM(); const gm = shown(c);
  assert.equal(player, gm, `GM shows ${gm}, player shows ${player}`);
  return gm;
};

/* ---- Formatting ---- */
assert.equal(T.formatDuration(0), "0:00");
assert.equal(T.formatDuration(65_400), "1:05");
assert.equal(T.formatDuration(3_725_000), "1:02:05");
assert.equal(T.formatDuration(NaN), "0:00");

/* ---- GM starts combat and moves turns ---- */
const c = makeCombat(["a", "b", "c"]);
game.combat = c;
assert.equal(T.getTurnTimer(c), null);
asGM();
await c.update({ round: 1, turn: 0 });
assert.deepEqual(c.flags.turnTimer, { round: 1, turn: 0, combatantId: "a", time: clock, pausedAt: null, server: wallClock });
clock += 42_000;
assert.equal(both(c), "0:42");
await c.update({ turn: 1 });
assert.equal(both(c), "0:00");

/* ---- Someone rolls late: the same creature stays current at a new index, and keeps its time ---- */
clock += 10_000;
c.turns.unshift({ id: "z" });
c.turn = 2;                       // Foundry moves the index locally (no combat update)
asPlayer(); assert.equal(shown(c), "hidden", "a moment with no timer until the GM's client catches up");
asGM(); await T.syncTimer(c); await settle();
assert.equal(c.flags.turnTimer.turn, 2);
assert.equal(both(c), "0:10");

/* ---- A player moves the turn: they can't write flags, so the GM's client does ---- */
asPlayer();
clock += 5_000;
await c.update({ turn: 3 });
await settle();
assert.equal(c.flags.turnTimer.combatantId, "c");
assert.equal(both(c), "0:00");

/* ---- Pause and unpause ---- */
clock += 30_000;
game.paused = true; asGM(); T.onPauseGame(); await settle();
clock += 600_000;
assert.equal(both(c), "0:30", "stopped while paused");
game.paused = false; T.onPauseGame(); await settle();
clock += 2_000;
assert.equal(both(c), "0:32", "carries on from where it stopped");

/* ---- The unpause was missed (what happened in Debo's game): the next redraw on the GM's client fixes it ---- */
game.paused = true; T.onPauseGame(); await settle();
clock += 5_000;
game.paused = false;              // ...but no pauseGame hook reaches the GM's client
clock += 7_000;
asGM(); await T.syncTimer(c); await settle();
assert.equal(c.flags.turnTimer.pausedAt, null);
assert.equal(both(c), "0:32");
clock += 1_000;
assert.equal(both(c), "0:33");

/* ---- A turn starts while the game is paused: it waits at 0:00 ---- */
game.paused = true; T.onPauseGame(); await settle();
asGM(); await c.update({ round: 2, turn: 0 });
clock += 50_000;
assert.equal(both(c), "0:00");
game.paused = false; T.onPauseGame(); await settle();
clock += 3_000;
assert.equal(both(c), "0:03");

/* ---- Restart ---- */
clock += 20_000;
await T.restartTimer(c); await settle();
clock += 1_000;
assert.equal(both(c), "0:01");

/* ---- The creature whose turn it is gets removed: the next one's turn starts from zero ---- */
asGM(); await c.update({ turn: 3 });        // "c"
clock += 4_000;
c.turns.splice(3, 1);                       // "c" is removed...
c.turn = 0;                                 // ...and Foundry moves the turn to the next survivor, "z"
T.onDeleteCombatant({ parent: c }); await settle();
assert.equal(c.flags.turnTimer.combatantId, "z");
assert.equal(both(c), "0:00");
// Removed when the next creature lands on the same index:
await c.update({ turn: 1 });                // "a"
clock += 9_000;
c.turns.splice(1, 1);                       // "a" removed, "b" slides into index 1
T.onDeleteCombatant({ parent: c }); await settle();
assert.equal(c.flags.turnTimer.combatantId, "b");
assert.equal(both(c), "0:00");

/* ---- A flag saved by version 1.3.0 (no turn index) is picked up without a jump ---- */
c.flags.turnTimer = { round: 2, combatantId: "b", time: clock - 15_000, pausedAt: clock - 13_000 };
asGM(); await T.syncTimer(c); await settle();
assert.equal(c.flags.turnTimer.turn, 1);
assert.equal(both(c), "0:02");

/* ---- The world is closed mid-turn and launched again: server time starts from zero, so the timer starts afresh ---- */
clock += 40_000;
assert.equal(both(c), "0:42");
wallClock += clock + 3_600_000;         // an hour later, the world is launched again...
clock = 5_000;                          // ...and server time counts from that launch
game.paused = true;                     // worlds load paused
asGM(); await T.syncTimer(c); await settle();
assert.equal(both(c), "0:00");
game.paused = false; T.onPauseGame(); await settle();
clock += 6_000;
assert.equal(both(c), "0:06");
// The same if the new launch has already run longer than the old one had:
clock += 50_000_000;
c.flags.turnTimer = { ...c.flags.turnTimer, server: c.flags.turnTimer.server - 7_200_000 };
asGM(); await T.syncTimer(c); await settle();
assert.equal(both(c), "0:00");

/* ---- Who sees it ---- */
assert.ok(T.isTimerVisible());
settings.turnTimer = "gm"; assert.ok(T.isTimerVisible());
asPlayer(); assert.ok(!T.isTimerVisible());
settings.turnTimer = "none"; asGM(); assert.ok(!T.isTimerVisible());

/* ---- No GM online: each client counts for itself ---- */
gmOnline = false; asPlayer();
const solo = makeCombat(["a", "b"]);
solo.round = 1; solo.turn = 0;
assert.equal(shown(solo), "0:00");
clock += 8_000;
assert.equal(shown(solo), "0:08");
gmOnline = true;

/* ---- Un-starting combat doesn't write a timer ---- */
asGM();
const c2 = makeCombat(["a"]);
c2.round = 1; c2.turn = 0;
await c2.update({ round: 0, turn: null });
assert.equal(c2.flags.turnTimer, undefined);

console.log("timer: all checks passed");
