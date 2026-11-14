/**
 * The parts of Primal Compendiums that don't touch Foundry: which compendiums go in which directory, in what order,
 * and what a search matches. Kept free of globals so the checks in tests/ can run them in Node.
 */

/**
 * The id of a compendium pack (its collection, "dnd5e.monsters").
 * @param {object} pack
 * @returns {string|undefined}
 */
export function packId(pack) {
  return pack?.collection ?? pack?.metadata?.id;
}

/**
 * The order compendiums appear in Foundry's Compendium sidebar: each folder's subfolders first, then its packs,
 * the way the sidebar draws them.
 * @param {object} tree  game.packs.tree
 * @returns {string[]}   Pack ids in sidebar order.
 */
export function sidebarOrder(tree) {
  const ids = [];
  const visit = node => {
    if ( !node ) return;
    for ( const child of node.children ?? [] ) visit(child);
    for ( const entry of node.entries ?? [] ) {
      const id = packId(entry);
      if ( id ) ids.push(id);
    }
  };
  visit(tree);
  return ids;
}

/**
 * The compendiums to show in one directory: the chosen ones of its document type, in sidebar order.
 * A compendium that no longer exists or holds another type is skipped.
 * @param {object} options
 * @param {Iterable<object>} options.packs    Every pack (game.packs).
 * @param {string} options.documentName      The directory's document type.
 * @param {Iterable<string>} options.chosen  The chosen pack ids.
 * @param {string[]} [options.order]         Pack ids in sidebar order.
 * @returns {object[]}
 */
export function packsFor({ packs, documentName, chosen, order = [] }) {
  const wanted = new Set(chosen ?? []);
  const rank = new Map(order.map((id, i) => [id, i]));
  const list = [];
  for ( const pack of packs ?? [] ) {
    if ( pack?.documentName !== documentName ) continue;
    if ( !wanted.has(packId(pack)) ) continue;
    list.push(pack);
  }
  return list.sort((a, b) => {
    const ra = rank.get(packId(a)) ?? Infinity;
    const rb = rank.get(packId(b)) ?? Infinity;
    if ( ra !== rb ) return ra - rb;
    return String(a.title ?? "").localeCompare(String(b.title ?? ""));
  });
}

/**
 * Every pack of one document type, in sidebar order (for the chooser).
 * @param {Iterable<object>} packs
 * @param {string} documentName
 * @param {string[]} [order]
 * @returns {object[]}
 */
export function packsOfType(packs, documentName, order = []) {
  const all = [];
  for ( const pack of packs ?? [] ) if ( pack?.documentName === documentName ) all.push(packId(pack));
  return packsFor({ packs, documentName, chosen: all, order });
}

/**
 * Turn one compendium on or off in the chosen list.
 * @param {string[]} chosen
 * @param {string} id
 * @param {boolean} on
 * @returns {string[]}  A new list.
 */
export function toggleChoice(chosen, id, on) {
  const list = (chosen ?? []).filter(x => x !== id);
  if ( on ) list.push(id);
  return list;
}

/**
 * Save what a chooser window showed: packs it showed take the ticked state, every other choice is kept.
 * @param {string[]} chosen     The choices before.
 * @param {string[]} shown      The pack ids the window listed.
 * @param {string[]} ticked     The pack ids ticked in the window.
 * @returns {string[]}
 */
export function mergeChoices(chosen, shown, ticked) {
  const shownSet = new Set(shown ?? []);
  const kept = (chosen ?? []).filter(id => !shownSet.has(id));
  const added = (ticked ?? []).filter(id => shownSet.has(id));
  return Array.from(new Set([...kept, ...added]));
}

/**
 * Whether a compendium is opened up in its directory. Remembered per compendium; until it has been opened or
 * closed, it is open when it is the only compendium in the directory.
 * @param {Record<string, boolean>} stored
 * @param {string} id
 * @param {number} count  How many compendiums the directory shows.
 * @returns {boolean}
 */
export function isPackExpanded(stored, id, count) {
  const value = stored?.[id];
  if ( typeof value === "boolean" ) return value;
  return count === 1;
}

/**
 * Count the entries in a folder tree.
 * @param {object} tree
 * @returns {number}
 */
export function countEntries(tree) {
  if ( !tree ) return 0;
  let n = tree.entries?.length ?? 0;
  for ( const child of tree.children ?? [] ) n += countEntries(child);
  return n;
}
