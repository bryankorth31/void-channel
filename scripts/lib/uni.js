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
  const c = readJson(courseFile(slug), null);
  if (!c) throw new Error('No course ' + slug);
  const t = (c.todo || []).find((x) => x.n === +n) || c.units.find((x) => x.n === +n);
  if (!t) throw new Error('No unit ' + n + ' in ' + slug);
  const sources = (c.uses || []).concat(c.source ? [c.source.id] : []).map((id) => sourceById(c.domain, id)).filter(Boolean);
  const example = (readJson(courseFile('human-nature'), { units: [] }).units || [])[0];
  return `You are building one unit of Void University (university.voidtv.net), a free public learning site, in C:\\Users\\bryan\\void-channel\\profiles\\university.

COURSE: ${c.name} (courses/${slug}.json), area ${c.domain}. Why the course: ${c.why}
UNIT ${t.n}: ${t.title}
AUDIENCES: ${(c.levels || []).join(', ')}. Bryan, 15 Nov 2026: people say "it's cool but why do I need to know it". Every unit answers that first, in one plain sentence (needIt), for someone who will never work in the field.

SOURCES for this course (licences were read on their pages; keep their credit and licence):
${sources.map((s) => '- ' + s.id + ': ' + s.title + ', ' + s.by + '. ' + s.licence + '. ' + (s.url || '') + (s.text ? ' Text: ' + s.text : '') + (s.video && s.video.archive ? ' Video: archive.org/details/' + s.video.archive : '') + (s.courseworkUrl ? ' Coursework: ' + s.courseworkUrl : '') + (s.notes ? ' Notes: ' + s.notes : '')).join('\n') || '- (none listed: find them first under the rules in sources/FORMAT.md)'}

STEPS:
1. Read profiles/university/sources/FORMAT.md (the source rules) and docs/COURSE-RECIPE.md (the recipe).
2. Read the source material for this unit: the lecture transcript if it is a lecture, or the chapter if it is a book. Save what you read to your scratchpad, not the repo.
3. Write the unit into courses/${slug}.json: move it from "todo" into "units", keeping n and the title, in the same shape as this finished unit from Human nature:
${JSON.stringify(example ? { n: example.n, title: example.title, needIt: example.needIt, why: example.why, outcome: example.outcome, main: example.main, chapters: (example.chapters || []).slice(0, 2), quiz: (example.quiz || []).slice(0, 1), scene: example.scene ? { analogy: example.scene.analogy, '...': 'see scene.js and courses/human-nature.json for the full scene' } : undefined } : {}, null, 1)}
   - needIt: one plain sentence on how this helps a person decide or live better.
   - scene: an everyday analogy acted out with scene.js stamps (pictures first, Bryan 15 Nov). Check that no shapes or words overlap at 1316 and 821 wide.
   - main: the lecture video (Archive file) or the reading, with its licence. chapters: the times where the lecture changes topic.
   - quiz: about five questions. Each answer quotes the exact line of the source it comes from, with the time or page. Check every quote word for word against the transcript or text you saved.
   - Old books (old: true) are rewritten into plain modern English beside the original line. Anything now wrong or unsafe gets a plain warning and the current US government source.
4. Run: node profiles/university/build.js, then look at the unit in the preview (launch.json "void-university", port 8783) at 1920, 1316 and 821 wide: no sideways scroll, no broken images, no console errors.
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
      if (!/^no terms/i.test(s.terms || '') && (AI_NO.test(s.terms || '') || AI_NO2.test(s.terms || ''))) problems.push({ where, what: 'terms may forbid AI use, read them (link only until checked): ' + String(s.terms).slice(0, 90) });
      walkText(where, s);
      for (const k of ['url', 'text', 'courseworkUrl']) if (/^https?:\/\//.test(s[k] || '')) urls.set(s[k], where);
      if (s.video && s.video.archive) urls.set('https://archive.org/metadata/' + s.video.archive + '/metadata/identifier', where + ' (Archive item)');
    }
    for (const c of f.courses || []) { if (c.spine && !ids.has(c.spine)) problems.push({ where: slugify(area) + '.json course ' + c.name, what: 'spine ' + c.spine + ' is not in the sources' }); walkText(slugify(area) + '.json course ' + c.name, c); }
  }
  for (const c of builtCourses()) for (const u of c.units) for (const [i, q] of (u.quiz || []).entries()) {
    if (!(q.a >= 0 && q.a < (q.choices || []).length)) problems.push({ where: c.slug + ' unit ' + u.n + ' quiz ' + (i + 1), what: 'the answer is not one of the choices' });
    if (!q.quote) problems.push({ where: c.slug + ' unit ' + u.n + ' quiz ' + (i + 1), what: 'no quote from the source' });
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

module.exports = { overview, scaffold, setLive, brief, rewriteBrief, check, unitNeeds, slugify, UNI, SRC };
