/**
 * Checks for companions that finish their turn with someone in side initiative (scripts/companions.mjs), run with
 * `node tests/companions.test.mjs`.
 */
import assert from "node:assert/strict";

const MODULE = "primal-combat";
const settings = { defaultMode: "side", autoAdvance: false, sideTurnMarkers: false };
const getProperty = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
const modules = new Map();
globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1, SECRET: -2 } };
globalThis.Hooks = { callAll() {}, on() {} };
globalThis.canvas = { ready: false };
globalThis.game = {
  settings: { get: (m, k) => settings[k] },
  i18n: { localize: k => k, format: k => k },
  user: { isGM: true },
  userId: "gm",
  users: { activeGM: { isSelf: true } },
  modules: { get: id => modules.get(id) },
  combats: { has: () => true }
};
globalThis.foundry = { utils: { debounce: fn => fn, getProperty, hasProperty: (o, p) => getProperty(o, p) !== undefined, escapeHTML: s => s } };

const Companions = await import(new URL("../scripts/companions.mjs", import.meta.url).href);

let nextId = 1;
const actor = (id, flags = {}) => ({ id, flags, getFlag(scope, key) { return this.flags[scope]?.[key]; } });

class Combatant {
  constructor(combat, { name, initiative, pc = true, hostile = false, actor: a, tokenId, owner = true, defeated = false }) {
    Object.assign(this, { parent: combat, id: `c${nextId++}`, name, initiative, hasPlayerOwner: pc, actor: a, tokenId, isOwner: owner, isDefeated: defeated });
    this.flags = {};
    this.token = tokenId ? { id: tokenId, disposition: hostile ? -1 : 1 } : { disposition: hostile ? -1 : 1 };
  }
  getFlag(scope, key) { return this.flags[scope]?.[key]; }
  async update(changes) {
    for ( const [path, value] of Object.entries(changes) ) {
      const key = path.split(".").pop();
      this.flags[MODULE] ??= {};
      this.flags[MODULE][key] = value;
    }
    await Companions.onUpdateCombatant(this, { flags: { [MODULE]: { done: changes[`flags.${MODULE}.done`] } } }, {}, game.userId);
  }
}

class Combat {
  constructor() {
    this.id = "combat";
    this.flags = { [MODULE]: { mode: "side" } };
    this.round = 2;
    this.turn = 1;
    const list = [];
    list.get = id => list.find(c => c.id === id);
    this.combatants = list;
  }
  get started() { return true; }
  get combatant() { return this.turns[this.turn]; }
  get turns() { return [...this.combatants].sort((a, b) => b.initiative - a.initiative); }
  getFlag(scope, key) { return this.flags[scope]?.[key]; }
  add(data) { const c = new Combatant(this, data); this.combatants.push(c); return c; }
}

const Sides = await import(new URL("../scripts/sides.mjs", import.meta.url).href);
const combat = new Combat();
const orc = combat.add({ name: "Orc", initiative: 15, pc: false, hostile: true, actor: actor("orc") });
const mox = combat.add({ name: "Mox", initiative: 14, actor: actor("mox") });
const cirroc = combat.add({ name: "Cirroc", initiative: 13, pc: false, actor: actor("cirroc", { [MODULE]: { actsWith: "mox" } }) });
const rider = combat.add({ name: "Rider", initiative: 12, actor: actor("rider"), tokenId: "tRider" });
const horse = combat.add({ name: "Horse", initiative: 11.99, pc: false, actor: actor("horse"), tokenId: "tHorse" });
const bo = combat.add({ name: "Bo", initiative: 10, actor: actor("bo") });

const mountFlags = { control: "controlled" };
const horseDoc = { id: "tHorse", parent: null, getFlag: (scope, key) => (scope === "primal-mounts" ? mountFlags[key] : undefined) };
const riderDoc = { id: "tRider" };
modules.set("primal-mounts", { active: true, api: { getPair: t => (t.id === "tRider" || t.id === "tHorse") ? { rider: riderDoc, mount: horseDoc } : null } });

let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`ok - ${name}`); }
const done = () => combat.turns.filter(c => Sides.isDone(c)).map(c => c.name).join(",");

await check("the party is acting", () => {
  assert.deepEqual(Sides.getActingMembers(combat).map(c => c.name), ["Mox", "Cirroc", "Rider", "Horse", "Bo"]);
});
await check("companions: the GM's link and Primal Mounts' controlled mount", () => {
  assert.deepEqual(Companions.getCompanions(mox).map(c => c.name), ["Cirroc"]);
  assert.deepEqual(Companions.getCompanions(rider).map(c => c.name), ["Horse"]);
  assert.deepEqual(Companions.getCompanions(horse).map(c => c.name), [], "the mount isn't the rider's leader");
  assert.deepEqual(Companions.getCompanions(bo).map(c => c.name), []);
});
await check("marking Mox done marks Cirroc done too", async () => {
  await Sides.setDone(mox, true);
  assert.equal(done(), "Mox,Cirroc");
});
await check("marking the rider done marks the controlled mount done", async () => {
  await Sides.setDone(rider, true);
  assert.equal(done(), "Mox,Cirroc,Rider,Horse");
});
await check("marking Mox not done brings Cirroc back", async () => {
  await Sides.setDone(mox, false);
  assert.equal(done(), "Rider,Horse");
});
await check("a companion can still be marked on its own", async () => {
  await Sides.setDone(cirroc, true);
  assert.equal(done(), "Cirroc,Rider,Horse");
  await Sides.setDone(cirroc, false);
});
await check("an independent mount acts on its own", async () => {
  await Sides.setDone(rider, false);
  mountFlags.control = "independent";
  assert.deepEqual(Companions.getCompanions(rider).map(c => c.name), []);
  await Sides.setDone(rider, true);
  assert.equal(done(), "Rider");
  await Sides.setDone(rider, false);
  await Sides.setDone(horse, false);
  mountFlags.control = "controlled";
});
await check("without Primal Mounts, a mount is marked on its own", async () => {
  modules.get("primal-mounts").active = false;
  await Sides.setDone(rider, true);
  assert.equal(done(), "Rider");
  await Sides.setDone(rider, false);
  modules.get("primal-mounts").active = true;
});
await check("a defeated companion or one this client can't change is left alone", async () => {
  cirroc.isDefeated = true;
  await Sides.setDone(mox, true);
  assert.equal(done(), "Mox");
  await Sides.setDone(mox, false);
  cirroc.isDefeated = false;
  game.users.activeGM = { isSelf: false };
  await Sides.setDone(mox, true);
  assert.equal(done(), "Mox", "another client is the active GM, so it does the rest");
  await Sides.setDone(mox, false);
  game.users.activeGM = { isSelf: true };
});
await check("in individual initiative nothing follows", async () => {
  combat.flags[MODULE].mode = "standard";
  await Companions.onUpdateCombatant(mox, { flags: { [MODULE]: { done: "x" } } }, {}, "gm");
  assert.equal(done(), "");
  combat.flags[MODULE].mode = "side";
});
console.log(`\ncompanions: ${passed} checks passed`);
