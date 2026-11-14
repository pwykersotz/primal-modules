/**
 * Today's weather in the world: reading it, rolling it, and moving it on when the calendar moves.
 *
 * The ledger (ledger.mjs) lives in a world setting that only GMs write. The active GM's client moves it on when the
 * in-game day changes (if automatic rolling is on); any GM can roll again or set the weather by hand. Players only
 * read it.
 */
import { MODULE_ID, SETTINGS, setting } from "./constants.mjs";
import { manualDay } from "./generator.mjs";
import * as Ledger from "./ledger.mjs";
import { seasonFor } from "./seasons.mjs";

/* -------------------------------------------- */
/*  Calendar days                               */
/* -------------------------------------------- */

/** Seconds in a day of the world calendar. */
export function secondsPerDay(calendar=game.time.calendar) {
  const d = calendar?.days ?? {};
  const seconds = (d.secondsPerMinute ?? 60) * (d.minutesPerHour ?? 60) * (d.hoursPerDay ?? 24);
  return (Number.isFinite(seconds) && (seconds > 0)) ? seconds : 86400;
}

/**
 * The day number of a world time (days since the calendar's start).
 * @param {number} [time]   World time in seconds, by default now.
 */
export function dayIndex(time=game.time.worldTime) {
  return Math.floor((Number(time) || 0) / secondsPerDay());
}

/** The calendar's time components for midday of a day number. */
export function componentsForDay(day) {
  const spd = secondsPerDay();
  return game.time.calendar.timeToComponents((day * spd) + (spd / 2));
}

/**
 * The season on a day, by the settings and the calendar.
 * @param {number} day
 * @returns {{season: string, progress: number, source: string, name?: string}}
 */
export function seasonOnDay(day) {
  return seasonFor(game.time.calendar, componentsForDay(day), {
    override: setting(SETTINGS.season),
    localize: key => game.i18n.localize(key)
  });
}

/**
 * The season on a day by the calendar alone (ignoring a season chosen in the settings).
 * @param {number} day
 */
export function calendarSeason(day) {
  return seasonFor(game.time.calendar, componentsForDay(day), { localize: key => game.i18n.localize(key) });
}

/**
 * What the generator needs for a day: the climate, the season and how far through it.
 * @param {number} day
 */
export function contextFor(day) {
  const { season, progress } = seasonOnDay(day);
  return { climate: setting(SETTINGS.climate), season, progress };
}

/* -------------------------------------------- */
/*  Reading                                     */
/* -------------------------------------------- */

/** The ledger as stored. */
export function getState() {
  return Ledger.normalizeState(setting(SETTINGS.state));
}

/**
 * The weather now: today's, or the most recent before today if nobody has rolled since.
 * @param {number} [day]
 * @returns {{day: number, weather: object, yesterday: object|null, tomorrow: object|null, stale: boolean}|null}
 */
export function getWeather(day=dayIndex()) {
  const state = getState();
  const found = Ledger.latestOnOrBefore(state, day);
  if ( !found ) return null;
  // With automatic rolling off, the last weather simply holds until the GM rolls again.
  const stale = (found.day !== day) && !!setting(SETTINGS.autoRoll);
  return {
    day: found.day,
    weather: found.weather,
    yesterday: (found.day === day) ? Ledger.getDay(state, day - 1) : null,
    tomorrow: (found.day === day) ? Ledger.getDay(state, day + 1) : null,
    stale
  };
}

/* -------------------------------------------- */
/*  Writing (GM)                                */
/* -------------------------------------------- */

/** Writes from this client, one at a time, each reading the ledger as the previous one left it. */
let queue = Promise.resolve();

/**
 * Change the ledger. Only GMs can write world settings.
 * @param {Function} change   (state) => new state, or null for no change.
 * @returns {Promise<boolean>}  Whether it was saved.
 */
function write(change) {
  const run = async () => {
    if ( !game.user.isGM ) return false;
    const next = change(getState());
    if ( !next ) return false;
    await game.settings.set(MODULE_ID, SETTINGS.state, next);
    return true;
  };
  const result = queue.then(run);
  queue = result.catch(err => console.error(`${MODULE_ID} | Could not save the weather`, err));
  return result;
}

/**
 * Bring the weather up to today (active GM, when automatic rolling is on).
 * @param {object} [options]
 * @param {boolean} [options.force]   Roll even if automatic rolling is off.
 * @returns {Promise<boolean>}  Whether anything changed.
 */
export function syncToday({ force=false }={}) {
  if ( !game.users.activeGM?.isSelf ) return Promise.resolve(false);
  return write(state => {
    if ( !force && !setting(SETTINGS.autoRoll) ) return null;
    const { state: next, changed } = Ledger.advanceTo(state, dayIndex(), contextFor, { forecast: forecasting() });
    return changed ? next : null;
  });
}

/** Tomorrow's weather is rolled ahead of time only while it will move on by itself. */
function forecasting() {
  return !!setting(SETTINGS.autoRoll);
}

/** Roll today's weather again (GM). */
export function rollToday() {
  return write(state => Ledger.rerollDay(state, dayIndex(), contextFor, { forecast: forecasting() }));
}

/**
 * Set today's weather by hand (GM).
 * @param {object} values   {condition, high, low, wind}, temperatures in °F.
 */
export function setToday(values) {
  return write(state => {
    const day = dayIndex();
    const context = contextFor(day);
    return Ledger.setDay(state, day, manualDay({ ...context, ...values }), contextFor, { forecast: forecasting() });
  });
}

/**
 * Roll tomorrow's forecast again after the climate or season changes, or drop it when automatic rolling is turned
 * off (active GM).
 */
export function refreshForecast() {
  if ( !game.users.activeGM?.isSelf ) return Promise.resolve(false);
  return write(state => {
    if ( !Object.keys(state.days).length ) return null;
    return Ledger.refreshForecast(state, dayIndex(), contextFor, { forecast: forecasting() });
  });
}
