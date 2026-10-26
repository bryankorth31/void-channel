// B's decisions, held by tests (audit 25 Oct 2026, phase 2; the list is docs/DECISIONS.md). Run: node --test tests/decisions.test.js
// Each test name starts with the decision's id in docs/DECISIONS.md. Most decisions already have their own test file; this file holds the
// ones that had none. A test marked todo is a known drift: it fails today and is reported as todo without failing the suite. The fix that
// makes it pass takes the todo flag off in the same commit, and docs/DECISIONS.md moves that row from DRIFTED to HOLDS.
// Pure reads: the built shell comes from scripts/lib/app.js page() with an empty catalog (as tests/brand.test.js does); nothing is built,
// fetched or played. The one git call (P2) is skipped when git is not there.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const APP = require('../scripts/lib/app');
const SHELL = APP.page({ data: { shows: [], people: {}, links: {}, types: [] }, mode: 'split', routes: 'path', base: '/', meta: { url: 'https://voidtv.net/' } });
const SCRIPT = SHELL.slice(SHELL.lastIndexOf('<script>') + 8, SHELL.lastIndexOf('</script>'));
const SITE = read('scripts/site.js');
const EM = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']'); // built from char codes so this file never holds the characters

// One client function of the built page script, from its first line to the next top-level statement (the same cut as tests/brand.test.js).
function fn(name) {
  const lines = SCRIPT.split('\n');
  const i = lines.findIndex((l) => l.startsWith('function ' + name + '(') || l.startsWith('async function ' + name + '('));
  assert.ok(i >= 0, name + ' is in the built page script');
  let j = i + 1;
  while (j < lines.length && !/^(function |async function |let |const |var |\/\/|document\.|window\.|go\()/.test(lines[j])) j++;
  return lines.slice(i, j).join('\n');
}

test('P14: every decision id this file tests is a row in docs/DECISIONS.md', () => {
  const doc = read('docs/DECISIONS.md');
  const ids = [...read('tests/decisions.test.js').matchAll(/^test(?:\.todo)?\('([A-Z]\d+)[:,]/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 20, 'the ids were found');
  for (const id of new Set(ids)) assert.match(doc, new RegExp('\\| ' + id + ' \\|'), id + ' has a row');
});

test('P1: no em or en dash in docs/DECISIONS.md or in this test file', () => {
  for (const f of ['docs/DECISIONS.md', 'tests/decisions.test.js']) assert.doesNotMatch(read(f), EM, f);
});

test.todo('P1, B8: the built page carries no em or en dash (drift: the X-Ray path prints a dash on each side of a person)', () => {
  assert.doesNotMatch(SHELL, EM);
});

test('P2: no commit since the rule (18 Oct 2026, 10:00) carries a Co-Authored-By line', (t) => {
  const r = spawnSync('git', ['log', '--since=2026-10-18T10:00:00-04:00', '-i', '--grep=Co-Authored-By', '--format=%h %s'], { cwd: REPO, encoding: 'utf8' });
  if (r.error || r.status !== 0) return t.skip('git is not available here');
  assert.equal(r.stdout.trim(), '', 'commits with the line:\n' + r.stdout);
});

test('B3: the page and the build name none of the old V/T set files or the old master mark', () => {
  for (const [name, s] of [['scripts/lib/app.js', read('scripts/lib/app.js')], ['scripts/site.js', SITE]]) {
    assert.doesNotMatch(s, /set\.mp4|set-static\.jpg|set-poster\.jpg|mark-master\.png/, name);
  }
});

test('B4: the header wordmark is set in Unbounded, not voidtv.org\'s type', () => {
  assert.match(SHELL, /header \.logo \.name\{[^}]*font-family:Unbounded/);
});

test('B5: the copy never calls the library "classic shows"', () => {
  assert.doesNotMatch(SHELL, /classic shows/i);
  assert.doesNotMatch(SITE, /classic shows/i);
});

test.todo('B6: no "1990 to now" and no "every episode in order" in the page, share text or manifest (drift: meta, About and manifest still say both)', () => {
  for (const [name, s] of [['page', SHELL], ['scripts/site.js', SITE]]) {
    assert.doesNotMatch(s, /1990 (to|till|through) now/i, name);
    assert.doesNotMatch(s, /every episode in order/i, name);
  }
});

test.todo('B2: the Live TV swirl wordmark is "voidtv" pink and ".net" blue, like the header (drift: it is split void / tv.net)', () => {
  assert.match(SCRIPT, /class="wm"[^>]*><span class="v">voidtv<\/span><span class="n">\.net<\/span>/);
});

test('B9: motion honours reduced motion: the swirl, the holding cards and the grain stop', () => {
  const rm = [...SHELL.matchAll(/prefers-reduced-motion:reduce\)\{([^@]*)/g)].map((m) => m[1]).join(' ');
  assert.match(rm, /\.swirl/, 'the Live TV swirl');
  assert.match(rm, /\.tvc-card/, 'the holding cards');
  assert.match(rm, /\.grain/, 'the grain');
});

test('B10: the Live TV screen is the swirl picture with the wordmark and Turn on inside it, and no video', () => {
  const i = SCRIPT.indexOf('class="swirl"');
  assert.ok(i > 0, 'the swirl block is in the page');
  const block = SCRIPT.slice(i, SCRIPT.indexOf('</button></div>', i));
  assert.match(block, /assets\/brand\/screen\/swirl-gy/);
  assert.match(block, /class="wm"/);
  assert.match(block, /Turn on/);
  assert.doesNotMatch(block, /<video/);
});

test('C1: nothing in the page asks for a price: no subscription, premium, perks or tax-deduction promise', () => {
  assert.doesNotMatch(SHELL, /subscription|subscribe|premium|\bperks?\b|tax[- ]deduct/i);
});

test('C2: the ask says donation, never "gift" or "spare change"', () => {
  assert.doesNotMatch(SHELL, /\bgifts?\b|spare change/i);
});

test('C3: the full church name appears only on the CASH, About, privacy and takedown pages; short text says CASH', () => {
  let rest = SCRIPT;
  for (const f of ['cashPage', 'aboutPage', 'privacyPage', 'takedownPage']) rest = rest.replace(fn(f), '');
  const outsideScript = SHELL.slice(0, SHELL.lastIndexOf('<script>'));
  assert.doesNotMatch(rest, /Church of American Strength/i, 'page script outside the four pages');
  assert.doesNotMatch(outsideScript, /Church of American Strength/i, 'header, footer, meta and styles');
  assert.match(SHELL, /CASH/);
});

test('C5: every donation link is one of the two settings, DONATE_URL and DONATE_MONTHLY_URL', () => {
  const src = read('scripts/lib/app.js');
  const one = /const DONATE_URL = '([^']+)'/.exec(src)[1], monthly = /const DONATE_MONTHLY_URL = '([^']+)'/.exec(src)[1];
  assert.notEqual(one, monthly);
  const links = new Set(SHELL.match(/https:\/\/square\.link\/[A-Za-z0-9/_-]+/g) || []);
  assert.ok(links.size >= 1, 'the page carries the links');
  for (const l of links) assert.ok(l === one || l === monthly, 'a donation link outside the setting: ' + l);
  assert.equal((src.match(/square\.link\//g) || []).length, 2, 'app.js names each link once, in its setting');
});

test('C7: the retired June pledge of a third of donations to the Archive is nowhere in the copy', () => {
  assert.doesNotMatch(SHELL, /one[- ]third|a third of (the )?donations|third of every/i);
});

test('C8: no ad space and no Sponsored slots on the site', () => {
  assert.doesNotMatch(SHELL, /sponsored|advertise with/i);
});

test('V1: no accounts: the page offers no sign-up, log-in or account, and says so', () => {
  assert.doesNotMatch(SHELL, /\b(Sign up|Sign in|Log in|Create (an )?account|My account)\b/, 'no account button or link');
  assert.doesNotMatch(SHELL, /type="password"|['"]\/(login|signup|account)['"]/i, 'no password box or account route on the site page');
  assert.match(SHELL, /No account, no sign-up/, 'the page tells visitors there is none');
});

test('V4: ?nocount=1 stops usage events: track() returns before it queues anything', () => {
  assert.match(fn('track'), /^function track\(t,d\)\{sentryNote\(t,d\|\|\{\}\);if\(typeof NOCOUNT!=='undefined'&&NOCOUNT\)return;/);
  assert.match(SCRIPT, /nocount/);
});

test('A4: Adult Swim stays outside the 18+ door', () => {
  const list = require('../scripts/show-list.json');
  const shows = (Array.isArray(list) ? list : list.shows).filter((s) => s.type === 'Adult Swim');
  assert.ok(shows.length > 50, 'the Adult Swim shelf is there');
  const ov = require('../catalog/overrides.json');
  const slug = (n) => n.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const s of shows) {
    assert.ok(!(s.tags || []).includes('Late Night'), s.name + ' is not tagged Late Night');
    assert.ok(!(ov[slug(s.name)] && ov[slug(s.name)].adult), s.name + ' is not gated 18+');
  }
});

test('A5: list A is gated 18+ (the four named shows), and The Jerry Springer Show stays open', () => {
  const ov = require('../catalog/overrides.json');
  for (const s of ['playboy-after-dark', 'the-dark-side-of-porn', 'eurotrash', 'american-playboy-the-hugh-hefner-story']) assert.equal(ov[s] && ov[s].adult, true, s);
  for (const [s, v] of Object.entries(ov)) if (/springer/.test(s)) assert.ok(!v.adult, s);
});

test.todo('A3: Late Night and 18+ titles never reach the featured wall, even with the door open (drift: only the closed door filters them)', () => {
  assert.match(fn('heroPool'), /!isAdult\(t\)/);
});

test.todo('M16: Ancient Aliens and programs like it are not counted as History (drift: still tagged History)', () => {
  const list = require('../scripts/show-list.json');
  const aa = (Array.isArray(list) ? list : list.shows).filter((s) => /^Ancient Aliens/.test(s.name));
  assert.ok(aa.length >= 1);
  for (const s of aa) assert.ok(!(s.tags || []).some((t) => /History|Discovery|Science/.test(t)), s.name + ': ' + (s.tags || []).join(', '));
});

test.todo('M17: viewers see no "review" label on episodes (drift: REVIEW episodes still show the chip)', () => {
  assert.doesNotMatch(SCRIPT, /<span class="rv">review<\/span>/);
});

test('M18: the Heard by listening tab has its HQ steps in docs/HQ.md and docs/RUNBOOK.md', () => {
  assert.match(read('docs/HQ.md'), /Heard by listening/);
  assert.match(read('docs/RUNBOOK.md'), /Heard by listening/);
});

test('P11: every doctor light has a row in docs/RUNBOOK.md, so B can act on it by hand', () => {
  const doctor = read('scripts/doctor.js'), book = read('docs/RUNBOOK.md');
  const ids = new Set([...doctor.matchAll(/add\('([a-z][a-z:-]*)'/g)].map((m) => m[1]));
  const missing = [...ids].filter((id) => !book.includes('| ' + id + (id.endsWith(':') ? '' : ' |'))); // an id ending in a colon is a family (task:), one row for all of them
  assert.deepEqual(missing, []);
});

test('H4: the home rows put Black Programming high and game, talk and variety after the sitcoms, animation and the absurd', () => {
  const order = require('../catalog/home-order.json').map((r) => r[1]);
  const at = (n) => { const i = order.indexOf(n); assert.ok(i >= 0, n + ' is a home row'); return i; };
  assert.ok(at('Black Programming') < 5, 'Black Programming in the first rows');
  for (const late of ['Game Shows', 'Variety & Talk', 'Reality & Talk']) {
    for (const early of ['90s Sitcoms', 'Animated', 'Awkward & Absurd']) assert.ok(at(late) > at(early), late + ' after ' + early);
  }
});

test('H6: the service worker caches nothing and answers only page loads (A25-008, Voidtv chat wording)', () => {
  const m = /writeFileSync\(path\.join\(OUT, 'sw\.js'\), "([^\n]*)"\);/.exec(SITE);
  assert.ok(m, 'the build writes sw.js');
  assert.doesNotMatch(m[1], /caches\./, 'no Cache Storage');
  assert.match(m[1], /if\(e\.request\.mode!=='navigate'\)return;/, 'anything but a navigation goes straight to the network');
});

test('M24: rights metadata never gates a show: the gates read no license or rights field', () => {
  for (const f of ['scripts/match.js', 'scripts/lib/moviejudge.js', 'scripts/lib/hardexclude.js']) {
    assert.doesNotMatch(read(f), /licenseurl|\.rights\b|\.license\b|copyright/i, f);
  }
});

test('G6: the June servers are retired (B, 26 Oct), and every server left in scripts/ listens on this PC only', () => {
  for (const f of ['backend/server.js', 'spine/spine.js', 'start-void.cmd', 'start-prod.js']) assert.ok(!fs.existsSync(path.join(REPO, f)), f + ' is gone');
  const walk = (d) => fs.readdirSync(d).flatMap((f) => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : /\.js$/.test(f) ? [p] : []; });
  for (const p of walk(path.join(REPO, 'scripts'))) {
    const s = fs.readFileSync(p, 'utf8');
    for (const m of s.matchAll(/\.listen\(([^)]*)\)/g)) assert.match(m[1], /127\.0\.0\.1|HOST\b|'localhost'/, path.relative(REPO, p) + ': ' + m[0]);
  }
});
