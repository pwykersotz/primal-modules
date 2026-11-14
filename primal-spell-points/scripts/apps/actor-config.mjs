/**
 * The GM's spell point settings for one actor: whether it uses spell points (off until the GM turns it on), its
 * current points, its maximum
 * (from the table, a bonus, or a fixed number), and which 6th+ level spells it has used since its last long rest.
 */
import { FLAGS, HIGH_LEVEL, MODULE_ID, levelLabel, loc } from "../constants.mjs";
import { computeState, getState } from "../spell-points.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ActorSpellPointsConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options={}) {
    super(options);
    this.actor = options.document;
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["primal-sp-actor-config"],
    window: {
      title: "PRIMAL_SPELL_POINTS.Config.Title",
      icon: "fa-solid fa-wand-sparkles",
      contentClasses: ["standard-form"]
    },
    position: { width: 440, height: "auto" },
    form: {
      handler: ActorSpellPointsConfig.#onSubmit,
      closeOnSubmit: true
    },
    actions: {
      restore: ActorSpellPointsConfig.#onRestore
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/actor-config.hbs`
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /** @type {Actor} */
  actor;

  /** @override */
  get title() {
    return `${loc("Config.Title")}: ${this.actor?.name ?? ""}`;
  }

  /** @override */
  async _prepareContext(options) {
    const actor = this.actor;
    const state = computeState(actor);
    const high = [];
    if ( state?.limit ) {
      for ( let level = HIGH_LEVEL; level <= Math.min(9, state.maxLevel); level++ ) {
        high.push({ level, label: levelLabel(level), used: state.highUsed.includes(level) });
      }
    }
    return {
      actorName: actor.name,
      active: !!getState(actor)?.active,
      noSlots: !state?.maxLevel,
      enabled: !!state?.enabled,
      value: state?.value ?? 0,
      max: state?.max ?? 0,
      base: state?.base ?? 0,
      casterLevel: state?.casterLevel ?? 0,
      maxOverride: state?.override ?? "",
      bonus: state?.bonus ?? 0,
      high,
      buttons: [
        { type: "button", action: "restore", icon: "fa-solid fa-rotate-left", label: "PRIMAL_SPELL_POINTS.Config.Restore" },
        { type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save" }
      ]
    };
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    if ( this.actor ) this.actor.apps[this.id] = this;
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    if ( this.actor ) delete this.actor.apps[this.id];
  }

  static async #onSubmit(event, form, formData) {
    if ( !game.user.isGM ) return ui.notifications.warn(loc("Warning.GMOnly"));
    const actor = this.actor;
    const state = computeState(actor);
    if ( !state ) return;
    const data = foundry.utils.expandObject(formData.object);

    const rawOverride = data.maxOverride;
    const override = ((rawOverride === null) || (rawOverride === undefined) || (rawOverride === "")
      || !Number.isFinite(Number(rawOverride))) ? null : Math.max(0, Math.floor(Number(rawOverride)));
    const bonus = Math.trunc(Number(data.bonus) || 0);
    const max = Math.max(0, override ?? (state.base + bonus));
    const typed = Number(data.value);
    const value = Math.clamp(Number.isFinite(typed) ? Math.floor(typed) : state.value, 0, max);

    const updates = {
      [`flags.${MODULE_ID}.${FLAGS.enabled}`]: !!data.enabled,
      [`flags.${MODULE_ID}.${FLAGS.maxOverride}`]: override,
      [`flags.${MODULE_ID}.${FLAGS.bonus}`]: bonus,
      [`flags.${MODULE_ID}.${FLAGS.spent}`]: max - value
    };
    if ( data.highUsed ) {
      updates[`flags.${MODULE_ID}.${FLAGS.highUsed}`] = Object.entries(data.highUsed)
        .filter(([, used]) => used).map(([level]) => Number(level)).sort((a, b) => a - b);
    }
    await actor.update(updates);
  }

  static async #onRestore() {
    if ( !game.user.isGM ) return ui.notifications.warn(loc("Warning.GMOnly"));
    await this.actor.update({
      [`flags.${MODULE_ID}.${FLAGS.spent}`]: 0,
      [`flags.${MODULE_ID}.${FLAGS.highUsed}`]: []
    });
  }
}
