import { TEMPLATES, localize, DialogV2, escapeHTML } from "../constants.js";
import { createAura, cloneAura, getPresets, setPresets, addAura } from "../data.js";
import { DEFAULT_PRESETS } from "../presets.js";
import { AuraConfig } from "./aura-config.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The world's library of saved auras, including their effects. */
export class PresetManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["primal-auras", "pa-preset-manager"],
    window: { title: "PRIMAL_AURAS.Presets.Title", icon: "fa-solid fa-book", resizable: true },
    position: { width: 600, height: 680 },
    actions: {
      create: PresetManager._onCreate,
      edit: PresetManager._onEdit,
      duplicate: PresetManager._onDuplicate,
      delete: PresetManager._onDelete,
      apply: PresetManager._onApply,
      exportPresets: PresetManager._onExport,
      importPresets: PresetManager._onImport,
      restoreDefaults: PresetManager._onRestore
    }
  };

  static PARTS = {
    main: { template: TEMPLATES.presets, scrollable: [".pa-preset-list"] }
  };

  async _prepareContext() {
    const units = canvas?.scene?.grid?.units || game.system?.grid?.units || "";
    return {
      isGM: game.user.isGM,
      units,
      presets: getPresets().map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        fillColor: p.fillColor,
        borderColor: p.borderColor,
        radius: p.radius,
        innerRadius: p.innerRadius,
        shapeLabel: localize(`PRIMAL_AURAS.Shape.${p.shape}`),
        shapeIcon: p.shape === "grid" ? "fa-border-all" : "fa-circle",
        effectCount: p.effects.length,
        effectNames: p.effects.map(e => e.name).join(", ")
      }))
    };
  }

  static _presetId(target) {
    return target.closest("[data-preset-id]")?.dataset.presetId;
  }

  _editPreset(preset, isNew = false) {
    const app = new AuraConfig({
      aura: preset,
      mode: "preset",
      title: localize("PRIMAL_AURAS.Presets.EditTitle", { name: preset.name }),
      onSave: async data => {
        const list = getPresets();
        const idx = list.findIndex(p => p.id === data.id);
        if (idx < 0 || isNew) list.push(data);
        else list[idx] = data;
        await setPresets(list);
        this.render();
      }
    });
    app.render({ force: true });
  }

  static _onCreate() {
    this._editPreset(createAura({ name: localize("PRIMAL_AURAS.Presets.NewName") }), true);
  }

  static _onEdit(event, target) {
    const preset = getPresets().find(p => p.id === PresetManager._presetId(target));
    if (preset) this._editPreset(preset);
  }

  static async _onDuplicate(event, target) {
    const list = getPresets();
    const idx = list.findIndex(p => p.id === PresetManager._presetId(target));
    if (idx < 0) return;
    const copy = cloneAura(list[idx], { name: `${list[idx].name} (${localize("PRIMAL_AURAS.Config.Copy")})` });
    list.splice(idx + 1, 0, copy);
    await setPresets(list);
    this.render();
  }

  static async _onDelete(event, target) {
    const list = getPresets();
    const preset = list.find(p => p.id === PresetManager._presetId(target));
    if (!preset) return;
    const ok = await DialogV2().confirm({
      window: { title: localize("PRIMAL_AURAS.Presets.DeleteTitle") },
      content: `<p>${localize("PRIMAL_AURAS.Presets.DeleteConfirm", { name: escapeHTML(preset.name) })}</p>`
    });
    if (!ok) return;
    await setPresets(list.filter(p => p.id !== preset.id));
    this.render();
  }

  static async _onApply(event, target) {
    const preset = getPresets().find(p => p.id === PresetManager._presetId(target));
    const tokens = canvas?.tokens?.controlled ?? [];
    if (!preset) return;
    if (!tokens.length) return ui.notifications.warn(localize("PRIMAL_AURAS.Notify.SelectTokens"));
    for (const token of tokens) {
      if (!token.document.isOwner) continue;
      await addAura(token.document, cloneAura(preset, { enabled: true }));
    }
    ui.notifications.info(localize("PRIMAL_AURAS.Notify.Applied", { name: preset.name, count: tokens.length }));
  }

  static _onExport() {
    const data = JSON.stringify(getPresets(), null, 2);
    const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
    save(data, "application/json", "primal-auras-presets.json");
  }

  static async _onImport() {
    const content = `
      <p class="hint">${localize("PRIMAL_AURAS.Presets.ImportHint")}</p>
      <div class="form-group stacked"><input type="file" name="file" accept=".json,application/json"></div>
      <div class="form-group stacked"><textarea name="json" rows="8" placeholder="[ { &quot;name&quot;: &quot;...&quot; } ]"></textarea></div>`;
    const raw = await DialogV2().prompt({
      window: { title: localize("PRIMAL_AURAS.Presets.ImportTitle"), icon: "fa-solid fa-file-import" },
      content,
      ok: {
        label: localize("PRIMAL_AURAS.Presets.Import"),
        callback: async (event, button) => {
          const form = button.form;
          const file = form.elements.file?.files?.[0];
          if (file) return file.text();
          return form.elements.json.value;
        }
      },
      rejectClose: false
    });
    if (!raw) return;
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return ui.notifications.error(localize("PRIMAL_AURAS.Notify.BadJson")); }
    const incoming = (Array.isArray(parsed) ? parsed : [parsed]).filter(p => p && typeof p === "object");
    const list = getPresets();
    for (const p of incoming) {
      const aura = createAura(p);
      if (list.some(x => x.id === aura.id)) aura.id = foundry.utils.randomID();
      list.push(aura);
    }
    await setPresets(list);
    ui.notifications.info(localize("PRIMAL_AURAS.Notify.Imported", { count: incoming.length }));
    this.render();
  }

  static async _onRestore() {
    const ok = await DialogV2().confirm({
      window: { title: localize("PRIMAL_AURAS.Presets.RestoreTitle") },
      content: `<p>${localize("PRIMAL_AURAS.Presets.RestoreConfirm")}</p>`
    });
    if (!ok) return;
    const list = getPresets();
    for (const def of DEFAULT_PRESETS) {
      const idx = list.findIndex(p => p.id === def.id);
      const aura = createAura(def);
      if (idx < 0) list.push(aura);
      else list[idx] = aura;
    }
    await setPresets(list);
    this.render();
  }
}
