// Desperation attacks, a hidden GM option: the setting, who qualifies, one chance per turn, the
// automatic hit, 1.5 times maximum damage, Midi-QOL's hit check and the chat card.
//   node desperation.mjs <path to scripts/primal-status.js>
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

/* ---------- Test doubles ---------- */
class OperatorTerm { constructor({ operator }) { this.operator = operator; } get total() { return undefined; } }
class NumericTerm { constructor({ number, options = {} }) { this.number = number; this.options = options; } get total() { return this.number; } get flavor() { return this.options.flavor ?? ""; } }
class Die { constructor(faces, results, flavor = "", options = {}) { this.faces = faces; this.results = results.map(r => typeof r === "number" ? { result: r, active: true } : r); this.options = { flavor, ...options }; }
  get flavor() { return this.options.flavor ?? ""; } get total() { return this.results.reduce((t, r) => r.active !== false && !r.discarded ? t + r.result : t, 0); } }
foundry.dice = { terms: { OperatorTerm, NumericTerm } };
const evalTotal = terms => { let t = 0, s = 1; for (const x of terms) { if (x instanceof OperatorTerm) { s = x.operator === "-" ? -1 : 1; continue; } t += s * x.total; s = 1; } return t; };
const mkRoll = (terms, options = {}) => { const roll = new Roll("x"); Object.assign(roll, { terms, options, _evaluated: true });
  Object.defineProperty(roll, "dice", { get: () => roll.terms.filter(t => t instanceof Die) });
  roll._total = evalTotal(terms); roll._evaluateTotal = () => evalTotal(roll.terms);
  roll.resetFormula = () => { roll._formula = roll.terms.map(x => x instanceof OperatorTerm ? ` ${x.operator} ` : x instanceof Die ? `${x.results.length}d${x.faces}` : `${x.number}${x.flavor ? `[${x.flavor}]` : ""}`).join(""); };
  return roll; };
const attackRoll = (natural, mod = 5, options = {}, dieOptions = {}) => { const r = mkRoll([new Die(20, [natural], "", { criticalSuccess: 20, criticalFailure: 1, ...dieOptions }), new OperatorTerm({ operator: "+" }), new NumericTerm({ number: mod })], options); r.d20 = r.terms[0]; return r; };
let randoms = [];
CONFIG.Dice.randomUniform = () => randoms.length ? randoms.shift() : 0.99;
CONFIG.Dice.D20Roll = { ADV_MODE: { NORMAL: 0, ADVANTAGE: 1, DISADVANTAGE: -1 } };

const mkActor = (id, hp, extra = {}) => ({ uuid: `Actor.${id}`, id, name: id, type: "character", hasPlayerOwner: true, statuses: new Set(), effects: [],
  system: { attributes: { hp: { value: hp[0], max: hp[1] }, ac: { value: 15 } } }, ...extra });
const hero = mkActor("hero", [3, 40]);
const orc = mkActor("orc", [30, 30], { type: "npc", hasPlayerOwner: false }); orc.system.attributes.ac.value = 15;
const ogre = mkActor("ogre", [60, 60], { type: "npc", hasPlayerOwner: false }); ogre.system.attributes.ac.value = 11;
const orcT = { actor: orc }, ogreT = { actor: ogre };
const combat = { id: "c1", started: true, round: 2, turn: 1, combatants: [{ actor: hero }, { actor: orc }, { actor: ogre }] };
game.combat = combat; game.combats = [combat];
const activity = { uuid: "Item.sword.Activity.atk", actor: hero, item: { type: "weapon", actor: hero } };
const pre = (config, dialog = {}) => { for (const f of hooks["dnd5e.preRollV2"] ?? []) f(config, dialog, { data: { flavor: "Sword" } }); return config; };
const attackConfig = (subject = activity) => pre({ hookNames: ["attack", "d20Test", ""], subject, rolls: [{ parts: ["@mod"], options: {} }] });
const damageConfig = (subject = activity, extra = {}, dialog = {}) => pre({ hookNames: ["damage", ""], subject, rolls: [{ parts: ["1d8"], options: {} }, { parts: ["1d6"], options: {} }], ...extra }, dialog);
const check = c => c.rolls[0].options.mgDesperationCheck;

/* ---------- 1. The setting ---------- */
{
  const cfg = settingsCfg.get("primal-status.desperationAttacks");
  ok("a world setting (so players never see it in Module Settings), off until the GM turns it on", cfg?.scope === "world" && cfg.config === true && cfg.default === false && cfg.type === Boolean);
  game.user.targets = new Set([orcT]);
  ok("while it's off, nothing happens", !check(attackConfig()));
  settings.set("desperationAttacks", true);
}

/* ---------- 2. Who gets the chance, once per turn ---------- */
{
  let c = attackConfig();
  ok(`a player's character at 10% of its Hit Points or less, in combat: the attack gets its chance (${JSON.stringify(check(c))})`, check(c)?.actor === hero.uuid && check(c).needed === 15 && check(c).turn === "c1:2:1");
  orc.statuses = new Set(["coverHalf"]); game.user.targets = new Set([orcT, ogreT]);
  ok("…it must hit every target, counting cover (AC 15 + half cover)", check(attackConfig()).needed === 17);
  orc.statuses = new Set(); game.user.targets = new Set([orcT]);
  hero.system.attributes.hp.value = 4;
  ok("4 of 40 is exactly 10%: still counts", !!check(attackConfig()));
  hero.system.attributes.hp.value = 5;
  ok("above 10%: no chance", !check(attackConfig()));
  hero.system.attributes.hp.value = 0;
  ok("at 0 Hit Points: no chance", !check(attackConfig()));
  hero.system.attributes.hp.value = 3;
  const npc = mkActor("npc", [1, 40], { type: "npc", hasPlayerOwner: false });
  ok("a monster: no chance", !check(attackConfig({ uuid: "Item.claw.Activity.atk", actor: npc, item: { actor: npc } })));
  const unowned = mkActor("ally", [1, 40], { hasPlayerOwner: false });
  ok("a character no player owns: no chance", !check(attackConfig({ uuid: "Item.x.Activity.atk", actor: unowned, item: { actor: unowned } })));
  game.combat = null; game.combats = [];
  ok("outside combat: no chance", !check(attackConfig()));
  game.combat = combat; game.combats = [combat];
  ok("other rolls (saving throws) aren't touched", !pre({ hookNames: ["savingThrow", "d20Test", ""], subject: hero, rolls: [{ options: {} }] }).rolls[0].options.mgDesperationCheck);

  // The chance is rolled once the dice are rolled; it fails (0.7)
  c = attackConfig(); let roll = attackRoll(9, 5, { ...c.rolls[0].options });
  randoms = [0.7]; afterRollEvaluated(roll);
  ok("the chance fails half the time: a normal roll (9 + 5 = 14)", !roll.options.mgDesperation && roll._total === 14 && !roll.options.mgDesperationCheck);
  ok("…and that was the turn's chance: the next attack this turn gets none", !check(attackConfig()));
  combat.turn = 2;
  c = attackConfig();
  ok("next turn it has a chance again", !!check(c));
  roll = attackRoll(4, 5, { ...c.rolls[0].options });
  randoms = [0.3, 0.3]; afterRollEvaluated(roll);
  ok(`it comes up: a Desperation Attack that hits AC 15 (natural ${roll.d20.results[0].result}, total ${roll._total})`, roll.options.mgDesperation === true && roll._total >= 15 && roll.d20.results[0].result === 13 && roll._total === 18);
  ok("…never shown as a critical or a natural 1", roll.d20.results[0].result < 20 && roll.d20.results[0].result > 1);
  ok("…and no second chance that turn", !check(attackConfig()));
  afterRollEvaluated(roll);
  ok("rolling it through again changes nothing", roll._total === 18);
}

/* ---------- 2b. The chance is the GM's setting ---------- */
{
  const cfg = settingsCfg.get("primal-status.desperationChance");
  ok("the chance is a world setting too (hidden from players), in percent from 0 to 100, 50 by default",
    cfg?.scope === "world" && cfg.config === true && cfg.type === Number && cfg.default === 50 && cfg.range?.min === 0 && cfg.range?.max === 100);
  const comesUp = (turn, percent, random) => {
    combat.turn = turn; settings.set("desperationChance", percent);
    const c = attackConfig(); const r = attackRoll(4, 5, { ...c.rolls[0].options });
    randoms = [random, 0.3]; afterRollEvaluated(r); return r.options.mgDesperation === true;
  };
  ok("set to 30%: a chance roll of 0.29 comes up", comesUp(10, 30, 0.29));
  ok("…and 0.31 doesn't", !comesUp(11, 30, 0.31));
  ok("0%: never, even on the lowest roll", !comesUp(12, 0, 0));
  ok("100%: every time, even on the highest roll", comesUp(13, 100, 0.999));
  ok("75%: 0.74 comes up, 0.76 doesn't", comesUp(14, 75, 0.74) && !comesUp(15, 75, 0.76));
  ok("a setting that can't be read counts as 50%", comesUp(16, undefined, 0.49) && !comesUp(17, "x", 0.51));
  settings.set("desperationChance", 50); combat.turn = 2;
}

/* ---------- 3. The automatic hit ---------- */
{
  const force = (natural, mod, needed, options = {}, dieOptions = {}) => { const r = attackRoll(natural, mod, { mgDesperation: true, mgDesperationNeeded: needed, ...options }, dieOptions); afterRollEvaluated(r); return r; };
  let r = force(16, 5, 15);
  ok("a natural roll that already hits (16 + 5 vs AC 15) is kept", r.d20.results[0].result === 16 && r._total === 21);
  randoms = [0.0]; r = force(20, 5, 15);
  ok(`a natural 20 isn't kept (no critical hit): ${r.d20.results[0].result} + 5 = ${r._total}`, r.d20.results[0].result === 10 && r._total === 15);
  randoms = [0.99]; r = force(3, 5, 15, {}, { criticalSuccess: 19 });
  ok(`a lower critical range (19-20) is respected: ${r.d20.results[0].result}`, r.d20.results[0].result === 18);
  r = force(5, 5, 40);
  ok(`AC 40 can't be hit without a critical: the d20 shows 19 and the total is raised to 40 (${r._total})`, r.d20.results[0].result === 19 && r._total === 40);
  randoms = [0.0]; r = force(1, 5, null);
  ok("no target: a natural 1 becomes a roll that isn't a fumble", r.d20.results[0].result === 2);
  r = force(12, 5, null);
  ok("…any other natural roll is kept", r.d20.results[0].result === 12);
  const adv = attackRoll(4, 5, { mgDesperation: true, mgDesperationNeeded: 15 }, { advantageMode: 1 });
  adv.d20.results = [{ result: 4, active: true }, { result: 2, active: false, discarded: true }];
  randoms = [0.3]; afterRollEvaluated(adv);
  ok(`Advantage: the kept die hits and stays the higher (${adv.d20.results.map(x => x.result)})`, adv.d20.results[0].result === 13 && adv.d20.results[1].result === 2 && adv._total === 18);
  const dis = attackRoll(4, 5, { mgDesperation: true, mgDesperationNeeded: 15 }, { advantageMode: -1 });
  dis.d20.results = [{ result: 4, active: true }, { result: 6, active: false, discarded: true }];
  randoms = [0.3]; afterRollEvaluated(dis);
  ok(`Disadvantage: the kept die hits and stays the lower (${dis.d20.results.map(x => x.result)})`, dis.d20.results[0].result === 13 && dis.d20.results[1].result === 13 && dis._total === 18);
  r = attackRoll(15, 5, { mgDesperation: true, mgDesperationNeeded: 15, mgCritOnHit: { ac: 15 } }); afterRollEvaluated(r);
  ok("an attack that would be an automatic critical (Paralyzed target) isn't one", !r.options.mgCritOnHit && r.options.criticalSuccess === undefined);

  // Midi-QOL: every target is hit, whatever happens after the roll (a Shield, say)
  const t1 = { id: "a" }, t2 = { id: "b" };
  const wf = { attackRoll: { options: { mgDesperation: true } }, targets: new Set([t1, t2]), hitTargets: new Set([t1]), isFumble: true,
    hitDisplayData: { a: { isHit: true, hitClass: "success", hitString: "hits" }, b: { isHit: false, hitClass: "failure", hitString: "misses", hitStyle: "color: red;", hitResultNumeric: "12/3" } } };
  for (const f of hooks["midi-qol.hitsChecked"] ?? []) f(wf);
  ok("Midi-QOL: every target is hit, even one its AC beat (a Shield in reaction)", wf.hitTargets.size === 2 && !wf.isFumble && wf.hitDisplayData.b.isHit === true && wf.hitDisplayData.b.hitClass === "success");
  ok("…and the card shows it as a hit", wf.hitDisplayData.b.hitString === "L:midi-qol.hits" && wf.hitDisplayData.b.hitStyle === "color: green;" && wf.hitDisplayData.b.hitResultNumeric === "--");
  const normal = { attackRoll: { options: {} }, targets: new Set([t1, t2]), hitTargets: new Set([t1]), hitDisplayData: {} };
  for (const f of hooks["midi-qol.hitsChecked"] ?? []) f(normal);
  ok("…other attacks are left alone", normal.hitTargets.size === 1);
}

/* ---------- 4. 1.5 times maximum damage ---------- */
{
  combat.turn = 4;
  let c = attackConfig(); const atk = attackRoll(10, 5, { ...c.rolls[0].options }); randoms = [0.1]; afterRollEvaluated(atk);
  ok("(a Desperation Attack this turn)", atk.options.mgDesperation === true);
  let dialog = {};
  c = damageConfig(activity, {}, dialog);
  ok("the Desperation Attack's damage roll is marked, never critical, Normal as the window's default", c.rolls.every(r => r.options.mgDesperateDamage === hero.uuid && r.options.isCritical === false) && c.isCritical === false && dialog.options?.defaultButton === "normal");
  ok("…only that once", !damageConfig().rolls[0].options.mgDesperateDamage);
  ok("Midi-QOL: its own attack decides, on whichever client rolls the damage", damageConfig(activity, { workflow: { attackRoll: { options: { mgDesperation: true } } } }).rolls[0].options.mgDesperateDamage === hero.uuid
    && !damageConfig(activity, { workflow: { attackRoll: { options: {} } } }).rolls[0].options.mgDesperateDamage);
  const roll = mkRoll([new Die(8, [3], "slashing"), new OperatorTerm({ operator: "+" }), new NumericTerm({ number: 3, options: { flavor: "slashing" } }), new OperatorTerm({ operator: "+" }), new Die(6, [2], "fire")], { mgDesperateDamage: hero.uuid });
  afterRollEvaluated(roll);
  const byType = {}; { let s = 1; for (const x of roll.terms) { if (x instanceof OperatorTerm) { s = x.operator === "-" ? -1 : 1; continue; } byType[x.flavor] = (byType[x.flavor] ?? 0) + s * x.total; s = 1; } }
  ok(`1d8+3 slashing and 1d6 fire: dice at their highest (11 + 6), then half again per type: 16 slashing + 9 fire = ${roll._total}`, roll._total === 25 && byType.slashing === 16 && byType.fire === 9 && roll.terms[0].results[0].result === 8);
  afterRollEvaluated(roll);
  ok("…only once", roll._total === 25);
  hero.statuses = new Set(["weakened"]);
  const weak = mkRoll([new Die(10, [1], "piercing")], { mgDesperateDamage: hero.uuid, mgHalfDamage: true, type: "piercing" });
  afterRollEvaluated(weak);
  ok(`a Weakened character: 10 × 1.5 = 15, then halved to ${weak._total}`, weak._total === 7);
  hero.statuses = new Set();

  // Outside Midi-QOL a new attack ends the wait for damage
  combat.turn = 5; c = attackConfig(); const r = attackRoll(10, 5, { ...c.rolls[0].options }); randoms = [0.1]; afterRollEvaluated(r);
  ok("(a Desperation Attack, waiting for its damage)", r.options.mgDesperation === true);
  attackConfig();
  ok("…another attack in between: that damage isn't boosted", !damageConfig().rolls[0].options.mgDesperateDamage);
}

/* ---------- 5. The chat card ---------- */
{
  class El { constructor(text = "") { this._text = text; this.children = []; this.classes = new Set(); this.removed = false; this.classList = { add: c => this.classes.add(c), contains: c => this.classes.has(c) }; }
    get textContent() { return this._text; } set textContent(v) { this._text = v; this.children = []; }
    prepend(c) { this.children.unshift(c); } setAttribute() {} remove() { this.removed = true; } }
  globalThis.HTMLElement = El; globalThis.document = { createElement: () => new El() };
  const card = ({ header = true, flavor = "Sword - Attack Roll" } = {}) => {
    const root = new El(), title = header ? new El("Sword") : null, flav = new El(flavor), formula = new El("1d20 + 5"), tooltip = new El("13");
    root.querySelector = s => s === ".card-header .title" ? title : null;
    root.querySelectorAll = s => s.includes(".flavor-text") ? [flav] : s.includes(".dice-formula") ? [formula, tooltip] : [];
    return { root, title, flav, formula, tooltip };
  };
  const msg = (rollOptions, flags = {}) => ({ rolls: [{ options: rollOptions }], flags, getAssociatedItem: () => ({ name: "Sword" }) });
  const render = (m, html, hook = "renderChatMessageHTML") => { for (const f of hooks[hook] ?? []) f(m, html); };
  game.user.isGM = false;
  let k = card(); render(msg({ mgDesperation: true }), k.root);
  ok("the card's title says Desperation Attack in place of the attack's name, coloured to stand out", k.title.textContent === "L:MIGHTYGUARD.Desperation.Name" && k.root.classes.has("primal-desperation"));
  ok("…with a flame icon in front", k.title.children.length === 1 && k.title.children[0].className === "fa-solid fa-fire primal-desperation-icon");
  ok("…its flavor too", k.flav.textContent === "L:MIGHTYGUARD.Desperation.Name - Attack Roll");
  // dnd5e 6 fills the card in after core's hook, then calls its own: the card is styled again there
  k.title.textContent = "Sword"; k.formula.removed = false; render(msg({ mgDesperation: true }), k.root, "dnd5e.renderChatMessage");
  ok("styled again once dnd5e has filled the card in (dnd5e.renderChatMessage)", k.title.textContent === "L:MIGHTYGUARD.Desperation.Name" && k.title.children.length === 1 && k.formula.removed);
  render(msg({ mgDesperation: true }), k.root, "dnd5e.renderChatMessage");
  ok("…styling twice changes nothing (one icon)", k.title.textContent === "L:MIGHTYGUARD.Desperation.Name" && k.title.children.length === 1 && k.flav.textContent === "L:MIGHTYGUARD.Desperation.Name - Attack Roll");
  ok("…players don't see the dice or the formula", k.formula.removed && k.tooltip.removed);
  game.user.isGM = true; k = card(); render(msg({ mgDesperation: true }), k.root);
  ok("…the GM still does", !k.formula.removed && !k.tooltip.removed);
  k = card({ header: false, flavor: "Attack Roll" }); render({ rolls: [{ options: { mgDesperateDamage: "x" } }], flags: {} }, k.root);
  ok("a roll card of its own (damage) is named and coloured as well", k.flav.textContent === "L:MIGHTYGUARD.Desperation.Name" && k.root.classes.has("primal-desperation"));
  k = card(); render({ rolls: [], flags: { "midi-qol": { attackRoll: JSON.stringify({ options: { mgDesperation: true } }) } } }, k.root);
  ok("found from Midi-QOL's saved attack roll too", k.root.classes.has("primal-desperation"));
  k = card(); render(msg({}), k.root);
  ok("other cards are left alone", k.title.textContent === "Sword" && !k.root.classes.has("primal-desperation") && !k.formula.removed);
  delete globalThis.HTMLElement; delete globalThis.document;
}
