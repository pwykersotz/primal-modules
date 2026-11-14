/* ---------- More Monsters of Drakkenheim conditions ---------- */

/*
 * Valor: a warm golden glow with rising sparks. (Shocked's lightning is in 13-fx-drakkenheim6.js,
 * Immobilized and Jinxed in 13-fx-drakkenheim5.js, Entangled's vines and Frozen's ice in
 * 13-fx-ice-and-vines.js.) Entangled and Frozen also make a creature Immobilized and Defenseless, and
 * Shocked makes it Defenseless: those show only their own animation.
 */
const isImmobilizedOnly = actor => hasStatusMatching(actor, /(^|[^a-z])immobili[sz]ed$/i) && !isEntangled(actor) && !isFrozen(actor);
const isEntangled = actor => hasStatusMatching(actor, /(^|[^a-z])entangled$/i);
const isFrozen = actor => hasStatusMatching(actor, /(^|[^a-z])frozen$/i);
const isShocked = actor => hasStatusMatching(actor, /(^|[^a-z])shocked$/i);
const isJinxed = actor => hasStatusMatching(actor, /(^|[^a-z])jinxed$/i);
const isValorous = actor => hasStatusMatching(actor, /(^|[^a-z])valou?r$/i);
/** Defenseless on its own (not as part of Entangled, Frozen or Shocked, which have their own look). */
const isDefenselessOnly = actor => isDefenseless(actor) && !isEntangled(actor) && !isFrozen(actor) && !isShocked(actor);

const DRAKK2 = {
  valor: { glow: 0xFFC94A, ray: 0xFFE8A0, spark: 0xFFF2C0, sparks: 12, riseSeconds: 2.2, tint: [1, 0.97, 0.88] }
};

/* ---------- Valor ---------- */

function createValorFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { glow: newBlur(8, 3, ADD) };
  const glow = new PIXI.Graphics(); glow.blendMode = ADD; glow.filters = [blurs.glow];
  const sparks = new PIXI.Graphics(); sparks.blendMode = ADD;
  container.addChild(glow, sparks);
  const rand = seededRandom(hashString(`${token.id ?? ""}:valor`));
  const sparkData = Array.from({ length: DRAKK2.valor.sparks }, (_, i) => ({ side: i % 2 ? 1 : -1, out: 0.85 + rand() * 0.3, phase: rand(), speed: 0.8 + rand() * 0.5, size: 0.02 + rand() * 0.02 }));
  return { container, blurs, glow, sparks, sparkData, drawnKey: "" };
}

/** A warm golden glow breathes round the creature and golden sparks rise from it. */
function updateValorFx(token, fx, { now, zoom }) {
  const V = DRAKK2.valor, art = artCircle(token);
  const r = art.r, T = now / 1000;
  const key = `${Math.round(r * 4)}`;
  if (key !== fx.drawnKey) {
    fx.glow.clear();
    fx.glow.lineStyle({ width: r * 0.16, color: V.glow, alpha: 1 });
    fx.glow.drawCircle(0, 0, r * 0.95);
    for (let k = 0; k < 8; k++) {                                        // soft rays
      const a = (k / 8) * Math.PI * 2;
      fx.glow.lineStyle({ width: r * 0.05, color: V.ray, alpha: 0.6 });
      fx.glow.moveTo(Math.cos(a) * r, Math.sin(a) * r); fx.glow.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25);
    }
    fx.drawnKey = key;
  }
  fx.blurs.glow.blur = Math.max(1, r * 0.1 * zoom);
  fx.glow.position.set(art.x, art.y);
  fx.glow.alpha = 0.4 + 0.15 * Math.sin(T * 1.4);
  fx.glow.rotation = T * 0.15;
  const g = fx.sparks;
  g.clear();
  for (const d of fx.sparkData) {
    const life = (T * d.speed / V.riseSeconds + d.phase) % 1;
    const alpha = Math.sin(Math.PI * life);
    if (alpha < 0.03) continue;
    const y = art.y + r * (0.7 - 1.6 * life);                         // up the sides, curving in over the head
    const across = Math.sqrt(Math.max(0, 1 - ((y - art.y) / (r * 1.05)) ** 2));
    const x = art.x + d.side * r * d.out * Math.max(0.25, across);
    g.beginFill(V.spark, 0.9 * alpha).drawCircle(x, y, Math.max(0.7, r * d.size)).endFill();
  }
  return { tint: V.tint, alpha: 1 };
}
