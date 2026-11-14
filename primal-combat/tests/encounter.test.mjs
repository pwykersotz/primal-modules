/**
 * Checks for getting into and out of combat (scripts/encounter.mjs), run with `node tests/encounter.test.mjs`.
 */
import assert from "node:assert/strict";

/* ---- Stand-ins for Foundry ---- */
const settings = { defaultMode: "standard", endCombatPrompt: true };
const hooks = new Map();
let nextHook = 1;
globalThis.Hooks = {
  on(name, fn) { const id = nextHook++; hooks.set(id, { name, fn }); return id; },
  off(name, id) { hooks.delete(id); },
  callAll(name, ...args) { for ( const h of [...hooks.values()] ) if ( h.name === name ) h.fn(...args); }
};
const gmUser = { isSelf: true };
const combats = [];
let dialogAnswer = true;
let dialogsShown = 0;
globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1, SECRET: -2 } };
globalThis.game = {
  settings: { get: (m, k) => settings[k] },
  i18n: { localize: k => k, format: k => k },
  user: { isGM: true, isSelf: true, flags: {}, async setFlag(m, k, v) {
    this.flags[k] = v;
    // The update reaches the GM's client.
    await import(new URL("../scripts/encounter.mjs", import.meta.url).href)
      .then(E => runAsGM(() => E.onUpdateUser(playerUser, { flags: { "primal-combat": { [k]: v } } })));
  } },
  users: { get activeGM() { return gmOnline ? gmUser : null; } },
  combats: Object.assign(combats, {
    has: id => combats.some(c => c.id === id),
    get: id => combats.find(c => c.id === id)
  }),
  scenes: { get: id => (id === scene.id ? scene : null) },
  combat: null
};
let gmOnline = true;
const playerUser = { isSelf: false };
const scene = { id: "scene1" };
globalThis.canvas = { scene, ready: false };
const getProperty = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
globalThis.foundry = {
  utils: {
    getProperty, hasProperty: (o, p) => getProperty(o, p) !== undefined, randomID: () => Math.random().toString(36).slice(2),
    debounce: (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    getDocumentClass: () => ({ async create(data) { return makeCombat(data); } })
  },
  applications: { api: { DialogV2: { async confirm() { dialogsShown++; return dialogAnswer; } } } }
};
function runAsGM(fn) {
  const was = { isGM: game.user.isGM, self: gmUser.isSelf };
  game.user.isGM = true; gmUser.isSelf = true;
  try { return fn(); } finally { game.user.isGM = was.isGM; gmUser.isSelf = was.self; }
}

let combatId = 0;
function makeCombat({ scene: sceneId=null, active=true }={}) {
  const combat = {
    id: `combat${++combatId}`, scene: sceneId ? scene : null, active, round: 0, flags: {}, deleted: false,
    get started() { return this.round > 0; },
    getFlag(m, k) { return this.flags[k]; },
    async activate() { this.active = true; Hooks.callAll("updateCombat", this, { active: true }); },
    async delete() { this.deleted = true; combats.splice(combats.indexOf(this), 1); Hooks.callAll("deleteCombat", this); }
  };
  combat.combatants = Object.assign([], { get: id => combat.combatants.find(c => c.id === id) });
  combats.push(combat);
  game.combat = combat;
  Hooks.callAll("createCombat", combat);
  return combat;
}
function addCombatant(combat, id, { disp=-1, hp=10, max=10, pc=false, defeated=false }={}) {
  const actor = { id: `actor-${id}`, isToken: false, system: { attributes: { hp: { value: hp, max } } } };
  const c = { id, parent: combat, actor, actorId: actor.id, tokenId: `token-${id}`, isDefeated: defeated,
    hasPlayerOwner: pc, token: { disposition: disp }, getFlag: () => undefined };
  combat.combatants.push(c);
  return c;
}
const settle = (ms=700) => new Promise(r => setTimeout(r, ms));

const E = await import(new URL("../scripts/encounter.mjs", import.meta.url).href);

/* ---- Who counts as down ---- */
{
  const combat = makeCombat();
  const goblin = addCombatant(combat, "goblin", { hp: 0 });
  assert.equal(E.isDown(goblin), true);
  goblin.actor.system.attributes.hp.value = 3;
  assert.equal(E.isDown(goblin), false);
  goblin.isDefeated = true;
  assert.equal(E.isDown(goblin), true, "marked defeated counts as down");
  const trap = addCombatant(combat, "trap", { hp: null, max: 0 });
  assert.equal(E.isDown(trap), null, "no hit points: doesn't count");
  addCombatant(combat, "hero", { disp: 1, pc: true, hp: 0 });
  addCombatant(combat, "ally", { disp: 0, hp: 0 });   // neutral: not hostile
  assert.equal(E.allHostilesDown(combat), true, "only hostiles count; the trap is ignored");
  goblin.isDefeated = false;
  assert.equal(E.allHostilesDown(combat), false);
  await combat.delete();
  console.log("down ok");
}

/* ---- The GM is asked once, and again only after a hostile gets back up ---- */
{
  const combat = makeCombat();
  combat.round = 1;
  const a = addCombatant(combat, "a");
  const b = addCombatant(combat, "b");
  addCombatant(combat, "hero", { disp: 1, pc: true });
  a.actor.system.attributes.hp.value = 0;
  E.scheduleCheck(combat); await settle();
  assert.equal(dialogsShown, 0, "one hostile still standing");
  b.actor.system.attributes.hp.value = 0;
  dialogAnswer = false;
  E.scheduleCheckFor({ actor: b.actor }); E.scheduleCheckFor({ actor: a.actor }); await settle();
  assert.equal(dialogsShown, 1, "asked once for several changes at once");
  assert.equal(combat.deleted, false, "kept fighting");
  E.scheduleCheck(combat); await settle();
  assert.equal(dialogsShown, 1, "not asked again while they're still down");
  b.actor.system.attributes.hp.value = 4;            // back up (healed)
  E.scheduleCheck(combat); await settle();
  b.actor.system.attributes.hp.value = 0;            // down again
  dialogAnswer = true;
  E.scheduleCheck(combat); await settle();
  assert.equal(dialogsShown, 2);
  assert.equal(combat.deleted, true, "ended");
  console.log("end prompt ok");
}

/* ---- Not asked before combat starts, when switched off, or on a player's client ---- */
{
  const combat = makeCombat();
  addCombatant(combat, "a", { hp: 0 });
  E.scheduleCheck(combat); await settle();
  assert.equal(dialogsShown, 2, "not started");
  combat.round = 1;
  settings.endCombatPrompt = false;
  E.scheduleCheck(combat); await settle();
  assert.equal(dialogsShown, 2, "setting off");
  settings.endCombatPrompt = true;
  gmUser.isSelf = false;
  E.scheduleCheck(combat); await settle();
  assert.equal(dialogsShown, 2, "only the active GM is asked");
  gmUser.isSelf = true;
  dialogAnswer = false;
  E.scheduleCheck(combat); await settle();
  assert.equal(dialogsShown, 3);
  await combat.delete();
  console.log("when to ask ok");
}

/* ---- Rolling initiative joins combat ---- */
{
  // A combat exists and the creature isn't in it: the roll adds it, wherever it came from.
  const combat = makeCombat();
  const actor = { id: "pc1", isToken: false };
  const options = {};
  await E.beforeRollInitiative(actor, options);
  assert.equal(options.createCombatants, true);
  // Already in it: left alone.
  combat.combatants.push({ actor, id: "x" });
  const again = {};
  await E.beforeRollInitiative(actor, again);
  assert.equal(again.createCombatants, undefined);
  await combat.delete();
  game.combat = null;

  // A player rolls with no combat running: the GM's client starts one, and the roll goes ahead in it.
  game.user.isGM = false; gmUser.isSelf = false;
  const playerOptions = {};
  const started = Date.now();
  await E.beforeRollInitiative({ id: "pc2", isToken: false }, playerOptions);
  assert.ok(game.combat, "a combat now exists");
  assert.equal(game.combat.scene, scene);
  assert.equal(game.combat.active, true);
  assert.equal(playerOptions.createCombatants, true);
  assert.ok(Date.now() - started < 1000, "didn't wait for the timeout");

  // An inactive combat already exists for the scene: the GM's client makes it active instead of starting another.
  const count = combats.length;
  game.combat.active = false;
  const inactive = game.combat;
  game.combat = null;
  await E.requestCombat(scene);
  assert.equal(combats.length, count);
  assert.equal(inactive.active, true);
  game.combat = inactive;

  // No GM online: nothing to wait for (Foundry's own "no active combat" warning follows).
  game.combat = null;
  gmOnline = false;
  assert.equal(await E.requestCombat(scene), null);
  gmOnline = true;
  game.user.isGM = true; gmUser.isSelf = true;
  console.log("joining ok");
}

console.log("encounter: all checks passed");
