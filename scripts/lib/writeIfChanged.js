// WRITE IF CHANGED: write a data file only when its content changed, leaving out the run's own timestamp.
// A grid (matchedAt), graph.json (builtAt) and network-sweep.json (sweptAt) each carry a stamp for "when this was built".
// Kept inside the data that git compares, the stamp made every run rewrite every file, so each nightly publish committed
// thousands of files whose content had not changed. The stamp says when the run happened, not what the data is, so it is
// left out of the comparison. When nothing else differs the file is not touched: the old stamp stays and git sees nothing.
const fs = require('fs');

const RUN_STAMPS = ['matchedAt', 'builtAt', 'sweptAt'];

// Windows briefly locks a file that a scanner or the site build is reading, so a write gets a few short retries.
function writeRetry(file, text) {
  for (let a = 0; ; a++) {
    try { fs.writeFileSync(file, text); return; } catch (e) {
      if (a >= 4) throw e;
      const until = Date.now() + 150 * (a + 1); while (Date.now() < until) {}
    }
  }
}

// A copy of the top level of `obj` without the stamp keys (anything that is not a plain object is left as it is).
function without(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const copy = { ...obj };
  for (const k of keys) delete copy[k];
  return copy;
}

// True when `file` already holds `object`, ignoring the top-level `ignoreKeys`. A file that is missing or unreadable is not the same.
function sameContent(file, object, ignoreKeys) {
  let old;
  try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return false; }
  return JSON.stringify(without(old, ignoreKeys)) === JSON.stringify(without(object, ignoreKeys));
}

// Write `object` as JSON (indent 2 unless told otherwise; 0 is compact) unless the file already holds the same content.
// Returns true when it wrote, false when it left the file alone. When it writes, the new stamp goes in with the new content.
function writeIfChanged(file, object, ignoreKeys = RUN_STAMPS, indent = 2) {
  if (sameContent(file, object, ignoreKeys)) return false;
  writeRetry(file, JSON.stringify(object, null, indent));
  return true;
}

// The same rule for a text report whose only run-specific part is a stamp: `ignorePattern` is a global RegExp for that part.
function writeTextIfChanged(file, text, ignorePattern) {
  let old = null;
  try { old = fs.readFileSync(file, 'utf8'); } catch (e) { /* new file */ }
  const plain = (t) => { const x = t.replace(/\r\n/g, '\n'); return ignorePattern ? x.replace(ignorePattern, '') : x; };
  if (old !== null && plain(old) === plain(text)) return false;
  writeRetry(file, text);
  return true;
}

module.exports = { writeIfChanged, writeTextIfChanged, sameContent, RUN_STAMPS };
