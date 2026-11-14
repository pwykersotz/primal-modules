import { MODULE_ID, TEMPLATES, localize, DialogV2, escapeHTML } from "../constants.js";
import { getDocumentAuras, addAura, updateAura, deleteAura, getPresets, cloneAura } from "../data.js";
import { AuraConfig } from "./aura-config.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Lists the auras stored on an item (a class feature, spell, magic item...). Any token whose
 * actor owns the item projects these auras.
 */
export class DocumentAuras extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ document, ...options } = {}) {
    super(options);
    this.document = document;
  }

  static DEFAULT_OPTIONS = {
    classes: ["primal-auras", "pa-document-auras"],
    window: { icon: "pa-aura-icon", resizable: true },
    position: { width: 520, height: "auto" },
    actions: {
      add: DocumentAuras._onAdd,
      addPreset: DocumentAuras._onAddPreset,
      edit: DocumentAuras._onEdit,
      toggle: DocumentAuras._onToggle,
      delete: DocumentAuras._onDelete
    }
  };

  static PARTS = { main: { template: TEMPLATES.documentAuras } };

  static open(document) {
    const id = `pa-doc-${document.uuid.replace(/\./g, "-")}`;
    const existing = foundry.applications.instances?.get(id);
    if (existing) { existing.bringToFront?.(); return existing; }
    const app = new DocumentAuras({ id, document });
    app.render({ force: true });
    return app;
  }

  get title() {
    return localize("PRIMAL_AURAS.DocAuras.Title", { name: this.document.name });
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.document.apps[this.id] = this;
  }

  _onClose(options) {
    super._onClose?.(options);
    delete this.document.apps?.[this.id];
  }

  async _prepareContext() {
    const units = canvas?.scene?.grid?.units || game.system?.grid?.units || "";
    const presets = getPresets();
    return {
      units,
      img: this.document.img,
      name: this.document.name,
      ownerName: this.document.parent?.name ?? "",
      presetChoices: Object.fromEntries(presets.map(p => [p.id, p.name])),
      hasPresets: presets.length > 0,
      auras: getDocumentAuras(this.document).map(a => ({
        id: a.id,
        name: a.name,
        enabled: a.enabled,
        radius: a.radius,
        innerRadius: a.innerRadius,
        color: a.fillColor,
        shapeIcon: a.shape === "grid" ? "fa-border-all" : "fa-circle",
        activationLabel: localize(`PRIMAL_AURAS.Activation.${a.activation}`),
        extras: [
          a.enableOnUse ? localize("PRIMAL_AURAS.DocAuras.OnUse") : null,
          a.endWithConcentration ? localize("PRIMAL_AURAS.DocAuras.Concentration") : null
        ].filter(Boolean).join(" • "),
        effectCount: a.effects.length
      }))
    };
  }

  static _auraId(target) {
    return target.closest("[data-aura-id]")?.dataset.auraId;
  }

  static async _onAdd() {
    await addAura(this.document, { name: this.document.name, activation: "passive", enabled: true });
    this.render();
  }

  static async _onAddPreset() {
    const id = this.element.querySelector("select.pa-preset-select")?.value;
    const preset = getPresets().find(p => p.id === id);
    if (!preset) return ui.notifications.warn(localize("PRIMAL_AURAS.Notify.PickPreset"));
    await addAura(this.document, cloneAura(preset, { enabled: preset.activation !== "manual" }));
    this.render();
  }

  static _onEdit(event, target) {
    const aura = getDocumentAuras(this.document).find(a => a.id === DocumentAuras._auraId(target));
    if (aura) AuraConfig.openFor({ document: this.document, aura, mode: "item", onDone: () => this.render() });
  }

  static async _onToggle(event, target) {
    const aura = getDocumentAuras(this.document).find(a => a.id === DocumentAuras._auraId(target));
    if (aura) await updateAura(this.document, aura.id, { enabled: !aura.enabled });
    this.render();
  }

  static async _onDelete(event, target) {
    const aura = getDocumentAuras(this.document).find(a => a.id === DocumentAuras._auraId(target));
    if (!aura) return;
    const ok = await DialogV2().confirm({
      window: { title: localize("PRIMAL_AURAS.HUD.DeleteTitle") },
      content: `<p>${localize("PRIMAL_AURAS.HUD.DeleteConfirm", { name: escapeHTML(aura.name) })}</p>`
    });
    if (!ok) return;
    await deleteAura(this.document, aura.id);
    this.render();
  }
}

export { MODULE_ID };
