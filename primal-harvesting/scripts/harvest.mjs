/**
 * Making a harvest: the assessment and carving checks (dnd5e's own skill checks, so every bonus the characters have
 * counts), the helpers, the harvest list against the total, the GM's part (the corpse marked harvested, the
 * components in an inventory), and one chat card with both rolls, so Dice So Nice throws them together.
 *
 * Also the "ready to harvest" cards, posted when a combat ends or a monster dies.
 */
import { FLAGS, MODULE_ID, SETTINGS, dnd5eLabel, loc, newId, setting } from "./constants.mjs";
import { helperBonus, priceOf, resolveHarvest, splitMinutes } from "./rules.mjs";
import { fromTypes, randomDie, randomRowDC, randomRowFor } from "./tables.mjs";
import { crLabel, harvestedRecord, isDefeated, isMonster, isProficient, profOf } from "./creature.mjs";
import { componentItemSpec, runAsGM } from "./gm.mjs";
import { renderRandomCard, renderReadyCard, renderResultCard } from "./card.mjs";
import { d20Of } from "./splash.mjs";

/** "15 minutes", "2 hours", "1 hour 30 minutes". */
export function timeLabel(minutes) {
  const { hours, minutes: m } = splitMinutes(minutes);
  const parts = [];
  if ( hours ) parts.push(loc(hours === 1 ? "Time.Hour" : "Time.Hours", { n: hours }));
  if ( m || !hours ) parts.push(loc(m === 1 ? "Time.Minute" : "Time.Minutes", { n: m }));
  return parts.join(" ");
}

/** The localized meaning of one of the book's marks ("E+" is "Edible, and used in crafting"). */
export function tagLabel(code) {
  const known = { "E": "Edible", "E+": "EdibleCrafting", "V": "Volatile", "*": "Note", "**": "MonsterForged" }[code];
  return known ? loc(`Tags.${known}`) : code;
}

/** Marks as { code, label } for the cards and the window. */
export function tagsFor(tags) {
  return (tags ?? []).map(code => ({ code, label: tagLabel(code) }));
}

/** "45 gp", "1,000 gp". */
export function gpLabel(value) {
  const n = Number(value) || 0;
  let text = String(Math.round(n * 100) / 100);
  try {
    text = n.toLocaleString(globalThis.game?.i18n?.lang || undefined, { maximumFractionDigits: 2 });
  } catch {
    // Keep the plain number.
  }
  return loc("Window.Gp", { value: text });
}

/** A message mode to post in (Foundry 14's message modes, or the older roll modes). */
function applyMode(chatData) {
  const cls = CONFIG.ChatMessage?.documentClass ?? globalThis.ChatMessage;
  let mode;
  try {
    mode = CONFIG.Dice?.BasicRoll?.getMessageMode?.() ?? game.settings.get("core", "messageMode");
  } catch {
    try {
      mode = game.settings.get("core", "rollMode");
    } catch {
      mode = null;
    }
  }
  if ( !mode ) return chatData;
  if ( typeof cls.applyMode === "function" ) cls.applyMode(chatData, mode);
  else if ( typeof cls.applyRollMode === "function" ) cls.applyRollMode(chatData, mode);
  return chatData;
}

/** Roll one check with dnd5e, without a message of its own. Null if the roll window was closed. */
async function rollCheck(actor, { skill, ability, disadvantage }) {
  const config = { skill, ability };
  if ( disadvantage ) config.disadvantage = true;
  const configure = !!setting(SETTINGS.showRollDialogs);
  const rolls = await actor.rollSkill(config, { configure }, { create: false });
  return rolls?.[0] ?? null;
}

/**
 * Harvest a corpse.
 * @param {object} plan
 * @param {object} plan.info         From creatureInfo.
 * @param {object} plan.rules        The harvest rules.
 * @param {string} plan.type         The creature type harvested as.
 * @param {string} plan.skill        The skill both checks use.
 * @param {number} plan.minutes      How long it takes.
 * @param {object[]} plan.list       The harvest list, in order.
 * @param {Actor} plan.assessor
 * @param {Actor} plan.carver
 * @param {boolean} plan.ritual      Carve with the spellcasting ability.
 * @param {Actor[]} plan.helpers
 * @param {Actor|null} plan.recipient
 * @param {boolean} [plan.again]     The GM harvests a corpse that's already been harvested.
 * @returns {Promise<object|null>}   The result, or null if a roll window was closed or the harvest was refused.
 */
export async function performHarvest(plan) {
  const { info, rules, skill } = plan;
  const both = plan.assessor === plan.carver;
  const disadvantage = both && (rules.bothDisadvantage !== false);
  const carveAbility = plan.ritual ? "spellcasting" : "dex";

  const assess = await rollCheck(plan.assessor, { skill, ability: "int", disadvantage });
  if ( !assess ) return null;
  const carve = await rollCheck(plan.carver, { skill, ability: carveAbility, disadvantage });
  if ( !carve ) return null;

  const helpers = plan.helpers.filter(h => h && (h !== plan.assessor) && (h !== plan.carver)).map(h => {
    const proficient = isProficient(h, skill);
    return { name: h.name, uuid: h.uuid, proficient, bonus: helperBonus({ prof: profOf(h), proficient }) };
  });
  const helperTotal = helpers.reduce((sum, h) => sum + h.bonus, 0);
  const total = Number(assess.total) + Number(carve.total) + helperTotal;
  const results = resolveHarvest(plan.list, total);
  const harvested = results.filter(r => r.harvested);
  const lost = results.filter(r => !r.harvested);

  const typeLabel = dnd5eLabel("creatureTypes", plan.type);
  const creature = {
    name: info.name, img: info.img, type: plan.type, typeLabel, cr: info.cr, crLabel: crLabel(info.cr)
  };
  const priced = harvested.map(r => ({ ...r, price: priceOf(r, rules) }));
  const worth = priced.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
  const specs = priced.map(r => componentItemSpec(r, creature, {
    from: loc("Item.From", { creature: info.name, type: typeLabel, cr: crLabel(info.cr) }),
    found: (r.source === "random") ? loc("Item.Found", { creature: info.name, from: r.fromLabel || r.from || "" }) : "",
    tags: tagsFor(r.tags).map(t => t.label).join(", ")
  }));

  let finished = { recipient: null, added: [] };
  let problem = null;
  try {
    finished = await runAsGM("finish", {
      tokenUuid: info.uuid,
      recipientUuid: plan.recipient?.uuid ?? null,
      items: specs,
      minutes: plan.minutes,
      again: !!plan.again,
      record: {
        total,
        harvested: harvested.map(r => r.name),
        lost: lost.map(r => r.name),
        assessor: plan.assessor.name,
        carver: plan.carver.name
      }
    });
  } catch (err) {
    if ( err.message === loc("Errors.NotApproved") ) {
      ui.notifications.warn(err.message);
      return null;
    }
    if ( harvestedRecord(await fromUuid(info.uuid)) && !plan.again ) {
      ui.notifications.warn(err.message);
      return null;
    }
    problem = err.message;
    console.error(`${MODULE_ID} | Harvest of ${info.name} not recorded`, err);
  }

  const skillLabel = dnd5eLabel("skills", skill);
  const abilityName = id => dnd5eLabel("abilities", id);
  const carveAbilityId = plan.ritual ? (plan.carver.spellcastingAbility ?? "int") : "dex";
  const notes = [];
  if ( worth > 0 ) notes.push(loc("Card.Worth", { value: gpLabel(worth) }));
  if ( finished.recipient && finished.added.length ) notes.push(loc("Card.AddedTo", { name: finished.recipient }));
  if ( both && disadvantage ) notes.push(loc("Card.BothDisadvantage", { name: plan.assessor.name }));
  if ( problem ) notes.push(loc("Card.NotRecorded", { error: problem }));

  const card = {
    creature,
    title: loc("Card.Title", { name: info.name }),
    subtitle: [typeLabel, skillLabel, timeLabel(plan.minutes)].filter(Boolean).join(" · "),
    checks: [
      {
        label: loc("Card.Assessment", { ability: abilityName("int"), skill: skillLabel }),
        who: plan.assessor.name,
        total: assess.total,
        rollHTML: await safeRender(assess)
      },
      {
        label: loc(plan.ritual ? "Card.RitualCarving" : "Card.Carving", { ability: abilityName(carveAbilityId), skill: skillLabel }),
        who: plan.carver.name,
        total: carve.total,
        rollHTML: await safeRender(carve)
      }
    ],
    helpers: helpers.length ? {
      label: loc("Card.Helpers"),
      text: helpers.map(h => `${h.name} +${h.bonus}`).join(", ")
    } : null,
    total: { label: loc("Card.Total"), value: total },
    results: results.map(r => ({
      name: r.name,
      harvested: r.harvested,
      tags: tagsFor(r.tags),
      text: r.harvested ? loc("Card.DC", { dc: r.harvestDC }) : loc("Card.Needed", { dc: r.harvestDC }),
      volatileLost: (!r.harvested && r.tags?.includes("V")) ? loc("Card.VolatileLost") : ""
    })),
    emptyText: loc("Card.NothingListed"),
    notes
  };

  // The splash everyone sees once the dice land: the checks, the total and what was harvested.
  const splash = {
    title: card.title,
    img: info.img,
    subtitle: card.subtitle,
    checks: [
      { label: card.checks[0].label, who: plan.assessor.name, total: assess.total, ...d20Of(assess) },
      { label: card.checks[1].label, who: plan.carver.name, total: carve.total, ...d20Of(carve) }
    ],
    helpers: helpers.map(h => ({ name: h.name, bonus: h.bonus })),
    total,
    harvested: harvested.map(r => ({ name: r.name, harvestDC: r.harvestDC, tags: tagsFor(r.tags) }))
  };

  const cls = CONFIG.ChatMessage?.documentClass ?? globalThis.ChatMessage;
  const speaker = cls.getSpeaker({ actor: plan.carver });
  const chatData = applyMode({
    speaker,
    content: renderResultCard(card),
    rolls: [assess, carve],
    flags: { [MODULE_ID]: { [FLAGS.card]: { tokenUuid: info.uuid, total, harvested: card.results.filter(r => r.harvested).map(r => r.name), splash } } }
  });
  await cls.create(chatData);
  return { total, results, assess, carve, helpers, finished };
}

async function safeRender(roll) {
  try {
    return await roll.render();
  } catch {
    return "";
  }
}

/* -------------------------------------------- */
/*  Random components                           */
/* -------------------------------------------- */

/** The most rolls one random components roll makes ("roll twice more" can chain). */
const MAX_RANDOM_ROLLS = 12;

/**
 * Roll a corpse's random components (the book's d100 table of what an ooze has inside it): once, and again for each
 * "roll twice more". What it gives is kept on the token (by the GM's client), so it's rolled once per corpse and
 * every harvest window shows it, and the rolls are posted on a card.
 * @param {object} p
 * @param {object} p.info        From creatureInfo.
 * @param {object} p.table       The random table ({ name, rows }).
 * @param {object} p.tables      The harvest tables (for the DCs of other types' components).
 * @param {string} p.typeLabel   The creature type it's harvested as, in words.
 * @param {boolean} [p.again]    Roll again (GM).
 * @returns {Promise<object|null>}  The record kept, or null if it couldn't be kept.
 */
export async function rollRandomComponents({ info, table, tables, typeLabel, again=false }) {
  const RollClass = globalThis.foundry?.dice?.Roll ?? globalThis.Roll;
  const die = randomDie(table);
  const rolls = [];
  const lines = [];
  const components = [];
  let pending = 1;
  while ( (pending > 0) && (rolls.length < MAX_RANDOM_ROLLS) ) {
    pending--;
    const roll = await new RollClass(`1d${die}`).evaluate();
    rolls.push(roll);
    const total = Number(roll.total);
    const row = randomRowFor(table, total);
    if ( !row ) {
      lines.push({ total, text: loc("Random.NoRow") });
      continue;
    }
    if ( row.rolls ) {
      pending += row.rolls;
      lines.push({ total, text: loc("Random.Again", { n: row.rolls }) });
    }
    if ( !row.name ) {
      if ( !row.rolls ) lines.push({ total, text: loc("Random.Nothing"), nothing: true });
      continue;
    }
    const dc = randomRowDC(row, tables);
    const fromLabel = fromTypes(row.from).map(t => dnd5eLabel("creatureTypes", t)).join("/");
    const id = newId();
    components.push({
      id, key: `random:${id}`, source: "random", name: row.name, dc: dc ?? 0, dcUnknown: dc === null,
      tags: [...(row.tags ?? [])], max: 1, note: "", uuid: "", from: row.from, fromLabel, roll: total
    });
    const name = fromLabel ? `${row.name} (${fromLabel})` : row.name;
    lines.push({ total, text: (dc === null) ? loc("Random.FoundNoDC", { name }) : loc("Random.Found", { name, dc }), found: true });
  }
  const record = { name: table.name ?? "", die, lines, components };
  try {
    await runAsGM("random", { tokenUuid: info.uuid, record, again });
  } catch (err) {
    ui.notifications.warn(err.message);
    return null;
  }
  const title = table.name || loc("Random.Title");
  const cls = CONFIG.ChatMessage?.documentClass ?? globalThis.ChatMessage;
  const content = renderRandomCard({
    creature: { name: info.name, img: info.img },
    title: loc("Random.CardTitle", { table: title, name: info.name }),
    subtitle: [typeLabel, loc("Random.Die", { die })].filter(Boolean).join(" · "),
    lines,
    note: components.length ? loc("Random.CardNote") : loc("Random.CardNothing")
  });
  await cls.create(applyMode({
    speaker: { alias: info.name },
    content,
    rolls,
    flags: { [MODULE_ID]: { [FLAGS.randomCard]: { tokenUuid: info.uuid } } }
  }));
  return record;
}

/* -------------------------------------------- */
/*  Ready to harvest                            */
/* -------------------------------------------- */

/** Does this token hold a corpse that hasn't been harvested? */
export function isReadyCorpse(tokenDoc) {
  const actor = tokenDoc?.actor;
  if ( !actor || !isMonster(actor) || actor.hasPlayerOwner ) return false;
  if ( harvestedRecord(tokenDoc) ) return false;
  return isDefeated(actor, tokenDoc);
}

/**
 * Post a card listing corpses that can be harvested, each with a Harvest button.
 * @param {TokenDocument[]} tokens
 * @param {"combat"|"death"} why
 */
export async function postReadyCard(tokens, why="combat") {
  const corpses = tokens.filter(Boolean);
  if ( !corpses.length ) return null;
  const creatures = corpses.map(t => ({
    uuid: t.uuid,
    name: t.name || t.actor?.name,
    img: t.actor?.img || t.texture?.src || "icons/svg/mystery-man.svg",
    detail: [dnd5eLabel("creatureTypes", t.actor?.system?.details?.type?.value), dnd5eLabel("actorSizes", t.actor?.system?.traits?.size)]
      .filter(Boolean).join(" · ")
  }));
  const content = renderReadyCard({
    title: loc(why === "combat" ? "Ready.TitleCombat" : "Ready.TitleDeath", { name: creatures[0].name, count: creatures.length }),
    hint: loc("Ready.Hint"),
    creatures,
    button: loc("Ready.Button")
  });
  const cls = CONFIG.ChatMessage?.documentClass ?? globalThis.ChatMessage;
  return cls.create({
    content,
    speaker: { alias: loc("Ready.Speaker") },
    flags: { [MODULE_ID]: { [FLAGS.ready]: { tokens: creatures.map(c => c.uuid), why } } }
  });
}

/** Is this client the one GM who posts the ready cards? */
function isPostingGM() {
  if ( !game.user.isGM ) return false;
  const active = game.users.activeGM;
  return active ? active.isSelf : true;
}

/** When a combat ends, list its beaten monsters that can be harvested. */
export async function onCombatEnded(combat) {
  if ( !isPostingGM() || (setting(SETTINGS.offerInChat) !== "combat") ) return;
  if ( !combat?.started && !(Number(combat?.round) > 0) ) return;
  const tokens = [];
  const seen = new Set();
  for ( const combatant of combat.combatants ?? [] ) {
    const token = combatant.token;
    if ( !token || seen.has(token.uuid) ) continue;
    seen.add(token.uuid);
    if ( isReadyCorpse(token) || (combatant.isDefeated && token.actor && isMonster(token.actor)
      && !token.actor.hasPlayerOwner && !harvestedRecord(token)) ) tokens.push(token);
  }
  await postReadyCard(tokens, "combat");
}

/** When a monster drops to 0 hit points, offer it for harvesting (if the GM chose "when each monster dies"). */
export async function onActorUpdated(actor, changes) {
  if ( !isPostingGM() || (setting(SETTINGS.offerInChat) !== "death") ) return;
  const hp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if ( (hp === undefined) || (Number(hp) > 0) ) return;
  const tokens = actor.isToken ? [actor.token] : (actor.getActiveTokens?.(true, true) ?? []);
  const ready = tokens.filter(isReadyCorpse);
  if ( ready.length ) await postReadyCard(ready, "death");
}
