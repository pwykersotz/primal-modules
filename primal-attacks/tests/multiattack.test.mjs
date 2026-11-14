/**
 * Checks for the Multiattack routine (scripts/multiattack.mjs), run with `node tests/multiattack.test.mjs`.
 */
import assert from "node:assert/strict";

const modules = new Map();
const chat = [];
globalThis.game = { modules: { get: id => modules.get(id) }, settings: { get: () => true }, i18n: { localize: k => k, format: k => k } };
globalThis.foundry = { utils: { randomID: () => Math.random().toString(36).slice(2) } };
globalThis.ChatMessage = { implementation: { create: async data => chat.push(data), getSpeaker: () => ({}) } };
globalThis.Hooks = { on() {} };

const { routineRows, rollRoutine, plannedRoutine, isMultiattack } = await import(new URL("../scripts/multiattack.mjs", import.meta.url).href);
const { takeCount } = await import(new URL("../scripts/dialog.mjs", import.meta.url).href);

const used = [];
const collection = list => Object.assign([...list], { size: list.length, get: id => list.find(x => x.id === id) });
const activity = (item, id, type, name = "") => ({
  id, type, name, item, uuid: `Actor.a.Item.${item.id}.Activity.${id}`,
  async use() {
    // What the roll would make: the number set ahead for it, with no window shown.
    used.push(`${item.name}${name ? `:${name}` : ""}×${type === "attack" ? takeCount({ subject: this }, { configure: false }) : 1}`);
    return {};
  }
});
const item = (id, name, kinds) => {
  const it = { id, name, system: {} };
  it.system.activities = collection(kinds.map(([aid, type, n]) => activity(it, aid, type, n)));
  return it;
};
const bite = item("bite", "Bite", [["b1", "attack"]]);
const claw = item("claw", "Claw", [["c1", "attack"]]);
const sword = item("sword", "Longsword", [["s1", "attack", "One-Handed"], ["s2", "attack", "Two-Handed"]]);
const fear = item("fear", "Frightful Presence", [["f1", "save"]]);
const multi = item("multi", "Multiattack", []);
const actor = { name: "Owlbear", type: "npc", isOwner: true, items: collection([bite, claw, sword, fear, multi]) };

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`ok - ${name}`); };

await check("a Multiattack is known by its name", () => {
  assert.ok(isMultiattack(multi) && isMultiattack({ name: "Multi-attack" }) && !isMultiattack(bite));
});
await check("without Primal CR there's no plan, and every attack starts at 0", () => {
  assert.equal(plannedRoutine(actor), null);
  const rows = routineRows(actor, null);
  assert.deepEqual(rows.map(r => `${r.label}=${r.count}`), ["Bite=0", "Claw=0", "Longsword: One-Handed=0", "Longsword: Two-Handed=0"]);
});
await check("with Primal CR, its reading fills the numbers in, and adds what else it uses", () => {
  modules.set("primal-cr", { active: true, api: { read: () => ({
    options: [{ itemId: "bite", activityId: "b1" }, { itemId: "claw", activityId: "c1" }, { itemId: "fear", activityId: "f1" }],
    multiattack: [{ index: 0, count: 1 }, { index: 1, count: 2 }, { index: 2, count: 1 }]
  }) } });
  const rows = routineRows(actor, plannedRoutine(actor));
  assert.deepEqual(rows.filter(r => r.count).map(r => `${r.label}=${r.count}`), ["Bite=1", "Claw=2", "Frightful Presence=1"]);
});
await check("rolling: each attack in turn, with its number set ahead", async () => {
  const rows = routineRows(actor, plannedRoutine(actor));
  await rollRoutine(actor, rows);
  assert.deepEqual(used, ["Bite×1", "Claw×2", "Frightful Presence×1"]);
  assert.match(chat.at(-1).content, /1 × Bite, 2 × Claw, 1 × Frightful Presence/);
});
await check("a number set ahead is used once only", () => {
  assert.equal(takeCount({ subject: claw.system.activities[0] }, { configure: false }), 1);
});
await check("cancelling one attack stops the rest", async () => {
  used.length = 0;
  const cancel = claw.system.activities[0];
  const original = cancel.use;
  cancel.use = async () => null;
  await rollRoutine(actor, routineRows(actor, plannedRoutine(actor)));
  assert.deepEqual(used, ["Bite×1"]);
  cancel.use = original;
});
await check("Primal CR that can't read it: no plan", () => {
  modules.set("primal-cr", { active: true, api: { read: () => { throw new Error("nope"); } } });
  const warn = console.warn; console.warn = () => {};
  assert.equal(plannedRoutine(actor), null);
  console.warn = warn;
});
console.log(`\nmultiattack: ${passed} checks passed`);
