# Primal Spell Points

Chosen spellcasters spend spell points instead of spell slots, using the *Dungeon Master's Guide* spell points variant. The GM picks which characters and NPCs use spell points, one at a time; everyone else keeps spell slots. Built for Foundry V14 and dnd5e 6.x, and works with dnd5e's own sheets, Tidy 5e sheets and Midi-QOL.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

## Choosing who uses spell points

Nobody uses spell points until the GM turns them on for that actor. On any spellcaster with spell slots, the GM sees a dashed **Spell points: off** strip at the top of the spells tab with a **Use spell points** button. Players don't see the strip. Turning spell points on starts the caster with a full pool.

To turn them off again, or to set things up before opening the spells tab, use **Spell Points** in the actor sheet's title-bar menu (or the cog in the Spell Points box) and untick **Uses spell points**. Each character and NPC is separate, including unlinked tokens of the same NPC.

## How it plays

- **Casting a spell** takes its cost out of the caster's pool. Pick the level in dnd5e's casting window as usual: each level shows its cost, for example "3rd Level (5 SP)", and levels the caster can't afford are greyed out. The "Consume Spell Slot" box becomes "Spend 5 Spell Points"; untick it to cast for free.
- **Spells of 6th level and higher** can each be cast once per long rest with spell points, as in the DMG. A used level shows as used until the next long rest.
- **A long rest** restores all spell points and the 6th+ levels. A short rest doesn't.
- **The chat card** lists "Spell Points −5" with the other things the cast used, and the GM can refund it from there like any other cost. Refunding a 6th+ level spell gives the points back but leaves the level marked used; click it in the Spell Points box to make it ready again.
- **Pact Magic is unchanged.** Warlocks keep their pact slots, and a warlock/wizard multiclass uses pact slots for warlock spells and spell points for the rest. Cantrips, at-will, innate and ritual casting, and spells cast from items (wands, scrolls, magic items) work as before.

### The pool

| Spellcaster level | Spell points | Highest level |   | Spell level | Cost |
| --- | --- | --- | --- | --- | --- |
| 1 | 4 | 1st | | 1st | 2 |
| 2 | 6 | 1st | | 2nd | 3 |
| 3 | 14 | 2nd | | 3rd | 5 |
| 4 | 17 | 2nd | | 4th | 6 |
| 5 | 27 | 3rd | | 5th | 7 |
| 6 | 32 | 3rd | | 6th | 9 |
| 7 | 38 | 4th | | 7th | 10 |
| 8 | 44 | 4th | | 8th | 11 |
| 9 | 57 | 5th | | 9th | 13 |
| 10 | 64 | 5th | | | |
| 11–12 | 73 | 6th | | | |
| 13–14 | 83 | 7th | | | |
| 15–16 | 94 | 8th | | | |
| 17 | 107 | 9th | | | |
| 18 | 114 | 9th | | | |
| 19 | 123 | 9th | | | |
| 20 | 133 | 9th | | | |

Spellcaster level is the one dnd5e already uses for spell slots: full casters use their class level, paladins, rangers and artificers half of it, Eldritch Knights and Arcane Tricksters a third, and multiclass levels are added together. NPCs use their spellcaster level. The highest level a caster can cast is the highest level they have slots for, so the GM's spell slot overrides still apply.

### On the sheet

The spells tab has a **Spell Points** box with the pool and a bar. Hover the title for the cost table. If the caster has 6th-level spells or higher, the box shows which of 6th to 9th are still available this long rest. Each spell level heading shows its cost instead of slot pips.

Token bars can show spell points too: pick **Spell Points** (`attributes.spellPoints`) as a bar in the token's settings. Formulas and macros can use `@attributes.spellPoints.value` and `@attributes.spellPoints.max`.

## Only the GM changes it

Players spend points by casting and get them back with a long rest. Everything else is the GM's:

- **Who uses spell points** is chosen per actor by the GM.
- **Module settings** are world settings, so only a GM can change them.
- **The tables** (Configure Settings > Primal Spell Points > Spell point tables) are GM only.
- **Each actor's pool** can only be changed by a GM. In the Spell Points box a GM can type a new number (or `+5` / `-5`), click a 6th–9th level to mark it used or ready, and press the cog for that actor's settings. Players see the box without those controls.
- If a player's client tries to change spell points any other way (editing flags, a macro, refunding a chat card), the change is dropped and they're told only the GM can do that. Casting and resting still work.

### An actor's spell point settings (GM)

Open them from the cog in the Spell Points box, or from **Spell Points** in the actor sheet's title-bar menu, which is there for any spellcaster, even one that doesn't use spell points yet.

- **Uses spell points:** on or off for this actor. Off means it casts with spell slots as usual.
- **Current** spell points.
- **Bonus to maximum:** added to the table's number, can be negative.
- **Fixed maximum:** replaces the table and bonus.
- **Used since the last long rest:** the 6th–9th levels already cast.
- **Restore all:** the same as a long rest for spell points.

## Settings (GM)

| Setting | Default | Does |
| --- | --- | --- |
| Spell point tables | DMG | What each spell level costs and how many points casters have at each spellcaster level. **Reset to DMG** puts the book's numbers back. |
| 6th level and higher once per long rest | On | The DMG's limit on high-level spells. |

## Not covered

- **Turning spell points into slots or back** (Font of Magic and the like) isn't automated. The GM can adjust a pool by hand.
- **Arcane Recovery, Natural Recovery** and other features that give back slots don't give back spell points. The GM can add points by hand.
- **Advanced Magic - Spell Points System 5e** (`dnd5e-spellpoints`) does the same job. Foundry warns if both are turned on; use one or the other.

## For macros

```js
const api = game.modules.get("primal-spell-points").api;
api.isEnabled(actor);               // true if the GM chose spell points for this actor
api.setEnabled(actor, true);        // GM: turn spell points on (full pool) or off for one actor
api.getSpellPoints(actor);          // { value, max, spent, casterLevel, maxLevel, highUsed } or null
api.costFor(3);                     // 5
api.canCast(actor, 3);              // true if the actor can pay for a 3rd-level spell now
api.setSpellPoints(actor, 20);      // GM: set current spell points
api.adjustSpellPoints(actor, -5);   // GM: add or take away
api.restore(actor);                 // GM: restore all, as a long rest does
api.openConfig(actor);              // GM: that actor's spell point settings
api.openTables();                   // GM: the cost and points tables
```

The choice is stored on the actor as `flags.primal-spell-points.enabled`, and the pool as `flags.primal-spell-points.spent` (points used since the last long rest) and `flags.primal-spell-points.highUsed` (6th+ levels used).

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
