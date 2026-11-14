// Runs ignacious.mjs against small Foundry fakes: first attack in combat adds the zone and light, the combat ending
// takes them away again. node --test test/ignacious.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const hooks = {};
const once = {};
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
let n = 0;
const docs = new Map();

function flagHost(target, uuid) {
  target.uuid = uuid;
  target.flags ??= {};
  target.getFlag = (scope, key) => target.flags[scope]?.[key];
  target.setFlag = async (scope, key, value) => { (target.flags[scope] ??= {})[key] = clone(value); };
  target.unsetFlag = async (scope, key) => { delete target.flags[scope]?.[key]; };
  docs.set(uuid, target);
  return target;
}

const item = flagHost({ id: "sword", name: "Ignacious", system: { identifier: "ignacious-the-sword-of-burning-truth" } }, "Actor.fred.Item.sword");
const otherItem = flagHost({ id: "dagger", name: "Dagger", system: { identifier: "dagger" } }, "Actor.fred.Item.dagger");
const scene = { id: "scene1", tokens: [] };
const token = flagHost({ id: "tok", parent: scene, actorLink: true, light: { dim: 0, bright: 0, color: null, animation: { type: null } } }, "Scene.scene1.Token.tok");
token.toObject = () => ({ light: clone(token.light) });
token.update = async (data) => { if (data.light) token.light = clone(data.light); };
const fred = flagHost({ id: "fred", name: "Fred", isOwner: true, items: [item, otherItem], effects: [] }, "Actor.fred");
fred.items.find = Array.prototype.find.bind(fred.items);
fred.getActiveTokens = () => [token];
fred.deleteEmbeddedDocuments = async (_t, ids) => { fred.effects = fred.effects.filter((e) => !ids.includes(e.id)); };
item.actor = fred; otherItem.actor = fred; token.actor = fred;
const orc = flagHost({ id: "orc", name: "Orc", effects: [] }, "Actor.orc");
orc.deleteEmbeddedDocuments = async (_t, ids) => { orc.effects = orc.effects.filter((e) => !ids.includes(e.id)); };
const orcToken = { id: "orcTok", actorLink: true, actor: orc, parent: scene };
scene.tokens.push(token, orcToken);
scene.tokens.get = (id) => scene.tokens.find((t) => t.id === id);

const combat = { id: "combat1", started: true, scene, combatants: [{ actor: fred, token }, { actor: orc, token: orcToken }] };
const chats = [];
let inside = true;

globalThis.Hooks = { on: (name, fn) => (hooks[name] ??= []).push(fn), once: (name, fn) => (once[name] ??= []).push(fn) };
globalThis.foundry = { utils: { randomID: () => `rid${String(++n).padStart(13, "0")}`, deepClone: clone, fromUuid: async (u) => docs.get(u) ?? null } };
globalThis.CONFIG = { ChatMessage: { documentClass: { create: async (d) => chats.push(d), getSpeaker: () => ({}) } } };
globalThis.ui = { notifications: { warn: () => {}, info: () => {} } };
globalThis.canvas = { scene };
globalThis.game = {
  user: { isGM: true }, users: { activeGM: { isSelf: true } },
  settings: { get: () => false },
  modules: { get: (id) => (id === "primal-auras" ? { active: true, api: { isInAura: () => inside } } : null) },
  actors: [fred, orc], scenes: [scene],
  combats: { contents: [combat], get: (id) => (id === combat.id ? combat : undefined) }
};

const { registerIgnacious, ignaciousApi } = await import("../scripts/ignacious.mjs");
registerIgnacious();
const fire = async (name, ...args) => { for (const fn of hooks[name] ?? []) await fn(...args); await new Promise((r) => setTimeout(r, 20)); };
const attack = (it) => fire("dnd5e.rollAttack", [], { subject: { item: it, actor: fred } });

test("attacks with another weapon do nothing", async () => {
  await attack(otherItem);
  assert.equal(ignaciousApi.isActive(fred), false);
  assert.equal(token.light.dim, 0);
});

test("no combat, no zone", async () => {
  combat.started = false;
  await attack(item);
  assert.equal(ignaciousApi.isActive(fred), false);
  combat.started = true;
});

test("first attack in combat adds the zone and the light, once", async () => {
  await attack(item);
  await fire("dnd5e.postUseActivity", { type: "attack", item, actor: fred });
  await fire("midi-qol.AttackRollComplete", { item, actor: fred });
  assert.equal(ignaciousApi.isActive(fred), true);
  const auras = item.getFlag("primal-auras", "auras");
  assert.equal(auras.length, 1);
  assert.equal(auras[0].name, "Zone of Truth");
  assert.equal(auras[0].enabled, true);
  assert.equal(token.light.dim, 10);
  assert.equal(token.light.animation.type, "torch");
  assert.equal(chats.length, 1);
});

test("leaving the zone takes the marker off", async () => {
  const auraId = fred.getFlag("primal-drakkenheim", "burningTruth").auraId;
  orc.effects.push({ id: "m1", flags: { "primal-auras": { auraId, sourceTokenId: "tok" } } });
  inside = true;
  await fire("updateToken", orcToken, { x: 100 });
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(orc.effects.length, 1);
  inside = false;
  await fire("updateToken", orcToken, { x: 200 });
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(orc.effects.length, 0);
  inside = true;
});

test("combat ending removes the aura, markers and light", async () => {
  const auraId = fred.getFlag("primal-drakkenheim", "burningTruth").auraId;
  item.flags["primal-auras"].auras.push({ id: "keep", name: "Other aura" });
  orc.effects.push({ id: "m2", flags: { "primal-auras": { auraId, sourceTokenId: "tok" } } });
  orc.effects.push({ id: "other", flags: {} });
  await fire("deleteCombat", { id: "someOtherCombat" });
  assert.equal(ignaciousApi.isActive(fred), true);
  await fire("deleteCombat", combat);
  assert.equal(ignaciousApi.isActive(fred), false);
  assert.deepEqual(item.getFlag("primal-auras", "auras").map((a) => a.id), ["keep"]);
  assert.deepEqual(orc.effects.map((e) => e.id), ["other"]);
  assert.equal(token.light.dim, 0);
  assert.equal(token.light.animation.type, null);
});

test("a new combat draws it again", async () => {
  combat.id = "combat2";
  await attack(item);
  assert.equal(fred.getFlag("primal-drakkenheim", "burningTruth").combatId, "combat2");
  await ignaciousApi.end(fred);
  assert.equal(token.light.dim, 0);
});
