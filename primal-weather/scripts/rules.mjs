/**
 * Weather rules that apply: on scenes that are outdoors, today's heavy rain, fog, blowing sand and strong wind change
 * rolls, and extreme heat or cold reminds the GM each hour that saving throws are due.
 *
 * This module only says what applies (rollModifiers, in the API). Primal Status puts it on the rolls, through its own
 * roll rules: Disadvantage on Wisdom (Perception) checks and on ranged weapon attacks, with the reason in the roll
 * window and in chat, so a player can still switch to a normal roll when the check doesn't rely on that sense. Without
 * Primal Status the weather bar's reminders are all there is, as before.
 *
 * Outdoors: a scene marked as outdoors from the weather bar's menu, or, when the weather is shown on every scene, any
 * scene not turned off. The "Weather rules apply to rolls" setting turns all of it off.
 */
import { FLAGS, MODULE_ID, SETTINGS, loc, setting } from "./constants.mjs";
import { rulesFor } from "./generator.mjs";

/** How each rules reminder changes rolls. perception: the sense the Disadvantage is for. */
export const ROLL_EFFECTS = {
  fog: { perception: "sight" },
  heavyPrecipitation: { perception: "sight" },
  dust: { perception: "sight" },
  heavyRain: { perception: "hearing" },
  strongWind: { perception: "hearing", rangedWeaponAttack: true }
};

/** Rules reminders that call for a saving throw each hour. */
export const HOURLY_SAVES = ["extremeHeat", "extremeCold"];

/**
 * Is this scene outdoors, so the weather's rules apply there?
 * @param {Scene} scene
 */
export function isOutdoors(scene) {
  if ( !scene ) return false;
  const flag = scene.getFlag?.(MODULE_ID, FLAGS.sceneWeather);
  if ( flag === true ) return true;
  if ( flag === false ) return false;
  return setting(SETTINGS.sceneEffects) === "all";
}

/**
 * The rules reminders that apply on a scene now.
 * @param {Scene} scene
 * @param {object|null} weather   The weather now.
 * @returns {string[]}
 */
export function activeRules(scene, weather) {
  if ( !setting(SETTINGS.rollRules) || !weather || !isOutdoors(scene) ) return [];
  return rulesFor(weather);
}

/**
 * What today's weather does to rolls on a scene.
 * @param {Scene} scene
 * @param {object|null} weather
 * @returns {{perception: {id: string, sense: string, reason: string}[], rangedWeaponAttack: {id: string, reason: string}[]}}
 */
export function rollModifiers(scene, weather) {
  const out = { perception: [], rangedWeaponAttack: [] };
  for ( const id of activeRules(scene, weather) ) {
    const effect = ROLL_EFFECTS[id];
    if ( !effect ) continue;
    const name = loc(`Rules.${id}.Name`);
    if ( effect.perception ) {
      out.perception.push({ id, sense: effect.perception, reason: loc(`RollRules.${effect.perception}`, { rule: name }) });
    }
    if ( effect.rangedWeaponAttack ) out.rangedWeaponAttack.push({ id, reason: name });
  }
  return out;
}

/**
 * How many hours of the world calendar a clock change passed into.
 * @param {number} worldTime
 * @param {number} delta
 * @param {number} secondsPerHour
 */
export function hoursPassed(worldTime, delta, secondsPerHour) {
  if ( !(delta > 0) || !(secondsPerHour > 0) ) return 0;
  return Math.floor(worldTime / secondsPerHour) - Math.floor((worldTime - delta) / secondsPerHour);
}

/**
 * The GM's reminder when hours pass in extreme heat or cold on an outdoor scene: whispered chat content, or null.
 * @param {Scene} scene
 * @param {object|null} weather
 * @param {number} hours
 */
export function hourlyReminder(scene, weather, hours) {
  if ( !(hours > 0) ) return null;
  const due = activeRules(scene, weather).filter(id => HOURLY_SAVES.includes(id));
  if ( !due.length ) return null;
  const escape = foundry.utils?.escapeHTML ?? (s => s);
  const lines = due.map(id => `<p><strong>${escape(loc(`Rules.${id}.Name`))}.</strong> ${escape(loc(`Rules.${id}.Text`))}</p>`);
  return `<div class="primal-weather-reminder"><p>${escape(loc(hours === 1 ? "RollRules.HourPassed" : "RollRules.HoursPassed", { hours, scene: scene.name }))}</p>${lines.join("")}</div>`;
}

/**
 * updateWorldTime, on the active GM's client: remind the GM of the hourly saves in extreme heat or cold.
 * @param {number} worldTime
 * @param {number} delta
 * @param {object|null} weather
 * @param {number} secondsPerHour
 */
export async function remindHourly(worldTime, delta, weather, secondsPerHour) {
  const scene = game.scenes?.active ?? canvas?.scene ?? null;
  const content = hourlyReminder(scene, weather, hoursPassed(worldTime, delta, secondsPerHour));
  if ( !content ) return null;
  try {
    return await ChatMessage.implementation.create({
      content, speaker: { alias: loc("Chat.Speaker") }, whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });
  } catch(err) {
    console.error(`${MODULE_ID} | Could not post the hourly weather reminder`, err);
    return null;
  }
}
