import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as dice from "../../scripts/dice.mjs";
import { readActor, scanActor } from "../../scripts/reader.mjs";
import { simulate } from "../../scripts/sim.mjs";

const actors = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../fixtures/actors.json", import.meta.url)), "utf8"));
const base = name => structuredClone(actors.find(a => a.name.startsWith(name)));
const read = data => readActor(structuredClone(data), {}, { fresh: true });

let n = 0;
const id = () => `test${String(n++).padStart(12, "0")}`;
const feat = (name, text, system = {}) => ({ _id: id(), name, type: "feat", system: { description: { value: `<p>${text}</p>` }, ...system } });
const damage = (number, denomination, extra = {}) => ({
  type: "damage", activation: { type: "action" }, range: { units: "self" }, target: { affects: {}, template: {} },
  damage: { parts: [{ number, denomination, types: [] }] }, ...extra
});
const ladder = (name, steps, faces, per) => ({
  _id: id(), name, type: "weapon",
  system: { description: { value: "" }, activities: Object.fromEntries(steps.map(k => [`a${k}`, damage(k * per, faces)])) }
});

/** The fixture fighter with the Augmented class's Nova added the way it sits on a real sheet. */
function novaFighter({ willpower = 3, flare = true } = {}) {
  const data = base("Randal");
  data.system.attributes.hp = { value: 60, max: 60 };
  data.items.push(
    feat("Nova", "You can spend 1 Willpower to enter a Nova state."),
    ladder("Nova Burn", [1, 2, 3, 4, 5], 8, 2),
    ladder("Nova Recoil", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 6, 1),
    feat("Willpower", "", { uses: { max: String(willpower), spent: 0, recovery: [] } })
  );
  if ( flare ) {
    data.items.push(feat("06. Solar Flare", "If you drop to 0 hit points while your Nova is active, you can instead drop to 1 hit point and cause each hostile creature within 30 feet to take radiant damage equal to your intelligence modifier + your Fighter level.", { uses: { max: "1", spent: 0, recovery: [] } }));
  }
  return data;
}

const versus = (party, enemy, count = 1, runs = 600) => simulate(
  party.map((data, i) => ({ key: `p${i}`, profile: read(data), count: 1, pc: true })),
  [{ key: "e0", profile: read(base(enemy)), count, pc: false }],
  { runs, random: dice.seeded(11) });

test("Nova: the feature, its two ladders, Willpower and Solar Flare are read off the sheet", () => {
  const nova = read(novaFighter()).features.nova;
  assert.equal(nova.willpower, 3);
  assert.deepEqual(nova.recoil.map(r => r.dice[0]), [[1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6]]);
  assert.deepEqual(nova.burn.map(r => r.dice[0]), [[2, 8], [4, 8], [6, 8], [8, 8], [10, 8]]);
  assert.ok(nova.flare.flat >= 1);
  assert.equal(nova.flare.type, "radiant");
});

test("Nova: the ladder items aren't mistaken for attacks, and no Willpower means no Nova", () => {
  const profile = read(novaFighter());
  assert.ok(!profile.options.some(o => /nova/i.test(o.name)));
  const spent = novaFighter();
  spent.items.find(i => i.name === "Willpower").system.uses.spent = 3;
  assert.equal(readActor(spent).features.nova, undefined);
});

test("Nova: it deals more and costs its user hit points", () => {
  const plain = base("Randal");
  plain.system.attributes.hp = { value: 60, max: 60 };
  const without = versus([plain], "Ogre").members[0];
  const withNova = versus([novaFighter()], "Ogre").members[0];
  assert.ok(withNova.dealt > without.dealt, `${withNova.dealt} with, ${without.dealt} without`);
  const nobody = versus([novaFighter({ flare: false })], "Goblin Warrior");
  assert.ok(nobody.members[0].taken > 0, "the recoil is taken even when nothing lands a blow");
});

test("Nova: Solar Flare scorches every enemy when its user would drop", () => {
  const withFlare = versus([novaFighter({ flare: true })], "Goblin Warrior", 8).members[0];
  const without = versus([novaFighter({ flare: false })], "Goblin Warrior", 8).members[0];
  assert.ok(withFlare.dealt > without.dealt + 2, `${withFlare.dealt} with, ${without.dealt} without`);
});

test("once-a-turn extra damage is read from an activity, from the text, or from the proficiency bonus", () => {
  const data = base("Randal");
  data.items.push(
    feat("Divine Strike", "Once on each of your turns when you hit a creature with an attack roll using a weapon, you can cause the target to take an extra Necrotic or Radiant damage.",
      { activities: { a: { type: "damage", activation: { type: "" }, damage: { parts: [{ number: 1, denomination: 8, types: ["radiant"] }] } } } }),
    feat("08. Primal Strike", "Once on each of your turns when you hit a creature with a weapon attack, you can cause the attack to deal an extra 1d8 damage to the target."),
    feat("Fury of the Small", "When you damage a creature with an attack or a spell, you can cause it to deal extra damage. The extra damage equals your proficiency bonus. You can use it no more than once per turn.",
      { uses: { max: "2", spent: 0, recovery: [] } }),
    feat("Finisher", "Once per turn when you deal damage with a weapon to a creature that is Bloodied, you can deal an extra damage to the target.",
      { activities: { a: { type: "damage", activation: { type: "" }, damage: { parts: [{ number: 1, denomination: 8, types: [] }] } } } })
  );
  const onHit = Object.fromEntries(read(data).features.onHit.map(e => [e.name, e]));
  assert.deepEqual(onHit["Divine Strike"].dmg.dice, [[1, 8]]);
  assert.equal(onHit["Divine Strike"].dmg.type, "radiant");
  assert.equal(onHit["Divine Strike"].weapon, true);
  assert.deepEqual(onHit["Primal Strike"].dmg.dice, [[1, 8]]);
  assert.equal(onHit["Fury of the Small"].dmg.flat, 2);
  assert.equal(onHit["Fury of the Small"].uses, 2);
  assert.equal(onHit["Fury of the Small"].weapon, false);
  assert.equal(onHit.Finisher.bloodied, true);
  const plain = versus([base("Randal")], "Ogre").members[0];
  const more = versus([data], "Ogre").members[0];
  assert.ok(more.dealt > plain.dealt);
});

test("a bonus-action attack, numbered feature names and by-hand extras are understood", () => {
  const data = base("Randal");
  data.items.push(
    feat("01. Physical Gift", "Rapid Strike. You can make a melee attack as a Bonus Action."),
    feat("07. Evasion", "You dodge out of the way of certain area effects.")
  );
  data.flags = { "primal-cr": { manual: { onHit: "2d6", everyHit: "1d4" } } };
  const profile = read(data);
  assert.equal(profile.features.bonusAttack, "melee");
  assert.equal(profile.features.evasion, true);
  assert.deepEqual(profile.features.everyHit.dice, [[1, 4]]);
  assert.ok(profile.features.onHit.some(e => e.name === "Set by hand"));
  const plain = versus([base("Randal")], "Ogre").members[0];
  assert.ok(versus([data], "Ogre").members[0].dealt > plain.dealt);
});

test("powers that only work on Undead are left alone against anything else", () => {
  const data = base("Zanna");
  data.items.push({
    _id: id(), name: "Sear Undead", type: "feat",
    system: { description: { value: "" }, activities: { a: {
      type: "save", activation: { type: "action" }, save: { ability: ["wis"], dc: { calculation: "", formula: "15" } },
      damage: { parts: [{ number: 6, denomination: 8, types: ["radiant"] }] }, target: { affects: { type: "creature" }, template: { type: "radius", size: "30" } }
    } } }
  });
  const profile = read(data);
  const sear = profile.options.find(o => o.name === "Sear Undead");
  assert.equal(sear.only, "undead");
  const ogre = versus([data], "Ogre").members[0];
  const plain = versus([base("Zanna")], "Ogre").members[0];
  assert.ok(Math.abs(ogre.dealt - plain.dealt) < 3, "no extra damage to an ogre");
  assert.ok(versus([data], "Ghoul", 3).members[0].dealt > versus([base("Zanna")], "Ghoul", 3).members[0].dealt);
});

test("damage a spell does to its own caster isn't thrown at the enemy", () => {
  const data = base("Zanna");
  data.items.push({
    _id: id(), name: "Dimension Door", type: "spell",
    system: { level: 0, range: { units: "ft", value: 500 }, description: { value: "<p>If you would arrive in an occupied space, you and any creature traveling with you each take 4d6 force damage.</p>" },
      activities: { a: { type: "damage", activation: { type: "action" }, range: { units: "self", override: false }, target: { affects: {}, template: {} },
        damage: { parts: [{ number: 4, denomination: 6, types: ["force"] }] } } } }
  });
  assert.ok(!read(data).options.some(o => o.name === "Dimension Door"));
});

test("scan: what was used is left out, what wasn't is listed with a reason", () => {
  const data = novaFighter();
  data.items.push(
    feat("Stunning Strike", "Once per turn when you hit a creature, the target must make a Constitution saving throw or be stunned. It takes 1d4 damage."),
    feat("Deflect Attacks", "When an attack hits you, you can take a reaction to reduce the damage.", { activities: { a: { type: "heal", activation: { type: "reaction" } } } }),
    feat("Keen Mind", "You know which way is north."),
    { _id: id(), name: "Summon Fey", type: "spell", system: { level: 0, description: { value: "" }, activities: { a: { type: "summon", activation: { type: "action" } } } } }
  );
  const scan = scanActor(data, read(data));
  const names = Object.fromEntries(scan.unread.map(u => [u.name, u.reason]));
  assert.equal(names["Stunning Strike"], "other");
  assert.equal(names["Deflect Attacks"], "reaction");
  assert.equal(names["Summon Fey"], "summon");
  for ( const used of ["Nova", "Nova Burn", "Nova Recoil", "Willpower", "06. Solar Flare", "Longsword", "Keen Mind"] ) {
    assert.ok(!(used in names), `${used} should not be listed`);
  }
});
