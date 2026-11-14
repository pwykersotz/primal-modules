/**
 * Shops here: the shops on the scene shown, from their map pins, ribbons and tokens, to open one without hunting for
 * it on the map. Players see the revealed ones; the GM sees them all, and can reveal or hide every pin and ribbon at
 * once.
 */
import { MODULE_ID, escapeHTML as e, loc } from "../constants.mjs";
import { shopsOnScene } from "../pins.mjs";
import { getPins, getRibbons, getShop, isShop, shopActorOf, shopName } from "../store.mjs";
import { openShopHere, revealAllHere } from "./pin-layer.mjs";

const { ApplicationV2 } = foundry.applications.api;

let INSTANCE = null;

/** @param {object} v */
export function renderShopsHere(v) {
  const L = v.labels;
  const rows = v.rows.map(r => `
    <li class="ps-here-row${r.closed ? " ps-closed" : ""}${r.hidden ? " ps-hidden" : ""}">
      <button type="button" class="ps-here-open" data-action="openShop" data-actor="${e(r.id)}">
        <img src="${e(r.img)}" alt="">
        <span class="ps-here-name">${e(r.name)}
          <span class="ps-here-tags">${r.tags.map(t => `<span class="ps-here-tag ps-tag-${e(t.kind)}">${e(t.label)}</span>`).join("")}</span>
        </span>
        <i class="fa-solid fa-chevron-right" inert></i>
      </button>
    </li>`).join("");
  return `
<div class="ps-here">
  ${v.rows.length ? `<ul class="ps-here-list">${rows}</ul>` : `<p class="ps-faint ps-here-none">${e(v.noneText)}</p>`}
  ${v.isGM ? `
  <footer class="ps-here-foot">
    <button type="button" data-action="newShop" class="ps-here-new"><i class="fa-solid fa-bookmark" inert></i> ${e(L.newShop)}</button>
    ${v.placeCount ? `
    <button type="button" data-action="revealAll"><i class="fa-solid fa-eye" inert></i> ${e(L.revealAll)}</button>
    <button type="button" data-action="hideAll"><i class="fa-solid fa-eye-slash" inert></i> ${e(L.hideAll)}</button>` : ""}
  </footer>` : ""}
</div>`;
}

export class ShopsHere extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "primal-shops-here",
    classes: ["primal-shops-here"],
    tag: "div",
    window: { icon: "fa-solid fa-shop", resizable: true },
    position: { width: 360, height: "auto" },
    actions: {
      openShop: ShopsHere.#onOpen,
      revealAll: ShopsHere.#onRevealAll,
      hideAll: ShopsHere.#onHideAll,
      newShop: ShopsHere.#onNewShop
    }
  };

  /** Open the list for the scene shown, or bring it to the front. */
  static open() {
    if ( INSTANCE?.rendered ) {
      INSTANCE.bringToFront?.();
      INSTANCE.render();
      return INSTANCE;
    }
    INSTANCE = new ShopsHere();
    INSTANCE.render({ force: true });
    return INSTANCE;
  }

  /** Re-draw the list, if it's open (pins or shops changed, or another scene is shown). */
  static refresh() {
    if ( INSTANCE?.rendered ) INSTANCE.render();
  }

  /** @override */
  get title() {
    const scene = globalThis.canvas?.scene;
    return scene ? loc("Here.Title", { scene: scene.navName || scene.name || "" }) : loc("Here.Button");
  }

  /** @override */
  async _prepareContext() {
    const scene = globalThis.canvas?.scene ?? null;
    const isGM = !!game.user.isGM;
    const tokens = [];
    for ( const t of scene?.tokens?.contents ?? [...(scene?.tokens?.values?.() ?? [])] ) {
      const actor = shopActorOf(t);
      if ( actor && isShop(actor) ) tokens.push({ actor: actor.id, hidden: !!t.hidden });
    }
    const pins = getPins(scene);
    const ribbons = getRibbons(scene);
    const found = shopsOnScene({ pins, ribbons, tokens, isGM, isShop: id => isShop(game.actors?.get(id)) });
    const rows = found.map(r => {
      const actor = game.actors.get(r.actor);
      const shop = getShop(actor);
      const tags = [];
      if ( r.pins ) tags.push({ kind: "pin", label: loc("Here.Pin") });
      if ( r.ribbons ) tags.push({ kind: "ribbon", label: loc("Here.Ribbon") });
      if ( r.tokens ) tags.push({ kind: "token", label: loc("Here.Token") });
      if ( !shop.open ) tags.push({ kind: "closed", label: loc("Here.Closed") });
      if ( isGM && !r.revealed ) tags.push({ kind: "hidden", label: loc("Here.Hidden") });
      return { id: actor.id, name: shopName(actor, shop), img: actor.img || "icons/svg/item-bag.svg", closed: !shop.open, hidden: isGM && !r.revealed, tags };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return {
      isGM,
      rows,
      placeCount: pins.length + ribbons.length,
      noneText: loc(isGM ? "Here.NoneGM" : "Here.None"),
      labels: { revealAll: loc("Here.RevealAll"), hideAll: loc("Here.HideAll"), newShop: loc("New.Button") }
    };
  }

  /** @override */
  async _renderHTML(context) {
    return renderShopsHere(context);
  }

  /** @override */
  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  /** @override */
  _onClose(options) {
    super._onClose?.(options);
    if ( INSTANCE === this ) INSTANCE = null;
  }

  static #onOpen(event, target) {
    openShopHere(game.actors.get(target.dataset.actor));
  }

  static async #onRevealAll() {
    await revealAllHere(true);
  }

  static async #onHideAll() {
    await revealAllHere(false);
  }

  static async #onNewShop() {
    const { openNewShop } = await import("./quick-shop.mjs");
    await openNewShop();
  }
}

/** Keep the list current as pins, shops and tokens change. Called once the game is ready. */
export function registerShopsHere() {
  const refresh = () => ShopsHere.refresh();
  Hooks.on("canvasReady", refresh);
  Hooks.on("updateScene", (scene, changes) => {
    if ( (scene === globalThis.canvas?.scene) && foundry.utils.hasProperty(changes ?? {}, `flags.${MODULE_ID}`) ) refresh();
  });
  Hooks.on("updateActor", refresh);
  Hooks.on("createToken", refresh);
  Hooks.on("updateToken", (tokenDoc, changes) => {
    if ( "hidden" in (changes ?? {}) ) refresh();
  });
  Hooks.on("deleteToken", refresh);
}
