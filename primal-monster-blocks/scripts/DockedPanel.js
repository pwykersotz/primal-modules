import PopupHandler from "./PopupHandler.js";
import { MODULE_ID } from "./constants.js";

/** The id of the panel element fixed to the screen edge. */
export const PANEL_ID = "monsterblock-panel";

/** The 5e.tools Panel module, which docks its own panel on the left of the screen. */
const FIVETOOLS_ID = "fivetools-panel";

/**
 * The panel fixed to the edge of the screen for its full height that shows the selected token's
 * stat block, or the party sheet. Like the 5e.tools Panel, it moves Foundry's interface over by its
 * width so nothing is hidden underneath it, and it works alongside that panel: on the left it sits
 * to the right of the 5e.tools panel, and the interface is moved by both panels' widths.
 *
 * Only one sheet is shown in the panel at a time.
 */
export class Panel {
	/**
	 * The sheet in the panel, if any.
	 *
	 * @type {ApplicationV2|null}
	 */
	static current = null;

	/** The interface's own inline position, saved before it was first moved, to put back on close. */
	static #savedInterface = null;

	/** Whether this module has moved the interface. */
	static #shifted = false;

	static #observer = null;

	/** "right" (the default) or "left" (beside the 5e.tools panel when it's open). */
	static get side() {
		try {
			return game.settings.get(MODULE_ID, "pane-side") === "left" ? "left" : "right";
		}
		catch (e) {
			return "right";
		}
	}

	/** When this user hides Foundry's hotbar: "never", "panel" (while the panel is open) or "always". */
	static get hotbarMode() {
		try {
			const mode = game.settings.get(MODULE_ID, "hide-hotbar");
			return ["panel", "always"].includes(mode) ? mode : "never";
		}
		catch (e) {
			return "never";
		}
	}

	/** Hide or show Foundry's hotbar to match the setting (the styles do the rest as the panel opens and closes). */
	static applyHotbar() {
		const mode = this.hotbarMode;
		document.body.classList.toggle("pmb-hotbar-always", mode === "always");
		document.body.classList.toggle("pmb-hotbar-panel", mode === "panel");
	}

	/**
	 * Show a sheet in the panel, replacing the one that's there.
	 *
	 * @param {string} key         - Identifies what is shown, so the same thing isn't opened twice
	 * @param {Function} create    - Creates the sheet to show
	 * @return {Promise<ApplicationV2>}
	 */
	static async show(key, create) {
		const open = this.current;
		if (open && open.panelKey === key && open.rendered) return open;
		if (open) {
			// Keep the panel and the interface where they are while the sheet is swapped.
			open._keepPanel = true;
			await open.close({ animate: false });
		}
		const app = create();
		app.panelKey = key;
		this.current = app;
		await app.render({ force: true });
		return app;
	}

	/**
	 * Close whatever is in the panel and remove the panel.
	 */
	static async hide() {
		const open = this.current;
		this.current = null;
		if (open?.rendered) await open.close({ animate: false });
		this.removePanel();
	}

	/**
	 * The panel element fixed to the screen edge, created when needed.
	 *
	 * @return {HTMLElement}
	 */
	static getPanel() {
		let panel = document.getElementById(PANEL_ID);
		if (!panel) {
			panel = document.createElement("section");
			panel.id = PANEL_ID;
			document.body.append(panel);
		}
		panel.dataset.side = this.side;
		this.#watchLayout();
		return panel;
	}

	/** Remove the panel once it's empty and put the interface back. */
	static removePanel() {
		const panel = document.getElementById(PANEL_ID);
		if (panel && !panel.querySelector(".application")) panel.remove();
		this.applyLayout();
	}

	/**
	 * The 5e.tools panel: how wide it is when open, and how far it moves the interface
	 * (only when its "push the interface" setting is on).
	 *
	 * @return {{width: number, push: number, present: boolean}}
	 */
	static fivetools() {
		const el = document.getElementById(FIVETOOLS_ID);
		if (!el) return { width: 0, push: 0, present: false };
		const open = el.classList.contains("open") && document.body.classList.contains("fet-open");
		const width = open ? Math.round(el.getBoundingClientRect().width) : 0;
		let push = false;
		if (open) {
			try { push = Boolean(game.settings.get(FIVETOOLS_ID, "pushUI")); }
			catch (e) { push = false; }
		}
		return { width, push: push ? width : 0, present: true };
	}

	/**
	 * Place the panel and move Foundry's interface so that nothing is underneath it, including the
	 * room the 5e.tools panel takes on the left.
	 */
	static applyLayout() {
		const panel = document.getElementById(PANEL_ID);
		const open = Boolean(panel?.querySelector(".application"));
		const width = open ? Math.round(panel.getBoundingClientRect().width) : 0;
		const fet = this.fivetools();
		const side = panel?.dataset.side ?? this.side;

		if (panel) {
			const left = side === "left" ? `${fet.width}px` : "";
			if (panel.style.left !== left) panel.style.left = left;
		}
		document.body.classList.toggle("monsterblock-panel-open", open);

		const ui = document.getElementById("interface");
		if (!ui) return;
		if (!open && !this.#shifted) return;

		if (!this.#shifted) {
			this.#savedInterface = { left: ui.style.left, marginLeft: ui.style.marginLeft, width: ui.style.width };
		}

		let want;
		if (open) {
			const left = side === "left" ? fet.width + width : fet.push;
			const right = side === "right" ? width : 0;
			want = this.#interfaceStyle(ui, left, right);
			this.#shifted = true;
		}
		else {
			// Hand the interface back: to the 5e.tools panel's layout if it's installed, otherwise as it was.
			want = fet.present
				? this.#interfaceStyle(ui, fet.push, 0)
				: (this.#savedInterface ?? { left: "", marginLeft: "", width: "" });
			this.#shifted = false;
			this.#savedInterface = null;
		}
		for (const [key, value] of Object.entries(want)) {
			if (ui.style[key] !== value) ui.style[key] = value;
		}
	}

	/** Inline style for the interface moved right by `left` and narrowed by `left + right` (as the 5e.tools panel does). */
	static #interfaceStyle(ui, left, right) {
		const pos = getComputedStyle(ui).position;
		const prop = pos === "absolute" || pos === "fixed" ? "left" : "marginLeft";
		const style = { left: "", marginLeft: "", width: "" };
		if (left) style[prop] = `${left}px`;
		if (left || right) style.width = `calc(100% - ${left + right}px)`;
		return style;
	}

	/** Re-apply the layout whenever the 5e.tools panel (or anything else) changes the interface. */
	static #watchLayout() {
		if (this.#observer) return;
		this.#observer = new MutationObserver(() => {
			if (document.getElementById(PANEL_ID) || this.#shifted) this.applyLayout();
		});
		const ui = document.getElementById("interface");
		if (ui) this.#observer.observe(ui, { attributes: true, attributeFilter: ["style"] });
		this.#observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
		const fet = document.getElementById(FIVETOOLS_ID);
		if (fet) this.#observer.observe(fet, { attributes: true, attributeFilter: ["style", "class"] });
	}

	/**
	 * The widest the panel may be: whatever is left after the 5e.tools panel and enough of the
	 * interface for the scene controls, the sidebar and the hotbar.
	 *
	 * @param {object} [options]
	 * @param {number} [options.middle] - Keep only this much of the middle of the interface (the
	 *                                    canvas and hotbar) instead of room for the whole hotbar
	 * @return {number}
	 */
	static availableWidth({ middle } = {}) {
		const width = (id) => document.getElementById(id)?.getBoundingClientRect().width ?? 0;
		const sides = width("ui-left") + width("ui-right");
		// No room needs keeping for the hotbar while it's hidden (it always is while the panel is open, unless set to never).
		const hotbar = this.hotbarMode === "never" ? width("hotbar") : 0;
		const keep = Number.isFinite(middle)
			? sides + middle
			: Math.max(400, sides + Math.max(320, hotbar + 16));
		return Math.max(300, window.innerWidth - this.fivetools().width - keep);
	}
}

/**
 * Makes an application live in the panel instead of floating as a window.
 *
 * @param {typeof ApplicationV2} Base
 * @return {typeof ApplicationV2}
 */
export function DockedMixin(Base) {
	return class DockedApplication extends Base {
		/**
		 * Put the sheet in the panel instead of floating it as a window.
		 *
		 * @override
		 */
		_insertElement(element) {
			const panel = Panel.getPanel();
			element.classList.add("docked");
			panel.replaceChildren(element);
			this.docked = true;
		}

		/**
		 * In the panel, only the width is set (on the panel); it can't be moved or dragged.
		 *
		 * @override
		 */
		setPosition(position = {}) {
			if (!this.docked || !this.element) return super.setPosition(position);
			if (Number.isFinite(position?.width)) {
				this.position.width = position.width;
				const panel = this.element.parentElement;
				if (panel?.id === PANEL_ID) panel.style.width = `${Math.round(position.width)}px`;
			}
			for (const prop of ["left", "top", "width", "height", "transform"]) this.element.style.removeProperty(prop);
			Panel.applyLayout();
			return this.position;
		}

		/** @override */
		async close(options) {
			if (Panel.current === this) Panel.current = null;
			const keep = this._keepPanel;
			this._keepPanel = false;
			const result = await super.close(options);
			if (!keep) Panel.removePanel();
			return result;
		}

		/**
		 * Fit the panel's width to the sheet's columns at the full height of the screen.
		 *
		 * @param {string} layoutSelector    - The element whose children are laid out in columns
		 * @param {object} [options]
		 * @param {number} [options.maxWidth] - The widest the panel may be
		 * @param {number} [options.columns]  - Use exactly this many columns
		 * @param {number} [options.maxColumns] - Use at most this many columns, scrolling beyond that
		 */
		fitDocked(layoutSelector, { maxWidth, columns, maxColumns } = {}) {
			if (!this.element?.isConnected) return;
			this._monsterblockPositioned = true;

			// Let the panel grow with the sheet while it's measured, rather than holding it to the last
			// sheet's width (the fit sets the panel's new width at the end).
			const panel = this.element.parentElement;
			if (panel?.id === PANEL_ID) panel.style.width = "";

			const popup = new PopupHandler(
				this,
				layoutSelector,
				this.options.position?.width ?? 406,
				window.innerHeight,
				8,
				1,
				{ maxWidth: maxWidth ?? Panel.availableWidth(), columns, maxColumns }
			);
			popup.fix();

			// The panel decides the sheet's size; the fit only needed it to work out the columns.
			for (const prop of ["width", "height"]) this.element.style.removeProperty(prop);
		}
	};
}
