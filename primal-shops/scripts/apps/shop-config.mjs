/**
 * Shop settings (GM): turn an actor into a shop, or change one. Which shop lists it sells from, its level (the
 * highest rarity it stocks), its prices, what it buys, a random pick of its stock, the shopkeeper's own items and
 * coins, and how close players must stand.
 */
import { FLAGS, MODULE_ID, SETTINGS, escapeHTML as e, loc, setting } from "../constants.mjs";
import { MAX_LEVEL } from "../catalog.mjs";
import { PICK_GROUPS, RIBBON_COLORS, normalizeShop } from "../shop.mjs";
import { getLists, getShop, isShop, saveShop, shopActorOf, shopName } from "../store.mjs";
import { stockAfterChange } from "../trade.mjs";
import { linkSelected, linkedTokens, unlinkTokens } from "./quick-shop.mjs";
import { ribbonInner, ribbonStyle } from "./ribbons.mjs";
import { levelLabel, rarityLabel } from "./shop-window.mjs";
import { keepOnScreen, options, replaceKeepingScroll } from "../views.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;

const OPEN = new Map();

const field = (label, input, hint="") => `
  <div class="form-group">
    <label>${e(label)}</label>
    <div class="form-fields">${input}</div>
    ${hint ? `<p class="hint">${e(hint)}</p>` : ""}
  </div>`;

const check = (name, checked, label, hint="") => `
  <div class="form-group">
    <label class="ps-check"><input type="checkbox" name="${name}"${checked ? " checked" : ""}> ${e(label)}</label>
    ${hint ? `<p class="hint">${e(hint)}</p>` : ""}
  </div>`;

/** @param {object} v */
export function renderShopConfig(v) {
  const L = v.labels;
  const lists = v.lists.length ? `
    <ul class="ps-config-lists">${v.lists.map(l => `
      <li><label class="ps-check"><input type="checkbox" name="list" value="${e(l.id)}"${l.checked ? " checked" : ""}> ${e(l.name)} <span class="ps-faint">${e(l.count)}</span></label></li>`).join("")}
    </ul>` : `<p class="ps-faint">${e(L.noLists)}</p>`;
  const counts = PICK_GROUPS.map(g => `
      <label class="ps-count-field"><span>${e(v.groupLabels[g])}</span>
        <input type="number" name="count.${g}" value="${e(v.counts[g] ?? "")}" min="0" step="1" placeholder="${e(L.all)}"></label>`).join("");
  return `
<form class="ps-config" autocomplete="off">
  ${v.setup ? `<p class="ps-banner ps-banner-info"><i class="fa-solid fa-store" inert></i> ${e(L.setupHint)}</p>` : ""}
  <fieldset>
    <legend>${e(L.shop)}</legend>
    ${field(L.name, `<input type="text" name="name" value="${e(v.shop.name)}" placeholder="${e(v.actorName)}">`)}
    ${field(L.greeting, `<textarea name="greeting" rows="2" placeholder="${e(L.greetingHint)}">${e(v.shop.greeting)}</textarea>`)}
    ${check("open", v.shop.open, L.open, L.openHint)}
    ${field(L.range, `<input type="number" name="range" value="${e(v.shop.range ?? "")}" min="0" step="1" placeholder="${e(L.anywhere)}"> <span class="ps-faint">${e(v.units)}</span>`, L.rangeHint)}
    ${v.canPin ? `
    <div class="form-group ps-place-pin">
      <div class="ps-place-buttons">
        <button type="button" class="ps-small" data-action="placePin"><i class="fa-solid fa-location-dot" inert></i> ${e(L.placePin)}</button>
        <button type="button" class="ps-small" data-action="placeRibbon"><i class="fa-solid fa-bookmark" inert></i> ${e(L.placeRibbon)}</button>
      </div>
      <p class="hint">${e(L.placeHint)}</p>
    </div>
    <div class="form-group ps-place-pin ps-link-tokens">
      <div class="ps-place-buttons">
        <button type="button" class="ps-small" data-action="linkTokens"><i class="fa-solid fa-link" inert></i> ${e(L.link)}</button>
        ${v.linked ? `<button type="button" class="ps-small" data-action="unlinkTokens"><i class="fa-solid fa-link-slash" inert></i> ${e(L.unlink)}</button>` : ""}
      </div>
      <p class="hint">${e(L.linkHint)}</p>
    </div>` : ""}
    <div class="form-group ps-ribbon-colors">
      <div class="ps-ribbon-fields">
        <label>${e(L.ribbonColors)}</label>
        <div class="form-fields">
          <label class="ps-color"><input type="color" name="ribbonColor" value="${e(v.shop.ribbon.color)}"> ${e(L.ribbonColor)}</label>
          <label class="ps-color"><input type="color" name="ribbonTrim" value="${e(v.shop.ribbon.trim)}"> ${e(L.ribbonTrim)}</label>
          <button type="button" class="ps-small ps-ribbon-default" data-action="ribbonDefault" data-tooltip="${e(L.ribbonDefault)}" aria-label="${e(L.ribbonDefault)}"><i class="fa-solid fa-rotate-left" inert></i></button>
        </div>
        <p class="hint">${e(L.ribbonHint)}</p>
      </div>
      <div class="ps-ribbon ps-ribbon-preview" style="${ribbonStyle(v.shop)}" aria-hidden="true">${ribbonInner(v.shop.name || v.actorName)}</div>
    </div>
  </fieldset>
  <fieldset>
    <legend>${e(L.stock)}</legend>
    <div class="form-group stacked">
      <label>${e(L.lists)}</label>
      ${lists}
      <div class="ps-config-buttons">
        <button type="button" class="ps-small" data-action="editLists"><i class="fa-solid fa-list-check" inert></i> ${e(L.editLists)}</button>
      </div>
    </div>
    ${field(L.level, `<select name="level">${options(v.levels)}</select>`, L.levelHint)}
    ${field(L.maxPrice, `<input type="number" name="maxPriceGp" value="${e(v.shop.maxPriceGp ?? "")}" min="0" step="any" placeholder="${e(L.noLimit)}"> <span class="ps-faint">${e(v.gp)}</span>`, L.maxPriceHint)}
    ${check("random", v.shop.random.enabled, L.random, L.randomHint)}
    <div class="ps-counts${v.shop.random.enabled ? "" : " disabled"}">${counts}</div>
    ${check("sellOwn", v.shop.sellOwn, L.sellOwn, L.sellOwnHint)}
  </fieldset>
  <fieldset>
    <legend>${e(L.prices)}</legend>
    ${field(L.markup, `<input type="number" name="markup" value="${e(v.shop.markup)}" min="0" step="1"> <span class="ps-faint">%</span>`, L.markupHint)}
    ${field(L.buys, `<select name="buys">${options(v.buys)}</select>`)}
    ${field(L.sellRate, `<input type="number" name="sellRate" value="${e(v.shop.sellRate ?? "")}" min="0" step="1" placeholder="${e(v.worldRate)}"> <span class="ps-faint">%</span>`, L.sellRateHint)}
    ${check("keepBought", v.shop.keepBought, L.keepBought, L.keepBoughtHint)}
    ${check("purse", v.shop.purse, L.purse, L.purseHint)}
  </fieldset>
  <footer class="ps-config-foot">
    ${v.isShop ? `<button type="button" data-action="remove" class="ps-danger"><i class="fa-solid fa-trash" inert></i> ${e(L.remove)}</button>` : ""}
    <button type="button" data-action="save" class="ps-primary"><i class="fa-solid fa-floppy-disk" inert></i> ${e(v.setup ? L.create : L.save)}</button>
  </footer>
</form>`;
}

export class ShopConfig extends ApplicationV2 {
  /** Open the settings of an actor's shop (or set one up). */
  static open(target, { setup=false, token=null }={}) {
    if ( !game.user.isGM ) return null;
    const actor = shopActorOf(target);
    if ( !actor ) return null;
    const existing = OPEN.get(actor.id);
    if ( existing?.rendered ) {
      existing.bringToFront?.();
      return existing;
    }
    const app = new ShopConfig(actor, { setup: setup || !isShop(actor), token });
    app.render({ force: true });
    return app;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["primal-shops-config"],
    tag: "div",
    window: { icon: "fa-solid fa-store", resizable: true },
    position: { width: 560, height: "auto" },
    actions: {
      save: ShopConfig.#onSave,
      remove: ShopConfig.#onRemove,
      editLists: ShopConfig.#onEditLists,
      placePin: ShopConfig.#onPlacePin,
      placeRibbon: ShopConfig.#onPlaceRibbon,
      linkTokens: ShopConfig.#onLinkTokens,
      unlinkTokens: ShopConfig.#onUnlinkTokens,
      ribbonDefault: ShopConfig.#onRibbonDefault
    }
  };

  constructor(actor, { setup=false, token=null }={}, options={}) {
    super({ id: `primal-shops-config-${actor.id}`, ...options });
    this.actor = actor;
    this.setup = setup;
    this.token = token;
    this.draft = getShop(actor);
    OPEN.set(actor.id, this);
  }

  /** @override */
  get title() {
    return loc("Config.Title", { name: this.actor.name });
  }

  /** @override */
  async _prepareContext() {
    const shop = this.draft;
    const lists = getLists().lists;
    const L = k => loc(`Config.${k}`);
    return {
      setup: this.setup,
      isShop: isShop(this.actor),
      canPin: isShop(this.actor) && !!globalThis.canvas?.scene && !!game.user.isGM,
      linked: linkedTokens(this.actor).length,
      shop,
      actorName: this.actor.name,
      units: canvas?.scene?.grid?.units ?? game.system?.grid?.units ?? "",
      gp: game.i18n.localize(CONFIG.DND5E?.currencies?.gp?.abbreviation ?? "gp"),
      worldRate: String(setting(SETTINGS.sellRate) ?? 50),
      lists: lists.map(l => ({ id: l.id, name: l.name, count: loc("Config.ItemCount", { n: l.entries.length }), checked: shop.lists.includes(l.id) })),
      levels: Array.from({ length: MAX_LEVEL + 1 }, (_, i) => ({ value: i, label: `${i} · ${levelLabel(i)}`, selected: i === shop.level })),
      buys: ["all", "same", "none"].map(b => ({ value: b, label: L(`Buys.${b}`), selected: shop.buys === b })),
      counts: shop.random.counts,
      groupLabels: Object.fromEntries(PICK_GROUPS.map(g => [g, rarityLabel(g === "mundane" ? "" : g)])),
      labels: {
        setupHint: L("SetupHint"), shop: L("Shop"), name: L("Name"), greeting: L("Greeting"), greetingHint: L("GreetingHint"),
        open: L("Open"), openHint: L("OpenHint"), range: L("Range"), rangeHint: L("RangeHint"), anywhere: L("Anywhere"),
        stock: L("Stock"), lists: L("Lists"), noLists: L("NoLists"), editLists: L("EditLists"), level: L("Level"),
        levelHint: L("LevelHint"), maxPrice: L("MaxPrice"), maxPriceHint: L("MaxPriceHint"), noLimit: L("NoLimit"),
        random: L("Random"), randomHint: L("RandomHint"), all: L("All"), sellOwn: L("SellOwn"), sellOwnHint: L("SellOwnHint"),
        prices: L("Prices"), markup: L("Markup"), markupHint: L("MarkupHint"), buys: L("BuysLabel"), sellRate: L("SellRate"),
        sellRateHint: L("SellRateHint"), keepBought: L("KeepBought"), keepBoughtHint: L("KeepBoughtHint"), purse: L("Purse"),
        purseHint: L("PurseHint"), remove: L("Remove"), create: L("Create"), save: L("Save"),
        placePin: loc("Pins.Place"), placeRibbon: loc("Ribbons.Place"), placeHint: loc("Pins.PlaceHint"),
        ribbonColors: L("RibbonColors"), ribbonColor: L("RibbonColor"), ribbonTrim: L("RibbonTrim"),
        ribbonDefault: L("RibbonDefault"), ribbonHint: L("RibbonHint"),
        link: loc("Link.Button"), unlink: loc("Link.Unlink", { n: linkedTokens(this.actor).length }), linkHint: loc("Link.Hint")
      }
    };
  }

  /** @override */
  async _renderHTML(context) {
    return renderShopConfig(context);
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
      this.#read();
      if ( event.target.name === "random" ) this.render();
    });
    // The ribbon's preview follows the colors (and the name) as they're picked.
    this.element.addEventListener("input", event => {
      if ( ["ribbonColor", "ribbonTrim", "name"].includes(event.target.name) ) this.#preview();
    });
  }

  /** @override */
  _onClose(options) {
    super._onClose?.(options);
    if ( OPEN.get(this.actor.id) === this ) OPEN.delete(this.actor.id);
  }

  /** Show the ribbon as the form has it now. */
  #preview() {
    const form = this.element.querySelector("form");
    const preview = this.element.querySelector(".ps-ribbon-preview");
    if ( !form || !preview ) return;
    preview.style.setProperty("--ps-ribbon", form.elements.ribbonColor.value);
    preview.style.setProperty("--ps-ribbon-trim", form.elements.ribbonTrim.value);
    preview.querySelector(".ps-ribbon-name").textContent = form.elements.name.value.trim() || this.actor.name;
  }

  /** The form as a shop. */
  #read() {
    const form = this.element.querySelector("form");
    if ( !form ) return this.draft;
    const val = name => form.elements[name]?.value ?? "";
    const on = name => !!form.elements[name]?.checked;
    const counts = {};
    for ( const g of PICK_GROUPS ) counts[g] = val(`count.${g}`);
    this.draft = normalizeShop({
      ...this.draft,
      enabled: true,
      name: val("name"),
      greeting: val("greeting"),
      open: on("open"),
      range: val("range"),
      lists: [...form.querySelectorAll("input[name=list]:checked")].map(i => i.value),
      level: val("level"),
      maxPriceGp: val("maxPriceGp"),
      random: { enabled: on("random"), counts },
      sellOwn: on("sellOwn"),
      markup: val("markup"),
      buys: val("buys"),
      sellRate: val("sellRate"),
      keepBought: on("keepBought"),
      purse: on("purse"),
      ribbon: { color: val("ribbonColor"), trim: val("ribbonTrim") }
    });
    return this.draft;
  }

  static async #onSave() {
    const before = getShop(this.actor);
    const wasShop = isShop(this.actor);
    const shop = this.#read();
    // A stand-in (made with New shop) is named as its shop is, in the Actors sidebar too.
    if ( this.actor.getFlag?.(MODULE_ID, FLAGS.standIn) && shop.name && (shop.name !== this.actor.name) ) {
      await this.actor.update({ name: shop.name, "prototypeToken.name": shop.name });
      shop.name = "";
    }
    await saveShop(this.actor, shop);
    // A new random pick when what it's picked from, or how, changed.
    const pickChanged = shop.random.enabled && (!before.random.enabled
      || (JSON.stringify(before.random.counts) !== JSON.stringify(shop.random.counts))
      || (JSON.stringify(before.lists) !== JSON.stringify(shop.lists))
      || (before.level !== shop.level) || (before.maxPriceGp !== shop.maxPriceGp));
    await stockAfterChange(this.actor, { reroll: pickChanged || !wasShop });
    ui.notifications.info(loc(wasShop ? "Config.Saved" : "Config.Created", { name: shop.name || this.actor.name }));
    const { ShopWindow } = await import("./shop-window.mjs");
    await this.close();
    if ( !wasShop ) ShopWindow.open(this.actor, { token: this.token });
    else ShopWindow.refreshFor(this.actor);
  }

  static async #onRemove() {
    const ok = await DialogV2.confirm({
      window: { title: loc("Config.RemoveTitle") },
      content: `<p>${e(loc("Config.RemoveText", { name: this.actor.name }))}</p>`
    });
    if ( !ok ) return;
    await this.actor.unsetFlag(MODULE_ID, FLAGS.shop);
    await this.actor.unsetFlag(MODULE_ID, FLAGS.state);
    ui.notifications.info(loc("Config.Removed", { name: this.actor.name }));
    await this.close();
  }

  /** A map pin for this shop in the middle of the view, hidden until revealed. */
  static async #onPlacePin() {
    const { placePin } = await import("./pin-layer.mjs");
    await placePin(this.actor);
  }

  /** A ribbon for this shop at the top of the screen on the scene shown, hidden until revealed. */
  static async #onPlaceRibbon() {
    const { placeRibbon } = await import("./ribbons.mjs");
    await placeRibbon(this.actor);
  }

  /** The tokens selected on the map open this shop from now on. */
  static async #onLinkTokens() {
    if ( await linkSelected(this.actor) ) this.render();
  }

  /** The tokens on this scene linked to this shop stop opening it. */
  static async #onUnlinkTokens() {
    const n = await unlinkTokens(linkedTokens(this.actor));
    ui.notifications.info(loc("Link.Unlinked", { n, name: shopName(this.actor) }));
    this.render();
  }

  /** The ribbon's colors back to crimson and gold. */
  static #onRibbonDefault() {
    const form = this.element.querySelector("form");
    form.elements.ribbonColor.value = RIBBON_COLORS.color;
    form.elements.ribbonTrim.value = RIBBON_COLORS.trim;
    this.#read();
    this.#preview();
  }

  static async #onEditLists() {
    const { ShopListsEditor } = await import("./lists-editor.mjs");
    ShopListsEditor.openTo(this.draft.lists[0] ?? null, { onSave: () => this.rendered && this.render() });
  }
}
