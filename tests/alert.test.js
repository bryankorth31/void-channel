// Tests for scripts/lib/alertmsg.js: when the nightly alert tells Bryan something, and what it says (B, 15 Nov 2026).
// Run: node --test tests/alert.test.js. Pure: made-up doctor results, nothing is sent.
const test = require('node:test');
const assert = require('node:assert/strict');
const { decide } = require('../scripts/lib/alertmsg');

const H = 36e5, NOW = Date.parse('2026-11-15T08:45:00Z');
const health = (...checks) => ({ checks: checks.map(([id, level, msg, fix]) => ({ id, level, msg: msg || id + ' message', fix })) });

test('a quiet night sends nothing', () => {
  const d = decide(health(['publish', 'green'], ['backup', 'green']), null, NOW);
  assert.equal(d.send, false);
  assert.equal(d.state.alerted, false);
});

test('a red light alerts at once, with what to do', () => {
  const d = decide(health(['unpushed', 'red', '21 Catalog commits waiting', 'node scripts/publish.js'], ['backup', 'green']), null, NOW);
  assert.equal(d.send, true);
  assert.equal(d.kind, 'red');
  assert.equal(d.title, 'VOIDtv needs you: 1 red');
  assert.match(d.body, /RED unpushed: 21 Catalog commits waiting\n {2}Do: node scripts\/publish\.js/);
});

test('a yellow light waits until it has stayed through three nightly runs', () => {
  const h = health(['backup', 'yellow', 'last backup 26 days ago']);
  const first = decide(h, null, NOW);
  assert.equal(first.send, false, 'new yellow: wait');
  const second = decide(h, first.state, NOW + 24 * H);
  assert.equal(second.send, false);
  const third = decide(h, second.state, NOW + 48 * H);
  assert.equal(third.send, true);
  assert.equal(third.title, 'VOIDtv needs you: 1 yellow');
  assert.match(third.body, /YELLOW backup \(2 days\)/);
});

test('a light that goes green resets its clock', () => {
  const a = decide(health(['backup', 'yellow']), null, NOW);
  const b = decide(health(['backup', 'green']), a.state, NOW + 24 * H);
  assert.equal(b.state.since.backup, undefined);
  const c = decide(health(['backup', 'yellow']), b.state, NOW + 48 * H);
  assert.equal(c.send, false, 'yellow again counts from today');
});

test('quiet lights never alert, even red', () => {
  const d = decide(health(['tv:schedule', 'red'], ['cache', 'yellow']), { since: { cache: '2026-11-01T00:00:00Z' } }, NOW, ['tv:schedule', 'cache']);
  assert.equal(d.send, false);
  assert.equal(decide(health(['tv:schedule', 'yellow']), { since: { 'tv:schedule': '2026-11-01T00:00:00Z' } }, NOW).send, false, 'tv:schedule is quiet by default');
});

test('one all-clear after an alert, then silence', () => {
  const alert = decide(health(['unpushed', 'red']), null, NOW);
  const clear = decide(health(['unpushed', 'green']), alert.state, NOW + 24 * H);
  assert.equal(clear.send, true);
  assert.equal(clear.kind, 'clear');
  assert.equal(decide(health(['unpushed', 'green']), clear.state, NOW + 48 * H).send, false);
});

test('reds come before yellows and long text is cut', () => {
  const d = decide(health(['backup', 'yellow', 'x'.repeat(500)], ['publish', 'red', 'held']), { since: { backup: '2026-11-01T00:00:00Z' } }, NOW);
  assert.equal(d.title, 'VOIDtv needs you: 1 red, 1 yellow');
  assert.ok(d.body.indexOf('RED publish') < d.body.indexOf('YELLOW backup'));
  assert.ok(!d.body.includes('x'.repeat(200)));
});
