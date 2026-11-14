import { MODULE_ID, SETTINGS, setting } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import WeatherBar, { rollAndAnnounce } from "./weather-bar.mjs";
import * as Weather from "./weather.mjs";
import * as SceneEffects from "./scene-effects.mjs";
import { announce, postWeather } from "./chat.mjs";
import { openWeatherDialog } from "./dialog.mjs";
import { CLIMATES } from "./climates.mjs";
import { CONDITIONS, rollDay, rulesFor } from "./generator.mjs";
import * as Rules from "./rules.mjs";

/** @type {WeatherBar|null} */
let bar = null;
const refresh = () => bar?.refresh();
const logError = what => err => console.error(`${MODULE_ID} | ${what}`, err);

Hooks.once("init", () => {
  registerSettings({
    onDisplayChange: refresh,
    onWeatherChange: () => {
      refresh();
      SceneEffects.applySceneWeather();
    },
    onMapChange: () => SceneEffects.applySceneWeather(),
    onClimateChange: () => {
      Weather.refreshForecast().catch(logError("Could not roll the forecast again"));
      refresh();
    },
    onAutoRollChange: () => {
      // Turned on: catch up to today. Turned off: drop tomorrow's forecast, so the weather holds.
      Weather.refreshForecast()
        .then(() => Weather.syncToday())
        .then(changed => {
          if ( changed ) announce(Weather.getWeather()?.weather);
        })
        .catch(logError("Could not catch the weather up to today"));
      refresh();
    }
  });
});

/**
 * updateWorldTime: the clock moved. Everyone redraws (the temperature follows the time of day); the active GM's
 * client rolls the weather on when the day changes.
 */
async function onUpdateWorldTime(worldTime, delta) {
  refresh();
  if ( !game.users.activeGM?.isSelf ) return;
  const before = Weather.getWeather(Weather.dayIndex(worldTime - (Number(delta) || 0)))?.weather?.id ?? null;
  try {
    await Weather.syncToday();
  } catch(err) {
    console.error(`${MODULE_ID} | Could not move the weather on`, err);
    return;
  }
  const now = Weather.getWeather();
  if ( now && !now.stale && (now.weather.id !== before) ) announce(now.weather);
  // Extreme heat or cold: saving throws are due each hour outdoors.
  const d = game.time.calendar?.days ?? {};
  await Rules.remindHourly(worldTime, Number(delta) || 0, now?.weather ?? null, (d.secondsPerMinute ?? 60) * (d.minutesPerHour ?? 60));
}

Hooks.once("ready", async () => {
  bar = new WeatherBar();
  bar.render({ force: true });

  Hooks.on("updateWorldTime", onUpdateWorldTime);
  Hooks.on("canvasReady", SceneEffects.onCanvasReady);
  Hooks.on("updateScene", SceneEffects.onUpdateScene);
  SceneEffects.applySceneWeather();

  // The GM's client catches the weather up to today (the world may have been closed for a while, or the clock moved
  // while no GM was online).
  if ( game.users.activeGM?.isSelf ) {
    const before = Weather.getWeather()?.weather?.id ?? null;
    try {
      await Weather.syncToday();
      const now = Weather.getWeather();
      if ( now && !now.stale && (now.weather.id !== before) && before ) announce(now.weather);
    } catch(err) {
      console.error(`${MODULE_ID} | Could not roll today's weather`, err);
    }
  }

  const module = game.modules.get(MODULE_ID);
  console.log(`${MODULE_ID} | ${module?.version ?? ""} ready`);
  if ( !module ) return;
  module.api = {
    bar,
    /** Re-draw the weather bar. */
    refresh,
    /** The weather now: {day, weather, yesterday, tomorrow, stale}, or null if none has been rolled. */
    getWeather: Weather.getWeather,
    /** Roll today's weather again (GM). Announces it if that setting is on. */
    roll: rollAndAnnounce,
    /** Set today's weather (GM): {condition, high, low, wind}, temperatures in °F. */
    setWeather: values => Weather.setToday(values),
    /** Open the GM's weather window. */
    openDialog: openWeatherDialog,
    /** Post the weather to chat. {whisper: true} for the GMs only. */
    postToChat: postWeather,
    /** Roll a day's weather without saving it: {climate, season, progress, previous}. */
    rollDay,
    /** Rules reminder ids for a day's weather. */
    rulesFor,
    /** Is this scene outdoors, so the weather's rules apply there? */
    isOutdoors: Rules.isOutdoors,
    /** The rules reminder ids that apply on a scene now (none indoors, or with the rules setting off). */
    activeRules: (scene=canvas?.scene) => Rules.activeRules(scene, Weather.getWeather()?.weather ?? null),
    /**
     * What the weather does to rolls on a scene now, for Primal Status to apply: {perception: [{id, sense, reason}],
     * rangedWeaponAttack: [{id, reason}]}, each a Disadvantage with its reason.
     */
    rollModifiers: (scene=canvas?.scene) => Rules.rollModifiers(scene, Weather.getWeather()?.weather ?? null),
    /** Show (true) or stop showing (false) the weather on a scene's map (GM). */
    setSceneWeather: SceneEffects.setSceneWeather,
    /** The climates and conditions the generator knows. */
    climates: CLIMATES,
    conditions: CONDITIONS,
    /** The current climate and season settings. */
    get climate() { return setting(SETTINGS.climate); },
    get season() { return Weather.seasonOnDay(Weather.dayIndex()); }
  };
});
