#!/usr/bin/env node
// OLD-TIME RADIO FOR LIVE TV (PLAN-ia-treatments T5; Bryan, 24 Nov 2026: "Go"). Turns the radio series list
// (C:\Users\bryan\chief-of-staff\plans\ia\radio-series.json, made 23 Nov 2026 from the Internet Archive's own file lists)
// into the files Live TV reads: catalog/radio/channels.json and one catalog/radio/<show>.json per series.
//
// By hand, no AI: node scripts/radio-import.js [path to radio-series.json]
// Run it again after the list changes; it rewrites every radio file and removes the ones the list no longer names.
// What a channel shows and whether it is on lives in channels.json: an edit there (a name, on: false) survives a rerun.
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || 'C:\\Users\\bryan\\chief-of-staff\\plans\\ia\\radio-series.json';
const OUT = path.join(__dirname, '..', 'catalog', 'radio');

// The channel each kind of the list goes on. A kind not named here is skipped, with a line saying so.
// One radio channel for every kind (Bryan, 24 Nov 2026: "One channel", named Void Radio): with a channel per kind, the small
// series replayed episodes within a week; on one channel a week of 307 shows repeats none.
// Kids radio is its own channel and stays off until Bryan has heard it (its titles were screened by title only; what children
// hear is his call).
const VOID_RADIO = { id: 'radio', name: 'Void Radio', on: true };
const KINDS = {
  'mystery and detective': VOID_RADIO,
  westerns: VOID_RADIO,
  comedy: VOID_RADIO,
  'science fiction and suspense': VOID_RADIO,
  'drama and anthology': VOID_RADIO,
  'kids radio': { id: 'radio-kids', name: 'Void Radio Kids', on: false },
};

const slugify = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The air date in a file's title, in any of the forms the uploads use: 49-06-10, 1958-11-23, 420617, with x for a part
// nobody knows. Returns { at, y, m, d, end } (at: the index the date starts at, end: where it stops) or null.
function findDate(t) {
  const forms = [
    /(?:^|[^0-9])((?:19)?[0-9x]{2})-([0-9x]{2})-([0-9x]{1,2})(?![0-9x])/i, // 49-06-10, 1953-09-20, 50-12-xx, 1936-08-5
    /(?:^|[^0-9])((?:19)?[0-9xX]{2})-([0-9x]{2})-([0-9x]{2})(?=[0-9xX]|[A-Z])/, // BostonBlackie44-06-23001The..., XMinusOne73-01-27xxxThe..., BostonBlackieXx-xx-xxxxxWho...
    /(?:^|[^0-9])([0-9]{2})([01][0-9])([0-3][0-9])(?![0-9])/, // 420617 (Suspense), 351009 (Cavalcade)
    /(?:^|[^0-9])(19[0-9]{2})(?![0-9])/, // a year alone (Archie Andrews 1953)
  ];
  // The first date in the title wins, whichever form it takes ("CALV 410331 220 Edwin Booth Repeat Broadcast of 37-09-29"
  // aired in 1941; the later date is the first broadcast's).
  let best = null;
  for (let k = 0; k < forms.length; k++) {
    const m = forms[k].exec(t);
    if (m && (!best || m.index < best.index)) best = m;
  }
  for (const m of best ? [best] : []) {
    const at = m.index + m[0].indexOf(m[1]);
    let y = m[1], mo = m[2] || '', d = m[3] || '';
    if (/^[0-9]{2}$/.test(y)) y = '19' + y;
    if (!/^19[0-9]{2}$/.test(y)) y = '';
    const num = (s) => (/^[0-9]+$/.test(s) ? +s : 0);
    const out = { at, y: y ? +y : 0, m: num(mo), d: num(d), end: m.index + m[0].length };
    if (out.m > 12) out.m = 0;
    if (out.d > 31) out.d = 0;
    return out;
  }
  return null;
}

// "Jenny", "The Man Who Would Be King": the episode's own name from a file title, with the series name, the date, the
// episode number and the broadcast tags taken off, and run-together words split. Falls back to the plain title.
function tidyName(title, date) {
  let t = String(title);
  const plus = t.lastIndexOf('2000Plus'); // 2000 Plus files name the show last: 1950-06-07 0013-30m37s-2000Plus-TheOtherMan
  if (plus >= 0) t = t.slice(plus + 8).replace(/^[-x]+/, '');
  else if (date) t = t.slice(date.end);
  t = t.replace(/^[\s_-]+/, '');
  t = t.replace(/^[0-9x]{3,4}-(?:[0-9]+m[0-9]+s-)?2000Plus-/, ''); // 0013-30m37s-2000Plus- (2000 Plus)
  t = t.replace(/^\(?(?:ep\s?)?[0-9x]{1,4}\)?(?=[\s_-]|[A-Z]|$)/i, ''); // (001), 001, ep061, Ep 01, xxx, (xxxx)
  t = t.replace(/^-?[0-9x]{1,4}-\s/, ''); // -001- (Escape)
  t = t.replace(/^-\s[0-9x]{1,4}\)\s?/, ''); // - 001) (Jack Benny)
  t = t.replace(/^[\s_-]+/, '');
  t = t.replace(/\s*[([](?:AFRTS|AFRS)[^)\]]*[)\]]/gi, ''); // (AFRTS), [AFRTS], (AFRTS 498)
  t = t.replace(/\s*-([^-]+)-\s*$/, ''); // -Raymond Lawrence- (Escape's star), -last show-
  if (!/\s/.test(t)) {
    t = t.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2'); // TheJonathanDiamond, AVeteranComesHome
    t = t.replace(/([a-z])aka-/g, '$1 aka '); // Diamondaka-the Rockwell Diamond -> Diamond aka the Rockwell Diamond
  }
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t || String(title).trim();
}

function airedOf(d) {
  if (!d || !d.y) return { aired: '', year: '' };
  const iso = d.y + (d.m ? '-' + String(d.m).padStart(2, '0') + (d.d ? '-' + String(d.d).padStart(2, '0') : '') : '');
  return { aired: iso, year: String(d.y) };
}

function main() {
  const list = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const oldCh = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'channels.json'), 'utf8')); } catch (e) { return null; } })();
  const kept = new Map(((oldCh && oldCh.channels) || []).map((c) => [c.id, c]));
  const channels = [], byId = new Map(), written = new Set(['channels.json']);
  for (const ch of list.channels) {
    const k = KINDS[ch.kind];
    if (!k) { console.log('skipped a channel of kind ' + JSON.stringify(ch.kind) + ': not named in KINDS'); continue; }
    let out = byId.get(k.id);
    if (!out) {
      const before = kept.get(k.id) || {};
      out = { id: k.id, name: before.name || k.name, kinds: [], on: typeof before.on === 'boolean' ? before.on : k.on, shows: [] };
      byId.set(k.id, out); channels.push(out);
    }
    out.kinds.push(ch.kind);
    const shows = out.shows;
    for (const s of ch.series) {
      const slug = 'radio-' + slugify(s.series.replace(/\s*\(.*\)\s*$/, ''));
      const otrr = /Old Time Radio Researchers/i.test(s.note || '');
      const lic = /Rights:\s*(https?:\/\/\S+?)\.?$/.exec(s.note || '');
      const eps = s.episodes.map((e, i) => {
        const d = findDate(e.title);
        const a = airedOf(d);
        return { n: i + 1, name: tidyName(e.title, d), aired: a.aired, file: e.file, sec: e.seconds };
      });
      const years = String(s.years || '');
      const show = {
        show: s.series, slug, channel: k.id, kind: ch.kind, years, item: s.identifier,
        credit: otrr ? 'Old Time Radio Researchers' : '', licence: lic ? lic[1] : '',
        episodes: eps,
      };
      fs.writeFileSync(path.join(OUT, slug + '.json'), JSON.stringify(show, null, 1) + '\n');
      written.add(slug + '.json');
      shows.push(slug);
    }
  }
  const head = 'Old-time radio channels for Live TV (PLAN-ia-treatments T5). Made by scripts/radio-import.js from radio-series.json; '
    + 'name and on may be edited by hand and survive a rerun. on: false keeps a channel off Live TV.';
  fs.writeFileSync(path.join(OUT, 'channels.json'), JSON.stringify({ about: head, made: list.made || '', channels }, null, 1) + '\n');
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.json') && !written.has(f)) { fs.unlinkSync(path.join(OUT, f)); console.log('removed ' + f); }
  for (const c of channels) console.log((c.on ? 'on  ' : 'off ') + c.id + ' ' + c.name + ': ' + c.shows.length + ' shows');
}

if (require.main === module) main();
module.exports = { findDate, tidyName, airedOf, slugify, KINDS };
