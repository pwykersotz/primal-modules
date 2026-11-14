import MonsterBlock5e, { SHEET_ID } from "./scripts/dnd5e/MonsterBlock5e.js";
import MonsterBlockPane from "./scripts/dnd5e/MonsterBlockPane.js";
import PartySheet from "./scripts/dnd5e/PartySheet.js";
import { Panel } from "./scripts/DockedPanel.js";
import { debug } from "./scripts/utilities.js";
import Flags5e from "./scripts/dnd5e/Flags5e.js";
import MonsterBlocksSettings from "./scripts/SettingsConfig.js";
import { MODULE_ID } from "./scripts/constants.js";
import { migrateSettings } from "./scripts/migration.js";


Hooks.once("init", () => {
	Handlebars.registerHelper(MonsterBlock5e.handlebarsHelpers); // Register all the helpers needed for Handlebars

	foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "dnd5e", MonsterBlock5e, {
		types: ["npc"],
		makeDefault: false,
		label: "MOBLOKS5E.MonsterBlocks"
	});

	console.log(`Primal Monster Blocks | %cInitialized.`, "color: orange");
});

Hooks.once("setup", () => {
	if (debug.INFO) console.debug("Primal Monster Blocks | Registering Settings");

	// All the settings live in one window, grouped into tabs, rather than in one long list in
	// Configure Settings.
	game.settings.registerMenu(MODULE_ID, "settings", {
		name: "MOBLOKS5E.config.menu.name",
		label: "MOBLOKS5E.config.menu.label",
		hint: "MOBLOKS5E.config.menu.hint",
		icon: "fa-solid fa-sliders",
		type: MonsterBlocksSettings,
		restricted: false
	});

	Object.entries(Flags5e.flagDefaults)
		.filter(([, d]) => !d.hidden)
		.forEach(([name, details]) =>
			game.settings.register(Flags5e.scope, details.setting || name, {
				name: `MOBLOKS5E.${name}.settings.name`,
				hint: `MOBLOKS5E.${name}.settings.hint`,
				scope: "world",
				config: false,
				type: details.type,
				default: details.default,
				onChange: () => MonsterBlock5e.renderAll()
			}
		)
	);

	game.settings.register(MODULE_ID, "confirm-delete", {
		onChange: () => MonsterBlock5e.renderAll(),
		name: "MOBLOKS5E.confirm-delete.settings.name",
		hint: "MOBLOKS5E.confirm-delete.settings.hint",
		scope: "world",
		config: false,
		type: Boolean,
		default: true
	});

	game.settings.register(MODULE_ID, "auto-proficiency", {
		name: "MOBLOKS5E.auto-proficiency.settings.name",
		hint: "MOBLOKS5E.auto-proficiency.settings.hint",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	game.settings.register(MODULE_ID, "compact-skills", {
		onChange: () => MonsterBlock5e.renderAll(),
		name: "MOBLOKS5E.compact-skills.settings.name",
		hint: "MOBLOKS5E.compact-skills.settings.hint",
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});

	game.settings.register(MODULE_ID, "max-height-offset", {
		onChange: () => MonsterBlock5e.renderAll(),
		name: "MOBLOKS5E.max-height-offset.settings.name",
		hint: "MOBLOKS5E.max-height-offset.settings.hint",
		scope: "world",
		config: false,
		type: Number,
		range: {
			min: 0,
			max: 670,
			step: 1
		},
		default: 72
	});

	// Each user chooses for themselves whether selecting a token shows its stat block in a side pane.
	game.settings.register(MODULE_ID, "pane-on-select", {
		name: "MOBLOKS5E.pane-on-select.settings.name",
		hint: "MOBLOKS5E.pane-on-select.settings.hint",
		scope: "client",
		config: false,
		type: Boolean,
		default: false,
		onChange: () => refreshPanel()
	});

	// The GM decides whether players can use the party sheet at all.
	game.settings.register(MODULE_ID, "party-for-players", {
		name: "MOBLOKS5E.party-for-players.settings.name",
		hint: "MOBLOKS5E.party-for-players.settings.hint",
		scope: "world",
		config: false,
		type: Boolean,
		default: false,
		onChange: () => refreshPanel()
	});

	// The GM's changes to who is in the party: creatures added by hand, and players' characters taken out.
	game.settings.register(MODULE_ID, "party-roster", {
		scope: "world",
		config: false,
		type: Object,
		default: { added: [], removed: [] },
		onChange: () => refreshParty()
	});

	game.settings.register(MODULE_ID, "party-active-only", {
		name: "MOBLOKS5E.party-active-only.settings.name",
		hint: "MOBLOKS5E.party-active-only.settings.hint",
		scope: "world",
		config: false,
		type: Boolean,
		default: false,
		onChange: () => refreshParty()
	});

	game.settings.register(MODULE_ID, "party-on-select", {
		name: "MOBLOKS5E.party-on-select.settings.name",
		hint: "MOBLOKS5E.party-on-select.settings.hint",
		scope: "client",
		config: false,
		type: Boolean,
		default: false,
		onChange: () => refreshPanel()
	});

	// The party sheet's background: the Monster Blocks theme's, or the dnd5e character sheet banner
	// tinted with a color of this user's choosing (as the Tidy 5e sheets do with their accent color).
	game.settings.register(MODULE_ID, "party-background", {
		name: "MOBLOKS5E.party-background.settings.name",
		hint: "MOBLOKS5E.party-background.settings.hint",
		scope: "client",
		config: false,
		type: String,
		choices: {
			theme: "MOBLOKS5E.party-background.theme",
			banner: "MOBLOKS5E.party-background.banner"
		},
		default: "theme",
		onChange: () => refreshParty()
	});

	game.settings.register(MODULE_ID, "party-background-color", {
		name: "MOBLOKS5E.party-background-color.settings.name",
		hint: "MOBLOKS5E.party-background-color.settings.hint",
		scope: "client",
		config: false,
		type: String,
		default: "#741b2b",
		onChange: () => refreshParty()
	});

	game.settings.register(MODULE_ID, "party-columns", {
		name: "MOBLOKS5E.party-columns.settings.name",
		hint: "MOBLOKS5E.party-columns.settings.hint",
		scope: "client",
		config: false,
		type: String,
		choices: {
			"0": "MOBLOKS5E.party-columns.auto",
			"1": "MOBLOKS5E.party-columns.one",
			"2": "MOBLOKS5E.party-columns.two",
			"3": "MOBLOKS5E.party-columns.three"
		},
		default: "0",
		onChange: () => { if (Panel.current instanceof PartySheet) Panel.current.fitToContent(); }
	});

	game.settings.register(MODULE_ID, "hide-hotbar", {
		name: "MOBLOKS5E.hide-hotbar.settings.name",
		hint: "MOBLOKS5E.hide-hotbar.settings.hint",
		scope: "client",
		config: false,
		type: String,
		choices: {
			never: "MOBLOKS5E.hide-hotbar.never",
			panel: "MOBLOKS5E.hide-hotbar.panel",
			always: "MOBLOKS5E.hide-hotbar.always"
		},
		default: "never",
		onChange: () => {
			Panel.applyHotbar();
			Panel.current?.fitToContent?.();
		}
	});

	game.settings.register(MODULE_ID, "pane-side", {
		name: "MOBLOKS5E.pane-side.settings.name",
		hint: "MOBLOKS5E.pane-side.settings.hint",
		scope: "client",
		config: false,
		type: String,
		choices: {
			right: "MOBLOKS5E.pane-side.right",
			left: "MOBLOKS5E.pane-side.left"
		},
		default: "right",
		// Moving to the other side needs a new column, so close the pane and show it again.
		onChange: () => Panel.hide().then(() => refreshPanel())
	});

	// The most columns a stat block may use, in the panel or in its own window. Each column makes it a
	// column wider; past the limit the stat block scrolls. "0" uses as many as fit on the screen.
	game.settings.register(MODULE_ID, "stat-block-columns", {
		name: "MOBLOKS5E.stat-block-columns.settings.name",
		hint: "MOBLOKS5E.stat-block-columns.settings.hint",
		scope: "client",
		config: false,
		type: String,
		choices: {
			"0": "MOBLOKS5E.columns.auto",
			"1": "MOBLOKS5E.columns.one",
			"2": "MOBLOKS5E.columns.two",
			"3": "MOBLOKS5E.columns.three"
		},
		default: "0",
		onChange: () => MonsterBlock5e.fitAll(Panel.current)
	});

	const themeChoices = {};
	for (const theme in MonsterBlock5e.themes)
		themeChoices[theme] = MonsterBlock5e.themes[theme].name;

	game.settings.register(MODULE_ID, "default-theme", {
		onChange: () => MonsterBlock5e.renderAll(),
		name: "MOBLOKS5E.default-theme.settings.name",
		hint: "MOBLOKS5E.default-theme.settings.hint",
		scope: "world",
		config: false,
		type: String,
		choices: themeChoices,
		default: "modern"
	});
});

Hooks.once("ready", () => {
	Panel.applyHotbar();
	// Settings saved before the module was renamed from Monster Blocks.
	migrateSettings().then((moved) => {
		if (moved.length) MonsterBlock5e.renderAll();
	});
	MonsterBlock5e.getQuickInserts();
	MonsterBlock5e.preLoadTemplates();
});

/**
 * Add a button to the header of the system's NPC sheet to switch to Monster Blocks.
 *
 * @param {ApplicationV2} sheet
 * @param {HTMLElement} element
 */
function addSwitchButton(sheet, element) {
	if (sheet instanceof MonsterBlock5e) return;
	if (sheet.document?.type !== "npc") return;
	if (!sheet.document.isOwner || sheet.document.pack) return;

	const header = sheet.window?.header ?? element?.querySelector?.(".window-header");
	if (!header || header.querySelector(".monsterblock-switch")) return;

	if (debug.INFO) console.log("Primal Monster Blocks | Adding switch button to standard sheet");

	const button = document.createElement("button");
	button.type = "button";
	button.classList.add("header-control", "icon", "fa-solid", "fa-dragon", "monsterblock-switch");
	button.dataset.tooltip = "MOBLOKS5E.SwitchToMobloks";
	button.setAttribute("aria-label", game.i18n.localize("MOBLOKS5E.SwitchToMobloks"));
	button.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		return MonsterBlock5e.switchSheetTo(SHEET_ID, sheet.document);
	});

	const anchor = header.querySelector('[data-action="toggleControls"], [data-action="close"]');
	if (anchor) anchor.before(button);
	else header.append(button);
}

Hooks.on("renderNPCActorSheet", addSwitchButton);

/* -------------------------------------------- */
/*  Stat block pane for the selected token      */
/* -------------------------------------------- */

/**
 * Show the selected token in the panel: a monster's stat block, or the party sheet for a player
 * character (if that option is on). Otherwise close the panel.
 */
async function refreshPanel() {
	const actor = canvas.tokens?.controlled?.at(-1)?.actor;
	if (MonsterBlockPane.enabled) {
		if (MonsterBlockPane.canShow(actor)) {
			return Panel.show(`actor:${actor.uuid}`, () => new MonsterBlockPane({ document: actor }));
		}
		if (PartySheet.enabled && actor?.type === "character") {
			return Panel.show("party", () => new PartySheet());
		}
	}
	return Panel.hide();
}

// Selecting a token releases the old one and controls the new one; wait for both before updating the panel.
let paneTimer = null;
function schedulePaneRefresh() {
	clearTimeout(paneTimer);
	paneTimer = setTimeout(() => refreshPanel().catch(err => console.error("Primal Monster Blocks | Stat block panel", err)), 50);
}

Hooks.on("controlToken", () => {
	if (MonsterBlockPane.enabled || Panel.current) schedulePaneRefresh();
});
Hooks.on("canvasTearDown", () => Panel.hide());

// Re-fit the panel when the screen size changes or the sidebar opens or closes.
let paneDockTimer = null;
function redockPane() {
	clearTimeout(paneDockTimer);
	paneDockTimer = setTimeout(() => Panel.current?.fitToContent?.(), 100);
}
Hooks.on("collapseSidebar", redockPane);
Hooks.once("ready", () => window.addEventListener("resize", redockPane));

// A button in the Token controls turns the pane on and off, like the 5e.tools Panel's button.
// Handles both the v13+ object form of the controls and the older array form.
Hooks.on("getSceneControlButtons", (controls) => {
	const tool = {
		name: "monsterblock-pane",
		title: "MOBLOKS5E.pane-on-select.toggle",
		icon: "fa-solid fa-dragon",
		button: true,
		visible: true
	};
	const toggle = async () => {
		const on = !MonsterBlockPane.enabled;
		await game.settings.set(MODULE_ID, "pane-on-select", on);
		ui.notifications.info(game.i18n.localize(on ? "MOBLOKS5E.pane-on-select.on" : "MOBLOKS5E.pane-on-select.off"));
	};
	try {
		if (Array.isArray(controls)) {
			const tokens = controls.find((c) => c.name === "token");
			tokens?.tools.push({ ...tool, onClick: toggle });
		}
		else {
			const tokens = controls.tokens ?? controls.token;
			if (tokens?.tools) {
				tokens.tools[tool.name] = { ...tool, order: Object.keys(tokens.tools).length + 1, onChange: toggle };
			}
		}
	}
	catch (err) {
		console.warn("Primal Monster Blocks | Could not add the stat block pane button", err);
	}
});

// Keep the party sheet up to date as characters change (hit points, conditions, levels, assignments).
let partyTimer = null;
function refreshParty() {
	if (!(Panel.current instanceof PartySheet)) return;
	clearTimeout(partyTimer);
	partyTimer = setTimeout(() => {
		if (Panel.current instanceof PartySheet && Panel.current.rendered) Panel.current.render();
	}, 100);
}
const partyActor = (actor) => PartySheet.isMember(actor);
Hooks.on("updateActor", (actor) => { if (partyActor(actor)) refreshParty(); });
// A creature added from a token that isn't linked to its actor changes with the token, and goes with it.
Hooks.on("updateToken", (token) => { if (partyActor(token.actor)) refreshParty(); });
for (const hook of ["deleteToken", "deleteActor"]) {
	Hooks.on(hook, (doc) => { if (PartySheet.roster.added.some(uuid => uuid.includes(doc.id))) refreshParty(); });
}
// Players' characters come and go with their players, if the GM chose that.
Hooks.on("userConnected", () => { if (PartySheet.activeOnly) refreshParty(); });

// The GM can add creatures to the party, or take them out, from the Actors list's right-click menu…
Hooks.on("getActorContextOptions", (app, options) => {
	if (foundry.applications.sidebar?.apps?.Compendium && app instanceof foundry.applications.sidebar.apps.Compendium) return;
	const actorOf = (li) => game.actors.get(li?.dataset?.entryId);
	options.push({
		label: "MOBLOKS5E.party.add",
		icon: "fa-solid fa-user-plus",
		visible: (li) => game.user.isGM && Boolean(actorOf(li)) && !PartySheet.includes(actorOf(li)),
		onClick: (event, li) => PartySheet.addMember(actorOf(li))
	}, {
		label: "MOBLOKS5E.party.remove",
		icon: "fa-solid fa-user-minus",
		visible: (li) => game.user.isGM && PartySheet.includes(actorOf(li)),
		onClick: (event, li) => PartySheet.removeMember(actorOf(li)?.uuid)
	});
});

// …and from a token's HUD, which works for tokens that aren't linked to an actor (summons, hirelings) too.
Hooks.on("renderTokenHUD", (hud, html) => {
	if (!game.user?.isGM) return;
	const actor = hud.object?.actor ?? hud.document?.actor;
	const root = html instanceof HTMLElement ? html : html?.[0];
	const column = root?.querySelector(".col.left") ?? root?.querySelector(".col");
	if (!actor || !column) return;
	column.querySelector(".pmb-party-toggle")?.remove();
	const inParty = PartySheet.includes(actor);
	const label = game.i18n.localize(inParty ? "MOBLOKS5E.party.remove" : "MOBLOKS5E.party.add");
	const button = document.createElement("button");
	button.type = "button";
	button.className = `control-icon pmb-party-toggle${inParty ? " active" : ""}`;
	button.dataset.tooltip = label;
	button.setAttribute("aria-label", label);
	button.setAttribute("aria-pressed", String(inParty));
	button.innerHTML = `<i class="fa-solid ${inParty ? "fa-user-minus" : "fa-user-plus"}" inert></i>`;
	button.addEventListener("click", async (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (inParty) await PartySheet.removeMember(actor.uuid);
		else await PartySheet.addMember(actor);
		hud.render?.();
	});
	column.append(button);
});
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "createItem", "updateItem", "deleteItem"]) {
	// An effect can be on the character or on one of their items.
	Hooks.on(hook, (doc) => {
		const parent = doc.parent?.documentName === "Item" ? doc.parent.actor : doc.parent;
		if (partyActor(parent)) refreshParty();
	});
}
Hooks.on("updateUser", (user, changes) => { if ("character" in changes) refreshParty(); });
// Effects' time left changes as combat moves on and as game time passes.
for (const hook of ["updateCombat", "deleteCombat", "updateWorldTime"]) Hooks.on(hook, () => refreshParty());

Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
	registerPackageDebugFlag(MODULE_ID, "level");
	if (debug.INFO) console.log(`Primal Monster Blocks | Debug level: ${debug.level}`);
});
