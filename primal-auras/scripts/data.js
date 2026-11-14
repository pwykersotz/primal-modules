import { MODULE_ID, FLAG, getSetting } from "./constants.js";

export const SHAPES = ["circle", "grid"];
export const TRIGGERS = ["onEnter", "onLeave", "targetTurnStart", "targetTurnEnd", "sourceTurnStart", "sourceTurnEnd"];
export const DURATIONS = ["none", "turnStartTarget", "turnEndTarget", "turnStartSource", "turnEndSource", "rounds"];
export const AFFECTS = ["all", "allies", "enemies", "self"];
const HEX = /^#[0-9a-f]{6}$/i;

/* -------------------------------------------- */
/*  Defaults                                    */
/* -------------------------------------------- */

export function auraDefaults() {
  return {
    id: "",
    name: "Aura",
    enabled: true,
    shape: "circle",
    radius: 10,
    innerRadius: 0,
    measureFrom: "edge",
    fillColor: "#3a86ff",
    fillAlpha: 0.15,
    borderColor: "#3a86ff",
    borderAlpha: 0.8,
    borderWidth: 3,
    visibility: "all",
    showWhen: "always",
    wallsBlock: false,
    // Creatures already inside when the aura appears or switches on count as entering it
    enterOnAppear: false,
    // Item-hosted auras only
    activation: "passive",
    enableOnUse: false,
    endWithConcentration: false,
    // Presets only
    description: "",
    effects: []
  };
}

export function effectDefaults() {
  return {
    id: "",
    name: "Effect",
    img: "",
    mode: "triggered",
    affects: "enemies",
    includeSelf: false,
    triggers: {
      onEnter: true, onLeave: false,
      targetTurnStart: true, targetTurnEnd: false,
      sourceTurnStart: false, sourceTurnEnd: false
    },
    oncePerTurn: true,
    save: { ability: "", dc: "13", onSuccess: "half" },
    damage: { formula: "", type: "" },
    healing: { formula: "", type: "healing" },
    statuses: [],
    changes: [],
    duration: { type: "none", rounds: 1 },
    stacks: false,
    chat: true
  };
}

/* -------------------------------------------- */
/*  Normalisation                               */
/* -------------------------------------------- */

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const LEGACY_MODE_TO_TYPE = { 0: "custom", 1: "multiply", 2: "add", 3: "downgrade", 4: "upgrade", 5: "override" };

export function createEffect(data = {}) {
  const e = foundry.utils.mergeObject(effectDefaults(), foundry.utils.deepClone(data ?? {}), { inplace: false });
  e.id ||= foundry.utils.randomID();
  e.name = String(e.name ?? "").trim() || "Effect";
  e.img = String(e.img ?? "");
  if (!["triggered", "continuous"].includes(e.mode)) e.mode = "triggered";
  if (!AFFECTS.includes(e.affects)) e.affects = "enemies";
  e.includeSelf = !!e.includeSelf;
  for (const t of TRIGGERS) e.triggers[t] = !!e.triggers?.[t];
  e.oncePerTurn = !!e.oncePerTurn;
  e.save.ability = String(e.save?.ability ?? "");
  e.save.dc = String(e.save?.dc ?? "13");
  if (!["half", "none"].includes(e.save.onSuccess)) e.save.onSuccess = "half";
  e.damage.formula = String(e.damage?.formula ?? "").trim();
  e.damage.type = String(e.damage?.type ?? "");
  e.healing.formula = String(e.healing?.formula ?? "").trim();
  e.healing.type = String(e.healing?.type || "healing");
  const statuses = Array.isArray(e.statuses) ? e.statuses : Object.keys(e.statuses ?? {}).filter(k => e.statuses[k]);
  e.statuses = [...new Set(statuses.map(String).filter(Boolean))];
  const changes = Array.isArray(e.changes) ? e.changes : Object.values(e.changes ?? {});
  e.changes = changes.map(c => ({
    key: String(c?.key ?? "").trim(),
    type: String(c?.type ?? LEGACY_MODE_TO_TYPE[c?.mode] ?? "add"),
    value: String(c?.value ?? "")
  }));
  if (!DURATIONS.includes(e.duration?.type)) e.duration.type = "none";
  e.duration.rounds = Math.max(1, Math.round(num(e.duration?.rounds, 1)));
  e.stacks = !!e.stacks;
  e.chat = e.chat !== false;
  return e;
}

export function createAura(data = {}) {
  const a = foundry.utils.mergeObject(auraDefaults(), foundry.utils.deepClone(data ?? {}), { inplace: false });
  a.id ||= foundry.utils.randomID();
  a.name = String(a.name ?? "").trim() || "Aura";
  a.enabled = !!a.enabled;
  if (!SHAPES.includes(a.shape)) a.shape = "circle";
  a.radius = Math.max(0, num(a.radius, 10));
  a.innerRadius = Math.max(0, num(a.innerRadius, 0));
  if (a.innerRadius >= a.radius) a.innerRadius = 0;
  if (!["edge", "center"].includes(a.measureFrom)) a.measureFrom = "edge";
  if (!HEX.test(a.fillColor)) a.fillColor = "#3a86ff";
  if (!HEX.test(a.borderColor)) a.borderColor = a.fillColor;
  a.fillAlpha = clamp(num(a.fillAlpha, 0.15), 0, 1);
  a.borderAlpha = clamp(num(a.borderAlpha, 0.8), 0, 1);
  a.borderWidth = clamp(num(a.borderWidth, 3), 0, 20);
  if (!["all", "owner", "gm"].includes(a.visibility)) a.visibility = "all";
  if (!["always", "hover", "controlled", "combat"].includes(a.showWhen)) a.showWhen = "always";
  a.wallsBlock = !!a.wallsBlock;
  a.enterOnAppear = !!a.enterOnAppear;
  if (!["passive", "equipped", "manual"].includes(a.activation)) a.activation = "passive";
  a.enableOnUse = !!a.enableOnUse;
  a.endWithConcentration = !!a.endWithConcentration;
  a.description = String(a.description ?? "");
  const effects = Array.isArray(a.effects) ? a.effects : Object.values(a.effects ?? {});
  a.effects = effects.map(e => createEffect(e));
  return a;
}

/** Copy an aura (e.g. from a preset) with fresh ids so it can live on another document. */
export function cloneAura(data, overrides = {}) {
  const a = createAura(foundry.utils.mergeObject(foundry.utils.deepClone(data), overrides, { inplace: false }));
  a.id = foundry.utils.randomID();
  a.effects = a.effects.map(e => ({ ...e, id: foundry.utils.randomID() }));
  delete a.presetId;
  return a;
}

/* -------------------------------------------- */
/*  Reading auras from documents                */
/* -------------------------------------------- */

/**
 * Every aura a token projects: auras stored on the token itself plus auras stored on items
 * owned by the token's actor (abilities, spells, equipment...).
 * @returns {{key:string, aura:object, sourceType:"token"|"item", tokenDoc:TokenDocument, item?:Item, document:Document}[]}
 */
export function getTokenAuras(tokenDoc) {
  const out = [];
  if (!tokenDoc) return out;
  const own = tokenDoc.getFlag?.(MODULE_ID, FLAG);
  if (Array.isArray(own)) {
    for (const raw of own) {
      const aura = createAura(raw);
      out.push({ key: `${tokenDoc.id}.${aura.id}`, aura, sourceType: "token", tokenDoc, document: tokenDoc });
    }
  }
  const actor = tokenDoc.actor;
  if (actor?.items) {
    for (const item of actor.items) {
      const list = item.getFlag?.(MODULE_ID, FLAG);
      if (!Array.isArray(list) || !list.length) continue;
      for (const raw of list) {
        const aura = createAura(raw);
        out.push({ key: `${tokenDoc.id}.${item.id}.${aura.id}`, aura, sourceType: "item", item, tokenDoc, document: item });
      }
    }
  }
  return out;
}

export function getDocumentAuras(doc) {
  const list = doc?.getFlag?.(MODULE_ID, FLAG);
  return Array.isArray(list) ? list.map(a => createAura(a)) : [];
}

/** Is the aura currently switched on (and, for item auras, is the item in a state that projects it)? */
export function isAuraActive(entry) {
  const { aura } = entry;
  if (!aura.enabled || !(aura.radius > 0)) return false;
  if (entry.sourceType === "item" && aura.activation === "equipped") {
    const equipped = entry.item?.system?.equipped;
    if (equipped === false) return false;
  }
  return true;
}

/** Shape actually used, after the world-wide override and gridless scenes are taken into account. */
export function effectiveShape(aura, scene) {
  const grid = scene?.grid;
  if (!grid || grid.isGridless) return "circle";
  const override = getSetting("shapeOverride");
  if (override === "circle" || override === "grid") return override;
  return aura.shape === "grid" ? "grid" : "circle";
}

/* -------------------------------------------- */
/*  Writing auras                               */
/* -------------------------------------------- */

export async function setDocumentAuras(doc, auras) {
  return doc.setFlag(MODULE_ID, FLAG, auras.map(a => createAura(a)));
}

export async function addAura(doc, data = {}) {
  const list = getDocumentAuras(doc);
  const aura = createAura({ shape: getSetting("defaultShape") ?? "circle", ...data });
  if (list.some(a => a.id === aura.id)) aura.id = foundry.utils.randomID();
  list.push(aura);
  await setDocumentAuras(doc, list);
  return aura;
}

export async function updateAura(doc, auraId, changes) {
  const list = getDocumentAuras(doc);
  const idx = list.findIndex(a => a.id === auraId);
  if (idx < 0) return null;
  const next = foundry.utils.mergeObject(list[idx], changes, { inplace: false });
  if (changes.effects) next.effects = changes.effects;
  list[idx] = createAura(next);
  await setDocumentAuras(doc, list);
  return list[idx];
}

export async function replaceAura(doc, aura) {
  const list = getDocumentAuras(doc);
  const idx = list.findIndex(a => a.id === aura.id);
  if (idx < 0) list.push(createAura(aura));
  else list[idx] = createAura(aura);
  return setDocumentAuras(doc, list);
}

export async function deleteAura(doc, auraId) {
  const list = getDocumentAuras(doc).filter(a => a.id !== auraId);
  if (!list.length) return doc.unsetFlag(MODULE_ID, FLAG);
  return setDocumentAuras(doc, list);
}

/* -------------------------------------------- */
/*  Presets                                     */
/* -------------------------------------------- */

export function getPresets() {
  const list = getSetting("presets");
  return Array.isArray(list) ? list.map(p => ({ ...createAura(p), id: p.id })) : [];
}

export async function setPresets(list) {
  return game.settings.set(MODULE_ID, "presets", list.map(p => createAura(p)));
}

export function findPreset(idOrName) {
  const presets = getPresets();
  const needle = String(idOrName ?? "").toLowerCase();
  return presets.find(p => p.id === idOrName) ?? presets.find(p => p.name.toLowerCase() === needle) ?? null;
}

/* -------------------------------------------- */
/*  Token helpers                               */
/* -------------------------------------------- */

export function resolveTokenDocument(token) {
  if (!token) return null;
  if (typeof token === "string") return canvas.scene?.tokens.get(token) ?? null;
  if (token.documentName === "Token") return token;
  if (token.document?.documentName === "Token") return token.document;
  if (token.documentName === "Actor") return token.getActiveTokens?.(false, true)?.[0] ?? null;
  return null;
}

export function findEntry(tokenDoc, auraIdOrName) {
  const entries = getTokenAuras(tokenDoc);
  const needle = String(auraIdOrName ?? "").toLowerCase();
  return entries.find(e => e.aura.id === auraIdOrName || e.key === auraIdOrName)
    ?? entries.find(e => e.aura.name.toLowerCase() === needle) ?? null;
}
