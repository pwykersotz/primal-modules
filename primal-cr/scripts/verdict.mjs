/**
 * Turn the simulation's numbers into one of five danger levels.
 *
 * - Impossible: the party wins fewer than 1 fight in 10.
 * - Boss:       there's a real chance everyone goes down.
 * - Hard:       the party wins, but there's a real chance a character drops to 0 HP.
 * - Medium:     the party wins with a bit of trouble (it loses a fair share of its hit points).
 * - Easy:       the party wins without trouble.
 */
export const LEVELS = ["easy", "medium", "hard", "boss", "impossible"];

/** The default thresholds, as fractions. Each can be changed in the module's settings. */
export const DEFAULT_THRESHOLDS = Object.freeze({
  impossible: 0.10, // win chance below this
  boss: 0.10,       // chance of the whole party going down at or above this
  hard: 0.20,       // chance of at least one character dropping at or above this
  medium: 0.25      // share of the party's hit points lost at or above this
});

/**
 * @param {object} result       From simulate().
 * @param {object} [thresholds]
 * @returns {{level: string, reason: string, index: number}|null}  Null when there was no fight to judge.
 */
export function judge(result, thresholds = DEFAULT_THRESHOLDS) {
  if ( !result || !result.runs ) return null;
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  let level;
  let reason;
  if ( result.win < t.impossible ) {
    level = "impossible";
    reason = "win";
  } else if ( result.wipe >= t.boss ) {
    level = "boss";
    reason = "wipe";
  } else if ( result.drop >= t.hard ) {
    level = "hard";
    reason = "drop";
  } else if ( result.hpLost >= t.medium ) {
    level = "medium";
    reason = "hpLost";
  } else {
    level = "easy";
    reason = "none";
  }
  return { level, reason, index: LEVELS.indexOf(level) };
}

/** A fraction as a whole percentage, with "<1%" and ">99%" for the ends that aren't quite 0 or 100. */
export function percent(fraction) {
  if ( !Number.isFinite(fraction) ) return "–";
  if ( fraction <= 0 ) return "0%";
  if ( fraction >= 1 ) return "100%";
  if ( fraction < 0.01 ) return "<1%";
  if ( fraction > 0.99 ) return ">99%";
  return `${Math.round(fraction * 100)}%`;
}

/**
 * The rulebook's own measure, for comparison: the enemies' XP against the party's XP budgets.
 * @param {number[]} levels            Each character's level.
 * @param {number} xp                  The enemies' XP, added up.
 * @param {number[][]} table           XP budgets per character by level: [low, moderate, high].
 * @returns {{level: "none"|"low"|"moderate"|"high"|"beyond", xp: number, budgets: number[]}|null}
 */
export function bookDifficulty(levels, xp, table) {
  if ( !levels?.length || !Array.isArray(table) ) return null;
  const budgets = [0, 0, 0];
  for ( const level of levels ) {
    const row = table[Math.min(20, Math.max(1, Math.round(level)))] ?? [0, 0, 0];
    for ( let i = 0; i < 3; i++ ) budgets[i] += row[i] ?? 0;
  }
  if ( !budgets[2] ) return null;
  let level = "none";
  if ( xp > budgets[2] ) level = "beyond";
  else if ( xp > budgets[1] ) level = "high";
  else if ( xp > budgets[0] ) level = "moderate";
  else if ( xp > 0 ) level = "low";
  return { level, xp, budgets };
}
