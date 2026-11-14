import { MODULE_ID, DIRECTORIES, SETTINGS, loc, pluralLabel, sourceLabel } from "./constants.mjs";
import { packsOfType, sidebarOrder, mergeChoices } from "./logic.mjs";
import { getChosen, setChosen, hideUnused } from "./state.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The Choose Compendiums window: a tickbox for every compendium, grouped by the directory it goes in.
 * Opened from a directory's Compendiums tab (showing just that directory) or from the module settings (all of them).
 * Each tick saves at once.
 */
export class ChooserApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} [options]
   * @param {string|null} [options.documentName]  Only list compendiums of this type.
   */
  constructor({ documentName = null, ...options } = {}) {
    super(options);
    this.documentName = documentName;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "primal-compendiums-chooser",
    tag: "form",
    classes: ["primal-compendiums-chooser"],
    window: {
      title: "PRIMAL_COMPENDIUMS.Chooser.Title",
      icon: "fa-solid fa-book-atlas",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: { width: 460, height: 620 },
    form: {
      handler: ChooserApp.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      showAll: ChooserApp.#onShowAll,
      tickAll: ChooserApp.#onTickAll,
      tickNone: ChooserApp.#onTickNone
    }
  };

  /** @override */
  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/chooser.hbs`,
      scrollable: [".pcs-chooser-list"]
    }
  };

  /**
   * Open the window, or bring the open one to the front showing the given directory.
   * @param {string|null} [documentName]
   * @returns {Promise<ChooserApp>}
   */
  static open(documentName = null) {
    const existing = foundry.applications.instances.get(ChooserApp.DEFAULT_OPTIONS.id);
    if ( existing instanceof ChooserApp ) {
      existing.documentName = documentName;
      return existing.render({ force: true, window: { title: existing.title } });
    }
    return new ChooserApp({ documentName }).render({ force: true });
  }

  /** Re-draw the open window, if any (after the choices change elsewhere). */
  static refresh() {
    const existing = foundry.applications.instances.get(ChooserApp.DEFAULT_OPTIONS.id);
    if ( existing?.rendered ) existing.render();
  }

  /** @override */
  get title() {
    if ( !this.documentName ) return game.i18n.localize(this.options.window.title);
    return loc("Chooser.TitleFor", { directory: pluralLabel(this.documentName) });
  }

  /** @override */
  _canRender(options) {
    if ( !game.user?.isGM ) return false;
    return super._canRender(options);
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const chosen = new Set(getChosen());
    const order = sidebarOrder(game.packs.tree);
    const sections = [];
    for ( const documentName of Object.values(DIRECTORIES) ) {
      if ( this.documentName && (documentName !== this.documentName) ) continue;
      const packs = packsOfType(game.packs, documentName, order).map(pack => ({
        id: pack.collection,
        title: pack.title,
        source: sourceLabel(pack),
        count: pack.index?.size ?? 0,
        checked: chosen.has(pack.collection)
      }));
      if ( !packs.length ) continue;
      const ticked = packs.filter(p => p.checked).length;
      sections.push({
        documentName,
        label: pluralLabel(documentName),
        icon: CONFIG[documentName]?.sidebarIcon,
        tally: loc("Chooser.Tally", { ticked, total: packs.length }),
        packs
      });
    }
    return Object.assign(context, {
      sections,
      hideUnused: hideUnused(),
      filtered: !!this.documentName
    });
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const filter = this.element.querySelector("input.pcs-filter");
    filter?.addEventListener("input", () => this.#applyFilter(filter.value));
    // The filter box is not part of the choices: keep it from saving the form.
    filter?.addEventListener("change", event => event.stopPropagation());
    if ( filter?.value ) this.#applyFilter(filter.value);
  }

  /**
   * Hide compendiums whose name or source doesn't contain the filter text.
   * @param {string} text
   */
  #applyFilter(text) {
    const clean = foundry.applications.ux.SearchFilter.cleanQuery(text ?? "").toLowerCase();
    let any = false;
    for ( const section of this.element.querySelectorAll(".pcs-section") ) {
      let shown = 0;
      for ( const label of section.querySelectorAll(".pcs-chooser-pack") ) {
        const hay = foundry.applications.ux.SearchFilter.cleanQuery(label.dataset.search ?? "").toLowerCase();
        const match = !clean || hay.includes(clean);
        label.hidden = !match;
        if ( match ) shown++;
      }
      section.hidden = !shown;
      if ( shown ) any = true;
    }
    const none = this.element.querySelector(".pcs-no-match");
    if ( none ) none.hidden = any || !clean;
  }

  /**
   * Save the ticks. Compendiums the window doesn't list keep their earlier choice.
   * @this {ChooserApp}
   */
  static async #onSubmit(event, form) {
    const boxes = Array.from(form.querySelectorAll("input[data-pack]"));
    const shown = boxes.map(b => b.dataset.pack);
    const ticked = boxes.filter(b => b.checked).map(b => b.dataset.pack);
    const before = getChosen();
    const next = mergeChoices(before, shown, ticked);
    const same = (next.length === before.length) && next.every(id => before.includes(id));
    if ( !same ) await setChosen(next);

    const hide = !!form.querySelector("input[name=hideUnused]")?.checked;
    if ( hide !== hideUnused() ) await game.settings.set(MODULE_ID, SETTINGS.hideUnused, hide);

    // Keep the tallies in step without re-drawing the list.
    for ( const section of form.querySelectorAll(".pcs-section") ) {
      const all = section.querySelectorAll("input[data-pack]");
      const on = section.querySelectorAll("input[data-pack]:checked");
      const tally = section.querySelector(".pcs-tally");
      if ( tally ) tally.textContent = loc("Chooser.Tally", { ticked: on.length, total: all.length });
    }
  }

  /**
   * Tick (or untick) every compendium of one directory that the filter shows, then save.
   * @param {HTMLElement} target
   * @param {boolean} on
   */
  #tickSection(target, on) {
    const section = target.closest(".pcs-section");
    if ( !section ) return;
    for ( const box of section.querySelectorAll("input[data-pack]") ) {
      if ( box.closest(".pcs-chooser-pack")?.hidden ) continue;
      box.checked = on;
    }
    this.element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /** @this {ChooserApp} */
  static #onTickAll(event, target) {
    this.#tickSection(target, true);
  }

  /** @this {ChooserApp} */
  static #onTickNone(event, target) {
    this.#tickSection(target, false);
  }

  /**
   * List every directory's compendiums.
   * @this {ChooserApp}
   */
  static #onShowAll() {
    this.documentName = null;
    return this.render({ window: { title: this.title } });
  }
}
