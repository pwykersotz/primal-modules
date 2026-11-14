import sys, json
from playwright.sync_api import sync_playwright
mod = open(sys.argv[1]).read()
mocks = open("mocks.js").read()
css = "#token-hud .status-effects{display:grid;width:max-content;grid-template-columns:repeat(5,25px);gap:2px;background:#222;padding:4px} #token-hud .status-effects:not(.active){display:none} img{background:#555}"
results = []
def ok(label, cond): results.append(("PASS " if cond else "FAIL ") + label)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome") if False else p.chromium.launch()
    pg = b.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.set_content(f"<html><head><style>{css}</style></head><body></body></html>")
    pg.add_script_tag(content=mocks)
    # dnd5e's own Burning and cover statuses, with the system's names
    pg.evaluate("""Object.assign(CONFIG.statusEffects, { burning: { id: "burning", name: "Burning", img: "burn.svg" },
      coverHalf: { id: "coverHalf", name: "Half Cover", img: "c1.svg" }, coverThreeQuarters: { id: "coverThreeQuarters", name: "Three-Quarters Cover", img: "c2.svg" },
      coverTotal: { id: "coverTotal", name: "Total Cover", img: "c3.svg" } })""")
    pg.add_script_tag(content=mod)
    pg.evaluate("callHook('init'); callHook('setup'); callHook('ready');")
    ok("module statuses registered alongside existing", pg.evaluate("['hasted','slowed','mighty-guard','blinded'].every(k=>CONFIG.statusEffects[k])"))
    ok("settings menu registered with a window class", pg.evaluate("typeof __menus.hiddenStatusesMenu.type === 'function'"))

    # Search box
    pg.evaluate("buildHUD(); document.querySelector('.status-effects').classList.add('active')")
    pg.wait_for_timeout(50)
    ids = pg.evaluate("[...document.querySelectorAll('.status-effects > *')].map(e => e.dataset.statusId ?? e.className)")
    head = ids.index("mg-palette-heading") if "mg-palette-heading" in ids else -1
    lab = pg.evaluate("Object.fromEntries([...document.querySelectorAll('.status-effects [data-status-id]')].map(i => [i.dataset.statusId, (i.dataset.tooltipText || i.dataset.statusId).toLowerCase()]))")
    before = [i for i in ids[1:head]]; after = ids[head + 1:]
    drakk_ids = {"burning","bleeding","contamination","addled","clumsy","enfeebled","sickened","defenseless","helpless","weakened","dazed","immobilized","entangled","frozen","shocked","jinxed","valor",
                 "bewildered","distracted","staggered","drakkenheimSlowed","drakkenheimMadness"}
    ok(f"palette icons in alphabetical order ({len(before)} before the heading)", head > 1 and [lab[i] for i in before] == sorted(lab[i] for i in before) and not drakk_ids & set(before))
    ok(f"…then a Monsters of Drakkenheim heading across the palette and its statuses, alphabetical ({len(after)})", set(after) <= drakk_ids and len(after) >= 14 and [lab[i] for i in after] == sorted(lab[i] for i in after)
       and pg.evaluate("getComputedStyle(document.querySelector('.mg-palette-heading')).gridColumnEnd") == "-1")
    ok("Burning sits in the Monsters of Drakkenheim section", "burning" in after and "burning" not in before)
    covers = [ids.index(c) for c in ("coverHalf", "coverThreeQuarters", "coverTotal")]
    ok(f"cover statuses get this module's names and sit side by side ({covers})",
       pg.evaluate("[CONFIG.statusEffects.coverHalf.name, CONFIG.statusEffects.coverThreeQuarters.name, CONFIG.statusEffects.coverTotal.name]") == ["MIGHTYGUARD.Cover.Half", "MIGHTYGUARD.Cover.ThreeQuarters", "MIGHTYGUARD.Cover.Total"]
       and covers == list(range(covers[0], covers[0] + 3)))
    ok("search box is first in palette", pg.evaluate("document.querySelector('.status-effects').firstElementChild.classList.contains('mg-status-search')"))
    ok("search box focused when palette opened", pg.evaluate("document.activeElement?.classList.contains('mg-status-search')"))
    total = pg.evaluate("document.querySelectorAll('.status-effects [data-status-id]').length")
    pg.fill(".mg-status-search", "blind")
    ok("the heading hides while no Drakkenheim status matches the search", pg.evaluate("document.querySelector('.mg-palette-heading').style.display") == "none")
    pg.fill(".mg-status-search", "")
    ok("…and comes back when the search is cleared", pg.evaluate("document.querySelector('.mg-palette-heading').style.display") == "")
    pg.fill(".mg-status-search", "gra")
    vis = pg.evaluate("[...document.querySelectorAll('.status-effects [data-status-id]')].filter(i=>i.style.display!=='none').map(i=>i.dataset.statusId)")
    ok(f"typing 'gra' shows only Grappled (of {total})", vis == ["grappled"])
    pg.press(".mg-status-search", "Enter")
    ok("Enter toggles the first match", pg.evaluate("__clicked") == ["grappled"])
    pg.fill(".mg-status-search", "has")
    ok("finds module status by name (Haste)", pg.evaluate("[...document.querySelectorAll('.status-effects [data-status-id]')].filter(i=>i.style.display!=='none').map(i=>i.dataset.statusId)") == ["hasted"])
    # re-render keeps query for same token, resets for another token
    pg.evaluate("buildHUD('t1')")
    ok("query kept after HUD re-render", pg.evaluate("document.querySelector('.mg-status-search').value") == "has")
    pg.evaluate("buildHUD('t2')")
    ok("query cleared for a different token", pg.evaluate("document.querySelector('.mg-status-search').value") == "")
    pg.evaluate("document.querySelector('.status-effects').classList.add('active')"); pg.wait_for_timeout(30)
    pg.fill(".mg-status-search", "pro"); pg.press(".mg-status-search", "Escape")
    ok("Escape clears the search", pg.evaluate("document.querySelector('.mg-status-search').value") == "" and pg.evaluate("[...document.querySelectorAll('.status-effects [data-status-id]')].every(i=>i.style.display!=='none')"))
    ok("typing doesn't bubble keydown to Foundry", pg.evaluate("""(()=>{ let got=false; document.addEventListener('keydown',()=>got=true,{once:true}); document.querySelector('.mg-status-search').dispatchEvent(new KeyboardEvent('keydown',{key:'x',bubbles:true})); return !got; })()"""))
    w_full = pg.evaluate("document.querySelector('.status-effects').getBoundingClientRect().width")
    h_full = pg.evaluate("document.querySelector('.status-effects').getBoundingClientRect().height")

    # Settings window
    pg.evaluate("window.__app = new (__menus.hiddenStatusesMenu.type)(); __app.render()")
    pg.wait_for_timeout(50)
    names = pg.evaluate("[...__app.element.querySelectorAll('.mg-status-row span')].map(s=>s.textContent)")
    main = pg.evaluate("[...__app.element.querySelectorAll('.mg-status-list > .mg-status-grid:first-child .mg-status-row span')].map(s=>s.textContent)")
    drakk = pg.evaluate("[...__app.element.querySelectorAll('.mg-status-heading + .mg-status-grid .mg-status-row span')].map(s=>s.textContent)")
    low = lambda l: [x.lower() for x in l]
    ok("window lists statuses alphabetically", low(main) == sorted(low(main)) and "MIGHTYGUARD.Haste" in main and len(main) + len(drakk) == len(names))
    ok(f"…with the Monsters of Drakkenheim ones in their own section after a heading ({len(drakk)})", pg.evaluate("__app.element.querySelector('.mg-status-heading')?.textContent.trim()") == "MIGHTYGUARD.Animations.Group.drakkenheim"
       and len(drakk) == 21 and "Burning" in drakk and low(drakk) == sorted(low(drakk)) and not any("Drakkenheim" in n or "Contamination" in n for n in main))
    ok("…read down each column", pg.evaluate("getComputedStyle(__app.element.querySelector('.mg-status-grid')).gridAutoFlow") == "column")
    ok("system-hidden statuses (encumbered) not offered", "Encumbered" not in names)
    pg.fill(".mg-config-search", "fri")
    ok("window search filters rows", pg.evaluate("[...__app.element.querySelectorAll('.mg-status-row')].filter(r=>r.style.display!=='none').length") == 1)
    pg.fill(".mg-config-search", "")
    pg.click("[data-action=hideAll]")
    ok("Hide all unticks everything", pg.evaluate("[...__app.element.querySelectorAll('.mg-status-row input')].every(c=>!c.checked)"))
    pg.click("[data-action=showAll]")
    # keep only Blinded, Prone, Haste visible
    pg.evaluate("[...__app.element.querySelectorAll('.mg-status-row input')].forEach(c=>{ c.checked = ['show.blinded','show.prone','show.hasted'].includes(c.name); })")
    renders_before = pg.evaluate("canvas.tokens.hud.renderCount")
    pg.click("button[type=submit]"); pg.wait_for_timeout(50)
    hidden = pg.evaluate("game.settings.get('primal-status','hiddenStatuses')")
    ok("save stores hidden statuses", "charmed" in hidden and "blinded" not in hidden and "hasted" not in hidden and "encumbered" not in hidden)
    ok("hidden statuses get hud:false; open HUD re-rendered", pg.evaluate("CONFIG.statusEffects.charmed.hud===false && CONFIG.statusEffects.blinded.hud===undefined") and pg.evaluate("canvas.tokens.hud.renderCount") > renders_before)
    ok("system's own hud:false kept", pg.evaluate("CONFIG.statusEffects.encumbered.hud===false"))
    pg.evaluate("buildHUD('t3'); document.querySelector('.status-effects').classList.add('active')"); pg.wait_for_timeout(30)
    ids = pg.evaluate("[...document.querySelectorAll('.status-effects [data-status-id]')].map(i=>i.dataset.statusId)")
    ok("palette shows only the 3 visible statuses", sorted(ids) == ["blinded","hasted","prone"])
    cols = pg.evaluate("document.querySelector('.status-effects').style.gridTemplateColumns")
    w_small = pg.evaluate("document.querySelector('.status-effects').getBoundingClientRect().width")
    h_small = pg.evaluate("document.querySelector('.status-effects').getBoundingClientRect().height")
    ok(f"palette resized: columns '{cols}', {w_full:.0f}x{h_full:.0f} -> {w_small:.0f}x{h_small:.0f}px", w_small < w_full and h_small < h_full)
    pg.screenshot(path="palette_small.png", clip={"x":0,"y":0,"width":300,"height":200})
    # Show all again restores
    pg.evaluate("game.settings.set('primal-status','hiddenStatuses',[])")
    pg.evaluate("buildHUD('t4')")
    ok("un-hiding restores all icons", pg.evaluate("document.querySelectorAll('.status-effects [data-status-id]').length") == total)
    # Foundry caps the palette's height and scrolls the rest: the palette shows every icon instead
    pg.add_style_tag(content="#token-hud{position:fixed;left:20px;top:10px} #token-hud .status-effects{max-height:150px;overflow-y:auto}")
    # more statuses, as in a real game (dnd5e's conditions and others)
    pg.evaluate("for (let i = 0; i < 30; i++) CONFIG.statusEffects['extra' + i] = { id: 'extra' + i, name: 'Extra ' + String(i).padStart(2, '0'), img: '' };")
    pg.set_viewport_size({"width": 1200, "height": 900})
    pg.evaluate("buildHUD('t5'); document.querySelector('.status-effects').classList.add('active')"); pg.wait_for_timeout(60)
    m = pg.evaluate("(() => { const p = document.querySelector('.status-effects'), r = p.getBoundingClientRect(); return { scroll: p.scrollHeight > p.clientHeight + 1, cols: getComputedStyle(p).gridTemplateColumns.split(' ').length, bottom: r.bottom, n: p.querySelectorAll('[data-status-id]').length }; })()")
    ok(f"every icon shows without scrolling, despite the height cap ({m['n']} icons, {m['cols']} columns)", not m["scroll"] and m["cols"] == 5 and m["bottom"] <= 900)
    pg.set_viewport_size({"width": 1200, "height": 260})
    pg.evaluate("buildHUD('t6'); document.querySelector('.status-effects').classList.add('active')"); pg.wait_for_timeout(60)
    m = pg.evaluate("(() => { const p = document.querySelector('.status-effects'), r = p.getBoundingClientRect(); return { scroll: p.scrollHeight > p.clientHeight + 1, cols: getComputedStyle(p).gridTemplateColumns.split(' ').length, bottom: r.bottom }; })()")
    ok(f"a short screen: more columns instead, still no scrolling and on screen ({m['cols']} columns, bottom {m['bottom']:.0f})", not m["scroll"] and m["cols"] > 5 and m["bottom"] <= 260)
    pg.set_viewport_size({"width": 260, "height": 140})
    pg.evaluate("buildHUD('t7'); document.querySelector('.status-effects').classList.add('active')"); pg.wait_for_timeout(60)
    m = pg.evaluate("(() => { const p = document.querySelector('.status-effects'), r = p.getBoundingClientRect(); return { scroll: p.scrollHeight > p.clientHeight + 1, right: r.right, bottom: r.bottom }; })()")
    ok(f"a tiny screen that can't hold it all: scrolls, but within the screen (right {m['right']:.0f}, bottom {m['bottom']:.0f})", m["scroll"] and m["right"] <= 260 and m["bottom"] <= 140)
    pg.evaluate("document.querySelector('.status-effects').classList.remove('active'); buildHUD('t8')")
    ok("…the palette opening later (Foundry adds the 'active' class) is fitted then", pg.evaluate("(() => { const p = document.querySelector('.status-effects'); p.classList.add('active'); return new Promise(r => setTimeout(() => r(p.style.maxHeight !== '' ), 30)); })()"))
    # With the real English text: Cover (Half), Cover (Three-Quarters), Cover (Total), next to each other
    import os
    lang = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "lang", "en.json")).read()
    pg.set_viewport_size({"width": 1280, "height": 900})
    pg.evaluate(f"(() => {{ const LANG = {lang}; game.i18n = {{ has: k => k in LANG, localize: k => LANG[k] ?? k }}; registerStatuses(); }})()")
    pg.evaluate("buildHUD('t9'); document.querySelector('.status-effects').classList.add('active')"); pg.wait_for_timeout(40)
    seq = pg.evaluate("[...document.querySelectorAll('.status-effects [data-status-id]')].map(i => i.dataset.tooltipText)")
    at = seq.index("Cover (Half)") if "Cover (Half)" in seq else -1
    ok(f"in English: Cover (Half), Cover (Three-Quarters), Cover (Total), one after another ({seq[max(0, at - 1):at + 4]})", at >= 0 and seq[at:at + 3] == ["Cover (Half)", "Cover (Three-Quarters)", "Cover (Total)"])
    ok("no page errors", not errors)
    if errors: print(errors)
    b.close()
print("\n".join(results)); print(sum(r.startswith("PASS") for r in results), "/", len(results))
