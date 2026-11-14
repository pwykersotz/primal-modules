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
await import(process.argv[2]);
call("init"); call("setup"); call("ready"); call("canvasReady");
const tick = tickers[0]; const run = n => { for (let i=0;i<n;i++) tick(); };
const fxs = t => t.children.filter(c=>c._mgRank!==undefined);
const ok = (label, cond) => console.log((cond ? "PASS " : "FAIL ") + label);

run(5);
ok("nothing active -> no effects", fxs(A).length===0 && fxs(B).length===0 && A.mesh.tint===0xFFFFFF);

B.actor.statuses.add("coverHalf"); run(20);
ok("half cover -> fog layer on B", fxs(B).length===1 && fxs(B)[0]._mgRank===2);
const fog = fxs(B)[0];
ok("fog has 8 puffs + 4 tendrils", fog.children[0].children.length===8 && fog.children[1].children.length===4);
const halfAlpha = B.mesh.alpha, halfTint = B.mesh.tint;
console.log("   half cover art alpha", halfAlpha.toFixed(3), "tint", halfTint.toString(16), "puff alpha", fog.children[0].children[0].alpha.toFixed(3));
B.actor.statuses.delete("coverHalf"); B.actor.statuses.add("coverTotal"); run(2);
ok("total cover is denser than half", B.mesh.alpha < halfAlpha);
ok("fog sits between voidMesh and bars", B.children.indexOf(fog) === B.children.indexOf(B.voidMesh)+1 && B.children.indexOf(B.bars) > B.children.indexOf(fog));

A.actor.statuses.add("mighty-guard"); A.actor.statuses.add("coverThreeQuarters"); run(10);
const [g0, g1] = fxs(A);
ok("both effects on A, guard under fog", fxs(A).length===2 && g0._mgRank===0 && g1._mgRank===2);
ok("both above voidMesh, below bars", A.children.indexOf(A.voidMesh) < A.children.indexOf(g0) && A.children.indexOf(g1) < A.children.indexOf(A.bars));
console.log("   stacked art alpha", A.mesh.alpha.toFixed(3), "tint", A.mesh.tint.toString(16));

// Redraw A: Foundry destroys children and rebuilds them
A.removeChildren().forEach(c=>c.destroy({children:true})); A.bars=new Obs(); A.voidMesh=new Obs(); A.addChild(new Obs(), A.voidMesh, A.bars);
run(1);
ok("both recreated after redraw in correct order", fxs(A).length===2 && fxs(A)[0]._mgRank===0 && A.children.indexOf(fxs(A)[1]) < A.children.indexOf(A.bars));

A.actor.statuses.delete("coverThreeQuarters"); run(1);
ok("removing cover keeps guard only", fxs(A).length===1 && fxs(A)[0]._mgRank===0);
A.actor.statuses.delete("mighty-guard"); run(1);
ok("removing guard clears all and restores art", fxs(A).length===0 && A.mesh.tint===0xFFFFFF && A.mesh.alpha===1);

settings.set("coverFog", false); run(1);
ok("fog setting off removes fog on B and restores", fxs(B).length===0 && B.mesh.alpha===1);
settings.set("coverFog", true); run(1);
ok("fog setting back on restores fog", fxs(B).length===1);
{ // Hiding gets the same fog, between Half and Three-Quarters Cover
  const saved = new Set(B.actor.statuses);
  const alphaFor = st => { B.actor.statuses = new Set(st); run(3); return B.mesh.alpha; };
  const half = alphaFor(["coverHalf"]), three = alphaFor(["coverThreeQuarters"]);
  B.actor.statuses = new Set(["hiding"]); run(3);
  ok("hiding -> the same fog layer (rank 2)", fxs(B).length === 1 && fxs(B)[0]._mgRank === 2 && fxs(B)[0].children[0].children.length === 8);
  const hide = B.mesh.alpha;
  ok("hiding fog sits between Half and Three-Quarters Cover", hide < half && hide > three);
  ok("hiding + Total Cover: the thicker (Total) fog", Math.abs(alphaFor(["hiding", "coverTotal"]) - alphaFor(["coverTotal"])) < 1e-9);
  ok("hiding + Half Cover: the Hiding fog", Math.abs(alphaFor(["hiding", "coverHalf"]) - hide) < 1e-9);
  ok("pf2e-style 'hidden' also gets fog", (B.actor.statuses = new Set(["pf2e.hidden"]), run(2), fxs(B).length === 1));
  ok("'unhidden'/'hide-and-seek'-like IDs don't", (B.actor.statuses = new Set(["unhidden", "hideout"]), run(2), fxs(B).length === 0));
  settings.set("coverFog", false); B.actor.statuses = new Set(["hiding"]); run(1);
  ok("fog setting off: no fog for hiding either", fxs(B).length === 0);
  settings.set("coverFog", true);
  B.actor.statuses = saved; run(2);
}

// Cover detected via an active effect rather than actor.statuses
B.actor.statuses.clear(); B.actor.effects=[{disabled:false, statuses:new Set(["half-cover"])}]; run(1);
ok("cover from effect statuses (half-cover) detected", fxs(B).length===1);
B.actor.effects=[{disabled:false, statuses:new Set(["discovered","recover"])}]; run(1);
ok("'discovered'/'recover' are not cover", fxs(B).length===0);

// Sleeping
B.actor.effects=[]; B.actor.statuses = new Set(["unconscious","incapacitated"]); run(1);
ok("unconscious alone shows the Z's too", fxs(B).length===1 && fxs(B)[0]._mgRank===8);
B.actor.statuses = new Set(["sleeping","unconscious","incapacitated"]); run(1);
ok("sleeping -> Z layer", fxs(B).length===1 && fxs(B)[0]._mgRank===8 && fxs(B)[0].children.length===3);
ok("sleeping leaves art unchanged", B.mesh.tint===0xFFFFFF && B.mesh.alpha===1);
let zOk = true;
for (let i=0;i<60;i++){ tick(); for (const z of fxs(B)[0].children){ if(!Number.isFinite(z.x)||!Number.isFinite(z.y)||z.alpha<0||z.alpha>1||!(z._s[0]>0)) zOk=false; } }
ok("Z positions/alpha/scale stay valid", zOk);
const zs = fxs(B)[0].children.map(z=>({x:z.x.toFixed(0), y:z.y.toFixed(0), a:z.alpha.toFixed(2), s:z._s[0].toFixed(3)}));
console.log("   Z sample", JSON.stringify(zs));
B.actor.statuses.add("mighty-guard"); B.actor.statuses.add("coverHalf"); run(1);
const r = fxs(B).map(c=>c._mgRank);
ok("guard + fog + sleep stack in order 0,1,2", JSON.stringify(r)==="[0,2,8]" && B.children.indexOf(fxs(B)[2]) < B.children.indexOf(B.bars));
B.actor.statuses = new Set(["pf2e.asleep"]); run(1);
ok("prefixed 'asleep' detected; others cleared", fxs(B).length===1 && fxs(B)[0]._mgRank===8);
settings.set("sleepZs", false); run(1); ok("sleep setting off clears Z's", fxs(B).length===0); settings.set("sleepZs", true);
B.actor.statuses = new Set(["sleepless"]); run(1); ok("'sleepless' is not sleeping", fxs(B).length===0);

// Status registration (v14 record format)
const se = CONFIG.statusEffects;
ok("v14: statuses registered as keyed entries", se.hasted && se.slowed && se["mighty-guard"] && se.blinded);
ok("v14: valid 16-char _ids", [se.hasted._id, se.slowed._id, se["mighty-guard"]._id].every(i=>/^[a-zA-Z0-9]{16}$/.test(i)));
ok("names/descriptions localized", se.hasted.name==="L:MIGHTYGUARD.Haste" && se.slowed.description.startsWith("L:"));
const hk = se.hasted.system.changes.map(c=>c.key+":"+c.type+":"+c.value).join(" | ");
const sk = se.slowed.system.changes.map(c=>c.key+":"+c.type+":"+c.value).join(" | ");
console.log("   haste changes:", hk); console.log("   slow changes: ", sk);
ok("haste changes match dnd5e spell", hk==="system.attributes.movement.multiplier:multiply:2 | system.attributes.ac.bonus:add:2 | system.abilities.dex.save.roll.mode:add:1");
ok("slow changes match dnd5e spell", sk==="system.attributes.movement.multiplier:multiply:0.5 | system.attributes.ac.bonus:add:-2 | system.abilities.dex.bonuses.save:add:-2");
ok("icons point at module folder", se.hasted.img==="modules/primal-status/icons/haste.svg" && se.slowed.img==="modules/primal-status/icons/slow.svg");
ok("Monsters of Drakkenheim conditions registered with their own icons and rules text",
  ["addled", "clumsy", "enfeebled", "sickened", "defenseless", "helpless", "weakened", "dazed", "immobilized", "entangled", "frozen", "shocked", "jinxed", "valor"].every(id => se[id]?.img === `modules/primal-status/icons/${id}.svg` && se[id].name.startsWith("L:MIGHTYGUARD.Drakkenheim.") && se[id].description.startsWith("L:MIGHTYGUARD.Desc.") && /^[a-zA-Z0-9]{16}$/.test(se[id]._id) && !("optional" in se[id])));
ok("…and the newer ones (Bewildered, Distracted, Staggered, Slowed, Drakkenheim Madness), their icons named in lower case with dashes",
  ["bewildered", "distracted", "staggered", "drakkenheimSlowed", "drakkenheimMadness"].every(id => se[id]?.name === `L:MIGHTYGUARD.Drakkenheim.${id[0].toUpperCase()}${id.slice(1)}` && /^[a-zA-Z0-9]{16}$/.test(se[id]._id))
  && se.drakkenheimSlowed.img === "modules/primal-status/icons/drakkenheim-slowed.svg" && se.drakkenheimMadness.img === "modules/primal-status/icons/drakkenheim-madness.svg" && se.bewildered.img === "modules/primal-status/icons/bewildered.svg"
  && new Set(Object.values(se).map(e => e._id)).size === Object.keys(se).length);
ok("Slowed (Monsters of Drakkenheim) halves Speed and nothing else; Slow (the spell) is still its own status",
  se.drakkenheimSlowed.system.changes.map(c => c.key + ":" + c.type + ":" + c.value).join(" | ") === "system.attributes.movement.multiplier:multiply:0.5" && se.slowed.name === "L:MIGHTYGUARD.Slow");
ok("Distracted tells Midi-QOL it has no Reaction to take", se.distracted.system.changes.map(c => c.key + ":" + c.type + ":" + c.value).join(" | ") === "flags.midi-qol.actions.reactionsMax:override:0");
call("ready"); ok("re-registering doesn't duplicate", Object.keys(se).length===24);

// Haste / Slow outlines
B.actor.effects=[]; B.actor.statuses=new Set(["hasted"]); run(3);
ok("hasted -> outline layer (rank 1)", fxs(B).length===1 && fxs(B)[0]._mgRank===1);
const hfx = fxs(B)[0];
ok("outline has glow, ring, 2 comets, 10 sparks", hfx.children.length===4 && hfx.children[2].children.length===2 && hfx.children[3].children.length===10);
ok("haste leaves art unchanged", B.mesh.tint===0xFFFFFF && B.mesh.alpha===1);
let mOk=true; for (let i=0;i<90;i++){ tick(); for (const sp of fxs(B)[0].children[3].children) if(!(sp.alpha>=0&&sp.alpha<=1)||!Number.isFinite(sp.x)) mOk=false; }
ok("sparks stay valid over time", mOk);
B.actor.statuses=new Set(["slowed"]); run(1);
ok("slowed -> outline layer", fxs(B).length===1 && fxs(B)[0]._mgRank===1);
B.actor.statuses=new Set(); B.actor.effects=[{name:"Hasted", disabled:false, active:true, statuses:new Set()}]; run(1);
ok("dnd5e 'Hasted' spell effect shows outline", fxs(B).length===1);
B.actor.effects=[{name:"Hasted", disabled:true, active:false, statuses:new Set()}]; run(1);
ok("disabled 'Hasted' effect doesn't", fxs(B).length===0);
B.actor.effects=[]; B.actor.statuses=new Set(["mighty-guard","hasted","coverHalf","sleeping"]); run(1);
ok("all four stack in order guard, haste, fog, sleep", JSON.stringify(fxs(B).map(c=>c._mgRank))==="[0,1,2,8]" && B.children.indexOf(fxs(B)[3]) < B.children.indexOf(B.bars));
settings.set("motionOutline", false); run(1); ok("outline setting off hides it", JSON.stringify(fxs(B).map(c=>c._mgRank))==="[0,2,8]"); settings.set("motionOutline", true);
B.actor.statuses=new Set(); run(1);

// Charmed hearts
B.actor.effects=[]; B.actor.statuses=new Set(["charmed"]); run(2);
ok("charmed -> heart layer (rank 6)", fxs(B).length===1 && fxs(B)[0]._mgRank===6);
const cfx = fxs(B)[0];
ok("4 hearts with glows", cfx.children[0].children.length===4 && cfx.children[1].children.length===4);
ok("charmed leaves art unchanged", B.mesh.tint===0xFFFFFF && B.mesh.alpha===1);
let hOk=true, minX=1e9, maxX=-1e9;
for (let i=0;i<200;i++){ tick(); for (const hrt of cfx.children[1].children){ if(!Number.isFinite(hrt.x)||!Number.isFinite(hrt.y)||hrt.alpha<0||hrt.alpha>1||!(hrt._s[0]>0)) hOk=false; minX=Math.min(minX,hrt.x); maxX=Math.max(maxX,hrt.x);} }
ok("hearts stay valid over time", hOk);
console.log("   heart x range over time:", minX.toFixed(0), "to", maxX.toFixed(0), "(token width 100)");
B.actor.statuses=new Set(["charmed","sleeping","hasted"]); run(1);
ok("charmed + sleeping + haste stack: outline, hearts, Z's", JSON.stringify(fxs(B).map(c=>c._mgRank))==="[1,6,8]");
B.actor.statuses=new Set(["uncharmed"]); run(1); ok("'uncharmed' isn't charmed", fxs(B).length===0);
settings.set("charmHearts", false); B.actor.statuses=new Set(["charmed"]); run(1); ok("hearts setting off hides them", fxs(B).length===0); settings.set("charmHearts", true);
B.actor.statuses=new Set(); run(1);

// Condition animations
const allFinite = o => { if (!Number.isFinite(o.x ?? 0) || !Number.isFinite(o.y ?? 0) || !(o.alpha >= 0 && o.alpha <= 1)) return false; return o.children.every(allFinite); };
for (const [status, rank, label] of [["bleeding",4,"blood drips"],["poisoned",4,"poison bubbles"],["burning",5,"flames"],["restrained",3,"rope"],["stunned",7,"stars"]]) {
  B.actor.effects=[]; B.actor.statuses=new Set([status]); run(2);
  ok(`${status} -> ${label} layer (rank ${rank})`, fxs(B).length===1 && fxs(B)[0]._mgRank===rank);
  let valid = true; for (let i=0;i<240;i++){ tick(); if (!allFinite(fxs(B)[0])) valid = false; }
  ok(`${label} stay valid over time`, valid);
}
B.actor.statuses=new Set(["frightened"]); run(2);
ok("frightened -> shadow layer (rank 2.5)", fxs(B).length===1 && fxs(B)[0]._mgRank===2.5);
{ let valid = true; for (let i=0;i<240;i++){ tick(); if (!allFinite(fxs(B)[0])) valid = false; } ok("shadows stay valid over time", valid); }
ok("frightened pales the art (cold tint)", (B.mesh.tint&255) > (B.mesh.tint>>16&255) && B.mesh.tint !== 0xFFFFFF);
{ const t1 = B.mesh.tint; for (let i=0;i<40;i++) tick(); ok("no heartbeat: frightened tint is steady", B.mesh.tint === t1); }
B.actor.statuses=new Set(["fearless"]); run(1); ok("'fearless' isn't frightened", fxs(B).length===0);
settings.set("frightenedFx", false); B.actor.statuses=new Set(["frightened"]); run(1); ok("frightenedFx off hides it", fxs(B).length===0); settings.set("frightenedFx", true);
B.actor.statuses=new Set(["frightened","coverHalf","restrained"]); run(1);
ok("shadows sit between fog and rope", JSON.stringify(fxs(B).map(c=>c._mgRank))==="[2,2.5,3]");
B.actor.statuses=new Set(["concentrating"]); run(2);
ok("concentrating -> rune rings (rank 0.5)", fxs(B).length===1 && fxs(B)[0]._mgRank===0.5);
{ const f = fxs(B)[0]; ok("two rune rings (glow + crisp) and motes", f.children.length===3 && f.children[0].children.length===2 && f.children[1].children.length===2 && f.children[2].children.length===12);
  const r0 = f.children[1].children[0].rotation, r1 = f.children[1].children[1].rotation; for (let i=0;i<30;i++) tick();
  const d0 = f.children[1].children[0].rotation - r0, d1 = f.children[1].children[1].rotation - r1;
  ok("rings turn slowly in opposite directions", d0 > 0 && d1 < 0 && Math.abs(d0) < 0.1);
  let valid = true; for (let i=0;i<240;i++){ tick(); if (!allFinite(f)) valid = false; } ok("rune rings stay valid", valid); }
ok("concentrating leaves art unchanged", B.mesh.tint===0xFFFFFF && B.mesh.alpha===1);
B.actor.statuses=new Set(["concentration"]); run(1); ok("'concentration' ID also detected", fxs(B).length===1);
settings.set("concentrationFx", false); run(1); ok("concentrationFx off hides it", fxs(B).length===0); settings.set("concentrationFx", true);
B.actor.statuses=new Set(["concentrating","mighty-guard","hasted"]); run(1);
ok("rune rings sit between Mighty Guard and Haste", JSON.stringify(fxs(B).map(c=>c._mgRank))==="[0,0.5,1]");
B.actor.statuses=new Set(["poisoned"]); run(1);
ok("poisoned tints the art green", (B.mesh.tint>>8&255) > (B.mesh.tint>>16&255));
{ const [haze, stain, bubbles, strands, drops] = fxs(B)[0].children; for (let i=0;i<60;i++) tick();
  ok("poisoned: no drops", drops.children.length===0);
  ok("poisoned: no strands or rim stain", !strands.calls.includes("lineTo") && !stain.calls.includes("lineTo") && !stain.filters);
  ok("poisoned: bubbles and haze kept", bubbles.children.length===6 && bubbles.children.some(g=>g.calls.includes("drawCircle")) && haze.calls.includes("drawEllipse")); }
B.actor.statuses=new Set(["bleeding"]); run(1);
{ for (let i=0;i<60;i++) tick();
  ok("bleeding: its own (painted) drips, the art a little red", fxs(B).length===1 && fxs(B)[0]._mgRank===4 && (B.mesh.tint>>16&255) > (B.mesh.tint&255)); }
B.actor.statuses=new Set(["burning"]); run(1);
ok("burning warms the art", (B.mesh.tint>>16&255) > (B.mesh.tint&255));
B.actor.statuses=new Set(["restrained","bleeding","burning","stunned","charmed","sleeping","hasted","coverHalf","mighty-guard","poisoned"]); run(3);
ok("ten effects stack in order", JSON.stringify(fxs(B).map(c=>c._mgRank))==="[0,1,2,3,4,4,5,6,7,8]" && B.children.indexOf(fxs(B).at(-1)) < B.children.indexOf(B.bars));
B.actor.statuses=new Set(); run(1);
ok("all cleared and art restored", fxs(B).length===0 && B.mesh.tint===0xFFFFFF && B.mesh.alpha===1);
for (const [k, st] of [["bleedingFx","bleeding"],["poisonedFx","poisoned"],["burningFx","burning"],["restrainedFx","restrained"],["stunnedFx","stunned"]]) {
  settings.set(k, false); B.actor.statuses=new Set([st]); run(1);
  ok(`${k} off hides it`, fxs(B).length===0); settings.set(k, true);
}
B.actor.statuses=new Set(["pf2e.stunned","on-fire"]); run(1);
ok("prefixed/alternate IDs detected (pf2e.stunned, on-fire)", JSON.stringify(fxs(B).map(c=>c._mgRank))==="[5,7]");
B.actor.statuses=new Set(["antipoison","unrestrained"]); run(1);
ok("lookalike IDs ignored", fxs(B).length===0);
B.actor.statuses=new Set(); run(1);

// Dead: a big red skull
await (async () => {
  CONFIG.specialStatusEffects = { ...(CONFIG.specialStatusEffects ?? {}), DEFEATED: "dead" };
  const mk = (statuses, { w = 100, h = 100, deadImg = "icons/svg/skull.svg" } = {}) => {
    const t = Object.create(TokenObj.prototype); const set = new Set(statuses);
    const effects = [...set].map(id => ({ img: id === "dead" ? deadImg : `icons/${id}.svg`, statuses: new Set([id]), disabled: false }));
    Object.assign(t, { w, h, document: { hasStatusEffect: id => set.has(id) }, actor: { statuses: set, effects, temporaryEffects: effects }, effects: { children: [], overlay: null } });
    return t; };
  const draw = (t, src) => TokenObj.prototype._drawEffect.call(t, src);
  // Dead set from the status palette: an ordinary icon
  const T = mk(["blinded", "dead"]);
  const prone = await draw(T, "icons/blinded.svg"); const skull = await draw(T, "icons/svg/skull.svg"); T._refreshEffects();
  ok("Dead from the status palette: the icon becomes the overlay (out of the row of icons)", T.effects.overlay === skull);
  ok("…fills the token", skull.width === 100 && skull.height === 100);
  ok("…is blood red", skull.tint === 0xC8102E && skull.alpha > 0.8);
  ok("…and is centred", skull.x === 50 && skull.y === 50 && skull._anchor?.[0] === 0.5);
  ok("other status icons stay small, in the first slot", prone.width === 20 && prone.x === 0 && prone.y === 0 && prone.tint === 0xFFFFFF);
  // Dead as Foundry's overlay (e.g. defeated in the combat tracker)
  const O = mk(["dead"]); const ov = await draw(O, "icons/svg/skull.svg"); O.effects.overlay = ov; O._refreshEffects();
  ok("Dead as Foundry's overlay: also big and red", ov.width === 100 && ov.tint === 0xC8102E);
  // dnd5e's own Dead image (from the effect)
  const D = mk(["dead"], { deadImg: "systems/dnd5e/icons/svg/statuses/dead.svg" }); const dsk = await draw(D, "systems/dnd5e/icons/svg/statuses/dead.svg"); D._refreshEffects();
  ok("works with whatever image the Dead effect uses", D.effects.overlay === dsk && dsk.width === 100);
  const W = mk(["dead"], { w: 200, h: 100 }); const wsk = await draw(W, "icons/svg/skull.svg"); W._refreshEffects();
  ok("wide tokens: as big as fits, centred", wsk.width === 100 && wsk.height === 100 && wsk.x === 100 && wsk.y === 50);
  const N = mk(["prone"]); const nsk = await draw(N, "icons/svg/skull.svg"); N._refreshEffects();
  ok("a skull icon on a token that isn't Dead is left alone", N.effects.overlay === null && nsk.width === 20 && nsk.tint === 0xFFFFFF);
  const plain = { actor: { statuses: new Set(["dead"]), effects: [] }, document: { hasStatusEffect: () => true } };
  let threw = false; try { await TokenObj.prototype._drawEffect.call(plain, "icons/svg/skull.svg"); } catch { threw = true; }
  ok("tokens without an effects layer don't break", !threw);
  settings.set("deadSkull", false);
  const F = mk(["dead"]); const fsk = await draw(F, "icons/svg/skull.svg"); F._refreshEffects(); settings.set("deadSkull", true);
  ok("setting off: Foundry's own small icon", F.effects.overlay === null && fsk.width === 20 && fsk.tint === 0xFFFFFF);
  ok("turning it on or off redraws the icons", typeof settingsCfg.get("primal-status.deadSkull")?.onChange === "function");

  // Dying or dead: Bloodied and Prone icons left off
  const withHp = (t, value, failure = 0) => { t.actor.system = { attributes: { hp: { value, max: 20 }, death: { failure } } }; return t; };
  const dyingT = withHp(mk(["bloodied", "prone", "blinded", "unconscious"]), 0);
  ok("dying: Bloodied and Prone icons left off", (await draw(dyingT, "icons/bloodied.svg")) === null && (await draw(dyingT, "icons/prone.svg")) === null);
  ok("…other icons still drawn (Blinded)", (await draw(dyingT, "icons/blinded.svg"))?.src === "icons/blinded.svg");
  const deadT = withHp(mk(["bloodied", "prone", "dead"]), 0, 3);
  ok("dead: Bloodied and Prone icons left off too", (await draw(deadT, "icons/bloodied.svg")) === null && (await draw(deadT, "icons/prone.svg")) === null);
  const hurtT = withHp(mk(["bloodied", "prone"]), 4);
  ok("hurt but up: Prone's icon replaced by its animation", (await draw(hurtT, "icons/prone.svg")) === null);
  settings.set("proneFx", false);   // the rest checks the dying/dead rule on its own
  ok("…or shown as usual with Prone's animation off", (await draw(hurtT, "icons/prone.svg"))?.src === "icons/prone.svg");
  settings.set("bloodiedFx", false);
  ok("…and Bloodied too when its splatters are off", (await draw(hurtT, "icons/bloodied.svg"))?.src === "icons/bloodied.svg");
  settings.set("bloodiedFx", true);
  const stableT = withHp(mk(["bloodied", "prone", "stable"]), 0);
  ok("stable at 0 HP: shown as usual", (await draw(stableT, "icons/prone.svg"))?.src === "icons/prone.svg");
  settings.set("dyingFx", false); const offT = withHp(mk(["bloodied", "prone"]), 0);
  ok("dying animation off: icons shown as usual", (await draw(offT, "icons/prone.svg"))?.src === "icons/prone.svg"); settings.set("dyingFx", true);
  settings.set("proneFx", true);
  // redraw when HP or death saves change
  const flagged = []; const tk = { constructor: { RENDER_FLAGS: { redrawEffects: {} } }, renderFlags: { set: f => flagged.push(f) } };
  const actorX = { getActiveTokens: () => [tk] };
  for (const f of hooks["updateActor"] ?? []) f(actorX, { system: { attributes: { hp: { value: 0 } } } });
  ok("HP change redraws the token's icons", flagged.some(f => f.redrawEffects));
  flagged.length = 0; for (const f of hooks["updateActor"] ?? []) f(actorX, { system: { attributes: { death: { failure: 1 } } } });
  ok("a death save redraws them too", flagged.some(f => f.redrawEffects));
  flagged.length = 0; for (const f of hooks["updateActor"] ?? []) f(actorX, { name: "Renamed" });
  ok("other changes don't", flagged.length === 0);
})();

// Settings: animations kept out of the list, thirteen settings shown
{
  const shown = [...settingsCfg.entries()].filter(([, c]) => c.config).map(([k]) => k.split(".")[1]);
  ok(`only fourteen settings shown, in order (${shown.join(", ")})`, JSON.stringify(shown) === JSON.stringify(["statusTooltips", "conditionRolls", "drakkenheimAutomation", "dodgeExpiry", "autoDead", "saveEndsCombatEnd", "burningDamage", "desperationAttacks", "desperationChance", "contaminationRest", "invisibleWhirl", "etherealVision", "guidanceCheckbox", "detection"]));
  const animKeys = ["pulse","motionOutline","concentrationFx","coverFog","charmHearts","sleepZs","markedFx","dodgingFx","deadSkull","dyingFx","bloodiedFx","proneFx","bleedingFx","poisonedFx","burningFx","restrainedFx","grappledFx","stunnedFx","frightenedFx","petrifiedFx","paralyzedFx","diseasedFx","incapacitatedFx","cursedFx","contaminationFx","exhaustionFx","levelCounters","hideAnimatedIcons"];
  ok("every animation toggle still registered (per player, on by default, hidden from the list)", animKeys.every(k => { const c = settingsCfg.get(`primal-status.${k}`); return c && c.scope === "client" && c.default === true && !c.config; }));
  ok("glow speed and Grappled image/size kept (GM, hidden from the list)", ["pulseSeconds","grappleImagePath","grappleImageFit"].every(k => { const c = settingsCfg.get(`primal-status.${k}`); return c && c.scope === "world" && !c.config; }));
}

// Unconscious, Petrified, Paralyzed, Diseased
{
  const valid = () => { let v = true; for (let i = 0; i < 240; i++) { tick(); if (!fxs(B).every(allFinite)) v = false; } return v; };
  B.actor.statuses = new Set(["unconscious"]); run(2);
  ok("unconscious -> the sleeping Z's (rank 8)", fxs(B).length === 1 && fxs(B)[0]._mgRank === 8 && fxs(B)[0].children.filter(c => c.text === "Z").length === 3);
  B.actor.statuses = new Set(["unconscious", "sleeping"]); run(1);
  ok("unconscious + sleeping: one set of Z's", fxs(B).length === 1);

  B.actor.statuses = new Set(["petrified"]); run(2);
  ok("petrified -> stone layer, under everything (rank -1)", fxs(B).length === 1 && fxs(B)[0]._mgRank === -1);
  ok("stone stays valid over time (dust falls)", valid());
  { const [wash, shade, grain, cracks] = fxs(B)[0].children;
    ok("no art copy available: a heavy stone wash, grain and chiselled cracks", wash.alpha > 0.6 && grain.calls.filter(c => c === "drawCircle").length >= 60 && cracks.calls.includes("lineTo")); }
  ok("petrified greys the art", ((B.mesh.tint >> 16) & 255) === ((B.mesh.tint >> 8) & 255) || Math.abs(((B.mesh.tint >> 16) & 255) - (B.mesh.tint & 255)) < 12);
  B.actor.statuses = new Set(["petrified", "mighty-guard", "poisoned"]); run(1);
  ok("other effects draw over the stone", JSON.stringify(fxs(B).map(c => c._mgRank)) === "[-1,0,4]");

  // With sprites available: a grey copy of the token's own art
  const destroyed = [];
  class Sprite extends Obs { constructor(t){ super(); this.texture = t; this.anchor = { set: v => this._anchor = v }; this.scale = { set: (a, b) => { this._s = [a, b ?? a]; } }; } destroy(o){ destroyed.push(o); super.destroy(o); } }
  class ColorMatrixFilter { constructor(){ this.matrix = null; } destroy(){ this.gone = true; } }
  PIXI.Sprite = Sprite; PIXI.ColorMatrixFilter = ColorMatrixFilter;
  const texA = { width: 200, height: 200 }, texB = { width: 400, height: 400 };
  B.mesh.texture = texA;
  B.actor.statuses = new Set(); run(1);
  B.actor.statuses = new Set(["petrified"]); run(2);
  { const statue = fxs(B)[0].children[0];
    ok("art copy made from the token's own texture", statue instanceof Sprite && statue.texture === texA);
    const m = statue.filters?.[0]?.matrix;
    ok("…turned to toned grey stone by a colour matrix", Array.isArray(m) && m.length === 20 && Math.abs(m[0] / m[1] - 0.299 / 0.587) < 1e-9 && m[4] > 0 && m[18] === 1);
    ok("…sized to the art box", Math.abs(statue._s[0] - 100 / 200) < 1e-9 && Math.abs(statue._s[1] - 0.5) < 1e-9);
    ok("…with a lighter wash over it", fxs(B)[0].children[1].alpha < 0.3);
    B.document.texture.scaleX = -1; run(1);
    ok("…mirrored with the token", statue._s[0] < 0);
    B.document.texture.scaleX = 1;
    B.mesh.texture = texB; run(1);
    ok("…follows a new token image", statue.texture === texB && Math.abs(statue._s[0] - 0.25) < 1e-9);
    B.actor.statuses = new Set(); run(1);
    ok("removing it never destroys the token's texture", destroyed.length > 0 && destroyed.every(o => !o?.texture && !o?.baseTexture));
  }
  B.document.ring = { enabled: true }; B.actor.statuses = new Set(["petrified"]); run(2);
  ok("token rings: no art copy (heavy wash instead)", !(fxs(B)[0].children[0] instanceof Sprite));
  delete B.document.ring; delete PIXI.Sprite; delete PIXI.ColorMatrixFilter; delete B.mesh.texture;
  B.actor.statuses = new Set(); run(1);

  B.actor.statuses = new Set(["paralyzed"]); run(2);
  ok("paralyzed -> electric arcs (rank 5.5)", fxs(B).length === 1 && fxs(B)[0]._mgRank === 5.5);
  { const fx = fxs(B)[0]; const core = fx.children[2];
    ok("bolts drawn (glow and white core)", core.calls.includes("lineTo") && fx.children[1].calls.includes("lineTo"));
    ok("arcs stay valid over time", valid());
    ok("cold blue cast on the art", (B.mesh.tint & 255) >= ((B.mesh.tint >> 16) & 255)); }
  { const core = fxs(B)[0].children[2]; core.paths = [];
    core.clear = function () { this.paths = []; return Graphics.prototype.clear.call(this); };
    core.moveTo = function (x, y) { this.paths.push([[x, y]]); return Graphics.prototype.moveTo.call(this, x, y); };
    core.lineTo = function (x, y) { this.paths.at(-1)?.push([x, y]); return Graphics.prototype.lineTo.call(this, x, y); };
    const realNow = performance.now; let clk = realNow.call(performance); performance.now = () => clk;
    const step = ms => { for (let t = 0; t < ms; t += 17) { clk += 17; tick(); } };
    // wait for a fresh shape, then past its fade-in
    const sig = () => core.paths.map(p => p.length).join(",") + "|" + core.paths.map(p => p[0].map(v => v.toFixed(0)).join(":")).join(";");
    let s0 = sig(), waited = 0; while (sig() === s0 && waited < 3000) { step(17); waited += 17; }
    step(400);
    const held = core.paths.map(p => p.map(q => [...q]));
    let maxMove = 0, samePaths = true;
    for (let i = 0; i < 20; i++) { step(17);
      if (core.paths.length !== held.length || core.paths.some((p, k) => p.length !== held[k].length)) { samePaths = false; break; }
      core.paths.forEach((p, k) => p.forEach(([x, y], j) => { maxMove = Math.max(maxMove, Math.hypot(x - held[k][j][0], y - held[k][j][1])); }));
    }
    ok("paralyzed: a held arc keeps its shape, only swaying slightly", samePaths && maxMove > 0 && maxMove < 50 * 0.05);
    ok("one arc, with at most one fork", held.length >= 1 && held.length <= 2 && held[0].length === 17);
    const lead = () => core.paths[0]?.[0]?.map(v => v.toFixed(1)).join(":");
    let last = lead(), reforms = 0;
    for (let t = 0; t < 6000; t += 17) { step(17); const now = lead(); if (now !== last) { reforms++; last = now; } }
    ok(`…then fades into a new shape about once a second (${reforms} in 6 s)`, reforms >= 3 && reforms <= 8);
    let inside = true; for (let i = 0; i < 120; i++) { step(17); if (!core.paths.flat().every(([x, y]) => Math.hypot(x - 50, y - 50) <= 50 * 1.25)) inside = false; }
    ok("arcs stay within the art (forks clamped)", inside);
    performance.now = realNow; }
  B.actor.statuses = new Set(); run(1);

  B.actor.statuses = new Set(["diseased"]); run(2);
  ok("diseased -> sores (rank 4.1)", fxs(B).length === 1 && fxs(B)[0]._mgRank === 4.1);
  { const [miasma, blotches, pustules] = fxs(B)[0].children;
    const perFrame = g => { const i = g.calls.lastIndexOf("clear"); return g.calls.slice(i + 1); };
    ok("six sores with pustules", blotches.calls.filter(c => c === "drawEllipse").length === 6 && perFrame(pustules).filter(c => c === "drawCircle").length >= 6);
    ok("no flies: just the sores and a rising haze", fxs(B)[0].children.length === 3 && perFrame(miasma).includes("drawCircle"));
    ok("disease stays valid over time", valid());
    ok("sallow, jaundiced tint", ((B.mesh.tint >> 16) & 255) > (B.mesh.tint & 255) && ((B.mesh.tint >> 8) & 255) > (B.mesh.tint & 255)); }
  B.actor.statuses = new Set(["diseased", "poisoned", "bleeding"]); run(1);
  ok("disease sits just above poison and bleeding", JSON.stringify(fxs(B).map(c => c._mgRank)) === "[4,4,4.1]");

  B.actor.statuses = new Set(["cursed"]); run(2);
  ok("cursed -> dark swirl (rank 2.4)", fxs(B).length === 1 && fxs(B)[0]._mgRank === 2.4);
  { const fx = fxs(B)[0]; const [shadow, ring1, ring2, motes] = fx.children;
    ok("two smoky rings of streaks, a soft shadow and motes", ring1.children.length === 2 && ring2.children.length === 2 && ring1.children[0].calls.filter(c => c === "lineTo").length === 80 && shadow.calls.includes("drawCircle") && motes.calls.includes("drawCircle"));
    const realNow = performance.now; let clk = realNow.call(performance); performance.now = () => clk;
    clk += 17; tick(); const a0 = ring1.rotation, b0 = ring2.rotation; clk += 1000; tick();
    const da = ring1.rotation - a0, db = ring2.rotation - b0;
    ok("the rings turn slowly, the outer one slower", da > 0 && db > 0 && da < 1.2 && db < da);
    ok("swirl centred on the art", ring1.x === 50 && ring1.y === 50);
    performance.now = realNow;
    ok("swirl stays valid over time", valid());
    ok("the art is dimmed slightly", B.mesh.tint !== 0xFFFFFF && ((B.mesh.tint >> 16) & 255) > 200); }
  B.actor.statuses = new Set(["incapacitated"]); run(1);
  ok("incapacitated no longer gets the swirl", !fxs(B).some(c => c._mgRank === 2.4));
  B.actor.statuses = new Set(["dnd5e.cursed"]); run(1);
  ok("prefixed 'cursed' detected", fxs(B).length === 1 && fxs(B)[0]._mgRank === 2.4);
  B.actor.statuses = new Set(["uncursed", "cursedblade"]); run(1);
  ok("cursed lookalikes ignored", fxs(B).length === 0);

  // Incapacitated: drained and fading
  B.actor.statuses = new Set(["incapacitated"]); run(2);
  ok("incapacitated -> drained and fading (rank 0.3, on the art)", fxs(B).length === 1 && fxs(B)[0]._mgRank === 0.3);
  { const realNow = performance.now; let clk = realNow.call(performance); performance.now = () => clk;
    const [wash, pulse] = fxs(B)[0].children;
    const alphas = []; let pulses = 0, strongest = 0, prevDrawn = false;
    for (let t = 0; t < 12000; t += 50) { clk += 50; tick(); alphas.push(B.mesh.alpha);
      const drawn = pulse.calls.lastIndexOf("drawCircle") > pulse.calls.lastIndexOf("clear");
      if (drawn && !prevDrawn) pulses++; prevDrawn = drawn; }
    const lo = Math.min(...alphas), hi = Math.max(...alphas);
    ok(`fades in and out, barely there at its faintest (${lo.toFixed(2)} to ${hi.toFixed(2)})`, lo >= 0.38 && lo < 0.5 && hi > 0.75 && hi <= 0.86);
    let fastest = 0; for (let i = 1; i < alphas.length; i++) fastest = Math.max(fastest, Math.abs(alphas[i] - alphas[i - 1]));
    ok("the fade is slow and smooth", fastest < 0.05);
    ok(`a weak heartbeat pulses now and then (${pulses} beats in 12 s)`, pulses >= 3 && pulses <= 5);
    ok("no art copy available: a grey wash over the art, fading with it", wash.calls.includes("drawCircle") && wash.alpha > 0 && wash.alpha < 0.5);
    ok("colour drained (grey tint)", ((B.mesh.tint >> 16) & 255) < 215 && Math.abs(((B.mesh.tint >> 16) & 255) - ((B.mesh.tint >> 8) & 255)) < 3);
    performance.now = realNow;
    ok("drained look stays valid over time", valid()); }
  { // with sprites: a grey copy of the token's own art that fades, the coloured art mostly hidden under it
    class Sprite extends Obs { constructor(t){ super(); this.texture = t; this.anchor = { set: () => {} }; this.scale = { set: (a, b) => { this._s = [a, b ?? a]; } }; } }
    class ColorMatrixFilter { constructor(){ this.matrix = null; } destroy(){} }
    PIXI.Sprite = Sprite; PIXI.ColorMatrixFilter = ColorMatrixFilter; B.mesh.texture = { width: 100, height: 100 };
    B.actor.statuses = new Set(); run(1); B.actor.statuses = new Set(["incapacitated"]); run(2);
    const grey = fxs(B)[0].children[0];
    ok("grey copy of the token's own art", grey instanceof Sprite && grey.texture === B.mesh.texture);
    const m = grey.filters[0].matrix;
    ok("…greyscale (each colour from the art's brightness)", m[0] / m[1] === 0.299 / 0.587 && Math.abs(m[5] / m[6] - 0.299 / 0.587) < 1e-9 && m[18] === 1);
    ok("…which fades, with the coloured art mostly hidden under it", grey.alpha >= 0.38 && grey.alpha <= 0.86 && Math.abs(B.mesh.alpha - grey.alpha * 0.3) < 1e-6);
    delete PIXI.Sprite; delete PIXI.ColorMatrixFilter; delete B.mesh.texture;
    B.actor.statuses = new Set(); run(1); }
  for (const other of ["stunned", "paralyzed", "petrified", "unconscious"]) {
    B.actor.statuses = new Set(["incapacitated", other]); run(1);
    if (fxs(B).some(c => c._mgRank === 0.3)) ok(`not drained when also ${other}`, false);
  }
  ok("not drained when also Stunned, Paralyzed, Petrified or Unconscious (their own animation shows)", true);
  B.actor.statuses = new Set(["incapacitated", "cursed", "slowed"]); run(1);
  ok("drained, curse and Slow all show together, distinct layers", JSON.stringify(fxs(B).map(c => c._mgRank)) === "[0.3,1,2.4]");
  B.actor.statuses = new Set(["capacitated", "incapacitatedish"]); run(1);
  ok("incapacitated lookalikes ignored", fxs(B).length === 0);

  // Marked: crosshairs
  { const realNow = performance.now; let clk = realNow.call(performance); performance.now = () => clk;
    B.actor.statuses = new Set(["marked"]); clk += 17; run(1);
    ok("marked -> crosshairs (rank 7.5, over most effects)", fxs(B).length === 1 && fxs(B)[0]._mgRank === 7.5);
    const [glow, reticle, brackets] = fxs(B)[0].children;
    ok("a ring, a cross with a gap and a centre dot, with a dark edge", reticle.children[1].calls.filter(c => c === "lineTo").length === 8 && reticle.children[1].calls.filter(c => c === "drawCircle").length === 2 && reticle.children[0].calls.includes("lineTo"));
    ok("four corner brackets", brackets.children[1].calls.filter(c => c === "moveTo").length === 4);
    const startScale = brackets._s?.[0] ?? 1;
    for (let i = 0; i < 60; i++) { clk += 17; tick(); }
    const lockedScale = brackets._s?.[0] ?? 1;
    ok(`brackets close in when the mark is applied (${startScale.toFixed(2)} -> ${lockedScale.toFixed(2)})`, startScale > 1.25 && lockedScale < 1.05);
    const a0 = brackets.rotation; clk += 1000; tick(); const turned = brackets.rotation - a0;
    ok("then turn slowly", turned > 0 && turned < 0.4);
    ok("crosshairs centred on the art", reticle.x === 50 && reticle.y === 50);
    ok("the art itself is left alone", B.mesh.tint === 0xFFFFFF && B.mesh.alpha === 1);
    performance.now = realNow; }
  ok("crosshairs stay valid over time", valid());
  B.actor.statuses = new Set(["marked", "stunned", "burning"]); run(1);
  ok("crosshairs draw over stars and flames", JSON.stringify(fxs(B).map(c => c._mgRank)) === "[5,7,7.5]");

  // Dodging: afterimages
  B.actor.statuses = new Set(["dodging"]); run(2);
  ok("dodging -> afterimages (rank -0.5, just over the art)", fxs(B).length === 1 && fxs(B)[0]._mgRank === -0.5);
  { const [g1, g2] = fxs(B)[0].children;
    ok("no art copy available: two blurred outline afterimages", fxs(B)[0].children.length === 2 && g1.calls.includes("drawCircle") && g1.filters?.length === 1);
    const realNow = performance.now; let clk = realNow.call(performance); performance.now = () => clk;
    const xs1 = [], xs2 = [];
    for (let t = 0; t < 3600; t += 50) { clk += 50; tick(); xs1.push(g1.x); xs2.push(g2.x); }
    ok("one slips to each side", Math.min(...xs1) > 50 && Math.max(...xs2) < 50);
    ok("they weave side to side", Math.max(...xs1) - Math.min(...xs1) > 5 && Math.max(...xs2) - Math.min(...xs2) > 5);
    let fastest = 0; for (let i = 1; i < xs1.length; i++) fastest = Math.max(fastest, Math.abs(xs1[i] - xs1[i - 1]));
    ok("smoothly, not jittery", fastest < 3);
    ok("faint (see-through) afterimages", g1.alpha < 0.5 && g2.alpha < 0.5 && g1.alpha > 0.15);
    ok("the creature itself turns a little see-through", Math.abs(B.mesh.alpha - 0.85) < 1e-9);
    performance.now = realNow; }
  { class Sprite extends Obs { constructor(t){ super(); this.texture = t; this.anchor = { set: () => {} }; this.scale = { set: (a, b) => { this._s = [a, b ?? a]; } }; } }
    PIXI.Sprite = Sprite; B.mesh.texture = { width: 100, height: 100 };
    B.actor.statuses = new Set(); run(1); B.actor.statuses = new Set(["dodging"]); run(2);
    const [g1, g2] = fxs(B)[0].children;
    ok("with sprites: the afterimages are copies of the token's own art", g1 instanceof Sprite && g2 instanceof Sprite && g1.texture === B.mesh.texture && !g1.filters.some(f => f.matrix));
    ok("…offset to either side of it", g1.x > 50 && g2.x < 50 && g1.y === 50);
    ok("…and blurred", g1.filters[0].blur >= 1);
    delete PIXI.Sprite; delete B.mesh.texture; B.actor.statuses = new Set(); run(1); }
  ok("afterimages stay valid over time", (B.actor.statuses = new Set(["dodging"]), run(1), valid()));
  B.actor.statuses = new Set(["dodge", "pf2e.marked"]); run(1);
  ok("'dodge' and prefixed 'marked' detected", JSON.stringify(fxs(B).map(c => c._mgRank)) === "[-0.5,7.5]");
  B.actor.statuses = new Set(["unmarked", "dodgeball", "remarked"]); run(1);
  ok("marked/dodging lookalikes ignored", fxs(B).length === 0);

  // Bloodied: blood splatters
  { const realNow = performance.now; let clk = realNow.call(performance); performance.now = () => clk;
    B.actor.statuses = new Set(["bloodied"]); clk += 17; run(1);
    ok("bloodied -> blood splatters (rank 0.1, on the art)", fxs(B).length === 1 && fxs(B)[0]._mgRank === 0.1);
    const fx = fxs(B)[0]; const [smear, ...groups] = fx.children;
    ok(`3 to 5 splatters and a smear (${groups.length})`, groups.length >= 3 && groups.length <= 5 && smear.calls.includes("drawPolygon"));
    ok("each splatter: a blob with a darker edge, flung droplets and a wet highlight", groups.every(g => g.children[1].calls.filter(c => c === "drawPolygon").length >= 3 && g.children[0].calls.includes("drawPolygon") && g.children[2].calls.includes("drawEllipse")));
    const startScale = groups[0]._s?.[0] ?? 1;
    for (let i = 0; i < 25; i++) { clk += 17; tick(); }
    ok(`they splash in (${startScale.toFixed(2)} -> ${groups[0]._s[0].toFixed(2)})`, startScale < 0.75 && Math.abs(groups[0]._s[0] - 1) < 0.02);
    ok("splatters sit on the art", groups.every(g => Math.hypot(g.x - 50, g.y - 50) <= 50 * 0.7));
    const a0 = groups[0].children[2].alpha; clk += 2000; tick(); const a1 = groups[0].children[2].alpha;
    ok("the wet sheen glints slowly", a0 !== a1 && Math.max(a0, a1) < 0.35);
    ok("the art takes a faint red cast", ((B.mesh.tint >> 16) & 255) > ((B.mesh.tint >> 8) & 255));
    performance.now = realNow; }
  { const pos = () => fxs(B)[0].children.slice(1).map(g => `${g.x.toFixed(1)},${g.y.toFixed(1)}`).join(" ");
    const first = pos(); B.actor.statuses = new Set(); run(1); B.actor.statuses = new Set(["bloodied"]); run(30);
    ok("each creature keeps its own pattern", pos() === first);
    A.actor.statuses = new Set(["bloodied"]); run(30);
    const other = fxs(A)[0].children.slice(1).map(g => `${g.x.toFixed(1)},${g.y.toFixed(1)}`).join(" ");
    ok("…and different creatures get different ones", other !== first);
    A.actor.statuses = new Set(); run(1); }
  ok("splatters stay valid over time", valid());
  B.actor.system = { attributes: { hp: { value: 0, max: 20 }, death: { failure: 0 } } }; B.actor.statuses = new Set(["bloodied", "unconscious"]); run(1);
  ok("hidden while dying (the skull shows)", !fxs(B).some(c => c._mgRank === 0.1) && fxs(B).some(c => c._mgRank === 7.8));
  B.actor.system.attributes.hp.value = 4; run(1);
  ok("…and back once healed", fxs(B).some(c => c._mgRank === 0.1));
  B.actor.statuses = new Set(["bloodied", "dead"]); run(1);
  ok("hidden when dead", !fxs(B).some(c => c._mgRank === 0.1));
  delete B.actor.system;
  B.actor.statuses = new Set(["bloodied", "bleeding"]); run(1);
  ok("splatters under Bleeding's drips", JSON.stringify(fxs(B).map(c => c._mgRank)) === "[0.1,4]");
  B.actor.statuses = new Set(["unbloodied", "bloodiedless"]); run(1);
  ok("bloodied lookalikes ignored", fxs(B).length === 0);
  B.actor.statuses = new Set(); run(1);

  // Prone: dust and chevrons
  { const realNow = performance.now; let clk = realNow.call(performance); performance.now = () => clk;
    B.actor.statuses = new Set(["prone"]); clk += 17; run(1);
    ok("prone -> dust and chevrons (rank 2.1)", fxs(B).length === 1 && fxs(B)[0]._mgRank === 2.1);
    const [dust, specks, ...chevrons] = fxs(B)[0].children;
    ok("six dust puffs, specks and three chevrons with a dark edge", dust.children.length === 6 && chevrons.length === 3 && chevrons.every(c => c.children.length === 2 && c.children[1].calls.filter(m => m === "lineTo").length === 2));
    const puffStart = dust.children[0].alpha; for (let i = 0; i < 90; i++) { clk += 17; tick(); }
    const puffRest = dust.children[0].alpha;
    ok(`the dust puffs up, then settles into a low haze (${puffStart.toFixed(2)} -> ${puffRest.toFixed(2)})`, puffStart > puffRest + 0.2 && puffRest < 0.4 && puffRest > 0.2);
    ok("dust sits at the creature's base", dust.children.every(g => g.y > 50 + 50 * 0.7));
    const brightest = () => chevrons.reduce((b, c, i) => c.alpha > chevrons[b].alpha ? i : b, 0);
    const order = []; for (let t = 0; t < 2400; t += 60) { clk += 60; tick(); const b = brightest(); if (order.at(-1) !== b) order.push(b); }
    ok(`chevrons light up in turn, top to bottom (${order.join(",")})`, order.join(",").includes("0,1,2"));
    ok("faint (never solid)", chevrons.every(c => c.alpha <= 0.75));
    ok("chevrons point down over the lower half of the art", chevrons.every(c => c.y > 50) && chevrons[0].y < chevrons[2].y);
    ok("the art itself is left alone", B.mesh.tint === 0xFFFFFF && B.mesh.alpha === 1);
    performance.now = realNow; }
  ok("prone dust stays valid over time", valid());
  B.actor.statuses = new Set(["prone", "unconscious"]); run(1);
  ok("unconscious and prone: Z's and dust together", fxs(B).some(c => c._mgRank === 8) && fxs(B).some(c => c._mgRank === 2.1));
  B.actor.system = { attributes: { hp: { value: 0, max: 20 }, death: { failure: 0 } } }; run(1);
  ok("hidden while dying", !fxs(B).some(c => c._mgRank === 2.1));
  delete B.actor.system; B.actor.statuses = new Set(["prone", "dead"]); run(1);
  ok("hidden when dead", !fxs(B).some(c => c._mgRank === 2.1));
  B.actor.statuses = new Set(["pf2e.prone"]); run(1); ok("prefixed 'prone' detected", fxs(B).length === 1);
  B.actor.statuses = new Set(["unprone", "pronex"]); run(1); ok("prone lookalikes ignored", fxs(B).length === 0);
  B.actor.statuses = new Set(); run(1);

  // Dying: 0 HP
  { const hp = (value, failure = 0, max = 20) => { B.actor.system = { attributes: { hp: { value, max }, death: { success: 0, failure } } }; };
    const realNow = performance.now; let clk = realNow.call(performance); performance.now = () => clk;
    hp(0); B.actor.statuses = new Set(["unconscious", "prone"]); clk += 17; run(2);
    ok("0 HP: the dying skull (rank 7.8)", fxs(B).some(c => c._mgRank === 7.8));
    ok("…instead of the Unconscious Z's", !fxs(B).some(c => c._mgRank === 8));
    const skullLayer = () => fxs(B).find(c => c._mgRank === 7.8).children[0];
    ok("a skull is drawn even before (or without) the skull image", skullLayer().children[0].calls.includes("drawEllipse") && skullLayer().children[0].tint === 0xC8102E);
    ok("…filling the token, centred", skullLayer().x === 50 && skullLayer().y === 50 && Math.abs(skullLayer().children[0]._s[0] - 0.95) < 1e-9);
    const measure = () => { let lo = 1, hi = 0; for (let t = 0; t < 6000; t += 40) { clk += 40; tick(); const a = skullLayer().alpha; lo = Math.min(lo, a); hi = Math.max(hi, a); } return [lo, hi]; };
    const [lo0, hi0] = measure();
    ok(`it pulses faintly (${lo0.toFixed(2)} to ${hi0.toFixed(2)})`, lo0 < 0.15 && hi0 > 0.3 && hi0 < 0.45);
    const beats = f => { hp(0, f); let n = 0, prev = 0, rising = false; for (let t = 0; t < 12000; t += 40) { clk += 40; tick(); const a = skullLayer().alpha; if (a > prev && !rising) { n++; rising = true; } else if (a < prev) rising = false; prev = a; } return n; };
    const [, hi2] = (hp(0, 2), measure());
    ok(`stronger with failed death saves (peak ${hi0.toFixed(2)} -> ${hi2.toFixed(2)} at two)`, hi2 > hi0 + 0.1 && hi2 < 0.6);
    const b0 = beats(0), b2 = beats(2);
    ok(`…and quicker (${b0} -> ${b2} pulses in 12 s)`, b2 > b0);
    ok("the creature looks a little pale", B.mesh.tint !== 0xFFFFFF && ((B.mesh.tint >> 16) & 255) > ((B.mesh.tint >> 8) & 255));
    // three failed death saves: the solid Dead skull
    hp(0, 2); for (let i = 0; i < 10; i++) { clk += 40; tick(); }
    hp(0, 3); clk += 40; tick(); const startA = skullLayer().alpha;
    for (let i = 0; i < 20; i++) { clk += 40; tick(); }
    const settled = []; for (let i = 0; i < 60; i++) { clk += 40; tick(); settled.push(skullLayer().alpha); }
    ok(`three failed death saves: settles into the solid Dead skull (${startA.toFixed(2)} -> ${settled[0].toFixed(2)})`, settled.every(a => Math.abs(a - 0.9) < 1e-6));
    ok("…no longer pulsing, at full size", Math.abs(skullLayer().children[0]._s[0] - 1) < 1e-9 && skullLayer()._s?.[0] === 1);
    ok("…and the Z's stay away", !fxs(B).some(c => c._mgRank === 8));
    { const fx0 = fxs(B).find(c => c._mgRank === 7.8); hp(0, 3); clk += 40; tick();
      ok("the change is a short fade, not a jump", startA < 0.7); }
    hp(0, 2); for (let i = 0; i < 80; i++) { clk += 40; tick(); }
    { let lo = 1, hi = 0; for (let i = 0; i < 100; i++) { clk += 40; tick(); lo = Math.min(lo, skullLayer().alpha); hi = Math.max(hi, skullLayer().alpha); }
      ok("back to two failures (corrected): pulsing again", hi - lo > 0.2); }
    B.actor.statuses = new Set(["unconscious", "stable"]); run(1);
    ok("stable at 0 HP: back to the Z's, no skull", fxs(B).some(c => c._mgRank === 8) && !fxs(B).some(c => c._mgRank === 7.8));
    B.actor.statuses = new Set(["unconscious", "dead"]); run(1);
    ok("dead: neither the dying skull nor Z's", !fxs(B).some(c => c._mgRank === 7.8 || c._mgRank === 8));
    hp(5); B.actor.statuses = new Set(["unconscious"]); run(1);
    ok("healed above 0 HP: no skull (Z's for Unconscious again)", !fxs(B).some(c => c._mgRank === 7.8) && fxs(B).some(c => c._mgRank === 8));
    hp(0, 0, 0); B.actor.statuses = new Set(); run(1);
    ok("creatures without Hit Points (max 0) never count as dying", fxs(B).length === 0);
    hp(0); settings.set("dyingFx", false); B.actor.statuses = new Set(["unconscious"]); run(1);
    ok("dying setting off: the Z's as usual at 0 HP", fxs(B).some(c => c._mgRank === 8) && !fxs(B).some(c => c._mgRank === 7.8));
    settings.set("dyingFx", true); run(1);
    ok("dying skull stays valid over time", valid());
    // A monster at 0 HP: the solid Dead skull straight away, no pulsing
    B.actor.type = "npc"; B.actor.hasPlayerOwner = false; hp(0); B.actor.statuses = new Set(["unconscious"]);
    B.children.filter(c => c._mgRank === 7.8).forEach(c => c.destroy({ children: true })); clk += 17; tick();
    { const first = skullLayer().alpha; const seen = []; for (let i = 0; i < 80; i++) { clk += 40; tick(); seen.push(skullLayer().alpha); }
      ok(`a monster at 0 HP shows the solid Dead skull at once (${first.toFixed(2)}), not pulsing`, Math.abs(first - 0.9) < 1e-6 && seen.every(a => Math.abs(a - 0.9) < 1e-6));
      ok("…at full size, with no pale look and no Z's", Math.abs(skullLayer().children[0]._s[0] - 1) < 1e-9 && B.mesh.tint === 0xFFFFFF && !fxs(B).some(c => c._mgRank === 8)); }
    B.actor.hasPlayerOwner = true; B.children.filter(c => c._mgRank === 7.8).forEach(c => c.destroy({ children: true })); clk += 17; tick();
    { let lo = 1, hi = 0; for (let i = 0; i < 100; i++) { clk += 40; tick(); lo = Math.min(lo, skullLayer().alpha); hi = Math.max(hi, skullLayer().alpha); }
      ok("an NPC a player owns (a wild shape, a companion) pulses like a player character", hi - lo > 0.2); }
    delete B.actor.type; delete B.actor.hasPlayerOwner;
    performance.now = realNow;
    delete B.actor.system; B.actor.statuses = new Set(); run(1); }

  for (const [k, st] of [["petrifiedFx", "petrified"], ["paralyzedFx", "paralyzed"], ["diseasedFx", "diseased"], ["sleepZs", "unconscious"], ["incapacitatedFx", "incapacitated"], ["cursedFx", "cursed"], ["markedFx", "marked"], ["dodgingFx", "dodging"], ["bloodiedFx", "bloodied"], ["proneFx", "prone"]]) {
    settings.set(k, false); B.actor.statuses = new Set([st]); run(1);
    ok(`${k} off hides it (${st})`, fxs(B).length === 0); settings.set(k, true);
  }
  B.actor.statuses = new Set(["dnd5e.petrified", "paralysed", "pf2e.diseased"]); run(1);
  ok("prefixed and British spellings detected", JSON.stringify(fxs(B).map(c => c._mgRank)) === "[-1,4.1,5.5]");
  B.actor.statuses = new Set(["unparalyzed", "disease-immune", "semiconscious", "petrifiedgaze"]); run(1);
  ok("lookalike IDs ignored (new conditions)", fxs(B).length === 0);
  B.actor.statuses = new Set(); run(1);
}

// Effects follow the token's art size (texture scale / rendered mesh), not the grid square
{
  const S = new Token("tokS"); canvas.tokens.placeables.push(S);
  S.document.texture.scaleX = 0.5; S.document.texture.scaleY = 0.5;
  S.actor.statuses = new Set(["restrained"]); run(2);
  const c = fxs(S)[0];
  ok("scaled art (0.5): effect centred on the art", c.x === 25 && c.y === 25);
  S.actor.statuses = new Set(["mighty-guard"]); run(2);
  const g = fxs(S)[0];
  const aura = g.children[1];
  ok("scaled art (0.5): effect drawn at half size", aura.calls.includes("drawEllipse"));
  // rendered mesh takes precedence: 60px art centred on the token
  S.x = 200; S.y = 300; S.mesh.width = 60; S.mesh.height = 60; S.mesh.position = { x: 250, y: 350 }; S.mesh.anchor = { x: 0.5, y: 0.5 };
  run(1);
  ok("rendered mesh size and position used (60px art)", fxs(S)[0].x === 20 && fxs(S)[0].y === 20);
  // art offset to the right by 10px
  S.mesh.position = { x: 260, y: 350 }; run(1);
  ok("art offset is followed", fxs(S)[0].x === 30 && fxs(S)[0].y === 20);
  // nonsense mesh position falls back to the token centre
  S.mesh.position = { x: 99999, y: 350 }; run(1);
  ok("implausible mesh position ignored", fxs(S)[0].x === 20);
  // mirrored art (negative scale) still sized correctly
  delete S.mesh.width; delete S.mesh.height; S.mesh.position = undefined; S.document.texture.scaleX = -0.6; S.document.texture.scaleY = 0.6; run(1);
  ok("mirrored art handled", Math.abs(fxs(S)[0].x - 20) < 1e-9);
  S.actor.statuses = new Set(); run(1);
  canvas.tokens.placeables.pop();
}

// Status icons on tokens: hidden for animated statuses
{
  const draw = (tok, src) => TokenObj.prototype._drawEffect.call(tok, src);
  const eff = (statuses, img, extra={}) => ({ statuses:new Set(statuses), img, disabled:false, ...extra });
  const T = { actor: { statuses:new Set(["bleeding","blinded","hasted"]), effects:[
    eff(["bleeding"], "icons/bleeding.svg"), eff(["blinded"], "icons/prone.svg"), eff(["hasted"], "modules/primal-status/icons/haste.svg") ] } };
  ok("animated status icon (bleeding) is skipped", (await draw(T, "icons/bleeding.svg")) === null);
  ok("module status icon (haste) is skipped", (await draw(T, "modules/primal-status/icons/haste.svg")) === null);
  ok("non-animated status icon (blinded) still drawn", (await draw(T, "icons/prone.svg"))?.src === "icons/prone.svg");
  T.actor.effects.push(eff([], "icons/hasted-spell.webp", { name:"Hasted" }));
  ok("dnd5e 'Hasted' spell effect icon skipped", (await draw(T, "icons/hasted-spell.webp")) === null);
  T.actor.effects.push(eff(["coverHalf"], "icons/cover-half.svg"), eff(["concentrating"], "icons/conc.svg"), eff(["frightened"], "icons/fear.svg"));
  ok("cover, concentration and frightened icons skipped", (await draw(T, "icons/cover-half.svg")) === null && (await draw(T, "icons/conc.svg")) === null && (await draw(T, "icons/fear.svg")) === null);
  T.actor.effects.push(eff(["petrified"], "icons/petrified.svg"), eff(["paralyzed","incapacitated"], "icons/paralyzed.svg"), eff(["diseased"], "icons/diseased.svg"), eff(["unconscious"], "icons/unconscious.svg"));
  T.actor.effects.push(eff(["incapacitated"], "icons/incapacitated.svg"), eff(["cursed"], "icons/cursed.svg"), eff(["marked"], "icons/marked.svg"), eff(["dodging"], "icons/dodging.svg"));
  ok("marked and dodging icons skipped", (await draw(T, "icons/marked.svg")) === null && (await draw(T, "icons/dodging.svg")) === null);
  ok("incapacitated and cursed icons skipped", (await draw(T, "icons/incapacitated.svg")) === null && (await draw(T, "icons/cursed.svg")) === null);
  ok("petrified, paralyzed, diseased and unconscious icons skipped", (await draw(T, "icons/petrified.svg")) === null && (await draw(T, "icons/paralyzed.svg")) === null && (await draw(T, "icons/diseased.svg")) === null && (await draw(T, "icons/unconscious.svg")) === null);
  T.actor.effects.push(eff(["bloodied"], "icons/bloodied-own.svg"));
  ok("Bloodied icon skipped (its splatters show instead)", (await draw(T, "icons/bloodied-own.svg")) === null);
  T.actor.effects.push(eff(["hiding"], "icons/hiding.svg"));
  ok("Hiding icon skipped (its fog shows instead)", (await draw(T, "icons/hiding.svg")) === null);
  T.actor.effects.push(eff(["bleeding"], "icons/disabled.svg", { disabled:true }));
  ok("disabled effect's icon not affected", (await draw(T, "icons/disabled.svg"))?.src === "icons/disabled.svg");
  settings.set("bleedingFx", false);
  ok("turning the bleeding animation off brings its icon back", (await draw(T, "icons/bleeding.svg"))?.src === "icons/bleeding.svg");
  settings.set("bleedingFx", true);
  settings.set("hideAnimatedIcons", false);
  ok("master setting off: all icons drawn", (await draw(T, "icons/bleeding.svg"))?.src === "icons/bleeding.svg");
  settings.set("hideAnimatedIcons", true);
  ok("animation settings redraw icons when changed", typeof settingsCfg.get("primal-status.bleedingFx").onChange === "function" && typeof settingsCfg.get("primal-status.hideAnimatedIcons").onChange === "function");
  let redraws = 0; const RT = { constructor:{ RENDER_FLAGS:{ redrawEffects:{} } }, renderFlags:{ set:f=>{ if (f.redrawEffects) redraws++; } } };
  canvas.tokens.placeables.push(RT); settingsCfg.get("primal-status.stunnedFx").onChange(false); canvas.tokens.placeables.pop();
  ok("changing an animation setting triggers an icon redraw", redraws === 1);
  ok("token with no actor draws normally", (await draw({ actor:null }, "x.svg"))?.src === "x.svg");
  // Foundry's _drawEffects chains .then() on each call, so even skipped icons must return a promise
  const raw = TokenObj.prototype._drawEffect.call(T, "icons/bleeding.svg");
  ok("skipped icon still returns a promise", raw && typeof raw.then === "function");
  let threw = null;
  try {
    const promises = [];
    for (const [i, img] of ["icons/bleeding.svg", "icons/prone.svg"].entries()) {
      promises.push(TokenObj.prototype._drawEffect.call(T, img).then(e => { if (e) e.zIndex = i; }));
    }
    await Promise.allSettled(promises);
  } catch (err) { threw = err; }
  ok("Foundry-style _drawEffects chaining doesn't throw", threw === null);
}

// Grappled: clawed hand
B.actor.effects=[]; B.actor.statuses=new Set(["grappled"]); run(2);
ok("grappled -> hand layer (rank 3.2)", fxs(B).length===1 && fxs(B)[0]._mgRank===3.2);
{ let valid = true; for (let i=0;i<240;i++){ tick(); if (!allFinite(fxs(B)[0])) valid = false; } ok("hand stays valid over time", valid); }
ok("grappled leaves the art untouched (no squeeze)", B.mesh.tint===0xFFFFFF && B.mesh.alpha===1);
B.actor.statuses=new Set(["ungrappled"]); run(1); ok("'ungrappled' isn't grappled", fxs(B).length===0);
settings.set("grappledFx", false); B.actor.statuses=new Set(["grappled"]); run(1); ok("grappledFx off hides it", fxs(B).length===0); settings.set("grappledFx", true);
B.actor.statuses=new Set(["grappled","restrained","stunned"]); run(1);
ok("hand sits above rope, below stars", JSON.stringify(fxs(B).map(c=>c._mgRank))==="[3,3.2,7]");
B.actor.statuses=new Set(); run(1);
// Grappled: bundled art by default, custom image, or drawn talons when cleared
{
  const loads = [];
  foundry.canvas = { loadTexture: src => { loads.push(src); return Promise.resolve({ width: 1024, height: 1024 }); } };
  class Sprite extends Obs { constructor(tex){ super(); this.texture = tex; this.anchor = { set(){} }; this.tint = 0xFFFFFF; } }
  class ColorMatrixFilter { constructor(){ this.matrix = []; } destroy(){} }
  PIXI.Sprite = Sprite; PIXI.ColorMatrixFilter = ColorMatrixFilter;
  const change = v => { settings.set("grappleImagePath", v); settingsCfg.get("primal-status.grappleImagePath").onChange(v); };
  B.actor.statuses = new Set(["grappled"]); change(settingsCfg.get("primal-status.grappleImagePath").default); run(1);
  await new Promise(r => setTimeout(r, 0)); run(2);
  // earlier bundled art paths upgrade to the new hand
  change("modules/primal-status/images/grapple-claws-hollow.webp"); run(1); await new Promise(r => setTimeout(r, 0)); run(1);
  ok("earlier bundled art switches to the new hand", loads.filter(x => x.endsWith("grapple-hand.webp")).length >= 2 && !loads.includes("modules/primal-status/images/grapple-claws-hollow.webp"));
  ok("bundled clawed-hand art used by default", loads.includes("modules/primal-status/images/grapple-hand.webp") && fxs(B)[0].children[0].children.length === 1);
  const [sprite] = fxs(B)[0].children[0].children;
  ok("no red glow: just the art, unfiltered", !sprite.filters && sprite.blendMode !== 1);
  { const exp = 50 * 0.82 / 0.312 / 1024; const s0 = sprite._s[0]; const a0 = fxs(B)[0].children[0].alpha;
    ok("unmeasured art: hand sized to the whole box", Math.abs(s0 - exp) < 1e-9 && a0 === 1);
    run(200); ok("hand is still: same size, place and opacity over time", sprite._s[0] === s0 && fxs(B)[0].children[0].x === 50 && fxs(B)[0].children[0].y === 50 && fxs(B)[0].children[0].alpha === 1 && B.mesh.tint === 0xFFFFFF); }
  {
    // 128x128 alpha: opaque circle r=40 at (64, 60), a spike poking out of the top, transparent border
    const W = 128, px = new Uint8Array(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const inC = Math.hypot(x + 0.5 - 64, y + 0.5 - 60) <= 40, spike = Math.abs(x - 64) < 3 && y > 8 && y < 30;
      if (inC || spike) px[(y * W + x) * 4 + 3] = 255;
    }
    let rendered = 0;
    PIXI.RenderTexture = { create: () => ({ destroy(){} }) };
    canvas.app.renderer = { render(){ rendered++; }, extract: { pixels: () => px } };
    B.mesh.texture = { width: 512, height: 512, baseTexture: { valid: true, uid: 77 }, frame: { x: 0, y: 0, width: 512, height: 512 } };
    run(2);
    const holder = fxs(B)[0].children[0];
    ok("hand centred on the visible art", Math.abs(holder.x - 50) < 1.5 && Math.abs(holder.y - 46.9) < 1.5);
    const exp = 31.25 * 0.82 / 0.312 / 1024;
    ok("hand sized to the visible art (transparent border and spike ignored)", Math.abs(sprite._s[0] / exp - 1) < 0.05);
    run(5); ok("art measured once per texture", rendered === 1);
    settings.set("grappleImageFit", 1.2); run(1);
    ok("size setting scales the hand", Math.abs(sprite._s[0] / (exp * 1.2) - 1) < 0.05); settings.set("grappleImageFit", 1);
    B.document.texture.scaleX = -1; run(1); ok("mirrored art: centre mirrored", Math.abs(holder.x - 50) < 1.5); delete B.document.texture.scaleX;
    B.document.ring = { enabled: true }; run(1);
    ok("dynamic token ring: full box", holder.x === 50 && Math.abs(sprite._s[0] - 50 * 0.82 / 0.312 / 1024) < 1e-9); delete B.document.ring;
    B.mesh.texture = { width: 256, height: 256, baseTexture: { valid: true, uid: 78 } };
    canvas.app.renderer = { render(){ throw new Error("gl lost"); }, extract: { pixels(){} } };
    let crashed = false; try { run(2); } catch { crashed = true; }
    ok("art measuring failure falls back to the whole box", !crashed && Math.abs(sprite._s[0] - 50 * 0.82 / 0.312 / 1024) < 1e-9);
    B.mesh.texture = { width: 256, height: 256, baseTexture: { valid: false, uid: 79 } }; run(1);
    ok("texture still loading: whole box for now", Math.abs(sprite._s[0] - 50 * 0.82 / 0.312 / 1024) < 1e-9);
    delete B.mesh.texture; delete canvas.app.renderer; delete PIXI.RenderTexture;
  }
  ok("old size setting gone, new one defaults to 1", !settingsCfg.has("primal-status.grappleImageSize") && settingsCfg.get("primal-status.grappleImageFit").default === 1);
  ok("art centred on the creature", fxs(B)[0].children[0].x > 49 && fxs(B)[0].children[0].x < 51);
  change("worlds/x/my-claws.webp"); run(1); await new Promise(r => setTimeout(r, 0)); run(1);
  ok("a custom image replaces the bundled art", loads.includes("worlds/x/my-claws.webp"));
  change(""); run(1);
  ok("clearing the image falls back to drawn talons", fxs(B)[0].children.length === 6);
  foundry.canvas = { loadTexture: () => { throw new Error("missing file"); } };
  change("nope.png");
  let crashed = false; try { run(2); await new Promise(r => setTimeout(r, 0)); run(1); } catch { crashed = true; }
  ok("a missing image doesn't break the animation loop", !crashed && fxs(B).length === 1);
  change(""); delete foundry.canvas;
  B.actor.statuses = new Set(); run(1);
}
ok("no vision wrappers registered", !CONFIG.Token.objectClass.prototype.hasOwnProperty("_getVisionBlindedStates") && !Object.getOwnPropertyDescriptor(CONFIG.Token.objectClass.prototype, "hasSight"));
{ const T = { actor: { statuses:new Set(["grappled"]), effects:[{ statuses:new Set(["grappled"]), img:"icons/grappled.svg", disabled:false }] } };
  ok("grappled token icon hidden (animated)", (await TokenObj.prototype._drawEffect.call(T, "icons/grappled.svg")) === null); }


// Contamination & Exhaustion: swirl, bloodshot cracks, Hearthstone-style counters
{
  // a simulated 60 fps clock for the eased / growing parts
  const realNow = performance.now.bind(performance); let clock = realNow();
  performance.now = () => clock;
  const run = n => { for (let i = 0; i < n; i++) { clock += 1000 / 60; tick(); } };
  ok("contamination registered (own id without system levels)", se.contamination && se.contamination._id === "mgcontamination0" && se.contamination.img === "modules/primal-status/icons/contamination.svg" && se.contamination.description === "L:MIGHTYGUARD.Desc.Contamination");
  const lvl = (id, n) => ({ statuses: new Set([id]), system: { level: n }, disabled: false, img: `icons/${id}-${n}.svg` });
  B.actor.effects = [lvl("contamination", 3)]; B.actor.statuses = new Set(["contamination"]); run(90);
  ok("contamination -> swirl + counters", JSON.stringify(fxs(B).map(c => c._mgRank)) === "[1.6,100]");
  ok("counters drawn above bars and icons", B.children.at(-1) === fxs(B)[1] && B.children.indexOf(fxs(B)[1]) > B.children.indexOf(B.bars));
  const counters = fxs(B)[1], [cGem, eGem] = counters.children;
  ok("contamination gem: level 3, lower left", cGem.visible && cGem.children[2].text === "3" && cGem.x < 50 && cGem.y > 50);
  ok("no exhaustion gem without exhaustion", !eGem.visible);
  ok("contamination casts a violet tint", (B.mesh.tint & 255) === 255 && ((B.mesh.tint >> 8) & 255) < 0xF0);
  { let valid = true; for (let i = 0; i < 200; i++) { tick(); if (!allFinite(fxs(B)[0]) || !allFinite(fxs(B)[1])) valid = false; } ok("swirl and gems stay valid over time", valid); }
  const swirl = fxs(B)[0], a3 = swirl.children[3].alpha;
  B.actor.effects = [lvl("contamination", 6)]; run(120);
  ok("level 6: brighter swirl, gem shows 6", swirl.children[3].alpha > a3 + 0.2 && cGem.children[2].text === "6");
  const popScale = (() => { B.actor.effects = [lvl("contamination", 5)]; run(2); return cGem._s[0]; })(); run(60);
  ok("gem pops when the number changes, then settles", popScale > cGem._s[0] * 1.15);
  // Exhaustion, from dnd5e's actor attribute
  B.actor.system = { attributes: { exhaustion: 4 } }; run(240);
  ok("exhaustion -> cracks under the swirl", JSON.stringify(fxs(B).map(c => c._mgRank)) === "[0.2,1.6,100]");
  ok("exhaustion gem: level 4, lower right", eGem.visible && eGem.children[2].text === "4" && eGem.x > 50 && Math.abs(eGem.y - cGem.y) < 1e-9);
  const veins = fxs(B)[0].children[2], calls = veins.calls.length; run(30);
  ok("cracks grown in and then still (not redrawn)", calls > 20 && veins.calls.length === calls);
  B.actor.system = { attributes: { exhaustion: 6 } }; run(5); const growing = veins.calls.length; run(240);
  ok("higher exhaustion: cracks grow further in", veins.calls.length > calls * 1.3);
  // Exhaustion from an effect's level alone
  B.actor.system = {}; B.actor.effects = [lvl("exhaustion", 2)]; B.actor.statuses = new Set(["exhaustion"]); run(2);
  ok("exhaustion level read from its effect", eGem.children[2].text === "2" && !cGem.visible);
  // Status icons hidden while shown by a counter / animation
  const T = { actor: { statuses: new Set(["contamination"]), effects: [lvl("contamination", 2)] } };
  ok("contamination icon hidden", (await TokenObj.prototype._drawEffect.call(T, "icons/contamination-2.svg")) === null);
  const TE = { actor: { statuses: new Set(["exhaustion"]), effects: [lvl("exhaustion", 3)] } };
  ok("exhaustion icon hidden", (await TokenObj.prototype._drawEffect.call(TE, "icons/exhaustion-3.svg")) === null);
  settings.set("levelCounters", false); settings.set("contaminationFx", false);
  ok("icon back when its animations are off", (await TokenObj.prototype._drawEffect.call(T, "icons/contamination-2.svg"))?.src === "icons/contamination-2.svg");
  run(1); ok("counters off: only the cracks remain", JSON.stringify(fxs(B).map(c => c._mgRank)) === "[0.2]");
  settings.set("levelCounters", true); settings.set("contaminationFx", true);
  // A disabled or suppressed effect doesn't count
  B.actor.effects = [{ ...lvl("contamination", 4), disabled: true }]; B.actor.statuses = new Set(); run(2);
  ok("disabled contamination ignored", fxs(B).length === 0);
  B.actor.effects = []; run(1);

  // Levels from the status palette when the system doesn't track them
  globalThis.HTMLElement ??= class {};
  const listeners = {}, icon = { dataset: { statusId: "contamination" }, style: {}, addEventListener: (t, f) => { listeners[t] = f; } };
  const root = Object.assign(new HTMLElement(), { querySelector: sel => sel.includes('"contamination"') ? icon : null });
  const created = [], updated = [], deleted = [];
  CONFIG.ActiveEffect = { documentClass: { fromStatusEffect: async id => ({ toObject: () => ({ name: "C", statuses: [id], img: "base.svg" }) }), create: async (data, opts) => { created.push({ data, opts }); } } };
  foundry.utils.mergeObject = (a, b) => Object.assign(a, b);
  const actor = { effects: [] };
  for (const f of hooks.renderTokenHUD) f({ object: { actor } }, root);
  const ev = { preventDefault(){}, stopPropagation(){ this.stopped = true; }, stopImmediatePropagation(){} };
  await listeners.click(ev); await new Promise(r => setTimeout(r, 0));
  ok("left-click adds level 1", created.length === 1 && created[0].data.flags["primal-status"].level === 1 && created[0].data.img === "modules/primal-status/icons/contamination-1.svg" && created[0].data.statuses[0] === "contamination" && ev.stopped);
  const eff = { statuses: new Set(["contamination"]), flags: { "mighty-guard": { level: 2 } }, update: async c => updated.push(c), delete: async () => deleted.push(1) };
  actor.effects = [eff];
  listeners.click(ev); await new Promise(r => setTimeout(r, 0));
  ok("left-click raises 2 -> 3 (a level kept under the old module ID is read; the new one is written under the new ID)", updated.at(-1)?.flags["primal-status"].level === 3 && updated.at(-1).name === "L:MIGHTYGUARD.Contamination (3)" && updated.at(-1).img.endsWith("contamination-3.svg"));
  eff.flags["mighty-guard"].level = 1; listeners.contextmenu(ev); await new Promise(r => setTimeout(r, 0));
  ok("right-click at level 1 removes it", deleted.length === 1);
  eff.flags["mighty-guard"].level = 6; const n = updated.length; listeners.click(ev); await new Promise(r => setTimeout(r, 0));
  ok("can't go past level 6", updated.length === n && created.length === 1);
  ok("palette icon shows the level", icon.style.background?.includes("contamination-6.svg") && icon.style.objectPosition === "-100px");
  performance.now = realNow;
}


// Advantage & disadvantage from conditions
{
  canvas.dimensions = { size: 100, distance: 5 };
  let n = 0;
  const mkActor = (statuses, senses = {}) => {
    const a = { documentName: "Actor", uuid: `Actor.c${n++}`, statuses: new Set(statuses), effects: [], system: { attributes: { senses: { ranges: senses } } } };
    return a;
  };
  const place = (actor, gx, gy, modes = {}) => { const t = { actor, document: { x: gx * 100, y: gy * 100, width: 1, height: 1, elevation: 0, detectionModes: modes } }; actor.getActiveTokens = () => [t]; return t; };
  const attack = (attacker, targets, ability = "str") => {
    const config = { subject: { actor: attacker }, ability, hookNames: ["attack", "d20Test", ""], rolls: [{ options: {} }] };
    const message = { data: { flavor: "Sword - Attack Roll" } };
    game.user.targets = new Set(targets);
    for (const f of hooks["dnd5e.preRollV2"]) f(config, {}, message);
    const o = config.rolls[0].options;
    return { adv: !!o.advantage, dis: !!o.disadvantage, flavor: message.data.flavor };
  };
  const me = mkActor([]); place(me, 0, 0);
  const foe = mkActor(["dodging"]); const foeT = place(foe, 1, 0);
  let r = attack(me, [foeT]);
  ok("attacking a Dodging creature: Disadvantage", r.dis && !r.adv && r.flavor.includes("Disadvantage"));
  foe.statuses = new Set(["dodging", "incapacitated"]); r = attack(me, [foeT]);
  ok("Dodging creature that's Incapacitated: no Disadvantage", !r.dis);
  foe.statuses = new Set(["dodging", "restrained"]); r = attack(me, [foeT]);
  ok("Dodging creature with Speed 0 (Restrained): no Disadvantage, Advantage for Restrained", !r.dis && r.adv);
  foe.statuses = new Set(["dodging", "blinded"]); r = attack(me, [foeT]);
  ok("Dodging but Blinded (can't see the attacker): Advantage only", r.adv && !r.dis);
  foe.statuses = new Set(["dodging"]); me.statuses = new Set(["invisible"]); r = attack(me, [foeT]);
  ok("Invisible attacker vs Dodging creature: Advantage, no Dodge", r.adv && !r.dis);
  me.statuses = new Set();
  foe.statuses = new Set(["prone"]); r = attack(me, [foeT]);
  ok("Prone target within 5 ft: Advantage", r.adv && !r.dis);
  const far = mkActor(["prone"]); const farT = place(far, 4, 0); r = attack(me, [farT]);
  ok("Prone target 20 ft away: Disadvantage", r.dis && !r.adv);
  for (const s of ["paralyzed", "petrified", "restrained", "stunned", "unconscious"]) { foe.statuses = new Set([s]); if (!attack(me, [foeT]).adv) ok(`${s} target gives Advantage`, false); }
  ok("Paralyzed/Petrified/Restrained/Stunned/Unconscious targets: Advantage", true);
  foe.statuses = new Set(["invisible"]); r = attack(me, [foeT]);
  ok("Invisible target: Disadvantage", r.dis && !r.adv);
  const seer = mkActor([], { truesight: 30 }); place(seer, 0, 1); r = attack(seer, [foeT]);
  ok("…unless the attacker has Truesight in range", !r.dis);
  const tokSeer = mkActor([]); place(tokSeer, 0, 2, { seeInvisibility: { enabled: true, range: 60 } }); r = attack(tokSeer, [foeT]);
  ok("…or a See Invisibility detection mode on its token", !r.dis);
  foe.statuses = new Set(["ethereal"]); r = attack(me, [foeT]);
  ok("Ethereal target: Disadvantage, like an Invisible one", r.dis && !r.adv && r.flavor.includes("Disadvantage"));
  r = attack(seer, [foeT]); ok("…unless the attacker has Truesight in range", !r.dis);
  r = attack(tokSeer, [foeT]); ok("…or See Invisibility", !r.dis);
  const etherealFriend = mkActor(["ethereal"]); place(etherealFriend, 2, 0); r = attack(etherealFriend, [foeT]);
  ok("…or is Ethereal itself", !r.dis && !r.adv);
  const bsAttacker = mkActor([], { blindsight: 30 }); place(bsAttacker, 1, 1); r = attack(bsAttacker, [foeT]);
  ok("Blindsight doesn't see into the Ethereal Plane (still Disadvantage)", r.dis);
  foe.statuses = new Set(); me.statuses = new Set(["ethereal"]); r = attack(me, [foeT]);
  ok("Ethereal attacker vs a creature that can't see it: Advantage", r.adv && !r.dis); me.statuses = new Set();
  foe.statuses = new Set(["hiding"]); r = attack(me, [foeT]);
  ok("Hiding alone doesn't give Disadvantage (needs Invisible)", !r.dis && !r.adv);
  me.statuses = new Set(["hiding"]); foe.statuses = new Set(); r = attack(me, [foeT]);
  ok("…nor Advantage for a Hiding attacker", !r.adv); me.statuses = new Set();
  ok("roll rules run on the final generic pre-roll hook only", !hooks["dnd5e.preRollAttackV2"]?.length && !hooks["dnd5e.preRollSavingThrowV2"]?.length && !hooks["dnd5e.preRollAbilityCheckV2"]?.length);
  { const c = { subject: { actor: mkActor(["poisoned"]) }, hookNames: ["deathSave", ""], rolls: [{ options: {} }] }; for (const f of hooks["dnd5e.preRollV2"]) f(c, {}, { data: {} }); ok("other rolls (death saves) untouched", !c.rolls[0].options.disadvantage); }
  {
    // Weather from Primal Weather: strong wind on ranged weapon attacks, heavy rain on Perception checks
    let mods = { perception: [{ reason: "Heavy rain (if it relies on hearing)" }], rangedWeaponAttack: [{ reason: "Strong wind" }] };
    game.modules.set("primal-weather", { active: true, api: { rollModifiers: () => mods } });
    const archer = mkActor([]); place(archer, 0, 5);
    const shoot = (attackData, extra = {}) => {
      const config = { subject: { actor: archer, attack: attackData }, hookNames: ["attack", "d20Test", ""], rolls: [{ options: {} }], ...extra };
      const message = { data: { flavor: "Bow" } };
      game.user.targets = new Set();
      for (const f of hooks["dnd5e.preRollV2"]) f(config, {}, message);
      return { dis: !!config.rolls[0].options.disadvantage, flavor: message.data.flavor };
    };
    const skillCheck = skill => {
      const config = { subject: archer, skill, hookNames: ["skill", "abilityCheck", "d20Test", ""], rolls: [{ options: {} }] };
      const message = { data: { flavor: "Check" } };
      for (const f of hooks["dnd5e.preRollV2"]) f(config, {}, message);
      return { dis: !!config.rolls[0].options.disadvantage, flavor: message.data.flavor };
    };
    const ranged = { type: { value: "ranged", classification: "weapon" } };
    let w = shoot(ranged);
    ok(`weather: strong wind gives a ranged weapon attack Disadvantage (${w.flavor})`, w.dis && w.flavor.includes("Strong wind"));
    ok("…a thrown weapon too", shoot({ type: { value: "melee", classification: "weapon" } }, { attackMode: "thrown" }).dis);
    ok("…not a melee attack", !shoot({ type: { value: "melee", classification: "weapon" } }).dis);
    ok("…nor a ranged spell attack", !shoot({ type: { value: "ranged", classification: "spell" } }).dis);
    w = skillCheck("prc");
    ok(`weather: heavy rain gives Perception Disadvantage, with the reason (${w.flavor})`, w.dis && w.flavor.includes("relies on hearing"));
    ok("…not other skills", !skillCheck("ath").dis);
    mods = { perception: [], rangedWeaponAttack: [] };
    ok("indoors or in clear weather Primal Weather says nothing applies: no change", !skillCheck("prc").dis && !shoot(ranged).dis);
    mods = { perception: [{ reason: "x" }], rangedWeaponAttack: [{ reason: "y" }] };
    game.modules.get("primal-weather").active = false;
    ok("Primal Weather turned off: no change", !skillCheck("prc").dis && !shoot(ranged).dis);
    game.modules.delete("primal-weather");
  }
  for (const s of ["poisoned", "prone", "restrained", "frightened"]) { me.statuses = new Set([s]); if (!attack(me, []).dis) ok(`attacker ${s}: Disadvantage`, false); }
  ok("Poisoned/Prone/Restrained/Frightened attacker: Disadvantage", true);
  me.statuses = new Set(["blinded"]); foe.statuses = new Set(); r = attack(me, [foeT]);
  ok("Blinded attacker: Disadvantage", r.dis);
  const bat = mkActor(["blinded"], { blindsight: 10 }); place(bat, 2, 0); r = attack(bat, [foeT]);
  ok("…but not with Blindsight in range", !r.dis);
  me.statuses = new Set(["invisible"]); const blindsighted = mkActor([], { blindsight: 30 }); const bsT = place(blindsighted, 1, 1); r = attack(me, [bsT]);
  ok("Invisible attacker vs a Blindsight target: no Advantage", !r.adv);
  me.statuses = new Set(["poisoned"]); foe.statuses = new Set(["prone"]); const other = mkActor(["prone"]); const otherT = place(other, 0, 1);
  r = attack(me, [foeT, otherT]);
  ok("several targets: only the attacker's own conditions count", r.dis && !r.adv);
  r = attack(me, [foeT]);
  ok("Advantage and Disadvantage both applied (dnd5e cancels them out)", r.adv && r.dis && r.flavor.includes("Advantage:") && r.flavor.includes("Disadvantage:"));
  // Grappled: Disadvantage against anyone but the grappler
  const grappler = mkActor([]); const grapT = place(grappler, 0, 1);
  const held = mkActor(["grappled"]); place(held, 1, 1);
  held.effects = [{ statuses: new Set(["grappled"]), origin: grappler.uuid, disabled: false }];
  globalThis.fromUuidSync = u => u === grappler.uuid ? grappler : null;
  foe.statuses = new Set();
  ok("Grappled: Disadvantage against others", attack(held, [foeT]).dis);
  ok("…but not against the grappler", !attack(held, [grapT]).dis);
  // Abilities (Monsters of Drakkenheim)
  me.statuses = new Set(["clumsy"]);
  ok("Clumsy: Disadvantage on Dex attacks only", attack(me, [], "dex").dis && !attack(me, [], "str").dis);
  // Saving throws
  const save = (actor, ability) => { const config = { subject: actor, ability, hookNames: ["SavingThrow", "d20Test", ""], rolls: [{ options: {} }] }; for (const f of hooks["dnd5e.preRollV2"]) f(config, {}, { data: {} }); return config.rolls[0].options; };
  me.statuses = new Set(["sickened"]);
  ok("Sickened: Disadvantage on Con saves only", save(me, "con").disadvantage && !save(me, "dex").disadvantage);
  me.statuses = new Set(["addled"]);
  ok("Addled: Disadvantage on Wis saves", save(me, "wis").disadvantage && !save(me, "str").disadvantage);
  // The roll window's default button follows the conditions, even when Midi-QOL already picked "normal"
  // on an earlier hook (dnd5e 6 highlights options.defaultButton, and that's what Enter rolls)
  CONFIG.Dice.D20Roll = { ADV_MODE: { NORMAL: 0, ADVANTAGE: 1, DISADVANTAGE: -1 } };
  const dialogFor = (actor, ability, hookNames, { pre = {}, options = { defaultButton: "normal", advantageMode: 0 } } = {}) => {
    const config = { subject: actor, ability, hookNames, rolls: [{ options: {} }], ...pre };
    const dialog = options === null ? {} : { options: { ...options } };
    for (const f of hooks["dnd5e.preRollV2"]) f(config, dialog, { data: {} });
    return dialog;
  };
  const saveHooks = ["SavingThrow", "d20Test", ""];
  me.statuses = new Set(["sickened"]);
  let dlg = dialogFor(me, "con", saveHooks);
  ok("Sickened Con save: the window's default button becomes Disadvantage", dlg.options.defaultButton === "disadvantage" && dlg.options.advantageMode === -1);
  ok("…a Dex save keeps Midi's Normal", dialogFor(me, "dex", saveHooks).options.defaultButton === "normal");
  ok("…Advantage from elsewhere as well: Normal", dialogFor(me, "con", saveHooks, { pre: { advantage: true } }).options.defaultButton === "normal");
  dlg = dialogFor(me, "con", saveHooks, { options: null });
  ok("…set even when nothing picked a default yet", dlg.options?.defaultButton === "disadvantage" && !("advantageMode" in dlg.options));
  me.statuses = new Set(["dodging"]);
  ok("Dodging Dex save: default button Advantage", dialogFor(me, "dex", saveHooks).options.defaultButton === "advantage");
  me.statuses = new Set(["frightened"]);
  ok("Frightened check: default button Disadvantage", dialogFor(me, "wis", ["skill", "abilityCheck", "d20Test", ""]).options.defaultButton === "disadvantage");
  me.statuses = new Set(["poisoned"]);
  ok("Poisoned attack: default button Disadvantage", dialogFor({ actor: me }, "str", ["attack", "d20Test", ""]).options.defaultButton === "disadvantage");
  me.statuses = new Set();
  dlg = dialogFor(me, "con", saveHooks, { options: { defaultButton: "advantage", advantageMode: 1 } });
  ok("no conditions: the default button is left alone", dlg.options.defaultButton === "advantage" && dlg.options.advantageMode === 1);
  delete CONFIG.Dice.D20Roll;
  // Ability checks
  const check = (actor, ability, init = false) => { const config = { subject: actor, ability, hookNames: init ? ["initiativeDialog", "abilityCheck", "d20Test", ""] : ["skill", "abilityCheck", "d20Test", ""], rolls: [{ options: {} }] }; for (const f of hooks["dnd5e.preRollV2"]) f(config, {}, { data: {} }); return config.rolls[0].options; };
  me.statuses = new Set(["frightened"]);
  ok("Frightened: Disadvantage on ability checks", check(me, "wis").disadvantage);
  me.statuses = new Set(["poisoned"]);
  ok("Poisoned: Disadvantage on checks and initiative", check(me, "wis").disadvantage && check(me, undefined, true).disadvantage);
  // Dexterity saves the module now applies itself as well
  me.statuses = new Set(["dodging"]);
  ok("Dodging: Advantage on Dex saves", save(me, "dex").advantage && !save(me, "dex").disadvantage && !save(me, "con").advantage);
  me.statuses = new Set(["dodging", "incapacitated"]);
  ok("…not while Incapacitated", !save(me, "dex").advantage);
  me.statuses = new Set(["dodging", "grappled"]);
  ok("…not while its Speed is 0 (Grappled)", !save(me, "dex").advantage);
  me.statuses = new Set(); me.effects = [{ statuses: new Set(["dodging"]), disabled: false }];
  ok("Dodging found from the effect even if the actor's status set lacks it", save(me, "dex").advantage);
  me.effects = [{ statuses: new Set(["dodging"]), disabled: true }];
  ok("…but not from a disabled effect", !save(me, "dex").advantage);
  me.effects = [];
  me.statuses = new Set(["restrained"]);
  ok("Restrained: Disadvantage on Dex saves", save(me, "dex").disadvantage);
  me.statuses = new Set(["hasted"]);
  ok("Hasted: Advantage on Dex saves", save(me, "dex").advantage);
  me.statuses = new Set(["dodging"]); const sm = { data: { flavor: "Dexterity Saving Throw" } }; const sc = { subject: me, ability: "dex", hookNames: ["SavingThrow", "d20Test", ""], rolls: [{ options: {} }] };
  for (const f of hooks["dnd5e.preRollV2"]) f(sc, {}, sm);
  ok("…and the chat message says why", sm.data.flavor.includes("Rolls.Advantage") && sm.data.flavor.includes("dodging"));
  // Charmed: the charmer has Advantage on Charisma checks against its victim
  const victim = mkActor(["charmed"]); const victimT = place(victim, 3, 3);
  victim.effects = [{ statuses: new Set(["charmed"]), origin: me.uuid, disabled: false }];
  globalThis.fromUuidSync = u => u === me.uuid ? me : (u === grappler.uuid ? grappler : null);
  me.statuses = new Set(); game.user.targets = new Set([victimT]);
  ok("charmer: Advantage on Charisma checks against the charmed creature", check(me, "cha").advantage && !check(me, "wis").advantage);
  ok("someone else: no Advantage", !check(grappler, "cha").advantage);
  game.user.targets = new Set();
  // Automatic failures: Str/Dex saves of Paralyzed, Petrified, Stunned and Unconscious creatures
  const saveCfg = (actor, ability) => { const config = { subject: actor, ability, hookNames: ["SavingThrow", "d20Test", ""], rolls: [{ options: {} }] }; const message = { data: { flavor: "Dexterity Saving Throw" } }; for (const f of hooks["dnd5e.preRollV2"]) f(config, {}, message); return { o: config.rolls[0].options, flavor: message.data.flavor }; };
  for (const st of ["paralyzed", "petrified", "stunned", "unconscious"]) {
    me.statuses = new Set([st]);
    if (!saveCfg(me, "dex").o.mgAutoFail || !saveCfg(me, "str").o.mgAutoFail || saveCfg(me, "con").o.mgAutoFail) ok(`${st}: auto-fail on Str/Dex only`, false);
  }
  me.statuses = new Set(["paralyzed"]);
  ok("Paralyzed/Petrified/Stunned/Unconscious: Str and Dex saves marked to fail, others not", true);
  ok("…and the chat message says so", saveCfg(me, "dex").flavor.includes("Rolls.AutoFail"));
  game.user.targets = new Set();
  const failing = new Roll("1d20+7"); failing.options = { mgAutoFail: true }; failing._evaluated = true; failing._total = 23; failing.dice = [{ faces: 20 }];
  failing.evaluate({});
  ok("an auto-failed save totals -1 whatever was rolled", failing._total === -1);
  const normalRoll = new Roll("1d20+7"); normalRoll.options = {}; normalRoll._evaluated = true; normalRoll._total = 23; normalRoll.dice = [{ faces: 20 }]; normalRoll.evaluate({});
  ok("other rolls untouched", normalRoll._total === 23);
  // Critical Hits: Paralyzed / Unconscious within 5 ft, Helpless at any range
  me.statuses = new Set();
  const victim2 = mkActor(["paralyzed"]); victim2.system.attributes.ac = { value: 15 }; const victim2T = place(victim2, 1, 0);
  const atkCfg = (attacker, tok) => { const config = { subject: { actor: attacker }, ability: "str", hookNames: ["attack", "d20Test", ""], rolls: [{ options: {} }] }; const message = { data: { flavor: "Sword" } }; game.user.targets = new Set([tok]); for (const f of hooks["dnd5e.preRollV2"]) f(config, {}, message); return { o: config.rolls[0].options, flavor: message.data.flavor }; };
  let a = atkCfg(me, victim2T);
  ok("attacking a Paralyzed creature within 5 ft: Advantage and critical on a hit", a.o.advantage && a.o.mgCritOnHit?.ac === 15 && a.flavor.includes("Rolls.CritOnHit"));
  const distant = mkActor(["unconscious"]); distant.system.attributes.ac = { value: 12 }; const distantT = place(distant, 5, 0);
  a = atkCfg(me, distantT);
  ok("from farther than 5 ft: Advantage but no automatic critical", a.o.advantage && !a.o.mgCritOnHit);
  const helpless = mkActor(["helpless"]); helpless.system.attributes.ac = { value: 13 }; const helplessT = place(helpless, 6, 6);
  ok("Helpless (Drakkenheim): critical on a hit at any range", atkCfg(me, helplessT).o.mgCritOnHit?.ac === 13);
  game.user.targets = new Set();
  const mkAttackRoll = (total, natural) => { const r = new Roll("1d20+5"); r.options = { mgCritOnHit: { ac: 15 }, criticalSuccess: 20 }; r._evaluated = true; r.total = total; r.isCritical = natural >= 20; r.d20 = { total: natural, options: { criticalSuccess: 20 } }; r.dice = [{ faces: 20 }]; return r; };
  const hit = mkAttackRoll(17, 12); hit.evaluate({});
  ok("a hit becomes a Critical Hit", hit.options.criticalSuccess === 12 && hit.d20.options.criticalSuccess === 12);
  const miss = mkAttackRoll(14, 9); miss.evaluate({});
  ok("a miss stays a miss", miss.options.criticalSuccess === 20 && miss.d20.options.criticalSuccess === 20);
  const nat1 = mkAttackRoll(16, 1); nat1.evaluate({});
  ok("a natural 1 is never turned into a Critical Hit", nat1.d20.options.criticalSuccess === 20);
  // Off switch
  settings.set("conditionRolls", false); me.statuses = new Set(["poisoned"]);
  ok("setting off: no changes", !attack(me, []).dis); settings.set("conditionRolls", true);
  game.user.targets = new Set(); delete canvas.dimensions; delete globalThis.fromUuidSync;
}

// Guidance build hook
const gcfg = { parts:["1d20","@mod"], data:{} };
for (const f of hooks["dnd5e.buildAbilityCheckRollConfig"]) f({}, gcfg, { object:{ "roll.0.mgGuidance": true } }, 0);
ok("guidance ticked adds 1d4", JSON.stringify(gcfg.parts)==='["1d20","@mod","1d4"]');
const gcfg2 = { parts:["1d20","@mod"], data:{} };
for (const f of hooks["dnd5e.buildAbilityCheckRollConfig"]) f({}, gcfg2, { object:{ "roll.0.mgGuidance": false } }, 0);
ok("guidance unticked adds nothing", gcfg2.parts.length===2);

// Haste removal no longer applies lethargy
game.user.id = "me";
{ const made = []; const actor = { uuid: "Actor.x", createEmbeddedDocuments: async (...a) => made.push(a), toggleStatusEffect: async (...a) => made.push(a), effects: [] };
  for (const f of hooks.deleteActiveEffect ?? []) f({ parent: actor, statuses: new Set(["hasted"]), name: "Haste" }, {}, "me");
  await new Promise(r => setTimeout(r, 0));
  ok("removing Haste applies no lethargy", made.length === 0); }
// Damage logic still works
class DamageRoll extends Roll {} CONFIG.Dice.DamageRoll = DamageRoll;
A.actor.statuses.add("mighty-guard"); game.user.targets = new Set([A]);
const d = new DamageRoll("2d6"); d.dice=[{faces:6}]; d.evaluate({});
const atk = new Roll("1d20"); atk.dice=[{faces:20}]; atk.evaluate({});
ok("damage vs guarded minimized, attack untouched", d.lastOpts.minimize===true && !atk.lastOpts.minimize);
