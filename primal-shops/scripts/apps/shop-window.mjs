/**
 * The shop window: one per shop. What the shop sells on the left (grouped by kind, with a search, a kind filter and a
 * sort), the cart on the right. The Sell tab lists what the chosen character carries, with what the shop pays for each.
 * Every trade is made by the GM's client (see trade.mjs); with the GM's approval needed (a world setting, on for
 * selling), it's sent as an offer and waits there, shown in the cart, until the GM answers it.
 *
 * The GM sees the same window with a bar of their own (settings, lists, restock, offers), can take any item out of the
 * shop or set its stock, and can see what players can't (above the shop's level, not in its random pick).
 */
import { FLAGS, MODULE_ID, SETTINGS, dnd5eLabel, escapeHTML, loc, setting } from "../constants.mjs";
import { SORTS, levelOf, nameKey, normalizeStock, sortRows } from "../catalog.mjs";
import { categoryOrder } from "../shop.mjs";
import { purseValue } from "../money.mjs";
import { getPins, getRibbons, getShop, isShop, rates, saveShop, shopActorOf, shopName, tokenDocOf } from "../store.mjs";
import { rangeCheck } from "../pins.mjs";
import { gmOnline, onBroadcast, runAsGM, tellGM } from "../gm.mjs";
import {
  coinLabels, money, needsApproval, restockShop, sellRate, sellRows, setHidden, setStock, shopContext
} from "../trade.mjs";
import { renderShopWindow } from "../views.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** Open windows, by shop actor id. */
const OPEN = new Map();

/** How this user last sorted a shop's wares and their own things, for the next shop they open. */
const LAST_SORT = { buy: "nameUp", sell: "nameUp" };
const BUY_SORTS = [...SORTS, "rarity"];

const TRADER_TYPES = ["character", "npc", "group"];

/** The shop level's words: "Up to Uncommon". */
export function levelLabel(level) {
  return loc(`Levels.${level}`);
}

/** A rarity's words ("Very Rare"), or "Mundane". */
export function rarityLabel(rarity) {
  return rarity ? dnd5eLabel("itemRarity", rarity) : loc("Kinds.mundane");
}

export class ShopWindow extends ApplicationV2 {
  /**
   * Open a shop's window, or bring it to the front.
   * @param {Actor|Token|TokenDocument} target
   * @param {{token?: TokenDocument}} [options]  The token it was opened from (for the shop's range).
   * @returns {ShopWindow|null}
   */
  static open(target, { token=null }={}) {
    const actor = shopActorOf(target);
    if ( !actor ) {
      ui.notifications.warn(loc("Errors.NoShop"));
      return null;
    }
    if ( !isShop(actor) ) {
      if ( game.user.isGM ) import("./shop-config.mjs").then(({ ShopConfig }) => ShopConfig.open(actor, { setup: true }));
      else ui.notifications.warn(loc("Errors.NoShop"));
      return null;
    }
    const existing = OPEN.get(actor.id);
    if ( existing?.rendered ) {
      if ( token ?? tokenDocOf(target) ) existing.token = token ?? tokenDocOf(target);
      existing.maximize?.();
      existing.bringToFront?.();
      existing.render();
      return existing;
    }
    const app = new ShopWindow(actor, { token: token ?? tokenDocOf(target) });
    app.render({ force: true });
    // A shop no one has opened yet (a random pick to make, stock to roll) is stocked by the GM's client.
    if ( !game.user.isGM && gmOnline() ) tellGM("stock", { shopUuid: actor.uuid }).catch(() => null);
    return app;
  }

  /** Re-draw every open shop window (the lists or settings changed). */
  static refreshAll() {
    for ( const app of OPEN.values() ) {
      if ( app.rendered && !app.busy ) app.render();
    }
  }

  /** An actor changed (a shop, or someone trading): re-draw the windows it's in. */
  static refreshFor(actor) {
    if ( !actor ) return;
    for ( const app of OPEN.values() ) {
      if ( !app.rendered || app.busy ) continue;
      if ( (app.actor === actor) || (app.actor?.id === actor.id) || (app.traderUuid === actor.uuid) || (app._trader === actor) ) app.render();
    }
  }

  /** Listen for what other clients say (offers made and answered). Called once the game is ready. */
  static listen() {
    onBroadcast("offer", async ({ userName }) => {
      if ( !game.user.isGM ) return;
      const { OffersWindow } = await import("./offers-window.mjs");
      if ( setting(SETTINGS.offersPopup) !== false ) OffersWindow.open();
      else ui.notifications.info(loc("Offers.Arrived", { name: userName ?? "" }));
      OffersWindow.refresh();
    });
    onBroadcast("answered", async data => {
      if ( (data.userId === game.user.id) && !game.user.isGM && (data.outcome !== "cancelled") ) {
        const key = (data.outcome === "approved") ? (data.kind === "buy" ? "Offers.ApprovedBuy" : "Offers.ApprovedSell") : "Offers.Declined";
        const notify = (data.outcome === "approved") ? "info" : "warn";
        ui.notifications[notify](loc(key, { name: data.actorName ?? "", total: (data.totalCp === null) ? "" : money(data.totalCp) }));
      }
      if ( game.user.isGM ) {
        const { OffersWindow } = await import("./offers-window.mjs");
        OffersWindow.refresh();
      }
    });
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["primal-shops-window"],
    tag: "div",
    window: {
      icon: "fa-solid fa-store",
      resizable: true
    },
    position: { width: 980, height: 720 },
    actions: {
      // Not "tab": that's ApplicationV2's own action (its tab groups), and Foundry would never call this one.
      showTab: ShopWindow.#onTab,
      add: ShopWindow.#onAdd,
      inc: ShopWindow.#onInc,
      dec: ShopWindow.#onDec,
      remove: ShopWindow.#onRemove,
      clearCart: ShopWindow.#onClearCart,
      buy: ShopWindow.#onBuy,
      addSell: ShopWindow.#onAddSell,
      incSell: ShopWindow.#onIncSell,
      decSell: ShopWindow.#onDecSell,
      removeSell: ShopWindow.#onRemoveSell,
      clearSell: ShopWindow.#onClearSell,
      sell: ShopWindow.#onSell,
      expand: ShopWindow.#onExpand,
      cancelOffer: ShopWindow.#onCancelOffer,
      toggleHidden: ShopWindow.#onToggleHidden,
      settings: ShopWindow.#onSettings,
      lists: ShopWindow.#onLists,
      restock: ShopWindow.#onRestock,
      reroll: ShopWindow.#onReroll,
      offers: ShopWindow.#onOffers,
      toggleOpen: ShopWindow.#onToggleOpen,
      sheet: ShopWindow.#onSheet
    }
  };

  constructor(actor, { token=null }={}, options={}) {
    super({ id: `primal-shops-${actor.id}`, ...options });
    this.actor = actor;
    this.token = token;
    this.tab = "buy";
    /** What's in the cart: entry key → how many. */
    this.cart = new Map();
    /** What's offered for sale: item id → how many. */
    this.sale = new Map();
    this.traderUuid = null;
    this.query = "";
    this.category = "";
    this.sort = LAST_SORT.buy;
    this.sellSort = LAST_SORT.sell;
    this.affordable = false;
    this.showAll = false;
    this.expanded = new Set();
    /** Item descriptions, enriched, by entry key (null while loading). */
    this.descriptions = new Map();
    this.busy = false;
    OPEN.set(actor.id, this);
  }

  /** @override */
  get title() {
    return shopName(this.actor);
  }

  /* -------------------------------------------- */
  /*  The model                                   */
  /* -------------------------------------------- */

  /** Who this user can trade as: the actors they own with coins (the GM: every character, and what they control). */
  #traders() {
    const user = game.user;
    let actors;
    if ( user.isGM ) {
      const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean);
      actors = [...(game.actors ?? [])].filter(a => ["character", "group"].includes(a.type) || a.hasPlayerOwner);
      for ( const a of controlled ) if ( !actors.includes(a) ) actors.push(a);
    } else {
      actors = [...(game.actors ?? [])].filter(a => a.testUserPermission(user, "OWNER"));
    }
    actors = actors.filter(a => TRADER_TYPES.includes(a.type) && a.system?.currency && (a.id !== this.actor.id));
    const own = user.character;
    return actors.sort((a, b) => ((b === own) - (a === own)) || ((a.type === "group") - (b.type === "group")) || a.name.localeCompare(b.name));
  }

  /**
   * Is the trader too far from the shop to trade, and from how far may they? Measured on the scene shown, as things
   * are now: from the nearest of the shop's tokens (the shop's range) and revealed map pins (each pin's range, else
   * the shop's) to the trader's token. A revealed ribbon on the scene: from anywhere. A token moved, deleted or put
   * down again counts as it is now. See rangeCheck.
   * @returns {{far: boolean, range: number|null}}
   */
  #range(shop, trader) {
    const free = { far: false, range: null };
    if ( game.user.isGM || !trader ) return free;
    const scene = globalThis.canvas?.scene;
    if ( !scene?.tokens ) return free;
    const ofActor = actor => (actor?.isToken && actor.token)
      ? [actor.token].filter(t => scene.tokens.has?.(t.id) ?? true)
      : scene.tokens.filter(t => (t.actorId ?? t.actor?.id) === actor?.id);
    const size = scene.grid?.size ?? globalThis.canvas?.grid?.size ?? 100;
    const center = doc => doc.object?.center ?? { x: doc.x + ((doc.width * size) / 2), y: doc.y + ((doc.height * size) / 2) };
    const shopTokens = scene.tokens.filter(t => shopActorOf(t)?.id === this.actor.id);
    const places = [
      ...shopTokens.map(t => ({ ...center(t), range: shop.range })),
      ...getPins(scene).filter(p => p.revealed && (p.actor === this.actor.id)).map(p => ({ x: p.x, y: p.y, range: p.range ?? shop.range, pin: true })),
      // A ribbon isn't anywhere on the map: from it, players trade from anywhere.
      ...getRibbons(scene).filter(r => r.revealed && (r.actor === this.actor.id)).map(() => ({ x: 0, y: 0, range: null, pin: true }))
    ];
    const traders = ofActor(trader).map(center);
    try {
      return rangeCheck({ places, traders, measure: (a, b) => canvas.grid.measurePath([a, b]).distance });
    } catch {
      return free;
    }
  }

  #model() {
    const ctx = shopContext(this.actor);
    const { shop, state } = ctx;
    const isGM = game.user.isGM;
    const traders = this.#traders();
    let trader = traders.find(a => a.uuid === this.traderUuid) ?? null;
    if ( !trader ) {
      const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(t => t.actor).find(a => traders.includes(a));
      trader = traders.find(a => a === game.user.character) ?? controlled ?? traders[0] ?? null;
      this.traderUuid = trader?.uuid ?? null;
    }
    this._trader = trader;
    const purseCp = trader ? purseValue(trader.system.currency, ctx.rates) : 0;

    // The cart keeps only what can still be bought, and no more than there is.
    const rowsByKey = new Map(ctx.rows.map(r => [r.key, r]));
    for ( const [key, qty] of [...this.cart] ) {
      const row = rowsByKey.get(key);
      if ( !row || (row.reason && (row.reason !== "soldOut")) || (row.stock === 0) ) this.cart.delete(key);
      else if ( Number.isInteger(row.stock) && (qty > row.stock) ) this.cart.set(key, row.stock);
    }
    const buyApproval = needsApproval("buy");
    const sellApproval = needsApproval("sell");
    const sellable = trader ? sellRows(ctx, trader, { gmPrices: sellApproval }) : [];
    const sellById = new Map(sellable.map(r => [r.id, r]));
    for ( const [id, qty] of [...this.sale] ) {
      const row = sellById.get(id);
      if ( !row || row.reason ) this.sale.delete(id);
      else if ( qty > row.quantity ) this.sale.set(id, row.quantity);
    }
    const offers = state.offers.filter(o => isGM || (o.userId === game.user.id));
    const canSell = isGM || (setting(SETTINGS.playersCanSell) !== false);
    if ( !canSell ) this.tab = "buy";
    const blocked = [];
    if ( !isGM && !shop.open ) blocked.push({ kind: "closed", icon: "fa-door-closed", text: loc("Shop.Closed") });
    if ( !isGM && !gmOnline() ) blocked.push({ kind: "warning", icon: "fa-user-slash", text: loc("Errors.NoGM") });
    const range = this.#range(shop, trader);
    if ( range.far ) blocked.push({ kind: "warning", icon: "fa-person-walking", text: loc("Shop.OutOfRange", { range: range.range, units: canvas?.scene?.grid?.units ?? "" }) });
    return { ctx, shop, state, isGM, traders, trader, purseCp, buyApproval, sellApproval, sellable, offers, canSell, blocked };
  }

  /* -------------------------------------------- */
  /*  The view                                    */
  /* -------------------------------------------- */

  #view(m) {
    const { ctx, shop, isGM } = m;
    const labels = coinLabels();
    const kindLabel = c => loc(`Kinds.${c}`);
    const words = text => nameKey(text);

    // What's for sale.
    const shown = ctx.rows.filter(r => {
      if ( isGM && this.showAll ) return true;
      return !r.reason || (r.reason === "soldOut") || (isGM && (r.reason === "noPrice"));
    });
    const categories = [...new Set(shown.map(r => r.category))].sort((a, b) => categoryOrder(a) - categoryOrder(b));
    if ( this.category && !categories.includes(this.category) ) this.category = "";
    const query = words(this.query).split(" ").filter(Boolean);
    const reasonText = r => {
      switch ( r.reason ) {
        case "hidden": return [loc("Reasons.hidden"), loc("Reasons.hiddenHint")];
        case "level": return [loc("Reasons.level", { level: levelOf(r) }), loc("Reasons.levelHint", { level: levelOf(r), shop: shop.level })];
        case "price": return [loc("Reasons.price"), loc("Reasons.priceHint", { price: money(Math.round((shop.maxPriceGp ?? 0) * (ctx.rates.gp ?? 100))) })];
        case "noPrice": return [loc("Reasons.noPrice"), loc("Reasons.noPriceHint")];
        case "notPicked": return [loc("Reasons.notPicked"), loc("Reasons.notPickedHint")];
        default: return ["", ""];
      }
    };
    const rows = shown
      .filter(r => !this.category || (r.category === this.category))
      .filter(r => !this.affordable || (r.priceCp <= m.purseCp))
      .map(r => {
        const inCart = this.cart.get(r.key) ?? 0;
        const [reason, reasonHint] = reasonText(r);
        const soldOut = r.stock === 0;
        const limited = Number.isInteger(r.stock);
        const left = limited ? r.stock - inCart : Infinity;
        const facts = [kindLabel(r.category)];
        if ( r.rarity ) facts.push(rarityLabel(r.rarity));
        if ( r.attunement ) facts.push(loc("Shop.Attunement"));
        if ( r.book ) facts.push(r.book);
        if ( isGM && r.listName ) facts.push(r.listName);
        if ( isGM && (r.source === "own") ) facts.push(loc("Shop.OwnItem"));
        const unavailable = !!r.reason && (r.reason !== "soldOut");
        return {
          key: r.key,
          category: r.category,
          name: r.name,
          img: r.img,
          rarity: r.rarity,
          bundle: r.bundle,
          facts,
          search: words(`${r.name} ${r.book ?? ""}`),
          priceCp: r.priceCp,
          priceText: r.priceCp ? money(r.priceCp) : loc("Shop.NoPrice"),
          stockText: soldOut ? loc("Shop.SoldOut") : (limited ? loc("Shop.Left", { n: r.stock }) : (r.stock === undefined ? loc("Shop.InStock") : "")),
          soldOut,
          tooDear: !!r.priceCp && (r.priceCp > m.purseCp),
          unavailable,
          hidden: r.reason === "hidden",
          reasonText: isGM ? reason : "",
          reasonHint,
          inCart: inCart > 0,
          canAdd: !unavailable && !soldOut && (left > 0) && (r.priceCp > 0),
          addHint: inCart ? loc("Shop.InCart", { n: inCart }) : loc("Shop.AddToCart"),
          canSetStock: isGM && (r.source === "list"),
          stockInput: limited ? String(r.stock) : "",
          stockPlaceholder: r.listStock ?? "∞",
          expanded: this.expanded.has(r.key),
          description: this.expanded.has(r.key) ? (this.descriptions.has(r.key) ? this.descriptions.get(r.key) : null) : "",
          sortName: r.name,
          rarityRank: levelOf({ rarity: r.rarity })
        };
      });
    sortRows(rows, this.sort, { name: r => r.sortName, price: r => r.priceCp, rank: r => r.rarityRank });
    const groups = categories.map(c => ({
      category: c,
      label: kindLabel(c),
      rows: rows.filter(r => (r.category === c) && (!query.length || query.every(w => r.search.includes(w))))
    })).filter(g => g.rows.length);

    // The cart.
    const cartLines = [...this.cart].map(([key, qty]) => {
      const row = ctx.rows.find(r => r.key === key);
      if ( !row ) return null;
      return {
        key,
        name: row.name,
        img: row.img,
        qty,
        max: Number.isInteger(row.stock) ? row.stock : null,
        atMax: Number.isInteger(row.stock) && (qty >= row.stock),
        note: row.bundle > 1 ? loc("Shop.Each", { price: money(row.priceCp), n: row.bundle }) : loc("Shop.EachPrice", { price: money(row.priceCp) }),
        totalCp: row.priceCp * qty,
        totalText: money(row.priceCp * qty)
      };
    }).filter(Boolean);
    const cartTotal = cartLines.reduce((s, l) => s + l.totalCp, 0);
    const short = cartTotal > m.purseCp;
    const blockReason = this.#blockReason(m, "buy", { total: cartTotal, short, count: cartLines.length });
    const cart = {
      title: loc("Shop.Cart"),
      empty: loc("Shop.CartEmpty"),
      lines: cartLines,
      totalLabel: loc("Shop.Total"),
      totalText: money(cartTotal),
      afterLabel: loc("Shop.After"),
      afterText: m.trader ? (short ? loc("Shop.Short", { short: money(cartTotal - m.purseCp) }) : money(m.purseCp - cartTotal)) : "",
      short,
      approval: m.buyApproval,
      note: m.buyApproval ? loc("Shop.BuyApprovalNote") : "",
      checkoutLabel: m.buyApproval ? loc("Shop.AskToBuy") : loc("Shop.Buy"),
      canCheckout: !blockReason && !this.busy,
      blockReason,
      offers: this.#offerViews(m, "buy")
    };

    // Selling.
    const rate = sellRate(shop);
    const sellReason = r => ({ container: loc("Reasons.container"), notBought: loc("Reasons.notBought"), noPrice: loc("Reasons.noPriceSell") })[r.reason] ?? "";
    const sellShown = m.sellable.map(r => {
      const facts = [kindLabel(r.category)];
      if ( r.equipped ) facts.push(loc("Shop.Equipped"));
      if ( r.attuned ) facts.push(loc("Shop.Attuned"));
      const inSale = this.sale.get(r.id) ?? 0;
      return {
        ...r,
        facts,
        search: words(r.name),
        priceText: r.unitCp ? loc("Shop.EachPrice", { price: money(r.unitCp) }) : loc("Shop.GMNamesPrice"),
        reasonText: sellReason(r),
        inCart: inSale > 0,
        canAdd: !r.reason && (inSale < r.quantity)
      };
    });
    sortRows(sellShown, this.sellSort, { name: r => r.name, price: r => r.unitCp });
    const sellCategories = [...new Set(sellShown.map(r => r.category))].sort((a, b) => categoryOrder(a) - categoryOrder(b));
    const sellGroups = sellCategories.map(c => ({
      category: c,
      label: kindLabel(c),
      rows: sellShown.filter(r => (r.category === c) && (!query.length || query.every(w => r.search.includes(w))))
    })).filter(g => g.rows.length);
    const saleLines = [...this.sale].map(([id, qty]) => {
      const row = m.sellable.find(r => r.id === id);
      if ( !row ) return null;
      return {
        key: id,
        name: row.name,
        img: row.img,
        qty,
        max: row.quantity,
        atMax: qty >= row.quantity,
        note: row.unitCp ? loc("Shop.EachPrice", { price: money(row.unitCp) }) : loc("Shop.GMNamesPrice"),
        totalCp: row.unitCp * qty,
        totalText: row.unitCp ? money(row.unitCp * qty) : "—"
      };
    }).filter(Boolean);
    const saleTotal = saleLines.reduce((s, l) => s + l.totalCp, 0);
    const shopShort = shop.purse && this.actor.system?.currency && (saleTotal > purseValue(this.actor.system.currency, ctx.rates));
    const sellBlock = this.#blockReason(m, "sell", { total: saleTotal, count: saleLines.length, shopShort });
    const sale = {
      title: loc("Shop.Sale"),
      empty: loc("Shop.SaleEmpty"),
      lines: saleLines,
      totalLabel: loc(m.sellApproval ? "Shop.Offered" : "Shop.YouGet"),
      totalText: money(saleTotal),
      afterLabel: "",
      afterText: "",
      short: false,
      approval: m.sellApproval,
      note: [m.sellApproval ? loc("Shop.SellApprovalNote") : "", shopShort ? loc("Shop.ShopShort", { name: shopName(this.actor, shop) }) : ""].filter(Boolean).join(" "),
      checkoutLabel: m.sellApproval ? loc("Shop.OfferToSell") : loc("Shop.Sell"),
      canCheckout: !sellBlock && !this.busy,
      blockReason: sellBlock,
      offers: this.#offerViews(m, "sell")
    };

    const currencies = globalThis.CONFIG?.DND5E?.currencies ?? {};
    const purse = m.trader ? Object.keys(ctx.rates).map(key => ({
      key,
      label: currencies[key]?.label ? game.i18n.localize(currencies[key].label) : key,
      icon: currencies[key]?.icon ?? "",
      abbr: currencies[key]?.abbreviation ? game.i18n.localize(currencies[key].abbreviation) : key,
      value: Math.max(0, Math.floor(Number(m.trader.system.currency?.[key]) || 0))
    })) : [];

    const facts = [{ icon: "fa-layer-group", text: levelLabel(shop.level), hint: loc("Shop.LevelHint") }];
    if ( shop.markup !== 100 ) facts.push({ icon: "fa-percent", text: loc("Shop.Markup", { n: shop.markup }) });
    if ( m.canSell ) {
      facts.push(shop.buys === "none"
        ? { icon: "fa-ban", text: loc("Shop.BuysNothing") }
        : { icon: "fa-hand-holding-dollar", text: loc(shop.buys === "same" ? "Shop.BuysSame" : "Shop.BuysAt", { n: rate }) });
    }
    if ( !shop.open ) facts.push({ icon: "fa-door-closed", text: loc("Shop.ClosedChip") });

    const offerCount = isGM ? this.#allOfferCount() : 0;
    return {
      isGM,
      busy: this.busy,
      name: shopName(this.actor, shop),
      img: this.actor.img,
      greeting: shop.greeting.split(/\n+/).map(p => p.trim()).filter(Boolean),
      facts,
      buyers: m.traders.map(a => ({ value: a.uuid, label: a.name, selected: a === m.trader })),
      purse,
      banners: m.blocked,
      tab: this.tab,
      canSell: m.canSell,
      tabNote: (this.tab === "sell") ? loc("Shop.SellNote", { n: rate }) : "",
      query: this.query,
      categories: [{ value: "", label: loc("Shop.AllKinds"), selected: !this.category },
        ...categories.map(c => ({ value: c, label: kindLabel(c), selected: c === this.category }))],
      sorts: BUY_SORTS.map(s => ({ value: s, label: loc(`Shop.Sort.${s}`), selected: s === this.sort })),
      sellSorts: SORTS.map(s => ({ value: s, label: loc(`Shop.Sort.${s}`), selected: s === this.sellSort })),
      affordable: this.affordable,
      showAll: this.showAll,
      groups,
      emptyText: ctx.rows.length ? loc("Shop.NothingMatches") : loc(isGM ? "Shop.EmptyGM" : "Shop.Empty"),
      sellGroups,
      sellEmptyText: m.trader ? loc("Shop.NothingToSell", { name: m.trader.name }) : loc("Shop.NoTrader"),
      cart,
      sale,
      random: shop.random.enabled,
      open: shop.open,
      offerCount,
      offersLabel: offerCount ? loc("Shop.OffersCount", { n: offerCount }) : loc("Shop.Offers"),
      labels: {
        settings: loc("Shop.Settings"), lists: loc("Shop.Lists"), restock: loc("Shop.Restock"), restockHint: loc("Shop.RestockHint"),
        reroll: loc("Shop.Reroll"), rerollHint: loc("Shop.RerollHint"), close: loc("Shop.CloseShop"), open: loc("Shop.OpenShop"),
        sheet: loc("Shop.Sheet"), showAll: loc("Shop.ShowAll"), showAllHint: loc("Shop.ShowAllHint"), tradingAs: loc("Shop.TradingAs"),
        noTrader: loc("Shop.NoTrader"), buyTab: loc("Shop.BuyTab"), sellTab: loc("Shop.SellTab"), search: loc("Shop.Search"),
        kind: loc("Shop.Kind"), sort: loc("Shop.SortBy"), affordable: loc("Shop.Affordable"), stock: loc("Shop.Stock"),
        stockHint: loc("Shop.StockHint"), hide: loc("Shop.Hide"), unhide: loc("Shop.Unhide"), loading: loc("Shop.Loading"),
        noDescription: loc("Shop.NoDescription"), details: loc("Shop.Details"), addToCart: loc("Shop.AddToCart"),
        addToSale: loc("Shop.AddToSale"), less: loc("Shop.Less"), more: loc("Shop.More"), quantity: loc("Shop.Quantity"),
        remove: loc("Shop.Remove"), clear: loc("Shop.Clear"), waiting: loc("Shop.Waiting"), cancelOffer: loc("Shop.CancelOffer")
      }
    };
  }

  #offerViews(m, kind) {
    return m.offers.filter(o => o.kind === kind).map(o => ({
      id: o.id,
      title: loc(kind === "buy" ? "Shop.OfferBuyTitle" : "Shop.OfferSellTitle", { name: o.actorName }),
      lines: o.lines.map(l => ({ name: l.name, qty: l.qty, price: l.unitCp ? money(l.unitCp * l.qty) : loc("Shop.GMNamesPrice") })),
      total: money(o.lines.reduce((s, l) => s + (l.unitCp * l.qty), 0))
    }));
  }

  #allOfferCount() {
    let n = 0;
    for ( const a of game.actors ?? [] ) {
      if ( isShop(a) ) n += (a.getFlag(MODULE_ID, FLAGS.state)?.offers?.length ?? 0);
    }
    return n;
  }

  /** Why the checkout can't be pressed now, or "". */
  #blockReason(m, kind, { total, short=false, count, shopShort=false }) {
    if ( m.blocked.length ) return m.blocked[0].text;
    if ( !m.trader ) return loc("Shop.NoTrader");
    if ( !count ) return loc(kind === "buy" ? "Shop.CartEmpty" : "Shop.SaleEmpty");
    if ( (kind === "buy") && short ) return loc("Shop.CantAfford");
    if ( (kind === "sell") && shopShort && !m.sellApproval ) return loc("Shop.ShopShort", { name: shopName(this.actor, m.shop) });
    if ( (kind === "sell") && (m.shop.buys === "none") ) return loc("Shop.BuysNothing");
    return "";
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const model = this.#model();
    this._model = model;
    return this.#view(model);
  }

  /** @override */
  async _renderHTML(context, options) {
    return renderShopWindow(context);
  }

  /** @override */
  _replaceHTML(result, content, options) {
    // Keep where each list was scrolled to, and what had focus, across the re-draw.
    const scrolls = {};
    for ( const el of content.querySelectorAll("[data-scroll]") ) scrolls[el.dataset.scroll] = el.scrollTop;
    const active = content.contains(document.activeElement) ? document.activeElement : null;
    const focus = active?.name ? { name: active.name, key: active.dataset?.key ?? null, start: active.selectionStart, end: active.selectionEnd } : null;
    content.innerHTML = result;
    for ( const el of content.querySelectorAll("[data-scroll]") ) {
      if ( scrolls[el.dataset.scroll] ) el.scrollTop = scrolls[el.dataset.scroll];
    }
    if ( focus ) {
      const selector = `[name="${focus.name}"]${focus.key ? `[data-key="${CSS.escape(focus.key)}"]` : ""}`;
      const el = content.querySelector(selector);
      if ( el ) {
        el.focus();
        try {
          if ( (focus.start !== null) && (focus.start !== undefined) ) el.setSelectionRange(focus.start, focus.end);
        } catch {
          // Not a text input.
        }
      }
    }
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    const root = this.element;
    root.addEventListener("change", this.#onChange.bind(this));
    // The search filters the rows as you type, without re-drawing.
    root.addEventListener("input", event => {
      if ( event.target.name !== "query" ) return;
      this.query = event.target.value;
      this.#filterRows();
    });
  }

  #filterRows() {
    const words = nameKey(this.query).split(" ").filter(Boolean);
    for ( const group of this.element.querySelectorAll(".ps-group") ) {
      let shown = 0;
      for ( const row of group.querySelectorAll(".ps-row") ) {
        const ok = !words.length || words.every(w => (row.dataset.search ?? "").includes(w));
        row.hidden = !ok;
        if ( ok ) shown++;
      }
      group.hidden = !shown;
      const count = group.querySelector(".ps-count");
      if ( count ) count.textContent = String(shown);
    }
  }

  /** @override */
  _onClose(options) {
    super._onClose?.(options);
    if ( OPEN.get(this.actor?.id) === this ) OPEN.delete(this.actor.id);
  }

  /* -------------------------------------------- */
  /*  Changes                                     */
  /* -------------------------------------------- */

  async #onChange(event) {
    const el = event.target;
    switch ( el.name ) {
      case "buyer":
        this.traderUuid = el.value;
        this.sale.clear();
        break;
      case "category":
        this.category = el.value;
        break;
      case "sort":
        this.sort = LAST_SORT.buy = BUY_SORTS.includes(el.value) ? el.value : "nameUp";
        break;
      case "sellSort":
        this.sellSort = LAST_SORT.sell = SORTS.includes(el.value) ? el.value : "nameUp";
        break;
      case "affordable":
        this.affordable = el.checked;
        break;
      case "showAll":
        this.showAll = el.checked;
        break;
      case "qty": {
        const n = Math.max(0, Math.floor(Number(el.value) || 0));
        if ( n ) this.cart.set(el.dataset.key, n);
        else this.cart.delete(el.dataset.key);
        break;
      }
      case "sellQty": {
        const n = Math.max(0, Math.floor(Number(el.value) || 0));
        if ( n ) this.sale.set(el.dataset.key, n);
        else this.sale.delete(el.dataset.key);
        break;
      }
      case "stock": {
        if ( !game.user.isGM ) return;
        const raw = String(el.value ?? "").trim();
        const n = raw === "" ? null : Number(normalizeStock(raw));
        if ( (raw !== "") && !Number.isFinite(n) ) {
          ui.notifications.warn(loc("Shop.StockInvalid"));
          break;
        }
        await setStock(this.actor, el.dataset.key, n);
        return;
      }
      case "query":
        return;
      default:
        return;
    }
    this.render();
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onTab(event, target) {
    this.tab = target.dataset.tab === "sell" ? "sell" : "buy";
    this.render();
  }

  #rowOf(key) {
    return this._model?.ctx.rows.find(r => r.key === key) ?? null;
  }

  #setCart(key, qty) {
    const row = this.#rowOf(key);
    if ( !row ) return;
    let n = Math.max(0, qty);
    if ( Number.isInteger(row.stock) ) n = Math.min(n, row.stock);
    if ( n ) this.cart.set(key, n);
    else this.cart.delete(key);
    this.render();
  }

  static #onAdd(event, target) {
    this.#setCart(target.dataset.key, (this.cart.get(target.dataset.key) ?? 0) + 1);
  }

  static #onInc(event, target) {
    this.#setCart(target.dataset.key, (this.cart.get(target.dataset.key) ?? 0) + 1);
  }

  static #onDec(event, target) {
    this.#setCart(target.dataset.key, (this.cart.get(target.dataset.key) ?? 0) - 1);
  }

  static #onRemove(event, target) {
    this.cart.delete(target.dataset.key);
    this.render();
  }

  static #onClearCart() {
    this.cart.clear();
    this.render();
  }

  #setSale(id, qty) {
    const row = this._model?.sellable.find(r => r.id === id);
    if ( !row ) return;
    const n = Math.max(0, Math.min(qty, row.quantity));
    if ( n ) this.sale.set(id, n);
    else this.sale.delete(id);
    this.render();
  }

  static #onAddSell(event, target) {
    this.#setSale(target.dataset.id, (this.sale.get(target.dataset.id) ?? 0) + 1);
  }

  static #onIncSell(event, target) {
    this.#setSale(target.dataset.key, (this.sale.get(target.dataset.key) ?? 0) + 1);
  }

  static #onDecSell(event, target) {
    this.#setSale(target.dataset.key, (this.sale.get(target.dataset.key) ?? 0) - 1);
  }

  static #onRemoveSell(event, target) {
    this.sale.delete(target.dataset.key);
    this.render();
  }

  static #onClearSell() {
    this.sale.clear();
    this.render();
  }

  /** Make a trade (or send it to the GM as an offer). */
  async #trade(kind) {
    if ( this.busy ) return;
    const m = this.#model();
    const lines = (kind === "buy")
      ? [...this.cart].map(([key, qty]) => ({ key, qty }))
      : [...this.sale].map(([itemId, qty]) => ({ itemId, qty }));
    if ( !lines.length || !m.trader ) return;
    const approval = needsApproval(kind);
    this.busy = true;
    await this.render();
    try {
      const data = { shopUuid: this.actor.uuid, actorUuid: m.trader.uuid, lines };
      if ( approval ) {
        await runAsGM("offer", { ...data, kind });
        ui.notifications.info(loc("Shop.OfferSent"));
      } else {
        const result = await runAsGM(kind, data);
        ui.notifications.info(loc(kind === "buy" ? "Shop.Bought" : "Shop.Sold", { n: result?.names?.length ?? lines.length, total: money(result?.totalCp ?? 0) }));
      }
      if ( kind === "buy" ) this.cart.clear();
      else this.sale.clear();
    } catch (err) {
      ui.notifications.warn(err.message);
    }
    this.busy = false;
    if ( this.rendered ) this.render();
  }

  static #onBuy() {
    return this.#trade("buy");
  }

  static #onSell() {
    return this.#trade("sell");
  }

  /** Show or hide an item's description (read once, from the item, or from the GM for a compendium players can't read). */
  static async #onExpand(event, target) {
    const key = target.dataset.key;
    if ( this.expanded.has(key) ) {
      this.expanded.delete(key);
      this.render();
      return;
    }
    this.expanded.add(key);
    this.render();
    if ( this.descriptions.has(key) ) return;
    const row = this.#rowOf(key);
    let html = "";
    try {
      if ( row?.source === "own" ) html = String(this.actor.items.get(row.itemId)?.system?.description?.value ?? "");
      else if ( row?.uuid ) {
        try {
          const item = await fromUuid(row.uuid);
          html = String(item?.system?.description?.value ?? "");
        } catch {
          html = "";
        }
        if ( !html && !game.user.isGM && gmOnline() ) html = await runAsGM("describe", { shopUuid: this.actor.uuid, key });
      }
      else if ( row ) html = String(row.description ?? "").split(/\n+/).filter(Boolean).map(p => `<p>${escapeHTML(p)}</p>`).join("");
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
      if ( html && TE?.enrichHTML ) html = await TE.enrichHTML(html, { secrets: game.user.isGM });
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not read the description of ${row?.name}`, err);
    }
    this.descriptions.set(key, html || "");
    if ( this.rendered ) this.render();
  }

  static async #onCancelOffer(event, target) {
    try {
      await runAsGM("cancelOffer", { shopUuid: this.actor.uuid, offerId: target.dataset.id });
    } catch (err) {
      ui.notifications.warn(err.message);
    }
  }

  static async #onToggleHidden(event, target) {
    if ( !game.user.isGM ) return;
    const key = target.dataset.key;
    const shop = getShop(this.actor);
    await setHidden(this.actor, key, !shop.hidden.includes(key));
  }

  static async #onSettings() {
    const { ShopConfig } = await import("./shop-config.mjs");
    ShopConfig.open(this.actor);
  }

  static async #onLists() {
    const { ShopListsEditor } = await import("./lists-editor.mjs");
    ShopListsEditor.openTo(getShop(this.actor).lists[0] ?? null);
  }

  static async #onRestock() {
    if ( !game.user.isGM ) return;
    await restockShop(this.actor);
    ui.notifications.info(loc("Shop.Restocked", { name: shopName(this.actor) }));
  }

  static async #onReroll() {
    if ( !game.user.isGM ) return;
    await restockShop(this.actor, { reroll: true });
    ui.notifications.info(loc("Shop.Rerolled", { name: shopName(this.actor) }));
  }

  static async #onOffers() {
    const { OffersWindow } = await import("./offers-window.mjs");
    OffersWindow.open();
  }

  static async #onToggleOpen() {
    if ( !game.user.isGM ) return;
    const shop = getShop(this.actor);
    shop.open = !shop.open;
    await saveShop(this.actor, shop);
  }

  static #onSheet() {
    this.actor.sheet?.render(true);
  }

  /** For tests: run an action as if its button were clicked. */
  async act(action, dataset={}) {
    const fn = this.options.actions[action];
    const target = { dataset, closest: () => null };
    await fn.call(this, { preventDefault() {} }, target);
  }
}

