# The "Animate this token's statuses" box in a token's settings (and the prototype token's).
#   python3 token_config.py <scripts/primal-status.js> <lang/en.json>
import sys
from playwright.sync_api import sync_playwright
mod = open(sys.argv[1]).read()
lang = open(sys.argv[2]).read()
mocks = open("mocks.js").read()
results = []
def ok(label, cond): results.append(("PASS " if cond else "FAIL ") + label)

# Shaped like Foundry 13/14's token settings: tabs inside the form, Appearance among them
SHEET = """(() => { document.querySelector('form.token-sheet')?.remove();
  const f = document.createElement('form'); f.className = 'token-sheet';
  f.innerHTML = `<nav class="tabs"><a data-tab="identity">Identity</a><a data-tab="appearance">Appearance</a></nav>
    <div class="tab" data-tab="identity"><div class="form-group"><label>Name</label><div class="form-fields"><input name="name" value="Goblin"></div></div></div>
    <div class="tab" data-tab="appearance"><div class="form-group"><label>Image</label><div class="form-fields"><input name="texture.src" value="a.webp"></div></div></div>
    <footer><button type="submit">Update Token</button></footer>`;
  document.body.append(f); return f; })()"""

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.set_content("<html><body></body></html>")
    pg.add_script_tag(content=mocks)
    pg.evaluate(f"(() => {{ const LANG = {lang}; game.i18n = {{ has: k => k in LANG, localize: k => LANG[k] ?? k }}; }})()")
    pg.add_script_tag(content=mod)
    pg.evaluate("callHook('init'); callHook('setup'); callHook('ready'); true")

    render = """([hook, flags, jq]) => { const form = %s; window.__resized = 0; window.__saved = [];
      const actor = { documentName: 'Actor', update: async (d, o) => { __saved.push(['actor', d, o]); } };
      const doc = hook === 'renderPrototypeTokenConfig' ? { flags, parent: actor }
        : { documentName: 'Token', id: 't1', flags, update: async (d, o) => { __saved.push(['token', d, o]); } };
      const app = { document: doc, token: doc, actor: hook === 'renderPrototypeTokenConfig' ? actor : undefined, rendered: true, setPosition: o => { if (o?.height === 'auto') __resized++; } };
      callHook(hook, app, jq ? [form] : form, {}, {}); window.__app = app; return true; }""" % SHEET
    pg.evaluate(render, ["renderTokenConfig", {}, False])
    box = "document.querySelector('[name=\"flags.primal-status.animations\"]')"
    ok("the box is added to the Appearance tab", pg.evaluate(f"!!{box} && {box}.closest('.tab').dataset.tab === 'appearance' && {box}.type === 'checkbox'"))
    ok("…ticked for a token with no setting yet", pg.evaluate(f"{box}.checked === true"))
    ok("…with its title and explanation", pg.evaluate(f"(() => {{ const g = {box}.closest('.form-group'); return g.querySelector('label').textContent === \"Animate this token's statuses\" && g.querySelector('.hint').textContent.includes(\"Foundry's own invisibility\"); }})()"))
    ok("…inside the form, so Foundry saves it as the token's flag", pg.evaluate(f"{box}.form === document.querySelector('form.token-sheet') && new FormData({box}.form).get('flags.primal-status.animations') === 'on'"))
    ok("the window isn't resized (the save button stays where Foundry put it)", pg.evaluate("__resized") == 0)
    pg.evaluate(f"{box}.click()"); pg.wait_for_timeout(50)
    saved = pg.evaluate("JSON.parse(JSON.stringify(__saved))")
    ok("unticking saves it straight away, on the token, without redrawing the window", saved == [["token", {"flags.primal-status.animations": False}, {"render": False}]])
    pg.evaluate(f"{box}.click()"); pg.wait_for_timeout(50)
    ok("ticking it again saves that too", pg.evaluate("JSON.parse(JSON.stringify(__saved))")[-1] == ["token", {"flags.primal-status.animations": True}, {"render": False}])
    pg.evaluate("callHook('renderTokenConfig', __app, document.querySelector('form.token-sheet'), {}, {})")
    ok("rendering again doesn't add a second box", pg.evaluate("document.querySelectorAll('[name=\"flags.primal-status.animations\"]').length") == 1)
    pg.evaluate(render, ["renderTokenConfig", {"primal-status": {"animations": False}}, False])
    ok("unticked for a token set to show no animations", pg.evaluate(f"{box}.checked === false"))
    pg.evaluate(render, ["renderTokenConfig", {"mighty-guard": {"animations": False}}, False])
    ok("…also when that was set before 3.0.0 (under the old module ID)", pg.evaluate(f"{box}.checked === false"))
    pg.evaluate(render, ["renderTokenConfig", {"mighty-guard": {"animations": False}, "primal-status": {"animations": True}}, False])
    ok("…and ticked once it's been ticked again since", pg.evaluate(f"{box}.checked === true"))
    pg.evaluate(render, ["renderTokenConfig", {"primal-status": {"animations": True}}, True])
    ok("ticked when set on; works with the form wrapped as in older versions", pg.evaluate(f"{box}.checked === true"))
    pg.evaluate(render, ["renderPrototypeTokenConfig", {"primal-status": {"animations": False}}, False])
    ok("an actor's prototype token gets the box too", pg.evaluate(f"!!{box} && {box}.checked === false"))
    pg.evaluate(f"{box}.click()"); pg.wait_for_timeout(50)
    ok("…and ticking it there saves it on the actor's prototype token", pg.evaluate("JSON.parse(JSON.stringify(__saved))") == [["actor", {"prototypeToken.flags.primal-status.animations": True}, {"render": False}]])
    # a token that can't be saved (no permission): a warning, nothing breaks
    pg.evaluate("""(() => { window.__warned = []; window.ui = { notifications: { warn: m => __warned.push(m) } };
      const f = document.querySelector('form.token-sheet'); f.remove(); })()""")
    pg.evaluate(render.replace("update: async (d, o) => { __saved.push(['token', d, o]); }", "update: async () => { throw new Error('no permission'); }"), ["renderTokenConfig", {}, False])
    pg.evaluate(f"{box}.click()"); pg.wait_for_timeout(80)
    ok("if it can't be saved (no permission), a warning says so", len(pg.evaluate("__warned")) == 1)
    # no Appearance tab: the Identity tab; neither: nothing, and no error
    pg.evaluate("""(() => { const f = document.createElement('form'); f.className = 'odd-sheet'; f.innerHTML = '<div class="tab" data-tab="identity"></div>';
      document.querySelector('form.token-sheet')?.remove(); document.body.append(f); callHook('renderTokenConfig', { document: { flags: {} } }, f, {}, {}); })()""")
    ok("no Appearance tab: it goes in Identity", pg.evaluate(f"{box}?.closest('.tab')?.dataset.tab === 'identity'"))
    pg.evaluate("""(() => { const f = document.createElement('form'); f.className = 'bare'; document.body.append(f); callHook('renderTokenConfig', { document: null }, f, {}, {}); callHook('renderTokenConfig', null, null, {}, {}); })()""")
    ok("an unexpected window is left alone", pg.evaluate("document.querySelector('form.bare').children.length") == 0)
    ok("no page errors", not errors)
    if errors: print(errors)
    b.close()
print("\n".join(results)); print(sum(r.startswith("PASS") for r in results), "/", len(results))
