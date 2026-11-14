// Pure rules used by the hooks in main.mjs. No Foundry globals here so Node can test them.

export const MOD = "primal-drakkenheim";

/** Sum the damage of the given types in a midi damage detail list ([{type, value}]). Empty types = all damage. */
export function damageOfTypes(detail = [], types = []) {
  let total = 0;
  for (const d of detail ?? []) {
    if (!d || ["healing", "temphp", "midi-none"].includes(d.type)) continue;
    if (types.length && !types.includes(d.type)) continue;
    total += Number(d.value ?? d.damage ?? 0) || 0;
  }
  return Math.max(0, total);
}

/** Epic Boss hit points: base + perPC × party size. */
export function epicHitPoints(epic, partySize) {
  if (!epic || !Number.isFinite(epic.base) || !Number.isFinite(epic.perPC)) return null;
  const n = Math.max(1, Math.floor(partySize || 1));
  return epic.base + epic.perPC * n;
}

/** Does this damage suppress regeneration? */
export function suppressesRegeneration(regen, detail) {
  if (!regen?.suppressedBy?.length) return false;
  return damageOfTypes(detail, regen.suppressedBy) > 0;
}

/** Drakkenheim Frozen ends when the creature takes 20 or more bludgeoning or fire damage at once. */
export function breaksFrozen(detail, threshold = 20) {
  return damageOfTypes(detail, ["bludgeoning", "fire"]) >= threshold;
}

/** Hit points a draining attack gives back. Capped at the damage the target actually took. */
export function drainHealing(drain, detail, damageTaken) {
  if (!drain) return 0;
  const typed = damageOfTypes(detail, drain.types ?? []);
  const dealt = Math.min(typed, Math.max(0, damageTaken ?? typed));
  return Math.floor(dealt * (drain.fraction ?? 1));
}

/** Did a failed save miss the DC by the margin ("fails by 5 or more")? */
export function failedBy(total, dc, margin) {
  if (!Number.isFinite(total) || !Number.isFinite(dc)) return false;
  return total <= dc - (margin ?? 5);
}

/** Contamination levels an effect wants to add, or null when it isn't a contamination effect. */
export function contaminationLevels(effectData) {
  const statuses = Array.from(effectData?.statuses ?? []);
  if (!statuses.includes("contamination")) return null;
  const levels = Number(effectData?.flags?.[MOD]?.levels);
  return Number.isFinite(levels) && levels > 0 ? levels : null;
}

/** Thorns: does this hit set off the trait? */
export function thornsApplies(spec, { actionType, distance } = {}) {
  if (!spec) return false;
  const attackTypes = spec.melee ? ["mwak", "msak"] : ["mwak", "msak", "rwak", "rsak"];
  if (!attackTypes.includes(actionType)) return false;
  if (Number.isFinite(distance) && distance > (spec.within ?? 5) + 0.01) return false;
  return true;
}

/**
 * Party size: the setting, or when it is 0 the characters in dnd5e's primary party, else the players' assigned
 * characters, else every player-owned character in the world (4 if there are none).
 */
export function partySizeFrom(setting, actors = [], { partyMembers = null, userCharacters = null } = {}) {
  if (setting > 0) return setting;
  const characters = (list) => new Set((list ?? []).filter((a) => a?.type === "character")).size;
  const n = characters(partyMembers) || characters(userCharacters)
    || actors.filter((a) => a.type === "character" && a.hasPlayerOwner).length;
  return n || 4;
}

/**
 * Should placing an Epic Boss token set its hit points and Epic Actions? Always for an unlinked token (a new
 * creature); for a linked boss only while it is unhurt, so a wounded boss moved to another scene keeps its damage.
 */
export function shouldApplyEpic({ actorLink, hp } = {}) {
  if (!actorLink) return true;
  const value = Number(hp?.value), max = Number(hp?.max);
  if (!Number.isFinite(value) || !Number.isFinite(max)) return true;
  return value >= max;
}

/* ------------------------------------------------ Ignacious, the Sword of Burning Truth */

export const BURNING_TRUTH = {
  auraName: "Zone of Truth",
  radius: 15,
  saveDC: 20,
  markerKey: `flags.${MOD}.zoneOfTruth`,
  img: "icons/magic/perception/eye-ringed-green.webp"
};

/** Is this item Ignacious? A `burningTruth` flag of true or false on the item overrides the name check. */
export function isBurningTruthItem(item) {
  if (!item) return false;
  const flag = item.flags?.[MOD]?.burningTruth;
  if (typeof flag === "boolean") return flag;
  const identifier = String(item.system?.identifier ?? "");
  if (identifier.startsWith("ignacious")) return true;
  return /^\s*igna(c|t|ss)i?ous\b/i.test(String(item.name ?? ""));
}

/** Is this dnd5e activity (or midi workflow activity) an attack? */
export function isAttackActivity(activity) {
  if (!activity) return false;
  if (activity.type === "attack") return true;
  return ["mwak", "rwak", "msak", "rsak"].includes(activity.actionType);
}

/**
 * The started combat this actor is fighting in: one that lists it as a combatant, otherwise one running on the scene
 * its token is on. Returns null outside combat.
 */
export function findCombatFor(combats = [], actorUuid, sceneId = null) {
  const started = Array.from(combats ?? []).filter((c) => c?.started);
  const listed = started.find((c) => Array.from(c.combatants ?? []).some((cb) => cb?.actor?.uuid === actorUuid));
  if (listed) return listed;
  if (!sceneId) return null;
  return started.find((c) => (c.scene?.id ?? c.sceneId ?? null) === sceneId) ?? null;
}

/** Primal Auras data for the sword's Zone of Truth (15-ft sphere centred on the blade, Charisma save DC 20). */
export function zoneOfTruthAura(id, { radius = BURNING_TRUTH.radius, dc = BURNING_TRUTH.saveDC } = {}) {
  return {
    id,
    name: BURNING_TRUTH.auraName,
    enabled: true,
    shape: "circle",
    radius,
    innerRadius: 0,
    measureFrom: "edge",
    fillColor: "#f6d77a",
    fillAlpha: 0.07,
    borderColor: "#ffc94a",
    borderAlpha: 0.55,
    borderWidth: 2,
    visibility: "all",
    showWhen: "always",
    wallsBlock: false,
    // Creatures already in the zone when the blade is drawn save straight away, as when the spell is cast.
    enterOnAppear: true,
    activation: "manual",
    enableOnUse: false,
    endWithConcentration: false,
    description: "Ignacious casts zone of truth while drawn. Added for the combat by Primal Drakkenheim Automation.",
    effects: [{
      id: `${String(id).slice(0, 14)}ZT`,
      name: BURNING_TRUTH.auraName,
      img: BURNING_TRUTH.img,
      mode: "triggered",
      affects: "all",
      includeSelf: false,
      // The spell: a creature saves when it enters for the first time on a turn or starts its turn there.
      triggers: { onEnter: true, onLeave: false, targetTurnStart: true, targetTurnEnd: false, sourceTurnStart: false, sourceTurnEnd: false },
      oncePerTurn: true,
      save: { ability: "cha", dc: String(dc), onSuccess: "none" },
      damage: { formula: "", type: "" },
      healing: { formula: "", type: "healing" },
      statuses: [],
      // A marker only: the effect's presence is what matters ("can't speak a deliberate lie").
      changes: [{ key: BURNING_TRUTH.markerKey, type: "override", value: "1" }],
      // Lasts until the start of the creature's next turn, when it saves again if it is still inside.
      duration: { type: "turnStartTarget", rounds: 1 },
      stacks: false,
      chat: true
    }]
  };
}

/** A mild, flickering firelight out to 10 ft, keeping any light settings the token had that this doesn't set. */
export function fieryLight(prior = {}) {
  return {
    ...prior,
    negative: false,
    bright: 5,
    dim: 10,
    angle: 360,
    color: "#ff7a1f",
    alpha: 0.3,
    coloration: 1,
    luminosity: 0.45,
    attenuation: 0.65,
    saturation: 0,
    contrast: 0,
    shadows: 0,
    animation: { ...(prior.animation ?? {}), type: "torch", speed: 2, intensity: 2, reverse: false }
  };
}
