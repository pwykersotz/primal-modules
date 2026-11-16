/**
 * The MVP pip: a second, smaller pip of light beside the Inspiration marker on character sheets (dnd5e and Tidy 5e),
 * kept in the actor flag flags.primal-houserules.mvp. Anyone who can change the character can light it or spend it,
 * the same as Inspiration, and spending it says so in the chat.
 */
import { FLAGS, MODULE_ID, SETTINGS, loc, setting } from "./constants.mjs";

const PIP = "primal-mvp-pip";

/**
 * Whether a character has its MVP pip lit.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function hasMvp(actor) {
  return !!actor?.getFlag?.(MODULE_ID, FLAGS.mvp);
}

/**
 * Light or spend a character's MVP pip.
 * @param {Actor} actor
 * @param {boolean} [value]   Leave out to switch it.
 * @returns {Promise<boolean>}  The new state.
 */
export async function setMvp(actor, value) {
  if ( !actor?.isOwner ) return hasMvp(actor);
  const was = hasMvp(actor);
  const next = (value === undefined) ? !was : !!value;
  if ( next === was ) return was;
  await actor.setFlag(MODULE_ID, FLAGS.mvp, next);
  if ( was && !next ) {
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }),
      content: `<p>${loc("MVP.Spent", { name: foundry.utils.escapeHTML?.(actor.name) ?? actor.name })}</p>`
    });
  }
  return next;
}

/**
 * Where the pip goes on a rendered sheet: next to the dnd5e header's Inspiration button, or inside Tidy 5e's
 * Inspiration badge.
 * @param {HTMLElement} element
 * @returns {{anchor: HTMLElement, mode: "dnd5e"|"tidy"}|null}
 */
export function findAnchor(element) {
  if ( !element?.querySelector ) return null;
  const tidy = element.querySelector('[data-tidy-sheet-part="inspiration-tracker-container"]');
  if ( tidy ) return { anchor: tidy, mode: "tidy" };
  const dnd5e = element.querySelector('.sheet-header .right button.inspiration[data-action="toggleInspiration"]');
  if ( dnd5e ) return { anchor: dnd5e, mode: "dnd5e" };
  return null;
}

/**
 * Show a pip's state.
 * @param {HTMLElement} pip
 * @param {Actor} actor
 */
function paint(pip, actor) {
  const lit = hasMvp(actor);
  pip.setAttribute("aria-pressed", String(lit));
  pip.classList.toggle("lit", lit);
  const label = loc(lit ? "MVP.Lit" : "MVP.Unlit");
  pip.setAttribute("aria-label", label);
  pip.dataset.tooltip = label;
  pip.disabled = !actor.isOwner;
}

/**
 * Add the pip to a rendered sheet, or bring the one already there up to date. Safe to call on every render.
 * @param {HTMLElement} element
 * @param {Actor} actor
 * @returns {HTMLElement|null}
 */
export function injectPip(element, actor) {
  const found = findAnchor(element);
  if ( !found ) return null;
  const { anchor, mode } = found;
  const parent = (mode === "tidy") ? anchor : anchor.parentElement;
  let pip = parent.querySelector(`:scope > .${PIP}`);
  if ( !pip ) {
    pip = document.createElement("button");
    pip.type = "button";
    pip.className = `${PIP} ${mode}`;
    pip.dataset.primalMvp = "";
    pip.innerHTML = '<span class="pip" inert></span>';
    pip.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      setMvp(actor);
    });
    if ( mode === "tidy" ) anchor.append(pip);
    else anchor.after(pip);
  }
  paint(pip, actor);
  return pip;
}

/**
 * renderActorSheetV2: add the pip to character sheets.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
export function onRenderActorSheet(app, element) {
  const actor = app?.actor ?? app?.document;
  if ( actor?.type !== "character" ) return;
  const root = (element instanceof HTMLElement) ? element : (element?.[0] ?? app.element);
  if ( !setting(SETTINGS.mvp, true) ) {
    root?.querySelectorAll?.(`.${PIP}`).forEach(pip => pip.remove());
    return;
  }
  injectPip(root, actor);
}

/**
 * updateActor: Tidy 5e redraws parts of its sheet without a full render, so bring the pip up to date directly.
 * @param {Actor} actor
 * @param {object} changes
 */
export function onUpdateActor(actor, changes) {
  if ( !foundry.utils.hasProperty(changes ?? {}, `flags.${MODULE_ID}`) ) return;
  for ( const app of Object.values(actor.apps ?? {}) ) {
    if ( app?.element instanceof HTMLElement ) onRenderActorSheet(app, app.element);
  }
}
