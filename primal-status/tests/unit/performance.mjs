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
// Like PIXI's: a resolution of null means "the screen's own"; quality is the number of passes
class BlurFilter { constructor(s,q){ this._b=s; this.quality=q ?? 4; this.resolution=null; } set blur(v){ if(!Number.isFinite(v)) throw new Error("bad blur "+v); this._b=v; } get blur(){return this._b;} destroy(){ this.gone=true; } }
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
const { pathToFileURL } = await import("node:url"); const { resolve } = await import("node:path");
await import(pathToFileURL(resolve(process.argv[2])).href);
call("init"); call("setup"); call("ready"); call("canvasReady");
const tick = tickers[0];
const ok = (label, cond) => console.log((cond ? "PASS " : "FAIL ") + label);
const fxs = t => t.children.filter(c => c._mgRank !== undefined);
const realNow = performance.now.bind(performance);
let clock = realNow(); performance.now = () => clock;
const step = (ms = 16.7) => { clock += ms; tick(); };
const T = canvas.tokens.placeables[1];   // token B

// --- the per-frame cache never hides a change made between frames (or outside the loop)
T.actor.statuses = new Set(["stunned"]); step();
ok("cache: a status added between frames shows on the next frame", fxs(T).some(c => c._mgRank === 7));
T.actor.statuses = new Set(); step();
ok("cache: …and one removed disappears on the next frame", fxs(T).length === 0);
{ const roller = { statuses: new Set(), effects: [] };
  T.actor.statuses = new Set(["dodging"]); step();
  roller.statuses.add("poisoned");
  const fx = hooks["dnd5e.preRollV2"]; const cfg = { subject: { actor: roller }, hookNames: ["attack", "d20Test", ""], rolls: [{ options: {} }] };
  game.user.targets = new Set(); for (const f of fx) f(cfg, {}, { data: {} });
  ok("cache: rolls read statuses fresh (Poisoned added after the last frame still counts)", cfg.rolls[0].options.disadvantage === true);
  T.actor.statuses = new Set(); step(); }

// --- off screen and hidden tokens
canvas.stage.worldTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
canvas.app.renderer = { screen: { x: 0, y: 0, width: 1000, height: 1000 } };
T.x = 5000; T.y = 5000; T.actor.statuses = new Set(["stunned"]); step();
ok("off screen: no animation is built or updated", fxs(T).length === 0);
T.x = 100; T.y = 100; step();
ok("…and it appears as soon as the token is in view", fxs(T).some(c => c._mgRank === 7));
const starsBefore = fxs(T)[0].children[0].rotation; T.x = 5000; step(); step();
ok("going off screen keeps the animation (frozen, not destroyed)", fxs(T).length === 1 && fxs(T)[0].children[0].rotation === starsBefore && !fxs(T)[0].destroyed);
T.x = 100; step(); ok("…and it carries on when back in view", fxs(T)[0].children[0].rotation !== starsBefore);
T.visible = false; T.actor.statuses = new Set(["stunned", "poisoned"]); step();
ok("not visible to this user: nothing new is built", !fxs(T).some(c => c._mgRank === 4));
T.visible = true; step(); ok("…until it's visible again", fxs(T).some(c => c._mgRank === 4));
// hidden creatures stay hidden even while skipped
const parts = () => ({ visible: true, destroyed: false });
T.nameplate = parts(); T.bars.visible = true; T.effects = parts(); T.tooltip = parts();
T.actor.statuses = new Set(["invisible"]); game.user.isGM = false; T.isOwner = false; canvas.tokens.controlled = []; step(); step();
T.x = 5000; T.nameplate.visible = true; step();
ok("an off-screen invisible creature's name stays hidden", T.nameplate.visible === false);
T.x = 100; step();
T.actor.statuses = new Set(); step();
delete canvas.stage.worldTransform; delete canvas.app.renderer;

// --- blurs
T.actor.statuses = new Set(["burning"]); step(); step();
{ const blurs = []; const walk = o => { for (const f of o.filters ?? []) if (f instanceof BlurFilter) blurs.push(f); (o.children ?? []).forEach(walk); }; walk(fxs(T)[0]);
  ok(`blurs found (${blurs.length})`, blurs.length > 0);
  ok("Full quality: every blur keeps the screen's resolution (half resolution made soft movement step and stutter)", blurs.every(f => f.resolution === null) && blurs.some(f => f.blur >= 4));
  ok("…and the passes the effect gave it", blurs.every(f => f.quality === f._mgBase?.quality && [2, 3, 4].includes(f.quality)));
  globalThis.__fullBlurs = blurs; }
T.actor.statuses = new Set(); step();

// --- Reduced: about 30 updates a second
settings.set("animationQuality", "reduced");
T.actor.statuses = new Set(["stunned"]); step(40);
{ let updates = 0, last = fxs(T)[0].children[0].rotation;
  for (let i = 0; i < 60; i++) { step(); const r = fxs(T)[0].children[0].rotation; if (r !== last) updates++; last = r; }
  ok(`Reduced: about 30 updates a second (${updates} in 1 s)`, updates >= 25 && updates <= 32);
  const blurs = []; const walk = o => { for (const f of o.filters ?? []) if (f instanceof BlurFilter) blurs.push(f); (o.children ?? []).forEach(walk); };
  T.actor.statuses = new Set(["burning"]); step(40); step(40); walk(fxs(T).find(c => c._mgRank === 5));
  ok("Reduced: every blur is a single pass at half resolution", blurs.length > 0 && blurs.every(f => f.quality === 1 && f.resolution === 0.5));
  settings.set("animationQuality", "full"); step(); step();
  ok("back to Full: each blur exactly as it was again", blurs.every(f => f.resolution === null && f.quality === f._mgBase.quality));
  settings.set("animationQuality", "reduced"); step(40); }
// hidden creatures stay hidden between Reduced updates too
T.actor.statuses = new Set(["invisible"]); step(40); step(40); T.nameplate.visible = true; step(5);
ok("Reduced: an invisible creature's name is re-hidden every frame", T.nameplate.visible === false);
T.actor.statuses = new Set(); step(40);

// --- Still: settled and unmoving until something changes
settings.set("animationQuality", "still");
T.actor.statuses = new Set(["marked"]); step();
{ const brackets = fxs(T)[0].children[2];
  ok(`Still: drawn settled (brackets already locked on: ${brackets._s?.[0]?.toFixed(2)})`, Math.abs((brackets._s?.[0] ?? 1) - 1) < 0.05);
  const r0 = brackets.rotation; for (let i = 0; i < 60; i++) step();
  ok("Still: no movement over a second", brackets.rotation === r0); }
T.actor.statuses = new Set(["marked", "stunned"]); step();
ok("Still: a new status is drawn straight away", fxs(T).some(c => c._mgRank === 7));
{ const stars = fxs(T).find(c => c._mgRank === 7).children[0]; const r0 = stars.rotation; for (let i = 0; i < 30; i++) step();
  ok("…and holds still too", stars.rotation === r0); }
T.actor.statuses = new Set(["bloodied"]); step();
ok("Still: Bloodied splatters shown fully splashed, not mid-splash", Math.abs(fxs(T)[0].children[1]._s[0] - 1) < 0.02);
T.actor.statuses = new Set(["invisible"]); step(); step(); T.nameplate.visible = true; step();
ok("Still: an invisible creature's name is re-hidden every frame", T.nameplate.visible === false);
T.actor.statuses = new Set(); step();

// --- Automatic follows the system's reduced-motion preference
settings.set("animationQuality", "auto");
// Like the browser's: one query object for the preference, which updates itself when it changes
const motionQuery = { matches: true }; let queries = 0;
globalThis.matchMedia = q => { queries++; return q.includes("reduce") ? motionQuery : { matches: false }; };
T.actor.statuses = new Set(["stunned"]); step();
{ const stars = fxs(T)[0].children[0]; const r0 = stars.rotation; for (let i = 0; i < 20; i++) step();
  ok("Automatic + system asks for reduced motion: Still", stars.rotation === r0); }
motionQuery.matches = false;
{ const stars = fxs(T)[0].children[0]; const r0 = stars.rotation; for (let i = 0; i < 20; i++) step();
  ok("Automatic otherwise: Full", stars.rotation !== r0); }
ok(`the preference is looked up once, not every frame (${queries})`, queries === 1);
delete globalThis.matchMedia;
T.actor.statuses = new Set(); step();
ok("quality setting: per player, Automatic by default, four choices", settingsCfg.get("primal-status.animationQuality")?.scope === "client"
  && settingsCfg.get("primal-status.animationQuality")?.default === "auto" && Object.keys(settingsCfg.get("primal-status.animationQuality")?.choices ?? {}).length === 4);
performance.now = realNow;
