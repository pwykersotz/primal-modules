// Foundry stand-ins + a scene of tokens, each showing one effect, rendered with minipixi.
window.__now = 0;
performance.now = () => window.__now;
window.__hooks = {};
window.Hooks = { once:(n,f)=>(__hooks[n]??=[]).push(f), on:(n,f)=>(__hooks[n]??=[]).push(f) };
window.callHook = (n,...a)=>(__hooks[n]??[]).forEach(f=>f(...a));
const settings = new Map();
window.game = {
  settings: { register:(m,k,o)=>settings.set(k,o.default), get:(m,k)=>settings.get(k), set:async(m,k,v)=>settings.set(k,v), registerMenu:()=>{} },
  i18n: { localize:s=>s, has:()=>false }, modules:new Map([["primal-status",{}]]), release:{generation:14},
  system:{id:"dnd5e"}, user:{id:"me", targets:new Set()}
};
game.modules.get = Map.prototype.get.bind(game.modules);
window.CONFIG = { statusEffects:{}, Dice:{}, canvasTextStyle:{ fontFamily:"DejaVu Sans" } };
window.Roll = class { evaluate(){ return this; } };
window.Actor = class {};
const toRGB = n => [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
window.foundry = { canvas: { loadTexture: src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(new PIXI.Texture(i)); i.onerror = rej; i.src = src; }) },
  applications:{ api:{ ApplicationV2: class {} } }, utils: {
  getProperty:(o,p)=>p.split(".").reduce((a,k)=>a?.[k],o),
  Color: { from:n=>({rgb:toRGB(Number(n))}), fromRGB:a=>((Math.round(Math.min(1,a[0])*255)<<16)|(Math.round(Math.min(1,a[1])*255)<<8)|Math.round(Math.min(1,a[2])*255)) } } };
const tickers = [];
window.canvas = { ready:true, stage:{ scale:{ x:1 } }, app:{ ticker:{ add:f=>tickers.push(f) } }, tokens:{ placeables:[] } };

// A simple painted "creature" portrait used as token art
function portrait(size, hue) {
  const c = document.createElement("canvas"); c.width = c.height = size; const x = c.getContext("2d");
  const g = x.createRadialGradient(size*0.45, size*0.4, size*0.1, size/2, size/2, size/2);
  g.addColorStop(0, `hsl(${hue},35%,55%)`); g.addColorStop(1, `hsl(${hue},35%,25%)`);
  x.fillStyle = g; x.beginPath(); x.arc(size/2, size/2, size/2-1, 0, Math.PI*2); x.fill();
  x.fillStyle = "#c9a07a"; x.beginPath(); x.arc(size/2, size*0.4, size*0.17, 0, Math.PI*2); x.fill();
  x.fillStyle = "#2b2b2b"; x.beginPath(); x.arc(size*0.44, size*0.38, size*0.025, 0, Math.PI*2); x.arc(size*0.56, size*0.38, size*0.025, 0, Math.PI*2); x.fill();
  x.fillStyle = `hsl(${(hue+180)%360},40%,40%)`; x.beginPath(); x.ellipse(size/2, size*0.8, size*0.27, size*0.2, 0, Math.PI, 0); x.fill();
  x.strokeStyle = "#e8e0c8"; x.lineWidth = size*0.03; x.beginPath(); x.arc(size/2, size/2, size/2-size*0.02, 0, Math.PI*2); x.stroke();
  return c;
}

class Token extends PIXIMini.DisplayObject {
  constructor(id, statuses, hue, size, scale = 1) {
    super(); this.id = id; this.w = this.h = size; this.artScale = scale;
    this.document = { id, texture:{ tint:0xFFFFFF, scaleX:scale, scaleY:scale }, alpha:1 };
    this.actor = { statuses:new Set(statuses), effects:[] };
    const tok = this;
    // Like Foundry's token mesh: not a child of the token but drawn in canvas space, sized by the
    // texture scale (and by anything that scales the whole token) and centred on the token
    const world = () => tok.scale.x;   // the token's own scale (the scene itself isn't scaled)
    this.mesh = { tint:0xFFFFFF, alpha:1, anchor:{x:0.5,y:0.5}, parent:{}, destroyed:false,
      texture:{ orig:{ width:size, height:size }, width:size, height:size },
      get width() { return size * tok.artScale * world(); }, get height() { return size * tok.artScale * world(); },
      get position() { return tok.toGlobal({ x: size/2, y: size/2 }); },
      // texture pixels (centred) → canvas
      toGlobal: p => tok.toGlobal({ x: size/2 + p.x * tok.artScale, y: size/2 + p.y * tok.artScale }) };
    this.toGlobal = p => ({ x: tok.position.x + (p.x - tok.pivot.x) * tok.scale.x, y: tok.position.y + (p.y - tok.pivot.y) * tok.scale.y });
    this.toLocal = p => ({ x: (p.x - tok.position.x) / tok.scale.x + tok.pivot.x, y: (p.y - tok.position.y) / tok.scale.y + tok.pivot.y });
    this.renderFlags = { set(){} };
    this.voidMesh = new PIXIMini.DisplayObject(); this.addChild(this.voidMesh);
    this.art = portrait(size, hue);
  }
  drawSelf(ctx) {
    // token art with the module's tint/alpha applied (multiply tint like PIXI)
    const t = document.createElement("canvas"); t.width = t.height = this.w; const x = t.getContext("2d");
    x.drawImage(this.art, 0, 0);
    x.globalCompositeOperation = "multiply"; x.fillStyle = "#" + this.mesh.tint.toString(16).padStart(6,"0"); x.fillRect(0,0,this.w,this.h);
    x.globalCompositeOperation = "destination-in"; x.drawImage(this.art, 0, 0);
    const a = this.w * this.artScale, o = (this.w - a) / 2;
    ctx.save(); ctx.globalAlpha *= this.mesh.alpha; ctx.drawImage(t, o, o, a, a);
    ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.setLineDash([4,4]); ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, this.w-1, this.h-1);
    ctx.restore();
  }
}
Token.RENDER_FLAGS = {};

window.setupScene = (specs, size, cols, gap, labelH) => {
  for (const [k, v] of Object.entries(window.__settingsOverride ?? {})) settings.set(k, v);
  callHook("init"); callHook("setup"); callHook("ready");
  for (const [k, v] of Object.entries(window.__settingsOverride ?? {})) settings.set(k, v);
  callHook("canvasReady");
  window.root = new PIXIMini.DisplayObject();
  window.labels = [];
  specs.forEach((s, i) => {
    const t = new Token("tok" + i, s.statuses, s.hue ?? (i * 47) % 360, size, s.scale ?? 1);
    t.position.set(gap + (i % cols) * (size + gap), gap + Math.floor(i / cols) * (size + gap + labelH) + size * 0.25);
    if (s.tex) t.mesh.texture = new PIXI.Texture(t.art);
    if (s.artScale) t.artScale = s.artScale;           // another module shrinking just the art
    if (s.effects) t.actor.effects = s.effects.map(e => ({ disabled: false, flags: {}, ...e, statuses: new Set(e.statuses) }));   // e.g. Burning (2d4 Acid)
    if (s.hp !== undefined) t.actor.system = { attributes: { hp: { value: s.hp, max: 20 }, death: { success: 0, failure: s.fails ?? 0 } } };
    root.addChild(t); canvas.tokens.placeables.push(t);
    labels.push({ text: s.label, x: t.position.x + size / 2, y: t.position.y + size + size * 0.42 });
    if (s.tokenScale) { t.pivot.set(size / 2, size / 2); t.position.set(t.position.x + size / 2, t.position.y + size / 2); t.scale.set(s.tokenScale, s.tokenScale); }   // …or the whole token
  });
};

let simTime = 0;
window.frame = (t, ctx) => {
  // simulate in small steps so particles behave as they would in real time
  while (simTime < t) { simTime = Math.min(t, simTime + 1000/60); window.__now = simTime; tickers.forEach(f => f()); }
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = window.__bg ?? "#566b45"; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  renderScene(root, ctx);
  ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle = "#f4f1e6"; ctx.font = "bold 13px DejaVu Sans, sans-serif"; ctx.textAlign = "center";
  for (const l of labels) ctx.fillText(l.text, l.x, l.y);
};
