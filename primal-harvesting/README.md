# Primal Harvesting

Harvest beaten monsters with the harvesting rules of *Heliana's Guide to Monster Hunting*. Built for Foundry V14 and dnd5e 6.x, with or without Midi-QOL, and made to work with Dice So Nice.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

The module carries the rules, not the book: the harvest tables (which components each creature gives, and their DCs) are filled in by the GM from their own copy, by typing them, pasting rows copied from the book, or importing a JSON file.

**The window is shared.** When anyone opens a harvest window, it opens for every player who can harvest and for the GM, and every change anyone makes shows on every screen, so the table can plan the harvest together.

## Harvesting

1. **Open the harvest window** for a beaten monster:
   - the **Harvest** button (a bone) on its Token HUD (the GM's way, since players can't open a monster's HUD),
   - the **Harvest** buttons on the **Ready to harvest** chat card posted when a combat ends,
   - the **Harvest** tool in the Token controls, or the *Harvest the targeted creature* keybinding (unbound to start with), for the creature you target,
   - a macro: `game.modules.get("primal-harvesting").api.open(token)`.
2. **Click components into the harvest list**, in the order they'll be carved. Each component's DC is added to the ones before it, so the list shows a running **harvest DC**: put what you want most first. A component can go in more than once (two eyes), unless its table says how many there are. **Add all** adds every component once, lowest DC first. Drag rows, or use the arrows, to reorder.
3. **Check who does it.** Who can take part is the characters of the players logged in (each player's own character and the characters they own); with only the GM logged in, every player character. The GM can add anyone else (an NPC, a retainer, a character whose player isn't there) with **Add a creature**, or by dropping an actor from the sidebar on the team; they're marked "(GM)". The best assessor (Intelligence with the creature type's skill) and the best carver (Dexterity with that skill) are picked to start with, by two different characters if there are two. Helpers are ticked up to the number the creature's size allows. For a type that can be ritual carved (aberrations, celestials, elementals, fey and fiends), a spellcaster carves with their spellcasting ability when it's better. Change any of these.
4. **The GM approves the harvest** with **Approve**, and a player can then roll it. A player changing the list, or who assesses, carves or helps, withdraws the approval until the GM approves again (who gets the components doesn't). The GM can always roll. A setting turns this off.
5. **Press Harvest.** Both checks are rolled with dnd5e (so every bonus the characters have counts), without windows unless you ask for them in the settings, and posted on one card, so Dice So Nice throws both dice together. Helpers add their proficiency bonus if they're proficient in the skill, half of it if not.

Once the dice land, a **splash** comes up for everyone who can see the roll: each check's d20 and what was added to it, the helpers, the total, and every component harvested. Click it or press Escape to close it. Each player can turn it off in the settings.

The card lists every component of the list: harvested (with its harvest DC) or lost (with the total it needed), and what the harvest is worth. A lost **volatile** component is marked. The components harvested go into the inventory of the character picked under **Components go to** as loot items (Material) with their sell price, stacking with the same components harvested before. The corpse is marked harvested, so it can't be harvested twice (the GM can, after a warning).

**Notes.** A creature type (or creature table) can carry the book's notes on harvesting it, such as Extraplanar Recall for celestials and fiends, or what a failed volatile component does for elementals. They show at the top of the harvest window.

**Random components.** A creature type can have a table rolled once per corpse, such as the ooze's d100 table of what it has inside it (the book's optional Hard Bits rule). The harvest window then has a **Roll** button; the rolls are posted on a card (with Dice So Nice), "roll twice more" rolls again, and what it gives (a beast's bone, say, with the DC from the beast table) can go in the harvest list like any other component. A component found this way is named for where it came from: *Bone (Beast)*.

### The shared window

- Opening a harvest window (from the Token HUD, a Ready to harvest card, the Harvest tool or a macro) opens it for everyone who could open it themselves, and brings it to the front for anyone who already has it open.
- The harvest list, its order, who assesses, carves and helps, ritual carving and who gets the components are the same on every screen. A player's change is made by the GM's client, so a GM must be logged in, and the GM's client sends each change straight to every screen.
- While someone's harvest is being rolled, everyone else's Harvest button waits. Once the corpse is harvested, its window closes everywhere.
- The list is kept on the corpse's token until it's harvested, so closing the window and opening it again (or reloading) keeps it.
- **Share the harvest window** in the settings turns this off: each user's window is then their own.

The **Average total** under the list is what an average roll gets, and the list is coloured by it: green for likely, amber for close, red for needing a good roll.

### The rules it uses

| Creature type | Skill | Ritual carving |
| --- | --- | --- |
| Aberration | Arcana | Yes |
| Beast | Survival | |
| Celestial | Religion | Yes |
| Construct | Artifice | |
| Dragon | Arcana | |
| Elemental | Artifice | Yes |
| Fey | Deception | Yes |
| Fiend | Religion | Yes |
| Giant | Medicine | |
| Humanoid | Medicine | |
| Monstrosity | Survival | |
| Ooze | Nature | |
| Plant | Nature | |
| Undead | Religion | |

dnd5e has no Artifice skill: the module uses the world's skill named Artifice (a module such as Custom D&D 5e can add one, or rename one), else Investigation. The skill lists in **Harvest rules** show the world's own skills, including renamed and added ones.

| Size | Time | Most helpers |
| --- | --- | --- |
| Tiny | 5 minutes | 0 |
| Small | 10 minutes | 1 |
| Medium | 15 minutes | 2 |
| Large | 30 minutes | 4 |
| Huge | 2 hours | 6 |
| Gargantuan | 12 hours | 10 |

| Essence | Challenge rating | DC | Rarity | Sells for |
| --- | --- | --- | --- | --- |
| Frail | 3–6 | 25 | Uncommon | 100 gp |
| Robust | 7–11 | 30 | Rare | 400 gp |
| Potent | 12–17 | 35 | Very rare | 2,000 gp |
| Mythic | 18–24 | 40 | Legendary | 10,000 gp |
| Deific | 25+ | 50 | Artifact | 80,000 gp |

Every other component sells for 3 gp per point of its DC: the DC on its table, not its running harvest DC, so the order it's carved in doesn't change its price. One creature making both checks rolls both with disadvantage. All of this can be changed in **Harvest rules** (Configure Settings → Primal Harvesting).

## Harvest tables (GM)

**Configure Settings → Primal Harvesting → Edit the harvest tables.**

- **Creature types**: one table per type. Every creature of that type gives these components, unless it has a creature table of its own.
- **Creatures**: tables for particular creatures (an Owlbear, a Polyhedrooze). A creature table is used for creatures whose name, or one of its **Also for** names, matches (a trailing number such as "Ghoul 3" is ignored). Tick **Also offer its type's components** to offer the type's table as well. In the harvest window the GM can also pick a creature table, or a different type, for a creature; the choice is kept on its actor.

Each table has **Notes** (shown in the harvest window). A type table can also have **Random components**: one row per line, its numbers, then the component and, in brackets, the creature type it came from (whose table gives its DC), as the book writes them:

```
1-20 Nothing
21 Pouch of claws (aberration)
36 Horn (celestial/fey/fiend) *
50-56 Pouch of teeth (humanoid) DC 10
97-99 Roll twice more
```

A DC written in the line is used when the type's table has no component of that name; the window says which rows have none. The die is the highest number (a d100 for this one).

Each component has a **name**, a **DC**, its **marks** as the book writes them (`E` edible, `E+` edible and used in crafting, `V` volatile, `*` see the note, `**` monster-forged items only), how many there are at **most** (blank for no limit), a **note**, and optionally an **item**: drop any item on the row and harvesting the component gives a copy of that item instead of a plain component item.

**Paste rows** takes rows copied from the book, one per line, with the DC, the name and the marks in any order (`Eye 5 E`, `10 Heart E+`, `Breath sac<tab>15<tab>V`). Lines with no DC, such as headings, are left out.

**Import** and **Export** use JSON. Import takes a file from Foundry's own files (its Data folder, through Foundry's file picker), a file from your computer, or pasted JSON:

```json
{
  "types": {
    "beast": [
      { "name": "Bone", "dc": 10 }
    ],
    "ooze": {
      "note": "Optional Rule: Hard Bits. ...",
      "components": [
        { "name": "Membrane", "dc": 10 },
        { "name": "Nucleus", "dc": 15, "tags": ["V"], "max": 1, "note": "Pulses when touched" }
      ],
      "random": { "name": "Ooze's Random Components", "rows": ["1-20 Nothing", "21-100 Bone (beast)"] }
    }
  },
  "creatures": [
    { "name": "Polyhedrooze", "aliases": ["Tetrahedrooze", "Hexahedrooze"], "useTypeTable": true,
      "components": [{ "name": "Die face", "dc": 10, "tags": ["E+"] }] }
  ]
}
```

A type is a list of components, or `{ note, components, random }`. Merging replaces the tables in the file (and their notes and random tables, when the file has them) and keeps the rest; **Replace all** empties every table first. Components can also be written as rows (`"Eye 5 E"`). Nothing is kept until **Save**.

In the harvest window, the GM can also add a component by hand (name, DC, marks): for that harvest only, or saved into the creature's table.

## Settings

| Setting | Who | What it does |
| --- | --- | --- |
| Edit the harvest tables | GM | The window above. |
| Edit the harvest rules | GM | Skills, ritual carving, times, helpers, essences and prices. |
| Players can harvest | World | Players can open the harvest window and harvest. Their changes are made by the GM's client, so a GM must be logged in. On by default. |
| Only beaten creatures can be harvested | World | At 0 hit points, Dead, or defeated in the combat tracker. The GM can always harvest. On by default. |
| Share the harvest window | World | Opening a harvest window opens it for everyone, and changes show on every screen. On by default. |
| The GM approves each harvest | World | Players can roll a harvest only once the GM has approved it in the shared window. On by default. |
| Offer harvesting in chat | World | A Ready to harvest card when a combat ends (default), when each monster dies, or never. |
| Put harvested components in an inventory | World | On by default. |
| Pass the harvest time on the game clock | World | Off by default. |
| Show dnd5e's roll windows | Each player | For the assessment and carving checks. Off by default. |
| Show the harvest splash | Each player | The splash with the rolls, the total and what was harvested. On by default. |

## For macros

```js
const api = game.modules.get("primal-harvesting").api;
api.open(token);              // the harvest window (no token: your target)
api.harvested(token);         // what was harvested from it, or null
api.reset(token);             // let it be harvested again, random components and all (GM)
api.offer([token1, token2]);  // post a Ready to harvest card (GM)
api.importTables(json);       // merge harvest tables from JSON (GM); { replace: true } to replace them
api.tables(); api.rules();    // the tables and rules as they are now
```

## Checks

- `node tests/rules.test.mjs`: the rules and tables on their own (the book's skills, Artifice and the world's own skills, running harvest DCs, helpers, essences and prices, pasted rows, notes, random tables, import, export, which components a creature gives).
- `node tests/harvest.test.mjs`: a harvest from start to end against small stand-ins for Foundry and dnd5e (the starting picks, ritual carving, disadvantage for one creature, the list, the rolls and card, items, prices and stacking, a player's harvest finished by the GM over the socket, the shared window and its live changes, the GM's approval, who takes part and the GM's added creatures, the splash, random components, the ready cards, the GM windows, and every text in the language file).
- `node tests/preview/render.mjs` writes `tests/preview/out.html`, the windows and cards with a rough stand-in for Foundry's theme, to look at in a browser.

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
