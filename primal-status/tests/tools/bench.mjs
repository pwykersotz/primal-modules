const hooks = {};
globalThis.Hooks = { once:(n,f)=>(hooks[n]??=[]).push(f), on:(n,f)=>(hooks[n]??=[]).push(f) };
const call = (n,...a)=>(hooks[n]??[]).forEach(f=>f(...a));
class Obs { constructor(){ this.children=[]; this.parent=null; this.destroyed=false; this.alpha=1; this.rotation=0; this.x=0; this.y=0;
  this.scale={set:(a,b)=>{this._s=[a,b??a]}}; this.position={set:(x,y)=>{this.x=x;this.y=y}}; this.pivot={set:(x,y)=>{this._p=[x,y??x]}}; this.filters=null; }
  addChild(...c){ c.forEach(x=>{x.parent=this; this.children.push(x)}); return c[0]; }
  addChildAt(c,i){ c.parent=this; this.children.splice(i,0,c); return c; }
  getChildIndex(c){ return this.children.indexOf(c); }
  removeChildren(){ const c=this.children; this.children=[]; c.forEach(x=>x.parent=null); return c; }
  destroy(o){ this.destroyed=true; if(o?.children) [...this.children].forEach(c=>c.destroy(o)); if(this.parent){ this.parent.children=this.parent.children.filter(x=>x!==this); this.parent=null; } } }
class Graphics extends Obs { constructor(){super(); this.calls=[];} }
for (const m of ["clear","lineStyle","drawEllipse","beginFill","drawCircle","endFill","moveTo","lineTo","drawPolygon","bezierCurveTo","closePath","arc","drawRect","drawRoundedRect"]) Graphics.prototype[m]=function(...a){ for (const v of a) if (typeof v==="number" && !Number.isFinite(v)) throw new Error(`${m} got non-finite ${v}`); this.calls.push(m); return this; };
class BlurFilter { constructor(s,q){ this._b=s; } set blur(v){ if(!Number.isFinite(v)) throw new Error("bad blur "+v); this._b=v; } get blur(){return this._b;} destroy(){ this.gone=true; } }
class TextStyle { constructor(o){ Object.assign(this,o); } }
class Text extends Obs { constructor(str, style){ super(); this.text=str; this.style=style; this.anchor={set:v=>this._anchor=v}; } }
const tickers=[];
globalThis.PIXI = { Container: Obs, Graphics, Text, TextStyle, BlurFilter, BLEND_MODES:{ADD:1, NORMAL:0}, UPDATE_PRIORITY:{NORMAL:0}, LINE_CAP:{ROUND:"round"}, LINE_JOIN:{ROUND:"round"} };
const settings = new Map(); const settingsCfg = new Map();
globalThis.game = { settings:{ register:(m,k,o)=>{ settings.set(k,o.default); settingsCfg.set(`${m}.${k}`, o); }, get:(m,k)=>settings.get(k), registerMenu:()=>{} }, i18n:{localize:s=>"L:"+s, has:k=>k.startsWith("MIGHTYGUARD")},
  modules:new Map([["primal-status",{}]]), release:{generation:14}, system:{id:"dnd5e"}, user:{targets:new Set()} };
game.modules.get = Map.prototype.get.bind(game.modules); game.settings.settings = settingsCfg;
// Like Foundry's token: icons are sprites in this.effects; refresh lays out a row of small icons and
// the overlay (centred, at 60% of the token)
class TokenObj { async _drawEffect(src){ this.drawn = (this.drawn ?? []); this.drawn.push(src);
    const icon = { src, width: 20, height: 20, tint: 0xFFFFFF, alpha: 1, x: 0, y: 0, anchor: { set: (x, y) => { icon._anchor = [x, y ?? x]; } }, position: { set: (x, y) => { icon.x = x; icon.y = y; } } };
    if (this.effects?.children) this.effects.children.push(icon);
    return icon; }
  _refreshEffects() { const o = this.effects?.overlay; let i = 0;
    for (const c of this.effects?.children ?? []) {
      if (c === o) { c.width = c.height = Math.min(this.w, this.h) * 0.6; c.position.set(this.w / 2, this.h / 2); }
      else { c.width = c.height = 20; c.position.set((i % 5) * 20, Math.floor(i / 5) * 20); i++; } } }
  getSize() { return { width: this.w, height: this.h }; }
  getCenterPoint(p) { return { x: p.x + this.w / 2, y: p.y + this.h / 2 }; } }
globalThis.CONFIG = { statusEffects: { blinded:{id:"blinded"} }, Dice:{}, Token:{ objectClass: TokenObj } };
class Actor {} globalThis.Actor = Actor;
class Roll { constructor(f){ this.formula=f; this.options={}; this.dice=[]; } evaluate(o){ this.lastOpts=o; return this; } }
globalThis.Roll = Roll;
const toRGB = n=>[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
globalThis.foundry = { applications: { api: { ApplicationV2: class {} } }, utils: { getProperty:(o,p)=>p.split(".").reduce((a,k)=>a?.[k],o),
  Color: { from:n=>({rgb:toRGB(Number(n))}), fromRGB:a=>((Math.round(a[0]*255)<<16)|(Math.round(a[1]*255)<<8)|Math.round(a[2]*255)) } } };
class Token extends Obs { constructor(id){ super(); this.w=100; this.h=100; this.mesh={tint:0xFFFFFF, alpha:1};
  this.document={id, texture:{tint:0xFFFFFF}, alpha:1}; this.actor=Object.assign(new Actor(), {statuses:new Set(), effects:[], created:[], createEmbeddedDocuments:async(t,d)=>{this.actor.created.push(...d);}}); this.renderFlags={set:f=>this.flagsSet=f};
  this.bars=new Obs(); this.voidMesh=new Obs(); this.addChild(new Obs(), this.voidMesh, this.bars); } }
Token.RENDER_FLAGS = { refreshState:{}, refreshMesh:{} };
const A = new Token("tokA"), B = new Token("tokB");
globalThis.canvas = { ready:true, stage:{scale:{x:0.75}}, app:{ ticker:{ add:f=>tickers.push(f) } }, tokens:{ placeables:[A,B] } };
// Drawing is stubbed out: this times the module's own work per frame, not the graphics card's
for (const m of Object.keys(Graphics.prototype)) if (typeof Graphics.prototype[m] === "function" && m !== "constructor") Graphics.prototype[m] = function () { return this; };
const { pathToFileURL } = await import("node:url"); const { resolve } = await import("node:path");
await import(pathToFileURL(resolve(process.argv[2])).href);
call("init"); call("setup"); call("ready"); call("canvasReady");
const tick = tickers[0];
const ANIMATED = [["bloodied"], ["prone", "unconscious"], ["poisoned"], ["burning"], ["concentrating"], ["coverHalf"], ["restrained", "frightened"], ["marked"], ["hasted"], ["invisible"]];
const mkTok = (i, statuses, nEffects, x = 0, y = 0) => { const t = new Token("t" + i); t.actor.statuses = new Set(statuses);
  t.actor.effects = Array.from({ length: nEffects }, (_, k) => ({ statuses: new Set([`misc${k}`]), disabled: false })); t.x = x; t.y = y; t.document.x = x; t.document.y = y; return t; };
const results = {};
const time = (label, tokens, frames = 300) => {
  canvas.tokens.placeables = tokens; for (let i = 0; i < 30; i++) tick();
  let clock = performance.now(); const realNow = performance.now; performance.now = () => clock;
  const t0 = realNow.call(performance); for (let i = 0; i < frames; i++) { clock += 16.7; tick(); } const ms = (realNow.call(performance) - t0) / frames;
  performance.now = realNow;
  results[label] = ms;
  console.log(`${label.padEnd(56)} ${ms.toFixed(3)} ms per frame (${(ms / 16.7 * 100).toFixed(1)}% of a 60 fps frame)`);
};
const mixed = (n, offscreen = 0) => Array.from({ length: n }, (_, i) => {
  const off = i < n * offscreen; const x = off ? 50000 + i * 100 : (i % 10) * 100, y = off ? 50000 : Math.floor(i / 10) * 100;
  return mkTok(i, i % 3 === 0 ? ANIMATED[i % ANIMATED.length] : [], 6, x, y);
});
// a screen of 1000 × 1000 at zoom 1 (for the off-screen case)
canvas.stage.worldTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
canvas.app.renderer = { screen: { x: 0, y: 0, width: 1000, height: 1000 } };
time("100 tokens, no statuses (4 effects each)", Array.from({ length: 100 }, (_, i) => mkTok(i, [], 4)));
time("100 tokens, no statuses (12 effects each)", Array.from({ length: 100 }, (_, i) => mkTok(i, [], 12)));
time("100 tokens, a third with 1-2 animated statuses", mixed(100));
time("300 tokens, same mix, 80% of them off-screen", mixed(300, 0.8));
if (process.argv[3]) { const fs = await import("node:fs"); fs.writeFileSync(process.argv[3], JSON.stringify(results, null, 1)); }
