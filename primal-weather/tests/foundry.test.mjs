/**
 * The module in a small stand-in for Foundry, run with `node tests/foundry.test.mjs`: settings, the GM's client
 * rolling the weather on as the clock moves, the bar's contents for the GM and a player, the weather on the map, chat
 * cards, and the GM's weather window. Foundry's real classes aren't here, so this checks the module's own logic,
 * not how it looks.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fakeI18n, flatKeys } from "./helpers.mjs";

let checks = 0;
const check = async (fn, label) => {
  try {
    await fn();
    checks++;
  } catch(err) {
    err.message = `${label}: ${err.message}`;
    throw err;
  }
};
const settle = () => new Promise(r => setTimeout(r, 120));

/* -------------------------------------------- */
/*  Stand-ins                                   */
/* -------------------------------------------- */

const DAY = 86400;
const MONTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const calendar = {
  days: { daysPerYear: 365, hoursPerDay: 24, minutesPerHour: 60, secondsPerMinute: 60, values: [] },
  months: { values: MONTHS.map((days, i) => ({ name: `M${i + 1}`, ordinal: i + 1, days })) },
  seasons: { values: [
    { name: "CALENDAR.GREGORIAN.Spring", monthStart: 3, monthEnd: 5 },
    { name: "CALENDAR.GREGORIAN.Summer", monthStart: 6, monthEnd: 8 },
    { name: "CALENDAR.GREGORIAN.Fall", monthStart: 9, monthEnd: 11 },
    { name: "CALENDAR.GREGORIAN.Winter", monthStart: 12, monthEnd: 2 }
  ] },
  timeToComponents(time) {
    const days = Math.floor(time / DAY);
    const year = Math.floor(days / 365);
    const day = days - (year * 365);
    let rest = day;
    let month = 0;
    while ( rest >= MONTHS[month] ) rest -= MONTHS[month++];
    const seconds = time - (days * DAY);
    const ordinal = month + 1;
    const season = [[3, 5], [6, 8], [9, 11]].findIndex(([a, b]) => ordinal >= a && ordinal <= b);
    return {
      year, day, month, dayOfMonth: rest, leapYear: false, season: season < 0 ? 3 : season,
      hour: Math.floor(seconds / 3600), minute: Math.floor((seconds % 3600) / 60), second: seconds % 60
    };
  }
};

const store = new Map();
const registered = new Map();
const i18n = fakeI18n();
const hooks = new Map();
const once = new Map();
const chat = [];
const effects = [];
const notifications = [];
let dialogAnswer = null;

const gmUser = { id: "gm1", isGM: true };
const player = { id: "pl1", isGM: false };

globalThis.game = {
  i18n,
  user: gmUser,
  users: {
    activeGM: { get isSelf() { return game.user.isGM; } },
    filter: fn => [gmUser, player].filter(fn)
  },
  time: {
    worldTime: (200 * DAY) + (14 * 3600), // 20 July, 2pm
    calendar,
    get components() { return calendar.timeToComponents(this.worldTime); }
  },
  settings: {
    register(module, key, data) {
      registered.set(key, data);
      if ( !store.has(key) ) store.set(key, structuredClone(data.default));
    },
    get(module, key) {
      assert.ok(registered.has(key), `setting ${key} isn't registered`);
      return structuredClone(store.get(key));
    },
    async set(module, key, value) {
      if ( (registered.get(key).scope === "world") && !game.user.isGM ) throw new Error("Players can't write world settings");
      store.set(key, structuredClone(value));
      registered.get(key).onChange?.(structuredClone(value));
      return value;
    }
  },
  modules: new Map([["primal-weather", { version: "test" }]])
};

const utils = {
  debounce: fn => fn,
  escapeHTML: s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`),
  hasProperty: (o, p) => p.split(".").reduce((x, k) => (x && (k in x) ? x[k] : undefined), o) !== undefined
};

class FakeApplication {
  constructor(options) { this.options = options; this.element = { classList: { toggle() {} } }; }
  async render() {
    this.context = await this._prepareContext({});
    return this;
  }
  async _onFirstRender() {}
  async _onRender() {}
}

globalThis.foundry = {
  utils,
  applications: {
    api: {
      ApplicationV2: FakeApplication,
      HandlebarsApplicationMixin: C => C,
      DialogV2: {
        async wait(config) {
          dialogAnswer?.check?.(config);
          return dialogAnswer?.result ?? null;
        }
      }
    },
    ux: {
      ContextMenu: { implementation: class {} },
      FormDataExtended: class {}
    }
  }
};
globalThis.Hooks = {
  on: (name, fn) => (hooks.get(name) ?? hooks.set(name, []).get(name)).push(fn),
  once: (name, fn) => (once.get(name) ?? once.set(name, []).get(name)).push(fn),
  async fire(name, ...args) {
    for ( const fn of once.get(name) ?? [] ) await fn(...args);
    once.delete(name);
    for ( const fn of hooks.get(name) ?? [] ) await fn(...args);
  }
};
globalThis.CONFIG = {
  weatherEffects: Object.fromEntries(["leaves", "rain", "rainStorm", "fog", "snow", "blizzard"].map(id => [id, { id }]))
};
globalThis.ChatMessage = { implementation: { create: async data => { chat.push(data); return data; } } };
globalThis.ui = { notifications: { error: m => notifications.push(m) } };

const sceneFlags = {};
const scene = {
  id: "s1",
  weather: "",
  getFlag: (m, k) => sceneFlags[k],
  async setFlag(m, k, v) { sceneFlags[k] = v; await Hooks.fire("updateScene", scene, { flags: { [m]: { [k]: v } } }); },
  async unsetFlag(m, k) { delete sceneFlags[k]; await Hooks.fire("updateScene", scene, { flags: { [m]: { [`-=${k}`]: null } } }); }
};
globalThis.canvas = {
  ready: true,
  scene,
  weather: { initializeEffects: config => effects.push(config?.id ?? null) }
};
const log = console.log;
globalThis.console.log = () => {}; // The module's "ready" line.

/* -------------------------------------------- */
/*  Load the module                             */
/* -------------------------------------------- */

await import("../scripts/main.mjs");
await Hooks.fire("init");

await check(() => {
  for ( const key of ["state", "climate", "season", "autoRoll", "visibility", "sceneEffects", "announce", "showBar", "units"] ) {
    assert.ok(registered.has(key), key);
  }
  assert.equal(store.get("climate"), "temperate");
  assert.equal(store.get("season"), "calendar");
  assert.equal(store.get("autoRoll"), true);
  assert.equal(store.get("sceneEffects"), "marked");
  assert.equal(store.get("announce"), "off");
  assert.equal(registered.get("units").scope, "client");
  // Every setting's name, hint and choices are in the language file.
  const strings = flatKeys();
  for ( const [key, data] of registered ) {
    if ( data.config === false ) continue;
    assert.ok(data.name in strings, `${key} name`);
    assert.ok(data.hint in strings, `${key} hint`);
    for ( const label of Object.values(data.choices ?? {}) ) assert.ok(label in strings, `${key} choice ${label}`);
  }
}, "settings");

await Hooks.fire("ready");
await settle();
const api = game.modules.get("primal-weather").api;
const today = () => Math.floor(game.time.worldTime / DAY);
const state = () => store.get("state");

await check(() => {
  assert.ok(state().days[today()], "today's weather was rolled on ready");
  assert.ok(state().days[today() + 1], "and tomorrow's forecast");
  assert.equal(state().days[today()].season, "summer", "20 July is summer");
  assert.equal(chat.length, 0, "nothing posted with announcements off");
}, "ready");

/* ---- The bar ---- */
await check(async () => {
  await api.bar.render();
  const c = api.bar.context;
  assert.equal(c.visible, true);
  assert.equal(c.isGM, true);
  const w = state().days[today()];
  assert.equal(c.weather.condition, w.condition);
  assert.match(c.weather.temperature, /^-?\d+°F$/);
  assert.match(c.weather.tooltip, /Tomorrow \(only you see this\)/, "the GM sees the forecast");
  assert.match(c.weather.tooltip, /Click to change the weather/);
  assert.ok(!c.weather.label.startsWith("PRIMAL_WEATHER."), "the condition's name is translated");
}, "bar (GM)");

await check(async () => {
  game.user = player;
  await api.bar.render();
  assert.equal(api.bar.context.visible, true, "players see it by default");
  assert.doesNotMatch(api.bar.context.weather.tooltip, /Tomorrow/, "players don't see the forecast");
  assert.doesNotMatch(api.bar.context.weather.tooltip, /Click to change/);
  game.user = gmUser;
  await game.settings.set("primal-weather", "visibility", "gm");
  game.user = player;
  await api.bar.render();
  assert.equal(api.bar.context.visible, false, "hidden from players");
  game.user = gmUser;
  await api.bar.render();
  assert.equal(api.bar.context.visible, true, "the GM still sees it");
  assert.equal(api.bar.context.hiddenFromPlayers, true);
  await game.settings.set("primal-weather", "visibility", "all");
  await game.settings.set("primal-weather", "units", "c");
  await api.bar.render();
  assert.match(api.bar.context.weather.temperature, /°C$/);
  await game.settings.set("primal-weather", "units", "f");
}, "bar (player, hidden, units)");

/* ---- The clock moves on ---- */
await check(async () => {
  await game.settings.set("primal-weather", "announce", "all");
  const forecast = state().days[today() + 1];
  game.time.worldTime += DAY;
  await Hooks.fire("updateWorldTime", game.time.worldTime, DAY, {}, "gm1");
  await settle();
  assert.equal(state().days[today()].id, forecast.id, "yesterday's forecast is today's weather");
  assert.ok(state().days[today() + 1], "a new forecast");
  assert.equal(chat.length, 1, "the new day's weather was announced");
  assert.deepEqual(chat[0].whisper, []);
  assert.match(chat[0].content, /primal-weather-card/);

  // An hour later: same day, nothing new.
  game.time.worldTime += 3600;
  await Hooks.fire("updateWorldTime", game.time.worldTime, 3600, {}, "gm1");
  await settle();
  assert.equal(chat.length, 1, "no announcement within the same day");

  // A week later: every day in between is rolled.
  game.time.worldTime += 7 * DAY;
  await Hooks.fire("updateWorldTime", game.time.worldTime, 7 * DAY, {}, "gm1");
  await settle();
  for ( let d = today() - 8; d <= today() + 1; d++ ) assert.ok(state().days[d], `day ${d}`);
  assert.equal(chat.length, 2);

  // Back three days: the weather those days had, and no announcement (nothing new was rolled).
  const earlier = state().days[today() - 3];
  game.time.worldTime -= 3 * DAY;
  await Hooks.fire("updateWorldTime", game.time.worldTime, -3 * DAY, {}, "gm1");
  await settle();
  assert.equal(api.getWeather().weather.id, earlier.id);
  await game.settings.set("primal-weather", "announce", "gm");
}, "time passing");

/* ---- A player's client never writes ---- */
await check(async () => {
  game.user = player;
  const before = JSON.stringify(state());
  // Past the last day the GM's client rolled (three days back, then five on).
  game.time.worldTime += 5 * DAY;
  await Hooks.fire("updateWorldTime", game.time.worldTime, 5 * DAY, {}, "gm1");
  await settle();
  assert.equal(JSON.stringify(state()), before, "players leave the weather alone");
  await api.bar.render();
  assert.equal(api.bar.context.weather.stale, true, "the player sees the last weather until a GM rolls");
  assert.match(api.bar.context.weather.tooltip, /once a GM is online/);
  game.user = gmUser;
  await Hooks.fire("updateWorldTime", game.time.worldTime, 0, {}, "gm1");
  await settle();
  assert.ok(state().days[today()], "the GM's client catches up");
}, "players");

/* ---- Rolling again and the GM's window ---- */
await check(async () => {
  const old = state().days[today()].id;
  const posts = chat.length;
  await api.roll();
  await settle();
  assert.notEqual(state().days[today()].id, old, "rolled again");
  assert.equal(chat.length, posts + 1);
  assert.deepEqual(chat.at(-1).whisper, ["gm1"], "whispered to the GMs");

  dialogAnswer = {
    check: config => {
      assert.match(config.content, /name="climate"/);
      assert.match(config.content, /From the calendar \(now (Summer|Autumn)\)/);
      assert.deepEqual(config.buttons.map(b => b.action), ["roll", "save"]);
    },
    result: { action: "save", data: { climate: "arctic", season: "winter", condition: "blizzard", high: 10, low: -15, wind: "gale" } }
  };
  await api.openDialog();
  await settle();
  const w = state().days[today()];
  assert.equal(w.condition, "blizzard");
  assert.equal(w.manual, true);
  assert.deepEqual([w.high, w.low, w.wind], [10, -15, "gale"]);
  assert.equal(store.get("climate"), "arctic");
  assert.equal(store.get("season"), "winter");
  assert.equal(state().days[today() + 1].climate, "arctic", "tomorrow follows the new climate");
  await api.bar.render();
  const tip = api.bar.context.weather.tooltip;
  assert.match(tip, /set by the GM/);
  assert.match(tip, /Strong wind/);
  assert.match(tip, /Extreme cold/);
  assert.match(tip, /Heavy precipitation/);
  assert.equal(api.bar.context.weather.warning, true);

  // Saving without changing the weather leaves it alone.
  const id = state().days[today()].id;
  dialogAnswer = { result: { action: "save", data: { climate: "arctic", season: "winter", condition: "blizzard", high: 10, low: -15, wind: "gale" } } };
  await api.openDialog();
  await settle();
  assert.equal(state().days[today()].id, id);

  // Celsius in the window: the numbers are read back as °F.
  await game.settings.set("primal-weather", "units", "c");
  dialogAnswer = { result: { action: "save", data: { climate: "arctic", season: "winter", condition: "snow", high: 0, low: -10, wind: "light" } } };
  await api.openDialog();
  await settle();
  assert.deepEqual([state().days[today()].high, state().days[today()].low], [32, 14]);
  await game.settings.set("primal-weather", "units", "f");

  dialogAnswer = { result: { action: "roll", data: { climate: "desert", season: "calendar", condition: "snow", high: 0, low: 0, wind: "calm" } } };
  await api.openDialog();
  await settle();
  assert.equal(state().days[today()].climate, "desert");
  assert.equal(state().days[today()].manual, false);
  dialogAnswer = null;
}, "roll and window");

/* ---- The weather on the map ---- */
await check(async () => {
  effects.length = 0;
  await api.setWeather({ condition: "heavyRain", high: 70, low: 60, wind: "moderate" });
  await settle();
  assert.deepEqual(effects, [], "unmarked scenes show nothing");
  await api.setSceneWeather(scene, true);
  await settle();
  assert.deepEqual(effects, ["rainStorm"], "marked as outdoors: heavy rain shows as Foundry's rain storm");
  await api.setWeather({ condition: "fog", high: 50, low: 45, wind: "calm" });
  await settle();
  assert.equal(effects.at(-1), "fog");
  await api.setWeather({ condition: "fog", high: 52, low: 45, wind: "calm" });
  await settle();
  assert.equal(effects.length, 2, "not redrawn when the effect is the same");
  await api.setWeather({ condition: "clear", high: 70, low: 50, wind: "light" });
  await settle();
  assert.equal(effects.at(-1), null, "cleared for clear skies");
  await api.setWeather({ condition: "snow", high: 25, low: 10, wind: "light" });
  await settle();
  assert.equal(effects.at(-1), "snow");
  scene.weather = "leaves";
  await Hooks.fire("canvasReady", canvas);
  assert.equal(effects.at(-1), "snow", "a scene with its own weather keeps it");
  // Clearing the scene's own weather redraws the canvas in Foundry.
  scene.weather = "";
  await Hooks.fire("canvasReady", canvas);
  assert.equal(effects.at(-1), "snow", "the world's weather is back after the scene's own is cleared");
  await api.setSceneWeather(scene, false);
  await settle();
  assert.equal(effects.at(-1), null, "unmarked again");
  assert.equal(sceneFlags.sceneWeather, undefined, "the flag is only kept where it differs from the setting");
  await game.settings.set("primal-weather", "sceneEffects", "all");
  assert.equal(effects.at(-1), "snow", "every scene");
  await api.setSceneWeather(scene, false);
  assert.equal(sceneFlags.sceneWeather, false);
  assert.equal(effects.at(-1), null, "turned off for this scene");
  await game.settings.set("primal-weather", "sceneEffects", "off");
}, "map");

/* ---- Automatic rolling off: the weather holds ---- */
await check(async () => {
  await game.settings.set("primal-weather", "autoRoll", false);
  await settle();
  assert.equal(state().days[today() + 1], undefined, "no forecast");
  const held = api.getWeather().weather.id;
  game.time.worldTime += 3 * DAY;
  await Hooks.fire("updateWorldTime", game.time.worldTime, 3 * DAY, {}, "gm1");
  await settle();
  const now = api.getWeather();
  assert.equal(now.weather.id, held, "the same weather three days later");
  assert.equal(now.stale, false, "and it isn't shown as out of date");
  await game.settings.set("primal-weather", "autoRoll", true);
  await settle();
  assert.ok(state().days[today()], "turned back on: today is rolled");
  assert.ok(state().days[today() + 1], "with a forecast");
}, "automatic rolling off");

/* ---- Text ---- */
await check(() => {
  // (Foundry's own keys, like the calendar's season names, aren't in the stand-in.)
  assert.deepEqual([...i18n.missing].filter(k => k.startsWith("PRIMAL_WEATHER.")), [], "every key used is in lang/en.json");
  // Every loc("…") key written in the scripts exists.
  const strings = flatKeys();
  const dir = new URL("../scripts/", import.meta.url);
  for ( const file of readdirSync(dir) ) {
    const source = readFileSync(new URL(file, dir), "utf8");
    for ( const [, key] of source.matchAll(/\bloc\("([\w.]+)"/g) ) {
      assert.ok(`PRIMAL_WEATHER.${key}` in strings, `${file}: ${key}`);
    }
  }
  // Every condition, wind, climate, season and rule has its text.
  for ( const id of Object.keys(api.conditions) ) {
    assert.ok(`PRIMAL_WEATHER.Condition.${id}.Name` in strings && `PRIMAL_WEATHER.Condition.${id}.Hint` in strings, id);
  }
  for ( const id of ["calm", "light", "moderate", "strong", "gale"] ) assert.ok(`PRIMAL_WEATHER.Wind.${id}.Short` in strings, id);
  for ( const id of Object.keys(api.climates) ) assert.ok(`PRIMAL_WEATHER.Climate.${id}.Name` in strings, id);
  const rules = new Set(Object.values(api.conditions).flatMap(c => c.rules));
  for ( const id of [...rules, "strongWind", "extremeHeat", "extremeCold"] ) {
    assert.ok(`PRIMAL_WEATHER.Rules.${id}.Name` in strings && `PRIMAL_WEATHER.Rules.${id}.Text` in strings, id);
  }
  // No key is also the start of another key, or Foundry drops the file.
  const keys = Object.keys(strings).sort();
  for ( let i = 1; i < keys.length; i++ ) assert.ok(!keys[i].startsWith(`${keys[i - 1]}.`), `${keys[i - 1]} / ${keys[i]}`);
  assert.deepEqual(notifications, [], "no error notifications");
}, "text");

log(`foundry: ${checks} checks passed`);
