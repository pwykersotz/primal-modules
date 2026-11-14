// Per-token opt-out, the GM's choices for everyone, the Ethereal shimmer, and leaving statuses to
// Token Magic FX and Sequencer.   node token-options.mjs <path to scripts/primal-status.js>
const hooks = {};
globalThis.Hooks = { once:(n,f)=>(hooks[n]??=[]).push(f), on:(n,f)=>(hooks[n]??=[]).push(f) };
const call = (n,...a)=>(hooks[n]??[]).forEach(f=>f(...a));
class Obs { constructor(){ this.children=[]; this.parent=null; this.destroyed=false; this.alpha=1; this.rotation=0; this.x=0; this.y=0; this.visible=true;
  this.scale={set:(a,b)=>{this._s=[a,b??a]}}; this.position={set:(x,y)=>{this.x=x;this.y=y}}; this.pivot={set:(x,y)=>{this._p=[x,y??x]}}; this.filters=null; }
  addChild(...c){ c.forEach(x=>{x.parent=this; this.children.push(x)}); return c[0]; }
  addChildAt(c,i){ c.parent=this; this.children.splice(i,0,c); return c; }
  getChildIndex(c){ return this.children.indexOf(c); }
  removeChildren(){ const c=this.children; this.children=[]; c.forEach(x=>x.parent=null); return c; }
  destroy(o){ this.destroyed=true; if(o?.children) [...this.children].forEach(c=>c.destroy(o)); if(this.parent){ this.parent.children=this.parent.children.filter(x=>x!==this); this.parent=null; } } }
class Graphics extends Obs { constructor(){super(); this.calls=[];} }
for (const m of ["clear","lineStyle","drawEllipse","beginFill","drawCircle","endFill","moveTo","lineTo","drawPolygon","bezierCurveTo","closePath","arc","drawRect","drawRoundedRect"]) Graphics.prototype[m]=function(...a){ for (const v of a) if (typeof v==="number" && !Number.isFinite(v)) throw new Error(`${m} got non-finite ${v}`); if (m === "clear") this.calls = []; this.calls.push(m); return this; };
class BlurFilter { constructor(s,q){ this._b=s; } set blur(v){ if(!Number.isFinite(v)) throw new Error("bad blur "+v); this._b=v; } get blur(){return this._b;} destroy(){ this.gone=true; } }
class TextStyle { constructor(o){ Object.assign(this,o); } }
class Text extends Obs { constructor(str, style){ super(); this.text=str; this.style=style; this.anchor={set:v=>this._anchor=v}; } }
const tickers=[];
class Sprite extends Obs { constructor(t){ super(); this.texture=t; this.anchor={set:(x,y)=>{this._anchor=[x,y??x]}}; } }
class Rectangle { constructor(x,y,width,height){ Object.assign(this,{x,y,width,height}); } }
class Texture { constructor(base, frame){ this.baseTexture=base; this.frame=frame; this.width=frame.width; this.height=frame.height; this.src=base.src; } }
globalThis.PIXI = { Container: Obs, Graphics, Text, TextStyle, BlurFilter, Sprite, Texture, Rectangle, BLEND_MODES:{ADD:1, NORMAL:0}, UPDATE_PRIORITY:{NORMAL:0}, LINE_CAP:{ROUND:"round"}, LINE_JOIN:{ROUND:"round"} };
const settings = new Map(); const settingsCfg = new Map(); const notes = [];
globalThis.game = { settings:{ register:(m,k,o)=>{ settings.set(k,o.default); settingsCfg.set(`${m}.${k}`, o); }, get:(m,k)=>settings.get(k), registerMenu:()=>{},
    set:async (m,k,v)=>{ settings.set(k,v); settingsCfg.get(`${m}.${k}`)?.onChange?.(v); return v; } },
  i18n:{localize:s=>"L:"+s, has:k=>k.startsWith("MIGHTYGUARD")},
  modules:new Map([["primal-status",{ active:true }]]), release:{generation:14}, system:{id:"dnd5e"}, user:{targets:new Set(), isGM:false} };
game.modules.get = Map.prototype.get.bind(game.modules); game.settings.settings = settingsCfg;
globalThis.ui = { notifications: { info: m => notes.push(m) } };
// Like Foundry's token: icons are sprites in this.effects; refresh lays them out (the overlay at 60%)
class TokenObj { async _drawEffect(src){ const icon = { src, width: 20, height: 20, tint: 0xFFFFFF, alpha: 1, x: 0, y: 0, anchor: { set: (x, y) => { icon._anchor = [x, y ?? x]; } }, position: { set: (x, y) => { icon.x = x; icon.y = y; } } };
    if (this.effects?.children) this.effects.children.push(icon); return icon; }
  _refreshEffects() { const o = this.effects?.overlay; for (const c of this.effects?.children ?? []) if (c === o) { c.width = c.height = Math.min(this.w, this.h) * 0.6; } else { c.width = c.height = 20; } }
  getSize() { return { width: this.w, height: this.h }; }
  getCenterPoint(p) { return { x: p.x + this.w / 2, y: p.y + this.h / 2 }; }
  get isVisible() { return this._baseVisible ?? true; } }
// Another module (or the system) already has a Helpless status: it must be left as it is
globalThis.CONFIG = { statusEffects: { blinded:{id:"blinded"}, helpless:{ id:"helpless", name:"Helpless (theirs)", img:"theirs/helpless.webp" } }, Dice:{}, Token:{ objectClass: TokenObj } };
class Actor {} globalThis.Actor = Actor;
class Roll { constructor(f){ this.formula=f; this.options={}; this.dice=[]; } evaluate(o){ this.lastOpts=o; return this; } }
globalThis.Roll = Roll;
const toRGB = n=>[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
const hasProperty = (o,p) => { let a = o; for (const k of p.split(".")) { if (a == null || typeof a !== "object" || !(k in a)) return false; a = a[k]; } return true; };
globalThis.foundry = { canvas: { loadTexture: async src => { if (src.includes("/images/fx/")) return { width: 104, height: 256, src, frame: { x: 0, y: 0 }, baseTexture: { src } }; throw new Error("no such image here"); } },
  applications: { api: { ApplicationV2: class {} } }, utils: { getProperty:(o,p)=>p.split(".").reduce((a,k)=>a?.[k],o), hasProperty,
  Color: { from:n=>({rgb:toRGB(Number(n))}), fromRGB:a=>((Math.round(a[0]*255)<<16)|(Math.round(a[1]*255)<<8)|Math.round(a[2]*255)) } } };
class Token extends Obs { constructor(id){ super(); this.w=100; this.h=100; this.mesh={tint:0xFFFFFF, alpha:1};
  this.document={id, texture:{tint:0xFFFFFF}, alpha:1, flags:{}, hasStatusEffect:id=>this.actor.statuses.has(id)}; this.actor=Object.assign(new Actor(), {statuses:new Set(), effects:[]}); this.renderFlags={set:f=>this.flagsSet=f};
  this.bars=new Obs(); this.voidMesh=new Obs(); this.addChild(new Obs(), this.voidMesh, this.bars); } }
Token.RENDER_FLAGS = { refreshState:{}, refreshMesh:{} };
const A = new Token("tokA"), B = new Token("tokB");
globalThis.canvas = { ready:true, stage:{scale:{x:0.75}}, app:{ ticker:{ add:f=>tickers.push(f) } }, tokens:{ placeables:[A,B], controlled:[] }, visibility:{ tokenVision:true } };
CONFIG.Canvas = { detectionModes: {
  basicSight: { id: "basicSight", walls: true, _canDetect(vs, t) { return !t.document.hasStatusEffect("invisible"); } },
  seeInvisibility: { id: "seeInvisibility", walls: true, _canDetect(vs, t) { return t.document.hasStatusEffect("invisible"); } }
} };
CONFIG.specialStatusEffects = { INVISIBLE: "invisible", BLIND: "blinded", DEFEATED: "dead" };
await import(process.argv[2]);
call("init"); call("setup"); call("ready"); call("canvasReady");
const tick = tickers[0]; const run = n => { for (let i=0;i<n;i++) tick(); };
const fxs = t => t.children.filter(c=>c._mgRank!==undefined);
const ok = (label, cond) => console.log((cond ? "PASS " : "FAIL ") + label);
const settle = () => new Promise(r => setTimeout(r, 0));
const optOut = (t, off = true) => { t.document.flags = off ? { "primal-status": { animations: false } } : {}; };

/* ---------- 1. A token set to show no animations ---------- */
{
  B.actor.statuses = new Set(["bleeding", "marked"]); run(2);
  ok("ordinary token: its animations show", fxs(B).length === 2);
  optOut(B); B.flagsSet = null; run(1);
  ok("animations off for this token: they're cleared", fxs(B).length === 0);
  ok("…and the art is put back as Foundry draws it", B.mesh.alpha === 1 && B.mesh.tint === 0xFFFFFF && B.flagsSet?.refreshMesh);
  run(5); ok("…and stay off", fxs(B).length === 0);
  A.actor.statuses = new Set(["bleeding"]); run(1);
  ok("other tokens keep theirs", fxs(A).length === 1);
  optOut(B, false); run(1);
  ok("turned back on: the animations return", fxs(B).length === 2);
  B.actor.statuses = new Set(); A.actor.statuses = new Set(); run(1);
  B.document.flags = { "mighty-guard": { animations: true } }; B.actor.statuses = new Set(["marked"]); run(1);
  ok("ticked (flag true) counts as on", fxs(B).length === 1);
  B.actor.statuses = new Set(); run(1);

  // icons
  const draw = (t, src) => TokenObj.prototype._drawEffect.call(t, src);
  const mk = (statuses, off) => { const t = Object.create(TokenObj.prototype); const set = new Set(statuses);
    const effects = [...set].map(id => ({ img: id === "dead" ? "icons/svg/skull.svg" : `icons/${id}.svg`, statuses: new Set([id]), disabled: false }));
    Object.assign(t, { w: 100, h: 100, document: { hasStatusEffect: id => set.has(id), flags: off ? { "primal-status": { animations: false } } : {} }, actor: { statuses: set, effects, temporaryEffects: effects }, effects: { children: [], overlay: null } });
    return t; };
  ok("ordinary token: an animated status's icon is left off", (await draw(mk(["bleeding"]), "icons/bleeding.svg")) === null);
  ok("animations off for the token: the icon is drawn", (await draw(mk(["bleeding"], true), "icons/bleeding.svg"))?.src === "icons/bleeding.svg");
  { const t = mk(["dead", "bloodied", "prone"], true); const sk = await draw(t, "icons/svg/skull.svg"); t._refreshEffects();
    ok("animations off: no big red Dead skull (Foundry's own)", t.effects.overlay === null && sk.tint === 0xFFFFFF && sk.width === 20);
    ok("…and Bloodied and Prone icons show while dead", (await draw(t, "icons/bloodied.svg"))?.src === "icons/bloodied.svg" && (await draw(t, "icons/prone.svg"))?.src === "icons/prone.svg"); }
  { const t = mk(["dead"]); const sk = await draw(t, "icons/svg/skull.svg"); t._refreshEffects();
    ok("(an ordinary dead token still gets the red skull)", t.effects.overlay === sk && sk.tint === 0xC8102E); }

  // invisibility: no whirl, so Foundry's own invisibility
  const sight = CONFIG.Canvas.detectionModes.basicSight;
  const viewer = { object: { document: { hasStatusEffect: () => false } } };
  const target = (st, off) => { const set = new Set(st); const actor = { statuses: set, effects: [] };
    return { document: { documentName: "Token", actor, hasStatusEffect: id => set.has(id), flags: off ? { "primal-status": { animations: false } } : {} }, actor }; };
  ok("ordinary Invisible creature: seen by sight (as a whirl)", sight._canDetect(viewer, target(["invisible"])) === true);
  ok("animations off: Foundry's invisibility (not seen by sight)", sight._canDetect(viewer, target(["invisible"], true)) === false);
  ok("…Ethereal too", sight._canDetect(viewer, target(["ethereal"], true)) === false && sight._canDetect(viewer, target(["ethereal"])) === true);
  ok("…and ordinary creatures are still seen", sight._canDetect(viewer, target([], true)) === true);
  canvas.visibility = { tokenVision: false };
  const T = new TokenObj(); T.document = target(["invisible", "hiding"], true).document; T.actor = T.document.actor; T._baseVisible = true;
  ok("no token vision, Invisible + Hiding, animations off: Foundry decides (shown)", T.isVisible === true);
  T.document.flags = {}; ok("(with animations: gone for players)", T.isVisible === false);
  canvas.visibility = { tokenVision: true };
  B.nameplate = new Obs(); B.effects = new Obs(); B.tooltip = new Obs();
  optOut(B); B.actor.statuses = new Set(["invisible"]); run(2);
  ok("an Invisible token with animations off gets no whirl and isn't hidden by this module", fxs(B).length === 0 && B.mesh.alpha === 1 && B.nameplate.visible && B.bars.visible);
  optOut(B, false); run(1);
  ok("(with animations it's only the whirl)", fxs(B).some(c => c._mgRank === 2.2) && B.mesh.alpha === 0 && !B.nameplate.visible);
  B.actor.statuses = new Set(); run(1);

  // redraws when the flag changes; macro API
  let redraw = null; const placeable = { constructor: { RENDER_FLAGS: { redrawEffects: {} } }, renderFlags: { set: f => { redraw = f; } } };
  for (const f of hooks.updateToken ?? []) f({ object: placeable }, { flags: { "primal-status": { animations: false } } });
  ok("changing the flag redraws the token's icons", redraw?.redrawEffects === true);
  redraw = null; for (const f of hooks.updateToken ?? []) f({ object: placeable }, { flags: { "mighty-guard": { "-=animations": null } } });
  ok("…so does clearing one kept under the old module ID", redraw?.redrawEffects === true);
  redraw = null; for (const f of hooks.updateToken ?? []) f({ object: placeable }, { x: 100 });
  ok("other token changes don't", redraw === null);
  const updates = []; const docT = { document: { update: async d => updates.push(d) } };
  await game.modules.get("primal-status").api.setAnimations(false, docT);
  ok("api.setAnimations(false, token) sets the flag", updates[0]?.["flags.primal-status.animations"] === false);
}

/* ---------- 2. The GM gives everyone the same choices ---------- */
{
  ok("defaults are a hidden world setting; what each player has taken is a client setting",
    settingsCfg.get("primal-status.animationDefaults")?.scope === "world" && settingsCfg.get("primal-status.animationDefaults")?.config === false
    && settingsCfg.get("primal-status.animationDefaultsApplied")?.scope === "client");
  ok("nothing given yet: nothing changes", settings.get("bleedingFx") === true && settings.get("animationDefaultsApplied") === 0);
  settings.set("animationQuality", "reduced");
  await game.settings.set("primal-status", "animationDefaults", { values: { bleedingFx: false, markedFx: false, hideAnimatedIcons: false, pulseSeconds: 3, nonsense: true, animationQuality: "full" }, stamp: 1000 });
  await settle();
  ok("the GM's choices are taken", settings.get("bleedingFx") === false && settings.get("markedFx") === false && settings.get("hideAnimatedIcons") === false);
  ok("…the rest left as they were", settings.get("poisonedFx") === true && settings.get("pulseSeconds") === 8 && settings.get("nonsense") === undefined);
  ok("…not the animation quality (each computer's own)", settings.get("animationQuality") === "reduced");
  ok("…and the player is told", notes.length === 1);
  ok("…once (remembered)", settings.get("animationDefaultsApplied") === 1000);
  await game.settings.set("primal-status", "bleedingFx", true);
  call("ready"); await settle();
  ok("the player's own change afterwards sticks (logging in again doesn't undo it)", settings.get("bleedingFx") === true && notes.length === 1);
  await game.settings.set("primal-status", "animationDefaults", { values: { bleedingFx: false, markedFx: true }, stamp: 2000 });
  await settle();
  ok("the GM gives them again: taken again", settings.get("bleedingFx") === false && settings.get("markedFx") === true && settings.get("animationDefaultsApplied") === 2000);
  await game.settings.set("primal-status", "animationDefaults", { values: { bleedingFx: false, markedFx: true }, stamp: 3000 });
  await settle();
  ok("nothing to change: no message", notes.length === 2 && settings.get("animationDefaultsApplied") === 3000);
  settings.set("animationDefaultsApplied", 0); settings.set("bleedingFx", true); call("ready"); await settle();
  ok("a new player (nothing taken yet) starts with them", settings.get("bleedingFx") === false);
  game.user.isGM = true; settings.set("animationDefaultsApplied", 0); settings.set("bleedingFx", true);
  await game.settings.set("primal-status", "animationDefaults", { values: { bleedingFx: false }, stamp: 4000 }); await settle();
  ok("the GM isn't sent the message", settings.get("bleedingFx") === false && notes.length === 3);
  game.user.isGM = false;
  for (const bad of [{}, { stamp: 9000 }, { values: { bleedingFx: true } }, { values: "x", stamp: 9001 }, null]) {
    settings.set("animationDefaults", bad); call("ready");
  }
  await settle();
  ok("missing or broken defaults are ignored", settings.get("bleedingFx") === false && settings.get("animationDefaultsApplied") === 4000);
  for (const k of ["bleedingFx", "markedFx", "hideAnimatedIcons"]) settings.set(k, true);
  settings.set("animationQuality", "auto");
}

/* ---------- 3. Ethereal: a ghostly shimmer, not the whirl of air ---------- */
{
  game.user.isGM = false; B.isOwner = false; canvas.tokens.controlled = [];
  const layer = () => fxs(B).find(c => c._mgRank === 2.2);
  const airOn = () => layer().children.slice(2, 5).some(g => g.alpha > 0.05);
  const ether = () => layer().children[6];
  B.actor.statuses = new Set(["invisible"]); run(2);
  ok("Invisible: the whirl of air, no shimmer", airOn() && layer().children.length === 6);
  B.actor.statuses = new Set(["ethereal"]); run(2);
  ok("Ethereal: the air is gone…", !airOn() && layer().children[0].alpha === 0 && layer().children[5].calls.every(c => c === "clear"));
  ok("…and a shimmer shows instead (glow, ripples, wisps, glints)", ether()?.visible === true && ether().children.length === 4);
  ok("…the creature still unseen", B.mesh.alpha === 0);
  { const [glow, ripples, wisps] = ether().children; let seen = { ripples: false, wisps: false, glints: false };
    let valid = true;
    for (let i = 0; i < 240; i++) { tick(); if (ripples.calls.includes("drawCircle")) seen.ripples = true; if (wisps.calls.includes("lineTo")) seen.wisps = true; if (ether().children[3].calls.includes("drawCircle")) seen.glints = true;
      if (!(glow.alpha > 0 && glow.alpha < 0.6)) valid = false; }
    ok(`over a few seconds: ripples, rising wisps and twinkles all appear (${JSON.stringify(seen)})`, seen.ripples && seen.wisps && seen.glints);
    ok("the glow breathes softly and stays valid", valid); }
  B.actor.statuses = new Set(["ethereal", "invisible"]); run(1);
  ok("Ethereal and Invisible: the shimmer", ether().visible && !airOn());
  B.actor.statuses = new Set(["ethereal", "hiding"]); run(1);
  ok("Ethereal and Hiding: neither", !ether().visible && !airOn());
  B.actor.statuses = new Set(["invisible"]); run(1);
  ok("back to Invisible: the whirl again, shimmer hidden", airOn() && !ether().visible);
  // seen by a creature that perceives it: in full, a little cold and pale
  const seer = new TokenObj(); seer.actor = { statuses: new Set(), effects: [], system: { attributes: { senses: { ranges: { truesight: 60 } } } } }; seer.document = { x: 100, y: 0, width: 1, height: 1, elevation: 0, detectionModes: {} };
  B.document.x = 0; B.document.y = 0; B.document.width = 1; B.document.height = 1; B.document.elevation = 0;
  canvas.dimensions = { size: 100, distance: 5 }; canvas.tokens.controlled = [seer];
  B.actor.statuses = new Set(["ethereal"]); run(1);
  const [r, g, b] = toRGB(B.mesh.tint);
  ok(`seen with Truesight: in full, tinted cold and pale (${B.mesh.tint.toString(16)})`, B.mesh.alpha === 1 && b > r && b > g && r < 0.95);
  ok("…with the shimmer around it", ether().visible);
  B.actor.statuses = new Set(["invisible"]); run(1);
  ok("(a seen Invisible creature isn't tinted)", B.mesh.tint === 0xFFFFFF && B.mesh.alpha === 1);
  canvas.tokens.controlled = []; B.actor.statuses = new Set(); run(1);
  ok("leaving the Ethereal Plane clears it all", fxs(B).length === 0);
}

/* ---------- 4. Statuses Token Magic FX or Sequencer already animate ---------- */
{
  const eff = (statuses, extra = {}) => ({ id: "e" + Math.random().toString(36).slice(2, 8), uuid: "", name: "", statuses: new Set(statuses), disabled: false, changes: [], img: `icons/${statuses[0]}.svg`, ...extra });
  const setEffects = (t, list) => { t.actor.effects = list; t.actor.temporaryEffects = list; t.actor.statuses = new Set(list.flatMap(e => [...e.statuses])); };
  const bleed = eff(["bleeding"], { changes: [{ key: "macro.tokenMagic", value: "bloodSplat" }] });
  setEffects(B, [bleed, eff(["marked"])]); run(1);
  ok("Token Magic FX not active: both animations show", fxs(B).length === 2);
  game.modules.set("tokenmagic", { active: true }); run(1);
  ok("Token Magic FX animates Bleeding (DAE macro.tokenMagic): this module leaves it", fxs(B).length === 1 && fxs(B)[0]._mgRank === 7.5);
  const draw = (t, src) => TokenObj.prototype._drawEffect.call(t, src);
  ok("…and keeps its icon", (await draw(B, "icons/bleeding.svg"))?.src === "icons/bleeding.svg");
  ok("(other animated statuses' icons still left off)", (await draw(B, "icons/marked.svg")) === null);
  await game.settings.set("primal-status", "deferToOtherModules", false); run(1);
  ok("GM setting off: both again", fxs(B).length === 2 && (await draw(B, "icons/bleeding.svg")) === null);
  await game.settings.set("primal-status", "deferToOtherModules", true);
  ok("the setting is the GM's, hidden from the list, on by default", settingsCfg.get("primal-status.deferToOtherModules")?.scope === "world" && settingsCfg.get("primal-status.deferToOtherModules")?.config === false && settingsCfg.get("primal-status.deferToOtherModules")?.default === true);
  // a Token Magic filter on the token named after the status
  setEffects(B, [eff(["marked"])]); B.document.flags = { tokenmagic: { filters: [{ tmFilters: { tmFilterId: "Marked", tmFilterType: "glow" } }] } }; run(1);
  ok("a Token Magic filter named after the status counts too", fxs(B).length === 0);
  B.document.flags = { tokenmagic: { filters: [{ tmFilters: { tmFilterId: "myGlow" } }] } }; run(1);
  ok("…one with another name doesn't", fxs(B).length === 1);
  B.document.flags = {};
  game.modules.set("tokenmagic", { active: false });
  // Sequencer
  const seqEffects = [];
  globalThis.Sequencer = { EffectManager: { getEffects: ({ object }) => object === B ? seqEffects : [] } };
  game.modules.set("sequencer", { active: true });
  const prone = eff(["prone"], { uuid: "Actor.x.ActiveEffect.p1", id: "p1" });
  setEffects(B, [prone, eff(["marked"])]); run(1);
  ok("Sequencer active, nothing playing: both show", fxs(B).length === 2);
  seqEffects.push({ data: { origin: "Actor.x.ActiveEffect.p1", name: "" } }); run(1);
  ok("a Sequencer effect whose origin is the Prone effect (Automated Animations): left to it", fxs(B).length === 1 && fxs(B)[0]._mgRank === 7.5);
  seqEffects.length = 0; seqEffects.push({ data: { origin: "", name: "marked" } }); run(1);
  ok("one named after a status: left to it", fxs(B).length === 1 && fxs(B)[0]._mgRank === 2.1);
  seqEffects.length = 0; seqEffects.push({ data: { origin: "Item.zzz", name: "fireball" } }); run(1);
  ok("unrelated Sequencer effects change nothing", fxs(B).length === 2);
  globalThis.Sequencer = { EffectManager: { getEffects: () => { throw new Error("boom"); } } }; run(1);
  ok("a Sequencer error is ignored", fxs(B).length === 2);
  delete globalThis.Sequencer; game.modules.set("sequencer", { active: false });
  // never handed over: the whirl that hides an Invisible creature
  game.modules.set("tokenmagic", { active: true });
  setEffects(B, [eff(["invisible"], { changes: [{ key: "macro.tokenMagic", value: "fog" }] })]); B.nameplate = new Obs(); run(2);
  ok("an Invisible effect with Token Magic FX keeps its whirl (it's what hides the creature)", fxs(B).some(c => c._mgRank === 2.2) && B.mesh.alpha === 0 && !B.nameplate.visible);
  game.modules.set("tokenmagic", { active: false });
  setEffects(B, []); run(1);
}

/* ---------- 5. Automation: Dodging ends at the creature's next turn; Dead at three failed death saves ---------- */
{
  const cfg = k => settingsCfg.get(`primal-status.${k}`);
  ok("both are GM settings shown in the list, on by default", ["dodgeExpiry", "autoDead"].every(k => cfg(k)?.scope === "world" && cfg(k)?.config === true && cfg(k)?.default === true));
  game.user.id = "me";
  game.users = { activeGM: { id: "me", isSelf: true } };
  const deleted = [];
  const mkActor = () => { const a = { uuid: "Actor.d", documentName: "Actor", statuses: new Set(), flags: {}, effects: [],
    deleteEmbeddedDocuments: async (type, ids) => { deleted.push(...ids); a.effects = a.effects.filter(e => !ids.includes(e.id)); } };
    return a; };
  const actor = mkActor();
  const dodge = { id: "d1", statuses: new Set(["dodging"]), disabled: false, parent: actor };
  actor.effects = [dodge, { id: "m1", statuses: new Set(["marked"]), disabled: false, parent: actor }];
  const combat = { started: true, combatant: { actor }, previous: { round: 1, turn: 0 }, current: { round: 1, turn: 1 }, combatants: [{ actor }] };
  const turn = (change = { turn: 1 }, options = { direction: 1 }, userId = "gm") => { for (const f of hooks.updateCombat ?? []) f(combat, change, options, userId); return settle(); };
  await turn();
  ok("its turn starts: its Dodging ends (nothing else)", JSON.stringify(deleted) === '["d1"]' && actor.effects.length === 1);
  const again = () => { deleted.length = 0; actor.effects = [dodge, ...actor.effects.filter(e => e !== dodge)]; };
  again(); await turn({ turn: 0 }, { direction: -1 });
  ok("going back a turn doesn't end it", deleted.length === 0);
  again(); await turn({ name: "x" }, {});
  ok("other combat changes don't", deleted.length === 0);
  again(); await turn({ round: 2, turn: 0 }, {});
  combat.previous = { round: 1, turn: 1 }; combat.current = { round: 2, turn: 0 }; again(); await turn({ round: 2, turn: 0 }, {});
  ok("a new round (no direction given) counts as moving on", JSON.stringify(deleted) === '["d1"]');
  game.users.activeGM = { id: "gm2", isSelf: false }; again(); await turn();
  ok("only the active GM's client makes the change", deleted.length === 0);
  game.users.activeGM = null; again(); await turn({ turn: 1 }, { direction: 1 }, "me");
  ok("with no GM connected, the client that moved the turn on does", JSON.stringify(deleted) === '["d1"]');
  again(); await turn({ turn: 1 }, { direction: 1 }, "other");
  ok("…and only that one", deleted.length === 0);
  game.users.activeGM = { id: "me", isSelf: true };
  settings.set("dodgeExpiry", false); again(); await turn();
  ok("setting off: Dodging stays", deleted.length === 0);
  settings.set("dodgeExpiry", true);
  combat.started = false; again(); await turn();
  ok("a combat that hasn't started: nothing", deleted.length === 0);
  combat.started = true;
  // Dead at three failed death saves
  const calls = [];
  const dying = { uuid: "Actor.k", statuses: new Set(["unconscious"]), flags: {},
    system: { attributes: { hp: { value: 0, max: 20 }, death: { failure: 3, success: 0 } } },
    toggleStatusEffect: async (id, o) => { calls.push([id, o.active, !!o.overlay]); if (o.active) dying.statuses.add(id); else dying.statuses.delete(id); },
    getFlag: (m, k) => dying.flags[m]?.[k], setFlag: async (m, k, v) => { (dying.flags[m] ??= {})[k] = v; }, unsetFlag: async (m, k) => { delete dying.flags[m]?.[k]; } };
  const death = (failure, hp = 0, userId = "gm") => { dying.system.attributes.death.failure = failure; dying.system.attributes.hp.value = hp;
    for (const f of hooks.updateActor ?? []) f(dying, { system: { attributes: { death: { failure } } } }, {}, userId); return settle(); };
  await death(3);
  ok("third failed death save: marked Dead (as an overlay)", JSON.stringify(calls) === '[["dead",true,true]]' && dying.statuses.has("dead") && dying.flags["primal-status"]?.autoDead === true);
  await death(3);
  ok("…once", calls.length === 1);
  await death(2);
  ok("failures corrected (still at 0 HP): the Dead it applied comes off", calls.length === 2 && calls[1][0] === "dead" && calls[1][1] === false && !dying.statuses.has("dead") && !dying.flags["primal-status"]?.autoDead);
  dying.statuses.add("dead"); await death(1);
  ok("a Dead the GM applied isn't removed", calls.length === 2 && dying.statuses.has("dead"));
  dying.statuses.delete("dead"); await death(3); calls.length = 0; await death(0, 5);
  ok("healed afterwards: Dead stays (raising the dead is the GM's call)", calls.length === 0 && dying.statuses.has("dead"));
  dying.statuses.delete("dead"); dying.flags = {};
  await death(2); ok("two failures: nothing", calls.length === 0);
  for (const f of hooks.updateActor ?? []) f(dying, { system: { attributes: { hp: { value: 0 } } } }, {}, "gm"); await settle();
  ok("other changes: nothing", calls.length === 0);
  dying.system.attributes.hp.max = 0; await death(3); dying.system.attributes.hp.max = 20;
  ok("a creature without Hit Points: nothing", calls.length === 0);
  game.users.activeGM = { id: "gm2", isSelf: false }; await death(3);
  ok("only the active GM's client applies it", calls.length === 0);
  game.users.activeGM = { id: "me", isSelf: true };
  settings.set("autoDead", false); await death(3); settings.set("autoDead", true);
  ok("setting off: nothing", calls.length === 0);
  await death(3); const unset = [];
  dying.unsetFlag = async (m, k) => { unset.push(k); delete dying.flags[m]?.[k]; };
  for (const f of hooks.deleteActiveEffect ?? []) f({ parent: dying, statuses: new Set(["dead"]) }, {}, "gm"); await settle();
  ok("Dead removed by hand: the module forgets it applied it", unset.includes("autoDead"));

  // Monsters (NPCs no player owns) die at 0 Hit Points: no death saves
  const mcalls = [];
  const monster = { uuid: "Actor.m", type: "npc", hasPlayerOwner: false, statuses: new Set(), flags: {},
    system: { attributes: { hp: { value: 7, max: 20 }, death: { failure: 0, success: 0 } } },
    toggleStatusEffect: async (id, o) => { mcalls.push([id, o.active, !!o.overlay]); if (o.active) monster.statuses.add(id); else monster.statuses.delete(id); },
    setFlag: async (m, k, v) => { (monster.flags[m] ??= {})[k] = v; }, unsetFlag: async (m, k) => { delete monster.flags[m]?.[k]; } };
  const hit = async (hp, who = monster, userId = "gm") => { who.system.attributes.hp.value = hp;
    for (const f of hooks.updateActor ?? []) f(who, { system: { attributes: { hp: { value: hp } } } }, {}, userId); await settle(); };
  await hit(3);
  ok("a monster hurt but above 0 HP: nothing", mcalls.length === 0);
  await hit(0);
  ok("a monster dropping to 0 HP is marked Dead at once (as an overlay)", JSON.stringify(mcalls) === '[["dead",true,true]]' && monster.flags["primal-status"]?.autoDead === true);
  await hit(0);
  ok("…once", mcalls.length === 1);
  await hit(4);
  ok("its Hit Points back above 0 (damage undone, healed): that Dead comes off", mcalls.length === 2 && mcalls[1][1] === false && !monster.statuses.has("dead"));
  monster.statuses.add("dead"); monster.flags = {}; await hit(6);
  ok("…but not a Dead the GM applied", mcalls.length === 2 && monster.statuses.has("dead"));
  monster.statuses.delete("dead");
  const familiar = { ...monster, uuid: "Actor.f", hasPlayerOwner: true, statuses: new Set(), flags: {}, system: { attributes: { hp: { value: 5, max: 9 }, death: { failure: 0 } } } };
  familiar.toggleStatusEffect = async (id, o) => { mcalls.push([id, o.active]); };
  await hit(0, familiar);
  ok("a creature a player owns (a wild shape, a companion) isn't: it makes death saves", mcalls.length === 2);
  const pc = { ...familiar, uuid: "Actor.p", type: "character", hasPlayerOwner: false };
  await hit(0, pc);
  ok("…nor a player character, even with no player owner", mcalls.length === 2);
  settings.set("autoDead", false); monster.system.attributes.hp.value = 5; await hit(0); settings.set("autoDead", true);
  ok("setting off: monsters aren't marked either", mcalls.length === 2);
}

/* ---------- 6. Sound cues ---------- */
{
  const played = [];
  foundry.audio = { AudioHelper: { play: (data, push) => { played.push({ src: data.src, volume: data.volume, push }); } } };
  const S = new Token("tokS"); canvas.tokens.placeables.push(S); S.visible = true;
  const actor = { uuid: "Actor.s", documentName: "Actor", statuses: new Set(), effects: [], getActiveTokens: () => [S], system: { attributes: { hp: { value: 10, max: 10 }, death: { failure: 0 } } } };
  let clock = 1e6; const realNow = Date.now; Date.now = () => clock;
  const apply = (statuses, extra = {}) => { for (const f of hooks.createActiveEffect ?? []) f({ parent: actor, statuses: new Set(statuses), disabled: false, ...extra }, {}, "me"); clock += 1000; };
  const last = () => played.at(-1)?.src?.split("/").pop();
  ok("sounds are off unless a player turns them on (a client setting)", settingsCfg.get("primal-status.soundCues")?.default === false && settingsCfg.get("primal-status.soundCues")?.scope === "client");
  apply(["charmed"]);
  ok("off: nothing plays", played.length === 0);
  settings.set("soundCues", true);
  apply(["charmed"]);
  ok("on: Charmed plays the chime, for this player only, at half volume", last() === "chime.ogg" && played[0].push === false && played[0].volume === 0.5 && played[0].src === "modules/primal-status/sounds/chime.ogg");
  const expect = { paralyzed: "zap", stunned: "zap", petrified: "stone", unconscious: "sleep", invisible: "whoosh", ethereal: "whoosh", dodging: "whoosh", burning: "flame",
    bleeding: "splat", bloodied: "splat", poisoned: "bubble", diseased: "bubble", frightened: "drone", cursed: "drone", hasted: "chime", "mighty-guard": "chime", marked: "ping", prone: "thud", dead: "toll",
    shocked: "zap", frozen: "stone", jinxed: "drone", valor: "chime", immobilized: "thud", entangled: "thud" };
  const wrong = [];
  for (const [status, cue] of Object.entries(expect)) { apply([status]); if (last() !== `${cue}.ogg`) wrong.push(`${status}→${last()}`); }
  ok(`each status has its cue (${wrong.join(", ") || "all right"})`, wrong.length === 0);
  const n = played.length;
  apply(["blinded"]); apply(["concentrating"]);
  ok("statuses without a cue are quiet (Blinded, Concentrating)", played.length === n);
  apply(["unconscious", "incapacitated", "prone"]);
  ok("several statuses at once: one cue (the first in the list: Unconscious's)", played.length === n + 1 && last() === "sleep.ogg");
  clock -= 900;   // 100 ms after the last one
  for (const f of hooks.createActiveEffect ?? []) f({ parent: actor, statuses: new Set(["prone"]), disabled: false }, {}, "me");
  ok("…and nothing more for the same creature straight after", played.length === n + 1);
  clock += 5000;
  settings.set("soundVolume", 80); apply(["marked"]);
  ok("the volume follows the player's setting", played.at(-1).volume === 0.8);
  settings.set("soundVolume", 0); const n0 = played.length; apply(["marked"]);
  ok("volume 0: nothing", played.length === n0);
  settings.set("soundVolume", 50);
  S.visible = false; const n1 = played.length; apply(["charmed"]);
  ok("a creature this player can't see: nothing", played.length === n1);
  S.visible = true; optOut(S); apply(["charmed"]);
  ok("a token set to show no animations: nothing", played.length === n1);
  optOut(S, false);
  actor.statuses = new Set(["invisible"]); actor.effects = []; S.actor = actor; run(2);
  apply(["poisoned"]);
  ok("an unseen (Invisible) creature: nothing that would give it away", played.length === n1);
  actor.statuses = new Set(); run(2);
  apply(["charmed"]); ok("seen again: sounds again", played.length === n1 + 1);
  apply(["charmed"], { disabled: true }); ok("an effect added switched off: nothing", played.length === n1 + 1);
  // a burst of statuses on many creatures is capped
  const others = Array.from({ length: 6 }, (_, i) => ({ uuid: `Actor.o${i}`, getActiveTokens: () => [S], statuses: new Set(), effects: [] }));
  const n2 = played.length;
  for (const o of others) for (const f of hooks.createActiveEffect ?? []) f({ parent: o, statuses: new Set(["prone"]), disabled: false }, {}, "me");
  ok("many creatures at once: at most three cues a second", played.length === n2 + 3);
  clock += 2000;
  // 0 Hit Points: a heartbeat; falling Unconscious while dying: the heartbeat too
  const hp = v => { actor.system.attributes.hp.value = v; for (const f of hooks.updateActor ?? []) f(actor, { system: { attributes: { hp: { value: v } } } }, {}, "me"); clock += 1000; };
  hp(4); const n3 = played.length;
  ok("losing Hit Points: nothing", played.length === n3);
  hp(0); ok("dropping to 0 Hit Points: a heartbeat", played.length === n3 + 1 && last() === "heartbeat.ogg");
  apply(["unconscious"]); ok("falling Unconscious at 0 HP: the heartbeat, not the lull", last() === "heartbeat.ogg");
  settings.set("soundCues", false); hp(0); apply(["charmed"]);
  ok("turned off again: nothing", played.length === n3 + 2);
  const item = { documentName: "Item", parent: actor };
  settings.set("soundCues", true); actor.system.attributes.hp.value = 10;
  for (const f of hooks.createActiveEffect ?? []) f({ parent: item, statuses: new Set(["hasted"]), disabled: false }, {}, "me"); clock += 1000;
  ok("an effect an item carries counts for its owner", last() === "chime.ogg" && played.length === n3 + 3);
  delete foundry.audio; settings.set("soundCues", false); Date.now = realNow;
  canvas.tokens.placeables = canvas.tokens.placeables.filter(t => t !== S);
}

/* ---------- 7. Monsters of Drakkenheim conditions ---------- */
{
  const se = CONFIG.statusEffects;
  ok("a Helpless status another module registered first is left alone", se.helpless.name === "Helpless (theirs)" && se.helpless.img === "theirs/helpless.webp" && !se.helpless.description);
  ok("the other five are added", ["addled", "clumsy", "enfeebled", "sickened", "defenseless"].every(id => se[id]?.img === `modules/primal-status/icons/${id}.svg`));
  se.clumsy = { ...se.clumsy, img: "theirs/clumsy.webp", name: "Clumsy (theirs)" }; call("ready");
  ok("one another module puts in place of this module's later isn't overwritten again", se.clumsy.img === "theirs/clumsy.webp" && se.clumsy.name === "Clumsy (theirs)");
  game.user.isGM = true; canvas.tokens.controlled = []; B.isOwner = false;
  const ranks = { addled: 6.5, clumsy: 6.62, enfeebled: 6.63, sickened: 4.3, defenseless: 6.64, helpless: 6.65, dazed: 6.68, weakened: 6.61 };
  for (const [id, rank] of Object.entries(ranks)) {
    B.actor.statuses = new Set([id]); B.actor.effects = []; run(2);
    let valid = true; for (let i = 0; i < 120; i++) { try { tick(); } catch { valid = false; } }
    const layer = fxs(B);
    ok(`${id}: its own animation (rank ${rank}), valid over time`, layer.length === 1 && layer[0]._mgRank === rank && valid);
  }
  // Clumsy's dagger: the painted picture (images/fx) once it has loaded, turning about its grip
  B.actor.statuses = new Set(["clumsy"]); run(2); await new Promise(res => setTimeout(res, 5)); run(3);
  const dagger = fxs(B)[0]?.children?.find(c => c instanceof Sprite);
  ok(`clumsy: the painted dagger is used (${dagger?.texture?.src})`, dagger?.texture?.src === "modules/primal-status/images/fx/clumsy-dagger.webp"
    && dagger._anchor?.[1] === 0.74 && Number.isFinite(dagger.rotation) && dagger._s?.[0] > 0);
  B.actor.statuses = new Set(["enfeebled"]); run(2); await new Promise(res => setTimeout(res, 5)); run(3);
  const painted = (fxs(B)[0]?.children ?? []).filter(c => c instanceof Sprite).map(c => c.texture.src.split("/").pop());
  ok(`enfeebled: the painted barbell, and sweat once it strains (${painted.join(", ")})`, painted.includes("enfeebled-barbell.webp"));
  const paintedFor = async status => { B.actor.statuses = new Set([status]); run(4); await new Promise(res => setTimeout(res, 5)); run(5);
    return (fxs(B)[0]?.children ?? []).filter(c => c instanceof Sprite); };
  const birds = await paintedFor("dazed");
  ok(`dazed: two painted frames for each of the three birds, one shown at a time (${birds.length})`, birds.length === 6
    && birds.filter(b => b.visible).length === 3 && birds.every(b => Number.isFinite(b.zIndex)));
  const shield = (await paintedFor("defenseless")).map(c => c.texture.src.split("/").pop()).sort();
  ok(`defenseless: the painted shield and its pieces (${shield.join(", ")})`, shield.join() === "defenseless-chips.webp,defenseless-left.webp,defenseless-right.webp,defenseless-shield.webp");
  const eye = (await paintedFor("distracted")).sort((p, q) => p.zIndex - q.zIndex).map(c => c.texture.src.split("/").pop());
  ok(`distracted: the painted eye's white, iris and lids in that order, and the glint (${eye.join(", ")})`,
    eye.join() === "distracted-eye.webp,distracted-iris.webp,distracted-lids.webp,distracted-glint.webp");
  const pics = async status => (await paintedFor(status)).map(c => c.texture.src.split("/").pop().replace(".webp", "")).sort().join();
  ok(`weakened: the hilt and both blades (${await pics("weakened")})`, (await pics("weakened")) === "weakened-blade,weakened-hilt,weakened-wilted");
  ok(`staggered: the axe and both padlocks (${await pics("staggered")})`, (await pics("staggered")) === "staggered-axe,staggered-lock-open,staggered-lock-shut");
  ok(`sickened: three puffs of fumes and two flies (${await pics("sickened")})`, (await pics("sickened")) === "sickened-fly,sickened-fly,sickened-fumes,sickened-fumes,sickened-fumes");
  ok(`jinxed: the cloud, the d20, and seven raindrops and their splashes (${await pics("jinxed")})`, (await pics("jinxed")) === ["jinxed-cloud", "jinxed-d20", ...Array(7).fill("jinxed-raindrop"), ...Array(7).fill("jinxed-splash")].join());
  ok(`immobilized: the cuff, the ball and eight chain links (${(await pics("immobilized")).length})`, (await pics("immobilized")) === ["immobilized-ball", "immobilized-cuff", ...Array(8).fill("immobilized-link")].join());
  const flag = await paintedFor("helpless");
  ok(`helpless: the painted flag cut into its pole and strips of cloth (${flag.length})`, flag.length === 49
    && flag.every(c => c.texture.src.endsWith("helpless-flag.webp") && Number.isFinite(c.x)));
  const files = list => list.map(c => c.texture.src.split("/").pop().replace(".webp", ""));
  const howMany = (list, name) => files(list).filter(f => f === name).length;
  const vines = await paintedFor("entangled");
  ok(`entangled: the vine cut into 36 strips for each of its 8 vines, a fresh and a withered copy of each of 16 leaves, and the earth (${vines.length})`,
    howMany(vines, "entangled-vine") === 8 * 36 && howMany(vines, "entangled-leaf") === 16 && howMany(vines, "entangled-leaf-dry") === 16 && howMany(vines, "entangled-earth") === 1
    && vines.some(c => c.visible) && vines.filter(c => c.visible).every(c => Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.rotation)));
  // (the vines take a moment to snap when the status ends: turned off, they go at once)
  settings.set("entangledFx", false); B.actor.statuses = new Set(); run(1); settings.set("entangledFx", true);
  ok(`addled: the thought bubble, the tangle and two question marks (${await pics("addled")})`, (await pics("addled")) === "addled-bubble,addled-question,addled-question,addled-tangle");
  ok(`bewildered: the wand and the puff of smoke (${await pics("bewildered")})`, (await pics("bewildered")) === "bewildered-smoke,bewildered-wand");
  const shock = await paintedFor("shocked");
  ok(`shocked: three bolts cut into 20 strips each, two sparks for each, and the puff of smoke (${shock.length})`,
    ["shocked-bolt1", "shocked-bolt2", "shocked-bolt3"].every(f => howMany(shock, f) === 20) && howMany(shock, "shocked-spark") === 6 && howMany(shock, "bewildered-smoke") === 1
    && shock.filter(c => c.visible).every(c => Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.rotation)));
  const blood = await paintedFor("bleeding");
  ok(`bleeding: the streak cut into 40 strips, its three drips, and a drop and a splat for each (${blood.length})`,
    howMany(blood, "bleeding-streak") === 40 && ["bleeding-drip1", "bleeding-drip2", "bleeding-drip3"].every(f => howMany(blood, f) === 1) && howMany(blood, "bleeding-drop") === 3 && howMany(blood, "bleeding-splat") === 3
    && blood.filter(c => c.visible).every(c => Number.isFinite(c.x) && Number.isFinite(c.y)));
    B.actor.statuses = new Set(["enfeebled"]); run(1);
  ok("enfeebled: the art looks a little drained", B.mesh.tint !== 0xFFFFFF);
  B.actor.statuses = new Set(["dazed", "stunned"]); run(1);
  ok("Dazed and Stunned: only the stars (no birds as well)", !fxs(B).some(c => c._mgRank === 6.68));
  B.actor.statuses = new Set(["pf2e.helpless", "defenceless"]); run(1);
  ok("prefixed IDs and the British spelling count", fxs(B).length === 2);
  B.actor.statuses = new Set(["helplessness", "unclumsy"]); run(1);
  ok("look-alike IDs don't", fxs(B).length === 0);
  const stillShown = [];
  for (const k of ["addledFx", "clumsyFx", "enfeebledFx", "sickenedFx", "defenselessFx", "helplessFx", "dazedFx", "weakenedFx"]) {
    const id = k.replace("Fx", ""); settings.set(k, false); B.actor.statuses = new Set([id]); run(1);
    if (fxs(B).length) stillShown.push(k);
    settings.set(k, true);
  }
  ok(`each can be turned off in the Token animations window (${stillShown.join(", ") || "all hide"})`, stillShown.length === 0);
  // The newer ones: Bewildered, Distracted, Staggered, Drakkenheim Madness (and Slowed, which shares Slow's outline)
  const newer = { bewildered: ["bewildered", 6.6, "bewilderedFx"], distracted: ["distracted", 6.7, "distractedFx"], staggered: ["staggered", 6.66, "staggeredFx"],
    drakkenheimMadness: ["madness", 2.3, "madnessFx"], drakkenheimSlowed: ["slow", 1, "motionOutline"] };
  for (const [id, [kind, rank, key]] of Object.entries(newer)) {
    B.actor.statuses = new Set([id]); B.actor.effects = []; run(2);
    let valid = true; for (let i = 0; i < 150; i++) { try { tick(); } catch { valid = false; } }
    const layer = fxs(B);
    ok(`${id}: ${kind === "slow" ? "Slow's dragging outline" : "its own animation"} (rank ${rank}), valid over time`, layer.length === 1 && layer[0]._mgRank === rank && valid);
    settings.set(key, false); run(1);
    ok(`…turned off with ${key}`, fxs(B).length === 0);
    settings.set(key, true);
  }
  B.actor.statuses = new Set(["unstaggered", "bewilderedness", "madness"]); run(1);
  ok("look-alike IDs (and someone else's plain Madness) don't animate", fxs(B).length === 0);
  // Burning: fire, or green acid when its value names acid (picked in the status pane)
  {
    const burn = { id: "bf", statuses: new Set(["burning"]), name: "Burning (2d4)", flags: {}, disabled: false };
    B.actor.statuses = new Set(["burning"]); B.actor.effects = [burn];
    const now0 = performance.now(); run(3);
    const aura = () => fxs(B).find(c => c._mgRank === 5);
    const ember = () => aura()?.children?.[3]?.children?.[0]?.tint;
    ok(`Burning (2d4): the fire aura, orange embers (${ember()?.toString(16)})`, !!aura() && ember() === 0xFFB347);
    burn.name = "Burning (2d4 Acid)"; burn.flags = { "primal-status": { value: "2d4 Acid" } };
    const t0 = Date.now(); while (Date.now() - t0 < 350) { /* the aura looks at the type a few times a second */ }
    run(3);
    let valid = true; for (let i = 0; i < 120; i++) { try { tick(); } catch { valid = false; } }
    ok(`Burning (2d4 Acid): the aura turns to acid, green drops, valid over time (${ember()?.toString(16)})`, ember() === 0xC6FF5A && valid && fxs(B).length === 1);
    const body = aura()?.children?.[1]?.children?.[0]?.tint ?? 0;
    ok(`…its froth is green, not orange (${body.toString(16)})`, ((body >> 8) & 255) > ((body >> 16) & 255));
    burn.name = "Burning (2d4)"; burn.flags = {};
    const t1 = Date.now(); while (Date.now() - t1 < 350) { /* again */ }
    run(3);
    ok("…and back to fire when Fire is picked", ember() === 0xFFB347);
    B.actor.effects = []; B.actor.statuses = new Set(); run(1);
  }
  const draw = (t, src) => TokenObj.prototype._drawEffect.call(t, src);
  const T = { actor: { statuses: new Set(["sickened"]), effects: [{ statuses: new Set(["sickened"]), img: "modules/primal-status/icons/sickened.svg", disabled: false }] } };
  ok("its status icon is left off the token while the animation shows", (await draw(T, "modules/primal-status/icons/sickened.svg")) === null);
  B.actor.statuses = new Set(); run(1);
  game.user.isGM = false;
}

/* ---------- 8. Moving over from the old module ID (mighty-guard) ---------- */
{
  const wait = () => new Promise(r => setTimeout(r, 30));
  ok("the module's ID is now primal-status; settings live under it", settingsCfg.has("primal-status.pulseSeconds") && !settingsCfg.has("mighty-guard.pulseSeconds"));
  // What Foundry still has stored under the old ID: world settings (Setting documents) and this browser's own
  const worldDocs = [
    { key: "mighty-guard.pulseSeconds", value: "4.5" },
    { key: "mighty-guard.hiddenStatuses", value: '["blinded","deafened"]' },
    { key: "mighty-guard.conditionRolls", value: false },                       // already parsed
    { key: "mighty-guard.grappleImagePath", value: '"modules/mighty-guard/images/grapple-hand.webp"' },
    { key: "mighty-guard.detection", value: '"nonD20"' },
    { key: "primal-status.detection", value: '"damage"' },             // set since: not overwritten
    { key: "mighty-guard.animationDefaults", value: '{"values":{"bleedingFx":false},"stamp":77}' },
    { key: "mighty-guard.pulseSecondz", value: "1" },                            // not a setting any more
    { key: "other-module.pulseSeconds", value: "2" }
  ];
  const local = new Map([["mighty-guard.bleedingFx", "false"], ["mighty-guard.soundVolume", "80"], ["mighty-guard.animationQuality", '"still"'],
    ["mighty-guard.markedFx", "false"], ["primal-status.markedFx", "true"], ["mighty-guard.animationDefaultsApplied", "77"], ["mighty-guard.soundCues", "\"oops\""]]);
  game.settings.storage = new Map([["world", { contents: worldDocs }], ["client", { getItem: k => (local.has(k) ? local.get(k) : null) }]]);
  // Creatures with this module's status effects, on the sidebar and on scenes
  const updates = [];
  const mkActor = (name, effects) => ({ name, effects, updateEmbeddedDocuments: async (type, list) => { updates.push([name, type, list]); } });
  const hero = mkActor("Hero", [{ id: "e1", img: "modules/mighty-guard/icons/haste.svg" }, { id: "e2", img: "icons/svg/blind.svg" }, { id: "e3", img: "modules/mighty-guard/icons/contamination-3.svg" }]);
  const goblin = mkActor("Goblin (token)", [{ id: "g1", img: "modules/mighty-guard/icons/mighty-guard.svg" }]);
  const linked = mkActor("Linked", [{ id: "l1", img: "modules/mighty-guard/icons/slow.svg" }]);
  game.actors = [hero, linked];
  game.scenes = [{ tokens: [{ actorLink: false, actor: goblin }, { actorLink: true, actor: linked }] }];
  const macroUpdates = [];
  const mkMacro = (name, command) => ({ name, command, update: async d => { macroUpdates.push([name, d.command]); } });
  game.macros = [mkMacro("Guard", 'game.modules.get("mighty-guard").api.toggle();'), mkMacro("Both", "const a = game.modules.get('mighty-guard').api; a.setAnimations(false);"),
    mkMacro("Other", 'game.modules.get("dice-so-nice")'), mkMacro("Status id", 'actor.toggleStatusEffect("mighty-guard")')];
  notes.length = 0;
  const realLocalize = game.i18n.localize;
  game.i18n.localize = k => (k === "MIGHTYGUARD.Migrate.Done" ? "{settings}/{images}/{macros}" : realLocalize(k));
  for (const k of ["migratedClient", "migratedWorld"]) settings.set(k, false);
  game.user.isGM = true; game.user.id = "me"; game.users = { activeGM: { id: "me", isSelf: true } };
  call("ready"); await wait();
  ok("world settings carried over (number, list, switch)", settings.get("pulseSeconds") === 4.5 && JSON.stringify(settings.get("hiddenStatuses")) === '["blinded","deafened"]' && settings.get("conditionRolls") === false);
  ok("…the GM's choices for everyone too", settings.get("animationDefaults")?.stamp === 77);
  ok("…but not one already set under the new ID", settings.get("detection") === "damage");
  ok("the Grappled image, the module's own, points at the new folder", settings.get("grappleImagePath") === "modules/primal-status/images/grapple-hand.webp");
  ok("this browser's own settings carried over", settings.get("bleedingFx") === false && settings.get("soundVolume") === 80 && settings.get("animationQuality") === "still" && settings.get("animationDefaultsApplied") === 77);
  ok("…not one already set under the new ID, nor a value of the wrong type", settings.get("markedFx") === true && settings.get("soundCues") === false);
  const byName = Object.fromEntries(updates.map(([n, , list]) => [n, list]));
  ok("status images on creatures point at the new folder", JSON.stringify(byName.Hero) === JSON.stringify([{ _id: "e1", img: "modules/primal-status/icons/haste.svg" }, { _id: "e3", img: "modules/primal-status/icons/contamination-3.svg" }]));
  ok("…on unlinked tokens' creatures too, and linked ones once", byName["Goblin (token)"]?.[0]?.img === "modules/primal-status/icons/mighty-guard.svg" && updates.filter(([n]) => n === "Linked").length === 1);
  ok("macros calling the module by its old ID are updated (either quotes); others left alone", JSON.stringify(macroUpdates) === JSON.stringify([
    ["Guard", 'game.modules.get("primal-status").api.toggle();'], ["Both", "const a = game.modules.get('primal-status').api; a.setAnimations(false);"]]));
  ok(`the GM is told what was carried over: settings/images/macros ${notes[0]}`, notes.length === 1 && notes[0] === "10/4/2");
  game.i18n.localize = realLocalize;
  ok("done once: marked for the world and this browser", settings.get("migratedWorld") === true && settings.get("migratedClient") === true);
  const before = [updates.length, macroUpdates.length]; settings.set("pulseSeconds", 9);
  call("ready"); await wait();
  ok("loading again changes nothing (and keeps changes made since)", updates.length === before[0] && macroUpdates.length === before[1] && settings.get("pulseSeconds") === 9);
  // A player: only their own settings; the world is the GM's
  settings.set("migratedClient", false); settings.set("migratedWorld", false); settings.set("bleedingFx", true);
  game.user.isGM = false; const u0 = updates.length;
  call("ready"); await wait();
  ok("a player carries over only their own settings", settings.get("bleedingFx") === false && settings.get("migratedWorld") === false && updates.length === u0);
  game.user.isGM = true; game.users = { activeGM: { id: "gm2", isSelf: false } }; settings.set("migratedClient", true);
  call("ready"); await wait();
  ok("a second GM while another is active leaves the world to them", settings.get("migratedWorld") === false && updates.length === u0);
  game.users = { activeGM: { id: "me", isSelf: true } }; settings.set("migratedWorld", true);
  // The old copy still switched on
  notes.length = 0; const warns = []; ui.notifications.warn = m => warns.push(m);
  game.modules.set("mighty-guard", { active: true }); call("ready"); await wait();
  ok("the old copy still switched on as well: the GM is warned", warns.length === 1);
  game.modules.delete("mighty-guard"); warns.length = 0; call("ready"); await wait();
  ok("…and not otherwise", warns.length === 0);
  delete game.settings.storage; game.actors = []; game.scenes = []; game.macros = []; game.user.isGM = false;

  // Flags set before 3.0.0 stay under the old ID and still count
  B.document.flags = { "mighty-guard": { animations: false } }; B.actor.statuses = new Set(["marked"]); run(1);
  ok("a token set to show no animations under the old ID still shows none", fxs(B).length === 0);
  B.document.flags = { "mighty-guard": { animations: false }, "primal-status": { animations: true } }; run(1);
  ok("…until it's ticked again (under the new ID)", fxs(B).length === 1);
  B.document.flags = {}; B.actor.statuses = new Set(); run(1);
  const oldDead = { uuid: "Actor.old", statuses: new Set(["dead"]), flags: { "mighty-guard": { autoDead: true } }, system: { attributes: { hp: { value: 0, max: 9 }, death: { failure: 2 } } },
    toggled: [], updated: [], toggleStatusEffect: async (id, o) => { oldDead.toggled.push([id, o.active]); if (!o.active) oldDead.statuses.delete(id); },
    unsetFlag: async () => {}, update: async d => { oldDead.updated.push(d); } };
  settings.set("autoDead", true);
  for (const f of hooks.updateActor ?? []) f(oldDead, { system: { attributes: { death: { failure: 2 } } } }, {}, "me"); await wait();
  ok("Dead this module applied before 3.0.0 still comes off when the failures are corrected", JSON.stringify(oldDead.toggled) === '[["dead",false]]'
    && oldDead.updated.some(d => "flags.mighty-guard.-=autoDead" in d));
}

/* ---------- 8b. Moving over from Enhanced Status Effects (enhanced-status-effects, 3.0.0–3.2.3) ---------- */
{
  const wait = () => new Promise(r => setTimeout(r, 30));
  // A world that went mighty-guard → enhanced-status-effects: both are stored; the newer one wins
  const worldDocs = [
    { key: "enhanced-status-effects.pulseSeconds", value: "3" },
    { key: "mighty-guard.pulseSeconds", value: "4.5" },
    { key: "enhanced-status-effects.contaminationRest", value: "false" },
    { key: "enhanced-status-effects.grappleImagePath", value: '"modules/enhanced-status-effects/images/grapple-hand.webp"' },
    { key: "enhanced-status-effects.migratedWorld", value: "true" },             // its own marker: never copied
    { key: "mighty-guard.hiddenStatuses", value: '["deafened"]' }               // only ever set under the oldest ID
  ];
  const local = new Map([["enhanced-status-effects.valorFx", "false"], ["enhanced-status-effects.migratedClient", "true"], ["mighty-guard.valorFx", "true"]]);
  game.settings.storage = new Map([["world", { contents: worldDocs }], ["client", { getItem: k => (local.has(k) ? local.get(k) : null) }]]);
  const updates = [];
  const hero = { name: "Hero", effects: [{ id: "e1", img: "modules/enhanced-status-effects/icons/frozen.svg" }, { id: "e2", img: "modules/mighty-guard/icons/haste.svg" }, { id: "e3", img: "modules/primal-status/icons/slow.svg" }],
    updateEmbeddedDocuments: async (t, list) => { updates.push(list); } };
  game.actors = [hero]; game.scenes = [];
  const macroUpdates = [];
  game.macros = [{ name: "ESE", command: 'game.modules.get("enhanced-status-effects").api.toggle();', update: async d => { macroUpdates.push(d.command); } },
    { name: "New", command: 'game.modules.get("primal-status").api.toggle();', update: async d => { macroUpdates.push(d.command); } }];
  for (const k of ["migratedClient", "migratedWorld"]) settings.set(k, false);
  settings.set("pulseSeconds", 8); settings.set("contaminationRest", true); settings.set("valorFx", true); settings.set("hiddenStatuses", []);
  settings.set("grappleImagePath", "modules/primal-status/images/grapple-hand.webp");
  game.user.isGM = true; game.users = { activeGM: { id: "me", isSelf: true } };
  call("ready"); await wait();
  ok("Enhanced Status Effects' world settings carried over, ahead of older Mighty Guard ones", settings.get("pulseSeconds") === 3 && settings.get("contaminationRest") === false);
  ok("…and a setting only Mighty Guard ever had still comes across", JSON.stringify(settings.get("hiddenStatuses")) === '["deafened"]');
  ok("…this browser's own settings too (the newer ID first)", settings.get("valorFx") === false);
  ok("…its own 'already carried over' marks aren't copied, so this move still runs", settings.get("migratedWorld") === true && settings.get("migratedClient") === true);
  ok("the Grappled image in its folder points at the new one", settings.get("grappleImagePath") === "modules/primal-status/images/grapple-hand.webp");
  ok("status images from either earlier folder point at the new one", JSON.stringify(updates) === JSON.stringify([[{ _id: "e1", img: "modules/primal-status/icons/frozen.svg" }, { _id: "e2", img: "modules/primal-status/icons/haste.svg" }]]));
  ok("macros calling enhanced-status-effects are updated; ones already right are left alone", JSON.stringify(macroUpdates) === JSON.stringify(['game.modules.get("primal-status").api.toggle();']));
  const warns = []; ui.notifications.warn = m => warns.push(m);
  game.modules.set("enhanced-status-effects", { active: true }); call("ready"); await wait();
  ok("Enhanced Status Effects still switched on as well: the GM is warned", warns.length === 1 && warns[0].includes("MIGHTYGUARD.Migrate.OldActive"));
  game.modules.delete("enhanced-status-effects");
  delete game.settings.storage; game.actors = []; game.macros = []; game.user.isGM = false;
  settings.set("pulseSeconds", 8); settings.set("contaminationRest", true); settings.set("valorFx", true); settings.set("hiddenStatuses", []);

  // Flags set under enhanced-status-effects still count, and the newest ID wins
  B.document.flags = { "enhanced-status-effects": { animations: false } }; B.actor.statuses = new Set(["marked"]); run(1);
  ok("a token set to show no animations under Enhanced Status Effects still shows none", fxs(B).length === 0);
  B.document.flags = { "mighty-guard": { animations: true }, "enhanced-status-effects": { animations: false } }; run(1);
  ok("…the newer ID's choice wins over Mighty Guard's", fxs(B).length === 0);
  B.document.flags = { "enhanced-status-effects": { animations: false }, "primal-status": { animations: true } }; run(1);
  ok("…until it's ticked again under the new ID", fxs(B).length === 1);
  B.document.flags = {}; B.actor.statuses = new Set(); run(1);
}

/* ---------- 9. Contamination 4 and 5: Weakened and Dazed; Weakened halves weapon and spell damage ---------- */
{
  const se = CONFIG.statusEffects;
  ok("Weakened and Dazed are statuses with their own icons and rules", ["weakened", "dazed"].every(id => se[id]?.img === `modules/primal-status/icons/${id}.svg` && se[id].description?.startsWith("L:MIGHTYGUARD.Desc.")));
  // Contamination effects carry the symptoms for their level
  const preCreate = (effect, data) => { for (const f of hooks.preCreateActiveEffect ?? []) f(effect, data, {}, "me"); };
  const preUpdate = (effect, changes) => { for (const f of hooks.preUpdateActiveEffect ?? []) f(effect, changes, {}, "me"); return changes; };
  const mkEffect = (statuses, level, where = "system") => {
    const e = { statuses: new Set(statuses), system: {}, flags: {}, updateSource(d) { if (d.statuses) this.statuses = new Set(d.statuses); } };
    if (where === "system") e.system.level = level; else e.flags["primal-status"] = { level };
    return e;
  };
  let e = mkEffect(["contamination"], 4);
  preCreate(e, { statuses: ["contamination"], system: { level: 4 } });
  ok("a new Contamination effect at level 4 also gives Weakened", [...e.statuses].sort().join() === "contamination,weakened");
  e = mkEffect(["contamination"], 2); preCreate(e, { statuses: ["contamination"], system: { level: 2 } });
  ok("…at level 2 nothing extra", [...e.statuses].join() === "contamination");
  e = mkEffect(["contamination"], 3);
  let ch = preUpdate(e, { system: { level: 4 } });
  ok("raised to 4 (dnd5e 6's own level): Weakened added in the same update", [...ch.statuses].sort().join() === "contamination,weakened");
  e.statuses = new Set(ch.statuses); e.system.level = 4;
  ch = preUpdate(e, { system: { level: 5 } });
  ok("raised to 5: Dazed as well", [...ch.statuses].sort().join() === "contamination,dazed,weakened");
  e.statuses = new Set(ch.statuses); e.system.level = 5;
  ch = preUpdate(e, { system: { level: 3 } });
  ok("lowered to 3: both come off", [...ch.statuses].join() === "contamination");
  e = mkEffect(["contamination", "poisoned"], 3, "flag");
  ch = preUpdate(e, { flags: { "primal-status": { level: 4 } } });
  ok("this module's own level (other systems) works too, and other statuses on the effect stay", [...ch.statuses].sort().join() === "contamination,poisoned,weakened");
  e = mkEffect(["contamination", "weakened"], 4);
  ch = preUpdate(e, { name: "Contamination (4)" });
  ok("an update that doesn't change the level leaves the statuses alone", !("statuses" in ch));
  const other = { statuses: new Set(["poisoned"]), system: { level: 5 } };
  ch = preUpdate(other, { system: { level: 5 } });
  ok("other effects are left alone", !("statuses" in ch));
  // Effects made before this get their symptoms when the GM loads the world
  const updates = [];
  const old = { name: "Old", effects: [{ id: "c1", statuses: new Set(["contamination"]), system: { level: 5 }, flags: {} }, { id: "p1", statuses: new Set(["prone"]), system: {}, flags: {} }],
    updateEmbeddedDocuments: async (t, list) => { updates.push(list); } };
  game.actors = [old]; game.scenes = []; game.user.isGM = true; game.users = { activeGM: { id: "me", isSelf: true } };
  call("ready"); await new Promise(r => setTimeout(r, 30));
  ok("existing Contamination 5 effects are given Weakened and Dazed when the GM loads the world", updates.length === 1 && updates[0].length === 1 && updates[0][0]._id === "c1" && [...updates[0][0].statuses].sort().join() === "contamination,dazed,weakened");
  game.actors = []; game.user.isGM = false;

  // Weakened: damage rolls of weapon attacks and spells are marked to be halved
  settings.set("conditionRolls", true);
  const weak = { statuses: new Set(["weakened"]), effects: [], name: "Weak" };
  const strong = { statuses: new Set(), effects: [], name: "Strong" };
  const contaminated = { statuses: new Set(["contamination"]), effects: [{ statuses: new Set(["contamination"]), system: { level: 4 }, disabled: false }], name: "Contaminated" };
  const preRoll = (actor, itemType, activityType = "attack", hookNames = ["damage"]) => {
    const config = { hookNames, subject: { actor, type: activityType, item: { type: itemType, actor } }, rolls: [{ parts: ["1d8"], options: {} }, { parts: ["2d6"], options: {} }] };
    const message = { data: { flavor: "Longsword - Damage Roll" } };
    for (const f of hooks["dnd5e.preRollV2"] ?? []) f(config, {}, message);
    return { marked: config.rolls.every(r => r.options.mgHalfDamage === true), flavor: message.data.flavor };
  };
  let r = preRoll(weak, "weapon");
  ok("a Weakened creature's weapon damage is marked to be halved, and the chat says why", r.marked && r.flavor === "Longsword - Damage Roll (L:MIGHTYGUARD.Rolls.HalfDamage: L:MIGHTYGUARD.Drakkenheim.Weakened)");
  ok("…spell damage too (an attack or a saving throw spell)", preRoll(weak, "spell", "save").marked);
  ok("…and an attack with a natural weapon set up as a feature", preRoll(weak, "feat", "attack").marked);
  ok("…but not other damage (a feature that isn't an attack)", !preRoll(weak, "feat", "damage").marked);
  ok("Contamination level 4 counts as Weakened", preRoll(contaminated, "weapon").marked);
  ok("a creature that isn't Weakened: untouched", !preRoll(strong, "weapon").marked);
  ok("attack rolls aren't halved", !preRoll(weak, "weapon", "attack", ["attack"]).marked);
  settings.set("conditionRolls", false);
  ok("conditions setting off: untouched", !preRoll(weak, "weapon").marked);
  settings.set("conditionRolls", true);

  // Halving a rolled damage roll: one subtraction per damage type, so total, formula and types agree
  class OperatorTerm { constructor({ operator }) { this.operator = operator; } get total() { return undefined; } }
  class NumericTerm { constructor({ number, options = {} }) { this.number = number; this.options = options; } get total() { return this.number; } get flavor() { return this.options.flavor ?? ""; } }
  class Die { constructor(results, flavor) { this.results = results; this.flavor = flavor ?? ""; } get total() { return this.results.reduce((a, b) => a + b, 0); } }
  foundry.dice = { terms: { OperatorTerm, NumericTerm } };
  const evalTotal = terms => { let t = 0, s = 1; for (const x of terms) { if (x instanceof OperatorTerm) { s = x.operator === "-" ? -1 : 1; continue; } t += s * x.total; s = 1; } return t; };
  const mkRoll = (terms, options = {}) => { const roll = new Roll("x"); Object.assign(roll, { terms, options: { mgHalfDamage: true, ...options }, _evaluated: true });
    roll._total = evalTotal(terms); roll._evaluateTotal = () => evalTotal(roll.terms);
    roll.resetFormula = () => { roll._formula = roll.terms.map(x => x instanceof OperatorTerm ? ` ${x.operator} ` : x instanceof Die ? `${x.results.length}d?${x.flavor ? `[${x.flavor}]` : ""}` : `${x.number}${x.flavor ? `[${x.flavor}]` : ""}`).join(""); };
    return roll; };
  let roll = mkRoll([new Die([6, 3], "slashing"), new OperatorTerm({ operator: "+" }), new NumericTerm({ number: 4, options: { flavor: "slashing" } }), new OperatorTerm({ operator: "+" }), new Die([5], "fire")]);
  roll.evaluate({});
  const byType = {}; { let s = 1; for (const x of roll.terms) { if (x instanceof OperatorTerm) { s = x.operator === "-" ? -1 : 1; continue; } byType[x.flavor] = (byType[x.flavor] ?? 0) + s * x.total; s = 1; } }
  ok(`13 slashing + 5 fire becomes 6 slashing + 2 fire, rounded down per type (total ${roll._total})`, roll._total === 8 && byType.slashing === 6 && byType.fire === 2);
  ok(`…shown in the formula (${roll._formula})`, /- 7\[slashing\]/.test(roll._formula) && /- 3\[fire\]/.test(roll._formula));
  roll.evaluate({});
  ok("…and only once", roll._total === 8);
  roll = mkRoll([new Die([2]), new OperatorTerm({ operator: "+" }), new NumericTerm({ number: 3 })], { type: "piercing" });
  roll.evaluate({});
  ok("terms without their own type use the roll's type", roll._total === 2 && roll.terms.at(-1).flavor === "piercing");
  roll = mkRoll([new Die([1])]); roll.evaluate({});
  ok("1 damage halves to 0", roll._total === 0);
  roll = mkRoll([new Die([6, 6]), new OperatorTerm({ operator: "*" }), new NumericTerm({ number: 2 })]); roll._total = 24; roll._evaluateTotal = () => 24 - 12;
  roll.evaluate({});
  ok("a formula with multiplication is halved as a whole", roll._total === 12);
  roll = mkRoll([new Die([6, 5])], { mgHalfDamage: false }); roll.evaluate({});
  ok("a roll that isn't marked is untouched", roll._total === 11 && roll.terms.length === 1);
  delete foundry.dice;
}

/* ---------- 10. More Monsters of Drakkenheim conditions, and Contamination's rest rules ---------- */
{
  const se = CONFIG.statusEffects;
  ok("Immobilized, Entangled, Frozen, Shocked, Jinxed and Valor are statuses with their own icons and rules",
    ["immobilized", "entangled", "frozen", "shocked", "jinxed", "valor"].every(id => se[id]?.img === `modules/primal-status/icons/${id}.svg` && String(se[id].description).endsWith(`MIGHTYGUARD.Desc.${id[0].toUpperCase()}${id.slice(1)}`)));
  ok("Entangled and Frozen bring Immobilized and Defenseless; Shocked brings Dazed and Defenseless",
    JSON.stringify(se.entangled.statuses) === '["immobilized","defenseless"]' && JSON.stringify(se.frozen.statuses) === '["immobilized","defenseless"]' && JSON.stringify(se.shocked.statuses) === '["dazed","defenseless"]');
  ok("the others bring nothing extra", !se.immobilized.statuses?.length && !se.jinxed.statuses?.length && !se.valor.statuses?.length);

  // Speed 0: dnd5e's noMovement list
  const saved = CONFIG.DND5E;
  CONFIG.DND5E = { conditionEffects: { noMovement: new Set(["grappled"]) } };
  call("setup");
  ok("Immobilized, Entangled and Frozen set Speed to 0 (dnd5e's noMovement list)", ["grappled", "immobilized", "entangled", "frozen"].every(id => CONFIG.DND5E.conditionEffects.noMovement.has(id)));
  CONFIG.DND5E = saved;

  // Jinxed and Valor: a die off or on attack rolls and saving throws
  settings.set("conditionRolls", true);
  const mkActor = (statuses, effects = []) => ({ documentName: "Actor", name: "X", statuses: new Set(statuses), effects, system: {} });
  const roll = (actor, hookNames, extra = {}) => {
    const config = { hookNames, subject: hookNames.includes("attack") ? { actor, item: { type: "weapon", actor } } : actor, ability: "wis", rolls: [{ parts: ["@mod"], options: {} }], ...extra };
    const message = { data: { flavor: "Roll" } };
    for (const f of hooks["dnd5e.preRollV2"] ?? []) f(config, {}, message);
    return { parts: config.rolls[0].parts, flavor: message.data.flavor, options: config.rolls[0].options };
  };
  let r = roll(mkActor(["jinxed"]), ["attack"]);
  ok(`Jinxed takes 1d4 off an attack roll (${r.parts.join(" ")}), and the chat says so`, JSON.stringify(r.parts) === '["@mod","-1d4[L:MIGHTYGUARD.Drakkenheim.Jinxed]"]' && r.flavor.includes("L:MIGHTYGUARD.Drakkenheim.Jinxed: −1d4"));
  r = roll(mkActor(["valor"], [{ statuses: new Set(["valor"]), name: "Valor (1d6)", flags: {} }]), ["savingThrow"]);
  ok(`Valor (1d6) adds 1d6 to a saving throw (${r.parts.join(" ")})`, JSON.stringify(r.parts) === '["@mod","1d6[L:MIGHTYGUARD.Drakkenheim.Valor]"]' && r.flavor.includes("+1d6"));
  r = roll(mkActor(["jinxed"], [{ statuses: new Set(["jinxed"]), name: "Hexed", flags: { "primal-status": { die: "2d4" } } }]), ["savingThrow"]);
  ok("…or the die set on the effect's flag", r.parts[1] === "-2d4[L:MIGHTYGUARD.Drakkenheim.Jinxed]");
  r = roll(mkActor(["jinxed", "valor"]), ["attack"]);
  ok("both at once: one die off, one on", r.parts.length === 3);
  r = roll(mkActor(["jinxed"]), ["abilityCheck"]);
  ok("ability checks aren't changed", r.parts.length === 1);
  r = roll(mkActor(["jinxed"]), ["damage"]);
  ok("damage rolls aren't changed", r.parts.length === 1);
  r = roll(mkActor(["jinxed", "paralyzed"]), ["savingThrow"], { ability: "dex" });
  ok("a saving throw that fails automatically gets no die", r.parts.length === 1 && r.options.mgAutoFail === true);
  settings.set("conditionRolls", false);
  ok("conditions setting off: no dice", roll(mkActor(["jinxed"]), ["attack"]).parts.length === 1);
  settings.set("conditionRolls", true);

  // Frozen: bludgeoning weapon attacks against it are Critical Hits
  const frozen = mkActor(["frozen", "immobilized", "defenseless"]); frozen.system = { attributes: { ac: { value: 12 } } };
  game.user.targets = new Set([{ actor: frozen }]);
  const attack = (dmgType, itemType = "weapon") => roll(mkActor([]), ["attack"], { subject: { actor: mkActor([]), item: { type: itemType, system: { damage: { base: { types: new Set([dmgType]) } } } }, damage: { parts: [] } } });
  r = attack("bludgeoning");
  ok("a bludgeoning weapon attack on a Frozen creature is a Critical Hit if it hits", r.options.mgCritOnHit?.ac === 12 && r.flavor.includes("L:MIGHTYGUARD.Rolls.CritOnHit"));
  ok("…slashing isn't", !attack("slashing").options.mgCritOnHit);
  ok("…nor a bludgeoning spell", !attack("bludgeoning", "spell").options.mgCritOnHit);
  frozen.statuses = new Set(["entangled", "immobilized", "defenseless"]);
  ok("…nor an Entangled creature", !attack("bludgeoning").options.mgCritOnHit);
  game.user.targets = new Set();

  // Animations: each its own; Entangled, Frozen and Shocked don't also show Immobilized's or Defenseless's
  const ranks = t => fxs(t).map(c => c._mgRank).sort((a, b) => a - b).join();
  const show = (statuses) => { A.actor.statuses = new Set(statuses); A.actor.effects = []; run(3); return ranks(A); };
  ok(`Immobilized: chains (${show(["immobilized"])})`, show(["immobilized"]) === "2.9");
  ok(`Entangled: vines only (${show(["entangled", "immobilized", "defenseless"])})`, show(["entangled", "immobilized", "defenseless"]) === "2.95");
  ok(`Frozen: ice only (${show(["frozen", "immobilized", "defenseless"])})`, show(["frozen", "immobilized", "defenseless"]) === "5.7");
  ok(`Shocked: sparks only (its Dazed and Defenseless hidden) (${show(["shocked", "dazed", "defenseless"])})`, show(["shocked", "dazed", "defenseless"]) === "5.6");
  ok("Defenseless on its own shows its splitting shield, Dazed its birds", show(["defenseless"]) === "6.64" && show(["dazed"]) === "6.68");
  ok(`Jinxed and Valor: rain cloud and golden glow (${show(["jinxed", "valor"])})`, show(["jinxed", "valor"]) === "0.29,6.67");
  // the drawing runs for a while without errors (non-finite numbers would throw in the mocks)
  A.actor.statuses = new Set(["immobilized", "entangled", "frozen", "shocked", "jinxed", "valor"]); run(40);
  ok("all six together animate without errors", fxs(A).length === 5);
  settings.set("frozenFx", false); run(2);
  ok("each can be turned off on its own", fxs(A).length === 4);
  settings.set("frozenFx", true); A.actor.statuses = new Set(); run(2);

  // Contamination's rest rules
  const contaminated = (level, hp = 10) => ({ documentName: "Actor", name: "Ash", isOwner: true, statuses: new Set(["contamination"]), system: { attributes: { hp: { value: hp, max: 30 } } },
    effects: [{ statuses: new Set(["contamination"]), system: {}, flags: { "primal-status": { level } }, update: async function (d) { this.updated = d; } }] });
  const restResult = actor => ({ type: "long", longRest: true, deltas: { hitPoints: 20, hitDice: 2 }, dhp: 20, updateData: { "system.attributes.hp.value": 30, "system.attributes.hd.spent": 0 } });
  let actor = contaminated(3), result = restResult(actor);
  for (const f of hooks["dnd5e.preRestCompleted"] ?? []) f(actor, result, { type: "long" });
  ok("level 3: a long rest restores no Hit Points (the rest's own summary says 0)", result.updateData["system.attributes.hp.value"] === 10 && result.deltas.hitPoints === 0 && result.dhp === 0 && result.updateData["system.attributes.hd.spent"] === 0);
  actor = contaminated(2); result = restResult(actor);
  for (const f of hooks["dnd5e.preRestCompleted"] ?? []) f(actor, result, { type: "long" });
  ok("level 2: Hit Points restored as usual", result.updateData["system.attributes.hp.value"] === 30);
  actor = contaminated(5); result = { ...restResult(actor), type: "short", longRest: false };
  for (const f of hooks["dnd5e.preRestCompleted"] ?? []) f(actor, result, { type: "short" });
  ok("a short rest isn't changed", result.updateData["system.attributes.hp.value"] === 30);
  settings.set("contaminationRest", false); actor = contaminated(4); result = restResult(actor);
  for (const f of hooks["dnd5e.preRestCompleted"] ?? []) f(actor, result, { type: "long" });
  ok("setting off: long rests aren't changed", result.updateData["system.attributes.hp.value"] === 30);
  settings.set("contaminationRest", true);

  // After the long rest: 1d20, a level on a 1
  const posted = [];
  const realRoll = globalThis.Roll;
  let nextTotal = 1;
  globalThis.Roll = class { constructor(f) { this.formula = f; } async evaluate() { this.total = nextTotal; return this; } async toMessage(d) { posted.push(d); } };
  globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ alias: actor.name }) };
  actor = contaminated(2);
  for (const f of hooks["dnd5e.restCompleted"] ?? []) f(actor, restResult(actor), { type: "long" });
  await settle(); await settle(); await settle();
  ok("after a long rest a contaminated creature rolls 1d20 in the chat", posted.length === 1 && posted[0].speaker.alias === "Ash" && posted[0].flavor.includes("L:MIGHTYGUARD.ContaminationRest.Gained"));
  ok("…and on a 1 gains a level", actor.effects[0].updated?.flags?.["primal-status"]?.level === 3);
  nextTotal = 12; actor = contaminated(2);
  for (const f of hooks["dnd5e.restCompleted"] ?? []) f(actor, restResult(actor), { type: "long" });
  await settle(); await settle();
  ok("…on anything else, the roll is posted and nothing changes", posted.length === 2 && posted[1].flavor.includes("ContaminationRest.Safe") && !actor.effects[0].updated);
  const clean = { documentName: "Actor", name: "Clean", isOwner: true, statuses: new Set(), effects: [], system: {} };
  for (const f of hooks["dnd5e.restCompleted"] ?? []) f(clean, restResult(clean), { type: "long" });
  actor = contaminated(2); actor.isOwner = false;
  for (const f of hooks["dnd5e.restCompleted"] ?? []) f(actor, restResult(actor), { type: "long" });
  actor = contaminated(2);
  for (const f of hooks["dnd5e.restCompleted"] ?? []) f(actor, { ...restResult(actor), type: "short", longRest: false }, { type: "short" });
  await settle(); await settle();
  ok("no roll for creatures without Contamination, on other players' screens, or after a short rest", posted.length === 2);
  globalThis.Roll = realRoll;

  // Level 2+: Hit Point Dice heal half (dnd5e 6 calls both hit die hooks with the same arguments)
  const hitDie = (actor, gained) => {
    const updates = { actor: { "system.attributes.hd.spent": 1, "system.attributes.hp.value": actor.system.attributes.hp.value + gained }, class: {} };
    const rolls = [{ total: gained, options: {} }];
    for (const f of hooks["dnd5e.rollHitDie"] ?? []) f(rolls, { subject: actor, updates });
    for (const f of hooks["dnd5e.rollHitDieV2"] ?? []) f(rolls, { subject: actor, updates });
    return updates.actor["system.attributes.hp.value"];
  };
  ok("level 2: a Hit Point Die that rolls 9 heals 4, halved once", hitDie(contaminated(2), 9) === 14);
  ok("level 1: healed in full", hitDie(contaminated(1), 9) === 19);
  ok("dnd5e 3's older hook works too", (() => { const a = contaminated(4); const u = { actor: { "system.attributes.hp.value": 17 } }; for (const f of hooks["dnd5e.rollHitDie"] ?? []) f(a, {}, u); return u.actor["system.attributes.hp.value"] === 13; })());
  settings.set("contaminationRest", false);
  ok("setting off: healed in full", hitDie(contaminated(3), 9) === 19);
  settings.set("contaminationRest", true);
}

/* ---------- 11. Art shrunk, moved or scaled by another module: effects follow the art ---------- */
{
  // Simple scale-and-move transforms, like PIXI's, so the art can be measured where it's drawn
  const affine = (s, tx, ty) => ({ apply: p => ({ x: p.x * s + tx, y: p.y * s + ty }), inv: p => ({ x: (p.x - tx) / s, y: (p.y - ty) / s }) });
  const savedMesh = A.mesh;
  // The art's texture is 200 px; at its normal size it fills the token's 100 × 100 square (scale 0.5).
  const place = ({ tokenScale = 1, tokenAt = [0, 0], artScale = 0.5, artAt = [50, 50] }) => {
    const T = affine(tokenScale, ...tokenAt), M = affine(artScale, ...artAt);
    A.toLocal = p => T.inv(p);
    A.worldTransform = { a: tokenScale * 0.75, b: 0 };
    A.mesh = { tint: 0xFFFFFF, alpha: 1, parent: {}, destroyed: false, texture: { orig: { width: 200, height: 200 }, width: 200, height: 200 },
      anchor: { x: 0.5, y: 0.5 }, toGlobal: p => M.apply(p), width: 200 * artScale, height: 200 * artScale, position: { x: artAt[0], y: artAt[1] } };
  };
  const fxBox = () => { const c = fxs(A)[0]; return c ? [Math.round(c.x), Math.round(c.y)] : null; };
  A.actor.statuses = new Set(["marked"]); A.actor.effects = []; A.document.flags = {};
  place({}); run(2);
  ok(`art at its normal size: effects cover the token's square (${fxBox()})`, JSON.stringify(fxBox()) === "[0,0]");
  place({ artScale: 0.3 }); run(2);
  ok(`another module shrinks the art to 60%: effects shrink with it, centred on it (${fxBox()})`, JSON.stringify(fxBox()) === "[20,20]");
  place({ tokenScale: 0.6, tokenAt: [20, 20], artScale: 0.3 }); run(2);
  ok(`…shrinking the whole token too: effects shrink once, not twice (${fxBox()})`, JSON.stringify(fxBox()) === "[0,0]");
  place({ artScale: 0.3, artAt: [80, 50] }); run(2);
  ok(`art shrunk and moved aside (as when tokens share a space): effects go with it (${fxBox()})`, JSON.stringify(fxBox()) === "[50,20]");
  place({ artScale: 0.75 }); run(2);
  ok(`art scaled up past the square: effects grow to match (${fxBox()})`, JSON.stringify(fxBox()) === "[-25,-25]");
  // Each frame: the art changes size while the game runs, the effects keep up
  place({ artScale: 0.25 }); run(1);
  ok(`…and they keep up from one frame to the next (${fxBox()})`, JSON.stringify(fxBox()) === "[25,25]");
  // Something that can't be measured (no transforms): the token's own data, as before
  delete A.toLocal; A.mesh = savedMesh; run(2);
  ok(`no display transforms to measure with: the token's own size and scale (${fxBox()})`, JSON.stringify(fxBox()) === "[0,0]");

  // The Dead skull sits over the art and matches its size
  place({ artScale: 0.3, artAt: [70, 50] });
  const skull = { anchor: { set() {} }, position: { set(x, y) { this.x = x; this.y = y; } } };
  A.effects = { overlay: skull, children: [skull], position: { x: 0, y: 0 } };
  A.document.hasStatusEffect = id => id === "dead";
  A.actor.statuses = new Set(["dead"]);
  settings.set("deadSkull", true);
  run(2);
  ok(`the Dead skull covers the shrunk art, centred on it (${Math.round(skull.position.x)}, ${Math.round(skull.position.y)}, ${Math.round(skull.width)} wide)`,
    Math.round(skull.position.x) === 70 && Math.round(skull.position.y) === 50 && Math.round(skull.width) === 60);
  place({ artScale: 0.5, artAt: [50, 50] }); run(1);
  ok("…and follows it back to full size without waiting for Foundry to redraw the token", Math.round(skull.width) === 100 && Math.round(skull.position.x) === 50);
  A.document.hasStatusEffect = id => A.actor.statuses.has(id);
  A.actor.statuses = new Set(); delete A.effects; delete A.toLocal; delete A.worldTransform; A.mesh = savedMesh; run(2);
}
