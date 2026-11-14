/**
 * The GM's spell point tables: what each spell level costs and how many points a caster has at each spellcaster
 * level. Starts as the Dungeon Master's Guide tables.
 */
import { DMG_TABLES, MODULE_ID, SETTINGS, levelLabel } from "../constants.mjs";
import { getTables } from "../spell-points.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SpellPointTablesConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "primal-spell-points-tables",
    tag: "form",
    classes: ["primal-sp-tables-config"],
    window: {
      title: "PRIMAL_SPELL_POINTS.Tables.Title",
      icon: "fa-solid fa-table",
      contentClasses: ["standard-form"]
    },
    position: { width: 520, height: "auto" },
    form: {
      handler: SpellPointTablesConfig.#onSubmit,
      closeOnSubmit: true
    },
    actions: {
      reset: SpellPointTablesConfig.#onReset
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/tables-config.hbs`,
      scrollable: [""]
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /** Tables shown in the window (the saved ones, or the DMG's after Reset). */
  #tables = null;

  /** @override */
  async _prepareContext(options) {
    const tables = this.#tables ?? getTables();
    return {
      cost: Array.fromRange(9, 1).map(level => ({ level, label: levelLabel(level), value: tables.cost[level] })),
      points: tables.points.map((value, index) => ({ index, level: index + 1, value })),
      buttons: [
        { type: "button", action: "reset", icon: "fa-solid fa-rotate-left", label: "PRIMAL_SPELL_POINTS.Tables.Reset" },
        { type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save" }
      ]
    };
  }

  static async #onSubmit(event, form, formData) {
    if ( !game.user.isGM ) return;
    const data = foundry.utils.expandObject(formData.object);
    const whole = (n, fallback) => {
      const v = Number(n);
      return (Number.isFinite(v) && (v >= 0)) ? Math.floor(v) : fallback;
    };
    const cost = {};
    for ( let level = 1; level <= 9; level++ ) cost[level] = whole(data.cost?.[level], DMG_TABLES.cost[level]);
    const points = DMG_TABLES.points.map((fallback, i) => whole(data.points?.[i], fallback));
    await game.settings.set(MODULE_ID, SETTINGS.tables, { cost, points });
  }

  static #onReset() {
    this.#tables = { cost: { ...DMG_TABLES.cost }, points: [...DMG_TABLES.points] };
    this.render();
  }
}
