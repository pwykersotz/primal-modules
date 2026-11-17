# Changelog

## 1.7.1
- **Fixed the carousel failing to draw.** With no combat, or with the carousel turned off, its template drew nothing at all, and Foundry refuses that (*Template part 'carousel' must render a single HTML element*), so the carousel threw an error every time it should have been hidden. It now always draws its outer frame and leaves it empty while hidden. A new check (`tests/template.test.mjs`) keeps the template to one root element.

## 1.7.0
- **A shared turn signal.** Every client now calls `primal-combat.turnEnd` and then `primal-combat.turnStart` when the turn moves forward, with everyone whose turn ended or starts: one combatant in individual initiative, or the whole acting side in side initiative (round 1's opening turn: the party members who beat the enemies). The context says the round, turn, side, mode and whether this client is the active GM. The API adds `getTurnStarters(combat)`, `getTurnEnders(combat)` and `turnHooks`. Primal Classes, Primal Auras and Primal Status use it when it's there, so they agree on who acts; they still work it out themselves without Primal Combat.
- **Companions finish with their leader.** In side initiative, marking a rider done also marks its controlled mount done (with Primal Mounts), and marking it not done brings the mount back. The GM can set any creature to finish with another from the carousel's right-click menu (*Finishes its turn with…*), such as a beast companion with its beastheart. That's kept on the companion's actor, so it lasts from fight to fight. A companion can still be marked on its own. The API adds `getCompanions(combatant)`.

## 1.6.2
- **Fixed initiative counts in side initiative.** A combatant flagged `flags.primal-combat.fixedInitiative` (Primal Drakkenheim's Epic Bosses, on 20) counts with that number when the enemies' number is worked out, so a boss no longer ends up out of step with its own side.
