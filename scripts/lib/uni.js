// Void University course recipe engine (15 Nov 2026). Bryan: "build the system that we will use to put these
// together in the future as HQ", and "it's not just we show videos we create curriculum from what we find".
//
// One place for the steps that need no AI, so HQ (University tab) and scripts/uni.js run the same code:
//   overview()           every area: what was found, the courses proposed, the courses built, what each still needs
//   scaffold(area, name) turn a proposed course from sources/<area>.json into courses/<slug>.json (a plan, no units yet)
//   brief(...)           the complete, ready-to-paste prompt for the one step that needs a Claude chat (a unit, a rewrite)
//   check()              every link answers, every licence is written down, no forbidden source, no em dashes
// The recipe itself, step by step, is profiles/university/docs/COURSE-RECIPE.md.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const UNI = path.join(ROOT, 'profiles', 'university');
const SRC = path.join(UNI, 'sources');
const COURSES = path.join(UNI, 'courses');
const LIST = path.join(UNI, 'list.json');
const CHECK = path.join(SRC, 'check.json');
const FORBIDDEN = /openstax|radiopaedia/i; // Bryan, 15 Nov 2026: "Re-source from papers"
// Terms that forbid AI use or ingestion (MIT OCW, read 15 Nov 2026, allows it with credit, so a bare mention is not enough).
const AI_WORD = /\bA\.?I\b|[Aa]rtificial [Ii]ntelligence|[Ll]anguage [Mm]odels?|[Ii]ngest/;
const AI_NO = new RegExp('\\b([Nn]ot|[Nn]o|[Pp]rohibit\\w*|[Ff]orbid\\w*|without (written )?permission)\\b[^.]{0,80}(' + AI_WORD.source + ')');
const AI_NO2 = new RegExp('(' + AI_WORD.source + ')[^.]{0,60}(prohibited|forbidden|not (be )?(permitted|allowed))');
const DASH = /\u2014|\u2013/; // no em or en dashes anywhere (Bryan's rule)

const SLUG_OK = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PRIVATE = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i; // the check never calls this PC or the home network
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');
const list = () => readJson(LIST, { types: [], courses: [] });
const areaFile = (area) => path.join(SRC, slugify(area) + '.json');
const courseFile = (slug) => path.join(COURSES, slug + '.json');
const builtCourses = () => fs.readdirSync(COURSES).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(COURSES, f), null)).filter(Boolean);

// What a unit still needs before it is finished. The same list the build and the brief use.
// A found course (built from an open course or book) also needs a quiz that quotes it; a supplement card (the mind's
// mechanisms) is small and has no main piece of its own.
function unitNeeds(u, c = {}) {
  const need = [];
  if (!u.needIt) need.push('why you need this');
  if (!u.scene && !u.lab) need.push('scene');
  if (!u.main && c.shelf !== 'supplement') need.push('main piece');
  if (c.kind === 'found' && !(u.quiz || []).length) need.push('quiz');
  if (c.shelf !== 'supplement' && !u.crystal) need.push('crystal');
  return need;
}

function overview() {
  const L = list();
  const inList = Object.fromEntries((L.courses || []).map((c) => [c.slug, c]));
  const built = builtCourses();
  const check = readJson(CHECK, null);
  return {
    checkedAt: check ? check.at : null,
    problems: check ? check.problems.length : null,
    areas: (L.types || []).map((area) => {
      const f = readJson(areaFile(area), null);
      const sources = f ? f.sources || [] : [];
      const kinds = {};
      for (const s of sources) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
      const courses = built.filter((c) => c.domain === area).map((c) => ({
        slug: c.slug, name: c.name, kind: c.kind, live: !!(inList[c.slug] && inList[c.slug].live),
        planned: c.planned || (c.todo || []).length + c.units.length, ready: c.units.filter((u) => !unitNeeds(u, c).length).length,
        units: c.units.map((u) => ({ n: u.n, title: u.title, needs: unitNeeds(u, c) })),
        todo: (c.todo || []).map((t) => ({ n: t.n, title: t.title })),
      }));
      const madeNames = new Set(built.map((c) => c.name.toLowerCase()));
      return {
        area, slug: slugify(area), found: !!f, checked: f ? f.checked : null, sources: sources.length, kinds,
        old: sources.filter((s) => s.old).length,
        proposed: (f ? f.courses || [] : []).map((c) => ({ name: c.name, why: c.why, units: (c.units || []).length, spine: c.spine, made: madeNames.has(String(c.name).toLowerCase()) })),
        courses,
      };
    }),
  };
}

function sourceById(area, id) {
  const f = readJson(areaFile(area), { sources: [] });
  return (f.sources || []).find((s) => s.id === id) || null;
}

// A proposed course becomes a course file: the plan (units to do), its source and licence, its audiences.
// Units arrive one at a time through brief(); the build skips a course until it has one finished unit.
function scaffold(area, name) {
  const f = readJson(areaFile(area), null);
  if (!f) throw new Error('No source list for ' + area + ' yet.');
  const p = (f.courses || []).find((c) => String(c.name).toLowerCase() === String(name).toLowerCase());
  if (!p) throw new Error('No proposed course called "' + name + '" in ' + area + '.');
  const slug = slugify(p.name);
  if (fs.existsSync(courseFile(slug))) throw new Error('courses/' + slug + '.json already exists.');
  const spine = (f.sources || []).find((s) => s.id === p.spine) || null;
  const found = spine && spine.kind === 'open-course';
  const course = {
    slug, name: p.name, domain: area, kind: found ? 'found' : 'authored', status: 'draft',
    levels: p.levels || ['high school', 'young adults', 'everyday'], planned: (p.units || []).length,
    source: spine ? { id: spine.id, title: spine.title, by: spine.by, url: spine.url, licence: spine.licence } : undefined,
    uses: p.uses || [],
    draftedBy: 'scaffold from sources/' + slugify(area) + '.json, ' + new Date().toISOString().slice(0, 10),
    why: p.why || '', outcomes: [], units: [], voices: {},
    todo: (p.units || []).map((t, i) => ({ n: i + 1, title: t })),
  };
  writeJson(courseFile(slug), course);
  const L = list();
  if (!(L.courses || []).some((c) => c.slug === slug)) {
    L.courses.push({ slug, name: p.name, type: area, kind: course.kind, status: 'draft', live: false });
    writeJson(LIST, L);
  }
  return { slug, file: path.relative(ROOT, courseFile(slug)), todo: course.todo.length };
}

// The goes-live switch: build.js --site carries only courses marked live. Deploying is still Bryan's own step.
function setLive(slug, live) {
  const L = list();
  const c = (L.courses || []).find((x) => x.slug === slug);
  if (!c) throw new Error('No course ' + slug + ' in list.json');
  c.live = !!live;
  writeJson(LIST, L);
  return { slug, live: c.live };
}

// The one step that needs a Claude chat, written out whole so it can be pasted as it is (Bryan: whole prompts, not kits).
function brief(slug, n) {
  if (!SLUG_OK.test(String(slug))) throw new Error('Not a course slug: ' + String(slug).slice(0, 40));
  const c = readJson(courseFile(slug), null);
  if (!c) throw new Error('No course ' + slug);
  const t = (c.todo || []).find((x) => x.n === +n) || c.units.find((x) => x.n === +n);
  if (!t) throw new Error('No unit ' + n + ' in ' + slug);
  const sources = (c.uses || []).concat(c.source ? [c.source.id] : []).map((id) => sourceById(c.domain, id)).filter(Boolean);
  const example = (readJson(courseFile('human-nature'), { units: [] }).units || [])[0];
  return `You are building one unit of Void University (university.voidtv.net), a free public learning site, in C:\\Users\\bryan\\void-channel\\profiles\\university.

COURSE: ${c.name} (courses/${slug}.json), area ${c.domain}. Why the course: ${c.why}
UNIT ${t.n}: ${t.title}
${t.lecture ? "LECTURE: " + t.lecture.title + " (Archive item " + t.lecture.item + ", file " + t.lecture.file + "; transcript and chapter times on " + (t.lecture.page || "the course page") + ")\n" : ""}AUDIENCES: ${(c.levels || []).join(', ')}. Bryan, 15 Nov 2026: people say "it's cool but why do I need to know it". Every unit answers that first, in one plain sentence (needIt), for someone who will never work in the field.

SOURCES for this course (licences were read on their pages; keep their credit and licence):
${sources.map((s) => '- ' + s.id + ': ' + s.title + ', ' + s.by + '. ' + s.licence + '. ' + (s.url || '') + (s.text ? ' Text: ' + s.text : '') + (s.video && s.video.archive ? ' Video (' + s.video.files + ' lectures): archive.org/details/' + s.video.archive : '') + (s.audio && s.audio.archive ? ' Audio only on the Archive (' + s.audio.files + ' lectures; the filmed lectures are on the course page): archive.org/details/' + s.audio.archive : '') + (s.courseworkUrl ? ' Coursework: ' + s.courseworkUrl : '') + (s.notes ? ' Notes: ' + s.notes : '')).join('\n') || '- (none listed: find them first under the rules in sources/FORMAT.md)'}

STEPS:
1. Read profiles/university/sources/FORMAT.md (the source rules) and docs/COURSE-RECIPE.md (the recipe).
2. If the unit plays a lecture, run: node scripts/uni.js listen ${slug} (Whisper gives every word its own time in the Archive file; skip if already heard). Read the source material for this unit: the lecture transcript if it is a lecture, or the chapter if it is a book. Save what you read to your scratchpad, not the repo.
3. Write the unit into courses/${slug}.json: move it from "todo" into "units", keeping n and the title, in the same shape as this finished unit from Human nature:
${JSON.stringify(example ? { n: example.n, title: example.title, needIt: example.needIt, why: example.why, outcome: example.outcome, main: example.main, chapters: (example.chapters || []).slice(0, 2), quiz: (example.quiz || []).slice(0, 1), scene: example.scene ? { analogy: example.scene.analogy, '...': 'see scene.js and courses/human-nature.json for the full scene' } : undefined } : {}, null, 1)}
   - needIt: one plain sentence on how this helps a person decide or live better.
   - scene: an everyday analogy acted out with scene.js stamps (pictures first, Bryan 15 Nov). Check that no shapes or words overlap at 1316 and 821 wide.
   - main: the lecture video (Archive file) or the reading, with its licence. chapters: the times where the lecture changes topic.
   - crystal: the "Make it set" block (crystal.js; see a unit of courses/critical-thinking.json for the shape): five partials from the unit's own pieces, the key, two decoys each with why it is wrong, and the aha line.
   - Times: every quiz "t" and chapter "t" comes from node scripts/uni.js find ${slug} ${t.n} "<the quoted words>", never from the printed transcript's chapter marks; give each chapter a "words" field (its first few spoken words) so the check can confirm it.
   - quiz: about five questions. Each answer quotes the exact line of the source it comes from, with the time or page. Check every quote word for word against the transcript or text you saved.
   - Old books (old: true) are rewritten into plain modern English beside the original line. Anything now wrong or unsafe gets a plain warning and the current US government source.
4. Run: node profiles/university/build.js, then look at the unit in the preview (node profiles/university/serve.js, then http://127.0.0.1:8783) at 1920, 1316 and 821 wide: no sideways scroll, no broken images, no console errors.
5. Run: node scripts/uni.js check, and fix anything it lists for this course.
6. Commit as Bryan Korth with no Co-Authored-By line. Do not push and do not deploy; Bryan says when a course goes live.
RULES: plain language, no em dashes anywhere, OpenStax and Radiopaedia are forbidden, never get round a site that blocks or charges, use they/them for people.`;
}

// The plain-English rewrite of an old book chapter (the old-knowledge shelf, "Practical how-to" first, Bryan 15 Nov).
function rewriteBrief(area, id) {
  const s = sourceById(area, id);
  if (!s) throw new Error('No source ' + id + ' in ' + area);
  return `You are rewriting part of an old public-domain book into plain modern English for Void University's old-knowledge shelf (university.voidtv.net). Bryan, 15 Nov 2026: "proper English is now a former language a foreign language".

BOOK: ${s.title}, ${s.by}${s.year ? ', ' + s.year : ''}. ${s.licence}. Full text: ${s.text || s.url}
WHY IT MATTERS: ${s.needIt || ''}
NOTES FROM THE FINDER: ${s.notes || 'none'}

STEPS:
1. Read the table of contents and pick the chapters that are still useful today. List them with one line each on why.
2. For each chapter: the original passage, then the plain rewrite beside it, short sentences, words a 14-year-old knows. Keep every fact and every step; add nothing the book does not say.
3. Anything now wrong or unsafe (old medicine, food safety times, wiring, chemicals) gets a plain warning line and the current US government source (CDC, USDA, FDA, OSHA, ready.gov), read on its page.
4. Write it to profiles/university/shelf/${s.id}.json as { "source": "${s.id}", "chapters": [ { "title", "why", "passages": [ { "old", "plain", "warning"? } ] } ] }.
5. Commit as Bryan Korth with no Co-Authored-By line. Do not push and do not deploy.
RULES: plain language, no em dashes anywhere, never get round a site that blocks or charges.`;
}

// Every link answers; every source names its licence and where it was seen; nothing forbidden; no dashes; every
// built unit's quiz is whole. Writes sources/check.json, which HQ shows.
async function check(log = () => {}) {
  const problems = [];
  const urls = new Map();
  const walkText = (where, v) => {
    if (typeof v === 'string') { if (DASH.test(v)) problems.push({ where, what: 'has an em or en dash: ' + v.slice(0, 80) }); if (FORBIDDEN.test(v)) problems.push({ where, what: 'names a forbidden source: ' + v.slice(0, 80) }); }
    else if (Array.isArray(v)) v.forEach((x, i) => walkText(where, x));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walkText(where, v[k]);
  };
  for (const area of list().types || []) {
    const f = readJson(areaFile(area), null);
    if (!f) { problems.push({ where: area, what: 'no source list yet' }); continue; }
    const ids = new Set();
    for (const s of f.sources || []) {
      const where = slugify(area) + '.json ' + s.id;
      if (ids.has(s.id)) problems.push({ where, what: 'id used twice' }); ids.add(s.id);
      if (!s.licence) problems.push({ where, what: 'no licence' });
      if (!s.licenceSeen) problems.push({ where, what: 'licence not shown where it was seen' });
      // sentence by sentence, skipping the finder's own "No clause about AI found" lines
      if (String(s.terms || '').split(/(?<=\.)\s+/).some((t) => !/^no\b|\bfound\b/i.test(t) && (AI_NO.test(t) || AI_NO2.test(t)))) problems.push({ where, what: 'terms may forbid AI use, read them (link only until checked): ' + String(s.terms).slice(0, 90) });
      walkText(where, s);
      for (const k of ['url', 'text', 'courseworkUrl']) {
        if (!s[k]) continue;
        if (!/^https?:\/\//.test(s[k])) problems.push({ where, what: k + ' is not a web link: ' + String(s[k]).slice(0, 60) });
        else if (PRIVATE.test(s[k])) problems.push({ where, what: k + ' points at this PC or the home network: ' + s[k] });
        else urls.set(s[k], where);
      }
      for (const m of [s.video, s.audio]) if (m && m.archive) urls.set('https://archive.org/metadata/' + m.archive + '/metadata/identifier', where + ' (Archive item)');
    }
    for (const c of f.courses || []) { if (c.spine && !ids.has(c.spine)) problems.push({ where: slugify(area) + '.json course ' + c.name, what: 'spine ' + c.spine + ' is not in the sources' }); walkText(slugify(area) + '.json course ' + c.name, c); }
  }
  for (const c of builtCourses()) for (const u of [...c.units, ...(c.todo || [])]) if (!Number.isInteger(u.n)) problems.push({ where: c.slug, what: 'a unit number is not a whole number: ' + String(u.n).slice(0, 20) });
  for (const c of builtCourses()) walkText(c.slug + '.json', c);
  for (const c of builtCourses()) for (const u of c.units) for (const [i, q] of (u.quiz || []).entries()) {
    if (!(q.a >= 0 && q.a < (q.choices || []).length)) problems.push({ where: c.slug + ' unit ' + u.n + ' quiz ' + (i + 1), what: 'the answer is not one of the choices' });
    if (!q.quote) problems.push({ where: c.slug + ' unit ' + u.n + ' quiz ' + (i + 1), what: 'no quote from the source' });
  }
  // Times: where a lecture has been listened to (Whisper), every quiz quote and chapter must sit within 20 seconds of
  // where the words are really said in that video file.
  for (const c of builtCourses()) for (const u of c.units) {
    const m = u.main || {};
    if (!m.item || !m.file || !transcript(m.item, m.file)) continue;
    const at = (where, text, t) => { const hit = locate(m.item, m.file, text); if (!hit) problems.push({ where, what: 'the words were not found in the lecture: ' + String(text).slice(0, 60), level: 'note' }); else if (Math.abs(hit.t - t) > 20) problems.push({ where, what: 'set at ' + t + ' s, but said at ' + Math.round(hit.t) + ' s (node scripts/uni.js find)' }); };
    for (const [i, q] of (u.quiz || []).entries()) at(c.slug + ' unit ' + u.n + ' quiz ' + (i + 1), q.quote, q.t);
    for (const ch of u.chapters || []) if (ch.words) at(c.slug + ' unit ' + u.n + ' chapter ' + ch.title, ch.words, ch.t);
  }
  let n = 0;
  const all = [...urls.entries()];
  const one = async ([url, where]) => {
    try {
      const r = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'VoidUniversity-linkcheck/1.0' }, signal: AbortSignal.timeout(20000) });
      if ([403, 429, 503].includes(r.status)) problems.push({ where, what: 'the site refused the checker (' + r.status + '); open it by hand: ' + url, level: 'note' });
      else if (r.status >= 400) problems.push({ where, what: 'link answers ' + r.status + ': ' + url });
      if (/\/metadata\//.test(url) && r.ok) { const j = await r.json().catch(() => null); if (!j || !j.result) problems.push({ where, what: 'Archive item not found: ' + url }); }
      try { await r.body?.cancel(); } catch (e) { /* already read */ }
    } catch (e) { problems.push({ where, what: 'link did not answer (' + String(e.name || e.message) + '): ' + url }); }
    if (++n % 20 === 0) log(n + ' of ' + all.length + ' links checked');
  };
  for (let i = 0; i < all.length; i += 6) await Promise.all(all.slice(i, i + 6).map(one)); // six at a time: polite to the sites
  const out = { at: new Date().toISOString(), links: all.length, problems };
  writeJson(CHECK, out);
  return out;
}

// Listening (Bryan, 16 Nov 2026: "the whisper pipeline ... to allow time stamped location and using direct connections
// to other found material"). Whisper hears each lecture straight from its Archive file (sound streamed into memory,
// only text kept) and gives every word its own time in that file. So a quiz answer or chapter jumps to the second the
// words are said, and a phrase can be searched across every lecture we have heard.
const LISTEN = path.join(UNI, 'listen');
// The listener is the Kids pipeline's scripts/listen-episodes.py: master's copy once it lands there, the kids worktree's until then.
const LISTENER = [path.join(ROOT, 'scripts', 'listen-episodes.py'), path.join(ROOT, '..', 'void-kids', 'scripts', 'listen-episodes.py')].find((p) => fs.existsSync(p));
const PYTHON = 'C:\\Users\\bryan\\hardware-lab\\Scripts\\python.exe';
let HEARD = null;
function heard() { // item|file -> transcript file
  if (HEARD) return HEARD;
  HEARD = new Map();
  if (fs.existsSync(LISTEN)) for (const f of fs.readdirSync(LISTEN).filter((f) => f.endsWith('.json') && !/\.list\.json$|^_run/.test(f))) {
    const j = readJson(path.join(LISTEN, f), null);
    if (j && j.item && j.file && j.segments) HEARD.set(j.item + '|' + j.file, path.join(LISTEN, f));
  }
  return HEARD;
}
const CACHE_T = new Map();
function transcript(item, file) {
  const p = heard().get(item + '|' + file);
  if (!p) return null;
  if (!CACHE_T.has(p)) {
    const j = readJson(p, null);
    const words = [];
    for (const sg of j.segments) for (const w of sg.words) words.push({ w: norm(w[0]), raw: w[0], t: w[1] });
    CACHE_T.set(p, { ...j, words: words.filter((x) => x.w) });
  }
  return CACHE_T.get(p);
}
const norm = (w) => String(w).toLowerCase().replace(/[^a-z0-9]/g, '');
const tokens = (text) => String(text).split(/\s+/).map(norm).filter(Boolean);
// The second at which a quote begins: the window of the transcript that shares most words with the quote's first
// dozen words, in order of position. Whisper and the printed transcript differ a little, so it scores, not matches.
function locate(item, file, quote) {
  const tr = transcript(item, file);
  if (!tr) return null;
  const q = tokens(quote).slice(0, 12);
  if (q.length < 3) return null;
  let best = { score: 0, i: -1 };
  const W = tr.words;
  for (let i = 0; i + q.length <= W.length; i++) {
    if (W[i].w !== q[0] && W[i].w !== q[1] && W[i + 1].w !== q[1]) continue;
    let sc = 0;
    for (let k = 0, j = i; k < q.length && j < W.length && j < i + q.length + 4; k++) { const f = W.slice(j, j + 3).findIndex((x) => x.w === q[k]); if (f >= 0) { sc++; j += f + 1; } }
    if (sc > best.score) best = { score: sc, i };
  }
  if (best.score < Math.ceil(q.length * 0.6)) return null;
  return { t: W[best.i].t, score: best.score / q.length, said: W.slice(best.i, best.i + 16).map((x) => x.raw).join(' ') };
}
// A phrase across every lecture heard: the direct link from one found thing to the moment another one says it.
function search(phrase, limit = 40) {
  const q = tokens(phrase);
  const out = [];
  if (!q.length) return out;
  for (const [key] of heard()) {
    const [item, file] = key.split('|');
    const tr = transcript(item, file);
    const W = tr.words;
    for (let i = 0; i + q.length <= W.length && out.length < limit; i++) {
      if (q.every((x, k) => W[i + k].w === x)) out.push({ item, file, title: tr.title, t: W[i].t, context: W.slice(Math.max(0, i - 8), i + q.length + 12).map((x) => x.raw).join(' ') });
    }
  }
  return out;
}
// Set every quiz and chapter time in a course from where the words are really said (Whisper's times in the very file
// the page plays). A quote or chapter not found is left as it was and reported, so a person can look.
function retime(slug) {
  if (!SLUG_OK.test(String(slug))) throw new Error('Not a course slug: ' + String(slug).slice(0, 40));
  const c = readJson(courseFile(slug), null);
  if (!c) throw new Error('No course ' + slug);
  const out = { set: 0, same: 0, missing: [], unheard: [] };
  for (const u of c.units) {
    const m = u.main || {};
    if (!m.item || !m.file) continue;
    if (!transcript(m.item, m.file)) { out.unheard.push(u.n); continue; }
    const fix = (obj, text, label) => {
      const hit = locate(m.item, m.file, text);
      if (!hit) { out.missing.push('unit ' + u.n + ' ' + label); return; }
      const t = Math.max(0, Math.floor(hit.t) - 1); // a second early, so the words are not clipped
      if (Math.abs(t - obj.t) <= 2) out.same++; else { obj.t = t; out.set++; }
    };
    for (const [i, q] of (u.quiz || []).entries()) fix(q, q.quote, 'quiz ' + (i + 1));
    for (const ch of u.chapters || []) if (ch.words) fix(ch, ch.words, 'chapter ' + ch.title);
  }
  writeJson(courseFile(slug), c);
  return out;
}

// Listen to every lecture a course plays that has not been heard yet.
function listen(slug, run = true) {
  if (!SLUG_OK.test(String(slug))) throw new Error('Not a course slug: ' + String(slug).slice(0, 40));
  const c = readJson(courseFile(slug), null);
  if (!c) throw new Error('No course ' + slug);
  const want = [];
  for (const u of [...c.units, ...(c.todo || [])]) {
    const m = u.main || u.lecture;
    if (m && m.item && m.file && /\.(mp4|ogv|webm|mp3)$/i.test(m.file) && !heard().has(m.item + '|' + m.file)) want.push({ slug, season: 1, number: u.n, title: m.title || u.title, item: m.item, name: m.file, url: 'https://archive.org/download/' + encodeURIComponent(m.item) + '/' + encodeURIComponent(m.file) });
  }
  if (!want.length || !run) return { queued: want.length };
  if (!LISTENER) throw new Error('The listener (listen-episodes.py) is not on this PC.');
  fs.mkdirSync(LISTEN, { recursive: true });
  const listFile = path.join(LISTEN, slug + '.list.json');
  writeJson(listFile, want);
  require('child_process').execFileSync(PYTHON, ['-I', LISTENER, listFile, LISTEN], { stdio: 'inherit' });
  HEARD = null;
  return { queued: want.length };
}

// Recount what an Archive item really holds. The audit (16 Nov 2026) found 22 sources whose finder counted every file
// in an item as a lecture video, and Open Yale items that are sound only filed as video. A lecture is one original
// file: video if mp4, ogv, webm or mov (one per name, however many formats), audio if mp3. The result replaces the
// source's `video` or `audio` block, so the count comes from the Archive, never from a finder.
async function media(log = () => {}) {
  const changes = [];
  for (const area of list().types || []) {
    const file = areaFile(area);
    const f = readJson(file, null);
    if (!f) continue;
    let dirty = false;
    for (const s of f.sources || []) {
      const block = s.video || s.audio;
      if (!block || !block.archive) continue;
      let j = null;
      try { j = await fetch('https://archive.org/metadata/' + encodeURIComponent(block.archive), { signal: AbortSignal.timeout(30000) }).then((r) => r.json()); } catch (e) { /* counted as unreadable below */ }
      if (!j || !j.files) { changes.push({ where: slugify(area) + '.json ' + s.id, what: 'Archive item could not be read: ' + block.archive }); continue; }
      const names = (re) => new Set(j.files.filter((x) => x.source === 'original' && re.test(x.name) && !/\.ia\.mp4$/i.test(x.name)).map((x) => x.name.replace(/\.[^.]+$/, '')));
      const vids = names(/\.(mp4|ogv|webm|mov|m4v)$/i).size, mp3 = names(/\.mp3$/i).size;
      const now = vids ? { video: { archive: block.archive, files: vids } } : mp3 ? { audio: { archive: block.archive, files: mp3 } } : null;
      const before = JSON.stringify({ video: s.video, audio: s.audio });
      delete s.video; delete s.audio;
      if (now) Object.assign(s, now);
      else s.notes = (s.notes ? s.notes + ' ' : '') + 'The Archive item ' + block.archive + ' holds no video or mp3 lecture files.';
      if (JSON.stringify({ video: s.video, audio: s.audio }) !== before) { dirty = true; changes.push({ where: slugify(area) + '.json ' + s.id, what: before + ' -> ' + JSON.stringify(now) }); }
      log(s.id + ': ' + (vids ? vids + ' video' : mp3 ? mp3 + ' audio' : 'none'));
      await new Promise((r) => setTimeout(r, 300)); // polite to the Archive
    }
    if (dirty) writeJson(file, f);
  }
  return changes;
}

module.exports = { overview, scaffold, setLive, brief, rewriteBrief, check, media, listen, retime, locate, search, transcript, unitNeeds, slugify, UNI, SRC };
