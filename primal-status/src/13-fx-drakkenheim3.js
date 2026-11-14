/* ---------- Monsters of Drakkenheim: Madness ---------- */

/*
 * (Bewildered's wand is in 13-fx-drakkenheim6.js, Distracted in 13-fx-drakkenheim4.js, Staggered in 13-fx-drakkenheim5.js.)
 * Drakkenheim Madness: dark violet tendrils curling up from behind it, and now and then a twitch.
 * Slowed shares the Slow spell's dragging outline (10-fx-core.js, isSlowed).
 */
const isBewildered = actor => hasStatusMatching(actor, /(^|[^a-z])bewildered$/i);
const isStaggered = actor => hasStatusMatching(actor, /(^|[^a-z])staggered$/i);
const isMaddened = actor => hasStatusMatching(actor, /(^|[^a-z])drakkenheim-?madness$/i);

const DRAKK3 = {
  madness: { tendril: 0x7B2FBF, edge: 0x14041F, glow: 0xC23BFF, tendrils: 6, twitchSeconds: 3.4, tint: [0.93, 0.86, 1] }
};

/* ---------- Drakkenheim Madness ---------- */

function createMadnessFx(token) {
  const ADD = PIXI.BLEND_MODES.ADD;
  const container = newFxContainer();
  const blurs = { glow: newBlur(8, 3, ADD) };
  const glow = new PIXI.Graphics(); glow.blendMode = ADD; glow.filters = [blurs.glow];
  const tendrils = new PIXI.Graphics();
  container.addChild(glow, tendrils);
  const rand = seededRandom(hashString(`${token.id ?? ""}:madness`));
  const count = DRAKK3.madness.tendrils;
  const list = Array.from({ length: count }, (_, i) => ({
    a: -Math.PI * (0.08 + 0.84 * ((i + 0.2 + rand() * 0.6) / count)),   // round the upper half
    len: 0.26 + rand() * 0.16, curl: (rand() < 0.5 ? -1 : 1) * (0.7 + rand() * 0.6), phase: rand() * 6.3, speed: 0.9 + rand() * 0.7
  }));
  const seed = hashString(`${token.id ?? ""}:twitch`);
  return { container, blurs, glow, tendrils, list, seed };
}

function updateMadnessFx(token, fx, { now, zoom }) {
  const M = DRAKK3.madness, art = artCircle(token);
  const r = art.r, T = now / 1000;
  const round = PIXI.LINE_CAP?.ROUND ?? "round";
  const g = fx.tendrils, glow = fx.glow;
  g.clear(); glow.clear();
  fx.blurs.glow.blur = Math.max(1, r * 0.1 * zoom);
  // a twitch: now and then (a different moment each cycle), everything jerks and the art flashes
  const cycle = Math.floor(T / M.twitchSeconds);
  const at = seededRandom((fx.seed + cycle * 7919) >>> 0)() * 0.7;
  const p = (T / M.twitchSeconds) % 1;
  const twitch = Math.exp(-(((p - at) * 30) ** 2));
  glow.beginFill(M.glow, 0.16 + 0.1 * Math.sin(T * 1.1) + 0.25 * twitch).drawEllipse(art.x, art.y - r * 0.55, r * 0.95, r * 0.55).endFill();
  for (const t of fx.list) {
    const writhe = Math.sin(T * t.speed + t.phase);
    const len = r * t.len * (0.85 + 0.15 * writhe) * (1 + 0.15 * twitch);
    const bx = art.x + Math.cos(t.a) * r * 0.9, by = art.y + Math.sin(t.a) * r * 0.9;
    const ox = Math.cos(t.a), oy = Math.sin(t.a), px = -oy, py = ox;
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const s = k / 10;
      const bend = t.curl * s * s * (1.2 + 0.4 * writhe) + 0.25 * Math.sin(s * 5 + T * 2 * t.speed + t.phase) * s;
      pts.push([bx + ox * len * s + px * bend * r * 0.18, by + oy * len * s + py * bend * r * 0.18]);
    }
    // tapering: drawn in pieces, thinner towards the tip
    for (let k = 1; k < pts.length; k++) {
      const s = k / (pts.length - 1), core = Math.max(0.8, r * 0.05 * (1 - 0.8 * s));
      for (const [color, width, alpha] of [[M.edge, core + Math.max(1.2, r * 0.02), 0.9], [M.tendril, core, 0.95]]) {
        g.lineStyle({ width, color, alpha: alpha * (1 - 0.35 * s), cap: round });
        g.moveTo(pts[k - 1][0], pts[k - 1][1]); g.lineTo(pts[k][0], pts[k][1]);
      }
    }
  }
  const t = M.tint.map(c => 1 - (1 - c) * (0.6 + 0.4 * twitch));
  return { tint: t, alpha: 1 };
}
