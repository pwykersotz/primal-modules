# Tests

## Logic

```
node tests/logic.test.mjs
```

```
node tests/filter.test.mjs
```

```
node tests/model.test.mjs
```

Plain Node, no Foundry needed: the ordering, choosing and open-state logic in `scripts/logic.mjs`, the filter
records, matching and sorting in `scripts/filter-logic.mjs` (with actors and items shaped like dnd5e's), and what the
Compendiums side shows for a search, filters and a sort in `scripts/pack-model.mjs` (including 30,000 entries
against the clock).

## In Foundry's sidebar code

```
FOUNDRY_APP=/path/to/foundry/resources/app node tests/browser/sidebar.test.mjs
```

Runs the module in headless Chromium inside Foundry V14's own client code: its `foundry.mjs`, CSS, templates, Sidebar,
ActorDirectory, ItemDirectory, SceneDirectory, ContextMenu, DragDrop and SearchFilter. Only what needs a server is
faked, in `tests/browser/harness.mjs`: settings, translations, the user, the world collections and the compendiums
(built on Foundry's DirectoryCollectionMixin, so their folder trees are Foundry's own). It clicks through the switch,
the compendium groups and folders, search, drag data, both right-click menus, import, sorting, the chooser, the macro
API, the filters and sorting on both sides (with dnd5e-shaped actors and items, and compendium details that only
arrive when asked for) and a player's view, and saves screenshots to `tests/browser/shots`.

It also opens the sidebar with twelve Actor compendiums of 500 monsters each and checks that only what is open and
on screen is drawn, that scrolling draws more, that search and filters still cover everything, and that nothing
holds the page up. Add `?stress=30x1000` (compendiums x entries each) to the harness page's address for other sizes.

Needs Node 18+ and Playwright with Chromium (`require("playwright")`). `FOUNDRY_APP` is Foundry's `resources/app`
folder, or a copy of these parts of it:

- `public/scripts/foundry.mjs`, `public/css`, `public/fonts`, `public/lang/en.json`, `public/ui`, `public/icons/svg`
- `templates`
- `node_modules`: `jquery`, `handlebars`, `handlebars-intl`, `pixi.js`, `@pixi/particle-emitter`,
  `@pixi/graphics-smooth`, `showdown`, `spark-md5`

`tests/browser/server.mjs` serves the page at `/game`, as Foundry does, so the same relative image paths work.
