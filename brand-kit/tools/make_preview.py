# Builds brand-kit/preview.html: every UI icon inline at 16/24/32/48px on dark and light, grouped by area,
# plus the app icons. Open it in any browser; nothing is fetched.
import json, os, html
ROOT = os.path.join(os.path.dirname(__file__), '..')
idx = json.load(open(os.path.join(ROOT, 'icons', 'icons.json'), encoding='utf-8'))
svg = lambda n: open(os.path.join(ROOT, 'icons', 'ui', n + '.svg'), encoding='utf-8').read().replace('width="24" height="24" ', '')
GROUPS = [('player', 'Player'), ('browse', 'Browse and navigation'), ('mine', 'Your stuff and feedback'), ('beta', 'Beta app'), ('hq', 'HQ admin')]
cells = []
for g, title in GROUPS:
    items = [i for i in idx if i['group'] == g]
    cells.append(f'<h2>{title} <span>{len(items)}</span></h2><div class="grid">')
    for i in items:
        s = svg(i['name'])
        sizes = ''.join(f'<i style="width:{z}px;height:{z}px">{s}</i>' for z in (16, 24, 32, 48))
        cells.append(f'<div class="c"><div class="row dark">{sizes}</div><div class="row light">{sizes}</div><b>{i["name"]}</b><small>{html.escape(i["meaning"])}</small></div>')
    cells.append('</div>')
apps = ''
appdir = os.path.join(ROOT, 'app-icons')
if os.path.isdir(appdir):
    for sub, title in (('site', 'VOIDtv site and installable app'), ('hq', 'HQ desktop app'), ('beta', 'Beta testers app'), ('tv', 'TV apps')):
        d = os.path.join(appdir, sub)
        if not os.path.isdir(d): continue
        tiles = [f'<figure><img src="app-icons/{sub}/{f}"><figcaption>{f}</figcaption></figure>' for f in sorted(os.listdir(d)) if f.endswith('.png')]
        apps += f'<h2>{title}</h2><div class="apps">' + ''.join(tiles) + '</div>'
page = f'''<!doctype html><html><head><meta charset="utf-8"><title>VOIDtv Icon Kit</title><style>
body{{margin:0;background:#07080c;color:#e8e8ee;font:14px system-ui,Segoe UI,sans-serif;padding:24px}}
h1{{font-size:22px;margin:0 0 4px}}p.s{{color:#9aa0b4;margin:0 0 18px}}
h2{{font-size:15px;margin:22px 0 10px;color:#5fd4ff}}h2 span{{color:#9aa0b4;font-weight:400}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:8px}}
.c{{background:#10121a;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px}}
.row{{display:flex;align-items:center;gap:10px;padding:6px;border-radius:6px}}.dark{{color:#e8e8ee}}.light{{background:#f4f4f7;color:#07080c;margin-top:4px}}
.row i{{display:inline-flex}}.row svg{{width:100%;height:100%}}
b{{display:block;margin-top:6px;font-size:12px}}small{{color:#9aa0b4;font-size:11px}}
.apps{{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}}figure{{margin:0;text-align:center}}figure img{{display:block;max-width:220px;max-height:220px;background:repeating-conic-gradient(#1a1d28 0 25%,#12141c 0 50%) 0 0/16px 16px;border-radius:8px}}
figcaption{{font-size:11px;color:#9aa0b4;margin-top:4px}}
</style></head><body><h1>VOIDtv icon kit</h1><p class="s">{len(idx)} icons · 24px grid · 2px round stroke · currentColor · shown at 16, 24, 32 and 48px</p>
{''.join(cells)}{apps}</body></html>'''
open(os.path.join(ROOT, 'preview.html'), 'w', encoding='utf-8').write(page)
print('preview.html written')
