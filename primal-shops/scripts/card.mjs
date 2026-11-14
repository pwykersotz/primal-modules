/**
 * Chat cards: a receipt for a purchase or a sale, and a note to a player that the GM turned down their offer. Built
 * from plain values (every text already in words), so they can be rendered and checked outside Foundry.
 */
import { escapeHTML as e } from "./constants.mjs";

/**
 * @param {object} v
 * @param {"buy"|"sell"} v.kind
 * @param {string} v.title       "Aria bought from The Gilded Anvil"
 * @param {string} v.img         The shop's picture.
 * @param {{name: string, img: string, qty: number, price: string}[]} v.lines
 * @param {string} v.totalLabel  "Total"
 * @param {string} v.total       "45 gp"
 * @param {string} [v.coins]     "Paid 4 gp 10 sp, change 5 sp"
 * @param {string} [v.note]      "Approved by the GM"
 */
export function renderReceipt(v) {
  return `
<div class="primal-shops-card ps-receipt ps-${e(v.kind)}">
  <header class="ps-card-head">
    <img src="${e(v.img)}" alt="">
    <h3>${e(v.title)}</h3>
  </header>
  <ul class="ps-card-lines">${v.lines.map(l => `
    <li>
      <img src="${e(l.img)}" alt="">
      <span class="ps-card-name">${l.qty > 1 ? `<span class="ps-card-qty">${e(l.qty)}×</span> ` : ""}${e(l.name)}</span>
      <span class="ps-card-price">${e(l.price)}</span>
    </li>`).join("")}
  </ul>
  <div class="ps-card-total"><span>${e(v.totalLabel)}</span><strong>${e(v.total)}</strong></div>
  ${v.coins ? `<p class="ps-card-coins">${e(v.coins)}</p>` : ""}
  ${v.note ? `<p class="ps-card-note">${e(v.note)}</p>` : ""}
</div>`;
}

/**
 * @param {object} v
 * @param {string} v.title  "The GM turned down your offer"
 * @param {string} v.img
 * @param {{name: string, qty: number}[]} v.lines
 * @param {string} [v.note]
 */
export function renderDeclined(v) {
  return `
<div class="primal-shops-card ps-declined">
  <header class="ps-card-head">
    <img src="${e(v.img)}" alt="">
    <h3>${e(v.title)}</h3>
  </header>
  <ul class="ps-card-lines">${v.lines.map(l => `
    <li><span class="ps-card-name">${l.qty > 1 ? `<span class="ps-card-qty">${e(l.qty)}×</span> ` : ""}${e(l.name)}</span></li>`).join("")}
  </ul>
  ${v.note ? `<p class="ps-card-note">${e(v.note)}</p>` : ""}
</div>`;
}
