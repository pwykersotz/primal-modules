/**
 * The Harvest Rules window (GM): each creature type's skill and whether it can be ritual carved, each size's harvest
 * time and most helpers, and the essences by challenge rating. Starts from the book's numbers.
 */
import { dnd5eLabel, escapeHTML as e, loc } from "../constants.mjs";
import { RARITIES, SIZES, defaultRules, normalizeRules, worldSkills } from "../rules.mjs";
import { getRules, saveRules } from "../store.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;

/**
 * The window's HTML.
 * @param {object} v  { rules, skills: { key: label }, labels, label(table, key) }
 */
export function renderRulesEditor(v) {
  const L = v.labels;
  const r = v.rules;
  const opt = (value, label, selected) => `<option value="${e(value)}"${selected ? " selected" : ""}>${e(label)}</option>`;
  const skills = Object.entries(v.skills).sort((a, b) => a[1].localeCompare(b[1]));
  const types = Object.entries(r.types).map(([type, t]) => `
      <tr>
        <th>${e(v.label("creatureTypes", type))}</th>
        <td><select name="types.${e(type)}.skill">${skills.map(([s, label]) => opt(s, label, s === t.skill)).join("")}</select></td>
        <td class="ph-center"><input type="checkbox" name="types.${e(type)}.ritual"${t.ritual ? " checked" : ""} aria-label="${e(L.ritual)}"></td>
      </tr>`).join("");
  const sizes = SIZES.map(size => `
      <tr>
        <th>${e(v.label("actorSizes", size))}</th>
        <td class="ph-num"><input type="number" name="sizes.${size}.minutes" value="${e(r.sizes[size].minutes)}" min="0" step="1"></td>
        <td class="ph-num"><input type="number" name="sizes.${size}.helpers" value="${e(r.sizes[size].helpers)}" min="0" max="50" step="1"></td>
      </tr>`).join("");
  const essences = r.essences.map((x, i) => `
      <tr data-row="${i}">
        <td class="ph-essence-name"><input type="text" name="essences.${i}.name" value="${e(x.name)}"></td>
        <td class="ph-num"><input type="number" name="essences.${i}.minCR" value="${e(x.minCR)}" min="0" step="any"></td>
        <td class="ph-num"><input type="number" name="essences.${i}.maxCR" value="${e(x.maxCR ?? "")}" min="0" step="any" placeholder="—"></td>
        <td class="ph-num"><input type="number" name="essences.${i}.dc" value="${e(x.dc)}" min="0" step="1"></td>
        <td class="ph-rarity"><select name="essences.${i}.rarity">${opt("", "—", !x.rarity)}${RARITIES.map(k => opt(k, v.label("itemRarity", k), k === x.rarity)).join("")}</select></td>
        <td class="ph-num ph-price"><input type="number" name="essences.${i}.price" value="${e(x.price ?? "")}" min="0" step="any" placeholder="—"></td>
        <td class="ph-delete"><button type="button" data-action="deleteEssence" data-row="${i}" aria-label="${e(L.delete)}"><i class="fa-solid fa-xmark" inert></i></button></td>
      </tr>`).join("");
  return `
<div class="ph-rules">
  <p class="hint">${e(L.hint)}</p>
  <div class="ph-rules-grid">
    <section>
      <h3>${e(L.typesTitle)}</h3>
      <table class="ph-rows"><thead><tr><th>${e(L.type)}</th><th>${e(L.skill)}</th><th>${e(L.ritual)}</th></tr></thead><tbody>${types}</tbody></table>
      <p class="hint">${e(L.ritualHint)}</p>
    </section>
    <section>
      <h3>${e(L.sizesTitle)}</h3>
      <table class="ph-rows"><thead><tr><th>${e(L.size)}</th><th>${e(L.minutes)}</th><th>${e(L.helpers)}</th></tr></thead><tbody>${sizes}</tbody></table>
      <h3>${e(L.essencesTitle)}</h3>
      <table class="ph-rows"><thead><tr><th>${e(L.essence)}</th><th>${e(L.minCR)}</th><th>${e(L.maxCR)}</th><th>${e(L.dc)}</th><th>${e(L.rarity)}</th><th>${e(L.price)}</th><th></th></tr></thead><tbody>${essences}</tbody></table>
      <button type="button" class="ph-small" data-action="addEssence"><i class="fa-solid fa-plus" inert></i> ${e(L.addEssence)}</button>
      <label class="ph-inline ph-price-per"><span>${e(L.pricePerDC)}</span><input type="number" name="pricePerDC" value="${e(r.pricePerDC)}" min="0" step="any"></label>
      <p class="hint">${e(L.pricePerDCHint)}</p>
      <label class="ph-inline ph-both"><input type="checkbox" name="bothDisadvantage"${r.bothDisadvantage ? " checked" : ""}> ${e(L.both)}</label>
    </section>
  </div>
  <footer class="ph-editor-foot">
    <button type="button" data-action="reset"><i class="fa-solid fa-rotate-left" inert></i> ${e(L.reset)}</button>
    <span class="ph-spacer"></span>
    <button type="button" class="ph-go" data-action="save"><i class="fa-solid fa-floppy-disk" inert></i> ${e(L.save)}</button>
  </footer>
</div>`.trim();
}

export class HarvestRulesEditor extends ApplicationV2 {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "primal-harvesting-rules",
    classes: ["primal-harvesting-editor"],
    tag: "div",
    window: {
      title: "PRIMAL_HARVESTING.Rules.Title",
      icon: "fa-solid fa-scale-balanced",
      resizable: true
    },
    position: { width: 760, height: "auto" },
    actions: {
      addEssence: HarvestRulesEditor.#onAddEssence,
      deleteEssence: HarvestRulesEditor.#onDeleteEssence,
      reset: HarvestRulesEditor.#onReset,
      save: HarvestRulesEditor.#onSave
    }
  };

  constructor(options={}) {
    super(options);
    this.rules = structuredClone(getRules());
  }

  /** @override */
  async _prepareContext() {
    const keys = [
      "hint", "typesTitle", "type", "skill", "ritual", "ritualHint", "sizesTitle", "size", "minutes", "helpers",
      "essencesTitle", "essence", "minCR", "maxCR", "dc", "rarity", "price", "delete", "addEssence", "pricePerDC",
      "pricePerDCHint", "both", "reset", "save"
    ];
    return {
      rules: this.rules,
      skills: worldSkills(),
      labels: Object.fromEntries(keys.map(k => [k, loc(`Rules.${k.charAt(0).toUpperCase()}${k.slice(1)}`)])),
      label: dnd5eLabel
    };
  }

  /** @override */
  async _renderHTML(context) {
    return renderRulesEditor(context);
  }

  /** @override */
  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener("change", event => this.#read(event.target));
  }

  /** Copy one changed field into the working rules. */
  #read(el) {
    const name = el?.name;
    if ( !name ) return;
    const parts = name.split(".");
    const value = (el.type === "checkbox") ? el.checked : el.value;
    if ( parts[0] === "bothDisadvantage" ) this.rules.bothDisadvantage = value;
    else if ( parts[0] === "pricePerDC" ) this.rules.pricePerDC = Number(value) || 0;
    else if ( parts[0] === "types" ) this.rules.types[parts[1]][parts[2]] = value;
    else if ( parts[0] === "sizes" ) this.rules.sizes[parts[1]][parts[2]] = Number(value);
    else if ( parts[0] === "essences" ) {
      const row = this.rules.essences[Number(parts[1])];
      if ( !row ) return;
      if ( parts[2] === "name" || parts[2] === "rarity" ) row[parts[2]] = value;
      else if ( (parts[2] === "maxCR") || (parts[2] === "price") ) row[parts[2]] = (value === "") ? null : Number(value);
      else row[parts[2]] = Number(value);
    }
  }

  static #onAddEssence() {
    const last = this.rules.essences.at(-1);
    const min = last ? (Number(last.maxCR ?? last.minCR) + 1) : 0;
    this.rules.essences.push({ name: loc("Rules.NewEssence"), minCR: min, maxCR: null, dc: (last?.dc ?? 20) + 5, rarity: "", price: null });
    this.render();
  }

  static #onDeleteEssence(event, target) {
    this.rules.essences.splice(Number(target.dataset.row), 1);
    this.render();
  }

  static async #onReset() {
    const ok = await DialogV2.confirm({
      window: { title: loc("Rules.Reset") },
      content: `<p>${e(loc("Rules.ResetText"))}</p>`
    });
    if ( !ok ) return;
    this.rules = defaultRules();
    this.render();
  }

  static async #onSave() {
    for ( const el of this.element.querySelectorAll("input, select") ) this.#read(el);
    await saveRules(normalizeRules(this.rules));
    this.rules = structuredClone(getRules());
    ui.notifications.info(loc("Rules.Saved"));
    this.close();
  }
}
