import { DIRECTORIES, MODES, DRAG_SWITCH_DELAY, loc, pluralLabel } from "./constants.mjs";
import { packsFor, sidebarOrder } from "./logic.mjs";
import { getChosen, getMode, setMode, hideUnused } from "./state.mjs";
import { PackDirectory } from "./pack-view.mjs";
import { FilterBar } from "./filter-bar.mjs";
import { filterList, recordContext, setBadge } from "./filtering.mjs";
import { filtersFor, recordOf } from "./filter-logic.mjs";

/**
 * One controller per sidebar directory (actors, items, scenes, ...). It puts the World / Compendiums switch at the
 * top of the directory, keeps the Compendiums panel next to it, and shows one or the other.
 *
 * Nothing is built until it is needed: the panel is only drawn the first time the GM opens a directory's
 * Compendiums side, and only re-drawn while it is on screen.
 */
export class DirectoryController {
  /** @param {string} tab  The sidebar tab name. */
  constructor(tab) {
    this.tab = tab;
    this.documentName = DIRECTORIES[tab];
  }

  /** @type {PackDirectory|null} */
  view = null;

  /** Whether the panel needs drawing again before it is next shown. */
  dirty = true;

  /** The pending switch while something is dragged over the switch. */
  #dragTimer = null;

  /** The filter and sort bars of the two sides, made when first shown. */
  #bars = {};

  /** Re-draw (or mark for re-drawing) soon, gathering bursts of changes into one. */
  refresh = foundry.utils.debounce(() => this.#refresh(), 60);

  /* -------------------------------------------- */

  /**
   * The directory application in the sidebar, if it is drawn there.
   * @returns {DocumentDirectory|null}
   */
  get host() {
    const app = ui[this.tab];
    if ( !app?.rendered || app.isPopout ) return null;
    return app;
  }

  /** The directory's element in the sidebar. */
  hostElement() {
    return this.host?.element ?? null;
  }

  /** Whether the directory is the open sidebar tab. */
  get isActiveTab() {
    return ui.sidebar?.tabGroups?.primary === this.tab;
  }

  /** The side the GM left the directory on. */
  get mode() {
    return getMode(this.tab);
  }

  /** The chosen compendiums for this directory, in Compendium sidebar order. */
  packs() {
    return packsFor({
      packs: game.packs,
      documentName: this.documentName,
      chosen: getChosen(),
      order: sidebarOrder(game.packs.tree)
    });
  }

  /** Whether this directory gets the switch at all. */
  get enabled() {
    if ( !game.user?.isGM ) return false;
    if ( !game.packs.some(p => p.documentName === this.documentName) ) return false;
    if ( hideUnused() && !this.packs().length ) return false;
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Called each time the directory renders: make sure the switch is in it and the right side shows.
   * @param {DocumentDirectory} app
   */
  attach(app) {
    const element = app?.element;
    if ( !element ) return;
    if ( !this.enabled ) {
      this.#removeSwitches();
      element.classList.remove("pcs-off");
      this.view?.element?.classList.add("pcs-off");
      return;
    }
    if ( !element.querySelector(":scope > .pcs-switch") ) element.prepend(this.buildSwitch());
    const panel = this.view?.element;
    if ( panel && (panel.previousElementSibling !== element) ) element.after(panel);
    this.#syncSwitches();
    return this.#apply();
  }

  /* -------------------------------------------- */
  /*  Filters and sort                            */
  /* -------------------------------------------- */

  /**
   * The filter and sort bar of one side.
   * @param {"world"|"packs"} side
   * @returns {FilterBar}
   */
  bar(side) {
    side = side === MODES.packs ? MODES.packs : MODES.world;
    this.#bars[side] ??= new FilterBar({
      tab: this.tab,
      side,
      documentName: this.documentName,
      onChange: (state, previous) => this.#onFilterChange(side, state, previous)
    });
    return this.#bars[side];
  }

  /**
   * Called each time the directory renders: put the bar under its search box and filter what it drew.
   * @param {DocumentDirectory} app
   */
  attachWorldFilters(app) {
    const header = app?.element?.querySelector(".directory-header");
    if ( !header ) return;
    this.bar(MODES.world).mount(header);
    if ( !app.element.dataset.pcsDropGuard ) {
      app.element.dataset.pcsDropGuard = "true";
      app.element.addEventListener("drop", event => this.#guardDrop(event, app), true);
    }
    this.filterWorld(app);
  }

  /**
   * While folders are ignored, a drop inside the list would still move the dropped entry into a folder (or out of
   * one) that can't be seen. Stop entries of this world being moved that way. Entries dropped in from a
   * compendium, or from anywhere else, are still imported.
   * @param {DragEvent} event
   * @param {DocumentDirectory} app
   */
  #guardDrop(event, app) {
    if ( !this.bar(MODES.world).state.flat ) return;
    if ( !event.target?.closest?.(".directory-list") ) return;
    let data;
    try {
      data = JSON.parse(event.dataTransfer?.getData("text/plain") || "null");
    } catch(err) {
      return;
    }
    const uuid = data?.uuid;
    if ( (data?.type !== this.documentName) || (typeof uuid !== "string") || uuid.startsWith("Compendium.") ) return;
    if ( !app.collection?.get(uuid.split(".").pop()) ) return;
    event.preventDefault();
    event.stopPropagation();
    ui.notifications?.info(loc("Filter.FlatNoMove"));
  }

  /**
   * Filter and sort the world side as drawn. Also runs after each search, since the search shows entries again.
   * @param {DocumentDirectory} [app]
   */
  filterWorld(app = this.host) {
    const root = app?.element?.querySelector(".directory-list");
    if ( !root ) return;
    const bar = this.bar(MODES.world);
    const context = recordContext(this.documentName);
    const collection = app.collection;
    const result = filterList(root, {
      state: bar.state,
      recordFor: li => {
        const document = collection?.get(li.dataset.entryId);
        return document ? recordOf(document, context) : null;
      },
      restoreExpanded: folder => folder.dataset.uuid in (game.folders._expanded ?? {}),
      decorate: filtersFor(this.documentName).badge ? setBadge : undefined
    });
    const query = app.element.querySelector("search input[type=search]")?.value?.trim();
    bar.update({ ...result, searching: !!query });
  }

  /**
   * A bar changed: filter again. On the world side, going back to the default order, or to folders, needs the
   * list drawn afresh by Foundry. The Compendiums side draws its own list, for whatever the bar says.
   * @param {"world"|"packs"} side
   * @param {object} state
   * @param {object} previous
   */
  async #onFilterChange(side, state, previous) {
    if ( side === MODES.world ) {
      const app = this.host;
      if ( !app ) return;
      const redraw = (!!previous?.sort && !state.sort) || (!!previous?.flat && !state.flat);
      if ( redraw ) return app.render();
      return this.filterWorld(app);
    }
    if ( !this.view?.rendered ) return;
    return this.view.refresh();
  }

  /* -------------------------------------------- */

  /** Called when the sidebar opens this directory's tab. */
  onActivate() {
    const app = this.host;
    if ( app ) this.attach(app);
  }

  /**
   * Switch the directory to one side.
   * @param {"world"|"packs"} mode
   */
  async switchTo(mode) {
    if ( mode !== MODES.packs ) mode = MODES.world;
    const saving = setMode(this.tab, mode);
    this.#syncSwitches(mode);
    await this.#apply();
    await saving;
  }

  /* -------------------------------------------- */

  /** Show the side the GM chose, drawing the panel first if it is needed. */
  async #apply() {
    const wantsPacks = () => this.enabled && (this.mode === MODES.packs);
    if ( wantsPacks() && this.isActiveTab ) await this.#ensureView();

    // The choice may have changed while the panel was drawing: read it again.
    const showPacks = wantsPacks() && !!this.view?.rendered;
    this.hostElement()?.classList.toggle("pcs-off", showPacks);
    this.view?.element?.classList.toggle("pcs-off", !showPacks);
    this.#syncSwitches();
    // The panel only draws the rows that are on screen, which it can't tell until it shows.
    if ( showPacks ) this.view.fill();
  }

  /** Draw the panel if it hasn't been drawn, or changed since. */
  async #ensureView() {
    this.view ??= new PackDirectory({ controller: this });
    if ( this.view.rendered && !this.dirty ) return;
    this.dirty = false;
    try {
      await this.view.render({ force: true });
    } catch(err) {
      this.dirty = true;
      console.error(`primal-compendiums | Could not draw the ${this.tab} Compendiums tab`, err);
    }
  }

  /** Re-draw now if on screen, otherwise when next shown. */
  #refresh() {
    this.dirty = true;
    const app = this.host;
    if ( app ) this.attach(app);
  }

  /* -------------------------------------------- */
  /*  The switch                                  */
  /* -------------------------------------------- */

  /**
   * Build a World / Compendiums switch. One sits at the top of the directory and one at the top of the panel,
   * so the switch stays in place whichever side shows.
   * @returns {HTMLElement}
   */
  buildSwitch() {
    const directory = pluralLabel(this.documentName);
    const nav = document.createElement("nav");
    nav.className = "pcs-switch";
    nav.setAttribute("aria-label", loc("Switch.Label", { directory }));
    const button = (mode, icon, label, tooltip) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pcs-mode";
      b.dataset.pcsMode = mode;
      b.dataset.tooltip = tooltip;
      b.dataset.tooltipDirection = "UP";
      b.innerHTML = `<i class="${icon}" inert></i><span></span>`;
      b.querySelector("span").textContent = label;
      b.addEventListener("click", event => {
        event.preventDefault();
        this.switchTo(mode);
      });
      // Hold a dragged entry over a side to switch to it, then drop it there.
      b.addEventListener("dragenter", () => this.#onDragHover(b, true));
      b.addEventListener("dragleave", event => {
        if ( !b.contains(event.relatedTarget) ) this.#onDragHover(b, false);
      });
      b.addEventListener("drop", () => this.#onDragHover(b, false));
      return b;
    };
    nav.append(
      button(MODES.world, "fa-solid fa-earth-americas", loc("Switch.World"), loc("Switch.WorldHint", { directory })),
      button(MODES.packs, "fa-solid fa-book-atlas", loc("Switch.Packs"), loc("Switch.PacksHint", { directory }))
    );
    this.#syncSwitches(this.mode, [nav]);
    return nav;
  }

  /**
   * Start or cancel a switch while something is dragged over one side of the switch.
   * @param {HTMLElement} button
   * @param {boolean} over
   */
  #onDragHover(button, over) {
    clearTimeout(this.#dragTimer);
    this.#dragTimer = null;
    button.classList.toggle("pcs-drag-hover", over);
    if ( !over ) return;
    const mode = button.dataset.pcsMode;
    if ( mode === this.mode ) return;
    this.#dragTimer = setTimeout(() => {
      button.classList.remove("pcs-drag-hover");
      this.switchTo(mode);
    }, DRAG_SWITCH_DELAY);
  }

  /** Every switch for this directory that is in the page. */
  #switches() {
    const list = [];
    const host = this.hostElement()?.querySelector(":scope > .pcs-switch");
    if ( host ) list.push(host);
    const panel = this.view?.element?.querySelector(":scope > .pcs-switch");
    if ( panel ) list.push(panel);
    return list;
  }

  /**
   * Mark the current side on the switches.
   * @param {string} [mode]
   * @param {HTMLElement[]} [switches]
   */
  #syncSwitches(mode = this.mode, switches = this.#switches()) {
    for ( const nav of switches ) {
      for ( const b of nav.querySelectorAll("[data-pcs-mode]") ) {
        const active = b.dataset.pcsMode === mode;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", String(active));
      }
    }
  }

  /** Take the switches out (the directory no longer gets one). */
  #removeSwitches() {
    for ( const nav of this.#switches() ) nav.remove();
  }
}

/* -------------------------------------------- */
/*  Registry                                    */
/* -------------------------------------------- */

const controllers = new Map();

/**
 * The controller for a sidebar tab, created on first use.
 * @param {string} tab
 * @returns {DirectoryController|null}
 */
export function controllerFor(tab) {
  if ( !(tab in DIRECTORIES) ) return null;
  let controller = controllers.get(tab);
  if ( !controller ) {
    controller = new DirectoryController(tab);
    controllers.set(tab, controller);
  }
  return controller;
}

/** Every controller made so far. */
export function allControllers() {
  return Array.from(controllers.values());
}

/**
 * Re-draw every directory's panel (now if on screen, otherwise when next shown) and refresh its switch.
 * @param {string} [documentName]  Only the directory for this document type.
 */
export function refreshDirectories(documentName) {
  for ( const tab of Object.keys(DIRECTORIES) ) {
    if ( documentName && (DIRECTORIES[tab] !== documentName) ) continue;
    controllerFor(tab)?.refresh();
  }
}

/**
 * The controller of a directory drawn in the sidebar (not a pop-out, and not a compendium window, which is a
 * directory too), if it has one.
 * @param {DocumentDirectory} app
 * @returns {DirectoryController|null}
 */
function sidebarController(app) {
  if ( !game.user?.isGM || !app ) return null;
  if ( app instanceof foundry.applications.sidebar.apps.Compendium ) return null;
  if ( app.isPopout ) return null;
  const tab = app.tabName ?? app.constructor?.tabName;
  const controller = controllerFor(tab);
  if ( !controller || (ui[tab] !== app) ) return null;
  if ( app.documentName !== controller.documentName ) return null;
  return controller;
}

/**
 * The renderDocumentDirectory hook: add the filter bar and the World / Compendiums switch to Foundry's sidebar
 * directories. Every directory gets the filter bar, even one with no compendiums to switch to.
 * @param {DocumentDirectory} app
 */
export function onRenderDirectory(app) {
  const controller = sidebarController(app);
  if ( !controller ) return;
  try {
    controller.attachWorldFilters(app);
  } catch(err) {
    console.error("primal-compendiums | Could not add the filters", err);
  }
  controller.attach(app);
}

/**
 * After a sidebar directory's own search has shown and hidden its entries: filter them again.
 * @param {DocumentDirectory} app
 */
export function onDirectorySearched(app) {
  const controller = sidebarController(app);
  if ( !controller ) return;
  try {
    controller.filterWorld(app);
  } catch(err) {
    console.error("primal-compendiums | Could not filter the directory", err);
  }
}
