/**
 * A class to handle the sizing of a popup box like a character sheet.
 *
 * Updated for ApplicationV2: sizes are measured from the DOM and applied
 * through `Application#setPosition` so the core window manager stays in sync.
 *
 * @class PopupHandler
 */
export default class PopupHandler {
	/**
	 * Creates an instance of PopupHandler.
	 * @param {ApplicationV2} application - A reference to an application such as a character sheet
	 * @param {string} layoutselector     - A CSS selector that selects the main container for the layout
	 * @param {number} defaultWidth       - The starting width of the popup
	 * @param {number} defaultHeight      - The maximum height of the popup
	 * @param {number} padding            - The padding around the popup content
	 * @param {number} scale              - The CSS transform scale to set on this sheet
	 * @param {object} [options]
	 * @param {number} [options.maxWidth]  - The widest the popup may be, by default the width of the screen
	 * @param {number} [options.columns]   - Use exactly this many columns instead of as many as the content needs
	 * @param {number} [options.maxColumns] - Never use more than this many columns; beyond that the sheet scrolls
	 * @memberof PopupHandler
	 */
	constructor(application, layoutselector, defaultWidth, defaultHeight, padding, scale, { maxWidth, columns, maxColumns } = {}) {
		this.application = application;
		this.maxWidth = maxWidth;
		this.columns = Number(columns) > 0 ? Math.floor(Number(columns)) : null;
		this.columnLimit = Number(maxColumns) > 0 ? Math.floor(Number(maxColumns)) : null;
		this.padding = padding;
		/** @type {HTMLElement} */
		this.element = application.element;
		this._height = defaultHeight;
		this._width = defaultWidth;
		this._scale = scale || 1;

		/** @type {HTMLElement} */
		this.container = this.element.querySelector(layoutselector);
		this.layout = this.container ? Array.from(this.container.children) : [];
	}

	get computedWidth() { return parseFloat(window.getComputedStyle(this.element).width); }
	get position() { return this.application.position; }

	/**
	 * The gap between columns in pixels.
	 *
	 * @readonly
	 * @memberof PopupHandler
	 */
	get columnGap() {
		if (!this.container) return 0;
		const gap = parseFloat(window.getComputedStyle(this.container).columnGap);
		return Number.isFinite(gap) ? gap : 0;
	}

	/**
	 * Returns the largest offset from the left side of the layout
	 * that any element's right edge has (this is the maximum width of the layout).
	 *
	 * @readonly
	 * @memberof PopupHandler
	 */
	get layoutWidth() {
		const left = this.container.getBoundingClientRect().left;
		return this.layout.reduce((width, el) => {
			const right = el.getBoundingClientRect().right - left;
			return right > width ? right : width;
		}, 0);
	}

	/**
	 * Returns the greatest offset from the top of the window
	 * of any element's bottom (this is the maximum height of the layout).
	 *
	 * @readonly
	 * @memberof PopupHandler
	 */
	get layoutHeight() {
		const top = this.element.getBoundingClientRect().top;
		return this.layout.reduce((height, el) => {
			// The bottom of the bounding rectangle is the *real* lowest point of the rendered element,
			// even if the element is split between multiple columns.
			const bottom = el.getBoundingClientRect().bottom - top;
			return bottom > height ? bottom : height;
		}, 46);
	}

	getWidthCSSString(columns) {
		const gaps = columns - 1;
		const gap = gaps ? `+ var(--column-gap) * ${gaps}` : "";

		return `calc(var(--column-width) * ${columns} ${gap} + var(--window-padding) * 2)`;
	}

	/**
	 * Number of columns the content currently spills into at the current width.
	 *
	 * @return {number}
	 */
	measureColumns() {
		const baseWidth = this.container.getBoundingClientRect().width;
		const gap = this.columnGap;
		return Math.max(1, Math.ceil((this.layoutWidth + gap - 2) / (baseWidth + gap)));
	}

	/**
	 * How wide each column actually is when the layout has this many.
	 *
	 * @param {number} columns
	 * @return {number}
	 */
	columnSpace(columns) {
		return (this.container.clientWidth - this.columnGap * (columns - 1)) / columns;
	}

	fix() {
		if (!this.container) return;
		const style = this.container.style;

		// Remove any scaling and previously fixed column count so that measurements are accurate.
		this.element.style.transform = "";
		style.columnCount = "";
		style.columnWidth = "";
		style.height = "";

		// Start with a single column at the maximum height, so the column layout overflows to the right.
		this.element.style.width = this.getWidthCSSString(1);
		this.element.style.height = `${this._height}px`;

		// How wide one column is, to check later that more columns haven't been squeezed into less room.
		const columnWidth = this.container.clientWidth;

		// Never make the window wider than the screen (or the space it's given); beyond that the sheet scrolls instead.
		const oneColumn = this.computedWidth;
		const gap = this.columnGap;
		const available = Math.min(window.innerWidth - 20, this.maxWidth ?? Infinity);
		const fitColumns = Math.max(1, Math.floor((available - oneColumn) / (oneColumn - this.padding * 2 + gap)) + 1);
		const maxColumns = Math.min(fitColumns, this.columnLimit ?? Infinity);

		let columns = this.columns ?? Math.min(this.measureColumns(), maxColumns);

		// Fix the column count explicitly. Relying on the browser to fit "as many columns as will fit"
		// meant that rounding the window width down by a fraction of a pixel (or a scrollbar appearing)
		// dropped a column, and the rest of the stat block was cut off at the bottom of the window.
		const applyColumns = (n) => {
			style.columnWidth = "auto";
			style.columnCount = String(n);
			// A few pixels of slack absorb rounding and thin scrollbars.
			this.element.style.width = `calc(${this.getWidthCSSString(n)} + 4px)`;
		};
		applyColumns(columns);

		// If the balanced columns still overflow the maximum height, add columns until everything fits.
		const content = this.element.querySelector(".window-content") ?? this.container;
		if (!this.columns) {
			while (columns < maxColumns && content.scrollHeight > content.clientHeight + 1) applyColumns(++columns);
		}

		// Never squeeze the columns: if something stops the window getting wide enough for them all,
		// use fewer columns and let the sheet scroll instead.
		if (columnWidth > 0) {
			while (columns > 1 && this.columnSpace(columns) < columnWidth * 0.9) applyColumns(--columns);
		}

		// At the column limit, let the columns grow taller and the window scroll, rather than hiding
		// overflow columns off to the right.
		style.height = "";
		const overflowsSideways = () => this.layoutWidth > this.container.getBoundingClientRect().width + 2;
		if (overflowsSideways()) style.height = "auto";

		const width = Math.ceil(this.computedWidth);

		// Once the layout is balanced, we can correct the height to match it.
		const height = Math.min(this._height, Math.ceil(this.layoutHeight + this.padding));
		this.element.style.height = `${height}px`;

		const position = { width, height };

		// On the first fit, keep the sheet centered on where it was opened.
		if (!this.application._monsterblockPositioned) {
			const left = this.position.left ?? 0;
			const top = this.position.top ?? 0;
			const startWidth = this.application.options.position?.width ?? width;
			const startHeight = Number(this.application.options.position?.height) || height;
			position.left = Math.max(0, left - ((width - startWidth) / 2));
			position.top = Math.max(0, top - ((height - startHeight) / 2));
			this.application._monsterblockPositioned = true;
		}

		if (this._scale != 1) position.scale = this._scale;

		this.application.setPosition(position);
	}
}
