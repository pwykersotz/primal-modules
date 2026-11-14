/**
 * The Harvest Tables window (GM): a table of components for each creature type, and tables for particular creatures.
 * Rows can be typed in, pasted from the book (one row per line: DC, name and marks in any order), or imported from a
 * JSON file (from this computer, or from Foundry's files); an Item dropped on a row is given instead of a plain
 * component item. Each table has a note (the book's rules for harvesting it), and a type can have a table of random
 * components, typed one row per line. Nothing is kept until Save.
 */
import { MODULE_ID, dnd5eLabel, escapeHTML as e, loc } from "../constants.mjs";
import { CREATURE_TYPES } from "../rules.mjs";
import {
  exportTables, mergeTables, normalizeComponent, normalizeCreature, normalizeTables, normalizeTags, parseRandomRows,
  parseRows, randomRowDC, randomRowText, readImport
} from "../tables.mjs";
import { getRules, getTables, saveTables } from "../store.mjs";
import { tagLabel } from "../harvest.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;

let INSTANCE = null;

/** The name of a linked item, if it can be found. */
function linkedName(uuid) {
  if ( !uuid ) return "";
  try {
    return globalThis.fromUuidSync?.(uuid)?.name ?? uuid;
  } catch {
    return uuid;
  }
}

/** The essences every creature gives by challenge rating, in a line ("Frail (CR 3–6, DC 25), ..."), or "". */
export function essencesText(rules) {
  const list = (rules?.essences ?? []).map(x => loc("Tables.EssenceItem", {
    name: x.name,
    cr: (x.maxCR === null) ? `${x.minCR}+` : `${x.minCR}–${x.maxCR}`,
    dc: x.dc
  }));
  if ( !list.length ) return "";
  return loc("Tables.Essences", { list: list.join(", ") });
}

/**
 * A line under a random table: how many rows it has, the lines that weren't rows, and the components whose DC can't
 * be found on their creature type's table.
 */
export function randomStatus(table, tables, skipped=[]) {
  const rows = table?.rows ?? [];
  const parts = [];
  if ( rows.length ) parts.push(loc("Tables.RandomRows", { n: rows.length, die: Math.max(...rows.map(r => r.max)) }));
  const noDC = rows.filter(r => r.name && (randomRowDC(r, tables) === null)).map(r => r.name);
  if ( noDC.length ) parts.push(loc("Tables.RandomNoDC", { names: [...new Set(noDC)].join(", ") }));
  if ( skipped.length ) parts.push(loc("Tables.RandomSkipped", { lines: skipped.join(" / ") }));
  return parts.join(" ");
}

/**
 * The window's HTML.
 * @param {object} v  { tables, selected, labels, typeLabel(fn), dirty }
 */
export function renderTablesEditor(v) {
  const L = v.labels;
  const t = v.tables;
  const navType = type => {
    const key = `type:${type}`;
    const n = t.types[type]?.length ?? 0;
    return `<li><button type="button" class="ph-nav${v.selected === key ? " active" : ""}" data-action="select" data-key="${e(key)}">
      <span>${e(v.typeLabel(type))}</span><span class="ph-nav-count">${n || ""}</span></button></li>`;
  };
  const navCreature = c => {
    const key = `creature:${c.id}`;
    return `<li><button type="button" class="ph-nav${v.selected === key ? " active" : ""}" data-action="select" data-key="${e(key)}">
      <span>${e(c.name)}</span><span class="ph-nav-count">${c.components.length || ""}</span></button></li>`;
  };
  const types = [...new Set([...CREATURE_TYPES, ...Object.keys(t.types)])];

  const [kind, id] = v.selected.split(":");
  const creature = (kind === "creature") ? t.creatures.find(c => c.id === id) : null;
  const rows = creature ? creature.components : (t.types[id] ?? []);
  const head = creature ? `
      <div class="ph-creature-fields">
        <label class="ph-field"><span>${e(L.creatureName)}</span><input type="text" data-field="creature.name" value="${e(creature.name)}"></label>
        <label class="ph-field"><span>${e(L.aliases)}</span><input type="text" data-field="creature.aliases" value="${e(creature.aliases.join(", "))}" placeholder="${e(L.aliasesHint)}"></label>
        <label class="ph-inline"><input type="checkbox" data-field="creature.useTypeTable"${creature.useTypeTable ? " checked" : ""}> ${e(L.useTypeTable)}</label>
        <button type="button" class="ph-small ph-danger" data-action="deleteCreature"><i class="fa-solid fa-trash" inert></i> ${e(L.deleteCreature)}</button>
      </div>` : `<p class="ph-faint">${e(L.typeHint)}</p>`;
  const body = rows.length ? rows.map((r, i) => `
        <tr data-row="${i}">
          <td><input type="text" data-field="name" value="${e(r.name)}" aria-label="${e(L.name)}"></td>
          <td class="ph-num"><input type="number" data-field="dc" value="${e(r.dc)}" min="0" max="99" aria-label="${e(L.dc)}"></td>
          <td class="ph-tags-cell"><input type="text" data-field="tags" value="${e(r.tags.join(", "))}" aria-label="${e(L.tags)}"
            data-tooltip="${e(r.tags.map(tagLabel).join(", ") || L.tagsHint)}"></td>
          <td class="ph-num"><input type="number" data-field="max" value="${e(r.max ?? "")}" min="1" max="99" placeholder="—" aria-label="${e(L.max)}"></td>
          <td><input type="text" data-field="note" value="${e(r.note)}" aria-label="${e(L.note)}"></td>
          <td class="ph-item-drop${r.uuid ? " linked" : ""}" data-row="${i}" data-tooltip="${e(r.uuid ? r.uuid : L.dropHint)}">
            ${r.uuid ? `<span>${e(linkedName(r.uuid))}</span><button type="button" data-action="unlink" data-row="${i}" aria-label="${e(L.unlink)}"><i class="fa-solid fa-link-slash" inert></i></button>`
              : `<span class="ph-faint">${e(L.dropHere)}</span>`}
          </td>
          <td class="ph-row-buttons">
            <button type="button" data-action="rowUp" data-row="${i}" aria-label="${e(L.up)}"${i === 0 ? " disabled" : ""}><i class="fa-solid fa-chevron-up" inert></i></button>
            <button type="button" data-action="deleteRow" data-row="${i}" aria-label="${e(L.deleteRow)}"><i class="fa-solid fa-xmark" inert></i></button>
          </td>
        </tr>`).join("") : `
        <tr class="ph-empty-row"><td colspan="7">${e(L.noRows)}</td></tr>`;
  const title = creature ? creature.name : v.typeLabel(id);
  const note = creature ? creature.note : (t.notes?.[id] ?? "");
  const noteField = `
    <label class="ph-field ph-table-note"><span>${e(L.tableNote)}</span>
      <textarea data-field="tableNote" rows="${note ? Math.min(6, note.split("\n").length + 1) : 2}" placeholder="${e(L.tableNoteHint)}">${e(note)}</textarea>
    </label>`;
  const random = creature ? null : (t.random?.[id] ?? null);
  const randomField = creature ? "" : `
    <details class="ph-random"${random ? " open" : ""}>
      <summary><i class="fa-solid fa-dice-d20" inert></i> ${e(L.random)}${random ? ` <span class="ph-nav-count">${random.rows.length}</span>` : ""}</summary>
      <p class="hint">${e(L.randomHint)}</p>
      <label class="ph-field"><span>${e(L.randomName)}</span><input type="text" data-field="randomName" value="${e(random?.name ?? "")}" placeholder="${e(L.randomNameHint)}"></label>
      <textarea data-field="random" rows="${random ? Math.min(16, random.rows.length + 1) : 4}" placeholder="1-20 Nothing&#10;21-25 Bone (beast)&#10;26 Horn (dragon) DC 15&#10;97-100 Roll twice more">${e((random?.rows ?? []).map(randomRowText).join("\n"))}</textarea>
      <p class="ph-random-status hint">${e(randomStatus(random, t))}</p>
    </details>`;

  return `
<div class="ph-editor">
  <nav class="ph-editor-nav">
    <h4>${e(L.types)}</h4>
    <ul>${types.map(navType).join("")}</ul>
    <h4>${e(L.creatures)}</h4>
    <ul>${t.creatures.map(navCreature).join("") || `<li class="ph-faint">${e(L.noCreatures)}</li>`}</ul>
    <button type="button" class="ph-small" data-action="newCreature"><i class="fa-solid fa-plus" inert></i> ${e(L.newCreature)}</button>
  </nav>
  <section class="ph-editor-main">
    <div class="ph-editor-title">
      <h3>${e(title)}</h3>
      <div class="ph-editor-tools">
        <button type="button" class="ph-small" data-action="paste"><i class="fa-solid fa-paste" inert></i> ${e(L.paste)}</button>
        <button type="button" class="ph-small" data-action="sortRows"><i class="fa-solid fa-arrow-down-1-9" inert></i> ${e(L.sort)}</button>
      </div>
    </div>
    ${head}
    ${noteField}
    <table class="ph-rows">
      <thead><tr><th>${e(L.name)}</th><th>${e(L.dc)}</th><th>${e(L.tags)}</th><th>${e(L.max)}</th><th>${e(L.note)}</th><th>${e(L.item)}</th><th></th></tr></thead>
      <tbody>${body}
      </tbody>
    </table>
    <button type="button" class="ph-small" data-action="addRow"><i class="fa-solid fa-plus" inert></i> ${e(L.addRow)}</button>
    ${v.essences ? `
    <p class="ph-essence-info"><i class="fa-solid fa-gem" inert></i><span>${e(v.essences)}</span>
      <button type="button" class="ph-small" data-action="openRules">${e(L.editEssences)}</button></p>` : ""}
    ${randomField}
  </section>
  <footer class="ph-editor-foot">
    <button type="button" data-action="import"><i class="fa-solid fa-file-import" inert></i> ${e(L.import)}</button>
    <button type="button" data-action="export"><i class="fa-solid fa-file-export" inert></i> ${e(L.export)}</button>
    <span class="ph-spacer">${v.dirty ? `<span class="ph-dirty">${e(L.unsaved)}</span>` : ""}</span>
    <button type="button" class="ph-go" data-action="save"><i class="fa-solid fa-floppy-disk" inert></i> ${e(L.save)}</button>
  </footer>
</div>`.trim();
}

export class HarvestTablesEditor extends ApplicationV2 {
  /** Open the window, showing one table ("type:ooze" or "creature:<id>"). */
  static openTo(selected) {
    if ( !game.user.isGM ) return null;
    if ( INSTANCE?.rendered ) {
      if ( selected ) INSTANCE.selected = selected;
      INSTANCE.render();
      INSTANCE.bringToFront?.();
      return INSTANCE;
    }
    INSTANCE = new HarvestTablesEditor({}, selected);
    INSTANCE.render({ force: true });
    return INSTANCE;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "primal-harvesting-tables",
    classes: ["primal-harvesting-editor"],
    tag: "div",
    window: {
      title: "PRIMAL_HARVESTING.Tables.Title",
      icon: "fa-solid fa-table-list",
      resizable: true
    },
    position: { width: 940, height: 640 },
    actions: {
      select: HarvestTablesEditor.#onSelect,
      newCreature: HarvestTablesEditor.#onNewCreature,
      deleteCreature: HarvestTablesEditor.#onDeleteCreature,
      addRow: HarvestTablesEditor.#onAddRow,
      deleteRow: HarvestTablesEditor.#onDeleteRow,
      rowUp: HarvestTablesEditor.#onRowUp,
      sortRows: HarvestTablesEditor.#onSortRows,
      unlink: HarvestTablesEditor.#onUnlink,
      paste: HarvestTablesEditor.#onPaste,
      import: HarvestTablesEditor.#onImport,
      export: HarvestTablesEditor.#onExport,
      save: HarvestTablesEditor.#onSave,
      openRules: HarvestTablesEditor.#onOpenRules
    }
  };

  constructor(options={}, selected=null) {
    super(options);
    this.tables = structuredClone(getTables());
    this.selected = selected ?? "type:aberration";
    this.dirty = false;
  }

  /** The rows of the table on show, and its creature table (if it's one). */
  #current() {
    const [kind, id] = this.selected.split(":");
    if ( kind === "creature" ) {
      const creature = this.tables.creatures.find(c => c.id === id);
      if ( creature ) return { creature, rows: creature.components };
      this.selected = "type:aberration";
    }
    const type = (kind === "type") ? id : "aberration";
    this.tables.types[type] ??= [];
    return { creature: null, rows: this.tables.types[type], type };
  }

  #labels() {
    const keys = [
      "types", "creatures", "noCreatures", "newCreature", "creatureName", "aliases", "aliasesHint", "useTypeTable",
      "deleteCreature", "typeHint", "name", "dc", "tags", "tagsHint", "max", "note", "item", "dropHere", "dropHint",
      "unlink", "up", "deleteRow", "noRows", "addRow", "paste", "sort", "import", "export", "save", "unsaved",
      "tableNote", "tableNoteHint", "random", "randomHint", "randomName", "randomNameHint", "editEssences"
    ];
    return Object.fromEntries(keys.map(k => [k, loc(`Tables.${k.charAt(0).toUpperCase()}${k.slice(1)}`)]));
  }

  /** @override */
  async _prepareContext() {
    this.#current();
    return {
      tables: this.tables,
      selected: this.selected,
      dirty: this.dirty,
      labels: this.#labels(),
      typeLabel: type => dnd5eLabel("creatureTypes", type),
      essences: essencesText(getRules())
    };
  }

  /** @override */
  async _renderHTML(context) {
    return renderTablesEditor(context);
  }

  /** @override */
  _replaceHTML(result, content) {
    const scroll = content.querySelector(".ph-editor-main")?.scrollTop ?? 0;
    content.innerHTML = result;
    const main = content.querySelector(".ph-editor-main");
    if ( main ) main.scrollTop = scroll;
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    const root = this.element;
    root.addEventListener("change", this.#onChange.bind(this));
    root.addEventListener("dragover", event => {
      if ( event.target.closest?.(".ph-item-drop") ) event.preventDefault();
    });
    root.addEventListener("drop", this.#onDrop.bind(this));
  }

  /** @override */
  async close(options={}) {
    if ( this.dirty && !options.force ) {
      const discard = await DialogV2.confirm({
        window: { title: loc("Tables.Title") },
        content: `<p>${e(loc("Tables.DiscardText"))}</p>`
      });
      if ( !discard ) return this;
    }
    if ( INSTANCE === this ) INSTANCE = null;
    return super.close(options);
  }

  #onChange(event) {
    const el = event.target;
    const field = el.dataset?.field;
    if ( !field ) return;
    const { creature, rows, type } = this.#current();
    if ( field === "tableNote" ) {
      const text = el.value.replace(/\r\n?/g, "\n").trim();
      if ( creature ) creature.note = text;
      else if ( text ) this.tables.notes[type] = text;
      else delete this.tables.notes[type];
      this.dirty = true;
      this.#markDirty();
      return;
    }
    if ( (field === "random") || (field === "randomName") ) {
      if ( creature ) return;
      const box = el.closest(".ph-random");
      const text = box?.querySelector("[data-field=random]")?.value ?? "";
      const name = (box?.querySelector("[data-field=randomName]")?.value ?? "").trim();
      const { rows: parsed, skipped } = parseRandomRows(text);
      if ( parsed.length ) this.tables.random[type] = { name, rows: parsed };
      else delete this.tables.random[type];
      const status = box?.querySelector(".ph-random-status");
      if ( status ) status.textContent = randomStatus(this.tables.random[type], this.tables, skipped);
      this.dirty = true;
      this.#markDirty();
      return;
    }
    if ( field.startsWith("creature.") ) {
      if ( !creature ) return;
      const key = field.slice(9);
      if ( key === "name" ) creature.name = el.value.trim() || creature.name;
      else if ( key === "aliases" ) creature.aliases = el.value.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
      else if ( key === "useTypeTable" ) creature.useTypeTable = el.checked;
      this.dirty = true;
      if ( key === "name" ) this.render();
      return;
    }
    const index = Number(el.closest("[data-row]")?.dataset.row);
    const row = rows[index];
    if ( !row ) return;
    if ( field === "name" ) row.name = el.value.trim();
    else if ( field === "dc" ) row.dc = Math.max(0, Math.min(99, Math.floor(Number(el.value) || 0)));
    else if ( field === "tags" ) row.tags = normalizeTags(el.value);
    else if ( field === "max" ) row.max = (el.value === "") ? null : Math.max(1, Math.floor(Number(el.value) || 1));
    else if ( field === "note" ) row.note = el.value.trim();
    this.dirty = true;
    if ( field === "tags" ) this.render();
    else this.#markDirty();
  }

  #markDirty() {
    const spacer = this.element?.querySelector(".ph-spacer");
    if ( spacer && !spacer.childElementCount ) spacer.innerHTML = `<span class="ph-dirty">${e(loc("Tables.Unsaved"))}</span>`;
  }

  async #onDrop(event) {
    const cell = event.target.closest?.(".ph-item-drop");
    if ( !cell ) return;
    event.preventDefault();
    let data = null;
    try {
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
      data = TE?.getDragEventData?.(event) ?? JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      data = null;
    }
    if ( (data?.type !== "Item") || !data.uuid ) {
      ui.notifications.warn(loc("Tables.DropOnlyItems"));
      return;
    }
    const { rows } = this.#current();
    const row = rows[Number(cell.dataset.row)];
    if ( !row ) return;
    row.uuid = data.uuid;
    this.dirty = true;
    this.render();
  }

  /* -------------------------------------------- */

  static #onSelect(event, target) {
    this.selected = target.dataset.key;
    this.render();
  }

  static async #onNewCreature() {
    const name = await DialogV2.prompt({
      window: { title: loc("Tables.NewCreature") },
      content: `<label class="ph-field"><span>${e(loc("Tables.CreatureName"))}</span><input type="text" name="name" autofocus></label>`,
      ok: { label: loc("Tables.Create"), callback: (event, button) => button.form.elements.name.value.trim() },
      rejectClose: false
    });
    if ( !name ) return;
    const creature = normalizeCreature({ name, components: [] });
    this.tables.creatures.push(creature);
    this.tables.creatures.sort((a, b) => a.name.localeCompare(b.name));
    this.selected = `creature:${creature.id}`;
    this.dirty = true;
    this.render();
  }

  static async #onDeleteCreature() {
    const { creature } = this.#current();
    if ( !creature ) return;
    const ok = await DialogV2.confirm({
      window: { title: loc("Tables.DeleteCreature") },
      content: `<p>${e(loc("Tables.DeleteCreatureText", { name: creature.name }))}</p>`
    });
    if ( !ok ) return;
    this.tables.creatures = this.tables.creatures.filter(c => c !== creature);
    this.selected = "type:aberration";
    this.dirty = true;
    this.render();
  }

  static #onAddRow() {
    const { rows } = this.#current();
    rows.push(normalizeComponent({ name: loc("Tables.NewComponent"), dc: 5 }));
    this.dirty = true;
    this.render().then(() => {
      const inputs = this.element.querySelectorAll(".ph-rows tbody tr:last-child input[data-field=name]");
      inputs[0]?.select();
    });
  }

  static #onDeleteRow(event, target) {
    const { rows } = this.#current();
    rows.splice(Number(target.dataset.row), 1);
    this.dirty = true;
    this.render();
  }

  static #onRowUp(event, target) {
    const { rows } = this.#current();
    const i = Number(target.dataset.row);
    if ( i <= 0 ) return;
    [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
    this.dirty = true;
    this.render();
  }

  static #onSortRows() {
    const { rows } = this.#current();
    rows.sort((a, b) => (a.dc - b.dc) || a.name.localeCompare(b.name));
    this.dirty = true;
    this.render();
  }

  static #onUnlink(event, target) {
    const { rows } = this.#current();
    const row = rows[Number(target.dataset.row)];
    if ( !row ) return;
    row.uuid = "";
    this.dirty = true;
    this.render();
  }

  /** Rows copied from the book: added to the table on show, or in place of its rows. */
  static async #onPaste() {
    const result = await DialogV2.wait({
      window: { title: loc("Tables.PasteTitle") },
      position: { width: 520 },
      content: `
        <p class="hint">${e(loc("Tables.PasteHint"))}</p>
        <textarea name="rows" rows="12" style="width:100%;font-family:monospace" placeholder="Eye 5 E&#10;Heart 10 E+&#10;Breath sac 15 V"></textarea>`,
      buttons: [
        { action: "add", label: loc("Tables.PasteAdd"), default: true,
          callback: (event, button) => ({ mode: "add", text: button.form.elements.rows.value }) },
        { action: "replace", label: loc("Tables.PasteReplace"),
          callback: (event, button) => ({ mode: "replace", text: button.form.elements.rows.value }) }
      ],
      rejectClose: false
    });
    if ( !result?.text?.trim() ) return;
    const { rows: parsed, skipped } = parseRows(result.text);
    const { rows } = this.#current();
    if ( result.mode === "replace" ) rows.splice(0, rows.length);
    rows.push(...parsed);
    this.dirty = true;
    this.render();
    ui.notifications.info(loc("Tables.PasteDone", { n: parsed.length, skipped: skipped.length }));
    if ( skipped.length ) console.log(`${MODULE_ID} | Lines that weren't rows:\n${skipped.join("\n")}`);
  }

  static async #onImport() {
    const result = await DialogV2.wait({
      window: { title: loc("Tables.ImportTitle") },
      position: { width: 560 },
      content: `
        <p class="hint">${e(loc("Tables.ImportHint"))}</p>
        <div class="form-group"><label>${e(loc("Tables.ImportFoundry"))}</label>
          <div class="form-fields"><file-picker name="path" type="text" placeholder="${e(loc("Tables.ImportFoundryHint"))}"></file-picker></div></div>
        <div class="form-group"><label>${e(loc("Tables.ImportComputer"))}</label>
          <div class="form-fields"><input type="file" name="file" accept=".json,application/json"></div></div>
        <textarea name="json" rows="8" style="width:100%;font-family:monospace" placeholder='{ "types": { "beast": [ { "name": "Hide", "dc": 10 } ] } }'></textarea>`,
      buttons: [
        { action: "merge", label: loc("Tables.ImportMerge"), default: true,
          callback: async (event, button) => ({ mode: "merge", text: await readForm(button.form) }) },
        { action: "replace", label: loc("Tables.ImportReplace"),
          callback: async (event, button) => ({ mode: "replace", text: await readForm(button.form) }) }
      ],
      rejectClose: false
    });
    if ( !result?.text?.trim() ) return;
    if ( result.text.startsWith?.("\u0000error:") ) {
      ui.notifications.error(loc("Tables.ImportFailed", { error: result.text.slice(7) }));
      return;
    }
    try {
      const imported = readImport(result.text);
      const { tables, counts } = mergeTables(this.tables, imported, result.mode);
      this.tables = normalizeTables(tables);
      this.dirty = true;
      this.render();
      ui.notifications.info(loc("Tables.ImportDone", counts));
    } catch (err) {
      ui.notifications.error(loc("Tables.ImportFailed", { error: err.message }));
    }
  }

  static async #onOpenRules() {
    const { HarvestRulesEditor } = await import("./rules-editor.mjs");
    new HarvestRulesEditor().render({ force: true });
  }

  static #onExport() {
    const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
    save(exportTables(this.tables), "application/json", "primal-harvesting-tables.json");
  }

  static async #onSave() {
    await saveTables(this.tables);
    this.tables = structuredClone(getTables());
    this.dirty = false;
    this.render();
    ui.notifications.info(loc("Tables.Saved"));
  }
}

/** The JSON of the import dialog: the file picked from Foundry's files, else the one from this computer, else the text. */
async function readForm(form) {
  const path = String(form.querySelector("file-picker")?.value ?? form.elements.path?.value ?? "").trim();
  if ( path ) {
    try {
      return await fetchText(path);
    } catch (err) {
      return `\u0000error:${err.message}`;
    }
  }
  const file = form.elements.file?.files?.[0];
  if ( file ) return file.text();
  return form.elements.json.value;
}

/** A file in Foundry's files (a path as the file picker gives it), as text. */
export async function fetchText(path) {
  const encoded = /%[0-9a-f]{2}/i.test(path) ? path : encodeURI(path);
  const url = /^(https?:)?\/\//i.test(encoded) ? encoded : (foundry.utils.getRoute?.(encoded) ?? encoded);
  const response = await fetch(url, { cache: "no-store" });
  if ( !response.ok ) throw new Error(`${response.status} ${response.statusText || ""}`.trim() + `: ${path}`);
  return response.text();
}
