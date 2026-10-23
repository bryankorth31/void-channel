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

module.exports = { readCached, writeCached, cachedPath, PACKED };
