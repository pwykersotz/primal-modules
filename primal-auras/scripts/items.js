/**
 * Abilities, spells and equipment can carry auras. This file wires them into item sheets, turns
 * auras on when the item is used, and off again when concentration on it ends.
 */
import { MODULE_ID, FLAG, localize, warn } from "./constants.js";
import { DocumentAuras } from "./apps/document-auras.js";

let lastOpen = { id: null, at: 0 };

export function openItemAuras(item) {
  // Guard against both the header-control onClick and the registered action firing.
  const now = Date.now();
  if (lastOpen.id === item.uuid && now - lastOpen.at < 400) return;
  lastOpen = { id: item.uuid, at: now };
  return DocumentAuras.open(item);
}

export function registerItemHooks() {
  // Application V1 item sheets
  Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
    const item = sheet.item ?? sheet.document;
    if (!item?.isOwner) return;
    buttons.unshift({
      label: localize("PRIMAL_AURAS.Item.HeaderButton"),
      class: "pa-item-auras",
      icon: "pa-aura-icon",
      onclick: () => openItemAuras(item)
    });
  });

  // Application V2 item sheets (dnd5e 5.x and most current systems)
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    if (app instanceof DocumentAuras) return;
    const item = app.document;
    if (item?.documentName !== "Item" || !item.isOwner) return;
    if (controls.some(c => c.action === "paItemAuras")) return;
    controls.push({
      icon: "pa-aura-icon",
      label: "PRIMAL_AURAS.Item.HeaderButton",
      action: "paItemAuras",
      visible: true,
      onClick: () => openItemAuras(item)
    });
    try {
      const actions = app.options?.actions;
      if (actions && !Object.isFrozen(actions) && !actions.paItemAuras) actions.paItemAuras = () => openItemAuras(item);
    } catch { /* actions may be frozen; onClick still works */ }
  });

  // Using an item switches on its "enable on use" auras (e.g. casting Spirit Guardians).
  Hooks.on("dnd5e.postUseActivity", activity => onItemUsed(activity?.item));
  Hooks.on("dnd5e.useItem", item => onItemUsed(item));

  // Ending concentration switches off auras flagged to end with it.
  Hooks.on("deleteActiveEffect", onEffectDeleted);
}

const recentlyUsed = new Map();

async function onItemUsed(item) {
  if (!item?.isOwner) return;
  const now = Date.now();
  if (now - (recentlyUsed.get(item.uuid) ?? 0) < 1000) return;
  recentlyUsed.set(item.uuid, now);
  const list = item.getFlag(MODULE_ID, FLAG);
  if (!Array.isArray(list) || !list.some(a => a.enableOnUse && !a.enabled)) return;
  await item.setFlag(MODULE_ID, FLAG, list.map(a => (a.enableOnUse ? { ...a, enabled: true } : a)));
  ui.notifications.info(localize("PRIMAL_AURAS.Notify.EnabledOnUse", { name: item.name }));
}

function effectMatchesItem(effect, item) {
  const get = path => foundry.utils.getProperty(effect, path);
  const origin = String(effect.origin ?? "");
  return origin === item.uuid
    || (origin && origin.includes(item.id))
    || get("flags.dnd5e.item.id") === item.id
    || get("flags.dnd5e.item.uuid") === item.uuid
    || get("flags.dnd5e.itemData._id") === item.id;
}

async function onEffectDeleted(effect, options, userId) {
  if (userId !== game.user.id) return;
  const actor = effect.parent;
  if (actor?.documentName !== "Actor") return;
  const concentrating = CONFIG.specialStatusEffects?.CONCENTRATING ?? "concentrating";
  if (!effect.statuses?.has?.(concentrating)) return;
  const remaining = actor.effects.filter(e => e.id !== effect.id && e.statuses?.has?.(concentrating));
  for (const item of actor.items) {
    const list = item.getFlag(MODULE_ID, FLAG);
    if (!Array.isArray(list) || !list.some(a => a.endWithConcentration && a.enabled)) continue;
    if (remaining.some(e => effectMatchesItem(e, item))) continue;
    try {
      await item.setFlag(MODULE_ID, FLAG, list.map(a => (a.endWithConcentration ? { ...a, enabled: false } : a)));
      ui.notifications.info(localize("PRIMAL_AURAS.Notify.DisabledConcentration", { name: item.name }));
    } catch (err) { warn(err); }
  }
}
