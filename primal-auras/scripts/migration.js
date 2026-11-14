/**
 * One-time carry-over from the module's previous name, "Enhanced Token Auras" (id
 * "enhanced-token-auras"). Copies world settings (including the aura library), token and item
 * auras, and the flags on effects the auras created. The old data is left in place untouched.
 */
import { MODULE_ID, FLAG, getSetting, isActiveGM, localize, warn } from "./constants.js";

const LEGACY_ID = "enhanced-token-auras";
const LEGACY_PRESET_ID = /^eta([A-Z])/;

const legacyAuras = doc => doc?.flags?.[LEGACY_ID]?.[FLAG];
const hasNewAuras = doc => Array.isArray(doc?.flags?.[MODULE_ID]?.[FLAG]);

/** The shipped presets were renamed from "eta…" to "pa…" ids; keep "Restore defaults" matching them. */
function renamePresetIds(list) {
  if (!Array.isArray(list)) return list;
  return list.map(p => ({
    ...p,
    id: String(p?.id ?? "").replace(LEGACY_PRESET_ID, "pa$1"),
    effects: Array.isArray(p?.effects)
      ? p.effects.map(e => ({ ...e, id: String(e?.id ?? "").replace(LEGACY_PRESET_ID, "pa$1") }))
      : p?.effects
  }));
}

async function migrateSettings() {
  const store = game.settings.storage?.get("world");
  const legacy = store?.filter?.(s => s.key?.startsWith(`${LEGACY_ID}.`)) ?? [];
  let n = 0;
  for (const s of legacy) {
    const key = s.key.slice(LEGACY_ID.length + 1);
    if (key === "legacyMigrated" || !game.settings.settings.has(`${MODULE_ID}.${key}`)) continue;
    let value = s.value;
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch { /* a plain string value */ }
    }
    if (key === "presets") value = renamePresetIds(value);
    await game.settings.set(MODULE_ID, key, value);
    n++;
  }
  return n;
}

async function migrateActor(actor) {
  let n = 0;
  const items = [];
  for (const item of actor.items ?? []) {
    const old = legacyAuras(item);
    if (Array.isArray(old) && !hasNewAuras(item)) items.push({ _id: item.id, [`flags.${MODULE_ID}.${FLAG}`]: old });
  }
  if (items.length) { await actor.updateEmbeddedDocuments("Item", items); n += items.length; }

  const effects = [];
  for (const ef of actor.effects ?? []) {
    const old = ef.flags?.[LEGACY_ID];
    if (old && !ef.flags?.[MODULE_ID]) effects.push({ _id: ef.id, [`flags.${MODULE_ID}`]: old });
  }
  if (effects.length) { await actor.updateEmbeddedDocuments("ActiveEffect", effects); n += effects.length; }
  return n;
}

export async function migrateLegacyData() {
  if (!isActiveGM() || getSetting("legacyMigrated")) return;
  let n = 0;
  try {
    n += await migrateSettings();

    for (const scene of game.scenes) {
      const updates = [];
      for (const t of scene.tokens) {
        const old = legacyAuras(t);
        if (Array.isArray(old) && !hasNewAuras(t)) updates.push({ _id: t.id, [`flags.${MODULE_ID}.${FLAG}`]: old });
      }
      if (updates.length) { await scene.updateEmbeddedDocuments("Token", updates); n += updates.length; }
      for (const t of scene.tokens) {
        if (!t.actorLink && t.actor) n += await migrateActor(t.actor);
      }
    }

    for (const actor of game.actors) n += await migrateActor(actor);

    for (const item of game.items) {
      const old = legacyAuras(item);
      if (Array.isArray(old) && !hasNewAuras(item)) {
        await item.update({ [`flags.${MODULE_ID}.${FLAG}`]: old });
        n++;
      }
    }
  } catch (err) {
    // Not marked as done, so it is retried next time; already-copied data is never overwritten.
    warn("Could not carry over data from Enhanced Token Auras", err);
    return;
  }

  await game.settings.set(MODULE_ID, "legacyMigrated", true);
  if (n) ui.notifications.info(localize("PRIMAL_AURAS.Notify.Migrated"));
}
