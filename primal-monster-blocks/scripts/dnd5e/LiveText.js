import { getActivity } from "../utilities.js";

/* global dnd5e:readonly */

/**
 * Helpers that keep numbers written into item descriptions in step with the item's data,
 * so a stat block's text always shows what will actually be rolled.
 */
export default class LiveText {
	/**
	 * Compute simplified damage formulas and types for an activity.
	 *
	 * @param {Activity} activity
	 * @param {object} [config] - Additional roll configuration, e.g. `{ attackMode: "twoHanded" }`
	 * @return {Array<{formula: string, types: string[]}>}
	 */
	static damageParts(activity, config = {}) {
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
			console.warn(`Primal Monster Blocks | Unable to prepare damage for ${activity.item?.name}`, err);
			return [];
		}
	}

	/**
	 * Average of a roll formula, rounded down.
	 *
	 * @param {string} formula
	 * @return {number}
	 */
	static average(formula) {
		try {
			const min = new Roll(String(formula));
			const max = min.clone();
			return Math.floor((
				max.evaluateSync({ maximize: true, strict: false }).total +
				min.evaluateSync({ minimize: true, strict: false }).total
			) / 2);
		}
		catch (e) {
			return 0;
		}
	}

	/**
	 * Whether a formula contains no dice.
	 *
	 * @param {string} formula
	 * @return {boolean}
	 */
	static isDeterministic(formula) {
		try {
			return new Roll(formula).isDeterministic;
		}
		catch (e) {
			return false;
		}
	}

	/**
	 * Format one damage part, e.g. "13 (2d6 + 6) Slashing damage".
	 *
	 * @param {{formula: string, types: string[]}} part
	 * @param {object} [options]
	 * @param {boolean} [options.capitalize=false] - Capitalize the damage type (2024 style)
	 * @param {boolean} [options.withDamage=false] - Append the word "damage"
	 * @return {string}
	 */
	static formatDamage(part, { capitalize = false, withDamage = false } = {}) {
		const labels = part.types.map(t =>
			CONFIG.DND5E.damageTypes[t]?.label ?? CONFIG.DND5E.healingTypes?.[t]?.label ?? t
		).map(l => (capitalize ? game.i18n.localize(l) : game.i18n.localize(l).toLowerCase()));
		const type = labels.length > 1
			? game.i18n.getListFormatter({ type: "disjunction" }).format(labels)
			: (labels[0] ?? "");

		const text = this.isDeterministic(part.formula)
			? `${this.average(part.formula)} ${type}`.trim()
			: game.i18n.format("MOBLOKS5E.AttackDamageTemplate", { average: this.average(part.formula), formula: part.formula, type });

		return withDamage ? `${text} ${game.i18n.localize("MOBLOKS5E.damage")}` : text;
	}

	/**
	 * A damage expression as written in a description: "55 (10d10 Lightning) damage",
	 * "7 (2d6) force damage" or "[[/damage 2d6 fire average]] damage".
	 *
	 * @type {RegExp}
	 */
	static get DAMAGE_PATTERN() {
		return /(?:\b\d+\s*\((?:[^()<]|\([^()<]*\))*?\d*d\d+(?:[^()<]|\([^()<]*\))*\)|\[\[\s*\/damage\b[^\]]*\]\])(?:\s+[A-Za-z]+)?\s+damage\b/gi;
	}

	/**
	 * Rewrite a description that includes a 2024 style saving throw ("Strength Saving Throw: DC 15,
	 * each creature in a 30-foot Cone. Failure: 55 (10d10 Lightning) damage.") so that its ability,
	 * DC, area and damage come from the item's save activity. All other wording is kept.
	 *
	 * @param {string} html     - The description HTML
	 * @param {Item5e} item
	 * @param {object} [options]
	 * @param {boolean} [options.modern=false] - Use 2024 capitalization for damage types
	 * @return {string|null}      The updated HTML, or null if there was nothing to update
	 */
	static liveSaveDescription(html, item, { modern = false } = {}) {
		if (!html) return null;
		const activity = getActivity(item, "save");
		if (!activity) return null;

		let result = html;
		let changed = false;

		// Ability and DC: "Strength Saving Throw: DC 15"
		const abilityNames = Object.values(CONFIG.DND5E.abilities).map(a => a.label).filter(l => l)
			.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
		const saveLabel = game.i18n.localize("DND5E.SavingThrow");
		const sp = "(?:\\s|&nbsp;|<\\/?(?:em|i|strong|b|span)\\b[^>]*>)+";
		const or = `(?:${sp}(?:or|and)${sp}|\\s*,\\s*)`;
		const head = new RegExp(
			`((?:${abilityNames.join("|")})(?:${or}(?:${abilityNames.join("|")}))*)(${sp}${saveLabel.split(/\s+/).join(sp)}\\s*:)((?:\\s|&nbsp;|<\\/?(?:em|i|strong|b|span)\\b[^>]*>)*)DC((?:\\s|&nbsp;|<[^>]+>)*)(\\d+)`, "i"
		);
		const dc = activity.save?.dc?.value;
		const abilities = Array.from(activity.save?.ability ?? []).map(k => CONFIG.DND5E.abilities[k]?.label).filter(l => l);
		if (head.test(result) && (dc || abilities.length)) {
			result = result.replace(head, (m, names, label, gap, dcGap, oldDC) => {
				const newNames = abilities.length
					? game.i18n.getListFormatter({ type: "disjunction" }).format(abilities.map(a => game.i18n.localize(a)))
					: names;
				return `${newNames}${label}${gap}DC${dcGap || " "}${dc || oldDC}`;
			});
			changed = true;
		}
		else if (!/\[\[\s*\/save\b/i.test(result)) {
			// Not a 2024 style saving throw description, leave it alone.
			return null;
		}

		// A [[/save ... dc=15]] enricher with a fixed DC
		if (dc) {
			result = result.replace(/(\[\[\s*\/save\b[^\]]*?\bdc\s*=\s*)(\d+)/gi, (m, before) => {
				changed = true;
				return `${before}${dc}`;
			});
		}

		// Area sizes: "60-foot long, 5-foot wide" before the shape word, or a link to the shape
		// rule (&Reference[Line], @UUID[...]{Line}). Only the sizes change; the shape is kept.
		const sizes = activity.target?.template?.labels?.size;
		if (activity.target?.template?.type && sizes) {
			const size = "\\d+(?:-|\\s)?(?:foot|feet|ft\\.?)(?:[- ](?:long|radius|wide|high|tall|thick))?";
			const shape = "(?:Cone|Cube|Cylinder|Emanation|Line|Sphere|Square|Circle|Wall)s?\\b|&(?:amp;)?Reference\\[|@\\w+\\[|<a\\b|<span\\b";
			const areaPattern = new RegExp(`\\b${size}(?:,?(?:\\s|&nbsp;)+${size})*(?=(?:\\s|&nbsp;)+(?:${shape}))`, "i");
			if (areaPattern.test(result)) {
				result = result.replace(areaPattern, sizes);
				changed = true;
			}
		}

		// Damage, in order, replaced with the activity's live damage
		const parts = this.damageParts(activity);
		if (parts.length) {
			let i = 0;
			result = result.replace(this.DAMAGE_PATTERN, (m) => {
				if (i >= parts.length) return m;
				const text = this.formatDamage(parts[i++], { capitalize: modern, withDamage: true });
				changed = true;
				return `<span class="item-damageRoll live-damage" data-item-id="${item.id}" data-activity-id="${activity.id}">${text}</span>`;
			});
		}

		return changed ? result : null;
	}
}
