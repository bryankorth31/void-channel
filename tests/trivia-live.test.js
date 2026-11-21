// Trivia during Live TV (trivia/src/live.js; Bryan, 20 Nov 2026: "watch a show together and do trivia together, on multiple
// channels ... starting with the most popular content first"). Run: node --test tests/trivia-live.test.js
// The same channel and airing give every viewer the same question; never a clip; never a later episode; only that show's own
// questions; the best known shows have deeper sets. No network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const L = require('../trivia/src/live');

const ROOT = path.join(__dirname, '..');
const q = (id, round, extra) => Object.assign({ id, round, category: 'tv', band: 'family', choices: ['a', 'b', 'c', 'd'], answer: 0, source: { site: 'TVmaze', url: 'https://www.tvmaze.com/shows/1', fact: 'x' }, about: { show: 'alpha' } }, extra || {});
const SET = [
  q('tv-year-alpha', 'first-aired'),
  q('tv-cast-alpha-1', 'cast'),
  q('tv-episode-alpha-1-2', 'episode', { about: { show: 'alpha', season: 1, number: 2 } }),
  q('tv-episode-alpha-3-5', 'episode', { about: { show: 'alpha', season: 3, number: 5 } }),
  q('clip-clip-alpha-1-1', 'clip', { media: { kind: 'video' } }),
];

test('the same seed gives the same question for everyone; other seeds spread over the set', () => {
  const a = L.pickLive(SET, { seed: 'ch7|1795000000000', season: 9, number: 9 });
  const b = L.pickLive(SET.slice().reverse(), { seed: 'ch7|1795000000000', season: 9, number: 9 });
  assert.equal(a.id, b.id, 'the order the file comes in does not matter');
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(L.pickLive(SET, { seed: 'ch7|' + i, season: 9, number: 9 }).id);
  assert.ok(seen.size >= 3);
});

test('never a clip, never a later episode than the one just shown', () => {
  for (let i = 0; i < 300; i++) {
    const p = L.pickLive(SET, { seed: 's' + i, season: 1, number: 3 });
    assert.ok(!p.media, 'no clip');
    assert.notEqual(p.id, 'tv-episode-alpha-3-5', 'season 3 is after season 1 episode 3');
  }
  assert.equal(L.later(SET[2], 1, 1), true, 'season 1 episode 2 is after episode 1');
  assert.equal(L.later(SET[2], 1, 2), false);
  assert.equal(L.later(SET[1], 1, 1), false, 'only episode questions name an episode');
  assert.equal(L.pickLive([SET[4]], { seed: 'x' }), null);
  assert.equal(L.pickLive([], { seed: 'x' }), null);
});

test('liveQuestion loads only the playing show, once, and refuses odd slugs', async () => {
  const asked = [];
  const fetchJson = (u) => { asked.push(u); return Promise.resolve(SET); };
  const one = await L.liveQuestion({ slug: 'alpha', seed: 'c1|1', season: 9, number: 9 }, '/trivia/bank/', fetchJson);
  const two = await L.liveQuestion({ slug: 'alpha', seed: 'c1|2', season: 9, number: 9 }, '/trivia/bank/', fetchJson);
  assert.ok(one && two);
  assert.deepEqual(asked, ['/trivia/bank/shows/alpha.json']);
  assert.equal(await L.liveQuestion({ slug: '../secrets', seed: 'x' }, '/trivia/bank/', fetchJson), null);
  assert.equal(await L.liveQuestion({ slug: 'gone', seed: 'x' }, '/trivia/bank/', () => Promise.reject(new Error('404'))), null);
});

test('the built per-show files: one per show, own questions only, no clips, sources kept; best known shows go deeper', () => {
  const dir = path.join(ROOT, 'trivia', 'bank', 'shows');
  if (!fs.existsSync(dir)) return;
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  assert.ok(Object.keys(index).length > 100);
  for (const slug of Object.keys(index).slice(0, 60)) {
    const qs = JSON.parse(fs.readFileSync(path.join(dir, slug + '.json'), 'utf8'));
    assert.equal(qs.length, index[slug]);
    for (const x of qs) {
      assert.equal(x.about.show, slug);
      assert.ok(!x.media);
      assert.match(x.source.url, /^https:\/\//);
    }
  }
  const fame = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'trivia-fame.json'), 'utf8')); } catch (e) { return null; } })();
  if (fame) {
    const top = fame.tv.filter((t) => t.voidtv && index[t.voidtv.slug]).slice(0, 10).map((t) => index[t.voidtv.slug]);
    const median = Object.values(index).sort((a, b) => a - b)[Math.floor(Object.keys(index).length / 2)];
    assert.ok(top.filter((n) => n > median).length >= 7, 'the best known shows have more questions than the middle');
  }
});

test('during the show: only questions about the show as a whole, never an episode (Bryan: "Yes, add the strip")', () => {
  const extra = SET.concat([q('tv-network-alpha', 'network')]);
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const p = L.pickLive(extra, { seed: 'd' + i, season: 9, number: 9, during: true });
    assert.ok(L.DURING_ROUNDS.includes(p.round), p.round);
    seen.add(p.round);
  }
  assert.deepEqual([...seen].sort(), ['cast', 'first-aired', 'network']);
  assert.equal(L.pickLive([SET[2], SET[3]], { seed: 'x', season: 9, number: 9, during: true }), null, 'a show with only episode questions asks nothing during the show');
});
