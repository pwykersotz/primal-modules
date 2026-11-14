# Changelog

## 1.6.0
- **Multiattack in one go.** Using a creature's Multiattack opens a window with each of its attacks and how many times to make it. With Primal CR on, the numbers are read from the Multiattack's text ("one Bite and two Claws"), along with anything else it uses; without it the GM picks. Rolling uses each attack in turn with its number of attacks already set in its Attack Roll window, so each rolls as a set with its own summary. Cancelling one stops the rest. A per-user setting, *Multiattack opens the routine window*, turns it off. The API adds `openMultiattack(token)` and `rollMultiattack(token, plan)`.

## 1.5.1
- **One-time damage riders stay with one hit.** Without Midi-QOL, the damage of several hits is one roll with a copy per hit. A damage roll another module marks as one-time (`options["primal-attacks"].once`, such as Primal Classes' charged and once-a-turn Binder riders) now goes with the first hit only instead of being copied to every hit. Each hit's damage in the summary is worked out from the hit it belongs to.

## 1.5.0
- **The summary shows every die.** Under each attack, its attack roll and each of its damage rolls are drawn as dice, the way the attack cards show them: "Attack 2d20 [17] [6] + 7 = 24", "Damage 1d8 [5] + 4 = 9 Slashing". The die advantage or disadvantage dropped is faded and struck through, and the highest and lowest faces are green and red. Players see them as they'd see the roll's numbers (Midi-QOL's roll details setting still applies). Summaries posted before this version keep their damage in words.

## 1.4.1
- **Faster sets with Midi-QOL.** The attacks start resolving while the attack dice are still rolling, instead of waiting for them to land. The damage dice still wait for the attack dice, and the summary still waits for the damage dice.
- After each set, the console (F12) says how long it took and where: the first attack, each other attack (Midi-QOL's own workflow), and the damage dice and summary.

## 1.4.0
- **One card per set (Midi-QOL).** The cards Midi-QOL posts for each attack of a set (its attack card and its HP Updated card) are now folded into the Primal Attacks summary: hidden from the chat log, not deleted. The summary's Show cards button shows them again, and they come back on their own if the summary is deleted or never posted. A world setting turns this off.

## 1.3.0
- **Spell attacks.** The Attacks field now shows on spell attacks too (Fire Bolt, Eldritch Blast, Scorching Ray), and they roll together like weapon attacks. With Midi-QOL, the spell slot is spent once, every attack is made at the level the spell was cast at (so upcast damage applies to each), and concentration isn't started again.

## 1.2.3
- **The Attacks field shows on any turn.** It was only offered on the creature's own turn (its side's turn with Primal Combat), so it vanished when attacking on another side's turn. It starts at 1 every time, so reactions are still single attacks unless you change the number. The "Only on the creature's turn" setting is gone.

## 1.2.2
- **Every damage die is thrown (Midi-QOL).** A weapon's other damage (like Ignacious' 4d6) is now thrown with the rest of the damage at the end, and counted in the summary.
- **No dice thrown twice, nothing hidden on the cards.** The dice Primal Attacks throws are marked as shown, as Midi-QOL does with its own, so Dice So Nice no longer tries to throw them again (and hide their rolls) when Midi-QOL adds them to its card.
- **The summary shows the dice.** Under each attack, the damage dice it rolled: "1d8 (2) + 8 = 10 Slashing".

## 1.2.1
- **Fix: the Attacks field stopped showing after a miss (Midi-QOL).** When the first attack of a set missed, Midi-QOL left its workflow waiting for a damage click, so the set never finished and the field was held back for five minutes. The first attack now finishes on a miss like the others, the rest of the attacks go on, and the field always shows on the next click.
- A new set of attacks ends a set that is still waiting, without rolling its remaining attacks.

## 1.2.0
- **One window, all the rolls together.** The question is gone. dnd5e's Attack Roll window (Advantage, Normal, Disadvantage, with its highlighting) now has an **Attacks** field. Pick how many, press a button, and every attack is rolled at once with that button.
- **Dice So Nice** throws every attack's d20s together, then the damage of all the hits together.
- **Without Midi-QOL**, one attack card holds every roll, and the damage of the hits is rolled together on one card (critical hits on a second), ready to apply.
- **With Midi-QOL**, every attack still gets its own workflow (hit checks, damage, saves, effects), using the roll already made for it, with no new dice and no new window.
- **Removed**: detecting Extra Attack, Multiattack, bonus action attacks, Nick and Haste. You choose the number of attacks.

## 1.1.2
- **The Attack Roll window is back.** Each attack shows dnd5e's roll window with Advantage, Normal and Disadvantage, and the suggested one highlighted, the same as a normal attack. With Midi-QOL it follows Midi-QOL's own fast-forward settings. Closing the window stops the remaining attacks.

## 1.1.1
- **Extra Attack from other classes.** Extra Attack is now found however a class names it: "Extra Attack (Warden)", an identifier that doesn't match dnd5e's, or only the feature's text ("you can attack twice, instead of once, whenever you take the Attack action", "three attacks instead of one"). A 2014-style Extra Attack that grows at 11th level now counts the levels of the class that gave it, not only fighter levels.
- When clicking an attack doesn't ask how many attacks, the console (F12) says why, once per creature: one attack found, not its turn, or your setting.

## 1.1.0
- **A simple question instead of the big window.** Clicking an attack now asks only "How many attacks with this?", starting at the number the creature gets: 2, 3 or 4 from Extra Attack, Two Extra Attacks or Three Extra Attacks, or as many as its Multiattack makes with that attack. Below it you can pick a bonus action attack (a monk's Martial Arts strike, Flurry of Blows with its Focus cost, an off-hand attack), and tick Nick's or Haste's extra attack when the creature has one. Answering 1 with nothing added makes a normal attack.
- **Targets work like a normal attack.** Every attack goes at the creatures you had targeted when you clicked. If one goes down, the rest of the attacks go at the others; if all of them are down, you're asked what to do (as before).
- **Disadvantage.** Primal Attacks no longer passes any advantage, disadvantage or targets to dnd5e or Midi-QOL, so every attack rolls exactly as a normal click would.
- Removed: the Token HUD button and its setting, clicking a Multiattack or Flurry of Blows to open the window, choosing a Multiattack routine, remembering a number of attacks, and the per-row target and advantage choices.

## 1.0.1
- **Fix: clicking an attack did nothing.** The window couldn't open in Foundry V14, because it used a name Foundry's windows already use for themselves. It opens now.
- If the window ever fails to open, the attack now goes ahead as a normal attack (with a message saying so) instead of the click being lost.

## 1.0.0
- First version.
