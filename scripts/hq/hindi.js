// The Hindi area of voidtv.net HQ (B, 20 Nov 2026: "this needs area inside voidtv hq please , a tab"). Server side: scripts/lib/hindihq.js.
// Loaded by scripts/hq/index.html before its own script; these functions use its helpers (api, esc, jq, fmt, $, toast, render) when they run.
// Everything is in English, with each title's Hindi name beside it: B runs the Hindi site and does not read Hindi (decision HI1).
let HINDI_F = 'all', HINDI_Q = '';
const HINDI_FILTERS = [['all', 'All'], ['plays', 'Plays'], ['listen', 'Needs a listen'], ['none', 'Nothing found'], ['friends', 'Friends voted'], ['dropped', 'Dropped']];
const hindiWhen = (t) => t ? new Date(t).toLocaleString() : 'never';
const hindiSample = (r) => r.sample ? '<a href="https://archive.org/details/' + encodeURIComponent(r.sample) + '" target="_blank" rel="noopener noreferrer">listen</a><br><small class="dim">' + esc(String(r.sampleTitle || '').slice(0, 70)) + '</small>' : '<span class="dim">none</span>';

async function hindiOverview(m) {
  const d = await api('/api/hindi');
  if (!d.found) { m.innerHTML = '<h2 style="margin-top:0">voidtv.net hindi</h2><p class="red">The Hindi folder is not on this PC: <code>' + esc(d.folder) + '</code></p><p class="dim">It is the local branch hindi, checked out beside this folder as C:\\Users\\bryan\\void-hindi. See Help.</p>'; return; }
  const s = d.shows, f = d.films, sh = d.shelf;
  m.innerHTML = '<div class="row" style="margin-top:0"><b>voidtv.net hindi</b><span class="dim">hindi.voidtv.net · not live yet · built on the local branch hindi in <code>' + esc(d.folder) + '</code></span></div>'
    + '<div class="cards">'
    + '<div class="card"><b class="green">' + f.playing + ' / ' + f.total + '</b><small>films that play</small></div>'
    + '<div class="card"><b class="gold">' + f.listen + '</b><small>films that need a listen</small></div>'
    + '<div class="card"><b class="green">' + s.playing + ' / ' + s.total + '</b><small>shows with episodes (' + fmt(s.episodes) + ' episodes, ' + fmt(s.sure) + ' sure of their place)</small></div>'
    + '<div class="card"><b>' + d.picks.files + '</b><small>friends\' files counted</small></div>'
    + (sh ? '<div class="card"><b>' + fmt(sh.filmNames) + '</b><small>film names on the Archive\'s Hindi shelf</small></div><div class="card"><b>' + fmt(sh.showNames) + '</b><small>show names on the shelf</small></div>' : '')
    + '</div>'
    + '<div class="panel" style="margin:12px 0"><b>The friends\' review sheet</b> <span class="dim">made ' + esc(hindiWhen(d.reviewAt)) + '</span>'
    + '<p>One file your friends open on a phone: every title in Hindi and English, a sample to listen to, Keep, Drop or Not sure, and a box for what is missing. Send them this file: <code>' + esc(d.review) + '</code></p>'
    + '<div class="row"><a class="btn" href="/api/hindi/review" target="_blank" rel="noopener" style="text-decoration:none">Open the review sheet</a><a class="btn" href="#hindi-picks" style="text-decoration:none">Add a file a friend sent back</a><a class="btn" href="#hindi-jobs" style="text-decoration:none">Rebuild it</a></div></div>'
    + '<div class="panel" style="margin:12px 0"><b>Where it stands</b><ul>'
    + '<li>The list: ' + s.total + ' shows and ' + f.total + ' films, each with its English and Hindi name. Last hunt ' + esc(hindiWhen(d.huntAt)) + '.</li>'
    + (sh ? '<li>The Archive\'s Hindi shelf, read ' + esc(hindiWhen(d.shelfAt)) + ': ' + fmt(sh.uploads) + ' uploads, ' + fmt((sh.kinds['news (out: M19)']) || 0) + ' of them TV news (left out). Growing the list from the shelf is the next step.</li>' : '<li>The Archive\'s Hindi shelf has not been read yet (Hunt and build, Read the shelf).</li>')
    + '<li>Keep or Drop each title in Shows and films. A film the matcher was unsure of plays only once you Keep it.</li>'
    + '<li>The site itself (its words in Hindi, the donation line in Hindi, Live TV) is the next slice. Nothing here is on the public internet yet.</li>'
    + '</ul></div>';
}

async function hindiTitles(m) {
  const d = await api('/api/hindi/titles');
  const pick = (r) => HINDI_F === 'all' ? true : HINDI_F === 'plays' ? r.plays > 0 : HINDI_F === 'listen' ? (r.toCheck > 0 && !r.sure) : HINDI_F === 'none' ? (!r.plays && !r.toCheck) : HINDI_F === 'friends' ? !!r.friends : r.decision === 'drop';
  const q = HINDI_Q.toLowerCase();
  const rows = d.rows.filter(pick).filter((r) => !q || r.name.toLowerCase().includes(q) || r.hindi.includes(HINDI_Q));
  const now = (r) => r.kind === 'show'
    ? (r.plays ? '<span class="chip live">' + r.plays + ' episodes play</span>' + (r.sure < r.plays ? '<br><small class="dim">' + r.sure + ' sure of their place</small>' : '') : '<span class="chip hidden">' + esc(r.state) + '</span>')
    : (r.plays ? '<span class="chip live">plays</span>' : r.state === 'needs a listen' ? '<span class="chip review">needs a listen</span>' : '<span class="chip hidden">' + esc(r.state) + '</span>');
  const fr = (r) => r.friends ? '<span title="' + esc(r.friends.notes.join(' / ')) + '">keep ' + r.friends.keep + ' · drop ' + r.friends.drop + ' · not sure ' + r.friends.unsure + (r.friends.notes.length ? ' · ' + r.friends.notes.length + ' note' + (r.friends.notes.length > 1 ? 's' : '') : '') + '</span>' : '<span class="dim">no votes yet</span>';
  const btn = (r, d, n) => '<button class="sm' + (r.decision === d ? ' gold' : '') + '" onclick="hindiDecide(' + jq(r.key) + ',' + jq(d) + ')">' + n + '</button>';
  m.innerHTML = '<div class="row" style="margin-top:0"><b>Shows and films</b><span class="dim">' + d.rows.length + ' on the Hindi list</span></div>'
    + '<p class="dim">Keep or Drop is saved at once in the Hindi folder\'s catalog/overrides.json. Drop takes a title off the Hindi site; Keep lets a film the matcher was unsure of play. Clear takes your decision back. The friends\' votes come from the files they send back.</p>'
    + '<div class="row">' + HINDI_FILTERS.map(([k, n]) => '<button class="sm' + (k === HINDI_F ? ' gold' : '') + '" onclick="HINDI_F=' + jq(k) + ';render()">' + n + '</button>').join('') + '<input id="hq-q" placeholder="Find a title" value="' + esc(HINDI_Q) + '" oninput="HINDI_Q=this.value;clearTimeout(window._hq);window._hq=setTimeout(render,300)" style="margin-left:auto"></div>'
    + (rows.length ? '<table><tr><th>Title</th><th>Made in</th><th>Year</th><th>Row</th><th>Now</th><th>Sample</th><th>Friends</th><th></th></tr>' + rows.map((r) => '<tr><td>' + (r.hindi ? '<b style="font-size:16px">' + esc(r.hindi) + '</b><br>' + esc(r.name) : '<b>' + esc(r.name) + '</b><br><small class="dim">no Hindi name yet</small>') + ' <span class="dim">' + r.kind + (r.source === 'shelf' ? ', from the shelf' : '') + '</span></td><td>' + esc(r.made) + (r.language === 'hi' ? '' : '<br><small class="dim">Hindi dub</small>') + '</td><td>' + esc(r.year) + '</td><td>' + esc(r.row) + '</td><td>' + now(r) + '</td><td>' + hindiSample(r) + '</td><td>' + fr(r) + '</td><td style="white-space:nowrap">' + btn(r, 'keep', 'Keep') + ' ' + btn(r, 'drop', 'Drop') + (r.decision ? ' <button class="sm" onclick="hindiDecide(' + jq(r.key) + ',\'clear\')">Clear</button>' : '') + '</td></tr>').join('') + '</table>' : '<p class="dim">Nothing matches.</p>');
}
async function hindiDecide(key, d) { try { const r = await api('/api/hindi/decide', { key, d }); toast(r.name + ': ' + (d === 'keep' ? 'kept' : d === 'drop' ? 'dropped' : 'decision cleared')); render(); } catch (e) { toast(e.message); } }

async function hindiPicks(m) {
  const d = await api('/api/hindi/titles');
  const t = d.tally, voted = d.rows.filter((r) => r.friends);
  m.innerHTML = '<div class="row" style="margin-top:0"><b>Friends\' picks</b><span class="dim">' + t.files + ' file' + (t.files === 1 ? '' : 's') + ' counted</span></div>'
    + '<div class="panel" style="margin:10px 0"><b>Add a file a friend sent back</b> <span class="dim">the file the review sheet saved when they pressed Send back (hindi-picks-....json). A file is counted once, however often it is added. It stays on this PC: the friends\' notes never go to GitHub.</span>'
    + '<div class="row"><input type="file" id="hp-file" accept=".json,application/json" multiple><button class="gold" onclick="hindiAddPicks()">Add</button></div></div>'
    + (voted.length ? '<table><tr><th>Title</th><th>Keep</th><th>Drop</th><th>Not sure</th><th>Notes</th><th>Your decision</th></tr>' + voted.map((r) => '<tr><td><b>' + esc(r.hindi) + '</b><br>' + esc(r.name) + '</td><td class="num green">' + r.friends.keep + '</td><td class="num red">' + r.friends.drop + '</td><td class="num">' + r.friends.unsure + '</td><td>' + r.friends.notes.map(esc).join('<br>') + '</td><td>' + (r.decision ? esc(r.decision) : '<a href="#hindi-titles">decide</a>') + '</td></tr>').join('') + '</table>' : '<p class="dim">No votes yet. Send your friends the review sheet (Overview), then add the files they send back.</p>')
    + '<h3>What they said is missing</h3>' + (t.more.length ? '<ul>' + t.more.map((x) => '<li>' + esc(x).replace(/\n+/g, '<br>') + '</li>').join('') + '</ul>' : '<p class="dim">Nothing yet.</p>');
}
async function hindiAddPicks() {
  const files = [...(($('#hp-file') || {}).files || [])];
  if (!files.length) return toast('Choose the file a friend sent back first');
  let added = 0, again = 0;
  for (const f of files) {
    try { const j = JSON.parse(await f.text()); const r = await api('/api/hindi/picks', { file: j }); if (r.added) added++; else again++; }
    catch (e) { toast(f.name + ': ' + e.message); }
  }
  toast(added + ' added' + (again ? ', ' + again + ' already counted' : ''));
  render();
}

async function hindiJobs(m) {
  const d = await api('/api/hindi/jobs');
  const running = d.jobs.some((j) => j.running);
  m.innerHTML = '<div class="row" style="margin-top:0"><b>Hunt and build</b><span class="dim">each job runs inside the Hindi folder, one at a time</span></div>'
    + '<table><tr><th>Job</th><th>What it does</th><th></th></tr>' + d.defs.map((x) => '<tr><td><b>' + esc({ list: 'Rebuild the list', grow: 'Grow films from the shelf', shelf: 'Read the shelf', hunt: 'Hunt', review: 'Rebuild the review sheet' }[x.name] || x.name) + '</b><br><small class="dim">' + esc(x.script) + '</small></td><td>' + esc(x.what) + '</td><td><button class="sm' + (running ? '' : ' gold') + '"' + (running ? ' disabled' : '') + ' onclick="hindiRun(' + jq(x.name) + ')">Run</button></td></tr>').join('') + '</table>'
    + '<h3>Recent</h3>' + (d.jobs.length ? '<table><tr><th>Job</th><th>Started</th><th>Now</th><th>Last lines</th><th></th></tr>' + d.jobs.slice(0, 12).map((j) => '<tr><td>' + esc(j.name) + '</td><td>' + esc(hindiWhen(j.started)) + '</td><td>' + (j.running ? '<span class="chip live">running</span>' : j.code === 0 ? '<span class="chip">done</span>' : '<span class="chip hidden">ended (' + esc(j.code) + ')</span>') + '</td><td><pre style="max-height:160px;overflow:auto;margin:0;white-space:pre-wrap">' + esc(j.tail) + '</pre></td><td>' + (j.running ? '<button class="sm" onclick="hindiStop(' + jq(j.id) + ')">Stop</button>' : '') + '</td></tr>').join('') + '</table>' : '<p class="dim">No Hindi job has run from HQ yet.</p>');
  if (running) { clearTimeout(window._hjobs); window._hjobs = setTimeout(() => { if (tab === 'hindi-jobs') render(); }, 5000); }
}
async function hindiRun(name) { try { await api('/api/hindi/jobs', { name }); toast('Started: ' + name); render(); } catch (e) { toast(e.message); } }
async function hindiStop(id) { if (!confirm('Stop this Hindi job?')) return; try { const r = await api('/api/hindi/jobs/' + encodeURIComponent(id) + '/stop', {}); toast(r.stopped ? 'Stopped' : (r.note || 'Not stopped')); render(); } catch (e) { toast(e.message); } }

// Hindi Help: every Hindi button and the way to do the same by hand (hq-manual-mode). Commands run in C:\Users\bryan\void-hindi.
function hindiHelp(m) {
  const rows = [
    ['Open the review sheet', 'Open <code>C:\\Users\\bryan\\void-hindi\\profiles\\hindi\\docs\\REVIEW.html</code> in a browser. Send that one file to your friends (email or WhatsApp); it works on a phone and needs nothing else.'],
    ['Add a file a friend sent back', '<code>cd C:\\Users\\bryan\\void-hindi</code> then <code>node profiles\\hindi\\tally.js "C:\\path\\to\\hindi-picks-....json"</code>. The tally is in <code>profiles\\hindi\\reviews\\TALLY.md</code> (stays on this PC).'],
    ['Keep or Drop a title', 'Edit <code>profiles\\hindi\\catalog\\overrides.json</code> in the Hindi folder. Drop a show: <code>"show-slug": { "hidden": true }</code>. Keep a film: <code>"movie-&lt;TMDB id&gt;": { "approved": true }</code>; drop a film: <code>{ "rejected": true }</code>. The TMDB id is in <code>catalog\\tvmovies-list.json</code>.'],
    ['Rebuild the list', '<code>$env:VOID_ENV=\'C:\\Users\\bryan\\void-channel\\backend\\.env\'</code> then <code>node profiles\\hindi\\make-list.js</code> (TVmaze and TMDB only).'],
    ['Read the shelf', '<code>node profiles\\hindi\\shelf.js</code> (a few Archive calls; the report is docs\\SHELF.md).'],
    ['Hunt', '<code>node profiles\\hindi\\hindi-hunt.js</code> (shows, films, then the matcher; one polite Archive job). Reports: docs\\HUNT.md, MOVIES.md, COVERAGE.md.'],
    ['Rebuild the review sheet', '<code>node profiles\\hindi\\review.js</code> (also writes docs\\STARTER.md, what plays).'],
    ['Stop a job by hand', 'Close its window, or in Task Manager end the node.exe whose command line names the Hindi script.'],
  ];
  m.innerHTML = '<div class="help"><h2 style="margin-top:0">voidtv.net hindi by hand</h2><p>Every Hindi button has a way to do it without HQ or AI. Commands run in PowerShell in the Hindi folder, <code>C:\\Users\\bryan\\void-hindi</code> (the local branch hindi). The plan is <code>C:\\Users\\bryan\\void-channel\\audit\\drafts\\PLAN-hindi.md</code>.</p><table>' + rows.map(([a, b]) => '<tr><td style="min-width:180px"><b>' + a + '</b></td><td>' + b + '</td></tr>').join('') + '</table></div>';
}
