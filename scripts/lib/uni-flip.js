// The flip side of a lecture (Bryan, 22 Nov 2026: "we have the teacher talking into space ... we take the empty
// space and create the inverse of the answers and where to look. i want the timestamps of when the words were said
// and with the time and the words"; "pertinent data and info populate based on the words and times"; the hat "can
// be an answer that will be needed").
//
// A lecture is answers with no questions. This turns one heard lecture into a timed file of stretches. A stretch is
// a run of the teacher's talk with its start and end second and every word with its own time. Onto each stretch go:
//   q        the question that stretch answers (written by the model on this PC)
//   answer   the teacher's own words that answer it, word for word, with the second they start and end
//   names    what is said there (people, works, studies, terms, numbers, places), each with its second
//   shows    what the University already holds for those words (a person, a mechanism card, a reading)
//   needed   why this answer will be needed: a kept quiz question rests on it, or a thing first said here is
//            leaned on again later in the lecture
// The model is never trusted: a quote or a name is kept only when it is found word for word inside its own stretch,
// and every time comes from what Whisper heard. Everything else here is plain code.
'use strict';
const fs = require('fs');
const path = require('path');
const uni = require('./uni');

const FLIP = path.join(uni.UNI, 'flip');
const flipFile = (slug, n) => path.join(FLIP, slug + '-' + (+n) + '.json');
const clock = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const clean = (v) => String(v == null ? '' : v).replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
const arr = (v) => (Array.isArray(v) ? v : []);
const KINDS = ['person', 'work', 'study', 'term', 'number', 'place'];
const LOW = 0.5; // a word Whisper was less sure of than this is listed, so a wrong word is never shown as fact

// Every word as heard, in order: { raw, s, e, p }.
function heardWords(tr) {
  const out = [];
  for (const sg of tr.segments) for (const w of sg.words || []) out.push({ raw: w[0], s: w[1], e: w[2], p: w[3] == null ? 1 : w[3] });
  return out;
}

// Cut the talk into stretches. A stretch ends at the end of a sentence, once it has run 40 seconds and the teacher
// pauses for a second, or once it has run 70 seconds; a sentence is never split. Pure.
function cut(R, opt = {}) {
  const MIN = opt.min || 40; const MAX = opt.max || 70; const PAUSE = opt.pause || 1;
  const out = []; let from = 0;
  for (let i = 0; i < R.length; i++) {
    const last = i === R.length - 1;
    const sentenceEnd = /[.?!]["')\]]*$/.test(R[i].raw);
    if (!last && !sentenceEnd) continue;
    const dur = R[i].e - R[from].s;
    const gap = last ? Infinity : R[i + 1].s - R[i].e;
    if (last || dur >= MAX || (dur >= MIN && gap >= PAUSE)) { out.push({ from, to: i }); from = i + 1; }
  }
  // a last scrap of a few seconds joins the stretch before it
  if (out.length > 1) { const z = out[out.length - 1]; if (R[z.to].e - R[z.from].s < 12) { out.pop(); out[out.length - 1].to = z.to; } }
  return out.map((x, k) => {
    const ws = R.slice(x.from, x.to + 1);
    const toks = []; ws.forEach((w, j) => { for (const t of uni.tokens(w.raw)) toks.push({ w: t, j }); });
    return { n: k + 1, start: ws[0].s, end: ws[ws.length - 1].e, text: ws.map((w) => w.raw).join(' '), ws, toks };
  });
}

// Where a run of words is said inside one stretch, word for word. Returns every place: { t, e }.
function saidIn(st, text, min = 1) {
  const q = uni.tokens(text); const hits = [];
  if (q.length < min) return hits;
  const T = st.toks;
  for (let i = 0; i + q.length <= T.length; i++) {
    let k = 0;
    while (k < q.length && T[i + k].w === q[k]) k++;
    if (k === q.length) { hits.push({ t: st.ws[T[i].j].s, e: st.ws[T[i + k - 1].j].e }); i += k - 1; }
  }
  return hits;
}

// What the model wrote for one stretch, held to the stretch's own words. Pure.
function gateStretch(raw, st) {
  const notes = [];
  const out = { q: '', answer: null, names: [], housekeeping: false };
  if (!raw || typeof raw !== 'object') { notes.push('nothing came back'); return { ...out, notes }; }
  let q = clean(raw.q);
  if (!q) out.housekeeping = true;
  else if (!/\?$/.test(q) || q.length < 12 || q.length > 220) { notes.push('the question was not a plain question: ' + q.slice(0, 60)); q = ''; }
  const quote = clean(raw.quote);
  const hit = quote ? saidIn(st, quote, 6)[0] : null;
  if (q && !hit) notes.push(quote ? 'the quote is not word for word in this part: ' + quote.slice(0, 60) : 'no quote');
  if (q && hit) { out.q = q; out.answer = { quote, t: hit.t, e: hit.e }; }
  const seen = new Set();
  for (const nm of arr(raw.names).slice(0, 12)) {
    const text = clean(nm && (nm.text || nm.name || (typeof nm === 'string' ? nm : '')));
    const key = uni.tokens(text).join(' ');
    if (!key || key.length < 3 || seen.has(key) || text.length > 60) continue;
    const hits = saidIn(st, text);
    if (!hits.length) { notes.push('"' + text.slice(0, 40) + '" is not said in this part'); continue; }
    seen.add(key);
    out.names.push({ text, kind: KINDS.includes(nm.kind) ? nm.kind : 'term', t: hits[0].t, times: hits.length });
  }
  return { ...out, notes };
}

function flipPrompt(title, parts) {
  return `A teacher gives answers out loud, and nobody asked the questions. You are writing the questions.
Below are numbered PARTS of one lecture, as a machine heard them. For EACH part write the question that part answers.
Plain words a 14 year old knows. Short. No dashes. Use only what the part says. Add no fact.

Return JSON: {"parts":[{"n":1,"q":"...","quote":"...","names":[{"text":"...","kind":"person"}]}]} with one entry for every part.
- q: ONE question a learner could be asked BEFORE hearing the part, which the part then answers. It must make sense by itself: name the thing it asks about, never say "this", "the lecture", "the speaker" or "the part". If the part is only housekeeping (hello, course rules, where to sit, what to read next week), give "q": "".
- quote: 8 to 40 words COPIED EXACTLY from that same part, letter for letter, in which the teacher gives the answer. Do not shorten, join or fix it.
- names: each person, book or work, study or experiment, special term, number with what it counts, or place that is said in the part. "text" is copied exactly as said. "kind" is one of: person, work, study, term, number, place. At most 8. An empty list if there are none.

LECTURE: ${title}

${parts.map((st) => 'PART ' + st.n + ':\n' + st.text).join('\n\n')}`;
}

// What the University already holds that a word in a lecture can open: people (every course's voices), the mind's
// mechanism cards, and this unit's own readings. Each has the runs of words that call it.
function holdings(slug, unit) {
  const out = [];
  const list = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'list.json'), 'utf8'));
  const keyOf = (text) => uni.tokens(String(text).replace(/\([^)]*\)/g, ' ')).filter((w, i) => !(i === 0 && w === 'the'));
  const ok = (k) => k.length > 1 || (k.length === 1 && k[0].length >= 5);
  const people = new Map();
  for (const c of list.courses) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', c.slug + '.json'), 'utf8')); } catch (e) { continue; }
    for (const v of Object.values(j.voices || {})) {
      if (!v || !v.name || (people.has(v.name) && c.slug !== slug)) continue;
      const full = keyOf(v.name);
      people.set(v.name, { kind: 'person', name: v.name, note: clean((v.what || '') + '. ' + (v.did || '')), link: c.slug + '.html', keys: [full, full.slice(-1)].filter(ok) });
    }
    if (c.shelf === 'supplement') for (const u of j.units || []) out.push({ kind: 'mechanism', name: u.title, note: clean(u.needIt || u.why || ''), link: c.slug + '.html#u' + u.n, keys: [keyOf(String(u.title).split(':')[0])].filter(ok) });
  }
  out.push(...people.values());
  for (const p of (unit && unit.companions) || []) {
    if (p.role !== 'read' || !p.title) continue;
    const pieces = String(p.title).replace(/\([^)]*\)/g, ' ').split(',').map((x) => x.trim()).filter((x) => x && !/^(book|chapter|part|lecture|volume)\b/i.test(x) && !/'s\b/.test(x.split(' ')[0]));
    const keys = pieces.map(keyOf).filter(ok).filter((k) => ![...people.values()].some((pp) => pp.keys.some((pk) => pk.join(' ') === k.join(' '))));
    if (keys.length) out.push({ kind: 'reading', name: p.title, note: clean(p.by || ''), link: p.url || '', keys });
  }
  return out.filter((h) => h.keys.length);
}

// Turn one heard lecture inside out. tr is what the listener wrote ({ title, segments }); ctx carries what the
// University knows around it ({ slug, n, unit, item, file }); ask is the model, swapped in a test.
async function flipLecture(tr, ctx = {}, log = () => {}, ask = uni.askOllama, opt = {}) {
  const R = heardWords(tr);
  if (R.length < 50) throw new Error('This lecture has almost no words heard, so there is nothing to turn over.');
  const S = cut(R, opt);
  const BATCH = opt.batch || 6;
  const got = new Map(); const notes = [];
  const round = async (parts) => {
    let raw = {};
    try { raw = await ask(flipPrompt(tr.title || ctx.title || '', parts)); } catch (err) { if (/not answering|is it installed/.test(err.message)) throw err; notes.push('parts ' + parts[0].n + ' to ' + parts[parts.length - 1].n + ': the model failed, ' + err.message); }
    const byN = new Map(arr(raw && raw.parts).map((p) => [+(p && p.n), p]));
    for (const st of parts) {
      const g = gateStretch(byN.get(st.n), st);
      const old = got.get(st.n);
      if (!old || (!old.answer && (g.answer || g.housekeeping)) || (!old.answer && g.names.length > old.names.length)) got.set(st.n, g);
    }
  };
  for (let i = 0; i < S.length; i += BATCH) {
    const parts = S.slice(i, i + BATCH);
    await round(parts);
    log('Parts ' + parts[0].n + ' to ' + parts[parts.length - 1].n + ' of ' + S.length + ': ' + parts.filter((st) => got.get(st.n).answer).length + ' of ' + parts.length + ' have a question with the teacher\'s own words.');
  }
  // a part that came back with no question and was not called housekeeping is asked again by itself, twice at most
  for (let again = 0; again < 2; again++) {
    const left = S.filter((st) => { const g = got.get(st.n); return !g.answer && !g.housekeeping; });
    if (!left.length) break;
    log('Asking again for ' + left.length + ' part' + (left.length === 1 ? '' : 's') + ' by ' + (left.length === 1 ? 'itself' : 'themselves') + '.');
    for (const st of left) await round([st]);
  }

  const H = ctx.holdings || [];
  const stretches = S.map((st) => {
    const g = got.get(st.n);
    const shows = [];
    for (const h of H) {
      let first = null; let said = '';
      for (const k of h.keys) { const hit = saidIn(st, k.join(' '))[0]; if (hit && (!first || hit.t < first.t)) { first = hit; said = k.join(' '); } }
      if (first) shows.push({ kind: h.kind, name: h.name, note: h.note, link: h.link, t: first.t, said });
    }
    const names = g.names.map((nm) => {
      const key = uni.tokens(nm.text).join(' ');
      const held = shows.some((s) => (' ' + key + ' ').includes(' ' + s.said + ' ') || (' ' + s.said + ' ').includes(' ' + key + ' '));
      return { ...nm, held };
    });
    return {
      n: st.n, start: st.start, end: st.end, clock: clock(st.start) + ' to ' + clock(st.end),
      q: g.q, answer: g.answer, housekeeping: g.housekeeping, names, shows: shows.sort((a, b) => a.t - b.t), needed: [],
      low: st.ws.filter((w) => w.p < LOW).map((w) => ({ word: w.raw, t: w.s })),
      text: st.text, words: st.ws.map((w) => [w.raw, w.s, w.e]),
      notes: g.notes,
    };
  });

  // Needed, kind 1: a kept quiz question's quote is said here.
  for (const q of (ctx.unit && ctx.unit.quiz) || []) {
    if (!q.quote) continue;
    const k = S.findIndex((st) => saidIn(st, q.quote, 5).length);
    if (k >= 0) stretches[k].needed.push({ why: 'quiz', q: q.q });
  }
  // Needed, kind 2: a thing first said here is said again in two or more later stretches.
  const firstSeen = new Set();
  S.forEach((st, k) => {
    for (const nm of stretches[k].names) {
      const key = uni.tokens(nm.text).join(' ');
      if (firstSeen.has(key)) continue;
      firstSeen.add(key);
      if (S.slice(0, k).some((p) => saidIn(p, nm.text).length)) continue; // said earlier, before anyone named it
      const again = [];
      for (let j = k + 1; j < S.length; j++) { const hit = saidIn(S[j], nm.text)[0]; if (hit) again.push(hit.t); }
      if (again.length >= 2) stretches[k].needed.push({ why: 'later', name: nm.text, again: again.length, at: again.slice(0, 6) });
    }
  });

  // What is named and nothing is held for: the list of what is worth making next.
  const miss = new Map();
  for (const s of stretches) for (const nm of s.names) if (!nm.held) {
    const key = uni.tokens(nm.text).join(' ');
    const m = miss.get(key) || { text: nm.text, kind: nm.kind, parts: 0, at: [] };
    m.parts++; if (m.at.length < 6) m.at.push(nm.t); miss.set(key, m);
  }
  const asked = stretches.filter((s) => s.answer).length;
  return {
    title: tr.title || ctx.title || '', seconds: Math.round(R[R.length - 1].e), wordCount: R.length,
    counts: { stretches: stretches.length, asked, housekeeping: stretches.filter((s) => s.housekeeping).length, noQuestion: stretches.filter((s) => !s.answer && !s.housekeeping).length, names: stretches.reduce((a, s) => a + s.names.length, 0), shows: stretches.reduce((a, s) => a + s.shows.length, 0), needed: stretches.filter((s) => s.needed.length).length, lowWords: stretches.reduce((a, s) => a + s.low.length, 0) },
    stretches, nothingHeld: [...miss.values()].sort((a, b) => b.parts - a.parts), notes,
  };
}

// The same file as a page a person can read top to bottom.
function readable(f) {
  const L = ['# The flip side: ' + f.title, '',
    f.counts.stretches + ' stretches over ' + clock(f.seconds) + ' (' + f.wordCount + ' words, each with its own time in the .json beside this).',
    f.counts.asked + ' have a question with the teacher\'s own words as the answer. ' + f.counts.housekeeping + ' are housekeeping. ' + f.counts.noQuestion + ' got no question that passed the check.',
    f.counts.names + ' things named, ' + f.counts.shows + ' moments where the University already holds something, ' + f.counts.needed + ' stretches marked as an answer that will be needed (the hat).',
    f.counts.lowWords + ' words Whisper was unsure of.', ''];
  for (const s of f.stretches) {
    L.push('## ' + s.n + '. ' + s.clock + (s.needed.length ? '  [hat]' : ''), '');
    if (s.answer) L.push('**Question:** ' + s.q, '', '**The teacher\'s words, at ' + clock(s.answer.t) + ':** "' + s.answer.quote + '"', '');
    else L.push(s.housekeeping ? '_Housekeeping, no question._' : '_No question passed the check._', '');
    for (const nd of s.needed) L.push(nd.why === 'quiz' ? '- Needed: the quiz asks "' + nd.q + '"' : '- Needed: "' + nd.name + '" is first said here and comes back in ' + nd.again + ' later stretches (' + nd.at.map(clock).join(', ') + ')');
    for (const sh of s.shows) L.push('- Shows at ' + clock(sh.t) + ' (' + sh.kind + '): ' + sh.name + (sh.link ? ' -> ' + sh.link : ''));
    const free = s.names.filter((x) => !x.held);
    if (free.length) L.push('- Named, nothing held yet: ' + free.map((x) => x.text + ' (' + x.kind + ', ' + clock(x.t) + ')').join('; '));
    if (s.low.length) L.push('- Unsure words: ' + s.low.map((x) => x.word + ' (' + clock(x.t) + ')').join(', '));
    L.push('', '> ' + s.text, '');
  }
  if (f.nothingHeld.length) {
    L.push('## Named in this lecture, and the University holds nothing for it yet', '');
    for (const m of f.nothingHeld.slice(0, 60)) L.push('- ' + m.text + ' (' + m.kind + '), in ' + m.parts + ' stretch' + (m.parts === 1 ? '' : 'es') + ': ' + m.at.map(clock).join(', '));
    L.push('');
  }
  return L.join('\n');
}

// One unit of a course whose lecture has been heard.
async function flip(slug, n, log = () => {}, ask = uni.askOllama) {
  if (!/^[a-z0-9-]+$/.test(String(slug))) throw new Error('Not a course slug: ' + String(slug).slice(0, 40));
  let c; try { c = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', slug + '.json'), 'utf8')); } catch (e) { throw new Error('No course ' + slug); }
  const unit = c.units.find((x) => x.n === +n) || (c.todo || []).find((x) => x.n === +n);
  if (!unit) throw new Error('No unit ' + n + ' in ' + slug);
  const m = unit.main || unit.lecture;
  if (!m || !m.item || !m.file) throw new Error('Unit ' + n + ' plays no lecture, so there is nothing to turn over.');
  const tr = uni.transcript(m.item, m.file);
  if (!tr) throw new Error('This lecture has not been heard yet. Run: node scripts/uni.js listen ' + slug);
  const f = await flipLecture(tr, { slug, n: +n, unit, holdings: holdings(slug, unit) }, log, ask);
  const out = { slug, n: +n, unit: unit.title, item: m.item, file: m.file, model: process.env.UNI_MODEL || 'gemma4:12b', made: new Date().toISOString(), ...f };
  fs.mkdirSync(FLIP, { recursive: true });
  fs.writeFileSync(flipFile(slug, n), JSON.stringify(out, null, 1));
  fs.writeFileSync(flipFile(slug, n).replace(/\.json$/, '.md'), readable(out));
  return { ...out, path: path.relative(path.join(uni.UNI, '..', '..'), flipFile(slug, n)) };
}

module.exports = { flip, flipLecture, cut, heardWords, saidIn, gateStretch, holdings, readable, flipPrompt, FLIP };
