// Cloudflare Analytics Engine reader for HQ. Reads the voidtv_events dataset through the SQL API
// with a token from backend/.env (CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN). Column map (see
// functions/api/e.js): blob1 type, blob2 slug, blob3 episode, blob4 page, blob5 country, blob6 region,
// blob7 city, blob8 device, blob9 browser, blob10 os, blob11 referrer, blob12 query, blob13 session,
// blob14 extra, blob15 colo, blob16 timezone; double1 position, double2 duration, double3 n.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATASET = 'voidtv_events';

function env() {
  let txt = '';
  try { txt = fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8'); } catch (e) { /* none */ }
  const get = (k) => (process.env[k] || (txt.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1] || '').trim();
  return { account: get('CF_ACCOUNT_ID'), token: get('CF_ANALYTICS_TOKEN') };
}

function configured() { const e = env(); return !!(e.account && e.token); }

async function sql(query) {
  const e = env();
  if (!e.account || !e.token) throw new Error('CF_ACCOUNT_ID / CF_ANALYTICS_TOKEN missing in backend/.env');
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${e.account}/analytics_engine/sql`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + e.token }, body: query,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`SQL API ${r.status}: ${txt.slice(0, 300)}`);
  const j = JSON.parse(txt);
  return j.data || [];
}

const since = (days) => `timestamp > NOW() - INTERVAL '${Math.max(1, Math.min(90, +days || 7))}' DAY`;
const n = 'SUM(_sample_interval) AS n';

// Every report returns rows for the page to draw. Counts use the sample interval so sampled data
// still adds up; session counts are grouped and summed on this side.
const REPORTS = {
  daily: (d) => `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob1 AS type, ${n} FROM ${DATASET} WHERE ${since(d)} GROUP BY day, type ORDER BY day`,
  sessions: (d) => `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob13 AS sid, blob5 AS country, blob8 AS device, ${n} FROM ${DATASET} WHERE ${since(d)} GROUP BY day, sid, country, device LIMIT 20000`,
  hourly: (d) => `SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour, ${n} FROM ${DATASET} WHERE ${since(Math.min(d, 7))} AND blob1 = 'view' GROUP BY hour ORDER BY hour`,
  geo: (d) => `SELECT blob5 AS country, blob6 AS region, blob7 AS city, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob1 = 'view' GROUP BY country, region, city ORDER BY n DESC LIMIT 300`,
  devices: (d) => `SELECT blob8 AS device, blob9 AS browser, blob10 AS os, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob1 = 'view' GROUP BY device, browser, os ORDER BY n DESC LIMIT 100`,
  pages: (d) => `SELECT blob4 AS page, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob1 = 'view' GROUP BY page ORDER BY n DESC LIMIT 50`,
  shows: (d) => `SELECT blob2 AS slug, blob1 AS type, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob1 IN ('view', 'play', 'tick', 'end') AND blob2 != '' GROUP BY slug, type ORDER BY n DESC LIMIT 1000`,
  episodes: (d) => `SELECT blob2 AS slug, blob3 AS ep, blob1 AS type, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob1 IN ('play', 'tick', 'end') GROUP BY slug, ep, type ORDER BY n DESC LIMIT 1000`,
  searches: (d) => `SELECT blob12 AS q, MIN(double3) AS results, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob1 = 'search' GROUP BY q ORDER BY n DESC LIMIT 300`,
  errors: (d) => `SELECT blob2 AS slug, blob3 AS ep, blob14 AS file, MAX(double3) AS code, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob1 = 'error' GROUP BY slug, ep, file ORDER BY n DESC LIMIT 300`,
  reports: (d) => `SELECT timestamp, blob2 AS slug, blob3 AS ep, blob14 AS file, blob5 AS country, blob8 AS device FROM ${DATASET} WHERE ${since(d)} AND blob1 = 'report' ORDER BY timestamp DESC LIMIT 300`,
  referrers: (d) => `SELECT blob11 AS host, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob11 != '' GROUP BY host ORDER BY n DESC LIMIT 100`,
  tv: (d) => `SELECT blob2 AS channel, blob1 AS type, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob1 IN ('tune', 'tvplay') GROUP BY channel, type ORDER BY n DESC LIMIT 200`,
  acts: (d) => `SELECT blob2 AS slug, blob14 AS act, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob1 = 'act' GROUP BY slug, act ORDER BY n DESC LIMIT 500`,
  qr: (d) => `SELECT blob2 AS code, blob14 AS label, blob5 AS country, blob8 AS device, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob1 = 'qr' GROUP BY code, label, country, device ORDER BY n DESC LIMIT 500`,
  qrdaily: (d) => `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob2 AS code, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob1 = 'qr' GROUP BY day, code ORDER BY day`,
  timezones: (d) => `SELECT blob16 AS tz, ${n} FROM ${DATASET} WHERE ${since(d)} AND blob1 = 'view' GROUP BY tz ORDER BY n DESC LIMIT 60`,
};

async function report(name, days) {
  if (!REPORTS[name]) throw new Error('unknown report ' + name);
  return sql(REPORTS[name](+days || 7));
}

module.exports = { configured, sql, report, REPORTS };
