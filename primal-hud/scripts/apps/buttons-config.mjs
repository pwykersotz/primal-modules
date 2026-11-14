/**
 * The "Token HUD buttons" settings window: one tickbox per HUD button, grouped by where the button comes from.
 * Open to every user (players included); each user's choices only affect their own Token HUD.
 */
import { MODULE_ID } from "../constants.mjs";
import { buttonGroups, getHiddenIds, saveButtonChoices } from "../buttons.mjs";
import { HudLayoutConfig } from "./layout-config.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HudButtonsConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "primal-hud-buttons",
    tag: "form",
    classes: ["primal-hud-buttons-config"],
    window: {
      title: "PRIMAL_HUD.Buttons.Title",
      icon: "fa-solid fa-table-cells",
      contentClasses: ["standard-form"]
    },
    position: { width: 420, height: "auto" },
    form: {
      handler: HudButtonsConfig.#onSubmit,
      closeOnSubmit: true
    },
    actions: {
      forget: HudButtonsConfig.#onForget,
      showAll: HudButtonsConfig.#onShowAll,
      arrange: HudButtonsConfig.#onArrange
    }
  };

  static PARTS = {
    list: {
      template: `modules/${MODULE_ID}/templates/buttons-config.hbs`,
      scrollable: [""]
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /** Hidden buttons as currently ticked in this window (saved on Save). */
  #hidden = getHiddenIds();

  /** Buttons from other modules the user removed from the list in this window (saved on Save). */
  #forgotten = new Set();

  /** @override */
  async _prepareContext(options) {
    const groups = buttonGroups(this.#hidden)
      .map(g => ({ ...g, entries: g.entries.filter(e => !this.#forgotten.has(e.id)) }))
      .filter(g => g.entries.length);
    return {
      groups,
      buttons: [
        { type: "button", action: "showAll", icon: "fa-solid fa-eye", label: "PRIMAL_HUD.Buttons.ShowAll" },
        { type: "button", action: "arrange", icon: "fa-solid fa-arrows-left-right", label: "PRIMAL_HUD.Buttons.Arrange" },
        { type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save" }
      ]
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    for ( const box of this.element.querySelectorAll("input[type=checkbox][data-button-id]") ) {
      box.addEventListener("change", () => {
        if ( box.checked ) this.#hidden.delete(box.dataset.buttonId);
        else this.#hidden.add(box.dataset.buttonId);
      });
    }
  }

  static async #onSubmit(event, form, formData) {
    await saveButtonChoices(this.#hidden, this.#forgotten);
  }

  static #onForget(event, target) {
    const id = target.dataset.buttonId;
    if ( !id ) return;
    this.#forgotten.add(id);
    this.#hidden.delete(id);
    this.render();
  }

  static #onArrange() {
    new HudLayoutConfig().render({ force: true });
  }

  static #onShowAll() {
    this.#hidden.clear();
    this.render();
  }
}
