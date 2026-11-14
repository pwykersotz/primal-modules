import MonsterBlock5e from "./MonsterBlock5e.js";
import Helpers from "./Helpers5e.js";
import { debug, getActivity } from "../utilities.js";
import ItemPreper from "./ItemPreper.js";

/* global dnd5e:readonly */

/**
 * Prepares the data for an Attack item
 *
 * @export
 * @class AttackPreper
 * @extends {ItemPreper}
 */
export default class AttackPreper extends ItemPreper {
	/**
	 * Determine whether an item should be displayed as an attack.
	 *
	 * @static
	 * @param {Item5e|object} item
	 * @return {boolean}
	 * @memberof AttackPreper
	 */
	static isAttack(item) {
		const document = item.document ?? item;
		return document.type === "weapon" || Boolean(getActivity(document, "attack"));
	}

	/**
	 * Whether an item's own description already spells out the attack, as monsters from the
	 * 2024 compendiums and many imported stat blocks do. In that case the generated attack
	 * text is left out so it doesn't appear twice.
	 *
	 * @static
	 * @param {string} html - The raw description HTML
	 * @return {boolean}
	 * @memberof AttackPreper
	 */
	static describesAttack(html) {
		if (!html) return false;
		if (/\[\[\s*\/attack\b/i.test(html)) return true;       // dnd5e [[/attack]] enricher

		const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
		const english = /\b(melee|ranged)\b[^.:]{0,40}?\b(attack roll|weapon attack|spell attack)\s*:/i;
		if (english.test(text)) return true;

		// The localized "… Attack Roll" wording, for other languages
		const suffix = game.i18n.localize("DND5E.ATTACK.Formatted.2024").replace("{type}", "").trim();
		return Boolean(suffix && suffix !== "DND5E.ATTACK.Formatted.2024" && text.toLowerCase().includes(`${suffix.toLowerCase()}:`));
	}

	/**
	 * Remove the attack sentence ("Melee Attack Roll: +9, reach 10 ft. Hit: 13 (2d6 + 6) Slashing
	 * damage.") from a description, keeping anything that follows it, such as riders and
	 * "Miss:" text.
	 *
	 * @static
	 * @param {string} html - The raw description HTML
	 * @return {string|null} The description without the attack text, or null if it couldn't be found safely
	 * @memberof AttackPreper
	 */
	static stripAttackText(html) {
		if (!html) return null;
		const inline = "(?:<(?:em|i|strong|b|span)\\b[^>]*>\\s*)*";
		const closing = "(?:\\s*<\\/(?:em|i|strong|b|span)>)*";

		// Where the attack starts: its label, or an [[/attack]] enricher
		const label = new RegExp(`${inline}\\b(?:melee|ranged)\\b[^.:<]{0,40}?\\b(?:attack roll|weapon attack|spell attack)\\s*:${closing}`, "i");
		const labelMatch = label.exec(html);
		const enricherAt = html.search(/\[\[\s*\/attack\b/i);
		let start = labelMatch ? labelMatch.index : -1;
		if (enricherAt > -1 && (start < 0 || enricherAt < start)) start = enricherAt;
		if (start < 0) return null;

		// Where the damage starts: "Hit:" / "Hit or Miss:", or a [[/damage]] enricher
		const rest = html.slice(start);
		const hitAt = rest.search(new RegExp(`${inline}\\bhit(?: or miss)?\\s*:`, "i"));
		const damageAt = rest.search(/\[\[\s*\/damage\b/i);
		let hit = [hitAt, damageAt].filter(i => i > -1).sort((a, b) => a - b)[0];
		if (hit === undefined) return null;
		hit += start;

		// The end of the Hit sentence: the first full stop outside tags, (…) and [[…]] that isn't
		// part of an abbreviation like "ft."
		let end = -1;
		let paren = 0, bracket = 0, inTag = false;
		for (let i = hit; i < html.length; i++) {
			const c = html[i];
			if (inTag) { if (c === ">") inTag = false; continue; }
			if (c === "<") { inTag = true; continue; }
			if (html.startsWith("[[", i)) { bracket++; i++; continue; }
			if (html.startsWith("]]", i) && bracket) { bracket--; i++; continue; }
			if (bracket) continue;
			if (c === "(") paren++;
			else if (c === ")" && paren) paren--;
			else if (c === "." && !paren) {
				const before = html.slice(Math.max(hit, i - 4), i);
				if (/\b(?:ft|mi|lb|in|yd|oz)$/i.test(before)) continue;
				const next = html[i + 1];
				if (next === undefined || /\s|</.test(next)) { end = i + 1; break; }
			}
		}
		if (end < 0) return null;

		// Only remove the Hit sentence's damage. Effects written in the same sentence
		// ("…Piercing damage, and the target has the Grappled condition.") stay, and a Hit
		// clause with no damage at all ("Hit or Miss: The target is pushed 10 feet.") is kept whole.
		const hitSentence = html.slice(hit, end);
		const hasDamage = /\d*d\d+|\[\[\s*\/damage\b|\bdamage\b/i.test(hitSentence.replace(/<[^>]*>/g, ""));
		let cut = end;
		if (!hasDamage) cut = hit;
		else {
			// Ignore the word "damage" inside [[/damage …]] enrichers
			const blanked = hitSentence.replace(/\[\[[^\]]*\]\]/g, m => " ".repeat(m.length));
			const words = [...blanked.matchAll(/\bdamage\b/gi)];
			const last = words.at(-1);
			if (last) {
				const after = hit + last.index + last[0].length;
				const tail = html.slice(after, end).replace(/<[^>]*>/g, "").trim();
				if (tail !== ".") cut = after;
			}
		}

		let result = html.slice(0, start) + html.slice(cut);
		// Tidy up what's left: closing tags of the removed label, empty tags and paragraphs, leading spaces
		result = result.replace(new RegExp(`^(\\s*<p[^>]*>)?${closing}`, "i"), "$1");
		for (let i = 0; i < 3; i++) result = result.replace(/<(em|i|strong|b|span)\b[^>]*>\s*<\/\1>/gi, "");
		result = result.replace(/<p[^>]*>(?:\s|&nbsp;)*<\/p>/gi, "");
		result = result.replace(/(<p[^>]*>)(?:\s|&nbsp;)+/i, "$1").trim();
		return result;
	}

	/**
	 * The attack activity of this item.
	 *
	 * @type {Activity|undefined}
	 * @readonly
	 * @memberof AttackPreper
	 */
	get activity() {
		if (this._activity === undefined) this._activity = getActivity(this.item, "attack") ?? null;
		return this._activity;
	}

	/**
	 * @override
	 * @memberof AttackPreper
	 */
	prepare() {
		const raw = this.item.system.description?.value ?? "";

		// If the description spells out the attack itself, display it without that sentence:
		// the generated attack text (with live values) replaces it. The item isn't changed.
		const stripped = this.constructor.describesAttack(raw) ? this.constructor.stripAttackText(raw) : null;
		if (stripped !== null) this.data.strippedDescription = stripped;

		this.data.tohit = this.activity?.labels?.toHit ?? this.item.labels?.attacks?.[0]?.toHit ?? "";
		this.data.description = this.getDescription();
		this.data.continuousDescription =
			Helpers.isContinuousDescription(stripped ?? raw);

		if (debug.enabled) console.debug(this);
	}

	/**
	 * @typedef AttackDescription
	 * @property {string} attackType        - Type of attack, melee vs ranged, weapon, etc.
	 * @property {string} tohit             - Bonus to hit
	 * @property {string} range             - Range or reach
	 * @property {string} target            - What type of target, and how many
	 * @property {DamageData} versatile     - The damage and formula for versatile damage
	 * @property {Array<DamageData>} damage - All of the damage formulas for all types of additional damage
	 *
	 *//**
	 * Constructs the data for this attack's description
	 *
	 * @return {AttackDescription}
	 * @memberof AttackPreper
	 */
	getDescription() {
		const damage = this.getAllDamageData();
		return {
			attackType: this.getAttackType(),
			attackTypeModern: this.getAttackTypeModern(),
			bonus: this.formatBonus(),
			tohit: this.formatToHit(),
			range: this.formatRange(),
			target: this.formatTarget(),
			versatile: this.getVersatileData(),
			damage
		};
	}

	/**
	 * Formats the "to hit" part of the description.
	 *
	 * "{+/-bonus} to hit"
	 *
	 * @return {string}
	 * @memberof AttackPreper
	 */
	formatToHit() {
		const tohit = String(this.data.tohit || "0").replace(/\s+/g, "");
		const bonus = ["+", "-"].includes(tohit.charAt(0)) ? tohit : `+${tohit}`;

		return game.i18n.format("MOBLOKS5E.AttackToHit", { bonus });
	}

	/**
	 * Formats the range part of the description
	 *
	 * "{reachRange} {range}{sep}{max} {units}.",
	 *
	 * @return {string}
	 * @memberof AttackPreper
	 */
	formatRange() {
		const ranged = this.isRangedAttack();
		const itemRange = this.item.system.range ?? {};
		const activityRange = this.activity?.range ?? {};
		const useActivity = this.item.type !== "weapon" || activityRange.override;
		const fixUnits = (u) => (["ft", "m", "mi", "km"].includes(u) ? u : "ft");

		const part = (isRange, range, longRange, units) => game.i18n.format("MOBLOKS5E.AttackRange", {
			reachRange: game.i18n.localize(isRange ? "MOBLOKS5E.range" : "MOBLOKS5E.reach"),
			range: range ?? "",
			sep: longRange && longRange != range ? "/" : "",
			max: longRange && longRange != range ? longRange : "",
			units
		});

		if (ranged) {
			return part(true,
				useActivity ? activityRange.value : itemRange.value,
				useActivity ? null : itemRange.long,
				fixUnits(useActivity ? activityRange.units : itemRange.units));
		}

		const reach = (useActivity ? activityRange.value : itemRange.reach) || 5;
		const melee = part(false, reach, null, fixUnits(useActivity ? activityRange.units : itemRange.units));
		if (!this.isThrown() || !itemRange.value) return melee;

		// Thrown weapons: "reach 5 ft. or range 20/60 ft."
		const thrown = part(true, itemRange.value, itemRange.long, fixUnits(itemRange.units));
		return game.i18n.getListFormatter({ type: "disjunction" }).format([melee, thrown]);
	}

	/**
	 * Whether this is a melee weapon that can also be thrown.
	 *
	 * @return {boolean}
	 */
	isThrown() {
		return this.item.type === "weapon" && !this.isRangedAttack()
			&& Boolean(this.item.system.properties?.has?.("thr"));
	}

	/**
	 * Formats the target(s) part of the description.
	 *
	 * @return {string}
	 * @memberof AttackPreper
	 */
	formatTarget() {
		const condition = this.activity?.activation?.condition;
		if (condition) return condition; // if the user has specified a custom targeting condition, use that instead of 1 target / 1 creature

		const affects = this.activity?.target?.affects ?? {};
		const count = Number(affects.count) || 1;
		const quantity = Helpers.getNumberString(count);
		const config = CONFIG.DND5E.individualTargetTypes?.[affects.type];

		let type = config?.label ? game.i18n.localize(config.label).toLowerCase() : "";
		if (!type) type = count > 1                     // If the type wasn't defined, then
			? game.i18n.localize("MOBLOKS5E.targetS")   // if the value is greater than one it's plural
			: game.i18n.localize("MOBLOKS5E.target");   // Otherwise singular

		return game.i18n.format("MOBLOKS5E.AttackTarget", { quantity, type });
	}

	/**
	 * @typedef DamageData
	 * @property {string} text    - The textual description of the damage being dealt
	 * @property {string} formula - The rollable formula for the damage
	 *//**
	 * Compute simplified damage formulas and types from the attack activity.
	 *
	 * @param {object} [config] - Additional roll configuration, e.g. `{ attackMode: "twoHanded" }`
	 * @return {Array<{formula: string, types: string[]}>}
	 * @memberof AttackPreper
	 */
	getDamageParts(config = {}) {
		const activity = this.activity;
		if (!activity?.getDamageConfig) return [];

		const simplify = dnd5e.dice.simplifyRollFormula;
		const aggregate = dnd5e.dice.aggregateDamageRolls;
		const DamageRoll = CONFIG.Dice.DamageRoll;

		try {
			const rollData = activity.getRollData({ deterministic: true });
			const rollConfig = activity.getDamageConfig({ ...config }, { formulaOptions: { modifiers: false }, rollData });
			let rolls = rollConfig.rolls.map(({ base, data, options, parts }) => {
				const formula = parts.filter(p => p !== "").join(" + ");
				if (!formula) return null;
				try {
					return new DamageRoll(formula, data, { base, ...options });
				}
				catch (err) {
					return null;
				}
			}).filter(r => r);
			if (aggregate) rolls = aggregate(rolls);

			return rolls.map(roll => {
				let formula = roll.formula;
				try {
					roll.simplify?.();
					formula = simplify(roll.formula, { preserveFlavor: false });
				}
				catch (err) { /* Keep the unsimplified formula */ }
				const types = roll.options.types ?? (roll.options.type ? [roll.options.type] : []);
				return { formula, types };
			});
		}
		catch (err) {
			console.warn(`Primal Monster Blocks | Unable to prepare damage for ${this.item.name}`, err);
			return [];
		}
	}

	/**
	 * Returns data for formatting versatile damage
	 *
	 * @return {DamageData|false}
	 * @memberof AttackPreper
	 */
	getVersatileData() {
		if (!this.item.system.isVersatile) return false;
		const [part] = this.getDamageParts({ attackMode: "twoHanded" });
		if (!part) return false;
		return this.getDamageData(part);
	}

	/**
	 * Returns data for formatting damage of all damage parts
	 *
	 * @return {Array<DamageData>}
	 * @memberof AttackPreper
	 */
	getAllDamageData() {
		return this.getDamageParts().map(this.getDamageData.bind(this));
	}

	/**
	 * Returns the data for a damage roll
	 *
	 * @param {{formula: string, types: string[]}} part
	 * @return {DamageData}
	 * @memberof AttackPreper
	 */
	getDamageData(part) {
		return {
			text: this.formatAttackAndDamage(part),
			textModern: this.formatAttackAndDamage(part, { capitalize: true }),
			formula: part.formula
		};
	}

	/**
	 * Formats the attack and damage part of the description.
	 *
	 * "{average} ({formula}) {type}"
	 *
	 * @param {{formula: string, types: string[]}} part
	 * @return {string}
	 * @memberof AttackPreper
	 */
	formatAttackAndDamage(part, { capitalize = false } = {}) {
		const labels = part.types.map(t =>
			CONFIG.DND5E.damageTypes[t]?.label ?? CONFIG.DND5E.healingTypes?.[t]?.label ?? t
		).map(l => (capitalize ? game.i18n.localize(l) : game.i18n.localize(l).toLowerCase()));
		const type = labels.length > 1
			? game.i18n.getListFormatter({ type: "disjunction" }).format(labels)
			: (labels[0] ?? "");

		const average = MonsterBlock5e.averageRoll(part.formula, {});
		const deterministic = this.isDeterministic(part.formula);

		if (deterministic) return `${average} ${type}`.trim();

		return game.i18n.format("MOBLOKS5E.AttackDamageTemplate", {
			average,
			formula: part.formula,
			type
		});
	}

	/**
	 * Whether or not a formula contains any dice.
	 *
	 * @param {string} formula
	 * @return {boolean}
	 */
	isDeterministic(formula) {
		try {
			return new Roll(formula).isDeterministic;
		}
		catch (e) {
			return false;
		}
	}

	/**
	 * The action type of the attack, e.g. "mwak"
	 *
	 * @type {string}
	 * @readonly
	 */
	get actionType() {
		const activity = this.activity;
		if (!activity) return "";
		try {
			return activity.actionType ?? activity.getActionType?.() ?? "";
		}
		catch (e) {
			return "";
		}
	}

	/**
	 * Determine which type of attack this is.
	 *
	 * @return {string}
	 * @memberof AttackPreper
	 */
	getAttackType() {
		if (this.isThrown()) {
			const classification = game.i18n.localize(this.actionType.endsWith("sak")
				? "DND5E.ATTACK.Classification.Spell" : "DND5E.ATTACK.Classification.Weapon");
			return game.i18n.format("DND5E.ATTACK.Formatted.2014", { type: this.meleeOrRanged(), classification });
		}
		const label = CONFIG.DND5E.itemActionTypes?.[this.actionType];
		return label ? game.i18n.localize(label) : "";
	}

	/**
	 * "Melee or Ranged", localized.
	 *
	 * @return {string}
	 */
	meleeOrRanged() {
		return game.i18n.getListFormatter({ type: "disjunction" }).format([
			game.i18n.localize("DND5E.ATTACK.Type.Melee"),
			game.i18n.localize("DND5E.ATTACK.Type.Ranged")
		]);
	}

	/**
	 * The 2024 style attack label, e.g. "Melee Attack Roll".
	 *
	 * @return {string}
	 */
	getAttackTypeModern() {
		if (!this.actionType) return "";
		let type;
		if (this.isThrown()) type = this.meleeOrRanged();
		else type = game.i18n.localize(this.isRangedAttack() ? "DND5E.ATTACK.Type.Ranged" : "DND5E.ATTACK.Type.Melee");
		return game.i18n.format("DND5E.ATTACK.Formatted.2024", { type });
	}

	/**
	 * The attack bonus with its sign, e.g. "+5".
	 *
	 * @return {string}
	 */
	formatBonus() {
		const tohit = String(this.data.tohit || "0").replace(/\s+/g, "");
		return ["+", "-"].includes(tohit.charAt(0)) ? tohit : `+${tohit}`;
	}

	/**
	 * Determine if this attack is ranged or not
	 *
	 * @return {Boolean}
	 * @memberof AttackPreper
	 */
	isRangedAttack() {
		return ["rwak", "rsak"].includes(this.actionType);
	}

	/**
	 * Whether or not this attack deals any damage
	 *
	 * @return {Boolean}
	 * @memberof AttackPreper
	 */
	dealsDamage() {
		return this.getDamageParts().length > 0;
	}
}
