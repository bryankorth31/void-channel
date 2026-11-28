// TRIVIA NIGHTS: timed transcripts (plan C18), the layer under moments, Finish the Line, captions and Watch Along.
// Every line of what is said in an episode, with its file and the second it is said, from one of two sources:
//   1. the Archive item's own subtitle file (.srt or .vtt) for that video, when there is one that fits it;
//   2. Whisper (large-v3) on this PC's graphics card (scripts/trivia/whisper_lines.py), for the rest.
// Worked down the fame list (catalog/trivia-fame.json): the best known shows that are ready for clips, a few episodes
// each, spread through the run. Runs on this PC with no Claude usage. Only text is kept; the sound is never stored.
//
// Kept in trivia/transcripts/<show>/s<season>e<number>.json, working data on this PC: the folder's own .gitignore
// keeps it out of git, and scripts/site.js never copies it to voidtv.net. Questions built from it go into the bank.
//   { show, season, number, item, url, seconds, source: { kind: 'archive-subtitles', file, url } or
//     { kind: 'whisper', model, made }, made, lines: [ { start, end, text } ] }
//
// Usage: node scripts/trivia/transcripts.js run [--shows 20] [--eps 3] [--show <slug>]
//          pick the episodes, take Archive subtitles where they fit, Whisper the rest, then check everything
//        node scripts/trivia/transcripts.js queue [same options]   pick and take subtitles only; write the Whisper queue
//        node scripts/trivia/transcripts.js check                  check every transcript; exit 1 on any failure
//        node scripts/trivia/transcripts.js check --retire         the same, but a transcript whose episode the catalog now
//          plays from another file (or no longer plays) is set aside in catalog/cache/trivia/retired-transcripts/<day>/
//          instead of failing; the night queue makes a fresh one for the new file when it picks that episode again
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const M = require('./moments');

const ROOT = path.join(__dirname, '..', '..');
const DIR = process.env.TRIVIA_TRANSCRIPTS_DIR || path.join(ROOT, 'trivia', 'transcripts');
const QUEUE = path.join(DIR, 'queue.json');
// Where a transcript of a file the catalog no longer plays is kept (outside DIR, which is read as one folder per show).
const RETIRED = process.env.TRIVIA_RETIRED_DIR || path.join(ROOT, 'catalog', 'cache', 'trivia', 'retired-transcripts');
// The two problems that mean the catalog moved on, not that the transcript is broken (Bryan, 27 Nov 2026: "Fix morning
// job"; before this, each file swap failed the check every morning until a person moved the transcript by hand).
const STALE = ['the catalog now plays a different file for it', 'its episode no longer plays as a clip file on VoidTV'];
function staleOnly(p) { return p.length > 0 && p.every((x) => STALE.includes(x)); }
const META = path.join(ROOT, 'catalog', 'cache');
const FILES_CACHE = path.join(ROOT, 'catalog', 'cache', 'trivia', 'item-files');
const PYTHON = 'C:/Users/bryan/hardware-lab/Scripts/python.exe';
const UA = 'voidtv.net trivia transcripts (https://voidtv.net)';
const CONTROL = /[\u0000-\u0008\u000b-\u001f]/;

// ---------- pure parts (tested) ----------

// "00:01:02,500", "01:02.5" or "1:02:03.250" to seconds.
function secs(t) {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(t.trim());
  if (!m) return NaN;
  return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(m[4].padEnd(3, '0')) / 1000 : 0);
}

// An SRT or WebVTT file to timed lines: tags and position marks off, a cue's rows joined, empty cues dropped.
function parseSubs(text) {
  const out = [];
  const blocks = String(text).replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/);
  for (const b of blocks) {
    const rows = b.split('\n');
    const i = rows.findIndex((r) => r.includes('-->'));
    if (i < 0) continue;
    const [a, z] = rows[i].split('-->').map((s) => s.trim().split(/\s+/)[0]);
    const start = secs(a), end = secs(z);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const words = rows.slice(i + 1).join(' ').replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
    if (!words) continue;
    out.push({ start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100, text: words });
  }
  return out.sort((x, y) => x.start - y.start);
}

// The subtitle file in an item that belongs to one video file: the same name with .srt or .vtt (a language tag such
// as .en or .eng between is allowed). Only when no name fits and the item holds exactly one video and one subtitle
// file is that pair taken. Returns the subtitle file's name or null.
function subtitleFor(videoName, files) {
  const base = videoName.replace(/\.[^./]+$/, '').toLowerCase();
  const subs = files.filter((f) => /\.(srt|vtt)$/i.test(f.name));
  const strip = (n) => n.replace(/\.(srt|vtt)$/i, '').replace(/\.(en|eng|english)$/i, '').toLowerCase();
  const named = subs.find((f) => strip(f.name) === base);
  if (named) return named.name;
  const videos = files.filter((f) => /\.(mp4|mkv|avi|mpe?g|m4v|ogv|webm)$/i.test(f.name) && f.source !== 'derivative');
  return videos.length === 1 && subs.length === 1 ? subs[0].name : null;
}

// Whether subtitle lines fit a video of this length: enough lines, and none running past its end (a subtitle made for
// another cut of the episode would). Lines that do not fit go to Whisper instead.
function fits(lines, seconds) {
  return lines.length >= 20 && lines[lines.length - 1].end <= seconds + 30;
}

// A few episodes of a run, spread through it (a sixth, half and five sixths of the way in), never the same twice.
function spread(eps, n) {
  if (eps.length <= n) return eps.slice();
  const picks = [];
  for (let k = 0; k < n; k++) {
    let i = Math.floor(eps.length * (2 * k + 1) / (2 * n));
    while (picks.includes(i)) i = (i + 1) % eps.length;
    picks.push(i);
  }
  return picks.sort((a, b) => a - b).map((i) => eps[i]);
}

// Everything wrong with one transcript, given what the catalog says of its file ({ url, seconds } or null).
function problems(t, file) {
  const out = [];
  if (!t || !Array.isArray(t.lines)) return ['not a transcript'];
  if (!t.source || !['archive-subtitles', 'whisper'].includes(t.source.kind)) out.push('names no source');
  if (t.source && t.source.kind === 'archive-subtitles' && !(t.source.url && t.source.file)) out.push('names no subtitle file');
  if (t.source && t.source.kind === 'whisper' && !t.source.model) out.push('names no Whisper model');
  if (!t.made || isNaN(Date.parse(t.made))) out.push('has no time it was made');
  if (!t.lines.length) out.push('has no lines');
  let last = -1;
  t.lines.forEach((l, i) => {
    if (!(l.start >= 0) || !(l.end >= l.start)) out.push(`line ${i + 1} has a bad time`);
    if (l.start < last) out.push(`line ${i + 1} is out of order`);
    last = l.start;
    if (!l.text || !String(l.text).trim() || CONTROL.test(l.text)) out.push(`line ${i + 1} has no clean words`);
    if (file && l.end > file.seconds + 2) out.push(`line ${i + 1} runs past the end of the file`);
  });
  if (!file) out.push('its episode no longer plays as a clip file on VoidTV');
  else if (file.url !== t.url) out.push('the catalog now plays a different file for it');
  return [...new Set(out)];
}

// ---------- files ----------

function readJson(f, fallback) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } }
function writeJson(f, data) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data, null, 1) + '\n'); }
function fileOf(show, season, number) { return path.join(DIR, show, `s${season}e${number}.json`); }

// The folder keeps itself out of git, whatever the repository's own .gitignore says.
function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true });
  const gi = path.join(DIR, '.gitignore');
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, '# Working data on this PC (plan C18): never committed, never on the live site.\n*\n');
}

// An item's file list: the catalog's cached Archive metadata where it has one, else one call to the Archive.
async function itemFiles(item) {
  const meta = readJson(path.join(META, 'meta-' + item + '.json'), null);
  if (meta && Array.isArray(meta.files)) return meta.files;
  const cached = readJson(path.join(FILES_CACHE, item + '.json'), null);
  if (cached) return cached;
  const r = await fetch('https://archive.org/metadata/' + encodeURIComponent(item) + '/files', { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('the Archive answered ' + r.status + ' for ' + item);
  const files = ((await r.json()).result || []).map((f) => ({ name: f.name, source: f.source, format: f.format }));
  writeJson(path.join(FILES_CACHE, item + '.json'), files);
  return files;
}

// Whether the Archive serves a file now: the status of a request for its first kilobyte (206 or 200 means yes).
async function reachable(url) {
  try { return (await fetch(url, { headers: { Range: 'bytes=0-1023', 'User-Agent': UA } })).status; } catch { return 'no answer'; }
}

function videoName(url, item) {
  const after = url.split('/download/' + item + '/')[1];
  return after ? decodeURIComponent(after) : decodeURIComponent(url.split('/').pop());
}

// ---------- pick, then take subtitles ----------

function picks(db, opts) {
  if (opts.show) return [{ slug: opts.show, name: opts.show, rank: null }];
  const fame = readJson(path.join(ROOT, 'catalog', 'trivia-fame.json'), null);
  if (!fame || !Array.isArray(fame.tv)) throw new Error('no fame list yet (catalog/trivia-fame.json); run node scripts/trivia/fame.js first, or name one show with --show');
  return fame.tv.filter((t) => t.voidtv && t.voidtv.clipReady > 0).slice(0, opts.shows)
    .map((t) => ({ slug: t.voidtv.slug, name: t.title, rank: t.rank }));
}

async function queue(opts) {
  ensureDir();
  const db = M.openDb();
  const todo = [];
  let fromSubs = 0, have = 0, refused = 0;
  for (const s of picks(db, opts)) {
    const eps = M.episodesOf(db, s.slug);
    const first = spread(eps, opts.eps);
    let got = 0;
    // The spread picks first; when the Archive refuses one (an item locked since the catalog checked it), the next
    // episode of the same show stands in, so each show still gets its share.
    for (const e of first.concat(eps.filter((x) => !first.includes(x)))) {
      if (got >= opts.eps) break;
      const out = fileOf(s.slug, e.season, e.number);
      const prev = readJson(out, null);
      if (prev && prev.url === e.url && !problems(prev, e).length) { have++; got++; continue; }
      const code = await reachable(e.url);
      if (code !== 206 && code !== 200) { refused++; console.log(`  ${s.slug} S${e.season}E${e.number}: the Archive refused the file (${code}); taking another episode`); continue; }
      got++;
      const base = { show: s.slug, season: e.season, number: e.number, item: e.item, url: e.url, seconds: e.seconds };
      let taken = false;
      try {
        const files = await itemFiles(e.item);
        const sub = subtitleFor(videoName(e.url, e.item), files);
        if (sub) {
          const url = 'https://archive.org/download/' + e.item + '/' + sub.split('/').map(encodeURIComponent).join('/');
          const r = await fetch(url, { headers: { 'User-Agent': UA } });
          const lines = r.ok ? parseSubs(await r.text()) : [];
          if (fits(lines, e.seconds)) {
            writeJson(out, { ...base, source: { kind: 'archive-subtitles', file: sub, url }, made: new Date().toISOString(), lines });
            fromSubs++; taken = true;
          }
        }
      } catch (err) { console.log(`  ${s.slug} S${e.season}E${e.number}: no subtitle check (${err.message}); Whisper will do it`); }
      if (!taken) todo.push({ ...base, out: path.relative(ROOT, out).replace(/\\/g, '/') });
    }
  }
  db.close();
  writeJson(QUEUE, { made: new Date().toISOString(), todo });
  console.log(`${have} already done, ${fromSubs} from the Archive's own subtitles, ${todo.length} queued for Whisper` + (refused ? `, ${refused} files the Archive refused` : ''));
  return todo.length;
}

// ---------- check ----------

function checkAll(retire) {
  const db = M.openDb();
  const bad = [], retired = [];
  const day = new Date().toISOString().slice(0, 10);
  let n = 0, lines = 0;
  let shows = [];
  try { shows = fs.readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* none yet */ }
  for (const show of shows) {
    for (const f of fs.readdirSync(path.join(DIR, show)).filter((x) => /^s\d+e\d+\.json$/.test(x))) {
      const t = readJson(path.join(DIR, show, f), null);
      n++;
      const file = t ? M.episodesOf(db, show).find((e) => e.season === t.season && e.number === t.number) || null : null;
      const p = problems(t, file);
      if (retire && staleOnly(p)) {
        const to = path.join(RETIRED, day, show, f);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(path.join(DIR, show, f), to);
        retired.push(`${show}/${f}: ${p[0]}`);
        n--;
      } else if (p.length) bad.push(`${show}/${f}: ${p.slice(0, 3).join('; ')}`);
      else lines += t.lines.length;
    }
  }
  db.close();
  return { n, lines, bad, retired };
}

function check(retire) {
  const { n, lines, bad, retired } = checkAll(retire);
  for (const r of retired) console.log('SET ASIDE ' + r);
  for (const b of bad) console.log('FAIL ' + b);
  console.log(`${n} transcripts checked (${lines} lines), ${bad.length} failed` + (retired.length ? `, ${retired.length} set aside (file changed)` : ''));
  if (bad.length) process.exitCode = 1;
}

// ---------- main ----------

function options(argv) {
  const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  return { shows: Number(get('--shows', 20)), eps: Number(get('--eps', 3)), show: get('--show', null) };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = options(rest);
  if (cmd === 'check') return check(rest.includes('--retire'));
  if (cmd !== 'queue' && cmd !== 'run') { console.log('Usage: node scripts/trivia/transcripts.js run|queue|check [--shows 20] [--eps 3] [--show <slug>]'); process.exitCode = 2; return; }
  const left = await queue(opts);
  if (cmd === 'run' && left) {
    const r = spawnSync(PYTHON, ['-I', path.join(__dirname, 'whisper_lines.py'), QUEUE], { stdio: 'inherit', cwd: ROOT });
    if (r.status !== 0) { console.log('Whisper stopped early; run again to carry on where it left off'); process.exitCode = 1; }
  }
  if (cmd === 'run') check();
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { secs, parseSubs, subtitleFor, fits, spread, problems, staleOnly, STALE, videoName, checkAll, DIR, RETIRED };
