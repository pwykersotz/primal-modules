/**
 * Small stand-ins for Foundry and dnd5e: just enough of them for Primal Harvesting's window, rolls, cards, GM hand-off
 * and settings to run under Node.
 *
 * - Actors roll skill checks like dnd5e's Actor5e#rollSkill(config, dialog, message): one d20 (two with advantage or
 *   disadvantage) from a queue, plus the ability modifier and the skill's proficiency. Each call is logged.
 * - Settings, flags, items, chat messages and the socket are kept in memory.
 */
import { readFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const LANG = JSON.parse(readFileSync(new URL("../lang/en.json", here), "utf8"));

export const log = { rolls: [], plainRolls: [], messages: [], emitted: [], notifications: [], advanced: 0 };

/* -------------------------------------------- */
/*  Dice                                        */
/* -------------------------------------------- */

const d20s = [];
/** Queue the next d20 results. */
export function queueD20(...values) {
  d20s.push(...values);
}

function nextD20() {
  return d20s.length ? d20s.shift() : 10;
}

export class FakeRoll {
  constructor(dice, mod, options={}) {
    this.mod = mod;
    this.options = options;
    const mode = options.advantageMode ?? 0;
    const kept = mode > 0 ? Math.max(...dice) : (mode < 0 ? Math.min(...dice) : dice[0]);
    this.values = dice;
    const keptAt = dice.indexOf(kept);
    // Like Foundry's: the d20 term, with each die's result and whether it counts.
    this.dice = [{ faces: 20, total: kept, results: dice.map((v, i) => ({ result: v, active: i === keptAt, discarded: i !== keptAt })) }];
    this.total = kept + mod;
    this.formula = `${dice.length > 1 ? `2d20${mode > 0 ? "kh" : "kl"}` : "1d20"} + ${mod}`;
  }

  async render() {
    return `<div class="dice-roll"><div class="dice-formula">${this.formula}</div><h4 class="dice-total">${this.total}</h4></div>`;
  }
}

const dice = [];
/** Queue the next results of plain rolls (new Roll("1d100")). */
export function queueRoll(...values) {
  dice.push(...values);
}

/** A plain roll, like Foundry's Roll: evaluate() takes the next queued result (1 with none). */
export class FakePlainRoll {
  constructor(formula) {
    this.formula = formula;
    this.total = null;
  }

  async evaluate() {
    this.total = dice.length ? dice.shift() : 1;
    log.plainRolls.push({ formula: this.formula, total: this.total });
    return this;
  }

  async render() {
    return `<div class="dice-roll"><div class="dice-formula">${this.formula}</div><h4 class="dice-total">${this.total}</h4></div>`;
  }
}

/* -------------------------------------------- */
/*  Documents                                   */
/* -------------------------------------------- */

const REGISTRY = new Map();
let nextId = 1;

function flagsMixin(doc) {
  doc.flags ??= {};
  doc.getFlag = (scope, key) => doc.flags?.[scope]?.[key];
  doc.setFlag = async (scope, key, value) => {
    doc.flags[scope] ??= {};
    doc.flags[scope][key] = structuredClone(value);
    return doc;
  };
  doc.unsetFlag = async (scope, key) => {
    if ( doc.flags?.[scope] ) delete doc.flags[scope][key];
    return doc;
  };
}

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const SKILL_ABILITY = {
  acr: "dex", ani: "wis", arc: "int", ath: "str", dec: "cha", his: "int", ins: "wis", itm: "cha", inv: "int",
  med: "wis", nat: "int", prc: "wis", prf: "cha", per: "cha", rel: "int", slt: "dex", ste: "dex", sur: "wis"
};

/**
 * An actor.
 * @param {object} p
 * @param {string} p.name
 * @param {string} [p.type]           "character" or "npc"
 * @param {object} [p.abilities]      { int: 16, ... } scores
 * @param {object} [p.skills]         { nat: 1, med: 0.5 } proficiency multipliers
 * @param {number} [p.prof]
 * @param {string} [p.creatureType]
 * @param {string} [p.size]
 * @param {number} [p.cr]
 * @param {number} [p.hp]
 * @param {string|null} [p.casting]   A spellcasting class's ability.
 * @param {boolean} [p.player]        Owned by a player.
 */
export function makeActor({ name, type="character", abilities={}, skills={}, prof=2, creatureType="humanoid", size="med",
  cr=1, hp=10, casting=null, player=type === "character" }={}) {
  const id = `actor${nextId++}`;
  const abil = {};
  for ( const a of ABILITIES ) {
    const value = abilities[a] ?? 10;
    abil[a] = { value, mod: Math.floor((value - 10) / 2) };
  }
  const skillData = {};
  for ( const [s, ability] of Object.entries(SKILL_ABILITY) ) {
    const multiplier = skills[s] ?? 0;
    skillData[s] = {
      ability, value: multiplier, proficient: multiplier,
      prof: { multiplier, flat: Math.floor(multiplier * prof), hasProficiency: multiplier > 0 },
      bonuses: { check: "" }
    };
  }
  const actor = {
    documentName: "Actor",
    id,
    uuid: `Actor.${id}`,
    name,
    type,
    img: `img/${name}.webp`,
    hasPlayerOwner: player,
    isOwner: true,
    statuses: new Set(),
    system: {
      abilities: abil,
      skills: skillData,
      attributes: { prof, hp: { value: hp, max: Math.max(hp, 10) }, spellcasting: casting ?? "" },
      details: { type: { value: creatureType, custom: "" }, cr },
      traits: { size }
    },
    spellcastingClasses: casting ? { wizard: { system: { spellcasting: { ability: casting } } } } : {},
    get spellcastingAbility() {
      return casting ?? "int";
    },
    items: [],
    async rollSkill(config={}, dialog={}, message={}) {
      let ability = config.ability ?? skillData[config.skill]?.ability ?? "int";
      if ( ability === "spellcasting" ) ability = actor.spellcastingAbility;
      const mod = abil[ability].mod + (skillData[config.skill]?.prof.flat ?? 0);
      const mode = (config.advantage && !config.disadvantage) ? 1 : ((config.disadvantage && !config.advantage) ? -1 : 0);
      const dice = mode ? [nextD20(), nextD20()] : [nextD20()];
      const roll = new FakeRoll(dice, mod, { advantageMode: mode });
      log.rolls.push({ actor: actor.name, config: { ...config }, dialog: { ...dialog }, message: { ...message }, ability, total: roll.total });
      if ( message.create !== false ) log.messages.push({ rolls: [roll], content: "" });
      return [roll];
    },
    async createEmbeddedDocuments(kind, data) {
      const made = data.map(d => makeItem(d, actor));
      actor.items.push(...made);
      return made;
    },
    async updateEmbeddedDocuments(kind, updates) {
      for ( const u of updates ) {
        const item = actor.items.find(i => i.id === u._id);
        if ( item && ("system.quantity" in u) ) item.system.quantity = u["system.quantity"];
      }
      return updates;
    },
    getActiveTokens() {
      return actor._tokens ?? [];
    }
  };
  flagsMixin(actor);
  actor.items.find = Array.prototype.find.bind(actor.items);
  REGISTRY.set(actor.uuid, actor);
  return actor;
}

export function makeItem(data, parent=null) {
  const id = `item${nextId++}`;
  const item = { documentName: "Item", id, uuid: parent ? `${parent.uuid}.Item.${id}` : `Item.${id}`, ...structuredClone(data) };
  item.system ??= {};
  item.flags ??= {};
  flagsMixin(item);
  item.toObject = () => {
    const out = structuredClone({ ...item, getFlag: undefined, setFlag: undefined, unsetFlag: undefined, toObject: undefined });
    for ( const k of Object.keys(out) ) if ( out[k] === undefined ) delete out[k];
    out._id = id;
    return out;
  };
  REGISTRY.set(item.uuid, item);
  return item;
}

/** A token of an actor on the scene. */
export function makeToken(actor, { name=actor.name }={}) {
  const id = `token${nextId++}`;
  const token = {
    documentName: "Token",
    id,
    uuid: `Scene.scene1.Token.${id}`,
    name,
    actor,
    baseActor: actor,
    texture: { src: actor.img },
    combatant: null
  };
  flagsMixin(token);
  actor._tokens = [...(actor._tokens ?? []), token];
  REGISTRY.set(token.uuid, token);
  SCENE.tokens.push(token);
  return token;
}

/* -------------------------------------------- */
/*  Applications                                */
/* -------------------------------------------- */

class FakeApplicationV2 {
  static DEFAULT_OPTIONS = {};
  constructor(options={}) {
    this.options = { ...this.constructor.DEFAULT_OPTIONS, ...options };
    this.rendered = false;
    this.element = null;
    this.closed = false;
  }

  async render() {
    const context = await this._prepareContext({});
    const html = await this._renderHTML(context, {});
    if ( !this.element ) {
      this.element = makeElement();
      this._onFirstRender?.(context, {});
    }
    this._replaceHTML(html, this.element.content, {});
    this.lastHTML = html;
    this.rendered = true;
    return this;
  }

  async close() {
    this.rendered = false;
    this.closed = true;
    this._onClose?.({});
    return this;
  }

  bringToFront() {}

  /** Press a button: call its action as ApplicationV2 does. */
  async act(action, dataset={}) {
    const handler = this.options.actions?.[action];
    if ( !handler ) throw new Error(`No action ${action}`);
    const result = await handler.call(this, { preventDefault() {} }, { dataset });
    await settle();
    return result;
  }

  /** Change a field: dispatch a change event to the window's change listener. */
  async change(name, value, { checked }={}) {
    const target = { name, value, checked, type: (checked === undefined) ? "text" : "checkbox", dataset: {} };
    for ( const fn of this.element.listeners.change ?? [] ) await fn({ target });
    await settle();
  }
}

function makeElement() {
  const listeners = {};
  return {
    listeners,
    content: { innerHTML: "", querySelector: () => null },
    addEventListener(type, fn) {
      (listeners[type] ??= []).push(fn);
    },
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

export const dialogAnswers = { confirm: true, prompt: null, wait: null };

/* -------------------------------------------- */
/*  Foundry                                     */
/* -------------------------------------------- */

export const SCENE = { tokens: [] };
const SETTINGS = new Map();
const SOCKET_LISTENERS = new Map();
export const hooks = new Map();

function lookup(path) {
  return path.split(".").reduce((o, k) => (o && (typeof o === "object") ? o[k] : undefined), LANG);
}

/** Every key the module asked to be localized that isn't in the language file. */
export const missingKeys = new Set();

export function users({ gm=true }={}) {
  const gmUser = { id: "gm", name: "GM", isGM: true, isSelf: gm };
  const player = { id: "player", name: "Player", isGM: false, isSelf: !gm, character: null, targets: new Set() };
  return { gmUser, player };
}

/**
 * Put the stand-ins in place.
 * @param {object} [o]
 * @param {boolean} [o.gm]        Is this user the GM?
 * @param {boolean} [o.gmOnline]  Is a GM logged in (for a player)?
 */
export function installFoundry({ gm=true, gmOnline=true }={}) {
  log.rolls.length = 0;
  log.plainRolls.length = 0;
  dice.length = 0;
  log.messages.length = 0;
  log.emitted.length = 0;
  log.notifications.length = 0;
  log.advanced = 0;
  d20s.length = 0;
  SETTINGS.clear();
  SOCKET_LISTENERS.clear();
  hooks.clear();
  SCENE.tokens.length = 0;
  REGISTRY.clear();

  const { gmUser, player } = users({ gm });
  const user = gm ? gmUser : player;
  user.targets = new Set();
  const actors = [];
  const userList = [gmUser, player];

  globalThis.game = {
    user,
    users: Object.assign(userList, {
      get: id => userList.find(u => u.id === id),
      activeGM: (gm || gmOnline) ? gmUser : null
    }),
    actors: Object.assign(actors, { party: null }),
    i18n: {
      localize(key) {
        const value = lookup(key);
        if ( typeof value !== "string" ) {
          if ( key.startsWith("PRIMAL_HARVESTING.") ) missingKeys.add(key);
          return key;
        }
        return value;
      },
      format(key, data={}) {
        return this.localize(key).replace(/\{(\w+)\}/g, (m, k) => (k in data ? String(data[k]) : m));
      }
    },
    settings: {
      register(module, key, config) {
        SETTINGS.set(`${module}.${key}`, { config, value: structuredClone(config.default) });
      },
      registerMenu() {},
      get(module, key) {
        const entry = SETTINGS.get(`${module}.${key}`);
        if ( !entry ) {
          if ( module === "core" ) return key === "messageMode" ? "public" : undefined;
          throw new Error(`Not a setting: ${module}.${key}`);
        }
        return structuredClone(entry.value);
      },
      async set(module, key, value) {
        const entry = SETTINGS.get(`${module}.${key}`);
        if ( !entry ) throw new Error(`Not a setting: ${module}.${key}`);
        if ( (entry.config.scope === "world") && !game.user.isGM ) throw new Error("Players can't change world settings");
        entry.value = structuredClone(value);
        return value;
      }
    },
    socket: {
      on(channel, fn) {
        SOCKET_LISTENERS.set(channel, fn);
      },
      emit(channel, message) {
        log.emitted.push({ channel, message: structuredClone(message) });
      }
    },
    time: {
      worldTime: 0,
      async advance(seconds) {
        log.advanced += seconds;
        this.worldTime += seconds;
      }
    },
    modules: new Map(),
    keybindings: { register() {} }
  };

  globalThis.foundry = {
    utils: {
      randomID: (n=16) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, "x"),
      getProperty(object, path) {
        return path.split(".").reduce((o, k) => (o && (typeof o === "object") ? o[k] : undefined), object);
      },
      debounce: fn => fn,
      saveDataToFile: (data, type, name) => log.messages.push({ saved: name, data })
    },
    applications: {
      api: {
        ApplicationV2: FakeApplicationV2,
        DialogV2: {
          confirm: async () => dialogAnswers.confirm,
          prompt: async () => dialogAnswers.prompt,
          wait: async () => dialogAnswers.wait
        }
      }
    }
  };

  class FakeChatMessage {
    static getSpeaker({ actor }={}) {
      return { actor: actor?.id ?? null, alias: actor?.name ?? null };
    }

    static applyMode(data, mode) {
      data.mode = mode;
      return data;
    }

    static async create(data) {
      log.messages.push(data);
      return data;
    }
  }

  globalThis.CONFIG = {
    ChatMessage: { documentClass: FakeChatMessage },
    Dice: {},
    specialStatusEffects: { DEFEATED: "dead" },
    DND5E: {
      // Like the world this was made for: Custom D&D 5e renames Animal Handling to Artifice.
      skills: Object.fromEntries(Object.keys(SKILL_ABILITY).map(k => [k, { label: {
        ani: "Artifice", arc: "Arcana", dec: "Deception", inv: "Investigation", med: "Medicine", nat: "Nature",
        rel: "Religion", sur: "Survival"
      }[k] ?? k.toUpperCase() }])),
      abilities: {
        str: { label: "Strength" }, dex: { label: "Dexterity" }, con: { label: "Constitution" },
        int: { label: "Intelligence" }, wis: { label: "Wisdom" }, cha: { label: "Charisma" }
      },
      creatureTypes: Object.fromEntries(["aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey",
        "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead"].map(t => [t, { label: t[0].toUpperCase() + t.slice(1) }])),
      actorSizes: { tiny: { label: "Tiny" }, sm: { label: "Small" }, med: { label: "Medium" }, lg: { label: "Large" },
        huge: { label: "Huge" }, grg: { label: "Gargantuan" } },
      itemRarity: { common: "Common", uncommon: "Uncommon", rare: "Rare", veryRare: "Very Rare", legendary: "Legendary", artifact: "Artifact" }
    }
  };

  globalThis.ui = {
    notifications: {
      info: m => log.notifications.push({ type: "info", m }),
      warn: m => log.notifications.push({ type: "warn", m }),
      error: m => log.notifications.push({ type: "error", m })
    }
  };

  globalThis.Hooks = {
    on(name, fn) {
      (hooks.get(name) ?? hooks.set(name, []).get(name)).push(fn);
    },
    once(name, fn) {
      this.on(name, fn);
    },
    callAll(name, ...args) {
      for ( const fn of hooks.get(name) ?? [] ) fn(...args);
    },
    call(name, ...args) {
      for ( const fn of hooks.get(name) ?? [] ) if ( fn(...args) === false ) return false;
      return true;
    }
  };

  globalThis.Roll = FakePlainRoll;
  globalThis.fromUuid = async uuid => REGISTRY.get(uuid) ?? null;
  globalThis.fromUuidSync = uuid => REGISTRY.get(uuid) ?? null;
  globalThis.canvas = { scene: SCENE, tokens: { controlled: [] } };
  globalThis.document = { addEventListener() {} };
}

/** Register the module's settings as main.mjs would. */
export async function registerSettings() {
  const { registerSettings: register } = await import("../scripts/settings.mjs");
  register();
}

/** Deliver a socket message to this client's listener (as if another client sent it). */
export async function deliver(message) {
  const fn = SOCKET_LISTENERS.get("module.primal-harvesting");
  if ( !fn ) throw new Error("No socket listener");
  fn(structuredClone(message));
  await settle();
}

/** Let pending promises run. */
export async function settle(times=5) {
  for ( let i = 0; i < times; i++ ) await new Promise(r => setTimeout(r, 0));
}

/** Flip the current user (keeping everything else). */
export function becomeUser(gm) {
  const user = game.users.find(u => u.isGM === gm);
  for ( const u of game.users ) u.isSelf = (u === user);
  user.targets ??= new Set();
  game.user = user;
  game.users.activeGM = game.users.find(u => u.isGM);
}
