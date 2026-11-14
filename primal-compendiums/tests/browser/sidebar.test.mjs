/**
 * Browser checks: Primal Compendiums running inside Foundry v14's real client code (Sidebar, ActorDirectory,
 * ItemDirectory, SceneDirectory, ApplicationV2, templates and CSS), with a stand-in game (tests/browser/harness.mjs).
 *
 * Run: node tests/browser/sidebar.test.mjs
 * Needs Playwright with Chromium, and FOUNDRY_APP pointing at a copy of Foundry's resources/app files
 * (see tests/README.md). Screenshots go to SHOTS (default tests/browser/shots).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { startServer, MODULE_ROOT } from "./server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const SHOTS = process.env.SHOTS ?? path.join(MODULE_ROOT, "tests/browser/shots");
fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch(err) {
    failed++;
    console.error(`FAIL ${name}\n  ${err.message}`);
  }
}
function assert(cond, message) {
  if ( !cond ) throw new Error(message);
}
function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if ( a !== e ) throw new Error(`${message}\n  expected ${e}\n  actual   ${a}`);
}

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const errors = [];

async function open(query = "") {
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => {
    if ( m.type() === "error" ) errors.push(`console: ${m.text()}`);
  });
  page.on("response", r => {
    if ( r.status() >= 400 ) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${base}/game${query}`);
  await page.waitForFunction(() => window.harness?.ready || window.harness?.error, null, { timeout: 30000 });
  const error = await page.evaluate(() => window.harness.error);
  if ( error ) throw new Error(`Harness failed: ${error}`);
  return page;
}
const sidebarClip = { x: 850, y: 0, width: 350, height: 820 };
const shot = (page, name, clip = sidebarClip) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), clip });
const settle = page => page.waitForTimeout(250);
const setting = (page, key) => page.evaluate(k => game.settings.get("primal-compendiums", k), key);
const choose = (page, ids) => page.evaluate(v => game.settings.set("primal-compendiums", "packs", v), ids);

/* ------------------------------------------------------------------------------------------------ */

const page = await open();

await check("every directory with compendiums of its type gets the World / Compendiums switch", async () => {
  const found = await page.evaluate(() => ["actors", "items", "scenes"].map(tab => {
    const nav = document.querySelector(`#${tab} > nav.pcs-switch`);
    return [tab, !!nav, nav === document.querySelector(`#${tab}`).firstElementChild];
  }));
  equal(found, [["actors", true, true], ["items", true, true], ["scenes", true, true]], "switches");
});

await check("nothing is drawn before the Compendiums side is opened", async () => {
  await page.evaluate(() => ui.sidebar.changeTab("actors", "primary"));
  await settle(page);
  const panels = await page.evaluate(() => document.querySelectorAll("section.primal-compendiums").length);
  equal(panels, 0, "panels drawn");
  await shot(page, "01-actors-world");
});

await check("clicking Compendiums shows the panel in place of the directory", async () => {
  await page.click("#actors > nav.pcs-switch [data-pcs-mode=packs]");
  await settle(page);
  const state = await page.evaluate(() => {
    const host = document.getElementById("actors");
    const panel = document.getElementById("primal-compendiums-actors");
    return {
      hostShown: getComputedStyle(host).display !== "none",
      panelShown: panel && getComputedStyle(panel).display !== "none",
      sibling: host.nextElementSibling === panel,
      active: panel?.classList.contains("active"),
      pressed: panel?.querySelector('.pcs-switch [data-pcs-mode="packs"]')?.getAttribute("aria-pressed"),
      empty: !!panel?.querySelector(".pcs-empty")
    };
  });
  equal(state, { hostShown: false, panelShown: true, sibling: true, active: true, pressed: "true", empty: true }, "state");
  equal(await setting(page, "modes"), { actors: "packs" }, "remembered mode");
  await shot(page, "02-actors-empty");
});

await check("chosen compendiums show in Compendium sidebar order, one directory each", async () => {
  await choose(page, ["dnd5e.monsters", "dnd-monster-manual.actors", "world.homebrew", "dnd5e.items", "world.maps"]);
  await page.waitForTimeout(400);
  const packs = await page.evaluate(() => Array.from(document.querySelectorAll("#primal-compendiums-actors .pcs-pack"))
    .map(li => [li.dataset.pack, li.querySelector(".folder-name").textContent.trim(), li.querySelector(".pcs-count").textContent.trim()]));
  equal(packs, [
    ["dnd-monster-manual.actors", "Monster Manual", "4"],
    ["dnd5e.monsters", "Monsters (SRD)", "31"],
    ["world.homebrew", "Homebrew Creatures", "1"]
  ], "packs");
  await shot(page, "03-actors-packs");
});

await check("compendiums start closed when there are several, and open with a click (remembered)", async () => {
  const before = await page.evaluate(() => Array.from(document.querySelectorAll("#primal-compendiums-actors .pcs-pack.expanded")).length);
  equal(before, 0, "open before");
  await page.click('#primal-compendiums-actors .pcs-pack[data-pack="dnd-monster-manual.actors"] > .folder-header .folder-name');
  await settle(page);
  const open = await page.evaluate(() => {
    const li = document.querySelector('#primal-compendiums-actors .pcs-pack[data-pack="dnd-monster-manual.actors"]');
    const sub = li.querySelector(":scope > .subdirectory");
    return [li.classList.contains("expanded"), getComputedStyle(sub).display !== "none"];
  });
  equal(open, [true, true], "opened");
  equal(await setting(page, "expanded"), { "dnd-monster-manual.actors": true }, "remembered");
});

await check("a compendium's own folders are drawn like Foundry's folders and open like them", async () => {
  const folder = '#primal-compendiums-actors .directory-item.folder[data-uuid="Compendium.dnd-monster-manual.actors.Folder.mmFolderGoblins0"]';
  const info = await page.evaluate(sel => {
    const li = document.querySelector(sel);
    return {
      name: li?.querySelector(":scope > .folder-header .folder-name")?.textContent.trim(),
      color: li?.querySelector(":scope > .folder-header")?.style.backgroundColor,
      loose: Array.from(li.parentElement.querySelectorAll(":scope > .directory-item.entry .entry-name")).map(a => a.textContent.trim())
    };
  }, folder);
  equal(info.name, "Goblinoids", "folder name");
  assert(info.color, "folder colour kept");
  equal(info.loose, ["Aboleth"], "entries outside folders");
  await page.click(`${folder} > .folder-header`);
  await settle(page);
  const expanded = await page.evaluate(sel => [
    document.querySelector(sel).classList.contains("expanded"),
    game.folders._expanded["Compendium.dnd-monster-manual.actors.Folder.mmFolderGoblins0"] === true
  ], folder);
  equal(expanded, [true, true], "folder opened and shared with Foundry's folder state");
  await shot(page, "04-actors-open");
});

await check("search matches across every compendium and opens the way to each match", async () => {
  await page.fill("#primal-compendiums-actors search input", "goblin");
  await page.waitForTimeout(450);
  const seen = await page.evaluate(() => {
    const panel = document.getElementById("primal-compendiums-actors");
    const visible = el => el.offsetParent !== null;
    return {
      entries: Array.from(panel.querySelectorAll(".directory-item.entry")).filter(visible)
        .map(li => li.querySelector(".entry-name").textContent.trim()).sort(),
      packs: Array.from(panel.querySelectorAll(".pcs-pack")).filter(visible).map(li => li.dataset.pack)
    };
  });
  equal(seen.entries, ["Goblin", "Goblin Boss", "Goblin Warrior", "Hobgoblin Captain"], "matches");
  equal(seen.packs, ["dnd-monster-manual.actors", "dnd5e.monsters"], "packs with matches");
  await shot(page, "05-actors-search");

  // The world directory's own search box is untouched.
  equal(await page.evaluate(() => document.querySelector("#actors search input").value), "", "world search");

  await page.fill("#primal-compendiums-actors search input", "");
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => Array.from(document.querySelectorAll("#primal-compendiums-actors .pcs-pack"))
    .map(li => [li.dataset.pack, li.classList.contains("expanded"), li.style.display]));
  equal(after, [
    ["dnd-monster-manual.actors", true, ""],
    ["dnd5e.monsters", false, ""],
    ["world.homebrew", false, ""]
  ], "state restored after clearing");
});

await check("search for something missing says so", async () => {
  await page.fill("#primal-compendiums-actors search input", "tarrasque");
  await page.waitForTimeout(450);
  const hidden = await page.evaluate(() => document.querySelector("#primal-compendiums-actors .pcs-no-match").hidden);
  equal(hidden, false, "no-match message shown");
  await page.fill("#primal-compendiums-actors search input", "");
  await page.waitForTimeout(450);
});

await check("clicking an entry opens its sheet from the compendium", async () => {
  await page.evaluate(() => window.harness.calls.length = 0);
  await page.click('#primal-compendiums-actors [data-uuid="Compendium.dnd-monster-manual.actors.Actor.mmAboleth0000000"] .entry-name');
  await page.waitForTimeout(200);
  const calls = await page.evaluate(() => window.harness.calls.filter(c => c[0] === "sheet"));
  equal(calls, [["sheet", "Compendium.dnd-monster-manual.actors.Actor.mmAboleth0000000", true]], "sheet opened");
});

await check("dragging an entry or folder carries the same data as Foundry's compendium window", async () => {
  const data = await page.evaluate(() => {
    const out = [];
    for ( const sel of [
      '#primal-compendiums-actors [data-uuid="Compendium.dnd-monster-manual.actors.Actor.mmAboleth0000000"]',
      '#primal-compendiums-actors .folder[data-uuid="Compendium.dnd-monster-manual.actors.Folder.mmFolderGoblins0"]'
    ] ) {
      const el = document.querySelector(sel);
      const dt = new DataTransfer();
      el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
      out.push([el.getAttribute("draggable"), JSON.parse(dt.getData("text/plain") || "null")]);
    }
    return out;
  });
  equal(data, [
    ["true", { type: "Actor", uuid: "Compendium.dnd-monster-manual.actors.Actor.mmAboleth0000000" }],
    ["true", { type: "Folder", uuid: "Compendium.dnd-monster-manual.actors.Folder.mmFolderGoblins0" }]
  ], "drag data");
});

await check("the world directory's drag-and-drop and menus never reach the panel", async () => {
  const counts = await page.evaluate(() => ({
    hostItems: document.querySelectorAll("#actors .directory-item").length,
    panelInsideHost: !!document.querySelector("#actors #primal-compendiums-actors"),
    panelWithEntryIds: document.querySelectorAll("#primal-compendiums-actors [data-entry-id]").length
  }));
  equal(counts, { hostItems: 6, panelInsideHost: false, panelWithEntryIds: 0 }, "isolation");
});

await check("right-clicking an entry offers Import, Open Compendium and (unlocked only) Delete", async () => {
  const menuFor = async uuid => {
    await page.click(`#primal-compendiums-actors [data-uuid="${uuid}"]`, { button: "right" });
    await page.waitForTimeout(150);
    const labels = await page.evaluate(() => Array.from(document.querySelectorAll("#context-menu li.context-item"))
      .map(li => li.textContent.trim()));
    await page.keyboard.press("Escape");
    await page.evaluate(() => ui.context?.close({ animate: false }));
    await page.waitForTimeout(100);
    return labels;
  };
  const locked = await menuFor("Compendium.dnd-monster-manual.actors.Actor.mmAboleth0000000");
  equal(locked, ["Import Entry", "Open Compendium"], "locked compendium entry");

  await page.click('#primal-compendiums-actors .pcs-pack[data-pack="world.homebrew"] > .folder-header .folder-name');
  await settle(page);
  const unlocked = await menuFor("Compendium.world.homebrew.Actor.hbOoze000000000");
  equal(unlocked, ["Import Entry", "Open Compendium", "Delete Entry"], "unlocked compendium entry");
});

await check("Import Entry imports into the world the way Foundry's compendium window does", async () => {
  await page.evaluate(() => window.harness.calls.length = 0);
  await page.click('#primal-compendiums-actors [data-uuid="Compendium.world.homebrew.Actor.hbOoze000000000"]', { button: "right" });
  await page.waitForTimeout(150);
  await page.click("#context-menu li.context-item >> text=Import Entry");
  await page.waitForTimeout(150);
  const calls = await page.evaluate(() => window.harness.calls.filter(c => c[0] === "importFromCompendium"));
  equal(calls, [["importFromCompendium", "Actor", "world.homebrew", "hbOoze000000000",
    { clearOwnership: false, dialog: true, renderSheet: true }]], "import");
});

await check("right-clicking a compendium's header offers its own options", async () => {
  await page.click('#primal-compendiums-actors .pcs-pack[data-pack="dnd5e.monsters"] > .folder-header', { button: "right" });
  await page.waitForTimeout(150);
  const labels = await page.evaluate(() => Array.from(document.querySelectorAll("#context-menu li.context-item"))
    .map(li => li.textContent.trim()));
  equal(labels, ["Open Compendium", "Import All Content", "Remove from This Tab", "Choose Compendiums"], "pack menu");
  await page.click("#context-menu li.context-item >> text=Remove from This Tab");
  await page.waitForTimeout(400);
  const packs = await page.evaluate(() => Array.from(document.querySelectorAll("#primal-compendiums-actors .pcs-pack")).map(li => li.dataset.pack));
  equal(packs, ["dnd-monster-manual.actors", "world.homebrew"], "removed");
  equal((await setting(page, "packs")).includes("dnd5e.monsters"), false, "saved");
  await choose(page, ["dnd5e.monsters", "dnd-monster-manual.actors", "world.homebrew", "dnd5e.items", "world.maps"]);
  await page.waitForTimeout(300);
});

await check("the open-compendium button opens the compendium's window without closing the group", async () => {
  await page.evaluate(() => window.harness.calls.length = 0);
  await page.click('#primal-compendiums-actors .pcs-pack[data-pack="dnd5e.monsters"] .pcs-open');
  await settle(page);
  const calls = await page.evaluate(() => window.harness.calls.filter(c => c[0] === "packRender"));
  equal(calls, [["packRender", "dnd5e.monsters", true]], "opened");
  const expanded = await page.evaluate(() => document.querySelector('#primal-compendiums-actors .pcs-pack[data-pack="dnd5e.monsters"]').classList.contains("expanded"));
  equal(expanded, false, "group unchanged");
});

await check("the sort button switches every compendium in the tab with Foundry's own setting", async () => {
  await page.click("#primal-compendiums-actors .toggle-sort");
  await page.waitForTimeout(300);
  const modes = await page.evaluate(() => game.settings.get("core", "collectionSortingModes"));
  equal(modes, { "dnd-monster-manual.actors": "m", "dnd5e.monsters": "m", "world.homebrew": "m" }, "manual");
  await page.click("#primal-compendiums-actors .toggle-sort");
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => game.settings.get("core", "collectionSortingModes"));
  equal(back, { "dnd-monster-manual.actors": "a", "dnd5e.monsters": "a", "world.homebrew": "a" }, "alphabetical");
});

await check("collapse-all closes every folder and compendium", async () => {
  await page.click("#primal-compendiums-actors .collapse-all");
  await settle(page);
  const open = await page.evaluate(() => document.querySelectorAll("#primal-compendiums-actors .folder.expanded").length);
  equal(open, 0, "open folders");
  const stored = await setting(page, "expanded");
  equal(stored, { "dnd-monster-manual.actors": false, "world.homebrew": false, "dnd5e.monsters": false }, "remembered");
});

await check("re-rendering the world directory keeps its switch and keeps it hidden", async () => {
  await page.evaluate(() => ui.actors.render());
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    switches: document.querySelectorAll("#actors > nav.pcs-switch").length,
    hidden: document.getElementById("actors").classList.contains("pcs-off"),
    first: document.getElementById("actors").firstElementChild.classList.contains("pcs-switch")
  }));
  equal(state, { switches: 1, hidden: true, first: true }, "after re-render");
});

await check("other sidebar tabs hide the panel, and coming back shows it again", async () => {
  await page.evaluate(() => ui.sidebar.changeTab("items", "primary"));
  await settle(page);
  const away = await page.evaluate(() => ({
    panel: getComputedStyle(document.getElementById("primal-compendiums-actors")).display,
    items: getComputedStyle(document.getElementById("items")).display,
    itemsPanel: !!document.getElementById("primal-compendiums-items")
  }));
  equal(away, { panel: "none", items: "flex", itemsPanel: false }, "on items");
  await shot(page, "06-items-world");
  await page.evaluate(() => ui.sidebar.changeTab("actors", "primary"));
  await settle(page);
  const back = await page.evaluate(() => getComputedStyle(document.getElementById("primal-compendiums-actors")).display);
  equal(back, "flex", "back on actors");
});

await check("World switches back to the world's own actors", async () => {
  await page.click("#primal-compendiums-actors > nav.pcs-switch [data-pcs-mode=world]");
  await settle(page);
  const state = await page.evaluate(() => ({
    host: getComputedStyle(document.getElementById("actors")).display,
    panel: getComputedStyle(document.getElementById("primal-compendiums-actors")).display,
    pressed: document.querySelector('#actors .pcs-switch [data-pcs-mode="world"]').getAttribute("aria-pressed")
  }));
  equal(state, { host: "flex", panel: "none", pressed: "true" }, "world");
});

await check("holding a dragged entry over a side switches to it", async () => {
  await page.evaluate(() => {
    const b = document.querySelector('#actors > nav.pcs-switch [data-pcs-mode="packs"]');
    b.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: new DataTransfer() }));
  });
  await page.waitForTimeout(150);
  const early = await page.evaluate(() => game.settings.get("primal-compendiums", "modes").actors);
  equal(early, "world", "not yet");
  await page.waitForTimeout(500);
  const later = await page.evaluate(() => game.settings.get("primal-compendiums", "modes").actors);
  equal(later, "packs", "switched");
  // And back, then cancelled by leaving.
  await page.evaluate(() => {
    const b = document.querySelector('#primal-compendiums-actors > nav.pcs-switch [data-pcs-mode="world"]');
    b.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: new DataTransfer() }));
    b.dispatchEvent(new DragEvent("dragleave", { bubbles: true, dataTransfer: new DataTransfer(), relatedTarget: document.body }));
  });
  await page.waitForTimeout(650);
  equal(await page.evaluate(() => game.settings.get("primal-compendiums", "modes").actors), "packs", "cancelled");
});

await check("Scenes show compendium scenes as banners, like the Scenes sidebar", async () => {
  await page.evaluate(() => ui.sidebar.changeTab("scenes", "primary"));
  await settle(page);
  await page.click("#scenes > nav.pcs-switch [data-pcs-mode=packs]");
  await page.waitForTimeout(400);
  const info = await page.evaluate(() => {
    const panel = document.getElementById("primal-compendiums-scenes");
    const entry = panel.querySelector(".directory-item.entry.scene");
    return {
      sceneClass: panel.classList.contains("scenes-sidebar"),
      expanded: panel.querySelector(".pcs-pack").classList.contains("expanded"),
      height: Math.round(entry.getBoundingClientRect().height),
      img: entry.querySelector("img")?.getAttribute("src")
    };
  });
  equal(info, { sceneClass: true, expanded: true, height: 100, img: "ui/banners/scene-banner.webp" }, "scene entry");
  await shot(page, "07-scenes-packs");
});

await check("the Choose Compendiums window lists only the directory's compendiums and saves each tick", async () => {
  await page.evaluate(() => ui.sidebar.changeTab("actors", "primary"));
  await settle(page);
  await page.click("#primal-compendiums-actors .pcs-header .pcs-choose");
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const app = document.getElementById("primal-compendiums-chooser");
    return {
      title: app?.querySelector(".window-title")?.textContent.trim(),
      sections: Array.from(app.querySelectorAll(".pcs-section")).map(s => s.dataset.documentName),
      packs: Array.from(app.querySelectorAll("input[data-pack]")).map(i => [i.dataset.pack, i.checked]),
      tally: app.querySelector(".pcs-tally").textContent.trim()
    };
  });
  equal(info, {
    title: "Choose Compendiums: Actors",
    sections: ["Actor"],
    packs: [["dnd-monster-manual.actors", true], ["dnd5e.monsters", true], ["world.homebrew", true]],
    tally: "3 of 3"
  }, "chooser");
  await page.screenshot({ path: path.join(SHOTS, "08-chooser.png") });
  await page.click('#primal-compendiums-chooser input[data-pack="world.homebrew"]');
  await page.waitForTimeout(400);
  const saved = await setting(page, "packs");
  equal(saved.includes("world.homebrew"), false, "unticked and saved");
  equal(saved.includes("dnd5e.items") && saved.includes("world.maps"), true, "other directories' choices kept");
  const panelPacks = await page.evaluate(() => Array.from(document.querySelectorAll("#primal-compendiums-actors .pcs-pack")).map(li => li.dataset.pack));
  equal(panelPacks, ["dnd-monster-manual.actors", "dnd5e.monsters"], "panel follows");
  const tally = await page.evaluate(() => document.querySelector("#primal-compendiums-chooser .pcs-tally").textContent.trim());
  equal(tally, "2 of 3", "tally");
});

await check("the chooser's filter and Show Every Directory work", async () => {
  await page.fill("#primal-compendiums-chooser input.pcs-filter", "manual");
  await page.waitForTimeout(150);
  const shown = await page.evaluate(() => Array.from(document.querySelectorAll("#primal-compendiums-chooser .pcs-chooser-pack"))
    .filter(l => !l.hidden).map(l => l.querySelector("input").dataset.pack));
  equal(shown, ["dnd-monster-manual.actors"], "filtered");
  await page.click("#primal-compendiums-chooser [data-action=showAll]");
  await page.waitForTimeout(400);
  const all = await page.evaluate(() => ({
    title: document.querySelector("#primal-compendiums-chooser .window-title").textContent.trim(),
    sections: Array.from(document.querySelectorAll("#primal-compendiums-chooser .pcs-section")).map(s => s.dataset.documentName)
  }));
  equal(all, { title: "Choose Compendiums", sections: ["Actor", "Item", "Scene", "JournalEntry"] }, "all");
  await page.screenshot({ path: path.join(SHOTS, "09-chooser-all.png") });
});

await check("All and None tick a whole directory at once", async () => {
  await page.fill("#primal-compendiums-chooser input.pcs-filter", "");
  await page.waitForTimeout(100);
  await page.click('#primal-compendiums-chooser .pcs-section[data-document-name="JournalEntry"] [data-action=tickAll]');
  await page.waitForTimeout(300);
  equal((await setting(page, "packs")).includes("dnd5e.rules"), true, "all");
  await page.click('#primal-compendiums-chooser .pcs-section[data-document-name="JournalEntry"] [data-action=tickNone]');
  await page.waitForTimeout(300);
  equal((await setting(page, "packs")).includes("dnd5e.rules"), false, "none");
});

await check("leaving the tab off unused directories takes the switch away and back", async () => {
  await choose(page, ["dnd5e.monsters"]);
  await page.click("#primal-compendiums-chooser input[name=hideUnused]");
  await page.waitForTimeout(400);
  equal(await setting(page, "hideUnused"), true, "saved");
  const state = await page.evaluate(() => ({
    actors: !!document.querySelector("#actors > nav.pcs-switch"),
    items: !!document.querySelector("#items > nav.pcs-switch"),
    itemsShown: getComputedStyle(document.getElementById("items")).display !== "none" || !document.getElementById("items").classList.contains("pcs-off")
  }));
  equal(state, { actors: true, items: false, itemsShown: true }, "switches");
  await page.click("#primal-compendiums-chooser input[name=hideUnused]");
  await page.waitForTimeout(400);
  equal(await page.evaluate(() => !!document.querySelector("#items > nav.pcs-switch")), true, "back");
  await page.evaluate(() => foundry.applications.instances.get("primal-compendiums-chooser")?.close());
});

await check("right-clicking a compendium in the Compendium sidebar offers Show / Remove for its directory", async () => {
  const result = await page.evaluate(async () => {
    const items = [];
    Hooks.call("getCompendiumContextOptions", {}, items);
    const li = pack => Object.assign(document.createElement("li"), { dataset: { pack } });
    const fake = id => { const el = document.createElement("li"); el.dataset.pack = id; return el; };
    const visibleFor = id => items.filter(i => i.visible(fake(id))).map(i => i.label);
    const before = visibleFor("world.maps");
    await items.find(i => i.visible(fake("world.maps"))).onClick(null, fake("world.maps"));
    const after = visibleFor("world.maps");
    return { before, after, monsters: visibleFor("dnd5e.monsters"), adventures: visibleFor("nope.pack") };
  });
  equal(result, {
    before: ["Show in Scenes Sidebar"],
    after: ["Remove from Scenes Sidebar"],
    monsters: ["Remove from Actors Sidebar"],
    adventures: []
  }, "context options");
});

await check("the settings menu is GM-only and opens the chooser for every directory", async () => {
  const menu = await page.evaluate(() => {
    const m = window.harness.settings.menus.get("primal-compendiums.chooser");
    return { restricted: m.restricted, label: game.i18n.localize(m.label), type: m.type.name };
  });
  equal(menu, { restricted: true, label: "Choose Compendiums", type: "ChooserApp" }, "menu");
});

await check("the macro API opens a directory on the side asked for", async () => {
  const run = async (...args) => {
    await page.evaluate(a => {
      ui.sidebar.changeTab("items", "primary");
      game.modules.get("primal-compendiums").api.show(...a);
    }, args);
    await settle(page);
    return page.evaluate(() => ({
      tab: ui.sidebar.tabGroups.primary,
      mode: game.settings.get("primal-compendiums", "modes").actors,
      world: getComputedStyle(document.getElementById("actors")).display !== "none",
      panel: getComputedStyle(document.getElementById("primal-compendiums-actors")).display !== "none"
    }));
  };
  equal(await run("actors", "world"), { tab: "actors", mode: "world", world: true, panel: false }, "world");
  equal(await run("actors"), { tab: "actors", mode: "packs", world: false, panel: true }, "compendiums");
});

await page.close();

/* ------------------------------------------------------------------------------------------------ */
/*  Filters and sort                                                                                */
/* ------------------------------------------------------------------------------------------------ */

const fp = await open();
const visibleNames = (sel) => fp.evaluate(s => Array.from(document.querySelectorAll(`${s} .directory-item.entry`))
  .filter(li => li.offsetParent !== null).map(li => li.querySelector(".entry-name").textContent.trim()), sel);
const pills = (sel, facet) => fp.evaluate(([s, f]) => Array.from(document.querySelectorAll(`${s} .pcs-facet[data-facet="${f}"] .pcs-pill`))
  .map(p => [p.dataset.value, p.querySelector("span").textContent.trim(), Number(p.querySelector(".pcs-pill-count").textContent), p.dataset.state]), [sel, facet]);
const pill = (sel, facet, value) => `${sel} .pcs-facet[data-facet="${facet}"] .pcs-pill[data-value="${value}"]`;

await check("every directory gets a filter and sort bar under its search box", async () => {
  const bars = await fp.evaluate(() => ["actors", "items", "scenes"].map(tab => {
    const bar = document.querySelector(`#${tab} .directory-header > search + .pcs-filters`);
    return [tab, !!bar, !!bar?.querySelector(".pcs-filter-toggle"),
      Array.from(bar?.querySelectorAll(".pcs-sort option") ?? []).map(o => o.textContent.trim())];
  }));
  equal(bars, [
    ["actors", true, true, ["Default order", "Name", "Challenge rating", "Creature type", "Source"]],
    ["items", true, true, ["Default order", "Name", "Rarity", "Item type", "Source"]],
    ["scenes", true, false, ["Default order", "Name"]]
  ], "bars");
});

const badges = sel => fp.evaluate(s => Object.fromEntries(Array.from(document.querySelectorAll(`${s} .directory-item.entry`))
  .map(li => [li.querySelector(".entry-name").textContent.trim(), li.querySelector(":scope > .pcs-cr")?.textContent ?? null])), sel);

await check("world actors show their CR, and player characters their level", async () => {
  await fp.evaluate(() => ui.sidebar.changeTab("actors", "primary"));
  await settle(fp);
  equal(await badges("#actors"), {
    "Town Guard": "CR 1/8", "Young Red Dragon": "CR 10", "Zombie": "CR 1/4", "Aria (PC)": "Lvl 5", "Bram (PC)": "Lvl 3"
  }, "badges");
  const kinds = await fp.evaluate(() => Array.from(document.querySelectorAll("#actors .pcs-cr")).map(b => b.dataset.kind).sort());
  equal(kinds, ["cr", "cr", "cr", "level", "level"], "kinds");
  const none = await fp.evaluate(() => document.querySelectorAll("#items .pcs-cr, #scenes .pcs-cr").length);
  equal(none, 0, "only actors have badges");
  // Still one badge each after the directory draws again and its search has run.
  await fp.evaluate(() => ui.actors.render({ force: true }));
  await fp.waitForTimeout(500);
  equal(await fp.evaluate(() => document.querySelectorAll("#actors .pcs-cr").length), 5, "after a re-draw");
});

await check("Filters opens tags for the world's actors: creature type and source, with counts", async () => {
  await fp.evaluate(() => ui.sidebar.changeTab("actors", "primary"));
  await settle(fp);
  await fp.click("#actors .pcs-filter-toggle");
  await settle(fp);
  equal(await pills("#actors", "type"), [
    ["dragon", "Dragon", 1, "off"], ["humanoid", "Humanoid", 1, "off"],
    ["kind:character", "Player Character", 2, "off"], ["undead", "Undead", 1, "off"]
  ], "types");
  equal(await pills("#actors", "source"), [["SRD 5.2", "SRD 5.2", 2, "off"], ["XMM", "XMM", 1, "off"]], "sources");
  const cr = await fp.evaluate(() => !!document.querySelector('#actors .pcs-facet[data-facet="cr"] select[data-end="1"]'));
  equal(cr, true, "CR range");
  await shot(fp, "12-actors-filters-open");
});

await check("a tag shows only those actors, opening the folders that hold them", async () => {
  await fp.click(pill("#actors", "type", "undead"));
  await settle(fp);
  equal(await visibleNames("#actors"), ["Zombie"], "shown");
  const state = await fp.evaluate(() => ({
    badge: document.querySelector("#actors .pcs-badge")?.textContent,
    shown: document.querySelector("#actors .pcs-shown")?.textContent.trim(),
    folderOpen: document.querySelector('#actors .directory-item.folder[data-folder-id="wf1"]').classList.contains("expanded"),
    saved: game.settings.get("primal-compendiums", "filters").actors.world.sets
  }));
  equal(state, { badge: "1", shown: "1 of 5 shown", folderOpen: true, saved: { type: { undead: 1 } } }, "state");
  await shot(fp, "13-actors-filter-undead");
});

await check("clicking the tag again hides those instead, and a third time clears it", async () => {
  await fp.click(pill("#actors", "type", "undead"));
  await settle(fp);
  equal(await visibleNames("#actors"), ["Town Guard", "Young Red Dragon", "Aria (PC)", "Bram (PC)"], "excluded");
  equal((await pills("#actors", "type")).find(p => p[0] === "undead")[3], "no", "red");
  await fp.click(pill("#actors", "type", "undead"));
  await settle(fp);
  equal((await pills("#actors", "type")).find(p => p[0] === "undead")[3], "off", "cleared");
});

await check("clearing the last tag puts folders back the way they were", async () => {
  const state = await fp.evaluate(() => ({
    folderOpen: document.querySelector('#actors .directory-item.folder[data-folder-id="wf1"]').classList.contains("expanded"),
    out: document.querySelectorAll("#actors .pcs-out").length,
    badge: !!document.querySelector("#actors .pcs-badge")
  }));
  equal(state, { folderOpen: false, out: 0, badge: false }, "restored");
  equal(await visibleNames("#actors"), ["Aria (PC)", "Bram (PC)"], "only loose actors show with the folder closed");
});

await check("tags and the Filters button keep their size whatever their state", async () => {
  const sel = pill("#actors", "source", "XMM");
  const size = () => fp.evaluate(s => {
    const r = document.querySelector(s).getBoundingClientRect();
    const t = document.querySelector("#actors .pcs-filter-toggle").getBoundingClientRect();
    const sort = document.querySelector("#actors .pcs-sort").getBoundingClientRect();
    return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10, Math.round(t.width * 10) / 10,
      Math.round(sort.width * 10) / 10, document.querySelector(s).dataset.state,
      !!document.querySelector(`${s} i`)];
  }, sel);
  const off = await size();
  await fp.click(sel);
  await settle(fp);
  const yes = await size();
  await fp.click(sel);
  await settle(fp);
  const no = await size();
  await fp.click(sel);
  await settle(fp);
  equal([off[4], yes[4], no[4]], ["off", "yes", "no"], "states");
  equal([yes.slice(0, 4), no.slice(0, 4)], [off.slice(0, 4), off.slice(0, 4)], "same sizes in every state");
  equal(no[5], false, "nothing is added to an excluded tag");
  const struck = await fp.evaluate(async s => {
    document.querySelector(s).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 100));
    const out = getComputedStyle(document.querySelector(`${s} .pcs-pill-label`)).textDecorationLine;
    document.querySelector(s).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 100));
    return out;
  }, sel);
  equal(struck, "line-through", "excluded tags are struck through");
});

await check("right-clicking a tag hides those straight away", async () => {
  await fp.click(pill("#actors", "type", "kind:character"), { button: "right" });
  await settle(fp);
  equal(await visibleNames("#actors"), ["Town Guard", "Young Red Dragon", "Zombie"], "no PCs");
  await fp.click(pill("#actors", "type", "kind:character"), { button: "right" });
  await settle(fp);
});

await check("a CR range keeps actors inside it and leaves out those with no CR", async () => {
  await fp.selectOption('#actors .pcs-facet[data-facet="cr"] select[data-end="0"]', "0.25");
  await settle(fp);
  equal(await visibleNames("#actors"), ["Young Red Dragon", "Zombie"], "from 1/4");
  await fp.selectOption('#actors .pcs-facet[data-facet="cr"] select[data-end="1"]', "5");
  await settle(fp);
  equal(await visibleNames("#actors"), ["Zombie"], "1/4 to 5");
  await fp.selectOption('#actors .pcs-facet[data-facet="cr"] select[data-end="1"]', "");
  await settle(fp);
});

await check("the directory's own search and the filters work together", async () => {
  await fp.fill("#actors search input[type=search]", "dragon");
  await fp.waitForTimeout(500);
  equal(await visibleNames("#actors"), ["Young Red Dragon"], "search + CR");
  await fp.fill("#actors search input[type=search]", "zom");
  await fp.waitForTimeout(500);
  equal(await visibleNames("#actors"), ["Zombie"], "other search");
  await fp.fill("#actors search input[type=search]", "aria");
  await fp.waitForTimeout(500);
  equal(await visibleNames("#actors"), [], "a PC has no CR");
  await fp.fill("#actors search input[type=search]", "");
  await fp.waitForTimeout(500);
  equal(await visibleNames("#actors"), ["Young Red Dragon", "Zombie"], "back to the filter alone");
  const open = await fp.evaluate(() => document.querySelector('#actors .directory-item.folder[data-folder-id="wf1"]').classList.contains("expanded"));
  equal(open, true, "the folder stays open after the search runs");
});

await check("the filters survive the directory drawing itself again", async () => {
  await fp.evaluate(() => ui.actors.render({ force: true }));
  await fp.waitForTimeout(600);
  equal(await visibleNames("#actors"), ["Young Red Dragon", "Zombie"], "still filtered");
  const bar = await fp.evaluate(() => document.querySelectorAll("#actors .pcs-filters").length);
  equal(bar, 1, "one bar");
  await fp.click("#actors .pcs-clear");
  await settle(fp);
  equal(await visibleNames("#actors"), ["Aria (PC)", "Bram (PC)"], "cleared");
});

await check("sorting puts entries in order inside each folder, either way, and Default order puts it back", async () => {
  await fp.evaluate(() => {
    document.querySelector('#actors .directory-item.folder[data-folder-id="wf1"] > .folder-header').click();
  });
  await settle(fp);
  await fp.selectOption("#actors .pcs-sort", "cr");
  await settle(fp);
  equal(await visibleNames("#actors"), ["Town Guard", "Zombie", "Young Red Dragon", "Aria (PC)", "Bram (PC)"], "CR up");
  await fp.click("#actors .pcs-sort-dir");
  await settle(fp);
  equal(await visibleNames("#actors"), ["Young Red Dragon", "Zombie", "Town Guard", "Aria (PC)", "Bram (PC)"], "CR down");
  await shot(fp, "14-actors-sort-cr");
  await fp.selectOption("#actors .pcs-sort", "type");
  await settle(fp);
  // Still the other way round: Undead, Humanoid, Dragon; the two Player Characters tie and go by name.
  equal(await visibleNames("#actors"), ["Zombie", "Town Guard", "Young Red Dragon", "Aria (PC)", "Bram (PC)"], "type");
  await fp.selectOption("#actors .pcs-sort", "");
  await fp.waitForTimeout(500);
  equal(await visibleNames("#actors"), ["Town Guard", "Young Red Dragon", "Zombie", "Aria (PC)", "Bram (PC)"], "default");
});

await check("Ignore folders shows every actor in one list, by name, and hides the folders", async () => {
  const boxes = await fp.evaluate(() => ["actors", "items", "scenes"].map(t => !!document.querySelector(`#${t} .pcs-filters input.pcs-flat-box`)));
  equal(boxes, [true, true, true], "every bar has the checkbox");
  await fp.click("#actors .pcs-filters .pcs-flat");
  await settle(fp);
  equal(await visibleNames("#actors"), ["Aria (PC)", "Bram (PC)", "Town Guard", "Young Red Dragon", "Zombie"], "one list");
  const state = await fp.evaluate(() => ({
    inRoot: document.querySelectorAll("#actors .directory-list > .directory-item.entry").length,
    folderShown: document.querySelector('#actors .directory-item.folder[data-folder-id="wf1"]').offsetParent !== null,
    saved: game.settings.get("primal-compendiums", "filters").actors.world.flat,
    checked: document.querySelector("#actors input.pcs-flat-box").checked
  }));
  equal(state, { inRoot: 5, folderShown: false, saved: true, checked: true }, "flat");
  await shot(fp, "18-actors-flat");
});

await check("the flat list sorts as one, filters, searches, and survives a re-draw", async () => {
  await fp.selectOption("#actors .pcs-sort", "cr");
  await settle(fp);
  // Still highest first from before.
  equal(await visibleNames("#actors"), ["Young Red Dragon", "Zombie", "Town Guard", "Aria (PC)", "Bram (PC)"], "by CR, as one list");
  await fp.evaluate(() => ui.actors.render({ force: true }));
  await fp.waitForTimeout(600);
  equal(await visibleNames("#actors"), ["Young Red Dragon", "Zombie", "Town Guard", "Aria (PC)", "Bram (PC)"], "after a re-draw");
  await fp.click(pill("#actors", "type", "kind:character"), { button: "right" });
  await settle(fp);
  equal(await visibleNames("#actors"), ["Young Red Dragon", "Zombie", "Town Guard"], "filtered");
  await fp.fill("#actors search input[type=search]", "o");
  await fp.waitForTimeout(500);
  equal(await visibleNames("#actors"), ["Young Red Dragon", "Zombie", "Town Guard"], "search: all three have an o");
  await fp.fill("#actors search input[type=search]", "zo");
  await fp.waitForTimeout(500);
  equal(await visibleNames("#actors"), ["Zombie"], "search");
  await fp.fill("#actors search input[type=search]", "");
  await fp.waitForTimeout(500);
  await fp.click("#actors .pcs-clear");
  await settle(fp);
  await shot(fp, "19-actors-flat-cr");
});

await check("while folders are ignored, a drop in the list can't move an actor between folders it can't see", async () => {
  const drop = data => fp.evaluate(d => {
    let reached = false;
    const seen = () => reached = true;
    document.addEventListener("drop", seen);
    const dt = new DataTransfer();
    dt.setData("text/plain", JSON.stringify(d));
    const li = document.querySelector("#actors .directory-list > .directory-item.entry");
    window.harness.calls.length = 0;
    li.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    document.removeEventListener("drop", seen);
    return { reached, notes: window.harness.calls.filter(c => c[0] === "notify").map(c => c[1]) };
  }, data);
  equal(await drop({ type: "Actor", uuid: "Actor.wa3" }), { reached: false, notes: ["info"] }, "a world actor is stopped");
  equal(await drop({ type: "Item", uuid: "Item.wi1" }), { reached: true, notes: [] }, "anything else goes through");
});

await check("unticking Ignore folders puts the folders back", async () => {
  await fp.click("#actors .pcs-filters .pcs-flat");
  await fp.waitForTimeout(600);
  const state = await fp.evaluate(() => ({
    inFolder: document.querySelectorAll('#actors .directory-item.folder[data-folder-id="wf1"] .directory-item.entry').length,
    inRoot: document.querySelectorAll("#actors .directory-list > .directory-item.entry").length,
    folderShown: document.querySelector('#actors .directory-item.folder[data-folder-id="wf1"]').offsetParent !== null,
    badges: document.querySelectorAll("#actors .pcs-cr").length
  }));
  equal(state, { inFolder: 3, inRoot: 2, folderShown: true, badges: 5 }, "folders back");
  await fp.selectOption("#actors .pcs-sort", "");
  await fp.waitForTimeout(500);
});

await check("Items filter by rarity and item type, and sort by rarity", async () => {
  await fp.evaluate(() => ui.sidebar.changeTab("items", "primary"));
  await settle(fp);
  await fp.click("#items .pcs-filter-toggle");
  await settle(fp);
  equal((await pills("#items", "rarity")).map(p => p[1]), ["Mundane", "Common", "Rare"], "rarities in order");
  equal((await pills("#items", "itemType")).map(p => p[1]), ["Consumable", "Loot", "Spell", "Weapon"], "types");
  equal((await pills("#items", "source")).map(p => p[1]), ["SRD 5.2", "XDMG"], "sources");
  await fp.click(pill("#items", "itemType", "weapon"));
  await settle(fp);
  equal(await visibleNames("#items"), ["Flame Tongue"], "weapons");
  await fp.click("#items .pcs-clear");
  await fp.selectOption("#items .pcs-sort", "rarity");
  await settle(fp);
  equal(await visibleNames("#items"), ["Rope", "Potion of Healing", "Flame Tongue", "Fireball"], "by rarity");
  await shot(fp, "15-items-filters");
});

await check("other directories sort by name, either way", async () => {
  const opts = await fp.evaluate(() => Array.from(document.querySelectorAll("#scenes .pcs-sort option")).map(o => o.value));
  equal(opts, ["", "name"], "options");
});

await check("only what is open is drawn, and a compendium's CRs are read when its entries are first drawn", async () => {
  await fp.evaluate(async () => {
    await game.settings.set("primal-compendiums", "packs", ["dnd5e.monsters", "dnd-monster-manual.actors", "world.homebrew", "dnd5e.items"]);
    window.harness.calls.length = 0;
    ui.sidebar.changeTab("actors", "primary");
  });
  await settle(fp);
  await fp.click("#actors > nav.pcs-switch [data-pcs-mode=packs]");
  await fp.waitForTimeout(500);
  const drawn = () => fp.evaluate(() => ({
    packs: document.querySelectorAll("#primal-compendiums-actors .pcs-pack").length,
    folders: document.querySelectorAll("#primal-compendiums-actors .directory-item.folder:not(.pcs-pack)").length,
    entries: document.querySelectorAll("#primal-compendiums-actors .directory-item.entry").length,
    reads: window.harness.calls.filter(c => c[0] === "getIndex").map(c => c[1])
  }));
  equal(await drawn(), { packs: 3, folders: 0, entries: 0, reads: [] }, "closed compendiums: nothing drawn in them, nothing read");

  await fp.click('#primal-compendiums-actors .pcs-pack[data-pack="dnd-monster-manual.actors"] > .folder-header .folder-name');
  await fp.waitForTimeout(300);
  equal(await drawn(), { packs: 3, folders: 1, entries: 1, reads: ["dnd-monster-manual.actors"] },
    "an opened compendium: its folders and loose entries, and its details read");
  equal(await badges("#primal-compendiums-actors"), { Aboleth: "CR 10" }, "badge once the details arrive");

  await fp.click('#primal-compendiums-actors .directory-item.folder[data-uuid="Compendium.dnd-monster-manual.actors.Folder.mmFolderGoblins0"] > .folder-header');
  await fp.waitForTimeout(200);
  const inFolder = await badges("#primal-compendiums-actors");
  equal([inFolder["Goblin Warrior"], inFolder["Hobgoblin Captain"]], ["CR 1/4", "CR 3"], "entries drawn later get their badge straight away");
  equal((await drawn()).reads, ["dnd-monster-manual.actors"], "read once");
  const panelBar = await fp.evaluate(() => !!document.querySelector("#primal-compendiums-actors .pcs-header > search + .pcs-filters"));
  equal(panelBar, true, "bar in the panel");
});

await check("opening Filters reads the rest of the Actor compendiums, once each, for the tags", async () => {
  const place = await fp.evaluate(() => document.querySelectorAll("#primal-compendiums-actors .directory-item.entry").length);
  await fp.click("#primal-compendiums-actors .pcs-filter-toggle");
  await fp.waitForTimeout(500);
  const reads = await fp.evaluate(() => window.harness.calls.filter(c => c[0] === "getIndex").map(c => [c[1], c[2]]));
  equal(reads.map(r => r[0]).sort(), ["dnd-monster-manual.actors", "dnd5e.monsters", "world.homebrew"], "the Actor compendiums");
  equal(reads[0][1], ["system.details.cr", "system.details.type", "system.source"], "fields");
  equal((await pills("#primal-compendiums-actors", "source")).map(p => [p[1], p[2]]),
    [["SRD 5.2", 31], ["Test World", 1], ["XMM", 4]], "sources, with the world's title for entries naming none");
  equal((await pills("#primal-compendiums-actors", "type")).find(p => p[0] === "humanoid")?.[2], 4, "counts cover entries that aren't drawn");
  const after = await fp.evaluate(() => ({
    entries: document.querySelectorAll("#primal-compendiums-actors .directory-item.entry").length,
    reading: document.querySelector("#primal-compendiums-actors .pcs-reading").hidden
  }));
  equal(after, { entries: place, reading: true }, "the list is left as it was");
  await fp.click("#primal-compendiums-actors .pcs-filter-toggle");
  await fp.click("#primal-compendiums-actors .pcs-filter-toggle");
  await fp.waitForTimeout(300);
  const again = await fp.evaluate(() => window.harness.calls.filter(c => c[0] === "getIndex").length);
  equal(again, 3, "read once");
});

await check("compendium filters cross every compendium, hiding the ones with nothing to show", async () => {
  await fp.click(pill("#primal-compendiums-actors", "type", "humanoid"));
  await settle(fp);
  equal(await visibleNames("#primal-compendiums-actors"),
    ["Goblin Boss", "Goblin Warrior", "Hobgoblin Captain", "Goblin"], "humanoids");
  const packs = await fp.evaluate(() => Array.from(document.querySelectorAll("#primal-compendiums-actors .pcs-pack"))
    .map(li => [li.dataset.pack, li.offsetParent !== null, li.classList.contains("expanded")]));
  equal(packs, [
    ["dnd-monster-manual.actors", true, true],
    ["dnd5e.monsters", true, true]
  ], "the compendiums with humanoids, opened; the one without is left out");
  const some = await badges("#primal-compendiums-actors");
  equal([some["Goblin Boss"], some["Goblin"]], ["CR 1", "CR 1/4"], "badges");
  const world = await fp.evaluate(() => game.settings.get("primal-compendiums", "filters").actors.world.sets);
  equal(world, {}, "the world side keeps its own filters");
  await shot(fp, "16-packs-filter-humanoid");
});

await check("compendium entries sort by CR inside each compendium and folder", async () => {
  await fp.click(pill("#primal-compendiums-actors", "type", "humanoid"));
  await fp.click(pill("#primal-compendiums-actors", "type", "humanoid"));
  await fp.selectOption("#primal-compendiums-actors .pcs-sort", "cr");
  await fp.click("#primal-compendiums-actors .pcs-filter-toggle");
  await settle(fp);
  const closed = await fp.evaluate(() => Array.from(document.querySelectorAll("#primal-compendiums-actors .pcs-pack"))
    .map(li => [li.dataset.pack, li.classList.contains("expanded")]));
  equal(closed, [["dnd-monster-manual.actors", true], ["dnd5e.monsters", false], ["world.homebrew", false]],
    "with the filter cleared, compendiums are as they were left");
  await fp.click('#primal-compendiums-actors .pcs-pack[data-pack="dnd5e.monsters"] > .folder-header .folder-name');
  await settle(fp);
  const crs = await fp.evaluate(() => {
    const sub = document.querySelector('#primal-compendiums-actors .pcs-pack[data-pack="dnd5e.monsters"] > .subdirectory');
    const pack = game.packs.get("dnd5e.monsters");
    return Array.from(sub.querySelectorAll(":scope > .entry")).map(li => pack.index.get(li.dataset.uuid.split(".").pop()).system.details.cr);
  });
  equal(crs.length, 31, "every entry of the opened compendium");
  equal(crs, [...crs].sort((a, b) => a - b), "ascending CR");
  await fp.selectOption("#primal-compendiums-actors .pcs-sort", "");
  await settle(fp);
  const names = await fp.evaluate(() => Array.from(document.querySelectorAll(
    '#primal-compendiums-actors .pcs-pack[data-pack="dnd5e.monsters"] > .subdirectory > .entry .entry-name')).slice(0, 3).map(a => a.textContent.trim()));
  equal(names, ["A-Monster 0", "A-Monster 10", "A-Monster 20"], "Default order puts the compendium's own order back");
  await fp.selectOption("#primal-compendiums-actors .pcs-sort", "cr");
  await settle(fp);
});

await check("Ignore folders on the Compendiums side makes one list across every compendium", async () => {
  await fp.click("#primal-compendiums-actors .pcs-filters .pcs-flat");
  await settle(fp);
  const state = await fp.evaluate(() => {
    const root = document.querySelector("#primal-compendiums-actors .directory-list");
    const lis = Array.from(root.querySelectorAll(":scope > .directory-item.entry"));
    const cr = li => game.packs.get(li.dataset.uuid.split(".").slice(1, 3).join(".")).index.get(li.dataset.uuid.split(".").pop()).system.details.cr;
    return {
      inRoot: lis.length,
      packsShown: Array.from(root.querySelectorAll(".pcs-pack")).filter(p => p.offsetParent !== null).length,
      ascending: lis.map(cr).every((v, i, a) => !i || (a[i - 1] <= v)),
      first: lis.slice(0, 3).map(li => li.querySelector(".entry-name").textContent.trim()),
      last: lis.at(-1).querySelector(".entry-name").textContent.trim(),
      tips: Array.from(new Set(lis.map(li => li.dataset.tooltip))).sort()
    };
  });
  equal(state, {
    inRoot: 36, packsShown: 0, ascending: true,
    first: ["A-Monster 0", "C-Monster 12", "E-Monster 24"],
    last: "D-Monster 23",
    tips: ["Homebrew Creatures", "Monster Manual", "Monsters (SRD)"]
  }, "one list by CR, each entry saying which compendium it is from");
  await fp.fill("#primal-compendiums-actors search input", "goblin");
  await fp.waitForTimeout(450);
  equal(await visibleNames("#primal-compendiums-actors"), ["Goblin", "Goblin Warrior", "Goblin Boss", "Hobgoblin Captain"], "search, by CR");
  await shot(fp, "20-packs-flat");
  await fp.fill("#primal-compendiums-actors search input", "");
  await fp.waitForTimeout(450);
  await fp.click("#primal-compendiums-actors .pcs-filters .pcs-flat");
  await fp.waitForTimeout(600);
  const back = await fp.evaluate(() => ({
    inRoot: document.querySelectorAll("#primal-compendiums-actors .directory-list > .directory-item.entry").length,
    packsShown: Array.from(document.querySelectorAll("#primal-compendiums-actors .pcs-pack")).filter(p => p.offsetParent !== null).length,
    tips: document.querySelectorAll("#primal-compendiums-actors .directory-item.entry[data-tooltip]").length
  }));
  equal(back, { inRoot: 0, packsShown: 3, tips: 0 }, "compendiums and folders back");
});

await check("Item compendiums filter by rarity too, reading their details only once the filters are used", async () => {
  await fp.evaluate(() => ui.sidebar.changeTab("items", "primary"));
  await settle(fp);
  await fp.click("#items > nav.pcs-switch [data-pcs-mode=packs]");
  await fp.waitForTimeout(400);
  const reads = () => fp.evaluate(() => window.harness.calls.filter(c => (c[0] === "getIndex") && (c[1] === "dnd5e.items")).length);
  equal(await reads(), 0, "nothing read on opening the side");
  await fp.click("#primal-compendiums-items .pcs-filter-toggle");
  await fp.waitForTimeout(400);
  equal(await reads(), 1, "read when Filters opens");
  equal((await pills("#primal-compendiums-items", "rarity")).map(p => p[1]), ["Mundane", "Uncommon", "Rare"], "rarities");
  await fp.click(pill("#primal-compendiums-items", "rarity", "mundane"));
  await fp.click(pill("#primal-compendiums-items", "rarity", "mundane"));
  await settle(fp);
  equal(await visibleNames("#primal-compendiums-items"), ["Cloak of Protection", "Flame Tongue Longsword"], "magic only");
  await shot(fp, "17-items-packs-filter");
});

await fp.close();

/* ------------------------------------------------------------------------------------------------ */
/*  Many compendium actors                                                                          */
/* ------------------------------------------------------------------------------------------------ */

// Twelve Actor compendiums of 500 monsters each, in A to Z folders: 6,000 actors.
const big = await open("?stress=12x500");
const B = "#primal-compendiums-actors";
const bigDrawn = () => big.evaluate(() => {
  const list = document.querySelector("#primal-compendiums-actors .directory-list");
  return {
    packs: list.querySelectorAll(".pcs-pack").length,
    folders: list.querySelectorAll(".directory-item.folder:not(.pcs-pack)").length,
    entries: list.querySelectorAll(".directory-item.entry").length,
    reads: window.harness.calls.filter(c => c[0] === "getIndex").length
  };
});
const bigScroll = async to => {
  await big.evaluate(top => {
    const list = document.querySelector("#primal-compendiums-actors .directory-list");
    list.scrollTop = top ?? list.scrollHeight;
  }, to);
  await big.waitForTimeout(250);
};
await big.evaluate(() => {
  window.__long = [];
  new PerformanceObserver(list => {
    for ( const e of list.getEntries() ) window.__long.push(Math.round(e.duration));
  }).observe({ entryTypes: ["longtask"] });
  ui.sidebar.changeTab("actors", "primary");
});
await settle(big);

await check("thousands of compendium actors: opening the side draws the compendiums and nothing in them", async () => {
  await big.click("#actors > nav.pcs-switch [data-pcs-mode=packs]");
  await big.waitForTimeout(500);
  equal(await bigDrawn(), { packs: 12, folders: 0, entries: 0, reads: 0 }, "drawn");
  await big.click(`${B} .pcs-pack >> nth=0 >> .folder-name`);
  await settle(big);
  equal(await bigDrawn(), { packs: 12, folders: 26, entries: 0, reads: 0 }, "an opened compendium draws its folders");
  await big.click(`${B} .pcs-pack >> nth=0 >> .subdirectory > .folder >> nth=2 >> .folder-header`);
  await settle(big);
  const open = await bigDrawn();
  equal([open.entries > 10 && open.entries < 30, open.reads], [true, 1], "an opened folder draws its entries, and reads that compendium");
  await shot(big, "21-many-folders");
});

await check("a search across all of them draws only the matches near the top", async () => {
  await big.fill(`${B} search input`, "creature");
  await big.waitForTimeout(450);
  const found = await bigDrawn();
  assert(found.entries > 15 && found.entries < 400, `entries drawn: ${found.entries}`);
  equal(found.packs, 12, "every compendium has matches");
  await big.fill(`${B} search input`, "creature 7-123");
  await big.waitForTimeout(450);
  const one = await big.evaluate(() => Array.from(document.querySelectorAll("#primal-compendiums-actors .directory-item.entry"))
    .map(li => [li.querySelector(".entry-name").textContent.trim(), li.offsetParent !== null]));
  equal(one.length, 1, "one match");
  assert(/Creature 7-123$/.test(one[0][0]) && one[0][1], `the match shows: ${one[0]}`);
  const packs = await big.evaluate(() => Array.from(document.querySelectorAll("#primal-compendiums-actors .pcs-pack")).map(li => li.dataset.pack));
  equal(packs, ["stress.pack07"], "only its compendium shows");
  // A row drawn on the fly drags and opens like any other.
  const acted = await big.evaluate(async () => {
    const li = document.querySelector("#primal-compendiums-actors .directory-item.entry");
    const dt = new DataTransfer();
    li.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    li.querySelector(".entry-name").click();
    await new Promise(r => setTimeout(r, 100));
    return [li.getAttribute("draggable"), JSON.parse(dt.getData("text/plain")).uuid === li.dataset.uuid,
      window.harness.calls.filter(c => c[0] === "sheet").map(c => c[1] === li.dataset.uuid)];
  });
  equal(acted, ["true", true, [true]], "drag data and sheet");
  await big.fill(`${B} search input`, "");
  await big.waitForTimeout(450);
});

await check("one list of all 6,000 draws a screenful, more as it is scrolled, and keeps its place", async () => {
  await big.click(`${B} .pcs-filters .pcs-flat`);
  await big.waitForTimeout(600);
  const first = await bigDrawn();
  assert(first.entries >= 30 && first.entries <= 200, `first screenful: ${first.entries}`);
  equal([first.packs, first.folders], [0, 0], "no compendium groups or folders");
  await bigScroll();
  const second = await bigDrawn();
  assert(second.entries > first.entries && second.entries <= first.entries + 240, `after scrolling: ${second.entries}`);
  await bigScroll();
  await bigScroll();
  const later = await bigDrawn();
  assert(later.entries > second.entries, `further down: ${later.entries}`);
  const ordered = await big.evaluate(() => {
    const names = Array.from(document.querySelectorAll("#primal-compendiums-actors .directory-list > .directory-item.entry .entry-name"))
      .map(a => a.textContent.trim());
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    return names.every((n, i) => !i || (collator.compare(names[i - 1], n) <= 0));
  });
  equal(ordered, true, "by name across the chunks");
  const badges = await big.evaluate(() => Array.from(document.querySelectorAll("#primal-compendiums-actors .directory-item.entry"))
    .filter(li => !li.querySelector(":scope > .pcs-cr")).length);
  equal(badges, 0, "every drawn entry has its CR");
  await shot(big, "22-many-flat");

  // Drawing the panel again (a compendium changed) keeps the list where it was.
  await bigScroll(4000);
  const before = await big.evaluate(() => Math.round(document.querySelector("#primal-compendiums-actors .directory-list").scrollTop));
  await big.evaluate(() => game.modules.get("primal-compendiums").api.controllers.find(c => c.tab === "actors").view.render());
  await big.waitForTimeout(500);
  const after = await big.evaluate(() => Math.round(document.querySelector("#primal-compendiums-actors .directory-list").scrollTop));
  equal([before, Math.abs(after - before) <= 2], [4000, true], `scroll kept (${after})`);
});

await check("filters count and match across everything, drawn or not", async () => {
  await big.click(`${B} .pcs-filter-toggle`);
  await big.waitForTimeout(700);
  const reads = await big.evaluate(() => window.harness.calls.filter(c => c[0] === "getIndex").map(c => c[1]));
  equal([reads.length, new Set(reads).size], [12, 12], "every compendium read, once each");
  const tag = await big.evaluate(() => Number(document.querySelector(
    '#primal-compendiums-actors .pcs-pill[data-value="dragon"] .pcs-pill-count').textContent));
  equal(tag, 751, "dragons counted in all twelve compendiums");
  await big.click(`${B} .pcs-pill[data-value="dragon"]`);
  await settle(big);
  const shown = await big.evaluate(() => document.querySelector("#primal-compendiums-actors .pcs-shown").textContent.replace(/[^\d ]/g, "").trim().split(/\s+/));
  equal(shown, ["751", "6000"], "shown of total");
  const drawn = await bigDrawn();
  assert(drawn.entries >= 30 && drawn.entries <= 200, `drawn: ${drawn.entries}`);
  await big.click(`${B} .pcs-filters .pcs-flat`);
  await settle(big);
  const grouped = await bigDrawn();
  equal(grouped.packs, 12, "back in their compendiums, each opened to its dragons");
  assert(grouped.entries >= 15 && grouped.entries <= 400, `drawn: ${grouped.entries}`);
  await shot(big, "23-many-filtered");
  await big.click(`${B} .pcs-clear`);
  await big.click(`${B} .pcs-filter-toggle`);
  await settle(big);
});

await check("none of that held the page up", async () => {
  const long = await big.evaluate(() => window.__long.slice());
  const worst = Math.max(0, ...long);
  assert(worst < 300, `longest pause ${worst} ms (${long.join(", ")})`);
  const nodes = await big.evaluate(() => document.querySelectorAll("#primal-compendiums-actors *").length);
  assert(nodes < 3000, `panel elements: ${nodes}`);
});

await big.close();

/* ------------------------------------------------------------------------------------------------ */

await check("players get nothing: no switch, no panel, no hooks", async () => {
  const player = await open("?player=1");
  const state = await player.evaluate(() => {
    ui.sidebar.changeTab("actors", "primary");
    return {
      switches: document.querySelectorAll(".pcs-switch").length,
      panels: document.querySelectorAll(".primal-compendiums").length,
      hooks: (Hooks.events.renderDocumentDirectory ?? []).length + (Hooks.events.getCompendiumContextOptions ?? []).length
    };
  });
  equal(state, { switches: 0, panels: 0, hooks: 0 }, "player");
  await shot(player, "10-player-actors");
  await player.close();
});

await check("a remembered Compendiums side comes back after a reload, drawn only when its tab opens", async () => {
  const p = await open();
  await p.evaluate(async () => {
    await game.settings.set("primal-compendiums", "packs", ["dnd5e.items"]);
    ui.sidebar.changeTab("items", "primary");
  });
  await p.waitForTimeout(200);
  await p.click("#items > nav.pcs-switch [data-pcs-mode=packs]");
  await p.waitForTimeout(400);
  const lone = await p.evaluate(() => document.querySelector("#primal-compendiums-items .pcs-pack").classList.contains("expanded"));
  equal(lone, true, "a lone compendium starts open");
  await shot(p, "11-items-packs");
  await p.close();
});

await browser.close();
server.close();

// The staged Foundry files leave out a few interface images.
const relevant = errors.filter(e => !/favicon|resize-handle|Failed to load resource/.test(e));
if ( relevant.length ) {
  failed++;
  console.error(`FAIL page errors\n  ${relevant.join("\n  ")}`);
}
console.log(`${passed} passed, ${failed} failed (screenshots in ${SHOTS})`);
if ( failed ) process.exit(1);
