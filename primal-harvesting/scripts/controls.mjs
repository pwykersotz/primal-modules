/**
 * Ways to start a harvest:
 * - a Harvest button on the Token HUD of a beaten monster (the GM's way: players can't open a monster's HUD),
 * - the Harvest buttons on the "ready to harvest" chat cards (when a combat ends or a monster dies),
 * - a Harvest tool in the Token controls, and a keybinding (unbound to start with), for the creature you target,
 * - macros: game.modules.get("primal-harvesting").api.open(token).
 */
import { FLAGS, MODULE_ID, SETTINGS, loc, setting } from "./constants.mjs";
import { canHarvest, harvestedRecord, isDefeated, isMonster } from "./creature.mjs";
import { HarvestWindow } from "./apps/harvest-window.mjs";

/** The creature to harvest when no token is given: the user's target, else a controlled monster. */
export function pickTarget() {
  const targeted = [...(game.user.targets ?? [])].map(t => t.document).filter(d => d?.actor && isMonster(d.actor));
  if ( targeted.length ) return targeted[0];
  const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(t => t.document)
    .filter(d => d?.actor && isMonster(d.actor) && !d.actor.hasPlayerOwner);
  return controlled[0] ?? null;
}

/** Open the harvest window for the user's target. */
export function harvestTarget() {
  const tokenDoc = pickTarget();
  if ( !tokenDoc ) {
    ui.notifications.info(loc("Errors.NoTarget"));
    return null;
  }
  return HarvestWindow.open(tokenDoc);
}

/** Add the Harvest button to a beaten monster's Token HUD. */
function onRenderTokenHUD(hud, html) {
  const tokenDoc = hud?.object?.document;
  const actor = tokenDoc?.actor;
  if ( !actor || !isMonster(actor) || actor.hasPlayerOwner ) return;
  if ( !canHarvest(tokenDoc).ok ) return;
  const defeated = isDefeated(actor, tokenDoc);
  if ( !defeated && (setting(SETTINGS.deadOnly) !== false) ) return;
  const root = (html instanceof HTMLElement) ? html : (html?.[0] ?? hud.element);
  const col = root?.querySelector(".col.right") ?? root?.querySelector(".col.left");
  if ( !col || col.querySelector(".primal-harvesting-hud") ) return;
  const harvested = !!harvestedRecord(tokenDoc);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `control-icon primal-harvesting-hud${harvested ? " harvested" : ""}`;
  button.dataset.action = "primalHarvest";
  button.dataset.tooltip = loc(harvested ? "Hud.Harvested" : "Hud.Harvest");
  button.setAttribute("aria-label", button.dataset.tooltip);
  button.innerHTML = '<i class="fa-solid fa-bone" inert></i>';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    HarvestWindow.open(tokenDoc);
  });
  col.append(button);
}

/** The Harvest tool in the Token controls (Foundry 13+ scene controls). */
function onGetSceneControlButtons(controls) {
  const tokens = controls?.tokens ?? (Array.isArray(controls) ? controls.find(c => c.name === "token") : null);
  if ( !tokens ) return;
  const tool = {
    name: "primalHarvest",
    title: "PRIMAL_HARVESTING.Controls.Harvest",
    icon: "fa-solid fa-bone",
    button: true,
    visible: game.user.isGM || (setting(SETTINGS.playersCanHarvest) !== false),
    order: 50,
    onChange: () => harvestTarget()
  };
  if ( Array.isArray(tokens.tools) ) tokens.tools.push(tool);
  else if ( tokens.tools ) tokens.tools[tool.name] = tool;
}

/** Clicks on the Harvest buttons of chat cards, wherever the card is shown (the log, a pop-out, a notification). */
function onDocumentClick(event) {
  const button = event.target?.closest?.("[data-primal-harvest]");
  if ( !button ) return;
  event.preventDefault();
  event.stopPropagation();
  const uuid = button.dataset.tokenUuid;
  if ( !uuid ) return;
  Promise.resolve(fromUuid(uuid)).then(tokenDoc => {
    if ( !tokenDoc ) {
      ui.notifications.warn(loc("Errors.Gone"));
      return;
    }
    HarvestWindow.open(tokenDoc);
  });
}

/** Mark the rows of "ready to harvest" cards whose creature has been harvested since. */
function onRenderChatMessage(message, html) {
  const ready = message?.getFlag?.(MODULE_ID, FLAGS.ready);
  if ( !ready ) return;
  const root = (html instanceof HTMLElement) ? html : html?.[0];
  for ( const button of root?.querySelectorAll?.("[data-primal-harvest]") ?? [] ) {
    let tokenDoc = null;
    try {
      tokenDoc = globalThis.fromUuidSync?.(button.dataset.tokenUuid);
    } catch {
      tokenDoc = null;
    }
    const row = button.closest(".ph-ready-row");
    row?.classList.toggle("harvested", !!harvestedRecord(tokenDoc));
    row?.classList.toggle("gone", !tokenDoc);
  }
}

export function registerControls() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
  document.addEventListener("click", onDocumentClick, true);

  game.keybindings?.register(MODULE_ID, "harvestTarget", {
    name: "PRIMAL_HARVESTING.Keybindings.HarvestTarget.Name",
    hint: "PRIMAL_HARVESTING.Keybindings.HarvestTarget.Hint",
    editable: [],
    onDown: () => {
      harvestTarget();
      return true;
    }
  });
}
