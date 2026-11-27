// Who leads a home row (scripts/lib/app.js byKnown, scripts/art.js --votes; decision H18).
// Bryan, 26 Nov 2026: "2" (fix the row leads so the best known lead), "yes" (use TMDB's vote counts), then "Yes, build it".
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('node:vm');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'app.js'), 'utf8');
const ART = fs.readFileSync(path.join(ROOT, 'scripts', 'art.js'), 'utf8');

test('H18: a home row is led by the shows most people have rated, then by episodes; a show with no count sorts as it did', () => {
  const m = APP.match(/^function byKnown\(.*$/m);
  assert.ok(m, 'byKnown is in app.js');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(m[0] + '\nthis.byKnown = byKnown;', ctx);
  const row = [
    { show: 'Horrid Henry', eps: 250, votes: 19 },
    { show: 'The Simpsons', eps: 100, votes: 11069 },
    { show: 'No count, long', eps: 300 },
    { show: 'No count, short', eps: 5, votes: 0 },
    { show: 'South Park', eps: 90, votes: 5196 },
  ];
  assert.deepEqual([...row].sort(ctx.byKnown).map((s) => s.show), ['The Simpsons', 'South Park', 'Horrid Henry', 'No count, long', 'No count, short']);
  // the rows use it, before the ripple; the open list ("See all") keeps its own sort
  assert.match(APP, /const art=rows\.filter\(s=>s\.poster\)\.sort\(byKnown\);if\(art\.length\)h\+=shelf\(name,ripple\(art,key\),key,rows\.length\)/);
  assert.equal((APP.match(/sort\(byKnown\)/g) || []).length, 1, 'used in one place: the kind rows');
  // the count travels from the catalog to the page: series from the art file, films from their own record, then the show list
  assert.match(APP, /rating: a\.rating \|\| null, votes: a\.votes \|\| 0,/);
  assert.match(APP, /rating: m\.rating, votes: m\.votes \|\| 0,/);
  assert.match(APP, /rating: s\.rating, votes: s\.votes \|\| undefined,/);
});

test('H18: the art script keeps the vote count, and --votes fills it from the saved answers without the network, never from another show\'s record', () => {
  assert.match(ART, /votes: detail\.vote_count \|\| 0,/);
  // a throwaway copy: the script, its helpers, a three-show list, an art file without counts and a cache
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'void-votes-'));
  try {
    for (const f of ['scripts/art.js', 'scripts/lib/profile.js', 'scripts/lib/sameshow.js']) { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f)); }
    for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'lib'))) { const to = path.join(tmp, 'scripts', 'lib', f); if (f.endsWith('.js') && !fs.existsSync(to)) fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', f), to); }
    fs.writeFileSync(path.join(tmp, 'scripts', 'show-list.json'), JSON.stringify({ shows: [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }] }));
    fs.mkdirSync(path.join(tmp, 'catalog', 'cache'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'backend'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'backend', '.env'), 'TMDB_READ_TOKEN=not-a-real-token-for-this-test\n');
    const art = { alpha: { tmdbId: 1, title: 'Alpha', rating: 8 }, beta: { tmdbId: 2, title: 'Beta', rating: 7 }, gamma: { tmdbId: 3, title: 'Gamma', rating: 6 } };
    fs.writeFileSync(path.join(tmp, 'catalog', 'art.json'), JSON.stringify(art));
    fs.writeFileSync(path.join(tmp, 'catalog', 'cache', 'tmdb-alpha.json'), JSON.stringify({ id: 1, vote_count: 1418 }));
    fs.writeFileSync(path.join(tmp, 'catalog', 'cache', 'tmdb-beta.json'), JSON.stringify({ id: 99, vote_count: 5000 })); // another record's answer
    const r = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'art.js'), '--votes'], { cwd: tmp, encoding: 'utf8', env: { ...process.env, TMDB_READ_TOKEN: '' } });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(fs.readFileSync(path.join(tmp, 'catalog', 'art.json'), 'utf8'));
    assert.equal(out.alpha.votes, 1418);
    assert.equal(out.beta.votes, undefined, 'a saved answer for another record is left alone');
    assert.equal(out.gamma.votes, undefined, 'no saved answer, no count');
    assert.deepEqual([out.alpha.rating, out.beta.rating, out.gamma.rating, out.alpha.title], [8, 7, 6, 'Alpha'], 'nothing else in the art changes');
    assert.match(r.stdout, /1 vote counts set, 0 already right, 1 with no saved answer, 1 whose saved answer is another record/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// Bryan, 26 Nov 2026: "Yes, fix them" (row leads that wore another show's record; audit/voidverse/owner-shots/row-leads/MISMATCHED-LEADS.md).
test('H18: the five shows that wore another show\'s record are pinned to their own, and The Big Bang keeps no TMDB art', () => {
  const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'overrides.json'), 'utf8'));
  assert.deepEqual(['gravity', 'impossible', 'shootout', 'evolution', 'gospel'].map((s) => o[s] && o[s].tmdbId), [31393, 69641, 3083, 14930, 27336]);
  assert.equal(o['the-big-bang'].noArt, true);
  assert.match(ART, /if \(\(OVERRIDES\[s\] \|\| \{\}\)\.noArt\) \{ if \(art\[s\]\) \{ delete art\[s\];/);
});

// Bryan, 26 Nov 2026: "dont want shows with 1 ep in the first rows".
test('H18: a show with only a few episodes never leads a row of fuller shows, and the day\'s guest is a fuller show too', () => {
  const src = APP.match(/^function byKnown\(.*$/m)[0] + '\n' + APP.match(/^function ripHash\(.*$/m)[0] + '\n' + APP.match(/^function ripple\(.*$/m)[0];
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src + '\nthis.byKnown = byKnown; this.ripple = ripple;', ctx);
  const row = [{ show: 'One-off hit', eps: 1, votes: 90000 }, { show: 'Big', eps: 100, votes: 500 }, { show: 'Five', eps: 5, votes: 8000 }, { show: 'Full', eps: 40, votes: 900 }];
  assert.deepEqual([...row].sort(ctx.byKnown).map((s) => s.show), ['Full', 'Big', 'One-off hit', 'Five']);
  const films = [{ show: 'A', eps: 1, votes: 5 }, { show: 'B', eps: 1, votes: 50 }];
  assert.deepEqual([...films].sort(ctx.byKnown).map((s) => s.show), ['B', 'A'], 'a row of single films sorts among its own');
  const mixed = Array.from({ length: 40 }, (_, i) => ({ slug: 's' + i, eps: i < 20 ? 50 : 1, votes: 1000 - i }));
  for (let day = 750000; day < 750060; day++) {
    const o = Array.from(ctx.ripple(mixed, 'k', day));
    assert.ok(o[4].eps >= 6, 'the guest is a fuller show');
    assert.ok(o.slice(0, 8).every((s) => s.eps >= 6), 'no one-episode show in the first eight');
  }
});
