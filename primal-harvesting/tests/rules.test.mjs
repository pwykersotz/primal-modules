/**
 * The harvest rules and tables on their own: the book's numbers, running harvest DCs, helpers, essences, pasted rows,
 * imports and exports, and which components a creature gives.
 * Run with: node tests/rules.test.mjs
 */
import assert from "node:assert/strict";
import { installFoundry } from "./fakes.mjs";

installFoundry();
const R = await import("../scripts/rules.mjs");
const T = await import("../scripts/tables.mjs");

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

/* -------------------------------------------- */
/*  Rules                                       */
/* -------------------------------------------- */

await check("the book's skills, ritual types, times and helpers", () => {
  const r = R.defaultRules();
  assert.equal(r.types.dragon.skill, "arc");
  assert.equal(r.types.construct.skill, "ani", "Artifice is the world's skill of that name (Animal Handling, renamed)");
  assert.equal(r.types.elemental.skill, "ani");
  assert.equal(r.types.fey.skill, "dec");
  assert.equal(r.types.ooze.skill, "nat");
  assert.equal(r.types.undead.skill, "rel");
  assert.equal(r.types.giant.skill, "med");
  assert.deepEqual(Object.entries(r.types).filter(([, t]) => t.ritual).map(([k]) => k),
    ["aberration", "celestial", "elemental", "fey", "fiend"]);
  assert.deepEqual(R.SIZES.map(s => r.sizes[s].minutes), [5, 10, 15, 30, 120, 720]);
  assert.deepEqual(R.SIZES.map(s => r.sizes[s].helpers), [0, 1, 2, 4, 6, 10]);
  assert.equal(r.bothDisadvantage, true);
});

await check("with no skill called Artifice, constructs and elementals use Investigation", () => {
  const label = CONFIG.DND5E.skills.ani.label;
  CONFIG.DND5E.skills.ani.label = "Animal Handling";
  try {
    const r = R.defaultRules();
    assert.equal(r.types.construct.skill, "inv");
    assert.equal(r.types.elemental.skill, "inv");
    assert.equal(R.normalizeRules({}).types.construct.skill, "inv");
  } finally {
    CONFIG.DND5E.skills.ani.label = label;
  }
});

await check("a skill another module adds can be picked; one the world doesn't have can't", () => {
  CONFIG.DND5E.skills.apr = { label: "Appraise" };
  try {
    assert.equal(R.worldSkills().apr, "Appraise");
    assert.equal(R.skillNamed("appraise"), "apr");
    assert.equal(R.normalizeRules({ types: { beast: { skill: "apr" } } }).types.beast.skill, "apr");
  } finally {
    delete CONFIG.DND5E.skills.apr;
  }
  assert.equal(R.normalizeRules({ types: { beast: { skill: "apr" } } }).types.beast.skill, "sur", "gone: back to the book's");
});

await check("sell prices: an essence's own, else 3 gp per point of the component's own DC", () => {
  const r = R.defaultRules();
  assert.equal(r.pricePerDC, 3);
  assert.deepEqual(r.essences.map(e => [e.name, e.price]),
    [["Frail", 100], ["Robust", 400], ["Potent", 2000], ["Mythic", 10000], ["Deific", 80000]]);
  assert.equal(R.priceOf({ dc: 15 }, r), 45);
  assert.equal(R.priceOf({ dc: 15, harvestDC: 30 }, r), 45, "not the running harvest DC");
  assert.equal(R.priceOf({ essence: "Robust", dc: 30, price: 400 }, r), 400);
  assert.equal(R.priceOf({ dc: 15 }, { ...r, pricePerDC: 0 }), null);
  assert.equal(R.normalizeRules({ pricePerDC: "5" }).pricePerDC, 5);
  assert.equal(R.normalizeRules({ essences: [{ name: "Odd", minCR: 1, dc: 9, price: "" }] }).essences[0].price, null);
});

await check("essences by challenge rating", () => {
  const r = R.defaultRules();
  assert.equal(R.essenceFor(2, r), null);
  assert.equal(R.essenceFor(3, r).name, "Frail");
  assert.equal(R.essenceFor(6, r).dc, 25);
  assert.equal(R.essenceFor(10, r).name, "Robust");
  assert.equal(R.essenceFor(10, r).dc, 30);
  assert.equal(R.essenceFor(12, r).rarity, "veryRare");
  assert.equal(R.essenceFor(20, r).dc, 40);
  assert.equal(R.essenceFor(25, r).name, "Deific");
  assert.equal(R.essenceFor(30, r).dc, 50);
  assert.equal(R.essenceFor(30, r).rarity, "artifact");
  assert.equal(R.essenceFor(0.5, r), null);
  assert.equal(R.essenceFor(null, r), null);
});

await check("the running harvest DC and what a total gets (the book's example)", () => {
  const list = [{ name: "Teeth", dc: 10 }, { name: "Eye", dc: 5 }, { name: "Eye", dc: 5 }];
  assert.deepEqual(R.harvestDCs(list), [10, 15, 20]);
  const got = R.resolveHarvest(list, 19);
  assert.deepEqual(got.map(c => c.harvested), [true, true, false]);
  assert.deepEqual(got.map(c => c.harvestDC), [10, 15, 20]);
  assert.deepEqual(R.resolveHarvest(list, 20).map(c => c.harvested), [true, true, true]);
  assert.deepEqual(R.resolveHarvest(list, 9).map(c => c.harvested), [false, false, false]);
});

await check("helpers add their proficiency bonus, or half of it rounded down", () => {
  assert.equal(R.helperBonus({ prof: 3, proficient: true }), 3);
  assert.equal(R.helperBonus({ prof: 3, proficient: false }), 1);
  assert.equal(R.helperBonus({ prof: 2, proficient: false }), 1);
  assert.equal(R.helperBonus({ prof: 6, proficient: false }), 3);
});

await check("the average total and how likely each harvest DC is", () => {
  assert.equal(R.expectedTotal({ assess: 5, carve: 6, helpers: 3 }), 35);
  assert.equal(R.expectedTotal({ assess: 0, carve: 0, mode: -1 }), 14.35);
  assert.equal(R.chance(20, 30), "likely");
  assert.equal(R.chance(32, 30), "maybe");
  assert.equal(R.chance(40, 30), "unlikely");
});

await check("stored rules are checked and filled in", () => {
  const r = R.normalizeRules({
    types: { ooze: { skill: "bad", ritual: "yes" }, beast: { skill: "ani" } },
    sizes: { med: { minutes: "20", helpers: -3 } },
    essences: [{ name: "Robust", minCR: "7", maxCR: "", dc: "30", rarity: "rare" }, { name: "" }, { name: "Frail", minCR: 3, maxCR: 6, dc: 25 }]
  });
  assert.equal(r.types.ooze.skill, "nat");
  assert.equal(r.types.ooze.ritual, false);
  assert.equal(r.types.beast.skill, "ani");
  assert.equal(r.types.fiend.skill, "rel");
  assert.equal(r.sizes.med.minutes, 20);
  assert.equal(r.sizes.med.helpers, 0);
  assert.equal(r.sizes.huge.minutes, 120);
  assert.deepEqual(r.essences.map(e => e.name), ["Frail", "Robust"]);
  assert.equal(r.essences[1].maxCR, null);
  assert.equal(R.essenceFor(30, r).name, "Robust");
  assert.equal(R.normalizeRules(null).sizes.grg.minutes, 720);
});

await check("minutes as hours and minutes", () => {
  assert.deepEqual(R.splitMinutes(15), { hours: 0, minutes: 15 });
  assert.deepEqual(R.splitMinutes(720), { hours: 12, minutes: 0 });
  assert.deepEqual(R.splitMinutes(90), { hours: 1, minutes: 30 });
});

/* -------------------------------------------- */
/*  Pasted rows                                 */
/* -------------------------------------------- */

await check("rows pasted from the book, in any order", () => {
  const rows = [
    ["Eye 5 E", { name: "Eye", dc: 5, tags: ["E"] }],
    ["5 Eye E+, V", { name: "Eye", dc: 5, tags: ["E+", "V"] }],
    ["Eye\t5\tE", { name: "Eye", dc: 5, tags: ["E"] }],
    ["Brain* 15", { name: "Brain", dc: 15, tags: ["*"] }],
    ["Pouch of teeth  10", { name: "Pouch of teeth", dc: 10, tags: [] }],
    ["Heart (DC 10) E+", { name: "Heart", dc: 10, tags: ["E+"] }],
    ["10 | Breath sac | V", { name: "Breath sac", dc: 10, tags: ["V"] }],
    ["Claw 5 E,V", { name: "Claw", dc: 5, tags: ["E", "V"] }],
    ["Horn 20 **", { name: "Horn", dc: 20, tags: ["**"] }],
    ["Eyes (2) 5 E", { name: "Eyes (2)", dc: 5, tags: ["E"] }]
  ];
  for ( const [line, want] of rows ) assert.deepEqual(T.parseRow(line), want, line);
  assert.equal(T.parseRow("DC Component Metatags"), null);
  assert.equal(T.parseRow(""), null);
  assert.equal(T.parseRow("15"), null);
});

await check("several pasted rows, headings left out", () => {
  const { rows, skipped } = T.parseRows("Aberration Harvest Table\nDC Component\nEye 5 E\n\nTentacle 10\nHeart 15 E+\n");
  assert.deepEqual(rows.map(r => [r.name, r.dc]), [["Eye", 5], ["Tentacle", 10], ["Heart", 15]]);
  assert.equal(skipped.length, 2);
  assert.ok(rows.every(r => r.id && Array.isArray(r.tags)));
});

await check("marks are kept the book's way", () => {
  assert.deepEqual(T.normalizeTags("e+, v"), ["E+", "V"]);
  assert.deepEqual(T.normalizeTags(["edible", "Volatile", "E"]), ["E", "V"]);
  assert.deepEqual(T.normalizeTags("Rare-ish"), ["Rare-ish"]);
});

/* -------------------------------------------- */
/*  Import and export                           */
/* -------------------------------------------- */

await check("importing this module's own export, and the round trip", () => {
  const tables = T.normalizeTables({
    types: { ooze: [{ name: "Ooze blob", dc: 5, tags: ["E"] }, { name: "Core", dc: 15, tags: ["V"], max: 1, note: "Pulses" }] },
    creatures: [{ name: "Polyhedrooze", aliases: ["Tetrahedrooze", "Hexahedrooze"], useTypeTable: true, components: [{ name: "Facet", dc: 10 }] }]
  });
  const json = T.exportTables(tables);
  const back = T.readImport(json);
  assert.deepEqual(back.types.ooze.map(c => [c.name, c.dc, c.tags, c.max, c.note]),
    [["Ooze blob", 5, ["E"], null, ""], ["Core", 15, ["V"], 1, "Pulses"]]);
  assert.equal(back.creatures[0].name, "Polyhedrooze");
  assert.deepEqual(back.creatures[0].aliases, ["Tetrahedrooze", "Hexahedrooze"]);
  assert.equal(back.creatures[0].useTypeTable, true);
  assert.ok(!json.includes("\"id\""), "no ids in the export");
  assert.ok(!json.includes("\"beast\""), "empty type tables left out");
});

await check("importing types alone, creatures as an object, or a list of creatures", () => {
  const a = T.readImport({ beast: [{ name: "Hide", dc: 10 }], Owlbear: [{ name: "Beak", dc: 10 }] });
  assert.deepEqual(Object.keys(a.types), ["beast"]);
  assert.equal(a.creatures[0].name, "Owlbear");
  const b = T.readImport({ creatures: { Mimic: { aliases: "Tavern Mimic, Chest Mimic", components: [{ name: "Tongue", dc: 15 }] } } });
  assert.deepEqual(b.creatures[0].aliases, ["Tavern Mimic", "Chest Mimic"]);
  const c = T.readImport([{ name: "Magnetite", components: ["Horn 20 V"] }]);
  assert.deepEqual(c.creatures[0].components.map(x => [x.name, x.dc, x.tags]), [["Horn", 20, ["V"]]]);
  assert.throws(() => T.readImport("{nope"), /Not JSON/);
  assert.throws(() => T.readImport({}), /No harvest tables/);
});

await check("merging replaces the tables imported and keeps the rest; replacing empties everything", () => {
  const current = T.normalizeTables({
    types: { beast: [{ name: "Hide", dc: 10 }], ooze: [{ name: "Blob", dc: 5 }] },
    creatures: [{ name: "Owlbear", components: [{ name: "Beak", dc: 10 }] }, { name: "Mimic", components: [] }]
  });
  const owlbearId = current.creatures[0].id;
  const imported = T.readImport({ types: { beast: [{ name: "Pelt", dc: 15 }] }, creatures: [{ name: "owlbear", components: [{ name: "Feather", dc: 5 }] }] });
  const merged = T.mergeTables(current, imported, "merge");
  assert.deepEqual(merged.tables.types.beast.map(c => c.name), ["Pelt"]);
  assert.deepEqual(merged.tables.types.ooze.map(c => c.name), ["Blob"]);
  assert.equal(merged.tables.creatures.length, 2);
  const owlbear = merged.tables.creatures.find(c => c.name.toLowerCase() === "owlbear");
  assert.equal(owlbear.id, owlbearId, "the creature table keeps its id, so GM picks still point at it");
  assert.deepEqual(owlbear.components.map(c => c.name), ["Feather"]);
  assert.deepEqual(merged.counts, { types: 1, creatures: 1, components: 2 });
  const replaced = T.mergeTables(current, imported, "replace");
  assert.deepEqual(replaced.tables.types.ooze, []);
  assert.equal(replaced.tables.creatures.length, 1);
});

await check("type notes and random tables: imported in either form, exported, merged", () => {
  const imported = T.readImport({
    types: {
      celestial: { note: "Extraplanar Recall.\nOnly pouches of dust.", components: [{ name: "Pouch of dust", dc: 5 }] },
      ooze: {
        components: [{ name: "Phial of acid", dc: 5 }],
        random: { name: "Ooze's Random Components", rows: ["1-20 Nothing", "21 Bone (beast)", "97-100 Roll twice more"] }
      },
      beast: [{ name: "Bone", dc: 10 }]
    },
    notes: { fiend: "Extraplanar Recall." }
  });
  assert.equal(imported.notes.celestial, "Extraplanar Recall.\nOnly pouches of dust.");
  assert.equal(imported.notes.fiend, "Extraplanar Recall.");
  assert.deepEqual(imported.random.ooze.rows.map(r => [r.min, r.max, r.name, r.from, r.rolls]),
    [[1, 20, "", "", 0], [21, 21, "Bone", "beast", 0], [97, 100, "", "", 2]]);
  const { tables, counts } = T.mergeTables(T.emptyTables(), imported);
  assert.equal(counts.types, 4);
  assert.equal(tables.random.ooze.name, "Ooze's Random Components");
  const json = T.exportTables(tables);
  const back = T.readImport(json);
  assert.deepEqual(back, { ...imported, creatures: [] }.types ? back : null);
  assert.equal(back.notes.celestial, imported.notes.celestial);
  assert.deepEqual(back.random.ooze, imported.random.ooze);
  assert.ok(Array.isArray(JSON.parse(json).types.beast), "a plain type stays a plain list");
  assert.ok(JSON.parse(json).types.ooze.random.rows.includes("21 Bone (beast)"), "random rows are written as lines");
  // Merging a type without a note keeps the note there; one with an empty note clears it.
  const again = T.mergeTables(tables, T.readImport({ types: { celestial: [{ name: "Eye", dc: 5 }] } })).tables;
  assert.equal(again.notes.celestial, imported.notes.celestial);
  const cleared = T.mergeTables(tables, T.readImport({ types: { celestial: { note: "", components: [] } } })).tables;
  assert.equal(cleared.notes.celestial, undefined);
  // A creature table keeps its note too.
  const c = T.normalizeCreature({ name: "Angel", note: " Ask first. ", components: [] });
  assert.equal(c.note, "Ask first.");
});

await check("random components rows: the book's lines, the DC from another type's table", () => {
  const P = T.parseRandomRow;
  assert.deepEqual(P("36 Horn* (celestial/fey/fiend)"),
    { min: 36, max: 36, name: "Horn", from: "celestial/fey/fiend", dc: null, tags: ["*"], rolls: 0 });
  assert.equal(P("50-56 Pouch of teeth (humanoid) DC 10").dc, 10);
  assert.equal(P("24–27 Horn (beast)").max, 27, "an en dash");
  assert.equal(P("100 Roll thrice more on this table").rolls, 3);
  assert.equal(P("1-20 Nothing").name, "");
  assert.equal(P("Hard Bits"), null, "a heading isn't a row");
  for ( const line of ["21 Pouch of claws (aberration)", "50-56 Pouch of teeth (humanoid) DC 10", "97-99 Roll twice more", "1-20 Nothing"] ) {
    assert.equal(T.randomRowText(P(line)), line, "written back the same way");
  }
  const { rows, skipped } = T.parseRandomRows("Ooze's Random Components\n1-20 Nothing\n21 Bone (beast)\n");
  assert.equal(rows.length, 2);
  assert.deepEqual(skipped, ["Ooze's Random Components"]);
  const tables = T.normalizeTables({ types: { beast: [{ name: "Bone", dc: 10 }], fey: [{ name: "Horn", dc: 10 }] } });
  assert.equal(T.randomRowDC(P("21 Bone (beast)"), tables), 10);
  assert.equal(T.randomRowDC(P("36 Horn (celestial/fey/fiend)"), tables), 10, "the first of its types that has it");
  assert.equal(T.randomRowDC(P("37 Tooth (beast)"), tables), null);
  assert.equal(T.randomRowDC(P("38 Tooth (beast) DC 7"), tables), 7);
  const table = T.normalizeRandomTable(["1-20 Nothing", "21-99 Bone (beast)", "100 Roll twice more"]);
  assert.equal(T.randomDie(table), 100);
  assert.equal(T.randomRowFor(table, 55).name, "Bone");
  assert.equal(T.randomRowFor(table, 0), null);
});

/* -------------------------------------------- */
/*  Which components a creature gives           */
/* -------------------------------------------- */

await check("a creature table by name, alias or the GM's pick; else the type table", () => {
  const tables = T.normalizeTables({
    types: { ooze: [{ name: "Blob", dc: 5 }] },
    creatures: [
      { name: "Polyhedrooze", aliases: ["Tetrahedrooze"], components: [{ name: "Facet", dc: 10 }] },
      { name: "Owlbear", useTypeTable: true, components: [{ name: "Beak", dc: 10 }] }
    ]
  });
  const poly = tables.creatures[0];
  const owl = tables.creatures[1];
  assert.equal(T.matchCreature(tables, { names: ["Tetrahedrooze"] }), poly);
  assert.equal(T.matchCreature(tables, { names: ["polyhedrooze 3"] }), poly, "a trailing number is ignored");
  assert.equal(T.matchCreature(tables, { names: ["Gelatinous Cube"] }), null);
  assert.equal(T.matchCreature(tables, { names: ["Gelatinous Cube"], creatureId: owl.id }), owl);

  const a = T.componentsFor(tables, { type: "ooze", names: ["Tetrahedrooze"] });
  assert.deepEqual(a.components.map(c => [c.name, c.source]), [["Facet", "creature"]]);
  const b = T.componentsFor(tables, { type: "ooze", names: ["Gelatinous Cube"] });
  assert.deepEqual(b.components.map(c => [c.name, c.source]), [["Blob", "type"]]);
  const c = T.componentsFor(tables, { type: "ooze", names: ["Owlbear"] });
  assert.deepEqual(c.components.map(x => [x.name, x.source]), [["Beak", "creature"], ["Blob", "type"]]);
  assert.ok(c.components.every(x => x.key.startsWith(`${x.source}:`)));
});

console.log(`rules: ${passed} checks passed${process.exitCode ? ", some failed" : ""}`);
