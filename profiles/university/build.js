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
  else if (!held && p.role === 'read' && p.url) media = '<a class="btn" href="' + esc(p.url) + '" target="_blank" rel="noopener">Open it</a>';
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

// The lab: something to put your hands on (lab.js; Bryan, 15 Nov 2026: "interactive teaching, analogous teaching,
// If This Then That labs"). Knobs are the IF, the bench answers, and each rule's THEN shows only once you made it happen.
function lab(u) {
  if (!shipsLab(u)) return ''; // the public copy carries a lab only once it is marked live
  const l = u.lab;
  const map = (l.map || []).map(([a, z]) => '<span><i>' + esc(a) + '</i> = <b>' + esc(z) + '</b></span>').join('');
  const cfg = { bench: l.bench, go: l.go, knobs: l.knobs, rules: l.rules, meet: l.meet, triesNote: l.triesNote, guess: l.guess };
  return '<div class="lab" data-lab="' + esc(JSON.stringify(cfg)) + '">'
    + '<div class="lab-top"><span class="lab-kick">Lab · if this, then that</span><b>' + esc(l.title) + '</b><p>' + esc(l.ask) + '</p></div>'
    + '<div class="lab-body"><div class="lab-stage"><canvas></canvas></div><div class="lab-side"></div></div>'
    + '<div class="lab-tries"></div><div class="lab-rules"></div>'
    + (map ? '<div class="lab-map">' + map + '</div>' : '')
    + (l.credit ? '<p class="lab-credit">' + esc(l.credit) + '</p>' : '')
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

// Bryan, 15 Nov 2026: "people ... it's cool but why do I need to know it". Every unit answers that first.
const needIt = (u) => u.needIt || String(u.why || '').split('. ')[0].replace(/\.$/, '') + '.';
const clock = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
function chapters(u) {
  if (!(u.chapters || []).length) return '';
  return '<div class="chap"><span>' + (u.main && u.main.role === 'listen' ? 'Hear it in pieces' : 'Watch it in pieces') + '</span>' + u.chapters.map((x) => '<button data-t="' + x.t + '"><i>' + clock(x.t) + '</i>' + esc(x.title) + '</button>').join('') + '</div>';
}
// Our own quiz, written from the lecture; every answer quotes the line it comes from (checked word for word).
function quiz(u) {
  if (!(u.quiz || []).length) return '';
  return '<details class="quiz"><summary><h3>Check yourself</h3><span>' + u.quiz.length + ' questions, each answer quotes the ' + (u.reading ? 'book' : 'lecture') + '</span></summary>' + u.quiz.map((q, i) => '<div class="qq" data-a="' + q.a + '"><p><b>' + (i + 1) + '.</b> ' + esc(q.q) + '</p><div class="qc">'
    + q.choices.map((ch, j) => '<button data-j="' + j + '">' + esc(ch) + '</button>').join('') + '</div>'
    + '<div class="qa" hidden><p class="qr"></p><p>' + esc(q.why) + '</p><blockquote>"' + esc(q.quote) + '"' + (q.ref ? '<a class="qt" href="' + esc(q.ref) + '">From the book: open the chapter</a>' : '<button class="qt" data-t="' + q.t + '">From the lecture, at ' + clock(q.t) + '</button>') + '</blockquote></div></div>').join('')
    + '<div class="qs" hidden></div></details>';
}

// The chapter a class unit is built on, read right here in plain English (the printed words stay one tap away on
// the book's own page). Reading time is counted at 200 words a minute.
function reader(u) {
  if (!u.reading) return '';
  const b = SHELFBOOKS.find((x) => x.source === u.reading.shelf);
  const ch = b && b.chapters.find((x) => x.n === u.reading.chapter);
  if (!ch) return '';
  const words = ch.passages.reduce((a, x) => a + x.plain.split(' ').length, 0);
  return '<details class="reader"><summary><h3>Read the chapter here</h3><span>about ' + Math.max(1, Math.round(words / 200)) + ' minutes, in plain English</span></summary>'
    + ch.passages.map((x) => '<p>' + esc(x.plain) + '</p>' + (x.warnings || []).map((w) => '<p class="warn"><b>Do not follow this part as written.</b> ' + esc(w.text) + ' <a href="' + esc(w.url) + '" target="_blank" rel="noopener">' + esc(w.source) + '</a></p>').join('')).join('')
    + '<p class="rd-more"><a href="' + esc(b.slug) + '.html#c' + ch.n + '">See the words as printed in ' + esc(String(b.year)) + ' beside this chapter</a></p></details>';
}

function unit(u, voices, c) {
  const who = (u.voices || []).map((k) => voices[k]).filter(Boolean)
    .map((v) => '<li><b>' + esc(v.name) + '</b>, ' + esc(v.what.toLowerCase()) + '. ' + esc(v.did) + '</li>').join('');
  return '<section class="unit" id="u' + u.n + '">'
    + '<div class="uh"><span class="n">' + u.n + '</span><div><h2>' + esc(u.title) + '</h2></div>' + (c.shelf === 'supplement' && img('m' + u.n) ? '<img class="uimg" loading="lazy" src="' + img('m' + u.n) + '" alt="">' : '') + '</div>'
    + '<p class="need"><b>Why you need this:</b> ' + esc(needIt(u)) + '</p>'
    + scene(u)
    + links(u, c)
    + lab(u)
    + (u.main ? '<div class="pieces">' + piece(u.main, true) + '</div>' : '')
    + reader(u)
    + chapters(u)
    + quiz(u)
    + crystal(c, u)
    + '<div class="donebar"><button type="button" class="donebtn">Mark this unit done</button></div>'
    + '<details class="more"><summary>More: why it matters, what else to watch, read and do, who teaches it</summary>'
    + '<div class="out">You will be able to: ' + esc(u.outcome) + '</div>'
    + '<div class="seed"><h3>Why it matters</h3><p>' + esc(u.why) + '</p></div>'
    + '<div class="seed reach"><h3>How this reaches you</h3><p>' + esc(u.reachesYou) + '</p></div>'
    + ((u.companions || []).length ? '<div class="pieces">' + u.companions.map((c) => piece(c, false)).join('') + '</div>' : '')
    + '<div class="row2"><div class="do"><h3>Do this week</h3><p>' + esc(u.do) + '</p></div>'
    + ((who || (c.source && c.source.by)) ? '<div class="who"><h3>Who teaches this unit</h3><ul>' + (who || '<li><b>' + esc(c.source.by) + '</b>, ' + esc(c.source.title) + '</li>') + '</ul></div>' : '') + '</div>'
    + '</details>'
    + '</section>';
}

function page(c, all) {
  const others = '<a href="index.html">Home</a>' + all.map((o) => o.slug === c.slug ? '<b>' + esc(o.name) + '</b>' : '<a href="' + esc(o.slug) + '.html">' + esc(o.name) + '</a>').join('');
  const toc = c.units.map((u) => '<a href="#u' + u.n + '"><span>' + u.n + '</span>' + esc(u.title) + '</a>').join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.name)} · Void University</title>
${FONTS}
<style>
${BASE}
${CARDCSS}
.need{margin:0 0 14px;padding:12px 16px;border-left:3px solid var(--gold);background:#141c2e;border-radius:0 8px 8px 0;font-size:16px;color:#e4ddcc}.need b{color:var(--gold)}
.hero .src{font-size:14px;color:var(--dim)}.hero .src a{color:var(--gold)}
.lv{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 0}.lv span{font-size:12px;letter-spacing:.06em;padding:3px 10px;border-radius:999px;border:1px solid var(--line);color:#cfd3dc}
.chap{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:-6px 0 18px}.chap>span{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);font-weight:600;margin-right:4px}
.chap button,.qc button,.qt{font:inherit;font-size:14px;background:var(--panel2);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px 12px;cursor:pointer;text-align:left}
.chap button:hover,.qc button:hover:not(:disabled),.qt:hover{border-color:var(--gold)}.chap i{font-style:normal;color:var(--gold);margin-right:8px}
.quiz>summary{cursor:pointer;list-style:none;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}.quiz>summary::-webkit-details-marker{display:none}.quiz>summary h3{margin:0}.quiz>summary span{font-size:14px;color:var(--dim)}.quiz>summary::after{content:'Open';margin-left:auto;font-size:13px;color:var(--gold)}.quiz[open]>summary::after{content:'Close'}.quiz[open]>summary{margin-bottom:8px}
.quiz{background:#0e1626;border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 18px}
.qq{padding:10px 0;border-top:1px solid var(--line)}.qq:first-of-type{border-top:0}.qq>p{margin:0 0 8px;font-size:16px}
.qc{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px}
.qc button:disabled{cursor:default;opacity:.55}.qc button.right{opacity:1;border-color:#5fe39a;color:#5fe39a}.qc button.wrong{opacity:1;border-color:#e08a8f;color:#e08a8f}
.qa{margin-top:10px;font-size:15px;color:#cfd3dc}.qa p{margin:0 0 6px}.qr{font-weight:600}.qr.ok{color:#5fe39a}.qr.no{color:#e08a8f}
.qa blockquote{margin:6px 0 0;padding:8px 12px;border-left:3px solid var(--line);font-family:Fraunces,Georgia,serif;color:#e4ddcc}
.qt{display:block;margin-top:8px;font-family:Inter,system-ui,sans-serif;font-size:13px;padding:5px 10px;color:var(--gold)}
.qs{margin-top:12px;padding:10px 14px;border-radius:8px;background:#132038;color:var(--gold)}
.chans{display:flex;gap:16px;flex-wrap:wrap;margin:0 0 28px}.chans .chan{width:280px}
.uimg{width:132px;height:84px;object-fit:cover;border-radius:6px;margin-left:auto;border:1px solid var(--line)}
.wrap{display:grid;grid-template-columns:260px 1fr;gap:32px;max-width:1500px;margin:0 auto;padding:28px 32px}
nav{position:sticky;top:20px;align-self:start}
nav h4{margin:0 0 10px;color:var(--dim);font-weight:500;font-size:13px;text-transform:uppercase;letter-spacing:.08em}
nav a{display:flex;gap:10px;padding:8px 10px;border-radius:8px;color:var(--fg);text-decoration:none;font-size:15px}
nav a:hover{background:var(--panel2)}nav a span{color:var(--acc);font-weight:600;width:16px}
.hero{background:linear-gradient(135deg,#0f1a22,#120f1c);border:1px solid var(--line);border-radius:16px;padding:28px 32px;margin-bottom:28px}
.hero .dom{color:var(--acc);font-size:13px;text-transform:uppercase;letter-spacing:.1em}
.hero h1{font-family:Fraunces,Georgia,serif;font-size:36px;margin:6px 0 12px}
.hero p{max-width:820px;color:#cfd2dc;font-size:17px}
.hero ol{columns:2;column-gap:32px;max-width:900px;padding-left:20px;color:#cfd2dc}
.unit{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px 28px;margin-bottom:24px;scroll-margin-top:20px}
.uh{display:flex;gap:16px;align-items:center;margin-bottom:16px}
.uh .n{font-family:Fraunces,Georgia,serif;font-size:28px;color:var(--acc);width:44px;text-align:center}
.uh h2{margin:0;font-size:24px}.out{color:var(--dim);font-size:14px}
.seed{border-left:3px solid var(--gold);padding:2px 16px;margin:10px 0}.seed.reach{border-color:var(--pink)}
h3{margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);font-weight:600}
.seed p,.do p{margin:0;font-size:16px}
.pieces{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin:18px 0}
.piece{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:6px}
.donebar{margin:14px 0 4px;display:flex;justify-content:flex-end}.donebtn{font:inherit;font-size:14px;padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer}.donebtn:hover{border-color:var(--gold)}
.unit.isdone .donebtn{border-color:#3f7a57;color:#8fd6aa}.wrap nav a.isdone span::after{content:' \\2713';color:#8fd6aa}.donecount{font-size:13px;color:#8fd6aa;margin:10px 0 0;padding:0 10px}
.reader{margin:12px 0;border:1px solid var(--line);border-radius:12px;background:var(--panel2);padding:4px 18px}
.reader summary{cursor:pointer;display:flex;gap:14px;align-items:baseline;padding:10px 0;list-style:none}.reader summary::-webkit-details-marker{display:none}
.reader summary h3{margin:0;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold)}.reader summary span{color:var(--dim);font-size:14px}
.reader p{font-size:18px;line-height:1.65;max-width:760px;margin:0 0 16px}.reader .warn{font-size:15px;padding:10px 12px;border:1px solid #6b3a3d;background:#221316;border-radius:8px;color:#f0c9cb}.reader .warn a,.reader .rd-more a{color:var(--gold)}.reader .rd-more{font-size:14px}
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
.cx{background:#0a101c;border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 18px}
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
.sc{background:#0a101c;border:1px solid var(--line);border-radius:12px;padding:14px 18px 16px;margin:0 0 18px}
.sc-like{font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--pink);font-weight:700}
.sc-stage{margin-top:8px;border-radius:10px;background:radial-gradient(ellipse at center,#0e1a24 0%,#07090f 75%);aspect-ratio:800/360;overflow:hidden}
.sc-stage svg{display:block;width:100%;height:100%;font-family:system-ui,Segoe UI,Roboto,sans-serif}
.sc-say{min-height:40px;margin:12px 2px 6px;font-family:Fraunces,Georgia,serif;font-size:22px;font-weight:500;text-align:center}
.sc-ctrl{display:flex;align-items:center;justify-content:center;gap:10px}
.sc-ctrl button{font:inherit;font-size:15px;background:var(--panel2);color:var(--fg);border:1px solid #2c3550;border-radius:10px;padding:8px 16px;cursor:pointer;min-width:44px;min-height:40px}
.sc-ctrl button:hover{border-color:var(--acc)}.sc-play{min-width:120px}
.sc-dots{display:flex;gap:6px;margin-left:10px}
.sc-dots button{min-width:0;min-height:0;width:14px;height:14px;padding:0;border-radius:50%;background:#1d2130}
.sc-dots button.on{background:var(--acc);border-color:var(--acc)}
.sc-map{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 22px;margin-top:12px;font-size:15px;color:var(--dim);opacity:.35;transition:opacity .8s}
.sc.done .sc-map{opacity:1}.sc-map i{font-style:normal;color:#cfd2dc}.sc-map b{color:var(--acc)}
.lab{background:#0a101c;border:1px solid rgba(212,176,106,.45);border-radius:12px;padding:16px 18px 18px;margin:0 0 18px}
.lab-kick{display:block;font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold);font-weight:700}
.lab-top b{display:block;font-family:Fraunces,Georgia,serif;font-size:24px;font-weight:600;margin:2px 0}
.lab-top p{margin:0 0 12px;color:#cfd2dc;font-size:16px;max-width:820px}
.lab-body{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,1fr);gap:18px;align-items:start}
.lab-stage{border-radius:10px;background:radial-gradient(ellipse at center,#0e1a24 0%,#07090f 75%);aspect-ratio:1/1;max-height:560px;overflow:hidden}
.lab-stage canvas{display:block;width:100%;height:100%}
.lab-side{display:flex;flex-direction:column;gap:14px}
.lab-knob>span{display:block;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);font-weight:600;margin-bottom:6px}
.lab-seg{display:flex;flex-wrap:wrap;gap:8px}
.lab-seg button{font:inherit;font-size:16px;min-height:44px;min-width:64px;background:var(--panel2);color:var(--fg);border:1px solid #2c3550;border-radius:10px;padding:8px 16px;cursor:pointer}
.lab-seg button:hover{border-color:var(--gold)}.lab-seg button.on{border-color:var(--gold);color:var(--ink);background:var(--gold);font-weight:600}
.lab.running .lab-seg button{opacity:.5;cursor:default}
.lab-go{font:inherit;font-size:18px;font-weight:600;min-height:52px;background:var(--gold);color:var(--ink);border:0;border-radius:10px;padding:10px 22px;cursor:pointer;align-self:start}
.lab-go:disabled{opacity:.45;cursor:default}.lab.hands .lab-go{display:none}.lab.hands .lab-stage{cursor:pointer;touch-action:manipulation}
.lab-guess{display:flex;flex-direction:column;gap:8px;padding:10px 14px;border-left:3px solid var(--pink);background:#141c2e;border-radius:0 8px 8px 0;font-size:16px}
.lab-guess.made{border-color:#5a6480;color:var(--dim)}.lab.running .lab-guess{opacity:.55}
.lab-guess .lab-seg button.on{background:var(--pink);border-color:var(--pink)}
.lab-acts{display:flex;flex-wrap:wrap;gap:10px}.lab-acts:empty{display:none}
.lab-act{font:inherit;font-size:17px;min-height:52px;background:var(--panel2);color:var(--fg);border:1px solid #2c3550;border-radius:10px;padding:10px 20px;cursor:pointer}
.lab-act:hover{border-color:var(--gold)}.lab-act.main{background:var(--gold);color:var(--ink);border-color:var(--gold);font-weight:600}
.lab-say{font-family:Fraunces,Georgia,serif;font-size:20px;line-height:1.35;min-height:54px}
.lab-h{display:block;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);font-weight:600;margin:16px 0 8px}
.lab-strip{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px}
.lab-strip figure{margin:0;flex:none;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 8px 6px}
.lab-strip canvas{display:block;width:132px;height:60px}.lab-strip figcaption{font-size:12px;color:var(--dim);margin-top:4px;text-align:center}
.lab-rules ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.lab-rules li{padding:10px 14px;border-radius:10px;border:1px dashed #2c3550;font-size:16px;color:#aab0c2}
.lab-rules li b{color:var(--gold);font-weight:700;text-transform:uppercase;font-size:13px;letter-spacing:.08em}
.lab-rules li i{color:var(--dim)}
.lab-rules li.found{border-style:solid;border-color:rgba(212,176,106,.6);color:var(--fg);background:#141c2e}
.lab-rules li.fresh{animation:labfound 1.6s ease}
@keyframes labfound{0%{box-shadow:0 0 0 0 rgba(212,176,106,.9);transform:scale(1.015)}100%{box-shadow:0 0 0 18px rgba(212,176,106,0);transform:none}}
.lab-meet{margin:12px 0 0;padding:12px 16px;border-left:3px solid var(--pink);background:#141c2e;border-radius:0 8px 8px 0;font-size:16px}
.lab-credit{margin:12px 0 0;font-size:13px;color:var(--dim)}
.lab-map{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:14px;font-size:15px;color:var(--dim)}.lab-map i{font-style:normal;color:#cfd2dc}.lab-map b{color:var(--acc)}
@media (max-width:900px){.lab-body{grid-template-columns:1fr}.lab-stage{max-height:70vh}}
.uses{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 14px}
.uses span{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);font-weight:600;margin-right:4px}
.uses a{font-size:14px;padding:4px 12px;border-radius:999px;text-decoration:none;color:var(--pink);border:1px solid rgba(255,79,200,.35);background:#1a0f19}
.uses a:hover{border-color:var(--pink)}
details.more{margin-top:6px;border-top:1px solid var(--line);padding-top:10px}
details.more summary{cursor:pointer;color:var(--dim);font-size:15px;padding:6px 0}
details.more summary:hover{color:var(--fg)}
@media (max-width:1000px){.wrap{grid-template-columns:1fr}nav{position:static}nav{display:flex;flex-wrap:wrap;gap:4px}nav h4{width:100%}.row2{grid-template-columns:1fr}.hero ol{columns:1}}
</style></head><body>
${top(c.slug, all)}
<div class="wrap"><nav><h4>Units</h4>${toc}<p class="donecount"></p></nav><main>
<div class="hero" style="background-image:linear-gradient(90deg,rgba(11,18,32,.96) 40%,rgba(11,18,32,.6)),url(${img('c-' + c.slug) || img('a-' + c.domain.toLowerCase().replace(/[^a-z0-9]+/g, '-'))});background-size:cover;background-position:center"><div class="dom">${esc(c.domain)} · ${c.size === 'class' ? 'a class built from an old book' : c.kind === 'found' ? 'built from a free course' : 'a course we wrote'}</div><h1>${esc(c.name)}</h1><p>${esc(c.why)}</p>${c.source ? '<p class="src">From <a href="' + esc(c.source.url) + '" target="_blank" rel="noopener">' + esc(c.source.title) + '</a>, ' + esc(c.source.by) + '. ' + licence(c.source.licence) + '.' + (c.planned > c.units.length ? ' ' + c.units.length + ' of ' + c.planned + ' lectures ready so far.' : '') + '</p>' : ''}<p class="lv">${LEVELS(c)}</p>
${(() => { const outs = (c.outcomes || []).length ? c.outcomes : c.units.map((u) => u.outcome).filter(Boolean); return outs.length ? '<details class="more"><summary>By the end you will be able to...</summary><ol>' + outs.map((o) => '<li>' + esc(o) + '</li>').join('') + '</ol></details>' : ''; })()}</div>
${(c.channels || []).length ? '<h3 style="margin:0 0 12px">Channels for this course</h3><div class="chans">' + c.channels.map(chan).join('') + '</div>' : ''}
${c.units.map((u) => unit(u, c.voices, c)).join('\n')}
</main></div>
${FOOT()}
<script src="crystal.js"></script><script src="scene.js"></script>${c.units.some(shipsLab) ? '<script src="planck.min.js"></script><script src="lab.js"></script>' + [...new Set(c.units.filter(shipsLab).map((u) => u.lab.bench))].map((n) => '<script src="lab-' + esc(n) + '.js"></script>').join('') : ''}
<script>
function seek(el, t) {
  var v = el.closest('.unit').querySelector('video, audio'); if (!v) return;
  v.scrollIntoView({ behavior: 'smooth', block: 'center' });
  var go = function () { v.currentTime = t; v.play(); };
  if (v.readyState < 1) { v.preload = 'metadata'; v.addEventListener('loadedmetadata', go, { once: true }); v.load(); } else go();
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('.chap button, button.qt'); if (b) { seek(b, +b.dataset.t); return; }
  var c = e.target.closest('.qc button'); if (!c) return;
  var q = c.closest('.qq'); if (q.classList.contains('done')) return;
  var a = +q.dataset.a, j = +c.dataset.j; q.classList.add('done');
  q.querySelectorAll('.qc button').forEach(function (x) { var k = +x.dataset.j; if (k === a) x.classList.add('right'); else if (k === j) x.classList.add('wrong'); x.disabled = true; });
  q.querySelector('.qr').textContent = j === a ? 'Right.' : 'Not quite.';
  q.querySelector('.qr').className = 'qr ' + (j === a ? 'ok' : 'no');
  q.querySelector('.qa').hidden = false;
  var z = q.closest('.quiz'), all = z.querySelectorAll('.qq'), done = z.querySelectorAll('.qq.done');
  if (all.length === done.length) { var r = z.querySelectorAll('.qc .right:not(:disabled), .qq.done').length; var n = 0; all.forEach(function (x) { if (x.querySelector('.qr.ok')) n++; }); var sEl = z.querySelector('.qs'); sEl.textContent = 'You got ' + n + ' of ' + all.length + '. Missed one? The quote under it shows where the lecture says it.'; sEl.hidden = false; }
});
// Keeping your place: which units you marked done and the last unit you looked at, kept in this browser only.
var VU = { get: function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
var SLUG = ${JSON.stringify(c.slug)}, CNAME = ${JSON.stringify(c.name)};
function paintDone() {
  var d = VU.get('vu:done', {})[SLUG] || [];
  document.querySelectorAll('.unit').forEach(function (u) { var on = d.indexOf(+u.id.slice(1)) >= 0; u.classList.toggle('isdone', on); u.querySelector('.donebtn').textContent = on ? 'Done. Tap to undo' : 'Mark this unit done'; });
  document.querySelectorAll('.wrap nav a').forEach(function (a) { a.classList.toggle('isdone', d.indexOf(+a.getAttribute('href').slice(2)) >= 0); });
  document.querySelector('.donecount').textContent = d.length ? d.length + ' of ' + document.querySelectorAll('.unit').length + ' units done (kept in this browser only)' : '';
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('.donebtn'); if (!b) return;
  var all = VU.get('vu:done', {}), d = all[SLUG] || [], n = +b.closest('.unit').id.slice(1), i = d.indexOf(n);
  if (i >= 0) d.splice(i, 1); else d.push(n);
  all[SLUG] = d; VU.set('vu:done', all); paintDone();
});
paintDone();
if ('IntersectionObserver' in window) {
  var seen = new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) VU.set('vu:last', { slug: SLUG, name: CNAME, n: +x.target.id.slice(1), title: x.target.querySelector('h2').textContent }); }); }, { rootMargin: '-40% 0px -40% 0px' });
  document.querySelectorAll('.unit').forEach(function (u) { seen.observe(u); });
}
</script>
</body></html>`;
}

// The front page (Bryan, 15 Nov 2026): rows by area like voidtv.net, each whole course one card; the mind's
// mechanisms as a row of small cards any course can use; the found channels beside the courses they go with; every
// area in a grid below. The look is a university's (Bryan: "its currently not correct for university"): navy and
// parchment, brass, a serif face, photographs on every card. Photos are CC0, each recorded in img/images.json.
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">';
const CARDCSS = `.card{flex:0 0 auto;display:flex;flex-direction:column;border-radius:8px;overflow:hidden;background:var(--panel);border:1px solid var(--line);text-decoration:none;color:var(--fg);transition:transform .18s ease,border-color .18s ease}
.card:hover,.card:focus-visible{transform:translateY(-3px);border-color:var(--gold);outline:none}
.card .ph{background:#0a101c;overflow:hidden}.card .ph img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}.card:hover .ph img{transform:scale(1.04)}
.card .t{padding:14px 16px 16px;display:flex;flex-direction:column;gap:4px}
.card small{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
.card b{font-family:Fraunces,Georgia,serif;font-weight:600;line-height:1.2}
.card span{color:#cfd3dc;font-size:14px;line-height:1.45}
.course{width:340px}.course .ph{aspect-ratio:16/10}.course b{font-size:24px}
.mini{width:220px}.mini .ph{aspect-ratio:4/3}.mini b{font-size:18px}.mini span{font-size:13px}
.chan{width:300px}.chan .ph{aspect-ratio:16/9}.chan b{font-size:19px}.chan span{font-size:13px}`;
const BASE = `:root{--bg:#0b1220;--panel:#111a2c;--panel2:#17223a;--line:#24304a;--fg:#efe9dc;--dim:#9aa3b5;--acc:#d4b06a;--gold:#d4b06a;--pink:#e08a8f;--ink:#0b1220}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 Inter,system-ui,Segoe UI,Roboto,sans-serif}a{color:var(--acc)}
.serif{font-family:Fraunces,Georgia,serif}
header.top{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;padding:14px 32px;border-bottom:1px solid var(--line);background:#0a101c}
.crest{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--fg)}
.crest svg{width:34px;height:34px;flex:none}
.crest span{white-space:nowrap}.crest b{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:19px;letter-spacing:.14em;text-transform:uppercase}
.crest small{display:block;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);margin-top:1px}
.nav{display:flex;gap:4px;flex-wrap:wrap;margin-left:auto;position:static;align-items:center}
.navall{position:relative}.navall summary{cursor:pointer;list-style:none;font-size:14px;padding:6px 12px;border-radius:6px;color:var(--fg);border:1px solid var(--line)}.navall summary::-webkit-details-marker{display:none}.navall summary:hover{border-color:var(--gold)}
.navlist{position:absolute;right:0;top:calc(100% + 8px);z-index:30;width:min(640px,calc(100vw - 40px));max-height:70vh;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px 18px;padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 18px 40px rgba(0,0,0,.5)}
@media (max-width:1000px){header.top{position:relative}.navall{position:static}.navlist{left:20px;right:20px;width:auto}}
.navlist h5{margin:0 0 4px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--acc)}.navlist a,.navlist b{display:block;padding:4px 0;font-size:14px}
.nav a,.nav b{font-size:14px;padding:6px 12px;border-radius:6px;text-decoration:none;color:var(--dim)}
.nav a:hover{color:var(--fg);background:var(--panel2)}.nav b{color:var(--gold);font-weight:600}
.draft{font-size:12px;color:var(--gold);border:1px solid #5a4a24;padding:3px 9px;border-radius:999px}
footer{max-width:1400px;margin:0 auto;padding:30px 32px 44px;color:var(--dim);font-size:14px;border-top:1px solid var(--line)}
footer a{color:var(--gold)}`;
const CREST = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2 L36 8 V20 C36 30 28 36 20 38 C12 36 4 30 4 20 V8 Z" fill="#132038" stroke="#d4b06a" stroke-width="1.6"/><path d="M11 15 h18 M11 20 h18 M11 25 h12" stroke="#d4b06a" stroke-width="1.6" stroke-linecap="round"/><circle cx="27" cy="26" r="3" fill="none" stroke="#efe9dc" stroke-width="1.4"/></svg>';
// The old-knowledge shelf (scripts/uni.js shelf): old public-domain how-to books, the plain modern English beside the
// words as scanned. A book shows once a chapter is rewritten; the public copy carries only books marked live in
// list.json ("shelf": [{ id, live }]).
const SHELFBOOKS = (() => {
  const dir = path.join(DIR, 'shelf');
  if (!fs.existsSync(dir)) return [];
  const live = new Set(((JSON.parse(fs.readFileSync(path.join(DIR, 'list.json'), 'utf8')).shelf) || []).filter((x) => x.live).map((x) => x.id));
  // a book also goes public when a live class reads its chapters, so a class never links to a page that is not there
  const L = JSON.parse(fs.readFileSync(path.join(DIR, 'list.json'), 'utf8'));
  const liveCourses = new Set((L.courses || []).filter((c) => c.live).map((c) => c.slug));
  const readBy = new Set();
  for (const f of fs.readdirSync(path.join(DIR, 'courses')).filter((x) => x.endsWith('.json'))) { const c = JSON.parse(fs.readFileSync(path.join(DIR, 'courses', f), 'utf8')); if (liveCourses.has(c.slug)) for (const u of c.units || []) if (u.reading) readBy.add(u.reading.shelf); }
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'warnings.json').map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .map((b) => ({ ...b, slug: 'shelf-' + b.source, name: b.title, chapters: b.chapters.map((c) => ({ ...c, passages: c.passages.filter((p) => p.plain) })).filter((c) => c.passages.length) }))
    .filter((b) => b.chapters.length && (!LIVE || live.has(b.source) || readBy.has(b.source)));
})();
function shelfPage(b, all) {
  const toc = b.chapters.map((c) => '<a href="#c' + c.n + '"><span>' + c.n + '</span>' + esc(c.title) + '</a>').join('');
  const chapters = b.chapters.map((c) => '<section class="chap" id="c' + c.n + '"><h2><span class="n">' + c.n + '</span>' + esc(c.title) + '</h2>' + (c.why ? '<p class="why">' + esc(c.why) + '</p>' : '')
    + c.passages.map((p) => '<div class="pair"><div class="plain"><p>' + esc(p.plain) + '</p>'
      + (p.warnings || []).map((w) => '<p class="warn"><b>Do not follow this part as written.</b> ' + esc(w.text) + ' <a href="' + esc(w.url) + '" target="_blank" rel="noopener">' + esc(w.source) + '</a></p>').join('')
      + '</div><details class="old"><summary>As printed in ' + esc(String(b.year)) + '</summary><p>' + esc(p.old) + '</p></details></div>').join('') + '</section>').join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(b.title)} · Void University</title>${FONTS}<style>${BASE}
.swrap{display:grid;grid-template-columns:250px minmax(0,1fr);gap:34px;max-width:1500px;margin:0 auto;padding:26px 32px 60px}
.swrap nav{position:sticky;top:76px;align-self:start;max-height:calc(100vh - 96px);overflow:auto;display:flex;flex-direction:column;gap:2px}
.swrap nav h4{margin:0 0 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.swrap nav a{display:flex;gap:10px;padding:7px 10px;border-radius:6px;color:var(--fg);text-decoration:none;font-size:15px}
.swrap nav a:hover{background:var(--panel)}.swrap nav a span{color:var(--acc);min-width:18px}
.shero{padding:26px 30px;border:1px solid var(--line);border-radius:10px;background:var(--panel);margin-bottom:26px}
.shero .dom{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--acc)}
.shero h1{font-family:Fraunces,Georgia,serif;font-size:40px;margin:8px 0 6px;line-height:1.1}.shero p{margin:6px 0;color:#cfd2dc;font-size:17px;max-width:900px}.shero .src{font-size:14px;color:var(--dim)}.shero a{color:var(--acc)}
.shero .caution{color:var(--gold);font-size:15px;border-left:3px solid var(--gold);padding-left:12px}
.shero .both button{font:inherit;font-size:14px;margin-top:10px;padding:7px 14px;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer}
.chap{margin:0 0 34px}.chap h2{font-family:Fraunces,Georgia,serif;font-size:28px;margin:0 0 6px;display:flex;gap:12px;align-items:baseline}.chap h2 .n{color:var(--acc);font-size:20px}
.chap .why{color:var(--dim);margin:0 0 14px;font-size:16px}
.pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:26px;padding:14px 0;border-top:1px solid var(--line);align-items:start}
.pair .plain p{margin:0;font-size:18px;line-height:1.6}
.pair .warn{margin-top:10px !important;font-size:15px !important;padding:10px 12px;border:1px solid #6b3a3d;background:#221316;border-radius:8px;color:#f0c9cb}.pair .warn a{color:var(--pink)}
.pair .old summary{cursor:pointer;color:var(--dim);font-size:13px;letter-spacing:.06em;text-transform:uppercase}
.pair .old p{margin:8px 0 0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#a9afbf}
@media (max-width:1000px){.swrap{grid-template-columns:1fr;padding:18px 20px 50px}.swrap nav{position:static;flex-direction:row;flex-wrap:wrap;max-height:none}.swrap nav h4{width:100%}.pair{grid-template-columns:1fr;gap:8px}.shero h1{font-size:30px}}
</style></head><body>
${top(b.slug, all)}
<div class="swrap"><nav><h4>Chapters</h4>${toc}</nav><main>
<div class="shero"><div class="dom">${esc(b.area)} · an old book in plain English</div><h1>${esc(b.title)}</h1><p>${esc(b.needIt)}</p>${b.caution ? '<p class="caution">' + esc(b.caution) + '</p>' : ''}
<p class="src">By ${esc(b.by)}, ${esc(String(b.year))}. ${esc(b.licence)}. <a href="${esc(b.scan || b.url)}" target="_blank" rel="noopener">Read the scanned book on the Internet Archive</a>. The plain side is our rewrite: same facts and steps, today's words. The printed side is a machine's reading of the scan, so a few letters are wrong.</p>
<div class="both"><button type="button" id="both">Show the printed words beside every passage</button></div></div>
${chapters}
</main></div>${FOOT()}
<script>
document.getElementById('both').onclick = function () {
  var open = this.dataset.on !== '1'; this.dataset.on = open ? '1' : '';
  document.querySelectorAll('details.old').forEach(function (d) { d.open = open; });
  this.textContent = open ? 'Hide the printed words' : 'Show the printed words beside every passage';
};
</script>
</body></html>`;
}
function top(current, all) {
  // Up to six courses sit in the header as links. More than that (classes and shelf books add up fast) fold into one
  // "All courses" list grouped by area, so the header stays one row at every width.
  const home = '<a href="index.html"' + (current === 'home' ? ' aria-current="page"' : '') + '>Home</a>';
  const link = (o) => (o.slug === current ? '<b>' + esc(o.name) + '</b>' : '<a href="' + esc(o.slug) + '.html">' + esc(o.name) + '</a>');
  const everything = all.concat(SHELFBOOKS);
  let links;
  if (everything.length <= 6) links = home + all.map(link).join('');
  else {
    const here = everything.find((o) => o.slug === current);
    const areas = [...new Set(all.map((o) => o.domain))];
    const groups = areas.map((a) => '<div><h5>' + esc(a) + '</h5>' + all.filter((o) => o.domain === a).map(link).join('') + '</div>').join('')
      + (SHELFBOOKS.length ? '<div><h5>Old books in plain English</h5>' + SHELFBOOKS.map(link).join('') + '</div>' : '');
    links = home + (here ? '<b>' + esc(here.name) + '</b>' : '') + '<details class="navall"><summary>All courses</summary><div class="navlist">' + groups + '</div></details>';
  }
  return '<header class="top"><a class="crest" href="index.html">' + CREST + '<span><b>Void University</b><small>learn from people who did it</small></span></a><nav class="nav">' + links + '</nav>' + DRAFT + '</header>';
}
const IMG = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'img', 'images.json'), 'utf8')); } catch (e) { return {}; } })();
const img = (name) => IMG[name] ? IMG[name].file : '';
// Open Yale's terms (read 15 Nov 2026 at oyc.yale.edu/terms): credit the teacher and Yale, link the course page, and
// include the Creative Commons licence. So every CC licence on a page links to its own deed.
const licence = (l) => { const m = /CC (BY(?:-NC)?(?:-SA|-ND)?) (\d\.\d)/.exec(String(l || '')); return m ? '<a href="https://creativecommons.org/licenses/' + m[1].toLowerCase() + '/' + m[2] + '/" target="_blank" rel="noopener license">' + esc(l) + '</a>' : esc(l); };
const LEVELNAME = { 'high school': 'High school', 'young adults': 'Young adults', everyday: 'Everyday life' };
const LEVELS = (c) => (c.levels || []).map((l) => '<span>' + esc(LEVELNAME[l] || l) + '</span>').join('');
const FOOT = () => `<footer>Free, no account. Lessons play from the Internet Archive; each piece names its source and licence. Photos are public domain (CC0); <a href="credits.html">who took them</a>.<br>
If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world. <a href="${DONATE}" target="_blank" rel="noopener">Donate to CASH</a></footer>`;
function chan(x) {
  return '<a class="card chan" href="' + esc(x.url) + '" target="_blank" rel="noopener"><div class="ph"><img loading="lazy" src="' + esc(x.thumb) + '" alt=""></div><div class="t"><small>Channel · ' + esc(x.count) + '</small><b>' + esc(x.name) + '</b><span>' + esc(x.what) + '</span></div></a>';
}
function home(all, list) {
  const full = all.filter((c) => c.shelf !== 'supplement');
  const sup = all.filter((c) => c.shelf === 'supplement');
  const card = (c) => '<a class="card course" data-slug="' + esc(c.slug) + '" data-units="' + c.units.length + '" data-lv="' + esc((c.levels || []).join('|')) + '" href="' + esc(c.slug) + '.html"><div class="ph"><img src="' + (img('c-' + c.slug) || img('a-' + c.domain.toLowerCase().replace(/[^a-z0-9]+/g, '-'))) + '" alt=""></div><div class="t"><small>' + esc(c.domain) + ' · ' + (c.planned > c.units.length ? c.units.length + ' of ' + c.planned + ' units' : c.units.length + (c.units.length === 1 ? ' unit' : ' units')) + '</small><b>' + esc(c.name) + '</b><span>' + esc(String(c.why).split('. ')[0].replace(/\.$/, '')) + '.</span></div></a>';
  const mini = (c, u) => '<a class="card mini" href="' + esc(c.slug) + '.html#u' + u.n + '"><div class="ph"><img loading="lazy" src="' + img('m' + u.n) + '" alt=""></div><div class="t"><b>' + esc(u.title) + '</b><span>' + esc(u.scene ? u.scene.analogy : '') + '</span></div></a>';
  const row = (title, note, cards) => '<section class="row"><h2><span>' + esc(title) + '</span>' + (note ? '<small>' + esc(note) + '</small>' : '') + '</h2><div class="rowwrap"><button class="arrow l" aria-label="Back">&#8249;</button><div class="track">' + cards + '</div><button class="arrow r" aria-label="More">&#8250;</button></div></section>';
  const seen = new Set();
  const chans = (cs) => cs.flatMap((c) => c.channels || []).filter((x) => !seen.has(x.url) && seen.add(x.url));
  const rows = list.types.map((t) => {
    const cs = full.filter((c) => c.domain === t);
    if (!cs.length) return '';
    const ss = t === 'Mind' ? sup : [];
    const ch = chans(cs.concat(ss));
    return row(t, cs.length + (cs.length === 1 ? ' course' : ' courses'), cs.map(card).join(''))
      + ss.map((c) => row(c.name, 'short pieces any course can use', c.units.map((u) => mini(c, u)).join(''))).join('')
      + (ch.length ? row('Channels for ' + t, 'whole series on the Internet Archive that go with these courses', ch.map(chan).join('')) : '');
  }).join('');
  const shelfRow = SHELFBOOKS.length ? row('Old books in plain English', 'useful old how-to, with the printed words beside it', SHELFBOOKS.map((b) => '<a class="card course" data-lv="' + esc((b.levels || []).join('|')) + '" href="' + esc(b.slug) + '.html"><div class="ph"><img src="' + img('a-' + String(b.area).toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '" alt=""></div><div class="t"><small>' + esc(b.area) + ' · printed ' + esc(String(b.year)) + ' · ' + b.chapters.length + ' chapters</small><b>' + esc(b.title) + '</b><span>' + esc(b.needIt) + '</span></div></a>').join('')) : '';
  const tiles = list.types.map((t) => {
    const n = full.filter((c) => c.domain === t).length; // same count as the row: the mechanisms shelf is not a course
    return '<div class="area' + (n ? ' has' : '') + '"><img loading="lazy" src="' + img('a-' + t.toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '" alt=""><div><b>' + esc(t) + '</b><small>' + (n ? n + (n === 1 ? ' course' : ' courses') : 'coming') + '</small></div></div>';
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Void University</title>
${FONTS}
<style>
${BASE}
.hero{position:relative;min-height:340px;display:flex;align-items:flex-end;border-bottom:1px solid var(--line);overflow:hidden}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.75) brightness(.55)}
.hero::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,18,32,.15) 0%,rgba(11,18,32,.65) 60%,var(--bg) 100%)}
.hero div{position:relative;z-index:1;max-width:1400px;width:100%;margin:0 auto;padding:40px 32px 34px}
.hero .kick{font-size:13px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold)}
.hero h1{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:48px;line-height:1.08;margin:10px 0 12px;max-width:820px}
.hero p{margin:0;color:#e4ddcc;font-size:19px;max-width:680px}
main{max-width:1400px;margin:0 auto;padding:6px 12px 28px}
h2{margin:34px 20px 12px;display:flex;align-items:baseline;gap:14px;border-bottom:1px solid var(--line);padding-bottom:8px}
h2 span{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:24px}h2 small{color:var(--dim);font-size:14px;font-weight:400}
.rowwrap{position:relative;padding:0 20px}
.track{display:flex;gap:18px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;padding:6px 4px 14px;scrollbar-width:none;scroll-behavior:smooth}.track::-webkit-scrollbar{display:none}
${CARDCSS}
.arrow{position:absolute;top:42%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:1px solid var(--gold);background:rgba(11,18,32,.92);color:var(--gold);font-size:28px;line-height:40px;padding:0;cursor:pointer;z-index:2;box-shadow:0 2px 12px rgba(0,0,0,.6)}
.arrow.l{left:-2px}.arrow.r{right:-2px}.arrow:hover{background:var(--gold);color:var(--ink)}.arrow[hidden]{display:none}
@media(hover:none){.arrow{display:none}}
.who{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:26px 20px 0}.who>span{font-family:Fraunces,Georgia,serif;font-size:18px;margin-right:6px}
.who button{font:inherit;font-size:14px;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:999px;padding:7px 14px;cursor:pointer}.who button.on{border-color:var(--gold);color:var(--gold)}
.who small{flex-basis:100%;color:var(--dim);font-size:13px}
#find{font:inherit;font-size:15px;margin-left:auto;min-width:260px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--fg)}#find:focus{outline:none;border-color:var(--gold)}
#found,#resume{margin:14px 20px 0;padding:12px 16px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
#found a{display:block;padding:6px 0;color:var(--fg);text-decoration:none;border-bottom:1px solid var(--line)}#found a:last-child{border-bottom:0}#found a small{color:var(--acc);margin-right:10px}#found a:hover b{color:var(--gold)}#found p{margin:0;color:var(--dim)}
#resume{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline}#resume[hidden]{display:none}#resume span{color:var(--dim);font-size:14px}#resume a{color:var(--gold);font-family:Fraunces,Georgia,serif;font-size:18px;text-decoration:none}
.card .prog{font-style:normal;font-size:12px;color:#8fd6aa}
@media (max-width:1000px){#find{margin-left:0;flex-basis:100%}}
.course.off{display:none}
.areas{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;padding:0 20px}
.area{position:relative;border-radius:8px;overflow:hidden;aspect-ratio:16/10;border:1px solid var(--line)}
.area img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:grayscale(1) brightness(.45)}
.area.has img{filter:saturate(.85) brightness(.6)}.area.has{border-color:var(--gold)}
.area div{position:absolute;left:0;right:0;bottom:0;padding:12px 14px;background:linear-gradient(0deg,rgba(11,18,32,.92),rgba(11,18,32,0))}
.area b{display:block;font-family:Fraunces,Georgia,serif;font-size:19px;font-weight:600}.area small{color:var(--dim);font-size:13px}.area.has small{color:var(--gold)}
@media(max-width:900px){.hero h1{font-size:36px}.course{width:290px}}
</style></head><body>
${top('home', all)}
<div class="hero"><img src="${img('a-mind')}" alt=""><div><div class="kick">Free courses · no account</div><h1>Big ideas, shown with everyday things.</h1><p>Each lesson starts from something you already know, then shows you the bigger idea working the same way.</p></div></div>
<main><div class="who"><span>Who is it for?</span><button class="on" data-lv="">Everyone</button><button data-lv="high school">High school</button><button data-lv="young adults">Young adults</button><button data-lv="everyday">Everyday life</button><input type="search" id="find" placeholder="Find a course or a lesson" aria-label="Find a course or a lesson"><small>Everyday life: not for a job in the field, just useful for living, deciding and understanding people.</small></div>
<div id="found" hidden></div><div id="resume" hidden></div>
${rows}
${shelfRow}
<h2><span>Every area</span><small>more courses are on the way</small></h2><div class="areas">${tiles}</div></main>
${FOOT()}
<script>
document.querySelectorAll('.who button').forEach(function (b) {
  b.onclick = function () {
    document.querySelectorAll('.who button').forEach(function (x) { x.classList.toggle('on', x === b); });
    var lv = b.dataset.lv;
    document.querySelectorAll('.card.course').forEach(function (c) { c.classList.toggle('off', !!lv && (c.dataset.lv || '').split('|').indexOf(lv) < 0); });
    // an area whose courses are all filtered out hides its whole row (and the shelf or channels rows under it)
    var gone = false;
    document.querySelectorAll('section.row').forEach(function (r) { if (r.querySelector('.card.course')) gone = !r.querySelector('.card.course:not(.off)'); r.hidden = gone; });
  };
});
document.querySelectorAll('.rowwrap').forEach(function (w) {
  var t = w.querySelector('.track'), l = w.querySelector('.arrow.l'), r = w.querySelector('.arrow.r');
  function upd() { l.hidden = t.scrollLeft < 4; r.hidden = t.scrollLeft + t.clientWidth >= t.scrollWidth - 4; }
  l.onclick = function () { t.scrollLeft -= t.clientWidth * 0.8; }; r.onclick = function () { t.scrollLeft += t.clientWidth * 0.8; };
  t.addEventListener('scroll', upd); window.addEventListener('resize', upd); upd();
});
// Find a course or a lesson: every word typed must be in the course name, the lesson title or its "why you need this".
var IDX = ${JSON.stringify(all.flatMap((c) => c.units.map((u) => [c.slug + '.html#u' + u.n, c.name, u.title, (u.needIt || '').toLowerCase()])).concat(SHELFBOOKS.flatMap((b) => b.chapters.map((x) => [b.slug + '.html#c' + x.n, b.title, x.title, (x.why || '').toLowerCase()])))).replace(/</g, '\\u003c')};
var find = document.getElementById('find'), found = document.getElementById('found');
function text(el, t) { el.textContent = t; return el; }
find.addEventListener('input', function () {
  var q = find.value.toLowerCase().split(/\\s+/).filter(Boolean);
  found.innerHTML = '';
  if (!q.length) { found.hidden = true; return; }
  var hits = IDX.filter(function (r) { var hay = (r[1] + ' ' + r[2] + ' ' + r[3]).toLowerCase(); return q.every(function (w) { return hay.indexOf(w) >= 0; }); }).slice(0, 12);
  hits.forEach(function (r) { var a = document.createElement('a'); a.href = r[0]; a.appendChild(text(document.createElement('small'), r[1])); a.appendChild(text(document.createElement('b'), r[2])); found.appendChild(a); });
  if (!hits.length) found.appendChild(text(document.createElement('p'), 'Nothing here on that yet.'));
  found.hidden = false;
});
// Your place, kept in this browser only: the unit you last looked at, and how many units of each course you marked done.
(function () {
  var get = function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  var last = get('vu:last', null), done = get('vu:done', {}), box = document.getElementById('resume');
  if (last && document.querySelector('.card.course[data-slug="' + String(last.slug).replace(/[^a-z0-9-]/g, '') + '"]')) {
    box.appendChild(text(document.createElement('span'), 'Pick up where you left off:'));
    var a = document.createElement('a'); a.href = String(last.slug).replace(/[^a-z0-9-]/g, '') + '.html#u' + (+last.n || 1); text(a, last.name + ': ' + last.title); box.appendChild(a);
    box.appendChild(text(document.createElement('span'), '(kept in this browser only)'));
    box.hidden = false;
  }
  document.querySelectorAll('.card.course[data-slug]').forEach(function (c) {
    var d = (done[c.dataset.slug] || []).length; if (!d) return;
    var i = document.createElement('i'); i.className = 'prog'; i.textContent = d + ' of ' + c.dataset.units + ' done'; c.querySelector('.t').appendChild(i);
  });
})();
</script>
</body></html>`;
}
function credits(all) {
  const rows = Object.keys(IMG).map((k) => { const x = IMG[k]; return '<tr><td><img src="' + esc(x.file) + '" alt=""></td><td>' + esc(x.title || 'Untitled') + '</td><td>' + esc(x.creator || 'unknown') + '</td><td>' + esc(x.license) + '</td><td><a href="' + esc(x.page) + '" target="_blank" rel="noopener">' + esc(x.source) + '</a></td></tr>'; }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Photo credits · Void University</title>${FONTS}<style>${BASE}
main{max-width:1100px;margin:0 auto;padding:30px 32px}h1{font-family:Fraunces,Georgia,serif}table{width:100%;border-collapse:collapse;font-size:14px}td{border-bottom:1px solid var(--line);padding:8px;vertical-align:middle}td img{width:96px;height:60px;object-fit:cover;border-radius:4px;display:block}</style></head><body>
${top('credits', all)}<main><h1>Photo credits</h1><p>Every photo here is public domain (CC0), found through Openverse. We list who took each one anyway, with a link to where it came from.</p><table>${rows}</table>${all.some((c) => c.units.some(shipsLab)) ? '<h1>Lab physics</h1><p>Things in the labs fall, roll and bounce using Planck.js by Erin Catto and Ali Shakiba, free to use under the <a href="planck-LICENSE.txt">MIT licence</a>. The labs themselves are our own work.</p>' : ''}</main>${FOOT()}</body></html>`;
}

// Start from an empty folder: a page left from an earlier build (a course since taken off Live) would otherwise deploy.
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.join(DIR, 'crystal.js'), path.join(OUT, 'crystal.js'));
fs.copyFileSync(path.join(DIR, 'scene.js'), path.join(OUT, 'scene.js'));
// A lab is on a page when the unit has one; the public copy carries only labs marked live.
const shipsLab = (u) => !!(u.lab && (!LIVE || u.lab.live));
const LIVE_SLUGS = new Set((JSON.parse(fs.readFileSync(path.join(DIR, 'list.json'), 'utf8')).courses || []).filter((c) => c.live).map((c) => c.slug));
const courses = fs.readdirSync(path.join(DIR, 'courses')).filter((f) => f.endsWith('.json'));
// The preview (never the public copy) also shows each whole local draft (scripts/uni.js draft) inside its course,
// marked in its title, so a draft can be read and watched as a page before it is kept.
const withDrafts = (c) => {
  const dir = path.join(DIR, 'drafts');
  if (LIVE || !fs.existsSync(dir)) return c;
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(c.slug + '-') && x.endsWith('.json'))) {
    let d = null; try { d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
    if (!d || !d.ok || !d.unit || c.units.some((u) => u.n === d.unit.n)) continue;
    c.units.push({ ...d.unit, title: 'Draft, not kept yet: ' + d.unit.title });
  }
  c.units.sort((a, b) => a.n - b.n);
  return c;
};
const loaded = courses.map((f) => withDrafts(JSON.parse(fs.readFileSync(path.join(DIR, 'courses', f), 'utf8'))))
  .sort((a, b) => (a.slug === 'critical-thinking' ? -1 : b.slug === 'critical-thinking' ? 1 : 0))
  // A course shows once it has a unit (a scaffold is only a plan). The public copy (--site) carries only the courses
  // Bryan marked live in list.json, so a draft another chat is working on never ships with someone else's deploy.
  .filter((c) => c.units.length && (!LIVE || LIVE_SLUGS.has(c.slug)));
// The lab engine and its physics library go in the public copy only when a live course has a live lab.
if (loaded.some((c) => c.units.some(shipsLab))) {
  // Only the benches a shipped lab uses: a draft bench never rides along in the public copy.
  const used = new Set(loaded.flatMap((c) => c.units.filter(shipsLab).map((u) => 'lab-' + u.lab.bench + '.js')).concat('lab.js'));
  for (const f of fs.readdirSync(DIR).filter((f) => used.has(f))) fs.copyFileSync(path.join(DIR, f), path.join(OUT, f));
  for (const f of ['planck.min.js', 'planck-LICENSE.txt']) fs.copyFileSync(path.join(DIR, 'vendor', f), path.join(OUT, f));
}
MECH = loaded.find((c) => c.shelf === 'supplement') || null;
for (const c of loaded) if (c.shelf !== 'supplement') for (const u of c.units) for (const n of u.mechanisms || []) (USED[n] = USED[n] || []).push({ slug: c.slug, course: c.name, n: u.n, title: u.title });
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
for (const k of Object.keys(IMG)) fs.copyFileSync(path.join(DIR, IMG[k].file), path.join(OUT, IMG[k].file));
fs.writeFileSync(path.join(OUT, 'credits.html'), credits(loaded));
fs.writeFileSync(path.join(OUT, 'index.html'), home(loaded, JSON.parse(fs.readFileSync(path.join(DIR, 'list.json'), 'utf8'))));
for (const b of SHELFBOOKS) {
  fs.writeFileSync(path.join(OUT, b.slug + '.html'), shelfPage(b, loaded));
  console.log(b.slug + ': ' + b.chapters.length + ' chapters, ' + b.chapters.reduce((a, c) => a + c.passages.length, 0) + ' passages');
}
for (const c of loaded) {
  const html = page(c, loaded);
  fs.writeFileSync(path.join(OUT, c.slug + '.html'), html);
  const n = c.units.reduce((a, u) => a + (u.main ? 1 : 0) + (u.companions || []).length, 0);
  const held = c.units.reduce((a, u) => a + [u.main, ...(u.companions || [])].filter((p) => p && p.hold).length, 0);
  console.log(c.slug + ': ' + c.units.length + ' units, ' + n + ' pieces (' + held + ' on hold) -> ' + path.relative(process.cwd(), path.join(OUT, c.slug + '.html')));
}
