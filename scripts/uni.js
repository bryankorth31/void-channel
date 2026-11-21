// Void University from the command line (and HQ's Jobs). The engine is scripts/lib/uni.js; the recipe is
// profiles/university/docs/COURSE-RECIPE.md.
//   node scripts/uni.js status                    what each area has: sources, proposed courses, built courses, what is left
//   node scripts/uni.js check                     check every source link and licence (writes sources/check.json)
//   node scripts/uni.js scaffold <area> <course>  make courses/<slug>.json from a proposed course
//   node scripts/uni.js brief <slug> <unit>       print the whole prompt for a Claude chat to build that unit
//   node scripts/uni.js rewrite <area> <source>   print the whole prompt to rewrite an old book into plain English
//   node scripts/uni.js draft <slug> <unit>       the local model (Ollama) drafts a unit from its heard lecture; only word for word quotes are kept
//   node scripts/uni.js draft <slug> all          draft every unit still to do whose lecture has been heard
//   node scripts/uni.js keep <slug> <unit>        move a whole draft from drafts/ into the course
//   node scripts/uni.js shelf plan <area> <id>    an old book from the source list: fetch its Archive scan, find its chapters (writes shelf/<id>.json)
//   node scripts/uni.js shelf write <id> <n|all>  the local model rewrites a chapter into plain English beside the original
//   node scripts/uni.js shelf live <id> on|off    put a shelf book in, or take it out of, the public copy
//   node scripts/uni.js class <shelf-id> [name]   a class from a shelf book: one unit for each chapter, drafted with: draft <slug> all
//   node scripts/uni.js lectures <slug>           a course built on recorded lectures: one unit to do for each lecture in its Archive item
//   node scripts/uni.js listen <slug>           Whisper hears every lecture the course plays (a time for every word)
//   node scripts/uni.js times <slug>              set every quiz and chapter time from where the words are said (after listen)
//   node scripts/uni.js find <slug> <unit> <quote> the second in that unit's lecture where the quote is said
//   node scripts/uni.js search <phrase>           a phrase across every lecture heard so far, with times
//   node scripts/uni.js media                     recount each Archive item's real video or audio lectures (writes the sources)
//   node scripts/uni.js build                     build the preview (profiles/university/site-preview)
//   node scripts/uni.js build --site              build the public copy (only courses marked live in list.json)
//   node scripts/uni.js selftest                  everything that can be checked on this PC alone: tests, lab physics, a preview build, the course checks
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const uni = require('./lib/uni');

const [cmd, ...args] = process.argv.slice(2);
(async () => {
  if (cmd === 'status' || !cmd) {
    const o = uni.overview();
    for (const a of o.areas) {
      console.log(a.area + ': ' + (a.found ? a.sources + ' sources' + (a.old ? ' (' + a.old + ' old books)' : '') : 'nothing found yet')
        + ', ' + a.proposed.length + ' proposed, ' + a.courses.length + ' built');
      for (const c of a.courses) console.log('   ' + c.name + (c.live ? ' [live]' : '') + ': ' + c.ready + ' of ' + c.planned + ' units finished');
      for (const p of a.proposed.filter((x) => !x.made)) console.log('   proposed: ' + p.name + ' (' + p.units + ' units)');
    }
    if (o.checkedAt) console.log('\nLast check ' + o.checkedAt.slice(0, 16) + ': ' + o.problems + ' problems (sources/check.json)');
  } else if (cmd === 'check') {
    const r = await uni.check((m) => console.log(m));
    console.log(r.links + ' links checked, ' + r.problems.length + ' problems');
    for (const p of r.problems) console.log('- ' + p.where + ': ' + p.what);
  } else if (cmd === 'scaffold') {
    const r = uni.scaffold(args[0], args.slice(1).join(' '));
    console.log('Made ' + r.file + ' with ' + r.todo + ' units to do. Next: node scripts/uni.js brief ' + r.slug + ' 1');
  } else if (cmd === 'brief') {
    console.log(uni.brief(args[0], args[1]));
  } else if (cmd === 'rewrite') {
    console.log(uni.rewriteBrief(args[0], args[1]));
  } else if (cmd === 'listen') {
    const r = uni.hearLectures(args[0]);
    console.log(r.queued ? 'Listened to ' + r.queued + ' lectures.' : 'Every lecture in this course has been heard.');
  } else if (cmd === 'times') {
    const r = uni.retime(args[0]);
    console.log(r.set + ' times set from the lecture, ' + r.same + ' already right' + (r.unheard.length ? '; units not heard yet: ' + r.unheard.join(', ') : '') + (r.missing.length ? '\nNot found (look by hand): ' + r.missing.join('; ') : ''));
  } else if (cmd === 'ends') {
    const r = uni.stampEnds(args[0]);
    console.log(r.set + ' question ends set from the lecture, ' + r.same + ' already right' + (r.unheard.length ? '; units not heard yet: ' + r.unheard.join(', ') : '') + (r.missing.length ? '; quote not found word for word: ' + r.missing.join(', ') : ''));
  } else if (cmd === 'find') {
    const c = JSON.parse(require('fs').readFileSync(path.join(uni.UNI, 'courses', args[0] + '.json'), 'utf8'));
    const u = [...c.units, ...(c.todo || [])].find((x) => x.n === +args[1]); const m = u && (u.main || u.lecture);
    if (!m) throw new Error('No unit ' + args[1] + ' with a lecture');
    const hit = uni.locate(m.item, m.file, args.slice(2).join(' '));
    console.log(hit ? Math.round(hit.t) + ' s (' + Math.floor(hit.t / 60) + ':' + String(Math.floor(hit.t % 60)).padStart(2, '0') + '), match ' + Math.round(hit.score * 100) + '%: ' + hit.said : 'Not found in the lecture.');
  } else if (cmd === 'search') {
    for (const h of uni.search(args.join(' '))) console.log(h.title + ' @ ' + Math.round(h.t) + ' s: ...' + h.context + '...');
  } else if (cmd === 'media') {
    const ch = await uni.media((m) => console.log(m));
    console.log('\n' + ch.length + ' sources changed');
    for (const x of ch) console.log('- ' + x.where + ': ' + x.what);
  } else if (cmd === 'draft' && args[1] === 'all') {
    // every unit still to do whose lecture has been heard and has no draft yet
    const c = JSON.parse(require('fs').readFileSync(path.join(uni.UNI, 'courses', args[0] + '.json'), 'utf8'));
    let made = 0, waiting = 0;
    for (const t of c.todo || []) {
      const m = t.lecture || t.main;
      if (!t.reading && (!m || !uni.transcript(m.item, m.file))) { waiting++; continue; }
      const df = path.join(uni.UNI, 'drafts', args[0] + '-' + t.n + '.json');
      if (require('fs').existsSync(df) && JSON.parse(require('fs').readFileSync(df, 'utf8')).ok) continue; // a whole draft is left alone (it may carry Bryan's edits)
      let r = await uni.draft(args[0], t.n);
      for (let again = 0; again < 2 && !r.ok; again++) r = await uni.draft(args[0], t.n); // a draft that is not whole is tried again
      made++;
      console.log('Unit ' + t.n + ', ' + t.title + ': ' + (r.ok ? 'whole (' + r.unit.quiz.length + ' questions' + (r.unit.chapters ? ', ' + r.unit.chapters.length + ' chapters' : '') + ')' : 'NOT whole, missing ' + r.missing.join(', ')));
    }
    console.log(made + ' drafted' + (waiting ? ', ' + waiting + ' not heard yet (node scripts/uni.js listen ' + args[0] + ')' : '') + '. They show in the preview marked as drafts: node scripts/uni.js build');
  } else if (cmd === 'draft') {
    const r = await uni.draft(args[0], args[1], (m) => console.log(m));
    console.log((r.ok ? 'Draft passed the gate: ' : 'Draft is NOT whole yet (' + r.missing.join(', ') + '): ') + r.file);
    console.log(r.unit.quiz.length + ' questions, each quote word for word from its source; ' + (r.unit.chapters ? r.unit.chapters.length + ' chapters; ' : '') + 'crystal ' + (r.unit.crystal ? 'yes' : 'no') + '.');
    console.log(r.unit.scene ? 'Scene: ' + r.unit.scene.analogy : 'No scene yet.');
    for (const x of r.notes) console.log('- ' + x);
    console.log(r.ok ? 'Read it, change any line, then: node scripts/uni.js keep ' + r.slug + ' ' + r.n : 'Run the draft again, or write the missing parts into the file by hand.');
  } else if (cmd === 'keep') {
    const r = uni.keepDraft(args[0], args[1]);
    console.log('Unit ' + r.n + ' is in courses/' + r.slug + '.json (' + r.units + ' units). Next: node scripts/uni.js times ' + r.slug + ', then build.');
  } else if (cmd === 'shelf' && args[0] === 'plan') {
    const r = await uni.shelfPlan(args[1], args[2], (m) => console.log(m));
    console.log('Made ' + r.file + ' with ' + r.chapters.length + ' chapters:');
    for (const c of r.chapters) console.log('  ' + c.n + '. ' + c.title + ' (' + c.passages + ' passages)');
    console.log('Fix a heading or delete a chapter in that file if the scan got it wrong. Then: node scripts/uni.js shelf write ' + r.id + ' 1');
  } else if (cmd === 'shelf' && args[0] === 'write') {
    const book = uni.shelfBooks().find((b) => b.source === args[1]);
    if (!book) throw new Error('No shelf book ' + args[1]);
    const which = args[2] === 'all' ? book.chapters.map((c) => c.n) : [+args[2]];
    for (const n of which) {
      const r = await uni.shelfWrite(args[1], n, (m) => console.log('  ' + m));
      console.log('Chapter ' + r.n + ', ' + r.title + ': ' + r.done + ' passages in plain English' + (r.left ? ', ' + r.left + ' left out (run it again to retry them)' : '') + (r.warned ? ', ' + r.warned + ' with a warning' : ''));
    }
    console.log('Look at it: node scripts/uni.js build, then the preview. When it reads right: node scripts/uni.js shelf live ' + args[1] + ' on');
  } else if (cmd === 'live') {
    if (!/^(on|off)$/.test(args[1] || '')) throw new Error('Say on or off: node scripts/uni.js live <course> on');
    const r = uni.setLive(args[0], args[1] === 'on');
    console.log(r.slug + (r.live ? ' goes in the public copy at the next build --site.' : ' stays out of the public copy.'));
  } else if (cmd === 'shelf' && args[0] === 'live') {
    const r = uni.setShelfLive(args[1], args[2] === 'on');
    console.log(r.id + (r.live ? ' goes in the public copy at the next build --site.' : ' stays out of the public copy.'));
  } else if (cmd === 'class') {
    const r = uni.classFrom(args[0], args.slice(1).join(' '));
    console.log('Made ' + r.file + ' with ' + r.todo + ' units to do. Next: node scripts/uni.js draft ' + r.slug + ' all');
  } else if (cmd === 'lectures') {
    const r = await uni.lectures(args[0]);
    console.log(r.lectures + ' lectures in the Archive item (' + (r.sound ? 'sound only' : 'filmed') + ', ' + Math.round(r.seconds / 3600) + ' hours), ' + r.todo + ' units to do. Next: node scripts/uni.js listen ' + r.slug + ' (about ' + Math.round(r.seconds / 3600 * 0.4 * 10) / 10 + ' hours on the graphics card)');
  } else if (cmd === 'selftest') {
    // One command, no web and no AI: each part says pass or FAIL, and the exit code is 1 if any part failed.
    const root = path.join(__dirname, '..');
    const run = (file, more = []) => { try { execFileSync(process.execPath, [...more, file], { cwd: root, stdio: 'pipe' }); return ''; } catch (e) { return String(e.stdout || '') + String(e.stderr || e.message); } };
    const parts = [
      ['Tests (tests/uni.test.js)', () => run(path.join(root, 'tests', 'uni.test.js'), ['--test'])],
      ['Lab physics (test-lab.js)', () => run(path.join(uni.UNI, 'test-lab.js'))],
      ['Preview build (build.js)', () => run(path.join(uni.UNI, 'build.js'))],
      ['Course checks without the web (licences, dashes, quiz quotes, times)', async () => (await uni.check(() => {}, { links: false })).problems.filter((x) => x.level !== 'note').map((x) => x.where + ': ' + x.what).join('\n')],
    ];
    let bad = 0;
    for (const [name, fn] of parts) { const out = await fn(); if (out) bad++; console.log((out ? 'FAIL  ' : 'pass  ') + name + (out ? '\n' + out.trim().split('\n').slice(-25).join('\n') : '')); }
    console.log(bad ? '\n' + bad + ' of ' + parts.length + ' parts failed.' : '\nAll ' + parts.length + ' parts pass. Links are checked by: node scripts/uni.js check');
    if (bad) process.exitCode = 1;
  } else if (cmd === 'build') {
    execFileSync(process.execPath, [path.join(uni.UNI, 'build.js'), ...args.filter((a) => a === '--site')], { stdio: 'inherit' });
  } else {
    console.log('Unknown command. See the top of scripts/uni.js.');
    process.exitCode = 1;
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
