/**
 * Spell points on actor sheets (dnd5e's own sheets and Tidy 5e's sheets):
 * - a Spell Points box at the top of the spells tab, with the pool, a bar, and which 6th+ levels are used;
 * - each spell level heading shows its cost instead of slot pips;
 * - GMs can type a new value (or +5 / -5) into the box, toggle high-level uses, and open the per-actor settings.
 *   Players see the same box without the controls.
 * - Spell points are chosen one actor at a time. On a spellcaster that doesn't use them, the GM (only) sees a small
 *   "Spell points: off" strip with a button to turn them on.
 */
import { FLAGS, HIGH_LEVEL, MODULE_ID, levelLabel, loc } from "./constants.mjs";
import { computeState, getState, getTables, isHighLevelUsed, unaffordableLevels } from "./spell-points.mjs";
import { ActorSpellPointsConfig } from "./apps/actor-config.mjs";

/** Where the box goes: dnd5e's spellcasting card row, or the top of Tidy 5e's spellbook tab. */
const TARGETS = {
  dnd5e: '[data-application-part="spells"] section.top',
  tidy: '[data-tab-contents-for="spellbook"] > .tab-content'
};

/* -------------------------------------------- */
/*  GM actions                                  */
/* -------------------------------------------- */

/**
 * Set an actor's current spell points (GM only).
 * @param {Actor} actor
 * @param {number} value
 * @returns {Promise<Actor|void>}
 */
export async function setSpellPoints(actor, value) {
  if ( !game.user.isGM ) return ui.notifications.warn(loc("Warning.GMOnly"));
  const state = getState(actor) ?? computeState(actor);
  if ( !state ) return;
  const target = Math.clamp(Math.round(Number(value) || 0), 0, state.max);
  return actor.update({ [`flags.${MODULE_ID}.${FLAGS.spent}`]: state.max - target });
}

/**
 * Restore all spell points and high-level spells (GM only).
 * @param {Actor} actor
 * @returns {Promise<Actor|void>}
 */
export async function restoreSpellPoints(actor) {
  if ( !game.user.isGM ) return ui.notifications.warn(loc("Warning.GMOnly"));
  return actor.update({ [`flags.${MODULE_ID}.${FLAGS.spent}`]: 0, [`flags.${MODULE_ID}.${FLAGS.highUsed}`]: [] });
}

/**
 * Mark a 6th+ level as used or unused (GM only).
 * @param {Actor} actor
 * @param {number} level
 * @returns {Promise<Actor|void>}
 */
async function toggleHighLevel(actor, level) {
  if ( !game.user.isGM ) return;
  const state = getState(actor);
  if ( !state ) return;
  const used = new Set(state.highUsed);
  if ( used.has(level) ) used.delete(level);
  else used.add(level);
  return actor.update({ [`flags.${MODULE_ID}.${FLAGS.highUsed}`]: Array.from(used).sort((a, b) => a - b) });
}

/**
 * Turn spell points on or off for one actor (GM only). Turning them on starts with a full pool.
 * @param {Actor} actor
 * @param {boolean} enabled
 * @returns {Promise<Actor|void>}
 */
export async function setSpellPointsEnabled(actor, enabled) {
  if ( !game.user.isGM ) return ui.notifications.warn(loc("Warning.GMOnly"));
  if ( !actor?.system?.spells ) return;
  const updates = { [`flags.${MODULE_ID}.${FLAGS.enabled}`]: !!enabled };
  if ( enabled ) {
    updates[`flags.${MODULE_ID}.${FLAGS.spent}`] = 0;
    updates[`flags.${MODULE_ID}.${FLAGS.highUsed}`] = [];
  }
  return actor.update(updates);
}

/**
 * Open the spell point settings of an actor (GM only).
 * @param {Actor} actor
 */
export function openActorConfig(actor) {
  if ( !game.user.isGM ) return ui.notifications.warn(loc("Warning.GMOnly"));
  if ( !actor?.system?.spells ) return;
  new ActorSpellPointsConfig({ document: actor }).render({ force: true });
}

/* -------------------------------------------- */
/*  The Spell Points box                        */
/* -------------------------------------------- */

/**
 * Build the Spell Points box.
 * @param {Actor} actor
 * @param {SpellPointState} state
 * @returns {HTMLElement}
 */
function buildTracker(actor, state) {
  const isGM = game.user.isGM;
  const el = document.createElement("section");
  el.className = "primal-sp-tracker";
  el.innerHTML = `
    <div class="primal-sp-head">
      <span class="primal-sp-title"><i class="fa-solid fa-wand-sparkles" inert></i> <span></span></span>
      <span class="primal-sp-numbers">
        ${isGM
          ? '<input type="text" class="primal-sp-value" inputmode="numeric" autocomplete="off">'
          : '<span class="primal-sp-value"></span>'}
        <span class="primal-sp-sep">/</span>
        <span class="primal-sp-max"></span>
      </span>
      ${isGM ? '<button type="button" class="primal-sp-configure"><i class="fa-solid fa-gear" inert></i></button>' : ""}
    </div>
    <div class="primal-sp-bar"><span class="primal-sp-fill"></span></div>`;

  const title = el.querySelector(".primal-sp-title");
  title.querySelector("span").textContent = loc("SpellPoints");
  title.dataset.tooltipHtml = costTooltip(state);

  const value = el.querySelector(".primal-sp-value");
  el.querySelector(".primal-sp-max").textContent = state.max;
  const pct = state.max ? Math.round((state.value / state.max) * 100) : 0;
  el.querySelector(".primal-sp-fill").style.width = `${pct}%`;
  el.classList.toggle("empty", state.value <= 0);

  if ( isGM ) {
    value.value = state.value;
    value.dataset.tooltip = loc("Sheet.EditHint");
    value.addEventListener("focus", () => value.select());
    value.addEventListener("keydown", event => {
      if ( event.key !== "Enter" ) return;
      event.preventDefault();
      event.stopPropagation();
      value.blur();
    });
    value.addEventListener("change", event => {
      event.stopPropagation();
      const raw = value.value.trim();
      const current = getState(actor)?.value ?? state.value;
      let next;
      if ( /^[+-]\d+$/.test(raw) ) next = current + Number(raw);
      else if ( /^=?\d+$/.test(raw) ) next = Number(raw.replace("=", ""));
      else {
        value.value = current;
        return;
      }
      setSpellPoints(actor, next);
    });
    const configure = el.querySelector(".primal-sp-configure");
    configure.dataset.tooltip = loc("Config.Title");
    configure.setAttribute("aria-label", loc("Config.Title"));
    configure.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      openActorConfig(actor);
    });
  }
  else value.textContent = state.value;

  // Once-per-long-rest levels.
  if ( state.limit && (state.maxLevel >= HIGH_LEVEL) ) {
    const row = document.createElement("div");
    row.className = "primal-sp-high";
    const label = document.createElement("span");
    label.className = "primal-sp-high-label";
    label.textContent = loc("Sheet.OncePerRest");
    row.append(label);
    for ( let level = HIGH_LEVEL; level <= Math.min(9, state.maxLevel); level++ ) {
      const used = isHighLevelUsed(state, level);
      const pill = document.createElement(isGM ? "button" : "span");
      if ( isGM ) pill.type = "button";
      pill.className = `primal-sp-level${used ? " used" : ""}`;
      pill.textContent = level;
      const tip = loc(used ? "Sheet.LevelUsed" : "Sheet.LevelReady", { level: levelLabel(level) });
      if ( isGM ) pill.dataset.tooltipHtml = `${tip}<br>${loc("Sheet.LevelToggle")}`;
      else pill.dataset.tooltip = tip;
      pill.setAttribute("aria-label", tip);
      if ( isGM ) {
        pill.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          toggleHighLevel(actor, level);
        });
      }
      row.append(pill);
    }
    el.append(row);
  }
  return el;
}

/**
 * The GM's "Spell points: off" strip on a spellcaster that uses spell slots.
 * @param {Actor} actor
 * @returns {HTMLElement}
 */
function buildOffStrip(actor) {
  const el = document.createElement("section");
  el.className = "primal-sp-tracker primal-sp-off";
  el.innerHTML = `
    <div class="primal-sp-head">
      <span class="primal-sp-title"><i class="fa-solid fa-wand-sparkles" inert></i> <span></span></span>
      <button type="button" class="primal-sp-turn-on"></button>
      <button type="button" class="primal-sp-configure"><i class="fa-solid fa-gear" inert></i></button>
    </div>`;
  el.querySelector(".primal-sp-title span").textContent = loc("Sheet.Off");
  el.querySelector(".primal-sp-title").dataset.tooltip = loc("Sheet.OffHint");
  const turnOn = el.querySelector(".primal-sp-turn-on");
  turnOn.textContent = loc("Sheet.TurnOn");
  turnOn.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    setSpellPointsEnabled(actor, true);
  });
  const configure = el.querySelector(".primal-sp-configure");
  configure.dataset.tooltip = loc("Config.Title");
  configure.setAttribute("aria-label", loc("Config.Title"));
  configure.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openActorConfig(actor);
  });
  return el;
}

/**
 * A small table of costs, up to the highest level the caster can cast.
 * @param {SpellPointState} state
 * @returns {string}
 */
function costTooltip(state) {
  const rows = [];
  for ( let level = 1; level <= state.maxLevel; level++ ) {
    rows.push(`<tr><td>${levelLabel(level)}</td><td>${state.cost[level]}</td></tr>`);
  }
  return `<div class="primal-sp-tooltip"><p>${loc("Sheet.CostIntro")}</p><table>${rows.join("")}</table></div>`;
}

/* -------------------------------------------- */
/*  Render hook                                 */
/* -------------------------------------------- */

/**
 * renderActorSheetV2: add or remove the Spell Points box and the classes the stylesheet uses.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
export function onRenderActorSheet(app, element) {
  const actor = app.actor ?? app.document;
  if ( !(actor instanceof Actor) || !(element instanceof HTMLElement) ) return;
  element.querySelectorAll(".primal-sp-tracker").forEach(n => n.remove());

  const state = getState(actor);
  element.classList.toggle("primal-sp", !!state?.active);
  if ( !state?.active ) {
    delete element.dataset.primalSpUsed;
    delete element.dataset.primalSpShort;
    // GMs get a way to turn spell points on for any spellcaster with spell slots.
    if ( game.user.isGM && computeState(actor)?.maxLevel ) {
      for ( const [layout, selector] of Object.entries(TARGETS) ) {
        for ( const target of element.querySelectorAll(selector) ) {
          const strip = buildOffStrip(actor);
          strip.classList.add(layout);
          if ( layout === "dnd5e" ) strip.classList.add("card");
          target.prepend(strip);
        }
      }
    }
    return;
  }
  element.dataset.primalSpUsed = state.limit ? state.highUsed.join(" ") : "";
  element.dataset.primalSpShort = unaffordableLevels(state).join(" ");

  for ( const [layout, selector] of Object.entries(TARGETS) ) {
    for ( const target of element.querySelectorAll(selector) ) {
      const tracker = buildTracker(actor, state);
      tracker.classList.add(layout);
      if ( layout === "dnd5e" ) tracker.classList.add("card");
      target.prepend(tracker);
    }
  }
}

/**
 * getHeaderControlsActorSheetV2: a "Spell Points" entry in the sheet's menu for GMs, so spell points can be set up
 * for any spellcaster, including actors that don't use them yet.
 * @param {ApplicationV2} app
 * @param {object[]} controls
 */
export function onGetHeaderControls(app, controls) {
  if ( !game.user.isGM ) return;
  const actor = app.actor ?? app.document;
  if ( !(actor instanceof Actor) || !actor.system?.spells ) return;
  controls.push({
    icon: "fa-solid fa-wand-sparkles",
    label: "PRIMAL_SPELL_POINTS.Config.Title",
    onClick: () => openActorConfig(actor)
  });
}

/* -------------------------------------------- */
/*  Spell level headings                        */
/* -------------------------------------------- */

/**
 * Write the CSS that shows each spell level's cost in its heading. Done in a stylesheet so it survives however a sheet
 * redraws its headings. Called on ready and when the tables change.
 */
export function updateCostStyles() {
  const id = `${MODULE_ID}-costs`;
  let style = document.getElementById(id);
  if ( !style ) {
    style = document.createElement("style");
    style.id = id;
    document.head.append(style);
  }
  const { cost } = getTables();
  const css = text => `"${String(text).replace(/["\\]/g, "\\$&").replace(/\n/g, " ")}"`;
  const headings = (scope, level) => [
    `${scope} .items-section[data-method="spell"][data-level="${level}"] > .items-header > h3.item-name::after`,
    `${scope} header.tidy-table-header-row[data-method="spell"][data-slot="spell${level}"] h3::after`
  ].join(",\n");
  const rules = [];
  for ( let level = 1; level <= 9; level++ ) {
    rules.push(`${headings(".primal-sp", level)} { content: ${css(loc("Sheet.Cost", { cost: cost[level] }))}; }`);
    rules.push(`${headings(`.primal-sp[data-primal-sp-short~="${level}"]`, level)} { opacity: 0.5; }`);
    if ( level >= HIGH_LEVEL ) {
      rules.push(`${headings(`.primal-sp[data-primal-sp-used~="${level}"]`, level)} {
        content: ${css(loc("Sheet.CostUsed", { cost: cost[level] }))};
      }`);
    }
  }
  style.textContent = rules.join("\n");
}
