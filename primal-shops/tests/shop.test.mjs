// What a shop sells, what it costs, its stock, buying and selling. Plain Node, no Foundry.
//   node --test tests/shop.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RATES as rates } from "../scripts/money.mjs";
import { normalizeEntry, normalizeLists, normalizeStock, normalizeRarity, categoryOf, levelOf, entryKey } from "../scripts/catalog.mjs";
import {
  defaultShop, normalizeShop, normalizeState, serializeState, normalizeOffer, shopEntries, unitPriceCp, stockLeft,
  pickSelection, needsStocking, stockView, checkPurchase, restockRowFor, restockFromSale, sellRateOf, sellPriceCp,
  categoriesSold, buysCategory, sellableItems, hexColor
} from "../scripts/shop.mjs";

const lists = normalizeLists({ lists: [
  { id: "basics", name: "Basics", entries: [
    { id: "rope", name: "Rope", type: "equipment", price: { value: 1, denomination: "gp" } },
    { id: "arrows", name: "Arrows", type: "consumable", subtype: "ammo", price: { value: 1, denomination: "gp" }, bundle: 20, stock: "3" },
    { id: "heal", name: "Potion of Healing", type: "consumable", subtype: "potion", rarity: "common", price: { value: 50, denomination: "gp" }, stock: "1d4" },
    { id: "sword", name: "Flame Tongue", type: "weapon", rarity: "rare", uuid: "Compendium.x.Item.ft", price: { value: 5000, denomination: "gp" } },
    { id: "nothing", name: "Pebble", type: "loot" }
  ] },
  { id: "more", name: "More", entries: [
    { id: "dup", name: "Flame Tongue (again)", type: "weapon", rarity: "rare", uuid: "Compendium.x.Item.ft", price: { value: 1, denomination: "gp" } },
    { id: "cloak", name: "Cloak of Elvenkind", type: "equipment", rarity: "Very Rare", priceGp: 800 }
  ] }
] });
const key = (listId, id) => entryKey(lists.lists.find(l => l.id === listId).entries.find(e => e.id === id), listId);

test("entries and lists are cleaned up", () => {
  assert.equal(normalizeEntry({ name: "" }), null);
  const e = normalizeEntry({ name: " Torch ", type: "spaceship", stock: "lots", rarity: "very rare", level: 99 });
  assert.equal(e.name, "Torch");
  assert.equal(e.type, "loot");
  assert.equal(e.stock, null);
  assert.equal(e.rarity, "veryRare");
  assert.equal(e.level, 6);
  assert.equal(normalizeStock(" 1d4 + 1 "), "1d4+1");
  assert.equal(normalizeStock("∞"), null);
  assert.equal(normalizeStock(12), "12");
  assert.equal(normalizeRarity("Legendary"), "legendary");
  assert.equal(categoryOf({ type: "equipment", subtype: "shield" }), "armor");
  assert.equal(categoryOf({ type: "loot", subtype: "gem" }), "treasure");
  assert.equal(levelOf({ rarity: "rare" }), 3);
  assert.equal(levelOf({ rarity: "rare", level: 1 }), 1);
});

test("a shop's settings are filled in and kept in range", () => {
  assert.deepEqual(normalizeShop(null), defaultShop());
  const s = normalizeShop({ markup: -5, sellRate: "", level: "2.4", lists: ["a", "a", 3], maxPriceGp: 0, buys: "maybe",
    ribbon: { color: "#ABC", trim: "gold" } });
  assert.equal(s.markup, 0);
  assert.equal(s.sellRate, null);
  assert.equal(s.level, 2);
  assert.deepEqual(s.lists, ["a"]);
  assert.equal(s.maxPriceGp, null);
  assert.equal(s.buys, "all");
  assert.deepEqual(s.ribbon, { color: "#aabbcc", trim: "#f0c75e" });
  assert.equal(hexColor("#123456", "x"), "#123456");
});

test("a shop's state survives saving and loading", () => {
  const state = normalizeState({ stock: { a: 3, b: -2, c: "x" }, selection: ["a", "a"], offers: [{ id: "o1", lines: [{ qty: 2, name: "Rope", unitCp: 99.6 }] }, { id: "o2", lines: [] }] });
  assert.deepEqual(state.stock, { a: 3, b: 0 });
  assert.deepEqual(state.selection, ["a"]);
  assert.equal(state.offers.length, 1, "an offer with no lines is dropped");
  assert.equal(state.offers[0].lines[0].unitCp, 100);
  assert.equal(state.offers[0].kind, "sell");
  const saved = serializeState(state);
  assert.deepEqual(saved.stock, [{ key: "a", n: 3 }, { key: "b", n: 0 }]);
  assert.deepEqual(normalizeState(saved), state);
  assert.equal(normalizeOffer({ id: "x", lines: [{ qty: 0 }] }), null);
});

test("an item on two lists is sold once, as the first list has it", () => {
  const shop = normalizeShop({ lists: ["basics", "more"], sellOwn: false });
  const entries = shopEntries(shop, lists);
  const tongues = entries.filter(e => e.uuid === "Compendium.x.Item.ft");
  assert.equal(tongues.length, 1);
  assert.equal(tongues[0].name, "Flame Tongue");
  assert.equal(entries.length, 6);
  const withOwn = shopEntries(normalizeShop({ lists: ["basics"] }), lists, [{ key: "own:1", name: "Lute", quantity: 2 }]);
  assert.equal(withOwn.at(-1).source, "own");
  assert.equal(shopEntries(shop, { lists: [] }).length, 0, "a list that's gone is skipped");
});

test("prices include the shop's markup, and never round to nothing", () => {
  const rope = { price: { value: 1, denomination: "gp" } };
  assert.equal(unitPriceCp(rope, normalizeShop({ markup: 150 }), rates), 150);
  assert.equal(unitPriceCp({ price: { value: 1, denomination: "cp" } }, normalizeShop({ markup: 10 }), rates), 1);
  assert.equal(unitPriceCp({ priceGp: 800, price: { value: 5, denomination: "gp" } }, normalizeShop({}), rates), 80000, "a list's own price wins");
  assert.equal(unitPriceCp({ price: null }, normalizeShop({}), rates), 0);
});

test("what's on sale: level, highest price, hidden, no price, sold out and the random pick", () => {
  const shop = normalizeShop({ lists: ["basics", "more"], level: 3, maxPriceGp: 1000, hidden: [key("basics", "rope")] });
  const rows = stockView({ shop, state: normalizeState({ stock: { [key("basics", "arrows")]: 0 } }), entries: shopEntries(shop, lists), rates });
  const reason = name => rows.find(r => r.name === name).reason;
  assert.equal(reason("Rope"), "hidden");
  assert.equal(reason("Arrows"), "soldOut");
  assert.equal(reason("Potion of Healing"), "");
  assert.equal(reason("Flame Tongue"), "price", "5,000 gp is over the shop's 1,000 gp");
  assert.equal(reason("Cloak of Elvenkind"), "level", "very rare is above level 3");
  assert.equal(reason("Pebble"), "noPrice");

  const picky = normalizeShop({ lists: ["basics"], random: { enabled: true } });
  const picked = stockView({ shop: picky, state: normalizeState({ selection: [key("basics", "heal")] }), entries: shopEntries(picky, lists), rates });
  assert.equal(picked.find(r => r.name === "Rope").reason, "notPicked");
  assert.equal(picked.find(r => r.name === "Potion of Healing").reason, "");
});

test("stock: a list's number, a GM's number, no limit, or a roll still to make", () => {
  const shop = normalizeShop({ lists: ["basics"] });
  const entries = shopEntries(shop, lists);
  const of = name => entries.find(e => e.name === name);
  const state = normalizeState({});
  assert.equal(stockLeft(of("Rope"), state), null);
  assert.equal(stockLeft(of("Arrows"), state), 3);
  assert.equal(stockLeft(of("Potion of Healing"), state), undefined);
  assert.equal(needsStocking(entries, shop, state), true, "the 1d4 potions need rolling");
  const rolled = normalizeState({ stock: { [of("Potion of Healing").key]: 2 } });
  assert.equal(stockLeft(of("Potion of Healing"), rolled), 2);
  assert.equal(needsStocking(entries, shop, rolled), false);
  assert.equal(stockLeft({ source: "own", quantity: 4.9 }, state), 4);
});

test("the random pick takes so many of each rarity", () => {
  const shop = normalizeShop({ lists: ["basics", "more"], random: { enabled: true, counts: { mundane: 1, common: 0 } } });
  const entries = shopEntries(shop, lists);
  const keys = pickSelection(entries, shop, rates, () => 0);
  const names = keys.map(k => entries.find(e => e.key === k).name);
  assert.deepEqual(names.filter(n => ["Rope", "Arrows"].includes(n)), ["Rope"], "one mundane entry");
  assert.ok(!names.includes("Potion of Healing"), "no commons");
  assert.ok(names.includes("Flame Tongue") && names.includes("Cloak of Elvenkind"), "rarities with no count are all in");
  assert.ok(!names.includes("Pebble"), "an entry with no price can't be picked");
});

test("buying checks stock and adds up the cart", () => {
  const shop = normalizeShop({ lists: ["basics"] });
  const state = normalizeState({ stock: { [key("basics", "heal")]: 2 } });
  const rows = stockView({ shop, state, entries: shopEntries(shop, lists), rates });
  const ok = checkPurchase(rows, [{ key: key("basics", "rope"), qty: 2 }, { key: key("basics", "rope"), qty: 1 }, { key: key("basics", "heal"), qty: 2 }]);
  assert.equal(ok.ok, true);
  assert.equal(ok.totalCp, 300 + 10000);
  assert.equal(ok.lines.length, 2, "two lines for the same thing are counted together");
  assert.equal(checkPurchase(rows, [{ key: key("basics", "heal"), qty: 3 }]).error.code, "notEnough");
  assert.equal(checkPurchase(rows, [{ key: "nope", qty: 1 }]).error.code, "gone");
  assert.equal(checkPurchase(rows, [{ key: key("basics", "nothing"), qty: 1 }]).error.code, "unavailable");
  assert.equal(checkPurchase(rows, []).error.code, "empty");
  assert.equal(checkPurchase(rows, [{ key: key("basics", "rope"), qty: 2, unitCp: 75 }]).totalCp, 150, "the GM's price wins");
  const soldOut = stockView({ shop, state: normalizeState({ stock: { [key("basics", "arrows")]: 0 } }), entries: shopEntries(shop, lists), rates });
  assert.equal(checkPurchase(soldOut, [{ key: key("basics", "arrows"), qty: 1 }]).error.code, "soldOut");
});

test("selling an item back restocks the entry it came from, by the bundle", () => {
  const shop = normalizeShop({ lists: ["basics"] });
  const rows = stockView({ shop, state: normalizeState({}), entries: shopEntries(shop, lists), rates });
  const arrows = restockRowFor(rows, { name: "arrows" });
  assert.equal(arrows.name, "Arrows", "found by name, ignoring case");
  assert.equal(restockRowFor(rows, { name: "Something", uuid: "Compendium.x.Item.ft" }).name, "Flame Tongue");
  assert.equal(restockRowFor(rows, { name: "Unknown" }), null);
  assert.deepEqual(restockFromSale([{ row: arrows, qty: 45 }]), { [arrows.key]: 5 }, "45 arrows are two bundles of 20");
  assert.deepEqual(restockFromSale([{ row: rows.find(r => r.name === "Rope"), qty: 3 }]), {}, "no limit, nothing to restock");
});

test("what a shop pays: its rate, the world's rate, bundles, and harvested components in full", () => {
  assert.equal(sellRateOf(normalizeShop({})), 50);
  assert.equal(sellRateOf(normalizeShop({}), 30), 30);
  assert.equal(sellRateOf(normalizeShop({ sellRate: 80 }), 30), 80);
  const sword = { system: { price: { value: 15, denomination: "gp" } } };
  assert.equal(sellPriceCp(sword, 50, rates), 750);
  assert.equal(sellPriceCp({ bundle: 20, system: { price: { value: 1, denomination: "gp" } } }, 50, rates), 2, "per arrow");
  const essence = { flags: { "primal-harvesting": { component: true } }, system: { price: { value: 100, denomination: "gp" } } };
  assert.equal(sellPriceCp(essence, 50, rates), 10000, "a component sells for its listed value");
});

test("what a shop buys, and what a character can sell it", () => {
  const sold = categoriesSold([{ category: "potion", reason: "" }, { category: "weapon", reason: "notPicked" }, { category: "armor", reason: "level" }]);
  assert.deepEqual([...sold].sort(), ["potion", "weapon"]);
  assert.equal(buysCategory(normalizeShop({ buys: "same" }), "armor", sold), false);
  assert.equal(buysCategory(normalizeShop({ buys: "none" }), "potion", sold), false);
  assert.equal(buysCategory(normalizeShop({}), "armor", sold), true);

  const items = [
    { id: "a", name: "Longsword", type: "weapon", system: { quantity: 1, price: { value: 15, denomination: "gp" }, type: { value: "martialM" } } },
    { id: "b", name: "Claws", type: "weapon", system: { quantity: 1, type: { value: "natural" } } },
    { id: "c", name: "Backpack", type: "container", system: { quantity: 1, price: { value: 2, denomination: "gp" } } },
    { id: "d", name: "Rations", type: "consumable", system: { quantity: 3, container: "c", price: { value: 5, denomination: "sp" }, type: { value: "food" } } },
    { id: "e", name: "Lucky Stone", type: "loot", system: { quantity: 1, type: { value: "gem" } } },
    { id: "f", name: "Fireball", type: "spell", system: {} },
    { id: "g", name: "Shield", type: "equipment", system: { quantity: 0, price: { value: 10, denomination: "gp" } } }
  ];
  const rows = sellableItems(items, { shop: normalizeShop({}), sold, rate: 50, rates });
  assert.deepEqual(rows.map(r => r.name), ["Backpack", "Longsword", "Lucky Stone", "Rations"]);
  const of = name => rows.find(r => r.name === name);
  assert.equal(of("Backpack").reason, "container", "a bag with things in it can't be sold");
  assert.equal(of("Longsword").unitCp, 750);
  assert.equal(of("Lucky Stone").reason, "noPrice");
  assert.equal(sellableItems(items, { shop: normalizeShop({}), sold, rate: 50, rates, gmPrices: true }).find(r => r.name === "Lucky Stone").reason, "",
    "the GM can name a price");
  assert.equal(sellableItems(items, { shop: normalizeShop({ buys: "same" }), sold, rate: 50, rates }).find(r => r.name === "Rations").reason, "notBought");
});
