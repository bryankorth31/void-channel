// OLD-TIME RADIO ON LIVE TV (PLAN-ia-treatments T5; Bryan, 24 Nov 2026: "Go"; the screen is look B, "B, old radio", 23 Nov 2026).
//
// Two halves, as in tvgrid.js:
//   1. Node only: read catalog/radio/ (written by scripts/radio-import.js) into shows shaped like the rest of the catalog, so Live
//      TV schedules, plays and prunes them the way it does every show: the 30-minute grid, the full hold and the breaks unchanged.
//      Each radio show sits on its own radio channel only (never The Void, a row, a collection or a network), and only while its
//      channel is on in catalog/radio/channels.json (kids radio is off until Bryan has heard it).
//   2. The page: radioPage(), ONE function inlined into the page as source (the tvgridFactory pattern), so the tests run the same
//      text. It draws the old radio over the picture while a radio show plays, and the radio for a channel's On now tile.
//      No backticks, no backslashes and no line comments after code inside it (scripts/site.js refuses a page script with those).
//
// The recordings are the Archive's (most from the Old Time Radio Researchers, Creative Commons BY-NC-SA): played unchanged, from
// archive.org, on a free site with no ads sold, and the screen credits the group (plans/ia/RIGHTS.md).
'use strict';
const fs = require('fs');
const path = require('path');

// The screen's sizes follow the player (cqi), as the break cards do. Look B from plans/ia/radio-screen/radio-screen.css.
const CSS = `
.rs{position:absolute;inset:0;overflow:hidden;color:var(--fg);pointer-events:none;font-family:system-ui,Segoe UI,Roboto,sans-serif}
.rs-b{display:flex;align-items:center;justify-content:center;gap:5cqi;padding:9% 6% 13%;background:radial-gradient(ellipse at 33% 62%,rgba(242,169,59,.17) 0,rgba(242,169,59,0) 34%),radial-gradient(ellipse at 50% 38%,#151b2c 0%,var(--bg) 72%)}
.rs-b .rs-set{height:100%;aspect-ratio:400/500;flex:none}
.rs-b .rs-set svg{width:100%;height:100%;display:block;overflow:visible}
.rs-b .rs-text{min-width:0;max-width:52%}
.rs-kick{display:inline-flex;align-items:center;gap:.45em;padding:.22em .85em;border-radius:999px;background:rgba(95,227,255,.14);color:var(--brand-blue,#5fe3ff);font-size:clamp(9px,1.5cqi,22px);font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.rs-kick i{width:.55em;height:.55em;border-radius:50%;background:var(--brand-pink,#ff4fc8);box-shadow:0 0 .6em var(--brand-pink,#ff4fc8)}
.rs-show{font-family:Unbounded,system-ui,sans-serif;font-weight:800;line-height:1.02;letter-spacing:-.01em;font-size:clamp(22px,6.2cqi,104px);margin-top:.22em;overflow-wrap:anywhere}
.rs-ep{font-weight:800;font-size:clamp(13px,3.2cqi,54px);line-height:1.15;margin-top:.22em;overflow-wrap:anywhere}
.rs-meta{color:var(--dim);font-size:clamp(10px,2cqi,30px);margin-top:.4em}.rs-meta b{color:var(--fg);font-weight:600}
.rs-next{color:var(--dim);font-size:clamp(10px,2cqi,28px);margin-top:.55em}.rs-next b{color:var(--gold)}
.rs-credit{color:var(--dim);opacity:.75;font-size:clamp(8px,1.25cqi,18px);margin-top:.9em}
@container (max-width:560px){.rs-b{padding:5% 5%;gap:4cqi}.rs-b .rs-set{height:92%}}
.rs-tile{position:relative;display:flex!important;align-items:center;justify-content:center;gap:10px;overflow:hidden;background:radial-gradient(ellipse at 30% 60%,rgba(242,169,59,.18) 0,rgba(242,169,59,0) 40%),radial-gradient(ellipse at 50% 38%,#151b2c 0%,var(--bg) 78%)!important}
.rs-tile svg{height:78%;width:auto;flex:none;overflow:visible}
.rs-tile em{font-style:normal;font-family:Unbounded,system-ui,sans-serif;font-weight:800;font-size:12px;line-height:1.1;max-width:56%;color:var(--fg)}
`;

// ---- Node only: the catalog -------------------------------------------------------------------------------------------------
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; } };
const encPath = (f) => String(f).split('/').map(encodeURIComponent).join('/');
const HALF_HOUR = 1800; // seconds: the longest radio episode Void Radio plays

// The radio channels that are on, with their shows assembled. dir: catalog/radio. Returns { channels: [{ id, name, shows: [slug] }],
// shows: [show] } with each show shaped like assemble()'s (seasons of episodes with url, item, p, f, min and the seconds), plus
// radio: { channel, credit, licence, years } and, on each episode, ad (the air date as the file names it: 1942-09-02, 1950-12 or 1949).
function readRadio(dir) {
  const CH = readJson(path.join(dir, 'channels.json'), null);
  const out = { channels: [], shows: [] };
  if (!CH || !Array.isArray(CH.channels)) return out;
  for (const c of CH.channels) {
    if (!c || c.on !== true || !/^radio(?:-[a-z0-9-]+)?$/.test(c.id || '')) continue;
    const slugs = [];
    for (const slug of c.shows || []) {
      const r = readJson(path.join(dir, slug + '.json'), null);
      if (!r || r.slug !== slug || !r.item || !Array.isArray(r.episodes)) continue;
      // A radio show fills one half hour. A file even a little over 30:00 takes a whole hour on the grid, and a radio break takes no
      // filler, so the cards would hold for half an hour after it (the Void TV owner chat measured 26 such hours a week, 24 Nov 2026).
      const eps = r.episodes.filter((e) => e && e.file && e.sec > 0 && e.sec <= HALF_HOUR).map((e) => {
        const ep = { n: e.n, name: e.name, state: 'LIVE', url: 'https://archive.org/download/' + r.item + '/' + encPath(e.file), min: Math.round(e.sec / 60), item: r.item, p: e.file, f: 'MP3' };
        if (e.aired) ep.ad = e.aired;
        return Object.defineProperty(ep, 'sec', { value: e.sec });
      });
      if (!eps.length) continue;
      const year = (/^[0-9]{4}/.exec(r.years || '') || [''])[0];
      out.shows.push({
        show: r.show, slug, type: 'Radio', network: c.name, year, runtime: 30, tags: [], poster: null, backdrop: null,
        overview: 'Old-time radio, ' + (r.years || 'from the Archive') + '. Plays on ' + c.name + ' on Live TV.', genres: [], rating: null, country: 'US',
        matchedAt: CH.made || '', seasons: [{ season: 1, episodes: eps }], eps: eps.length, cast: [], crew: [], credits: {},
        radio: { channel: c.id, credit: r.credit || '', licence: r.licence || '', years: r.years || '' },
      });
      slugs.push(slug);
    }
    if (slugs.length) out.channels.push({ id: c.id, name: c.name, shows: slugs });
  }
  return out;
}

// ---- The page ---------------------------------------------------------------------------------------------------------------
// Inlined into the page as '(' + radioPage.toString() + ')()'. window.VoidRadio: screen(host, d) puts the old radio over the
// picture (d: { show, ep, aired, channel, next, at, credit }), off(host) takes it away, tile(name) is the radio for an On now tile.
function radioPage() {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pt(deg, r) { var a = deg * Math.PI / 180; return [200 + r * Math.cos(a), 402 - r * Math.sin(a)]; }
  function f1(x) { return Math.round(x * 10) / 10; }
  function dial() {
    var ticks = '', labels = '', d, a, b;
    for (d = 15; d <= 165; d += 15) { a = pt(d, 54); b = pt(d, 62); ticks += '<path d="M' + f1(a[0]) + ' ' + f1(a[1]) + 'L' + f1(b[0]) + ' ' + f1(b[1]) + '"/>'; }
    var L = [[160, '55'], [125, '70'], [90, '100'], [55, '140'], [20, '160']];
    for (var i = 0; i < L.length; i++) { a = pt(L[i][0], 42); labels += '<text x="' + f1(a[0]) + '" y="' + f1(a[1] + 4) + '">' + L[i][1] + '</text>'; }
    var n = pt(72, 60);
    return '<g stroke="#5a3306" stroke-width="2" stroke-linecap="round">' + ticks + '</g>'
      + '<g fill="#4a2a05" font-family="system-ui,Segoe UI,sans-serif" font-size="10" font-weight="700" text-anchor="middle">' + labels + '</g>'
      + '<path d="M200 402L' + f1(n[0]) + ' ' + f1(n[1]) + '" stroke="#07080c" stroke-width="3" stroke-linecap="round"/>';
  }
  var ARCH = 'M90 322V214C90 140 140 90 200 90S310 140 310 214V322Z', BODY = 'M30 482V230C30 104 106 20 200 20S370 104 370 230V482Z';
  var SYMBOL = '<svg id="rsDefs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
    + '<linearGradient id="rsBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#202a48"/><stop offset="1" stop-color="#0c0e16"/></linearGradient>'
    + '<linearGradient id="rsCloth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1238"/><stop offset="1" stop-color="#12091b"/></linearGradient>'
    + '<radialGradient id="rsDial" cx=".5" cy=".9" r=".95"><stop offset="0" stop-color="#ffe7b3"/><stop offset=".5" stop-color="#f2a93b"/><stop offset="1" stop-color="#7d470c"/></radialGradient>'
    + '<pattern id="rsWeave" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 3h6M3 0v6" stroke="rgba(255,79,200,.16)" stroke-width="1"/></pattern>'
    + '<clipPath id="rsGrille"><path d="' + ARCH + '"/></clipPath>'
    + '<filter id="rsBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>'
    + '<symbol id="rsRadio" viewBox="0 0 400 500" overflow="visible">'
    + '<path d="' + BODY + '" fill="none" stroke="#5fe3ff" stroke-width="10" opacity=".22" filter="url(#rsBlur)"/>'
    + '<path d="' + BODY + '" fill="url(#rsBody)" stroke="#5fe3ff" stroke-width="4"/>'
    + '<path d="M52 464V232C52 120 118 44 200 44S348 120 348 232V464Z" fill="none" stroke="rgba(255,79,200,.6)" stroke-width="2.5"/>'
    + '<path d="' + ARCH + '" fill="url(#rsCloth)"/><path d="' + ARCH + '" fill="url(#rsWeave)"/>'
    + '<g clip-path="url(#rsGrille)" fill="#1a2240" stroke="rgba(95,227,255,.45)" stroke-width="1.5">'
    + '<path d="M128 330V170Q128 150 140 140Q152 150 152 170V330Z"/><path d="M188 330V120Q188 104 200 92Q212 104 212 120V330Z"/><path d="M248 330V170Q248 150 260 140Q272 150 272 170V330Z"/>'
    + '<path d="M90 250Q145 222 200 222Q255 222 310 250V262Q255 236 200 236Q145 236 90 262Z"/></g>'
    + '<path d="' + ARCH + '" fill="none" stroke="#5fe3ff" stroke-width="3"/>'
    + '<path d="M134 402A66 66 0 0 1 266 402Z" fill="#f2a93b" opacity=".55" filter="url(#rsBlur)"/>'
    + '<path d="M134 402A66 66 0 0 1 266 402Z" fill="url(#rsDial)" stroke="#5fe3ff" stroke-width="3"/>'
    + dial()
    + '<circle cx="200" cy="402" r="6" fill="#07080c"/>'
    + '<g fill="#0f1118" stroke="#5fe3ff" stroke-width="3"><circle cx="122" cy="440" r="20"/><circle cx="200" cy="444" r="14"/><circle cx="278" cy="440" r="20"/></g>'
    + '<g stroke="#ff4fc8" stroke-width="3" stroke-linecap="round"><path d="M122 440l-9 -12"/><path d="M200 444v-9"/><path d="M278 440l9 -12"/></g>'
    + '<rect x="20" y="478" width="360" height="18" rx="6" fill="#0f1118" stroke="rgba(95,227,255,.55)" stroke-width="2"/>'
    + '</symbol></defs></svg>';
  var RADIO = '<svg viewBox="0 0 400 500" aria-hidden="true"><use href="#rsRadio"/></svg>';
  function defs() {
    if (typeof document === 'undefined' || !document.body || document.getElementById('rsDefs')) return;
    document.body.insertAdjacentHTML('beforeend', SYMBOL);
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function aired(ad) {
    var m = /^([0-9]{4})(?:-([0-9]{2}))?(?:-([0-9]{2}))?$/.exec(String(ad || ''));
    if (!m) return '';
    var mo = m[2] ? MON[+m[2] - 1] : '';
    return (m[3] ? +m[3] + ' ' : '') + (mo ? mo + ' ' : '') + m[1];
  }
  function html(d) {
    var a = aired(d.aired), meta = [];
    if (a) meta.push('Aired <b>' + esc(a) + '</b>');
    if (d.channel) meta.push(esc(d.channel));
    return '<div class="rs-set">' + RADIO + '</div><div class="rs-text">'
      + '<div class="rs-kick"><i></i>Radio show</div>'
      + '<div class="rs-show">' + esc(d.show) + '</div>'
      + (d.ep ? '<div class="rs-ep">' + esc(d.ep) + '</div>' : '')
      + (meta.length ? '<div class="rs-meta">' + meta.join(' &middot; ') + '</div>' : '')
      + (d.next ? '<div class="rs-next"><span>Up next</span> <b>' + esc(d.next) + '</b>' + (d.at ? ' <span>at ' + esc(d.at) + '</span>' : '') + '</div>' : '')
      + '<div class="rs-credit">Recording from ' + (d.credit ? 'the ' + esc(d.credit) + ' on ' : '') + 'the Internet Archive</div>'
      + '</div>';
  }
  function off(host) {
    var el = host && host.querySelector ? host.querySelector('.rs') : null;
    if (el && el.remove) el.remove();
  }
  function screen(host, d) {
    if (!host || !host.querySelector) return null;
    defs();
    var el = host.querySelector('.rs');
    if (!el) {
      el = document.createElement('div'); el.className = 'rs rs-b'; el.setAttribute('role', 'status');
      var under = host.querySelector('.vpx-chname') || host.querySelector('.vpx-card');
      if (under) host.insertBefore(el, under); else host.appendChild(el);
    }
    var h = html(d);
    if (el.rsHtml !== h) { el.innerHTML = h; el.rsHtml = h; }
    return el;
  }
  function tile(name) { defs(); return '<span class="p rs-tile">' + RADIO + '<em>' + esc(name) + '</em></span>'; }
  var api = { screen: screen, off: off, tile: tile, html: html, aired: aired };
  if (typeof window !== 'undefined') window.VoidRadio = api;
  return api;
}
const pageSource = '(' + radioPage.toString().replace(/\r\n/g, '\n') + ')();';

module.exports = { readRadio, radioPage, pageSource, CSS };
