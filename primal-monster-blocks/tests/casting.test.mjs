// Spellcasting features: which ones get the generated text, and what it says.
//   node --test tests/casting.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const getProperty = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);
const format = (id, data = {}) => String(getProperty(en, id) ?? id).replace(/\{(\w+)\}/g, (_, k) => data[k] ?? "");
globalThis.foundry = { utils: { getProperty } };
globalThis.game = { i18n: { translations: en, _fallback: {}, localize: id => format(id), format }, modules: new Map() };
globalThis.CONFIG = { DND5E: { abilities: { int: { label: "Intelligence" }, cha: { label: "Charisma" } } } };

const { default: CastingPreper } = await import("../scripts/dnd5e/CastingPreper.js");
const { default: Helpers } = await import("../scripts/Helpers.js");

const activities = list => ({ contents: list });
const feat = (name, acts = [], description = "") => ({
	name, type: "feat",
	system: { description: { value: description }, activities: activities(acts) }
});

// The Spellcasting action of the 2024 Ancient Red Dragon (Monster Manual 2024).
const dragonSpellcasting = feat("Spellcasting", [
	{ type: "cast", activation: { type: "action" }, spell: { uuid: "Compendium.dnd5e.spells.Item.command" } },
	{ type: "cast", activation: { type: "action" }, spell: { uuid: "Compendium.dnd5e.spells.Item.detectMagic" } },
	{ type: "cast", activation: { type: "action" }, spell: { uuid: "Compendium.dnd5e.spells.Item.scorchingRay" } },
	{ type: "cast", activation: { type: "action" }, uses: { max: "1" }, spell: { uuid: "Compendium.dnd5e.spells.Item.fireball" } },
	{ type: "cast", activation: { type: "action" }, uses: { max: "1" }, spell: { uuid: "Compendium.dnd5e.spells.Item.scrying" } }
], "<p>The ancient red dragon casts one of the following spells…</p>");

test("a 2024 Spellcasting action (Cast activities) is not a generated spellcasting feature", () => {
	assert.equal(CastingPreper.castsWithActivities(dragonSpellcasting), true);
	assert.equal(CastingPreper.isCasting(dragonSpellcasting), false);
	// Also when given the sheet's item context, which wraps the document.
	assert.equal(CastingPreper.isCasting({ name: "Spellcasting", document: dragonSpellcasting }), false);
});

test("2014-style Spellcasting and Innate Spellcasting traits are still generated", () => {
	assert.equal(CastingPreper.isCasting(feat("Spellcasting")), true);
	assert.equal(CastingPreper.isCasting(feat("Innate Spellcasting")), true);
	assert.equal(CastingPreper.isCasting(feat("Spellcasting", [{ type: "utility", activation: { type: "" } }])), true);
	assert.equal(CastingPreper.isCasting(feat("Pact Magic")), true);
	assert.equal(CastingPreper.isCasting({ name: "Spellcasting", type: "feat", system: {} }), true);
});

test("other features are not spellcasting", () => {
	assert.equal(CastingPreper.isCasting(feat("Fire Breath", [{ type: "save" }])), false);
	assert.equal(CastingPreper.isCasting(feat("Fiery Rays", [{ type: "cast" }])), false);
});

test("caster level 0 is not written as 00", () => {
	assert.equal(Helpers.getOrdinalSuffix(0), "");
	assert.equal(Helpers.formatOrdinal(3), "3rd");
	assert.equal(Helpers.formatOrdinal(11), "11th");
});

const preper = ({ level = 0, editing = false, spells = [] } = {}) => {
	const actor = {
		name: "Lich",
		items: [],
		system: { attributes: { spell: { level, dc: 20 }, prof: 7, spellcasting: "int" }, abilities: { int: { mod: 5 } } }
	};
	const sheet = { actor, flags: { editing }, hasAtWillSpells: () => false };
	const item = feat("Spellcasting");
	const book = spells.length ? [{ order: 1, prop: "spell1", spells, dataset: { level: 1 } }] : [];
	const data = { _id: "x", name: item.name, document: item };
	const p = new CastingPreper(sheet, data, { spellbook: book, innateSpellbook: [] });
	p.prepare();
	return data;
};

test("a caster with no level set leaves out the level sentence", () => {
	assert.equal(preper({ spells: [{ _id: "s", name: "Shield", system: { level: 1 } }] }).description.level, "");
	assert.match(preper({ level: 18, spells: [{ _id: "s", name: "Shield", system: { level: 1 } }] }).description.level, />18<\/span>th-level spellcaster/);
});

test("a spellcasting trait with no spells on the actor falls back to its own text", () => {
	assert.equal(preper().hasSpells, false);
	assert.equal(preper({ spells: [{ _id: "s", name: "Shield", system: { level: 1 } }] }).hasSpells, true);
});

test("the sheet only generates the text when there are spells to list", () => {
	const main = readFileSync(new URL("../templates/dnd5e/main.hbs", import.meta.url), "utf8");
	assert.match(main, /\{\{#if \(and @root\.flags\.casting-feature casting\.hasSpells\)\}\}/);
});

test("while editing, a caster with no level shows an editable 0 with no stray suffix", () => {
	const text = preper({ editing: true, spells: [{ _id: "s", name: "Shield", system: { level: 1 } }] }).description.level;
	assert.match(text, />0<\/span>-level spellcaster/);
});
