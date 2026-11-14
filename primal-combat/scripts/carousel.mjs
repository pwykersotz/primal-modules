/**
 * The carousel: the turn order as a row of portraits at the top of the screen, under dnd5e's calendar.
 *
 * It lives inside Foundry's #ui-top column (the same place dnd5e puts its calendar HUD) with a high CSS `order`, so
 * it always sits below the calendar and anything else other modules put there, and moves down when they grow.
 */
import { DEFAULT_FRAME, MODES, MODULE_ID, SETTINGS, SIDES, loc, setting } from "./constants.mjs";
import * as Sides from "./sides.mjs";
import * as Timer from "./timer.mjs";
import * as Events from "./events.mjs";
import * as Companions from "./companions.mjs";
import { clearHighlight, highlightToken } from "./highlight.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Video token art can't go in an <img>, so its first frame is used instead. */
const thumbnails = new Map();

export default class CombatCarousel extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "primal-combat-carousel",
    tag: "section",
    classes: ["primal-combat", "ui-control"],
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      previous: CombatCarousel.#onPrevious,
      next: CombatCarousel.#onNext,
      startCombat: CombatCarousel.#onStartCombat,
      restartTimer: CombatCarousel.#onRestartTimer,
      quickRoll: CombatCarousel.#onQuickRoll,
      rollInitiative: CombatCarousel.#onRollInitiative
    }
  };

  /** @override */
  static PARTS = {
    carousel: {
      template: `modules/${MODULE_ID}/templates/carousel.hbs`
    }
  };

  /**
   * Positions of the portraits before a re-render, so they can slide to their new places.
   * @type {Map<string, {rect: DOMRect, opacity: number, framed: boolean}>|null}
   */
  #before = null;

  /** Horizontal scroll of the track, kept across re-renders. */
  #scroll = 0;

  /** The combatant whose portrait the mouse is over. */
  #hoverId = null;

  /** When this user last ended their turn by clicking their portrait (so a double-click doesn't open the sheet too). */
  #endedTurnAt = 0;

  /** Ticks the turn timer once a second while it's showing. */
  #timerInterval = null;

  /** Re-render soon. Many hooks fire at once when combat changes, so this waits a moment and renders once. */
  refresh = foundry.utils.debounce(() => {
    this.render({ force: true }).catch(err => console.error(`${MODULE_ID} | Carousel render failed`, err));
  }, 60);

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _insertElement(element) {
    const existing = document.getElementById(element.id);
    if ( existing ) {
      existing.replaceWith(element);
      return;
    }
    const top = document.querySelector("#ui-middle #ui-top") ?? document.getElementById("ui-top");
    (top ?? document.body).append(element);
  }

  /** @override */
  async _prepareContext(options) {
    const combat = game.combat;
    const context = {
      visible: false,
      size: setting(SETTINGS.portraitSize),
      offset: setting(SETTINGS.topOffset),
      frameSrc: setting(SETTINGS.frameImage) || DEFAULT_FRAME,
      labels: {
        roll: loc("Controls.RollInitiative"),
        start: loc("Controls.Start"),
        menu: loc("Controls.Menu")
      }
    };
    if ( !setting(SETTINGS.showCarousel) || !combat ) return context;

    const sideMode = Sides.isSideMode(combat);
    const entries = sideMode ? await this.#prepareSideEntries(combat) : await this.#prepareStandardEntries(combat);
    if ( !entries.some(e => e.isSlot) ) return context;

    const status = this.#prepareStatus(combat, sideMode);
    status.timer = this.#prepareTimer(combat, sideMode);
    return Object.assign(context, {
      visible: true,
      sideMode,
      entries,
      controls: this.#prepareControls(combat, sideMode),
      status
    });
  }

  /**
   * Individual initiative: whoever is acting comes first, then the rest of this round, then a divider and the
   * creatures who have already gone (they act again next round).
   */
  async #prepareStandardEntries(combat) {
    const turns = combat.turns;
    const entries = [];
    const push = async combatant => {
      const slot = await this.#prepareSlot(combat, combatant, { sideMode: false });
      if ( slot ) entries.push(slot);
    };
    if ( combat.started && Number.isInteger(combat.turn) && turns.length ) {
      for ( const c of turns.slice(combat.turn) ) await push(c);
      const before = turns.slice(0, combat.turn);
      if ( before.length ) {
        const round = combat.round + 1;
        entries.push({
          isDivider: true,
          key: "next-round",
          label: loc("Carousel.RoundShort", { round }),
          tooltip: loc("Carousel.NextRound", { round })
        });
        for ( const c of before ) await push(c);
      }
    }
    else for ( const c of turns ) await push(c);
    return trimDividers(entries);
  }

  /**
   * Side initiative: whoever is acting first, every one of them framed, then everyone else in the order they'll go.
   * Each group starts with a chip for its side. The enemies' chip shows their initiative.
   */
  async #prepareSideEntries(combat) {
    const entries = [];
    const enemyInit = Sides.getEnemyInitiative(combat);
    const enemyValue = enemyInit ? formatInitiative(enemyInit.value) : "";
    let dividerShown = false;
    for ( const [index, group] of Sides.getDisplayGroups(combat).entries() ) {
      const slots = [];
      for ( const combatant of group.members ) {
        const slot = await this.#prepareSlot(combat, combatant, {
          sideMode: true, side: group.side, acting: group.acting, enemyValue
        });
        if ( slot ) slots.push(slot);
      }
      if ( !slots.length ) continue;
      if ( group.nextRound && !dividerShown ) {
        dividerShown = true;
        const round = combat.round + 1;
        entries.push({
          isDivider: true,
          key: "next-round",
          label: loc("Carousel.RoundShort", { round }),
          tooltip: loc("Carousel.NextSideRound", { round })
        });
      }
      const isEnemies = group.side === SIDES.enemies;
      const isEvents = group.side === SIDES.event;
      let tooltip = loc(`Sides.${group.side}`);
      if ( isEvents ) tooltip = loc("Carousel.Events");
      // Players just see "Enemies"; the GM also sees their number and whose it is.
      else if ( isEnemies && enemyInit && game.user.isGM ) {
        tooltip = loc("Carousel.EnemiesAct", { value: enemyValue });
        if ( enemyInit.name ) {
          tooltip += ` ${loc("Carousel.EnemiesFrom", { name: foundry.utils.escapeHTML(enemyInit.name) })}`;
        }
      }
      else if ( group.opening ) tooltip = loc("Carousel.Opening", { value: enemyValue });
      entries.push({
        isLabel: true,
        // Keyed by position as well as side, so the chips slide to their new places when the turn moves.
        key: `side-${group.side}-${group.acting ? "acting" : index}`,
        css: [
          `pc-label-${group.side}`,
          group.acting ? "pc-label-acting" : null,
          group.opening ? "pc-label-opening" : null
        ].filterJoin(" "),
        icon: group.opening ? "fa-solid fa-bolt"
          : (isEvents ? "fa-solid fa-dungeon" : (isEnemies ? "fa-solid fa-skull" : "fa-solid fa-shield-halved")),
        roll: isEnemies ? enemyValue : "",
        tooltip
      });
      entries.push(...slots);
    }
    return trimDividers(entries);
  }

  /**
   * Everything one portrait needs.
   * @param {Combat} combat
   * @param {Combatant} combatant
   * @param {object} options
   * @param {boolean} options.sideMode
   * @param {string} [options.side]
   * @param {boolean} [options.acting]       Side initiative: is this combatant acting right now?
   * @param {string} [options.enemyValue]    Side initiative: the enemies' initiative, for the tooltip.
   */
  async #prepareSlot(combat, combatant, { sideMode, side, acting=false, enemyValue="" }) {
    if ( !combatant.visible ) return null;
    const isGM = game.user.isGM;
    const current = combat.started && (combatant === combat.combatant);
    const framed = sideMode ? (combat.started && acting) : current;
    const done = sideMode && acting && Sides.isDone(combatant);
    const defeated = combatant.isDefeated;
    const hidden = combatant.hidden;
    // Side initiative: click to mark yourself done. Individual initiative: click to end your turn.
    const canEndTurn = canEndTurnByClick(combatant);
    const canToggle = canEndTurn || (Sides.canToggleDone(combatant) && !defeated);
    const hasInitiative = Number.isFinite(combatant.initiative);
    const event = Sides.isEvent(combatant);
    // In side initiative the enemies act on one shared number, shown on their side's chip instead. Events show the
    // initiative count they happen on.
    const rollsOwn = !event && (!sideMode || (side === SIDES.party));
    let initiative = (rollsOwn && hasInitiative) ? formatInitiative(combatant.initiative) : "";
    if ( event ) initiative = formatInitiative(Sides.eventCount(combatant));
    const canRoll = rollsOwn && !hasInitiative && combatant.isOwner;
    const hp = prepareHp(combatant);
    const disposition = event ? "event" : dispositionClass(combatant);

    const esc = foundry.utils.escapeHTML;
    const name = esc(combatant.name ?? "");
    const lines = [`<strong>${name}</strong>`];
    if ( event ) {
      lines.push(loc("Tooltip.EventCount", { value: initiative || "?" }));
      const placement = Sides.eventPlacement(combatant);
      if ( placement ) lines.push(loc(`Tooltip.EventPlacement.${placement}`, { value: enemyValue }));
      const notes = isGM ? Events.getEventData(combatant).notes.trim() : "";
      if ( notes ) {
        const short = notes.length > 160 ? `${notes.slice(0, 157)}…` : notes;
        lines.push(`<em>${esc(short).replace(/\n/g, "<br>")}</em>`);
      }
    }
    else {
      if ( sideMode ) lines.push(loc(`Sides.${side}`));
      if ( !rollsOwn ) {
        if ( enemyValue ) lines.push(loc("Tooltip.EnemyInitiative", { value: enemyValue }));
      }
      else if ( hasInitiative ) lines.push(loc("Tooltip.Initiative", { value: formatInitiative(combatant.initiative) }));
      else lines.push(loc("Tooltip.NoInitiative"));
    }
    if ( hp ) lines.push(loc("Tooltip.HP", { hp: hp.text }));
    if ( defeated ) lines.push(loc("Tooltip.Defeated"));
    else if ( done ) lines.push(loc("Tooltip.Done"));
    if ( hidden ) lines.push(loc("Tooltip.Hidden"));
    if ( canEndTurn ) lines.push(`<em>${loc("Tooltip.ClickEndTurn")}</em>`);
    else if ( canToggle ) lines.push(`<em>${loc(done ? "Tooltip.ClickUndo" : "Tooltip.ClickDone")}</em>`);
    if ( event && isGM ) lines.push(`<em>${loc(canToggle ? "Tooltip.RightClickEdit" : "Tooltip.DoubleClickEdit")}</em>`);

    return {
      isSlot: true,
      key: combatant.id,
      id: combatant.id,
      tokenId: combatant.tokenId ?? "",
      name: combatant.name,
      img: await portraitFor(combatant),
      css: [
        "pc-slot",
        `pc-${disposition}`,
        sideMode ? `pc-side-${side}` : null,
        event ? "pc-is-event" : null,
        framed ? "pc-framed" : null,
        current && !sideMode ? "pc-current" : null,
        done ? "pc-done" : null,
        defeated ? "pc-defeated" : null,
        hidden ? "pc-hidden" : null,
        canToggle ? "pc-can-toggle" : null,
        (isGM || combatant.isOwner) ? "pc-owned" : null
      ].filterJoin(" "),
      framed, done, defeated, hidden, canToggle, canRoll, initiative, hp,
      tooltip: lines.join("<br>")
    };
  }

  /** The buttons at either end of the carousel. */
  #prepareControls(combat, sideMode) {
    const isGM = game.user.isGM;
    const started = combat.started;
    const myTurn = !sideMode && started && !!combat.combatant?.players?.includes(game.user);
    const unrolled = c => c.isNPC && !Sides.isEvent(c) && !Number.isFinite(c.initiative)
      && (!sideMode || (Sides.getSide(c) === SIDES.party));
    let nextLabel = loc("Controls.EndTurn");
    if ( isGM ) nextLabel = loc(sideMode ? "Controls.NextSide" : "Controls.NextTurn");
    return {
      showPrevious: isGM && started,
      previousLabel: loc(sideMode ? "Controls.PreviousSide" : "Controls.PreviousTurn"),
      showStart: isGM && !started,
      showNext: started && (isGM || myTurn),
      nextLabel,
      nextIcon: isGM ? "fa-solid fa-chevron-right" : "fa-solid fa-check",
      nextText: (!isGM && myTurn) ? loc("Controls.EndTurnShort") : "",
      nextPrimary: !isGM && myTurn,
      showQuickRoll: isGM && !started && combat.combatants.some(unrolled),
      quickRollLabel: loc(sideMode ? "Controls.RollPartyNPCs" : "Controls.RollNPCs"),
      showMenu: isGM
    };
  }

  /** The line of text under the carousel. */
  #prepareStatus(combat, sideMode) {
    const isGM = game.user.isGM;
    if ( !combat.started ) {
      // In side initiative only the party rolls.
      const rollers = combat.turns.filter(c => c.visible && !Sides.isEvent(c)
        && (!sideMode || (Sides.getSide(c) === SIDES.party)));
      const rolled = rollers.filter(c => Number.isFinite(c.initiative)).length;
      const mine = rollers.filter(c => c.isOwner && !Number.isFinite(c.initiative)).length;
      const enemyInit = sideMode ? Sides.getEnemyInitiative(combat) : null;
      let hint = "";
      if ( mine && !isGM ) hint = loc("Status.RollHint");
      else if ( isGM && (rolled === rollers.length) ) hint = loc("Status.ReadyToStart");
      return {
        text: enemyInit ? loc("Status.EnemiesAct", { value: formatInitiative(enemyInit.value) }) : loc("Status.NotStarted"),
        detail: loc(sideMode ? "Status.PartyRolled" : "Status.Rolled", { rolled, total: rollers.length }),
        hint
      };
    }

    const round = loc("Status.Round", { round: combat.round });
    if ( sideMode ) {
      const side = Sides.getActiveSide(combat);
      if ( !side ) return { round };
      const acting = Sides.getActingMembers(combat);
      if ( side === SIDES.event ) {
        // Lair actions and the like: only the GM has anything to do. Players aren't told about hidden ones.
        const shown = acting.filter(c => c.visible && !c.isDefeated);
        const standingEvents = acting.filter(c => !c.isDefeated);
        const doneEvents = standingEvents.filter(c => Sides.isDone(c)).length;
        return {
          round,
          text: shown.length ? loc("Status.SideTurn.event", { names: shown.map(c => c.name).join(", ") })
            : loc("Status.GMMoment"),
          css: "pc-status-event",
          detail: (isGM && (standingEvents.length > 1)) ? loc("Status.DoneCount", { done: doneEvents, total: standingEvents.length }) : "",
          hint: isGM ? loc("Status.EventHint") : ""
        };
      }
      const standing = acting.filter(c => !c.isDefeated && c.visible);
      const done = standing.filter(c => Sides.isDone(c)).length;
      const mine = standing.filter(c => c.isOwner);
      const opening = Sides.isOpeningTurn(combat);
      let hint = "";
      if ( !isGM && mine.length ) {
        hint = mine.every(c => Sides.isDone(c)) ? loc("Status.WaitingForSide") : loc("Status.ClickWhenDone");
      }
      else if ( !isGM && opening && combat.combatants.some(c => c.isOwner && (Sides.getSide(c) === SIDES.party)) ) {
        hint = loc("Status.AfterEnemies");
      }
      return {
        round,
        text: loc(opening ? "Status.SideTurn.opening" : `Status.SideTurn.${side}`),
        css: `pc-status-${side}`,
        detail: standing.length ? loc("Status.DoneCount", { done, total: standing.length }) : "",
        hint
      };
    }

    const combatant = combat.combatant;
    const name = combatant?.visible ? combatant.name : null;
    const myTurn = !!combatant?.players?.includes(game.user);
    if ( combatant && Sides.isEvent(combatant) ) {
      return {
        round,
        text: name ? loc("Status.EventTurn", { name, value: formatInitiative(Sides.eventCount(combatant)) }) : "",
        css: "pc-status-event"
      };
    }
    return {
      round,
      text: name ? loc("Status.Turn", { name }) : "",
      hint: (!isGM && myTurn) ? loc("Status.YourTurnClick") : ""
    };
  }

  /** The turn timer in the bar under the carousel, if this user sees it. */
  #prepareTimer(combat, sideMode) {
    // The active GM's client keeps the shared timer right (new turn, pause state) every time the carousel redraws.
    Timer.syncTimer(combat);
    if ( !Timer.isTimerVisible() ) return null;
    const timer = Timer.getTurnTimer(combat);
    if ( !timer ) return null;
    // Stop as soon as the game pauses, even before the GM's client has recorded it.
    let pausedAt = Number.isFinite(timer.pausedAt) ? timer.pausedAt : null;
    if ( (pausedAt === null) && game.paused ) pausedAt = Timer.now();
    const paused = pausedAt !== null;
    const canRestart = game.user.isGM;
    const lines = [loc(sideMode ? "Timer.SideTurn" : "Timer.Turn")];
    if ( paused ) lines.push(loc("Timer.Paused"));
    if ( canRestart ) lines.push(loc("Timer.ClickRestart"));
    return {
      start: timer.time,
      pausedAt: paused ? pausedAt : "",
      paused,
      canRestart,
      text: Timer.formatDuration(Timer.elapsed({ time: timer.time, pausedAt })),
      tooltip: lines.join("<br>")
    };
  }

  /** Update the turn timer's text, and stop ticking once it's gone. */
  #tickTimer() {
    const el = this.element?.querySelector(".pc-status-timer");
    if ( !el ) {
      clearInterval(this.#timerInterval);
      this.#timerInterval = null;
      return;
    }
    const pausedAt = el.dataset.pausedAt ? Number(el.dataset.pausedAt) : null;
    const text = Timer.formatDuration(Timer.elapsed({ time: Number(el.dataset.start), pausedAt }));
    const value = el.querySelector(".pc-timer-value");
    if ( value && (value.textContent !== text) ) value.textContent = text;
  }

  /** @override */
  async _preRender(context, options) {
    await super._preRender(context, options);
    this.#before = new Map();
    const track = this.element?.querySelector(".pc-track");
    if ( !track ) return;
    this.#scroll = track.scrollLeft;
    for ( const el of track.querySelectorAll("[data-key]") ) {
      const face = el.querySelector(".pc-face");
      this.#before.set(el.dataset.key, {
        rect: el.getBoundingClientRect(),
        opacity: face ? Number(getComputedStyle(face).opacity) : 1,
        framed: el.classList.contains("pc-framed")
      });
    }
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const root = this.element;
    root.addEventListener("click", this.#onClickSlot.bind(this));
    root.addEventListener("dblclick", this.#onDoubleClickSlot.bind(this));
    root.addEventListener("pointerover", this.#onPointerOver.bind(this), { passive: true });
    root.addEventListener("pointerleave", event => this.#hoverOut(event), { passive: true });
    root.addEventListener("wheel", this.#onWheel.bind(this), { passive: false });
    window.addEventListener("resize", foundry.utils.debounce(() => this.#updateOverflow(), 100));

    const ContextMenu = foundry.applications.ux.ContextMenu.implementation;
    new ContextMenu(root, ".pc-slot", this.#slotMenuItems(), { jQuery: false, fixed: true });
    new ContextMenu(root, ".pc-menu", this.#gmMenuItems(), { jQuery: false, fixed: true, eventName: "click" });
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    root.style.setProperty("--pc-size", `${context.size}px`);
    root.style.setProperty("--pc-offset", `${context.offset}px`);
    root.classList.toggle("pc-side-mode", !!context.sideMode);
    root.classList.toggle("pc-is-gm", game.user.isGM);
    if ( context.visible ) requestAnimationFrame(() => root.classList.add("pc-shown"));
    else {
      root.classList.remove("pc-shown");
      this.#hoverOut();
    }

    const track = root.querySelector(".pc-track");
    if ( track ) {
      track.scrollLeft = this.#scroll;
      this.#updateOverflow();
      this.#animate(track);
    }
    this.#tickTimer();
    if ( root.querySelector(".pc-status-timer") && !this.#timerInterval ) {
      this.#timerInterval = setInterval(() => this.#tickTimer(), 1000);
    }
    if ( this.#hoverId ) {
      const slot = root.querySelector(`.pc-slot[data-combatant-id="${this.#hoverId}"]`);
      if ( slot ) slot.classList.add("pc-hover");
      else this.#hoverOut();
    }
  }

  /** @override */
  _tearDown(options) {
    this.#hoverOut();
    clearInterval(this.#timerInterval);
    this.#timerInterval = null;
    return super._tearDown(options);
  }

  /**
   * Slide portraits from where they were to where they are now, and fade the ones that changed state.
   * @param {HTMLElement} track
   */
  #animate(track) {
    const before = this.#before;
    this.#before = null;
    if ( !before?.size ) return;
    if ( window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ) return;

    // #ui-middle is scaled by the UI scale setting, so screen distances need converting back.
    const scale = (track.getBoundingClientRect().width / track.offsetWidth) || 1;
    const easing = "cubic-bezier(0.22, 0.8, 0.25, 1)";
    for ( const el of track.querySelectorAll("[data-key]") ) {
      const old = before.get(el.dataset.key);
      if ( !old ) {
        el.animate([{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "none" }],
          { duration: 320, easing });
        continue;
      }
      const now = el.getBoundingClientRect();
      const dx = ((old.rect.left + (old.rect.width / 2)) - (now.left + (now.width / 2))) / scale;
      const dy = ((old.rect.top + (old.rect.height / 2)) - (now.top + (now.height / 2))) / scale;
      const s = now.width ? (old.rect.width / now.width) : 1;
      if ( (Math.abs(dx) > 0.5) || (Math.abs(dy) > 0.5) || (Math.abs(s - 1) > 0.01) ) {
        el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: "none" }],
          { duration: 480, easing });
      }
      const face = el.querySelector(".pc-face");
      if ( face ) {
        const opacity = Number(getComputedStyle(face).opacity);
        if ( Math.abs(opacity - old.opacity) > 0.01 ) {
          face.animate([{ opacity: old.opacity }, { opacity }], { duration: 450, easing: "ease-out" });
        }
      }
      if ( !old.framed && el.classList.contains("pc-framed") ) {
        el.querySelector(".pc-frame")?.animate(
          [{ opacity: 0, transform: "scale(1.35) rotate(-20deg)" }, { opacity: 1, transform: "none" }],
          { duration: 420, easing });
      }
    }
  }

  /** Mark the track when it's wider than the space it has, so its edges fade and the wheel scrolls it. */
  #updateOverflow() {
    const track = this.element?.querySelector(".pc-track");
    if ( !track ) return;
    track.classList.toggle("pc-overflow", track.scrollWidth > (track.clientWidth + 1));
  }

  /* -------------------------------------------- */
  /*  Canvas hover link                           */
  /* -------------------------------------------- */

  /**
   * hoverToken hook: light up the portrait of a token the mouse is over on the canvas.
   * @param {Token} token
   * @param {boolean} hovered
   */
  onHoverToken(token, hovered) {
    const slots = this.element?.querySelectorAll(`.pc-slot[data-token-id="${CSS.escape(token.id)}"]`) ?? [];
    for ( const slot of slots ) slot.classList.toggle("pc-token-hover", hovered);
  }

  #onPointerOver(event) {
    const slot = event.target.closest(".pc-slot");
    const id = slot?.dataset.combatantId ?? null;
    if ( id === this.#hoverId ) return;
    this.#hoverOut(event);
    if ( !id ) return;
    this.#hoverId = id;
    slot.classList.add("pc-hover");
    const token = game.combat?.combatants.get(id)?.token?.object;
    if ( token ) highlightToken(token, event);
  }

  #hoverOut(event) {
    if ( !this.#hoverId ) return;
    const id = this.#hoverId;
    this.#hoverId = null;
    this.element?.querySelector(`.pc-slot[data-combatant-id="${id}"]`)?.classList.remove("pc-hover");
    clearHighlight(event);
  }

  #onWheel(event) {
    const track = event.target.closest(".pc-track");
    if ( !track || (track.scrollWidth <= track.clientWidth) ) return;
    event.preventDefault();
    track.scrollLeft += (Math.abs(event.deltaY) > Math.abs(event.deltaX)) ? event.deltaY : event.deltaX;
  }

  /* -------------------------------------------- */
  /*  Clicks                                      */
  /* -------------------------------------------- */

  /** The combatant a portrait (or anything inside it) belongs to. */
  #combatantFor(element) {
    const id = element?.closest?.("[data-combatant-id]")?.dataset.combatantId;
    return id ? (game.combat?.combatants.get(id) ?? null) : null;
  }

  /**
   * Click a portrait. In side initiative, your own portrait on the acting side marks you done (or not done). In
   * individual initiative, a player's own portrait while it's their turn ends the turn.
   * Otherwise it selects the token, if it's yours, and moves the view to it.
   */
  async #onClickSlot(event) {
    if ( event.target.closest("[data-action]") ) return;
    const slot = event.target.closest(".pc-slot");
    const combatant = this.#combatantFor(slot);
    if ( !combatant ) return;
    if ( canEndTurnByClick(combatant) ) {
      if ( event.detail > 1 ) return;
      this.#endedTurnAt = Date.now();
      slot.classList.add("pc-busy");
      try {
        await combatant.parent.nextTurn();
      } catch(err) {
        console.error(`${MODULE_ID} | Could not end ${combatant.name}'s turn`, err);
        ui.notifications.error(loc("Notify.EndTurnFailed"));
        slot.classList.remove("pc-busy");
      }
      return;
    }
    if ( Sides.canToggleDone(combatant) && !combatant.isDefeated ) {
      if ( event.detail > 1 ) return; // The second click of a double-click shouldn't undo the first.
      slot.classList.add("pc-busy");
      try {
        await Sides.setDone(combatant);
      } catch(err) {
        console.error(`${MODULE_ID} | Could not mark ${combatant.name} done`, err);
        ui.notifications.error(loc("Notify.DoneFailed"));
        slot.classList.remove("pc-busy");
      }
      return;
    }
    if ( event.detail > 1 ) return;
    panToCombatant(combatant, { control: true });
  }

  /** Double-click a portrait to open the sheet (not on a portrait that marks you done, so it can't double-toggle). */
  #onDoubleClickSlot(event) {
    if ( event.target.closest("[data-action]") ) return;
    const combatant = this.#combatantFor(event.target);
    if ( !combatant || Sides.canToggleDone(combatant) || canEndTurnByClick(combatant) ) return;
    // The first click of this double-click just ended the turn: don't open a sheet as well.
    if ( (Date.now() - this.#endedTurnAt) < 800 ) return;
    if ( Sides.isEvent(combatant) ) {
      if ( game.user.isGM ) Events.openEventDialog(combatant.parent, combatant);
      return;
    }
    if ( combatant.actor?.testUserPermission(game.user, "OBSERVER") ) combatant.actor.sheet.render(true);
  }

  static async #onPrevious(event, target) {
    const combat = game.combat;
    if ( !combat ) return;
    target.disabled = true;
    try {
      await combat.previousTurn();
    } finally {
      target.disabled = false;
    }
  }

  static async #onNext(event, target) {
    const combat = game.combat;
    if ( !combat ) return;
    target.disabled = true;
    try {
      await combat.nextTurn();
    } finally {
      target.disabled = false;
    }
  }

  static async #onStartCombat(event, target) {
    const combat = game.combat;
    if ( !combat ) return;
    target.disabled = true;
    try {
      await combat.startCombat();
    } finally {
      target.disabled = false;
    }
  }

  static async #onRestartTimer() {
    await Timer.restartTimer(game.combat);
  }

  static async #onQuickRoll(event, target) {
    const combat = game.combat;
    if ( !combat ) return;
    target.disabled = true;
    try {
      if ( Sides.isSideMode(combat) ) await Sides.rollPartyNPCs(combat);
      else await combat.rollNPC();
    } finally {
      target.disabled = false;
    }
  }

  static async #onRollInitiative(event, target) {
    const combatant = this.#combatantFor(target);
    if ( !combatant?.isOwner ) return;
    return rollInitiativeFor(combatant, event);
  }

  /* -------------------------------------------- */
  /*  Menus                                       */
  /* -------------------------------------------- */

  /** Right-click menu on a portrait. */
  #slotMenuItems() {
    const get = target => this.#combatantFor(target);
    const onScene = c => canvas.ready && !!c?.token?.object;
    const isGM = () => game.user.isGM;
    const isEvent = target => Sides.isEvent(get(target));
    return [
      {
        label: loc("Menu.EditEvent"),
        icon: "fa-solid fa-pen-to-square",
        visible: target => isGM() && isEvent(target),
        onClick: (event, target) => Events.openEventDialog(get(target)?.parent, get(target))
      },
      {
        label: loc("Menu.PanTo"),
        icon: "fa-solid fa-crosshairs",
        visible: target => onScene(get(target)) && get(target).token.object.visible,
        onClick: (event, target) => panToCombatant(get(target))
      },
      {
        label: loc("Menu.Ping"),
        icon: "fa-solid fa-bullseye",
        visible: target => onScene(get(target)) && get(target).token.object.visible
          && game.user.hasPermission("PING_CANVAS"),
        onClick: (event, target) => canvas.ping(get(target).token.object.center)
      },
      {
        label: loc("Menu.OpenSheet"),
        icon: "fa-solid fa-id-card",
        visible: target => !!get(target)?.actor?.testUserPermission(game.user, "OBSERVER"),
        onClick: (event, target) => get(target)?.actor?.sheet.render(true)
      },
      {
        label: loc("Menu.MarkDone"),
        icon: "fa-solid fa-check",
        visible: target => {
          const c = get(target);
          return !!c && Sides.canToggleDone(c) && !Sides.isDone(c);
        },
        onClick: (event, target) => Sides.setDone(get(target), true)
      },
      {
        label: loc("Menu.MarkNotDone"),
        icon: "fa-solid fa-rotate-left",
        visible: target => {
          const c = get(target);
          return !!c && Sides.canToggleDone(c) && Sides.isDone(c);
        },
        onClick: (event, target) => Sides.setDone(get(target), false)
      },
      {
        label: loc("Menu.RollInitiative"),
        icon: "fa-solid fa-dice-d20",
        visible: target => {
          const c = get(target);
          return !!c?.isOwner && !Sides.isEvent(c) && (!Sides.isSideMode(c.parent) || (Sides.getSide(c) === SIDES.party));
        },
        onClick: (event, target) => rollInitiativeFor(get(target), event)
      },
      {
        label: loc("Menu.MoveToParty"),
        icon: "fa-solid fa-shield-halved",
        visible: target => isGM() && !!get(target) && Sides.isSideMode(get(target).parent)
          && (Sides.getSide(get(target)) === SIDES.enemies),
        onClick: (event, target) => Sides.switchSide(get(target))
      },
      {
        label: loc("Menu.MoveToEnemies"),
        icon: "fa-solid fa-skull",
        visible: target => isGM() && !!get(target) && Sides.isSideMode(get(target).parent)
          && (Sides.getSide(get(target)) === SIDES.party),
        onClick: (event, target) => Sides.switchSide(get(target))
      },
      {
        label: loc("Menu.FinishesWith"),
        icon: "fa-solid fa-link",
        visible: target => isGM() && !!get(target)?.actor && Sides.isSideMode(get(target).parent)
          && (Sides.getSide(get(target)) === SIDES.party),
        onClick: (event, target) => Companions.chooseLeader(get(target))
      },
      {
        label: loc("Menu.ToggleHidden"),
        icon: "fa-solid fa-eye-slash",
        visible: target => isGM() && !!get(target),
        onClick: (event, target) => {
          const c = get(target);
          return c?.update({ hidden: !c.hidden });
        }
      },
      {
        label: loc("Menu.ToggleDefeated"),
        icon: "fa-solid fa-skull-crossbones",
        visible: target => isGM() && !!get(target) && !isEvent(target),
        onClick: async (event, target) => {
          const c = get(target);
          if ( !c ) return;
          const defeated = !c.isDefeated;
          await c.update({ defeated });
          await c.actor?.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { overlay: true, active: defeated });
        }
      },
      {
        label: loc("Menu.Remove"),
        icon: "fa-solid fa-trash",
        visible: target => isGM() && !!get(target),
        onClick: (event, target) => get(target)?.delete()
      }
    ];
  }

  /** The GM's ⋮ menu. */
  #gmMenuItems() {
    const combat = () => game.combat;
    const side = () => Sides.isSideMode(combat());
    return [
      {
        label: loc("Menu.RollNPCs"),
        icon: "fa-solid fa-users",
        visible: () => !!combat() && !side(),
        onClick: () => combat()?.rollNPC()
      },
      {
        label: loc("Menu.RollAll"),
        icon: "fa-solid fa-users-viewfinder",
        visible: () => !!combat() && !side(),
        onClick: () => combat()?.rollAll()
      },
      {
        label: loc("Menu.RollPartyNPCs"),
        icon: "fa-solid fa-users",
        visible: () => !!combat() && side(),
        onClick: () => Sides.rollPartyNPCs(combat())
      },
      {
        label: loc("Menu.RollParty"),
        icon: "fa-solid fa-users-viewfinder",
        visible: () => !!combat() && side(),
        onClick: () => Sides.rollParty(combat())
      },
      {
        label: loc("Menu.ResetInitiative"),
        icon: "fa-solid fa-arrow-rotate-left",
        visible: () => !!combat() && !side(),
        onClick: () => combat()?.resetAll()
      },
      {
        label: loc("Menu.ResetParty"),
        icon: "fa-solid fa-arrow-rotate-left",
        visible: () => !!combat() && side(),
        onClick: () => Sides.resetParty(combat())
      },
      {
        label: loc("Menu.AddEvent"),
        icon: "fa-solid fa-dungeon",
        visible: () => !!combat(),
        onClick: () => Events.openEventDialog(combat())
      },
      {
        label: loc("Menu.UseSide"),
        icon: "fa-solid fa-people-group",
        visible: () => !!combat() && !side(),
        onClick: () => Sides.setMode(combat(), MODES.side)
      },
      {
        label: loc("Menu.UseStandard"),
        icon: "fa-solid fa-list-ol",
        visible: () => !!combat() && side(),
        onClick: () => Sides.setMode(combat(), MODES.standard)
      },
      {
        label: loc("Menu.EndCombat"),
        icon: "fa-solid fa-xmark",
        visible: () => !!combat(),
        onClick: () => combat()?.endCombat()
      }
    ];
  }
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Individual initiative: can the current user end the turn by clicking this portrait? A player can, on their own
 * creature's portrait while it's that creature's turn. (The GM has the ▶ button, and a GM's click goes to the token.)
 * @param {Combatant} combatant
 */
export function canEndTurnByClick(combatant) {
  const combat = combatant?.parent;
  if ( !combat?.started || game.user.isGM || Sides.isSideMode(combat) ) return false;
  return (combatant === combat.combatant) && combatant.isOwner;
}

/** Drop dividers that have no portraits after them. */
function trimDividers(entries) {
  while ( entries.length && entries.at(-1).isDivider ) entries.pop();
  return entries;
}

/** Initiative as shown on a badge: whole numbers, since dnd5e's tie-break decimals only add noise. */
function formatInitiative(value) {
  if ( !Number.isFinite(value) ) return "";
  return String(Math.trunc(value));
}

/** friendly / neutral / hostile / secret, for the portrait's border colour. Players never see "secret". */
function dispositionClass(combatant) {
  const D = CONST.TOKEN_DISPOSITIONS;
  const disposition = combatant.token?.disposition ?? combatant.actor?.prototypeToken?.disposition;
  switch ( disposition ) {
    case D.FRIENDLY: return "friendly";
    case D.HOSTILE: return "hostile";
    case D.SECRET: return game.user.isGM ? "secret" : "neutral";
    default: return "neutral";
  }
}

/**
 * The image for a portrait: the combatant's own image if one was set, otherwise the token art or the actor
 * portrait (whichever the user prefers), skipping Foundry's placeholder silhouette.
 * @param {Combatant} combatant
 * @returns {Promise<string>}
 */
async function portraitFor(combatant) {
  const own = combatant._source?.img;
  const tokenSrc = combatant.token?.texture?.src;
  const actorSrc = combatant.actor?.img;
  const order = setting(SETTINGS.portraitSource) === "actor" ? [own, actorSrc, tokenSrc] : [own, tokenSrc, actorSrc];
  const isPlaceholder = src => (src === CONST.DEFAULT_TOKEN) || /mystery-man\.(svg|webp|png)$/i.test(src);
  const isVideo = src => foundry.helpers?.media?.VideoHelper?.hasVideoExtension?.(src) ?? /\.(webm|mp4|m4v|ogv)$/i.test(src);
  for ( const src of order ) {
    if ( !src || isPlaceholder(src) ) continue;
    if ( !isVideo(src) ) return src;
    if ( !thumbnails.has(src) ) {
      try {
        thumbnails.set(src, await game.video.createThumbnail(src, { width: 128, height: 128 }));
      } catch(err) {
        thumbnails.set(src, null);
      }
    }
    if ( thumbnails.get(src) ) return thumbnails.get(src);
  }
  return combatant.img || CONST.DEFAULT_TOKEN;
}

/**
 * The hit point bar, if this user should see it.
 * @param {Combatant} combatant
 * @returns {{pct: number, color: string, text: string, temp: boolean}|null}
 */
function prepareHp(combatant) {
  const mode = setting(SETTINGS.hpBars);
  if ( mode === "none" ) return null;
  if ( (mode === "owner") && !(game.user.isGM || combatant.isOwner) ) return null;
  const hp = combatant.actor?.system?.attributes?.hp;
  const max = Number(hp?.effectiveMax ?? hp?.max);
  const value = Number(hp?.value);
  if ( !Number.isFinite(max) || (max <= 0) || !Number.isFinite(value) ) return null;
  const fraction = Math.clamp(value / max, 0, 1);
  const temp = Math.max(0, Number(hp.temp) || 0);
  return {
    pct: Math.round(fraction * 100),
    color: `hsl(${Math.round(fraction * 120)}, 80%, 42%)`,
    text: `${value} / ${max}${temp ? ` (+${temp})` : ""}`,
    temp: temp > 0
  };
}

/**
 * Move the view to a combatant's token, selecting it first if it's yours. Like clicking a row in Foundry's tracker.
 * @param {Combatant} combatant
 * @param {object} [options]
 * @param {boolean} [options.control=false]
 */
function panToCombatant(combatant, { control=false }={}) {
  const token = combatant?.token?.object;
  if ( !canvas.ready || !token || token.destroyed || !token.visible ) return;
  if ( control && token.isOwner ) token.control({ releaseOthers: true });
  canvas.animatePan({ x: token.center.x, y: token.center.y });
}

/**
 * Roll initiative for one combatant. In dnd5e this opens the usual roll dialog (advantage and so on).
 * @param {Combatant} combatant
 * @param {Event} [event]
 */
async function rollInitiativeFor(combatant, event) {
  if ( !combatant ) return;
  const actor = combatant.actor;
  if ( (game.system.id === "dnd5e") && (typeof actor?.rollInitiativeDialog === "function") ) {
    return actor.rollInitiativeDialog({ event });
  }
  return combatant.parent.rollInitiative([combatant.id]);
}
