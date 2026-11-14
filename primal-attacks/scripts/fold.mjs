/**
 * Folding a set of attacks' own chat cards into its summary (with Midi-QOL).
 *
 * Each Midi-QOL workflow of a set posts its own card, and Midi-QOL may post an "HP Updated" card for each hit. Those
 * cards carry the set's id (flags.primal-attacks.member), and they're hidden in the chat log once the set's summary is
 * there, or while the set is still being rolled. The cards themselves are kept: a button on the summary shows them
 * again (for Midi-QOL's buttons and undo), and they come back if the summary is deleted or never posted.
 */
import { FLAGS, MODULE_ID, SETTINGS, loc, setting } from "./constants.mjs";

/** How long a card waits hidden for its summary. */
const PENDING_MS = 5 * 60 * 1000;

/** Sets whose cards this user asked to see. */
const revealed = new Set();

/** Sets with a summary in the chat log (built when first needed). */
let summarized = null;

/** Timers that show a set's cards again if its summary never comes. */
const timers = new Map();

/** Fold the cards of sets of attacks? (Only when there's a summary for them to fold into.) */
export function foldsCards() {
  return (setting(SETTINGS.foldCards) !== false) && (setting(SETTINGS.summaryCard) !== false);
}

/** The set of attacks a chat card belongs to, if any. */
export function memberOf(message) {
  return message?.getFlag?.(MODULE_ID, FLAGS.member) ?? message?.flags?.[MODULE_ID]?.[FLAGS.member] ?? null;
}

/** The set of attacks a summary is for, if any. */
function summaryOf(message) {
  return (message?.getFlag?.(MODULE_ID, FLAGS.summary) ?? message?.flags?.[MODULE_ID]?.[FLAGS.summary])?.group ?? null;
}

/** The sets that have a summary in the chat log. */
function summaryGroups() {
  if ( !summarized ) {
    summarized = new Set();
    for ( const message of game.messages ?? [] ) {
      const group = summaryOf(message);
      if ( group ) summarized.add(group);
    }
  }
  return summarized;
}

/** Has this set of attacks a summary in the chat log? */
export function hasSummary(group) {
  return !!group && summaryGroups().has(group);
}

/** Is this user looking at the cards of this set? */
export function isRevealed(group) {
  return revealed.has(group);
}

/**
 * Should this card be hidden from the chat log?
 * @param {ChatMessage} message
 * @param {number} [now]
 */
export function isFolded(message, now=Date.now()) {
  const group = memberOf(message);
  if ( !group || (setting(SETTINGS.foldCards) === false) || revealed.has(group) ) return false;
  if ( hasSummary(group) ) return true;
  const age = now - Number(message.timestamp ?? now);
  return age < PENDING_MS;
}

/** Hide or show the cards of a set that are drawn in the chat log (and its pop-outs and notifications). */
function refold(group) {
  if ( typeof document === "undefined" ) return;
  const escape = globalThis.CSS?.escape ?? (s => String(s).replace(/["\\]/g, "\\$&"));
  for ( const element of document.querySelectorAll(`[data-primal-group="${escape(group)}"]`) ) {
    const message = game.messages?.get?.(element.dataset.messageId);
    element.classList.toggle("primal-attacks-folded", !!message && isFolded(message));
  }
  for ( const button of document.querySelectorAll(`.primal-attacks-cards[data-group="${escape(group)}"]`) ) {
    button.innerHTML = buttonLabel(group);
  }
}

/** The summary's button. */
export function buttonLabel(group) {
  const shown = revealed.has(group);
  return `<i class="fa-solid ${shown ? "fa-eye-slash" : "fa-eye"}" inert></i> `
    + loc(shown ? "Summary.HideCards" : "Summary.ShowCards");
}

/** Show or hide the cards of a set, for this user. */
export function toggleCards(group) {
  if ( revealed.has(group) ) revealed.delete(group);
  else revealed.add(group);
  refold(group);
  return revealed.has(group);
}

/** A card is drawn: hide it if it belongs to a set of attacks whose summary has it. */
function onRender(message, html) {
  try {
    const group = memberOf(message);
    if ( !group ) return;
    const element = html instanceof HTMLElement ? html : html?.[0];
    if ( !element ) return;
    element.dataset.primalGroup = group;
    element.classList.add("primal-attacks-member");
    const folded = isFolded(message);
    element.classList.toggle("primal-attacks-folded", folded);
    // Waiting for the summary: show the cards again if it never comes.
    if ( folded && !hasSummary(group) && !timers.has(group) ) {
      const wait = PENDING_MS - (Date.now() - Number(message.timestamp ?? Date.now())) + 500;
      timers.set(group, setTimeout(() => {
        timers.delete(group);
        refold(group);
      }, Math.max(1000, wait)));
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not fold an attack card`, err);
  }
}

/** A summary arrives (hide its set's cards) or is deleted (show them again). */
function onSummary(message, added) {
  const group = summaryOf(message);
  if ( !group ) return;
  if ( added ) summaryGroups().add(group);
  else summaryGroups().delete(group);
  clearTimeout(timers.get(group));
  timers.delete(group);
  refold(group);
}

/** Called during init. */
export function registerFoldHooks() {
  Hooks.on("renderChatMessageHTML", onRender);
  Hooks.on("createChatMessage", message => onSummary(message, true));
  Hooks.on("deleteChatMessage", message => onSummary(message, false));
}
