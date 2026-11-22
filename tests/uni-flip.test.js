// The flip side of a lecture (scripts/lib/uni-flip.js). No web, no model: the model is a stand-in here.
// Run: node --test tests/uni-flip.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const flip = require('../scripts/lib/uni-flip');

// A made-up lecture: each sentence is spoken at 2 words a second, with a 2 second pause after it.
function lecture(sentences) {
  const segments = []; let t = 0;
  for (const s of sentences) {
    const words = s.split(' ').map((w) => { const x = [w, +t.toFixed(2), +(t + 0.4).toFixed(2), w === 'Gyjees' ? 0.2 : 1]; t += 0.5; return x; });
    segments.push({ start: words[0][1], end: words[words.length - 1][2], text: s, words });
    t += 2;
  }
  return { title: 'A made-up lecture', segments };
}
const LONG = 'and so the story goes on and on with many more words than anyone needs to hear said out loud in a room';
const TALK = [
  'Welcome back everyone, please sit down. ' + LONG + '. ' + LONG + '. ' + LONG + '. ' + LONG + '.',
  'Plato tells the story of the Ring of Gyjees in the Republic. The ring makes its wearer invisible to the whole world. ' + LONG + '. ' + LONG + '. ' + LONG + '.',
  'Would a person with the ring still act fairly? Glaucon says nobody would stay fair once nobody could see them. ' + LONG + '. ' + LONG + '. ' + LONG + '.',
  'So the ring is a test of why we are fair at all. The ring shows that the fear of being seen holds us back. ' + LONG + '. ' + LONG + '. ' + LONG + '.',
  'Later we will come back to the ring when we read about hypocrisy. The ring is the picture to keep in your head. ' + LONG + '. ' + LONG + '. ' + LONG + '.',
];

test('stretches end at a sentence end, keep every word once, and carry a time for every word', () => {
  const R = flip.heardWords(lecture(TALK));
  const S = flip.cut(R);
  assert.ok(S.length >= 4, 'a talk of some minutes is cut into several stretches, got ' + S.length);
  assert.strictEqual(S.reduce((a, s) => a + s.ws.length, 0), R.length);
  for (const s of S) {
    assert.match(s.ws[s.ws.length - 1].raw, /[.?!]$/, 'a stretch stopped in the middle of a sentence');
    assert.ok(s.end > s.start);
    for (const w of s.ws) assert.ok(typeof w.s === 'number' && typeof w.e === 'number');
  }
  for (let i = 1; i < S.length; i++) assert.ok(S[i].start >= S[i - 1].end, 'stretches overlap in time');
});

test('a quote or a name is kept only when it is said word for word in its own stretch, with its time', () => {
  const S = flip.cut(flip.heardWords(lecture(TALK)));
  const st = S.find((s) => /invisible/.test(s.text));
  const good = flip.gateStretch({ q: 'What does the Ring of Gyges do for the person who wears it?', quote: 'The ring makes its wearer invisible to the whole world.', names: [{ text: 'Plato', kind: 'person' }, { text: 'the Republic', kind: 'work' }, { text: 'Aristotle', kind: 'person' }] }, st);
  assert.ok(good.answer, 'a word for word quote was refused');
  const at = st.ws.find((w) => w.raw === 'The' && st.ws[st.ws.indexOf(w) + 1].raw === 'ring');
  assert.strictEqual(good.answer.t, at.s, 'the answer does not start at the second its first word is said');
  assert.ok(good.answer.e > good.answer.t);
  assert.deepStrictEqual(good.names.map((x) => x.text), ['Plato', 'the Republic'], 'a name not said in the stretch was kept, or a said one dropped');
  assert.ok(good.notes.some((x) => /Aristotle/.test(x)));
  const bad = flip.gateStretch({ q: 'What does the ring do?', quote: 'The ring makes whoever wears it impossible for the world to see.', names: [] }, st);
  assert.strictEqual(bad.answer, null, 'a reworded quote passed as the teacher\'s words');
  assert.strictEqual(bad.q, '');
  const other = flip.gateStretch({ q: 'What does Glaucon say people would do?', quote: 'Glaucon says nobody would stay fair once nobody could see them.', names: [] }, st);
  assert.strictEqual(other.answer, null, 'a quote from another stretch passed');
  assert.strictEqual(flip.gateStretch({ q: '', quote: '', names: [] }, S[0]).housekeeping, true);
});

test('a whole lecture: questions, what the University holds, what is needed, unsure words, and nothing made up', async () => {
  const tr = lecture(TALK);
  let calls = 0;
  const ask = async (prompt) => { // the stand-in model: one right answer, one invented quote, housekeeping for the rest
    calls++;
    const parts = [...prompt.matchAll(/PART (\d+):\n([^\n]+)/g)].map((m) => ({ n: +m[1], text: m[2] }));
    return { parts: parts.map((p) => {
      if (/invisible/.test(p.text)) return { n: p.n, q: 'What does the Ring of Gyges do for the person who wears it?', quote: 'The ring makes its wearer invisible to the whole world.', names: [{ text: 'the ring', kind: 'term' }, { text: 'Plato', kind: 'person' }] };
      if (/Glaucon/.test(p.text)) return { n: p.n, q: 'What would people do if nobody could see them?', quote: 'Everybody would turn into a thief at once, says Glaucon.', names: [{ text: 'Glaucon', kind: 'person' }] };
      return { n: p.n, q: '', quote: '', names: [] };
    }) };
  };
  const holdings = [{ kind: 'person', name: 'Plato', note: 'Philosopher, Athens', link: 'human-nature.html', keys: [['plato']] }];
  const unit = { quiz: [{ q: 'What does the ring do?', quote: 'The ring makes its wearer invisible to the whole world.' }] };
  const f = await flip.flipLecture(tr, { unit, holdings }, () => {}, ask);
  assert.ok(calls >= 1);
  assert.strictEqual(f.counts.asked, 1, 'only the stretch whose quote is word for word carries a question');
  const s = f.stretches.find((x) => x.answer);
  assert.match(s.text, /invisible/);
  assert.deepStrictEqual(s.shows.map((x) => x.name), ['Plato']);
  assert.ok(s.names.find((x) => x.text === 'Plato').held);
  assert.ok(s.needed.some((x) => x.why === 'quiz'), 'the stretch a quiz question rests on is not marked as needed');
  const later = s.needed.find((x) => x.why === 'later');
  assert.ok(later && later.name === 'the ring' && later.again >= 2, 'a thing first said here and leaned on later is not marked as needed');
  assert.ok(s.low.some((x) => x.word === 'Gyjees'), 'a word the listener was unsure of is not listed');
  const g = f.stretches.find((x) => /Glaucon/.test(x.text));
  assert.strictEqual(g.answer, null, 'an invented quote was kept');
  assert.ok(f.nothingHeld.some((x) => x.text === 'Glaucon'), 'a named thing with nothing held is missing from the list of what to make next');
  assert.strictEqual(f.stretches.reduce((a, x) => a + x.words.length, 0), f.wordCount);
  const page = flip.readable(f);
  assert.match(page, /\[hat\]/);
  assert.ok(!/[—–]/.test(page), 'a dash in the readable page');
});
