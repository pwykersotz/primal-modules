/**
 * Checks for scripts/logic.mjs: which compendiums go in which directory and in what order, saving choices, and
 * opened-up state. (What a search or filter shows is checked in tests/model.test.mjs.)
 * Run: node tests/logic.test.mjs
 */
import assert from "node:assert/strict";
import {
  packId, sidebarOrder, packsFor, packsOfType, toggleChoice, mergeChoices, isPackExpanded, countEntries
} from "../scripts/logic.mjs";

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

const pack = (id, documentName, title) => ({ collection: id, documentName, title, metadata: { id } });
const packs = [
  pack("dnd5e.monsters", "Actor", "Monsters (SRD)"),
  pack("dnd-monster-manual.actors", "Actor", "Monster Manual"),
  pack("world.homebrew", "Actor", "Homebrew Creatures"),
  pack("dnd5e.items", "Item", "Items (SRD)"),
  pack("world.scenes", "Scene", "Dungeon Maps"),
  pack("dnd5e.adventures", "Adventure", "Adventures")
];

// ---------------------------------------------------------------------------
// Order and choices
// ---------------------------------------------------------------------------

check("packId reads collection, then metadata.id", () => {
  assert.equal(packId(packs[0]), "dnd5e.monsters");
  assert.equal(packId({ metadata: { id: "x.y" } }), "x.y");
  assert.equal(packId(null), undefined);
});

check("sidebarOrder lists subfolders before a folder's own packs, like the sidebar", () => {
  const tree = {
    children: [
      { folder: { name: "Bestiaries" }, children: [{ folder: {}, children: [], entries: [packs[2]] }], entries: [packs[1]] }
    ],
    entries: [packs[0], packs[3]]
  };
  assert.deepEqual(sidebarOrder(tree), ["world.homebrew", "dnd-monster-manual.actors", "dnd5e.monsters", "dnd5e.items"]);
  assert.deepEqual(sidebarOrder(undefined), []);
});

check("packsFor keeps the chosen packs of the directory's type, in sidebar order", () => {
  const chosen = ["dnd5e.monsters", "world.homebrew", "dnd5e.items", "gone.pack"];
  const order = ["world.homebrew", "dnd5e.monsters"];
  const list = packsFor({ packs, documentName: "Actor", chosen, order }).map(packId);
  assert.deepEqual(list, ["world.homebrew", "dnd5e.monsters"]);
});

check("packsFor puts packs missing from the sidebar order last, by title", () => {
  const chosen = ["dnd5e.monsters", "dnd-monster-manual.actors", "world.homebrew"];
  const list = packsFor({ packs, documentName: "Actor", chosen, order: ["dnd5e.monsters"] }).map(packId);
  assert.deepEqual(list, ["dnd5e.monsters", "world.homebrew", "dnd-monster-manual.actors"]);
});

check("packsFor ignores a pack of the right id but another type", () => {
  const list = packsFor({ packs, documentName: "Item", chosen: ["dnd5e.monsters"] });
  assert.equal(list.length, 0);
});

check("packsOfType lists every pack of a type", () => {
  assert.deepEqual(packsOfType(packs, "Actor").map(packId).sort(),
    ["dnd-monster-manual.actors", "dnd5e.monsters", "world.homebrew"]);
  assert.deepEqual(packsOfType(packs, "Cards"), []);
});

check("toggleChoice adds once and removes", () => {
  assert.deepEqual(toggleChoice(["a"], "b", true), ["a", "b"]);
  assert.deepEqual(toggleChoice(["a", "b"], "b", true), ["a", "b"]);
  assert.deepEqual(toggleChoice(["a", "b"], "a", false), ["b"]);
  assert.deepEqual(toggleChoice(undefined, "a", true), ["a"]);
});

check("mergeChoices only changes what the window showed", () => {
  // The window showed Actor packs only; the Item choice must survive.
  const before = ["dnd5e.monsters", "dnd5e.items"];
  const shown = ["dnd5e.monsters", "world.homebrew"];
  const ticked = ["world.homebrew"];
  assert.deepEqual(mergeChoices(before, shown, ticked).sort(), ["dnd5e.items", "world.homebrew"]);
});

check("mergeChoices ignores ticks for packs the window didn't show", () => {
  assert.deepEqual(mergeChoices([], ["a"], ["a", "b"]), ["a"]);
});

check("isPackExpanded remembers, and opens a lone compendium by default", () => {
  assert.equal(isPackExpanded({}, "a", 1), true);
  assert.equal(isPackExpanded({}, "a", 2), false);
  assert.equal(isPackExpanded({ a: false }, "a", 1), false);
  assert.equal(isPackExpanded({ a: true }, "a", 3), true);
  assert.equal(isPackExpanded(undefined, "a", 3), false);
});

// Monster Manual: Goblins folder > Elite subfolder; loose entries at the root.
const mmTree = {
  children: [{
    folder: { name: "Goblinoids" },
    entries: [{ name: "Goblin Warrior" }, { name: "Hobgoblin" }],
    children: [{ folder: { name: "Elite" }, entries: [{ name: "Goblin Boss" }], children: [] }]
  }],
  entries: [{ name: "Aboleth" }]
};
const srdTree = { children: [], entries: [{ name: "Goblin" }, { name: "Zombie" }] };

check("countEntries counts nested entries", () => {
  assert.equal(countEntries(mmTree), 4);
  assert.equal(countEntries(srdTree), 2);
  assert.equal(countEntries(null), 0);
});

console.log(`${passed} passed, ${failed} failed`);
if ( failed ) process.exit(1);
