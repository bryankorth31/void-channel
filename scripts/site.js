// THE SITE: builds the deployable static site into site/ for Cloudflare Pages (or any static host).
//   site/index.html                 the app shell with the browse index inline
//   site/data/shows/<slug>.json     seasons, episodes, cast, crew; fetched when a show opens
//   site/data/graph.json            people and show-to-show links; fetched once
//   site/show/<slug>/index.html     the same shell with that show's title, poster and description
//                                   in the page head, so a shared link renders a real card
//   site/_redirects                 comments only (Pages rejects an absolute-address rule; www is handled elsewhere, see docs/DEPLOY.md)
//   site/_headers                   caching and the security headers (scripts/lib/siteguards.js has the list)
//   site/_routes.json               which paths run as Pages Functions: everything while the password is on, /api and /q once it is off
//   site/version.txt                commit, time, gate=on|off and the file counts; the doctor reads it from the live site
// The one switch is two plain-text variables on the Pages project, because the build cannot see an encrypted Secret:
// SITE_PASSWORD (or GATE = on) = gate on; GATE = off with no password = open; neither on a Cloudflare build of VOIDtv = refused.
// See docs/DEPLOY.md, "The one switch". The build refuses to ship under 100 shows, a catalog more than 10 percent smaller than the
// last publish, 19,500 files (Pages allows 20,000) or a file over 24 MiB.
// Usage: node scripts/site.js [--base https://voidtv.net]
const fs = require('fs');
const readJsonSafe = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const path = require('path');
const { assemble, page, showFile, indexEntry, SITE_NAME, BRAND } = require('./lib/app');
const guards = require('./lib/siteguards');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const OUT = PROFILE.siteDir;
const args = process.argv.slice(2);
// --open used to narrow the routes by hand while the password variable said something else; the two could disagree and the
// site came up open with no analytics (audit CF-003). It is gone. Passing it is an error so an old build command fails loudly
// (the old site stays up) instead of being ignored.
if (args.includes('--open')) { console.error('--open no longer exists. The SITE_PASSWORD and GATE variables on the Pages project are the only switch: SITE_PASSWORD (or GATE = on) = password on, GATE = off = site open (docs/DEPLOY.md, "The one switch"). Remove --open from the build command.'); process.exit(2); }
const bi = args.indexOf('--base');
const ORIGIN = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : PROFILE.domain;
// "Open" is a positive act: a plain GATE=off. A password saved as an encrypted Secret is invisible to this build, so seeing neither
// variable on a Cloudflare build of VOIDtv is refused (exit 1, the old gated site stays up) instead of being written open.
const GATE = guards.gateDecision(process.env, { cloudflare: process.env.CF_PAGES === '1', profile: PROFILE.name });
if (GATE.error) { console.error(GATE.error); process.exit(1); }
const GATED = GATE.gated;
console.log(GATED
  ? 'GATE: on (SITE_PASSWORD is visible, or GATE=on says the password is a Secret). Every page runs through the password Function.'
  : GATE.mode === 'off'
    ? 'GATE: off (GATE=off was set on purpose). The site will be OPEN: pages are served as plain files and only /api and /q run as Functions.'
    : 'GATE: off (neither SITE_PASSWORD nor GATE is set; this is a local or non-VOIDtv build, written open with no Functions for pages). Do not upload this folder by hand to a project that should have a password.');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'data', 'shows'), { recursive: true });
const data = assemble();
const MIN_SHOWS = PROFILE.name === 'voidtv' ? 100 : 1; // VOIDtv ships thousands; a small profile (public access, a demo) is legitimately tiny
if (data.shows.length < MIN_SHOWS) { console.error('SITE WOULD SHIP WITH ' + data.shows.length + ' SHOWS: the list or the catalog did not load; refusing to build'); process.exit(1); }
// Catalog shrink (audit CF-018). The counts the site last went out with: on this PC catalog/cache/publish-state.json (the numbers publish.js
// refuses a 10 percent drop against); on a Cloudflare Pages build, which has no catalog/cache, the live site's own /version.txt (shows= and
// episodes=). A build more than 10 percent smaller is refused: the old site stays up. SITE_ALLOW_SHRINK=1 lets one build through when the drop is meant.
const EPISODES = data.shows.reduce((n, s) => n + (s.eps || 0), 0);
{ let before = guards.readLastCounts(PROFILE.catalogDir);
  if (!before && process.env.CF_PAGES === '1') before = guards.liveCountsSync(ORIGIN + '/version.txt');
  const v = guards.shrinkVerdict({ shows: data.shows.length, episodes: EPISODES }, before);
  if (v.fell) {
    if (process.env.SITE_ALLOW_SHRINK === '1') console.warn('WARNING: ' + v.parts.join(', ') + ' against ' + before.source + ' (more than 10% down); SITE_ALLOW_SHRINK=1 is set, so the build goes on');
    else { console.error('CATALOG SHRANK: ' + v.parts.join(', ') + ' against ' + before.source + ' (more than 10% down); refusing to build, the old site stays up. If the drop is meant: run node scripts/publish.js --allow-shrink for a publish, and for the Cloudflare build set SITE_ALLOW_SHRINK = 1 as a plain variable for that one deploy, then delete it (docs/DEPLOY.md).'); process.exit(1); }
  } else if (!before) console.warn('NOTE: no earlier published count to compare with (this PC has no catalog/cache/publish-state.json, and the live version.txt has no counts yet); the shrink check is skipped');
  const unreadable = guards.unreadableGrids(path.join(PROFILE.catalogDir, 'shows'));
  if (unreadable.length) console.warn('WARNING: ' + unreadable.length + ' show grid file' + (unreadable.length === 1 ? '' : 's') + ' did not parse and ' + (unreadable.length === 1 ? 'is' : 'are') + ' missing from the site: ' + unreadable.slice(0, 5).join(', ') + (unreadable.length > 5 ? ' and ' + (unreadable.length - 5) + ' more' : '') + '. Re-match them from HQ.'); }

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
// No rules on purpose. Pages rejects a rule whose source is an absolute address ("Only relative URLs are allowed"), so the old
// www line never worked (audit F-004, CF-025); www is redirected by functions/_middleware.js while the password is on and by a
// Cloudflare Redirect Rule on the zone afterwards (docs/DEPLOY.md, opening day). Pages serves index.html for unknown paths on its
// own (no 404.html ships), and a /show/* 200 rule would shadow the prerendered /show/<slug>/index.html pages that carry the share-card meta.
fs.writeFileSync(path.join(OUT, '_redirects'), '# No rules on purpose: see scripts/site.js and docs/DEPLOY.md (www is redirected by the middleware and by a Cloudflare rule).\n');
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
// Browsers, search engines and feed readers ask for /favicon.ico on their own; without the file they got the home page.
if (fs.existsSync(path.join(brandSrc, 'favicon.ico'))) fs.copyFileSync(path.join(brandSrc, 'favicon.ico'), path.join(OUT, 'favicon.ico'));
// Caching plus the security headers for static files (the same set functions/_middleware.js puts on every Function answer).
fs.writeFileSync(path.join(OUT, '_headers'), guards.headersFile());
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /data/\n');
// Which paths run through Pages Functions, chosen by the same switch as the gate itself. Gate on: everything but the brand assets.
// Gate off: only the analytics intake and the QR redirects, so pages and data files are plain static files and do not use the
// Functions allowance (audit CF-002, CF-003, SP-016). The middleware passes everything when SITE_PASSWORD is not set at runtime.
fs.writeFileSync(path.join(OUT, '_routes.json'), JSON.stringify(guards.routesFor(GATED)));
// QR and short codes: /q/<code> reads this map at the edge
{ const qr = readJsonSafe(path.join(PROFILE.catalogDir, 'qr.json')); const pub = {}; for (const [k, v] of Object.entries(qr || {})) if (!k.startsWith('_') && v && v.url) pub[k] = { url: v.url, label: v.label || '' }; fs.writeFileSync(path.join(OUT, 'qr.json'), JSON.stringify(pub)); }
// Web app manifest: phones and TVs can add voidtv.net to the home screen and open it full-screen.
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({ name: BRAND, short_name: BRAND, description: 'TV shows from the Internet Archive, 1990 to now. Before AI slop, there was human creativity.', start_url: '/', display: 'standalone', background_color: '#07080c', theme_color: '#07080c', icons: [{ src: '/assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }));

// Count what is about to be deployed (audit F-005, CF-008): Pages refuses a deploy over 20,000 files or a file over 25 MiB, and the
// old site simply stays up, so the limit is met only when someone needs a deploy. Warn early, refuse before it comes to that, and
// delete the output on a refusal so there is nothing half-built that could be deployed by hand. version.txt is written last and
// counts itself. This counts every file in the output, including the copied Function files and _headers, _redirects and
// _routes.json, so it reads a few more than the "Uploading" figure in the Pages build log. That errs on the safe side.
const size = (p) => fs.statSync(p).size;
let total = 0, fileCount = 0, largest = 0, largestFile = '';
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else { const n = size(p); total += n; fileCount++; if (n > largest) { largest = n; largestFile = path.relative(OUT, p).split(path.sep).join('/'); } } } };
walk(OUT);
fileCount++; // version.txt
{ const r = guards.checkOutput({ files: fileCount, largest, largestFile });
  if (r.level === 'refuse') { fs.rmSync(OUT, { recursive: true, force: true }); console.error('SITE TOO BIG FOR PAGES: ' + r.why.join('; ') + '. The output was removed so nothing half-built is left to deploy; the old site stays up. Reduce what the site writes (audit F-005).'); process.exit(1); }
  if (r.level === 'warn') console.warn('WARNING: ' + r.why.join('; ') + '. Pages refuses a deploy over 20,000 files; plan the data split (audit F-005).'); }
// Which commit this build came from, and what the build decided. The doctor reads version.txt from the live site: gate=on|off must match
// what the site really does, the counts say how close the limits are, and the commit is compared with origin/master.
{ let sha = process.env.CF_PAGES_COMMIT_SHA || ''; if (!sha) { try { sha = require('child_process').execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { sha = 'unknown'; } }
  fs.writeFileSync(path.join(OUT, 'version.txt'), guards.versionText({ sha, at: new Date().toISOString(), gate: GATED, files: fileCount, largest, largestFile, shows: data.shows.length, episodes: EPISODES })); }
console.log(`${data.channels.length} channels, ${Object.keys(data.bios || {}).length} person pages, ${data.shows.length} shows -> site/ (index ${(size(path.join(OUT, 'index.html')) / 1e6).toFixed(2)} MB, ${data.shows.length} show pages, ${fileCount} files, largest ${(largest / 1e6).toFixed(1)} MB, total ${(total / 1e6).toFixed(1)} MB, gate ${GATED ? 'on' : 'off'})`);
