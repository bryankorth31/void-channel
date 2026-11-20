// A search that finds nothing, and the Live TV back button (audit of 20 Nov 2026, A10 and A7).
// Run: node --test tests/app-near.test.js
// The same function text that goes into the page (scripts/lib/app-near.js, nearSource) is also run inside a bare vm
// context, which proves the inlined copy leans on nothing in the module. The last tests read the built page.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { nearTitles, nearSource } = require('../scripts/lib/app-near');

const TITLES = ['The Simpsons', 'Roseanne', 'Seinfeld', "Grey's Anatomy", 'Star Trek: Voyager', 'Joanne and Friends', 'The Rosie Show', 'ER', 'Law & Order', 'Home Improvement'];
const names = (q, max) => nearTitles(q, TITLES, max).map((i) => TITLES[i]);

test('one wrong letter finds the show (the audit case: rosanne)', () => {
  assert.deepEqual(names('rosanne'), ['Roseanne']);
});

test('a dropped, added or swapped letter is one slip', () => {
  assert.deepEqual(names('sienfeld'), ['Seinfeld']);
  assert.deepEqual(names('seinfelds'), ['Seinfeld']);
  assert.deepEqual(names('simpsns'), ['The Simpsons']);
});

test('capitals, apostrophes and marks do not count', () => {
  assert.deepEqual(names('GREYS ANATOMY'), ["Grey's Anatomy"]);
  assert.deepEqual(names('law and ordr'), ['Law & Order']);
});

test('a slip inside a longer title is found by its words', () => {
  assert.deepEqual(names('star trek voyger'), ['Star Trek: Voyager']);
  assert.deepEqual(names('improvment'), ['Home Improvement']);
});

test('fewer than three letters, or nothing close, gives nothing', () => {
  assert.deepEqual(names('er'), []);
  assert.deepEqual(names(''), []);
  assert.deepEqual(names('xyzzyplugh'), []);
});

test('short words get one slip only, so a far title is not offered', () => {
  assert.ok(!names('rosanne').includes('Joanne and Friends'), 'two slips away at 7 letters is too far');
});

test('the closest come first, ties keep the list order, and max caps the list', () => {
  const many = ['Cheers', 'Cheer', 'Cheerz', 'Cheeks'];
  assert.deepEqual(nearTitles('cheers', many, 6).map((i) => many[i]), ['Cheers', 'Cheer', 'Cheerz', 'Cheeks']);
  assert.equal(nearTitles('cheers', many, 2).length, 2);
});

test('the inlined text runs alone in a bare context', () => {
  const ctx = vm.createContext({});
  vm.runInContext(nearSource, ctx);
  assert.equal(vm.runInContext("JSON.stringify(nearTitles('rosanne', ['Seinfeld', 'Roseanne'], 6))", ctx), '[1]');
  // The same check scripts/site.js makes on the page script: a line comment after code would swallow the rest of its line.
  const stripped = (l) => l.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '');
  const bad = nearSource.split('\n').filter((l) => { const s = stripped(l); return !/^\s*\/\//.test(s) && /[^:]\/\//.test(s); });
  assert.deepEqual(bad, [], 'no line comment after code');
});

// The page itself: the source that scripts/site.js turns into every page.
const APP = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'app.js'), 'utf8');

test('A10: an empty result prints the no-match line, with the closest titles from shows the door allows', () => {
  assert.match(APP, /h\+=!list\.length\?noMatch\(\):/, 'browse() calls noMatch() when the list is empty');
  const fn = APP.slice(APP.indexOf('function noMatch(){'), APP.indexOf('\n', APP.indexOf('function noMatch(){')));
  assert.match(fn, /Nothing matches/);
  assert.match(fn, /SHOWS\.filter\(s=>!gated\(s\)\)/, 'the 18+ shows stay out while the door is closed');
  assert.match(fn, /esc\(q\)/, 'what was typed is printed as text');
  assert.ok(APP.includes('${NEAR_SRC}'), 'the page carries nearTitles');
  assert.ok(!/[—–]/.test(fn), 'no em or en dash');
});

test('A7: Live TV starts with the same Browse back button as the other pages', () => {
  const at = APP.indexOf('<div class="tv"><button class="back"');
  assert.ok(at > 0, 'the Live TV page head starts with a back button');
  const line = APP.slice(APP.lastIndexOf('\n', at), APP.indexOf('\n', at));
  assert.match(line, /<button class="back" onclick="go\(\\\\'\\\\'\)"><i class="ico back"><\/i> Browse<\/button><div class="pagehead"/);
  assert.match(APP.slice(APP.lastIndexOf('function tvPage(){', at), at), /function tvPage\(\)\{/, 'and it is inside tvPage');
});
