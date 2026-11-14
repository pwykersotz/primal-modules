/**
 * Which season it is, read from the world calendar (Foundry's, with dnd5e's calendars in it: Gregorian, Greyhawk,
 * Harptos, Khorvaire), and how far through it. No Foundry globals are used, so it can be checked outside Foundry
 * (tests/seasons.test.mjs).
 */
import { SEASONS } from "./climates.mjs";

/** Words in a season's name (or its translation key) that say which season it is. */
const SEASON_WORDS = [
  ["spring", /spring|vernal/i],
  ["summer", /summer|estival/i],
  ["autumn", /autumn|fall|harvest/i],
  ["winter", /winter|hibernal/i]
];

/**
 * Which of the four seasons a calendar season is, from its name: the translation key (dnd5e's are like
 * "DND5E.CALENDAR.Harptos.Season.Fall") and the translated name.
 * @param {object} season              A calendar season ({name}).
 * @param {Function} [localize]        Turns a key into text.
 * @returns {string|null}
 */
export function seasonFromName(season, localize) {
  const names = [season?.name, season?.abbreviation];
  if ( localize && season?.name ) names.push(localize(season.name));
  for ( const name of names ) {
    if ( !name ) continue;
    for ( const [id, pattern] of SEASON_WORDS ) if ( pattern.test(name) ) return id;
  }
  return null;
}

/** Days in a month of the calendar this year. */
function monthDays(calendar, index, leapYear) {
  const month = calendar.months?.values?.[index];
  if ( !month ) return 0;
  return leapYear ? (month.leapDays ?? month.days) : month.days;
}

/**
 * How far through a calendar season a day is: 0 on its first day, 1 at the end of its last.
 * @param {object} calendar
 * @param {object} season         {dayStart, dayEnd} (days of the year, from 1) or {monthStart, monthEnd} (month ordinals).
 * @param {object} components     The day's time components (day, month, dayOfMonth, leapYear).
 * @returns {number}              0.5 when it can't be worked out.
 */
export function seasonProgress(calendar, season, components) {
  const daysPerYear = calendar.days?.daysPerYear ?? 365;
  const { dayStart, dayEnd, monthStart, monthEnd } = season ?? {};
  if ( Number.isInteger(dayStart) && Number.isInteger(dayEnd) ) {
    const length = (((dayEnd - dayStart) % daysPerYear) + daysPerYear) % daysPerYear + 1;
    const position = ((((components.day + 1) - dayStart) % daysPerYear) + daysPerYear) % daysPerYear;
    return Math.min(Math.max((position + 0.5) / length, 0), 1);
  }
  const months = calendar.months?.values ?? [];
  if ( Number.isInteger(monthStart) && Number.isInteger(monthEnd) && months.length ) {
    const startIndex = months.findIndex(m => m.ordinal === monthStart);
    const endIndex = months.findIndex(m => m.ordinal === monthEnd);
    if ( (startIndex < 0) || (endIndex < 0) ) return 0.5;
    let total = 0;
    let position = null;
    for ( let i = startIndex, n = 0; n < months.length; i = (i + 1) % months.length, n++ ) {
      if ( i === components.month ) position = total + components.dayOfMonth;
      total += monthDays(calendar, i, components.leapYear);
      if ( i === endIndex ) break;
    }
    if ( (position === null) || !total ) return 0.5;
    return Math.min(Math.max((position + 0.5) / total, 0), 1);
  }
  return 0.5;
}

/**
 * The season from the time of year alone, for calendars without seasons: the year is split like Earth's northern
 * hemisphere (winter from early December to the end of February, and so on).
 * @param {object} calendar
 * @param {object} components
 */
export function seasonFromYear(calendar, components) {
  const daysPerYear = calendar.days?.daysPerYear || 365;
  const f = (components.day + 0.5) / daysPerYear;
  // Where each season starts, as a fraction of a Gregorian year: 1 March, 1 June, 1 September, 1 December.
  const starts = [[59 / 365, "spring"], [151 / 365, "summer"], [243 / 365, "autumn"], [334 / 365, "winter"]];
  for ( let i = starts.length - 1; i >= 0; i-- ) {
    const [start, season] = starts[i];
    if ( f >= start ) {
      const end = (i === starts.length - 1) ? 1 + starts[0][0] : starts[i + 1][0];
      return { season, progress: (f - start) / (end - start), source: "year" };
    }
  }
  // January and February: winter, which began in December.
  const start = starts[3][0] - 1;
  return { season: "winter", progress: (f - start) / (starts[0][0] - start), source: "year" };
}

/**
 * The season on a day and how far through it.
 * @param {object} calendar             The world calendar (game.time.calendar).
 * @param {object} components           The day's time components (calendar.timeToComponents).
 * @param {object} [options]
 * @param {string} [options.override]   A season chosen in the settings ("calendar" or blank to read the calendar).
 * @param {Function} [options.localize]
 * @returns {{season: string, progress: number, source: "setting"|"calendar"|"year", name?: string}}
 */
export function seasonFor(calendar, components, { override, localize }={}) {
  if ( SEASONS.includes(override) ) return { season: override, progress: 0.5, source: "setting" };
  const seasons = calendar?.seasons?.values ?? [];
  const index = components?.season;
  const season = Number.isInteger(index) ? seasons[index] : null;
  if ( season ) {
    let id = seasonFromName(season, localize);
    // Four seasons with names we don't recognise: take them in the usual order, spring first.
    if ( !id && (seasons.length === 4) ) id = SEASONS[index];
    if ( id ) {
      return {
        season: id,
        progress: seasonProgress(calendar, season, components),
        source: "calendar",
        name: season.name
      };
    }
  }
  return seasonFromYear(calendar ?? {}, components ?? { day: 0 });
}
