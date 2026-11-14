/* -------------------------------------------- */
/*  Statuses with a value: Jinxed (X), Valor (X), */
/*  Burning (X) and Bleeding (X)                 */
/* -------------------------------------------- */

/*
 * Monsters of Drakkenheim gives some conditions a value: Jinxed (1d6), Valor (1d4), Burning (4d6
 * Fire) or Burning (2d4 Acid), Bleeding (2d4). The value is kept on the effect
 * (flags.primal-status.value) and shown in its name, "Valor (1d6)", and it's set in the status pane
 * beside the palette: a box under the effect's name with buttons for the usual values. It's read
 * again every time it's used, so it keeps applying round after round: Jinxed and Valor on each
 * attack roll and saving throw, Burning and Bleeding at the end of each of the creature's turns
 * (rolled, and applied if the GM chooses).
 *
 * An effect without a value of its own uses the one in its name ("Valor (1d6)", or any die it
 * names), then 1d4. Burning's value may end in a damage type ("2d4 Acid"); without one it's fire.
 * In the pane, Burning's type is picked with its own buttons (Fire or Acid, the book's two), apart
 * from the damage box; it's still kept in the one value, so the name reads "Burning (2d4 Acid)".
 */
const VALUE_STATUSES = {
  jinxed: { fallback: "1d4", choices: ["1d4", "1d6", "1d8", "1d10", "1d12"] },
  valor: { fallback: "1d4", choices: ["1d4", "1d6", "1d8", "1d10", "1d12"] },
  burning: { fallback: "1d4", choices: ["1d4", "1d6", "2d4", "2d6", "4d6"], typed: true, types: ["fire", "acid"], defaultType: "fire" },
  bleeding: { fallback: "1d4", choices: ["1d4", "2d4", "1d6", "2d6", "1d8"] }
};
const BURNING_PATTERN = /(^|[^a-z])(burning|on-?fire|aflame|ignited)$/i;
const BLEEDING_PATTERN = /(^|[^a-z])bleed(ing)?$/i;
/** Statuses matched by a pattern (other modules' "on-fire" counts as Burning), the rest by their ID. */
const VALUE_STATUS_PATTERNS = { burning: BURNING_PATTERN, bleeding: BLEEDING_PATTERN };
const DAMAGE_TYPE_WORDS = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];

/** "2d4 Acid" → { formula: "2d4", type: "acid" }; a value without a damage type → { formula, type: null }. */
function splitValueType(value) {
  const text = String(value ?? "").trim();
  const m = text.match(new RegExp(`^(.*?)\\s*\\b(${DAMAGE_TYPE_WORDS.join("|")})$`, "i"));
  return m && m[1] ? { formula: m[1], type: m[2].toLowerCase() } : { formula: text, type: null };
}

/** A damage type as it's written in a value: "acid" → "Acid". */
const typeWord = type => type ? type[0].toUpperCase() + type.slice(1) : "";

/**
 * A value made of a damage formula and a type: ("2d4", "acid") → "2d4 Acid". The status's own
 * type (Burning's fire) isn't written, so "Burning (1d6)" stays as it was.
 */
function valueWithType(formula, type, id = "burning") {
  const plain = normalizeStatusValue(formula);
  if (!plain) return null;
  const t = String(type ?? "").toLowerCase();
  return t && DAMAGE_TYPE_WORDS.includes(t) && t !== VALUE_STATUSES[id]?.defaultType ? `${plain} ${typeWord(t)}` : plain;
}

/** The damage type a Burning creature takes: "fire", "acid", or another its value names. Null if it isn't Burning. */
function burningType(actor) {
  const value = statusValue(actor, "burning");
  return value ? (splitValueType(value).type ?? VALUE_STATUSES.burning.defaultType) : null;
}

/**
 * A value typed in by someone, tidied up ("d6" → "1d6", "2D6 + 1" → "2d6+1"), or null if it isn't a
 * simple roll: dice and whole numbers added or taken away, up to 20 dice of up to 100 sides. For a
 * status whose value may name a damage type (Burning), that word is kept: "2d4 acid" → "2d4 Acid".
 */
function normalizeStatusValue(text, id = null) {
  if (text === null || text === undefined) return null;
  if (id && VALUE_STATUSES[id]?.typed) {
    const { formula, type } = splitValueType(text);
    const plain = normalizeStatusValue(formula);
    return plain && type ? `${plain} ${typeWord(type)}` : plain;
  }
  let s = String(text).trim().toLowerCase().replace(/\s+/g, "");
  if (!s || s.length > 40) return null;
  s = s.replace(/(^|[+-])d(\d)/g, "$11d$2");
  if (!/^(\d+d\d+|\d+)([+-](\d+d\d+|\d+))*$/.test(s)) return null;
  for (const m of s.matchAll(/(\d+)d(\d+)/g)) {
    const count = Number(m[1]), faces = Number(m[2]);
    if (count < 1 || count > 20 || faces < 2 || faces > 100) return null;
  }
  if (s.split(/[+-]/).some(part => !part.includes("d") && Number(part) > 999)) return null;
  return s.replace(/(^|[+-])0+(\d)/g, "$1$2");
}

/** The average of a value ("1d6+1" → 4.5), to pick the strongest of several. */
function statusValueAverage(value) {
  let total = 0;
  for (const m of String(value ?? "").matchAll(/([+-]?)(\d+d\d+|\d+)/g)) {
    const sign = m[1] === "-" ? -1 : 1;
    const [count, faces] = m[2].includes("d") ? m[2].split("d").map(Number) : [null, null];
    total += sign * (faces ? count * (faces + 1) / 2 : Number(m[2]));
  }
  return total;
}

/** The status on this effect that takes a value (jinxed, valor, burning or bleeding), or null. */
function valueStatusOf(effect) {
  const statuses = [...(effect?.statuses ?? [])];
  for (const id of Object.keys(VALUE_STATUSES)) {
    const pattern = VALUE_STATUS_PATTERNS[id];
    if (pattern ? statuses.some(s => typeof s === "string" && pattern.test(s)) : statuses.includes(id)) return id;
  }
  return null;
}

/** Does the effect give this value status? (Burning also counts other modules' "on-fire" and the like.) */
function effectGivesValueStatus(effect, id) {
  const statuses = effect?.statuses;
  if (!statuses) return false;
  const pattern = VALUE_STATUS_PATTERNS[id];
  if (pattern) return [...statuses].some(s => typeof s === "string" && pattern.test(s));
  return statuses.has?.(id) ?? [...statuses].includes(id);
}

/** Does the creature have this value status? */
function hasValueStatus(actor, id) {
  const pattern = VALUE_STATUS_PATTERNS[id];
  return pattern ? hasStatusMatching(actor, pattern) : hasStatus(actor, id);
}

/** The value an effect carries: set on it, or in its name ("Valor (1d6)", "Hex d8", "Burning 2d4 acid"), else null. */
function effectStatusValue(effect) {
  const id = valueStatusOf(effect);
  const set = normalizeStatusValue(moduleFlag(effect, "value"), id) ?? normalizeStatusValue(moduleFlag(effect, "die"), id);
  if (set) return set;
  const name = String(effect?.name ?? "");
  const bracketed = [...name.matchAll(/\(([^()]*)\)/g)].map(m => normalizeStatusValue(m[1], id)).filter(Boolean);
  if (bracketed.length) return bracketed[bracketed.length - 1];
  const die = name.match(/(\d*)d(4|6|8|10|12|20)\b/i);
  if (!die) return null;
  const value = `${Math.max(1, Number(die[1]) || 1)}d${die[2]}`;
  const after = VALUE_STATUSES[id]?.typed ? name.slice(die.index + die[0].length).match(new RegExp(`^\\s*(${DAMAGE_TYPE_WORDS.join("|")})\\b`, "i")) : null;
  return after ? `${value} ${typeWord(after[1].toLowerCase())}` : value;
}

/**
 * A creature's value for a status: the strongest of the effects giving it (by average), 1d4 if none
 * says, or null if the creature doesn't have the status.
 */
function statusValue(actor, id) {
  let best = null, bestAverage = -Infinity, found = false;
  for (const effect of applicableEffects(actor)) {
    if (!effect || effect.disabled || effect.isSuppressed || !effectGivesValueStatus(effect, id)) continue;
    found = true;
    const value = effectStatusValue(effect);
    if (value && statusValueAverage(value) > bestAverage) { best = value; bestAverage = statusValueAverage(value); }
  }
  if (best) return best;
  const has = found || hasValueStatus(actor, id);
  return has ? (VALUE_STATUSES[id]?.fallback ?? "1d4") : null;
}

/** The effect's name with this value in it: "Valor" → "Valor (1d6)". A name of its own is kept. */
function nameWithValue(effect, id, value) {
  const base = statusDisplayName(id);
  const name = String(effect?.name ?? "").trim();
  const plain = name.replace(/\s*\([^()]*\)\s*$/, "").trim();
  if (name && plain.toLowerCase() !== base.toLowerCase()) return null;
  return `${plain || base} (${value})`;
}

/** Set the value on an effect (and in its name). False if the value isn't valid. */
async function setEffectStatusValue(effect, raw) {
  const id = valueStatusOf(effect);
  const value = normalizeStatusValue(raw, id);
  if (!id || !value || typeof effect?.update !== "function") return false;
  const changes = { [`flags.${MODULE_ID}.value`]: value };
  const name = nameWithValue(effect, id, value);
  if (name && name !== effect.name) changes.name = name;
  await effect.update(changes);
  return true;
}

/* ---------- Burning and Bleeding: at the end of each of the creature's turns ---------- */

/*
 * Monsters of Drakkenheim: a Burning creature takes its X (fire, or the damage type its value names,
 * "Burning (2d4 Acid)") at the end of each of its turns, through dnd5e's damage so resistances count.
 * A Bleeding creature loses X Hit Points at the end of each of its turns (lost, not damage: no
 * resistance), and stops bleeding when it regains any Hit Points. The GM's setting (Burning and
 * Bleeding damage) chooses: roll and apply, roll in the chat only, or off.
 */
function burningDamageMode() {
  try { return game.settings.get(MODULE_ID, "burningDamage") ?? "apply"; } catch { return "off"; }
}

const endedTurns = new Map();   // combat → the turns already handled (so going back and forth doesn't burn twice)

/** Roll a burning creature's damage (fire, or the type its value names), say so in the chat and (if the GM chose) apply it. */
async function rollBurningDamage(actor, { apply = true, token = null } = {}) {
  const value = statusValue(actor, "burning");
  if (!value) return null;
  const { formula, type: named } = splitValueType(value);
  const type = named ?? "fire";
  const roll = await new Roll(formula).evaluate();
  const total = Math.max(0, Math.floor(Number(roll.total) || 0));
  const flavor = loc("MIGHTYGUARD.Burning.Flavor").replace("{name}", actor.name ?? "").replace("{value}", formula).replace("{type}", damageTypeLabel(type));
  try {
    const speaker = globalThis.ChatMessage?.getSpeaker?.({ actor, token }) ?? {};
    await roll.toMessage?.({ speaker, flavor: `${statusDisplayName("burning")}: ${flavor}` });
  } catch (err) { console.warn(`${MODULE_ID} | Could not post the Burning roll`, err); }
  if (apply && total > 0 && typeof actor.applyDamage === "function") {
    try { await actor.applyDamage([{ value: total, type, properties: new Set() }]); }
    catch (err) { console.warn(`${MODULE_ID} | Could not apply the Burning damage`, err); }
  }
  return { formula, type, total, roll };
}

/** Roll a bleeding creature's Hit Point loss, say so in the chat and (if the GM chose) take it off. */
async function rollBleedingLoss(actor, { apply = true, token = null } = {}) {
  const value = statusValue(actor, "bleeding");
  if (!value) return null;
  const formula = splitValueType(value).formula;
  const roll = await new Roll(formula).evaluate();
  const total = Math.max(0, Math.floor(Number(roll.total) || 0));
  const flavor = loc("MIGHTYGUARD.Bleeding.Flavor").replace("{name}", actor.name ?? "").replace("{value}", formula);
  try {
    const speaker = globalThis.ChatMessage?.getSpeaker?.({ actor, token }) ?? {};
    await roll.toMessage?.({ speaker, flavor: `${statusDisplayName("bleeding")}: ${flavor}` });
  } catch (err) { console.warn(`${MODULE_ID} | Could not post the Bleeding roll`, err); }
  if (apply && total > 0 && typeof actor.applyDamage === "function") {
    // Hit Points lost, not damage: no type, so no resistance or immunity applies
    try { await actor.applyDamage(total); }
    catch (err) { console.warn(`${MODULE_ID} | Could not take off the Bleeding Hit Points`, err); }
  }
  return { formula, total, roll };
}

/** The name dnd5e gives a damage type ("acid" → "Acid"), or the word itself. */
function damageTypeLabel(type) {
  const label = CONFIG.DND5E?.damageTypes?.[type]?.label;
  return label ? loc(label) : typeWord(type);
}

/** Say in the console what Burning or Bleeding did at the end of a turn (or why it didn't), to help when it seems not to work. */
function logBurning(text) {
  console.log(`${MODULE_ID} | Burning: ${text}`);
}
function logBleeding(text) {
  console.log(`${MODULE_ID} | Bleeding: ${text}`);
}

/** A creature's turn has ended (moving forward, on the GM's client): if it's Burning or Bleeding, roll for it. */
function endOfTurnFor(combatant, mode, round, source) {
  const actor = combatant?.actor;
  if (!actor) return [];
  const burning = statusValue(actor, "burning"), bleeding = statusValue(actor, "bleeding");
  if (!burning && !bleeding) return [];                 // neither: nothing to do or say
  const name = actor.name ?? "";
  const log = burning ? logBurning : logBleeding;
  if (mode === "off") { log(`${name}'s turn ended, but Burning and Bleeding damage is set to Off in the module settings.`); return []; }
  if (combatant.isDefeated) { log(`${name} is defeated, so it takes no Burning or Bleeding damage.`); return []; }
  const jobs = [];
  const token = combatant.token ?? null, apply = mode === "apply";
  const note = apply ? "" : " (not applied: Roll in the chat only)";
  if (burning) {
    const { formula, type } = splitValueType(burning);
    logBurning(`${name}'s turn ended (round ${round}): rolling ${formula} ${type ?? "fire"} damage${apply ? " and applying it" : note}. [${source}]`);
    jobs.push(rollBurningDamage(actor, { apply, token }));
  }
  if (bleeding) {
    logBleeding(`${name}'s turn ended (round ${round}): rolling ${splitValueType(bleeding).formula} Hit Points lost${apply ? " and taking them off" : note}. [${source}]`);
    // after the burn, so the two are applied one after the other
    const after = jobs.length ? jobs[jobs.length - 1].then(() => rollBleedingLoss(actor, { apply, token })) : rollBleedingLoss(actor, { apply, token });
    jobs.push(after);
  }
  for (const job of jobs) job.catch?.(err => console.warn(`${MODULE_ID} | Could not roll Burning or Bleeding`, err));
  return jobs;
}

/**
 * A turn has ended: everyone who was acting (one creature, or the whole side in Primal Combat's
 * side initiative) takes its Burning damage and loses its Bleeding Hit Points, once per turn
 * however many events report it.
 */
function burnAtTurnEnd(combat, prior, source) {
  if (!combat || !prior || !(Number(prior.round) >= 1)) return [];
  const turn = `${prior.round}.${prior.turn}.${prior.combatantId ?? ""}`;
  const key = combat.id ?? combat;
  if (!endedTurns.has(key)) endedTurns.set(key, new Set());
  const handled = endedTurns.get(key);
  if (handled.has(turn)) return [];                      // already handled (both events report a turn, and the GM may step back)
  handled.add(turn);
  const mode = burningDamageMode();
  return turnEndCombatants(combat, prior).flatMap(c => endOfTurnFor(c, mode, prior.round, source));
}

/** Did the turn order move forward from one turn state to the next? */
function turnStateMovedForward(prior, current) {
  const pr = Number(prior?.round) || 0, cr = Number(current?.round) || 0;
  return cr > pr || (cr === pr && (Number(current?.turn) || 0) > (Number(prior?.turn) || 0));
}

// The Combat update: every Foundry version (the turn before it is the combat's "previous")
Hooks.on("updateCombat", (combat, change, options, userId) => {
  if (!combat?.started || !isAutomationClient(userId)) return;
  if (!combatMovedForward(combat, change, options)) return;
  burnAtTurnEnd(combat, combat.previous, "updateCombat");
});

// Foundry 13 and later also announce the turn change itself, after the update, on every client
Hooks.on("combatTurnChange", (combat, prior, current) => {
  if (!combat?.started || !isAutomationClient()) return;
  if (!turnStateMovedForward(prior, current)) return;
  burnAtTurnEnd(combat, prior, "combatTurnChange");
});

Hooks.on("deleteCombat", combat => endedTurns.delete(combat?.id ?? combat));

/* ---------- Bleeding ends when the creature regains Hit Points ---------- */

/** Did this update give the creature back Hit Points (not temporary ones)? dnd5e notes the Hit Points before it. */
function regainedHitPoints(actor, change, options) {
  const get = foundry.utils?.getProperty;
  if (typeof get !== "function" || get(change, "system.attributes.hp.value") === undefined) return false;
  const before = Number(options?.dnd5e?.hp?.value), now = Number(actor?.system?.attributes?.hp?.value);
  return Number.isFinite(before) && Number.isFinite(now) && now > before;
}

Hooks.on("updateActor", (actor, change, options, userId) => {
  if (!isAutomationClient(userId) || burningDamageMode() === "off") return;
  if (!regainedHitPoints(actor, change, options) || !hasValueStatus(actor, "bleeding")) return;
  const ids = ownEffects(actor).filter(e => effectGivesValueStatus(e, "bleeding")).map(e => e.id).filter(Boolean);
  if (!ids.length) return;
  logBleeding(`${actor.name ?? ""} regained Hit Points, so it stops bleeding.`);
  actor.deleteEmbeddedDocuments?.("ActiveEffect", ids)?.catch?.(err => console.warn(`${MODULE_ID} | Could not end Bleeding`, err));
});
