/**
 * The window's HTML, from plain data, so it can be drawn and checked without Foundry.
 */
import { escapeHTML as e } from "./constants.mjs";
import { LEVELS, percent } from "./verdict.mjs";

function row(r, side, L) {
  const details = (r.details?.length || r.notes?.length) ? `
      <ul class="pcr-details">
        ${(r.details ?? []).map(line => `<li>${e(line)}</li>`).join("")}
        ${(r.notes ?? []).map(line => `<li class="pcr-note"><i class="fa-solid fa-circle-info" inert></i> ${e(line)}</li>`).join("")}
      </ul>` : "";
  const count = r.canCount ? `
        <span class="pcr-count" data-tooltip="${e(L.count)}">
          <button type="button" data-action="fewer" aria-label="${e(L.fewer)}"><i class="fa-solid fa-minus" inert></i></button>
          <input type="number" name="count" value="${e(r.count)}" min="1" max="99" step="1" aria-label="${e(L.count)}">
          <button type="button" data-action="more" aria-label="${e(L.more)}"><i class="fa-solid fa-plus" inert></i></button>
        </span>` : "";
  const chips = (r.chips ?? []).map(c => `<span class="pcr-chip ${e(c.cls ?? "")}" data-tooltip="${e(c.tip ?? "")}">${e(c.text)}</span>`).join("");
  return `
    <li class="pcr-row${r.missing ? " pcr-missing" : ""}${r.open ? " pcr-open" : ""}" data-entry-id="${e(r.id)}">
      <div class="pcr-line">
        <button type="button" class="pcr-caret" data-action="toggleDetails" aria-label="${e(L.details)}" data-tooltip="${e(L.details)}"><i class="fa-solid fa-caret-right" inert></i></button>
        ${r.img ? `<img class="pcr-img" src="${e(r.img)}" alt="" loading="lazy">` : '<span class="pcr-img pcr-noimg"><i class="fa-solid fa-user" inert></i></span>'}
        <div class="pcr-who">
          <a class="pcr-name" data-action="openSheet" data-tooltip="${e(L.openSheet)}">${e(r.name)}</a>
          <span class="pcr-sub">${e(r.sub ?? "")}</span>
          ${chips ? `<span class="pcr-chips">${chips}</span>` : ""}
        </div>
        ${count}
        <button type="button" class="pcr-icon" data-action="moveEntry" aria-label="${e(side === "party" ? L.toEnemies : L.toParty)}" data-tooltip="${e(side === "party" ? L.toEnemies : L.toParty)}"><i class="fa-solid fa-right-left" inert></i></button>
        <button type="button" class="pcr-icon" data-action="removeEntry" aria-label="${e(L.remove)}" data-tooltip="${e(L.remove)}"><i class="fa-solid fa-xmark" inert></i></button>
      </div>${details}
    </li>`;
}

function stat(label, value, tip, cls = "") {
  return `<div class="pcr-stat ${cls}" data-tooltip="${e(tip)}"><span class="pcr-stat-value">${e(value)}</span><span class="pcr-stat-label">${e(label)}</span></div>`;
}

/**
 * @param {object} v  { L, verdict, result, thresholds, busy, party, enemies, rested, live, book, levelNames,
 *                      sentence, runsText }
 */
export function renderWindow(v) {
  const L = v.L;
  const r = v.result;
  const level = v.verdict?.level ?? "none";
  const meter = LEVELS.map(id => `<span class="pcr-step pcr-${id}${id === level ? " active" : ""}" data-tooltip="${e(v.levelHints?.[id] ?? "")}">${e(v.levelNames?.[id] ?? id)}</span>`).join("");
  const t = v.thresholds ?? {};
  const stats = (r && r.runs) ? `
      <div class="pcr-stats">
        ${stat(L.statWin, percent(r.win), L.statWinTip, r.win < t.impossible ? "pcr-flag" : "")}
        ${stat(L.statDrop, percent(r.drop), L.statDropTip, r.drop >= t.hard ? "pcr-flag" : "")}
        ${stat(L.statWipe, percent(r.wipe), L.statWipeTip, r.wipe >= t.boss ? "pcr-flag" : "")}
        ${stat(L.statDeath, percent(r.death), L.statDeathTip)}
        ${stat(L.statLost, percent(Math.min(1, r.hpLost)), L.statLostTip, r.hpLost >= t.medium ? "pcr-flag" : "")}
        ${stat(L.statRounds, r.rounds.toFixed(1), L.statRoundsTip)}
      </div>` : "";
  const list = (rows, side) => (rows.length
    ? `<ol class="pcr-list">${rows.map(x => row(x, side, L)).join("")}</ol>`
    : `<p class="pcr-empty">${e(side === "party" ? L.emptyParty : L.emptyEnemies)}</p>`);

  return `
<div class="pcr pcr-level-${e(level)}${v.busy ? " pcr-busy" : ""}">
  <header class="pcr-verdict">
    <div class="pcr-headline">
      <span class="pcr-level">${e(v.verdict ? (v.levelNames?.[level] ?? level) : L.noVerdict)}</span>
      <span class="pcr-sentence">${e(v.sentence ?? "")}</span>
    </div>
    <div class="pcr-meter" role="img" aria-label="${e(v.verdict ? (v.levelNames?.[level] ?? level) : L.noVerdict)}">${meter}</div>
    ${stats}
    ${v.book ? `<p class="pcr-book" data-tooltip="${e(L.bookTip)}">${e(v.book)}</p>` : ""}
  </header>

  <div class="pcr-sides">
    <section class="pcr-side" data-side="party">
      <h3><i class="fa-solid fa-shield-halved" inert></i> ${e(L.party)} <span class="pcr-total">${e(v.partyTotal ?? "")}</span>
        <button type="button" class="pcr-small" data-action="fillParty" data-tooltip="${e(L.fillPartyTip)}"><i class="fa-solid fa-users" inert></i> ${e(L.fillParty)}</button>
      </h3>
      ${list(v.party ?? [], "party")}
    </section>
    <section class="pcr-side" data-side="enemies">
      <h3><i class="fa-solid fa-skull" inert></i> ${e(L.enemies)} <span class="pcr-total">${e(v.enemiesTotal ?? "")}</span>
        <button type="button" class="pcr-small" data-action="clearEnemies" data-tooltip="${e(L.clearEnemiesTip)}"><i class="fa-solid fa-trash" inert></i> ${e(L.clearEnemies)}</button>
      </h3>
      ${list(v.enemies ?? [], "enemies")}
    </section>
  </div>
  <p class="pcr-hint">${e(L.dropHint)}</p>

  <footer class="pcr-foot">
    <span class="pcr-group" role="group" aria-label="${e(L.fromMap)}">
      <span class="pcr-group-label"><i class="fa-solid fa-map" inert></i> ${e(L.fromMap)}</span>
      <button type="button" data-action="addSelected" data-tooltip="${e(L.addSelectedTip)}">${e(L.addSelected)}</button>
      <button type="button" data-action="addScene" data-tooltip="${e(L.addSceneTip)}">${e(L.addScene)}</button>
      <button type="button" data-action="loadCombat" data-tooltip="${e(L.loadCombatTip)}">${e(L.loadCombat)}</button>
    </span>
    <label class="pcr-check" data-tooltip="${e(L.restedTip)}"><input type="checkbox" name="rested"${v.rested ? " checked" : ""}> ${e(L.rested)}</label>
    <label class="pcr-check" data-tooltip="${e(L.liveTip)}"><input type="checkbox" name="live"${v.live ? " checked" : ""}> ${e(L.live)}</label>
    <button type="button" data-action="scan" data-tooltip="${e(L.scanTip)}"><i class="fa-solid fa-magnifying-glass-chart" inert></i> ${e(L.scan)}</button>
    <span class="pcr-spacer"></span>
    <span class="pcr-runs">${e(v.runsText ?? "")}</span>
    <button type="button" class="pcr-go" data-action="rerun" data-tooltip="${e(L.rerunTip)}"><i class="fa-solid fa-dice-d20" inert></i> ${e(L.rerun)}</button>
  </footer>
</div>`.trim();
}


/**
 * The Scan window's contents: for each character, what was read, what wasn't, and the by-hand fields.
 * @param {object} v  { L, actors: [{ id, name, sub, read: string[], unread: [{name, reason}], unprepared, editable,
 *                      onHit, everyHit }] }
 */
export function renderScan(v) {
  const L = v.L;
  const actors = v.actors.map(a => {
    const read = a.read.map(line => `<li>${e(line)}</li>`).join("");
    const unread = a.unread.length
      ? `<ul class="pcr-scan-unread">${a.unread.map(u => `<li><strong>${e(u.name)}</strong> <span class="pcr-scan-why">${e(L.reasons[u.reason] ?? L.reasons.other)}</span></li>`).join("")}</ul>`
      : `<p class="pcr-scan-none">${e(L.unreadNone)}</p>`;
    const manual = a.editable ? `
      <div class="pcr-scan-manual">
        <label><span>${e(L.onHit)}</span>
          <input type="text" name="onHit.${e(a.id)}" value="${e(a.onHit ?? "")}" placeholder="2d6" data-tooltip="${e(L.onHitHint)}"></label>
        <label><span>${e(L.everyHit)}</span>
          <input type="text" name="everyHit.${e(a.id)}" value="${e(a.everyHit ?? "")}" placeholder="1d4" data-tooltip="${e(L.everyHitHint)}"></label>
      </div>` : "";
    return `
    <details class="pcr-scan-actor"${a.unread.length ? " open" : ""}>
      <summary><span class="pcr-scan-name">${e(a.name)}</span> <span class="pcr-scan-sub">${e(a.sub)}</span>
        <span class="pcr-chip ${a.unread.length ? "pcr-warn" : "pcr-good"}">${e(a.unread.length ? a.unreadText : L.allRead)}</span></summary>
      <h4>${e(L.unread)}</h4>
      ${unread}
      ${a.unprepared ? `<p class="pcr-scan-note">${e(a.unpreparedText)}</p>` : ""}
      ${manual}
      <h4>${e(L.read)}</h4>
      <ul class="pcr-scan-read">${read}</ul>
    </details>`;
  }).join("");
  return `<div class="pcr-scan"><p class="pcr-scan-intro">${e(L.intro)}</p>${actors}</div>`;
}
