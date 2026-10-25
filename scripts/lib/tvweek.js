// THE WEEKLY LINEUP (B, 25 Oct 2026: "new shows join Live TV once a week"; a publish never moves a show mid-week).
//
// Every build makes a fresh Live TV plan from today's catalog (buildTv in scripts/lib/app.js). Without this file, each nightly publish
// reshuffled most of the week (measured 25 Oct: one ordinary publish changed 77% of the airings on 105 of 107 channels). Now:
//   * The week turns at 6:00 am on Monday, local time (scripts/lib/tvgrid.js weekOfDay).
//   * catalog/tv-lineup.json keeps two plans: this week's and next week's, by week number. It is written by the publish on this PC
//     (scripts/publish.js, before it stages the catalog) and read by every build, here and on Cloudflare.
//   * This week's plan is frozen: once stored, every build uses the stored copy. Next week's plan follows the catalog (fresh at
//     every publish) until its Monday has begun anywhere in the world; from then on it is frozen too. So new shows and episodes
//     reach Live TV on the next Monday, while show pages get them every night.
//   * The page gets both plans in data/tv.json (this week at the top, next week as nx) and each viewer turns to the new one at
//     6:00 am on their own Monday.
//   * A show that leaves the site during a frozen week keeps its slots as breaks (tvgrid.js adopt); nothing else moves.
//   * With no stored plan for this week (no publish has run since its Monday, or the file was removed on purpose to rebuild the
//     week), the build uses the fresh plan, as before, and the doctor's tv:lineup light says the week is not frozen.
// By hand, no AI: delete catalog/tv-lineup.json and publish (HQ > Publish, or node scripts/publish.js) to rebuild this week's
// lineup from today's catalog at once. docs/RUNBOOK.md, tv:lineup.
const fs = require('fs');
const { tvgridFactory } = require('./tvgrid');

const H = 3600000;
// The week number a moment falls in, in the earliest time zone (UTC+14, the first to reach Monday) and the latest (UTC-12).
const zone = (h) => { const T = tvgridFactory(); T.setOff(() => h * H); return T; };
const EARLY = zone(14), LATE = zone(-12);
function weeksAt(at) { return { lo: LATE.weekOfDay(LATE.dayOf(at)), hi: EARLY.weekOfDay(EARLY.dayOf(at)) }; }
// The Monday a week starts on, as a date (YYYY-MM-DD): week w's first broadcast day is w * 7 - 3 days after 1 Jan 1970.
const mondayOf = (w) => new Date((w * 7 - 3) * 86400000).toISOString().slice(0, 10);

// Only the plan itself is stored: the week fields belong to data/tv.json.
const bare = (plan) => { const out = Object.assign({}, plan); delete out.w; delete out.fz; delete out.nx; return out; };

// fresh: today's plan from buildTv. stored: the parsed catalog/tv-lineup.json, or null. at: now.
// Returns tv (what data/tv.json carries), store (what the publish writes back) and the facts the doctor shows.
function lineup(fresh, stored, at) {
  const { lo, hi } = weeksAt(at);
  const W = (stored && stored.weeks) || {};
  const curFrozen = !!W[lo], nextStarted = hi >= lo + 1, nextFrozen = nextStarted && !!W[lo + 1];
  const cur = curFrozen ? W[lo] : bare(fresh);
  const nxt = nextFrozen ? W[lo + 1] : bare(fresh);
  const tv = Object.assign({}, cur, { w: lo, fz: curFrozen ? 1 : 0, nx: Object.assign({}, nxt, { w: lo + 1, fz: nextFrozen ? 1 : 0 }) });
  const store = { weeks: { [lo]: cur, [lo + 1]: nxt } };
  return { tv, store, week: lo, monday: mondayOf(lo), nextMonday: mondayOf(lo + 1), curFrozen, nextFrozen };
}

// The file, one week per line so a publish that only refreshes next week leaves this week's line alone in git. "@" and "." are
// written as @ and .: the episode lengths are stored as characters (a 29-minute episode is "@", an 11-minute one "."),
// and runs of them can look like an email address to the publish's leak check. The JSON reads back the same.
function serialize(store) {
  const safe = (x) => JSON.stringify(x).replace(/@/g, '\\u0040').replace(/\./g, '\\u002e');
  const keys = Object.keys(store.weeks).sort((a, b) => a - b);
  return '{"weeks":{\n' + keys.map((k) => JSON.stringify(k) + ':' + safe(store.weeks[k])).join(',\n') + '\n}}\n';
}
function read(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
// Writes only when the text changed, so a publish with nothing new for Live TV leaves the file (and git) alone. True when it wrote.
function write(file, store) {
  const text = serialize(store);
  let old = null;
  try { old = fs.readFileSync(file, 'utf8'); } catch (e) { /* first write */ }
  if (old === text) return false;
  fs.writeFileSync(file, text);
  return true;
}

module.exports = { weeksAt, mondayOf, lineup, serialize, read, write };
