/* -------------------------------------------- */
/*  Status palette: pane with the status text   */
/* -------------------------------------------- */

/**
 * Foundry only reads a module's stylesheets from module.json when it rescans packages (on
 * restart or returning to setup), so add the link ourselves if it isn't on the page yet.
 */
function loadStylesheet() {
  if (typeof document === "undefined") return;
  const href = `${MODULE_PATH}/styles/${MODULE_ID}.css`;
  if ([...document.querySelectorAll("link[rel=stylesheet]")].some(l => (l.getAttribute("href") ?? "").includes(href))) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

const statusTextCache = new Map();   // effect text / status rules → enriched HTML

function textEditorClass() {
  return foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
}

/** Every effect that applies to the actor, including ones carried by its items. */
function applicableEffects(actor) {
  try {
    if (typeof actor?.allApplicableEffects === "function") return [...actor.allApplicableEffects()];
  } catch { /* fall back to the actor's own effects */ }
  return [...(actor?.effects ?? [])];
}

function statusConfig(id) {
  const list = CONFIG.statusEffects;
  return Array.isArray(list) ? list.find(s => s.id === id) : list?.[id];
}

/**
 * Rules for statuses that dnd5e doesn't link to a rules page itself. These are the 2024 Rules
 * Glossary entries (the same wording as 5e.tools' XPHB entries, which are in the SRD 5.2), taken
 * from dnd5e's own SRD rules compendium: first by the key dnd5e uses for the rule (so the right
 * page is used for legacy rules too), then by the page in the 2024 rules.
 */
const SRD_RULES = "Compendium.dnd5e.content24.JournalEntry.phbAppendixCRule.JournalEntryPage";
const STATUS_RULES = {
  concentrating: { keys: ["concentrating", "concentration"], page: "0a2umg2mJMAzM9Q3" },
  coverHalf: { keys: ["cover"], page: "pGXkTaY8kLgqQuDa" },
  coverThreeQuarters: { keys: ["cover"], page: "pGXkTaY8kLgqQuDa" },
  coverTotal: { keys: ["cover"], page: "pGXkTaY8kLgqQuDa" },
  surprised: { keys: ["surprise"], page: "8gPSPovZD9reqFet" },
  dodging: { keys: ["dodge"], page: "3YJIuyCMmuUrfmuX" },
  hiding: { keys: ["hide"], page: "rqhOsUY4wWa1oHTy" },
  flying: { keys: ["flying"], page: "ozHhbP8JVHCJAx0b" },
  hovering: { keys: ["hover"], page: "HiJGoeVyu4nhm6a3" },
  burrowing: { keys: ["burrowspeed", "burrow"], page: "g7DDgHsdjxZUqGD2" },
  bloodied: { keys: ["bloodied"], page: "shZaSIlFPpHufPFn" },
  stable: { keys: ["stable"], page: "klXWp4c90n7Kt5LB" },
  dead: { keys: ["dead"], page: "OP0YhS6iOm4yfPIt" }
};

/** The rules page for a status, if one is known (dnd5e only). */
function statusRulesReference(id) {
  const status = statusConfig(id);
  const reference = status?.reference ?? CONFIG.DND5E?.conditionTypes?.[id]?.reference;
  if (reference) return reference;
  const known = STATUS_RULES[id];
  if (!known || game.system?.id !== "dnd5e") return null;
  for (const key of known.keys) {
    const rule = CONFIG.DND5E?.rules?.[key];
    const uuid = typeof rule === "string" ? rule : rule?.reference;
    if (uuid) return uuid;
  }
  return game.packs?.get?.("dnd5e.content24") ? `${SRD_RULES}.${known.page}` : null;
}

/** A status's own rules text: its description, or its rules page embedded. */
function statusRulesText(id) {
  const status = statusConfig(id);
  if (status?.description) return loc(status.description);
  const reference = statusRulesReference(id);
  return reference ? `@Embed[${reference} inline]` : "";
}

function statusDisplayName(id) {
  const status = statusConfig(id);
  return loc(status?.name ?? status?.label ?? id);
}

async function enrichText(text, effect) {
  if (!text) return "";
  try {
    return await textEditorClass().enrichHTML(text, { async: true, relativeTo: effect, secrets: !!effect?.isOwner });
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not enrich effect text`, err);
    return text;
  }
}

/** Where an effect comes from (its item, or the item or creature it originated from), if known. */
function effectSource(effect) {
  try {
    if (effect.parent?.documentName === "Item") return effect.parent.name ?? "";
    if (effect.origin && typeof fromUuidSync === "function") {
      const origin = fromUuidSync(effect.origin, { strict: false });
      if (origin?.name && origin !== effect.parent) return origin.name;
    }
  } catch { /* origin not available */ }
  return "";
}

/**
 * How long an effect has left ("2 Rounds", "9 Minutes"), or "" if it lasts until removed. Dodging
 * that this module ends at the creature's next turn says so.
 */
function effectRemaining(effect) {
  try {
    const d = effect.duration;
    const label = typeof d?.label === "string" ? d.label.trim() : "";
    const limited = !d || !("remaining" in d) || Number.isFinite(d.remaining);
    if (label && limited && !/^none$/i.test(label)) return label;
  } catch { /* no duration */ }
  if (endsAtNextTurn(effect)) return loc("MIGHTYGUARD.StatusPane.UntilNextTurn");
  return "";
}

/** Can this user remove the effect from the pane? (Its own effect on a creature they own; not one an item carries.) */
function effectRemovable(effect) {
  if (!effect || typeof effect.delete !== "function" || !effect.id) return false;
  if (effect.parent?.documentName === "Item") return false;
  return !!(effect.isOwner ?? effect.parent?.isOwner);
}

/** Keep pictures inside the text small (they're mostly icons). */
function shrinkImages(html) {
  if (!html || !html.includes("<img") || typeof document === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const img of template.content.querySelectorAll("img")) {
    img.removeAttribute("width");
    img.removeAttribute("height");
    Object.assign(img.style, { maxWidth: "32px", maxHeight: "32px", width: "auto", height: "auto", verticalAlign: "middle", border: "none" });
  }
  return template.innerHTML;
}

/** Enrich text once and keep it (rules pages and effect descriptions rarely change). */
async function enrichCached(key, text, effect) {
  if (!text) return "";
  if (statusTextCache.size > 400) statusTextCache.clear();
  if (!statusTextCache.has(key)) statusTextCache.set(key, shrinkImages(await enrichText(text, effect)));
  return statusTextCache.get(key);
}

function effectTextKey(effect) {
  return `${effect.uuid ?? effect.id}|${effect._stats?.modifiedTime ?? ""}|${effect.name}|${effect.description?.length ?? 0}`;
}

/** Active effects that give the actor a status, in the order their statuses sit in the palette. */
function paneEffects(actor, order) {
  const effects = applicableEffects(actor).filter(e => !e.disabled && e.active !== false && !e.isSuppressed && e.statuses?.size);
  const rank = id => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  const first = e => Math.min(...[...e.statuses].map(rank));
  return effects.map((e, i) => ({ e, r: first(e), i })).sort((a, b) => (a.r - b.r) || (a.i - b.i)).map(x => x.e);
}

/**
 * One effect in the pane: icon, name, source and duration, then its own text (if it has any)
 * and the rules for each status it gives. A status's rules appear once, under the first effect
 * giving it (so Unconscious shows the Incapacitated and Prone rules, and they aren't repeated).
 */
async function effectPaneSection(effect, shownRules) {
  const statuses = [...effect.statuses];
  const own = String(effect.description ?? "").trim();
  const body = [];
  if (own) {
    // The effect's text may already be a status's rules (e.g. an embedded rules page)
    const ownIs = statuses.find(id => {
      const rules = statusRulesText(id), reference = statusRulesReference(id);
      return own === rules || (reference && own.includes(reference));
    });
    if (ownIs) shownRules.add(ownIs);
    const html = await enrichCached(`own|${effectTextKey(effect)}`, own, effect);
    if (html) body.push(`<div class="mg-sp-own"${ownIs ? ` data-status-id="${escapeHTML(ownIs)}"` : ""}>${html}</div>`);
  }
  for (const id of statuses) {
    if (shownRules.has(id)) continue;
    shownRules.add(id);
    const html = await enrichCached(`rules|${id}`, statusRulesText(id), effect);
    if (!html) continue;
    const name = statusDisplayName(id);
    const named = body.length > 0 || !String(effect.name ?? "").toLowerCase().startsWith(name.toLowerCase());
    body.push(`<div class="mg-sp-rules" data-status-id="${escapeHTML(id)}">${named ? `<strong>${escapeHTML(name)}</strong>` : ""}${html}</div>`);
  }
  const source = effectSource(effect);
  const remaining = effectRemaining(effect);
  const img = effect.img
    ? `<img src="${escapeHTML(effect.img)}" alt="" width="28" height="28" style="width:28px;height:28px;max-width:28px;max-height:28px;object-fit:contain;flex:none;">`
    : "";
  const time = remaining
    ? `<span class="mg-sp-time" data-tooltip="${escapeHTML(loc("MIGHTYGUARD.StatusPane.Remaining"))}"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ${escapeHTML(remaining)}</span>`
    : "";
  const removeLabel = escapeHTML(loc("MIGHTYGUARD.StatusPane.Remove").replace("{name}", effect.name ?? ""));
  const remove = effectRemovable(effect)
    ? `<button type="button" class="mg-sp-remove" data-effect-id="${escapeHTML(effect.id)}" aria-label="${removeLabel}" data-tooltip="${removeLabel}">&times;</button>`
    : "";
  return `<section class="mg-sp-effect" data-statuses="${escapeHTML(statuses.join(" "))}">`
    + `<header style="display:flex;align-items:center;gap:0.5rem;">${img}<div class="mg-sp-title"><strong>${escapeHTML(effect.name)}</strong>`
    + `${source ? `<small>${escapeHTML(source)}</small>` : ""}</div>${time}${remove}</header>`
    + valueRowHTML(effect)
    + `<div class="mg-sp-text">${body.join("") || `<p class="mg-sp-none">${escapeHTML(loc("MIGHTYGUARD.Tooltip.NoText"))}</p>`}</div></section>`;
}

/**
 * Jinxed (X), Valor (X), Burning (X) and Bleeding (X): a box for X under the effect's name, with
 * buttons for the usual values. Burning also has buttons for its damage type (Fire or Acid), apart
 * from the box: the box holds only the dice. Shown as plain text to someone who can't change it.
 */
function valueRowHTML(effect) {
  const id = valueStatusOf(effect);
  if (!id) return "";
  const config = VALUE_STATUSES[id];
  const value = effectStatusValue(effect) ?? config.fallback;
  const label = escapeHTML(loc(`MIGHTYGUARD.StatusValue.${settingLabel(id)}`));
  if (!effectRemovable(effect)) return `<div class="mg-sp-value"><span class="mg-sp-value-label">${label}</span> <strong>${escapeHTML(value)}</strong></div>`;
  const eid = escapeHTML(effect.id);
  const { formula, type } = config.types ? splitValueType(value) : { formula: value, type: null };
  const chips = config.choices.map(v => `<button type="button" class="mg-sp-chip${v === formula ? " active" : ""}" data-effect-id="${eid}" data-value="${escapeHTML(v)}" aria-pressed="${v === formula}">${escapeHTML(v)}</button>`).join("");
  let types = "";
  if (config.types) {
    const current = type ?? config.defaultType;
    const list = config.types.includes(current) ? config.types : [...config.types, current];   // a type named some other way still shows
    types = `<span class="mg-sp-types" role="group" aria-label="${escapeHTML(loc("MIGHTYGUARD.StatusValue.Type"))}">`
      + list.map(t => `<button type="button" class="mg-sp-chip mg-sp-type${t === current ? " active" : ""}" data-effect-id="${eid}" data-type="${escapeHTML(t)}" aria-pressed="${t === current}">${escapeHTML(damageTypeLabel(t))}</button>`).join("")
      + `</span>`;
  }
  return `<div class="mg-sp-value${config.types ? " mg-sp-typed" : ""}"${config.types ? ` data-type="${escapeHTML(type ?? config.defaultType)}"` : ""}><label class="mg-sp-value-label" for="mg-sp-value-${eid}">${label}</label>`
    + types
    + `<input type="text" id="mg-sp-value-${eid}" class="mg-sp-value-input" data-effect-id="${eid}" value="${escapeHTML(formula)}" placeholder="${escapeHTML(config.fallback)}"`
    + ` size="7" maxlength="40" spellcheck="false" autocomplete="off" data-tooltip="${escapeHTML(loc("MIGHTYGUARD.StatusValue.Hint"))}">`
    + `<span class="mg-sp-chips">${chips}</span></div>`;
}

/** The pane's contents: every active status effect on the actor, in full ("" if there are none). */
async function statusPaneHTML(actor, order, title) {
  const effects = paneEffects(actor, order);
  if (!effects.length) return "";
  const shownRules = new Set();
  const sections = [];
  for (const effect of effects) sections.push(await effectPaneSection(effect, shownRules));
  return `<header class="mg-sp-head"><span>${escapeHTML(loc("MIGHTYGUARD.StatusPane.Title"))}</span>`
    + `${title ? `<span class="mg-sp-who">${escapeHTML(title)}</span>` : ""}</header><div class="mg-sp-body">${sections.join("")}</div>`;
}

/*
 * The pane lives outside the HUD (so it doesn't shrink with the canvas zoom) and is placed beside
 * the open palette: to its right, or to the left of the whole HUD when there isn't room, never over
 * the icons. While it's showing, it follows the HUD each frame (panning, zooming, a moved token).
 */
const PANE = { width: 380, minWidth: 200, minHeight: 360, gap: 10, margin: 8, minColumn: 230, columnGap: 14, maxColumns: 4 };
const statusPane = { el: null, palette: null, hud: null, actor: null, html: "", run: 0, raf: 0, placed: "", highlight: null, focusValue: null };

function statusPaneEnabled() {
  try { return !!game.settings.get(MODULE_ID, "statusTooltips"); } catch { return false; }
}

function statusPaneElement() {
  if (statusPane.el?.isConnected) return statusPane.el;
  const el = document.createElement("aside");
  el.id = "mg-status-pane";
  el.className = "mg-status-pane";
  el.hidden = true;
  el.setAttribute("aria-live", "polite");
  el.addEventListener("click", event => {
    const chip = event.target?.closest?.(".mg-sp-chip");
    if (chip && el.contains(chip)) {
      event.preventDefault();
      event.stopPropagation();
      if (chip.dataset.type) setPaneEffectType(chip.dataset.effectId, chip.dataset.type);
      else setPaneEffectValue(chip.dataset.effectId, chip.dataset.value, chip);
      return;
    }
    const button = event.target?.closest?.(".mg-sp-remove");
    if (!button || !el.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    removePaneEffect(button.dataset.effectId, button);
  });
  // The value box: Enter (or leaving it) saves, Escape puts it back; typing never reaches Foundry's keys
  for (const type of ["keydown", "keyup", "keypress"]) {
    el.addEventListener(type, event => {
      const input = event.target?.closest?.(".mg-sp-value-input");
      if (!input) return;
      event.stopPropagation();
      if (type !== "keydown") return;
      input.classList.remove("mg-sp-invalid");
      if (event.key === "Enter") { event.preventDefault(); setPaneEffectValue(input.dataset.effectId, input.value, input); }
      else if (event.key === "Escape") { event.preventDefault(); input.value = input.defaultValue; input.blur(); }
    });
  }
  el.addEventListener("change", event => {
    const input = event.target?.closest?.(".mg-sp-value-input");
    if (input) setPaneEffectValue(input.dataset.effectId, input.value, input);
  });
  document.body.append(el);
  statusPane.el = el;
  statusPane.placed = "";
  return el;
}

/** The pane's remove button: delete the effect, then show its statuses as off in the palette. */
async function removePaneEffect(id, button) {
  const { actor, palette, hud } = statusPane;
  const effect = applicableEffects(actor).find(e => e?.id === id);
  if (!effect || !effectRemovable(effect)) return;
  if (button) button.disabled = true;
  const statuses = [...(effect.statuses ?? [])];
  try { await effect.delete(); }
  catch (err) {
    console.warn(`${MODULE_ID} | Could not remove the effect`, err);
    if (button) button.disabled = false;
    return;
  }
  // Foundry redraws the palette on its next render; until then, show the statuses as off here
  for (const sid of statuses) {
    if (actor?.statuses?.has?.(sid)) continue;
    const sel = globalThis.CSS?.escape ? CSS.escape(sid) : String(sid).replace(/["\\]/g, "\\$&");
    palette?.querySelector?.(`[data-status-id="${sel}"]`)?.classList.remove("active");
  }
  refreshStatusPane(palette, actor, hud);
}

/**
 * Save a value typed (or picked) in the pane on its effect; an invalid one is marked and not saved.
 * For Burning the box holds only the dice: the damage type picked beside it is kept, unless what was
 * typed names one ("2d4 acid").
 */
async function setPaneEffectValue(id, raw, control) {
  const effect = applicableEffects(statusPane.actor).find(e => e?.id === id);
  if (!effect || !effectRemovable(effect)) return false;
  const sid = valueStatusOf(effect);
  let value = normalizeStatusValue(raw, sid);
  if (value && VALUE_STATUSES[sid]?.types && !splitValueType(value).type) {
    const current = splitValueType(effectStatusValue(effect) ?? "").type;
    value = valueWithType(value, current, sid);
  }
  const input = control?.classList?.contains("mg-sp-value-input") ? control : statusPane.el?.querySelector?.(`.mg-sp-value-input[data-effect-id="${id}"]`);
  if (!value) {
    input?.classList.add("mg-sp-invalid");
    input?.setAttribute("aria-invalid", "true");
    return false;
  }
  input?.classList.remove("mg-sp-invalid");
  input?.removeAttribute("aria-invalid");
  if (input) input.value = VALUE_STATUSES[sid]?.types ? splitValueType(value).formula : value;
  const wantedName = nameWithValue(effect, valueStatusOf(effect), value);
  if (normalizeStatusValue(moduleFlag(effect, "value"), valueStatusOf(effect)) === value && (!wantedName || wantedName === effect.name)) return true;   // nothing to change
  try { return await setEffectStatusValue(effect, value); }
  catch (err) { console.warn(`${MODULE_ID} | Could not set the value`, err); return false; }
}

/** Burning's damage type, picked in the pane: the dice stay as they are. */
async function setPaneEffectType(id, type) {
  const effect = applicableEffects(statusPane.actor).find(e => e?.id === id);
  if (!effect || !effectRemovable(effect)) return false;
  const sid = valueStatusOf(effect);
  if (!VALUE_STATUSES[sid]?.types) return false;
  const config = VALUE_STATUSES[sid];
  const now = effectStatusValue(effect) ?? config.fallback;
  const value = valueWithType(splitValueType(now).formula, type, sid);
  if (!value) return false;
  const wantedName = nameWithValue(effect, sid, value);
  if (normalizeStatusValue(moduleFlag(effect, "value"), sid) === value && (!wantedName || wantedName === effect.name)) return true;
  try { return await setEffectStatusValue(effect, value); }
  catch (err) { console.warn(`${MODULE_ID} | Could not set the damage type`, err); return false; }
}

function hideStatusPane() {
  if (statusPane.raf) cancelAnimationFrame(statusPane.raf);
  statusPane.raf = 0;
  statusPane.placed = "";
  if (statusPane.el) statusPane.el.hidden = true;
}

/** Room on screen not taken by the sidebar (right) or the scene controls (left). */
function paneScreenEdges() {
  const vw = window.innerWidth;
  let lo = 0, hi = vw;
  for (const sel of ["#sidebar", "#ui-right"]) {
    const r = document.querySelector(sel)?.getBoundingClientRect?.();
    if (r?.width && r.left > vw / 2) { hi = r.left; break; }
  }
  for (const sel of ["#scene-controls", "#controls"]) {
    const r = document.querySelector(sel)?.getBoundingClientRect?.();
    if (r?.width && r.right < vw / 2) { lo = r.right; break; }
  }
  return { lo: lo + PANE.margin, hi: hi - PANE.margin };
}

/** Place the pane beside the open palette; false when there's nothing to show (stops the loop). */
function placeStatusPane() {
  const { el, palette } = statusPane;
  if (!el) return false;
  const open = palette?.isConnected && palette.classList.contains("active") && statusPane.html && statusPaneEnabled();
  const rect = open ? palette.getBoundingClientRect() : null;
  if (!rect?.width || !rect?.height) { el.hidden = true; statusPane.placed = ""; return false; }
  const hudEl = statusPane.hud?.element instanceof HTMLElement ? statusPane.hud.element : statusPane.hud?.element?.[0];
  const hudRect = hudEl?.isConnected ? hudEl.getBoundingClientRect() : null;
  const left = Math.min(rect.left, hudRect?.width ? hudRect.left : rect.left);
  const right = Math.max(rect.right, hudRect?.width ? hudRect.right : rect.right);
  const { lo, hi } = paneScreenEdges();
  const vh = window.innerHeight;
  const key = [rect.left, rect.top, left, right, lo, hi, vh, statusPane.html.length].map(Math.round).join("|");
  if (el.hidden) el.hidden = false;
  if (key === statusPane.placed) return true;
  statusPane.placed = key;

  const roomR = hi - (right + PANE.gap), roomL = (left - PANE.gap) - lo;
  let side, w;
  if (roomR >= PANE.width) { w = PANE.width; side = "right"; }
  else if (roomL >= PANE.width) { w = PANE.width; side = "left"; }
  else if (roomR >= roomL) { w = Math.max(PANE.minWidth, roomR); side = "right"; }
  else { w = Math.max(PANE.minWidth, roomL); side = "left"; }
  // Tall enough to show everything: when one column would run past the screen, more columns side
  // by side (as many as fit beside the HUD, on whichever side has room for them)
  const scroll = el.scrollTop;   // measuring the layout loses it
  const fit = fitPaneColumns(el, side, w, { right: roomR, left: roomL }, vh - 2 * PANE.margin);
  side = fit.side; w = fit.width;
  const x = side === "right" ? right + PANE.gap : left - PANE.gap - w;
  el.style.width = `${Math.round(w)}px`;
  el.style.left = `${Math.round(x)}px`;
  // Level with the top of the palette and down to the bottom of the screen (scrolling only if even
  // the columns can't hold it all); moved up as far as it takes to show everything.
  el.style.maxHeight = `${Math.max(120, vh - 2 * PANE.margin)}px`;
  const natural = el.offsetHeight;
  const anchor = Math.max(rect.top, PANE.margin);
  const height = Math.min(natural, vh - 2 * PANE.margin);
  const top = Math.max(PANE.margin, Math.min(anchor, vh - PANE.margin - height));
  el.style.top = `${Math.round(top)}px`;
  el.style.maxHeight = `${Math.max(120, Math.round(vh - PANE.margin - top))}px`;
  if (scroll) el.scrollTop = scroll;
  return true;
}

/**
 * Show the whole pane within the screen's height: one column if it fits, else two, three... while
 * they fit (each at least PANE.minColumn wide) beside the HUD, trying the other side of the HUD too
 * when it has more room; failing that, the rules text a little smaller (12px, then 11px). Only if
 * none of that is enough does the pane scroll. Returns the side and width; leaves the layout set.
 */
function fitPaneColumns(el, side, width, room, avail) {
  const body = el.querySelector(".mg-sp-body");
  const measure = (cols, w, font) => {
    el.style.width = `${Math.round(w)}px`;
    el.style.fontSize = font ? `${font}px` : "";
    if (body) body.style.columnCount = cols > 1 ? String(cols) : "";
    return el.offsetHeight;
  };
  el.style.maxHeight = "none";
  if (!body || measure(1, width) <= avail) return { side, width };
  const other = side === "right" ? "left" : "right";
  const sides = room[other] > room[side] ? [side, other] : [side];
  let best = null;
  for (const font of [null, 12, 11]) {
    const tries = [{ side, width, cols: 1 }];
    for (const s of sides) {
      const most = Math.min(PANE.maxColumns, Math.floor((room[s] + PANE.columnGap) / (PANE.minColumn + PANE.columnGap)));
      for (let cols = 2; cols <= most; cols++) {
        const column = Math.min(PANE.width, (room[s] - (cols - 1) * PANE.columnGap) / cols);
        tries.push({ side: s, width: cols * column + (cols - 1) * PANE.columnGap, cols });
      }
    }
    for (const t of tries) {
      if (!font && t.cols === 1) continue;   // already measured
      const h = measure(t.cols, t.width, font);
      if (!best || h < best.h) best = { ...t, font, h };
      if (h <= avail) return { side: t.side, width: t.width };
    }
  }
  // Too much even so: the layout that comes closest, scrolling the rest
  measure(best.cols, best.width, best.font);
  return { side: best.side, width: best.width };
}

function startStatusPaneLoop() {
  if (statusPane.raf || typeof requestAnimationFrame !== "function") return;
  const step = () => {
    statusPane.raf = 0;
    if (placeStatusPane()) statusPane.raf = requestAnimationFrame(step);
  };
  step();
}

/** Hovering a status in the palette highlights its text in the pane. */
function highlightPaneStatus(id) {
  statusPane.highlight = id ?? null;
  const el = statusPane.el;
  if (!el) return null;
  for (const n of el.querySelectorAll(".mg-sp-hl")) n.classList.remove("mg-sp-hl");
  if (!id) return null;
  const sel = globalThis.CSS?.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, "\\$&");
  const block = el.querySelector(`[data-status-id="${sel}"]`);
  const section = block?.closest(".mg-sp-effect")
    ?? [...el.querySelectorAll(".mg-sp-effect")].find(s => (s.dataset.statuses ?? "").split(" ").includes(id));
  if (!section) return null;
  section.classList.add("mg-sp-hl");
  block?.classList.add("mg-sp-hl");
  return block ?? section;
}

function watchPaneHover(palette) {
  if (palette._mgPaneHover) return;
  palette._mgPaneHover = true;
  palette.addEventListener("pointerover", event => {
    const icon = event.target?.closest?.("[data-status-id]");
    const id = icon?.dataset.statusId ?? null;
    if (id === statusPane.highlight) return;
    const target = highlightPaneStatus(id);
    try { target?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); } catch { /* old browsers */ }
  });
  palette.addEventListener("pointerleave", () => highlightPaneStatus(null));
}

/** Rebuild the pane for the creature whose HUD is open. */
async function refreshStatusPane(palette, actor, hud) {
  const run = ++statusPane.run;
  if (!palette || !actor || !statusPaneEnabled() || typeof document === "undefined") {
    statusPane.html = "";
    hideStatusPane();
    return;
  }
  Object.assign(statusPane, { palette, actor, hud });
  watchPaneHover(palette);
  const order = [...palette.querySelectorAll("[data-status-id]")].map(i => i.dataset.statusId);
  let html = "";
  try { html = await statusPaneHTML(actor, order, hud?.object?.name ?? actor.name); }
  catch (err) { console.warn(`${MODULE_ID} | Could not build the status pane`, err); }
  if (run !== statusPane.run) return;   // a newer refresh has taken over
  const el = statusPaneElement();
  if (html !== statusPane.html || !el.innerHTML) {
    const scroll = el.scrollTop;
    // someone typing in a value box keeps their place (and what they've typed) through the redraw
    const typing = document.activeElement?.closest?.(".mg-sp-value-input") && el.contains(document.activeElement) ? document.activeElement : null;
    const kept = typing ? { id: typing.dataset.effectId, value: typing.value, changed: typing.value !== typing.defaultValue, start: typing.selectionStart, end: typing.selectionEnd } : null;
    el.innerHTML = html;
    el.scrollTop = scroll;
    statusPane.html = html;
    statusPane.placed = "";
    if (statusPane.highlight) highlightPaneStatus(statusPane.highlight);
    if (kept) {
      const again = el.querySelector(`.mg-sp-value-input[data-effect-id="${kept.id}"]`);
      if (again) {
        if (kept.changed) again.value = kept.value;
        again.focus({ preventScroll: true });
        try { again.setSelectionRange(kept.start, kept.end); } catch { /* not a text box */ }
      }
    }
  }
  focusNewValue(el);
  if (html) startStatusPaneLoop();
  else hideStatusPane();
}

/**
 * A value status this user has just put on (from the palette, say): its box gets the focus, with its
 * value selected, so typing a new one and pressing Enter is all it takes.
 */
const VALUE_FOCUS_MS = 4000;
function focusNewValue(el) {
  const wanted = statusPane.focusValue;
  if (!wanted || !el) return;
  if (Date.now() > wanted.until) { statusPane.focusValue = null; return; }
  const input = el.querySelector(`.mg-sp-value-input[data-effect-id="${wanted.id}"]`);
  if (!input || el.hidden) return;
  statusPane.focusValue = null;
  input.focus({ preventScroll: true });
  try { input.select(); } catch { /* not a text box */ }
}

Hooks.on("createActiveEffect", (effect, options, userId) => {
  if (userId !== game.user?.id || !valueStatusOf(effect) || !effect?.id) return;
  statusPane.focusValue = { id: effect.id, until: Date.now() + VALUE_FOCUS_MS };
});

function hudPalette(hud) {
  const el = hud?.element;
  const root = el instanceof HTMLElement ? el : el?.[0];
  return root?.querySelector?.(".status-effects, .palette[data-palette='effects']") ?? null;
}

function refreshOpenHudPane() {
  const hud = canvas?.tokens?.hud;
  const actor = hud?.object?.actor ?? hud?.actor;
  if (hud?.rendered && actor) refreshStatusPane(hudPalette(hud), actor, hud);
  else { statusPane.html = ""; hideStatusPane(); }
}

Hooks.on("renderTokenHUD", (hud, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const palette = root?.querySelector(".status-effects, .palette[data-palette='effects']");
  const actor = hud.object?.actor ?? hud.actor;
  if (!palette || !actor) { hideStatusPane(); return; }
  refreshStatusPane(palette, actor, hud);
  // Opening the palette, or toggling a status while the HUD stays open, only changes classes.
  if (!palette._mgPaneObserver) {
    let pending = null;
    palette._mgPaneObserver = new MutationObserver(records => {
      if (records.some(r => r.target === palette)) startStatusPaneLoop();
      if (!records.some(r => r.target?.dataset?.statusId && r.attributeName === "class")) return;
      clearTimeout(pending);
      pending = setTimeout(() => refreshStatusPane(palette, hud.object?.actor ?? actor, hud), 50);
    });
    palette._mgPaneObserver.observe(palette, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }
});

Hooks.on("closeTokenHUD", () => hideStatusPane());

// An effect changed on the creature whose HUD is open (e.g. a new level): refresh the pane.
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
  Hooks.on(hook, effect => {
    const hud = canvas?.tokens?.hud;
    const actor = hud?.object?.actor;
    if (!actor || !hud.rendered) return;
    const owner = effect?.parent?.documentName === "Item" ? effect.parent.parent : effect?.parent;
    if (owner !== actor && owner?.uuid !== actor.uuid) return;
    setTimeout(() => refreshStatusPane(hudPalette(hud), actor, hud), 0);
  });
}

