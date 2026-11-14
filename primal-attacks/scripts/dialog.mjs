/**
 * The number of attacks, added to dnd5e's Attack Roll window (the one with Advantage, Normal and Disadvantage).
 *
 * The window is dnd5e's own, so its highlighted button is whatever dnd5e, Midi-QOL and the other modules suggest.
 * Primal Attacks only adds an "Attacks" field under its configuration. The number picked is read when the window's
 * rolls are built (see engine.mjs), and the button pressed applies to every attack.
 */
import { MAX_ATTACKS, MODULE_ID, SETTINGS, loc, setting } from "./constants.mjs";

/** The number picked in each open window. */
const byApp = new WeakMap();

/** The number picked for the roll configuration a window builds (the same object the roll hooks are given). */
const byConfig = new WeakMap();

/** The number picked in the last window drawn for each activity, in case the configuration is copied on its way. */
const bySubject = new Map();

/** Numbers set ahead for an activity's next attack roll (a Multiattack routine): uuid -> {n, at}. */
const presets = new Map();

/** How long a number set ahead waits for its roll. */
const PRESET_TTL = 10 * 60 * 1000;

/**
 * Set the number of attacks for an activity's next attack roll, as a Multiattack routine does. Its window starts at
 * that number (which can still be changed there), and with no window shown the roll makes that many.
 * @param {string} uuid    The activity's uuid.
 * @param {number} count
 */
export function presetCount(uuid, count) {
  if ( !uuid ) return;
  presets.set(uuid, { n: clampCount(count), at: Date.now() });
}

/** The number set ahead for an activity, if it's still waiting. */
function presetFor(uuid) {
  const preset = uuid ? presets.get(uuid) : null;
  if ( !preset ) return undefined;
  if ( (Date.now() - preset.at) > PRESET_TTL ) {
    presets.delete(uuid);
    return undefined;
  }
  return preset.n;
}

/** Is this dnd5e roll window for an attack roll? */
export function isAttackRollDialog(app) {
  const config = app?.config;
  return !!config?.hookNames?.includes?.("attack") && (config.subject?.type === "attack");
}

/** Does this user's setting offer the number of attacks for this creature? */
function offeredFor(actor) {
  const who = setting(SETTINGS.offerOnAttack) ?? "all";
  if ( who === "never" ) return false;
  if ( who === "characters" ) return actor.type === "character";
  if ( who === "monsters" ) return actor.type !== "character";
  return true;
}

/**
 * Should the Attack Roll window for this attack offer the number of attacks? Weapon, natural and spell attacks, for a
 * creature this user owns, at any time. It starts at 1, so a reaction or an attack off-turn is a
 * single attack unless the number is changed.
 * @param {Activity} activity
 * @returns {boolean}
 */
export function offersCount(activity) {
  const actor = activity?.actor;
  if ( !actor?.isOwner || (activity.type !== "attack") ) return false;
  if ( !offeredFor(actor) ) return false;
  return true;
}

/** A whole number of attacks from 1 to the most allowed. */
export function clampCount(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(MAX_ATTACKS, Math.max(1, n)) : 1;
}

/**
 * Keep the number picked in a window.
 * @param {Application} app
 * @param {number} count
 */
export function setCount(app, count) {
  const n = clampCount(count);
  byApp.set(app, n);
  const config = app?.config;
  if ( config && (typeof config === "object") ) byConfig.set(config, n);
  const uuid = config?.subject?.uuid;
  if ( uuid ) bySubject.set(uuid, n);
  return n;
}

/**
 * The number of attacks picked for a roll that is being built.
 * @param {object} config   The roll configuration given to the roll hooks.
 * @param {object} dialog   The dialog configuration (configure: false means no window was shown).
 * @returns {number}
 */
export function takeCount(config, dialog) {
  const uuid = config?.subject?.uuid;
  let n = (config && (typeof config === "object")) ? byConfig.get(config) : undefined;
  if ( (n === undefined) && uuid ) n = bySubject.get(uuid);
  const preset = presetFor(uuid);
  if ( config && (typeof config === "object") ) byConfig.delete(config);
  if ( uuid ) {
    bySubject.delete(uuid);
    presets.delete(uuid);
  }
  // No window was shown for this roll, so nothing was picked for it (unless a Multiattack routine set the number).
  if ( dialog?.configure === false ) return clampCount(preset ?? 1);
  return clampCount(n ?? preset ?? 1);
}

/** Forget what was picked for an activity (its window is drawn without the field). */
function forget(app) {
  const uuid = app?.config?.subject?.uuid;
  if ( uuid ) bySubject.delete(uuid);
  if ( app?.config && (typeof app.config === "object") ) byConfig.delete(app.config);
  byApp.delete(app);
}

/** Add the field to an Attack Roll window as it is drawn (again after each change dnd5e makes to it). */
export function onRenderRollDialog(app, element) {
  try {
    if ( !isAttackRollDialog(app) ) return;
    if ( !offersCount(app.config.subject) ) {
      forget(app);
      return;
    }
    const root = element instanceof HTMLElement ? element : (app.element ?? element?.[0]);
    if ( !root || root.querySelector(".primal-attacks-count") ) return;
    const count = setCount(app, byApp.get(app) ?? presetFor(app.config?.subject?.uuid) ?? 1);

    const id = `${app.id ?? "roll"}-primal-attacks-count`;
    const row = document.createElement("div");
    row.className = "form-group primal-attacks-count";
    row.innerHTML = `
      <label for="${id}">${loc("Dialog.Attacks")}</label>
      <div class="form-fields">
        <button type="button" class="primal-attacks-step" data-step="-1" aria-label="${loc("Dialog.Fewer")}">
          <i class="fa-solid fa-minus" inert></i></button>
        <input type="number" id="${id}" value="${count}" min="1" max="${MAX_ATTACKS}" step="1" inputmode="numeric">
        <button type="button" class="primal-attacks-step" data-step="1" aria-label="${loc("Dialog.More")}">
          <i class="fa-solid fa-plus" inert></i></button>
      </div>`;

    const input = row.querySelector("input");
    // Keep the number without dnd5e rebuilding the window for it (it has no name, so dnd5e never reads it).
    const keep = event => {
      event.stopPropagation();
      setCount(app, input.value);
    };
    input.addEventListener("input", keep);
    input.addEventListener("change", event => {
      keep(event);
      input.value = String(byApp.get(app));
    });
    // Enter here would press the window's first button (Advantage): just keep the number instead.
    input.addEventListener("keydown", event => {
      if ( event.key !== "Enter" ) return;
      event.preventDefault();
      event.stopPropagation();
      input.value = String(setCount(app, input.value));
    });
    for ( const button of row.querySelectorAll(".primal-attacks-step") ) {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        input.value = String(setCount(app, (byApp.get(app) ?? 1) + Number(button.dataset.step)));
      });
    }

    const anchor = root.querySelector('[name="rollMode"], [name="messageMode"]')?.closest(".form-group")
      ?? root.querySelector('[name="attackMode"]')?.closest(".form-group");
    if ( anchor ) anchor.after(row);
    else {
      const footer = root.querySelector("footer, .form-footer");
      if ( footer ) footer.before(row);
      else (root.querySelector("form") ?? root).append(row);
    }
    if ( typeof app.setPosition === "function" ) app.setPosition({ height: "auto" });
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not add the number of attacks to the roll window`, err);
  }
}

/** Called during init. */
export function registerDialogHooks() {
  Hooks.on("renderRollConfigurationDialog", onRenderRollDialog);
}
