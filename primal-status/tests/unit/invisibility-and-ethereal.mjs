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
class TokenObj { async _drawEffect(src){ this.drawn = (this.drawn ?? []); this.drawn.push(src); return { src }; } get isVisible() { return this._baseVisible ?? true; }
  _getVisionSourceData() { return { radius: this._sight ?? 0, lightRadius: this._light ?? Infinity, visionMode: this._mode ?? "basic", saturation: 0 }; }
  getLightRadius(units) { return units * 20 + 50; } }
class DetectionMode { _testRange(vs, mode, target, test) { return this._inRange ?? true; } }
globalThis.CONFIG = { statusEffects: { blinded:{id:"blinded"} }, Dice:{}, Token:{ objectClass: TokenObj } };
class Actor {} globalThis.Actor = Actor;
class Roll { constructor(f){ this.formula=f; this.options={}; this.dice=[]; } evaluate(o){ this.lastOpts=o; return this; } }
globalThis.Roll = Roll;
const toRGB = n=>[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
globalThis.foundry = { canvas: { perception: { DetectionMode } }, applications: { api: { ApplicationV2: class {} } }, utils: { getProperty:(o,p)=>p.split(".").reduce((a,k)=>a?.[k],o),
  Color: { from:n=>({rgb:toRGB(Number(n))}), fromRGB:a=>((Math.round(a[0]*255)<<16)|(Math.round(a[1]*255)<<8)|Math.round(a[2]*255)) } } };
class Token extends Obs { constructor(id){ super(); this.w=100; this.h=100; this.mesh={tint:0xFFFFFF, alpha:1};
  this.document={id, texture:{tint:0xFFFFFF}, alpha:1}; this.actor=Object.assign(new Actor(), {statuses:new Set(), effects:[], created:[], createEmbeddedDocuments:async(t,d)=>{this.actor.created.push(...d);}}); this.renderFlags={set:f=>this.flagsSet=f};
  this.bars=new Obs(); this.voidMesh=new Obs(); this.addChild(new Obs(), this.voidMesh, this.bars); } }
Token.RENDER_FLAGS = { refreshState:{}, refreshMesh:{} };
const A = new Token("tokA"), B = new Token("tokB");
globalThis.canvas = { ready:true, stage:{scale:{x:0.75}}, app:{ ticker:{ add:f=>tickers.push(f) } }, tokens:{ placeables:[A,B] } };
CONFIG.Canvas = { detectionModes: {
  basicSight: { id: "basicSight", walls: true, _canDetect(vs, t) { return !t.document.hasStatusEffect("invisible"); } },
  seeInvisibility: { id: "seeInvisibility", walls: true, _canDetect(vs, t) { return t.document.hasStatusEffect("invisible"); } }
} };
CONFIG.specialStatusEffects = { INVISIBLE: "invisible", BLIND: "blinded", BURROW: "burrowing" };
CONFIG.Canvas.visionModes = { basic: {}, darkvision: {}, monochromatic: {} };
await import(process.argv[2]);
call("init"); call("setup"); call("ready"); call("canvasReady");
const tick = tickers[0]; const run = n => { for (let i=0;i<n;i++) tick(); };
const fxs = t => t.children.filter(c=>c._mgRank!==undefined);
const ok = (label, cond) => console.log((cond ? "PASS " : "FAIL ") + label);

const mkDoc = (statuses, actor) => ({ documentName: "Token", actor, hasStatusEffect: id => statuses.has(id) });
const sight = CONFIG.Canvas.detectionModes.basicSight;
const viewer = { object: { document: mkDoc(new Set()) } };
const target = st => { const set = new Set(st); const actor = { statuses: set, effects: [] }; return { document: mkDoc(set, actor), actor }; };
ok("sight sees an ordinary creature", sight._canDetect(viewer, target([])));
ok("sight sees an Invisible creature (as a whirl)", sight._canDetect(viewer, target(["invisible"])));
ok("…but not one that is Invisible and Hiding", !sight._canDetect(viewer, target(["invisible", "hiding"])));
ok("a Blinded viewer still can't", !sight._canDetect({ object: { document: mkDoc(new Set(["blinded"])) } }, target(["invisible"])));
ok("a burrowing creature stays hidden", !sight._canDetect(viewer, target(["invisible", "burrowing"])));
ok("See Invisibility untouched", CONFIG.Canvas.detectionModes.seeInvisibility._canDetect(viewer, target(["invisible", "hiding"])));
settings.set("invisibleWhirl", false);
ok("setting off: Foundry's normal invisibility", !sight._canDetect(viewer, target(["invisible"])));
settings.set("invisibleWhirl", true);

// Without token vision, an Invisible + Hiding token is gone for players
canvas.visibility = { tokenVision: false };
const T = new TokenObj(); T.document = mkDoc(new Set(["invisible", "hiding"])); T.actor = { statuses: new Set(["invisible", "hiding"]), effects: [] }; T._baseVisible = true;
game.user.isGM = false;
ok("no token vision: Invisible + Hiding is gone for players", T.isVisible === false);
T.isOwner = true; ok("…but its owner still sees it", T.isVisible === true); T.isOwner = false;
game.user.isGM = true; ok("…and so does the GM", T.isVisible === true); game.user.isGM = false;
T.actor.statuses = new Set(["invisible"]); T.document = mkDoc(new Set(["invisible"]));
ok("no token vision: Invisible alone stays visible (as a whirl)", T.isVisible === true);
canvas.visibility = { tokenVision: true }; T._baseVisible = false;
ok("with token vision Foundry decides", T.isVisible === false);

// The whirl and what each viewer sees
canvas.visibility = { tokenVision: true };
const parts = () => ({ visible: true, destroyed: false });
B.nameplate = parts(); B.bars.visible = true; B.effects = parts(); B.tooltip = parts();
B.actor.statuses = new Set(["invisible", "poisoned"]); B.actor.effects = []; game.user.isGM = false; B.isOwner = false;
run(3);
const kinds = fxs(B).map(c => c._mgRank);
ok("Invisible: whirl layer added", kinds.includes(2.2));
ok("player view: art hidden, name/bars/icons hidden", B.mesh.alpha === 0 && !B.nameplate.visible && !B.bars.visible && !B.effects.visible && !B.tooltip.visible);
ok("player view: other effects (poison drips) hidden too", fxs(B).filter(c => c._mgRank !== 2.2).every(c => c.visible === false));
{ let valid = true; for (let i = 0; i < 120; i++) { tick(); if (!fxs(B).every(c => Number.isFinite(c.x) && Number.isFinite(c.y))) valid = false; } ok("whirl stays valid over time", valid); }
const uiShown = () => B.nameplate.visible && B.bars.visible && B.effects.visible && B.tooltip.visible;
const uiHidden = () => !B.nameplate.visible && !B.bars.visible && !B.effects.visible && !B.tooltip.visible;
const resetUI = () => { B.nameplate.visible = true; B.bars.visible = true; B.effects.visible = true; B.tooltip.visible = true; };
const others = () => fxs(B).filter(c => c._mgRank !== 2.2);
const whirlOn = () => { const w = fxs(B).find(c => c._mgRank === 2.2); return w.children.slice(2, 5).some(g => g.alpha > 0.05); };
const ringAlpha = () => { const w = fxs(B).find(c => c._mgRank === 2.2); return w.children[0].alpha > 0.12 && Math.min(...w.children.slice(2, 5).map(g => g.alpha)) >= 0.39 ? 1 : 0; };
resetUI(); game.user.isGM = true; run(1);
ok("GM view: only the whirl as well (no art, name, bars, icons or other effects)", B.mesh.alpha === 0 && uiHidden() && others().every(c => c.visible === false) && whirlOn());
resetUI(); game.user.isGM = false; B.isOwner = true; run(1);
ok("owner view: only the whirl", B.mesh.alpha === 0 && uiHidden() && whirlOn());
B.isOwner = false;
const seer = new TokenObj(); seer.actor = { statuses: new Set(), effects: [], system: { attributes: { senses: { ranges: { truesight: 60 } } } } }; seer.document = { x: 100, y: 0, width: 1, height: 1, elevation: 0, detectionModes: {} };
B.document.x = 0; B.document.y = 0; B.document.width = 1; B.document.height = 1; B.document.elevation = 0;
canvas.dimensions = { size: 100, distance: 5 }; canvas.tokens.controlled = [seer];
run(1);
ok("player whose creature has Truesight sees the art in full", B.mesh.alpha === 1);
ok("…with the whirl kept", ringAlpha() === 1);
ok("…and its name, bars and other effects come back", uiShown() && others().every(c => c.visible === true));
game.user.isGM = true; run(1);
ok("GM with a Truesight creature selected: art in full, whirl kept", B.mesh.alpha === 1 && ringAlpha() === 1 && uiShown());
seer.document.detectionModes = {}; seer.actor.system.attributes.senses.ranges.truesight = 0;
seer.document.detectionModes = { seeInvisibility: { id: "seeInvisibility", enabled: true, range: 30 } }; run(1);
ok("GM with a See Invisibility creature selected: art in full", B.mesh.alpha === 1);
seer.document.x = 900; run(1);
ok("…but not when it's out of range (only the whirl again)", B.mesh.alpha === 0 && uiHidden() && whirlOn());
seer.document.x = 100; seer.actor.statuses = new Set(["blinded"]); run(1);
ok("…or Blinded", B.mesh.alpha === 0);
seer.actor.statuses = new Set();
canvas.tokens.controlled = []; seer.isOwner = true; canvas.tokens.placeables = [...(canvas.tokens.placeables ?? []), seer]; run(1);
ok("GM with nothing selected: only the whirl, even with a seer on the scene", B.mesh.alpha === 0 && whirlOn());
canvas.tokens.placeables = canvas.tokens.placeables.filter(t => t !== seer); seer.isOwner = false;
game.user.isGM = false; B.isOwner = true; canvas.tokens.controlled = [B]; run(1);
ok("owner looking through the invisible creature itself: only the whirl", B.mesh.alpha === 0 && whirlOn());
B.isOwner = false;
canvas.tokens.controlled = [];
B.actor.statuses = new Set(["invisible", "hiding", "poisoned"]); run(1);
const fogLayer = () => fxs(B).find(c => c._mgRank === 2);
ok("Invisible + Hiding, player: nothing at all (no art, whirl, fog or other effects)", B.mesh.alpha === 0 && !whirlOn() && uiHidden() && fogLayer() && others().every(c => c.visible === false));
B.isOwner = true; run(1);
ok("Invisible + Hiding, owner: nothing at all either", B.mesh.alpha === 0 && !whirlOn() && others().every(c => c.visible === false));
B.isOwner = false;
game.user.isGM = true; run(1);
ok("Invisible + Hiding, GM: only the Hiding fog (no art, whirl, name, bars or other effects)", B.mesh.alpha === 0 && !whirlOn() && uiHidden()
  && fogLayer().visible === true && others().filter(c => c._mgRank !== 2).length > 0 && others().filter(c => c._mgRank !== 2).every(c => c.visible === false));
{ const puffs = fogLayer().children[0].children; ok("…and the fog is actually drawn (puffs visible)", puffs.some(p => p.alpha > 0.1)); }
B.actor.statuses = new Set(["invisible"]); run(1);
ok("GM, Invisible only: just the whirl again (no fog)", !fogLayer() && whirlOn());
B.actor.statuses = new Set(["invisible", "hiding"]); run(1);
B.isOwner = false;
canvas.tokens.controlled = [seer]; seer.document.detectionModes = { seeInvisibility: { id: "seeInvisibility", enabled: true, range: 30 } }; run(1);
const fogShown = () => fxs(B).some(c => c._mgRank === 2 && c.visible !== false);
ok("Invisible + Hiding seen through a creature that sees invisible: art shown (under the Hiding fog), no whirl", B.mesh.alpha > 0.8 && !whirlOn() && uiShown() && fogShown());
game.user.isGM = false; run(1);
ok("…same for a player", B.mesh.alpha > 0.8 && !whirlOn() && fogShown());
canvas.tokens.controlled = [];
B.flagsSet = null; B.actor.statuses = new Set(); run(1);
ok("leaving invisibility restores the token's name, bars and icons", fxs(B).length === 0 && B.flagsSet?.refreshState);

// ---------- Ethereal: works like invisibility, and sees in grey up to 60 ft ----------
{
  const eViewer = { object: { document: mkDoc(new Set(["ethereal"])) } };
  ok("Ethereal: seen from the material plane as a whirl (targetable)", sight._canDetect(viewer, target(["ethereal"])) === true);
  ok("Ethereal + Hiding: gone", sight._canDetect(viewer, target(["ethereal", "hiding"])) === false);
  ok("another Ethereal creature sees it normally, Hiding or not", sight._canDetect(eViewer, target(["ethereal"])) === true && sight._canDetect(eViewer, target(["ethereal", "hiding"])) === true);
  ok("…but not if it's also Invisible and Hiding", sight._canDetect(eViewer, target(["ethereal", "invisible", "hiding"])) === false);
  const seeInv = CONFIG.Canvas.detectionModes.seeInvisibility;
  ok("See Invisibility sees into the Ethereal Plane (Hiding too)", seeInv._canDetect(viewer, target(["ethereal"])) && seeInv._canDetect(viewer, target(["ethereal", "hiding"])));
  ok("…unless the viewer is Blinded", !seeInv._canDetect({ object: { document: mkDoc(new Set(["blinded"])) } }, target(["ethereal"])));
  settings.set("invisibleWhirl", false);
  ok("whirl setting off: Ethereal works like Foundry's invisibility (not seen by sight)", sight._canDetect(viewer, target(["ethereal"])) === false && sight._canDetect(viewer, target([])) === true);
  settings.set("invisibleWhirl", true);

  // what each viewer sees
  canvas.visibility = { tokenVision: true };
  B.actor.statuses = new Set(["ethereal"]); game.user.isGM = false; B.isOwner = false; canvas.tokens.controlled = []; run(2);
  const whirlLayer = () => fxs(B).find(c => c._mgRank === 2.2);
  ok("Ethereal token: only the whirl for a player", !!whirlLayer() && B.mesh.alpha === 0);
  game.user.isGM = true; run(1);
  ok("…and for the GM with nothing selected", B.mesh.alpha === 0);
  const blindseer = new TokenObj(); blindseer.actor = { statuses: new Set(), effects: [], system: { attributes: { senses: { ranges: { blindsight: 60 } } } } }; blindseer.document = { x: 100, y: 0, width: 1, height: 1, elevation: 0, detectionModes: {} };
  canvas.tokens.controlled = [blindseer]; run(1);
  ok("Blindsight doesn't reach into the Ethereal Plane", B.mesh.alpha === 0);
  B.actor.statuses = new Set(["invisible"]); run(1);
  ok("…though it finds an Invisible creature", B.mesh.alpha === 1);
  B.actor.statuses = new Set(["ethereal"]);
  blindseer.actor.system.attributes.senses.ranges = { truesight: 60 }; run(1);
  ok("Truesight sees an Ethereal creature in full", B.mesh.alpha === 1);
  blindseer.actor.system.attributes.senses.ranges = {}; blindseer.document.detectionModes = { seeInvisibility: { id: "seeInvisibility", enabled: true, range: 30 } }; run(1);
  ok("So does See Invisibility", B.mesh.alpha === 1);
  blindseer.document.detectionModes = {}; blindseer.actor.statuses = new Set(["ethereal"]); run(1);
  ok("Ethereal creatures see each other", B.mesh.alpha === 1);
  B.actor.statuses = new Set(["ethereal", "invisible"]); run(1);
  ok("…but not one that's also Invisible (that still needs Truesight or similar)", B.mesh.alpha === 0);
  canvas.tokens.controlled = []; game.user.isGM = false;
  // no token vision: Ethereal + Hiding is gone for players
  canvas.visibility = { tokenVision: false };
  const T2 = new TokenObj(); T2.document = mkDoc(new Set(["ethereal", "hiding"])); T2.actor = { statuses: new Set(["ethereal", "hiding"]), effects: [] }; T2._baseVisible = true;
  ok("no token vision: Ethereal + Hiding is gone for players", T2.isVisible === false);
  canvas.visibility = { tokenVision: true };
  B.actor.statuses = new Set(); run(1);

  // the Ethereal creature's own vision
  const E = new TokenObj(); E.actor = { statuses: new Set(["ethereal"]), effects: [] }; E._sight = 2000; E._light = Infinity; E._mode = "darkvision";
  canvas.scene = { grid: { units: "ft" } };
  const v = E._getVisionSourceData();
  ok("Ethereal vision is black and white (monochromatic, no saturation)", v.visionMode === "monochromatic" && v.saturation === -1);
  ok(`…and reaches 60 ft (sight ${v.radius}px, lit areas ${v.lightRadius}px; 60 ft = 1250px here)`, v.radius === 1250 && v.lightRadius === 1250);
  E._sight = 300; ok("shorter sight isn't lengthened", E._getVisionSourceData().radius === 300);
  E._sight = 0; ok("no darkvision: still sees lit areas, but only to 60 ft", E._getVisionSourceData().radius === 0 && E._getVisionSourceData().lightRadius === 1250);
  canvas.scene = { grid: { units: "m" } };
  ok("metric scenes: 18 m", E._getVisionSourceData().lightRadius === 18 * 20 + 50);
  canvas.scene = { grid: { units: "ft" } };
  const N = new TokenObj(); N.actor = { statuses: new Set(), effects: [] }; N._sight = 2000; N._mode = "darkvision";
  const nv = N._getVisionSourceData();
  ok("other creatures' vision untouched", nv.radius === 2000 && nv.lightRadius === Infinity && nv.visionMode === "darkvision" && nv.saturation === 0);
  settings.set("etherealVision", false);
  ok("setting off: Ethereal vision untouched", E._getVisionSourceData().visionMode === "basic" || E._getVisionSourceData().saturation === 0);
  settings.set("etherealVision", true);
  // detection beyond 60 ft
  const dm = new DetectionMode();
  const vs = (tok) => ({ object: tok, x: 0, y: 0 });
  ok("an Ethereal creature detects nothing beyond 60 ft", dm._testRange(vs(E), {}, {}, { point: { x: 1200, y: 0 } }) === true && dm._testRange(vs(E), {}, {}, { point: { x: 1300, y: 0 } }) === false);
  ok("…by any sense (even unlimited ones)", dm._testRange(vs(E), { range: null }, {}, { point: { x: 5000, y: 0 } }) === false);
  ok("others' detection ranges untouched", dm._testRange(vs(N), {}, {}, { point: { x: 5000, y: 0 } }) === true);
  dm._inRange = false; ok("never extends a range", dm._testRange(vs(E), {}, {}, { point: { x: 10, y: 0 } }) === false); dm._inRange = undefined;
  ok("the vision setting is shown to the GM, on by default", settingsCfg.get("primal-status.etherealVision")?.config === true && settingsCfg.get("primal-status.etherealVision")?.default === true && settingsCfg.get("primal-status.etherealVision")?.scope === "world");
}
