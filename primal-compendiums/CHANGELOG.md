# Changelog

## 1.2.1
- **Fast with big compendiums.** The Compendiums side used to draw every entry of every chosen compendium up front, and walked all of them again on each search, filter and sort, which froze the sidebar for a second or more once there were thousands of actors. It now works those out from Foundry's own list of each compendium's entries and draws only what is open and on screen: a closed compendium or folder draws nothing, and a long list draws a screenful and adds more as you scroll. In the test sidebar, with 30,000 actors in 30 compendiums, the longest freeze went from about 1.9 seconds to under 0.1.
- An Actor compendium's CR, type and source are now read when its entries are first drawn, one compendium at a time, instead of all of them when the Compendiums side opens. Filters, and sorts by anything but name, still read every chosen compendium, once; a line at the top of the list says so while it happens.
- Compendiums and folders that a search or filter leaves empty are left out of the list (they used to be drawn and hidden).
- The world side's filtering does less work on big directories.

## 1.2.0
- **CR and level badges**: every actor's row ends with its CR, or a player character's level, on both sides.
- **Ignore folders** checkbox under the sort row, on both sides of every directory: everything in one list (across every chosen compendium on the Compendiums side), by name or by the chosen sort, so Challenge rating gives every creature in CR order. Hover a compendium entry in the flat list to see its compendium.
- **Tags keep their size** when excluded: they turn red and are struck through, with nothing added to them. The Filters button keeps its width when its count appears.
- The Actors Compendiums side now reads its compendiums' CR, type and source when it is first drawn (GM only, once per session), so the badges are there without opening Filters.

## 1.1.0
- **Filters and sorting** on both sides of every directory, in a row under the search box.
  - **Actors**: filter by CR (from / to), creature type and source book; sort by name, challenge rating, creature type or source.
  - **Items**: filter by rarity, item type and source book; sort by name, rarity, item type or source.
  - **Everything else**: sort by name, either way (the search box filters by name).
- Tags are made from what is in the list, with counts. Click to show only those, again to hide them, again to clear; right-click to hide at once. The search box and the filters work together, folders holding matches open, and empty folders and compendiums hide.
- Each side keeps its own filters and sort, remembered on this computer.
- On the Compendiums side, CR, type, rarity and source are read from the server the first time the filters are used (GM only, once per session).

## 1.0.0
- **World / Compendiums switch** at the top of the Actors, Items, Scenes, Journal, Roll Tables, Cards, Macros and Playlists directories, for the GM only.
- **Compendiums side**: the compendiums chosen for that directory, each a group with its banner, entry count and an open-window button, with their own folders, pictures and scene banners. Click to open a sheet, drag to the map, a sheet or the world, right-click to import, open the compendium or delete (unlocked compendiums). Search across every chosen compendium, sort, and collapse all.
- **Hold a dragged entry over World or Compendiums** to switch sides mid-drag.
- **Choose Compendiums** window, from the Compendiums side, the module settings, or by right-clicking a compendium in the Compendium sidebar (Show in / Remove from ... Sidebar). Each GM chooses their own.
- Option to leave the Compendiums tab off directories with nothing chosen.
- Nothing changes for players, and nothing extra is loaded.
- Macro API: show, choose.
