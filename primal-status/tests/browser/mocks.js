// Minimal Foundry stand-ins for testing the HUD search and the hidden-status window in a real browser.
window.__hooks = {};
window.Hooks = { once:(n,f)=>(__hooks[n]??=[]).push(f), on:(n,f)=>(__hooks[n]??=[]).push(f) };
window.callHook = (n,...a)=>(__hooks[n]??[]).forEach(f=>f(...a));
window.__settings = new Map(); window.__menus = {};
window.game = {
  settings: { register:(m,k,o)=>{ __settings.set(k,{v:o.default,o}); }, get:(m,k)=>__settings.get(k)?.v,
              set:async(m,k,v)=>{ const s=__settings.get(k); s.v=v; s.o.onChange?.(v); return v; },
              registerMenu:(m,k,o)=>{ __menus[k]=o; } },
  i18n: { localize:s=>s, has:()=>false }, modules:new Map([["primal-status",{}]]), release:{generation:14},
  system:{id:"dnd5e"}, user:{id:"me", targets:new Set()}
};
game.modules.get = Map.prototype.get.bind(game.modules);
window.CONFIG = { statusEffects: {
  blinded:{id:"blinded", name:"Blinded", img:"b.svg"}, charmed:{id:"charmed", name:"Charmed", img:"c.svg"},
  deafened:{id:"deafened", name:"Deafened", img:"d.svg"}, frightened:{id:"frightened", name:"Frightened", img:"f.svg"},
  grappled:{id:"grappled", name:"Grappled", img:"g.svg"}, invisible:{id:"invisible", name:"Invisible", img:"i.svg"},
  prone:{id:"prone", name:"Prone", img:"p.svg"}, restrained:{id:"restrained", name:"Restrained", img:"r.svg"},
  encumbered:{id:"encumbered", name:"Encumbered", img:"e.svg", hud:false}
}, Dice:{} };
window.Roll = class { evaluate(o){ return this; } };
window.PIXI = {};
window.foundry = { utils:{ getProperty:(o,p)=>p.split(".").reduce((a,k)=>a?.[k],o) }, applications:{ api:{
  ApplicationV2: class {
    constructor(){ this.options = this.constructor.DEFAULT_OPTIONS; }
    // Shaped like Foundry's: the element (a form here) holds a header and a .window-content section
    async render(){ if (!this.element) { this.element = document.createElement(this.options.tag ?? "div");
        this.element.className = "application"; this.element.innerHTML = `<header class="window-header">${this.options.window?.title ?? ""}</header><section class="window-content"></section>`; }
      document.body.append(this.element);
      const r = await this._renderHTML(); this._replaceHTML(r, this.element.querySelector(".window-content"));
      this.element.addEventListener("click", e => { const b = e.target.closest("[data-action]"); if (b) this.options.actions[b.dataset.action].call(this, e, b); });
      this.element.addEventListener("submit", async e => { e.preventDefault(); await this.options.form.handler.call(this, e, this.element); this.closed = true; });
      this.rendered = true; return this; }
  }
}}};
window.canvas = { tokens: { hud: { rendered: true, renderCount: 0, render(){ this.renderCount++; } } } };
// Build a palette like dnd5e 6's Token HUD (from CONFIG, respecting hud:false)
window.buildHUD = (tokenId="t1") => {
  document.querySelector("#token-hud")?.remove();
  const hud = document.createElement("div"); hud.id = "token-hud";
  const icons = Object.values(CONFIG.statusEffects).filter(s => s.hud !== false)
    .map(s => `<img class="effect-control" data-action="effect" data-status-id="${s.id}" data-tooltip-text="${s.name}" src="${s.img}" width="24" height="24">`).join("");
  hud.innerHTML = `<div class="col right"><div class="palette status-effects" data-palette="effects">${icons}</div></div>`;
  document.body.append(hud);
  window.__clicked = [];
  hud.querySelectorAll("[data-status-id]").forEach(i => i.addEventListener("click", () => __clicked.push(i.dataset.statusId)));
  callHook("renderTokenHUD", { object: { id: tokenId, actor: null } }, hud);
  return hud;
};
