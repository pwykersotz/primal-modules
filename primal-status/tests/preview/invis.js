window.setupInvis = (specs, grid, gap, labelH, H, isGM) => {
  for (const [k, v] of Object.entries(window.__settingsOverride ?? {})) settings.set(k, v);
  callHook("init"); callHook("setup"); callHook("ready"); callHook("canvasReady");
  game.user.isGM = isGM;
  canvas.dimensions = { size: grid, distance: 5 };
  window.root = new PIXIMini.DisplayObject(); window.labels = [];
  let px = gap;
  specs.forEach((s, i) => {
    const size = grid * (s.cells ?? 1);
    const t = new Token("tok" + i, s.statuses, 0, size, s.scale ?? 1);
    t.art = ringArt(size, s.art); t.mesh.texture = new PIXI.Texture(t.art);
    t.actor.statuses = new Set(s.statuses);
    t.position.set(px + (grid * 1.6 - size) / 2, (H - labelH - size) / 2);
    px += grid * 1.6 + gap;
    root.addChild(t); canvas.tokens.placeables.push(t);
    labels.push({ text: s.label, x: t.position.x + size / 2, y: H - 10 });
  });
};
