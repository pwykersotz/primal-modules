# Primal Houserules

Table houserules for dnd5e, each with its own switch in the module settings. Built for Foundry V14 and dnd5e 6.x, and works with dnd5e's own sheets, Tidy 5e sheets and Midi-QOL.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

## The rules

### Natural 20s and 1s on saves against damage

- **A natural 20** on a saving throw against damage takes no damage at all, even from a spell that deals half on a success.
- **A natural 1** takes the most damage the dice could have rolled (8d6 becomes 48), and the save gives no reduction, even if the total somehow beat the DC.

Resistance, vulnerability, immunity and damage reduction still apply afterwards as usual, and healing in the same roll is left alone. The damage card's numbers show the result before anyone clicks Apply.

It works both ways damage reaches a target:

- **With Midi-QOL**, from Midi's own record of which targets rolled a natural 20 or 1 on their save.
- **Without Midi** (or when you apply damage from dnd5e's damage card), from the saving throws rolled from the same chat card, the same link dnd5e uses to halve damage on a save.

If you pick a multiplier by hand on dnd5e's damage card (half, double), a natural 1 still puts it back to full. Pick the multiplier after, or switch the rule off for that roll, if you mean otherwise.

### Armor Class cap

No creature's Armor Class goes above **24**, however it's worked out: armor, natural armor, a flat or custom formula, items, effects or cover. Every sheet, attack roll and module sees the capped number. Change the cap in the settings, or set it to 0 to switch it off. With libWrapper on, the cap is added through it.

### Gear bonuses don't stack

When several items give a bonus of the same kind, only the highest one counts. Two kinds are covered:

- **Attack rolls.** A gear bonus to every attack, a gear bonus to one type of attack (melee weapon, ranged weapon, melee spell or ranged spell), and a magic weapon's own +X (or its ammunition's). For each attack, only the highest of these counts. A +2 spear with a badge that gives +1 to melee weapon attacks attacks at +2, not +3, and a non-magic weapon still gets the badge's +1.
- **Saving throws.** A gear bonus to every save and a gear bonus to one ability's saves. A Cloak of Protection (+1 to saves) and a Ring of Protection (+1 to saves) give +1, not +2.

"Gear" means an effect that comes from an item the creature carries: a weapon, armor, a ring, a cloak, a badge, and so on. The effect still has to be active, so an item that needs to be equipped or attuned only counts when it is. Everything else stacks as normal: bonuses from spells like Bless, from class features and from conditions, penalties (a cursed -1), and dice bonuses (a 1d4 from an item). Only flat bonuses above 0 are compared.

The result is the same everywhere: the save bonuses and to-hit numbers on the sheet, the rolls, and other modules that read them. The item's effect still shows as active on the sheet's Effects tab; it just adds nothing when a higher bonus of the same kind is there. `game.modules.get("primal-houserules").api.gearPlan(actor)` shows what counted for an actor.

### Half-die hit points

When a character rolls hit points at level up, half the hit die is fixed and the other half is rolled:

| Hit die | Rolls | Range |
| --- | --- | --- |
| d6 | 1d3 + 3 | 4–6 |
| d8 | 1d4 + 4 | 5–8 |
| d10 | 1d5 + 5 | 6–10 |
| d12 | 1d6 + 6 | 7–12 |

The Constitution modifier is still added by dnd5e as usual, and taking the average works as before. If you use custom-dnd5e's minimum hit point roll, this replaces it for class levels (both raise the floor; turn one off to avoid confusion).

### Emanations once per round

A spell emanation such as Spirit Guardians affects each creature at most once per round, rather than once per turn, so walking a creature in and out of it on several turns of the same round only hurts it once. This needs **Primal Auras 1.3.0** or later, and applies to aura effects marked *At most once per turn*.

The setting *Which auras are once per round* decides what counts:

- **Spell auras** (to start with): auras on a spell item, and token auras named after a spell the caster has, such as the Spirit Guardians preset that turns on when the spell is cast.
- **All auras**: every once-per-turn aura effect.

### MVP pip

Character sheets get a second, smaller pip just under the Inspiration marker, on dnd5e's sheet and Tidy 5e's. Click it to light it; click it again to spend it, which says so in the chat. Anyone who can change the character can do either, the same as Inspiration. It's kept on the actor as the flag `flags.primal-houserules.mvp`.

### Quick Break

A third rest button, with a mug icon, sits beside the short and long rest buttons on dnd5e and Tidy 5e sheets (NPC and group sheets too). A Quick Break takes 10 minutes (1 minute with epic rests) and lets the creature spend **one** Hit Die. Nothing else recovers: no item uses, spell slots, resources or effects. Switching the button off needs a reload.

## Settings

All are world settings, so only a GM can change them.

| Setting | Default |
| --- | --- |
| Natural 20s and 1s on saves against damage | On |
| Armor Class cap | 24 (0 is off) |
| Gear bonuses don't stack | On |
| Half-die hit points | On |
| Emanations once per round | On |
| Which auras are once per round | Spell auras |
| MVP pip | On |
| Quick Break rest | On (needs a reload) |

## Macro API

```js
const api = game.modules.get("primal-houserules").api;
api.hasMvp(actor);          // true when the MVP pip is lit
await api.setMvp(actor);    // switch it; or setMvp(actor, true) / setMvp(actor, false)
api.gearPlan(actor);        // gear bonuses that were dropped or cut down, and the gear bonus that counts per kind
```

The Quick Break is the dnd5e rest type `quick`, so `actor.initiateRest({ type: "quick" })` starts one, and other modules can listen for `dnd5e.preQuickRest` and `dnd5e.quickRest`.

## Limits

- **Gear bonuses are compared by key.** The rule knows the dnd5e bonuses to attack rolls (all attacks and each attack type) and to saving throws (all saves and each ability's). A bonus an item adds some other way, like a bonus written straight into one attack's formula, or a Midi-QOL optional bonus, isn't compared. Bonuses to ability checks, skills, spell save DCs and AC aren't covered.
- **Saves without a chat card link.** Without Midi, a save only counts when it was rolled from the same chat card as the damage (the save button on the spell's card). A save rolled from the character sheet isn't linked to the damage, so the rule can't see it.
- **Maximum damage needs the rolls.** On dnd5e's damage card the maximum comes from the card's damage rolls. If a module changes the damage entries so they no longer line up with those rolls, the natural 1 still loses the save's reduction but keeps the rolled damage.
- **The MVP pip's place on Tidy 5e** depends on Tidy's layout; if a Tidy update moves the Inspiration badge, the pip moves with it but might need its spacing adjusted.

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
