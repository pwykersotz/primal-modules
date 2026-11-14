#!/usr/bin/env bash
# Runs every automated check for Primal Status and prints a summary.
#
#   bash tests/run-all.sh            all checks
#   bash tests/run-all.sh --unit     only the Node checks (no browser needed)
#
# Needs Node 18 or newer. The browser checks also need Python 3 with Playwright:
#   pip install playwright && playwright install chromium
# Exit code is 0 only when every check passed.

set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
MOD="$root/scripts/primal-status.js"
CSS="$root/styles/primal-status.css"
LANG_FILE="$root/lang/en.json"
OUT="$here/out"
mkdir -p "$OUT"

total_pass=0
total_fail=0
failed_suites=()

# run <name> <directory> <command...>: count PASS/FAIL lines; a crash with no FAIL lines counts as a failure
run() {
  local name="$1" dir="$2"; shift 2
  local output status
  output="$(cd "$dir" && "$@" 2>&1)"; status=$?
  local p f
  p=$(grep -c '^PASS' <<<"$output" || true)
  f=$(grep -c '^FAIL' <<<"$output" || true)
  if [ "$status" -ne 0 ] && [ "$f" -eq 0 ]; then f=1; output="$output"$'\n'"FAIL $name crashed (exit $status)"; fi
  total_pass=$((total_pass + p)); total_fail=$((total_fail + f))
  if [ "$f" -gt 0 ]; then
    failed_suites+=("$name")
    printf '  %-34s %4d passed  %3d FAILED\n' "$name" "$p" "$f"
    grep '^FAIL' <<<"$output" | sed 's/^/      /'
    grep -E 'Error|at file://' <<<"$output" | head -5 | sed 's/^/      /'
  else
    printf '  %-34s %4d passed\n' "$name" "$p"
  fi
}

echo "Primal Status: automated checks"

if [ -f "$root/tools/build.mjs" ]; then
  run "build matches sources" "$root" node tools/build.mjs --check
fi

echo "Node:"
run "effects and roll rules" "$here/unit" node effects-and-rules.mjs "$MOD"
run "invisibility and Ethereal" "$here/unit" node invisibility-and-ethereal.mjs "$MOD"
run "dnd5e 6 leveled conditions" "$here/unit" node dnd5e6-conditions.mjs "$MOD"
run "libWrapper registration" "$here/unit" node libwrapper.mjs "$MOD"
run "performance and quality modes" "$here/unit" node performance.mjs "$MOD"
run "options, automation and sounds"  "$here/unit" node token-options.mjs "$MOD"
run "sharing package" "$here/unit" node package.mjs "$MOD"
run "values, Burning, combat end, ice and vines" "$here/unit" node values-and-combat.mjs "$MOD"
run "desperation attacks" "$here/unit" node desperation.mjs "$MOD"

if [ "${1:-}" != "--unit" ]; then
  if python3 -c "import playwright" 2>/dev/null; then
    echo "Browser:"
    run "status palette and hidden statuses" "$here/browser" python3 palette.py "$MOD"
    run "Guidance checkbox" "$here/browser" python3 guidance.py "$MOD"
    run "status text pane" "$here/browser" python3 status_pane.py "$MOD" "$CSS" "$LANG_FILE" srd_pages.json
    run "Token animations window" "$here/browser" python3 animations_window.py "$MOD" "$LANG_FILE"
    run "token settings box" "$here/browser" python3 token_config.py "$MOD" "$LANG_FILE"
    run "settings rows" "$here/browser" python3 settings_rows.py "$CSS" "$LANG_FILE" "$OUT/settings-rows.png"
    run "settings titles" "$here/browser" python3 settings_titles.py "$CSS" "$LANG_FILE" "$OUT/settings-titles.png"
  else
    echo "Browser: skipped (Python Playwright isn't installed)"
  fi
fi

echo
if [ "$total_fail" -eq 0 ]; then
  echo "All $total_pass checks passed."
  exit 0
else
  echo "$total_fail FAILED, $total_pass passed. Failing: ${failed_suites[*]}"
  exit 1
fi
