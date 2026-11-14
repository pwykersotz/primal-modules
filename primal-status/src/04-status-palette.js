/* -------------------------------------------- */
/*  Status palette: search box and hidden icons */
/* -------------------------------------------- */

/** Remembers the search text while the HUD re-renders after each toggle. */
const paletteSearch = { tokenId: null, query: "" };

/** Iterate CONFIG.statusEffects whether it's an array (v12/v13) or a record (v14). */
function allStatusEffects() {
  const list = CONFIG.statusEffects;
  return Array.isArray(list) ? list : Object.values(list ?? {});
}

function hiddenStatusIds() {
  try { return new Set(game.settings.get(MODULE_ID, "hiddenStatuses") ?? []); }
  catch { return new Set(); }
}

/** Statuses a GM can choose to hide (the ones the system itself shows in the palette). */
function hideableStatuses() {
  return allStatusEffects().filter(s => s?.id && (("_mgOrigHud" in s) ? s._mgOrigHud : s.hud) !== false);
}

/** Keep hidden statuses out of the Token HUD palette using Foundry's own `hud: false` flag. */
function applyHiddenStatuses() {
  const hidden = hiddenStatusIds();
  for (const status of allStatusEffects()) {
    if (!status?.id) continue;
    if (!("_mgOrigHud" in status)) status._mgOrigHud = status.hud;
    if (hidden.has(status.id)) status.hud = false;
    else if (status._mgOrigHud === undefined) delete status.hud;
    else status.hud = status._mgOrigHud;
  }
  const hud = canvas?.tokens?.hud;
  if (hud?.rendered) hud.render();
}

function statusLabel(el) {
  const id = el.dataset.statusId;
  const fromConfig = allStatusEffects().find(s => s.id === id)?.name;
  return String(el.dataset.tooltipText ?? el.dataset.tooltip ?? el.getAttribute("title") ?? el.getAttribute("alt")
    ?? (fromConfig ? game.i18n.localize(fromConfig) : id) ?? "");
}

/**
 * Monsters of Drakkenheim statuses (its conditions, Contamination, and Burning, which the system
 * provides), listed in a section of their own.
 */
const DRAKKENHEIM_SECTION_EXTRAS = ["burning", "bleeding"];
function isDrakkenheimStatus(id) {
  return id === CONTAM_ID || DRAKKENHEIM_CONDITIONS.includes(id) || DRAKKENHEIM_SECTION_EXTRAS.includes(id);
}

/** Sort by name, the way people read them (ignoring case and accents). */
function byName(getName) {
  const collator = new Intl.Collator(game.i18n?.lang || undefined, { sensitivity: "base", numeric: true });
  return (a, b) => collator.compare(getName(a), getName(b));
}

/**
 * Put the palette's icons in alphabetical order, with the Monsters of Drakkenheim ones after a
 * heading of their own. Returns the heading (or null when there are none).
 */
function sortPaletteIcons(palette, icons) {
  const sorted = [...icons].sort(byName(statusLabel));
  const main = sorted.filter(i => !isDrakkenheimStatus(i.dataset.statusId));
  const drakk = sorted.filter(i => isDrakkenheimStatus(i.dataset.statusId));
  palette.querySelector(".mg-palette-heading")?.remove();
  let heading = null;
  if (drakk.length) {
    heading = document.createElement("div");
    heading.className = "mg-palette-heading";
    heading.textContent = loc("MIGHTYGUARD.Animations.Group.drakkenheim");
    Object.assign(heading.style, {
      gridColumn: "1 / -1", margin: "4px 0 2px", padding: "3px 0 0", borderTop: "1px solid rgba(201, 170, 113, 0.5)",
      color: "#c9aa71", fontSize: "11px", lineHeight: "13px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden",
      textOverflow: "ellipsis", pointerEvents: "none"
    });
  }
  palette.append(...main, ...(heading ? [heading] : []), ...drakk);
  return heading;
}

/**
 * Show every icon without scrolling: Foundry caps the palette's height and scrolls the rest, so the
 * cap is lifted. If the whole palette would then run off the bottom of the screen, it gets more
 * columns (as many as it takes, while it stays on screen sideways); only if even that can't fit it
 * does it keep a scrollbar, limited to the screen.
 */
const PALETTE_MAX_COLUMNS = 12;

function fitPaletteToScreen(palette) {
  if (!palette?.isConnected || !palette.classList.contains("active")) return;
  palette.style.maxHeight = "none";
  palette.style.overflowY = "visible";
  const base = paletteColumns(palette);
  const rect = palette.getBoundingClientRect();
  if (!base || !(rect.height > 0)) return;
  const margin = 8, vh = window.innerHeight, vw = window.innerWidth;
  const fits = r => r.bottom <= vh - margin;
  if (fits(rect)) return;
  const icons = palette.querySelectorAll("[data-status-id]").length;
  const setColumns = n => { palette.style.gridTemplateColumns = `repeat(${n}, ${base.size})`; };
  const most = Math.min(icons, PALETTE_MAX_COLUMNS);
  let count = base.count, widest = base.count, found = false;
  for (let n = base.count + 1; n <= most; n++) {
    setColumns(n);
    const r = palette.getBoundingClientRect();
    if (r.right > vw - margin) break;            // no wider than the screen
    widest = n;
    if (fits(r)) { count = n; found = true; break; }
  }
  // Nothing fits: as wide as allowed, and the rest scrolls (below)
  if (!found) count = widest;
  setColumns(count);
  palette.dataset.mgFitColumns = String(count);
  // Still too tall (a tiny screen): scroll, but only within the screen
  const r = palette.getBoundingClientRect();
  if (!fits(r)) {
    const scale = r.height / (palette.offsetHeight || r.height) || 1;   // the HUD is scaled with the canvas zoom
    palette.style.maxHeight = `${Math.max(80, Math.floor((vh - margin - r.top) / scale))}px`;
    palette.style.overflowY = "auto";
  }
}

/** Parse the palette's grid columns, e.g. "repeat(5, 25px)" or "25px 25px 25px". */
function paletteColumns(palette) {
  const template = palette.dataset.mgColumns ?? getComputedStyle(palette).gridTemplateColumns ?? "";
  palette.dataset.mgColumns = template;
  const repeat = template.match(/repeat\(\s*(\d+)\s*,\s*([^)]+)\)/);
  if (repeat) return { count: Number(repeat[1]), size: repeat[2].trim() };
  const parts = template.split(/\s+/).filter(p => p && p !== "none");
  return parts.length ? { count: parts.length, size: parts[0] } : null;
}

Hooks.on("renderTokenHUD", (hud, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const palette = root?.querySelector(".status-effects, .palette[data-palette='effects']");
  if (!palette || palette.querySelector(".mg-status-search")) return;

  // Fallback for systems that ignore `hud: false`: hide the icons directly.
  const hidden = hiddenStatusIds();
  const icons = [...palette.querySelectorAll("[data-status-id]")];
  for (const icon of icons) {
    if (hidden.has(icon.dataset.statusId)) { icon.style.display = "none"; icon.dataset.mgHidden = "true"; }
  }
  // Alphabetical, with the Monsters of Drakkenheim statuses in their own section
  const heading = sortPaletteIcons(palette, icons);
  const shown = [...palette.querySelectorAll("[data-status-id]")].filter(i => !i.dataset.mgHidden);

  // Shrink the grid to fit when only a few icons remain (rows shrink on their own).
  const cols = paletteColumns(palette);
  if (cols && shown.length < cols.count) {
    const count = Math.max(Math.min(cols.count, 3), shown.length);
    palette.style.gridTemplateColumns = `repeat(${count}, ${cols.size})`;
  }

  // Search box spanning the full width of the palette
  const input = document.createElement("input");
  input.type = "search";
  input.className = "mg-status-search";
  input.placeholder = game.i18n.localize("MIGHTYGUARD.Search.Placeholder");
  input.setAttribute("aria-label", input.placeholder);
  input.autocomplete = "off";
  Object.assign(input.style, {
    gridColumn: "1 / -1", width: "100%", height: "24px", minWidth: "0", boxSizing: "border-box",
    margin: "0 0 4px 0", padding: "0 6px", fontSize: "12px", color: "#f0f0e0",
    background: "rgba(0, 0, 0, 0.65)", border: "1px solid #7a7971", borderRadius: "4px"
  });
  palette.prepend(input);

  const filter = () => {
    const q = input.value.trim().toLowerCase();
    paletteSearch.query = input.value;
    for (const icon of shown) {
      icon.style.display = (!q || statusLabel(icon).toLowerCase().includes(q)) ? "" : "none";
    }
    // The heading shows only while some Drakkenheim status is showing under it
    if (heading) heading.style.display = shown.some(i => i.style.display !== "none" && isDrakkenheimStatus(i.dataset.statusId)) ? "" : "none";
  };

  input.addEventListener("input", filter);
  input.addEventListener("keydown", event => {
    event.stopPropagation(); // don't trigger Foundry keybindings while typing
    if (event.key === "Escape") {
      if (input.value) { input.value = ""; filter(); } else input.blur();
      event.preventDefault();
    } else if (event.key === "Enter") {
      shown.find(i => i.style.display !== "none")?.click(); // toggle the first match
      event.preventDefault();
    }
  });
  for (const type of ["click", "pointerdown", "mousedown", "contextmenu"]) {
    input.addEventListener(type, event => event.stopPropagation());
  }

  // Keep the search text when the HUD re-renders for the same token.
  const tokenId = hud.object?.id ?? null;
  if (tokenId !== paletteSearch.tokenId) { paletteSearch.tokenId = tokenId; paletteSearch.query = ""; }
  input.value = paletteSearch.query;
  filter();

  // Focus the search box whenever the palette is opened.
  const focusIfOpen = () => {
    if (!palette.classList.contains("active")) return;
    fitPaletteToScreen(palette);
    input.focus({ preventScroll: true });
  };
  new MutationObserver(focusIfOpen).observe(palette, { attributes: true, attributeFilter: ["class"] });
  fitPaletteToScreen(palette);
});

/**
 * Contamination levels from the status palette when the system doesn't do it (dnd5e 6 does):
 * left-click adds a level, right-click removes one, and the icon shows the current level.
 */
Hooks.on("renderTokenHUD", (hud, html) => {
  if (systemHasLeveledConditions()) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const icon = root?.querySelector(`[data-status-id="${CONTAM_ID}"]`);
  const actor = hud.object?.actor ?? hud.actor;
  if (!icon || !actor || icon.dataset.mgLevels) return;
  icon.dataset.mgLevels = "true";
  const paint = () => {
    const level = contaminationLevel(actor);
    icon.style.objectPosition = level ? "-100px" : "";
    icon.style.background = level ? `url("${contaminationIcon(level)}") no-repeat center / contain` : "";
  };
  paint();
  const change = delta => event => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    changeContamination(actor, delta)
      .then(paint)
      .catch(err => console.error(`${MODULE_ID} | Could not change contamination`, err));
  };
  icon.addEventListener("click", change(1));
  icon.addEventListener("contextmenu", change(-1));
});

