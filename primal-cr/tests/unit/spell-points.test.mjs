import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as dice from "../../scripts/dice.mjs";
import { readActor } from "../../scripts/reader.mjs";
import { simulate } from "../../scripts/sim.mjs";

// Primal Spell Points casters: their leveled slots only mirror what they can afford, so the pool is played instead.
const here = p => fileURLToPath(new URL(p, import.meta.url));
const actors = JSON.parse(fs.readFileSync(here("../fixtures/actors.json"), "utf8"));
const raw = name => structuredClone(actors.find(a => a.name.startsWith(name)));
const costs = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7, 6: 9, 7: 10, 8: 11, 9: 13 };
const pool = value => ({ spellPoints: { value, max: 57, maxLevel: 5, highUsed: [], limit: true, costs } });

test("spell points: the pool replaces leveled slots, pact slots stay", () => {
  const mage = readActor(raw("Mage"), pool(20), {});
  assert.equal(mage.spellPoints.left, 20);
  assert.equal(mage.spellPoints.maxLevel, 5);
  assert.deepEqual(Object.keys(mage.slots).filter(k => k !== "pact"), []);
  const rested = readActor(raw("Mage"), pool(0), { fresh: true });
  assert.equal(rested.spellPoints.left, 57, "a full rest fills the pool");
  const plain = readActor(raw("Mage"), {}, {});
  assert.equal(plain.spellPoints, null);
});

test("spell points: a caster with an empty pool casts no leveled spells", () => {
  const zanna = readActor(raw("Zanna"), {}, { fresh: true });
  assert.ok(Object.keys(zanna.slots).length, "the fixture wizard has spell slots");
  const run = value => {
    const party = ["Perrin", "Randal", "Zanna", "Krusk"].map((n, i) => ({
      key: `p${i}`, count: 1, pc: true,
      profile: readActor(raw(n), n === "Zanna" ? pool(value) : {}, n === "Zanna" ? {} : { fresh: true })
    }));
    const result = simulate(party, [{ key: "e0", profile: readActor(raw("Ogre"), {}, { fresh: true }), count: 3, pc: false }],
      { runs: 300, random: dice.seeded(11) });
    return result.members.find(m => m.key === "p2").dealt;
  };
  const empty = run(0), full = run(57);
  assert.ok(empty < full, `the wizard's damage: empty pool ${empty} vs full ${full}`);
});
