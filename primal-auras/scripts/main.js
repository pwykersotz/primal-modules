import { MODULE_ID, TEMPLATES, loadTemplates, isActiveGM } from "./constants.js";
import { registerSettings, registerKeybindings } from "./settings.js";
import { refreshTokenAuras, refreshAllAuras, refreshActorAuras } from "./renderer.js";
import { registerHudHooks } from "./hud.js";
import { registerItemHooks } from "./items.js";
import { engine, cleanupDeletedToken } from "./automation.js";
import { onMoveToken } from "./passthrough.js";
import { initSocket } from "./socket.js";
import { buildApi } from "./api.js";
import { PresetManager } from "./apps/preset-manager.js";
import { getTokenAuras } from "./data.js";
import { migrateLegacyData } from "./migration.js";

const TOKEN_KEYS = ["x", "y", "elevation", "width", "height", "disposition", "hidden", "level", "shape", "actorId", "actorLink"];

Hooks.once("init", () => {
  registerSettings({
    onDisplayChange: () => refreshAllAuras(),
    onAutomationChange: enabled => {
      if (!game.ready || !game.user?.isGM) return;
      if (enabled) engine.scheduleRelevant();
      else engine.cleanup();
    },
    presetManagerClass: PresetManager
  });
  registerKeybindings({ onDisplayChange: () => refreshAllAuras() });
  loadTemplates(Object.values(TEMPLATES));
  registerHudHooks();
  registerItemHooks();
});

Hooks.once("ready", async () => {
  initSocket();
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = buildApi();
  if (isActiveGM()) {
    await migrateLegacyData();
    engine.scheduleRelevant();
  }
});

/* -------------------------------------------- */
/*  Drawing                                     */
/* -------------------------------------------- */

Hooks.on("drawToken", token => refreshTokenAuras(token));

Hooks.on("hoverToken", token => {
  if (getTokenAuras(token.document).some(e => e.aura.showWhen === "hover")) refreshTokenAuras(token);
});

Hooks.on("controlToken", token => {
  if (getTokenAuras(token.document).some(e => ["hover", "controlled"].includes(e.aura.showWhen))) refreshTokenAuras(token);
});

const refreshCombatAuras = () => {
  if (!canvas?.ready) return;
  for (const token of canvas.tokens.placeables) {
    if (getTokenAuras(token.document).some(e => e.aura.showWhen === "combat")) refreshTokenAuras(token);
  }
};
Hooks.on("createCombatant", refreshCombatAuras);
Hooks.on("deleteCombatant", refreshCombatAuras);
Hooks.on("deleteCombat", refreshCombatAuras);

/* -------------------------------------------- */
/*  Document changes                            */
/* -------------------------------------------- */

Hooks.on("updateToken", (doc, changes) => {
  const auraChanged = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) || "delta" in changes;
  const moved = TOKEN_KEYS.some(k => k in changes);
  if (!auraChanged && !moved) return;
  if (doc.object) refreshTokenAuras(doc.object);
  engine.schedule(doc.parent);
});

// A move's path: creatures passing through an aura on the way trigger its "on enter" effects (passthrough.js).
Hooks.on("moveToken", (doc, movement) => onMoveToken(engine, doc, movement));
Hooks.on("createToken", doc => engine.schedule(doc.parent));
Hooks.on("deleteToken", doc => {
  engine.schedule(doc.parent);
  if (isActiveGM()) engine.enqueue(() => cleanupDeletedToken(doc));
});

function onItemChange(item) {
  const actor = item.parent;
  if (actor?.documentName !== "Actor") return;
  refreshActorAuras(actor);
  if (actor.isToken) engine.schedule(actor.token?.parent);
  else engine.scheduleRelevant();
}
Hooks.on("createItem", onItemChange);
Hooks.on("updateItem", onItemChange);
Hooks.on("deleteItem", onItemChange);

Hooks.on("updateActor", actor => {
  if (actor.isToken) engine.schedule(actor.token?.parent);
  else engine.scheduleRelevant();
});

// Conditions such as "defeated" switch auras and targets in and out.
const onEffectChange = effect => {
  if (effect.flags?.[MODULE_ID]) return;
  const actor = effect.parent;
  if (actor?.documentName !== "Actor") return;
  if (actor.isToken) engine.schedule(actor.token?.parent);
  else engine.scheduleRelevant();
};
Hooks.on("createActiveEffect", onEffectChange);
Hooks.on("deleteActiveEffect", onEffectChange);

Hooks.on("updateCombat", (combat, changed, options) => engine.onUpdateCombat(combat, changed, options));
Hooks.on("updateWorldTime", () => engine.onWorldTime());
Hooks.on("canvasReady", () => {
  if (isActiveGM()) engine.schedule(canvas.scene, 300);
});
