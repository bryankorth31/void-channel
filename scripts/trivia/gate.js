// THE TRIVIA GATE: what lets the hourly publish (scripts/publish.js) take the question bank live by itself (Bryan, 24 Nov 2026:
// "By itself each morning"; the conditions are the Void TV owner chat's, which owns publish.js).
//
// The morning run (scripts/trivia/morning.js) writes catalog/cache/trivia/gate.json when the bank and the timed questions
// it made passed their checks: the day, the number of questions, and a hash of every file under trivia/bank and trivia/timed
// as they stood after the check. Publish takes those two folders only when the gate is from today, says passed, and every
// file on disk still hashes to what it says. Anything else (no gate, an old one, a failed night, a file changed after the
// check by hand or by another chat, a file added or gone) keeps the gate shut and the two folders are left alone.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FOLDERS = ['trivia/bank', 'trivia/timed'];
const GATE = path.join('catalog', 'cache', 'trivia', 'gate.json');

// The local calendar day, as 2026-11-24 (the morning run and the day's publish runs share it).
function day(now) { return new Date(now).toLocaleDateString('en-CA'); }

// Every file under the two folders, by its path from the repository root, with a hash of its bytes as they are on disk.
function hashes(root) {
  const out = {};
  const walk = (rel) => {
    let list = []; try { list = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (e) { return; }
    for (const e of list) {
      const r = rel + '/' + e.name;
      if (e.isDirectory()) walk(r);
      else out[r] = crypto.createHash('sha1').update(fs.readFileSync(path.join(root, r))).digest('hex');
    }
  };
  for (const f of FOLDERS) walk(f);
  return out;
}

// How many questions the bank on disk holds (its index), or null.
function questions(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'trivia', 'bank', 'index.json'), 'utf8')).total; } catch (e) { return null; }
}

// Written by the morning run. passed false (with why) shuts the gate for the day.
function write(root, now, passed, why) {
  const g = passed ? { day: day(now), at: new Date(now).toISOString(), passed: true, questions: questions(root), files: hashes(root) }
    : { day: day(now), at: new Date(now).toISOString(), passed: false, why: why || 'a check failed' };
  fs.mkdirSync(path.dirname(path.join(root, GATE)), { recursive: true });
  fs.writeFileSync(path.join(root, GATE), JSON.stringify(g, null, 1));
  return g;
}

// Read by publish: { open, why, questions }.
function check(root, now) {
  let g; try { g = JSON.parse(fs.readFileSync(path.join(root, GATE), 'utf8')); } catch (e) { return { open: false, why: 'no trivia gate (the morning run has not passed one)' }; }
  if (g.day !== day(now)) return { open: false, why: 'the trivia gate is from ' + g.day + ', not today' };
  if (!g.passed) return { open: false, why: 'this morning\'s trivia run did not pass (' + (g.why || 'a check failed') + ')' };
  const now_ = hashes(root), said = g.files || {};
  for (const f of new Set([...Object.keys(now_), ...Object.keys(said)])) {
    if (!(f in said)) return { open: false, why: f + ' was added after this morning\'s check' };
    if (!(f in now_)) return { open: false, why: f + ' is gone since this morning\'s check' };
    if (now_[f] !== said[f]) return { open: false, why: f + ' changed after this morning\'s check' };
  }
  return { open: true, why: '', questions: g.questions };
}

module.exports = { FOLDERS, GATE, day, hashes, questions, write, check };
