# Primal Shops

Shops for Foundry VTT (V14) and D&D 5e (6.0). A player double-clicks a shopkeeper's token and the shop opens: what it
sells, grouped by kind, with prices in the system's coins, a cart, and their character's purse. They buy, paying in
coins and getting change, and can sell their own things back, by default for half price with the GM's approval.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

## Setting up a shop

1. **Make some shop lists.** Game Settings → Configure Settings → Primal Shops → **Edit the shop lists** (or the
   Shop lists button in any shop). A list is a set of items a kind of shop sells: a smithy's, an alchemist's, a magic
   shop's. Shops sell from as many lists as you like, and a list can be shared by many shops.
2. **Make a shop.** On the shopkeeper's token, open the Token HUD and press the **shop** button (or right-click the
   actor in the Actors sidebar → Shop settings). Tick its lists, set its level, and save. Every token of that actor is
   now the shop.
3. **Players double-click the token** to open it. They need no permission on the shopkeeper.

The GM double-clicks too (hold **Alt** to open the actor's sheet instead; a setting turns this off).

In the shop, the items of each kind can be sorted by **name or price, either way** (or by rarity), and so can the
things a player sells. Items with no price go last whichever way prices are sorted.

## Filling shop lists quickly

In the Shop lists window, for the list on show:

- **Add items**: pick from the world's items or any item compendium (homebrew and third-party ones too), with filters
  for name, kind, rarity, magic, source book, folder and price. Every match is ticked; untick what you don't want.
- **Compendium Browser**: dnd5e's own browser, to tick items from every compendium at once.
- **Drop** an item, a folder of items, or a whole compendium from the sidebar onto the window.
- **Paste names**: one item per line, copied from a book, a document or a spreadsheet, with its price, stock and level
  if you like, split by tabs, `|` or `;`:

  ```
  Potion of Healing | 50 | 1d4
  Longsword | 15
  Arrows (20)	1 gp	10
  Spyglass; 1000; 1; 3
  ```

  Names are looked up in the world's items and every item compendium (or just one). An item already on the list gets
  the new price, stock and level, so pasting is also a quick way to reprice a list. Names not found can be added as
  custom items.
- **Custom item**: one made up on the spot (name, kind, price, rarity, picture, description). A buyer gets an item
  made from it.
- **Starter lists**: a general store's, a smithy's, an alchemist's, a magic shop's, a scribe's and a toolmaker's lists,
  made from the Player's Handbook and the SRD (or any item compendiums you tick).
- **Import / Export**: lists as JSON, to share between worlds or write by hand:

  ```json
  { "name": "Fletcher", "entries": [ "Arrows (20) | 1 gp | 10", { "name": "Longbow", "priceGp": 50, "stock": "1d2" } ] }
  ```

Each item on a list can have its own **price here** (in gold pieces, or coins: `5 sp`, `1 gp 5 sp`), **stock** (a
number, or a roll such as `1d4+1`, rolled when the shop is stocked and at each restock; empty is no limit) and
**level**. Tick items to change their level or stock, reset their prices, or remove them all at once. Click the
**Item**, **Its price** or **Price here** heading to sort the list by it, and again for the other way; the Add items
window sorts by name or price too.
**Update from items** reads each item's name, picture, price and rarity again after a compendium changes.

## Quick shops, with no shopkeeper

Not every shop needs an owner. **New shop** (the bookmark button in the Token controls, or in Shops here) makes one in
two clicks: pick what it sells and press **Create**. It starts from what you picked last time.

- It can hang as a **ribbon** at the top of the screen (the default), go down as a **pin** in the middle of your view,
  or wait. Tick **Show it to players now** to skip revealing it.
- The module makes a stand-in actor to hold it, in a **Shops** folder in the Actors sidebar. You never need to open
  it, but you can drop it on a map like any shop. Renaming the shop in its settings renames the stand-in too.
- **A token can open it too**, if you want one: select tokens on the map before pressing New shop (a merchant, a
  market stall, a signpost), or later use **Link the selected tokens** in the shop's settings or on its ribbon's or
  pin's right-click menu. Linked tokens open the shop when double-clicked, whatever actor they are, and count for its
  range. **Unlink** is in the shop's settings.

## Shops on the map: pins

Some shops don't need a token: a town map the party never walks on, or a stall drawn on a battle map. Put the shop on
the map as a **pin** instead. The shopkeeper actor holds the shop as always, and needn't be on the map.

- **Dropping a shop's actor on the map** (from the Actors sidebar) asks whether to put down a **token**, a **pin** or
  a **ribbon** (below).
- Or, in the shop's settings, **Place a pin on this scene**: it goes in the middle of your view.
- A new pin is **hidden** from players: the GM sees it faded, with a crossed-out eye. **Right-click** it to reveal or
  hide it, give it its own range, open the shop or its settings, or remove it. **Drag** it to move it.
- **Players double-click** a revealed pin to open the shop, whatever tool they have in hand. Its name is shown under
  it. A closed shop's pin stays on the map with a lock, and says the shop is closed.
- **Range**: a pin uses its own range, else the shop's. A player with a token on the scene must be within range of one
  of the shop's pins or tokens. A player with no token on the scene (a town map) can trade from anywhere.
- **Shops here** (the shop button in the Token controls) lists the shops on the scene, from their pins, ribbons and
  tokens, to open one without hunting for it. Players see the revealed ones. The GM sees them all, marked, with
  **Reveal all** and **Hide all**.

## Ribbons at the top of the screen

A shop can hang as a **ribbon** from the top of the screen while a scene is shown, with its name written down it,
instead of being anywhere on the map. Players click it to open the shop, from anywhere on the scene (no range).

- Choose **Ribbon** when you drop the shop's actor on the map, or **Hang a ribbon on this scene** in its settings. A
  shop has one ribbon on a scene at most.
- Ribbons hang at the right, just clear of the sidebar, and start **hidden** from players (the GM sees them faded).
  **Right-click** one to reveal or hide it, open the shop, change its colors and settings, move it left or right, or
  take it down.
- **Colors**: each shop has its own, in its settings under **Ribbon colors**: the ribbon, and its trim and lettering,
  with a preview as you pick (crimson and gold unless changed). A closed shop's ribbon is greyed, with a lock.

## Shop level

A shop's level (0 to 6) is the highest rarity it sells: 0 mundane only, 1 up to common, 2 uncommon, 3 rare, 4 very
rare, 5 legendary, 6 everything. An item's level is its rarity's, unless you set one on the list: a mundane spyglass
a village shop shouldn't have can be level 3. Items above the shop's level are left out.

## Shop settings

- **Name, greeting**, and whether it's **open**.
- **Range**: how close a player's token must be to trade, measured from the nearest of the shop's tokens and map pins
  on the scene (a pin can have its own).
- **Highest price**: leave out anything dearer.
- **A random pick**: only so many items of each rarity, picked at random from its lists (4 common, 2 uncommon…). The
  GM makes a new pick or restocks from the shop window.
- **Sells the shopkeeper's own items**: things in the actor's inventory that aren't equipped are for sale too.
- **Prices**: a markup (120% is a fifth dearer), what it buys (anything, only the kinds it sells, or nothing), and what
  it pays (the world's rate, 50% unless changed, or its own).
- **Sells on what it buys**: things players sell go back on the shelves. Something the shop has on sale already (the
  same item, or one with the same name) goes back into its stock: two Acid sold to a shop that sells Acid add two to
  its stock (nothing to add when its stock has no limit), with no second listing. Anything else goes into the
  shopkeeper's inventory.
- **Pays from the shopkeeper's coins**: its takings and payments go in and out of the actor's purse.

In the shop window the GM can also hide any item from players, set how many are left, open or close the shop, and see
what players don't (Show all).

## Selling, and the GM's approval

With **The GM approves sales** on (the default), a player's sale goes to the GM as an offer. The **Offers** window
opens for the GM with every offer waiting: change any price (haggle), then approve or turn it down. Approved, the
trade is made at once, with a receipt in chat. A setting makes purchases need approval too. A GM must be logged in
for players to trade; the GM's client moves the items and coins.

**Monster components** harvested with Primal Harvesting are priced at what they sell for, so a shop pays their full
price, not its usual share. A shop set to buy nothing, or only the kinds of thing it sells, still turns them away.

## Coins

Prices are worked out in copper. A buyer pays with their smallest coins first, then hands over a bigger coin and gets
change in gold, silver and copper. A shop pays in gold, silver and copper.

## Macros

```js
const shops = game.modules.get("primal-shops").api;
shops.open(token);                       // open a shop (a Token, TokenDocument or Actor)
shops.config(actor);                     // its settings (GM)
shops.makeShop(actor, { lists: [shops.list("Smithy").id], level: 2, markup: 110 });
shops.restock(actor, { reroll: true });  // restock, with a new random pick
shops.importLists(json);                 // add shop lists from JSON (GM)
shops.openLists();                       // the Shop lists window
shops.openOffers();                      // the offers waiting
shops.shopsHere();                       // the Shops here list
shops.placePin(actor, { x: 1200, y: 800 }); // a pin on the scene shown, hidden (GM; the middle of the view if no point)
shops.placeRibbon(actor);                // a ribbon at the top of the screen on the scene shown, hidden (GM)
shops.newShop();                         // the New shop window (GM)
shops.createShop({ lists: [shops.list("Smithy").id], place: "ribbon", reveal: true }); // a shop at once (GM)
shops.linkTokens(actor, [tokenDoc]);     // tokens that open a shop (GM)
shops.revealPins();                      // reveal every pin and ribbon on the scene (false: hide them) (GM)
```

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
