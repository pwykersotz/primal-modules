import { compareRecords, effectiveSort, isFiltering, passes } from "./filter-logic.mjs";

/**
 * What the Compendiums panel shows, worked out from the compendiums' folder trees alone, before anything is drawn.
 *
 * A panel can hold tens of thousands of entries, so the search, the filters and the sort all run here, on plain
 * data, and the panel then draws only the part of the result that is open and on screen.
 *
 * The rules are the ones Foundry's own directories follow:
 * - a search shows an entry whose name matches, and opens the folders and the compendium above it;
 * - a folder whose name matches shows too, with the entries directly in it, and what is above it opens;
 * - filters leave out entries that don't pass, and any folder or compendium left with nothing to show; whatever
 *   still holds entries is opened;
 * - a sort puts entries in order inside each folder; with "Ignore folders" every entry goes in one list instead.
 *
 * @typedef {object} EntryRow
 * @property {object} pack          The compendium, as it was passed in.
 * @property {object} entry         The index entry.
 * @property {object|null} record   Its record, when the filters or the sort needed it.
 *
 * @typedef {object} FolderView
 * @property {object} folder        The folder.
 * @property {string} uuid
 * @property {number} depth
 * @property {object} node          The folder's node in the compendium's tree.
 * @property {FolderView[]} folders The folders in it that show.
 * @property {EntryRow[]} entries   The entries directly in it that show, in order.
 * @property {number} count         How many entries show in it, at any depth.
 * @property {boolean} forced       Whether the search or the filters open it, whatever its own state.
 *
 * @typedef {object} PackView
 * @property {true} isPack
 * @property {object} pack
 * @property {FolderView[]} folders
 * @property {EntryRow[]} entries
 * @property {number} count
 * @property {boolean} forced
 *
 * @typedef {object} PanelView
 * @property {boolean} flat         Whether folders are ignored.
 * @property {PackView[]} packs     The compendiums that show (none when folders are ignored).
 * @property {EntryRow[]} rows      With folders ignored: every entry that shows, in order.
 * @property {number} shown         How many entries show.
 * @property {number} total         How many entries there are.
 */

/**
 * @param {object} options
 * @param {object[]} options.packs     The compendiums, each with its folder tree as `tree` (CompendiumCollection#tree).
 * @param {object} [options.state]     The filter state.
 * @param {((name: string, source: object) => boolean)|null} [options.test]  The search: whether a name matches.
 *                                     Null when nothing is searched for. `source` is the entry or folder named.
 * @param {(pack: object, entry: object) => object|null} [options.recordFor]  An entry's record. Only called when
 *                                     the filters or the sort need more than names.
 * @returns {PanelView}
 */
export function buildView({ packs = [], state = null, test = null, recordFor = null } = {}) {
  const filtering = isFiltering(state);
  const searching = typeof test === "function";
  const flat = !!state?.flat;
  const { sort, desc } = effectiveSort(state);
  const needsRecord = filtering || (!!sort && (sort !== "name"));
  // Names are on the index entries themselves, so a sort by name needs no records.
  const compare = (a, b) => compareRecords(a.record ?? a.entry, b.record ?? b.entry, sort, desc);
  const view = { flat, packs: [], rows: [], shown: 0, total: 0 };

  for ( const pack of packs ?? [] ) {
    if ( !pack ) continue;

    /**
     * @param {object} node          A node of the tree.
     * @param {boolean} nameMatch    Whether the folder itself matched the search (its entries show with it).
     */
    const visit = (node, nameMatch) => {
      const out = { folders: [], entries: [], count: 0, below: false };
      for ( const entry of node?.entries ?? [] ) {
        view.total++;
        if ( searching ) {
          if ( test(entry.name ?? "", entry) ) out.below = true;
          else if ( !nameMatch ) continue;
        }
        const record = needsRecord ? (recordFor?.(pack, entry) ?? null) : null;
        if ( filtering && !passes(state, record) ) continue;
        out.count++;
        (flat ? view.rows : out.entries).push({ pack, entry, record });
      }
      for ( const child of node?.children ?? [] ) {
        const folder = child?.folder;
        if ( !folder ) continue;
        const matched = searching && test(folder.name ?? "", folder);
        const sub = visit(child, matched);
        out.count += sub.count;
        if ( matched || sub.below ) out.below = true;
        const visible = filtering ? sub.count > 0 : (searching ? (matched || sub.below) : true);
        if ( !visible || flat ) continue;
        out.folders.push({
          folder,
          uuid: folder.uuid,
          depth: child.depth ?? 0,
          node: child,
          folders: sub.folders,
          entries: sub.entries,
          count: sub.count,
          forced: filtering ? true : (searching ? sub.below : false)
        });
      }
      if ( sort && !flat && (out.entries.length > 1) ) out.entries.sort(compare);
      return out;
    };

    const root = visit(pack.tree, false);
    view.shown += root.count;
    const visible = filtering ? root.count > 0 : (searching ? root.below : true);
    if ( !visible || flat ) continue;
    view.packs.push({
      isPack: true,
      pack,
      folders: root.folders,
      entries: root.entries,
      count: root.count,
      forced: filtering || searching
    });
  }

  if ( flat && (view.rows.length > 1) ) view.rows.sort(compare);
  return view;
}

/**
 * Every folder under a node of a compendium's tree.
 * @param {object} node
 * @returns {object[]}
 */
export function foldersUnder(node) {
  const found = [];
  const visit = n => {
    for ( const child of n?.children ?? [] ) {
      if ( child?.folder ) found.push(child.folder);
      visit(child);
    }
  };
  visit(node);
  return found;
}
