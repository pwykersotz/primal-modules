import { MODULE_ID, MODES, loc, splitUuid, sourceLabel } from "./constants.mjs";
import { isPackExpanded } from "./logic.mjs";
import { filtersFor, isFiltering, recordOf } from "./filter-logic.mjs";
import { recordContext, setBadge } from "./filtering.mjs";
import { buildView, foldersUnder } from "./pack-model.mjs";
import { getExpanded, setExpanded, setExpandedMany, chooseOne } from "./state.mjs";
import { ChooserApp } from "./chooser.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATES = `modules/${MODULE_ID}/templates`;

/** How many rows (compendiums, folders, entries) are drawn at a time. */
const CHUNK = 60;

/** How far past the part of the list on screen rows are kept drawn, in pixels. */
const MARGIN = 600;

/**
 * Compendiums whose index has the extra fields the filters and the CR badges need (CR, creature type, rarity,
 * source), or is getting them. Read once per session, for the GM only, and one compendium at a time: when its
 * entries are first drawn (for the badges), or all of the tab's compendiums once filters or a sort need them.
 * @type {WeakMap<CompendiumCollection, Promise<boolean>>}
 */
const DETAILS = new WeakMap();

/**
 * Read a compendium's extra index fields, once.
 * @param {CompendiumCollection} pack
 * @param {string[]} fields
 * @returns {Promise<boolean>}  Whether they were read.
 */
function readDetails(pack, fields) {
  let reading = DETAILS.get(pack);
  if ( !reading ) {
    reading = pack.getIndex({ fields }).then(() => true).catch(err => {
      console.warn(`primal-compendiums | Could not read the details of ${pack.collection}`, err);
      DETAILS.delete(pack);
      return false;
    });
    reading.done = false;
    reading.then(ok => reading.done = ok);
    DETAILS.set(pack, reading);
  }
  return reading;
}

/** Whether a compendium's extra index fields have been read. */
function isDetailed(pack) {
  return DETAILS.get(pack)?.done === true;
}

/**
 * The Compendiums side of a sidebar directory: the chosen compendiums of that directory's type, each one shown like
 * a folder holding its own folders and entries, drawn as Foundry's own folder and entry templates draw them, with
 * the directory's styles.
 *
 * It sits next to the directory in the sidebar as a second panel for the same tab (the same data-tab), and the
 * directory's controller shows one panel or the other. It is never put inside the directory's own element, so the
 * directory's search, drag-and-drop and right-click menus never see its entries.
 *
 * Compendiums can hold tens of thousands of entries between them, so the list is not drawn whole. What shows is
 * worked out from the compendiums' indexes (pack-model.mjs), and rows are drawn a few dozen at a time: only inside
 * compendiums and folders that are open, and only as far as the list has been scrolled. Searching, filtering and
 * sorting never touch entries that aren't drawn.
 */
export class PackDirectory extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} options
   * @param {DirectoryController} options.controller  The controller of the directory this panel belongs to.
   */
  constructor({ controller, ...options }) {
    super({ id: `primal-compendiums-${controller.tab}`, ...options });
    this.#controller = controller;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    tag: "section",
    classes: ["tab", "sidebar-tab", "directory", "flexcol", "primal-compendiums"],
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      activateEntry: PackDirectory.#onActivateEntry,
      choose: PackDirectory.#onChoose,
      collapseFolders: PackDirectory.#onCollapseFolders,
      openPack: PackDirectory.#onOpenPack,
      toggleFolder: PackDirectory.#onToggleFolder,
      togglePack: PackDirectory.#onTogglePack,
      toggleSort: PackDirectory.#onToggleSort
    }
  };

  /**
   * Part ids are prefixed so they can never be mistaken for the directory's own parts.
   * @override
   */
  static PARTS = {
    pcsHeader: {
      template: `${TEMPLATES}/header.hbs`
    },
    pcsList: {
      template: `${TEMPLATES}/list.hbs`,
      scrollable: [""]
    }
  };

  /** @type {DirectoryController} */
  #controller;

  /** The chosen compendiums, as of the last render. */
  #packs = [];

  /** Counts the renders, so nothing worked out for an earlier one is used again. */
  #version = 0;

  /** Each compendium's records, made as they are needed: pack => { detailed, context, map }. */
  #records = new Map();

  /** Names made ready for searching, by entry or folder. */
  #clean = new WeakMap();

  /** Every entry's record, for the filter tags: { stamp, list }. */
  #all = null;

  /** What the list shows now (pack-model.mjs), and the search, filters and sort it was worked out for. */
  #view = null;
  #drawnKey = null;

  /** What is still to draw in each list: ol => { folders, entries, next, more }. */
  #sources = new WeakMap();

  /** The view of each drawn folder and compendium, by its element. */
  #views = new WeakMap();

  /** Whether everything was collapsed since the list was drawn (so a search no longer holds folders open). */
  #collapsed = false;

  /** Guards against an older refresh finishing after a newer one. */
  #token = 0;

  /** Compendiums whose details are being read for their badges. */
  #waiting = new Set();

  /** Where the list was scrolled to before a re-render. */
  #place = 0;

  /** A pending drawing of more rows, and the watch on the list's size. */
  #frame = 0;
  #resize = null;

  /** The search box handler, kept between renders so the query survives them. */
  #search = new foundry.applications.ux.SearchFilter({
    inputSelector: "search input",
    contentSelector: ".directory-list",
    callback: this._onSearchFilter.bind(this)
  });

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** The sidebar tab this panel belongs to ("actors"). */
  get tabName() {
    return this.#controller.tab;
  }

  /** The document type listed ("Actor"). */
  get documentName() {
    return this.#controller.documentName;
  }

  /** The directory's controller. */
  get controller() {
    return this.#controller;
  }

  /** The current search text. */
  get query() {
    return this.#search.query ?? "";
  }

  /** The list's element. */
  get #list() {
    return this.element?.querySelector(".directory-list") ?? null;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  _canRender(options) {
    if ( !game.user?.isGM ) return false;
    return super._canRender(options);
  }

  /** @inheritDoc */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    frame.dataset.tab = this.tabName;
    frame.dataset.group = "primary";
    // The directory's own look (scene banners, journal padding) comes with its class.
    frame.classList.add(`${this.tabName}-sidebar`, `primal-compendiums-${this.tabName}`, "pcs-off");
    if ( ui.sidebar?.tabGroups?.primary === this.tabName ) frame.classList.add("active");
    return frame;
  }

  /**
   * Put the panel right after its directory in the sidebar.
   * @override
   */
  async _insertElement(element) {
    const host = this.#controller.hostElement();
    if ( host?.isConnected ) host.after(element);
    else (document.getElementById("sidebar-content") ?? document.body).append(element);
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const documentName = this.documentName;
    const packs = this.#controller.packs();
    for ( const pack of packs ) {
      if ( !pack.tree ) pack.initializeTree();
    }
    const sortMode = packs.length && packs.every(p => p.sortingMode === "m") ? "m" : "a";

    // Anything worked out from the compendiums before this render may be out of date.
    this.#packs = packs;
    this.#version++;
    this.#records.clear();
    this.#clean = new WeakMap();
    this.#all = null;

    const types = game.i18n.localize(CONFIG[documentName]?.documentClass?.metadata?.labelPlural ?? documentName);
    return Object.assign(context, {
      documentName,
      hasPacks: packs.length > 0,
      emptyText: loc("View.Empty", { types }),
      searchPlaceholder: loc("View.Search", { types }),
      sortMode: sortMode === "a"
        ? { icon: "fa-solid fa-arrow-down-a-z", label: "SIDEBAR.SortModeAlpha" }
        : { icon: "fa-solid fa-arrow-down-short-wide", label: "SIDEBAR.SortModeManual" }
    });
  }

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.element.prepend(this.#controller.buildSwitch());
    // Rows come and go as the list is scrolled, so dragging is listened for on the panel, not on each row.
    this.element.addEventListener("dragstart", event => this._onDragStart(event));
    // Scrolling doesn't bubble, but it can be caught on the way down, wherever in the panel it happens.
    this.element.addEventListener("scroll", () => this.#fillSoon(), { capture: true, passive: true });
    this._createContextMenu(this._getEntryContextOptions, ".directory-item.entry[data-uuid]", {
      fixed: true,
      hookName: "getPrimalCompendiumsEntryContext",
      parentClassHooks: false
    });
    this._createContextMenu(this._getPackContextOptions, ".directory-item.pcs-pack > .folder-header", {
      fixed: true,
      hookName: "getPrimalCompendiumsPackContext",
      parentClassHooks: false
    });
  }

  /**
   * The list is about to be replaced by an empty one: remember how far it was scrolled.
   * @inheritDoc
   */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    if ( partId === "pcsList" ) this.#place = priorElement?.scrollTop ?? 0;
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const parts = options.parts ?? [];
    const list = this.#list;
    if ( parts.includes("pcsList") && list ) {
      // A new, empty list.
      this.#view = null;
      this.#drawnKey = null;
      this.#resize?.disconnect();
      this.#resize = new ResizeObserver(() => this.#fillSoon());
      this.#resize.observe(list);
    }
    if ( parts.includes("pcsHeader") || parts.includes("pcsList") ) this.#search.bind(this.element);
    this.#controller.bar(MODES.packs).mount(this.element.querySelector(".pcs-header"));
    const place = this.#place;
    this.#place = 0;
    // Not waited for: the panel shows straight away, even if compendium details are still being read.
    this.refresh({ place }).catch(err => console.error("primal-compendiums | Could not draw the list", err));
  }

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    this.#resize?.disconnect();
    this.#resize = null;
  }

  /* -------------------------------------------- */
  /*  Right-click menus                           */
  /* -------------------------------------------- */

  /**
   * Right-click options for a compendium entry.
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getEntryContextOptions() {
    const documentName = this.documentName;
    const entryOf = li => splitUuid(li.closest("[data-uuid]")?.dataset.uuid);
    return [{
      label: "COMPENDIUM.ImportEntry",
      icon: "fa-solid fa-download",
      visible: () => {
        const cls = game.collections.get(documentName)?.documentClass;
        return !!cls?.canUserCreate(game.user);
      },
      onClick: async (event, li) => {
        const { pack, id } = entryOf(li);
        if ( !pack || !id ) return;
        const collection = game.collections.get(documentName);
        return collection.importFromCompendium(pack, id, {}, { clearOwnership: false, dialog: true, renderSheet: true });
      }
    }, {
      label: "PRIMAL_COMPENDIUMS.Context.OpenPack",
      icon: "fa-solid fa-book-atlas",
      onClick: (event, li) => entryOf(li).pack?.render(true)
    }, {
      label: "COMPENDIUM.DeleteEntry",
      icon: "fa-solid fa-trash",
      visible: li => {
        const { pack } = entryOf(li);
        return game.user.isGM && !!pack && !pack.locked;
      },
      onClick: async (event, li) => {
        const { pack, id } = entryOf(li);
        const document = await pack?.getDocument(id);
        return document?.deleteDialog();
      }
    }];
  }

  /**
   * Right-click options for a compendium's own header.
   * @returns {ContextMenuEntry[]}
   * @protected
   */
  _getPackContextOptions() {
    const packOf = header => game.packs.get(header.closest("[data-pack]")?.dataset.pack);
    return [{
      label: "PRIMAL_COMPENDIUMS.Context.OpenPack",
      icon: "fa-solid fa-book-atlas",
      onClick: (event, header) => packOf(header)?.render(true)
    }, {
      label: "COMPENDIUM.ImportAll.Option",
      icon: "fa-solid fa-download",
      onClick: (event, header) => packOf(header)?.importDialog()
    }, {
      label: "PRIMAL_COMPENDIUMS.Context.Remove",
      icon: "fa-solid fa-thumbtack-slash",
      onClick: (event, header) => {
        const pack = packOf(header);
        if ( pack ) return chooseOne(pack.collection, false);
      }
    }, {
      label: "PRIMAL_COMPENDIUMS.View.Choose",
      icon: "fa-solid fa-list-check",
      onClick: () => ChooserApp.open(this.documentName)
    }];
  }

  /* -------------------------------------------- */
  /*  Drag and drop                               */
  /* -------------------------------------------- */

  /**
   * Start dragging an entry (to the map, a sheet, or the world side of the directory) or a folder (to the world
   * side, which imports it with everything in it). The drag data is the same as Foundry's compendium window gives.
   * @param {DragEvent} event
   * @protected
   */
  _onDragStart(event) {
    const li = event.target?.closest?.(".directory-item.entry, .directory-item.folder:not(.pcs-pack)");
    if ( !li || !this.element.contains(li) ) return;
    ui.context?.close({ animate: false });
    const uuid = li.dataset.uuid;
    if ( !uuid ) return;
    const type = li.classList.contains("folder") ? "Folder" : this.documentName;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type, uuid }));
    event.stopPropagation();
  }

  /* -------------------------------------------- */
  /*  Search, filters and sort                    */
  /* -------------------------------------------- */

  /**
   * The search box changed (or the panel was drawn again): show what matches, across every compendium.
   * @protected
   */
  _onSearchFilter() {
    this.refresh().catch(err => console.error("primal-compendiums | Could not search the list", err));
  }

  /**
   * Work out what the list shows for the search, the filters and the sort as they are now, and draw it, reading
   * the compendiums' extra details first if the filters or the sort need them. Does nothing to the list if it
   * already shows just that.
   * @param {object} [options]
   * @param {number} [options.place]  Scroll back down to here after drawing.
   * @returns {Promise<void>}
   */
  async refresh({ place = 0 } = {}) {
    if ( !this.#list ) return;
    const bar = this.#controller.bar(MODES.packs);
    const { fields } = filtersFor(this.documentName);
    const token = ++this.#token;

    // Filters, their tags, and a sort on anything but the name all need every compendium's details.
    const needsAll = state => !!fields.length
      && (isFiltering(state) || state.open || (!!state.sort && (state.sort !== "name")));
    const reading = needsAll(bar.state) ? this.#readAllDetails(fields) : null;
    bar.setLoading(!!reading);
    this.#setReading(!!reading);
    if ( reading ) {
      await reading;
      if ( token !== this.#token ) return;
      bar.setLoading(false);
      this.#setReading(false);
    }

    const list = this.#list;
    if ( !list ) return;
    const state = bar.state;
    const query = this.query;
    const key = JSON.stringify([this.#version, query, state.sort, state.desc, state.flat, state.sets, state.range]);
    if ( key !== this.#drawnKey ) {
      const rgx = this.#search.rgx;
      const view = buildView({
        packs: this.#packs,
        state,
        test: query ? (name, source) => rgx.test(this.#cleanName(name, source)) : null,
        recordFor: (pack, entry) => this.#recordOf(pack, entry)
      });
      this.#draw(view);
      this.#drawnKey = key;
      if ( place ) this.#restore(place);
    }

    const view = this.#view;
    const narrowed = !!query || isFiltering(state);
    const none = list.querySelector(":scope > .pcs-no-match");
    if ( none ) none.hidden = !narrowed || (view.shown > 0) || (view.packs.length > 0);
    bar.update({
      records: state.open ? this.#allRecords() : [],
      shown: view.shown,
      total: view.total,
      searching: !!query
    });
  }

  /**
   * Read the extra index fields of every compendium in the panel that doesn't have them yet.
   * @param {string[]} fields
   * @returns {Promise|null}  Null when every compendium has them already.
   */
  #readAllDetails(fields) {
    const pending = this.#packs.filter(pack => !isDetailed(pack)).map(pack => readDetails(pack, fields));
    return pending.length ? Promise.all(pending) : null;
  }

  /**
   * Read one compendium's details for the badges of its drawn entries, and add the badges when they arrive.
   * @param {CompendiumCollection} pack
   */
  #wantDetails(pack) {
    if ( this.#waiting.has(pack) ) return;
    this.#waiting.add(pack);
    readDetails(pack, filtersFor(this.documentName).fields).then(ok => {
      this.#waiting.delete(pack);
      if ( ok ) this.#showBadges(pack);
    });
  }

  /** Show or hide the "reading compendium details" line at the top of the list. */
  #setReading(reading) {
    const note = this.#list?.querySelector(":scope > .pcs-reading");
    if ( note ) note.hidden = !reading;
  }

  /* -------------------------------------------- */
  /*  Records                                     */
  /* -------------------------------------------- */

  /**
   * An entry's record: its name, and its CR, creature type, rarity and source as far as the index has them.
   * Made once, and again once the compendium's details have been read.
   * @param {CompendiumCollection} pack
   * @param {object} entry   The index entry.
   * @returns {object}
   */
  #recordOf(pack, entry) {
    const detailed = isDetailed(pack);
    let cache = this.#records.get(pack);
    if ( !cache || (cache.detailed !== detailed) ) {
      cache = { detailed, context: recordContext(this.documentName, pack), map: new Map() };
      this.#records.set(pack, cache);
      this.#all = null;
    }
    let record = cache.map.get(entry._id);
    if ( !record ) {
      record = recordOf(pack.index.get(entry._id) ?? entry, cache.context);
      cache.map.set(entry._id, record);
    }
    return record;
  }

  /**
   * Every entry's record, for the filter tags and their counts. The same list is handed back until something
   * changes, so the filter bar only counts it once.
   * @returns {object[]}
   */
  #allRecords() {
    const stamp = `${this.#version}:${this.#packs.filter(isDetailed).length}`;
    if ( this.#all?.stamp === stamp ) return this.#all.list;
    const list = [];
    for ( const pack of this.#packs ) {
      for ( const entry of pack.index.values() ) list.push(this.#recordOf(pack, entry));
    }
    this.#all = { stamp, list };
    return list;
  }

  /** A name made ready for searching (no accents, as the search text is), worked out once. */
  #cleanName(name, source) {
    let clean = this.#clean.get(source);
    if ( clean === undefined ) {
      clean = foundry.applications.ux.SearchFilter.cleanQuery(String(name ?? ""));
      this.#clean.set(source, clean);
    }
    return clean;
  }

  /* -------------------------------------------- */
  /*  Drawing                                     */
  /* -------------------------------------------- */

  /**
   * Draw a view from the top: clear the list and draw its first rows. The rest is drawn as it is scrolled to.
   * @param {PanelView} view
   */
  #draw(view) {
    const list = this.#list;
    this.#view = view;
    this.#collapsed = false;
    for ( const el of Array.from(list.children) ) {
      if ( el.classList.contains("directory-item") || el.classList.contains("pcs-more") ) el.remove();
    }
    list.classList.toggle("pcs-flat", view.flat);
    this.#sources.set(list, view.flat
      ? { folders: [], entries: view.rows, next: 0, more: null }
      : { folders: view.packs, entries: [], next: 0, more: null });
    list.scrollTop = 0;
    this.#start(list);
    this.#drawChunk(list);
    this.fill();
  }

  /**
   * Make a list ready to be drawn into: put a marker at its end, where its next rows go. The marker stays for as
   * long as the list has rows left to draw.
   * @param {HTMLElement} ol
   */
  #start(ol) {
    const source = this.#sources.get(ol);
    if ( !source || source.more || (source.next >= source.folders.length + source.entries.length) ) return;
    const more = document.createElement("li");
    more.className = "pcs-more";
    more.setAttribute("aria-hidden", "true");
    // In the panel's own list, rows go before the notes at its end.
    ol.insertBefore(more, ol.querySelector(":scope > .pcs-empty, :scope > .pcs-no-match"));
    source.more = more;
  }

  /**
   * Draw a list's next rows: its folders first, then its entries.
   * @param {HTMLElement} ol
   * @returns {number}  How many rows were drawn.
   */
  #drawChunk(ol) {
    const source = this.#sources.get(ol);
    if ( !source?.more ) return 0;
    const { folders, entries } = source;
    const total = folders.length + entries.length;
    const rows = document.createDocumentFragment();
    let made = 0;
    for ( ; (made < CHUNK) && (source.next < total); made++ ) {
      const i = source.next++;
      rows.append(i < folders.length ? this.#folderRow(folders[i]) : this.#entryRow(entries[i - folders.length]));
    }
    ol.insertBefore(rows, source.more);
    if ( source.next >= total ) {
      source.more.remove();
      source.more = null;
    }
    return made;
  }

  /**
   * Draw rows wherever a list that has more to draw ends on screen, or near it, until none does. Called as the
   * list is scrolled, resized, shown, and as folders open and close.
   * @returns {number}  How many rows were drawn.
   */
  fill() {
    const list = this.#list;
    if ( !list?.clientHeight ) return 0;
    let made = 0;
    for ( let pass = 0; pass < 100; pass++ ) {
      // The part of the list on screen. (The list scrolls inside itself; if something made it as tall as its
      // contents instead, the window is what bounds it.)
      const box = list.getBoundingClientRect();
      const top = Math.max(box.top, 0) - MARGIN;
      const bottom = Math.min(box.bottom, window.innerHeight) + MARGIN;
      let next = null;
      for ( const more of list.getElementsByClassName("pcs-more") ) {
        // A marker inside a closed folder isn't laid out at all.
        if ( !more.getClientRects().length ) continue;
        const at = more.getBoundingClientRect();
        if ( (at.top > bottom) || (at.bottom < top) ) continue;
        next = more;
        break;
      }
      if ( !next ) break;
      made += this.#drawChunk(next.parentElement);
    }
    return made;
  }

  /** Draw more rows on the next frame. */
  #fillSoon() {
    if ( this.#frame ) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.fill();
    });
  }

  /**
   * Scroll the list back down to where it was, drawing as many rows as that takes.
   * @param {number} place
   */
  #restore(place) {
    const list = this.#list;
    if ( !(place > 0) || !list?.clientHeight ) return;
    for ( let i = 0; i < 200; i++ ) {
      list.scrollTop = place;
      if ( list.scrollTop >= place - 1 ) break;
      if ( !this.fill() ) break;
    }
    this.fill();
  }

  /**
   * Whether a folder or compendium is open: because the search or the filters found something in it, or because
   * it was left open.
   * @param {FolderView|PackView} view
   */
  #isOpen(view) {
    if ( view.forced && !this.#collapsed ) return true;
    if ( view.isPack ) return isPackExpanded(getExpanded(), view.pack.collection, this.#packs.length);
    return view.uuid in (game.folders._expanded ?? {});
  }

  /**
   * A folder's or compendium's row is drawn: note what goes in it, and get it ready to be filled if it is open.
   * @param {HTMLElement} li
   * @param {HTMLElement} ol
   * @param {FolderView|PackView} view
   */
  #adopt(li, ol, view) {
    this.#views.set(li, view);
    this.#sources.set(ol, { folders: view.folders, entries: view.entries, next: 0, more: null });
    if ( !this.#isOpen(view) ) return;
    li.classList.add("expanded");
    this.#start(ol);
  }

  /**
   * A compendium's row, drawn like a folder with the compendium's banner behind its name.
   * @param {PackView} view
   * @returns {HTMLElement}
   */
  #packRow(view) {
    const pack = view.pack;
    const li = document.createElement("li");
    li.className = `directory-item folder flexcol pcs-pack ${pack.locked ? "locked" : "unlocked"}`;
    li.dataset.pack = pack.collection;
    li.dataset.folderDepth = "0";

    const header = document.createElement("header");
    header.className = "folder-header pcs-pack-header";
    header.dataset.action = "togglePack";
    const banner = pack.banner;
    if ( banner ) {
      const url = String(banner).replace(/["\\\n]/g, c => `\\${c}`);
      header.style.setProperty("background-image", `var(--pcs-shade), url("${url}")`);
    }
    header.innerHTML = '<span class="pcs-pack-icon" inert><i class="fa-solid fa-book-atlas fa-fw"></i></span>'
      + '<span class="folder-name ellipsis"></span><span class="pcs-count"></span>'
      + '<button type="button" class="create-button pcs-open icon fa-solid fa-arrow-up-right-from-square"'
      + ' data-action="openPack" data-tooltip></button>';
    header.querySelector(".folder-name").textContent = pack.title ?? "";
    const count = header.querySelector(".pcs-count");
    count.textContent = String(pack.index?.size ?? 0);
    count.dataset.tooltip = sourceLabel(pack);
    header.querySelector(".pcs-open").setAttribute("aria-label", loc("Context.OpenPack"));

    const ol = document.createElement("ol");
    ol.className = "subdirectory plain";
    li.append(header, ol);
    this.#adopt(li, ol, view);
    return li;
  }

  /**
   * One of a compendium's folders, drawn as Foundry's own folder template draws one.
   * @param {FolderView|PackView} view
   * @returns {HTMLElement}
   */
  #folderRow(view) {
    if ( view.isPack ) return this.#packRow(view);
    const folder = view.folder;
    const li = document.createElement("li");
    li.className = "directory-item folder flexcol";
    li.dataset.folderId = folder.id ?? folder._id ?? "";
    li.dataset.uuid = view.uuid;
    li.dataset.folderDepth = String(view.depth);
    li.draggable = true;
    const color = folder.color?.css ?? "";

    const header = document.createElement("header");
    header.className = "folder-header";
    header.dataset.action = "toggleFolder";
    if ( color ) header.style.backgroundColor = color;
    header.innerHTML = '<i class="fa-solid fa-folder-open fa-fw" inert></i><span class="folder-name ellipsis"></span>';
    header.lastElementChild.textContent = folder.name ?? "";

    const ol = document.createElement("ol");
    ol.className = "subdirectory plain";
    if ( color ) ol.style.borderLeftColor = color;
    li.append(header, ol);
    this.#adopt(li, ol, view);
    return li;
  }

  /**
   * An entry's row, drawn as Foundry's directories draw one (scenes as banners).
   * @param {EntryRow} row
   * @returns {HTMLElement}
   */
  #entryRow({ pack, entry }) {
    const documentName = this.documentName;
    const scene = documentName === "Scene";
    const name = entry.name ?? "";
    const li = document.createElement("li");
    li.className = scene
      ? "directory-item entry document scene"
      : `directory-item entry document ${documentName.toLowerCase()} flexrow`;
    li.dataset.uuid = entry.uuid ?? pack.getUuid(entry._id);
    li.draggable = true;

    const src = scene ? (entry.thumb || entry.img) : entry.img;
    if ( src ) {
      const img = document.createElement("img");
      img.className = "thumbnail";
      img.loading = "lazy";
      img.alt = name;
      img.src = src;
      li.append(img);
    }
    else if ( !scene ) {
      const icon = document.createElement("i");
      icon.className = `pcs-entry-icon ${CONFIG[documentName]?.sidebarIcon ?? ""}`;
      icon.inert = true;
      li.append(icon);
    }
    const a = document.createElement("a");
    a.className = scene ? "entry-name" : "entry-name ellipsis";
    a.dataset.action = "activateEntry";
    a.textContent = name;
    li.append(a);

    // Actors show their CR. It is in the compendium's details, which are read when its entries are first drawn.
    if ( filtersFor(documentName).badge ) {
      setBadge(li, this.#recordOf(pack, entry));
      if ( !isDetailed(pack) ) this.#wantDetails(pack);
    }
    // With the compendium groups out of sight, say which compendium an entry is from.
    if ( this.#view?.flat ) {
      li.dataset.tooltip = pack.title ?? "";
      li.dataset.tooltipDirection = "LEFT";
    }
    return li;
  }

  /**
   * A compendium's details arrived: give its drawn entries their badges.
   * @param {CompendiumCollection} pack
   */
  #showBadges(pack) {
    for ( const li of this.#list?.querySelectorAll(".directory-item.entry[data-uuid]") ?? [] ) {
      const at = splitUuid(li.dataset.uuid);
      if ( at.pack !== pack ) continue;
      const entry = pack.index.get(at.id);
      if ( entry ) setBadge(li, this.#recordOf(pack, entry));
    }
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Open the clicked entry's sheet, as Foundry's compendium window does.
   * @this {PackDirectory}
   */
  static async #onActivateEntry(event, target) {
    event.preventDefault();
    const { pack, id } = splitUuid(target.closest("[data-uuid]")?.dataset.uuid);
    if ( !pack || !id ) return;
    const document = await pack.getDocument(id);
    document?.sheet?.render(true);
  }

  /**
   * A folder or compendium was opened: draw what is in it.
   * @param {HTMLElement} li
   */
  #opened(li) {
    const ol = li.querySelector(":scope > .subdirectory");
    if ( ol ) this.#start(ol);
    this.fill();
  }

  /**
   * Open or close one of the compendium's folders. Shared with the compendium's own window.
   * @this {PackDirectory}
   */
  static #onToggleFolder(event, target) {
    const li = target.closest(".directory-item.folder");
    if ( !li ) return;
    const expanded = li.classList.toggle("expanded");
    const { uuid } = li.dataset;
    if ( expanded ) {
      game.folders._expanded[uuid] = true;
      return this.#opened(li);
    }
    // Closing a folder closes the folders in it too, drawn or not.
    delete game.folders._expanded[uuid];
    for ( const sub of li.querySelectorAll(".directory-item.folder") ) sub.classList.remove("expanded");
    for ( const folder of foldersUnder(this.#views.get(li)?.node) ) delete game.folders._expanded[folder.uuid];
    this.fill();
  }

  /**
   * Open or close a whole compendium.
   * @this {PackDirectory}
   */
  static #onTogglePack(event, target) {
    const li = target.closest(".pcs-pack");
    if ( !li ) return;
    const open = li.classList.toggle("expanded");
    setExpanded(li.dataset.pack, open);
    if ( open ) this.#opened(li);
    else this.fill();
  }

  /**
   * Open a compendium's own window.
   * @this {PackDirectory}
   */
  static #onOpenPack(event, target) {
    event.stopPropagation();
    game.packs.get(target.closest("[data-pack]")?.dataset.pack)?.render(true);
  }

  /**
   * Close every folder and compendium in the panel.
   * @this {PackDirectory}
   */
  static #onCollapseFolders() {
    const changes = {};
    for ( const pack of this.#packs ) {
      changes[pack.collection] = false;
      for ( const folder of foldersUnder(pack.tree) ) delete game.folders._expanded[folder.uuid];
    }
    this.#collapsed = true;
    for ( const el of this.element.querySelectorAll(".directory-item.folder.expanded") ) el.classList.remove("expanded");
    if ( Object.keys(changes).length ) setExpandedMany(changes);
    this.fill();
  }

  /**
   * Switch every compendium in the panel between alphabetical and manual order, as the directories' own button
   * does. The order is Foundry's own per-compendium setting, so the compendium windows follow it too.
   * @this {PackDirectory}
   */
  static async #onToggleSort() {
    const packs = this.#controller.packs();
    if ( !packs.length ) return;
    const current = packs.every(p => p.sortingMode === "m") ? "m" : "a";
    const next = current === "a" ? "m" : "a";
    const modes = { ...game.settings.get("core", "collectionSortingModes") };
    for ( const pack of packs ) modes[pack.collection] = next;
    await game.settings.set("core", "collectionSortingModes", modes);
    for ( const pack of packs ) pack.initializeTree();
    return this.render();
  }

  /**
   * Open the Choose Compendiums window for this directory.
   * @this {PackDirectory}
   */
  static #onChoose() {
    return ChooserApp.open(this.documentName);
  }
}
