/**
 * The chat cards: a harvest's result, and "ready to harvest" (creatures that can be harvested, with a button each).
 * The HTML is built from plain data, already in words, so the checks can render it under Node.
 */
import { escapeHTML as e } from "./constants.mjs";

/**
 * The result card.
 * @param {object} card
 * @param {object} card.creature     { name, img, typeLabel }
 * @param {string} card.title        "Harvested: Ghoul Priest"
 * @param {string} card.subtitle     "Undead · Medicine · 15 minutes"
 * @param {object[]} card.checks     [{ label, who, rollHTML, total }]
 * @param {object|null} card.helpers { label, text, total }
 * @param {object} card.total        { label, value }
 * @param {object[]} card.results    [{ name, harvested, text, tags: [{code, label}], volatileLost, note }]
 * @param {string[]} card.notes      Lines under the list (where the components went, warnings).
 * @returns {string}
 */
export function renderResultCard(card) {
  const checks = card.checks.map(c => `
    <div class="ph-check">
      <div class="ph-check-head"><span class="ph-check-label">${e(c.label)}</span><span class="ph-who">${e(c.who)}</span></div>
      ${c.rollHTML || `<div class="ph-check-total">${e(c.total)}</div>`}
    </div>`).join("");
  const helpers = card.helpers ? `
    <div class="ph-helpers"><span>${e(card.helpers.label)}</span><span>${e(card.helpers.text)}</span></div>` : "";
  const results = card.results.length ? card.results.map(r => `
      <li class="ph-result ${r.harvested ? "harvested" : "lost"}${r.volatileLost ? " volatile" : ""}">
        <i class="fa-solid ${r.harvested ? "fa-check" : "fa-xmark"}" inert></i>
        <span class="ph-result-name">${e(r.name)}${tagsHTML(r.tags)}</span>
        <span class="ph-result-dc">${e(r.text)}</span>
        ${r.volatileLost ? `<span class="ph-result-warning">${e(r.volatileLost)}</span>` : ""}
      </li>`).join("") : `<li class="ph-result empty">${e(card.emptyText ?? "")}</li>`;
  const notes = (card.notes ?? []).filter(Boolean).map(n => `<p class="ph-note">${e(n)}</p>`).join("");
  return `
<div class="primal-harvesting-card">
  <header class="ph-card-head">
    <img src="${e(card.creature.img)}" alt="" width="40" height="40">
    <div class="ph-card-titles">
      <h3>${e(card.title)}</h3>
      <span class="ph-card-subtitle">${e(card.subtitle)}</span>
    </div>
  </header>
  <div class="ph-checks">${checks}${helpers}
    <div class="ph-total"><span>${e(card.total.label)}</span><strong>${e(card.total.value)}</strong></div>
  </div>
  <ol class="ph-results">${results}
  </ol>
  ${notes}
</div>`.trim();
}

/**
 * The card of a random components roll.
 * @param {object} card
 * @param {object} card.creature   { name, img }
 * @param {string} card.title
 * @param {string} card.subtitle
 * @param {object[]} card.lines    [{ total, text, found?, nothing? }]
 * @param {string} card.note
 */
export function renderRandomCard(card) {
  const lines = card.lines.map(l => `
    <li class="ph-random-line${l.found ? " found" : ""}${l.nothing ? " nothing" : ""}">
      <span class="ph-random-total">${e(l.total)}</span>
      <span class="ph-random-text">${e(l.text)}</span>
    </li>`).join("");
  return `
<div class="primal-harvesting-card primal-harvesting-random">
  <header class="ph-card-head">
    <img src="${e(card.creature.img)}" alt="" width="40" height="40">
    <div class="ph-card-titles">
      <h3>${e(card.title)}</h3>
      <span class="ph-card-subtitle">${e(card.subtitle)}</span>
    </div>
  </header>
  <ol class="ph-random-lines">${lines}
  </ol>
  ${card.note ? `<p class="ph-note">${e(card.note)}</p>` : ""}
</div>`.trim();
}

/** Small marks after a component's name. */
export function tagsHTML(tags) {
  if ( !tags?.length ) return "";
  return ` ${tags.map(t => `<span class="ph-tag" data-tag="${e(t.code)}" data-tooltip="${e(t.label)}" title="${e(t.label)}">${e(t.code)}</span>`).join("")}`;
}

/**
 * The "ready to harvest" card.
 * @param {object} card
 * @param {string} card.title
 * @param {string} card.hint
 * @param {object[]} card.creatures  [{ uuid, name, img, detail }]
 * @param {string} card.button       The button's word ("Harvest").
 */
export function renderReadyCard(card) {
  const rows = card.creatures.map(c => `
    <li class="ph-ready-row">
      <img src="${e(c.img)}" alt="" width="32" height="32">
      <span class="ph-ready-name">${e(c.name)}<small>${e(c.detail)}</small></span>
      <button type="button" class="ph-ready-button" data-primal-harvest="open" data-token-uuid="${e(c.uuid)}">
        <i class="fa-solid fa-bone" inert></i> ${e(card.button)}
      </button>
    </li>`).join("");
  return `
<div class="primal-harvesting-card primal-harvesting-ready">
  <header class="ph-card-head ph-ready-head">
    <i class="fa-solid fa-bone" inert></i>
    <div class="ph-card-titles">
      <h3>${e(card.title)}</h3>
      <span class="ph-card-subtitle">${e(card.hint)}</span>
    </div>
  </header>
  <ul class="ph-ready-list">${rows}
  </ul>
</div>`.trim();
}
