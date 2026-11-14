import { MODULE_ID } from "./constants.mjs";
import { registerDisplay, scheduleDisplay } from "./display.mjs";
import { registerHud } from "./hud.mjs";
import {
  mountCandidates, onTokenDeleted, repairScene, requestMount, requestToggleControl, requestUnmount
} from "./mounting.mjs";
import { registerMovement } from "./movement.mjs";
import { fallCheck, patchFalling, patchSpeeds, registerRules } from "./rules.mjs";
import { registerSettings } from "./settings.mjs";
import { initSocket } from "./socket.mjs";
import { getPair } from "./util.mjs";

Hooks.once("init", () => {
  registerSettings(() => scheduleDisplay());
  registerMovement();
  registerHud();
  registerDisplay();
  registerRules();

  // Copies of a mounted token (copy/paste, duplicate) must not inherit the link.
  Hooks.on("preCreateToken", doc => {
    const data = doc.flags?.[MODULE_ID];
    if ( !data || !Object.values(data).some(v => v) ) return;
    doc.updateSource({ [`flags.${MODULE_ID}`]: { mount: null, rider: null, offset: null, control: null, veer: null } });
  });

  Hooks.on("deleteToken", doc => {
    onTokenDeleted(doc).catch(err => console.error(`${MODULE_ID} | cleanup after token deletion failed`, err));
  });

  Hooks.on("canvasReady", () => {
    repairScene(canvas.scene).catch(err => console.error(`${MODULE_ID} | scene repair failed`, err));
  });
});

// dnd5e's document classes are configured by now.
Hooks.once("setup", () => {
  patchFalling();
  patchSpeeds();
});

Hooks.once("ready", () => {
  initSocket();
  const module = game.modules.get(MODULE_ID);
  console.log(`${MODULE_ID} | ${module?.version ?? ""} ready`);
  if ( module ) {
    module.api = {
      getPair,
      mountCandidates,
      mount: requestMount,
      unmount: requestUnmount,
      toggleControl: requestToggleControl,
      fallCheck
    };
  }
});
