# Changelog

## 4.0.4
- **Spellcasting of 2024 monsters.** Creatures from the 2024 Monster Manual cast through a "Spellcasting" action
  whose spells are Cast activities, not spell items, and have no caster level. The sheet wrote a generated trait for
  them anyway: "is a 00-level spellcaster … has the following spells prepared:" with an empty list. Such an action is
  now shown under Actions with its own text, which lists the spells, their uses and the save DC, as the book does.
- A Spellcasting trait with no spells on the actor shows its own text instead of an empty generated one.
- A caster with no caster level set no longer reads "a 0-level spellcaster" (or "00-level" in edit mode).
