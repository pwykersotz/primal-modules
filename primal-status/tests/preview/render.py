import sys, io
from playwright.sync_api import sync_playwright
from PIL import Image
mod, out = sys.argv[1], sys.argv[2]
specs = sys.argv[3]
import os
cols, size, gap, label = int(sys.argv[4]), int(os.environ.get("SIZE", 130)), 34, 26
times = [float(x) for x in sys.argv[5].split(",")] if len(sys.argv) > 5 else None
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    import json
    n = len(json.loads(specs)); rows = -(-n // cols)
    W = gap + cols * (size + gap); H = gap + rows * (size + gap + label) + int(size * 0.5)
    # the module's own files (images/fx pictures) at the path Foundry serves them from
    os.makedirs("modules", exist_ok=True)
    if not os.path.exists("modules/primal-status"): os.symlink(os.path.abspath("../.."), "modules/primal-status")
    pg.goto("file://" + os.path.abspath("blank.html")); pg.set_content(f"<html><body style='margin:0'><canvas id=c width={W} height={H}></canvas></body></html>")
    for f in ["minipixi.js", "scene.js"]: pg.add_script_tag(path=f)
    pg.add_script_tag(path=mod)
    if os.environ.get("SETTINGS"): pg.evaluate("window.__settingsOverride = " + os.environ["SETTINGS"])
    if os.environ.get("BG"): pg.evaluate("window.__bg = " + json.dumps(os.environ["BG"]))
    if os.environ.get("PRE_JS"): pg.evaluate(os.environ["PRE_JS"])
    pg.evaluate(f"setupScene({specs}, {size}, {cols}, {gap}, {label}); window.ctx = document.getElementById('c').getContext('2d');")
    # a first frame asks for the painted pictures; give them time to load before the frames that count
    pg.evaluate("frame(3000, ctx)"); pg.wait_for_timeout(800)
    pg.evaluate("frame(3050, ctx)"); pg.wait_for_timeout(400)
    frames = []
    ts = times or [i * (1000 / 15) for i in range(45)]
    # EVENTS='[[t, token, ["status", ...]], ...]': a token's statuses change at time t (as the frames count it)
    events = sorted(json.loads(os.environ.get("EVENTS", "[]")))
    for t in ts:
        while events and events[0][0] <= t:
            _, i, st = events.pop(0)
            pg.evaluate(f"canvas.tokens.placeables[{i}].actor.statuses = new Set({json.dumps(st)})")
        pg.evaluate(f"frame({t + 4000}, ctx)")
        frames.append(Image.open(io.BytesIO(pg.locator("#c").screenshot())).convert("RGB"))
    if errs: print("ERRORS", errs)
    b.close()
if out.endswith(".gif"):
    pal = [f.convert("P", palette=Image.ADAPTIVE, colors=255) for f in frames]
    pal[0].save(out, save_all=True, append_images=pal[1:], duration=67, loop=0, optimize=True)
else:
    frames[-1].save(out)
print("ok", len(frames), "frames", frames[0].size)
