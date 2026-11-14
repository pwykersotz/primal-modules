import sys, json
from playwright.sync_api import sync_playwright
new_css = open(sys.argv[1]).read(); lang = json.load(open(sys.argv[2])); shot = sys.argv[3]
old_rule = """.form-group:has(.form-fields [name^="primal-status."]) > label { flex: 1 1 auto; min-width: 0; }
.form-group:has(.form-fields [name^="primal-status."]) > .form-fields { flex: 0 1 auto; }"""
base = """body { background:#0e0d12; color:#e7e1d4; font-family: Signika, 'DejaVu Sans', sans-serif; margin:0; padding:16px; }
form { width:560px; }
.form-group { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; margin:0 0 14px; }
.form-group > label { flex:2; font-weight:bold; font-size:15px; line-height:32px; }
.form-group .form-fields { flex:3; display:flex; justify-content:flex-end; gap:4px; }
.form-group > .hint { flex:0 0 100%; margin:0; color:#a59d8e; font-size:13px; }
input[type=checkbox] { width:20px; height:20px; accent-color:#ff9a3c; }"""
# Possible extra rules in Foundry's real stylesheet that would push the checkbox onto its own line
variants = {
  "plain flex 2:3": "",
  "label width 100%": ".form-group > label { width:100%; }",
  "fields min-width 40%": ".form-group .form-fields { min-width:40%; }",
  "fields basis 50%": ".form-group .form-fields { flex-basis:50%; }",
  "label nowrap + basis": ".form-group > label { flex: 2 1 60%; }",
}
keys = [("statusTooltips","StatusTooltips"),("conditionRolls","ConditionRolls"),("invisibleWhirl","InvisibleWhirl"),("etherealVision","EtherealVision"),("guidanceCheckbox","GuidanceCheckbox")]
html = "".join(f'<div class="form-group"><label>{lang[f"MIGHTYGUARD.Settings.{l}.Name"]}</label><div class="form-fields"><input type="checkbox" name="primal-status.{k}" checked></div><p class="hint">{lang[f"MIGHTYGUARD.Settings.{l}.Hint"][:150]}…</p></div>' for k, l in keys)
measure = """[...document.querySelectorAll('.form-group')].map(g => { const l = g.querySelector(':scope > label').getBoundingClientRect(), c = g.querySelector('input').getBoundingClientRect(), h = g.querySelector('.hint').getBoundingClientRect();
  return { lines: Math.round(l.height / 32), sameLine: c.top < l.bottom && c.bottom > l.top, gap: Math.round(h.top - l.bottom) }; })"""
results = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 700, "height": 700})
    for name, extra in variants.items():
        for label, rule in (("old", old_rule), ("new", new_css)):
            pg.set_content(f"<html><head><style>{base}{extra}</style><style>{rule}</style></head><body><form>{html}</form></body></html>")
            m = pg.evaluate(measure)
            results.append((name, label, m))
            if name == "label width 100%" and label == "new": pg.locator("form").screenshot(path=shot)
    b.close()
allok = True
for name, label, m in results:
    good = all(x["lines"] == 1 and x["sameLine"] and x["gap"] <= 8 for x in m)
    if label == "new" and not good: allok = False
    print(f"{name:24} {label}: lines={[x['lines'] for x in m]} checkbox-on-title-line={[x['sameLine'] for x in m]} gap-to-hint={[x['gap'] for x in m]}")
print("PASS new rule: one-line titles, checkbox beside them, hint right below, in every variant" if allok else "FAIL")
