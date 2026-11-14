import sys, json
from playwright.sync_api import sync_playwright
css = open(sys.argv[1]).read(); lang = json.load(open(sys.argv[2])); shot = sys.argv[3]
L = lambda k: lang[f"MIGHTYGUARD.Settings.{k}.Name"]
H = lambda k: lang[f"MIGHTYGUARD.Settings.{k}.Hint"]
# Foundry-style settings rows: label and fields share the row (flex 2 : 3), hint below at full width
core = """
body { background:#0e0d12; color:#e7e1d4; font-family: Signika, 'DejaVu Sans', sans-serif; margin:0; padding:16px; }
form { width:560px; }
.form-group { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; margin:0 0 14px; }
.form-group > label { flex:2; font-weight:bold; font-size:15px; line-height:32px; }
.form-group .form-fields { flex:3; display:flex; justify-content:flex-end; gap:4px; }
.form-group > .hint { flex:0 0 100%; margin:0; color:#a59d8e; font-size:13px; }
select { background:#1b1a20; color:#e7e1d4; border:1px solid #555; padding:3px; }
input[type=checkbox] { width:20px; height:20px; accent-color:#ff9a3c; }
"""
rows = [("statusTooltips","StatusTooltips","checkbox"),("conditionRolls","ConditionRolls","checkbox"),("invisibleWhirl","InvisibleWhirl","checkbox"),
        ("guidanceCheckbox","GuidanceCheckbox","checkbox"),("detection","Detection","select"),
        ("dodgeExpiry","DodgeExpiry","checkbox"),("autoDead","AutoDead","checkbox"),("etherealVision","EtherealVision","checkbox")]
def row(key, label, kind, module="primal-status"):
    ctl = f'<input type="checkbox" name="{module}.{key}" checked>' if kind == "checkbox" else f'<select name="{module}.{key}"><option>{lang["MIGHTYGUARD.Settings.Detection.Damage"]}</option></select>'
    return f'<div class="form-group" data-setting-id="{module}.{key}"><label>{label}</label><div class="form-fields">{ctl}</div><p class="hint">{(H(label) if module=="primal-status" else "A core setting with a long title for comparison.")[:160]}…</p></div>'
html = "".join(row(k, L(l) if False else l, kind) for k, l, kind in rows)
html = "".join(row(k, l, kind).replace(f"<label>{l}</label>", f"<label>{L(l)}</label>") for k, l, kind in rows)
html += row("x", "Show a long core setting title that would wrap", "checkbox", module="core").replace("<label>Show a long core setting title that would wrap</label>", "<label>Show a long core setting title that would wrap here</label>")
def lines(pg):
    return pg.evaluate("[...document.querySelectorAll('.form-group > label')].map(l => [l.textContent, Math.round(l.getBoundingClientRect().height / 32)])")
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 620, "height": 900})
    pg.set_content(f"<html><head><style>{core}</style></head><body><form>{html}</form></body></html>")
    before = lines(pg)
    pg.add_style_tag(content=css)
    after = lines(pg)
    pg.locator("form").screenshot(path=shot)
    b.close()
print("BEFORE", before); print("AFTER ", after)
N = len(rows)
ours_before = [n for t, n in before[:N]]; ours_after = [n for t, n in after[:N]]
print("PASS titles wrapped before (reproduced)" if any(n > 1 for n in ours_before) else "FAIL couldn't reproduce the wrap")
print("PASS every title now fits on one line" if all(n == 1 for n in ours_after) else "FAIL some still wrap")
print("PASS other modules' settings unchanged" if before[N] == after[N] else "FAIL core setting changed")
