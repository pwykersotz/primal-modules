/**
 * Public API: game.modules.get("primal-auras").api
 * Every function accepts a Token, TokenDocument, token id (current scene) or Actor.
 */
import {
  getTokenAuras, isAuraActive, addAura, updateAura, deleteAura, findEntry, resolveTokenDocument,
  getPresets, setPresets, findPreset, cloneAura, createAura
} from "./data.js";
import { isTokenInAura } from "./geometry.js";
import { effectiveShape } from "./data.js";
import { refreshAllAuras } from "./renderer.js";
import { engine } from "./automation.js";
import { AuraConfig } from "./apps/aura-config.js";
import { PresetManager } from "./apps/preset-manager.js";
import { openItemAuras } from "./items.js";

function requireToken(token) {
  const doc = resolveTokenDocument(token);
  if (!doc) throw new Error("Primal Auras | Could not resolve a token from the given argument.");
  return doc;
}

function requireEntry(token, aura) {
  const doc = requireToken(token);
  const entry = findEntry(doc, aura);
  if (!entry) throw new Error(`Primal Auras | ${doc.name} has no aura "${aura}".`);
  return entry;
}

export function buildApi() {
  return {
    /** All auras a token projects (token auras and item auras). */
    getAuras: token => getTokenAuras(requireToken(token)).map(e => ({
      ...e.aura, key: e.key, source: e.sourceType, itemId: e.item?.id ?? null, active: isAuraActive(e)
    })),

    /** Add an aura to a token. `data` may be partial; see README for fields. */
    addAura: (token, data = {}) => addAura(requireToken(token), data),

    /** Add a copy of a preset (by id or name) to a token, or to an item when given one. */
    addPreset: async (target, preset, overrides = {}) => {
      const p = findPreset(preset);
      if (!p) throw new Error(`Primal Auras | No preset "${preset}".`);
      const doc = target?.documentName === "Item" ? target : requireToken(target);
      return addAura(doc, cloneAura(p, overrides));
    },

    /** Turn an aura on/off. `state` omitted = toggle. */
    toggleAura: async (token, aura, state) => {
      const entry = requireEntry(token, aura);
      const enabled = typeof state === "boolean" ? state : !entry.aura.enabled;
      return updateAura(entry.document, entry.aura.id, { enabled });
    },

    /** Change range (and optionally the donut's inner radius). */
    setRange: async (token, aura, radius, innerRadius) => {
      const entry = requireEntry(token, aura);
      const changes = { radius };
      if (innerRadius !== undefined) changes.innerRadius = innerRadius;
      return updateAura(entry.document, entry.aura.id, changes);
    },

    /** Switch an aura between "circle" and "grid" (omit shape to swap). */
    setShape: async (token, aura, shape) => {
      const entry = requireEntry(token, aura);
      const next = shape ?? (entry.aura.shape === "grid" ? "circle" : "grid");
      return updateAura(entry.document, entry.aura.id, { shape: next });
    },

    /** Merge arbitrary changes into an aura. */
    updateAura: async (token, aura, changes) => {
      const entry = requireEntry(token, aura);
      return updateAura(entry.document, entry.aura.id, changes);
    },

    removeAura: async (token, aura) => {
      const entry = requireEntry(token, aura);
      return deleteAura(entry.document, entry.aura.id);
    },

    /** Tokens currently inside one of a token's auras. */
    tokensInAura: (token, aura) => {
      const entry = requireEntry(token, aura);
      const scene = entry.tokenDoc.parent;
      const inst = { sourceDoc: entry.tokenDoc, aura: entry.aura, shape: effectiveShape(entry.aura, scene) };
      return scene.tokens.filter(t => isTokenInAura(inst, t));
    },

    /** Is `target` inside `source`'s aura? */
    isInAura: (target, source, aura) => {
      const entry = requireEntry(source, aura);
      const scene = entry.tokenDoc.parent;
      const inst = { sourceDoc: entry.tokenDoc, aura: entry.aura, shape: effectiveShape(entry.aura, scene) };
      return isTokenInAura(inst, requireToken(target));
    },

    getPresets,
    findPreset,
    savePreset: async data => {
      const list = getPresets();
      const aura = createAura(data);
      const idx = list.findIndex(p => p.id === aura.id);
      if (idx < 0) list.push(aura); else list[idx] = aura;
      await setPresets(list);
      return aura;
    },

    openPresetLibrary: () => new PresetManager().render({ force: true }),
    openAuraConfig: (token, aura) => AuraConfig.openForEntry(requireEntry(token, aura)),
    openItemAuras: item => openItemAuras(item),

    /** Force a redraw / re-evaluation. */
    refresh: () => { refreshAllAuras(); engine.scheduleRelevant(); },
    /** Remove every effect currently granted by "while inside" auras in the current scene. */
    cleanup: () => engine.cleanup()
  };
}
