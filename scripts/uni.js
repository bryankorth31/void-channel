// Void University from the command line (and HQ's Jobs). The engine is scripts/lib/uni.js; the recipe is
// profiles/university/docs/COURSE-RECIPE.md.
//   node scripts/uni.js status                    what each area has: sources, proposed courses, built courses, what is left
//   node scripts/uni.js check                     check every source link and licence (writes sources/check.json)
//   node scripts/uni.js scaffold <area> <course>  make courses/<slug>.json from a proposed course
//   node scripts/uni.js brief <slug> <unit>       print the whole prompt for a Claude chat to build that unit
//   node scripts/uni.js rewrite <area> <source>   print the whole prompt to rewrite an old book into plain English
//   node scripts/uni.js listen <slug>             Whisper hears every lecture the course plays (a time for every word)
//   node scripts/uni.js times <slug>              set every quiz and chapter time from where the words are said (after listen)
//   node scripts/uni.js find <slug> <unit> <quote> the second in that unit's lecture where the quote is said
//   node scripts/uni.js search <phrase>           a phrase across every lecture heard so far, with times
//   node scripts/uni.js media                     recount each Archive item's real video or audio lectures (writes the sources)
//   node scripts/uni.js build                     build the preview (profiles/university/site-preview)
//   node scripts/uni.js build --site              build the public copy (only courses marked live in list.json)
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
    const r = uni.listen(args[0]);
    console.log(r.queued ? 'Listened to ' + r.queued + ' lectures.' : 'Every lecture in this course has been heard.');
  } else if (cmd === 'times') {
    const r = uni.retime(args[0]);
    console.log(r.set + ' times set from the lecture, ' + r.same + ' already right' + (r.unheard.length ? '; units not heard yet: ' + r.unheard.join(', ') : '') + (r.missing.length ? '\nNot found (look by hand): ' + r.missing.join('; ') : ''));
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
  } else if (cmd === 'build') {
    execFileSync(process.execPath, [path.join(uni.UNI, 'build.js'), ...args.filter((a) => a === '--site')], { stdio: 'inherit' });
  } else {
    console.log('Unknown command. See the top of scripts/uni.js.');
    process.exitCode = 1;
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
