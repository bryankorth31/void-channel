// The line under every poster: "FOX · 1987 · 259 eps · ★ 7.7" (voidverse audit MAIN-03; Bryan, 23 Nov 2026:
// "Yes, start batch 1"). The caption is one run of text in a narrow card, and it used to break at any space, so the
// star sat at the end of one line and its number at the start of the next (34 of the first 40 captions at 1278x513).
// Each fact is now held together by a no-break space; the line may only break at the dots between facts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const APP = fs.readFileSync(path.join(__dirname, '..', 'scripts/lib/app.js'), 'utf8').replace(/\r\n/g, '\n');

// The page's own card() and esc(), run with small stand-ins for what they call.
function cardHtml(show) {
  const a = APP.indexOf('function card(s,ctx){'), b = APP.indexOf('\n', APP.indexOf("+(ctx==='grid'?'<div class=\"indetail\">", a));
  assert.ok(a > 0 && b > a, 'card() is in the page code');
  const esc = APP.split('\n').find((l) => l.startsWith('const esc=(s)=>'));
  assert.ok(esc, 'esc() is in the page code');
  const text = (esc + '\n' + APP.slice(a, b)).split('\\\\').join('\\');
  const box = { state: { open: null }, cgc: () => '#8a8fa3', genPoster: () => '<div class="p gen"></div>', meta: () => '' };
  vm.createContext(box);
  vm.runInContext(text + '\nthis.card=card;', box);
  return box.card(show, 'row');
}
const caption = (html) => html.match(/<small>(.*?)<\/small><\/div>/)[1];

test('a card caption keeps the star with its number and the count with "eps"', () => {
  const c = caption(cardHtml({ slug: 'married-with-children', show: 'Married... with Children', network: 'FOX', year: 1987, eps: 259, rating: 7.7, poster: 'p.jpg' }));
  assert.equal(c, 'FOX · 1987 · 259&nbsp;eps · ★&nbsp;7.7');
  // What a browser may break on: plain spaces only. No fact has one inside it.
  const pieces = c.replace(/&nbsp;/g, '\u00a0').split(' ');
  assert.deepEqual(pieces, ['FOX', '·', '1987', '·', '259\u00a0eps', '·', '★\u00a07.7']);
});

test('one episode reads "1 ep", and a show with no rating has no star', () => {
  const c = caption(cardHtml({ slug: 'a-film', show: 'A Film', network: 'ABC', year: 1995, eps: 1, rating: 0, poster: 'p.jpg' }));
  assert.equal(c, 'ABC · 1995 · 1&nbsp;ep');
});
