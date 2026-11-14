# Primal Auras

Token auras for Foundry VTT (v13 and v14) that you switch on and off from the Token HUD, draw as a
**circle**, as **grid spaces** or as a **donut**, colour however you like, and optionally hook up to
**saving throws, conditions, buffs, debuffs, damage and healing**. Auras can be saved to a **library**
and attached to a character's **abilities, spells and items** so they follow the character everywhere.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

D&D 5e (2014 and 2024 rules) is supported natively. PF2e saves work, and every other system falls back
to configurable formulas.

---

## Quick start

1. Enable **Primal Auras** in *Manage Modules*.
2. Right-click a token you own to open its HUD and click the **Auras** button (a dot inside a solid ring and a dashed outer ring).
3. Click **New aura** (or pick one from the library dropdown and press **+**).

Each aura in the palette has:

| Control | What it does |
| --- | --- |
| Toggle switch | Turn the aura on / off |
| **Range** | How far it reaches (scene units, e.g. feet) |
| **Hole** | Inner radius. Anything above 0 turns the aura into a **donut** |
| Colour swatch | Sets fill and border colour together |
| Circle / grid icon | Swap between a true circle and grid spaces in one click |
| Gear | Full configuration (colours, opacity, visibility, effects…) |

**Right-click** the Auras button to switch all of the token's auras off (or back on).

## Shapes

* **Circle** – a true radius, measured from the token's edge (default) or its centre.
* **Grid spaces** – highlights every space within range of the spaces the token occupies, counting
  diagonals exactly like your scene does (5/5/5, 5/10/5, Euclidean, …). Works on square and hex grids.
* **Donut** – set a *Hole* above 0 on either shape, e.g. range 10 / hole 5 shows only the reach ring.

Need every aura as one shape for a particular table or scene? *Settings → Force aura shape* switches all
auras to circles or grid spaces at once (and the GM can bind a key to cycle it under *Configure Controls*).
Gridless scenes always draw circles.

## Appearance and visibility

In the configuration window: fill colour and opacity, border colour, opacity and width, who can see it
(everyone, owners and GM, GM only) and when (always, on hover/selection, when selected, only in combat).
*Blocked by walls* clips the aura with movement-blocking walls and stops it affecting tokens behind them.

Each player can hide auras for themselves with *Settings → Show auras* or a keybinding.

## Effects

An aura with no effects is purely visual. Add effects on the **Effects** tab. There are two kinds:

### While inside (continuous)
Buffs, debuffs and conditions that apply as long as a creature is in the aura and disappear the moment
it leaves (or the aura switches off, or the source is defeated). Example: *Aura of Protection*.
Same-named effects from several sources don't stack – the strongest wins – unless you tick *Stacks*.

### Triggered
Resolved at the moments you choose:

* enters the aura / leaves the aura
* starts its turn inside / ends its turn inside
* at the start / end of the source's turn (hits everyone inside)

Tick *Those inside when it switches on count as entering* (Appearance tab) to give creatures already in the
aura its "enters" effects the moment it appears, the way a spell's area works on casting.

With **Primal Combat's side initiative**, a turn belongs to the whole acting side: "starts / ends its turn inside"
and turn-based durations apply to every creature on that side, not only the first.

…with an optional **saving throw** (ability, DC as a number or formula, and *half damage* or *no effect*
on a success), **damage** (with type, so resistances apply in 5e), **healing** or temporary HP,
**conditions** and **modifiers**, plus how long the conditions/modifiers last (until removed, until the
start/end of the target's or source's next turn, or a number of rounds). *At most once per turn*
prevents double-dipping (e.g. 2024 Spirit Guardians). A chat card summarises each result.

Both kinds can target **enemies**, **allies**, **everyone** or **only the source**, with an option to
include the source itself.

### Formulas and modifiers
Formulas and modifier values can use `@` data, which is read from the **aura's source**, not the target:

* DC: `@attributes.spell.dc`, `8 + @prof + @abilities.cha.mod`
* Damage: `3d8`, `2d6 + @abilities.wis.mod`
* Modifier: key `system.bonuses.abilities.save`, type *Add*, value `max(1, @abilities.cha.mod)`

Modifier keys are ordinary Active Effect keys for your system (e.g. `system.attributes.ac.bonus`,
`system.attributes.movement.walk`, `system.bonuses.mwak.attack` in D&D 5e).

### Saving throws
With *Players roll their own saves* on, the owning player gets the normal roll dialog; if they don't
answer within the timeout (default 30 s) the GM's client rolls for them. NPC saves are rolled by the GM.

## Aura library (presets)

Open it from the HUD palette (book icon), *Settings → Aura library*, or the API. You can create, edit,
duplicate, delete, **import/export JSON**, add a preset to every selected token, and restore the
shipped presets:

Aura of Protection · Spirit Guardians · Aura of Dread · Stench · Burning Aura · Regenerative Aura ·
Aura of Blessing · Chilling Field · Reach Ring (donut) · Range Marker

The *Save to library* button in any aura's configuration copies that aura into the library.

## Abilities, spells and items

Auras stored on an item are projected by every token of the character that owns it, in every scene.
Open them from the **Auras** button in an item sheet's header, or from the HUD palette (wand icon) → pick
the ability. For each item aura choose:

* **Active**: always on (passive features), while equipped (magic items), or manual.
* **Switch on when used** – using the item (casting the spell, activating the feature) turns it on.
* **Ends with concentration** – turns off when concentration on that spell ends.

The shipped *Spirit Guardians* preset is set up this way: add it to the spell, cast the spell, and the
aura switches on; drop concentration and it switches off.

## Settings

| Setting | Default |
| --- | --- |
| Show auras (per user) | on |
| Default shape for new auras | circle |
| Force aura shape | per aura |
| A creature is inside an aura when | any part of its space is inside |
| Moving through an aura counts as entering it | on |
| Account for elevation | off |
| Automate aura effects | on |
| Ignore defeated tokens | on |
| Players roll their own saves / timeout | on / 30 s |
| Expire timed aura effects | on |
| Aura chat cards | everyone |
| Saving throw formula / hit point path (other systems) | `1d20 + @abilities.{ability}.mod` / `system.attributes.hp.value` |

## Macro API

```js
const auras = game.modules.get("primal-auras").api;
const tok = canvas.tokens.controlled[0];

await auras.addPreset(tok, "Aura of Protection");          // from the library (by name or id)
await auras.addAura(tok, { name: "Threat", radius: 10, innerRadius: 5, shape: "grid", fillColor: "#ff0000" });
await auras.toggleAura(tok, "Threat");                     // or toggleAura(tok, "Threat", true)
await auras.setRange(tok, "Threat", 15, 5);                // range, optional hole
await auras.setShape(tok, "Threat");                       // swap circle/grid, or pass "circle"/"grid"
auras.tokensInAura(tok, "Threat");                         // TokenDocuments inside
auras.isInAura(otherToken, tok, "Threat");                 // boolean
await auras.addPreset(actor.items.getName("Spirit Guardians"), "Spirit Guardians"); // onto an item
auras.openPresetLibrary();
auras.openItemAuras(item);
```

## How it works / limits

* Automation runs on the **GM's** client, so a GM must be connected for effects to apply. Drawing works
  for everyone regardless.
* Entering and leaving are checked when a token finishes a move (and whenever auras change). A creature that
  passes through an aura on the way and ends outside it also gets its "Enters the aura" effects, then its "Leaves
  the aura" ones, and so do creatures an aura passes over as its source moves. Points along the path are checked
  every half grid space; teleports and undoing a move don't count. A setting turns this off.
* With Primal Combat, who starts and ends a turn (a whole side, in side initiative) comes from its turn signal.
* Wall blocking for effects is evaluated on the scene the GM is viewing.
* Effects are created as normal Active Effects flagged by this module, so they show on sheets and token
  icons and are removed automatically when no longer valid.
* Turning *Automate aura effects* off removes all "while inside" effects from the current scene.

Tests (plain Node, no Foundry): `node --test tests/automation.test.mjs tests/passthrough.test.mjs tests/geometry.test.mjs`. They cover who starts and ends a turn, passing through an aura, and who's inside: grid and circle shapes, donuts, large creatures, diagonals, elevation, levels and who an effect affects.

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
