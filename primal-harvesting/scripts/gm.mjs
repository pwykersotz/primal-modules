/**
 * The GM's side of a harvest. A player can't change a monster's token or (often) another character's inventory, so
 * those changes are asked of the active GM over the module's socket. A GM does them at once. The socket also carries
 * messages to every client (a harvest window opened, so open it everywhere).
 */
import { FLAGS, MODULE_ID, SETTINGS, SOCKET, escapeHTML, loc, newId, setting } from "./constants.mjs";
import { applyOp } from "./session.mjs";

const PENDING = new Map();
const TIMEOUT_MS = 20000;

/** What the GM can be asked to do. */
const HANDLERS = {
  finish: finishHarvest,
  session: changeSession,
  random: storeRandom
};

/** What other clients can tell every client (see broadcast). */
const BROADCASTS = new Map();

/** Listen for a message sent to every client. */
export function onBroadcast(type, fn) {
  BROADCASTS.set(type, fn);
}

/** Tell every other client something. */
export function broadcast(type, data) {
  game.socket?.emit(SOCKET, { kind: "broadcast", type, data, from: game.user.id });
}

/**
 * Does this user need the GM's approval to roll a harvest? Players do, while the harvest window is shared and the
 * GM asks for it (a world setting).
 * @param {User} [user]
 */
export function needsApproval(user=game.user) {
  if ( !user || user.isGM ) return false;
  return (setting(SETTINGS.shareWindow) !== false) && (setting(SETTINGS.requireApproval) !== false);
}

/** Listen for requests (as the GM) and answers (as a player). Called once the game is ready. */
export function registerSocket() {
  game.socket?.on(SOCKET, onMessage);
}

function onMessage(message) {
  if ( !message || (typeof message !== "object") ) return;
  if ( message.kind === "broadcast" ) {
    if ( message.from === game.user.id ) return;
    try {
      BROADCASTS.get(message.type)?.(message.data ?? {}, game.users.get(message.from) ?? null);
    } catch (err) {
      console.error(`${MODULE_ID} | Could not handle ${message.type}`, err);
    }
    return;
  }
  if ( message.kind === "tell" ) {
    if ( !game.user.isGM || !(game.users.activeGM?.isSelf ?? true) ) return;
    const user = game.users.get(message.userId);
    const handler = HANDLERS[message.action];
    if ( !user || !handler ) return;
    Promise.resolve()
      .then(() => handler(message.data ?? {}, user))
      .catch(err => console.warn(`${MODULE_ID} | Could not make ${user.name}'s change`, err));
    return;
  }
  if ( message.kind === "request" ) {
    if ( !game.user.isGM || !(game.users.activeGM?.isSelf ?? true) ) return;
    const user = game.users.get(message.userId);
    const handler = HANDLERS[message.action];
    const reply = data => game.socket.emit(SOCKET, { kind: "response", id: message.id, to: message.userId, ...data });
    if ( !user || !handler ) return reply({ ok: false, error: "Unknown request" });
    Promise.resolve()
      .then(() => handler(message.data ?? {}, user))
      .then(result => reply({ ok: true, result }))
      .catch(err => {
        console.error(`${MODULE_ID} | Could not finish ${user.name}'s harvest`, err);
        reply({ ok: false, error: err?.message ?? String(err) });
      });
    return;
  }
  if ( (message.kind === "response") && (message.to === game.user.id) ) {
    const pending = PENDING.get(message.id);
    if ( !pending ) return;
    PENDING.delete(message.id);
    clearTimeout(pending.timer);
    if ( message.ok ) pending.resolve(message.result);
    else pending.reject(new Error(message.error ?? "The GM could not do it"));
  }
}

/**
 * Do something as the GM: here if this user is a GM, otherwise by asking the active GM.
 * @param {string} action
 * @param {object} data
 * @returns {Promise<any>}
 */
export function runAsGM(action, data) {
  if ( game.user.isGM ) return HANDLERS[action](data, game.user);
  const gm = game.users.activeGM;
  if ( !gm ) return Promise.reject(new Error(loc("Errors.NoGM")));
  const id = newId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      PENDING.delete(id);
      reject(new Error(loc("Errors.GMTimeout")));
    }, TIMEOUT_MS);
    PENDING.set(id, { resolve, reject, timer });
    game.socket.emit(SOCKET, { kind: "request", id, action, data, userId: game.user.id });
  });
}

/**
 * Ask the active GM to do something, without waiting for an answer (a change to a shared harvest window, which
 * every client sees when the token changes). Done here if this user is a GM; nothing if no GM is logged in.
 * @param {string} action
 * @param {object} data
 * @returns {Promise<void>}
 */
export async function tellGM(action, data) {
  if ( game.user.isGM ) {
    await HANDLERS[action](data, game.user);
    return;
  }
  if ( !game.users.activeGM ) return;
  game.socket.emit(SOCKET, { kind: "tell", action, data, userId: game.user.id });
}

/* -------------------------------------------- */
/*  Finishing a harvest                         */
/* -------------------------------------------- */

/**
 * Mark the corpse harvested, put the components in the recipient's inventory, and pass the time.
 * @param {object} data
 * @param {string} data.tokenUuid
 * @param {string|null} data.recipientUuid
 * @param {object[]} data.items           Item specs (see componentItemSpec).
 * @param {object} data.record            What to store on the token.
 * @param {number} data.minutes
 * @param {boolean} [data.again]          Harvest a corpse that's already been harvested (GM only).
 * @param {User} user                     Who's asking.
 * @returns {Promise<{recipient: string|null, added: string[]}>}
 */
export async function finishHarvest(data, user) {
  const tokenDoc = await fromUuid(data.tokenUuid);
  if ( !tokenDoc ) throw new Error(loc("Errors.NoCreature"));
  if ( !user.isGM && !setting(SETTINGS.playersCanHarvest) ) throw new Error(loc("Errors.GMOnly"));
  const existing = tokenDoc.getFlag(MODULE_ID, FLAGS.harvested);
  if ( existing && !(data.again && user.isGM) ) throw new Error(loc("Errors.AlreadyHarvested", { name: tokenDoc.name }));
  if ( needsApproval(user) && !tokenDoc.getFlag(MODULE_ID, FLAGS.session)?.approved ) {
    throw new Error(loc("Errors.NotApproved"));
  }

  let recipient = null;
  let added = [];
  if ( data.recipientUuid && (setting(SETTINGS.addItems) !== false) && data.items?.length ) {
    recipient = await fromUuid(data.recipientUuid);
    if ( recipient?.documentName === "Actor" ) added = await addComponents(recipient, data.items);
    else recipient = null;
  }
  await tokenDoc.setFlag(MODULE_ID, FLAGS.harvested, {
    ...data.record,
    at: Date.now(),
    userId: user.id,
    recipient: recipient?.name ?? null
  });
  await queued(tokenDoc.uuid, async () => {
    if ( tokenDoc.getFlag(MODULE_ID, FLAGS.session) ) await tokenDoc.unsetFlag(MODULE_ID, FLAGS.session);
  });
  broadcast("harvested", { tokenUuid: tokenDoc.uuid, at: tokenDoc.getFlag(MODULE_ID, FLAGS.harvested)?.at ?? null });
  if ( setting(SETTINGS.advanceTime) && (Number(data.minutes) > 0) ) {
    try {
      await game.time.advance(Number(data.minutes) * 60);
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not advance the game clock`, err);
    }
  }
  return { recipient: recipient?.name ?? null, added };
}

/* -------------------------------------------- */
/*  The shared harvest window                   */
/* -------------------------------------------- */

/** Changes waiting to be made, by token: each waits for the one before, so none is lost. */
const QUEUES = new Map();

function queued(key, fn) {
  const before = QUEUES.get(key) ?? Promise.resolve();
  const next = before.catch(() => null).then(fn);
  QUEUES.set(key, next);
  next.finally(() => {
    if ( QUEUES.get(key) === next ) QUEUES.delete(key);
  }).catch(() => null);
  return next;
}

/**
 * Make one change to a corpse's shared harvest window (see session.mjs), kept on its token.
 * @param {{tokenUuid: string, op: object}} data  op.state: the sender's whole session after the change.
 * @param {User} user
 * @returns {Promise<object|null>}  The session after the change.
 */
export async function changeSession(data, user) {
  const tokenDoc = await fromUuid(data.tokenUuid);
  if ( !tokenDoc ) throw new Error(loc("Errors.NoCreature"));
  if ( !user.isGM && !setting(SETTINGS.playersCanHarvest) ) throw new Error(loc("Errors.GMOnly"));
  const op = data.op ?? {};
  return queued(tokenDoc.uuid, async () => {
    const current = tokenDoc.getFlag(MODULE_ID, FLAGS.session) ?? null;
    if ( op.op === "end" ) {
      if ( current ) await tokenDoc.unsetFlag(MODULE_ID, FLAGS.session);
      broadcast("session", { tokenUuid: tokenDoc.uuid, session: null });
      return null;
    }
    // A session is started once, by whoever opened the window first. A change with no session to make it to (the
    // first one was lost) starts one from the sender's window, which has the change in it already.
    let next;
    if ( current && (op.op === "init") ) return current;
    if ( !current && op.state ) next = applyOp(null, { op: "init", state: op.state }, { isGM: user.isGM });
    else next = applyOp(current, op, { isGM: user.isGM });
    await tokenDoc.setFlag(MODULE_ID, FLAGS.session, next);
    // Every window re-draws when the token changes; this tells them too, straight away, in case a client doesn't get
    // the token's change (a hidden token, a scene it isn't on).
    broadcast("session", { tokenUuid: tokenDoc.uuid, session: next });
    return next;
  });
}

/**
 * Keep what a corpse's random components roll gave (the ooze's d100 table), so it's rolled once.
 * @param {{tokenUuid: string, record: object, again?: boolean}} data
 * @param {User} user
 */
export async function storeRandom(data, user) {
  const tokenDoc = await fromUuid(data.tokenUuid);
  if ( !tokenDoc ) throw new Error(loc("Errors.NoCreature"));
  if ( !user.isGM && !setting(SETTINGS.playersCanHarvest) ) throw new Error(loc("Errors.GMOnly"));
  const existing = tokenDoc.getFlag(MODULE_ID, FLAGS.random);
  if ( existing && !(data.again && user.isGM) ) throw new Error(loc("Errors.AlreadyRolled", { name: tokenDoc.name }));
  const record = { ...data.record, at: Date.now(), userId: user.id };
  if ( existing ) await tokenDoc.unsetFlag(MODULE_ID, FLAGS.random);
  await tokenDoc.setFlag(MODULE_ID, FLAGS.random, record);
  return record;
}

/* -------------------------------------------- */
/*  Items                                       */
/* -------------------------------------------- */

/**
 * The item a harvested component becomes.
 * @param {object} c          The component ({ name, tags, note, uuid, essence?, rarity?, price? }).
 * @param {object} creature   { name, type, typeLabel, cr, crLabel, img }
 * @param {object} [labels]   Localized words: { from, tags }.
 * @returns {object}  { key, name, uuid, data }: data is the item to create when there's no uuid.
 */
export function componentItemSpec(c, creature, labels={}) {
  const name = itemName(c, creature);
  const lines = [];
  if ( labels.from ) lines.push(`<p>${escapeHTML(labels.from)}</p>`);
  if ( labels.tags ) lines.push(`<p><em>${escapeHTML(labels.tags)}</em></p>`);
  if ( labels.found ) lines.push(`<p>${escapeHTML(labels.found)}</p>`);
  if ( c.note ) lines.push(`<p>${escapeHTML(c.note)}</p>`);
  const flag = {
    key: name.toLowerCase(),
    component: c.name,
    creature: creature.name,
    type: creature.type,
    cr: creature.cr,
    tags: [...(c.tags ?? [])],
    essence: c.essence ?? null,
    from: c.from ?? null
  };
  const price = Number(c.price);
  const system = {
    type: { value: "material" },
    quantity: 1,
    rarity: c.rarity ?? "",
    description: { value: lines.join("") }
  };
  if ( (c.price !== null) && (c.price !== undefined) && Number.isFinite(price) && (price > 0) ) {
    system.price = { value: price, denomination: "gp" };
  }
  return {
    key: flag.key,
    name,
    uuid: c.uuid || null,
    flag,
    data: {
      name,
      type: "loot",
      img: c.img || creature.img || "icons/svg/item-bag.svg",
      system,
      flags: { [MODULE_ID]: { [FLAGS.component]: flag } }
    }
  };
}

/**
 * The name of a harvested item: the creature's name and the component's ("Owlbear Feather"), unless the component's
 * name already has the creature's in it, comes from the creature's own table, or is an essence. A random component
 * (a bone found in an ooze) is named for the creature type it came from ("Bone (Beast)").
 */
export function itemName(c, creature) {
  if ( c.essence ) return `${c.name} (${creature.name})`;
  if ( c.source === "random" ) return c.fromLabel ? `${c.name} (${c.fromLabel})` : c.name;
  if ( c.source === "creature" ) return c.name;
  const base = String(creature.name ?? "").replace(/\s*\(?#?\d+\)?$/, "").trim();
  if ( !base || c.name.toLowerCase().includes(base.toLowerCase()) ) return c.name;
  return `${base} ${c.name}`;
}

/**
 * Put harvested components in an actor's inventory. A component it already has (same name, harvested before) goes
 * on that stack.
 * @param {Actor} actor
 * @param {object[]} specs  From componentItemSpec.
 * @returns {Promise<string[]>}  The names added, one per component.
 */
export async function addComponents(actor, specs) {
  const counts = new Map();
  for ( const spec of specs ) {
    const entry = counts.get(spec.key) ?? { spec, count: 0 };
    entry.count++;
    counts.set(spec.key, entry);
  }
  const create = [];
  const updates = [];
  for ( const { spec, count } of counts.values() ) {
    const existing = actor.items.find(i => i.getFlag?.(MODULE_ID, FLAGS.component)?.key === spec.key);
    if ( existing ) {
      updates.push({ _id: existing.id, "system.quantity": (Number(existing.system?.quantity) || 0) + count });
      continue;
    }
    let data = spec.data;
    if ( spec.uuid ) {
      try {
        const source = await fromUuid(spec.uuid);
        if ( source?.documentName === "Item" ) {
          data = source.toObject();
          delete data._id;
          data.flags ??= {};
          data.flags[MODULE_ID] = { [FLAGS.component]: spec.flag };
          if ( data.system && ("quantity" in data.system) ) data.system.quantity = Math.max(1, Number(data.system.quantity) || 1);
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | Could not read the linked item ${spec.uuid}`, err);
      }
    }
    data = structuredClone(data);
    if ( data.system ) {
      const each = Number(data.system.quantity) || 1;
      data.system.quantity = each * count;
    }
    create.push(data);
  }
  if ( updates.length ) await actor.updateEmbeddedDocuments("Item", updates);
  if ( create.length ) await actor.createEmbeddedDocuments("Item", create);
  return specs.map(s => s.name);
}
