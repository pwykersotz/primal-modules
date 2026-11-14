import { MODULE_ID, TEMPLATES, localize, FormDataClass } from "../constants.js";
import {
  createAura, createEffect, cloneAura, replaceAura, getPresets, setPresets, TRIGGERS, DURATIONS
} from "../data.js";
import {
  getAbilityChoices, getDamageTypeChoices, getHealingTypeChoices, getStatusChoices, getChangeTypeChoices
} from "../system.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const choices = (prefix, keys) => Object.fromEntries(keys.map(k => [k, localize(`${prefix}.${k}`)]));

/**
 * Full editor for one aura: appearance (shape, range, donut, colours, visibility) and its effects
 * (saves, damage, healing, conditions, modifiers, triggers and durations).
 */
export class AuraConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} options
   * @param {object} options.aura          Aura data to edit (a working copy is made)
   * @param {Function} options.onSave      async (auraData) => void
   * @param {"token"|"item"|"preset"} [options.mode]
   * @param {string} [options.title]
   */
  constructor({ aura, onSave, mode = "token", title, ...options } = {}) {
    super(options);
    this.aura = createAura(aura);
    this.onSave = onSave;
    this.mode = mode;
    this._title = title;
    this.activeTab = "appearance";
  }

  static DEFAULT_OPTIONS = {
    classes: ["primal-auras", "pa-aura-config"],
    tag: "form",
    window: { icon: "pa-aura-icon", resizable: true },
    position: { width: 680, height: 760 },
    form: { handler: AuraConfig._onSubmitForm, submitOnChange: false, closeOnSubmit: true },
    actions: {
      switchTab: AuraConfig._onTab,
      addEffect: AuraConfig._onAddEffect,
      removeEffect: AuraConfig._onRemoveEffect,
      duplicateEffect: AuraConfig._onDuplicateEffect,
      addChange: AuraConfig._onAddChange,
      removeChange: AuraConfig._onRemoveChange,
      importEffects: AuraConfig._onImportEffects,
      saveAsPreset: AuraConfig._onSaveAsPreset
    }
  };

  static PARTS = {
    form: { template: TEMPLATES.config, scrollable: [".pa-body"] }
  };

  get title() {
    return this._title ?? localize("PRIMAL_AURAS.Config.Title", { name: this.aura.name });
  }

  /* -------------------------------------------- */

  /** Open (or focus) an editor for an aura stored on a token, item or other document. */
  static openFor({ document, aura, mode, onDone }) {
    const id = `pa-config-${document.uuid.replace(/\./g, "-")}-${aura.id}`;
    const existing = foundry.applications.instances?.get(id);
    if (existing) { existing.bringToFront?.(); return existing; }
    const owner = mode === "item" ? `${document.name} (${document.parent?.name ?? ""})` : document.name;
    const app = new AuraConfig({
      id, aura, mode,
      title: localize("PRIMAL_AURAS.Config.TitleFor", { name: aura.name, owner }),
      onSave: async data => { await replaceAura(document, data); onDone?.(); }
    });
    app.render({ force: true });
    return app;
  }

  static openForEntry(entry, onDone) {
    return AuraConfig.openFor({ document: entry.document, aura: entry.aura, mode: entry.sourceType, onDone });
  }

  /* -------------------------------------------- */

  async _prepareContext(options) {
    const aura = this.aura;
    const abilityChoices = getAbilityChoices();
    const damageChoices = getDamageTypeChoices();
    const statusChoices = getStatusChoices();
    const presets = getPresets().filter(p => p.effects.length);
    return {
      aura,
      isItem: this.mode === "item",
      isPreset: this.mode === "preset",
      canSavePreset: game.user.isGM && this.mode !== "preset",
      tabs: { appearance: this.activeTab === "appearance", effects: this.activeTab === "effects" },
      units: canvas?.scene?.grid?.units || game.system?.grid?.units || "",
      gridStep: canvas?.scene?.grid?.distance || 5,
      fillAlphaPct: Math.round(aura.fillAlpha * 100),
      borderAlphaPct: Math.round(aura.borderAlpha * 100),
      choices: {
        shape: choices("PRIMAL_AURAS.Shape", ["circle", "grid"]),
        measureFrom: choices("PRIMAL_AURAS.MeasureFrom", ["edge", "center"]),
        visibility: choices("PRIMAL_AURAS.Visibility", ["all", "owner", "gm"]),
        showWhen: choices("PRIMAL_AURAS.ShowWhen", ["always", "hover", "controlled", "combat"]),
        activation: choices("PRIMAL_AURAS.Activation", ["passive", "equipped", "manual"]),
        mode: choices("PRIMAL_AURAS.Mode", ["triggered", "continuous"]),
        affects: choices("PRIMAL_AURAS.Affects", ["enemies", "allies", "all", "self"]),
        onSuccess: choices("PRIMAL_AURAS.OnSuccess", ["half", "none"]),
        duration: choices("PRIMAL_AURAS.Duration", DURATIONS),
        changeTypes: getChangeTypeChoices(),
        abilities: abilityChoices ?? {},
        damageTypes: damageChoices ?? {},
        healingTypes: getHealingTypeChoices()
      },
      hasAbilityChoices: !!abilityChoices,
      hasDamageChoices: !!damageChoices,
      presetChoices: Object.fromEntries(presets.map(p => [p.id, p.name])),
      hasPresets: presets.length > 0,
      effects: aura.effects.map((e, idx) => ({
        ...e,
        idx,
        isTriggered: e.mode === "triggered",
        isContinuous: e.mode === "continuous",
        hasSave: !!e.save.ability,
        isRounds: e.duration.type === "rounds",
        notSelf: e.affects !== "self",
        triggerList: TRIGGERS.map(t => ({ key: t, label: localize(`PRIMAL_AURAS.Trigger.${t}`), checked: !!e.triggers[t] })),
        statusList: statusChoices.map(s => ({ ...s, checked: e.statuses.includes(s.id) })),
        unknownStatuses: e.statuses.filter(id => !statusChoices.some(s => s.id === id)),
        changeList: e.changes.map((c, cidx) => ({ ...c, cidx }))
      }))
    };
  }

  /* -------------------------------------------- */
  /*  Form state                                  */
  /* -------------------------------------------- */

  get formElement() {
    return this.element instanceof HTMLFormElement ? this.element : this.element?.querySelector("form");
  }

  _sync() {
    const form = this.formElement;
    if (!form) return;
    const fd = new (FormDataClass())(form);
    this._applyFormData(fd.object);
  }

  _applyFormData(flat) {
    const data = foundry.utils.expandObject(flat ?? {});
    const effectsData = data.effects;
    delete data.effects;
    for (const k of Object.keys(data)) if (k.startsWith("_")) delete data[k];
    if (data.fillAlphaPct !== undefined) { data.fillAlpha = Number(data.fillAlphaPct) / 100; delete data.fillAlphaPct; }
    if (data.borderAlphaPct !== undefined) { data.borderAlpha = Number(data.borderAlphaPct) / 100; delete data.borderAlphaPct; }
    const aura = foundry.utils.mergeObject(this.aura, data, { inplace: false });
    aura.effects = this.aura.effects.map(e => foundry.utils.deepClone(e));
    if (effectsData && typeof effectsData === "object") {
      for (const [k, v] of Object.entries(effectsData)) {
        const effect = aura.effects[Number(k)];
        if (!effect || !v) continue;
        if (v.statuses && typeof v.statuses === "object") {
          v.statuses = Object.entries(v.statuses).filter(([, on]) => on === true || on === "true").map(([id]) => id);
        }
        if (v.changes && typeof v.changes === "object" && !Array.isArray(v.changes)) {
          v.changes = Object.keys(v.changes).sort((a, b) => Number(a) - Number(b)).map(i => v.changes[i]);
        }
        foundry.utils.mergeObject(effect, v);
        if (v.changes) effect.changes = v.changes;
        if (v.statuses) effect.statuses = v.statuses;
      }
    }
    this.aura = createAura(aura);
  }

  _onChangeForm(formConfig, event) {
    super._onChangeForm?.(formConfig, event);
    this._sync();
    const target = event.target;
    if (target?.dataset && "rerender" in target.dataset) this.render();
    else if (target?.name === "name") this.window?.title && (this.window.title.textContent = this.title);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async _onSubmitForm(event, form, formData) {
    this._applyFormData(formData.object);
    if (this.onSave) await this.onSave(foundry.utils.deepClone(this.aura));
  }

  static _onTab(event, target) {
    this._sync();
    this.activeTab = target.dataset.tab;
    this.render();
  }

  static _effectIndex(target) {
    return Number(target.closest("[data-effect-index]")?.dataset.effectIndex);
  }

  static _onAddEffect() {
    this._sync();
    const isPassive = this.aura.effects.length === 0 && this.mode === "item" && this.aura.activation === "passive";
    this.aura.effects.push(createEffect({
      name: this.aura.name,
      mode: isPassive ? "continuous" : "triggered"
    }));
    this.activeTab = "effects";
    this.render();
  }

  static _onRemoveEffect(event, target) {
    this._sync();
    const idx = AuraConfig._effectIndex(target);
    if (Number.isInteger(idx)) this.aura.effects.splice(idx, 1);
    this.render();
  }

  static _onDuplicateEffect(event, target) {
    this._sync();
    const idx = AuraConfig._effectIndex(target);
    const src = this.aura.effects[idx];
    if (src) this.aura.effects.splice(idx + 1, 0, createEffect({ ...foundry.utils.deepClone(src), id: "", name: `${src.name} (${localize("PRIMAL_AURAS.Config.Copy")})` }));
    this.render();
  }

  static _onAddChange(event, target) {
    this._sync();
    const effect = this.aura.effects[AuraConfig._effectIndex(target)];
    if (effect) effect.changes.push({ key: "", type: "add", value: "" });
    this.render();
  }

  static _onRemoveChange(event, target) {
    this._sync();
    const effect = this.aura.effects[AuraConfig._effectIndex(target)];
    const cidx = Number(target.closest("[data-change-index]")?.dataset.changeIndex);
    if (effect && Number.isInteger(cidx)) effect.changes.splice(cidx, 1);
    this.render();
  }

  static _onImportEffects() {
    this._sync();
    const id = this.formElement?.querySelector("select.pa-import-select")?.value;
    const preset = getPresets().find(p => p.id === id);
    if (!preset) return ui.notifications.warn(localize("PRIMAL_AURAS.Notify.PickPreset"));
    const copy = cloneAura(preset);
    this.aura.effects.push(...copy.effects);
    this.activeTab = "effects";
    this.render();
  }

  static async _onSaveAsPreset() {
    this._sync();
    const presets = getPresets();
    const copy = cloneAura(this.aura, { enabled: true });
    presets.push(copy);
    await setPresets(presets);
    ui.notifications.info(localize("PRIMAL_AURAS.Notify.PresetSaved", { name: copy.name }));
  }
}

export { MODULE_ID };
