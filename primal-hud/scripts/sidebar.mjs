/**
 * A panel to the left of the Token HUD with three tabs:
 * - Favorites: the actor's dnd5e favorites (the sheet's bookmarked items, activities, effects, skills, tools and
 *   spell slots), usable with a click just as on the character sheet.
 * - Spells: every spell ready to cast, grouped like the sheet's spellbook, with the actor's spell slots shown as a
 *   compact strip of pips at the top.
 * - Saves & Skills: the actor's saving throws, skills and tools, each rolled with a click.
 *
 * Clicking a row does what clicking it on the character sheet does (Item#use, Activity#use, toggle an effect, roll a
 * skill or tool), so Midi-QOL and other automation still apply. Right-clicking opens the item's sheet.
 */
import { MODULE_ID, SETTINGS, loc } from "./constants.mjs";
import { SIDEBAR_ID, isButtonShown } from "./buttons.mjs";

/** The last panel built, re-shown at once when the HUD re-renders so it doesn't flicker while being rebuilt. */
let lastPanel = null;
let buildCount = 0;
let lastBuildAt = 0;
let refreshTimer = null;

/** Scroll positions of each actor's lists, so a rebuild (after casting, say) doesn't jump back to the top. */
const scrollPositions = new Map();

const TOOLTIP_CLASS = "dnd5e2 dnd5e-tooltip item-tooltip document-tooltip";

/** The on-screen scale of the panel at the default 100% size (its stylesheet sizes are drawn at twice that). */
const BASE_SCALE = 0.5;

export function registerSidebar() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
  Hooks.on("closeTokenHUD", () => {
    buildCount++;
  });
  // The HUD is scaled with the canvas zoom (and by HUD scaler modules); keep the panel the same size on screen.
  Hooks.on("canvasPan", () => onSidebarScaleChanged());
  // Uses, slots, quantities and preparation change on the actor and its items; refresh the open panel to match.
  Hooks.on("updateActor", actor => queueRefresh(actor));
  for ( const hook of ["createItem", "updateItem", "deleteItem"] ) Hooks.on(hook, item => queueRefresh(item.parent));
  for ( const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"] ) {
    Hooks.on(hook, effect => queueRefresh(effect.parent?.documentName === "Item" ? effect.parent.parent : effect.parent));
  }
}

/* -------------------------------------------- */
/*  Rendering                                   */
/* -------------------------------------------- */

function onRenderTokenHUD(hud, html) {
  const root = (html instanceof HTMLElement) ? html : (html?.[0] ?? hud.element);
  if ( !root ) return;
  root.querySelectorAll(":scope > .primal-hud-sidebar").forEach(el => el.remove());
  const actor = hud.actor;
  // The panel reads dnd5e's data, so it only appears in dnd5e worlds.
  if ( !CONFIG.DND5E || !actor?.isOwner || !isButtonShown(SIDEBAR_ID) ) {
    buildCount++;
    return;
  }
  watchHudScale(root);
  if ( lastPanel && (lastPanel.dataset.actorUuid === actor.uuid) ) {
    root.append(lastPanel);
    applyUnzoom(lastPanel, root);
    restoreScroll(lastPanel, actor);
  }
  buildPanel(hud, root, actor);
}

function queueRefresh(actor) {
  const hud = canvas?.tokens?.hud;
  if ( !actor || !hud?.rendered || (hud.actor?.uuid !== actor.uuid) ) return;
  clearTimeout(refreshTimer);
  const queuedAt = performance.now();
  refreshTimer = setTimeout(() => {
    // Changes to the actor usually re-render the HUD, which rebuilds the panel already.
    if ( lastBuildAt > queuedAt ) return;
    if ( hud.rendered && (hud.actor?.uuid === actor.uuid) && isButtonShown(SIDEBAR_ID) ) {
      buildPanel(hud, hud.element, hud.actor);
    }
  }, 50);
}

async function buildPanel(hud, root, actor) {
  const build = ++buildCount;
  lastBuildAt = performance.now();
  let data;
  try {
    data = { favorites: await collectFavorites(actor), ...collectSpells(actor), checks: collectChecks(actor) };
  } catch (err) {
    console.error(`${MODULE_ID} | Could not read favorites and spells for ${actor.name}`, err);
    return;
  }
  if ( (build !== buildCount) || !hud.rendered || (hud.actor?.uuid !== actor.uuid) || !root.isConnected ) return;

  const old = root.querySelector(":scope > .primal-hud-sidebar");
  const hasChecks = !!(data.checks.saves.length || data.checks.skills.length || data.checks.tools.length);
  if ( !data.favorites.length && !data.sections.length && !hasChecks ) {
    old?.remove();
    lastPanel = null;
    return;
  }
  const panel = renderPanel(actor, data);
  if ( old ) old.replaceWith(panel);
  else root.append(panel);
  applyUnzoom(panel, root);
  restoreScroll(panel, actor);
  lastPanel = panel;
}

/** Build the panel's elements. */
function renderPanel(actor, { favorites, sections, slots, checks }) {
  const tabs = [];
  if ( favorites.length ) tabs.push({ id: "favorites", icon: "fa-solid fa-bookmark", label: loc("Sidebar.Favorites") });
  if ( sections.length ) tabs.push({ id: "spells", icon: "fa-solid fa-wand-sparkles", label: loc("Sidebar.Spells") });
  const hasChecks = !!(checks.saves.length || checks.skills.length || checks.tools.length);
  if ( hasChecks ) tabs.push({ id: "checks", icon: "fa-solid fa-dice-d20", label: loc("Sidebar.Checks") });
  const saved = game.settings.get(MODULE_ID, SETTINGS.sidebarTab);
  const active = tabs.find(t => t.id === saved)?.id ?? tabs[0].id;
  const collapsed = !!game.settings.get(MODULE_ID, SETTINGS.sidebarCollapsed);

  const panel = make("section", { class: ["primal-hud-sidebar", collapsed ? "collapsed" : null] });
  panel.dataset.actorUuid = actor.uuid;
  panel.dataset.tab = active;
  // Keep focus on the canvas, so keyboard token movement keeps working after a click in the panel.
  panel.addEventListener("mousedown", event => {
    if ( event.target.closest("input") ) return;
    event.preventDefault();
  });

  // Tabs, and a button to fold the panel away. With three tabs only the open one shows its name; the others show
  // their icon, with the name as a tooltip.
  const compact = tabs.length > 2;
  const nav = make("nav", { class: ["phs-tabs", compact ? "compact" : null] });
  for ( const tab of tabs ) {
    const button = make("button", { class: ["phs-tab", tab.id === active ? "active" : null], attrs: { type: "button" } }, [
      make("i", { class: tab.icon, attrs: { inert: "" } }),
      make("span", { text: tab.label })
    ]);
    button.dataset.tab = tab.id;
    if ( compact ) {
      button.setAttribute("aria-label", tab.label);
      button.dataset.tooltip = "";
    }
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      panel.dataset.tab = tab.id;
      nav.querySelectorAll(".phs-tab").forEach(b => b.classList.toggle("active", b === button));
      if ( panel.classList.contains("collapsed") ) setCollapsed(panel, false);
      game.settings.set(MODULE_ID, SETTINGS.sidebarTab, tab.id);
    });
    nav.append(button);
  }
  const fold = make("button", { class: "phs-fold", attrs: { type: "button", "data-tooltip": "" } }, [
    make("i", { class: "fa-solid fa-chevron-up", attrs: { inert: "" } })
  ]);
  fold.setAttribute("aria-label", loc(collapsed ? "Sidebar.Expand" : "Sidebar.Collapse"));
  fold.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    setCollapsed(panel, !panel.classList.contains("collapsed"));
  });
  nav.append(fold);
  panel.append(nav);

  // Favorites
  if ( favorites.length ) {
    const list = make("ol", { class: "phs-list phs-favorites" });
    list.dataset.tab = "favorites";
    for ( const entry of favorites ) list.append(renderRow(actor, entry));
    panel.append(list);
  }

  // Spells: a strip of slot pips, then the spells by section
  if ( sections.length ) {
    const body = make("div", { class: "phs-list phs-spells" });
    body.dataset.tab = "spells";
    if ( slots.length ) body.append(renderSlots(slots));
    for ( const section of sections ) {
      body.append(make("h4", { class: "phs-section", text: section.label }));
      const list = make("ol", { class: "phs-section-list" });
      for ( const entry of section.spells ) list.append(renderRow(actor, entry));
      body.append(list);
    }
    panel.append(body);
  }

  // Saves & Skills
  if ( hasChecks ) panel.append(renderChecks(actor, checks));

  for ( const list of panel.querySelectorAll(".phs-list") ) {
    list.addEventListener("scroll", () => scrollPositions.set(`${actor.uuid}:${list.dataset.tab}`, list.scrollTop),
      { passive: true });
  }
  return panel;
}

function setCollapsed(panel, collapsed) {
  panel.classList.toggle("collapsed", collapsed);
  panel.querySelector(".phs-fold")?.setAttribute("aria-label", loc(collapsed ? "Sidebar.Expand" : "Sidebar.Collapse"));
  game.settings.set(MODULE_ID, SETTINGS.sidebarCollapsed, collapsed);
}

/** Re-apply the panel's size, after a zoom, a change to the panel size setting or a HUD scaler moving the HUD. */
export function onSidebarScaleChanged() {
  const panel = document.querySelector("#token-hud > .primal-hud-sidebar");
  if ( panel ) applyUnzoom(panel, panel.parentElement);
}

/**
 * Foundry scales the whole HUD layer with the canvas zoom, and HUD scaler modules (such as Illandril's Token HUD
 * scaler) scale the Token HUD again, some of them a moment after a zoom. Watch both for changes to their style, so
 * the panel is resized whenever either one is.
 */
const scaleObserver = new MutationObserver(() => onSidebarScaleChanged());
function watchHudScale(root) {
  const options = { attributes: true, attributeFilter: ["style", "class"] };
  scaleObserver.observe(root, options);
  const layer = document.getElementById("hud");
  if ( layer ) scaleObserver.observe(layer, options);
}

/**
 * Undo however much the Token HUD is scaled on screen (canvas zoom, and any HUD scaler module on top), measured
 * rather than assumed, and apply the panel size setting instead.
 */
function applyUnzoom(panel, root) {
  let size = Number(game.settings.get(MODULE_ID, SETTINGS.sidebarSize));
  if ( !Number.isFinite(size) || (size <= 0) ) size = 100;
  const scale = BASE_SCALE * (size / 100) / hudScale(root);
  const value = String(scale);
  if ( panel.style.getPropertyValue("--primal-hud-panel-scale") !== value ) {
    panel.style.setProperty("--primal-hud-panel-scale", value);
  }
}

/** How much the Token HUD is scaled on screen: its drawn width over its own width. */
function hudScale(root) {
  const width = root?.offsetWidth;
  if ( width > 0 ) {
    const scale = root.getBoundingClientRect().width / width;
    if ( Number.isFinite(scale) && (scale > 0) ) return scale;
  }
  const zoom = canvas?.stage?.scale?.x;
  return (zoom > 0) ? zoom : 1;
}

function restoreScroll(panel, actor) {
  for ( const list of panel.querySelectorAll(".phs-list") ) {
    const top = scrollPositions.get(`${actor.uuid}:${list.dataset.tab}`);
    if ( top ) list.scrollTop = top;
  }
}

/** One favorite or spell. */
function renderRow(actor, entry) {
  const row = make("li", { class: ["phs-row", `phs-kind-${entry.kind}`, entry.usable ? "usable" : null,
    entry.suppressed ? "suppressed" : null, entry.toggle === false ? "disabled" : null] });
  if ( entry.tooltipUuid ) {
    row.dataset.tooltipHtml = `<section class="loading" data-uuid="${entry.tooltipUuid}">`
      + `<i class="fas fa-spinner fa-spin-pulse" inert></i></section>`;
    row.dataset.tooltipClass = TOOLTIP_CLASS;
    row.dataset.tooltipDirection = "LEFT";
  }
  else if ( entry.tooltipText ) {
    row.dataset.tooltipText = entry.tooltipText;
    row.dataset.tooltipDirection = "LEFT";
  }

  const img = make("img", { class: "phs-img", attrs: { alt: "" } });
  img.src = entry.img || "icons/svg/item-bag.svg";
  row.append(img);

  const name = make("div", { class: "phs-name" }, [make("span", { class: "phs-title", text: entry.title })]);
  if ( entry.subtitle ) name.append(make("span", { class: "phs-subtitle", text: entry.subtitle }));
  row.append(name);

  const tags = [];
  if ( entry.concentration ) tags.push(make("span", { class: "phs-tag", text: loc("Sidebar.ConcentrationShort"),
    attrs: { "data-tooltip-text": loc("Sidebar.Concentration") } }));
  if ( entry.ritual ) tags.push(make("span", { class: "phs-tag", text: loc("Sidebar.RitualShort"),
    attrs: { "data-tooltip-text": loc("Sidebar.Ritual") } }));
  const info = infoOf(entry);
  if ( tags.length || info ) row.append(make("div", { class: "phs-info" }, [...tags, ...(info ? [info] : [])]));

  if ( entry.usable ) {
    row.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      useEntry(actor, entry, event);
    });
  }
  if ( entry.sheetDocument ) {
    row.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      entry.sheetDocument.sheet?.render(true);
    });
  }
  return row;
}

/** The value at the right of a row, in the same order of preference as the sheet. */
function infoOf(entry) {
  if ( entry.uses?.max ) {
    return make("span", { class: "phs-uses", text: `${Math.round(entry.uses.value ?? 0)}/${entry.uses.max}` });
  }
  if ( (entry.modifier !== undefined) && (entry.modifier !== null) && (entry.modifier !== "") ) {
    const n = Number(String(entry.modifier).replace(/\s+/g, ""));
    const text = Number.isFinite(n) ? signed(n) : String(entry.modifier);
    return make("span", { class: "phs-mod", text: entry.passive ? `${text} (${entry.passive})` : text });
  }
  if ( entry.save?.dc ) return make("span", { class: "phs-save", text: `${entry.save.ability} ${entry.save.dc}` });
  if ( (entry.value !== undefined) && (entry.value !== null) && (entry.value !== "") ) {
    return make("span", { class: "phs-value", text: String(entry.value) });
  }
  if ( entry.quantity > 1 ) return make("span", { class: "phs-qty", text: `×${entry.quantity}` });
  if ( typeof entry.toggle === "boolean" ) {
    return make("i", { class: `phs-toggle fa-solid fa-toggle-${entry.toggle ? "on" : "off"}`, attrs: { inert: "" } });
  }
  return null;
}

/**
 * The spell points of an actor that uses Primal Spell Points, or null.
 * @returns {{value: number, max: number, maxLevel: number, highUsed: number[], limit: boolean}|null}
 */
function spellPointsOf(actor) {
  const module = game.modules?.get?.("primal-spell-points");
  if ( !module?.active || (typeof module.api?.getSpellPoints !== "function") ) return null;
  try {
    const state = module.api.getSpellPoints(actor);
    if ( !state ) return null;
    let limit = true;
    try { limit = game.settings.get("primal-spell-points", "highLevelLimit") !== false; }
    catch { /* Older versions had no setting. */ }
    return { ...state, limit };
  } catch(err) {
    console.warn(`${MODULE_ID} | Could not read spell points for ${actor?.name}`, err);
    return null;
  }
}

/** Chips for a spell point caster: the pool, then 6th level and up (once per long rest each). */
function spellPointChips(points, config) {
  const chips = [{
    key: "spellPoints", level: 0, value: Number(points.value) || 0, max: Number(points.max) || 0, order: -1,
    short: loc("Sidebar.SpellPointsShort"), label: loc("Sidebar.SpellPoints"), count: true
  }];
  if ( !points.limit ) return chips;
  const used = new Set((points.highUsed ?? []).map(Number));
  for ( let level = 6; level <= (Number(points.maxLevel) || 0); level++ ) {
    const name = config?.getLabel?.({ level }) ?? String(level);
    chips.push({
      key: `spellPoints${level}`, level, value: used.has(level) ? 0 : 1, max: 1, order: -1,
      short: String(level), label: loc("Sidebar.HighLevel", { level: name })
    });
  }
  return chips;
}

/** The slot strip: one chip per slot level with a pip per slot. */
function renderSlots(slots) {
  const strip = make("div", { class: "phs-slots" });
  for ( const slot of slots ) {
    const chip = make("span", { class: ["phs-slot", slot.value > 0 ? null : "empty"],
      attrs: { "data-tooltip-text": loc("Sidebar.SlotTooltip", { label: slot.label, value: slot.value, max: slot.max }) } });
    chip.dataset.slot = slot.key;
    chip.append(make("span", { class: "phs-slot-label", text: slot.short }));
    if ( slot.count || (Math.max(slot.max, slot.value) > 6) ) {
      chip.append(make("span", { class: "phs-slot-count", text: `${slot.value}/${slot.max}` }));
    }
    else {
      const pips = make("span", { class: "phs-pips" });
      for ( let n = 1; n <= Math.max(slot.max, slot.value); n++ ) {
        pips.append(make("span", { class: ["phs-pip", slot.value >= n ? "filled" : null, n > slot.max ? "temp" : null] }));
      }
      chip.append(pips);
    }
    strip.append(chip);
  }
  return strip;
}

/** The Saves & Skills tab: a grid of saving throws, then skills and tools as one-line rows. */
function renderChecks(actor, { saves, skills, tools }) {
  const body = make("div", { class: "phs-list phs-checks" });
  body.dataset.tab = "checks";
  const roll = (el, fn) => el.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    rollCheck(actor, event, fn);
  });

  if ( saves.length ) {
    body.append(make("h4", { class: "phs-section", text: loc("Sidebar.Saves") }));
    const grid = make("div", { class: "phs-saves" });
    for ( const save of saves ) {
      const cell = make("button", { class: "phs-save-cell", attrs: { type: "button", "data-tooltip-text": save.tooltip } }, [
        profMark(save.prof),
        make("span", { class: "phs-save-label", text: save.abbreviation }),
        make("span", { class: "phs-check-mod", text: signed(save.mod) })
      ]);
      cell.dataset.ability = save.key;
      roll(cell, event => actor.rollSavingThrow({ event, ability: save.key }));
      grid.append(cell);
    }
    body.append(grid);
  }

  const rows = (label, entries, kind, fn) => {
    if ( !entries.length ) return;
    body.append(make("h4", { class: "phs-section", text: label }));
    const list = make("ol", { class: "phs-section-list" });
    for ( const entry of entries ) {
      const row = make("li", { class: ["phs-check", `phs-check-${kind}`],
        attrs: { "data-tooltip-text": entry.tooltip, "data-tooltip-direction": "LEFT" } }, [
        profMark(entry.prof),
        make("span", { class: "phs-check-label", text: entry.label }),
        make("span", { class: "phs-check-ability", text: entry.abbreviation }),
        make("span", { class: "phs-check-mod", text: signed(entry.mod) }),
        make("span", { class: "phs-check-passive", text: Number.isFinite(entry.passive) ? String(entry.passive) : "" })
      ]);
      row.dataset.key = entry.key;
      roll(row, event => fn(event, entry.key));
      list.append(row);
    }
    body.append(list);
  };
  rows(loc("Sidebar.Skills"), skills, "skill", (event, skill) => actor.rollSkill({ event, skill }));
  rows(loc("Sidebar.Tools"), tools, "tool", (event, tool) => actor.rollToolCheck({ event, tool }));
  return body;
}

/** A dot showing proficiency: empty, half, full, or ringed for expertise. */
function profMark(level) {
  const css = { 0.5: "half", 1: "full", 2: "expert" }[level] ?? "none";
  const label = CONFIG.DND5E.proficiencyLevels?.[level] ?? "";
  return make("span", { class: ["phs-prof", css], attrs: { "aria-label": label } });
}

function signed(n) {
  const value = Number(n);
  if ( !Number.isFinite(value) ) return "";
  return `${value >= 0 ? "+" : "\u2212"}${Math.abs(value)}`;
}

async function rollCheck(actor, event, fn) {
  try {
    await fn(event);
  } catch (err) {
    console.error(`${MODULE_ID} | Could not roll for ${actor.name}`, err);
    ui.notifications?.error(loc("Sidebar.RollFailed"));
  }
}

/* -------------------------------------------- */
/*  Using things                                */
/* -------------------------------------------- */

async function useEntry(actor, entry, event) {
  try {
    switch ( entry.kind ) {
      case "item":
      case "spell": {
        const item = entry.document;
        if ( item.type === "container" ) return item.sheet?.render(true);
        return await item.use({ event });
      }
      case "activity":
        if ( entry.document.canUse === false ) return;
        return await entry.document.use({ event });
      case "effect":
        return await entry.document.update({ disabled: !entry.document.disabled });
      case "skill":
        return await actor.rollSkill({ event, skill: entry.key });
      case "tool":
        return await actor.rollToolCheck({ event, tool: entry.key });
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Could not use ${entry.title}`, err);
    ui.notifications?.error(loc("Sidebar.UseFailed", { name: entry.title }));
  }
}

/* -------------------------------------------- */
/*  Favorites                                   */
/* -------------------------------------------- */

/**
 * The actor's favorites, in the sheet's order, with legacy resources first as on the sheet.
 * @param {Actor} actor
 * @returns {Promise<object[]>}
 */
export async function collectFavorites(actor) {
  const system = actor.system ?? {};
  const entries = [];

  for ( const [key, resource] of Object.entries(system.resources ?? {}) ) {
    if ( !resource?.label || !resource?.max ) continue;
    entries.push({
      kind: "resource", id: `resources.${key}`, sort: -Infinity, img: "icons/svg/upgrade.svg", title: resource.label,
      subtitle: [resource.sr ? localizeSystem("DND5E.AbbreviationSR") : null,
        resource.lr ? localizeSystem("DND5E.AbbreviationLR") : null].filter(Boolean).join(" • "),
      uses: { value: resource.value, max: resource.max }
    });
  }

  const favorites = Array.isArray(system.favorites) ? [...system.favorites] : [];
  favorites.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  for ( const favorite of favorites ) {
    try {
      const entry = await favoriteEntry(actor, favorite);
      if ( entry ) entries.push(entry);
    } catch (err) {
      console.warn(`${MODULE_ID} | Skipped favorite ${favorite?.id}`, err);
    }
  }
  return entries;
}

async function favoriteEntry(actor, { id, type, sort }) {
  const hidden = actor.hiddenItems;
  const isHidden = itemId => !!itemId && (typeof hidden?.has === "function") && hidden.has(itemId);

  if ( ["item", "effect", "activity"].includes(type) ) {
    const doc = await fromUuid(id, { relative: actor });
    if ( !doc || (doc.dependentOrigin?.active === false) ) return null;
    const item = (type === "item") ? doc : (type === "activity") ? doc.item
      : (doc.parent?.documentName === "Item" ? doc.parent : null);
    if ( isHidden(item?.id) ) return null;
    const data = (type === "item") ? await doc.system?.getFavoriteData?.() : await doc.getFavoriteData?.();
    if ( !data ) return null;
    return {
      ...favoriteData(data),
      kind: type, id, sort, document: doc,
      usable: (type !== "activity") || (doc.canUse !== false),
      tooltipUuid: item?.uuid ?? ((type === "effect") ? doc.uuid : null),
      sheetDocument: (type === "effect") ? doc : item,
      concentration: (type === "item") && hasProperty(doc, "concentration"),
      ritual: (type === "item") && hasProperty(doc, "ritual")
    };
  }

  if ( (type === "skill") || (type === "tool") ) {
    const data = actor.system?.[`${type}s`]?.[id];
    if ( !data ) return null;
    let img;
    let title;
    if ( type === "tool" ) {
      const Trait = globalThis.dnd5e?.documents?.Trait;
      const reference = Trait?.getBaseItemUUID?.(CONFIG.DND5E.tools?.[id]?.id ?? "");
      ({ img, name: title } = (reference && Trait?.getBaseItem?.(reference, { indexOnly: true })) || {});
    }
    else ({ icon: img, label: title } = CONFIG.DND5E.skills?.[id] ?? {});
    const ability = CONFIG.DND5E.abilities?.[data.ability]?.label;
    return {
      kind: type, id, key: id, sort, usable: true,
      img: img || "icons/svg/d20-black.svg",
      title: title || id,
      subtitle: ability ? localizeSystem("DND5E.AbilityPromptTitle", { ability }) : "",
      modifier: data.total, passive: data.passive
    };
  }

  if ( type === "slots" ) {
    const slot = actor.system?.spells?.[id];
    if ( !slot ) return null;
    // Named and pictured as on the sheet
    const model = CONFIG.DND5E.spellcasting?.[slot.type];
    const rest = localizeSystem(`DND5E.Abbreviation${model?.isSR ? "SR" : "LR"}`);
    const uses = { value: slot.value ?? 0, max: slot.override ?? slot.max ?? 0 };
    if ( !model || model.isSingleLevel ) {
      return {
        kind: "slots", id, sort, usable: false, uses,
        title: localizeSystem(`DND5E.SpellSlots${id.charAt(0).toUpperCase()}${id.slice(1)}`),
        subtitle: [localizeSystem(`DND5E.SpellLevel${slot.level}`), rest].join(" \u2022 "),
        img: model?.img || CONFIG.DND5E.spellcasting?.pact?.img
      };
    }
    const plural = new Intl.PluralRules(game.i18n.lang, { type: "ordinal" }).select(slot.level);
    return {
      kind: "slots", id, sort, usable: false, uses,
      title: localizeSystem(`DND5E.SpellSlotsN.${plural}`, { n: slot.level }),
      subtitle: rest,
      img: model.img?.replace("{id}", id)
    };
  }
  return null;
}

/** Tidy the data a document gives for its favorite. */
function favoriteData(data) {
  let { img, title, subtitle, uses, quantity, modifier, passive, save, value, toggle, suppressed } = data;
  let saveInfo = null;
  if ( save?.dc?.value ) {
    const abilities = save.ability;
    let ability = "";
    if ( abilities instanceof Set ) {
      ability = abilities.size > 2 ? localizeSystem("DND5E.AbbreviationDC")
        : [...abilities].map(k => CONFIG.DND5E.abilities?.[k]?.abbreviation ?? k).join(" / ");
    }
    else if ( typeof abilities === "string" ) ability = CONFIG.DND5E.abilities?.[abilities]?.abbreviation ?? abilities;
    saveInfo = { ability: ability.toUpperCase(), dc: save.dc.value };
  }
  return {
    img, title: plainText(title),
    subtitle: suppressed ? localizeSystem("DND5E.Suppressed") : plainText(subtitle),
    uses: uses?.max ? { value: uses.value, max: uses.max } : null,
    quantity, modifier, passive, value, toggle, suppressed,
    save: saveInfo
  };
}

/* -------------------------------------------- */
/*  Spells                                      */
/* -------------------------------------------- */

/**
 * The spells ready to cast, grouped like the character sheet's spellbook, and the actor's spell slots.
 * Leveled spells that must be prepared but aren't are left out.
 * @param {Actor} actor
 * @returns {{sections: object[], slots: object[]}}
 */
export function collectSpells(actor) {
  const methods = CONFIG.DND5E?.spellcasting ?? {};
  const sections = new Map();
  const slots = [];
  // A Primal Spell Points caster's leveled slots only say which levels it can afford: show its points instead.
  const points = spellPointsOf(actor);

  const register = (key, level, config) => {
    if ( sections.has(key) ) return;
    level = config?.slots ? level : 1;
    const label = config?.getLabel?.({ level }) ?? localizeSystem("DND5E.CAST.SECTIONS.Spellbook");
    const order = level === 0 ? 0 : (config?.order ?? 1000);
    sections.set(key, { key, label, order, level: level ?? 0, spells: [] });
  };

  // Sections and slots for the spellcasting this actor has, in the sheet's order
  for ( const config of Object.values(methods) ) {
    const levels = config?.getAvailableLevels?.(actor) ?? [];
    if ( !levels.length ) continue;
    if ( config.cantrips ) register("spell0", 0, methods.spell);
    for ( const level of levels ) {
      const key = config.getSpellSlotKey(level);
      register(key, level, config);
      const slot = actor.system?.spells?.[key];
      if ( points && (slot?.type === "spell") ) continue;
      const max = Number(slot?.override ?? slot?.max ?? 0);
      const value = Number(slot?.value ?? 0);
      if ( !max && !value ) continue;
      // Pact slots show as "P3" (the method's initial and the slots' level), other slots as their level.
      const initial = config.isSingleLevel ? (String(config.label ?? "").trim().charAt(0).toUpperCase()) : "";
      slots.push({
        key, level, value, max, order: config.order ?? 1000,
        short: `${initial}${level}`,
        label: config.getLabel?.({ level }) ?? key
      });
    }
  }

  if ( points ) slots.push(...spellPointChips(points, methods.spell));

  const hidden = actor.hiddenItems;
  const spells = (actor.items?.contents ?? [...(actor.items ?? [])]).filter(i => i.type === "spell");
  spells.sort((a, b) => ((a.system.level ?? 0) - (b.system.level ?? 0)) || a.name.localeCompare(b.name, game.i18n.lang));
  for ( const spell of spells ) {
    const system = spell.system;
    if ( (typeof hidden?.has === "function") && hidden.has(spell.id) ) continue;
    const origin = spell.dependentOrigin;
    if ( (origin?.active === false) && (origin.parent !== spell) ) continue;
    // Spells cast from an item (a wand, a scroll) don't need preparing
    const fromItem = !!spell.getFlag?.("dnd5e", "cachedFor");
    const canPrepare = system.canPrepare ?? !!methods[system.method]?.prepares;
    if ( !fromItem && (system.level > 0) && canPrepare && (Number(system.prepared) === 0) ) continue;

    let method = system.method;
    if ( !(method in methods) ) method = "innate";
    const config = methods[method];
    const level = (config?.isSingleLevel && (system.level !== 0)) ? null : (system.level || 0);
    let key = config?.getSpellSlotKey?.(level) ?? method;

    if ( fromItem ) {
      if ( !system.linkedActivity?.displayInSpellbook ) continue;
      key = "item";
      register(key);
    }
    else register(key, level, config);

    sections.get(key).spells.push({
      kind: "spell", id: spell.id, document: spell, sheetDocument: spell, usable: true,
      img: spell.img, title: spell.name,
      subtitle: [spell.labels?.activation, spell.labels?.range].filter(Boolean).join(" • "),
      uses: system.uses?.max ? { value: system.uses.value, max: system.uses.max } : null,
      concentration: hasProperty(spell, "concentration"),
      ritual: hasProperty(spell, "ritual"),
      tooltipUuid: spell.uuid
    });
  }

  const ordered = [...sections.values()].filter(s => s.spells.length)
    .sort((a, b) => (a.order - b.order) || (a.level - b.level));
  slots.sort((a, b) => (a.order - b.order) || (a.level - b.level));
  return { sections: ordered, slots };
}

/* -------------------------------------------- */
/*  Saves, skills and tools                     */
/* -------------------------------------------- */

/**
 * The actor's saving throws (in the system's ability order), skills and tools (alphabetical, as on the sheet).
 * @param {Actor} actor
 * @returns {{saves: object[], skills: object[], tools: object[]}}
 */
export function collectChecks(actor) {
  const system = actor.system ?? {};
  const abilities = CONFIG.DND5E?.abilities ?? {};
  const abbr = key => String(abilities[key]?.abbreviation ?? key ?? "").toUpperCase();
  const lang = game.i18n.lang;

  const saves = [];
  for ( const [key, ability] of Object.entries(system.abilities ?? {}) ) {
    if ( !(key in abilities) ) continue;
    const mod = (typeof ability.save === "number") ? ability.save : ability.save?.value;
    if ( !Number.isFinite(Number(mod)) ) continue;
    const label = abilities[key]?.label ?? key;
    saves.push({
      key, mod: Number(mod), abbreviation: abbr(key),
      prof: ability.save?.prof?.multiplier ?? ability.proficient ?? 0,
      tooltip: localizeSystem("DND5E.SavePromptTitle", { ability: label })
    });
  }

  const entry = (key, data, label) => ({
    key, label, mod: Number(data.total ?? data.mod ?? 0), passive: Number(data.passive),
    abbreviation: abbr(data.ability), prof: data.value ?? 0,
    tooltip: [label, CONFIG.DND5E.proficiencyLevels?.[data.value ?? 0],
      Number.isFinite(Number(data.passive)) ? `${localizeSystem("DND5E.Passive")} ${data.passive}` : null]
      .filter(Boolean).join(" \u2022 ")
  });

  const skills = Object.entries(system.skills ?? {})
    .filter(([key]) => key in (CONFIG.DND5E.skills ?? {}))
    .map(([key, data]) => entry(key, data, CONFIG.DND5E.skills[key]?.label ?? key))
    .sort((a, b) => a.label.localeCompare(b.label, lang));

  const Trait = globalThis.dnd5e?.documents?.Trait;
  const tools = Object.entries(system.tools ?? {})
    .filter(([key]) => (key in (CONFIG.DND5E.tools ?? {})) || (key in (CONFIG.DND5E.vehicleTypes ?? {})))
    .map(([key, data]) => entry(key, data, Trait?.keyLabel?.(key, { trait: "tool" }) ?? key))
    .sort((a, b) => a.label.localeCompare(b.label, lang));

  return { saves, skills, tools };
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

function hasProperty(item, property) {
  const properties = item?.system?.properties;
  return (typeof properties?.has === "function") && properties.has(property);
}

function localizeSystem(key, data) {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

/** Text from a label that may be an array or contain HTML entities, without running any of it as HTML. */
function plainText(value) {
  if ( Array.isArray(value) ) value = value.filter(v => v).map(v => plainText(v)).filter(Boolean).join(" • ");
  if ( (value === undefined) || (value === null) ) return "";
  const text = String(value);
  if ( !/[<&]/.test(text) ) return text.trim();
  return (new DOMParser().parseFromString(text, "text/html").body.textContent ?? "").replace(/\s+/g, " ").trim();
}

function make(tag, { class: cls, text, attrs } = {}, children = []) {
  const el = document.createElement(tag);
  const classes = (Array.isArray(cls) ? cls : [cls]).filter(Boolean).flatMap(c => c.split(" ")).filter(Boolean);
  if ( classes.length ) el.classList.add(...classes);
  if ( text !== undefined ) el.textContent = text;
  for ( const [k, v] of Object.entries(attrs ?? {}) ) el.setAttribute(k, v);
  for ( const child of children ) el.append(child);
  return el;
}
