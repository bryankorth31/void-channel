// Trivia timed transcripts (plan C18). Run: node --test tests/trivia-transcripts.test.js
// Proves the pure parts of scripts/trivia/transcripts.js: subtitle times, SRT and WebVTT reading, finding the subtitle
// file that belongs to a video, refusing subtitles from another cut, spreading picks through a run, and the check on a
// finished transcript. No network, no Whisper; nothing is written.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../scripts/trivia/transcripts');

test('subtitle times read in both styles', () => {
  assert.equal(T.secs('00:01:02,500'), 62.5);
  assert.equal(T.secs('01:02.5'), 62.5);
  assert.equal(T.secs('1:02:03.250'), 3723.25);
  assert.ok(Number.isNaN(T.secs('soon')));
});

test('SRT and WebVTT become timed lines; tags and empty cues go', () => {
  const srt = '1\r\n00:00:01,000 --> 00:00:03,000\r\n<i>Say my name.</i>\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,500\r\n{\\an8}Two\r\nrows\r\n\r\n3\r\n00:00:06,000 --> 00:00:07,000\r\n\r\n';
  assert.deepEqual(T.parseSubs(srt), [{ start: 1, end: 3, text: 'Say my name.' }, { start: 4, end: 5.5, text: 'Two rows' }]);
  const vtt = '﻿WEBVTT\n\nNOTE made by hand\n\n00:10.000 --> 00:12.000 align:start\nHello there\n';
  assert.deepEqual(T.parseSubs(vtt), [{ start: 10, end: 12, text: 'Hello there' }]);
});

test('the subtitle file that belongs to a video', () => {
  const files = [{ name: 'S01E01.mp4', source: 'original' }, { name: 'S01E02.mp4', source: 'original' }, { name: 'S01E01.en.srt' }, { name: 'S01E02.srt' }];
  assert.equal(T.subtitleFor('S01E01.mp4', files), 'S01E01.en.srt');
  assert.equal(T.subtitleFor('S01E02.mp4', files), 'S01E02.srt');
  assert.equal(T.subtitleFor('S01E03.mp4', files), null);
  // one video and one subtitle file in the item: that pair, whatever the names
  assert.equal(T.subtitleFor('Film.mp4', [{ name: 'Film.mp4', source: 'original' }, { name: 'Film.ogv', source: 'derivative' }, { name: 'english.vtt' }]), 'english.vtt');
  assert.equal(T.subtitleFor('A.mp4', [{ name: 'A.mp4', source: 'original' }, { name: 'B.mp4', source: 'original' }, { name: 'x.srt' }]), null);
});

test('subtitles from another cut are not taken', () => {
  const lines = Array.from({ length: 30 }, (_, i) => ({ start: i * 40, end: i * 40 + 2, text: 'x' }));
  assert.equal(T.fits(lines, 1320), true);
  assert.equal(T.fits(lines, 1000), false);         // runs well past the end of this file
  assert.equal(T.fits(lines.slice(0, 5), 1320), false); // too few lines to be the episode's own
});

test('picks spread through a run, never twice', () => {
  const eps = Array.from({ length: 12 }, (_, i) => i);
  assert.deepEqual(T.spread(eps, 3), [2, 6, 10]);
  assert.deepEqual(T.spread([1, 2], 3), [1, 2]);
  assert.equal(new Set(T.spread(Array.from({ length: 4 }, (_, i) => i), 3)).size, 3);
});

test('the check on a finished transcript', () => {
  const file = { url: 'https://archive.org/download/bb/e1.mp4', seconds: 2800 };
  const good = { url: file.url, made: '2026-11-20T21:00:00Z', source: { kind: 'whisper', model: 'large-v3' }, lines: [{ start: 1, end: 3, text: 'Hi' }, { start: 4, end: 6, text: 'There' }] };
  assert.deepEqual(T.problems(good, file), []);
  assert.match(T.problems({ ...good, source: { kind: 'guess' } }, file).join(), /no source/);
  assert.match(T.problems({ ...good, lines: [{ start: 4, end: 6, text: 'b' }, { start: 1, end: 3, text: 'a' }] }, file).join(), /out of order/);
  assert.match(T.problems({ ...good, lines: [{ start: 2799, end: 2810, text: 'late' }] }, file).join(), /past the end/);
  assert.match(T.problems({ ...good, lines: [{ start: 1, end: 2, text: ' ' }] }, file).join(), /no clean words/);
  assert.match(T.problems(good, null).join(), /no longer plays/);
  assert.match(T.problems(good, { ...file, url: 'https://archive.org/download/other.mp4' }).join(), /different file/);
  assert.match(T.problems({ ...good, source: { kind: 'archive-subtitles' } }, file).join(), /no subtitle file/);
});
