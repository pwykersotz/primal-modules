"""Cut a picture painted on a flat magenta (#FF00FF) background out of it, for the module's animations.

    python3 tools/cutout.py <source.png> <out.webp> [height] [--box=x0,y0,x1,y1] [--mask=mask.png] [--key=auto]
                            [--despill] [--grey]

Magenta is keyed out with soft edges (the background's colour is un-mixed from the edge pixels, so
no pink fringe is left), the picture is trimmed to what's left, scaled to `height` pixels tall
(default 256) and saved as a WebP with transparency. Prints the size and where the trimmed picture
sat in the source, to work out anchor points.

With --box the picture is cut to exactly that box of the source instead of trimmed: for frames of
one animation painted side by side, cut each with a box of the same size placed the same way on the
body, so the frames line up. With --mask (a greyscale picture the size of the source) only the white
part is kept, to split one picture into layers. With --key=auto the background's colour is measured
from the picture's border (Gemini's "magenta" is often a darker pink-purple, such as #D3 13 B0)
instead of assumed to be #FF00FF. --despill takes the pink out of thin parts that were painted over
the background (grass blades, wisps) for pictures with no pink or violet in them, and --grey makes a
picture that should have no colour (smoke, a white bubble) grey.
"""
import sys
import numpy as np
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith("--")]
box = next((tuple(int(v) for v in a[6:].split(",")) for a in sys.argv[1:] if a.startswith("--box=")), None)
mask = next((a[7:] for a in sys.argv[1:] if a.startswith("--mask=")), None)
auto_key = "--key=auto" in sys.argv[1:]
despill = "--despill" in sys.argv[1:]
grey = "--grey" in sys.argv[1:]
src, out = args[0], args[1]
height = int(args[2]) if len(args) > 2 else 256
rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
# how magenta a pixel is: red and blue high, green low
m = np.minimum(r, b) - g
lo, hi = 70.0, 190.0
key = np.array([255.0, 0.0, 255.0])
if auto_key:
    edge = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3), rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    key = np.median(edge, axis=0)
    # violet paint can reach 55 on this scale, so the soft edge starts above it
    lo, hi = 60.0, min(190.0, float(min(key[0], key[2]) - key[1]) - 20)
alpha = 1.0 - np.clip((m - lo) / (hi - lo), 0, 1)
key_alpha = alpha.copy()   # the colour is un-mixed by the keyed alpha only
if mask:
    alpha = alpha * np.asarray(Image.open(mask).convert("L")).astype(np.float32) / 255
# un-mix the magenta from partly transparent edge pixels: C = a*F + (1-a)*K
a3 = np.maximum(key_alpha[..., None], 1e-3)
fg = np.clip((rgb - (1 - a3) * key) / a3, 0, 255)
fg = np.where(key_alpha[..., None] > 0.995, rgb, fg)
if despill:
    # what's left of the background: red and blue both above green; take it out, and fade what was mostly that
    spill = np.clip(np.minimum(fg[..., 0], fg[..., 2]) - fg[..., 1], 0, None)
    fg[..., 0] -= spill; fg[..., 2] -= spill
    alpha = alpha * (1 - np.clip((spill - 25) / 90, 0, 1))
if grey:
    lum = fg @ np.array([0.3, 0.59, 0.11])
    fg = np.repeat(lum[..., None], 3, axis=2)
rgba = np.dstack([fg, alpha * 255]).astype(np.uint8)
im = Image.fromarray(rgba, "RGBA")
if box:
    x0, y0, x1, y1 = box
else:
    ys, xs = np.nonzero(alpha > 0.04)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    pad = 4
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
im = im.crop((x0, y0, x1, y1))
scale = height / im.height
small = im.convert("RGBa").resize((max(1, round(im.width * scale)), height), Image.LANCZOS).convert("RGBA")
small.save(out, "WEBP", quality=92, method=6)
print(f"{out}: {small.width}x{small.height}; trimmed from source box x {x0}-{x1}, y {y0}-{y1} (scale {scale:.4f})")
