// One upload is one file: the Archive's own copy of a file ("<name>.ia.mp4") must never become a second episode beside its original
// (voidverse function test F11; Bryan, 24 Nov 2026: "Yes, dry run first"). Run: node --test tests/match-twins.test.js
// The live catalog on 24 Nov 2026: 116 shows gave the original one episode and its twin another, 309 episodes in all. 10-8: Officers
// on Duty played "10-8 - 1.01.ia.mp4" as episode 1 and "10-8 - 1.01.mp4" as episode 2. Get the Picture showed a made-up S03E40 named
// after the file. Two causes, each closed here:
// 1. hunt.js took ".ia.mp4" off a name and then one more ending, so a twin whose name holds a dot was cut short ("10-8 - 1") and no
//    longer paired with its original ("10-8 - 1.01"). The stored hunt results still hold such twins as files of their own.
// 2. The matcher took every stored file as a different recording.
// The fixtures are the real stored entries, cut down. Nothing here touches the catalog or the disk.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../scripts/match.js');
const S = require('../scripts/lib/sound.js');

const f = (name, file, o = {}) => ({ name, file, format: /\.ia\.mp4$/.test(file) ? 'h.264 IA' : 'MPEG4', playable: true, seconds: 2375, band: 'hour', sizeMB: 300, nameHit: false, ep: null,
  url: 'https://example.invalid/' + encodeURIComponent(file), ...o });
const placed = (g) => (g && g.seasons ? g.seasons.flatMap((s) => s.episodes.filter((e) => e.file).map((e) => e.file.file)) : []);

test('the name two copies share: the ending comes off once, also when the name holds a dot', () => {
  for (const [name, stem] of [
    ['10-8 - 1.01.ia.mp4', '10-8 - 1.01'], ['10-8 - 1.01.mp4', '10-8 - 1.01'], ['American Dreamer - 1.1.ia.mp4', 'American Dreamer - 1.1'],
    ['[1.340]getthepicture(USA-S1)19910000[GAS20050000].ia.mp4', '[1.340]getthepicture(USA-S1)19910000[GAS20050000]'],
    ['[1.340]getthepicture(USA-S1)19910000[GAS20050000].mp4', '[1.340]getthepicture(USA-S1)19910000[GAS20050000]'],
    ['Friends S01E01.avi', 'Friends S01E01'], ['Friends S01E01.IA.MP4', 'Friends S01E01'], ['noext', 'noext'],
  ]) assert.equal(S.stemOf(name), stem, name);
  const HUNT = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'hunt.js'), 'utf8');
  assert.match(HUNT, /const stem = stemOf\(f\.name\);/, 'hunt.js groups by the same rule');
  assert.doesNotMatch(HUNT, /replace\(\/\\\.ia\\\.mp4\$\/i, ''\)\.replace\(/, 'and no longer takes a second ending off');
});

test('a twin beside its original is joined to it: one entry, the name and numbers of the original, the file of the twin', () => {
  const o = f('10-8 - 1.01', '10-8 - 1.01.mp4', { ep: { season: 1, episode: 1 } }), t = f('10-8 - 1', '10-8 - 1.01.ia.mp4', { sizeMB: 250 }), b = f('10-8 - 1.07', '10-8 - 1.07.mp4');
  const out = S.mergeTwins([t, o, b]);
  assert.equal(out.length, 2); assert.equal(out[1], b, 'other files are left as they are');
  assert.equal(out[0].name, '10-8 - 1.01', 'the name the upload gave it, not the cut one'); assert.deepEqual(out[0].ep, { season: 1, episode: 1 });
  // The browser-safe copy plays, as it did before: the Archive only makes a twin when the original is not plain H.264 with AAC sound.
  assert.equal(out[0].file, '10-8 - 1.01.ia.mp4'); assert.equal(out[0].url, t.url); assert.equal(out[0].format, 'h.264 IA'); assert.equal(out[0].sizeMB, 250);
  const same = [f('10-8 - 1.12', '10-8 - 1.12.mp4'), b];
  assert.equal(S.mergeTwins(same), same, 'nothing to join: the same list comes back');
  const lone = f('Solo - 2', 'Solo - 2.05.ia.mp4');
  assert.deepEqual(S.mergeTwins([lone, b]), [lone, b], 'a twin with no original in the item stays: it is the only copy');
  const two = [f('A', 'A.mp4'), f('B', 'B.ia.mp4')];
  assert.deepEqual(S.mergeTwins(two), two, 'different names are different files');
});

test('an original that cannot play in a browser still gives its name and numbers; the twin plays', () => {
  const o = f('Show - 1.01', 'Show - 1.01.mkv', { format: 'Matroska', playable: false, ep: { season: 1, episode: 1 }, sizeMB: 900 });
  const t = f('Show - 1', 'Show - 1.01.ia.mp4', { sizeMB: 250 });
  const [m] = S.mergeTwins([o, t]);
  assert.equal(m.name, 'Show - 1.01'); assert.deepEqual(m.ep, { season: 1, episode: 1 });
  assert.equal(m.file, 'Show - 1.01.ia.mp4'); assert.equal(m.url, t.url); assert.equal(m.playable, true); assert.equal(m.format, 'h.264 IA'); assert.equal(m.sizeMB, 250);
});

test('10-8: Officers on Duty: one recording is one episode, not two', () => {
  const item = { id: '10-8-1.01', title: '10-8: Officers on Duty - Danny Nucci, Ernie Hudson', files: [
    f('10-8 - 1', '10-8 - 1.01.ia.mp4'), f('10-8 - 1.01', '10-8 - 1.01.mp4'), f('10-8 - 1.07', '10-8 - 1.07.mp4', { seconds: 2530 }), f('10-8 - 1.12', '10-8 - 1.12.mp4', { seconds: 2578 }),
  ] };
  const g = M.gridFor({ name: '10-8: Officers on Duty', type: 'Drama', network: 'ABC' }, { items: [item] }, null, { ov: {} });
  const files = placed(g);
  assert.ok(files.length > 0, 'the show still lists from its own files');
  assert.equal(files.filter((x) => x.startsWith('10-8 - 1.01')).length, 1, 'the first recording plays once: ' + files.join(' | '));
  assert.ok(files.includes('10-8 - 1.01.ia.mp4') && !files.includes('10-8 - 1.01.mp4'), 'and it is the browser-safe copy');
  assert.equal(new Set(files).size, files.length);
  assert.equal(files.length, 3, 'three recordings, three episodes (it was four)');
});

// A guard, not a repair: the live matcher already got this small case right. It stays so a later change cannot break it.
test('with an episode list, the two copies still give one episode', () => {
  const tv = { id: 1, name: 'Zork Show', runtime: 40, premiered: '1994-09-22', network: 'NBC', episodes: [1, 2, 3].map((n) => ({ season: 1, number: n, name: 'Part ' + n, airdate: '1994-09-2' + n })) };
  const item = { id: 'zork-show-1', title: 'Zork Show', files: [
    f('Zork Show 1', 'Zork Show 1.01.ia.mp4', { nameHit: true }), f('Zork Show 1.01', 'Zork Show 1.01.mp4', { nameHit: true, ep: { season: 1, episode: 1 } }),
    f('Zork Show 1.02', 'Zork Show 1.02.mp4', { nameHit: true, ep: { season: 1, episode: 2 } }),
  ] };
  const g = M.gridFor({ name: 'Zork Show', type: 'Drama', network: 'NBC' }, { items: [item] }, tv, { ov: {} });
  const by = Object.fromEntries(g.seasons[0].episodes.filter((e) => e.file).map((e) => [e.number, e.file.file]));
  assert.equal(by[1], 'Zork Show 1.01.ia.mp4'); assert.equal(by[2], 'Zork Show 1.02.mp4'); assert.equal(by[3], undefined, 'no third episode from a second copy');
});
