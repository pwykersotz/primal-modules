/* -------------------------------------------- */
/*  Settings window: token animations           */
/* -------------------------------------------- */

/** Every animation toggle, in the groups the Token animations window shows them in. */
const ANIMATION_GROUPS = [
  { id: "statuses", keys: ["pulse", "motionOutline", "concentrationFx", "coverFog", "charmHearts", "sleepZs", "markedFx", "dodgingFx", "deadSkull", "dyingFx"] },
  { id: "conditions", keys: ["bloodiedFx", "proneFx", "bleedingFx", "poisonedFx", "restrainedFx", "grappledFx", "stunnedFx", "frightenedFx",
    "petrifiedFx", "paralyzedFx", "diseasedFx", "incapacitatedFx", "cursedFx"] },
  { id: "levels", keys: ["contaminationFx", "exhaustionFx", "levelCounters"] },
  { id: "drakkenheim", keys: ["addledFx", "clumsyFx", "enfeebledFx", "sickenedFx", "defenselessFx", "helplessFx",
    "immobilizedFx", "entangledFx", "frozenFx", "shockedFx", "jinxedFx", "valorFx", "burningFx",
    "bewilderedFx", "distractedFx", "staggeredFx", "madnessFx", "dazedFx", "weakenedFx"] },
  { id: "display", keys: ["hideAnimatedIcons"] }
];
const ANIMATION_KEYS = ANIMATION_GROUPS.flatMap(g => g.keys);
const ANIMATION_QUALITIES = ["auto", "full", "reduced", "still"];

/**
 * The GM's animation choices for everyone: each player takes them once, when the GM gives them or
 * the next time they log in, and can change their own again afterwards. Animation quality isn't
 * included: it depends on each player's computer (and their system's reduced-motion setting).
 */
async function applyAnimationDefaults() {
  let defaults, applied;
  try {
    defaults = game.settings.get(MODULE_ID, "animationDefaults");
    applied = Number(game.settings.get(MODULE_ID, "animationDefaultsApplied")) || 0;
  } catch { return; }
  const stamp = Number(defaults?.stamp) || 0;
  const values = defaults?.values;
  if (!stamp || stamp <= applied || !values || typeof values !== "object") return;
  const jobs = [];
  for (const key of ANIMATION_KEYS) {
    if (typeof values[key] === "boolean" && values[key] !== game.settings.get(MODULE_ID, key)) jobs.push(game.settings.set(MODULE_ID, key, values[key]));
  }
  const changed = jobs.length;
  jobs.push(game.settings.set(MODULE_ID, "animationDefaultsApplied", stamp));
  try { await Promise.all(jobs); } catch (err) { console.warn(`${MODULE_ID} | Could not apply the GM's animation choices`, err); return; }
  if (changed && !game.user?.isGM) globalThis.ui?.notifications?.info?.(loc("MIGHTYGUARD.Animations.ApplyToEveryone.Applied"));
}

/** "bleedingFx" → "BleedingFx", the part of its language keys. */
function settingLabel(key) {
  return key[0].toUpperCase() + key.slice(1);
}

/** The settings the Token animations window saves, and who may change them. */
const ANIMATION_WINDOW_FIELDS = {
  animationQuality: { kind: "choice", gm: false },
  soundCues: { kind: "bool", gm: false },
  soundVolume: { kind: "number", gm: false, min: 0, max: 100 },
  pulseSeconds: { kind: "number", gm: true },
  grappleImagePath: { kind: "text", gm: true },
  grappleImageFit: { kind: "number", gm: true },
  deferToOtherModules: { kind: "bool", gm: true },
  ...Object.fromEntries(ANIMATION_KEYS.map(key => [key, { kind: "bool", gm: false }]))
};

/** The value an input in the Token animations window stands for, or undefined if it isn't valid. */
function animationFieldValue(key, input) {
  const field = ANIMATION_WINDOW_FIELDS[key];
  if (!field || !input) return undefined;
  if (field.kind === "bool") return !!input.checked;
  if (field.kind === "text") return String(input.value ?? "").trim();
  if (field.kind === "choice") return ANIMATION_QUALITIES.includes(input.value) ? input.value : undefined;
  const n = Number(input.value);
  if (!Number.isFinite(n)) return undefined;
  return field.max !== undefined ? Math.min(field.max, Math.max(field.min ?? n, n)) : n;
}

/** Save one setting from the window if it changed (and this user may change it). */
async function saveAnimationField(key, input) {
  const field = ANIMATION_WINDOW_FIELDS[key];
  if (!field || (field.gm && !game.user?.isGM)) return false;
  const value = animationFieldValue(key, input);
  if (value === undefined || value === game.settings.get(MODULE_ID, key)) return false;
  await game.settings.set(MODULE_ID, key, value);
  return true;
}

function makeAnimationsConfig() {
  const { ApplicationV2 } = foundry.applications.api;

  /*
   * Every choice is saved the moment it's made (ticked, picked, or a slider let go), so nothing
   * depends on reaching a save button; Done just closes the window. The window never grows taller
   * than the screen: its contents scroll instead.
   */
  return class AnimationsConfig extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: "mighty-guard-animations",
      tag: "form",
      classes: ["mighty-guard-animations"],
      window: { title: "MIGHTYGUARD.Animations.Title", icon: "fas fa-wand-magic-sparkles", contentClasses: ["standard-form"], resizable: true },
      position: { width: 620, height: "auto" },
      form: { handler: AnimationsConfig.onSubmit, closeOnSubmit: true },
      actions: {
        allOn: AnimationsConfig.onAllOn,
        allOff: AnimationsConfig.onAllOff,
        browse: AnimationsConfig.onBrowse,
        testSound: AnimationsConfig.onTestSound,
        giveEveryone: AnimationsConfig.onGiveEveryone
      }
    };

    async _renderHTML() {
      const L = key => escapeHTML(loc(key));
      const get = key => game.settings.get(MODULE_ID, key);
      const box = key => `
        <label class="mg-anim-row" data-tooltip="${escapeHTML(loc(`MIGHTYGUARD.Settings.${settingLabel(key)}.Hint`))}"
               style="display:flex;align-items:center;gap:6px;padding:1px 2px;min-width:0;">
          <input type="checkbox" name="${key}" ${get(key) ? "checked" : ""} style="flex:none;margin:0;">
          <span style="min-width:0;overflow-wrap:anywhere;">${L(`MIGHTYGUARD.Animations.Key.${key}`)}</span>
        </label>`;
      const quality = settingValue("animationQuality") ?? "auto";
      const qualityRow = `
        <div class="form-group mg-anim-quality" data-tooltip="${escapeHTML(loc("MIGHTYGUARD.Settings.AnimationQuality.Hint"))}" style="margin:0 0 4px;min-width:0;">
          <label style="min-width:0;overflow-wrap:anywhere;">${L("MIGHTYGUARD.Settings.AnimationQuality.Name")}</label>
          <div class="form-fields" style="min-width:0;"><select name="animationQuality" style="min-width:0;max-width:100%;">${ANIMATION_QUALITIES.map(q =>
            `<option value="${q}" ${q === quality ? "selected" : ""}>${L(`MIGHTYGUARD.Settings.AnimationQuality.${q}`)}</option>`).join("")}</select></div>
        </div>`;
      const volume = Number(get("soundVolume")) || 0;
      const soundRow = `
        <div class="mg-anim-sound" style="display:flex;align-items:center;gap:8px;">
          <label class="mg-anim-row" data-tooltip="${escapeHTML(loc("MIGHTYGUARD.Settings.SoundCues.Hint"))}" style="display:flex;align-items:center;gap:6px;padding:1px 2px;flex:1 1 auto;min-width:0;">
            <input type="checkbox" name="soundCues" ${get("soundCues") ? "checked" : ""} style="flex:none;margin:0;">
            <span style="min-width:0;overflow-wrap:anywhere;">${L("MIGHTYGUARD.Settings.SoundCues.Name")}</span>
          </label>
          <input type="range" name="soundVolume" min="0" max="100" step="5" value="${volume}" aria-label="${L("MIGHTYGUARD.Settings.SoundVolume.Name")}"
                 data-tooltip="${L("MIGHTYGUARD.Settings.SoundVolume.Name")}" style="flex:0 0 110px;">
          <span class="mg-range-value" style="flex:0 0 2.2em;text-align:right;">${volume}</span>
          <button type="button" data-action="testSound" style="flex:0 0 auto;width:auto;" data-tooltip="${L("MIGHTYGUARD.Animations.TestSound")}" aria-label="${L("MIGHTYGUARD.Animations.TestSound")}"><i class="fas fa-volume-high"></i></button>
        </div>`;
      const groups = ANIMATION_GROUPS.map(g => `
        <fieldset class="mg-anim-group" data-group="${g.id}" style="margin:0 0 8px;padding:4px 8px 6px;min-width:0;">
          <legend>${L(`MIGHTYGUARD.Animations.Group.${g.id}`)}</legend>
          ${g.id === "display" ? qualityRow : ""}
          <div class="mg-anim-grid" style="display:grid;grid-template-columns:${g.keys.length > 1 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)"};grid-template-rows:repeat(${Math.ceil(g.keys.length / (g.keys.length > 1 ? 2 : 1))}, auto);grid-auto-flow:column;gap:1px 12px;">${[...g.keys].sort(byName(key => loc(`MIGHTYGUARD.Animations.Key.${key}`))).map(box).join("")}</div>
          ${g.id === "display" ? soundRow : ""}
        </fieldset>`).join("");
      const range = (key, min, max, step) => `
        <div class="form-group" style="min-width:0;">
          <label style="min-width:0;overflow-wrap:anywhere;">${L(`MIGHTYGUARD.Settings.${key === "grappleImageFit" ? "GrappleImageScale" : settingLabel(key)}.Name`)}</label>
          <div class="form-fields">
            <input type="range" name="${key}" min="${min}" max="${max}" step="${step}" value="${escapeHTML(get(key))}">
            <span class="mg-range-value" style="flex:0 0 3em;text-align:right;">${escapeHTML(get(key))}</span>
          </div>
        </div>`;
      const shared = game.user?.isGM ? `
        <fieldset class="mg-anim-group" data-group="shared" style="margin:0 0 8px;padding:4px 8px 6px;min-width:0;">
          <legend>${L("MIGHTYGUARD.Animations.Group.shared")}</legend>
          ${range("pulseSeconds", 1, 20, 0.5)}
          <div class="form-group">
            <label>${L("MIGHTYGUARD.Settings.GrappleImage.Name")}</label>
            <div class="form-fields">
              <input type="text" name="grappleImagePath" value="${escapeHTML(get("grappleImagePath"))}" placeholder="${L("MIGHTYGUARD.Animations.DrawnTalons")}">
              <button type="button" data-action="browse" style="flex:0 0 auto;width:auto;" data-tooltip="${L("MIGHTYGUARD.Animations.Browse")}"><i class="fas fa-file-import"></i></button>
            </div>
          </div>
          ${range("grappleImageFit", 0.5, 1.6, 0.05)}
          <label class="mg-shared-row mg-anim-defer" data-tooltip="${L("MIGHTYGUARD.Settings.DeferToOtherModules.Hint")}"
                 style="display:flex;align-items:center;gap:6px;padding:3px 2px 1px;min-width:0;">
            <input type="checkbox" name="deferToOtherModules" ${get("deferToOtherModules") ? "checked" : ""} style="flex:none;margin:0;">
            <span style="min-width:0;overflow-wrap:anywhere;">${L("MIGHTYGUARD.Settings.DeferToOtherModules.Name")}</span>
          </label>
          <div class="mg-shared-row mg-anim-everyone" data-tooltip="${L("MIGHTYGUARD.Animations.ApplyToEveryone.Hint")}"
               style="display:flex;align-items:center;gap:8px;padding:4px 2px 1px;flex-wrap:wrap;">
            <button type="button" data-action="giveEveryone" style="flex:none;width:auto;"><i class="fas fa-users"></i> ${L("MIGHTYGUARD.Animations.ApplyToEveryone.Name")}</button>
            <span class="hint mg-last-given" style="margin:0;font-size:var(--font-size-12, 12px);">${AnimationsConfig.lastGivenText()}</span>
          </div>
        </fieldset>` : "";
      const div = document.createElement("div");
      div.innerHTML = `
        <p class="hint" style="margin-top:0;">${L("MIGHTYGUARD.Animations.Intro")}</p>
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-bottom:6px;">
          <button type="button" data-action="allOn" style="flex:none;width:auto;">${L("MIGHTYGUARD.Animations.AllOn")}</button>
          <button type="button" data-action="allOff" style="flex:none;width:auto;">${L("MIGHTYGUARD.Animations.AllOff")}</button>
        </div>
        ${groups}${shared}
        <footer class="form-footer" style="margin-top:4px;">
          <button type="submit"><i class="fas fa-check"></i> ${L("MIGHTYGUARD.Animations.Done")}</button>
        </footer>`;
      return div;
    }

    static lastGivenText() {
      const givenAt = Number(game.settings.get(MODULE_ID, "animationDefaults")?.stamp) || 0;
      return givenAt ? escapeHTML(loc("MIGHTYGUARD.Animations.ApplyToEveryone.Last").replace("{date}", new Date(givenAt).toLocaleString())) : "";
    }

    _replaceHTML(result, content) {
      content.replaceChildren(result);
      // Never taller than the screen: the contents scroll instead
      content.style.overflowY = "auto";
      if (this.element) this.element.style.maxHeight = "calc(100vh - 20px)";
      for (const input of content.querySelectorAll("input[type=range]")) {
        const out = input.parentElement?.querySelector(".mg-range-value");
        input.addEventListener("input", () => { if (out) out.textContent = input.value; });
      }
      // Save each choice as it's made ("change": a box ticked, a menu picked, a slider let go, text entered)
      content.addEventListener("change", event => {
        const input = event.target;
        if (input?.name in ANIMATION_WINDOW_FIELDS) this.queueSave(() => saveAnimationField(input.name, input));
      });
      content.querySelector('[name="grappleImagePath"]')?.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); e.target.dispatchEvent(new Event("change", { bubbles: true })); }
      });
    }

    /** Run saves one after another (so "give everyone" sees the latest choices). */
    queueSave(job) {
      this._mgSaving = (this._mgSaving ?? Promise.resolve()).then(job).catch(err => {
        console.warn(`${MODULE_ID} | Could not save an animation choice`, err);
      });
      return this._mgSaving;
    }

    /** The animation checkboxes (not the status-icon option). */
    static animationBoxes(root) {
      return [...root.querySelectorAll(".mg-anim-group:not([data-group=display]):not([data-group=shared]) input[type=checkbox]")];
    }
    static setAll(app, on) {
      const boxes = AnimationsConfig.animationBoxes(app.element);
      boxes.forEach(c => { c.checked = on; });
      return app.queueSave(() => Promise.all(boxes.map(c => saveAnimationField(c.name, c))));
    }
    static onAllOn() { return AnimationsConfig.setAll(this, true); }
    static onAllOff() { return AnimationsConfig.setAll(this, false); }

    /** Play a sample at the volume the slider shows. */
    static onTestSound() {
      const helper = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
      const volume = Number(this.element.querySelector('[name="soundVolume"]')?.value ?? 50) / 100;
      try { helper?.play?.({ src: `${MODULE_PATH}/sounds/chime.ogg`, volume, autoplay: true, loop: false }, false); } catch { /* no audio */ }
    }

    static onBrowse() {
      const input = this.element.querySelector('[name="grappleImagePath"]');
      const Picker = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
      if (!input || !Picker) return;
      new Picker({ type: "image", current: input.value, callback: path => { input.value = path; input.dispatchEvent(new Event("change", { bubbles: true })); } }).render(true);
    }

    /** GM: give every player the animation choices as they are now. */
    static async onGiveEveryone() {
      if (!game.user?.isGM) return;
      await this.queueSave(async () => {
        const values = Object.fromEntries(ANIMATION_KEYS.map(key => [key, !!game.settings.get(MODULE_ID, key)]));
        await game.settings.set(MODULE_ID, "animationDefaults", { values, stamp: Date.now() });
      });
      const note = this.element?.querySelector(".mg-last-given");
      if (note) note.textContent = loc("MIGHTYGUARD.Animations.ApplyToEveryone.Last").replace("{date}", new Date(Number(game.settings.get(MODULE_ID, "animationDefaults")?.stamp) || Date.now()).toLocaleString());
      globalThis.ui?.notifications?.info?.(loc("MIGHTYGUARD.Animations.ApplyToEveryone.Given"));
    }

    /** Done (or Enter): anything not yet saved is saved, then the window closes. */
    static async onSubmit(event, form) {
      await this.queueSave(() => Promise.all(Object.keys(ANIMATION_WINDOW_FIELDS).map(key => {
        const input = form.querySelector(`[name="${key}"]`);
        return input ? saveAnimationField(key, input) : false;
      })));
    }
  };
}

/* -------------------------------------------- */
/*  Settings window: choose hidden statuses     */
/* -------------------------------------------- */

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function makeHiddenStatusesConfig() {
  const { ApplicationV2 } = foundry.applications.api;

  return class HiddenStatusesConfig extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: "mighty-guard-hidden-statuses",
      tag: "form",
      classes: ["mighty-guard-hidden-statuses"],
      window: { title: "MIGHTYGUARD.HiddenStatuses.Title", icon: "fas fa-eye-slash", contentClasses: ["standard-form"] },
      position: { width: 440, height: "auto" },
      form: { handler: HiddenStatusesConfig.onSubmit, closeOnSubmit: true },
      actions: {
        showAll: HiddenStatusesConfig.onShowAll,
        hideAll: HiddenStatusesConfig.onHideAll
      }
    };

    async _renderHTML() {
      const hidden = hiddenStatusIds();
      const all = hideableStatuses()
        .map(s => ({ id: s.id, name: game.i18n.localize(s.name ?? s.label ?? s.id), img: s.img ?? s.icon ?? "" }))
        .sort(byName(s => s.name));
      const row = s => `
          <label class="mg-status-row" data-name="${escapeHTML(s.name.toLowerCase())}"
                 style="display:flex;align-items:center;gap:8px;padding:2px 4px;">
            <input type="checkbox" name="show.${escapeHTML(s.id)}" ${hidden.has(s.id) ? "" : "checked"}>
            <img src="${escapeHTML(s.img)}" alt="" width="24" height="24" style="border:none;flex:none;background:rgba(0,0,0,0.5);border-radius:3px;">
            <span>${escapeHTML(s.name)}</span>
          </label>`;
      // Two columns, read down the first and then the second
      const grid = list => `<div class="mg-status-grid" style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));grid-template-rows:repeat(${Math.ceil(list.length / 2)}, auto);grid-auto-flow:column;gap:2px 8px;">${list.map(row).join("")}</div>`;
      const drakk = all.filter(s => isDrakkenheimStatus(s.id));
      const rows = grid(all.filter(s => !isDrakkenheimStatus(s.id))) + (drakk.length ? `
          <div class="mg-status-heading" style="margin:6px 0 2px;padding-top:4px;border-top:1px solid var(--color-border-light-2, #7a7971);font-weight:bold;">
            ${escapeHTML(loc("MIGHTYGUARD.Animations.Group.drakkenheim"))}</div>${grid(drakk)}` : "");
      const div = document.createElement("div");
      div.innerHTML = `
        <p class="hint">${escapeHTML(game.i18n.localize("MIGHTYGUARD.HiddenStatuses.Instructions"))}</p>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <input type="search" class="mg-config-search" placeholder="${escapeHTML(game.i18n.localize("MIGHTYGUARD.Search.Placeholder"))}" style="flex:1;">
          <button type="button" data-action="showAll" style="flex:none;width:auto;">${escapeHTML(game.i18n.localize("MIGHTYGUARD.HiddenStatuses.ShowAll"))}</button>
          <button type="button" data-action="hideAll" style="flex:none;width:auto;">${escapeHTML(game.i18n.localize("MIGHTYGUARD.HiddenStatuses.HideAll"))}</button>
        </div>
        <div class="mg-status-list" style="max-height:60vh;overflow-y:auto;">${rows}</div>
        <footer class="form-footer" style="margin-top:8px;">
          <button type="submit"><i class="fas fa-save"></i> ${escapeHTML(game.i18n.localize("MIGHTYGUARD.HiddenStatuses.Save"))}</button>
        </footer>`;
      return div;
    }

    _replaceHTML(result, content) {
      content.replaceChildren(result);
      const search = content.querySelector(".mg-config-search");
      search?.addEventListener("input", () => {
        const q = search.value.trim().toLowerCase();
        for (const row of content.querySelectorAll(".mg-status-row")) {
          row.style.display = (!q || row.dataset.name.includes(q)) ? "flex" : "none";
        }
        const heading = content.querySelector(".mg-status-heading");
        if (heading) heading.style.display = [...content.querySelectorAll(".mg-status-heading + .mg-status-grid .mg-status-row")].some(r => r.style.display !== "none") ? "" : "none";
      });
      search?.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });
    }

    static onShowAll() { this.element.querySelectorAll(".mg-status-row input[type=checkbox]").forEach(c => { c.checked = true; }); }
    static onHideAll() { this.element.querySelectorAll(".mg-status-row input[type=checkbox]").forEach(c => { c.checked = false; }); }

    static async onSubmit(event, form) {
      const hidden = [...form.querySelectorAll(".mg-status-row input[type=checkbox]")]
        .filter(c => !c.checked)
        .map(c => c.name.slice("show.".length));
      await game.settings.set(MODULE_ID, "hiddenStatuses", hidden);
    }
  };
}

