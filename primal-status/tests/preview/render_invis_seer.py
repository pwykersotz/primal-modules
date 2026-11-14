import sys, io, os, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
mod, out = sys.argv[1], sys.argv[2]
N1 = {"r":0.495,"ring":0.07,"ringColor":"#7a6a55","hue":30}
PAD = {"r":0.4,"ring":0.06,"ringColor":"#5b2fa8","hue":20,"fur":True,"smoke":True,"dy":-0.02}
specs = [{"label":"Ordinary","statuses":[],"art":N1},{"label":"Invisible","statuses":["invisible"],"art":N1},
         {"label":"Invisible + Poisoned","statuses":["invisible","poisoned"],"art":PAD,"scale":1.1},{"label":"Invisible + Hiding","statuses":["invisible","hiding"],"art":N1}]
grid, gap, labelH = 120, 16, 24
W = int(gap + len(specs) * (grid * 1.6 + gap)); H = 240
times = [6000 + i * 1000 / 15 for i in range(36)]
def render(isGM, seer=False):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("file://" + os.path.abspath("blank.html"))
        pg.set_content(f"<html><body style='margin:0'><canvas id=c width={W} height={H}></canvas></body></html>")
        for f in ["minipixi.js", "scene.js", "sizes.js", "invis.js"]: pg.add_script_tag(path=f)
        pg.add_script_tag(path=mod)
        pg.evaluate("window.__bg = '#5b5346'")
        pg.evaluate(f"setupInvis({json.dumps(specs)}, {grid}, {gap}, {labelH}, {H}, {'true' if isGM else 'false'}); window.ctx = document.getElementById('c').getContext('2d');")
        if seer: pg.evaluate("canvas.tokens.controlled = [{ id: 'seer', actor: { statuses: new Set(), effects: [], system: { attributes: { senses: { ranges: { truesight: 9999 } } } } }, document: { x: 0, y: 0, width: 1, height: 1, elevation: 0, detectionModes: {} } }]")
        pg.evaluate("frame(100, ctx)")
        frames = []
        for t in times:
            pg.evaluate(f"frame({t}, ctx)")
            frames.append(Image.open(io.BytesIO(pg.locator('#c').screenshot())).convert("RGB"))
        if errs: print("ERRORS", errs[:3])
        b.close()
        return frames
rows = [("Player, ordinary sight", render(False)), ("Player whose creature sees invisible (Truesight / See Invisibility)", render(False, True)),
        ("GM, nothing selected", render(True)), ("GM with that creature selected", render(True, True))]
out_frames = []
for i in range(len(times)):
    im = Image.new("RGB", (W, (H + 22) * len(rows)), (40, 36, 30)); d = ImageDraw.Draw(im)
    for k, (label, frames) in enumerate(rows):
        y = k * (H + 22)
        d.text((10, y + 4), label, fill=(240, 236, 226)); im.paste(frames[i], (0, y + 18))
    out_frames.append(im)
pal = [f.convert("P", palette=Image.ADAPTIVE, colors=255) for f in out_frames]
pal[0].save(out, save_all=True, append_images=pal[1:], duration=67, loop=0, optimize=True)
out_frames[12].save(out.replace(".gif", ".png"))
print("ok", len(out_frames), out_frames[0].size)
