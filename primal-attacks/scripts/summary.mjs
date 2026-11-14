/**
 * The summary card posted after a set of attacks: each attack, its target, its roll, hit or miss, and its damage.
 *
 * The card is drawn again for each person who sees it, so it shows them what dnd5e (or Midi-QOL) would: the GM sees
 * everything, and players see hits and misses and the target's AC only as the world's settings allow.
 */
import { FLAGS, MODULE_ID, escapeHTML, loc } from "./constants.mjs";
import { buttonLabel, toggleCards } from "./fold.mjs";

/** Midi-QOL's settings, if it's running. */
function midiConfig() {
  try {
    return globalThis.MidiQOL?.configSettings?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * What this user may see on a summary.
 * @param {object} data   The summary.
 * @param {object} [options]
 * @param {boolean} [options.asPublic]  For a player who doesn't own the attacker (the card's stored content).
 * @returns {{result: boolean, ac: boolean, numbers: boolean}}
 */
export function visibility(data, { asPublic=false }={}) {
  if ( !asPublic && game.user?.isGM ) return { result: true, ac: true, numbers: true };
  let owner = false;
  if ( !asPublic ) {
    try {
      const find = foundry.utils?.fromUuidSync ?? globalThis.fromUuidSync;
      owner = !!find?.(data.actorUuid, { strict: false })?.isOwner;
    } catch {
      owner = false;
    }
  }
  if ( data.midi ) {
    const config = midiConfig() ?? {};
    const hidden = !owner && config.hideRollDetails && (config.hideRollDetails !== "none");
    return { result: config.autoCheckHit === "all", ac: false, numbers: !hidden };
  }
  let setting = "none";
  try {
    setting = game.settings.get("dnd5e", "attackRollVisibility");
  } catch {
    setting = "none";
  }
  return { result: setting !== "none", ac: setting === "all", numbers: true };
}

/** A damage type's name. */
function damageTypeLabel(type) {
  const label = CONFIG.DND5E?.damageTypes?.[type]?.label ?? CONFIG.DND5E?.healingTypes?.[type]?.label ?? type;
  return game.i18n?.localize?.(label) ?? label;
}

/**
 * One roll drawn as its dice: "Attack  2d20 [17] [3] + 5 = 22". Dropped dice (advantage, rerolls) are faded, and the
 * highest and lowest faces are coloured, as on dnd5e's own cards.
 * @param {{total: number, parts: object[]}} view   From engine.mjs' diceView.
 * @param {object} [options]
 * @param {string} [options.label]  The row's name ("Attack", "Damage"), or "" to line up under the row above.
 * @param {string} [options.type]   A damage type.
 * @returns {string}  HTML, or "" if the roll has no dice.
 */
export function diceHTML(view, { label=null, type=null }={}) {
  const parts = view?.parts ?? [];
  if ( !parts.some(p => Array.isArray(p?.results)) ) return "";
  const bits = parts.map(p => {
    if ( !Array.isArray(p.results) ) return `<span class="op">${escapeHTML(p.text ?? "")}</span>`;
    const faces = Number(p.faces);
    const dice = p.results.map(r => {
      const css = ["die", `d${faces}`];
      if ( r.dropped ) css.push("dropped");
      else if ( (faces > 1) && (r.value >= faces) ) css.push("max");
      else if ( (faces > 1) && (r.value <= 1) ) css.push("min");
      return `<span class="${css.join(" ")}">${escapeHTML(r.value)}</span>`;
    }).join("");
    return `<span class="term"><span class="formula">${escapeHTML(p.label ?? "")}</span>${dice}</span>`;
  });
  const name = label === null ? "" : `<span class="label">${escapeHTML(label)}</span>`;
  const kind = type ? `<span class="type">${escapeHTML(damageTypeLabel(type))}</span>` : "";
  return `<div class="primal-attacks-roll">${name}<span class="expr">${bits.join("")}<span class="op">=</span>`
    + `<span class="sum">${escapeHTML(view.total)}</span>${kind}</span></div>`;
}

/** An entry's dice: its attack roll, then each of its damage rolls. */
function rollsHTML(entry) {
  const rows = [];
  if ( entry.kind === "attack" ) rows.push(diceHTML(entry.attackDice, { label: loc("Summary.AttackDice") }));
  let first = true;
  for ( const part of entry.damage?.parts ?? [] ) {
    const row = diceHTML(part?.dice, { label: first ? loc("Summary.DamageDice") : "", type: part.type });
    if ( row ) first = false;
    rows.push(row);
  }
  return rows.filter(Boolean).join("");
}

/** What happened to one step, in words, and the class for its colour. */
function outcomeOf(entry, show) {
  if ( entry.outcome === "skipped" ) {
    const why = { defeated: "Defeated", noUses: "NoUses", missing: "Missing" }[entry.reason] ?? "Other";
    return { css: "skipped", text: loc(`Summary.Skipped.${why}`) };
  }
  if ( entry.outcome === "cancelled" ) return { css: "skipped", text: loc("Summary.Cancelled") };
  if ( entry.outcome === "error" ) return { css: "skipped", text: loc("Summary.Error") };
  if ( entry.kind !== "attack" ) return { css: "used", text: loc("Summary.Used") };
  if ( !show.result || (entry.hit === null) || (entry.hit === undefined) ) {
    if ( entry.crit && show.numbers ) return { css: "crit", text: loc("Summary.Critical") };
    return { css: "unknown", text: "" };
  }
  if ( entry.hit ) return { css: entry.crit ? "hit crit" : "hit", text: loc(entry.crit ? "Summary.CriticalHit" : "Summary.Hit") };
  return { css: entry.fumble ? "miss fumble" : "miss", text: loc(entry.fumble ? "Summary.Fumble" : "Summary.Miss") };
}

/**
 * Draw a summary for this user.
 * @param {object} data
 * @param {object} [options]
 * @param {boolean} [options.asPublic]
 * @returns {string}  HTML.
 */
export function renderSummary(data, { asPublic=false, controls=false }={}) {
  const show = visibility(data, { asPublic });
  const entries = (data.entries ?? []).filter(e => e.kind !== "consume" || e.outcome !== "used");
  const items = entries.map(entry => {
    const outcome = outcomeOf(entry, show);
    const target = entry.target ? `<span class="target"><i class="fa-solid fa-crosshairs" inert></i> ${escapeHTML(entry.target)}`
      + `${(show.ac && Number.isFinite(entry.ac)) ? ` <span class="ac">${loc("Summary.AC", { ac: entry.ac })}</span>` : ""}</span>` : "";
    const roll = (entry.kind === "attack") && Number.isFinite(entry.attack) && show.numbers
      ? `<span class="roll${entry.crit ? " crit" : ""}${entry.fumble ? " fumble" : ""}">${entry.attack}</span>` : "";
    const damage = entry.damage && show.numbers
      ? `<span class="damage">${entry.damage.total}${entry.damage.types?.length
        ? ` <span class="types">${escapeHTML(entry.damage.types.map(damageTypeLabel).join(", "))}</span>` : ""}</span>` : "";
    // The dice of the attack and of its damage. (A summary from before the dice were kept has the damage in words.)
    const dice = show.numbers ? rollsHTML(entry) : "";
    const parts = (entry.damage?.parts ?? []).filter(p => p?.text && !p.dice);
    const breakdown = parts.length && show.numbers
      ? `<span class="breakdown">${parts.map(p => escapeHTML(`${p.text} = ${p.total}${p.type ? ` ${damageTypeLabel(p.type)}` : ""}`))
        .join("<br>")}</span>` : "";
    return `<li class="primal-attacks-entry ${outcome.css}"><div class="line">`
      + `<img src="${escapeHTML(entry.img || "icons/svg/sword.svg")}" alt="">`
      + `<div class="what"><span class="name">${escapeHTML(entry.label)}</span>${target}${breakdown}</div>`
      + `${roll}<span class="outcome">${escapeHTML(outcome.text)}</span>${damage}</div>`
      + `${dice ? `<div class="rolls">${dice}</div>` : ""}</li>`;
  }).join("");

  const attacks = entries.filter(e => (e.kind === "attack") && (e.outcome === "rolled"));
  const hits = attacks.filter(e => e.hit === true).length;
  const total = attacks.reduce((n, e) => n + (Number(e.damage?.total) || 0), 0);
  const parts = [];
  const known = attacks.every(e => (e.hit === true) || (e.hit === false));
  if ( show.result && known && attacks.length ) parts.push(loc("Summary.Hits", { hits, count: attacks.length }));
  else parts.push(loc("Summary.Attacks", { count: attacks.length }));
  if ( show.numbers && attacks.some(e => e.damage) ) parts.push(loc("Summary.Damage", { total }));

  // With the attacks' own cards folded into this one, a button to see them.
  const cards = controls && data.group && data.folded
    ? `<button type="button" class="primal-attacks-cards" data-group="${escapeHTML(data.group)}">${buttonLabel(data.group)}</button>`
    : "";
  return `<div class="primal-attacks-summary">`
    + `<header><i class="fa-solid fa-swords" inert></i> ${loc("Summary.Title", { name: escapeHTML(data.actorName) })}</header>`
    + `<ol>${items}</ol><footer>${parts.map(p => escapeHTML(p)).join(" · ")}</footer>${cards}</div>`;
}

/**
 * Post a summary of a set of attacks.
 * @param {Actor} actor
 * @param {object[]} results   One entry per attack (engine.mjs).
 * @param {object} [options]
 * @param {Token} [options.token]
 * @param {boolean} [options.midi]   The attacks were rolled with Midi-QOL.
 * @param {string} [options.group]   The set of attacks.
 * @param {boolean} [options.folded] The set's own cards are folded into this summary.
 */
export async function postSummary(actor, results, { token=null, midi=false, group=null, folded=false }={}) {
  const data = {
    actorName: token?.name ?? actor.name,
    actorUuid: actor.uuid,
    midi,
    group,
    folded: !!(group && folded),
    entries: results.map(r => ({
      label: r.label, img: r.img, kind: r.kind, target: r.target ?? null, outcome: r.outcome,
      reason: r.reason ?? null, attack: Number.isFinite(r.attack) ? r.attack : null, attackDice: r.attackDice ?? null,
      crit: !!r.crit,
      fumble: !!r.fumble, hit: (r.hit === true) || (r.hit === false) ? r.hit : null,
      ac: Number.isFinite(r.ac) ? r.ac : null, damage: r.damage ?? null
    }))
  };
  const cls = CONFIG.ChatMessage?.documentClass ?? globalThis.ChatMessage;
  const chatData = {
    speaker: cls.getSpeaker({ actor, token: token?.document ?? undefined }),
    content: renderSummary(data, { asPublic: true }),
    flags: { [MODULE_ID]: { [FLAGS.summary]: data } }
  };
  const mode = CONFIG.Dice?.BasicRoll?.getMessageMode?.() ?? game.settings.get("core", "messageMode");
  if ( typeof cls.applyMode === "function" ) cls.applyMode(chatData, mode);
  else if ( typeof cls.applyRollMode === "function" ) cls.applyRollMode(chatData, mode);
  return cls.create(chatData);
}

/** Draw summaries for whoever is looking at them. */
export function registerSummaryHooks() {
  const draw = (message, html) => {
    try {
      const data = message?.getFlag?.(MODULE_ID, FLAGS.summary);
      if ( !data ) return;
      const element = html instanceof HTMLElement ? html : html?.[0];
      const content = element?.querySelector?.(".message-content");
      if ( !content || (message.isContentVisible === false) ) return;
      content.innerHTML = renderSummary(data, { controls: true });
      const button = content.querySelector(".primal-attacks-cards");
      button?.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        toggleCards(button.dataset.group);
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not draw an attack summary`, err);
    }
  };
  Hooks.on("renderChatMessageHTML", draw);
  Hooks.on("dnd5e.renderChatMessage", draw);
}
