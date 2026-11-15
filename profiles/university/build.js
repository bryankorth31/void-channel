// Void University, first slice (15 Nov 2026): turns each course file in profiles/university/courses/ into one
// static page in profiles/university/site-preview/. Nothing is downloaded: video and audio play straight from the
// Internet Archive, the same way voidtv.net plays its shows.
//   node profiles/university/build.js      then open profiles/university/site-preview/index.html
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, 'site-preview');
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

function unit(u, voices, c) {
  const who = (u.voices || []).map((k) => voices[k]).filter(Boolean)
    .map((v) => '<li><b>' + esc(v.name) + '</b>, ' + esc(v.what.toLowerCase()) + '. ' + esc(v.did) + '</li>').join('');
  return '<section class="unit" id="u' + u.n + '">'
    + '<div class="uh"><span class="n">' + u.n + '</span><div><h2>' + esc(u.title) + '</h2><div class="out">You will be able to: ' + esc(u.outcome) + '</div></div></div>'
    + '<div class="seed"><h3>Why it matters</h3><p>' + esc(u.why) + '</p></div>'
    + '<div class="seed reach"><h3>How this reaches you</h3><p>' + esc(u.reachesYou) + '</p></div>'
    + '<div class="pieces">' + piece(u.main, true) + (u.companions || []).map((c) => piece(c, false)).join('') + '</div>'
    + crystal(c, u)
    + '<div class="row2"><div class="do"><h3>Do this week</h3><p>' + esc(u.do) + '</p></div>'
    + '<div class="who"><h3>Who teaches this unit</h3><ul>' + who + '</ul></div></div>'
    + '</section>';
}

function page(c) {
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
@media (max-width:1000px){.wrap{grid-template-columns:1fr}nav{position:static}nav{display:flex;flex-wrap:wrap;gap:4px}nav h4{width:100%}.row2{grid-template-columns:1fr}.hero ol{columns:1}}
</style></head><body>
<header><span class="logo">VOID <i>University</i></span><span class="tag">learn from people who did it</span><span class="draft">Draft for Bryan: nothing here is public</span></header>
<div class="wrap"><nav><h4>Units</h4>${toc}</nav><main>
<div class="hero"><div class="dom">${esc(c.domain)} · a course we wrote</div><h1>${esc(c.name)}</h1><p>${esc(c.why)}</p>
<h3 style="margin-top:16px">By the end you will be able to</h3><ol>${c.outcomes.map((o) => '<li>' + esc(o) + '</li>').join('')}</ol></div>
${c.units.map((u) => unit(u, c.voices, c)).join('\n')}
</main></div>
<footer>Free, no account. Everything plays from the Internet Archive; each piece names its source and licence.<br>
If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world. <a href="${DONATE}" target="_blank" rel="noopener">Donate to CASH</a></footer>
<script src="crystal.js"></script>
</body></html>`;
}

fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.join(DIR, 'crystal.js'), path.join(OUT, 'crystal.js'));
const courses = fs.readdirSync(path.join(DIR, 'courses')).filter((f) => f.endsWith('.json'));
for (const f of courses) {
  const c = JSON.parse(fs.readFileSync(path.join(DIR, 'courses', f), 'utf8'));
  const html = page(c);
  fs.writeFileSync(path.join(OUT, c.slug + '.html'), html);
  if (courses.length === 1 || c.slug === 'critical-thinking') fs.writeFileSync(path.join(OUT, 'index.html'), html);
  const n = c.units.reduce((a, u) => a + 1 + (u.companions || []).length, 0);
  const held = c.units.reduce((a, u) => a + [u.main, ...(u.companions || [])].filter((p) => p.hold).length, 0);
  console.log(c.slug + ': ' + c.units.length + ' units, ' + n + ' pieces (' + held + ' on hold) -> ' + path.relative(process.cwd(), path.join(OUT, c.slug + '.html')));
}
