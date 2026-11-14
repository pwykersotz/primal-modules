import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../scripts/logic.mjs";

test("damage of types", () => {
  const d = [{ type: "fire", value: 12 }, { type: "bludgeoning", value: 9 }, { type: "healing", value: 5 }];
  assert.equal(L.damageOfTypes(d, ["fire"]), 12);
  assert.equal(L.damageOfTypes(d), 21);
  assert.equal(L.damageOfTypes(d, ["cold"]), 0);
});

test("epic hit points", () => {
  assert.equal(L.epicHitPoints({ base: 100, perPC: 50 }, 4), 300);
  assert.equal(L.epicHitPoints({ base: 100, perPC: 50 }, 0), 150);
  assert.equal(L.epicHitPoints({ base: null, perPC: 50 }, 4), null);
});

test("regeneration suppression", () => {
  const regen = { suppressedBy: ["radiant", "fire"], hp: 10 };
  assert.equal(L.suppressesRegeneration(regen, [{ type: "fire", value: 3 }]), true);
  assert.equal(L.suppressesRegeneration(regen, [{ type: "slashing", value: 30 }]), false);
  assert.equal(L.suppressesRegeneration({ suppressedBy: [] }, [{ type: "fire", value: 3 }]), false);
});

test("frozen breaks on 20 bludgeoning or fire", () => {
  assert.equal(L.breaksFrozen([{ type: "fire", value: 11 }, { type: "bludgeoning", value: 9 }]), true);
  assert.equal(L.breaksFrozen([{ type: "fire", value: 19 }, { type: "slashing", value: 9 }]), false);
});

test("drain", () => {
  assert.equal(L.drainHealing({ types: ["necrotic"], fraction: 1 }, [{ type: "necrotic", value: 14 }, { type: "slashing", value: 7 }], 21), 14);
  assert.equal(L.drainHealing({ types: [], fraction: 0.5 }, [{ type: "necrotic", value: 15 }], 15), 7);
  assert.equal(L.drainHealing({ types: ["necrotic"], fraction: 1 }, [{ type: "necrotic", value: 14 }], 6), 6);
});

test("failed by", () => {
  assert.equal(L.failedBy(10, 15, 5), true);
  assert.equal(L.failedBy(11, 15, 5), false);
  assert.equal(L.failedBy(NaN, 15, 5), false);
});

test("contamination levels", () => {
  assert.equal(L.contaminationLevels({ statuses: ["contamination"], flags: { [L.MOD]: { levels: 2 } } }), 2);
  assert.equal(L.contaminationLevels({ statuses: ["contamination"] }), null);
  assert.equal(L.contaminationLevels({ statuses: ["poisoned"], flags: { [L.MOD]: { levels: 2 } } }), null);
  assert.equal(L.contaminationLevels({ statuses: new Set(["contamination"]), flags: { [L.MOD]: { levels: 1 } } }), 1);
});

test("thorns", () => {
  const spec = { formula: "1d6", type: "poison", melee: true, within: 5 };
  assert.equal(L.thornsApplies(spec, { actionType: "mwak", distance: 5 }), true);
  assert.equal(L.thornsApplies(spec, { actionType: "rwak", distance: 5 }), false);
  assert.equal(L.thornsApplies(spec, { actionType: "mwak", distance: 10 }), false);
  assert.equal(L.thornsApplies({ ...spec, melee: false }, { actionType: "rwak", distance: 5 }), true);
});

test("party size", () => {
  assert.equal(L.partySizeFrom(5, []), 5);
  const actors = [{ type: "character", hasPlayerOwner: true }, { type: "character", hasPlayerOwner: true }, { type: "npc", hasPlayerOwner: true }, { type: "character", hasPlayerOwner: false }];
  assert.equal(L.partySizeFrom(0, actors), 2);
  assert.equal(L.partySizeFrom(0, []), 4);
  // The primary party wins over every player-owned character in the world (retired PCs, other groups).
  const pcs = [{ type: "character" }, { type: "character" }, { type: "character" }];
  assert.equal(L.partySizeFrom(0, actors, { partyMembers: [...pcs, { type: "npc" }] }), 3);
  assert.equal(L.partySizeFrom(0, actors, { partyMembers: [], userCharacters: [pcs[0]] }), 1);
  assert.equal(L.partySizeFrom(4, actors, { partyMembers: pcs }), 4);
});

test("Epic Boss placement only resets an unhurt linked boss", () => {
  assert.equal(L.shouldApplyEpic({ actorLink: false, hp: { value: 10, max: 300 } }), true);
  assert.equal(L.shouldApplyEpic({ actorLink: true, hp: { value: 300, max: 300 } }), true);
  assert.equal(L.shouldApplyEpic({ actorLink: true, hp: { value: 250, max: 300 } }), false);
  assert.equal(L.shouldApplyEpic({ actorLink: true }), true);
});

test("Ignacious is recognised by identifier, name or flag", () => {
  assert.equal(L.isBurningTruthItem({ name: "Ignacious", system: { identifier: "ignacious-the-sword-of-burning-truth" } }), true);
  assert.equal(L.isBurningTruthItem({ name: "Ignatious, the Sword of Burning Truth", system: {} }), true);
  assert.equal(L.isBurningTruthItem({ name: "Longsword", system: { identifier: "longsword" } }), false);
  assert.equal(L.isBurningTruthItem({ name: "Longsword", flags: { [L.MOD]: { burningTruth: true } } }), true);
  assert.equal(L.isBurningTruthItem({ name: "Ignacious", flags: { [L.MOD]: { burningTruth: false } } }), false);
  assert.equal(L.isBurningTruthItem(null), false);
});

test("attack activities", () => {
  assert.equal(L.isAttackActivity({ type: "attack" }), true);
  assert.equal(L.isAttackActivity({ type: "damage" }), false);
  assert.equal(L.isAttackActivity({ actionType: "mwak" }), true);
  assert.equal(L.isAttackActivity(null), false);
});

test("combat for an actor", () => {
  const fred = "Actor.fred";
  const c1 = { id: "c1", started: true, scene: { id: "s1" }, combatants: [{ actor: { uuid: "Actor.orc" } }] };
  const c2 = { id: "c2", started: true, scene: { id: "s2" }, combatants: [{ actor: { uuid: fred } }] };
  const c3 = { id: "c3", started: false, scene: { id: "s3" }, combatants: [{ actor: { uuid: fred } }] };
  assert.equal(L.findCombatFor([c1, c2], fred, "s1").id, "c2");
  assert.equal(L.findCombatFor([c1, c3], fred, "s1").id, "c1");
  assert.equal(L.findCombatFor([c3], fred, "s3"), null);
  assert.equal(L.findCombatFor([c1], fred, null), null);
});

test("zone of truth aura and firelight", () => {
  const a = L.zoneOfTruthAura("abcdefghijklmnop");
  assert.equal(a.radius, 15);
  assert.equal(a.enableOnUse, false);
  assert.equal(a.effects[0].save.ability, "cha");
  assert.equal(a.effects[0].save.dc, "20");
  assert.equal(a.effects[0].save.onSuccess, "none");
  assert.equal(a.effects[0].affects, "all");
  assert.equal(a.effects[0].includeSelf, false);
  assert.notEqual(a.effects[0].id, a.id);
  assert.equal(a.effects[0].id.length, 16);
  const light = L.fieryLight({ dim: 0, bright: 0, darkness: { min: 0, max: 1 }, animation: { type: null, speed: 5 } });
  assert.equal(light.dim, 10);
  assert.equal(light.bright, 5);
  assert.equal(light.animation.type, "torch");
  assert.deepEqual(light.darkness, { min: 0, max: 1 });
});
