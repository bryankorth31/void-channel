# VOIDtv app icons: vector marks (SVG) and every platform size (PNG/ICO), rendered with the Edge already
# on this PC and downscaled with Pillow. Nothing in the app or site is touched; output goes to brand-kit/.
# Run:  python brand-kit/tools/make_app_icons.py
import math, os, subprocess, tempfile
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'app-icons')
MARK = os.path.join(ROOT, 'marks')
for d in (OUT, MARK): os.makedirs(d, exist_ok=True)
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
FONT = os.path.join(ROOT, '..', 'assets', 'brand', 'fonts', 'unbounded-latin.woff2').replace('\\', '/')
TMP = tempfile.mkdtemp(prefix='voidicons-')
import base64
FONT64 = base64.b64encode(open(FONT, 'rb').read()).decode()  # an SVG shown through <img> cannot load external files, so the font rides inside

BLACK, ORANGE, BLUE, GREEN, WHITE, GOLD, CYAN, INK = '#000000', '#f7960f', '#29a3f2', '#2cf01a', '#f2f2f2', '#f2a93b', '#5fd4ff', '#07080c'

V = 'M52 100H146L256 352L366 100H460L270 479H242Z'
T = 'M159 67H358V130H346C340 110 330 103 312 103H293V248L315 259V271H197V259L219 248V103H200C182 103 172 110 166 130H159Z'

def arc(cx, cy, r, a0, a1):
    p = lambda a: (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
    (x0, y0), (x1, y1) = p(a0), p(a1)
    return f'M{x0:.1f} {y0:.1f}A{r} {r} 0 {1 if a1 - a0 > 180 else 0} 1 {x1:.1f} {y1:.1f}'

def swirl():
    rings = [(232, 30, GREEN, 0), (200, 22, WHITE, 70), (168, 20, GREEN, 140), (138, 16, '#7d7d7d', 210), (110, 16, WHITE, 280), (84, 12, GREEN, 350), (60, 10, '#5a5a5a', 60)]
    out = []
    for i, (r, w, col, a0) in enumerate(rings):
        cx, cy = 256 + i * 5, 256 - i * 3
        out.append(f'<path d="{arc(cx, cy, r, a0, a0 + 235)}" stroke="{col}" stroke-width="{w}" stroke-linecap="round" fill="none"/>')
    return ''.join(out)

def letters(v=BLUE, t=ORANGE, outline=BLACK, ow=16):
    o = f'stroke="{outline}" stroke-width="{ow}" stroke-linejoin="round" paint-order="stroke"' if outline else ''
    return f'<path d="{V}" fill="{v}" {o}/><path d="{T}" fill="{t}" {o}/>'

def svg(body, w=512, h=512):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{body}</svg>'

DISC = f'<circle cx="256" cy="256" r="252" fill="{BLACK}"/>'
marks = {
    # the full mark: for 64px and up (app icons, splash, about pages, merch)
    'mark-full': svg(DISC + swirl() + letters()),
    # the small mark: for 16-48px (favicons, tabs, taskbar, notifications) - no swirl, one ring, heavier outline
    'mark-small': svg(DISC + f'<circle cx="256" cy="256" r="226" fill="none" stroke="{GREEN}" stroke-width="30"/>' + f'<g transform="translate(256 262) scale(1.06) translate(-256 -262)">{letters(ow=22)}</g>'),
    # single-ink versions: screen printing, embroidery, stamps, watermarks
    'mark-mono-white': svg(f'<path d="{V}" fill="#fff"/><path d="{T}" fill="#fff" stroke="#000" stroke-width="16" paint-order="stroke"/>'),
    'mark-mono-black': svg(f'<path d="{V}" fill="#000"/><path d="{T}" fill="#000" stroke="#fff" stroke-width="16" paint-order="stroke"/>'),
    # HQ (the admin desktop app): a gold tile so it never looks like the viewer site in the taskbar
    'hq': svg(f'<rect x="16" y="16" width="480" height="480" rx="112" fill="{GOLD}"/><g transform="translate(256 270) scale(.78) translate(-256 -270)">{letters(v=INK, t=INK, outline=GOLD, ow=18)}</g>'),
    # Beta (the testers' app): the small mark with a gold beta badge
    'beta': svg(DISC + f'<circle cx="256" cy="256" r="226" fill="none" stroke="{GREEN}" stroke-width="30"/>' + f'<g transform="translate(236 250) scale(.92) translate(-256 -262)">{letters(ow=22)}</g>'
                + f'<circle cx="398" cy="398" r="104" fill="{GOLD}" stroke="{BLACK}" stroke-width="16"/>'
                + '<path d="M378 470V352a30 30 0 0 1 60 0c0 16-11 26-27 27 21 1 34 13 34 31 0 21-16 34-36 34-13 0-24-6-31-15" fill="none" stroke="#07080c" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>'),
}
# A mark already in brand-kit/marks wins over the built-in drawing, so a redesign dropped in there (same file
# name, 512 x 512 viewBox) flows through to every size below. Delete a file to get the built-in one back.
for n, s in list(marks.items()):
    f = os.path.join(MARK, n + '.svg')
    if os.path.exists(f):
        marks[n] = open(f, encoding='utf-8').read().strip()
    else:
        open(f, 'w', encoding='utf-8').write(s + '\n')

def full_bleed(inner_svg_name, scale, bg=INK):
    inner = marks[inner_svg_name].split('>', 1)[1].rsplit('</svg>', 1)[0]
    return svg(f'<rect width="512" height="512" fill="{bg}"/><g transform="translate(256 256) scale({scale}) translate(-256 -256)">{inner}</g>')

marks_extra = {
    'apple-touch': full_bleed('mark-full', .86),          # iOS rounds the corners itself; it must be opaque
    'maskable': full_bleed('mark-full', .74),              # Android crops to a circle/squircle: keep the mark inside the 80% safe zone
    'beta-apple-touch': full_bleed('beta', .86),
    'beta-maskable': full_bleed('beta', .74),
}

def banner(w, h):
    s = h * .62 / 512
    mark = marks['mark-full'].split('>', 1)[1].rsplit('</svg>', 1)[0]
    fs = h * .16
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><defs><style>@font-face{{font-family:U;src:url(data:font/woff2;base64,{FONT64}) format("woff2");font-weight:200 900}}</style>'
            f'<radialGradient id="g" cx=".3" cy=".5" r=".9"><stop offset="0" stop-color="#14202e"/><stop offset="1" stop-color="{INK}"/></radialGradient></defs>'
            f'<rect width="{w}" height="{h}" fill="url(#g)"/><g transform="translate({h * .19} {h * .19}) scale({s})">{mark}</g>'
            f'<text x="{h * .19 + 512 * s + h * .14}" y="{h * .5 + fs * .36}" font-family="U" font-weight="800" font-size="{fs}" fill="{WHITE}">VOID<tspan fill="{CYAN}" font-weight="500">tv</tspan></text></svg>')

def render(svg_text, w, h, name):
    f = os.path.join(TMP, name + '.svg'); open(f, 'w', encoding='utf-8').write(svg_text)
    page = os.path.join(TMP, name + '.html')
    open(page, 'w', encoding='utf-8').write(f'<html><body style="margin:0;background:transparent;overflow:hidden"><img src="{name}.svg" style="display:block;width:{w}px;height:{h}px"></body></html>')
    png = os.path.join(TMP, name + '.png')
    if os.path.exists(png): os.remove(png)
    subprocess.run([EDGE, '--headless', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', f'--user-data-dir={TMP}\\prof',
                    f'--window-size={w},{h}', f'--screenshot={png}', 'file:///' + page.replace('\\', '/')], capture_output=True, timeout=90)
    import time
    for _ in range(120):  # Edge's launcher returns before the screenshot is written; wait for a finished file
        if os.path.exists(png) and os.path.getsize(png) > 0:
            time.sleep(0.4); break
        time.sleep(0.25)
    im = Image.open(png).convert('RGBA')
    return im.crop((0, 0, w, h)) if im.size != (w, h) else im

big = {n: render(s, 1024, 1024, n) for n, s in {**marks, **marks_extra}.items()}
def save(src, size, path, opaque=False):
    im = big[src].resize((size, size), Image.LANCZOS)
    if opaque: bg = Image.new('RGBA', im.size, INK); bg.alpha_composite(im); im = bg.convert('RGB')
    full = os.path.join(OUT, path); os.makedirs(os.path.dirname(full), exist_ok=True); im.save(full); return im

def ico(path, sizes, small_src, big_src):
    imgs = [big[small_src if z <= 48 else big_src].resize((z, z), Image.LANCZOS) for z in sizes]
    full = os.path.join(OUT, path); os.makedirs(os.path.dirname(full), exist_ok=True)
    imgs[-1].save(full, format='ICO', sizes=[(z, z) for z in sizes], append_images=imgs[:-1])

# VOIDtv site / PWA
save('mark-small', 16, 'site/favicon-16.png'); save('mark-small', 32, 'site/favicon-32.png'); save('mark-small', 48, 'site/favicon-48.png')
ico('site/favicon.ico', [16, 32, 48], 'mark-small', 'mark-full')
open(os.path.join(OUT, 'site', 'favicon.svg'), 'w', encoding='utf-8').write(marks['mark-small'])
save('apple-touch', 180, 'site/apple-touch-icon-180.png', opaque=True)
save('mark-full', 192, 'site/icon-192.png'); save('mark-full', 512, 'site/icon-512.png')
save('maskable', 512, 'site/icon-maskable-512.png', opaque=True); save('maskable', 192, 'site/icon-maskable-192.png', opaque=True)
save('apple-touch', 400, 'site/social-avatar-400.png', opaque=True)
# HQ desktop app (Electron / Windows)
ico('hq/hq.ico', [16, 24, 32, 48, 64, 128, 256], 'hq', 'hq')
for z in (256, 512, 1024): save('hq', z, f'hq/hq-{z}.png')
open(os.path.join(OUT, 'hq', 'hq.svg'), 'w', encoding='utf-8').write(marks['hq'])
# Beta testers' app (PWA)
ico('beta/favicon.ico', [16, 32, 48], 'beta', 'beta')
save('beta', 192, 'beta/icon-192.png'); save('beta', 512, 'beta/icon-512.png')
save('beta-maskable', 512, 'beta/icon-maskable-512.png', opaque=True)
save('beta-apple-touch', 180, 'beta/apple-touch-icon-180.png', opaque=True)
open(os.path.join(OUT, 'beta', 'favicon.svg'), 'w', encoding='utf-8').write(marks['beta'])
# TV apps (Fire TV / Android TV, for the TV-app plan)
for w, h, n in ((320, 180, 'android-tv-banner-320x180'), (1280, 720, 'fire-tv-1280x720'), (1920, 1080, 'tv-splash-1920x1080')):
    im = render(banner(w, h), w, h, n); os.makedirs(os.path.join(OUT, 'tv'), exist_ok=True); im.convert('RGB').save(os.path.join(OUT, 'tv', n + '.png'))
save('apple-touch', 512, 'tv/store-icon-512.png', opaque=True); save('apple-touch', 114, 'tv/fire-tv-small-114.png', opaque=True)
print('written to', OUT)
