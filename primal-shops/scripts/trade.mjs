/**
 * Trades, made by the GM's client (see gm.mjs): stocking a shop, buying, selling, and offers waiting for the GM's
 * approval. Everything is checked again here against the shop as it is now (stock, prices, coins), since the window
 * that asked may be out of date.
 */
import { FLAGS, MODULE_ID, SETTINGS, escapeHTML, loc, newId, setting } from "./constants.mjs";
import { HANDLERS, broadcast, queued } from "./gm.mjs";
import { getLists, getShop, getState, isShop, rates, saveShop, saveState, shopActorOf, shopName } from "./store.mjs";
import {
  categoriesSold, checkPurchase, needsStocking, normalizeOffer, pickSelection, restockFromSale, restockPlan, restockRowFor,
  sellRateOf, sellableItems, shopEntries, stockView
} from "./shop.mjs";
import { isRolledStock } from "./catalog.mjs";
import { descriptionOf, ownEntries } from "./sources.mjs";
import { cpToGp, formatCoins, formatCp, pay, receive } from "./money.mjs";
import { renderDeclined, renderReceipt } from "./card.mjs";

/* -------------------------------------------- */
/*  Words for coins                             */
/* -------------------------------------------- */

/** Each coin's abbreviation ("gp"), from dnd5e. */
export function coinLabels() {
  const out = {};
  for ( const [key, c] of Object.entries(globalThis.CONFIG?.DND5E?.currencies ?? {}) ) {
    out[key] = c.abbreviation ? game.i18n.localize(c.abbreviation) : key;
  }
  return out;
}

/** An amount in words ("1 gp 5 sp"). */
export function money(cp) {
  return formatCp(cp, { rates: rates(), labels: coinLabels() });
}

/* -------------------------------------------- */
/*  A shop as it is now                         */
/* -------------------------------------------- */

/** Everything about a shop now: its settings, what it has, and every entry it could sell with why it isn't. */
export function shopContext(actor) {
  const shop = getShop(actor);
  const state = getState(actor);
  const r = rates();
  const entries = shopEntries(shop, getLists(), ownEntries(actor));
  const rows = stockView({ shop, state, entries, rates: r });
  return { actor, shop, state, rates: r, entries, rows };
}

/**
 * How many of an item its price is for: arrows are priced by 20. From the shop it was bought in, else the compendium
 * item it was made from, else 1.
 */
function bundleOf(item) {
  const bought = Number(item.flags?.[MODULE_ID]?.[FLAGS.bought]?.bundle);
  if ( bought > 1 ) return Math.floor(bought);
  const source = item._stats?.compendiumSource;
  if ( !source || (item.type !== "consumable") ) return 1;
  try {
    const n = Number(fromUuidSync(source, { strict: false })?.system?.quantity);
    return (n > 1) ? Math.floor(n) : 1;
  } catch {
    return 1;
  }
}

/** An item's data for the sell rules (see shop.sellableItems). */
function itemData(item) {
  return { id: item.id, name: item.name, img: item.img, type: item.type, system: item.system, bundle: bundleOf(item) };
}

/** What a shop pays for things, as a percentage. */
export function sellRate(shop) {
  return sellRateOf(shop, setting(SETTINGS.sellRate) ?? 50);
}

/** What a trader could sell to a shop. */
export function sellRows(ctx, trader, { gmPrices=false }={}) {
  const sold = categoriesSold(ctx.rows);
  return sellableItems([...(trader?.items ?? [])].map(itemData), {
    shop: ctx.shop, sold, rate: sellRate(ctx.shop), rates: ctx.rates, gmPrices
  });
}

async function shopFrom(uuid) {
  let doc = null;
  try {
    doc = uuid ? await fromUuid(uuid) : null;
  } catch {
    doc = null;
  }
  const actor = shopActorOf(doc);
  if ( !actor || !isShop(actor) ) throw new Error(loc("Errors.NoShop"));
  return actor;
}

async function traderFrom(uuid, user) {
  let actor = null;
  try {
    actor = uuid ? await fromUuid(uuid) : null;
  } catch {
    actor = null;
  }
  if ( actor?.documentName !== "Actor" ) throw new Error(loc("Errors.NoTrader"));
  if ( !user.isGM && !actor.testUserPermission(user, "OWNER") ) throw new Error(loc("Errors.NotYours", { name: actor.name }));
  if ( !actor.system?.currency ) throw new Error(loc("Errors.NoPurse", { name: actor.name }));
  return actor;
}

function checkOpen(shop, actor, user) {
  if ( !user.isGM && !shop.open ) throw new Error(loc("Errors.Closed", { name: shopName(actor, shop) }));
}

/* -------------------------------------------- */
/*  Stock                                       */
/* -------------------------------------------- */

async function rollStock(formula) {
  try {
    const roll = await new Roll(formula).evaluate();
    return Math.max(0, Math.floor(Number(roll.total) || 0));
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not roll the stock ${formula}`, err);
    return 0;
  }
}

/**
 * Stock a shop (GM): make its random pick and roll its rolled stocks, if they haven't been yet. restock: every limited
 * entry back to its full stock (rolled again). reroll: a new random pick, and restocked.
 * @returns {Promise<object>}  The state after.
 */
export async function stockShop(actor, { restock=false, reroll=false }={}) {
  const { shop, entries, rates: r } = shopContext(actor);
  const state = getState(actor);
  let changed = false;
  const fresh = restock || reroll;
  if ( shop.random.enabled && (reroll || !state.selection) ) {
    state.selection = pickSelection(entries, shop, r);
    changed = true;
  }
  if ( fresh ) {
    state.stock = {};
    state.stockedAt = Date.now();
    changed = true;
  }
  for ( const [key, stock] of Object.entries(restockPlan(entries)) ) {
    if ( Number.isInteger(state.stock[key]) ) continue;
    if ( !isRolledStock(stock) && !fresh ) continue;
    state.stock[key] = isRolledStock(stock) ? await rollStock(stock) : Number(stock);
    changed = true;
  }
  if ( changed ) await saveState(actor, state);
  return getState(actor);
}

/** Stock a shop if it needs it (a player opened it before the GM did). */
async function ensureStocked(actor) {
  const { shop, state, entries } = shopContext(actor);
  if ( needsStocking(entries, shop, state) ) await stockShop(actor);
}

/* -------------------------------------------- */
/*  Items changing hands                        */
/* -------------------------------------------- */

/** An item's data ready to go into another inventory: out of any container, not equipped or attuned. */
function cleanItemData(data) {
  delete data._id;
  data.folder = null;
  data.sort = 0;
  data.system ??= {};
  if ( "container" in data.system ) data.system.container = null;
  if ( "equipped" in data.system ) data.system.equipped = false;
  if ( "attuned" in data.system ) data.system.attuned = false;
  if ( data.flags?.[MODULE_ID] ) delete data.flags[MODULE_ID];
  return data;
}

function paragraphs(text) {
  return String(text ?? "").split(/\n+/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escapeHTML(p)}</p>`).join("");
}

/**
 * The item a buyer gets for a row of the shop: a copy of the compendium or world item, of the shopkeeper's own item,
 * or one made from a custom entry.
 * @returns {Promise<object>}  Item data.
 */
async function itemFor(row, qty, actor) {
  if ( row.source === "own" ) {
    const item = actor.items.get(row.itemId);
    if ( !item ) throw new Error(loc("Errors.Gone", { name: row.name }));
    const data = cleanItemData(item.toObject());
    data.system.quantity = qty;
    return data;
  }
  if ( row.uuid ) {
    let source = null;
    try {
      source = await fromUuid(row.uuid);
    } catch {
      source = null;
    }
    if ( source?.documentName !== "Item" ) throw new Error(loc("Errors.ItemMissing", { name: row.name }));
    const data = (source.pack && game.items?.fromCompendium) ? game.items.fromCompendium(source) : source.toObject();
    cleanItemData(data);
    const each = Math.max(1, Math.floor(Number(data.system.quantity) || 1));
    data.system.quantity = each * qty;
    // Its price here (for the bundle, as the item's own is).
    if ( (row.priceGp !== null) && (row.priceGp !== undefined) ) data.system.price = { value: row.priceGp, denomination: "gp" };
    return data;
  }
  const r = rates();
  const unitGp = cpToGp(row.priceCp, r);
  return {
    name: row.name,
    type: row.type || "loot",
    img: row.img,
    system: {
      quantity: Math.max(1, row.bundle || 1) * qty,
      price: { value: unitGp, denomination: "gp" },
      ...(row.subtype ? { type: { value: row.subtype } } : {}),
      rarities: row.rarity ? [row.rarity] : [],
      rarity: row.rarity || "",
      properties: row.magical ? ["mgc"] : [],
      attunement: row.attunement ? "required" : "",
      weight: { value: row.weight || 0 },
      description: { value: paragraphs(row.description) }
    }
  };
}

/** The item on an actor that bought or sold things of the same kind go on (consumables and loot stack). */
function stackFor(actor, data) {
  if ( !["consumable", "loot"].includes(data.type) ) return null;
  const source = data._stats?.compendiumSource ?? null;
  return actor.items.find(i => (i.type === data.type) && !i.system?.container
    && ((source && (i._stats?.compendiumSource === source)) || (i.name === data.name))) ?? null;
}

/** Put items into an inventory, on stacks it has already where they stack. */
async function giveItems(actor, list) {
  const create = [];
  const updates = new Map();
  for ( const data of list ) {
    const stack = stackFor(actor, data);
    if ( stack ) {
      const before = updates.get(stack.id) ?? (Number(stack.system.quantity) || 0);
      updates.set(stack.id, before + (Number(data.system?.quantity) || 1));
    }
    else create.push(data);
  }
  if ( updates.size ) {
    await actor.updateEmbeddedDocuments("Item", [...updates].map(([_id, q]) => ({ _id, "system.quantity": q })));
  }
  if ( create.length ) await actor.createEmbeddedDocuments("Item", create);
}

/** Take so many of each item out of an inventory (the item goes when none are left). */
async function takeItems(actor, lines) {
  const updates = [];
  const deletes = [];
  for ( const { itemId, qty } of lines ) {
    const item = actor.items.get(itemId);
    if ( !item ) continue;
    const left = (Number(item.system?.quantity) || 0) - qty;
    if ( left > 0 ) updates.push({ _id: item.id, "system.quantity": left });
    else deletes.push(item.id);
  }
  if ( updates.length ) await actor.updateEmbeddedDocuments("Item", updates);
  if ( deletes.length ) await actor.deleteEmbeddedDocuments("Item", deletes);
}

function purchaseError(error) {
  const key = { gone: "Gone", unavailable: "Unavailable", notEnough: "NotEnough", soldOut: "SoldOut", empty: "Empty" }[error.code] ?? "Unavailable";
  return new Error(loc(`Errors.${key}`, { name: error.name, left: error.left ?? 0 }));
}

/* -------------------------------------------- */
/*  Buying and selling                          */
/* -------------------------------------------- */

/**
 * A purchase, made now. lines: { key, qty, unitCp? } (unitCp: a price the GM set when approving).
 * @returns {Promise<{totalCp: number, names: string[]}>}
 */
async function doBuy({ actor, buyer, lines, approvedBy=null }) {
  await ensureStocked(actor);
  const ctx = shopContext(actor);
  const check = checkPurchase(ctx.rows, lines);
  if ( !check.ok ) throw purchaseError(check.error);

  // Every item is read before any coin changes hands, so a missing item stops the purchase with nothing lost.
  const stamp = { shop: shopName(actor, ctx.shop), at: Date.now() };
  const items = [];
  for ( const line of check.lines ) {
    const data = await itemFor(line.row, line.qty, actor);
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.${FLAGS.bought}`, {
      ...stamp, price: line.unitCp, bundle: line.row.bundle || 1, key: (line.row.source === "list") ? line.row.key : null
    });
    items.push(data);
  }
  const before = foundry.utils.deepClone(buyer.system.currency);
  const payment = pay(before, check.totalCp, ctx.rates);
  if ( !payment.ok ) throw new Error(loc("Errors.CantAfford", { name: buyer.name, short: money(payment.short) }));
  await buyer.update({ "system.currency": payment.currency });
  try {
    await giveItems(buyer, items);
  } catch (err) {
    await buyer.update({ "system.currency": before });
    throw err;
  }

  // The shop's side: stock, its own items, its coins.
  const state = getState(actor);
  let stockChanged = false;
  const ownTaken = [];
  for ( const line of check.lines ) {
    if ( line.row.source === "own" ) ownTaken.push({ itemId: line.row.itemId, qty: line.qty });
    else if ( Number.isInteger(line.row.stock) ) {
      state.stock[line.row.key] = Math.max(0, line.row.stock - line.qty);
      stockChanged = true;
    }
  }
  if ( stockChanged ) await saveState(actor, state);
  if ( ownTaken.length ) await takeItems(actor, ownTaken);
  if ( ctx.shop.purse && actor.system?.currency ) {
    await actor.update({ "system.currency": receive(actor.system.currency, check.totalCp, ctx.rates).currency });
  }

  const labels = coinLabels();
  await postReceipt({
    kind: "buy",
    actor,
    shop: ctx.shop,
    trader: buyer,
    lines: check.lines.map(l => ({ name: l.row.name, img: l.row.img, qty: l.qty, totalCp: l.totalCp })),
    totalCp: check.totalCp,
    coins: [
      formatCoins(payment.paid, labels, ctx.rates) ? loc("Card.Paid", { coins: formatCoins(payment.paid, labels, ctx.rates) }) : "",
      formatCoins(payment.change, labels, ctx.rates) ? loc("Card.Change", { coins: formatCoins(payment.change, labels, ctx.rates) }) : ""
    ].filter(Boolean).join(" · "),
    approvedBy
  });
  return { totalCp: check.totalCp, names: check.lines.map(l => l.row.name) };
}

/**
 * Check a sale against the trader's inventory now. lines: { itemId, qty, unitCp? }.
 * @returns {{lines: object[], totalCp: number}}
 */
function checkSale(ctx, seller, lines, { gmPrices=false }={}) {
  const rows = sellRows(ctx, seller, { gmPrices: true });
  const byId = new Map(rows.map(r => [r.id, r]));
  const counted = new Map();
  for ( const line of lines ?? [] ) {
    const qty = Math.max(0, Math.floor(Number(line?.qty) || 0));
    if ( !qty || !line.itemId ) continue;
    const before = counted.get(line.itemId);
    counted.set(line.itemId, { itemId: line.itemId, qty: (before?.qty ?? 0) + qty, unitCp: line.unitCp ?? before?.unitCp });
  }
  const out = [];
  let totalCp = 0;
  for ( const line of counted.values() ) {
    const row = byId.get(line.itemId);
    if ( !row ) throw new Error(loc("Errors.NotInInventory"));
    if ( (row.reason === "container") ) throw new Error(loc("Errors.FullContainer", { name: row.name }));
    if ( (row.reason === "notBought") ) throw new Error(loc("Errors.NotBought", { name: row.name }));
    const priced = Number.isFinite(line.unitCp);
    if ( !(row.unitCp > 0) && !priced && !gmPrices ) throw new Error(loc("Errors.NoPrice", { name: row.name }));
    if ( line.qty > row.quantity ) throw new Error(loc("Errors.TooMany", { name: row.name, n: row.quantity }));
    const unitCp = priced ? Math.max(0, Math.round(line.unitCp)) : row.unitCp;
    out.push({ row, qty: line.qty, unitCp, totalCp: unitCp * line.qty });
    totalCp += unitCp * line.qty;
  }
  if ( !out.length ) throw new Error(loc("Errors.Empty"));
  return { lines: out, totalCp };
}

/**
 * A sale, made now: the items leave the seller (into the shopkeeper's inventory, if the shop keeps them) and the
 * coins arrive.
 */
async function doSell({ actor, seller, lines, approvedBy=null }) {
  await ensureStocked(actor);
  const ctx = shopContext(actor);
  const sale = checkSale(ctx, seller, lines, { gmPrices: !!approvedBy });
  let shopPurse = null;
  if ( ctx.shop.purse && actor.system?.currency ) {
    const payment = pay(actor.system.currency, sale.totalCp, ctx.rates);
    if ( !payment.ok ) throw new Error(loc("Errors.ShopCantPay", { name: shopName(actor, ctx.shop), short: money(payment.short) }));
    shopPurse = payment.currency;
  }
  // What the shop keeps: back into the stock of what it sells already, else into the shopkeeper's inventory.
  const copies = [];
  const returns = [];
  if ( ctx.shop.keepBought && (actor !== seller) ) {
    for ( const line of sale.lines ) {
      const item = seller.items.get(line.row.id);
      if ( !item ) continue;
      const row = restockRowFor(ctx.rows, {
        name: item.name,
        key: item.flags?.[MODULE_ID]?.[FLAGS.bought]?.key ?? null,
        uuid: item._stats?.compendiumSource ?? item.flags?.core?.sourceId ?? null
      });
      if ( row ) {
        returns.push({ row, qty: line.qty });
        continue;
      }
      const data = cleanItemData(item.toObject());
      data.system.quantity = line.qty;
      copies.push(data);
    }
  }
  await takeItems(seller, sale.lines.map(l => ({ itemId: l.row.id, qty: l.qty })));
  const got = receive(seller.system.currency, sale.totalCp, ctx.rates);
  await seller.update({ "system.currency": got.currency });
  if ( copies.length ) await giveItems(actor, copies);
  const restocked = restockFromSale(returns);
  if ( Object.keys(restocked).length ) {
    const state = getState(actor);
    Object.assign(state.stock, restocked);
    await saveState(actor, state);
  }
  if ( shopPurse ) await actor.update({ "system.currency": shopPurse });

  const labels = coinLabels();
  await postReceipt({
    kind: "sell",
    actor,
    shop: ctx.shop,
    trader: seller,
    lines: sale.lines.map(l => ({ name: l.row.name, img: l.row.img, qty: l.qty, totalCp: l.totalCp })),
    totalCp: sale.totalCp,
    coins: formatCoins(got.added, labels, ctx.rates) ? loc("Card.Received", { coins: formatCoins(got.added, labels, ctx.rates) }) : "",
    approvedBy
  });
  return { totalCp: sale.totalCp, names: sale.lines.map(l => l.row.name) };
}

/* -------------------------------------------- */
/*  Chat cards                                  */
/* -------------------------------------------- */

/** Who sees a card about an actor's trade: everyone (none whispered), or its owners and the GMs. */
function whisperFor(trader) {
  const mode = setting(SETTINGS.receipts) ?? "everyone";
  if ( mode !== "private" ) return [];
  return [...(game.users ?? [])].filter(u => u.isGM || trader?.testUserPermission?.(u, "OWNER")).map(u => u.id);
}

async function postReceipt({ kind, actor, shop, trader, lines, totalCp, coins, approvedBy }) {
  if ( (setting(SETTINGS.receipts) ?? "everyone") === "none" ) return null;
  const name = shopName(actor, shop);
  const content = renderReceipt({
    kind,
    title: loc(kind === "buy" ? "Card.Bought" : "Card.Sold", { name: trader.name, shop: name }),
    img: actor.img,
    lines: lines.map(l => ({ name: l.name, img: l.img, qty: l.qty, price: money(l.totalCp) })),
    totalLabel: loc(kind === "buy" ? "Card.TotalPaid" : "Card.TotalReceived"),
    total: money(totalCp),
    coins,
    note: approvedBy ? loc("Card.ApprovedBy", { name: approvedBy }) : ""
  });
  return ChatMessage.implementation.create({
    content,
    speaker: { alias: name, actor: actor.id },
    whisper: whisperFor(trader),
    flags: { [MODULE_ID]: { [FLAGS.card]: { kind, shop: actor.uuid } } }
  });
}

async function postDeclined({ actor, shop, offer, note }) {
  const user = game.users.get(offer.userId);
  const content = renderDeclined({
    title: loc(offer.kind === "buy" ? "Card.DeclinedBuy" : "Card.DeclinedSell", { name: offer.actorName, shop: shopName(actor, shop) }),
    img: actor.img,
    lines: offer.lines.map(l => ({ name: l.name, qty: l.qty })),
    note
  });
  return ChatMessage.implementation.create({
    content,
    speaker: { alias: shopName(actor, shop), actor: actor.id },
    whisper: [...new Set([user?.id, ...[...game.users].filter(u => u.isGM).map(u => u.id)].filter(Boolean))],
    flags: { [MODULE_ID]: { [FLAGS.card]: { kind: "declined", shop: actor.uuid } } }
  });
}

/* -------------------------------------------- */
/*  What the GM is asked to do                  */
/* -------------------------------------------- */

/** Does this user need the GM's approval for this kind of trade? */
export function needsApproval(kind, user=game.user) {
  if ( !user || user.isGM ) return false;
  return !!setting(kind === "buy" ? SETTINGS.buyApproval : SETTINGS.sellApproval);
}

/** Buy now (a player asking, when purchases don't need the GM's approval; or a GM). */
async function buy(data, user) {
  const actor = await shopFrom(data.shopUuid);
  const buyer = await traderFrom(data.actorUuid, user);
  checkOpen(getShop(actor), actor, user);
  if ( needsApproval("buy", user) ) throw new Error(loc("Errors.NeedsApproval"));
  return queued(actor.uuid, () => doBuy({ actor, buyer, lines: (data.lines ?? []).map(l => ({ key: l.key, qty: l.qty })) }));
}

/** Sell now (a player asking, when sales don't need the GM's approval; or a GM). */
async function sell(data, user) {
  const actor = await shopFrom(data.shopUuid);
  const seller = await traderFrom(data.actorUuid, user);
  checkOpen(getShop(actor), actor, user);
  if ( !user.isGM && (setting(SETTINGS.playersCanSell) === false) ) throw new Error(loc("Errors.NoSelling"));
  if ( needsApproval("sell", user) ) throw new Error(loc("Errors.NeedsApproval"));
  return queued(actor.uuid, () => doSell({ actor, seller, lines: (data.lines ?? []).map(l => ({ itemId: l.itemId, qty: l.qty })) }));
}

/** A trade for the GM to approve: kept on the shop until the GM answers it, or the player takes it back. */
async function offer(data, user) {
  const actor = await shopFrom(data.shopUuid);
  const trader = await traderFrom(data.actorUuid, user);
  const kind = (data.kind === "buy") ? "buy" : "sell";
  checkOpen(getShop(actor), actor, user);
  if ( (kind === "sell") && !user.isGM && (setting(SETTINGS.playersCanSell) === false) ) throw new Error(loc("Errors.NoSelling"));
  return queued(actor.uuid, async () => {
    let lines;
    if ( kind === "buy" ) {
      await ensureStocked(actor);
      const check = checkPurchase(shopContext(actor).rows, (data.lines ?? []).map(l => ({ key: l.key, qty: l.qty })));
      if ( !check.ok ) throw purchaseError(check.error);
      lines = check.lines.map(l => ({ key: l.row.key, name: l.row.name, img: l.row.img, qty: l.qty, unitCp: l.unitCp }));
    } else {
      const sale = checkSale(shopContext(actor), trader, (data.lines ?? []).map(l => ({ itemId: l.itemId, qty: l.qty })), { gmPrices: true });
      lines = sale.lines.map(l => ({ itemId: l.row.id, name: l.row.name, img: l.row.img, qty: l.qty, unitCp: l.unitCp }));
    }
    const made = normalizeOffer({
      id: newId(), kind, userId: user.id, userName: user.name, actorUuid: trader.uuid, actorName: trader.name, lines, at: Date.now()
    });
    const state = getState(actor);
    state.offers.push(made);
    await saveState(actor, state);
    broadcast("offer", { shopUuid: actor.uuid, offerId: made.id, userName: user.name }, { self: true });
    return made;
  });
}

/** Take back an offer (the player who made it, or a GM). */
async function cancelOffer(data, user) {
  const actor = await shopFrom(data.shopUuid);
  return queued(actor.uuid, async () => {
    const state = getState(actor);
    const found = state.offers.find(o => o.id === data.offerId);
    if ( !found ) return false;
    if ( !user.isGM && (found.userId !== user.id) ) throw new Error(loc("Errors.NotYourOffer"));
    state.offers = state.offers.filter(o => o.id !== data.offerId);
    await saveState(actor, state);
    broadcast("answered", { shopUuid: actor.uuid, offerId: found.id, userId: found.userId, outcome: "cancelled" }, { self: true });
    return true;
  });
}

/**
 * The GM answers an offer: approve it (with the prices the GM set, one per line, in the smallest coin), or turn it
 * down.
 */
export async function answerOffer(data, user) {
  if ( !user.isGM ) throw new Error(loc("Errors.GMOnly"));
  const actor = await shopFrom(data.shopUuid);
  return queued(actor.uuid, async () => {
    const found = getState(actor).offers.find(o => o.id === data.offerId);
    if ( !found ) throw new Error(loc("Errors.OfferGone"));
    let result = null;
    if ( data.approve ) {
      let trader = null;
      try {
        trader = await fromUuid(found.actorUuid);
      } catch {
        trader = null;
      }
      if ( trader?.documentName !== "Actor" ) throw new Error(loc("Errors.NoTrader"));
      const prices = Array.isArray(data.prices) ? data.prices : [];
      const lines = found.lines.map((l, i) => ({
        key: l.key, itemId: l.itemId, qty: l.qty,
        unitCp: Number.isFinite(Number(prices[i])) && (prices[i] !== null) ? Math.max(0, Math.round(Number(prices[i]))) : l.unitCp
      }));
      const approvedBy = user.name;
      result = (found.kind === "buy")
        ? await doBuy({ actor, buyer: trader, lines, approvedBy })
        : await doSell({ actor, seller: trader, lines, approvedBy });
    } else {
      await postDeclined({ actor, shop: getShop(actor), offer: found, note: String(data.note ?? "").trim() });
    }
    const state = getState(actor);
    state.offers = state.offers.filter(o => o.id !== found.id);
    await saveState(actor, state);
    broadcast("answered", {
      shopUuid: actor.uuid, offerId: found.id, userId: found.userId, outcome: data.approve ? "approved" : "declined",
      kind: found.kind, actorName: found.actorName, totalCp: result?.totalCp ?? null
    }, { self: true });
    return result;
  });
}

/** Stock a shop that hasn't been (a player opened it first). */
async function stock(data) {
  const actor = await shopFrom(data.shopUuid);
  return queued(actor.uuid, () => ensureStocked(actor));
}

/** An item's description, for a player who can't read its compendium: only for something the shop sells. */
async function describe(data, user) {
  const actor = await shopFrom(data.shopUuid);
  const row = shopContext(actor).rows.find(r => r.key === data.key);
  if ( !row ) return "";
  if ( !user.isGM && row.reason && !["soldOut"].includes(row.reason) ) return "";
  if ( row.source === "own" ) return String(actor.items.get(row.itemId)?.system?.description?.value ?? "");
  if ( !row.uuid ) return paragraphs(row.description);
  return descriptionOf(row.uuid);
}

Object.assign(HANDLERS, { buy, sell, offer, cancelOffer, answerOffer, stock, describe });

/* -------------------------------------------- */
/*  The GM's own changes                        */
/* -------------------------------------------- */

/** Take an entry out of a shop, or put it back (GM). */
export async function setHidden(actor, key, hidden) {
  return queued(actor.uuid, async () => {
    const shop = getShop(actor);
    const set = new Set(shop.hidden);
    if ( hidden ) set.add(key);
    else set.delete(key);
    shop.hidden = [...set];
    await saveShop(actor, shop);
  });
}

/** Restock a shop, or make a new random pick (GM). */
export async function restockShop(actor, { reroll=false }={}) {
  return queued(actor.uuid, () => stockShop(actor, { restock: true, reroll }));
}

/** Set how many of an entry a shop has left (GM). null: back to its list's stock. */
export async function setStock(actor, key, n) {
  return queued(actor.uuid, async () => {
    const state = getState(actor);
    if ( (n === null) || (n === undefined) || (n === "") ) delete state.stock[key];
    else state.stock[key] = Math.max(0, Math.floor(Number(n) || 0));
    await saveState(actor, state);
  });
}

/** After a shop's settings change (GM): stock what needs it, or make a new random pick. */
export async function stockAfterChange(actor, { reroll=false }={}) {
  return queued(actor.uuid, () => stockShop(actor, { reroll }));
}
