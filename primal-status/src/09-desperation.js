/* -------------------------------------------- */
/*  Desperation attacks (a hidden GM option)     */
/* -------------------------------------------- */

/*
 * A GM-only rule that players never see. When a player's character is at 10% of its Hit Points or
 * less, the first attack roll it makes in a turn of combat has a chance of being a Desperation
 * Attack: it hits every target automatically (never a critical hit), and its damage is the attack's
 * maximum damage times 1.5, rounded down. One chance per character per turn, whether or not it
 * comes up. The chat card only calls it a Desperation Attack and is coloured to stand out; it
 * doesn't say how it works. The chance is the GM's setting, in percent (50% unless changed).
 *
 * How: the attack roll is marked on dnd5e's last pre-roll hook. Once its dice are rolled the chance
 * is rolled; on a success the d20 is set to a natural result that hits every target (a natural 1 or
 * a critical is never shown), Midi-QOL is told every target is hit (so a Shield cast in reaction
 * can't turn it into a miss), and the attack's damage roll is maximised and raised by half.
 */
const DESPERATION = { hpFraction: 0.1, chance: 0.5, damageFactor: 1.5 };
const desperationTurns = new Map();     // actor uuid → the combat turn its chance was last rolled in
const desperatePending = new Map();     // actor uuid → { activity, turn }: a Desperation Attack awaiting its damage

function desperationEnabled() {
  try { return !!game.settings.get(MODULE_ID, "desperationAttacks"); } catch { return false; }
}

/** A player character: a character that a player owns. */
function isPlayerCharacter(actor) {
  return actor?.type === "character" && !!actor.hasPlayerOwner;
}

/** At 10% of its Hit Points or less (but still standing). */
function isDesperate(actor) {
  const hp = actor?.system?.attributes?.hp;
  const max = Number(hp?.effectiveMax ?? hp?.max), value = Number(hp?.value);
  return Number.isFinite(max) && max > 0 && Number.isFinite(value) && value > 0 && value <= max * DESPERATION.hpFraction;
}

/** A key for the turn of the started combat this creature is fighting in, or null outside combat. */
function desperationTurnKey(actor) {
  if (!actor) return null;
  const fights = c => c?.started && [...(c.combatants ?? [])].some(cb => cb?.actor === actor || (!!actor.uuid && cb?.actor?.uuid === actor.uuid));
  const combat = [game.combat, ...(game.combats ?? [])].find(fights);
  return combat ? `${combat.id}:${combat.round}:${combat.turn}` : null;
}

/** The chance of a Desperation Attack, from 0 to 1: the GM's setting in percent (50% if it can't be read). */
function desperationChance() {
  let percent = NaN;
  try { percent = Number(game.settings.get(MODULE_ID, "desperationChance")); } catch { percent = NaN; }
  if (!Number.isFinite(percent)) return DESPERATION.chance;
  return Math.min(Math.max(percent, 0), 100) / 100;
}

function desperationRandom() {
  const r = CONFIG.Dice?.randomUniform?.();
  return Number.isFinite(r) ? r : Math.random();
}

/** What a target's cover adds to its AC (Midi-QOL may count it on top of the AC). */
function desperationCoverBonus(actor) {
  if (hasStatus(actor, "coverThreeQuarters")) return 5;
  if (hasStatus(actor, "coverHalf")) return 2;
  return 0;
}

/** The total an attack needs to hit every target, or null with no targets. */
function desperationNeeded(attacker, targets) {
  const acs = targets.filter(t => t?.actor && t.actor !== attacker)
    .map(t => (Number(t.actor.system?.attributes?.ac?.value) || 10) + desperationCoverBonus(t.actor));
  return acs.length ? Math.max(...acs) : null;
}

/** dnd5e pre-roll, attack: give the attack its chance if the character qualifies. */
function markDesperationCheck(config) {
  const activity = config?.subject;
  const actor = activity?.actor ?? activity?.item?.actor;
  if (!actor?.uuid) return false;
  desperatePending.delete(actor.uuid);                  // a new attack: any earlier Desperation Attack's damage is done
  if (!isPlayerCharacter(actor) || !isDesperate(actor)) return false;
  const turn = desperationTurnKey(actor);
  if (!turn || desperationTurns.get(actor.uuid) === turn) return false;
  const roll = config.rolls?.[0];
  if (!roll) return false;
  roll.options ??= {};
  roll.options.mgDesperationCheck = { actor: actor.uuid, activity: activity?.uuid ?? null, turn, needed: desperationNeeded(actor, [...(game.user?.targets ?? [])]) };
  return true;
}

/** dnd5e pre-roll, damage: the damage of a Desperation Attack is maximised and raised by half. */
function markDesperateDamage(config, dialog) {
  const activity = config?.subject;
  const actor = activity?.actor ?? activity?.item?.actor;
  if (!actor?.uuid) return false;
  const workflow = config.workflow ?? config.midiOptions?.workflow;
  let desperate;
  if (workflow?.attackRoll) desperate = !!workflow.attackRoll.options?.mgDesperation;   // Midi-QOL: its own attack
  else {
    const pending = desperatePending.get(actor.uuid);
    desperate = !!pending && pending.turn === desperationTurnKey(actor) && (!pending.activity || !activity?.uuid || pending.activity === activity.uuid);
  }
  if (!desperate) return false;
  desperatePending.delete(actor.uuid);
  config.isCritical = false;
  for (const roll of config.rolls ?? []) {
    roll.options ??= {};
    roll.options.isCritical = false;
    roll.options.mgDesperateDamage = actor.uuid;
  }
  if (dialog && typeof dialog === "object") { dialog.options ??= {}; dialog.options.defaultButton = "normal"; }
  return true;
}

Hooks.on("dnd5e.preRollV2", (config, dialog) => {
  if (!desperationEnabled()) return;
  const hookNames = (config?.hookNames ?? []).map(h => String(h).toLowerCase());
  try {
    if (hookNames.includes("attack")) markDesperationCheck(config);
    else if (hookNames.includes("damage")) markDesperateDamage(config, dialog);
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not set up a desperation attack`, err);
  }
});

/**
 * Set a rolled attack's d20 so the attack hits: the natural result it rolled if that already hits
 * (and isn't a critical), otherwise a random one that does. Never a natural 1 or a critical; if
 * nothing short of a critical would hit, the total is raised instead.
 */
function forceDesperateHit(roll, needed) {
  const d20 = roll.d20 ?? roll.dice?.[0];
  const results = d20?.results;
  if (!results?.length) return;
  const natural = Number(d20.total);
  const total = Number(roll._total ?? roll.total);
  if (!Number.isFinite(natural) || !Number.isFinite(total)) return;
  const rest = total - natural;
  const crit = Number(d20.options?.criticalSuccess ?? roll.options?.criticalSuccess) || 20;
  const fumble = Number(d20.options?.criticalFailure ?? roll.options?.criticalFailure) || 1;
  const hasTarget = Number.isFinite(Number(needed)) && needed !== null;
  const lo = Math.max(fumble + 1, hasTarget ? Math.ceil(Number(needed) - rest) : fumble + 1);
  const hi = crit - 1;
  let value;
  if (lo <= hi) value = (natural >= lo && natural <= hi) ? natural : lo + Math.floor(desperationRandom() * (hi - lo + 1));
  else value = Math.max(fumble + 1, hi);
  const ADV = CONFIG.Dice?.D20Roll?.ADV_MODE ?? { ADVANTAGE: 1, DISADVANTAGE: -1 };
  const mode = d20.options?.advantageMode ?? roll.options?.advantageMode;
  for (const r of results) {
    if (r.active !== false && !r.discarded) r.result = value;
    else if (mode === ADV.ADVANTAGE) r.result = Math.min(r.result, value);       // the kept die stays the highest
    else if (mode === ADV.DISADVANTAGE) r.result = Math.max(r.result, value);    // …or the lowest
    else r.result = value;
  }
  const recomputed = typeof roll._evaluateTotal === "function" ? Number(roll._evaluateTotal()) : NaN;
  roll._total = Number.isFinite(recomputed) ? recomputed : rest + value;
  if (hasTarget && roll._total < Number(needed)) roll._total = Number(needed);
}

/** Once an attack roll's dice are rolled: roll its chance, and make a Desperation Attack hit. */
function desperationAfterRoll(roll) {
  const o = roll.options;
  const check = o.mgDesperationCheck;
  if (check) {
    delete o.mgDesperationCheck;
    if (desperationTurns.get(check.actor) !== check.turn) {
      desperationTurns.set(check.actor, check.turn);
      if (desperationRandom() < desperationChance()) {
        o.mgDesperation = true;
        if (check.needed !== null && check.needed !== undefined) o.mgDesperationNeeded = check.needed;
        desperatePending.set(check.actor, { activity: check.activity, turn: check.turn });
      }
    }
  }
  if (o.mgDesperation && !roll._mgDesperate) {
    roll._mgDesperate = true;
    delete o.mgCritOnHit;                                 // it hits, but never as a critical
    forceDesperateHit(roll, o.mgDesperationNeeded ?? null);
  }
}

/** A Desperation Attack's damage roll: every die at its highest, then half as much again (per damage type). */
function boostDesperateDamage(roll) {
  for (const die of roll.dice ?? []) {
    const faces = Number(die?.faces);
    if (!(faces > 0)) continue;
    for (const r of die.results ?? []) if (r.active !== false && !r.discarded) r.result = faces;
  }
  const recomputed = typeof roll._evaluateTotal === "function" ? Number(roll._evaluateTotal()) : NaN;
  if (Number.isFinite(recomputed)) roll._total = recomputed;
  const extra = DESPERATION.damageFactor - 1;
  adjustDamageByType(roll, share => Math.floor(share * extra), total => Math.floor(total * DESPERATION.damageFactor));
}

/* Midi-QOL: once it has checked the hits, every target of a Desperation Attack is hit. */
Hooks.on("midi-qol.hitsChecked", workflow => {
  try {
    if (!workflow?.attackRoll?.options?.mgDesperation) return;
    workflow.hitTargets = new Set(workflow.targets ?? []);
    workflow.hitTargetsEC = new Set();
    workflow.isFumble = false;
    const hits = game.i18n?.localize?.("midi-qol.hits");
    for (const data of Object.values(workflow.hitDisplayData ?? {})) {
      if (!data || data.isHit === true) continue;
      data.isHit = true;
      data.hitClass = "success";
      if (hits && hits !== "midi-qol.hits") data.hitString = hits;
      if (typeof data.hitStyle === "string") data.hitStyle = data.hitStyle.replace(/red/g, "green");
      if (data.hitResultNumeric !== undefined) data.hitResultNumeric = "--";
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not mark a desperation attack's hits`, err);
  }
});

/* ---------- The chat card: "Desperation Attack", coloured to stand out ---------- */

/** The options of every roll on a chat message (its rolls, and the ones Midi-QOL keeps in its flags). */
function messageRollOptions(message) {
  const list = [];
  const add = r => {
    if (typeof r === "string") { try { r = JSON.parse(r); } catch { return; } }
    if (Array.isArray(r)) { r.forEach(add); return; }
    if (r && typeof r === "object" && r.options) list.push(r.options);
  };
  for (const roll of message?.rolls ?? []) add(roll);
  const midi = message?.flags?.["midi-qol"];
  if (midi && typeof midi === "object") for (const key of ["attackRoll", "damageRoll", "damageRolls", "otherDamageRoll", "otherDamageRolls"]) add(midi[key]);
  return list;
}

function isDesperationMessage(message) {
  return messageRollOptions(message).some(o => o?.mgDesperation || o?.mgDesperateDamage);
}

function styleDesperationCard(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || !isDesperationMessage(message)) return false;
  const name = loc("MIGHTYGUARD.Desperation.Name");
  root.classList.add("primal-desperation");
  let itemName = null;
  try { itemName = message.getAssociatedItem?.()?.name ?? null; } catch { /* no item */ }
  const title = root.querySelector(".card-header .title");
  itemName ??= title?.textContent?.trim() || null;
  if (title) {
    title.textContent = name;                          // (also clears the icon from an earlier pass)
    if (typeof document !== "undefined" && typeof title.prepend === "function") {
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-fire primal-desperation-icon";
      icon.setAttribute?.("inert", "");
      title.prepend(icon);
    }
  }
  const swap = el => {
    const text = el.textContent ?? "";
    if (itemName && text.includes(itemName)) el.textContent = text.split(itemName).join(name);
    else if (!title) el.textContent = name;            // a roll card of its own: its flavor is the attack's name
  };
  for (const el of root.querySelectorAll(".message-header .flavor-text, .dice-flavor")) swap(el);
  // Players see the totals but not the dice and formulas behind them
  if (!game.user?.isGM) for (const el of root.querySelectorAll(".dice-formula, .dice-tooltip")) el.remove();
  return true;
}

/*
 * Core's renderChatMessageHTML fires before dnd5e 6 fills the card in from the message's data, so
 * the card is styled again on dnd5e.renderChatMessage, which fires once dnd5e (and Midi-QOL, which
 * works inside dnd5e's card enrichment) have finished. Styling twice changes nothing.
 */
for (const hook of ["renderChatMessageHTML", "dnd5e.renderChatMessage"]) {
  Hooks.on(hook, (message, html) => {
    try { styleDesperationCard(message, html); }
    catch (err) { console.warn(`${MODULE_ID} | Could not style a desperation attack's card`, err); }
  });
}
