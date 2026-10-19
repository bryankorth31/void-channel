// Tests for scripts/launch-check.js: the go/no-go rules (evaluate), the printed table (render), the log reader and the argument rules.
// Run: node --test tests/launch-check.test.js
// evaluate() is pure, so every case here is a made-up set of facts handed to it. Nothing reaches the network, the real audit folder,
// the real catalog or backend/.env. The two runs of the script itself use options that stop before any collector starts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LC = require('../scripts/launch-check');
const REPO = path.join(__dirname, '..');
const NOW = Date.parse('2026-10-19T12:00:00.000Z');
const SHA = '0123456789abcdef0123456789abcdef01234567';
const iso = (ms) => new Date(ms).toISOString();
const MIN = 60000, HOUR = 3600e3, DAY = 864e5;
const EM_DASH = String.fromCharCode(0x2014), EN_DASH = String.fromCharCode(0x2013);

const versionText = (extra) => `${SHA} 2026-10-19T11:00:00.000Z\ngate=on files=15753 largest=10691718 shows=4897 episodes=49449 largestFile=data/graph.json${extra || ''}\n`;
// A made-up world in which every row is GO. Each test changes one part of it.
function good() {
  return {
    nowMs: NOW, root: '/made/up',
    findings: { items: [
      { id: 'F-001', severity: 'critical', status: 'fixed', title: 'a fixed critical' },
      { id: 'F-002', severity: 'high', status: 'refuted', title: 'a refuted high' },
      { id: 'F-003', severity: 'medium', status: 'open', title: 'an open medium' },
      { id: 'F-004', severity: 'low', status: 'verified', title: 'a verified low' },
    ] },
    health: { data: { at: iso(NOW - 5 * MIN), level: 'green', checks: [{ id: 'publish', level: 'green', msg: 'ok' }, { id: 'nightly', level: 'green', msg: 'ok' }] } },
    fresh: null,
    live: { text: versionText() },
    remote: { sha: SHA },
    analytics: { events: 120 },
    sentry: { status: 200 },
    publish: { text: [
      `${iso(NOW - 10 * HOUR)} pushed abc1234: Catalog: 4897 shows, 49449 episodes (12 files)`,
      `${iso(NOW - 2 * HOUR)} nothing new`,
    ].join('\n') },
    backup: { stamp: { at: iso(NOW - DAY), files: 89687, bytes: 2481634305, failed: 0 } },
    soak: { data: { at: iso(NOW - DAY), durationMs: 2.5 * HOUR, longestPauseMs: 1200 } },
  };
}
const row = (res, n) => res.rows.find((r) => r.n === n);
// Asserts a row is NO-GO and that the whole check would exit with status 1.
function assertBlocks(res, n) {
  assert.equal(row(res, n).status, 'NO-GO', `row ${n} should be NO-GO, got ${row(res, n).status}: ${row(res, n).text}`);
  assert.equal(res.code, 1, 'the exit status must be 1');
  assert.ok(res.blocking.includes(n));
  assert.ok(row(res, n).fix.length > 20, `row ${n} must say what to do by hand`);
}

test('everything good: every row is GO or advisory GO, the exit status is 0', () => {
  const res = LC.evaluate(good());
  assert.deepEqual(res.rows.map((r) => r.status), Array(10).fill('GO'));
  assert.equal(res.code, 0);
  assert.deepEqual(res.blocking, []);
  assert.match(res.verdict, /^GO\./);
  assert.equal(res.rows.length, 10);
  assert.deepEqual(res.rows.map((r) => r.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('row 1 findings: an open critical or high blocks, whatever its status word (open, verified), and fixed or refuted ones do not', () => {
  for (const status of ['open', 'verified', 'Open', 'accepted', undefined]) {
    const i = good();
    i.findings.items.push({ id: 'X-100', severity: 'high', status, title: 'a high that is not closed' });
    const res = LC.evaluate(i);
    assertBlocks(res, 1);
    assert.match(row(res, 1).text, /X-100/);
    assert.ok(row(res, 1).detail.some((d) => d.startsWith('X-100 high')), 'every open one is listed on its own line');
  }
  const crit = good(); crit.findings.items.push({ id: 'X-1', severity: 'critical', status: 'open', title: 't' }, { id: 'X-2', severity: 'high', status: 'open', title: 't' });
  const rc = LC.evaluate(crit);
  assert.deepEqual(row(rc, 1).detail.map((d) => d.split(' ')[0]), ['X-1', 'X-2']);
  assert.match(row(rc, 1).text, /^2 open critical or high findings: X-1, X-2/);
  // medium and low never block, fixed and refuted highs never block
  assert.equal(row(LC.evaluate(good()), 1).status, 'GO');
  // an unreadable or empty list cannot be called GO
  assertBlocks(LC.evaluate({ ...good(), findings: { error: 'file not found' } }), 1);
  assertBlocks(LC.evaluate({ ...good(), findings: { items: [] } }), 1);
  assertBlocks(LC.evaluate({ ...good(), findings: undefined }), 1);
});

test('row 2 doctor: a red light blocks and is named, a doctor result older than 30 minutes blocks, a missing one blocks', () => {
  const red = good();
  red.health.data.checks.push({ id: 'unpushed', level: 'red', msg: '2 Catalog commits waiting', fix: 'node scripts/publish.js' });
  const r1 = LC.evaluate(red);
  assertBlocks(r1, 2);
  assert.match(row(r1, 2).text, /1 red light: unpushed/);
  assert.ok(row(r1, 2).detail[0].includes('2 Catalog commits waiting'));

  const stale = good(); stale.health.data.at = iso(NOW - 31 * MIN);
  const r2 = LC.evaluate(stale);
  assertBlocks(r2, 2);
  assert.match(row(r2, 2).text, /31 min old \(limit 30 min\)/);
  assert.match(row(r2, 2).fix, /--fresh/, 'the stale case offers --fresh');
  const edge = good(); edge.health.data.at = iso(NOW - 30 * MIN);
  assert.equal(row(LC.evaluate(edge), 2).status, 'GO', 'exactly 30 minutes is still fresh');

  assertBlocks(LC.evaluate({ ...good(), health: { error: 'file not found' } }), 2);
  assertBlocks(LC.evaluate({ ...good(), health: { data: { at: 'not a date', checks: [] } } }), 2);
  assertBlocks(LC.evaluate({ ...good(), fresh: { ran: true, error: 'it took over 3 minutes' } }), 2);
});

test('row 3 live = origin/master: a different commit blocks, a short commit id is accepted, an unreadable side blocks', () => {
  const diff = good(); diff.remote = { sha: 'f'.repeat(40) };
  const r = LC.evaluate(diff);
  assertBlocks(r, 3);
  assert.match(row(r, 3).text, /serves 012345678 but origin\/master is fffffffff/);
  const shortSha = good(); shortSha.live = { text: versionText().replace(SHA, SHA.slice(0, 9)) };
  assert.equal(row(LC.evaluate(shortSha), 3).status, 'GO', 'a 9 character id is accepted');
  const tooShort = good(); tooShort.live = { text: versionText().replace(SHA, SHA.slice(0, 5)) };
  assertBlocks(LC.evaluate(tooShort), 3);
  const unknown = good(); unknown.live = { text: versionText().replace(SHA, 'unknown') };
  assertBlocks(LC.evaluate(unknown), 3);
  assertBlocks(LC.evaluate({ ...good(), live: { error: 'it answered 500' } }), 3);
  assertBlocks(LC.evaluate({ ...good(), remote: { error: 'no answer in 5 s' } }), 3);
});

test('row 4 files: 19,500 files or a file over 24 MiB blocks, 18,000 warns, below that is GO', () => {
  const at = (n) => ({ ...good(), live: { text: versionText().replace('files=15753', 'files=' + n) } });
  assert.equal(row(LC.evaluate(at(17999)), 4).status, 'GO');
  const warn = LC.evaluate(at(18000));
  assert.equal(row(warn, 4).status, 'WARN');
  assert.equal(warn.code, 0, 'a warning does not block');
  assert.equal(row(LC.evaluate(at(19499)), 4).status, 'WARN');
  assertBlocks(LC.evaluate(at(19500)), 4);
  assertBlocks(LC.evaluate(at(20000)), 4);
  const big = good(); big.live = { text: versionText().replace('largest=10691718', 'largest=' + (24 * 1048576 + 1)) };
  assertBlocks(LC.evaluate(big), 4);
  const exactly = good(); exactly.live = { text: versionText().replace('largest=10691718', 'largest=' + 24 * 1048576) };
  assert.equal(row(LC.evaluate(exactly), 4).status, 'GO', 'exactly 24 MiB is allowed');
  const none = good(); none.live = { text: `${SHA} 2026-10-19T11:00:00.000Z\n` };
  assert.equal(row(LC.evaluate(none), 4).status, 'WARN', 'an older version.txt has no counts: said plainly, not a block');
  assert.match(row(LC.evaluate(good()), 4).text, /15,753 files of 20,000 allowed/);
});

test('row 5 analytics: a failed query blocks, missing keys block, no events in a day is a warning', () => {
  assertBlocks(LC.evaluate({ ...good(), analytics: { error: 'SQL API 403: forbidden' } }), 5);
  const missing = LC.evaluate({ ...good(), analytics: { missingKeys: ['CF_ANALYTICS_TOKEN'] } });
  assertBlocks(missing, 5);
  assert.match(row(missing, 5).text, /CF_ANALYTICS_TOKEN missing in backend\/\.env/);
  assertBlocks(LC.evaluate({ ...good(), analytics: undefined }), 5);
  assertBlocks(LC.evaluate({ ...good(), analytics: { events: 'x' } }), 5);
  const zero = LC.evaluate({ ...good(), analytics: { events: 0 } });
  assert.equal(row(zero, 5).status, 'WARN');
  assert.equal(zero.code, 0);
  assert.match(row(LC.evaluate(good()), 5).text, /120 events in the last 24 hours/);
});

test('row 6 Sentry: no answer or a non-loader answer blocks; the sentence says it proves the host answers, not that an event arrived', () => {
  const none = LC.evaluate({ ...good(), sentry: { error: 'no answer in 5 s' } });
  assertBlocks(none, 6);
  assert.match(row(none, 6).text, /proves the host answers, not that an event arrived/);
  assertBlocks(LC.evaluate({ ...good(), sentry: { status: 404 } }), 6);
  assertBlocks(LC.evaluate({ ...good(), sentry: { status: 503 } }), 6);
  assertBlocks(LC.evaluate({ ...good(), sentry: undefined }), 6);
  const ok = LC.evaluate(good());
  assert.equal(row(ok, 6).status, 'GO');
  assert.match(row(ok, 6).text, /not that an event arrived/);
});

test('row 7 gate: gate=on is information; gate=off blocks only while another required row is NO-GO', () => {
  const on = good();
  assert.equal(row(LC.evaluate(on), 7).status, 'GO');
  assert.match(row(LC.evaluate(on), 7).text, /gate=on/);
  assert.match(row(LC.evaluate(on), 7).detail.join(' '), /GATE = off/, 'it says what opening needs');
  // the site is open and everything is fine: GO
  const open = good(); open.live = { text: versionText().replace('gate=on', 'gate=off') };
  const ro = LC.evaluate(open);
  assert.equal(row(ro, 7).status, 'GO');
  assert.match(row(ro, 7).text, /gate=off: the site is OPEN/);
  assert.equal(ro.code, 0);
  // the site is open and a required row fails: row 7 blocks too, and says which
  const bad = good(); bad.live = open.live; bad.sentry = { error: 'no answer' };
  const rb = LC.evaluate(bad);
  assertBlocks(rb, 7);
  assertBlocks(rb, 6);
  assert.match(row(rb, 7).text, /row 6 is NO-GO/);
  assert.match(row(rb, 7).fix, /SITE_PASSWORD/);
  // gate=on with a failing row: row 7 stays information, row 6 alone blocks
  const closed = good(); closed.sentry = { error: 'no answer' };
  const rc = LC.evaluate(closed);
  assert.equal(row(rc, 7).status, 'GO');
  assert.deepEqual(rc.blocking, [6]);
  // an advisory or warning row does not count as a reason: open + only WARN rows is still GO
  const openWarn = good(); openWarn.live = open.live; openWarn.soak = { missing: true }; openWarn.analytics = { events: 0 };
  assert.equal(row(LC.evaluate(openWarn), 7).status, 'GO');
  // no gate word yet
  const old = good(); old.live = { text: `${SHA} 2026-10-19T11:00:00.000Z\n` };
  assert.equal(row(LC.evaluate(old), 7).status, 'WARN');
});

test('row 8 publish: a failed or guard-refused last run blocks; held, an earlier refusal and a quiet log warn', () => {
  const log = (...lines) => ({ text: lines.join('\n') });
  const failed = LC.evaluate({ ...good(), publish: log(`${iso(NOW - HOUR)} FAILED: push to origin/master did not go through (timeout)`) });
  assertBlocks(failed, 8);
  assert.match(row(failed, 8).text, /FAILED: push to origin\/master did not go through/);
  const refused = LC.evaluate({ ...good(), publish: log(`${iso(NOW - 3 * HOUR)} pushed abc1234: Catalog: 4897 shows`, `${iso(NOW - HOUR)} refused: shrink: shows 4897 -> 1000, more than 10% down`) });
  assertBlocks(refused, 8);
  assert.match(row(refused, 8).text, /refused by a guard: shrink/);
  assert.match(row(refused, 8).text, /last push 2026-10-19 09:00 UTC/);
  // a refusal earlier in the day, then a good run: listed, not blocking
  const earlier = LC.evaluate({ ...good(), publish: log(`${iso(NOW - 5 * HOUR)} refused: shrink: shows 4897 -> 1000, more than 10% down`, `${iso(NOW - 4 * HOUR)} pushed abc1234: Catalog: 4897 shows`, `${iso(NOW - HOUR)} nothing new`) });
  assert.equal(row(earlier, 8).status, 'WARN');
  assert.equal(earlier.code, 0);
  assert.match(row(earlier, 8).text, /1 guard refusal in the last day/);
  // a refusal more than a day ago is not "in the last day"
  const old = LC.evaluate({ ...good(), publish: log(`${iso(NOW - 30 * HOUR)} refused: x`, `${iso(NOW - HOUR)} nothing new`) });
  assert.equal(row(old, 8).status, 'GO');
  assert.match(row(old, 8).text, /0 guard refusals in the last day/);
  const held = LC.evaluate({ ...good(), publish: log(`${iso(NOW - HOUR)} held: 3 other commits waiting: x`) });
  assert.equal(row(held, 8).status, 'WARN');
  assert.equal(held.code, 0);
  assert.equal(row(LC.evaluate({ ...good(), publish: log(`${iso(NOW - 7 * HOUR)} nothing new`) }), 8).status, 'WARN');
  assert.equal(row(LC.evaluate({ ...good(), publish: { error: 'file not found' } }), 8).status, 'WARN');
  assert.equal(row(LC.evaluate({ ...good(), publish: log('no dated lines here') }), 8).status, 'WARN');
  // lines of a dry run never count
  assert.equal(row(LC.evaluate({ ...good(), publish: log(`${iso(NOW - HOUR)} nothing new`, `${iso(NOW - 60000)} dry: refused: x`) }), 8).status, 'GO');
});

test('row 9 backup: older than 7 days or never blocks, older than 3 days warns, failed files warn', () => {
  const at = (days, extra) => ({ ...good(), backup: { stamp: { at: iso(NOW - days * DAY), files: 10, bytes: 1e6, failed: 0, ...(extra || {}) } } });
  assert.equal(row(LC.evaluate(at(0.5)), 9).status, 'GO');
  assert.equal(row(LC.evaluate(at(3)), 9).status, 'GO', 'exactly 3 days is not over 3 days');
  const w = LC.evaluate(at(4));
  assert.equal(row(w, 9).status, 'WARN');
  assert.equal(w.code, 0);
  assert.equal(row(LC.evaluate(at(7)), 9).status, 'WARN', 'exactly 7 days is not over 7 days');
  const nogo = LC.evaluate(at(8));
  assertBlocks(nogo, 9);
  assert.match(row(nogo, 9).text, /8 days old \(limit 7\)/);
  assert.match(row(nogo, 9).fix, /node scripts\/backup-cache\.js --to/);
  assertBlocks(LC.evaluate({ ...good(), backup: { error: 'file not found' } }), 9);
  assertBlocks(LC.evaluate({ ...good(), backup: { stamp: { at: 'never' } } }), 9);
  assert.equal(row(LC.evaluate(at(1, { failed: 2 })), 9).status, 'WARN');
});

test('row 10 soak: advisory. No result is a warning with the plain words, a short or slow soak warns, a clean 2 hour soak is GO, and none of it blocks', () => {
  const none = LC.evaluate({ ...good(), soak: { missing: true } });
  assert.equal(row(none, 10).status, 'WARN');
  assert.match(row(none, 10).text, /no soak result yet/);
  assert.equal(none.code, 0);
  const slow = LC.evaluate({ ...good(), soak: { data: { at: iso(NOW), durationMs: 3 * HOUR, longestPauseMs: 4200 } } });
  assert.equal(row(slow, 10).status, 'WARN');
  assert.equal(slow.code, 0, 'the soak is advisory');
  assert.equal(row(LC.evaluate({ ...good(), soak: { data: { at: iso(NOW), minutes: 30, longestPauseMs: 500 } } }), 10).status, 'WARN');
  assert.equal(row(LC.evaluate({ ...good(), soak: { data: { at: iso(NOW), minutes: 120, longestPauseMs: 3000 } } }), 10).status, 'GO');
  assert.equal(row(LC.evaluate({ ...good(), soak: { data: { at: iso(NOW) } } }), 10).status, 'WARN');
  assert.equal(row(LC.evaluate({ ...good(), soak: { error: 'not valid JSON' } }), 10).status, 'WARN');
});

test('warnings are listed and never block: a yellow light, no soak, a 4 day backup and an empty day of analytics still exit 0', () => {
  const i = good();
  i.health.data.checks.push({ id: 'matcher', level: 'yellow', msg: 'self-listed grids hold odd picks' });
  i.soak = { missing: true };
  i.backup.stamp.at = iso(NOW - 4 * DAY);
  i.analytics = { events: 0 };
  const res = LC.evaluate(i);
  assert.equal(res.code, 0);
  assert.deepEqual(res.blocking, []);
  assert.deepEqual(res.warns, [2, 5, 9, 10]);
  assert.match(res.verdict, /^GO\./);
  assert.match(res.verdict, /WARN rows \(do not block\): 2, 5, 9, 10/);
  assert.match(row(res, 2).text, /no red lights, 1 yellow: matcher/);
});

test('the verdict names every blocking row and the exit status follows it', () => {
  const i = good();
  i.sentry = { status: 500 }; i.backup = { error: 'none' }; i.remote = { sha: 'e'.repeat(40) };
  const res = LC.evaluate(i);
  assert.deepEqual(res.blocking, [3, 6, 9]);
  assert.equal(res.code, 1);
  assert.match(res.verdict, /^NO-GO\. 3 required rows block the launch: 3, 6, 9\./);
});

test('the findings reader: the audit file has a top-level "findings" list, and a missing, broken or wrong file is an error the row turns into a NO-GO', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lc-'));
  try {
    const file = path.join(dir, 'findings.json');
    fs.writeFileSync(file, JSON.stringify({ _readme: 'x', findings: [{ id: 'A-1', severity: 'high', status: 'open', title: 'one' }, { id: 'A-2', severity: 'high', status: 'fixed', title: 'two' }] }));
    const got = LC.collectFindings(file);
    assert.equal(got.items.length, 2);
    const res = LC.evaluate({ ...good(), findings: got });
    assert.deepEqual(row(res, 1).detail.map((d) => d.split(' ')[0]), ['A-1']);
    assert.match(LC.collectFindings(path.join(dir, 'nope.json')).error, /file not found/);
    fs.writeFileSync(path.join(dir, 'bad.json'), '{ not json');
    assert.match(LC.collectFindings(path.join(dir, 'bad.json')).error, /not valid JSON/);
    fs.writeFileSync(path.join(dir, 'other.json'), JSON.stringify([1, 2]));
    assert.match(LC.collectFindings(path.join(dir, 'other.json')).error, /no "findings" list/);
    for (const f of ['nope.json', 'bad.json', 'other.json']) assertBlocks(LC.evaluate({ ...good(), findings: LC.collectFindings(path.join(dir, f)) }), 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('publish log reader: finds the last outcome and the last push, counts refusals of the last day, ignores dry runs and warning noise', () => {
  const text = [
    `${iso(NOW - 40 * HOUR)} pushed aaa1111: Catalog: 1 shows`,
    'warning: LF will be replaced by CRLF',
    `${iso(NOW - 20 * HOUR)} refused: a`,
    `${iso(NOW - 10 * HOUR)} pushed bbb2222: Catalog: 2 shows`,
    `${iso(NOW - 5 * HOUR)} refused: b`,
    `${iso(NOW - 4 * HOUR)} FAILED: push did not go through`,
    `${iso(NOW - 3 * HOUR)} dry: nothing new`,
    `${iso(NOW - 2 * HOUR)} held: 2 other commits waiting`,
  ].join('\r\n');
  const p = LC.parsePublishLog(text, NOW);
  assert.equal(p.last.word, 'held');
  assert.equal(p.lastPush.at, NOW - 10 * HOUR);
  assert.equal(p.refused24.length, 2);
  assert.equal(p.failed24, 1);
  assert.equal(LC.parsePublishLog('', NOW).last, null);
});

test('every printed line is plain: no token-shaped text, no secret value, no em dash, however the facts look', () => {
  const secret = 'Zx9Qw3Er7Ty1Ui5Op0As4Df8Gh2Jk6Lm3Nb7Vc1X';
  const i = good();
  i.analytics = { error: `SQL API 403: {"error":"bad token ${secret} for account 0123456789abcdef0123456789abcdef"}` };
  i.findings.items.push({ id: 'X-9', severity: 'high', status: 'open', title: `Title with a dash ${EM_DASH} and ${EN_DASH} and a key eyJhbGciOiJIUzI1NiJ9.abc.def ${'k'.repeat(30)}9` });
  i.health.data.checks.push({ id: 'live', level: 'red', msg: `Bearer ${secret} was sent`, fix: 'x' });
  i.remote = { sha: 'abcdef0123456789abcdef0123456789abcdef01' };
  i.live = { text: versionText() };
  const res = LC.evaluate(i);
  const lines = LC.render(res, { nowMs: NOW, root: '/made/up', secrets: ['hunter2-secret-value'] });
  assert.ok(lines.length > 15);
  for (const l of lines) {
    assert.ok(!l.includes(EM_DASH) && !l.includes(EN_DASH), 'no em or en dash: ' + l);
    assert.ok(!/[A-Za-z0-9_-]{40,}/.test(l), 'no long token-shaped run: ' + l);
    assert.ok(!/(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{28,}/.test(l), 'no 28 character run holding a digit: ' + l);
    assert.ok(!/eyJ[A-Za-z0-9_-]{6,}/.test(l) && !/Bearer\s+[A-Za-z0-9]/i.test(l), 'no JWT or bearer value: ' + l);
    assert.ok(!l.includes(secret), 'the secret value is masked: ' + l);
  }
  // a configured secret is masked even when it is short and plain
  const masked = LC.scrub('the token hunter2-secret-value was rejected', ['hunter2-secret-value']);
  assert.equal(masked, 'the token *** was rejected');
  // the table still has all ten rows and the verdict
  assert.equal(lines.filter((l) => /^\s?\d{1,2}  (GO|NO-GO|WARN) /.test(l)).length, 10);
  assert.ok(lines.some((l) => l.startsWith('Verdict: NO-GO')));
});

test('the printed table names which rows are required, says it only reads, and keeps the Sentry and by-hand notes', () => {
  const lines = LC.render(LC.evaluate(good()), { nowMs: NOW, root: '/made/up' }).join('\n');
  assert.match(lines, /Rows 1 to 9 are required/);
  assert.match(lines, /Row 10 is advisory/);
  assert.match(lines, /This only reads\. It changes nothing and it never opens the site\./);
  assert.match(lines, /playback pause rate in Sentry/);
  assert.match(lines, /docs\/DEPLOY\.md/);
  const bad = LC.render(LC.evaluate({ ...good(), backup: { error: 'none' } }), { nowMs: NOW }).join('\n');
  assert.match(bad, /By hand: [\s\S]*backup-cache\.js/, 'a NO-GO row prints its by-hand fix');
});

test('only the listed hosts may be contacted', () => {
  assert.deepEqual(LC.ALLOWED_HOSTS.slice().sort(), ['api.cloudflare.com', 'js.sentry-cdn.com', 'voidtv.net']);
  const src = fs.readFileSync(path.join(REPO, 'scripts', 'launch-check.js'), 'utf8');
  for (const banned of ['archive.org', 'tvmaze', 'themoviedb', 'tmdb.org']) {
    assert.ok(!new RegExp('https?://[^\\s\'"`]*' + banned, 'i').test(src), 'the script must not name ' + banned + ' as an address');
  }
});

test('options: an unknown option is refused (exit 2), --help prints the usage and exits 0, neither starts a collector', () => {
  assert.deepEqual(LC.parseArgs(['--fresh']).bad, []);
  assert.equal(LC.parseArgs(['--fresh']).fresh, true);
  assert.equal(path.basename(LC.parseArgs(['--findings', 'x/f.json']).findings), 'f.json');
  assert.deepEqual(LC.parseArgs(['--findings']).bad, ['--findings'], 'an option without its value is refused');
  assert.deepEqual(LC.parseArgs(['--open']).bad, ['--open']);
  const bad = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'launch-check.js'), '--nope'], { encoding: 'utf8', timeout: 20000 });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown or incomplete option "--nope"/);
  const help = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'launch-check.js'), '--help'], { encoding: 'utf8', timeout: 20000 });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: node scripts\/launch-check\.js/);
});

test('no em dash in the files this piece wrote, and the opening-day section names only files and commands that exist', () => {
  for (const f of ['scripts/launch-check.js', 'tests/launch-check.test.js', 'docs/DEPLOY.md']) {
    const text = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert.ok(!text.includes(EM_DASH), f + ' has an em dash');
  }
  const doc = fs.readFileSync(path.join(REPO, 'docs', 'DEPLOY.md'), 'utf8');
  const seen = new Set();
  for (const m of doc.matchAll(/\b((?:scripts|docs|functions|tests)\/[A-Za-z0-9_./-]*[A-Za-z0-9_])/g)) {
    const p = m[1].replace(/\.$/, '');
    if (p.includes('<') || seen.has(p)) continue;
    seen.add(p);
    assert.ok(fs.existsSync(path.join(REPO, p)), 'docs/DEPLOY.md names ' + p + ', which does not exist');
  }
  assert.ok(seen.has('scripts/launch-check.js') || doc.includes('scripts/launch-check.js'), 'the doc names the launch check');
  assert.ok(doc.includes('node scripts/launch-check.js'), 'the doc says how to run the launch check by hand');
});
