// Audit of what the kids site build actually ships (docs/KIDS.md section 3). Builds a small kids fixture with the real
// scripts/site.js in a temp copy of the tree (no network, nothing outside the temp folder is written), once for real and
// once as --preview, then reads every file a browser can fetch (functions/ is server code and is not scanned) and checks:
//   - no off-site URL except the Archive video hosts, and those only in the player's code paths (the player bundle, the
//     page's filesFor(), the episode files in data/shows/); the portal behind the grown-up check is the one sanctioned
//     exception and may appear only inside the PORTALS data, never as a link in the markup;
//   - unapproved shows, approved shows with no LIVE episode, self-listed shows and REVIEW episodes are absent, posters
//     included (the poster folder holds the whole lineup; only the build's own shows may ship);
//   - no Sentry or TMDB host strings.
// Run:  node --test scripts/test/kids-site-audit.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const DOMAIN = 'https://kids.example.test';
const PORTAL = 'https://voidtv.net';
const FEATURES = { downloads: false, archiveLinks: false, people: false, sixDegrees: false, cash: false, donate: false, live: false, share: false, sentry: false, analytics: 'aggregate', externalLinks: false, tmdbImages: false };

const ep = (n, state, item) => ({ number: n, name: 'Episode ' + n, state, file: { conf: state === 'LIVE' ? 1 : 0.6, why: 'S/E in filename', item, file: `S01E0${n}.mp4`, name: `S01E0${n}`, url: `https://archive.org/download/${item}/S01E0${n}.mp4`, seconds: 1400, format: 'MPEG4', playable: true, sizeMB: 120 }, alternates: [] });
const grid = (show, slug, type, eps, extra = {}) => ({ show, slug, type, network: 'PBS', matchedAt: '2026-10-18T00:00:00Z', tvmaze: { id: 1, runtime: 25, premiered: '1990-01-01' }, seasons: [{ season: 1, episodes: eps }], ...extra });
const SHOWS = [
  { name: 'Approved Toon', slug: 'approved-toon', approved: true, grid: (s) => grid(s.name, s.slug, 'Little Kids', [ep(1, 'LIVE', 'approved-1'), ep(2, 'LIVE', 'approved-1'), ep(3, 'REVIEW', 'approved-review-copy')]) },
  { name: 'Unapproved Toon', slug: 'unapproved-toon', approved: false, grid: (s) => grid(s.name, s.slug, 'Big Kids', [ep(1, 'LIVE', 'unapproved-1')]) },
  { name: 'Review Only Toon', slug: 'review-only-toon', approved: true, grid: (s) => grid(s.name, s.slug, 'Big Kids', [ep(1, 'REVIEW', 'review-1'), ep(2, 'REVIEW', 'review-1')]) },
  { name: 'Self Listed Toon', slug: 'self-listed-toon', approved: true, grid: (s) => grid(s.name, s.slug, 'Big Kids', [ep(1, 'LIVE', 'self-1')], { selfListed: true }) },
];

let TMP;
function copy(rel) { const src = path.join(ROOT, rel); if (fs.existsSync(src)) fs.cpSync(src, path.join(TMP, rel), { recursive: true }); }
function fixture() {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kids-audit-'));
  for (const rel of ['scripts/site.js', 'scripts/lib', 'player/src', 'player/tools/rank-sources.js', 'assets/kids', 'assets/brand/fonts', 'assets/brand/ui/icons', 'functions']) copy(rel);
  const P = path.join(TMP, 'profiles', 'kids-audit'), C = path.join(P, 'catalog');
  fs.mkdirSync(path.join(C, 'shows'), { recursive: true });
  fs.mkdirSync(path.join(P, 'site-assets', 'posters'), { recursive: true });
  fs.writeFileSync(path.join(P, 'profile.json'), JSON.stringify({ siteName: 'voidtv.net kids', tagline: 'audit fixture', domain: DOMAIN,
    listFile: 'profiles/kids-audit/list.json', catalogDir: 'profiles/kids-audit/catalog', siteDir: 'profiles/kids-audit/site', rows: ['Little Kids', 'Big Kids'],
    strict: true, approvedOnly: true, theme: 'kids', features: FEATURES, portals: [{ name: 'voidtv.net', url: PORTAL, blurb: 'For grown-ups.' }] }));
  fs.writeFileSync(path.join(P, 'list.json'), JSON.stringify({ types: ['Little Kids', 'Big Kids'], shows: SHOWS.map((s) => ({ name: s.name, type: s.grid(s).type, network: 'PBS', approved: s.approved })) }));
  const art = {};
  for (const s of SHOWS) {
    fs.writeFileSync(path.join(C, 'shows', s.slug + '.json'), JSON.stringify(s.grid(s)));
    fs.writeFileSync(path.join(P, 'site-assets', 'posters', s.slug + '.jpg'), Buffer.alloc(2048, 7)); // every show has a poster on disk
    art[s.slug] = { poster: 'https://image.tmdb.org/t/p/w342/' + s.slug + '.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/' + s.slug + '.jpg', overview: s.name + ' is a show.', genres: ['Kids'], rating: 7 };
  }
  fs.writeFileSync(path.join(C, 'art.json'), JSON.stringify(art));
  return P;
}
function build(args) {
  const r = spawnSync(process.execPath, [path.join(TMP, 'scripts', 'site.js'), ...args], { cwd: TMP, env: { ...process.env, VOID_PROFILE: 'kids-audit', CF_PAGES: '' }, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, 'site.js failed: ' + r.stderr + r.stdout);
  return r.stdout;
}
// Every file a browser can fetch, as [relative path, text]; functions/ runs on the server and is left out.
function shipped(dir) {
  const out = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f), rel = path.relative(dir, p).split(path.sep).join('/'); if (rel === 'functions') continue; if (fs.statSync(p).isDirectory()) walk(p); else out.push([rel, /\.(jpg|png|woff2?|webp)$/.test(f) ? '' : fs.readFileSync(p, 'utf8')]); } };
  walk(dir);
  return out;
}
const URL_RE = /https?:\/\/[^\s"'`<>)\\,;]+/g;
// Where an Archive URL may appear: the video itself, in the player's code paths only.
function archiveOk(rel, text, url, at) {
  // the security policy lets the video and the player's look-up through (media-src, connect-src), nothing else
  if (rel === '_headers') { if (!/^https:\/\/(?:\*\.)?archive\.org$/.test(url)) return false; const seg = text.slice(Math.max(text.lastIndexOf(';', at), text.lastIndexOf('\n', at)) + 1, at); return /^\s*(?:media|connect)-src /.test(seg); }
  if (!/^https:\/\/(?:[a-z0-9-]+\.)*archive\.org(?:\/|$)/.test(url)) return false;
  if (rel === 'assets/player/voidplayer.js') return true; // the player: server lookup and the files it plays
  if (/^data\/shows\/[a-z0-9-]+\.json$/.test(rel)) return url.startsWith('https://archive.org/download/'); // episode files
  if (rel.endsWith('.html')) { const fn = text.lastIndexOf('function filesFor(', at); return url === 'https://archive.org/download/' && fn >= 0 && !text.slice(fn, at).includes('\nfunction '); }
  return false;
}
// Kids Computer games (/games/, built by scripts/lib/games/build.js) ship PLAY's own player files as they are, so their
// code holds addresses that voidtv.net's PLAY uses. Each one passes only for what it is on Kids, and only while play.js
// keeps the kids guard that makes it so; if PLAY drops a guard, the address fails here (Bryan, 26 Nov 2026: "Teach the
// Kids site check the games folder").
const KIDS_GUARDS = [
  "const KIDS = document.documentElement.hasAttribute('data-kids');",            // play.js knows a kids page
  "for (const e of document.querySelectorAll('.donate, #give, #give-card')) e.remove();", // no donation in front of a child
  "if (KIDS) $('from').textContent = 'The game plays straight from the Internet Archive.';", // the Archive in words, no link
];
function gamesOk(dir, rel, url) {
  if (rel === 'games/LICENSE.txt') return true; // the licence's own text: names, never a link on the page
  if (!/^games\/src\/[a-z0-9-]+\.js$/.test(rel)) return false;
  if (/^https:\/\/archive\.org\/(?:cors|services\/img)\//.test(url)) return true; // the game's own files and pictures, fetched from the Archive as the video player does
  const play = fs.existsSync(path.join(dir, 'games', 'src', 'play.js')) ? fs.readFileSync(path.join(dir, 'games', 'src', 'play.js'), 'utf8') : '';
  if (!KIDS_GUARDS.every((g) => play.includes(g))) return false;
  if (rel === 'games/src/cards.js' && url === 'https://archive.org/details/') return true; // the game's Archive page: on Kids said in words, never linked
  if (rel === 'games/src/cards.js' && /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/tree\/[0-9a-f]{40}$/.test(url)) return true; // each engine's source offer: on Kids it fills a hidden span, the offer is on For grown-ups
  if (rel === 'games/src/play.js' && /^https:\/\/square\.link\//.test(url)) return true; // the CASH donation: play.js removes it on a kids page
  return false;
}
function audit(dir) {
  const problems = [];
  for (const [rel, text] of shipped(dir)) {
    if (!text) continue;
    for (const m of text.matchAll(URL_RE)) {
      const url = m[0];
      if (url.startsWith(DOMAIN + '/') || url === DOMAIN) continue; // the site's own origin (og:url)
      if (url === 'http://www.w3.org/2000/svg') continue; // the SVG namespace (inline icons, the kids mark): a name, not a request
      if (url === 'http://www.w3.org/1999/xhtml' && rel === 'assets/kids/three/three.min.js') continue; // the XHTML namespace inside three.js (Void Village): a name, not a request
      if (url === 'http://www.sitemaps.org/schemas/sitemap/0.9' && rel === 'sitemap.xml') continue; // the sitemap namespace (B, 17 Nov 2026: "Add a sitemap"): a name, not a request
      if (archiveOk(rel, text, url, m.index)) continue;
      if (rel.startsWith('games/') && gamesOk(dir, rel, url)) continue;
      if (url === PORTAL && rel.endsWith('.html') && text.slice(Math.max(0, m.index - 200), m.index).includes('const PORTALS=')) continue; // behind the grown-up check
      if (/^https:\/\/square\.link\//.test(url) && rel.endsWith('.html') && text.slice(Math.max(0, m.index - 40), m.index).includes('const KDONATE=')) continue; // the CASH donation, also only behind the grown-up check (B, 17 Nov 2026: grown-ups only, replacing C9)
      problems.push(rel + ': ' + url);
    }
    for (const host of [/sentry\.io/i, /sentry-cdn/i, /browser\.sentry/i, /image\.tmdb\.org/i, /themoviedb\.org/i]) if (host.test(text)) problems.push(rel + ': ' + host);
    if (/href="https?:/.test(text.replace(/<link rel="(?:stylesheet|icon|apple-touch-icon|manifest)"[^>]*>/g, ''))) problems.push(rel + ': an off-site href in the markup');
  }
  return problems;
}
const has = (dir, rel) => fs.existsSync(path.join(dir, rel));
const all = (dir) => shipped(dir).map(([, t]) => t).join('\n');

test('kids site build ships nothing off-site, nothing unapproved, nothing from Sentry or TMDB', async (t) => {
  const P = fixture();
  try {
    await t.test('real build', () => {
      build([]);
      const site = path.join(P, 'site');
      assert.deepStrictEqual(audit(site), []);
      const index = fs.readFileSync(path.join(site, 'data', 'index.js'), 'utf8');
      const shows = JSON.parse(index.slice('const SHOWS='.length, -1));
      assert.deepStrictEqual(shows.map((s) => s.slug), ['approved-toon']);
      assert.ok(!shows[0].na, 'an approved show carries no "not approved" badge');
      assert.deepStrictEqual(fs.readdirSync(path.join(site, 'data', 'shows')), ['approved-toon.json']);
      assert.deepStrictEqual(fs.readdirSync(path.join(site, 'show')), ['approved-toon']);
      assert.deepStrictEqual(fs.readdirSync(path.join(site, 'assets', 'kids', 'posters')), ['approved-toon.jpg'], 'only the build\'s own posters ship');
      const eps = JSON.parse(fs.readFileSync(path.join(site, 'data', 'shows', 'approved-toon.json'), 'utf8')).seasons.flatMap((se) => se.episodes);
      assert.deepStrictEqual(eps.map((e) => e.n), [1, 2], 'the REVIEW episode is left out');
      const text = all(site);
      for (const gone of ['Unapproved Toon', 'unapproved-toon', 'Review Only Toon', 'review-only-toon', 'Self Listed Toon', 'self-listed-toon', 'approved-review-copy']) assert.ok(!text.includes(gone), gone + ' leaked into the build');
      const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
      assert.ok(html.includes('noDownload:true'), 'the player is told not to offer downloads');
      assert.ok(!/rel="(?:preconnect|dns-prefetch)"/.test(html), 'no preconnect or dns-prefetch to anyone');
      assert.ok(!has(site, 'data/graph.json') && !has(site, 'data/tv.json') && !has(site, 'data/people'), 'no people graph, channels or person pages');
    });
    await t.test('preview build', () => {
      build(['--preview']);
      const site = path.join(P, 'site-preview');
      assert.deepStrictEqual(audit(site), []);
      const shows = JSON.parse(fs.readFileSync(path.join(site, 'data', 'index.js'), 'utf8').slice('const SHOWS='.length, -1));
      assert.deepStrictEqual(shows.map((s) => [s.slug, s.na || 0]).sort(), [['approved-toon', 0], ['unapproved-toon', 1]], 'the preview adds unapproved shows, badged; still no REVIEW-only or self-listed show');
      assert.ok(!has(site, '_routes.json') && !has(site, 'functions'), 'no routes or functions in a preview');
      assert.ok(fs.readFileSync(path.join(site, 'index.html'), 'utf8').includes('<meta name="robots" content="noindex,nofollow">'));
      const r = spawnSync(process.execPath, [path.join(TMP, 'scripts', 'site.js'), '--preview'], { cwd: TMP, env: { ...process.env, VOID_PROFILE: 'kids-audit', CF_PAGES: '1' }, encoding: 'utf8' });
      assert.notStrictEqual(r.status, 0, '--preview must refuse to run in a Pages build');
    });
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});
