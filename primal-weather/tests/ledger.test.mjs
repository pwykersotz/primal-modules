/**
 * Checks for the day-by-day weather ledger (scripts/ledger.mjs), run with `node tests/ledger.test.mjs`.
 */
import assert from "node:assert/strict";
import { seeded } from "./helpers.mjs";
import {
  KEEP_DAYS, MAX_GAP, advanceTo, emptyState, getDay, latestOnOrBefore, normalizeState, refreshForecast, rerollDay, setDay
} from "../scripts/ledger.mjs";
import { manualDay } from "../scripts/generator.mjs";

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

let climate = "temperate";
const contextFor = () => ({ climate, season: "spring", progress: 0.5 });
const rng = seeded(99);
const days = state => Object.keys(state.days).map(Number).sort((a, b) => a - b);

/* ---- First weather ---- */
let state = emptyState();
check(() => {
  const result = advanceTo(state, 1000, contextFor, { rng });
  assert.equal(result.changed, true);
  state = result.state;
  assert.deepEqual(days(state), [1000, 1001], "today and tomorrow's forecast");
  assert.equal(advanceTo(state, 1000, contextFor, { rng }).changed, false, "nothing to do the second time");
}, "first roll");

/* ---- The next day: tomorrow's forecast becomes today's weather ---- */
check(() => {
  const forecast = getDay(state, 1001);
  state = advanceTo(state, 1001, contextFor, { rng }).state;
  assert.equal(getDay(state, 1001), forecast, "the forecast came true");
  assert.deepEqual(days(state), [1000, 1001, 1002]);
}, "next day");

/* ---- Jumping ahead rolls every day in between ---- */
check(() => {
  state = advanceTo(state, 1010, contextFor, { rng }).state;
  for ( let d = 1000; d <= 1011; d++ ) assert.ok(getDay(state, d), `day ${d}`);
}, "jump ahead");

/* ---- Going back shows the weather those days had, and coming forward again doesn't change it ---- */
check(() => {
  const before = structuredClone(state);
  const back = advanceTo(state, 1004, contextFor, { rng });
  assert.equal(back.changed, false, "nothing new needed");
  assert.equal(getDay(back.state, 1004).id, before.days[1004].id);
  const forward = advanceTo(back.state, 1010, contextFor, { rng });
  assert.equal(getDay(forward.state, 1010).id, before.days[1010].id, "the same weather as before");
}, "back and forward");

/* ---- Rolling again drops what followed from it ---- */
check(() => {
  const old = getDay(state, 1010);
  const oldTomorrow = getDay(state, 1011);
  state = rerollDay(state, 1010, contextFor, { rng });
  assert.notEqual(getDay(state, 1010).id, old.id);
  assert.notEqual(getDay(state, 1011).id, oldTomorrow.id, "tomorrow is rolled afresh from the new weather");
  assert.equal(Math.max(...days(state)), 1011);
  // Rolling again an earlier day drops the later ones.
  const later = rerollDay(state, 1005, contextFor, { rng });
  assert.equal(Math.max(...days(later)), 1006);
  assert.ok(getDay(later, 1004), "earlier days are kept");
}, "reroll");

/* ---- Set by hand ---- */
check(() => {
  const storm = manualDay({ condition: "thunderstorm", high: 72, low: 60, wind: "strong", climate, season: "spring" });
  state = setDay(state, 1010, storm, contextFor, { rng });
  assert.equal(getDay(state, 1010), storm);
  assert.ok(getDay(state, 1011), "a forecast follows on from it");
  const quiet = setDay(state, 1010, storm, contextFor, { rng, forecast: false });
  assert.equal(getDay(quiet, 1011), null, "no forecast while automatic rolling is off");
}, "set by hand");

/* ---- A new climate rolls the forecast again, keeping days set by hand ---- */
check(() => {
  const handSet = manualDay({ condition: "fog", high: 50, low: 40, wind: "calm", climate, season: "spring" });
  let s = setDay(state, 1012, handSet, contextFor, { rng, forecast: false });
  s = { ...s, days: { ...s.days, 1011: getDay(state, 1011) } };
  climate = "desert";
  s = refreshForecast(s, 1010, contextFor, { rng });
  assert.equal(getDay(s, 1011).climate, "desert", "tomorrow is rolled for the new climate");
  assert.equal(getDay(s, 1010).climate, "temperate", "today's weather stays");
  assert.equal(getDay(s, 1012), handSet, "a day set by hand stays");
  const off = refreshForecast(s, 1010, contextFor, { rng, forecast: false });
  assert.equal(getDay(off, 1011), null, "turning automatic rolling off drops the forecast");
  climate = "temperate";
}, "refresh forecast");

/* ---- The last weather holds when today has none ---- */
check(() => {
  const s = setDay(emptyState(), 50, manualDay({ condition: "snow", high: 30, low: 20, wind: "light", climate, season: "winter" }),
    contextFor, { rng, forecast: false });
  assert.equal(latestOnOrBefore(s, 55).day, 50);
  assert.equal(latestOnOrBefore(s, 49), null);
  assert.equal(latestOnOrBefore(s, 50).weather.condition, "snow");
}, "latest on or before");

/* ---- Long gaps start afresh; old days are dropped ---- */
check(() => {
  const far = advanceTo(state, 1010 + MAX_GAP + 500, contextFor, { rng }).state;
  assert.deepEqual(days(far), [1010 + MAX_GAP + 500, 1010 + MAX_GAP + 501], "no rolling of hundreds of days, old ones dropped");
  let s = emptyState();
  for ( let d = 0; d < 200; d++ ) s = advanceTo(s, d, contextFor, { rng }).state;
  assert.ok(days(s).length <= KEEP_DAYS + 2, `kept ${days(s).length} days`);
  assert.equal(Math.min(...days(s)), 199 - KEEP_DAYS);
}, "gaps and pruning");

/* ---- Bad data from the setting is ignored ---- */
check(() => {
  const s = normalizeState({ days: { 5: { condition: "rain", high: 50, low: 40 }, x: {}, 6: null, 7: { condition: "rain" } } });
  assert.deepEqual(Object.keys(s.days), ["5"]);
  assert.deepEqual(normalizeState(null).days, {});
  assert.deepEqual(normalizeState("nonsense").days, {});
}, "normalize");

/* ---- The state passed in is never changed ---- */
check(() => {
  const frozen = structuredClone(state);
  advanceTo(state, 1020, contextFor, { rng });
  rerollDay(state, 1010, contextFor, { rng });
  refreshForecast(state, 1010, contextFor, { rng });
  assert.deepEqual(state, frozen);
}, "no mutation");

console.log(`ledger: ${checks} checks passed`);
