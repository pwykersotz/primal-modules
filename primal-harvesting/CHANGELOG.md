# Changelog

## 1.2.0
- **A splash after each harvest**, for everyone who can see the roll, once Dice So Nice's dice land: each check's d20 (both with disadvantage, the dropped one faded) and what was added to it, the helpers, the total, and every component harvested. Click or Escape closes it; each player can turn it off.
- **The GM approves each harvest** before a player can roll it (an Approve button in the GM's window). A player's change to the list, or to who assesses, carves or helps, withdraws it. The GM's client also refuses an unapproved harvest. A world setting turns this off.
- **Only the characters of the players logged in take part** (assessor, carver, helpers, who gets the components). With only the GM logged in, every player character can, as before.
- **The GM can add anyone to a harvest** (Add a creature, or drop an actor on the team), marked "(GM)", and shared with every screen.
- **The shared window is live**: every screen lists who can take part the same way (by name), so a choice made on one screen is never dropped on another, and the GM's client sends each change straight to every open window, with older changes ignored.

## 1.1.1
- **Harvest tables window**: the rows are plain (no striping from the theme's table style), the row buttons line up with their row, and "Drop an item" is a box beside the fields. A long table no longer squashes the notes box over the rows.
- **Essences show in the tables window** too, under each table, with their challenge ratings and DCs and a button to edit them in Harvest rules. In the harvest window, a creature below the first essence's challenge rating says so ("None below CR 3").

## 1.1.0
- **The harvest window is shared.** Opening it opens it for every player who can harvest and the GM, and every change (the list and its order, who assesses, carves and helps, who gets the components) shows on every screen. While someone's harvest is rolled the others wait, and once it's harvested the window closes everywhere. The list is kept on the token until then. A setting turns this off.
- **The book's skills**: dragons use Arcana, fey Deception, undead Religion, and constructs and elementals Artifice (the world's skill of that name, such as one Custom D&D 5e renames or adds, else Investigation). The rules window lists the world's own skills, renamed and added ones included.
- **Sell prices**: essences have their own (Frail 100 gp to Mythic 10,000 gp), and every other component sells for 3 gp per point of its own DC. Harvested items carry their price, and the card says what the harvest is worth. **Deific Essence** (CR 25+, DC 50, artifact, 80,000 gp).
- **Notes** on a type or creature table (Extraplanar Recall, volatile events), shown in the harvest window.
- **Random components**: a type can have a table rolled once per corpse (the ooze's d100 table), typed in as the book writes it. The window's Roll button posts the rolls, follows "roll twice more", takes each component's DC from its own type's table, and offers what it gives for the harvest list.
- **Import from Foundry's files**: the Import window has Foundry's file picker, for a JSON file in the Data folder.

## 1.0.0
- **Harvest beaten monsters** with the rules of Heliana's Guide to Monster Hunting, from a window with the creature's components on one side and the harvest list (in carving order, each DC added to the ones before it) on the other.
- **The best assessor and carver are picked for you**, with helpers up to the size's limit and ritual carving for aberrations, celestials, elementals, fey and fiends. One creature making both checks rolls both with disadvantage.
- **Both checks are dnd5e's own skill checks**, rolled together and posted on one card, so Dice So Nice throws them together. The card shows what was harvested and lost, and marks a lost volatile component.
- **Components go into a character's inventory** as Material loot (stacking), or as an item linked in the tables. Essences by challenge rating, with their rarity.
- **Ways in**: the Token HUD (GM), a Ready to harvest card when a combat ends (or when each monster dies), a Harvest tool and keybinding for your target, and a macro API.
- **Players can harvest**: the GM's client marks the corpse and fills the inventory for them.
- **Harvest tables (GM)**: a table per creature type and per creature, typed in, pasted from the book row by row, or imported and exported as JSON. **Harvest rules (GM)**: skills, ritual carving, times, helpers and essences, starting from the book's.
