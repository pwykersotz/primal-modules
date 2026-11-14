/**
 * The harvest window's HTML, built from a plain view (every text already in words), so it can be rendered and
 * checked outside Foundry. The window (apps/harvest-window.mjs) works out the view and handles the clicks.
 */
import { escapeHTML as e } from "./constants.mjs";
import { tagsHTML } from "./card.mjs";

function options(list) {
  return list.map(o => `<option value="${e(o.value)}"${o.selected ? " selected" : ""}>${e(o.label)}</option>`).join("");
}

function signed(n) {
  const v = Math.round(Number(n) || 0);
  return v >= 0 ? `+${v}` : `${v}`;
}

/**
 * @param {object} v  The view (see HarvestWindow#view).
 * @returns {string}
 */
export function renderHarvestWindow(v) {
  const L = v.labels;
  const gmRow = v.isGM ? `
      <div class="ph-gm-row">
        <label><span>${e(L.harvestAs)}</span><select name="type">${options(v.typeOptions)}</select></label>
        <label><span>${e(L.creatureTable)}</span><select name="creature">${options(v.creatureOptions)}</select></label>
      </div>` : "";
  const unknownType = v.unknownType ? `<p class="ph-warning"><i class="fa-solid fa-triangle-exclamation" inert></i> ${e(v.unknownType)}</p>` : "";
  const harvested = v.harvested ? `
    <p class="ph-banner"><i class="fa-solid fa-circle-check" inert></i> ${e(v.harvested)}</p>` : "";
  const harvesting = v.harvesting ? `
    <p class="ph-banner ph-harvesting"><i class="fa-solid fa-spinner fa-spin" inert></i> ${e(v.harvesting)}</p>` : "";
  const notes = v.notes?.length ? `
  <div class="ph-notes">${v.notes.map(n => `
    <details class="ph-note">
      <summary><i class="fa-solid fa-book-open" inert></i> ${e(n.title)}</summary>
      ${n.paragraphs.map(p => `<p>${e(p)}</p>`).join("")}
    </details>`).join("")}
  </div>` : "";
  const random = (v.random?.canRoll || v.random?.rolled) ? `
      <div class="ph-random-roll">
        ${v.random.canRoll ? `<button type="button" class="ph-small" data-action="rollRandom" data-tooltip="${e(v.random.hint)}"><i class="fa-solid fa-dice-d20" inert></i> ${e(v.random.label)}</button>` : ""}
        ${v.random.rolled ? `<p class="ph-faint"><i class="fa-solid fa-dice-d20" inert></i> ${e(v.random.rolled)}</p>` : ""}
      </div>` : "";

  const emptyNote = v.noComponents ? `
      <div class="ph-empty">
        <p>${e(v.emptyAvailable)}</p>
        ${v.isGM ? `<button type="button" data-action="openTables"><i class="fa-solid fa-table-list" inert></i> ${e(L.openTables)}</button>` : ""}
      </div>` : "";
  const available = !v.available.length ? emptyNote : `${emptyNote}
      <ul class="ph-available-list">${v.available.map(c => `
        <li>
          <button type="button" class="ph-component${c.source === "essence" ? " ph-essence" : ""}" data-action="add" data-key="${e(c.key)}"${c.disabled ? " disabled" : ""}
            ${c.note ? `data-tooltip="${e(c.note)}"` : ""}>
            <span class="ph-component-name">${e(c.name)}${tagsHTML(c.tags)}${c.count ? ` <span class="ph-count">×${e(c.count)}</span>` : ""}</span>
            ${c.sourceLabel ? `<span class="ph-source">${e(c.sourceLabel)}</span>` : ""}
            <span class="ph-dc">${e(c.dcText)}</span>
            <i class="fa-solid fa-plus" inert></i>
          </button>
        </li>`).join("")}
      </ul>`;

  const quick = v.isGM ? `
      <div class="ph-quick">
        <input type="text" name="quickName" value="${e(v.quick.name)}" placeholder="${e(L.quickName)}" aria-label="${e(L.quickName)}">
        <input type="number" name="quickDC" value="${e(v.quick.dc)}" min="0" max="99" placeholder="${e(L.dc)}" aria-label="${e(L.dc)}">
        <input type="text" name="quickTags" value="${e(v.quick.tags)}" placeholder="${e(L.quickTags)}" aria-label="${e(L.quickTags)}">
        <label class="ph-inline" data-tooltip="${e(L.quickSaveHint)}"><input type="checkbox" name="quickSave"${v.quick.save ? " checked" : ""}> ${e(L.quickSave)}</label>
        <button type="button" data-action="quickAdd" aria-label="${e(L.quickAdd)}" data-tooltip="${e(L.quickAdd)}"><i class="fa-solid fa-plus" inert></i></button>
      </div>` : "";

  const list = v.list.length ? `
      <ol class="ph-harvest-list">${v.list.map((c, i) => `
        <li class="ph-row chance-${e(c.chance)}" draggable="true" data-index="${i}">
          <i class="fa-solid fa-grip-vertical ph-grip" inert></i>
          <span class="ph-row-name">${e(c.name)}${tagsHTML(c.tags)}</span>
          <span class="ph-row-dc" data-tooltip="${e(L.componentDC)}">+${e(c.dc)}</span>
          <span class="ph-row-hdc" data-tooltip="${e(c.chanceLabel)}">${e(c.harvestDC)}</span>
          <span class="ph-row-buttons">
            <button type="button" data-action="up" data-index="${i}" aria-label="${e(L.up)}"${i === 0 ? " disabled" : ""}><i class="fa-solid fa-chevron-up" inert></i></button>
            <button type="button" data-action="down" data-index="${i}" aria-label="${e(L.down)}"${i === v.list.length - 1 ? " disabled" : ""}><i class="fa-solid fa-chevron-down" inert></i></button>
            <button type="button" data-action="remove" data-index="${i}" aria-label="${e(L.remove)}"><i class="fa-solid fa-xmark" inert></i></button>
          </span>
        </li>`).join("")}
      </ol>` : `
      <div class="ph-empty"><p>${e(L.emptyList)}</p></div>`;

  const candidateOptions = (key, modKey) => v.candidates.map(c => ({
    value: c.uuid, label: `${c.name} (${signed(c[modKey])})`, selected: c[key]
  }));
  const noCandidates = !v.candidates.length;
  const ritual = v.ritual.allowed ? `
        <label class="ph-inline ph-ritual" data-tooltip="${e(L.ritualHint)}">
          <input type="checkbox" name="ritual"${v.ritual.checked ? " checked" : ""}${v.ritual.possible ? "" : " disabled"}>
          ${e(v.ritual.label)}
        </label>` : "";
  const helpers = (v.maxHelpers > 0) ? `
      <div class="ph-helpers">
        <span class="ph-helpers-label">${e(v.helpersLabel)}</span>
        <div class="ph-chips">${v.helpers.length ? v.helpers.map(h => `
          <label class="ph-chip${h.checked ? " checked" : ""}${h.disabled ? " disabled" : ""}" data-tooltip="${e(h.tooltip)}">
            <input type="checkbox" name="helper" value="${e(h.uuid)}"${h.checked ? " checked" : ""}${h.disabled ? " disabled" : ""}>
            ${e(h.name)} <span class="ph-chip-bonus">+${e(h.bonus)}</span>
          </label>`).join("") : `<span class="ph-faint">${e(L.noHelpers)}</span>`}
        </div>
      </div>` : `
      <div class="ph-helpers"><span class="ph-helpers-label">${e(v.helpersLabel)}</span></div>`;

  const guests = v.canAddGuests ? `
      <div class="ph-guests" data-tooltip="${e(L.addGuestHint)}">
        <span class="ph-helpers-label">${e(L.guests)}</span>
        <div class="ph-chips">${v.guests.map(g => `
          <span class="ph-chip ph-guest">${e(g.name)}
            <button type="button" data-action="removeGuest" data-uuid="${e(g.uuid)}" aria-label="${e(L.removeGuest)}"><i class="fa-solid fa-xmark" inert></i></button>
          </span>`).join("")}
          <button type="button" class="ph-small" data-action="addGuest"><i class="fa-solid fa-user-plus" inert></i> ${e(L.addGuest)}</button>
        </div>
      </div>` : "";
  const team = noCandidates ? `
    <section class="ph-team"><p class="ph-warning">${e(L.noCandidates)}</p>${guests}</section>` : `
    <section class="ph-team">
      <div class="ph-team-row">
        <label class="ph-field"><span>${e(v.assessLabel)}</span><select name="assessor">${options(candidateOptions("assessing", "assessMod"))}</select></label>
        <label class="ph-field"><span>${e(v.carveLabel)}</span><select name="carver">${options(candidateOptions("carving", "carveMod"))}</select></label>
        ${ritual}
      </div>
      ${v.both ? `<p class="ph-warning"><i class="fa-solid fa-triangle-exclamation" inert></i> ${e(v.both)}</p>` : ""}
      ${helpers}
      ${guests}
    </section>`;

  const a = v.approval;
  const approval = !a ? "" : a.gm ? `
    <button type="button" class="ph-approve${a.approved ? " approved" : ""}" data-action="approve" data-tooltip="${e(a.hint)}" aria-pressed="${a.approved}">
      <i class="fa-solid ${a.approved ? "fa-circle-check" : "fa-gavel"}" inert></i> ${e(a.label)}
    </button>` : `
    <span class="ph-approval${a.approved ? " approved" : ""}" data-tooltip="${e(a.hint)}">
      <i class="fa-solid ${a.approved ? "fa-circle-check" : "fa-hourglass-half"}" inert></i> ${e(a.label)}
    </span>`;
  const recipient = v.addItems && !noCandidates ? `
      <label class="ph-field ph-recipient"><span>${e(L.recipient)}</span><select name="recipient">${options(v.recipients)}</select></label>` : "";

  return `
<div class="ph-window${v.busy ? " busy" : ""}">
  <header class="ph-head">
    <img class="ph-portrait" src="${e(v.creature.img)}" alt="">
    <div class="ph-title">
      <h2>${e(v.creature.name)}</h2>
      <div class="ph-facts">${v.creature.facts.map(f => `<span>${e(f)}</span>`).join("")}</div>
      ${gmRow}
    </div>
    <dl class="ph-rule">
      <div><dt>${e(L.skill)}</dt><dd>${e(v.rule.skill)}</dd></div>
      <div><dt>${e(L.time)}</dt><dd>${e(v.rule.time)}</dd></div>
      <div><dt>${e(L.helpers)}</dt><dd>${e(v.rule.helpers)}</dd></div>
      <div><dt>${e(L.essence)}</dt><dd>${e(v.rule.essence)}</dd></div>
    </dl>
  </header>
  ${unknownType}${harvested}${harvesting}${notes}
  <section class="ph-columns">
    <div class="ph-col ph-col-available">
      <div class="ph-col-head">
        <h3>${e(v.availableTitle)}</h3>
        ${v.available.length ? `<button type="button" class="ph-small" data-action="addAll" data-tooltip="${e(L.addAllHint)}">${e(L.addAll)}</button>` : ""}
      </div>
      ${available}
      ${random}
      ${quick}
    </div>
    <div class="ph-col ph-col-list">
      <div class="ph-col-head">
        <h3>${e(L.harvestList)} <small>${e(L.orderMatters)}</small></h3>
        ${v.list.length ? `<button type="button" class="ph-small" data-action="clearList">${e(L.clear)}</button>` : ""}
      </div>
      ${list}
    </div>
  </section>
  ${team}
  <footer class="ph-foot">
    <div class="ph-expect" data-tooltip="${e(L.expectedHint)}"><span>${e(L.expected)}</span><strong>${e(v.expected)}</strong></div>
    ${recipient}
    ${approval}
    <button type="button" class="ph-go" data-action="harvest"${v.canHarvest ? "" : " disabled"}${v.blockReason ? ` data-tooltip="${e(v.blockReason)}"` : ""}>
      <i class="fa-solid ${v.busy ? "fa-spinner fa-spin" : "fa-bone"}" inert></i> ${e(v.harvestLabel)}
    </button>
  </footer>
</div>`.trim();
}
