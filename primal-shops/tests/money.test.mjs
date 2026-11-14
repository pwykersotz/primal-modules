// Coins: prices, purses, paying with change, and prices typed by the GM. Plain Node, no Foundry.
//   node --test tests/money.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RATES, currencyRates, toCp, gpToCp, cpToGp, cleanPurse, purseValue, asCoins, pay, receive, formatCp,
  formatCoins, parsePrice
} from "../scripts/money.mjs";

/** A purse's worth must never change in a trade except by the amount paid. */
const worth = purse => purseValue(purse, DEFAULT_RATES);

test("dnd5e's currencies become copper rates, highest coin first", () => {
  const rates = currencyRates({
    pp: { conversion: 0.1 }, gp: { conversion: 1 }, ep: { conversion: 2 }, sp: { conversion: 10 }, cp: { conversion: 100 }
  });
  assert.deepEqual(rates, { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 });
  assert.deepEqual(Object.keys(rates), ["pp", "gp", "ep", "sp", "cp"]);
  assert.deepEqual(currencyRates({}), DEFAULT_RATES);
  assert.deepEqual(currencyRates({ gp: { conversion: "broken" } }), DEFAULT_RATES);
});

test("prices in any coin, or as gold pieces, become copper", () => {
  assert.equal(toCp({ value: 5, denomination: "sp" }), 50);
  assert.equal(toCp({ value: 2, denomination: "pp" }), 2000);
  assert.equal(toCp({ value: 1.5, denomination: "gp" }), 150);
  assert.equal(toCp({ value: 3, denomination: "unknown" }), 300, "an unknown coin counts as gold");
  assert.equal(toCp(2.5), 250);
  assert.equal(toCp("4"), 400);
  for ( const nothing of [null, undefined, "", { value: 0 }, { value: -3, denomination: "gp" }, { value: "x" }] ) {
    assert.equal(toCp(nothing), 0);
  }
  assert.equal(gpToCp(0.01), 1);
  assert.equal(cpToGp(250), 2.5);
  assert.equal(cpToGp(1), 0.01);
});

test("a purse is cleaned to whole coins and valued", () => {
  assert.deepEqual(cleanPurse({ gp: 3.7, sp: -2, cp: "5", pp: null }), { pp: 0, gp: 3, ep: 0, sp: 0, cp: 5 });
  assert.equal(purseValue({ pp: 1, gp: 2, ep: 1, sp: 3, cp: 4 }), 1000 + 200 + 50 + 30 + 4);
  assert.equal(purseValue(undefined), 0);
});

test("amounts are shown as gold, silver and copper only", () => {
  assert.deepEqual(asCoins(1234), { gp: 12, sp: 3, cp: 4 });
  assert.deepEqual(asCoins(0), {});
  assert.equal(formatCp(1234), "12 gp 3 sp 4 cp");
  assert.equal(formatCp(0), "0 gp");
  assert.equal(formatCp(150, { labels: { gp: "GP", sp: "SP" } }), "1 GP 5 SP");
  assert.equal(formatCoins({ cp: 2, gp: 1, sp: 0 }), "1 gp 2 cp");
  assert.equal(formatCoins({}), "");
});

test("paying exactly uses the smallest coins first", () => {
  const r = pay({ gp: 5, sp: 5, cp: 5 }, 55);
  assert.equal(r.ok, true);
  assert.deepEqual(r.paid, { cp: 5, sp: 5 });
  assert.deepEqual(r.change, {});
  assert.deepEqual(r.currency, { pp: 0, gp: 5, ep: 0, sp: 0, cp: 0 });
});

test("paying with a bigger coin gives change, and keeps back small coins the change would return", () => {
  // 4 gp 9 sp 5 cp from 7 sp 12 cp and 5 gp: hand over 5 gp, take 5 cp back, keep the silver and copper.
  const purse = { gp: 5, sp: 7, cp: 12 };
  const r = pay(purse, 495);
  assert.equal(r.ok, true);
  assert.equal(worth(purse) - worth(r.currency), 495, "the purse loses exactly the price");
  assert.equal(r.paid.gp, 5);
  assert.ok(!r.paid.sp, "no silver handed over only to come back");
  assert.deepEqual(r.change, { cp: 5 });
});

test("paying in platinum gives change in gold, silver and copper", () => {
  const r = pay({ pp: 1 }, 1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.paid, { pp: 1 });
  assert.deepEqual(r.change, { gp: 9, sp: 9, cp: 9 });
  assert.equal(worth(r.currency), 999);
});

test("a purse that can't pay is left alone and says how much is missing", () => {
  const r = pay({ gp: 1, sp: 2 }, 200);
  assert.equal(r.ok, false);
  assert.equal(r.short, 80);
  assert.deepEqual(r.paid, {});
  assert.equal(worth(r.currency), 120);
});

test("paying never changes a purse's worth by anything but the price", () => {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for ( let i = 0; i < 500; i++ ) {
    const purse = { pp: Math.floor(random() * 3), gp: Math.floor(random() * 20), ep: Math.floor(random() * 3),
      sp: Math.floor(random() * 30), cp: Math.floor(random() * 40) };
    const cost = Math.floor(random() * (worth(purse) + 50));
    const r = pay(purse, cost);
    if ( cost > worth(purse) ) { assert.equal(r.ok, false); continue; }
    assert.equal(r.ok, true);
    assert.equal(worth(purse) - worth(r.currency), cost, `${JSON.stringify(purse)} paying ${cost}`);
    for ( const n of Object.values(r.currency) ) assert.ok(Number.isInteger(n) && (n >= 0));
  }
});

test("receiving money adds gold, silver and copper", () => {
  const r = receive({ gp: 1, cp: 2 }, 255);
  assert.deepEqual(r.added, { gp: 2, sp: 5, cp: 5 });
  assert.deepEqual(r.currency, { pp: 0, gp: 3, ep: 0, sp: 5, cp: 7 });
});

test("prices typed by the GM", () => {
  assert.equal(parsePrice("25"), 2500);
  assert.equal(parsePrice("2.5"), 250);
  assert.equal(parsePrice("5 sp"), 50);
  assert.equal(parsePrice("1gp 5sp"), 150);
  assert.equal(parsePrice("1 gp, 5 sp"), 150);
  assert.equal(parsePrice(3), 300);
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("five gold"), null);
  assert.equal(parsePrice("5 zz"), null);
  assert.equal(parsePrice("5 gp and change"), null);
  assert.equal(parsePrice(-1), null);
});
