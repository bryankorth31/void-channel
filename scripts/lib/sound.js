// SOUND: which Archive copies carry sound a browser cannot play, and the Archive's own copy to play instead.
// B, 16 Nov 2026: Dragon Tales on Kids played with no sound. Its originals carry Dolby Digital Plus (E-AC-3), which Chrome and
// Firefox do not decode, so the picture runs silent. The Archive makes its own copy of such a file, "<name>.ia.mp4" (H.264 with
// AAC sound, plays everywhere). The hunter prefers the original, so the silent one was picked.
// sound-check.js reads only the start of each original that has an .ia.mp4 twin (ffprobe, nothing saved) and writes:
//   catalog/sound-files.json          (in git)  { "<item>|<file>": { audio, twin, twinMB, at } }  the originals to swap
//   catalog/cache/sound-checked.json  (not in git) every file it heard, so a run never asks twice
// match.js reads sound-files.json and plays the twin in place of the original: same episode, same name, sound that plays.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// Sound every current browser plays inside an MP4. Anything else (ac3, eac3, dts, truehd, pcm, mp2...) is silent somewhere.
const PLAYS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);
const silentIn = (audio) => !!audio && audio !== 'none' && !PLAYS.has(audio);

// The Archive's own copy of a file: "<stem>.ia.mp4" next to "<stem>.<ext>".
const isTwin = (name) => /\.ia\.mp4$/i.test(String(name || ''));
// The name the two copies share: "<stem>.<ext>" and "<stem>.ia.mp4" both give "<stem>". The ending is taken off ONCE. Until 24 Nov 2026
// hunt.js took ".ia.mp4" off and then one more ending, so a twin whose name holds a dot ("10-8 - 1.01.ia.mp4") was cut to "10-8 - 1",
// no longer paired with its original ("10-8 - 1.01") and was kept as a second file of its own (voidverse function test F11).
const stemOf = (name) => (isTwin(name) ? String(name).replace(/\.ia\.mp4$/i, '') : String(name || '').replace(/\.[^.]+$/, ''));
// match.js: one upload is one file. The stored hunt results still hold such twins as files of their own, so the matcher gave the
// original one episode and its twin another, often the next one (116 shows, 309 episodes on 24 Nov 2026; Bryan: "Yes, dry run first").
// A twin whose original is in the same item is joined to it: one entry, with the original's name, numbers and length (the twin's
// own name was the cut one) and the TWIN's file to play. The twin's file, not the original's, because the Archive only makes a twin
// when the original is not plain H.264 with AAC sound, and because that is what played before: on 24 Nov 2026 the twin was the
// pick in 1,132 placed episodes of such pairs (549 LIVE), none of whose originals has been through sound-check.js. Playing the
// originals instead would have risked silent episodes; this way only the double goes.
function mergeTwins(files) {
  const originals = new Map();
  for (const f of files) if (f && f.file && !isTwin(f.file) && !originals.has(stemOf(f.file))) originals.set(stemOf(f.file), f);
  const drop = new Set(), swap = new Map();
  for (const t of files) {
    if (!t || !isTwin(t.file)) continue;
    const o = originals.get(stemOf(t.file));
    if (!o) continue;
    drop.add(t);
    if (t.playable && !swap.has(o)) swap.set(o, { ...o, file: t.file, url: t.url, format: t.format, playable: true, sizeMB: t.sizeMB || o.sizeMB, seconds: o.seconds || t.seconds });
  }
  return drop.size ? files.filter((f) => !drop.has(f)).map((f) => swap.get(f) || f) : files;
}
function twinOf(meta, file) {
  if (isTwin(file)) return null;
  const want = String(file).replace(/\.[^.]+$/, '') + '.ia.mp4';
  const f = ((meta && meta.files) || []).find((x) => x.name === want);
  return f ? { name: f.name, mb: Math.round((+f.size || 0) / 1e6) } : null;
}

const keyOf = (item, file) => item + '|' + file;
const urlOf = (item, file) => `https://archive.org/download/${item}/${encodeURIComponent(file)}`;

// match.js: the candidate file as it should play. A file with a silent original and a twin becomes the twin (url, file, format);
// its name stays, so B's placements, titles and rejections, all keyed by item and name, still apply.
function playable(itemId, f, sound) {
  const s = sound && (sound[keyOf(itemId, f.file)] || sound[keyOf(itemId, f.name)]);
  if (!s || !s.twin) return f;
  return { ...f, file: s.twin, url: urlOf(itemId, s.twin), format: 'h.264 IA', playable: true, sizeMB: s.twinMB || f.sizeMB, soundFix: s.audio };
}

// ffprobe: this PC's copy. FFPROBE overrides; else PATH; else the winget install.
function ffprobePath() {
  if (process.env.FFPROBE) return process.env.FFPROBE;
  const dirs = String(process.env.PATH || '').split(path.delimiter);
  for (const d of dirs) for (const n of ['ffprobe.exe', 'ffprobe']) { const p = path.join(d, n); if (fs.existsSync(p)) return p; }
  const wg = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  try {
    for (const pkg of fs.readdirSync(wg).filter((x) => /^Gyan\.FFmpeg/i.test(x))) {
      for (const sub of fs.readdirSync(path.join(wg, pkg))) { const p = path.join(wg, pkg, sub, 'bin', 'ffprobe.exe'); if (fs.existsSync(p)) return p; }
    }
  } catch (e) { /* no winget folder */ }
  return null;
}

// The first audio track's codec of a file on the web ('none' when it has no sound), read from its header; null when it could not be read.
function probe(url, bin, timeoutMs = 90000) {
  return new Promise((resolve) => {
    execFile(bin, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', url], { timeout: timeoutMs, windowsHide: true }, (err, out) => {
      if (err) return resolve(null);
      const codecs = String(out).split(/\r?\n/).map((s) => s.replace(/,+$/, '').trim()).filter(Boolean);
      resolve(codecs[0] || 'none');
    });
  });
}

module.exports = { PLAYS, silentIn, isTwin, stemOf, mergeTwins, twinOf, keyOf, urlOf, playable, ffprobePath, probe };
