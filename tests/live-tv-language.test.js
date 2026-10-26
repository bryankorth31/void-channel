// Shows not in English on Live TV (B, 25 Oct 2026, "own chan"): they leave the mixed channels and stay on their own network
// and the Anime and World TV rows. Run: node --test tests/live-tv-language.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { channelLists } = require('../scripts/lib/app');

const show = (slug, over) => Object.assign({ slug, show: slug, type: 'Comedy', network: 'Net A', tags: ['Sketch'], eps: 20 }, over);
const SHOWS = [
  show('en-1'), show('en-2'), show('de-1', { type: 'Reality & Talk', network: 'DE' }), show('de-2', { type: 'Reality & Talk', network: 'DE' }),
  show('ja-1', { type: 'Anime', network: 'JP' }), show('en-anime', { type: 'Anime', network: 'JP' }), show('ko-1', { type: 'World TV', network: 'KR' }),
  show('ko-2', { type: 'World TV', network: 'KR' }), show('late-de', { type: 'Late Night', network: 'DE' }),
];
const TYPES = ['Comedy', 'Reality & Talk', 'Anime', 'World TV'];
const FOREIGN = new Set(['de-1', 'de-2', 'ja-1', 'ko-1', 'ko-2', 'late-de']);
const byId = (r) => Object.fromEntries(r.lists.map((L) => [L.id, L.list.map((s) => s.slug)]));

test('a show not in English leaves The Void, the other rows, the collections and Late Night', () => {
  const ch = byId(channelLists(SHOWS, TYPES, new Set(), FOREIGN));
  assert.deepEqual(ch['void'], ['en-1', 'en-2', 'en-anime']);
  assert.ok(!ch['row-reality-and-talk'], 'a row of only German shows has no channel');
  assert.deepEqual(ch['tag-sketch'], ['en-1', 'en-2', 'en-anime']);
  assert.ok(!ch['row-late-night'], 'Late Night takes no German show');
});

test('it stays on its own network and on the Anime and World TV rows', () => {
  const ch = byId(channelLists(SHOWS, TYPES, new Set(), FOREIGN));
  assert.deepEqual(ch['net-de'], ['de-1', 'de-2']);
  assert.deepEqual(ch['row-anime'], ['ja-1', 'en-anime']);
  assert.deepEqual(ch['row-world-tv'], ['ko-1', 'ko-2']);
});

test('a show kept off Live TV stays off the Anime and World TV rows too', () => {
  const ch = byId(channelLists(SHOWS, TYPES, new Set(['ko-1']), FOREIGN));
  assert.deepEqual(ch['row-world-tv'], ['ko-2']);
  assert.deepEqual(ch['net-kr'], ['ko-1', 'ko-2']);
});

test('with no language list, every channel is as before', () => {
  assert.deepEqual(byId(channelLists(SHOWS, TYPES, new Set())), byId(channelLists(SHOWS, TYPES, new Set(), new Set())));
});
