// The Hindi area of voidtv.net HQ (scripts/lib/hindihq.js, scripts/hq/hindi.js; B, 20 Nov 2026: "this needs area inside voidtv hq
// please , a tab"). Run: node --test tests/hindihq.test.js
// Everything runs against a made-up Hindi folder in a temporary directory (HINDI_ROOT) with HQ's state in another (HQ_STATE_DIR),
// so the real Hindi folder, catalog/cache and voidtv.net are never touched. The one job started is a stand-in script in that folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'hindihq-'));
const HROOT = path.join(BASE, 'void-hindi'), H = path.join(HROOT, 'profiles', 'hindi');
process.env.HINDI_ROOT = HROOT;
process.env.HQ_STATE_DIR = path.join(BASE, 'state');
const hq = require('../scripts/lib/hindihq');
const write = (f, v) => { fs.mkdirSync(path.dirname(path.join(H, f)), { recursive: true }); fs.writeFileSync(path.join(H, f), typeof v === 'string' ? v : JSON.stringify(v)); };
const read = (f) => JSON.parse(fs.readFileSync(path.join(H, f), 'utf8'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// A stopped job's process can take a moment to let go of its log on Windows, so the clean-up retries. In a full parallel run
// something else (most likely Windows Defender reading new temp files) can hold the folder longer than that (EPERM, 20 Nov 2026,
// reported by the PLAY lead; the trivia tests met the same): then the temp folder is left behind and the run does not fail.
test.after(() => {
  try { fs.rmSync(BASE, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); }
  catch (e) { if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e; }
});

const file = (state, extra = {}) => ({ state, file: { playable: true, item: 'item-' + state.toLowerCase(), itemTitle: 'Upload ' + state, ...extra } });
function fixture() {
  write('list.json', { shows: [{ name: 'Mahabharat', hindi: 'महाभारत', type: 'Epics and History', language: 'hi', year: 1988 }, { name: 'Doraemon', hindi: 'डोरेमोन', type: 'Hindi Dubbed', language: 'ja', year: 1979 }] });
  write('catalog/shows/mahabharat.json', { seasons: [{ season: 1, episodes: [{ number: 1, ...file('LIVE') }, { number: 2, ...file('REVIEW') }, { number: 3, ...file('LIVE', { langRisk: true }) }] }] });
  write('catalog/tvmovies-list.json', { items: [{ tmdbId: 12259, title: 'Sholay', hindi: 'शोले', year: '1975', language: 'hi' }, { tmdbId: 597, title: 'Titanic', hindi: 'टाइटैनिक', year: '1997', language: 'en' }] });
  write('catalog/movies/sholay-1975.json', { state: 'LIVE', file: { playable: true, item: 'sholay', itemTitle: 'Sholay 1975' } });
  write('catalog/movies/titanic-1997.json', { state: 'REVIEW', file: { playable: true, item: 'titanic-hindi', itemTitle: 'Titanic Hindi' } });
  write('docs/REVIEW.html', '<!doctype html><title>sheet</title>');
}

test('HI5: the HQ page has a Hindi area with its five tabs, loads its page code first, and HQ serves it', () => {
  const page = fs.readFileSync(path.join(ROOT, 'scripts', 'hq', 'index.html'), 'utf8');
  assert.match(page, /\{k:'hindi',n:'Hindi',tabs:\[\['hindi','Overview'\],\['hindi-titles','Shows and films'\],\['hindi-picks',"Friends' picks"\],\['hindi-jobs','Hunt and build'\],\['hindi-help','Help'\]\]\}/);
  assert.ok(page.indexOf('<script src="/hq/hindi.js"></script>') < page.indexOf('<script>'), 'hindi.js loads before the page script that renders');
  for (const f of ['hindiOverview', 'hindiTitles', 'hindiPicks', 'hindiJobs', 'hindiHelp']) {
    assert.match(page, new RegExp(':' + f + '[,}]'), 'the page renders ' + f);
    assert.match(fs.readFileSync(path.join(ROOT, 'scripts', 'hq', 'hindi.js'), 'utf8'), new RegExp('function ' + f + '\\('), 'hindi.js defines ' + f);
  }
  const server = fs.readFileSync(path.join(ROOT, 'scripts', 'hq.js'), 'utf8');
  for (const r of ["'/hq/hindi.js'", "'/api/hindi'", "'/api/hindi/titles'", "'/api/hindi/review'", "'/api/hindi/decide'", "'/api/hindi/picks'", "'/api/hindi/jobs'"]) assert.ok(server.includes(r), 'HQ has ' + r);
});

test('HI5: with no Hindi folder on the PC the overview says so and nothing is written', () => {
  const o = hq.overview();
  assert.equal(o.found, false);
  assert.ok(!fs.existsSync(H));
});

test('HI5: every title shows what plays, with its Hindi name; Keep and Drop use the switches voidtv.net reads, with a backup', () => {
  fixture();
  const rows = hq.titles(), by = (k) => rows.find((r) => r.key === k);
  assert.equal(rows.length, 4);
  assert.deepEqual([by('show:mahabharat').plays, by('show:mahabharat').sure, by('show:mahabharat').hindi], [2, 1, 'महाभारत'], 'a language-risk file does not count');
  assert.equal(by('show:doraemon').state, 'not hunted');
  assert.equal(by('film:12259').plays, 1);
  assert.equal(by('film:597').plays, 0, 'an unsure film does not play until it is kept');
  assert.equal(by('film:597').state, 'needs a listen');
  fs.writeFileSync(path.join(H, 'catalog', 'overrides.json'), JSON.stringify({ mahabharat: { tvmazeId: 16607 } }));
  hq.decide('film:597', 'keep');
  hq.decide('show:mahabharat', 'drop');
  let ov = read('catalog/overrides.json');
  assert.deepEqual(ov['movie-597'], { approved: true });
  assert.deepEqual(ov.mahabharat, { tvmazeId: 16607, hidden: true }, 'the other keys of the show stay');
  assert.equal(hq.titles().find((r) => r.key === 'film:597').plays, 1, 'a kept film plays');
  hq.decide('film:597', 'drop');
  assert.deepEqual(read('catalog/overrides.json')['movie-597'], { rejected: true });
  hq.decide('film:597', 'clear');
  hq.decide('show:mahabharat', 'clear');
  ov = read('catalog/overrides.json');
  assert.equal(ov['movie-597'], undefined);
  assert.deepEqual(ov.mahabharat, { tvmazeId: 16607 });
  const backups = fs.readdirSync(path.join(H, 'catalog')).filter((f) => f.startsWith('overrides.before-hq-'));
  assert.equal(backups.length, 1, 'one backup of the day\'s first version');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(H, 'catalog', backups[0]), 'utf8')), { mahabharat: { tvmazeId: 16607 } });
  assert.throws(() => hq.decide('film:1', 'keep'), /not on the Hindi list/);
  assert.throws(() => hq.decide('show:mahabharat', 'delete'), /Keep, Drop or Clear/);
  assert.throws(() => hq.decide('../x', 'keep'), /bad title key/);
});

test('HI5: a friend\'s file is counted once, only what the sheet sends is kept, and anything else is refused', () => {
  fixture();
  const f = { kind: 'voidtv-hindi-picks', v: 1, id: 'abcd1234', at: '2026-11-20', decisions: { 'show:mahabharat': { d: 'keep', note: 'sahi hai' }, 'film:597': { d: 'drop' }, 'bad key!': { d: 'keep' } }, more: 'Hum Log', extra: 'x' };
  assert.equal(hq.addPicks(f).added, true);
  assert.equal(hq.addPicks(f).added, false, 'the same file again is not counted twice');
  assert.throws(() => hq.addPicks({ hello: 1 }), /not a picks file/);
  assert.throws(() => hq.addPicks({ ...f, id: '../../x' }), /not a picks file/);
  const saved = read('reviews/picks-abcd1234.json');
  assert.deepEqual(Object.keys(saved.decisions).sort(), ['film:597', 'show:mahabharat']);
  assert.equal(saved.extra, undefined);
  const t = hq.tally();
  assert.equal(t.files, 1);
  assert.deepEqual(t.byTitle['show:mahabharat'], { keep: 1, drop: 0, unsure: 0, notes: ['sahi hai'] });
  assert.deepEqual(t.more, ['Hum Log']);
  assert.equal(hq.overview().picks.files, 1);
});

test('HI5: a Hindi job runs inside the Hindi folder with the hindi profile, one at a time, and Stop kills only its own process', async () => {
  fixture();
  write('review.js', 'console.log("profile=" + process.env.VOID_PROFILE + " cwd=" + require("path").basename(process.cwd()));');
  write('shelf.js', 'setTimeout(() => {}, 60000);');
  assert.throws(() => hq.run('rm', null), /unknown Hindi job/);
  const j = hq.run('review', null);
  for (let i = 0; i < 50 && hq.jobs().jobs.find((x) => x.id === j.id).running; i++) await wait(100);
  const done = hq.jobs().jobs.find((x) => x.id === j.id);
  assert.equal(done.code, 0);
  assert.match(done.tail, /profile=hindi cwd=void-hindi/);
  const slow = hq.run('shelf', null);
  assert.throws(() => hq.run('review', null), /already running/);
  const refused = await hq.stop(slow.id, async () => ({ cmd: 'node C:\\other\\thing.js', created: new Date().toISOString() }));
  assert.equal(refused.status, 409, 'a process that is not the job is never stopped');
  const again = hq.run('shelf', null);
  for (let i = 0; i < 40 && !hq.jobs().jobs.find((x) => x.id === again.id).pstart; i++) await wait(250);
  const r = await hq.stop(again.id);
  assert.equal(r.body.stopped, true);
  for (let i = 0; i < 40; i++) { try { process.kill(again.pid, 0); await wait(100); } catch (e) { break; } }
  assert.throws(() => process.kill(again.pid, 0), 'the stopped process is gone');
  try { process.kill(slow.pid); } catch (e) { /* already gone */ }
});
