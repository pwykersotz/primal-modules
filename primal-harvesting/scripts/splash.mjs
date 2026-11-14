/**
 * The harvest splash: once a harvest is rolled, a screen comes up for everyone who can see its chat card, with the
 * checks (each d20 and what's added to it), the total, and every component harvested. It waits for Dice So Nice's
 * dice to land, and goes away with a click or Escape. The HTML is built from plain data, already in words (made on
 * the roller's screen, kept on the chat card), so the checks can render it under Node.
 */
import { FLAGS, MODULE_ID, SETTINGS, escapeHTML as e, loc, setting } from "./constants.mjs";

/** The longest the splash waits for Dice So Nice. */
const DICE_WAIT_MS = 15000;

const signed = n => ((Number(n) >= 0) ? `+${n}` : `${n}`);

/**
 * The faces of a check's d20 (two with advantage or disadvantage, the one not kept faded) and what's added to it.
 * @param {Roll} roll
 * @returns {{dice: {value: number, active: boolean, crit: string}[], mod: number|null}}
 */
export function d20Of(roll) {
  const die = (roll?.dice ?? []).find(d => Number(d?.faces) === 20) ?? roll?.dice?.[0];
  const results = Array.isArray(die?.results) ? die.results : [];
  const dice = results.map(r => {
    const value = Number(r.result);
    return {
      value,
      active: (r.active !== false) && !r.discarded,
      crit: (value === 20) ? "max" : ((value === 1) ? "min" : "")
    };
  });
  const kept = Number(die?.total);
  const mod = (dice.length && Number.isFinite(kept)) ? Number(roll.total) - kept : null;
  return { dice, mod };
}

/**
 * The splash, as HTML.
 * @param {object} data
 * @param {string} data.title           "Harvested: Ghoul Priest"
 * @param {string} data.img
 * @param {string} data.subtitle
 * @param {object[]} data.checks        [{ label, who, dice: [{value, active, crit}], mod, total }]
 * @param {object[]} data.helpers       [{ name, bonus }]
 * @param {number} data.total
 * @param {object[]} data.harvested     [{ name, harvestDC, tags: [{code, label}] }]
 * @param {object} L                    The labels: total, helpers, harvested, nothing, close, dc.
 * @returns {string}
 */
export function renderSplash(data, L) {
  const checks = (data.checks ?? []).map(c => {
    const dice = (c.dice ?? []).length ? c.dice.map(d => `
          <span class="ph-die${d.active ? "" : " dropped"}${d.crit ? ` ${d.crit}` : ""}">${e(d.value)}</span>`).join("") : "";
    const mod = (c.mod === null) || (c.mod === undefined) ? "" : `<span class="ph-splash-mod">${e(signed(c.mod))}</span>`;
    return `
      <div class="ph-splash-check">
        <div class="ph-splash-who"><strong>${e(c.who)}</strong><span>${e(c.label)}</span></div>
        <div class="ph-splash-roll">${dice}${mod}<span class="ph-splash-eq">=</span><span class="ph-splash-sum">${e(c.total)}</span></div>
      </div>`;
  }).join("");
  const helpers = (data.helpers ?? []).length ? `
      <div class="ph-splash-check ph-splash-helpers">
        <div class="ph-splash-who"><strong>${e(L.helpers)}</strong><span>${e(data.helpers.map(h => `${h.name} ${signed(h.bonus)}`).join(", "))}</span></div>
        <div class="ph-splash-roll"><span class="ph-splash-sum">${e(signed(data.helpers.reduce((s, h) => s + (Number(h.bonus) || 0), 0)))}</span></div>
      </div>` : "";
  const harvested = (data.harvested ?? []).length ? data.harvested.map((c, i) => `
        <li style="--ph-i: ${i}"><i class="fa-solid fa-check" inert></i><span class="ph-splash-name">${e(c.name)}${(c.tags ?? []).map(t => ` <span class="ph-tag" data-tooltip="${e(t.label)}">${e(t.code)}</span>`).join("")}</span><span class="ph-splash-dc">${e(L.dc)} ${e(c.harvestDC)}</span></li>`).join("")
    : `
        <li class="ph-splash-none">${e(L.nothing)}</li>`;
  return `
<div class="ph-splash" role="dialog" aria-modal="true" aria-label="${e(data.title)}">
  <header class="ph-splash-head">
    ${data.img ? `<img src="${e(data.img)}" alt="">` : ""}
    <div>
      <h2>${e(data.title)}</h2>
      ${data.subtitle ? `<p>${e(data.subtitle)}</p>` : ""}
    </div>
  </header>
  <section class="ph-splash-checks">${checks}${helpers}
  </section>
  <div class="ph-splash-total"><span>${e(L.total)}</span><strong>${e(data.total)}</strong></div>
  <section class="ph-splash-harvested">
    <h3>${e(L.harvested)}</h3>
    <ul>${harvested}
    </ul>
  </section>
  <button type="button" class="ph-splash-close" data-close>${e(L.close)}</button>
</div>`.trim();
}

/** The splash's labels, in this user's language. */
export function splashLabels() {
  return {
    total: loc("Splash.Total"),
    helpers: loc("Splash.Helpers"),
    harvested: loc("Splash.Harvested"),
    nothing: loc("Splash.Nothing"),
    close: loc("Splash.Close"),
    dc: loc("Splash.DC")
  };
}

/** The splash of a new chat message, if it's a harvest card this user can see and wants splashes for. Or null. */
export function splashOf(message) {
  const data = message?.getFlag?.(MODULE_ID, FLAGS.card)?.splash ?? message?.flags?.[MODULE_ID]?.[FLAGS.card]?.splash;
  if ( !data || (typeof data !== "object") ) return null;
  if ( message.visible === false ) return null;
  if ( setting(SETTINGS.splash) === false ) return null;
  return data;
}

/** A chat message was made: show its harvest splash, once the dice have landed. */
export async function onChatMessage(message) {
  const data = splashOf(message);
  if ( !data ) return;
  const wait = game.dice3d?.waitFor3DAnimationByMessageID;
  if ( (typeof wait === "function") && message.id ) {
    await Promise.race([
      Promise.resolve().then(() => wait.call(game.dice3d, message.id)).catch(() => null),
      new Promise(resolve => setTimeout(resolve, DICE_WAIT_MS))
    ]);
  }
  showSplash(data);
}

let shown = null;

/** Put a splash on the screen (in place of one already there). */
export function showSplash(data) {
  closeSplash();
  if ( !globalThis.document?.createElement ) return null;
  const root = document.createElement("div");
  root.className = "primal-harvesting-splash";
  root.innerHTML = renderSplash(data, splashLabels());
  const onKey = event => {
    if ( event.key !== "Escape" ) return;
    event.preventDefault();
    event.stopPropagation();
    closeSplash();
  };
  root.addEventListener("click", event => {
    if ( (event.target === root) || event.target.closest?.("[data-close]") ) closeSplash();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.append(root);
  shown = { root, onKey };
  root.querySelector("[data-close]")?.focus?.();
  return root;
}

/** Take the splash off the screen. */
export function closeSplash() {
  if ( !shown ) return;
  document.removeEventListener?.("keydown", shown.onKey, true);
  shown.root.remove();
  shown = null;
}
