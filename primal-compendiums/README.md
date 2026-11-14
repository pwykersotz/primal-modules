# Primal Compendiums

A Compendiums tab for the GM in Foundry VTT (V14)'s sidebar directories: Actors, Items, Scenes, Journal, Roll Tables,
Cards, Macros and Playlists. A **World / Compendiums** switch at the top of each directory flips between the world's
own documents and the compendiums you choose for it, drawn the same way as the directory itself: folders, pictures,
scene banners, search and sorting. Monster Manual goblins are one click away from the actors already in the world,
without opening a compendium window. Both sides can be **filtered and sorted**: actors by CR, creature type and source
book, items by rarity, item type and source book, and everything by name. Every actor shows its **CR** (or a player
character's **level**) at the end of its row, and **Ignore folders** turns either side into one list.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

Players see no change. The module does nothing on their side.

## Setting it up

1. **Choose compendiums.** Any of these opens the same chooser:
   - the **Choose Compendiums** button on a directory's Compendiums side;
   - Game Settings → Configure Settings → Primal Compendiums → **Choose Compendiums**;
   - right-click a compendium in the **Compendium** sidebar → **Show in Actors Sidebar** (or Items, Scenes...).
     The same menu has **Remove from Actors Sidebar**.

   The chooser lists every compendium by directory, with where it comes from (the system, a module or the world) and
   how many entries it has. Ticks save at once. **All** and **None** tick a whole directory, and the filter box finds
   a compendium by name or source.
2. **Switch** with **World** and **Compendiums** at the top of the directory. Each directory remembers its side.

Only compendiums of the directory's own kind can be chosen for it: Actor compendiums on the Actors tab, Scene
compendiums on the Scenes tab, and so on. Adventure compendiums have no directory, so they are not offered.

## On the Compendiums side

- Each chosen compendium is a group with its banner, its number of entries and a button that opens its own window.
  Groups are in the same order as the Compendium sidebar. A lone compendium starts open; with several, they start
  closed. Whether each is open is remembered.
- A compendium's own folders show as folders, with their colours, and open and close as in its window.
- **Click** an entry to open its sheet.
- **Drag** an entry onto the map, a sheet or a journal page, as from a compendium window. To import into a
  world folder, hold the dragged entry over **World** for a moment: the directory switches and you can drop it where
  you want. Folders can be dragged too.
- **Right-click** an entry for **Import Entry**, **Open Compendium** and, in an unlocked compendium, **Delete Entry**.
- **Right-click** a compendium's group for **Open Compendium**, **Import All Content**, **Remove from This Tab** and
  **Choose Compendiums**.
- **Search** looks through every chosen compendium at once, folder names included, and opens the folders that hold
  what it finds. Clearing it puts everything back as it was.
- The **sort** button switches the compendiums between alphabetical and their own order (shared with the compendium
  windows), and **collapse** closes every group and folder.

### Big compendiums

The Compendiums side is built for a lot of entries: tens of thousands of actors across dozens of compendiums stay
quick. It only draws what is open and on screen. A closed compendium or folder draws nothing, and a long list draws
a screenful and adds more as you scroll. Searching, filtering and sorting are worked out from Foundry's own list of
each compendium's entries, not from what is drawn, so they always cover everything, and the counts on the filter
tags and **N of M shown** do too.

## Filters and sorting

Under the search box of every directory, on both sides, is a row with **Filters**, a **sort** list and a button that
turns the sort the other way round, and under that an **Ignore folders** checkbox.

| Directory | Filter by | Sort by |
| --- | --- | --- |
| Actors | CR (from / to), creature type, source book | name, challenge rating, creature type, source |
| Items | rarity, item type, source book | name, rarity, item type, source |
| Everything else | name (the search box) | name |

- **Filters** opens a panel of tags made from what is actually in the list, each with how many entries have it.
  Click a tag to show only those; click it again to hide those instead (it turns red and is struck through); click a
  third time to clear it. Tags keep their size whatever their state.
  Right-click a tag to hide those straight away. Tags in one group are alternatives (Beast or Undead); different groups
  must all be met (Undead *and* SRD 5.2 *and* CR 1 to 5).
- The **CR** range keeps actors from one CR to another, ends included. Actors with no CR (player characters) are left
  out while a range is set.
- The **creature type** of an NPC is its dnd5e type (a custom type uses its own words). Player characters, vehicles and
  groups are tagged as such, so the world's PCs are one click to hide.
- **Rarity** runs Mundane, Common, Uncommon, Rare, Very Rare, Legendary, Artifact. Spells, features and other items
  that can't have a rarity have no rarity tag.
- **Source** is the book an entry names (SRD 5.2, XMM...). A compendium entry that names none takes its compendium's
  book or module, as dnd5e does.
- The search box and the filters work together, and folders and compendiums holding matches open while filtering.
  Folders and compendiums with nothing left to show are hidden. Clearing the filters puts the folders back as they were.
- Sorting orders the entries inside each folder; the folders stay where they are. Entries without the sorted value
  (no CR, no rarity) go last either way round, and ties go by name. **Default order** goes back to the directory's own
  order (alphabetical or manual, from its own sort button).
- **N of M shown** at the bottom of the panel counts what the filters and search leave.
- **Ignore folders** shows everything in one list, with the folders out of sight: on the Compendiums side that is one
  list across every chosen compendium (hover an entry to see which compendium it is from). The list goes by name, or
  by whatever the sort list says, so Challenge rating with Ignore folders gives every creature in CR order. Filters
  and search work on it as usual. Untick it to get the folders back. While it is ticked, dragging one of the world's
  own entries around inside the list does nothing, because it would move it between folders that can't be seen;
  dragging to the map, and importing from a compendium, work as always.

### CR and level badges

Every actor's row ends with a badge: **CR** for anything with a challenge rating (CR 1/4, CR 10), or **Lvl** for a
player character with class levels. Vehicles, groups and actors with neither have none. Badges show on both sides, with
or without filters.

Each side of each directory keeps its own filters and sort, remembered on this computer: filtering the world's actors
doesn't filter the Compendiums side, and the other way round.

## Settings

- **Choose Compendiums** (above). Each GM has their own choices, which follow them to any computer.
- **Leave the Compendiums tab off directories with nothing chosen**, at the bottom of the chooser. Off by default, so
  every directory with compendiums of its kind has the switch.
- Which side each directory shows, which groups are open, and each side's filters and sort are remembered on each
  computer.

## Load times

Nothing extra is loaded, for players or the GM. Foundry already keeps a list of every compendium's entries in memory
(that list is what the Compendiums side draws), and a full document is only read when you open its sheet, drag it
or import it, exactly as from a compendium window. The Compendiums side of a directory is only drawn the first time
you open it. For players the module stops before doing anything, and it never changes who can see a compendium.

The one extra read is for the badges and filters on the Compendiums side. Foundry's list of a compendium's entries has
names and pictures but not CR, creature type, rarity or source, so the GM's Foundry asks the server for those fields,
once per compendium per session:

- for an Actor compendium, when its entries are first drawn (the CR badges need them), so a compendium you never
  open is never read;
- for every chosen compendium of the tab, the first time you open Filters, set a filter, or sort by anything but
  name there. A line at the top of the list says so while it happens.

It is the same kind of request dnd5e's Compendium Browser makes, and it happens only on the GM's computer. The world
side uses what is already loaded.

## Macros

```js
const api = game.modules.get("primal-compendiums").api;
api.show("actors");            // open the Actors tab on its Compendiums side
api.show("scenes", "world");   // open the Scenes tab on the world side
api.choose("Actor");           // the chooser, for Actor compendiums only
api.choose();                  // the chooser, for every directory
```

The tabs are `actors`, `items`, `scenes`, `journal`, `tables`, `cards`, `macros` and `playlists`.

## Notes

- A directory popped out into its own window shows the world side only.
- Creating entries and folders happens in the compendium's own window (the button on its group opens it).
- Clicking a Playlist or Macro entry opens its sheet, as in a compendium window; it doesn't play or run it.
- Filters and sorting are for the GM, like the rest of the module. The CR, creature type, rarity and source filters
  read dnd5e's data.
- So that the filters keep up with Foundry's own directory search, the module wraps that search (for the GM only):
  after Foundry has shown and hidden entries for a search, the filters run again.

## Tests

`node tests/logic.test.mjs` checks the ordering and choosing logic, `node tests/filter.test.mjs` the filters and
sorting, and `node tests/model.test.mjs` what the Compendiums side shows for a search, filters and a sort.
`tests/browser` runs the module inside Foundry's own sidebar code in a headless browser, with a few thousand
compendium actors for the speed checks; see [tests/README.md](tests/README.md).

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
