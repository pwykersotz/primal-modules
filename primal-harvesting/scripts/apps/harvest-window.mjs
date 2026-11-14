/**
 * The harvest window: one per corpse. The components the creature can give on the left, the harvest list (in the
 * order they'll be carved, each with its running harvest DC) on the right, and below them who assesses, who carves
 * and who helps. The best assessor and carver are picked to start with, and every helper the creature's size allows,
 * so a harvest is: click the components, press Harvest.
 *
 * The window is shared: opening it opens it for every player who can harvest and the GM, and every change anyone
 * makes (the list, the team, who gets the components) shows on every screen. The shared state is kept on the token
 * (see session.mjs), changed by the active GM's client, one change at a time.
 */
import { FLAGS, MODULE_ID, SETTINGS, dnd5eLabel, escapeHTML, loc, newId, setting } from "../constants.mjs";
import {
  CREATURE_TYPES, chance, essenceFor, expectedTotal, harvestDCs, helperBonus, priceOf, sizeRule, typeRule
} from "../rules.mjs";
import { componentsFor, normalizeComponent, normalizeTags } from "../tables.mjs";
import {
  canHarvest, checkModifier, crLabel, creatureInfo, harvestedRecord, harvesterCandidates, isProficient, profOf,
  spellcastingAbilityOf, tokenDocOf
} from "../creature.mjs";
import { getRules, getTables, saveTables } from "../store.mjs";
import { gpLabel, performHarvest, rollRandomComponents, tagsFor, timeLabel } from "../harvest.mjs";
import { broadcast, needsApproval, onBroadcast, tellGM } from "../gm.mjs";
import { TEAM_FIELDS, harvestingBy, normalizeSession } from "../session.mjs";
import { renderHarvestWindow } from "../views.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** Open windows, by token UUID. */
const OPEN = new Map();

/** Is the harvest window shared by everyone? */
function sharing() {
  return setting(SETTINGS.shareWindow) !== false;
}

export class HarvestWindow extends ApplicationV2 {
  /**
   * Open the harvest window for a corpse (a Token, TokenDocument or Actor), or bring it to the front. It opens for
   * everyone else too, unless it was opened because someone else opened it (remote).
   * @param {Token|TokenDocument|Actor} target
   * @param {{remote?: boolean}} [options]
   * @returns {HarvestWindow|null}
   */
  static open(target, { remote=false }={}) {
    const tokenDoc = tokenDocOf(target);
    if ( !tokenDoc ) {
      if ( !remote ) ui.notifications.warn(loc("Errors.NoCreature"));
      return null;
    }
    const allowed = canHarvest(tokenDoc);
    if ( !allowed.ok ) {
      if ( !remote ) ui.notifications.warn(loc(`Errors.${allowed.reason}`, { name: tokenDoc.name }));
      return null;
    }
    const share = !remote && sharing();
    const existing = OPEN.get(tokenDoc.uuid);
    if ( existing?.rendered ) {
      existing.bringToFront?.();
      if ( share ) broadcast("open", { tokenUuid: tokenDoc.uuid });
      return existing;
    }
    const app = new HarvestWindow(tokenDoc, {}, { starter: !remote });
    app.ready = app.render({ force: true }).then(() => app.#start(share));
    return app;
  }

  /**
   * Listen for what other clients say: a window opened (open it here too), a change to a shared window (show it),
   * a corpse harvested (close its window). Called once the game is ready.
   */
  static listen() {
    onBroadcast("open", async ({ tokenUuid }) => {
      if ( !sharing() || !tokenUuid ) return;
      const tokenDoc = await fromUuid(tokenUuid);
      if ( tokenDoc ) HarvestWindow.open(tokenDoc, { remote: true });
    });
    onBroadcast("session", ({ tokenUuid, session }) => HarvestWindow.applySession(tokenUuid, session));
    onBroadcast("harvested", ({ tokenUuid, at }) => {
      const app = OPEN.get(tokenUuid);
      if ( app?.rendered && !app.busy && ((at ?? null) !== app.harvestedAt) ) app.close();
    });
  }

  /** The shared state of a corpse's window changed (from the GM's client): show it, unless it's older than ours. */
  static applySession(tokenUuid, session) {
    const app = OPEN.get(tokenUuid);
    if ( !app?.rendered || app.busy || !session || !sharing() ) return;
    if ( (Number(session.rev) || 0) < (app.rev ?? 0) ) return;
    app.#load(session);
    app.render();
  }

  /**
   * A token changed: re-draw its window, with the shared state as it is now. Once the corpse has been harvested
   * (by anyone), its window closes.
   */
  static refreshFor(tokenDoc) {
    const app = OPEN.get(tokenDoc?.uuid);
    if ( !app?.rendered || app.busy ) return;
    const harvested = harvestedRecord(tokenDoc);
    if ( harvested && ((harvested.at ?? null) !== app.harvestedAt) ) {
      app.close();
      return;
    }
    const session = tokenDoc.getFlag?.(MODULE_ID, FLAGS.session);
    if ( session && sharing() && ((Number(session.rev) || 0) >= (app.rev ?? 0)) ) app.#load(session);
    app.render();
  }

  /** An actor changed (the GM picked another type or creature table for it): re-draw its corpses' windows. */
  static refreshForActor(actor) {
    for ( const app of OPEN.values() ) {
      const t = app.tokenDoc;
      if ( !app.rendered || app.busy ) continue;
      if ( (t.actor === actor) || (t.baseActor === actor) || (actor?.id && (t.actor?.id === actor.id)) ) app.render();
    }
  }

  /** The tables or rules changed: re-draw every window. */
  static refreshAll() {
    for ( const app of OPEN.values() ) {
      if ( app.rendered && !app.busy ) app.render();
    }
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["primal-harvesting-window"],
    tag: "div",
    window: {
      icon: "fa-solid fa-bone",
      resizable: true
    },
    position: { width: 800, height: "auto" },
    actions: {
      add: HarvestWindow.#onAdd,
      addAll: HarvestWindow.#onAddAll,
      remove: HarvestWindow.#onRemove,
      up: HarvestWindow.#onUp,
      down: HarvestWindow.#onDown,
      clearList: HarvestWindow.#onClear,
      quickAdd: HarvestWindow.#onQuickAdd,
      openTables: HarvestWindow.#onOpenTables,
      rollRandom: HarvestWindow.#onRollRandom,
      addGuest: HarvestWindow.#onAddGuest,
      approve: HarvestWindow.#onApprove,
      removeGuest: HarvestWindow.#onRemoveGuest,
      harvest: HarvestWindow.#onHarvest
    }
  };

  constructor(tokenDoc, options={}, { starter=true }={}) {
    super({ id: `primal-harvesting-${tokenDoc.id}`, ...options });
    this.tokenDoc = tokenDoc;
    /** The harvest list: copies of components, each with its own uid. */
    this.list = [];
    /** Components the GM added for this harvest only. */
    this.extra = [];
    /** Creatures the GM added to this harvest, to assess, carve or help (actor UUIDs). */
    this.guests = [];
    /** The shared state's revision this window shows. */
    this.rev = 0;
    this.assessorId = null;
    this.carverId = null;
    this.ritual = null;
    this.helperIds = null;
    this.helpersTouched = false;
    this.recipientId = null;
    /** Someone else rolling this harvest ({ userId, name, at }), from the shared state. */
    this.harvesting = null;
    /** The GM's approval of the harvest as it is ({ by, at }), which players need to roll it. */
    this.approved = null;
    this.quick = { name: "", dc: "", tags: "", save: false };
    this.busy = false;
    /** Did this user open the window (rather than someone else, for everyone)? */
    this.starter = starter;
    /** When the corpse was last harvested, as the window opened: a newer harvest closes it. */
    this.harvestedAt = harvestedRecord(tokenDoc)?.at ?? null;
    const session = sharing() ? tokenDoc.getFlag?.(MODULE_ID, FLAGS.session) : null;
    if ( session ) this.#load(session);
    OPEN.set(tokenDoc.uuid, this);
  }

  /** @override */
  get title() {
    return loc("Window.Title", { name: this.tokenDoc?.name ?? "" });
  }

  /* -------------------------------------------- */
  /*  The shared state                            */
  /* -------------------------------------------- */

  /** Take the shared state (from the token) as this window's. */
  #load(raw) {
    const s = normalizeSession(raw);
    this.list = s.list;
    this.extra = s.extra;
    this.guests = s.guests;
    this.rev = s.rev;
    this.assessorId = s.assessorId;
    this.carverId = s.carverId;
    this.ritual = s.ritual;
    this.helperIds = s.helperIds ? new Set(s.helperIds) : null;
    this.helpersTouched = s.helpersTouched;
    this.recipientId = s.recipientId;
    this.harvesting = s.harvesting;
    this.approved = s.approved;
  }

  /** This window's state, as a session. */
  #state() {
    return normalizeSession({
      list: this.list,
      extra: this.extra,
      guests: this.guests,
      assessorId: this.assessorId,
      carverId: this.carverId,
      ritual: this.ritual,
      helperIds: this.helperIds ? [...this.helperIds] : null,
      helpersTouched: this.helpersTouched,
      recipientId: this.recipientId,
      harvesting: this.harvesting,
      approved: this.approved
    });
  }

  /** The team as chosen (or as the window picked it), for a "set". */
  #team() {
    const state = this.#state();
    return Object.fromEntries(TEAM_FIELDS.map(k => [k, state[k]]));
  }

  /**
   * Share a change made in this window: the active GM's client makes it to the state on the token, and every
   * window re-draws from that. The change is already in this window.
   * @returns {Promise<void>}
   */
  #share(op) {
    if ( !sharing() ) return Promise.resolve();
    // A player's change to the list withdraws the GM's approval (the GM's client does the same to the shared state).
    if ( !game.user.isGM && ["add", "remove", "move", "clear"].includes(op.op) ) this.approved = null;
    return tellGM("session", { tokenUuid: this.tokenDoc.uuid, op: { ...op, state: this.#state() } })
      .catch(err => {
        console.warn(`${MODULE_ID} | Could not share a change to the harvest window`, err);
        ui.notifications.warn(loc("Errors.NotShared", { error: err.message }));
      });
  }

  /** After the first render: start the shared state (if this user opened the window) and open it for everyone. */
  async #start(share) {
    if ( !share ) return;
    if ( this.starter && !this.tokenDoc.getFlag?.(MODULE_ID, FLAGS.session) ) await this.#share({ op: "init" });
    broadcast("open", { tokenUuid: this.tokenDoc.uuid });
  }

  /* -------------------------------------------- */
  /*  The model                                   */
  /* -------------------------------------------- */

  /** Everything the window shows, worked out from the corpse, the tables, the rules and the choices made. */
  #model() {
    const rules = getRules();
    const tables = getTables();
    const info = creatureInfo(this.tokenDoc);
    const type = info.type;
    const tRule = typeRule(rules, type);
    const skill = tRule?.skill ?? "nat";
    const sRule = sizeRule(rules, info.size);
    const { creature, components } = componentsFor(tables, { type, names: info.names, creatureId: info.creatureId });
    const essence = essenceFor(info.cr, rules);
    const usesType = !creature || creature.useTypeTable;
    const randomTable = usesType ? (tables.random?.[type] ?? null) : null;
    const randomRecord = this.tokenDoc.getFlag?.(MODULE_ID, FLAGS.random) ?? null;

    const available = [...components, ...(randomRecord?.components ?? []), ...this.extra];
    if ( essence ) {
      available.push({
        key: "essence", id: "essence", source: "essence", name: loc("Window.EssenceName", { tier: essence.name }),
        dc: essence.dc, tags: [], max: 1, essence: essence.name, rarity: essence.rarity, price: essence.price, note: ""
      });
    }
    const notes = [];
    if ( usesType && tables.notes?.[type] ) notes.push({ title: dnd5eLabel("creatureTypes", type), text: tables.notes[type] });
    if ( creature?.note ) notes.push({ title: creature.name, text: creature.note });

    const candidates = harvesterCandidates(info.actor, { guests: this.guests });
    const byId = new Map(candidates.map(a => [a.uuid, a]));
    const assessMod = a => checkModifier(a, skill, "int");
    const dexMod = a => checkModifier(a, skill, "dex");
    const spellOf = a => (tRule?.ritual ? spellcastingAbilityOf(a) : null);
    const ritualMod = a => (spellOf(a) ? checkModifier(a, skill, spellOf(a)) : -Infinity);
    const bestCarve = a => Math.max(dexMod(a), ritualMod(a));

    // The best pair to start with: the highest assessment and carving, by two different creatures if there are two.
    if ( !byId.has(this.assessorId) || !byId.has(this.carverId) ) {
      let best = null;
      for ( const a of candidates ) {
        for ( const c of candidates ) {
          if ( (a === c) && (candidates.length > 1) ) continue;
          const score = assessMod(a) + bestCarve(c) - ((a === c) ? 100 : 0);
          if ( !best || (score > best.score) ) best = { a, c, score };
        }
      }
      if ( !byId.has(this.assessorId) ) this.assessorId = best?.a.uuid ?? null;
      if ( !byId.has(this.carverId) ) this.carverId = best?.c.uuid ?? null;
    }
    const assessor = byId.get(this.assessorId) ?? null;
    const carver = byId.get(this.carverId) ?? null;
    const carverSpell = carver ? spellOf(carver) : null;
    if ( this.ritual === null ) this.ritual = !!(carverSpell && (ritualMod(carver) > dexMod(carver)));
    const ritual = !!(this.ritual && carverSpell);
    const both = !!assessor && (assessor === carver);

    const maxHelpers = sRule.helpers;
    const others = candidates.filter(a => (a !== assessor) && (a !== carver));
    const bonusOf = a => helperBonus({ prof: profOf(a), proficient: isProficient(a, skill) });
    if ( !this.helpersTouched || (this.helperIds === null) ) {
      const sorted = [...others].sort((x, y) => bonusOf(y) - bonusOf(x));
      this.helperIds = new Set(sorted.slice(0, maxHelpers).map(a => a.uuid));
    }
    for ( const id of [...this.helperIds] ) {
      if ( !others.some(a => a.uuid === id) ) this.helperIds.delete(id);
    }
    const helpers = others.filter(a => this.helperIds.has(a.uuid));
    const helperSum = helpers.reduce((s, a) => s + bonusOf(a), 0);

    if ( !byId.has(this.recipientId) ) {
      const own = game.user.character && byId.get(game.user.character.uuid);
      this.recipientId = own?.uuid ?? carver?.uuid ?? candidates[0]?.uuid ?? null;
    }

    // The list keeps only components that still exist (a table can change while the window is open).
    const keys = new Set(available.map(c => c.key));
    this.list = this.list.filter(c => keys.has(c.key));
    const dcs = harvestDCs(this.list);
    const expected = (assessor && carver) ? expectedTotal({
      assess: assessMod(assessor),
      carve: ritual ? ritualMod(carver) : dexMod(carver),
      helpers: helperSum,
      mode: (both && rules.bothDisadvantage) ? -1 : 0
    }) : null;

    return {
      rules, tables, info, type, tRule, skill, sRule, creature, essence, available, candidates, assessor, carver,
      ritual, carverSpell, both, maxHelpers, others, helpers, helperSum, dcs, expected, assessMod, dexMod, ritualMod,
      bonusOf, notes, randomTable, randomRecord, harvestingBy: harvestingBy(this.#state(), game.user.id)
    };
  }

  /** The window's view: the model in words, for renderHarvestWindow. */
  #view(m) {
    const isGM = game.user.isGM;
    const typeLabel = m.type ? dnd5eLabel("creatureTypes", m.type) : loc("Window.UnknownType");
    const skillLabel = dnd5eLabel("skills", m.skill);
    const counts = new Map();
    for ( const c of this.list ) counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
    const sourceLabel = c => {
      if ( c.source === "creature" ) return m.creature?.name ?? "";
      if ( c.source === "extra" ) return loc("Window.SourceExtra");
      if ( c.source === "essence" ) return dnd5eLabel("itemRarity", c.rarity);
      if ( c.source === "random" ) return c.fromLabel || loc("Window.SourceRandom");
      return "";
    };
    const tooltipOf = c => {
      const price = priceOf(c, m.rules);
      return [c.note, price ? loc("Window.SellsFor", { value: gpLabel(price) }) : ""].filter(Boolean).join(" · ");
    };
    const randomName = m.randomTable?.name || loc("Window.RandomDefault");
    const nameOf = a => (this.guests.includes(a.uuid) ? loc("Window.GuestName", { name: a.name }) : a.name);
    const record = m.randomRecord;
    const harvested = m.info.harvested;
    const blockReason = this.#blockReason(m);
    const ability = id => dnd5eLabel("abilities", id);
    const expected = (m.expected === null) ? "—" : Math.floor(m.expected);
    const harvestedText = harvested ? loc("Window.AlreadyHarvested", {
      names: harvested.harvested?.length ? harvested.harvested.join(", ") : loc("Window.Nothing"),
      total: harvested.total ?? "—"
    }) : "";

    return {
      isGM,
      busy: this.busy,
      labels: {
        harvestAs: loc("Window.HarvestAs"),
        creatureTable: loc("Window.CreatureTable"),
        openTables: loc("Window.OpenTables"),
        quickName: loc("Window.QuickName"),
        quickTags: loc("Window.QuickTags"),
        quickSave: loc("Window.QuickSave"),
        quickSaveHint: loc("Window.QuickSaveHint", { table: m.creature ? m.creature.name : typeLabel }),
        quickAdd: loc("Window.QuickAdd"),
        dc: loc("Window.DC"),
        componentDC: loc("Window.ComponentDC"),
        up: loc("Window.Up"),
        down: loc("Window.Down"),
        remove: loc("Window.Remove"),
        emptyList: loc("Window.EmptyList"),
        ritualHint: loc("Window.RitualHint"),
        noHelpers: loc("Window.NoHelpers"),
        noCandidates: loc("Window.NoCandidates"),
        guests: loc("Window.Guests"),
        addGuest: loc("Window.AddGuest"),
        addGuestHint: loc("Window.AddGuestHint"),
        removeGuest: loc("Window.RemoveGuest"),
        recipient: loc("Window.Recipient"),
        skill: loc("Window.Skill"),
        time: loc("Window.Time"),
        helpers: loc("Window.Helpers"),
        essence: loc("Window.Essence"),
        addAll: loc("Window.AddAll"),
        addAllHint: loc("Window.AddAllHint"),
        harvestList: loc("Window.HarvestList"),
        orderMatters: loc("Window.OrderMatters"),
        clear: loc("Window.Clear"),
        expected: loc("Window.Expected"),
        expectedHint: loc("Window.ExpectedHint")
      },
      creature: {
        name: m.info.name,
        img: m.info.img,
        facts: [typeLabel, dnd5eLabel("actorSizes", m.info.size), loc("Window.CR", { cr: crLabel(m.info.cr) }),
          m.info.defeated ? loc("Window.Dead") : loc("Window.Alive")]
      },
      typeOptions: [
        ...(CREATURE_TYPES.includes(m.type) || !m.type ? [] : [{ value: m.type, label: typeLabel, selected: true }]),
        ...Object.keys(m.rules.types).map(t => ({ value: t, label: dnd5eLabel("creatureTypes", t), selected: t === m.type }))
      ],
      creatureOptions: [
        { value: "", label: loc("Window.NoCreatureTable"), selected: !m.creature },
        ...m.tables.creatures.map(c => ({ value: c.id, label: c.name, selected: c.id === m.creature?.id }))
      ],
      unknownType: m.tRule ? "" : loc(isGM ? "Window.UnknownTypeGM" : "Window.UnknownTypePlayer", { type: typeLabel }),
      harvested: harvestedText,
      harvesting: m.harvestingBy ? loc("Window.HarvestingBy", { name: m.harvestingBy.name }) : "",
      notes: m.notes.map(n => ({ title: loc("Window.NotesTitle", { name: n.title }), paragraphs: n.text.split(/\n+/).map(p => p.trim()).filter(Boolean) })),
      random: {
        canRoll: !!m.randomTable && !record && !harvested,
        label: loc("Window.RollRandom", { table: randomName, die: Math.max(...m.randomTable?.rows.map(r => r.max) ?? [100]) }),
        hint: loc("Window.RollRandomHint"),
        rolled: record ? loc(record.components?.length ? "Window.RandomRolled" : "Window.RandomRolledNothing", {
          table: record.name || randomName,
          rolls: (record.lines ?? []).map(l => `${l.total}: ${l.text}`).join("; ")
        }) : ""
      },
      rule: {
        skill: skillLabel,
        time: timeLabel(m.sRule.minutes),
        helpers: m.maxHelpers ? loc("Window.UpTo", { n: m.maxHelpers }) : loc("Window.None"),
        essence: m.essence ? loc("Window.EssenceRule", { tier: m.essence.name, dc: m.essence.dc })
          : (m.rules.essences.length && (m.info.cr !== null) && (m.info.cr < Math.min(...m.rules.essences.map(x => x.minCR))))
            ? loc("Window.EssenceBelow", { cr: Math.min(...m.rules.essences.map(x => x.minCR)) })
            : loc("Window.None")
      },
      availableTitle: m.creature ? loc("Window.ComponentsOf", { name: m.creature.name }) : loc("Window.ComponentsOf", { name: typeLabel }),
      available: m.available.map(c => {
        const count = counts.get(c.key) ?? 0;
        return {
          key: c.key,
          name: c.name,
          tags: tagsFor(c.tags),
          note: tooltipOf(c),
          source: c.source,
          sourceLabel: sourceLabel(c),
          dcText: loc("Window.DCValue", { dc: c.dc }),
          count,
          disabled: !!(c.max && (count >= c.max))
        };
      }),
      noComponents: !m.available.some(c => c.source !== "essence"),
      emptyAvailable: m.creature
        ? loc("Window.EmptyCreature", { name: m.creature.name })
        : loc(isGM ? "Window.EmptyTypeGM" : "Window.EmptyTypePlayer", { type: typeLabel }),
      quick: this.quick,
      list: this.list.map((c, i) => {
        const level = (m.expected === null) ? "maybe" : chance(m.dcs[i], m.expected);
        return {
          name: c.name,
          tags: tagsFor(c.tags),
          dc: c.dc,
          harvestDC: m.dcs[i],
          chance: level,
          chanceLabel: loc(`Window.Chance.${level}`, { dc: m.dcs[i] })
        };
      }),
      candidates: m.candidates.map(a => ({
        uuid: a.uuid,
        name: nameOf(a),
        assessMod: m.assessMod(a),
        carveMod: (m.ritual && (a === m.carver)) ? m.ritualMod(a) : m.dexMod(a),
        assessing: a === m.assessor,
        carving: a === m.carver
      })),
      assessLabel: loc("Window.AssessBy", { ability: ability("int") }),
      carveLabel: loc("Window.CarveBy", { ability: m.ritual ? ability(m.carverSpell) : ability("dex") }),
      ritual: {
        allowed: !!m.tRule?.ritual,
        possible: !!m.carverSpell,
        checked: m.ritual,
        label: m.carverSpell
          ? loc("Window.Ritual", { ability: ability(m.carverSpell) })
          : loc("Window.RitualNone")
      },
      both: m.both ? loc(m.rules.bothDisadvantage ? "Window.Both" : "Window.BothNoDisadvantage", { name: m.assessor.name }) : "",
      maxHelpers: m.maxHelpers,
      helpersLabel: m.maxHelpers
        ? loc("Window.HelpersLabel", { n: m.helpers.length, max: m.maxHelpers, total: m.helperSum })
        : loc("Window.NoHelpersBySize"),
      helpers: m.others.map(a => {
        const checked = this.helperIds.has(a.uuid);
        const proficient = isProficient(a, m.skill);
        return {
          uuid: a.uuid,
          name: nameOf(a),
          bonus: m.bonusOf(a),
          checked,
          disabled: !checked && (m.helpers.length >= m.maxHelpers),
          tooltip: loc(proficient ? "Window.HelperProficient" : "Window.HelperHalf", { skill: skillLabel })
        };
      }),
      expected,
      addItems: setting(SETTINGS.addItems) !== false,
      recipients: m.candidates.map(a => ({ value: a.uuid, label: nameOf(a), selected: a.uuid === this.recipientId })),
      guests: isGM ? m.candidates.filter(a => this.guests.includes(a.uuid)).map(a => ({ uuid: a.uuid, name: a.name })) : [],
      canAddGuests: isGM,
      approval: this.#approvalView(m),
      canHarvest: !blockReason && !this.busy,
      blockReason,
      harvestLabel: m.harvestingBy
        ? loc("Window.HarvestingBy", { name: m.harvestingBy.name })
        : loc(harvested ? "Window.HarvestAgain" : "Window.Harvest", { time: timeLabel(m.sRule.minutes) })
    };
  }

  /** Is the GM's approval needed (by players, when the GM asks for it), and is it given? Null if not needed. */
  #approvalView(m) {
    if ( !sharing() || (setting(SETTINGS.requireApproval) === false) || m.info.harvested ) return null;
    const approved = !!this.approved;
    if ( game.user.isGM ) {
      return {
        gm: true,
        approved,
        label: loc(approved ? "Window.Approved" : "Window.Approve"),
        hint: loc(approved ? "Window.ApprovedHintGM" : "Window.ApproveHint")
      };
    }
    return {
      gm: false,
      approved,
      label: loc(approved ? "Window.ApprovedBy" : "Window.WaitingApproval", { name: this.approved?.by || loc("Window.TheGM") }),
      hint: loc(approved ? "Window.ApprovedHint" : "Window.WaitingApprovalHint")
    };
  }

  /** Why Harvest can't be pressed now, or "". */
  #blockReason(m) {
    if ( m.harvestingBy ) return loc("Window.HarvestingBy", { name: m.harvestingBy.name });
    if ( !m.assessor || !m.carver ) return loc("Window.NoCandidates");
    if ( !this.list.length ) return loc("Window.EmptyList");
    if ( m.info.harvested && !game.user.isGM ) return loc("Errors.AlreadyHarvested", { name: m.info.name });
    if ( !game.user.isGM && !game.users.activeGM ) return loc("Errors.NoGM");
    if ( needsApproval() && !this.approved ) return loc("Window.WaitingApprovalHint");
    return "";
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const model = this.#model();
    this._model = model;
    return this.#view(model);
  }

  /** @override */
  async _renderHTML(context, options) {
    return renderHarvestWindow(context);
  }

  /** @override */
  _replaceHTML(result, content, options) {
    content.innerHTML = result;
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    const root = this.element;
    root.addEventListener("change", this.#onChange.bind(this));
    root.addEventListener("input", event => {
      const el = event.target;
      if ( el.name === "quickName" ) this.quick.name = el.value;
      else if ( el.name === "quickDC" ) this.quick.dc = el.value;
      else if ( el.name === "quickTags" ) this.quick.tags = el.value;
    });
    root.addEventListener("keydown", event => {
      if ( (event.key === "Enter") && event.target.closest?.(".ph-quick") ) {
        event.preventDefault();
        HarvestWindow.#onQuickAdd.call(this, event, event.target);
      }
    });
    // Drag a row of the harvest list to move it.
    root.addEventListener("dragstart", event => {
      const row = event.target.closest?.(".ph-row[data-index]");
      if ( !row ) return;
      event.dataTransfer.setData("text/plain", `primal-harvesting:${row.dataset.index}`);
      event.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
    });
    root.addEventListener("dragend", event => event.target.closest?.(".ph-row")?.classList.remove("dragging"));
    root.addEventListener("dragover", event => {
      if ( !event.target.closest?.(".ph-harvest-list") ) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    // The GM drops an actor on the team to add it to this harvest.
    root.addEventListener("dragover", event => {
      if ( game.user.isGM && event.target.closest?.(".ph-team") ) event.preventDefault();
    });
    root.addEventListener("drop", event => {
      if ( !game.user.isGM || !event.target.closest?.(".ph-team") ) return;
      let data = null;
      try {
        const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
        data = TE?.getDragEventData?.(event) ?? JSON.parse(event.dataTransfer.getData("text/plain"));
      } catch {
        data = null;
      }
      if ( (data?.type !== "Actor") || !data.uuid ) return;
      event.preventDefault();
      this.#addGuest(data.uuid);
    });
    root.addEventListener("drop", event => {
      const listEl = event.target.closest?.(".ph-harvest-list");
      if ( !listEl ) return;
      const data = event.dataTransfer.getData("text/plain");
      if ( !data?.startsWith("primal-harvesting:") ) return;
      event.preventDefault();
      const from = Number(data.split(":")[1]);
      const row = event.target.closest(".ph-row[data-index]");
      let to = row ? Number(row.dataset.index) : this.list.length - 1;
      if ( row ) {
        const box = row.getBoundingClientRect();
        if ( (event.clientY > box.top + (box.height / 2)) && (to < from) ) to += 1;
        else if ( (event.clientY < box.top + (box.height / 2)) && (to > from) ) to -= 1;
      }
      this.#move(from, to);
    });
  }

  /** @override */
  _onClose(options) {
    super._onClose?.(options);
    if ( OPEN.get(this.tokenDoc?.uuid) === this ) OPEN.delete(this.tokenDoc.uuid);
  }

  /* -------------------------------------------- */
  /*  Changes                                     */
  /* -------------------------------------------- */

  async #onChange(event) {
    const el = event.target;
    switch ( el.name ) {
      case "assessor":
      case "carver":
      case "ritual":
      case "helper":
        // A player changing who rolls withdraws the GM's approval.
        if ( !game.user.isGM ) this.approved = null;
        break;
      default:
        break;
    }
    switch ( el.name ) {
      case "assessor":
        this.assessorId = el.value;
        if ( !this.helpersTouched ) this.helperIds = null;
        break;
      case "carver":
        this.carverId = el.value;
        this.ritual = null;
        if ( !this.helpersTouched ) this.helperIds = null;
        break;
      case "ritual":
        this.ritual = el.checked;
        break;
      case "helper":
        this.helpersTouched = true;
        if ( el.checked ) this.helperIds.add(el.value);
        else this.helperIds.delete(el.value);
        break;
      case "recipient":
        this.recipientId = el.value;
        await this.#share({ op: "set", values: this.#team() });
        return;
      case "quickSave":
        this.quick.save = el.checked;
        return;
      case "type":
        if ( game.user.isGM ) await this.#setCreatureFlag(FLAGS.type, el.value);
        await this.render();
        return;
      case "creature":
        if ( game.user.isGM ) await this.#setCreatureFlag(FLAGS.creature, el.value);
        await this.render();
        return;
      default:
        return;
    }
    // The window works out what the change leaves (helpers, ritual carving), then shares the team as it is.
    await this.render();
    await this.#share({ op: "set", values: this.#team() });
  }

  /** Keep the GM's choice (type or creature table) on the creature's actor, so every copy of it uses it. */
  async #setCreatureFlag(key, value) {
    const actor = this.tokenDoc.baseActor ?? this.tokenDoc.actor;
    if ( !actor ) return;
    const own = String(this.tokenDoc.actor?.system?.details?.type?.value ?? "");
    if ( !value || ((key === FLAGS.type) && (value === own)) ) await actor.unsetFlag(MODULE_ID, key);
    else await actor.setFlag(MODULE_ID, key, value);
    this.list = [];
    await this.#share({ op: "clear" });
  }

  #move(from, to) {
    if ( !Number.isInteger(from) || !Number.isInteger(to) ) return;
    if ( (from < 0) || (from >= this.list.length) ) return;
    to = Math.max(0, Math.min(this.list.length - 1, to));
    if ( from === to ) return;
    const [item] = this.list.splice(from, 1);
    this.list.splice(to, 0, item);
    this.render();
    return this.#share({ op: "move", uid: item.uid, to });
  }

  /** Put a component at the end of the harvest list, unless it's there as often as it can be. The copy, or null. */
  #push(component) {
    const count = this.list.filter(c => c.key === component.key).length;
    if ( component.max && (count >= component.max) ) return null;
    const copy = structuredClone({ ...component, uid: newId() });
    this.list.push(copy);
    return copy;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onAdd(event, target) {
    const component = this._model?.available.find(c => c.key === target.dataset.key);
    const copy = component ? this.#push(component) : null;
    if ( !copy ) return;
    this.render();
    await this.#share({ op: "add", components: [copy] });
  }

  /** Every component once (or as often as it can go), lowest DC first. */
  static async #onAddAll() {
    const all = [...(this._model?.available ?? [])].sort((a, b) => (a.dc - b.dc) || a.name.localeCompare(b.name));
    const added = [];
    for ( const c of all ) {
      if ( this.list.some(x => x.key === c.key) ) continue;
      const copy = this.#push(c);
      if ( copy ) added.push(copy);
    }
    this.render();
    if ( added.length ) await this.#share({ op: "add", components: added });
  }

  static async #onRemove(event, target) {
    const [item] = this.list.splice(Number(target.dataset.index), 1);
    this.render();
    if ( item ) await this.#share({ op: "remove", uid: item.uid });
  }

  static #onUp(event, target) {
    const i = Number(target.dataset.index);
    this.#move(i, i - 1);
  }

  static #onDown(event, target) {
    const i = Number(target.dataset.index);
    this.#move(i, i + 1);
  }

  static async #onClear() {
    this.list = [];
    this.render();
    await this.#share({ op: "clear" });
  }

  /** The GM adds a creature to this harvest (any actor), to assess, carve or help. */
  async #addGuest(uuid) {
    if ( !game.user.isGM || !uuid || this.guests.includes(uuid) ) return;
    let actor = null;
    try {
      actor = await fromUuid(uuid);
    } catch {
      actor = null;
    }
    if ( (actor?.documentName !== "Actor") || ["group", "vehicle"].includes(actor.type) || (actor === this.tokenDoc.actor) ) {
      ui.notifications.warn(loc("Window.GuestInvalid"));
      return;
    }
    this.guests = [...this.guests, actor.uuid];
    await this.render();
    await this.#share({ op: "guests", guests: this.guests });
  }

  static async #onAddGuest() {
    if ( !game.user.isGM ) return;
    const taken = new Set((this._model?.candidates ?? []).map(a => a.uuid));
    const corpse = this.tokenDoc.actor;
    const actors = [...(game.actors ?? [])]
      .filter(a => (a !== corpse) && !["group", "vehicle"].includes(a.type) && !taken.has(a.uuid))
      .sort((a, b) => a.name.localeCompare(b.name));
    if ( !actors.length ) {
      ui.notifications.info(loc("Window.NoGuests"));
      return;
    }
    const { DialogV2 } = foundry.applications.api;
    const options = actors.map(a => `<option value="${escapeHTML(a.uuid)}">${escapeHTML(a.name)}</option>`).join("");
    const uuid = await DialogV2.prompt({
      window: { title: loc("Window.AddGuest") },
      content: `<p class="hint">${escapeHTML(loc("Window.AddGuestText"))}</p>
        <div class="form-group"><select name="actor" autofocus>${options}</select></div>`,
      ok: { label: loc("Window.AddGuestOk"), callback: (event, button) => button.form.elements.actor.value },
      rejectClose: false
    });
    if ( uuid ) await this.#addGuest(uuid);
  }

  static async #onRemoveGuest(event, target) {
    if ( !game.user.isGM ) return;
    const uuid = target.dataset.uuid;
    if ( !this.guests.includes(uuid) ) return;
    this.guests = this.guests.filter(g => g !== uuid);
    if ( this.helperIds ) this.helperIds.delete(uuid);
    await this.render();
    await this.#share({ op: "guests", guests: this.guests });
    await this.#share({ op: "set", values: this.#team() });
  }

  /** The GM approves the harvest as it is (players can roll it then), or withdraws the approval. */
  static async #onApprove() {
    if ( !game.user.isGM ) return;
    this.approved = this.approved ? null : { by: game.user.name, at: Date.now() };
    await this.render();
    await this.#share({ op: "approve", value: this.approved });
  }

  /** Roll the creature type's random components (the ooze's d100 table), once for this corpse. */
  static async #onRollRandom() {
    const m = this._model;
    if ( !m?.randomTable || m.randomRecord || this.rolling ) return;
    this.rolling = true;
    try {
      await rollRandomComponents({
        info: m.info,
        table: m.randomTable,
        tables: m.tables,
        typeLabel: dnd5eLabel("creatureTypes", m.type)
      });
    } catch (err) {
      console.error(`${MODULE_ID} | Could not roll the random components`, err);
      ui.notifications.error(loc("Errors.Failed", { error: err.message }));
    }
    this.rolling = false;
    if ( this.rendered ) this.render();
  }

  static async #onOpenTables() {
    const { HarvestTablesEditor } = await import("./tables-editor.mjs");
    const m = this._model;
    HarvestTablesEditor.openTo(m?.creature ? `creature:${m.creature.id}` : `type:${m?.type ?? "aberration"}`);
  }

  /** The GM adds a component by hand: to this harvest only, or saved into the creature's table too. */
  static async #onQuickAdd() {
    if ( !game.user.isGM ) return;
    const root = this.element;
    const name = root.querySelector("[name=quickName]")?.value ?? this.quick.name;
    const dc = root.querySelector("[name=quickDC]")?.value ?? this.quick.dc;
    const tags = root.querySelector("[name=quickTags]")?.value ?? this.quick.tags;
    const save = root.querySelector("[name=quickSave]")?.checked ?? this.quick.save;
    const component = normalizeComponent({ name, dc, tags: normalizeTags(tags) });
    if ( !component || (dc === "") ) {
      ui.notifications.warn(loc("Window.QuickInvalid"));
      return;
    }
    const m = this._model;
    if ( save ) {
      const tables = getTables();
      if ( m.creature ) {
        const entry = tables.creatures.find(c => c.id === m.creature.id);
        entry?.components.push(component);
      }
      else if ( m.type ) (tables.types[m.type] ??= []).push(component);
      await saveTables(tables);
      const copy = this.#push({ ...component, source: m.creature ? "creature" : "type", key: `${m.creature ? "creature" : "type"}:${component.id}` });
      this.quick = { name: "", dc: "", tags: "", save };
      this.render();
      if ( copy ) await this.#share({ op: "add", components: [copy] });
      return;
    }
    const extra = { ...component, source: "extra", key: `extra:${component.id}` };
    this.extra.push(extra);
    const copy = this.#push(extra);
    this.quick = { name: "", dc: "", tags: "", save };
    this.render();
    this.#share({ op: "extra", component: extra });
    if ( copy ) await this.#share({ op: "add", components: [copy] });
  }

  static async #onHarvest() {
    if ( this.busy ) return;
    const m = this.#model();
    const reason = this.#blockReason(m);
    if ( reason ) {
      ui.notifications.warn(reason);
      return;
    }
    const allowed = canHarvest(this.tokenDoc);
    if ( !allowed.ok ) {
      ui.notifications.warn(loc(`Errors.${allowed.reason}`, { name: this.tokenDoc.name }));
      return;
    }
    // The approval as the GM's client last saved it, in case a change has withdrawn it since this window drew.
    if ( needsApproval() && !this.tokenDoc.getFlag?.(MODULE_ID, FLAGS.session)?.approved ) {
      this.approved = null;
      this.render();
      ui.notifications.warn(loc("Window.WaitingApprovalHint"));
      return;
    }
    let again = false;
    if ( m.info.harvested ) {
      const { DialogV2 } = foundry.applications.api;
      again = await DialogV2.confirm({
        window: { title: loc("Window.AgainTitle") },
        content: `<p>${escapeHTML(loc("Window.AgainText", { name: m.info.name }))}</p>`
      });
      if ( !again ) return;
    }
    this.busy = true;
    this.harvesting = { userId: game.user.id, name: game.user.name, at: Date.now() };
    await this.render();
    this.#share({ op: "harvesting", value: this.harvesting });
    let result = null;
    try {
      result = await performHarvest({
        info: m.info,
        rules: m.rules,
        type: m.type,
        skill: m.skill,
        minutes: m.sRule.minutes,
        list: this.list.map(c => ({ ...c })),
        assessor: m.assessor,
        carver: m.carver,
        ritual: m.ritual,
        helpers: m.helpers,
        recipient: m.candidates.find(a => a.uuid === this.recipientId) ?? null,
        again
      });
    } catch (err) {
      console.error(`${MODULE_ID} | Harvest failed`, err);
      ui.notifications.error(loc("Errors.Failed", { error: err.message }));
    }
    this.busy = false;
    this.harvesting = null;
    if ( result ) {
      await this.close();
      return;
    }
    if ( this.rendered ) this.render();
    await this.#share({ op: "harvesting", value: null });
  }
}
