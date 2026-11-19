// VoidTV PLAY: tests for the player page's promises: the CASH donation line, the takedown link, the GPL source
// links, and Bryan's house rules for every file in play/. Licence: GPL-2.0-or-later (play/LICENSE).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const html = read(ROOT, 'index.html');
const EM_DASH = String.fromCharCode(0x2014);
const play = read(ROOT, 'src', 'play.js');

// Every text file we wrote ourselves (engine/ is the compiled core, made by build.sh).
function ourFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'engine' && e.name !== 'node_modules') out.push(...ourFiles(p)); }
    else if (/\.(js|json|html|css|md|c|sh|txt)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('the donation link is the same setting the site uses (DECISIONS C5)', () => {
  const site = read(ROOT, '..', 'scripts', 'lib', 'app.js').match(/const DONATE_URL = '([^']+)'/);
  const here = play.match(/const DONATE_URL = '([^']+)'/);
  assert.ok(site && here, 'both files name DONATE_URL');
  assert.equal(here[1], site[1]);
});

test('the donation line says donation, CASH and cashvalues.org, and never gift (DECISIONS C2 to C4)', () => {
  const line = play.match(/const DONATE_LINE = '([^']+)'/);
  assert.ok(line, 'play.js names DONATE_LINE');
  assert.match(line[1], /donat/i);
  assert.match(line[1], /\bCASH\b/);
  assert.match(line[1], /cashvalues\.org/);
  assert.doesNotMatch(line[1], /\bgift\b|spare change/i);
  assert.doesNotMatch(line[1], /Church of American Strength/, 'short text says CASH (C3)');
  assert.doesNotMatch(line[1], /tax/i, 'no tax-deduction promise (C1)');
});

test('the page shows the donation line where the game is served, and in the pause menu', () => {
  assert.match(html, /class="donate-line"/);
  assert.match(html, /id="donate-line"/);
  assert.match(html, /class="donate-link"/);
});

test('the page links the takedown page and says the game comes from the Internet Archive', () => {
  assert.match(html, /href="\/takedown"/);
  assert.match(html, /Internet Archive/);
});

test('the page links the core source and our own player source (GPL)', () => {
  assert.match(html, /href="https:\/\/github\.com\/libretro\/dosbox-pure[^"]*"/);
  assert.match(html, /href="https:\/\/github\.com\/bryankorth31\/void-channel\/tree\/[^"]*\/play"/);
  assert.match(html, /GPL/);
});

test('the licence and source record sit beside the code', () => {
  for (const f of ['LICENSE', 'SOURCES.md', path.join('core', 'README.md'), path.join('core', 'dosbox-pure.txt'), path.join('core', 'build.sh')]) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  }
  assert.match(read(ROOT, 'LICENSE'), /GNU GENERAL PUBLIC LICENSE\s+Version 2, June 1991/);
  assert.match(read(ROOT, 'core', 'dosbox-pure.txt'), /^commit: [0-9a-f]{40}$/m);
});

test('every source file says its licence on its first line', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((n) => n.endsWith('.js'))) {
    const first = read(ROOT, 'src', f).split('\n')[0];
    assert.match(first, /Licence: GPL-2\.0-or-later/, f);
  }
});

test('no em dash in any file in play/ (Bryan\'s rule)', () => {
  for (const f of ourFiles(ROOT)) {
    const lines = read(f).split('\n');
    lines.forEach((l, i) => assert.ok(!l.includes(EM_DASH), path.relative(ROOT, f) + ':' + (i + 1)));
  }
});

test('the page plays nothing aloud in tests: the runner has a mute switch', () => {
  assert.match(read(ROOT, 'src', 'runner.js'), /opts\.mute/);
});
