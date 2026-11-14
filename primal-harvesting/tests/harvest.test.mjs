/**
 * A harvest from start to end against stand-ins for Foundry and dnd5e: the window's starting picks (best assessor and
 * carver, helpers by size, ritual carving), the harvest list, dnd5e's skill checks (no message of their own), one
 * card with both rolls, the corpse marked harvested, components in the inventory (stacking), a player's harvest
 * finished by the GM over the socket, the "ready to harvest" card, and every text in the language file.
 * Run with: node tests/harvest.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  becomeUser, deliver, dialogAnswers, installFoundry, log, makeActor, makeToken, missingKeys, queueD20, queueRoll,
  registerSettings, settle
} from "./fakes.mjs";

installFoundry();
const { HarvestWindow } = await import("../scripts/apps/harvest-window.mjs");
HarvestWindow.listen();
const { HarvestTablesEditor, renderTablesEditor } = await import("../scripts/apps/tables-editor.mjs");
const { HarvestRulesEditor } = await import("../scripts/apps/rules-editor.mjs");
const gm = await import("../scripts/gm.mjs");
const harvest = await import("../scripts/harvest.mjs");
const store = await import("../scripts/store.mjs");
const { normalizeTables } = await import("../scripts/tables.mjs");
const { escapeHTML: esc } = await import("../scripts/constants.mjs");

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

const TABLES = {
  types: {
    ooze: [
      { name: "Ooze residue", dc: 5, tags: ["E"] },
      { name: "Membrane", dc: 10 },
      { name: "Nucleus", dc: 15, tags: ["V"], max: 1 }
    ],
    celestial: [{ name: "Feather", dc: 10 }]
  },
  creatures: [{ name: "Polyhedrooze", aliases: ["Hexahedrooze"], useTypeTable: true, components: [{ name: "Die face", dc: 10 }] }]
};

/** A fresh world: GM (or player) logged in, the tables, a party of three and a dead ooze. */
async function world({ asGM=true, tables=TABLES, oozeName="Tetrahedrooze", cr=3, size="med", type="ooze" }={}) {
  installFoundry({ gm: true });
  await registerSettings();
  await game.settings.set("primal-harvesting", "tables", normalizeTables(tables));
  gm.registerSocket();
  const aria = makeActor({ name: "Aria", abilities: { int: 18, dex: 10 }, skills: { nat: 1 }, prof: 3 });
  const bram = makeActor({ name: "Bram", abilities: { int: 8, dex: 18 }, skills: { nat: 1 }, prof: 3 });
  const cass = makeActor({ name: "Cass", abilities: { int: 12, dex: 12, wis: 18 }, skills: { rel: 1 }, prof: 3, casting: "wis" });
  const dee = makeActor({ name: "Dee", abilities: { int: 10, dex: 12 }, skills: { nat: 2 }, prof: 2 });
  game.actors.push(aria, bram, cass, dee);
  const ooze = makeActor({ name: oozeName, type: "npc", creatureType: type, size, cr, hp: 0, player: false });
  const token = makeToken(ooze);
  if ( !asGM ) {
    becomeUser(false);
    game.user.character = cass;
  }
  return { aria, bram, cass, dee, ooze, token };
}

async function openWindow(token) {
  const app = HarvestWindow.open(token);
  assert.ok(app, "the window opens");
  await app.render();
  return app;
}

/* -------------------------------------------- */

await check("the window picks the best assessor and carver, and helpers up to the size's limit", async () => {
  const { token } = await world();
  const app = await openWindow(token);
  const m = app._model;
  assert.equal(m.skill, "nat", "an ooze is harvested with Nature");
  assert.equal(m.assessor.name, "Aria", "highest Intelligence (Nature)");
  assert.equal(m.carver.name, "Bram", "highest Dexterity (Nature)");
  assert.equal(m.ritual, false, "oozes can't be ritual carved");
  assert.equal(m.maxHelpers, 2, "Medium: two helpers");
  assert.deepEqual(m.helpers.map(a => a.name).sort(), ["Cass", "Dee"]);
  assert.equal(m.helperSum, 2 + 1, "Dee is proficient (+2), Cass isn't (half of 3 = +1)");
  assert.deepEqual(m.available.map(c => c.name), ["Ooze residue", "Membrane", "Nucleus", "Frail Essence"],
    "Tetrahedrooze isn't one of the Polyhedrooze table's names, so it gets the ooze table and a CR 3 essence");
  assert.ok(app.lastHTML.includes("Harvest list"));
  await app.close();
});

await check("a creature with no creature table gets its type's components and its essence", async () => {
  const { token } = await world({ oozeName: "Gelatinous Cube" });
  const app = await openWindow(token);
  assert.deepEqual(app._model.available.map(c => c.name), ["Ooze residue", "Membrane", "Nucleus", "Frail Essence"]);
  await app.close();
  const named = await world({ oozeName: "Hexahedrooze" });
  const app2 = await openWindow(named.token);
  assert.deepEqual(app2._model.available.map(c => c.name), ["Die face", "Ooze residue", "Membrane", "Nucleus", "Frail Essence"],
    "an alias of the Polyhedrooze table, which also offers the type's components");
  await app2.close();
});

await check("the harvest list: running DCs, a most-once component, moving rows", async () => {
  const { token } = await world({ oozeName: "Gelatinous Cube" });
  const app = await openWindow(token);
  const key = name => app._model.available.find(c => c.name === name).key;
  await app.act("add", { key: key("Membrane") });
  await app.act("add", { key: key("Ooze residue") });
  await app.act("add", { key: key("Nucleus") });
  await app.act("add", { key: key("Nucleus") });
  assert.deepEqual(app.list.map(c => c.name), ["Membrane", "Ooze residue", "Nucleus"], "the nucleus goes in once only");
  assert.deepEqual(app._model.dcs, [10, 15, 30]);
  await app.act("up", { index: "1" });
  assert.deepEqual(app.list.map(c => c.name), ["Ooze residue", "Membrane", "Nucleus"]);
  assert.deepEqual(app._model.dcs, [5, 15, 30]);
  await app.act("remove", { index: "2" });
  assert.deepEqual(app.list.map(c => c.name), ["Ooze residue", "Membrane"]);
  await app.act("clearList");
  assert.equal(app.list.length, 0);
  await app.act("addAll");
  assert.deepEqual(app.list.map(c => c.name), ["Ooze residue", "Membrane", "Nucleus", "Frail Essence"], "lowest DC first");
  assert.ok(app.lastHTML.includes("chance-"), "rows are coloured by how likely they are");
  await app.close();
});

await check("Harvest: dnd5e's two checks, one card with both rolls, the corpse marked, the components given", async () => {
  const { token, aria, bram } = await world({ oozeName: "Gelatinous Cube" });
  const app = await openWindow(token);
  const key = name => app._model.available.find(c => c.name === name).key;
  for ( const n of ["Ooze residue", "Membrane", "Membrane", "Nucleus"] ) await app.act("add", { key: key(n) });
  await app.change("recipient", aria.uuid);
  // Aria: d20 12 + Int 4 + prof 3 = 19. Bram: d20 9 + Dex 4 + 3 = 16. Helpers +3. Total 38.
  queueD20(12, 9);
  await app.act("harvest");
  assert.equal(log.rolls.length, 2);
  assert.deepEqual(log.rolls.map(r => [r.actor, r.config.skill, r.ability, r.config.disadvantage ?? false]),
    [["Aria", "nat", "int", false], ["Bram", "nat", "dex", false]]);
  assert.ok(log.rolls.every(r => r.message.create === false), "no message of their own");
  assert.ok(log.rolls.every(r => r.dialog.configure === false), "no roll windows by default");
  const card = log.messages.find(m => m.flags?.["primal-harvesting"]?.card);
  assert.ok(card, "a result card");
  assert.equal(card.rolls.length, 2, "both rolls on the card, for Dice So Nice");
  assert.equal(card.flags["primal-harvesting"].card.total, 38);
  assert.ok(card.content.includes("Harvested: Gelatinous Cube"));
  assert.ok(card.content.includes("needed 40"), "the nucleus (harvest DC 40) is lost");
  assert.ok(card.content.includes("Volatile: failed"), "and it's volatile");
  assert.ok(card.content.includes("Cass +1") && card.content.includes("Dee +2"));
  const record = token.getFlag("primal-harvesting", "harvested");
  assert.deepEqual(record.harvested, ["Ooze residue", "Membrane", "Membrane"]);
  assert.deepEqual(record.lost, ["Nucleus"]);
  assert.equal(record.total, 38);
  assert.deepEqual(aria.items.map(i => [i.name, i.system.quantity, i.type, i.system.type.value]),
    [["Gelatinous Cube Ooze residue", 1, "loot", "material"], ["Gelatinous Cube Membrane", 2, "loot", "material"]]);
  assert.ok(app.closed, "the window closes");
  assert.equal(bram.items.length, 0);
});

await check("a second corpse of the same kind stacks onto the components already there", async () => {
  const { token, aria } = await world({ oozeName: "Gelatinous Cube" });
  const second = makeToken(token.actor);
  for ( const t of [token, second] ) {
    const app = await openWindow(t);
    await app.act("add", { key: app._model.available.find(c => c.name === "Membrane").key });
    await app.change("recipient", aria.uuid);
    queueD20(10, 10);
    await app.act("harvest");
  }
  assert.deepEqual(aria.items.map(i => [i.name, i.system.quantity]), [["Gelatinous Cube Membrane", 2]]);
});

await check("an essence becomes an item with its rarity, named for the creature", async () => {
  const { token, aria } = await world({ oozeName: "Gelatinous Cube", cr: 8 });
  const app = await openWindow(token);
  const essence = app._model.available.find(c => c.source === "essence");
  assert.equal(essence.name, "Robust Essence");
  assert.equal(essence.dc, 30);
  await app.act("add", { key: essence.key });
  await app.change("recipient", aria.uuid);
  queueD20(20, 20);
  await app.act("harvest");
  const item = aria.items[0];
  assert.equal(item.name, "Robust Essence (Gelatinous Cube)");
  assert.equal(item.system.rarity, "rare");
  assert.equal(item.flags["primal-harvesting"].component.essence, "Robust");
});

await check("one creature making both checks rolls both with disadvantage", async () => {
  installFoundry();
  await registerSettings();
  await game.settings.set("primal-harvesting", "tables", normalizeTables(TABLES));
  const solo = makeActor({ name: "Solo", abilities: { int: 14, dex: 14 }, skills: { nat: 1 } });
  game.actors.push(solo);
  const ooze = makeActor({ name: "Gelatinous Cube", type: "npc", creatureType: "ooze", hp: 0, player: false });
  const token = makeToken(ooze);
  const app = await openWindow(token);
  assert.equal(app._model.assessor, solo);
  assert.equal(app._model.carver, solo);
  assert.ok(app.lastHTML.includes("rolls both with disadvantage"));
  await app.act("add", { key: app._model.available[0].key });
  queueD20(15, 3, 15, 3);
  await app.act("harvest");
  assert.deepEqual(log.rolls.map(r => r.config.disadvantage), [true, true]);
  assert.deepEqual(log.rolls.map(r => r.total), [3 + 4, 3 + 4], "the lower die each time");
});

await check("ritual carving: a spellcaster carves a celestial with their spellcasting ability", async () => {
  const { token, cass } = await world({ oozeName: "Deva", type: "celestial", tables: TABLES });
  const app = await openWindow(token);
  const m = app._model;
  assert.equal(m.skill, "rel");
  assert.equal(m.carver, cass, "Cass's Wisdom (Religion) +7 beats everyone's Dexterity for a ritual carving");
  assert.equal(m.ritual, true);
  assert.ok(app.lastHTML.includes("Ritual carving (Wisdom)"));
  await app.act("add", { key: m.available[0].key });
  queueD20(10, 10);
  await app.act("harvest");
  assert.equal(log.rolls[1].config.ability, "spellcasting");
  assert.equal(log.rolls[1].ability, "wis");
  const card = log.messages.find(x => x.flags?.["primal-harvesting"]?.card);
  assert.ok(card.content.includes("Ritual carving · Wisdom (Religion)"));
});

await check("the GM can turn ritual carving off, and pick another carver", async () => {
  const { token, bram } = await world({ oozeName: "Deva", type: "celestial" });
  const app = await openWindow(token);
  await app.change("ritual", "on", { checked: false });
  assert.equal(app._model.ritual, false);
  await app.change("carver", bram.uuid);
  assert.equal(app._model.carver, bram);
  assert.ok(!app._model.helpers.includes(bram), "the carver isn't a helper");
  await app.close();
});

await check("a corpse can't be harvested twice, except by the GM after asking", async () => {
  const { token } = await world({ oozeName: "Gelatinous Cube" });
  await token.setFlag("primal-harvesting", "harvested", { harvested: ["Membrane"], total: 20 });
  const app = await openWindow(token);
  assert.ok(app.lastHTML.includes("Already harvested"));
  assert.ok(app.lastHTML.includes("Harvest again"));
  await app.act("add", { key: app._model.available[0].key });
  dialogAnswers.confirm = false;
  await app.act("harvest");
  assert.equal(log.rolls.length, 0, "the GM said no");
  dialogAnswers.confirm = true;
  queueD20(10, 10);
  await app.act("harvest");
  assert.equal(log.rolls.length, 2);
  assert.equal(token.getFlag("primal-harvesting", "harvested").total > 0, true);
});

await check("a player can't open a living monster, or harvest when the GM has said no", async () => {
  const { token, ooze } = await world({ asGM: false, oozeName: "Gelatinous Cube" });
  ooze.system.attributes.hp.value = 5;
  assert.equal(HarvestWindow.open(token), null);
  assert.match(log.notifications.at(-1).m, /isn't beaten yet/);
  ooze.system.attributes.hp.value = 0;
  becomeUser(true);
  await game.settings.set("primal-harvesting", "playersCanHarvest", false);
  becomeUser(false);
  assert.equal(HarvestWindow.open(token), null);
  assert.match(log.notifications.at(-1).m, /Only the GM/);
});

await check("a player's harvest is finished by the GM over the socket", async () => {
  const { token, cass } = await world({ asGM: false, oozeName: "Gelatinous Cube" });
  const app = await openWindow(token);
  assert.equal(app._model.recipientId ?? app.recipientId, cass.uuid, "the player's own character gets the components");
  await app.act("add", { key: app._model.available.find(c => c.name === "Membrane").key });

  // A player can't roll until the GM approves the harvest.
  await app.act("harvest");
  assert.equal(log.rolls.length, 0, "not yet approved");
  assert.ok(app.lastHTML.includes("Waiting for the GM"));
  becomeUser(true);
  for ( const tell of log.emitted.filter(e => e.message.kind === "tell") ) await deliver(tell.message);
  await gm.changeSession({ tokenUuid: token.uuid, op: { op: "approve", value: { by: "GM", at: 1 } } }, game.user);
  const approved = log.emitted.filter(e => (e.message.kind === "broadcast") && (e.message.type === "session")).at(-1);
  becomeUser(false);
  await deliver(approved.message);
  assert.ok(app.lastHTML.includes("Approved by GM"), "the GM's approval reaches the player's window at once");

  queueD20(10, 10);
  const pending = app.act("harvest");
  await settle();
  const request = log.emitted.find(e => e.message.kind === "request");
  assert.ok(request, "the player asks the GM");
  assert.equal(request.message.action, "finish");
  assert.equal(request.message.data.tokenUuid, token.uuid);
  assert.equal(request.message.data.recipientUuid, cass.uuid);

  // The GM's client does it and answers.
  becomeUser(true);
  await deliver(request.message);
  const response = log.emitted.find(e => e.message.kind === "response");
  assert.ok(response?.message.ok, `the GM answers ok (${response?.message.error})`);
  assert.deepEqual(cass.items.map(i => i.name), ["Gelatinous Cube Membrane"]);
  assert.ok(token.getFlag("primal-harvesting", "harvested"));

  // The player's client gets the answer and posts the card.
  becomeUser(false);
  await deliver(response.message);
  await pending;
  const card = log.messages.find(m => m.flags?.["primal-harvesting"]?.card);
  assert.ok(card?.content.includes(esc("added to Cass's inventory")));
});

await check("the GM refuses a player's second harvest of the same corpse", async () => {
  const { token } = await world({ oozeName: "Gelatinous Cube" });
  await token.setFlag("primal-harvesting", "harvested", { total: 1 });
  const player = game.users.get("player");
  await assert.rejects(gm.finishHarvest({ tokenUuid: token.uuid, items: [], record: {} }, player), /already been harvested/);
  await assert.rejects(gm.finishHarvest({ tokenUuid: token.uuid, items: [], record: {}, again: true }, player), /already been harvested/,
    "only a GM can harvest again");
});

await check("a player with no GM logged in is told so before anything is rolled", async () => {
  const { token } = await world({ asGM: false, oozeName: "Gelatinous Cube" });
  game.users.activeGM = null;
  const app = await openWindow(token);
  await app.act("add", { key: app._model.available[0].key });
  await app.act("harvest");
  assert.equal(log.rolls.length, 0);
  assert.match(log.notifications.at(-1).m, /A GM needs to be logged in/);
});

await check("the GM's type and creature-table picks are kept on the actor", async () => {
  const { token, ooze } = await world({ oozeName: "Odd Thing", type: "custom" });
  const app = await openWindow(token);
  assert.ok(app.lastHTML.includes(esc("isn't a creature type")), "an unknown type is pointed out");
  await app.change("type", "ooze");
  assert.equal(ooze.getFlag("primal-harvesting", "type"), "ooze");
  assert.equal(app._model.skill, "nat");
  const poly = store.getTables().creatures[0];
  await app.change("creature", poly.id);
  assert.equal(ooze.getFlag("primal-harvesting", "creature"), poly.id);
  assert.equal(app._model.creature.name, "Polyhedrooze");
  await app.change("creature", "");
  assert.equal(ooze.getFlag("primal-harvesting", "creature"), undefined);
  await app.close();
});

await check("the GM's quick component: for this harvest only, or saved to the table", async () => {
  const { token } = await world({ oozeName: "Gelatinous Cube", tables: { types: {}, creatures: [] } });
  const app = await openWindow(token);
  assert.ok(app.lastHTML.includes(esc("There's no harvest table for Ooze yet")));
  const fields = { quickName: "Slime", quickDC: "5", quickTags: "E", quickSave: false };
  app.element.querySelector = sel => {
    const name = sel.match(/name=(\w+)/)?.[1];
    return name in fields ? { value: fields[name], checked: fields[name] } : null;
  };
  await app.act("quickAdd");
  assert.deepEqual(app.list.map(c => [c.name, c.dc, c.tags]), [["Slime", 5, ["E"]]]);
  assert.equal(store.getTables().types.ooze.length, 0, "not saved");
  Object.assign(fields, { quickName: "Goo", quickDC: "10", quickTags: "", quickSave: true });
  await app.act("quickAdd");
  assert.deepEqual(store.getTables().types.ooze.map(c => c.name), ["Goo"], "saved to the ooze table");
  assert.equal(app.list.length, 2);
  await app.close();
});

await check("a combat's end posts one card with its beaten, unharvested monsters", async () => {
  const { token, aria } = await world({ oozeName: "Gelatinous Cube" });
  const alive = makeActor({ name: "Goblin", type: "npc", creatureType: "humanoid", hp: 7, player: false });
  const done = makeActor({ name: "Rat", type: "npc", creatureType: "beast", hp: 0, player: false });
  const aliveToken = makeToken(alive);
  const doneToken = makeToken(done);
  await doneToken.setFlag("primal-harvesting", "harvested", { total: 3 });
  const pcToken = makeToken(aria);
  const combat = { started: true, round: 3, combatants: [token, aliveToken, doneToken, pcToken].map(t => ({ token: t })) };
  await harvest.onCombatEnded(combat);
  const ready = log.messages.filter(m => m.flags?.["primal-harvesting"]?.ready);
  assert.equal(ready.length, 1);
  assert.deepEqual(ready[0].flags["primal-harvesting"].ready.tokens, [token.uuid]);
  assert.ok(ready[0].content.includes("data-primal-harvest=\"open\""));
  await game.settings.set("primal-harvesting", "offerInChat", "never");
  await harvest.onCombatEnded(combat);
  assert.equal(log.messages.filter(m => m.flags?.["primal-harvesting"]?.ready).length, 1, "not when turned off");
});

await check("\"when each monster dies\" posts a card as its hit points reach 0", async () => {
  const { token, ooze } = await world({ oozeName: "Gelatinous Cube" });
  await game.settings.set("primal-harvesting", "offerInChat", "death");
  await harvest.onActorUpdated(ooze, { system: { attributes: { hp: { value: 0 } } } });
  const ready = log.messages.filter(m => m.flags?.["primal-harvesting"]?.ready);
  assert.equal(ready.length, 1);
  assert.ok(ready[0].content.includes("Gelatinous Cube can be harvested"));
  await harvest.onActorUpdated(ooze, { name: "x" });
  assert.equal(log.messages.filter(m => m.flags?.["primal-harvesting"]?.ready).length, 1);
  assert.ok(token);
});

await check("the GM can pass the harvest time on the game clock", async () => {
  const { token } = await world({ oozeName: "Gelatinous Cube", size: "lg" });
  await game.settings.set("primal-harvesting", "advanceTime", true);
  const app = await openWindow(token);
  assert.equal(app._model.maxHelpers, 4);
  await app.act("add", { key: app._model.available[0].key });
  queueD20(10, 10);
  await app.act("harvest");
  assert.equal(log.advanced, 30 * 60, "Large: 30 minutes");
});

await check("components with a linked item give that item", async () => {
  const { token, aria } = await world({ oozeName: "Gelatinous Cube" });
  const { makeItem } = await import("./fakes.mjs");
  const potion = makeItem({ name: "Jar of Ooze", type: "consumable", system: { quantity: 1 } });
  const tables = store.getTables();
  tables.types.ooze[0].uuid = potion.uuid;
  await store.saveTables(tables);
  const app = await openWindow(token);
  await app.act("add", { key: app._model.available.find(c => c.name === "Ooze residue").key });
  await app.change("recipient", aria.uuid);
  queueD20(10, 10);
  await app.act("harvest");
  assert.deepEqual(aria.items.map(i => [i.name, i.type]), [["Jar of Ooze", "consumable"]]);
  assert.equal(aria.items[0].flags["primal-harvesting"].component.component, "Ooze residue");
});

await check("the Harvest Tables window renders every table and keeps nothing until Save", async () => {
  await world();
  const app = new HarvestTablesEditor({}, "type:ooze");
  await app.render();
  assert.ok(app.lastHTML.includes("Ooze residue"));
  assert.ok(app.lastHTML.includes("Polyhedrooze"));
  dialogAnswers.wait = { mode: "add", text: "Spore sac 10 V\nDC Component\nGel 5" };
  await app.act("paste");
  assert.deepEqual(app.tables.types.ooze.map(c => c.name), ["Ooze residue", "Membrane", "Nucleus", "Spore sac", "Gel"]);
  assert.equal(store.getTables().types.ooze.length, 3, "not saved yet");
  await app.act("save");
  assert.equal(store.getTables().types.ooze.length, 5);
  dialogAnswers.wait = { mode: "merge", text: JSON.stringify({ types: { beast: [{ name: "Pelt", dc: 10 }] } }) };
  await app.act("import");
  assert.deepEqual(app.tables.types.beast.map(c => c.name), ["Pelt"]);
  assert.equal(app.tables.types.ooze.length, 5, "merging kept the ooze table");
  dialogAnswers.wait = null;
  const html = renderTablesEditor({
    tables: normalizeTables({ types: { ooze: [{ name: "<b>x</b>", dc: 5 }] } }), selected: "type:ooze", dirty: true,
    labels: new Proxy({}, { get: (t, k) => String(k) }), typeLabel: t => t
  });
  assert.ok(!html.includes("<b>x</b>") && html.includes("&lt;b&gt;x&lt;/b&gt;"), "names are escaped");
});

await check("the Harvest Rules window saves changes", async () => {
  await world();
  const app = new HarvestRulesEditor();
  await app.render();
  assert.ok(app.lastHTML.includes("Robust"));
  app.rules.sizes.med.minutes = 20;
  app.rules.types.ooze.skill = "sur";
  app.element.querySelectorAll = () => [];
  await app.act("save");
  assert.equal(store.getRules().sizes.med.minutes, 20);
  assert.equal(store.getRules().types.ooze.skill, "sur");
});


/* -------------------------------------------- */
/*  The shared window                           */
/* -------------------------------------------- */

const SESSION = t => t.getFlag("primal-harvesting", "session");

await check("opening the window opens it for everyone, and the list is kept on the token", async () => {
  const { token, aria } = await world({ oozeName: "Gelatinous Cube" });
  const app = HarvestWindow.open(token);
  await app.ready;
  const opened = log.emitted.find(e => (e.message.kind === "broadcast") && (e.message.type === "open"));
  assert.ok(opened, "the window opens for everyone");
  assert.equal(opened.message.data.tokenUuid, token.uuid);
  assert.ok(SESSION(token), "the GM's client starts the shared state");
  assert.equal(SESSION(token).assessorId, app._model.assessor.uuid, "with the opener's picks");
  await app.act("add", { key: app._model.available.find(c => c.name === "Membrane").key });
  await app.act("add", { key: app._model.available.find(c => c.name === "Nucleus").key });
  assert.deepEqual(SESSION(token).list.map(c => c.name), ["Membrane", "Nucleus"]);
  await app.act("up", { index: 1 });
  assert.deepEqual(SESSION(token).list.map(c => c.name), ["Nucleus", "Membrane"]);
  await app.change("recipient", aria.uuid);
  assert.equal(SESSION(token).recipientId, aria.uuid);
  await app.close();
});

await check("a player's window opens from the GM's, shows the same list, and a player's change reaches everyone", async () => {
  const { token, cass } = await world({ oozeName: "Gelatinous Cube" });
  const gmApp = HarvestWindow.open(token);
  await gmApp.ready;
  await gmApp.act("add", { key: gmApp._model.available.find(c => c.name === "Membrane").key });
  const opened = log.emitted.find(e => (e.message.kind === "broadcast") && (e.message.type === "open")).message;
  await gmApp.close();

  // The player's client gets the broadcast: the window opens there, with the GM's list.
  becomeUser(false);
  game.user.character = cass;
  log.emitted.length = 0;
  await deliver(opened);
  const app = HarvestWindow.open(token, { remote: true });
  await app.render();
  assert.deepEqual(app.list.map(c => c.name), ["Membrane"]);
  assert.equal(log.emitted.filter(e => e.message.kind === "broadcast").length, 0, "a window opened for you doesn't open it again");

  // The player adds a component: their window shows it at once, and the GM's client is told.
  await app.act("add", { key: app._model.available.find(c => c.name === "Ooze residue").key });
  assert.deepEqual(app.list.map(c => c.name), ["Membrane", "Ooze residue"]);
  const tell = log.emitted.find(e => e.message.kind === "tell");
  assert.equal(tell?.message.action, "session");
  becomeUser(true);
  await deliver(tell.message);
  assert.deepEqual(SESSION(token).list.map(c => c.name), ["Membrane", "Ooze residue"], "the GM's client keeps it on the token");

  // Someone else changes it: the window re-draws from the token.
  becomeUser(false);
  const changed = structuredClone(SESSION(token));
  changed.list.reverse();
  await token.setFlag("primal-harvesting", "session", changed);
  HarvestWindow.refreshFor(token);
  await settle();
  assert.deepEqual(app.list.map(c => c.name), ["Ooze residue", "Membrane"]);

  // While someone else rolls the harvest, Harvest waits.
  changed.harvesting = { userId: "gm", name: "GM", at: Date.now() };
  await token.setFlag("primal-harvesting", "session", changed);
  HarvestWindow.refreshFor(token);
  await settle();
  assert.ok(app.lastHTML.includes("GM is harvesting"));
  await app.act("harvest");
  assert.equal(log.rolls.length, 0);

  // Once the corpse is harvested, the window closes everywhere.
  await token.setFlag("primal-harvesting", "harvested", { at: 5, total: 20 });
  HarvestWindow.refreshFor(token);
  assert.ok(app.closed);
});

await check("two changes at once are both kept, in the order they came", async () => {
  const { token } = await world({ oozeName: "Gelatinous Cube" });
  const app = HarvestWindow.open(token);
  await app.ready;
  const player = game.users.get("player");
  const a = { key: "type:a", name: "A", dc: 5, uid: "u1" };
  const b = { key: "type:b", name: "B", dc: 5, uid: "u2" };
  await Promise.all([
    gm.changeSession({ tokenUuid: token.uuid, op: { op: "add", components: [a] } }, player),
    gm.changeSession({ tokenUuid: token.uuid, op: { op: "add", components: [b] } }, game.user)
  ]);
  assert.deepEqual(SESSION(token).list.map(c => c.name), ["A", "B"]);
  await gm.changeSession({ tokenUuid: token.uuid, op: { op: "extra", component: { key: "extra:x", name: "X", dc: 1 } } }, player);
  assert.equal(SESSION(token).extra.length, 0, "only the GM adds components for one harvest");
  await app.close();
});

await check("harvesting ends the shared window", async () => {
  const { token } = await world({ oozeName: "Gelatinous Cube" });
  const app = HarvestWindow.open(token);
  await app.ready;
  await app.act("add", { key: app._model.available.find(c => c.name === "Membrane").key });
  queueD20(10, 10);
  await app.act("harvest");
  assert.ok(token.getFlag("primal-harvesting", "harvested"));
  assert.equal(SESSION(token), undefined);
});

await check("with sharing off, the window is this user's alone", async () => {
  const { token } = await world({ oozeName: "Gelatinous Cube" });
  await game.settings.set("primal-harvesting", "shareWindow", false);
  const app = HarvestWindow.open(token);
  await app.ready;
  await app.act("add", { key: app._model.available.find(c => c.name === "Membrane").key });
  assert.equal(SESSION(token), undefined);
  assert.equal(log.emitted.length, 0);
  await app.close();
});

/* -------------------------------------------- */
/*  Notes, random components and prices         */
/* -------------------------------------------- */

const OOZE_TABLES = {
  types: {
    ooze: {
      note: "Optional Rule: Hard Bits.\nRoll a d100.",
      components: [{ name: "Phial of acid", dc: 5 }, { name: "Membrane", dc: 20 }],
      random: { name: "Ooze's Random Components", rows: [
        "1-20 Nothing", "21-30 Bone (beast)", "31-40 Pouch of teeth (humanoid) DC 10", "41-45 Horn* (celestial/fey/fiend)",
        "46-50 Tooth (giant)", "97-99 Roll twice more", "100 Roll thrice more"
      ] }
    },
    beast: [{ name: "Bone", dc: 10 }],
    fey: [{ name: "Horn", dc: 10 }]
  },
  creatures: [{ name: "Polyhedrooze", components: [{ name: "Facet", dc: 10 }] }]
};

await check("the type's notes show in the harvest window", async () => {
  const { token } = await world({ oozeName: "Gelatinous Cube", tables: OOZE_TABLES });
  const app = await openWindow(token);
  assert.ok(app.lastHTML.includes("Harvesting notes: Ooze"));
  assert.ok(app.lastHTML.includes("<p>Optional Rule: Hard Bits.</p><p>Roll a d100.</p>"));
  await app.close();
});

await check("random components are rolled once, kept on the token, and can be harvested", async () => {
  const { token, aria } = await world({ oozeName: "Gelatinous Cube", tables: OOZE_TABLES });
  const app = await openWindow(token);
  assert.ok(app.lastHTML.includes("Roll Ooze&#39;s Random Components (d100)"));
  queueRoll(98, 25, 47, 33);
  await app.act("rollRandom");
  assert.deepEqual(log.plainRolls.map(r => [r.formula, r.total]), [["1d100", 98], ["1d100", 25], ["1d100", 47]],
    "98 rolls twice more; neither of those rolls again");
  const record = token.getFlag("primal-harvesting", "random");
  assert.deepEqual(record.components.map(c => [c.name, c.fromLabel, c.dc, c.dcUnknown]),
    [["Bone", "Beast", 10, false], ["Tooth", "Giant", 0, true]], "a DC from the beast table; none for a giant's tooth");
  const card = log.messages.find(m => m.flags?.["primal-harvesting"]?.randomCard);
  assert.equal(card.rolls.length, 3, "every die on the card, for Dice So Nice");
  assert.ok(card.content.includes("Bone (Beast), DC 10"));
  assert.ok(card.content.includes("no DC found"));

  await app.render();
  assert.ok(!app.lastHTML.includes("data-action=\"rollRandom\""), "rolled once");
  const bone = app._model.available.find(c => c.source === "random" && c.name === "Bone");
  assert.ok(bone);
  await assert.rejects(gm.storeRandom({ tokenUuid: token.uuid, record: {} }, game.users.get("player")), /already been rolled/);

  await app.act("add", { key: bone.key });
  await app.change("recipient", aria.uuid);
  queueD20(10, 10);
  await app.act("harvest");
  const item = aria.items[0];
  assert.equal(item.name, "Bone (Beast)");
  assert.deepEqual(item.system.price, { value: 30, denomination: "gp" });
  assert.ok(item.system.description.value.includes("Found inside a Gelatinous Cube"));
});

await check("a creature table of its own leaves out the type's random components", async () => {
  const { token } = await world({ oozeName: "Polyhedrooze", tables: OOZE_TABLES });
  const app = await openWindow(token);
  assert.ok(!app.lastHTML.includes("rollRandom"));
  assert.ok(!app.lastHTML.includes("Harvesting notes: Ooze"));
  await app.close();
});

await check("components are priced at 3 gp per DC, essences at their own price, and the card says what it's worth", async () => {
  const { token, aria } = await world({ oozeName: "Gelatinous Cube", cr: 8, tables: OOZE_TABLES });
  const app = await openWindow(token);
  const acid = app._model.available.find(c => c.name === "Phial of acid");
  assert.ok(app.lastHTML.includes("Sells for 15 gp"));
  await app.act("add", { key: acid.key });
  await app.act("add", { key: app._model.available.find(c => c.source === "essence").key });
  await app.change("recipient", aria.uuid);
  queueD20(20, 20);
  await app.act("harvest");
  assert.deepEqual(aria.items.map(i => [i.name, i.system.price?.value]),
    [["Gelatinous Cube Phial of acid", 15], ["Robust Essence (Gelatinous Cube)", 400]]);
  const card = log.messages.find(m => m.flags?.["primal-harvesting"]?.card);
  assert.ok(card.content.includes("Worth 415 gp in all."));
});

await check("the tables window edits a type's notes and random table", async () => {
  await world({ tables: OOZE_TABLES });
  const app = new HarvestTablesEditor({}, "type:ooze");
  await app.render();
  assert.ok(app.lastHTML.includes("21-30 Bone (beast)"));
  assert.ok(app.lastHTML.includes("Optional Rule: Hard Bits."));
  const field = (name, value) => ({ dataset: { field: name }, value, closest: () => box });
  const box = {
    querySelector: sel => (sel.includes("randomName") ? { value: "Hard Bits" }
      : (sel.includes("random-status") ? status : { value: "1-50 Nothing\n51-100 Gem (dragon) DC 15\nnot a row" }))
  };
  const status = { textContent: "" };
  for ( const fn of app.element.listeners.change ) fn({ target: field("random", "") });
  for ( const fn of app.element.listeners.change ) fn({ target: { dataset: { field: "tableNote" }, value: "New note\r\n" } });
  assert.deepEqual(app.tables.random.ooze.rows.map(r => [r.min, r.max, r.name, r.dc]), [[1, 50, "", null], [51, 100, "Gem", 15]]);
  assert.equal(app.tables.random.ooze.name, "Hard Bits");
  assert.match(status.textContent, /2 rows, rolled with a d100\. Left out \(not rows\): not a row\./);
  assert.equal(app.tables.notes.ooze, "New note");
  await app.act("save");
  assert.equal(store.getTables().random.ooze.rows.length, 2);
  assert.equal(store.getTables().notes.ooze, "New note");
});

await check("the rules window lists the world's own skills by name", async () => {
  await world();
  const app = new HarvestRulesEditor();
  await app.render();
  assert.ok(app.lastHTML.includes('<option value="ani" selected>Artifice</option>'), "constructs use Artifice");
  assert.ok(app.lastHTML.includes("80000"), "Deific Essence's price");
});

/* -------------------------------------------- */
/*  Who takes part, approval, live changes      */
/* -------------------------------------------- */

const { applyOp, normalizeSession } = await import("../scripts/session.mjs");
const splashModule = await import("../scripts/splash.mjs");
const broadcastsOf = type => log.emitted.filter(e => (e.message.kind === "broadcast") && (e.message.type === type));

/** The GM's window, then the player's (opened for them), with the GM's client making the shared changes. */
async function sharedWindows({ oozeName="Gelatinous Cube" }={}) {
  const w = await world({ oozeName });
  const gmApp = HarvestWindow.open(w.token);
  await gmApp.ready;
  const opened = broadcastsOf("open")[0].message;
  await gmApp.close();
  becomeUser(false);
  game.user.character = w.cass;
  log.emitted.length = 0;
  await deliver(opened);
  const app = HarvestWindow.open(w.token, { remote: true });
  await app.render();
  return { ...w, app };
}

/** Make the player's changes on the GM's client, then show the player what the GM's client sent back. */
async function syncFromGM() {
  const tells = log.emitted.filter(e => e.message.kind === "tell");
  log.emitted.length = 0;
  becomeUser(true);
  for ( const tell of tells ) await deliver(tell.message);
  const sent = broadcastsOf("session");
  becomeUser(false);
  for ( const b of sent ) await deliver(b.message);
}

await check("the GM approves a harvest; a player's change to the list or who rolls withdraws it", async () => {
  const { token, dee, aria, app } = await sharedWindows();
  await app.act("add", { key: app._model.available.find(c => c.name === "Membrane").key });
  await syncFromGM();
  assert.ok(app.lastHTML.includes('class="ph-go" data-action="harvest" disabled'), "Harvest waits for the GM");

  becomeUser(true);
  await gm.changeSession({ tokenUuid: token.uuid, op: { op: "approve", value: { by: "GM", at: 1 } } }, game.user);
  const sent = broadcastsOf("session").at(-1);
  becomeUser(false);
  await deliver(sent.message);
  assert.ok(app.approved, "approved");
  assert.ok(!app.lastHTML.includes('data-action="harvest" disabled'));

  // Who gets the components doesn't change the roll: the approval holds.
  log.emitted.length = 0;
  await app.change("recipient", aria.uuid);
  await syncFromGM();
  assert.ok(SESSION(token).approved, "a new recipient keeps the approval");

  // A different helper does: it's withdrawn at once on the player's screen and in the shared state.
  await app.change("helper", dee.uuid, { checked: false });
  assert.equal(app.approved, null);
  await syncFromGM();
  assert.equal(SESSION(token).approved, null);
  assert.ok(app.lastHTML.includes("Waiting for the GM"));

  // The GM's client refuses a player's harvest that isn't approved, whatever the player's window thinks.
  await assert.rejects(gm.finishHarvest({ tokenUuid: token.uuid, items: [], record: {}, minutes: 0 }, game.users.get("player")),
    /hasn't approved/);
  // The GM never needs it.
  becomeUser(true);
  assert.equal(gm.needsApproval(game.user), false);
  await game.settings.set("primal-harvesting", "requireApproval", false);
  assert.equal(gm.needsApproval(game.users.get("player")), false, "the GM can turn approval off");
});

await check("approval rules of the shared state", async () => {
  await world();
  const base = normalizeSession({ list: [{ key: "type:a", name: "A", dc: 5, uid: "u1" }], approved: { by: "GM", at: 1 } });
  const player = { isGM: false };
  const asGM = { isGM: true };
  assert.equal(applyOp(base, { op: "approve", value: { by: "Cass", at: 2 } }, player).approved.by, "GM", "players can't approve");
  assert.equal(applyOp(base, { op: "approve", value: null }, asGM).approved, null, "the GM withdraws it");
  assert.ok(applyOp(base, { op: "set", values: { recipientId: "Actor.x" } }, player).approved);
  assert.equal(applyOp(base, { op: "set", values: { carverId: "Actor.x" } }, player).approved, null);
  assert.equal(applyOp(base, { op: "add", components: [{ key: "type:b", name: "B", dc: 5, uid: "u2" }] }, player).approved, null);
  assert.ok(applyOp(base, { op: "add", components: [{ key: "type:b", name: "B", dc: 5, uid: "u2" }] }, asGM).approved,
    "the GM's own change keeps it");
  assert.ok(applyOp(base, { op: "harvesting", value: { userId: "player", name: "P", at: 1 } }, player).approved);
  assert.equal(applyOp(null, { op: "init", state: base }, player).approved, null, "a player can't start a session approved");
});

await check("with players logged in, only their characters take part, and the GM can add anyone", async () => {
  const { token, aria, bram, cass, dee } = await world({ oozeName: "Gelatinous Cube" });
  const player = game.users.get("player");
  player.active = true;
  player.character = cass;
  for ( const a of [aria, bram, cass, dee] ) a.testUserPermission = (user, level) => (user === player) && ((a === cass) || (a === bram));
  const app = HarvestWindow.open(token);
  await app.ready;
  assert.deepEqual(app._model.candidates.map(a => a.name), ["Bram", "Cass"], "the logged-in player's characters, by name");

  // The GM adds someone: from the window's button (or by dropping an actor on the team).
  dialogAnswers.prompt = dee.uuid;
  await app.act("addGuest");
  dialogAnswers.prompt = null;
  assert.deepEqual(app._model.candidates.map(a => a.name), ["Bram", "Cass", "Dee"]);
  assert.ok(app.lastHTML.includes("Dee (GM)"), "marked as the GM's");
  assert.deepEqual(SESSION(token).guests, [dee.uuid], "and shared");
  await app.act("removeGuest", { uuid: dee.uuid });
  assert.deepEqual(SESSION(token).guests, []);
  assert.deepEqual(app._model.candidates.map(a => a.name), ["Bram", "Cass"]);

  // Players can't add anyone.
  becomeUser(false);
  await app.render();
  assert.ok(!app.lastHTML.includes('data-action="addGuest"'));

  // With only the GM logged in, every player character can.
  becomeUser(true);
  player.active = false;
  await app.render();
  assert.deepEqual(app._model.candidates.map(a => a.name), ["Aria", "Bram", "Cass", "Dee"]);
  await app.close();
});

await check("a change on the GM's screen reaches a player's open window at once, and an older one doesn't undo it", async () => {
  const { token, app, dee } = await sharedWindows();
  assert.ok(app.helperIds.has(dee.uuid));
  becomeUser(true);
  const helperIds = [...app.helperIds].filter(id => id !== dee.uuid);
  await gm.changeSession({ tokenUuid: token.uuid, op: { op: "set", values: { helperIds, helpersTouched: true } } }, game.user);
  const sent = broadcastsOf("session").at(-1).message;
  becomeUser(false);
  const stale = structuredClone(sent);
  await deliver(sent);
  assert.ok(!app.helperIds.has(dee.uuid), "the player's window shows the GM's change");
  stale.data.session.rev -= 1000;
  stale.data.session.helperIds = [dee.uuid];
  await deliver(stale);
  assert.ok(!app.helperIds.has(dee.uuid), "an older state is ignored");

  // Harvested somewhere else: the window closes.
  await deliver({ kind: "broadcast", type: "harvested", data: { tokenUuid: token.uuid, at: 99 }, from: "gm" });
  assert.ok(app.closed);
});

await check("a harvest's splash shows the checks, the total and only what was harvested", async () => {
  const { token, aria, bram } = await world({ oozeName: "Gelatinous Cube" });
  const app = await openWindow(token);
  await app.act("add", { key: app._model.available.find(c => c.name === "Membrane").key });
  await app.act("add", { key: app._model.available.find(c => c.name === "Nucleus").key });
  queueD20(1, 1);
  await app.act("harvest");
  const card = log.messages.find(m => m.flags?.["primal-harvesting"]?.card);
  const splash = card.flags["primal-harvesting"].card.splash;
  assert.deepEqual(splash.harvested.map(c => c.name), ["Membrane"], "Nucleus (harvest DC 25) was lost");
  assert.equal(splash.checks[0].who, aria.name);
  assert.equal(splash.checks[1].who, bram.name);
  assert.deepEqual(splash.checks[0].dice, [{ value: 1, active: true, crit: "min" }]);
  assert.equal(splash.checks[0].mod + 1, splash.checks[0].total);
  assert.equal(splash.total, splash.checks[0].total + splash.checks[1].total + splash.helpers.reduce((s, h) => s + h.bonus, 0));

  const html = splashModule.renderSplash(splash, splashModule.splashLabels());
  assert.ok(html.includes("Membrane") && !html.includes("Nucleus"));
  assert.ok(html.includes(`<strong>${splash.total}</strong>`));
  const message = { flags: card.flags, visible: true, getFlag: (s, k) => card.flags[s]?.[k] };
  assert.ok(splashModule.splashOf(message));
  assert.equal(splashModule.splashOf({ ...message, visible: false }), null, "not for a roll this user can't see");
  await game.settings.set("primal-harvesting", "splash", false);
  assert.equal(splashModule.splashOf(message), null, "not for a user who turned it off");

  // Disadvantage: both dice, the higher one dropped. Nothing harvested says so.
  const { FakeRoll } = await import("./fakes.mjs");
  const d = splashModule.d20Of(new FakeRoll([15, 4], 3, { advantageMode: -1 }));
  assert.deepEqual(d.dice.map(x => [x.value, x.active]), [[15, false], [4, true]]);
  assert.equal(d.mod, 3);
  assert.ok(splashModule.renderSplash({ ...splash, harvested: [] }, splashModule.splashLabels()).includes("Nothing was harvested."));
});

await check("every text the module uses is in the language file", async () => {
  const lang = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  const has = path => typeof path.split(".").reduce((o, k) => o?.[k], lang) === "string";
  const files = [];
  const walk = dir => {
    for ( const entry of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }) ) {
      if ( entry.isDirectory() ) walk(`${dir}${entry.name}/`);
      else if ( entry.name.endsWith(".mjs") ) files.push(readFileSync(new URL(`${dir}${entry.name}`, import.meta.url), "utf8"));
    }
  };
  walk("../scripts/");
  const source = files.join("\n");
  const groups = "Settings|Keybindings|Controls|Hud|Time|Tags|Window|Card|Item|Ready|Errors|Tables|Rules|Random|Splash";
  const literal = new RegExp(`["'\`](?:PRIMAL_HARVESTING\\.)?((?:${groups})\\.[A-Za-z]+(?:\\.[A-Za-z]+)*)["'\`]`, "g");
  const missing = [];
  for ( const [, key] of source.matchAll(literal) ) if ( !has(`PRIMAL_HARVESTING.${key}`) ) missing.push(key);
  for ( const key of ["likely", "maybe", "unlikely"] ) if ( !has(`PRIMAL_HARVESTING.Window.Chance.${key}`) ) missing.push(key);
  for ( const key of ["NoCreature", "NotMonster", "GMOnly", "NotDead"] ) if ( !has(`PRIMAL_HARVESTING.Errors.${key}`) ) missing.push(key);
  for ( const key of missingKeys ) missing.push(key);
  assert.deepEqual([...new Set(missing)], []);
});

console.log(`harvest: ${passed} checks passed${process.exitCode ? ", some failed" : ""}`);
