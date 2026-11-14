/**
 * Shop lists (GM): make and change the lists shops sell from. Fill a list from the world's items or any compendium
 * (with filters, dnd5e's Compendium Browser, or by dropping items, folders and whole compendiums on it), paste in names
 * copied from a book or a spreadsheet (with prices, stock and levels), add custom items typed in by hand, or import
 * lists as JSON. Each entry can have its own price, stock and shop level here.
 */
import { MODULE_ID, escapeHTML as e, loc, newId } from "../constants.mjs";
import {
  CATEGORIES, MAX_LEVEL, RARITIES, STARTER_LISTS, buildStarterLists, categoryOf, exportLists, mergeLists, nameFinder,
  nameKey, normalizeEntry, normalizeLists, normalizeStock, parsePaste, rarityRank, readImport, sortRows
} from "../catalog.mjs";
import { cpToGp, gpRate, parsePrice, toCp } from "../money.mjs";
import {
  WORLD, clearSourceCache, defaultSearchSources, entriesFromDrop, entryOf, itemSources, loadSources
} from "../sources.mjs";
import { allShops, getLists, getShop, rates, saveLists } from "../store.mjs";
import { money, stockAfterChange } from "../trade.mjs";
import { options } from "../views.mjs";
import { AddItemsDialog } from "./add-items.mjs";
import { levelLabel, rarityLabel } from "./shop-window.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;

let INSTANCE = null;

/** What a custom item of each kind is made as. */
export const KIND_TYPES = {
  weapon: { type: "weapon", subtype: "simpleM" },
  armor: { type: "equipment", subtype: "light" },
  ammo: { type: "consumable", subtype: "ammo" },
  potion: { type: "consumable", subtype: "potion" },
  scroll: { type: "consumable", subtype: "scroll" },
  food: { type: "consumable", subtype: "food" },
  consumable: { type: "consumable", subtype: "trinket" },
  tool: { type: "tool", subtype: "" },
  container: { type: "container", subtype: "" },
  gear: { type: "loot", subtype: "gear" },
  treasure: { type: "loot", subtype: "treasure" }
};

/** The compendiums starter lists are made from, when the world has them: the 2024 Player's Handbook, then the SRD's. */
const STARTER_SOURCES = ["dnd-players-handbook.equipment", "dnd5e.equipment24"];

const icon = name => `<i class="fa-solid ${name}" inert></i>`;
const words = text => nameKey(text).split(" ").filter(Boolean);
const shows = (search, query) => query.every(w => search.includes(w));
const UNLIMITED = /^(-|∞|inf|unlimited|none)$/i;

/** @param {object} v */
export function renderListsEditor(v) {
  const L = v.labels;
  // A column heading that sorts by it, and again the other way.
  const sortHead = (by, label) => {
    const on = v.sort.by === by;
    const arrow = on ? (v.sort.desc ? "fa-sort-down" : "fa-sort-up") : "fa-sort";
    return `<button type="button" class="ps-sort-head${on ? " active" : ""}" data-action="sortBy" data-sort="${by}" data-tooltip="${e(L.sortHint)}"
      aria-pressed="${on}">${e(label)} <i class="fa-solid ${arrow}" inert></i></button>`;
  };
  const nav = v.lists.map(l => `
      <li><button type="button" class="ps-nav${l.active ? " active" : ""}" data-action="select" data-id="${e(l.id)}">
        <span>${e(l.name)}</span><span class="ps-nav-count">${e(l.count || "")}</span></button></li>`).join("");
  const list = v.list;
  let main;
  if ( !list ) {
    main = `
    <div class="ps-empty">
      <i class="fa-solid fa-list-check" inert></i>
      <p>${e(L.noLists)}</p>
      <div class="ps-empty-buttons">
        <button type="button" data-action="newList">${icon("fa-plus")} ${e(L.newList)}</button>
        <button type="button" data-action="starter">${icon("fa-wand-magic-sparkles")} ${e(L.starter)}</button>
        <button type="button" data-action="import">${icon("fa-file-import")} ${e(L.import)}</button>
      </div>
    </div>`;
  } else {
    const rows = list.rows.map(r => `
        <tr class="ps-entry rarity-${e(r.rarity || "mundane")}${r.missing ? " missing" : ""}" data-id="${e(r.id)}" data-search="${e(r.search)}"${r.hidden ? " hidden" : ""}>
          <td class="ps-check-cell"><input type="checkbox" name="check" value="${e(r.id)}"${r.checked ? " checked" : ""} aria-label="${e(L.select)}"></td>
          <td class="ps-thumb-cell"><img src="${e(r.img)}" alt=""></td>
          <td class="ps-entry-name">
            <a data-action="${r.custom ? "editCustom" : "openItem"}" data-id="${e(r.id)}" data-tooltip="${e(r.custom ? L.editCustom : L.openItem)}">${e(r.name)}</a>${r.bundle > 1 ? ` <span class="ps-bundle">×${e(r.bundle)}</span>` : ""}
            ${r.missing ? `<i class="fa-solid fa-triangle-exclamation ps-warn" data-tooltip="${e(L.missing)}" inert></i>` : ""}
            <div class="ps-sub">${r.facts.map(f => `<span>${e(f)}</span>`).join("")}</div>
          </td>
          <td class="ps-num ps-faint">${e(r.itemPrice)}</td>
          <td><input type="text" class="ps-price-input" data-field="priceGp" data-id="${e(r.id)}" value="${e(r.priceInput)}" placeholder="${e(r.pricePlaceholder)}" aria-label="${e(L.price)}"></td>
          <td><input type="text" class="ps-stock-input" data-field="stock" data-id="${e(r.id)}" value="${e(r.stock)}" placeholder="∞" aria-label="${e(L.stock)}"></td>
          <td><select data-field="level" data-id="${e(r.id)}" aria-label="${e(L.level)}">${options(r.levels)}</select></td>
          <td><button type="button" class="ps-icon-button" data-action="removeEntry" data-id="${e(r.id)}" data-tooltip="${e(L.remove)}" aria-label="${e(L.remove)}">${icon("fa-xmark")}</button></td>
        </tr>`).join("");
    const none = !v.checkedCount;
    main = `
    <div class="ps-editor-title">
      <input type="text" class="ps-list-name" data-field="listName" value="${e(list.name)}" aria-label="${e(L.listName)}">
      ${list.usedBy ? `<span class="ps-faint" data-tooltip="${e(list.usedByNames)}">${e(list.usedBy)}</span>` : ""}
      <div class="ps-editor-tools">
        <button type="button" class="ps-small" data-action="duplicate" data-tooltip="${e(L.duplicate)}" aria-label="${e(L.duplicate)}">${icon("fa-copy")}</button>
        <button type="button" class="ps-small" data-action="exportOne" data-tooltip="${e(L.exportOne)}" aria-label="${e(L.exportOne)}">${icon("fa-file-export")}</button>
        <button type="button" class="ps-small ps-danger" data-action="deleteList" data-tooltip="${e(L.deleteList)}" aria-label="${e(L.deleteList)}">${icon("fa-trash")}</button>
      </div>
    </div>
    <div class="ps-add-tools">
      <button type="button" data-action="addItems">${icon("fa-magnifying-glass-plus")} ${e(L.addItems)}</button>
      ${v.hasBrowser ? `<button type="button" data-action="browser">${icon("fa-book-open")} ${e(L.browser)}</button>` : ""}
      <button type="button" data-action="paste">${icon("fa-paste")} ${e(L.paste)}</button>
      <button type="button" data-action="custom">${icon("fa-feather")} ${e(L.custom)}</button>
      ${list.linked ? `<button type="button" data-action="refresh" data-tooltip="${e(L.refreshHint)}">${icon("fa-rotate")} ${e(L.refresh)}</button>` : ""}
    </div>
    <p class="ps-drop-hint">${icon("fa-hand-pointer")} ${e(L.dropHint)}</p>
    <div class="ps-bulk">
      <input type="search" name="search" value="${e(v.search)}" placeholder="${e(L.search)}" aria-label="${e(L.search)}">
      <span class="ps-bulk-count">${e(v.checkedText)}</span>
      <select name="bulkLevel"${none ? " disabled" : ""} aria-label="${e(L.setLevel)}">${options(v.bulkLevels)}</select>
      <input type="text" name="bulkStock" class="ps-stock-input" placeholder="${e(L.stock)}"${none ? " disabled" : ""} aria-label="${e(L.stock)}">
      <button type="button" class="ps-small" data-action="bulkStock"${none ? " disabled" : ""}>${e(L.setStock)}</button>
      <button type="button" class="ps-small" data-action="bulkPrice"${none ? " disabled" : ""} data-tooltip="${e(L.clearPricesHint)}">${e(L.clearPrices)}</button>
      <button type="button" class="ps-small ps-danger" data-action="bulkRemove"${none ? " disabled" : ""}>${icon("fa-trash")} ${e(L.removeChecked)}</button>
    </div>
    <table class="ps-entries">
      <thead><tr>
        <th class="ps-check-cell"><input type="checkbox" name="checkAll"${v.allChecked ? " checked" : ""} aria-label="${e(L.selectAll)}" data-tooltip="${e(L.selectAll)}"></th>
        <th></th>
        <th>${sortHead("name", L.name)} <span class="ps-faint">${e(list.count)}</span></th>
        <th class="ps-num">${sortHead("own", L.itemPrice)}</th>
        <th>${sortHead("here", L.price)} <span data-tooltip="${e(L.priceHint)}">${icon("fa-circle-question")}</span></th>
        <th data-tooltip="${e(L.stockHint)}">${e(L.stock)} ${icon("fa-circle-question")}</th>
        <th data-tooltip="${e(L.levelHint)}">${e(L.level)} ${icon("fa-circle-question")}</th>
        <th></th>
      </tr></thead>
      <tbody>${rows || `
        <tr class="ps-empty-row"><td colspan="8">${e(L.noEntries)}</td></tr>`}
      </tbody>
    </table>`;
  }
  return `
<div class="ps-lists-editor">
  <nav class="ps-editor-nav">
    <h4>${e(L.lists)}</h4>
    <ul>${nav || `<li class="ps-faint">${e(L.none)}</li>`}</ul>
    <button type="button" class="ps-small" data-action="newList">${icon("fa-plus")} ${e(L.newList)}</button>
    <button type="button" class="ps-small" data-action="starter">${icon("fa-wand-magic-sparkles")} ${e(L.starter)}</button>
  </nav>
  <section class="ps-editor-main" data-scroll="main">${main}
  </section>
  <footer class="ps-editor-foot">
    <button type="button" data-action="import">${icon("fa-file-import")} ${e(L.import)}</button>
    <button type="button" data-action="export"${v.lists.length ? "" : " disabled"}>${icon("fa-file-export")} ${e(L.export)}</button>
    <span class="ps-spacer">${v.dirty ? `<span class="ps-dirty">${e(L.unsaved)}</span>` : ""}</span>
    <button type="button" class="ps-primary" data-action="save">${icon("fa-floppy-disk")} ${e(L.save)}</button>
  </footer>
</div>`.trim();
}

/** The settings menu's button: opens the one Shop Lists window. */
export class ShopListsMenu extends ApplicationV2 {
  /** @override */
  async render() {
    ShopListsEditor.openTo(null);
    return this;
  }
}

export class ShopListsEditor extends ApplicationV2 {
  /**
   * Open the window (GM), showing one list.
   * @param {string|null} [listId]
   * @param {{onSave?: Function}} [options]  onSave: called each time the lists are saved.
   */
  static openTo(listId=null, { onSave=null }={}) {
    if ( !game.user.isGM ) return null;
    if ( INSTANCE?.rendered ) {
      if ( listId ) INSTANCE.#select(listId);
      if ( onSave ) INSTANCE.onSave.add(onSave);
      INSTANCE.render();
      INSTANCE.bringToFront?.();
      return INSTANCE;
    }
    INSTANCE = new ShopListsEditor({}, { listId, onSave });
    INSTANCE.render({ force: true });
    return INSTANCE;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "primal-shops-lists",
    classes: ["primal-shops-editor", "primal-shops-lists"],
    tag: "div",
    window: { icon: "fa-solid fa-list-check", resizable: true },
    position: { width: 1040, height: 720 },
    actions: {
      select: ShopListsEditor.#onSelect,
      newList: ShopListsEditor.#onNewList,
      duplicate: ShopListsEditor.#onDuplicate,
      deleteList: ShopListsEditor.#onDeleteList,
      exportOne: ShopListsEditor.#onExportOne,
      addItems: ShopListsEditor.#onAddItems,
      browser: ShopListsEditor.#onBrowser,
      paste: ShopListsEditor.#onPaste,
      custom: ShopListsEditor.#onCustom,
      editCustom: ShopListsEditor.#onEditCustom,
      openItem: ShopListsEditor.#onOpenItem,
      removeEntry: ShopListsEditor.#onRemoveEntry,
      refresh: ShopListsEditor.#onRefresh,
      bulkStock: ShopListsEditor.#onBulkStock,
      bulkPrice: ShopListsEditor.#onBulkPrice,
      bulkRemove: ShopListsEditor.#onBulkRemove,
      starter: ShopListsEditor.#onStarter,
      import: ShopListsEditor.#onImport,
      export: ShopListsEditor.#onExport,
      save: ShopListsEditor.#onSave,
      sortBy: ShopListsEditor.#onSortBy
    }
  };

  constructor(options={}, { listId=null, onSave=null }={}) {
    super(options);
    this.lists = structuredClone(getLists());
    this.selected = listId ?? this.lists.lists[0]?.id ?? null;
    this.onSave = new Set(onSave ? [onSave] : []);
    this.dirty = false;
    /** Entries ticked for a bulk change, by id. */
    this.checked = new Set();
    this.search = "";
    /** How the list on show is sorted: by name, its own price (own) or its price here (here); desc: the other way. */
    this.sort = { by: "name", desc: false };
    /** Entries whose item can't be found any more (seen by "Update from items"), by id. */
    this.missing = new Set();
    if ( !INSTANCE ) INSTANCE = this;
  }

  /** @override */
  get title() {
    return loc("Lists.Title");
  }

  /** The list on show. */
  #list() {
    let list = this.lists.lists.find(l => l.id === this.selected) ?? null;
    if ( !list && this.lists.lists.length ) {
      list = this.lists.lists[0];
      this.selected = list.id;
    }
    return list;
  }

  #select(id) {
    if ( id === this.selected ) return;
    this.selected = id;
    this.checked.clear();
    this.search = "";
  }

  #labels() {
    const keys = [
      "lists", "none", "newList", "starter", "import", "export", "save", "unsaved", "noLists", "listName", "duplicate",
      "exportOne", "deleteList", "addItems", "browser", "paste", "custom", "refresh", "refreshHint", "dropHint", "search",
      "setLevel", "stock", "setStock", "clearPrices", "clearPricesHint", "removeChecked", "selectAll", "select", "name",
      "itemPrice", "price", "priceHint", "stockHint", "level", "levelHint", "remove", "noEntries", "missing", "editCustom",
      "openItem", "sortHint"
    ];
    return Object.fromEntries(keys.map(k => [k, loc(`Lists.${k.charAt(0).toUpperCase()}${k.slice(1)}`)]));
  }

  /** @override */
  async _prepareContext() {
    const r = rates();
    const list = this.#list();
    const query = words(this.search);
    let view = null;
    let allChecked = false;
    if ( list ) {
      const used = allShops().filter(a => getShop(a).lists.includes(list.id));
      const rows = list.entries.map(entry => {
        const own = toCp(entry.price, r);
        const search = nameKey(entry.name);
        const rank = rarityRank(entry.rarity);
        return {
          id: entry.id,
          name: entry.name,
          img: entry.img,
          rarity: entry.rarity,
          bundle: entry.bundle,
          ownCp: own,
          hereCp: (entry.priceGp === null) ? own : toCp({ value: entry.priceGp, denomination: "gp" }, r),
          custom: !entry.uuid,
          missing: this.missing.has(entry.id),
          search,
          hidden: !shows(search, query),
          checked: this.checked.has(entry.id),
          facts: [
            loc(`Kinds.${categoryOf(entry)}`),
            entry.rarity ? rarityLabel(entry.rarity) : "",
            entry.uuid ? entry.book : loc("Lists.CustomTag")
          ].filter(Boolean),
          itemPrice: own ? money(own) : "—",
          priceInput: (entry.priceGp === null) ? "" : String(entry.priceGp),
          pricePlaceholder: own ? String(cpToGp(own, r)) : "—",
          stock: entry.stock ?? "",
          levels: [
            { value: "", label: loc("Lists.LevelAuto", { level: rank }), selected: entry.level === null },
            ...Array.from({ length: MAX_LEVEL + 1 }, (_, i) => ({ value: i, label: String(i), selected: entry.level === i }))
          ]
        };
      });
      const { by, desc } = this.sort;
      sortRows(rows, (by === "name") ? (desc ? "nameDown" : "nameUp") : (desc ? "priceDown" : "priceUp"), {
        name: x => x.name,
        price: (by === "own") ? (x => x.ownCp) : (x => x.hereCp)
      });
      const shown = rows.filter(x => !x.hidden);
      allChecked = !!shown.length && shown.every(x => x.checked);
      view = {
        id: list.id,
        name: list.name,
        count: loc("Lists.Count", { n: list.entries.length }),
        linked: list.entries.some(x => x.uuid),
        usedBy: used.length ? loc("Lists.UsedBy", { n: used.length }) : "",
        usedByNames: used.map(a => a.name).join(", "),
        rows
      };
    }
    return {
      dirty: this.dirty,
      search: this.search,
      sort: this.sort,
      hasBrowser: !!globalThis.dnd5e?.applications?.CompendiumBrowser,
      lists: this.lists.lists.map(l => ({ id: l.id, name: l.name, count: l.entries.length, active: l.id === this.selected })),
      list: view,
      allChecked,
      checkedCount: this.checked.size,
      checkedText: this.checked.size ? loc("Lists.Checked", { n: this.checked.size }) : loc("Lists.CheckHint"),
      bulkLevels: [
        { value: "", label: loc("Lists.SetLevel"), selected: true },
        { value: "auto", label: loc("Lists.LevelAutoShort") },
        ...Array.from({ length: MAX_LEVEL + 1 }, (_, i) => ({ value: i, label: `${i} · ${levelLabel(i)}` }))
      ],
      labels: this.#labels()
    };
  }

  /** @override */
  async _renderHTML(context) {
    return renderListsEditor(context);
  }

  /** @override */
  _replaceHTML(result, content) {
    const scroll = content.querySelector("[data-scroll]")?.scrollTop ?? 0;
    const active = content.contains(document.activeElement) ? document.activeElement : null;
    const focus = (active?.name === "search") ? { start: active.selectionStart } : null;
    content.innerHTML = result;
    const main = content.querySelector("[data-scroll]");
    if ( main ) main.scrollTop = scroll;
    if ( focus ) {
      const el = content.querySelector("input[name=search]");
      el?.focus();
      el?.setSelectionRange?.(focus.start, focus.start);
    }
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    const root = this.element;
    root.addEventListener("change", this.#onChange.bind(this));
    root.addEventListener("input", event => {
      if ( event.target.name !== "search" ) return;
      this.search = event.target.value;
      const query = words(this.search);
      for ( const row of root.querySelectorAll("tr.ps-entry") ) row.hidden = !shows(row.dataset.search, query);
    });
    root.addEventListener("dragover", event => {
      if ( this.#list() ) event.preventDefault();
    });
    root.addEventListener("drop", this.#onDrop.bind(this));
  }

  /** @override */
  async close(options={}) {
    if ( this.dirty && !options.force ) {
      const discard = await DialogV2.confirm({
        window: { title: loc("Lists.Title") },
        content: `<p>${e(loc("Lists.DiscardText"))}</p>`
      });
      if ( !discard ) return this;
    }
    return super.close(options);
  }

  /** @override */
  _onClose(options) {
    super._onClose?.(options);
    if ( INSTANCE === this ) INSTANCE = null;
  }

  /** Show that there are changes to save, without drawing the window again. */
  #markDirty() {
    this.dirty = true;
    const spacer = this.element?.querySelector(".ps-spacer");
    if ( spacer ) spacer.innerHTML = `<span class="ps-dirty">${e(loc("Lists.Unsaved"))}</span>`;
  }

  /** The ids of the ticked entries still on the list on show. */
  #checkedEntries() {
    const list = this.#list();
    return list ? list.entries.filter(x => this.checked.has(x.id)) : [];
  }

  #onChange(event) {
    const el = event.target;
    const list = this.#list();
    if ( !list ) return;
    switch ( el.name ) {
      case "check":
        if ( el.checked ) this.checked.add(el.value);
        else this.checked.delete(el.value);
        this.render();
        return;
      case "checkAll": {
        const query = words(this.search);
        for ( const entry of list.entries ) {
          if ( !shows(nameKey(entry.name), query) ) continue;
          if ( el.checked ) this.checked.add(entry.id);
          else this.checked.delete(entry.id);
        }
        this.render();
        return;
      }
      case "bulkLevel": {
        if ( el.value === "" ) return;
        const level = (el.value === "auto") ? null : Number(el.value);
        for ( const entry of this.#checkedEntries() ) entry.level = level;
        this.dirty = true;
        this.render();
        return;
      }
    }
    const field = el.dataset?.field;
    if ( !field ) return;
    if ( field === "listName" ) {
      const name = el.value.trim();
      if ( !name ) {
        el.value = list.name;
        return;
      }
      list.name = name.slice(0, 120);
      this.dirty = true;
      this.render();
      return;
    }
    const entry = list.entries.find(x => x.id === el.dataset.id);
    if ( !entry ) return;
    const r = rates();
    switch ( field ) {
      case "priceGp": {
        const text = el.value.trim();
        if ( !text ) entry.priceGp = null;
        else {
          const cp = parsePrice(text, r);
          if ( cp === null ) {
            ui.notifications.warn(loc("Lists.BadPrice", { text }));
            el.value = (entry.priceGp === null) ? "" : String(entry.priceGp);
            return;
          }
          entry.priceGp = cpToGp(cp, r);
          el.value = String(entry.priceGp);
        }
        break;
      }
      case "stock": {
        const text = el.value.trim();
        const stock = normalizeStock(text);
        if ( text && (stock === null) && !UNLIMITED.test(text) ) {
          ui.notifications.warn(loc("Lists.BadStock", { text }));
          el.value = entry.stock ?? "";
          return;
        }
        entry.stock = stock;
        el.value = stock ?? "";
        break;
      }
      case "level":
        entry.level = (el.value === "") ? null : Math.max(0, Math.min(MAX_LEVEL, Number(el.value)));
        break;
      default:
        return;
    }
    this.#markDirty();
  }

  /**
   * Put entries on the list on show. An item the list has already is left out.
   * @param {object[]} entries
   * @param {{quiet?: boolean}} [options]
   * @returns {{added: number, dup: number}}
   */
  #addEntries(entries, { quiet=false }={}) {
    const list = this.#list();
    if ( !list ) return { added: 0, dup: 0 };
    const have = new Set(list.entries.map(x => x.uuid).filter(Boolean));
    let added = 0;
    let dup = 0;
    for ( const raw of entries ) {
      if ( !raw ) continue;
      if ( raw.uuid && have.has(raw.uuid) ) {
        dup++;
        continue;
      }
      const entry = normalizeEntry({ ...raw, id: newId() });
      if ( !entry ) continue;
      if ( entry.uuid ) have.add(entry.uuid);
      list.entries.push(entry);
      added++;
    }
    if ( added ) {
      list.entries.sort((a, b) => a.name.localeCompare(b.name));
      this.dirty = true;
    }
    this.render();
    if ( !quiet ) {
      if ( !added && !dup ) ui.notifications.warn(loc("Lists.NothingAdded"));
      else ui.notifications.info(loc(dup ? "Lists.AddedDup" : "Lists.Added", { n: added, dup }));
    }
    return { added, dup };
  }

  async #onDrop(event) {
    const list = this.#list();
    if ( !list ) return;
    event.preventDefault();
    let data = null;
    try {
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
      data = TE?.getDragEventData?.(event) ?? JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      data = null;
    }
    if ( !["Item", "Folder", "Compendium"].includes(data?.type) ) {
      ui.notifications.warn(loc("Lists.DropOnlyItems"));
      return;
    }
    let result;
    try {
      result = await entriesFromDrop(data);
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not read the drop`, err);
      result = { entries: [], many: true };
    }
    if ( !result.entries.length ) {
      ui.notifications.warn(loc(result.many ? "Lists.DropEmpty" : "Lists.DropOnlyItems"));
      return;
    }
    if ( result.many && (result.entries.length > 20) ) {
      const ok = await DialogV2.confirm({
        window: { title: loc("Lists.DropTitle") },
        content: `<p>${e(loc("Lists.DropMany", { n: result.entries.length, name: result.name, list: list.name }))}</p>`
      });
      if ( !ok ) return;
    }
    this.#addEntries(result.entries);
  }

  /* -------------------------------------------- */
  /*  Lists                                       */
  /* -------------------------------------------- */

  static #onSelect(event, target) {
    this.#select(target.dataset.id);
    this.render();
  }

  static async #onNewList() {
    const list = { id: newId(), name: loc("Lists.NewListName"), entries: [] };
    this.lists.lists.push(list);
    this.#select(list.id);
    this.dirty = true;
    await this.render();
    const input = this.element.querySelector(".ps-list-name");
    input?.focus();
    input?.select();
  }

  static #onDuplicate() {
    const list = this.#list();
    if ( !list ) return;
    const copy = structuredClone(list);
    copy.id = newId();
    copy.name = loc("Lists.CopyName", { name: list.name });
    for ( const entry of copy.entries ) entry.id = newId();
    this.lists.lists.splice(this.lists.lists.indexOf(list) + 1, 0, copy);
    this.#select(copy.id);
    this.dirty = true;
    this.render();
  }

  static async #onDeleteList() {
    const list = this.#list();
    if ( !list ) return;
    const used = allShops().filter(a => getShop(a).lists.includes(list.id));
    const ok = await DialogV2.confirm({
      window: { title: loc("Lists.DeleteTitle") },
      content: `<p>${e(loc("Lists.DeleteText", { name: list.name, n: list.entries.length }))}</p>${used.length
        ? `<p>${e(loc("Lists.DeleteUsed", { shops: used.map(a => a.name).join(", ") }))}</p>` : ""}`
    });
    if ( !ok ) return;
    this.lists.lists = this.lists.lists.filter(l => l !== list);
    this.#select(this.lists.lists[0]?.id ?? null);
    this.dirty = true;
    this.render();
  }

  static #onExportOne() {
    const list = this.#list();
    if ( !list ) return;
    const slug = nameKey(list.name).replace(/\s+/g, "-") || "list";
    saveFile(exportLists(this.lists, [list.id]), `primal-shops-${slug}.json`);
  }

  static #onExport() {
    saveFile(exportLists(this.lists), "primal-shops-lists.json");
  }

  /* -------------------------------------------- */
  /*  Adding items                                */
  /* -------------------------------------------- */

  static async #onAddItems() {
    const list = this.#list();
    if ( !list ) return;
    const have = new Set(list.entries.map(x => x.uuid).filter(Boolean));
    const picked = await AddItemsDialog.pick({ listName: list.name, have });
    if ( picked?.length ) this.#addEntries(picked);
  }

  static async #onBrowser() {
    const Browser = globalThis.dnd5e?.applications?.CompendiumBrowser;
    const list = this.#list();
    if ( !Browser || !list ) return;
    let uuids = null;
    try {
      uuids = await Browser.select({
        filters: { locked: { documentClass: "Item", types: new Set(["physical"]) } },
        selection: { min: null, max: null }
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | The Compendium Browser failed`, err);
      ui.notifications.warn(loc("Lists.BrowserFailed"));
      return;
    }
    if ( !uuids?.size ) return;
    const entries = await Promise.all([...uuids].map(uuid => entryOf(uuid)));
    this.#addEntries(entries.filter(Boolean));
  }

  /** Lines pasted in: found by name in the world and the item compendiums, or added as custom items. */
  static async #onPaste() {
    const list = this.#list();
    if ( !list ) return;
    const sources = itemSources();
    const result = await DialogV2.wait({
      window: { title: loc("Lists.PasteTitle", { name: list.name }), icon: "fa-solid fa-paste" },
      position: { width: 600 },
      content: `
        <p class="hint">${e(loc("Lists.PasteHint"))}</p>
        <textarea name="rows" rows="12" class="ps-mono" placeholder="Potion of Healing | 50 | 1d4&#10;Longsword | 15&#10;Arrows (20)&#9;1 gp&#9;10&#10;Spyglass; 1000; 1; 3"></textarea>
        <div class="form-group"><label>${e(loc("Lists.PasteLookIn"))}</label>
          <div class="form-fields"><select name="source">
            <option value="">${e(loc("Lists.PasteEverywhere"))}</option>${options(sources.map(s => ({ value: s.id, label: s.label })))}
          </select></div></div>
        <div class="form-group"><label class="checkbox"><input type="checkbox" name="custom" checked> ${e(loc("Lists.PasteCustom"))}</label></div>`,
      buttons: [
        { action: "add", label: loc("Lists.PasteAdd"), icon: "fa-solid fa-plus", default: true,
          callback: (event, button) => ({
            text: button.form.elements.rows.value,
            source: button.form.elements.source.value,
            custom: button.form.elements.custom.checked
          }) },
        { action: "cancel", label: loc("Lists.Cancel") }
      ],
      rejectClose: false
    });
    if ( !result?.text?.trim() ) return;
    const r = rates();
    const { rows, skipped } = parsePaste(result.text, t => parsePrice(t, r), gpRate(r));
    if ( skipped.length ) console.log(`${MODULE_ID} | Lines that weren't items:\n${skipped.join("\n")}`);
    if ( !rows.length ) {
      ui.notifications.warn(loc("Lists.PasteNothing"));
      return;
    }
    const ids = result.source ? [result.source] : defaultSearchSources();
    if ( ids.includes(WORLD) ) clearSourceCache(WORLD);
    ui.notifications.info(loc("Lists.Searching", { n: rows.length, sources: ids.length }));
    const find = nameFinder(await loadSources(ids));
    const counts = { found: 0, custom: 0, updated: 0 };
    const missing = [];
    for ( const row of rows ) {
      const over = {};
      if ( row.priceGp !== null ) over.priceGp = row.priceGp;
      if ( row.stock !== null ) over.stock = row.stock;
      if ( row.level !== null ) over.level = row.level;
      const found = find(row.name);
      if ( !found ) missing.push(row.name);
      if ( !found && !result.custom ) continue;
      // An item on the list already gets the new price, stock and level.
      const existing = found
        ? list.entries.find(x => x.uuid === found.uuid)
        : list.entries.find(x => !x.uuid && (nameKey(x.name) === nameKey(row.name)));
      if ( existing ) {
        Object.assign(existing, over);
        counts.updated++;
        continue;
      }
      const entry = found
        ? normalizeEntry({ ...found, ...over, id: newId() })
        : normalizeEntry({ name: row.name, ...KIND_TYPES.gear, img: defaultImage("loot"), ...over, id: newId() });
      if ( !entry ) continue;
      list.entries.push(entry);
      counts[found ? "found" : "custom"]++;
    }
    list.entries.sort((a, b) => a.name.localeCompare(b.name));
    if ( counts.found || counts.custom || counts.updated ) this.dirty = true;
    this.render();
    ui.notifications.info(loc("Lists.PasteDone", counts));
    if ( missing.length && !result.custom ) {
      await DialogV2.prompt({
        window: { title: loc("Lists.NotFoundTitle") },
        content: `<p>${e(loc("Lists.NotFoundText", { n: missing.length }))}</p>
          <ul class="ps-not-found">${missing.map(n => `<li>${e(n)}</li>`).join("")}</ul>`,
        rejectClose: false
      });
    }
  }

  static async #onCustom() {
    if ( !this.#list() ) return;
    const entry = await customDialog(null);
    if ( entry ) this.#addEntries([entry]);
  }

  static async #onEditCustom(event, target) {
    const list = this.#list();
    const at = list?.entries.findIndex(x => x.id === target.dataset.id) ?? -1;
    if ( at < 0 ) return;
    const entry = await customDialog(list.entries[at]);
    if ( !entry ) return;
    list.entries[at] = entry;
    list.entries.sort((a, b) => a.name.localeCompare(b.name));
    this.dirty = true;
    this.render();
  }

  static async #onOpenItem(event, target) {
    const entry = this.#list()?.entries.find(x => x.id === target.dataset.id);
    if ( !entry?.uuid ) return;
    const item = await fromUuid(entry.uuid).catch(() => null);
    if ( !item ) {
      this.missing.add(entry.id);
      this.render();
      ui.notifications.warn(loc("Lists.ItemGone", { name: entry.name }));
      return;
    }
    item.sheet?.render(true);
  }

  static #onRemoveEntry(event, target) {
    const list = this.#list();
    if ( !list ) return;
    list.entries = list.entries.filter(x => x.id !== target.dataset.id);
    this.checked.delete(target.dataset.id);
    this.dirty = true;
    this.render();
  }

  /** Read every linked entry again from its item (a homebrew item's price or picture changed). */
  static async #onRefresh() {
    const list = this.#list();
    if ( !list ) return;
    let updated = 0;
    let gone = 0;
    for ( const [i, entry] of list.entries.entries() ) {
      if ( !entry.uuid ) continue;
      const fresh = await entryOf(entry.uuid);
      if ( !fresh ) {
        this.missing.add(entry.id);
        gone++;
        continue;
      }
      this.missing.delete(entry.id);
      // Keep what was set for this list.
      list.entries[i] = normalizeEntry({
        ...fresh, id: entry.id, level: entry.level, priceGp: entry.priceGp, stock: entry.stock, description: entry.description
      });
      updated++;
    }
    this.dirty = true;
    this.render();
    ui.notifications[gone ? "warn" : "info"](loc("Lists.RefreshDone", { updated, gone }));
  }

  /* -------------------------------------------- */
  /*  Changing many at once                       */
  /* -------------------------------------------- */

  static #onBulkStock() {
    const input = this.element.querySelector("input[name=bulkStock]");
    const text = input?.value.trim() ?? "";
    const stock = normalizeStock(text);
    if ( text && (stock === null) && !UNLIMITED.test(text) ) {
      ui.notifications.warn(loc("Lists.BadStock", { text }));
      return;
    }
    for ( const entry of this.#checkedEntries() ) entry.stock = stock;
    this.dirty = true;
    this.render();
  }

  static #onBulkPrice() {
    for ( const entry of this.#checkedEntries() ) entry.priceGp = null;
    this.dirty = true;
    this.render();
  }

  static #onBulkRemove() {
    const list = this.#list();
    if ( !list ) return;
    list.entries = list.entries.filter(x => !this.checked.has(x.id));
    this.checked.clear();
    this.dirty = true;
    this.render();
  }

  /* -------------------------------------------- */
  /*  Starter lists, import and save              */
  /* -------------------------------------------- */

  /** Lists made from item compendiums: general goods, a smithy's, an alchemist's, magic items, a scribe's, tools. */
  static async #onStarter() {
    const sources = itemSources().filter(s => s.id !== WORLD);
    const preferred = STARTER_SOURCES.filter(id => sources.some(s => s.id === id));
    const chosen = new Set(preferred.length ? preferred : sources.filter(s => s.id === "dnd5e.items").map(s => s.id));
    const names = Object.fromEntries(STARTER_LISTS.map(s => [s.id, loc(`Lists.StarterNames.${s.id}`)]));
    const result = await DialogV2.wait({
      window: { title: loc("Lists.StarterTitle"), icon: "fa-solid fa-wand-magic-sparkles" },
      position: { width: 560 },
      content: `
        <p class="hint">${e(loc("Lists.StarterHint"))}</p>
        <fieldset><legend>${e(loc("Lists.StarterLists"))}</legend>
          <div class="ps-check-grid">${STARTER_LISTS.map(s => `
            <label class="checkbox"><input type="checkbox" name="list" value="${e(s.id)}" checked> ${e(names[s.id])}</label>`).join("")}
          </div>
        </fieldset>
        <fieldset><legend>${e(loc("Lists.StarterFrom"))}</legend>
          <div class="ps-check-scroll">${sources.map(s => `
            <label class="checkbox"><input type="checkbox" name="source" value="${e(s.id)}"${chosen.has(s.id) ? " checked" : ""}> ${e(s.label)}</label>`).join("")}
          </div>
        </fieldset>`,
      buttons: [
        { action: "make", label: loc("Lists.StarterMake"), icon: "fa-solid fa-wand-magic-sparkles", default: true,
          callback: (event, button) => ({
            ids: [...button.form.querySelectorAll("input[name=list]:checked")].map(i => i.value),
            sources: [...button.form.querySelectorAll("input[name=source]:checked")].map(i => i.value)
          }) },
        { action: "cancel", label: loc("Lists.Cancel") }
      ],
      rejectClose: false
    });
    if ( !result?.ids?.length || !result.sources?.length ) return;
    ui.notifications.info(loc("Lists.StarterWorking"));
    const r = rates();
    const items = await loadSources(result.sources);
    const made = buildStarterLists(items, { ids: result.ids, names, priceOf: x => toCp(x.price, r) })
      .filter(l => l.entries.length);
    if ( !made.length ) {
      ui.notifications.warn(loc("Lists.StarterNone"));
      return;
    }
    const { lists, counts } = mergeLists(this.lists, { lists: made }, "merge");
    this.lists = normalizeLists(lists);
    this.#select(this.lists.lists.find(l => nameKey(l.name) === nameKey(made[0].name))?.id ?? this.selected);
    this.dirty = true;
    this.render();
    ui.notifications.info(loc("Lists.StarterDone", { n: made.length, entries: counts.entries }));
  }

  static async #onImport() {
    const result = await DialogV2.wait({
      window: { title: loc("Lists.ImportTitle"), icon: "fa-solid fa-file-import" },
      position: { width: 560 },
      content: `
        <p class="hint">${e(loc("Lists.ImportHint"))}</p>
        <div class="form-group"><label>${e(loc("Lists.ImportFoundry"))}</label>
          <div class="form-fields"><file-picker name="path" type="text" placeholder="${e(loc("Lists.ImportFoundryHint"))}"></file-picker></div></div>
        <div class="form-group"><label>${e(loc("Lists.ImportComputer"))}</label>
          <div class="form-fields"><input type="file" name="file" accept=".json,application/json"></div></div>
        <textarea name="json" rows="8" class="ps-mono" placeholder='{ "name": "Fletcher", "entries": [ "Arrows (20) | 1 gp | 10", { "name": "Longbow", "priceGp": 50 } ] }'></textarea>`,
      buttons: [
        { action: "merge", label: loc("Lists.ImportMerge"), default: true,
          callback: async (event, button) => ({ mode: "merge", text: await readForm(button.form) }) },
        { action: "replace", label: loc("Lists.ImportReplace"),
          callback: async (event, button) => ({ mode: "replace", text: await readForm(button.form) }) }
      ],
      rejectClose: false
    });
    if ( !result?.text?.trim?.() ) return;
    if ( result.text.startsWith("\u0000error:") ) {
      ui.notifications.error(loc("Lists.ImportFailed", { error: result.text.slice(7) }));
      return;
    }
    try {
      const r = rates();
      const imported = readImport(result.text, t => parsePrice(t, r));
      if ( !imported.lists.length ) throw new Error(loc("Lists.ImportEmpty"));
      const { lists, counts } = mergeLists(this.lists, imported, result.mode);
      this.lists = normalizeLists(lists);
      this.#select(this.lists.lists.find(l => nameKey(l.name) === nameKey(imported.lists[0].name))?.id ?? null);
      this.missing.clear();
      this.dirty = true;
      this.render();
      ui.notifications.info(loc("Lists.ImportDone", counts));
    } catch (err) {
      ui.notifications.error(loc("Lists.ImportFailed", { error: err.message }));
    }
  }

  /** Sort the list on show by a column, or the other way if it's sorted by it already. */
  static #onSortBy(event, target) {
    const by = target.dataset.sort;
    if ( !["name", "own", "here"].includes(by) ) return;
    this.sort = (this.sort.by === by) ? { by, desc: !this.sort.desc } : { by, desc: false };
    this.render();
  }

  static async #onSave() {
    await saveLists(this.lists);
    this.lists = structuredClone(getLists());
    this.dirty = false;
    // Roll the stock of anything new in the shops that sell from these lists.
    for ( const actor of allShops() ) {
      try {
        await stockAfterChange(actor);
      } catch (err) {
        console.warn(`${MODULE_ID} | Could not stock ${actor.name}`, err);
      }
    }
    for ( const fn of this.onSave ) {
      try {
        fn();
      } catch (err) {
        console.warn(`${MODULE_ID} | ${err.message}`);
      }
    }
    this.render();
    ui.notifications.info(loc("Lists.Saved"));
  }

  /** For tests: run an action as a click on a button with this data would. */
  async act(action, dataset={}) {
    const fn = this.options.actions[action];
    const handler = (typeof fn === "object") ? fn.handler : fn;
    return handler.call(this, new Event("click"), { dataset });
  }
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

function defaultImage(type) {
  return globalThis.CONFIG?.DND5E?.defaultArtwork?.Item?.[type] ?? "icons/svg/item-bag.svg";
}

function saveFile(text, name) {
  const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
  save(text, "application/json", name);
}

/**
 * Make or change a custom item.
 * @param {object|null} entry
 * @returns {Promise<object|null>}  The entry, or null.
 */
export async function customDialog(entry) {
  const r = rates();
  const kind = entry ? categoryOf(entry) : "gear";
  const priceCp = entry ? ((entry.priceGp !== null) ? toCp({ value: entry.priceGp, denomination: "gp" }, r) : toCp(entry.price, r)) : 0;
  const L = k => loc(`Lists.CustomFields.${k}`);
  const field = (label, input, hint="") => `
    <div class="form-group"><label>${e(label)}</label><div class="form-fields">${input}</div>${hint ? `<p class="hint">${e(hint)}</p>` : ""}</div>`;
  const content = `
    ${field(L("Name"), `<input type="text" name="name" value="${e(entry?.name ?? "")}" required autofocus>`)}
    ${field(L("Kind"), `<select name="kind">${options(CATEGORIES.map(c => ({ value: c, label: loc(`Kinds.${c}`), selected: c === kind })))}</select>`)}
    ${field(L("Price"), `<input type="text" name="price" value="${e(priceCp ? String(cpToGp(priceCp, r)) : "")}" placeholder="25">`, L("PriceHint"))}
    ${field(L("Rarity"), `<select name="rarity">${options(["", ...RARITIES].map(x => ({ value: x, label: rarityLabel(x), selected: (entry?.rarity ?? "") === x })))}</select>`)}
    <div class="form-group"><label>${e(L("Magic"))}</label><div class="form-fields">
      <label class="checkbox"><input type="checkbox" name="magical"${entry?.magical ? " checked" : ""}> ${e(L("Magical"))}</label>
      <label class="checkbox"><input type="checkbox" name="attunement"${entry?.attunement ? " checked" : ""}> ${e(L("Attunement"))}</label>
    </div></div>
    ${field(L("Weight"), `<input type="number" name="weight" value="${e(entry?.weight || "")}" min="0" step="any" placeholder="0">`)}
    ${field(L("Bundle"), `<input type="number" name="bundle" value="${e(entry?.bundle ?? 1)}" min="1" step="1">`, L("BundleHint"))}
    ${field(L("Stock"), `<input type="text" name="stock" value="${e(entry?.stock ?? "")}" placeholder="∞">`, L("StockHint"))}
    ${field(L("Image"), `<file-picker name="img" type="image" value="${e(entry?.img ?? "")}"></file-picker>`)}
    <div class="form-group stacked"><label>${e(L("Description"))}</label>
      <textarea name="description" rows="5">${e(entry?.description ?? "")}</textarea></div>`;
  const data = await DialogV2.wait({
    window: { title: loc(entry ? "Lists.CustomEditTitle" : "Lists.CustomTitle"), icon: "fa-solid fa-feather" },
    position: { width: 520 },
    content,
    buttons: [
      { action: "ok", label: loc(entry ? "Lists.CustomSave" : "Lists.CustomAdd"), icon: "fa-solid fa-check", default: true,
        callback: (event, button) => {
          const f = button.form;
          return {
            name: f.elements.name.value,
            kind: f.elements.kind.value,
            price: f.elements.price.value,
            rarity: f.elements.rarity.value,
            magical: f.elements.magical.checked,
            attunement: f.elements.attunement.checked,
            weight: f.elements.weight.value,
            bundle: f.elements.bundle.value,
            stock: f.elements.stock.value,
            img: String(f.querySelector("file-picker")?.value ?? f.elements.img?.value ?? "").trim(),
            description: f.elements.description.value
          };
        } },
      { action: "cancel", label: loc("Lists.Cancel") }
    ],
    rejectClose: false
  });
  if ( !data || (typeof data !== "object") ) return null;
  const name = data.name.trim();
  if ( !name ) {
    ui.notifications.warn(loc("Lists.CustomNoName"));
    return null;
  }
  let cp = 0;
  if ( data.price.trim() ) {
    cp = parsePrice(data.price, r);
    if ( cp === null ) {
      ui.notifications.warn(loc("Lists.BadPrice", { text: data.price.trim() }));
      cp = priceCp;
    }
  }
  const types = KIND_TYPES[data.kind] ?? KIND_TYPES.gear;
  const sameKind = entry && (categoryOf(entry) === data.kind);
  const type = sameKind ? entry.type : types.type;
  return normalizeEntry({
    ...(entry ?? {}),
    id: entry?.id ?? newId(),
    uuid: null,
    name,
    type,
    subtype: sameKind ? entry.subtype : types.subtype,
    img: data.img || ((sameKind && entry.img) ? entry.img : defaultImage(type)),
    rarity: data.rarity,
    magical: data.magical,
    attunement: data.attunement,
    price: { value: cpToGp(cp, r), denomination: "gp" },
    priceGp: null,
    weight: data.weight,
    bundle: data.bundle,
    stock: normalizeStock(data.stock),
    description: data.description.trim()
  });
}

/** The JSON of the import dialog: the file picked from Foundry's files, else the one from this computer, else the text. */
async function readForm(form) {
  const path = String(form.querySelector("file-picker")?.value ?? form.elements.path?.value ?? "").trim();
  if ( path ) {
    try {
      return await fetchText(path);
    } catch (err) {
      return `\u0000error:${err.message}`;
    }
  }
  const file = form.elements.file?.files?.[0];
  if ( file ) return file.text();
  return form.elements.json.value;
}

/** A file in Foundry's files (a path as the file picker gives it), as text. */
async function fetchText(path) {
  const encoded = /%[0-9a-f]{2}/i.test(path) ? path : encodeURI(path);
  const url = /^(https?:)?\/\//i.test(encoded) ? encoded : (foundry.utils.getRoute?.(encoded) ?? encoded);
  const response = await fetch(url, { cache: "no-store" });
  if ( !response.ok ) throw new Error(`${response.status} ${response.statusText || ""}`.trim() + `: ${path}`);
  return response.text();
}
