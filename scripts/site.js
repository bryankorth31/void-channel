// THE SITE: builds the deployable static site into site/ for Cloudflare Pages (or any static host).
//   site/index.html                 the app shell with the browse index inline
//   site/data/shows/<slug>.json     seasons, episodes, cast, crew; fetched when a show opens
//   site/data/pp/<n>.json            people in 256 pieces; a person's page loads one
//   site/data/links.json            which shows connect, for Six Degrees
//   site/show/<slug>/index.html     the same shell with that show's title, poster and description
//                                   in the page head, so a shared link renders a real card
//   site/_redirects                 comments only (Pages rejects an absolute-address rule; www is handled elsewhere, see docs/DEPLOY.md)
//   site/_headers                   caching and the security headers (scripts/lib/siteguards.js has the list)
//   site/_routes.json               which paths run as Pages Functions: everything while the password is on, /api and /q once it is off
//   site/version.txt                commit, time, gate=on|off and the file counts; the doctor reads it from the live site
// The one switch is two plain-text variables on the Pages project, because the build cannot see an encrypted Secret:
// SITE_PASSWORD (or GATE = on) = gate on; GATE = off with no password = open; neither on a Cloudflare build of VOIDtv = refused.
// See docs/DEPLOY.md, "The one switch". The build refuses to ship under 100 shows, a catalog more than 10 percent smaller than the
// last publish, a Live TV schedule that breaks in the next 7 days, 19,500 files (Pages allows 20,000) or a file over 24 MiB.
// Usage: node scripts/site.js [--base https://voidtv.net] [--preview]
//   --preview  approvedOnly profiles (kids): every show with strictly matched episodes, approved or not, each one
//              badged "not approved", into <siteDir>-preview (git-ignored), never into siteDir. Every page carries a
//              PREVIEW banner and noindex. It writes no functions or _routes.json into its folder, but that alone would
//              not keep it off the web: a Git-built Pages project runs the repo-root functions/ whatever the output
//              holds. So it also refuses to run inside a Pages build (CF_PAGES set): previews are built on the PC only.
const fs = require('fs');
const readJsonSafe = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const path = require('path');
const { assemble, page, showFile, indexEntry, SITE_NAME, BRAND } = require('./lib/app');
const guards = require('./lib/siteguards');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const args = process.argv.slice(2);
// --open used to narrow the routes by hand while the password variable said something else; the two could disagree and the
// site came up open with no analytics (audit CF-003). It is gone. Passing it is an error so an old build command fails loudly
// (the old site stays up) instead of being ignored.
if (args.includes('--open')) { console.error('--open no longer exists. The SITE_PASSWORD and GATE variables on the Pages project are the only switch: SITE_PASSWORD (or GATE = on) = password on, GATE = off = site open (docs/DEPLOY.md, "The one switch"). Remove --open from the build command.'); process.exit(2); }
const PREVIEW = args.includes('--preview');
if (PREVIEW && process.env.CF_PAGES) { console.error('--preview never runs in a Pages build (CF_PAGES is set): a preview is for looking at locally, not for deploying'); process.exit(1); }
if (PREVIEW && !PROFILE.approvedOnly) { console.error('--preview is for profiles that show approved shows only (PROFILE.approvedOnly); ' + PROFILE.name + ' already shows everything'); process.exit(1); }
const OUT = PREVIEW ? PROFILE.siteDir + '-preview' : PROFILE.siteDir;
// Bryan's rule: anything carrying the name says "voidtv.net" (never "VOIDtv" alone), portals included.
for (const x of PROFILE.portals) if (!/voidtv\.net/i.test(x.name)) console.warn('PORTAL NAME WITHOUT "voidtv.net": ' + x.name + ' (profile.json portals)');
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
const data = assemble({ preview: PREVIEW });
// VOIDtv ships thousands; a small profile (public access, a demo) is legitimately tiny; an approvedOnly site is
// legitimately empty until a person approves a show (the page says so), but its list must still have loaded.
const MIN_SHOWS = PROFILE.name === 'voidtv' ? 100 : PROFILE.approvedOnly ? 0 : 1;
if (PROFILE.approvedOnly && !((readJsonSafe(PROFILE.listFile) || {}).shows || []).length) { console.error('THE LIST DID NOT LOAD (' + PROFILE.listFile + '): refusing to build'); process.exit(1); }
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

// Live TV (B, 25 Oct 2026; step 2 of PLAN-voidtv-home-and-spots). The same check as the doctor's tv:schedule light (scripts/lib/tvgrid.js checkTv),
// run on each of the next 7 days, because the lineup rotates weekly. A red day (airings off the 30-minute grid, overlapping or running past their
// time, a show the plan names that the build does not have, or a channel left empty) refuses the build: the old site stays up. Yellow (a channel
// with many holding cards) only warns. SITE_ALLOW_BROKEN_TV=1 lets one build through when the cause is known; delete it after, like SITE_ALLOW_SHRINK.
if (PROFILE.features.live) { const TVG = require('./lib/tvgrid'), slugs = data.shows.map((s) => s.slug), now = Date.now();
  let red = null, yellow = null;
  for (let d = 0; d < 7 && !red; d++) { const r = TVG.checkTv(data.tv, slugs, now + d * 86400000); if (r.level === 'red') red = { day: d, ...r }; else if (r.level === 'yellow' && !yellow) yellow = r; }
  if (red) {
    const when = red.day ? red.day + ' day' + (red.day === 1 ? '' : 's') + ' from now' : 'today';
    if (process.env.SITE_ALLOW_BROKEN_TV === '1') console.warn('WARNING: LIVE TV SCHEDULE BROKEN ' + when + ': ' + red.detail + '; SITE_ALLOW_BROKEN_TV=1 is set, so the build goes on');
    else { console.error('LIVE TV SCHEDULE BROKEN ' + when + ': ' + red.detail + '; refusing to build, the old site stays up. ' + red.fix + ' If the cause is known and the site must go out anyway, set SITE_ALLOW_BROKEN_TV=1 for one build (on Cloudflare: the plain Text variable SITE_ALLOW_BROKEN_TV = 1 in the Production list, deleted after that deploy).'); process.exit(1); }
  } else console.log('Live TV: the next 7 days check out' + (yellow ? ' (note: ' + yellow.detail + ')' : ''));
}
for (const s of data.shows) fs.writeFileSync(path.join(OUT, 'data', 'shows', s.slug + '.json'), JSON.stringify(showFile(s, data)));
fs.writeFileSync(path.join(OUT, 'data', 'index.js'), 'const SHOWS=' + JSON.stringify(data.shows.map(indexEntry)) + ';');
// People and show links, split for phones (B, 25 Oct 2026): the one graph.json had grown to 21 MB, near Cloudflare's 25 MiB
// cap, and a person's page on a phone fetched all of it. Now data/pp/<id % 256>.json holds the people (about 40 KB each;
// a person's page loads one) and data/links.json holds only which shows connect, for Six Degrees (about 1.4 MB). Who links
// two shows comes from each show's own file, which already carries its links.
// They ship only when their features are on (kids: neither).
if (PROFILE.features.people || PROFILE.features.sixDegrees) { const PP = 256, shards = Array.from({ length: PP }, () => ({}));
  for (const [id, p] of Object.entries(data.people)) if (/^\d+$/.test(id)) shards[Number(id) % PP][id] = p;
  fs.mkdirSync(path.join(OUT, 'data', 'pp'), { recursive: true });
  shards.forEach((sh, i) => fs.writeFileSync(path.join(OUT, 'data', 'pp', i + '.json'), JSON.stringify(sh)));
  const ls = Object.keys(data.links), li = new Map(ls.map((x, i) => [x, i]));
  fs.writeFileSync(path.join(OUT, 'data', 'links.json'), JSON.stringify({ s: ls, a: ls.map((x) => Object.keys(data.links[x]).map((y) => li.get(y)).filter((n) => n !== undefined)) })); }
if (PROFILE.features.live) {
  const TV_JSON = JSON.stringify(data.tv);
  fs.writeFileSync(path.join(OUT, 'data', 'tv.json'), TV_JSON);
  console.log(`data/tv.json: ${Buffer.byteLength(TV_JSON).toLocaleString('en-US')} bytes (the old list of every episode on every channel was about 2 MB)`);
}
if (PROFILE.features.people) {
  fs.mkdirSync(path.join(OUT, 'data', 'people'), { recursive: true });
  for (const [id, b] of Object.entries(data.bios || {})) fs.writeFileSync(path.join(OUT, 'data', 'people', id + '.json'), JSON.stringify(b));
}

const shell = (meta) => page({ data, mode: 'split', routes: 'path', base: '/', meta, preview: PREVIEW });
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
    title: s.show, image: PROFILE.features.tmdbImages ? s.backdrop || s.poster || undefined : (s.poster ? ORIGIN + s.poster : undefined), url: `${ORIGIN}/show/${s.slug}`,
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
// A preview copies no functions into its folder (it is for looking at locally; a Git-built Pages project would run the
// repo-root functions/ regardless, which is why --preview refuses to run in a Pages build).
const fnSrc = path.join(ROOT, 'functions');
if (fs.existsSync(fnSrc) && !PREVIEW) {
  fs.cpSync(fnSrc, path.join(OUT, 'functions'), { recursive: true });
  // analytics 'aggregate' (kids, COPPA) is a switch inside functions/api/e.js (ANALYTICS_MODE=aggregate on the Pages
  // project), because a Git-built Pages project runs the repo's functions/ folder, not a copy in the output.
  // externalLinks off: no /q/<code> redirects (a QR code can point anywhere).
  if (!PROFILE.features.externalLinks) fs.rmSync(path.join(OUT, 'functions', 'q'), { recursive: true, force: true });
}
const brandSrc = path.join(ROOT, 'assets', 'brand');
// The VOID player (player/): one script bundle and one stylesheet, cached with the rest of /assets.
{ const P = path.join(ROOT, 'player', 'src'); const dst = path.join(OUT, 'assets', 'player'); fs.mkdirSync(dst, { recursive: true });
  fs.writeFileSync(path.join(dst, 'voidplayer.js'), ['core.js', 'icons.js', 'player.js'].map((f) => fs.readFileSync(path.join(P, f), 'utf8')).join('\n;\n'));
  fs.copyFileSync(path.join(P, 'player.css'), path.join(dst, 'player.css')); }
// The kids theme takes only the fonts and the UI icons from VOIDtv's brand folder (none of its neon art).
const kidsBrand = (parts) => PROFILE.theme !== 'kids' || parts[0] === '' || parts[0] === 'fonts' || (parts[0] === 'ui' && (parts.length === 1 || parts[1] === 'icons'));
if (fs.existsSync(brandSrc)) fs.cpSync(brandSrc, path.join(OUT, 'assets', 'brand'), { recursive: true, filter: (p) => { const parts = path.relative(brandSrc, p).split(path.sep); return !parts.includes('src') && !parts.includes('sheets') && kidsBrand(parts); } }); // the 2K originals and design sheets stay out of the site
// Kids learning breaks (PLAN-kids-learning-breaks): approved cards only (in a --preview build, every card not denied), in a
// fixed shuffled order, with their voice clips from <catalog>/voice. Nothing else of the cards file ships.
if (PROFILE.theme === 'kids') {
  const B = readJsonSafe(path.join(PROFILE.catalogDir, 'breaks.json')), VD = path.join(PROFILE.catalogDir, 'voice');
  const cards = ((B && B.cards) || []).filter((c) => c.approved === true || (PREVIEW && !c.denied));
  const h = (x) => { let n = 2166136261; for (const ch of String(x)) n = Math.imul(n ^ ch.charCodeAt(0), 16777619) >>> 0; return n; };
  cards.sort((a, b) => h(a.id) - h(b.id));
  fs.writeFileSync(path.join(OUT, 'data', 'breaks.json'), JSON.stringify({ cards: cards.map((c) => ({ id: c.id, kind: c.kind, say: c.say, ask: c.ask, answers: c.answers && c.answers.map((a) => ({ text: a.text, right: !!a.right })), try: c.try, reveal: c.reveal })) }));
  const vd = path.join(OUT, 'assets', 'kids', 'voice'); let clips = 0;
  for (const c of cards) for (const part of ['a', 'b']) { const f = path.join(VD, c.id + '-' + part + '.mp3'); if (fs.existsSync(f)) { fs.mkdirSync(vd, { recursive: true }); fs.copyFileSync(f, path.join(vd, c.id + '-' + part + '.mp3')); clips++; } }
  console.log('Learning breaks: ' + cards.length + ' cards' + (PREVIEW ? ' (preview: drafts included)' : ' (approved)') + ', ' + clips + ' voice clips');
  // Play and Learn (PLAN-kids-play): the games page at /play/, with the voice clips its lines use.
  const pl = require('./lib/play/build').buildPlay({ out: OUT, catalogDir: PROFILE.catalogDir, siteName: PROFILE.siteName, preview: PREVIEW });
  console.log('Play and Learn: /play/, ' + pl.lines + ' spoken lines, ' + pl.clips + ' voice clips');
  // Void Village (PLAN-void-village): the 3D village at /village/, three.js and Planck.js self-hosted, its voice clips.
  require('./lib/village/build').buildVillage(OUT, PROFILE.catalogDir, { preview: PREVIEW }); console.log('Void Village: /village/');
  // Brave steps (profiles/kids/docs/BRAVE-STEPS.md): small steps for everyday worries, with a grown-up, at /brave/.
  // Computer games (PLAY's player, kids cards only) at /games/; its pictures are our own copies.
  { const kg = require('./lib/games/build').buildGames(OUT, ROOT, { artDir: path.join(PROFILE.dir, 'site-assets', 'games'), preview: PREVIEW }); console.log('Computer games: /games/, ' + kg.games + ' games' + (kg.play ? ' from ' + kg.play : '')); }
  const bv = require('./lib/brave/build').buildBrave(OUT, PROFILE.catalogDir, { preview: PREVIEW }); console.log('Brave steps: /brave/, ' + bv.lines + ' spoken lines, ' + bv.clips + ' voice clips');
}
// Kids art: the mark and icons (assets/kids), then a self-hosted poster (scripts/kids-posters.js, tmdbImages off) for each
// show IN THIS BUILD only. Copying the whole posters folder would publish the unapproved lineup at /assets/kids/posters/.
if (PROFILE.theme === 'kids' || !PROFILE.features.tmdbImages) {
  for (const d of [path.join(ROOT, 'assets', 'kids'), path.join(PROFILE.dir, 'site-assets')]) if (fs.existsSync(d)) fs.cpSync(d, path.join(OUT, 'assets', 'kids'), { recursive: true, filter: (p) => { const parts = path.relative(d, p).split(path.sep); return !parts.includes('posters') && parts[0] !== 'games'; } }); // games pictures: only the games built (scripts/lib/games/build.js)
  const dst = path.join(OUT, 'assets', 'kids', 'posters');
  for (const s of data.shows) {
    const m = /^\/assets\/kids\/posters\/([a-z0-9-]+\.jpg)$/.exec(s.poster || ''); if (!m) continue;
    const src = [path.join(PROFILE.dir, 'site-assets', 'posters', m[1]), path.join(ROOT, 'assets', 'kids', 'posters', m[1])].find((f) => fs.existsSync(f)); // same order as app.js POSTER_DIRS
    if (src) { fs.mkdirSync(dst, { recursive: true }); fs.copyFileSync(src, path.join(dst, m[1])); }
  }
}
// Browsers, search engines and feed readers ask for /favicon.ico on their own; without the file they got the home page.
if (PROFILE.theme !== 'kids' && fs.existsSync(path.join(brandSrc, 'favicon.ico'))) fs.copyFileSync(path.join(brandSrc, 'favicon.ico'), path.join(OUT, 'favicon.ico')); // kids: its own icons (assets/kids)
// Caching plus the security headers for static files (the same set functions/_middleware.js puts on every Function answer).
fs.writeFileSync(path.join(OUT, '_headers'), guards.headersFile({ kids: PROFILE.theme === 'kids' }));
// The smallest service worker that lets browsers offer Install app (Bryan, 25 Oct 2026). It caches nothing: pages and data always come
// from the network, and a page load with no connection gets a one-line offline page instead of the browser's error.
// kids: the same worker, its offline line in the kids colours and name.
const KIDS_SW = "self.addEventListener('install',()=>self.skipWaiting());\nself.addEventListener('activate',(e)=>e.waitUntil(self.clients.claim()));\nself.addEventListener('fetch',(e)=>{if(e.request.mode!=='navigate')return;e.respondWith(fetch(e.request).catch(()=>new Response('<!doctype html><meta name=viewport content=\"width=device-width\"><body style=\"background:#fff8e7;color:#1d2b3a;font-family:sans-serif;padding:24px\"><h1>" + String(PROFILE.siteName).replace(/[^\w .-]/g, '') + "</h1><p>You are offline. Connect and reload.</p>',{headers:{'content-type':'text/html; charset=utf-8'}})))});\n";
fs.writeFileSync(path.join(OUT, 'sw.js'), "self.addEventListener('install',()=>self.skipWaiting());\nself.addEventListener('activate',(e)=>e.waitUntil(self.clients.claim()));\nself.addEventListener('fetch',(e)=>{if(e.request.mode!=='navigate')return;e.respondWith(fetch(e.request).catch(()=>new Response('<!doctype html><meta name=viewport content=\"width=device-width\"><body style=\"background:#07080c;color:#eee;font-family:sans-serif;padding:24px\"><h1>voidtv.net</h1><p>You are offline. Connect and reload.</p>',{headers:{'content-type':'text/html; charset=utf-8'}})))});\n");
if (PROFILE.theme === 'kids') fs.writeFileSync(path.join(OUT, 'sw.js'), KIDS_SW);
fs.writeFileSync(path.join(OUT, 'robots.txt'), PREVIEW ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\nDisallow: /data/\n');
// kids, open and not a preview: a sitemap of the home page, Play and Learn, Void Village and every show page, named in robots.txt.
if (PROFILE.theme === 'kids' && !PREVIEW && !GATED) {
  const showDir = path.join(OUT, 'show');
  const shows = fs.existsSync(showDir) ? fs.readdirSync(showDir).filter((d) => fs.existsSync(path.join(showDir, d, 'index.html'))).sort() : [];
  const pages = ['/'].concat(['play', 'games', 'village', 'brave'].filter((d) => fs.existsSync(path.join(OUT, d, 'index.html'))).map((d) => '/' + d + '/'), shows.map((d) => '/show/' + d + '/'));
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), guards.sitemapFor(ORIGIN, pages));
  fs.appendFileSync(path.join(OUT, 'robots.txt'), 'Sitemap: ' + ORIGIN + '/sitemap.xml\n');
  console.log('Sitemap: ' + pages.length + ' pages');
}
// Which paths run through Pages Functions, chosen by the same switch as the gate itself. Gate on: everything but the brand assets.
// Gate off: only the analytics intake and the QR redirects, so pages and data files are plain static files and do not use the
// Functions allowance (audit CF-002, CF-003, SP-016). The middleware passes everything when SITE_PASSWORD is not set at runtime.
// A preview writes none (it is never deployed; see --preview above).
if (!PREVIEW) fs.writeFileSync(path.join(OUT, '_routes.json'), JSON.stringify(guards.routesFor(GATED)));
// QR and short codes: /q/<code> reads this map at the edge
// Kids has no links out, so no QR map (functions/q sends a kids host home in any case).
if (PROFILE.features.externalLinks) { const qr = readJsonSafe(path.join(PROFILE.catalogDir, 'qr.json')); const pub = {}; for (const [k, v] of Object.entries(qr || {})) if (!k.startsWith('_') && v && v.url) pub[k] = { url: v.url, label: v.label || '' }; fs.writeFileSync(path.join(OUT, 'qr.json'), JSON.stringify(pub)); }
// Web app manifest: phones and TVs can add voidtv.net to the home screen and open it full-screen.
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify(PROFILE.theme === 'kids' ? { name: PROFILE.siteName, short_name: PROFILE.siteName, description: PROFILE.siteName + ': ' + PROFILE.tagline, start_url: '/', display: 'standalone', background_color: '#fff8e7', theme_color: '#fff8e7', icons: [{ src: '/assets/kids/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/kids/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] } : { name: BRAND, short_name: BRAND, description: 'TV shows from the Internet Archive, 1990 to now. Before AI slop, there was human creativity.', start_url: '/', display: 'standalone', background_color: '#07080c', theme_color: '#07080c', icons: [{ src: '/assets/brand/icon-192.png?v=2', sizes: '192x192', type: 'image/png' }, { src: '/assets/brand/icon-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/assets/brand/icon-512-maskable.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }));

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
console.log(`${data.channels.length} channels, ${Object.keys(data.bios || {}).length} person pages, ${data.shows.length} shows -> ${path.relative(ROOT, OUT).split(path.sep).join('/')}/${PREVIEW ? ' (PREVIEW: not deployable)' : ''} (index ${(size(path.join(OUT, 'index.html')) / 1e6).toFixed(2)} MB, ${data.shows.length} show pages, ${fileCount} files, largest ${(largest / 1e6).toFixed(1)} MB, total ${(total / 1e6).toFixed(1)} MB, gate ${GATED ? 'on' : 'off'})`);
