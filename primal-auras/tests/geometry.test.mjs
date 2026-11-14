// Who's inside an aura: grid and circle shapes, donuts, token size, diagonals, elevation, levels and who it affects.
//   node --test tests/geometry.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
const settings = { targetInclusion: "any", considerElevation: false, shapeOverride: "none" };
globalThis.foundry = { utils: { deepClone: v => JSON.parse(JSON.stringify(v ?? null)), mergeObject: (a, b) => Object.assign(a, b), randomID: () => Math.random().toString(36).slice(2, 18) } };
globalThis.game = { modules: { get: () => null }, settings: { get: (m, k) => settings[k] }, user: { isGM: true } };
globalThis.CONST = {
  TOKEN_DISPOSITIONS: { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 },
  GRID_DIAGONALS: { EQUIDISTANT: 0, EXACT: 1, APPROXIMATE: 2, RECTILINEAR: 3, ALTERNATING_1: 4, ALTERNATING_2: 5, ILLEGAL: 6 }
};
globalThis.CONFIG = {};
const base = new URL("../scripts/", import.meta.url);
const { computeGridCells, isTokenInAura, squareSteps, circleGeometry } = await import(new URL("geometry.js", base));
const { createAura, isAuraActive, effectiveShape, createEffect } = await import(new URL("data.js", base));
const { effectAffects } = await import(new URL("apply.js", base));
const D = CONST.GRID_DIAGONALS;

/** A square grid of 100 px spaces, 5 ft each (20 px a foot). */
const makeScene = (diagonals = D.EQUIDISTANT) => ({
  id: "s", tokens: [],
  dimensions: { distancePixels: 20 },
  grid: { isGridless: false, isSquare: true, size: 100, sizeX: 100, sizeY: 100, distance: 5, diagonals,
    getOffset: ({ x, y }) => ({ i: Math.floor(y / 100), j: Math.floor(x / 100) }) }
});
const token = (scene, id, x, y, extra = {}) => ({ id, x, y, width: 1, height: 1, elevation: 0, parent: scene, disposition: -1, ...extra });
const inside = (source, aura, target, shape) => isTokenInAura({ sourceDoc: source, aura, shape }, target);

test("diagonals follow the scene's rule", () => {
  assert.equal(squareSteps(2, 2, D.EQUIDISTANT), 2);
  assert.equal(squareSteps(2, 2, D.APPROXIMATE), 3);
  assert.equal(squareSteps(2, 1, D.ALTERNATING_1), 2);
  assert.equal(squareSteps(1, 1, D.ALTERNATING_2), 2);
  assert.equal(squareSteps(2, 1, D.RECTILINEAR), 3);
  assert.ok(Math.abs(squareSteps(1, 1, D.EXACT) - Math.SQRT2) < 1e-9);
});

test("a 10 ft grid aura covers a 5 by 5 block, or a diamond-ish 13 spaces with 5-10-5 diagonals", () => {
  const aura = createAura({ shape: "grid", radius: 10 });
  assert.equal(computeGridCells(token(makeScene(), "a", 500, 500), aura).size, 25);
  assert.equal(computeGridCells(token(makeScene(D.APPROXIMATE), "a", 500, 500), aura).size, 13);
});

test("a grid aura grows from every space a large creature fills", () => {
  const ogre = token(makeScene(), "ogre", 500, 500, { width: 2, height: 2 });
  assert.equal(computeGridCells(ogre, createAura({ shape: "grid", radius: 5 })).size, 16);
});

test("a donut leaves out its hole, including the source's own space", () => {
  const cells = computeGridCells(token(makeScene(), "a", 500, 500), createAura({ shape: "grid", radius: 10, innerRadius: 5 }));
  assert.equal(cells.size, 16);
  assert.ok(!cells.has("5,5") && !cells.has("4,4"));
  assert.ok(cells.has("3,3"));
});

test("grid auras: any part of the target, or only its centre", () => {
  const scene = makeScene();
  const source = token(scene, "src", 500, 500);
  const aura = createAura({ shape: "grid", radius: 5 });
  // A large creature whose corner space is next to the source, but whose centre is outside.
  const big = token(scene, "big", 600, 600, { width: 2, height: 2 });
  assert.equal(inside(source, aura, big, "grid"), true);
  settings.targetInclusion = "center";
  try { assert.equal(inside(source, aura, big, "grid"), false); }
  finally { settings.targetInclusion = "any"; }
});

test("circle auras measured from the edge reach a creature's nearest point", () => {
  const scene = makeScene();
  const cleric = token(scene, "cleric", 1000, 1000, { disposition: 1 });
  const aura = createAura({ radius: 15 });
  const circle = circleGeometry(cleric, aura);
  assert.deepEqual(circle.center, { x: 1050, y: 1050 });
  assert.equal(circle.outer, 50 + 300);
  assert.equal(inside(cleric, aura, token(scene, "near", 1350, 1000), "circle"), true, "three spaces to the right: 15 ft away");
  assert.equal(inside(cleric, aura, token(scene, "far", 1400, 1000), "circle"), false, "four spaces: 20 ft away");
  const fromCentre = createAura({ radius: 15, measureFrom: "center" });
  assert.equal(inside(cleric, fromCentre, token(scene, "near2", 1300, 1000), "circle"), true);
  assert.equal(inside(cleric, fromCentre, token(scene, "near3", 1350, 1000), "circle"), false);
});

test("a circle donut skips creatures in its hole", () => {
  const scene = makeScene();
  const source = token(scene, "src", 1000, 1000);
  const aura = createAura({ radius: 20, innerRadius: 5 });
  assert.equal(inside(source, aura, token(scene, "adjacent", 1100, 1000), "circle"), false);
  assert.equal(inside(source, aura, token(scene, "ring", 1300, 1000), "circle"), true);
});

test("elevation counts when the setting is on, and different scene levels never share an aura", () => {
  const scene = makeScene();
  const source = token(scene, "src", 1000, 1000);
  const aura = createAura({ radius: 10 });
  const flyer = token(scene, "flyer", 1100, 1000, { elevation: 30 });
  assert.equal(inside(source, aura, flyer, "circle"), true);
  settings.considerElevation = true;
  try { assert.equal(inside(source, aura, flyer, "circle"), false); }
  finally { settings.considerElevation = false; }
  assert.equal(inside(token(scene, "s2", 1000, 1000, { level: "ground" }), aura, token(scene, "up", 1100, 1000, { level: "upper" }), "circle"), false);
  assert.equal(inside(source, aura, token({ ...makeScene(), id: "other" }, "elsewhere", 1100, 1000), "circle"), false, "a token on another scene");
});

test("who an effect affects: enemies, allies, everyone, the source", () => {
  const scene = makeScene();
  const cleric = token(scene, "cleric", 0, 0, { disposition: 1 });
  const ally = token(scene, "ally", 0, 0, { disposition: 1 });
  const orc = token(scene, "orc", 0, 0, { disposition: -1 });
  const hidden = token(scene, "hidden", 0, 0, { disposition: -2 });
  const fx = data => createEffect(data);
  assert.equal(effectAffects(fx({ affects: "enemies" }), cleric, orc), true);
  assert.equal(effectAffects(fx({ affects: "enemies" }), cleric, ally), false);
  assert.equal(effectAffects(fx({ affects: "enemies" }), cleric, hidden), true, "a secret token counts as hostile");
  assert.equal(effectAffects(fx({ affects: "allies" }), cleric, ally), true);
  assert.equal(effectAffects(fx({ affects: "all" }), cleric, orc), true);
  assert.equal(effectAffects(fx({ affects: "allies" }), cleric, cleric), false, "the source only when it says so");
  assert.equal(effectAffects(fx({ affects: "allies", includeSelf: true }), cleric, cleric), true);
  assert.equal(effectAffects(fx({ affects: "self" }), cleric, cleric), true);
  assert.equal(effectAffects(fx({ affects: "self" }), cleric, ally), false);
});

test("an aura is on when enabled with a radius, and an equipped item's aura only while equipped", () => {
  assert.equal(isAuraActive({ aura: createAura({ radius: 10 }) }), true);
  assert.equal(isAuraActive({ aura: createAura({ radius: 0 }) }), false);
  assert.equal(isAuraActive({ aura: createAura({ radius: 10, enabled: false }) }), false);
  const aura = createAura({ radius: 10, activation: "equipped" });
  assert.equal(isAuraActive({ aura, sourceType: "item", item: { system: { equipped: false } } }), false);
  assert.equal(isAuraActive({ aura, sourceType: "item", item: { system: { equipped: true } } }), true);
});

test("the shape used: the aura's own, the world override, and always a circle on gridless scenes", () => {
  const scene = makeScene();
  assert.equal(effectiveShape(createAura({ shape: "grid" }), scene), "grid");
  settings.shapeOverride = "circle";
  try { assert.equal(effectiveShape(createAura({ shape: "grid" }), scene), "circle"); }
  finally { settings.shapeOverride = "none"; }
  assert.equal(effectiveShape(createAura({ shape: "grid" }), { grid: { isGridless: true } }), "circle");
});
