// Statuses with a value (Jinxed, Valor, Burning, Bleeding), Burning and Bleeding each turn, Bewildered, Distracted, Staggered
// and Drakkenheim Madness, short save-ends effects
// ending with the combat, cover names, and the Frozen and Entangled animations (forming and ending).
//   node values-and-combat.mjs <path to scripts/primal-status.js>
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
for (const m of ["clear","lineStyle","drawEllipse","beginFill","drawCircle","endFill","moveTo","lineTo","drawPolygon","bezierCurveTo","closePath","arc","drawRect","drawRoundedRect"]) Graphics.prototype[m]=function(...a){
  for (const v of a.flat(2)) if (typeof v==="number" && !Number.isFinite(v)) throw new Error(`${m} got non-finite ${v}`);
  if (a[0] && typeof a[0] === "object" && !Array.isArray(a[0])) for (const v of Object.values(a[0])) if (typeof v==="number" && !Number.isFinite(v)) throw new Error(`${m} got non-finite ${v}`);
  if (m === "clear") this.calls = []; this.calls.push(m); return this; };
class BlurFilter { constructor(s,q){ this._b=s; this.quality=q; this.resolution=null; } set blur(v){ if(!Number.isFinite(v)) throw new Error("bad blur "+v); this._b=v; } get blur(){return this._b;} destroy(){ this.gone=true; } }
class TextStyle { constructor(o){ Object.assign(this,o); } }
class Text extends Obs { constructor(str, style){ super(); this.text=str; this.style=style; this.anchor={set:v=>this._anchor=v}; } }
const tickers=[];
globalThis.PIXI = { Container: Obs, Graphics, Text, TextStyle, BlurFilter, BLEND_MODES:{ADD:1, NORMAL:0}, UPDATE_PRIORITY:{NORMAL:0}, LINE_CAP:{ROUND:"round"}, LINE_JOIN:{ROUND:"round"} };
const settings = new Map(); const settingsCfg = new Map(); const chat = [];
globalThis.game = { settings:{ register:(m,k,o)=>{ settings.set(k,o.default); settingsCfg.set(`${m}.${k}`, o); }, get:(m,k)=>settings.get(k), registerMenu:()=>{},
    set:async (m,k,v)=>{ settings.set(k,v); settingsCfg.get(`${m}.${k}`)?.onChange?.(v); return v; } },
  i18n:{localize:s=>"L:"+s, has:k=>k.startsWith("MIGHTYGUARD")},
  modules:new Map([["primal-status",{ active:true }]]), release:{generation:14}, system:{id:"dnd5e"},
  user:{ id:"gm", isGM:true, targets:new Set() }, users:{ activeGM:{ id:"gm", isSelf:true } } };
game.modules.get = Map.prototype.get.bind(game.modules); game.settings.settings = settingsCfg;
globalThis.ui = { notifications: { info(){}, warn(){} } };
globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ alias: actor?.name }) };
globalThis.CONFIG = { statusEffects: {
  burning: { id: "burning", name: "EFFECT.DND5E.StatusBurning", img: "systems/dnd5e/icons/svg/statuses/burning.svg", reference: "Compendium.x" },
  coverHalf: { id: "coverHalf", name: "EFFECT.DND5E.StatusHalfCover", img: "c1.svg" },
  coverThreeQuarters: { id: "coverThreeQuarters", name: "EFFECT.DND5E.StatusThreeQuartersCover", img: "c2.svg" },
  coverTotal: { id: "coverTotal", name: "EFFECT.DND5E.StatusTotalCover", img: "c3.svg" }
}, Dice:{}, time: { roundTime: 6 } };
class Actor {} globalThis.Actor = Actor;
// A Roll whose dice always come up the same: each die rolls its highest face
class Roll { constructor(f){ this.formula=f; this.options={}; this.dice=[]; }
  evaluate(){ let t = 0; for (const m of this.formula.matchAll(/([+-]?)(\d+)d(\d+)|([+-]?)(\d+)/g)) { if (m[3]) t += (m[1] === "-" ? -1 : 1) * Number(m[2]) * Number(m[3]); else t += (m[4] === "-" ? -1 : 1) * Number(m[5]); }
    this.total = t; return this; }
  async toMessage(data){ chat.push({ formula: this.formula, total: this.total, ...data }); } }
globalThis.Roll = Roll;
const toRGB = n=>[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
globalThis.foundry = { applications: { api: { ApplicationV2: class {} } }, utils: { getProperty:(o,p)=>p.split(".").reduce((a,k)=>a?.[k],o),
  Color: { from:n=>({rgb:toRGB(Number(n))}), fromRGB:a=>((Math.round(a[0]*255)<<16)|(Math.round(a[1]*255)<<8)|Math.round(a[2]*255)) } } };
const items = new Map();
globalThis.fromUuidSync = uuid => items.get(uuid) ?? null;
class Token extends Obs { constructor(id){ super(); this.id=id; this.w=100; this.h=100; this.mesh={tint:0xFFFFFF, alpha:1};
  this.document={id, texture:{tint:0xFFFFFF}, alpha:1, flags:{}}; this.actor=Object.assign(new Actor(), {statuses:new Set(), effects:[]}); this.renderFlags={set:f=>this.flagsSet=f};
  this.bars=new Obs(); this.voidMesh=new Obs(); this.addChild(new Obs(), this.voidMesh, this.bars); } }
Token.RENDER_FLAGS = { refreshState:{}, refreshMesh:{} };
const A = new Token("tokA");
globalThis.canvas = { ready:true, stage:{scale:{x:1}}, app:{ ticker:{ add:f=>tickers.push(f) } }, tokens:{ placeables:[A], controlled:[] } };
// Loaded as Foundry loads it, a classic script, so its functions can be called here
const { readFileSync } = await import("node:fs"); const vm = await import("node:vm");
vm.runInThisContext(readFileSync(process.argv[2], "utf8"), { filename: process.argv[2] });
call("init"); call("i18nInit"); call("setup"); call("ready"); call("canvasReady");
const tick = tickers[0];
let clock = performance.now(); performance.now = () => clock;
const step = (ms = 16.7) => { clock += ms; tick(); };
const fxs = t => t.children.filter(c=>c._mgRank!==undefined);
const ok = (label, cond) => console.log((cond ? "PASS " : "FAIL ") + label);
const settle = () => new Promise(r => setTimeout(r, 0));

/* ---------- 1. Values: typed in, tidied, read back ---------- */
{
  const n = normalizeStatusValue;
  ok("values are tidied: d6 → 1d6, 2D6 + 1 → 2d6+1, 03 → 3", n("d6") === "1d6" && n(" 2D6 + 1 ") === "2d6+1" && n("03") === "3" && n("1d8-d4") === "1d8-1d4");
  ok("…and anything that isn't a simple roll is refused", [null, "", "banana", "1d", "d", "1d6*2", "100d6", "1d1", "1d6+", "@prof", "1000"].every(v => n(v) === null));
  ok("the average picks the stronger value", statusValueAverage("1d6+1") === 4.5 && statusValueAverage("2d4") === 5 && statusValueAverage("3") === 3);
  const fx = (statuses, name, flags = {}) => ({ statuses: new Set(statuses), name, flags });
  const actor = effects => ({ documentName: "Actor", name: "Ash", statuses: new Set(effects.flatMap(e => [...e.statuses])), effects, system: {} });
  ok("an effect's value: its flag first, then its name, then any die it names",
    effectStatusValue(fx(["valor"], "Valor (1d4)", { "primal-status": { value: "1d8" } })) === "1d8" && effectStatusValue(fx(["valor"], "Valor (2d4+1)")) === "2d4+1"
    && effectStatusValue(fx(["jinxed"], "Hex d6")) === "1d6" && effectStatusValue(fx(["jinxed"], "Jinxed")) === null
    && effectStatusValue(fx(["jinxed"], "Hexed", { "mighty-guard": { die: "1d10" } })) === "1d10");
  ok("a creature's value: the strongest of its effects, 1d4 if none says, null without the status",
    statusValue(actor([fx(["valor"], "Valor (1d4)"), fx(["valor"], "Valor (1d8)")]), "valor") === "1d8" && statusValue(actor([fx(["valor"], "Valor")]), "valor") === "1d4"
    && statusValue(actor([fx(["valor"], "Valor (1d6)")]), "jinxed") === null);
  ok("Burning counts other modules' on-fire statuses too", statusValue(actor([fx(["pf2e.on-fire"], "On Fire (2d6)")]), "burning") === "2d6" && valueStatusOf(fx(["aflame"], "x")) === "burning" && valueStatusOf(fx(["prone"], "x")) === null);
  // setting it: flag and name (a name of its own is kept)
  const updates = [];
  const mk = (statuses, name) => ({ statuses: new Set(statuses), name, flags: {}, update: async d => { updates.push(d); } });
  const valor = statusDisplayName("valor"), burning = statusDisplayName("burning");
  await setEffectStatusValue(mk(["valor"], valor), "d6");
  await setEffectStatusValue(mk(["burning"], `${burning} (1d4)`), "2d6");
  await setEffectStatusValue(mk(["jinxed"], "Witch's Curse"), "1d8");
  const refused = await setEffectStatusValue(mk(["jinxed"], "Jinxed"), "lots");
  ok(`setting a value saves it on the effect and in its name (${JSON.stringify(updates)})`, JSON.stringify(updates) === JSON.stringify([
    { "flags.primal-status.value": "1d6", name: `${valor} (1d6)` },
    { "flags.primal-status.value": "2d6", name: `${burning} (2d6)` },
    { "flags.primal-status.value": "1d8" }]) && refused === false);
}

/* ---------- 2. Jinxed and Valor use the value on every roll ---------- */
{
  settings.set("conditionRolls", true);
  const mkActor = (statuses, effects = []) => ({ documentName: "Actor", name: "X", statuses: new Set(statuses), effects, system: {} });
  const roll = (actor, hookNames) => {
    const config = { hookNames, subject: hookNames.includes("attack") ? { actor, item: { type: "weapon", actor } } : actor, ability: "wis", rolls: [{ parts: ["@mod"], options: {} }] };
    const message = { data: { flavor: "Roll" } };
    for (const f of hooks["dnd5e.preRollV2"] ?? []) f(config, {}, message);
    return { parts: config.rolls[0].parts, flavor: message.data.flavor };
  };
  let r = roll(mkActor(["valor"], [{ statuses: new Set(["valor"]), name: "Valor (1d6)", flags: { "primal-status": { value: "1d10" } } }]), ["attack"]);
  ok(`the value set in the pane wins over the name (${r.parts.join(" ")})`, r.parts[1] === "1d10[L:MIGHTYGUARD.Drakkenheim.Valor]");
  r = roll(mkActor(["jinxed"], [{ statuses: new Set(["jinxed"]), name: "Jinxed (1d6+1)", flags: {} }]), ["savingThrow"]);
  ok(`a value with a number in it is taken off whole (${r.parts.join(" ")}; ${r.flavor})`, JSON.stringify(r.parts) === '["@mod","-1d6[L:MIGHTYGUARD.Drakkenheim.Jinxed]","-1[L:MIGHTYGUARD.Drakkenheim.Jinxed]"]' && r.flavor.includes("−(1d6+1)"));
  r = roll(mkActor(["valor"], [{ statuses: new Set(["valor"]), name: "Valor (1d8-1)", flags: {} }]), ["savingThrow"]);
  ok(`…and added whole (${r.parts.join(" ")})`, JSON.stringify(r.parts) === '["@mod","1d8[L:MIGHTYGUARD.Drakkenheim.Valor]","-1[L:MIGHTYGUARD.Drakkenheim.Valor]"]');
  // Dice So Nice: Midi-QOL throws a GM's attack with only the d20 and hides the other dice; Jinxed's and Valor's come back
  const VALOR = "L:MIGHTYGUARD.Drakkenheim.Valor", JINXED = "L:MIGHTYGUARD.Drakkenheim.Jinxed";
  const die = (faces, flavor, hidden, extra = {}) => ({ faces, flavor, options: { flavor }, results: [{ result: 3, active: true, hidden, ...extra }] });
  const throwOf = (...dice) => ({ roll: { dice } });
  const start = (messageId, ctx) => { for (const f of hooks["diceSoNiceRollStart"] ?? []) f(messageId, ctx); return ctx.roll.dice; };
  let d = start(undefined, throwOf(die(20, undefined, false), die(4, VALOR, true), die(4, "Bless", true), die(6, JINXED, true)));
  ok("Dice So Nice: Valor's and Jinxed's dice are thrown with Midi's d20-only GM attack", !d[1].results[0].hidden && !d[3].results[0].hidden);
  ok("…another hidden die (Bless) is left as Midi set it", d[2].results[0].hidden === true);
  d = start(undefined, throwOf(die(20, "attack", false), die(4, VALOR.toLocaleLowerCase(), true), die(4, "bless", true)));
  ok("…also with the labels Midi lowercases before throwing (\"valor\")", !d[1].results[0].hidden && d[2].results[0].hidden === true);
  d = start("msg1", throwOf(die(20, undefined, true), die(4, VALOR, true)));
  ok("…not when the chat message is shown (already thrown)", d[1].results[0].hidden === true);
  d = start(null, throwOf(die(20, undefined, true), die(4, VALOR, true)));
  ok("…nor when the d20 itself is hidden (marked as thrown)", d[1].results[0].hidden === true);
  d = start(null, throwOf(die(20, undefined, false), die(4, VALOR, true, { discarded: true })));
  ok("…and a discarded result stays hidden", d[1].results[0].hidden === true);
  d = start(null, throwOf(die(20, undefined, false), die(4, VALOR, false)));
  ok("…a throw that already shows it is unchanged", d[1].results[0].hidden === false);
}

/* ---------- 3. Burning and Bleeding: at the end of each of the creature's turns ---------- */
{
  const damage = [];
  const burner = (name = "Burning (1d6)", extra = {}) => ({ documentName: "Actor", name: "Rat", statuses: new Set(["burning"]), system: {},
    effects: [{ statuses: new Set(["burning"]), name, flags: {} }], applyDamage: async d => { damage.push(d); }, ...extra });
  const rat = burner(), wolf = { documentName: "Actor", name: "Wolf", statuses: new Set(), effects: [], system: {}, applyDamage: async d => damage.push(d) };
  const ratC = { id: "a", actor: rat }, wolfC = { id: "b", actor: wolf };
  const combat = { id: "c1", started: true, round: 1, turn: 0, combatant: ratC, turns: [ratC, wolfC] };
  combat.combatants = new Map(combat.turns.map(c => [c.id, c]));
  // The GM moves the turn on (or back): Foundry keeps the turn before as the combat's "previous"
  const advance = (c, round, turn, direction = 1) => { c.previous = { round: c.round, turn: c.turn, combatantId: c.combatant?.id };
    c.round = round; c.turn = turn; c.combatant = c.turns[turn]; call("updateCombat", c, { round, turn }, { direction }, "gm"); };
  const quietly = (c, round, turn) => { c.round = round; c.turn = turn; c.combatant = c.turns[turn]; };
  ok("the GM setting is there, rolling and applying by default", settingsCfg.get("primal-status.burningDamage")?.default === "apply" && settingsCfg.get("primal-status.burningDamage").config === true);
  advance(combat, 1, 1); await settle(); await settle();
  ok(`a Burning creature's turn ends: X rolled in the chat (${chat.at(-1)?.formula} = ${chat.at(-1)?.total})`, chat.length === 1 && chat[0].formula === "1d6" && chat[0].flavor.includes("MIGHTYGUARD.Burning.Flavor"));
  ok(`…and taken off as fire damage, through dnd5e's damage (resistances count) (${JSON.stringify(damage)})`, damage.length === 1 && damage[0][0].value === 6 && damage[0][0].type === "fire");
  advance(combat, 2, 0); await settle();
  ok("a creature that isn't burning ends its turn: nothing (and nothing as the Rat's turn starts)", chat.length === 1 && damage.length === 1);
  advance(combat, 1, 1, -1); await settle();
  ok("going back a turn doesn't burn", chat.length === 1);
  advance(combat, 2, 0); await settle();
  ok("…nor does coming forward over the same turn again", chat.length === 1);
  rat.effects[0].flags = { "primal-status": { value: "2d4+1" } };
  advance(combat, 2, 1); await settle(); await settle();
  ok(`its next turn ends: it burns again, with the value set since (${chat.at(-1)?.formula})`, chat.length === 2 && chat[1].formula === "2d4+1" && damage.at(-1)[0].value === 9);
  settings.set("burningDamage", "roll");
  advance(combat, 3, 0); advance(combat, 3, 1); await settle(); await settle();
  ok("'Roll in the chat only': rolled, not applied", chat.length === 3 && damage.length === 2);
  settings.set("burningDamage", "off");
  advance(combat, 4, 0); advance(combat, 4, 1); await settle();
  ok("off: nothing", chat.length === 3);
  settings.set("burningDamage", "apply");
  ratC.isDefeated = true; advance(combat, 5, 0); advance(combat, 5, 1); await settle(); ratC.isDefeated = false;
  ok("a defeated creature doesn't burn", chat.length === 3);
  ratC.actor = burner("Burning"); advance(combat, 6, 0); advance(combat, 6, 1); await settle(); await settle();
  ok("Burning with no X: 1d4 fire", chat.at(-1).formula === "1d4" && damage.at(-1)[0].value === 4 && damage.at(-1)[0].type === "fire");
  ratC.actor = burner("Burning (2d4 Acid)"); advance(combat, 7, 0); advance(combat, 7, 1); await settle(); await settle();
  ok(`Burning (2d4 Acid): acid damage, as the book's example (${JSON.stringify(damage.at(-1))})`, chat.at(-1).formula === "2d4" && damage.at(-1)[0].value === 8 && damage.at(-1)[0].type === "acid");
  ratC.actor = rat;
  game.users.activeGM = { id: "other", isSelf: false };
  advance(combat, 8, 0); advance(combat, 8, 1); await settle();
  ok("only the active GM's client rolls it (never twice)", chat.length === 5);
  game.users.activeGM = { id: "gm", isSelf: true };
  // Foundry 13 and later also report the turn change itself (combatTurnChange), after the update
  const logs = [], realLog = console.log;
  console.log = (...a) => { if (/^primal-status \| (Burning|Bleeding):/.test(String(a[0]))) logs.push(a.join(" ")); else realLog(...a); };
  const rat2 = burner("Burning (2d4+1)"); const rat2C = { id: "a", actor: rat2 }, wolf2C = { id: "b", actor: wolf };
  const c2 = { id: "c2", started: true, round: 1, turn: 1, combatant: rat2C, turns: [wolf2C, rat2C] };
  c2.combatants = new Map(c2.turns.map(c => [c.id, c]));
  const turnChange = (round, turn, prior) => { c2.round = round; c2.turn = turn; c2.combatant = c2.turns[turn];
    call("combatTurnChange", c2, prior, { round, turn, combatantId: c2.combatant.id }); };
  const before = chat.length;
  turnChange(2, 0, { round: 1, turn: 1, combatantId: "a" }); await settle(); await settle();
  ok(`the turn-change event alone is enough (if the update doesn't say) (${logs.at(-1)})`, chat.length === before + 1 && /Rat's turn ended \(round 1\): rolling 2d4\+1 fire damage and applying it/.test(logs.at(-1) ?? ""));
  c2.previous = { round: 1, turn: 1, combatantId: "a" }; call("updateCombat", c2, { round: 2, turn: 0 }, { direction: 1 }, "gm"); await settle();
  ok("…and when both report the same turn, it's rolled once", chat.length === before + 1);
  turnChange(1, 1, { round: 2, turn: 0, combatantId: "b" }); await settle();
  ok("going back with the turn-change event: nothing", chat.length === before + 1);
  turnChange(2, 1, { round: 2, turn: 0, combatantId: "b" }); await settle();
  turnChange(3, 0, { round: 2, turn: 1, combatantId: "a" }); await settle(); await settle();
  ok("its next turn ends: rolled again", chat.length === before + 2);
  // a single creature in the combat: each new round ends its turn
  const soloC = { id: "a", actor: rat2 };
  const solo = { id: "c3", started: true, round: 2, turn: 0, combatant: soloC, turns: [soloC], combatants: new Map([["a", soloC]]), previous: { round: 1, turn: 0, combatantId: "a" } };
  call("updateCombat", solo, { round: 2 }, { direction: 1 }, "gm");
  call("combatTurnChange", solo, { round: 1, turn: 0, combatantId: "a" }, { round: 2, turn: 0, combatantId: "a" }); await settle(); await settle();
  ok("alone in the combat: burns when the round changes (once)", chat.length === before + 3);
  call("updateCombat", { ...solo, id: "c4", round: 1, previous: { round: 0, turn: 0 } }, { round: 1 }, { direction: 1 }, "gm"); await settle();
  ok("the combat starting (round 0 to 1) ends nobody's turn", chat.length === before + 3);
  settings.set("burningDamage", "off");
  turnChange(3, 1, { round: 3, turn: 0, combatantId: "b" }); await settle();
  turnChange(4, 0, { round: 3, turn: 1, combatantId: "a" }); await settle();
  ok(`set to Off: nothing rolled, and the console says why (${logs.at(-1)})`, chat.length === before + 3 && /set to Off/.test(logs.at(-1) ?? ""));
  settings.set("burningDamage", "apply");

  // Bleeding (X): X Hit Points lost at the end of each turn (no damage type), and it ends when Hit Points come back
  const lost = [], removed = [];
  const bleeder = { documentName: "Actor", name: "Scout", statuses: new Set(["bleeding"]), system: { attributes: { hp: { value: 20, max: 30 } } },
    effects: [{ id: "bl", statuses: new Set(["bleeding"]), name: "Bleeding (2d4)", flags: {} }], applyDamage: async d => lost.push(d),
    deleteEmbeddedDocuments: async (type, ids) => { removed.push(...ids); bleeder.effects = bleeder.effects.filter(e => !ids.includes(e.id)); } };
  const scoutC = { id: "s", actor: bleeder }, otherC = { id: "o", actor: wolf };
  const c5 = { id: "c5", started: true, round: 1, turn: 0, combatant: scoutC, turns: [scoutC, otherC] };
  c5.combatants = new Map(c5.turns.map(c => [c.id, c]));
  const mark = chat.length;
  advance(c5, 1, 1); await settle(); await settle();
  ok(`a Bleeding creature's turn ends: X rolled in the chat (${chat.at(-1)?.formula})`, chat.length === mark + 1 && chat.at(-1).formula === "2d4" && chat.at(-1).flavor.includes("MIGHTYGUARD.Bleeding.Flavor"));
  ok(`…and the Hit Points simply lost: untyped, so no resistance counts (${JSON.stringify(lost)})`, lost.length === 1 && lost[0] === 8);
  bleeder.effects.push({ id: "bu", statuses: new Set(["burning"]), name: "Burning (1d6)", flags: {} }); bleeder.statuses.add("burning");
  lost.length = 0; advance(c5, 2, 0); advance(c5, 2, 1); await settle(); await settle(); await settle();
  ok(`Burning and Bleeding together: the burn, then the bleeding (${JSON.stringify(lost)})`, lost.length === 2 && lost[0][0]?.type === "fire" && lost[1] === 8);
  bleeder.effects = bleeder.effects.filter(e => e.id !== "bu"); bleeder.statuses.delete("burning");
  const hpUpdate = (from, to, extra = {}) => { bleeder.system.attributes.hp.value = to;
    call("updateActor", bleeder, { system: { attributes: { hp: { value: to, ...extra } } } }, { dnd5e: { hp: { value: from, temp: 0 } } }, "gm"); };
  hpUpdate(20, 15); await settle();
  ok("losing Hit Points doesn't stop the bleeding", removed.length === 0);
  call("updateActor", bleeder, { system: { attributes: { hp: { temp: 5 } } } }, { dnd5e: { hp: { value: 15, temp: 0 } } }, "gm"); await settle();
  ok("…nor do temporary Hit Points", removed.length === 0);
  settings.set("burningDamage", "off"); hpUpdate(15, 18); await settle(); settings.set("burningDamage", "apply");
  ok("set to Off: healing leaves it alone", removed.length === 0);
  hpUpdate(18, 22); await settle();
  ok(`regaining Hit Points ends it (${removed})`, JSON.stringify(removed) === '["bl"]' && !bleeder.effects.length);
  console.log = realLog;

  // Primal Combat's side initiative: the combat's turn points at the first creature of the acting side, and the
  // whole side acts together (round 1: the party members who beat the enemies, the enemies, then the whole party)
  const sideOf = new Map();
  game.modules.set("primal-combat", { active: true, api: { getMode: c => c.mode, getSide: c => sideOf.get(c.id) } });
  const mk = (id, name, side, burning, dodging) => {
    const effects = [];
    if (burning) effects.push({ id: id + "-b", statuses: new Set(["burning"]), name: "Burning (1d6)", flags: {} });
    if (dodging) effects.push({ id: id + "-d", statuses: new Set(["dodging"]), name: "Dodging", flags: {} });
    const actor = { documentName: "Actor", name, statuses: new Set(effects.flatMap(e => [...e.statuses])), effects, system: {}, items: [],
      applyDamage: async d => damage.push([name, d[0].value]),
      deleteEmbeddedDocuments: async (type, ids) => { dodgeEnded.push(...ids); actor.effects = actor.effects.filter(e => !ids.includes(e.id)); } };
    sideOf.set(id, side);
    return { id, actor, name };
  };
  const dodgeEnded = [];
  const fast = mk("p1", "Fast", "party"), gob = mk("e1", "Goblin", "enemies"), orc = mk("e2", "Orc", "enemies", true, true),
    hero = mk("p2", "Hero", "party", true, true), mage = mk("p3", "Mage", "party");
  const sc = { id: "side", mode: "side", started: true, round: 1, turn: 0, turns: [fast, gob, orc, hero, mage] };
  sc.combatant = sc.turns[0];
  sc.combatants = new Map(sc.turns.map(c => [c.id, c]));
  const sideTurn = (round, turn) => { const prior = { round: sc.round, turn: sc.turn, combatantId: sc.combatant?.id };
    sc.previous = prior; sc.round = round; sc.turn = turn; sc.combatant = sc.turns[turn];
    call("updateCombat", sc, { round, turn }, { direction: 1 }, "gm");
    call("combatTurnChange", sc, prior, { round, turn, combatantId: sc.combatant.id }); };
  const burnedNames = () => damage.slice(mark2).map(d => d[0]);
  let mark2 = damage.length;
  sideTurn(1, 1); await settle(); await settle();
  ok("side initiative, round 1: the party members who beat the enemies end their turn (none burning: nothing)", burnedNames().length === 0);
  ok("…and the Orc's Dodging ends as the enemies' turn starts", dodgeEnded.includes("e2-d") && !dodgeEnded.includes("p2-d"));
  sideTurn(1, 3); await settle(); await settle();
  ok(`the enemies' turn ends: the Orc burns though the Goblin is first in the order (${burnedNames()})`, JSON.stringify(burnedNames()) === '["Orc"]');
  ok("…and the Hero's Dodging ends as the party's turn starts", dodgeEnded.includes("p2-d"));
  mark2 = damage.length;
  sideTurn(2, 1); await settle(); await settle();
  ok(`the whole party's turn ends: the Hero burns, once (${burnedNames()})`, JSON.stringify(burnedNames()) === '["Hero"]');
  mark2 = damage.length;
  sideTurn(2, 3); await settle(); await settle();
  ok(`round 2, the enemies' turn ends again: only the Orc (${burnedNames()})`, JSON.stringify(burnedNames()) === '["Orc"]');
  mark2 = damage.length;
  sc.mode = "standard"; quietly(sc, 3, 1);
  sideTurn(3, 2); await settle(); await settle();
  ok("the same combat in individual initiative: only the creature whose turn ended (the Goblin, not burning: nothing)", burnedNames().length === 0);
  sc.mode = "side"; quietly(sc, 4, 1); mark2 = damage.length;
  game.modules.get("primal-combat").active = false;
  sideTurn(4, 2); await settle(); await settle();
  ok("Primal Combat turned off: only the creature whose turn ended (the Goblin isn't burning, so nothing)", burnedNames().length === 0);
  game.modules.get("primal-combat").active = true;
  const pcApi = game.modules.get("primal-combat").api;
  pcApi.getActingMembers = c => c.turns.filter(t => sideOf.get(t.id) === sideOf.get(c.combatant.id) && c.round > 0);
  quietly(sc, 5, 1); mark2 = damage.length;
  sideTurn(5, 3); await settle(); await settle();
  ok(`with Primal Combat's own list of who's acting, worked out for the turn that ended (${burnedNames()})`, JSON.stringify(burnedNames()) === '["Orc"]');
  // Primal Combat's turn signal says who ended the turn (here: the whole party, Hero burning), and wins over the order
  pcApi.getTurnEnders = () => [fast, hero, mage];
  quietly(sc, 6, 3); mark2 = damage.length;
  sideTurn(7, 1); await settle(); await settle();
  ok(`with Primal Combat's turn signal: everyone it says ended their turn (${burnedNames()})`, JSON.stringify(burnedNames()) === '["Hero"]');
  pcApi.getTurnEnders = () => [gob];
  mark2 = damage.length;
  sideTurn(7, 3); await settle(); await settle();
  ok(`…and only them: it says the Goblin ended alone, so the burning Orc on that side doesn't burn (${burnedNames()})`, burnedNames().length === 0);
  delete pcApi.getTurnEnders;
  game.modules.delete("primal-combat");
}

/* ---------- 3b. Values that name a damage type, and Bleeding's value ---------- */
{
  const n = normalizeStatusValue;
  ok("Burning's value can end in a damage type: 2d4 acid → 2d4 Acid", n("2d4 acid", "burning") === "2d4 Acid" && n(" 4D6  Fire ", "burning") === "4d6 Fire" && n("2d4", "burning") === "2d4");
  ok("…but not anything else's, and not a word that isn't a damage type", n("2d4 acid") === null && n("2d4 acid", "valor") === null && n("2d4 banana", "burning") === null);
  const fx = (statuses, name, flags = {}) => ({ statuses: new Set(statuses), name, flags });
  ok("read back from the name: Burning (4d6 Fire), Burning 2d4 acid", effectStatusValue(fx(["burning"], "Burning (4d6 Fire)")) === "4d6 Fire" && effectStatusValue(fx(["burning"], "Burning 2d4 acid")) === "2d4 Acid");
  ok("split for rolling: the formula and the type", JSON.stringify(splitValueType("2d4 Acid")) === '{"formula":"2d4","type":"acid"}' && splitValueType("1d6").type === null);
  ok("the pane's Fire / Acid buttons: dice and type put together, fire left unwritten",
    valueWithType("2d4", "acid") === "2d4 Acid" && valueWithType("d6", "fire") === "1d6" && valueWithType("4d6", null) === "4d6" && valueWithType("banana", "acid") === null);
  const onFire = effects => ({ documentName: "Actor", statuses: new Set(["burning"]), effects, system: {} });
  ok("the aura's look: acid if the Burning names acid, fire otherwise, none if not Burning",
    burningType(onFire([fx(["burning"], "Burning (2d4 Acid)")])) === "acid" && burningType(onFire([fx(["burning"], "Burning")])) === "fire"
    && burningType({ documentName: "Actor", statuses: new Set(), effects: [], system: {} }) === null);
  ok("Bleeding takes a value too (dnd5e's own Bleeding status), 1d4 if it doesn't say", valueStatusOf(fx(["bleeding"], "Bleeding")) === "bleeding"
    && statusValue({ documentName: "Actor", statuses: new Set(["bleeding"]), effects: [fx(["bleeding"], "Bleeding")], system: {} }, "bleeding") === "1d4"
    && effectStatusValue(fx(["bleeding"], "Bleeding (2d4)")) === "2d4");
}

/* ---------- 3c. Bewildered, Distracted, Staggered, Drakkenheim Madness ---------- */
{
  const notes = [];
  ui.notifications.warn = m => notes.push(m);
  // dnd5e's Hooks.call: stops at the first hook that returns false
  const preUse = (activity, usage = {}) => { for (const f of hooks["dnd5e.preUseActivity"] ?? []) if (f(activity, usage, {}, {}) === false) return false; return true; };
  const mkActor = (name, statuses) => {
    const actor = { documentName: "Actor", uuid: `Actor.${name}`, name, statuses: new Set(statuses), system: {}, items: new Map() };
    actor.effects = statuses.map(s => { const e = { id: `${name}-${s}`, statuses: new Set([s]), name: s, flags: {}, isOwner: true };
      e.update = async d => { for (const [k, v] of Object.entries(d)) if (k.startsWith("flags.primal-status.")) (e.flags["primal-status"] ??= {})[k.split(".")[2]] = v; }; return e; });
    return actor;
  };
  const act = (actor, data) => ({ id: data.id ?? "act", actor, activation: { type: "action" }, ...data, item: { id: "item", name: "Thing", type: "weapon", ...(data.item ?? {}) } });
  const spell = (actor, level, activation = "action") => act(actor, { type: "utility", activation: { type: activation }, item: { name: `Spell ${level}`, type: "spell", system: { level } } });

  ok("the GM setting is there, on by default, shown in Module Settings", settingsCfg.get("primal-status.drakkenheimAutomation")?.default === true && settingsCfg.get("primal-status.drakkenheimAutomation").config === true);
  game.user.isGM = false;
  const mage = mkActor("Mage", ["bewildered"]);
  ok("Bewildered: a 1st-level spell can't be cast, and the player is told why", preUse(spell(mage, 1)) === false && notes.at(-1)?.includes("MIGHTYGUARD.Limits.Bewildered"));
  ok("…nor a cantrip with a casting time of a Bonus Action or a Reaction", preUse(spell(mage, 0, "bonus")) === false && preUse(spell(mage, 0, "reaction")) === false);
  ok("…but a cantrip with a casting time of an action can, and so can a weapon", preUse(spell(mage, 0, "action")) === true && preUse(act(mage, { type: "attack", attack: { type: { classification: "weapon" } } })) === true);
  const scout = mkActor("Scout", ["distracted"]);
  ok("Distracted: nothing used as a Reaction", preUse(act(scout, { activation: { type: "reaction" } })) === false && notes.at(-1)?.includes("MIGHTYGUARD.Limits.Distracted"));
  ok("…an action is fine", preUse(act(scout, {})) === true);
  ok("no condition: anything goes", preUse(spell(mkActor("Free", []), 3, "reaction")) === true);

  // Staggered: one weapon attack during its own turn
  const brute = mkActor("Brute", ["staggered"]), other = mkActor("Other", []);
  const bruteC = { id: "br", actor: brute }, otherC = { id: "ot", actor: other };
  game.combat = { id: "cmb", started: true, round: 1, turn: 0, combatant: bruteC, turns: [bruteC, otherC] };
  const sword = act(brute, { id: "sw", type: "attack", attack: { type: { classification: "weapon" } } });
  const fist = act(brute, { id: "un", type: "attack", attack: { type: { classification: "unarmed" } } });
  const bolt = act(brute, { id: "fb", type: "attack", attack: { type: { classification: "spell" } }, item: { type: "spell", system: { level: 0 } } });
  const rolled = activity => { for (const f of hooks["dnd5e.rollAttackV2"] ?? []) f([], { subject: activity }); };
  ok("Staggered, its turn: the first weapon attack is allowed", preUse(sword) === true);
  rolled(sword); await settle();
  ok("…and noted on the Staggered effect once it's rolled", brute.effects[0].flags["primal-status"]?.attackedTurn === "cmb:1:0");
  ok("…then no second weapon attack, or unarmed strike, this turn", preUse(sword) === false && preUse(fist) === false && notes.at(-1)?.includes("MIGHTYGUARD.Limits.Staggered"));
  ok("…a spell attack isn't a weapon attack", preUse(bolt) === true);
  game.combat.turn = 1; game.combat.combatant = otherC;
  ok("outside its turn (an opportunity attack, say): not limited", preUse(sword) === true);
  game.combat.round = 2; game.combat.turn = 0; game.combat.combatant = bruteC;
  ok("its next turn: one again", preUse(sword) === true);
  rolled(sword); await settle();
  settings.set("drakkenheimAutomation", false);
  ok("setting off: nothing is stopped", preUse(sword) === true && preUse(spell(mage, 1)) === true);
  settings.set("drakkenheimAutomation", true);

  // The GM is asked, and can go ahead
  game.user.isGM = true;
  const used = [];
  const owned = { ...sword, use: async () => { used.push(preUse(owned)); } };
  brute.items = new Map([["item", { system: { activities: new Map([["sw", owned]]) } }]]);
  let asked = 0, answer = true;
  foundry.applications.api.DialogV2 = { confirm: async () => { asked++; return answer; } };
  ok("the GM is stopped too, but asked whether to go ahead", preUse(sword) === false);
  await settle(); await settle(); await settle();
  ok(`…and going ahead uses it after all, this once (${used})`, asked === 1 && JSON.stringify(used) === "[true]" && preUse(sword) === false);
  await settle(); await settle(); await settle();
  answer = false; used.length = 0;
  preUse(sword); await settle(); await settle();
  ok("…or not, if the GM says no", asked === 3 && used.length === 0);
  delete foundry.applications.api.DialogV2; game.user.isGM = true;
  delete game.combat;

  // Drakkenheim Madness: a trait is rolled when it starts
  const crazed = mkActor("Crazed", []);
  game.users.contents = [{ id: "gm", isGM: true }, { id: "p1", isGM: false }, { id: "p2", isGM: false }];
  crazed.testUserPermission = (u, level) => u.id === "p1" && level === "OWNER";
  const madness = { id: "mad", statuses: new Set(["drakkenheimMadness"]), parent: crazed, flags: {}, name: "Drakkenheim Madness" };
  madness.update = async d => { madness.updated = d; };
  const before = chat.length;
  call("createActiveEffect", madness, {}, "gm"); await settle(); await settle(); await settle();
  ok(`Drakkenheim Madness: 1d10 picks a trait, written on the effect (${JSON.stringify(madness.updated)})`, madness.updated?.["flags.primal-status.madnessTrait"] === 10 && madness.updated.description.includes("MIGHTYGUARD.Madness.Trait10"));
  ok(`…and whispered to the GM and the creature's owners (${JSON.stringify(chat.at(-1)?.whisper)})`, chat.length === before + 1 && chat.at(-1).formula === "1d10" && JSON.stringify(chat.at(-1).whisper) === '["gm","p1"]');
  madness.flags = { "primal-status": { madnessTrait: 3 } };
  call("createActiveEffect", madness, {}, "gm"); await settle();
  ok("…a trait it already has is kept", chat.length === before + 1);
  ok("the ten traits are all written out", Array.from({ length: 10 }, (_, i) => `MIGHTYGUARD.Madness.Trait${i + 1}`).every(k => typeof k === "string"));
  delete game.users.contents;
}

/* ---------- 4. When the combat ends: short effects a save would end ---------- */
{
  const deleted = [];
  const effect = (id, data) => ({ id, name: id, statuses: new Set(), flags: {}, description: "", duration: {}, ...data });
  const holdPerson = { documentName: "Item", name: "Hold Person", system: { duration: { value: 1, units: "minute" },
    description: { value: "<p>Choose a Humanoid... It must succeed on a Wisdom saving throw or have the Paralyzed condition for the duration. At the end of each of its turns, the target repeats the save, ending the spell on itself on a success.</p>" } } };
  const bless = { documentName: "Item", name: "Bless", system: { duration: { value: 1, units: "minute" }, description: { value: "<p>You bless up to three creatures. Whenever a target makes an attack roll or a saving throw before the spell ends, it adds 1d4.</p>" } } };
  items.set("Item.hold", holdPerson); items.set("Item.bless", bless);
  const list = [
    effect("hold", { origin: "Item.hold", duration: { value: 1, units: "minutes" }, statuses: new Set(["paralyzed"]) }),            // the item says so
    effect("overtime", { duration: { value: 10, units: "rounds" }, system: { changes: [{ key: "flags.midi-qol.OverTime", value: "turn=end,saveAbility=con,saveDC=13,label=Poison" }] } }),
    effect("overtimeKept", { duration: { value: 10, units: "rounds" }, system: { changes: [{ key: "flags.midi-qol.OverTime", value: "turn=end,saveAbility=con,saveDC=13,saveRemove=false" }] } }),
    effect("dae", { duration: { seconds: 12 }, flags: { dae: { specialDuration: ["isSaveSuccess.wis"] } } }),                      // Foundry 13's seconds
    effect("own text", { duration: { rounds: 3 }, description: "<p>Frozen until it succeeds on a Constitution save (save ends).</p>" }),
    effect("item duration", { origin: "Item.hold" }),                                                                                // no duration of its own: its item's 1 minute
    effect("bless", { origin: "Item.bless", duration: { value: 1, units: "minutes" } }),                                          // no save: kept
    effect("too long", { origin: "Item.hold", duration: { value: 10, units: "minutes" } }),                                       // more than a minute: kept
    effect("no duration", { description: "<p>(save ends)</p>" }),                                                                  // lasts until removed: kept
    effect("failure only", { duration: { value: 1, units: "minutes" }, flags: { dae: { specialDuration: ["isSaveFailure"] } } })   // kept
  ];
  const hero = { documentName: "Actor", name: "Hero", effects: list, deleteEmbeddedDocuments: async (type, ids) => { deleted.push(...ids); hero.effects = hero.effects.filter(e => !ids.includes(e.id)); } };
  const combat = { id: "c2", started: true, round: 3, combatants: [{ actor: hero }, { actor: hero }] };
  ok("the GM setting is there, on by default", settingsCfg.get("primal-status.saveEndsCombatEnd")?.default === true && settingsCfg.get("primal-status.saveEndsCombatEnd").config === true);
  call("deleteCombat", combat, {}, "gm"); await settle(); await settle();
  ok(`combat ends: effects of 1 minute or less that end on a save come off (${deleted.join(", ")})`, JSON.stringify(deleted.sort()) === JSON.stringify(["dae", "hold", "item duration", "overtime", "own text"].sort()));
  ok("…the rest stay (no save, longer than a minute, no duration, ends on a failure, OverTime that doesn't remove)", ["bless", "too long", "no duration", "failure only", "overtimeKept"].every(id => hero.effects.some(e => e.id === id)));
  ok("…each creature once", new Set(deleted).size === deleted.length);
  ok("the wording it recognises", effectEndsOnSave({ description: "On a successful save, the spell ends." }) && effectEndsOnSave({ description: "The target can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success." })
    && effectEndsOnSave({ description: "At the end of each of its turns, the target can make another Wisdom saving throw. On a success, the spell ends on the target." })
    && !effectEndsOnSave({ description: "On a failed save, the target takes 2d8 damage, or half as much on a successful one." }));
  deleted.length = 0;
  hero.effects = [effect("hold2", { origin: "Item.hold", duration: { value: 1, units: "minutes" } })];
  call("deleteCombat", { id: "c3", started: false, round: 0, combatants: [{ actor: hero }] }, {}, "gm"); await settle();
  ok("a combat that never started: nothing", deleted.length === 0);
  settings.set("saveEndsCombatEnd", false);
  call("deleteCombat", combat, {}, "gm"); await settle();
  ok("setting off: nothing", deleted.length === 0);
  settings.set("saveEndsCombatEnd", true);
  game.users.activeGM = { id: "other", isSelf: false };
  call("deleteCombat", combat, {}, "gm"); await settle();
  ok("only the active GM's client removes them", deleted.length === 0);
  game.users.activeGM = { id: "gm", isSelf: true };
  // an item's own effect (not applied to the creature) is never removed
  ok("an effect an item carries isn't removed", !endsWhenCombatEnds({ parent: { documentName: "Item" }, origin: "Item.hold", duration: { value: 1, units: "minutes" } }));
}

/* ---------- 5. Cover names and Burning's text ---------- */
{
  const se = CONFIG.statusEffects;
  ok("cover statuses are named Cover (Half), Cover (Three-Quarters) and Cover (Total)", se.coverHalf.name === "L:MIGHTYGUARD.Cover.Half" && se.coverThreeQuarters.name === "L:MIGHTYGUARD.Cover.ThreeQuarters" && se.coverTotal.name === "L:MIGHTYGUARD.Cover.Total");
  ok("…keeping their IDs and images", se.coverHalf.img === "c1.svg" && se.coverTotal.id === "coverTotal");
  ok("Burning gets its Monsters of Drakkenheim text and sits in that section", se.burning.description === "L:MIGHTYGUARD.Desc.Burning" && isDrakkenheimStatus("burning") && !isDrakkenheimStatus("prone"));
  se.burning.description = "<p>Another module's text</p>"; registerStatuses();
  ok("…but another module's text for it is left alone", se.burning.description === "<p>Another module's text</p>");
}

/* ---------- 6. Frozen and Entangled: forming, holding, ending ---------- */
{
  const kinds = t => fxs(t).map(c => c._mgRank).sort((a, b) => a - b).join();
  A.actor.statuses = new Set(["frozen", "immobilized", "defenseless"]); step();
  const ice = fxs(A)[0];
  ok("Frozen: the ice appears", kinds(A) === "5.7");
  const tintAt = () => A.mesh.tint;
  step(50); const early = tintAt();
  for (let i = 0; i < 60; i++) step();
  ok(`…turning the art icy blue as it forms (${early.toString(16)} → ${tintAt().toString(16)})`, early !== tintAt() && (tintAt() & 0xFF) === 0xFF && ((tintAt() >> 16) & 0xFF) < 0xB0);
  const crystals = ice.children.find(c => c.name === "ring");   // the ring, its crystals and icicles
  const held = crystals.calls, drawn = held.length; step(); step();
  ok(`…and once formed, the block and crystals are held, not redrawn every frame (${drawn} calls)`, drawn > 50 && crystals.calls === held);
  A.actor.statuses = new Set(); step();
  ok("the status ends: the ice shatters before it goes", kinds(A) === "5.7" && !ice.destroyed);
  step(300);
  ok("…pieces flying (the block is redrawn as it breaks)", crystals.calls !== held && crystals.calls.length > 0 && !ice.destroyed);
  step(700);
  ok("…then it's gone and the art is as before", fxs(A).length === 0 && ice.destroyed && A.mesh.tint === 0xFFFFFF);
  // back on while it shatters: starts again from the beginning
  A.actor.statuses = new Set(["frozen"]); step(); step(800); A.actor.statuses = new Set(); step(); step(200);
  const breaking = fxs(A)[0];
  A.actor.statuses = new Set(["frozen"]); step();
  ok("Frozen again while it was shattering: a fresh block", fxs(A).length === 1 && breaking.destroyed && !fxs(A)[0].destroyed);
  // turned off: at once, no shattering
  settings.set("frozenFx", false); step();
  ok("turning the animation off removes it at once", fxs(A).length === 0);
  settings.set("frozenFx", true); A.actor.statuses = new Set(); step();
  // Entangled
  A.actor.statuses = new Set(["entangled", "immobilized", "defenseless"]); step();
  ok("Entangled: the vines appear", kinds(A) === "2.95");
  step(50); const sprouting = A.mesh.tint;
  for (let i = 0; i < 90; i++) step();
  ok(`…grown in, the art tinged green as they grow (${sprouting.toString(16)} → ${A.mesh.tint.toString(16)})`, A.mesh.tint !== sprouting && ((A.mesh.tint >> 8) & 255) > (A.mesh.tint & 255));
  A.actor.statuses = new Set(); step(); step(300);
  ok("the status ends: the vines snap and wither before they go", fxs(A).length === 1);
  step(500);
  ok("…then they're gone", fxs(A).length === 0 && A.mesh.tint === 0xFFFFFF);
  // Still quality: no forming or ending, shown settled
  settings.set("animationQuality", "still");
  A.actor.statuses = new Set(["frozen", "entangled"]); step();
  ok("Still: both shown settled straight away", fxs(A).length === 2);
  A.actor.statuses = new Set(); step();
  ok("Still: gone at once when the statuses end", fxs(A).length === 0);
  settings.set("animationQuality", "full");
  // a token set to show no animations: no shattering either
  A.actor.statuses = new Set(["frozen"]); step(); step(800);
  A.document.flags = { "primal-status": { animations: false } }; A.actor.statuses = new Set(); step();
  ok("a token set to show no animations: removed at once", fxs(A).length === 0);
  A.document.flags = {};
  // drawing at many sizes and moments without errors (the mocks throw on non-finite numbers)
  for (const w of [12, 50, 140, 400]) { A.w = A.h = w; A.actor.statuses = new Set(["frozen", "entangled"]); for (let i = 0; i < 30; i++) step(37); A.actor.statuses = new Set(); for (let i = 0; i < 30; i++) step(37); }
  ok("drawn at sizes from tiny to huge, forming and ending, without errors", fxs(A).length === 0);
  A.w = A.h = 100;
}

/* ---------- 7. Frozen turns the art itself to ice ---------- */
{
  class Sprite extends Obs { constructor(t) { super(); this.texture = t; this.anchor = { set: v => this._anchor = v }; } }
  class ColorMatrixFilter { constructor() { this.matrix = null; } destroy() { this.gone = true; } }
  PIXI.Sprite = Sprite; PIXI.ColorMatrixFilter = ColorMatrixFilter;
  const tex = { width: 200, height: 200, destroy() { this.gone = true; } };
  A.mesh.texture = tex; A.document.texture.scaleX = -1;
  A.actor.statuses = new Set(["frozen"]); step();
  const ice = fxs(A)[0], statue = ice.children.find(c => c instanceof Sprite);
  ok("a copy of the token's own art is laid over it", !!statue && statue.texture === tex);
  const m = statue?.filters?.[0]?.matrix ?? [];
  const tone = L => [0, 5, 10].map(k => Math.max(0, Math.min(1, (m[k] + m[k + 1] + m[k + 2]) / (0.299 + 0.587 + 0.114) * L * (0.299 + 0.587 + 0.114) + m[k + 4])));
  const mid = tone(0.5), dark = tone(0.15), light = tone(0.9);
  ok(`…coloured as ice: dark teal shadows, cyan midtones, near-white highlights (${[dark, mid, light].map(c => c.map(v => v.toFixed(2)).join("/")).join(", ")})`,
    m.length === 20 && dark[2] > dark[0] * 2 && mid[2] > mid[0] && mid[1] > mid[0] && light.every(v => v > 0.8));
  ok("…mirrored and sized like the art, fading in as it freezes", statue._s?.[0] === -0.5 && statue._s?.[1] === 0.5 && statue.alpha < 1);
  for (let i = 0; i < 70; i++) step();
  ok("…solid ice once frozen", statue.alpha === 1);
  A.actor.statuses = new Set(); step(); step(600);
  ok("as it shatters the ice art goes, and the art shows through", statue.alpha === 0 && !statue.destroyed);
  step(700);
  ok("…then it's removed, leaving the token's own image untouched", statue.destroyed && !tex.gone && fxs(A).length === 0);
  A.document.ring = { enabled: true };
  A.actor.statuses = new Set(["frozen"]); step();
  ok("a token ring: no copy (its art is drawn specially), a cold tint and frost instead", !fxs(A)[0].children.some(c => c instanceof Sprite));
  A.actor.statuses = new Set(); step(); step(1000);
  delete A.document.ring; delete PIXI.Sprite; delete PIXI.ColorMatrixFilter; A.document.texture.scaleX = 1;
}
