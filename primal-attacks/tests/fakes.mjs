/**
 * Small stand-ins for Foundry, dnd5e, Midi-QOL and Dice So Nice: just enough of them for Primal Attacks' roll window
 * field, its rolls and its summary to run under Node.
 *
 * dnd5e's attack roll is modelled as dnd5e builds it: the roll window (answered by globalThis.__rollWindow), then the
 * post-configuration hooks with the built rolls, then every roll is rolled, then the message. Midi-QOL's attack
 * activity calls it as super.rollAttack inside a workflow, as Midi-QOL does.
 */

/** A Foundry Collection: a Map that iterates its values. */
export class Collection extends Map {
  [Symbol.iterator]() {
    return this.values();
  }
  find(fn) {
    for ( const v of this.values() ) if ( fn(v) ) return v;
    return undefined;
  }
  filter(fn) {
    return [...this.values()].filter(fn);
  }
  some(fn) {
    return [...this.values()].some(fn);
  }
}

function getProperty(object, path) {
  return String(path).split(".").reduce((o, k) => (o == null ? undefined : o[k]), object);
}

function setProperty(object, path, value) {
  const keys = String(path).split(".");
  let o = object;
  for ( const k of keys.slice(0, -1) ) o = (o[k] ??= {});
  o[keys.at(-1)] = value;
  return true;
}

let ids = 0;
const newId = prefix => `${prefix}${String(++ids).padStart(16 - prefix.length, "0")}`;

/** Everything the tests can look at afterwards. */
export const log = { calls: [], messages: [], throws: [], workflows: [], warnings: [], updates: [] };

/** Settings by "module.key". */
export const settings = new Map();

/** The d20s to roll next, in order (10 when it runs out). */
const d20s = [];
export function queueD20(...values) {
  d20s.push(...values);
}
export function d20sLeft() {
  return d20s.length;
}

/* -------------------------------------------- */
/*  Rolls                                       */
/* -------------------------------------------- */

/** A Roll: "1d20 + 5", "2d20kh + 5", "1d8 + 3". Damage dice roll their average rounded up (4 on a d8). */
export class Roll {
  constructor(formula, data={}, options={}) {
    this._formula = String(formula);
    this.data = data;
    this.options = options;
    this._evaluated = false;
    this.terms = this._formula.split("+").map(t => t.trim()).filter(Boolean).map(t => {
      const m = t.match(/^(\d+)d(\d+)(kh|kl)?$/);
      return m ? { number: Number(m[1]), faces: Number(m[2]), keep: m[3] ?? null, results: [] } : { value: Number(t) };
    });
  }
  get formula() {
    return this.terms.map(t => (t.faces ? `${t.number}d${t.faces}${t.keep ?? ""}` : String(t.value))).join(" + ");
  }
  async evaluate() {
    if ( this._evaluated ) throw new Error("This Roll has already been evaluated");
    for ( const t of this.terms ) {
      if ( !t.faces ) continue;
      for ( let i = 0; i < t.number; i++ ) {
        const result = t.faces === 20 ? (d20s.shift() ?? 10) : Math.ceil(t.faces / 2);
        t.results.push({ result, active: true });
      }
      if ( t.keep ) {
        const values = t.results.map(r => r.result);
        const kept = t.keep === "kh" ? Math.max(...values) : Math.min(...values);
        let used = false;
        for ( const r of t.results ) {
          r.active = !used && (r.result === kept);
          if ( r.active ) used = true;
        }
      }
    }
    this._evaluated = true;
    return this;
  }
  get dice() {
    return this.terms.filter(t => t.faces).map(t => ({
      faces: t.faces, results: t.results,
      total: t.results.filter(r => r.active).reduce((n, r) => n + r.result, 0)
    }));
  }
  get total() {
    if ( !this._evaluated ) return undefined;
    return this.dice.reduce((n, d) => n + d.total, 0) + this.terms.filter(t => !t.faces).reduce((n, t) => n + t.value, 0);
  }
  toJSON() {
    return { class: this.constructor.name, formula: this.formula, data: this.data, options: this.options,
      terms: this.terms, evaluated: this._evaluated };
  }
  static fromData(data) {
    const Cls = { Roll, D20Roll, DamageRoll }[data.class] ?? Roll;
    const roll = new Cls(data.formula, data.data, { ...data.options, configured: true });
    roll.terms = JSON.parse(JSON.stringify(data.terms));
    roll._evaluated = data.evaluated;
    return roll;
  }
}

/** The dice results Dice So Nice would show (not marked hidden). */
export function visibleDice(rolls) {
  return rolls.flatMap(r => r.dice).flatMap(d => d.results).filter(r => !r.hidden).length;
}

/** As Midi-QOL marks dice it has shown. */
function markHidden(rolls) {
  for ( const r of rolls ) for ( const d of r.terms ) for ( const x of d.results ?? [] ) x.hidden = true;
}

/** Dice So Nice throws dice added to a chat card that aren't marked as shown. */
function cardUpdate(rolls) {
  if ( game.dice3d && visibleDice(rolls) ) log.throws.push({ source: "card", rolls, dice: visibleDice(rolls) });
}

export class D20Roll extends Roll {
  get d20() {
    return this.dice.find(d => d.faces === 20)?.total;
  }
  get isCritical() {
    return this.d20 === 20;
  }
  get isFumble() {
    return this.d20 === 1;
  }
}

export class DamageRoll extends Roll {
  constructor(formula, data={}, options={}) {
    super(formula, data, options);
    // dnd5e doubles a critical hit's dice once, when the roll is configured.
    if ( options.isCritical && !options.configured ) for ( const t of this.terms ) if ( t.faces ) t.number *= 2;
    this.options.configured = true;
  }
}

/* -------------------------------------------- */
/*  Foundry, dnd5e, Dice So Nice                */
/* -------------------------------------------- */

/** Dice So Nice: calls made together (in one go) are one throw. */
function makeDice3d() {
  let batch = null;
  return {
    /** How long a throw takes to land, in milliseconds. */
    animationMs: 0,
    showForRoll(roll, user, synchronize, whisper, blind) {
      if ( !batch ) {
        batch = { source: "showForRoll", rolls: [], dice: 0, whisper, blind, start: Date.now(), end: null };
        log.throws.push(batch);
        const current = batch;
        batch.landed = new Promise(resolve => setTimeout(() => {
          current.end = Date.now();
          resolve(true);
        }, this.animationMs));
        queueMicrotask(() => batch = null);
      }
      batch.rolls.push(roll);
      batch.dice += visibleDice([roll]);
      return batch.landed;
    },
    waitFor3DAnimationByMessageID: async () => true
  };
}

/**
 * Put the stand-ins on globalThis.
 * @param {object} [options]
 * @param {boolean} [options.midi]   Midi-QOL is running.
 * @param {boolean} [options.dice]   Dice So Nice is running.
 */
export function installFoundry({ midi=false, dice=true }={}) {
  for ( const key of Object.keys(log) ) log[key] = [];
  d20s.length = 0;
  const hooks = new Map();
  let hookId = 0;
  const run = (name, args, stopOnFalse) => {
    for ( const [id, fn] of [...(hooks.get(name)?.entries() ?? [])] ) {
      if ( fn.once ) hooks.get(name).delete(id);
      if ( (fn(...args) === false) && stopOnFalse ) return false;
    }
    return true;
  };
  globalThis.Hooks = {
    on(name, fn) {
      if ( !hooks.has(name) ) hooks.set(name, new Map());
      hooks.get(name).set(++hookId, fn);
      return hookId;
    },
    once(name, fn) {
      const id = this.on(name, (...args) => fn(...args));
      hooks.get(name).get(id).once = true;
      return id;
    },
    off(name, id) {
      hooks.get(name)?.delete(id);
    },
    call: (name, ...args) => run(name, args, true),
    callAll: (name, ...args) => run(name, args, false),
    count: name => hooks.get(name)?.size ?? 0
  };
  globalThis.foundry = {
    utils: {
      getProperty,
      setProperty,
      deepClone: x => (x === undefined ? x : JSON.parse(JSON.stringify(x))),
      mergeObject(original, other={}, { inplace=true }={}) {
        const target = inplace ? original : JSON.parse(JSON.stringify(original ?? {}));
        const merge = (a, b) => {
          for ( const [k, v] of Object.entries(b) ) {
            if ( v && (typeof v === "object") && !Array.isArray(v) && a[k] && (typeof a[k] === "object") ) merge(a[k], v);
            else a[k] = v;
          }
          return a;
        };
        return merge(target, other);
      },
      randomID: () => newId("r")
    }
  };
  settings.clear();
  settings.set("primal-attacks.damagePolicy", "hit");
  settings.set("primal-attacks.defeatedTarget", "skip");
  settings.set("primal-attacks.summaryCard", true);
  settings.set("primal-attacks.foldCards", true);
  settings.set("primal-attacks.offerOnAttack", "all");
  settings.set("dnd5e.attackRollVisibility", "none");
  settings.set("core.messageMode", "public");
  const modules = new Map();
  if ( midi ) modules.set("midi-qol", { active: true });
  globalThis.game = {
    user: { id: "user1", isGM: false, targets: new Set() },
    settings: {
      get(module, key) {
        const k = `${module}.${key}`;
        if ( !settings.has(k) ) throw new Error(`no setting ${k}`);
        return settings.get(k);
      }
    },
    modules,
    i18n: {
      localize: key => key,
      format: (key, data) => `${key}${JSON.stringify(data)}`
    },
    combats: [],
    messages: new Collection(),
    dice3d: dice ? makeDice3d() : undefined
  };
  const tokens = new Collection();
  globalThis.canvas = {
    tokens: {
      tokens,
      get: id => tokens.get(id),
      setTargets(list) {
        game.user.targets = new Set(list.map(id => tokens.get(id)).filter(Boolean));
        log.calls.push(["targets", list.join(",")]);
      }
    }
  };
  globalThis.ui = {
    notifications: {
      info: () => ({ update() {} }),
      warn: message => log.warnings.push(message),
      error: message => log.warnings.push(message)
    }
  };
  globalThis.CONFIG = {
    ChatMessage: {},
    DND5E: { damageTypes: { slashing: { label: "Slashing" }, fire: { label: "Fire" } }, activityTypes: { attack: {} } },
    specialStatusEffects: { DEFEATED: "dead" },
    Dice: { BasicRoll: { getMessageMode: () => "public" } }
  };
  class ChatMessage {
    static getSpeaker({ actor }={}) {
      return { alias: actor?.name };
    }
    static getWhisperRecipients() {
      return [{ id: "gm" }];
    }
    static applyMode(data, mode) {
      data.mode = mode;
    }
    static async create(data) {
      const message = {
        id: newId("m"), ...data, flags: data.flags ?? {}, timestamp: Date.now(), isOwner: true,
        getFlag(scope, key) {
          return getProperty(this.flags, `${scope}.${key}`);
        },
        async setFlag(scope, key, value) {
          setProperty(this.flags, `${scope}.${key}`, value);
          log.calls.push(["setFlag", this.id, key, value]);
          return this;
        },
        async unsetFlag(scope, key) {
          delete this.flags?.[scope]?.[key];
          log.calls.push(["unsetFlag", this.id, key]);
          return this;
        }
      };
      message.uuid = `ChatMessage.${message.id}`;
      log.messages.push(message);
      game.messages.set(message.id, message);
      Hooks.callAll("createChatMessage", message);
      // Dice So Nice throws the dice of a new message, all of them together.
      if ( game.dice3d && data.rolls?.length ) log.throws.push({ source: "message", rolls: data.rolls });
      return message;
    }
  }
  globalThis.ChatMessage = ChatMessage;
  CONFIG.ChatMessage.documentClass = ChatMessage;
  globalThis.fromUuidSync = () => null;
  globalThis.HTMLElement ??= class HTMLElement {};
  globalThis.Roll = Roll;
  globalThis.dnd5e = { documents: { activity: { AttackActivity } } };
  CONFIG.DND5E.activityTypes.attack.documentClass = midi ? MidiAttackActivity : AttackActivity;
  if ( midi ) globalThis.MidiQOL = { configSettings: () => ({ autoCheckHit: "all", autoRollDamage: "onHit" }) };
  else delete globalThis.MidiQOL;
  delete globalThis.__rollWindow;
}

/** A token on the canvas, with its creature's AC and HP. */
export function makeToken({ id, name, ac=13, hp=10 }) {
  const token = {
    id, name,
    document: { uuid: `Scene.s.Token.${id}`, hasStatusEffect: () => false },
    actor: { system: { attributes: { ac: { value: ac }, hp: { value: hp, max: 10 } } }, statuses: new Set() }
  };
  canvas.tokens.tokens.set(id, token);
  return token;
}

/** Target these tokens. */
export function target(...tokenIds) {
  game.user.targets = new Set(tokenIds.map(id => canvas.tokens.get(id)).filter(Boolean));
}

/* -------------------------------------------- */
/*  dnd5e's attack activity                     */
/* -------------------------------------------- */

export class AttackActivity {
  constructor(item, def={}) {
    this.id = def.id ?? newId("x");
    this.name = def.name ?? "";
    this.type = "attack";
    this.img = null;
    this.item = item;
    this.actor = item.actor;
    this.uuid = `${this.actor.uuid}.Item.${item.id}.Activity.${this.id}`;
    this.extraDamage = !!def.extraDamage;
    this.otherDamage = !!def.otherDamage;
  }

  async use(usage={}, dialog={}, message={}) {
    log.calls.push(["use", this.item.name, usage]);
    return { message: { id: newId("m") } };
  }

  /** As dnd5e builds an attack roll: window, post-configuration hooks, roll, message, ammunition. */
  async rollAttack(config={}, dialog={}, message={}) {
    const rollConfig = { ...config, hookNames: [...(config.hookNames ?? []), "attack", "d20Test"], subject: this };
    dialog.configure ??= true;
    const targets = [...game.user.targets];
    const only = targets.length === 1 ? targets[0] : null;
    let mode = "normal";
    if ( dialog.configure ) {
      const app = { id: newId("app"), config: rollConfig, element: null };
      Hooks.callAll("renderRollConfigurationDialog", app, null);
      const answer = globalThis.__rollWindow ? globalThis.__rollWindow(app) : { mode: "normal" };
      log.calls.push(["window", this.item.name]);
      if ( !answer ) return null;
      mode = answer.mode ?? "normal";
    }
    const dice = { normal: "1d20", advantage: "2d20kh", disadvantage: "2d20kl" }[mode];
    const ammunition = this.item.system.ammunition ?? undefined;
    const rolls = [new D20Roll(`${dice} + 5`, { mod: 3 }, {
      advantageMode: { normal: 0, advantage: 1, disadvantage: -1 }[mode], target: only?.actor.system.attributes.ac.value,
      attackMode: config.attackMode ?? "oneHanded", ammunition, configured: true
    })];
    for ( const hook of ["dnd5e.postAttackRollConfiguration", "dnd5e.postD20TestRollConfiguration", "dnd5e.postRollConfiguration"] ) {
      if ( Hooks.call(hook, rolls, rollConfig, dialog, message) === false ) return [];
    }
    for ( const roll of rolls ) await roll.evaluate();
    log.calls.push(["attack", this.item.name, rolls.map(r => r.total), targets.map(t => t.id).join(",") || null]);
    if ( message.create !== false ) await ChatMessage.create({ rolls, flags: message.data?.flags ?? {}, type: "attack" });
    if ( ammunition ) {
      const ammo = this.actor.items.get(ammunition);
      await ammo.update({ "system.quantity": ammo.system.quantity - 1 });
    }
    return rolls;
  }

  /** As dnd5e builds a damage roll. */
  async rollDamage(config={}, dialog={}, message={}) {
    const rollConfig = { ...config, hookNames: [...(config.hookNames ?? []), "damage"], subject: this };
    const options = type => ({ type, isCritical: !!config.isCritical });
    // A spell (Scorching Ray, say) does 2d6 fire, and 1d6 more for each level it's cast above its own.
    const spell = this.item.type === "spell" ? `${2 + (Number(this.item.flags?.dnd5e?.scaling) || 0)}d6` : null;
    const rolls = config.other ? [new DamageRoll("4d6", {}, options("fire"))]
      : spell ? [new DamageRoll(spell, {}, options("fire"))]
        : [new DamageRoll("1d8 + 3", {}, options("slashing"))];
    if ( this.extraDamage && !config.other ) rolls.push(new DamageRoll("1d6", {}, options("fire")));
    for ( const hook of ["dnd5e.postDamageRollConfiguration", "dnd5e.postRollConfiguration"] ) {
      if ( Hooks.call(hook, rolls, rollConfig, dialog, message) === false ) return [];
    }
    for ( const roll of rolls ) await roll.evaluate();
    Hooks.callAll("dnd5e.rollDamage", rolls, { subject: this });
    log.calls.push(["damage", this.item.name, rolls.map(r => r.total), !!config.isCritical, message]);
    if ( message.create !== false ) await ChatMessage.create({ rolls, flags: message.data?.flags ?? {}, type: "damage" });
    return rolls;
  }
}

/* -------------------------------------------- */
/*  Midi-QOL's attack activity                  */
/* -------------------------------------------- */

export class MidiAttackActivity extends AttackActivity {
  preTargetingChecks() {
    return true;
  }

  /**
   * Starts a workflow (finished later, as Midi-QOL's are) and returns. A spell cast above its level is used from a
   * copy of the item scaled to that level, as dnd5e does, and the workflow keeps the cast level.
   */
  async use(usage={}, dialog={}, message={}) {
    log.calls.push(["use", this.item.name, usage, this]);
    let activity = this;
    let castData;
    if ( this.item.type === "spell" ) {
      const base = this.item.system.level ?? 0;
      const slot = usage.spell?.slot;
      const level = slot ? Number(String(slot).replace("spell", "")) : base + (Number(this.item.flags?.dnd5e?.scaling) || 0);
      castData = { baseLevel: base, castLevel: level, scaling: level - base };
      if ( level !== base ) {
        const item = { ...this.item, flags: { dnd5e: { scaling: level - base } } };
        activity = Object.assign(Object.create(Object.getPrototypeOf(this)), this, { item });
      }
    }
    // Midi-QOL's card for the attack, posted as it's used.
    const card = await ChatMessage.create({ type: "usage", flags: message.data?.flags ?? {}, content: this.item.name });
    const workflow = {
      chatCard: card,
      id: newId("w"), sequenceId: usage.sequenceId, actor: this.actor, activity, castData,
      workflowOptions: { autoRollAttack: true, ...(usage.midiOptions?.workflowOptions ?? {}) },
      targets: new Set(game.user.targets), hitTargets: new Set(), hitTargetsEC: new Set(), damageRolls: []
    };
    log.workflows.push(workflow);
    setTimeout(() => activity.runWorkflow(workflow).catch(err => console.error(err)), 1);
    return { message: { id: newId("m") }, workflow };
  }

  async runWorkflow(workflow) {
    const rolls = await this.rollAttack({ workflow, midiOptions: {} }, {}, {});
    if ( !rolls?.length ) {
      Hooks.callAll("midi-qol.preAbort", workflow);
      return;
    }
    const roll = workflow.attackRoll;
    for ( const t of workflow.targets ) {
      const ac = t.actor.system.attributes.ac.value;
      if ( roll.isCritical || (!roll.isFumble && (roll.total >= ac)) ) workflow.hitTargets.add(t);
    }
    // As Midi-QOL does: when every target is missed, the workflow waits for the damage button unless it's told to
    // finish (forceCompletion, or Midi-QOL's own auto-complete).
    const allMissed = !workflow.hitTargets.size && workflow.targets.size;
    if ( allMissed && !workflow.workflowOptions.forceCompletion ) {
      workflow.suspended = true;
      log.calls.push(["suspended", this.item.name]);
      return;
    }
    if ( workflow.hitTargets.size ) {
      const show = async rolls => {
        if ( workflow.workflowOptions.damageRollDSN === false ) return;
        await Promise.all(rolls.map(r => game.dice3d?.showForRoll(r)));
        markHidden(rolls);
      };
      const damage = await this.rollDamage({ workflow, isCritical: workflow.isCritical }, { configure: false }, { create: false });
      await show(damage);
      workflow.damageRolls = damage;
      cardUpdate(damage);
      if ( this.otherDamage ) {
        const other = await this.rollDamage({ workflow, other: true }, { configure: false }, { create: false });
        await show(other);
        workflow.otherDamageRolls = other;
        cardUpdate(other);
      }
      const all = [...damage, ...(workflow.otherDamageRolls ?? [])];
      for ( const t of workflow.hitTargets ) t.actor.system.attributes.hp.value -= all.reduce((n, r) => n + r.total, 0);
      // Midi-QOL's HP Updated card, whispered to the GM, with the workflow's flag tags.
      await ChatMessage.create({ type: "hpUpdated", flags: foundry.utils.mergeObject({ "midi-qol": { undoDamage: [] } },
        workflow.flagTags ?? {}) });
    }
    Hooks.callAll("midi-qol.postCleanup", workflow);
  }

  async rollAttack(config={}, dialog={}, message={}) {
    const workflow = config.workflow;
    dialog.configure = !(workflow.workflowOptions.autoFastAttack ?? true);
    message.create = false;
    const rolls = await super.rollAttack(config, dialog, message);
    if ( !rolls?.length ) return null;
    if ( workflow.workflowOptions.attackRollDSN !== false ) {
      await game.dice3d?.showForRoll(rolls[0]);
      markHidden([rolls[0]]);
    }
    workflow.attackRoll = rolls[0];
    cardUpdate([rolls[0]]);
    workflow.attackTotal = rolls[0].total;
    workflow.isCritical = rolls[0].isCritical;
    workflow.isFumble = rolls[0].isFumble;
    return rolls;
  }
}

/* -------------------------------------------- */
/*  Actors                                      */
/* -------------------------------------------- */

/**
 * An actor with items. Each item: {name, type, ammunition, quantity, activities: [{extraDamage}]}.
 * @param {object} data
 */
export function makeActor(data) {
  const midi = CONFIG.DND5E.activityTypes.attack.documentClass === MidiAttackActivity;
  const actor = {
    id: newId("a"),
    name: data.name ?? "Creature",
    type: data.type ?? "character",
    isOwner: true,
    statuses: new Set(),
    flags: {},
    items: new Collection(),
    getActiveTokens: () => [],
    getFlag(scope, key) {
      return getProperty(this.flags, `${scope}.${key}`);
    }
  };
  actor.uuid = `Actor.${actor.id}`;
  for ( const def of data.items ?? [] ) {
    const item = {
      id: def.id ?? newId("i"),
      name: def.name,
      type: def.type ?? "weapon",
      img: `${def.name}.webp`,
      actor,
      flags: {},
      system: {
        quantity: def.quantity ?? 1, ammunition: def.ammunition ?? null, level: def.level, activities: new Collection()
      },
      async update(changes) {
        log.updates.push([this.name, changes]);
        for ( const [path, value] of Object.entries(changes) ) setProperty(this, path, value);
      }
    };
    actor.items.set(item.id, item);
    const Cls = midi ? MidiAttackActivity : AttackActivity;
    for ( const a of def.activities ?? [] ) {
      const activity = new Cls(item, a);
      item.system.activities.set(activity.id, activity);
    }
  }
  return actor;
}

/** The first attack of an actor's item. */
export function attackOf(actor, name) {
  return [...[...actor.items].find(i => i.name === name).system.activities.values()][0];
}

/** Let timers and hooks run until nothing is left to do. */
export async function settle(rounds=60) {
  for ( let i = 0; i < rounds; i++ ) await new Promise(resolve => setTimeout(resolve, 2));
}
