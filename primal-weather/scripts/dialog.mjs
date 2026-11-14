/**
 * The GM's weather window: the climate and season, and today's weather to roll again or set by hand.
 */
import { CLIMATES, SEASONS, WIND } from "./climates.mjs";
import { MODULE_ID, SETTINGS, loc, setting } from "./constants.mjs";
import { CONDITIONS, toCelsius, toFahrenheit } from "./generator.mjs";
import { climateName, conditionName, seasonName, windName } from "./display.mjs";
import { announce } from "./chat.mjs";
import { calendarSeason, dayIndex, getWeather, rollToday, setToday } from "./weather.mjs";

/** The open window, so a second click brings it forward instead of opening another. */
let open = null;

/**
 * Open the weather window (GM).
 * @returns {Promise<void>}
 */
export async function openWeatherDialog() {
  if ( !game.user.isGM ) return;
  if ( open?.rendered ) {
    open.bringToFront?.();
    return;
  }
  const esc = foundry.utils.escapeHTML;
  const found = getWeather();
  const current = found?.weather ?? null;
  const celsius = setting(SETTINGS.units) === "c";
  const unit = celsius ? "°C" : "°F";
  const toUnit = f => Math.round(celsius ? toCelsius(f) : f);
  const fromUnit = value => (celsius ? toFahrenheit(Number(value)) : Number(value));

  const climate = setting(SETTINGS.climate);
  const seasonChoice = setting(SETTINGS.season);
  const fromCalendar = calendarSeason(dayIndex());
  const option = (value, label, selected) => `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;

  const climates = Object.keys(CLIMATES).map(id => option(id, climateName(id), id === climate)).join("");
  const seasons = [
    option("calendar", loc("Dialog.SeasonCalendar", { season: seasonName(fromCalendar.season) }), seasonChoice === "calendar"),
    ...SEASONS.map(id => option(id, seasonName(id), id === seasonChoice))
  ].join("");
  const conditions = Object.keys(CONDITIONS)
    .map(id => option(id, conditionName(id), id === (current?.condition ?? "clear"))).join("");
  const winds = WIND.map(id => option(id, windName(id, { long: true }), id === (current?.wind ?? "light"))).join("");
  const high = current ? toUnit(current.high) : toUnit(60);
  const low = current ? toUnit(current.low) : toUnit(45);

  const content = `
    <p class="hint">${esc(loc("Dialog.Intro"))}</p>
    <div class="form-group">
      <label for="pw-climate">${esc(loc("Dialog.Climate"))}</label>
      <div class="form-fields"><select id="pw-climate" name="climate">${climates}</select></div>
    </div>
    <div class="form-group">
      <label for="pw-season">${esc(loc("Dialog.Season"))}</label>
      <div class="form-fields"><select id="pw-season" name="season">${seasons}</select></div>
    </div>
    <fieldset>
      <legend>${esc(loc("Dialog.Today"))}</legend>
      <div class="form-group">
        <label for="pw-condition">${esc(loc("Dialog.Condition"))}</label>
        <div class="form-fields"><select id="pw-condition" name="condition">${conditions}</select></div>
      </div>
      <div class="form-group">
        <label for="pw-high">${esc(loc("Dialog.HighLow", { unit }))}</label>
        <div class="form-fields">
          <input id="pw-high" type="number" name="high" step="1" value="${high}" aria-label="${esc(loc("Dialog.High"))}">
          <span class="pw-dialog-sep">/</span>
          <input id="pw-low" type="number" name="low" step="1" value="${low}" aria-label="${esc(loc("Dialog.Low"))}">
        </div>
      </div>
      <div class="form-group">
        <label for="pw-wind">${esc(loc("Dialog.Wind"))}</label>
        <div class="form-fields"><select id="pw-wind" name="wind">${winds}</select></div>
      </div>
      <p class="hint">${esc(loc("Dialog.TodayHint"))}</p>
    </fieldset>`;

  const read = (button) => {
    const FormDataExtended = foundry.applications.ux.FormDataExtended;
    return new FormDataExtended(button.form).object;
  };
  const DialogV2 = foundry.applications.api.DialogV2;
  const promise = DialogV2.wait({
    window: { title: loc("Dialog.Title"), icon: "fa-solid fa-cloud-sun-rain" },
    position: { width: 460 },
    classes: ["primal-weather-dialog"],
    content,
    buttons: [
      {
        action: "roll",
        label: loc("Dialog.Roll"),
        icon: "fa-solid fa-dice",
        callback: (event, button) => ({ action: "roll", data: read(button) })
      },
      {
        action: "save",
        label: loc("Dialog.Save"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => ({ action: "save", data: read(button) })
      }
    ],
    render: (event, dialog) => {
      open = dialog;
    },
    rejectClose: false
  });
  let result;
  try {
    result = await promise;
  } finally {
    open = null;
  }
  if ( !result?.data ) return;
  const { action, data } = result;

  try {
    // The climate and season first, so a roll uses them.
    if ( (data.climate in CLIMATES) && (data.climate !== climate) ) {
      await game.settings.set(MODULE_ID, SETTINGS.climate, data.climate);
    }
    if ( ["calendar", ...SEASONS].includes(data.season) && (data.season !== seasonChoice) ) {
      await game.settings.set(MODULE_ID, SETTINGS.season, data.season);
    }

    if ( action === "roll" ) {
      if ( await rollToday() ) announce(getWeather()?.weather);
      return;
    }

    // Save: set today's weather by hand, if any of it was changed.
    const changed = !current
      || (data.condition !== current.condition)
      || (data.wind !== current.wind)
      || (Math.round(Number(data.high)) !== toUnit(current.high))
      || (Math.round(Number(data.low)) !== toUnit(current.low));
    if ( !changed ) return;
    const saved = await setToday({
      condition: data.condition,
      wind: data.wind,
      high: fromUnit(data.high),
      low: fromUnit(data.low)
    });
    if ( saved ) announce(getWeather()?.weather);
  } catch(err) {
    console.error(`${MODULE_ID} | Could not save the weather`, err);
    ui.notifications.error(loc("Notify.Failed"));
  }
}
