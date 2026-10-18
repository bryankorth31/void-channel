#!/usr/bin/env node
// VOID LOCK — MD5 checksum locking system.
// Detects drift (changed/added/removed source files) against docs/BASELINE.md5 so nothing is
// silently lost or altered as we plug holes. No external deps: node:crypto, cross-platform.
//
//   node scripts/lock.js verify   compare disk to the lock; exit 1 if anything differs (CI/pre-commit)
//   node scripts/lock.js status   same report, never fails (informational, exit 0)
//   node scripts/lock.js relock   rewrite docs/BASELINE.md5 from disk; prints what changed vs prev
//   node scripts/lock.js list     print the enumerated file set + count
//
// Protocol: docs/LOCK.md. Format matches the original hand-rolled baseline: "<md5> *./<path>",
// forward slashes, sorted by path, so it stays diff-friendly.

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOCKFILE = path.join(ROOT, 'docs', 'BASELINE.md5');

// Directory names skipped at ANY depth: VCS, deps, build output, runtime caches.
const EXCLUDE_DIRS = new Set([
  '.git', 'node_modules', '.expo', 'dist', 'web-build',
  '_raw', '_disabled', '.claude',
]);
// Directories skipped by EXACT relative path (so we don't nuke same-named dirs elsewhere,
// e.g. mobile/src/data is source; only backend/data is runtime state).
// catalog/ is data the builder writes (35,000+ grids and candidates), not source; the lock is for source.
const EXCLUDE_PATHS = new Set([
  'backend/data', 'catalog', 'audit',
]);
// Per-profile data and site output (profiles/<name>/catalog, site, site-preview, site-assets) are data too.
const EXCLUDE_PATH_RE = /^profiles\/[^/]+\/(catalog|site|site-preview|site-assets)$/;

// Everything git ignores (node_modules, caches, renders, generated motion pieces, the local excludes in
// .git/info/exclude) stays out of the lock as well, so the lock and the repo agree on what "source" means.
function gitIgnored() {
  try {
    const out = execSync('git ls-files --others --ignored --exclude-standard --directory -z', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return new Set(out.split('\0').filter(Boolean).map((p) => p.replace(/\\/g, '/')));
  } catch (e) { return new Set(); }
}
// Exact filenames that are runtime state or the lock itself — never source.
const EXCLUDE_FILES = new Set([
  '.DS_Store', 'hearts.json', 'codec-cache.json', 'wiki-cache.json',
  'spine.db', 'spine.db-shm', 'spine.db-wal',
  'BASELINE.md5',
]);
// Suffix rules for logs and secrets.
const isExcludedFile = (name) =>
  EXCLUDE_FILES.has(name) || name.endsWith('.log') || name === '.env' || name.endsWith('.env');

// Walk the tree, returning POSIX-style relative paths, sorted.
function enumerate(dir, rel, out, ignored) {
  if (!ignored) ignored = gitIgnored();
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (EXCLUDE_DIRS.has(ent.name)) continue;
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (EXCLUDE_PATHS.has(childRel) || EXCLUDE_PATH_RE.test(childRel) || ignored.has(childRel + '/')) continue;
      enumerate(path.join(dir, ent.name), childRel, out, ignored);
    } else if (ent.isFile()) {
      if (isExcludedFile(ent.name)) continue;
      const fileRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ignored.has(fileRel)) continue;
      out.push(fileRel);
    }
  }
  return out;
}

function md5(absPath) {
  return crypto.createHash('md5').update(fs.readFileSync(absPath)).digest('hex');
}

// Build the current { relpath: hash } map from disk.
function hashTree() {
  const files = enumerate(ROOT, '', []).sort();
  const map = new Map();
  for (const f of files) map.set(f, md5(path.join(ROOT, f)));
  return map;
}

// Parse an existing baseline file into { relpath: hash }.
function readLock() {
  if (!fs.existsSync(LOCKFILE)) return null;
  const map = new Map();
  for (const line of fs.readFileSync(LOCKFILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{32}) \*\.\/(.+)$/);
    if (m) map.set(m[2], m[1]);
  }
  return map;
}

function serialize(map) {
  return [...map.keys()].sort().map((f) => `${map.get(f)} *./${f}`).join('\n') + '\n';
}

// Compare two hash maps -> { changed, added, removed } arrays of relpaths.
function diff(prev, cur) {
  const changed = [], added = [], removed = [];
  for (const [f, h] of cur) {
    if (!prev.has(f)) added.push(f);
    else if (prev.get(f) !== h) changed.push(f);
  }
  for (const f of prev.keys()) if (!cur.has(f)) removed.push(f);
  return { changed: changed.sort(), added: added.sort(), removed: removed.sort() };
}

function printList(label, arr) {
  if (!arr.length) return;
  console.log(`  ${label} (${arr.length}):`);
  for (const f of arr) console.log(`    ${f}`);
}

function cmdVerify(strict) {
  const prev = readLock();
  if (!prev) {
    console.error('No lock found at docs/BASELINE.md5. Run: node scripts/lock.js relock');
    process.exit(strict ? 1 : 0);
  }
  const cur = hashTree();
  const d = diff(prev, cur);
  const total = d.changed.length + d.added.length + d.removed.length;
  console.log(`VOID LOCK — ${strict ? 'verify' : 'status'} against docs/BASELINE.md5`);
  console.log(`  locked:  ${prev.size} files`);
  console.log(`  on disk: ${cur.size} files`);
  if (total === 0) {
    console.log('CLEAN — disk matches the lock exactly.');
    return;
  }
  printList('~ CHANGED', d.changed);
  printList('+ ADDED  ', d.added);
  printList('- REMOVED', d.removed);
  console.log(`DRIFT: ${total} file(s) differ. Review, then: node scripts/lock.js relock`);
  if (strict) process.exit(1);
}

function cmdRelock() {
  const prev = readLock();
  const cur = hashTree();
  fs.writeFileSync(LOCKFILE, serialize(cur));
  console.log('VOID LOCK — relock');
  console.log(`  wrote docs/BASELINE.md5 (${cur.size} files)`);
  if (prev) {
    const d = diff(prev, cur);
    console.log(`  vs previous lock: +${d.added.length} added, -${d.removed.length} removed, ~${d.changed.length} changed`);
    printList('~ CHANGED', d.changed);
    printList('+ ADDED  ', d.added);
    printList('- REMOVED', d.removed);
  } else {
    console.log('  (no previous lock — established fresh baseline)');
  }
  console.log('LOCKED.');
}

function cmdList() {
  const files = enumerate(ROOT, '', []).sort();
  for (const f of files) console.log(f);
  console.log(`\n${files.length} files`);
}

const cmd = (process.argv[2] || 'verify').toLowerCase();
switch (cmd) {
  case 'verify': case 'check': cmdVerify(true); break;
  case 'status': cmdVerify(false); break;
  case 'relock': case 'lock': cmdRelock(); break;
  case 'list': cmdList(); break;
  default:
    console.error(`Unknown command: ${cmd}\nUse: verify | status | relock | list`);
    process.exit(2);
}
