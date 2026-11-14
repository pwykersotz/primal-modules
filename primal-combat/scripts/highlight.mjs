/**
 * Hovering a carousel portrait lights up that creature's token on the canvas: Foundry's own hover (border and
 * nameplate) plus a pulsing ring, so you can pick out one goblin among six identical ones.
 */

/** @type {{token: Token, ring: PIXI.Graphics, tick: Function}|null} */
let current = null;

/**
 * Highlight a token. Clears any earlier highlight.
 * @param {Token} token
 * @param {PointerEvent} [event]
 */
export function highlightToken(token, event) {
  clearHighlight(event);
  if ( !canvas?.ready || !token || token.destroyed || !token.visible ) return;
  const canHover = token._canHover?.(game.user, event) !== false;
  if ( !canHover && !game.user.isGM ) return; // Secret tokens stay secret.

  // Foundry's own hover: border, nameplate and bars, the same as hovering a row in the sidebar tracker.
  try {
    if ( canHover ) token._onHoverIn(event ?? new PointerEvent("pointerover"), { hoverOutOthers: true });
  } catch(err) {
    console.debug("primal-combat | Token hover failed", err);
  }

  const size = Math.max(token.w, token.h);
  const radius = (size / 2) + Math.max(8, size * 0.1);
  const width = Math.max(3, size * 0.05);
  const ring = new PIXI.Graphics();
  ring.lineStyle({ width: width * 2.4, color: 0xff8a3d, alpha: 0.35 });
  ring.drawCircle(0, 0, radius);
  ring.lineStyle({ width, color: 0xffc070, alpha: 1 });
  ring.drawCircle(0, 0, radius);
  const { x, y } = token.document;
  const center = token.center;
  ring.position.set(center.x - x, center.y - y);
  ring.eventMode = "none";
  token.addChild(ring);

  const start = performance.now();
  const tick = () => {
    if ( ring.destroyed ) return;
    const phase = Math.sin(((performance.now() - start) / 1000) * Math.PI * 2 * 1.1);
    ring.scale.set(1 + (0.05 * phase));
    ring.alpha = 0.75 + (0.25 * phase);
  };
  canvas.app.ticker.add(tick);
  current = { token, ring, tick };
}

/**
 * Remove the highlight, if any.
 * @param {PointerEvent} [event]
 */
export function clearHighlight(event) {
  if ( !current ) return;
  const { token, ring, tick } = current;
  current = null;
  canvas?.app?.ticker.remove(tick);
  if ( !ring.destroyed ) {
    ring.parent?.removeChild(ring);
    ring.destroy();
  }
  try {
    if ( token && !token.destroyed && token.hover ) token._onHoverOut(event ?? new PointerEvent("pointerout"));
  } catch(err) {
    console.debug("primal-combat | Token hover-out failed", err);
  }
}
