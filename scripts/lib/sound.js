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

module.exports = { PLAYS, silentIn, isTwin, twinOf, keyOf, urlOf, playable, ffprobePath, probe };
