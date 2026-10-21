// The 18+ door on show pages and person pages (audit 21 Oct 2026, H2 and H3): with the door closed, X-Ray's connected shows, a person
// page and the person panel on a show page list no Late Night show; with the door open they do. Run: node --test tests/adult-door.test.js
// The REAL text is cut out of scripts/lib/app.js (isAdult and gated, the conn list of xray, the shows of personPage, the others of
// personPanel) and run in a bare vm on made-up shows, people and links.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => { const a = APP.indexOf(from), b = APP.indexOf(to, a); assert.ok(a > 0 && b > a, 'found ' + from); return APP.slice(a, b + to.length); };
const GATE = cut('const isAdult=(s)=>', 'const gated=(s)=>isAdult(s)&&!ME.adult;');
const XRAY = cut('const conn=Object.entries(links)', '.slice(0,24);');
const PAGE = cut('const shows=g?Object.entries(g.shows)', ':[];');
const PANEL = cut('const others=g?Object.entries(g.shows)', ':[];');

const SHOWS = [
  { slug: 'swat-kats', show: 'SWAT Kats', type: 'Animated' },
  { slug: 'chuck', show: 'Chuck', type: 'Drama' },
  { slug: 'red-shoe-diaries', show: 'Red Shoe Diaries', type: 'Late Night', adult: 1 },
  { slug: 'playboy-after-dark', show: 'Playboy After Dark', type: 'Classic TV', adult: 1 }, // marked 18+ by B in overrides.json
];
function run(adult, code) {
  const BY_SLUG = Object.fromEntries(SHOWS.map((s) => [s.slug, s]));
  const ctx = vm.createContext({
    ME: { adult: adult ? Date.now() : 0 }, BY_SLUG, state: { show: BY_SLUG.chuck },
    LINKS: { chuck: { 'swat-kats': [1], 'red-shoe-diaries': [1, 2], 'playboy-after-dark': [2] } },
    PEOPLE: { 1: { name: 'A' }, 2: { name: 'B' } },
    g: { name: 'B', shows: { chuck: 'Self', 'swat-kats': 'Voice', 'red-shoe-diaries': 'Guest', 'playboy-after-dark': 'Guest' } },
  });
  vm.runInContext(GATE + '\n' + code, ctx);
  return Array.from(ctx.out); // an array made in the vm has another Array prototype, which strict deepEqual refuses
}
const xray = (adult) => run(adult, 'const s=state.show;const links=LINKS[s.slug]||{};' + XRAY + '\nthis.out=conn.map((c)=>c.t.slug).sort();');
const page = (adult) => run(adult, PAGE + '\nthis.out=shows.map((x)=>x[0].slug).sort();');
const panel = (adult) => run(adult, PANEL + '\nthis.out=others.map((x)=>x[0]).sort();');

test('X-Ray connected shows: no Late Night or 18+ show with the door closed, all of them with it open', () => {
  assert.deepEqual(xray(false), ['swat-kats']);
  assert.deepEqual(xray(true), ['playboy-after-dark', 'red-shoe-diaries', 'swat-kats']);
});

test('a person page and the person panel: no Late Night or 18+ show with the door closed (and the counts follow), all with it open', () => {
  assert.deepEqual(page(false), ['chuck', 'swat-kats']);
  assert.deepEqual(page(true), ['chuck', 'playboy-after-dark', 'red-shoe-diaries', 'swat-kats']);
  assert.deepEqual(panel(false), ['swat-kats']);
  assert.deepEqual(panel(true), ['playboy-after-dark', 'red-shoe-diaries', 'swat-kats']);
});
