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
// check(log, { links: false }) does everything but call the web (the self-test), and leaves check.json alone.
async function check(log = () => {}, opt = {}) {
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
  for (const b of shelfBooks()) { walkText('shelf/' + b.source + '.json', b.chapters.map((c) => [c.title, c.why, c.passages.map((x) => [x.plain, x.warnings])])); if (b.scan) urls.set(b.scan, 'shelf/' + b.source + '.json'); }
  for (const r of readJson(path.join(UNI, 'shelf', 'warnings.json'), { rules: [] }).rules || []) { walkText('shelf/warnings.json ' + r.id, [r.warning, r.source]); if (/^https:\/\//.test(r.url || '')) urls.set(r.url, 'shelf/warnings.json ' + r.id); else problems.push({ where: 'shelf/warnings.json ' + r.id, what: 'a warning needs an https page' }); }
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
  if (opt.links === false) return { at: new Date().toISOString(), links: 0, problems };
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
    for (const sg of j.segments) for (const w of sg.words) for (const part of tokens(w[0])) words.push({ w: part, raw: w[0], t: w[1] });
    CACHE_T.set(p, { ...j, words });
  }
  return CACHE_T.get(p);
}
// The printed transcript and Whisper write the same speech differently ("price-to-earnings ... fifteen" against "price to
// earnings ... 15"), so both sides split hyphens and read number words as digits before they are compared.
const NUM = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90', hundred: '100' };
const norm = (w) => { const x = String(w).toLowerCase().replace(/[^a-z0-9]/g, ''); return NUM[x] || x; };
const tokens = (text) => String(text).split(/[\s\-‐-―]+/).map(norm).filter(Boolean);
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

// The local draft (Bryan, 17 and 18 Nov 2026: every tool ends runnable without a Claude chat, local models for the
// thinking parts). A model on this PC (Ollama) reads the heard lecture and writes the words of a unit: why you need
// this, chapters, quiz, crystal. The model is never trusted: the gate below keeps a quiz answer or a chapter only when
// its quoted words are found, in order and word for word, in what Whisper heard, and takes the time from there.
// The draft goes to profiles/university/drafts/<slug>-<n>.json. keepDraft() moves it into the course once nothing is
// missing. The everyday scene is laid out by sceneFrom() from the model's words.
const DRAFTS = path.join(UNI, 'drafts');
const OLLAMA = process.env.UNI_OLLAMA || 'http://127.0.0.1:11434';
const DRAFT_MODEL = process.env.UNI_MODEL || 'gemma4:12b';
const draftFile = (slug, n) => path.join(DRAFTS, slug + '-' + (+n) + '.json');

// Where a quote is said word for word: every word of it, in order, with nothing between. Null if it is not.
function exact(tr, quote) {
  const q = tokens(quote);
  if (q.length < 5) return null;
  const W = tr.words;
  for (let i = 0; i + q.length <= W.length; i++) {
    if (W[i].w !== q[0]) continue;
    let k = 1;
    while (k < q.length && W[i + k].w === q[k]) k++;
    if (k === q.length) return { t: Math.round(W[i].t), i, n: q.length };
  }
  return null;
}
const clean = (v) => String(v == null ? '' : v).replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/\s+/g, ' ').trim();

// The everyday scene, from words alone (19 Nov 2026). A scene is a picture: two sides, the thing between them, what
// happens, how each side ends up, one spoken line; then every label turns into the idea's own word in place
// (scene.js). The local model gives only the words. This lays them out on places that are known not to touch, and
// refuses a word that is too long for its place, so nothing overlaps at any width. Pure.
const SCENE_FIT = { left: 20, right: 20, thing: 11, act: 11, leftEnd: 30, rightEnd: 30, line: 56 };
function sceneFrom(w) {
  w = w || {}; const idea = w.idea || {};
  const bad = [];
  const fit = (o, k, max, name) => { const v = clean(o[k]); if (!v) bad.push(name + ' is missing'); else if (v.length > max) bad.push(name + ' is over ' + max + ' letters: ' + v.slice(0, 40)); return v; };
  const a = {}; const b = {};
  for (const k of Object.keys(SCENE_FIT)) a[k] = fit(w, k, SCENE_FIT[k], k);
  for (const k of ['left', 'right', 'thing', 'act', 'line']) b[k] = fit(idea, k, SCENE_FIT[k], 'idea.' + k);
  const analogy = fit(w, 'analogy', 70, 'analogy');
  const says = (w.says || []).map(clean).filter(Boolean);
  if (says.length !== 4) bad.push('says needs exactly 4 captions (has ' + says.length + ')');
  for (const x of says) if (x.length > 70) bad.push('a caption is over 70 letters: ' + x.slice(0, 40));
  const ideaSay = fit(idea, 'say', 70, 'idea.say');
  if (bad.length) return { scene: null, notes: bad };
  const cardSize = (t) => (t.length <= 14 ? 22 : 18);
  const stampSize = (t) => (t.length <= 8 ? 18 : 14);
  const lineSize = (t) => (t.length <= 44 ? 22 : 18);
  const scene = {
    analogy,
    map: [[a.left, b.left], [a.right, b.right], [a.thing, b.thing]],
    actors: [
      { id: 'left', type: 'card', x: 40, y: 40, w: 250, h: 100, label: a.left, color: 'blue', o: 0, size: cardSize(a.left) },
      { id: 'right', type: 'card', x: 510, y: 40, w: 250, h: 100, label: a.right, color: 'blue', o: 0, size: cardSize(a.right) },
      { id: 'thing', type: 'stamp', x: 340, y: 20, w: 120, label: a.thing.toUpperCase(), color: 'gold', o: 0, s: 0.4, size: stampSize(a.thing) },
      { id: 'act', type: 'stamp', x: 340, y: 160, w: 120, label: a.act.toUpperCase(), color: 'fg', o: 0, s: 0.4, size: stampSize(a.act) },
      { id: 'line', type: 'text', x: 400, y: 325, label: a.line, color: 'pink', size: lineSize(a.line), o: 0 },
    ],
    beats: [
      { say: says[0], dur: 2.4, set: { left: { o: 1 }, right: { o: 1 }, thing: { o: 1, s: 1 } } },
      { say: says[1], dur: 2.4, set: { act: { o: 1, s: 1, shake: true } } },
      { say: says[2], dur: 2.6, set: { left: { sub: a.leftEnd }, right: { sub: a.rightEnd } } },
      { say: says[3], dur: 2.6, set: { line: { o: 1 } } },
      { say: ideaSay, dur: 3.4, set: {
        left: { label: b.left, size: cardSize(b.left), color: 'gold' }, right: { label: b.right, size: cardSize(b.right), color: 'green' },
        thing: { label: b.thing.toUpperCase(), size: stampSize(b.thing) }, act: { label: b.act.toUpperCase(), size: stampSize(b.act), color: 'pink' },
        line: { label: b.line, size: lineSize(b.line), color: 'green' } } },
    ],
  };
  return { scene, notes: [] };
}

// The gate. Takes what the model wrote and the transcript; returns the unit parts that passed and plain notes on
// everything dropped. Pure: no model, no web, no files (tests/uni.test.js runs it).
function gateDraft(raw, tr) {
  const notes = [];
  const unit = { needIt: clean(raw.needIt), why: clean(raw.why), outcome: clean(raw.outcome) };
  for (const k of ['needIt', 'why', 'outcome']) if (unit[k].length < 20) notes.push('"' + k + '" is missing or too short');
  for (const k of ['needIt', 'why', 'outcome']) if (FORBIDDEN.test(unit[k])) notes.push('"' + k + '" names a forbidden source');
  const chapters = [];
  for (const c of raw.chapters || []) {
    const hit = exact(tr, c.words);
    if (!clean(c.title) || !hit) { notes.push('chapter dropped, its opening words are not said in the lecture: ' + clean(c.title).slice(0, 50)); continue; }
    chapters.push({ t: hit.t, title: clean(c.title), words: clean(c.words) });
  }
  chapters.sort((a, b) => a.t - b.t);
  unit.chapters = chapters.filter((c, i) => !i || c.t - chapters[i - 1].t >= 60);
  const quiz = []; const seenQ = new Set();
  for (const q of raw.quiz || []) {
    const label = clean(q.q).slice(0, 50);
    const choices = (q.choices || []).map(clean).filter(Boolean);
    const hit = exact(tr, q.quote);
    if (!hit) { notes.push('question dropped, its quote is not said word for word: ' + label); continue; }
    if (hit.n < 8) { notes.push('question dropped, its quote is under 8 words: ' + label); continue; }
    if (choices.length !== 4 || new Set(choices.map((x) => x.toLowerCase())).size !== 4) { notes.push('question dropped, it needs 4 different choices: ' + label); continue; }
    if (!(Number.isInteger(q.a) && q.a >= 0 && q.a < 4)) { notes.push('question dropped, its answer is not one of the choices: ' + label); continue; }
    if (!clean(q.q) || !clean(q.why) || seenQ.has(hit.i)) { notes.push('question dropped, it repeats a quote or has no question or reason: ' + label); continue; }
    seenQ.add(hit.i);
    // the right answer moves to a place set by where the quote is said, so it is not always the first choice
    const right = choices[q.a]; const rest = choices.filter((x, i) => i !== q.a); const at = hit.i % 4;
    rest.splice(at, 0, right);
    quiz.push({ q: clean(q.q), choices: rest, a: at, why: clean(q.why), quote: clean(q.quote), t: hit.t });
  }
  unit.quiz = quiz.sort((a, b) => a.t - b.t);
  const cr = raw.crystal || {};
  const partials = (cr.partials || []).map(clean).filter(Boolean);
  const decoys = (cr.decoys || []).map((d) => ({ text: clean(d && d.text), why: clean(d && d.why) })).filter((d) => d.text && d.why);
  if (partials.length === 5 && decoys.length === 2 && clean(cr.key) && clean(cr.aha)) unit.crystal = { speed: 0.3, partials, key: clean(cr.key), decoys, aha: clean(cr.aha) };
  else notes.push('the crystal needs 5 partials, a key, 2 decoys with why, and an aha line');
  const missing = [];
  if (unit.needIt.length < 20) missing.push('why you need this');
  if (unit.chapters.length < 3) missing.push('3 chapters (has ' + unit.chapters.length + ')');
  if (unit.quiz.length < 4) missing.push('4 quiz questions (has ' + unit.quiz.length + ')');
  if (!unit.crystal) missing.push('crystal');
  const sc = sceneFrom(raw.scene);
  if (sc.scene) unit.scene = sc.scene; else { missing.push('scene'); notes.push(...sc.notes.map((x) => 'scene: ' + x)); }
  return { ok: !missing.length, missing, notes, unit };
}

// Plain JSON mode with thinking off: on gemma4:12b a strict schema with thinking on came back empty after 3 minutes;
// this way a 5,000 word lecture is answered in about 20 seconds (tried 19 Nov 2026). The gate checks the shape.
function draftPrompt(c, t, tr, more) {
  const lines = []; let cur = [];
  for (const sg of tr.segments) { cur.push(String(sg.text).trim()); if (cur.join(' ').split(' ').length > 60) { lines.push(cur.join(' ')); cur = []; } }
  if (cur.length) lines.push(cur.join(' '));
  return `You are writing one unit of Void University, a free public learning site. Plain language, short sentences, words a 14 year old knows. No dashes. Write only from the lecture below. Add no fact it does not say.

COURSE: ${c.name}. ${c.why}
UNIT ${t.n}: ${t.title}
AUDIENCES: ${(c.levels || []).join(', ')}. People say "it is cool, but why do I need to know it". needIt answers that first.

Write JSON with these fields:
- needIt: one or two plain sentences on how this helps a person decide or live better, with everyday examples, for someone who will never study the field.
- why: two or three sentences that tell the heart of the lecture as a small story.
- outcome: one short line that starts with a verb: what the learner can do afterwards.
- scene: the words for a small picture of ONE everyday situation that works the same way as the lecture's main idea (not the lecture's own example; something from a kitchen, a shop, a school, a street). Two sides face each other with one thing between them. Keep every length limit, they are hard limits:
  "analogy" (the situation in a few words, at most 70 letters), "left" and "right" (who or what is on each side, at most 20 letters each), "thing" (what is between them, one or two words, at most 11 letters), "act" (what happens, one word, at most 11 letters), "leftEnd" and "rightEnd" (how each side ends up, at most 30 letters each), "line" (what someone says or feels at the end, at most 56 letters), "says" (exactly 4 short captions telling it in order: the setup, what happens, the result, the feeling; at most 70 letters each), and "idea": the same picture renamed as the lecture's idea, with "left", "right", "thing", "act", "line" (same limits; the idea's own name for each part) and "say" (one caption that states the idea plainly, at most 70 letters).
- chapters: 4 to 7 parts of the lecture, in order. Each has "title" (a few plain words) and "words": the first 8 to 12 words spoken where that part begins, COPIED EXACTLY from the lecture text, letter for letter.
- quiz: ${more ? more + ' more questions, on other moments of the lecture than the ones already kept (listed at the end). ' : '6 questions. '}Each has "q", "choices" (4 different short answers), "a" (the place of the right one, 0 to 3), "why" (one or two plain sentences on why it is right), and "quote": ONE sentence of 10 to 40 words COPIED EXACTLY from the lecture text, letter for letter, that proves the answer. Do not shorten, join or fix the quote. Spread the questions across the whole lecture.
- crystal: "partials" (exactly 5 short true statements from the lecture that all point at one idea), "key" (that one idea in a sentence), "decoys" (exactly 2 tempting wrong ideas, each with "text" and "why" it is wrong according to the lecture), "aha" (one line saying how the partials fit the key).

LECTURE (heard by Whisper, word for word):
${lines.join('\n')}`;
}
async function askOllama(prompt) {
  let r;
  try {
    r = await fetch(OLLAMA + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: DRAFT_MODEL, stream: true, think: false, format: 'json', options: { temperature: 0.2, num_ctx: 24576 }, messages: [{ role: 'user', content: prompt }] }) });
  } catch (e) { throw new Error('Ollama is not answering at ' + OLLAMA + '. Start Ollama, then try again.'); }
  if (!r.ok) throw new Error('Ollama answered ' + r.status + ' for the model ' + DRAFT_MODEL + ' (is it installed? ollama pull ' + DRAFT_MODEL + ')');
  let text = ''; let buf = '';
  const dec = new TextDecoder();
  for await (const chunk of r.body) { // streamed, so a long answer never times out
    buf += dec.decode(chunk, { stream: true });
    const parts = buf.split('\n'); buf = parts.pop();
    for (const p of parts) if (p.trim()) { const j = JSON.parse(p); if (j.error) throw new Error('Ollama: ' + j.error); text += (j.message && j.message.content) || ''; }
  }
  try { return JSON.parse(text); } catch (e) { return {}; }
}
// Draft one unit on this PC. ask can be swapped in a test; by default it is the local model.
async function draft(slug, n, log = () => {}, ask = askOllama) {
  if (!SLUG_OK.test(String(slug))) throw new Error('Not a course slug: ' + String(slug).slice(0, 40));
  const c = readJson(courseFile(slug), null);
  if (!c) throw new Error('No course ' + slug);
  const t = (c.todo || []).find((x) => x.n === +n) || c.units.find((x) => x.n === +n);
  if (!t) throw new Error('No unit ' + n + ' in ' + slug);
  const m = t.main || t.lecture;
  if (!m || !m.item || !m.file) throw new Error('Unit ' + n + ' plays no lecture. The local draft works from a heard lecture.');
  const tr = transcript(m.item, m.file);
  if (!tr) throw new Error('This lecture has not been heard yet. Run: node scripts/uni.js listen ' + slug);
  let best = null; const kept = [];
  for (let round = 1; round <= 3; round++) {
    log('Round ' + round + ': ' + DRAFT_MODEL + ' is reading the lecture (' + tr.words.length + ' words). This takes a few minutes.');
    const raw = await ask(draftPrompt(c, t, tr, best ? 8 - kept.length : 0) + (best ? '\n\nALREADY KEPT:\n' + kept.map((q) => '- ' + q.q).join('\n') : ''));
    const g = gateDraft(raw, tr);
    for (const q of g.unit.quiz) if (!kept.some((k) => Math.abs(k.t - q.t) < 5)) kept.push(q);
    if (!best) best = { notes: [], unit: g.unit };
    best.notes.push(...g.notes.map((x) => 'round ' + round + ': ' + x));
    for (const k of ['needIt', 'why', 'outcome']) if (best.unit[k].length < 20) best.unit[k] = g.unit[k];
    if (g.unit.chapters.length > best.unit.chapters.length) best.unit.chapters = g.unit.chapters;
    best.unit.crystal = best.unit.crystal || g.unit.crystal;
    best.unit.scene = best.unit.scene || g.unit.scene;
    best.unit.quiz = kept.slice().sort((a, b) => a.t - b.t).slice(0, 7);
    best.missing = [];
    if (best.unit.needIt.length < 20) best.missing.push('why you need this');
    if (best.unit.chapters.length < 3) best.missing.push('3 chapters (has ' + best.unit.chapters.length + ')');
    if (best.unit.quiz.length < 4) best.missing.push('4 quiz questions (has ' + best.unit.quiz.length + ')');
    if (!best.unit.crystal) best.missing.push('crystal');
    if (!best.unit.scene) best.missing.push('scene');
    best.ok = !best.missing.length;
    log('Round ' + round + ': ' + best.unit.quiz.length + ' questions with a word for word quote, ' + best.unit.chapters.length + ' chapters' + (best.missing.length ? '; still missing: ' + best.missing.join(', ') : ''));
    if (best.ok && best.unit.quiz.length >= 5) break;
  }
  const lic = (c.units.find((u) => u.main && u.main.licence) || { main: {} }).main.licence || (c.source && c.source.licence) || '';
  const unit = { n: t.n, title: t.title, ...best.unit, main: t.main || { role: 'watch', title: m.title || t.title, by: (c.source && c.source.by) || '', item: m.item, file: m.file, seconds: Math.round(tr.seconds), licence: lic, note: 'A full lecture. Use the chapters to watch it in pieces.' } };
  const out = { slug, n: t.n, title: t.title, model: DRAFT_MODEL, made: new Date().toISOString(), ok: best.ok, missing: best.missing, notes: best.notes, unit };
  fs.mkdirSync(DRAFTS, { recursive: true });
  writeJson(draftFile(slug, t.n), out);
  return { ...out, file: path.relative(ROOT, draftFile(slug, t.n)) };
}
// Move a draft into its course. Refused while the gate or the unit's own needs list says something is missing, so a
// half unit never reaches a course that may be live.
function keepDraft(slug, n) {
  if (!SLUG_OK.test(String(slug))) throw new Error('Not a course slug: ' + String(slug).slice(0, 40));
  const d = readJson(draftFile(slug, n), null);
  if (!d) throw new Error('No draft for unit ' + n + ' of ' + slug + '. Run: node scripts/uni.js draft ' + slug + ' ' + n);
  const c = readJson(courseFile(slug), null);
  const needs = [...(d.ok ? [] : d.missing), ...unitNeeds(d.unit, c)];
  if (needs.length) throw new Error('Not kept yet. The draft still needs: ' + needs.join(', ') + '. Add it to ' + path.relative(ROOT, draftFile(slug, n)) + ' and run this again.');
  if (c.units.some((u) => u.n === d.unit.n)) throw new Error('Unit ' + n + ' is already written in courses/' + slug + '.json. Edit it there.');
  c.todo = (c.todo || []).filter((x) => x.n !== d.unit.n);
  if (!c.todo.length) delete c.todo;
  c.units.push(d.unit); c.units.sort((a, b) => a.n - b.n);
  writeJson(courseFile(slug), c);
  fs.unlinkSync(draftFile(slug, n));
  return { slug, n: d.unit.n, units: c.units.length };
}

// The old-knowledge shelf (Bryan, 15 Nov 2026: "outdated information in books that is just too outdated for people to
// ever read anymore ... proper English is now a former language, a foreign language"; practical how-to first).
// An old public-domain book from the Archive, its own words on one side and plain modern English on the other.
//   shelfPlan(area, id)   fetch the book's scanned text from the Archive and find its chapters -> shelf/<id>.json
//   shelfWrite(id, n)     the local model rewrites one chapter, passage by passage
// The original side is never written by the model: the code cuts it from the scan. The model writes only the plain
// side, and a passage whose rewrite is empty, far too short or far too long is left out and counted. Passages that
// name something now known to be unsafe get a warning from shelf/warnings.json (rules written by a person, each
// with a US government page). A book reaches the public copy only when it is marked live in list.json.
const SHELF = path.join(UNI, 'shelf');
const shelfFile = (id) => path.join(SHELF, id + '.json');
const HEAD_LINE = /^[A-Z][A-Z ,.'’-]{7,}$/;
const headKey = (l) => l.replace(/[^A-Z ]/g, '').replace(/ +/g, ' ').trim();
const near = (a, b) => { if (Math.abs(a.length - b.length) > 1) return false; if (a.length !== b.length) return a.includes(b) || b.includes(a); let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d <= 2; };

// Chapters from a scanned text: heading lines in capitals, each at its first place, without the book's own title
// (the running head on every page) and without the contents page. Pure.
function shelfChapters(text, title) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim());
  const titleKey = headKey(String(title).toUpperCase());
  const contents = lines.findIndex((l) => /^CONTENTS\.?$/.test(l));
  // the body starts at the last heading before the first line of real prose after the contents page
  const prose = lines.findIndex((l, i) => i > contents && l.length >= 40 && (l.match(/[a-z]/g) || []).length > l.length * 0.6);
  let bodyFrom = prose;
  for (let i = prose - 1; i > contents && i > prose - 12; i--) if (HEAD_LINE.test(lines[i])) { bodyFrom = i; break; }
  const seen = new Map();
  lines.forEach((l, i) => {
    if (i < bodyFrom || !HEAD_LINE.test(l)) return;
    const k = headKey(l);
    if (k.length < 8 || k === titleKey || titleKey.includes(k) || k.includes(titleKey)) return;
    const hit = [...seen.keys()].find((x) => near(x, k));
    if (hit) seen.get(hit).count++; else seen.set(k, { key: k, line: i, count: 1 });
  });
  const heads = [...seen.values()].sort((a, b) => a.line - b.line);
  return heads.map((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].line : lines.length;
    const body = lines.slice(h.line + 1, end).filter((l) => l && !HEAD_LINE.test(l) && !/^[\divxlc .,|-]{1,6}$/i.test(l) && (l.match(/[A-Za-z]/g) || []).length >= Math.max(3, l.length * 0.6));
    const flat = body.join('\n').replace(/([A-Za-z])-\n([a-z])/g, '$1$2').replace(/\n/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
    const sentences = flat.split(/(?<=[.!?]["']?)\s+(?=[A-Z"'])/);
    const passages = []; let cur = [];
    for (const s of sentences) { cur.push(s); if (cur.join(' ').split(' ').length >= 90) { passages.push(cur.join(' ')); cur = []; } }
    if (cur.length) { if (passages.length && cur.join(' ').split(' ').length < 40) passages[passages.length - 1] += ' ' + cur.join(' '); else passages.push(cur.join(' ')); }
    return { n: i + 1, title: h.key.charAt(0) + h.key.slice(1).toLowerCase(), passages: passages.map((old) => ({ old })) };
  }).filter((c) => c.passages.reduce((a, p) => a + p.old.split(' ').length, 0) >= 150).map((c, i) => ({ ...c, n: i + 1 }));
}

async function shelfPlan(area, id, log = () => {}) {
  const s = sourceById(area, id);
  if (!s) throw new Error('No source ' + id + ' in ' + area);
  if (!s.old) throw new Error(id + ' is not marked as an old book in the source list.');
  if (!SLUG_OK.test(String(id).toLowerCase())) throw new Error('Not a plain source id: ' + String(id).slice(0, 40));
  if (fs.existsSync(shelfFile(id))) throw new Error('shelf/' + id + '.json is already there. Rewrite a chapter with: node scripts/uni.js shelf write ' + id + ' 1');
  const m = /archive\.org\/details\/([^/?#\s]+)/.exec((s.text || '') + ' ' + (s.url || ''));
  if (!m) throw new Error('This book is not on the Internet Archive; the shelf reads Archive scans.');
  log('Reading the Archive item ' + m[1]);
  const meta = await (await fetch('https://archive.org/metadata/' + m[1] + '/files', { signal: AbortSignal.timeout(30000) })).json();
  const f = (meta.result || []).find((x) => /_djvu\.txt$/.test(x.name));
  if (!f) throw new Error('The Archive item has no scanned text file (_djvu.txt).');
  const r = await fetch('https://archive.org/download/' + m[1] + '/' + encodeURIComponent(f.name), { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('The Archive answered ' + r.status + ' for the text. It is left alone.');
  const text = await r.text();
  fs.mkdirSync(path.join(SHELF, 'text'), { recursive: true });
  fs.writeFileSync(path.join(SHELF, 'text', id + '.txt'), text);
  const chapters = shelfChapters(text, s.title);
  if (!chapters.length) throw new Error('No chapters found in the scan. Its headings may not be in capitals.');
  const book = { source: id, area, title: s.title, by: s.by, year: s.year, licence: s.licence, url: s.url || s.text, levels: s.levels || [], needIt: s.needIt || '', scan: 'https://archive.org/details/' + m[1], chapters };
  writeJson(shelfFile(id), book);
  return { id, file: path.relative(ROOT, shelfFile(id)), chapters: chapters.map((c) => ({ n: c.n, title: c.title, passages: c.passages.length })) };
}

function shelfWarnings() { return (readJson(path.join(SHELF, 'warnings.json'), { rules: [] }).rules || []).map((r) => ({ ...r, re: new RegExp('\\b(' + r.words.join('|') + ')\\b', 'i') })); }
// The gate for one rewritten passage. Pure.
function gatePlain(old, plain) {
  const p = clean(plain);
  const a = old.split(' ').length, b = p ? p.split(' ').length : 0;
  if (!b) return { plain: null, why: 'no rewrite came back' };
  if (FORBIDDEN.test(p)) return { plain: null, why: 'names a forbidden source' };
  if (b < a * 0.4) return { plain: null, why: 'the rewrite is under half the length, so steps are probably lost (' + b + ' words for ' + a + ')' };
  if (b > a * 1.4) return { plain: null, why: 'the rewrite is much longer, so something was probably added (' + b + ' words for ' + a + ')' };
  return { plain: p };
}
async function askPlain(prompt) {
  let r;
  try { r = await fetch(OLLAMA + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: DRAFT_MODEL, stream: false, think: false, format: 'json', options: { temperature: 0.2, num_ctx: 4096 }, messages: [{ role: 'user', content: prompt }] }) }); }
  catch (e) { throw new Error('Ollama is not answering at ' + OLLAMA + '. Start Ollama, then try again.'); }
  if (!r.ok) throw new Error('Ollama answered ' + r.status + ' for the model ' + DRAFT_MODEL);
  try { return JSON.parse((await r.json()).message.content); } catch (e) { return {}; }
}
async function shelfWrite(id, n, log = () => {}, ask = askPlain) {
  if (!SLUG_OK.test(String(id).toLowerCase())) throw new Error('Not a plain source id: ' + String(id).slice(0, 40));
  const book = readJson(shelfFile(id), null);
  if (!book) throw new Error('No shelf/' + id + '.json yet. Start with: node scripts/uni.js shelf plan <area> ' + id);
  const ch = book.chapters.find((c) => c.n === +n);
  if (!ch) throw new Error('No chapter ' + n + '. This book has chapters 1 to ' + book.chapters.length + '.');
  const rules = shelfWarnings();
  const head = 'This is from "' + book.title + '" by ' + book.by + ', ' + book.year + ', scanned by a machine, so a few letters may be wrong. ';
  if (!ch.why) {
    const first = ch.passages.slice(0, 3).map((p) => p.old).join(' ');
    const a = await ask(head + 'The chapter heading, as scanned, is "' + ch.title + '". Give JSON with "title" (the heading with scanning mistakes fixed, in plain sentence case, no more than 8 words) and "why" (one plain sentence, no dashes, on why this chapter is still useful to someone today).\n\nCHAPTER START:\n' + first);
    if (clean(a.title) && clean(a.title).length <= 70) ch.title = clean(a.title);
    ch.why = clean(a.why);
  }
  let done = 0, left = 0;
  for (const [i, p] of ch.passages.entries()) {
    if (!p.plain) {
      let g = { plain: null };
      for (let round = 0; round < 2 && !g.plain; round++) {
        const a = await ask(head + 'Rewrite the passage below in plain modern English: short sentences, words a 14 year old knows, the reader is "you". Keep every fact, number, name and step. Add nothing the passage does not say, no advice of your own. Fix obvious scanning mistakes. No dashes. Give JSON with one field, "plain".\n\nPASSAGE:\n' + p.old);
        g = gatePlain(p.old, a.plain);
      }
      if (g.plain) { p.plain = g.plain; delete p.skipped; } else p.skipped = g.why;
      writeJson(shelfFile(id), book); // saved after every passage, so a stopped run carries on where it was
      if ((i + 1) % 5 === 0) log((i + 1) + ' of ' + ch.passages.length + ' passages');
    }
    const w = rules.filter((r) => r.re.test(p.old)).map((r) => ({ text: r.warning, source: r.source, url: r.url }));
    if (w.length) p.warnings = w; else delete p.warnings;
    if (p.plain) done++; else left++;
  }
  writeJson(shelfFile(id), book);
  return { id, n: ch.n, title: ch.title, done, left, warned: ch.passages.filter((p) => p.warnings).length };
}
function setShelfLive(id, live) {
  if (!fs.existsSync(shelfFile(id))) throw new Error('No shelf book ' + id);
  const L = list();
  L.shelf = (L.shelf || []).filter((x) => x.id !== id).concat([{ id, live: !!live }]);
  writeJson(LIST, L);
  return { id, live: !!live };
}
function shelfBooks() {
  if (!fs.existsSync(SHELF)) return [];
  const live = new Set((list().shelf || []).filter((x) => x.live).map((x) => x.id));
  return fs.readdirSync(SHELF).filter((f) => f.endsWith('.json') && f !== 'warnings.json').map((f) => readJson(path.join(SHELF, f), null)).filter(Boolean)
    .map((b) => ({ ...b, live: live.has(b.source), written: b.chapters.filter((c) => c.passages.some((p) => p.plain)).length }));
}

module.exports = { overview, scaffold, setLive, brief, rewriteBrief, check, media, listen, retime, locate, search, transcript, unitNeeds, slugify, UNI, SRC, draft, keepDraft, gateDraft, sceneFrom, shelfPlan, shelfWrite, shelfChapters, gatePlain, setShelfLive, shelfBooks };
