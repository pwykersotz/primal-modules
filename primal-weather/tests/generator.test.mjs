/**
 * Checks for the weather generator (scripts/generator.mjs), run with `node tests/generator.test.mjs`.
 * Thousands of simulated days per climate and season, with seeded random numbers so every run is the same.
 */
import assert from "node:assert/strict";
import { seeded } from "./helpers.mjs";
import { CLIMATES, SEASONS, SKY, WIND } from "../scripts/climates.mjs";
import {
  CONDITIONS, EXTREME_COLD, EXTREME_HEAT, conditionFor, formatTemperature, manualDay, pickWeighted,
  precipitationType, rollDay, rulesFor, seasonProfile, skyFor, temperatureAt, toCelsius, toFahrenheit
} from "../scripts/generator.mjs";

let checks = 0;
const check = (fn, label) => {
  try {
    fn();
    checks++;
  } catch(err) {
    err.message = `${label}: ${err.message}`;
    throw err;
  }
};

/** Roll `n` days in a row. */
function simulate(climate, season, n, seed=7, progress=0.5) {
  const rng = seeded(seed);
  const days = [];
  let previous = null;
  for ( let i = 0; i < n; i++ ) {
    previous = rollDay({ climate, season, progress, previous, rng });
    days.push(previous);
  }
  return days;
}
const share = (days, test) => days.filter(test).length / days.length;
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;

/* ---- Every climate's data is complete ---- */
for ( const [id, climate] of Object.entries(CLIMATES) ) {
  check(() => {
    for ( const season of SEASONS ) {
      const s = climate.seasons[season];
      assert.ok(s, `no ${season}`);
      for ( const key of ["high", "spread", "range"] ) assert.ok(Number.isFinite(s[key]), `${season}.${key}`);
      for ( const sky of SKY ) assert.ok(Number.isFinite(s.sky[sky]) && (s.sky[sky] >= 0), `${season}.sky.${sky}`);
      assert.equal(s.wind.length, WIND.length, `${season}.wind`);
    }
    assert.match(climate.icon, /^fa-/);
  }, `climate ${id}`);
}

/* ---- Picking from weights ---- */
check(() => {
  const rng = seeded(3);
  const counts = { a: 0, b: 0, c: 0 };
  for ( let i = 0; i < 20000; i++ ) counts[pickWeighted({ a: 1, b: 3, c: 0 }, rng)]++;
  assert.equal(counts.c, 0, "a zero weight is never picked");
  assert.ok(Math.abs((counts.b / counts.a) - 3) < 0.25, `b about three times a (${counts.b}/${counts.a})`);
  assert.equal(pickWeighted([0, 0, 5], rng), 2);
}, "pickWeighted");

/* ---- Every rolled day is well formed ---- */
for ( const climate of Object.keys(CLIMATES) ) {
  for ( const season of SEASONS ) {
    const days = simulate(climate, season, 1500, 11);
    check(() => {
      for ( const d of days ) {
        assert.ok(d.condition in CONDITIONS, `condition ${d.condition}`);
        assert.ok(WIND.includes(d.wind), `wind ${d.wind}`);
        assert.ok(SKY.includes(d.sky), `sky ${d.sky}`);
        assert.ok(Number.isInteger(d.high) && Number.isInteger(d.low), "whole degrees");
        assert.ok(d.low <= d.high - 3, `low ${d.low} below high ${d.high}`);
        assert.equal(d.climate, climate);
        assert.equal(d.season, season);
        assert.equal(d.manual, false);
        assert.equal(typeof d.id, "string");
        // Fog needs still air; storms and dust storms come with strong wind.
        if ( d.sky === "fog" ) assert.ok(["calm", "light"].includes(d.wind), `fog with ${d.wind} wind`);
        if ( ["storm", "dust"].includes(d.sky) ) assert.ok(["strong", "gale"].includes(d.wind), `${d.sky} with ${d.wind} wind`);
        // The condition matches the sky and the temperature.
        assert.equal(d.condition, conditionFor(d.sky, d.high, d.low));
        // A climate never gets a sky it has no weight for (no fog in the desert, no dust storms in the arctic).
        assert.ok(seasonProfile(climate, season).sky[d.sky] > 0, `${climate} ${season} rolled ${d.sky}`);
      }
      // Averages land near the climate's numbers.
      const profile = CLIMATES[climate].seasons[season];
      const highs = mean(days.map(d => d.high));
      assert.ok(Math.abs(highs - profile.high) < 4, `${climate} ${season}: average high ${highs.toFixed(1)}, expected about ${profile.high}`);
    }, `${climate} ${season}`);
  }
}

/* ---- Climates feel like themselves ---- */
check(() => {
  const days = simulate("desert", "summer", 3000, 5);
  assert.ok(share(days, d => ["clear", "partly"].includes(d.sky)) > 0.6, "desert summers are mostly clear");
  assert.ok(share(days, d => d.high >= EXTREME_HEAT) > 0.4, "desert summers are often extremely hot");
  assert.ok(share(days, d => d.condition === "duststorm") > 0.03, "dust storms happen");
  assert.ok(mean(days.map(d => d.high - d.low)) > 22, "desert nights are much colder than the days");
}, "desert summer");
check(() => {
  const days = simulate("arctic", "winter", 3000, 5);
  assert.equal(share(days, d => ["drizzle", "rain", "heavyRain", "thunderstorm"].includes(d.condition)), 0, "no rain in an arctic winter");
  assert.ok(share(days, d => d.low <= EXTREME_COLD) > 0.4, "arctic winters are often extremely cold");
  assert.ok(share(days, d => ["lightSnow", "snow", "heavySnow", "blizzard"].includes(d.condition)) > 0.2, "plenty of snow");
}, "arctic winter");
check(() => {
  const wet = share(simulate("tropical", "summer", 3000, 8), d => ["light", "moderate", "heavy", "storm"].includes(d.sky));
  const dry = share(simulate("tropical", "winter", 3000, 8), d => ["light", "moderate", "heavy", "storm"].includes(d.sky));
  assert.ok(wet > dry * 2, `tropical summer is the wet season (${wet.toFixed(2)} vs ${dry.toFixed(2)})`);
  const summer = simulate("tropical", "summer", 3000, 8);
  assert.equal(share(summer, d => ["sleet", "lightSnow", "snow", "heavySnow", "blizzard", "iceStorm"].includes(d.condition)), 0, "never snows in the tropics");
}, "tropical seasons");
check(() => {
  const summer = mean(simulate("temperate", "summer", 2000, 9).map(d => d.high));
  const winter = mean(simulate("temperate", "winter", 2000, 9).map(d => d.high));
  assert.ok(summer - winter > 30, "temperate summers are much warmer than winters");
  const winterDays = simulate("temperate", "winter", 3000, 9);
  const snowy = share(winterDays, d => ["lightSnow", "snow", "heavySnow", "blizzard"].includes(d.condition));
  const rainy = share(winterDays, d => ["drizzle", "rain", "heavyRain", "thunderstorm"].includes(d.condition));
  assert.ok((snowy > 0.05) && (rainy > 0.05), `temperate winters have both snow (${snowy.toFixed(2)}) and rain (${rainy.toFixed(2)})`);
  const coastFog = share(simulate("coastal", "summer", 3000, 9), d => d.condition === "fog");
  const inlandFog = share(simulate("temperate", "summer", 3000, 9), d => d.condition === "fog");
  assert.ok(coastFog > inlandFog * 2, "the coast is foggier");
}, "temperate and coastal");

/* ---- Weather carries on from day to day ---- */
check(() => {
  const days = simulate("temperate", "spring", 6000, 13);
  const wet = d => ["light", "moderate", "heavy", "storm"].includes(d.sky);
  let wetDays = 0;
  let wetAfterWet = 0;
  const tempSteps = [];
  for ( let i = 1; i < days.length; i++ ) {
    if ( wet(days[i - 1]) ) {
      wetDays++;
      if ( wet(days[i]) ) wetAfterWet++;
    }
    tempSteps.push(Math.abs(days[i].high - days[i - 1].high));
  }
  // Wet days come in runs: rain is likelier after a wet day than on any day.
  const base = share(days, wet);
  const after = wetAfterWet / wetDays;
  assert.ok(after > base + 0.12, `a wet day is likelier after a wet day (${after.toFixed(2)} vs ${base.toFixed(2)})`);
  // Highs drift: day-to-day changes are smaller than the season's spread would give at random.
  const step = mean(tempSteps);
  assert.ok(step < 11, `highs change gradually (average step ${step.toFixed(1)}°F)`);
  // Warm and cold spells: the anomaly is positively correlated day to day.
  const a = days.map(d => d.anomaly);
  const ma = mean(a);
  let num = 0, den = 0;
  for ( let i = 1; i < a.length; i++ ) num += (a[i] - ma) * (a[i - 1] - ma);
  for ( const x of a ) den += (x - ma) ** 2;
  assert.ok(num / den > 0.4, `spells last a few days (correlation ${(num / den).toFixed(2)})`);
}, "persistence");
check(() => {
  // A heavy downpour today and a clear forecast: when it lingers, it eases one step at a time.
  const rng = seeded(21);
  const previous = { sky: "storm", anomaly: 0, wind: "strong" };
  const seen = new Set();
  for ( let i = 0; i < 3000; i++ ) seen.add(rollDay({ climate: "temperate", season: "summer", previous, rng }).sky);
  assert.ok(seen.has("heavy"), "a storm can ease to heavy rain the next day");
}, "fronts pass gradually");

/* ---- Seasons blend into each other ---- */
check(() => {
  const end = seasonProfile("temperate", "winter", 1).high;
  const start = seasonProfile("temperate", "spring", 0).high;
  assert.ok(Math.abs(end - start) < 0.01, `no jump from winter to spring (${end} vs ${start})`);
  assert.equal(seasonProfile("temperate", "summer", 0.5).high, CLIMATES.temperate.seasons.summer.high);
  const early = seasonProfile("temperate", "spring", 0.1).high;
  const late = seasonProfile("temperate", "spring", 0.9).high;
  assert.ok(late > early + 10, "spring warms up as it goes");
  assert.equal(seasonProfile("nowhere", "summer").high, CLIMATES.temperate.seasons.summer.high, "unknown climates are temperate");
}, "season blending");

/* ---- Rain, sleet or snow ---- */
check(() => {
  assert.equal(precipitationType(25, 10), "snow");
  assert.equal(precipitationType(33, 20), "snow");
  assert.equal(precipitationType(40, 28), "sleet");
  assert.equal(precipitationType(55, 40), "rain");
  assert.equal(conditionFor("light", 55, 40), "drizzle");
  assert.equal(conditionFor("storm", 70, 55), "thunderstorm");
  assert.equal(conditionFor("storm", 20, 5), "blizzard");
  assert.equal(conditionFor("heavy", 40, 28), "iceStorm");
  assert.equal(conditionFor("moderate", 20, 5), "snow");
  assert.equal(conditionFor("partly", 20, 5), "partlyCloudy");
  assert.equal(conditionFor("dust", 90, 60), "duststorm");
  assert.equal(conditionFor("fog", 50, 40), "fog");
  for ( const id of Object.keys(CONDITIONS) ) assert.ok(SKY.includes(skyFor(id)), `${id} has a sky`);
}, "precipitation");

/* ---- Rules reminders ---- */
check(() => {
  assert.deepEqual(rulesFor({ condition: "clear", wind: "light", high: 70, low: 50 }), []);
  assert.deepEqual(rulesFor({ condition: "heavyRain", wind: "moderate", high: 60, low: 50 }), ["heavyPrecipitation", "heavyRain"]);
  assert.deepEqual(rulesFor({ condition: "blizzard", wind: "gale", high: 5, low: -10 }), ["heavyPrecipitation", "strongWind", "extremeCold"]);
  assert.deepEqual(rulesFor({ condition: "clear", wind: "calm", high: 104, low: 74 }), ["extremeHeat"]);
  assert.deepEqual(rulesFor({ condition: "fog", wind: "calm", high: 50, low: 40 }), ["fog"]);
  assert.deepEqual(rulesFor({ condition: "iceStorm", wind: "light", high: 34, low: 28 }), ["heavyPrecipitation", "heavyRain", "slipperyIce"]);
  assert.deepEqual(rulesFor(null), []);
}, "rules");

/* ---- Weather set by hand ---- */
check(() => {
  const d = manualDay({ condition: "thunderstorm", high: 70, low: 80, wind: "strong", climate: "temperate", season: "summer" });
  assert.equal(d.manual, true);
  assert.equal(d.sky, "storm");
  assert.deepEqual([d.high, d.low], [80, 70], "high and low swapped if entered the wrong way round");
  const fixed = manualDay({ condition: "nonsense", high: "x", low: null, wind: "hurricane", climate: "nowhere", season: "summer" });
  assert.equal(fixed.condition, "clear");
  assert.equal(fixed.wind, "calm");
  assert.equal(fixed.climate, "temperate");
  assert.ok(Number.isFinite(fixed.high) && Number.isFinite(fixed.low));
  // The next day follows on from it.
  const rng = seeded(4);
  let warm = 0;
  const hot = manualDay({ condition: "clear", high: 100, low: 80, wind: "calm", climate: "temperate", season: "summer" });
  for ( let i = 0; i < 500; i++ ) warm += rollDay({ climate: "temperate", season: "summer", previous: hot, rng }).high;
  assert.ok(warm / 500 > 85, "a heat wave set by the GM carries into the next day");
}, "manual weather");

/* ---- Temperature through the day ---- */
check(() => {
  const today = { high: 70, low: 50 };
  const at = hour => temperatureAt({ hour, sunrise: 6, today });
  assert.equal(Math.round(at(6)), 50, "coldest at sunrise");
  assert.equal(Math.round(at(15)), 70, "warmest mid-afternoon");
  assert.ok(at(10) > 50 && at(10) < 70);
  assert.ok(at(21) < 70 && at(21) > 50, "cooling in the evening");
  // No jump at midnight when the neighbouring days are known.
  const yesterday = { high: 64, low: 44 };
  const tomorrow = { high: 75, low: 58 };
  const lateToday = temperatureAt({ hour: 23.999, sunrise: 6, today, yesterday, tomorrow });
  const earlyTomorrow = temperatureAt({ hour: 0, sunrise: 6, today: tomorrow, yesterday: today });
  assert.ok(Math.abs(lateToday - earlyTomorrow) < 0.1, `midnight ${lateToday.toFixed(2)} vs ${earlyTomorrow.toFixed(2)}`);
  const lateYesterday = temperatureAt({ hour: 23.999, sunrise: 6, today: yesterday, tomorrow: today });
  const earlyToday = temperatureAt({ hour: 0, sunrise: 6, today, yesterday });
  assert.ok(Math.abs(lateYesterday - earlyToday) < 0.1, "the other midnight too");
  // Other day lengths.
  const long = hour => temperatureAt({ hour, hoursPerDay: 30, sunrise: 7.5, today });
  assert.equal(Math.round(long(7.5)), 50);
  assert.equal(Math.round(long(18.75)), 70);
}, "temperature curve");

/* ---- Units ---- */
check(() => {
  assert.equal(formatTemperature(50, "f"), "50°F");
  assert.equal(formatTemperature(50, "c"), "10°C");
  assert.equal(formatTemperature(32, "both"), "32°F (0°C)");
  assert.ok(Math.abs(toFahrenheit(toCelsius(77)) - 77) < 1e-9);
}, "units");

console.log(`generator: ${checks} checks passed`);
