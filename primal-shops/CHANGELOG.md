# Changelog

## 1.3.1
- **Harvested monster components sell for their full price.** A component from Primal Harvesting is priced at what it sells for (Heliana's "sells for" value), so shops now pay all of it instead of their usual share (50% unless changed). A shop set to buy nothing, or only the kinds of thing it sells, still turns them away.

## 1.3.0
- **New shop, in two clicks, with no shopkeeper**: a bookmark button in the Token controls (and in Shops here) asks what the shop sells, then makes it and hangs its ribbon (or puts down a pin). It starts from what you picked last time, and can show the shop to players at once. A stand-in actor holds the shop, in a Shops folder in the Actors sidebar, and is renamed with the shop.
- **Tokens linked to a shop**: any token can open a shop when double-clicked, whatever its actor is. Select tokens before pressing New shop, or link them later from the shop's settings or its ribbon's or pin's right-click menu. Linked tokens count for the shop's range, and the shop's settings can unlink them.
- Macro API: newShop, createShop, linkTokens.

## 1.2.0
- **Ribbons**: a shop can hang from the top of the screen while a scene is shown, as a ribbon with its name written down it, a stitched trim, a seal and a notched tail. Players click it to open the shop, from anywhere on the scene.
  - Dropping a shop's actor on the map now offers Token, Map pin or **Ribbon**. Shop settings also have **Hang a ribbon on this scene**.
  - Ribbons start hidden from players. The GM right-clicks one to reveal or hide it, open the shop, change its colors, move it left or right, or take it down. **Reveal all** and **Hide all** in Shops here cover ribbons too.
  - **Ribbon colors** in each shop's settings, for the ribbon and for its trim and lettering, with a live preview. The default is crimson and gold.
- Shops here tags shops with a ribbon, and its buttons read Reveal all and Hide all.

## 1.1.1
- **Fixed: the GM couldn't see hidden pins.** A hidden pin used the class name "hidden", which Foundry's own styles hide outright. The pins and the Shops here list now use names of their own, so the GM sees hidden pins faded with a crossed-out eye, and their rows and "Hidden from players" tags in Shops here.
- **No hover text on pins**: the name under a pin is enough. The lock and the crossed-out eye show a closed or hidden shop.

## 1.1.0
- **Shops on the map as pins**, for scenes where a token doesn't fit: a town map, or a stall on a battle map. The shopkeeper actor holds the shop and needn't be placed.
  - Dropping a shop's actor on the map asks: a token or a pin. Shop settings also have **Place a pin on this scene**.
  - Pins start hidden from players. The GM sees them faded, drags to move them, and right-clicks for reveal or hide, the pin's own range, open, settings and remove.
  - Players double-click a revealed pin to open the shop, with its name shown under it. A closed shop keeps its pin, shows a lock, and says it's closed.
  - Range: a pin's own, else the shop's. A player with a token on the scene must be in range of a pin or token; with no token on the scene, they trade from anywhere.
- **Shops here**: a button in the Token controls lists the shops on the scene from their pins and tokens. Players see the revealed ones. The GM sees them all, with Reveal all and Hide all.
- Macro API: shopsHere, placePin, revealPins, openPin, drawPins.

## 1.0.5
- **Fixed: range measured from a deleted token.** A shop window kept measuring from the token it was opened from, so after that token was deleted and the shop put down again, players were told to come closer. Range is now measured from whichever of the shop's tokens on the scene is nearest, as they are now, and open windows check again when tokens are placed, moved or deleted, or the scene changes.

## 1.0.4
- **Selling back restocks**: something a player sells that the shop has on sale already (the item it was bought as, the same compendium item, or the same name) goes back into that item's stock instead of being listed a second time from the shopkeeper's inventory. Bundles count as bundles (20 arrows are one), and an item with no stock limit just takes them back. Anything else still goes into the shopkeeper's inventory.

## 1.0.3
- **Fixed: the Sell tab didn't open.** Its button used an action name Foundry keeps for its own tabs, so Foundry handled the click and the shop never switched. The tests now treat Foundry's own action names the way Foundry does.

## 1.0.2
- **Sort by name or price, either way**: the shop's Buy tab sorts by name (A to Z, Z to A), price (low to high, high to low) or rarity, and the Sell tab gets its own sort. Items with no price go last. A player's choice carries over to the next shop they open.
- In the **Shop lists** window, click the Item, Its price or Price here heading to sort by it, and again for the other way. The **Add items** window sorts by name or price too.

## 1.0.1
- **Shop settings fit the screen**: the window stops at the bottom of the screen and scrolls, and moves up when it grows (a random pick), with Save always in sight at the bottom. The Offers window does the same.

## 1.0.0
- **Shops players walk up to**: double-click a shopkeeper's token and the shop opens, with what it sells grouped by kind, prices in coins, a cart, and the character's purse. No permission on the shopkeeper is needed. The GM opens shops from the Token HUD, the Actors sidebar, or a double-click (Alt for the sheet).
- **Buying** pays in coins with change; **selling** pays half price (the world's rate, or the shop's own), sent to the GM to approve. The GM's **Offers** window lets them change any price (haggle), then approve or turn it down. Purchases can need approval too. Receipts in chat, for everyone, only the owners, or none.
- **Shop lists**, shared by any number of shops: fill them from the world's items or any compendium with filters, dnd5e's Compendium Browser, drops of items, folders and compendiums, pasted names (with prices, stock and levels), custom items, starter lists from the Player's Handbook and SRD, or JSON import. Each item can have its own price, stock (a number or a roll) and level, changed one at a time or ticked many at once.
- **Shop level** 0 to 6 leaves out items above a rarity; an item can have its own level. A shop can also have a highest price, a random pick of so many items per rarity, a markup, what it buys, a range, the shopkeeper's own items for sale, and its own coins.
- **The GM in the shop window**: restock, a new random pick, hide items from players, set how many are left, open or close the shop, and show what players don't see.
- A macro API: open, config, makeShop, restock, lists, importLists, openLists, openOffers.
