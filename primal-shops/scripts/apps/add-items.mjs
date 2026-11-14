/**
 * Add items (GM): pick items for a shop list from the world's items or any item compendium, with filters (name, kind,
 * rarity, magic or not, source book, folder, price), every match ticked to start with.
 */
import { escapeHTML as e, loc, dnd5eLabel } from "../constants.mjs";
import { CATEGORIES, RARITIES, SORTS, categoryOf, matchesFilter, sortRows } from "../catalog.mjs";
import { parsePrice, toCp } from "../money.mjs";
import { WORLD, itemSources, loadSource } from "../sources.mjs";
import { rates } from "../store.mjs";
import { money } from "../trade.mjs";
import { options } from "../views.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** How many matches the window lists at most (all of them are still added). */
const SHOW_MAX = 600;

let LAST_SOURCE = WORLD;
let LAST_SORT = "nameUp";

/** @param {object} v */
export function renderAddItems(v) {
  const L = v.labels;
  const chips = (name, list) => list.map(c => `
    <label class="ps-chip${c.checked ? " checked" : ""}"><input type="checkbox" name="${name}" value="${e(c.value)}"${c.checked ? " checked" : ""}> ${e(c.label)}</label>`).join("");
  const rows = v.rows.map(r => `
      <li class="ps-pick-row rarity-${e(r.rarity || "mundane")}${r.checked ? "" : " unchecked"}${r.already ? " already" : ""}">
        <label>
          <input type="checkbox" name="pick" value="${e(r.uuid)}"${r.checked ? " checked" : ""}${r.already ? " disabled" : ""}>
          <img src="${e(r.img)}" alt="">
          <span class="ps-pick-name">${e(r.name)}${r.already ? ` <span class="ps-faint">${e(L.already)}</span>` : ""}</span>
          <span class="ps-faint">${e(r.facts)}</span>
          <span class="ps-pick-price">${e(r.price)}</span>
        </label>
      </li>`).join("");
  return `
<div class="ps-add-items${v.loading ? " busy" : ""}">
  <div class="ps-add-filters">
    <label class="ps-field"><span>${e(L.source)}</span><select name="source">${options(v.sources)}</select></label>
    <label class="ps-field ps-grow"><span>${e(L.name)}</span><input type="search" name="text" value="${e(v.filter.text)}" placeholder="${e(L.namePlaceholder)}"></label>
    <label class="ps-field"><span>${e(L.magic)}</span><select name="magic">${options(v.magic)}</select></label>
    <label class="ps-field"><span>${e(L.book)}</span><select name="book">${options(v.books)}</select></label>
    ${v.folders.length > 1 ? `<label class="ps-field"><span>${e(L.folder)}</span><select name="folder">${options(v.folders)}</select></label>` : ""}
    <label class="ps-field ps-price-range"><span>${e(L.price)}</span>
      <span><input type="text" name="minGp" value="${e(v.filter.minGp)}" placeholder="${e(L.min)}"> – <input type="text" name="maxGp" value="${e(v.filter.maxGp)}" placeholder="${e(L.max)}"></span></label>
    <label class="ps-inline"><input type="checkbox" name="priced"${v.filter.priced ? " checked" : ""}> ${e(L.priced)}</label>
  </div>
  <div class="ps-chips">${chips("category", v.categories)}</div>
  <div class="ps-chips">${chips("rarity", v.rarities)}</div>
  <div class="ps-add-head">
    <span>${e(v.countText)}</span>
    <select name="sort" aria-label="${e(L.sort)}">${options(v.sorts)}</select>
    <button type="button" class="ps-small" data-action="all">${e(L.all)}</button>
    <button type="button" class="ps-small" data-action="none">${e(L.none)}</button>
  </div>
  <ul class="ps-pick-list" data-scroll="pick">${v.loading ? `<li class="ps-faint">${e(L.loading)}</li>` : (rows || `<li class="ps-faint">${e(L.nothing)}</li>`)}</ul>
  ${v.more ? `<p class="ps-faint">${e(v.more)}</p>` : ""}
  <footer class="ps-add-foot">
    <button type="button" data-action="cancel">${e(L.cancel)}</button>
    <button type="button" class="ps-primary" data-action="confirm"${v.addCount ? "" : " disabled"}><i class="fa-solid fa-plus" inert></i> ${e(v.addText)}</button>
  </footer>
</div>`;
}

export class AddItemsDialog extends ApplicationV2 {
  /**
   * Pick items to add to a list.
   * @param {{listName: string, have: Set<string>}} options  have: UUIDs the list has already.
   * @returns {Promise<object[]|null>}  The entries picked, or null.
   */
  static pick({ listName, have }) {
    return new Promise(resolve => {
      const app = new AddItemsDialog({ listName, have, resolve });
      app.render({ force: true });
    });
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "primal-shops-add-items",
    classes: ["primal-shops-editor", "primal-shops-add"],
    tag: "div",
    window: { icon: "fa-solid fa-magnifying-glass-plus", resizable: true },
    position: { width: 820, height: 700 },
    actions: {
      all: AddItemsDialog.#onAll,
      none: AddItemsDialog.#onNone,
      cancel: AddItemsDialog.#onCancel,
      confirm: AddItemsDialog.#onConfirm
    }
  };

  constructor({ listName, have, resolve }, options={}) {
    super(options);
    this.listName = listName;
    this.have = have ?? new Set();
    this.resolve = resolve;
    this.source = itemSources().some(s => s.id === LAST_SOURCE) ? LAST_SOURCE : WORLD;
    this.records = null;
    this.filter = { text: "", categories: [], rarities: [], magic: "any", book: "", folder: "", minGp: "", maxGp: "", priced: true };
    this.unchecked = new Set();
    this.sort = LAST_SORT;
    this.load();
  }

  /** @override */
  get title() {
    return loc("Add.Title", { name: this.listName });
  }

  async load() {
    this.records = null;
    if ( this.rendered ) this.render();
    try {
      this.records = await loadSource(this.source, { fresh: this.source === WORLD });
    } catch (err) {
      ui.notifications.warn(err.message);
      this.records = [];
    }
    if ( this.rendered ) this.render();
  }

  /** The records that pass the filter. */
  #matches() {
    const r = rates();
    const f = this.filter;
    const filter = {
      text: f.text, categories: f.categories, rarities: f.rarities, magic: f.magic, book: f.book, priced: f.priced,
      minCp: (f.minGp !== "") ? parsePrice(f.minGp, r) : null,
      maxCp: (f.maxGp !== "") ? parsePrice(f.maxGp, r) : null
    };
    const matches = (this.records ?? []).filter(rec => (!f.folder || (rec.folder === f.folder)) && matchesFilter(rec.entry, filter, x => toCp(x.price, r)));
    return sortRows(matches, this.sort, { name: rec => rec.entry.name, price: rec => toCp(rec.entry.price, r) });
  }

  /** @override */
  async _prepareContext() {
    const L = k => loc(`Add.${k}`);
    const matches = this.#matches();
    const books = [...new Set((this.records ?? []).map(r => r.entry.book).filter(Boolean))].sort();
    const folders = [...new Set((this.records ?? []).map(r => r.folder).filter(Boolean))].sort();
    const picked = matches.filter(m => !this.unchecked.has(m.entry.uuid) && !this.have.has(m.entry.uuid));
    this._picked = picked;
    const rarityWords = r => (r ? dnd5eLabel("itemRarity", r) : loc("Kinds.mundane"));
    return {
      loading: this.records === null,
      filter: this.filter,
      sources: itemSources().map(s => ({ value: s.id, label: s.label, selected: s.id === this.source })),
      magic: ["any", "magic", "mundane"].map(m => ({ value: m, label: L(`Magic.${m}`), selected: this.filter.magic === m })),
      books: [{ value: "", label: L("AnyBook"), selected: !this.filter.book }, ...books.map(b => ({ value: b, label: b, selected: b === this.filter.book }))],
      folders: [{ value: "", label: L("AnyFolder"), selected: !this.filter.folder }, ...folders.map(f => ({ value: f, label: f, selected: f === this.filter.folder }))],
      categories: CATEGORIES.map(c => ({ value: c, label: loc(`Kinds.${c}`), checked: this.filter.categories.includes(c) })),
      rarities: ["", ...RARITIES].map(r => ({ value: r || "mundane", label: rarityWords(r), checked: this.filter.rarities.includes(r) })),
      rows: matches.slice(0, SHOW_MAX).map(m => ({
        uuid: m.entry.uuid,
        name: m.entry.name,
        img: m.entry.img,
        rarity: m.entry.rarity,
        facts: [loc(`Kinds.${categoryOf(m.entry)}`), m.entry.rarity ? rarityWords(m.entry.rarity) : "", m.entry.book].filter(Boolean).join(" · "),
        price: toCp(m.entry.price, rates()) ? money(toCp(m.entry.price, rates())) : "—",
        checked: !this.unchecked.has(m.entry.uuid) && !this.have.has(m.entry.uuid),
        already: this.have.has(m.entry.uuid)
      })),
      more: matches.length > SHOW_MAX ? loc("Add.More", { n: matches.length - SHOW_MAX }) : "",
      countText: loc("Add.Count", { n: matches.length }),
      sorts: SORTS.map(s => ({ value: s, label: loc(`Shop.Sort.${s}`), selected: s === this.sort })),
      addCount: picked.length,
      addText: loc("Add.Confirm", { n: picked.length }),
      labels: {
        source: L("Source"), name: L("Name"), namePlaceholder: L("NamePlaceholder"), magic: L("MagicLabel"), book: L("Book"),
        folder: L("Folder"), price: L("Price"), min: L("Min"), max: L("Max"), priced: L("Priced"), all: L("All"),
        none: L("None"), loading: L("Loading"), nothing: L("Nothing"), cancel: L("Cancel"), already: L("Already"),
        sort: loc("Shop.SortBy")
      }
    };
  }

  /** @override */
  async _renderHTML(context) {
    return renderAddItems(context);
  }

  /** @override */
  _replaceHTML(result, content) {
    const scroll = content.querySelector("[data-scroll]")?.scrollTop ?? 0;
    const active = content.contains(document.activeElement) ? document.activeElement : null;
    const focus = active?.name ? { name: active.name, start: active.selectionStart } : null;
    content.innerHTML = result;
    const list = content.querySelector("[data-scroll]");
    if ( list ) list.scrollTop = scroll;
    if ( focus ) {
      const el = content.querySelector(`[name="${focus.name}"]`);
      el?.focus();
      try {
        if ( focus.start !== null ) el?.setSelectionRange(focus.start, focus.start);
      } catch {
        // Not a text box.
      }
    }
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    let timer = null;
    this.element.addEventListener("input", event => {
      if ( !["text", "minGp", "maxGp"].includes(event.target.name) ) return;
      this.filter[event.target.name] = event.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => this.render(), 250);
    });
    this.element.addEventListener("change", event => {
      const el = event.target;
      switch ( el.name ) {
        case "source":
          this.source = LAST_SOURCE = el.value;
          this.filter.book = "";
          this.filter.folder = "";
          this.unchecked.clear();
          this.load();
          return;
        case "sort":
          this.sort = LAST_SORT = SORTS.includes(el.value) ? el.value : "nameUp";
          break;
        case "magic": case "book": case "folder":
          this.filter[el.name] = el.value;
          break;
        case "priced":
          this.filter.priced = el.checked;
          break;
        case "category": {
          const set = new Set(this.filter.categories);
          if ( el.checked ) set.add(el.value);
          else set.delete(el.value);
          this.filter.categories = [...set];
          break;
        }
        case "rarity": {
          const value = el.value === "mundane" ? "" : el.value;
          const set = new Set(this.filter.rarities);
          if ( el.checked ) set.add(value);
          else set.delete(value);
          this.filter.rarities = [...set];
          break;
        }
        case "pick":
          if ( el.checked ) this.unchecked.delete(el.value);
          else this.unchecked.add(el.value);
          break;
        default:
          return;
      }
      this.render();
    });
  }

  /** @override */
  _onClose(options) {
    super._onClose?.(options);
    this.resolve?.(null);
    this.resolve = null;
  }

  static #onAll() {
    for ( const m of this.#matches() ) this.unchecked.delete(m.entry.uuid);
    this.render();
  }

  static #onNone() {
    for ( const m of this.#matches() ) this.unchecked.add(m.entry.uuid);
    this.render();
  }

  static #onCancel() {
    this.close();
  }

  static #onConfirm() {
    const picked = (this._picked ?? []).map(m => structuredClone(m.entry));
    this.resolve?.(picked);
    this.resolve = null;
    this.close();
  }
}
