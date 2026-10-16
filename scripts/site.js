// THE SITE: builds the deployable static site into site/ for Cloudflare Pages (or any static host).
//   site/index.html                 the app shell with the browse index inline
//   site/data/shows/<slug>.json     seasons, episodes, cast, crew; fetched when a show opens
//   site/data/graph.json            people and show-to-show links; fetched once
//   site/show/<slug>/index.html     the same shell with that show's title, poster and description
//                                   in the page head, so a shared link renders a real card
//   site/_redirects                 unknown paths -> index.html (the app routes /show/<slug>)
// Usage: node scripts/site.js [--base https://voidtv.net]
const fs = require('fs');
const readJsonSafe = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const path = require('path');
const { assemble, page, showFile, indexEntry, SITE_NAME } = require('./lib/app');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const OUT = PROFILE.siteDir;
const args = process.argv.slice(2);
const bi = args.indexOf('--base');
const ORIGIN = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : PROFILE.domain;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'data', 'shows'), { recursive: true });
const data = assemble();
const MIN_SHOWS = PROFILE.name === 'voidtv' ? 100 : 1; // VOIDtv ships thousands; a small profile (public access, a demo) is legitimately tiny
if (data.shows.length < MIN_SHOWS) { console.error('SITE WOULD SHIP WITH ' + data.shows.length + ' SHOWS: the list or the catalog did not load; refusing to build'); process.exit(1); }

for (const s of data.shows) fs.writeFileSync(path.join(OUT, 'data', 'shows', s.slug + '.json'), JSON.stringify(showFile(s, data)));
fs.writeFileSync(path.join(OUT, 'data', 'index.js'), 'const SHOWS=' + JSON.stringify(data.shows.map(indexEntry)) + ';');
fs.writeFileSync(path.join(OUT, 'data', 'graph.json'), JSON.stringify({ people: data.people, links: data.links }));
fs.writeFileSync(path.join(OUT, 'data', 'tv.json'), JSON.stringify({ channels: data.channels }));
fs.mkdirSync(path.join(OUT, 'data', 'people'), { recursive: true });
for (const [id, b] of Object.entries(data.bios || {})) fs.writeFileSync(path.join(OUT, 'data', 'people', id + '.json'), JSON.stringify(b));

const shell = (meta) => page({ data, mode: 'split', routes: 'path', base: '/', meta });
// Refuse to ship a page whose script does not parse (a bad quote once took the whole site down).
{ const html = shell({ url: ORIGIN + '/' }); const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>')); try { new Function(js); } catch (e) { console.error('PAGE SCRIPT DOES NOT PARSE: ' + e.message); process.exit(1); }
  // The client code is one function per line, so a // comment placed after code silently eats the rest of
  // that line (it has, twice). Whole-line comments are fine; a trailing one is refused.
  const stripped = (l) => l.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '');
  const bad = js.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => { const s = stripped(l); return !/^\s*\/\//.test(s) && /[^:]\/\//.test(s); });
  if (bad.length) { console.error('PAGE SCRIPT HAS TRAILING LINE COMMENTS (they swallow code): ' + bad.map(([i, l]) => i + ': ' + l.slice(0, 90)).join(' | ')); process.exit(1); } }
fs.writeFileSync(path.join(OUT, 'index.html'), shell({ url: ORIGIN + '/' }));
for (const s of data.shows) {
  const dir = path.join(OUT, 'show', s.slug);
  fs.mkdirSync(dir, { recursive: true });
  const bits = [s.network, s.year, `${s.eps} episode${s.eps === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  fs.writeFileSync(path.join(dir, 'index.html'), shell({
    title: s.show, image: s.backdrop || s.poster || undefined, url: `${ORIGIN}/show/${s.slug}`,
    description: (s.overview ? s.overview.slice(0, 180).replace(/\s+\S*$/, '') + (s.overview.length > 180 ? '…' : '') + ' ' : '') + bits + ` · ${SITE_NAME}`,
  }));
}
// www and the old Pages address fold into the bare domain once voidtv.net is attached (host-level rules are inert until then).
const HOST = ORIGIN.replace(/^https?:\/\//, '');
const hostRules = HOST === 'voidtv.net' ? 'https://www.voidtv.net/* https://voidtv.net/:splat 301\n' : '';
// Only the host rule. Pages serves index.html for unknown paths on its own (no 404.html ships), and a /show/* 200 rule
// would shadow the prerendered /show/<slug>/index.html pages that carry the share-card meta.
fs.writeFileSync(path.join(OUT, '_redirects'), hostRules);
// Pages Functions live beside the output: the password gate (functions/_middleware.js) only runs
// when the SITE_PASSWORD variable is set on the Pages project.
const fnSrc = path.join(ROOT, 'functions');
if (fs.existsSync(fnSrc)) fs.cpSync(fnSrc, path.join(OUT, 'functions'), { recursive: true });
const brandSrc = path.join(ROOT, 'assets', 'brand');
// The VOID player (player/): one script bundle and one stylesheet, cached with the rest of /assets.
{ const P = path.join(ROOT, 'player', 'src'); const dst = path.join(OUT, 'assets', 'player'); fs.mkdirSync(dst, { recursive: true });
  fs.writeFileSync(path.join(dst, 'voidplayer.js'), ['core.js', 'icons.js', 'player.js'].map((f) => fs.readFileSync(path.join(P, f), 'utf8')).join('\n;\n'));
  fs.copyFileSync(path.join(P, 'player.css'), path.join(dst, 'player.css')); }
if (fs.existsSync(brandSrc)) fs.cpSync(brandSrc, path.join(OUT, 'assets', 'brand'), { recursive: true, filter: (p) => { const parts = path.relative(brandSrc, p).split(path.sep); return !parts.includes('src') && !parts.includes('sheets'); } }); // the 2K originals and design sheets stay out of the site
fs.writeFileSync(path.join(OUT, '_headers'), '/data/*\n  Cache-Control: public, max-age=300\n/show/*\n  Cache-Control: public, max-age=300\n/assets/*\n  Cache-Control: public, max-age=86400\n');
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n');
// Which commit this build came from: the doctor compares it with HEAD on the PC to catch a stalled Cloudflare build.
{ let sha = process.env.CF_PAGES_COMMIT_SHA || ''; if (!sha) { try { sha = require('child_process').execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { sha = 'unknown'; } } fs.writeFileSync(path.join(OUT, 'version.txt'), sha + ' ' + new Date().toISOString() + '\n'); }
// Which paths run through Pages Functions. Gate on: everything but the brand assets. Build with --open once the
// password comes off, and only the analytics intake runs as a function (static files are served directly).
fs.writeFileSync(path.join(OUT, '_routes.json'), JSON.stringify(args.includes('--open') ? { version: 1, include: ['/api/*', '/q/*'], exclude: [] } : { version: 1, include: ['/*'], exclude: ['/assets/*'] }));
// QR and short codes: /q/<code> reads this map at the edge
{ const qr = readJsonSafe(path.join(PROFILE.catalogDir, 'qr.json')); const pub = {}; for (const [k, v] of Object.entries(qr || {})) if (!k.startsWith('_') && v && v.url) pub[k] = { url: v.url, label: v.label || '' }; fs.writeFileSync(path.join(OUT, 'qr.json'), JSON.stringify(pub)); }
// Web app manifest: phones and TVs can add VOIDtv to the home screen and open it full-screen.
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({ name: 'VOIDtv', short_name: 'VOIDtv', description: 'TV shows from the Internet Archive, 1990 to now. Before AI slop, there was human creativity.', start_url: '/', display: 'standalone', background_color: '#07080c', theme_color: '#07080c', icons: [{ src: '/assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }));

const size = (p) => fs.statSync(p).size;
let total = 0; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : (total += size(p)); } }; walk(OUT);
console.log(`${data.channels.length} channels, ${Object.keys(data.bios || {}).length} person pages, ${data.shows.length} shows -> site/ (index ${(size(path.join(OUT, 'index.html')) / 1e6).toFixed(2)} MB, ${data.shows.length} show pages, total ${(total / 1e6).toFixed(1)} MB)`);
