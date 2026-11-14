# Primal Attacks

Roll several attacks at once from dnd5e's own Attack Roll window. Built for Foundry V14 and dnd5e 6.x, with or without Midi-QOL, and made to work with Dice So Nice.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

## How it works

Target the creature you're attacking as usual, then click an attack. dnd5e's **Attack Roll** window comes up as it always does, with Advantage, Normal and Disadvantage and the suggested one highlighted. Primal Attacks adds one field to it:

**Attacks** `[-] 1 [+]`

Pick how many attacks (type a number or use the buttons), then press Advantage, Normal or Disadvantage. Every attack is rolled with the button you pressed and the same bonuses, all at the same time. Leaving it at 1 is a normal attack, exactly as if Primal Attacks weren't there.

There is no other window and no detection of Extra Attack, Multiattack or bonus action attacks: you decide how many attacks to roll. Pressing Enter in the field doesn't roll; it only keeps the number.

The field is there for weapon, natural and spell attacks (Fire Bolt, Eldritch Blast, Scorching Ray), for creatures you own, on anyone's turn. It starts at 1 every time, so reactions and opportunity attacks stay single attacks unless you change it. Hold **Shift, Alt or Ctrl** when clicking to skip the window as usual; that makes a single attack.

## Rolling

- **Without Midi-QOL**, one attack card holds every attack roll, so Dice So Nice throws all the d20s together. Once they land, the damage of every hit is rolled together on one card, one copy of the damage per hit, ready to apply. Critical hits are rolled on a second card with critical damage. A natural 1 misses. A hit can only be told against a single target, so with several targets (or none) every attack but a natural 1 counts. Ammunition is spent for every attack.
- **With Midi-QOL**, all the attack rolls are made and thrown together. The first attack carries on as Midi-QOL's own workflow, and each of the other attacks then gets a workflow of its own, given the attack roll already made for it (no new dice, no window). Hit checks, damage, saves, effects and concentration happen for every attack as Midi-QOL does them. Midi-QOL's dice animations are turned off for these attacks, and the attacks start resolving while the attack dice are still rolling; the damage dice of all the hits (with any other or bonus damage) are thrown together at the end. If Midi-QOL is set to wait for a damage button, these attacks roll their damage on a hit instead, so nothing stops halfway.
- **Spells.** The spell slot (if any) is spent once, by the first attack. Every attack is at the level the spell was cast at, so an upcast Scorching Ray does its upcast damage on every ray, and concentration isn't started again.
- **A target going down** (Midi-QOL): if the target is at 0 hit points or defeated before one of the other attacks, the remaining attacks are skipped. The GM can set this to keep attacking.
- **Advantage and disadvantage** come from the button you press, as with any attack. Primal Attacks adds none of its own.

**Folded cards (Midi-QOL).** Midi-QOL posts a card for each attack, and often an HP Updated card for each hit. Those cards are hidden from the chat log, so a set of attacks shows as its summary only. They aren't deleted: the summary's **Show cards** button shows them again (for Midi-QOL's buttons and undo), and they come back on their own if the summary is deleted or never posted. The GM can turn this off.

**The summary.** When the attacks are done, one chat card lists each attack, its roll, hit or miss, and its damage, with the totals at the bottom. Under each attack are its dice: the attack roll (with the die advantage or disadvantage dropped faded) and each damage roll, like `Attack 2d20 [17] [6] + 7 = 24` and `Damage 1d8 [5] + 4 = 9 Slashing`. It follows your roll mode. The GM sees everything; players see hits, misses and the target's AC only as dnd5e's attack roll visibility setting (or Midi-QOL's hit checks) allows.

## With other modules

- **Dice So Nice**: every attack's d20s are one throw, and the damage of the hits is one throw.
- **Midi-QOL**: a plain click on an attack always shows the Attack Roll window (that's where the number is picked), even if Midi-QOL would fast-forward it. Shift, Alt and Ctrl still do what Midi-QOL uses them for. Reaction, Bonus Action and opportunity attack checks aren't repeated for the other attacks, and they spend no extra uses.
- **Primal Status**: a desperation attack applies to the first attack only.
- **One-time damage** (without Midi-QOL): a damage roll another module marks as one-time (`options["primal-attacks"].once`), such as Primal Classes' charged and once-a-turn Binder riders, goes with the first hit only, not with every copy.
- **Primal Combat**: works with side initiative; the field shows on either side's turn.
- **Multiattack**: using a creature's Multiattack opens a window with each of its attacks and how many times to make it. Rolling uses each attack in turn, with its number already set in its Attack Roll window (you can still change it there), so each rolls as a set with its own summary. Cancelling one stops the rest. With **Primal CR** on, the numbers are read from the Multiattack's text ("one Bite and two Claws"), with anything else it uses; without it you pick them.
- **Tidy 5e** and dnd5e's own sheets work as usual. **libWrapper** is recommended but not needed.

## Settings

| Setting | Who | What it does |
| --- | --- | --- |
| Offer the number of attacks | Each player | For every creature (default), only player characters, only monsters and NPCs, or never. |
| Without Midi-QOL, roll damage | World | For the attacks that hit (default), for every attack, or never. |
| With Midi-QOL, when the target goes down | World | Skip the remaining attacks (default), or keep attacking it. |
| Multiattack opens the routine window | Each player | Using a creature's Multiattack opens the window above. On by default. |
| Post a summary | World | The summary card after each set of attacks. On by default. |
| With Midi-QOL, fold each attack's cards into the summary | World | Hide Midi-QOL's own cards for each attack of a set (Show cards on the summary brings them back). On by default. |

## For macros

```js
const api = game.modules.get("primal-attacks").api;
api.isRunning(actor);   // is a set of attacks being rolled? (also takes a token)
api.stop(actor);        // with Midi-QOL, stop after the attack being resolved
api.openMultiattack(actor);   // the Multiattack window
api.rollMultiattack(actor);   // roll the routine Primal CR reads, without the window; or pass [{itemId, activityId, count}]
```

## Checks

- `node tests/engine.test.mjs` checks the rolling against small stand-ins for Foundry, dnd5e, Midi-QOL and Dice So Nice: one window, every roll made and thrown together, the damage of the hits together, a workflow for every attack with Midi-QOL (with no new dice), ammunition, a target going down, the summary card, a single attack left alone, and that every text is in the language file.

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
