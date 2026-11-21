// The doctor's "phones" light (scripts/lib/phonecheck.js): the phone controller's relay, checked without a browser, so
// Bryan can see from HQ that phones can connect, nothing is dropped and a room comes back to the next page.
// Run: node --test tests/phone-check.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const PC = require('../scripts/lib/phonecheck');
const freePort = () => new Promise((ok) => { const srv = require('net').createServer(); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => ok(p)); }); });

test('the light and its words, from the numbers: green, the three yellows, red, and a fix Bryan can do by hand each time', () => {
  const good = { opened: true, joined: true, sent: 100, arrived: 100, lost: 0, least: 34, median: 46, most: 81, handover: true };
  const g = PC.classify(good);
  assert.equal(g.level, 'green'); assert.equal(g.fix, undefined);
  assert.equal(g.msg, 'a room opened, a phone joined, 100 of 100 pad states arrived at 50 a second, 46 ms typical (34 to 81), and the room came back to the next page');
  // What happened on 20 Nov 2026: 13 of 100 dropped at the old limit.
  const dropped = PC.classify(Object.assign({}, good, { arrived: 87, lost: 13 }));
  assert.equal(dropped.level, 'yellow'); assert.match(dropped.msg, /dropped 13 of 100 pad states/); assert.match(dropped.fix, /npx wrangler deploy/);
  const lostRoom = PC.classify(Object.assign({}, good, { handover: false }));
  assert.equal(lostRoom.level, 'yellow'); assert.match(lostRoom.msg, /did not come back to the next page/); assert.match(lostRoom.fix, /from the game page itself/);
  const slow = PC.classify(Object.assign({}, good, { median: 240, most: 600 }));
  assert.equal(slow.level, 'yellow'); assert.match(slow.msg, /slow from this PC: 240 ms typical/); assert.match(slow.fix, /Direct/);
  for (const bad of [{ opened: false, joined: false, why: 'the relay refused the connection' }, { opened: true, joined: false, why: 'a phone joined but the relay did not seat it' }]) {
    const c = PC.classify(bad);
    assert.equal(c.level, 'red'); assert.ok(c.msg.includes(bad.why)); assert.match(c.fix, /voidtv-rooms/);
  }
  assert.equal(PC.classify({ cannot: true, why: 'x' }).level, 'yellow');
  // A relay that keeps no room across pages (no key) is not blamed for the hand-over.
  assert.equal(PC.classify(Object.assign({}, good, { handover: null })).level, 'green');
  const dash = new RegExp('[' + String.fromCharCode(8212, 8211) + ']');
  for (const c of [g, dropped, lostRoom, slow]) assert.ok(!dash.test(c.msg + (c.fix || '')), 'no long dash in the words');
});

test('against the real relay code (the local PLAY server): everything arrives and the room comes back; a dead address is red', async () => {
  const port = await freePort();
  const srv = spawn(process.execPath, [path.join(ROOT, 'play', 'serve.js'), String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((ok) => srv.stdout.once('data', ok));
    const r = await PC.phoneCheck('http://127.0.0.1:' + port, { states: 40 });
    assert.deepEqual([r.opened, r.joined, r.sent, r.arrived, r.lost, r.handover], [true, true, 40, 40, 0, true], JSON.stringify(r));
    assert.ok(r.median >= 0 && r.median < 100, 'a delay is measured');
    assert.equal(PC.classify(r).level, 'green');
  } finally { srv.kill(); }
  const dead = await PC.phoneCheck('http://127.0.0.1:' + (await freePort()));
  assert.equal(dead.opened, false);
  assert.equal(PC.classify(dead).level, 'red');
});

test('the doctor has the light, only for voidtv.net itself, and the runbook says what to do and how to try a real phone', () => {
  const doctor = fs.readFileSync(path.join(ROOT, 'scripts', 'doctor.js'), 'utf8'), book = fs.readFileSync(path.join(ROOT, 'docs', 'RUNBOOK.md'), 'utf8');
  assert.ok(doctor.includes("if (PROFILE.name === 'voidtv') {\n      try { const pc = require('./lib/phonecheck'); const c = pc.classify(await pc.phoneCheck(PROFILE.domain)); add('phones', c.level, c.msg, c.fix); }"));
  assert.ok(book.includes('| phones | '));
  for (const bit of ['## The phone as a game pad, on a real phone', '**Direct N ms**', '**Relay N ms**', '&direct=0', 'node scripts/lib/phonecheck.js', 'npx wrangler deploy']) assert.ok(book.includes(bit), bit);
});
