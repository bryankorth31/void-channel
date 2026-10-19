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
    site: { rootStatus: 401, apiStatus: null }, // gate=on: the front page is the password page
    remote: { sha: SHA },
    analytics: { events: 120 },
    sentry: { status: 200, keyFound: true },
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
  const crit = good(); crit.findings.items.push({ id: 'X-2', severity: 'high', status: 'open', title: 't' }, { id: 'X-1', severity: 'critical', status: 'open', title: 't' });
  const rc = LC.evaluate(crit);
  assert.deepEqual(row(rc, 1).detail.map((d) => d.split(' ')[0]), ['X-1', 'X-2'], 'critical first');
  assert.match(row(rc, 1).text, /^2 open findings block the launch \(2 critical or high\): X-1, X-2/);
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
  assertBlocks(LC.evaluate({ ...good(), sentry: { status: 404, keyFound: true } }), 6);
  assertBlocks(LC.evaluate({ ...good(), sentry: { status: 503, keyFound: true } }), 6);
  assertBlocks(LC.evaluate({ ...good(), sentry: undefined }), 6);
  const ok = LC.evaluate(good());
  assert.equal(row(ok, 6).status, 'GO');
  assert.match(row(ok, 6).text, /not that an event arrived/);
});

test('row 6 Sentry: when the site\'s key cannot be read from app.js the front door answering is a WARN, never a GO', () => {
  const nokey = LC.evaluate({ ...good(), sentry: { status: 204, keyFound: false } });
  assert.equal(row(nokey, 6).status, 'WARN');
  assert.equal(nokey.code, 0, 'a warning does not block');
  assert.match(row(nokey, 6).text, /front door only/);
  assert.match(row(nokey, 6).text, /key could not be found in scripts\/lib\/app\.js/);
  assert.match(row(nokey, 6).text, /not that an event arrived/);
  assert.match(row(nokey, 6).fix, /SENTRY_KEY/);
  assertBlocks(LC.evaluate({ ...good(), sentry: { status: 500, keyFound: false } }), 6);
  assertBlocks(LC.evaluate({ ...good(), sentry: { error: 'no answer in 5 s', keyFound: false } }), 6);
});

const OPEN_VERSION = versionText().replace('gate=on', 'gate=off');
// A made-up world in which the site is open and every row is GO; the patch changes one part of it.
function openSite(patch) { const i = good(); i.live = { text: OPEN_VERSION }; i.site = { rootStatus: 200, apiStatus: 200 }; return { ...i, ...(patch || {}) }; }

test('row 7 gate: gate=on is information; gate=off blocks only while another required row is NO-GO', () => {
  const on = good();
  assert.equal(row(LC.evaluate(on), 7).status, 'GO');
  assert.match(row(LC.evaluate(on), 7).text, /gate=on and the front page answers 401/);
  assert.match(row(LC.evaluate(on), 7).detail.join(' '), /GATE = off/, 'it says what opening needs');
  // the site is open and everything is fine: GO
  const ro = LC.evaluate(openSite());
  assert.equal(row(ro, 7).status, 'GO');
  assert.match(row(ro, 7).text, /gate=off: the site is OPEN \(front page 200, \/api\/e 200\)/);
  assert.equal(ro.code, 0);
  // the site is open and a required row fails: row 7 blocks too, and says which
  const rb = LC.evaluate(openSite({ sentry: { error: 'no answer' } }));
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
  assert.equal(row(LC.evaluate(openSite({ soak: { missing: true }, analytics: { events: 0 } })), 7).status, 'GO');
  // no gate word yet
  const old = good(); old.live = { text: `${SHA} 2026-10-19T11:00:00.000Z\n` };
  assert.equal(row(LC.evaluate(old), 7).status, 'WARN');
});

test('row 7 gate: an open site with a failing publish (row 8) or backup (row 9) is NO-GO too, and so is every other required row', () => {
  const fail8 = LC.evaluate(openSite({ publish: { text: `${iso(NOW - HOUR)} FAILED: push to origin/master did not go through (timeout)` } }));
  assertBlocks(fail8, 8);
  assertBlocks(fail8, 7);
  assert.match(row(fail8, 7).text, /row 8 is NO-GO/);
  const fail9 = LC.evaluate(openSite({ backup: { error: 'file not found' } }));
  assertBlocks(fail9, 9);
  assertBlocks(fail9, 7);
  assert.match(row(fail9, 7).text, /row 9 is NO-GO/);
  const two = LC.evaluate(openSite({ backup: { error: 'file not found' }, health: { error: 'file not found' } }));
  assert.match(row(two, 7).text, /rows 2, 9 are NO-GO/);
  // the same failure with the gate on leaves row 7 alone
  assert.equal(row(LC.evaluate({ ...good(), backup: { error: 'file not found' } }), 7).status, 'GO');
  // every one of the other required rows counts
  const breaks = { 1: { findings: { error: 'x' } }, 2: { health: { error: 'x' } }, 3: { remote: { sha: 'f'.repeat(40) } }, 5: { analytics: { error: 'x' } }, 6: { sentry: { error: 'x' } } };
  for (const [n, patch] of Object.entries(breaks)) {
    const r = LC.evaluate(openSite(patch));
    assertBlocks(r, +n);
    assertBlocks(r, 7);
  }
});

test('row 7 gate: it asks the RUNNING site, by the doctor\'s rule: gate=on must answer 401, gate=off must answer 200 on / and 200 on /api/e', () => {
  // gate=on in version.txt but the front page is open: the build and the running site disagree (fail open, a rollback, a hidden secret)
  const failOpen = LC.evaluate({ ...good(), site: { rootStatus: 200, apiStatus: null } });
  assertBlocks(failOpen, 7);
  assert.match(row(failOpen, 7).text, /gate=on but the front page answered 200, not 401/);
  assertBlocks(LC.evaluate({ ...good(), site: { rootStatus: 500, apiStatus: null } }), 7);
  assertBlocks(LC.evaluate({ ...good(), site: { rootStatus: 302, apiStatus: null } }), 7);
  // gate=off in version.txt but the front page still asks for a password
  const stillClosed = LC.evaluate(openSite({ site: { rootStatus: 401, apiStatus: 401 } }));
  assertBlocks(stillClosed, 7);
  assert.match(row(stillClosed, 7).text, /gate=off but the front page answered 401, not 200/);
  // gate=off, the pages open, but a password the build could not see still guards the analytics intake
  const api401 = LC.evaluate(openSite({ site: { rootStatus: 200, apiStatus: 401 } }));
  assertBlocks(api401, 7);
  assert.match(row(api401, 7).text, /\/api\/e\) answered 401/);
  // the front page could not be asked: not GO, whatever version.txt says
  const unasked = LC.evaluate({ ...good(), site: { rootStatus: null, apiStatus: null, error: 'no answer in 5 s' } });
  assertBlocks(unasked, 7);
  assert.match(row(unasked, 7).text, /front page https:\/\/voidtv\.net\/ could not be asked/);
  assertBlocks(LC.evaluate({ ...good(), site: undefined }), 7);
  assertBlocks(LC.evaluate({ ...good(), site: null }), 7);
  // gate=off and /api/e could not be asked
  const noApi = LC.evaluate(openSite({ site: { rootStatus: 200, apiStatus: null, apiError: 'no answer in 5 s' } }));
  assertBlocks(noApi, 7);
  assert.match(row(noApi, 7).text, /analytics intake .* could not be asked/);
  // gate=off and /api/e answers something odd (not 200, not 401): the doctor calls that yellow, so it is a warning here, not a block
  const odd = LC.evaluate(openSite({ site: { rootStatus: 200, apiStatus: 500 } }));
  assert.equal(row(odd, 7).status, 'WARN');
  assert.equal(odd.code, 0);
  // when version.txt could not be read the row says it was not checked, and row 3 carries the NO-GO
  const nolive = LC.evaluate({ ...good(), live: { error: 'it answered 500' }, site: null });
  assert.equal(row(nolive, 7).status, 'WARN');
  assertBlocks(nolive, 3);
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
  assert.match(lines, /This only reads, and it never opens the site\./);
  assert.ok(!/It changes nothing/.test(lines), 'with --fresh the quick doctor rewrites health.json, so the printed text must not say nothing changes');
  assert.ok(!/rewrote catalog\/cache\/health\.json/.test(lines), 'without --fresh nothing is rewritten, and the text does not say so');
  const freshLines = LC.render(LC.evaluate(good()), { nowMs: NOW, root: '/made/up', fresh: true }).join('\n');
  assert.match(freshLines, /It ran the quick doctor first, which rewrote catalog\/cache\/health\.json as the doctor always does\./);
  assert.match(lines, /playback pause rate in Sentry/);
  assert.match(lines, /the Cloudflare dashboard \(docs\/DEPLOY\.md, setup steps 1 to 6\)/);
  // the known gaps nobody covers (comparer's gap list: criteria 3, 4, 7 and 9), each with the DEPLOY.md place if there is one
  assert.match(lines, /Not covered by any check yet, here or by hand \(known gaps\):/);
  assert.match(lines, /something outside this PC that watches version\.txt against origin\/master \(nothing covers it\)/);
  assert.match(lines, /a counter of Cloudflare builds against the plan's monthly limit \(nothing counts them; setup step 4 only emails you about a failed build\)/);
  assert.match(lines, /a rehearsed rollback \(docs\/DEPLOY\.md, "Rollback and closing the site again", says it has not been tried\)/);
  assert.match(lines, /analytics volume against the plan's ceiling \(step 10 watches that events arrive; nothing compares the count with the ceiling\)/);
  assert.match(lines, /the kids site gate page and intake, checked live after its merge \(nothing covers it; CF-009 keeps row 1 NO-GO until then\)/);
  assert.ok(lines.indexOf('Verdict:') < lines.indexOf('known gaps'), 'the gaps come after the verdict, with the other notes');
  assert.ok(row(LC.evaluate(openSite()), 7).text.endsWith('and no required row is NO-GO'), 'row 7 does not claim every required row is GO when one is only a WARN');
  assert.ok(!/every required row is GO/.test(row(LC.evaluate(openSite({ analytics: { events: 0 } })), 7).text));
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

test('row 1 findings: an open finding the audit flagged launch_blocking blocks whatever its severity, and is marked in the list', () => {
  const i = good();
  i.findings.items.push(
    { id: 'M-1', severity: 'medium', status: 'open', title: 'a flagged medium', launch_blocking: true },
    { id: 'L-1', severity: 'low', status: 'verified', title: 'a flagged low', launch_blocking: true },
    { id: 'M-2', severity: 'medium', status: 'open', title: 'an unflagged medium', launch_blocking: false },
    { id: 'M-3', severity: 'medium', status: 'fixed', title: 'a flagged medium that is fixed', launch_blocking: true },
    { id: 'M-4', severity: 'medium', status: 'refuted', title: 'a flagged medium that is refuted', launch_blocking: true },
    { id: 'M-5', severity: 'medium', status: 'open', title: 'flag as a word, not a boolean', launch_blocking: 'true' },
  );
  const res = LC.evaluate(i);
  assertBlocks(res, 1);
  assert.match(row(res, 1).text, /^2 open findings block the launch \(2 flagged launch-blocking\): L-1, M-1/);
  const ids = row(res, 1).detail.map((d) => d.split(' ')[0]);
  assert.deepEqual(ids, ['L-1', 'M-1']);
  assert.ok(row(res, 1).detail.every((d) => d.includes('[flagged launch-blocking]')), 'each one is marked');
  // with a critical and a flagged one the text counts both kinds
  i.findings.items.push({ id: 'C-1', severity: 'critical', status: 'open', title: 'a critical' });
  const both = LC.evaluate(i);
  assert.match(row(both, 1).text, /^3 open findings block the launch \(1 critical or high, 2 flagged launch-blocking\): C-1, L-1, M-1/);
  assert.ok(!row(both, 1).detail[0].includes('[flagged'), 'a critical is listed as a critical');
  // none of the extras open: back to GO
  const fine = good();
  fine.findings.items.push({ id: 'M-3', severity: 'medium', status: 'fixed', title: 't', launch_blocking: true }, { id: 'M-2', severity: 'medium', status: 'open', title: 't', launch_blocking: false });
  assert.equal(row(LC.evaluate(fine), 1).status, 'GO');
  assert.match(row(LC.evaluate(good()), 1).text, /none flagged launch-blocking \(2 other open findings, not blocking\)/);
});

test('the findings reader carries the launch_blocking flag through', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lc-'));
  try {
    const file = path.join(dir, 'findings.json');
    fs.writeFileSync(file, JSON.stringify({ findings: [{ id: 'A-1', severity: 'medium', status: 'open', title: 'one', launch_blocking: true }, { id: 'A-2', severity: 'medium', status: 'open', title: 'two' }, { id: 'A-3', severity: 'high', status: 'fixed', title: 'three', launch_blocking: true }] }));
    const got = LC.collectFindings(file);
    assert.deepEqual(got.items.map((x) => x.launch_blocking), [true, false, true]);
    const res = LC.evaluate({ ...good(), findings: got });
    assert.deepEqual(row(res, 1).detail.map((d) => d.split(' ')[0]), ['A-1']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('row 2 with --fresh: the result must have been written after the run started, so a crashed doctor cannot hand back an older file', () => {
  const started = NOW - 2 * MIN;
  const older = good(); older.fresh = { ran: true, startedMs: started }; older.health.data.at = iso(NOW - 5 * MIN);
  const r1 = LC.evaluate(older);
  assertBlocks(r1, 2);
  assert.match(row(r1, 2).text, /health\.json is still the older result/);
  assert.match(row(r1, 2).text, /may have crashed/);
  assert.match(row(r1, 2).fix, /node scripts\/doctor\.js --quick/);
  const written = good(); written.fresh = { ran: true, startedMs: started }; written.health.data.at = iso(NOW - 1 * MIN);
  const r2 = LC.evaluate(written);
  assert.equal(row(r2, 2).status, 'GO');
  assert.match(row(r2, 2).text, /just run/);
  const exact = good(); exact.fresh = { ran: true, startedMs: started }; exact.health.data.at = iso(started);
  assert.equal(row(LC.evaluate(exact), 2).status, 'GO', 'written at the very start of the run is accepted');
  const justBefore = good(); justBefore.fresh = { ran: true, startedMs: started }; justBefore.health.data.at = iso(started - 1);
  assertBlocks(LC.evaluate(justBefore), 2);
  // without --fresh the same older file is fine while it is under 30 minutes
  assert.equal(row(LC.evaluate(good()), 2).status, 'GO');
  // a red light in a file the run did write still blocks
  const red = good(); red.fresh = { ran: true, startedMs: started }; red.health.data.at = iso(NOW - MIN); red.health.data.checks.push({ id: 'backup', level: 'red', msg: 'never backed up', fix: 'x' });
  assertBlocks(LC.evaluate(red), 2);
});

test('row 2 wording: a green doctor does not claim rows 3 to 7 cover the network lights, and a yellow one says yellow does not block', () => {
  const g = row(LC.evaluate(good()), 2).text;
  assert.ok(!/rows 3 to 7/.test(g));
  assert.match(g, /rows 3, 4 and 7 cover live, files and gate/);
  assert.match(g, /www, headers and live:missing-files are in no row/);
  assert.match(g, /steps 7 and 8/);
  const y = good(); y.health.data.checks.push({ id: 'cache', level: 'yellow', msg: 'big' });
  assert.match(row(LC.evaluate(y), 2).fix, /yellow light does not block the launch \(only red does\)/);
});

// ---- the collectors, fed made-up fetch and run functions ----
function fakeFetch(answers, calls) {
  return async (url, init) => {
    const method = (init && init.method) || 'GET';
    calls.push({ url, method, init });
    const a = answers[`${method} ${url}`] !== undefined ? answers[`${method} ${url}`] : answers[url];
    if (a === undefined) throw new Error('unexpected request ' + method + ' ' + url);
    if (a instanceof Error) throw a;
    return { status: a.status, text: async () => a.body || '', body: null };
  };
}
const timeoutError = () => Object.assign(new Error('timed out'), { name: 'TimeoutError' });

test('collectLive: version.txt must answer 200 with a body; any other answer, a redirect or a timeout is an error; only voidtv.net is asked, with no redirects followed', async () => {
  const calls = [];
  const ok = await LC.collectLive({ fetch: fakeFetch({ 'https://voidtv.net/version.txt': { status: 200, body: versionText() } }, calls) });
  assert.equal(ok.text, versionText());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://voidtv.net/version.txt');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.ok(calls[0].init.signal, 'a time limit is set');
  for (const status of [500, 404, 401, 301, 302, 204]) {
    const bad = await LC.collectLive({ fetch: fakeFetch({ 'https://voidtv.net/version.txt': { status, body: versionText() } }, []) });
    assert.ok(bad.error && !bad.text, `status ${status} must be an error, not a body`);
    assert.match(bad.error, new RegExp('it answered ' + status));
  }
  const slow = await LC.collectLive({ fetch: fakeFetch({ 'https://voidtv.net/version.txt': timeoutError() }, []) });
  assert.match(slow.error, /no answer in 5 s/);
  const down = await LC.collectLive({ fetch: fakeFetch({ 'https://voidtv.net/version.txt': Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }) }, []) });
  assert.match(down.error, /ENOTFOUND/);
  // what the collector returns for a bad answer turns row 3 into a NO-GO
  const bad = await LC.collectLive({ fetch: fakeFetch({ 'https://voidtv.net/version.txt': { status: 500, body: 'oops' } }, []) });
  assertBlocks(LC.evaluate({ ...good(), live: bad }), 3);
});

test('collectSite: HEAD / always; GET /api/e only when version.txt says gate=off; a failed request leaves the status null', async () => {
  const on = [], off = [];
  const siteOn = await LC.collectSite({ text: versionText() }, { fetch: fakeFetch({ 'HEAD https://voidtv.net/': { status: 401 } }, on) });
  assert.deepEqual(siteOn, { rootStatus: 401, apiStatus: null });
  assert.deepEqual(on.map((c) => `${c.method} ${c.url}`), ['HEAD https://voidtv.net/']);
  const siteOff = await LC.collectSite({ text: OPEN_VERSION }, { fetch: fakeFetch({ 'HEAD https://voidtv.net/': { status: 200 }, 'GET https://voidtv.net/api/e': { status: 200 } }, off) });
  assert.deepEqual(siteOff, { rootStatus: 200, apiStatus: 200 });
  assert.deepEqual(off.map((c) => `${c.method} ${c.url}`), ['HEAD https://voidtv.net/', 'GET https://voidtv.net/api/e']);
  assert.ok(off.every((c) => c.init.redirect === 'manual'));
  const failed = await LC.collectSite({ text: OPEN_VERSION }, { fetch: fakeFetch({ 'HEAD https://voidtv.net/': timeoutError(), 'GET https://voidtv.net/api/e': { status: 401 } }, []) });
  assert.equal(failed.rootStatus, null);
  assert.match(failed.error, /no answer in 5 s/);
  assert.equal(failed.apiStatus, 401);
  assert.equal(await LC.collectSite({ error: 'it answered 500' }, { fetch: fakeFetch({}, []) }), null, 'no version.txt, nothing to ask');
  // what the collector returns drives row 7
  assertBlocks(LC.evaluate({ ...good(), site: failed, live: { text: OPEN_VERSION } }), 7);
});

test('collectRemote: github.com only, the ls-remote answer must be a 40 character commit on refs/heads/master; junk, a wrong ref, a timeout or a failure is an error', async () => {
  const SHA40 = 'abcdef0123456789abcdef0123456789abcdef01';
  const make = (urlOut, lsOut) => { const calls = []; return { calls, run: async (cmd, args) => { calls.push([cmd, ...args]); if (args[0] === 'remote') return urlOut; return lsOut; } }; };
  const good1 = make({ err: null, stdout: 'https://github.com/bryankorth31/void-channel.git\n' }, { err: null, stdout: `${SHA40}\trefs/heads/master\n` });
  assert.deepEqual(await LC.collectRemote({ run: good1.run }), { sha: SHA40 });
  assert.deepEqual(good1.calls.map((c) => c.slice(0, 3).join(' ')), ['git remote get-url', 'git ls-remote origin']);
  assert.ok(good1.calls[1].includes('refs/heads/master'));
  assert.deepEqual(await LC.collectRemote({ run: make({ err: null, stdout: 'git@github.com:bryankorth31/void-channel.git\n' }, { err: null, stdout: `${SHA40}\trefs/heads/master\n` }).run }), { sha: SHA40 }, 'the ssh form is github.com too');
  for (const junk of ['garbage', '', 'not-a-commit\trefs/heads/master', `${SHA40.slice(0, 20)}\trefs/heads/master`, `${SHA40}\trefs/heads/other`, `${SHA40}`, '<html>proxy error</html>']) {
    const r = await LC.collectRemote({ run: make({ err: null, stdout: 'https://github.com/a/b.git\n' }, { err: null, stdout: junk }).run });
    assert.ok(r.error && !r.sha, `ls-remote output ${JSON.stringify(junk)} must be an error`);
  }
  const timedOut = await LC.collectRemote({ run: make({ err: null, stdout: 'https://github.com/a/b.git\n' }, { err: Object.assign(new Error('x'), { killed: true }), stdout: '', stderr: '' }).run });
  assert.match(timedOut.error, /no answer in 5 s/);
  const failed = await LC.collectRemote({ run: make({ err: null, stdout: 'https://github.com/a/b.git\n' }, { err: new Error('x'), stdout: '', stderr: 'fatal: unable to access' }).run });
  assert.match(failed.error, /unable to access/);
  // another host, or lookalikes of github.com, are never contacted: ls-remote is not even run
  for (const url of ['https://evil.com/github.com/x.git', 'https://github.com.evil.com/x.git', 'https://github.com@evil.com/x.git', 'git@evil.com:github.com/x.git', 'https://gitlab.com/a/b.git', 'C:/some/folder']) {
    const m = make({ err: null, stdout: url + '\n' }, { err: null, stdout: `${SHA40}\trefs/heads/master\n` });
    const r = await LC.collectRemote({ run: m.run });
    assert.match(r.error, /not on github\.com/, url);
    assert.equal(m.calls.length, 1, 'only the local "remote get-url" ran for ' + url);
  }
  assert.match((await LC.collectRemote({ run: make({ err: new Error('x'), stdout: '' }, {}).run })).error, /no git remote named origin/);
  // a wrong answer drives row 3
  assertBlocks(LC.evaluate({ ...good(), remote: { error: 'GitHub did not name a master commit' } }), 3);
});

test('collectSentry: asks the loader for the key found in app.js; no key means the front door and keyFound false; a HEAD refused with 405 is retried as a small GET', async () => {
  const KEY = '0123456789abcdef0123456789abcdef';
  const src = `const SENTRY_KEY = PROFILE.name === 'voidtv' ? '${KEY}' : '';\n`;
  const calls = [];
  const withKey = await LC.collectSentry({ appSource: src, fetch: fakeFetch({ [`HEAD https://js.sentry-cdn.com/${KEY}.min.js`]: { status: 200 } }, calls) });
  assert.deepEqual(withKey, { status: 200, keyFound: true });
  assert.equal(calls.length, 1);
  const noKey = await LC.collectSentry({ appSource: 'const nothing = 1;', fetch: fakeFetch({ 'HEAD https://js.sentry-cdn.com/': { status: 204 } }, []) });
  assert.deepEqual(noKey, { status: 204, keyFound: false });
  assert.equal(row(LC.evaluate({ ...good(), sentry: noKey }), 6).status, 'WARN');
  const c405 = [];
  const retried = await LC.collectSentry({ appSource: src, fetch: fakeFetch({ [`HEAD https://js.sentry-cdn.com/${KEY}.min.js`]: { status: 405 }, [`GET https://js.sentry-cdn.com/${KEY}.min.js`]: { status: 200 } }, c405) });
  assert.deepEqual(retried, { status: 200, keyFound: true });
  assert.equal(c405[1].method, 'GET');
  assert.equal(c405[1].init.headers.range, 'bytes=0-0');
  const gone = await LC.collectSentry({ appSource: src, fetch: fakeFetch({ [`HEAD https://js.sentry-cdn.com/${KEY}.min.js`]: timeoutError() }, []) });
  assert.match(gone.error, /no answer in 5 s/);
  const notFound = await LC.collectSentry({ appSource: src, fetch: fakeFetch({ [`HEAD https://js.sentry-cdn.com/${KEY}.min.js`]: { status: 404 } }, []) });
  assertBlocks(LC.evaluate({ ...good(), sentry: notFound }), 6);
  // the real app.js still has the line the reader looks for (the request goes to a made-up fetch, never the network)
  const realCalls = [];
  const realRun = await LC.collectSentry({ fetch: async (url) => { realCalls.push(url); return { status: 200, body: null }; } });
  assert.equal(realRun.keyFound, true, 'scripts/lib/app.js has no readable SENTRY_KEY line any more: update collectSentry');
  assert.match(realCalls[0], /^https:\/\/js\.sentry-cdn\.com\/[0-9a-f]{16,64}\.min\.js$/);
});

test('collectHealth with --fresh: the doctor is run once with --quick; a doctor that writes nothing new is caught by row 2, one that writes a new file is accepted', async () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lc-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'catalog', 'cache'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts', 'doctor.js'), '// stands in for the doctor\n');
    const healthFile = path.join(dir, 'catalog', 'cache', 'health.json');
    const oldHealth = { at: iso(NOW - 5 * MIN), level: 'green', checks: [{ id: 'publish', level: 'green', msg: 'ok' }] };
    fs.writeFileSync(healthFile, JSON.stringify(oldHealth));
    // a doctor that crashes: exit code 1, writes nothing
    const calls = [];
    const crash = await LC.collectHealth(dir, true, { now: () => NOW, run: async (cmd, args) => { calls.push(args); return { err: Object.assign(new Error('Command failed'), { code: 1 }), stdout: '', stderr: 'TypeError: x' }; } });
    assert.deepEqual(calls.map((a) => a.slice(1)), [['--quick']]);
    assert.equal(crash.fresh.ran, true);
    assert.equal(crash.fresh.startedMs, NOW);
    assert.equal(crash.fresh.error, undefined, 'exit code 1 is a red light or a crash: the file decides, not the code');
    const rCrash = LC.evaluate({ ...good(), health: crash.health, fresh: crash.fresh });
    assertBlocks(rCrash, 2);
    assert.match(row(rCrash, 2).text, /older result/);
    // a doctor that writes a new file
    const ok = await LC.collectHealth(dir, true, { now: () => NOW, run: async () => { fs.writeFileSync(healthFile, JSON.stringify({ ...oldHealth, at: iso(NOW + 1000) })); return { err: null, stdout: '', stderr: '' }; } });
    const rOk = LC.evaluate({ ...good(), health: ok.health, fresh: ok.fresh });
    assert.equal(row(rOk, 2).status, 'GO');
    // a doctor that is killed, and one that is not there
    const killed = await LC.collectHealth(dir, true, { now: () => NOW, run: async () => ({ err: Object.assign(new Error('x'), { killed: true }), stdout: '', stderr: '' }) });
    assert.match(killed.fresh.error, /over 3 minutes/);
    assertBlocks(LC.evaluate({ ...good(), health: killed.health, fresh: killed.fresh }), 2);
    const empty = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lc-'));
    try {
      const none = await LC.collectHealth(empty, true, { now: () => NOW, run: async () => ({ err: null }) });
      assert.match(none.fresh.error, /no scripts\/doctor\.js/);
      assertBlocks(LC.evaluate({ ...good(), health: none.health, fresh: none.fresh }), 2);
    } finally { fs.rmSync(empty, { recursive: true, force: true }); }
    // without --fresh the doctor is not run at all and the file is read as it is
    fs.writeFileSync(healthFile, JSON.stringify(oldHealth));
    const noRun = await LC.collectHealth(dir, false, { now: () => NOW, run: async () => { throw new Error('must not run'); } });
    assert.equal(noRun.fresh, null);
    assert.equal(noRun.health.data.at, oldHealth.at);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the file readers (publish.log, backup-stamp.json, soak.json, health.json) on files shaped like the real ones', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lc-'));
  try {
    const cache = path.join(dir, 'catalog', 'cache');
    fs.mkdirSync(cache, { recursive: true });
    // publish.log as scripts/publish.js writes it: dated lines, git noise, CRLF
    const log = [
      `${iso(NOW - 30 * HOUR)} pushed f1e7c603c: Catalog: 4790 shows, 48424 episodes (12 files)`,
      'warning: in the working copy of x, LF will be replaced by CRLF the next time Git touches it',
      `${iso(NOW - 2 * HOUR)} held: 31 other commits waiting: Doctor: page-guards light | Merge fix batch B (not pushed; run with --allow-other-commits to push them with the catalog)`,
      `${iso(NOW - 10 * MIN)} nothing new`,
    ].join('\r\n') + '\r\n';
    fs.writeFileSync(path.join(cache, 'publish.log'), log);
    const pub = LC.collectPublish(dir);
    assert.equal(pub.text, log);
    const r8 = row(LC.evaluate({ ...good(), publish: pub }), 8);
    assert.equal(r8.status, 'GO');
    assert.match(r8.text, /"nothing new" 10 min ago/);
    // backup-stamp.json as scripts/backup-cache.js writes it
    const stamp = { at: iso(NOW - 10 * DAY), from: 'C:\\x\\catalog\\cache', to: 'C:\\x-backups\\cache', sets: { tvmaze: { files: 2992, bytes: 32882110 } }, files: 89687, bytes: 2481634305, copied: 89687, copiedBytes: 2481634305, unchanged: 0, failed: 0, failedNames: [], dry: false };
    fs.writeFileSync(path.join(cache, 'backup-stamp.json'), JSON.stringify(stamp, null, 1) + '\n');
    const bk = LC.collectBackup(dir);
    assert.equal(bk.stamp.files, 89687);
    assertBlocks(LC.evaluate({ ...good(), backup: bk }), 9);
    fs.writeFileSync(path.join(cache, 'backup-stamp.json'), JSON.stringify({ ...stamp, at: iso(NOW - HOUR) }));
    assert.equal(row(LC.evaluate({ ...good(), backup: LC.collectBackup(dir) }), 9).status, 'GO');
    // soak.json: absent is "missing", present is read
    assert.deepEqual(LC.collectSoak(dir), { missing: true });
    fs.writeFileSync(path.join(cache, 'soak.json'), JSON.stringify({ at: iso(NOW - HOUR), durationMs: 2.2 * 3600e3, longestPauseMs: 4100, stallMs: 9000, rebufferRatio: 0.002 }));
    assert.equal(LC.collectSoak(dir).data.longestPauseMs, 4100);
    assert.equal(row(LC.evaluate({ ...good(), soak: LC.collectSoak(dir) }), 10).status, 'WARN');
    fs.writeFileSync(path.join(cache, 'soak.json'), '{ not json');
    assert.match(LC.collectSoak(dir).error, /not valid JSON/);
    // missing files become errors the rows turn into NO-GO or WARN, never a crash
    const bare = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lc-'));
    try {
      assert.match(LC.collectPublish(bare).error, /file not found/);
      assert.match(LC.collectBackup(bare).error, /file not found/);
      assert.deepEqual(LC.collectSoak(bare), { missing: true });
      assert.equal(row(LC.evaluate({ ...good(), publish: LC.collectPublish(bare) }), 8).status, 'WARN');
      assertBlocks(LC.evaluate({ ...good(), backup: LC.collectBackup(bare) }), 9);
    } finally { fs.rmSync(bare, { recursive: true, force: true }); }
    fs.writeFileSync(path.join(cache, 'backup-stamp.json'), '[1,');
    assert.match(LC.collectBackup(dir).error, /not valid JSON/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('collectAll: every part of the picture comes from its own source, so a faked part shows up as a wrong verdict', async () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lc-'));
  try {
    const cache = path.join(dir, 'catalog', 'cache');
    fs.mkdirSync(cache, { recursive: true });
    fs.mkdirSync(path.join(dir, 'audit'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'audit', 'findings.json'), JSON.stringify({ findings: [{ id: 'A-1', severity: 'high', status: 'fixed', title: 'done' }, { id: 'A-2', severity: 'medium', status: 'open', title: 'open medium' }] }));
    fs.writeFileSync(path.join(cache, 'health.json'), JSON.stringify({ at: iso(NOW - 3 * MIN), level: 'green', checks: [{ id: 'publish', level: 'green', msg: 'ok' }] }));
    fs.writeFileSync(path.join(cache, 'publish.log'), `${iso(NOW - 20 * MIN)} FAILED: push to origin/master did not go through (timeout)\n`);
    fs.writeFileSync(path.join(cache, 'backup-stamp.json'), JSON.stringify({ at: iso(NOW - 10 * DAY), files: 5, bytes: 5, failed: 0 }));
    const KEY = '0123456789abcdef0123456789abcdef';
    const calls = [];
    const net = fakeFetch({
      'https://voidtv.net/version.txt': { status: 200, body: versionText() },
      'HEAD https://voidtv.net/': { status: 401 },
      [`HEAD https://js.sentry-cdn.com/${KEY}.min.js`]: { status: 200 },
    }, calls);
    const run = async (cmd, args) => (args[0] === 'remote' ? { err: null, stdout: 'https://github.com/bryankorth31/void-channel.git\n' } : { err: null, stdout: `${SHA}\trefs/heads/master\n` });
    const deps = { fetch: net, run, now: () => NOW, appSource: `const SENTRY_KEY = PROFILE.name === 'voidtv' ? '${KEY}' : '';`, analytics: async () => ({ events: 7 }) };
    const { inputs } = await LC.collectAll({ root: dir, fresh: false }, deps);
    assert.equal(inputs.nowMs, NOW);
    assert.equal(inputs.live.text, versionText());
    assert.deepEqual(inputs.site, { rootStatus: 401, apiStatus: null });
    assert.deepEqual(inputs.remote, { sha: SHA });
    assert.deepEqual(inputs.analytics, { events: 7 });
    assert.deepEqual(inputs.sentry, { status: 200, keyFound: true });
    assert.match(inputs.publish.text, /FAILED: push to origin/);
    assert.equal(inputs.backup.stamp.files, 5);
    assert.deepEqual(inputs.soak, { missing: true });
    assert.equal(inputs.fresh, null);
    // the verdict follows the files: the failed publish (row 8) and the 10 day old backup (row 9) block, nothing else does
    const res = LC.evaluate(inputs);
    assert.deepEqual(res.blocking, [8, 9]);
    assert.equal(res.code, 1);
    assert.equal(row(res, 3).status, 'GO');
    assert.equal(row(res, 7).status, 'GO');
    assert.ok(calls.every((c) => /^https:\/\/(voidtv\.net|js\.sentry-cdn\.com)\//.test(c.url)), 'only the listed hosts were asked');
    // a made-up commit on the GitHub side shows up as a mismatch
    const other = await LC.collectAll({ root: dir, fresh: false }, { ...deps, run: async (cmd, args) => (args[0] === 'remote' ? { err: null, stdout: 'https://github.com/a/b.git\n' } : { err: null, stdout: `${'e'.repeat(40)}\trefs/heads/master\n` }) });
    assertBlocks(LC.evaluate(other.inputs), 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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
  // the wording the reviewer asked for
  assert.ok(!/last lines say `Verdict: GO/.test(doc), 'the verdict line is followed by notes, so "the last lines" is wrong');
  assert.match(doc, /the line that starts `Verdict:` says GO/);
  assert.match(doc, /make sure setup steps 1 to 6 above are done/i);
  assert.match(doc, /the launch check cannot see the Cloudflare dashboard/);
  assert.match(doc, /If only row 3 is NO-GO[^.]*wait two minutes and run it again/);
  assert.match(doc, /A yellow light in the doctor is a WARN too: only a red light blocks/);
  assert.match(doc, /flagged launch-blocking/);
  assert.ok(!/It changes nothing and cannot open/.test(doc), 'with --fresh the doctor rewrites health.json');
  assert.match(doc, /the one thing that writes is `--fresh`/);
  // dashboard clicks and labels nobody has seen on the screen carry one short tag, explained once at the top of "Opening day"
  const TAG = '(not yet checked on screen)';
  const opening = doc.slice(doc.indexOf('## Opening day'));
  assert.ok(opening.slice(0, 1200).includes('Where a line carries the tag `' + TAG + '`'), 'the tag is explained at the top of Opening day');
  assert.match(opening.slice(0, 1200), /tick it off when you have seen it on the screen/);
  const tagged = (needle) => doc.split(/\r?\n/).filter((l) => l.includes(needle)).every((l) => l.includes(TAG));
  for (const needle of ['> Retry deployment', 'Open the account\'s Billing page', 'whether a rolled-back build runs with the password variables', 'Notifications > Add', 'A changed variable is picked up by the next build', 'The free plan allows one rule', 'so it should keep the path', 'add a variable of type **Text**', 'type Text (not yet', 'as type Text (not yet']) {
    assert.ok(doc.includes(needle), 'the doc still has: ' + needle);
    if (needle.endsWith('(not yet')) continue; // the two type-name places are checked by the next lines
    assert.ok(tagged(needle), 'the line with "' + needle + '" carries the tag ' + TAG);
  }
  assert.ok(doc.split(/\r?\n/).filter((l) => /Retry deployment/.test(l)).every((l) => l.includes(TAG)), 'every Retry deployment carries the tag');
  assert.ok(!/\(not yet checked on screen[;:,]/.test(doc), 'the tag is written one way everywhere');
  assert.match(doc, /a HEAD on `https:\/\/voidtv\.net\/` and, for `gate=off`, a GET on `\/api\/e`/);
});
