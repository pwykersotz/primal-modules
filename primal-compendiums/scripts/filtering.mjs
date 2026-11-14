import { loc, sourceLabel } from "./constants.mjs";
import { badgeFor, compareRecords, effectiveSort, isFiltering, passes } from "./filter-logic.mjs";

/**
 * Filtering and sorting a directory list that Foundry drew: the world side of a directory. (The Compendiums side
 * draws its own list from data: see pack-model.mjs and pack-view.mjs.)
 *
 * Nothing is re-drawn: entries that don't pass are hidden with a class (so the directory's own search, which shows
 * and hides entries with inline styles, can't bring them back), folders left with nothing to show are hidden too,
 * the ones that hold matches are opened, and entries are put in order within each folder. Folders keep their
 * place, so the directory still looks like itself.
 *
 * With "Ignore folders" on, every entry is moved to the top of the list instead, in one order, and the folders are
 * hidden. Turning it off again needs the list drawn afresh, which puts the entries back.
 */

/**
 * What a record needs to know about where its data comes from.
 * @param {string} documentName
 * @param {CompendiumCollection} [pack]  For compendium entries: the compendium, for entries that name no source.
 * @returns {object}
 */
export function recordContext(documentName, pack) {
  return {
    documentName,
    config: CONFIG.DND5E ?? {},
    typeLabels: CONFIG[documentName]?.typeLabels ?? {},
    localize: s => game.i18n.localize(s),
    fallbackSource: pack ? packSource(pack) : "",
    labels: { mundane: loc("Filter.Mundane"), custom: loc("Filter.Custom") }
  };
}

/**
 * Where a compendium's entries come from when they don't say: the one source book its package declares for dnd5e,
 * otherwise the package's title. dnd5e itself falls back the same way.
 * @param {CompendiumCollection} pack
 */
export function packSource(pack) {
  const { packageType, packageName } = pack?.metadata ?? {};
  const pkg = packageType === "world" ? game.world : (packageType === "system" ? game.system : game.modules.get(packageName));
  const books = Object.keys(pkg?.flags?.dnd5e?.sourceBooks ?? {});
  if ( books.length === 1 ) return books[0];
  return sourceLabel(pack);
}

/**
 * Filter and sort a drawn directory list.
 *
 * @param {HTMLElement} root                  The directory's list (ol.directory-list).
 * @param {object} options
 * @param {object} options.state              The filter state.
 * @param {(li: HTMLElement) => object|null} options.recordFor   The record for an entry's element.
 * @param {(folder: HTMLElement) => boolean} options.restoreExpanded  Whether a folder is open when nothing is
 *                                            filtered (its own saved state).
 * @param {(li: HTMLElement, record: object|null) => void} [options.decorate]  Called for every entry, to add to it.
 * @returns {{records: object[], shown: number, total: number}}
 */
export function filterList(root, { state, recordFor, restoreExpanded, decorate }) {
  const filtering = isFiltering(state);
  const flat = !!state?.flat;
  const { sort, desc } = effectiveSort(state);
  const compare = (a, b) => compareRecords(byElement.get(a), byElement.get(b), sort, desc);
  const records = [];
  const byElement = new Map();

  // Entries.
  const entries = Array.from(root.querySelectorAll(".directory-item.entry")).filter(li => !li.hidden);
  for ( const li of entries ) {
    let record = null;
    try {
      record = recordFor(li);
    } catch(err) {
      console.warn("primal-compendiums | Could not read an entry for filtering", err);
    }
    if ( record ) records.push(record);
    byElement.set(li, record);
    li.classList.toggle("pcs-out", filtering && !passes(state, record));
    decorate?.(li, record);
  }
  root.classList.toggle("pcs-flat", flat);

  // Ignoring folders: one list, in one order, with every folder (and compendium group) out of sight.
  if ( flat ) {
    const sorted = [...entries].sort(compare);
    // Nothing is moved when the list is already one list in this order (every pass after the first).
    const inRoot = Array.from(root.children).filter(el => el.matches(".directory-item.entry"));
    if ( (inRoot.length !== sorted.length) || sorted.some((li, i) => li !== inRoot[i]) ) {
      const tail = Array.from(root.children).find(el => !el.classList.contains("directory-item")) ?? null;
      for ( const li of sorted ) root.insertBefore(li, tail);
    }
    for ( const folder of root.querySelectorAll(".directory-item.folder") ) folder.classList.add("pcs-out");
    return { records, shown: entries.filter(isShown).length, total: entries.length };
  }

  // The folders that hold something that shows, at any depth: marked upwards from each entry that shows.
  const holding = new Set();
  if ( filtering ) {
    const above = el => el.parentElement?.closest(".directory-item.folder");
    for ( const li of entries ) {
      if ( !isShown(li) ) continue;
      for ( let folder = above(li); folder && !holding.has(folder); folder = above(folder) ) holding.add(folder);
    }
  }

  const folders = root.querySelectorAll(".directory-item.folder");
  for ( const folder of folders ) {
    if ( !filtering ) {
      folder.classList.remove("pcs-out");
      if ( folder.dataset.pcsOpened ) {
        delete folder.dataset.pcsOpened;
        folder.classList.toggle("expanded", !!restoreExpanded?.(folder));
      }
      continue;
    }
    const any = holding.has(folder);
    folder.classList.toggle("pcs-out", !any);
    if ( any && !folder.classList.contains("expanded") ) {
      folder.classList.add("expanded");
      folder.dataset.pcsOpened = "true";
    }
  }

  // Order.
  if ( sort ) {
    const lists = [root, ...root.querySelectorAll("ol.subdirectory")];
    for ( const list of lists ) {
      const items = Array.from(list.children).filter(li => li.matches(".directory-item.entry"));
      if ( items.length < 2 ) continue;
      const sorted = [...items].sort(compare);
      if ( sorted.every((li, i) => li === items[i]) ) continue;
      // Put them back where they were (after the folders, before anything else in the list).
      const next = items.at(-1).nextSibling;
      for ( const li of sorted ) list.insertBefore(li, next);
    }
  }

  const shown = entries.filter(isShown).length;
  return { records, shown, total: entries.length };
}

/** Whether an entry can be seen: not filtered out here, not hidden by a search. */
function isShown(li) {
  return !li.hidden && !li.classList.contains("pcs-out") && (li.style.display !== "none");
}

/**
 * Show an actor's CR (or level) at the end of its entry.
 * @param {HTMLElement} li        The entry's element.
 * @param {object|null} record    Its record.
 */
export function setBadge(li, record) {
  const badge = badgeFor(record);
  let el = li.querySelector(":scope > .pcs-cr");
  if ( !badge ) {
    el?.remove();
    return;
  }
  if ( !el ) {
    el = document.createElement("span");
    el.className = "pcs-cr";
    li.append(el);
  }
  const key = `${badge.kind}:${badge.value}`;
  let text = BADGE_TEXT.get(key);
  if ( text === undefined ) {
    text = loc(badge.kind === "cr" ? "Badge.CR" : "Badge.Level", { value: badge.value });
    BADGE_TEXT.set(key, text);
  }
  if ( el.textContent !== text ) el.textContent = text;
  if ( el.dataset.kind !== badge.kind ) el.dataset.kind = badge.kind;
}

/** The words on each badge ("CR 1/4"), worked out once each. */
const BADGE_TEXT = new Map();
