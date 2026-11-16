// Void University engine and build (audit, 16 Nov 2026). Run: node tests/uni.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const uni = require('../scripts/lib/uni');

const SITE = path.join(uni.UNI, 'site');
const build = (...a) => execFileSync(process.execPath, [path.join(uni.UNI, 'build.js'), ...a], { stdio: 'pipe' });
const list = () => JSON.parse(fs.readFileSync(path.join(uni.UNI, 'list.json'), 'utf8'));

test('a brief only takes a plain course slug, never a path', () => {
  for (const bad of ['../list', '..\\list', 'a/b', 'A B', '', 'x.json']) assert.throws(() => uni.brief(bad, 1), /Not a course slug/);
  assert.match(uni.brief('human-nature', 2), /UNIT 2/);
});

test('the overview lists every area in list.json', () => {
  const o = uni.overview();
  assert.deepStrictEqual(o.areas.map((a) => a.area), list().types);
});

test('the public copy carries only live courses, and no lab unless a lab is live', () => {
  fs.mkdirSync(SITE, { recursive: true });
  fs.writeFileSync(path.join(SITE, 'stale-page.html'), 'left from an older build');
  build('--site');
  assert.ok(!fs.existsSync(path.join(SITE, 'stale-page.html')), 'a page from an earlier build was left in site/');
  const live = new Set(list().courses.filter((c) => c.live).map((c) => c.slug));
  const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));
  for (const p of pages) assert.ok(live.has(p) || ['index', 'credits'].includes(p), p + '.html is in the public copy but not live');
  const anyLiveLab = fs.readdirSync(path.join(uni.UNI, 'courses')).some((f) => {
    const c = JSON.parse(fs.readFileSync(path.join(uni.UNI, 'courses', f), 'utf8'));
    return live.has(c.slug) && c.units.some((u) => u.lab && u.lab.live);
  });
  if (!anyLiveLab) {
    assert.ok(!fs.existsSync(path.join(SITE, 'lab.js')), 'lab.js shipped with no live lab');
    for (const p of pages) assert.doesNotMatch(fs.readFileSync(path.join(SITE, p + '.html'), 'utf8'), /lab\.js|planck/, p + ' asks for a lab script that is not shipped');
  }
});

test('lecture counts look like lectures, not every file in an item (run node scripts/uni.js media after a gather)', () => {
  for (const f of fs.readdirSync(uni.SRC).filter((f) => f.endsWith('.json') && f !== 'check.json')) for (const s of JSON.parse(fs.readFileSync(path.join(uni.SRC, f), 'utf8')).sources || []) {
    assert.ok(!(s.video && s.audio), f + ' ' + s.id + ' has both video and audio');
    for (const m of [s.video, s.audio]) if (m) assert.ok(Number.isInteger(m.files) && m.files > 0 && m.files <= 120, f + ' ' + s.id + ' counts ' + m.files + ' lectures');
  }
});

test('no em or en dash in any course, source list or built page', () => {
  const files = [...fs.readdirSync(path.join(uni.UNI, 'courses')).map((f) => path.join(uni.UNI, 'courses', f)),
    ...fs.readdirSync(uni.SRC).filter((f) => f.endsWith('.json') && f !== 'check.json').map((f) => path.join(uni.SRC, f)),
    ...fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).map((f) => path.join(SITE, f))];
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /[–—]/, path.basename(f) + ' has a dash');
});
