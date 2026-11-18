// "Enjoying voidtv.net? Yes, I am" (B, 18 Nov 2026): one button, asked after a while of watching, a footer link, a count in HQ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'scripts/lib/app.js'), 'utf8');
const HQ = fs.readFileSync(path.join(ROOT, 'scripts/hq.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(ROOT, 'scripts/hq/index.html'), 'utf8');

test('one button only: Yes, I am, and no "Not really"', () => {
  assert.ok(APP.includes("y.textContent='Yes, I am'"));
  assert.ok(!/textContent='Not really/i.test(APP), 'no second button');
});

test('asked only after 10 minutes this visit or an episode played to its end, at most once in 30 days, and only on voidtv.net', () => {
  assert.ok(APP.includes('(!ended&&ENJOY_W<10)'));
  assert.ok(APP.includes('30*864e5'));
  assert.ok(APP.includes("const ENJOY_ON=${PROFILE.name === 'voidtv'}"), 'off on Kids and every other profile');
  assert.ok(APP.includes("'voidtv:enjoy'].includes(k)"), 'the old-key sweep keeps the once-a-month mark');
});

test('a tap sends one anonymous act event with x enjoy, and the thanks carries the CASH donation line from the project setting', () => {
  assert.ok(APP.includes("track('act',{slug:slug||'',x:'enjoy'})"));
  assert.ok(APP.includes('If you found this service helpful, please think of donating to keep it running and to make more services like this possible.'));
  assert.ok(APP.includes('a.href=DONATE'));
});

test('HQ counts the taps: an enjoy report and a card on Analytics', () => {
  assert.ok(/cfa\.REPORTS\.enjoy = .*blob1 = 'act' AND blob14 = 'enjoy'/.test(HQ));
  assert.ok(PAGE.includes("'enjoy'].map(get)") && PAGE.includes('said they enjoy it'));
});
