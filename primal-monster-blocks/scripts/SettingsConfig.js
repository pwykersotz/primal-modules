import { MODULE_ID, MODULE_PATH } from "./constants.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * The Monster Blocks settings, grouped into tabs and sections. Personal settings (the panel and
 * party sheet) come first; the world defaults for every sheet follow and are only shown to the GM.
 *
 * Each entry names registered settings by key; any setting not listed here is shown under "Other".
 */
export const CATEGORIES = [
	{
		id: "panel", icon: "fa-solid fa-table-columns",
		groups: [
			{ id: "statBlock", settings: ["pane-on-select", "pane-side"] },
			{ id: "party", settings: ["party-for-players", "party-active-only", "party-on-select", "party-columns", "party-background", "party-background-color"] },
			{ id: "interface", settings: ["hide-hotbar"] }
		]
	},
	{
		id: "appearance", icon: "fa-solid fa-palette",
		groups: [
			{ id: "theme", settings: ["default-theme", "custom-theme-class", "font-size"] },
			{ id: "picture", settings: ["hide-profile-image", "use-token-image"] }
		]
	},
	{
		id: "layout", icon: "fa-solid fa-table-cells-large",
		groups: [
			{ id: "compact", settings: ["compact-window", "compact-layout", "compact-feats", "compact-skills"] },
			{ id: "sizing", settings: ["stat-block-columns", "show-collapsible", "max-height-offset"] }
		]
	},
	{
		id: "content", icon: "fa-solid fa-scroll",
		groups: [
			{ id: "hitPoints", settings: ["current-hit-points", "maximum-hit-points"] },
			{ id: "generated", settings: ["attack-descriptions", "casting-feature"] },
			{ id: "sections", settings: ["show-lair-actions", "show-resources", "show-skill-save", "show-not-prof"] },
			{ id: "secrets", settings: ["hidden-secrets", "inline-secrets"] }
		]
	},
	{
		id: "editing", icon: "fa-solid fa-pen-to-square",
		groups: [
			{ id: "editing", settings: ["editing", "confirm-delete", "auto-proficiency"] }
		]
	}
];

const NAMESPACE = MODULE_ID;

/** Settings the module keeps for itself, changed elsewhere rather than in this window. */
const HIDDEN = new Set(["party-roster"]);

/**
 * Personal settings that only matter if a world setting allows them for players. Players can't
 * change them while the world setting is off.
 */
const NEEDS_GM = {
	"party-on-select": { setting: "party-for-players", note: "MOBLOKS5E.config.partyLocked" },
	"party-columns": { setting: "party-for-players", note: "MOBLOKS5E.config.partyLocked" },
	"party-background": { setting: "party-for-players", note: "MOBLOKS5E.config.partyLocked" },
	"party-background-color": { setting: "party-for-players", note: "MOBLOKS5E.config.partyLocked" }
};

/** Settings that hold a color, shown with a color picker. */
const COLORS = new Set(["party-background-color"]);

/**
 * One window for all of Monster Blocks' settings, opened from the module's entry in Configure Settings.
 *
 * @export
 * @class MonsterBlocksSettings
 */
export default class MonsterBlocksSettings extends HandlebarsApplicationMixin(ApplicationV2) {
	/** @override */
	static DEFAULT_OPTIONS = {
		id: "monsterblock-settings",
		tag: "form",
		classes: ["monsterblock-settings"],
		window: {
			title: "MOBLOKS5E.config.title",
			icon: "fa-solid fa-dragon",
			resizable: true
		},
		position: {
			width: 640,
			height: "auto"
		},
		form: {
			handler: MonsterBlocksSettings.#onSubmit,
			closeOnSubmit: true
		},
		actions: {
			selectTab: MonsterBlocksSettings.#onSelectTab,
			resetDefaults: MonsterBlocksSettings.#onResetDefaults
		}
	};

	/** @override */
	static PARTS = {
		form: {
			template: `${MODULE_PATH}/templates/settings.hbs`
		}
	};

	/** The tab being shown. */
	#tab = "panel";

	/**
	 * A registered Monster Blocks setting's configuration.
	 *
	 * @param {string} key
	 * @return {object|undefined}
	 */
	static config(key) {
		return game.settings.settings.get(`${NAMESPACE}.${key}`);
	}

	/** Whether a setting is each user's own rather than the world's. */
	static isPersonal(config) {
		return config?.scope !== "world";
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const localize = (k) => (k ? game.i18n.localize(k) : "");
		const isGM = game.user.isGM;

		// Anything registered but not placed in a tab goes under "Other".
		const listed = new Set(CATEGORIES.flatMap(c => c.groups.flatMap(g => g.settings)));
		const others = [];
		for (const [id, config] of game.settings.settings) {
			if (!id.startsWith(`${NAMESPACE}.`)) continue;
			const key = id.slice(NAMESPACE.length + 1);
			if (!listed.has(key) && !HIDDEN.has(key)) others.push(key);
		}
		const categories = others.length
			? [...CATEGORIES, { id: "other", icon: "fa-solid fa-ellipsis", groups: [{ id: "other", settings: others }] }]
			: CATEGORIES;

		context.categories = categories
			.map((category) => {
				const groups = category.groups
					.map(group => ({
						id: group.id,
						label: localize(`MOBLOKS5E.config.groups.${group.id}`),
						// Players can only change their own settings, so they only see those.
						fields: group.settings.map(key => this.#field(key)).filter(f => f && (isGM || f.personal))
					}))
					.filter(group => group.fields.length);
				const fields = groups.flatMap(g => g.fields);
				const personalCount = fields.filter(f => f.personal).length;
				let scope = personalCount === fields.length ? "personal" : (personalCount ? "mixed" : "world");
				// In a tab that mixes the two, mark whichever kind there are fewer of: the world settings in
				// a tab that's mostly personal, or the personal ones in a tab that's mostly for the world.
				if (scope === "mixed") {
					const markPersonal = personalCount < fields.length - personalCount;
					if (markPersonal) scope = "mixedWorld";
					for (const field of fields) {
						if (field.personal !== markPersonal) continue;
						field.badge = localize(`MOBLOKS5E.config.scope.${markPersonal ? "personalBadge" : "worldBadge"}`);
						field.badgeIcon = markPersonal ? "fa-solid fa-user" : "fa-solid fa-earth-americas";
					}
				}
				const forWorld = scope === "world" || scope === "mixedWorld";
				return {
					id: category.id,
					icon: category.icon,
					label: localize(`MOBLOKS5E.config.tabs.${category.id}`),
					personal: !forWorld,
					scopeIcon: forWorld ? "fa-solid fa-earth-americas" : "fa-solid fa-user",
					scopeNote: localize(`MOBLOKS5E.config.scope.${scope}`),
					groups
				};
			})
			.filter(category => category.groups.length);

		if (!context.categories.some(c => c.id === this.#tab)) this.#tab = context.categories[0]?.id;
		for (const category of context.categories) category.active = category.id === this.#tab;
		return context;
	}

	/**
	 * One setting, ready to show as a form field.
	 *
	 * @param {string} key
	 * @return {object|null}
	 */
	#field(key) {
		const config = this.constructor.config(key);
		if (!config) return null;
		const localize = (k) => (k ? game.i18n.localize(k) : "");
		let value;
		try {
			value = game.settings.get(NAMESPACE, key);
		}
		catch (e) {
			value = config.default;
		}
		const personal = this.constructor.isPersonal(config);
		let editable = personal || game.user.isGM;
		let note = "";
		const needs = NEEDS_GM[key];
		if (needs && !game.user.isGM) {
			let allowed = false;
			try {
				allowed = Boolean(game.settings.get(NAMESPACE, needs.setting));
			}
			catch (e) { /* not registered */ }
			if (!allowed) {
				editable = false;
				note = localize(needs.note);
			}
		}
		const isCheckbox = config.type === Boolean;
		const isSelect = !isCheckbox && Boolean(config.choices);
		const isNumber = !isCheckbox && !isSelect && config.type === Number;
		const isColor = !isCheckbox && !isSelect && COLORS.has(key);
		return {
			key,
			id: `monsterblock-setting-${key}`,
			name: localize(config.name),
			hint: localize(config.hint),
			value,
			personal,
			editable,
			note,
			badge: "",
			badgeIcon: "",
			isCheckbox,
			isSelect,
			isNumber,
			isColor,
			isText: !isCheckbox && !isSelect && !isNumber && !isColor,
			choices: isSelect
				? Object.entries(config.choices).map(([choice, label]) => ({
					value: choice,
					label: localize(label),
					selected: String(choice) === String(value)
				}))
				: [],
			min: config.range?.min ?? (isNumber ? 0 : null),
			max: config.range?.max ?? null,
			step: config.range?.step ?? (isNumber ? 1 : null)
		};
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);

		// Arrow keys, Home and End move between the tabs, as in any other list of tabs.
		const tabs = Array.from(this.element.querySelectorAll(".mbs-tab"));
		for (const tab of tabs) {
			tab.addEventListener("keydown", (event) => {
				const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
				if (!step && event.key !== "Home" && event.key !== "End") return;
				event.preventDefault();
				const i = tabs.indexOf(tab);
				const next = event.key === "Home" ? tabs[0]
					: event.key === "End" ? tabs.at(-1)
						: tabs[(i + step + tabs.length) % tabs.length];
				next.focus();
				next.click();
			});
		}
	}

	/**
	 * Show another tab, keeping whatever has been changed but not yet saved.
	 *
	 * @this {MonsterBlocksSettings}
	 * @param {PointerEvent} event
	 * @param {HTMLElement} target
	 */
	static #onSelectTab(event, target) {
		this.#tab = target.dataset.tab;
		for (const el of this.element.querySelectorAll("[data-tab]")) {
			const active = el.dataset.tab === this.#tab;
			el.classList.toggle("active", active);
			if (el.getAttribute("role") === "tab") {
				el.setAttribute("aria-selected", String(active));
				el.tabIndex = active ? 0 : -1;
			}
		}
	}

	/**
	 * Put the settings on the tab being shown back to their defaults. Nothing is saved until Save.
	 *
	 * @this {MonsterBlocksSettings}
	 */
	static #onResetDefaults() {
		const panel = this.element.querySelector(`.mbs-panel[data-tab="${this.#tab}"]`);
		for (const input of panel?.querySelectorAll("[name]") ?? []) {
			if (input.disabled) continue;
			const config = MonsterBlocksSettings.config(input.name);
			if (!config) continue;
			if (input.type === "checkbox") input.checked = Boolean(config.default);
			else input.value = config.default ?? "";
		}
	}

	/**
	 * Save every changed setting the user is allowed to change.
	 *
	 * @this {MonsterBlocksSettings}
	 * @param {SubmitEvent} event
	 * @param {HTMLFormElement} form
	 * @param {FormDataExtended} formData
	 */
	static async #onSubmit(event, form, formData) {
		const data = formData?.object ?? {};
		for (const [key, raw] of Object.entries(data)) {
			const config = MonsterBlocksSettings.config(key);
			if (!config) continue;
			if (!MonsterBlocksSettings.isPersonal(config) && !game.user.isGM) continue;
			let value = raw;
			if (config.type === Boolean) value = Boolean(raw);
			else if (config.type === Number) {
				value = Number(raw);
				if (!Number.isFinite(value)) continue;
				if (config.range) value = Math.min(config.range.max ?? value, Math.max(config.range.min ?? value, value));
			}
			else if (config.type === String) value = String(raw ?? "");
			let current;
			try {
				current = game.settings.get(NAMESPACE, key);
			}
			catch (e) {
				current = undefined;
			}
			if (value === current) continue;
			await game.settings.set(NAMESPACE, key, value);
		}
	}
}
