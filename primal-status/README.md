# Primal Status (Foundry VTT module)

Animated token visuals and rules automation for status effects. It also adds a **Mighty Guard** status effect (shield icon): while a creature has it, **damage rolls made against it** roll their minimum (2d6+3 rolls 5; 8d6 rolls 8). Attack rolls are not affected.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

## Install
1. Unzip `module.zip` so you have `Data/modules/primal-status/module.json`, or, once it's published as a GitHub release, paste its manifest link into Foundry's **Install Module** window (see `RELEASING.md`).
2. Enable **Primal Status** in *Manage Modules*. [libWrapper](https://foundryvtt.com/packages/lib-wrapper) is recommended but not required.

## Moving from Enhanced Status Effects or Mighty Guard
This module was called **Enhanced Status Effects** (folder and ID `enhanced-status-effects`, versions 3.0.0 to 3.2.3) and before that **Mighty Guard** (`mighty-guard`). From 4.0.0 its folder and ID are `primal-status`:
1. Close Foundry, rename the module's folder (`enhanced-status-effects`, or `mighty-guard`) to `primal-status` (don't keep a copy of the old one), and start Foundry again.
2. In your world, open **Manage Modules**, tick **Primal Status** and save. (Foundry may mention the old module is missing; that's expected.)
3. The first time the GM loads the world, the module carries over everything that was stored under the earlier ID: the world's settings, the images of status effects already on creatures, the Grappled overlay image, and macros that call `game.modules.get("enhanced-status-effects")` (or `"mighty-guard"`). Each player's own choices (animations, quality, sounds) carry over the first time they log in. Where both earlier IDs have a setting, the newer one is used. A token's *Animate this token's statuses* choice, Contamination levels and Dead applied at three failed saves are read from where they were.
4. If an old copy is still switched on alongside it, the GM is warned, since everything would run twice.

## Settings
Module Settings is kept short:
- **Token animations → Choose Animations** (every player): the *Animation quality* (Automatic, Full, Reduced or Still) and one window with every animation, grouped into Statuses, Conditions, Contamination and Exhaustion, and Monsters of Drakkenheim, each with an on/off box (hover one for details), *All on* / *All off* buttons, and the option to hide the status icons the animations replace, and optional sounds with a volume slider. These choices are per player. The GM also sees a *For everyone* section with the Mighty Guard glow speed, the Grappled overlay image and size, *Leave statuses other modules animate to them* and a *Give every player these choices* button. Every change in this window is saved the moment you make it; *Done* just closes it. On a small screen the window scrolls.
- **Status palette icons → Choose Visible Statuses** (GM): which statuses appear in the token's status palette.
- **Status text pane** (per player), **Advantage and Disadvantage from conditions**, **Dodging ends at the start of the creature's next turn**, **Three failed death saves mark a creature Dead**, **Invisible and Ethereal creatures show a whirl or shimmer**, **Ethereal creatures see in grey, up to 60 ft**, **Guidance checkbox on ability checks**, **Save-ends effects end with the combat**, **Burning and Bleeding at the end of each turn**, **Enforce Bewildered, Distracted and Staggered**, **Desperation attacks** and **Desperation attack chance** (off until turned on; players never see these settings, and their description is only in Module Settings) and **Mighty Guard: what counts as damage** (GM).

## Use
- Right-click a token → open the status effects palette → click the **Mighty Guard** shield (the one with an "M"). Click again to remove it.
- While active, the token looks spectral: a bright pulsing cyan rim, glowing blue cracks spreading across the token, a blue tint and wisps drifting upward. The GM adjusts *Glow speed* and each player can turn it off, both in the *Token animations* window (Module Settings → **Choose Animations**).
- The attacker must **target** the guarded token when rolling damage.
- Macro alternative: `game.modules.get("primal-status").api.toggle()` toggles it on the selected tokens.

## Damage detection
- **dnd5e / pf2e**: the system's own damage rolls (weapons, spells, critical damage).
- **Other systems**: rolls labelled as damage. If damage isn't caught, set *Mighty Guard: what counts as damage* to **Any non-d20 roll while targeting** in Module Settings.
- Rolls containing a d20 are never touched.

If one damage roll targets several creatures and any of them is guarded, that roll is minimized.

Compatible with Foundry v12–v13. Uses libWrapper if installed, but doesn't require it.

## Cover and Hiding fog
Tokens with any cover status (dnd5e's cover, named here *Cover (Half)*, *Cover (Three-Quarters)* and *Cover (Total)* so the three sit together in the palette, or any status whose ID names cover in other systems) are shrouded in slowly swirling grey-white fog, and their art is slightly faded. Heavier cover means thicker fog. **Hiding** gets the same fog, a little thicker than Half Cover and thinner than Three-Quarters; a creature that is Hiding and in cover gets whichever fog is thicker. On a creature that is Invisible and Hiding, only the GM sees the fog; players see nothing. It stacks with the Mighty Guard effect. Turn it off per player in the *Token animations* window (Module Settings → **Choose Animations**).

## Sleeping and Unconscious Z's
Tokens with the Sleeping or Unconscious condition (dnd5e's `sleeping` and `unconscious` statuses) show glowing green Z's drifting up and to the right from the top of the token, growing as they rise and fading out. They don't show on a creature that's dying at 0 HP (it gets the pulsing red skull instead) or dead. Turn it off per player in the *Token animations* window (Module Settings → **Choose Animations**).

## Haste and Slow
Two new statuses appear in the token's status palette (right-click a token → status effects), with their own icons.

- **Haste**: Speed doubled, +2 AC, Advantage on Dexterity saves (applied automatically in dnd5e). The description reminds you of the extra limited action. Removing Haste doesn't apply any lethargy or Incapacitated effect.
- **Slow**: Speed halved, −2 AC, −2 to Dexterity saves (applied automatically in dnd5e). The description reminds you of the no-reactions, action-or-bonus-action, one-attack and 25% somatic-spell-failure rules.

Hasted tokens get a crackling green outline with highlights running around the rim and twinkling sparks; Slowed tokens get the same animation in dark blue. The outline also appears for dnd5e's own "Hasted" / "Slowed" spell effects. Turn it off per player in the *Token animations* window (Module Settings → **Choose Animations**).

## Status palette: search, status pane and hidden statuses
The token's status palette (right-click a token → status effects) lists its icons in alphabetical order, with the Monsters of Drakkenheim statuses (its conditions and Contamination) in a section of their own at the bottom, under a heading. The status pane beside it follows the same order. The palette is always tall enough to show every icon without scrolling, and gains columns rather than running off the bottom of the screen. It has a search box at the top. It's focused when the palette opens: type to filter icons by name, press Enter to toggle the first match, Escape to clear.

While the token's status palette is open, a **status pane** beside it shows the full text of every active status effect, so nothing covers the icons. It sits to the right of the palette, or to the left of the whole HUD when the sidebar is in the way, stays level with the palette as you pan or zoom (its text doesn't shrink with the zoom), and is made big enough to show every status without scrolling. When one column would run off the screen it spreads into two, three or four columns side by side, as many as fit beside the HUD. It moves up the screen if it needs the height, and only then makes the rules text a little smaller. It scrolls only if even that can't fit it all, for example on a very small screen. Each effect shows its name, where it comes from (e.g. the item) and how long it has left (a small badge such as *2 Rounds*; Dodging in combat says *Until its next turn*), then its whole description. On a creature you own, each effect has a **×** button that removes it straight from the pane (not effects an item carries, which belong to the item). For dnd5e conditions that's the full rules text from the system's rules pages. Jinxed, Valor and Burning each have a box under their name for their value, see *Monsters of Drakkenheim conditions*. Statuses dnd5e doesn't link to rules (Concentrating, the three Covers, Surprised, Dodging, Hiding, Flying, Hovering, Burrowing, Bloodied, Stable, Dead) get the matching 2024 Rules Glossary entry, the same wording as 5e.tools' XPHB entries (they're in the SRD 5.2), taken from dnd5e's own SRD rules compendium. An effect with no text of its own shows the status's rules; one with its own text (such as a spell's Concentrating effect) shows that, then the status's rules underneath. An effect that gives several statuses (Unconscious gives Incapacitated and Prone) shows the rules for each, and no rules are repeated. Hovering a status in the palette highlights its text in the pane. Icons in the text are kept small, and the palette icons keep their usual name tooltips. Turn it off per player with *Status text pane*.

GMs can hide statuses they don't use: Module Settings → *Status palette icons* → **Choose Visible Statuses**. Statuses are listed alphabetically, read down each column, with the Monsters of Drakkenheim ones in their own section. Untick statuses to remove them from the palette for everyone; the palette shrinks to fit what's left. Hidden statuses still work when applied by spells, items or macros, and still show on tokens.

## Charmed hearts
Tokens with the Charmed condition show pink hearts with a soft glow drifting up from the top-left of the token (opposite the sleeping Z's), growing, gently beating and fading. Turn it off per player in the *Token animations* window (Module Settings → **Choose Animations**).

## Guidance checkbox
When rolling an ability, skill, tool or initiative check (dnd5e), the roll dialog has a **Guidance** checkbox under *Situational Bonus*. Ticking it adds 1d4 to the roll; the formula preview updates straight away. GMs can remove the checkbox in Module Settings → *Guidance checkbox on ability checks*.

## Condition animations
- **Bloodied**: 3 to 5 dark-red blood splatters and a smear appear across the token art, splashing in when the creature becomes Bloodied. Each splatter has a darker edge, droplets flung outward (some stretched into tails) and a faint wet sheen that glints slowly. Each creature keeps its own pattern. They're hidden while the creature is dying or dead, like the Bloodied icon.
- **Prone**: a puff of dust kicks up along the token's base when it goes Prone and settles into a low haze with a few specks drifting down, while three faint downward chevrons over its lower half pulse in turn, top to bottom. The art itself is unchanged. Hidden while the creature is dying or dead, like the Prone icon.
- **Bleeding**: a painted streak of blood runs along the token's lower edge with drips hanging from it; drops swell at their ends, fall and splat on the ground below.
- **Poisoned**: toxic bubbles rising and popping inside the token, a low green haze and a sickly tint.
- **Burning**: a fiery aura hugs the whole token edge: soft, glowing flame licks rise and cool from pale yellow through orange to deep red, over a flickering heat glow, with a few embers and a warm flicker on the art. When its Burning is acid (picked in the status pane), the same ring turns acid green: rounder, slower froth instead of flames, drops dripping from its lower edge, and a sickly green tint on the art.
- **Restrained**: three bands of three-strand hemp rope wind across the token when the condition is applied, bowing as if wrapped around the body, casting a soft shadow and darkening where they pass behind; a small knot with a frayed hanging end; the rope tightens now and then.
- **Stunned**: a tilted ring of stars slowly circles the token's head; stars on the far side are smaller and dimmer, so the ring appears to wrap around the token.
- **Frightened**: writhing black tendrils slither in from the token's edge, curling as they stretch toward the creature and draw back; its colour drains to a cold pallor.
- **Concentrating**: two thin rings of glowing violet runes slowly turn in opposite directions just outside the token, breathing softly, with motes of light drawn inward.
- **Petrified**: the creature turns to stone. Its own art becomes warm grey stone (the picture stays recognisable, like a statue), with a granite-like grain, darker edges and chiselled cracks running in from the rim; now and then a little grit breaks off a crack and falls. Other animations still show on top. Tokens using Foundry's dynamic token rings get a heavier stone wash over the art instead, since their art is drawn by a special shader.
- **Paralyzed**: an arc of lightning crosses the token, sometimes with a fork: a white-hot core in a blue glow, humming and swaying slightly. Every second or so it fades into a new shape, with a soft blue flash on the art and a few sparks where it meets the edge.
- **Diseased**: inflamed patches with yellow pustules that swell and burst, a faint yellow-brown haze drifting up, and a sallow, jaundiced tint.
- **Incapacitated**: drained and fading. The creature's own art turns grey and it slowly fades in and out, between about 40% and 85% visible, as if it's barely there; every few seconds a faint, weak heartbeat (a soft double ring) pulses out from its edge. Tokens with dynamic token rings get a grey wash instead of grey art. It isn't shown when the creature is also Paralyzed, Petrified, Stunned or Unconscious (dnd5e makes those Incapacitated too), since those have their own animations.
- **Cursed**: a slow swirl of dark, violet-black smoke circles just outside the token's edge, in two rings turning at different speeds, with drifting motes and a faint violet sheen so it still shows on dark maps; the art is dimmed a little.
- **Marked**: a red targeting reticle over the token: a thin ring, a crosshair with a gap at the centre and a dot, and four corner brackets that close in when the mark is applied, then turn slowly while the reticle pulses gently. A dark edge keeps it readable on any art.
- **Dodging**: two blurred afterimages of the creature's own art weave from side to side and the creature itself turns slightly see-through, as if it's in several places at once (tokens with dynamic token rings get blurred outline afterimages instead).
- **Dying (0 HP)**: a player character at 0 HP that isn't dead or stable shows the same large red skull over its token, pulsing faintly; each failed death save makes the pulse a little stronger and quicker, and the creature looks slightly pale. It replaces the Unconscious Z's while the creature is dying; once it's stable (or healed) the Z's come back. At three failed death saves the pulsing stops and the skull settles, over about half a second, into the solid, full-size Dead skull, even before the Dead status is applied. **Monsters** (dnd5e NPCs that no player owns) don't make death saves: at 0 HP a monster shows the solid Dead skull straight away. Anything a player owns, such as a wild shape, a polymorph or a companion, counts as a player character. While a creature is dying or dead, its Bloodied and Prone icons are left off the token (they come back if it's stabilised or healed).
- **Dead**: the Dead icon is blood red and enlarged to fill the whole token square, centred over the art, whether Dead was set from the status palette (normally a small corner icon) or as Foundry's overlay (e.g. defeated in the combat tracker). Other status icons stay as they are. Turning it off brings back Foundry's own icon.
- **Grappled**: a painted clawed hand (bundled art) grips the creature: the forearm curls around its lower-left edge, the thumb claw hooks over the left and four claws dig over the right. The hand is a still image. It is fitted to the visible edge of each token's art (transparent borders in the token image are measured and ignored), so it sits the same way on every token whatever its size, texture scale or padding; *Grappled overlay size* (default 1) makes it larger or smaller everywhere. To use different art, set *Grappled overlay image* to any transparent PNG/WebP; clearing the image falls back to simple drawn talons.

Each can be turned off per player in the *Token animations* window (Module Settings → **Choose Animations**), where the GM also sets the Grappled overlay image and size.

## Invisible creatures: a whirl of air
An **Invisible** creature can't be seen, by anyone, unless they're looking through a creature that can see invisible creatures. Everyone sees a swirl of air where it stands instead: pale streaks spinning around it, with dust caught in them. The swirl hides the token art, name, health bar, condition icons and this module's other effects, and players can still target it.

- **Seen through a creature that can perceive it** (Truesight, Blindsight or Tremorsense in range, or a See Invisibility detection mode on its token), the creature shows in full, with its name, bars and conditions, and the swirl stays around it so it's clear it's invisible. For a player that's any creature of theirs they've selected (or, with none selected, any they own); for the GM, only a creature they've selected.
- **The GM and the token's owners** get the same rule: with no creature selected that can see invisible creatures, they see only the swirl too. They can still hover, select and right-click the token as usual.
- **Invisible and Hiding**: no swirl for anyone. Players can't see or target it at all, even on scenes without token vision, and its owners see nothing either (they can still find it by hovering over it or selecting it). The GM alone sees its swirling Hiding fog, with no art, name, bars or other effects, so they know where it is (if the GM has *Fog on creatures in cover or hiding* turned off, they see nothing too). Seen through a creature that sees invisible creatures, it shows in full under the fog, without the swirl.
- A Blinded viewer can't see the swirl.

The GM can turn this off with *Invisible and Ethereal creatures show a whirl or shimmer* in Module Settings, which brings back Foundry's normal invisibility.

## Ethereal creatures
A creature with dnd5e's **Ethereal** status works like an Invisible one, as seen from the material plane, but looks different: instead of the whirl of air, a **ghostly shimmer** marks where it stands (a cold blue glow that breathes slowly, faint violet ripples spreading out, pale wisps rising and specks of light twinkling). Everyone sees only the shimmer, and players can target it. Seen through a creature that perceives it, it shows in full, a little cold and pale, with the shimmer around it. Ethereal and Hiding is gone, and attacks against it have Disadvantage (an Ethereal attacker has Advantage) unless the other creature can see it. What sees into the Ethereal Plane differs a little from what sees Invisible creatures: **Truesight** and **See Invisibility** do, and Ethereal creatures see each other normally, but **Blindsight and Tremorsense don't**. Foundry's See Invisibility detection mode finds Ethereal creatures too.

Its own vision follows the 2024 rules for the Ethereal Plane: **black and white** (Foundry's monochromatic vision) and **no further than 60 ft**, in darkness and in lit areas alike, and it can't detect creatures beyond 60 ft by any sense (18 m on scenes measured in metres). Its vision goes back to normal as soon as the status is removed. The GM can turn the vision part off with *Ethereal creatures see in grey, up to 60 ft*; the shimmer follows *Invisible and Ethereal creatures show a whirl or shimmer*, and with that off, Ethereal creatures are simply unseen, like Foundry's own invisibility.

## Shrunk, scaled or moved tokens
Animations are drawn over the token's art where it actually appears, at its size. They follow it if the token's texture scale makes the art smaller or larger than its square, or if another module shrinks, grows or moves a token while the game runs (for example to fit several tokens in one space). The Dead skull does the same. Foundry's own small status icons are laid out by Foundry and stay where it puts them.

## Contamination (Monsters of Drakkenheim)
A **Contamination** status (swirl icon) appears in the token's status palette. It has levels 1–6. Left-click the icon to add a level and right-click to remove one. On dnd5e 6 it's a proper leveled condition like Exhaustion: the effect is named *Contamination (3)*, the palette icon shows the level as a numeral (level 6 is an aberrant eye), it appears with its level in the character sheet's conditions, and levels 4 and 5 add the *Weakened* and *Dazed* statuses. On other systems the module tracks the level itself. The effect's description summarises the symptoms of each level and the mutation, long-rest and removal rules.

**Level 4 and above: Weakened.** The Contamination effect gives the creature the Weakened status (it shows in the status palette and the pane, and comes off if the level drops below 4), and with *Advantage and Disadvantage from conditions* on, the creature's damage with weapon attacks and spells is halved automatically: each damage roll is rolled as usual, then half of each damage type is taken off (rounded down), which shows in the roll's formula, and the chat message adds *(Half damage: Weakened)*. **Level 5 and above: Dazed** is added the same way, as a reminder (moving or acting, not both, isn't automated). Contamination applied before 3.1.0 gets its Weakened and Dazed statuses the next time the GM loads the world.

**Rests** (GM setting *Contamination rest rules*, on by default; needs dnd5e's own rest and Hit Die workflow):
- **Level 2 and above:** Hit Point Dice spent during a short rest restore half as many Hit Points (rounded down).
- **Level 3 and above:** a long rest restores no Hit Points. Everything else the rest restores (Hit Point Dice, spell slots, uses) is restored as usual, and dnd5e's rest summary shows 0 Hit Points regained.
- **After every long rest** a contaminated creature rolls 1d20, posted in the chat; on a 1 it gains a level. The roll is made on the screen of whoever finished the rest.

Mutations and the Monstrous Transformation aren't applied automatically.

A contaminated token is wrapped in a slowly turning vortex of octarine light. Spiral strands curl in from outside its rim, with motes of light drawn inward along them and a violet glow that shimmers through magenta and an occasional mint glint. Each level adds strands, reaches further in, brightens the glow and deepens a violet cast over the creature.

## Monsters of Drakkenheim conditions
Nineteen statuses from *Monsters of Drakkenheim* appear in the token's status palette, each with its own icon, a short summary of its rules in the status pane and its own animation. They're listed in a section of their own at the bottom of the palette, along with Burning and Bleeding:
- **Addled**: Disadvantage on attack rolls, ability checks and saving throws that use Intelligence, Wisdom or Charisma. A thought bubble floats over its head with a tangled violet knot inside that keeps twisting, and question marks pop out of it; the art takes on a faint violet tinge.
- **Clumsy**: the same for Dexterity. It fumbles its dagger: the dagger slips out of its hand, tumbles and clatters to the ground.
- **Enfeebled**: the same for Strength. It strains to lift a barbell, trembling and sweating, then drops it with a thud; the art looks a little drained.
- **Sickened**: Disadvantage on Constitution saving throws. Puffs of sickly green fumes rise off it, flies buzz around it, and the art turns a little sallow.
- **Defenseless**: attack rolls against it have Advantage. A blue shield beside it shakes as a glowing crack runs down it, then splits in two, the halves falling apart and chips dropping out of the gap.
- **Helpless**: any attack that hits it is a Critical Hit. A white flag ripples in the wind beside it.
- **Weakened**: it deals half damage with weapon attacks and spells (halved automatically, see Contamination). Contamination level 4 gives it too. A sword at its left side goes limp and droops like a wilting flower, then perks up again.
- **Dazed**: on its turn it can move or take an action, not both, and can't take Bonus Actions (a reminder; not automated). Contamination level 5 gives it too. Little dizzy yellow birds, flapping their wings, circle its head (not when it's Shocked or Stunned, whose sparks and stars already say it).
- **Immobilized**: Speed 0, and no bonus to Speed (set automatically: dnd5e treats it like Grappled). An iron cuff at its feet is chained to a heavy iron ball; every few seconds it tries to step away, the chain snaps taut and the ball scrapes along and stops it.
- **Entangled**: Immobilized and Defenseless (both statuses come with it). Painted thorny vines burst from a mound of torn-up earth and climb the creature, with two more wrapped across it; they squeeze now and then and sway. When it ends they snap, whip back and wither, dropping their leaves.
- **Frozen**: Immobilized and Defenseless, and a bludgeoning weapon attack that hits it is a Critical Hit. The creature is frozen solid: its art turns to pale, glowing ice inside a thick ring of faceted ice with a strong cold-blue glow, with splinters flying off and frost mist rolling away. It freezes with a flash, a burst of splinters and a jolt; when it ends, cracks run across it and it shatters. (On a token ring, the art gets a cold tint and frost instead.)
- **Shocked**: Dazed and Defenseless (both come with it). Painted bolts of lightning crackle round its edge, striking a new place about three times a second, each strike's glow and sparks dying down before the next where they end; now and then a puff of smoke rises where it's been singed.
- **Jinxed (X)**: roll X and subtract it from attack rolls and saving throws. A little storm cloud rains on it (painted drops that splash on its head), and now and then drops a d20 that tumbles and lands on a 1.
- **Valor (X)**: roll X and add it to attack rolls and saving throws. A warm golden glow breathes around it and golden sparks rise from it.
- **Bewildered**: it can't cast spells, except cantrips with a casting time of an action (enforced, see below). A wand at its side lifts and its crystal starts to glow, but the spell sputters out in a puff of grey smoke and a few dying sparks.
- **Distracted**: it can't take Reactions (enforced, see below). A wide-open eye over its head keeps following a golden glint flitting about nearby, its iris sliding under the lids, and blinks now and then.
- **Staggered**: it can make no more than one weapon attack during its turn, whatever its features allow (enforced, see below). An axe at its right side swings once; then a padlock drops onto it and snaps shut, and the axe rattles but can't swing again until the lock falls open.
- **Slowed**: its Speed is halved (automatically). It gets the Slow spell's dark blue dragging outline. (*Slow*, the spell, is a separate status that does more.)
- **Drakkenheim Madness**: it gains one of ten traits of madness, rolled with 1d10 when the condition starts (see below). Dark violet tendrils curl up from behind it, and now and then it twitches.
- **Burning (X)** (dnd5e's Burning, in this section): X damage at the end of each of its turns, fire or acid, picked with the Fire and Acid buttons in the status pane (see below). A fiery aura, or with acid a green, frothing one that drips.
- **Bleeding (X)** (dnd5e's Bleeding, in this section): it loses X Hit Points at the end of each of its turns, and stops bleeding when it regains any Hit Points (see below). Dripping blood.

The animations for Clumsy, Enfeebled, Defenseless, Helpless, Dazed, Distracted, Weakened, Staggered, Sickened, Jinxed and Immobilized are painted pictures made for the module (in `images/fx`). Until a picture loads, or if it can't, the first six show a simple drawn shape and the other five show nothing.

**Setting X.** In the status pane, Jinxed, Valor, Burning and Bleeding each have a box under their name. Type a value such as *1d6*, *d8*, *2d6+1* or *3* and press Enter (Escape puts it back), or click one of the buttons for the usual dice. Burning also has **Fire** and **Acid** buttons for its damage type, apart from the box, so changing the dice keeps the type and the other way round; the name then reads *Burning (2d4 Acid)* (fire isn't written). Typing a type in the box (*2d4 cold*) still works. It's saved on the effect and shown in its name, *Valor (1d6)* (an effect with a name of its own, such as a spell's, keeps it). A Jinxed, Valor, Burning or Bleeding you've just added has its box selected, ready to type. The value is read every time it's used, so it keeps applying round after round, and changing it takes effect from the next roll. Players see the value on creatures they don't own but can't change it. Without a value, the die in the effect's name counts (*Jinxed (1d6)*), then 1d4. If a creature has several, the strongest counts.

**Burning and Bleeding** (GM setting *Burning and Bleeding at the end of each turn*): when a Burning creature's turn ends in combat, X is rolled in the chat as fire damage (or the type its X names) and applied through dnd5e, so resistances and immunities count. When a Bleeding creature's turn ends, X is rolled and that many Hit Points are lost (lost, not damage, so resistances don't count); a creature with both burns first, then bleeds. Choose *Roll in the chat only* to apply them yourself, or *Off*. They're rolled once per turn by the GM's client, only when the combat moves forward, and not for defeated creatures. With Primal Combat's side initiative, every creature on the side whose turn just ended burns and bleeds. A Bleeding creature that regains any Hit Points (healing, a rest, damage undone) stops bleeding at once, unless the setting is *Off*. The GM's browser console (F12) notes each roll, or why there wasn't one. Putting out the fire, scraping off the acid or using a healer's kit (an action, as the rules say) is up to you: remove the status.

**Bewildered, Distracted and Staggered** (GM setting *Enforce Bewildered, Distracted and Staggered*, on by default): a Bewildered creature can't cast a spell other than a cantrip with a casting time of an action; a Distracted creature can't use anything that takes a Reaction, and MidiQOL offers it no Reactions; a Staggered creature that has made a weapon attack (or unarmed strike) on its turn can't make another until its next turn (with Primal Combat's side initiative, its side's turn). Attacks outside its turn aren't limited. A player who tries is told why and nothing happens; the GM is told why and asked whether to go ahead anyway. An opportunity attack is an ordinary attack taken as a Reaction, so Distracted can't catch it: remember not to take one.

**Drakkenheim Madness** (same setting): when a creature gains it, 1d10 picks one of the book's ten traits of madness. The trait is written on the effect, so the status pane shows it, and the roll is whispered to the GM and the creature's owners. Remove and add the condition again to roll a new one.

Entangled, Frozen and Shocked show only their own animation, not Immobilized's or Defenseless's as well.

With *Advantage and Disadvantage from conditions* on, the rolls are adjusted automatically (see that section). If the system or another module already has a status with one of these IDs, that status is left exactly as it is and only the rules and animation apply to it. GMs who don't use them can hide them with **Choose Visible Statuses**. Each animation has its own box in the *Monsters of Drakkenheim* group of the Token animations window.

## Exhaustion
Exhausted tokens get fine red cracks, like bloodshot eyes, that meander in from the edge of the art with a red flush around the rim. They reach further in with each level, growing smoothly when the level changes, and the creature looks increasingly drained and flushed.

## Level counters
Like a Hearthstone minion's Attack and Health, the token shows its **Contamination** level at the lower left of its art, in an octarine gem with delerium crystals behind it, and its **Exhaustion** level at the lower right, in a blood-red drop. The number pops when it changes. The counters sit above the token's bars, and the small status icons for these two statuses are left off the token. The counters are sized to the token's portrait, so they shrink on a small token instead of covering it.

Each of these (swirl, cracks, counters) can be turned off per player in the *Token animations* window (Module Settings → **Choose Animations**).

## Advantage and Disadvantage from conditions (dnd5e)
Conditions now put Advantage or Disadvantage on rolls automatically, on top of what dnd5e already does itself. They're applied on dnd5e's last pre-roll hook, after other modules (such as MidiQOL) have set up the roll, so those can't clear them. The reasons are added to the roll's chat message, e.g. *Longsword - Attack Roll (Disadvantage: target is Dodging)*. The roll dialog's suggested button (Advantage, Normal or Disadvantage, with a bright green outline, and the one Enter rolls) is set from everything the roll has once the conditions are in, even if another module such as MidiQOL picked one earlier. You can still click another button to change the mode.

**Attack rolls**, from the attacker's conditions:
- Disadvantage when you're Blinded, Frightened, Poisoned, Prone or Restrained.
- Disadvantage when you're Grappled and attacking anyone but your grappler. This needs the Grappled effect to name the grappler as its origin.
- Advantage when you're Invisible, unless the target can perceive you. Hiding on its own doesn't count; give a hidden creature Invisible as well.

**Attack rolls**, from the target's conditions (only when exactly one creature is targeted):
- Advantage against a creature that's Paralyzed, Petrified, Restrained, Stunned, Unconscious or Blinded (unless it perceives you another way).
- Advantage against a Prone creature within 5 ft, Disadvantage from farther away.
- Disadvantage against a creature that's Invisible, unless you can perceive it (Hiding alone doesn't count).
- Disadvantage against a creature that's Dodging and can see you. Dodging doesn't count while the creature is Incapacitated or its Speed is 0.

**Ability checks:**
- Disadvantage when Frightened.
- Disadvantage when Poisoned, on every check including initiative.
- Advantage on Charisma checks against a creature you have Charmed. This needs the Charmed effect to name you as its origin.

**Saving throws:**
- Dexterity saves: Advantage while Dodging (not while Incapacitated or at Speed 0) or Hasted, and Disadvantage while Restrained. dnd5e has these rules too, but the module applies them itself as well, along with dnd5e's other condition rules (Poisoned on checks, Exhaustion, encumbrance, and Invisible, Incapacitated and Surprised on initiative), so they reach the roll either way.
- A Paralyzed, Petrified, Stunned or Unconscious creature **automatically fails** Strength and Dexterity saves. The dice are still rolled, but the roll totals −1, so any DC fails (this works with MidiQOL and dnd5e's save requests). The chat message says *Automatically fails: Paralyzed*.

**Critical Hits:** an attack that hits a Paralyzed or Unconscious creature from within 5 ft becomes a Critical Hit, so its damage is rolled as critical. Helpless (Monsters of Drakkenheim) works at any range. A hit means the roll meets the target's AC and isn't a natural 1. The attack's chat message notes *Critical Hit if it hits*.

**Monsters of Drakkenheim conditions** (added by this module, see below):
- Addled, Clumsy and Enfeebled give Disadvantage on attack rolls, checks and saves with their abilities.
- Sickened gives Disadvantage on Constitution saves.
- Defenseless gives attackers Advantage.
- Weakened (or Contamination level 4 and above) halves the creature's damage with weapon attacks and spells (any attack, or a weapon or spell item).
- Jinxed (X) adds −X to the creature's attack rolls and saving throws, and Valor (X) adds +X; X (set in the status pane) is part of the roll's formula (*−1d4[Jinxed]*) and the chat message says so. With Dice So Nice, the die rolls across the screen with the d20, including on the GM's attack rolls under MidiQOL (which otherwise throws only the d20 there).
- A bludgeoning weapon attack that hits a Frozen creature is a Critical Hit.
- Entangled and Frozen bring Defenseless (attackers have Advantage), and Shocked brings Defenseless too.
- Slowed halves the creature's Speed. Bewildered, Distracted and Staggered stop what they forbid (see *Monsters of Drakkenheim conditions*).

Whether a creature can see another is judged from conditions and special senses: Blindsight, Tremorsense, Truesight, and See Invisibility or similar detection modes on the token. Walls and lighting aren't considered, and Frightened applies whether or not the source of fear is in sight. Turn all of this off with *Advantage and Disadvantage from conditions* in Module Settings.

### Weather (with Primal Weather)
With Primal Weather on, today's weather counts on outdoor scenes too: heavy rain, heavy snow, fog and blowing sand give Disadvantage on Wisdom (Perception) checks, and strong wind on ranged weapon attacks (thrown weapons included, spell attacks not). The roll window and the chat card say why ("Heavy rain (if it relies on hearing)"), so a player can roll normally when the check doesn't rely on that sense. Which scenes are outdoors, and turning it off, are Primal Weather's settings.

## Dodging ends at the start of the creature's next turn
In combat, a creature's Dodging is removed as soon as its next turn starts, as the Dodge action says (only when the combat moves forward, not when the GM steps back a turn). With Primal Combat's side initiative, that's when its side's turn starts. The change is made by the GM's client, so it happens once even with several people connected. Outside combat, Dodging stays until it's removed. The GM can turn this off in Module Settings.

## Short save-ends effects end with the combat
When a combat ends, effects that last 1 minute or less and end on a successful saving throw (Hold Person, a poison's "save ends" and so on) are removed from every creature in it, since there are no more turns to save on. An effect counts if it has a Midi-QOL OverTime save that removes it, a DAE *isSave* special duration, or text saying it ends on a success (the effect's own description, or that of the spell or feature it came from). Its duration is the effect's own, or else its spell's or feature's. Effects with no duration (such as a status added from the palette), effects longer than a minute and effects an item carries are left alone. Made by the GM's client, only for a combat that started; the GM can turn it off in Module Settings (*Save-ends effects end with the combat*).

## Dead at 0 HP (monsters) or three failed death saves
When a **monster** (a dnd5e NPC that no player owns) drops to 0 Hit Points, it gets the **Dead** status straight away, so the big red skull shows and the combat tracker counts it as defeated. If its Hit Points go back above 0 (damage undone, or healing), the Dead status this applied comes off again.

When a **player character** (or anything a player owns) at 0 Hit Points fails its third death saving throw, it gets the Dead status. If the GM corrects the failures while it's still at 0 HP, the Dead status this applied is removed again. Healing a dead character leaves Dead alone, since bringing someone back is the GM's call.

A Dead status the GM applied by hand is never removed. The change is made by the GM's client; the GM can turn it off in Module Settings (*Dead at 0 HP (monsters) or three failed death saves*). With sounds on, a monster dropping to 0 HP plays the bell instead of the heartbeat.

## Sounds
Each player can turn on **Sounds when statuses are applied** in the Display group of the Token animations window, with a volume slider and a button to hear a sample. A short sound plays when a status lands on a creature you can see: a chime for Charmed, Hasted or Mighty Guard, a zap for Paralyzed or Stunned, a heartbeat on dropping to 0 Hit Points, a bell for Dead, a whoosh for Invisible, Ethereal or Dodging, and others (Monsters of Drakkenheim conditions included) for burning, bleeding, poison, fear, petrification, sleep, Marked and Prone. Only you hear your sounds. Nothing plays for creatures you can't see or that are unseen (Invisible, Ethereal), or for tokens set to show no animations, and a flood of statuses at once plays at most three sounds a second. The sounds are synthesised for this module by `tools/make-sounds.py`.

## One token without animations
Each token's settings (and each actor's prototype token) have **Animate this token's statuses** at the bottom of the *Appearance* tab. It's saved as soon as you tick or untick it (there's no button to press). Untick it and that token is drawn as Foundry draws it, for everyone: no animations, its own status icons, Foundry's Dead overlay, and Foundry's own invisibility (there's no whirl to show, so an Invisible creature is simply unseen). The roll rules still apply. Useful for map-sized tokens, props or a creature whose art already shows its state. Macro: `game.modules.get("primal-status").api.setAnimations(false)` on the selected tokens (`true` to turn them back on).

## The GM's choices for everyone
Animation choices are per player, but the GM can press **Give every player these choices** in the *For everyone* section of the Token animations window. Every player's animations (and the option to hide replaced icons) are set to match the GM's; connected players get a short message. Each player takes them once and can change their own again afterwards, and players who join later start with them. *Animation quality* isn't included, since it depends on each player's computer and their system's reduced-motion setting.

## Token Magic FX and Sequencer
When another module already animates a status on a token, this module leaves it to that module (no animation of its own, and the status keeps its icon), so the two don't pile up. It recognises:
- **Token Magic FX** applied through an effect change (DAE's `macro.tokenMagic`, as Convenient Effects and many effect packs use), or a Token Magic filter on the token named after the status or effect;
- **Sequencer** effects on the token whose origin is the status effect (Automated Animations' active-effect animations) or that are named after the status or effect.

Invisible and Ethereal creatures always keep their whirl or shimmer, since that is what keeps them hidden from players. The GM can turn this off with *Leave statuses other modules animate to them* in the *For everyone* section.

## Token scale
All effects size and centre themselves on the token's art as it is actually drawn (its texture scale, offset and anchor), not the grid square. A creature whose art is scaled down inside its space gets proportionally smaller effects.

## Status icons on tokens
When a status is shown by one of these animations, its small icon is left off the token so the animation isn't cluttered. Statuses without an animation keep their icons. If you turn an animation off in the *Token animations* window (Module Settings → **Choose Animations**), its icon comes back. To show all icons again, turn off *Hide status icons for animated statuses*.

## Performance
The animations are built to stay light on busy maps:
- Tokens that are off screen, or that you can't see, aren't updated until they come back into view (their animations wait where they are; hidden creatures stay hidden).
- While the animation loop runs, each creature's statuses and the module's settings are read once per frame instead of for every animation; rolls and everything else still read them fresh.
- *Animation quality* in the Token animations window: **Full**, **Reduced** (about 30 updates a second, with blurs drawn in a single pass at half resolution: easier on slower computers, a little less smooth), **Still** (each animation shown settled, without movement, and redrawn only when something about the token changes) or **Automatic** (Still if your system is set to reduce motion, otherwise Full). Hidden creatures stay hidden in every mode.

## For developers
The code lives in `src/`, one file per area (setup and settings, roll rules, the status palette and pane,
the settings windows, the animations in groups, invisibility and Ethereal, the animation loop, statuses and
Mighty Guard). `node tools/build.mjs` joins them, in name order, into `scripts/primal-status.js`, the single
file Foundry loads; edit `src/`, not that file. `bash tests/run-all.sh` runs every automated check
(see `tests/README.md`), including one that the built file is up to date. `node tools/package.mjs`
makes `dist/module.zip` and `dist/module.json` for sharing; `RELEASING.md` explains publishing them as a
GitHub release so others can install and update the module from a manifest link. What changed in each
version is in `CHANGELOG.md`.

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
