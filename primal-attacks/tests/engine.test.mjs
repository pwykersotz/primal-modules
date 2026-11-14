/**
 * Rolling several attacks from one Attack Roll window, with plain dnd5e and with Midi-QOL: the rolls made together and
 * thrown together, the damage of the hits together, Midi-QOL's workflow for every attack (with no new dice), the
 * summary, and nothing changing for a single attack.
 * Run with: node tests/engine.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AttackActivity, MidiAttackActivity, attackOf, d20sLeft, installFoundry, log, makeActor, makeToken, queueD20,
  settings, settle, target, visibleDice
} from "./fakes.mjs";

installFoundry();
const dialog = await import("../scripts/dialog.mjs");
const engine = await import("../scripts/engine.mjs");
const patches = await import("../scripts/patches.mjs");
const summary = await import("../scripts/summary.mjs");
const fold = await import("../scripts/fold.mjs");

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (err) {
    console.error(`✗ ${name}\n  ${err.stack}`);
    process.exitCode = 1;
  }
}

const originals = {
  rollAttack: AttackActivity.prototype.rollAttack,
  use: AttackActivity.prototype.use,
  midiUse: MidiAttackActivity.prototype.use
};

/** A fresh Foundry, with Primal Attacks' hooks and wrappers in place. */
function setup({ midi=false, dice=true }={}) {
  installFoundry({ midi, dice });
  AttackActivity.prototype.rollAttack = originals.rollAttack;
  AttackActivity.prototype.use = originals.use;
  MidiAttackActivity.prototype.use = originals.midiUse;
  dialog.registerDialogHooks();
  engine.registerEngineHooks();
  summary.registerSummaryHooks();
  fold.registerFoldHooks();
  patches.registerPatches();
}

/** The Attack Roll window: this many attacks, and this button. */
function answer(count, mode="normal") {
  globalThis.__rollWindow = app => {
    if ( count ) dialog.setCount(app, count);
    return { mode };
  };
}

const sword = (extra={}) => ({ name: "Longsword", activities: [{ ...extra }] });
const calls = kind => log.calls.filter(c => c[0] === kind);
const summaries = () => log.messages.filter(m => m.flags?.["primal-attacks"]?.summary);
const totals = rolls => rolls.map(r => r.total);
const click = { event: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false } };

/* -------------------------------------------- */
/*  Plain dnd5e                                 */
/* -------------------------------------------- */

await check("plain: three attacks from one window, in one card, thrown together", async () => {
  setup();
  makeToken({ id: "goblin", name: "Goblin", ac: 15 });
  target("goblin");
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  // 12 + 5 = 17 hits, a natural 1 misses, a natural 20 is a critical hit.
  queueD20(12, 1, 20);
  answer(3);
  const rolls = await attackOf(fighter, "Longsword").rollAttack({}, {}, {});
  assert.equal(calls("window").length, 1, "one window");
  assert.deepEqual(totals(rolls), [17, 6, 25]);
  const card = log.messages.find(m => m.type === "attack");
  assert.equal(card.rolls.length, 3, "one attack card holds every roll");
  assert.ok(card.flags["primal-attacks"].group, "the card is marked as a set of attacks");
  assert.equal(log.throws.filter(t => t.rolls.some(r => r.options?.["primal-attacks"])).length, 1, "one throw");
  assert.ok(engine.isRunning(fighter));
  await settle();
  assert.ok(!engine.isRunning(fighter));

  const damage = calls("damage");
  assert.equal(damage.length, 2, "the normal hit and the critical hit, each in one roll");
  const normal = damage.find(c => !c[3]);
  const crit = damage.find(c => c[3]);
  assert.deepEqual(normal[2], [7]);
  assert.deepEqual(crit[2], [11], "a critical hit doubles its dice");

  const [card2] = summaries();
  const entries = card2.flags["primal-attacks"].summary.entries;
  assert.deepEqual(entries.map(e => e.hit), [true, false, true]);
  assert.deepEqual(entries.map(e => e.damage?.total ?? null), [7, null, 11]);
  assert.equal(entries[0].ac, 15);
  assert.deepEqual(entries[2].damage.parts.map(p => p.text), ["2d8 (4, 4) + 3"], "the dice of each attack's damage");
});

await check("plain: the damage of several hits is one roll with a copy per hit", async () => {
  setup();
  makeToken({ id: "orc", name: "Orc", ac: 13 });
  target("orc");
  const ranger = makeActor({ name: "Ranger", items: [sword({ extraDamage: true })] });
  queueD20(15, 16, 9);
  answer(3);
  await attackOf(ranger, "Longsword").rollAttack({}, {}, {});
  await settle();
  const damage = calls("damage");
  assert.equal(damage.length, 1);
  assert.deepEqual(damage[0][2], [7, 3, 7, 3, 7, 3], "slashing and fire, once per hit");
  const damageCards = log.messages.filter(m => m.type === "damage");
  assert.equal(damageCards.length, 1, "one damage card");
  const entries = summaries()[0].flags["primal-attacks"].summary.entries;
  assert.deepEqual(entries.map(e => e.damage?.total), [10, 10, 10]);
  assert.deepEqual(entries[0].damage.types, ["slashing", "fire"]);
});

await check("plain: Disadvantage applies to every attack, and the copies roll their own dice", async () => {
  setup();
  makeToken({ id: "orc", name: "Orc", ac: 13 });
  target("orc");
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  queueD20(18, 3, 17, 16);
  answer(2, "disadvantage");
  const rolls = await attackOf(fighter, "Longsword").rollAttack({}, {}, {});
  assert.deepEqual(rolls.map(r => r.formula), ["2d20kl + 5", "2d20kl + 5"]);
  assert.deepEqual(totals(rolls), [8, 21]);
  await settle();
});

await check("plain: ammunition for every arrow", async () => {
  setup();
  makeToken({ id: "orc", name: "Orc", ac: 30 });
  target("orc");
  const archer = makeActor({
    name: "Archer",
    items: [{ id: "arrows000000000a", name: "Arrows", type: "consumable", quantity: 20 },
      { name: "Longbow", ammunition: "arrows000000000a", activities: [{}] }]
  });
  queueD20(2, 3, 4);
  answer(3);
  await attackOf(archer, "Longbow").rollAttack({}, {}, {});
  await settle();
  assert.equal(archer.items.get("arrows000000000a").system.quantity, 17);
  assert.equal(calls("damage").length, 0, "no hits, no damage");
});

await check("plain: spell attacks roll together too", async () => {
  setup();
  makeToken({ id: "orc", name: "Orc", ac: 13 });
  target("orc");
  const warlock = makeActor({ name: "Warlock", items: [{ name: "Eldritch Blast", type: "spell", level: 0, activities: [{}] }] });
  queueD20(15, 1, 16);
  answer(3);
  const rolls = await attackOf(warlock, "Eldritch Blast").rollAttack({}, {}, {});
  assert.equal(rolls.length, 3);
  await settle();
  assert.deepEqual(calls("damage")[0][2], [6, 6], "the two hits' damage in one roll");
});

await check("plain: one attack changes nothing", async () => {
  setup();
  makeToken({ id: "orc", name: "Orc", ac: 13 });
  target("orc");
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  queueD20(15);
  answer(1);
  const rolls = await attackOf(fighter, "Longsword").rollAttack({}, {}, {});
  assert.equal(rolls.length, 1);
  assert.equal(rolls[0].options["primal-attacks"], undefined);
  await settle();
  assert.equal(calls("damage").length, 0, "the damage button is left to the player");
  assert.equal(summaries().length, 0);
});

await check("plain: no window, no extra attacks; a cancelled window's number isn't kept", async () => {
  setup();
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  const attack = attackOf(fighter, "Longsword");
  // Picked 4, then closed the window.
  globalThis.__rollWindow = app => {
    dialog.setCount(app, 4);
    return null;
  };
  assert.equal(await attack.rollAttack({}, {}, {}), null);
  // Shift-click: no window.
  queueD20(10);
  let rolls = await attack.rollAttack({}, { configure: false }, {});
  assert.equal(rolls.length, 1);
  // Picked 4 and closed again; the next window can't offer the number (setting off), so it's one attack.
  globalThis.__rollWindow = app => {
    dialog.setCount(app, 4);
    return null;
  };
  await attack.rollAttack({}, {}, {});
  settings.set("primal-attacks.offerOnAttack", "never");
  answer(0);
  queueD20(10);
  rolls = await attack.rollAttack({}, {}, {});
  assert.equal(rolls.length, 1);
  await settle();
});

await check("plain: Primal Status' desperation stays with the first attack", async () => {
  setup();
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  const hook = Hooks.on("dnd5e.postAttackRollConfiguration", rolls => {
    rolls[0].options.mgDesperation = true;
  });
  answer(2);
  queueD20(10, 10);
  const rolls = await attackOf(fighter, "Longsword").rollAttack({}, {}, {});
  Hooks.off("dnd5e.postAttackRollConfiguration", hook);
  assert.deepEqual(rolls.map(r => !!r.options.mgDesperation), [true, false]);
  await settle();
});

await check("plain: without Dice So Nice it still finishes", async () => {
  setup({ dice: false });
  makeToken({ id: "orc", name: "Orc", ac: 13 });
  target("orc");
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  queueD20(15, 15);
  answer(2);
  await attackOf(fighter, "Longsword").rollAttack({}, {}, {});
  await settle();
  assert.deepEqual(calls("damage")[0][2], [7, 7]);
  assert.equal(summaries().length, 1);
});

await check("plain: the setting for damage", async () => {
  for ( const [policy, expected] of [["always", [7, 7]], ["none", null]] ) {
    setup();
    settings.set("primal-attacks.damagePolicy", policy);
    makeToken({ id: "orc", name: "Orc", ac: 30 });
    target("orc");
    const fighter = makeActor({ name: "Fighter", items: [sword()] });
    queueD20(5, 6);
    answer(2);
    await attackOf(fighter, "Longsword").rollAttack({}, {}, {});
    await settle();
    assert.deepEqual(calls("damage")[0]?.[2] ?? null, expected, policy);
  }
});

/* -------------------------------------------- */
/*  Midi-QOL                                    */
/* -------------------------------------------- */

await check("midi: a plain click asks for the window; a Shift-click doesn't", async () => {
  setup({ midi: true });
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  const attack = attackOf(fighter, "Longsword");
  answer(1);
  queueD20(10, 10);
  await attack.use({ ...click });
  await attack.use({ event: { ...click.event, shiftKey: true } });
  await settle();
  assert.equal(log.workflows[0].workflowOptions.autoFastAttack, false);
  assert.equal(log.workflows[1].workflowOptions.autoFastAttack, undefined);
  assert.equal(calls("window").length, 1);
});

await check("midi: every attack gets a workflow, with the dice thrown together", async () => {
  setup({ midi: true });
  const goblin = makeToken({ id: "goblin", name: "Goblin", ac: 13, hp: 30 });
  target("goblin");
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  const attack = attackOf(fighter, "Longsword");
  // 17 hits, 13 hits, 7 misses.
  queueD20(12, 8, 2);
  answer(3);
  await attack.use({ ...click });
  await settle(120);

  assert.equal(calls("window").length, 1, "one window");
  assert.equal(calls("attack").length, 1, "dnd5e rolled once, for all three");
  assert.equal(d20sLeft(), 0);
  assert.equal(log.workflows.length, 3, "a workflow for each attack");
  assert.deepEqual(log.workflows.map(w => w.attackTotal), [17, 13, 7]);
  assert.equal(log.workflows[1].attackRoll.options["primal-attacks"].index, 1, "the roll already made");
  for ( const w of log.workflows ) {
    assert.equal(w.workflowOptions.attackRollDSN, false);
    assert.equal(w.workflowOptions.damageRollDSN, false);
  }
  const extra = log.workflows[1].workflowOptions;
  assert.equal(extra.autoFastAttack, true);
  assert.equal(extra.autoRollDamage, "onHit");
  const uses = calls("use");
  assert.equal(uses[1][2].consume, false, "the other attacks spend nothing more");

  assert.equal(log.throws.length, 2, "the attack dice, then the damage dice");
  assert.equal(log.throws[0].rolls.length, 3);
  assert.equal(log.throws[1].rolls.length, 2, "the damage of both hits");
  assert.equal(goblin.actor.system.attributes.hp.value, 30 - 14);

  const entries = summaries()[0].flags["primal-attacks"].summary.entries;
  assert.equal(summaries()[0].flags["primal-attacks"].summary.midi, true);
  assert.deepEqual(entries.map(e => e.hit), [true, true, false]);
  assert.deepEqual(entries.map(e => e.damage?.total ?? null), [7, 7, null]);
  assert.ok(!engine.isRunning(fighter));
  assert.ok(dialog.offersCount(attack), "free to roll again");
});

await check("midi: the other attacks stop once the target is down (and keep going if the setting says so)", async () => {
  for ( const [policy, outcomes, hp] of [["skip", ["rolled", "skipped", "skipped"], -4], ["keep", ["rolled", "rolled", "rolled"], -18]] ) {
    setup({ midi: true });
    settings.set("primal-attacks.defeatedTarget", policy);
    const goblin = makeToken({ id: "goblin", name: "Goblin", ac: 13, hp: 10 });
    goblin.actor.system.attributes.hp.max = 10;
    goblin.actor.system.attributes.hp.value = 3;
    target("goblin");
    const fighter = makeActor({ name: "Fighter", items: [sword()] });
    queueD20(12, 12, 12);
    answer(3);
    await attackOf(fighter, "Longsword").use({ ...click });
    await settle(120);
    const entries = summaries()[0].flags["primal-attacks"].summary.entries;
    assert.deepEqual(entries.map(e => e.outcome), outcomes, policy);
    assert.equal(goblin.actor.system.attributes.hp.value, hp, policy);
  }
});

await check("midi: a first attack that misses still goes on to the others", async () => {
  setup({ midi: true });
  makeToken({ id: "brohg", name: "B'rohg", ac: 23, hp: 30 });
  target("brohg");
  const fred = makeActor({ name: "Fred", items: [{ name: "Ignacious", activities: [{}] }] });
  const attack = attackOf(fred, "Ignacious");
  // 18 misses AC 23, 20 is a critical hit.
  queueD20(13, 20);
  answer(2);
  await attack.use({ ...click });
  await settle(120);
  assert.equal(calls("suspended").length, 0, "no workflow left waiting for a damage click");
  assert.equal(log.workflows[0].workflowOptions.forceCompletion, true);
  assert.deepEqual(log.workflows.map(w => w.attackTotal), [18, 25]);
  assert.deepEqual(summaries()[0].flags["primal-attacks"].summary.entries.map(e => e.hit), [false, true]);
  assert.ok(!engine.isRunning(fred));
  assert.ok(dialog.offersCount(attack), "the number is offered on the next click");
});

await check("midi: the number is offered again even while a set is still going", async () => {
  setup({ midi: true });
  makeToken({ id: "brohg", name: "B'rohg", ac: 23, hp: 30 });
  target("brohg");
  const fred = makeActor({ name: "Fred", items: [{ name: "Ignacious", activities: [{}] }] });
  const attack = attackOf(fred, "Ignacious");
  let during = null;
  Hooks.once("midi-qol.postCleanup", () => during = dialog.offersCount(attack));
  queueD20(15, 15);
  answer(2);
  await attack.use({ ...click });
  await settle(120);
  assert.equal(during, true);
});

await check("midi: a new set of attacks ends one left waiting, without rolling its other attacks", async () => {
  setup({ midi: true });
  makeToken({ id: "brohg", name: "B'rohg", ac: 23, hp: 30 });
  target("brohg");
  const fred = makeActor({ name: "Fred", items: [{ name: "Ignacious", activities: [{}] }] });
  const attack = attackOf(fred, "Ignacious");
  // The first set's first workflow never finishes (another module holds it, say).
  const hold = Hooks.on("dnd5e.postRollConfiguration", (rolls, config) => {
    if ( config.workflow && !config.workflow.workflowOptions["primal-attacks"] ) config.workflow.hold = true;
  });
  const original = MidiAttackActivity.prototype.runWorkflow;
  MidiAttackActivity.prototype.runWorkflow = async function(workflow) {
    if ( log.workflows.length === 1 ) {
      await this.rollAttack({ workflow, midiOptions: {} }, {}, {});
      return;
    }
    return original.call(this, workflow);
  };
  try {
    queueD20(15, 15);
    answer(3);
    await attack.use({ ...click });
    await settle(20);
    assert.ok(engine.isRunning(fred));
    queueD20(16, 16);
    answer(2);
    await attack.use({ ...click });
    await settle(120);
  } finally {
    MidiAttackActivity.prototype.runWorkflow = original;
    Hooks.off("dnd5e.postRollConfiguration", hold);
  }
  assert.equal(log.workflows.length, 3, "the held set's first, then the new set's two");
  assert.deepEqual(log.workflows.slice(1).map(w => w.attackTotal), [21, 21]);
  assert.equal(summaries().length, 1, "a summary for the new set only");
  assert.ok(!engine.isRunning(fred));
});

await check("midi: every damage die (other damage too) is thrown together at the end, and only then", async () => {
  setup({ midi: true });
  game.user.isGM = true;
  const brohg = makeToken({ id: "brohg", name: "B'rohg", ac: 13, hp: 60 });
  target("brohg");
  const fred = makeActor({ name: "Fred", items: [{ name: "Ignacious", activities: [{ otherDamage: true }] }] });
  queueD20(15, 15);
  answer(2);
  await attackOf(fred, "Ignacious").use({ ...click });
  await settle(120);
  assert.deepEqual(log.throws.map(t => t.source), ["showForRoll", "showForRoll"], "nothing thrown by the cards themselves");
  const [attacks, damage] = log.throws;
  assert.equal(attacks.dice, 2);
  assert.equal(damage.rolls.length, 4, "slashing and the other damage, for both hits");
  assert.equal(damage.dice, 10, "1d8 and 4d6, twice");
  for ( const w of log.workflows ) {
    assert.equal(visibleDice([w.attackRoll, ...w.damageRolls, ...w.otherDamageRolls]), 0, "the card's dice count as shown");
  }
  assert.equal(brohg.actor.system.attributes.hp.value, 60 - 38);
  const data = summaries()[0].flags["primal-attacks"].summary;
  assert.deepEqual(data.entries.map(e => e.damage.total), [19, 19]);
  assert.deepEqual(data.entries[0].damage.parts.map(p => p.text), ["1d8 (4) + 3", "4d6 (3, 3, 3, 3)"]);
  const html = summary.renderSummary(data);
  const rows = html.match(/<div class="primal-attacks-roll">.*?<\/div>/g);
  assert.equal(rows.length, 6, "the attack roll, the damage and the other damage, for each attack");
  const text = row => row.replace(/<span class="die[^"]*">(\d+)<\/span>/g, "[$1]").replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();
  assert.equal(text(rows[0]), "PRIMAL_ATTACKS.Summary.AttackDice 1d20 [15] + 5 = 20");
  assert.equal(text(rows[1]), "PRIMAL_ATTACKS.Summary.DamageDice 1d8 [4] + 3 = 7 Slashing");
  assert.equal(text(rows[2]), "4d6 [3][3][3][3] = 12 Fire", "the other damage lines up under the damage");
  assert.doesNotMatch(html, /class="breakdown"/, "no words where there are dice");
  // A summary from before the dice were kept still shows its damage in words.
  const old = JSON.parse(JSON.stringify(data));
  for ( const e of old.entries ) {
    delete e.attackDice;
    for ( const p of e.damage.parts ) delete p.dice;
  }
  assert.match(summary.renderSummary(old), /1d8 \(4\) \+ 3 = 7 Slashing<br>4d6 \(3, 3, 3, 3\) = 12 Fire/);
  assert.doesNotMatch(summary.renderSummary(old), /primal-attacks-roll/);
});

await check("summary: every attack's dice are shown, with the die advantage dropped marked", async () => {
  setup();
  makeToken({ id: "orc", name: "Orc", ac: 13 });
  target("orc");
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  queueD20(20, 3, 1, 9);
  answer(2, "advantage");
  await attackOf(fighter, "Longsword").rollAttack({}, {}, {});
  await settle();
  const data = summaries()[0].flags["primal-attacks"].summary;
  assert.deepEqual(data.entries[0].attackDice.parts, [
    { label: "2d20", faces: 20, results: [{ value: 20, dropped: false }, { value: 3, dropped: true }] }, { text: "+ 5" }
  ]);
  const html = summary.renderSummary(data);
  assert.match(html, /<span class="die d20 max">20<\/span><span class="die d20 dropped">3<\/span>/, "a natural 20, and the dropped die");
  assert.match(html, /<span class="die d20 dropped">1<\/span><span class="die d20">9<\/span>/, "the 9 kept over the 1");
  assert.match(html, /<span class="die d8">4<\/span><span class="die d8">4<\/span><\/span><span class="op">\+ 3<\/span>/,
    "the critical hit's damage dice");
});

await check("midi: a spell attack (Scorching Ray at 3rd level) makes its other attacks at the same level", async () => {
  setup({ midi: true });
  makeToken({ id: "orc", name: "Orc", ac: 13, hp: 60 });
  target("orc");
  const wizard = makeActor({ name: "Wizard", items: [{ name: "Scorching Ray", type: "spell", level: 2, activities: [{}] }] });
  const ray = attackOf(wizard, "Scorching Ray");
  assert.ok(dialog.offersCount(ray), "the number is offered for a spell attack");
  queueD20(15, 15, 15);
  answer(3);
  await ray.use({ ...click, spell: { slot: "spell3" } });
  await settle(120);
  assert.equal(calls("window").length, 1);
  assert.deepEqual(log.workflows.map(w => w.castData.castLevel), [3, 3, 3]);
  const extras = calls("use").slice(1);
  assert.equal(extras.length, 2);
  for ( const [, , usage, used] of extras ) {
    assert.deepEqual(usage.spell, { slot: "spell3" });
    assert.equal(usage.consume, false, "no more spell slots");
    assert.deepEqual(usage.concentration, { begin: false });
    assert.equal(used, ray, "used from the spell itself, not dnd5e's copy of it");
  }
  assert.deepEqual(log.workflows.map(w => w.damageRolls[0].formula), ["3d6", "3d6", "3d6"], "upcast damage on every ray");
  assert.equal(log.throws.length, 2, "the attack dice together, then the damage dice together");
  assert.equal(log.throws[1].dice, 9);
});

await check("midi: a cantrip's other attacks have no spell slot", async () => {
  setup({ midi: true });
  makeToken({ id: "orc", name: "Orc", ac: 13, hp: 60 });
  target("orc");
  const warlock = makeActor({ name: "Warlock", items: [{ name: "Eldritch Blast", type: "spell", level: 0, activities: [{}] }] });
  queueD20(15, 15);
  answer(2);
  await attackOf(warlock, "Eldritch Blast").use({ ...click });
  await settle(120);
  assert.equal(log.workflows.length, 2);
  assert.equal(calls("use")[1][2].spell, undefined);
});

await check("midi: the attacks resolve while the attack dice roll; the damage dice wait for them to land", async () => {
  setup({ midi: true });
  game.dice3d.animationMs = 150;
  makeToken({ id: "orc", name: "Orc", ac: 13, hp: 60 });
  target("orc");
  const fred = makeActor({ name: "Fred", items: [sword()] });
  let firstDone = null;
  Hooks.once("midi-qol.postCleanup", () => firstDone = Date.now());
  queueD20(15, 15, 15);
  answer(3);
  await attackOf(fred, "Longsword").use({ ...click });
  await settle(200);
  const [attacks, damage] = log.throws;
  assert.equal(attacks.dice, 3, "the attack dice are thrown");
  assert.ok(firstDone < attacks.end, "Midi-QOL didn't wait for the attack dice to land");
  assert.ok(damage.start >= attacks.end, "the damage dice are thrown after the attack dice land");
  assert.equal(summaries().length, 1);
  assert.ok(summaries()[0].timestamp >= damage.end, "the summary comes once the damage dice land");
  for ( const w of log.workflows ) assert.equal(visibleDice([w.attackRoll]), 0, "no attack die thrown twice");
});

await check("midi: each arrow is spent as its attack is made", async () => {
  setup({ midi: true });
  makeToken({ id: "goblin", name: "Goblin", ac: 30, hp: 30 });
  target("goblin");
  const archer = makeActor({
    name: "Archer",
    items: [{ id: "arrows000000000a", name: "Arrows", type: "consumable", quantity: 3 },
      { name: "Longbow", ammunition: "arrows000000000a", activities: [{}] }]
  });
  const arrows = archer.items.get("arrows000000000a");
  const seen = [];
  Hooks.on("midi-qol.postCleanup", () => seen.push(arrows.system.quantity));
  queueD20(2, 3, 4);
  answer(3);
  await attackOf(archer, "Longbow").use({ ...click });
  await settle(120);
  assert.deepEqual(seen, [2, 2, 1], "the arrows are there for each attack");
  assert.equal(arrows.system.quantity, 0);
});

await check("midi: a damage setting that waits for a click is made to roll on a hit", async () => {
  setup({ midi: true });
  globalThis.MidiQOL = { configSettings: () => ({ autoCheckHit: "all", autoRollDamage: "none" }) };
  makeToken({ id: "goblin", name: "Goblin", ac: 13, hp: 30 });
  target("goblin");
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  queueD20(12, 12);
  answer(2);
  await attackOf(fighter, "Longsword").use({ ...click });
  await settle(120);
  assert.deepEqual(log.workflows.map(w => w.workflowOptions.autoRollDamage), ["onHit", "onHit"]);
});

await check("midi: the api stops the attacks after the one being rolled", async () => {
  setup({ midi: true });
  makeToken({ id: "goblin", name: "Goblin", ac: 13, hp: 30 });
  target("goblin");
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  queueD20(12, 12, 12);
  answer(3);
  let running = null;
  Hooks.once("midi-qol.postCleanup", () => {
    running = engine.isRunning(fighter);
    engine.stopRun(fighter);
  });
  await attackOf(fighter, "Longsword").use({ ...click });
  await settle(120);
  assert.equal(running, true);
  assert.equal(log.workflows.length, 1);
  assert.ok(!engine.isRunning(fighter));
});

await check("midi: a single attack is Midi-QOL's own", async () => {
  setup({ midi: true });
  makeToken({ id: "goblin", name: "Goblin", ac: 13, hp: 30 });
  target("goblin");
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  queueD20(12);
  answer(1);
  await attackOf(fighter, "Longsword").use({ ...click });
  await settle(60);
  assert.equal(log.workflows.length, 1);
  assert.equal(log.workflows[0].workflowOptions.attackRollDSN, undefined);
  assert.equal(log.throws.length, 2, "Midi-QOL's own attack and damage throws");
  assert.equal(summaries().length, 0);
});

/* -------------------------------------------- */
/*  Folding Midi-QOL's cards into the summary   */
/* -------------------------------------------- */

const cardsOf = type => log.messages.filter(m => m.type === type);

await check("fold: every card of a set (attack cards, HP Updated cards) is folded into its summary", async () => {
  setup({ midi: true });
  makeToken({ id: "dog", name: "Garmyr War Dog", ac: 13, hp: 18 });
  target("dog");
  const drubblewick = makeActor({ name: "Drubblewick", items: [{ name: "Eldritch Blast", type: "spell", level: 0, activities: [{}] }] });
  // Three hits drop the dog (6 each); the last two are skipped.
  queueD20(15, 15, 15, 15, 15);
  answer(5, "normal");
  await attackOf(drubblewick, "Eldritch Blast").use({ ...click });
  await settle(160);
  const [card] = summaries();
  const data = card.flags["primal-attacks"].summary;
  assert.ok(data.group);
  assert.equal(data.folded, true);
  assert.deepEqual(data.entries.map(e => e.outcome), ["rolled", "rolled", "rolled", "skipped", "skipped"]);
  const usages = cardsOf("usage");
  const hp = cardsOf("hpUpdated");
  assert.equal(usages.length, 3, "an attack card for each attack made");
  assert.equal(hp.length, 3, "an HP Updated card for each hit");
  for ( const m of [...usages, ...hp] ) {
    assert.equal(fold.memberOf(m), data.group);
    assert.ok(fold.isFolded(m), "hidden in the chat log");
  }
  assert.ok(!fold.isFolded(card), "the summary itself shows");
  assert.match(summary.renderSummary(data, { controls: true }), /class="primal-attacks-cards" data-group="[^"]+">.*Summary.ShowCards/);
  assert.doesNotMatch(summary.renderSummary(data, { asPublic: true }), /primal-attacks-cards/, "no button in the stored card");

  // The summary's button shows them, and hides them again.
  assert.equal(fold.toggleCards(data.group), true);
  assert.ok(!fold.isFolded(usages[0]));
  assert.equal(fold.toggleCards(data.group), false);
  assert.ok(fold.isFolded(usages[0]));
});

await check("fold: cards wait hidden for their summary, and come back if it never comes", async () => {
  setup({ midi: true });
  const message = await ChatMessage.create({ type: "usage", flags: { "primal-attacks": { member: "lostSet" } } });
  assert.ok(fold.isFolded(message));
  assert.ok(!fold.isFolded(message, Date.now() + (6 * 60 * 1000)));
  // The world setting turns folding off.
  settings.set("primal-attacks.foldCards", false);
  assert.ok(!fold.isFolded(message));
});

await check("fold: off, a single attack, or without Midi-QOL, nothing is folded", async () => {
  for ( const run of ["setting off", "single", "plain"] ) {
    setup({ midi: run !== "plain" });
    if ( run === "setting off" ) settings.set("primal-attacks.foldCards", false);
    makeToken({ id: "dog", name: "Dog", ac: 13, hp: 60 });
    target("dog");
    const fred = makeActor({ name: "Fred", items: [sword()] });
    queueD20(15, 15);
    answer(run === "single" ? 1 : 2);
    const attack = attackOf(fred, "Longsword");
    if ( run === "plain" ) await attack.rollAttack({}, {}, {});
    else await attack.use({ ...click });
    await settle(120);
    assert.ok(log.messages.every(m => !fold.memberOf(m)), run);
    for ( const m of summaries() ) assert.equal(m.flags["primal-attacks"].summary.folded, false, run);
  }
});

await check("fold: a set whose first attack never finishes leaves its card in the chat log", async () => {
  setup({ midi: true });
  makeToken({ id: "brohg", name: "B'rohg", ac: 23, hp: 30 });
  target("brohg");
  const fred = makeActor({ name: "Fred", items: [{ name: "Ignacious", activities: [{}] }] });
  const attack = attackOf(fred, "Ignacious");
  const original = MidiAttackActivity.prototype.runWorkflow;
  MidiAttackActivity.prototype.runWorkflow = async function(workflow) {
    if ( log.workflows.length === 1 ) {
      await this.rollAttack({ workflow, midiOptions: {} }, {}, {});
      return;
    }
    return original.call(this, workflow);
  };
  try {
    queueD20(15, 15);
    answer(2);
    await attack.use({ ...click });
    await settle(20);
    const first = cardsOf("usage")[0];
    assert.equal(fold.memberOf(first) !== null, true, "marked while the set runs");
    // A new set ends the one left waiting.
    queueD20(16, 16);
    answer(2);
    await attack.use({ ...click });
    await settle(120);
    assert.equal(fold.memberOf(first), null, "unmarked: no summary is coming for it");
  } finally {
    MidiAttackActivity.prototype.runWorkflow = original;
  }
});

/* -------------------------------------------- */
/*  The window                                  */
/* -------------------------------------------- */

await check("plain: a one-time rider (another module's charged or once-a-turn damage) goes with the first hit only", () => {
  setup();
  class R { constructor(formula, data, options) { this.formula = formula; this.data = data; this.options = options; } }
  const rolls = [new R("1d8 + 3", {}, { type: "slashing" }), new R("1d6", {}, { type: "fire", "primal-attacks": { once: true } })];
  engine.multiplyDamage(rolls, { "primal-attacks": { copies: 3 } });
  assert.deepEqual(rolls.map(r => r.formula), ["1d8 + 3", "1d6", "1d8 + 3", "1d8 + 3"]);
  const byHit = engine.splitByHit(rolls, 3);
  assert.deepEqual(byHit.map(h => h.map(r => r.formula)), [["1d8 + 3", "1d6"], ["1d8 + 3"], ["1d8 + 3"]]);
  // Rolls with no hit marks are still shared out evenly, as before.
  assert.deepEqual(engine.splitByHit([new R("a", {}, {}), new R("b", {}, {})], 2).map(h => h.map(r => r.formula)), [["a"], ["b"]]);
});

await check("window: offered on anyone's turn, as the player's setting says", async () => {
  setup();
  const fighter = makeActor({ name: "Fighter", items: [sword()] });
  const attack = attackOf(fighter, "Longsword");
  assert.ok(dialog.offersCount(attack));
  // The other side's turn (Primal Combat's side initiative, or anyone else's turn).
  game.combats = [{ started: true, combatants: [{ actor: fighter }, { actor: { uuid: "Actor.other" } }], combatant: { actor: { uuid: "Actor.other" } } }];
  assert.ok(dialog.offersCount(attack));
  settings.set("primal-attacks.offerOnAttack", "monsters");
  assert.ok(!dialog.offersCount(attack));
  settings.set("primal-attacks.offerOnAttack", "characters");
  assert.ok(dialog.offersCount(attack));
  game.combats = [];
});

await check("window: the number is kept between 1 and the most allowed", () => {
  assert.equal(dialog.clampCount("3"), 3);
  assert.equal(dialog.clampCount(0), 1);
  assert.equal(dialog.clampCount(-2), 1);
  assert.equal(dialog.clampCount(99), 20);
  assert.equal(dialog.clampCount("abc"), 1);
  assert.equal(dialog.clampCount(2.7), 2);
});

/* -------------------------------------------- */
/*  Text                                        */
/* -------------------------------------------- */

await check("every PRIMAL_ATTACKS key the scripts use is in en.json", () => {
  const lang = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  const has = path => path.split(".").reduce((o, k) => o?.[k], lang) !== undefined;
  const dir = new URL("../scripts/", import.meta.url);
  const missing = [];
  for ( const file of ["dialog.mjs", "engine.mjs", "settings.mjs", "summary.mjs", "fold.mjs", "patches.mjs", "main.mjs"] ) {
    const text = readFileSync(new URL(file, dir), "utf8");
    for ( const [, key] of text.matchAll(/loc\("([A-Za-z.]+)"/g) ) if ( !has(`PRIMAL_ATTACKS.${key}`) ) missing.push(`${file}: ${key}`);
    for ( const [, key] of text.matchAll(/"(PRIMAL_ATTACKS\.[A-Za-z.]+)"/g) ) if ( !has(key) ) missing.push(`${file}: ${key}`);
  }
  assert.deepEqual(missing, []);
});

console.log(`${passed} passed${process.exitCode ? ", some failed" : ""}`);
