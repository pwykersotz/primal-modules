// Passing through an aura during a move (scripts/passthrough.js). node --test tests/passthrough.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
const settings = { passThrough: true, ignoreDefeated: true, targetInclusion: "any", considerElevation: false, automation: true, shapeOverride: "none", defaultShape: "circle" };
globalThis.foundry = { utils: { deepClone: (v) => JSON.parse(JSON.stringify(v ?? null)), mergeObject: (a, b) => Object.assign(a, b), randomID: () => "r" + Math.random().toString(36).slice(2, 17) } };
globalThis.game = { modules: { get: () => null }, settings: { get: (m, k) => settings[k] }, user: { isGM: true }, users: { activeGM: { isSelf: true } }, scenes: { get: () => true } };
globalThis.CONST = { TOKEN_DISPOSITIONS: { SECRET: -2, HOSTILE: -1 }, GRID_DIAGONALS: {} };
globalThis.CONFIG = { Token: { movement: { actions: { walk: {}, blink: { teleport: true } } } }, specialStatusEffects: { DEFEATED: "dead" } };
const base = new URL("../scripts/", import.meta.url);
const { findPassThroughs, pathPoints, onMoveToken } = await import(new URL("passthrough.js", base));
const { createAura } = await import(new URL("data.js", base));

// A square grid of 100 px spaces, 5 ft each.
const grid = { isGridless: false, isSquare: true, size: 100, sizeX: 100, sizeY: 100, distance: 5, getOffset: ({ x, y }) => ({ i: Math.floor(y / 100), j: Math.floor(x / 100) }) };
const scene = { id: "s", grid, dimensions: { distancePixels: 20 }, tokens: [] };
const token = (id, x, y, extra = {}) => {
  const doc = { id, x, y, width: 1, height: 1, elevation: 0, parent: scene, disposition: -1, actor: { statuses: new Set(extra.dead ? ["dead"] : []) }, ...extra };
  scene.tokens.push(doc);
  return doc;
};
// The cleric at (1000, 1000) with a 15 ft aura, measured from its edge: it reaches 350 px from the centre.
const cleric = token("cleric", 1000, 1000, { disposition: 1 });
const aura = createAura({ radius: 15, effects: [{ mode: "triggered", triggers: { onEnter: true, onLeave: true } }] });
const inst = { key: "k", aura, sourceDoc: cleric, shape: "circle" };
const walk = (from, to, action = "walk") => ({ origin: { ...from }, passed: { waypoints: [{ ...to, action }] }, method: "dragging" });

test("the path between the ends, every half space", () => {
  const mover = token("m0", 0, 0);
  const points = pathPoints(mover, walk({ x: 0, y: 0 }, { x: 300, y: 0 }));
  assert.deepEqual(points.map(p => p.x), [50, 100, 150, 200, 250]);
  assert.deepEqual(pathPoints(mover, walk({ x: 0, y: 0 }, { x: 300, y: 0 }, "blink")), [], "a teleport doesn't cross the space between");
});

test("walking straight through the aura: it counts", () => {
  const orc = token("orc", 200, 1000);
  const found = findPassThroughs(scene, orc, walk({ x: 200, y: 1000 }, { x: 1800, y: 1000 }), [inst]);
  assert.deepEqual(found.map(f => f.targetId), ["orc"]);
});

test("ending the move inside, or starting it there, is left to the usual check", () => {
  const orc = token("orc2", 200, 900);
  assert.deepEqual(findPassThroughs(scene, orc, walk({ x: 200, y: 900 }, { x: 1000, y: 900 }), [inst]), []);
  assert.deepEqual(findPassThroughs(scene, orc, walk({ x: 1000, y: 900 }, { x: 1800, y: 900 }), [inst]), []);
});

test("walking past outside the aura: nothing", () => {
  const orc = token("orc3", 200, 200);
  assert.deepEqual(findPassThroughs(scene, orc, walk({ x: 200, y: 200 }, { x: 1800, y: 200 }), [inst]), []);
});

test("teleporting across: nothing", () => {
  const orc = token("orc4", 200, 1000);
  assert.deepEqual(findPassThroughs(scene, orc, walk({ x: 200, y: 1000 }, { x: 1800, y: 1000 }, "blink"), [inst]), []);
});

test("a defeated creature carried through doesn't count", () => {
  const dead = token("dead", 200, 1000, { dead: true });
  assert.deepEqual(findPassThroughs(scene, dead, walk({ x: 200, y: 1000 }, { x: 1800, y: 1000 }), [inst]), []);
});

test("the cleric walking past a goblin with the aura: the goblin counts", () => {
  const before = scene.tokens.length;
  const priest = token("priest", 0, 3000, { disposition: 1 });
  const goblin = token("goblin", 1000, 3000);
  const far = token("far", 1000, 4000);
  const own = { key: "p", aura, sourceDoc: priest, shape: "circle" };
  const found = findPassThroughs(scene, priest, walk({ x: 0, y: 3000 }, { x: 2000, y: 3000 }), [own]);
  assert.deepEqual(found.map(f => f.targetId), ["goblin"]);
  scene.tokens.splice(before);
  void far;
});

test("the hook queues 'enters' then 'leaves' jobs, and the setting turns it off", async () => {
  const orc = token("orc5", 200, 1000);
  const ran = [];
  const engine = {
    enabled: true,
    enqueue: fn => fn(),
    collectInstances: () => [inst],
    combatFor: () => ({ id: "c", round: 2, turn: 1 }),
    runJobs: async (_s, jobs) => { for (const j of jobs) ran.push(`${j.trigger}:${j.targetId}:${j.turnKey}`); }
  };
  await onMoveToken(engine, orc, walk({ x: 200, y: 1000 }, { x: 1800, y: 1000 }));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(ran, ["onEnter:orc5:c:2:1", "onLeave:orc5:c:2:1"]);
  ran.length = 0;
  settings.passThrough = false;
  onMoveToken(engine, orc, walk({ x: 200, y: 1000 }, { x: 1800, y: 1000 }));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(ran, [], "turned off in the settings");
  settings.passThrough = true;
  onMoveToken(engine, orc, { ...walk({ x: 200, y: 1000 }, { x: 1800, y: 1000 }), method: "undo" });
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(ran, [], "undoing a move");
});
