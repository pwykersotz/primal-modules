/**
 * Rolling several attacks from one Attack Roll window, all at once.
 *
 * When the window says more than one attack, the roll it builds is copied that many times before dnd5e rolls it, so
 * every attack gets the same bonuses and the same Advantage, Normal or Disadvantage the button pressed gave the
 * first. All of them are rolled together and Dice So Nice throws them in one go.
 *
 * Without Midi-QOL, dnd5e posts one attack card holding every roll. Once the dice land, the damage of every hit is
 * rolled together too (critical hits in a second set), so the damage card shows the total to apply.
 *
 * With Midi-QOL, the first attack carries on as Midi-QOL's own workflow. Each of the other attacks then gets a
 * workflow of its own, given its attack roll already made (no new dice, no window), so hit checks, damage, saves,
 * effects and concentration happen for every attack as Midi-QOL does them. Midi-QOL's own dice animations are
 * turned off for these workflows: the attack dice are thrown together at the start, and the damage dice together at
 * the end.
 */
import { FLAGS, MODULE_ID, SETTINGS, setting } from "./constants.mjs";
import { takeCount } from "./dialog.mjs";
import { foldsCards } from "./fold.mjs";
import { postSummary } from "./summary.mjs";
import { tokenFor } from "./turn.mjs";

/** Sets of attacks whose rolls have been built but not yet rolled, by id. */
const pending = new Map();

/** Attack rolls already made for the Midi-QOL workflows still to come, by key: {roll, group, fold}. */
const prerolled = new Map();

/** Sets of attacks being finished, by actor uuid. */
const live = new Map();

/** Is a set of attacks being rolled for this creature? */
export function isRunning(actor) {
  return !!actor?.uuid && live.has(actor.uuid);
}

/** Stop a set of attacks after the attack being rolled (Midi-QOL). */
export function stopRun(actor) {
  const group = actor?.uuid ? live.get(actor.uuid) : null;
  if ( group ) group.stopped = true;
  return !!group;
}

/* -------------------------------------------- */
/*  Small helpers                               */
/* -------------------------------------------- */

/** The user's targets as token ids. */
export function targetIds() {
  return [...(game.user?.targets ?? [])].map(t => t.id);
}

/** Target exactly these tokens. */
export function setTargets(ids) {
  const layer = canvas?.tokens;
  if ( !layer ) return;
  const wanted = (ids ?? []).filter(id => layer.get(id));
  const now = targetIds();
  if ( (now.length === wanted.length) && now.every(id => wanted.includes(id)) ) return;
  try {
    if ( typeof layer.setTargets === "function" ) {
      layer.setTargets(wanted, { mode: "replace" });
      return;
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not set targets the usual way`, err);
  }
  if ( typeof game.user?.updateTokenTargets === "function" ) game.user.updateTokenTargets(wanted);
}

/** Is this creature down: at 0 hit points, or marked defeated? */
export function isDefeated(token) {
  const actor = token?.actor;
  if ( !actor ) return false;
  const hp = actor.system?.attributes?.hp;
  if ( hp && (Number(hp.max) > 0) && (Number(hp.value) <= 0) ) return true;
  const dead = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  return !!(actor.statuses?.has?.(dead) || token.document?.hasStatusEffect?.(dead));
}

/** A token's AC, if it's known. */
function targetAC(token) {
  const ac = Number(token?.actor?.system?.attributes?.ac?.value);
  return Number.isFinite(ac) ? ac : null;
}

/** dnd5e's rule for a hit: a critical always hits, a natural 1 always misses, otherwise the total against AC. */
export function evaluateHit(roll, ac) {
  if ( roll?.isCritical ) return true;
  if ( roll?.isFumble ) return false;
  if ( !Number.isFinite(ac) ) return null;
  return Number(roll.total) >= ac;
}

/** Total and types of a set of damage rolls. */
function damageOf(rolls) {
  if ( !rolls?.length ) return null;
  const types = new Set();
  const parts = [];
  let total = 0;
  for ( const roll of rolls ) {
    total += Number(roll.total) || 0;
    const type = roll.options?.type;
    if ( type ) types.add(type);
    parts.push({ text: breakdownOf(roll), dice: diceView(roll), total: Number(roll.total) || 0, type: type ?? null });
  }
  return { total, types: [...types], parts };
}

/** A roll's formula with the dice it rolled: "1d8 (2) + 8". */
export function breakdownOf(roll) {
  const dice = [...(roll?.dice ?? [])];
  const formula = String(roll?.formula ?? "");
  let i = 0;
  return formula.replace(/\b\d*d\d+[a-z0-9<>=]*/gi, match => {
    const die = dice[i++];
    if ( !die ) return match;
    const results = (die.results ?? []).filter(r => r.active !== false).map(r => r.result);
    return results.length ? `${match} (${results.join(", ")})` : match;
  });
}

/**
 * A roll's dice, for drawing on the summary: the formula in order, each dice term with the faces it rolled.
 * "2d20kh + 5" becomes [{label: "2d20", faces: 20, results: [{value: 17}, {value: 3, dropped: true}]}, {text: "+ 5"}].
 * @param {Roll} roll
 * @returns {{total: number, parts: object[]}|null}
 */
export function diceView(roll) {
  if ( !roll ) return null;
  const dice = [...(roll.dice ?? [])];
  // Flavor ("[slashing]") is left out: the damage type is shown on its own.
  const formula = String(roll.formula ?? "").replace(/\[[^\]]*\]/g, "");
  const parts = [];
  const text = t => {
    const trimmed = t.replace(/\s+/g, " ").trim();
    if ( trimmed ) parts.push({ text: trimmed });
  };
  const term = (die, count) => {
    const faces = Number(die?.faces);
    const results = (die?.results ?? []).map(r => ({ value: Number(r.result), dropped: r.active === false }))
      .filter(r => Number.isFinite(r.value));
    if ( !Number.isFinite(faces) || !results.length ) return false;
    const number = Number(die.number) || Number(count) || results.filter(r => !r.dropped).length || 1;
    parts.push({ label: `${number}d${faces}`, faces, results });
    return true;
  };
  let last = 0;
  let i = 0;
  for ( const match of formula.matchAll(/\b(\d*)d(\d+)[a-z0-9<>=]*/gi) ) {
    text(formula.slice(last, match.index));
    if ( !term(dice[i++], match[1]) ) text(match[0]);
    last = match.index + match[0].length;
  }
  text(formula.slice(last));
  // Dice the formula didn't name (rare): shown after it.
  while ( i < dice.length ) term(dice[i++]);
  return { total: Number(roll.total) || 0, parts };
}

/** Has this roll any dice Dice So Nice would still show? */
function hasDiceToShow(roll) {
  return !!roll?.dice?.some?.(d => d.results?.some?.(r => !r.hidden));
}

/**
 * Mark a roll's dice as already shown, as Midi-QOL does once it has thrown them, so Dice So Nice doesn't throw them
 * again when they're added to a chat card.
 */
function markShown(rolls) {
  for ( const roll of rolls ?? [] ) {
    for ( const die of roll?.dice ?? [] ) for ( const result of die.results ?? [] ) result.hidden = true;
  }
}

/** A copy of a rolled roll, for throwing its dice later. */
function snapshot(roll) {
  try {
    const Cls = globalThis.Roll ?? roll.constructor;
    if ( typeof Cls?.fromData === "function" ) return Cls.fromData(JSON.parse(JSON.stringify(roll)));
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not copy a damage roll`, err);
  }
  return null;
}

/** The d20 a roll kept. */
function d20Of(roll) {
  const die = roll?.dice?.find?.(d => Number(d.faces) === 20);
  return Number.isFinite(Number(die?.total)) ? Number(die.total) : null;
}

/** Midi-QOL's own settings. */
function midiConfig() {
  try {
    return globalThis.MidiQOL?.configSettings?.() ?? {};
  } catch {
    return {};
  }
}

/**
 * How Midi-QOL should roll the damage of these attacks: as it's set up to, unless it's set up to wait for a click
 * (then on a hit), so every attack's damage is ready together.
 */
function midiDamageMode() {
  const cfg = midiConfig();
  const mode = game.user?.isGM ? (cfg.gmAutoDamage ?? cfg.autoRollDamage) : cfg.autoRollDamage;
  return (!mode || (mode === "none")) ? "onHit" : mode;
}

/** A token's document uuid, for comparing Midi-QOL's sets of tokens. */
function tokenUuid(token) {
  return token?.document?.uuid ?? token?.uuid ?? null;
}

/**
 * A fresh copy of a roll that hasn't been rolled yet: same formula (with the Advantage or Disadvantage the window
 * gave it), same data, its own options.
 */
export function copyRoll(roll) {
  const Cls = roll.constructor;
  const copy = new Cls(roll.formula, roll.data ?? {}, foundry.utils.deepClone(roll.options ?? {}));
  // Primal Status marks one attack as a desperation attack: it stays with the first.
  delete copy.options.mgDesperation;
  return copy;
}

/** The message mode a roll was made in (public, gm, blind, self). */
function messageModeOf(message) {
  const mode = message?.messageMode ?? message?.rollMode;
  if ( mode ) return String(mode);
  for ( const key of ["messageMode", "rollMode"] ) {
    try {
      const value = game.settings.get("core", key);
      if ( value ) return String(value);
    } catch {
      // Not a setting in this version.
    }
  }
  return "public";
}

/** A promise that settles after some seconds, so nothing waits forever on an animation. */
function delay(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Throw these rolls' dice together with Dice So Nice (one throw: every call is made at once).
 * @param {Roll[]} rolls
 * @param {string} mode   The message mode, for who sees the dice.
 */
export async function showTogether(rolls, mode) {
  const dice3d = game.dice3d;
  const list = (rolls ?? []).filter(r => r?.dice?.length);
  if ( !list.length || (typeof dice3d?.showForRoll !== "function") ) return;
  const m = String(mode ?? "public").toLowerCase();
  const blind = m.includes("blind");
  let whisper = null;
  if ( blind || m.includes("gm") || m.includes("self") ) {
    whisper = [...(ChatMessage.getWhisperRecipients?.("GM") ?? [])];
    if ( !blind && game.user && !whisper.includes(game.user) ) whisper.push(game.user);
  }
  try {
    await Promise.race([Promise.all(list.map(r => dice3d.showForRoll(r, game.user, true, whisper, blind))), delay(30)]);
  } catch (err) {
    console.warn(`${MODULE_ID} | Dice So Nice could not show the dice`, err);
  }
}

/**
 * Wait for a Midi-QOL workflow to finish.
 * @param {function(Workflow): boolean} match
 * @param {number} [timeout]  Seconds.
 * @returns {Promise<{workflow: Workflow|null, aborted: boolean}> & {cancel: function}}
 */
function waitForWorkflow(match, timeout=300) {
  let finish;
  const promise = new Promise(resolve => {
    const ids = [];
    const test = w => {
      try {
        return !!w && match(w);
      } catch {
        return false;
      }
    };
    ids.push(["midi-qol.postCleanup", Hooks.on("midi-qol.postCleanup", w => { if ( test(w) ) finish(w); })]);
    ids.push(["midi-qol.preAbort", Hooks.on("midi-qol.preAbort", w => { if ( test(w) ) finish(w, true); })]);
    const timer = setTimeout(() => finish(null, true), timeout * 1000);
    finish = (workflow, aborted=false) => {
      for ( const [hook, id] of ids ) Hooks.off(hook, id);
      clearTimeout(timer);
      resolve({ workflow, aborted });
    };
  });
  return Object.assign(promise, { cancel: () => finish(null, true) });
}

/** Spend the ammunition of attacks after the first (dnd5e spends one for the roll it makes itself). */
async function spendAmmunition(actor, roll, extra) {
  const id = roll?.options?.ammunition;
  if ( !id || (extra < 1) ) return;
  const item = actor?.items?.get?.(id);
  const quantity = Number(item?.system?.quantity);
  if ( !item || !Number.isFinite(quantity) ) return;
  try {
    await item.update({ "system.quantity": Math.max(0, quantity - extra) });
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not spend the ammunition`, err);
  }
}

/** The usage card an attack roll belongs to, so its damage goes with it. */
function originOf(message) {
  const get = foundry.utils.getProperty;
  return get(message ?? {}, "data.system.origin") ?? get(message ?? {}, "data.flags.dnd5e.originatingMessage") ?? null;
}

/** Mark a Midi-QOL workflow's later cards (its HP Updated card) as part of a set, to fold into its summary. */
function tagWorkflow(workflow, id) {
  if ( !workflow || !id ) return;
  workflow.flagTags = foundry.utils.mergeObject(workflow.flagTags ?? {}, { [MODULE_ID]: { [FLAGS.member]: id } },
    { inplace: false });
}

/** Mark a card that's already posted as part of a set (or not, with null). */
async function markCard(message, id) {
  if ( !message || (message.isOwner === false) || (typeof message.setFlag !== "function") ) return;
  try {
    if ( id ) await message.setFlag(MODULE_ID, FLAGS.member, id);
    else if ( message.getFlag?.(MODULE_ID, FLAGS.member) ) await message.unsetFlag(MODULE_ID, FLAGS.member);
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not mark an attack card`, err);
  }
}

/** Forget sets of attacks whose rolls were never made (a roll cancelled after its window). */
function prune() {
  const old = Date.now() - (10 * 60 * 1000);
  for ( const [id, group] of pending ) if ( group.createdAt < old ) pending.delete(id);
}

/* -------------------------------------------- */
/*  Building the rolls                          */
/* -------------------------------------------- */

/**
 * dnd5e.postRollConfiguration: the window has been answered and the rolls are built, but not rolled yet.
 * @param {Roll[]} rolls
 * @param {object} config
 * @param {object} dialog
 * @param {object} message
 */
export function onPostRollConfiguration(rolls, config, dialog, message) {
  try {
    const hooks = config?.hookNames ?? [];
    if ( hooks.includes("attack") ) multiplyAttack(rolls, config, dialog, message);
    else if ( hooks.includes("damage") ) multiplyDamage(rolls, config);
  } catch (err) {
    console.error(`${MODULE_ID} | Could not add the other attacks`, err);
  }
}

/** Copy the attack roll once for each other attack the window asked for. */
function multiplyAttack(rolls, config, dialog, message) {
  if ( !Array.isArray(rolls) || (rolls.length !== 1) ) return;
  if ( config?.workflow?.workflowOptions?.[MODULE_ID] ) return;
  const count = takeCount(config, dialog);
  if ( count < 2 ) return;
  const activity = config.subject;
  const actor = activity?.actor;
  if ( !actor ) return;

  prune();
  const id = foundry.utils.randomID();
  const first = rolls[0];
  first.options ??= {};
  first.options[MODULE_ID] = { group: id, index: 0, count };
  for ( let index = 1; index < count; index++ ) {
    const copy = copyRoll(first);
    copy.options[MODULE_ID] = { group: id, index, count };
    rolls.push(copy);
  }

  const workflow = config.workflow ?? null;
  // With Midi-QOL, each attack's own cards are folded into the summary.
  const fold = !!workflow && foldsCards();
  pending.set(id, {
    id, count, actor, activity, workflow, fold, targets: targetIds(), origin: originOf(message), stopped: false,
    damageThrow: [], createdAt: Date.now()
  });

  // Midi-QOL: the dice are thrown together here (attacks) and at the end (damage), and no damage window comes up.
  if ( workflow ) {
    workflow.workflowOptions ??= {};
    // forceCompletion: a miss finishes the workflow instead of leaving it waiting for a damage click.
    Object.assign(workflow.workflowOptions, {
      attackRollDSN: false, damageRollDSN: false, fastForwardDamage: true, autoRollDamage: midiDamageMode(),
      forceCompletion: true
    });
  }
  if ( message && (typeof message === "object") ) {
    foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.${FLAGS.group}`, id);
    if ( fold ) foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.${FLAGS.member}`, id);
  }
  if ( fold ) tagWorkflow(workflow, id);
}

/**
 * Copy a damage roll once for each other hit (the damage this module rolls for several attacks at once). A roll that
 * another module marks as one-time (options["primal-attacks"].once, such as a charged or once-a-turn rider) stays with
 * the first hit and isn't copied. Each roll is told which hit it belongs to (options["primal-attacks"].hit).
 */
export function multiplyDamage(rolls, config) {
  const copies = Math.floor(Number(config?.[MODULE_ID]?.copies));
  if ( !Array.isArray(rolls) || !rolls.length || !(copies > 1) ) return;
  const set = [...rolls];
  for ( const roll of set ) markHit(roll, 0);
  const repeated = set.filter(roll => !isOnce(roll));
  for ( let i = 1; i < copies; i++ ) for ( const roll of repeated ) rolls.push(markHit(copyRoll(roll), i));
}

/** Is this roll a one-time rider, for the first hit only? */
function isOnce(roll) {
  return roll?.options?.[MODULE_ID]?.once === true;
}

/** Note which hit of a set a damage roll belongs to. */
function markHit(roll, hit) {
  roll.options ??= {};
  roll.options[MODULE_ID] = { ...(roll.options[MODULE_ID] ?? {}), hit };
  return roll;
}

/** Split a set's damage rolls by hit: by their hit marks, else evenly in order. */
export function splitByHit(rolls, count) {
  const marked = rolls.every(r => Number.isInteger(r?.options?.[MODULE_ID]?.hit));
  if ( marked ) return Array.from({ length: count }, (_, i) => rolls.filter(r => r.options[MODULE_ID].hit === i));
  const per = rolls.length / count;
  if ( Number.isInteger(per) && (per > 0) ) return Array.from({ length: count }, (_, i) => rolls.slice(i * per, (i + 1) * per));
  return [rolls, ...Array.from({ length: count - 1 }, () => [])];
}

/* -------------------------------------------- */
/*  After the rolls                             */
/* -------------------------------------------- */

/**
 * dnd5e's AttackActivity#rollAttack (wrapped). Hands a Midi-QOL workflow of this module the attack roll already made
 * for it, and finishes a set of attacks once its rolls are made.
 */
export async function onRollAttack(wrapped, config={}, dialog={}, message={}) {
  const key = config?.workflow?.workflowOptions?.[MODULE_ID]?.roll;
  if ( key && prerolled.has(key) ) {
    const { roll, group, fold } = prerolled.get(key);
    prerolled.delete(key);
    if ( fold ) tagWorkflow(config.workflow, group);
    return [roll];
  }

  const rolls = await wrapped(config, dialog, message);
  const id = rolls?.[0]?.options?.[MODULE_ID]?.group;
  const group = id ? pending.get(id) : null;
  if ( !group ) return rolls;
  pending.delete(id);
  if ( !(rolls.length > 1) ) return rolls;

  try {
    group.mode = messageModeOf(message);
    // A new set of attacks for the creature ends any set still waiting.
    const previous = live.get(group.actor.uuid);
    if ( previous && (previous !== group) ) {
      previous.stopped = true;
      previous.cancel?.();
    }
    live.set(group.actor.uuid, group);
    if ( group.workflow ) {
      // The first attack's card was posted before the number of attacks was known.
      if ( group.fold ) markCard(group.workflow.chatCard, group.id);
      // No attack card is posted with Midi-QOL's merged card, so the dice are thrown here, all together. They're
      // thrown from copies, and the rolls marked as shown so Dice So Nice doesn't throw them again from Midi-QOL's
      // cards. Midi-QOL carries on while they roll; the damage dice wait for them to land.
      if ( message?.create === false ) {
        const copies = rolls.map(snapshot);
        if ( copies.every(Boolean) ) {
          markShown(rolls);
          group.attackDice = showTogether(copies, group.mode);
        } else {
          await showTogether(rolls, group.mode);
          markShown(rolls);
        }
      }
      finishMidi(group, rolls).catch(err => console.error(`${MODULE_ID} | Rolling the other attacks failed`, err));
      return rolls.slice(0, 1);
    }
    await spendAmmunition(group.actor, rolls[0], rolls.length - 1);
    finishPlain(group, rolls).catch(err => console.error(`${MODULE_ID} | Rolling the damage failed`, err));
  } catch (err) {
    console.error(`${MODULE_ID} | Could not finish the attacks`, err);
    done(group);
  }
  return rolls;
}

/** A set of attacks is finished. */
function done(group) {
  if ( live.get(group.actor.uuid) === group ) live.delete(group.actor.uuid);
  group.cancel = null;
}

/** Post the summary card, if the world wants one. */
async function summarize(group, results, midi) {
  if ( !setting(SETTINGS.summaryCard) || !results.some(r => r.outcome === "rolled") ) return;
  try {
    await postSummary(group.actor, results, { token: tokenFor(group.actor), midi, group: group.id, folded: !!group.fold });
  } catch (err) {
    console.error(`${MODULE_ID} | Could not post the summary`, err);
  }
}

/** The attack's name and picture, for the summary. */
function labelOf(activity) {
  return { label: activity?.item?.name ?? activity?.name ?? "", img: activity?.img || activity?.item?.img };
}

/* -------------------------------------------- */
/*  Without Midi-QOL                            */
/* -------------------------------------------- */

/** The attack card of a set of attacks. */
function groupMessage(id) {
  const messages = [...(game.messages ?? [])];
  for ( let i = messages.length - 1; i >= 0; i-- ) {
    const m = messages[i];
    if ( (m?.flags?.[MODULE_ID]?.[FLAGS.group] === id) || (m?.getFlag?.(MODULE_ID, FLAGS.group) === id) ) return m;
  }
  return null;
}

/** Wait for Dice So Nice to finish throwing a message's dice. */
async function waitForDice(message) {
  const dice3d = game.dice3d;
  if ( !message?.id || (typeof dice3d?.waitFor3DAnimationByMessageID !== "function") ) return;
  try {
    await Promise.race([dice3d.waitFor3DAnimationByMessageID(message.id), delay(20)]);
  } catch {
    // The dice have landed, or there are none.
  }
}

/** Roll one set of damage (all normal hits, or all critical hits) in one roll, one copy per hit. */
async function rollDamageSet(activity, group, first, entries, critical) {
  const config = { isCritical: critical, [MODULE_ID]: { copies: entries.length } };
  const options = first.options ?? {};
  if ( options.attackMode ) config.attackMode = options.attackMode;
  if ( options.ability ) config.ability = options.ability;
  const ammunition = options.ammunition ? group.actor.items?.get?.(options.ammunition) : null;
  if ( ammunition ) config.ammunition = ammunition;
  const dialog = { configure: false };
  if ( critical ) dialog.options = { defaultButton: "critical" };
  const message = group.origin ? { data: { system: { origin: group.origin } } } : {};
  const rolls = await activity.rollDamage(config, dialog, message);
  if ( !rolls?.length ) return;
  // One copy of the damage per hit, in order (one-time riders are on the first hit only).
  const byHit = splitByHit(rolls, entries.length);
  entries.forEach((entry, i) => entry.damage = damageOf(byHit[i]));
}

/** Once the attack dice have landed: roll the damage of the hits together, then sum up. */
async function finishPlain(group, rolls) {
  const results = [];
  try {
    await waitForDice(groupMessage(group.id));
    const tokens = group.targets.map(id => canvas.tokens?.get(id)).filter(Boolean);
    const single = tokens.length === 1 ? tokens[0] : null;
    const names = tokens.map(t => t.name).join(", ") || null;
    const { label, img } = labelOf(group.activity);
    for ( const roll of rolls ) {
      const ac = Number.isFinite(Number(roll.options?.target)) ? Number(roll.options.target) : targetAC(single);
      const hit = single ? evaluateHit(roll, ac) : (roll.isCritical ? true : (roll.isFumble ? false : null));
      results.push({
        label, img, kind: "attack", outcome: "rolled", attack: Number(roll.total), d20: d20Of(roll),
        attackDice: diceView(roll), crit: !!roll.isCritical, fumble: !!roll.isFumble, hit, ac: single ? ac : null,
        target: names, damage: null
      });
    }

    const policy = setting(SETTINGS.damagePolicy) ?? "hit";
    if ( policy !== "none" ) {
      const rolling = results.filter(r => (policy === "always") || (r.hit !== false));
      const normal = rolling.filter(r => !r.crit);
      const crits = rolling.filter(r => r.crit);
      const sets = [];
      if ( normal.length ) sets.push(rollDamageSet(group.activity, group, rolls[0], normal, false));
      if ( crits.length ) sets.push(rollDamageSet(group.activity, group, rolls[0], crits, true));
      await Promise.all(sets);
    }
  } finally {
    done(group);
  }
  await summarize(group, results, false);
}

/* -------------------------------------------- */
/*  With Midi-QOL                               */
/* -------------------------------------------- */

/** What a Midi-QOL workflow's attack did, for the summary. */
function midiResult(workflow, activity, roll) {
  const { label, img } = labelOf(activity);
  const attackRoll = workflow?.attackRoll ?? roll;
  const targets = [...(workflow?.targets ?? [])];
  let hit = null;
  if ( ((midiConfig().autoCheckHit ?? "none") !== "none") && targets.length ) {
    const hits = new Set([...(workflow.hitTargets ?? []), ...(workflow.hitTargetsEC ?? [])].map(tokenUuid));
    hit = targets.some(t => hits.has(tokenUuid(t)));
  }
  const crit = !!(workflow?.isCritical ?? attackRoll?.isCritical);
  const fumble = !!(workflow?.isFumble ?? attackRoll?.isFumble);
  if ( crit ) hit = true;
  else if ( fumble ) hit = false;
  const damage = damageRollsOf(workflow);
  return {
    label, img, kind: "attack", outcome: attackRoll ? "rolled" : "cancelled",
    attack: Number(workflow?.attackTotal ?? attackRoll?.total), d20: d20Of(attackRoll),
    attackDice: attackRoll ? diceView(attackRoll) : null, crit, fumble, hit,
    ac: targets.length === 1 ? targetAC(targets[0]) : null,
    target: targets.map(t => t.name).filter(Boolean).join(", ") || null,
    damage: damage.length ? damageOf(damage) : null
  };
}

/** Wait for a promise, but not longer than some seconds. */
async function waitFor(promise, seconds) {
  if ( !promise ) return;
  try {
    await Promise.race([promise, delay(seconds)]);
  } catch {
    // The dice have landed, or there are none.
  }
}

/** How long a set of attacks took, in the console, to see where the time goes. */
function logTiming(group, resolvedAt) {
  const t = group.timing;
  if ( !t ) return;
  const sec = ms => `${(ms / 1000).toFixed(1)}s`;
  const each = t.others.length ? sec(t.others.reduce((a, b) => a + b, 0) / t.others.length) : "-";
  const made = 1 + t.others.length;
  console.log(`${MODULE_ID} | ${made} attack${made === 1 ? "" : "s"} in ${sec(Date.now() - group.createdAt)}: `
    + `first attack ${sec(t.first)}, each other attack ${each} (Midi-QOL's workflow), `
    + `damage dice and summary ${sec(Date.now() - resolvedAt)}`);
}

/** A workflow's damage rolls (its own, and any bonus damage). */
function damageRollsOf(workflow) {
  return [...(workflow?.damageRolls ?? []), ...(workflow?.otherDamageRolls ?? []), ...(workflow?.bonusDamageRolls ?? [])]
    .filter(Boolean);
}

/** The targets for the next attack: the same as the first, less any that have gone down (as the setting says). */
function aimFor(group) {
  const ids = group.targets.filter(id => canvas.tokens?.get(id));
  if ( !ids.length || (setting(SETTINGS.defeatedTarget) === "keep") ) return { ids };
  const standing = ids.filter(id => !isDefeated(canvas.tokens.get(id)));
  return standing.length ? { ids: standing } : { ids, skip: true };
}

/**
 * The activity on the creature's own item. dnd5e makes a copy of a spell for the level it's cast at, and Midi-QOL
 * rolls the attack on that copy; the other attacks are made from the item itself, at the same level.
 */
function itemActivity(activity) {
  const item = activity?.item;
  const own = item?.id ? activity.actor?.items?.get?.(item.id) : null;
  return own?.system?.activities?.get?.(activity.id) ?? activity;
}

/** The level a spell was cast at (from Midi-QOL's workflow, or the copy dnd5e made for it), or null. */
function castLevelOf(workflow, activity) {
  const item = activity?.item;
  if ( (item?.type !== "spell") && !item?.flags?.dnd5e?.spellLevel ) return null;
  const level = Number(workflow?.castData?.castLevel);
  if ( Number.isFinite(level) ) return level;
  const base = Number(item?.system?.level);
  if ( !Number.isFinite(base) ) return null;
  return base + (Number(item.flags?.dnd5e?.scaling) || 0);
}

/**
 * How each of the other attacks is used: no window, nothing spent (no uses, slots or ammunition beyond the
 * ammunition each attack takes), no concentration started again, and a spell at the level it was cast at.
 */
function usageFor(roll, key, sequenceId, castLevel) {
  const usage = {
    sequenceId,
    consume: false,
    concentration: { begin: false },
    [MODULE_ID]: { skip: true },
    midiOptions: {
      proceedChecks: { checkReaction: false, checkBonusAction: false, checkAoO: false },
      workflowOptions: {
        autoRollAttack: true, autoFastAttack: true, fastForwardDamage: true, autoRollDamage: midiDamageMode(),
        attackRollDSN: false, damageRollDSN: false, targetConfirmation: "none", forceCompletion: true,
        attackMode: roll.options?.attackMode, [MODULE_ID]: { roll: key }
      }
    }
  };
  if ( Number.isFinite(castLevel) && (castLevel > 0) ) usage.spell = { slot: `spell${castLevel}` };
  return usage;
}

/** After the first attack's workflow: a workflow for each other attack, with its roll already made. */
async function finishMidi(group, rolls) {
  const { activity, workflow: first } = group;
  const firstDone = waitForWorkflow(w => (w === first) || (!!first?.id && (w.id === first.id)));
  group.cancel = firstDone.cancel;
  const results = [];
  const workflows = [];
  const saved = targetIds();
  try {
    const { workflow, aborted } = await firstDone;
    group.timing = { first: Date.now() - group.createdAt, others: [] };
    workflows.push(workflow ?? first);
    results.push(midiResult(workflow ?? first, activity, rolls[0]));
    // The first attack was cancelled, or never finished: the others aren't rolled.
    if ( aborted || !workflow ) group.stopped = group.abandoned = true;
    const source = itemActivity(activity);
    const castLevel = castLevelOf(workflow ?? first, activity);

    for ( const roll of rolls.slice(1) ) {
      const { label, img } = labelOf(activity);
      if ( group.stopped ) break;
      const aim = aimFor(group);
      if ( aim.skip ) {
        results.push({ label, img, kind: "attack", outcome: "skipped", reason: "defeated" });
        continue;
      }
      setTargets(aim.ids);
      const key = foundry.utils.randomID();
      prerolled.set(key, { roll, group: group.id, fold: group.fold });
      const sequenceId = foundry.utils.randomID();
      const wait = waitForWorkflow(w => w.sequenceId === sequenceId);
      group.cancel = wait.cancel;
      const usage = usageFor(roll, key, sequenceId, castLevel);
      let used;
      try {
        const message = group.fold ? { data: { flags: { [MODULE_ID]: { [FLAGS.member]: group.id } } } } : {};
        used = await source.use(usage, { configure: false }, message);
      } catch (err) {
        console.error(`${MODULE_ID} | An attack failed`, err);
        used = null;
      }
      if ( !used ) {
        wait.cancel();
        prerolled.delete(key);
        results.push({ label, img, kind: "attack", outcome: "cancelled" });
        continue;
      }
      const startedAt = Date.now();
      const { workflow: next, aborted } = await wait;
      group.timing.others.push(Date.now() - startedAt);
      prerolled.delete(key);
      if ( next ) workflows.push(next);
      // Midi-QOL checks the ammunition before each attack, so each arrow is spent once its attack is made.
      if ( next && !aborted ) await spendAmmunition(group.actor, roll, 1);
      results.push(midiResult(next, activity, roll));
    }
  } finally {
    setTargets(saved);
    done(group);
  }
  if ( group.abandoned ) {
    // No summary for this set: its first card stays in the chat log.
    if ( group.fold ) await markCard(first?.chatCard, null);
    return;
  }
  // Every damage roll, together (after the attack dice have landed): the ones kept as dnd5e rolled them, and any
  // rolled another way (bonus damage).
  const resolvedAt = Date.now();
  await waitFor(group.attackDice, 30);
  const others = workflows.flatMap(damageRollsOf).filter(r => !captured.has(r) && hasDiceToShow(r));
  await showTogether([...group.damageThrow, ...others], group.mode);
  await summarize(group, results, true);
  logTiming(group, resolvedAt);
}

/** Damage rolls already copied for a set of attacks' throw. */
const captured = new WeakSet();

/**
 * dnd5e has rolled damage. With Midi-QOL, the damage of a set of attacks (its own, its "other" damage, anything rolled
 * through dnd5e) is kept to be thrown together at the end, and marked as shown so Dice So Nice doesn't throw it on its
 * own when Midi-QOL adds it to the card.
 */
export function onDamageRolled(rolls, data) {
  try {
    const actor = data?.subject?.actor ?? data?.subject?.item?.actor;
    const group = actor?.uuid ? live.get(actor.uuid) : null;
    if ( !group?.workflow || !Array.isArray(rolls) ) return;
    for ( const roll of rolls ) {
      if ( !roll || captured.has(roll) || !hasDiceToShow(roll) ) continue;
      const copy = snapshot(roll);
      if ( !copy ) continue;
      captured.add(roll);
      group.damageThrow.push(copy);
      markShown([roll]);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not keep the damage dice for later`, err);
  }
}

/** Called during init. */
export function registerEngineHooks() {
  Hooks.on("dnd5e.postRollConfiguration", onPostRollConfiguration);
  Hooks.on("dnd5e.rollDamage", onDamageRolled);
  Hooks.on("dnd5e.rollDamageV2", onDamageRolled);
}
