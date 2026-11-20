"""PLAY rewind check (auditor chat). Headless, muted. For each console card: frames a second during play (snapshots
every half second must not cause hitches), frames while rewind is held, and whether the picture really goes back.
    python play/tools/browser-check/rewind.py [base]
"""
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent))
from check import FAKE_PAD, press, wait_picture  # noqa: E402

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8789/play/').rstrip('/') + '/'
CARDS = ['pitfall-2600', 'super-mario-world', 'golden-axe-genesis', 'tetris-game-boy', 'punch-out-nes', 'pac-man-game-gear']
COUNT = """(() => { window.__f = []; const W = window.Worker; })()"""
# Count frames by wrapping the canvas draw: putImageData on the game canvas.
HOOK = """(() => { window.__frames = []; const c = document.getElementById('canvas'); const ctx = c.getContext('2d');
  const put = ctx.putImageData.bind(ctx); ctx.putImageData = (...a) => { window.__frames.push(performance.now()); return put(...a); }; })()"""
SIG = """(() => { const c = document.getElementById('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; })()"""


def rate(page, secs):
    page.evaluate('window.__frames.length = 0'); time.sleep(secs)
    t = page.evaluate('window.__frames.slice()')
    gaps = [b - a for a, b in zip(t, t[1:])]
    return round(len(t) / secs, 1), round(max(gaps) if gaps else 0)


def main():
    out = ['# Rewind check, ' + time.strftime('%Y-%m-%d %H:%M'), '', '| Card | fps playing | worst gap ms | fps rewinding | picture went back |', '|---|---|---|---|---|']
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--mute-audio'])
        ctx = b.new_context(viewport={'width': 1316, 'height': 821}); ctx.add_init_script(FAKE_PAD)
        for card in CARDS:
            pg = ctx.new_page(); pg.goto(f'{BASE}game.html?game={card}&mute=1')
            pg.wait_for_function("!document.getElementById('b-play').hidden"); pg.click('#b-play'); wait_picture(pg)
            pg.evaluate(HOOK); time.sleep(3)
            early = pg.evaluate(SIG)
            fps, gap = rate(pg, 4)
            pg.evaluate("window.__pad.down([6])")  # LT held
            rfps, _ = rate(pg, 3)
            seen = pg.evaluate(SIG)
            pg.evaluate("window.__pad.up([6])")
            out.append(f'| {card} | {fps} | {gap} | {rfps} | {"same as 4 s ago" if seen == early else "changed"} |')
            pg.close()
        b.close()
    (Path(__file__).resolve().parents[3] / 'audit' / 'play-mode' / 'browser-check' / 'rewind-last.md').write_text('\n'.join(out) + '\n', encoding='utf-8')
    print('\n'.join(out))


if __name__ == '__main__':
    main()
