// The sound check (scripts/lib/sound.js, scripts/sound-check.js) and the matcher's swap (scripts/match.js gridFor, ctx.readSound).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../scripts/lib/sound');

test('Dolby, DTS and other tracks a browser cannot play count as silent; AAC, MP3, Opus, Vorbis and FLAC do not', () => {
  for (const a of ['ac3', 'eac3', 'dts', 'truehd', 'pcm_s16le', 'mp2']) assert.equal(S.silentIn(a), true, a);
  for (const a of ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'none', null, '']) assert.equal(S.silentIn(a), false, String(a));
});

test('the twin is the Archive\'s own <stem>.ia.mp4, and a twin has no twin', () => {
  const meta = { files: [{ name: 'Dragon Tales_S01E01_A & B.mp4', size: '681780932' }, { name: 'Dragon Tales_S01E01_A & B.ia.mp4', size: '648443133' }] };
  assert.deepEqual(S.twinOf(meta, 'Dragon Tales_S01E01_A & B.mp4'), { name: 'Dragon Tales_S01E01_A & B.ia.mp4', mb: 648 });
  assert.equal(S.twinOf(meta, 'Dragon Tales_S01E01_A & B.ia.mp4'), null);
  assert.equal(S.twinOf(meta, 'Other.mp4'), null);
  assert.equal(S.twinOf(null, 'x.mp4'), null);
});

test('a silent original plays its twin: url, file and format change, the name (which overrides key on) stays', () => {
  const f = { file: 'Ep 1.mp4', name: 'Ep 1', url: 'https://archive.org/download/it/Ep%201.mp4', format: 'MPEG4', playable: true, sizeMB: 682 };
  const sound = { 'it|Ep 1.mp4': { audio: 'eac3', twin: 'Ep 1.ia.mp4', twinMB: 648 } };
  const p = S.playable('it', f, sound);
  assert.equal(p.url, 'https://archive.org/download/it/Ep%201.ia.mp4');
  assert.equal(p.file, 'Ep 1.ia.mp4');
  assert.equal(p.format, 'h.264 IA');
  assert.equal(p.name, 'Ep 1');
  assert.equal(p.soundFix, 'eac3');
  assert.equal(S.playable('other', f, sound), f, 'another item is left alone');
  assert.equal(S.playable('it', f, {}), f);
});

test('the matcher plays the twin for a silent original, and nothing changes without the sound list', () => {
  const { gridFor } = require('../scripts/match');
  const entry = { name: 'Sound Test Show', type: 'Animated' };
  const tv = { name: 'Sound Test Show', episodes: [{ season: 1, number: 1, name: 'The Pilot', airdate: '1999-09-06', runtime: 30 }] };
  const mk = () => ({ items: [{ id: 'sound-test-show-complete', title: 'Sound Test Show (Complete)', files: [{ file: 'Sound Test Show S01E01 The Pilot.mp4', name: 'Sound Test Show S01E01 The Pilot', url: 'https://archive.org/download/sound-test-show-complete/Sound%20Test%20Show%20S01E01%20The%20Pilot.mp4', seconds: 1500, band: 'episode', nameHit: true, ep: { season: 1, episode: 1 }, format: 'MPEG4', playable: true, sizeMB: 600 }] }] });
  const plain = gridFor(entry, mk(), tv, {});
  const before = plain.seasons[0].episodes[0].file;
  assert.ok(before && /S01E01%20The%20Pilot\.mp4$/.test(before.url), 'the original plays without a sound list');
  const sound = { 'sound-test-show-complete|Sound Test Show S01E01 The Pilot.mp4': { audio: 'eac3', twin: 'Sound Test Show S01E01 The Pilot.ia.mp4', twinMB: 580 } };
  const fixed = gridFor(entry, mk(), tv, { readSound: () => sound }).seasons[0].episodes[0].file;
  assert.ok(/The%20Pilot\.ia\.mp4$/.test(fixed.url), fixed.url);
  assert.equal(fixed.name, before.name);
  assert.equal(fixed.format, 'h.264 IA');
});
