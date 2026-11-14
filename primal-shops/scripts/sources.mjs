/**
 * Where items come from: the world's Items and every Item compendium. Compendiums are read from their index (with the
 * fields a shop needs), so even big ones load quickly.
 */
import { MODULE_ID } from "./constants.mjs";
import { PHYSICAL_TYPES, snapshotOf } from "./catalog.mjs";

/** The fields a shop list needs from a compendium's index. */
export const INDEX_FIELDS = [
  "type", "img", "folder", "system.type", "system.rarity", "system.rarities", "system.price", "system.properties",
  "system.weight", "system.quantity", "system.source", "system.attunement", "system.container"
];

/** Is this something on its own, not inside a container (the torches in an Explorer's Pack)? */
const loose = i => !i.system?.container;

/** The world's own items, as a source. */
export const WORLD = "world";

/**
 * Every place items can come from: the world's items, then the Item compendiums (the world's own first, then the
 * modules', then the system's).
 * @returns {{id: string, label: string, group: string}[]}
 */
export function itemSources() {
  const order = { world: 0, module: 1, system: 2 };
  const packs = [...(game.packs ?? [])]
    .filter(p => (p.documentName === "Item") && (p.visible !== false || game.user.isGM))
    .map(p => {
      const type = p.metadata?.packageType ?? "world";
      const pkg = (type === "world") ? null : (type === "system" ? game.system : game.modules.get(p.metadata?.packageName));
      const label = pkg?.title && (pkg.title !== p.title) ? `${p.title} (${pkg.title})` : p.title;
      return { id: p.collection, label, group: type, order: order[type] ?? 1 };
    })
    .sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));
  return [{ id: WORLD, label: game.i18n.localize("PRIMAL_SHOPS.Sources.World"), group: "world" }, ...packs];
}

/** Item packs that are surely spells, features or classes, which a name search can skip. */
const NOT_ITEMS = /spell|feat|feature|class|race|species|background|origin|monster|effect|rule|table|subclass/i;

/** Sources worth searching by name by default: the world, and compendiums that look like they hold items. */
export function defaultSearchSources() {
  return itemSources().filter(s => (s.id === WORLD) || !NOT_ITEMS.test(`${s.id} ${s.label}`)).map(s => s.id);
}

const CACHE = new Map();

/**
 * Every physical item in a source, as entries (see catalog.snapshotOf), each with the folder it's in.
 * @param {string} id  WORLD or a compendium's collection id.
 * @param {{fresh?: boolean}} [options]
 * @returns {Promise<{entry: object, folder: string}[]>}
 */
export async function loadSource(id, { fresh=false }={}) {
  if ( !fresh && CACHE.has(id) ) return CACHE.get(id);
  let records = [];
  if ( id === WORLD ) {
    records = [...(game.items ?? [])]
      .filter(i => PHYSICAL_TYPES.includes(i.type) && loose(i))
      .map(i => ({ entry: snapshotOf(i, i.uuid), folder: i.folder?.name ?? "" }));
  } else {
    const pack = game.packs.get(id);
    if ( !pack || (pack.documentName !== "Item") ) return [];
    const index = await pack.getIndex({ fields: INDEX_FIELDS });
    const folders = new Map([...(pack.folders ?? [])].map(f => [f.id, f.name]));
    records = [...index]
      .filter(i => PHYSICAL_TYPES.includes(i.type) && loose(i))
      .map(i => ({ entry: snapshotOf(i, i.uuid ?? `Compendium.${id}.Item.${i._id}`), folder: folders.get(i.folder) ?? "" }));
  }
  records = records.filter(r => r.entry).sort((a, b) => a.entry.name.localeCompare(b.entry.name));
  CACHE.set(id, records);
  return records;
}

/** Forget what's been loaded (the world's items change). */
export function clearSourceCache(id=null) {
  if ( id ) CACHE.delete(id);
  else CACHE.clear();
}

/** Every item in several sources, in the order given. */
export async function loadSources(ids) {
  const out = [];
  for ( const id of ids ) {
    try {
      out.push(...(await loadSource(id)).map(r => r.entry));
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not read ${id}`, err);
    }
  }
  return out;
}

/**
 * The shopkeeper's own items it sells: things you can carry that aren't equipped (a shopkeeper's own sword stays
 * theirs), natural weapons left out.
 * @param {Actor} actor
 * @returns {object[]}  Entries with key "own:<id>", itemId and quantity.
 */
export function ownEntries(actor) {
  const out = [];
  for ( const item of actor?.items ?? [] ) {
    if ( !PHYSICAL_TYPES.includes(item.type) ) continue;
    const s = item.system ?? {};
    if ( s.equipped ) continue;
    if ( (item.type === "weapon") && (s.type?.value === "natural") ) continue;
    const quantity = Math.max(0, Math.floor(Number(s.quantity) || 0));
    if ( !quantity ) continue;
    const entry = snapshotOf(item, item.uuid);
    if ( !entry ) continue;
    out.push({ ...entry, bundle: 1, key: `own:${item.id}`, itemId: item.id, quantity });
  }
  return out;
}

/** An item's description (its HTML, not yet enriched), or "" if it can't be read here. */
export async function descriptionOf(uuid) {
  try {
    const item = await fromUuid(uuid);
    return String(item?.system?.description?.value ?? "");
  } catch {
    return "";
  }
}

/** An item as an entry, from its UUID (null if it isn't an item you can carry, or can't be found). */
export async function entryOf(uuid) {
  try {
    const item = await fromUuid(uuid);
    if ( item?.documentName !== "Item" ) return null;
    return snapshotOf(item, item.uuid);
  } catch {
    return null;
  }
}

/**
 * The items something dropped on the list editor gives: an Item, every item in a Folder (and the folders in it), or
 * every item in a compendium.
 * @param {object} data  The drop's data ({ type, uuid } or { type: "Compendium", collection }).
 * @returns {Promise<{entries: object[], name: string, many: boolean}>}  many: a folder or compendium.
 */
export async function entriesFromDrop(data) {
  if ( !data ) return { entries: [], name: "", many: false };
  if ( (data.type === "Item") && data.uuid ) {
    const entry = await entryOf(data.uuid);
    return { entries: entry ? [entry] : [], name: entry?.name ?? "", many: false };
  }
  if ( (data.type === "Folder") && data.uuid ) {
    const folder = await fromUuid(data.uuid);
    if ( !folder || (folder.type !== "Item") ) return { entries: [], name: "", many: true };
    const ids = new Set([folder, ...(folder.getSubfolders?.(true) ?? [])].map(f => f.id));
    let entries;
    if ( folder.pack ) {
      const pack = game.packs.get(folder.pack);
      const index = pack ? await pack.getIndex({ fields: INDEX_FIELDS }) : [];
      entries = [...index].filter(i => ids.has(i.folder) && loose(i))
        .map(i => snapshotOf(i, i.uuid ?? `Compendium.${pack.collection}.Item.${i._id}`));
    } else {
      entries = [...(game.items ?? [])].filter(i => ids.has(i.folder?.id) && loose(i)).map(i => snapshotOf(i, i.uuid));
    }
    return { entries: entries.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)), name: folder.name, many: true };
  }
  if ( data.type === "Compendium" ) {
    const id = data.collection ?? data.pack ?? data.id;
    const pack = game.packs.get(id);
    if ( pack?.documentName !== "Item" ) return { entries: [], name: pack?.title ?? "", many: true };
    return { entries: (await loadSource(id)).map(r => r.entry), name: pack.title, many: true };
  }
  return { entries: [], name: "", many: false };
}
