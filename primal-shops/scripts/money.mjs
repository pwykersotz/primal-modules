/**
 * Coins. Every amount is worked out in the smallest coin (copper, for dnd5e's currencies), as a whole number, so
 * nothing is lost to rounding. Nothing here touches Foundry, except reading dnd5e's currencies when none are given.
 */

/** dnd5e's own coins, worth so many copper each, in case CONFIG isn't there (tests). */
export const DEFAULT_RATES = Object.freeze({ pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 });

/** The coins change and payments are made in: no platinum or electrum, as most tables play. */
export const CHANGE_COINS = Object.freeze(["gp", "sp", "cp"]);

/**
 * What each coin is worth in the smallest one, from dnd5e's currencies (CONFIG.DND5E.currencies: conversion is
 * how many of the coin make one gold piece).
 * @param {object} [currencies]
 * @returns {Record<string, number>}  Highest coin first.
 */
export function currencyRates(currencies=globalThis.CONFIG?.DND5E?.currencies) {
  const entries = Object.entries(currencies ?? {})
    .map(([key, c]) => [key, Number(c?.conversion)])
    .filter(([, conversion]) => Number.isFinite(conversion) && (conversion > 0));
  if ( !entries.length ) return { ...DEFAULT_RATES };
  const smallest = Math.max(...entries.map(([, c]) => c));
  return Object.fromEntries(entries
    .map(([key, conversion]) => [key, Math.max(1, Math.round(smallest / conversion))])
    .sort((a, b) => b[1] - a[1]));
}

/** The worth of one gold piece, in the smallest coin. */
export function gpRate(rates=DEFAULT_RATES) {
  return rates.gp ?? 100;
}

/**
 * A price ({ value, denomination }, as dnd5e keeps it, or a number of gold pieces) in the smallest coin.
 * @returns {number}
 */
export function toCp(price, rates=DEFAULT_RATES) {
  if ( (price === null) || (price === undefined) || (price === "") ) return 0;
  if ( typeof price === "number" || (typeof price === "string") ) return gpToCp(price, rates);
  const value = Number(price.value);
  if ( !Number.isFinite(value) || (value <= 0) ) return 0;
  const rate = rates[price.denomination] ?? gpRate(rates);
  return Math.round(value * rate);
}

/** Gold pieces (2.5) in the smallest coin (250). */
export function gpToCp(gp, rates=DEFAULT_RATES) {
  const value = Number(gp);
  if ( !Number.isFinite(value) || (value <= 0) ) return 0;
  return Math.round(value * gpRate(rates));
}

/** The smallest coin in gold pieces, to two decimals at most for dnd5e's coins (250 → 2.5). */
export function cpToGp(cp, rates=DEFAULT_RATES) {
  const value = (Number(cp) || 0) / gpRate(rates);
  return Math.round(value * 10000) / 10000;
}

/** A purse as whole coins of each kind the rates know (missing or broken values are 0). */
export function cleanPurse(currency, rates=DEFAULT_RATES) {
  const purse = {};
  for ( const key of Object.keys(rates) ) purse[key] = Math.max(0, Math.floor(Number(currency?.[key]) || 0));
  return purse;
}

/** What a purse is worth, in the smallest coin. */
export function purseValue(currency, rates=DEFAULT_RATES) {
  const purse = cleanPurse(currency, rates);
  return Object.entries(purse).reduce((sum, [key, n]) => sum + (n * rates[key]), 0);
}

/**
 * An amount as coins, highest first, using only the coins given.
 * @param {number} cp
 * @param {Record<string, number>} [rates]
 * @param {string[]} [coins]
 * @returns {Record<string, number>}  Only the coins used.
 */
export function asCoins(cp, rates=DEFAULT_RATES, coins=CHANGE_COINS) {
  let left = Math.max(0, Math.round(Number(cp) || 0));
  const usable = coins.filter(c => rates[c]).sort((a, b) => rates[b] - rates[a]);
  const smallest = Object.keys(rates).sort((a, b) => rates[a] - rates[b])[0];
  if ( smallest && !usable.includes(smallest) ) usable.push(smallest);
  const out = {};
  for ( const coin of usable ) {
    const n = Math.floor(left / rates[coin]);
    if ( n > 0 ) {
      out[coin] = n;
      left -= n * rates[coin];
    }
  }
  return out;
}

/**
 * Pay an amount from a purse: the smallest coins first, then one bigger coin with change given back (in gold, silver
 * and copper) when the small ones don't make it exactly.
 * @param {object} currency     The purse (dnd5e's system.currency).
 * @param {number} cost         In the smallest coin.
 * @param {Record<string, number>} [rates]
 * @returns {{ok: boolean, currency: object, paid: object, change: object, short: number}}
 *   currency: the purse afterwards. paid: the coins handed over. change: the coins given back. short: how much is
 *   missing when the purse can't pay (ok false, nothing changed).
 */
export function pay(currency, cost, rates=DEFAULT_RATES) {
  const purse = cleanPurse(currency, rates);
  const amount = Math.max(0, Math.round(Number(cost) || 0));
  const total = purseValue(purse, rates);
  if ( amount > total ) return { ok: false, currency: purse, paid: {}, change: {}, short: amount - total };
  const paid = {};
  let left = amount;
  const ascending = Object.keys(rates).sort((a, b) => rates[a] - rates[b]);
  for ( const coin of ascending ) {
    if ( left <= 0 ) break;
    const take = Math.min(purse[coin], Math.floor(left / rates[coin]));
    if ( take > 0 ) {
      purse[coin] -= take;
      paid[coin] = (paid[coin] ?? 0) + take;
      left -= take * rates[coin];
    }
  }
  let change = {};
  if ( left > 0 ) {
    // Every coin left is worth more than what's still owed (each was used until it would overpay): hand over the
    // smallest one and take change.
    const coin = ascending.find(c => purse[c] > 0);
    purse[coin] -= 1;
    paid[coin] = (paid[coin] ?? 0) + 1;
    // Small coins handed over that the change would only give back are kept back (5 gp for 4 gp 9 sp 5 cp: not
    // 5 gp, 7 sp and 12 cp with 8 sp 7 cp back).
    let back = rates[coin] - left;
    for ( const c of [...ascending].reverse() ) {
      const n = Math.min(paid[c] ?? 0, Math.floor(back / rates[c]));
      if ( n <= 0 ) continue;
      paid[c] -= n;
      if ( !paid[c] ) delete paid[c];
      purse[c] += n;
      back -= n * rates[c];
    }
    change = asCoins(back, rates);
    for ( const [c, n] of Object.entries(change) ) purse[c] += n;
  }
  return { ok: true, currency: purse, paid, change, short: 0 };
}

/**
 * Put an amount into a purse, as gold, silver and copper.
 * @returns {{currency: object, added: object}}
 */
export function receive(currency, amount, rates=DEFAULT_RATES) {
  const purse = cleanPurse(currency, rates);
  const added = asCoins(amount, rates);
  for ( const [coin, n] of Object.entries(added) ) purse[coin] = (purse[coin] ?? 0) + n;
  return { currency: purse, added };
}

/**
 * An amount in words: "1 gp 5 sp", or "0 gp" for nothing.
 * @param {number} cp
 * @param {object} [options]
 * @param {Record<string, number>} [options.rates]
 * @param {Record<string, string>} [options.labels]  Each coin's abbreviation ({ gp: "gp" }).
 * @param {string[]} [options.coins]                  The coins to show it in.
 */
export function formatCp(cp, { rates=DEFAULT_RATES, labels={}, coins=CHANGE_COINS }={}) {
  const amount = Math.max(0, Math.round(Number(cp) || 0));
  const parts = Object.entries(asCoins(amount, rates, coins)).map(([coin, n]) => `${n.toLocaleString()} ${labels[coin] ?? coin}`);
  return parts.length ? parts.join(" ") : `0 ${labels.gp ?? "gp"}`;
}

/** Coins handed over or given back, in words ("2 gp 3 sp"), or "" for none. */
export function formatCoins(coins, labels={}, rates=DEFAULT_RATES) {
  return Object.entries(coins ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => (rates[b[0]] ?? 0) - (rates[a[0]] ?? 0))
    .map(([coin, n]) => `${n.toLocaleString()} ${labels[coin] ?? coin}`)
    .join(" ");
}

/**
 * A price typed by the GM ("25", "2.5", "5 sp", "1gp 5sp", "1 gp, 5 sp") in the smallest coin, or null when it isn't
 * one.
 */
export function parsePrice(text, rates=DEFAULT_RATES) {
  if ( typeof text === "number" ) return Number.isFinite(text) && (text >= 0) ? gpToCp(text, rates) : null;
  const raw = String(text ?? "").trim().toLowerCase().replace(/,/g, " ");
  if ( !raw ) return null;
  if ( /^\d+(\.\d+)?$/.test(raw) ) return Math.round(Number(raw) * gpRate(rates));
  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)/g;
  let total = 0;
  let found = false;
  let rest = raw;
  for ( const match of raw.matchAll(re) ) {
    const rate = rates[match[2]];
    if ( !rate ) return null;
    total += Number(match[1]) * rate;
    found = true;
    rest = rest.replace(match[0], "");
  }
  if ( !found || rest.trim() ) return null;
  return Math.round(total);
}
