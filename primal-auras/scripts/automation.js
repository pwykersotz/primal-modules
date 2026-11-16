/**
 * The aura automation engine. Runs on the active GM only and works from document data, so it
 * handles every scene, not just the one the GM is looking at.
 */
import { MODULE_ID, getSetting, isActiveGM, error } from "./constants.js";
import { getTokenAuras, isAuraActive, effectiveShape } from "./data.js";
import { isTokenInAura } from "./geometry.js";
import { getSourceRollData, resolveStaticValue, isDefeated } from "./system.js";
import { applyTriggeredEffect, continuousEffectData, effectAffects } from "./apply.js";

/**
 * Tokens whose turn starts (current) or ended (previous) at a turn change. Normally just the combatant's; in Primal
 * Combat's side initiative, everyone on that combatant's side (for the current turn, exactly who Primal Combat says is
 * acting, which in round 1's opening turn is only the party members who beat the enemies).
 */
export function sideTurnTokenIds(combat, pos, which) {
  const lead = pos?.tokenId ?? null;
  const ids = lead ? [lead] : [];
  const pc = game.modules?.get("primal-combat");
  const api = pc?.active ? pc.api : null;
  try {
    if (!api?.getMode || api.getMode(combat) !== "side") return ids;
    let members;
    if (which === "current") members = api.getActingMembers(combat) ?? [];
    else {
      const leadCombatant = (pos.combatantId && combat.combatants.get(pos.combatantId))
        ?? combat.combatants.find(c => c.tokenId === lead);
      const side = leadCombatant ? api.getSide(leadCombatant) : null;
      members = !side || side === "event" ? [] : combat.turns.filter(c => api.getSide(c) === side);
    }
    for (const c of members) if (c?.tokenId && !ids.includes(c.tokenId)) ids.push(c.tokenId);
  } catch (err) {
    error("Could not read Primal Combat's sides; using the combatant's turn only", err);
  }
  return ids;
}

/**
 * Who started and who ended the turn the combat just moved to, as token ids, from Primal Combat's turn signal when it's
 * on and has one (it works this out once for every module, side initiative included). Null otherwise.
 */
export function combatTurnSignal(combat) {
  const pc = game.modules?.get("primal-combat");
  const api = pc?.active ? pc.api : null;
  if (typeof api?.getTurnStarters !== "function" || typeof api.getTurnEnders !== "function") return null;
  try {
    const ids = list => [...new Set((list ?? []).map(c => c?.tokenId).filter(Boolean))];
    return { startedIds: ids(api.getTurnStarters(combat)), endedIds: ids(api.getTurnEnders(combat)) };
  } catch (err) {
    error("Could not read Primal Combat's turn signal; working out the turn here", err);
    return null;
  }
}

/**
 * How long an effect's "At most once per turn" lasts: "turn" (the default) or "round". Other modules can widen it to
 * a round through the `primal-auras.onceScope` hook, which gets { scope, aura, entry, effect, source, target, combat }
 * and may set `scope` to "round" (Primal Houserules does this for spell emanations).
 */
export function onceScope({ inst, effect, targetDoc, combat }) {
  const context = { scope: "turn", aura: inst.aura, entry: inst.entry, effect, source: inst.sourceDoc, target: targetDoc, combat };
  try { globalThis.Hooks?.callAll?.("primal-auras.onceScope", context); }
  catch (err) { error("A primal-auras.onceScope listener failed", err); }
  return context.scope === "round" ? "round" : "turn";
}

const compareTurn = (a, b) => (a.round !== b.round ? a.round - b.round : (a.turn ?? 0) - (b.turn ?? 0));

export class AuraEngine {
  constructor() {
    /** @type {Map<string, Map<string, Set<string>>>} sceneId -> aura key -> token ids inside */
    this.membership = new Map();
    /** @type {Map<string, string>} once-per-turn bookkeeping */
    this.onceTracker = new Map();
    this._timers = new Map();
    /** @type {Map<string, {key:string, ids:string[]}>} combat id -> the tokens whose turn started at its current turn */
    this.turnStarts = new Map();
    this._queue = Promise.resolve();
  }

  get enabled() {
    return !!getSetting("automation") && isActiveGM();
  }

  enqueue(fn) {
    const next = this._queue.then(fn).catch(err => error(err));
    this._queue = next;
    return next;
  }

  /** Debounced re-evaluation of a scene (movement, aura changes, actor changes...). */
  schedule(scene, delay = 150) {
    if (!scene || !this.enabled) return;
    clearTimeout(this._timers.get(scene.id));
    this._timers.set(scene.id, setTimeout(() => {
      this._timers.delete(scene.id);
      this.enqueue(() => this.evaluateScene(scene));
    }, delay));
  }

  scheduleRelevant() {
    const scenes = new Set([canvas?.scene, game.scenes?.active].filter(Boolean));
    for (const s of scenes) this.schedule(s);
  }

  combatFor(scene) {
    const started = game.combats?.filter(c => c.started) ?? [];
    return started.find(c => (c.scene?.id ?? c.combatant?.token?.parent?.id) === scene.id)
      ?? (game.combat?.started ? game.combat : null);
  }

  /* -------------------------------------------- */

  collectInstances(scene) {
    const ignoreDefeated = getSetting("ignoreDefeated");
    const out = [];
    for (const doc of scene.tokens) {
      if (ignoreDefeated && isDefeated(doc)) continue;
      for (const entry of getTokenAuras(doc)) {
        if (!isAuraActive(entry) || !entry.aura.effects.length) continue;
        out.push({ key: entry.key, entry, aura: entry.aura, sourceDoc: doc, shape: effectiveShape(entry.aura, scene) });
      }
    }
    return out;
  }

  computeMembership(scene, instances) {
    const ignoreDefeated = getSetting("ignoreDefeated");
    const targets = scene.tokens.filter(t => t.actor && !(ignoreDefeated && isDefeated(t)));
    const result = new Map();
    for (const inst of instances) {
      const inside = new Set();
      for (const t of targets) {
        try { if (isTokenInAura(inst, t)) inside.add(t.id); }
        catch (err) { error("Containment test failed", err); }
      }
      result.set(inst.key, inside);
    }
    return result;
  }

  /* -------------------------------------------- */

  async evaluateScene(scene) {
    if (!this.enabled || !scene || !game.scenes.get(scene.id)) return;
    const instances = this.collectInstances(scene);
    const current = this.computeMembership(scene, instances);
    const previous = this.membership.get(scene.id);
    this.membership.set(scene.id, current);

    if (previous) {
      const combat = this.combatFor(scene);
      const turnKey = combat ? `${combat.id}:${combat.round}:${combat.turn}` : null;
      const jobs = [];
      for (const inst of instances) {
        let before = previous.get(inst.key);
        // Aura just appeared or switched on: no enter/leave events, unless it says those inside count as entering.
        if (!before) {
          if (!inst.aura.enterOnAppear) continue;
          before = new Set();
        }
        const now = current.get(inst.key);
        const entered = [...now].filter(id => !before.has(id));
        const left = [...before].filter(id => !now.has(id));
        for (const effect of inst.aura.effects) {
          if (effect.mode !== "triggered") continue;
          if (effect.triggers.onEnter) for (const id of entered) jobs.push({ inst, effect, targetId: id, trigger: "onEnter", turnKey });
          if (effect.triggers.onLeave) for (const id of left) jobs.push({ inst, effect, targetId: id, trigger: "onLeave", turnKey });
        }
      }
      await this.runJobs(scene, jobs, combat);
    }
    await this.reconcileContinuous(scene, instances, current);
  }

  /** Run jobs in parallel per target (so several players can roll saves at once), sequentially per target. */
  async runJobs(scene, jobs, combat) {
    if (!jobs.length) return;
    const byTarget = new Map();
    for (const job of jobs) {
      if (!byTarget.has(job.targetId)) byTarget.set(job.targetId, []);
      byTarget.get(job.targetId).push(job);
    }
    await Promise.all([...byTarget.values()].map(async list => {
      for (const job of list) {
        const targetDoc = scene.tokens.get(job.targetId);
        if (!targetDoc?.actor) continue;
        try { await this.processTriggered(scene, job, targetDoc, combat); }
        catch (err) { error(`Failed to apply "${job.effect.name}" to ${targetDoc.name}`, err); }
      }
    }));
  }

  async processTriggered(scene, { inst, effect, trigger, turnKey }, targetDoc, combat) {
    if (!effectAffects(effect, inst.sourceDoc, targetDoc)) return;
    if (effect.oncePerTurn && turnKey) {
      const k = `${inst.key}|${effect.id}|${targetDoc.id}`;
      const onceKey = onceScope({ inst, effect, targetDoc, combat }) === "round" && combat
        ? `${combat.id}:${combat.round}` : turnKey;
      if (this.onceTracker.get(k) === onceKey) return;
      this.onceTracker.set(k, onceKey);
    }
    await applyTriggeredEffect({ scene, inst, effect, targetDoc, trigger, combat });
  }

  /* -------------------------------------------- */
  /*  Combat turns                                */
  /* -------------------------------------------- */

  onUpdateCombat(combat, changed, options) {
    if (!this.enabled || !combat.started) return;
    if (!("turn" in changed || "round" in changed)) return;
    if (options?.direction === -1) return; // stepping backwards never re-triggers effects
    const prev = foundry.utils.deepClone(combat.previous ?? {});
    const curr = { round: combat.round, turn: combat.turn, tokenId: combat.combatant?.tokenId ?? null, combatantId: combat.combatant?.id ?? null };
    const scene = combat.combatant?.token?.parent ?? combat.scene ?? canvas?.scene;
    if (!scene) return;
    const signal = combatTurnSignal(combat); // read now: the combat may have moved on by the time the queue gets here
    this.enqueue(() => this.handleTurnChange(scene, combat, prev, curr, signal));
  }

  async handleTurnChange(scene, combat, prev, curr, signal = null) {
    const instances = this.collectInstances(scene);
    const membership = this.computeMembership(scene, instances);
    const hasPrev = prev?.tokenId && Number.isFinite(prev.round);
    // In Primal Combat's side initiative, a turn is the whole side's: everyone on it starts and ends their turn together.
    // Who ended: whoever we started at that turn, when we saw it start (round 1's opening turn is only part of a side).
    const endKey0 = hasPrev ? `${combat.id}:${prev.round}:${prev.turn}` : null;
    const record = this.turnStarts.get(combat.id);
    const endedIds = !hasPrev ? []
      : signal ? [...new Set([prev.tokenId, ...signal.endedIds])]
      : (record?.key === endKey0 ? [...new Set([prev.tokenId, ...record.ids])] : sideTurnTokenIds(combat, prev, "previous"));
    const startedIds = signal?.startedIds.length ? signal.startedIds : sideTurnTokenIds(combat, curr, "current");
    this.turnStarts.set(combat.id, { key: `${combat.id}:${curr.round}:${curr.turn}`, ids: startedIds });

    // 1. End of the previous combatant's (or side's) turn
    if (hasPrev) {
      const endKey = `${combat.id}:${prev.round}:${prev.turn}`;
      const jobs = endedIds.flatMap(id => this.turnJobs(instances, membership, id, "targetTurnEnd", "sourceTurnEnd", endKey));
      await this.runJobs(scene, jobs, combat);
    }
    // 2. Expire effects tied to that turn ending / this turn starting
    await this.expireEffects(scene, combat, {
      ended: hasPrev ? { tokenIds: new Set(endedIds), round: prev.round, turn: prev.turn } : null,
      startedTokenIds: new Set(startedIds)
    });
    // 3. Start of the new combatant's (or side's) turn
    const startKey = `${combat.id}:${curr.round}:${curr.turn}`;
    const jobs = startedIds.flatMap(id => this.turnJobs(instances, membership, id, "targetTurnStart", "sourceTurnStart", startKey));
    await this.runJobs(scene, jobs, combat);
    // 4. Effects may have changed who is defeated etc.
    await this.reconcileContinuous(scene, instances, membership);
  }

  turnJobs(instances, membership, tokenId, targetTrigger, sourceTrigger, turnKey) {
    const jobs = [];
    if (!tokenId) return jobs;
    for (const inst of instances) {
      const inside = membership.get(inst.key) ?? new Set();
      for (const effect of inst.aura.effects) {
        if (effect.mode !== "triggered") continue;
        if (effect.triggers[targetTrigger] && inside.has(tokenId)) {
          jobs.push({ inst, effect, targetId: tokenId, trigger: targetTrigger, turnKey });
        }
        if (effect.triggers[sourceTrigger] && inst.sourceDoc.id === tokenId) {
          for (const id of inside) jobs.push({ inst, effect, targetId: id, trigger: sourceTrigger, turnKey });
        }
      }
    }
    return jobs;
  }

  /* -------------------------------------------- */
  /*  Expiry of timed effects                     */
  /* -------------------------------------------- */

  async expireEffects(scene, combat, { ended, startedTokenIds }) {
    if (!getSetting("autoExpire")) return;
    const now = { round: combat.round, turn: combat.turn };
    const seen = new Set();
    for (const doc of scene.tokens) {
      const actor = doc.actor;
      if (!actor || seen.has(actor.uuid)) continue;
      seen.add(actor.uuid);
      const ids = [];
      for (const ef of actor.effects) {
        const f = ef.getFlag(MODULE_ID, "expiry");
        if (!f?.type) continue;
        if (f.combatId && f.combatId !== combat.id) continue;
        let expire = false;
        if (f.type === "turnStart") expire = !!startedTokenIds?.has(f.tokenId) && compareTurn(now, f) > 0;
        else if (f.type === "turnEnd") expire = !!ended && ended.tokenIds.has(f.tokenId) && compareTurn(ended, f) > 0;
        else if (f.type === "rounds" && f.combatId) {
          const endRound = f.round + f.rounds;
          expire = now.round > endRound || (now.round === endRound && now.turn >= f.turn);
        }
        if (expire) ids.push(ef.id);
      }
      if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids).catch(err => error(err));
    }
  }

  /** Out of combat, round-based effects expire with world time. */
  onWorldTime() {
    if (!this.enabled || !getSetting("autoExpire")) return;
    this.enqueue(async () => {
      const roundTime = CONFIG.time?.roundTime || 6;
      const scenes = new Set([canvas?.scene, game.scenes?.active].filter(Boolean));
      const seen = new Set();
      for (const scene of scenes) {
        for (const doc of scene.tokens) {
          const actor = doc.actor;
          if (!actor || seen.has(actor.uuid)) continue;
          seen.add(actor.uuid);
          const ids = actor.effects.filter(ef => {
            const f = ef.getFlag(MODULE_ID, "expiry");
            return f?.type === "rounds" && !f.combatId && game.time.worldTime >= (f.time ?? 0) + f.rounds * roundTime;
          }).map(ef => ef.id);
          if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids).catch(err => error(err));
        }
      }
    });
  }

  /* -------------------------------------------- */
  /*  Continuous ("while inside") effects         */
  /* -------------------------------------------- */

  async reconcileContinuous(scene, instances, membership) {
    const desired = new Map();
    for (const t of scene.tokens) {
      if (t.actor && !desired.has(t.actor.uuid)) desired.set(t.actor.uuid, { actor: t.actor, specs: new Map() });
    }

    for (const inst of instances) {
      const inside = membership.get(inst.key);
      if (!inside?.size) continue;
      const effects = inst.aura.effects.filter(e => e.mode === "continuous");
      if (!effects.length) continue;
      const rollData = getSourceRollData(inst.entry);
      for (const effect of effects) {
        const changes = effect.changes.filter(c => c.key).map(c => ({ ...c, value: resolveStaticValue(c.value, rollData) }));
        const baseKey = `${inst.key}|${effect.id}`;
        for (const id of inside) {
          const targetDoc = scene.tokens.get(id);
          if (!targetDoc?.actor || !effectAffects(effect, inst.sourceDoc, targetDoc)) continue;
          const bucket = desired.get(targetDoc.actor.uuid);
          if (!bucket) continue;
          if (changes.length) {
            const specKey = `${baseKey}|changes`;
            // Same-named effects from different sources do not stack (best one wins) unless allowed.
            const dedupe = effect.stacks ? specKey : `changes:${effect.name.toLowerCase()}`;
            const score = changes.reduce((s, c) => s + (Number(c.value) || 0), 0);
            const sig = JSON.stringify(changes.map(c => [c.key, c.type, c.value]));
            const existing = bucket.specs.get(dedupe);
            if (!existing || score > existing.score) bucket.specs.set(dedupe, { specKey, kind: "changes", score, sig, effect, inst, changes });
          }
          for (const statusId of effect.statuses) {
            const dedupe = `status:${statusId}`;
            if (!bucket.specs.has(dedupe)) {
              bucket.specs.set(dedupe, { specKey: `${baseKey}|status:${statusId}`, kind: "status", statusId, score: 0, sig: statusId, effect, inst });
            }
          }
        }
      }
    }

    for (const { actor, specs } of desired.values()) {
      const want = new Map([...specs.values()].map(s => [s.specKey, s]));
      const keep = new Set();
      const toDelete = [];
      for (const ef of actor.effects) {
        const f = ef.flags?.[MODULE_ID];
        if (!f?.continuous || (f.sceneId && f.sceneId !== scene.id)) continue;
        const spec = want.get(f.specKey);
        if (!spec || keep.has(f.specKey) || f.sig !== spec.sig) toDelete.push(ef.id);
        else keep.add(f.specKey);
      }
      const toCreate = [];
      for (const spec of want.values()) {
        if (!keep.has(spec.specKey)) toCreate.push(await continuousEffectData(spec, scene));
      }
      try {
        if (toDelete.length) await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
        if (toCreate.length) await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
      } catch (err) {
        error(`Could not update aura effects on ${actor.name}`, err);
      }
    }
  }

  /** Remove every continuous aura effect from tokens in the given scenes (used when automation is switched off). */
  async cleanup(scenes = [canvas?.scene, game.scenes?.active]) {
    if (!game.user.isGM) return;
    const seen = new Set();
    for (const scene of new Set(scenes.filter(Boolean))) {
      this.membership.delete(scene.id);
      for (const doc of scene.tokens) {
        const actor = doc.actor;
        if (!actor || seen.has(actor.uuid)) continue;
        seen.add(actor.uuid);
        const ids = actor.effects.filter(ef => ef.flags?.[MODULE_ID]?.continuous).map(ef => ef.id);
        if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids).catch(err => error(err));
      }
    }
  }
}

export const engine = new AuraEngine();

/** When a linked token leaves a scene, strip the continuous effects that scene's auras gave its actor. */
export async function cleanupDeletedToken(doc) {
  if (!engine.enabled || !doc.actorLink) return;
  const actor = game.actors.get(doc.actorId);
  const scene = doc.parent;
  if (!actor || !scene) return;
  if (scene.tokens.some(t => t.id !== doc.id && t.actorId === actor.id && t.actorLink)) return;
  const ids = actor.effects.filter(ef => {
    const f = ef.flags?.[MODULE_ID];
    return f?.continuous && f.sceneId === scene.id;
  }).map(ef => ef.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids).catch(err => error(err));
}
