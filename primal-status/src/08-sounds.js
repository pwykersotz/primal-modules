/* -------------------------------------------- */
/*  Sound cues (optional, per player)           */
/* -------------------------------------------- */

/*
 * A short sound when a status lands on a creature you can see: off unless a player turns it on in
 * the Token animations window. The sounds are synthesised by tools/make-sounds.py. Nothing plays
 * for creatures this player can't see (or that are unseen: Invisible, Ethereal), for tokens set to
 * show no animations, or on a canvas that isn't showing the creature.
 */
const SOUND_CUES = [
  { cue: "toll", pattern: /(^|[^a-z])dead$/i },
  { cue: "zap", pattern: /(^|[^a-z])(paraly[sz]ed|stunned|shocked)$/i },
  { cue: "stone", pattern: /(^|[^a-z])(petrified|frozen)$/i },
  { cue: "sleep", pattern: /(^|[^a-z])(unconscious|a?sleep(ing)?|incapacitated)$/i },
  { cue: "whoosh", pattern: /(^|[^a-z])(invisible|ethereal|dodg(e|ing))$/i },
  { cue: "flame", pattern: /(^|[^a-z])(burning|on-?fire|aflame|ignited)$/i },
  { cue: "splat", pattern: /(^|[^a-z])(bleed(ing)?|bloodied)$/i },
  { cue: "bubble", pattern: /(^|[^a-z])(poison(ed)?|diseased?|sickened)$/i },
  { cue: "drone", pattern: /(^|[^a-z])(frightened|afraid|scared|cursed|slow(ed)?|drakkenheimslowed|addled|jinxed|bewildered|distracted|drakkenheimmadness|madness)$/i },
  { cue: "chime", pattern: /(^|[^a-z])(charmed|hasted?|mighty-guard|valou?r)$/i },
  { cue: "ping", pattern: /(^|[^a-z])(marked|helpless)$/i },
  { cue: "thud", pattern: /(^|[^a-z])(prone|grappled|restrained|clumsy|enfeebled|defen[cs]eless|immobili[sz]ed|entangled|staggered)$/i }
];
const SOUND_GAP_MS = 400;          // one cue per creature at a time (Unconscious also adds Prone, ...)
const SOUND_BURST = { ms: 1000, max: 3 };
const soundLog = { byActor: new Map(), recent: [] };

function soundsEnabled() {
  try { return !!game.settings.get(MODULE_ID, "soundCues"); } catch { return false; }
}

/** The cue for a set of status IDs (the first match in the list above), or null. */
function soundCueFor(statuses) {
  const ids = [...(statuses ?? [])].filter(s => typeof s === "string");
  for (const { cue, pattern } of SOUND_CUES) if (ids.some(id => pattern.test(id))) return cue;
  return null;
}

/** Can this player see the creature on the current scene (and is it shown with animations)? */
function creatureAudible(actor) {
  let tokens = [];
  try { tokens = actor?.getActiveTokens?.(true) ?? []; } catch { return false; }
  return tokens.some(t => t && !t.destroyed && t.visible !== false && !animationsOffFor(t) && !effects.get(t)?.invis?.concealed);
}

function playSoundCue(cue) {
  const helper = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
  if (!cue || typeof helper?.play !== "function") return false;
  const volume = Math.min(1, Math.max(0, (Number(settingValue("soundVolume")) || 0) / 100));
  if (!(volume > 0)) return false;
  try { helper.play({ src: `${MODULE_PATH}/sounds/${cue}.ogg`, volume, autoplay: true, loop: false }, false); return true; }
  catch (err) { console.warn(`${MODULE_ID} | Could not play a sound`, err); return false; }
}

/** Play a cue for a creature, if this player wants sounds and can see it (and it isn't too soon). */
function soundForActor(actor, cue) {
  if (!cue || !actor || !soundsEnabled() || !creatureAudible(actor)) return false;
  const now = Date.now();
  const key = actor.uuid ?? actor;
  if (now - (soundLog.byActor.get(key) ?? 0) < SOUND_GAP_MS) return false;
  soundLog.recent = soundLog.recent.filter(t => now - t < SOUND_BURST.ms);
  if (soundLog.recent.length >= SOUND_BURST.max) return false;
  soundLog.byActor.set(key, now);
  soundLog.recent.push(now);
  return playSoundCue(cue);
}

// A status lands on a creature
Hooks.on("createActiveEffect", effect => {
  if (effect?.disabled || !soundsEnabled()) return;
  const actor = effect.parent?.documentName === "Item" ? effect.parent.parent : effect.parent;
  let cue = soundCueFor(effect.statuses);
  if (cue === "sleep" && isDying(actor)) cue = isMonster(actor) ? "toll" : "heartbeat";   // falling unconscious at 0 HP
  soundForActor(actor, cue);
});

// Dropping to 0 Hit Points: a heartbeat (a monster: the bell, as it dies)
Hooks.on("updateActor", (actor, change) => {
  if (!soundsEnabled()) return;
  const value = foundry.utils?.getProperty?.(change, "system.attributes.hp.value");
  if (value === undefined || Number(value) > 0) return;
  if (!(Number(actor?.system?.attributes?.hp?.max) > 0)) return;
  soundForActor(actor, isMonster(actor) ? "toll" : "heartbeat");
});
