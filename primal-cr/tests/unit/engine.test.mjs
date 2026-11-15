import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as dice from "../../scripts/dice.mjs";
import { readActor, targetsInArea, plainText, parseAttackList } from "../../scripts/reader.mjs";
import { simulate } from "../../scripts/sim.mjs";
import { judge, percent, bookDifficulty, LEVELS, DEFAULT_THRESHOLDS } from "../../scripts/verdict.mjs";

const here = p => fileURLToPath(new URL(p, import.meta.url));
const actors = JSON.parse(fs.readFileSync(here("../fixtures/actors.json"), "utf8"));
const read = name => readActor(structuredClone(actors.find(a => a.name.startsWith(name))), {}, { fresh: true });
const heroes = () => ["Perrin", "Randal", "Zanna", "Krusk"].map((n, i) => ({ key: `p${i}`, profile: read(n), count: 1, pc: true }));
const foes = (...list) => list.map(([n, count], i) => ({ key: `e${i}`, profile: read(n), count, pc: false }));
const fight = (enemies, options = {}) => simulate(heroes(), enemies, { runs: 400, random: dice.seeded(7), ...options });

test("dice: formulas parse, average and roll within their range", () => {
  const amount = dice.parse("2d6 + 1d4 + 3");
  assert.deepEqual(amount.dice, [[2, 6], [1, 4]]);
  assert.equal(amount.flat, 3);
  assert.equal(dice.average(dice.parse("2d6+3")), 10);
  const random = dice.seeded(3);
  for ( let i = 0; i < 200; i++ ) {
    const n = dice.roll(dice.parse("2d6+3"), random);
    assert.ok(n >= 5 && n <= 15, `rolled ${n}`);
    const crit = dice.roll(dice.parse("2d6+3"), random, { critical: true });
    assert.ok(crit >= 7 && crit <= 27, `critical rolled ${crit}`);
  }
  assert.equal(dice.average(dice.parse("")), 0);
  assert.equal(dice.average(dice.parse("nonsense")), 0);
});

test("dice: a seeded generator repeats itself", () => {
  const a = dice.seeded(42);
  const b = dice.seeded(42);
  for ( let i = 0; i < 20; i++ ) assert.equal(a(), b());
});

test("reader: a goblin's sheet becomes hit points, armour and attacks", () => {
  const goblin = read("Goblin Warrior");
  assert.equal(goblin.hpMax, 10);
  assert.equal(goblin.ac, 15);
  assert.equal(goblin.cr, 0.25);
  const scimitar = goblin.options.find(o => o.name === "Scimitar");
  assert.equal(scimitar.kind, "attack");
  assert.equal(scimitar.toHit, 4);
});

test("reader: multiattack, regeneration, legendary actions and breath weapons are found", () => {
  assert.deepEqual(read("Owlbear").multiattack, [{ index: 0, count: 2 }]);
  assert.equal(read("Troll").multiattack[0].count, 3);
  assert.ok(read("Troll").regen.amount > 0);
  const dragon = read("Adult Red Dragon");
  assert.equal(dragon.legRes, 3);
  assert.equal(dragon.legAct, 3);
  const breath = dragon.options.find(o => o.name === "Fire Breath");
  assert.equal(breath.kind, "save");
  assert.equal(breath.dc, 21);
  assert.ok(breath.uses?.recharge, "the breath recharges");
  assert.ok(dragon.options.some(o => o.act === "legendary"));
});

test("reader: a caster's spells and a character's healing are read", () => {
  const mage = read("Mage");
  assert.ok(mage.options.some(o => o.name === "Fireball" && o.kind === "save" && o.dc === 14));
  const fighter = read("Randal");
  assert.equal(fighter.level, 1);
  assert.equal(fighter.hpMax, 12);
  assert.ok(fighter.options.some(o => o.kind === "heal" && o.act === "bonus"));
});

test("reader: current hit points are kept unless the sheet is read fresh", () => {
  const data = structuredClone(actors.find(a => a.name === "Ogre"));
  data.system.attributes.hp.value = 5;
  assert.equal(readActor(structuredClone(data)).hp, 5);
  assert.equal(readActor(structuredClone(data), {}, { fresh: true }).hp, 68);
});

test("reader: an actor with nothing usable still reads", () => {
  const empty = readActor({ name: "Nobody", type: "npc", system: {}, items: [] });
  assert.equal(empty.name, "Nobody");
  assert.ok(Array.isArray(empty.options));
});

test("reader: helpers", () => {
  assert.ok(targetsInArea("cone", 15) >= 1);
  assert.ok(targetsInArea("sphere", 20) >= targetsInArea("sphere", 5));
  assert.equal(plainText("<p>One <strong>two</strong></p>").trim(), "One two");
});

test("sim: the numbers it returns hang together", () => {
  const result = fight(foes(["Goblin Warrior", 3]));
  assert.equal(result.runs, 400);
  for ( const key of ["win", "wipe", "drop", "death", "hpLost"] ) {
    assert.ok(result[key] >= 0 && result[key] <= 1, `${key} is ${result[key]}`);
  }
  assert.ok(Math.abs(result.win + result.wipe + result.stalemate - 1) < 1e-9);
  assert.ok(result.drop >= result.wipe, "a wipe means someone dropped");
  assert.ok(result.rounds >= 1);
  assert.equal(result.members.filter(m => m.side === 0).length, 4);
});

test("sim: the same seed gives the same answer", () => {
  const a = fight(foes(["Goblin Boss", 1], ["Goblin Warrior", 2]));
  const b = fight(foes(["Goblin Boss", 1], ["Goblin Warrior", 2]));
  assert.equal(a.win, b.win);
  assert.equal(a.hpLost, b.hpLost);
});

test("sim: more enemies are more dangerous, and the levels come out in order", () => {
  const one = fight(foes(["Goblin Warrior", 1]));
  const six = fight(foes(["Goblin Warrior", 6]));
  assert.ok(one.win > 0.95, `one goblin: win ${one.win}`);
  assert.ok(six.wipe > one.wipe);
  assert.ok(six.hpLost > one.hpLost);
  assert.equal(judge(one).level, "easy");
  assert.equal(judge(fight(foes(["Adult Red Dragon", 1]))).level, "impossible");
  const owlbear = judge(fight(foes(["Owlbear", 1])));
  assert.ok(owlbear.index >= LEVELS.indexOf("hard"), `owlbear is ${owlbear.level}`);
});

test("sim: a wounded party does worse than a fresh one", () => {
  const fresh = fight(foes(["Goblin Warrior", 2]));
  const party = heroes();
  for ( const entry of party ) entry.profile.hp = Math.ceil(entry.profile.hp / 3);
  const hurt = simulate(party, foes(["Goblin Warrior", 2]), { runs: 400, random: dice.seeded(7) });
  assert.ok(hurt.drop > fresh.drop);
});

test("sim: an empty side is no fight", () => {
  assert.equal(judge(simulate([], foes(["Ogre", 1]), { runs: 10 })), null);
  assert.equal(judge(simulate(heroes(), [], { runs: 10 })), null);
});

test("verdict: each level has its own trigger", () => {
  const base = { runs: 100, win: 1, wipe: 0, drop: 0, hpLost: 0 };
  assert.equal(judge(base).level, "easy");
  assert.equal(judge({ ...base, hpLost: 0.3 }).level, "medium");
  assert.equal(judge({ ...base, hpLost: 0.3, drop: 0.2 }).level, "hard");
  assert.equal(judge({ ...base, win: 0.8, drop: 0.9, wipe: 0.1 }).level, "boss");
  assert.equal(judge({ ...base, win: 0.09, drop: 1, wipe: 0.91 }).level, "impossible");
  assert.equal(judge({ ...base, win: 0.1, drop: 1, wipe: 0.9 }).level, "boss");
  assert.equal(judge({ ...base, drop: 0.2 }, { ...DEFAULT_THRESHOLDS, hard: 0.5 }).level, "easy");
});

test("verdict: percentages never claim a certainty the dice didn't show", () => {
  assert.equal(percent(0), "0%");
  assert.equal(percent(0.004), "<1%");
  assert.equal(percent(0.996), ">99%");
  assert.equal(percent(1), "100%");
  assert.equal(percent(0.426), "43%");
});

test("verdict: the book's XP measure", () => {
  const table = [null, [50, 75, 100]];
  assert.deepEqual(bookDifficulty([1, 1, 1, 1], 350, table), { level: "high", xp: 350, budgets: [200, 300, 400] });
  assert.equal(bookDifficulty([1, 1, 1, 1], 500, table).level, "beyond");
  assert.equal(bookDifficulty([], 500, table), null);
});

test("reader: attack lists that share one \"attacks\" and distances in legendary actions", () => {
  const strike = (name, die) => ({ name, act: "action", kind: "attack", dmg: [{ dice: [[1, die]], flat: 2 }] });
  const profile = { options: [strike("Bite", 8), strike("Claw", 6), strike("Tail", 10)] };
  assert.deepEqual(parseAttackList("The drake makes one bite and two claw attacks.", profile),
    [{ index: 0, count: 1 }, { index: 1, count: 2 }]);
  assert.deepEqual(parseAttackList("The dragon makes one bite, one claw, and one tail attack.", profile),
    [{ index: 0, count: 1 }, { index: 1, count: 1 }, { index: 2, count: 1 }]);
  assert.deepEqual(parseAttackList("It makes three attacks: one with its bite and two with its claws.", profile),
    [{ index: 0, count: 1 }, { index: 1, count: 2 }]);
  assert.deepEqual(parseAttackList("It moves up to 20 feet and makes one Tail attack.", profile), [{ index: 2, count: 1 }]);
  assert.equal(parseAttackList("It commands one ally within 30 feet of it to attack.", profile), null);
  // A list that doesn't end in "attack" is not an attack list: "one a deafening shriek, one a frightful screech"
  assert.equal(parseAttackList("One a deafening shriek, one a frightful screech, and one a stunning bellow.", profile), null);
});
