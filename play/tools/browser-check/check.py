"""PLAY browser check (plan T-b). Written by the PLAY audit chat on 19 Nov 2026 and adopted here with its say-so; licence GPL-2.0-or-later
(play/LICENSE). Runs headless Chromium, muted, against a running PLAY server.

    python play/tools/browser-check/check.py [base]        base defaults to http://127.0.0.1:8789/play/

What it checks, every run, the same way:
  1. Every card on the shelf boots: first picture time, no page errors.
  2. Layout at 1920x1080, 1278x513, 1316x821, 821x1316 (touch on for the last three): no key off screen, none over the
     picture, none under 56 px.
  3. A fake gamepad (navigator.getGamepads replaced before the page loads): A on the shelf opens a game, A presses Play,
     Back+Start opens the menu, the d-pad moves between its buttons, B closes it, nothing reaches the game meanwhile.
Writes a plain report to audit/play-mode/browser-check/last-run.md (git ignores audit/). Nothing plays aloud (--mute-audio and ?mute=1).
"""
import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'http://127.0.0.1:8789/play/').rstrip('/') + '/'
REPORTS = Path(__file__).resolve().parents[3] / 'audit' / 'play-mode' / 'browser-check'
REPORTS.mkdir(parents=True, exist_ok=True)
OUT = REPORTS / 'last-run.md'
SIZES = [(1920, 1080, False), (1278, 513, True), (1316, 821, True), (821, 1316, True)]

# A pad the test can press: window.__pad.press([ids]) and release.
FAKE_PAD = """
(() => {
  const mk = () => Array.from({length: 17}, () => ({pressed: false, value: 0}));
  const pad = {index: 0, id: 'audit pad', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: mk(), timestamp: 0};
  window.__pad = {
    down(ids) { for (const i of ids) pad.buttons[i] = {pressed: true, value: 1}; pad.timestamp++; },
    up(ids) { for (const i of ids) pad.buttons[i] = {pressed: false, value: 0}; pad.timestamp++; },
  };
  navigator.getGamepads = () => [pad, null, null, null];
  window.__sent = [];
  const pm = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (m, t) {
    if (m && (m.type === 'key' || m.type === 'pad')) window.__sent.push(m.type + ':' + (m.bits ?? m.code) + ':' + (m.down ?? ''));
    return pm.call(this, m, t);
  };
})();
"""

LAYOUT_JS = """() => {
  const R = (e) => e.getBoundingClientRect(); const s = R(document.getElementById('screen')); const bad = [];
  const keys = [...document.querySelectorAll('.pk,.pdpad')].filter((b) => b.offsetParent && !b.closest('.pkeyboard'));
  for (const b of keys) { const q = R(b); const n = (b.textContent || 'dpad').trim();
    if (q.right > innerWidth + 1 || q.bottom > innerHeight + 1 || q.left < -1 || q.top < 52) bad.push('off screen: ' + n);
    if (q.left < s.right && s.left < q.right && q.top < s.bottom && s.top < q.bottom) bad.push('over the picture: ' + n);
    if (q.width < 55 || q.height < 55) bad.push('small: ' + n + ' ' + Math.round(q.width) + 'x' + Math.round(q.height)); }
  const tools = [...document.querySelectorAll('.tools > *')].filter((e) => e.offsetParent);
  for (const t of tools) if (R(t).right > innerWidth + 1) bad.push('tool off screen: ' + t.textContent.trim());
  return { screen: [Math.round(s.width), Math.round(s.height)], keys: keys.length, bad };
}"""


def wait_picture(page, limit=30):
    t0 = time.time()
    page.wait_for_function("document.getElementById('cover').hidden || !document.getElementById('b-play').hidden && /again/i.test(document.getElementById('b-play').textContent)", timeout=limit * 1000)
    ok = page.evaluate("document.getElementById('cover').hidden")
    return ok, round(time.time() - t0, 1), page.evaluate("document.getElementById('status').textContent")


def press(page, ids, hold=0.15):
    page.evaluate(f"window.__pad.down({json.dumps(ids)})"); time.sleep(hold)
    page.evaluate(f"window.__pad.up({json.dumps(ids)})"); time.sleep(hold)


def main():
    lines = ['# PLAY harness run, ' + time.strftime('%Y-%m-%d %H:%M'), '', 'Server: ' + BASE, '']
    fails = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--mute-audio', '--autoplay-policy=no-user-gesture-required'])
        ctx = browser.new_context()
        ctx.add_init_script(FAKE_PAD)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE); page.wait_for_selector('.box')
        cards = page.eval_on_selector_all('.box', "els => els.map(e => new URL(e.href).searchParams.get('game'))")
        if '--pad' in sys.argv: cards = []
        lines += ['## 1 and 2. Every card, four sizes', '', '| Card | Size | Picture | Seconds | Layout |', '|---|---|---|---|---|']
        for card in cards:
            for (w, h, touch) in SIZES:
                errors.clear()
                page.set_viewport_size({'width': w, 'height': h})
                page.goto(f"{BASE}game.html?game={card}&mute=1&touch={1 if touch else 0}")
                page.wait_for_function("!document.getElementById('b-play').hidden", timeout=15000)
                page.click('#b-play')
                ok, secs, status = wait_picture(page)
                time.sleep(0.6)
                lay = page.evaluate(LAYOUT_JS)
                bad = lay['bad'] + ['page error: ' + e for e in errors]
                if not ok or bad: fails += 1
                lines.append(f"| {card} | {w}x{h}{' touch' if touch else ''} | {'yes' if ok else 'NO: ' + status} | {secs} | {'; '.join(bad) or 'ok'} |")
        # 3. The controller path, on one console card and one DOS card.
        lines += ['', '## 3. Gamepad path', '']
        page.set_viewport_size({'width': 1316, 'height': 821})
        page.goto(BASE); page.wait_for_selector('.box'); time.sleep(0.3)
        press(page, [15]); press(page, [0])
        page.wait_for_url('**/game*', timeout=5000)
        lines.append('- Shelf: d-pad right then A opened ' + page.url.split('/')[-1])
        for card in ['super-mario-world', 'oregon-trail-1990']:
            page.goto(f"{BASE}game.html?game={card}&mute=1"); time.sleep(0.8)
            press(page, [0]); ok, secs, _ = wait_picture(page)
            time.sleep(1)
            r = {'card': card, 'A presses Play': ok}
            press(page, [8, 9]); r['Back+Start opens menu'] = page.evaluate("!document.getElementById('menu').hidden")
            page.evaluate('window.__sent.length = 0')
            f0 = page.evaluate('document.activeElement.textContent.trim()')
            press(page, [13]); f1 = page.evaluate('document.activeElement.textContent.trim()')
            press(page, [13]); f2 = page.evaluate('document.activeElement.textContent.trim()')
            r['d-pad focus'] = ' > '.join([f0, f1, f2])
            r['sent to game while open'] = [x for x in page.evaluate('window.__sent.slice()') if not (x.startswith('pad:0:') or x.endswith(':false'))]  # releases are fine
            press(page, [1]); r['B closes menu'] = page.evaluate("document.getElementById('menu').hidden")
            page.evaluate('window.__sent.length = 0')
            press(page, [12]); r['d-pad reaches game after'] = len(page.evaluate('window.__sent')) > 0
            good = r['A presses Play'] and r['Back+Start opens menu'] and f0 != f1 and not r['sent to game while open'] and r['B closes menu'] and r['d-pad reaches game after']
            if not good: fails += 1
            lines.append(f"- {'PASS' if good else 'FAIL'} {json.dumps(r)}")
        # 4. The start screen (block B): art, actions, Play inside the picture, at every size.
        lines += ['', '## 4. Start screen', '', '| Card | Size | Art | Actions | Play inside picture |', '|---|---|---|---|---|']
        for card in ([] if '--pad' in sys.argv else cards):
            for (w, h, touch) in SIZES:
                page.set_viewport_size({'width': w, 'height': h})
                page.goto(f"{BASE}game.html?game={card}&mute=1&touch={1 if touch else 0}")
                page.wait_for_function("!document.getElementById('b-play').hidden", timeout=15000)
                try: page.wait_for_function("(() => { const a = document.getElementById('cover-art'); return a && a.complete; })()", timeout=8000)
                except Exception: pass
                r = page.evaluate("""() => { const a = document.getElementById('cover-art'); const s = document.getElementById('screen').getBoundingClientRect();
                  const vis = (id) => { const e = document.getElementById(id); return e && !e.hidden && e.offsetParent && e.getBoundingClientRect().height > 0; };
                  const b = document.getElementById('b-play').getBoundingClientRect();
                  return { art: !!(a && a.naturalWidth && vis('cover-art')), actions: [...document.querySelectorAll('#cover-actions li')].filter((l) => l.offsetParent).length,
                    inside: b.top >= s.top - 1 && b.bottom <= s.bottom + 1 && b.left >= s.left - 1 && b.right <= s.right + 1 }; }""")
                if not r['inside']: fails += 1
                lines.append(f"| {card} | {w}x{h} | {'yes' if r['art'] else 'no'} | {r['actions']} | {'yes' if r['inside'] else 'NO'} |")
        # 5. Continue (block C): after the menu opens, and after leaving with no menu at all.
        lines += ['', '## 5. Continue', '']
        page.set_viewport_size({'width': 1316, 'height': 821})
        for how in ['menu then reload', 'reload only', 'Games button', 'reload after 35 s']:
            ctx2 = browser.new_context(); ctx2.add_init_script(FAKE_PAD); pg = ctx2.new_page()
            pg.goto(f"{BASE}game.html?game=tetris-game-boy&mute=1"); pg.wait_for_function("!document.getElementById('b-play').hidden")
            pg.click('#b-play'); wait_picture(pg); time.sleep(2)
            if how == 'menu then reload': press(pg, [8, 9]); time.sleep(1); press(pg, [1]); time.sleep(0.5); pg.reload()
            elif how == 'reload only': pg.reload()
            elif how == 'reload after 35 s': time.sleep(34); pg.reload()
            else: pg.click('#b-games'); pg.wait_for_url('**/play/', timeout=8000); pg.goto(f"{BASE}game.html?game=tetris-game-boy&mute=1")
            pg.wait_for_function("!document.getElementById('b-play').hidden"); time.sleep(0.8)
            offered = pg.evaluate("!document.getElementById('b-continue').hidden")
            focused = pg.evaluate("document.activeElement && document.activeElement.id")
            back = ''
            if offered:
                press(pg, [0]); wait_picture(pg); time.sleep(1.5); back = pg.evaluate("document.getElementById('toast').textContent.replace(' Undo','')")
            ok = offered and focused == 'b-continue' and 'left off' in back
            if how != 'reload only' and not ok: fails += 1
            lines.append(f"- {'PASS' if ok else ('NOTE' if how == 'reload only' else 'FAIL')} {how}: Continue offered {offered}, focused {focused}, after A: '{back}'")
            ctx2.close()
        # 6. Pictures of the touch pads, for a look (not scored).
        shots = REPORTS / 'shots'; shots.mkdir(exist_ok=True)
        for card in ([] if '--pad' in sys.argv else cards):
            for (w, h) in [(1316, 821), (821, 1316), (390, 844)]:
                pg = browser.new_page(viewport={'width': w, 'height': h}); pg.goto(f"{BASE}game.html?game={card}&mute=1&touch=1")
                pg.wait_for_function("!document.getElementById('b-play').hidden"); pg.click('#b-play'); wait_picture(pg); time.sleep(0.8)
                lay = pg.evaluate(LAYOUT_JS)
                if lay['bad']: fails += 1; lines.append(f"- {card} {w}x{h}: {'; '.join(lay['bad'])}")
                pg.screenshot(path=str(shots / f"{card}-{w}x{h}.png")); pg.close()
        lines.append(f"- pad pictures in {shots}")
        browser.close()
    lines += ['', f'Problems: {fails}']
    OUT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('\n'.join(lines))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
