# VOIDtv ad kit: logos, lockups, badges, stat cards and ready-made ads in standard sizes.
# Every piece is an editable HTML source (brand-kit/ads/src/) rendered to PNG with the Edge already on this PC.
# Change wording or colours in COPY / PALETTE below, then:  python brand-kit/tools/make_ads.py
import os, subprocess, tempfile, time, json, html

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
KIT = os.path.join(ROOT, 'brand-kit')
OUT = os.path.join(KIT, 'ads')
SRC = os.path.join(OUT, 'src')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
TMP = tempfile.mkdtemp(prefix='voidads-')
U = lambda p: 'file:///' + os.path.join(ROOT, p).replace('\\', '/')
FONT = U('assets/brand/fonts/unbounded-latin.woff2')
ICON = lambda n: open(os.path.join(KIT, 'icons', 'ui', n + '.svg'), encoding='utf-8').read().replace(' width="24" height="24"', '')

# Neon sampled from the background art (docs/BACKLOG.md item 2); gold for giving.
PALETTE = {'ink': '#07080c', 'cream': '#f2f2f6', 'pink': '#dc20a9', 'pink2': '#ff4fc8', 'blue': '#0ac1e0', 'blue2': '#5fe3ff', 'violet': '#a954e3', 'gold': '#f2a93b'}
KIDS = {'sun': '#ffd23f', 'teal': '#2ec4b6', 'pink': '#ff5fa2', 'sky': '#4cc9f0', 'ink': '#1b1f3b', 'paper': '#fff8e7'}
FACTS = {'shows': '4,600+', 'episodes': '50,000+'}  # from site/data on 17 Oct 2026: 4,645 shows, 50,820 episodes

BASE_CSS = f"""@font-face{{font-family:U;src:url({FONT}) format('woff2');font-weight:200 900}}
*{{box-sizing:border-box}}html,body{{margin:0;width:100%;height:100%;overflow:hidden}}
body{{font-family:U,system-ui,sans-serif;color:{PALETTE['cream']}}}
.glow-b{{text-shadow:0 0 .12em {PALETTE['blue']},0 0 .45em {PALETTE['blue']}}}
.glow-p{{text-shadow:0 0 .12em {PALETTE['pink']},0 0 .45em {PALETTE['pink']}}}
.tv svg,.kt svg{{width:100%;height:auto;display:block}}
.wm{{font-weight:700;letter-spacing:0;line-height:1;white-space:nowrap}}.wm b{{font-weight:700}}.wm i{{font-style:normal;font-weight:700}}
"""

def wordmark(size, glow=True):
    g = ' glow-b' if glow else ''
    # The name is always "voidtv.net" (Bryan, 17 Oct: never advertise the other VOID sites), set like the neon sign.
    return (f'<span class="wm" style="font-size:{size}px"><b class="{"glow-p" if glow else ""}" style="color:{PALETTE["pink2"] if glow else "#fff"}">voidtv</b>'
            f'<i class="{"glow-b" if glow else ""}" style="color:{PALETTE["blue2"] if glow else "#fff"}">.net</i></span>')

def page(name, w, h, body, css='', transparent=False):
    bg = 'transparent' if transparent else PALETTE['ink']
    doc = f'<!doctype html><html><head><meta charset="utf-8"><title>{name}</title><style>{BASE_CSS}html,body{{width:{w}px;height:{h}px;background:{bg}}}{css}</style></head><body>{body}</body></html>'
    os.makedirs(SRC, exist_ok=True)
    p = os.path.join(SRC, name + '.html')
    open(p, 'w', encoding='utf-8').write(doc)
    return p

def render(src, w, h, out_png, transparent=False):
    png = os.path.join(TMP, os.path.basename(out_png))
    if os.path.exists(png): os.remove(png)
    args = [EDGE, '--headless', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', f'--user-data-dir={TMP}\\prof', f'--window-size={w},{h}', f'--screenshot={png}']
    if transparent: args.insert(2, '--default-background-color=00000000')
    subprocess.run(args + ['file:///' + src.replace('\\', '/')], capture_output=True, timeout=90)
    for _ in range(120):
        if os.path.exists(png) and os.path.getsize(png) > 0: time.sleep(0.4); break
        time.sleep(0.25)
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    os.replace(png, out_png)

JOBS = []
def job(folder, name, w, h, body, css='', transparent=False):
    JOBS.append((folder, name, w, h, page(name, w, h, body, css, transparent), transparent))

# ---------------- logos and lockups ----------------
MARK_FULL = open(os.path.join(KIT, 'marks', 'mark-full.svg'), encoding='utf-8').read()
def neon_mark():
    s = MARK_FULL
    for a, b in (('#2cf01a', PALETTE['pink']), ('#f2f2f2', PALETTE['blue']), ('#29a3f2', PALETTE['blue']), ('#f7960f', PALETTE['pink2']), ('#7d7d7d', PALETTE['violet']), ('#5a5a5a', '#4a2a6a')):
        s = s.replace(a, b)
    return s
NEON_MARK = neon_mark()
open(os.path.join(KIT, 'marks', 'mark-neon-proposal.svg'), 'w', encoding='utf-8').write(NEON_MARK)
mark_css = '.m{width:100%;height:100%;display:grid;place-items:center}.m svg{width:92%;height:92%;filter:drop-shadow(0 0 18px rgba(10,193,224,.55)) drop-shadow(0 0 40px rgba(220,32,169,.35))}'
job('logos', 'voidtv-mark-neon-1024', 1024, 1024, f'<div class="m">{NEON_MARK}</div>', mark_css, True)
job('logos', 'voidtv-wordmark-neon-3000', 3000, 800, f'<div style="height:100%;display:grid;place-items:center">{wordmark(520)}</div>', '', True)
job('logos', 'voidtv-wordmark-white-3000', 3000, 800, f'<div style="height:100%;display:grid;place-items:center">{wordmark(520, False)}</div>', '', True)
job('logos', 'voidtv-lockup-horizontal-3000', 3000, 900, f'<div style="height:100%;display:flex;align-items:center;justify-content:center;gap:90px"><div style="width:640px;height:640px;flex:none" class="m">{NEON_MARK}</div>{wordmark(330)}</div>', mark_css.replace('width:100%;height:100%;', ''), True)

# Kids: a friendly TV set (the neon TV from the background art, made bright and rounded)
KIDS_TV = f'''<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
<path d="M196 92L256 150L316 92" fill="none" stroke="{KIDS['ink']}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="196" cy="88" r="20" fill="{KIDS['pink']}" stroke="{KIDS['ink']}" stroke-width="12"/><circle cx="316" cy="88" r="20" fill="{KIDS['sky']}" stroke="{KIDS['ink']}" stroke-width="12"/>
<rect x="56" y="150" width="400" height="300" rx="78" fill="{KIDS['sun']}" stroke="{KIDS['ink']}" stroke-width="22"/>
<rect x="98" y="190" width="250" height="220" rx="52" fill="{KIDS['teal']}" stroke="{KIDS['ink']}" stroke-width="16"/>
<circle cx="398" cy="238" r="20" fill="{KIDS['pink']}" stroke="{KIDS['ink']}" stroke-width="10"/><circle cx="398" cy="300" r="20" fill="{KIDS['sky']}" stroke="{KIDS['ink']}" stroke-width="10"/>
<circle cx="180" cy="285" r="15" fill="{KIDS['ink']}"/><circle cx="266" cy="285" r="15" fill="{KIDS['ink']}"/>
<path d="M172 332Q223 378 274 332" fill="none" stroke="{KIDS['ink']}" stroke-width="16" stroke-linecap="round"/>
<path d="M130 450L112 484M382 450L400 484" stroke="{KIDS['ink']}" stroke-width="22" stroke-linecap="round"/></svg>'''
open(os.path.join(KIT, 'marks', 'kids-tv-proposal.svg'), 'w', encoding='utf-8').write(KIDS_TV)
kids_word = f'<span class="wm" style="font-size:{{s}}px;color:{KIDS["ink"]}"><span>voidtv</span><span style="color:{KIDS["teal"]}">.net</span> <span style="color:{KIDS["pink"]}">k</span><span style="color:{KIDS["teal"]}">i</span><span style="color:#f08c00">d</span><span style="color:{KIDS["sky"]}">s</span></span>'
job('logos', 'voidtv-kids-mark-1024', 1024, 1024, f'<div style="height:100%;display:grid;place-items:center">{KIDS_TV.replace("<svg ", "<svg width=\"94%\" ")}</div>', '', True)
job('logos', 'voidtv-kids-lockup-on-light-3000', 3000, 900, f'<div style="height:100%;display:flex;align-items:center;justify-content:center;gap:70px"><div class="kt" style="width:760px;flex:none">{KIDS_TV}</div>{kids_word.replace("{s}", "220")}</div>', '', True)
job('logos', 'voidtv-kids-lockup-on-dark-3000', 3000, 900, f'<div style="height:100%;display:flex;align-items:center;justify-content:center;gap:70px"><div class="kt" style="width:760px;flex:none">{KIDS_TV}</div>{kids_word.replace("{s}", "220").replace(KIDS['ink'], '#fff8e7')}</div>', '', True)

# CASH lockup (the cross is a 120 px original: fine small, ask CASH for a large original for print)
CROSS = U('assets/brand/cash-cross.png')
cash_body = f'''<div style="height:100%;display:flex;align-items:center;justify-content:center;gap:56px">
<div style="width:520px;height:520px;flex:none" class="m">{NEON_MARK}</div>
<div><div>{wordmark(250)}</div>
<div style="display:flex;align-items:center;gap:28px;margin-top:44px"><img src="{CROSS}" style="height:230px"><div style="font-size:84px;line-height:1.2;color:{PALETTE['cream']}">a project of <b style="color:{PALETTE['gold']}">CASH</b><br><span style="font-size:48px;color:#c8cadb">Church of American Strength &amp; Hope · 501(c)(3)</span></div></div></div></div>'''
job('logos', 'voidtv-cash-lockup-3000', 3000, 1000, cash_body, mark_css.replace('width:100%;height:100%;', ''), True)

# ---------------- badges (transparent, for any ad) ----------------
BADGES = [('free', 'check', 'Free'), ('no-ads', 'close', 'No ads'), ('no-account', 'lock', 'No account'), ('fast', 'live', 'Starts in seconds'), ('search', 'search', 'Search every show'), ('donation', 'donate', 'Donation-supported'), ('nonprofit', 'heart', 'Nonprofit'), ('archive', 'archive', 'From the Internet Archive'), ('in-order', 'list', 'Every episode, in order')]
badge_css = f'''.b{{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}}.p{{display:inline-flex;align-items:center;gap:26px;padding:26px 46px 26px 34px;border-radius:999px;border:5px solid {PALETTE['blue']};background:rgba(7,8,12,.78);box-shadow:0 0 22px rgba(10,193,224,.55),inset 0 0 18px rgba(10,193,224,.25);font-size:62px;font-weight:600}}
.p svg{{width:78px;height:78px;color:{PALETTE['blue2']}}}.p.g{{border-color:{PALETTE['gold']};box-shadow:0 0 22px rgba(242,169,59,.5),inset 0 0 18px rgba(242,169,59,.2)}}.p.g svg{{color:{PALETTE['gold']}}}'''
for key, icon, label in BADGES:
    cls = 'p g' if key in ('donation', 'nonprofit') else 'p'
    job('badges', 'badge-' + key, 1200, 240, f'<div class="b"><span class="{cls}">{ICON(icon)}{html.escape(label)}</span></div>', badge_css, True)

# ---------------- stat cards ----------------
stat_css = f'''.s{{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}}
.n{{font-size:260px;font-weight:800;line-height:1;color:#fff}}.l{{font-size:76px;font-weight:500;margin-top:24px;color:{PALETTE['cream']}}}'''
for key, num, label, cls in (('shows', FACTS['shows'], 'shows', 'glow-b'), ('episodes', FACTS['episodes'], 'episodes', 'glow-p'), ('price', '$0', 'free, always', 'glow-b')):
    job('stats', 'stat-' + key, 1080, 1080, f'<div class="s"><div class="n {cls}">{num}</div><div class="l">{label}</div></div>', stat_css, True)

# ---------------- ready-made ads ----------------
SIZES = {'square-1080x1080': (1080, 1080), 'portrait-1080x1350': (1080, 1350), 'story-1080x1920': (1080, 1920), 'link-1200x630': (1200, 630), 'x-1600x900': (1600, 900)}
COPY = {
    'free':      ('wall.jpg', 'Free TV.<br>No ads.<br>No account.', f"{FACTS['shows']} shows · {FACTS['episodes']} episodes · classics to now", ['free', 'no-ads', 'no-account']),
    'library':   ('wall.jpg', f"<span class='glow-b'>{FACTS['shows']}</span> shows.<br><span class='glow-p'>{FACTS['episodes']}</span> episodes.", 'Every episode in order. All free.', ['in-order', 'free']),
    'speed':     ('sign-pink.jpg', 'Press play.<br>It plays.', 'Starts in seconds, straight from the Internet Archive.', ['fast', 'archive']),
    'search':    ('wall.jpg', 'Find the show<br>you forgot<br>you loved.', 'Search every show, every episode, instantly.', ['search', 'free']),
    'manifesto': ('sign-orange.jpg', 'Before AI slop,<br>there was human<br>creativity.', 'Classic and cult TV, kept alive. Free and nonprofit.', ['free', 'nonprofit']),
    'cash':      ('wall.jpg', 'Free because<br>people give.', 'voidtv.net is a nonprofit project of CASH, a 501(c)(3). Donations fund real-world work. Never required.', ['nonprofit', 'donation', 'no-ads']),
}
def badge_inline(key):
    icon, label = next((i, l) for k, i, l in BADGES if k == key)
    g = ' g' if key in ('donation', 'nonprofit') else ''
    return f'<span class="bd{g}">{ICON(icon)}{html.escape(label)}</span>'

def ad_css(w, h):
    u = min(w, h) / 1080            # scale unit
    land = w > h * 1.3
    return f'''.bg{{position:absolute;inset:0;background:center/cover no-repeat}}.bg::after{{content:"";position:absolute;inset:0;background:{"linear-gradient(90deg,rgba(7,8,12,.92) 0%,rgba(7,8,12,.72) 46%,rgba(7,8,12,.15) 100%)" if land else "linear-gradient(180deg,rgba(7,8,12,.2) 0%,rgba(7,8,12,.55) 40%,rgba(7,8,12,.94) 78%)"}}}
.c{{position:absolute;{"left:" + str(int(70*u)) + "px;top:0;bottom:0;width:" + str(int(w*0.56)) + "px;justify-content:center" if land else "left:" + str(int(72*u)) + "px;right:" + str(int(72*u)) + "px;bottom:" + str(int(90*u)) + "px"};display:flex;flex-direction:column;gap:{int(26*u)}px}}
.h{{font-size:{int((86 if land else 104)*u)}px;font-weight:800;line-height:1.04;color:#fff}}
.sub{{font-size:{int(34*u)}px;line-height:1.35;color:#d9dbe6;max-width:{int(860*u)}px}}
.bds{{display:flex;flex-wrap:wrap;gap:{int(14*u)}px}}.bd{{display:inline-flex;align-items:center;gap:{int(12*u)}px;padding:{int(12*u)}px {int(22*u)}px {int(12*u)}px {int(16*u)}px;border-radius:999px;border:{max(2,int(3*u))}px solid {PALETTE['blue']};background:rgba(7,8,12,.7);font-size:{int(26*u)}px;font-weight:600;box-shadow:0 0 {int(14*u)}px rgba(10,193,224,.45)}}
.bd svg{{width:{int(32*u)}px;height:{int(32*u)}px;color:{PALETTE['blue2']}}}.bd.g{{border-color:{PALETTE['gold']};box-shadow:0 0 {int(14*u)}px rgba(242,169,59,.45)}}.bd.g svg{{color:{PALETTE['gold']}}}
.top{{position:absolute;left:{int(72*u)}px;top:{int(64*u)}px;display:flex;align-items:center;gap:{int(18*u)}px}}.top svg{{width:{int(92*u)}px;height:{int(92*u)}px;filter:drop-shadow(0 0 {int(10*u)}px rgba(10,193,224,.6))}}
.url{{font-size:{int(36*u)}px;font-weight:700;color:{PALETTE['blue2']}}}.cross{{height:{int(96*u)}px;width:auto;align-self:flex-start;filter:drop-shadow(0 0 {int(10*u)}px rgba(242,169,59,.5))}}'''

for concept, (bgimg, head, sub, badges) in COPY.items():
    for size, (w, h) in SIZES.items():
        u = min(w, h) / 1080
        extra = f'<img class="cross" src="{CROSS}" alt="">' if concept == 'cash' else ''
        body = (f'<div class="bg" style="background-image:url({U("assets/brand/bg/" + bgimg)})"></div>'
                f'<div class="top"><div style="width:{int(92*u)}px;height:{int(92*u)}px">{NEON_MARK}</div>{wordmark(int(64*u))}</div>'
                f'<div class="c">{extra}<div class="h">{head}</div><div class="sub">{html.escape(sub)}</div>'
                f'<div class="bds">{"".join(badge_inline(b) for b in badges)}</div><div class="url">voidtv.net</div></div>')
        job('ads/' + concept, f'{concept}-{size}', w, h, body, ad_css(w, h))

# Kids teaser (bright, daytime: deliberately not the late-night neon)
for size, (w, h) in SIZES.items():
    u = min(w, h) / 1080; land = w > h * 1.3
    css = f'''body{{background:{KIDS['paper']};color:{KIDS['ink']}}}.k{{position:absolute;inset:0;display:flex;{"flex-direction:row" if land else "flex-direction:column"};align-items:center;justify-content:center;gap:{int(40*u)}px;padding:{int(70*u)}px;text-align:{"left" if land else "center"}}}
.tv{{width:{int((420 if land else (300 if h <= w * 1.05 else 440))*u)}px;flex:none}}.h{{font-size:{int((84 if land else (64 if h <= w * 1.05 else 80))*u)}px;font-weight:800;line-height:1.05}}.sub{{font-size:{int(34*u)}px;line-height:1.35;margin-top:{int(18*u)}px;color:#3a3f66}}
.soon{{display:inline-block;margin-top:{int(26*u)}px;padding:{int(14*u)}px {int(30*u)}px;border-radius:999px;background:{KIDS['pink']};color:#fff;font-size:{int(32*u)}px;font-weight:700}}
.dots span{{position:absolute;border-radius:50%;opacity:.5}}'''
    dots = ''.join(f'<span style="left:{x}%;top:{y}%;width:{int(r*u)}px;height:{int(r*u)}px;background:{c}"></span>' for x, y, r, c in ((6, 8, 90, KIDS['sun']), (88, 12, 60, KIDS['sky']), (8, 84, 70, KIDS['teal']), (90, 80, 110, KIDS['pink'])))
    body = f'<div class="dots">{dots}</div><div class="k"><div class="tv">{KIDS_TV}</div><div><div class="h">{kids_word.replace("{s}", str(int(70*u)))}</div><div class="h" style="margin-top:{int(16*u)}px">Cartoons you grew up with.<br>Shows that teach.</div><div class="sub">Safe, free and ad-free. Picked by people, not algorithms.</div><span class="soon">Coming soon</span></div></div>'
    job('ads/kids', f'kids-{size}', w, h, body, css)

# Platform extras
job('ads/extras', 'youtube-thumb-1280x720', 1280, 720, f'<div class="bg" style="background-image:url({U("assets/brand/bg/wall.jpg")})"></div><div class="c"><div class="h">Free TV.<br>No ads.</div><div class="url">voidtv.net</div></div>', ad_css(1280, 720))
job('ads/extras', 'x-header-1500x500', 1500, 500, f'<div class="bg" style="background-image:url({U("assets/brand/bg/wall.jpg")});background-position:center 40%"></div><div class="c" style="width:900px"><div class="h" style="font-size:64px">Free TV. No ads. No account.</div><div class="sub" style="font-size:26px">{FACTS["shows"]} shows · {FACTS["episodes"]} episodes · voidtv.net</div></div>', ad_css(1500, 500))

if __name__ == '__main__':
    manifest = []
    for folder, name, w, h, src, tr in JOBS:
        out = os.path.join(OUT, folder, name + '.png')
        render(src, w, h, out, tr)
        manifest.append({'file': os.path.relpath(out, OUT).replace('\\', '/'), 'size': f'{w}x{h}', 'transparent': tr, 'source': os.path.relpath(src, OUT).replace('\\', '/')})
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    print(len(manifest), 'pieces ->', OUT)
