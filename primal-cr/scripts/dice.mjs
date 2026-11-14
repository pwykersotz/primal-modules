/**
 * Dice formulas, without Foundry: read "2d6 + 4" into dice and a flat number, take its average, and roll it.
 * A formula is kept as { dice: [[count, faces], ...], flat }.
 */

/** @typedef {{dice: Array<[number, number]>, flat: number}} Amount */

const FUNCTIONS = {
  floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs,
  max: Math.max, min: Math.min, sign: Math.sign
};

/** An amount with nothing in it. */
export function nothing() {
  return { dice: [], flat: 0 };
}

/** The average of an amount. */
export function average(amount) {
  if ( !amount ) return 0;
  let total = amount.flat ?? 0;
  for ( const [n, f] of amount.dice ?? [] ) total += n * (f + 1) / 2;
  return total;
}

/**
 * Roll an amount.
 * @param {Amount} amount
 * @param {() => number} random   A source of numbers in [0, 1).
 * @param {object} [options]
 * @param {boolean} [options.critical]  Roll every die twice (a critical hit).
 * @param {boolean} [options.minimum]   Every die shows 1.
 * @returns {number}
 */
export function roll(amount, random, { critical = false, minimum = false } = {}) {
  let total = amount.flat ?? 0;
  for ( const [n, f] of amount.dice ) {
    const count = Math.abs(n) * (critical ? 2 : 1);
    const sign = n < 0 ? -1 : 1;
    for ( let i = 0; i < count; i++ ) total += sign * (minimum ? 1 : 1 + Math.floor(random() * f));
  }
  return total;
}

/** Add two amounts into a new one. */
export function add(a, b, sign = 1) {
  const dice = new Map();
  for ( const [n, f] of a.dice ) dice.set(f, (dice.get(f) ?? 0) + n);
  for ( const [n, f] of b.dice ) dice.set(f, (dice.get(f) ?? 0) + (sign * n));
  return {
    dice: [...dice.entries()].filter(([, n]) => n !== 0).map(([f, n]) => [n, f]),
    flat: (a.flat ?? 0) + (sign * (b.flat ?? 0))
  };
}

/** Multiply an amount by a plain number (dice counts are rounded down, at least one die kept). */
export function scale(amount, factor) {
  return {
    dice: amount.dice.map(([n, f]) => [Math.trunc(n * factor) || Math.sign(n * factor), f]).filter(([n]) => n !== 0),
    flat: amount.flat * factor
  };
}

/** Write an amount as text, "2d6 + 4". */
export function describe(amount) {
  const parts = amount.dice.map(([n, f]) => `${n}d${f}`);
  const flat = Math.round(amount.flat * 100) / 100;
  if ( flat || !parts.length ) parts.push(String(flat));
  return parts.join(" + ").replace(/\+ -/g, "- ");
}

/* -------------------------------------------- */

/**
 * Read a formula whose @references are already filled in. Dice modifiers (kh, r, x...) are dropped, flavour in
 * [brackets] is ignored, and anything that can't be read counts as 0.
 * @param {string|number} formula
 * @returns {Amount}
 */
export function parse(formula) {
  if ( typeof formula === "number" ) return { dice: [], flat: Number.isFinite(formula) ? formula : 0 };
  const text = String(formula ?? "").replace(/\[[^\]]*\]/g, "").replace(/\{([^{}]*)\}/g, "($1)").trim();
  if ( !text ) return nothing();
  const tokens = tokenize(text);
  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++];

  function expression() {
    let left = term();
    while ( peek() === "+" || peek() === "-" ) {
      const op = take();
      left = add(left, term(), op === "+" ? 1 : -1);
    }
    return left;
  }

  function term() {
    let left = factor();
    while ( peek() === "*" || peek() === "/" ) {
      const op = take();
      const right = factor();
      if ( op === "*" ) {
        if ( !right.dice.length ) left = scale(left, right.flat);
        else if ( !left.dice.length ) left = scale(right, left.flat);
        else left = { dice: [], flat: average(left) * average(right) };
      } else {
        const by = average(right) || 1;
        left = left.dice.length ? { dice: [], flat: average(left) / by } : { dice: [], flat: left.flat / by };
      }
    }
    return left;
  }

  function factor() {
    const token = take();
    if ( token === undefined ) return nothing();
    if ( token === "-" ) return scale(factor(), -1);
    if ( token === "+" ) return factor();
    if ( token === "(" ) {
      const inner = expression();
      if ( peek() === ")" ) take();
      return diceAfter(inner);
    }
    if ( typeof token === "object" ) {
      if ( token.fn ) {
        const args = [];
        if ( peek() === "(" ) {
          take();
          while ( peek() !== undefined && peek() !== ")" ) {
            args.push(average(expression()));
            if ( peek() === "," ) take();
          }
          take();
        }
        const fn = FUNCTIONS[token.fn];
        const value = fn ? fn(...args) : (args[0] ?? 0);
        return { dice: [], flat: Number.isFinite(value) ? value : 0 };
      }
      if ( token.die ) return { dice: token.count ? [[token.count, token.faces]] : [], flat: 0 };
      return { dice: [], flat: token.number };
    }
    return nothing();
  }

  /** "(2)d6": a bracketed count in front of a die. */
  function diceAfter(inner) {
    const next = peek();
    if ( (typeof next === "object") && next.die && next.bare ) {
      take();
      const count = Math.max(0, Math.floor(average(inner)));
      return { dice: count ? [[count, next.faces]] : [], flat: 0 };
    }
    return inner;
  }

  try {
    const result = expression();
    if ( !Number.isFinite(result.flat) ) result.flat = 0;
    return result;
  } catch {
    return nothing();
  }
}

function tokenize(text) {
  const tokens = [];
  const re = /\s*(?:(\d*)d(\d+)[a-z<>=\d]*|(\d+(?:\.\d+)?)|([a-zA-Z_][\w.]*)|([-+*/(),]))/y;
  let at = 0;
  while ( at < text.length ) {
    re.lastIndex = at;
    const m = re.exec(text);
    if ( !m ) {
      at++;
      continue;
    }
    at = re.lastIndex;
    if ( m[2] !== undefined ) {
      tokens.push({ die: true, bare: m[1] === "", count: m[1] === "" ? 1 : Number(m[1]), faces: Number(m[2]) });
    }
    else if ( m[3] !== undefined ) tokens.push({ number: Number(m[3]) });
    else if ( m[4] !== undefined ) {
      const name = m[4].replace(/^Math\./, "");
      if ( name in FUNCTIONS ) tokens.push({ fn: name });
      else tokens.push({ number: 0 });
    }
    else tokens.push(m[5]);
  }
  return tokens;
}

/**
 * A repeatable source of random numbers (mulberry32), so a simulation can be run again with the same dice.
 * @param {number} seed
 * @returns {() => number}
 */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
