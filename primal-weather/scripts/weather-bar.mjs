/**
 * The weather bar: today's weather in a strip under dnd5e's calendar.
 *
 * It lives inside Foundry's #ui-top column (where dnd5e puts its calendar HUD) with a CSS `order` between the
 * calendar (0) and Primal Combat's carousel (100), so it always sits right under the calendar and above the carousel.
 */
import { MODULE_ID, SETTINGS, loc, setting } from "./constants.mjs";
import { describe, timeOfDay } from "./display.mjs";
import { announce, postWeather } from "./chat.mjs";
import { openWeatherDialog } from "./dialog.mjs";
import { sceneMenuState, setSceneWeather } from "./scene-effects.mjs";
import { getWeather, rollToday } from "./weather.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class WeatherBar extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "primal-weather",
    tag: "section",
    classes: ["primal-weather", "faded-ui", "ui-control"],
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      roll: WeatherBar.#onRoll,
      edit: WeatherBar.#onEdit
    }
  };

  /** @override */
  static PARTS = {
    bar: {
      template: `modules/${MODULE_ID}/templates/weather-bar.hbs`
    }
  };

  /** Re-render soon. Several hooks can fire at once (a time change, a setting), so this waits a moment. */
  refresh = foundry.utils.debounce(() => {
    this.render({ force: true }).catch(err => console.error(`${MODULE_ID} | Weather bar render failed`, err));
  }, 50);

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _insertElement(element) {
    const existing = document.getElementById(element.id);
    if ( existing ) {
      existing.replaceWith(element);
      return;
    }
    const top = document.querySelector("#ui-middle #ui-top") ?? document.getElementById("ui-top");
    (top ?? document.body).append(element);
  }

  /** @override */
  async _prepareContext(options) {
    const isGM = game.user.isGM;
    const context = {
      visible: false,
      isGM,
      labels: {
        roll: loc("Bar.Roll"),
        menu: loc("Bar.Menu"),
        empty: loc("Bar.Empty"),
        hidden: loc("Bar.HiddenFromPlayers")
      }
    };
    if ( !setting(SETTINGS.showBar) ) return context;
    const hidden = setting(SETTINGS.visibility) === "gm";
    if ( hidden && !isGM ) return context;

    const found = getWeather();
    if ( !found ) {
      // No weather yet: the GM gets a button to roll it.
      if ( isGM ) Object.assign(context, { visible: true, empty: true });
      return context;
    }
    const weather = describe({
      weather: found.weather,
      yesterday: found.yesterday,
      tomorrow: found.tomorrow,
      stale: found.stale,
      time: timeOfDay(),
      units: setting(SETTINGS.units),
      isGM
    });
    return Object.assign(context, { visible: true, weather, hiddenFromPlayers: isGM && hidden });
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    if ( !game.user.isGM ) return;
    const ContextMenu = foundry.applications.ux.ContextMenu.implementation;
    new ContextMenu(this.element, ".pw-menu", this.#menuItems(), { jQuery: false, fixed: true, eventName: "click" });
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.classList.toggle("pw-shown", !!context.visible);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** The 🎲 button: roll today's weather again. */
  static async #onRoll(event, target) {
    if ( !game.user.isGM ) return;
    target.disabled = true;
    try {
      await rollAndAnnounce();
    } finally {
      target.disabled = false;
    }
  }

  /** Click the weather (GM): open the weather window. */
  static #onEdit() {
    if ( game.user.isGM ) openWeatherDialog();
  }

  /** The GM's ⋮ menu. */
  #menuItems() {
    return [
      {
        label: loc("Menu.Roll"),
        icon: "fa-solid fa-dice",
        onClick: () => rollAndAnnounce()
      },
      {
        label: loc("Menu.Edit"),
        icon: "fa-solid fa-pen-to-square",
        onClick: () => openWeatherDialog()
      },
      {
        label: loc("Menu.ShowOnScene"),
        icon: "fa-solid fa-map",
        visible: () => sceneMenuState() === "show",
        onClick: () => setSceneWeather(canvas.scene, true)
      },
      {
        label: loc("Menu.HideOnScene"),
        icon: "fa-solid fa-map",
        visible: () => sceneMenuState() === "hide",
        onClick: () => setSceneWeather(canvas.scene, false)
      },
      {
        label: loc("Menu.PostChat"),
        icon: "fa-solid fa-comment",
        visible: () => !!getWeather(),
        onClick: () => postWeather()
      },
      {
        label: loc("Menu.WhisperChat"),
        icon: "fa-solid fa-user-secret",
        visible: () => !!getWeather(),
        onClick: () => postWeather({ whisper: true })
      },
      {
        label: loc("Menu.HideFromPlayers"),
        icon: "fa-solid fa-eye-slash",
        visible: () => setting(SETTINGS.visibility) !== "gm",
        onClick: () => game.settings.set(MODULE_ID, SETTINGS.visibility, "gm")
      },
      {
        label: loc("Menu.ShowToPlayers"),
        icon: "fa-solid fa-eye",
        visible: () => setting(SETTINGS.visibility) === "gm",
        onClick: () => game.settings.set(MODULE_ID, SETTINGS.visibility, "all")
      }
    ];
  }
}

/** Roll today's weather again and announce it (GM). */
export async function rollAndAnnounce() {
  try {
    if ( await rollToday() ) announce(getWeather()?.weather);
  } catch(err) {
    console.error(`${MODULE_ID} | Could not roll the weather`, err);
    ui.notifications.error(loc("Notify.Failed"));
  }
}
