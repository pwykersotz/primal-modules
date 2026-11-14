/**
 * Checks for scripts/filter-logic.mjs: records from dnd5e actors and items (shaped like dnd5e 5/6 data and
 * compendium index entries), what passes a filter, sort order, the tags offered, and saved state.
 * Run: node tests/filter.test.mjs
 */
import assert from "node:assert/strict";
import {
  CR_STEPS, filtersFor, emptyState, normalizeState, isFiltering, countActive, cyclePick, withPick, withBound,
  withoutFilters, passes, compareRecords, choicesFor, formatCR, toNumber, recordOf, badgeFor, effectiveSort
} from "../scripts/filter-logic.mjs";

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

const config = {
  creatureTypes: { beast: { label: "DND5E.CreatureBeast" }, undead: { label: "DND5E.CreatureUndead" },
    dragon: { label: "DND5E.CreatureDragon" } },
  itemRarity: { common: "DND5E.ItemRarityCommon", rare: "DND5E.ItemRarityRare", veryRare: "DND5E.ItemRarityVeryRare" },
  sourceBooks: { "SRD 5.2": "SOURCE.BOOK.SRD52" }
};
const words = {
  "DND5E.CreatureBeast": "Beast", "DND5E.CreatureUndead": "Undead", "DND5E.CreatureDragon": "Dragon",
  "DND5E.ItemRarityCommon": "Common", "DND5E.ItemRarityRare": "Rare", "DND5E.ItemRarityVeryRare": "Very Rare",
  "SOURCE.BOOK.SRD52": "System Reference Document 5.2", "TYPES.Actor.character": "Player Character",
  "TYPES.Actor.vehicle": "Vehicle", "TYPES.Item.weapon": "Weapon", "TYPES.Item.spell": "Spell",
  "TYPES.Item.equipment": "Equipment"
};
const localize = k => words[k] ?? k;
const actorCtx = (fallbackSource = "") => ({
  documentName: "Actor", config, localize, fallbackSource,
  typeLabels: { character: "TYPES.Actor.character", npc: "TYPES.Actor.npc", vehicle: "TYPES.Actor.vehicle" },
  labels: { mundane: "Mundane", custom: "Custom" }
});
const itemCtx = (fallbackSource = "") => ({
  documentName: "Item", config, localize, fallbackSource,
  typeLabels: { weapon: "TYPES.Item.weapon", spell: "TYPES.Item.spell", equipment: "TYPES.Item.equipment" },
  labels: { mundane: "Mundane", custom: "Custom" }
});

// Shaped like compendium index entries read with the filter fields.
const wolf = { name: "Wolf", type: "npc",
  system: { details: { cr: 0.25, type: { value: "beast", subtype: "", swarm: "", custom: "" } },
    source: { book: "SRD 5.2", page: "", custom: "", rules: "2024" } } };
const lich = { name: "Lich", type: "npc",
  system: { details: { cr: 21, type: { value: "undead" } }, source: { book: "SRD 5.2" } } };
const dragon = { name: "Adult Red Dragon", type: "npc",
  system: { details: { cr: 17, type: { value: "dragon" } }, source: { book: "XMM" } } };
const carpet = { name: "Carpet of Flying", type: "npc",
  system: { details: { cr: 2, type: { value: "custom", custom: "Magic Item" } }, source: { book: "" } } };
const hero = { name: "Aria", type: "character", system: { details: {}, source: {} } };
const ship = { name: "Airship", type: "vehicle", system: { details: { type: "air" }, source: { book: "SRD 5.2" } } };

const sword = { name: "Longsword", type: "weapon", system: { rarity: "", source: { book: "SRD 5.2" } } };
const flame = { name: "Flame Tongue", type: "weapon", system: { rarity: "rare", source: { book: "SRD 5.2" } } };
const cloak = { name: "Cloak of Displacement", type: "equipment", system: { rarity: "veryRare", source: { book: "XDMG" } } };
const fireball = { name: "Fireball", type: "spell", system: { source: { book: "SRD 5.2" } } };

const A = (d, fb) => recordOf(d, actorCtx(fb));
const I = (d, fb) => recordOf(d, itemCtx(fb));

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

check("actor records read CR, creature type and source book", () => {
  assert.deepEqual(A(wolf), {
    name: "Wolf", cr: 0.25, level: null,
    type: { value: "beast", label: "Beast" },
    source: { value: "SRD 5.2", label: "SRD 5.2", title: "System Reference Document 5.2" }
  });
  assert.equal(A(lich).cr, 21);
  assert.deepEqual(A(dragon).source, { value: "XMM", label: "XMM", title: undefined });
});

check("a custom creature type uses its own words", () => {
  assert.deepEqual(A(carpet).type, { value: "custom:magic item", label: "Magic Item" });
});

check("characters and vehicles are typed by what kind of actor they are", () => {
  assert.deepEqual(A(hero).type, { value: "kind:character", label: "Player Character" });
  assert.deepEqual(A(ship).type, { value: "kind:vehicle", label: "Vehicle" });
  assert.equal(A(hero).cr, null);
  assert.equal(A(hero).source, null);
});

check("entries naming no book take the compendium's source", () => {
  assert.equal(A(carpet, "Tome of Beasts").source.value, "Tome of Beasts");
  assert.equal(A(wolf, "Tome of Beasts").source.value, "SRD 5.2");
});

check("an entry without its details read yet still has a name", () => {
  assert.deepEqual(A({ name: "Goblin", type: "npc" }),
    { name: "Goblin", cr: null, level: null, type: null, source: null });
});

check("item records read rarity (mundane when empty), item type and source", () => {
  assert.deepEqual(I(sword).rarity, { value: "mundane", label: "Mundane", rank: 0 });
  assert.deepEqual(I(flame).rarity, { value: "rare", label: "Rare", rank: 3 });
  assert.deepEqual(I(cloak).rarity, { value: "veryRare", label: "Very Rare", rank: 4 });
  assert.deepEqual(I(sword).itemType, { value: "weapon", label: "Weapon" });
  assert.equal(I(fireball).rarity, null, "spells have no rarity at all");
});

check("other documents only have a name", () => {
  assert.deepEqual(recordOf({ name: "Tavern", system: {} }, { documentName: "Scene" }), { name: "Tavern" });
});

check("CR values read and print like dnd5e's", () => {
  assert.equal(toNumber("1/4"), 0.25);
  assert.equal(toNumber("3"), 3);
  assert.equal(toNumber(""), null);
  assert.equal(toNumber(null), null);
  assert.deepEqual([0, 0.125, 0.25, 0.5, 5].map(formatCR), ["0", "1/8", "1/4", "1/2", "5"]);
  assert.equal(CR_STEPS.length, 34);
  assert.equal(CR_STEPS.at(-1), 30);
});

check("an actor's badge is its CR, or its level when it has no CR", () => {
  assert.deepEqual(badgeFor(A(wolf)), { kind: "cr", value: "1/4" });
  assert.deepEqual(badgeFor(A(lich)), { kind: "cr", value: "21" });
  assert.deepEqual(badgeFor(A({ name: "Rat", type: "npc", system: { details: { cr: 0 } } })), { kind: "cr", value: "0" });
  const leveled = { name: "Aria", type: "character", system: { details: { level: 5 } } };
  assert.deepEqual(badgeFor(A(leveled)), { kind: "level", value: "5" });
  assert.equal(badgeFor(A(hero)), null, "no classes yet, no level");
  assert.equal(badgeFor(A(ship)), null);
  assert.equal(badgeFor(I(sword)), null, "items have no badge");
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

const actors = [wolf, lich, dragon, carpet, hero, ship].map(d => A(d));

const names = (state, records = actors) => records.filter(r => passes(state, r)).map(r => r.name);

check("nothing set lets everything through", () => {
  assert.equal(isFiltering(emptyState()), false);
  assert.equal(names(emptyState()).length, actors.length);
});

check("a required tag shows only those; two in one group show either", () => {
  let s = withPick(emptyState(), "type", "beast");
  assert.deepEqual(names(s), ["Wolf"]);
  s = withPick(s, "type", "undead");
  assert.deepEqual(names(s), ["Wolf", "Lich"]);
});

check("an excluded tag hides those and keeps the rest, untyped ones too", () => {
  const s = withPick(emptyState(), "type", "beast", -1);
  assert.deepEqual(names(s), ["Lich", "Adult Red Dragon", "Carpet of Flying", "Aria", "Airship"]);
});

check("different groups must all be met", () => {
  let s = withPick(emptyState(), "source", "SRD 5.2");
  s = withPick(s, "type", "undead");
  assert.deepEqual(names(s), ["Lich"]);
});

check("a CR range keeps what is inside it, ends included, and drops what has no CR", () => {
  let s = withBound(emptyState(), "cr", 0, 2);
  assert.deepEqual(names(s), ["Lich", "Adult Red Dragon", "Carpet of Flying"]);
  s = withBound(s, "cr", 1, 17);
  assert.deepEqual(names(s), ["Adult Red Dragon", "Carpet of Flying"]);
  s = withBound(emptyState(), "cr", 1, 0.25);
  assert.deepEqual(names(s), ["Wolf"]);
});

check("setting one end past the other moves the other end with it", () => {
  let s = withBound(emptyState(), "cr", 1, 5);
  s = withBound(s, "cr", 0, 10);
  assert.deepEqual(s.range.cr, [10, 10]);
  s = withBound(s, "cr", 1, 1);
  assert.deepEqual(s.range.cr, [1, 1]);
  s = withBound(withBound(s, "cr", 0, null), "cr", 1, null);
  assert.deepEqual(s.range, {});
});

check("tags go off, required, excluded, off", () => {
  assert.equal(cyclePick(undefined), 1);
  assert.equal(cyclePick(1), -1);
  assert.equal(cyclePick(-1), undefined);
  let s = withPick(emptyState(), "type", "beast");
  s = withPick(s, "type", "beast");
  assert.deepEqual(s.sets, { type: { beast: -1 } });
  s = withPick(s, "type", "beast");
  assert.deepEqual(s.sets, {});
});

check("counting and clearing filters keeps the sort", () => {
  let s = { ...emptyState(), sort: "cr", desc: true, open: true };
  s = withPick(withPick(s, "type", "beast"), "source", "XMM", -1);
  s = withBound(s, "cr", 0, 1);
  assert.equal(countActive(s), 3);
  const cleared = withoutFilters(s);
  assert.equal(isFiltering(cleared), false);
  assert.equal(cleared.sort, "cr");
  assert.equal(cleared.desc, true);
  assert.equal(cleared.open, true);
});

check("item filters: rarity and type", () => {
  const items = [sword, flame, cloak, fireball].map(d => I(d));
  let s = withPick(emptyState(), "rarity", "mundane", -1);
  assert.deepEqual(names(s, items), ["Flame Tongue", "Cloak of Displacement", "Fireball"]);
  s = withPick(emptyState(), "itemType", "weapon");
  assert.deepEqual(names(s, items), ["Longsword", "Flame Tongue"]);
  s = withPick(emptyState(), "rarity", "rare");
  assert.deepEqual(names(s, items), ["Flame Tongue"]);
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const order = (sort, desc, records = actors) => [...records].sort((a, b) => compareRecords(a, b, sort, desc))
  .map(r => r.name);

check("sort by name, either way", () => {
  assert.deepEqual(order("name"), ["Adult Red Dragon", "Airship", "Aria", "Carpet of Flying", "Lich", "Wolf"]);
  assert.deepEqual(order("name", true), ["Wolf", "Lich", "Carpet of Flying", "Aria", "Airship", "Adult Red Dragon"]);
});

check("sort by CR; those with none go last either way", () => {
  assert.deepEqual(order("cr"), ["Wolf", "Carpet of Flying", "Adult Red Dragon", "Lich", "Airship", "Aria"]);
  assert.deepEqual(order("cr", true), ["Lich", "Adult Red Dragon", "Carpet of Flying", "Wolf", "Airship", "Aria"]);
});

check("sort by creature type and source, ties by name", () => {
  assert.deepEqual(order("type"), ["Wolf", "Adult Red Dragon", "Carpet of Flying", "Aria", "Lich", "Airship"]);
  assert.deepEqual(order("source"), ["Airship", "Lich", "Wolf", "Adult Red Dragon", "Aria", "Carpet of Flying"]);
});

check("sort items by rarity, mundane first, no rarity last", () => {
  const items = [cloak, fireball, sword, flame].map(d => I(d));
  assert.deepEqual(order("rarity", false, items), ["Longsword", "Flame Tongue", "Cloak of Displacement", "Fireball"]);
  assert.deepEqual(order("rarity", true, items), ["Cloak of Displacement", "Flame Tongue", "Longsword", "Fireball"]);
});

check("no sort leaves the order alone", () => {
  assert.equal(compareRecords(actors[0], actors[1], ""), 0);
});

check("ignoring folders with no sort chosen goes by name", () => {
  assert.deepEqual(effectiveSort(emptyState()), { sort: "", desc: false });
  assert.deepEqual(effectiveSort({ ...emptyState(), flat: true }), { sort: "name", desc: false });
  assert.deepEqual(effectiveSort({ ...emptyState(), flat: true, desc: true }), { sort: "name", desc: false });
  assert.deepEqual(effectiveSort({ ...emptyState(), flat: true, sort: "cr", desc: true }), { sort: "cr", desc: true });
});

// ---------------------------------------------------------------------------
// Tags offered and saved state
// ---------------------------------------------------------------------------

check("tags offered are the values present, with counts, by name", () => {
  assert.deepEqual(choicesFor(actors, "type"), [
    { value: "beast", label: "Beast", title: undefined, count: 1 },
    { value: "dragon", label: "Dragon", title: undefined, count: 1 },
    { value: "custom:magic item", label: "Magic Item", title: undefined, count: 1 },
    { value: "kind:character", label: "Player Character", title: undefined, count: 1 },
    { value: "undead", label: "Undead", title: undefined, count: 1 },
    { value: "kind:vehicle", label: "Vehicle", title: undefined, count: 1 }
  ]);
  assert.deepEqual(choicesFor(actors, "source").map(c => [c.value, c.count]), [["SRD 5.2", 3], ["XMM", 1]]);
});

check("rarity tags are in rarity order", () => {
  const items = [cloak, fireball, sword, flame].map(d => I(d));
  assert.deepEqual(choicesFor(items, "rarity").map(c => c.label), ["Mundane", "Rare", "Very Rare"]);
});

check("a picked tag stays on offer when nothing has it any more", () => {
  const list = choicesFor(actors, "type", { fiend: 1 });
  assert.ok(list.some(c => (c.value === "fiend") && (c.count === 0)));
});

check("saved state is cleaned up for the directory it belongs to", () => {
  const s = normalizeState({
    sort: "rarity", desc: true, open: "yes",
    sets: { type: { beast: 1, undead: 0 }, rarity: { rare: 1 } },
    range: { cr: [1, "x"], bogus: [1, 2] }
  }, "Actor");
  assert.deepEqual(s,
    { sort: "", desc: true, open: false, flat: false, sets: { type: { beast: 1 } }, range: { cr: [1, null] } });
  assert.equal(normalizeState({ flat: true }, "Scene").flat, true);
  assert.deepEqual(normalizeState(null), emptyState());
  assert.deepEqual(normalizeState({ sort: "name" }, "Scene").sort, "name");
  assert.deepEqual(filtersFor("Scene").facets, []);
  assert.deepEqual(filtersFor("Actor").sorts, ["name", "cr", "type", "source"]);
});

console.log(`${passed} passed, ${failed} failed`);
if ( failed ) process.exit(1);
