/**
 * The "Arrange Token HUD buttons" window: the HUD's left and right columns side by side. Drag a button to move it,
 * or use its arrows to move it up, down or to the other side. Open to every user; each user arranges their own HUD.
 */
import { MODULE_ID } from "../constants.mjs";
import { isButtonShown } from "../buttons.mjs";
import { hasLayout, layoutForEditing, saveLayout } from "../layout.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HudLayoutConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "primal-hud-layout",
    tag: "form",
    classes: ["primal-hud-layout-config"],
    window: {
      title: "PRIMAL_HUD.Layout.Title",
      icon: "fa-solid fa-arrows-left-right",
      contentClasses: ["standard-form"]
    },
    position: { width: 600, height: "auto" },
    form: {
      handler: HudLayoutConfig.#onSubmit,
      closeOnSubmit: true
    },
    actions: {
      moveUp: HudLayoutConfig.#onMoveUp,
      moveDown: HudLayoutConfig.#onMoveDown,
      moveSide: HudLayoutConfig.#onMoveSide,
      reset: HudLayoutConfig.#onReset
    }
  };

  static PARTS = {
    columns: {
      template: `modules/${MODULE_ID}/templates/layout-config.hbs`,
      scrollable: [".primal-hud-layout-columns"]
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  constructor(options) {
    super(options);
    const { layout, buttons } = layoutForEditing();
    this.#layout = layout;
    this.#buttons = buttons;
    this.#isDefault = !hasLayout();
  }

  /** The arrangement as edited in this window (saved on Save). */
  #layout;

  /** Details of each button, by id. */
  #buttons;

  /** True until a button is moved, after opening without a saved layout or pressing Reset: Save then clears it. */
  #isDefault;

  /** The id of the button being dragged. */
  #dragging = null;

  /** @override */
  async _prepareContext(options) {
    const L = key => game.i18n.localize(`PRIMAL_HUD.Layout.${key}`);
    const column = (side, other) => ({
      side,
      title: L(side === "left" ? "Left" : "Right"),
      moveIcon: side === "left" ? "fa-solid fa-arrow-right" : "fa-solid fa-arrow-left",
      moveLabel: L(side === "left" ? "ToRight" : "ToLeft"),
      entries: this.#layout[side].map((id, i, list) => {
        const button = this.#buttons.get(id);
        return {
          id, label: button.label, icon: button.icon, img: button.img, source: button.source,
          hidden: !isButtonShown(id), first: i === 0, last: i === list.length - 1
        };
      })
    });
    return {
      columns: [column("left"), column("right")],
      labels: { up: L("Up"), down: L("Down"), hidden: L("Hidden"), empty: L("Empty") },
      buttons: [
        { type: "button", action: "reset", icon: "fa-solid fa-arrow-rotate-left", label: "PRIMAL_HUD.Layout.Reset" },
        { type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save" }
      ]
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // Drag and drop between and within the two columns
    for ( const row of this.element.querySelectorAll(".primal-hud-layout-row[data-button-id]") ) {
      row.addEventListener("dragstart", event => {
        this.#dragging = row.dataset.buttonId;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", row.dataset.buttonId);
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => {
        this.#dragging = null;
        this.element?.querySelectorAll(".dragging, .drop-before, .drop-after")
          .forEach(el => el.classList.remove("dragging", "drop-before", "drop-after"));
      });
    }
    for ( const list of this.element.querySelectorAll(".primal-hud-layout-list[data-side]") ) {
      list.addEventListener("dragover", event => {
        if ( !this.#dragging ) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const { row, after } = this.#dropTarget(list, event.clientY);
        this.element.querySelectorAll(".drop-before, .drop-after")
          .forEach(el => el.classList.remove("drop-before", "drop-after"));
        if ( row ) row.classList.add(after ? "drop-after" : "drop-before");
        else list.classList.add("drop-after");
      });
      list.addEventListener("dragleave", event => {
        if ( !list.contains(event.relatedTarget) ) list.classList.remove("drop-after");
      });
      list.addEventListener("drop", event => {
        if ( !this.#dragging ) return;
        event.preventDefault();
        const { index } = this.#dropTarget(list, event.clientY);
        this.#move(this.#dragging, list.dataset.side, index);
        this.#dragging = null;
      });
    }
  }

  /** The row the pointer is over in a list, which half of it, and the index a dropped button would get. */
  #dropTarget(list, y) {
    const rows = [...list.querySelectorAll(".primal-hud-layout-row[data-button-id]")];
    for ( const [i, row] of rows.entries() ) {
      const box = row.getBoundingClientRect();
      if ( y < box.top + (box.height / 2) ) return { row, after: false, index: i };
    }
    return { row: rows.at(-1) ?? null, after: true, index: rows.length };
  }

  /**
   * Move a button to a side at an index (counted in the list as it is before the move).
   * @param {string} id
   * @param {"left"|"right"} side
   * @param {number} index
   */
  #move(id, side, index) {
    const from = this.#layout.left.includes(id) ? "left" : "right";
    const fromIndex = this.#layout[from].indexOf(id);
    if ( fromIndex < 0 ) return;
    this.#layout[from].splice(fromIndex, 1);
    if ( (from === side) && (fromIndex < index) ) index--;
    index = Math.clamp(index, 0, this.#layout[side].length);
    this.#layout[side].splice(index, 0, id);
    this.#isDefault = false;
    this.render();
  }

  static #rowId(target) {
    return target.closest("[data-button-id]")?.dataset.buttonId;
  }

  static #onMoveUp(event, target) {
    const id = HudLayoutConfig.#rowId(target);
    const side = this.#layout.left.includes(id) ? "left" : "right";
    const i = this.#layout[side].indexOf(id);
    if ( i > 0 ) this.#move(id, side, i - 1);
  }

  static #onMoveDown(event, target) {
    const id = HudLayoutConfig.#rowId(target);
    const side = this.#layout.left.includes(id) ? "left" : "right";
    const i = this.#layout[side].indexOf(id);
    if ( (i >= 0) && (i < this.#layout[side].length - 1) ) this.#move(id, side, i + 2);
  }

  static #onMoveSide(event, target) {
    const id = HudLayoutConfig.#rowId(target);
    const side = this.#layout.left.includes(id) ? "right" : "left";
    this.#move(id, side, this.#layout[side].length);
  }

  static #onReset() {
    this.#layout = layoutForEditing(true).layout;
    this.#isDefault = true;
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    await saveLayout(this.#isDefault ? null : this.#layout);
  }
}
