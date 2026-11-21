// An Archive answer that carries an error is not a result (build audit 19 Nov 2026, V4 and V5).
// The nightly hunt crashed on one show every night ("Cannot read properties of null (reading 'title')") because a search answer
// with `request_error` and two empty entries had been saved as a result and was reused for ever; other shows were "hunted" from
// such an answer and never asked again. The rule lives in scripts/lib/cachefile.js; scripts/cache-check.js finds the old pages.
// Everything here runs on a temporary folder. No network, and the real catalog/cache is never touched.
// Run: node --test tests/cache-answer.test.js
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { readCached, writeCached, answerError, readGood, saveAnswer, entries } = require('../scripts/lib/cachefile');
const { scan, describe } = require('../scripts/cache-check');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-answer-'));
after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* a scanner may still hold it; the folder is in the temp folder */ } });
let n = 0;
const dir = () => { const d = path.join(TMP, 'case' + (++n)); fs.mkdirSync(d); return d; };

// The answer the audit found saved for one show, shortened: two empty entries, no total, and the Archive's own error.
const BAD = JSON.stringify({ items: [null, null], count: 2, total: null, request_error: { timestamp: '2026-10-14T17:07:03Z', request_url: 'http://es-lb:9200/archive/_search?timeout=600s' } });
const GOOD = JSON.stringify({ items: [{ identifier: 'a-show-s01', title: 'A Show S01' }, { identifier: 'a-show-s02', title: 'A Show S02' }], count: 2, total: 2 });

// What the Archive answers when a search finds nothing: it uses the same field, but this is a true empty result.
const NO_HITS = JSON.stringify({ items: [], count: 0, total: null, request_error: '(no hits returned)' });

test('"(no hits returned)" is a true empty result, not an error: it is saved, reused and never listed', () => {
  assert.equal(answerError(JSON.parse(NO_HITS)), null);
  const d = dir();
  const f = path.join(d, 'scrape-cast-airline-0.json');
  assert.deepEqual(saveAnswer(f, NO_HITS), JSON.parse(NO_HITS));
  assert.deepEqual(readGood(f), JSON.parse(NO_HITS), 'the next hunt reuses it and makes no Archive call');
  assert.deepEqual(entries(readGood(f)), []);
  const r = scan(d);
  assert.deepEqual([r.seen, r.bad.length], [1, 0]);
});

test('answerError names an answer that carries a failure in request_error, and nothing else', () => {
  assert.equal(answerError(JSON.parse(BAD)), 'request_error of 2026-10-14');
  assert.equal(answerError({ items: [], request_error: {} }), 'request_error');
  assert.equal(answerError({ items: [], request_error: 'search engine timed out' }), 'request_error: search engine timed out', 'any other text there is a failure');
  assert.equal(answerError(JSON.parse(GOOD)), null);
  assert.equal(answerError({ items: [], count: 0, total: 0 }), null, 'a true empty result is a result');
  for (const x of [null, undefined, {}, [], 'text', 0, { request_error: null }, { request_error: false }]) assert.equal(answerError(x), null, JSON.stringify(x));
});

test('entries drops the empty entries and copes with a page that has none', () => {
  assert.deepEqual(entries({ items: [null, { identifier: 'x' }, undefined, { identifier: 'y' }] }).map((i) => i.identifier), ['x', 'y']);
  assert.deepEqual(entries(JSON.parse(BAD)), []);
  for (const x of [null, undefined, {}, { items: null }, { items: 'no' }]) assert.deepEqual(entries(x), []);
});

test('saveAnswer saves a real answer and refuses an error answer: nothing reaches the disk', () => {
  const d = dir();
  const good = path.join(d, 'scrape-a-show-0.json');
  assert.deepEqual(saveAnswer(good, GOOD), JSON.parse(GOOD));
  assert.ok(fs.existsSync(good + '.gz'), 'a search page is kept gzipped, as before');
  const bad = path.join(d, 'scrape-seirei-gensouki-spirit-chronicles-0.json');
  assert.throws(() => saveAnswer(bad, BAD), /the Archive answered with an error and no results \(request_error of 2026-10-14\); nothing was saved/);
  assert.ok(!fs.existsSync(bad) && !fs.existsSync(bad + '.gz'), 'no file was written for the error answer');
  assert.deepEqual(saveAnswer(null, GOOD), JSON.parse(GOOD), 'with no file it only reads the answer');
  assert.throws(() => saveAnswer(null, BAD), /answered with an error/);
  assert.throws(() => saveAnswer(path.join(d, 'scrape-x-0.json'), '{ not json'), SyntaxError, 'a body that does not parse is still an error, as before');
  assert.deepEqual(fs.readdirSync(d), ['scrape-a-show-0.json.gz']);
});

test('readGood gives a saved result back, and treats a saved error page as not there, so it is asked again', () => {
  const d = dir();
  const good = path.join(d, 'scrape-a-show-0.json'), bad = path.join(d, 'scrape-seirei-gensouki-spirit-chronicles-0.json'), plain = path.join(d, 'meta-an-item.json');
  writeCached(good, GOOD);
  writeCached(bad, BAD); // as the hunts saved it before 20 Nov 2026
  writeCached(plain, JSON.stringify({ files: [], metadata: { title: 'An item' } }));
  assert.deepEqual(readGood(good), JSON.parse(GOOD));
  assert.deepEqual(readCached(bad), JSON.parse(BAD), 'the old page is still on the disk');
  assert.equal(readGood(bad), undefined, 'but it is not a result');
  assert.equal(readGood(path.join(d, 'scrape-never-asked-0.json')), undefined);
  assert.deepEqual(readGood(plain).metadata, { title: 'An item' }, 'other cache files read as before');
});

test('the three savers go through the rule: hunt.js, hunt-movies.js and scout.js read with readGood and save with saveAnswer', () => {
  for (const f of ['hunt.js', 'hunt-movies.js', 'scout.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
    const get = src.slice(src.indexOf('async function getJson('), src.indexOf('\n}\n', src.indexOf('async function getJson(')));
    assert.match(get, /readGood\(cf\)/, f + ': a saved page is read through readGood');
    assert.match(get, /saveAnswer\(cf, text\)/, f + ': a fresh answer is saved through saveAnswer');
    assert.doesNotMatch(src, /writeCached\(/, f + ' no longer saves a page past the rule');
    assert.doesNotMatch(src, /\(j\.items \|\| \[\]\)/, f + ' takes entries through entries(), which drops the empty ones');
    assert.match(src, /entries\(j\)/, f);
  }
});

test('cache-check finds the saved pages that hold an error, by kind, and leaves everything else alone', () => {
  const d = dir();
  writeCached(path.join(d, 'scrape-a-show-0.json'), GOOD);
  writeCached(path.join(d, 'scrape-seirei-gensouki-spirit-chronicles-0.json'), BAD);
  fs.writeFileSync(path.join(d, 'scrape-title-some-show-2.json'), BAD); // a plain page from before the pages were gzipped
  writeCached(path.join(d, 'scrape-cast-some-show-0.json'), BAD);
  writeCached(path.join(d, 'mscrape-12345.json'), BAD);
  writeCached(path.join(d, 'mscrape-title-678.json'), GOOD);
  writeCached(path.join(d, 'scout-saturday-morning.json'), BAD);
  fs.writeFileSync(path.join(d, 'tvmaze-a-show.json'), JSON.stringify({ note: 'the word "request_error" in a file that is not a search page' }));
  fs.writeFileSync(path.join(d, 'scrape-damaged-0.json.gz'), 'not gzip at all');
  fs.writeFileSync(path.join(d, 'nightly.log'), 'request_error');
  const before = fs.readdirSync(d).sort();
  const r = scan(d);
  assert.equal(r.seen, 8, 'only search pages are read');
  assert.deepEqual(r.bad.map((b) => [b.kind, b.id, b.key]).sort(), [
    ['film', '12345', 'mscrape-12345'],
    ['scout', 'saturday-morning', 'scout-saturday-morning'],
    ['show', 'seirei-gensouki-spirit-chronicles', 'scrape-seirei-gensouki-spirit-chronicles-0'],
    ['show', 'some-show', 'scrape-cast-some-show-0'],
    ['show', 'some-show', 'scrape-title-some-show-2'],
  ]);
  assert.ok(r.bad.every((b) => b.why === 'request_error of 2026-10-14'));
  assert.deepEqual(r.unreadable, ['scrape-damaged-0.json.gz']);
  assert.deepEqual(fs.readdirSync(d).sort(), before, 'a scan changes nothing');
  assert.deepEqual(describe('scrape-90-day-fiance-3.json.gz'), { file: 'scrape-90-day-fiance-3.json.gz', key: 'scrape-90-day-fiance-3', kind: 'show', id: '90-day-fiance' });
});

test('HQ can run the check with no AI: the job name is allowed and the Jobs tab has both buttons', () => {
  const hq = fs.readFileSync(path.join(ROOT, 'scripts', 'hq.js'), 'utf8');
  const set = /const SCRIPTS = new Set\(\[([^\]]*)\]\)/.exec(hq);
  assert.ok(set && set[1].includes("'cache-check'"), 'scripts/hq.js lets HQ start cache-check');
  const page = fs.readFileSync(path.join(ROOT, 'scripts', 'hq', 'index.html'), 'utf8');
  assert.ok(page.includes("['Check saved searches for Archive errors (reads only, a few minutes)','cache-check',[]]"), 'the reading button');
  assert.ok(page.includes("['Hunt again the shows whose saved search holds an Archive error','cache-check',['--rehunt']]"), 'the hunt-again button');
});

test('cache-check by hand: exit 1 and the list while error pages are left, exit 0 on a clean folder, exit 2 for an option it does not know', () => {
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'cache-check.js'), ...a], { encoding: 'utf8' });
  const d = dir();
  writeCached(path.join(d, 'scrape-a-show-0.json'), GOOD);
  let r = run('--dir', d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /1 saved search pages read: 0 hold an Archive error, not a result/);
  writeCached(path.join(d, 'scrape-seirei-gensouki-spirit-chronicles-0.json'), BAD);
  r = run('--dir', d);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /2 saved search pages read: 1 hold an Archive error, not a result/);
  assert.match(r.stdout, /Shows \(1\)/);
  assert.match(r.stdout, /seirei-gensouki-spirit-chronicles {2}\(scrape-seirei-gensouki-spirit-chronicles-0, request_error of 2026-10-14\)/);
  assert.match(r.stdout, /node scripts\/hunt\.js --slug <show> --fresh --refresh/);
  assert.equal(run('--delete').status, 2, 'an unknown option is refused, never ignored');
  assert.equal(run('--dir', path.join(d, 'no-such-folder')).status, 2);
});
