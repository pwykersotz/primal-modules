# Primal Mounts

Mounted combat for the D&D 5e system on Foundry VTT v14 (v13 should also work).

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

## Mounting

1. Drag a creature's token onto a larger creature (or drag the larger creature under it).
2. The Token HUD opens with a pulsing **horse** button. Click it.
3. Choose **Controlled** or **Independent**.

The smaller creature always becomes the rider. By default the mount must be at least one size larger (the 2024
and 2014 rule). You can turn that off in the settings.

While mounted, the two tokens act as one:

- The rider is drawn smaller on the centre of its mount. Click the middle to select the rider, or the edge to
  select the mount.
- Drag either token and both move together along the same path.
- A small **saddle badge** sits on the mount's top-left corner: gold for a controlled mount, grey for an
  independent one. The Mounted and Ridden effects are still on the character sheets, but they don't draw
  icons on the tokens.

To get off, open either token's HUD and click **Unmount** (the walking-figure button). The rider steps to the
nearest free space next to the mount.

The mounted HUD also has these buttons:

- **Controlled / Independent toggle.** Switches how the mount acts.
- **Falling figure.** Rolls the rider's DC 10 Dexterity save to stay on when an effect moves the mount against
  its will. This can't be detected automatically, so use this button.

## Rules applied automatically

| Rule | What the module does |
| --- | --- |
| Mount must be one size larger | Mount button only offered (or allowed) when it is |
| Mounting/dismounting costs half Speed | Chat card states the cost from the rider's own Speed (Foundry does not track remaining movement) |
| The rider moves at its mount's speeds | While mounted, the rider's speeds (walk, fly, swim, climb, burrow) are the mount's final speeds, after the mount's own conditions and bonuses. They follow the mount's changes and revert on dismounting. The rider's jump stays its own |
| Controlled mount: initiative matches the rider's | Mount's initiative is set to the rider's minus 0.01 so it acts right after them, and kept in sync when the rider's initiative changes |
| Controlled mount: only Dash, Disengage, or Dodge | Warns (or blocks, per setting) when a controlled mount uses another action in combat |
| Independent mount | Keeps its own initiative. Players can't steer it by dragging the rider; the GM can |
| Rider or mount knocked Prone (2024), rider Prone (2014) | Rider rolls a DC 10 Dexterity save. On a failure they are dismounted and land Prone in a free space within 5 ft |
| Mount knocked Prone (2014) | Rider is dismounted Prone, with a chat button to land on their feet if they used their reaction |
| Mount dies / goes down | Treated like the mount falling Prone |
| Flying (dnd5e 6+ falling) | A rider always shares its mount's elevation and is held up by it: it is Falling only if the mount is. A flying mount keeps its rider aloft; a mount that can't fly falls, rider and all. Clicking to plummet a falling rider brings the mount down with the rider on it |
| Mounted Combatant: Mounted Strike | Advantage on the attack roll (2024: any attack against an unmounted creature within 5 ft of the mount and at least one size smaller than it; 2014: melee attacks against an unmounted creature smaller than the mount) |
| Mounted Combatant: Leap Aside | Mount takes no damage on a successful Dex save for half, half on a failure (with Midi-QOL: via `flags.midi-qol.superSaver.dex` on the mount) |
| Mounted Combatant: Veer (2024) / redirect (2014) | When an attack hits the mount, the rider's owner gets a chat button. Clicking it sends the next damage applied to the mount to the rider instead. In 2014 mode the roll is compared to the rider's AC |

The Mounted Combatant feat is recognised by its identifier `mounted-combatant` or its name.

## Overlapping tokens (not mounted)

- The smaller token is always drawn and clickable on top of a larger token it overlaps. A connected GM keeps
  the stacking order.
- Same-size tokens stacked on one spot, at any elevation, are drawn smaller and fanned out so each one is
  visible and clickable. Each player only sees this for tokens they can see.
- A raised token over a smaller token keeps the higher token on top, as its elevation says. The raised token
  turns see-through, so the token below shows. Clicks over the lower token's square select it. Hover the
  raised token to see it solid. Each player can set the opacity, and 1 turns this off.

## Settings

World settings:

- Rules version (2024 by default)
- Size rule
- Whether players can mount creatures they don't own
- Whether to ask controlled or independent
- Controlled mount action limit
- Fall-save handling (roll automatically, prompt the owner, or reminder only)
- Remove Prone when the rider keeps their seat
- Mounted Combatant automation
- Smaller tokens on top
- Chat cards

Per-player settings:

- Open the HUD after dropping onto a creature
- Fan out stacked same-size tokens
- Rider size on a mount

## Notes and limits

- One rider per mount.
- Mounting a token you don't own needs a GM connected, because the GM's client makes the change.
- Veer works by catching the next damage application to the mount. If Midi-QOL applies damage automatically
  before the rider clicks the button, apply the damage to the rider by hand.
- Macro API: `game.modules.get("primal-mounts").api`. It provides `getPair`, `mountCandidates`, `mount`,
  `unmount`, `toggleControl` and `fallCheck`.

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
