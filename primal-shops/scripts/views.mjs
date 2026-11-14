/**
 * The shop window's HTML, built from a plain view (every text already in words), so it can be rendered and checked
 * outside Foundry. The window (apps/shop-window.mjs) works out the view and handles the clicks.
 */
import { escapeHTML as e } from "./constants.mjs";

export function options(list) {
  return list.map(o => `<option value="${e(o.value)}"${o.selected ? " selected" : ""}${o.disabled ? " disabled" : ""}>${e(o.label)}</option>`).join("");
}

const icon = (name, extra="") => `<i class="fa-solid ${name}${extra ? ` ${extra}` : ""}" inert></i>`;

/**
 * Re-draw a window's contents, keeping where it was scrolled to.
 * @param {HTMLElement} content  The window's content element.
 * @param {string} html
 */
export function replaceKeepingScroll(content, html) {
  const top = content.scrollTop;
  content.innerHTML = html;
  if ( top ) content.scrollTop = top;
}

/**
 * A window that grows to fit what's in it stops at the bottom of the screen (and scrolls, by its CSS): move it up
 * if it has grown past the bottom.
 * @param {ApplicationV2} app
 */
export function keepOnScreen(app) {
  const el = app.element;
  if ( !el?.isConnected || (typeof window === "undefined") ) return;
  const rect = el.getBoundingClientRect();
  const room = window.innerHeight;
  if ( rect.bottom > room + 1 ) app.setPosition?.({ top: Math.max(0, Math.floor(room - rect.height)) });
}

/** A purse as coins with dnd5e's coin pictures. */
export function purseHTML(coins) {
  return `<span class="ps-coins">${coins.map(c => `
    <span class="ps-coin ps-coin-${e(c.key)}" data-tooltip="${e(c.label)}">${c.icon ? `<img src="${e(c.icon)}" alt="">` : ""}${e(c.value)} <abbr>${e(c.abbr ?? c.key)}</abbr></span>`).join("")}
  </span>`;
}

function stockHTML(r) {
  if ( !r.stockText ) return `<span class="ps-stock"></span>`;
  return `<span class="ps-stock${r.soldOut ? " sold-out" : ""}">${e(r.stockText)}</span>`;
}

function buyRow(r, v) {
  const L = v.labels;
  const gm = v.isGM ? `
      <span class="ps-gm-cell">
        ${r.reasonText ? `<span class="ps-reason" data-tooltip="${e(r.reasonHint)}">${e(r.reasonText)}</span>` : ""}
        ${r.canSetStock ? `<input type="text" class="ps-stock-input" name="stock" data-key="${e(r.key)}" value="${e(r.stockInput)}" placeholder="${e(r.stockPlaceholder)}" data-tooltip="${e(L.stockHint)}" aria-label="${e(L.stock)}">` : ""}
        <button type="button" class="ps-icon-button" data-action="toggleHidden" data-key="${e(r.key)}" data-tooltip="${e(r.hidden ? L.unhide : L.hide)}" aria-label="${e(r.hidden ? L.unhide : L.hide)}">${icon(r.hidden ? "fa-eye-slash" : "fa-eye")}</button>
      </span>` : "";
  const details = r.expanded ? `
    <div class="ps-details">${r.description === null ? `<p class="ps-faint">${icon("fa-spinner", "fa-spin")} ${e(L.loading)}</p>` : (r.description || `<p class="ps-faint">${e(L.noDescription)}</p>`)}</div>` : "";
  return `
  <li class="ps-row rarity-${e(r.rarity || "mundane")}${r.unavailable ? " unavailable" : ""}${r.soldOut ? " sold-out" : ""}${r.tooDear ? " too-dear" : ""}${r.inCart ? " in-cart" : ""}" data-key="${e(r.key)}" data-search="${e(r.search)}">
    <div class="ps-row-main">
      <button type="button" class="ps-thumb" data-action="expand" data-key="${e(r.key)}" aria-label="${e(L.details)}" aria-expanded="${r.expanded}"><img src="${e(r.img)}" alt=""></button>
      <div class="ps-name">
        <a class="ps-item-name" data-action="expand" data-key="${e(r.key)}">${e(r.name)}${r.bundle > 1 ? ` <span class="ps-bundle">×${e(r.bundle)}</span>` : ""}</a>
        <div class="ps-sub">${r.facts.map(f => `<span>${e(f)}</span>`).join("")}</div>
      </div>
      ${stockHTML(r)}
      <span class="ps-price">${e(r.priceText)}</span>
      <button type="button" class="ps-add" data-action="add" data-key="${e(r.key)}"${r.canAdd ? "" : " disabled"} data-tooltip="${e(r.addHint)}" aria-label="${e(L.addToCart)}">${icon("fa-cart-plus")}</button>
      ${gm}
    </div>${details}
  </li>`;
}

function sellRow(r, v) {
  const L = v.labels;
  return `
  <li class="ps-row${r.reason ? " unavailable" : ""}${r.inCart ? " in-cart" : ""}" data-key="${e(r.id)}" data-search="${e(r.search)}">
    <div class="ps-row-main">
      <span class="ps-thumb"><img src="${e(r.img)}" alt=""></span>
      <div class="ps-name">
        <span class="ps-item-name">${e(r.name)}${r.quantity > 1 ? ` <span class="ps-bundle">×${e(r.quantity)}</span>` : ""}</span>
        <div class="ps-sub">${r.facts.map(f => `<span>${e(f)}</span>`).join("")}</div>
      </div>
      <span class="ps-stock">${r.reasonText ? e(r.reasonText) : ""}</span>
      <span class="ps-price">${e(r.priceText)}</span>
      <button type="button" class="ps-add" data-action="addSell" data-id="${e(r.id)}"${r.canAdd ? "" : " disabled"} aria-label="${e(L.addToSale)}" data-tooltip="${e(L.addToSale)}">${icon("fa-plus")}</button>
    </div>
  </li>`;
}

function groupedList(groups, v, rowFn, empty) {
  if ( !groups.length ) return `<div class="ps-empty"><p>${e(empty)}</p></div>`;
  return groups.map(g => `
  <section class="ps-group" data-category="${e(g.category)}">
    <h4 class="ps-group-title">${e(g.label)} <span class="ps-count">${e(g.rows.length)}</span></h4>
    <ul class="ps-rows">${g.rows.map(r => rowFn(r, v)).join("")}
    </ul>
  </section>`).join("");
}

function cartHTML(c, v, kind) {
  const L = v.labels;
  const lines = c.lines.length ? `
    <ul class="ps-cart-lines">${c.lines.map(l => `
      <li class="ps-cart-line" data-key="${e(l.key)}">
        <img src="${e(l.img)}" alt="">
        <span class="ps-cart-name">${e(l.name)}${l.note ? `<span class="ps-faint">${e(l.note)}</span>` : ""}</span>
        <span class="ps-qty">
          <button type="button" data-action="${kind === "buy" ? "dec" : "decSell"}" data-key="${e(l.key)}" aria-label="${e(L.less)}">${icon("fa-minus")}</button>
          <input type="number" name="${kind === "buy" ? "qty" : "sellQty"}" data-key="${e(l.key)}" value="${e(l.qty)}" min="1"${l.max ? ` max="${e(l.max)}"` : ""} aria-label="${e(L.quantity)}">
          <button type="button" data-action="${kind === "buy" ? "inc" : "incSell"}" data-key="${e(l.key)}"${l.atMax ? " disabled" : ""} aria-label="${e(L.more)}">${icon("fa-plus")}</button>
        </span>
        <span class="ps-cart-price">${e(l.totalText)}</span>
        <button type="button" class="ps-icon-button" data-action="${kind === "buy" ? "remove" : "removeSell"}" data-key="${e(l.key)}" aria-label="${e(L.remove)}">${icon("fa-xmark")}</button>
      </li>`).join("")}
    </ul>` : `<p class="ps-faint ps-cart-empty">${e(c.empty)}</p>`;
  const offers = c.offers.length ? `
    <div class="ps-offers">
      <h4>${e(L.waiting)}</h4>${c.offers.map(o => `
      <div class="ps-offer">
        <div class="ps-offer-head">${icon("fa-hourglass-half")} <span>${e(o.title)}</span>
          <button type="button" class="ps-small" data-action="cancelOffer" data-id="${e(o.id)}">${e(L.cancelOffer)}</button></div>
        <ul>${o.lines.map(l => `<li>${l.qty > 1 ? `${e(l.qty)}× ` : ""}${e(l.name)} <span class="ps-faint">${e(l.price)}</span></li>`).join("")}</ul>
        <div class="ps-offer-total">${e(o.total)}</div>
      </div>`).join("")}
    </div>` : "";
  return `
  <aside class="ps-cart">
    <header class="ps-cart-head">
      <h3>${icon(kind === "buy" ? "fa-basket-shopping" : "fa-sack-dollar")} ${e(c.title)}</h3>
      ${c.lines.length ? `<button type="button" class="ps-small" data-action="${kind === "buy" ? "clearCart" : "clearSell"}">${e(L.clear)}</button>` : ""}
    </header>
    <div class="ps-cart-body" data-scroll="${kind}-cart">${lines}</div>
    <footer class="ps-cart-foot">
      <div class="ps-total"><span>${e(c.totalLabel)}</span><strong>${e(c.totalText)}</strong></div>
      ${c.afterText ? `<div class="ps-after${c.short ? " short" : ""}"><span>${e(c.afterLabel)}</span><span>${e(c.afterText)}</span></div>` : ""}
      ${c.note ? `<p class="ps-cart-note">${e(c.note)}</p>` : ""}
      <button type="button" class="ps-checkout" data-action="${kind === "buy" ? "buy" : "sell"}"${c.canCheckout ? "" : " disabled"}${c.blockReason ? ` data-tooltip="${e(c.blockReason)}"` : ""}>
        ${icon(c.approval ? "fa-gavel" : (kind === "buy" ? "fa-coins" : "fa-hand-holding-dollar"))} ${e(c.checkoutLabel)}
      </button>
    </footer>
    ${offers}
  </aside>`;
}

/**
 * @param {object} v  The view (see ShopWindow#view).
 * @returns {string}
 */
export function renderShopWindow(v) {
  const L = v.labels;
  const gmBar = v.isGM ? `
  <div class="ps-gm-bar">
    <button type="button" class="ps-small" data-action="settings">${icon("fa-gear")} ${e(L.settings)}</button>
    <button type="button" class="ps-small" data-action="lists">${icon("fa-list-check")} ${e(L.lists)}</button>
    <button type="button" class="ps-small" data-action="restock" data-tooltip="${e(L.restockHint)}">${icon("fa-boxes-stacked")} ${e(L.restock)}</button>
    ${v.random ? `<button type="button" class="ps-small" data-action="reroll" data-tooltip="${e(L.rerollHint)}">${icon("fa-shuffle")} ${e(L.reroll)}</button>` : ""}
    <button type="button" class="ps-small${v.offerCount ? " ps-attention" : ""}" data-action="offers">${icon("fa-gavel")} ${e(v.offersLabel)}</button>
    <button type="button" class="ps-small" data-action="toggleOpen">${icon(v.open ? "fa-door-open" : "fa-door-closed")} ${e(v.open ? L.close : L.open)}</button>
    <button type="button" class="ps-small" data-action="sheet">${icon("fa-user")} ${e(L.sheet)}</button>
    <label class="ps-inline ps-show-all" data-tooltip="${e(L.showAllHint)}"><input type="checkbox" name="showAll"${v.showAll ? " checked" : ""}> ${e(L.showAll)}</label>
  </div>` : "";
  const banners = v.banners.map(b => `
  <p class="ps-banner ps-banner-${e(b.kind)}">${icon(b.icon)} ${e(b.text)}</p>`).join("");
  const buyer = v.buyers.length ? `
      <label class="ps-buyer-pick"><span>${e(L.tradingAs)}</span><select name="buyer">${options(v.buyers)}</select></label>
      ${purseHTML(v.purse)}` : `<p class="ps-warning">${e(L.noTrader)}</p>`;

  const tabs = `
  <nav class="ps-tabs">
    <button type="button" class="ps-tab${v.tab === "buy" ? " active" : ""}" data-action="showTab" data-tab="buy">${icon("fa-store")} ${e(L.buyTab)}</button>
    ${v.canSell ? `<button type="button" class="ps-tab${v.tab === "sell" ? " active" : ""}" data-action="showTab" data-tab="sell">${icon("fa-hand-holding-dollar")} ${e(L.sellTab)}</button>` : ""}
    <span class="ps-tab-note">${e(v.tabNote)}</span>
  </nav>`;

  const toolbar = `
  <div class="ps-toolbar">
    <label class="ps-search">${icon("fa-magnifying-glass")}<input type="search" name="query" value="${e(v.query)}" placeholder="${e(L.search)}" aria-label="${e(L.search)}"></label>
    ${v.tab === "buy" ? `
    <select name="category" aria-label="${e(L.kind)}">${options(v.categories)}</select>
    <select name="sort" aria-label="${e(L.sort)}">${options(v.sorts)}</select>
    <label class="ps-inline"><input type="checkbox" name="affordable"${v.affordable ? " checked" : ""}> ${e(L.affordable)}</label>` : `
    <select name="sellSort" aria-label="${e(L.sort)}">${options(v.sellSorts)}</select>`}
  </div>`;

  const body = (v.tab === "buy") ? `
  <div class="ps-body">
    <div class="ps-list" data-scroll="buy">${groupedList(v.groups, v, buyRow, v.emptyText)}</div>
    ${cartHTML(v.cart, v, "buy")}
  </div>` : `
  <div class="ps-body">
    <div class="ps-list" data-scroll="sell">${groupedList(v.sellGroups, v, sellRow, v.sellEmptyText)}</div>
    ${cartHTML(v.sale, v, "sell")}
  </div>`;

  return `
<div class="ps-shop${v.busy ? " busy" : ""}">
  <header class="ps-head">
    <img class="ps-portrait" src="${e(v.img)}" alt="">
    <div class="ps-title">
      <h2>${e(v.name)}</h2>
      ${v.greeting.length ? `<div class="ps-greeting">${v.greeting.map(p => `<p>${e(p)}</p>`).join("")}</div>` : ""}
      <div class="ps-facts">${v.facts.map(f => `<span class="ps-fact" ${f.hint ? `data-tooltip="${e(f.hint)}"` : ""}>${icon(f.icon)} ${e(f.text)}</span>`).join("")}</div>
    </div>
    <div class="ps-buyer">${buyer}</div>
  </header>
  ${gmBar}
  ${banners}
  ${tabs}
  ${toolbar}
  ${body}
</div>`;
}
