// The name and the two public notices (audit batch C, C2: SP-035, SP-036, CF-032). Run: node --test tests/brand.test.js
// 1. The site is called voidtv.net (lowercase) wherever a visitor reads the name: header, footer, About, the CASH page, person pages,
//    page titles, share cards, the web manifest, the password page. The old spellings (VOIDtv, VoidTV, Void TV, Voidtv) must not come back.
//    What deliberately keeps the old spelling is not visitor-facing: the scheduled-task prefix, comments, the HQ dialogs.
// 2. /privacy and /takedown exist as routes, are linked from About and the footer, and carry the approved text with Bryan's address.
//    No placeholder is left: route 1 on /takedown links the Internet Archive's Terms of Use (https://archive.org/about/terms.php).
// The page code is read out of the REAL built page and run in a bare vm with a fake page; no network, no browser, nothing is played.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('node:vm');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const APP = require('../scripts/lib/app');
const OLD = /VOIDtv|VoidTV|Void TV|Voidtv/;
const CONTACT = 'preacherb@cashvalues.org';
// Old spellings that stay on purpose because they are comments in files this change does not own (three comments in the player, player/src).
// Remove an entry when its owner changes the line.
const KNOWN = [/so it can drop into VOIDtv \(or any page\)/g, /\(VOIDtv has video\{max-height/g, /Nothing here knows about VOIDtv's pages/g];
const strip = (s) => KNOWN.reduce((a, re) => a.replace(re, ''), s);

// The built shell (what scripts/site.js writes as index.html), with an empty catalog: the page code does not depend on the shows.
const SHELL = APP.page({ data: { shows: [], people: {}, links: {}, types: [] }, mode: 'split', routes: 'path', base: '/', meta: { url: 'https://voidtv.net/' } });
const SCRIPT = SHELL.slice(SHELL.lastIndexOf('<script>') + 8, SHELL.lastIndexOf('</script>'));

// One client function: from its first line to the line before the next top-level statement or comment.
function fn(name) {
  const lines = SCRIPT.split('\n');
  const i = lines.findIndex((l) => l.startsWith('function ' + name + '(') || l.startsWith('async function ' + name + '('));
  assert.ok(i >= 0, name + ' is in the built page script');
  let j = i + 1;
  while (j < lines.length && !/^(function |async function |let |const |var |\/\/|document\.|window\.|go\()/.test(lines[j])) j++;
  return lines.slice(i, j).join('\n');
}

// Render one of the text pages the way the browser does, and hand back the HTML and the document title.
function render(name) {
  const out = { html: '', title: '' };
  const ctx = {
    document: { get title() { return out.title; }, set title(v) { out.title = v; } },
    $: () => ({ set innerHTML(v) { out.html = v; } }), killPlayer() {}, go() {}, BASE: '/', DONATE: 'https://square.link/x', SITE: APP.SITE_NAME,
  };
  vm.createContext(ctx);
  vm.runInContext([fn('textPage'), fn('aboutPage'), fn('cashPage'), fn('privacyPage'), fn('takedownPage'), name + '()'].join('\n'), ctx);
  return out;
}
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('the name: one BRAND constant, voidtv.net, and the profile names the site the same way', () => {
  assert.equal(APP.BRAND, 'voidtv.net');
  assert.equal(APP.SITE_NAME, 'voidtv.net');
  assert.equal(JSON.parse(read('profiles/voidtv/profile.json')).siteName, 'voidtv.net');
  assert.equal(JSON.parse(read('profiles/voidtv/profile.json')).taskPrefix, 'VoidTV', 'the scheduled-task names keep their prefix on purpose');
});

test('the built page never spells the old name: shell, head, header, footer and every page function', () => {
  const shell = strip(SHELL), m = shell.match(OLD);
  assert.equal(m, null, 'old spelling in the built page: ' + (m && shell.slice(Math.max(0, m.index - 60), m.index + 60)));
  assert.match(SHELL, /<title>voidtv\.net<\/title>/);
  assert.match(SHELL, /<meta property="og:site_name" content="voidtv\.net">/);
  assert.match(SHELL, /<meta property="og:title" content="voidtv\.net">/);
  assert.match(SHELL, /const SITE="voidtv\.net";/);
});

test('header: pink "voidtv" and blue ".net" in the brand-kit colours, on one line (it must still fit a 375 px phone)', () => {
  const head = SHELL.match(/<header><div class="logo"[\s\S]*?<\/div>/)[0];
  assert.match(head, /<span class="name"><span class="v">voidtv<\/span><span class="n">\.net<\/span><\/span>/);
  assert.equal(head.replace(/<[^>]+>/g, ''), 'voidtv.net');
  const css = SHELL.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(css, /--brand-pink:#ff4fc8/);
  assert.match(css, /--brand-blue:#5fe3ff/);
  assert.match(css, /header \.logo \.name \.v\{color:var\(--brand-pink\)\}/);
  assert.match(css, /header \.logo \.name \.n\{color:var\(--brand-blue\)\}/);
  assert.match(css, /header \.logo \.name\{[^}]*white-space:nowrap/);
  // The phone rules. voidtv.net is wider than the old VOIDtv, so the name is 14 px (15 px up to 760 px), the mark 24 px and the gap 6 px:
  // measured in a browser at 375 px and at 360 px, the logo, TV, Mine and Donate stay on one row with 27 px and 12 px to spare.
  // At the old 17 px the Donate button dropped to a second row at 375 px.
  const phone = css.match(/@media\(max-width:600px\)\{header\{[^\n]*/)[0];
  assert.match(phone, /header\{gap:10px;column-gap:6px;row-gap:8px;/);
  assert.match(phone, /header \.logo img\.mark\{width:24px;height:24px;margin-right:6px\}/);
  assert.match(phone, /header \.logo \.name\{font-size:14px\}/);
  // up to 760 px: the name 15 px and the TV and Mine text labels hidden (icons stay), so the search box keeps about 94 px at 601 px
  assert.match(css, /@media\(max-width:760px\)\{header \.logo \.name\{font-size:15px\}header \.mine-link \.long\{display:none\}\}/);
  assert.doesNotMatch(phone, /header \.logo \.name\{[^}]*display:none/);
});

test('footer: About, Privacy and Takedown are real links (they work with a right-click or with JavaScript off)', () => {
  const foot = SHELL.match(/<footer>([\s\S]*?)<\/footer>/)[1];
  assert.match(foot, /<a href="\/about" onclick="go\('about'\);return false">About voidtv\.net<\/a>/);
  assert.match(foot, /<a href="\/privacy" onclick="go\('privacy'\);return false">Privacy<\/a>/);
  assert.match(foot, /<a href="\/takedown" onclick="go\('takedown'\);return false">Takedown and corrections<\/a>/);
});

test('About: says voidtv.net, never the old name, and links to both notices', () => {
  const { html, title } = render('aboutPage');
  assert.equal(html.match(OLD), null);
  assert.match(html, /<h1>About voidtv\.net<\/h1>/);
  assert.match(html, /voidtv\.net is a better way to find and watch/);
  assert.match(html, /voidtv\.net is a project of/);
  assert.match(html, /onclick="go\('privacy'\)"/);
  assert.match(html, /onclick="go\('takedown'\)"/);
  assert.equal(title, 'About · voidtv.net');
});

test('CASH page, support strip, person pages and the import error use the new name', () => {
  assert.equal(render('cashPage').html.match(OLD), null);
  assert.match(render('cashPage').html, /voidtv\.net is free, stays free/);
  assert.match(SCRIPT, /<b>voidtv\.net is free and stays free\.<\/b>/);
  assert.match(SCRIPT, /That file is not a voidtv\.net export\./);
  assert.match(SCRIPT, /<h2>On voidtv\.net<\/h2>/);
  assert.match(SCRIPT, /'Also on voidtv\.net in '/);
  assert.match(SCRIPT, /'No other voidtv\.net shows yet'/);
});

test('/privacy: the approved text, the address, and no placeholder left', () => {
  const { html, title } = render('privacyPage');
  const t = text(html);
  assert.match(html, /<h1>About voidtv\.net and your privacy<\/h1>/);
  for (const s of [
    'voidtv.net is a viewer for video that other people have uploaded to the Internet Archive (archive.org).',
    'We host no video.',
    'with no ads, no accounts and no fees.',
    'Very little, and nothing that names you.',
    'No account, no sign-up, no email.',
    'One cookie, only while the site is in testing',
    'It is no longer set when the site opens to the public, and copies already in browsers expire within 30 days.',
    'when a search is made (with the search words, up to 80 characters)',
    'plus your country, region, city, time zone and the data center that answered you, as reported by our hosting provider.',
    'It also carries your browser, operating system and device type, and the name of the site you came from, if any.',
    'Our own usage counts store no IP address. Nothing is sold or shared.',
    'Your Mine page (list, likes, watch history) is kept in your own browser, and we do not receive it as a list. We do count the actions, as anonymous usage counts like the rest: when you like or hide a show, add it to your list or play an episode. A file you report with "Wrong file?" is sent to us, with the show and episode. Ticking "Not the right film" on a movie likewise sends us the movie and its file.',
    'Errors and playback trouble are reported to an error service (Sentry) with the show, the episode and what the player measured',
    'Those reports carry no name and no account.',
    'The Sentry script (js.sentry-cdn.com) loads on every page view, so your browser contacts Sentry whenever you open the site.',
    'load from The Movie Database (TMDB)',
    'No advertising, no tracking across sites, no selling of data, no profiles.',
    'A separate site for children, voidtv.net kids, is being built with its own rules and no identifiers at all.',
  ]) assert.ok(t.includes(s), 'privacy text has: ' + s);
  assert.match(html, new RegExp('<a href="mailto:' + CONTACT + '">' + CONTACT + '</a>'));
  assert.ok(!/My Void|favourites|is removed when|hidden for you|We never see it|No IP address is stored/.test(t), 'the sentences the reviews found untrue are gone');
  assert.ok(!/Sentry[^.]*\bIP\b/.test(t), 'no claim about how Sentry handles IP addresses (the Sentry project setting is not confirmed)');
  assert.equal(html.match(/\[[^\]]*\]/), null, 'no square-bracket placeholder is left on /privacy');
  assert.equal(html.match(OLD), null);
  assert.equal(title, 'Privacy · voidtv.net');
});

test('/takedown: the approved text, the address, two business days, the Archive link, and no placeholder left', () => {
  const { html, title } = render('takedownPage');
  const t = text(html);
  assert.match(html, /<h1>Takedown and corrections<\/h1>/);
  for (const s of [
    'Every file playable on voidtv.net is hosted by the Internet Archive and was uploaded there by an Archive user.',
    'voidtv.net does not store, copy or re-host any of it.',
    'Two routes, and you may use both:',
    'The Archive handles removal of the files it hosts.',
    'it stops playing on voidtv.net; our link check tests a sample of files each night and retires the ones that no longer play, as it finds them.',
    'We remove the listing from voidtv.net within two business days whether or not the Archive has acted, and we tell you when it is done.',
    'Every episode page has a "Wrong file?" button.',
    'Press it and the file is flagged and queued for a person to look at, and the report shows on your Mine page.',
    'voidtv.net is a project of CASH, a 501(c)(3) nonprofit.',
  ]) assert.ok(t.includes(s), 'takedown text has: ' + s);
  assert.ok(!/hidden/.test(t), 'nothing promises that a reported file is hidden: no code in the page hides it');
  assert.ok(!/nightly check retires/.test(t), 'no promise that a removed file is retired the same night: the check samples');
  assert.equal((html.match(new RegExp('mailto:' + CONTACT, 'g')) || []).length, 2, 'the address is a link in the takedown route and in the wrong-file line');
  assert.ok(!/\[(two business days|takedown@|the same address|city, state|Postal)/i.test(html), 'Bryan\'s values replaced the other placeholders');
  assert.ok(!/Postal address|city, state/.test(html), 'the postal and city lines are gone');
  assert.equal(html.match(/\[[^\]]*\]/), null, 'no square-bracket placeholder is left on /takedown');
  // route 1 points at the Internet Archive's Terms of Use (copyright policy and how to request removal), in the site's external link style
  assert.match(html, /Their process is in <a href="https:\/\/archive\.org\/about\/terms\.php" target="_blank" rel="noopener">the Internet Archive's Terms of Use, which include its copyright policy and how to request removal<\/a>\. When a file is removed there/);
  assert.equal((html.match(/archive\.org\/about\//g) || []).length, 1, 'one link to the Archive, and it is the Terms of Use');
  assert.doesNotMatch(html, /dmca/i);
  assert.equal(html.match(OLD), null);
  assert.equal(title, 'Takedown and corrections · voidtv.net');
});

// A public privacy page must be true. These checks tie its sentences to the code, so a change to the code that makes a sentence untrue fails here
// (review of batch C: the draft named a "My Void" list, promised a hidden file, said the cookie is removed, and left fields out).
test('the privacy page tells only what the code does: cookie life, stored fields, no IP, Sentry on every page view, Mine, Wrong file?', () => {
  const mw = read('functions/_middleware.js'), e = read('functions/api/e.js');
  assert.match(mw, /Max-Age=2592000;/, '30 days is 2,592,000 seconds');
  for (const f of ['str(e.q, 80)', 'str(cf.country', 'str(cf.region', 'str(cf.city', 'str(cf.timezone', 'str(cf.colo', 'str(e.ref', '          os,', '          device,', '          browser,', 'sid,']) assert.ok(e.includes(f), 'e.js stores ' + f.trim());
  assert.doesNotMatch(e, /cf-connecting-ip|x-forwarded-for|x-real-ip/i, 'e.js never reads the IP address');
  assert.match(SCRIPT, /if\('[0-9a-f]+'\)\{const h=location\.hostname;if\(h==='voidtv\.net'\|\|h\.endsWith\('\.voidtv\.net'\)\)\{[^\n]*sc\.src='https:\/\/js\.sentry-cdn\.com\//, 'the Sentry script is added when the page loads, on voidtv.net hosts');
  assert.match(SCRIPT, /<h1>Mine<\/h1>/);
  assert.match(SCRIPT, /<h2>Reported files</, 'a reported file shows on the Mine page');
  assert.match(SCRIPT, /'Wrong file\?'/);
  assert.match(SCRIPT, /track\('report'/, 'a reported file is sent');
  // the "Not the right film" box on an unconfirmed TV movie: the privacy sentence says it sends the movie and its file, and this is what it sends
  assert.match(SCRIPT, /Not the right film<\/label>/, 'the box exists');
  assert.match(SCRIPT, /track\('report',\{slug:s\.slug,ep:se\.season\+'x'\+ep\.n,q:'wrongfilm',x:w\.x\}\)/, 'ticking it sends the movie (slug) and its file (item and file name), nothing else');
  assert.match(SCRIPT, /return \{id:m\[1\],x:it\+' '\+f\.slice\(0,199-it\.length\)\}/, 'x is the Archive item and the file name');
  assert.match(SCRIPT, /track\('search',\{q,n\}\)/, 'the search words are sent');
  // the Mine page stays in the browser, but its actions are counted: like, hide, list and every play
  assert.match(SCRIPT, /track\('act',\{slug,x:ME\.likes\[slug\]>0\?'like':ME\.likes\[slug\]<0\?'hide':'unlike'\}\)/);
  assert.match(SCRIPT, /track\('act',\{slug,x:ME\.list\[slug\]\?'list':'unlist'\}\)/);
  assert.match(SCRIPT, /track\('play',\{slug:c\.slug,ep:c\.epk,x:c\.file\}\)/);
  // the link check: a sample of files a night, retiring the ones the Archive no longer has
  const nightly = read('scripts/nightly.js'), lc = read('scripts/linkcheck.js');
  assert.match(nightly, /step\('linkcheck', \['scripts\/linkcheck\.js', '--sample', '150'\]/);
  assert.match(lc, /samples episode files across the catalog/);
  assert.match(lc, /retires the dead ones into/);
});

test('routes: /privacy and /takedown work as direct visits, with or without a trailing slash, and as #hash links', () => {
  const run = (pathname, hash, routes) => {
    const ctx = { location: { pathname, hash, search: '' }, ROUTES: routes };
    vm.createContext(ctx);
    vm.runInContext(fn('safeDecode') + '\n' + fn('slugFromUrl') + '\n' + fn('urlFor') + '\nthis.slug = slugFromUrl(); this.p = urlFor("privacy"); this.t = urlFor("takedown");', ctx);
    return { slug: ctx.slug, p: ctx.p, t: ctx.t };
  };
  for (const [p, want] of [['/privacy', 'privacy'], ['/privacy/', 'privacy'], ['/takedown', 'takedown'], ['/takedown/', 'takedown'], ['/about', 'about'], ['/cash', 'cash']]) assert.equal(run(p, '', 'path').slug, want, p);
  assert.deepEqual([run('/', '', 'path').p, run('/', '', 'path').t], ['/privacy', '/takedown']);
  assert.equal(run('/', '#privacy', 'hash').slug, 'privacy');
  assert.deepEqual([run('/', '', 'hash').p, run('/', '', 'hash').t], ['#privacy', '#takedown']);
  // go() and render() know both views, the same way they know about and cash
  assert.match(SCRIPT, /if\(slug==='privacy'\)\{state\.show=null;state\.view='privacy';history\[replace\?'replaceState':'pushState'\]\(null,'',urlFor\('privacy'\)\);document\.title='Privacy · '\+SITE;render\(\);/);
  assert.match(SCRIPT, /if\(slug==='takedown'\)\{state\.show=null;state\.view='takedown';history\[replace\?'replaceState':'pushState'\]\(null,'',urlFor\('takedown'\)\);document\.title='Takedown and corrections · '\+SITE;render\(\);/);
  assert.match(SCRIPT, /else if\(state\.view==='privacy'\)keepTracks\(privacyPage\);else if\(state\.view==='takedown'\)keepTracks\(takedownPage\)/);
});

test('a direct visit to /privacy or /takedown is served like /about: Pages answers an unknown path with index.html, and the site writes no 404.html or redirect rule that would change that', () => {
  const site = read('scripts/site.js');
  assert.match(site, /Pages serves index\.html for unknown paths on its/);
  assert.doesNotMatch(site, /writeFileSync\([^)]*404\.html/);
  assert.match(site, /fs\.writeFileSync\(path\.join\(OUT, '_redirects'\), '# No rules on purpose/);
});

// A real tiny build (the same throwaway-copy method as tests/site-build.test.js): the files a visitor or a phone reads outside the page script.
test('a built site: manifest, share cards, show pages and the password page say voidtv.net and nothing carries the old name', () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-test-'));
  try {
    const root = path.join(TMP, 'tree');
    const put = (rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
    for (const f of ['scripts/site.js', 'scripts/lib/app.js', 'scripts/lib/app-fetch.js', 'scripts/lib/app-me.js', 'scripts/lib/profile.js', 'scripts/lib/siteguards.js', 'player/tools/rank-sources.js', 'player/src/core.js', 'player/src/icons.js', 'player/src/player.js', 'player/src/player.css', 'profiles/voidtv/profile.json']) put(f, fs.readFileSync(path.join(REPO, f)));
    fs.cpSync(path.join(REPO, 'functions'), path.join(root, 'functions'), { recursive: true });
    put('assets/brand/icon-512-maskable.png', fs.readFileSync(path.join(REPO, 'assets', 'brand', 'icon-512-maskable.png'))); // the real file must exist in the repo; the build copies the brand folder
    put('scripts/show-list.json', JSON.stringify({ types: ['Drama'], shows: [] }));
    for (let i = 0; i < 100; i++) put(`catalog/shows/test-show-${i}.json`, JSON.stringify({
      show: `Test Show ${i}`, slug: `test-show-${i}`, type: 'Drama', network: 'TestNet', matchedAt: '2026-01-01T00:00:00.000Z', tvmaze: { id: i, runtime: 30, premiered: '2000-01-01' },
      seasons: [{ season: 1, episodes: [1, 2, 3].map((k) => ({ number: k, name: `Episode ${k}`, airdate: '2000-01-01', state: 'LIVE', alternates: [],
        file: { name: `e${k}`, file: `e${k}.mp4`, item: `item-${i}`, url: `https://archive.org/download/item-${i}/e${k}.mp4`, format: 'h.264', playable: true, seconds: 1800, sizeMB: 90, conf: 0.9 } })) }],
    }));
    const env = { ...process.env, CF_PAGES_COMMIT_SHA: 'f'.repeat(40) };
    for (const k of ['SITE_PASSWORD', 'GATE', 'SITE_ALLOW_SHRINK', 'CF_PAGES', 'VOID_PROFILE']) delete env[k];
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'site.js'), '--base', 'https://voidtv.net'], { cwd: TMP, encoding: 'utf8', env });
    assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
    const out = (rel) => fs.readFileSync(path.join(root, 'site', rel), 'utf8');
    const m = JSON.parse(out('manifest.webmanifest'));
    assert.equal(m.name, 'voidtv.net');
    assert.equal(m.short_name, 'voidtv.net');
    // icons: the full-bleed 512 is plain 'any'; the padded one is the only 'maskable' entry, and the file is really shipped
    const i512 = m.icons.filter((x) => /icon-512/.test(x.src));
    assert.equal(i512.length, 2);
    assert.equal(i512.find((x) => /icon-512.png/.test(x.src)).purpose, 'any');
    assert.equal(i512.find((x) => /icon-512-maskable.png/.test(x.src)).purpose, 'maskable');
    assert.ok(fs.existsSync(path.join(root, 'site', 'assets', 'brand', 'icon-512-maskable.png')), 'the maskable icon is in the build');
    assert.match(out('index.html'), /<title>voidtv\.net<\/title>/);
    const show = out('show/test-show-7/index.html');
    assert.match(show, /<title>Test Show 7 · voidtv\.net<\/title>/);
    assert.match(show, /<meta property="og:site_name" content="voidtv\.net">/);
    assert.match(show, / · voidtv\.net">/, 'the share description ends with the site name');
    assert.match(out('functions/_middleware.js'), /<title>voidtv\.net<\/title>/);
    // the page script of the built index carries the new routes and the address
    assert.match(out('index.html'), /function privacyPage\(\)/);
    assert.match(out('index.html'), /function takedownPage\(\)/);
    assert.ok(out('index.html').includes(CONTACT));
    // no text file in the output spells the old name
    const bad = [];
    const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(html|json|js|css|txt|webmanifest|svg)$/.test(f)) { const s = strip(fs.readFileSync(p, 'utf8')); const mm = s.match(OLD); if (mm) bad.push(path.relative(root, p) + ': ' + s.slice(Math.max(0, mm.index - 40), mm.index + 40)); } } };
    walk(path.join(root, 'site'));
    assert.deepEqual(bad.slice(0, 5), [], 'old spelling in the built site');
  } finally { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});
