/**
 * A stand-in game for checking Primal Compendiums inside Foundry's real client code.
 *
 * Foundry's own foundry.mjs, CSS, templates and sidebar classes (Sidebar, ActorDirectory, ItemDirectory,
 * SceneDirectory, ApplicationV2, ContextMenu, DragDrop, SearchFilter, the directory tree builder) are loaded as they
 * ship. Only what needs a server is faked: game settings, translations, the user, the world collections and the
 * compendium packs (built on Foundry's DirectoryCollectionMixin, so their folder trees are Foundry's own).
 *
 * The page exposes window.harness for tests/browser/sidebar.test.mjs.
 */

const params = new URL(window.location.href).searchParams;
const isGM = params.get("player") !== "1";
const calls = [];

window.harness = { calls, ready: false, error: null };

window.addEventListener("load", () => boot().catch(err => {
  console.error(err);
  window.harness.error = String(err?.stack ?? err);
}));

/* -------------------------------------------- */

async function boot() {
  // Importing after "load" keeps Foundry's own start-up (which needs a server) from running.
  await import("/scripts/foundry.mjs");
  const { Collection, deepClone, getProperty, mergeObject } = foundry.utils;

  // ---------------------------------------------------------------------------------------------
  // Translations
  // ---------------------------------------------------------------------------------------------
  const core = await (await fetch("/lang/en.json")).json();
  const mine = await (await fetch("/modules/primal-compendiums/lang/en.json")).json();
  const translations = mergeObject(core, mine, { inplace: false });
  const i18n = {
    lang: "en",
    translations,
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
    has: key => typeof getProperty(translations, key) === "string"
  };

  // ---------------------------------------------------------------------------------------------
  // Settings (in memory)
  // ---------------------------------------------------------------------------------------------
  const store = new Map(Object.entries({
    "core.uiConfig": { colorScheme: { interface: "dark", applications: "dark" } },
    "core.collectionSortingModes": {},
    "core.collectionSearchModes": {},
    "core.compendiumConfiguration": {}
  }));
  const registered = new Map();
  const menus = new Map();
  const settings = {
    store,
    registered,
    menus,
    register(ns, key, config) {
      const id = `${ns}.${key}`;
      registered.set(id, config);
      if ( !store.has(id) ) store.set(id, deepClone(config.default));
    },
    registerMenu(ns, key, config) {
      menus.set(`${ns}.${key}`, config);
    },
    get(ns, key) {
      const id = `${ns}.${key}`;
      if ( !store.has(id) ) throw new Error(`Setting ${id} is not registered`);
      return deepClone(store.get(id));
    },
    async set(ns, key, value) {
      const id = `${ns}.${key}`;
      if ( !store.has(id) ) throw new Error(`Setting ${id} is not registered`);
      store.set(id, deepClone(value));
      calls.push(["setting", id, deepClone(value)]);
      registered.get(id)?.onChange?.(deepClone(value));
      return value;
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Collections built on Foundry's own tree code
  // ---------------------------------------------------------------------------------------------
  const DirectoryCollection = foundry.documents.abstract.DirectoryCollectionMixin(Collection);

  const makeFolder = (packId, data) => {
    const uuid = packId ? `Compendium.${packId}.Folder.${data._id}` : `Folder.${data._id}`;
    return {
      _id: data._id,
      id: data._id,
      uuid,
      name: data.name,
      type: data.type,
      folder: data.folder ?? null,
      sort: data.sort ?? 0,
      sorting: data.sorting ?? "a",
      color: data.color ? foundry.utils.Color.from(data.color) : null,
      pack: packId ?? null,
      get expanded() { return !!game.folders._expanded[this.uuid]; },
      toDragData() { return { type: "Folder", uuid: this.uuid }; }
    };
  };

  class FakePack extends DirectoryCollection {
    constructor({ id, type, title, packageType = "module", packageName, locked = true, entries = [], folders = [] }) {
      super();
      this.metadata = { id, type, label: title, packageType, packageName };
      this.locked = locked;
      this.apps = [];
      // Like Foundry's index: only the core fields until getIndex asks for more.
      this.details = new Map(entries.map(e => [e._id, e.system]));
      this.index = new Collection(entries.map(({ system, ...e }) => [e._id, {
        sort: 0, folder: null, ...e, uuid: `Compendium.${id}.${type}.${e._id}`
      }]));
      this.#folders = new Collection(folders.map(f => [f._id, makeFolder(id, { type, ...f })]));
    }
    #folders;
    get collection() { return this.metadata.id; }
    get documentName() { return this.metadata.type; }
    get title() { return this.metadata.label; }
    get banner() { return CONFIG[this.documentName]?.compendiumBanner; }
    get folders() { return this.#folders; }
    get maxFolderDepth() { return super.maxFolderDepth - 1; }
    get visible() { return true; }
    _getVisibleTreeContents() { return this.index.contents; }
    getUuid(id) { return `Compendium.${this.collection}.${this.documentName}.${id}`; }
    render(...args) { calls.push(["packRender", this.collection, args[0]]); }
    async getIndex({ fields = [] } = {}) {
      calls.push(["getIndex", this.collection, [...fields]]);
      await new Promise(r => setTimeout(r, 30));
      for ( const [id, system] of this.details ) {
        if ( !system ) continue;
        const entry = this.index.get(id);
        const picked = {};
        for ( const f of fields ) {
          const v = getProperty({ system }, f);
          if ( v !== undefined ) foundry.utils.setProperty(picked, f, deepClone(v));
        }
        mergeObject(entry, picked);
      }
      return this.index;
    }
    importDialog() { calls.push(["importDialog", this.collection]); }
    async getDocument(id) {
      const entry = this.index.get(id);
      if ( !entry ) return undefined;
      const pack = this;
      return {
        ...entry,
        id,
        pack: this.collection,
        documentName: this.documentName,
        sheet: { render: force => calls.push(["sheet", entry.uuid, force]) },
        deleteDialog: () => calls.push(["deleteDialog", entry.uuid]),
        get compendium() { return pack; }
      };
    }
    testUserPermission() { return true; }
  }

  class FakeWorldCollection extends DirectoryCollection {
    constructor(documentName, docs = [], folders = []) {
      super(docs.map(d => [d._id, {
        system: {}, ...d, id: d._id, folder: d.folder ?? null, sort: d.sort ?? 0, visible: true, thumbnail: d.img,
        toDragData() { return { type: documentName, uuid: `${documentName}.${d._id}` }; }
      }]));
      this._documentName = documentName;
      this.#folders = new Collection(folders.map(f => [f._id, makeFolder(null, { type: documentName, ...f })]));
      this.invalidDocumentIds = new Set();
      this.apps = [];
    }
    #folders;
    get documentName() { return this._documentName; }
    get collection() { return this._documentName; }
    get folders() { return this.#folders; }
    get documentClass() {
      const real = CONFIG[this._documentName].documentClass;
      return { metadata: real.metadata, documentName: this._documentName, canUserCreate: () => isGM };
    }
    get directory() { return ui[{ Actor: "actors", Item: "items", Scene: "scenes" }[this._documentName]]; }
    async importFromCompendium(pack, id, updateData, options) {
      calls.push(["importFromCompendium", this._documentName, pack.collection, id, options]);
    }
    search() { return []; }
  }

  // ---------------------------------------------------------------------------------------------
  // Content
  // ---------------------------------------------------------------------------------------------
  const man = "icons/svg/mystery-man.svg";
  const bag = "icons/svg/item-bag.svg";
  const npc = (cr, type, book = "SRD 5.2") => ({ details: { cr, type: { value: type, subtype: "", swarm: "", custom: "" } },
    source: { book, page: "", custom: "", rules: "2024" } });
  const worldActors = new FakeWorldCollection("Actor", [
    { _id: "wa1", name: "Aria (PC)", img: man, type: "character", system: { details: { level: 5 }, source: {} } },
    { _id: "wa2", name: "Bram (PC)", img: man, type: "character", system: { details: { level: 3 }, source: {} } },
    { _id: "wa3", name: "Town Guard", img: man, folder: "wf1", type: "npc", system: npc(0.125, "humanoid") },
    { _id: "wa4", name: "Zombie", img: man, folder: "wf1", type: "npc", system: npc(0.25, "undead") },
    { _id: "wa5", name: "Young Red Dragon", img: man, folder: "wf1", type: "npc", system: npc(10, "dragon", "XMM") }
  ], [{ _id: "wf1", name: "NPCs" }]);
  const gear = (rarity, book = "SRD 5.2") => ({ rarity, source: { book } });
  const worldItems = new FakeWorldCollection("Item", [
    { _id: "wi1", name: "Rope", img: bag, type: "loot", system: gear("") },
    { _id: "wi2", name: "Potion of Healing", img: bag, type: "consumable", system: gear("common") },
    { _id: "wi3", name: "Flame Tongue", img: bag, type: "weapon", system: gear("rare", "XDMG") },
    { _id: "wi4", name: "Fireball", img: bag, type: "spell", system: { source: { book: "SRD 5.2" } } }
  ]);
  const worldScenes = new FakeWorldCollection("Scene", [{ _id: "ws1", name: "Tavern" }]);

  const monsters = [];
  const letters = "ABCDEFGHIJ";
  const kinds = ["beast", "undead", "dragon", "monstrosity", "fiend"];
  for ( let i = 0; i < 30; i++ ) {
    monsters.push({ _id: `srd${String(i).padStart(13, "0")}`, name: `${letters[i % 10]}-Monster ${i}`, img: man,
      type: "npc", system: npc(i % 12, kinds[i % 5]) });
  }
  monsters.push({ _id: "srdGoblin0000000", name: "Goblin", img: man, type: "npc", system: npc(0.25, "humanoid") });

  const packList = [
    new FakePack({
      id: "dnd5e.monsters", type: "Actor", title: "Monsters (SRD)", packageType: "system", packageName: "dnd5e",
      entries: monsters
    }),
    new FakePack({
      id: "dnd-monster-manual.actors", type: "Actor", title: "Monster Manual", packageName: "dnd-monster-manual",
      folders: [
        { _id: "mmFolderGoblins0", name: "Goblinoids", color: "#3a5f2a" },
        { _id: "mmFolderElite000", name: "Elite", folder: "mmFolderGoblins0" }
      ],
      entries: [
        { _id: "mmGoblinWarrior0", name: "Goblin Warrior", img: man, folder: "mmFolderGoblins0", type: "npc",
          system: npc(0.25, "humanoid", "XMM") },
        { _id: "mmHobgoblin00000", name: "Hobgoblin Captain", img: man, folder: "mmFolderGoblins0", type: "npc",
          system: npc(3, "humanoid", "XMM") },
        { _id: "mmGoblinBoss0000", name: "Goblin Boss", img: man, folder: "mmFolderElite000", type: "npc",
          system: npc(1, "humanoid", "XMM") },
        { _id: "mmAboleth0000000", name: "Aboleth", img: man, type: "npc", system: npc(10, "aberration", "XMM") }
      ]
    }),
    new FakePack({
      id: "world.homebrew", type: "Actor", title: "Homebrew Creatures", packageType: "world", packageName: "test-world",
      locked: false, entries: [{ _id: "hbOoze000000000", name: "Glass Ooze", img: man, type: "npc",
        system: npc(2, "ooze", "") }]
    }),
    new FakePack({
      id: "dnd5e.items", type: "Item", title: "Items (SRD)", packageType: "system", packageName: "dnd5e",
      entries: [
        { _id: "itRope0000000000", name: "Hempen Rope", img: bag, type: "loot", system: gear("") },
        { _id: "itSword000000000", name: "Longsword", img: bag, type: "weapon", system: gear("") },
        { _id: "itFlame000000000", name: "Flame Tongue Longsword", img: bag, type: "weapon", system: gear("rare") },
        { _id: "itCloak000000000", name: "Cloak of Protection", img: bag, type: "equipment", system: gear("uncommon") }
      ]
    }),
    new FakePack({
      id: "world.maps", type: "Scene", title: "Dungeon Maps", packageType: "world", packageName: "test-world",
      entries: [
        { _id: "scCrypt000000000", name: "Forgotten Crypt", thumb: "ui/banners/scene-banner.webp" },
        { _id: "scBridge00000000", name: "Rope Bridge", thumb: "ui/banners/actor-banner.webp" }
      ]
    }),
    new FakePack({
      id: "dnd5e.rules", type: "JournalEntry", title: "Rules (SRD)", packageType: "system", packageName: "dnd5e",
      entries: [{ _id: "jrRules000000000", name: "Conditions" }]
    })
  ];
  // ?stress=20x600 adds 20 big Actor compendiums of 600 monsters each, in A to Z folders, for timing.
  const stressPacks = [];
  const [stressCount, stressSize] = (params.get("stress") ?? "").split("x").map(Number);
  if ( stressCount && stressSize ) {
    const types = ["aberration", "beast", "dragon", "fiend", "humanoid", "monstrosity", "ooze", "undead"];
    const books = ["SRD 5.2", "XMM", "ToB", "CC", "MPMM"];
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for ( let p = 0; p < stressCount; p++ ) {
      const id = `stress.pack${String(p).padStart(2, "0")}`;
      const pid = String(p).padStart(2, "0");
      const folders = Array.from(alphabet, (l, i) => ({ _id: `sf${pid}${String(i).padStart(12, "0")}`, name: l }));
      const entries = [];
      for ( let i = 0; i < stressSize; i++ ) {
        const l = i % 26;
        entries.push({
          _id: `s${pid}${String(i).padStart(13, "0")}`, name: `${alphabet[l]}${alphabet[(i * 7) % 26].toLowerCase()} Creature ${p}-${i}`,
          img: man, type: "npc", folder: folders[l]._id, system: npc((i * 13) % 31, types[(i + p) % 8], books[(i + p) % 5])
        });
      }
      const pack = new FakePack({ id, type: "Actor", title: `Bestiary ${pid}`, packageName: "stress", folders, entries });
      stressPacks.push(pack);
      packList.push(pack);
    }
  }

  const packs = new Collection(packList.map(p => [p.collection, p]));
  // The Compendium sidebar's tree: Monster Manual sits in a folder, so it comes first.
  packs.tree = {
    root: true,
    children: [{ folder: { name: "Bestiaries" }, children: [], entries: [packList[1]] }],
    entries: [packList[0], packList[2], packList[3], packList[4], packList[5], ...stressPacks]
  };

  // ---------------------------------------------------------------------------------------------
  // game and ui
  // ---------------------------------------------------------------------------------------------
  const user = { id: "user1", isGM, name: isGM ? "GM" : "Player", can: () => isGM, hasPermission: () => isGM };
  Object.assign(game, {
    i18n,
    settings,
    user,
    userId: user.id,
    users: new Collection([[user.id, user]]),
    packs,
    folders: { _expanded: {} },
    collections: new Collection([["Actor", worldActors], ["Item", worldItems], ["Scene", worldScenes]]),
    actors: worldActors,
    items: worldItems,
    scenes: worldScenes,
    modules: new Collection([
      ["dnd-monster-manual", { id: "dnd-monster-manual", title: "D&D Monster Manual", active: true }],
      ["primal-compendiums", { id: "primal-compendiums", title: "Primal Compendiums", version: "test", active: true }]
    ]),
    system: { id: "dnd5e", title: "Dungeons & Dragons Fifth Edition" },
    world: { id: "test-world", title: "Test World" },
    socket: {
      emit(event, path, callback) {
        if ( event !== "template" ) return;
        fetch(`/${path}`).then(async r => {
          if ( !r.ok ) return callback({ error: `${r.status} ${path}` });
          callback({ html: await r.text() });
        }).catch(err => callback({ error: String(err) }));
      }
    },
    ready: false
  });
  globalThis._loc = (key, data) => (data ? i18n.format(key, data) : i18n.localize(key));
  CONFIG.DND5E = {
    creatureTypes: Object.fromEntries(["aberration", "beast", "dragon", "fiend", "humanoid", "monstrosity", "ooze",
      "undead"].map(k => [k, { label: k.charAt(0).toUpperCase() + k.slice(1) }])),
    itemRarity: { common: "Common", uncommon: "Uncommon", rare: "Rare", veryRare: "Very Rare", legendary: "Legendary",
      artifact: "Artifact" },
    sourceBooks: { "SRD 5.2": "System Reference Document 5.2" }
  };
  CONFIG.Actor.typeLabels = { character: "Player Character", npc: "Non-Player Character", vehicle: "Vehicle" };
  CONFIG.Item.typeLabels = { consumable: "Consumable", equipment: "Equipment", loot: "Loot", spell: "Spell",
    weapon: "Weapon" };
  for ( const p of packList ) p.initializeTree();
  for ( const c of [worldActors, worldItems, worldScenes] ) c.initializeTree();

  game.tooltip = { activate() {}, deactivate() {}, dismissLockedTooltips() {} };
  ui.notifications = {
    info: (...a) => calls.push(["notify", "info", ...a]),
    warn: (...a) => calls.push(["notify", "warn", ...a]),
    error: (...a) => calls.push(["notify", "error", ...a])
  };
  // Tabs this page doesn't draw.
  const absent = { _canRender: () => false, _toggleNotifications() {}, render() {} };
  for ( const tab of ["chat", "combat", "placeables", "journal", "tables", "cards", "macros", "playlists",
    "compendium", "settings"] ) ui[tab] = absent;

  foundry.applications.handlebars.initialize();

  // ---------------------------------------------------------------------------------------------
  // Start: init, setup, the sidebar, ready (Foundry's order)
  // ---------------------------------------------------------------------------------------------
  await import("/modules/primal-compendiums/scripts/main.mjs");
  Hooks.callAll("init");
  Hooks.callAll("i18nInit");
  Hooks.callAll("setup");

  const tabs = foundry.applications.sidebar.tabs;
  ui.actors = new tabs.ActorDirectory();
  ui.items = new tabs.ItemDirectory();
  ui.scenes = new tabs.SceneDirectory();
  ui.sidebar = new foundry.applications.sidebar.Sidebar();
  await ui.sidebar.render({ force: true });
  // Let the tabs finish rendering.
  for ( let i = 0; i < 50 && !(ui.actors.rendered && ui.items.rendered); i++ ) await new Promise(r => setTimeout(r, 50));
  ui.sidebar.expand();

  game.ready = true;
  Hooks.callAll("ready");

  if ( stressPacks.length ) await settings.set("primal-compendiums", "packs", stressPacks.map(p => p.collection));
  window.harness.ready = true;
  window.harness.packs = packs;
  window.harness.settings = settings;
}
