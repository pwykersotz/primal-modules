// Ignacious, the Sword of Burning Truth (Dungeons of Drakkenheim).
// The first attack with it in a combat draws the blade: it casts zone of truth centred on itself (a Primal Auras aura
// on the sword: 15 ft, Charisma save DC 20) and sheds a mild flickering firelight out to 10 ft from the wielder's
// token. Both last until that combat ends.
import { MOD, BURNING_TRUTH, isBurningTruthItem, isAttackActivity, findCombatFor, zoneOfTruthAura, fieryLight } from "./logic.mjs";

const STATE = "burningTruth";
const AURAS = "primal-auras";
const busy = new Set();

const log = (...args) => { try { if (game.settings.get(MOD, "debug")) console.log(`${MOD} | Ignacious |`, ...args); } catch { /* not registered yet */ } };
const isGMRunner = () => game.users.activeGM?.isSelf ?? game.user.isGM;
const aurasActive = () => !!game.modules.get(AURAS)?.active;
const randomID = () => foundry.utils.randomID();
const fromUuid = (uuid) => (foundry.utils.fromUuid ?? globalThis.fromUuid)(uuid);

/** Every actor in the world that could carry the sword: sidebar actors and unlinked tokens' actors. */
function allActors() {
  const out = new Map();
  for (const a of game.actors ?? []) out.set(a.uuid, a);
  for (const scene of game.scenes ?? []) {
    for (const t of scene.tokens ?? []) if (!t.actorLink && t.actor) out.set(t.actor.uuid, t.actor);
  }
  return [...out.values()];
}

/** The wielder's tokens that are in this combat (or on its scene). */
function tokensFor(actor, combat) {
  const docs = new Map();
  for (const cb of combat.combatants ?? []) {
    if (cb.actor?.uuid === actor.uuid && cb.token) docs.set(cb.token.uuid, cb.token);
  }
  if (!docs.size) {
    const sceneId = combat.scene?.id ?? null;
    for (const t of actor.getActiveTokens?.(false, true) ?? []) {
      if (!sceneId || t.parent?.id === sceneId) docs.set(t.uuid, t);
    }
  }
  return [...docs.values()];
}

/* ------------------------------------------------ drawing the blade */

async function onAttack(item, actor) {
  try {
    if (!isBurningTruthItem(item)) return;
    actor ??= item.actor;
    if (!actor?.isOwner) return;
    const token = actor.token ?? actor.getActiveTokens?.(false, true)?.[0];
    const combat = findCombatFor(game.combats?.contents ?? [], actor.uuid, token?.parent?.id ?? canvas?.scene?.id);
    if (!combat) return;
    if (actor.getFlag(MOD, STATE)?.combatId === combat.id) return;
    if (busy.has(actor.uuid)) return;
    busy.add(actor.uuid);
    try {
      if (actor.getFlag(MOD, STATE)) await endBurningTruth(actor); // left over from an earlier combat
      await startBurningTruth(actor, item, combat);
    } finally {
      busy.delete(actor.uuid);
    }
  } catch (err) {
    console.error(`${MOD} | Ignacious`, err);
  }
}

async function startBurningTruth(actor, item, combat) {
  const state = { combatId: combat.id, itemUuid: item.uuid, auraId: null, lights: [] };

  for (const doc of tokensFor(actor, combat)) {
    const prior = doc.toObject().light ?? {};
    state.lights.push({ uuid: doc.uuid, light: prior });
    await doc.update({ light: fieryLight(prior) });
  }

  if (aurasActive()) {
    state.auraId = randomID();
    const list = foundry.utils.deepClone(item.getFlag(AURAS, "auras") ?? [])
      .filter((a) => !a?.flags?.[MOD]?.burningTruth);
    const aura = zoneOfTruthAura(state.auraId);
    aura.flags = { [MOD]: { burningTruth: true } };
    list.push(aura);
    await item.setFlag(AURAS, "auras", list);
  } else {
    ui.notifications?.warn("Ignacious: Primal Auras isn't active, so only the firelight was added, not the Zone of Truth.");
  }

  await actor.setFlag(MOD, STATE, state);
  log(`${actor.name} draws ${item.name} in combat ${combat.id}`, state);

  const ChatMessage = CONFIG.ChatMessage.documentClass;
  const zone = state.auraId
    ? `<p>It casts <strong>zone of truth</strong> centred on the blade: ${BURNING_TRUTH.radius}-foot radius, Charisma save DC ${BURNING_TRUTH.saveDC}. A creature saves when it enters the zone for the first time on a turn or starts its turn there.</p>`
    : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p><strong>${item.name}</strong> is drawn. Embers fall from the silver blade.</p>${zone}<p>Lasts until the combat ends.</p>`
  });
}

/** Bring a zone drawn by an older version up to date with the current aura settings (keeps its id, so no new saves). */
async function refreshZone(actor, state) {
  if (!state.auraId || !aurasActive()) return;
  const item = (state.itemUuid && await fromUuid(state.itemUuid)) || actor.items.find(isBurningTruthItem);
  const list = item?.getFlag(AURAS, "auras");
  if (!Array.isArray(list)) return;
  const idx = list.findIndex((a) => a?.id === state.auraId);
  if (idx < 0) return;
  const fresh = { ...zoneOfTruthAura(state.auraId), flags: { [MOD]: { burningTruth: true } } };
  if (JSON.stringify(list[idx]) === JSON.stringify({ ...list[idx], ...fresh })) return;
  const next = foundry.utils.deepClone(list);
  next[idx] = { ...next[idx], ...fresh };
  await item.setFlag(AURAS, "auras", next);
  log(`${actor.name}: updated the Zone of Truth aura`);
}

/* ------------------------------------------------ the combat ends */

async function endBurningTruth(actor) {
  const state = actor.getFlag(MOD, STATE);
  if (!state) return;

  for (const { uuid, light } of state.lights ?? []) {
    try {
      const doc = await fromUuid(uuid);
      if (doc) await doc.update({ light });
    } catch (err) { console.error(`${MOD} | Ignacious: restoring light`, err); }
  }

  if (state.auraId) {
    try {
      const item = (state.itemUuid && await fromUuid(state.itemUuid)) || actor.items.find(isBurningTruthItem);
      const list = item?.getFlag(AURAS, "auras");
      if (Array.isArray(list)) {
        const rest = list.filter((a) => a?.id !== state.auraId && !a?.flags?.[MOD]?.burningTruth);
        if (rest.length) await item.setFlag(AURAS, "auras", rest);
        else await item.unsetFlag(AURAS, "auras");
      }
    } catch (err) { console.error(`${MOD} | Ignacious: removing the aura`, err); }
    await removeTruthMarkers((ef) => ef.flags?.[AURAS]?.auraId === state.auraId);
  }

  await actor.unsetFlag(MOD, STATE);
  log(`${actor.name}: Ignacious' zone and light end`);
}

/** Delete the "Zone of Truth" marker effects that match. */
async function removeTruthMarkers(match, actors = allActors()) {
  for (const a of actors) {
    const ids = a.effects.filter(match).map((e) => e.id);
    if (ids.length) await a.deleteEmbeddedDocuments("ActiveEffect", ids).catch((err) => console.error(`${MOD} | Ignacious`, err));
  }
}

async function endForCombat(combatId) {
  for (const actor of allActors()) {
    const state = actor.getFlag(MOD, STATE);
    if (state && (!combatId || state.combatId === combatId)) await endBurningTruth(actor);
  }
}

/* ------------------------------------------------ leaving the zone */

const activeAuraIds = () => new Set(allActors().map((a) => a.getFlag(MOD, STATE)?.auraId).filter(Boolean));
const zoneTimers = new Map();

/** A creature that failed its save is only bound while it stays inside: take the marker off once it is out. */
function scheduleZoneCheck(scene) {
  clearTimeout(zoneTimers.get(scene.id));
  zoneTimers.set(scene.id, setTimeout(() => {
    zoneTimers.delete(scene.id);
    checkZone(scene).catch((err) => console.error(`${MOD} | Ignacious zone check`, err));
  }, 400));
}

async function checkZone(scene) {
  const api = game.modules.get(AURAS)?.api;
  const ids = activeAuraIds();
  if (!api || !ids.size) return;
  for (const t of scene.tokens) {
    const actor = t.actor;
    if (!actor) continue;
    const stale = actor.effects.filter((ef) => {
      const f = ef.flags?.[AURAS];
      if (!f?.auraId || !ids.has(f.auraId)) return false;
      const source = scene.tokens.get(f.sourceTokenId);
      if (!source) return true;
      try { return !api.isInAura(t, source, f.auraId); } catch { return true; }
    });
    if (stale.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map((e) => e.id));
      log(`${actor.name} left the Zone of Truth`);
    }
  }
}

/* ------------------------------------------------ hooks */

export function registerIgnacious() {
  // Plain dnd5e attack rolls.
  Hooks.on("dnd5e.rollAttack", (rolls, { subject } = {}) => {
    if (subject?.item) onAttack(subject.item, subject.actor ?? subject.item.actor);
  });
  // Using the attack activity (also covers Midi-QOL workflows).
  Hooks.on("dnd5e.postUseActivity", (activity) => {
    if (isAttackActivity(activity) && activity.item) onAttack(activity.item, activity.actor ?? activity.item.actor);
  });
  Hooks.on("midi-qol.AttackRollComplete", (workflow) => {
    if (workflow?.item) onAttack(workflow.item, workflow.actor ?? workflow.item.actor);
  });

  Hooks.on("deleteCombat", (combat) => {
    if (isGMRunner()) endForCombat(combat.id).catch((err) => console.error(`${MOD} | Ignacious`, err));
  });

  Hooks.on("updateToken", (doc, changes) => {
    if (!isGMRunner() || !doc.parent) return;
    if (!("x" in changes || "y" in changes || "elevation" in changes)) return;
    scheduleZoneCheck(doc.parent);
  });

  Hooks.once("ready", () => {
    if (!isGMRunner()) return;
    (async () => {
      for (const actor of allActors()) {
        const state = actor.getFlag(MOD, STATE);
        if (!state) continue;
        const combat = game.combats.get(state.combatId);
        // Clean up after a combat that ended while no GM was connected.
        if (!combat?.started) { await endBurningTruth(actor); continue; }
        await refreshZone(actor, state);
      }
    })().catch((err) => console.error(`${MOD} | Ignacious`, err));
  });

}

/** Macro helpers: PrimalDrakkenheim.ignacious.end(actor) ends the zone and light early. */
export const ignaciousApi = {
  end: (actor) => endBurningTruth(actor),
  endAll: () => endForCombat(null),
  isActive: (actor) => !!actor?.getFlag(MOD, STATE)
};
