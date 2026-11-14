/**
 * The window, run against Foundry's own client code and the real dnd5e system in a headless browser.
 * Needs FOUNDRY_APP and DND5E (see tests/README.md); without them these checks are skipped.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { startServer, FOUNDRY_APP, DND5E } from "./server.mjs";

const available = fs.existsSync(path.join(FOUNDRY_APP, "public", "scripts", "foundry.mjs"))
  && fs.existsSync(path.join(DND5E, "dnd5e.mjs"));
let chromium;
try {
  ({ chromium } = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url)("playwright"));
} catch { /* skipped below */ }
const skip = !available ? "Foundry and dnd5e were not found" : (!chromium ? "Playwright is not installed" : false);

let server;
let browser;
let page;
const errors = [];

test.before(async () => {
  if ( skip ) return;
  server = await startServer(0);
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  page.on("pageerror", err => errors.push(err.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/game?data=actors.json`);
  await page.waitForFunction(() => window.harness?.ready || window.harness?.error, null, { timeout: 60000 });
});

test.after(async () => {
  await browser?.close();
  server?.close();
});

const settle = () => page.waitForFunction(() => {
  const app = foundry.applications.instances.get("primal-cr-window");
  return app?.rendered && !app.element.querySelector(".pcr-busy");
}, null, { timeout: 15000 }).then(() => page.waitForTimeout(150));

test("the system and the module load, and every test actor becomes a real dnd5e actor", { skip }, async () => {
  const state = await page.evaluate(() => ({
    error: window.harness.error, failures: window.harness.failures, count: window.harness.actors.size,
    api: Object.keys(window.harness.api ?? {})
  }));
  assert.ok(!state.error, String(state.error));
  assert.deepEqual(state.failures, []);
  assert.equal(state.count, 12);
  for ( const name of ["open", "add", "fromMap", "assess", "simulate", "judge"] ) assert.ok(state.api.includes(name), name);
});

test("live actors are read from the system's prepared numbers", { skip }, async () => {
  const profiles = await page.evaluate(() => {
    const find = n => window.harness.actors.find(a => a.name.startsWith(n));
    const read = n => { const p = window.harness.api.read(find(n)); return { hp: p.hpMax, ac: p.ac, level: p.level, cr: p.cr, options: p.options.length }; };
    return { fighter: read("Randal"), dragon: read("Adult Red Dragon"), goblin: read("Goblin Warrior") };
  });
  assert.equal(profiles.fighter.hp, 12);
  assert.equal(profiles.fighter.level, 1);
  assert.equal(profiles.dragon.hp, 256);
  assert.equal(profiles.dragon.ac, 19);
  assert.ok(profiles.dragon.options >= 4);
  assert.equal(profiles.goblin.cr, 0.25);
});

test("adding a party and enemies gives a verdict", { skip }, async () => {
  await page.evaluate(async () => {
    const h = window.harness;
    const id = n => `Actor.${h.actors.find(a => a.name.startsWith(n)).id}`;
    const app = h.api.open();
    await app.add(["Perrin", "Randal", "Zanna", "Krusk"].map(id), "party");
    await app.add([id("Goblin Warrior")], "enemies");
  });
  await settle();
  const seen = await page.evaluate(() => {
    const el = foundry.applications.instances.get("primal-cr-window").element;
    return {
      rows: el.querySelectorAll(".pcr-row").length,
      level: [...el.querySelector(".pcr").classList].find(c => c.startsWith("pcr-level-"))?.slice(10),
      sentence: el.querySelector(".pcr-sentence")?.textContent.trim(),
      raw: /PRIMAL_CR\./.test(el.textContent)
    };
  });
  assert.equal(seen.rows, 5);
  assert.equal(seen.level, "easy");
  assert.ok(seen.sentence.length > 10);
  assert.equal(seen.raw, false, "no untranslated keys on screen");
});

test("more of an enemy makes it worse; removing it clears the verdict", { skip }, async () => {
  const levelNow = () => page.evaluate(() => {
    const app = foundry.applications.instances.get("primal-cr-window");
    return { index: app.assessment?.verdict?.index ?? null, wipe: app.assessment?.result?.wipe ?? null };
  });
  const before = await levelNow();
  for ( let i = 0; i < 7; i++ ) {
    await page.click('.primal-cr-window [data-side="enemies"] [data-action="more"]');
    await settle();
  }
  const after = await levelNow();
  assert.ok(after.index > before.index, `${before.index} then ${after.index}`);
  assert.ok(after.wipe > before.wipe);
  await page.click('.primal-cr-window [data-side="enemies"] [data-action="removeEntry"]');
  await settle();
  assert.equal((await levelNow()).index, null);
});

test("right-click options and the scene control are offered to the GM", { skip }, async () => {
  const out = await page.evaluate(async () => {
    const h = window.harness;
    const ogre = h.actors.find(a => a.name === "Ogre");
    const options = [];
    Hooks.callAll("getActorContextOptions", { collection: h.actors }, options);
    const li = document.createElement("li");
    li.dataset.entryId = ogre.id;
    const entry = options.find(o => o.label === "PRIMAL_CR.Context.Add");
    const visible = entry?.visible(li);
    await entry?.onClick(new Event("click"), li);
    const packOptions = [];
    Hooks.callAll("getPrimalCompendiumsEntryContext", { documentName: "Actor" }, packOptions);
    const itemOptions = [];
    Hooks.callAll("getPrimalCompendiumsEntryContext", { documentName: "Item" }, itemOptions);
    const controls = { tokens: { tools: {} } };
    Hooks.callAll("getSceneControlButtons", controls);
    const app = foundry.applications.instances.get("primal-cr-window");
    return { visible, enemies: app.encounter.enemies.length, pack: packOptions.length, item: itemOptions.length,
      tool: !!controls.tokens.tools.primalCR };
  });
  assert.equal(out.visible, true);
  assert.equal(out.enemies, 1);
  assert.equal(out.pack, 1);
  assert.equal(out.item, 0);
  assert.equal(out.tool, true);
});

test("Scan party lists what wasn't used and keeps what's typed in by hand", { skip }, async () => {
  await page.evaluate(() => {
    for ( const actor of window.harness.actors ) {
      // There's no server here to save to, so a flag is written straight onto the actor.
      actor.setFlag = async function(scope, key, value) {
        (this._source.flags[scope] ??= {})[key] = value;
        (this.flags[scope] ??= {})[key] = value;
      };
    }
  });
  await page.click('.primal-cr-window [data-action="scan"]');
  await page.waitForSelector(".primal-cr-scan .pcr-scan-actor");
  const seen = await page.evaluate(() => ({
    actors: document.querySelectorAll(".primal-cr-scan .pcr-scan-actor").length,
    read: document.querySelectorAll(".primal-cr-scan .pcr-scan-read li").length,
    raw: /PRIMAL_CR\./.test(document.querySelector(".primal-cr-scan").textContent)
  }));
  assert.equal(seen.actors, 4);
  assert.ok(seen.read >= 4);
  assert.equal(seen.raw, false);
  await page.fill('.primal-cr-scan input[name^="onHit."] >> nth=1', "3d6");
  await page.click('.primal-cr-scan button[data-action="ok"]');
  await settle();
  const after = await page.evaluate(() => {
    const fighter = window.harness.actors.find(a => a.name.startsWith("Randal"));
    return { flag: fighter.flags["primal-cr"]?.manual, onHit: window.harness.api.read(fighter).features.onHit?.map(e => e.name) };
  });
  assert.equal(after.flag.onHit, "3d6");
  assert.deepEqual(after.onHit, ["Set by hand"]);
});

test("nothing threw along the way", { skip }, () => {
  assert.deepEqual(errors, []);
});
