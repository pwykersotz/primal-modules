import { MOD, damageOfTypes, epicHitPoints, suppressesRegeneration, breaksFrozen, drainHealing, failedBy,
  contaminationLevels, thornsApplies, partySizeFrom, shouldApplyEpic } from "./logic.mjs";
import { registerIgnacious, ignaciousApi } from "./ignacious.mjs";

const log = (...args) => { if (game.settings.get(MOD, "debug")) console.log(`${MOD} |`, ...args); };

Hooks.once("init", () => {
  game.settings.register(MOD, "partySize", {
    name: "PDK.Settings.PartySize.Name", hint: "PDK.Settings.PartySize.Hint",
    scope: "world", config: true, type: Number, default: 0, range: { min: 0, max: 12, step: 1 }
  });
  game.settings.register(MOD, "debug", {
    name: "PDK.Settings.Debug.Name", hint: "PDK.Settings.Debug.Hint",
    scope: "client", config: true, type: Boolean, default: false
  });
});

function primaryPartyMembers() {
  try {
    const party = game.actors?.party ?? game.settings.get("dnd5e", "primaryParty")?.actor;
    return party?.system?.playerCharacters ?? party?.system?.members?.map?.((m) => m.actor) ?? null;
  } catch {
    return null;
  }
}
const partySize = () => partySizeFrom(game.settings.get(MOD, "partySize"), game.actors?.contents ?? [], {
  partyMembers: primaryPartyMembers(),
  userCharacters: game.users?.filter((u) => !u.isGM && u.character).map((u) => u.character) ?? null
});
/** Primal Combat's side initiative: there the whole enemy side acts on one number, which Primal Combat keeps. */
function isSideInitiative(combat) {
  const pc = game.modules.get("primal-combat");
  try { return !!pc?.active && pc.api?.getMode?.(combat) === "side"; } catch { return false; }
}
const itemFlag = (actor, key) => actor?.items?.find((i) => i.flags?.[MOD]?.[key])?.flags[MOD][key];
const isGMRunner = () => game.users.activeGM?.isSelf ?? game.user.isGM;

async function createEffectOn(actor, data) {
  if (!actor) return;
  if (actor.isOwner) return actor.createEmbeddedDocuments("ActiveEffect", [data]);
  return globalThis.MidiQOL?.socket?.().executeAsGM("createEffects", { actorUuid: actor.uuid, effects: [data] });
}

async function deleteEffectsOn(actor, ids) {
  if (!actor || !ids.length) return;
  if (actor.isOwner) return actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  return globalThis.MidiQOL?.socket?.().executeAsGM("removeEffects", { actorUuid: actor.uuid, effects: ids });
}

function markerEffect(name, status, img) {
  return {
    name, img, statuses: [status], transfer: false, showIcon: 2,
    duration: { value: 6, units: "seconds", expiry: "turnEnd" },
    flags: { [MOD]: { marker: true } }
  };
}

registerIgnacious();

/* ------------------------------------------------ contamination levels */
Hooks.on("preCreateActiveEffect", (effect, data, options, userId) => {
  if (userId !== game.user.id) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;
  const levels = contaminationLevels(data);
  if (!levels) return;
  if (actor.system?.traits?.ci?.value?.has?.("contamination")) {
    log(`${actor.name} is immune to contamination`);
    return false;
  }
  // Add levels to the system's own Contamination condition instead of a second, separate effect.
  Promise.resolve().then(() => actor.toggleStatusEffect("contamination", { levels }))
    .catch((err) => console.error(`${MOD} | contamination`, err));
  log(`${actor.name} gains ${levels} contamination level(s)`);
  return false;
});

/* ------------------------------------------------ Epic Bosses */
Hooks.on("preCreateToken", (tokenDoc, data, options, userId) => {
  if (userId !== game.user.id) return;
  const actor = tokenDoc.actor ?? game.actors.get(data.actorId);
  const epic = actor?.flags?.[MOD]?.epic;
  if (!epic) return;
  if (!shouldApplyEpic({ actorLink: tokenDoc.actorLink, hp: actor.system?.attributes?.hp })) {
    log(`${actor.name} is wounded: placing another token leaves its hit points and Epic Actions as they are`);
    return;
  }
  const n = partySize();
  const hp = epicHitPoints(epic, n);
  const system = { resources: { legact: { max: n, spent: 0 } } };
  if (hp) system.attributes = { hp: { max: hp, value: hp } };
  if (tokenDoc.actorLink) {
    actor.update({ system });
  } else {
    tokenDoc.updateSource({ delta: { system } });
  }
  log(`${actor.name}: ${hp ?? "unchanged"} HP and ${n} Epic Actions for ${n} player characters`);
});

// Bosses act on 20. The flag tells Primal Combat, whose side initiative then counts 20 as the boss's initiative when it
// works out the enemies' number (and the boss acts with its side).
Hooks.on("preCreateCombatant", (combatant, data, options, userId) => {
  if (combatant.actor?.flags?.[MOD]?.epic) {
    combatant.updateSource({ initiative: 20, "flags.primal-combat.fixedInitiative": 20 });
  }
});

Hooks.on("preUpdateCombatant", (combatant, changes) => {
  if (!combatant.actor?.flags?.[MOD]?.epic) return;
  if (isSideInitiative(combatant.parent)) return;
  if ("initiative" in changes && changes.initiative !== null && changes.initiative !== 20) changes.initiative = 20;
});

/* ------------------------------------------------ damage riders (run where the workflow runs) */
Hooks.on("midi-qol.isDamaged", async (token, { workflow, damageItem } = {}) => {
  try {
    if (!workflow || !damageItem) return;
    const target = token?.actor;
    const detail = damageItem.damageDetail ?? [];
    const taken = (damageItem.hpDamage ?? 0) + (damageItem.tempDamage ?? 0);
    const tokenUuid = token.document?.uuid ?? token.uuid;
    workflow[`${MOD}Damage`] ??= {};
    workflow[`${MOD}Damage`][tokenUuid] = { taken, detail };

    // Life drain on the item that dealt the damage.
    const drain = workflow.item?.flags?.[MOD]?.drain;
    if (drain && workflow.actor && taken > 0) {
      const heal = drainHealing(drain, detail, taken);
      if (heal > 0) {
        const hp = workflow.actor.system.attributes.hp;
        await workflow.actor.update({ "system.attributes.hp.value": Math.min(hp.max, hp.value + heal) });
        log(`${workflow.actor.name} drains ${heal} HP`);
      }
    }
    if (!target) return;

    // Regeneration suppressed by the right damage.
    const regen = itemFlag(target, "regeneration");
    if (regen && suppressesRegeneration(regen, detail) && !target.statuses.has("regenerationSuppressed")) {
      await createEffectOn(target, markerEffect("Regeneration Suppressed", "regenerationSuppressed", "icons/svg/downgrade.svg"));
      log(`${target.name}: regeneration suppressed`);
    }

    // Frozen ends on 20+ bludgeoning or fire damage.
    if (target.statuses.has("frozen") && breaksFrozen(detail)) {
      const ids = target.effects.filter((e) => e.statuses.has("frozen")).map((e) => e.id);
      await deleteEffectsOn(target, ids);
      log(`${target.name} breaks free of Frozen`);
    }

    // Displacement switches off until the end of its next turn.
    if (itemFlag(target, "displacement") && taken > 0 && !target.statuses.has("displacementOff")) {
      await createEffectOn(target, markerEffect("Displacement Disrupted", "displacementOff", "icons/svg/blind.svg"));
    }

    // Thorns: the attacker takes damage.
    const thorns = itemFlag(target, "thorns");
    const attacker = workflow.token;
    if (thorns && attacker && attacker !== token) {
      const actionType = workflow.activity?.actionType;
      const distance = globalThis.MidiQOL?.computeDistance?.(attacker, token, { wallsBlock: false });
      if (thornsApplies(thorns, { actionType, distance })) {
        const roll = await new CONFIG.Dice.DamageRoll(thorns.formula, {}, { type: thorns.type }).evaluate();
        const source = target.items.find((i) => i.flags?.[MOD]?.thorns);
        new MidiQOL.DamageOnlyWorkflow(target, token, roll.total, thorns.type, [attacker], roll,
          { flavor: source?.name ?? "Thorns", itemCardUuid: "new", itemData: { name: source?.name ?? "Thorns", img: source?.img, type: "feat" } });
      }
    }
  } catch (err) {
    console.error(`${MOD} | isDamaged`, err);
  }
});

/* ------------------------------------------------ fail by N riders */
Hooks.on("midi-qol.postApplyDynamicEffects", async (workflow) => {
  try {
    const entries = workflow?.item?.flags?.[MOD]?.failBy;
    if (!entries?.length || !workflow.failedSaves?.size) return;
    const ids = new Set([workflow.activity?.id, workflow.otherActivity?.id].filter(Boolean));
    for (const entry of entries) {
      if (entry.activity && !ids.has(entry.activity)) continue;
      const dc = entry.dc ?? workflow.saveDC;
      for (const token of workflow.failedSaves) {
        const roll = workflow.tokenSaves?.[token.document?.uuid];
        if (!roll || !failedBy(roll.total, dc, entry.margin)) continue;
        const target = token.actor;
        log(`${target.name} failed ${workflow.item.name} by ${entry.margin}+`);
        if (entry.replace?.length) {
          // "...the target instead has the Incapacitated condition": take off the effects the failure gave.
          const old = target.effects.filter((e) => entry.replace.includes(e.flags?.[MOD]?.sourceId)
            && (!e.origin || e.origin.startsWith(workflow.item.uuid)));
          await deleteEffectsOn(target, old.map((e) => e.id));
        }
        for (const id of entry.effects ?? []) {
          const src = workflow.item.effects.get(id);
          if (!src) continue;
          const data = src.toObject();
          delete data._id;
          data.transfer = false;
          data.origin = workflow.item.uuid;
          await createEffectOn(target, data);
        }
        for (const d of entry.damage ?? []) {
          const r = await new CONFIG.Dice.DamageRoll(d.formula, {}, { type: d.type }).evaluate();
          new MidiQOL.DamageOnlyWorkflow(workflow.actor, workflow.token, r.total, d.type, [token], r,
            { flavor: `${workflow.item.name} (failed by ${entry.margin})`, itemCardUuid: "new",
              itemData: { name: workflow.item.name, img: workflow.item.img, type: "feat" } });
        }
        if (entry.double) {
          const taken = workflow[`${MOD}Damage`]?.[token.document?.uuid]?.taken ?? 0;
          if (taken > 0) await target.applyDamage(taken);
        }
      }
    }
  } catch (err) {
    console.error(`${MOD} | failBy`, err);
  }
});

Hooks.once("ready", () => {
  globalThis.PrimalDrakkenheim = { partySize, damageOfTypes, ignacious: ignaciousApi };
  console.log(`${MOD} | ready (party size ${partySize()})`);
});
