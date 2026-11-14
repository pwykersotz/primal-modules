# Tests

Run these from a copy of the module **outside** Foundry's `Data/modules` folder.

## Engine checks (Node 20 or later, nothing to install)

    node --test tests/unit/*.test.mjs

They cover the dice, the sheet reader, the simulation, the verdict, and that the manifest and language
file agree with the scripts. `tests/fixtures/actors.json` holds a few SRD characters and monsters in the
dnd5e system's own data format (System Reference Document 5.2, CC-BY-4.0).

## Window checks (Playwright, plus your own Foundry and dnd5e)

    FOUNDRY_APP=/path/to/foundry/resources/app DND5E=/path/to/Data/systems/dnd5e \
      node --test tests/browser/window.test.mjs

These load Foundry's real client code and the real dnd5e system into a headless browser, with a small
stand-in for the server (`tests/browser/harness.mjs`), build real dnd5e actors from the fixtures, and
drive the window. They are skipped when Foundry, dnd5e or Playwright isn't found. Set `PLAYWRIGHT_FROM`
to a folder to load Playwright from somewhere else.

The map buttons, the Combat Tracker button and the sidebar's own menus need a running world, so those
are checked by hand.
