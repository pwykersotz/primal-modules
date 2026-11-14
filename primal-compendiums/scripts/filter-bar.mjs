import { loc } from "./constants.mjs";
import {
  CR_STEPS, filtersFor, countActive, isFiltering, withPick, withBound, withoutFilters, tallyFacet, choicesFrom,
  formatCR, normalizeState
} from "./filter-logic.mjs";
import { getFilterState, setFilterState } from "./state.mjs";

/**
 * The filter and sort bar under a directory's search box: a row with Filters, the sort and its direction, and,
 * when Filters is open, a panel of tags (creature type, rarity, source...) and ranges (CR) to filter by.
 *
 * One bar per side of each directory (the world side and the Compendiums side), each with its own state, kept on
 * this device. The bar is built once and moved back into the header each time the directory re-draws, so it
 * survives re-renders. It only holds and shows the state: the directory side does the filtering, when told to
 * through onChange.
 */
export class FilterBar {
  /**
   * @param {object} options
   * @param {string} options.tab            The sidebar tab ("actors").
   * @param {"world"|"packs"} options.side
   * @param {string} options.documentName   "Actor", "Item", ...
   * @param {Function} options.onChange     Called with (state, previous) after every change.
   */
  constructor({ tab, side, documentName, onChange }) {
    this.tab = tab;
    this.side = side;
    this.documentName = documentName;
    this.def = filtersFor(documentName);
    this.state = normalizeState(getFilterState(tab, side), documentName);
    this.#onChange = onChange;
    this.element = this.#build();
    this.#renderRow();
    this.#renderBody();
  }

  /** @type {Function} */
  #onChange;

  /** The records of the entries on show, for the tags and their counts. */
  #records = [];

  /** The tag counts of those records, by facet, kept until the records change. */
  #tallies = { records: null, facets: new Map() };

  /** How many entries show, of how many, after the last filtering. */
  #counts = { shown: 0, total: 0, searching: false };

  /** Whether compendium details are being read. */
  #loading = false;

  /** Whether this kind of directory has anything to filter by. */
  get hasFacets() {
    return this.def.facets.length > 0;
  }

  /* -------------------------------------------- */

  /**
   * Put the bar in a directory's header, right under its search box.
   * @param {HTMLElement|null} header
   */
  mount(header) {
    if ( !header ) return;
    const search = header.querySelector(":scope > search");
    const anchor = search ?? header.lastElementChild;
    if ( (this.element.parentElement === header) && (this.element.previousElementSibling === anchor) ) return;
    if ( anchor ) anchor.after(this.element);
    else header.append(this.element);
  }

  /**
   * Show the result of the latest filtering.
   * @param {object} result
   * @param {object[]} result.records   Every entry's record. Hand over the same list again if nothing changed.
   * @param {number} result.shown
   * @param {number} result.total
   * @param {boolean} [result.searching]  Whether a search is narrowing the list too.
   */
  update({ records, shown, total, searching = false }) {
    this.#records = records ?? [];
    this.#counts = { shown, total, searching };
    this.#renderBody();
  }

  /** Show or hide the "reading compendium details" note. */
  setLoading(loading) {
    if ( this.#loading === loading ) return;
    this.#loading = loading;
    this.#renderBody();
  }

  /* -------------------------------------------- */
  /*  Changes                                     */
  /* -------------------------------------------- */

  /**
   * Move to a new state: show it, remember it, and tell the directory.
   * @param {object} next
   */
  async set(next) {
    const previous = this.state;
    this.state = next;
    this.#renderRow();
    this.#renderBody();
    const saving = setFilterState(this.tab, this.side, next);
    try {
      await this.#onChange?.(next, previous);
    } catch(err) {
      console.error("primal-compendiums | Filtering failed", err);
    }
    await saving;
  }

  /* -------------------------------------------- */
  /*  Building                                    */
  /* -------------------------------------------- */

  /** Build the bar's element and its listeners (once). */
  #build() {
    const el = document.createElement("div");
    el.className = "pcs-filters";
    el.dataset.side = this.side;
    el.innerHTML = `<div class="pcs-filter-row"></div><div class="pcs-filter-options"></div>
      <div class="pcs-filter-body"></div>`;

    el.addEventListener("click", event => {
      const target = event.target.closest("button");
      if ( !target || !el.contains(target) ) return;
      event.preventDefault();
      event.stopPropagation();
      if ( target.classList.contains("pcs-filter-toggle") ) return this.set({ ...this.state, open: !this.state.open });
      if ( target.classList.contains("pcs-sort-dir") ) return this.set({ ...this.state, desc: !this.state.desc });
      if ( target.classList.contains("pcs-clear") ) return this.set(withoutFilters(this.state));
      if ( target.classList.contains("pcs-pill") ) {
        return this.set(withPick(this.state, target.dataset.facet, target.dataset.value));
      }
    });

    // Right-click a tag to exclude it straight away (or clear it if it is excluded).
    el.addEventListener("contextmenu", event => {
      const pill = event.target.closest(".pcs-pill");
      if ( !pill ) return;
      event.preventDefault();
      event.stopPropagation();
      const current = this.state.sets[pill.dataset.facet]?.[pill.dataset.value];
      return this.set(withPick(this.state, pill.dataset.facet, pill.dataset.value, current === -1 ? undefined : -1));
    });

    el.addEventListener("change", event => {
      const box = event.target.closest("input.pcs-flat-box");
      if ( box ) {
        event.stopPropagation();
        return this.set({ ...this.state, flat: box.checked });
      }
      const select = event.target.closest("select");
      if ( !select ) return;
      event.stopPropagation();
      if ( select.classList.contains("pcs-sort") ) return this.set({ ...this.state, sort: select.value });
      if ( select.dataset.range ) {
        const value = select.value === "" ? null : Number(select.value);
        return this.set(withBound(this.state, select.dataset.range, Number(select.dataset.end), value));
      }
    });
    return el;
  }

  /** The row: Filters, the sort, its direction. */
  #renderRow() {
    const row = this.element.querySelector(".pcs-filter-row");
    const state = this.state;
    const active = countActive(state);
    this.element.classList.toggle("pcs-open", !!state.open && this.hasFacets);
    this.element.classList.toggle("pcs-filtering", active > 0);

    const parts = [];
    if ( this.hasFacets ) {
      parts.push(`<button type="button" class="pcs-filter-toggle" aria-expanded="${!!state.open}"
        data-tooltip="${esc(loc("Filter.ToggleHint"))}">
        <i class="fa-solid fa-filter" inert></i><span>${esc(loc("Filter.Toggle"))}</span>
        ${active ? `<span class="pcs-badge">${active}</span>` : ""}
        <i class="fa-solid fa-caret-down pcs-caret" inert></i></button>`);
    }
    const options = ["", ...this.def.sorts].map(id => {
      const label = loc(`Filter.Sorts.${id || "default"}`);
      return `<option value="${id}" ${id === state.sort ? "selected" : ""}>${esc(label)}</option>`;
    }).join("");
    parts.push(`<select class="pcs-sort" aria-label="${esc(loc("Filter.SortBy"))}"
      data-tooltip="${esc(loc("Filter.SortBy"))}">${options}</select>`);
    const desc = !!state.desc;
    const dirLabel = loc(desc ? "Filter.Descending" : "Filter.Ascending");
    parts.push(`<button type="button" class="pcs-sort-dir" ${state.sort ? "" : "disabled"}
      data-tooltip="${esc(dirLabel)}" aria-label="${esc(dirLabel)}" aria-pressed="${desc}">
      <i class="fa-solid ${desc ? "fa-arrow-down-wide-short" : "fa-arrow-down-short-wide"}" inert></i></button>`);
    row.innerHTML = parts.join("");

    // The line under the row: ignore folders.
    const line = this.element.querySelector(".pcs-filter-options");
    const hint = loc(this.side === "packs" ? "Filter.FlatHintPacks" : "Filter.FlatHint");
    line.innerHTML = `<label class="pcs-flat" data-tooltip="${esc(hint)}">
      <input type="checkbox" class="pcs-flat-box" ${state.flat ? "checked" : ""}>
      <span>${esc(loc("Filter.Flat"))}</span></label>`;
    this.element.classList.toggle("pcs-is-flat", !!state.flat);
  }

  /**
   * How many records have each value of a facet. Counted once for a list of records: a directory side that hands
   * over the same list again (the Compendiums side does, with tens of thousands of records) costs nothing more.
   * @param {string} facet
   * @returns {Map}
   */
  #tally(facet) {
    if ( this.#tallies.records !== this.#records ) this.#tallies = { records: this.#records, facets: new Map() };
    let tally = this.#tallies.facets.get(facet);
    if ( !tally ) {
      tally = tallyFacet(this.#records, facet);
      this.#tallies.facets.set(facet, tally);
    }
    return tally;
  }

  /** The panel: tags and ranges, with how many entries show. */
  #renderBody() {
    const body = this.element.querySelector(".pcs-filter-body");
    const state = this.state;
    if ( !this.hasFacets || !state.open ) {
      body.hidden = true;
      body.innerHTML = "";
      return;
    }
    body.hidden = false;
    if ( this.#loading ) {
      body.innerHTML = `<p class="pcs-filter-note"><i class="fa-solid fa-spinner fa-spin" inert></i>
        ${esc(loc("Filter.Loading"))}</p>`;
      return;
    }

    const groups = [];
    for ( const facet of this.def.facets ) {
      const label = esc(loc(`Filter.Facets.${facet.id}`));
      if ( facet.kind === "range" ) {
        const has = this.#records.some(r => Number.isFinite(r?.[facet.id]));
        const bounds = state.range[facet.id] ?? [null, null];
        if ( !has && (bounds[0] === null) && (bounds[1] === null) ) continue;
        const select = end => {
          const current = bounds[end];
          const opts = [`<option value="">${esc(loc("Filter.Any"))}</option>`]
            .concat(CR_STEPS.map(v => `<option value="${v}" ${v === current ? "selected" : ""}>${formatCR(v)}</option>`));
          const aria = loc(end ? "Filter.RangeTo" : "Filter.RangeFrom", { label: loc(`Filter.Facets.${facet.id}`) });
          return `<select data-range="${facet.id}" data-end="${end}" aria-label="${esc(aria)}">${opts.join("")}</select>`;
        };
        groups.push(`<div class="pcs-facet pcs-facet-range" data-facet="${facet.id}">
          <span class="pcs-facet-label">${label}</span>
          <div class="pcs-range">${select(0)}<span class="pcs-range-to">${esc(loc("Filter.To"))}</span>${select(1)}</div>
        </div>`);
        continue;
      }
      const picks = state.sets[facet.id] ?? {};
      const choices = choicesFrom(this.#tally(facet.id), picks);
      if ( !choices.length ) continue;
      const pills = choices.map(c => {
        const pick = picks[c.value];
        const st = pick === 1 ? "yes" : (pick === -1 ? "no" : "off");
        const tip = [c.title, loc(`Filter.Pill.${st}`)].filter(Boolean).join(" · ");
        return `<button type="button" class="pcs-pill" data-facet="${facet.id}" data-value="${esc(c.value)}"
          data-state="${st}" aria-pressed="${pick === 1 ? "true" : (pick === -1 ? "mixed" : "false")}"
          data-tooltip="${esc(tip)}"><span class="pcs-pill-label">${esc(c.label)}</span>
          <span class="pcs-pill-count">${c.count}</span></button>`;
      }).join("");
      groups.push(`<div class="pcs-facet" data-facet="${facet.id}">
        <span class="pcs-facet-label">${label}</span><div class="pcs-pills">${pills}</div></div>`);
    }

    if ( !groups.length ) {
      body.innerHTML = `<p class="pcs-filter-note">${esc(loc("Filter.Nothing"))}</p>`;
      return;
    }

    const { shown, total, searching } = this.#counts;
    const narrowed = isFiltering(state) || searching;
    const scroll = body.scrollTop;
    body.innerHTML = `<p class="pcs-filter-hint">${esc(loc("Filter.Hint"))}</p>${groups.join("")}
      <div class="pcs-filter-foot">
        <span class="pcs-shown">${narrowed ? esc(loc("Filter.Shown", { shown, total })) : ""}</span>
        <button type="button" class="pcs-clear" ${isFiltering(state) ? "" : "disabled"}>
          <i class="fa-solid fa-filter-circle-xmark" inert></i><span>${esc(loc("Filter.Clear"))}</span></button>
      </div>`;
    body.scrollTop = scroll;
  }
}

/** Escape text for HTML. */
function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
