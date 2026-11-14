/**
 * Words and icons for the weather: the bar under the calendar, its tooltip, and the chat card.
 */
import { CLIMATES } from "./climates.mjs";
import { CONDITIONS, formatTemperature, rulesFor, temperatureAt } from "./generator.mjs";
import { loc } from "./constants.mjs";

const esc = text => String(text ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
})[c]);

/**
 * The time of day on the world calendar.
 * @returns {{hour: number, hoursPerDay: number, sunrise: number, sunset: number}}
 */
export function timeOfDay() {
  const calendar = game.time.calendar;
  const c = game.time.components;
  const days = calendar.days ?? {};
  const hoursPerDay = days.hoursPerDay ?? 24;
  const hour = c.hour + ((c.minute + (c.second / (days.secondsPerMinute ?? 60))) / (days.minutesPerHour ?? 60));
  // dnd5e's calendars know sunrise and sunset; otherwise a quarter and three quarters through the day.
  const ask = name => {
    try {
      const value = (typeof calendar[name] === "function") ? calendar[name](c) : NaN;
      return Number.isFinite(value) ? value : null;
    } catch(err) {
      return null;
    }
  };
  return {
    hour,
    hoursPerDay,
    sunrise: ask("sunrise") ?? (hoursPerDay * 0.25),
    sunset: ask("sunset") ?? (hoursPerDay * 0.75)
  };
}

/** A condition's name. */
export function conditionName(condition) {
  return loc(`Condition.${condition}.Name`);
}

/** A wind strength's short name (for the bar) or long one. */
export function windName(wind, { long=false }={}) {
  return loc(`Wind.${wind}.${long ? "Long" : "Short"}`);
}

/** A climate's name. */
export function climateName(climate) {
  return loc(`Climate.${(climate in CLIMATES) ? climate : "temperate"}.Name`);
}

/** A season's name. */
export function seasonName(season) {
  return loc(`Season.${season}`);
}

/**
 * The rules reminders for a day's weather.
 * @returns {{id: string, name: string, text: string}[]}
 */
export function describeRules(weather) {
  return rulesFor(weather).map(id => ({ id, name: loc(`Rules.${id}.Name`), text: loc(`Rules.${id}.Text`) }));
}

/**
 * Everything the bar and its tooltip show.
 * @param {object} options
 * @param {object} options.weather           Today's weather (or the last known).
 * @param {object} [options.yesterday]
 * @param {object} [options.tomorrow]
 * @param {boolean} [options.stale]          Nobody has rolled for today yet (automatic rolling is on, but no GM has
 *                                           been online since the day changed); this is an earlier day's weather.
 * @param {object} options.time              timeOfDay()
 * @param {string} options.units             "f", "c" or "both".
 * @param {boolean} options.isGM
 */
export function describe({ weather, yesterday=null, tomorrow=null, stale=false, time, units, isGM }) {
  const condition = CONDITIONS[weather.condition] ? weather.condition : "clear";
  const config = CONDITIONS[condition];
  const night = (time.hour < time.sunrise) || (time.hour >= time.sunset);
  const now = temperatureAt({
    hour: time.hour, hoursPerDay: time.hoursPerDay, sunrise: time.sunrise, today: weather, yesterday, tomorrow
  });
  const temp = value => formatTemperature(value, units);
  const rules = describeRules(weather);
  const name = conditionName(condition);

  const lines = [`<strong>${esc(name)}</strong>`];
  if ( isGM && weather.manual ) lines[0] += ` <span class="pw-tip-note">${esc(loc("Tooltip.Manual"))}</span>`;
  lines.push(`<span class="pw-tip-hint">${esc(loc(`Condition.${condition}.Hint`))}</span>`);
  lines.push(esc(loc("Tooltip.Temperature", { now: temp(now), high: temp(weather.high), low: temp(weather.low) })));
  lines.push(esc(loc("Tooltip.Wind", { wind: windName(weather.wind, { long: true }) })));
  lines.push(`<span class="pw-tip-where">${esc(whereLabel(weather))}</span>`);
  if ( rules.length ) {
    const items = rules.map(r => `<li><strong>${esc(r.name)}.</strong> ${esc(r.text)}</li>`).join("");
    lines.push(`<ul class="pw-tip-rules">${items}</ul>`);
  }
  if ( stale ) lines.push(`<em>${esc(loc(isGM ? "Tooltip.StaleGM" : "Tooltip.Stale"))}</em>`);
  if ( isGM && tomorrow ) {
    lines.push(`<span class="pw-tip-forecast">${esc(loc("Tooltip.Forecast", {
      condition: conditionName(tomorrow.condition), high: temp(tomorrow.high), low: temp(tomorrow.low),
      wind: windName(tomorrow.wind, { long: true })
    }))}</span>`);
  }
  if ( isGM ) lines.push(`<em>${esc(loc("Tooltip.ClickEdit"))}</em>`);

  return {
    condition,
    icon: (night && config.night) ? config.night : config.icon,
    label: name,
    temperature: temp(now),
    wind: weather.wind,
    windLabel: windName(weather.wind),
    windy: ["moderate", "strong", "gale"].includes(weather.wind),
    rules,
    warning: rules.length > 0,
    warningLabel: rules.map(r => r.name).join(", "),
    night,
    stale,
    tooltip: `<div class="primal-weather-tooltip">${lines.join("<br>")}</div>`
      .replace(/<br>(<ul)/g, "$1").replace(/(<\/ul>)<br>/g, "$1")
  };
}

/** "Autumn · Temperate": the season and climate the weather was rolled for. */
export function whereLabel(weather) {
  return [weather.season ? seasonName(weather.season) : null, climateName(weather.climate)].filter(Boolean).join(" · ");
}

/**
 * The chat card for a day's weather.
 * @param {object} weather
 * @param {string} units
 */
export function chatContent(weather, units) {
  const condition = CONDITIONS[weather.condition] ? weather.condition : "clear";
  const temp = value => formatTemperature(value, units);
  const rules = describeRules(weather);
  const where = whereLabel(weather);
  return `
    <div class="primal-weather-card">
      <header><i class="${CONDITIONS[condition].icon}"></i> <strong>${esc(conditionName(condition))}</strong></header>
      <p class="pw-card-hint">${esc(loc(`Condition.${condition}.Hint`))}</p>
      <p>${esc(loc("Chat.Temperature", { high: temp(weather.high), low: temp(weather.low) }))}<br>
      ${esc(loc("Tooltip.Wind", { wind: windName(weather.wind, { long: true }) }))}</p>
      ${where ? `<p class="pw-card-where">${esc(where)}</p>` : ""}
      ${rules.length ? `<ul>${rules.map(r => `<li><strong>${esc(r.name)}.</strong> ${esc(r.text)}</li>`).join("")}</ul>` : ""}
    </div>`;
}
