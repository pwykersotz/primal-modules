/**
 * Which Token HUD buttons are shown.
 *
 * Every button in the HUD's columns gets an entry: Foundry's own buttons are listed up front, and buttons other
 * modules add are picked up the first time they appear on a Token HUD this user opens. Each user's choices and the
 * buttons they have seen are stored as user settings, so they follow the user to any device and each player
 * chooses for themselves. Hidden buttons are removed with a stylesheet rule rather than by deleting elements, so
 * it does not matter when other modules add their buttons or whether their HUD hooks run before or after ours.
 */
import { MODULE_ID, SETTINGS, loc } from "./constants.mjs";

/** The id of the -10/-1/+1/+10 HP buttons this module adds. */
export const HP_BUTTON_ID = "primal-hud.hp";

/** The id of the favorites and spells panel this module adds beside the HUD. */
export const SIDEBAR_ID = "primal-hud.sidebar";

/** What this module adds to the Token HUD, each hideable like any other button. */
const OWN_BUTTONS = [
  { id: HP_BUTTON_ID, selector: "#token-hud .primal-hud-hp", icon: "fa-solid fa-heart-pulse", label: "Buttons.HpButtons" },
  { id: SIDEBAR_ID, selector: "#token-hud .primal-hud-sidebar", icon: "fa-solid fa-bookmark", label: "Buttons.Sidebar" }
];

/** Elements this module adds, which are never mistaken for other modules' buttons. */
const OWN_ELEMENTS = ".primal-hud-hp, .primal-hud-sidebar";

/** Buttons Foundry itself puts in the Token HUD's columns, in the order and on the side Foundry puts them. */
export const CORE_BUTTONS = [
  { id: "core.elevation", selector: ".attribute.elevation", label: "Core.Elevation", icon: "fa-solid fa-arrows-up-down",
    side: "left" },
  { id: "core.levels", selector: '[data-action="togglePalette"][data-palette="levels"]', label: "Core.Levels",
    icon: "fa-solid fa-layer-group", gmOnly: true, side: "left" },
  { id: "core.sort", selector: '[data-action="sort"]', label: "Core.Sort", icon: "fa-solid fa-bring-forward",
    side: "left" },
  { id: "core.locked", selector: '[data-action="locked"]', label: "Core.Locked", icon: "fa-solid fa-lock", gmOnly: true,
    side: "left" },
  { id: "core.config", selector: '[data-action="config"]', label: "Core.Config", icon: "fa-solid fa-gear",
    side: "left" },
  { id: "core.visibility", selector: '[data-action="visibility"]', label: "Core.Visibility", icon: "fa-solid fa-eye",
    gmOnly: true, side: "right" },
  { id: "core.effects", selector: '[data-action="togglePalette"][data-palette="effects"]', label: "Core.Effects",
    icon: "fa-solid fa-sparkles", side: "right" },
  { id: "core.movementActions", selector: '[data-action="togglePalette"][data-palette="movementActions"]',
    label: "Core.MovementActions", icon: "fa-solid fa-person-walking", side: "right" },
  { id: "core.target", selector: '[data-action="target"]', label: "Core.Target", icon: "fa-solid fa-bullseye",
    side: "right" },
  { id: "core.combat", selector: '[data-action="combat"]', label: "Core.Combat", icon: "fa-solid fa-swords",
    side: "right" }
];

/** The attribute layout.mjs marks each recognised button with, holding the button's id. */
export const BUTTON_ID_ATTR = "data-primal-hud-button";

/** Classes that describe a button's look or state rather than which button it is. */
const GENERIC_CLASSES = new Set([
  "control-icon", "active", "inactive", "disabled", "enabled", "hidden", "visible", "toggle", "toggled", "selected",
  "on", "off", "open", "closed", "pressed", "button", "icon", "fa", "fas", "far", "fab", "fal", "fad", "fat", "fass",
  "ui-control"
]);

/** The most buttons from other modules to remember, in case a module gives every button a unique class. */
const MAX_KNOWN = 150;

let hidden = new Set();
let known = [];
let saveTimer = null;
let scanQueued = false;
let classOwners = null;

/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

/** Load the saved choices, hide the chosen buttons and start watching the HUD for new buttons. Called at ready. */
export function initButtons() {
  loadHidden();
  const knownList = game.settings.get(MODULE_ID, SETTINGS.knownButtons);
  known = Array.isArray(knownList) ? knownList.filter(e => e?.id && e?.selector).map(e => ({ ...e })) : [];
  applyHiding();
  const hudLayer = document.getElementById("hud") ?? document.body;
  new MutationObserver(records => {
    if ( records.some(r => isTokenHudChange(r)) ) queueScan();
  }).observe(hudLayer, { childList: true, subtree: true });
  queueScan();
}

/** Re-read the saved choices (after a settings change) and re-apply them. */
export function onButtonSettingsChanged() {
  loadHidden();
  applyHiding();
  const hud = canvas?.tokens?.hud;
  if ( hud?.rendered ) hud.render();
}

function loadHidden() {
  const hiddenIds = game.settings.get(MODULE_ID, SETTINGS.hiddenButtons);
  hidden = new Set(Array.isArray(hiddenIds) ? hiddenIds.filter(id => typeof id === "string") : []);
}

/** Is a button shown on this user's Token HUD? */
export function isButtonShown(id) {
  return !hidden.has(id);
}

/* -------------------------------------------- */
/*  Hiding                                      */
/* -------------------------------------------- */

/** Write one stylesheet rule per hidden button. */
function applyHiding() {
  let style = document.getElementById("primal-hud-hidden-buttons");
  if ( !style ) {
    style = document.createElement("style");
    style.id = "primal-hud-hidden-buttons";
    document.head.append(style);
  }
  const rules = [];
  for ( const entry of allEntries() ) {
    if ( !hidden.has(entry.id) ) continue;
    const own = OWN_BUTTONS.find(e => e.id === entry.id);
    const selector = own ? own.selector : `#token-hud .col > ${entry.selector}`;
    if ( isValidSelector(selector) ) rules.push(`${selector} { display: none !important; }`);
    // Buttons moved by the layout are also marked with their id, which still works when a selector that counts
    // look-alike buttons in a column no longer does.
    const tagged = `#token-hud .col > [${BUTTON_ID_ATTR}="${CSS.escape(entry.id)}"]`;
    if ( !own && isValidSelector(tagged) ) rules.push(`${tagged} { display: none !important; }`);
  }
  style.textContent = rules.join("\n");
}

function isValidSelector(selector) {
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

function matches(el, selector) {
  try {
    return el.matches(`.col > ${selector}`);
  } catch {
    return false;
  }
}

/* -------------------------------------------- */
/*  Finding buttons from other modules          */
/* -------------------------------------------- */

function isTokenHudChange(record) {
  const target = record.target;
  if ( !(target instanceof Element) ) return false;
  if ( target.closest(OWN_ELEMENTS) ) return false;
  const changed = [...record.addedNodes, ...record.removedNodes].filter(n => n instanceof Element);
  if ( changed.length && changed.every(n => n.matches(OWN_ELEMENTS)) ) return false;
  return (target.id === "token-hud") || !!target.closest("#token-hud")
    || [...record.addedNodes].some(n => (n instanceof Element) && (n.id === "token-hud"));
}

function queueScan() {
  if ( scanQueued ) return;
  scanQueued = true;
  setTimeout(() => {
    scanQueued = false;
    try {
      scanHud();
    } catch (err) {
      console.error(`${MODULE_ID} | Could not read the Token HUD's buttons`, err);
    }
  }, 50);
}

/** Look through the open Token HUD for buttons not seen before. */
function scanHud() {
  const root = document.getElementById("token-hud");
  if ( !root ) return;
  let changed = false;
  for ( const col of root.querySelectorAll(":scope > .col") ) {
    for ( const el of col.children ) {
      // Palettes are pop-outs of a button, and the bar slots hold the token's bars (and this module's HP buttons).
      if ( el.matches(`.palette, .attribute.bar1, .attribute.bar2, ${OWN_ELEMENTS}`) ) continue;
      if ( el.querySelector(OWN_ELEMENTS) ) continue;
      const tag = el.getAttribute(BUTTON_ID_ATTR);
      if ( tag?.startsWith("core.") || CORE_BUTTONS.some(e => matches(el, e.selector)) ) continue;
      const existing = (tag && known.find(e => e.id === tag)) || known.find(e => matches(el, e.selector));
      if ( existing ) {
        if ( !existing.label ) {
          const label = labelOf(el);
          if ( label ) {
            existing.label = label;
            changed = true;
          }
        }
        // The side the module puts the button on (not where this user's layout moved it to)
        const side = el.dataset.primalHudSide ?? sideOf(col);
        if ( side && (existing.side !== side) ) {
          existing.side = side;
          changed = true;
        }
        continue;
      }
      if ( known.length >= MAX_KNOWN ) continue;
      changed = discover(el, col) || changed;
    }
  }
  if ( changed ) scheduleSave();
}

/**
 * Work out a CSS selector that picks out this button (and the same button on other tokens), and remember it.
 * @returns {boolean}  Whether a new button was added.
 */
function discover(el, col) {
  const action = el.dataset.action || null;
  const palette = el.dataset.palette || null;
  const classes = [...el.classList].filter(c => !GENERIC_CLASSES.has(c) && !c.startsWith("fa-")
    && !/^[A-Za-z0-9]{16}$/.test(c) && !/^\d+$/.test(c));

  let base = "";
  if ( action ) base += `[data-action="${CSS.escape(action)}"]`;
  if ( palette ) base += `[data-palette="${CSS.escape(palette)}"]`;
  base += classes.map(c => `.${CSS.escape(c)}`).join("");
  if ( !base && el.id ) base = `#${CSS.escape(el.id)}`;
  if ( !base ) {
    const iconClass = [...(el.querySelector(":scope > i")?.classList ?? [])].find(c => c.startsWith("fa-")
      && !/^fa-(solid|regular|light|thin|duotone|brands|sharp|fw|stack(-\dx)?|lg|xs|sm|\dx)$/.test(c));
    const img = el.querySelector(":scope > img")?.getAttribute("src");
    if ( iconClass ) base = `${el.localName}:has(> i.${CSS.escape(iconClass)})`;
    else if ( img ) base = `${el.localName}:has(> img[src="${CSS.escape(img)}"])`;
  }
  if ( !base ) return false;

  // A button that has lost a class since it was first seen (a state class such as "pm-suggest") is still the
  // same button: widen the remembered selector instead of adding a second entry.
  if ( classes.length ) {
    const wider = known.find(e => (e.action === action) && (e.palette === palette) && !e.nth && Array.isArray(e.classes)
      && (e.classes.length > classes.length) && classes.every(c => e.classes.includes(c)));
    if ( wider ) {
      wider.classes = classes;
      wider.selector = base;
      return true;
    }
  }

  // Two buttons that look alike in the same column (Item Piles' lock and open buttons share an action and class)
  // are told apart by their order among themselves.
  let selector = base;
  let nth = null;
  const alike = [...col.children].filter(c => safeMatches(c, base));
  if ( alike.length > 1 ) {
    nth = alike.indexOf(el) + 1;
    selector = `${base}:nth-child(${nth} of ${base})`;
    if ( !isValidSelector(selector) ) return false;
  }

  known.push({
    id: `module:${selector}`,
    selector,
    action,
    palette,
    classes,
    nth,
    label: labelOf(el),
    icon: iconOf(el),
    img: el.querySelector(":scope > img")?.getAttribute("src") || null,
    module: guessModule(el, classes),
    side: sideOf(col)
  });
  return true;
}

/** Which side of the HUD a column is on: "left", "right", or null for the middle. */
export function sideOf(col) {
  if ( col?.classList.contains("left") ) return "left";
  if ( col?.classList.contains("right") ) return "right";
  return null;
}

function safeMatches(el, selector) {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

/** The text a user sees for a button: its tooltip, accessible label or title. */
function labelOf(el) {
  const raw = el.dataset.tooltipText || el.dataset.tooltip || el.getAttribute("aria-label")
    || el.dataset.fastTooltip || el.getAttribute("title") || el.querySelector("[aria-label]")?.getAttribute("aria-label")
    || el.querySelector("[data-tooltip]")?.dataset.tooltip || "";
  let text = raw ? game.i18n.localize(raw) : "";
  if ( text.includes("<") ) {
    const div = document.createElement("div");
    div.innerHTML = text;
    text = div.textContent ?? "";
  }
  text = text.replace(/\s+/g, " ").trim();
  if ( !text && el.dataset.action ) text = humanize(el.dataset.action);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function humanize(word) {
  return word.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").replace(/^./, c => c.toUpperCase());
}

/** The button's icon classes, so the settings list can show the same icon. */
function iconOf(el) {
  const icon = el.querySelector("i");
  if ( !icon ) return null;
  return [...icon.classList].filter(c => c !== "inert").join(" ") || null;
}

/**
 * Which module added a button: one whose id the button's classes start with, or whose files the button's
 * images use, or whose stylesheet styles the button's classes.
 */
function guessModule(el, classes) {
  const modules = [...game.modules.values()].filter(m => m.active && (m.id !== MODULE_ID))
    .sort((a, b) => b.id.length - a.id.length);
  const nodes = [el, ...el.querySelectorAll("*")];
  const tokens = nodes.flatMap(n => [n.id, ...n.classList]).concat(el.dataset.action ?? "").filter(Boolean);
  for ( const m of modules ) {
    if ( tokens.some(t => (t === m.id) || t.startsWith(`${m.id}-`) || t.startsWith(`${m.id}_`)) ) return m.id;
  }

  const urls = [];
  for ( const n of nodes ) {
    const src = n.getAttribute?.("src");
    if ( src ) urls.push(src);
    for ( const pseudo of [null, "::before", "::after"] ) {
      const style = getComputedStyle(n, pseudo);
      for ( const value of [style.backgroundImage, style.maskImage, style.webkitMaskImage] ) {
        if ( value && (value !== "none") ) urls.push(value);
      }
    }
  }
  for ( const m of modules ) {
    if ( urls.some(u => u.includes(`modules/${m.id}/`)) ) return m.id;
  }

  classOwners ??= readStylesheetClassOwners();
  const allClasses = nodes.flatMap(n => [...n.classList]).filter(c => !GENERIC_CLASSES.has(c) && !c.startsWith("fa-"));
  for ( const c of [...classes, ...allClasses] ) {
    const owner = classOwners.get(c);
    if ( owner && (owner !== MODULE_ID) && game.modules.get(owner)?.active ) return owner;
  }
  return null;
}

/** Map each class name to the first module whose stylesheet mentions it. */
function readStylesheetClassOwners() {
  const owners = new Map();
  const moduleOf = href => href?.match(/\/modules\/([^/]+)\//)?.[1] ?? null;
  const visitSheet = (sheet, inherited) => {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      return;
    }
    visitRules(rules, moduleOf(sheet.href) ?? inherited);
  };
  const visitRules = (rules, owner) => {
    for ( const rule of rules ?? [] ) {
      if ( rule.styleSheet ) visitSheet(rule.styleSheet, null);
      else if ( rule.cssRules?.length ) visitRules(rule.cssRules, owner);
      if ( !owner || !rule.selectorText ) continue;
      for ( const match of rule.selectorText.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g) ) {
        if ( !owners.has(match[1]) ) owners.set(match[1], owner);
      }
    }
  };
  for ( const sheet of document.styleSheets ) visitSheet(sheet, null);
  return owners;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    game.settings.set(MODULE_ID, SETTINGS.knownButtons, known.map(e => ({ ...e })))
      .catch(err => console.error(`${MODULE_ID} | Could not save the list of Token HUD buttons`, err));
  }, 1500);
}

/* -------------------------------------------- */
/*  For the settings window                     */
/* -------------------------------------------- */

function allEntries() {
  return [...CORE_BUTTONS, ...OWN_BUTTONS, ...known];
}

/**
 * Every button this user can choose from, grouped by where it comes from.
 * @param {Set<string>} hiddenIds   The hidden buttons to show as unticked.
 * @returns {{title: string, entries: object[]}[]}
 */
export function buttonGroups(hiddenIds) {
  const entry = (e, extra = {}) => ({ id: e.id, shown: !hiddenIds.has(e.id), icon: e.icon ?? null, img: e.img ?? null,
    ...extra });
  const groups = [];

  const isGM = game.user.isGM;
  groups.push({
    title: loc("Buttons.CoreGroup"),
    entries: CORE_BUTTONS.filter(e => isGM || !e.gmOnly).map(e => entry(e, {
      label: loc(`Buttons.${e.label}`),
      img: (e.id === "core.effects") ? (CONFIG.controlIcons?.effects ?? null) : null
    }))
  });

  groups.push({
    title: game.modules.get(MODULE_ID)?.title ?? "Primal HUD",
    entries: OWN_BUTTONS.map(e => entry(e, { label: loc(e.label) }))
  });

  const byModule = new Map();
  for ( const e of known ) {
    const key = e.module ?? "";
    if ( !byModule.has(key) ) byModule.set(key, []);
    byModule.get(key).push(entry(e, { label: e.label || loc("Buttons.Unnamed"), canForget: true }));
  }
  const moduleGroups = [...byModule.entries()].map(([id, entries]) => ({
    id,
    title: id ? (game.modules.get(id)?.title ?? id) : loc("Buttons.OtherGroup"),
    entries
  }));
  moduleGroups.sort((a, b) => (!a.id - !b.id) || a.title.localeCompare(b.title, game.i18n.lang));
  groups.push(...moduleGroups);
  return groups;
}

/**
 * The buttons that can be moved between the HUD's left and right columns: Foundry's own (without the GM-only ones
 * for players) in Foundry's order, then other modules' buttons that have been seen in a side column.
 * @returns {{id: string, label: string, icon: string|null, img: string|null, source: string, side: string}[]}
 */
export function arrangeableButtons() {
  const isGM = game.user.isGM;
  const core = CORE_BUTTONS.filter(e => isGM || !e.gmOnly).map(e => ({
    id: e.id, label: loc(`Buttons.${e.label}`), icon: e.icon ?? null, source: loc("Buttons.CoreGroup"), side: e.side,
    img: (e.id === "core.effects") ? (CONFIG.controlIcons?.effects ?? null) : null
  }));
  const modules = known.filter(e => (e.side === "left") || (e.side === "right")).map(e => ({
    id: e.id, label: e.label || loc("Buttons.Unnamed"), icon: e.icon ?? null, img: e.img ?? null, side: e.side,
    source: e.module ? (game.modules.get(e.module)?.title ?? e.module) : loc("Buttons.OtherGroup")
  }));
  return [...core, ...modules];
}

/** Every recognisable button's id and selector: Foundry's first, then other modules'. */
export function buttonSelectors() {
  return [...CORE_BUTTONS, ...known].map(e => [e.id, e.selector]);
}

/** The ids of the hidden buttons. */
export function getHiddenIds() {
  return new Set(hidden);
}

/**
 * Save which buttons are hidden, and drop any forgotten buttons from the list of buttons seen.
 * @param {Set<string>} hiddenIds
 * @param {Set<string>} [forgotten]
 */
export async function saveButtonChoices(hiddenIds, forgotten = new Set()) {
  if ( forgotten.size ) {
    known = known.filter(e => !forgotten.has(e.id));
    clearTimeout(saveTimer);
    saveTimer = null;
    await game.settings.set(MODULE_ID, SETTINGS.knownButtons, known.map(e => ({ ...e })));
  }
  const ids = [...hiddenIds].filter(id => !forgotten.has(id));
  await game.settings.set(MODULE_ID, SETTINGS.hiddenButtons, ids);
}
