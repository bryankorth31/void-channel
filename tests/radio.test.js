// Old-time radio on Live TV (PLAN-ia-treatments T5; Bryan, 24 Nov 2026: "Go"): the radio catalog, the radio channels, their
// schedule over a week, and the radio screen (look B). Run: node --test tests/radio.test.js
// The schedule runs on the real catalog/radio files in a fixed zone (UTC minus 6 hours) so the answers do not depend on the machine.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../scripts/lib/radio');
const IMP = require('../scripts/radio-import');
const T = require('../scripts/lib/tvgrid');
const { channelLists } = require('../scripts/lib/app');

const DIR = path.join(__dirname, '..', 'catalog', 'radio');
const H = 3600e3;
const at = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h + 6, mi || 0); // a wall-clock moment at UTC minus 6
const MON = [2026, 11, 30]; // 30 Nov 2026 is a Monday

test('import: the air date and the episode name come out of every way the uploads name their files', () => {
  const cases = [
    ['Dragnet 52-09-14 169 The Big Bull', 'The Big Bull', '1952-09-14'],
    ['Suspense 420617 001 The Burning Court', 'The Burning Court', '1942-06-17'],
    ['Gunsmoke 52-04-26 (001) Billy the Kid', 'Billy the Kid', '1952-04-26'],
    ['1953-09-20 Ep 01 Jenny', 'Jenny', '1953-09-20'],
    ['Escape 47-07-07 -001- The Man Who Would Be King -Raymond Lawrence-', 'The Man Who Would Be King', '1947-07-07'],
    ['1932-05-02 - 001) First Show', 'First Show', '1932-05-02'],
    ['XMinusOne55-04-24001NoContact', 'No Contact', '1955-04-24'],
    ['BostonBlackieXx-xx-xxxxxWhoKilledJohnDavis', 'Who Killed John Davis', ''],
    ['Richard Diamond 53-09-20 (157) The Wolfe Murder Case (AFRTS)', 'The Wolfe Murder Case', '1953-09-20'],
    ['1950-06-07 0013-30m37s-2000Plus-TheOtherMan', 'The Other Man', '1950-06-07'],
    ['CALV 410331 220 Edwin Booth Repeat Broadcast of 37-09-29', 'Edwin Booth Repeat Broadcast of 37-09-29', '1941-03-31'],
    ['There Was Room for a Stranger', 'There Was Room for a Stranger', ''],
  ];
  for (const [title, name, aired] of cases) {
    const d = IMP.findDate(title);
    assert.equal(IMP.tidyName(title, d), name, title);
    assert.equal(IMP.airedOf(d).aired, aired, title);
  }
});

// A radio catalog in a throwaway folder: one channel on, one off.
function tmpCatalog() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radio-test-'));
  const show = (slug, ch, eps) => fs.writeFileSync(path.join(dir, slug + '.json'), JSON.stringify({
    show: slug, slug, channel: ch, years: '1952-1961', item: 'OTRR_Test_Singles', credit: 'Old Time Radio Researchers', licence: 'http://creativecommons.org/licenses/by-nc-sa/3.0/us/',
    episodes: eps,
  }));
  show('radio-a', 'radio-on', [
    { n: 1, name: 'One', aired: '1952-04-26', file: 'Have Gun—Will Travel 1958-11-23 (001) Strange Vendetta.mp3', sec: 1772 },
    { n: 2, name: 'Two', aired: '', file: 'b.mp3', sec: 1500 },
    { n: 3, name: 'No length', aired: '', file: 'c.mp3', sec: 0 },
  ]);
  show('radio-b', 'radio-off', [{ n: 1, name: 'One', aired: '', file: 'a.mp3', sec: 1800 }]);
  fs.writeFileSync(path.join(dir, 'channels.json'), JSON.stringify({ channels: [
    { id: 'radio-on', name: 'Radio On', on: true, shows: ['radio-a', 'radio-missing'] },
    { id: 'radio-off', name: 'Radio Off', on: false, shows: ['radio-b'] },
  ] }));
  return dir;
}

test('readRadio: only channels that are on, shows shaped like the catalog, files played unchanged from archive.org', () => {
  const dir = tmpCatalog();
  try {
    const r = R.readRadio(dir);
    assert.deepEqual(r.channels, [{ id: 'radio-on', name: 'Radio On', shows: ['radio-a'] }], 'the off channel and the missing show leave no trace');
    assert.equal(r.shows.length, 1);
    const s = r.shows[0];
    assert.equal(s.type, 'Radio'); assert.equal(s.network, 'Radio On'); assert.equal(s.year, '1952');
    assert.deepEqual(s.radio, { channel: 'radio-on', credit: 'Old Time Radio Researchers', licence: 'http://creativecommons.org/licenses/by-nc-sa/3.0/us/', years: '1952-1961' });
    const eps = s.seasons[0].episodes;
    assert.equal(eps.length, 2, 'an episode with no length is left out');
    assert.equal(eps[0].url, 'https://archive.org/download/OTRR_Test_Singles/Have%20Gun%E2%80%94Will%20Travel%201958-11-23%20(001)%20Strange%20Vendetta.mp3');
    assert.equal(eps[0].p, 'Have Gun—Will Travel 1958-11-23 (001) Strange Vendetta.mp3', 'the file name exactly as the Archive has it');
    assert.equal(eps[0].ad, '1952-04-26'); assert.equal(eps[1].ad, undefined);
    assert.equal(eps[0].sec, 1772); assert.equal(eps[0].min, 30);
    assert.ok(!Object.keys(eps[0]).includes('sec'), 'the seconds are for the schedule only, never in the files the browser loads');
    assert.equal(s.eps, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.deepEqual(R.readRadio(path.join(os.tmpdir(), 'no-such-radio-folder')), { channels: [], shows: [] });
});

const REAL = R.readRadio(DIR);

test('the radio catalog: kids radio stays off; every episode runs 20 to 31.5 minutes; the OTRR shows carry their credit', () => {
  const CH = JSON.parse(fs.readFileSync(path.join(DIR, 'channels.json'), 'utf8'));
  const kids = CH.channels.find((c) => c.id === 'radio-kids');
  assert.ok(kids, 'the kids channel is in the file, ready for Bryan to switch on');
  assert.equal(kids.on, false, 'kids radio is off until Bryan has heard it');
  assert.ok(!REAL.channels.some((c) => c.id === 'radio-kids'));
  assert.deepEqual(REAL.channels.map((c) => [c.id, c.name]), [['radio', 'Void Radio']], 'one radio channel (Bryan, 24 Nov 2026: "One channel")');
  assert.equal(REAL.channels[0].shows.length, 30, 'every series of every kind but kids');
  for (const s of REAL.shows) {
    for (const e of s.seasons[0].episodes) assert.ok(e.sec >= 1200 && e.sec <= 1890, s.slug + ' ' + e.n + ': ' + e.sec + ' s');
    assert.equal(typeof s.radio.credit, 'string', s.slug);
  }
  for (const slug of ['radio-dragnet', 'radio-gunsmoke', 'radio-suspense']) {
    const s = REAL.shows.find((x) => x.slug === slug);
    assert.ok(s, slug); assert.equal(s.radio.credit, 'Old Time Radio Researchers', slug + ': uploaded by the group, credited by name');
  }
});

// A few TV shows for channelLists, as app.js assembles them.
const tvShow = (i, over) => Object.assign({ show: 'TV ' + i, slug: 'tv-' + i, type: 'Drama', network: 'TestNet', tags: [], genres: [], eps: 20, seasons: [{ season: 1, episodes: Array.from({ length: 20 }, (_, k) => ({ n: k + 1, min: 22 })) }] }, over);

test('channelLists: radio shows play on their radio channels only, which come after every TV channel, and no TV channel moves', () => {
  const tv = Array.from({ length: 6 }, (_, i) => tvShow(i));
  const without = channelLists(tv, ['Drama'], new Set(), new Set(), new Set());
  const all = tv.concat(REAL.shows);
  const withRadio = channelLists(all, ['Drama'], new Set(), new Set(), new Set(), REAL.channels);
  const ids = (x) => x.lists.map((L) => L.id);
  assert.deepEqual(ids(withRadio).slice(0, ids(without).length), ids(without), 'every TV channel keeps its place');
  assert.deepEqual(ids(withRadio).slice(ids(without).length), REAL.channels.map((c) => c.id));
  for (const L of withRadio.lists) {
    const radio = L.list.filter((s) => s.radio).length;
    if (L.kind === 'radio') assert.equal(radio, L.list.length, L.id + ' holds radio shows only');
    else assert.equal(radio, 0, L.id + ' holds no radio show');
  }
  assert.equal(withRadio.idx.get(REAL.shows[0].slug), tv.length, 'places are counted in the full list the page indexes');
});

// The radio channels planned the way buildTv plans them, laid out for the page (adopt), in a fixed zone.
function radioTv(extraSpecial) {
  const tv = Array.from({ length: 3 }, (_, i) => tvShow(i));
  const shows = tv.concat(REAL.shows);
  if (extraSpecial) shows.push({ show: 'A Special', slug: 'movie-1', type: 'Specials', tags: [], genres: [], eps: 1, seasons: [{ season: 1, episodes: [{ n: 1, min: 8 }] }] });
  const { lists, idx } = channelLists(shows, ['Drama'], new Set(), new Set(), new Set(), REAL.channels);
  const lib = T.buildLib(shows);
  const used = new Set();
  const sp = extraSpecial ? [[shows.length - 1, '']] : [];
  for (const e of sp) used.add(e[0]);
  const channels = lists.map((L) => {
    const recs = L.list.map((s) => { const i = idx.get(s.slug); used.add(i); return Object.assign({ i, sl: s.slug }, lib.infos[i]); });
    const c = T.planChannel({ id: L.id, name: L.name, kind: L.kind }, recs, lib.rt);
    if (L.kind === 'radio') c.ns = 1;
    return c;
  });
  const plan = Object.assign({ v: 2 }, T.trimLib(lib, used), { sp, channels });
  const G = T.tvgridFactory(); G.setOff(() => -6 * H);
  const A = G.adopt(plan, shows.map((s) => s.slug));
  return { G, A, shows };
}

test('schedule: a week on every radio channel sits on the 30-minute grid, never runs past its time, repeats no episode, and its breaks go to the cards', () => {
  const { G, A } = radioTv(false);
  const radio = A.channels.filter((c) => c.kind === 'radio');
  assert.equal(radio.length, REAL.channels.length);
  const from = at(...MON, 6, 0), to = from + 7 * 24 * H;
  for (const ch of radio) {
    const air = G.airingsBetween(ch, A, from, to);
    assert.ok(air.length > 300, ch.id + ': ' + air.length + ' airings in a week');
    const seen = new Set();
    let short = 0;
    for (let u = 0; u < air.length; u++) {
      const a = air[u];
      assert.equal(new Date(a.g0).getUTCMinutes() % 30, 0, ch.id + ': every block starts on the hour or the half hour');
      assert.ok(a.st + a.du * 60000 <= a.en, ch.id + ': no episode runs past its airing');
      if (u + 1 < air.length) assert.equal(a.en, air[u + 1].st, ch.id + ': airings run back to back');
      const key = a.s + ':' + a.se + 'x' + a.n;
      assert.ok(!seen.has(key), ch.id + ': episode ' + key + ' plays twice in a week');
      seen.add(key);
      const br = G.breakOf(ch, A, a);
      if (br) { short++; assert.equal(br.fill.length, 0, ch.id + ': a radio break holds no filler, only the cards'); }
    }
    assert.ok(short > 0, ch.id + ': short episodes leave breaks for the cards');
  }
});

test('schedule: a TV special that fills a TV channel\'s gap never breaks into a radio channel', () => {
  const { G, A, shows } = radioTv(true);
  const sp = shows.length - 1;
  const from = at(...MON, 6, 0), to = from + 7 * 24 * H;
  for (const ch of A.channels.filter((c) => c.kind === 'radio')) {
    for (const a of G.airingsBetween(ch, A, from, to)) {
      assert.notEqual(a.s, sp, ch.id + ': the special is not scheduled');
      const br = G.breakOf(ch, A, a);
      if (br) assert.ok(!br.fill.some((x) => x.s === sp), ch.id + ': nor in a break');
    }
  }
});

test('the radio screen: show, episode, air date, channel, what is next and the credit, all escaped', () => {
  const P = R.radioPage();
  const h = P.html({ show: 'Suspense', ep: 'The Hitch-Hiker <1>', aired: '1942-09-02', channel: 'Void Radio Suspense', next: 'Escape', at: '12:30 PM', credit: 'Old Time Radio Researchers' });
  assert.match(h, /<use href="#rsRadio"\/>/, 'the old radio');
  assert.match(h, />Radio show</);
  assert.match(h, /<div class="rs-show">Suspense<\/div>/);
  assert.match(h, /The Hitch-Hiker &lt;1&gt;/);
  assert.match(h, /Aired <b>2 Sep 1942<\/b> &middot; Void Radio Suspense/);
  assert.match(h, /Up next<\/span> <b>Escape<\/b> <span>at 12:30 PM/);
  assert.match(h, /Recording from the Old Time Radio Researchers on the Internet Archive/);
  assert.equal(P.aired('1950-12'), 'Dec 1950'); assert.equal(P.aired('1949'), '1949'); assert.equal(P.aired(''), '');
  const bare = P.html({ show: 'X', channel: '' });
  assert.ok(!/rs-meta|rs-next|rs-ep/.test(bare), 'nothing empty is drawn');
  assert.match(bare, /Recording from the Internet Archive</, 'a recording with no named uploader still says where it comes from');
  assert.match(P.tile('Gunsmoke'), /class="p rs-tile".*<em>Gunsmoke<\/em>/);
});

test('the page code: no backticks, no backslashes and no line comment after code (scripts/site.js refuses a page script with those)', () => {
  assert.ok(!R.pageSource.includes('`'));
  assert.ok(!R.pageSource.includes('\\'));
  for (const line of R.pageSource.split('\n')) assert.ok(!/\S.*\/\/ /.test(line.replace(/'[^']*'/g, "''")), line);
  assert.ok(!R.CSS.includes('`') && !R.CSS.includes('\\'));
});

// A small stand-in for the player's root element: enough DOM for the radio screen to place, update and remove itself.
function fakeRoot() {
  const kids = [];
  const mk = (cls) => ({ className: cls, attrs: {}, innerHTML: '', parent: null, setAttribute(k, v) { this.attrs[k] = v; }, remove() { const i = kids.indexOf(this); if (i >= 0) kids.splice(i, 1); } });
  const root = {
    kids,
    querySelector(sel) { const c = sel.replace(/^\./, ''); return kids.find((k) => k.className.split(' ').includes(c)) || null; },
    appendChild(el) { kids.push(el); return el; },
    insertBefore(el, ref) { const i = kids.indexOf(ref); kids.splice(i < 0 ? kids.length : i, 0, el); return el; },
  };
  return { root, mk };
}

test('the radio screen in the player: under the channel name and the controls, updated in place, gone when anything else plays', () => {
  const { root, mk } = fakeRoot();
  root.appendChild(mk('vpx-video')); root.appendChild(mk('vpx-chname')); root.appendChild(mk('vpx-card'));
  const body = { html: '', insertAdjacentHTML(_, h) { this.html += h; } };
  const doc = { body, getElementById: (id) => (id === 'rsDefs' && body.html.includes('id="rsDefs"') ? {} : null), createElement: () => mk('') };
  const P = (0, eval)('(function (document) { var window; return ' + R.radioPage.toString() + '; })')(doc)();
  const d = { show: 'Gunsmoke', ep: 'Billy the Kid', aired: '1952-04-26', channel: 'Void Radio', next: 'Suspense', at: '1:30 PM', credit: 'Old Time Radio Researchers' };
  const el = P.screen(root, d);
  assert.deepEqual(root.kids.map((k) => k.className), ['vpx-video', 'rs rs-b', 'vpx-chname', 'vpx-card'], 'over the picture, under the channel name and the player card');
  assert.equal(el.attrs.role, 'status');
  assert.match(el.innerHTML, /Gunsmoke/);
  assert.equal((body.html.match(/id="rsDefs"/g) || []).length, 1, 'the radio drawing is added to the page once');
  P.screen(root, Object.assign({}, d, { ep: 'Skid Row' }));
  assert.equal(root.kids.filter((k) => k.className === 'rs rs-b').length, 1, 'the next episode updates the same screen');
  assert.match(root.kids[1].innerHTML, /Skid Row/);
  P.off(root);
  assert.deepEqual(root.kids.map((k) => k.className), ['vpx-video', 'vpx-chname', 'vpx-card']);
});

test('the page calls the radio screen where Live TV plays, where the cards take over, and On Demand; the old order of the page is kept', () => {
  const APP = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'app.js'), 'utf8');
  assert.match(APP, /autoplay:!!state\.tvOn\}\);radioScreen\(VP,s,ep,c,a\)\}/, 'tvPlay: every file Live TV plays sets or clears the screen');
  assert.match(APP, /if\(VP\.idle\)VP\.idle\(\);radioScreen\(VP,null\);/, 'tvCards: the holding cards clear it');
  assert.match(APP, /autoplay:true\}\)\);radioScreen\(p,s,ep\);/, 'loadEp: On Demand sets or clears it');
  assert.ok(APP.indexOf('${RADIO.pageSource}') < APP.indexOf('const TVG=${TVGRID_SRC};'), 'the radio code sits before the Live TV code the guide tests read');
  assert.match(APP, /const R=typeof VoidRadio!=='undefined'\?VoidRadio:null/, 'a page without the radio code still plays');
  assert.match(APP, /filter\(s=>!gated\(s\)&&!s\.radio&&/, 'browse and search leave radio shows out');
});
