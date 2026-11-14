/**
 * Offers waiting for the GM (GM): every shop's, in one window that opens when a player sends one. Each offer lists
 * what's bought or sold and for how much; the GM can change any price (haggling), then approve or turn it down. An
 * approved offer is made at once by this client, with a receipt in chat.
 */
import { MODULE_ID, escapeHTML as e, loc } from "../constants.mjs";
import { cpToGp, parsePrice, purseValue } from "../money.mjs";
import { allShops, getShop, getState, rates, shopName } from "../store.mjs";
import { answerOffer, money } from "../trade.mjs";
import { keepOnScreen, replaceKeepingScroll } from "../views.mjs";

const { ApplicationV2 } = foundry.applications.api;

let INSTANCE = null;

/** @param {object} v */
export function renderOffers(v) {
  const L = v.labels;
  if ( !v.shops.length ) return `<div class="ps-offers-window"><div class="ps-empty"><p>${e(L.none)}</p></div></div>`;
  return `
<div class="ps-offers-window${v.busy ? " busy" : ""}">${v.shops.map(s => `
  <section class="ps-offer-shop">
    <h3><img src="${e(s.img)}" alt=""> ${e(s.name)}</h3>${s.offers.map(o => `
    <article class="ps-offer-card ps-${e(o.kind)}" data-shop="${e(s.uuid)}" data-offer="${e(o.id)}">
      <header>
        <i class="fa-solid ${o.kind === "buy" ? "fa-basket-shopping" : "fa-hand-holding-dollar"}" inert></i>
        <strong>${e(o.title)}</strong>
        <span class="ps-faint">${e(o.byline)}</span>
      </header>
      <table class="ps-offer-lines">
        <thead><tr><th></th><th>${e(L.item)}</th><th>${e(L.qty)}</th><th>${e(L.each)}</th><th>${e(L.total)}</th></tr></thead>
        <tbody>${o.lines.map((l, i) => `
          <tr>
            <td><img src="${e(l.img)}" alt=""></td>
            <td>${e(l.name)}${l.note ? ` <span class="ps-faint">${e(l.note)}</span>` : ""}</td>
            <td class="ps-num">${e(l.qty)}</td>
            <td><input type="text" name="price" data-shop="${e(s.uuid)}" data-offer="${e(o.id)}" data-line="${i}" value="${e(l.priceInput)}" aria-label="${e(L.each)}" data-tooltip="${e(L.priceHint)}"></td>
            <td class="ps-num">${e(l.totalText)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      <div class="ps-offer-foot">
        <span class="ps-offer-sum">${e(L.total)}: <strong>${e(o.totalText)}</strong></span>
        ${o.purseText ? `<span class="ps-faint${o.short ? " ps-short" : ""}">${e(o.purseText)}</span>` : ""}
        <button type="button" class="ps-danger" data-action="decline" data-shop="${e(s.uuid)}" data-offer="${e(o.id)}"><i class="fa-solid fa-xmark" inert></i> ${e(L.decline)}</button>
        <button type="button" class="ps-primary" data-action="approve" data-shop="${e(s.uuid)}" data-offer="${e(o.id)}"><i class="fa-solid fa-check" inert></i> ${e(L.approve)}</button>
      </div>
    </article>`).join("")}
  </section>`).join("")}
</div>`;
}

export class OffersWindow extends ApplicationV2 {
  /** Open the window (GM), or bring it to the front. */
  static open() {
    if ( !game.user.isGM ) return null;
    if ( INSTANCE?.rendered ) {
      INSTANCE.bringToFront?.();
      INSTANCE.render();
      return INSTANCE;
    }
    INSTANCE = new OffersWindow();
    INSTANCE.render({ force: true });
    return INSTANCE;
  }

  /** Re-draw the window if it's open. */
  static refresh() {
    if ( INSTANCE?.rendered && !INSTANCE.busy ) INSTANCE.render();
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "primal-shops-offers",
    classes: ["primal-shops-offers"],
    tag: "div",
    window: { icon: "fa-solid fa-gavel", resizable: true },
    position: { width: 620, height: "auto" },
    actions: {
      approve: OffersWindow.#onApprove,
      decline: OffersWindow.#onDecline
    }
  };

  constructor(options={}) {
    super(options);
    /** Prices the GM typed, by "offer id:line": text as typed. */
    this.prices = new Map();
    this.busy = false;
  }

  /** @override */
  get title() {
    return loc("Offers.Title");
  }

  /** @override */
  async _prepareContext() {
    const r = rates();
    const shops = [];
    for ( const actor of allShops() ) {
      const state = getState(actor);
      if ( !state.offers.length ) continue;
      const shop = getShop(actor);
      shops.push({
        uuid: actor.uuid,
        name: shopName(actor, shop),
        img: actor.img,
        offers: state.offers.map(o => {
          let trader = null;
          try {
            trader = fromUuidSync(o.actorUuid);
          } catch {
            trader = null;
          }
          const lines = o.lines.map((l, i) => {
            const typed = this.prices.get(`${o.id}:${i}`);
            const unitCp = (typed !== undefined) ? (parsePrice(typed, r) ?? l.unitCp) : l.unitCp;
            return {
              name: l.name,
              img: l.img,
              qty: l.qty,
              note: l.unitCp ? "" : loc("Offers.NoPrice"),
              priceInput: (typed !== undefined) ? typed : String(cpToGp(l.unitCp, r)),
              unitCp,
              totalText: money(unitCp * l.qty)
            };
          });
          const total = lines.reduce((s, l) => s + (l.unitCp * l.qty), 0);
          let purseText = "";
          let short = false;
          if ( (o.kind === "buy") && trader?.system?.currency ) {
            const has = purseValue(trader.system.currency, r);
            short = has < total;
            purseText = loc("Offers.TheyHave", { name: trader.name, coins: money(has) });
          } else if ( (o.kind === "sell") && shop.purse && actor.system?.currency ) {
            const has = purseValue(actor.system.currency, r);
            short = has < total;
            purseText = loc("Offers.ShopHas", { coins: money(has) });
          }
          return {
            id: o.id,
            kind: o.kind,
            title: loc(o.kind === "buy" ? "Offers.WantsToBuy" : "Offers.WantsToSell", { name: o.actorName }),
            byline: loc("Offers.By", { name: o.userName, time: new Date(o.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }),
            lines,
            totalText: money(total),
            purseText,
            short
          };
        })
      });
    }
    return {
      busy: this.busy,
      shops,
      labels: {
        none: loc("Offers.None"), item: loc("Offers.Item"), qty: loc("Offers.Qty"), each: loc("Offers.Each"),
        total: loc("Offers.Total"), priceHint: loc("Offers.PriceHint"), approve: loc("Offers.Approve"), decline: loc("Offers.Decline")
      }
    };
  }

  /** @override */
  async _renderHTML(context) {
    return renderOffers(context);
  }

  /** @override */
  _replaceHTML(result, content) {
    replaceKeepingScroll(content, result);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    keepOnScreen(this);
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener("change", event => {
      const el = event.target;
      if ( el.name !== "price" ) return;
      this.prices.set(`${el.dataset.offer}:${el.dataset.line}`, el.value);
      this.render();
    });
  }

  /** @override */
  _onClose(options) {
    super._onClose?.(options);
    if ( INSTANCE === this ) INSTANCE = null;
  }

  async #answer(target, approve) {
    if ( this.busy ) return;
    const shopUuid = target.dataset.shop;
    const offerId = target.dataset.offer;
    const r = rates();
    // Read the prices from the boxes too, in case one was typed in and not yet changed.
    for ( const input of this.element.querySelectorAll(`input[name=price][data-offer="${CSS.escape(offerId)}"]`) ) {
      this.prices.set(`${offerId}:${input.dataset.line}`, input.value);
    }
    const offer = getState(await fromUuid(shopUuid)).offers.find(o => o.id === offerId);
    const prices = (offer?.lines ?? []).map((l, i) => {
      const typed = this.prices.get(`${offerId}:${i}`);
      return (typed === undefined) ? null : parsePrice(typed, r);
    });
    this.busy = true;
    try {
      await answerOffer({ shopUuid, offerId, approve, prices }, game.user);
      ui.notifications.info(loc(approve ? "Offers.DoneApproved" : "Offers.DoneDeclined"));
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not answer the offer`, err);
      ui.notifications.warn(err.message);
    }
    this.busy = false;
    if ( this.rendered ) this.render();
  }

  static #onApprove(event, target) {
    return this.#answer(target, true);
  }

  static #onDecline(event, target) {
    return this.#answer(target, false);
  }
}
