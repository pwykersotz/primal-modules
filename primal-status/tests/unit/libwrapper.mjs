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
  modules:new Map([["primal-status",{}],["lib-wrapper",{active:true}]]), release:{generation:14}, system:{id:"dnd5e"}, user:{targets:new Set()} };
game.modules.get = Map.prototype.get.bind(game.modules); game.settings.settings = settingsCfg;
class TokenObj { async _drawEffect(src){ this.drawn = (this.drawn ?? []); this.drawn.push(src); return { src }; } }
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
globalThis.__reg = [];
CONFIG.Canvas = { detectionModes: { basicSight: { _canDetect(){ return true; } }, lightPerception: { _canDetect(){ return true; } } } };
globalThis.libWrapper = { register:(m, path, fn, type) => __reg.push({ m, path, type }) };
await import(process.argv[2]);
call("init"); call("setup"); call("ready");
const byPath = Object.fromEntries(__reg.map(r => [r.path, r.type]));
console.log(JSON.stringify(byPath, null, 1));
const okk = (l,c)=>console.log((c?"PASS ":"FAIL ")+l);
okk("_drawEffect registered as MIXED with libWrapper", byPath["CONFIG.Token.objectClass.prototype._drawEffect"] === "MIXED");
okk("Roll wrappers stay WRAPPER", byPath["Roll.prototype.evaluate"] === "WRAPPER");
okk("all registrations under this module's ID", __reg.every(r => r.m === "primal-status"));
okk("isVisible getter wrapped as WRAPPER", byPath["CONFIG.Token.objectClass.prototype.isVisible"] === "WRAPPER");
okk("sight detection modes wrapped as WRAPPER", byPath["CONFIG.Canvas.detectionModes.basicSight._canDetect"] === "WRAPPER" && byPath["CONFIG.Canvas.detectionModes.lightPerception._canDetect"] === "WRAPPER");
