# Primal CR

How dangerous is this fight for this party? Primal CR ignores Challenge Rating. It reads the sheets of
everyone involved, plays the fight out a thousand times with dice, and tells the GM what tends to happen.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

For Foundry VTT 14 and the dnd5e system (6.0 or later). GM only. Works alongside Midi-QOL and the other
Primal modules; none of them is required.

## The five levels

| Level | What it means | Triggered when (defaults) |
| --- | --- | --- |
| **Easy** | The party wins without trouble. | None of the below. |
| **Medium** | The party wins with a bit of trouble. | The party loses 25% or more of its hit points on average. |
| **Hard** | The party wins, but a character may drop to 0 HP. | Someone drops in 20% or more of fights. |
| **Boss** | There's a risk of a TPK. | The whole party goes down in 10% or more of fights. |
| **Impossible** | The party has less than a 10% chance of victory. | The party wins fewer than 10% of fights. |

The highest level that applies is the verdict. All four percentages can be changed in the module's
settings.

## Using it

Open the window from the **scales button in the Token controls**, or give it a key under Configure
Controls. Then fill the two sides:

- **Right-click** an actor in the Actors sidebar, in a compendium window, or on Primal Compendiums'
  Compendiums side, and choose **Add to Primal CR**. Right-click a folder of actors to add everything in it.
- **Drag** actors, folders or tokens onto either side of the window.
- **From the map:** *Selected tokens*, *Whole scene* or *Current combat*. Tokens are sorted into party and
  enemies by who owns them and by their disposition. The Combat Tracker also gets a scales button that
  loads the fight in progress.
- **Player characters** fills the party side with the system's primary party, or failing that every
  player-owned character.

An actor that has never been added lands on the party side if a player owns it and on the enemy side
otherwise; the arrows on a row move it across. Enemies have a count, so "six goblins" is one row.

Planning and mid-fight use the same window. Creatures are read **as they are right now**: current hit
points and temporary hit points, conditions, spent spell slots and item uses, and for tokens the token's
own actor. Tick **Party fully rested** to plan as if the party were at full strength. With **Keep up to
date** ticked the verdict is worked out again whenever one of the creatures changes, so it follows a fight
as it happens.

Each row shows how often that creature drops and its share of its side's damage; the caret opens what was
read from its sheet, which is the place to look if a verdict surprises you. Under the verdict is the
rulebook's own XP measure for comparison.

## Scan party and homebrew

Sheets are read again every time the danger is worked out, so a new level, item or feature is picked up
without doing anything. **Scan party** shows what that reading made of each character: what was understood,
and which features, items and spells look useful in a fight but weren't used, with the reason (a reaction,
a companion, not equipped, or simply nothing the module knows how to play).

For an ability it can't read, each character in the scan has two fields: **extra damage on one hit each
turn** and **extra damage on every hit**. Type a dice formula such as `2d6` and it is used from then on.
The formulas are kept on the actor (`flags.primal-cr.manual`).

Read without help: once-a-turn extra damage worded as "once on each of your turns when you hit" (Divine
Strike, Primal Strike, Finisher, Fury of the Small), a melee attack as a bonus action, Potent Spellcasting,
and the Augmented class's **Nova** with its Nova Burn and Nova Recoil items, Willpower and Solar Flare.

## What it looks at

Hit points and temporary hit points; Armor Class; initiative; all six saving throws; proficiency; attack
bonuses and damage dice of every attack; save DCs, half-damage-on-save and areas of effect (using the
Dungeon Master's Guide's "targets in an area" rule); multiattack; bonus actions; recharge and limited
uses; spell slots, pact slots, Primal Spell Points pools, upcasting and cantrip scaling; concentration spells that keep dealing
damage; healing, including picking up downed allies; damage resistance, immunity and vulnerability with
the magical-weapon bypass, and flat damage reduction (including Midi-QOL's); condition immunities; conditions an
attack hands out (with their saves and durations) and conditions already on a creature, including Primal
Status's; legendary actions and legendary resistance; Magic Resistance; regeneration and what stops it;
Pack Tactics; Sneak Attack; Rage; Extra Attack; Evasion; Uncanny Dodge; Shield and Parry; Undead Fortitude;
Relentless Endurance; death saving throws and massive damage; Midi-QOL advantage and disadvantage flags.

## What it doesn't know

It is a simulation of a straightforward fight, not of your table. It does not model positioning, cover,
range or movement, surprise, terrain, summoned creatures, buffs that only help allies (Bless, Haste),
control spells that deal no damage and name no condition it recognises, on-hit choices such as Divine
Smite or Stunning Strike, reactions to what others do, pools such as Ferocity, readied actions, or clever play. Features it cannot read are simply not used, so a creature whose
danger lives in an unusual trait will be underrated; open its row to see what was read. Enemies fight to
the death. Treat the verdict as an informed estimate.

## Settings

- **Fights played out** (200 to 5000, default 1000). More is steadier and slower.
- **Enemy tactics:** mixed (default), focus fire on the weakest, or random targets.
- The four level thresholds.

## For macros and other modules

`game.modules.get("primal-cr").api` offers `open()`, `add(uuids, side)`, `fromMap("selected" | "scene" |
"combat")`, `assess(partyActors, enemyActors, options)`, `read(actor)`, and the pure `readActor`,
`simulate` and `judge` functions.

## Tests

See `tests/README.md`.

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
