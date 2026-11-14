import { DockedMixin, Panel } from "../DockedPanel.js";
import MonsterBlock5e from "./MonsterBlock5e.js";
import { MODULE_ID, MODULE_PATH } from "../constants.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/** Conditions that take a character out of the fight, shown in solid red. */
const SEVERE = new Set(["dead", "unconscious", "paralyzed", "petrified", "stunned", "incapacitated", "dying"]);

/** Statuses that aren't harmful, shown in blue instead of red. */
const NEUTRAL = new Set([
	"invisible", "dodging", "flying", "hovering", "hiding", "ethereal", "stable", "burrowing",
	"concentrating", "transformed", "marked", "blessed", "hasted", "inspired"
]);

/**
 * How much of the middle of Foundry's interface (the canvas between the scene controls and the
 * sidebar) the party sheet leaves when it needs more room to show everyone without scrolling.
 */
const PARTY_MIDDLE = 120;

/** Icons for the movement types other than walking. */
const MOVEMENT_ICONS = { fly: "fa-feather", swim: "fa-water", climb: "fa-mountain", burrow: "fa-person-digging" };

/**
 * The party sheet shown in the panel when a player character's token is selected: the core
 * information of every player's assigned character, one card each, with their conditions and the
 * effects on them.
 *
 * @export
 * @class PartySheet
 */
export default class PartySheet extends DockedMixin(HandlebarsApplicationMixin(ApplicationV2)) {
	/** @override */
	static DEFAULT_OPTIONS = {
		id: "monsterblock-party",
		classes: ["monsterblock", "monsterblock-pane", "monsterblock-party"],
		position: {
			width: 406,
			height: 400
		},
		window: {
			title: "MOBLOKS5E.party.title",
			icon: "fa-solid fa-users",
			minimizable: false,
			resizable: false,
			controls: [
				{
					action: "resetParty",
					icon: "fa-solid fa-arrow-rotate-left",
					label: "MOBLOKS5E.party.reset",
					visible: PartySheet.#canReset
				}
			]
		},
		actions: {
			openSheet: PartySheet.#onOpenSheet,
			openEffect: PartySheet.#onOpenEffect,
			removeMember: PartySheet.#onRemoveMember,
			resetParty: PartySheet.#onResetParty
		}
	};

	/** @override */
	static PARTS = {
		party: {
			template: `${MODULE_PATH}/templates/dnd5e/party.hbs`
		}
	};

	/** Characters whose passive effects list is open. */
	#passiveOpen = new Set();

	/** Whether this user may use the party sheet: the GM always can, players only if the GM allows it. */
	static get allowed() {
		if (game.user?.isGM) return true;
		try {
			return Boolean(game.settings.get(MODULE_ID, "party-for-players"));
		}
		catch (e) {
			return false;
		}
	}

	/** Whether this user wants (and may use) the party sheet when a player character is selected. */
	static get enabled() {
		if (!this.allowed) return false;
		try {
			return Boolean(game.settings.get(MODULE_ID, "party-on-select"));
		}
		catch (e) {
			return false;
		}
	}

	/**
	 * The GM's changes to the party: creatures added by hand, and players' characters taken out.
	 * Both are lists of actor UUIDs (a token's own actor, for a token that isn't linked to one).
	 *
	 * @type {{added: string[], removed: string[]}}
	 */
	static get roster() {
		let roster = null;
		try {
			roster = game.settings.get(MODULE_ID, "party-roster");
		}
		catch (e) { /* not registered */ }
		const list = (value) => (Array.isArray(value) ? value.filter(v => typeof v === "string") : []);
		return { added: list(roster?.added), removed: list(roster?.removed) };
	}

	/** Whether players' characters only join the party while their player is logged in. */
	static get activeOnly() {
		try {
			return Boolean(game.settings.get(MODULE_ID, "party-active-only"));
		}
		catch (e) {
			return false;
		}
	}

	/** The player whose assigned character this is, if any. */
	static assignedTo(actor) {
		if (actor?.type !== "character") return null;
		return game.users.find(u => u.character && u.character.uuid === actor.uuid) ?? null;
	}

	/** The player a creature belongs to: whoever it's assigned to, or failing that a player who owns it. */
	static playerOf(actor) {
		return this.assignedTo(actor)
			?? game.users.find(u => !u.isGM && actor.testUserPermission?.(u, "OWNER"))
			?? null;
	}

	/**
	 * Everyone in the party that this user can at least see: each player's assigned character
	 * (unless the GM took it out, or its player is away and only logged-in players count), and every
	 * creature the GM added by hand.
	 *
	 * @return {{actor: Actor5e, user: User|null, added: boolean}[]}
	 */
	static members() {
		const { added, removed } = this.roster;
		const activeOnly = this.activeOnly;
		const seen = new Set();
		const members = [];
		const join = (actor, user, byHand) => {
			if (!actor || actor.documentName !== "Actor" || seen.has(actor.uuid)) return;
			if (!actor.testUserPermission(game.user, "LIMITED")) return;
			seen.add(actor.uuid);
			members.push({ actor, user, added: byHand });
		};
		for (const user of game.users) {
			const actor = user.character;
			if (!actor || actor.type !== "character" || removed.includes(actor.uuid)) continue;
			if (activeOnly && !user.active) continue;
			join(actor, user, false);
		}
		for (const uuid of added) {
			let actor = null;
			try {
				actor = fromUuidSync(uuid);
			}
			catch (e) { /* gone */ }
			if (actor) join(actor, this.playerOf(actor), true);
		}
		return members.sort((a, b) => a.actor.name.localeCompare(b.actor.name));
	}

	/** Whether an actor is in the party, or would be if its player were logged in. */
	static isMember(actor) {
		if (!actor) return false;
		if (this.roster.added.includes(actor.uuid)) return true;
		return game.users.some(u => u.character?.id === actor.id);
	}

	/**
	 * Whether a player's character joins the party by itself: its player is logged in, or it doesn't
	 * matter whether they are.
	 *
	 * @param {Actor5e} actor
	 * @return {boolean}
	 */
	static #joinsByItself(actor) {
		if (actor?.type !== "character") return false;
		const players = game.users.filter(u => u.character && u.character.uuid === actor.uuid);
		if (!players.length) return false;
		return !this.activeOnly || players.some(u => u.active);
	}

	/** Whether this creature shows in the party: added by hand, or a player's character that joins by itself. */
	static includes(actor) {
		if (!actor) return false;
		const { added, removed } = this.roster;
		if (added.includes(actor.uuid)) return true;
		return !removed.includes(actor.uuid) && this.#joinsByItself(actor);
	}

	/**
	 * Add a creature to the party (the GM only). A player's character the GM took out comes back;
	 * one that's missing because its player isn't logged in is added by hand, so it shows anyway.
	 *
	 * @param {Actor5e} actor
	 * @return {Promise<boolean>} Whether the party changed
	 */
	static async addMember(actor) {
		if (!game.user?.isGM || actor?.documentName !== "Actor" || this.includes(actor)) return false;
		const { added, removed } = this.roster;
		const uuid = actor.uuid;
		const next = { added: added.slice(), removed: removed.filter(u => u !== uuid) };
		if (!this.#joinsByItself(actor)) next.added.push(uuid);
		await game.settings.set(MODULE_ID, "party-roster", next);
		return true;
	}

	/**
	 * Take a creature out of the party (the GM only).
	 *
	 * @param {string} uuid - The actor's UUID
	 * @return {Promise<boolean>} Whether the party changed
	 */
	static async removeMember(uuid) {
		if (!game.user?.isGM || !uuid) return false;
		const { added, removed } = this.roster;
		const assigned = game.users.some(u => u.character?.type === "character" && u.character.uuid === uuid);
		const next = { added: added.filter(u => u !== uuid), removed: removed.slice() };
		if (assigned && !removed.includes(uuid)) next.removed.push(uuid);
		if (next.added.length === added.length && next.removed.length === removed.length) return false;
		await game.settings.set(MODULE_ID, "party-roster", next);
		return true;
	}

	/** Whether the GM has changed the party from just the players' characters. */
	static #canReset() {
		if (!game.user?.isGM) return false;
		const { added, removed } = PartySheet.roster;
		return Boolean(added.length || removed.length);
	}

	/**
	 * The configuration of a status effect. dnd5e keeps these as an object keyed by id; older
	 * setups keep them as an array.
	 *
	 * @param {string} id
	 * @return {object|null}
	 */
	static statusConfig(id) {
		const all = CONFIG.statusEffects;
		if (!all) return null;
		if (Array.isArray(all)) return all.find(e => e.id === id) ?? null;
		return all[id] ?? Object.values(all).find(e => e?.id === id) ?? null;
	}

	/** dnd5e's rich tooltip for a document, if dnd5e is there to provide it. */
	static #richTooltip(uuid) {
		if (!uuid) return null;
		try {
			return globalThis.dnd5e?.utils?.loadingTooltip?.({ uuid }) ?? null;
		}
		catch (e) {
			return null;
		}
	}

	/**
	 * The number of columns this user has chosen for the party sheet, or 0 to fit everyone.
	 *
	 * @return {number}
	 */
	static get columns() {
		try {
			return Number(game.settings.get(MODULE_ID, "party-columns")) || 0;
		}
		catch (e) {
			return 0;
		}
	}

	/**
	 * This user's choice of background: whether it's the character sheet banner, and its color.
	 *
	 * @type {{banner: boolean, color: string}}
	 */
	static get background() {
		let choice = "theme";
		let color = "";
		try {
			choice = game.settings.get(MODULE_ID, "party-background");
			color = game.settings.get(MODULE_ID, "party-background-color");
		}
		catch (e) { /* not registered */ }
		// Only a plain color, since it goes straight into the sheet's style.
		const valid = typeof color === "string" && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\))$/i.test(color.trim());
		return { banner: choice === "banner", color: valid ? color.trim() : "#741b2b" };
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		// Descriptions pop out towards the canvas, beside what's hovered rather than over it.
		this.tooltipDirection = Panel.side === "left" ? "RIGHT" : "LEFT";
		context.members = this.constructor.members().map(m => this.#memberData(m));
		// Only the GM decides who's in the party.
		context.canEdit = Boolean(game.user?.isGM);
		context.empty = game.i18n.localize(context.canEdit ? "MOBLOKS5E.party.emptyGM" : "MOBLOKS5E.party.empty");
		return context;
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		if (!game.user?.isGM) return;

		// The GM can drop actors from the Actors list onto the sheet to add them to the party.
		const el = this.element;
		const isActorDrag = (event) => Array.from(event.dataTransfer?.types ?? []).includes("text/plain");
		el.addEventListener("dragover", (event) => {
			if (!isActorDrag(event)) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = "copy";
			el.classList.add("party-drop-target");
		});
		el.addEventListener("dragleave", (event) => {
			if (!el.contains(event.relatedTarget)) el.classList.remove("party-drop-target");
		});
		el.addEventListener("drop", (event) => {
			el.classList.remove("party-drop-target");
			event.preventDefault();
			this.#onDrop(event);
		});
	}

	/**
	 * Add the actor dropped on the sheet to the party.
	 *
	 * @param {DragEvent} event
	 */
	async #onDrop(event) {
		let data = null;
		try {
			const TextEditor = foundry.applications?.ux?.TextEditor?.implementation;
			data = TextEditor?.getDragEventData
				? TextEditor.getDragEventData(event)
				: JSON.parse(event.dataTransfer.getData("text/plain"));
		}
		catch (e) {
			return;
		}
		if (data?.type !== "Actor" || !data.uuid) return;
		const actor = await fromUuid(data.uuid);
		if (!actor || actor.documentName !== "Actor") return;
		if (actor.pack) {
			ui.notifications?.warn(game.i18n.localize("MOBLOKS5E.party.fromCompendium"));
			return;
		}
		await this.constructor.addMember(actor);
	}

	/**
	 * The condensed core information for one character.
	 *
	 * @param {{actor: Actor5e, user: User|null, added: boolean}} member
	 * @return {object}
	 */
	#memberData({ actor, user, added }) {
		const system = actor.system ?? {};
		const attr = system.attributes ?? {};
		const signed = (n) => (Number(n) >= 0 ? `+${Number(n)}` : `${Number(n)}`);
		const localize = (k) => game.i18n.localize(k);

		const hp = attr.hp ?? {};
		const max = Number(hp.effectiveMax ?? hp.max) || 0;
		const value = Number(hp.value) || 0;
		const temp = Number(hp.temp) || 0;
		const pct = max ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
		const tempPct = max ? Math.min(100, Math.round((temp / max) * 100)) : 0;
		const statuses = new Set(actor.statuses ?? []);
		const dead = statuses.has("dead");
		const state = value <= 0 ? "down" : (pct <= 50 ? "bloodied" : "healthy");

		const character = actor.type === "character";
		let classes = Object.values(actor.classes ?? {})
			.sort((a, b) => (b.system?.levels ?? 0) - (a.system?.levels ?? 0))
			.map(c => `${c.name} ${c.system?.levels ?? ""}`.trim())
			.join(" / ");
		// A creature added by hand: its challenge rating instead of classes.
		const cr = system.details?.cr;
		if (!character && !classes && cr !== undefined && cr !== null && cr !== "") {
			let label = cr;
			try {
				label = globalThis.dnd5e?.utils?.formatCR?.(cr) ?? cr;
			}
			catch (e) { /* keep the number */ }
			classes = `${localize("MOBLOKS5E.party.cr")} ${label}`;
		}

		const { effects, passive, covered, conditionDurations } = this.#effects(actor);
		const conditions = this.#conditions(statuses, covered, conditionDurations);

		const exhaustionLevel = Number(attr.exhaustion) || 0;
		const exhaustionMax = Number(CONFIG.DND5E?.conditionTypes?.exhaustion?.levels) || 6;
		const pips = (filled, total) => Array.from({ length: total }, (_, i) => i < filled);

		const movement = this.#movement(attr.movement);

		return {
			uuid: actor.uuid,
			name: actor.name,
			img: actor.img,
			level: character ? (Number(system.details?.level) || null) : null,
			player: !user || user.isGM ? "" : user.name,
			color: user ? (user.color?.css ?? user.color ?? "") : "",
			added,
			classes,
			observer: actor.testUserPermission(game.user, "OBSERVER"),
			dead,
			hp: {
				value, max, pct, temp, tempPct, state,
				icon: dead ? "fa-skull" : (state === "down" ? "fa-heart-crack" : "fa-heart")
			},
			ac: attr.ac?.value ?? "—",
			init: signed(attr.init?.total ?? attr.init?.mod ?? 0),
			walk: movement.walk,
			speed: movement.text,
			movement: movement.other,
			spellDC: attr.spellcasting ? attr.spell?.dc : null,
			passive: {
				prc: system.skills?.prc?.passive,
				ins: system.skills?.ins?.passive,
				inv: system.skills?.inv?.passive
			},
			conditions,
			effects,
			passiveEffects: passive,
			passiveOpen: this.#passiveOpen.has(actor.uuid),
			hasStatus: Boolean(conditions.length || effects.length || passive.length),
			exhaustion: exhaustionLevel
				? { level: exhaustionLevel, pips: pips(exhaustionLevel, Math.max(exhaustionMax, exhaustionLevel)) }
				: null,
			inspiration: Boolean(attr.inspiration),
			death: character && value <= 0 && max > 0 && !dead
				? { success: pips(attr.death?.success ?? 0, 3), failure: pips(attr.death?.failure ?? 0, 3) }
				: null
		};
	}

	/**
	 * Whether an effect is just a condition being on (Prone, Poisoned, Bloodied…), which is shown
	 * as a condition rather than as an effect.
	 *
	 * @param {ActiveEffect} effect
	 * @param {string[]} statuses
	 * @return {boolean}
	 */
	#isConditionEffect(effect, statuses) {
		if (effect.type === "condition") return true;
		if (!statuses.length) return false;
		return statuses.some((id) => {
			const config = this.constructor.statusConfig(id);
			if (!config) return false;
			return effect.id === config._id
				|| effect.name === config.name
				|| effect.name === game.i18n.localize(config.name ?? "");
		});
	}

	/**
	 * The effects on a character: the ones to show (temporary effects, concentration, and anything
	 * put on the character directly), and the passive effects from their features and items.
	 *
	 * @param {Actor5e} actor
	 * @return {{effects: object[], passive: object[], covered: Set<string>, conditionDurations: Map<string, string>}}
	 */
	#effects(actor) {
		const concentrating = CONFIG.specialStatusEffects?.CONCENTRATING ?? "concentrating";
		const shown = new Map();
		const passive = new Map();
		const covered = new Set();
		const conditionDurations = new Map();

		let all = [];
		try {
			all = Array.from(actor.allApplicableEffects?.() ?? actor.effects ?? []);
		}
		catch (e) {
			all = [];
		}

		for (const effect of all) {
			if (!effect || effect.disabled || effect.isSuppressed || effect.isConcealed) continue;
			if (effect.duration?.expired) continue;
			const statuses = Array.from(effect.statuses ?? []);
			const concentration = statuses.includes(concentrating);

			// A condition on its own is shown with the conditions, with its time left if it has one.
			if (!concentration && this.#isConditionEffect(effect, statuses)) {
				const { text } = this.#duration(effect);
				if (text) for (const id of statuses) conditionDurations.set(id, text);
				continue;
			}

			const fromItem = effect.parent?.documentName === "Item";
			const temporary = Boolean(effect.isTemporary) || concentration;
			const row = this.#effectRow(effect, actor, { statuses, concentration, temporary, concentrating });
			const list = (!temporary && fromItem) ? passive : shown;
			if (list === shown) for (const id of statuses) covered.add(id);

			const key = [row.name, row.img, row.duration, row.subtitle].join("|");
			const same = list.get(key);
			if (same) {
				same.count++;
				same.countLabel = `×${same.count}`;
			}
			else list.set(key, row);
		}

		const order = (a, b) => (b.concentration - a.concentration)
			|| (b.temporary - a.temporary)
			|| a.name.localeCompare(b.name);
		return {
			effects: Array.from(shown.values()).sort(order),
			passive: Array.from(passive.values()).sort(order),
			covered,
			conditionDurations
		};
	}

	/**
	 * One effect, ready to show.
	 *
	 * @param {ActiveEffect} effect
	 * @param {Actor5e} actor
	 * @param {object} info
	 * @return {object}
	 */
	#effectRow(effect, actor, { statuses, concentration, temporary, concentrating }) {
		const localize = (k) => game.i18n.localize(k);
		const img = effect.img || "icons/svg/aura.svg";
		let name = effect.name ?? "";

		// "Concentrating: Bless" reads as Bless, marked as concentration.
		if (concentration) {
			const prefix = `${localize("EFFECT.DND5E.StatusConcentrating")}: `;
			if (name.startsWith(prefix)) name = name.slice(prefix.length);
			else if (name.startsWith("Concentrating: ")) name = name.slice("Concentrating: ".length);
		}

		const imposes = statuses
			.filter(id => id !== concentrating)
			.map(id => this.constructor.statusConfig(id))
			.filter(Boolean)
			.map(config => localize(config.name ?? config.label ?? config.id))
			.filter(n => n && n.toLowerCase() !== name.toLowerCase());

		const subtitle = [
			concentration ? localize("MOBLOKS5E.party.concentrating") : "",
			this.#effectSource(effect, actor, name)
		].filter(Boolean).join(" · ");

		const { text, special } = this.#duration(effect);
		return {
			uuid: effect.uuid,
			name,
			img,
			svg: /\.svg($|\?)/i.test(img),
			subtitle,
			imposes,
			duration: text,
			durationIcon: special ? "fa-hourglass-half" : "fa-clock",
			temporary,
			concentration,
			count: 1,
			countLabel: "",
			tooltip: PartySheet.#richTooltip(effect.uuid),
			tooltipDirection: this.tooltipDirection
		};
	}

	/**
	 * Where an effect came from: the spell or feature, and who used it if it wasn't this character.
	 *
	 * @param {ActiveEffect} effect
	 * @param {Actor5e} actor
	 * @param {string} name     - The name the effect is shown with
	 * @return {string}
	 */
	#effectSource(effect, actor, name) {
		try {
			if (effect.parent?.documentName === "Item") {
				return effect.parent.name && effect.parent.name !== name ? effect.parent.name : "";
			}
			const origin = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
			const item = origin?.documentName === "Item" ? origin : (origin?.item ?? null);
			const caster = effect.getSourceActor?.()
				?? (origin?.documentName === "Actor" ? origin : (item?.actor ?? origin?.actor ?? null));
			const parts = [];
			if (item?.name && !name.includes(item.name)) parts.push(item.name);
			if (caster?.name && caster.id !== actor.id) parts.push(caster.name);
			return parts.join(" · ");
		}
		catch (e) {
			return "";
		}
	}

	/**
	 * How long an effect has left, the way dnd5e shows it on character sheets.
	 *
	 * @param {ActiveEffect} effect
	 * @return {{text: string, special: boolean}}
	 */
	#duration(effect) {
		try {
			effect.updateDuration?.();
		}
		catch (e) { /* show what's there */ }
		const duration = effect.duration ?? {};
		let parts = [];
		let special = false;
		try {
			const supports = effect.expirySupportsDuration?.() ?? true;
			if (!supports || Number.isFinite(duration.value)) {
				special = Boolean(effect.getSpecialDurationParts?.());
				parts = special ? [duration.label] : (effect.getDurationParts?.() ?? []);
			}
		}
		catch (e) {
			parts = [];
		}
		parts = parts.filter(p => typeof p === "string" && p.trim());
		return { text: parts.slice(0, 2).join(", "), special };
	}

	/**
	 * The conditions on a character, apart from exhaustion (shown on its own) and the ones an
	 * effect shown on the card already accounts for.
	 *
	 * @param {Set<string>} statuses
	 * @param {Set<string>} covered
	 * @param {Map<string, string>} durations
	 * @return {object[]}
	 */
	#conditions(statuses, covered, durations) {
		const localize = (k) => game.i18n.localize(k);
		const conditions = [];
		for (const id of statuses) {
			if (id === "exhaustion" || covered.has(id)) continue;
			const config = this.constructor.statusConfig(id);
			if (!config) continue;
			const img = config.img ?? config.icon ?? "";
			conditions.push({
				id,
				name: localize(config.name ?? config.label ?? id),
				img,
				svg: /\.svg($|\?)/i.test(img),
				tone: SEVERE.has(id) ? "severe" : (NEUTRAL.has(id) ? "neutral" : "harmful"),
				duration: durations.get(id) ?? "",
				tooltip: PartySheet.#richTooltip(config.reference),
				tooltipDirection: this.tooltipDirection
			});
		}
		const rank = { severe: 0, harmful: 1, neutral: 2 };
		return conditions.sort((a, b) => (rank[a.tone] - rank[b.tone]) || a.name.localeCompare(b.name));
	}

	/**
	 * Walking speed on its own, the other movement types, and the whole speed as text.
	 *
	 * @param {object} movement - dnd5e movement data
	 * @return {{walk: string, other: object[], text: string}}
	 */
	#movement(movement = {}) {
		const units = movement.units ?? "ft";
		const unitLabel = CONFIG.DND5E.movementUnits?.[units]?.abbreviation ?? units;
		const walk = Number(movement.walk) || 0;
		const other = [];
		for (const [key, config] of Object.entries(CONFIG.DND5E.movementTypes ?? {})) {
			if (key === "walk") continue;
			const value = Number(movement[key]) || 0;
			if (!value) continue;
			const label = game.i18n.localize(config?.label ?? config ?? key);
			other.push({ key, label, value: `${value} ${unitLabel}`, icon: MOVEMENT_ICONS[key] ?? "fa-shoe-prints" });
		}
		const text = [
			walk ? `${walk} ${unitLabel}` : "",
			...other.map(o => `${o.label.toLowerCase()} ${o.value}`)
		].filter(Boolean).join(", ");
		return { walk: walk ? `${walk} ${unitLabel}` : "—", other, text: text || "—" };
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);

		// Use the world's default Monster Blocks theme.
		const themes = MonsterBlock5e.themes;
		let theme = "default";
		try { theme = game.settings.get(MODULE_ID, "default-theme") ?? "default"; }
		catch (e) { /* not registered */ }
		for (const t of Object.values(themes)) if (t.class) this.element.classList.remove(t.class);
		const cls = themes[theme]?.class || themes.default.class;
		if (cls) this.element.classList.add(cls);

		// Or this user's choice of the character sheet banner, tinted with their color.
		const { banner, color } = this.constructor.background;
		this.element.classList.toggle("party-banner", banner);
		if (banner) this.element.style.setProperty("--party-banner-color", color);
		else this.element.style.removeProperty("--party-banner-color");

		// Remember which passive effect lists are open, and refit the columns when one opens or closes.
		for (const details of this.element.querySelectorAll("details.party-passive")) {
			details.addEventListener("toggle", () => {
				const uuid = details.closest("[data-uuid]")?.dataset.uuid;
				if (uuid) {
					if (details.open) this.#passiveOpen.add(uuid);
					else this.#passiveOpen.delete(uuid);
				}
				this.fitToContent();
			});
		}

		this.fitToContent();
		requestAnimationFrame(() => this.fitToContent());
		for (const img of this.element.querySelectorAll("img")) {
			if (!img.complete) img.addEventListener("load", () => this.fitToContent(), { once: true });
		}
	}

	/**
	 * Fit the panel's width to the party cards' columns at the full height of the screen. Unless the
	 * user has chosen a number of columns, it uses as few as it takes to show everyone without
	 * scrolling, narrowing Foundry's interface further than a stat block would if it has to.
	 */
	fitToContent() {
		if (!this.element?.isConnected || !this.docked) return;
		const columns = this.constructor.columns;
		this.fitDocked(".party-body", columns
			? { columns }
			: { maxWidth: Panel.availableWidth({ middle: PARTY_MIDDLE }) });
	}

	/**
	 * Open a character's own sheet.
	 *
	 * @this {PartySheet}
	 * @param {PointerEvent} event
	 * @param {HTMLElement} target
	 */
	static async #onOpenSheet(event, target) {
		const actor = await fromUuid(target.closest("[data-uuid]")?.dataset.uuid);
		actor?.sheet?.render(true);
	}

	/**
	 * Take a creature out of the party (the GM only).
	 *
	 * @this {PartySheet}
	 * @param {PointerEvent} event
	 * @param {HTMLElement} target
	 */
	static async #onRemoveMember(event, target) {
		event.stopPropagation();
		await PartySheet.removeMember(target.closest("[data-uuid]")?.dataset.uuid);
	}

	/**
	 * Go back to a party of just the players' characters, after asking (the GM only).
	 *
	 * @this {PartySheet}
	 */
	static async #onResetParty() {
		if (!game.user?.isGM) return;
		const confirmed = await foundry.applications.api.DialogV2.confirm({
			window: { title: "MOBLOKS5E.party.reset" },
			content: `<p>${game.i18n.localize("MOBLOKS5E.party.resetConfirm")}</p>`
		});
		if (confirmed) await game.settings.set(MODULE_ID, "party-roster", { added: [], removed: [] });
	}

	/**
	 * Open an effect's sheet.
	 *
	 * @this {PartySheet}
	 * @param {PointerEvent} event
	 * @param {HTMLElement} target
	 */
	static async #onOpenEffect(event, target) {
		const uuid = target.closest("[data-effect-uuid]")?.dataset.effectUuid;
		if (!uuid) return;
		const effect = await fromUuid(uuid);
		effect?.sheet?.render(true);
	}
}
