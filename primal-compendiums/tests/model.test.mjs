/**
 * Checks for scripts/pack-model.mjs: what the Compendiums panel shows for a search, filters and a sort, worked out
 * from the compendiums' folder trees before anything is drawn.
 * Run: node tests/model.test.mjs
 */
import assert from "node:assert/strict";
import { buildView, foldersUnder } from "../scripts/pack-model.mjs";
import { emptyState, withPick, withBound } from "../scripts/filter-logic.mjs";

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch(err) {
    failed++;
    console.error(`FAIL ${name}\n  ${err.message}`);
  }
}

// Monster Manual: Goblinoids folder > Elite subfolder, an empty Dragons folder, and a loose entry at the root.
const entry = (name, cr, type) => ({ _id: name, name, cr, type });
const mmTree = {
  children: [{
    folder: { name: "Goblinoids", uuid: "mm.f1" },
    depth: 1,
    entries: [entry("Goblin Warrior", 0.25, "humanoid"), entry("Hobgoblin", 0.5, "humanoid"), entry("Worg", 0.5, "beast")],
    children: [{
      folder: { name: "Elite", uuid: "mm.f2" },
      depth: 2,
      entries: [entry("Goblin Boss", 1, "humanoid")],
      children: []
    }]
  }, {
    folder: { name: "Dragons", uuid: "mm.f3" },
    depth: 1,
    entries: [],
    children: []
  }],
  entries: [entry("Aboleth", 10, "aberration")]
};
const srdTree = {
  children: [],
  entries: [entry("Zombie", 0.25, "undead"), entry("Goblin", 0.25, "humanoid"), entry("Ape", 0.5, "beast")]
};
const emptyTree = { children: [], entries: [] };
const mm = { id: "mm", tree: mmTree };
const srd = { id: "srd", tree: srdTree };
const none = { id: "none", tree: emptyTree };
const packs = [mm, srd, none];

const contains = text => name => name.toLowerCase().includes(text);
const recordFor = (pack, e) => ({
  name: e.name, cr: e.cr, type: { value: e.type, label: e.type }, source: { value: pack.id, label: pack.id }
});
const build = options => buildView({ packs, recordFor, ...options });
const ids = view => view.packs.map(p => p.pack.id);
const names = rows => rows.map(r => r.entry.name);
const folderOf = (view, pack, ...path) => {
  let at = view.packs.find(p => p.pack.id === pack);
  for ( const name of path ) at = at?.folders.find(f => f.folder.name === name);
  return at;
};

check("with nothing searched or filtered, every compendium and folder shows, none forced open", () => {
  const view = build({});
  assert.deepEqual(ids(view), ["mm", "srd", "none"]);
  assert.equal(view.flat, false);
  assert.deepEqual([view.shown, view.total], [8, 8]);
  const pack = folderOf(view, "mm");
  assert.equal(pack.isPack, true);
  assert.equal(pack.forced, false);
  assert.deepEqual(names(pack.entries), ["Aboleth"]);
  assert.deepEqual(pack.folders.map(f => [f.folder.name, f.uuid, f.depth, f.forced, f.count]),
    [["Goblinoids", "mm.f1", 1, false, 4], ["Dragons", "mm.f3", 1, false, 0]]);
  assert.deepEqual(names(folderOf(view, "mm", "Goblinoids").entries), ["Goblin Warrior", "Hobgoblin", "Worg"]);
  assert.deepEqual(names(folderOf(view, "mm", "Goblinoids", "Elite").entries), ["Goblin Boss"]);
  assert.equal(folderOf(view, "mm", "Goblinoids").node, mmTree.children[0]);
});

check("no records are made unless the filters or the sort need them", () => {
  let asked = 0;
  const counting = (pack, e) => { asked++; return recordFor(pack, e); };
  buildView({ packs, recordFor: counting });
  buildView({ packs, recordFor: counting, test: contains("goblin") });
  buildView({ packs, recordFor: counting, state: { ...emptyState(), sort: "name" } });
  buildView({ packs, recordFor: counting, state: { ...emptyState(), flat: true } });
  assert.equal(asked, 0);
  buildView({ packs, recordFor: counting, state: { ...emptyState(), sort: "cr" } });
  assert.equal(asked, 8);
});

check("a search finds entries across every compendium and opens the way to each", () => {
  const view = build({ test: contains("goblin") });
  assert.deepEqual(ids(view), ["mm", "srd"]);
  assert.deepEqual(view.packs.map(p => p.forced), [true, true]);
  // Four goblins, and the Worg that sits in the folder named Goblinoids.
  assert.deepEqual([view.shown, view.total], [5, 8]);
  assert.deepEqual(names(folderOf(view, "mm").entries), []);
  // Goblinoids matches by name too, so the entries directly in it show with it.
  const goblinoids = folderOf(view, "mm", "Goblinoids");
  assert.deepEqual(names(goblinoids.entries), ["Goblin Warrior", "Hobgoblin", "Worg"]);
  assert.equal(goblinoids.forced, true);
  const elite = folderOf(view, "mm", "Goblinoids", "Elite");
  assert.deepEqual(names(elite.entries), ["Goblin Boss"]);
  assert.equal(elite.forced, true);
  assert.deepEqual(folderOf(view, "mm").folders.map(f => f.folder.name), ["Goblinoids"]);
  assert.deepEqual(names(folderOf(view, "srd").entries), ["Goblin"]);
});

check("a search on a folder's name shows the folder with the entries directly in it", () => {
  const view = build({ test: contains("elite") });
  assert.deepEqual(ids(view), ["mm"]);
  const goblinoids = folderOf(view, "mm", "Goblinoids");
  // The folder above opens up; the matched folder itself keeps its own state, as in Foundry.
  assert.equal(goblinoids.forced, true);
  assert.deepEqual(names(goblinoids.entries), []);
  const elite = folderOf(view, "mm", "Goblinoids", "Elite");
  assert.equal(elite.forced, false);
  assert.deepEqual(names(elite.entries), ["Goblin Boss"]);
  assert.equal(view.shown, 1);
});

check("a search on an empty folder's name still shows the folder", () => {
  const view = build({ test: contains("dragons") });
  assert.deepEqual(ids(view), ["mm"]);
  assert.deepEqual(folderOf(view, "mm").folders.map(f => f.folder.name), ["Dragons"]);
  assert.equal(view.shown, 0);
});

check("a search of a loose entry opens no folder, and one with no match shows no compendium", () => {
  const loose = build({ test: contains("aboleth") });
  assert.deepEqual(ids(loose), ["mm"]);
  assert.deepEqual(names(folderOf(loose, "mm").entries), ["Aboleth"]);
  assert.deepEqual(folderOf(loose, "mm").folders, []);
  const missing = build({ test: contains("tarrasque") });
  assert.deepEqual([ids(missing), missing.shown, missing.total], [[], 0, 8]);
});

check("the search is told which entry or folder a name belongs to", () => {
  const seen = [];
  build({ test: (name, source) => { seen.push(source.name === name); return false; } });
  assert.equal(seen.length, 8 + 3);
  assert.ok(seen.every(Boolean));
});

check("filters leave out what doesn't pass, with any folder or compendium left empty, and open the rest", () => {
  const state = withPick(emptyState(), "type", "humanoid");
  const view = build({ state });
  assert.deepEqual(ids(view), ["mm", "srd"]);
  assert.deepEqual(view.packs.map(p => [p.forced, p.count]), [[true, 3], [true, 1]]);
  assert.deepEqual(names(folderOf(view, "mm").entries), []);
  assert.deepEqual(folderOf(view, "mm").folders.map(f => [f.folder.name, f.forced]), [["Goblinoids", true]]);
  assert.deepEqual(names(folderOf(view, "mm", "Goblinoids").entries), ["Goblin Warrior", "Hobgoblin"]);
  assert.equal(folderOf(view, "mm", "Goblinoids", "Elite").forced, true);
  assert.deepEqual([view.shown, view.total], [4, 8]);
  assert.ok(view.packs.every(p => p.entries.concat(p.folders.flatMap(f => f.entries)).every(r => r.record)));
});

check("a search and filters work together", () => {
  const state = withBound(emptyState(), "cr", 0, 0.5);
  const view = build({ state, test: contains("goblin") });
  // Goblinoids matches by name, so everything directly in it is a match: of those, CR 1/2 and up.
  assert.deepEqual(names(folderOf(view, "mm", "Goblinoids").entries), ["Hobgoblin", "Worg"]);
  assert.deepEqual(names(folderOf(view, "mm", "Goblinoids", "Elite").entries), ["Goblin Boss"]);
  assert.deepEqual(ids(view), ["mm"]);
  assert.equal(view.shown, 3);
});

check("a folder that matches a search but holds nothing the filters pass is left out", () => {
  const state = withPick(emptyState(), "type", "undead");
  const view = build({ state, test: contains("goblinoids") });
  assert.deepEqual([ids(view), view.shown], [[], 0]);
});

check("a sort orders the entries inside each folder, leaving the folders where they are", () => {
  const view = build({ state: { ...emptyState(), sort: "cr", desc: true } });
  assert.deepEqual(names(folderOf(view, "mm", "Goblinoids").entries), ["Hobgoblin", "Worg", "Goblin Warrior"]);
  assert.deepEqual(names(folderOf(view, "srd").entries), ["Ape", "Goblin", "Zombie"]);
  assert.deepEqual(folderOf(view, "mm").folders.map(f => f.folder.name), ["Goblinoids", "Dragons"]);
  const byName = build({ state: { ...emptyState(), sort: "name" } });
  assert.deepEqual(names(folderOf(byName, "srd").entries), ["Ape", "Goblin", "Zombie"]);
  assert.deepEqual(folderOf(byName, "srd").entries.map(r => r.record), [null, null, null]);
});

check("the default order is the tree's own", () => {
  assert.deepEqual(names(folderOf(build({}), "srd").entries), ["Zombie", "Goblin", "Ape"]);
});

check("ignoring folders makes one list across every compendium, by name unless sorted otherwise", () => {
  const view = build({ state: { ...emptyState(), flat: true } });
  assert.equal(view.flat, true);
  assert.deepEqual(view.packs, []);
  assert.deepEqual(names(view.rows),
    ["Aboleth", "Ape", "Goblin", "Goblin Boss", "Goblin Warrior", "Hobgoblin", "Worg", "Zombie"]);
  assert.deepEqual(view.rows.slice(0, 3).map(r => r.pack.id), ["mm", "srd", "srd"]);
  assert.deepEqual([view.shown, view.total], [8, 8]);
  const byCr = build({ state: { ...emptyState(), flat: true, sort: "cr" } });
  assert.deepEqual(names(byCr.rows),
    ["Goblin", "Goblin Warrior", "Zombie", "Ape", "Hobgoblin", "Worg", "Goblin Boss", "Aboleth"]);
});

check("the one list searches and filters like the folders do", () => {
  const state = { ...withPick(emptyState(), "type", "humanoid"), flat: true };
  assert.deepEqual(names(build({ state }).rows), ["Goblin", "Goblin Boss", "Goblin Warrior", "Hobgoblin"]);
  const found = build({ state, test: contains("elite") });
  assert.deepEqual([names(found.rows), found.shown, found.total], [["Goblin Boss"], 1, 8]);
});

check("empty and missing trees are survived", () => {
  const view = buildView({ packs: [{ id: "x", tree: undefined }, null, none], test: () => true });
  assert.deepEqual([view.packs.length, view.shown, view.total], [0, 0, 0]);
  assert.deepEqual(buildView().packs, []);
});

check("foldersUnder lists every folder below a node", () => {
  assert.deepEqual(foldersUnder(mmTree).map(f => f.name), ["Goblinoids", "Elite", "Dragons"]);
  assert.deepEqual(foldersUnder(mmTree.children[0]).map(f => f.name), ["Elite"]);
  assert.deepEqual(foldersUnder(undefined), []);
});

check("thirty thousand entries are searched, filtered and sorted in well under a frame or two", () => {
  const big = [];
  const types = ["beast", "fiend", "humanoid", "undead"];
  for ( let p = 0; p < 30; p++ ) {
    const children = [];
    for ( let f = 0; f < 26; f++ ) children.push({ folder: { name: `Folder ${f}`, uuid: `p${p}.f${f}` }, depth: 1, entries: [], children: [] });
    for ( let i = 0; i < 1000; i++ ) children[i % 26].entries.push(entry(`Creature ${p}-${i}`, i % 31, types[i % 4]));
    big.push({ id: `p${p}`, tree: { children, entries: [] } });
  }
  const cache = new Map();
  const cached = (pack, e) => {
    let record = cache.get(e);
    if ( !record ) cache.set(e, record = recordFor(pack, e));
    return record;
  };
  const state = { ...withPick(emptyState(), "type", "undead"), flat: true, sort: "cr" };
  buildView({ packs: big, recordFor: cached, state });
  const started = performance.now();
  const view = buildView({ packs: big, recordFor: cached, state, test: contains("creature 1") });
  const took = performance.now() - started;
  assert.equal(view.total, 30000);
  assert.ok(view.shown > 500, `shown ${view.shown}`);
  assert.ok(took < 250, `took ${took.toFixed(0)} ms`);
});

console.log(`${passed} passed, ${failed} failed`);
if ( failed ) process.exit(1);
