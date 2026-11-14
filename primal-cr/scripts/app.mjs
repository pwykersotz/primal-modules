/**
 * The Primal CR window (GM): the party on one side, the enemies on the other, and the danger of that fight on top.
 */
import { MODULE_ID, SETTINGS, loc, setting } from "./constants.mjs";
import { Encounter, actorsFromDrop, sideOfToken, tokensFromMap } from "./encounter.mjs";
import { isPlayerCharacter } from "./adapter.mjs";
import { simulate } from "./sim.mjs";
import { LEVELS, bookDifficulty, judge, percent } from "./verdict.mjs";
import { thresholds } from "./settings.mjs";
import { renderScan, renderWindow } from "./view.mjs";
import { scanActor } from "./reader.mjs";
import { parse, average } from "./dice.mjs";

const { ApplicationV2 } = foundry.applications.api;

const LABELS = ["noVerdict", "party", "enemies", "fillParty", "fillPartyTip", "clearEnemies", "clearEnemiesTip",
  "emptyParty", "emptyEnemies", "dropHint", "fromMap", "addSelected", "addSelectedTip", "addScene", "addSceneTip",
  "loadCombat", "loadCombatTip", "rested", "restedTip", "live", "liveTip", "rerun", "rerunTip", "details",
  "openSheet", "remove", "toParty", "toEnemies", "count", "fewer", "more", "statWin", "statWinTip", "statDrop",
  "statDropTip", "statWipe", "statWipeTip", "statDeath", "statDeathTip", "statLost", "statLostTip", "statRounds",
  "statRoundsTip", "bookTip", "scan", "scanTip"];

const cap = text => text.charAt(0).toUpperCase() + text.slice(1);

export class PrimalCRWindow extends ApplicationV2 {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "primal-cr-window",
    classes: ["primal-cr-window"],
    tag: "div",
    window: {
      title: "PRIMAL_CR.Window.Title",
      icon: "fa-solid fa-scale-unbalanced",
      resizable: true
    },
    position: { width: 900, height: 740 },
    actions: {
      toggleDetails: PrimalCRWindow.#onToggleDetails,
      openSheet: PrimalCRWindow.#onOpenSheet,
      removeEntry: PrimalCRWindow.#onRemoveEntry,
      moveEntry: PrimalCRWindow.#onMoveEntry,
      fewer: PrimalCRWindow.#onFewer,
      more: PrimalCRWindow.#onMore,
      fillParty: PrimalCRWindow.#onFillParty,
      clearEnemies: PrimalCRWindow.#onClearEnemies,
      addSelected: PrimalCRWindow.#onAddSelected,
      addScene: PrimalCRWindow.#onAddScene,
      loadCombat: PrimalCRWindow.#onLoadCombat,
      rerun: PrimalCRWindow.#onRerun,
      scan: PrimalCRWindow.#onScan
    }
  };

  /** The one window. */
  static #instance = null;

  static get instance() {
    return PrimalCRWindow.#instance;
  }

  /** Open the window (GM only). */
  static open() {
    if ( !game.user?.isGM ) {
      ui.notifications.warn(loc("Errors.GMOnly"));
      return null;
    }
    PrimalCRWindow.#instance ??= new PrimalCRWindow();
    PrimalCRWindow.#instance.render({ force: true });
    return PrimalCRWindow.#instance;
  }

  constructor(options = {}) {
    super(options);
    this.encounter = new Encounter().load();
    /** Entry ids whose details are open. */
    this.opened = new Set();
    /** The last assessment: { result, verdict, rows }. */
    this.assessment = null;
    this.#refreshSoon = foundry.utils.debounce(() => this.refresh(), 500);
  }

  #refreshSoon;
  #working = false;
  #again = false;

  /* -------------------------------------------- */
  /*  Adding from outside                         */
  /* -------------------------------------------- */

  /**
   * Add actors or tokens by uuid. Without a side, player characters go to the party and everything else to the
   * enemies (tokens by their disposition).
   * @param {string[]} uuids
   * @param {"party"|"enemies"} [side]
   */
  async add(uuids, side) {
    let added = 0;
    for ( const uuid of uuids ) {
      let to = side;
      if ( !to ) {
        let document = null;
        try {
          document = await fromUuid(uuid);
        } catch { /* skipped below */ }
        if ( !document ) continue;
        if ( document.documentName === "Token" ) to = sideOfToken(document) ?? "enemies";
        else to = isPlayerCharacter(document) ? "party" : "enemies";
      }
      if ( this.encounter.add(to, uuid) ) added++;
    }
    if ( added ) {
      await this.encounter.save();
      await this.refresh();
    }
    return added;
  }

  /** Add tokens from the map. */
  async addFromMap(from, { replace = false } = {}) {
    const tokens = tokensFromMap(from);
    if ( !tokens.length ) {
      ui.notifications.info(loc(`Errors.No${cap(from)}`));
      return 0;
    }
    if ( replace ) {
      this.encounter.clear();
      this.encounter.live = true;
    }
    for ( const { uuid, side } of tokens ) this.encounter.add(side, uuid);
    await this.encounter.save();
    await this.refresh();
    return tokens.length;
  }

  /* -------------------------------------------- */
  /*  Working it out                              */
  /* -------------------------------------------- */

  /** Read the sheets, play the fight out, and draw the result. */
  async refresh() {
    if ( this.#working ) {
      this.#again = true;
      return;
    }
    this.#working = true;
    try {
      if ( !this.encounter.partyChosen && !this.encounter.party.length ) {
        this.encounter.fillParty();
        await this.encounter.save();
      }
      const rows = await this.encounter.read();
      const sides = name => rows[name].filter(r => r.profile && !r.profile.defeated)
        .map(r => ({ key: r.entry.id, profile: r.profile, count: r.entry.count, pc: r.pc }));
      const runs = Math.min(5000, Math.max(200, Number(setting(SETTINGS.runs)) || 1000));
      const result = simulate(sides("party"), sides("enemies"), { runs, tactics: setting(SETTINGS.tactics) ?? "mixed" });
      this.assessment = { rows, result, verdict: judge(result, thresholds()) };
    } catch ( err ) {
      console.error(`${MODULE_ID} | Could not assess the encounter`, err);
      ui.notifications.error(loc("Errors.Failed"));
    } finally {
      this.#working = false;
    }
    if ( this.rendered ) await this.render();
    if ( this.#again ) {
      this.#again = false;
      this.#refreshSoon();
    }
  }

  /** Someone on the map or in the sidebar changed: read them again if they're part of this. */
  onActorChanged(actor) {
    if ( !this.rendered || !actor ) return;
    if ( !this.encounter.involves(actor) ) return;
    this.encounter.invalidate(actor);
    if ( this.encounter.live ) this.#refreshSoon();
  }

  /** A setting changed. */
  onSettingsChanged() {
    if ( this.rendered ) this.#refreshSoon();
  }

  /* -------------------------------------------- */
  /*  Drawing                                     */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext() {
    if ( !this.assessment ) await this.refresh();
    const a = this.assessment ?? { rows: { party: [], enemies: [] }, result: null, verdict: null };
    const result = a.result;
    const members = new Map((result?.members ?? []).map(m => [m.key, m]));
    const L = Object.fromEntries(LABELS.map(k => [k, loc(`Window.${cap(k)}`)]));
    const t = thresholds();

    const partyRow = r => {
      const base = this.#baseRow(r);
      const m = members.get(r.entry.id);
      if ( m && result?.runs && r.pc ) {
        base.chips.push({
          text: loc("Window.ChipDrops", { chance: percent(m.drop) }),
          tip: loc("Window.ChipDropsTip", { death: percent(m.death) }),
          cls: m.drop >= t.hard ? "pcr-bad" : (m.drop >= t.hard / 2 ? "pcr-warn" : "pcr-good")
        });
      }
      if ( m && result?.runs ) {
        base.chips.push({ text: loc("Window.ChipDeals", { share: percent(m.share) }), tip: loc("Window.ChipDealsPartyTip") });
      }
      return base;
    };
    const enemyRow = r => {
      const base = this.#baseRow(r);
      base.canCount = !r.token && !r.missing;
      const m = members.get(r.entry.id);
      if ( m && result?.runs ) {
        base.chips.push({ text: loc("Window.ChipDeals", { share: percent(m.share) }), tip: loc("Window.ChipDealsEnemyTip") });
        base.chips.push((m.killRound !== null) && (m.killed > 0.5)
          ? { text: loc("Window.ChipDies", { round: m.killRound.toFixed(1) }), tip: loc("Window.ChipDiesTip", { chance: percent(m.killed) }) }
          : { text: loc("Window.ChipSurvives", { chance: percent(1 - m.killed) }), tip: loc("Window.ChipSurvivesTip"), cls: "pcr-warn" });
      }
      return base;
    };

    const partyRows = a.rows.party.map(partyRow);
    const enemyRows = a.rows.enemies.map(enemyRow);
    const verdict = a.verdict;
    let sentence = loc("Window.Waiting");
    if ( verdict && result ) {
      sentence = loc(`Sentence.${cap(verdict.level)}`, {
        win: percent(result.win), drop: percent(result.drop), wipe: percent(result.wipe),
        lost: percent(Math.min(1, result.hpLost)), stalemate: percent(result.stalemate)
      });
      if ( (result.stalemate >= 0.1) && (verdict.level !== "impossible") ) sentence += ` ${loc("Sentence.Stalemate", { stalemate: percent(result.stalemate) })}`;
    } else if ( !a.rows.party.length ) sentence = loc("Window.NeedParty");
    else if ( !a.rows.enemies.length ) sentence = loc("Window.NeedEnemies");

    const count = rows => rows.reduce((n, r) => n + (r.missing ? 0 : r.entry.count), 0);
    const hp = rows => rows.reduce((n, r) => n + ((r.profile?.hp ?? 0) * r.entry.count), 0);
    const total = rows => (rows.length ? loc("Window.Total", { count: count(rows), hp: hp(rows) }) : "");

    return {
      L,
      verdict,
      result,
      thresholds: t,
      sentence,
      levelNames: Object.fromEntries(LEVELS.map(id => [id, loc(`Level.${cap(id)}`)])),
      levelHints: Object.fromEntries(LEVELS.map(id => [id, loc(`LevelHint.${cap(id)}`, {
        impossible: Math.round(t.impossible * 100), boss: Math.round(t.boss * 100),
        hard: Math.round(t.hard * 100), medium: Math.round(t.medium * 100)
      })])),
      party: partyRows,
      enemies: enemyRows,
      partyTotal: total(a.rows.party),
      enemiesTotal: total(a.rows.enemies),
      rested: this.encounter.rested,
      live: this.encounter.live,
      book: this.#bookLine(a.rows),
      runsText: result?.runs ? loc("Window.Runs", { runs: result.runs.toLocaleString() }) : ""
    };
  }

  #baseRow(r) {
    const p = r.profile;
    const row = {
      id: r.entry.id,
      name: p?.name ?? r.actor?.name ?? loc("Window.Missing"),
      img: r.token?.texture?.src ?? r.actor?.img ?? null,
      count: r.entry.count,
      missing: r.missing || !p,
      open: this.opened.has(r.entry.id),
      chips: [],
      details: p?.summary ?? [],
      notes: p?.notes ?? []
    };
    if ( r.missing ) row.sub = loc("Window.MissingSub");
    else if ( !p ) row.sub = loc("Window.Unreadable");
    else {
      const rank = p.isCharacter ? loc("Window.Level", { level: p.level }) : ((p.cr !== null) ? loc("Window.CR", { cr: crText(p.cr) }) : "");
      const hp = p.temp ? `${p.hp}+${p.temp}` : String(p.hp);
      row.sub = [rank, loc("Window.HPAC", { hp, max: p.hpMax, ac: p.ac }), r.token ? loc("Window.OnMap") : ""]
        .filter(Boolean).join(" · ");
      if ( p.defeated || (p.hp <= 0) ) row.sub += ` · ${loc("Window.Down")}`;
    }
    return row;
  }

  #bookLine(rows) {
    const levels = rows.party.filter(r => r.profile?.isCharacter && r.profile.level).map(r => r.profile.level);
    const xp = rows.enemies.reduce((n, r) => n + ((r.xp ?? 0) * r.entry.count), 0);
    const book = bookDifficulty(levels, xp, CONFIG.DND5E?.ENCOUNTER_DIFFICULTY);
    if ( !book || !xp ) return null;
    return loc("Window.Book", {
      level: loc(`Book.${cap(book.level)}`),
      xp: Math.round(book.xp).toLocaleString(),
      low: book.budgets[0].toLocaleString(),
      moderate: book.budgets[1].toLocaleString(),
      high: book.budgets[2].toLocaleString()
    });
  }

  /** @override */
  async _renderHTML(context) {
    return renderWindow(context);
  }

  /** @override */
  _replaceHTML(result, content) {
    const scroll = [...content.querySelectorAll(".pcr-list")].map(el => el.scrollTop);
    content.innerHTML = result;
    content.querySelectorAll(".pcr-list").forEach((el, i) => { el.scrollTop = scroll[i] ?? 0; });
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    const root = this.element;
    root.addEventListener("change", event => this.#onChange(event));
    root.addEventListener("dragover", event => {
      event.preventDefault();
      root.querySelectorAll(".pcr-side").forEach(el => el.classList.toggle("pcr-over", el === event.target.closest?.(".pcr-side")));
    });
    root.addEventListener("dragleave", event => {
      if ( !root.contains(event.relatedTarget) ) root.querySelectorAll(".pcr-over").forEach(el => el.classList.remove("pcr-over"));
    });
    root.addEventListener("drop", event => this.#onDrop(event));
  }

  /** @override */
  _onClose(options) {
    super._onClose?.(options);
    this.assessment = null;
    this.encounter.cache.clear();
  }

  /* -------------------------------------------- */
  /*  Events                                      */
  /* -------------------------------------------- */

  async #onDrop(event) {
    event.preventDefault();
    this.element.querySelectorAll(".pcr-over").forEach(el => el.classList.remove("pcr-over"));
    let data = null;
    try {
      data = JSON.parse(event.dataTransfer?.getData("text/plain") || "null");
    } catch { /* not ours */ }
    if ( !data ) return;
    const side = event.target.closest?.(".pcr-side")?.dataset.side;
    const uuids = await actorsFromDrop(data);
    if ( !uuids.length ) {
      ui.notifications.info(loc("Errors.NotActor"));
      return;
    }
    await this.add(uuids, side);
  }

  async #onChange(event) {
    const el = event.target;
    if ( el.name === "rested" ) {
      this.encounter.rested = el.checked;
      this.encounter.invalidate();
    } else if ( el.name === "live" ) this.encounter.live = el.checked;
    else if ( el.name === "count" ) this.encounter.setCount(el.closest("[data-entry-id]")?.dataset.entryId, el.value);
    else return;
    await this.encounter.save();
    await this.refresh();
  }

  static #entryId(target) {
    return target.closest("[data-entry-id]")?.dataset.entryId;
  }

  static #onToggleDetails(event, target) {
    const id = PrimalCRWindow.#entryId(target);
    if ( !id ) return;
    if ( this.opened.has(id) ) this.opened.delete(id);
    else this.opened.add(id);
    target.closest(".pcr-row")?.classList.toggle("pcr-open", this.opened.has(id));
  }

  static async #onOpenSheet(event, target) {
    const id = PrimalCRWindow.#entryId(target);
    const cached = this.encounter.cache.get(id);
    cached?.actor?.sheet?.render(true);
  }

  static async #onRemoveEntry(event, target) {
    this.encounter.remove(PrimalCRWindow.#entryId(target));
    await this.encounter.save();
    await this.refresh();
  }

  static async #onMoveEntry(event, target) {
    this.encounter.move(PrimalCRWindow.#entryId(target));
    this.encounter.invalidate();
    await this.encounter.save();
    await this.refresh();
  }

  static async #step(target, by) {
    const id = PrimalCRWindow.#entryId(target);
    const found = this.encounter.find(id);
    if ( !found ) return;
    this.encounter.setCount(id, found.entry.count + by);
    await this.encounter.save();
    await this.refresh();
  }

  static #onFewer(event, target) {
    return PrimalCRWindow.#step.call(this, target, -1);
  }

  static #onMore(event, target) {
    return PrimalCRWindow.#step.call(this, target, 1);
  }

  static async #onFillParty() {
    this.encounter.fillParty();
    if ( !this.encounter.party.length ) ui.notifications.info(loc("Errors.NoCharacters"));
    await this.encounter.save();
    await this.refresh();
  }

  static async #onClearEnemies() {
    this.encounter.clear("enemies");
    await this.encounter.save();
    await this.refresh();
  }

  static #onAddSelected() {
    return this.addFromMap("selected");
  }

  static #onAddScene() {
    return this.addFromMap("scene");
  }

  static #onLoadCombat() {
    return this.addFromMap("combat", { replace: true });
  }

  static #onRerun() {
    this.encounter.invalidate();
    return this.refresh();
  }

  static #onScan() {
    return this.scan();
  }

  /**
   * Show what was and wasn't read from each party member's sheet, with fields to describe homebrew by hand.
   * What's typed there is kept on the actor (flags.primal-cr.manual) and used from then on.
   */
  async scan() {
    this.encounter.invalidate();
    const rows = (await this.encounter.read()).party.filter(r => r.actor && r.profile);
    if ( !rows.length ) return ui.notifications.info(loc("Scan.NoParty"));
    const S = key => loc(`Scan.${key}`);
    const byId = new Map();
    const actors = rows.map(r => {
      const scan = scanActor(r.actor.toObject(), r.profile);
      const manual = r.actor.getFlag?.(MODULE_ID, "manual") ?? {};
      const editable = !r.actor.pack && !!r.actor.isOwner && (typeof r.actor.setFlag === "function");
      byId.set(r.entry.id, r.actor);
      return {
        id: r.entry.id, name: r.profile.name, sub: this.#baseRow(r).sub,
        read: r.profile.summary, unread: scan.unread, unprepared: scan.unprepared,
        unreadText: loc("Scan.UnreadCount", { count: scan.unread.length }),
        unpreparedText: loc("Scan.Unprepared", { count: scan.unprepared }),
        editable, onHit: manual.onHit ?? "", everyHit: manual.everyHit ?? ""
      };
    });
    const L = {
      intro: S("Intro"), read: S("Read"), unread: S("Unread"), unreadNone: S("UnreadNone"), allRead: S("AllRead"),
      onHit: S("OnHit"), onHitHint: S("OnHitHint"), everyHit: S("EveryHit"), everyHitHint: S("EveryHitHint"),
      reasons: { other: S("ReasonOther"), reaction: S("ReasonReaction"), summon: S("ReasonSummon"),
        unequipped: S("ReasonUnequipped"), utility: S("ReasonUtility") }
    };
    const values = await foundry.applications.api.DialogV2.prompt({
      window: { title: S("Title"), icon: "fa-solid fa-magnifying-glass-chart" },
      classes: ["primal-cr-scan"],
      position: { width: 620 },
      content: renderScan({ L, actors }),
      rejectClose: false,
      ok: {
        label: S("Save"),
        icon: "fa-solid fa-dice-d20",
        callback: (event, button) => Object.fromEntries([...button.form.elements]
          .filter(el => el.name?.includes(".")).map(el => [el.name, el.value.trim()]))
      }
    });
    if ( !values ) return;
    for ( const [id, actor] of byId ) {
      const before = actor.getFlag?.(MODULE_ID, "manual") ?? {};
      const next = {};
      for ( const key of ["onHit", "everyHit"] ) {
        const formula = values[`${key}.${id}`];
        if ( formula === undefined ) continue;
        if ( formula && !(average(parse(formula)) > 0) ) {
          ui.notifications.warn(loc("Scan.BadFormula", { formula, name: actor.name }));
          next[key] = "";
        } else next[key] = formula;
      }
      if ( !Object.keys(next).length ) continue;
      if ( (next.onHit ?? "") === (before.onHit ?? "") && (next.everyHit ?? "") === (before.everyHit ?? "") ) continue;
      await actor.setFlag(MODULE_ID, "manual", next);
    }
    this.encounter.invalidate();
    return this.refresh();
  }
}

/** A challenge rating as it's written: 1/8, 1/4, 1/2, 3. */
export function crText(cr) {
  if ( cr === 0.125 ) return "1/8";
  if ( cr === 0.25 ) return "1/4";
  if ( cr === 0.5 ) return "1/2";
  return String(cr);
}
