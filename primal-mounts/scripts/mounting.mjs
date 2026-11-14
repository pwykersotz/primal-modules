import { ICONS, MODULE_ID } from "./constants.mjs";
import { execute, notifyUser, registerHandler } from "./socket.mjs";
import {
  asDoc, controlOf, escapeHTML, flag, getMountOf, getPair, getRiderOf, gridInfo, intersectArea, isIncapacitated, isMidiActive,
  loc, moveDoc, mountedCombatantItem, rectArea, rectCenter, rectContains, rulesVersion, sameLevel, setting, sizeLabel,
  sizeRank, tokenRect, walkSpeed
} from "./util.mjs";

/* -------------------------------------------- */
/*  Finding partners                            */
/* -------------------------------------------- */

/**
 * Decide which of two tokens rides and which carries.
 * @returns {{rider: TokenDocument, mount: TokenDocument}|null}
 */
export function resolveRoles(a, b) {
  const ra = sizeRank(a);
  const rb = sizeRank(b);
  if ( ra < rb ) return { rider: a, mount: b };
  if ( rb < ra ) return { rider: b, mount: a };
  if ( setting("enforceSize") ) return null;
  // Same size with the size rule off: the token being handled climbs onto the other one.
  return { rider: a, mount: b };
}

/**
 * Tokens that this token has been dropped onto (or that were dropped onto it) and could form a mount pair with it.
 * @param {TokenDocument} doc
 * @returns {{other: TokenDocument, rider: TokenDocument, mount: TokenDocument, overlap: number}[]}
 */
export function mountCandidates(doc) {
  doc = asDoc(doc);
  if ( !doc?.parent || !doc.actor || getPair(doc) ) return [];
  const rect = tokenRect(doc);
  const { distance } = gridInfo(doc.parent);
  const out = [];
  for ( const other of doc.parent.tokens ) {
    if ( (other.id === doc.id) || !other.actor || getPair(other) ) continue;
    if ( other.hidden && !game.user.isGM ) continue;
    if ( !sameLevel(doc, other) ) continue;
    if ( Math.abs((doc.elevation ?? 0) - (other.elevation ?? 0)) > distance ) continue;
    const otherRect = tokenRect(other);
    const overlap = intersectArea(rect, otherRect);
    if ( overlap <= 0 ) continue;
    const [small, big] = rectArea(rect) <= rectArea(otherRect) ? [rect, otherRect] : [otherRect, rect];
    if ( !rectContains(big, rectCenter(small)) && (overlap < 0.5 * rectArea(small)) ) continue;
    const roles = resolveRoles(doc, other);
    if ( !roles ) continue;
    out.push({ other, overlap, ...roles });
  }
  return out.sort((x, y) => y.overlap - x.overlap);
}

/**
 * Can this user put the rider on the mount?
 * @returns {{ok: boolean, reason?: string}}
 */
export function canMount(rider, mount, user) {
  if ( !rider || !mount || (rider.id === mount.id) || (rider.parent !== mount.parent) ) {
    return { ok: false, reason: loc("Notify.InvalidPair") };
  }
  if ( getPair(rider) || getPair(mount) ) return { ok: false, reason: loc("Notify.AlreadyMounted") };
  if ( setting("enforceSize") && (sizeRank(mount) <= sizeRank(rider)) ) {
    return {
      ok: false,
      reason: loc("Notify.TooSmall", {
        mount: mount.name, rider: rider.name, mountSize: sizeLabel(mount), riderSize: sizeLabel(rider)
      })
    };
  }
  if ( user.isGM ) return { ok: true };
  const ownsRider = rider.canUserModify(user, "update");
  const ownsMount = mount.canUserModify(user, "update");
  if ( !ownsRider && !ownsMount ) return { ok: false, reason: loc("Notify.NoPermission") };
  if ( !setting("playersMountUnowned") && !(ownsRider && ownsMount) ) {
    return { ok: false, reason: loc("Notify.NeedBoth") };
  }
  return { ok: true };
}

/** Pixel offset that centres the rider on the mount. */
export function centerOffset(rider, mount) {
  const r = tokenRect(rider);
  const m = tokenRect(mount);
  return { x: Math.round((m.w - r.w) / 2), y: Math.round((m.h - r.h) / 2) };
}

/** Move the rider onto the mount's centre (if it is not already there). */
export async function placeRider(rider, mount) {
  const offset = flag(rider, "offset") ?? centerOffset(rider, mount);
  const dest = { x: Math.round(mount.x + offset.x), y: Math.round(mount.y + offset.y), elevation: mount.elevation };
  if ( mount.level ) dest.level = mount.level;
  const there = (rider.x === dest.x) && (rider.y === dest.y) && (rider.elevation === dest.elevation)
    && (!dest.level || (rider.level === dest.level));
  if ( !there ) await moveDoc(rider, dest, { ignoreWalls: true, extra: { follow: true } });
}

/* -------------------------------------------- */
/*  Client entry points                         */
/* -------------------------------------------- */

function ownsEverything(...docs) {
  return docs.every(d => d && d.isOwner);
}

/** Suggest whether a mount would accept being controlled. */
function suggestedControl(mount) {
  const actor = mount.actor;
  if ( actor?.type === "character" ) return "independent";
  const int = actor?.system?.abilities?.int?.value;
  return Number.isFinite(int) && (int > 5) ? "independent" : "controlled";
}

async function chooseControl(rider, mount) {
  const suggested = suggestedControl(mount);
  if ( !setting("askControl") ) return suggested;
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if ( !DialogV2 ) return suggested;
  const content = `
    <p>${loc("Dialog.ControlPrompt", { rider: escapeHTML(rider.name), mount: escapeHTML(mount.name) })}</p>
    <p class="hint"><strong>${loc("Control.Controlled")}:</strong> ${loc("Dialog.ControlledHint")}</p>
    <p class="hint"><strong>${loc("Control.Independent")}:</strong> ${loc("Dialog.IndependentHint")}</p>`;
  return DialogV2.wait({
    window: { title: loc("Dialog.ControlTitle"), icon: ICONS.mount },
    classes: ["primal-mounts-dialog"],
    content,
    buttons: [
      { action: "controlled", label: loc("Control.Controlled"), icon: ICONS.controlled,
        default: suggested === "controlled" },
      { action: "independent", label: loc("Control.Independent"), icon: ICONS.independent,
        default: suggested === "independent" }
    ],
    rejectClose: false
  });
}

async function choosePartner(doc, candidates) {
  if ( candidates.length === 1 ) return candidates[0];
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if ( !DialogV2 ) return candidates[0];
  const choice = await DialogV2.wait({
    window: { title: loc("Dialog.PartnerTitle"), icon: ICONS.mount },
    content: `<p>${loc("Dialog.PartnerPrompt", { token: escapeHTML(doc.name) })}</p>`,
    buttons: candidates.slice(0, 6).map((c, i) => ({
      action: String(i),
      label: loc("Dialog.PartnerOption", { rider: c.rider.name, mount: c.mount.name }),
      default: i === 0
    })),
    rejectClose: false
  });
  return choice === null || choice === undefined ? null : candidates[Number(choice)];
}

/** Called from the Token HUD Mount button. */
export async function requestMount(token) {
  const doc = asDoc(token);
  const candidates = mountCandidates(doc);
  if ( !candidates.length ) return ui.notifications.warn(loc("Notify.NothingToMount"));
  const pick = await choosePartner(doc, candidates);
  if ( !pick ) return;
  const { rider, mount } = pick;
  const check = canMount(rider, mount, game.user);
  if ( !check.ok ) return ui.notifications.warn(check.reason);
  const control = await chooseControl(rider, mount);
  if ( !control ) return;
  return execute("mount", { sceneId: rider.parent.id, riderId: rider.id, mountId: mount.id, control }, {
    local: ownsEverything(rider, mount, rider.actor, mount.actor)
  });
}

/** Called from the Token HUD Unmount button (or the API). */
export async function requestUnmount(token, { prone = false, reason = "voluntary" } = {}) {
  const pair = getPair(token);
  if ( !pair ) return;
  return execute("unmount", { sceneId: pair.rider.parent.id, tokenId: pair.rider.id, prone, reason }, {
    local: ownsEverything(pair.rider, pair.mount, pair.rider.actor, pair.mount.actor)
  });
}

export async function requestToggleControl(token) {
  const pair = getPair(token);
  if ( !pair ) return;
  return execute("toggleControl", { sceneId: pair.mount.parent.id, mountId: pair.mount.id }, {
    local: ownsEverything(pair.mount, pair.mount.actor)
  });
}

/* -------------------------------------------- */
/*  Effects                                     */
/* -------------------------------------------- */

function effectData({ kind, name, img, description, changes = [] }) {
  const data = {
    name, img, description: description ?? "", disabled: false, transfer: false,
    flags: { [MODULE_ID]: { kind } }
  };
  // The effects live on the sheets for the rules; the token itself shows the module's saddle badge instead of
  // effect icons, which would cover the art.
  if ( game.release.generation >= 14 ) {
    data.showIcon = CONST.ACTIVE_EFFECT_SHOW_ICON?.NEVER ?? 0;
    if ( changes.length ) data.system = { changes: changes.map(c => ({
      key: c.key, value: String(c.value), type: "override", phase: "initial"
    })) };
  } else {
    if ( changes.length ) data.changes = changes.map(c => ({
      key: c.key, value: String(c.value), mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, priority: 50
    }));
  }
  return data;
}

/** Midi-QOL evasion-style flag that implements Leap Aside while it applies. */
function leapAsideChanges({ rider, mount }) {
  if ( !isMidiActive() || !setting("mountedCombatant") ) return [];
  const feat = mountedCombatantItem(rider.actor);
  if ( !feat ) return [];
  if ( (rulesVersion(feat) === "modern") && (isIncapacitated(rider.actor) || isIncapacitated(mount.actor)) ) return [];
  return [{ key: "flags.midi-qol.superSaver.dex", value: 1 }];
}

function riddenEffectName({ rider, mount }) {
  const key = controlOf(mount) === "controlled" ? "Effect.RiddenControlled" : "Effect.RiddenIndependent";
  return loc(key, { rider: rider.name });
}

export async function removeModuleEffects(actor, kind) {
  if ( !actor ) return;
  const ids = actor.effects.filter(e => e.flags?.[MODULE_ID]?.kind === kind).map(e => e.id);
  if ( ids.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", ids, { primalMounts: { internal: true } });
}

async function createEffect(actor, data) {
  if ( !actor ) return;
  try {
    await actor.createEmbeddedDocuments("ActiveEffect", [data], { primalMounts: { internal: true } });
  } catch(err) {
    // Retry without changes in case this core version stores effect changes differently.
    console.warn(`${MODULE_ID} | effect creation failed, retrying without changes`, err);
    const fallback = foundry.utils.deepClone(data);
    delete fallback.changes;
    delete fallback.system;
    await actor.createEmbeddedDocuments("ActiveEffect", [fallback], { primalMounts: { internal: true } });
  }
}

async function applyMountEffects(pair) {
  const { rider, mount } = pair;
  await removeModuleEffects(rider.actor, "mounted");
  await removeModuleEffects(mount.actor, "ridden");
  await createEffect(rider.actor, effectData({
    kind: "mounted",
    name: loc("Effect.Mounted", { mount: mount.name }),
    img: ICONS.mountedEffect,
    description: loc("Effect.MountedDescription")
  }));
  await createEffect(mount.actor, effectData({
    kind: "ridden",
    name: riddenEffectName(pair),
    img: ICONS.riddenEffect,
    description: loc(controlOf(mount) === "controlled" ? "Effect.ControlledDescription"
      : "Effect.IndependentDescription"),
    changes: leapAsideChanges(pair)
  }));
}

/** Rename the mount's effect and refresh the Leap Aside flag after a state change. */
export async function refreshRiddenEffect(pair) {
  const effect = pair.mount.actor?.effects.find(e => e.flags?.[MODULE_ID]?.kind === "ridden");
  if ( !effect ) return;
  const changes = leapAsideChanges(pair);
  const update = { name: riddenEffectName(pair) };
  if ( game.release.generation >= 14 ) {
    update["system.changes"] = changes.map(c => ({ key: c.key, value: String(c.value), type: "override", phase: "initial" }));
  } else {
    update.changes = changes.map(c => ({
      key: c.key, value: String(c.value), mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, priority: 50
    }));
  }
  try {
    await effect.update(update, { primalMounts: { internal: true } });
  } catch(err) {
    console.warn(`${MODULE_ID} | could not refresh the ridden effect`, err);
  }
}

/* -------------------------------------------- */
/*  Initiative                                  */
/* -------------------------------------------- */

/** A controlled mount's initiative changes to match its rider's; it acts immediately after them. */
export async function syncInitiative(pair) {
  if ( controlOf(pair.mount) !== "controlled" ) return;
  const sceneId = pair.rider.parent?.id;
  for ( const combat of game.combats ?? [] ) {
    const find = doc => combat.combatants.find(c => (c.tokenId === doc.id) && (!c.sceneId || (c.sceneId === sceneId)));
    const riderCombatant = find(pair.rider);
    const mountCombatant = find(pair.mount);
    if ( !riderCombatant || !mountCombatant || !Number.isFinite(riderCombatant.initiative) ) continue;
    const target = Math.round((riderCombatant.initiative - 0.01) * 100) / 100;
    if ( mountCombatant.initiative !== target ) await combat.setInitiative(mountCombatant.id, target);
  }
}

/* -------------------------------------------- */
/*  Dismounting                                 */
/* -------------------------------------------- */

/** The nearest unoccupied space touching the mount that the rider can step to. */
export function findDismountSpot(scene, mount, rider) {
  const { sx, sy } = gridInfo(scene);
  const m = tokenRect(mount);
  const r = tokenRect(rider);
  const center = rectCenter(m);
  const blockers = scene.tokens
    .filter(t => (t.id !== mount.id) && (t.id !== rider.id) && sameLevel(t, mount))
    .map(t => tokenRect(t));
  const spots = [];
  const minX = -Math.ceil(r.w / sx);
  const maxX = Math.ceil(m.w / sx);
  const minY = -Math.ceil(r.h / sy);
  const maxY = Math.ceil(m.h / sy);
  for ( let ix = minX; ix <= maxX; ix++ ) {
    for ( let iy = minY; iy <= maxY; iy++ ) {
      const spot = { x: m.x + (ix * sx), y: m.y + (iy * sy), w: r.w, h: r.h };
      if ( intersectArea(spot, m) > 0 ) continue;
      const gx = Math.max(0, spot.x - (m.x + m.w), m.x - (spot.x + spot.w));
      const gy = Math.max(0, spot.y - (m.y + m.h), m.y - (spot.y + spot.h));
      if ( (gx > 0.5) || (gy > 0.5) ) continue;
      if ( blockers.some(b => intersectArea(b, spot) > 1) ) continue;
      const c = rectCenter(spot);
      if ( blockedByWall(scene, center, c) ) continue;
      // Prefer the closest space, then clockwise from the east side.
      const angle = (Math.atan2(c.y - center.y, c.x - center.x) + (2 * Math.PI)) % (2 * Math.PI);
      spots.push({ x: Math.round(spot.x), y: Math.round(spot.y), d: Math.hypot(c.x - center.x, c.y - center.y), angle });
    }
  }
  spots.sort((a, b) => (a.d - b.d) || (a.angle - b.angle));
  const best = spots[0] ?? { x: Math.round(m.x + m.w), y: Math.round(m.y) };
  const dest = { x: best.x, y: best.y, elevation: mount.elevation };
  if ( mount.level ) dest.level = mount.level;
  return dest;
}

function blockedByWall(scene, from, to) {
  if ( scene !== canvas?.scene ) return false;
  try {
    const backend = CONFIG.Canvas.polygonBackends?.move;
    return !!backend?.testCollision(from, to, { type: "move", mode: "any" });
  } catch(err) {
    return false;
  }
}

/* -------------------------------------------- */
/*  Chat                                        */
/* -------------------------------------------- */

/**
 * Post a module chat card.
 * @param {string} body               Inner HTML.
 * @param {object} [options]
 * @param {TokenDocument} [options.token]  Speaker token.
 * @param {string[]} [options.whisper]
 * @param {boolean} [options.force]   Post even when informational cards are turned off (cards with buttons).
 */
export async function postCard(body, { token, whisper, force = false, title } = {}) {
  if ( !force && !setting("chatCards") ) return null;
  const header = title ? `<header class="pm-card-title"><i class="${ICONS.mount}"></i> ${title}</header>` : "";
  const data = {
    content: `<div class="primal-mounts-card">${header}${body}</div>`,
    speaker: token ? ChatMessage.getSpeaker({ token }) : ChatMessage.getSpeaker()
  };
  if ( whisper?.length ) data.whisper = whisper;
  return ChatMessage.create(data);
}

function mountCard(pair, ownSpeed) {
  const { rider, mount } = pair;
  const controlled = controlOf(mount) === "controlled";
  const speed = ownSpeed ?? walkSpeed(rider.actor);
  const units = gridInfo(rider.parent).units ?? "ft";
  const parts = [
    `<p>${loc("Chat.Mounted", { rider: escapeHTML(rider.name), mount: escapeHTML(mount.name) })}</p>`,
    speed ? `<p>${loc("Chat.MountCost", { cost: Math.floor(speed / 2), units, speed })}</p>` : "",
    `<p>${loc(controlled ? "Chat.ControlledRules" : "Chat.IndependentRules", { mount: escapeHTML(mount.name) })}</p>`
  ];
  const feat = mountedCombatantItem(rider.actor);
  if ( feat && setting("mountedCombatant") ) {
    parts.push(`<p>${loc(rulesVersion(feat) === "legacy" ? "Chat.FeatLegacy" : "Chat.FeatModern",
      { rider: escapeHTML(rider.name) })}</p>`);
  }
  if ( rulesVersion(feat) === "legacy" ) parts.push(`<p class="pm-note">${loc("Chat.OpportunityLegacy")}</p>`);
  return parts.join("");
}

/* -------------------------------------------- */
/*  Privileged operations                       */
/* -------------------------------------------- */

registerHandler("mount", async ({ sceneId, riderId, mountId, control }, user) => {
  const scene = game.scenes.get(sceneId);
  const rider = scene?.tokens.get(riderId);
  const mount = scene?.tokens.get(mountId);
  const check = canMount(rider, mount, user);
  if ( !check.ok ) return notifyUser(user, check.reason);
  control = control === "independent" ? "independent" : "controlled";
  const offset = centerOffset(rider, mount);
  // Mounting costs half the rider's own Speed (read before it starts borrowing the mount's speeds).
  const ownSpeed = walkSpeed(rider.actor);
  await scene.updateEmbeddedDocuments("Token", [
    { _id: rider.id, [`flags.${MODULE_ID}`]: { mount: mount.id, offset, rider: null, control: null, veer: null } },
    { _id: mount.id, [`flags.${MODULE_ID}`]: { rider: rider.id, control, mount: null, offset: null, veer: null } }
  ], { primalMounts: { internal: true } });
  const pair = { rider: scene.tokens.get(riderId), mount: scene.tokens.get(mountId) };
  await placeRider(pair.rider, pair.mount);
  await applyMountEffects(pair);
  await syncInitiative(pair);
  await postCard(mountCard(pair, ownSpeed), { token: pair.rider, title: loc("Chat.MountTitle") });
  Hooks.callAll(`${MODULE_ID}.mount`, pair, { control, userId: user.id });
});

registerHandler("unmount", async ({ sceneId, tokenId, prone = false, reason = "voluntary" }, user) => {
  const scene = game.scenes.get(sceneId);
  const pair = getPair(scene?.tokens.get(tokenId));
  if ( !pair ) return;
  const { rider, mount } = pair;
  if ( !user.isGM && !rider.canUserModify(user, "update") && !mount.canUserModify(user, "update") ) {
    return notifyUser(user, loc("Notify.NoPermission"));
  }
  await scene.updateEmbeddedDocuments("Token", [
    { _id: rider.id, [`flags.${MODULE_ID}`]: { mount: null, offset: null } },
    { _id: mount.id, [`flags.${MODULE_ID}`]: { rider: null, control: null, veer: null } }
  ], { primalMounts: { internal: true } });
  await removeModuleEffects(rider.actor, "mounted");
  await removeModuleEffects(mount.actor, "ridden");
  // Back on its own feet: re-prepare so the rider's own speeds apply again right away.
  try {
    rider.actor?.reset?.();
  } catch(err) { /* refreshed on the next tick anyway */ }
  await moveDoc(rider, findDismountSpot(scene, mount, rider), { ignoreWalls: true });
  if ( prone && rider.actor && !rider.actor.statuses?.has("prone") ) {
    await rider.actor.toggleStatusEffect("prone", { active: true });
  }
  const key = {
    voluntary: "Chat.Dismounted", fell: "Chat.FellOff", mountFell: "Chat.MountFell", removed: "Chat.Separated"
  }[reason] ?? "Chat.Dismounted";
  const speed = walkSpeed(rider.actor);
  const units = gridInfo(scene).units ?? "ft";
  let body = `<p>${loc(key, { rider: escapeHTML(rider.name), mount: escapeHTML(mount.name) })}</p>`;
  if ( (reason === "voluntary") && speed ) body += `<p>${loc("Chat.DismountCost", { cost: Math.floor(speed / 2), units })}</p>`;
  await postCard(body, { token: rider, title: loc("Chat.UnmountTitle") });
  Hooks.callAll(`${MODULE_ID}.unmount`, { rider, mount }, { reason, prone, userId: user.id });
});

registerHandler("toggleControl", async ({ sceneId, mountId }, user) => {
  const scene = game.scenes.get(sceneId);
  const pair = getPair(scene?.tokens.get(mountId));
  if ( !pair ) return;
  if ( !user.isGM && !pair.mount.canUserModify(user, "update") ) return notifyUser(user, loc("Notify.NoPermission"));
  const control = controlOf(pair.mount) === "controlled" ? "independent" : "controlled";
  await pair.mount.update({ [`flags.${MODULE_ID}.control`]: control }, { primalMounts: { internal: true } });
  const fresh = { rider: pair.rider, mount: scene.tokens.get(mountId) };
  await refreshRiddenEffect(fresh);
  await syncInitiative(fresh);
  await postCard(`<p>${loc(control === "controlled" ? "Chat.NowControlled" : "Chat.NowIndependent", {
    rider: escapeHTML(fresh.rider.name), mount: escapeHTML(fresh.mount.name)
  })}</p>`, { token: fresh.mount });
});

/** Clean up a pair when one of its tokens is deleted (GM only). */
export async function onTokenDeleted(doc) {
  if ( !game.user.isActiveGM ) return;
  const scene = doc.parent;
  const mountId = flag(doc, "mount");
  const riderId = flag(doc, "rider");
  if ( mountId ) {
    const mount = scene?.tokens.get(mountId);
    if ( mount && (flag(mount, "rider") === doc.id) ) {
      await mount.update({ [`flags.${MODULE_ID}`]: { rider: null, control: null, veer: null } }, { primalMounts: { internal: true } });
      await removeModuleEffects(mount.actor, "ridden");
    }
    if ( doc.actorLink ) await removeModuleEffects(doc.actor, "mounted");
  }
  if ( riderId ) {
    const rider = scene?.tokens.get(riderId);
    if ( rider && (flag(rider, "mount") === doc.id) ) {
      await rider.update({ [`flags.${MODULE_ID}`]: { mount: null, offset: null } }, { primalMounts: { internal: true } });
      await removeModuleEffects(rider.actor, "mounted");
    }
    if ( doc.actorLink ) await removeModuleEffects(doc.actor, "ridden");
  }
}

/** Drop half-broken links and stray effects left behind (GM only, on scene load). */
export async function repairScene(scene) {
  if ( !game.user.isActiveGM || !scene ) return;
  const updates = [];
  for ( const t of scene.tokens ) {
    if ( flag(t, "mount") && !getMountOf(t) ) updates.push({ _id: t.id, [`flags.${MODULE_ID}`]: { mount: null, offset: null } });
    else if ( flag(t, "rider") && !getPair(t) ) updates.push({ _id: t.id, [`flags.${MODULE_ID}`]: { rider: null, control: null, veer: null } });
  }
  if ( updates.length ) await scene.updateEmbeddedDocuments("Token", updates, { primalMounts: { internal: true } });
  for ( const t of scene.tokens ) {
    const actor = t.actor;
    if ( !actor?.effects?.some(e => e.flags?.[MODULE_ID]) ) continue;
    const docs = actor.isToken ? [t]
      : game.scenes.contents.flatMap(s => s.tokens.filter(x => x.actorLink && (x.actorId === actor.id)));
    if ( !docs.some(x => getMountOf(x)) ) await removeModuleEffects(actor, "mounted");
    if ( !docs.some(x => getRiderOf(x)) ) await removeModuleEffects(actor, "ridden");
    await hideEffectIcons(actor);
  }
  // Riders that drifted out of the saddle (position or elevation) go back on their mount.
  for ( const t of scene.tokens ) {
    const mount = getMountOf(t);
    if ( mount ) await placeRider(t, mount);
  }
  Hooks.callAll(`${MODULE_ID}.repair`, scene);
}

/** Effects made by earlier versions showed icons on the token; turn those off. */
async function hideEffectIcons(actor) {
  const never = CONST.ACTIVE_EFFECT_SHOW_ICON?.NEVER ?? 0;
  const updates = actor.effects.filter(e => e.flags?.[MODULE_ID]?.kind).map(e => {
    if ( game.release.generation >= 14 ) return e.showIcon !== never ? { _id: e.id, showIcon: never } : null;
    return e.statuses?.size ? { _id: e.id, statuses: [] } : null;
  }).filter(Boolean);
  if ( updates.length ) {
    await actor.updateEmbeddedDocuments("ActiveEffect", updates, { primalMounts: { internal: true } });
  }
}
