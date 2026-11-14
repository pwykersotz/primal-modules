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
const staticID = id => id.length >= 16 ? id.slice(0, 16) : id.padEnd(16, "0");
globalThis.dnd5e = { utils: { staticID } };
CONFIG.DND5E = { conditionTypes: { exhaustion: { name: "DND5E.ConExhaustion", img: "systems/dnd5e/icons/svg/statuses/exhaustion.svg", levels: 6 } } };
CONFIG.ActiveEffect = { dataModels: { condition: { hasLevels(type) { return Number.isFinite(CONFIG.DND5E.conditionTypes[type]?.levels); } } } };
game.system.id = "dnd5e";
await import(process.argv[2]);
call("init");
// dnd5e builds CONFIG.statusEffects from its condition types during i18nInit
const typesAtInit = structuredClone(CONFIG.DND5E.conditionTypes);
CONFIG.statusEffects = Object.fromEntries(Object.entries(CONFIG.DND5E.conditionTypes).map(([id, d]) => [id, { id, ...d, _id: staticID(`dnd5e${id}`) }]));
call("setup"); call("ready"); call("canvasReady");
const tick = tickers[0]; const run = n => { for (let i=0;i<n;i++) tick(); };
const fxs = t => t.children.filter(c=>c._mgRank!==undefined);
const ok = (label, cond) => console.log((cond ? "PASS " : "FAIL ") + label);
// --- dnd5e 6 leveled conditions ---

const c = typesAtInit.contamination;
ok("contamination added to dnd5e condition types at init (before status effects are built)", !!c && c.levels === 6 && c.img === "modules/primal-status/icons/contamination.svg");
ok("levels 4 and 5 add Weakened and Dazed", JSON.stringify(c.conditions) === '{"4":["weakened"],"5":["dazed"]}');
ok("name localized by setup", CONFIG.DND5E.conditionTypes.contamination.name === "L:MIGHTYGUARD.Contamination");
const se = CONFIG.statusEffects.contamination;
ok("status keeps dnd5e's static id", se._id === "dnd5econtaminati");
ok("status keeps the level settings and gets a description", se.levels === 6 && se.description === "L:MIGHTYGUARD.Desc.Contamination");
ok("level icons follow dnd5e's naming", se.img.replace(".svg", "-3.svg") === "modules/primal-status/icons/contamination-3.svg");
ok("exhaustion untouched", CONFIG.statusEffects.exhaustion._id === "dnd5eexhaustion0" && !CONFIG.statusEffects.exhaustion.description);
// The palette fallback stays out of the way: dnd5e handles the clicks
globalThis.HTMLElement ??= class {};
const listeners = {}, icon = { dataset: { statusId: "contamination" }, style: {}, addEventListener: (t, f) => { listeners[t] = f; } };
const root = Object.assign(new HTMLElement(), { querySelector: sel => sel.includes('"contamination"') ? icon : null });
for (const f of hooks.renderTokenHUD) try { f({ object: { actor: { effects: [] } } }, root); } catch {}
ok("no click handlers added on dnd5e 6", !listeners.click && !listeners.contextmenu);
// Visuals read dnd5e's condition level
B.actor.effects = [{ statuses: new Set(["contamination", "weakened"]), system: { level: 4 }, disabled: false, active: true }];
B.actor.statuses = new Set(["contamination", "weakened"]); run(3);
ok("dnd5e condition level drives the gem", fxs(B).at(-1).children[0].children[2].text === "4");
B.actor.effects[0].active = false; B.actor.statuses = new Set(); run(1);
ok("suppressed condition (e.g. immunity) shows nothing", fxs(B).length === 0 || !fxs(B).some(c => c._mgRank === 1.6));
