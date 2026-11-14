// A tiny Canvas2D stand-in for the parts of PIXI 7 the module uses, so the module's real
// animation code can be rendered and previewed in a browser.
(() => {
  const ADD = 1;
  class Point { constructor(o, x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = (y ?? x); } }
  class DisplayObject {
    constructor() {
      this.children = []; this.parent = null; this.destroyed = false;
      this.position = new Point(this); this.scale = new Point(this, 1, 1); this.pivot = new Point(this);
      this.rotation = 0; this.alpha = 1; this.visible = true; this.blendMode = 0; this.filters = null;
      this.zIndex = 0; this.sortableChildren = false;
    }
    get x() { return this.position.x; } set x(v) { this.position.x = v; }
    get y() { return this.position.y; } set y(v) { this.position.y = v; }
    addChild(...cs) { for (const c of cs) { c.parent?.removeChild(c); c.parent = this; this.children.push(c); } return cs[0]; }
    addChildAt(c, i) { c.parent?.removeChild(c); c.parent = this; this.children.splice(i, 0, c); return c; }
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parent = null; return c; }
    removeChildren() { const cs = this.children; this.children = []; cs.forEach(c => c.parent = null); return cs; }
    getChildIndex(c) { return this.children.indexOf(c); }
    sortChildren() {}
    destroy(o) { this.destroyed = true; if (o?.children) [...this.children].forEach(c => c.destroy(o)); this.parent?.removeChild(this); }
  }
  class Graphics extends DisplayObject {
    constructor() { super(); this.cmds = []; }
    clear() { this.cmds = []; return this; }
  }
  for (const m of ["lineStyle", "beginFill", "endFill", "moveTo", "lineTo", "bezierCurveTo", "arc", "closePath",
    "drawCircle", "drawEllipse", "drawPolygon", "drawRect", "drawRoundedRect"]) {
    Graphics.prototype[m] = function (...a) { this.cmds.push([m, a]); return this; };
  }
  class Text extends DisplayObject {
    constructor(text, style) { super(); this.text = text; this.style = style; this.anchor = new Point(this); }
  }
  class TextStyle { constructor(o) { Object.assign(this, o); } }
  let texUid = 0;
  class Rectangle { constructor(x = 0, y = 0, width = 0, height = 0) { Object.assign(this, { x, y, width, height }); } }
  // new Texture(image), or new Texture(baseTexture, frame) for part of a picture
  class Texture {
    constructor(src, frame) {
      const base = src?.resource ? src : null, img = base ? base.resource.source : src;
      this.image = img;
      this.baseTexture = base ?? { valid: true, uid: ++texUid, resolution: 1, resource: { source: img } };
      const fullW = img?.naturalWidth || img?.width || 1, fullH = img?.naturalHeight || img?.height || 1;
      this.frame = frame ?? { x: 0, y: 0, width: fullW, height: fullH };
      this.width = this.frame.width; this.height = this.frame.height;
    }
    static from(src) { const i = new Image(); i.src = src; return new Texture(i); }
  }
  class Sprite extends DisplayObject { constructor(tex) { super(); this.texture = tex; this.anchor = new Point(this); this.tint = 0xFFFFFF; } }
  class ColorMatrixFilter { constructor() { this.matrix = [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0]; } destroy() {} }
  class BlurFilter { constructor(s = 8) { this.blur = s; this.blendMode = 0; } destroy() {} }

  window.PIXI = {
    Container: DisplayObject, Graphics, Text, TextStyle, BlurFilter, Sprite, Texture, Rectangle, ColorMatrixFilter,
    BLEND_MODES: { NORMAL: 0, ADD }, LINE_CAP: { ROUND: "round" }, LINE_JOIN: { ROUND: "round" },
    UPDATE_PRIORITY: { NORMAL: 0 }
  };

  const css = (color, alpha = 1) => `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;

  const mulTint = (c, t) => (t === undefined || t === 0xFFFFFF) ? c :
    ((Math.round(((c >> 16) & 255) * ((t >> 16) & 255) / 255) << 16) | (Math.round(((c >> 8) & 255) * ((t >> 8) & 255) / 255) << 8) | Math.round((c & 255) * (t & 255) / 255));
  function drawGraphics(g, ctx) {
    let fill = null, line = { width: 0 }, open = false;
    const flush = () => {
      if (!open) return;
      if (fill) { ctx.fillStyle = css(mulTint(fill.color, g.tint), fill.alpha); ctx.fill(); }
      if (line.width > 0) {
        ctx.lineWidth = line.width; ctx.strokeStyle = css(mulTint(line.color ?? 0, g.tint), line.alpha ?? 1);
        ctx.lineCap = line.cap ?? "butt"; ctx.lineJoin = line.join ?? "miter"; ctx.stroke();
      }
      ctx.beginPath(); open = false;
    };
    ctx.beginPath();
    for (const [m, a] of g.cmds) {
      switch (m) {
        case "lineStyle": flush(); line = typeof a[0] === "object" ? { ...a[0] } : { width: a[0] ?? 0, color: a[1], alpha: a[2] }; break;
        case "beginFill": flush(); fill = { color: a[0] ?? 0, alpha: a[1] ?? 1 }; break;
        case "endFill": flush(); fill = null; break;
        case "moveTo": if (!open) ctx.beginPath(); ctx.moveTo(a[0], a[1]); open = true; break;
        case "lineTo": ctx.lineTo(a[0], a[1]); open = true; break;
        case "bezierCurveTo": ctx.bezierCurveTo(...a); open = true; break;
        case "arc": ctx.arc(a[0], a[1], a[2], a[3], a[4], !!a[5]); open = true; break;
        case "closePath": ctx.closePath(); break;
        case "drawCircle": flush(); ctx.arc(a[0], a[1], Math.abs(a[2]), 0, Math.PI * 2); open = true; flush(); break;
        case "drawEllipse": flush(); ctx.ellipse(a[0], a[1], Math.abs(a[2]), Math.abs(a[3]), 0, 0, Math.PI * 2); open = true; flush(); break;
        case "drawRect": flush(); ctx.rect(a[0], a[1], a[2], a[3]); open = true; flush(); break;
        case "drawRoundedRect": flush(); ctx.roundRect(a[0], a[1], a[2], a[3], a[4] ?? 0); open = true; flush(); break;
        case "drawPolygon": {
          flush(); const p = Array.isArray(a[0]) ? a[0] : a;
          ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
          ctx.closePath(); open = true; flush(); break;
        }
      }
    }
    flush();
  }

  function drawText(t, ctx) {
    const s = t.style; const fs = s.fontSize ?? 26;
    ctx.font = `${s.fontWeight ?? "normal"} ${fs}px DejaVu Sans, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let fillStyle = s.fill;
    if (Array.isArray(s.fill)) { const gr = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2); s.fill.forEach((c, i) => gr.addColorStop(i / (s.fill.length - 1), c)); fillStyle = gr; }
    if (s.dropShadow) { ctx.shadowColor = s.dropShadowColor; ctx.shadowBlur = s.dropShadowBlur ?? 0; }
    if (s.strokeThickness) { ctx.lineWidth = s.strokeThickness; ctx.strokeStyle = s.stroke; ctx.lineJoin = "round"; ctx.strokeText(t.text, 0, 0); }
    ctx.shadowBlur = 0; ctx.fillStyle = fillStyle; ctx.fillText(t.text, 0, 0);
  }

  function makeLayer(main) { const c = document.createElement("canvas"); c.width = main.canvas.width; c.height = main.canvas.height; return c.getContext("2d"); }

  function renderNode(o, ctx) {
    if (!o.visible || o.alpha <= 0 || o.destroyed) return;
    ctx.save();
    ctx.translate(o.position.x, o.position.y); ctx.rotate(o.rotation); ctx.scale(o.scale.x, o.scale.y); ctx.translate(-o.pivot.x, -o.pivot.y);
    const blur = (o.filters ?? []).find(f => f instanceof BlurFilter);
    const blend = blur ? (blur.blendMode || o.blendMode) : o.blendMode;
    const layered = blur || o.children.length && (o.alpha < 1 || blend === ADD);
    const target = layered ? makeLayer(ctx) : ctx;
    if (layered) target.setTransform(ctx.getTransform());
    else { ctx.globalAlpha *= o.alpha; if (blend === ADD) ctx.globalCompositeOperation = "lighter"; }
    if (o instanceof Graphics) drawGraphics(o, target);
    if (o instanceof Text) drawText(o, target);
    if (o instanceof Sprite && o.texture?.image) {
      const tx = o.texture, w = tx.width, h = tx.height, ax = o.anchor.x * w, ay = o.anchor.y * h, f = tx.frame;
      const paint = (c, x, y) => c.drawImage(tx.image, f.x, f.y, w, h, x, y, w, h);
      const cmf = (o.filters ?? []).find(f => f instanceof ColorMatrixFilter);
      if (cmf) {
        // silhouette recoloured to the matrix's constant colour (as the module's glow uses it)
        // apply the colour matrix per pixel, like PIXI (offsets 0–1, on un-premultiplied colour)
        const m = cmf.matrix;
        const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
        paint(x, 0, 0);
        const img = x.getImageData(0, 0, w, h), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, g = d[i+1] / 255, b = d[i+2] / 255, a = d[i+3] / 255;
          const out = k => Math.max(0, Math.min(1, m[k]*r + m[k+1]*g + m[k+2]*b + m[k+3]*a + m[k+4]));
          d[i] = out(0) * 255; d[i+1] = out(5) * 255; d[i+2] = out(10) * 255; d[i+3] = out(15) * 255;
        }
        x.putImageData(img, 0, 0);
        target.drawImage(c, -ax, -ay);
      } else if ((o.tint ?? 0xFFFFFF) !== 0xFFFFFF) {
        const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
        paint(x, 0, 0); x.globalCompositeOperation = "multiply"; x.fillStyle = css(o.tint); x.fillRect(0, 0, w, h);
        x.globalCompositeOperation = "destination-in"; paint(x, 0, 0);
        target.drawImage(c, -ax, -ay);
      } else paint(target, -ax, -ay);
    }
    if (o.drawSelf) o.drawSelf(target);
    const kids = o.sortableChildren ? [...o.children].sort((a, b) => a.zIndex - b.zIndex) : o.children;
    for (const c of kids) renderNode(c, target);
    if (layered) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha *= o.alpha; ctx.globalCompositeOperation = blend === ADD ? "lighter" : "source-over";
      if (blur) ctx.filter = `blur(${Math.max(0, blur.blur * 0.5)}px)`;
      ctx.drawImage(target.canvas, 0, 0); ctx.restore();
    }
    ctx.restore();
  }
  window.renderScene = (root, ctx) => renderNode(root, ctx);
  window.PIXIMini = { DisplayObject };
})();
