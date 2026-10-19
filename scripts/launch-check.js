// LAUNCH CHECK: the go/no-go list for opening voidtv.net, as one command. It only reads, it never opens the site, and it never
// touches the password (the gate stays on until Bryan removes it himself, audit rule R-027). The one thing that can write is --fresh,
// which runs the quick doctor, and the doctor rewrites catalog/cache/health.json as it always does.
//
//   node scripts/launch-check.js [--fresh] [--findings <file>]
//
//   --fresh            run the quick doctor first (node scripts/doctor.js --quick, no network). That rewrites
//                      catalog/cache/health.json, which is the doctor's normal output, and then reads it. The result must be
//                      newer than the start of the run, so a doctor that crashed cannot hand back an older file.
//   --findings <file>  read the audit findings from this file instead of audit/findings.json
//   VOID_ROOT=<folder> look for audit/, catalog/cache/ and backend/.env under that folder instead of this repository
//                      (audit/, catalog/cache and backend/.env are not in git, so a copy of the repository does not have them)
//
// One row per check, each GO, NO-GO or WARN, with a plain sentence and, for a NO-GO, what Bryan does by hand.
//   NO-GO  blocks the launch. The exit code is 1 when any row is NO-GO and 0 otherwise.
//   WARN   is listed and never blocks.
//   Rows 1 to 9 are required: each can come out NO-GO. Row 10 (the player soak) is advisory: GO or WARN only.
// The rules are in evaluate(), a pure function of the collected facts (tests/launch-check.test.js feeds it fixtures). The collectors
// below are thin: they read files and make a few small requests, each limited to 5 seconds, and a failure becomes a NO-GO or WARN
// row with a plain sentence, never a crash. The collectors take their fetch and run functions as arguments so the tests can feed them
// made-up answers. The only hosts contacted are voidtv.net (version.txt, the front page, /api/e), github.com (git ls-remote),
// api.cloudflare.com (one read-only Analytics Engine query) and js.sentry-cdn.com (the Sentry loader). Never the Internet Archive,
// TVmaze or TMDB. Secrets are read from backend/.env only to make the one query, are never printed, and anything in an output line
// that looks like a token is masked.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const G = require('./lib/siteguards');

const SELF_ROOT = path.join(__dirname, '..');
const NET_MS = 5000; // every network call
const HEALTH_MAX_MIN = 30; // a doctor result older than this says nothing about now
const BACKUP_WARN_DAYS = 3, BACKUP_NOGO_DAYS = 7;
const PUBLISH_QUIET_H = 6; // the doctor's own limit for "no publish run lately"
const SOAK_TARGET_MS = 3000, SOAK_MIN_MS = 2 * 3600e3; // docs/TOMORROW.md: "a 2-hour lab soak shows no pause over 3 s"
const CLOSED = ['fixed', 'refuted']; // a finding in any other status is still open (open, verified and so on)
const BLOCKING = ['critical', 'high'];
const ALLOWED_HOSTS = ['voidtv.net', 'api.cloudflare.com', 'js.sentry-cdn.com'];
const EM = '\u2014', EN = '\u2013';
const DEC = (n) => Number(n).toLocaleString('en-US');

// ---------------------------------------------------------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------------------------------------------------------
const short = (s) => String(s || '').slice(0, 9);
const mb = (n) => (n / 1e6).toFixed(1) + ' MB';
const clip = (s, n) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 3) + '...' : t; };
function ago(ms) { // "5 min", "3 h", "2 days"
  const m = Math.round(ms / 60000);
  if (m < 90) return m + ' min';
  const h = ms / 36e5;
  if (h < 48) return Math.round(h) + ' h';
  return Math.round(h / 24) + ' days';
}
// Masks anything in a line that could be a secret: the known secret values, a run of token characters that is long and holds a digit
// (a Cloudflare token, an account id, a full commit id, a Sentry key) or very long, and a JWT or Bearer header. A long run of letters and
// hyphens only (the Sentry organisation slug) is left alone. Also turns the dashes the repo bans into plain hyphens.
function scrub(text, secrets) {
  let t = String(text == null ? '' : text);
  for (const s of secrets || []) if (s && String(s).length >= 6) t = t.split(String(s)).join('***');
  t = t.replace(/Bearer\s+\S+/gi, 'Bearer ***').replace(/eyJ[A-Za-z0-9_-]{6,}(\.[A-Za-z0-9_-]+)*/g, '***')
    .replace(/[A-Za-z0-9_-]{28,}/g, (m) => (m.length >= 40 || /\d/.test(m) ? '***' : m));
  return t.split(EM).join(' - ').split(EN).join('-');
}

// The dated outcome lines publish.js writes to catalog/cache/publish.log (the same pattern the doctor reads). A run with --dry starts with
// "dry:" and never matches. Returns the last outcome of any kind, the last push, the last "refused:" and what happened in the last 24 hours.
const OUTCOME = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) (nothing new|pushed |refused:|FAILED:|held:)(.*)$/;
function parsePublishLog(text, nowMs) {
  const out = { last: null, lastPush: null, refused24: [], lastRefused: null, failed24: 0 };
  const lines = String(text || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = OUTCOME.exec(lines[i].replace(/\r$/, ''));
    if (!m) continue;
    const at = Date.parse(m[1]);
    const hit = { at, word: m[2].replace(/[: ]+$/, ''), text: (m[2] + m[3]).trim() };
    if (!out.last) out.last = hit;
    if (!out.lastPush && hit.word === 'pushed') out.lastPush = hit;
    if (hit.word === 'refused' && !out.lastRefused) out.lastRefused = hit;
    if (nowMs - at <= 864e5) { if (hit.word === 'refused') out.refused24.push(hit); if (hit.word === 'FAILED') out.failed24++; }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------
// evaluate(inputs): the rules. Pure. Returns { rows, code, verdict, blocking } and touches nothing.
// inputs (every part may be missing or carry an error string; a missing part is a NO-GO or WARN, never a crash):
//   nowMs, root
//   findings   { error } | { items: [{ id, severity, status, title, launch_blocking }] }
//   health     { error } | { data: { at, level, checks: [{ id, level, msg, fix }] } },  fresh: { ran, startedMs, error }
//   live       { error } | { text }                 the body of https://voidtv.net/version.txt
//   site       { rootStatus, apiStatus, error }     HEAD https://voidtv.net/ and, for gate=off, GET /api/e (null = not answered)
//   remote     { error } | { sha }                  git ls-remote origin master
//   analytics  { missingKeys } | { error } | { events }
//   sentry     { error } | { status, keyFound }
//   publish    { error } | { text }                 catalog/cache/publish.log
//   backup     { error } | { stamp }                catalog/cache/backup-stamp.json
//   soak       { missing } | { error } | { data }   catalog/cache/soak.json
// ---------------------------------------------------------------------------------------------------------------------------
const GO = 'GO', NOGO = 'NO-GO', WARN = 'WARN';
const mk = (n, label, status, text, extra) => ({ n, label, status, text, detail: [], fix: '', ...(extra || {}) });

function rowFindings(f) {
  const r = (status, text, extra) => mk(1, 'Findings', status, text, extra);
  if (!f || f.error) return r(NOGO, 'cannot read the audit findings: ' + clip(f && f.error || 'no findings given', 140), { fix: 'Run this from the real void-channel folder (audit/ is not in git, so a fresh copy has none), or point at the file: node scripts/launch-check.js --findings <path to findings.json>.' });
  const items = f.items || [];
  if (!items.length) return r(NOGO, 'the findings file lists no findings at all, which is not believable', { fix: 'Open the file and check it is the audit list (audit/findings.json has a top-level "findings" list).' });
  const open = items.filter((x) => !CLOSED.includes(String((x && x.status) || '').toLowerCase()));
  const sev = (x) => String(x.severity || '').toLowerCase();
  const hi = (x) => BLOCKING.includes(sev(x));
  // The audit marks some findings of any severity "launch_blocking": true. An open one of those blocks like a critical or high does.
  const flaggedOnly = (x) => x.launch_blocking === true && !hi(x);
  const rank = (x) => (sev(x) === 'critical' ? 0 : sev(x) === 'high' ? 1 : 2);
  const blocking = open.filter((x) => hi(x) || x.launch_blocking === true).sort((a, b) => rank(a) - rank(b) || String(a.id).localeCompare(String(b.id)));
  const rest = open.length - blocking.length;
  if (!blocking.length) return r(GO, `no open critical or high finding, and none flagged launch-blocking (${rest} other open finding${rest === 1 ? '' : 's'}, not blocking)`);
  const nHi = blocking.filter(hi).length, nFlag = blocking.filter(flaggedOnly).length;
  const parts = [nHi ? `${nHi} critical or high` : '', nFlag ? `${nFlag} flagged launch-blocking` : ''].filter(Boolean).join(', ');
  const row = r(NOGO, `${blocking.length} open finding${blocking.length === 1 ? '' : 's'} block${blocking.length === 1 ? 's' : ''} the launch (${parts}): ${blocking.map((x) => x.id).join(', ')}`, {
    fix: 'Each one needs a fix that is verified, or a ruling that it is not real. The list is audit/findings.json (status fixed or refuted closes one). Ask the audit chat for the fix of each, then run this check again.',
  });
  row.detail = blocking.map((x) => `${x.id} ${sev(x) || 'no severity'} (${String(x.status || 'open').toLowerCase()})${flaggedOnly(x) ? ' [flagged launch-blocking]' : ''}: ${clip(x.title, 100)}`);
  return row;
}

function rowDoctor(h, fresh, nowMs) {
  const r = (status, text, extra) => mk(2, 'Doctor', status, text, extra);
  const freshNote = fresh && fresh.ran ? ' (the quick doctor was just run)' : '';
  if (fresh && fresh.ran && fresh.error) return r(NOGO, 'the quick doctor did not run: ' + clip(fresh.error, 120), { fix: 'Run it yourself and read what it says: node scripts/doctor.js --quick' });
  if (!h || h.error || !h.data) return r(NOGO, 'no doctor result to read: ' + clip(h && h.error || 'health.json is missing', 120), { fix: 'Run the quick doctor, which writes catalog/cache/health.json: node scripts/doctor.js --quick (or run this check again with --fresh).' });
  const d = h.data, checks = Array.isArray(d.checks) ? d.checks : null;
  const atMs = Date.parse(d.at);
  if (!checks || !Number.isFinite(atMs)) return r(NOGO, 'health.json is not a doctor result (no date or no lights)', { fix: 'Run the quick doctor again: node scripts/doctor.js --quick' });
  // With --fresh the quick doctor was just run, so the result must have been written by that run. A doctor that crashed leaves the
  // file from an earlier run behind (and a crash exits 1 like a red light does), so an older "at" is not accepted.
  if (fresh && fresh.ran && Number.isFinite(fresh.startedMs) && atMs < fresh.startedMs) return r(NOGO, `the quick doctor was run but health.json is still the older result from ${ago(nowMs - atMs)} ago: the doctor did not finish writing a new one (it may have crashed)`, { fix: 'Run the quick doctor yourself and read what it says: node scripts/doctor.js --quick. Then run this check again.' });
  const age = (nowMs - atMs) / 60000;
  if (age > HEALTH_MAX_MIN) return r(NOGO, `the doctor result is ${ago(nowMs - atMs)} old (limit ${HEALTH_MAX_MIN} min), so it says nothing about now`, { fix: 'Run this check with --fresh (node scripts/launch-check.js --fresh), which runs the quick doctor first. By hand: node scripts/doctor.js --quick, then this check again.' });
  const reds = checks.filter((c) => c.level === 'red'), yellows = checks.filter((c) => c.level === 'yellow');
  if (reds.length) {
    const row = r(NOGO, `${reds.length} red light${reds.length === 1 ? '' : 's'}: ${reds.map((c) => c.id).join(', ')}${freshNote}`, { fix: 'Fix each red light, then run the quick doctor again (node scripts/doctor.js --quick). docs/RUNBOOK.md has a row for every light and says what to do.' });
    row.detail = reds.map((c) => `${c.id}: ${clip(c.msg, 110)}` + (c.fix ? ` -> ${clip(c.fix, 150)}` : ''));
    return row;
  }
  if (yellows.length) return r(WARN, `no red lights, ${yellows.length} yellow: ${yellows.map((c) => c.id).join(', ')} (${ago(nowMs - atMs)} old${fresh && fresh.ran ? ', just run' : ''})`, { fix: 'A yellow light does not block the launch (only red does); read each one and decide. docs/RUNBOOK.md says what each one means.' });
  return r(GO, `all ${checks.length} lights green (${ago(nowMs - atMs)} old${fresh && fresh.ran ? ', just run' : ''}). The quick doctor skips the network lights: rows 3, 4 and 7 cover live, files and gate; www, headers and live:missing-files are in no row (docs/DEPLOY.md, steps 7 and 8, check them by hand)`);
}

function rowLiveVersion(live, remote) {
  const r = (status, text, extra) => mk(3, 'Live = master', status, text, extra);
  if (!live || live.error) return r(NOGO, 'could not read https://voidtv.net/version.txt: ' + clip(live && live.error || 'no answer', 100), { fix: 'Open https://voidtv.net/version.txt in a browser. If it does not load, look at Cloudflare: Workers & Pages > voidtvsite > Deployments.' });
  const v = G.parseVersion(live.text);
  if (!/^[0-9a-f]{7,40}$/i.test(v.sha)) return r(NOGO, 'version.txt does not start with a commit (it says "' + clip(v.sha, 20) + '")', { fix: 'The live site was not built from Git. Deploy from Git: Workers & Pages > voidtvsite > Deployments, or push to master.' });
  if (!remote || remote.error) return r(NOGO, 'could not ask GitHub for origin/master: ' + clip(remote && remote.error || 'no answer', 100), { fix: 'Run git ls-remote origin master yourself (it needs the internet) and compare its first word with the first word of https://voidtv.net/version.txt.' });
  const rs = String(remote.sha || '').toLowerCase(), ls = v.sha.toLowerCase();
  if (rs && (rs.startsWith(ls) || ls.startsWith(rs))) return r(GO, `voidtv.net serves ${short(ls)}, which is origin/master${v.at ? ' (built ' + v.at.slice(0, 16).replace('T', ' ') + ' UTC)' : ''}`);
  return r(NOGO, `voidtv.net serves ${short(ls)} but origin/master is ${short(rs)}`, { fix: 'If you pushed in the last few minutes, wait and run this again: Cloudflare builds in about a minute. Otherwise open Workers & Pages > voidtvsite > Deployments; a failed build names its reason and the old site stays up. (After a rollback this row stays NO-GO until the newest commit is live again.)' });
}

function rowFiles(live) {
  const r = (status, text, extra) => mk(4, 'File count', status, text, extra);
  if (!live || live.error) return r(WARN, 'not checked: version.txt could not be read (row 3 says why)');
  const v = G.parseVersion(live.text);
  if (v.files == null) return r(WARN, 'version.txt has no file count (the live build is older than the file-count guard)', { fix: 'It appears with the next deploy.' });
  const c = G.checkOutput({ files: v.files, largest: v.largest || 0, largestFile: v.largestFile });
  const L = G.LIMITS;
  const size = v.largest != null ? `, largest file ${mb(v.largest)}${v.largestFile ? ' (' + v.largestFile + ')' : ''}` : '';
  const line = `${DEC(v.files)} files of ${DEC(L.pagesFiles)} allowed (build warns at ${DEC(L.filesWarn)}, refuses from ${DEC(L.filesMax)})${size} (file limit ${L.fileBytesMax / 1048576} MiB)`;
  if (c.level === 'refuse') return r(NOGO, line + ': over a limit, so the next build is refused', { fix: 'Stop the hunts that add shows (HQ > Jobs), hide shows you can do without (HQ, open the show, Hide from the site), then Publish now. Steps: docs/DEPLOY.md, "The file limit, by hand".' });
  if (c.level === 'warn') return r(WARN, line + ': getting close', { fix: 'Pages refuses a deploy over 20,000 files. Same steps as above: docs/DEPLOY.md, "The file limit, by hand".' });
  return r(GO, line);
}

function rowAnalytics(a) {
  const r = (status, text, extra) => mk(5, 'Analytics', status, text, extra);
  if (a && a.missingKeys) return r(NOGO, 'cannot ask Cloudflare: ' + a.missingKeys.join(' and ') + ' missing in backend/.env', { fix: 'Put them in backend/.env (never in chat or in git). The token is a Cloudflare API token with "Account Analytics: Read"; docs/HQ.md lists the Cloudflare steps.' });
  if (!a || a.error) return r(NOGO, 'the Analytics Engine query failed: ' + clip(a && a.error || 'no answer', 140), { fix: 'Open HQ > Reports. If it shows the same error, the token or the account id in backend/.env is wrong or expired; make a new token (Account Analytics: Read) and put it there. Check Cloudflare is up at dash.cloudflare.com.' });
  const n = Number(a.events);
  if (!Number.isFinite(n)) return r(NOGO, 'the Analytics Engine answered, but not with a count', { fix: 'Open HQ > Reports and see whether it loads.' });
  if (n === 0) return r(WARN, 'Analytics Engine answers, but holds no events from the last 24 hours', { fix: 'Open the site yourself, browse, play a minute, and run this again. If it stays at zero the intake is not writing: docs/HQ.md, the analytics binding step.' });
  return r(GO, `Analytics Engine answers: ${DEC(n)} event${n === 1 ? '' : 's'} in the last 24 hours`);
}

function rowSentry(s) {
  const r = (status, text, extra) => mk(6, 'Sentry', status, text, extra);
  const note = ' This proves the host answers, not that an event arrived.';
  if (!s || s.error) return r(NOGO, 'the Sentry loader host did not answer: ' + clip(s && s.error || 'no answer', 100) + '.' + note, { fix: 'Open https://js.sentry-cdn.com in a browser. If it loads, run this again; if not, Sentry or your connection is down and the 48 hour watch would be blind.' });
  if (s.status >= 200 && s.status < 400 && s.keyFound === false) return r(WARN, `js.sentry-cdn.com answered ${s.status} at its front door only: the site's Sentry key could not be found in scripts/lib/app.js, so the loader itself was not asked.${note}`, { fix: 'Open scripts/lib/app.js and look for SENTRY_KEY. If the key moved, this check needs updating (ask the audit chat); open https://js.sentry-cdn.com/<the key>.min.js in a browser to see the loader yourself.' });
  if (s.status >= 200 && s.status < 400) return r(GO, `js.sentry-cdn.com answered ${s.status}.${note}`);
  return r(NOGO, `js.sentry-cdn.com answered ${s.status}, which is not the loader.` + note, { fix: 'The site loads its Sentry script from there. Check the Sentry project voidtv still has its browser key (Sentry > Settings > Client Keys); the key is named in scripts/lib/app.js.' });
}

function rowPublish(p, nowMs) {
  const r = (status, text, extra) => mk(8, 'Publish', status, text, extra);
  if (!p || p.error) return r(WARN, 'no publish log to read: ' + clip(p && p.error || 'missing', 100), { fix: 'catalog/cache/publish.log is written by node scripts/publish.js. Without it nothing says how the last push went.' });
  const o = parsePublishLog(p.text, nowMs);
  if (!o.last) return r(WARN, 'the publish log holds no finished run yet', { fix: 'Run node scripts/publish.js (or Publish now in HQ) once.' });
  const when = (hit) => new Date(hit.at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const push = o.lastPush ? `last push ${when(o.lastPush)} (${ago(nowMs - o.lastPush.at)} ago)` : 'no push in the log';
  const guards = `${o.refused24.length} guard refusal${o.refused24.length === 1 ? '' : 's'} in the last day`;
  if (o.last.word === 'FAILED') return r(NOGO, `the last publish FAILED: ${clip(o.last.text.replace(/^FAILED:\s*/, ''), 120)}; ${push}`, { fix: 'Open HQ > Jobs > publish.log (catalog/cache/publish.log); the FAILED line says why. node scripts/publish.js tries again and pushes any waiting Catalog commit first.' });
  if (o.last.word === 'refused') return r(NOGO, `the last publish was refused by a guard: ${clip(o.last.text.replace(/^refused:\s*/, ''), 120)}; ${push}`, { fix: 'Nothing was committed. The line says which guard (a shrink of more than 10 percent, a file that is not JSON, an address or token). Fix the cause; a shrink that is meant needs node scripts/publish.js --allow-shrink.' });
  if (o.last.word === 'held') return r(WARN, `the last run was held: other commits are waiting to be pushed; ${push}; ${guards}`, { fix: 'The catalog is committed but not pushed because commits that publish did not make are waiting. Push them when you mean to, or node scripts/publish.js --allow-other-commits.' });
  if (o.refused24.length) return r(WARN, `${guards} (latest: ${clip(o.refused24[0].text.replace(/^refused:\s*/, ''), 90)}), but the last run is fine; ${push}`, { fix: 'The guard did its job. Read catalog/cache/publish.log to see what it caught.' });
  if (nowMs - o.last.at > PUBLISH_QUIET_H * 36e5) return r(WARN, `no publish run for ${ago(nowMs - o.last.at)}; ${push}; ${guards}`, { fix: 'Check that the VoidTV Publish task exists and the PC was on (HQ > Overview).' });
  return r(GO, `the last run was "${o.last.word}" ${ago(nowMs - o.last.at)} ago; ${push}; ${guards}`);
}

function rowBackup(b, nowMs) {
  const r = (status, text, extra) => mk(9, 'Backup', status, text, extra);
  const fixRun = 'Run: node scripts/backup-cache.js --to <a folder on another drive>. It copies only what changed, so a repeat takes seconds.';
  if (!b || b.error || !b.stamp) return r(NOGO, 'no backup stamp: ' + clip(b && b.error || 'the cache has never been backed up', 100), { fix: 'catalog/cache is not in git and holds the only copy of every TVmaze episode list. ' + fixRun });
  const atMs = Date.parse(b.stamp.at);
  if (!Number.isFinite(atMs)) return r(NOGO, 'the backup stamp has no readable date', { fix: fixRun });
  const days = (nowMs - atMs) / 864e5;
  const what = `${DEC(b.stamp.files || 0)} files, ${mb(b.stamp.bytes || 0)}`;
  const failed = Number(b.stamp.failed) > 0 ? `; ${b.stamp.failed} file${b.stamp.failed === 1 ? '' : 's'} could not be copied` : '';
  if (days > BACKUP_NOGO_DAYS) return r(NOGO, `the last backup is ${Math.floor(days)} days old (limit ${BACKUP_NOGO_DAYS}) (${what})${failed}`, { fix: fixRun });
  if (days > BACKUP_WARN_DAYS) return r(WARN, `the last backup is ${Math.floor(days)} days old (${what})${failed}`, { fix: fixRun });
  if (failed) return r(WARN, `backed up ${ago(nowMs - atMs)} ago (${what})${failed}`, { fix: 'Close any hunt that is writing the cache, then run node scripts/backup-cache.js again.' });
  return r(GO, `backed up ${ago(nowMs - atMs)} ago (${what})`);
}

function rowSoak(s, nowMs) {
  const r = (status, text, extra) => mk(10, 'Player soak', status, text, extra);
  if (!s || s.missing) return r(WARN, 'no soak result yet (catalog/cache/soak.json); the plan asks for a 2 hour lab soak with no pause over 3 seconds', { fix: 'Run the player lab (player\\LAB.cmd, tick Soak test) for 2 hours. This row is advisory and never blocks.' });
  if (s.error || !s.data) return r(WARN, 'soak.json could not be read: ' + clip(s.error || 'empty', 100));
  const d = s.data;
  const longest = Number(d.longestPauseMs), dur = Number(d.durationMs != null ? d.durationMs : (d.minutes != null ? d.minutes * 60000 : NaN));
  if (!Number.isFinite(longest)) return r(WARN, 'soak.json has no longestPauseMs, so it says nothing about pauses');
  const when = Number.isFinite(Date.parse(d.at)) ? ` (${ago(nowMs - Date.parse(d.at))} ago)` : '';
  const len = Number.isFinite(dur) ? `${Math.round(dur / 60000)} min soak` : 'a soak of unknown length';
  if (longest > SOAK_TARGET_MS) return r(WARN, `${len}${when}: longest pause ${(longest / 1000).toFixed(1)} s, over the ${SOAK_TARGET_MS / 1000} s target`, { fix: 'See player/DESIGN.md, "The buffer watch" (BUFFER_STALL_MS). This row is advisory and never blocks.' });
  if (!Number.isFinite(dur) || dur < SOAK_MIN_MS) return r(WARN, `${len}${when}: longest pause ${(longest / 1000).toFixed(1)} s, but the plan asks for 2 hours`, { fix: 'Run the soak for 2 hours. This row is advisory and never blocks.' });
  return r(GO, `${len}${when}: longest pause ${(longest / 1000).toFixed(1)} s, within the ${SOAK_TARGET_MS / 1000} s target`);
}

// The gate row asks the RUNNING site, not only version.txt: version.txt is what the build believed, the front page is what visitors get.
// The rule is the doctor's own (G.gateLight in scripts/lib/siteguards.js): gate=on must answer 401 on /, gate=off must answer 200 on /
// and 200 on /api/e (a 401 there means a password the build could not see is still guarding the intake). A mismatch is a NO-GO.
// site is { rootStatus, apiStatus } from HEAD / and, for gate=off, GET /api/e; a status that could not be read is null.
function rowGate(live, site, others) {
  const r = (status, text, extra) => mk(7, 'Gate', status, text, extra);
  if (!live || live.error) return r(WARN, 'not checked: version.txt could not be read (row 3 says why)');
  const v = G.parseVersion(live.text);
  const needs = 'To open the site (only when you say so): in Workers & Pages > voidtvsite > Settings > Variables and Secrets, delete SITE_PASSWORD, add a Text variable GATE = off, then retry the deployment (docs/DEPLOY.md, opening day).';
  if (!v.gate) return r(WARN, 'version.txt has no gate= word (the live build is older than the one-switch change)', { fix: 'It appears with the next deploy.' });
  if (!site || site.rootStatus == null) return r(NOGO, `version.txt says gate=${v.gate}, but the front page https://voidtv.net/ could not be asked (${clip(site && site.error || 'no answer', 80)}), so what visitors get is not known`, { fix: 'Open https://voidtv.net/ in a private window and run this check again. gate=on must show the password page; gate=off must show the site.' });
  if (v.gate === 'off' && site.apiStatus == null) return r(NOGO, 'gate=off, the front page answers ' + site.rootStatus + ', but the analytics intake https://voidtv.net/api/e could not be asked (' + clip(site.apiError || 'no answer', 80) + ')', { fix: 'Run this check again. If it stays, open https://voidtv.net/api/e in a browser: it should print a short line of text.' });
  const light = G.gateLight({ gate: v.gate, rootStatus: site.rootStatus, apiStatus: v.gate === 'off' ? site.apiStatus : null });
  if (light.level === 'red') return r(NOGO, light.msg, { fix: light.fix });
  if (light.level === 'yellow') return r(WARN, light.msg, { fix: light.fix });
  if (v.gate === 'on') { const row = r(GO, 'gate=on and the front page answers 401, the password page: the site is private, as it must be until you open it'); row.detail = [needs]; return row; }
  const bad = others.filter((x) => x.status === NOGO);
  if (bad.length) return r(NOGO, `gate=off: the site is OPEN (front page ${site.rootStatus}, /api/e ${site.apiStatus}) while ${bad.length === 1 ? 'row' : 'rows'} ${bad.map((x) => x.n).join(', ')} ${bad.length === 1 ? 'is' : 'are'} NO-GO. The site must not be open on a failing check`, { fix: 'Close it now: add SITE_PASSWORD (type Text) and delete GATE (or set it to on), then retry the deployment. docs/DEPLOY.md, "Rollback and closing the site again". Then fix the NO-GO rows.' });
  return r(GO, `gate=off: the site is OPEN (front page ${site.rootStatus}, /api/e ${site.apiStatus}), and no required row is NO-GO`);
}

function evaluate(inputs) {
  const i = inputs || {}, nowMs = Number.isFinite(i.nowMs) ? i.nowMs : Date.now();
  const rows = [
    rowFindings(i.findings), rowDoctor(i.health, i.fresh, nowMs), rowLiveVersion(i.live, i.remote), rowFiles(i.live),
    rowAnalytics(i.analytics), rowSentry(i.sentry),
  ];
  const later = [rowPublish(i.publish, nowMs), rowBackup(i.backup, nowMs), rowSoak(i.soak, nowMs)];
  const gate = rowGate(i.live, i.site, [...rows, ...later.filter((x) => x.n <= 9)]);
  const all = [...rows, gate, ...later].sort((a, b) => a.n - b.n);
  const blocking = all.filter((x) => x.status === NOGO).map((x) => x.n);
  const warns = all.filter((x) => x.status === WARN).map((x) => x.n);
  const code = blocking.length ? 1 : 0;
  const verdict = code
    ? `NO-GO. ${blocking.length} required row${blocking.length === 1 ? '' : 's'} block${blocking.length === 1 ? 's' : ''} the launch: ${blocking.join(', ')}.${warns.length ? ` WARN rows (do not block): ${warns.join(', ')}.` : ''}`
    : `GO. No row is NO-GO.${warns.length ? ` WARN rows (do not block): ${warns.join(', ')}.` : ''}`;
  return { rows: all, code, verdict, blocking, warns };
}

// ---------------------------------------------------------------------------------------------------------------------------
// render(result, context): the printed table, as an array of lines. Every line goes through scrub().
// ---------------------------------------------------------------------------------------------------------------------------
function wrap(text, width, indent) {
  const words = String(text).split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) { if (cur && (cur + ' ' + w).length > width) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
  if (cur) lines.push(cur);
  return lines.map((l, k) => (k === 0 ? '' : indent) + l);
}
function render(result, ctx) {
  const c = ctx || {}, secrets = c.secrets || [];
  const out = [];
  out.push(`Launch check for voidtv.net, ${new Date(c.nowMs || Date.now()).toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  if (c.root) out.push(`Reading: ${c.root}`);
  out.push('This only reads, and it never opens the site.' + (c.fresh ? ' It ran the quick doctor first, which rewrote catalog/cache/health.json as the doctor always does.' : ''));
  out.push('Rows 1 to 9 are required: a NO-GO on any of them blocks the launch (exit code 1). Row 10 is advisory. WARN never blocks.');
  out.push('');
  const pad = '               ';
  for (const r of result.rows) {
    out.push(`${String(r.n).padStart(2)}  ${r.status.padEnd(5)}  ${r.label.padEnd(13)} ${r.text}`);
    for (const d of r.detail) for (const l of wrap('- ' + d, 100, '  ')) out.push(pad + l);
    if (r.fix && r.status !== GO) for (const l of wrap('By hand: ' + r.fix, 100, '         ')) out.push(pad + l);
  }
  out.push('');
  out.push('Verdict: ' + result.verdict);
  out.push('');
  out.push('Not checked by this script, so look yourself before you open the site:');
  out.push('  - the playback pause rate in Sentry (org church-of-american-strength-ho, project voidtv) against the target;');
  out.push('  - the catalog standard (the report you were shown) and the System check page in HQ;');
  out.push('  - the Cloudflare dashboard (docs/DEPLOY.md, setup steps 1 to 6) and the doctor\'s www, headers and live:missing-files lights (steps 7 and 8).');
  out.push('Not covered by any check yet, here or by hand (known gaps):');
  out.push('  - something outside this PC that watches version.txt against origin/master (nothing covers it);');
  out.push('  - a counter of Cloudflare builds against the plan\'s monthly limit (nothing counts them; setup step 4 only emails you about a failed build);');
  out.push('  - a rehearsed rollback (docs/DEPLOY.md, "Rollback and closing the site again", says it has not been tried);');
  out.push('  - the day\'s analytics volume against the plan\'s ceiling (step 10 watches that events arrive; nothing compares the count with the ceiling);');
  out.push('  - the kids site gate page and intake, checked live after its merge (nothing covers it; CF-009 keeps row 1 NO-GO until then).');
  out.push('When every row is GO and you say so: docs/DEPLOY.md, "Opening day", has the steps and the rollback.');
  return out.map((l) => scrub(l, secrets));
}

// ---------------------------------------------------------------------------------------------------------------------------
// Collectors: thin readers. Each returns a plain object for evaluate() and never throws.
// ---------------------------------------------------------------------------------------------------------------------------
const readText = (p) => { try { return { text: fs.readFileSync(p, 'utf8') }; } catch (e) { return { error: e.code === 'ENOENT' ? 'file not found: ' + p : String(e.message).slice(0, 120) }; } };
const readJson = (p) => { const t = readText(p); if (t.error) return t; try { return { data: JSON.parse(t.text) }; } catch (e) { return { error: p + ' is not valid JSON' }; } };

function collectFindings(file) {
  const j = readJson(file);
  if (j.error) return { error: j.error };
  const list = j.data && j.data.findings;
  if (!Array.isArray(list)) return { error: file + ' has no "findings" list' };
  return { items: list.map((x) => ({ id: x.id, severity: x.severity, status: x.status, title: x.title, launch_blocking: x.launch_blocking === true })) };
}

// Only the hosts above may be contacted. Redirects are not followed: a redirect to another host would be a host we did not list.
// doFetch is fetch, or a made-up one in the tests.
async function get(url, init, doFetch) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) throw new Error('refusing to contact ' + u.hostname);
  return (doFetch || fetch)(url, { redirect: 'manual', ...(init || {}), signal: AbortSignal.timeout(NET_MS) });
}
const why = (e) => (e && e.name === 'TimeoutError' ? `no answer in ${NET_MS / 1000} s` : String((e && (e.cause && e.cause.code || e.message)) || e).slice(0, 100));
const drain = async (r) => { try { if (r && r.body && r.body.cancel) await r.body.cancel(); } catch (e) { /* body already gone */ } };

// deps (all optional, for the tests): { fetch, run, selfRoot, appSource, now, analytics }
async function collectLive(deps) {
  try {
    const r = await get('https://voidtv.net/version.txt', { headers: { 'cache-control': 'no-cache' } }, deps && deps.fetch);
    if (r.status !== 200) { await drain(r); return { error: 'it answered ' + r.status }; }
    return { text: (await r.text()).slice(0, 4000) };
  } catch (e) { return { error: why(e) }; }
}

// What visitors really get: HEAD / and, when version.txt says gate=off, GET /api/e. A status that could not be read stays null.
async function collectSite(live, deps) {
  if (!live || live.error) return null;
  const f = deps && deps.fetch, out = { rootStatus: null, apiStatus: null };
  try { const r = await get('https://voidtv.net/', { method: 'HEAD' }, f); out.rootStatus = r.status; await drain(r); } catch (e) { out.error = why(e); }
  if (G.parseVersion(live.text).gate === 'off') {
    try { const r = await get('https://voidtv.net/api/e', { method: 'GET' }, f); out.apiStatus = r.status; await drain(r); } catch (e) { out.apiError = why(e); }
  }
  return out;
}

function run(cmd, args, opts) {
  return new Promise((resolve) => execFile(cmd, args, { windowsHide: true, ...opts }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })));
}
// git ls-remote origin master, asked from the checkout this script lives in. Only github.com is allowed.
async function collectRemote(deps) {
  const doRun = (deps && deps.run) || run, cwd = (deps && deps.selfRoot) || SELF_ROOT;
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  const u = await doRun('git', ['remote', 'get-url', 'origin'], { cwd, timeout: NET_MS, env });
  const url = String(u.stdout || '').trim();
  if (u.err || !url) return { error: 'this folder has no git remote named origin' };
  const host = (/^[a-z+]+:\/\/(?:[^@/]*@)?([^/:]+)/i.exec(url) || /^[^@]+@([^:]+):/.exec(url) || [])[1];
  if (String(host).toLowerCase() !== 'github.com') return { error: 'origin is not on github.com, so it is not contacted' };
  const r = await doRun('git', ['ls-remote', 'origin', 'refs/heads/master'], { cwd, timeout: NET_MS, env });
  if (r.err) return { error: r.err.killed ? `no answer in ${NET_MS / 1000} s` : clip(r.stderr || r.err.message, 100) };
  const first = String(r.stdout || '').split(/\r?\n/)[0].split(/\s+/);
  return /^[0-9a-f]{40}$/i.test(first[0]) && first[1] === 'refs/heads/master' ? { sha: first[0] } : { error: 'GitHub did not name a master commit' };
}

// The Cloudflare account id and analytics token come from backend/.env under the root being checked (only these two keys), are handed to
// scripts/lib/cfa.js through the process environment (it reads that first), and are returned so render() can mask them.
function readSecrets(root) {
  const t = readText(path.join(root, 'backend', '.env')).text || '';
  const get1 = (k) => (process.env[k] || (new RegExp('^' + k + '=(.+)$', 'm').exec(t) || [])[1] || '').trim().replace(/^["']|["']$/g, '');
  return { account: get1('CF_ACCOUNT_ID'), token: get1('CF_ANALYTICS_TOKEN') };
}
async function collectAnalytics(root, secrets) {
  const k = readSecrets(root);
  secrets.push(k.account, k.token);
  const missing = [!k.account && 'CF_ACCOUNT_ID', !k.token && 'CF_ANALYTICS_TOKEN'].filter(Boolean);
  if (missing.length) return { missingKeys: missing };
  process.env.CF_ACCOUNT_ID = k.account; process.env.CF_ANALYTICS_TOKEN = k.token;
  const realFetch = globalThis.fetch;
  // cfa.js calls fetch with no time limit. While it runs, fetch refuses any host not on the list and gives a request that has no time
  // limit of its own a 5 second one. The other collectors run at the same time and pass their own limit, so they are not affected.
  globalThis.fetch = (url, init) => {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) throw new Error('refusing to contact ' + u.hostname);
    const i2 = { redirect: 'manual', ...(init || {}) };
    if (!i2.signal) i2.signal = AbortSignal.timeout(NET_MS);
    return realFetch(url, i2);
  };
  try {
    const rows = await require('./lib/cfa').sql("SELECT SUM(_sample_interval) AS n FROM voidtv_events WHERE timestamp > NOW() - INTERVAL '1' DAY");
    return { events: rows && rows[0] && rows[0].n != null ? Math.round(Number(rows[0].n)) : 0 };
  } catch (e) { return { error: scrub(why(e), [k.account, k.token]) }; }
  finally { globalThis.fetch = realFetch; }
}

async function collectSentry(deps) {
  // The loader is the script every page loads: https://js.sentry-cdn.com/<public browser key>.min.js (the key is public, in every page).
  // The key is taken from scripts/lib/app.js. If it cannot be found the host's front door is asked instead and the row can only be a
  // WARN (keyFound: false), never a GO: the front door answers for any visitor, so it proves nothing about this site's loader. The
  // ingest host is not named anywhere in the code (the loader supplies it), so it is not contacted.
  const src = deps && typeof deps.appSource === 'string' ? deps.appSource : readText(path.join((deps && deps.selfRoot) || SELF_ROOT, 'scripts', 'lib', 'app.js')).text || '';
  const key = (/SENTRY_KEY\s*=\s*PROFILE\.name\s*===\s*'voidtv'\s*\?\s*'([0-9a-f]{16,64})'/.exec(src) || [])[1];
  const url = key ? `https://js.sentry-cdn.com/${key}.min.js` : 'https://js.sentry-cdn.com/';
  const f = deps && deps.fetch;
  try {
    let r = await get(url, { method: 'HEAD' }, f);
    if (r.status === 405 || r.status === 501) { await drain(r); r = await get(url, { method: 'GET', headers: { range: 'bytes=0-0' } }, f); }
    await drain(r);
    return { status: r.status, keyFound: Boolean(key) };
  } catch (e) { return { error: why(e) }; }
}

async function collectHealth(root, fresh, deps) {
  const file = path.join(root, 'catalog', 'cache', 'health.json');
  const doRun = (deps && deps.run) || run, now = (deps && deps.now) || Date.now;
  let ran = null;
  if (fresh) {
    const doctor = path.join(root, 'scripts', 'doctor.js');
    if (!fs.existsSync(doctor)) ran = { ran: true, error: 'no scripts/doctor.js under ' + root };
    else {
      const startedMs = now();
      const r = await doRun(process.execPath, [doctor, '--quick'], { cwd: root, timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
      // The doctor exits 1 when a light is red (a result) and also when it crashes with an uncaught error, so the exit code cannot say
      // which. What can: health.json must have been written after startedMs (rowDoctor checks it). A kill or a missing node is the failure here.
      ran = r.err && (r.err.killed || typeof r.err.code !== 'number') ? { ran: true, startedMs, error: r.err.killed ? 'it took over 3 minutes and was stopped' : clip(r.err.message, 100) } : { ran: true, startedMs };
    }
  }
  const j = readJson(file);
  return { health: j.error ? { error: j.error } : { data: j.data }, fresh: ran };
}

// The three files under catalog/cache that rows 8, 9 and 10 read.
function collectPublish(root) { const t = readText(path.join(root, 'catalog', 'cache', 'publish.log')); return t.error ? { error: t.error } : { text: t.text }; }
function collectBackup(root) { const j = readJson(path.join(root, 'catalog', 'cache', 'backup-stamp.json')); return j.error ? { error: j.error } : { stamp: j.data }; }
function collectSoak(root) {
  const p = path.join(root, 'catalog', 'cache', 'soak.json');
  if (!fs.existsSync(p)) return { missing: true };
  const j = readJson(p);
  return j.error ? { error: j.error } : { data: j.data };
}

async function collectAll(opts, deps) {
  const root = opts.root, secrets = [], d = deps || {};
  const analyticsFn = d.analytics || collectAnalytics;
  const [liveAndSite, remote, analytics, sentry, hc] = await Promise.all([
    collectLive(d).then(async (live) => ({ live, site: await collectSite(live, d) })),
    collectRemote(d), analyticsFn(root, secrets), collectSentry(d), collectHealth(root, opts.fresh, d),
  ]);
  return {
    secrets,
    inputs: {
      nowMs: (d.now || Date.now)(), root, findings: collectFindings(opts.findings || path.join(root, 'audit', 'findings.json')),
      health: hc.health, fresh: hc.fresh, live: liveAndSite.live, site: liveAndSite.site, remote, analytics, sentry,
      publish: collectPublish(root), backup: collectBackup(root), soak: collectSoak(root),
    },
  };
}

const USAGE = 'Usage: node scripts/launch-check.js [--fresh] [--findings <file>]   (VOID_ROOT=<folder> reads audit/, catalog/cache and backend/.env from there)';
function parseArgs(argv) {
  const o = { fresh: false, findings: '', bad: [] };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a === '--fresh') o.fresh = true;
    else if (a === '--findings' && argv[k + 1] && !argv[k + 1].startsWith('--')) o.findings = path.resolve(argv[++k]);
    else if (a === '--help' || a === '-h') o.help = true;
    else o.bad.push(a);
  }
  return o;
}

async function main(argv) {
  const o = parseArgs(argv);
  if (o.help) { console.log(USAGE); return 0; }
  if (o.bad.length) { console.error('Refused: unknown or incomplete option ' + o.bad.map((b) => JSON.stringify(b)).join(', ') + '. ' + USAGE); return 2; }
  const root = process.env.VOID_ROOT ? path.resolve(process.env.VOID_ROOT) : SELF_ROOT;
  const { inputs, secrets } = await collectAll({ root, fresh: o.fresh, findings: o.findings });
  const result = evaluate(inputs);
  for (const line of render(result, { nowMs: inputs.nowMs, root, secrets, fresh: o.fresh })) console.log(line);
  return result.code;
}

module.exports = {
  evaluate, render, scrub, parsePublishLog, parseArgs, main, ALLOWED_HOSTS,
  collectFindings, collectLive, collectSite, collectRemote, collectSentry, collectHealth, collectPublish, collectBackup, collectSoak, collectAll,
};
if (require.main === module) main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error('The launch check itself failed: ' + scrub(e && e.message || e)); process.exit(2); });
