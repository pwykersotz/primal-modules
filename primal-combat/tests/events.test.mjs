/**
 * Checks for lair actions and other events on an initiative count (scripts/events.mjs, and their place in the turn
 * order in scripts/sides.mjs), run with `node tests/events.test.mjs`.
 *
 * The turn order is sorted the way the module patches Foundry's: compareSides first, then dnd5e's own sort (initiative,
 * then name).
 */
import assert from "node:assert/strict";

/* ---- Stand-ins for Foundry ---- */
const settings = { defaultMode: "standard", autoAdvance: true, autoLairActions: true, sideTurnMarkers: false };
const getProperty = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
const setProperty = (o, p, v) => {
  const ks = p.split(".");
  let x = o;
  for ( const k of ks.slice(0, -1) ) x = (x[k] ??= {});
  x[ks.at(-1)] = v;
  return true;
};
const chat = [];
const gmUser = { isSelf: true };
globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1, SECRET: -2 } };
globalThis.Hooks = { callAll() {}, on() {} };
globalThis.ui = { notifications: { error() {} } };
globalThis.canvas = { ready: false };
globalThis.game = {
  settings: { get: (m, k) => settings[k] },
  i18n: {
    localize: k => k,
    format: (k, data) => `${k}${JSON.stringify(data)}`
  },
  user: { isGM: true },
  userId: "gm",
  users: Object.assign([{ id: "gm", isGM: true }, { id: "player", isGM: false }], { get activeGM() { return gmUser; } }),
  combats: { has: () => true },
  actors: { get: () => null },
  system: { id: "dnd5e" }
};
globalThis.foundry = {
  utils: {
    debounce: fn => fn,
    getProperty, setProperty,
    hasProperty: (o, p) => getProperty(o, p) !== undefined,
    escapeHTML: s => String(s).replace(/</g, "&lt;"),
    deepClone: v => structuredClone(v),
    randomID: () => Math.random().toString(36).slice(2, 18)
  },
  documents: { ChatMessage: { implementation: { async create(data) { chat.push(data); } } } }
};

const Sides = await import(new URL("../scripts/sides.mjs", import.meta.url).href);
const Events = await import(new URL("../scripts/events.mjs", import.meta.url).href);
const MODULE = "primal-combat";

/** dnd5e's Combat5e#_sortCombatants, roughly: initiative (none last), then name. */
function systemSort(a, b) {
  const ia = Number.isFinite(a.initiative) ? a.initiative : -Infinity;
  const ib = Number.isFinite(b.initiative) ? b.initiative : -Infinity;
  if ( ia !== ib ) return ib - ia;
  return a.name.localeCompare(b.name);
}
const sortCombatants = (a, b) => Sides.compareSides(a, b) ?? systemSort(a, b);

let nextId = 1;
class Combatant {
  constructor(combat, data) {
    this.parent = combat;
    this.id = data.id ?? `c${nextId++}`;
    this.name = data.name;
    this.initiative = data.initiative ?? null;
    this.hidden = !!data.hidden;
    this.isDefeated = !!data.defeated;
    this.flags = structuredClone(data.flags ?? {});
    this.actorId = data.actorId ?? null;
    this.actor = data.actor ?? null;
    this.hasPlayerOwner = !!data.pc;
    this.isOwner = true;
    this.visible = true;
    this.token = data.disposition === undefined ? null : { disposition: data.disposition };
    this.isNPC = !data.pc;
  }
  getFlag(scope, key) { return this.flags[scope]?.[key]; }
  async update(changes) {
    Events.onPreUpdateCombatant(this, changes);
    for ( const [k, v] of Object.entries(changes) ) {
      if ( k === "flags" ) {
        for ( const [scope, values] of Object.entries(v) ) {
          for ( const [key, value] of Object.entries(values) ) {
            this.flags[scope] ??= {};
            this.flags[scope][key] = (value && typeof value === "object") ? { ...(this.flags[scope][key] ?? {}), ...value } : value;
          }
        }
      }
      else if ( k.startsWith("flags.") ) setProperty(this, k, v);
      else this[k] = v;
    }
    this.parent.setupTurns();
    return this;
  }
}

class Combat {
  constructor({ mode="standard", enemyInit=null }={}) {
    this.id = `combat${nextId++}`;
    this.round = 0;
    this.turn = null;
    this.flags = { [MODULE]: { mode } };
    if ( enemyInit !== null ) this.flags[MODULE].enemyInit = { value: enemyInit, name: "boss" };
    this.settings = { skipDefeated: false };
    const list = [];
    list.get = id => list.find(c => c.id === id);
    Object.defineProperty(list, "size", { get: () => list.length });
    Object.defineProperty(list, "contents", { get: () => [...list] });
    this.combatants = list;
    this.turns = [];
    this.updates = [];
  }
  get started() { return this.round > 0; }
  get combatant() { return Number.isInteger(this.turn) ? (this.turns[this.turn] ?? null) : null; }
  getFlag(scope, key) { return this.flags[scope]?.[key]; }
  async setFlag(scope, key, value) { this.flags[scope][key] = value; }
  add(data) {
    const c = new Combatant(this, data);
    this.combatants.push(c);
    this.setupTurns();
    return c;
  }
  setupTurns() { this.turns = this.combatants.contents.sort(sortCombatants); return this.turns; }
  getTimeDelta() { return 0; }
  async update(changes, options={}) {
    this.updates.push(changes);
    Object.assign(this, changes);
    Events.onUpdateCombat(this, changes, options);
    await new Promise(r => setTimeout(r, 0));
  }
  async createEmbeddedDocuments(type, data) { return data.map(d => this.add({ ...d, flags: d.flags })); }
  async deleteEmbeddedDocuments(type, ids) {
    for ( const id of ids ) this.combatants.splice(this.combatants.findIndex(c => c.id === id), 1);
    this.setupTurns();
  }
  async updateEmbeddedDocuments(type, updates) {
    for ( const { _id, ...changes } of updates ) await this.combatants.get(_id).update(changes);
  }
  async nextRound() { return this.update({ round: this.round + 1, turn: 0 }); }
}

const eventFlags = (count, extra={}) => ({ [MODULE]: { event: { count, notes: "", remind: true, source: null, ...extra } } });
const names = list => list.map(c => c.name);
const order = combat => names(combat.turns);
const settle = () => new Promise(r => setTimeout(r, 5));

/* ---- Individual initiative: on the count, losing ties ---- */
{
  const combat = new Combat();
  combat.add({ name: "Aria", initiative: 22, pc: true, disposition: 1 });
  combat.add({ name: "Goblin", initiative: 20, disposition: -1 });
  combat.add({ name: "Lair", initiative: 20, flags: eventFlags(20) });
  combat.add({ name: "Bram", initiative: 18, pc: true, disposition: 1 });
  combat.add({ name: "Cole", pc: true, disposition: 1 });
  combat.add({ name: "Ogre", initiative: 19.98, disposition: -1 });
  combat.add({ name: "Quick", initiative: 20.14, disposition: -1 });
  assert.deepEqual(order(combat), ["Aria", "Quick", "Goblin", "Lair", "Ogre", "Bram", "Cole"]);
  assert.equal(Sides.getSide(combat.combatants.find(c => c.name === "Lair")), "event");
  assert.equal(Sides.eventPlacement(combat.combatants.find(c => c.name === "Lair")), null);
  console.log("individual order ok");
}

/* ---- Side initiative: before the enemies if it beats their number, otherwise just after ---- */
function sideCombat() {
  const combat = new Combat({ mode: "side", enemyInit: 15 });
  combat.add({ name: "Aria", initiative: 22, pc: true, disposition: 1 });
  combat.add({ name: "Bram", initiative: 18, pc: true, disposition: 1 });
  combat.add({ name: "Cole", initiative: 12, pc: true, disposition: 1 });
  combat.add({ name: "Dina", initiative: 15, pc: true, disposition: 1 });   // ties the enemies: goes after them
  combat.add({ name: "Gob1", initiative: 15, disposition: -1 });
  combat.add({ name: "Gob2", initiative: 15, disposition: -1 });
  combat.add({ name: "Lair20", initiative: 20, flags: eventFlags(20) });
  combat.add({ name: "Ceiling10", initiative: 10, flags: eventFlags(10) });
  combat.add({ name: "Tide15", initiative: 15, flags: eventFlags(15, { remind: false }) });
  return combat;
}
{
  const combat = sideCombat();
  assert.deepEqual(order(combat), ["Aria", "Bram", "Lair20", "Gob1", "Gob2", "Tide15", "Ceiling10", "Dina", "Cole"]);
  const byName = n => combat.combatants.find(c => c.name === n);
  assert.equal(Sides.eventPlacement(byName("Lair20")), "before");
  assert.equal(Sides.eventPlacement(byName("Tide15")), "after");
  assert.equal(Sides.eventPlacement(byName("Ceiling10")), "after");
  console.log("side order ok");

  /* ---- Walking through the rounds ---- */
  chat.length = 0;
  combat.round = 1; combat.turn = 0;
  const acting = () => names(Sides.getActingMembers(combat));
  const steps = [];
  steps.push([combat.round, acting()]);
  for ( let i = 0; i < 9; i++ ) {
    await Sides.nextSide(combat);
    steps.push([combat.round, acting()]);
  }
  assert.deepEqual(steps, [
    [1, ["Aria", "Bram"]],                         // beat the enemies
    [1, ["Lair20"]],
    [1, ["Gob1", "Gob2"]],
    [1, ["Tide15", "Ceiling10"]],                  // events next to each other go together
    [1, ["Aria", "Bram", "Dina", "Cole"]],         // the whole party
    [2, ["Lair20"]],                               // round 2 opens with the lair action, then the enemies
    [2, ["Gob1", "Gob2"]],
    [2, ["Tide15", "Ceiling10"]],
    [2, ["Aria", "Bram", "Dina", "Cole"]],
    [3, ["Lair20"]]
  ]);
  await settle();
  const reminders = chat.map(m => m.content.match(/<h3>(.*?)<\/h3>/)[1]);
  assert.deepEqual(reminders, ["Lair20", "Ceiling10", "Lair20", "Ceiling10", "Lair20"],
    "one reminder per event per round; Tide15 has reminders off");
  assert.ok(chat.every(m => m.whisper.length === 1 && m.whisper[0] === "gm"), "whispered to the GM");

  // Back a side and forward again: no second reminder.
  await Sides.previousSide(combat);
  assert.deepEqual([combat.round, acting()], [2, ["Aria", "Bram", "Dina", "Cole"]]);
  await Sides.nextSide(combat);
  await settle();
  assert.equal(chat.length, 5);
  await Sides.previousSide(combat);
  await Sides.previousSide(combat);
  assert.deepEqual([combat.round, acting()], [2, ["Tide15", "Ceiling10"]]);
  console.log("side rounds and reminders ok");
}

/* ---- Side initiative with no enemies: events open each round ---- */
{
  const combat = new Combat({ mode: "side" });
  combat.add({ name: "Aria", initiative: 22, pc: true, disposition: 1 });
  combat.add({ name: "Lair", initiative: 20, flags: eventFlags(20) });
  combat.add({ name: "Bram", initiative: 18, pc: true, disposition: 1 });
  assert.deepEqual(order(combat), ["Lair", "Aria", "Bram"]);
  assert.equal(Sides.eventPlacement(combat.turns[0]), "top");
  combat.round = 1; combat.turn = 0;
  await Sides.nextSide(combat);
  assert.deepEqual([combat.round, names(Sides.getActingMembers(combat))], [1, ["Aria", "Bram"]]);
  await Sides.nextSide(combat);
  assert.deepEqual([combat.round, names(Sides.getActingMembers(combat))], [2, ["Lair"]]);
  console.log("no enemies ok");
}

/* ---- Switching mode sorts the order again ---- */
{
  const combat = new Combat({ mode: "standard", enemyInit: 15 });
  combat.add({ name: "Aria", initiative: 22, pc: true, disposition: 1 });
  combat.add({ name: "Lair", initiative: 20, flags: eventFlags(20) });
  combat.add({ name: "Bram", initiative: 18, pc: true, disposition: 1 });
  combat.add({ name: "Gob", initiative: 15, disposition: -1 });
  assert.deepEqual(order(combat), ["Aria", "Lair", "Bram", "Gob"]);
  combat.flags[MODULE].mode = "side";
  Sides.onUpdateCombatOrder(combat, { flags: { [MODULE]: { mode: "side" } } });
  assert.deepEqual(order(combat), ["Aria", "Bram", "Lair", "Gob"]);
  combat.flags[MODULE].mode = "standard";
  Sides.onUpdateCombatOrder(combat, { flags: { [MODULE]: { mode: "standard" } } });
  assert.deepEqual(order(combat), ["Aria", "Lair", "Bram", "Gob"]);
  console.log("mode switch ok");
}

/* ---- Keeping the count ---- */
{
  const combat = new Combat();
  const lair = combat.add({ name: "Lair", initiative: 20, flags: eventFlags(20) });
  await lair.update({ initiative: null });
  assert.equal(lair.initiative, 20, "clearing initiative puts the count back");
  await lair.update({ initiative: 17 });
  assert.equal(lair.initiative, 17);
  assert.equal(lair.flags[MODULE].event.count, 17, "a new number becomes the count");
  await lair.update({ initiative: null });
  assert.equal(lair.initiative, 17);
  // Combat#resetAll clears everyone in one combat update; the counts are put back afterwards.
  const goblin = combat.add({ name: "Goblin", initiative: 12, disposition: -1 });
  const counts = combat.combatants.filter(Sides.isEvent).map(c => ({ _id: c.id, initiative: Sides.eventCount(c) }));
  for ( const c of combat.combatants ) c.initiative = null;
  await Events.restoreCounts(combat, counts);
  assert.equal(lair.initiative, 17);
  assert.equal(goblin.initiative, null);
  // Changing it from the form.
  await Events.updateEvent(lair, { name: "Collapse", count: 8, notes: "Rocks fall", remind: false });
  assert.equal(lair.name, "Collapse");
  assert.equal(lair.initiative, 8);
  assert.deepEqual(Events.getEventData(lair), { count: 8, notes: "Rocks fall", remind: false, source: null });
  console.log("count ok");
}

/* ---- Lair actions come and go with their creature ---- */
{
  const combat = new Combat();
  const dragonActor = { id: "dragon", system: { resources: { lair: { value: true, initiative: 20, inside: false } } }, items: [] };
  const hagActor = {
    id: "hag", system: { resources: { lair: { value: false, initiative: null } } },
    items: [{ name: "Grasping Roots", uuid: "Actor.hag.Item.roots", system: { activities: new Map([["a", { activation: { type: "lair" } }]]) } }]
  };
  const goblinActor = { id: "goblin", system: { resources: { lair: { value: false, initiative: null } } }, items: [] };
  assert.equal(Events.lairCount(dragonActor), 20);
  assert.equal(Events.lairCount(hagActor), 20, "lair action items but no count: 20");
  assert.equal(Events.lairCount(goblinActor), null);

  const join = data => {
    const c = combat.add(data);
    Events.onCreateCombatant(c);
    return c;
  };
  const dragon1 = join({ name: "Red Dragon", actorId: "dragon", actor: dragonActor, disposition: -1, initiative: 14 });
  const dragon2 = join({ name: "Red Dragon", actorId: "dragon", actor: dragonActor, disposition: -1, initiative: 9 });
  join({ name: "Goblin", actorId: "goblin", actor: goblinActor, disposition: -1, initiative: 8 });
  await settle();
  let events = combat.combatants.filter(Sides.isEvent);
  assert.deepEqual(names(events), ["PRIMAL_COMBAT.Event.LairName{\"name\":\"Red Dragon\"}"], "one lair event per creature");
  assert.equal(events[0].initiative, 20);
  assert.equal(Events.getEventData(events[0]).source, "dragon");

  // The reminder links the lair actions.
  const hag = join({ name: "Sea Hag", actorId: "hag", actor: hagActor, disposition: -1, initiative: 11 });
  await settle();
  const hagEvent = combat.combatants.find(c => Sides.isEvent(c) && Events.getEventData(c).source === "hag");
  assert.ok(hagEvent, "the hag's lair actions joined");
  chat.length = 0;
  combat.round = 1;
  combat.turn = combat.turns.indexOf(hagEvent);
  await Events.remindEvents(combat);
  assert.match(chat[0].content, /@UUID\[Actor\.hag\.Item\.roots\]\{Grasping Roots\}/);

  // Players' creatures and the setting.
  join({ name: "Druid", actorId: "pcdragon", actor: { ...dragonActor, id: "pcdragon" }, pc: true, disposition: 1 });
  settings.autoLairActions = false;
  join({ name: "Lich", actorId: "lich", actor: { ...dragonActor, id: "lich" }, disposition: -1 });
  settings.autoLairActions = true;
  await settle();
  assert.equal(combat.combatants.filter(Sides.isEvent).length, 2, "no lair for a player's creature or with the setting off");

  // One dragon token leaves: the lair stays. The last one leaves: it goes.
  const leave = async c => {
    combat.combatants.splice(combat.combatants.indexOf(c), 1);
    Events.onDeleteCombatant(c);
    await settle();
  };
  await leave(dragon1);
  assert.equal(combat.combatants.filter(c => Sides.isEvent(c) && Events.getEventData(c).source === "dragon").length, 1);
  await leave(dragon2);
  assert.equal(combat.combatants.filter(c => Sides.isEvent(c) && Events.getEventData(c).source === "dragon").length, 0);
  await leave(hag);
  assert.equal(combat.combatants.filter(Sides.isEvent).length, 0);
  console.log("lair actions ok");
}

/* ---- Events added by hand ---- */
{
  const combat = new Combat();
  const created = await Events.addEvent(combat, { name: "  ", count: "abc" });
  assert.equal(created.name, "PRIMAL_COMBAT.Event.DefaultName", "blank name: Lair Action");
  assert.equal(created.initiative, 20, "no usable count: 20");
  assert.equal(Events.getEventData(created).remind, true);
  const other = await Events.addEvent(combat, { name: "Reinforcements", count: 5, hidden: true, remind: false, notes: "Two ogres" });
  assert.equal(other.hidden, true);
  assert.deepEqual(Events.getEventData(other), { count: 5, notes: "Two ogres", remind: false, source: null });
  game.user.isGM = false;
  assert.equal(await Events.addEvent(combat, { name: "Nope" }), null, "players can't add events");
  game.user.isGM = true;
  console.log("adding ok");
}

/* ---- A fixed initiative (an Epic Boss on 20) counts as that enemy's initiative ---- */
{
  const npc = init => ({ system: { attributes: { init: { score: init } }, abilities: {} } });
  const combat = new Combat({ mode: "side" });
  combat.add({ name: "Goblin", disposition: -1, actor: npc(14) });
  const boss = combat.add({ name: "Boss", disposition: -1, actor: npc(11), flags: { [MODULE]: { fixedInitiative: 20 } } });
  combat.add({ name: "Aria", pc: true, disposition: 1, actor: npc(12) });
  settings.initiativeDexTiebreaker = false;
  assert.equal(Sides.fixedInitiative(boss), 20);
  assert.deepEqual(Sides.computeEnemyInitiative(combat), { value: 20, name: "Boss" });
  boss.flags[MODULE].fixedInitiative = null;
  assert.equal(Sides.fixedInitiative(boss), null);
  assert.deepEqual(Sides.computeEnemyInitiative(combat), { value: 14, name: "Goblin" });
  console.log("fixed initiative ok");
}

console.log("events: all checks passed");
