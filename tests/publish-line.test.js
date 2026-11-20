// The words HQ shows about publishing (scripts/lib/publishline.js): the line at the top and how a press ended.
// Audit 19 Nov 2026, V1, H5 and H10: the top line said "nothing to publish" while 31 commits waited, a failed git check read
// the same, and a press on Publish now answered with a 4 second note and nothing about how it ended.
// Pure functions, so every case is fed here by hand. Nothing touches git, the network or the real repo.
// Run: node --test tests/publish-line.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { OWN, waiting, line, outcome } = require('../scripts/lib/publishline');

const at = (m) => '2026-11-19T20:20:02.295Z ' + m; // a dated line as scripts/publish.js writes it
const HELD = 'held: 25 other commits waiting: Void University: Human nature is drafted to the end | and 20 more (not pushed; run with --allow-other-commits to push them with the catalog)';

test('nothing waiting reads "nothing to publish" and needs nothing from him', () => {
  const l = line({ site: 'voidtv.net', own: 0, others: 0, dirty: 0, head: 'abc1234 Catalog: 10 shows' });
  assert.equal(l.level, 'ok');
  assert.equal(l.text, 'voidtv.net: nothing to publish. Last: abc1234 Catalog: 10 shows');
  assert.match(l.title, /Nothing is waiting on this PC/);
});

test('the case the audit found: 31 commits wait (25 from other work, 6 catalog) and the line says Publish is holding', () => {
  const l = line({ site: 'voidtv.net', own: 6, others: 25, dirty: 0, head: '97c473076 University' });
  assert.equal(l.level, 'wait');
  assert.match(l.text, /^voidtv\.net: 31 commits waiting, Publish is holding/);
  assert.doesNotMatch(l.text, /nothing to publish/);
  assert.match(l.title, /25 commits from other work wait on this PC, with 6 catalog commits/);
  assert.match(l.title, /Push live/);
  assert.match(l.title, /Push with other commits/);
});

test('one commit is said in the singular', () => {
  const l = line({ own: 0, others: 1, dirty: 1 });
  assert.match(l.text, /^1 commit waiting, Publish is holding, 1 unpublished file$/);
  assert.match(l.title, /1 commit from other work waits on this PC/);
});

test('only catalog commits waiting: Publish is not holding, it will send them', () => {
  const l = line({ own: 2, others: 0, dirty: 0 });
  assert.equal(l.level, 'wait');
  assert.match(l.text, /^2 catalog commits waiting to go out$/);
  assert.doesNotMatch(l.text, /holding/);
  assert.match(l.title, /Publish now sends them/);
});

test('changed catalog files are counted as unpublished files, as before', () => {
  const l = line({ own: 0, others: 0, dirty: 12 });
  assert.equal(l.level, 'ok');
  assert.equal(l.text, '12 unpublished files');
});

test('a git check that failed says so, in red, and never reads "nothing to publish"', () => {
  const l = line({ site: 'voidtv.net', error: 'fatal: ambiguous argument origin/master..master', head: '?', dirty: 0, ahead: '?' });
  assert.equal(l.level, 'bad');
  assert.equal(l.text, 'voidtv.net: could not read git');
  assert.doesNotMatch(l.text + l.title, /nothing to publish|Nothing is waiting/);
  assert.match(l.title, /fatal: ambiguous argument/);
});

test('a refused or failed last run shows in the line; a held, pushed or quiet one adds nothing of its own', () => {
  const refused = line({ own: 0, others: 0, dirty: 3, last: outcome(at('refused: catalog/overrides.json is not valid JSON (Unexpected token)')) });
  assert.equal(refused.level, 'bad');
  assert.match(refused.text, /^the last Publish was refused, 3 unpublished files$/);
  assert.match(refused.title, /overrides\.json is not valid JSON/);
  const failed = line({ own: 1, others: 0, dirty: 0, last: outcome(at('FAILED: push to origin/master did not go through (timeout)')) });
  assert.equal(failed.level, 'bad');
  assert.match(failed.text, /^the last Publish failed, 1 catalog commit waiting to go out$/);
  for (const m of [HELD, 'nothing new', 'pushed abc1234: Catalog: 10 shows, 50 episodes (1 files)']) {
    assert.equal(line({ own: 0, others: 0, dirty: 0, last: outcome(at(m)) }).text, 'nothing to publish', m);
  }
});

test('waiting() tells publish\'s own commits from other work by the subject, as publish.js does', () => {
  const w = waiting(['Catalog: 4245 shows, 71883 episodes (1 files)', 'HQ: a Hindi area', 'PLAY touch: bigger touch areas', '', 'Catalog: 4245 shows, 71883 episodes (5 files)']);
  assert.deepEqual({ own: w.own, others: w.others }, { own: 2, others: 2 });
  assert.deepEqual(waiting(['']), { own: 0, others: 0, subjects: [] }); // git log prints nothing when no commit waits
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'publish.js'), 'utf8');
  assert.ok(src.includes('const OWN = ' + String(OWN) + ';'), 'scripts/publish.js still names its own commits with the same test');
});

test('outcome: each way publish.js ends a run is read from its dated line and said in plain words', () => {
  const pushed = outcome(at('pushed 0b073027f: Catalog: 4245 shows, 71883 episodes (1 files)'), 0);
  assert.deepEqual([pushed.kind, pushed.level], ['pushed', 'ok']);
  assert.equal(pushed.text, 'Pushed 0b073027f. Cloudflare rebuilds the site in about a minute.');

  const nothing = outcome(at('nothing new'), 0);
  assert.deepEqual([nothing.kind, nothing.level], ['nothing', 'ok']);

  const held = outcome(at(HELD), 0);
  assert.deepEqual([held.kind, held.level], ['held', 'wait']);
  assert.match(held.text, /^Held\. The catalog is committed on this PC and was not pushed, because 25 other commits wait here\./);
  assert.match(held.text, /Press Push live/);
  assert.match(held.text, /Push with other commits/);
  assert.match(outcome(at('held: 1 other commit waiting: HQ frame lock (not pushed; run with --allow-other-commits to push them with the catalog)')).text, /because 1 other commit waits here/);

  const shrink = outcome(at('refused: shrink: shows 4245 -> 3000, episodes 71883 -> 50000, more than 10% down (run with --allow-shrink if this is meant)'), 1);
  assert.deepEqual([shrink.kind, shrink.level], ['refused', 'bad']);
  assert.match(shrink.text, /^Refused\. Nothing was pushed: shrink: shows 4245 -> 3000/);
  assert.match(shrink.text, /Publish anyway \(shrink\)/);
  assert.doesNotMatch(shrink.text, /--allow-shrink/, 'the button is named, not the command line option');

  const badJson = outcome(at('refused: catalog/overrides.json is not valid JSON (Unexpected token } in JSON)'), 1);
  assert.match(badJson.text, /Fix what the line names, then press Publish now again/);
  assert.doesNotMatch(badJson.text, /Publish anyway/);

  const failed = outcome(at('FAILED: push to origin/master did not go through (timeout)'), 1);
  assert.deepEqual([failed.kind, failed.level], ['failed', 'bad']);
  assert.match(failed.text, /^Failed: push to origin\/master did not go through \(timeout\)\. The whole line is in Jobs, publish\.log\.$/);

  assert.equal(outcome(at('dry: would push 2 commits to origin/master')).kind, 'dry');
});

test('outcome: the last ending line of a run wins, and lines that end nothing are skipped', () => {
  const run = [
    at('left alone: 2 hand-written docs under docs/ (changed or new, not in the publish list, so not committed)'),
    at('push attempt 1 of 3 did not go through, trying again in 5 s: timeout'),
    at('push attempt 2 of 3 did not go through, trying again in 20 s: timeout'),
    at('FAILED: push to origin/master did not go through (timeout)'),
    'a stray line with no date',
    '',
  ].join('\r\n');
  assert.equal(outcome(run, 1).kind, 'failed');
  assert.equal(outcome(at('nothing new') + '\n' + at(HELD)).kind, 'held');
});

test('outcome: a run that left no ending line is said as not known, never as a success', () => {
  assert.equal(outcome(''), null, 'no text and no exit code: nothing can be said');
  assert.equal(outcome(at('push attempt 1 of 3 did not go through, trying again in 5 s: timeout')), null);
  const quiet = outcome('', 0);
  assert.deepEqual([quiet.kind, quiet.level], ['unknown', 'wait']);
  const died = outcome('Error: Cannot find module', 1);
  assert.deepEqual([died.kind, died.level], ['unknown', 'bad']);
  assert.match(died.text, /stopped early \(exit 1\)/);
});

test('the lib reads every opening publish.js can end a run with (a new one there must be added here)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'publish.js'), 'utf8');
  // The comment at the top of publish.js that lists its ending lines, and the calls that write them.
  for (const piece of ['"nothing new"', '"pushed <hash>: <message>"', '"refused: <reason>"', '"FAILED: <one line>"', '"held: <n> other commits waiting: <subjects>"', "log('nothing new')", 'log(`pushed ${', 'log(`held: ${', "log('refused: '", "log('FAILED: '"]) {
    assert.ok(src.includes(piece), 'scripts/publish.js no longer holds ' + piece + ': check that scripts/lib/publishline.js still reads its ending lines');
  }
});

test('no line or message carries an em dash or a command line option he would have to type', () => {
  const said = [
    line({ site: 'voidtv.net', own: 6, others: 25, dirty: 4, head: 'abc' }), line({ own: 2 }), line({ error: 'x' }), line({}),
    outcome(at(HELD)), outcome(at('nothing new')), outcome(at('pushed abc: m')), outcome(at('refused: shrink: a (run with --allow-shrink if this is meant)')), outcome(at('FAILED: x')), outcome('', 0), outcome('', 1),
  ].map((o) => o.text + ' ' + (o.title || '')).join('\n');
  assert.doesNotMatch(said, new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']')); // the long and the short dash, by number
  assert.doesNotMatch(said, /--allow/);
});
