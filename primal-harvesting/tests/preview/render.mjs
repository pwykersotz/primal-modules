/**
 * Renders the harvest window, the Harvest Tables window and both chat cards into one page (tests/preview/out.html)
 * with a rough stand-in for Foundry's dark theme, to look at the layout in a browser. Not a check.
 * Run with: node tests/preview/render.mjs
 */
import { writeFileSync, readFileSync } from "node:fs";
import { installFoundry, makeActor, makeToken, queueD20, queueRoll, registerSettings, log } from "../fakes.mjs";

installFoundry();
const { HarvestWindow } = await import("../../scripts/apps/harvest-window.mjs");
const { HarvestTablesEditor } = await import("../../scripts/apps/tables-editor.mjs");
const { HarvestRulesEditor } = await import("../../scripts/apps/rules-editor.mjs");
const { normalizeTables } = await import("../../scripts/tables.mjs");
const harvest = await import("../../scripts/harvest.mjs");
await registerSettings();
await game.settings.set("primal-harvesting", "tables", normalizeTables({
  types: { undead: [
    { name: "Bone dust", dc: 5, tags: ["E"] }, { name: "Grave cloth", dc: 5 }, { name: "Claw", dc: 10, max: 2 },
    { name: "Heart", dc: 10, tags: ["E+"] }, { name: "Eye", dc: 5, max: 2 }, { name: "Necrotic gland", dc: 15, tags: ["V"], note: "Bursts if cut wrong" },
    { name: "Tongue", dc: 10, tags: ["*"] }
  ],
  ooze: {
    note: "Optional Rule: Hard Bits. When an ooze dies, roll a d100 on its random components table.\nUse other creature types' harvest tables to allocate a DC.",
    components: [{ name: "Phial of acid", dc: 5 }, { name: "Phial of mucus", dc: 10 }, { name: "Vesicle", dc: 15 }, { name: "Membrane", dc: 20 }],
    random: { name: "Ooze's Random Components", rows: ["1-20 Nothing", "21-60 Bone (beast)", "61-96 Tooth (giant) DC 10", "97-99 Roll twice more", "100 Roll thrice more"] }
  },
  beast: [{ name: "Bone", dc: 10 }] },
  creatures: [{ name: "Polyhedrooze", aliases: ["Tetrahedrooze"], components: [] }]
}));
const party = [
  makeActor({ name: "Aria Thornwood", abilities: { int: 18, dex: 10 }, skills: { med: 1 }, prof: 3 }),
  makeActor({ name: "Bram", abilities: { int: 8, dex: 18 }, skills: { med: 1 }, prof: 3 }),
  makeActor({ name: "Cass", abilities: { int: 12, dex: 12, wis: 18 }, prof: 3, casting: "wis" }),
  makeActor({ name: "Dee", abilities: { int: 10, dex: 12 }, skills: { med: 2 }, prof: 3 })
];
game.actors.push(...party);
const ghoul = makeActor({ name: "Ghoul Priest", type: "npc", creatureType: "undead", cr: 5, hp: 0, player: false });
const token = makeToken(ghoul);
const app = HarvestWindow.open(token);
await app.render();
const key = n => app._model.available.find(c => c.name === n).key;
for ( const n of ["Heart", "Claw", "Claw", "Frail Essence", "Necrotic gland"] ) await app.act("add", { key: key(n) });
const windowHTML = app.lastHTML;
queueD20(14, 11);
await app.act("harvest");
const card = log.messages.find(m => m.flags?.["primal-harvesting"]?.card).content;
await harvest.postReadyCard([makeToken(makeActor({ name: "Ghoul", type: "npc", creatureType: "undead", hp: 0, player: false })), token], "combat");
const ready = log.messages.find(m => m.flags?.["primal-harvesting"]?.ready).content;
const cube = makeToken(makeActor({ name: "Gelatinous Cube", type: "npc", creatureType: "ooze", size: "lg", cr: 2, hp: 0, player: false }));
const oozeApp = HarvestWindow.open(cube);
await oozeApp.ready;
const oozeBefore = oozeApp.lastHTML;
queueRoll(98, 30, 70);
await oozeApp.act("rollRandom");
await oozeApp.render();
await oozeApp.act("add", { key: oozeApp._model.available.find(c => c.name === "Bone").key });
const oozeHTML = oozeApp.lastHTML;
const randomCard = log.messages.find(m => m.flags?.["primal-harvesting"]?.randomCard).content;
const editor = new HarvestTablesEditor({}, "type:ooze");
await editor.render();
const rules = new HarvestRulesEditor();
await rules.render();

const css = readFileSync(new URL("../../styles/primal-harvesting.css", import.meta.url), "utf8");
const page = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<style>
body { margin: 0; padding: 20px; background: #2b2a33; color: #efe6d8; font: 14px/1.4 "Signika", system-ui, sans-serif; display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
.app { background: rgba(11,10,19,0.95); border: 1px solid #444; border-radius: 6px; box-shadow: 0 0 20px #000a; }
.app > header { padding: 6px 10px; border-bottom: 1px solid #444; font-weight: bold; }
.window-content { padding: 0.75rem; }
button { font: inherit; color: inherit; background: rgba(255,255,255,0.08); border: 1px solid #666; border-radius: 4px; height: 28px; cursor: pointer; }
button:disabled { opacity: .5 }
input, select { font: inherit; color: inherit; background: rgba(0,0,0,0.35); border: 1px solid #666; border-radius: 3px; height: 26px; box-sizing: border-box; }
h2, h3, h4 { font-family: inherit; }
.chat { width: 300px; background: #ddd5c4; color: #191813; padding: 8px; border-radius: 4px; }
.chat .primal-harvesting-card { --ph-good: #2e7d32; --ph-maybe: #9a6700; --ph-bad: #b3261e; --ph-accent: #8a5a1f; }
.dice-roll { background: rgba(0,0,0,.06); border: 1px solid #999; border-radius: 3px; padding: 2px 6px; display: flex; justify-content: space-between; }
.dice-roll h4 { margin: 0; }
${css}
</style></head><body>
<div class="app primal-harvesting-window" style="width:800px"><header>Harvest: Ghoul Priest</header><div class="window-content">${windowHTML}</div></div>
<div class="chat">${card}<hr>${ready}<hr>${randomCard}</div>
<div class="app primal-harvesting-window" style="width:800px"><header>Harvest: Gelatinous Cube (before the roll)</header><div class="window-content">${oozeBefore}</div></div>
<div class="app primal-harvesting-window" style="width:800px"><header>Harvest: Gelatinous Cube</header><div class="window-content">${oozeHTML}</div></div>
<div class="app primal-harvesting-editor" style="width:940px;height:640px;display:flex;flex-direction:column"><header>Harvest Tables</header><div class="window-content" style="flex:1;min-height:0">${editor.lastHTML}</div></div>
<div class="app primal-harvesting-editor" style="width:760px"><header>Harvest Rules</header><div class="window-content">${rules.lastHTML}</div></div>
</body></html>`;
writeFileSync(new URL("./out.html", import.meta.url), page);
console.log("wrote tests/preview/out.html");
