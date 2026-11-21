// CACHE FILE: the hunters' saved Archive search pages (scrape-*, mscrape-*, scout-*) are kept gzipped.
// They held about 40 GB of the 43 GB cache on 23 Oct, mostly item descriptions. The hunters read those descriptions to judge an
// upload, so they are kept whole: gzip stores the same bytes in about 30% of the space, and matching cannot change.
// A page is read from `<key>.json.gz` when it exists, else from the plain `<key>.json` written before this; other cache files stay plain.
const fs = require('fs');
const zlib = require('zlib');

const PACKED = /^(m?scrape|scout)-/;

// The file that holds `file` (a path ending in .json) on disk now, gzipped first, or null.
function cachedPath(file) {
  if (fs.existsSync(file + '.gz')) return file + '.gz';
  return fs.existsSync(file) ? file : null;
}

// The parsed JSON from `file` or its gzipped twin, or undefined when neither is there.
// pack-cache.js may swap a plain page for its gzip while a hunt reads it, so a plain file that vanished is looked for once more.
function readCached(file) {
  for (let tries = 0; ; tries++) {
    const p = cachedPath(file);
    if (!p) return undefined;
    let buf;
    try { buf = fs.readFileSync(p); } catch (e) { if (e.code === 'ENOENT' && tries < 1) continue; throw e; }
    return JSON.parse((p.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8'));
  }
}

// Save `text` for `file`: gzipped when the name is an Archive search page, plain otherwise. A plain copy left from before is removed.
function writeCached(file, text) {
  const base = require('path').basename(file);
  if (!PACKED.test(base)) { fs.writeFileSync(file, text); return file; }
  const tmp = file + '.gz.tmp';
  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(text, 'utf8')));
  fs.renameSync(tmp, file + '.gz');
  try { fs.unlinkSync(file); } catch (e) { /* no plain copy */ }
  return file + '.gz';
}

// AN ARCHIVE ANSWER THAT CARRIES AN ERROR IS NOT A RESULT (build audit 19 Nov 2026, V4 and V5).
// When the Archive's own search index fails, its search service can still answer 200 with a body such as
// { items: [null, null], count: 2, total: null, request_error: { timestamp, request_url, ... } }. Saved as if it were a result,
// such a page was reused for ever: one show crashed the nightly hunt on its empty entries every night for weeks, and others were
// "hunted" from an answer that held nothing and were never asked again. The three savers (hunt.js, hunt-movies.js, scout.js) now
// go through the functions below, so the rule lives here once:
//   answerError(j)        a short reason when the parsed answer carries an error, else null
//   readGood(file)        the saved page, or undefined when there is none OR the saved one carries an error (so it is asked again)
//   saveAnswer(file, text) parses a fresh answer; an error answer is refused with a thrown Error and nothing is saved, so the
//                          caller's own retry and its "!!" line tell the truth and the show stays unhunted until a real answer comes
//   entries(j)            the entries of a search page, with empty ones dropped (an empty entry is not an upload)
// scripts/cache-check.js lists the saved pages that break the rule; tests/cache-answer.test.js proves all of it.
// One thing that looks like an error is not one: for a search that finds nothing the Archive answers
// { items: [], count: 0, total: null, request_error: "(no hits returned)" }. That is a true empty result and is saved and reused
// like any other (22 of the 23 saved pages the audit counted as errors were this; only the one with the failure object was real).
const NO_HITS = /^\s*\(?\s*no hits returned\s*\)?\s*$/i;
function answerError(j) {
  if (!j || typeof j !== 'object') return null;
  const e = j.request_error;
  if (!e) return null;
  if (typeof e === 'string') return NO_HITS.test(e) ? null : 'request_error: ' + e.slice(0, 80);
  return 'request_error' + (e.timestamp ? ' of ' + String(e.timestamp).slice(0, 10) : '');
}

function readGood(file) {
  const j = readCached(file);
  return j !== undefined && answerError(j) ? undefined : j;
}

function saveAnswer(file, text) {
  const j = JSON.parse(text);
  const bad = answerError(j);
  if (bad) throw new Error('the Archive answered with an error and no results (' + bad + '); nothing was saved');
  if (file) writeCached(file, text);
  return j;
}

function entries(j) {
  return (j && Array.isArray(j.items) ? j.items : []).filter(Boolean);
}

module.exports = { readCached, writeCached, cachedPath, PACKED, answerError, readGood, saveAnswer, entries };
