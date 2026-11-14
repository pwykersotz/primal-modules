/* ---------- Other animation modules: Token Magic FX and Sequencer ---------- */

/*
 * A status another module already animates on the token gets no animation from this module (and
 * keeps its icon), so the two don't pile up. Recognised:
 *  - Token Magic FX through an effect change (DAE's "macro.tokenMagic", as Convenient Effects and
 *    many effect packs use), or a Token Magic filter on the token named after the status or effect;
 *  - a Sequencer effect on the token whose origin is the effect (Automated Animations' active-effect
 *    animations) or that is named after the status or effect.
 * The GM can turn this off in the Token animations window.
 */
const TMFX_CHANGE_KEY = /^macro\.tokenmagic$/i;
// Never handed over: the whirl or shimmer is what keeps an unseen creature hidden from players
const NEVER_DEFERRED = new Set(["invis"]);

function moduleActive(id) {
  try { return !!game.modules?.get?.(id)?.active; } catch { return false; }
}

/** Lower-case names to match a status effect by: its status IDs and its own name. */
function effectMatchNames(effect) {
  const names = new Set();
  for (const s of effect?.statuses ?? []) if (typeof s === "string") names.add(s.toLowerCase());
  if (typeof effect?.name === "string" && effect.name) names.add(effect.name.toLowerCase());
  return names;
}

/** The Token Magic filter IDs on a token (lower case). */
function tokenMagicFilterIds(token) {
  const ids = new Set();
  const filters = token?.document?.flags?.tokenmagic?.filters;
  if (!Array.isArray(filters)) return ids;
  for (const f of filters) {
    const id = f?.tmFilters?.tmFilterId ?? f?.tmFilters?.tmParams?.filterId ?? f?.filterId;
    if (typeof id === "string" && id) ids.add(id.toLowerCase());
  }
  return ids;
}

/** The Sequencer effects attached to a token. */
function sequencerEffectsOn(token) {
  const manager = globalThis.Sequencer?.EffectManager;
  if (typeof manager?.getEffects !== "function") return [];
  try { return manager.getEffects({ object: token }) ?? []; } catch { return []; }
}

function sequencerEffectMatches(seqEffect, effect, names) {
  const data = seqEffect?.data ?? seqEffect ?? {};
  const origin = typeof data.origin === "string" ? data.origin : "";
  if (origin && (origin === effect.uuid || origin === effect.id || (effect.id && origin.endsWith(`.${effect.id}`)))) return true;
  const name = typeof data.name === "string" ? data.name.toLowerCase() : "";
  if (!name) return false;
  for (const n of names) if (name === n || name.startsWith(`${n}-`)) return true;
  return false;
}

/**
 * What other modules animate on this token: a test for single effects, or null when nothing is
 * (the setting is off, neither module is active, or there's nothing to match).
 */
function otherModuleAnimations(token) {
  if (!token?.actor || !settingValue("deferToOtherModules")) return null;
  const tmfx = moduleActive("tokenmagic"), sequencer = moduleActive("sequencer");
  if (!tmfx && !sequencer) return null;
  const filterIds = tmfx ? tokenMagicFilterIds(token) : new Set();
  const seqEffects = sequencer ? sequencerEffectsOn(token) : [];
  return effect => {
    if (!effect || effect.disabled) return false;
    if (tmfx && Array.isArray(effect.changes) && effect.changes.some(c => TMFX_CHANGE_KEY.test(String(c?.key ?? "")))) return true;
    if (!filterIds.size && !seqEffects.length) return false;
    const names = effectMatchNames(effect);
    for (const n of names) if (filterIds.has(n)) return true;
    return seqEffects.some(se => sequencerEffectMatches(se, effect, names));
  };
}

/** The token's effects that another module animates (empty when none). */
function otherModuleEffects(token) {
  const animated = otherModuleAnimations(token);
  if (!animated) return [];
  const out = [];
  const seen = new Set();
  for (const effect of [...(token.actor.temporaryEffects ?? []), ...(token.actor.effects ?? [])]) {
    if (!effect || seen.has(effect)) continue;
    seen.add(effect);
    if (animated(effect)) out.push(effect);
  }
  return out;
}

/** An effect on its own, as an actor-like object the animation checks understand. */
function soloEffectActor(effect) {
  return { statuses: new Set(effect?.statuses ?? []), effects: [effect] };
}

/** Leave out the animations whose statuses another module already animates on this token. */
function dropOtherModuleKinds(token, wanted) {
  const others = otherModuleEffects(token);
  if (!others.length) return wanted;
  const solos = others.map(soloEffectActor);
  for (const kind of [...wanted]) {
    if (NEVER_DEFERRED.has(kind)) continue;
    if (solos.some(solo => { try { return FX_KINDS[kind].applies(solo); } catch { return false; } })) wanted.delete(kind);
  }
  return wanted.size ? wanted : null;
}
