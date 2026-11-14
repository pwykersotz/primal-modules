# Tests

Automated checks for Primal Status. They run the module against small stand-ins for Foundry,
PIXI and dnd5e, so they don't need Foundry itself.

    bash tests/run-all.sh          # everything
    bash tests/run-all.sh --unit   # only the Node checks

Requirements: Node 18+. The browser checks (status palette, status pane, settings windows) also need
Python 3 with Playwright: `pip install playwright && playwright install chromium`.

- `unit/` Node checks: animations, roll rules, invisibility and Ethereal, dnd5e 6 conditions, libWrapper,
  performance and quality modes, per-token options, the GM's choices for everyone, Token Magic FX and Sequencer,
  Dodging expiry, Dead at three failed death saves, sound cues, the sharing package (tools/package.mjs),
  statuses with values, Burning, combat-end cleanup, and desperation attacks (desperation.mjs).
- `browser/` checks that need a real browser page (layout, windows, the status pane, the token settings box).
- `preview/` the renderer used to make the animation preview GIFs (`render.py`).
- `tools/bench.mjs` times the animation loop: `node tests/tools/bench.mjs scripts/primal-status.js`.

What these can't check is how things look and behave inside Foundry itself; that's what the
verification checklist is for.
