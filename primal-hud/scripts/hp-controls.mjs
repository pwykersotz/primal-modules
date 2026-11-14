/**
 * Token HUD: -10 / -1 / +1 / +10 buttons under the token's hit point box.
 *
 * Clicks are added up for a short moment (the "combine quick HP clicks" setting) and then sent as one change
 * through Actor#modifyTokenAttribute, the same call the HUD makes when "-11" is typed into the HP box. In dnd5e
 * that becomes Actor5e#applyDamage, so damage uses up temporary HP first, healing stops at max HP, and the usual
 * scrolling numbers, concentration checks and damage hooks all happen. While a change is waiting or being saved,
 * the HP box shows the value it will end up at and a badge shows the change.
 */
import { HP_ATTRIBUTE, HP_STEPS, MODULE_ID, SETTINGS, loc } from "./constants.mjs";
import { HP_BUTTON_ID, isButtonShown } from "./buttons.mjs";

/**
 * HP changes not yet saved, keyed by actor UUID.
 * queued: clicked but not sent yet. inFlight: sent, waiting for the update to come back.
 * @type {Map<string, {actor: Actor, queued: number, inFlight: number, timer: number|null, chain: Promise}>}
 */
const pending = new Map();

export function registerHpControls() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
}

/* -------------------------------------------- */
/*  Rendering                                   */
/* -------------------------------------------- */

function onRenderTokenHUD(hud, html) {
  const root = (html instanceof HTMLElement) ? html : (html?.[0] ?? hud.element);
  if ( !root ) return;
  root.querySelectorAll(".primal-hud-hp").forEach(el => el.remove());
  root.querySelectorAll(".primal-hud-hp-anchor").forEach(el => el.classList.remove("primal-hud-hp-anchor"));
  if ( !isButtonShown(HP_BUTTON_ID) ) return;

  const target = findHpTarget(hud, root);
  if ( !target ) return;
  const { actor, anchor, barName, placement } = target;
  anchor.classList.add("primal-hud-hp-anchor");

  // The waiting change ("-11") sits on the HP box's edge nearest the token.
  if ( barName ) {
    const badge = document.createElement("span");
    badge.classList.add("primal-hud-hp", "primal-hud-hp-delta", placement);
    anchor.append(badge);
  }

  // The buttons sit on the far side of the HP box, no wider than the token, so they stay clear of the
  // HUD's left and right icon columns.
  const controls = document.createElement("div");
  controls.classList.add("primal-hud-hp", "primal-hud-hp-controls", placement);
  controls.dataset.actorUuid = actor.uuid;
  if ( barName ) controls.dataset.bar = barName;
  else {
    const readout = document.createElement("span");
    readout.classList.add("primal-hud-hp-readout");
    readout.dataset.tooltip = "";
    readout.setAttribute("aria-label", loc("HP.Readout"));
    controls.append(readout);
  }

  const buttons = document.createElement("div");
  buttons.classList.add("primal-hud-hp-buttons");
  for ( const step of HP_STEPS.filter(s => s < 0) ) buttons.append(makeStepButton(actor, step));
  const gap = document.createElement("span");
  gap.classList.add("primal-hud-hp-gap");
  buttons.append(gap);
  for ( const step of HP_STEPS.filter(s => s > 0) ) buttons.append(makeStepButton(actor, step));
  controls.append(buttons);

  anchor.append(controls);
  paint(root, controls, actor);
}

/**
 * Find where the HP buttons go: next to the HUD bar that shows hit points, or, when no bar shows them,
 * in the bottom bar slot with a small HP readout of their own.
 * @returns {{actor: Actor, anchor: HTMLElement, barName: string|null, placement: string}|null}
 */
function findHpTarget(hud, root) {
  const doc = hud.document;
  const actor = hud.actor ?? doc?.actor;
  if ( !doc || !actor?.isOwner ) return null;
  const hp = foundry.utils.getProperty(actor.system ?? {}, HP_ATTRIBUTE);
  if ( !hp || !Number.isFinite(Number(hp.value)) ) return null;

  for ( const barName of ["bar1", "bar2"] ) {
    const bar = doc.getBarAttribute?.(barName);
    if ( bar?.attribute !== HP_ATTRIBUTE ) continue;
    const input = root.querySelector(`.attribute.${barName} > input[name="${barName}"]`);
    if ( !input ) continue;
    if ( !bar.editable || input.disabled ) return null;
    // bar2 sits above the token and bar1 below it, so the buttons go on the outside of each.
    return { actor, anchor: input.parentElement, barName, placement: barName === "bar2" ? "above" : "below" };
  }

  const anchor = root.querySelector(".attribute.bar1") ?? root.querySelector(".col.middle");
  if ( !anchor ) return null;
  // Use the bottom bar slot itself when it is empty, otherwise go under whatever bar it shows.
  const placement = anchor.querySelector("input") ? "below" : "inside";
  return { actor, anchor, barName: null, placement };
}

function makeStepButton(actor, step) {
  const amount = Math.abs(step);
  const label = loc(step < 0 ? "HP.Damage" : "HP.Heal", { amount });
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("primal-hud-hp-step", step < 0 ? "damage" : "heal");
  button.dataset.step = String(step);
  button.dataset.tooltip = "";
  button.setAttribute("aria-label", label);
  button.textContent = `${step < 0 ? "−" : "+"}${amount}`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    queueHpChange(actor, step);
  });
  // Keep the button from taking focus, so keyboard token movement keeps working after a click.
  button.addEventListener("mousedown", event => event.preventDefault());
  return button;
}

/**
 * Show the HP value a token will end up at once its waiting changes are saved, plus the size of the change.
 */
function paint(root, controls, actor) {
  const entry = pending.get(actor.uuid);
  const delta = (entry?.queued ?? 0) + (entry?.inFlight ?? 0);
  const hp = foundry.utils.getProperty(actor.system ?? {}, HP_ATTRIBUTE);
  const projected = projectHp(hp, delta);
  const sign = delta < 0 ? "damage" : (delta > 0 ? "heal" : null);
  const deltaText = delta ? `${delta < 0 ? "−" : "+"}${Math.abs(delta)}` : "";
  const mark = el => {
    el.classList.toggle("damage", sign === "damage");
    el.classList.toggle("heal", sign === "heal");
  };

  const input = controls.dataset.bar ? root.querySelector(`input[name="${controls.dataset.bar}"]`) : null;
  if ( input && (document.activeElement !== input) ) {
    input.value = String(projected.value);
    input.classList.toggle("primal-hud-hp-preview", !!sign);
    mark(input);
  }

  const badge = controls.parentElement?.querySelector(":scope > .primal-hud-hp-delta");
  if ( badge ) {
    badge.textContent = deltaText;
    mark(badge);
  }

  const readout = controls.querySelector(".primal-hud-hp-readout");
  if ( readout ) {
    const max = Number.isFinite(projected.max) ? `/${projected.max}` : "";
    readout.textContent = `${projected.value}${max}${deltaText ? ` (${deltaText})` : ""}`;
    mark(readout);
  }
}

/** Re-paint the open Token HUD if it belongs to this actor. */
function refreshHud(uuid) {
  const hud = canvas?.tokens?.hud;
  const root = hud?.rendered ? hud.element : null;
  const controls = root?.querySelector(".primal-hud-hp-controls");
  if ( !controls || (controls.dataset.actorUuid !== uuid) || !hud.actor ) return;
  paint(root, controls, hud.actor);
}

/* -------------------------------------------- */
/*  HP changes                                  */
/* -------------------------------------------- */

/**
 * Where hit points end up after a change, following dnd5e's rules: damage comes off temporary HP first,
 * hit points stop at 0, and healing stops at max HP.
 * @param {object} hp      The actor's hit points (value, max, temp, effectiveMax).
 * @param {number} delta   Positive heals, negative damages.
 * @returns {{value: number, temp: number, max: number}}
 */
export function projectHp(hp, delta) {
  const value = Number(hp?.value) || 0;
  const temp = Math.max(0, Number(hp?.temp) || 0);
  const max = Number(hp?.effectiveMax ?? hp?.max);
  const damage = -delta;
  const fromTemp = damage > 0 ? Math.min(temp, damage) : 0;
  const room = Number.isFinite(max) ? Math.max(0, max - value) : Infinity;
  const fromValue = Math.min(Math.max(damage - fromTemp, -room), value);
  return { value: value - fromValue, temp: temp - fromTemp, max };
}

/**
 * Add an HP change for an actor. It is saved after the combine delay, together with any further clicks.
 * @param {Actor} actor
 * @param {number} delta   Positive heals, negative damages.
 */
export function queueHpChange(actor, delta) {
  if ( !actor?.uuid || !Number.isFinite(delta) || !delta ) return;
  let entry = pending.get(actor.uuid);
  if ( !entry ) {
    entry = { actor, queued: 0, inFlight: 0, timer: null, chain: Promise.resolve() };
    pending.set(actor.uuid, entry);
  }
  entry.actor = actor;
  entry.queued += delta;
  clearTimeout(entry.timer);
  entry.timer = null;
  const wait = Math.max(0, Number(game.settings.get(MODULE_ID, SETTINGS.hpCombineDelay)) || 0);
  if ( wait > 0 ) entry.timer = setTimeout(() => flush(actor.uuid), wait);
  else flush(actor.uuid);
  refreshHud(actor.uuid);
}

/** Send an actor's waiting HP change. Changes for one actor are saved one after another, never at once. */
function flush(uuid) {
  const entry = pending.get(uuid);
  if ( !entry ) return;
  clearTimeout(entry.timer);
  entry.timer = null;
  const amount = entry.queued;
  entry.queued = 0;
  if ( !amount ) {
    forget(uuid);
    refreshHud(uuid);
    return;
  }
  entry.inFlight += amount;
  entry.chain = entry.chain
    .then(() => entry.actor.modifyTokenAttribute(HP_ATTRIBUTE, amount, true, true))
    .catch(err => {
      console.error(`${MODULE_ID} | Could not change hit points by ${amount}`, err);
      ui.notifications?.error(loc("HP.Failed"));
    })
    .finally(() => {
      entry.inFlight -= amount;
      forget(uuid);
      refreshHud(uuid);
    });
}

/** Drop an actor's entry once nothing is waiting for it. */
function forget(uuid) {
  const entry = pending.get(uuid);
  if ( entry && !entry.queued && !entry.inFlight && !entry.timer ) pending.delete(uuid);
}
