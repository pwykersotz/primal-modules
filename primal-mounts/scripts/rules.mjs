import { MODULE_ID, VEER_WINDOW } from "./constants.mjs";
import { postCard, refreshRiddenEffect, syncInitiative } from "./mounting.mjs";
import { execute, notifyUser, registerHandler } from "./socket.mjs";
import {
  actorTokenDocs, controlOf, escapeHTML, flag, getMountOf, getPair, getRiderOf, isIncapacitated, isMidiActive, loc,
  mountedCombatantItem, ownerIds, pairEntries, rulesVersion, setting, sizeRank, withinFiveFeet
} from "./util.mjs";

/** Raw (pre-resistance) damage for each damage application, so a Veer redirect can re-apply it to the rider. */
const rawDamage = new WeakMap();

/** Mounts with a fall-off check in progress. */
const fallLocks = new Set();

export function registerRules() {
  Hooks.on("dnd5e.preRollAttackV2", onPreRollAttack);
  Hooks.on("dnd5e.rollAttackV2", onRollAttack);
  Hooks.on("dnd5e.preCalculateDamage", onPreCalculateDamage);
  Hooks.on("dnd5e.preApplyDamage", onPreApplyDamage);
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("createActiveEffect", onCreateEffect);
  Hooks.on("updateActiveEffect", onUpdateEffect);
  Hooks.on("deleteActiveEffect", onDeleteEffect);
  Hooks.on("createCombatant", combatant => syncCombatant(combatant));
  Hooks.on("updateCombatant", (combatant, changes) => {
    if ( changes && ("initiative" in changes) ) syncCombatant(combatant);
  });
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);

  // A rider is held up by its mount: clear any Falling status it picked up before mounting or from earlier
  // versions.
  const clear = pair => clearRiderFalling(pair).catch(err => console.error(`${MODULE_ID} | ${err}`));
  Hooks.on(`${MODULE_ID}.mount`, pair => clear(pair));

  // Mounting or dismounting changes the rider's speeds: re-prepare the rider on every client.
  Hooks.on("updateToken", (doc, changes) => {
    const data = changes?.flags?.[MODULE_ID];
    if ( !data || !("mount" in data) || !doc.actor ) return;
    refreshRiderActors([doc.actor]);
  });
  // Only the viewed (or active) scene's pairs count, so changing scenes changes who is mounted: re-prepare every
  // rider in any scene, so one that is not mounted here gets its own speeds back.
  Hooks.on("canvasReady", () => refreshAllRiders());
  Hooks.on("updateScene", (scene, changes) => {
    if ( changes && ("active" in changes) ) refreshAllRiders();
  });
  Hooks.on(`${MODULE_ID}.repair`, scene => {
    for ( const t of scene.tokens ) {
      const pair = getPair(t);
      if ( pair?.rider === t ) clear(pair);
    }
  });
}

function ownsAll(...docs) {
  return docs.every(d => d && d.isOwner);
}

function names(pair) {
  return { rider: escapeHTML(pair.rider.name), mount: escapeHTML(pair.mount.name) };
}

/* -------------------------------------------- */
/*  Falling (dnd5e 6+)                          */
/* -------------------------------------------- */

/**
 * dnd5e marks a token Falling when it is above the ground and can't fly. A rider is held up by its mount, so a
 * rider is falling only when its mount is (a flying mount keeps its rider aloft), and asking a falling rider to
 * plummet brings the mount down with the rider on it. Called during setup.
 */
export function patchFalling() {
  const proto = CONFIG.Token?.documentClass?.prototype;
  if ( !proto || (typeof proto._isFalling !== "function") || proto._isFalling.primalMounts ) return;
  const isFalling = proto._isFalling;
  const patchedIsFalling = function(...args) {
    const mount = getMountOf(this);
    if ( mount ) {
      try {
        return !!mount._isFalling();
      } catch(err) {
        return false;
      }
    }
    return isFalling.apply(this, args);
  };
  patchedIsFalling.primalMounts = true;
  proto._isFalling = patchedIsFalling;

  if ( typeof proto.plummet === "function" ) {
    const plummet = proto.plummet;
    const patchedPlummet = function(...args) {
      const mount = getMountOf(this);
      if ( mount && (typeof mount.plummet === "function") ) return mount.plummet(...args);
      return plummet.apply(this, args);
    };
    patchedPlummet.primalMounts = true;
    proto.plummet = patchedPlummet;
  }
}

/** Is the rider's Falling status wrong because its mount is holding it up? */
function riderWronglyFalling(rider, mount) {
  if ( !rider.actor?.statuses?.has("falling") ) return false;
  try {
    if ( typeof mount._isFalling === "function" ) return !mount._isFalling();
  } catch(err) { /* fall through */ }
  return !mount.actor?.statuses?.has("falling");
}

/** Clear a Falling status a mounted rider should not have (active GM). */
export async function clearRiderFalling(pair) {
  if ( !pair?.rider?.actor || !riderWronglyFalling(pair.rider, pair.mount) ) return;
  await pair.rider.actor.toggleStatusEffect("falling", { active: false });
}

/* -------------------------------------------- */
/*  Speeds                                      */
/* -------------------------------------------- */

/** The mount this actor is riding in the viewed (or active) scene, if any. */
function mountActorOf(actor) {
  for ( const doc of actorTokenDocs(actor) ) {
    const mount = getMountOf(doc);
    if ( mount?.actor ) return mount.actor;
  }
  return null;
}

/** Does this actor carry a rider somewhere? Returns the riders' actors. */
function riderActorsOf(actor) {
  const out = new Set();
  for ( const doc of actorTokenDocs(actor) ) {
    const rider = getRiderOf(doc);
    if ( rider?.actor ) out.add(rider.actor);
  }
  return out;
}

/**
 * Give a rider its mount's final movement speeds (after the mount's own conditions, bonuses and multipliers).
 * Works with dnd5e 6+ (movement.speeds.*) and earlier (movement.*).
 */
export function applyMountSpeeds(actor) {
  const mount = mountActorOf(actor);
  const src = mount?.system?.attributes?.movement;
  const dst = actor?.system?.attributes?.movement;
  if ( !src || !dst ) return false;
  const srcSpeeds = (src.speeds && (typeof src.speeds === "object")) ? src.speeds : src;
  const dstSpeeds = (dst.speeds && (typeof dst.speeds === "object")) ? dst.speeds : dst;
  const types = Object.keys(CONFIG.DND5E?.movementTypes ?? { walk: 1, burrow: 1, climb: 1, fly: 1, swim: 1 })
    .filter(t => t !== "jump"); // jumping is the rider's own
  let applied = false;
  for ( const type of types ) {
    const value = Number(srcSpeeds[type]);
    if ( !Number.isFinite(value) ) continue;
    dstSpeeds[type] = value;
    applied = true;
  }
  if ( !applied ) return false;
  if ( "speed" in src ) dst.speed = src.speed;
  if ( "max" in src ) dst.max = src.max;
  if ( "slowed" in src ) dst.slowed = src.slowed;
  if ( "hover" in src ) dst.hover = src.hover;
  if ( src.units ) dst.units = src.units;
  return true;
}

/** Re-prepare the actor of every token that is a rider in any scene. */
function refreshAllRiders() {
  const actors = new Set();
  for ( const scene of game.scenes ?? [] ) {
    for ( const t of scene.tokens ) if ( flag(t, "mount") && t.actor ) actors.add(t.actor);
  }
  if ( actors.size ) refreshRiderActors(actors);
}

const riderResets = new Set();
let riderResetTimer = null;

/** Re-prepare these actors (and redraw their open sheets) on the next tick. */
export function refreshRiderActors(actors) {
  for ( const a of actors ) if ( a ) riderResets.add(a);
  if ( riderResetTimer ) return;
  riderResetTimer = setTimeout(() => {
    riderResetTimer = null;
    const list = [...riderResets];
    riderResets.clear();
    for ( const actor of list ) {
      try {
        if ( typeof actor.reset === "function" ) actor.reset();
        else actor.prepareData?.();
        if ( actor.sheet?.rendered ) actor.sheet.render(false);
        for ( const token of actor.getActiveTokens?.() ?? [] ) token.renderFlags?.set({ refreshBars: true });
      } catch(err) {
        console.error(`${MODULE_ID} | could not refresh ${actor.name}`, err);
      }
    }
  }, 0);
}

/**
 * While mounted, a rider moves at its mount's speeds. Patch actor data preparation so the rider's prepared speeds
 * are the mount's, and so riders are refreshed whenever their mount's data changes. Called during setup.
 */
export function patchSpeeds() {
  const proto = CONFIG.Actor?.documentClass?.prototype;
  if ( !proto || (typeof proto.prepareDerivedData !== "function") || proto.prepareDerivedData.primalMounts ) return;
  const prepareDerivedData = proto.prepareDerivedData;
  const patched = function(...args) {
    const result = prepareDerivedData.apply(this, args);
    try {
      applyMountSpeeds(this);
      const riders = riderActorsOf(this);
      if ( riders.size ) refreshRiderActors(riders);
    } catch(err) {
      console.error(`${MODULE_ID} | could not apply mount speeds`, err);
    }
    return result;
  };
  patched.primalMounts = true;
  proto.prepareDerivedData = patched;
}

/* -------------------------------------------- */
/*  Mounted Combatant: Mounted Strike           */
/* -------------------------------------------- */

/**
 * 2024: advantage on attack rolls against an unmounted creature within 5 feet of your mount that is at least one
 * size smaller than the mount. 2014: advantage on melee attack rolls against an unmounted creature smaller than
 * your mount.
 */
function onPreRollAttack(config, dialog, message) {
  if ( !setting("mountedCombatant") ) return;
  const activity = config?.subject;
  const actor = activity?.actor;
  const feat = mountedCombatantItem(actor);
  if ( !feat ) return;
  const entry = pairEntries(actor).find(e => (e.pair.rider === e.doc) && (e.doc.parent === canvas?.scene));
  if ( !entry ) return;
  const { mount } = entry.pair;
  const rules = rulesVersion(feat);
  if ( rules === "legacy" ) {
    const type = activity.getActionType?.(config.attackMode) ?? activity.actionType;
    if ( !String(type ?? "").startsWith("m") ) return;
  }
  const targets = [...(game.user.targets ?? [])].map(t => t.document).filter(Boolean);
  if ( !targets.length ) return;
  const mountRank = sizeRank(mount);
  const qualifies = targets.every(t => (t !== entry.doc) && (t !== mount) && !getMountOf(t)
    && (sizeRank(t) < mountRank) && ((rules === "legacy") || withinFiveFeet(t, mount)));
  if ( !qualifies ) return;
  config.advantage = true;
  for ( const roll of config.rolls ?? [] ) {
    roll.options ??= {};
    roll.options.advantage = true;
  }
  if ( message?.data ) message.data.flavor = `${message.data.flavor ?? ""} (${loc("Rules.MountedStrike")})`.trim();
}

/* -------------------------------------------- */
/*  Mounted Combatant: Veer / redirect          */
/* -------------------------------------------- */

/** When an attack hits a mount whose rider has Mounted Combatant, offer the rider the chance to take the hit. */
function onRollAttack(rolls, data = {}) {
  if ( !setting("mountedCombatant") ) return;
  const roll = rolls?.[0];
  if ( !roll ) return;
  const attacker = data.subject?.actor;
  for ( const target of game.user.targets ?? [] ) {
    const mount = target.document;
    const rider = getRiderOf(mount);
    if ( !rider || (attacker && (rider.actor === attacker)) ) continue;
    const feat = mountedCombatantItem(rider.actor);
    if ( !feat || isIncapacitated(rider.actor) ) continue;
    const ac = mount.actor?.system?.attributes?.ac?.value;
    const hit = roll.isCritical || (!roll.isFumble && Number.isFinite(ac) && (roll.total >= ac));
    if ( !hit ) continue;
    postVeerCard({ pair: { rider, mount }, attacker, roll, rules: rulesVersion(feat) })
      .catch(err => console.error(`${MODULE_ID} | could not post the Veer card`, err));
  }
}

async function postVeerCard({ pair, attacker, roll, rules }) {
  const { rider, mount } = pair;
  const n = names(pair);
  const riderAC = rider.actor?.system?.attributes?.ac?.value;
  const legacy = rules === "legacy";
  const hitsRider = roll.isCritical || !Number.isFinite(riderAC) || (roll.total >= riderAC);
  const mode = (!legacy || hitsRider) ? "redirect" : "negate";
  const parts = [`<p>${loc("Chat.AttackHitsMount", {
    attacker: escapeHTML(attacker?.name ?? loc("Chat.AnAttacker")), mount: n.mount, total: roll.total
  })}</p>`];
  if ( legacy ) {
    parts.push(`<p>${loc("Chat.RedirectLegacy", { ...n, ac: riderAC ?? "?" })} ${
      loc(hitsRider ? "Chat.RedirectWouldHit" : "Chat.RedirectWouldMiss", n)}</p>`);
  } else {
    parts.push(`<p>${loc("Chat.VeerModern", n)}</p>`);
  }
  parts.push(`<p class="pm-note">${loc("Chat.VeerTiming")}</p>`);
  parts.push(`<button type="button" data-pm-action="veer" data-scene="${mount.parent.id}" data-mount="${mount.id}"
    data-rider="${rider.id}" data-mode="${mode}"><i class="fa-solid fa-shield-halved"></i> ${
    loc(legacy ? "Chat.RedirectButton" : "Chat.VeerButton", n)}</button>`);
  await postCard(parts.join(""), {
    token: rider, whisper: ownerIds(rider.actor), force: true,
    title: loc(legacy ? "Rules.RedirectTitle" : "Rules.VeerTitle")
  });
}

function veerArmed(mount) {
  const veer = flag(mount, "veer");
  return !!veer?.at && ((game.time.serverTime - veer.at) < VEER_WINDOW);
}

registerHandler("armVeer", async ({ sceneId, mountId, riderId, mode }, user) => {
  const scene = game.scenes.get(sceneId);
  const mount = scene?.tokens.get(mountId);
  const rider = scene?.tokens.get(riderId);
  if ( !mount || !rider || (getRiderOf(mount) !== rider) ) return notifyUser(user, loc("Notify.PairGone"));
  if ( !user.isGM && !rider.actor?.testUserPermission(user, "OWNER") ) return notifyUser(user, loc("Notify.NoPermission"));
  const veer = { rider: riderId, mode: mode === "negate" ? "negate" : "redirect", at: game.time.serverTime };
  await mount.update({ [`flags.${MODULE_ID}.veer`]: veer }, { primalMounts: { internal: true } });
  await postCard(`<p>${loc(veer.mode === "negate" ? "Chat.RedirectArmedMiss" : "Chat.VeerArmed", names({ rider, mount }))}</p>`,
    { token: rider });
});

registerHandler("clearVeer", async ({ sceneId, mountId }) => {
  const mount = game.scenes.get(sceneId)?.tokens.get(mountId);
  if ( flag(mount, "veer") ) await mount.update({ [`flags.${MODULE_ID}.veer`]: null }, { primalMounts: { internal: true } });
});

registerHandler("applyDamage", async ({ actorUuid, mountUuid, damages, options = {} }, user) => {
  const actor = await fromUuid(actorUuid);
  const mountActor = mountUuid ? await fromUuid(mountUuid) : null;
  if ( !actor ) return;
  if ( !user.isGM && !mountActor?.testUserPermission(user, "OWNER") ) return;
  const list = Array.isArray(damages)
    ? damages.map(d => ({ ...d, properties: new Set(d.properties ?? []) }))
    : damages;
  await actor.applyDamage(list, { ...options, primalMounts: { veer: true } });
});

/* -------------------------------------------- */
/*  Damage: Leap Aside & Veer                   */
/* -------------------------------------------- */

function onPreCalculateDamage(actor, damages, options) {
  if ( options && Array.isArray(damages) ) {
    try {
      rawDamage.set(options, damages.map(d => ({
        value: d.value, type: d.type, properties: Array.from(d.properties ?? [])
      })));
    } catch(err) { /* non-extensible options object */ }
  }
  leapAside(actor, damages, options);
}

/**
 * Leap Aside: if the ridden mount makes a Dexterity save against an effect that deals half damage on a success,
 * it takes no damage on a success and half on a failure. Midi-QOL handles this itself through the
 * flags.midi-qol.superSaver.dex flag that the Ridden effect carries, so this only runs without Midi-QOL.
 * The save outcome is read from the damage multiplier: half (a success) becomes none, full (a failure) becomes half.
 */
function leapAside(actor, damages, options) {
  if ( !options || !Array.isArray(damages) || !setting("mountedCombatant") || isMidiActive() ) return;
  const entry = pairEntries(actor).find(e => e.pair.mount === e.doc);
  if ( !entry ) return;
  const { rider, mount } = entry.pair;
  const feat = mountedCombatantItem(rider.actor);
  if ( !feat ) return;
  if ( (rulesVersion(feat) === "modern") && (isIncapacitated(rider.actor) || isIncapacitated(mount.actor)) ) return;
  const message = options.origin ?? options.originatingMessage;
  let activity = null;
  try {
    activity = message?.getAssociatedActivity?.();
  } catch(err) { return; }
  if ( activity?.type !== "save" ) return;
  const abilities = activity.save?.ability;
  const dex = (abilities instanceof Set) ? abilities.has("dex")
    : Array.isArray(abilities) ? abilities.includes("dex") : (abilities === "dex");
  if ( !dex || ((activity.damage?.onSave ?? "half") !== "half") ) return;
  const multiplier = options.multiplier ?? 1;
  const factor = multiplier === 0.5 ? 0 : (multiplier === 1 ? 0.5 : null);
  if ( factor === null ) return;
  const healing = CONFIG.DND5E?.healingTypes ?? {};
  for ( const d of damages ) {
    if ( !(d.type in healing) ) d.value *= factor;
  }
}

/** Veer: the next damage applied to the mount after the rider chose to take the hit goes to the rider instead. */
function onPreApplyDamage(actor, amount, updates, options) {
  if ( options?.primalMounts || !(amount > 0) ) return;
  const entry = pairEntries(actor).find(e => (e.pair.mount === e.doc) && veerArmed(e.doc));
  if ( !entry ) return;
  const { rider, mount } = entry.pair;
  const veer = flag(mount, "veer");
  execute("clearVeer", { sceneId: mount.parent.id, mountId: mount.id }, { local: mount.isOwner })
    .catch(err => console.error(`${MODULE_ID} | could not clear Veer`, err));
  const n = names({ rider, mount });
  if ( veer.mode === "negate" ) {
    postCard(`<p>${loc("Chat.RedirectMissed", n)}</p>`, { token: rider });
    return false;
  }
  const raw = rawDamage.get(options);
  if ( rider.actor?.isOwner ) {
    const damages = raw ? raw.map(d => ({ ...d, properties: new Set(d.properties) })) : amount;
    rider.actor.applyDamage(damages, { ...options, primalMounts: { veer: true } })
      .catch(err => console.error(`${MODULE_ID} | Veer damage failed`, err));
  } else {
    const forward = { multiplier: options.multiplier, isDelta: options.isDelta, only: options.only };
    execute("applyDamage", {
      actorUuid: rider.actor?.uuid, mountUuid: mount.actor?.uuid, damages: raw ?? amount,
      options: Object.fromEntries(Object.entries(forward).filter(([, v]) => v !== undefined))
    });
  }
  postCard(`<p>${loc("Chat.VeerApplied", n)}</p>`, { token: rider });
  return false;
}

/* -------------------------------------------- */
/*  Controlled mounts                           */
/* -------------------------------------------- */

/** A controlled mount can only Dash, Disengage, or Dodge on its turn. */
function onPreUseActivity(activity) {
  const mode = setting("controlledMountActions");
  if ( mode === "off" ) return;
  const actor = activity?.actor;
  if ( !actor ) return;
  const entry = pairEntries(actor).find(e => (e.pair.mount === e.doc) && (controlOf(e.doc) === "controlled"));
  if ( !entry ) return;
  const combat = game.combat;
  if ( !combat?.started || !combat.combatants.some(c => c.tokenId === entry.doc.id) ) return;
  if ( activity.activation?.type !== "action" ) return;
  const label = `${activity.name ?? ""} ${activity.item?.name ?? ""}`;
  if ( /\b(dash|disengage|dodge)\b/i.test(label) ) return;
  const text = loc("Notify.ControlledAction", { mount: entry.doc.name, rider: entry.pair.rider.name });
  if ( mode === "block" ) {
    ui.notifications.warn(`${text} ${loc("Notify.Blocked")}`);
    return false;
  }
  ui.notifications.warn(text);
}

/** Keep a controlled mount's initiative right behind its rider's (GM only). */
function syncCombatant(combatant) {
  if ( !game.user.isActiveGM ) return;
  const doc = combatant.token;
  const pair = getPair(doc);
  if ( pair ) syncInitiative(pair).catch(err => console.error(`${MODULE_ID} | initiative sync failed`, err));
}

/* -------------------------------------------- */
/*  Falling off                                 */
/* -------------------------------------------- */

const INCAP_KEYS = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious", "dead"];

function touchesIncapacitation(statuses) {
  const defeated = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  return !!statuses && [...INCAP_KEYS, defeated].some(s => statuses.has(s));
}

function effectActor(effect) {
  const parent = effect?.parent;
  return parent?.documentName === "Actor" ? parent : null;
}

function onCreateEffect(effect, options) {
  if ( !game.user.isActiveGM || options?.primalMounts ) return;
  const actor = effectActor(effect);
  if ( actor && !effect.disabled ) handleStatuses(actor, effect.statuses, true);
}

function onUpdateEffect(effect, changes, options) {
  if ( !game.user.isActiveGM || options?.primalMounts || !("disabled" in (changes ?? {})) ) return;
  const actor = effectActor(effect);
  if ( actor ) handleStatuses(actor, effect.statuses, !effect.disabled);
}

function onDeleteEffect(effect, options) {
  if ( !game.user.isActiveGM || options?.primalMounts ) return;
  const actor = effectActor(effect);
  if ( actor ) handleStatuses(actor, effect.statuses, false);
}

function handleStatuses(actor, statuses, added) {
  if ( !statuses?.size ) return;
  const defeated = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  for ( const { doc, pair } of pairEntries(actor) ) {
    // A rider is held up by its mount: undo a Falling status it should not have.
    if ( added && statuses.has("falling") && (pair.rider === doc) ) {
      setTimeout(() => clearRiderFalling(pair).catch(err => console.error(`${MODULE_ID} | ${err}`)), 50);
    }
    // A mount that stops falling (it can fly again, or landed) frees its rider too.
    if ( !added && statuses.has("falling") && (pair.mount === doc) ) {
      setTimeout(() => clearRiderFalling(pair).catch(err => console.error(`${MODULE_ID} | ${err}`)), 50);
    }
    if ( added && statuses.has("prone") ) {
      fallCheck(pair, pair.rider === doc ? "riderProne" : "mountProne");
    } else if ( added && statuses.has(defeated) && (pair.mount === doc) ) {
      fallCheck(pair, "mountDown");
    }
    if ( touchesIncapacitation(statuses) && isMidiActive() ) refreshRiddenEffect(pair);
  }
}

/** HUD button: an effect is about to move the mount against its will. */
export function forcedMovementSave(pair) {
  return fallCheck(pair, "forced", { interactive: true });
}

/**
 * DC 10 Dexterity save to stay mounted.
 * 2024: when the mount is moved against its will, or the rider or the mount is knocked Prone.
 * 2014: when the mount is moved against its will or the rider is knocked Prone; if the mount falls Prone the rider
 * is dismounted and lands Prone unless they use their reaction to land on their feet.
 * @param {{rider: TokenDocument, mount: TokenDocument}} pair
 * @param {"riderProne"|"mountProne"|"mountDown"|"forced"} cause
 * @param {object} [options]
 * @param {boolean} [options.interactive]  Roll here with the roll dialog (the rider's owner asked for it).
 */
export async function fallCheck(pair, cause, { interactive = false } = {}) {
  const key = pair.mount.uuid;
  if ( fallLocks.has(key) ) return;
  fallLocks.add(key);
  try {
    await runFallCheck(pair, cause, interactive);
  } catch(err) {
    console.error(`${MODULE_ID} | fall check failed`, err);
  } finally {
    fallLocks.delete(key);
  }
}

async function runFallCheck(pair, cause, interactive) {
  const { rider, mount } = pair;
  const n = names(pair);
  const rules = rulesVersion(mountedCombatantItem(rider.actor));
  const mode = interactive ? "roll" : setting("fallSaves");
  const title = loc("Chat.FallTitle");
  const why = `<p>${loc(`Chat.Cause.${cause}`, n)}</p>`;
  const unmount = prone => execute("unmount", {
    sceneId: rider.parent.id, tokenId: rider.id, prone, reason: cause === "riderProne" || cause === "forced" ? "fell" : "mountFell"
  }, { local: ownsAll(rider, mount, rider.actor, mount.actor) });

  if ( mode === "off" ) {
    await postCard(`${why}<p>${loc("Chat.FallReminder", n)}</p>`, { token: rider, title });
    return;
  }

  // 2014: a falling mount throws its rider; the rider's reaction can turn that into landing on their feet.
  if ( (rules === "legacy") && ((cause === "mountProne") || (cause === "mountDown")) ) {
    await unmount(true);
    await postCard(`${why}<p>${loc("Chat.ReactionOption", n)}</p><button type="button" data-pm-action="land"
      data-scene="${rider.parent.id}" data-rider="${rider.id}"><i class="fa-solid fa-person-walking"></i> ${
      loc("Chat.ReactionButton")}</button>`, { token: rider, whisper: ownerIds(rider.actor), force: true, title });
    return;
  }

  if ( mode === "prompt" ) {
    await postCard(`${why}<p>${loc("Chat.SavePrompt", n)}</p><button type="button" data-pm-action="fall-save"
      data-scene="${rider.parent.id}" data-rider="${rider.id}" data-cause="${cause}"><i class="fa-solid fa-dice-d20"></i> ${
      loc("Chat.SaveButton")}</button>`, { token: rider, whisper: ownerIds(rider.actor), force: true, title });
    return;
  }

  if ( !rider.actor?.rollSavingThrow ) return;
  if ( !interactive ) await postCard(why, { token: rider, title });
  const result = await rider.actor.rollSavingThrow(
    { ability: "dex", target: 10 },
    { configure: interactive },
    { data: { flavor: loc("Chat.SaveFlavor", { rider: rider.name }) } }
  );
  const roll = Array.isArray(result) ? result[0] : result;
  if ( !roll ) return;
  const success = roll.isSuccess ?? (roll.total >= 10);
  if ( !getPair(rider) ) return; // dismounted while the roll was pending
  if ( success ) {
    if ( (cause === "riderProne") && setting("removeProneOnSave") && rider.actor.statuses?.has("prone") ) {
      await rider.actor.toggleStatusEffect("prone", { active: false });
    }
    await postCard(`<p>${loc("Chat.KeepsSeat", n)}</p>`, { token: rider });
  } else {
    await unmount(true);
  }
}

/* -------------------------------------------- */
/*  Chat card buttons                           */
/* -------------------------------------------- */

function onRenderChatMessage(message, html) {
  const root = (html instanceof HTMLElement) ? html : html?.[0];
  if ( !root ) return;
  for ( const button of root.querySelectorAll("button[data-pm-action]") ) {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      onChatAction(button).catch(err => console.error(`${MODULE_ID} | chat action failed`, err));
    });
  }
}

async function onChatAction(button) {
  const data = button.dataset;
  const scene = game.scenes.get(data.scene);
  const rider = scene?.tokens.get(data.rider);
  if ( !rider ) return ui.notifications.warn(loc("Notify.PairGone"));
  if ( !rider.actor?.isOwner && !game.user.isGM ) return ui.notifications.warn(loc("Notify.NoPermission"));
  button.disabled = true;
  switch ( data.pmAction ) {
    case "veer": {
      const mount = scene.tokens.get(data.mount);
      if ( !mount || (getRiderOf(mount) !== rider) ) return ui.notifications.warn(loc("Notify.PairGone"));
      return execute("armVeer", { sceneId: scene.id, mountId: mount.id, riderId: rider.id, mode: data.mode },
        { local: mount.isOwner });
    }
    case "fall-save": {
      const pair = getPair(rider);
      if ( !pair ) return ui.notifications.warn(loc("Notify.PairGone"));
      return fallCheck(pair, data.cause || "forced", { interactive: true });
    }
    case "land": {
      if ( rider.actor?.statuses?.has("prone") ) await rider.actor.toggleStatusEffect("prone", { active: false });
      return postCard(`<p>${loc("Chat.LandsOnFeet", { rider: escapeHTML(rider.name) })}</p>`, { token: rider });
    }
  }
}
