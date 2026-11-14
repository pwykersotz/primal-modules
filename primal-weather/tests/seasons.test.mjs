/**
 * Checks for reading the season from the calendar (scripts/seasons.mjs), run with `node tests/seasons.test.mjs`.
 * The calendars are copies of the season and month data in Foundry 14's simplified Gregorian calendar and dnd5e
 * 6.0.6's Harptos, Greyhawk and Khorvaire calendars.
 */
import assert from "node:assert/strict";
import { seasonFor, seasonFromName, seasonFromYear, seasonProgress } from "../scripts/seasons.mjs";

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

const months = list => ({ values: list.map(([name, days, leapDays], i) => ({ name, ordinal: i + 1, days, leapDays })) });

const gregorian = {
  days: { daysPerYear: 365 },
  months: months([["Jan", 31], ["Feb", 28, 29], ["Mar", 31], ["Apr", 30], ["May", 31], ["Jun", 30], ["Jul", 31],
    ["Aug", 31], ["Sep", 30], ["Oct", 31], ["Nov", 30], ["Dec", 31]]),
  seasons: { values: [
    { name: "CALENDAR.GREGORIAN.Spring", monthStart: 3, monthEnd: 5 },
    { name: "CALENDAR.GREGORIAN.Summer", monthStart: 6, monthEnd: 8 },
    { name: "CALENDAR.GREGORIAN.Fall", monthStart: 9, monthEnd: 11 },
    { name: "CALENDAR.GREGORIAN.Winter", monthStart: 12, monthEnd: 2 }
  ] }
};

const harptos = {
  days: { daysPerYear: 365 },
  months: months(Array.from({ length: 12 }, (_, i) => [`M${i + 1}`, 30])),
  seasons: { values: [
    { name: "DND5E.CALENDAR.Harptos.Season.Spring", dayStart: 79, dayEnd: 171 },
    { name: "DND5E.CALENDAR.Harptos.Season.Summer", dayStart: 172, dayEnd: 263 },
    { name: "DND5E.CALENDAR.Harptos.Season.Fall", dayStart: 264, dayEnd: 353 },
    { name: "DND5E.CALENDAR.Harptos.Season.Winter", dayStart: 354, dayEnd: 78 }
  ] }
};

const khorvaire = {
  days: { daysPerYear: 336 },
  months: months(Array.from({ length: 12 }, (_, i) => [`M${i + 1}`, 28])),
  seasons: { values: [
    { name: "DND5E.CALENDAR.Khorvaire.Season.Spring", monthStart: 3, monthEnd: 5 },
    { name: "DND5E.CALENDAR.Khorvaire.Season.Summer", monthStart: 6, monthEnd: 8 },
    { name: "DND5E.CALENDAR.Khorvaire.Season.Autumn", monthStart: 9, monthEnd: 11 },
    { name: "DND5E.CALENDAR.Khorvaire.Season.Winter", monthStart: 12, monthEnd: 2 }
  ] }
};

/** Components for a Gregorian date (not a leap year), with the season index Foundry would give. */
function gregorianDay(month, dayOfMonth) {
  let day = dayOfMonth;
  for ( let m = 0; m < month; m++ ) day += gregorian.months.values[m].days;
  const ordinal = month + 1;
  const season = gregorian.seasons.values.findIndex(s => (s.monthStart <= s.monthEnd)
    ? (ordinal >= s.monthStart && ordinal <= s.monthEnd)
    : (ordinal >= s.monthStart || ordinal <= s.monthEnd));
  return { day, month, dayOfMonth, leapYear: false, season };
}

/* ---- Names ---- */
check(() => {
  assert.equal(seasonFromName({ name: "CALENDAR.GREGORIAN.Fall" }), "autumn");
  assert.equal(seasonFromName({ name: "DND5E.CALENDAR.Khorvaire.Season.Autumn" }), "autumn");
  assert.equal(seasonFromName({ name: "DND5E.CALENDAR.Greyhawk.Season.Spring" }), "spring");
  assert.equal(seasonFromName({ name: "SOME.KEY" }, () => "Hochsommer"), null);
  assert.equal(seasonFromName({ name: "MY.KEY" }, () => "Deep Winter"), "winter", "the translated name is read too");
  assert.equal(seasonFromName({ name: "The Long Dark" }), null);
}, "season names");

/* ---- Gregorian (month-based, winter wraps the year) ---- */
check(() => {
  const jan1 = seasonFor(gregorian, gregorianDay(0, 0));
  assert.equal(jan1.season, "winter");
  assert.equal(jan1.source, "calendar");
  // Winter is December (31) + January (31) + February (28) = 90 days; 1 January is day 31 of it.
  assert.ok(Math.abs(jan1.progress - (31.5 / 90)) < 1e-9, `progress ${jan1.progress}`);
  const jul15 = seasonFor(gregorian, gregorianDay(6, 14));
  assert.equal(jul15.season, "summer");
  assert.ok(Math.abs(jul15.progress - 0.5) < 0.05, "mid-July is mid-summer");
  assert.equal(seasonFor(gregorian, gregorianDay(9, 3)).season, "autumn");
  const mar1 = seasonFor(gregorian, gregorianDay(2, 0));
  assert.equal(mar1.season, "spring");
  assert.ok(mar1.progress < 0.02, "1 March is the start of spring");
  const nov30 = seasonFor(gregorian, gregorianDay(10, 29));
  assert.ok(nov30.progress > 0.98, "30 November is the end of autumn");
}, "Gregorian");

/* ---- Harptos (day-based, winter wraps the year) ---- */
check(() => {
  // Day 0 of the year is day 1: winter runs from day 354 to day 78, 90 days, and day 1 is the 13th of them.
  const day0 = seasonFor(harptos, { day: 0, month: 0, dayOfMonth: 0, season: 3 });
  assert.equal(day0.season, "winter");
  assert.ok(Math.abs(day0.progress - (12.5 / 90)) < 1e-9, `progress ${day0.progress}`);
  const midsummer = seasonFor(harptos, { day: 216, month: 7, dayOfMonth: 6, season: 1 });
  assert.equal(midsummer.season, "summer");
  assert.ok(Math.abs(midsummer.progress - 0.5) < 0.05);
  const first = seasonProgress(harptos, harptos.seasons.values[0], { day: 78 });
  assert.ok(first < 0.01, "first day of spring");
}, "Harptos");

/* ---- Khorvaire (month ordinals, 336-day year) ---- */
check(() => {
  const s = seasonFor(khorvaire, { day: 9 * 28 + 14, month: 9, dayOfMonth: 14, season: 2 });
  assert.equal(s.season, "autumn");
  assert.ok(Math.abs(s.progress - ((28 + 14.5) / 84)) < 1e-9);
}, "Khorvaire");

/* ---- Four seasons with unknown names are taken in order ---- */
check(() => {
  const custom = { ...gregorian, seasons: { values: gregorian.seasons.values.map((s, i) => ({ ...s, name: `Season ${i}` })) } };
  assert.equal(seasonFor(custom, gregorianDay(6, 14)).season, "summer");
  assert.equal(seasonFor(custom, gregorianDay(0, 3)).season, "winter");
}, "unnamed seasons");

/* ---- No seasons: the time of year ---- */
check(() => {
  const bare = { days: { daysPerYear: 365 }, months: gregorian.months, seasons: { values: [] } };
  assert.equal(seasonFor(bare, { day: 10, season: undefined }).season, "winter");
  assert.equal(seasonFor(bare, { day: 100 }).season, "spring");
  assert.equal(seasonFor(bare, { day: 200 }).season, "summer");
  assert.equal(seasonFor(bare, { day: 280 }).season, "autumn");
  assert.equal(seasonFor(bare, { day: 350 }).season, "winter");
  assert.equal(seasonFor(bare, { day: 100 }).source, "year");
  for ( let day = 0; day < 365; day++ ) {
    const { progress } = seasonFromYear(bare, { day });
    assert.ok((progress >= 0) && (progress <= 1), `day ${day}: progress ${progress}`);
  }
  // A calendar with no seasons field at all.
  assert.equal(seasonFor({ days: { daysPerYear: 360 } }, { day: 180 }).season, "summer");
}, "no seasons");

/* ---- The setting wins ---- */
check(() => {
  const s = seasonFor(gregorian, gregorianDay(0, 0), { override: "summer" });
  assert.deepEqual(s, { season: "summer", progress: 0.5, source: "setting" });
  assert.equal(seasonFor(gregorian, gregorianDay(0, 0), { override: "calendar" }).season, "winter");
}, "override");

console.log(`seasons: ${checks} checks passed`);
