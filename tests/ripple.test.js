// The daily ripple on the home rows (scripts/lib/app.js; decision H17).
// Bryan, 26 Nov 2026: "i dont want the static stalesness ... a ripple that acts upon things to gently change whats seen", then "go pls".
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const APP = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'app.js'), 'utf8');
const line = (name) => { const m = APP.match(new RegExp('^function ' + name + '\\(.*$', 'm')); assert.ok(m, name + ' is in app.js'); return m[0]; };
const ctx = {};
vm.createContext(ctx);
vm.runInContext(line('ripHash') + '\n' + line('rippleDay') + '\n' + line('ripple') + '\nthis.ripple = ripple; this.rippleDay = rippleDay;', ctx);
const row = (n) => Array.from({ length: n }, (_, i) => ({ slug: 'show-' + i }));
const order = (list, key, day) => Array.from(ctx.ripple(list, key, day), (s) => +s.slug.slice(5));

test('H17: the best known lead every day, the rest drift gently, and nothing is added or lost', () => {
  const list = row(40);
  for (let day = 750000; day < 750060; day++) {
    const o = order(list, 'type:Animated', day);
    assert.deepEqual(o.slice(0, 3), [0, 1, 2], 'the first three cards stay');
    assert.deepEqual([...o].sort((a, b) => a - b), list.map((_, i) => i), 'the same shows, each once');
    const guest = o[4];
    assert.ok(guest >= 12, 'the fifth card is the day\'s guest from deep in the row: ' + guest);
    o.forEach((was, now) => { if (was !== guest) assert.ok(Math.abs(was - now) <= 11, 'a card drifts a few places, never across the row: ' + was + ' to ' + now); });
    assert.equal(o.slice(0, 8).filter((x) => x >= 18 && x !== guest).length, 0, 'one guest among the first cards, no more: the unknown are not dumped up front');
  }
});

test('H17: it moves by the day, not by the reload, and every show past the twelfth gets a turn as the guest', () => {
  const list = row(40);
  assert.deepEqual(order(list, 'tag:Sci-Fi', 750001), order(list, 'tag:Sci-Fi', 750001), 'the same day draws the same row');
  assert.notDeepEqual(order(list, 'tag:Sci-Fi', 750001), order(list, 'tag:Sci-Fi', 750002), 'the next day it has moved');
  assert.notDeepEqual(order(list, 'tag:Sci-Fi', 750001), order(list, 'type:Animated', 750001), 'two rows do not move alike');
  const guests = new Set();
  for (let day = 750000; day < 750400; day++) guests.add(order(list, 'tag:Sci-Fi', day)[4]);
  assert.equal(guests.size, 28, 'all 28 shows past the twelfth were the guest within about a year');
  assert.equal(typeof ctx.rippleDay(), 'number');
});

test('H17: a short row is left alone, and only the kind rows ripple', () => {
  const short = row(8);
  assert.deepEqual(order(short, 'x', 750001), short.map((_, i) => i));
  const o = order(row(13), 'x', 750001);
  assert.deepEqual(o.slice(0, 3), [0, 1, 2]);
  assert.equal(o.length, 13);
  assert.equal((APP.match(/ripple\(/g) || []).length, 2, 'used in one place: the kind rows');
  assert.match(APP, /if\(art\.length\)h\+=shelf\(name,ripple\(art,key\),key,rows\.length\)/);
  for (const k of ["'continue'", "'list'", "'recent'", "'top'"]) assert.match(APP, new RegExp('shelf\\([^)]*,' + k + '\\)'), k + ' keeps its own order');
});
