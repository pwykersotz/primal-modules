# Primal Drakkenheim Automation

Small rules module that goes with the automated Monsters of Drakkenheim compendium. Midi-QOL, DAE, Primal Status and
Primal Auras do most of the work from the item data; this module covers the Drakkenheim rules they don't know about.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

| Rule | What happens |
| --- | --- |
| Contamination | An effect that gives Contamination adds levels to the system's Contamination condition instead of stacking a separate effect. Creatures immune to Contamination are skipped. |
| Failure by 5 or more | After the save, targets that failed by the margin get the extra effects, extra damage or double damage. "Instead" riders remove the effect the plain failure gave. |
| Life drain | Abilities that regain hit points equal to the damage dealt heal the monster after the damage lands. |
| Regeneration | Damage of the listed types adds a "Regeneration Suppressed" marker until the end of the monster's next turn, which stops the regeneration roll. |
| Frozen | 20 or more bludgeoning or fire damage at once ends Frozen. |
| Thorns | Noxious Blood, Poison Skin and similar traits damage melee attackers that hit. |
| Displacement | Being damaged switches Displacement off until the end of the creature's next turn. |
| Ignacious | The first attack with Ignacious in a combat draws the blade. It casts zone of truth centred on itself (a Primal Auras aura on the sword: 15 ft, Charisma save DC 20 for creatures already inside when it is drawn and when a creature enters for the first time on a turn or starts its turn there; a failed save gives a "Zone of Truth" marker until the creature's next turn or until it leaves) and gives the wielder's token a mild flickering firelight out to 10 ft. Both end when that combat ends, and the token's old light comes back. Any item flagged `flags.primal-drakkenheim.burningTruth: true` works the same way. `PrimalDrakkenheim.ignacious.end(actor)` ends it early. |
| Epic Bosses | Placing a boss token sets its hit points to base plus per-character hit points for the party size, and its Epic Actions to one per player character. A linked boss that is already hurt keeps its hit points and Epic Actions when another of its tokens is placed (moving it to another scene, say). Bosses always have initiative 20; in Primal Combat's side initiative that 20 counts as the boss's initiative when the enemies' number is worked out, and the boss acts with its side. |

Settings: **Party size for Epic Bosses** (0 counts the characters in dnd5e's primary party, else the players' own characters, else every player-owned character in the world) and **Debug logging**.

Tests: `node --test test/logic.test.mjs test/ignacious.test.mjs`

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
