import sys
from playwright.sync_api import sync_playwright
mod=open(sys.argv[1]).read(); mocks=open("mocks.js").read()
sim = r"""
// Simulates dnd5e 6's RollConfigurationDialog: the "formulas" part (with Situational Bonus) re-renders on every change.
window.makeDialog = (hookNames, id) => {
  const form = document.createElement("form"); form.id = id; document.body.append(form);
  const app = { id, config: { hookNames }, element: form, form };
  const baseParts = ["1d20", "@mod"];
  app.rebuild = () => {
    const fd = { object: {} };
    for (const el of form.elements) if (el.name) fd.object[el.name] = el.type === "checkbox" ? el.checked : el.value;
    const config = { parts: [...baseParts], data: {} };
    for (const h of hookNames) callHook(`dnd5e.build${h[0].toUpperCase()}${h.slice(1)}RollConfig`, app, config, fd, 0);
    if (fd.object["roll.0.situational"]) config.parts.push(fd.object["roll.0.situational"]);
    app.formula = config.parts.join(" + ");
    app.renderFormulas();
  };
  app.renderFormulas = () => {
    const sit = form.querySelector('[name="roll.0.situational"]')?.value ?? "";
    form.innerHTML = `<div class="rolls"><ul class="formulas"><li><div class="formula-line"><span class="formula">${app.formula ?? baseParts.join(" + ")}</span></div>
      <div class="form-group"><input type="text" class="full-width" name="roll.0.situational" value="${sit}" placeholder="Situational Bonus"></div></li></ul></div>
      <fieldset><select name="rollMode"><option>publicroll</option></select></fieldset>`;
    callHook("renderRollConfigurationDialog", app, form);
  };
  form.addEventListener("change", () => app.rebuild());
  app.renderFormulas();
  return app;
};
"""
res=[]
def ok(l,c): res.append(("PASS " if c else "FAIL ")+l)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.set_content("<html><body></body></html>"); pg.add_script_tag(content=mocks); pg.add_script_tag(content=mod); pg.add_script_tag(content=sim)
    pg.evaluate("game.i18n.localize = s => ({'MIGHTYGUARD.Guidance.Label':'Guidance','MIGHTYGUARD.Guidance.Hint':'(+1d4)'})[s] ?? s; callHook('init'); callHook('setup'); callHook('ready');")
    pg.evaluate("window.skill = makeDialog(['skill','abilityCheck','d20Test'], 'skill-dlg')")
    ok("skill dialog: checkbox right under Situational Bonus", pg.evaluate("""(()=>{ const g=document.querySelector('#skill-dlg [name="roll.0.situational"]').closest('.form-group'); return g.nextElementSibling?.querySelector('input[type=checkbox][name="roll.0.mgGuidance"]') != null; })()"""))
    ok("checkbox labelled 'Guidance (+1d4)'", pg.evaluate("document.querySelector('#skill-dlg .mg-guidance').textContent.replace(/\\s+/g,' ').trim()") == "Guidance (+1d4)")
    pg.click("#skill-dlg .mg-guidance label")
    ok("ticking adds 1d4 to the formula", pg.evaluate("skill.formula") == "1d20 + @mod + 1d4")
    ok("checkbox still ticked after the re-render", pg.evaluate("document.querySelector('#skill-dlg [name=\"roll.0.mgGuidance\"]').checked"))
    pg.fill("#skill-dlg [name='roll.0.situational']", "2"); pg.dispatch_event("#skill-dlg [name='roll.0.situational']", "change")
    ok("works alongside a situational bonus", pg.evaluate("skill.formula") == "1d20 + @mod + 1d4 + 2")
    ok("only one checkbox after several re-renders", pg.evaluate("document.querySelectorAll('#skill-dlg .mg-guidance').length") == 1)
    pg.click("#skill-dlg .mg-guidance label")
    ok("unticking removes 1d4", pg.evaluate("skill.formula") == "1d20 + @mod + 2")
    for name, hooks, expect in [("ability check", "['abilityCheck','d20Test']", True), ("tool check", "['tool','abilityCheck','d20Test']", True),
                                ("initiative", "['initiativeDialog','abilityCheck','d20Test']", True), ("saving throw", "['savingThrow','d20Test']", False),
                                ("death save", "['deathSave']", False), ("attack", "['attack','d20Test']", False)]:
        dlg_id = name.replace(" ","-")
        pg.evaluate(f"makeDialog({hooks}, '{dlg_id}')")
        has = pg.evaluate(f"!!document.querySelector('#{dlg_id} .mg-guidance')")
        ok(f"{name}: checkbox {'shown' if expect else 'not shown'}", has == expect)
    pg.evaluate("game.settings.set('primal-status','guidanceCheckbox',false); makeDialog(['skill','abilityCheck','d20Test'],'off-dlg')")
    ok("setting off: no checkbox", pg.evaluate("!document.querySelector('#off-dlg .mg-guidance')"))
    pg.evaluate("game.settings.set('primal-status','guidanceCheckbox',true)")
    # screenshot a styled version
    pg.evaluate("""document.body.innerHTML=''; document.head.insertAdjacentHTML('beforeend','<style>body{background:#f3efe6;font:14px Signika,DejaVu Sans,sans-serif;margin:16px} form{width:360px;border:1px solid #bbb;padding:10px;background:#fff;border-radius:6px} .formula-line{display:flex;justify-content:space-between;margin-bottom:6px} .formula{font-weight:bold} input.full-width{width:100%;box-sizing:border-box;padding:4px} .hint{color:#777} ul{list-style:none;margin:0;padding:0} fieldset{display:none}</style>');
      window.shot = makeDialog(['skill','abilityCheck','d20Test'],'shot-dlg');""")
    pg.click("#shot-dlg .mg-guidance label")
    pg.screenshot(path="guidance.png", clip={"x":0,"y":0,"width":420,"height":140})
    ok("no page errors", not errs); 
    if errs: print(errs)
    b.close()
print("\n".join(res)); print(sum(r.startswith("PASS") for r in res),"/",len(res))
