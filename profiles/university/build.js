// Void University, first slice (15 Nov 2026): turns each course file in profiles/university/courses/ into one
// static page in profiles/university/site-preview/. Nothing is downloaded: video and audio play straight from the
// Internet Archive, the same way voidtv.net plays its shows.
//   node profiles/university/build.js      then open profiles/university/site-preview/index.html
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
// --site builds the public copy for university.voidtv.net (Bryan, 15 Nov 2026: "Yes, deploy it") into site/,
// without the draft badge; with no flag it builds the local preview.
const LIVE = process.argv.includes('--site');
const OUT = path.join(DIR, LIVE ? 'site' : 'site-preview');
const DRAFT = LIVE ? '' : '<span class="draft">Draft for Bryan: nothing here is public</span>';
const DONATE = 'https://square.link/u/dJioBmlW'; // CASH, one setting for this profile

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fileUrl = (p) => p.item && p.file ? 'https://archive.org/download/' + encodeURIComponent(p.item) + '/' + encodeURIComponent(p.file) : null;
const pageUrl = (p) => p.item ? 'https://archive.org/details/' + encodeURIComponent(p.item) : null;
// In-copyright books (Bryan, 15 Nov 2026: "keep the books"): we send people to a library copy, never an upload.
const libraryUrl = (p) => 'https://search.worldcat.org/search?q=' + encodeURIComponent(p.title + ' ' + String(p.by || '').replace(/\s*\(.*\)\s*$/, ''));
const mins =(s) => s ? Math.round(s / 60) + ' min' : '';
const ROLE = { watch: 'Watch', listen: 'Listen', read: 'Read', do: 'Do' };

function piece(p, main) {
  const url = fileUrl(p);
  const meta = [p.by, mins(p.seconds)].filter(Boolean).join(' · ');
  const held = !!p.hold;
  let media = '';
  if (!held && url && p.role === 'watch') media = '<video controls preload="none" src="' + esc(url) + '"></video>';
  else if (!held && url && p.role === 'listen') media = '<audio controls preload="none" src="' + esc(url) + '"></audio>';
  else if (!held && p.pointer) media = '<a class="btn" href="' + esc(libraryUrl(p)) + '" target="_blank" rel="noopener">Find it at a library</a>';
  else if (!held && p.role === 'read' && pageUrl(p)) media = '<a class="btn" href="' + esc(pageUrl(p)) + '" target="_blank" rel="noopener">Open the book</a>';
  return '<div class="piece ' + (main ? 'main' : 'comp') + (held ? ' held' : '') + '">'
    + '<div class="ph"><span class="role r-' + esc(p.role) + '">' + esc(ROLE[p.role] || p.role) + '</span>'
    + (p.voidtv ? '<span class="tag">On voidtv.net</span>' : '') + '</div>'
    + '<b>' + esc(p.title) + '</b><div class="meta">' + esc(meta) + '</div>'
    + (p.note ? '<p>' + esc(p.note) + '</p>' : '')
    + (held ? '<div class="hold">On hold: ' + esc(p.hold) + '</div>' : '')
    + media
    + '<div class="lic">' + esc(p.licence || '') + (pageUrl(p) && !p.pointer ?' <a href="' + esc(pageUrl(p)) + '" target="_blank" rel="noopener">Source</a>' : '') + '</div>'
    + '</div>';
}

// The crystal: Bryan's nucleation learning (crystal.js has his words and the growth rules). The order of the three
// pieces is shuffled per unit, the same way on every build, so the right one is not always first.
function crystal(c, u) {
  const x = u.crystal; if (!x) return '';
  const opts = [{ text: x.key, key: 1 }, ...x.decoys.map((d) => ({ text: d.text, why: d.why }))];
  const rot = u.n % opts.length; const order = opts.slice(rot).concat(opts.slice(0, rot));
  const chip = (t) => '<div class="cx-chip">' + esc(t) + '</div>';
  const cfg = { id: c.slug + '-' + u.n, speed: x.speed, aha: x.aha };
  return '<div class="cx" data-cfg="' + esc(JSON.stringify(cfg)) + '">'
    + '<h3>Make it set</h3><p class="cx-lead">Five partials from this unit are floating in a supercooled liquid. Everything is here, and nothing has set. One more piece is the nucleation point. Pick it and watch what happens. There is no score.</p>'
    + '<div class="cx-stage"><canvas></canvas>'
    + '<div class="cx-col l">' + [0, 2, 4].map((i) => chip(x.partials[i])).join('') + '</div>'
    + '<div class="cx-col r">' + [1, 3].map((i) => chip(x.partials[i])).join('') + '</div></div>'
    + '<div class="cx-status" aria-live="polite"></div>'
    + '<div class="cx-choices">' + order.map((o) => '<button type="button"' + (o.key ? ' data-key="1"' : ' data-why="' + esc(o.why) + '"') + '>' + esc(o.text) + '</button>').join('') + '</div>'
    + '<div class="cx-ctrl"><label>Cooling <span>slow</span><input class="cx-speed" type="range" min="0" max="1" step="0.05"><span>fast</span></label>'
    + '<button type="button" class="cx-heat" disabled>Heat it (anneal)</button><button type="button" class="cx-reset">Start over</button></div>'
    + '<div class="cx-after" hidden><h3>Now say it another way</h3><p>You have learned it when you can say it in your own words. Write it the way you would tell a friend.</p><textarea class="cx-say" rows="3" placeholder="In my own words..."></textarea><small>This stays on this device. Nobody grades it.</small></div>'
    + '</div>';
}

// The scene: an everyday analogy acted out, then relabelled as the idea (scene.js; Bryan, 15 Nov 2026: pictures and
// one-to-one analogies, not flat text). The map line under it says the one-to-one plainly.
function scene(u) {
  const s = u.scene; if (!s) return '';
  const map = (s.map || []).map(([a, b]) => '<span><i>' + esc(a) + '</i> = <b>' + esc(b) + '</b></span>').join('');
  return '<div class="sc" data-scene="' + esc(JSON.stringify(s)) + '">'
    + '<div class="sc-top"><span class="sc-like">Like ' + esc(s.analogy.charAt(0).toLowerCase() + s.analogy.slice(1)) + '</span></div>'
    + '<div class="sc-stage"></div>'
    + '<div class="sc-say" aria-live="polite"></div>'
    + '<div class="sc-ctrl"><button type="button" class="sc-back" aria-label="Step back">&#9664;</button>'
    + '<button type="button" class="sc-play">Play</button>'
    + '<button type="button" class="sc-next" aria-label="Step forward">&#9654;</button><div class="sc-dots"></div></div>'
    + (map ? '<div class="sc-map">' + map + '</div>' : '')
    + '</div>';
}

// Bryan, 15 Nov 2026: "less words". A unit shows its picture, its main piece and its crystal; the rest is one tap away.
// The mind's mechanisms are a supplement shelf (Bryan, 15 Nov 2026: "the smaller ones like the FOMO ... are
// supplemental that go for anything"). Any unit lists the mechanisms it leans on; the mechanism shows where it is used.
let MECH = null; const USED = {};
function links(u, c) {
  if (c.shelf === 'supplement') {
    const used = USED[u.n] || [];
    return used.length ? '<div class="uses"><span>Used in</span>' + used.map((x) => '<a href="' + esc(x.slug) + '.html#u' + x.n + '">' + esc(x.course) + ': ' + esc(x.title) + '</a>').join('') + '</div>' : '';
  }
  const ms = (u.mechanisms || []).map((n) => MECH && MECH.units.find((m) => m.n === n)).filter(Boolean);
  return ms.length ? '<div class="uses"><span>The mind at work</span>' + ms.map((m) => '<a href="' + esc(MECH.slug) + '.html#u' + m.n + '">' + esc(m.title) + '</a>').join('') + '</div>' : '';
}

function unit(u, voices, c) {
  const who = (u.voices || []).map((k) => voices[k]).filter(Boolean)
    .map((v) => '<li><b>' + esc(v.name) + '</b>, ' + esc(v.what.toLowerCase()) + '. ' + esc(v.did) + '</li>').join('');
  return '<section class="unit" id="u' + u.n + '">'
    + '<div class="uh"><span class="n">' + u.n + '</span><div><h2>' + esc(u.title) + '</h2></div></div>'
    + scene(u)
    + links(u, c)
    + (u.main ? '<div class="pieces">' + piece(u.main, true) + '</div>' : '')
    + crystal(c, u)
    + '<details class="more"><summary>More: why it matters, what else to watch, read and do, who teaches it</summary>'
    + '<div class="out">You will be able to: ' + esc(u.outcome) + '</div>'
    + '<div class="seed"><h3>Why it matters</h3><p>' + esc(u.why) + '</p></div>'
    + '<div class="seed reach"><h3>How this reaches you</h3><p>' + esc(u.reachesYou) + '</p></div>'
    + ((u.companions || []).length ? '<div class="pieces">' + u.companions.map((c) => piece(c, false)).join('') + '</div>' : '')
    + '<div class="row2"><div class="do"><h3>Do this week</h3><p>' + esc(u.do) + '</p></div>'
    + '<div class="who"><h3>Who teaches this unit</h3><ul>' + who + '</ul></div></div>'
    + '</details>'
    + '</section>';
}

function page(c, all) {
  const others = '<a href="index.html">Home</a>' + all.map((o) => o.slug === c.slug ? '<b>' + esc(o.name) + '</b>' : '<a href="' + esc(o.slug) + '.html">' + esc(o.name) + '</a>').join('');
  const toc = c.units.map((u) => '<a href="#u' + u.n + '"><span>' + u.n + '</span>' + esc(u.title) + '</a>').join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.name)} · Void University</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#07080c;--panel:#0f1118;--panel2:#161926;--line:#1d2130;--fg:#e8e8ee;--dim:#8a8fa3;--acc:#5fd4ff;--gold:#f2a93b;--pink:#ff4fc8}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,Segoe UI,Roboto,sans-serif}
a{color:var(--acc)}
header{display:flex;align-items:baseline;gap:16px;padding:18px 32px;border-bottom:1px solid var(--line)}
header .logo{font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:20px;letter-spacing:.02em}
header .logo i{font-style:normal;color:var(--acc)}header .tag{color:var(--dim);font-size:14px}
.courses{display:flex;gap:6px;margin-left:24px;flex-wrap:wrap}
.courses a,.courses b{font-size:14px;padding:4px 12px;border-radius:999px;text-decoration:none;border:1px solid var(--line)}
.courses a{color:var(--dim)}.courses a:hover{color:var(--fg);border-color:var(--acc)}.courses b{color:var(--acc);border-color:rgba(95,212,255,.45);font-weight:600}
.draft{margin-left:auto;font-size:13px;color:var(--gold);border:1px solid #4a3a1e;padding:4px 10px;border-radius:999px}
.wrap{display:grid;grid-template-columns:260px 1fr;gap:32px;max-width:1500px;margin:0 auto;padding:28px 32px}
nav{position:sticky;top:20px;align-self:start}
nav h4{margin:0 0 10px;color:var(--dim);font-weight:500;font-size:13px;text-transform:uppercase;letter-spacing:.08em}
nav a{display:flex;gap:10px;padding:8px 10px;border-radius:8px;color:var(--fg);text-decoration:none;font-size:15px}
nav a:hover{background:var(--panel2)}nav a span{color:var(--acc);font-weight:600;width:16px}
.hero{background:linear-gradient(135deg,#0f1a22,#120f1c);border:1px solid var(--line);border-radius:16px;padding:28px 32px;margin-bottom:28px}
.hero .dom{color:var(--acc);font-size:13px;text-transform:uppercase;letter-spacing:.1em}
.hero h1{font-family:Unbounded,system-ui,sans-serif;font-size:36px;margin:6px 0 12px}
.hero p{max-width:820px;color:#cfd2dc;font-size:17px}
.hero ol{columns:2;column-gap:32px;max-width:900px;padding-left:20px;color:#cfd2dc}
.unit{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px 28px;margin-bottom:24px;scroll-margin-top:20px}
.uh{display:flex;gap:16px;align-items:center;margin-bottom:16px}
.uh .n{font-family:Unbounded,system-ui,sans-serif;font-size:28px;color:var(--acc);width:44px;text-align:center}
.uh h2{margin:0;font-size:24px}.out{color:var(--dim);font-size:14px}
.seed{border-left:3px solid var(--gold);padding:2px 16px;margin:10px 0}.seed.reach{border-color:var(--pink)}
h3{margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);font-weight:600}
.seed p,.do p{margin:0;font-size:16px}
.pieces{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin:18px 0}
.piece{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:6px}
.piece.main{grid-column:1/-1;border-color:rgba(95,212,255,.45)}
.piece.held{opacity:.6;border-style:dashed}
.ph{display:flex;gap:8px;align-items:center}
.role{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:2px 8px;border-radius:6px;background:#1c2a33;color:var(--acc)}
.r-listen{background:#2a1f33;color:#d39bff}.r-read{background:#2e2316;color:var(--gold)}
.tag{font-size:12px;color:var(--pink)}
.piece b{font-size:17px}.piece.main b{font-size:20px}.meta{color:var(--dim);font-size:14px}.piece p{margin:2px 0;color:#cfd2dc;font-size:15px}
.hold{color:var(--gold);font-size:14px}
.lic{color:var(--dim);font-size:12px;margin-top:auto}
video{width:100%;max-height:62vh;background:#000;border-radius:8px;margin-top:6px}
.piece.comp video{max-height:240px}
audio{width:100%;margin-top:6px}
.btn{display:inline-block;align-self:start;background:#1c2a33;color:var(--acc);text-decoration:none;padding:8px 14px;border-radius:8px;font-weight:600;margin-top:6px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.do{background:#101a14;border:1px solid #1d3326;border-radius:12px;padding:14px 16px}
.who ul{margin:6px 0 0;padding-left:18px;font-size:14px;color:#cfd2dc}.who li{margin-bottom:4px}
footer{max-width:1500px;margin:0 auto;padding:10px 32px 40px;color:var(--dim);font-size:14px}
.cx{background:#090b12;border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 18px}
.cx-lead{margin:2px 0 12px;color:#cfd2dc;font-size:15px;max-width:900px}
.cx-stage{position:relative;height:360px;border-radius:10px;overflow:hidden;background:radial-gradient(ellipse at center,#0e1a24 0%,#07090f 70%)}
.cx-stage canvas{position:absolute;inset:0;width:100%;height:100%}
.cx-col{position:absolute;top:0;bottom:0;width:min(240px,26%);display:flex;flex-direction:column;justify-content:space-around;padding:10px;pointer-events:none}
.cx-col.l{left:0}.cx-col.r{right:0}
.cx-chip{background:rgba(22,25,38,.85);border:1px dashed #2c3550;border-radius:10px;padding:8px 10px;font-size:13px;line-height:1.35;color:#aab0c2;transition:all .6s ease;animation:drift 6s ease-in-out infinite alternate}
.cx-chip:nth-child(2){animation-delay:-2s}.cx-chip:nth-child(3){animation-delay:-4s}
@keyframes drift{from{transform:translate(0,-4px)}to{transform:translate(0,4px)}}
.cx-chip.set{animation:none;border-style:solid;border-color:rgba(95,212,255,.6);color:var(--fg);box-shadow:0 0 18px rgba(95,212,255,.18)}
.cx-chip.bad{animation:none;border-color:rgba(242,169,59,.6)}
.cx-status{min-height:24px;margin:10px 2px 8px;font-size:15px;color:var(--acc)}
.cx.broken .cx-status{color:var(--gold)}
.cx-choices{display:flex;flex-wrap:wrap;gap:8px}
.cx-choices button,.cx-ctrl button{font:inherit;font-size:15px;background:var(--panel2);color:var(--fg);border:1px solid #2c3550;border-radius:10px;padding:10px 14px;cursor:pointer;text-align:left;max-width:440px}
.cx-choices button:hover:not(:disabled){border-color:var(--acc)}
.cx-choices button:disabled{opacity:.45;cursor:default}
.cx-choices button.picked{opacity:1;border-color:var(--acc);color:var(--acc)}
.cx-choices button.wrongpick{opacity:1;border-color:var(--gold);color:var(--gold)}
.cx-ctrl{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:12px;color:var(--dim);font-size:14px}
.cx-ctrl label{display:flex;align-items:center;gap:8px}.cx-ctrl input{width:160px;accent-color:var(--acc)}
.cx-ctrl button{padding:8px 12px;font-size:14px}.cx-ctrl button:disabled{opacity:.4;cursor:default}
.cx-after{margin-top:14px}.cx-after p{margin:2px 0 8px;font-size:15px;color:#cfd2dc}
.cx-after textarea{width:100%;background:var(--panel2);color:var(--fg);border:1px solid #2c3550;border-radius:10px;padding:10px;font:inherit}
.cx-after small{color:var(--dim)}
.sc{background:#090b12;border:1px solid var(--line);border-radius:12px;padding:14px 18px 16px;margin:0 0 18px}
.sc-like{font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--pink);font-weight:700}
.sc-stage{margin-top:8px;border-radius:10px;background:radial-gradient(ellipse at center,#0e1a24 0%,#07090f 75%);aspect-ratio:800/360;overflow:hidden}
.sc-stage svg{display:block;width:100%;height:100%;font-family:system-ui,Segoe UI,Roboto,sans-serif}
.sc-say{min-height:40px;margin:12px 2px 6px;font-family:Unbounded,system-ui,sans-serif;font-size:22px;font-weight:500;text-align:center}
.sc-ctrl{display:flex;align-items:center;justify-content:center;gap:10px}
.sc-ctrl button{font:inherit;font-size:15px;background:var(--panel2);color:var(--fg);border:1px solid #2c3550;border-radius:10px;padding:8px 16px;cursor:pointer;min-width:44px;min-height:40px}
.sc-ctrl button:hover{border-color:var(--acc)}.sc-play{min-width:120px}
.sc-dots{display:flex;gap:6px;margin-left:10px}
.sc-dots button{min-width:0;min-height:0;width:14px;height:14px;padding:0;border-radius:50%;background:#1d2130}
.sc-dots button.on{background:var(--acc);border-color:var(--acc)}
.sc-map{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 22px;margin-top:12px;font-size:15px;color:var(--dim);opacity:.35;transition:opacity .8s}
.sc.done .sc-map{opacity:1}.sc-map i{font-style:normal;color:#cfd2dc}.sc-map b{color:var(--acc)}
.uses{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 14px}
.uses span{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);font-weight:600;margin-right:4px}
.uses a{font-size:14px;padding:4px 12px;border-radius:999px;text-decoration:none;color:var(--pink);border:1px solid rgba(255,79,200,.35);background:#1a0f19}
.uses a:hover{border-color:var(--pink)}
details.more{margin-top:6px;border-top:1px solid var(--line);padding-top:10px}
details.more summary{cursor:pointer;color:var(--dim);font-size:15px;padding:6px 0}
details.more summary:hover{color:var(--fg)}
@media (max-width:1000px){.wrap{grid-template-columns:1fr}nav{position:static}nav{display:flex;flex-wrap:wrap;gap:4px}nav h4{width:100%}.row2{grid-template-columns:1fr}.hero ol{columns:1}}
</style></head><body>
<header><span class="logo">VOID <i>University</i></span><span class="tag">learn from people who did it</span><span class="courses">${others}</span>${DRAFT}</header>
<div class="wrap"><nav><h4>Units</h4>${toc}</nav><main>
<div class="hero"><div class="dom">${esc(c.domain)} · a course we wrote</div><h1>${esc(c.name)}</h1><p>${esc(c.why)}</p>
<details class="more"><summary>By the end you will be able to...</summary><ol>${c.outcomes.map((o) => '<li>' + esc(o) + '</li>').join('')}</ol></details></div>
${c.units.map((u) => unit(u, c.voices, c)).join('\n')}
</main></div>
<footer>Free, no account. Everything plays from the Internet Archive; each piece names its source and licence.<br>
If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world. <a href="${DONATE}" target="_blank" rel="noopener">Donate to CASH</a></footer>
<script src="crystal.js"></script><script src="scene.js"></script>
</body></html>`;
}

// The front page (Bryan, 15 Nov 2026): rows by area like voidtv.net, each whole course one card; the mind's
// mechanisms as a row of small cards any course can use; every area in a grid below, filled or still to come.
const HUE = { Money: 140, Food: 30, Home: 200, Body: 350, Mind: 195, Words: 45, 'Law and rights': 260, 'Work and trades': 20, Machines: 210, Making: 300, Land: 110, 'Civics and history': 0, 'Faith and philosophy': 280, Family: 330, Emergencies: 10 };
function home(all, list) {
  const full = all.filter((c) => c.shelf !== 'supplement');
  const sup = all.filter((c) => c.shelf === 'supplement');
  const card = (c) => '<a class="card course" href="' + esc(c.slug) + '.html" style="--h:' + (HUE[c.domain] || 195) + '"><div class="p"><small>' + esc(c.domain) + '</small><b>' + esc(c.name) + '</b><span>' + c.units.length + ' units</span></div>'
    + '<div class="t">' + esc(String(c.why).split('. ')[0].replace(/\.$/, '')) + '.</div></a>';
  const mini = (c, u) => '<a class="card mini" href="' + esc(c.slug) + '.html#u' + u.n + '"><div class="p"><b>' + esc(u.title) + '</b><span>' + esc(u.scene ? u.scene.analogy : '') + '</span></div></a>';
  const row = (title, note, cards) => '<section class="row"><h2>' + esc(title) + (note ? ' <small>' + esc(note) + '</small>' : '') + '</h2><div class="rowwrap"><button class="arrow l" aria-label="Back">&#8249;</button><div class="track">' + cards + '</div><button class="arrow r" aria-label="More">&#8250;</button></div></section>';
  const rows = list.types.map((t) => {
    const cs = full.filter((c) => c.domain === t);
    if (!cs.length) return '';
    const s = row(t, cs.length + (cs.length === 1 ? ' course' : ' courses'), cs.map(card).join(''));
    const extra = t === 'Mind' ? sup.map((c) => row(c.name, 'short pieces any course can use', c.units.map((u) => mini(c, u)).join(''))).join('') : '';
    return s + extra;
  }).join('');
  const tiles = list.types.map((t) => {
    const n = all.filter((c) => c.domain === t).length;
    return '<div class="area' + (n ? ' has' : '') + '" style="--h:' + (HUE[t] || 195) + '"><b>' + esc(t) + '</b><small>' + (n ? n + (n === 1 ? ' course' : ' courses') : 'coming') + '</small></div>';
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Void University</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#07080c;--panel:#0f1118;--panel2:#161926;--line:#1d2130;--fg:#e8e8ee;--dim:#8a8fa3;--acc:#5fd4ff;--gold:#f2a93b;--pink:#ff4fc8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,Segoe UI,Roboto,sans-serif}a{color:var(--acc)}
header{display:flex;align-items:baseline;gap:16px;padding:18px 32px;border-bottom:1px solid var(--line)}
header .logo{font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:20px;letter-spacing:.02em}header .logo i{font-style:normal;color:var(--acc)}header .tag{color:var(--dim);font-size:14px}
.draft{margin-left:auto;font-size:13px;color:var(--gold);border:1px solid #4a3a1e;padding:4px 10px;border-radius:999px}
.hero{max-width:1500px;margin:0 auto;padding:36px 32px 10px}.hero h1{font-family:Unbounded,system-ui,sans-serif;font-size:34px;margin:0 0 8px}.hero p{margin:0;color:#cfd2dc;font-size:18px;max-width:760px}
main{max-width:1500px;margin:0 auto;padding:0 12px 20px}
h2{margin:26px 20px 10px;font-size:18px;font-family:Unbounded,system-ui,sans-serif;font-weight:500;display:flex;align-items:baseline;gap:10px}h2 small{color:var(--dim);font-weight:400;font-size:13px;font-family:system-ui,Segoe UI,Roboto,sans-serif}
.rowwrap{position:relative;padding:0 20px}
.track{display:flex;gap:14px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;padding:6px 4px 12px;scrollbar-width:none;scroll-behavior:smooth}.track::-webkit-scrollbar{display:none}
.card{position:relative;flex:0 0 auto;border-radius:10px;overflow:hidden;background:var(--panel);outline:2px solid transparent;text-decoration:none;color:var(--fg);transition:transform .18s ease}.card:hover,.card:focus-visible{outline-color:var(--acc);transform:translateY(-3px)}
.card .p{display:flex;flex-direction:column;justify-content:flex-end;gap:6px;padding:16px;background:linear-gradient(160deg,hsl(var(--h,195) 45% 26%),#0b0d14 75%)}
.course{width:300px}.course .p{aspect-ratio:4/3}.course .p small{color:#cfd2dc;font-size:12px;text-transform:uppercase;letter-spacing:.1em}.course .p b{font-family:Unbounded,system-ui,sans-serif;font-size:24px;line-height:1.15}.course .p span{color:var(--acc);font-size:14px}
.course .t{padding:10px 14px 14px;color:#cfd2dc;font-size:14px;line-height:1.4}
.mini{width:190px}.mini .p{aspect-ratio:1/1;background:linear-gradient(160deg,#2a1530,#0b0d14 75%)}.mini .p b{font-size:17px;line-height:1.2}.mini .p span{color:#cfd2dc;font-size:13px;line-height:1.3}
.mini:hover,.mini:focus-visible{outline-color:var(--pink)}
.arrow{position:absolute;top:50%;transform:translateY(-60%);width:44px;height:44px;border-radius:50%;border:2px solid var(--acc);background:rgba(7,8,12,.92);color:var(--acc);font-size:30px;line-height:38px;padding:0;cursor:pointer;z-index:2;box-shadow:0 2px 12px rgba(0,0,0,.6)}
.arrow.l{left:-2px}.arrow.r{right:-2px}.arrow:hover{background:var(--acc);color:#07080c}.arrow[hidden]{display:none}
@media(hover:none){.arrow{display:none}}
.areas{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:0 20px}
.area{border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:var(--panel);opacity:.55}.area.has{opacity:1;background:linear-gradient(160deg,hsl(var(--h) 40% 18%),var(--panel) 80%);border-color:hsl(var(--h) 50% 35%)}
.area b{display:block;font-size:16px}.area small{color:var(--dim);font-size:13px}
footer{max-width:1500px;margin:0 auto;padding:30px 32px 40px;color:var(--dim);font-size:14px}
</style></head><body>
<header><span class="logo">VOID <i>University</i></span><span class="tag">learn from people who did it</span>${DRAFT}</header>
<div class="hero"><h1>Big ideas, shown with everyday things.</h1><p>Free, no account. Pick a course, or a short piece on how the mind works.</p></div>
<main>${rows}
<h2>Every area <small>more courses are on the way</small></h2><div class="areas">${tiles}</div></main>
<footer>Free, no account. Everything plays from the Internet Archive; each piece names its source and licence.<br>
If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world. <a href="${DONATE}" target="_blank" rel="noopener">Donate to CASH</a></footer>
<script>
document.querySelectorAll('.rowwrap').forEach(function (w) {
  var t = w.querySelector('.track'), l = w.querySelector('.arrow.l'), r = w.querySelector('.arrow.r');
  function upd() { l.hidden = t.scrollLeft < 4; r.hidden = t.scrollLeft + t.clientWidth >= t.scrollWidth - 4; }
  l.onclick = function () { t.scrollLeft -= t.clientWidth * 0.8; }; r.onclick = function () { t.scrollLeft += t.clientWidth * 0.8; };
  t.addEventListener('scroll', upd); window.addEventListener('resize', upd); upd();
});
</script>
</body></html>`;
}

fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.join(DIR, 'crystal.js'), path.join(OUT, 'crystal.js'));
fs.copyFileSync(path.join(DIR, 'scene.js'), path.join(OUT, 'scene.js'));
const courses = fs.readdirSync(path.join(DIR, 'courses')).filter((f) => f.endsWith('.json'));
const loaded = courses.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, 'courses', f), 'utf8')))
  .sort((a, b) => (a.slug === 'critical-thinking' ? -1 : b.slug === 'critical-thinking' ? 1 : 0));
MECH = loaded.find((c) => c.shelf === 'supplement') || null;
for (const c of loaded) if (c.shelf !== 'supplement') for (const u of c.units) for (const n of u.mechanisms || []) (USED[n] = USED[n] || []).push({ slug: c.slug, course: c.name, n: u.n, title: u.title });
fs.writeFileSync(path.join(OUT, 'index.html'), home(loaded, JSON.parse(fs.readFileSync(path.join(DIR, 'list.json'), 'utf8'))));
for (const c of loaded) {
  const html = page(c, loaded);
  fs.writeFileSync(path.join(OUT, c.slug + '.html'), html);
  const n = c.units.reduce((a, u) => a + (u.main ? 1 : 0) + (u.companions || []).length, 0);
  const held = c.units.reduce((a, u) => a + [u.main, ...(u.companions || [])].filter((p) => p && p.hold).length, 0);
  console.log(c.slug + ': ' + c.units.length + ' units, ' + n + ' pieces (' + held + ' on hold) -> ' + path.relative(process.cwd(), path.join(OUT, c.slug + '.html')));
}
