/* ---------- Weather on rolls, from Primal Weather ---------- */

/*
 * Primal Weather says what today's weather does to rolls on an outdoor scene (heavy rain, fog,
 * blowing sand: Disadvantage on Wisdom (Perception) checks; strong wind: on ranged weapon attacks
 * too). It's put on the roll here like a condition's, with the reason in the roll window and in
 * chat, so a player can roll normally when the check doesn't rely on that sense. Primal Weather's
 * "Weather rules apply to rolls" setting turns it off. Without Primal Weather nothing changes.
 */

/** What the weather does to rolls where this creature is: Primal Weather's rollModifiers, or null. */
function weatherRollModifiers(actor) {
  const mod = game.modules?.get?.("primal-weather");
  const api = mod?.active ? mod.api : null;
  if (typeof api?.rollModifiers !== "function") return null;
  const token = tokenForActor(actor);
  const scene = token?.document?.parent ?? token?.scene ?? canvas?.scene ?? null;
  try { return api.rollModifiers(scene); }
  catch (err) { console.warn(`${MODULE_ID} | Could not read the weather's roll rules`, err); return null; }
}

/** A ranged weapon attack (a ranged weapon, or a thrown one), not a spell attack? */
function isRangedWeaponAttack(activity, config) {
  const type = activity?.attack?.type ?? {};
  if ((type.classification ?? "weapon") === "spell") return false;
  const mode = String(config?.attackMode ?? config?.rolls?.[0]?.options?.attackMode ?? "");
  return type.value === "ranged" || mode === "ranged" || mode.startsWith("thrown");
}

Hooks.on("dnd5e.preRollV2", (config, dialog, message) => {
  if (game.system?.id !== "dnd5e") return;
  const hookNames = (config?.hookNames ?? []).map(h => String(h).toLowerCase());
  try {
    if (hookNames.includes("attack")) {
      const activity = config.subject;
      const actor = activity?.actor ?? activity?.item?.actor;
      if (!actor || !isRangedWeaponAttack(activity, config)) return;
      const reasons = weatherRollModifiers(actor)?.rangedWeaponAttack?.map(r => r.reason) ?? [];
      if (reasons.length) applyRollModifiers(config, message, { adv: new Set(), dis: new Set(reasons) }, dialog);
    }
    else if (hookNames.includes("skill")) {
      const actor = config.subject;
      const skill = config.skill ?? config.rolls?.[0]?.data?.skillId ?? config.rolls?.[0]?.options?.skill;
      if (actor?.documentName !== "Actor" || skill !== "prc") return;
      const reasons = weatherRollModifiers(actor)?.perception?.map(r => r.reason) ?? [];
      if (reasons.length) applyRollModifiers(config, message, { adv: new Set(), dis: new Set(reasons) }, dialog);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not apply the weather to the roll`, err);
  }
});
