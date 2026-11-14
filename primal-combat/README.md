# Primal Combat

A combat tracker carousel across the top of the screen. Built for Foundry V14 and dnd5e 6.x.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

## The carousel

As soon as a creature is added to the combat tracker, a row of portraits slides in at the top of the screen. It sits **under dnd5e's calendar** (and anything else other modules put in that top-centre column), so the two never overlap, and it moves down by itself if the calendar is turned on later.

- **Whoever is acting comes first**, wrapped in the turn frame (Foundry's orange turn marker art) and a little bigger than everyone else. The rest of the round follows, then a small **R2** divider, then the creatures who have already gone this round. When the turn moves, the portraits slide along.
- **Initiative.** Each portrait shows its initiative. A creature that hasn't rolled shows a pulsing d20 to its owner: click it to roll (in dnd5e this opens the normal roll dialog, so advantage works). Before combat starts the GM gets a d20 button that rolls for all the GM's creatures, and a ▶ button to begin.
- **Moving turns.** The GM has ◀ and ▶ at the ends of the carousel. On their turn, a player can **click their own portrait** to end it (a tick shows on hover), or use the **End turn** button.
- **Hover a portrait** to light up that creature's token on the map with a pulsing ring (plus Foundry's normal hover outline). This is how you tell six identical goblins apart. Hovering a token on the map lights up its portrait too. The tooltip shows the name, initiative and HP.
- **Click a portrait** to go to that token (and select it, if it's yours), except a player's own portrait on their turn, which ends the turn. **Double-click** opens the sheet. **Right-click** for more: go to or ping the token, open the sheet, roll initiative, and for the GM hide/reveal, mark defeated, or remove from combat.
- **Border colours** follow the token's disposition: blue friendly, red hostile, yellow neutral (purple secret, GM only). Defeated creatures turn grey with a skull. Combatants hidden from players don't appear for players at all; the GM sees them with a dashed border.
- **HP bars** under the portraits, for the GM and each creature's owners (see settings).
- **Turn timer.** The bar under the carousel shows how long the current turn has taken (in side initiative, the whole side's turn). There is one shared timer, kept by the GM's client, so everyone sees the same count. It stops while the game is paused (⏸) and carries on when you unpause, starts afresh when the world is launched again, and the GM can click it to start again from zero, say after a break the game wasn't paused for. The settings choose who sees it.
- **Rolling initiative joins combat.** When anyone rolls initiative for a creature that isn't in the combat yet (from the character sheet, say), it's added and appears in the carousel. If no combat is running, one is started: Foundry does that itself for the GM, and when a player rolls, the GM's screen starts it for them (a GM needs to be logged in).
- **Ending combat.** Once every hostile creature in a running combat is at 0 HP (or marked defeated), the GM is asked whether to end the combat. Say "Keep fighting" and you won't be asked again until a hostile gets back up or a new one joins and they all go down again. Creatures on the enemies' side in side initiative count as hostile; creatures without hit points don't count. It can be turned off in the settings.
- The GM's **⋮ menu** has roll for NPCs / everyone, reset initiative, add a lair action or event, switch between individual and side initiative, and end combat.

## Lair actions and other events

Some things happen on an initiative count rather than on a creature's turn: a dragon's lair actions on 20, a ceiling that cracks on 10, reinforcements on 5. Add one from the GM's ⋮ menu (**Add a lair action or event…**) with a name, the initiative count, a picture, notes for yourself, and whether players can see it.

- An event shows in the carousel with a teal, squarer border and its count on the badge, and has a turn of its own like a creature. Foundry's sidebar tracker shows it too.
- **Individual initiative:** it happens on its count and loses ties, as lair actions do.
- **Side initiative:** the party acts together and the enemies act on one number, so an event goes around the enemies' turn: **just before it** if its count beats the enemies' number, otherwise **just after it** (before the party). It has its own chip in the carousel. Several events in the same place go together. With no enemies at all, events open each round. Click an event's portrait when it's done, the same as marking an enemy done.
- **Reminder.** When an event's turn comes, the GM gets a whispered chat card with its notes, and for a creature's lair actions, links to them. Once per event per round; going back and forward again doesn't repeat it. It can be turned off per event.
- **Creatures with lair actions bring them.** When a creature with dnd5e lair actions joins combat (a lair action initiative on its sheet, or lair action items, which go on 20), a *Lair Action (name)* event is added for it, once however many tokens of it there are. It leaves when the last of them leaves. This can be turned off in the settings.
- **Changing one.** Double-click an event's portrait (or right-click → **Edit event…**) to change it. Typing a new initiative for it in the sidebar tracker changes its count, and resetting initiative leaves events on their counts. Right-click → **Hide / reveal** or **Remove from combat** work as for creatures.

## Side initiative

Turn it on for every new combat in the settings, or for one combat from the GM's ⋮ menu.

**Who is on which side.** Player characters, and every creature that isn't marked hostile (friendly, neutral or secret), are on the party's side. Hostile creatures are the enemies. The GM can right-click a portrait to move it to the other side (a charmed ally, say).

**Initiative.** Everyone on the party's side rolls their own initiative as usual, from the d20 on their portrait or anywhere else. The enemies don't roll: they all act on the **highest static initiative** among them (dnd5e's initiative score, 10 + initiative bonus, with the Dexterity tie-breaker if that dnd5e setting is on). A creature that always acts on a set number, such as a Primal Drakkenheim Epic Boss on 20 (`flags.primal-combat.fixedInitiative` on its combatant), counts with that number instead. That number is worked out again whenever an enemy joins or leaves before combat starts, is given to every enemy so Foundry's own tracker agrees, and shows on the enemies' chip in the carousel. If someone rolls for an enemy anyway, it's put back on the enemies' number. The GM's d20 button rolls for the GM's own creatures on the party's side.

**Turn order.**

1. Round 1 opens with the party members who **beat** the enemies' number (a tie goes to the enemies). Their chip has a ⚡.
2. Then the enemies.
3. Then the whole party, including the ones who went first.
4. From then on the enemies and the whole party alternate: round 2 is enemies then party, and so on.

If nobody beats the enemies, they simply go first. Anyone who hasn't rolled when combat begins acts with the rest of the party. When the GM presses ▶ to begin, the GM's creatures on the party's side roll if they haven't yet, and chat says who goes first.

**Taking turns.**

- **Every acting portrait is framed**, and every acting token on the map gets Foundry's turn marker.
- **Each player clicks their own portrait when they're done.** It fades and gets a tick, and the turn marker leaves their token. Click again to undo. Players can only mark their own characters; the GM can mark anyone.
- When everyone acting is done (defeated creatures don't count), the other side's turn starts by itself. The GM can also press ▶ at any time.
- On the enemies' turn the GM clicks each enemy as it finishes. Hovering a portrait shows which token it is, so you can keep track of which goblin has gone.

While a combat uses side initiative, the GM's Next Turn and Previous Turn buttons (in the sidebar too) move a whole side at a time. A player's End Turn button in the sidebar just marks their own character done, the same as clicking the portrait, so it can't end the side's turn for everyone. Going back to a side un-marks that side so it can go again.

**Start and end of turn.** When a side's turn begins, every creature acting gets its start of turn, and when the side's turn ends, every creature that acted gets its end of turn. That covers:

- dnd5e's start-of-turn recovery (legendary actions and the like),
- Midi-QOL's OverTime effects (saves and damage at the start or end of a turn), its action, reaction and bonus action resets, and its once-per-turn optional bonuses,
- effects that last until the start or end of a creature's turn ("until the start of your next turn"),
- region behaviours that act at the start or end of a turn, and the movement measured for the turn,
- DAE's macro repeats (every turn's start, end, or both).

Nothing runs twice. (Without this, only the first creature of each side got its start of turn on time; the others got their start and end together when their side's turn ended.) In round 1 the party members who beat the enemies have two turns, the opening one and the whole party's, so their start of turn comes at both. The GM's console says whose turn starts and ends, one line for each side.

**Companions finish with their leader.** Marking a rider done also marks its controlled mount done (with Primal Mounts), and marking it not done brings the mount back. For a beast companion, a familiar or anyone else, the GM right-clicks its portrait and picks *Finishes its turn with…*. That's kept on the companion's actor, so it lasts from fight to fight. A companion can still be marked on its own.

The GM's ⋮ menu also has: roll for the GM's creatures on the party's side, roll for everyone in the party who hasn't rolled, and reset the party's initiative.

## Settings

| Setting | Who | What it does |
| --- | --- | --- |
| Initiative for new combats | World | Individual or side initiative. Each combat can be switched from the ⋮ menu. |
| Move on when a side is done | World | Start the other side's turn once everyone acting has clicked done. |
| Turn markers on the whole acting side | World | Show Foundry's turn marker on every acting token in side initiative. |
| Turn frame image | World | The art around acting portraits. Defaults to Foundry's orange turn marker. |
| HP bars on portraits | World | Nobody, the GM and owners (default), or everyone. |
| Turn timer | World | Who sees how long the current turn has taken: everyone (default), only the GM, or nobody. |
| Offer to end combat when the hostiles are down | World | Ask the GM whether to end combat once every hostile creature is at 0 HP. On by default. |
| Add lair actions automatically | World | Add a Lair Action event when a creature with lair actions joins combat. On by default. |
| Show the combat carousel | Per browser | Turn the carousel off on this computer. |
| Carousel portrait size | Per browser | 58 px by default. |
| Carousel portrait image | Per browser | Token art (default, matches the map) or actor portrait. |
| Extra space above the carousel | Per browser | Push it further down if something drawn over the top of the screen still overlaps it. |

## For macros

```js
const api = game.modules.get("primal-combat").api;
api.setMode(game.combat, "side");          // or "standard" (GM)
api.getEnemyInitiative(game.combat);        // {value, name}: the enemies' number and whose it is
api.applyEnemyInitiative(game.combat);      // work it out again and give it to every enemy (GM)
api.setDone(combatant, true);               // mark done; false to un-mark, leave out to flip
api.nextSide(game.combat);                  // end the acting side's turn
api.getSide(combatant);                     // "party", "enemies", or "event"
api.getActingMembers(game.combat);          // everyone acting now (round 1's opening turn: the party members who beat the enemies)
api.getTurnTimer(game.combat);              // {time, pausedAt}: when the current turn started, in server time
api.restartTimer(game.combat);              // start the turn timer again from zero (GM)
api.addEvent(game.combat, { name: "Ceiling cracks", count: 10, notes: "DC 15 Dex save" }); // (GM)
api.updateEvent(combatant, { count: 15 });  // change an event (GM)
api.openEventDialog(game.combat);           // the GM's add-event form; pass an event combatant to edit it
api.isEvent(combatant);                     // is it a lair action or other event?
api.getCompanions(combatant);               // who finishes their turn with it in side initiative
api.getTurnStarters(game.combat);           // whose turn it is now: one combatant, or the acting side
api.getTurnEnders(game.combat);             // whose turn ended to get here

// The turn signal, on every client, when the turn moves forward (turnEnd first):
Hooks.on("primal-combat.turnStart", (combat, combatants, { round, turn, side, mode, isActiveGM }) => {});
Hooks.on("primal-combat.turnEnd", (combat, combatants, context) => {});
```

Primal Classes, Primal Auras and Primal Status use the turn signal when this module is on, so every module agrees on who is acting. Change documents only where `isActiveGM` is true, so nothing happens twice.

## Checks

`node tests/turn-events.test.mjs` checks the start and end of turn in side initiative against small stand-ins for Foundry, dnd5e, Midi-QOL and DAE.
`node tests/timer.test.mjs` checks that the GM and a player see the same turn timer: turn changes by either, pausing (including a missed unpause), late rolls, removing the creature whose turn it is, and relaunching the world.
`node tests/encounter.test.mjs` checks joining combat by rolling initiative and the offer to end combat.
`node tests/carousel-click.test.mjs` checks who can end a turn by clicking a portrait.
`node tests/events.test.mjs` checks where events go in the turn order (individual and side initiative, through several rounds), their reminders, keeping their count, and lair actions coming and going with their creature.

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
