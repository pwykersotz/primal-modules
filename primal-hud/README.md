# Primal HUD

Customizations for the Foundry VTT Token HUD. Built for Foundry V14 and dnd5e 6.x.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

## Choose which Token HUD buttons you see

**Configure Settings > Primal HUD > Token HUD buttons > Choose buttons** opens a list of every Token HUD button, grouped by where it comes from: Foundry's own, Primal HUD's HP buttons and favorites panel, and one group per module that adds buttons (Item Piles, Torch, Primal Auras, Primal Mounts and so on). Untick a button to hide it and press **Save Changes**. **Show all** ticks everything again.

- **Players can open it too.** Each user's choices only change their own HUD, and they're saved to the user rather than the browser, so they follow a player to any device.
- **Buttons from other modules** join the list the first time they appear on a Token HUD you open. Some modules only show a button on certain tokens, such as Primal Mounts' Mount button or Item Piles' pile buttons. If one is missing from the list, open the HUD on a token that has it.
- **Groups** are named after the module that adds the button. Primal HUD works that out from the button's class names, images and the module's stylesheet. Buttons it can't place are listed under **Other modules**, named after their tooltip.
- **The x next to a module's button** removes it from the list, for example after you uninstall that module. If the button appears again it comes back.
- Players don't see the GM-only Foundry buttons (lock, show/hide token, change level) in their list.

Hidden buttons are removed with a stylesheet rule, so this works however and whenever another module adds its buttons.

## Arrange the Token HUD buttons

**Configure Settings > Primal HUD > Token HUD button layout > Arrange buttons** (or **Arrange...** in the Token HUD buttons window) shows the HUD's left and right sides next to each other, with every button on each side in order. Drag a button to a new place on either side, or use its arrows: up, down, or across to the other side. **Save Changes** applies it to your Token HUD straight away. For example, move **Add to / remove from combat** and **Show / hide token** across to the left side.

- **Each user arranges their own HUD**, players included, and it's saved to the user so it follows them to any device.
- **Buttons from other modules** can be moved too, once they've appeared on a Token HUD you opened. A late button (one a module adds a moment after the HUD opens) is moved as soon as it appears, before the screen redraws, so nothing jumps around.
- **Palettes go with their buttons.** The status effects and movement action pop-outs open on whichever side their button is on. If a pop-out on the left side is open, the favorites panel steps aside.
- Buttons in a module's own extra column (Item Piles has one to the far right) stay in that column unless you move them to the other side.
- A button that's hidden in **Token HUD buttons** stays hidden wherever it's placed. The window marks it as hidden.
- **Reset** puts everything back where Foundry and the modules put it. Until you save a layout, Primal HUD doesn't move anything.

## HP buttons

Under the hit point box there are four buttons:

| Button | Does |
| --- | --- |
| −10 | 10 damage |
| −1 | 1 damage |
| +1 | 1 healing |
| +10 | 10 healing |

- They make the same change as typing `-10` or `+1` into the HP box. Damage uses up temporary HP first, healing stops at max HP, and HP never drops below 0. dnd5e's floating numbers, concentration checks and damage hooks (Midi-QOL and so on) all still happen. Resistances and immunities are not applied, the same as typing into the box.
- Quick clicks are combined. Clicking −10 and then −1 deals 11 damage as one hit. While a change is waiting, the HP box shows where HP will end up and a small badge above it shows the change (for example "−11").
- The buttons go next to whichever token bar shows `attributes.hp`. If HP is the top bar they appear above it. If neither bar shows HP, a small HP readout appears with the buttons under the token.
- Only users who own the token's actor see them, and they can be hidden like any other button.

**Combine quick HP clicks (milliseconds)** (per browser) sets how long to wait for more clicks before saving, 400 by default. 0 saves every click on its own.

## Favorites, spells, saves and skills panel

When you open the Token HUD on a token whose actor you own, a panel appears to the left of the HUD with three tabs. The open tab shows its name and the others show just their icon (hover for the name).

**Favorites** lists the same favorites as the dnd5e character sheet, in the same order: items, activities, effects, skills, tools, spell slots, and any old-style resources (such as "Sorcery points") that have a name and a maximum. Each row shows what the sheet shows on the right: uses left, attack or skill bonus, save DC, quantity, or an on/off toggle for effects.

**Spells** lists the spells ready to cast, grouped like the sheet's spellbook (Cantrips, 1st Level, Pact Magic and so on, plus at-will, innate and ritual spells and spells cast from items). Spells that need preparing but aren't prepared are left out. A row of chips at the top shows your spell slots at a glance: one chip per slot level with a dot per slot, filled while unspent. "P3" is pact magic at 3rd level. Hover a chip for the exact count. For a caster that uses **Primal Spell Points**, the leveled slots are replaced by an "SP" chip with the points left, then one chip for each level from 6th up that it can cast once per long rest (filled while still unused). Pact slots still show. "C" and "R" mark concentration and ritual spells.

**Saves & Skills** has the six saving throws as a grid of buttons, then every skill and any tools the actor has, alphabetically as on the sheet. Each row shows the ability, the bonus and the passive score, with a dot for proficiency: empty, half filled for half proficiency, filled for proficient, and ringed for expertise. Click a save, skill or tool to roll it with dnd5e's usual roll dialog.

- **Click a row to use it**, the same as clicking it on the character sheet: items and spells go through dnd5e's normal use (so the cast dialog, slot spending and Midi-QOL all work as usual), skills and tools roll, and effects switch on or off. Containers open their sheet.
- **Right-click a row** to open the item's sheet. Hover a row for dnd5e's item tooltip.
- **The arrow** at the top right folds the panel down to just its tabs. Clicking a tab opens it again. Your browser remembers the tab and whether it's folded.
- The panel keeps the same size on screen whatever the canvas zoom (also with HUD scaler modules such as Illandril's Token HUD scaler), scrolls when the list is long, and steps aside while a palette on the HUD's left column is open. **Favorites and spells panel size (%)** in the module settings (per browser, 100 by default) makes it bigger or smaller.
- It updates by itself when uses, slots or preparation change.
- It's listed in **Token HUD buttons** as **Favorites, spells, saves and skills panel**, so anyone who doesn't want it can untick it. GMs see it on NPCs too, since they own every actor.
- NPCs have no favorites list in dnd5e, so for them the panel shows only the Spells and Saves & Skills tabs.

## Double right-click doesn't open Token Config

**Configure Settings > Primal HUD > Double right-click doesn't open Token Config** is ticked by default. While it's ticked, double right-clicking a token you can configure does nothing beyond the first right-click, which opens the Token HUD, so a quick second right-click no longer pops up Token Config.

- The gear button on the Token HUD still opens Token Config (unless you've hidden that button).
- Double right-click still targets tokens you can't configure, as in plain Foundry.
- It's saved per user, so each player chooses for themselves, and it takes effect straight away without a reload.

## For macros

```js
const api = game.modules.get("primal-hud").api;
api.adjustHp(token, -7);       // Same as clicking the HP buttons. Takes a Token, TokenDocument or Actor.
api.openButtonSettings();      // Opens the Token HUD buttons window.
api.openLayoutSettings();      // Opens the Arrange Token HUD Buttons window.
```

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
