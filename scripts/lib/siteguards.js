// SITE GUARDS: the small pure rules behind the delivery switch and its checks (audit fix batch B, B3:
// CF-002 CF-003 SP-016 F-004 CF-025 F-005 CF-008 CF-012 CF-016 CF-018 CP-012). Nothing here writes a file or
// reaches the network by itself; the one function that talks to the live site (liveLights) is handed a fetch.
// scripts/site.js uses it to decide the routing, the headers, the version.txt line and the build refusals,
// scripts/doctor.js uses it to turn the same numbers into lights, and tests/site-guards.test.js tests it.
//
// The one switch: the SITE_PASSWORD variable on the Cloudflare Pages project. Set (as a plain-text variable, which is
// the only kind the build can see) = the gate is on and every page goes through the gate Function. Not set = the
// site is open and only /api/* and /q/* still run as Functions. GATE=on is a spare, for the case where SITE_PASSWORD
// has to be an encrypted secret (a secret is hidden from the build, so the build is told by this plain variable).
'use strict';
const fs = require('fs');
const path = require('path');

const MiB = 1024 * 1024;
// Cloudflare Pages: 20,000 files per deploy and 25 MiB per file. The build warns early and refuses before the limit.
const LIMITS = { filesWarn: 18000, filesMax: 19500, fileBytesMax: 24 * MiB, pagesFiles: 20000 };
const SHRINK = 0.1; // the same 10 percent publish.js refuses
const STALE_BUILD_MIN = 10; // minutes a push may sit before a live site that does not show it is called stale
const BACKUP_DAYS = 7;

const mb = (n) => (n / 1e6).toFixed(1) + ' MB';

// 1. The switch ---------------------------------------------------------------------------------------------------
const isGated = (env) => Boolean(env && env.SITE_PASSWORD) || String((env && env.GATE) || '').trim().toLowerCase() === 'on';
// Gated: everything but the brand assets runs through the gate Function. Open: pages are plain static files and
// only the analytics intake and the QR redirects are Functions.
const routesFor = (gated) => (gated ? { version: 1, include: ['/*'], exclude: ['/assets/*'] } : { version: 1, include: ['/api/*', '/q/*'], exclude: [] });

// 2. Security headers (CF-012) ------------------------------------------------------------------------------------
// Content-Security-Policy-Report-Only first: it reports to the browser console and blocks nothing. Built from what
// scripts/lib/app.js and the player really load: one big inline script and style, the Sentry loader, posters from TMDB and
// the Archive, media from the Archive and blob: subtitle tracks, fetches to /api/e and the Archive's metadata.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.sentry-cdn.com https://browser.sentry-cdn.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://image.tmdb.org https://archive.org https://*.archive.org",
  "media-src 'self' blob: https://archive.org https://*.archive.org",
  "connect-src 'self' https://archive.org https://*.archive.org https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
// Sent on static files (through _headers) and on every Function response (functions/_middleware.js keeps its own copy of
// this list, because a Function cannot import from scripts/; tests/site-middleware.test.js fails when the two differ).
const SECURITY_HEADERS = [
  ['Strict-Transport-Security', 'max-age=31536000'],
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['Content-Security-Policy-Report-Only', CSP],
];
function headersFile() {
  return '/*\n' + SECURITY_HEADERS.map(([k, v]) => `  ${k}: ${v}\n`).join('')
    + '/data/*\n  Cache-Control: public, max-age=300\n/show/*\n  Cache-Control: public, max-age=300\n/assets/*\n  Cache-Control: public, max-age=86400\n';
}
// Names of the three headers the doctor insists on that a response lacks. get(name) returns the value or null.
function missingSecurityHeaders(get) {
  const val = (n) => String(get(n) || '').toLowerCase();
  const out = [];
  if (!/max-age=\d*[1-9]/.test(val('strict-transport-security'))) out.push('Strict-Transport-Security');
  if (!/^(deny|sameorigin)\b/.test(val('x-frame-options'))) out.push('X-Frame-Options');
  if (!val('x-content-type-options').includes('nosniff')) out.push('X-Content-Type-Options');
  return out;
}

// 3. version.txt --------------------------------------------------------------------------------------------------
// Line 1 is what it always was ("<commit> <time>"). Line 2 is key=value words the doctor reads without the build log.
function versionText(v) {
  const words = [`gate=${v.gate ? 'on' : 'off'}`, `files=${v.files}`, `largest=${v.largest}`, `shows=${v.shows}`, `episodes=${v.episodes}`];
  if (v.largestFile) words.push(`largestFile=${v.largestFile}`);
  return `${v.sha} ${v.at}\n${words.join(' ')}\n`;
}
function parseVersion(text) {
  const t = String(text || '');
  const first = t.split(/\r?\n/)[0].trim().split(/\s+/);
  const out = { sha: first[0] || '', at: first[1] || '', gate: null, files: null, largest: null, shows: null, episodes: null, largestFile: '' };
  for (const m of t.matchAll(/\b(gate|files|largest|shows|episodes|largestFile)=(\S*)/g)) {
    if (m[1] === 'gate') out.gate = m[2] === 'on' ? 'on' : m[2] === 'off' ? 'off' : null;
    else if (m[1] === 'largestFile') out.largestFile = m[2];
    else if (/^\d+$/.test(m[2])) out[m[1]] = +m[2];
  }
  return out;
}

// 4. Build refusals (F-005, CF-008, CF-018) -----------------------------------------------------------------------
// files: how many files the build wrote; largest: the biggest one in bytes. level is ok, warn or refuse.
function checkOutput({ files, largest, largestFile }) {
  const why = [];
  let level = 'ok';
  if (largest > LIMITS.fileBytesMax) { level = 'refuse'; why.push(`${largestFile || 'a file'} is ${(largest / MiB).toFixed(1)} MiB; Pages refuses a file over 25 MiB and this build stops at ${LIMITS.fileBytesMax / MiB} MiB`); }
  if (files >= LIMITS.filesMax) { level = 'refuse'; why.push(`${files} files; Pages refuses a deploy over ${LIMITS.pagesFiles.toLocaleString('en-US')} files and this build stops at ${LIMITS.filesMax.toLocaleString('en-US')}`); }
  else if (files >= LIMITS.filesWarn) { if (level === 'ok') level = 'warn'; why.push(`${files} files; Pages allows ${LIMITS.pagesFiles.toLocaleString('en-US')} per deploy and this build warns from ${LIMITS.filesWarn.toLocaleString('en-US')}`); }
  return { level, why };
}
// Same rule as publish.js: a drop of more than 10 percent in shows or in episodes. before is { shows, episodes } or null.
function shrinkVerdict(now, before) {
  if (!before) return { fell: false, parts: [] };
  const fell = (a, b) => a > 0 && (a - b) / a > SHRINK;
  const parts = [];
  if (fell(before.shows, now.shows)) parts.push(`shows ${before.shows} -> ${now.shows}`);
  if (Number.isFinite(before.episodes) && Number.isFinite(now.episodes) && fell(before.episodes, now.episodes)) parts.push(`episodes ${before.episodes} -> ${now.episodes}`);
  return { fell: parts.length > 0, parts };
}
// The counts the site last went out with. publish-state.json (this PC, written by publish.js after a push) wins; the committed
// count.json (written by publish.js into every Catalog commit) is what a Cloudflare build can see, because catalog/cache is not in git.
function readLastCounts(catalogDir) {
  const tryRead = (p, source) => { try { const s = JSON.parse(fs.readFileSync(p, 'utf8')); if (Number.isFinite(s.shows) && Number.isFinite(s.episodes)) return { shows: s.shows, episodes: s.episodes, source }; } catch (e) { /* missing or unreadable */ } return null; };
  return tryRead(path.join(catalogDir, 'cache', 'publish-state.json'), 'catalog/cache/publish-state.json') || tryRead(path.join(catalogDir, 'count.json'), 'catalog/count.json');
}
// Show grids that exist but do not parse. assemble() drops such a show without a word.
function unreadableGrids(showsDir) {
  const bad = [];
  let names = []; try { names = fs.readdirSync(showsDir); } catch (e) { return bad; }
  for (const f of names) {
    if (!f.endsWith('.json')) continue;
    try { JSON.parse(fs.readFileSync(path.join(showsDir, f), 'utf8')); } catch (e) { bad.push(f); }
  }
  return bad;
}

// 5. Lights (each is { id, level, msg, fix }; level is green, yellow or red) ---------------------------------------
const light = (id, level, msg, fix) => ({ id, level, msg, fix: level === 'green' ? undefined : fix });

function filesLight(v) {
  if (v.files == null) return light('files', 'yellow', 'version.txt has no file count yet', 'The live build is older than the file-count guard. The count appears after the next deploy.');
  const r = checkOutput({ files: v.files, largest: v.largest || 0, largestFile: v.largestFile });
  const size = v.largest != null ? `, largest file ${mb(v.largest)}${v.largestFile ? ' (' + v.largestFile + ')' : ''}` : '';
  const line = `${v.files.toLocaleString('en-US')} files of ${LIMITS.pagesFiles.toLocaleString('en-US')} allowed${size}`;
  if (r.level === 'refuse') return light('files', 'red', line + ': ' + r.why.join('; '), 'A build this big is refused, so the old site stays up. Reduce what the site writes: fewer per-show pages or a data split (audit F-005); tell the Voidtv chat.');
  if (r.level === 'warn') return light('files', 'yellow', line, 'Pages refuses a deploy over 20,000 files and the old site stays up. It grew about 350 files a day in October 2026 while hunts added shows. The fix is fewer per-show pages or a data split (audit F-005); tell the Voidtv chat.');
  return light('files', 'green', line);
}

// gate is 'on' or 'off' from version.txt; rootStatus is the answer to HEAD /; apiStatus the answer to GET /api/e (only used when gate=off).
function gateLight({ gate, rootStatus, apiStatus }) {
  if (!gate) return light('gate', 'yellow', 'version.txt has no gate= word yet', 'The live build is older than the one-switch change. It appears after the next deploy.');
  if (rootStatus == null) return light('gate', 'yellow', `version.txt says gate=${gate}, but the front page did not answer`, 'Check https://voidtv.net/ by hand and the Cloudflare Pages deployment list.');
  if (gate === 'on') {
    if (rootStatus === 401) return light('gate', 'green', 'gate=on and the front page answers 401 (the password page), as it should');
    return light('gate', 'red', `version.txt says gate=on but the front page answered ${rootStatus}, not 401`, 'The build thinks the password is set but the running site disagrees. In Cloudflare, Workers & Pages > voidtvsite > Settings > Variables and Secrets: SITE_PASSWORD (and GATE, if you added it) must be set the same way, then Deployments > Retry deployment.');
  }
  if (rootStatus !== 200) return light('gate', 'red', `version.txt says gate=off but the front page answered ${rootStatus}, not 200`, 'The build was told the site is open but the running site still shows the password page or an error. Check Workers & Pages > voidtvsite > Settings > Variables and Secrets for SITE_PASSWORD in the Preview and Production lists, then Deployments > Retry deployment.');
  if (apiStatus === 401) return light('gate', 'red', 'gate=off, the pages are open, but the analytics intake (/api/e) answered 401', 'The password is still set where the running site can see it (probably as an encrypted secret the build cannot read). Delete SITE_PASSWORD completely, or, if the site should stay private, add a plain-text GATE = on beside it. Then Deployments > Retry deployment.');
  if (apiStatus != null && apiStatus !== 200) return light('gate', 'yellow', `gate=off and the pages are open, but /api/e answered ${apiStatus} (200 expected)`, 'Analytics may not be collecting. Check functions/api/e.js deployed: Workers & Pages > voidtvsite > Deployments > the latest > Functions.');
  return light('gate', 'green', 'gate=off: the site is OPEN to everyone and the analytics intake answers (right after opening day, wrong before it)');
}

function wwwLight({ status, location }) {
  if (status == null) return light('www', 'yellow', 'https://www.voidtv.net/ did not answer', 'Check the www DNS record and the Pages custom domain list (docs/DEPLOY.md, opening day).');
  let to = ''; try { to = new URL(location || '', 'https://www.voidtv.net/').href; } catch (e) { /* none */ }
  if (status === 301 && to === 'https://voidtv.net/') return light('www', 'green', 'www.voidtv.net answers 301 to https://voidtv.net/');
  return light('www', 'yellow', `www.voidtv.net answered ${status}${location ? ' to ' + location : ''}, not a 301 to https://voidtv.net/`, 'While the password is on, the Function redirects www. After opening day only a Cloudflare rule can: voidtv.net > Rules > Redirect Rules, host equals www.voidtv.net, 301 to https://voidtv.net plus the path and query (docs/DEPLOY.md, opening day).');
}

// checked: [{ url, status, missing: [header names] }] for HEAD / and HEAD /version.txt. A header the code sets (X-Frame-Options,
// X-Content-Type-Options) missing is red; HSTS alone is yellow because the zone setting is a click.
function headersLight(checked) {
  const bad = checked.filter((c) => c.missing && c.missing.length);
  if (!checked.length || checked.every((c) => c.status == null)) return light('headers', 'yellow', 'could not read the headers of the live site', 'Check the site answers; docs/DEPLOY.md lists the headers.');
  if (!bad.length) return light('headers', 'green', `${checked.map((c) => c.url).join(' and ')} carry HSTS, X-Frame-Options and nosniff`);
  const text = bad.map((c) => `${c.url} lacks ${c.missing.join(', ')}`).join('; ');
  const onlyHsts = bad.every((c) => c.missing.every((m) => m === 'Strict-Transport-Security'));
  if (onlyHsts) return light('headers', 'yellow', text, 'HSTS is the Cloudflare click: voidtv.net > SSL/TLS > Edge Certificates > HTTP Strict Transport Security (HSTS) > Enable HSTS, max age 12 months, leave the subdomain and preload boxes off. The build also sends it, so a deploy after this change shows it.');
  return light('headers', 'red', text, 'scripts/site.js writes these into _headers and functions/_middleware.js adds them to every Function answer. If the live site lacks them the latest deploy did not carry them: Workers & Pages > voidtvsite > Deployments.');
}

// Live version against origin/master (CF-016). remote.sha is `git rev-parse origin/master` with no fetch; remote.atMs its committer date;
// remote.liveIsNewer is true when origin/master is an ancestor of the live commit (this PC has simply not fetched yet).
function liveVersionLight({ liveSha, remote, nowMs }) {
  if (!remote || !remote.sha) return null;
  const short = (s) => String(s || '').slice(0, 9);
  if (!liveSha || liveSha === 'unknown') return light('live:version', 'yellow', 'version.txt does not name a commit', 'The live build did not record which commit it came from (a build made by hand has none). Deploy from Git: Workers & Pages > voidtvsite > Deployments.');
  if (remote.sha.startsWith(liveSha) || liveSha.startsWith(remote.sha) || remote.liveIsNewer) return light('live:version', 'green', `voidtv.net serves ${short(liveSha)}, which is origin/master or newer`);
  const age = Math.round((nowMs - remote.atMs) / 60000);
  if (age <= STALE_BUILD_MIN) return light('live:version', 'green', `voidtv.net serves ${short(liveSha)}; origin/master is ${short(remote.sha)}, pushed ${age} min ago, so Cloudflare is probably still building`);
  return light('live:version', 'yellow', `voidtv.net serves ${short(liveSha)} but origin/master is ${short(remote.sha)}, made ${age} min ago`, 'Cloudflare has not built the latest push or the build failed: dash.cloudflare.com > Workers & Pages > voidtvsite > Deployments, open the failed one, the log names the error (try node scripts/site.js here first).');
}

// now and before are { shows, episodes }; before.source says where the old numbers came from.
function shrinkLight(now, before) {
  if (!before) return light('shrink', 'yellow', 'no published count to compare with yet', 'It appears after the first publish (catalog/cache/publish-state.json and catalog/count.json).');
  const v = shrinkVerdict(now, before);
  const pct = before.shows > 0 ? Math.round(((before.shows - now.shows) / before.shows) * 100) : 0;
  if (v.fell) return light('shrink', 'red', `${v.parts.join(', ')}: down more than 10% against the last publish (${before.source})`, 'Something emptied the catalog. Do not publish yet: check git status in catalog/ and HQ > Jobs for a match that went wrong, and restore with git checkout -- catalog. If the drop is meant, node scripts/publish.js --allow-shrink.');
  return light('shrink', 'green', `${now.shows} shows now, ${before.shows} at the last publish (${pct > 0 ? 'down ' + pct + '%' : 'not down'}; limit 10%)`);
}

function backupLight(stamp, nowMs) {
  if (!stamp || !stamp.at) return light('backup', 'red', 'the TVmaze and metadata caches have never been backed up', 'catalog/cache is not in git and holds the only copy of every TVmaze episode list. Run: node scripts/backup-cache.js --to <a folder on another drive>. To make that the default, put VOID_BACKUP_DIR=<folder> in backend/.env.');
  const days = (nowMs - new Date(stamp.at).getTime()) / 864e5;
  const what = `${(stamp.files || 0).toLocaleString('en-US')} files, ${mb(stamp.bytes || 0)}`;
  if (stamp.failed > 0) return light('backup', 'yellow', `the last backup could not copy ${stamp.failed} file${stamp.failed === 1 ? '' : 's'} (${what} kept)`, 'Close any hunt that is writing the cache and run node scripts/backup-cache.js again.');
  if (!(days <= BACKUP_DAYS)) return light('backup', 'yellow', `last backup ${Math.floor(days)} days ago (${what})`, 'Run node scripts/backup-cache.js (add --to <folder> the first time). It copies only what changed.');
  return light('backup', 'green', `backed up ${days < 1 ? 'today' : Math.floor(days) + ' day' + (Math.floor(days) === 1 ? '' : 's') + ' ago'}: ${what}`);
}

// Everything the doctor learns from the live site, as lights. doFetch(url, init) is fetch (tests pass a fake). versionText is the body of
// /version.txt the doctor already read. remote is described above. Never throws.
async function liveLights({ base, versionTextBody, doFetch, remote, nowMs }) {
  const out = [];
  const origin = String(base).replace(/\/$/, '');
  const v = parseVersion(versionTextBody);
  const lv = liveVersionLight({ liveSha: v.sha, remote, nowMs });
  if (lv) out.push(lv);
  const head = async (url, method) => {
    try { const r = await doFetch(url, { method: method || 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15000) }); try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) { /* body already gone */ } return { status: r.status, headers: r.headers }; } catch (e) { return { status: null, headers: null }; }
  };
  const root = await head(origin + '/');
  const api = v.gate === 'off' ? await head(origin + '/api/e', 'GET') : { status: null };
  out.push(gateLight({ gate: v.gate, rootStatus: root.status, apiStatus: api.status }));
  out.push(filesLight(v));
  let host = ''; try { host = new URL(origin).hostname; } catch (e) { /* none */ }
  if (host === 'voidtv.net') {
    const w = await head('https://www.voidtv.net/');
    out.push(wwwLight({ status: w.status, location: w.headers && w.headers.get('location') }));
  }
  const ver = await head(origin + '/version.txt');
  const checked = [['/', root], ['/version.txt', ver]].map(([u, r]) => ({ url: u, status: r.status, missing: r.headers ? missingSecurityHeaders((n) => r.headers.get(n)) : [] }));
  out.push(headersLight(checked));
  return out;
}

module.exports = {
  LIMITS, SECURITY_HEADERS, CSP,
  isGated, routesFor, headersFile, missingSecurityHeaders, versionText, parseVersion,
  checkOutput, shrinkVerdict, readLastCounts, unreadableGrids,
  filesLight, gateLight, wwwLight, headersLight, liveVersionLight, shrinkLight, backupLight, liveLights,
};
