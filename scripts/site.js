// THE SITE: builds the deployable static site into site/ for Cloudflare Pages (or any static host).
//   site/index.html                 the app shell with the browse index inline
//   site/data/shows/<slug>.json     seasons, episodes, cast, crew; fetched when a show opens
//   site/data/graph.json            people and show-to-show links; fetched once
//   site/show/<slug>/index.html     the same shell with that show's title, poster and description
//                                   in the page head, so a shared link renders a real card
//   site/_redirects                 unknown paths -> index.html (the app routes /show/<slug>)
// Usage: node scripts/site.js [--base https://voidtv.net]
const fs = require('fs');
const path = require('path');
const { assemble, page, showFile, indexEntry, SITE_NAME } = require('./lib/app');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'site');
const args = process.argv.slice(2);
const bi = args.indexOf('--base');
const ORIGIN = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : 'https://voidtv.net';

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'data', 'shows'), { recursive: true });
const data = assemble();

for (const s of data.shows) fs.writeFileSync(path.join(OUT, 'data', 'shows', s.slug + '.json'), JSON.stringify(showFile(s, data)));
fs.writeFileSync(path.join(OUT, 'data', 'index.js'), 'const SHOWS=' + JSON.stringify(data.shows.map(indexEntry)) + ';');
fs.writeFileSync(path.join(OUT, 'data', 'graph.json'), JSON.stringify({ people: data.people, links: data.links }));
fs.writeFileSync(path.join(OUT, 'data', 'tv.json'), JSON.stringify({ channels: data.channels }));
fs.mkdirSync(path.join(OUT, 'data', 'people'), { recursive: true });
for (const [id, b] of Object.entries(data.bios || {})) fs.writeFileSync(path.join(OUT, 'data', 'people', id + '.json'), JSON.stringify(b));

const shell = (meta) => page({ data, mode: 'split', routes: 'path', base: '/', meta });
// Refuse to ship a page whose script does not parse (a bad quote once took the whole site down).
{ const html = shell({ url: ORIGIN + '/' }); const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>')); try { new Function(js); } catch (e) { console.error('PAGE SCRIPT DOES NOT PARSE: ' + e.message); process.exit(1); } }
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
fs.writeFileSync(path.join(OUT, '_redirects'), '/show/* /index.html 200\n/person/* /index.html 200\n/tv /index.html 200\n/tv/* /index.html 200\n/me /index.html 200\n');
// Pages Functions live beside the output: the password gate (functions/_middleware.js) only runs
// when the SITE_PASSWORD variable is set on the Pages project.
const fnSrc = path.join(ROOT, 'functions');
if (fs.existsSync(fnSrc)) { fs.mkdirSync(path.join(OUT, 'functions'), { recursive: true }); for (const f of fs.readdirSync(fnSrc)) fs.copyFileSync(path.join(fnSrc, f), path.join(OUT, 'functions', f)); }
const brandSrc = path.join(ROOT, 'assets', 'brand');
if (fs.existsSync(brandSrc)) fs.cpSync(brandSrc, path.join(OUT, 'assets', 'brand'), { recursive: true, filter: (p) => { const parts = path.relative(brandSrc, p).split(path.sep); return !parts.includes('src') && !parts.includes('sheets'); } }); // the 2K originals and design sheets stay out of the site
fs.writeFileSync(path.join(OUT, '_headers'), '/data/*\n  Cache-Control: public, max-age=300\n/show/*\n  Cache-Control: public, max-age=300\n/assets/*\n  Cache-Control: public, max-age=86400\n');
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n');

const size = (p) => fs.statSync(p).size;
let total = 0; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : (total += size(p)); } }; walk(OUT);
console.log(`${data.channels.length} channels, ${Object.keys(data.bios || {}).length} person pages, ${data.shows.length} shows -> site/ (index ${(size(path.join(OUT, 'index.html')) / 1e6).toFixed(2)} MB, ${data.shows.length} show pages, total ${(total / 1e6).toFixed(1)} MB)`);
