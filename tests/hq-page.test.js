// HQ says when something fails or ends (build audit 19 Nov 2026, H2, H3, H4, H6, H7, H8).
// Before: a save or a job start the engine refused showed nothing at all; a started job said "started" for 4 seconds and never how
// it ended; a wait gave up after a minute without a word; the Shows list kept old data; a lookup that failed read "none found" or
// "No builder jobs running"; the Health box stayed green however old the check was; arrows and crosses had no hover name.
// The page's own code is read from scripts/hq/index.html and its job-watching functions are run for real in a bare context with a
// made-up clock. No HQ is started here and nothing is launched (the engine side of H6 is tested in tests/hq.test.js, which runs an HQ).
// Run: node --test tests/hq-page.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const PAGE = fs.readFileSync(path.join(ROOT, 'scripts', 'hq', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const lineOf = (needle) => { const at = PAGE.indexOf(needle); assert.ok(at > 0, 'the page still holds: ' + needle); return PAGE.slice(at, PAGE.indexOf('\n', at)); };

// ---- H2: no failure is silent ---------------------------------------------------------------------------------------
test('H2: a net under every button: an unhandled failure becomes a red message that stays', () => {
  const net2 = lineOf("window.addEventListener('unhandledrejection'");
  assert.match(net2, /toast\('That did not go through \('\+\(\(e&&e\.message\)\|\|e\|\|'no reason given'\)\+'\)\. Look at the page before pressing again\.','bad','net'\)/);
  assert.match(net2, /ev\.preventDefault\(\)/);
});

test('H2: the named buttons say what was refused, in a red message that stays, and stop there', () => {
  const cases = [
    ['async function setOv(', /catch\(e\)\{toast\('Not saved: '\+e\.message,'bad','save'\);return false\}/],
    ['async function decide(', /catch\(e\)\{toast\('Not saved: '\+e\.message,'bad','save'\);return\}/],
    ['async function job(', /catch\(e\)\{toast\('The '\+name\+' job did not start: '\+e\.message,'bad','start'\);return\}/],
    ['async function startPreset(', /catch\(e\)\{toast\(p\[0\]\+' did not start: '\+e\.message,'bad','start'\);return\}/],
    ['async function startCustom(', /catch\(e\)\{toast\('The '\+name\+' job did not start: '\+e\.message,'bad','start'\);return\}/],
    ['async function runDoctor(', /catch\(e\)\{toast\('The doctor did not start: '\+e\.message,'bad','start'\);return\}/],
    ['async function saveOrder(', /catch\(e\)\{toast\('The order was not saved: '\+e\.message,'bad','save'\);return\}/],
  ];
  for (const [fn, re] of cases) assert.match(lineOf(fn), re, fn);
  assert.match(lineOf('function saveIds('), /\.then\(\(ok\)=>\{if\(ok\)toast\('Saved\./, 'Save says Saved only when it was');
});

test('H2: api() turns a dead engine or an unreadable answer into words, and still throws what the engine refused', () => {
  const api = lineOf('const api=async(p,o)=>');
  assert.match(api, /catch\(e\)\{throw new Error\('HQ did not answer\. Is HQ still open\?'\)\}/);
  assert.match(api, /catch\(e\)\{throw new Error\('HQ gave an answer this page cannot read \(status '\+r\.status\+'\)'\)\}/);
  assert.match(api, /if\(j\.error\)throw new Error\(j\.error\)/);
});

// ---- H4: the Shows list is never an old one -------------------------------------------------------------------------
test('H4: a saved decision or a changed show list drops the kept Shows list, and so does the end of any job', () => {
  assert.match(lineOf('const api=async(p,o)=>'), /if\(o&&\(p\.startsWith\('\/api\/override\/'\)\|\|p==='\/api\/list'\)\)SHOWS=null;return j/);
  assert.match(lineOf('function watchJob('), /delete WATCH\[id\];SHOWS=null;/);
  assert.match(lineOf('async function shows('), /^async function shows\(m\)/);
  assert.ok(PAGE.includes('if(!SHOWS)SHOWS=await api(\'/api/shows\')'), 'the list is asked again whenever it was dropped');
});

// ---- H3: a job says how it ended ------------------------------------------------------------------------------------
// The real jobEnd, watchJob and waitJob, cut out of the page and run with a made-up clock: setTimeout only queues, and settle()
// fires the queued timers in the order of their times, moving the clock to each, so twelve hours of waiting take no time here and
// two waits that overlap (the one-minute wait and the long watch) keep their real order.
function world(answers) {
  const said = [], asked = [], queue = [];
  const ctx = {
    said, asked, clock: 0, renders: 0, gits: 0,
    api: async (p) => { asked.push(p); const a = typeof answers === 'function' ? answers(ctx) : answers.shift(); if (a instanceof Error) throw a; return a; },
    toast: (m, level, key) => { said.push({ m, level, key }); },
    render: () => { ctx.renders++; }, gitLine: () => { ctx.gits++; },
  };
  ctx.setTimeout = (fn, ms) => { queue.push({ at: ctx.clock + (ms || 0), fn }); return 0; };
  ctx.Date = { now: () => ctx.clock };
  ctx.settle = async () => {
    for (let n = 0; n < 100000; n++) {
      await new Promise((r) => setImmediate(r)); // let everything that is ready run first
      if (!queue.length) return;
      queue.sort((a, b) => a.at - b.at);
      const t = queue.shift(); ctx.clock = t.at; t.fn();
    }
    throw new Error('the made-up clock never ran out of timers');
  };
  vm.createContext(ctx);
  const src = lineOf('async function jobEnd(') + '\n' + PAGE.slice(PAGE.indexOf('const WATCH={};'), PAGE.indexOf('\n', PAGE.indexOf('async function waitJob(')));
  vm.runInContext("var tab='shows',SHOWS={rows:[1]};\n" + src, ctx);
  return ctx;
}
const settle = (w) => w.settle();
const running = { running: true }, ended = (code, more) => ({ running: false, code, ...more });

test('H3: a job that ends well says "finished" in a message that stays; one that fails says so in red and what to open', async () => {
  let w = world([running, running, ended(0)]);
  vm.runInContext("watchJob('j1','The hunt job')", w); await settle(w);
  assert.deepEqual(w.said, [{ m: 'The hunt job finished.', level: 'ok', key: 'job-j1' }]);
  assert.equal(vm.runInContext('SHOWS', w), null, 'the Shows list is dropped when a job ends');
  w = world([running, ended(1)]);
  vm.runInContext("watchJob('j2','The hunt job')", w); await settle(w);
  assert.deepEqual(w.said, [{ m: 'The hunt job failed (exit 1). Open the Jobs tab and press its log to see why.', level: 'bad', key: 'job-j2' }]);
  w = world([ended(null)]);
  vm.runInContext("watchJob('j3','Art for shows without posters')", w); await settle(w);
  assert.match(w.said[0].m, /^Art for shows without posters ended, and HQ could not read how\. Open the Jobs tab/);
  assert.equal(w.said[0].level, 'bad');
});

test('H3: a short job whose result the page shows anyway stays quiet when it ends well, and never when it fails', async () => {
  let w = world([ended(0)]);
  vm.runInContext("watchJob('q1','The re-match',true)", w); await settle(w);
  assert.deepEqual(w.said, [], 'a re-match that took seconds needs no second message');
  assert.equal(w.renders, 0);
  w = world([ended(2)]);
  vm.runInContext("watchJob('q2','The re-match',true)", w); await settle(w);
  assert.equal(w.said[0].level, 'bad');
  assert.match(w.said[0].m, /^The re-match failed \(exit 2\)\./);
});

test('H3: a wait no longer gives up without a word: after a minute it says so, and the ending is still said later', async () => {
  const w = world((c) => (c.clock < 150000 ? running : ended(0))); // ends two and a half minutes in, long after the one-minute wait
  const got = vm.runInContext("waitJob('w1','The re-match',true)", w);
  await settle(w);
  assert.equal(await got, null, 'the wait itself ends empty-handed after a minute');
  const texts = w.said.map((s) => s.level + ': ' + s.m);
  assert.ok(texts.includes('wait: The re-match is taking longer than a minute. HQ will say here when it ends; until then this page shows the state from before.'), texts.join(' | '));
  assert.ok(texts.includes('ok: The re-match finished.'), 'a quiet job that ran long does say when it ends: ' + texts.join(' | '));
  assert.ok(w.said.every((s) => s.key === 'job-w1'), 'both messages share a key, so the ending takes the place of the notice');
  assert.equal(w.renders, 1, 'and the page he was left on is drawn again with the new state');
});

test('H3: a job he stopped says "stopped"; a publish ends in publish\'s own words; a job that never ends is said after 12 hours', async () => {
  let w = world([running, ended(1)]);
  vm.runInContext("watchJob('s1','The hunt job');WATCH['s1'].stopped=true", w); await settle(w);
  assert.deepEqual(w.said, [{ m: 'The hunt job stopped.', level: 'ok', key: 'job-s1' }]);
  w = world([ended(0, { outcome: { kind: 'held', level: 'wait', text: 'Held. The catalog is committed on this PC and was not pushed.' } })]);
  vm.runInContext("watchJob('p1','Publish (commit + push)')", w); await settle(w);
  assert.deepEqual(w.said, [{ m: 'Held. The catalog is committed on this PC and was not pushed.', level: 'wait', key: 'publish' }]);
  assert.equal(w.gits, 1, 'and the top line is asked again');
  w = world(() => running);
  vm.runInContext("watchJob('n1','The scout job')", w); await settle(w);
  assert.equal(w.said.length, 1);
  assert.match(w.said[0].m, /^The scout job is still running after 12 hours, or HQ stopped answering\./);
  assert.ok(w.clock >= 43200 * 1000);
});

test('H3: the buttons that start a job hand it to the watcher, and stopping one tells the watcher', () => {
  assert.match(lineOf('async function job('), /else watchJob\(j\.id,'The '\+name\+' job'\)/);
  assert.match(lineOf('async function job('), /await waitJob\(j\.id,'The re-match',true\);render\(\)/);
  assert.match(lineOf('async function startPreset('), /watchJob\(j\.id,p\[0\]\);render\(\)/);
  assert.match(lineOf('async function startCustom('), /watchJob\(j\.id,'The '\+name\+' job'\);render\(\)/);
  assert.match(lineOf('async function runDoctor('), /await waitJob\(j\.id,'The doctor',true\);render\(\)/);
  assert.match(lineOf('async function setOv('), /if\(r\.job\)await waitJob\(r\.job\.id,'The re-match',true\);render\(\);return true/);
  assert.match(lineOf('async function stopJob('), /if\(r\.stopped!==false&&WATCH\[id\]\)WATCH\[id\]\.stopped=true/);
});

test('H3: the Jobs lists draw themselves again while anything runs, the open log survives, and leaving the tab stops both timers', () => {
  const auto = lineOf('function jobsAuto(d)');
  assert.match(auto, /if\(!\(d\.jobs\.some\(j=>j\.running\)\|\|d\.processes\.length\|\|d\.processesError\)\)return;/, 'only while something runs');
  assert.match(auto, /\$\('#jrun'\)\.innerHTML=JRUN\(n\);\$\('#jstarted'\)\.innerHTML=JSTARTED\(n\);jobsAuto\(n\)\},15000\)/);
  assert.ok(PAGE.includes('<div id="jrun">\'+(JRUN=(d)=>(') && PAGE.includes('<div id="jstarted">\'+(JSTARTED=(d)=>('), 'the two lists are the same code on first draw and on every redraw');
  assert.ok(PAGE.includes("window._presets=presets;jobsAuto(d);if(LOGID)showLog(LOGID)}"));
  assert.ok(PAGE.includes("async function render(){nav();gitLine();if(tab!=='jobs'){clearInterval(logTimer);clearTimeout(jobsTimer);LOGID=null}"), 'leaving the Jobs tab stops the log and list timers');
  assert.match(lineOf('let logTimer=null;async function showLog('), /catch\(e\)\{clearInterval\(logTimer\);el\.textContent=\(el\.textContent\|\|''\)\+' \(could not read the log: '\+e\.message\+'\)'\}/);
  assert.ok(PAGE.includes("ev.target.closest('#nav a,#areas a');if(a&&a.getAttribute('href')===location.hash)render()"), 'pressing the tab he is on draws it again');
});

// ---- H7: an old health check is not shown as green --------------------------------------------------------------------
test('H7: the Health box of a check older than 30 hours is amber, not green, and says to press Run doctor', () => {
  assert.ok(PAGE.includes('const HEALTH_STALE_H=30;'));
  const hp = lineOf('function healthPanel(h){');
  assert.match(hp, /const stale=!\(age<=HEALTH_STALE_H\);/);
  assert.match(hp, /border-color:'\+\(stale&&h\.level==='green'\?col\.yellow:col\[h\.level\]\)\+'/);
  assert.match(hp, /\(stale\?'\. That is an old check and may no longer be true: press Run doctor':''\)/);
});

// ---- H8: every arrow and cross has a name ---------------------------------------------------------------------------
test('H8: every arrow and cross control in the page has a hover tip and a name', () => {
  const icon = /^[↑↓✕]$/;
  const controls = [...PAGE.matchAll(/<(button|a) ([^<>]*)>([^<]{1,3})<\/\1>/g)].filter((m) => icon.test(m[3]));
  assert.ok(controls.length >= 10, 'the Home order lists (twice), Promos and the alias and excluded-item chips: ' + controls.length);
  for (const m of controls) { assert.match(m[2], /title="[^"]{4,}"/, m[0].slice(0, 120)); assert.match(m[2], /aria-label="[^"]{4,}"/, m[0].slice(0, 120)); }
  const tips = new Set(controls.map((m) => /title="([^"]*)"/.exec(m[2])[1]));
  for (const t of ['Move up', 'Move down', 'Take off the home page (nothing changes until Save order)', 'Remove this alias (saved at once)', 'Stop excluding this item (saved at once, then a re-match)']) assert.ok(tips.has(t), t);
});

// ---- H6: a lookup that failed is said as a failure ------------------------------------------------------------------
test('H6: the page prints "could not check" in amber for a failed lookup, on Overview and on Jobs', () => {
  const ov = PAGE.slice(PAGE.indexOf('async function overview(m)'), PAGE.indexOf('async function stopPid('));
  assert.match(ov, /o\.processesError\?'<p class="gold">Could not check which jobs are running \('\+esc\(o\.processesError\)\+'\)\. Do not start another hunt/);
  assert.match(ov, /o\.tasksError\?'<p class="gold">Could not read the scheduled tasks \('\+esc\(o\.tasksError\)\+'\)\. That is the lookup failing, not the tasks/);
  assert.ok(PAGE.includes("(JRUN=(d)=>(d.processesError?'<p class=\"gold\">Could not check which jobs are running ('+esc(d.processesError)+')."));
});
