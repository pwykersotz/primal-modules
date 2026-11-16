import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeRoll } from "./helpers.mjs";

// Settings aren't registered in the checks, so the rule reads its default (on).
globalThis.game = { settings: { get() { throw new Error("not registered"); } } };
globalThis.Roll = FakeRoll;
globalThis.foundry = { utils: { getProperty: (object, path) => path.split(".").reduce((o, k) => o?.[k], object) } };

let gear;

/* ---------- A small stand-in for Foundry's effect application and dnd5e's attack activity ---------- */

class FakeEffect {
  // Like dnd5e: old keys land on their dnd5e 6 key. Dice count as their lowest roll.
  static applyChange(model, change) {
    const key = gear.currentKey(change.key);
    const delta = new FakeRoll(String(change.value)).evaluateSync().total;
    model.bonuses[key] = (model.bonuses[key] ?? 0) + delta;
    return { [key]: model.bonuses[key] };
  }

  constructor({ name, item=null, changes=[], active=true }) {
    this.name = name;
    this.parent = item;
    this.active = active;
    this.uuid = `${item?.uuid ?? "Actor.x"}.ActiveEffect.${name}`;
    this.system = { changes: changes.map((c, i) => ({ _id: `c${i}`, type: "add", phase: "initial", ...c })) };
  }

  shouldApplyChange(change, { phase }) { return change.phase === phase; }
}

class FakeActor {
  constructor(name) {
    this.name = name;
    this.documentName = "Actor";
    this.effects = [];
    this.bonuses = {};
  }

  getRollData() { return { prof: 4 }; }

  *allApplicableEffects() { yield* this.effects; }

  // Foundry V14's Actor#applyActiveEffects, cut down: copy the changes of active effects, then apply each one.
  applyActiveEffects(phase) {
    for ( const effect of this.allApplicableEffects() ) {
      if ( !effect.active ) continue;
      for ( const change of effect.system.changes ) {
        if ( !effect.shouldApplyChange(change, { phase }) ) continue;
        CONFIG.ActiveEffect.documentClass.applyChange(this, { ...structuredClone(change), effect });
      }
    }
  }

  prepare() {
    this.bonuses = {};
    this.applyActiveEffects("initial");
    this.applyActiveEffects("final");
    return this;
  }

  give(itemName, type, changes, { active=true }={}) {
    const item = { documentName: "Item", type, name: itemName, uuid: `Actor.x.Item.${itemName}` };
    this.effects.push(new FakeEffect({ name: itemName, item, changes, active }));
    return this;
  }

  cast(name, changes) {
    this.effects.push(new FakeEffect({ name, changes }));
    return this;
  }
}

class FakeAttack {
  constructor(actor, { magic=null, ammo=null, type="mwak" }={}) {
    this.actor = actor;
    this.magic = magic;
    this.ammo = ammo;
    this.type = type;
  }

  getActionType() { return this.type; }

  // dnd5e's getAttackData: one @ part per piece that is set.
  getAttackData() {
    const pieces = { mod: 3, prof: 4, weaponMagic: this.magic, ammoMagic: this.ammo,
      ruleBonus: this.actor.bonuses[`system.rolls.attack.${this.type}.bonus`] };
    const parts = [];
    const data = {};
    for ( const [key, value] of Object.entries(pieces) ) {
      if ( !value && (value !== 0) ) continue;
      parts.push(`@${key}`);
      data[key] = value;
    }
    return { parts, data };
  }

  toHit() {
    const { parts, data } = this.getAttackData();
    return parts.reduce((sum, part) => sum + Number(String(data[part.slice(1)]).replace(/^\+/, "")), 0);
  }
}

globalThis.CONFIG = {
  Actor: { documentClass: FakeActor },
  ActiveEffect: { documentClass: FakeEffect },
  DND5E: { activityTypes: { attack: { documentClass: FakeAttack } } }
};

gear = await import("../scripts/gear-bonuses.mjs");
const { attackOverlap, bonusKind, currentKey, flatBonus, gearPlan, planGearBonuses, registerGearBonuses } = gear;
registerGearBonuses();

const MWAK = "system.rolls.attack.mwak.bonus";
const SAVE = "system.rolls.ability.save.bonus";
const WIS_SAVE = "system.abilities.wis.save.roll.bonus";

/* ---------- Pieces ---------- */

test("old dnd5e keys are read as the keys dnd5e 6 moves them to", () => {
  assert.equal(currentKey("system.bonuses.mwak.attack"), MWAK);
  assert.equal(currentKey("system.bonuses.abilities.save"), SAVE);
  assert.equal(currentKey("system.abilities.wis.bonuses.save"), WIS_SAVE);
  assert.equal(currentKey("system.attributes.ac.bonus"), "system.attributes.ac.bonus");
});

test("which bonuses are attack and save bonuses", () => {
  assert.deepEqual(bonusKind("system.rolls.attack.bonus"), { kind: "attack", scope: "all" });
  assert.deepEqual(bonusKind(MWAK), { kind: "attack", scope: "mwak" });
  assert.deepEqual(bonusKind(SAVE), { kind: "save", scope: "all" });
  assert.deepEqual(bonusKind(WIS_SAVE), { kind: "save", scope: "wis" });
  assert.equal(bonusKind("system.rolls.damage.mwak.bonus"), null);
  assert.equal(bonusKind("system.rolls.ability.check.bonus"), null);
  assert.equal(bonusKind("system.attributes.ac.bonus"), null);
});

test("flat bonuses are numbers, dice and unknowns aren't", () => {
  assert.equal(flatBonus("+1"), 1);
  assert.equal(flatBonus(2), 2);
  assert.equal(flatBonus(" + 3 "), 3);
  assert.equal(flatBonus("-1"), -1);
  assert.equal(flatBonus("1d4"), null);
  assert.equal(flatBonus(""), null);
  assert.equal(flatBonus("@prof"), null, "without data, an @ reference can't be worked out");
});

test("the highest bonus on a key counts, the rest are dropped", () => {
  const plan = planGearBonuses([
    { id: "ring", key: SAVE, value: 1 },
    { id: "cloak", key: SAVE, value: 1 },
    { id: "stone", key: SAVE, value: 2 }
  ]);
  assert.deepEqual([...plan.skip].sort(), ["cloak", "ring"]);
  assert.equal(plan.totals.save.all, 2);
});

test("a narrower bonus only adds what it has over an all-round one", () => {
  const smaller = planGearBonuses([{ id: "all", key: SAVE, value: 2 }, { id: "wis", key: WIS_SAVE, value: 1 }]);
  assert.deepEqual([...smaller.skip], ["wis"]);
  assert.equal(smaller.totals.save.wis, 2);

  const bigger = planGearBonuses([{ id: "all", key: SAVE, value: 1 }, { id: "wis", key: WIS_SAVE, value: 3 }]);
  assert.equal(bigger.skip.size, 0);
  assert.equal(bigger.reduce.get("wis"), 2, "1 for every save plus 2 more for Wisdom makes 3");
  assert.equal(bigger.totals.save.wis, 3);
  assert.equal(bigger.totals.save.all, 1);
});

test("a weapon's +X, its ammunition and gear: only the highest counts", () => {
  assert.equal(attackOverlap({ weapon: 2, gear: 1 }), 1);
  assert.equal(attackOverlap({ weapon: 1, gear: 2 }), 1);
  assert.equal(attackOverlap({ weapon: 1, ammo: 1, gear: 1 }), 2);
  assert.equal(attackOverlap({ weapon: 3 }), 0);
  assert.equal(attackOverlap({ gear: 1 }), 0);
  assert.equal(attackOverlap({ weapon: 2, gear: 0 }), 0);
});

/* ---------- Through the stand-in effect application ---------- */

test("the table's case: a +2 weapon and the Ascetic Badge attack at +2, a plain weapon keeps the badge", () => {
  const mox = new FakeActor("Mox")
    .give("Points of Light Ascetic Badge", "equipment", [{ key: "system.bonuses.mwak.attack", value: "1" }])
    .prepare();
  assert.equal(mox.bonuses[MWAK], 1, "the badge still applies on its own");
  assert.equal(new FakeAttack(mox, { magic: "2" }).toHit(), 3 + 4 + 2, "Magician's Judge +2: no +1 on top");
  assert.equal(new FakeAttack(mox).toHit(), 3 + 4 + 1, "a plain spear keeps the badge's +1");
  assert.equal(new FakeAttack(mox, { magic: 2, type: "rwak" }).toHit(), 3 + 4 + 2,
    "the badge is melee only, so a ranged attack is untouched");
});

test("a magic weapon whose +X is lower than the gear bonus uses the gear bonus", () => {
  const actor = new FakeActor("A")
    .give("Bracers", "equipment", [{ key: MWAK, value: "+2" }])
    .prepare();
  assert.equal(new FakeAttack(actor, { magic: 1 }).toHit(), 3 + 4 + 2);
});

test("two items giving +1 to saves give +1, a spell on top still stacks", () => {
  const actor = new FakeActor("B")
    .give("Cloak of Protection", "equipment", [{ key: SAVE, value: "1" }, { key: "system.attributes.ac.bonus", value: 1 }])
    .give("Ring of Protection", "equipment", [{ key: SAVE, value: "1" }, { key: "system.attributes.ac.bonus", value: 1 }])
    .cast("Bless", [{ key: SAVE, value: "1d4" }])
    .prepare();
  assert.equal(actor.bonuses[SAVE], 1 + 1, "one item's +1, plus Bless (counted as 1 by the stand-in)");
  assert.equal(actor.bonuses["system.attributes.ac.bonus"], 2, "AC isn't part of this rule");
});

test("an all-saves item and a better Wisdom-saves item", () => {
  const actor = new FakeActor("C")
    .give("Cloak", "equipment", [{ key: SAVE, value: 1 }])
    .give("Periapt", "equipment", [{ key: WIS_SAVE, value: 3 }])
    .prepare();
  assert.equal(actor.bonuses[SAVE], 1);
  assert.equal(actor.bonuses[WIS_SAVE], 2, "Wisdom saves end up at +3 in all");
});

test("features, spells, penalties and items that aren't active are left alone", () => {
  const actor = new FakeActor("D")
    .give("Badge", "equipment", [{ key: MWAK, value: 1 }])
    .give("Unattuned sword charm", "equipment", [{ key: MWAK, value: 2 }], { active: false })
    .give("Cursed band", "equipment", [{ key: MWAK, value: -1 }])
    .cast("Fighting Style", [{ key: MWAK, value: 2 }])
    .prepare();
  assert.equal(actor.bonuses[MWAK], 1 - 1 + 2);
  const plan = gearPlan(actor);
  assert.equal(plan.skip.size, 0);
  assert.equal(plan.totals.attack.mwak, 1);
});

test("an actor with no gear bonuses gets no plan", () => {
  const actor = new FakeActor("E").cast("Bless", [{ key: SAVE, value: "1d4" }]).prepare();
  assert.equal(gearPlan(actor), undefined);
});
