// No oldies in the home showcase (Bryan, 19 Oct 2026: "i dont want oldies like jack benny etc to be featured in the moving
// hero showcase"). Run: node --test tests/hero-oldies.test.js
// The REAL heroPool() text is cut out of scripts/lib/app.js and run in a bare vm on made-up shows. The showcase must leave out the
// Classic TV row and any show that started before 1980, from all three decks (the well-known, the cult and the two-per-row shelf,
// which is how The Jack Benny Program got in), and keep everything else it kept before, late-80s staples included.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const start = APP.indexOf('function heroPool(){');
const endMark = 'state.heroPool=arr;if(state.heroI==null)state.heroI=0;return arr}';
const end = APP.indexOf(endMark, start);
assert.ok(start > 0 && end > start, 'heroPool is where this test expects it');
const HERO = APP.slice(start, end + endMark.length);

function pool(shows) {
  const ctx = vm.createContext({ SHOWS: shows, state: {}, hidden: () => false, gated: () => false, Date, Math });
  vm.runInContext(HERO + '\nthis.out = heroPool().map((t) => t.slug);', ctx);
  return ctx.out;
}

let n = 0;
const show = (o) => Object.assign({ slug: 's' + n++, backdrop: 'b.jpg', overview: 'o', eps: 30, rating: 8, type: 'Drama', year: 1995, tags: [] }, o);

test('the Classic TV row and pre-1980 shows never reach the showcase, from any deck', () => {
  const shows = [
    show({ slug: 'the-jack-benny-program', type: 'Classic TV', year: 1950, eps: 12, rating: 9 }), // top of its row: the shelf deck took it
    show({ slug: 'classic-tv-1990s', type: 'Classic TV', year: 1993 }),                              // the whole row is out, whatever the year
    show({ slug: 'twilight-zone', type: 'Sci-Fi, Fantasy and Horror', year: 1959, rating: 9.5 }),     // rated: the well-known deck
    show({ slug: 'wagon-train', type: 'Drama', year: '1957', eps: 200, rating: 6 }),                 // deep, under-rated: the cult deck
    show({ slug: 'old-doc', type: 'Documentary & Geographic', year: 1979 }),
    show({ slug: 'the-simpsons', type: 'Animated', year: 1989 }),
    show({ slug: 'cosmos-1980', type: 'Documentary & Geographic', year: 1980 }),
    show({ slug: 'friends', type: '90s Sitcoms', year: 1994 }),
    show({ slug: 'no-year', type: 'Drama', year: undefined }),
    show({ slug: 'empty-year', type: 'Drama', year: '' }),                                           // how the catalog stores a missing year
  ];
  const out = pool(shows);
  for (const s of ['the-jack-benny-program', 'classic-tv-1990s', 'twilight-zone', 'wagon-train', 'old-doc']) assert.ok(!out.includes(s), s + ' must not be in the showcase');
  for (const s of ['the-simpsons', 'cosmos-1980', 'friends', 'no-year', 'empty-year']) assert.ok(out.includes(s), s + ' stays in the showcase');
});

test('the old rules still hold: no movies, no thin shows, nothing without a picture or a description', () => {
  const out = pool([
    show({ slug: 'movie-123', year: 2001 }),
    show({ slug: 'thin', eps: 5 }),
    show({ slug: 'no-pic', backdrop: '' }),
    show({ slug: 'no-text', overview: '' }),
    show({ slug: 'kept', year: 2005 }),
  ]);
  assert.deepEqual(Array.from(out), ['kept']);
});
