/**
 * Checks who can end a turn by clicking a carousel portrait (scripts/carousel.mjs), run with
 * `node tests/carousel-click.test.mjs`.
 */
import assert from "node:assert/strict";

const settings = { defaultMode: "standard" };
globalThis.game = { settings: { get: (m, k) => settings[k] }, user: { isGM: false } };
globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1, SECRET: -2 } };
globalThis.foundry = {
  utils: { debounce: fn => fn },
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: Base => class extends Base {} } }
};
const { canEndTurnByClick } = await import(new URL("../scripts/carousel.mjs", import.meta.url).href);

const combat = { round: 1, turn: 0, flags: {}, get started() { return this.round > 0; }, getFlag(m, k) { return this.flags[k]; } };
const mine = { id: "mine", parent: combat, isOwner: true };
const theirs = { id: "theirs", parent: combat, isOwner: false };
combat.turns = [mine, theirs];
Object.defineProperty(combat, "combatant", { get() { return this.turns[this.turn]; } });

assert.equal(canEndTurnByClick(mine), true, "a player's own portrait on their turn");
assert.equal(canEndTurnByClick(theirs), false, "someone else's portrait");
combat.turn = 1;
assert.equal(canEndTurnByClick(mine), false, "not their turn");
combat.turn = 0;
game.user.isGM = true;
assert.equal(canEndTurnByClick(mine), false, "the GM's click still goes to the token");
game.user.isGM = false;
combat.flags.mode = "side";
assert.equal(canEndTurnByClick(mine), false, "side initiative marks done instead");
combat.flags.mode = "standard";
combat.round = 0;
assert.equal(canEndTurnByClick(mine), false, "combat hasn't started");

console.log("carousel click: all checks passed");
