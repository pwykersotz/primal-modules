/**
 * Applying aura effects to a target: saving throws, damage, healing, conditions and modifiers.
 * Runs only on the active GM's client (see automation.js).
 */
import { MODULE_ID, TEMPLATES, DEFAULT_EFFECT_ICON, getSetting, localize, renderTemplate, RollClass, warn } from "./constants.js";
import {
  abilityLabel, damageTypeLabel, evaluateFormula, resolveStaticValue, getSourceRollData,
  rollSave, applyHpChange, writeChanges, writeDuration
} from "./system.js";
import { findPlayerOwner, requestRemoteSave } from "./socket.js";

/* -------------------------------------------- */
/*  Relationship filters                        */
/* -------------------------------------------- */

function disposition(doc) {
  const D = CONST.TOKEN_DISPOSITIONS;
  const d = doc.disposition;
  return d === D.SECRET ? D.HOSTILE : d;
}

export function effectAffects(effect, sourceDoc, targetDoc) {
  const isSelf = sourceDoc.id === targetDoc.id;
  if (effect.affects === "self") return isSelf;
  if (isSelf) return effect.includeSelf;
  if (effect.affects === "all") return true;
  const ally = disposition(sourceDoc) === disposition(targetDoc);
  return effect.affects === "allies" ? ally : !ally;
}

/* -------------------------------------------- */
/*  Active Effect data builders                 */
/* -------------------------------------------- */

function originFor(inst) {
  const entry = inst.entry;
  return (entry.sourceType === "item" ? entry.item?.uuid : entry.tokenDoc?.actor?.uuid) ?? undefined;
}

function describe(inst) {
  return localize("PRIMAL_AURAS.Effect.Description", { aura: inst.aura.name, source: inst.sourceDoc.name });
}

async function statusEffectData(statusId, extra) {
  let data;
  try {
    const cls = CONFIG.ActiveEffect.documentClass;
    const effect = await cls.fromStatusEffect(statusId);
    data = effect.toObject();
  } catch {
    const cfg = CONFIG.statusEffects.find(s => s.id === statusId);
    data = { name: localize(cfg?.name ?? statusId), img: cfg?.img ?? DEFAULT_EFFECT_ICON };
  }
  delete data._id;
  data.statuses = [...new Set([...(data.statuses ?? []), statusId])];
  data.disabled = false;
  if (extra.duration) data.duration = extra.duration;
  data.origin = extra.origin;
  data.description = extra.description ?? data.description;
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { [MODULE_ID]: extra.flags });
  if (!data.origin) delete data.origin;
  return data;
}

function changesEffectData(effect, inst, changes, extra) {
  const data = {
    name: effect.name,
    img: effect.img || DEFAULT_EFFECT_ICON,
    origin: extra.origin,
    disabled: false,
    description: extra.description,
    flags: { [MODULE_ID]: extra.flags }
  };
  if (!data.origin) delete data.origin;
  if (extra.duration) data.duration = extra.duration;
  return writeChanges(data, changes);
}

/** Creation data for a continuous ("while inside") effect spec. */
export async function continuousEffectData(spec, scene) {
  const flags = {
    continuous: true,
    specKey: spec.specKey,
    sig: spec.sig,
    sceneId: scene.id,
    sourceTokenId: spec.inst.sourceDoc.id,
    auraId: spec.inst.aura.id,
    effectId: spec.effect.id
  };
  const extra = { origin: originFor(spec.inst), description: describe(spec.inst), flags };
  if (spec.kind === "status") return statusEffectData(spec.statusId, extra);
  return changesEffectData(spec.effect, spec.inst, spec.changes, extra);
}

/* -------------------------------------------- */
/*  Saving throws                               */
/* -------------------------------------------- */

async function requestSave(targetDoc, ability, dc) {
  const actor = targetDoc.actor;
  if (getSetting("playerSaves")) {
    const user = findPlayerOwner(actor);
    if (user) {
      const timeout = Math.max(5, Number(getSetting("saveTimeout")) || 30) * 1000;
      const result = await requestRemoteSave(user, actor, ability, dc, timeout);
      if (result) return result;
    }
  }
  return rollSave(actor, ability, dc, { configure: false });
}

/* -------------------------------------------- */
/*  Expiry                                      */
/* -------------------------------------------- */

function buildExpiry(effect, inst, targetDoc, combat) {
  const pos = { combatId: combat?.id ?? null, round: combat?.round ?? 0, turn: combat?.turn ?? 0 };
  switch (effect.duration.type) {
    case "turnStartTarget": return { type: "turnStart", tokenId: targetDoc.id, ...pos };
    case "turnEndTarget": return { type: "turnEnd", tokenId: targetDoc.id, ...pos };
    case "turnStartSource": return { type: "turnStart", tokenId: inst.sourceDoc.id, ...pos };
    case "turnEndSource": return { type: "turnEnd", tokenId: inst.sourceDoc.id, ...pos };
    case "rounds": return { type: "rounds", rounds: effect.duration.rounds, time: game.time.worldTime, ...pos };
    default: return null;
  }
}

/* -------------------------------------------- */
/*  Triggered effects                           */
/* -------------------------------------------- */

/**
 * Resolve one triggered aura effect against one target.
 * @param {object} ctx
 * @param {Scene} ctx.scene
 * @param {object} ctx.inst      Aura instance (see AuraEngine#collectInstances)
 * @param {object} ctx.effect    Effect definition
 * @param {TokenDocument} ctx.targetDoc
 * @param {string} ctx.trigger   Trigger id
 * @param {Combat|null} ctx.combat
 */
export async function applyTriggeredEffect({ scene, inst, effect, targetDoc, trigger, combat }) {
  const actor = targetDoc.actor;
  if (!actor) return;
  const rollData = getSourceRollData(inst.entry);
  const card = {
    auraName: inst.aura.name,
    effectName: effect.name !== inst.aura.name ? effect.name : "",
    sourceName: inst.sourceDoc.name,
    targetName: targetDoc.name,
    trigger: localize(`PRIMAL_AURAS.Trigger.${trigger}`),
    img: effect.img || inst.entry.item?.img || inst.sourceDoc.texture?.src || DEFAULT_EFFECT_ICON
  };

  let outcome = "full";
  if (effect.save.ability) {
    const dc = Math.round(await evaluateFormula(effect.save.dc, rollData, 10));
    let result = null;
    try { result = await requestSave(targetDoc, effect.save.ability, dc); }
    catch (err) { warn("Saving throw failed", err); }
    card.save = { label: abilityLabel(effect.save.ability), dc, total: result?.total ?? "—", success: !!result?.success };
    if (result?.success) outcome = effect.save.onSuccess === "half" ? "half" : "none";
  }
  card.outcome = outcome;
  card.negated = outcome === "none";

  const rolls = [];
  const Roll = RollClass();

  if (outcome !== "none" && effect.damage.formula) {
    try {
      const roll = new Roll(effect.damage.formula, rollData);
      await roll.evaluate({ allowInteractive: false });
      rolls.push(roll);
      const amount = outcome === "half" ? Math.floor(roll.total / 2) : roll.total;
      await applyHpChange(actor, amount, effect.damage.type, false);
      card.damage = { amount, rolled: roll.total, halved: outcome === "half", type: damageTypeLabel(effect.damage.type) };
    } catch (err) { warn("Damage roll failed", err); }
  }

  if (outcome !== "none" && effect.healing.formula) {
    try {
      const roll = new Roll(effect.healing.formula, rollData);
      await roll.evaluate({ allowInteractive: false });
      rolls.push(roll);
      await applyHpChange(actor, roll.total, effect.healing.type, true);
      card.healing = { amount: roll.total, temp: effect.healing.type === "temphp" };
    } catch (err) { warn("Healing roll failed", err); }
  }

  if (outcome === "full" && (effect.statuses.length || effect.changes.some(c => c.key))) {
    const key = `${inst.key}|${effect.id}`;
    if (!effect.stacks) {
      const old = actor.effects.filter(e => e.getFlag(MODULE_ID, "key") === key);
      if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old.map(e => e.id));
    }
    const rounds = effect.duration.type === "rounds" ? effect.duration.rounds : 0;
    const extraBase = {
      origin: originFor(inst),
      description: describe(inst),
      flags: {
        key, triggered: true, sceneId: scene.id,
        sourceTokenId: inst.sourceDoc.id, auraId: inst.aura.id, effectId: effect.id,
        expiry: buildExpiry(effect, inst, targetDoc, combat)
      }
    };
    const docs = [];
    const changes = effect.changes.filter(c => c.key).map(c => ({ ...c, value: resolveStaticValue(c.value, rollData) }));
    if (changes.length) {
      const extra = { ...extraBase, duration: writeDuration({}, rounds, combat).duration };
      docs.push(changesEffectData(effect, inst, changes, extra));
    }
    for (const statusId of effect.statuses) {
      const extra = { ...extraBase, duration: writeDuration({}, rounds, combat).duration };
      docs.push(await statusEffectData(statusId, extra));
    }
    if (docs.length) {
      await actor.createEmbeddedDocuments("ActiveEffect", docs);
      card.statuses = effect.statuses.map(id => {
        const cfg = CONFIG.statusEffects.find(s => s.id === id);
        return localize(cfg?.name ?? id);
      });
      card.modifiers = changes.length ? effect.name : "";
      card.duration = durationLabel(effect);
    }
  }

  if (effect.chat) await postChatCard(card, rolls, inst.sourceDoc);
}

function durationLabel(effect) {
  if (effect.duration.type === "none") return "";
  if (effect.duration.type === "rounds") return localize("PRIMAL_AURAS.Duration.RoundsCount", { rounds: effect.duration.rounds });
  return localize(`PRIMAL_AURAS.Duration.${effect.duration.type}`);
}

async function postChatCard(card, rolls, sourceDoc) {
  const mode = getSetting("chatMode") ?? "public";
  if (mode === "none") return;
  const ChatMessage = CONFIG.ChatMessage.documentClass;
  const content = await renderTemplate(TEMPLATES.chat, card);
  const data = {
    speaker: ChatMessage.getSpeaker({ token: sourceDoc, alias: card.auraName }),
    content,
    flags: { [MODULE_ID]: { card: true } }
  };
  if (rolls.length) {
    data.rolls = rolls;
    data.sound = CONFIG.sounds?.dice;
  }
  if (mode === "gm") data.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
  await ChatMessage.create(data);
}
