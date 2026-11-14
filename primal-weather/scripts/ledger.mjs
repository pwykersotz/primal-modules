/**
 * The weather ledger: one entry per calendar day, kept in a world setting.
 *
 * Days are counted from the start of the calendar (world time divided by the length of a day), so they never
 * depend on month lengths. The ledger keeps the days around now, plus tomorrow's weather rolled ahead of time (the
 * GM's forecast), so:
 * - moving the clock forward a day makes tomorrow's weather today's;
 * - jumping ahead several days rolls every day in between, so the weather moves on naturally;
 * - moving the clock back shows the weather those days really had.
 *
 * Plain functions on plain data, so they can be checked outside Foundry (tests/ledger.test.mjs). Each returns a new
 * state and leaves the one passed in alone.
 *
 * State: {version: 1, days: {[day]: weather}}
 */
import { rollDay } from "./generator.mjs";

export const VERSION = 1;

/** Days kept on either side of today. Older (or later) entries are dropped. */
export const KEEP_DAYS = 40;

/** Beyond this many days without weather, start afresh instead of rolling every day in between. */
export const MAX_GAP = 60;

/** An empty ledger. */
export function emptyState() {
  return { version: VERSION, days: {} };
}

/**
 * A ledger read from the setting, with anything malformed dropped.
 * @param {object} raw
 */
export function normalizeState(raw) {
  const state = emptyState();
  const days = raw?.days;
  if ( !days || (typeof days !== "object") ) return state;
  for ( const [key, value] of Object.entries(days) ) {
    const day = Number(key);
    if ( !Number.isInteger(day) || !value || (typeof value !== "object") ) continue;
    if ( !value.condition || !Number.isFinite(value.high) || !Number.isFinite(value.low) ) continue;
    state.days[day] = value;
  }
  return state;
}

/** The weather recorded for a day, or null. */
export function getDay(state, day) {
  return state?.days?.[day] ?? null;
}

/** The days in the ledger, in order. */
function dayNumbers(state) {
  return Object.keys(state?.days ?? {}).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
}

/**
 * The weather on a day, or failing that the latest day before it that has weather (when time has moved on but
 * nobody has rolled yet, the last weather stays).
 * @returns {{day: number, weather: object}|null}
 */
export function latestOnOrBefore(state, day) {
  let found = null;
  for ( const d of dayNumbers(state) ) {
    if ( d > day ) break;
    found = d;
  }
  return (found === null) ? null : { day: found, weather: state.days[found] };
}

/** Drop days far from today. */
function prune(days, today) {
  for ( const key of Object.keys(days) ) {
    const day = Number(key);
    if ( Math.abs(day - today) > KEEP_DAYS ) delete days[key];
  }
}

/**
 * Make sure a day has weather, rolling it (and any days missing just before it) from the last weather known.
 * @param {object} days        Mutated.
 * @param {number} target
 * @param {Function} contextFor  (day) => {climate, season, progress}
 * @param {Function} rng
 */
function fillTo(days, target, contextFor, rng) {
  if ( days[target] ) return;
  const before = Object.keys(days).map(Number).filter(d => d < target);
  const last = before.length ? Math.max(...before) : null;
  const start = ((last === null) || ((target - last) > MAX_GAP)) ? target : last + 1;
  for ( let d = start; d <= target; d++ ) {
    if ( days[d] ) continue;
    days[d] = rollDay({ ...contextFor(d), previous: days[d - 1] ?? null, rng });
  }
}

/**
 * Bring the ledger up to today: today's weather and tomorrow's forecast exist afterwards.
 * @param {object} state
 * @param {number} today
 * @param {Function} contextFor   (day) => {climate, season, progress}
 * @param {object} [options]
 * @param {Function} [options.rng]
 * @param {boolean} [options.forecast=true]   Roll tomorrow's weather ahead of time too.
 * @returns {{state: object, changed: boolean}}
 */
export function advanceTo(state, today, contextFor, { rng=Math.random, forecast=true }={}) {
  const days = { ...(state?.days ?? {}) };
  const count = Object.keys(days).length;
  fillTo(days, today, contextFor, rng);
  if ( forecast ) fillTo(days, today + 1, contextFor, rng);
  prune(days, today);
  const changed = (Object.keys(days).length !== count)
    || Object.keys(days).some(k => days[k] !== state?.days?.[k]);
  return { state: { version: VERSION, days }, changed };
}

/**
 * Roll a day's weather again. Everything after it was rolled from it, so it's dropped, and tomorrow's forecast is
 * rolled afresh.
 * @param {object} state
 * @param {number} day
 * @param {Function} contextFor
 * @param {object} [options]
 * @param {Function} [options.rng]
 * @param {boolean} [options.forecast=true]
 */
export function rerollDay(state, day, contextFor, { rng=Math.random, forecast=true }={}) {
  const days = withoutAfter(state, day - 1);
  days[day] = rollDay({ ...contextFor(day), previous: days[day - 1] ?? null, rng });
  if ( forecast ) fillTo(days, day + 1, contextFor, rng);
  prune(days, day);
  return { version: VERSION, days };
}

/**
 * Set a day's weather (the GM's choice). Later days are dropped and tomorrow's forecast follows on from it.
 * @param {object} state
 * @param {number} day
 * @param {object} weather
 * @param {Function} contextFor
 * @param {object} [options]
 * @param {Function} [options.rng]
 * @param {boolean} [options.forecast=true]
 */
export function setDay(state, day, weather, contextFor, { rng=Math.random, forecast=true }={}) {
  const days = withoutAfter(state, day - 1);
  days[day] = weather;
  if ( forecast ) fillTo(days, day + 1, contextFor, rng);
  prune(days, day);
  return { version: VERSION, days };
}

/**
 * Roll the days after today again (after the climate or season changes), or drop them (when automatic rolling is
 * turned off, so the weather holds until the GM rolls). Days the GM set by hand are kept.
 * @param {object} state
 * @param {number} today
 * @param {Function} contextFor
 * @param {object} [options]
 * @param {Function} [options.rng]
 * @param {boolean} [options.forecast=true]
 */
export function refreshForecast(state, today, contextFor, { rng=Math.random, forecast=true }={}) {
  const days = { ...(state?.days ?? {}) };
  for ( const key of Object.keys(days) ) {
    if ( (Number(key) > today) && !days[key].manual ) delete days[key];
  }
  if ( forecast && days[today] ) fillTo(days, today + 1, contextFor, rng);
  return { version: VERSION, days };
}

/** A copy of the ledger's days up to and including `day`. */
function withoutAfter(state, day) {
  const days = {};
  for ( const [key, value] of Object.entries(state?.days ?? {}) ) {
    if ( Number(key) <= day ) days[key] = value;
  }
  return days;
}
