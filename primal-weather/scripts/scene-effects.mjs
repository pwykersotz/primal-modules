/**
 * The weather on the map: Foundry's own weather effects (rain, rain storm, fog, snow, blizzard) drawn on scenes that
 * should show it.
 *
 * Each client draws it for itself (canvas.weather.initializeEffects), so the scene document is never changed and the
 * canvas isn't redrawn. A scene with its own weather (Scene Config > Ambience > Weather) keeps it, and Foundry's
 * Suppress Weather region behaviour still works.
 *
 * Which scenes: the "Weather on the map" setting (off, scenes marked as outdoors, or every scene), and a per-scene
 * flag the GM sets from the weather bar's menu: true to show it on that scene, false never to.
 */
import { FLAGS, MODULE_ID, SETTINGS, setting } from "./constants.mjs";
import { CONDITIONS } from "./generator.mjs";
import { getWeather } from "./weather.mjs";

/** The weather effect this module drew on the current canvas (null for none). */
let applied = null;

/**
 * The scene's flag: true (show the weather), false (never), or undefined (follow the setting).
 * @param {Scene} scene
 */
export function sceneFlag(scene) {
  return scene?.getFlag(MODULE_ID, FLAGS.sceneWeather);
}

/**
 * Should this scene show the world's weather?
 * @param {Scene} scene
 */
export function showsWeather(scene) {
  if ( !scene || scene.weather ) return false;
  const flag = sceneFlag(scene);
  switch ( setting(SETTINGS.sceneEffects) ) {
    case "all": return flag !== false;
    case "marked": return flag === true;
    default: return false;
  }
}

/**
 * The weather effect id (CONFIG.weatherEffects) for a condition, if Foundry has it.
 * @param {string} condition
 */
export function effectFor(condition) {
  const id = CONDITIONS[condition]?.effect ?? null;
  return (id && CONFIG.weatherEffects?.[id]) ? id : null;
}

/** Draw (or clear) the weather on the current scene. */
export function applySceneWeather() {
  if ( !canvas?.ready || !canvas.scene || !canvas.weather ) return;
  // A scene with its own weather keeps it: Foundry has drawn it already.
  if ( canvas.scene.weather ) {
    applied = null;
    return;
  }
  let id = null;
  if ( showsWeather(canvas.scene) ) id = effectFor(getWeather()?.weather?.condition);
  if ( id === applied ) return;
  applied = id;
  try {
    canvas.weather.initializeEffects(id ? CONFIG.weatherEffects[id] : null);
  } catch(err) {
    console.error(`${MODULE_ID} | Could not draw the weather on the map`, err);
  }
}

/** canvasReady: the canvas was drawn again, with the scene's own weather (or none). */
export function onCanvasReady() {
  applied = null;
  applySceneWeather();
}

/** updateScene: the GM marked this scene (or stopped marking it). */
export function onUpdateScene(scene, changes) {
  if ( scene !== canvas?.scene ) return;
  if ( foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) ) applySceneWeather();
}

/**
 * What the GM's menu offers for the current scene: "show", "hide", or null (nothing to offer).
 * @param {Scene} [scene]
 */
export function sceneMenuState(scene=canvas?.scene) {
  if ( !scene || scene.weather ) return null;
  const mode = setting(SETTINGS.sceneEffects);
  if ( mode === "off" ) return null;
  return showsWeather(scene) ? "hide" : "show";
}

/**
 * Show or stop showing the weather on a scene (GM).
 * @param {Scene} scene
 * @param {boolean} show
 */
export async function setSceneWeather(scene, show) {
  if ( !scene || !game.user.isGM ) return;
  const mode = setting(SETTINGS.sceneEffects);
  // Keep the flag only where it differs from the setting, so changing the setting later still means something.
  const defaultShown = mode === "all";
  if ( show === defaultShown ) await scene.unsetFlag(MODULE_ID, FLAGS.sceneWeather);
  else await scene.setFlag(MODULE_ID, FLAGS.sceneWeather, show);
}
