/**
 * Lair actions and anything else that happens on an initiative count ("the ceiling cracks on initiative 10").
 *
 * An event is a combatant with no actor or token, marked by a flag: {count, notes, remind, source}. Its initiative is
 * its count, so Foundry's own tracker shows it in the right place too, and the count is put back if anyone clears it
 * (resetting initiative, say). Where it goes in the turn order is decided in sides.mjs (compareSides):
 * - individual initiative: on its count, losing ties, the way lair actions do;
 * - side initiative: just before the enemies' turn if its count beats the enemies' number, otherwise just after it.
 *
 * When an event's turn comes round, the GM gets a whispered reminder with its notes, and for a creature's lair actions,
 * links to them. A creature that has lair actions on an initiative count (dnd5e's "Lair action initiative" on the NPC
 * sheet) brings a lair action event into combat with it, and takes it away again when it leaves.
 */
import { EVENT_IMAGE, FLAGS, LAIR_IMAGE, MODULE_ID, SETTINGS, loc, setting } from "./constants.mjs";
import { eventCount, getActingMembers, isEvent, isSideMode } from "./sides.mjs";

/** Lair actions happen on initiative 20 unless a creature says otherwise. */
export const DEFAULT_COUNT = 20;

/* -------------------------------------------- */
/*  Reading events                              */
/* -------------------------------------------- */

/**
 * An event's settings.
 * @param {Combatant} combatant
 * @returns {{count: number|null, notes: string, remind: boolean, source: string|null}}
 */
export function getEventData(combatant) {
  const data = combatant.getFlag(MODULE_ID, FLAGS.event) ?? {};
  return {
    count: eventCount(combatant),
    notes: typeof data.notes === "string" ? data.notes : "",
    remind: data.remind !== false,
    source: data.source ?? null
  };
}

/**
 * The lair actions on a creature's sheet: items with an activity (or, for older items, an activation) of type "lair".
 * @param {Actor} actor
 * @returns {Item[]}
 */
export function lairActions(actor) {
  if ( !actor?.items ) return [];
  return actor.items.filter(item => {
    if ( activitiesOf(item).some(a => a?.activation?.type === "lair") ) return true;
    return item.system?.activation?.type === "lair";
  });
}

/** An item's dnd5e activities, as an array. */
function activitiesOf(item) {
  const activities = item.system?.activities;
  if ( !activities ) return [];
  if ( typeof activities.values === "function" ) return [...activities.values()];
  return Object.values(activities);
}

/**
 * The initiative count a creature's lair actions happen on, or null if it has none: dnd5e's lair action initiative,
 * or 20 for a creature with lair actions on its sheet but no count set.
 * @param {Actor} actor
 * @returns {number|null}
 */
export function lairCount(actor) {
  const initiative = actor?.system?.resources?.lair?.initiative;
  if ( Number.isFinite(initiative) ) return initiative;
  return lairActions(actor).length ? DEFAULT_COUNT : null;
}

/** A count as shown to people: whole numbers. */
function formatCount(count) {
  return Number.isFinite(count) ? String(Math.trunc(count)) : "?";
}

/* -------------------------------------------- */
/*  Adding and changing events                  */
/* -------------------------------------------- */

/**
 * Add an event to a combat (GM only).
 * @param {Combat} combat
 * @param {object} [data]
 * @param {string} [data.name]           Defaults to "Lair Action".
 * @param {number} [data.count=20]       The initiative count it happens on.
 * @param {string} [data.img]            Defaults to a lair picture.
 * @param {string} [data.notes]          What happens, for the GM's reminder.
 * @param {boolean} [data.hidden=false]  Hidden from players.
 * @param {boolean} [data.remind=true]   Whisper the GM a reminder when its turn comes.
 * @param {string|null} [data.source]    The actor whose lair this is (removed with it).
 * @returns {Promise<Combatant|null>}
 */
export async function addEvent(combat, data={}) {
  if ( !game.user.isGM || !combat ) return null;
  const [created] = await combat.createEmbeddedDocuments("Combatant", [eventSource(data)]);
  return created ?? null;
}

/** The Combatant data for a new event. */
function eventSource({ name, count=DEFAULT_COUNT, img, notes="", hidden=false, remind=true, source=null }={}) {
  count = Number(count);
  if ( !Number.isFinite(count) ) count = DEFAULT_COUNT;
  return {
    name: String(name ?? "").trim() || loc("Event.DefaultName"),
    img: img || LAIR_IMAGE,
    initiative: count,
    hidden: !!hidden,
    flags: { [MODULE_ID]: { [FLAGS.event]: { count, notes: String(notes ?? ""), remind: !!remind, source } } }
  };
}

/**
 * Change an event (GM only). Leave out what isn't changing.
 * @param {Combatant} combatant
 * @param {object} data   As for addEvent, except source.
 */
export async function updateEvent(combatant, { name, count, img, notes, hidden, remind }={}) {
  if ( !game.user.isGM || !isEvent(combatant) ) return combatant;
  const update = {};
  const flag = {};
  if ( name !== undefined ) update.name = String(name ?? "").trim() || combatant.name;
  if ( img !== undefined ) update.img = img || EVENT_IMAGE;
  if ( hidden !== undefined ) update.hidden = !!hidden;
  if ( (count !== undefined) && (count !== null) && Number.isFinite(Number(count)) ) {
    update.initiative = Number(count);
    flag.count = Number(count);
  }
  if ( notes !== undefined ) flag.notes = String(notes ?? "");
  if ( remind !== undefined ) flag.remind = !!remind;
  if ( Object.keys(flag).length ) update.flags = { [MODULE_ID]: { [FLAGS.event]: flag } };
  return combatant.update(update);
}

/**
 * The GM's form for adding an event, or changing one.
 * @param {Combat} combat
 * @param {Combatant} [combatant]   The event to change. Leave out to add one.
 */
export async function openEventDialog(combat, combatant=null) {
  if ( !game.user.isGM || !combat ) return null;
  const editing = !!combatant && isEvent(combatant);
  const current = editing
    ? { name: combatant.name, img: combatant._source?.img || "", hidden: combatant.hidden, ...getEventData(combatant) }
    : { name: loc("Event.DefaultName"), img: LAIR_IMAGE, hidden: false, count: DEFAULT_COUNT, notes: "", remind: true };
  const esc = foundry.utils.escapeHTML;
  const checked = value => (value ? "checked" : "");
  const content = `
    <div class="form-group">
      <label for="pc-event-name">${loc("Event.Name")}</label>
      <div class="form-fields"><input id="pc-event-name" type="text" name="name" value="${esc(current.name)}" autofocus></div>
    </div>
    <div class="form-group">
      <label for="pc-event-count">${loc("Event.Count")}</label>
      <div class="form-fields"><input id="pc-event-count" type="number" name="count" step="1" value="${current.count ?? DEFAULT_COUNT}"></div>
      <p class="hint">${loc("Event.CountHint")}</p>
    </div>
    <div class="form-group">
      <label>${loc("Event.Image")}</label>
      <div class="form-fields"><file-picker name="img" type="image" value="${esc(current.img)}"></file-picker></div>
    </div>
    <div class="form-group stacked">
      <label for="pc-event-notes">${loc("Event.Notes")}</label>
      <textarea id="pc-event-notes" name="notes" rows="4" placeholder="${esc(loc("Event.NotesPlaceholder"))}">${esc(current.notes)}</textarea>
    </div>
    <div class="form-group">
      <label for="pc-event-remind">${loc("Event.Remind")}</label>
      <div class="form-fields"><input id="pc-event-remind" type="checkbox" name="remind" ${checked(current.remind)}></div>
    </div>
    <div class="form-group">
      <label for="pc-event-hidden">${loc("Event.Hidden")}</label>
      <div class="form-fields"><input id="pc-event-hidden" type="checkbox" name="hidden" ${checked(current.hidden)}></div>
    </div>`;
  const data = await foundry.applications.api.DialogV2.input({
    window: { title: loc(editing ? "Event.EditTitle" : "Event.AddTitle"), icon: "fa-solid fa-dungeon" },
    position: { width: 460 },
    classes: ["primal-combat-event-dialog"],
    content,
    ok: { label: loc(editing ? "Event.Save" : "Event.Add"), icon: "fa-solid fa-check" },
    rejectClose: false
  });
  if ( !data ) return null;
  const values = {
    name: data.name,
    count: Number.isFinite(Number(data.count)) && (data.count !== null) && (data.count !== "") ? Number(data.count) : DEFAULT_COUNT,
    img: data.img || (editing ? EVENT_IMAGE : LAIR_IMAGE),
    notes: data.notes ?? "",
    hidden: !!data.hidden,
    remind: !!data.remind
  };
  try {
    if ( editing ) return await updateEvent(combatant, values);
    if ( !game.combats.has(combat.id) ) return null;
    return await addEvent(combat, values);
  } catch(err) {
    console.error(`${MODULE_ID} | Could not save the event`, err);
    ui.notifications.error(loc("Notify.EventFailed"));
    return null;
  }
}

/* -------------------------------------------- */
/*  Keeping the count                           */
/* -------------------------------------------- */

/**
 * preUpdateCombatant hook: an event keeps its count when its initiative is cleared, and a new number typed into the
 * tracker becomes its count.
 */
export function onPreUpdateCombatant(combatant, changes) {
  if ( !isEvent(combatant) || !("initiative" in changes) ) return;
  const value = changes.initiative;
  if ( Number.isFinite(value) ) {
    foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FLAGS.event}.count`, value);
    return;
  }
  const count = Number(combatant.getFlag(MODULE_ID, FLAGS.event)?.count);
  if ( Number.isFinite(count) ) changes.initiative = count;
}

/**
 * Put the events' counts back after Combat#resetAll, which clears everyone's initiative in one combat update (so
 * preUpdateCombatant doesn't see it). Foundry keeps the current combatant's turn as the order changes.
 * @param {Combat} combat
 * @param {{_id: string, initiative: number|null}[]} counts   The events' counts from before the reset.
 */
export async function restoreCounts(combat, counts) {
  const updates = counts.filter(({ _id, initiative }) => {
    const combatant = combat.combatants.get(_id);
    return combatant && Number.isFinite(initiative) && (combatant.initiative !== initiative);
  });
  if ( updates.length ) await combat.updateEmbeddedDocuments("Combatant", updates, { turnEvents: false });
}

/**
 * dnd5e.preCombatRecovery hook: dnd5e recovers uses for every combatant at each turn start, and fails on one without
 * an actor, which would stop the recovery of everyone after it. Events have nothing to recover.
 * @param {Combatant} combatant
 * @returns {false|void}
 */
export function onPreCombatRecovery(combatant) {
  if ( isEvent(combatant) || !combatant?.actor ) return false;
}

/* -------------------------------------------- */
/*  Reminders                                   */
/* -------------------------------------------- */

/** "combatId.round.eventId" for each reminder already whispered, so going back and forward doesn't repeat it. */
const reminded = new Set();

/**
 * updateCombat hook: when the turn moves forward onto an event, whisper the GM a reminder (active GM's client only).
 */
export function onUpdateCombat(combat, changes, options={}) {
  if ( !(("round" in changes) || ("turn" in changes)) ) return;
  if ( !combat.started || !game.users.activeGM?.isSelf ) return;
  if ( (options.direction === -1) || (options.turnEvents === false) ) return;
  remindEvents(combat).catch(err => console.error(`${MODULE_ID} | Could not post an event reminder`, err));
}

/**
 * Whisper the GM a reminder for each event whose turn it is now.
 * @param {Combat} combat
 */
export async function remindEvents(combat) {
  const current = combat.combatant;
  if ( !current || !isEvent(current) ) return;
  const events = isSideMode(combat) ? getActingMembers(combat).filter(isEvent) : [current];
  for ( const event of events ) {
    const data = getEventData(event);
    if ( !data.remind || event.isDefeated ) continue;
    const key = `${combat.id}.${combat.round}.${event.id}`;
    if ( reminded.has(key) ) continue;
    reminded.add(key);
    await postReminder(combat, event, data);
  }
}

/** The whispered reminder for one event. */
async function postReminder(combat, event, data) {
  const esc = foundry.utils.escapeHTML;
  const lines = [
    `<h3>${esc(event.name ?? "")}</h3>`,
    `<p class="pc-event-count">${loc("Chat.EventCount", { count: formatCount(data.count) })}</p>`
  ];
  const notes = data.notes.trim();
  if ( notes ) lines.push(`<p>${esc(notes).replace(/\n/g, "<br>")}</p>`);
  const actions = lairActions(sourceActor(combat, data.source));
  if ( actions.length ) {
    lines.push(`<p>${loc("Chat.LairActions")}</p>`);
    lines.push(`<ul>${actions.map(item => `<li>@UUID[${item.uuid}]{${esc(item.name)}}</li>`).join("")}</ul>`);
  }
  const ChatMessage = foundry.documents.ChatMessage.implementation;
  await ChatMessage.create({
    speaker: { alias: loc("Chat.EventSpeaker") },
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    content: `<div class="primal-combat-event-message">${lines.join("")}</div>`
  });
}

/**
 * The creature a lair belongs to: its combatant's actor if it's in the combat, otherwise the world actor.
 * @param {Combat} combat
 * @param {string|null} source   An actor id.
 * @returns {Actor|null}
 */
function sourceActor(combat, source) {
  if ( !source ) return null;
  const combatant = combat.combatants.find(c => !isEvent(c) && (c.actorId === source));
  return combatant?.actor ?? game.actors?.get(source) ?? null;
}

/* -------------------------------------------- */
/*  Lair actions that come with a creature      */
/* -------------------------------------------- */

/** combat -> ids of creatures that just joined and may bring lair actions. */
const pending = new Map();

/** Several creatures often join at once, so wait a moment and add their lair actions together. */
const flushLairs = foundry.utils.debounce(() => {
  const batches = [...pending];
  pending.clear();
  for ( const [combat, ids] of batches ) {
    addLairEvents(combat, ids).catch(err => console.error(`${MODULE_ID} | Could not add lair actions`, err));
  }
}, 250);

/**
 * createCombatant hook: a creature with lair actions brings a lair action event (active GM's client only).
 */
export function onCreateCombatant(combatant) {
  if ( isEvent(combatant) || !game.users.activeGM?.isSelf || !setting(SETTINGS.autoLairActions) ) return;
  if ( combatant.hasPlayerOwner || (lairCount(combatant.actor) === null) ) return;
  const combat = combatant.parent;
  if ( !combat ) return;
  if ( !pending.has(combat) ) pending.set(combat, new Set());
  pending.get(combat).add(combatant.id);
  flushLairs();
}

/**
 * Add a lair action event for each of these creatures that doesn't have one yet. One per creature, however many
 * tokens of it there are.
 * @param {Combat} combat
 * @param {Iterable<string>} ids   Combatant ids.
 */
export async function addLairEvents(combat, ids) {
  if ( !game.combats.has(combat.id) || !game.user.isGM ) return;
  const have = new Set(combat.combatants.filter(isEvent).map(c => getEventData(c).source).filter(Boolean));
  const data = [];
  for ( const id of ids ) {
    const combatant = combat.combatants.get(id);
    const source = combatant?.actorId;
    if ( !combatant || !source || have.has(source) ) continue;
    const count = lairCount(combatant.actor);
    if ( count === null ) continue;
    have.add(source);
    data.push(eventSource({
      name: loc("Event.LairName", { name: combatant.name }),
      count,
      img: LAIR_IMAGE,
      hidden: combatant.hidden,
      source
    }));
  }
  if ( data.length ) await combat.createEmbeddedDocuments("Combatant", data);
}

/**
 * deleteCombatant hook: when the last token of a creature leaves combat, its lair actions go too (active GM only).
 */
export function onDeleteCombatant(combatant) {
  if ( isEvent(combatant) || !game.users.activeGM?.isSelf ) return;
  const combat = combatant.parent;
  const source = combatant.actorId;
  if ( !combat || !source || !game.combats.has(combat.id) ) return;
  if ( combat.combatants.some(c => !isEvent(c) && (c.actorId === source)) ) return;
  const ids = combat.combatants.filter(c => isEvent(c) && (getEventData(c).source === source)).map(c => c.id);
  if ( ids.length ) {
    combat.deleteEmbeddedDocuments("Combatant", ids)
      .catch(err => console.error(`${MODULE_ID} | Could not remove lair actions`, err));
  }
}

/** deleteCombat hook: forget a combat that has ended. */
export function onDeleteCombat(combat) {
  pending.delete(combat);
  for ( const key of reminded ) {
    if ( key.startsWith(`${combat.id}.`) ) reminded.delete(key);
  }
}
