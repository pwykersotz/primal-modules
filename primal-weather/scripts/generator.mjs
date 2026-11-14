/**
 * The weather generator. Plain functions with no Foundry in them, so they can be checked outside Foundry
 * (tests/generator.test.mjs).
 *
 * A day's weather is {id, climate, season, sky, condition, high, low, wind, anomaly, manual}:
 * - sky:        a step on the fair-to-foul scale (climates.mjs SKY_SCALE), or fog or dust.
 * - condition:  what it looks like (CONDITIONS below). Rain, sleet or snow depending on the temperature.
 * - high, low:  the day's high and the night's low, in °F.
 * - wind:       calm, light, moderate, strong or gale.
 * - anomaly:    how far the day ran warm or cold for the season (°F), so a warm spell can carry on the next day.
 * - manual:     set by the GM rather than rolled.
 */
import { CLIMATES, DEFAULT_CLIMATE, SEASONS, SKY_SCALE, WIND } from "./climates.mjs";

/**
 * What each condition looks like and does.
 * - sky:     the step it belongs to (for carrying the weather on to the next day).
 * - icon:    Font Awesome classes; `night` replaces it after dark.
 * - effect:  the Foundry weather effect (CONFIG.weatherEffects) shown on the map, if any.
 * - rules:   rules reminders (lang PRIMAL_WEATHER.Rules.<id>).
 */
export const CONDITIONS = {
  clear: { sky: "clear", icon: "fa-solid fa-sun", night: "fa-solid fa-moon", effect: null, rules: [] },
  partlyCloudy: { sky: "partly", icon: "fa-solid fa-cloud-sun", night: "fa-solid fa-cloud-moon", effect: null, rules: [] },
  overcast: { sky: "overcast", icon: "fa-solid fa-cloud", effect: null, rules: [] },
  fog: { sky: "fog", icon: "fa-solid fa-smog", effect: "fog", rules: ["fog"] },
  drizzle: { sky: "light", icon: "fa-solid fa-cloud-rain", effect: "rain", rules: [] },
  rain: { sky: "moderate", icon: "fa-solid fa-cloud-rain", effect: "rain", rules: [] },
  heavyRain: { sky: "heavy", icon: "fa-solid fa-cloud-showers-heavy", effect: "rainStorm",
    rules: ["heavyPrecipitation", "heavyRain"] },
  thunderstorm: { sky: "storm", icon: "fa-solid fa-cloud-bolt", effect: "rainStorm",
    rules: ["heavyPrecipitation", "heavyRain"] },
  sleet: { sky: "moderate", icon: "fa-solid fa-cloud-showers-water", effect: "rain", rules: [] },
  iceStorm: { sky: "heavy", icon: "fa-solid fa-icicles", effect: "rainStorm",
    rules: ["heavyPrecipitation", "heavyRain", "slipperyIce"] },
  lightSnow: { sky: "light", icon: "fa-regular fa-snowflake", effect: "snow", rules: [] },
  snow: { sky: "moderate", icon: "fa-solid fa-snowflake", effect: "snow", rules: [] },
  heavySnow: { sky: "heavy", icon: "fa-solid fa-snowflake", effect: "snow", rules: ["heavyPrecipitation"] },
  blizzard: { sky: "storm", icon: "fa-solid fa-snowflake", effect: "blizzard", rules: ["heavyPrecipitation"] },
  duststorm: { sky: "dust", icon: "fa-solid fa-smog", effect: null, rules: ["dust"] }
};

/** What rain, sleet or snow is called at each step of the scale. */
const PRECIPITATION = {
  light: { rain: "drizzle", sleet: "sleet", snow: "lightSnow" },
  moderate: { rain: "rain", sleet: "sleet", snow: "snow" },
  heavy: { rain: "heavyRain", sleet: "iceStorm", snow: "heavySnow" },
  storm: { rain: "thunderstorm", sleet: "iceStorm", snow: "blizzard" }
};

/** Sunshine warms the day a little, cloud and rain cool it (°F added to the high). */
const SKY_HIGH = { clear: 2, partly: 0, overcast: -2, fog: -3, light: -2, moderate: -4, heavy: -5, storm: -4, dust: 0 };

/** Clear nights get colder, cloudy ones stay milder (multiplies the climate's day-night range). */
const SKY_RANGE = { clear: 1.15, partly: 1, overcast: 0.7, fog: 0.6, light: 0.75, moderate: 0.6, heavy: 0.55,
  storm: 0.6, dust: 0.9 };

/** How much of yesterday's warm or cold spell carries into today (0 to 1). */
export const TEMPERATURE_CARRY = 0.6;

/** The chance that yesterday's sky lingers, moving only one step toward what the climate rolled. */
export const SKY_PERSISTENCE = 0.5;

/** The chance that yesterday's wind lingers in the same way. */
export const WIND_PERSISTENCE = 0.35;

/** Rule thresholds (°F), from the Dungeon Master's Guide. */
export const EXTREME_HEAT = 100;
export const EXTREME_COLD = 0;

/* -------------------------------------------- */
/*  Randomness                                  */
/* -------------------------------------------- */

/** Roughly bell-shaped, centred on 0 with a standard deviation of 1 (the sum of three uniform rolls). */
export function bell(rng=Math.random) {
  return (rng() + rng() + rng() - 1.5) * 2;
}

/**
 * Pick from relative weights.
 * @param {Record<string, number>|number[]} weights
 * @param {Function} [rng]
 * @returns {string|number}   The chosen key (or index, for an array).
 */
export function pickWeighted(weights, rng=Math.random) {
  const entries = Array.isArray(weights) ? weights.map((w, i) => [i, w]) : Object.entries(weights);
  const usable = entries.filter(([, w]) => Number.isFinite(w) && (w > 0));
  const total = usable.reduce((sum, [, w]) => sum + w, 0);
  if ( !usable.length ) return entries[0]?.[0];
  let roll = rng() * total;
  for ( const [key, w] of usable ) {
    roll -= w;
    if ( roll < 0 ) return key;
  }
  return usable.at(-1)[0];
}

/** A short random id for a day's weather, so a change can be told apart from the same weather shown again. */
function makeId(rng=Math.random) {
  let id = "";
  for ( let i = 0; i < 10; i++ ) id += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(rng() * 36)];
  return id;
}

/* -------------------------------------------- */
/*  Climates and seasons                        */
/* -------------------------------------------- */

/** A climate's data, falling back to temperate for an unknown id. */
export function getClimate(id) {
  return CLIMATES[id] ?? CLIMATES[DEFAULT_CLIMATE];
}

/** The climate id actually used for an id (unknown ids become temperate). */
export function climateId(id) {
  return (id in CLIMATES) ? id : DEFAULT_CLIMATE;
}

function lerp(a, b, t) {
  return a + ((b - a) * t);
}

/** Blend two season profiles. t = 0 is all `a`, t = 1 all `b`. */
function blendProfiles(a, b, t) {
  const sky = {};
  for ( const key of new Set([...Object.keys(a.sky), ...Object.keys(b.sky)]) ) {
    sky[key] = lerp(a.sky[key] ?? 0, b.sky[key] ?? 0, t);
  }
  return {
    high: lerp(a.high, b.high, t),
    spread: lerp(a.spread, b.spread, t),
    range: lerp(a.range, b.range, t),
    sky,
    wind: a.wind.map((w, i) => lerp(w, b.wind[i] ?? 0, t))
  };
}

/**
 * How a climate behaves on a given day of a season. The climate's numbers describe the middle of each season; on
 * either side of the middle they're blended with the neighbouring season.
 * @param {string} climate
 * @param {string} season      spring, summer, autumn or winter.
 * @param {number} [progress]  How far through the season (0 = first day, 1 = last day).
 */
export function seasonProfile(climate, season, progress=0.5) {
  const seasons = getClimate(climate).seasons;
  const index = Math.max(0, SEASONS.indexOf(season));
  const here = seasons[SEASONS[index]];
  const t = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : 0.5;
  if ( t < 0.5 ) {
    const before = seasons[SEASONS[(index + SEASONS.length - 1) % SEASONS.length]];
    return blendProfiles(before, here, 0.5 + t);
  }
  const after = seasons[SEASONS[(index + 1) % SEASONS.length]];
  return blendProfiles(here, after, t - 0.5);
}

/* -------------------------------------------- */
/*  Conditions                                  */
/* -------------------------------------------- */

/**
 * Whether rain, sleet or snow falls, from the day's high and the night's low (°F).
 * @returns {"rain"|"sleet"|"snow"}
 */
export function precipitationType(high, low) {
  const mean = (high + low) / 2;
  if ( (high <= 33) || (mean <= 30) ) return "snow";
  if ( mean <= 36 ) return "sleet";
  return "rain";
}

/** The condition for a sky on a day with this high and low. */
export function conditionFor(sky, high, low) {
  if ( sky === "partly" ) return "partlyCloudy";
  if ( sky === "dust" ) return "duststorm";
  if ( sky in PRECIPITATION ) return PRECIPITATION[sky][precipitationType(high, low)];
  return (sky in CONDITIONS) ? sky : "clear";
}

/** The sky step a condition belongs to. */
export function skyFor(condition) {
  return CONDITIONS[condition]?.sky ?? "clear";
}

/**
 * Yesterday's sky lingers sometimes, moving one step toward what the climate rolled today, so weather fronts come
 * and go over a few days. Fog and dust storms either linger or don't.
 * @param {string} rolled          Today's sky, as rolled from the climate.
 * @param {string|null} previous   Yesterday's sky.
 * @param {object} profile         Today's season profile (a sky the climate never has doesn't linger).
 * @param {Function} rng
 */
function lingerSky(rolled, previous, profile, rng) {
  if ( !previous || (previous === rolled) || !(profile.sky[previous] > 0) ) return rolled;
  if ( rng() >= SKY_PERSISTENCE ) return rolled;
  const from = SKY_SCALE.indexOf(previous);
  const to = SKY_SCALE.indexOf(rolled);
  if ( (from < 0) || (to < 0) ) return (rng() < 0.5) ? previous : rolled;
  const step = SKY_SCALE[from + Math.sign(to - from)];
  return (profile.sky[step] > 0) ? step : rolled;
}

/* -------------------------------------------- */
/*  Rolling a day                               */
/* -------------------------------------------- */

/**
 * Roll a day's weather.
 * @param {object} options
 * @param {string} options.climate
 * @param {string} options.season
 * @param {number} [options.progress]     How far through the season (0 to 1).
 * @param {object|null} [options.previous]  Yesterday's weather, if any, so spells and fronts carry on.
 * @param {Function} [options.rng]        Random numbers from 0 to 1.
 */
export function rollDay({ climate, season, progress=0.5, previous=null, rng=Math.random }) {
  climate = climateId(climate);
  const profile = seasonProfile(climate, season, progress);

  // Sky: the climate's odds, with yesterday's weather lingering sometimes.
  const sky = lingerSky(pickWeighted(profile.sky, rng), previous?.sky ?? null, profile, rng);

  // Temperature: warm and cold spells carry on for a few days.
  const carried = Number.isFinite(previous?.anomaly) ? previous.anomaly * TEMPERATURE_CARRY : 0;
  const swing = bell(rng) * profile.spread * Math.sqrt(1 - (TEMPERATURE_CARRY ** 2));
  const limit = profile.spread * 3;
  const anomaly = Math.min(Math.max(carried + swing, -limit), limit);
  const high = Math.round(profile.high + anomaly + (SKY_HIGH[sky] ?? 0));
  const drop = profile.range * (SKY_RANGE[sky] ?? 1) * (0.85 + (rng() * 0.3));
  const low = Math.round(high - Math.max(3, drop));

  // Wind: the climate's odds, lingering sometimes. Fog needs still air; storms and dust storms come with wind.
  let wind = pickWeighted(profile.wind, rng);
  const before = WIND.indexOf(previous?.wind);
  if ( (before >= 0) && (before !== wind) && (rng() < WIND_PERSISTENCE) ) wind += Math.sign(before - wind);
  if ( sky === "fog" ) wind = Math.min(wind, 1);
  if ( (sky === "storm") || (sky === "dust") ) wind = Math.max(wind, 3);

  return {
    id: makeId(rng),
    climate,
    season,
    sky,
    condition: conditionFor(sky, high, low),
    high,
    low,
    wind: WIND[wind],
    anomaly: Math.round(anomaly * 10) / 10,
    manual: false
  };
}

/**
 * A day's weather set by the GM.
 * @param {object} values
 * @param {string} values.condition
 * @param {number} values.high       °F
 * @param {number} values.low        °F
 * @param {string} values.wind
 * @param {string} values.climate
 * @param {string} values.season
 * @param {number} [values.progress]
 */
export function manualDay({ condition, high, low, wind, climate, season, progress=0.5 }) {
  if ( !(condition in CONDITIONS) ) condition = "clear";
  if ( !WIND.includes(wind) ) wind = "calm";
  high = Math.round(Number(high));
  low = Math.round(Number(low));
  if ( !Number.isFinite(high) ) high = 60;
  if ( !Number.isFinite(low) ) low = high - 15;
  if ( low > high ) [high, low] = [low, high];
  climate = climateId(climate);
  const sky = skyFor(condition);
  const profile = seasonProfile(climate, season, progress);
  return {
    id: makeId(),
    climate,
    season,
    sky,
    condition,
    high,
    low,
    wind,
    anomaly: Math.round((high - profile.high - (SKY_HIGH[sky] ?? 0)) * 10) / 10,
    manual: true
  };
}

/* -------------------------------------------- */
/*  Rules and temperature                       */
/* -------------------------------------------- */

/**
 * The rules reminders that apply to a day's weather (ids under PRIMAL_WEATHER.Rules).
 * @param {object} weather
 * @returns {string[]}
 */
export function rulesFor(weather) {
  if ( !weather ) return [];
  const rules = [...(CONDITIONS[weather.condition]?.rules ?? [])];
  if ( ["strong", "gale"].includes(weather.wind) ) rules.push("strongWind");
  if ( weather.high >= EXTREME_HEAT ) rules.push("extremeHeat");
  if ( weather.low <= EXTREME_COLD ) rules.push("extremeCold");
  return rules;
}

/**
 * The temperature at an hour of the day (°F): coldest around sunrise, warmest in mid-afternoon, easing between.
 * After the afternoon peak it falls toward tomorrow's low, and before sunrise it falls from yesterday's high, so
 * there's no jump at midnight when the neighbouring days are known.
 * @param {object} options
 * @param {number} options.hour           Hours since midnight (with fractions).
 * @param {number} [options.hoursPerDay]
 * @param {number} [options.sunrise]      Hour of sunrise.
 * @param {{high: number, low: number}} options.today
 * @param {{high: number, low: number}} [options.yesterday]
 * @param {{high: number, low: number}} [options.tomorrow]
 */
export function temperatureAt({ hour, hoursPerDay=24, sunrise, today, yesterday=null, tomorrow=null }) {
  const day = hoursPerDay;
  const coldest = Number.isFinite(sunrise) ? sunrise : day * 0.25;
  const warmest = coldest + (day * 0.375);
  const ease = t => (1 - Math.cos(Math.PI * Math.min(Math.max(t, 0), 1))) / 2;
  if ( (hour >= coldest) && (hour <= warmest) ) {
    return today.low + ((today.high - today.low) * ease((hour - coldest) / (warmest - coldest)));
  }
  const night = day - (warmest - coldest);
  if ( hour > warmest ) {
    const to = tomorrow?.low ?? today.low;
    return today.high + ((to - today.high) * ease((hour - warmest) / night));
  }
  const from = yesterday?.high ?? today.high;
  return from + ((today.low - from) * ease((hour + day - warmest) / night));
}

/** °F to °C. */
export function toCelsius(fahrenheit) {
  return (fahrenheit - 32) * 5 / 9;
}

/** °C to °F. */
export function toFahrenheit(celsius) {
  return (celsius * 9 / 5) + 32;
}

/**
 * A temperature for display.
 * @param {number} fahrenheit
 * @param {"f"|"c"|"both"} units
 */
export function formatTemperature(fahrenheit, units="f") {
  const f = `${Math.round(fahrenheit)}°F`;
  const c = `${Math.round(toCelsius(fahrenheit))}°C`;
  if ( units === "c" ) return c;
  if ( units === "both" ) return `${f} (${c})`;
  return f;
}
