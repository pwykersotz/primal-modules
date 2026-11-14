// Turn triggers under Primal Combat side initiative, and "count as entering" on appear. node --test tests/automation.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
globalThis.foundry = { utils: { deepClone: (v) => JSON.parse(JSON.stringify(v ?? null)), mergeObject: (a, b, o) => Object.assign(o?.inplace === false ? JSON.parse(JSON.stringify(a)) : a, JSON.parse(JSON.stringify(b ?? {}))), randomID: () => "r" + Math.random().toString(36).slice(2, 17) } };
globalThis.game = { modules: { get: () => null }, settings: { get: () => true }, user: { isGM: true }, users: { activeGM: { isSelf: true } } };
globalThis.CONST = { TOKEN_DISPOSITIONS: { SECRET: -2, HOSTILE: -1 } };
const base = new URL("../scripts/", import.meta.url);
const { engine, sideTurnTokenIds, combatTurnSignal } = await import(new URL("automation.js", base));
const { createAura } = await import(new URL("data.js", base));

const cb = (id, side) => ({ id, tokenId: "t" + id, side });
const turns = [cb("a", "party"), cb("b", "party"), cb("x", "enemies"), cb("y", "enemies")];
turns.find = Array.prototype.find.bind(turns);
const combat = { id: "c", round: 2, turn: 2, combatant: turns[2], combatants: Object.assign([...turns], { get: (id) => turns.find((t) => t.id === id) }), turns, started: true };
combat.combatants.find = Array.prototype.find.bind(combat.combatants);
const api = { getMode: () => "side", getSide: (c) => c.side, getActingMembers: (c) => c.turns.filter((t) => t.side === c.combatant.side) };

test("standard initiative: just the combatant", () => {
  assert.deepEqual(sideTurnTokenIds(combat, { tokenId: "tx" }, "current"), ["tx"]);
});

test("side initiative: the whole side", () => {
  game.modules.get = (id) => (id === "primal-combat" ? { active: true, api } : null);
  assert.deepEqual(sideTurnTokenIds(combat, { tokenId: "tx", combatantId: "x" }, "current"), ["tx", "ty"]);
  assert.deepEqual(sideTurnTokenIds(combat, { tokenId: "ta", combatantId: "a" }, "previous"), ["ta", "tb"]);
});

test("turn change starts everyone's turn on the side", async () => {
  const inst = { key: "k", aura: createAura({ effects: [{ mode: "triggered", triggers: { targetTurnStart: true, targetTurnEnd: true } }] }), sourceDoc: { id: "tsrc" } };
  engine.collectInstances = () => [inst];
  engine.computeMembership = () => new Map([["k", new Set(["ta", "tb", "tx", "ty"])]]);
  const ran = []; let expiry;
  engine.runJobs = async (_s, jobs) => { for (const j of jobs) ran.push(`${j.trigger}:${j.targetId}`); };
  engine.expireEffects = async (_s, _c, info) => { expiry = info; };
  engine.reconcileContinuous = async () => {};
  await engine.handleTurnChange({}, combat, { round: 2, turn: 0, tokenId: "ta", combatantId: "a" }, { round: 2, turn: 2, tokenId: "tx", combatantId: "x" });
  assert.deepEqual(ran.sort(), ["targetTurnEnd:ta", "targetTurnEnd:tb", "targetTurnStart:tx", "targetTurnStart:ty"]);
  assert.deepEqual([...expiry.startedTokenIds], ["tx", "ty"]);
  assert.deepEqual([...expiry.ended.tokenIds], ["ta", "tb"]);
});

test("enterOnAppear: creatures already inside count as entering", async () => {
  delete engine.collectInstances; delete engine.computeMembership; delete engine.runJobs;
  const mk = (flag) => ({ key: "new", aura: createAura({ enterOnAppear: flag, effects: [{ mode: "triggered", triggers: { onEnter: true } }] }) });
  for (const [flag, expect] of [[false, []], [true, ["onEnter:tx", "onEnter:ty"]]]) {
    const ran = [];
    engine.collectInstances = () => [mk(flag)];
    engine.computeMembership = () => new Map([["new", new Set(["tx", "ty"])]]);
    engine.runJobs = async (_s, jobs) => { for (const j of jobs) ran.push(`${j.trigger}:${j.targetId}`); };
    engine.membership.set("s", new Map([["old", new Set()]]));
    const scene = { id: "s" };
    globalThis.game.scenes = { get: () => scene };
    globalThis.game.combats = { filter: () => [] }; globalThis.game.combat = null;
    await engine.evaluateScene(scene);
    assert.deepEqual(ran, expect);
  }
});

test("Primal Combat's turn signal: who started and ended comes from it", async () => {
  const signalApi = { ...api, getTurnStarters: () => [turns[2], turns[3]], getTurnEnders: () => [turns[0], turns[1], turns[1]] };
  game.modules.get = (id) => (id === "primal-combat" ? { active: true, api: signalApi } : null);
  assert.deepEqual(combatTurnSignal(combat), { startedIds: ["tx", "ty"], endedIds: ["ta", "tb"] });
  const inst = { key: "k", aura: createAura({ effects: [{ mode: "triggered", triggers: { targetTurnStart: true, targetTurnEnd: true } }] }), sourceDoc: { id: "tsrc" } };
  engine.collectInstances = () => [inst];
  engine.computeMembership = () => new Map([["k", new Set(["ta", "tb", "tx", "ty"])]]);
  const ran = [];
  engine.runJobs = async (_s, jobs) => { for (const j of jobs) ran.push(`${j.trigger}:${j.targetId}`); };
  engine.expireEffects = async () => {};
  engine.reconcileContinuous = async () => {};
  // A different turn record than the signal: the signal wins.
  engine.turnStarts.set("c", { key: "c:2:0", ids: ["ta"] });
  await engine.handleTurnChange({}, combat, { round: 2, turn: 0, tokenId: "ta", combatantId: "a" }, { round: 2, turn: 2, tokenId: "tx", combatantId: "x" }, combatTurnSignal(combat));
  assert.deepEqual(ran.sort(), ["targetTurnEnd:ta", "targetTurnEnd:tb", "targetTurnStart:tx", "targetTurnStart:ty"]);
});

test("without Primal Combat there's no turn signal", () => {
  game.modules.get = () => null;
  assert.equal(combatTurnSignal(combat), null);
});
