// How the matcher reads an episode's number from a file name (scripts/match.js readNumber), and the hunt's named uploads.
// Bryan, 27 Nov 2026: "Teach the matches please" (Living Single's "Ep 501" and "#01" uploads; Girlfriends' upload the search missed).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const M = fs.readFileSync(path.join(ROOT, 'scripts', 'match.js'), 'utf8');
const src = M.slice(M.indexOf('function readNumber('), M.indexOf('function inRuntimeBand('));
const ctx = {}; vm.createContext(ctx); vm.runInContext(src + '\nthis.readNumber = readNumber;', ctx);
const byKey = new Set(['5x1', '1x1', '1x20', '3x12']);
const read = (f, run) => { const r = ctx.readNumber(f, byKey, run); return r && { season: r.season, episode: r.episode }; };

test('"Ep 501" is season 5, episode 1, only when the plain count cannot be this show', () => {
  assert.deepEqual(read({ name: 'Living Single - 1997-09-11 - Ep 501', ep: { season: null, episode: 501 } }, 118), { season: 5, episode: 1 });
  assert.deepEqual(read({ name: 'Episode 312', ep: { season: null, episode: 312 } }, 118), { season: 3, episode: 12 });
  assert.deepEqual(read({ name: 'Episode 120', ep: { season: null, episode: 120 } }, 800), { season: null, episode: 120 }, 'a long show\'s 120th stays the 120th');
  assert.deepEqual(read({ name: 'Episode 777', ep: { season: null, episode: 777 } }, 118), { season: null, episode: 777 }, 'no such split episode: left as read');
});
test('"#01" is the episode\'s place in the run when the hunt read no number; a number it read stands', () => {
  assert.deepEqual(read({ name: 'Living Single #01 pilot.mp4', ep: null }, 118), { season: null, episode: 1 });
  assert.deepEqual(read({ name: 'Show S01E20 #3.mp4', ep: { season: 1, episode: 20 } }, 118), { season: 1, episode: 20 });
  assert.equal(read({ name: 'no number here.mp4', ep: null }, 118), null);
});
test('the matcher scores by the number readNumber gives; the hunt opens the uploads overrides.json names; Girlfriends and Living Single are set', () => {
  assert.match(M, /const fe = readNumber\(f, byKey, ordered\.length\);/);
  const H = fs.readFileSync(path.join(ROOT, 'scripts', 'hunt.js'), 'utf8');
  assert.match(H, /for \(const id of \(OVERRIDES\[slug\(show\)\] \|\| \{\}\)\.includeItems \|\| \[\]\)/);
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'overrides.json'), 'utf8'));
  assert.deepEqual(o.girlfriends.includeItems, ['girlfriends_202406']);
  assert.equal(o['living-single'].guideOnly, true, 'Living Single keeps its TVmaze order rather than a guessed one');
});
