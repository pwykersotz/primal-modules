/**
 * Token HUD integration: a button that opens a palette listing the token's auras, with an on/off
 * switch, range and donut fields, a colour swatch and a one-click circle/grid toggle for each.
 */
import { MODULE_ID, TEMPLATES, getSetting, localize, renderTemplate, DialogV2, escapeHTML } from "./constants.js";
import {
  getTokenAuras, isAuraActive, effectiveShape, updateAura, deleteAura, addAura, getPresets, cloneAura
} from "./data.js";
import { AuraConfig } from "./apps/aura-config.js";
import { PresetManager } from "./apps/preset-manager.js";
import { DocumentAuras } from "./apps/document-auras.js";

let openForTokenId = null;

export function registerHudHooks() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
  Hooks.on("closeTokenHUD", () => { openForTokenId = null; });
}

function rerenderHud(tokenDoc) {
  const hud = canvas.tokens?.hud;
  if (hud?.object?.document?.id === tokenDoc.id) hud.render();
}

async function onRenderTokenHUD(hud, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const token = hud.object;
  const doc = token?.document;
  if (!root || !doc?.isOwner) return;
  root.querySelector(".pa-hud-button")?.remove();
  root.querySelector(".pa-palette")?.remove();

  const col = root.querySelector(".col.right") ?? root.querySelector(".col.left") ?? root;
  const entries = getTokenAuras(doc);
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("control-icon", "pa-hud-button");
  if (entries.some(isAuraActive)) button.classList.add("pa-has-active");
  if (openForTokenId === doc.id) button.classList.add("active");
  button.dataset.tooltip = localize("PRIMAL_AURAS.HUD.Button");
  button.setAttribute("aria-label", localize("PRIMAL_AURAS.HUD.Button"));
  button.innerHTML = `<i class="pa-aura-icon"></i>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openForTokenId = openForTokenId === doc.id ? null : doc.id;
    hud.render();
  });
  button.addEventListener("contextmenu", async event => {
    event.preventDefault();
    event.stopPropagation();
    await toggleAll(doc);
  });
  col.appendChild(button);

  if (openForTokenId === doc.id) {
    try { await renderPalette(hud, doc, col); }
    catch (err) { console.error("Primal Auras | Palette failed", err); }
  }
}

/** Right-click on the HUD button: switch every aura off, or on if all are off. */
async function toggleAll(doc) {
  const entries = getTokenAuras(doc).filter(e => e.document.isOwner);
  if (!entries.length) return;
  const anyOn = entries.some(e => e.aura.enabled);
  const byDoc = new Map();
  for (const e of entries) {
    if (!byDoc.has(e.document)) byDoc.set(e.document, []);
    byDoc.get(e.document).push(e.aura.id);
  }
  for (const [document, ids] of byDoc) {
    const list = (document.getFlag(MODULE_ID, "auras") ?? []).map(a => (ids.includes(a.id) ? { ...a, enabled: !anyOn } : a));
    await document.setFlag(MODULE_ID, "auras", list);
  }
  rerenderHud(doc);
}

async function renderPalette(hud, doc, col) {
  const scene = doc.parent;
  const entries = getTokenAuras(doc);
  const units = scene?.grid?.units || game.system?.grid?.units || "";
  const step = scene?.grid?.distance || 5;
  const override = getSetting("shapeOverride");
  const presets = getPresets();

  const context = {
    units, step,
    isGM: game.user.isGM,
    override: override !== "none" ? localize(`PRIMAL_AURAS.Shape.${override}`) : "",
    presetChoices: Object.fromEntries(presets.map(p => [p.id, p.name])),
    hasPresets: presets.length > 0,
    hasActor: !!doc.actor,
    auras: entries.map(e => {
      const shape = effectiveShape(e.aura, scene);
      return {
        key: e.key,
        name: e.aura.name,
        enabled: e.aura.enabled,
        inactiveReason: e.aura.enabled && !isAuraActive(e) ? localize("PRIMAL_AURAS.HUD.NotEquipped") : "",
        isItem: e.sourceType === "item",
        itemName: e.item?.name ?? "",
        itemImg: e.item?.img ?? "",
        radius: e.aura.radius,
        innerRadius: e.aura.innerRadius,
        color: e.aura.fillColor,
        shapeIcon: shape === "grid" ? "fa-border-all" : "fa-circle",
        shapeLabel: localize(`PRIMAL_AURAS.Shape.${shape}`),
        effectCount: e.aura.effects.length,
        canEdit: e.document.isOwner,
        canDelete: e.sourceType === "token" && e.document.isOwner
      };
    })
  };

  const htmlString = await renderTemplate(TEMPLATES.palette, context);
  const wrapper = document.createElement("div");
  wrapper.innerHTML = htmlString.trim();
  const palette = wrapper.firstElementChild;
  if (getComputedStyle(col).position === "static") col.style.position = "relative";
  col.appendChild(palette);
  activatePalette(palette, hud, doc, entries);
}

function activatePalette(palette, hud, doc, entries) {
  const entryFor = el => entries.find(e => e.key === el.closest("[data-key]")?.dataset.key);

  // Keep HUD form handling (submit on change / Enter) away from our inputs.
  palette.addEventListener("change", ev => ev.stopPropagation());
  palette.addEventListener("submit", ev => { ev.preventDefault(); ev.stopPropagation(); });
  palette.addEventListener("keydown", ev => {
    ev.stopPropagation();
    if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur?.(); }
  });
  for (const type of ["pointerdown", "mousedown", "wheel", "dblclick"]) palette.addEventListener(type, ev => ev.stopPropagation());

  palette.querySelectorAll("input[data-field]").forEach(input => {
    input.addEventListener("change", async ev => {
      ev.stopPropagation();
      const entry = entryFor(input);
      if (!entry) return;
      const field = input.dataset.field;
      let changes;
      if (field === "color") changes = { fillColor: input.value, borderColor: input.value };
      else {
        const value = Math.max(0, Number(input.value) || 0);
        changes = { [field]: value };
        if (field === "innerRadius" && value >= entry.aura.radius && value > 0) {
          ui.notifications.warn(localize("PRIMAL_AURAS.Notify.InnerTooLarge"));
          input.value = entry.aura.innerRadius;
          return;
        }
      }
      await updateAura(entry.document, entry.aura.id, changes);
      rerenderHud(doc);
    });
  });

  palette.addEventListener("click", async ev => {
    const btn = ev.target.closest("[data-pa-action]");
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    const entry = entryFor(btn);
    switch (btn.dataset.paAction) {
      case "toggle":
        await updateAura(entry.document, entry.aura.id, { enabled: !entry.aura.enabled });
        return rerenderHud(doc);
      case "shape":
        await updateAura(entry.document, entry.aura.id, { shape: entry.aura.shape === "grid" ? "circle" : "grid" });
        if (getSetting("shapeOverride") !== "none") ui.notifications.info(localize("PRIMAL_AURAS.Notify.OverrideActive"));
        return rerenderHud(doc);
      case "edit":
        return AuraConfig.openForEntry(entry, () => rerenderHud(doc));
      case "delete": {
        const ok = await DialogV2().confirm({
          window: { title: localize("PRIMAL_AURAS.HUD.DeleteTitle") },
          content: `<p>${localize("PRIMAL_AURAS.HUD.DeleteConfirm", { name: escapeHTML(entry.aura.name) })}</p>`
        });
        if (ok) { await deleteAura(entry.document, entry.aura.id); rerenderHud(doc); }
        return;
      }
      case "add":
        await addAura(doc, { name: localize("PRIMAL_AURAS.Aura.DefaultName") });
        return rerenderHud(doc);
      case "addPreset": {
        const id = palette.querySelector("select.pa-preset-select")?.value;
        const preset = getPresets().find(p => p.id === id);
        if (!preset) return ui.notifications.warn(localize("PRIMAL_AURAS.Notify.PickPreset"));
        await addAura(doc, cloneAura(preset, { enabled: true }));
        return rerenderHud(doc);
      }
      case "library":
        return new PresetManager().render({ force: true });
      case "items":
        return pickItem(doc);
    }
  });
}

/** Choose one of the actor's items to attach auras to (abilities, spells, equipment...). */
async function pickItem(doc) {
  const actor = doc.actor;
  if (!actor) return;
  const items = [...actor.items].filter(i => i.isOwner).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  if (!items.length) return ui.notifications.warn(localize("PRIMAL_AURAS.Notify.NoItems"));
  const options = items.map(i => {
    const count = (i.getFlag(MODULE_ID, "auras") ?? []).length;
    const typeLabel = localize(CONFIG.Item.typeLabels?.[i.type] ?? i.type);
    return `<option value="${i.id}">${escapeHTML(i.name)} (${escapeHTML(typeLabel)})${count ? ` • ${count}` : ""}</option>`;
  }).join("");
  const itemId = await DialogV2().prompt({
    window: { title: localize("PRIMAL_AURAS.HUD.ItemPickerTitle"), icon: "fa-solid fa-wand-magic-sparkles" },
    content: `<p class="hint">${localize("PRIMAL_AURAS.HUD.ItemPickerHint")}</p><div class="form-group"><select name="itemId" autofocus>${options}</select></div>`,
    ok: { label: localize("PRIMAL_AURAS.HUD.ItemPickerOk"), callback: (event, button) => button.form.elements.itemId.value },
    rejectClose: false
  });
  const item = itemId ? actor.items.get(itemId) : null;
  if (item) DocumentAuras.open(item);
}
