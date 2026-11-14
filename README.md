# Primal modules

Pwykersotz's modules for Foundry VTT V14 and the D&D 5e system (6.x). Each folder is a complete module
that installs and works on its own; where two modules know about each other, the link is optional.

> **Made with AI.** These modules were written with Claude, an AI model made by Anthropic. See
> [Made with AI](#made-with-ai) for who does what.

| Module | What it does |
| --- | --- |
| [Primal Attacks](primal-attacks) | Roll several attacks at once, and an NPC's whole Multiattack in one click. |
| [Primal Auras](primal-auras) | Token auras you switch from the Token HUD, with automated saves, damage and conditions. |
| [Primal Combat](primal-combat) | A combat carousel across the top of the screen, with side initiative. |
| [Primal Compendiums](primal-compendiums) | A Compendiums tab in every sidebar directory, with filters. |
| [Primal CR](primal-cr) | How dangerous a fight is for this party, simulated from the sheets. |
| [Primal Drakkenheim Automation](primal-drakkenheim) | Rules glue for the automated Monsters of Drakkenheim pack. |
| [Primal Harvesting](primal-harvesting) | Harvest beaten monsters with the rules of *Heliana's Guide to Monster Hunting*. |
| [Primal HUD](primal-hud) | Token HUD additions: HP buttons and a favorites, spells, saves and skills panel. |
| [Primal Monster Blocks](primal-monster-blocks) | A stat block NPC sheet: a port of zeel's Monster Blocks. |
| [Primal Mounts](primal-mounts) | Mounted combat: mount, ride and fall, with the pair moving as one. |
| [Primal Shops](primal-shops) | Shops players walk up to and buy from, with GM approval for selling. |
| [Primal Spell Points](primal-spell-points) | The *Dungeon Master's Guide* spell points variant, per character. |
| [Primal Status](primal-status) | Status effects with animated token visuals and rules automation. |
| [Primal Weather](primal-weather) | Daily weather under dnd5e's calendar, with its rules. |

Each module's README explains its settings, its macro API and its limits.

## Made with AI

Pwykersotz decides what each module should do, tests it at the table and approves each release.
Claude (Anthropic's AI model) wrote the code, the tests and the documentation from those requests.
Commits Claude made carry a `Co-Authored-By: Claude` line, so the history shows which changes came
from it. Primal Monster Blocks started from zeel's MIT-licensed Monster Blocks; its README says what
came from where.

The modules have had real use at one table, but no line-by-line review by a second person. Back up your
world before you update.

## Book content

These modules carry rules, not book text: Primal Harvesting's tables, for example, are filled in by the GM
from their own copy. Pwykersotz's modules that do carry text from published books (the Binder class from
*Tome of Magic*, and the Beastheart options from MCDM's *Beastheart and Monstrous Companions*) are kept in
a private repository. None of these modules is made, endorsed or checked by any book's publisher.

## Installing

In Foundry, open **Add-on Modules → Install Module** and paste a module's manifest link into
*Manifest URL*:

    https://raw.githubusercontent.com/pwykersotz/primal-modules/main/<module>/module.json

for example `.../main/primal-weather/module.json`. Foundry then offers updates when a new version is
released. Each release on the [Releases](https://github.com/pwykersotz/primal-modules/releases) page also
has the module's zip, to unzip into `Data/modules/<module>/` by hand.

## Working on the modules

Needs Node 20 or later. Keep your clone outside Foundry's `Data/modules` folder, and copy a packaged
module in to try it.

    npm install                                   # once: Foundry's tools for compendium packs
    npm test                                      # every module's automated checks
    node tools/test-all.mjs primal-auras          # one module's checks
    node tools/package.mjs primal-auras           # dist/primal-auras/: module.json and the zip

A module with compendium packs keeps them in `<module>/src/packs/` as one JSON file per entry, so changes
show up as readable diffs. After editing a compendium in Foundry, bring the changes back with
`node tools/packs.mjs unpack <module> --from <path to Data/modules/<module>>`.

Primal Status is built from `primal-status/src/`: run `node primal-status/tools/build.mjs` after
changing anything there.

Releasing a new version is described in [RELEASING.md](RELEASING.md).
