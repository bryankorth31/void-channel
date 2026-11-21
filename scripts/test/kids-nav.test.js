// Audit fixes, 19 Nov 2026: one top bar with a big back arrow on every kids area, a way back from the Village to the
// Brave ladder, no first name in what the site serves, and "an oval".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const NAV = require('../lib/kids-nav');
const play = require('../lib/play/build');
const village = require('../lib/village/build');
const brave = require('../lib/brave/build');
const PACKS = require('../lib/play/packs');

const pages = { play: play.page({ siteName: 'voidtv.net kids', voice: {} }), village: village.page({}, false), brave: brave.page({}, false) };

test('Play, Void Village and Brave steps share one top bar with the big back arrow, and mark where you are', () => {
  for (const [here, html] of Object.entries(pages)) {
    assert.ok(html.includes(NAV.bar(here)), here + ' has the shared bar');
    assert.ok(html.includes(NAV.SCRIPT), here + ' has the back arrow script');
    assert.match(html, /class="kn-back"/);
    for (const [, href] of NAV.LINKS) assert.ok(html.includes('href="' + href + '"'), here + ' links ' + href);
  }
  assert.match(NAV.CSS, /\.kn-back\{[^}]*width:64px;height:64px/);
});

test('back goes inside the page first, then to a from= address on this site only, then the page before, then home', () => {
  const s = NAV.SCRIPT;
  assert.ok(s.indexOf('kidsBackHere') < s.indexOf('from=') && s.indexOf('from=') < s.indexOf('history.back') && s.indexOf('history.back') < s.lastIndexOf('location.href="/"'));
  assert.match(s, /to\.charAt\(0\)==="\/"&&to\.charAt\(1\)!=="\/"/, 'a from= can never lead off the site');
  assert.match(pages.play, /window\.kidsBackHere/);
  assert.match(pages.brave, /window\.kidsBackHere/);
});

test('a Brave step that practises in the Village comes back to its own ladder', () => {
  assert.match(pages.brave, /\/village\/#' \+ s\.village \+ '&from=' \+ encodeURIComponent\('\/brave\/#' \+ id\)/);
  assert.match(pages.brave, /location\.hash\.slice\(1\)\.split\(\/\[&,\]\/\)\.find/);
});

test('nothing the kids site serves carries the owner\'s first name', () => {
  for (const [here, html] of Object.entries(pages)) assert.ok(!/Bryan/.test(html), here);
  const app = fs.readFileSync(path.join(__dirname, '..', 'lib', 'app.js'), 'utf8');
  assert.ok(!/Bryan/.test(app), 'app.js (home and show pages)');
  assert.ok(!/Bryan/.test(fs.readFileSync(path.join(__dirname, '..', '..', 'player', 'src', 'player.css'), 'utf8')), 'player.css');
});

test('the games say "an" before a vowel ("That is an oval")', () => {
  const all = JSON.stringify(PACKS);
  assert.ok(all.includes('That is an oval.'));
  assert.ok(!/That is a [aeiou]/i.test(all), (all.match(/.{20}That is a [aeiou].{10}/i) || [''])[0]);
});
