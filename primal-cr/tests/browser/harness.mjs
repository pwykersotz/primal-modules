/**
 * A stand-in game for checking Primal CR against the real thing: Foundry's own client code and the dnd5e system
 * are loaded as they ship, so the actors here are dnd5e's own Actor5e documents with everything dnd5e works out
 * (AC, save bonuses, to-hit, damage formulas, DCs, uses). Only what needs a server is faked: settings,
 * translations, the user and the world's collections.
 *
 * The page exposes window.harness for tests/browser/window.test.mjs.
 */
const calls = [];
window.harness = { calls, ready: false, error: null, log: [] };
window.addEventListener("load", () => boot().catch(err => {
  console.error(err);
  window.harness.error = String(err?.stack ?? err);
}));

async function boot() {
  await import("/scripts/foundry.mjs");
  const { Collection, deepClone, getProperty, mergeObject } = foundry.utils;

  // Translations
  const core = await (await fetch("/lang/en.json")).json();
  const system = await (await fetch("/systems/dnd5e/lang/en.json")).json();
  const mine = await (await fetch("/modules/primal-cr/lang/en.json")).json();
  const translations = mergeObject(mergeObject(core, system, { inplace: false }), mine, { inplace: false });
  const i18n = {
    lang: "en",
    translations,
    _fallback: {},
    pluralRules: new Intl.PluralRules("en"),
    localize(key) {
      const value = getProperty(translations, key);
      return typeof value === "string" ? value : key;
    },
    format(key, data = {}) {
      return this.localize(key).replace(/{[^}]+}/g, k => {
        const v = data[k.slice(1, -1)];
        return v === undefined ? k : String(v);
      });
    },
    has: key => typeof getProperty(translations, key) === "string",
    getListFormatter: (options = {}) => new Intl.ListFormat("en", { style: options.style ?? "long", type: options.type ?? "conjunction" }),
    sortObjects: (objects, key) => objects.sort((a, b) => String(getProperty(a, key)).localeCompare(String(getProperty(b, key))))
  };

  // Settings (in memory)
  const store = new Map(Object.entries({
    "core.uiConfig": { colorScheme: { interface: "dark", applications: "dark" } },
    "core.prototypeTokenOverrides": { base: {} }
  }));
  const registered = new Map();
  const settings = {
    store, registered,
    settings: registered,
    menus: new Map(),
    register(ns, key, config) {
      const id = `${ns}.${key}`;
      registered.set(id, config);
      if ( !store.has(id) ) {
        let initial = config.default;
        if ( (initial === undefined) && (typeof config.type?.getInitialValue === "function") ) initial = config.type.getInitialValue();
        if ( (initial === undefined) && config.type?.schema ) {
          try { initial = new config.type().toObject(); } catch { initial = {}; }
        }
        store.set(id, initial);
      }
    },
    registerMenu(ns, key, config) { this.menus.set(`${ns}.${key}`, config); },
    get(ns, key) {
      const id = `${ns}.${key}`;
      // Core settings nothing here registers read as empty.
      if ( !store.has(id) ) {
        if ( ns === "core" ) return {};
        throw new Error(`Setting ${id} is not registered`);
      }
      const value = store.get(id);
      return (value && typeof value === "object" && !(value instanceof foundry.abstract.DataModel)) ? deepClone(value) : value;
    },
    async set(ns, key, value) {
      const id = `${ns}.${key}`;
      store.set(id, deepClone(value));
      calls.push(["setting", id, deepClone(value)]);
      registered.get(id)?.onChange?.(deepClone(value));
      return value;
    }
  };

  const user = { id: "user1user1user1u", isGM: true, name: "GM", can: () => true, hasPermission: () => true, hasRole: () => true,
    character: null, targets: new Set(), getFlag: () => undefined, isSelf: true, active: true, role: 4 };
  const modules = new Collection([
    ["primal-cr", { id: "primal-cr", title: "Primal CR", version: "test", active: true, flags: {} }]
  ]);
  modules.get = function(id) { return Collection.prototype.get.call(this, id); };
  const systemJson = await (await fetch("/systems/dnd5e/system.json")).json();

  Object.assign(game, {
    i18n, settings, user,
    userId: user.id,
    users: new Collection([[user.id, user]]),
    packs: new Collection(),
    folders: new Collection(),
    modules,
    system: { id: "dnd5e", title: systemJson.title, version: systemJson.version, flags: systemJson.flags ?? {},
      documentTypes: systemJson.documentTypes, grid: {}, template: {} },
    world: { id: "test-world", title: "Test World" },
    release: { generation: 14, build: 370 },
    version: "14.370",
    keybindings: { register: (...a) => calls.push(["keybinding", a[0], a[1]]), get: () => [] },
    keyboard: { downKeys: new Set(), isModifierActive: () => false },
    time: { worldTime: 0, calendar: null },
    combat: null,
    combats: new Collection(),
    // Nothing here draws dnd5e's own sheets, so every template it asks for is an empty one.
    socket: {
      on() {},
      emit(event, path, callback) {
        if ( (event === "template") && (typeof callback === "function") ) callback({ html: "<div></div>" });
      }
    },
    tooltip: { activate() {}, deactivate() {}, dismissLockedTooltips() {} },
    documentIndex: { lookup: () => ({}) },
    compendiumArt: { applyArt: (cls, source) => source, enabled: false },
    ready: false,
    view: "game"
  });
  // Which subtypes each document has: Foundry's own ("base") and the system's.
  game.model = {};
  for ( const name of CONST.ALL_DOCUMENT_TYPES ?? [] ) game.model[name] = { base: {} };
  for ( const [name, types] of Object.entries(systemJson.documentTypes ?? {}) ) {
    game.model[name] = { base: {}, ...Object.fromEntries(Object.keys(types).map(t => [t, {}])) };
  }
  game.documentTypes = Object.fromEntries(Object.entries(game.model).map(([k, v]) => [k, Object.keys(v)]));
  globalThis._loc = (key, data) => (data ? i18n.format(key, data) : i18n.localize(key));
  globalThis.canvas = { ready: false, tokens: { controlled: [] }, scene: null, grid: {} };
  ui.notifications = {
    info: (...a) => calls.push(["notify", "info", ...a]),
    warn: (...a) => calls.push(["notify", "warn", ...a]),
    error: (...a) => calls.push(["notify", "error", ...a]),
    notify: (...a) => calls.push(["notify", "notify", ...a])
  };
  foundry.applications.handlebars.initialize?.();

  // The system, then the module
  const step = async (name, fn) => {
    try {
      await fn();
    } catch ( err ) {
      window.harness.log.push(`${name}: ${err?.stack ?? err}`);
      console.error(name, err);
    }
  };
  await step("import dnd5e", () => import("/systems/dnd5e/dnd5e.mjs"));
  window.harness.systemReady = (Hooks.events?.ready ?? []).length;
  await step("import primal-cr", () => import("/modules/primal-cr/scripts/main.mjs"));
  const fire = async name => {
    for ( const fn of [...(Hooks.events?.[name] ?? [])] ) {
      await step(`hook ${name}`, () => fn.fn ? fn.fn() : fn());
    }
  };
  window.harness.hookNames = Object.keys(Hooks.events ?? {});
  await fire("init");
  await fire("i18nInit");
  await fire("setup");

  // The world's actors: dnd5e's own documents, from plain data
  const Actor5e = CONFIG.Actor.documentClass;
  const actors = new Collection();
  actors.documentName = "Actor";
  actors.documentClass = Actor5e;
  actors.folders = new Collection();
  Object.assign(game, { actors, collections: new Collection([["Actor", actors]]) });
  const files = (new URL(location.href).searchParams.get("data") ?? "").split(",").filter(Boolean);
  const failures = [];
  for ( const file of files ) {
    const list = await (await fetch(`/data/${file}`)).json();
    for ( const data of list ) {
      try {
        const actor = new Actor5e(data);
        // Foundry prepares every document once the world has loaded; here that's now.
        actor.prepareData();
        actors.set(actor.id, actor);
      } catch ( err ) {
        failures.push([data.name, String(err?.stack ?? err).slice(0, 700)]);
      }
    }
  }
  window.harness.failures = failures;
  globalThis.fromUuid = async uuid => {
    const parts = String(uuid).split(".");
    if ( parts[0] === "Actor" ) return actors.get(parts[1]) ?? null;
    return window.harness.documents?.[uuid] ?? null;
  };
  globalThis.fromUuidSync = uuid => actors.get(String(uuid).split(".")[1]) ?? null;

  game.ready = true;
  // dnd5e's own ready steps want compendiums and a server; only the module's are run.
  for ( const fn of [...(Hooks.events?.ready ?? [])].slice(window.harness.systemReady) ) {
    await step("hook ready", () => (fn.fn ? fn.fn() : fn()));
  }
  window.harness.api = game.modules.get("primal-cr").api;
  window.harness.actors = actors;
  window.harness.ready = true;
}
