/**
 * Multiattack in one go: a creature's whole routine ("one Bite and two Claws") from one window.
 *
 * Using a creature's Multiattack (or the API's openMultiattack) opens a window listing its attacks, each with how many
 * times to make it. Primal CR, when it's on, reads the Multiattack's text to fill those numbers in; without it they
 * start at 0 and the GM picks. Rolling then uses each attack in turn, with its number of attacks already set in its
 * Attack Roll window (still changeable there), so each one rolls as a set of attacks with its own summary. Anything
 * else the Multiattack uses ("and it uses Frightful Presence") is listed too, and used once.
 */
import { MAX_ATTACKS, MODULE_ID, SETTINGS, escapeHTML, loc, setting } from "./constants.mjs";
import { clampCount, presetCount } from "./dialog.mjs";
import { isRunning } from "./engine.mjs";

/** Is this item a creature's Multiattack? */
export function isMultiattack(item) {
  return /^multi-?attack$/i.test(String(item?.name ?? "").trim());
}

/** The activities a routine can use: every attack, and anything Primal CR found the Multiattack uses. */
function routineActivities(actor) {
  const out = [];
  for ( const item of actor?.items ?? [] ) {
    if ( isMultiattack(item) ) continue;
    for ( const activity of item.system?.activities ?? [] ) {
      if ( activity.type === "attack" ) out.push({ item, activity });
    }
  }
  return out;
}

/**
 * Primal CR's reading of the creature's Multiattack: [{itemId, activityId, count}], or null without Primal CR, or if
 * it couldn't read it.
 * @param {Actor} actor
 */
export function plannedRoutine(actor) {
  const cr = game.modules?.get("primal-cr");
  if ( !cr?.active || (typeof cr.api?.read !== "function") ) return null;
  try {
    const profile = cr.api.read(actor);
    if ( !profile?.multiattack?.length ) return null;
    return profile.multiattack.map(e => {
      const option = profile.options?.[e.index];
      return option?.itemId ? { itemId: option.itemId, activityId: option.activityId ?? null, count: e.count } : null;
    }).filter(Boolean);
  } catch(err) {
    console.warn(`${MODULE_ID} | Primal CR couldn't read ${actor.name}'s Multiattack`, err);
    return null;
  }
}

/**
 * The rows of the window: each attack (and anything else the plan uses), with its starting number.
 * @param {Actor} actor
 * @param {object[]|null} plan
 * @returns {{item: Item, activity: Activity, count: number, label: string}[]}
 */
export function routineRows(actor, plan) {
  const rows = routineActivities(actor).map(({ item, activity }) => ({ item, activity, count: 0 }));
  for ( const step of plan ?? [] ) {
    const item = actor.items.get(step.itemId);
    if ( !item ) continue;
    const activities = [...(item.system?.activities ?? [])];
    const activity = (step.activityId && activities.find(a => a.id === step.activityId))
      ?? activities.find(a => a.type === "attack") ?? activities[0];
    if ( !activity ) continue;
    const row = rows.find(r => r.activity === activity);
    if ( row ) row.count += step.count;
    else rows.push({ item, activity, count: step.count });
  }
  for ( const row of rows ) {
    const several = (row.item.system?.activities?.size ?? 1) > 1;
    row.label = several && row.activity.name ? `${row.item.name}: ${row.activity.name}` : row.item.name;
  }
  return rows;
}

/** Wait until the creature's set of attacks is finished (or a while has passed). */
async function settle(actor, seconds=120) {
  const until = Date.now() + (seconds * 1000);
  await new Promise(r => setTimeout(r, 300));
  while ( isRunning(actor) && (Date.now() < until) ) await new Promise(r => setTimeout(r, 250));
}

/**
 * Use each step of a routine in turn.
 * @param {Actor} actor
 * @param {{activity: Activity, count: number, label?: string}[]} steps
 */
export async function rollRoutine(actor, steps) {
  const list = steps.filter(s => s.activity && (s.count > 0));
  if ( !list.length ) return;
  try {
    const text = list.map(s => `${s.count} × ${escapeHTML(s.label ?? s.activity.item?.name ?? s.activity.name)}`).join(", ");
    await ChatMessage.implementation.create({
      content: `<p><strong>${escapeHTML(loc("Multiattack.Title"))}:</strong> ${text}</p>`,
      speaker: ChatMessage.implementation.getSpeaker({ actor })
    });
  } catch(err) {
    console.warn(`${MODULE_ID} | Could not post the Multiattack card`, err);
  }
  for ( const step of list ) {
    const { activity } = step;
    const times = activity.type === "attack" ? 1 : clampCount(step.count);
    for ( let i = 0; i < times; i++ ) {
      if ( activity.type === "attack" ) presetCount(activity.uuid, step.count);
      try {
        const used = await activity.use();
        if ( used === null || used === false ) return; // closed or cancelled: the rest of the routine stops too
      } catch(err) {
        console.error(`${MODULE_ID} | ${step.label ?? activity.name} failed`, err);
      }
      await settle(actor);
    }
  }
}

/**
 * The window: each attack with its number, then roll them all.
 * @param {Actor} actor
 */
export async function openMultiattack(actor) {
  if ( !actor?.isOwner ) return null;
  const plan = plannedRoutine(actor);
  const rows = routineRows(actor, plan);
  if ( !rows.length ) {
    ui.notifications?.warn(loc("Multiattack.NoAttacks", { name: actor.name }));
    return null;
  }
  const hint = plan ? loc("Multiattack.HintRead") : loc("Multiattack.HintPick");
  const fields = rows.map((row, i) => `
    <div class="form-group">
      <label for="pa-ma-${i}">${escapeHTML(row.label)}</label>
      <div class="form-fields"><input type="number" id="pa-ma-${i}" name="n${i}" value="${row.count}" min="0" max="${MAX_ATTACKS}" step="1"></div>
    </div>`).join("");
  const data = await foundry.applications.api.DialogV2.input({
    window: { title: loc("Multiattack.WindowTitle", { name: actor.name }), icon: "fa-solid fa-burst" },
    position: { width: 400 },
    content: `<p class="hint">${escapeHTML(hint)}</p>${fields}`,
    ok: { label: loc("Multiattack.Roll"), icon: "fa-solid fa-dice-d20" },
    rejectClose: false
  });
  if ( !data ) return null;
  const steps = rows.map((row, i) => ({ ...row, count: Math.max(0, Math.min(MAX_ATTACKS, Math.floor(Number(data[`n${i}`]) || 0))) }));
  await rollRoutine(actor, steps);
  return steps.filter(s => s.count > 0);
}

/** Using a Multiattack item (with or without an activity) opens the window, for whoever used it. */
function onMultiattackUsed(item) {
  if ( !isMultiattack(item) || !item.actor?.isOwner || !setting(SETTINGS.multiattackWindow) ) return;
  if ( item.actor.type === "character" ) return;
  openMultiattack(item.actor).catch(err => console.error(`${MODULE_ID} | The Multiattack window failed`, err));
}

let lastOpened = { uuid: null, at: 0 };
function once(item) {
  const now = Date.now();
  if ( (lastOpened.uuid === item?.uuid) && ((now - lastOpened.at) < 1000) ) return false;
  lastOpened = { uuid: item?.uuid, at: now };
  return true;
}

/** Called during init. */
export function registerMultiattackHooks() {
  Hooks.on("dnd5e.postUseActivity", activity => {
    const item = activity?.item;
    if ( isMultiattack(item) && once(item) ) onMultiattackUsed(item);
  });
  // A Multiattack with no activity just shows its card.
  Hooks.on("dnd5e.displayCard", item => {
    if ( isMultiattack(item) && !(item.system?.activities?.size) && once(item) ) onMultiattackUsed(item);
  });
}
