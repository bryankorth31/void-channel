// TRIVIA NIGHTS: the hand check (plan T5). Picks questions at random from the question bank, a few from every kind of round,
// opens each one's own source live (TMDB, TVmaze, the Internet Archive) and says whether the source still gives the answer the
// game would show. The bank's checker (check.js) reads the local catalog; this reads the sources themselves, so a wrong join
// or a changed record shows up. Writes docs/TRIVIA-HANDCHECK.md. Reads the TMDB token from backend/.env and never prints it.
// Usage: node scripts/trivia/handcheck.js [count=60] [seed=1]
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BANK = path.join(ROOT, 'trivia', 'bank');
const OUT = path.join(ROOT, 'docs', 'TRIVIA-HANDCHECK.md');

const env = fs.existsSync(path.join(ROOT, 'backend', '.env')) ? fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8') : '';
const TOKEN = (process.env.TMDB_READ_TOKEN || (env.match(/^TMDB_READ_TOKEN=(.+)$/m) || [])[1] || '').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const { tidy } = require('../lib/sameshow');
const near = (a, b) => { const x = tidy(a), y = tidy(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

async function get(url, headers = {}) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'voidtv-trivia-handcheck', ...headers }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
    await sleep(300);
    if (!r.ok) return { status: r.status };
    return { status: r.status, json: await r.json() };
  }
  return { status: 429 };
}
const tmdb = (p) => get('https://api.themoviedb.org/3' + p, { Authorization: 'Bearer ' + TOKEN });
const tvmaze = (p) => get('https://api.tvmaze.com' + p);
const ia = (id) => get('https://archive.org/metadata/' + encodeURIComponent(id));
const idIn = (url, re) => { const m = String(url || '').match(re); return m ? m[1] : null; };

// Each kind of round: open its source, return { ok, saw } where saw is what the source says, in a few words.
const CHECKS = {
  async cast(q) {
    const id = idIn(q.source.url, /\/tv\/(\d+)/);
    const r = await tmdb('/tv/' + id + '/aggregate_credits');
    if (!r.json) return { ok: false, saw: 'TMDB answered ' + r.status };
    const p = (r.json.cast || []).find((c) => c.id === q.about.person);
    if (!p) return { ok: false, saw: 'person ' + q.about.person + ' not in the cast list' };
    const parts = (p.roles || []).map((x) => x.character).join(' / ');
    const ok = near(p.name, q.choices[q.answer]) && (p.roles || []).some((x) => near(x.character, q.about.part));
    return { ok, saw: p.name + ' as ' + parts };
  },
  async episode(q) {
    const id = idIn(q.source.url, /\/shows\/(\d+)/);
    const [s, e] = await Promise.all([tvmaze('/shows/' + id), tvmaze('/shows/' + id + '/episodes?specials=1')]);
    if (!s.json || !e.json) return { ok: false, saw: 'TVmaze answered ' + (s.status || e.status) };
    const name = (q.q.match(/"(.+)"/) || [])[1];
    const ep = e.json.find((x) => x.season === q.about.season && x.number === q.about.number);
    const ok = !!ep && near(s.json.name, q.choices[q.answer]) && tidy(ep.name) === tidy(name);
    return { ok, saw: s.json.name + ' S' + q.about.season + 'E' + q.about.number + ' "' + (ep ? ep.name : 'none') + '"' };
  },
  async 'first-aired'(q) {
    const id = idIn(q.source.url, /\/shows\/(\d+)/);
    const s = await tvmaze('/shows/' + id);
    if (!s.json) return { ok: false, saw: 'TVmaze answered ' + s.status };
    const ok = String(s.json.premiered || '').slice(0, 4) === String(q.choices[q.answer]) && near(s.json.name, q.about.title);
    return { ok, saw: s.json.name + ' premiered ' + s.json.premiered };
  },
  async network(q) {
    const id = idIn(q.source.url, /\/shows\/(\d+)/);
    const s = await tvmaze('/shows/' + id);
    if (!s.json) return { ok: false, saw: 'TVmaze answered ' + s.status };
    const net = (s.json.network || s.json.webChannel || {}).name || '';
    return { ok: near(net, q.choices[q.answer]), saw: s.json.name + ' on ' + net };
  },
  async 'film-year'(q) {
    const r = await tmdb('/movie/' + q.about.film);
    if (!r.json) return { ok: false, saw: 'TMDB answered ' + r.status };
    const ok = String(r.json.release_date || '').slice(0, 4) === String(q.choices[q.answer]) && near(r.json.title, q.about.title);
    return { ok, saw: r.json.title + ' released ' + r.json.release_date };
  },
  // A game card's maker and year, against the Archive item the card plays.
  async 'game-maker'(q) {
    const m = await ia(idIn(q.source.url, /\/details\/([^/?#]+)/));
    if (!m.json || !m.json.metadata) return { ok: false, saw: 'Archive answered ' + m.status };
    const md = m.json.metadata; const who = [].concat(md.publisher || [], md.creator || [], md.developer || []).join(' / ');
    return { ok: near(who, q.choices[q.answer]) || tidy(who).includes(tidy(q.choices[q.answer]).split(' ')[0]), saw: (md.title || '') + ': ' + (who || 'no maker given') };
  },
  async 'game-year'(q) {
    const m = await ia(idIn(q.source.url, /\/details\/([^/?#]+)/));
    if (!m.json || !m.json.metadata) return { ok: false, saw: 'Archive answered ' + m.status };
    const md = m.json.metadata; const yr = String(md.year || md.date || '');
    return { ok: yr.includes(String(q.choices[q.answer])), saw: (md.title || '') + ': ' + (yr || 'no year given') };
  },
};
// Clip, picture and sound rounds (and the TV movie clips): the item is there, the file the game plays is in it, and the
// item is that show (and that episode, where the item names one).
async function media(q) {
  const id = idIn(q.source.url, /\/details\/([^/?#]+)/);
  const m = await ia(id);
  if (!m.json || !m.json.metadata) return { ok: false, saw: 'Archive answered ' + m.status };
  const file = decodeURIComponent(String((q.media || {}).url || '').split('/download/' + id + '/')[1] || '').split('#')[0];
  const has = (m.json.files || []).some((f) => f.name === file);
  const md = m.json.metadata; const title = [].concat(md.title || [])[0] || '';
  const answer = q.choices[q.answer];
  const showOk = near(title, answer) || near(file, answer) || near(id.replace(/-/g, ' '), answer);
  return { ok: has && showOk, saw: '"' + title + '", file ' + (has ? 'present' : 'missing: ' + file) };
}
for (const r of ['clip', 'still', 'listen', 'film-clip']) CHECKS[r] = media;

function pick(all, count, seed) {
  const rand = rng(seed); const by = {};
  for (const q of all) (by[q.round] = by[q.round] || []).push(q);
  const rounds = Object.keys(by).sort(); const out = [];
  const each = Math.max(3, Math.floor(count / rounds.length));
  for (const r of rounds) { const pool = by[r].slice(); for (let i = 0; i < each && pool.length; i++) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]); }
  while (out.length > count) out.splice(Math.floor(rand() * out.length), 1);
  const rest = all.filter((q) => !out.includes(q));
  while (out.length < count && rest.length) out.push(rest.splice(Math.floor(rand() * rest.length), 1)[0]);
  return out;
}

async function main() {
  const count = +process.argv[2] || 60, seed = +process.argv[3] || 1;
  if (!TOKEN) throw new Error('No TMDB_READ_TOKEN in backend/.env');
  const all = [];
  for (const f of fs.readdirSync(BANK).filter((x) => /^(tv|movies|games)-\d+\.json$/.test(x))) { const j = JSON.parse(fs.readFileSync(path.join(BANK, f), 'utf8')); all.push(...(Array.isArray(j) ? j : j.questions)); }
  const qs = pick(all, count, seed); const rows = [];
  for (const q of qs) {
    const fn = CHECKS[q.round];
    let res; try { res = fn ? await fn(q) : { ok: false, saw: 'no check for round ' + q.round }; } catch (e) { res = { ok: false, saw: 'error: ' + e.message }; }
    rows.push({ q, ...res });
    process.stdout.write(res.ok ? '.' : 'x');
  }
  const bad = rows.filter((r) => !r.ok);
  const esc = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ');
  const md = ['# Trivia hand check (plan T5)', '',
    'Read ' + new Date().toISOString().slice(0, 10) + ': ' + rows.length + ' questions picked at random from ' + all.length + ' (seed ' + seed + ', a few from every round), each opened at its own source. ' + (rows.length - bad.length) + ' of ' + rows.length + ' match.', '',
    '| | Round | Question | Answer | The source says now | Source |', '|---|---|---|---|---|---|',
    ...rows.map((r) => '| ' + (r.ok ? 'ok' : '**no**') + ' | ' + r.q.round + ' | ' + esc(r.q.q) + ' | ' + esc(r.q.choices[r.q.answer]) + ' | ' + esc(r.saw) + ' | ' + r.q.source.url + ' |'), ''];
  fs.writeFileSync(OUT, md.join('\n'));
  console.log('\n' + (rows.length - bad.length) + ' of ' + rows.length + ' match; wrote ' + path.relative(ROOT, OUT));
  for (const r of bad) console.log('NO  ' + r.q.round + ' | ' + r.q.id + ' | ' + r.q.choices[r.q.answer] + ' | ' + r.saw);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { pick, near, CHECKS };
