/**
 * Arrange the Token HUD's buttons: move any button between the left and right columns and choose their order.
 *
 * Each user's layout is a user setting: an ordered list of button ids for each side. Nothing moves until a user
 * saves a layout. Every time the HUD's contents change (Foundry rendering it, or another module adding a button,
 * even late) the buttons are recognised, marked with their id, and the listed ones moved into place in the HUD's
 * own left or right column, each followed by its palette (status effects, movement actions...). Buttons not in the
 * layout (ones from a module added since) stay in their column, after the arranged ones.
 */
import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { BUTTON_ID_ATTR, arrangeableButtons, buttonSelectors, sideOf } from "./buttons.mjs";

const SIDES = ["left", "right"];
const OWN_ELEMENTS = ".primal-hud-hp, .primal-hud-sidebar";

/** The pop-out palette belonging to each recognised button. */
const palettes = new WeakMap();

/** @type {{left: string[], right: string[]}|null} */
let layout = null;

let passes = 0;
let passWindow = 0;

/** Load the saved layout and start applying it. Called at ready. */
export function initLayout() {
  loadLayout();
  const hudLayer = document.getElementById("hud") ?? document.body;
  // Mutation observer callbacks run before the browser paints, so buttons never show in the wrong place.
  new MutationObserver(records => {
    if ( records.some(isTokenHudChange) ) applyLayout();
  }).observe(hudLayer, { childList: true, subtree: true });
  applyLayout();
}

/** After the layout setting changes: re-read it and re-render the HUD so it starts from Foundry's own order. */
export function onLayoutChanged() {
  loadLayout();
  const hud = canvas?.tokens?.hud;
  if ( hud?.rendered ) hud.render();
}

function loadLayout() {
  const saved = game.settings.get(MODULE_ID, SETTINGS.buttonLayout);
  const ids = list => (Array.isArray(list) ? list.filter(id => typeof id === "string") : []);
  if ( saved && (Array.isArray(saved.left) || Array.isArray(saved.right)) ) {
    layout = { left: ids(saved.left), right: ids(saved.right) };
  }
  else layout = null;
}

/** Whether this user has saved a layout. */
export function hasLayout() {
  return !!layout;
}

function isTokenHudChange(record) {
  const target = record.target;
  if ( !(target instanceof Element) ) return false;
  if ( target.closest(OWN_ELEMENTS) ) return false;
  if ( (target.id === "token-hud") || target.closest("#token-hud") ) {
    const changed = [...record.addedNodes, ...record.removedNodes].filter(n => n instanceof Element);
    return !(changed.length && changed.every(n => n.matches(OWN_ELEMENTS)));
  }
  return [...record.addedNodes].some(n => (n instanceof Element) && (n.id === "token-hud"));
}

/* -------------------------------------------- */
/*  Applying the layout                         */
/* -------------------------------------------- */

/** Recognise the open HUD's buttons and move them to where this user's layout puts them. */
export function applyLayout() {
  const root = document.getElementById("token-hud");
  if ( !root ) return;

  // Moving buttons is itself a change to the HUD; a second pass finds everything in place and moves nothing.
  // This guard only matters if another module keeps fighting over a button's position.
  const now = performance.now();
  if ( now - passWindow > 1000 ) {
    passWindow = now;
    passes = 0;
  }
  if ( ++passes > 40 ) return;

  let found;
  try {
    found = identify(root);
  } catch (err) {
    console.error(`${MODULE_ID} | Could not recognise the Token HUD's buttons`, err);
    return;
  }
  if ( !layout ) return;

  for ( const side of SIDES ) {
    const column = root.querySelector(`:scope > .col.${side}`);
    if ( !column ) continue;
    const buttons = [];
    for ( const id of layout[side] ) {
      const el = found.get(id);
      if ( !el?.parentElement ) continue;
      // A module's own extra column on the same side (Item Piles has one) is left as the module made it.
      const current = el.parentElement;
      if ( (current !== column) && (sideOf(current) === side) ) continue;
      buttons.push(el);
    }

    // Put the arranged buttons, each followed by its palette, at the top of the column in order. Nodes already in
    // the right place are not touched, so applying the same layout again changes nothing.
    let ref = column.firstElementChild;
    for ( const el of buttons ) {
      const palette = palettes.get(el);
      for ( const node of [el, palette] ) {
        if ( !node?.isConnected ) continue;
        if ( node === ref ) {
          ref = ref.nextElementSibling;
          continue;
        }
        column.insertBefore(node, ref);
      }
    }
  }
}

/**
 * Find each known button in the HUD and mark it with its id (and the side its module put it on), so it is still
 * recognised after being moved.
 * @param {HTMLElement} root
 * @returns {Map<string, HTMLElement>}
 */
function identify(root) {
  const found = new Map();
  for ( const el of root.querySelectorAll(`:scope > .col > [${BUTTON_ID_ATTR}]`) ) {
    found.set(el.getAttribute(BUTTON_ID_ATTR), el);
  }
  for ( const [id, selector] of buttonSelectors() ) {
    if ( found.has(id) ) continue;
    let el;
    try {
      el = [...root.querySelectorAll(`:scope > .col > ${selector}`)].find(e => !e.hasAttribute(BUTTON_ID_ATTR)
        && !e.matches(".palette"));
    } catch {
      continue;
    }
    if ( !el ) continue;
    el.setAttribute(BUTTON_ID_ATTR, id);
    el.dataset.primalHudSide = sideOf(el.parentElement) ?? "";
    const name = el.dataset.palette;
    let palette = null;
    if ( name ) palette = root.querySelector(`:scope > .col > .palette[data-palette="${CSS.escape(name)}"]`);
    else if ( el.nextElementSibling?.matches(".palette") ) palette = el.nextElementSibling;
    if ( palette ) palettes.set(el, palette);
    found.set(id, el);
  }
  return found;
}

/* -------------------------------------------- */
/*  For the layout window                       */
/* -------------------------------------------- */

/**
 * The layout to show in the window: the saved one, or else the order of the open Token HUD, with every other
 * button placed on its usual side next to the buttons it usually follows.
 * @param {boolean} [defaults]  Ignore the saved layout and the open HUD, and give Foundry's own arrangement.
 * @returns {{layout: {left: string[], right: string[]}, buttons: Map<string, object>}}
 */
export function layoutForEditing(defaults = false) {
  const buttons = new Map(arrangeableButtons().map(b => [b.id, b]));
  const result = { left: [], right: [] };
  const placed = new Set();
  const add = (side, id) => {
    if ( !buttons.has(id) || placed.has(id) ) return;
    placed.add(id);
    result[side].push(id);
  };

  if ( !defaults && layout ) {
    for ( const side of SIDES ) layout[side].forEach(id => add(side, id));
  }
  else if ( !defaults ) {
    const root = document.getElementById("token-hud");
    if ( root && canvas?.tokens?.hud?.rendered ) {
      for ( const column of root.querySelectorAll(":scope > .col.left, :scope > .col.right") ) {
        const side = sideOf(column);
        for ( const el of column.querySelectorAll(`:scope > [${BUTTON_ID_ATTR}]`) ) {
          add(side, el.getAttribute(BUTTON_ID_ATTR));
        }
      }
    }
  }

  // Anything not placed yet goes on its usual side, after the nearest button it usually follows.
  for ( const side of SIDES ) {
    const usual = [...buttons.values()].filter(b => b.side === side).map(b => b.id);
    usual.forEach((id, i) => {
      if ( placed.has(id) ) return;
      placed.add(id);
      const before = usual.slice(0, i).reverse().find(prev => result[side].includes(prev));
      const index = before ? result[side].indexOf(before) + 1 : 0;
      result[side].splice(index, 0, id);
    });
  }
  return { layout: result, buttons };
}

/**
 * Save a layout, or clear it so Foundry's own arrangement is used.
 * @param {{left: string[], right: string[]}|null} value
 */
export async function saveLayout(value) {
  await game.settings.set(MODULE_ID, SETTINGS.buttonLayout, value ? { left: [...value.left], right: [...value.right] } : {});
}
