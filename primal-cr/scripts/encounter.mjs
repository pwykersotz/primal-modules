/**
 * The encounter being looked at: who is on each side, where they came from (the sidebar, a compendium, the map),
 * and the reading of each one's sheet. Kept for this GM on this computer between sessions.
 */
import { MODULE_ID, SETTINGS, newId, setting } from "./constants.mjs";
import { isPlayerCharacter, profileOf, xpOf } from "./adapter.mjs";

/**
 * @typedef {object} Entry
 * @property {string} id
 * @property {string} uuid     An Actor's uuid (world or compendium) or a TokenDocument's.
 * @property {number} count    How many (creatures from the sidebar or a compendium).
 */

export class Encounter {
  constructor() {
    /** @type {Entry[]} */
    this.party = [];
    /** @type {Entry[]} */
    this.enemies = [];
    /** Read the party as if rested: full HP, every spell slot and use, no conditions. */
    this.rested = false;
    /** Work it out again whenever someone in it changes. */
    this.live = true;
    /** Whether the party has been filled in (by hand or from the world's characters). */
    this.partyChosen = false;
    /** Loaded documents and profiles, by entry id. */
    this.cache = new Map();
  }

  /* ---------- saving ---------- */

  load() {
    const saved = setting(SETTINGS.encounter) ?? {};
    const clean = list => (Array.isArray(list) ? list : [])
      .filter(e => e && (typeof e.uuid === "string"))
      .map(e => ({ id: e.id ?? newId(), uuid: e.uuid, count: Math.max(1, Math.floor(Number(e.count) || 1)) }));
    this.party = clean(saved.party);
    this.enemies = clean(saved.enemies);
    this.rested = !!saved.rested;
    this.live = saved.live !== false;
    this.partyChosen = !!saved.partyChosen;
    this.cache.clear();
    return this;
  }

  save() {
    const strip = list => list.map(({ id, uuid, count }) => ({ id, uuid, count }));
    return game.settings.set(MODULE_ID, SETTINGS.encounter, {
      party: strip(this.party),
      enemies: strip(this.enemies),
      rested: this.rested,
      live: this.live,
      partyChosen: this.partyChosen
    });
  }

  /* ---------- changing ---------- */

  side(name) {
    return name === "party" ? this.party : this.enemies;
  }

  find(id) {
    for ( const name of ["party", "enemies"] ) {
      const entry = this.side(name).find(e => e.id === id);
      if ( entry ) return { entry, side: name };
    }
    return null;
  }

  /**
   * Add a creature. A second copy of the same sidebar or compendium actor raises the count instead; the same
   * token is never added twice.
   * @param {"party"|"enemies"} side
   * @param {string} uuid
   * @param {number} [count=1]
   */
  add(side, uuid, count = 1) {
    if ( !uuid ) return null;
    const isToken = /(^|\.)Token\.[^.]+$/.test(uuid);
    const other = side === "party" ? this.enemies : this.party;
    const list = this.side(side);
    const existing = list.find(e => e.uuid === uuid);
    if ( existing ) {
      if ( !isToken && (side === "enemies") ) existing.count += count;
      return existing;
    }
    const elsewhere = other.findIndex(e => e.uuid === uuid);
    if ( (elsewhere >= 0) && (isToken || (side === "party")) ) {
      this.cache.delete(other[elsewhere].id);
      other.splice(elsewhere, 1);
    }
    const entry = { id: newId(), uuid, count: Math.max(1, Math.floor(count)) };
    list.push(entry);
    if ( side === "party" ) this.partyChosen = true;
    return entry;
  }

  remove(id) {
    for ( const name of ["party", "enemies"] ) {
      const list = this.side(name);
      const at = list.findIndex(e => e.id === id);
      if ( at < 0 ) continue;
      list.splice(at, 1);
      this.cache.delete(id);
      if ( name === "party" ) this.partyChosen = true;
      return true;
    }
    return false;
  }

  setCount(id, count) {
    const found = this.find(id);
    if ( !found ) return;
    found.entry.count = Math.min(99, Math.max(1, Math.floor(Number(count) || 1)));
  }

  move(id) {
    const found = this.find(id);
    if ( !found ) return;
    const to = found.side === "party" ? "enemies" : "party";
    this.side(found.side).splice(this.side(found.side).indexOf(found.entry), 1);
    this.side(to).push(found.entry);
    this.partyChosen = true;
  }

  clear(side) {
    for ( const name of side ? [side] : ["party", "enemies"] ) {
      for ( const e of this.side(name) ) this.cache.delete(e.id);
      this.side(name).length = 0;
    }
    if ( !side || (side === "party") ) this.partyChosen = true;
  }

  /** Forget what was read from the sheets (all of it, or one actor's), so it's read again. */
  invalidate(actor) {
    if ( !actor ) return this.cache.clear();
    for ( const [id, cached] of this.cache ) {
      if ( (cached.actor === actor) || (cached.actor?.id === actor.id) ) this.cache.delete(id);
    }
  }

  /** Does this actor or token take part? */
  involves(actor) {
    if ( !actor ) return false;
    for ( const cached of this.cache.values() ) {
      if ( (cached.actor === actor) || (cached.actor?.id && (cached.actor.id === actor.id)) ) return true;
    }
    return false;
  }

  /* ---------- the party to start with ---------- */

  /** The world's player characters: dnd5e's primary party if one is set, else each player's own character. */
  static worldParty() {
    const primary = game.actors?.party ?? game.settings.get("dnd5e", "primaryParty")?.actor;
    const members = primary?.system?.playerCharacters ?? primary?.system?.members?.map?.(m => m.actor);
    let actors = (members ?? []).filter(a => a?.type === "character");
    if ( !actors.length ) {
      actors = game.users.filter(u => !u.isGM && u.character).map(u => u.character);
    }
    if ( !actors.length ) {
      actors = game.actors.filter(a => (a.type === "character") && a.hasPlayerOwner);
    }
    return [...new Set(actors)];
  }

  fillParty() {
    for ( const e of this.party ) this.cache.delete(e.id);
    this.party = Encounter.worldParty().map(actor => ({ id: newId(), uuid: actor.uuid, count: 1 }));
    this.partyChosen = true;
  }

  /* ---------- reading ---------- */

  /**
   * Load every entry's document and read its sheet.
   * @returns {Promise<{party: object[], enemies: object[]}>}  Rows with entry, actor, profile, pc, token, missing.
   */
  async read() {
    const out = { party: [], enemies: [] };
    for ( const name of ["party", "enemies"] ) {
      for ( const entry of this.side(name) ) {
        const fresh = name === "party" ? this.rested : false;
        let cached = this.cache.get(entry.id);
        if ( !cached || (cached.fresh !== fresh) ) {
          cached = await this.#load(entry, name, fresh);
          this.cache.set(entry.id, cached);
        }
        out[name].push({ entry, ...cached });
      }
    }
    return out;
  }

  async #load(entry, side, fresh) {
    let document = null;
    try {
      document = await fromUuid(entry.uuid);
    } catch { /* a compendium that's gone, a deleted token */ }
    const token = document?.documentName === "Token" ? document : null;
    const actor = token ? token.actor : (document?.documentName === "Actor" ? document : null);
    if ( !actor ) return { actor: null, token: null, profile: null, missing: true, fresh };
    // Creatures straight from the sidebar or a compendium are read fresh; tokens as they stand.
    const readFresh = fresh || (!token && (side === "enemies") && !actor.isToken && !actor.prototypeToken?.actorLink);
    let profile = null;
    let error = null;
    try {
      profile = profileOf(actor, { fresh: readFresh });
      if ( token?.name ) profile.name = token.name;
    } catch ( err ) {
      console.error(`${MODULE_ID} | Could not read ${actor.name}`, err);
      error = err;
    }
    return { actor, token, profile, missing: false, error, fresh, pc: isPlayerCharacter(actor), xp: xpOf(actor) };
  }
}

/* -------------------------------------------- */
/*  Where creatures come from                   */
/* -------------------------------------------- */

/** Which side a token belongs on, or null to leave it out (neutral bystanders). */
export function sideOfToken(tokenDocument, { strict = false } = {}) {
  const actor = tokenDocument?.actor;
  if ( !actor ) return null;
  if ( actor.hasPlayerOwner ) return "party";
  const d = tokenDocument.disposition;
  const D = CONST.TOKEN_DISPOSITIONS;
  if ( d === D.FRIENDLY ) return "party";
  if ( d === D.HOSTILE ) return "enemies";
  return strict ? null : "enemies";
}

function isOut(tokenDocument) {
  const actor = tokenDocument?.actor;
  if ( !actor ) return true;
  if ( ["group", "vehicle", "encounter"].includes(actor.type) ) return true;
  const defeated = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  if ( actor.statuses?.has?.(defeated) ) return true;
  const hp = actor.system?.attributes?.hp;
  return (actor.type === "npc") && hp && (Number(hp.value) <= 0) && (Number(hp.max) > 0);
}

/**
 * Tokens from the map.
 * @param {"selected"|"scene"|"combat"} from
 * @returns {Array<{uuid: string, side: "party"|"enemies"}>}
 */
export function tokensFromMap(from) {
  let tokens = [];
  let strict = true;
  if ( from === "selected" ) {
    tokens = (canvas?.tokens?.controlled ?? []).map(t => t.document);
    strict = false;
  } else if ( from === "combat" ) {
    const combat = game.combat ?? game.combats?.viewed;
    tokens = (combat?.combatants ?? []).filter(c => !c.defeated).map(c => c.token).filter(Boolean);
    strict = false;
  } else {
    tokens = (canvas?.scene?.tokens ?? []).filter(t => !t.hidden || game.user.isGM);
  }
  const out = [];
  const seen = new Set();
  for ( const token of tokens ) {
    if ( !token || seen.has(token.uuid) || isOut(token) ) continue;
    const side = sideOfToken(token, { strict });
    if ( !side ) continue;
    seen.add(token.uuid);
    out.push({ uuid: token.uuid, side });
  }
  return out;
}

/**
 * The actors a dropped or right-clicked thing stands for.
 * @param {object} data  Drag data: { type: "Actor"|"Folder", uuid }.
 * @returns {Promise<string[]>}  Actor uuids.
 */
export async function actorsFromDrop(data) {
  if ( !data?.uuid ) return [];
  if ( data.type === "Actor" ) return [data.uuid];
  if ( data.type === "Token" ) return [data.uuid];
  if ( data.type !== "Folder" ) return [];
  const folder = await fromUuid(data.uuid);
  if ( !folder || (folder.type !== "Actor") ) return [];
  const folders = [folder, ...(folder.getSubfolders?.(true) ?? [])];
  const ids = new Set(folders.map(f => f.id));
  if ( folder.pack ) {
    const pack = game.packs.get(folder.pack);
    return (pack?.index ?? []).filter(e => ids.has(e.folder)).map(e => e.uuid ?? pack.getUuid(e._id));
  }
  return folders.flatMap(f => f.contents ?? []).filter(a => !["group", "encounter"].includes(a.type)).map(a => a.uuid);
}
