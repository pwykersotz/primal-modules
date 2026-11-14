# Primal Monster Blocks

An NPC sheet that looks like a printed D&D 5e monster stat block, for Foundry V14 and dnd5e 6.x.

> **Made with AI.** The port to Foundry V14 and the changes since were written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

## Where it comes from

This is a port of [Monster Blocks](https://github.com/zeel01/MonsterBlocks) by zeel (Josh Olsen), which stopped at older Foundry and dnd5e versions. The original is MIT licensed, and so is this port: see [LICENSE](LICENSE). Please report problems with this version here, not to zeel.

It has its own id (`primal-monster-blocks`), so it can't be overwritten by an update of the original `monsterblock` module.

## What's different from the original

- Rebuilt on ApplicationV2 for Foundry V14 and dnd5e 6.x.
- Manual hit point controls on the sheet.
- An "Attack modifiers" line under Actions in edit mode: a to-hit bonus and a damage bonus for all attacks.
- Deleting a feature, action or spell asks first (a world setting, on by default).
- The window fits its columns properly, so stat blocks are no longer cut off when a column collapses.

From an NPC's sheet, use the dragon button in the window header to switch to Monster Blocks. Quick settings are in the cog menu in the sheet's upper left corner.

## Made with AI

The original Monster Blocks was written by zeel. The port to Foundry V14 and everything added since was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code changes from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
