import sys, json
from playwright.sync_api import sync_playwright
mod = open(sys.argv[1]).read()
css = open(sys.argv[2]).read()
lang = open(sys.argv[3]).read()
pages = open(sys.argv[4]).read()
shot = sys.argv[5] if len(sys.argv) > 5 else None
mocks = open("mocks.js").read()
results = []
def ok(label, cond): results.append(("PASS " if cond else "FAIL ") + label)

# A stand-in for Foundry's interface: scene controls, sidebar, the zoomable #hud and a Token HUD
core_css = """
html, body { margin:0; height:100%; overflow:hidden; }
body { background: radial-gradient(circle at 40% 45%, #5d6b4a, #3b4530 70%); font-family: Signika, 'DejaVu Sans', sans-serif; color:#eee; }
#scene-controls { position:fixed; left:8px; top:70px; width:44px; height:330px; background:rgba(0,0,0,.55); border:1px solid #444; border-radius:6px; }
#sidebar { position:fixed; right:0; top:0; bottom:0; width:300px; background:#1b1a1f; border-left:1px solid #444; }
#hud { position:absolute; left:0; top:0; transform-origin:0 0; }
#token-hud { position:absolute; display:flex; gap:12px; }
#token-hud .col { display:flex; flex-direction:column; gap:6px; }
#token-hud .middle { width:140px; height:140px; }
#token-hud .middle .art { width:140px; height:140px; border-radius:50%; background: radial-gradient(circle at 50% 35%, #e0b98e 0 20%, transparent 21%), radial-gradient(circle at 50% 95%, #7b3fa0 0 38%, transparent 39%), #2f6f86; box-shadow: 0 0 0 4px #c9b48a; }
#token-hud .control-icon { width:36px; height:36px; border-radius:6px; background:rgba(0,0,0,.6); border:1px solid #777; }
#token-hud .control-icon.on { box-shadow: 0 0 6px #ff6400; border-color:#ff6400; }
#token-hud .right { position:relative; }
#token-hud .palette { position:absolute; left:calc(100% + 8px); top:0; display:none; grid-template-columns:repeat(5,28px); gap:3px; padding:4px; background:rgba(0,0,0,.65); border:1px solid #777; border-radius:5px; }
#token-hud .palette.active { display:grid; }
#token-hud .palette img { width:28px; height:28px; opacity:.45; background:#555; border-radius:3px; }
#token-hud .palette img.active { opacity:1; outline:2px solid #ff6400; }
"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1280, "height": 760}); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.set_content(f"<html><head><style>{core_css}{css}</style></head><body><nav id='scene-controls'></nav><aside id='sidebar'></aside><div id='hud'></div></body></html>")
    pg.add_script_tag(content=mocks)
    pg.evaluate(f"""(() => {{
      const LANG = {lang};
      const PAGES = {pages};
      game.i18n = {{ has: k => k in LANG, localize: k => LANG[k] ?? k }};
      CONFIG.statusEffects.grappled.reference = "Compendium.dnd5e.content24.JournalEntry.phbAppendixCRule.JournalEntryPage.KbQ1k0OIowtZeQgp";
      CONFIG.statusEffects.incapacitated = {{ id: "incapacitated", name: "Incapacitated", img: "inc.svg", description: "<p>You can't take any action, Bonus Action, or Reaction.</p>" }};
      CONFIG.statusEffects.unconscious = {{ id: "unconscious", name: "Unconscious", img: "unc.svg", description: "<p><strong>Inert.</strong> You have the Incapacitated and Prone conditions, and you drop whatever you're holding.</p>" }};
      CONFIG.statusEffects.prone.description = "<p><strong>Restricted Movement.</strong> Your only movement options are to crawl or to spend half your Speed to stand up.</p>";
      window.__enriched = [];
      foundry.applications.ux = {{ TextEditor: {{ implementation: {{ enrichHTML: async (t, o) => {{ __enriched.push(t);
        return t.replace(/@Embed\\[[^\\]]*KbQ1k0OIowtZeQgp inline\\]/, "<p><strong>Speed 0.</strong> Your Speed is 0 and can't increase.</p><p><strong>Attacks Affected.</strong> You have Disadvantage on attack rolls against any target other than the grappler.</p><p><strong>Movable.</strong> The grappler can drag or carry you when it moves, but every foot of movement costs it 1 extra foot unless you are Tiny or two or more sizes smaller than it.</p>")
          .replace(/@Embed\\[([^\\] ]+) inline\\]/g, (m, u) => __pages[u] ?? `<p>EMBED(${{u}})</p>`); }} }} }} }};
      window.__pages = PAGES;
      CONFIG.DND5E = {{ rules: {{ concentrating: "Compendium.dnd5e.content24.JournalEntry.phbAppendixDRule.JournalEntryPage.ow58p27ctAnr4VPH",
        cover: "Compendium.dnd5e.content24.JournalEntry.phbAppendixDRule.JournalEntryPage.W7f7PcRubNUMIq2S" }} }};
      game.packs = new Map([["dnd5e.content24", {{}}]]);
      CONFIG.statusEffects.concentrating = {{ id: "concentrating", name: "Concentrating", img: "conc.svg" }};
      CONFIG.statusEffects.coverHalf = {{ id: "coverHalf", name: "Half Cover", img: "cover.svg" }};
      CONFIG.statusEffects.marked = {{ id: "marked", name: "Marked", img: "marked.svg" }};
    }})()""")
    pg.add_script_tag(content=mod)
    pg.evaluate("callHook('init'); callHook('setup'); callHook('ready');")
    pg.evaluate("""(() => {
      const fx = (o) => ({ disabled: false, active: true, uuid: 'Actor.a.ActiveEffect.' + o.id, _stats: { modifiedTime: 1 }, ...o, statuses: new Set(o.statuses) });
      window.__actor = { uuid: 'Actor.a', name: 'Drubblewick', statuses: new Set(['grappled', 'prone', 'contamination', 'unconscious', 'incapacitated', 'concentrating', 'coverHalf', 'marked']), effects: [] };
      __actor.effects = [
        fx({ id: 'g', name: 'Grappled', img: 'modules/primal-status/icons/haste.svg', statuses: ['grappled'],
             description: '@Embed[Compendium.dnd5e.content24.JournalEntry.phbAppendixCRule.JournalEntryPage.KbQ1k0OIowtZeQgp inline]' }),
        fx({ id: 'c', name: 'Contamination (3)', img: 'modules/primal-status/icons/contamination-3.svg', statuses: ['contamination'], description: '' }),
        fx({ id: 'u', name: 'Unconscious', img: 'unc.svg', statuses: ['unconscious', 'incapacitated', 'prone'], description: '' }),
        fx({ id: 'off', name: 'Old Blindness', statuses: ['blinded'], disabled: true, description: '<p>should not show</p>' }),
        fx({ id: 'conc', name: 'Concentrating: Bless', img: 'conc.svg', statuses: ['concentrating'], description: '<p>Concentrating on <em>Bless</em>.</p><p><img src="huge-picture.webp" width="512" height="512"></p>' }),
        fx({ id: 'cov', name: 'Cover (Half)', img: 'cover.svg', statuses: ['coverHalf'], description: '' }),
        fx({ id: 'mk', name: "Hunter's Mark", img: 'marked.svg', statuses: ['marked'], description: '' }),
        fx({ id: 'rage', name: 'Rage', statuses: [], description: '<p>no status: not in the pane</p>' })
      ];
      const net = { documentName: 'Item', name: 'Net', parent: __actor };
      const netFx = fx({ id: 'n', name: 'Caught in a Net', img: 'p.svg', statuses: ['prone'], description: '<p>Knocked flat by a weighted net.</p>', parent: net, duration: { label: '1 Round' } });
      __actor.allApplicableEffects = function* () { yield* __actor.effects; yield netFx; };
    })()""")
    pg.evaluate("""window.makeHUD = (left, top, open = true) => {
      document.querySelector('#token-hud')?.remove();
      const hud = document.createElement('div'); hud.id = 'token-hud'; hud.className = 'placeable-hud';
      hud.style.left = left + 'px'; hud.style.top = top + 'px';
      const ids = ['blinded','grappled','prone','contamination','incapacitated','unconscious','hasted','concentrating','coverHalf','marked'];
      hud.innerHTML = `<div class="col left"><div class="control-icon"></div><div class="control-icon"></div><div class="control-icon"></div></div>
        <div class="col middle"><div class="art"></div></div>
        <div class="col right"><div class="control-icon"></div><div class="control-icon on" data-action="togglePalette"></div><div class="control-icon"></div>
        <div class="palette status-effects ${open ? 'active' : ''}" data-palette="effects">${ids.map(id => `<img class="effect-control ${['blinded','hasted'].includes(id) ? '' : 'active'}" data-action="effect" data-status-id="${id}" data-tooltip-text="${CONFIG.statusEffects[id]?.name ?? id}" src="${CONFIG.statusEffects[id]?.img ?? ''}">`).join('')}</div></div>`;
      document.getElementById('hud').append(hud);
      window.__hud = { object: { id: 't1', name: 'Drubblewick', actor: __actor }, element: hud, rendered: true };
      canvas.tokens.hud = __hud;
      callHook('renderTokenHUD', __hud, hud);
      return hud;
    }""")
    pg.evaluate("makeHUD(260, 170)")
    pg.wait_for_timeout(250)
    pane = lambda: pg.evaluate("(() => { const e = document.getElementById('mg-status-pane'); return e ? { hidden: e.hidden, html: e.innerHTML } : null; })()")
    rect = lambda sel: pg.evaluate(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return {{ l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }}; }})()")
    overlap = lambda a, c: not (a["r"] <= c["l"] or c["r"] <= a["l"] or a["b"] <= c["t"] or c["b"] <= a["t"])
    P = pane() or {"hidden": True, "html": ""}
    ok("pane shows when the palette is open", not P["hidden"] and "mg-sp-effect" in P["html"])
    h = P["html"]
    ok("full rules text for Grappled", "Speed 0." in h and "Movable." in h)
    ok("item effect: its own text, source and time left", "Caught in a Net" in h and "weighted net" in h and "<small>Net</small>" in h and pg.evaluate("[...document.querySelectorAll('#mg-status-pane .mg-sp-time')].map(t => t.textContent.trim())") == ["1 Round"])
    ok("effect without text shows the status's rules (Contamination)", "Contamination (3)" in h and "Monstrous Transformation" in h)
    ok("Unconscious shows its rules plus Incapacitated's, each once", h.count("drop whatever you're holding") == 1 and h.count("Bonus Action, or Reaction") == 1)
    ok("Prone's rules appear once though two effects give it", h.count("Restricted Movement.") == 1)
    ok("Concentrating: the spell's text plus the SRD Concentration rule", "Concentrating on" in h and "Another Concentration Effect." in h)
    ok("pictures in the text kept small", 'width="512"' not in h and "max-width: 32px" in h)
    ok("Cover (Half) shows the full SRD Cover rule", "Cover provides a degree of protection" in h)
    ok("the cover status is renamed Cover (Half) so the cover icons sit together", pg.evaluate("CONFIG.statusEffects.coverHalf.name") == "Cover (Half)")
    ok("a status with no rules says so", "No description." in h)
    ok("disabled effects and effects without a status left out", "should not show" not in h and "no status" not in h)
    ok("header names the creature", "Active statuses" in h and "Drubblewick" in h)
    ok("palette icons keep their plain name tooltips", pg.evaluate("[...document.querySelectorAll('.palette [data-status-id]')].every(i => i.dataset.tooltipText && !i.hasAttribute('data-tooltip-html'))"))
    order = pg.evaluate("[...document.querySelectorAll('#mg-status-pane .mg-sp-effect header strong')].map(s => s.textContent)")
    ok(f"effects listed in palette order: alphabetical, Monsters of Drakkenheim last ({order})", order[:4] == ["Concentrating: Bless", "Cover (Half)", "Grappled", "Unconscious"] and order[-1] == "Contamination (3)")
    # placement: right of the palette, clear of the icons and the HUD
    pr, hr, sr = rect("#mg-status-pane"), rect(".palette.status-effects"), rect("#token-hud")
    # level with the palette's top when everything fits below it; otherwise moved up just enough (here: this long text needs the whole height)
    level = lambda pr, hr: abs(pr["t"] - hr["t"]) < 2 or (pr["t"] < hr["t"] and abs(pr["b"] - (pg.evaluate("innerHeight") - 8)) < 2)
    ok("pane sits to the right of the palette, level with its top or moved up to fit", pr["l"] >= hr["r"] + 4 and level(pr, hr))
    ok("long text runs to the bottom of the screen", 740 <= pr["b"] <= 753)
    ok("pane doesn't cover the icons or the HUD", not overlap(pr, hr) and not overlap(pr, sr))
    ok("pane stays clear of the sidebar and on screen", pr["r"] <= 1280 - 300 and pr["b"] <= 760 and pr["t"] >= 0)
    if shot: pg.screenshot(path=shot)
    # hover an icon: its text is highlighted in the pane
    pg.hover('[data-status-id="incapacitated"]'); pg.wait_for_timeout(80)
    hl = pg.evaluate("[...document.querySelectorAll('#mg-status-pane .mg-sp-hl')].map(n => n.className + ':' + (n.dataset.statusId ?? n.dataset.statuses))")
    ok("hovering Incapacitated highlights its rules in the Unconscious section", any("mg-sp-effect" in x and "unconscious" in x for x in hl) and any("mg-sp-rules" in x and x.endswith("incapacitated") for x in hl))
    if shot: pg.screenshot(path=shot.replace(".png", "-hover.png"))
    pg.hover('[data-status-id="grappled"]'); pg.wait_for_timeout(80)
    hl = pg.evaluate("[...document.querySelectorAll('#mg-status-pane .mg-sp-hl')].map(n => n.dataset.statuses ?? n.dataset.statusId)")
    ok("hovering another icon moves the highlight", "grappled" in hl and not any("unconscious" in (x or "") for x in hl))
    pg.mouse.move(700, 700); pg.wait_for_timeout(80)
    ok("leaving the palette clears the highlight", pg.evaluate("document.querySelectorAll('#mg-status-pane .mg-sp-hl').length") == 0)
    # palette closed / reopened
    pg.evaluate("document.querySelector('.palette.status-effects').classList.remove('active')"); pg.wait_for_timeout(120)
    ok("pane hides when the palette closes", pane()["hidden"])
    pg.evaluate("document.querySelector('.palette.status-effects').classList.add('active')"); pg.wait_for_timeout(120)
    ok("…and comes back when it opens", not pane()["hidden"])
    # follows the HUD (pan / token moved)
    pg.evaluate("document.getElementById('token-hud').style.top = '260px'"); pg.wait_for_timeout(120)
    pr, hr = rect("#mg-status-pane"), rect(".palette.status-effects")
    ok("pane follows the HUD when the view moves", level(pr, hr) and pr["l"] >= hr["r"])
    # zoomed out: HUD shrinks, pane text doesn't
    fs0 = pg.evaluate("getComputedStyle(document.getElementById('mg-status-pane')).fontSize")
    pg.evaluate("document.getElementById('hud').style.transform = 'scale(0.6)'"); pg.wait_for_timeout(120)
    pr, hr = rect("#mg-status-pane"), rect(".palette.status-effects")
    fs = pg.evaluate("getComputedStyle(document.getElementById('mg-status-pane')).fontSize")
    ok(f"zoomed out: pane stays beside the palette, its text not shrunk with the canvas ({fs0} → {fs})", pr["l"] >= hr["r"] and not overlap(pr, hr) and fs == fs0 and fs in ("13px", "12px", "11px"))
    pg.evaluate("document.getElementById('hud').style.transform = ''")
    # near the sidebar: flips to the left of the whole HUD
    pg.evaluate("makeHUD(700, 200)"); pg.wait_for_timeout(250)
    pr, hr, sr = rect("#mg-status-pane"), rect(".palette.status-effects"), rect("#token-hud")
    ok("no room on the right: pane goes left of the HUD", pr["r"] <= sr["l"] and pr["r"] <= hr["l"] and not overlap(pr, hr))
    ok("…and clear of the scene controls", pr["l"] >= rect("#scene-controls")["r"])
    if shot: pg.screenshot(path=shot.replace(".png", "-left.png"))
    pg.evaluate("makeHUD(260, 170)"); pg.wait_for_timeout(250)
    # long text: limited to the screen and scrollable
    pg.evaluate("document.getElementById('token-hud').style.top = '560px'"); pg.wait_for_timeout(150)
    pr = rect("#mg-status-pane")
    sc = pg.evaluate("(() => { const e = document.getElementById('mg-status-pane'); return e.scrollHeight > e.clientHeight && getComputedStyle(e).overflowY === 'auto'; })()")
    ok("tall pane kept on screen and scrollable", pr["t"] >= 0 and pr["b"] <= 760 and sc)
    ok("palette low on screen: pane moves up to keep room to read", pr["h"] >= 350 and pr["t"] < rect(".palette.status-effects")["t"])
    pg.evaluate("document.getElementById('token-hud').style.top = '170px'"); pg.wait_for_timeout(120)
    # a status toggled with the HUD open
    pg.evaluate("""__actor.effects.push({ id:'h', uuid:'Actor.a.ActiveEffect.h', name:'Haste', img:'modules/primal-status/icons/haste.svg', statuses:new Set(['hasted']), disabled:false, active:true, description: CONFIG.statusEffects.hasted.description, _stats:{modifiedTime:2} });
      __actor.statuses.add('hasted'); document.querySelector('[data-status-id="hasted"]').classList.add('active');""")
    pg.wait_for_timeout(250)
    ok("status toggled on with the HUD open appears in the pane", "Speed doubled" in pane()["html"])
    pg.evaluate("""__actor.effects = __actor.effects.filter(e => e.id !== 'h'); __actor.statuses.delete('hasted'); document.querySelector('[data-status-id="hasted"]').classList.remove('active');""")
    pg.wait_for_timeout(250)
    ok("…and leaves when toggled off", "Speed doubled" not in pane()["html"])
    pg.evaluate("""const e = __actor.effects.find(e => e.id === 'c'); e.name = 'Contamination (4)'; e._stats.modifiedTime = 5; callHook('updateActiveEffect', Object.assign(e, { parent: __actor }));""")
    pg.wait_for_timeout(200)
    ok("level change refreshes the pane", "Contamination (4)" in pane()["html"])
    # scroll position kept across a refresh
    pg.evaluate("document.getElementById('mg-status-pane').scrollTop = 120; const e = __actor.effects.find(e => e.id === 'c'); e.name = 'Contamination (5)'; e._stats.modifiedTime = 6; callHook('updateActiveEffect', e);")
    pg.wait_for_timeout(200)
    ok("refresh keeps the pane's scroll position", pg.evaluate("document.getElementById('mg-status-pane').scrollTop") > 60)
    # setting off / on
    pg.evaluate("game.settings.set('primal-status', 'statusTooltips', false)"); pg.wait_for_timeout(150)
    ok("setting off hides the pane", pane()["hidden"])
    pg.evaluate("game.settings.set('primal-status', 'statusTooltips', true)"); pg.wait_for_timeout(200)
    ok("setting on brings it back", not pane()["hidden"])
    # remove buttons and time left
    ok("no remove buttons on effects the user can't change", pg.evaluate("document.querySelectorAll('#mg-status-pane .mg-sp-remove').length") == 0)
    pg.evaluate("""(() => { window.__deleted = [];
      for (const e of __actor.effects) { e.parent = __actor; e.isOwner = true;
        e.delete = async function () { __deleted.push(this.id); __actor.effects = __actor.effects.filter(x => x !== this);
          for (const s of this.statuses) if (!__actor.effects.some(x => x.statuses.has(s))) __actor.statuses.delete(s);
          callHook('deleteActiveEffect', this, {}, 'me'); return this; }; }
      callHook('updateActiveEffect', __actor.effects[0]); })()""")
    pg.wait_for_timeout(250)
    btns = pg.evaluate("[...document.querySelectorAll('#mg-status-pane .mg-sp-remove')].map(b => [b.dataset.effectId, b.getAttribute('aria-label')])")
    ok(f"owner: a remove button on each of the creature's own effects ({len(btns)})", len(btns) == 6 and ["mk", "Remove Hunter's Mark"] in btns)
    ok("…but not on the one its Net carries (an item's effect)", not any(b[0] == "n" for b in btns))
    shot_dir = __import__("os").environ.get("PANE_SHOT")
    if shot_dir: pg.locator("#mg-status-pane").screenshot(path=shot_dir)
    pg.click("#mg-status-pane .mg-sp-remove[data-effect-id='mk']"); pg.wait_for_timeout(300)
    ok("clicking it removes the effect", pg.evaluate("__deleted") == ["mk"])
    ok("…the pane drops it", "Hunter's Mark" not in pane()["html"] and not pane()["hidden"])
    ok("…and the palette shows Marked as off", pg.evaluate("!document.querySelector('.palette [data-status-id=\"marked\"]').classList.contains('active')"))
    ok("…while the HUD stays open", pg.evaluate("document.querySelector('.palette.status-effects').classList.contains('active')"))
    pg.evaluate("""(() => { const d = { id:'dg', uuid:'Actor.a.ActiveEffect.dg', name:'Dodging', img:'dodge.svg', statuses:new Set(['dodging']), disabled:false, active:true, description:'', _stats:{modifiedTime:3}, parent: __actor, isOwner: true };
      __actor.effects.push(d); __actor.statuses.add('dodging');
      game.combat = { started: true, combatants: [{ actor: __actor }] }; callHook('createActiveEffect', d); })()""")
    pg.wait_for_timeout(250)
    ok("Dodging in combat says it lasts until the creature's next turn", "Until its next turn" in pg.evaluate("[...document.querySelectorAll('#mg-status-pane .mg-sp-time')].map(t => t.textContent).join('|')"))
    pg.evaluate("game.combat = null; const d = __actor.effects.find(e => e.id === 'dg'); callHook('updateActiveEffect', d)"); pg.wait_for_timeout(250)
    ok("…and out of combat it has no time limit", "Until its next turn" not in pane()["html"])
    pg.evaluate("const d = __actor.effects.find(e => e.id === 'dg'); d.duration = { label: 'None', remaining: null }; d._stats.modifiedTime = 4; callHook('updateActiveEffect', d)"); pg.wait_for_timeout(250)
    ok("an effect that lasts until removed shows no time", pg.evaluate("[...document.querySelectorAll('#mg-status-pane .mg-sp-time')].map(t => t.textContent.trim())") == ["1 Round"])
    pg.evaluate("const d = __actor.effects.find(e => e.id === 'dg'); d.duration = { label: '3 Rounds', remaining: 3 }; d._stats.modifiedTime = 5; callHook('updateActiveEffect', d)"); pg.wait_for_timeout(250)
    ok("one with rounds left shows them", pg.evaluate("[...document.querySelectorAll('#mg-status-pane .mg-sp-time')].map(t => t.textContent.trim())") == ["1 Round", "3 Rounds"])
    pg.evaluate("__actor.effects = __actor.effects.filter(e => e.id !== 'dg'); __actor.statuses.delete('dodging')")
    # Valor (X), Jinxed (X), Burning (X): a box for X in the pane
    pg.evaluate("""(() => { window.__updates = []; window.__winKeys = 0; window.addEventListener('keydown', () => __winKeys++);
      const v = { id:'vl', uuid:'Actor.a.ActiveEffect.vl', name:'Valor', img:'modules/primal-status/icons/valor.svg', statuses:new Set(['valor']), disabled:false, active:true, description:'',
        _stats:{modifiedTime:1}, parent: __actor, isOwner: true, flags: {}, delete: async function () { return this; },
        update: async function (d) { __updates.push(d); if (d.name) this.name = d.name; this.flags['primal-status'] = { ...(this.flags['primal-status'] ?? {}), value: d['flags.primal-status.value'] };
          this._stats.modifiedTime++; callHook('updateActiveEffect', this, d, {}, 'me'); return this; } };
      __actor.effects.push(v); __actor.statuses.add('valor'); callHook('createActiveEffect', v, {}, 'me'); })()""")
    pg.wait_for_timeout(300)
    box = "#mg-status-pane .mg-sp-value-input[data-effect-id='vl']"
    ok("Valor shows a box for X with the usual dice, at 1d4 to start", pg.evaluate(f"document.querySelector(\"{box}\")?.value") == "1d4"
       and pg.evaluate("[...document.querySelectorAll('#mg-status-pane .mg-sp-chip[data-effect-id=vl]')].map(c => c.dataset.value)") == ["1d4", "1d6", "1d8", "1d10", "1d12"])
    ok("…focused and selected right after you put Valor on, ready to type", pg.evaluate(f"document.activeElement === document.querySelector(\"{box}\") && document.activeElement.selectionEnd - document.activeElement.selectionStart === 3"))
    pg.keyboard.type("d8"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    ok(f"typing d8 and Enter sets it, in the flag and the name ({pg.evaluate('__updates')})", pg.evaluate("__updates") == [{"flags.primal-status.value": "1d8", "name": "Valor (1d8)"}])
    ok("…the pane shows Valor (1d8), keeps the box focused, and the keys never reached Foundry", "Valor (1d8)" in pane()["html"] and pg.evaluate(f"document.activeElement === document.querySelector(\"{box}\")") and pg.evaluate("__winKeys") == 0)
    pg.click("#mg-status-pane .mg-sp-chip[data-effect-id='vl'][data-value='1d12']"); pg.wait_for_timeout(300)
    ok("a dice button sets it in one click", pg.evaluate("__updates.at(-1)") == {"flags.primal-status.value": "1d12", "name": "Valor (1d12)"} and pg.evaluate(f"document.querySelector(\"{box}\").value") == "1d12"
       and pg.evaluate("document.querySelector('#mg-status-pane .mg-sp-chip[data-effect-id=vl].active')?.dataset.value") == "1d12")
    if shot: pg.locator("#mg-status-pane").screenshot(path=shot.replace(".png", "-value.png"))
    pg.fill(box, "banana"); pg.press(box, "Enter"); pg.wait_for_timeout(200)
    ok("something that isn't a roll is marked and not saved", len(pg.evaluate("__updates")) == 2 and pg.evaluate(f"document.querySelector(\"{box}\").classList.contains('mg-sp-invalid')"))
    pg.fill(box, "2d"); pg.evaluate("const c = __actor.effects.find(e => e.id === 'c'); c._stats.modifiedTime = 50; c.name = 'Contamination (2)'; callHook('updateActiveEffect', c)"); pg.wait_for_timeout(250)
    ok("half-typed text survives the pane refreshing for something else", pg.evaluate(f"document.querySelector(\"{box}\").value") == "2d" and pg.evaluate(f"document.activeElement === document.querySelector(\"{box}\")") and "Contamination (2)" in pane()["html"])
    pg.press(box, "Escape")
    pg.evaluate("""(() => { const bn = { id:'bn', uuid:'Actor.a.ActiveEffect.bn', name:'Burning (2d6)', img:'burn.svg', statuses:new Set(['burning']), disabled:false, active:true, description:'', _stats:{modifiedTime:1}, parent: { ...__actor, isOwner: false, uuid: 'Actor.a' }, isOwner: false, flags: {} };
      __actor.effects.push(bn); __actor.statuses.add('burning'); callHook('createActiveEffect', bn, {}, 'someone-else'); })()""")
    pg.wait_for_timeout(300)
    row = pg.evaluate("document.querySelector('#mg-status-pane .mg-sp-effect[data-statuses=burning] .mg-sp-value')?.textContent ?? ''")
    ok(f"someone who can't change it just sees X ({row.strip()})", "damage at the end of each turn" in row and "2d6" in row and pg.evaluate("!document.querySelector('#mg-status-pane .mg-sp-effect[data-statuses=burning] input')"))
    pg.evaluate("__actor.effects = __actor.effects.filter(e => e.id !== 'bn')")
    # Burning's damage type: Fire / Acid buttons of their own, apart from the dice box
    pg.evaluate("""(() => { const b = { id:'bo', uuid:'Actor.a.ActiveEffect.bo', name:'Burning', img:'burn.svg', statuses:new Set(['burning']), disabled:false, active:true, description:'',
        _stats:{modifiedTime:1}, parent: __actor, isOwner: true, flags: {}, delete: async function () { return this; },
        update: async function (d) { __updates.push(d); if (d.name) this.name = d.name; this.flags['primal-status'] = { ...(this.flags['primal-status'] ?? {}), value: d['flags.primal-status.value'] };
          this._stats.modifiedTime++; callHook('updateActiveEffect', this, d, {}, 'me'); return this; } };
      __actor.effects.push(b); callHook('createActiveEffect', b, {}, 'someone-else'); })()""")
    pg.wait_for_timeout(300)
    bbox = "#mg-status-pane .mg-sp-value-input[data-effect-id='bo']"
    types = lambda: pg.evaluate("[...document.querySelectorAll('#mg-status-pane .mg-sp-type[data-effect-id=bo]')].map(c => c.dataset.type + (c.classList.contains('active') ? '*' : ''))")
    ok(f"Burning has Fire and Acid buttons, Fire picked to start ({types()})", types() == ["fire*", "acid"])
    ok("…and its dice buttons and box hold only the dice", pg.evaluate("[...document.querySelectorAll('#mg-status-pane .mg-sp-chip[data-effect-id=bo]:not(.mg-sp-type)')].map(c => c.dataset.value)") == ["1d4", "1d6", "2d4", "2d6", "4d6"]
       and pg.evaluate(f"document.querySelector(\"{bbox}\").value") == "1d4")
    n = len(pg.evaluate("__updates"))
    pg.click("#mg-status-pane .mg-sp-type[data-effect-id='bo'][data-type='acid']"); pg.wait_for_timeout(300)
    ok(f"Acid keeps the dice: Burning (1d4 Acid) ({pg.evaluate('__updates.at(-1)')})", pg.evaluate("__updates.at(-1)") == {"flags.primal-status.value": "1d4 Acid", "name": "Burning (1d4 Acid)"}
       and types() == ["fire", "acid*"] and pg.evaluate(f"document.querySelector(\"{bbox}\").value") == "1d4")
    pg.click("#mg-status-pane .mg-sp-chip[data-effect-id='bo'][data-value='2d6']"); pg.wait_for_timeout(300)
    ok("a dice button keeps the type: 2d6 Acid", pg.evaluate("__updates.at(-1)['flags.primal-status.value']") == "2d6 Acid" and types() == ["fire", "acid*"])
    pg.fill(bbox, "4d6"); pg.press(bbox, "Enter"); pg.wait_for_timeout(300)
    ok("so does typing dice in the box: 4d6 Acid", pg.evaluate("__updates.at(-1)['flags.primal-status.value']") == "4d6 Acid" and pg.evaluate(f"document.querySelector(\"{bbox}\").value") == "4d6")
    if shot: pg.locator("#mg-status-pane").screenshot(path=shot.replace(".png", "-burning.png"))
    pg.fill(bbox, "2d4 cold"); pg.press(bbox, "Enter"); pg.wait_for_timeout(300)
    ok(f"typing a type still works, and shows as its own button ({types()})", pg.evaluate("__updates.at(-1)['flags.primal-status.value']") == "2d4 Cold" and types() == ["fire", "acid", "cold*"])
    pg.click("#mg-status-pane .mg-sp-type[data-effect-id='bo'][data-type='fire']"); pg.wait_for_timeout(300)
    ok("Fire again: Burning (2d4), fire being Burning's own type", pg.evaluate("__updates.at(-1)") == {"flags.primal-status.value": "2d4", "name": "Burning (2d4)"} and types() == ["fire*", "acid"])
    ok("…one update per change", len(pg.evaluate("__updates")) == n + 5)
    pg.evaluate("__actor.effects = __actor.effects.filter(e => !['vl', 'bo'].includes(e.id)); __actor.statuses.delete('valor'); __actor.statuses.delete('burning')")
    # HUD closed
    pg.evaluate("callHook('closeTokenHUD', __hud); document.getElementById('token-hud').remove(); __hud.rendered = false"); pg.wait_for_timeout(120)
    ok("pane hides when the HUD closes", pane()["hidden"])
    # creature with no statuses
    pg.evaluate("window.__saved = __actor.effects; __actor.effects = []; __actor.allApplicableEffects = function* () {}; makeHUD(260, 170)"); pg.wait_for_timeout(200)
    ok("no active statuses: no pane", pane()["hidden"])
    ok("only one pane element", pg.evaluate("document.querySelectorAll('#mg-status-pane').length") == 1)
    # A typical screen with the HUD in the middle: every status shows, in columns, with no scrolling
    pg.set_viewport_size({"width": 1920, "height": 1000})
    pg.evaluate("__actor.effects = __saved; delete __actor.allApplicableEffects; makeHUD(820, 140)"); pg.wait_for_timeout(300)
    lay = lambda: pg.evaluate("""(() => { const e = document.getElementById('mg-status-pane'), r = e.getBoundingClientRect(), b = e.querySelector('.mg-sp-body');
      return { cols: Number(b.style.columnCount || 1), l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, scrolls: e.scrollHeight > e.clientHeight + 1,
        font: getComputedStyle(e).fontSize, split: [...e.querySelectorAll('.mg-sp-effect')].some(s => s.getClientRects().length > 1) }; })()""")
    L = lay(); pr, hr, sr = rect("#mg-status-pane"), rect(".palette.status-effects"), rect("#token-hud")
    if shot: pg.screenshot(path=shot.replace(".png", "-columns.png"))
    ok(f"many statuses: the pane uses {L['cols']} columns and shows them all without scrolling", L["cols"] >= 2 and not L["scrolls"])
    ok(f"…on screen, clear of the HUD and the sidebar ({L['l']:.0f}–{L['r']:.0f} × {L['t']:.0f}–{L['b']:.0f})", L["t"] >= 0 and L["b"] <= 1000 and L["r"] <= 1920 - 300 and not overlap(pr, hr) and not overlap(pr, sr) and L["l"] >= rect("#scene-controls")["r"])
    ok("…no status is split between two columns", not L["split"])
    ok("…and the header runs across the top", pg.evaluate("(() => { const h = document.querySelector('#mg-status-pane .mg-sp-head').getBoundingClientRect(), e = document.getElementById('mg-status-pane').getBoundingClientRect(); return h.width > e.width * 0.9; })()"))
    # A few statuses: one column, full size, as before
    pg.evaluate("""window.__all = __actor.effects; __actor.effects = [{ id: 'sh', uuid: 'Actor.a.ActiveEffect.sh', name: 'Haste', img: 'modules/primal-status/icons/haste.svg', statuses: new Set(['hasted']),
      disabled: false, active: true, description: '<p>Speed doubled, +2 AC, Advantage on Dexterity saves, an extra limited action.</p>', _stats: { modifiedTime: 9 } }]; makeHUD(820, 140)"""); pg.wait_for_timeout(300)
    L = lay()
    ok(f"a few statuses: one column at the usual width and text size ({L['w']:.0f}px, {L['font']})", L["cols"] == 1 and round(L["w"]) == 380 and L["font"] == "13px" and not L["scrolls"])
    ok("…level with the top of the palette", abs(L["t"] - rect(".palette.status-effects")["t"]) < 2)
    # A short screen with little room: as many columns as fit, smaller text, and only then scrolling
    pg.set_viewport_size({"width": 1280, "height": 600})
    pg.evaluate("__actor.effects = __all; makeHUD(500, 100)"); pg.wait_for_timeout(300)
    L = lay()
    ok(f"little room: the closest fit ({L['cols']} columns, {L['font']}), scrolling only the rest, still on screen", L["t"] >= 0 and L["b"] <= 600 and (not L["scrolls"] or L["font"] == "11px"))
    pg.set_viewport_size({"width": 1280, "height": 760})
    ok("stylesheet linked even if module.json wasn't re-read", pg.evaluate("[...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href.endsWith('modules/primal-status/styles/primal-status.css'))"))
    ok("no page errors", not errors)
    if errors: print(errors)
    b.close()
print("\n".join(results)); print(sum(r.startswith("PASS") for r in results), "/", len(results))
