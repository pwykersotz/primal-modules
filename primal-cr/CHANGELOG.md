# Changelog

## 1.1.3
- Fixed: "makes one bite and two claw attacks" was read as a single Bite. Each kind in a list that shares one
  "attacks" is now counted ("one bite, one claw, and one tail attack" too).
- Fixed: a distance in an action was read as a number of attacks, so "moves up to 20 feet and makes one attack"
  counted twenty attacks and "within 30 feet of it to attack" thirty-one. Distances and durations are skipped.

## 1.1.2
- Each attack read from a sheet now records its activity id, so Primal Attacks' Multiattack window can use the exact attack Primal CR read.

## 1.1.1

- **Primal Spell Points casters are played from their pool.** Their leveled spell slots only say which levels they
  can afford (Primal Spell Points fills each such level), so they were played as if they had every one of those slots.
  Now the reader takes the pool from Primal Spell Points: each cast pays its cost in points, 6th level and up once
  each per long rest when that rule is on, and Shield costs a 1st-level spell's points. Pact slots are unchanged.
  *Party fully rested* fills the pool.

## 1.1.0

- **Scan party.** A new button lists, for each character, what was read from the sheet and which features,
  items and spells look useful in a fight but weren't used, with the reason. Sheets were already read again
  on every run; this shows where homebrew slips through.
- **Homebrew by hand.** In the scan, each character has two fields, extra damage on one hit each turn and
  extra damage on every hit, for abilities the module can't read. They're kept on the actor.
- **Nova** (the Augmented class) is played out: Willpower to enter it, the escalating recoil that nothing
  reduces, the Burn dice on one hit a turn, letting go before the recoil would drop its user, and Solar
  Flare. The ladders come from the sheet's Nova Burn and Nova Recoil items.
- Once-a-turn extra damage on a hit is read from any feature worded that way (Divine Strike, Primal Strike,
  Finisher against a bloodied target, Fury of the Small), as is a melee attack as a bonus action (Rapid
  Strike), Potent Spellcasting, and a weapon's "extra damage to any target it hits".
- Features numbered by level ("07. Evasion") are recognised.
- Fixed: Eldritch Blast was given both more beams and bigger dice; damage a spell does to its own caster
  (Dimension Door) was aimed at the enemy; a save that follows a reaction (Deflect Attacks) was used as an
  action; powers that only work on Undead were used on anything.

## 1.0.0

- First release. A danger window for the GM that plays an encounter out with dice instead of adding up
  Challenge Ratings, and names it Easy, Medium, Hard, Boss or Impossible.
- Creatures can be added from the Actors sidebar, compendium windows and Primal Compendiums' lists by
  right-click or drag, and from the map as the selected tokens, the whole scene or the current combat.
- Mid-fight it reads current hit points, conditions and spent resources, and can keep itself up to date.
