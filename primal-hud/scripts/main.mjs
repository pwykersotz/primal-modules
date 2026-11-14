import { MODULE_ID } from "./constants.mjs";
import { initButtons } from "./buttons.mjs";
import { initLayout } from "./layout.mjs";
import { projectHp, queueHpChange, registerHpControls } from "./hp-controls.mjs";
import { registerSettings } from "./settings.mjs";
import { registerSidebar } from "./sidebar.mjs";
import { registerTokenClicks } from "./token-clicks.mjs";
import { HudButtonsConfig } from "./apps/buttons-config.mjs";
import { HudLayoutConfig } from "./apps/layout-config.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerHpControls();
  registerSidebar();
});

Hooks.once("setup", () => {
  registerTokenClicks();
});

Hooks.once("ready", () => {
  initButtons();
  initLayout();
  const module = game.modules.get(MODULE_ID);
  console.log(`${MODULE_ID} | ${module?.version ?? ""} ready`);
  if ( !module ) return;
  module.api = {
    /**
     * Change hit points the same way the HUD buttons do (combined with any clicks made at the same moment).
     * @param {Actor|Token|TokenDocument} target
     * @param {number} delta   Positive heals, negative damages.
     */
    adjustHp(target, delta) {
      const actor = (target?.documentName === "Actor") ? target : target?.actor;
      if ( !actor ) throw new Error(`${MODULE_ID} | adjustHp needs an Actor, Token or TokenDocument`);
      queueHpChange(actor, Number(delta));
    },
    projectHp,
    /** Open the "Token HUD buttons" window. */
    openButtonSettings: () => new HudButtonsConfig().render({ force: true }),
    /** Open the "Arrange Token HUD buttons" window. */
    openLayoutSettings: () => new HudLayoutConfig().render({ force: true })
  };
});
