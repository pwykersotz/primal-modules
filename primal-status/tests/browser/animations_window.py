import sys, json
from playwright.sync_api import sync_playwright
mod = open(sys.argv[1]).read()
lang = open(sys.argv[2]).read()
shot = sys.argv[3] if len(sys.argv) > 3 else None
mocks = open("mocks.js").read()
results = []
def ok(label, cond): results.append(("PASS " if cond else "FAIL ") + label)

# A rough stand-in for Foundry's dark window styling, for the screenshot
css = """
body { background:#2b2a2f; font-family: Signika, 'DejaVu Sans', sans-serif; color:#e7e1d4; font-size:14px; margin:0; padding:20px; }
form.mighty-guard-animations { position:fixed; left:20px; top:10px; width:620px; display:flex; flex-direction:column; box-sizing:border-box; background:#17161c; border:1px solid #47414f; border-radius:8px; padding:0 14px 12px; box-shadow:0 0 20px #000; }
form.mighty-guard-animations::before { content:"Token Animations"; display:block; margin:0 -14px 10px; padding:8px 14px; background:#0e0d12; border-bottom:1px solid #47414f; border-radius:8px 8px 0 0; font-weight:bold; }
fieldset { border:1px solid #47414f; border-radius:6px; }
legend { color:#c9aa71; padding:0 4px; font-size:13px; }
.hint { color:#a59d8e; font-size:13px; }
button { background:#2a2733; color:#e7e1d4; border:1px solid #5a5366; border-radius:4px; padding:3px 10px; font:inherit; }
footer button { width:100%; padding:6px; }
.form-group { display:flex; align-items:center; gap:8px; margin:4px 0; }
.form-group > label { flex:0 0 190px; }
.form-fields { flex:1; display:flex; align-items:center; gap:6px; }
.form-fields input[type=text] { flex:1; background:#0e0d12; color:#e7e1d4; border:1px solid #5a5366; border-radius:3px; padding:3px 5px; }
.form-fields input[type=range] { flex:1; }
input[type=checkbox] { accent-color:#ff6400; }
/* like Foundry: the window is a column, its content section hides overflow unless told otherwise */
.window-header { display:none; }
.window-content { flex:1; overflow:hidden; display:flex; flex-direction:column; }
"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 700, "height": 900}); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.set_content(f"<html><head><style>{css}</style></head><body></body></html>")
    pg.add_script_tag(content=mocks)
    pg.evaluate(f"(() => {{ const LANG = {lang}; game.i18n = {{ has: k => k in LANG, localize: k => LANG[k] ?? k }}; }})()")
    pg.add_script_tag(content=mod)
    pg.evaluate("callHook('init'); callHook('setup'); callHook('ready');")
    menus = pg.evaluate("Object.fromEntries(Object.entries(__menus).map(([k, m]) => [k, { restricted: m.restricted, name: game.i18n.localize(m.name), label: game.i18n.localize(m.label) }]))")
    ok("Token animations window registered for every player", menus.get("animationsMenu", {}).get("restricted") is False and menus["animationsMenu"]["name"] == "Token animations")
    ok("Choose Visible Statuses still GM-only", menus.get("hiddenStatusesMenu", {}).get("restricted") is True)
    shown = pg.evaluate("[...__settings.entries()].filter(([, s]) => s.o.config).map(([k]) => k)")
    ok(f"fourteen settings left in the list ({', '.join(shown)})", shown == ["statusTooltips", "conditionRolls", "drakkenheimAutomation", "dodgeExpiry", "autoDead", "saveEndsCombatEnd", "burningDamage", "desperationAttacks", "desperationChance", "contaminationRest", "invisibleWhirl", "etherealVision", "guidanceCheckbox", "detection"])

    open_window = """async () => { document.querySelector('form.mighty-guard-animations')?.remove();
      const app = new (__menus.animationsMenu.type)(); await app.render(); app.element.classList.add(...app.options.classes); window.__app = app; return true; }"""
    S = "game.settings.get('primal-status', '%s')"
    def change(sel, js_value=None):
        # set an input and fire "change" the way the browser does when the player lets go
        pg.evaluate("""([sel, v]) => { const i = document.querySelector(sel); if (i.type === 'checkbox') i.checked = v === null ? !i.checked : v; else i.value = v;
          i.dispatchEvent(new Event('change', { bubbles: true })); }""", [sel, js_value])
        pg.wait_for_timeout(60)
    # Player
    pg.evaluate("game.settings.set('primal-status', 'bleedingFx', false)")
    pg.evaluate(open_window)
    groups = pg.evaluate("[...document.querySelectorAll('.mg-anim-group')].map(f => f.dataset.group + ':' + f.querySelectorAll('input[type=checkbox]').length)")
    ok(f"player sees five groups, Burning with Monsters of Drakkenheim ({groups})", groups == ["statuses:10", "conditions:13", "levels:3", "drakkenheim:19", "display:2"])
    ok("…and no GM section", pg.evaluate("!document.querySelector('[data-group=shared]') && !document.querySelector('[name=pulseSeconds]')"))
    ok("boxes show the current choices", pg.evaluate("!document.querySelector('[name=bleedingFx]').checked && document.querySelector('[name=poisonedFx]').checked"))
    labels = pg.evaluate("[...document.querySelectorAll('.mg-anim-row span')].map(s => s.textContent)")
    ok("short, readable labels (no raw keys)", all(not l.startswith("MIGHTYGUARD") for l in labels) and "Incapacitated: drained and fading" in labels and "Frozen: turned to ice" in labels and "Entangled: thorny vines" in labels and "Valor: golden glow" in labels)
    tips = pg.evaluate("[...document.querySelectorAll('.mg-anim-row')].map(r => r.dataset.tooltip)")
    ok("every option has its full description as a tooltip", all(t and not t.startswith("MIGHTYGUARD") and len(t) > 30 for t in tips))
    ok("the button at the bottom is Done (there's nothing to save by hand)", pg.evaluate("document.querySelector('footer button[type=submit]').textContent.trim()") == "Done")
    pg.evaluate("window.__changes = []; for (const k of ['cursedFx','bleedingFx','hideAnimatedIcons','poisonedFx']) { const s = __settings.get(k); const prev = s.o.onChange; s.o.onChange = v => { __changes.push(k); prev?.(v); }; } true")
    pg.click("[name=cursedFx]"); pg.wait_for_timeout(60)
    ok("unticking a box saves it at once, without pressing anything else", pg.evaluate(S % "cursedFx") is False)
    pg.click("[name=bleedingFx]"); pg.click("[name=hideAnimatedIcons]"); pg.wait_for_timeout(60)
    ok("…ticking one too, and the status-icon option", pg.evaluate(S % "bleedingFx") is True and pg.evaluate(S % "hideAnimatedIcons") is False)
    ok(f"only the changed settings are saved ({pg.evaluate('__changes')})", sorted(pg.evaluate("__changes")) == ["bleedingFx", "cursedFx", "hideAnimatedIcons"])
    pg.click("[data-action=allOff]"); pg.wait_for_timeout(80)
    ok("All off unticks every animation, saved at once, but not the icon option", pg.evaluate("[...document.querySelectorAll('.mg-anim-group:not([data-group=display]) input')].every(c => !c.checked)")
       and pg.evaluate(S % "poisonedFx") is False and pg.evaluate(S % "valorFx") is False and pg.evaluate(S % "hideAnimatedIcons") is False)
    pg.click("[data-action=allOn]"); pg.wait_for_timeout(80)
    ok("All on ticks and saves them all again", pg.evaluate("[...document.querySelectorAll('.mg-anim-group:not([data-group=display]) input')].every(c => c.checked)") and pg.evaluate(S % "poisonedFx") is True and pg.evaluate(S % "cursedFx") is True)
    ok("sounds were left off (not an animation: All on doesn't touch them)", pg.evaluate(S % "soundCues") is False)
    # closing with the window's X keeps what was changed (it was already saved)
    pg.evaluate("document.querySelector('form.mighty-guard-animations').remove()")
    pg.evaluate(open_window)
    ok("reopened, it shows what was saved", pg.evaluate("document.querySelector('[name=cursedFx]').checked && !document.querySelector('[name=hideAnimatedIcons]').checked"))
    # sounds: a box, a volume slider and a sample button in the Display group
    ok("Display group has the sound box (off), volume (50) and a sample button", pg.evaluate("(() => { const g = document.querySelector('[data-group=display]'); const b = g.querySelector('[name=soundCues]'), v = g.querySelector('[name=soundVolume]'); return !!b && !b.checked && v?.value === '50' && !!g.querySelector('[data-action=testSound]'); })()"))
    pg.evaluate("window.__played = []; foundry.audio = { AudioHelper: { play: (d, push) => __played.push([d.src, d.volume, push]) } }; const v = document.querySelector('[name=soundVolume]'); v.value = '70'; v.dispatchEvent(new Event('input'));")
    ok("the volume shows as it moves", pg.evaluate("document.querySelector('[name=soundVolume]').parentElement.querySelector('.mg-range-value').textContent") == "70")
    ok("…and isn't saved until the slider is let go", pg.evaluate(S % "soundVolume") == 50)
    pg.click("[data-action=testSound]")
    ok("the sample plays at the slider's volume, for this player only", pg.evaluate("__played") == [["modules/primal-status/sounds/chime.ogg", 0.7, False]])
    change("[name=soundVolume]", "70"); change("[name=soundCues]", True)
    ok("letting go of the slider and ticking the box save the volume and the sounds", pg.evaluate(f"[{S % 'soundCues'}, {S % 'soundVolume'}]") == [True, 70])
    q = pg.evaluate("(() => { const s = document.querySelector('select[name=animationQuality]'); return s ? { value: s.value, options: [...s.options].map(o => o.value), inDisplay: !!s.closest('[data-group=display]') } : null; })()")
    ok("Animation quality menu in the Display group, on Automatic", q is not None and q["value"] == "auto" and q["options"] == ["auto", "full", "reduced", "still"] and q["inDisplay"])
    change("select[name=animationQuality]", "still")
    ok("choosing Still saves it at once", pg.evaluate(S % "animationQuality") == "still")
    change("select[name=animationQuality]", "auto")
    # Done: whatever wasn't saved yet (a change without its event) is saved, and the window closes
    pg.evaluate("document.querySelector('[name=markedFx]').checked = false; document.querySelector('footer button[type=submit]').click()"); pg.wait_for_timeout(100)
    ok("Done saves anything left and closes the window", pg.evaluate(S % "markedFx") is False and pg.evaluate("__app.closed === true"))
    pg.evaluate("game.settings.set('primal-status', 'markedFx', true)")
    # Layout: never taller than the screen, nothing cut off at the side
    pg.set_viewport_size({"width": 700, "height": 560})
    pg.evaluate("game.user.isGM = true")
    pg.evaluate(open_window)
    lay = pg.evaluate("""(() => { const f = document.querySelector('form.mighty-guard-animations'), c = f.querySelector('.window-content'), r = f.getBoundingClientRect();
      return { bottom: r.bottom, vh: innerHeight, scrolls: getComputedStyle(c).overflowY === 'auto' && c.scrollHeight > c.clientHeight, wide: c.scrollWidth - c.clientWidth }; })()""")
    ok(f"on a short screen the window fits ({lay['bottom']:.0f} of {lay['vh']} px) and its contents scroll", lay["bottom"] <= lay["vh"] and lay["scrolls"])
    pg.evaluate("const c = document.querySelector('.window-content'); c.scrollTop = c.scrollHeight;")
    ok("…so Done and the GM's section can be scrolled to", pg.evaluate("(() => { const b = document.querySelector('footer button[type=submit]').getBoundingClientRect(); return b.bottom <= innerHeight && b.top >= 0; })()"))
    ok(f"nothing runs off the side ({lay['wide']} px)", lay["wide"] <= 0)
    pg.evaluate("game.i18n.localize = k => k")   # untranslated: very long labels
    pg.evaluate(open_window)
    wide = pg.evaluate("(() => { const c = document.querySelector('.window-content'); const over = [...c.querySelectorAll('.mg-anim-row, select, input[type=range]')].filter(e => e.getBoundingClientRect().right > c.getBoundingClientRect().right + 1).length; return [c.scrollWidth - c.clientWidth, over]; })()")
    ok(f"…even with very long labels, which wrap ({wide})", wide[0] <= 0 and wide[1] == 0)
    pg.evaluate(f"(() => {{ const LANG = {lang}; game.i18n.localize = k => LANG[k] ?? k; }})()")
    pg.set_viewport_size({"width": 700, "height": 900})
    # GM
    pg.evaluate(open_window)
    ok("GM also sees the shared section", pg.evaluate("!!document.querySelector('[data-group=shared] [name=pulseSeconds]') && !!document.querySelector('[name=grappleImagePath]') && !!document.querySelector('[name=grappleImageFit]')"))
    ok("shared values filled in", pg.evaluate("document.querySelector('[name=pulseSeconds]').value === '8' && document.querySelector('[name=grappleImageFit]').value === '1' && document.querySelector('[name=grappleImagePath]').value.endsWith('grapple-hand.webp')"))
    pg.evaluate("const r = document.querySelector('[name=pulseSeconds]'); r.value = '4.5'; r.dispatchEvent(new Event('input'));")
    ok("range shows its value as it moves", pg.evaluate("document.querySelector('[name=pulseSeconds]').parentElement.querySelector('.mg-range-value').textContent") == "4.5")
    change("[name=pulseSeconds]", "4.5"); change("[name=grappleImageFit]", "1.2"); change("[name=grappleImagePath]", " worlds/x/claw.webp ")
    w = pg.evaluate(f"({{ speed: {S % 'pulseSeconds'}, fit: {S % 'grappleImageFit'}, path: {S % 'grappleImagePath'} }})")
    ok("GM's shared values saved as they're set", w == {"speed": 4.5, "fit": 1.2, "path": "worlds/x/claw.webp"})
    pg.evaluate("const i = document.querySelector('[name=grappleImagePath]'); i.value = 'worlds/x/other.webp'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));"); pg.wait_for_timeout(60)
    ok("Enter in the image box saves it (and doesn't close the window)", pg.evaluate(S % "grappleImagePath") == "worlds/x/other.webp" and not pg.evaluate("!!__app.closed"))
    if shot: pg.locator("form.mighty-guard-animations").screenshot(path=shot)
    # GM: other animation modules, and giving everyone the same choices
    ok("GM sees 'Leave statuses other modules animate to them', ticked", pg.evaluate("document.querySelector('[data-group=shared] [name=deferToOtherModules]')?.checked === true"))
    ok("…and a 'Give every player these choices' button, not yet used", pg.evaluate("(() => { const b = document.querySelector('[data-group=shared] [data-action=giveEveryone]'); return !!b && b.textContent.includes('Give every player these choices') && !document.querySelector('.mg-last-given').textContent; })()"))
    change("[name=deferToOtherModules]", False)
    ok("unticking the other-modules box saves it; nothing is given to everyone", pg.evaluate(S % "deferToOtherModules") is False and pg.evaluate(f"JSON.stringify({S % 'animationDefaults'})") == "{}")
    pg.evaluate("window.__notes = []; window.ui = { notifications: { info: m => __notes.push(m) } };")
    pg.click("[name=markedFx]"); pg.click("[data-action=giveEveryone]"); pg.wait_for_timeout(150)
    d = pg.evaluate(S % "animationDefaults")
    ok("the button gives everyone the GM's choices as they are, including one just changed", isinstance(d.get("stamp"), (int, float)) and d["stamp"] > 0 and d["values"].get("markedFx") is False and d["values"].get("cursedFx") is True and "animationQuality" not in d["values"] and len(d["values"]) == 46)
    ok("…the GM's own client counts them as taken", pg.evaluate(S % "animationDefaultsApplied") == d["stamp"])
    ok("…and the window says so, with a notice", "Last given" in pg.evaluate("document.querySelector('.mg-last-given').textContent") and pg.evaluate("__notes.length") == 1)
    pg.evaluate(open_window)
    ok("reopened: says when they were last given", "Last given" in pg.evaluate("document.querySelector('.mg-last-given').textContent"))
    ok("…both with their full description as a tooltip", pg.evaluate("[...document.querySelectorAll('.mg-shared-row')].map(r => r.dataset.tooltip).every(t => t && t.length > 60 && !t.startsWith('MIGHTYGUARD'))"))
    if shot: pg.locator("form.mighty-guard-animations").screenshot(path=shot)
    change("[name=deferToOtherModules]", True); change("[name=markedFx]", True)
    pg.evaluate("game.user.isGM = false; game.settings.set('primal-status','pulseSeconds', 8)")
    pg.evaluate(open_window)
    pg.evaluate("document.querySelector('footer button[type=submit]').click()"); pg.wait_for_timeout(100)
    ok("a player closing the window never touches the GM's values", pg.evaluate(S % "pulseSeconds") == 8)
    ok("…and a player has no 'give everyone' or other-modules controls", pg.evaluate("!document.querySelector('[data-action=giveEveryone]') && !document.querySelector('[name=deferToOtherModules]')"))
    ok("no page errors", not errors)
    if errors: print(errors)
    b.close()
print("\n".join(results)); print(sum(r.startswith("PASS") for r in results), "/", len(results))
