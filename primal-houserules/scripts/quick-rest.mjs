/**
 * Quick Break: a third rest type, beside the short and long rests on dnd5e and Tidy 5e sheets (both draw one button
 * for each entry in CONFIG.DND5E.restTypes). It takes 10 minutes, lets the creature spend one Hit Die, and recovers
 * nothing else: no item uses, no spell slots, and no effects end.
 */
import { MODULE_ID, QUICK_REST } from "./constants.mjs";

/** The rest type. */
export function quickRestType(dialogClass) {
  return {
    duration: { normal: 10, gritty: 10, epic: 1 },
    label: "PRIMAL_HOUSERULES.QuickRest.Label",
    icon: "fa-solid fa-mug-hot",
    dialogClass,
    chat: "PRIMAL_HOUSERULES.QuickRest.Result",
    autoHD: false,
    activationPeriods: [],
    expiryEvents: [],
    recoverPeriods: [],
    recoverSpellSlotTypes: new Set()
  };
}

/**
 * Build the Quick Break dialog on top of dnd5e's short rest dialog: the same Hit Die roller, allowed once.
 * @param {typeof Application} ShortRestDialog
 * @returns {typeof Application}
 */
export function makeQuickRestDialog(ShortRestDialog) {
  return class QuickRestDialog extends ShortRestDialog {
    static DEFAULT_OPTIONS = {
      classes: ["short-rest", "primal-quick-rest"],
      actions: {
        rollHitDie: QuickRestDialog.#rollOnce
      }
    };

    static PARTS = {
      ...super.PARTS,
      content: {
        template: `modules/${MODULE_ID}/templates/quick-rest.hbs`
      }
    };

    /** Whether the one Hit Die has been rolled. */
    #rolled = false;

    get rolled() {
      return this.#rolled;
    }

    /** @inheritDoc */
    async _prepareContext(options) {
      this.config.autoHD = false;
      const context = await super._prepareContext(options);
      context.quickRolled = this.#rolled;
      return context;
    }

    /** @inheritDoc */
    async _prepareFields(context, options) {
      await super._prepareFields(context, options);
      context.fields = context.fields.filter(f => f.name !== "autoHD");
    }

    /**
     * Roll the one Hit Die a Quick Break allows.
     * @this {QuickRestDialog}
     * @param {Event} event
     */
    static async #rollOnce(event) {
      if ( this.#rolled ) return;
      const denomination = this.form.denom?.value;
      const roll = await this.actor.rollHitDie(denomination ? { denomination } : {});
      if ( roll ) this.#rolled = true;
      const formData = new foundry.applications.ux.FormDataExtended(this.form);
      foundry.utils.mergeObject(this.config, this._processFormData(event, this.form, formData));
      this.config.autoHD = false;
      this.render();
    }
  };
}

/**
 * Add the Quick Break to CONFIG.DND5E.restTypes, first, so its button sits beside the short and long rests.
 * Called during init, after dnd5e has set up its rest types and before they are localized.
 */
export function registerQuickRest() {
  const types = CONFIG.DND5E?.restTypes;
  const ShortRestDialog = types?.short?.dialogClass;
  if ( !types || !ShortRestDialog || types[QUICK_REST] ) return;
  const quick = quickRestType(makeQuickRestDialog(ShortRestDialog));
  const ordered = { [QUICK_REST]: quick };
  for ( const [key, value] of Object.entries(types) ) ordered[key] = value;
  for ( const key of Object.keys(types) ) delete types[key];
  Object.assign(types, ordered);
}
