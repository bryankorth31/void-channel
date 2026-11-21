// Brave steps (profiles/kids/docs/BRAVE-STEPS.md): the ladders, the words, and that nothing leaves the device.
const test = require('node:test');
const assert = require('node:assert');
const B = require('../lib/brave/ladders');
const { page, allLines } = require('../lib/brave/build');
const W = require('../lib/village/world');

test('every ladder has five small steps, and its Village practice places exist', () => {
  assert.ok(B.LADDERS.length >= 6);
  for (const l of B.LADDERS) {
    assert.equal(l.steps.length, 5, l.id);
    for (const s of l.steps) if (typeof s !== 'string') assert.ok(W.PLACES[s.village], l.id + ': ' + s.village);
  }
});

test('the words are calm: no scores, no rushing, no "wrong", no em dashes; and they say when to get help', () => {
  const all = B.allLines().join(' ');
  for (const w of ['point', 'coin', 'prize', 'reward', 'level', 'streak', 'hurry', 'wrong', 'fail', 'lose', 'therapy']) assert.ok(!new RegExp('\\b' + w, 'i').test(all), w);
  assert.ok(!/—/.test(all));
  assert.match(B.GROWNUP.join(' '), /doctor or a counselor/);
  assert.match(B.GROWNUP.join(' '), /I know this is hard, and I know you can handle it/);
});

test('a worry that got smaller has its own spoken line for every pair', () => {
  const lines = Object.values(allLines());
  for (let a = 1; a < B.METER.length; a++) for (let b = 0; b < a; b++) assert.ok(lines.includes(B.smaller(a, b)));
});

test('the page sends nothing: no network calls, progress in this browser only', () => {
  const html = page({}, false);
  for (const bad of ['fetch(', 'sendBeacon', 'XMLHttpRequest', '/api/']) assert.ok(!html.includes(bad), bad);
  assert.match(html, /localStorage/);
});
