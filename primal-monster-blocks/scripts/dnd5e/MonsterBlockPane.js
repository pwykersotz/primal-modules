import MonsterBlock5e from "./MonsterBlock5e.js";
import { DockedMixin } from "../DockedPanel.js";
import { MODULE_ID } from "../constants.js";

/**
 * The Monster Blocks stat block of the selected token, shown in the panel at the edge of the
 * screen. It is the same sheet as the normal Monster Blocks window, so editing, rolling and the
 * cog menu all work the same way, and the panel is exactly as wide as the stat block's columns need.
 *
 * @export
 * @class MonsterBlockPane
 * @extends {MonsterBlock5e}
 */
export default class MonsterBlockPane extends DockedMixin(MonsterBlock5e) {
	/** @override */
	static DEFAULT_OPTIONS = {
		classes: ["monsterblock-pane"],
		window: {
			minimizable: false
		}
	};

	/** Whether this user has turned the panel on. */
	static get enabled() {
		try {
			return Boolean(game.settings.get(MODULE_ID, "pane-on-select"));
		}
		catch (e) {
			return false;
		}
	}

	/**
	 * Whether a stat block can be shown in the panel for this actor.
	 *
	 * @param {Actor5e} actor
	 * @return {boolean}
	 */
	static canShow(actor) {
		if (actor?.type !== "npc") return false;
		return actor.testUserPermission(game.user, "OBSERVER");
	}

	/**
	 * Fit the panel's width to the stat block's columns at the full height of the screen.
	 *
	 * @override
	 */
	fitToContent() {
		if (!this.element?.isConnected) return;
		if (!this.docked) return super.fitToContent();
		this.fitDocked(".monsterblock-body", { maxColumns: MonsterBlock5e.maxColumns });
	}
}
