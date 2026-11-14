/**
 * The fight, played out many times with dice. Each run rolls initiative and takes turns until one side is down,
 * using what the reader found on each sheet: attacks against AC, saving throws against DCs, damage against
 * resistances, conditions, limited uses, healing, death saves, legendary actions and so on.
 *
 * Nothing here needs Foundry.
 */
import { average, roll } from "./dice.mjs";
import { CONDITIONS, VALUE_CONDITIONS } from "./conditions.mjs";

const PHYSICAL = new Set(["bludgeoning", "piercing", "slashing"]);
const MENTAL_SAVE = new Set(["charmed", "frightened", "stunned", "incapacitated", "addled", "bewildered", "distracted"]);

/**
 * @typedef {object} Side
 * @property {string} key        Told back in the results.
 * @property {object} profile    From the reader.
 * @property {number} [count]    How many of this creature.
 * @property {boolean} [pc]      A player character: counted for "someone drops" and makes death saves.
 */

/**
 * @param {Side[]} party
 * @param {Side[]} enemies
 * @param {object} [options]
 * @param {number} [options.runs=1000]
 * @param {() => number} [options.random]
 * @param {number} [options.maxRounds=30]
 * @param {"mixed"|"focus"|"random"} [options.tactics="mixed"]  How the enemies pick targets.
 */
export function simulate(party, enemies, { runs = 1000, random = Math.random, maxRounds = 30, tactics = "mixed" } = {}) {
  const roster = [];
  const addSide = (entries, side) => {
    for ( const entry of entries ) {
      if ( !entry?.profile || entry.profile.defeated ) continue;
      const count = Math.max(1, Math.floor(entry.count ?? 1));
      for ( let i = 0; i < count; i++ ) roster.push({ entry, side });
    }
  };
  addSide(party, 0);
  addSide(enemies, 1);
  const anyPC = roster.some(r => (r.side === 0) && r.entry.pc);
  for ( const r of roster ) r.pc = (r.side === 0) && (anyPC ? !!r.entry.pc : true);

  const tally = {
    runs, wins: 0, wipes: 0, stalemates: 0, drops: 0, deaths: 0, rounds: 0, lost: 0, dropCount: 0,
    members: new Map()
  };
  for ( const r of roster ) {
    if ( !tally.members.has(r.entry.key) ) {
      tally.members.set(r.entry.key, { key: r.entry.key, side: r.side, count: 0, drops: 0, deaths: 0, taken: 0, dealt: 0,
        killed: 0, killRound: 0, endHp: 0 });
    }
    tally.members.get(r.entry.key).count++;
  }
  const partyMax = roster.filter(r => r.pc).reduce((sum, r) => sum + r.entry.profile.hpMax, 0) || 1;
  const noFight = !roster.some(r => r.side === 0) || !roster.some(r => r.side === 1);

  for ( let run = 0; (run < runs) && !noFight; run++ ) {
    const fight = new Fight(roster, { random, maxRounds, tactics });
    const outcome = fight.play();
    if ( outcome === "win" ) tally.wins++;
    else if ( outcome === "wipe" ) tally.wipes++;
    else tally.stalemates++;
    tally.rounds += fight.round;
    let dropped = false;
    let died = false;
    let taken = 0;
    for ( const c of fight.all ) {
      const m = tally.members.get(c.key);
      m.taken += c.taken;
      m.dealt += c.dealt;
      m.endHp += Math.max(0, c.hp);
      if ( c.pc ) {
        if ( c.dropped ) {
          m.drops++;
          dropped = true;
          tally.dropCount++;
        }
        if ( c.dead ) {
          m.deaths++;
          died = true;
        }
        taken += c.taken;
      } else if ( c.dead ) {
        m.killed++;
        m.killRound += c.diedRound;
      }
    }
    if ( dropped ) tally.drops++;
    if ( died ) tally.deaths++;
    tally.lost += Math.min(2, taken / partyMax);
  }

  const n = noFight ? 1 : runs;
  const totalDealtByEnemies = [...tally.members.values()].filter(m => m.side === 1).reduce((s, m) => s + m.dealt, 0) || 1;
  const totalDealtByParty = [...tally.members.values()].filter(m => m.side === 0).reduce((s, m) => s + m.dealt, 0) || 1;
  return {
    runs: noFight ? 0 : runs,
    win: tally.wins / n,
    wipe: tally.wipes / n,
    stalemate: tally.stalemates / n,
    drop: tally.drops / n,
    death: tally.deaths / n,
    drops: tally.dropCount / n,
    rounds: tally.rounds / n,
    hpLost: tally.lost / n,
    members: [...tally.members.values()].map(m => {
      const each = n * m.count;
      return {
        key: m.key,
        side: m.side,
        count: m.count,
        drop: m.drops / each,
        death: m.deaths / each,
        taken: m.taken / each,
        dealt: m.dealt / each,
        share: m.dealt / (m.side === 1 ? totalDealtByEnemies : totalDealtByParty),
        killed: m.killed / each,
        killRound: m.killed ? m.killRound / m.killed : null,
        endHp: m.endHp / each
      };
    })
  };
}

/* -------------------------------------------- */

class Fight {
  constructor(roster, { random, maxRounds, tactics }) {
    this.random = random;
    this.maxRounds = maxRounds;
    this.tactics = tactics;
    this.round = 0;
    this.all = roster.map((r, i) => this.#enter(r, i));
    this.sides = [this.all.filter(c => c.side === 0), this.all.filter(c => c.side === 1)];
  }

  #enter(r, i) {
    const p = r.entry.profile;
    const c = {
      i, p, key: r.entry.key, side: r.side, pc: r.pc,
      hp: p.hp, temp: p.temp,
      down: false, dead: false, stable: false,
      ds: { s: p.deathSaves?.success ?? 0, f: p.deathSaves?.failure ?? 0 },
      conds: new Map(),
      uses: p.options.map(o => (o.uses ? o.uses.left : null)),
      slots: { ...p.slots, pact: p.slots.pact ? { ...p.slots.pact } : undefined },
      points: p.spellPoints ? { left: p.spellPoints.left, highUsed: new Set(p.spellPoints.highUsed) } : null,
      legRes: p.legRes, legLeft: 0,
      reaction: true, shieldUp: false, raging: false, sneakUsed: false, slotCast: false, bonusUsed: false,
      relentless: !!p.features.relentless,
      onHitUsed: new Set(),
      onHitUses: (p.features.onHit ?? []).map(e => e.uses),
      nova: p.features.nova
        ? { active: false, step: 0, willpower: p.features.nova.willpower, flare: !!p.features.nova.flare, burnt: false }
        : null,
      linger: null, regenBlocked: false,
      taken: 0, dealt: 0, dropped: false, diedRound: 0,
      init: 0
    };
    if ( c.hp <= 0 ) {
      if ( c.pc ) {
        c.down = true;
        if ( c.ds.f >= 3 ) c.dead = true;
        if ( c.ds.s >= 3 ) c.stable = true;
      } else c.dead = true;
    }
    for ( const cond of p.conditions ?? [] ) {
      if ( (cond.id === "unconscious") && c.down ) continue;
      const entry = { ...cond };
      if ( entry.rounds === null || entry.rounds === undefined ) {
        // No known end: it gets the usual save at the end of each of its turns.
        entry.rounds = 10;
        if ( !CONDITIONS[cond.id]?.standsUp && !(cond.id in VALUE_CONDITIONS) ) {
          entry.saveEnds = true;
          entry.dc = 13;
          entry.ability = MENTAL_SAVE.has(cond.id) ? "wis" : "con";
        }
      }
      c.conds.set(cond.id, entry);
    }
    return c;
  }

  /* ---------- dice ---------- */

  d(faces) {
    return 1 + Math.floor(this.random() * faces);
  }

  d20(adv, dis) {
    const a = this.d(20);
    if ( adv === dis ) return a;
    const b = this.d(20);
    return adv ? Math.max(a, b) : Math.min(a, b);
  }

  /** Jinxed and Valor: a die off or on every attack roll and saving throw. */
  rollModifier(c) {
    let total = 0;
    for ( const id of ["jinxed", "valor"] ) {
      const cond = c.conds.get(id);
      if ( cond?.amount ) total += VALUE_CONDITIONS[id].roll * roll(cond.amount, this.random);
    }
    return total;
  }

  /* ---------- who is where ---------- */

  standing(c) {
    return !c.dead && !c.down && (c.hp > 0);
  }

  foes(c) {
    return this.sides[1 - c.side].filter(o => this.standing(o));
  }

  allies(c) {
    return this.sides[c.side].filter(o => (o !== c) && this.standing(o));
  }

  flag(c, name) {
    for ( const id of c.conds.keys() ) if ( CONDITIONS[id]?.[name] ) return true;
    return false;
  }

  over() {
    if ( !this.sides[1].some(c => this.standing(c)) ) return "win";
    if ( !this.sides[0].some(c => this.standing(c)) ) return "wipe";
    return null;
  }

  /* ---------- the fight ---------- */

  play() {
    let done = this.over();
    if ( done ) return done;
    for ( const c of this.all ) c.init = this.d(20) + c.p.init + (this.random() * 0.5);
    const order = [...this.all].sort((a, b) => b.init - a.init);
    for ( this.round = 1; this.round <= this.maxRounds; this.round++ ) {
      for ( const c of order ) {
        if ( c.dead ) continue;
        this.turn(c);
        done = this.over();
        if ( done ) return done;
        this.legendary(c);
        done = this.over();
        if ( done ) return done;
      }
    }
    this.round = this.maxRounds;
    return "stalemate";
  }

  turn(c) {
    this.current = c;
    c.reaction = true;
    c.shieldUp = false;
    c.sneakUsed = false;
    c.slotCast = false;
    c.bonusUsed = false;
    c.legLeft = c.p.legAct;
    c.onHitUsed.clear();
    if ( c.nova ) c.nova.burnt = false;

    if ( c.down ) {
      if ( !c.stable ) this.deathSave(c);
      return;
    }

    // Start of turn
    if ( c.p.regen && (c.hp > 0) && !c.regenBlocked ) c.hp = Math.min(c.p.hpMax, c.hp + c.p.regen.amount);
    c.regenBlocked = false;
    c.p.options.forEach((o, i) => {
      if ( o.uses?.recharge && (c.uses[i] <= 0) && (this.d(6) >= o.uses.recharge) ) c.uses[i] = 1;
    });
    for ( const [id, cond] of c.conds ) {
      if ( CONDITIONS[id]?.standsUp ) c.conds.delete(id);
      else if ( cond.escape ) {
        const bonus = Math.max(c.p.mods.str, c.p.mods.dex) + Math.floor(c.p.prof / 2);
        if ( (this.d(20) + bonus) >= cond.escape ) c.conds.delete(id);
      }
    }

    const helpless = this.flag(c, "noActions");
    if ( helpless ) c.linger = null;

    if ( !helpless ) {
      // A spell that keeps going (Spirit Guardians, Moonbeam) hits again without an action
      if ( c.linger ) this.use(c, c.linger, { free: true });
      if ( c.nova ) this.novaStart(c);
      if ( !this.over() && this.standing(c) ) {
        if ( c.p.features.rage && !c.raging && !this.flag(c, "noBonus") ) {
          c.raging = true;
          c.bonusUsed = true;
        }
        this.act(c);
        if ( !this.over() && this.standing(c) && !c.bonusUsed && !this.flag(c, "noBonus") ) this.bonus(c);
      }
    }

    // End of turn
    if ( c.nova?.active && this.standing(c) ) {
      // Let it go before the next turn's recoil becomes a real risk of dropping
      const next = c.p.features.nova.recoil[Math.min(c.nova.step, c.p.features.nova.recoil.length - 1)];
      if ( c.hp <= average(next) * 1.5 ) c.nova.active = false;
    }
    if ( this.standing(c) ) {
      for ( const id of ["burning", "bleeding"] ) {
        const cond = c.conds.get(id);
        if ( !cond ) continue;
        const amount = Math.max(1, roll(cond.amount ?? { dice: [[1, 4]], flat: 0 }, this.random));
        this.hurt(c, [{ value: amount, type: id === "burning" ? (cond.type ?? "fire") : null }], { source: null });
      }
    }
    for ( const [id, cond] of c.conds ) {
      if ( cond.saveEnds && this.save(c, cond.ability ?? "con", cond.dc ?? 13, {}) ) {
        c.conds.delete(id);
        continue;
      }
      if ( cond.fresh ) {
        cond.fresh = false; // put on during its own turn: it starts counting next turn
        continue;
      }
      cond.rounds -= 1;
      if ( cond.rounds <= 0 ) c.conds.delete(id);
    }
  }

  deathSave(c) {
    const d = this.d(20);
    if ( d === 20 ) {
      c.down = false;
      c.hp = 1;
      c.ds = { s: 0, f: 0 };
      return;
    }
    if ( d === 1 ) c.ds.f += 2;
    else if ( d >= 10 ) c.ds.s += 1;
    else c.ds.f += 1;
    if ( c.ds.f >= 3 ) this.kill(c);
    else if ( c.ds.s >= 3 ) c.stable = true;
  }

  kill(c) {
    c.dead = true;
    c.down = false;
    c.hp = 0;
    c.linger = null;
    c.diedRound = this.round;
  }

  /* ---------- choosing ---------- */

  usable(c, option, i = option.index) {
    const pool = option.shares ?? i;
    if ( (c.uses[pool] !== null) && (c.uses[pool] !== undefined) && (c.uses[pool] <= 0) ) return false;
    if ( option.spellLevel && this.flag(c, "noSpells") ) return false;
    if ( option.slot ) {
      if ( c.slotCast ) return false;
      if ( this.slotFor(c, option) === null ) return false;
    }
    if ( option.conc && c.linger ) return false;
    if ( option.only && !this.foes(c).some(f => f.p.kind === option.only) ) return false;
    return true;
  }

  /** Can a spell point caster pay for a spell of this level now? */
  canPay(c, level) {
    const sp = c.p.spellPoints;
    if ( !c.points || !sp || (level > sp.maxLevel) ) return false;
    if ( sp.limit && (level >= 6) && c.points.highUsed.has(level) ) return false;
    const cost = Number(sp.costs?.[level]) || 0;
    return (cost > 0) && (c.points.left >= cost);
  }

  /** Pay for a spell of this level from the pool. */
  payPoints(c, level) {
    const sp = c.p.spellPoints;
    c.points.left -= Number(sp.costs?.[level]) || 0;
    if ( sp.limit && (level >= 6) ) c.points.highUsed.add(level);
  }

  slotFor(c, option) {
    if ( option.slot === "pact" ) return (c.slots.pact?.left > 0) ? "pact" : null;
    if ( c.points ) {
      for ( let level = option.slot; level <= 9; level++ ) if ( this.canPay(c, level) ) return level;
    }
    else for ( let level = option.slot; level <= 9; level++ ) if ( c.slots[level] > 0 ) return level;
    if ( (c.slots.pact?.left > 0) && (c.slots.pact.level >= option.slot) ) return "pact";
    return null;
  }

  spend(c, option) {
    const pool = option.shares ?? option.index;
    if ( (c.uses[pool] !== null) && (c.uses[pool] !== undefined) ) c.uses[pool] -= 1;
    if ( option.slot ) {
      const slot = this.slotFor(c, option);
      if ( slot === "pact" ) c.slots.pact.left -= 1;
      else if ( (slot !== null) && c.points ) this.payPoints(c, slot);
      else if ( slot !== null ) c.slots[slot] -= 1;
      c.slotCast = true;
    }
  }

  /** How much of a damage type gets through to a creature. */
  multiplier(target, type, magical, raging = target.raging) {
    if ( !type ) return 1;
    const p = target.p;
    const physical = PHYSICAL.has(type);
    if ( p.immune.has(type) && !(physical && magical && p.immuneBypass.has("mgc")) ) return 0;
    let m = 1;
    const resists = (p.resist.has(type) && !(physical && magical && p.resistBypass.has("mgc")))
      || (raging && physical) || this.flag(target, "resistAll");
    if ( resists ) m *= 0.5;
    if ( p.vulnerable.has(type) ) m *= 2;
    return m;
  }

  hitChance(c, option, target) {
    let p = (21 + option.toHit - target.p.ac) / 20;
    p = Math.min(0.95, Math.max(0.05, p));
    const [adv, dis] = this.edge(c, option, target);
    if ( adv && !dis ) p = 1 - ((1 - p) ** 2);
    else if ( dis && !adv ) p = p ** 2;
    return p;
  }

  failChance(target, ability, dc) {
    if ( ["str", "dex"].includes(ability) && this.flag(target, "failStrDex") ) return 1;
    return Math.min(0.95, Math.max(0.05, (dc - (target.p.saves[ability] ?? 0) - 1) / 20));
  }

  amount(parts, target, magical) {
    let total = 0;
    for ( const part of parts ) total += Math.max(0, average(part)) * this.multiplier(target, part.type, magical);
    return total;
  }

  condValue(cond, target, chance) {
    if ( !cond || target.p.condImmune.has(cond.id) || target.conds.has(cond.id) ) return 0;
    const info = CONDITIONS[cond.id];
    if ( !info ) return 0;
    const lasting = (cond.rounds ?? 1) > 1 ? 1.5 : 1;
    return chance * (info.severity ?? 0) * (target.p.dpr || 1) * lasting;
  }

  /** What an option is worth right now, in expected damage (conditions counted as damage they prevent). */
  value(c, option) {
    const foes = this.foes(c).filter(f => !option.only || (f.p.kind === option.only));
    if ( !foes.length ) return 0;
    const target = option.only ? foes[0] : (this.target(c, { peek: true }) ?? foes[0]);
    const weak = this.flag(c, "halfDamage") ? 0.5 : 1;
    if ( option.kind === "attack" ) {
      const hit = this.hitChance(c, option, target);
      let per = this.amount(option.dmg, target, option.magical);
      if ( option.rider ) {
        const fail = option.rider.dc ? this.failChance(target, option.rider.ability, option.rider.dc) : 1;
        per += this.amount(option.rider.dmg, target, option.magical) * (fail + (option.rider.half ? (1 - fail) / 2 : 0));
        per += this.condValue(option.rider.cond, target, fail);
      }
      // What rides on a hit: by-hand extras on every one, once-a-turn features on the first
      const f = c.p.features;
      if ( f.everyHit ) per += this.amount([f.everyHit], target, option.magical);
      let once = 0;
      for ( const e of f.onHit ?? [] ) {
        if ( (e.weapon && !option.weapon) || (e.bloodied && (target.hp > target.p.hpMax / 2)) ) continue;
        once += average(e.dmg);
      }
      if ( f.sneak && option.weapon ) once += average(f.sneak);
      if ( c.nova?.active ) once += average(f.nova.burn[Math.min(c.nova.step, f.nova.burn.length) - 1]);
      const count = option.count ?? 1;
      return ((hit * per * count) + ((1 - ((1 - hit) ** count)) * once)) * weak;
    }
    const n = Math.min(option.targets ?? 1, foes.length);
    if ( option.kind === "save" ) {
      let total = 0;
      for ( const t of n > 1 ? foes : [target] ) {
        const fail = this.failChance(t, option.ability, option.dc);
        const dmg = this.amount(option.dmg, t, option.spell || option.magical);
        total += (dmg * (fail + (option.half ? (1 - fail) / 2 : 0)) * weak) + this.condValue(option.cond, t, fail);
      }
      return n > 1 ? (total / foes.length) * n : total;
    }
    if ( option.kind === "auto" ) return this.amount(option.dmg, target, true) * (option.count ?? 1) * n * weak;
    return 0;
  }

  /**
   * Pick who to go for. The party gangs up on whoever is closest to dropping; the enemies do the same, pick at
   * random, or a bit of both, by their Intelligence and the tactics setting.
   */
  target(c, { peek = false } = {}) {
    let foes = this.foes(c);
    if ( !foes.length ) return null;
    const charm = c.conds.get("charmed");
    if ( charm?.source ) {
      const others = foes.filter(f => f !== charm.source);
      if ( !others.length ) return null;
      foes = others;
    }
    if ( foes.length === 1 ) return foes[0];
    let focus;
    if ( c.side === 0 ) focus = true;
    else if ( this.tactics === "focus" ) focus = true;
    else if ( this.tactics === "random" ) focus = false;
    else focus = (c.p.int >= 8) && (peek ? true : (this.random() < 0.5));
    if ( !focus ) return peek ? foes[0] : foes[Math.floor(this.random() * foes.length)];
    let best = foes[0];
    for ( const f of foes ) {
      const a = c.side === 0 ? f.hp : f.hp / f.p.hpMax;
      const b = c.side === 0 ? best.hp : best.hp / best.p.hpMax;
      if ( (a < b) || ((a === b) && (f.p.dpr > best.p.dpr)) ) best = f;
    }
    return best;
  }

  act(c) {
    const p = c.p;
    const downed = this.sides[c.side].filter(o => o.down && !o.dead && o.pc);
    const bonusHeal = !this.flag(c, "noBonus")
      && p.options.some(o => (o.act === "bonus") && (o.kind === "heal") && !o.self && this.usable(c, o));
    let best = null;
    let bestScore = 0;

    for ( const option of p.options ) {
      if ( (option.act !== "action") || !this.usable(c, option) ) continue;
      let score;
      if ( option.kind === "heal" ) {
        const amount = average(option.heal);
        if ( option.self ) score = (c.hp < c.p.hpMax * 0.35) ? amount : 0;
        else if ( downed.length && !bonusHeal ) score = 1e6;
        else {
          const hurt = this.allies(c).concat(c).some(o => o.hp < o.p.hpMax * 0.25);
          score = hurt ? amount * 0.8 : 0;
        }
      } else {
        score = this.value(c, option);
        if ( (option.kind === "attack") && option.weapon && p.features.extraAttacks && !this.flag(c, "oneAttack") ) {
          score *= 1 + p.features.extraAttacks;
        }
      }
      if ( score > bestScore ) {
        bestScore = score;
        best = option;
      }
    }

    if ( p.multiattack && !this.flag(c, "oneAttack") ) {
      const entries = p.multiattack.filter(e => this.usable(c, p.options[e.index]));
      const score = entries.reduce((sum, e) => sum + (this.value(c, p.options[e.index]) * e.count), 0);
      if ( score > bestScore ) {
        for ( const e of entries ) {
          for ( let k = 0; k < e.count; k++ ) {
            if ( this.over() || !this.standing(c) ) return;
            const option = p.options[e.index];
            if ( !this.usable(c, option) ) break;
            this.use(c, option);
          }
        }
        return;
      }
    }
    if ( !best ) return;
    const times = (best.kind === "attack") && best.weapon && !this.flag(c, "oneAttack")
      ? 1 + (p.features.extraAttacks ?? 0) : 1;
    for ( let k = 0; k < times; k++ ) {
      if ( this.over() || !this.standing(c) ) return;
      if ( (k > 0) && !this.usable(c, best) ) break;
      this.use(c, best);
    }
  }

  /**
   * Nova: enter it when healthy enough, then each turn it's active take the next step of recoil, which nothing
   * reduces.
   */
  novaStart(c) {
    const n = c.nova;
    const f = c.p.features.nova;
    if ( !n.active ) {
      if ( (n.willpower <= 0) || (c.hp < c.p.hpMax * 0.5) || !this.foes(c).length ) return;
      n.willpower -= 1;
      n.active = true;
      n.step = 0;
    }
    n.step += 1;
    const recoil = f.recoil[Math.min(n.step, f.recoil.length) - 1];
    this.hurt(c, [{ value: Math.max(0, roll(recoil, this.random)), type: recoil.type }], { raw: true });
  }

  bonus(c) {
    const downed = this.sides[c.side].some(o => o.down && !o.dead && o.pc);
    let best = null;
    let bestScore = 0;
    const strike = c.p.features.bonusAttack;
    for ( const option of c.p.options ) {
      // Rapid Strike and the like: one more melee attack as a bonus action
      const extra = strike && (option.act === "action") && (option.kind === "attack") && option.melee && !option.spell
        && ((strike === "melee") || /unarmed/i.test(option.name)) && !this.flag(c, "oneAttack");
      if ( ((option.act !== "bonus") && !extra) || !this.usable(c, option) ) continue;
      let score;
      if ( option.kind === "heal" ) {
        if ( option.self ) score = (c.hp < c.p.hpMax * 0.5) ? average(option.heal) + 1 : 0;
        else if ( downed ) score = 1e6;
        else score = this.allies(c).concat(c).some(o => o.hp < o.p.hpMax * 0.3) ? average(option.heal) : 0;
      } else score = this.value(c, option);
      if ( score > bestScore ) {
        bestScore = score;
        best = option;
      }
    }
    if ( best ) {
      c.bonusUsed = true;
      this.use(c, best);
    }
  }

  /** After someone else's turn, each legendary creature on the other side may take one legendary action. */
  legendary(after) {
    for ( const c of this.sides[1 - after.side] ) {
      if ( (c === after) || !this.standing(c) || (c.legLeft <= 0) || this.flag(c, "noActions") ) continue;
      let best = null;
      let bestScore = 0;
      for ( const option of c.p.options ) {
        if ( (option.act !== "legendary") || ((option.cost ?? 1) > c.legLeft) || !this.usable(c, option) ) continue;
        const score = this.value(c, option) / (option.cost ?? 1);
        if ( score > bestScore ) {
          bestScore = score;
          best = option;
        }
      }
      if ( !best ) continue;
      c.legLeft -= best.cost ?? 1;
      this.use(c, best);
      if ( this.over() ) return;
    }
  }

  /* ---------- doing ---------- */

  use(c, option, { free = false } = {}) {
    if ( !free ) this.spend(c, option);
    if ( option.kind === "heal" ) return this.heal(c, option);
    if ( option.kind === "attack" ) {
      for ( let k = 0; k < (option.count ?? 1); k++ ) {
        const target = this.target(c);
        if ( !target ) break;
        this.attack(c, option, target);
        if ( !this.standing(c) ) break;
      }
    } else {
      const foes = this.foes(c).filter(f => !option.only || (f.p.kind === option.only));
      const n = Math.min(option.targets ?? 1, foes.length);
      let targets;
      if ( n <= 1 ) {
        const t = option.only ? foes[0] : this.target(c);
        targets = t ? [t] : [];
      } else targets = this.sample(foes, n);
      for ( const target of targets ) {
        if ( option.kind === "save" ) this.forceSave(c, option, target);
        else for ( let k = 0; k < (option.count ?? 1); k++ ) this.deal(c, target, option.dmg, { magical: true });
      }
    }
    if ( option.linger && !free && this.standing(c) ) c.linger = option;
  }

  sample(pool, n) {
    const copy = [...pool];
    for ( let i = copy.length - 1; i > 0; i-- ) {
      const j = Math.floor(this.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }

  /** Advantage and Disadvantage on an attack roll. */
  edge(c, option, target) {
    const f = c.p.features;
    const tf = target.p.features;
    let adv = !!f.attackAdv || this.flag(c, "attackAdv") || !!tf.grantAdv || this.flag(target, "grantAdv")
      || (option.melee && this.flag(target, "grantAdvMelee"))
      || (f.packTactics && (this.allies(c).length > 0));
    let dis = !!f.attackDis || this.flag(c, "attackDis") || !!tf.grantDis || this.flag(target, "grantDis")
      || (!option.melee && this.flag(target, "grantAdvMelee"))
      || (option.spell && this.flag(c, "attackDisSpell"))
      || ((option.ability === "dex") && this.flag(c, "attackDisDex"))
      || ((option.ability === "str") && this.flag(c, "attackDisStr"));
    const grapple = c.conds.get("grappled");
    if ( grapple?.source && (grapple.source !== target) ) dis = true;
    return [!!adv, !!dis];
  }

  attack(c, option, target) {
    const [adv, dis] = this.edge(c, option, target);
    const d = this.d20(adv, dis);
    if ( d === 1 ) return;
    const total = d + option.toHit + this.rollModifier(c);
    let crit = d >= (option.critAt ?? 20);
    let ac = target.p.ac + (target.shieldUp ? 5 : 0);
    if ( !crit && (total < ac) ) return;
    // Reactions that turn a hit into a miss
    const canReact = target.reaction && !this.flag(target, "noActions") && !this.flag(target, "noReactions");
    if ( !crit && canReact ) {
      const margin = total - ac;
      if ( target.p.features.shield && (margin < 5) && this.shieldSlot(target) ) {
        target.reaction = false;
        target.shieldUp = true;
        return;
      }
      if ( target.p.features.parry && option.melee && (margin < target.p.features.parry) ) {
        target.reaction = false;
        return;
      }
    }
    if ( this.flag(target, "allCrit") || (option.melee && this.flag(target, "meleeCrit")) ) crit = true;

    const parts = [...option.dmg];
    if ( option.weapon && c.p.features.sneak && !c.sneakUsed ) {
      c.sneakUsed = true;
      parts.push({ ...c.p.features.sneak, type: option.dmg[0]?.type ?? null });
    }
    if ( c.p.features.everyHit ) parts.push({ ...c.p.features.everyHit, type: option.dmg[0]?.type ?? null });
    const onHit = c.p.features.onHit;
    if ( onHit ) {
      onHit.forEach((e, k) => {
        if ( c.onHitUsed.has(k) || (e.weapon && !option.weapon) ) return;
        if ( e.bloodied && (target.hp > target.p.hpMax / 2) ) return;
        if ( (c.onHitUses[k] !== null) && (c.onHitUses[k] <= 0) ) return;
        c.onHitUsed.add(k);
        if ( c.onHitUses[k] !== null ) c.onHitUses[k] -= 1;
        parts.push({ ...e.dmg, type: e.dmg.type ?? option.dmg[0]?.type ?? null });
      });
    }
    if ( c.nova?.active && !c.nova.burnt ) {
      c.nova.burnt = true;
      const ladder = c.p.features.nova.burn;
      const burn = ladder[Math.min(c.nova.step, ladder.length) - 1];
      parts.push({ ...burn, type: burn.type ?? option.dmg[0]?.type ?? "radiant" });
    }
    let bonus = 0;
    if ( c.raging && option.weapon && option.melee ) bonus += c.p.features.rage;
    let halve = false;
    if ( target.p.features.uncannyDodge && target.reaction && canReact ) {
      target.reaction = false;
      halve = true;
    }
    this.deal(c, target, parts, { crit, magical: option.magical, bonus, halve });

    const rider = option.rider;
    if ( !rider || !this.standing(target) ) return;
    let failed = true;
    if ( rider.dc ) failed = !this.resist(target, rider.ability, rider.dc, { spell: option.spell, serious: !!rider.cond });
    if ( rider.dmg.length ) {
      if ( failed ) this.deal(c, target, rider.dmg, { magical: option.magical });
      else if ( rider.half ) this.deal(c, target, rider.dmg, { magical: option.magical, halve: true });
    }
    if ( failed && rider.cond && this.standing(target) ) this.afflict(target, rider.cond, c, rider);
  }

  shieldSlot(target) {
    if ( target.points && this.canPay(target, 1) ) {
      this.payPoints(target, 1);
      return true;
    }
    for ( let level = 1; level <= 9; level++ ) {
      if ( target.slots[level] > 0 ) {
        target.slots[level] -= 1;
        return true;
      }
    }
    if ( target.slots.pact?.left > 0 ) {
      target.slots.pact.left -= 1;
      return true;
    }
    // Monsters with Shield on their list cast it a few times a day at most
    if ( !target.p.isCharacter ) {
      target.shields = (target.shields ?? 3) - 1;
      return target.shields >= 0;
    }
    return false;
  }

  /** A saving throw. Returns true on a success. */
  save(target, ability, dc, { spell = false } = {}) {
    if ( ["str", "dex"].includes(ability) && this.flag(target, "failStrDex") ) return false;
    const adv = (spell && target.p.magicRes) || ((ability === "dex") && target.conds.has("dodging"));
    const dis = ((ability === "dex") && this.flag(target, "dexDis")) || ((ability === "con") && this.flag(target, "conDis"));
    const d = this.d20(adv, dis);
    return (d + (target.p.saves[ability] ?? 0) + this.rollModifier(target)) >= dc;
  }

  /** A saving throw, with Legendary Resistance spent on a failure that matters. */
  resist(target, ability, dc, { spell = false, serious = false } = {}) {
    if ( this.save(target, ability, dc, { spell }) ) return true;
    if ( (target.legRes > 0) && serious ) {
      target.legRes -= 1;
      return true;
    }
    return false;
  }

  forceSave(c, option, target) {
    const heavy = this.amount(option.dmg, target, true) >= (target.hp * 0.2);
    const cond = option.cond && !target.p.condImmune.has(option.cond.id) ? option.cond : null;
    const saved = this.resist(target, option.ability, option.dc, { spell: option.spell, serious: !!cond || heavy });
    const evasion = (option.ability === "dex") && target.p.features.evasion && !this.flag(target, "noActions");
    if ( option.dmg.length ) {
      if ( !saved ) this.deal(c, target, option.dmg, { magical: true, halve: evasion && option.half });
      else if ( option.half && !evasion ) this.deal(c, target, option.dmg, { magical: true, halve: true });
    }
    if ( !saved && cond && this.standing(target) ) this.afflict(target, cond, c, option);
  }

  afflict(target, cond, source, from) {
    if ( target.p.condImmune.has(cond.id) ) return;
    const old = target.conds.get(cond.id);
    if ( old && (old.rounds >= (cond.rounds ?? 1)) ) return;
    target.conds.set(cond.id, {
      id: cond.id,
      rounds: cond.rounds ?? 1,
      saveEnds: !!cond.saveEnds && !!from?.dc,
      dc: from?.dc ?? null,
      ability: from?.ability ?? "con",
      escape: cond.escape ?? null,
      source,
      fresh: this.current === target
    });
    if ( CONDITIONS[cond.id]?.noActions ) target.linger = null;
  }

  /** Roll damage and take it off the target. */
  deal(c, target, parts, { crit = false, magical = false, bonus = 0, halve = false } = {}) {
    const rolled = parts.map(part => ({
      value: Math.max(0, roll(part, this.random, { critical: crit, minimum: target.conds.has("mighty-guard") })),
      type: part.type
    }));
    if ( bonus && rolled.length ) rolled[0].value += bonus;
    this.hurt(target, rolled, { source: c, magical, halve, weak: c && this.flag(c, "halfDamage"), crit });
  }

  hurt(target, rolled, { source = null, magical = false, halve = false, weak = false, crit = false, raw = false } = {}) {
    let total = 0;
    let radiant = false;
    for ( const { value, type } of rolled ) {
      const through = raw ? value : value * this.multiplier(target, type, magical);
      total += through;
      if ( through > 0 ) {
        if ( target.p.regen?.blocked.has(type) ) target.regenBlocked = true;
        if ( type === "radiant" ) radiant = true;
      }
    }
    if ( halve ) total /= 2;
    if ( weak ) total /= 2;
    total = Math.floor(total);
    if ( target.p.reduction && !raw ) total = Math.max(0, total - target.p.reduction);
    if ( total <= 0 ) return;

    if ( target.temp > 0 ) {
      const soaked = Math.min(target.temp, total);
      target.temp -= soaked;
      total -= soaked;
      if ( total <= 0 ) return;
    }
    const before = target.hp;
    const lost = Math.min(before, total);
    target.hp -= total;
    target.taken += lost;
    if ( source ) source.dealt += lost;

    // Concentration
    if ( target.linger && (target.hp > 0) ) {
      const dc = Math.max(10, Math.floor(total / 2));
      if ( !this.save(target, "con", dc) ) target.linger = null;
    }
    if ( target.hp > 0 ) return;

    const overflow = -target.hp;
    target.hp = 0;
    if ( target.p.features.undeadFortitude && !radiant && !crit && this.save(target, "con", 5 + total) ) {
      target.hp = 1;
      return;
    }
    if ( target.nova?.active ) {
      target.nova.active = false;
      if ( target.nova.flare ) {
        // Solar Flare: stay up on 1 hit point and scorch everyone hostile nearby
        target.nova.flare = false;
        target.hp = 1;
        const flare = target.p.features.nova.flare;
        for ( const foe of this.foes(target) ) this.hurt(foe, [{ value: flare.flat, type: flare.type }], { source: target, magical: true });
        return;
      }
    }
    if ( target.relentless ) {
      target.relentless = false;
      target.hp = 1;
      return;
    }
    target.linger = null;
    target.conds.clear();
    if ( !target.pc ) return this.kill(target);
    target.dropped = true;
    if ( overflow >= target.p.hpMax ) return this.kill(target);
    target.down = true;
    target.stable = false;
    target.raging = false;
    target.ds = { s: 0, f: 0 };
  }

  heal(c, option) {
    const side = this.sides[c.side];
    let target = c;
    if ( !option.self ) {
      const downed = side.filter(o => o.down && !o.dead && o.pc);
      if ( downed.length ) target = downed[Math.floor(this.random() * downed.length)];
      else {
        target = side.filter(o => !o.dead && (o.hp > 0)).reduce((low, o) =>
          ((o.hp / o.p.hpMax) < (low.hp / low.p.hpMax) ? o : low), c);
      }
    }
    const amount = Math.max(1, roll(option.heal, this.random));
    if ( target.down ) {
      target.down = false;
      target.stable = false;
      target.ds = { s: 0, f: 0 };
      target.hp = 0;
    }
    target.hp = Math.min(target.p.hpMax, target.hp + amount);
    target.conds.delete("bleeding");
  }
}
