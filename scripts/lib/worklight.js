// WORK LIGHTS: did the nightly pass actually do anything? (B, 15 Nov 2026: "Yes, build those".) Found that day: the doctor was red 21 nights
// running and nobody saw it, the hunt reported "ok" every night with 0 Archive calls because every listed show was hunted, the same hunt
// error came back every night, and the library stayed at 4,245 shows for 19 days. "ok" must mean the work got done, so these lights turn
// yellow when a step had nothing to do, when one error repeats, and when the library stops growing. Pure: the doctor hands in the nightly
// log text and the Catalog commit subjects; tests/work-lights.test.js proves each rule. docs/RUNBOOK.md, rows work:idle, work:repeat, growth.

const IDLE_NIGHTS = 3; // a step with nothing to do this many nights in a row is worth a look
const REPEAT_NIGHTS = 3; // the same error this many nights in a row
const STALL_DAYS = 7; // the library at the same size this long

// The nightly log as runs: [{ at, steps: { hunt: 'the step line', ... } }], oldest first. A run starts at "==== nightly start"; a step
// line is "<time>    <name> ok|FAILED ...". Lines before the first start are ignored.
function parseNights(text) {
  const runs = [];
  let cur = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    const start = /^(\S+) ==== nightly start/.exec(line);
    if (start) { cur = { at: start[1], steps: {}, skippedHunts: false }; runs.push(cur); continue; }
    if (!cur) continue;
    if (/hunt process\(es\) already running; skipping the hunt steps/.test(line)) cur.skippedHunts = true;
    const m = /^\S+ {2,}([a-z][\w-]*) (ok|FAILED)\b(.*)$/.exec(line);
    if (m) cur.steps[m[1]] = { ok: m[2] === 'ok', text: m[3] };
  }
  return runs;
}

// What "had nothing to do" looks like in each Archive-facing step's last lines.
const IDLE = {
  hunt: { test: (t) => /\b0 Archive calls\b/.test(t) && !/budget/i.test(t), what: 'the show hunt', why: 'every show on the list has been hunted' },
  movies: { test: (t) => /\b0 titles to hunt\b/.test(t) || /\b0 Archive calls\b/.test(t), what: 'the TV-movie hunt', why: 'every film on the movie list has been hunted' },
};
const IDLE_FIX = 'Nothing is broken; the hunt has run out of shows to look for, so the library stops growing. New shows wait in three places: docs/NETWORKS.md (shows the networks carry that are not on your list), docs/SCOUT.md (confirmed leads the scout found) and HQ > Analytics > Searches (what viewers searched for and did not find). Add them in HQ > Add shows, or paste names into scripts/show-list.json; the next nightly hunts them.';

function idleLight(runs) {
  const idle = [];
  for (const [step, rule] of Object.entries(IDLE)) {
    let n = 0;
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i];
      if (r.skippedHunts) break; // another hunt was running: that night says nothing about the list
      const s = r.steps[step];
      if (!s || !s.ok || !rule.test(s.text)) break;
      n++;
    }
    if (n >= IDLE_NIGHTS) idle.push(`${rule.what} had nothing to do ${n} nights running (${rule.why})`);
  }
  if (idle.length) return { id: 'work:idle', level: 'yellow', msg: idle.join('; '), fix: IDLE_FIX };
  if (!runs.length) return { id: 'work:idle', level: 'green', msg: 'no nightly pass recorded yet' };
  return { id: 'work:idle', level: 'green', msg: 'the hunts found work to do in the last ' + IDLE_NIGHTS + ' nights' };
}

// The error fragments a run carries: "!! <what>: <error>" pieces in step lines (the hunt prints one per show that broke), and the reason
// of a FAILED step. Numbers are blanked so "in 4 min" and "in 5 min" count as the same error.
function errorsOf(run) {
  const out = new Set();
  for (const [step, s] of Object.entries(run.steps)) {
    if (step === 'doctor' || step === 'alert') continue; // a red doctor is its own lights (and alerts); counting it here only repeats them
    for (const m of s.text.matchAll(/!!\s*([^|]+?)\s*(?=\||$)/g)) out.add(step + ': ' + m[1].trim());
    if (!s.ok) out.add(step + ' FAILED: ' + s.text.replace(/\bin \d+ min\b/, '').replace(/::.*$/, '').trim());
  }
  return out;
}
const sameKey = (e) => e.replace(/\d+/g, '#');

function repeatLight(runs) {
  if (runs.length < REPEAT_NIGHTS) return { id: 'work:repeat', level: 'green', msg: 'fewer than ' + REPEAT_NIGHTS + ' nightly passes recorded' };
  const last = runs.slice(-REPEAT_NIGHTS).map((r) => new Map([...errorsOf(r)].map((e) => [sameKey(e), e])));
  const every = [...last[last.length - 1].entries()].filter(([k]) => last.every((m) => m.has(k))).map(([, e]) => e);
  if (!every.length) return { id: 'work:repeat', level: 'green', msg: 'no error came back on each of the last ' + REPEAT_NIGHTS + ' nights' };
  // How many nights the first of them has been there.
  const k0 = sameKey(every[0]);
  let nights = 0;
  for (let i = runs.length - 1; i >= 0 && [...errorsOf(runs[i])].some((e) => sameKey(e) === k0); i--) nights++;
  const shown = every.slice(0, 3).map((e) => e.slice(0, 120)).join(' | ') + (every.length > 3 ? ` | and ${every.length - 3} more` : '');
  return {
    id: 'work:repeat', level: 'yellow',
    msg: `${every.length} error${every.length === 1 ? '' : 's'} on each of the last ${REPEAT_NIGHTS} nights (the first for ${nights} nights): ${shown}`,
    fix: 'A step that breaks the same way every night will not fix itself. HQ > Jobs > nightly.log has the full line. A "!! <show>: ..." error is one show the hunt cannot read: run node scripts/hunt.js --slug <show-slug> to see it alone, then fix the show (HQ > Shows, set its TVmaze id) or tell the Voidtv chat. A FAILED step: run that step\'s command from nightly.log by hand to see the whole error.',
  };
}

// The library's size over time, from the "Catalog: N shows, M episodes (k files)" commits publish makes. rows: [{ at: ms, subject }],
// any order. Yellow when the latest size has not changed for STALL_DAYS days or more.
function growthLight(rows, nowMs) {
  const sized = rows.map((r) => { const m = /^Catalog: (\d+) shows, (\d+) episodes/.exec(r.subject || ''); return m ? { at: r.at, shows: +m[1], eps: +m[2] } : null; })
    .filter(Boolean).sort((a, b) => b.at - a.at);
  if (!sized.length) return { id: 'growth', level: 'green', msg: 'no Catalog commits to measure yet' };
  const now = sized[0];
  let since = now.at;
  for (const r of sized) { if (r.shows !== now.shows || r.eps !== now.eps) break; since = r.at; }
  const days = Math.floor((nowMs - since) / 864e5);
  const size = `${now.shows} shows and ${now.eps} episodes`;
  if (days >= STALL_DAYS) {
    return {
      id: 'growth', level: 'yellow',
      msg: `the library has stayed at ${size} for ${days} days` + (sized.length > 1 ? ` (since ${new Date(since).toISOString().slice(0, 10)})` : ''),
      fix: 'The site still works; it just is not getting new shows. Look at work:idle first: when the hunts have nothing to do, the list needs new shows (docs/NETWORKS.md, docs/SCOUT.md, HQ > Analytics > Searches, then HQ > Add shows). When the hunts are busy and still nothing grows, the matcher may be turning everything down: HQ > Jobs > the last hunt log.',
    };
  }
  return { id: 'growth', level: 'green', msg: `${size}; last change ${days} day${days === 1 ? '' : 's'} ago` };
}

module.exports = { parseNights, idleLight, repeatLight, growthLight, IDLE_NIGHTS, REPEAT_NIGHTS, STALL_DAYS };
