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
const DRAFT = LIVE ? '' : '<span class="draft">Draft for Bryan: nothing here is public</span><label class="lookpick">Look <select id="lookpick"><option value="classic">Navy and brass (the first look)</option><option value="bright">Bright night</option><option value="daylight">Daylight</option></select></label><label class="lookpick">Type <select id="typepick"><option value="inter">Inter (as it was)</option><option value="hyper">Atkinson Hyperlegible, made for easy reading</option><option value="literata">Literata, a book face</option></select></label><script>(function(){var k="vu:type",h=document.documentElement,s=document.getElementById("typepick"),v=null;try{v=localStorage.getItem(k)}catch(e){}if(v&&s.querySelector("option[value=\'"+v+"\']"))h.dataset.type=v;s.value=h.dataset.type;s.onchange=function(){h.dataset.type=s.value;try{localStorage.setItem(k,s.value)}catch(e){}}})()</script><script>(function(){var k="vu:look",h=document.documentElement,s=document.getElementById("lookpick"),v=null;try{v=localStorage.getItem(k)}catch(e){}if(v&&s.querySelector("option[value=\'"+v+"\']"))h.dataset.look=v;s.value=h.dataset.look;s.onchange=function(){h.dataset.look=s.value;try{localStorage.setItem(k,s.value)}catch(e){}}})()</script>';
const DONATE = 'https://square.link/u/dJioBmlW'; // CASH, one setting for this profile

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fileUrl = (p) => p.item && p.file ? 'https://archive.org/download/' + encodeURIComponent(p.item) + '/' + encodeURIComponent(p.file) : null;
const pageUrl = (p) => p.item ? 'https://archive.org/details/' + encodeURIComponent(p.item) : null;
// In-copyright books (Bryan, 15 Nov 2026: "keep the books"): we send people to a library copy, never an upload.
const libraryUrl = (p) => 'https://search.worldcat.org/search?q=' + encodeURIComponent(p.title + ' ' + String(p.by || '').replace(/\s*\(.*\)\s*$/, ''));
const mins =(s) => s ? Math.round(s / 60) + ' min' : '';
const ROLE = { watch: 'Watch', listen: 'Listen', read: 'Read', do: 'Do', train: 'Train it' };
// Practice sites (Bryan, 20 Nov 2026: "Yes, link it"): Mind Gym stays on its own site, so people keep the records
// their browser saved there; the University links to it. list.json "practice" holds the address and the rooms in one
// place. A unit companion { "role": "train", "room": "<room id>" } becomes a "Train it" piece that opens that room.
const PRACTICE = JSON.parse(fs.readFileSync(path.join(DIR, 'list.json'), 'utf8')).practice || [];
function trainPiece(p) {
  for (const g of PRACTICE) {
    const r = (g.rooms || []).find((x) => x.id === p.room);
    if (r) return { ...p, title: r.name, by: g.name, note: r.trains + (g.tip ? ' ' + g.tip : ''), roleName: g.label, open: 'Open the ' + (g.word || 'room'),
      // a site that can send people back gets told where they came from: the unit's number, never an address
      url: g.url + (g.open || 'rooms/{id}/').replace('{id}', r.id) + (g.back && p.unit ? '&from=' + g.back + '&unit=' + p.unit : ''),
      licence: g.licence || ('Free on ' + g.name + ', no account; your record stays in your own browser.') };
  }
  throw new Error('train piece names a room no practice site has: ' + p.room);
}

function piece(p, main) {
  if (p.role === 'train') p = trainPiece(p);
  const url = fileUrl(p);
  const meta = [p.by, mins(p.seconds)].filter(Boolean).join(', ');
  const held = !!p.hold;
  let media = '';
  if (!held && url && p.role === 'watch') media = '<video controls preload="none" src="' + esc(url) + '"></video>';
  else if (!held && url && p.role === 'listen') media = '<audio controls preload="none" src="' + esc(url) + '"></audio>';
  else if (!held && p.pointer) media = '<a class="btn" href="' + esc(libraryUrl(p)) + '" target="_blank" rel="noopener">Find it at a library</a>';
  else if (!held && p.role === 'read' && p.url) media = '<a class="btn" href="' + esc(p.url) + '" target="_blank" rel="noopener">Open it</a>';
  else if (!held && p.role === 'train') media = '<a class="btn" href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.open || 'Open the room') + '</a>';
  else if (!held && p.role === 'read' && pageUrl(p)) media = '<a class="btn" href="' + esc(pageUrl(p)) + '" target="_blank" rel="noopener">Open the book</a>';
  return '<div class="piece ' + (main ? 'main' : 'comp') + (held ? ' held' : '') + '">'
    + '<div class="ph"><span class="role r-' + esc(p.role) + '">' + esc(p.roleName || ROLE[p.role] || p.role) + '</span>'
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
function lab(u, c) {
  if (!shipsLab(u)) return ''; // the public copy carries a lab only once it is marked live
  const l = u.lab;
  const map = (l.map || []).map(([a, z]) => '<span><i>' + esc(a) + '</i> = <b>' + esc(z) + '</b></span>').join('');
  const cfg = { bench: l.bench, go: l.go, knobs: l.knobs, rules: l.rules, meet: l.meet, triesNote: l.triesNote, guess: l.guess };
  return '<div class="lab" data-key="' + esc(ruleKey(c, u, 'lab')) + '" data-lab="' + esc(JSON.stringify(cfg)) + '">'
    + '<div class="lab-top"><span class="lab-kick">Lab: if this, then that</span><b>' + esc(l.title) + '</b><p>' + esc(l.ask) + '</p></div>'
    + '<div class="lab-body"><div class="lab-stage"><canvas></canvas></div><div class="lab-side"></div></div>'
    + '<div class="lab-tries"></div><div class="lab-rules"></div>'
    + (map ? '<div class="lab-map">' + map + '</div>' : '')
    + (l.credit ? '<p class="lab-credit">' + esc(l.credit) + '</p>' : '')
    + '</div>';
}

// The scale: measured things in 3D at their true size to each other (scale.js; B, 19 Nov 2026: "3 dimensional visible
// visual explainers to show scale ... that can be rotated and manipulated spatially"). The list, the numbers and the
// sources are plain HTML here, so they read with no 3D at all; scale.js draws the stage and wires the list to it.
const SCALE_COLOR = { plant: '#4fb873', microbe: '#9b8cf0', fungi: '#d79a55', animal: '#58b6e8', people: '#ff6fb5', farm: '#ffc44d', wild: '#6fe0c0', cell: '#ff8f96', rock: '#b9a48a', planet: '#58b6e8', star: '#ffb347', galaxy: '#9b8cf0', span: '#c5cade' };
// 450 with "tonnes of carbon" counted in billions -> "450 billion tonnes of carbon"; 0.007 -> "7 million ..."
function amount(v, unit) {
  if (v === 0) return 'none';
  const n = v * unit.per;
  const say = (x, word) => String(Number(x.toPrecision(2))) + (word ? ' ' + word : '');
  const t = n >= 1e12 ? say(n / 1e12, 'trillion') : n >= 1e9 ? say(n / 1e9, 'billion') : n >= 1e6 ? say(n / 1e6, 'million') : n >= 1e3 ? Number(n.toPrecision(2)).toLocaleString('en-US') : say(n, '');
  return t + ' ' + unit.words;
}
// A length in metres, said in the unit a person would use for it: 8e-6 -> "8 thousandths of a millimetre",
// 1.3914e9 -> "1.39 million km", 9.46e20 -> "100,000 light years".
function length(m) {
  const n = (x) => { const v = Number(x.toPrecision(3)); return v >= 1000 ? v.toLocaleString('en-US') : String(v); };
  const ly = m / 9.4607e15;
  return m < 1e-6 ? n(m * 1e9) + ' millionths of a millimetre' : m < 1e-3 ? n(m * 1e6) + ' thousandths of a millimetre' : m < 1e-2 ? n(m * 1e3) + ' mm' : m < 1 ? n(m * 100) + ' cm'
    : m < 1e3 ? n(m) + ' m' : m < 1e9 ? n(m / 1e3) + ' km' : m < 1e12 ? n(m / 1e9) + ' million km' : m < 1e15 ? n(m / 1e12) + ' billion km'
    : ly < 1e6 ? n(ly) + ' light years' : ly < 1e9 ? n(ly / 1e6) + ' million light years' : n(ly / 1e9) + ' billion light years';
}
// what a thing's number says on the page: an amount in its unit, or a width (a bar is a distance, so it is not "across")
const said = (v, sc, t) => (sc.kind === 'size' ? length(v) + (t.shape === 'bar' ? '' : t.shape === 'tall' ? ' tall' : ' across') : amount(v, sc.unit));
const scalesOf = (u) => (Array.isArray(u.scale) ? u.scale : u.scale ? [u.scale] : []);
// a unit carries one scale block or a list of them; the public copy carries each only once it is marked live
const scaleBlock = (u) => scalesOf(u).filter((sc) => !LIVE || sc.live).map(scaleOne).join('');
function scaleOne(sc) {
  const things = sc.things.map((t) => ({ name: t.name, more: t.more || '', color: SCALE_COLOR[t.group], values: t.values, ...(t.shape ? { shape: t.shape } : {}), ...(t.thick ? { thick: t.thick } : {}) }));
  const cfg = { kind: sc.kind, states: sc.states, things, base: sc.base || null, guess: sc.guess || null, hint: 'Press a name in the list, or turn the stage, to look closer.' };
  const rows = sc.things.map((t) => '<li><button type="button" title="Go to ' + esc(t.name) + ' on the stage"' + sc.states.map((st) => ' data-v' + st.key + '="' + esc(t.values[st.key] === undefined ? 'no measured number for then' : said(t.values[st.key], sc, t)) + '"').join('') + '><i style="background:' + SCALE_COLOR[t.group] + '"></i><b>' + esc(t.name) + '</b><span class="v">' + esc(said(t.values[sc.states[0].key], sc, t)) + '</span></button></li>').join('');
  const states = sc.states.length > 1 ? '<div class="scale-states"><span>When</span>' + sc.states.map((st, i) => '<button type="button" data-state="' + esc(st.key) + '"' + (i ? '' : ' class="on"') + ' title="Show the amounts for: ' + esc(st.name) + '">' + esc(st.name) + '</button>').join('') + '</div>' : '<div class="scale-states" hidden></div>';
  const g = sc.guess ? '<b>Guess first</b><p>' + esc(sc.guess.q) + '</p><div class="opts">' + sc.guess.options.map((o, i) => '<button type="button" data-i="' + i + '">' + esc(o) + '</button>').join('') + '</div><p class="said" hidden></p><button type="button" class="see" hidden>Show me</button>' : '';
  const tools = [['bigger', '&#8249; Bigger', 'Go to the next bigger thing'], ['smaller', 'Smaller &#8250;', 'Go to the next smaller thing'], ['in', '+', 'Zoom in'], ['out', '&#8722;', 'Zoom out'], ['all', 'See all', 'Step back until everything fits']].map(([d, t, tip]) => '<button type="button" data-do="' + d + '" title="' + tip + '" aria-label="' + tip + '">' + t + '</button>').join('');
  const srcs = Object.values(sc.sources).map((x) => '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.by) + ', ' + esc(String(x.year)) + ', ' + esc(x.title) + (x.where ? ', ' + esc(x.where) : '') + '</a>').join('; ');
  return '<div class="scale" data-scale="' + esc(JSON.stringify(cfg)) + '">'
    + '<div class="scale-top"><span class="scale-kick">See the scale</span><b>' + esc(sc.title) + '</b><p>' + esc(sc.ask) + '</p></div>'
    + '<div class="scale-body"><div class="scale-main"><div class="scale-stage" tabindex="0" aria-label="3D stage: ' + esc(sc.title) + '. Drag to turn it, arrow keys also turn it, plus and minus zoom."><canvas></canvas><div class="scale-labels"></div><div class="scale-guess">' + g + '</div><p class="scale-hint">Drag to turn. Pinch, or press the stage and scroll, to zoom. Two fingers or Shift and drag to slide.</p></div>'
    + '<div class="scale-tools">' + tools + '</div><p class="scale-read" aria-live="polite"></p></div>'
    + '<div class="scale-side">' + states + '<p class="scale-statenote"></p><ol class="scale-list">' + rows + '</ol></div></div>'
    + (sc.note ? '<p class="scale-note">' + esc(sc.note) + '</p>' : '')
    + '<p class="scale-src">Where the numbers come from: ' + srcs + '</p>'
    + '</div>';
}

// The explainer: a real system built in 3D from its data file (explain.js, explain-model.js; Bryan, 22 Nov 2026: "i want
// less "thing" and more issues or delemas ... issues ppl cant seem to grasp"). Stores fill and drain from flows; the
// learner drags the choices people argue about, plays the years ahead or replays the measured ones, guesses first and
// finds the rules. The parts, their words, the faders and the sources are plain HTML here, so all of it reads with no 3D.
const shipsExplain = (u) => !!(u.explainer && (!LIVE || u.explainer.live));
function explainBlock(u, c) {
  if (!shipsExplain(u)) return '';
  const ex = u.explainer;
  const srcs = Object.values(ex.sources).map((x) => '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.by) + ', ' + esc(String(x.year)) + ', ' + esc(x.title) + (x.where ? ', ' + esc(x.where) : '') + '</a>').join('; ');
  const partRow = (p, isStore) => '<li><button type="button" data-part="' + esc(p.id) + '" title="What is ' + esc(p.name.toLowerCase()) + '? Press to see it on the world"><i class="t-' + esc(isStore && !p.color ? 'store' : p.color) + '"></i><b>' + esc(p.name) + '</b><span class="v"></span></button><p>' + esc(p.words) + '</p></li>';
  const faders = ex.choices.map((c) => '<label class="ex-fader" title="' + esc(c.tip) + '"><span>' + esc(c.name) + ' <output data-choice="' + esc(c.id) + '">' + esc(String(c.start)) + '</output></span><input type="range" data-choice="' + esc(c.id) + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" value="' + c.start + '" aria-label="' + esc(c.name) + '" title="' + esc(c.tip) + '"></label>').join('');
  const g = ex.guess ? '<div class="ex-guess"><b>Guess first</b><p>' + esc(ex.guess.q) + '</p><div class="opts">' + ex.guess.options.map((o, i) => '<button type="button" data-i="' + i + '" title="Choose this answer, then watch it play out">' + esc(o) + '</button>').join('') + '</div></div>' : '';
  const speeds = [[1, 'Slow', 'One year a second'], [3, 'Steady', 'Three years a second'], [10, 'Fast', 'Ten years a second']].map(([v, t, tip]) => '<button type="button" data-speed="' + v + '" title="' + tip + '">' + t + '</button>').join('');
  return '<div class="ex" data-key="' + esc(ruleKey(c, u, 'ex')) + '" data-ex="' + esc(JSON.stringify(ex)) + '">'
    + '<div class="ex-top"><span class="ex-kick">See how it works</span><b>' + esc(ex.title) + '</b><p>' + esc(ex.ask) + '</p></div>'
    + '<div class="ex-body"><div class="ex-main">'
    + '<div class="ex-stage" tabindex="0" aria-label="3D world: ' + esc(ex.title) + '. Drag to turn it, arrow keys also turn it, plus and minus zoom. Press a place to learn what it is."><canvas></canvas><div class="ex-labels"></div><div class="ex-hud" aria-hidden="true"></div><div class="ex-card" hidden></div>' + g + '<p class="ex-hint">Drag to turn the world. Press the stage, then scroll or pinch to zoom. Press the land, the sea or the air to learn what it does.</p></div>'
    + '<p class="ex-gap" hidden aria-live="polite"></p><p class="ex-say" aria-live="polite"></p></div>'
    + '<div class="ex-side"><div class="ex-col"><div class="ex-faders">' + faders + '</div>'
    + '<div class="ex-play"><button type="button" data-do="play" class="ex-go" title="Run the world forward a year at a time with your settings">Play the years ahead</button><button type="button" data-do="replay" title="Replay the measured years from ' + ex.clock.from + ' to ' + ex.clock.now + '">Replay ' + ex.clock.from + ' to ' + ex.clock.now + '</button><button type="button" data-do="today" title="Go back to ' + ex.clock.now + ' with today\'s settings">Back to today</button><span class="ex-speed">' + speeds + '</span></div></div><div class="ex-col">'
    + '<canvas class="ex-trace" aria-label="The ' + esc(ex.stores[0].name.toLowerCase()) + ' over the years: measured in white, your run in pink"></canvas><div class="ex-balance"></div></div><div class="ex-col">'
    + '<ol class="ex-parts">' + ex.stores.map((p) => partRow(p, true)).join('') + ex.flows.map((p) => partRow(p, false)).join('') + '</ol></div></div></div>'
    + '<div class="ex-rules"></div>'
    + (ex.note ? '<p class="ex-note">' + esc(ex.note) + '</p>' : '')
    + '<p class="ex-src">Where the numbers come from: ' + srcs + '. Each speck is ' + esc(ex.eachWords) + '.' + (ex.world === 'globe' ? ' The Earth picture is NASA Earth Observatory\'s Blue Marble (Reto Stockli); land and sea from Natural Earth.' : ex.world === 'basin' ? ' The ground is NOAA\'s ETOPO1 heights with NASA Earth Observatory\'s Blue Marble (Reto Stockli) laid over it; the rivers are traced downhill over those heights by us.' : '') + '</p>'
    + '</div>';
}

// If this, then that, across the whole University (Bryan, 22 Nov 2026: "id like to bu8ild a ifttt page of many topics to
// show and be useful on and for many many topics"; his Mind Atlas: "a dominoes or ifttt of the worlds levers"). Every
// rule from every lab and explainer that ships, by area, course and unit. A rule's "then" shows once the reader has
// made it happen in its own lab or explainer (remembered in their browser as vu:found, under the rule's key).
const ruleKey = (c, u, kind) => c.slug + '/' + u.n + '/' + kind;
function rulesOf(all) {
  const out = [];
  for (const c of all) for (const u of c.units) {
    const blocks = [];
    if (u.lab && shipsLab(u)) blocks.push(['lab', u.lab, 'lab']);
    if (u.explainer && shipsExplain(u)) blocks.push(['ex', u.explainer, 'explainer']);
    for (const [kind, b, word] of blocks) (b.rules || []).forEach((r, i) => out.push({ area: c.domain, course: c.name, slug: c.slug, n: u.n, unit: u.title.replace(/^Draft, not kept yet: /, ''), title: b.title, word, key: ruleKey(c, u, kind) + '/' + i, if: String(r.if).replace(/[,\s]+$/, ''), then: r.then }));
  }
  return out;
}
function iftttPage(all, list) {
  const rules = rulesOf(all);
  const areas = list.types.filter((t) => rules.some((r) => r.area === t));
  const groups = areas.map((t) => {
    const mine = rules.filter((r) => r.area === t), places = [...new Set(mine.map((r) => r.slug + '#u' + r.n))];
    return '<section class="ra" data-area="' + esc(t) + '" style="--area:' + hue(t) + '"><h2>' + esc(t) + '</h2>' + places.map((p) => {
      const rs = mine.filter((r) => r.slug + '#u' + r.n === p), r0 = rs[0];
      return '<div class="rp"><a class="go" href="' + esc(r0.slug) + '.html#u' + r0.n + '" title="Open the ' + esc(r0.word) + ' and make these happen yourself"><small>' + esc(r0.course) + ', unit ' + r0.n + '</small><b>' + esc(r0.title || r0.unit) + '</b><span>Go and do it</span></a><ul>'
        + rs.map((r) => '<li data-key="' + esc(r.key) + '"><b>If</b> ' + esc(r.if) + ', <b>then</b> <span class="th" hidden>' + esc(r.then) + '</span><i class="tbd">make it happen and see.</i></li>').join('') + '</ul></div>';
    }).join('') + '</section>';
  }).join('');
  const chips = '<button type="button" class="on" data-area="" title="Show the rules from every area">Every area</button>' + areas.map((t) => '<button type="button" data-area="' + esc(t) + '" style="--area:' + hue(t) + '" title="Show only the rules from ' + esc(t) + '">' + esc(t) + '</button>').join('');
  return `<!doctype html><html lang="en" data-look="${LOOK}" data-type="${TYPE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${APPHEAD}<title>If this, then that | Void University</title>${FONTS}<style>${BASE}
main{max-width:1100px;margin:0 auto;padding:30px 24px 60px}
.lead h1{font-family:var(--head);font-size:40px;line-height:1.1;margin:0 0 10px}.lead p{margin:0 0 6px;color:var(--soft);font-size:18px;max-width:760px}
.tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:18px 0 6px}.tools button{font:inherit;font-size:14px;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:999px;padding:7px 14px;cursor:pointer}.tools button.on{border-color:var(--area,var(--gold));color:var(--area,var(--gold))}
#rfind{font:inherit;font-size:15px;margin-left:auto;min-width:240px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--fg)}#rfind:focus{outline:none;border-color:var(--gold)}
.count{margin:10px 0 0;color:var(--dim);font-size:15px}.count b{color:#5fe39a}
.ra{margin:26px 0 0}.ra h2{font-family:var(--head);font-size:24px;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid var(--area)}
.rp{display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px;margin:0 0 14px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
.rp .go{display:flex;flex-direction:column;gap:3px;text-decoration:none;color:var(--fg);padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--deep);align-self:start}.rp .go:hover{border-color:var(--area)}.rp .go small{color:var(--dim);font-size:13px}.rp .go b{font-family:var(--head);font-size:17px}.rp .go span{color:var(--area);font-size:14px;font-weight:600}
.rp ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.rp li{padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:16px;background:var(--deep)}.rp li b{color:var(--gold)}.rp li .tbd{color:var(--dim)}.rp li.found{border-color:rgba(95,227,154,.5)}.rp li[hidden],.ra[hidden],.rp[hidden]{display:none}
@media (max-width:820px){.rp{grid-template-columns:1fr}#rfind{margin-left:0;flex-basis:100%}.lead h1{font-size:32px}}
${LOOKCSS}${TYPECSS}</style></head><body>
${top('ifttt', all)}<main><div class="lead"><h1>If this, then that</h1><p>Every rule you can find in the University, by area. Each "then" stays hidden until you make it happen yourself in its lesson. Press a lesson to go and do it.</p></div>
<div class="tools">${chips}<input type="search" id="rfind" placeholder="Find a rule" aria-label="Find a rule" title="Type a word to show only the rules that use it"></div>
<div class="tools" role="group" aria-label="Which rules"><button type="button" class="on" data-show="all" title="Show every rule">All rules</button><button type="button" data-show="found" title="Show only the rules you have found">Found</button><button type="button" data-show="open" title="Show only the rules you have not found yet">Still to find</button></div>
<p class="count" aria-live="polite"></p>${groups}</main>${FOOT()}
<script>
(function () {
  var had = []; try { had = JSON.parse(localStorage.getItem('vu:found') || '[]'); } catch (e) { had = []; }
  var lis = [].slice.call(document.querySelectorAll('.rp li')), area = '', show = 'all', q = '';
  lis.forEach(function (li) { if (had.indexOf(li.dataset.key) >= 0) { li.classList.add('found'); li.querySelector('.th').hidden = false; li.querySelector('.tbd').hidden = true; } });
  function paint() {
    var n = 0, f = 0;
    lis.forEach(function (li) {
      var a = li.closest('.ra').dataset.area, isF = li.classList.contains('found');
      var on = (!area || a === area) && (show === 'all' || (show === 'found') === isF) && (!q || li.textContent.toLowerCase().indexOf(q) >= 0);
      li.hidden = !on; if (on) { n++; if (isF) f++; }
    });
    document.querySelectorAll('.rp').forEach(function (p) { p.hidden = !p.querySelector('li:not([hidden])'); });
    document.querySelectorAll('.ra').forEach(function (s) { s.hidden = !s.querySelector('.rp:not([hidden])'); });
    var all = lis.filter(function (li) { return li.classList.contains('found'); }).length;
    document.querySelector('.count').innerHTML = '<b>' + all + ' of ' + lis.length + '</b> rules found so far.' + (n !== lis.length ? ' Showing ' + n + '.' : '') + (n === 0 ? ' Nothing matches.' : '');
  }
  document.querySelectorAll('[data-area]').forEach(function (b) { if (b.tagName !== 'BUTTON') return; b.onclick = function () { area = b.dataset.area; document.querySelectorAll('button[data-area]').forEach(function (x) { x.classList.toggle('on', x === b); }); paint(); }; });
  document.querySelectorAll('[data-show]').forEach(function (b) { b.onclick = function () { show = b.dataset.show; document.querySelectorAll('[data-show]').forEach(function (x) { x.classList.toggle('on', x === b); }); paint(); }; });
  document.getElementById('rfind').oninput = function (e) { q = e.target.value.trim().toLowerCase(); paint(); };
  paint();
})();
</script></body></html>`;
}

// The front page's door (Bryan, 22 Nov 2026: "Option A"; docs/LANDING-REVIEW.md). Questions people can guess at, from
// blocks that already ask for a guess: the explainers (their gap worked out here with the same model the page runs)
// and the scale stages. Hooks: a unit may carry "hook", the question that brings someone to it, for the row of things
// people get wrong.
const EXM = require('./explain-model.js');
function doorQuestions(all) {
  const out = [];
  for (const c of all) for (const u of c.units) {
    if (u.explainer && shipsExplain(u) && u.explainer.guess) {
      const ex = u.explainer, g = ex.guess, m = EXM.make(ex);
      const run = m.run(Object.assign({}, ...ex.choices.map((ch) => ({ [ch.id]: ch.start })), g.set), g.years, ex.stores[0].id);
      out.push({ q: g.door || g.q, options: g.options, answer: g.answer, after: EXM.say(g.after, { from: run[0].value, to: run[run.length - 1].value }), href: c.slug + '.html#u' + u.n, go: 'See it happen: ' + ex.title });
    }
    for (const sc of scalesOf(u)) if ((!LIVE || sc.live) && sc.guess) out.push({ q: sc.guess.door || sc.guess.q, options: sc.guess.options, answer: sc.guess.answer, after: sc.guess.after, href: c.slug + '.html#u' + u.n, go: 'See it to scale: ' + sc.title });
  }
  return out;
}
// The Tools row (Bryan, 22 Nov 2026: "i want it to be a place of tools"): what you do, not only watch. Each tool
// links to where it lives; the practice sites (Mind Gym, Body Atlas) open in a new tab.
function toolsRow(all) {
  const ex = []; for (const c of all) for (const u of c.units) if (u.explainer && shipsExplain(u)) ex.push({ c, u });
  const nq = Object.values(recallBank(all)).filter((b) => b.q.length >= 2 || b.crystal).length;
  const tool = (href, mark, name, line, more, ext) => '<a class="tool" href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + ' title="' + esc(name + ': ' + line) + '"><span class="mark ' + mark + '"></span><b>' + esc(name) + '</b><span>' + esc(line) + '</span><i>' + esc(more) + '</i></a>';
  const cards = [];
  if (nq) cards.push(tool('study.html', 'm-study', 'Study together', 'One shared screen, everyone\'s phones. Guess first, see how the room split, let the source settle it.', 'Open a room, ' + nq + ' lessons to study'));
  if (ex.length) cards.push(tool(ex[0].c.slug + '.html#u' + ex[0].u.n, 'm-earth', 'See how it works', 'Real systems in 3D: ' + ex.map((x) => x.u.explainer.title.replace(/^The /, 'the ')).join(', ') + '. Drag the choices, play the years.', ex.length + (ex.length === 1 ? ' explainer' : ' explainers')));
  if (RULES) cards.push(tool('ifttt.html', 'm-rules', 'If this, then that', 'Every rule you can make happen yourself, across every topic. Find them, then see them all.', RULES + ' rules'));
  for (const g of PRACTICE.filter((x) => x.live)) cards.push(tool(g.url, 'm-practice', g.name, g.what || '', g.rooms.length + ' ' + (g.word || 'room') + (g.rooms.length === 1 ? '' : 's'), true));
  return cards.length ? '<section class="tools" id="tools"><h2><span>Tools</span><small>things to do, not only watch</small></h2><div class="toolrow">' + cards.join('') + '</div></section>' : '';
}
function hooksOf(all) {
  const out = [];
  for (const c of all) for (const u of c.units) if (u.hook) {
    const where = u.explainer && shipsExplain(u) ? u.explainer.title : u.lab && shipsLab(u) ? u.lab.title : u.title;
    out.push({ area: c.domain, hook: u.hook, href: c.slug + '.html#u' + u.n, where });
  }
  return out;
}
// Where a quiz answer's quote comes from, said plainly for the study room's screen.
function quoteFrom(c, u, q) {
  if (q.src && u.explainer && u.explainer.sources[q.src]) { const x = u.explainer.sources[q.src]; return x.by + ', ' + x.year; }
  if (q.lesson) return 'the lesson in Body Atlas';
  if (q.ref) return 'the book';
  if (typeof q.t === 'number') return (u.main && u.main.title ? u.main.title : 'the lecture') + ', at ' + clock(q.t);
  return c.name;
}
// What Remember it asks: every quiz question of the lessons that ship, by course and unit (recall.json, fetched by the
// front page only once the reader has marked a lesson done).
function recallBank(all) {
  const out = {};
  for (const c of all) for (const u of c.units) {
    const cr = u.crystal && (u.crystal.partials || []).length >= 3 && u.crystal.key ? { partials: u.crystal.partials, key: u.crystal.key, decoys: (u.crystal.decoys || []).map((d) => ({ text: d.text, why: d.why || '' })), aha: u.crystal.aha || '' } : null;
    if (!(u.quiz || []).length && !cr) continue;
    out[c.slug + '/' + u.n] = { course: c.name, title: u.title.replace(/^Draft, not kept yet: /, ''), q: (u.quiz || []).map((q) => ({ q: q.q, choices: q.choices, a: q.a, why: q.why, quote: q.quote || '', from: quoteFrom(c, u, q) })), ...(cr ? { crystal: cr } : {}) };
  }
  return out;
}

// Study together: a room for one shared screen and everyone's phones (Bryan, 22 Nov 2026: "i want this to be a side
// room ppl can use on void u. i want v u to be more hemn a place to mfind lectures. i want it to be a place of tools").
// study.js runs it; the phones run the phone page in its study mode; the sets are the lessons' own questions.
function studyPage(all) {
  return `<!doctype html><html lang="en" data-look="${LOOK}" data-type="${TYPE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${APPHEAD}<title>Study together | Void University</title>${FONTS}<style>${BASE}
main{max-width:1200px;margin:0 auto;padding:26px 24px 60px}
.lead h1{font-family:var(--head);font-size:38px;line-height:1.1;margin:0 0 8px}.lead p{margin:0 0 16px;color:var(--soft);font-size:18px;max-width:780px}
.room{display:grid;grid-template-columns:260px minmax(0,1fr);gap:20px;align-items:start}
.door2,.panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px}
.door2 .qrbox{background:#fff;border-radius:10px;padding:8px;line-height:0;min-height:20px}.door2 .qrbox:empty{display:none}.door2 .qrbox svg{width:100%;height:auto;display:block}
.door2 .code{font-family:var(--head);font-size:30px;letter-spacing:.06em;color:var(--acc);margin:10px 0 2px}.door2 p{margin:6px 0;font-size:14px;color:var(--soft);overflow-wrap:anywhere}
.btn2{font:inherit;font-size:16px;padding:11px 18px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer}.btn2:hover{border-color:var(--acc)}.btn2.go{background:#ff4f8b;border-color:#ff4f8b;color:#fff;font-weight:700}
#state{font-weight:600;color:var(--fg)}#count{color:var(--gold);font-weight:600}
#find2{font:inherit;font-size:15px;width:100%;padding:9px 14px;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);margin:0 0 12px}
.setgroup h3{font-family:var(--head);font-size:17px;margin:14px 0 6px}.setgroup{display:flex;flex-direction:column;gap:6px}
.setbtn{display:flex;justify-content:space-between;gap:12px;text-align:left;font:inherit;font-size:15px;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer}.setbtn:hover{border-color:var(--acc)}.setbtn small{color:var(--dim);white-space:nowrap}.setbtn[hidden]{display:none}
#setname{color:var(--dim);font-size:14px;margin:0 0 4px}#qn{color:var(--acc);font-size:14px;font-weight:600;margin:0}#qtext{font-family:var(--head);font-size:28px;line-height:1.2;margin:6px 0 14px}
.bar{display:grid;grid-template-columns:minmax(0,260px) 1fr 34px;gap:12px;align-items:center;margin:8px 0;font-size:16px}.bar .track{height:26px;border-radius:8px;background:var(--panel2);overflow:hidden}.bar .track i{display:block;height:100%;background:#5fd4ff;transition:width .6s}.bar.real .bt{color:#5fe39a;font-weight:700}.bar.real .track i{background:#5fe39a}
#source{margin:14px 0 0;padding:12px 14px;border-left:3px solid var(--gold);background:rgba(0,0,0,.25);border-radius:0 10px 10px 0}#srcline{margin:0 0 6px;font-size:17px}#srcquote{margin:0;color:var(--soft);font-size:15px;font-style:italic}
.acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.eatgrid{display:grid;grid-template-columns:1fr 230px 1fr;gap:16px;align-items:center;margin:14px 0}.eatcol{display:flex;flex-direction:column;gap:8px}.chip.in{padding:9px 11px;border-radius:10px;border:1px solid #5fd4ff;color:#cfeeff;background:rgba(95,212,255,.08);font-size:14px;animation:drop .5s ease}
.gem{width:210px;height:210px;margin:0 auto;clip-path:polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%);background:linear-gradient(135deg,rgba(159,230,255,.25),rgba(47,140,255,.18));display:grid;place-items:center;text-align:center;padding:26px;font-family:var(--head);font-size:15px;color:var(--dim);transition:background .6s,transform .4s}.gem.set{background:linear-gradient(135deg,#9fe6ff,#2f8cff 60%,#ff4f8b);color:#041018;transform:scale(1.06)}.gem.cracked{background:repeating-linear-gradient(120deg,rgba(255,143,150,.35) 0 6px,rgba(20,10,14,.9) 6px 14px);color:#ffb3b8;animation:shake .4s}
#eatline{font-size:17px;margin:6px 0 0}.cards2{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.card2{padding:12px 14px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);font-size:16px}.card2 small{display:block;margin-top:6px;color:var(--dim);font-size:13px}.card2.pick{border-color:#5fe39a}@keyframes drop{from{opacity:0;transform:translateY(-8px)}to{opacity:1}}@keyframes shake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}@media (prefers-reduced-motion:reduce){.chip.in,.gem.cracked{animation:none}}@media (max-width:900px){.eatgrid{grid-template-columns:1fr}.gem{width:170px;height:170px}}
[hidden]{display:none!important}
@media (max-width:900px){.room{grid-template-columns:1fr}.lead h1{font-size:30px}#qtext{font-size:23px}.bar{grid-template-columns:minmax(0,1fr) 90px 28px}}
${LOOKCSS}${TYPECSS}</style></head><body>
${top('study', all)}<main id="study"><div class="lead"><h1>Study together</h1><p>One shared screen and everyone's phones. Pick a lesson; each question goes to every phone; everyone guesses privately; then the room sees how it split and the source settles it. No names, no scores, and nothing is kept.</p></div>
<div class="room"><div class="door2"><button type="button" class="btn2 go" id="open" title="Open a room the phones can join">Open a room</button><div class="qrbox" id="qr" aria-hidden="true"></div><div class="code" id="code"></div><p id="addr"></p><p id="count">0 phones in the room</p><p id="state" role="status">Open a room, then scan its code with your phones.</p><button type="button" class="btn2" id="other" hidden title="If a phone cannot open the page, this computer may have another address on your network">Phone cannot open it? Try another address</button><button type="button" class="btn2" id="end" title="End the session: the phones are told, and nothing is kept">End the session</button></div>
<div class="panel"><div id="pick"><h2 style="margin:0 0 10px">Pick a lesson to study</h2><input type="search" id="find" placeholder="Find a lesson" aria-label="Find a lesson" title="Type a word to find a lesson"><div id="sets"></div></div>
<div id="how" hidden><p id="howname" style="color:var(--dim);margin:0 0 6px"></p><h2 style="margin:0 0 12px">How do you want to study it?</h2><div class="acts"><button type="button" class="btn2 go" id="howguess" title="Each question goes to every phone; everyone guesses privately; then the room sees how it split">Guess first</button><button type="button" class="btn2 go" id="howsay" title="Everyone writes the idea in their own words; the room sees them without names and picks the clearest">Say it another way</button><button type="button" class="btn2 go" id="howeat" title="The pieces go to the phones; the room builds the idea together; a wrong piece cracks it">Pattern Eater</button><button type="button" class="btn2" id="howback" title="Choose another lesson">Pick another lesson</button></div></div><div id="eatbox" hidden><p id="eatname" style="color:var(--dim);margin:0 0 4px"></p><p style="color:var(--acc);font-weight:600;margin:0">Pattern Eater: send the pieces that belong. A wrong one cracks it; the next right one rebuilds it.</p><div class="eatgrid"><div class="eatcol" id="eatleft"></div><div class="gem" id="gem">Not set yet</div><div class="eatcol" id="eatright"></div></div><p id="eatline"></p><div class="acts"><button type="button" class="btn2 go" id="showidea" hidden title="Show the idea that just set, after the room has said it out loud">Show the idea</button><button type="button" class="btn2 go" id="eatsay" title="Now everyone says the idea in their own words">Say it another way</button><button type="button" class="btn2" id="redeal" title="Deal the pieces still out again, to the phones in the room now">Deal again</button><button type="button" class="btn2" id="eatback" title="Choose another lesson">Pick another lesson</button></div></div><div id="saybox" hidden><p id="sayname" style="color:var(--dim);margin:0 0 4px"></p><p style="color:var(--acc);font-weight:600;margin:0">Say it another way: everyone writes this idea in their own words. Nothing shows until all are in.</p><p id="sayidea" style="font-family:var(--head);font-size:24px;margin:8px 0 12px"></p><div class="cards2" id="cards"></div><p id="saypick" style="color:var(--soft)"></p><div class="acts"><button type="button" class="btn2" id="showcards" hidden title="Stop waiting and show what has been written">Show what is written</button><button type="button" class="btn2" id="sayback" title="Choose another lesson">Pick another lesson</button></div></div><div id="run" hidden><p id="setname"></p><p id="qn"></p><p id="qtext"></p><div id="bars"></div><div id="source" hidden><p id="srcline"></p><p id="srcquote"></p></div>
<div class="acts"><button type="button" class="btn2" id="reveal" title="Stop waiting and show how the room split">Show how the room split</button><button type="button" class="btn2 go" id="next" hidden title="Send the next question to the phones">Next question</button><button type="button" class="btn2" id="again" hidden title="Choose another lesson to study">Pick another lesson</button></div></div></div></div>
</main>${FOOT()}<script src="${LIVE ? 'qr.js' : 'make/qr.js'}"></script><script src="study.js"></script></body></html>`;
}

// Bryan, 15 Nov 2026: "less words". A unit shows its picture, its main piece and its crystal; the rest is one tap away.
// The mind's mechanisms are a supplement shelf (Bryan, 15 Nov 2026: "the smaller ones like the FOMO ... are
// supplemental that go for anything"). Any unit lists the mechanisms it leans on; the mechanism shows where it is used.
let MECH = null; const USED = {}; let RULES = 0;
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
// A unit whose lecture plays on the page and whose questions carry a time can be taken on phones (Answer on your
// phones): the page stops at each question's line and sends it to the phones in the room.
const shipsAnswer = (u) => !!(u.main && u.main.item && (u.quiz || []).some((q) => typeof q.t === 'number'));
// Our own quiz, written from the lecture; every answer quotes the line it comes from (checked word for word).
function quiz(u) {
  if (!(u.quiz || []).length) return '';
  return '<details class="quiz"><summary><h3>Check yourself</h3><span>' + u.quiz.length + ' questions, each answer quotes the ' + (u.explainer ? 'sources' : u.reading ? 'book' : u.main && u.main.role === 'train' ? 'lesson' : 'lecture') + '</span></summary>' + u.quiz.map((q, i) => '<div class="qq" data-a="' + q.a + '"><p><b>' + (i + 1) + '.</b> ' + esc(q.q) + '</p><div class="qc">'
    + q.choices.map((ch, j) => '<button data-j="' + j + '">' + esc(ch) + '</button>').join('') + '</div>'
    + '<p class="qh" role="status" hidden>Not quite. You have one more try.</p>'
    + '<div class="qa" hidden><p class="qr"></p><p>' + esc(q.why) + '</p><blockquote>"' + esc(q.quote) + '"' + (q.src && u.explainer && u.explainer.sources[q.src] ? '<a class="qt" href="' + esc(u.explainer.sources[q.src].url) + '" target="_blank" rel="noopener">From ' + esc(u.explainer.sources[q.src].by) + ', ' + esc(String(u.explainer.sources[q.src].year)) + ': open it</a>' : q.lesson ? '<a class="qt" href="' + esc(q.ref) + '" target="_blank" rel="noopener">From the lesson: open it</a>' : q.ref ? '<a class="qt" href="' + esc(q.ref) + '">From the book: open the chapter</a>' : '<button class="qt" data-t="' + q.t + '"' + (q.e ? ' data-e="' + q.e + '"' : '') + '>From the lecture, at ' + clock(q.t) + '</button>') + '</blockquote></div></div>').join('')
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
    + lab(u, c)
    + scaleBlock(u)
    + explainBlock(u, c)
    + (u.main ? '<div class="pieces">' + piece(u.main.role === 'train' ? { ...u.main, unit: u.n } : u.main, true) + '</div>' : '')
    // Preview only: make questions with a phone while the lecture plays (make/screen.js shows the button once the
    // preview server says this lecture has been heard). The public copy never carries it.
    + (!LIVE && u.main && u.main.item ? '<div class="makebar" hidden><button type="button" class="makebtn" title="Shows a QR code. Scan it with your phone, then mark moments in the lecture and write a question for each. The questions join Check yourself.">Make questions with your phone</button></div>' : '')
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
  return `<!doctype html><html lang="en" data-look="${LOOK}" data-type="${TYPE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${APPHEAD}
<title>${esc(c.name)} | Void University</title>
${FONTS}
<style>
${BASE}
${CARDCSS}
.need{margin:0 0 14px;padding:12px 16px;border-left:3px solid var(--gold);background:var(--panel3);border-radius:0 8px 8px 0;font-size:16px;color:#e4ddcc}.need b{color:var(--gold)}
.hero .src{font-size:14px;color:var(--dim)}.hero .src a{color:var(--gold)}
.lv{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 0}.lv span{font-size:12px;letter-spacing:.06em;padding:3px 10px;border-radius:999px;border:1px solid var(--line);color:var(--soft)}
.chap{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:-6px 0 18px}.chap>span{font-size:14px;color:var(--dim);font-weight:600;margin-right:4px}
.chap button,.qc button,.qt{font:inherit;font-size:14px;background:var(--panel2);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px 12px;cursor:pointer;text-align:left}
.chap button:hover,.qc button:hover:not(:disabled),.qt:hover{border-color:var(--gold)}.chap i{font-style:normal;color:var(--gold);margin-right:8px}
.quiz>summary{cursor:pointer;list-style:none;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}.quiz>summary::-webkit-details-marker{display:none}.quiz>summary h3{margin:0}.quiz>summary span{font-size:14px;color:var(--dim)}.quiz>summary::after{content:'Open';margin-left:auto;font-size:13px;color:var(--gold)}.quiz[open]>summary::after{content:'Close'}.quiz[open]>summary{margin-bottom:8px}
.quiz{background:#0e1626;border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 18px}
.qq{padding:10px 0;border-top:1px solid var(--line)}.qq:first-of-type{border-top:0}.qq>p{margin:0 0 8px;font-size:16px}
.qc{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px}
.qc button:disabled{cursor:default;opacity:.55}.qc button.right{opacity:1;border-color:#5fe39a;color:#5fe39a}.qc button.wrong{opacity:1;border-color:#e08a8f;color:#e08a8f}
.qa{margin-top:10px;font-size:15px;color:var(--soft)}.qa p{margin:0 0 6px}.qr{font-weight:600}.qr.ok{color:#5fe39a}.qr.no{color:#e08a8f}.qh{margin:10px 0 0;font-size:15px;font-weight:600;color:#e08a8f}
.qa blockquote{margin:6px 0 0;padding:8px 12px;border-left:3px solid var(--line);font-family:var(--head);color:#e4ddcc}
.qt{display:block;margin-top:8px;font-family:var(--body);font-size:13px;padding:5px 10px;color:var(--gold)}
.qs{margin-top:12px;padding:10px 14px;border-radius:8px;background:var(--chip);color:var(--gold)}
.chans{display:flex;gap:16px;flex-wrap:wrap;margin:0 0 28px}.chans .chan{width:280px}
.uimg{width:132px;height:84px;object-fit:cover;border-radius:6px;margin-left:auto;border:1px solid var(--line)}
.wrap{display:grid;grid-template-columns:260px 1fr;gap:32px;max-width:1500px;margin:0 auto;padding:28px 32px}
nav{position:sticky;top:calc(var(--hh,64px) + 20px);align-self:start;max-height:calc(100vh - var(--hh,64px) - 40px);overflow:auto}
nav h4{margin:0 0 10px;color:var(--dim);font-weight:500;font-size:14px}
nav a{display:flex;gap:10px;padding:8px 10px;border-radius:8px;color:var(--fg);text-decoration:none;font-size:15px}
nav a:hover{background:var(--panel2)}nav a span{color:var(--acc);font-weight:600;width:16px}
.hero{background:linear-gradient(135deg,#0f1a22,#120f1c);border:1px solid var(--line);border-radius:16px;padding:28px 32px;margin-bottom:28px}
.hero .dom{color:var(--acc);font-size:14px}
.hero h1{font-family:var(--head);font-size:36px;margin:6px 0 12px}
.hero p{max-width:820px;color:var(--soft);font-size:17px}
.hero ol{columns:2;column-gap:32px;max-width:900px;padding-left:20px;color:var(--soft)}
.unit{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px 28px;margin-bottom:24px;scroll-margin-top:20px}
.uh{display:flex;gap:16px;align-items:center;margin-bottom:16px}
.uh .n{font-family:var(--head);font-size:28px;color:var(--acc);width:44px;text-align:center}
.uh h2{margin:0;font-size:24px}.out{color:var(--dim);font-size:14px}
.seed{border-left:3px solid var(--gold);padding:2px 16px;margin:10px 0}.seed.reach{border-color:var(--pink)}
h3{margin:0 0 4px;font-size:14px;color:var(--dim);font-weight:600}
.seed p,.do p{margin:0;font-size:16px}
.pieces{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin:18px 0}
.piece{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:6px}
.donebar{margin:14px 0 4px;display:flex;justify-content:flex-end}.donebtn{font:inherit;font-size:14px;padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer}.donebtn:hover{border-color:var(--gold)}
.unit.isdone .donebtn{border-color:#3f7a57;color:#8fd6aa}.wrap nav a.isdone span::after{content:' \\2713';color:#8fd6aa}.donecount{font-size:13px;color:#8fd6aa;margin:10px 0 0;padding:0 10px}
.reader{margin:12px 0;border:1px solid var(--line);border-radius:12px;background:var(--panel2);padding:4px 18px}
.reader summary{cursor:pointer;display:flex;gap:14px;align-items:baseline;padding:10px 0;list-style:none}.reader summary::-webkit-details-marker{display:none}
.reader summary h3{margin:0;font-size:14px;color:var(--gold)}.reader summary span{color:var(--dim);font-size:14px}
.reader p{font-size:18px;line-height:1.65;max-width:760px;margin:0 0 16px}.reader .warn{font-size:15px;padding:10px 12px;border:1px solid #6b3a3d;background:#221316;border-radius:8px;color:#f0c9cb}.reader .warn a,.reader .rd-more a{color:var(--gold)}.reader .rd-more{font-size:14px}
.piece.main{grid-column:1/-1;border-color:rgba(95,212,255,.45)}
.piece.held{opacity:.6;border-style:dashed}
.ph{display:flex;gap:8px;align-items:center}
.role{font-size:14px;font-weight:700;padding:2px 8px;border-radius:6px;background:var(--chip);color:var(--acc)}
.r-listen{background:#2a1f33;color:#d39bff}.r-read{background:#2e2316;color:var(--gold)}
.tag{font-size:12px;color:var(--pink)}
.piece b{font-size:17px}.piece.main b{font-size:20px}.meta{color:var(--dim);font-size:14px}.piece p{margin:2px 0;color:var(--soft);font-size:15px}
.hold{color:var(--gold);font-size:14px}
.lic{color:var(--dim);font-size:12px;margin-top:auto}
video{width:100%;max-height:62vh;background:#000;border-radius:8px;margin-top:6px}
.piece.comp video{max-height:240px}
audio{width:100%;margin-top:6px}
.btn{display:inline-block;align-self:start;background:var(--chip);color:var(--acc);text-decoration:none;padding:8px 14px;border-radius:8px;font-weight:600;margin-top:6px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.do{background:#101a14;border:1px solid #1d3326;border-radius:12px;padding:14px 16px}
.who ul{margin:6px 0 0;padding-left:18px;font-size:14px;color:var(--soft)}.who li{margin-bottom:4px}
footer{max-width:1500px;margin:0 auto;padding:10px 32px 40px;color:var(--dim);font-size:14px}
.cx{background:var(--deep);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 18px}
.cx-lead{margin:2px 0 12px;color:var(--soft);font-size:15px;max-width:900px}
.cx-stage{position:relative;height:360px;border-radius:10px;overflow:hidden;background:radial-gradient(ellipse at center,#0e1a24 0%,#07090f 70%)}
.cx-stage canvas{position:absolute;inset:0;width:100%;height:100%}
.cx-col{position:absolute;top:0;bottom:0;width:min(240px,26%);display:flex;flex-direction:column;justify-content:space-around;padding:10px;pointer-events:none}
.cx-col.l{left:0}.cx-col.r{right:0}
.cx-chip{background:rgba(22,25,38,.85);border:1px dashed var(--line2);border-radius:10px;padding:8px 10px;font-size:13px;line-height:1.35;color:var(--dim2);transition:all .6s ease;animation:drift 6s ease-in-out infinite alternate}
.cx-chip:nth-child(2){animation-delay:-2s}.cx-chip:nth-child(3){animation-delay:-4s}
@keyframes drift{from{transform:translate(0,-4px)}to{transform:translate(0,4px)}}
.cx-chip.set{animation:none;border-style:solid;border-color:rgba(95,212,255,.6);color:var(--fg);box-shadow:0 0 18px rgba(95,212,255,.18)}
.cx-chip.bad{animation:none;border-color:rgba(242,169,59,.6)}
.cx-status{min-height:24px;margin:10px 2px 8px;font-size:15px;color:var(--acc)}
.cx.broken .cx-status{color:var(--gold)}
.cx-choices{display:flex;flex-wrap:wrap;gap:8px}
.cx-choices button,.cx-ctrl button{font:inherit;font-size:15px;background:var(--panel2);color:var(--fg);border:1px solid var(--line2);border-radius:10px;padding:10px 14px;cursor:pointer;text-align:left;max-width:440px}
.cx-choices button:hover:not(:disabled){border-color:var(--acc)}
.cx-choices button:disabled{opacity:.45;cursor:default}
.cx-choices button.picked{opacity:1;border-color:var(--acc);color:var(--acc)}
.cx-choices button.wrongpick{opacity:1;border-color:var(--gold);color:var(--gold)}
.cx-ctrl{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:12px;color:var(--dim);font-size:14px}
.cx-ctrl label{display:flex;align-items:center;gap:8px}.cx-ctrl input{width:160px;accent-color:var(--acc)}
.cx-ctrl button{padding:8px 12px;font-size:14px}.cx-ctrl button:disabled{opacity:.4;cursor:default}
.cx-after{margin-top:14px}.cx-after p{margin:2px 0 8px;font-size:15px;color:var(--soft)}
.cx-after textarea{width:100%;background:var(--panel2);color:var(--fg);border:1px solid var(--line2);border-radius:10px;padding:10px;font:inherit}
.cx-after small{color:var(--dim)}
.sc{background:var(--deep);border:1px solid var(--line);border-radius:12px;padding:14px 18px 16px;margin:0 0 18px}
.sc-like{font-size:14px;color:var(--pink);font-weight:700}
.sc-stage{margin-top:8px;border-radius:10px;background:radial-gradient(ellipse at center,#0e1a24 0%,#07090f 75%);aspect-ratio:800/360;overflow:hidden}
.sc-stage svg{display:block;width:100%;height:100%;font-family:system-ui,Segoe UI,Roboto,sans-serif}
.sc-say{min-height:40px;margin:12px 2px 6px;font-family:var(--head);font-size:22px;font-weight:500;text-align:center}
.sc-ctrl{display:flex;align-items:center;justify-content:center;gap:10px}
.sc-ctrl button{font:inherit;font-size:15px;background:var(--panel2);color:var(--fg);border:1px solid var(--line2);border-radius:10px;padding:8px 16px;cursor:pointer;min-width:44px;min-height:40px}
.sc-ctrl button:hover{border-color:var(--acc)}.sc-play{min-width:120px}
.sc-dots{display:flex;gap:6px;margin-left:10px}
.sc-dots button{min-width:0;min-height:0;width:14px;height:14px;padding:0;border-radius:50%;background:#1d2130}
.sc-dots button.on{background:var(--acc);border-color:var(--acc)}
.sc-map{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 22px;margin-top:12px;font-size:15px;color:var(--dim);opacity:.35;transition:opacity .8s}
.sc.done .sc-map{opacity:1}.sc-map i{font-style:normal;color:var(--soft)}.sc-map b{color:var(--acc)}
.scale{background:var(--deep);border:1px solid var(--line);border-radius:12px;padding:16px 18px 18px;margin:0 0 18px}
.scale-kick{display:block;font-size:14px;color:var(--acc);font-weight:700}.scale-top b{display:block;font-family:var(--head);font-size:22px;margin:2px 0 4px}.scale-top p{margin:0 0 12px;color:var(--soft);max-width:860px}
.scale-body{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}
.scale-stage{position:relative;border-radius:10px;background:#07080c;aspect-ratio:16/10;max-height:68vh;width:100%;overflow:hidden;border:1px solid #20242f;outline:none}.scale-stage:focus-visible,.scale-stage.live{border-color:#5fd4ff}
.scale-stage canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}.scale-stage canvas:active{cursor:grabbing}
.scale-stage.flat canvas{display:none}.scale-stage.flat{aspect-ratio:auto;padding:18px}
.scale-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}.scale-labels span{position:absolute;left:0;top:0;white-space:nowrap;font-size:13px;font-weight:600;color:#f6f7fb;background:rgba(7,8,12,.72);border:1px solid #2b2f41;border-radius:6px;padding:2px 7px}.scale-labels span.on{border-color:#fff}
.scale-stage:not(.open) canvas,.scale-stage:not(.open) .scale-labels,.scale-stage:not(.open) .scale-hint{visibility:hidden}
.scale-hint{position:absolute;left:10px;right:10px;bottom:8px;margin:0;font-size:13px;color:#a6abc0;pointer-events:none;text-align:center}.scale-stage.live .scale-hint{display:none}.scale-stage.flat .scale-hint{position:static;visibility:visible;font-size:15px;color:#dcdfec;text-align:left}
.scale-guess{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:10px;padding:22px 26px;color:#f6f7fb;overflow:auto}.scale-guess[hidden]{display:none}
.scale-guess>b{font-size:14px;color:#ffc44d}.scale-guess p{margin:0;font-size:19px;max-width:620px}.scale-guess .said{font-size:16px;color:#dcdfec}.scale-guess .opts{display:flex;flex-wrap:wrap;gap:8px}
.scale-guess button,.scale-tools button,.scale-states button{font:inherit;font-size:15px;padding:8px 14px;border-radius:8px;border:1px solid #2b2f41;background:#14161f;color:#f6f7fb;cursor:pointer}
.scale-guess button:hover:not(:disabled),.scale-tools button:hover{border-color:#5fd4ff}.scale-guess button:disabled{cursor:default;opacity:.55}.scale-guess button.right{opacity:1;border-color:#5fe39a;color:#5fe39a}.scale-guess button.wrong{opacity:1;border-color:#ff8f96;color:#ff8f96}.scale-guess .see{border-color:#ffc44d;color:#ffc44d}
.scale-tools{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 0}.scale-tools button,.scale-states button{background:var(--panel);color:var(--fg);border-color:var(--line)}
.scale.js:not(.opened) .scale-side,.scale.js:not(.opened) .scale-tools,.scale.js:not(.opened) .scale-read{visibility:hidden}.scale-read{margin:10px 0 0;min-height:3.2em;color:var(--soft);font-size:16px}
.scale-states{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 6px}.scale-states[hidden]{display:none}.scale-states span{font-size:14px;color:var(--dim);font-weight:600}.scale-states button.on{border-color:var(--gold);color:var(--gold)}
.scale-statenote{margin:0 0 8px;font-size:14px;color:var(--dim)}.scale-statenote:empty{display:none}
.scale-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;max-height:60vh;overflow:auto}
.scale-list button{width:100%;display:grid;grid-template-columns:14px minmax(0,1fr);gap:1px 9px;align-items:center;text-align:left;font:inherit;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer}
.scale-list button:hover,.scale-list button.on{border-color:var(--gold)}.scale-list i{width:14px;height:14px;border-radius:3px;grid-row:1 / span 2}.scale-list b{font-size:15px;font-weight:600}.scale-list .v{grid-column:2;font-size:13px;color:var(--dim)}.scale-list button.ghost i{opacity:.35}
.scale-note,.scale-src{margin:12px 0 0;font-size:14px;color:var(--dim)}.scale-src a{color:var(--acc)}
@media (max-width:1000px){.scale-body{grid-template-columns:1fr}.scale-list{max-height:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}}
.ex{background:var(--deep);border:1px solid var(--line);border-radius:12px;padding:16px 18px 18px;margin:0 0 18px}
.ex-kick{display:block;font-size:14px;color:var(--acc);font-weight:700}.ex-top b{display:block;font-family:var(--head);font-size:24px;margin:2px 0 4px}.ex-top p{margin:0 0 12px;color:var(--soft);max-width:860px}
.ex-body{display:flex;flex-direction:column;gap:14px}
.ex-stage{position:relative;border-radius:10px;background:#020308;aspect-ratio:16/9;max-height:74vh;margin:0 auto;width:100%;overflow:hidden;border:1px solid #1b2030;outline:none}.ex-stage:focus-visible,.ex-stage.live{border-color:#5fd4ff}
.ex-stage canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}.ex-stage canvas:active{cursor:grabbing}.ex-stage.flat canvas{display:none}.ex-stage.flat{aspect-ratio:auto;padding:18px}
.ex-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}.ex-labels button{position:absolute;left:0;top:0;pointer-events:auto;font:inherit;font-size:13px;font-weight:600;color:#f6f7fb;background:rgba(5,6,12,.7);border:1px solid #2b3045;border-radius:999px;padding:3px 10px;cursor:pointer;white-space:nowrap;backdrop-filter:blur(4px)}.ex-labels button:hover,.ex-labels button.on{border-color:#ffc44d;color:#ffc44d}
.ex-hud{position:absolute;left:10px;top:10px;z-index:2;pointer-events:none;display:flex;flex-direction:column;gap:0;color:#f6f7fb;text-shadow:0 2px 12px #000;background:rgba(4,6,12,.62);border-radius:10px;padding:8px 12px;backdrop-filter:blur(4px)}.ex-hud:empty{display:none}.ex-hud .st{font-size:18px}.ex-hud .st small{font-size:12px}.ex-hud b{font-family:var(--head);font-size:30px;line-height:1}.ex-hud span{font-size:22px;font-weight:700}.ex-hud small{font-size:13px;color:#c8cde0}.ex-hud em{font-style:normal;font-size:13px;color:#ff8fb8}.ex-hud i{font-style:normal;font-size:12px;color:#a9c4ff}
.ex-card{position:absolute;right:12px;top:12px;width:min(320px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;background:rgba(8,10,18,.9);border:1px solid #2b3045;border-radius:10px;padding:12px 14px;color:#e8eaf4;backdrop-filter:blur(6px)}.ex-card b{display:block;font-size:17px;margin:0 0 4px;color:#fff}.ex-card p{margin:0 0 6px;font-size:14px}.ex-card small{display:block;font-size:12px;color:#a6abc0;margin-bottom:6px}
.ex-card .ex-x,.ex-guess button,.ex-play button{font:inherit;font-size:14px;padding:7px 12px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--fg);cursor:pointer}.ex-card .ex-x{padding:3px 10px;font-size:13px}
.ex-guess{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:10px;padding:22px 26px;background:radial-gradient(ellipse at 30% 50%,rgba(2,3,8,.55),rgba(2,3,8,.92));color:#f6f7fb;overflow:auto}.ex-guess[hidden]{display:none}.ex-guess>b{font-size:14px;color:#ffc44d}.ex-guess p{margin:0;font-size:19px;max-width:640px}.ex-guess .opts{display:flex;flex-wrap:wrap;gap:8px}.ex-guess button{background:#14161f;color:#f6f7fb;border-color:#2b2f41;font-size:15px;padding:9px 15px}.ex-guess button:hover{border-color:#5fd4ff}
.ex-hint{position:absolute;left:10px;right:10px;bottom:8px;margin:0;font-size:13px;color:#a6abc0;pointer-events:none;text-align:center}.ex-stage.live .ex-hint{display:none}.ex-stage.flat .ex-hint{position:static;font-size:15px;color:#dcdfec;text-align:left}
.ex:not(.opened) .ex-labels,.ex:not(.opened) .ex-hud,.ex:not(.opened) .ex-hint{visibility:hidden}
.ex-say{margin:10px 0 0;min-height:3.2em;color:var(--soft);font-size:16px}.ex-gap{margin:10px 0 0;padding:10px 14px;border-left:3px solid #ffc44d;background:var(--panel);border-radius:0 8px 8px 0;font-size:16px}
.ex-side{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;align-items:start}.ex-col{display:flex;flex-direction:column;gap:12px;min-width:0}.ex-faders{display:flex;flex-direction:column;gap:10px}
.ex-fader{display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--soft)}.ex-fader span{display:flex;justify-content:space-between}.ex-fader output{font-weight:700;color:var(--fg)}
.ex-fader input{width:100%;accent-color:#ff4f8b;height:26px;cursor:pointer}.ex-fader input:disabled{cursor:default;opacity:.7}
.ex-play{display:flex;flex-wrap:wrap;gap:6px}.ex-play button:hover{border-color:#5fd4ff}.ex-play .ex-go{background:#ff4f8b;border-color:#ff4f8b;color:#fff;font-weight:700}.ex-play button.on{border-color:#ffc44d;color:#ffc44d}
.ex-speed{display:flex;gap:4px;margin-left:auto}.ex-speed button{padding:5px 9px;font-size:13px}.ex-speed button.on{border-color:#5fd4ff;color:#5fd4ff}
.ex-trace{width:100%;height:150px;display:block;background:#05070d;border:1px solid var(--line);border-radius:8px}
.ex-balance{display:flex;flex-direction:column;gap:6px}.ex-bal span{display:flex;justify-content:space-between;font-size:13px;color:var(--soft)}.ex-bal b{color:var(--fg)}.ex-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:#0b0e18}.ex-bar i{display:block;height:100%}.ex-balance p{margin:0;font-size:12px;color:var(--dim)}
.ex-parts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}.ex-parts button{width:100%;display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:9px;align-items:center;text-align:left;font:inherit;font-size:14px;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer}.ex-parts button:hover,.ex-parts button.on{border-color:#ffc44d}.ex-parts .v{font-size:13px;color:var(--dim)}
.ex-parts i{width:12px;height:12px;border-radius:50%}.ex-parts p{margin:4px 2px 8px;font-size:14px;color:var(--soft)}.ex.js .ex-parts p{display:none}
.t-store{background:linear-gradient(90deg,#a9c4ff 50%,#ff4f8b 50%)}.t-hot{background:#ff4f8b}.t-amber{background:#ffb347}.t-cold{background:#5fd4ff}.t-green{background:#6fe39a}.t-gold{background:#ffc44d}.t-violet{background:#9b8cf0}.t-mist{background:#dfe8ff}.t-deep{background:#2f8cff}
.ex-rules{margin:14px 0 0}.ex-h{display:block;font-size:14px;font-weight:700;color:var(--gold);margin:0 0 6px}.ex-rules ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}.ex-rules li{padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);font-size:15px}.ex-rules li.found{border-color:rgba(95,227,154,.5)}.ex-rules li.fresh{box-shadow:0 0 0 2px rgba(95,227,154,.5)}.ex-rules li b{color:var(--gold)}.ex-rules li i{color:var(--dim)}.ex-meet{margin:10px 0 0;font-weight:600;color:#5fe39a}
.ex-note,.ex-src{margin:12px 0 0;font-size:14px;color:var(--dim)}.ex-src a{color:var(--acc)}
@media (max-width:1000px){.ex-body{grid-template-columns:1fr}.ex-speed{margin-left:0}}
.lab{background:var(--deep);border:1px solid rgba(212,176,106,.45);border-radius:12px;padding:16px 18px 18px;margin:0 0 18px}
.lab-kick{display:block;font-size:14px;color:var(--gold);font-weight:700}
.lab-top b{display:block;font-family:var(--head);font-size:24px;font-weight:600;margin:2px 0}
.lab-top p{margin:0 0 12px;color:var(--soft);font-size:16px;max-width:820px}
.lab-body{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,1fr);gap:18px;align-items:start}
.lab-stage{border-radius:10px;background:radial-gradient(ellipse at center,#0e1a24 0%,#07090f 75%);aspect-ratio:1/1;max-height:560px;overflow:hidden}
.lab-stage canvas{display:block;width:100%;height:100%}
.lab-side{display:flex;flex-direction:column;gap:14px}
.lab-knob>span{display:block;font-size:14px;color:var(--dim);font-weight:600;margin-bottom:6px}
.lab-seg{display:flex;flex-wrap:wrap;gap:8px}
.lab-seg button{font:inherit;font-size:16px;min-height:44px;min-width:64px;background:var(--panel2);color:var(--fg);border:1px solid var(--line2);border-radius:10px;padding:8px 16px;cursor:pointer}
.lab-seg button:hover{border-color:var(--gold)}.lab-seg button.on{border-color:var(--gold);color:var(--ink);background:var(--gold);font-weight:600}
.lab.running .lab-seg button{opacity:.5;cursor:default}
.lab-go{font:inherit;font-size:18px;font-weight:600;min-height:52px;background:var(--gold);color:var(--ink);border:0;border-radius:10px;padding:10px 22px;cursor:pointer;align-self:start}
.lab-go:disabled{opacity:.45;cursor:default}.lab.hands .lab-go{display:none}.lab.hands .lab-stage{cursor:pointer;touch-action:manipulation}
.lab-guess{display:flex;flex-direction:column;gap:8px;padding:10px 14px;border-left:3px solid var(--pink);background:var(--panel3);border-radius:0 8px 8px 0;font-size:16px}
.lab-guess.made{border-color:#5a6480;color:var(--dim)}.lab.running .lab-guess{opacity:.55}
.lab-guess .lab-seg button.on{background:var(--pink);border-color:var(--pink)}
.lab-acts{display:flex;flex-wrap:wrap;gap:10px}.lab-acts:empty{display:none}
.lab-act{font:inherit;font-size:17px;min-height:52px;background:var(--panel2);color:var(--fg);border:1px solid var(--line2);border-radius:10px;padding:10px 20px;cursor:pointer}
.lab-act:hover{border-color:var(--gold)}.lab-act.main{background:var(--gold);color:var(--ink);border-color:var(--gold);font-weight:600}
.lab-say{font-family:var(--head);font-size:20px;line-height:1.35;min-height:54px}
.lab-h{display:block;font-size:14px;color:var(--dim);font-weight:600;margin:16px 0 8px}
.lab-strip{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px}
.lab-strip figure{margin:0;flex:none;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 8px 6px}
.lab-strip canvas{display:block;width:132px;height:60px}.lab-strip figcaption{font-size:12px;color:var(--dim);margin-top:4px;text-align:center}
.lab-rules ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.lab-rules li{padding:10px 14px;border-radius:10px;border:1px dashed var(--line2);font-size:16px;color:var(--dim2)}
.lab-rules li b{color:var(--gold);font-weight:700;font-size:14px}
.lab-rules li i{color:var(--dim)}
.lab-rules li.found{border-style:solid;border-color:rgba(212,176,106,.6);color:var(--fg);background:var(--panel3)}
.lab-rules li.fresh{animation:labfound 1.6s ease}
@keyframes labfound{0%{box-shadow:0 0 0 0 rgba(212,176,106,.9);transform:scale(1.015)}100%{box-shadow:0 0 0 18px rgba(212,176,106,0);transform:none}}
.lab-meet{margin:12px 0 0;padding:12px 16px;border-left:3px solid var(--pink);background:var(--panel3);border-radius:0 8px 8px 0;font-size:16px}
.lab-credit{margin:12px 0 0;font-size:13px;color:var(--dim)}
.lab-map{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:14px;font-size:15px;color:var(--dim)}.lab-map i{font-style:normal;color:var(--soft)}.lab-map b{color:var(--acc)}
@media (max-width:900px){.lab-body{grid-template-columns:1fr}.lab-stage{max-height:70vh}}
.uses{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 14px}
.uses span{font-size:14px;color:var(--dim);font-weight:600;margin-right:4px}
.uses a{font-size:14px;padding:4px 12px;border-radius:999px;text-decoration:none;color:var(--pink);border:1px solid rgba(255,79,200,.35);background:#1a0f19}
.uses a:hover{border-color:var(--pink)}
details.more{margin-top:6px;border-top:1px solid var(--line);padding-top:10px}
details.more summary{cursor:pointer;color:var(--dim);font-size:15px;padding:6px 0}
details.more summary:hover{color:var(--fg)}
@media (max-width:1000px){.wrap{grid-template-columns:1fr}nav{position:static;max-height:none}nav{display:flex;flex-wrap:wrap;gap:4px}nav h4{width:100%}.row2{grid-template-columns:1fr}.hero ol{columns:1}}
${LOOKCSS}${TYPECSS}</style></head><body>
${top(c.slug, all)}
<div class="wrap"><nav><h4>Units</h4>${toc}<p class="donecount"></p></nav><main>
<style>html[data-look]{--area:${hue(c.domain)}}</style><div class="hero"${(img('c-' + c.slug) || img('a-' + c.domain.toLowerCase().replace(/[^a-z0-9]+/g, '-'))) ? ' style="background-image:linear-gradient(90deg,rgba(7,8,12,.96) 40%,rgba(7,8,12,.6)),url(' + (img('c-' + c.slug) || img('a-' + c.domain.toLowerCase().replace(/[^a-z0-9]+/g, '-'))) + ');background-size:cover;background-position:center"' : ''}><div class="dom">${esc(c.domain)}, ${c.size === 'class' ? 'a class built from an old book' : c.kind === 'found' ? 'built from a free course' : 'a course we wrote'}</div><h1>${esc(c.name)}</h1><p>${esc(c.why)}</p>${c.source ? '<p class="src">From <a href="' + esc(c.source.url) + '" target="_blank" rel="noopener">' + esc(c.source.title) + '</a>, ' + esc(c.source.by) + '. ' + licence(c.source.licence) + '.' + (c.planned > c.units.length ? ' ' + c.units.length + ' of ' + c.planned + ' lectures are ready so far. The rest are being added one at a time, so the numbers in the list skip.' : '') + '</p>' : ''}<p class="lv">${LEVELS(c)}</p>
${(() => { const outs = (c.outcomes || []).length ? c.outcomes : c.units.map((u) => u.outcome).filter(Boolean); return outs.length ? '<details class="more"><summary>By the end you will be able to...</summary><ol>' + outs.map((o) => '<li>' + esc(o) + '</li>').join('') + '</ol></details>' : ''; })()}</div>
${(c.channels || []).length ? '<h3 style="margin:0 0 12px">Channels for this course</h3><div class="chans">' + c.channels.map(chan).join('') + '</div>' : ''}
${c.units.map((u) => unit(u, c.voices, c)).join('\n')}
</main></div>
${FOOT()}
<script src="crystal.js"></script><script src="scene.js"></script>${c.units.some(shipsLab) ? '<script src="planck.min.js"></script><script src="lab.js"></script>' + [...new Set(c.units.filter(shipsLab).map((u) => u.lab.bench))].map((n) => '<script src="lab-' + esc(n) + '.js"></script>').join('') : ''}${c.units.some(shipsScale) ? '<script type="module" src="scale.js"></script>' : ''}${c.units.some(shipsExplain) ? '<script src="explain-model.js"></script><script type="module" src="explain.js"></script>' : ''}
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
  var a = +q.dataset.a, j = +c.dataset.j;
  // A second try (B, 20 Nov 2026: "allow a second try on quiz answers"): the first wrong pick is marked and switched off,
  // the answer stays hidden, and the next pick settles it either way.
  if (j !== a && !q.classList.contains('tried')) { q.classList.add('tried'); c.classList.add('wrong'); c.disabled = true; q.querySelector('.qh').hidden = false; return; }
  q.classList.add('done'); q.querySelector('.qh').hidden = true;
  q.querySelectorAll('.qc button').forEach(function (x) { var k = +x.dataset.j; if (k === a) x.classList.add('right'); else if (k === j) x.classList.add('wrong'); x.disabled = true; });
  q.querySelector('.qr').textContent = j === a ? (q.classList.contains('tried') ? 'Right, on your second try.' : 'Right.') : 'Not quite.';
  q.querySelector('.qr').className = 'qr ' + (j === a ? 'ok' : 'no');
  q.querySelector('.qa').hidden = false;
  var z = q.closest('.quiz'), all = z.querySelectorAll('.qq'), done = z.querySelectorAll('.qq.done');
  if (all.length === done.length) { var n = 0, s = 0; all.forEach(function (x) { if (x.querySelector('.qr.ok')) { n++; if (x.classList.contains('tried')) s++; } }); var sEl = z.querySelector('.qs'); sEl.textContent = 'You got ' + n + ' of ' + all.length + (s ? ', ' + s + ' on the second try' : '') + '. Missed one? The quote under it shows where the lecture says it.'; sEl.hidden = false; }
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
  all[SLUG] = d; VU.set('vu:done', all);
  var at = VU.get('vu:doneAt', {}); if (i < 0) at[SLUG + '/' + n] = Date.now(); else delete at[SLUG + '/' + n]; VU.set('vu:doneAt', at);
  paintDone();
});
paintDone();
if ('IntersectionObserver' in window) {
  var seen = new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) VU.set('vu:last', { slug: SLUG, name: CNAME, n: +x.target.id.slice(1), title: x.target.querySelector('h2').textContent }); }); }, { rootMargin: '-40% 0px -40% 0px' });
  document.querySelectorAll('.unit').forEach(function (u) { seen.observe(u); });
}
</script>${LIVE ? (c.units.some(shipsAnswer) ? '<script src="qr.js"></script><script src="answer.js"></script>' : '') : '<script src="/make/qr.js"></script><script src="/make/screen.js"></script>'}
</body></html>`;
}

// The front page (Bryan, 15 Nov 2026): rows by area like voidtv.net, each whole course one card; the mind's
// mechanisms as a row of small cards any course can use; the found channels beside the courses they go with; every
// area in a grid below. The look is a university's (Bryan: "its currently not correct for university"): navy and
// parchment, brass, a serif face, photographs on every card. Photos are CC0, each recorded in img/images.json.
// Looks (Bryan, 19 Nov 2026: the navy and brass look is "quite dusty looking"). A look is a set of colour settings and
// a few rules on top of the shared styles. profile.json "look" names the one the site is built with; the preview
// lets Bryan switch between them on the real pages. The picture stages (scene, crystal, lab) stay dark in every
// look, like a screen set into the page.
const LOOK = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'profile.json'), 'utf8')).look || 'classic'; } catch (e) { return 'classic'; } })();
const LOOKS = { classic: 'Navy and brass (the first look)', bright: 'Bright night', daylight: 'Daylight' };
const LOOKCSS = `
html[data-look="bright"]{--bg:#07080c;--panel:#0f1118;--panel2:#171a28;--line:rgba(255,255,255,.09);--fg:#f6f7fb;--dim:#a6abc0;--acc:#5fd4ff;--gold:#f2a93b;--pink:#ff4fc8;--ink:#07080c;--soft:#dcdfec;--line2:rgba(255,255,255,.18);--panel3:#141726;--dim2:#b9bed0;--chip:#1f2437;--deep:#05060a;--area:#5fd4ff;--lift1:0 8px 22px rgba(0,0,0,.5);--lift2:0 18px 44px rgba(0,0,0,.6);--inset:inset 0 1px 0 rgba(255,255,255,.07);--head:Inter,system-ui,sans-serif;--radius:14px}
html[data-look="daylight"]{--bg:#f4f6fb;--panel:#ffffff;--panel2:#eef1f8;--line:#d7dcea;--fg:#141926;--dim:#5a6377;--acc:#1f55e6;--gold:#9a5b00;--pink:#c2255c;--ink:#ffffff;--soft:#2f3647;--line2:#c5cbdc;--panel3:#f1f4fa;--dim2:#4f586b;--chip:#e6ebf7;--deep:#ffffff;--head:Inter,system-ui,sans-serif;--radius:14px}
html[data-look="bright"] h1,html[data-look="bright"] h2,html[data-look="bright"] .crest b,html[data-look="bright"] .sc-say,html[data-look="bright"] .who>span,html[data-look="bright"] #resume a,
html[data-look="daylight"] h1,html[data-look="daylight"] h2,html[data-look="daylight"] .crest b,html[data-look="daylight"] .sc-say,html[data-look="daylight"] .who>span,html[data-look="daylight"] #resume a{font-family:var(--head);font-weight:800;letter-spacing:-.015em}
html[data-look="bright"] .crest b,html[data-look="daylight"] .crest b{letter-spacing:.06em}
html[data-look="bright"] .card,html[data-look="daylight"] .card,html[data-look="bright"] .unit,html[data-look="daylight"] .unit{border-radius:var(--radius)}
html[data-look="bright"] .hero img{filter:saturate(1.15) brightness(.62)}
html[data-look="bright"] .area img{filter:grayscale(.6) brightness(.5)}html[data-look="bright"] .area.has img{filter:saturate(1.15) brightness(.75)}
html[data-look="bright"] .who button.on,html[data-look="daylight"] .who button.on{background:var(--acc);border-color:var(--acc);color:var(--ink);font-weight:600}
html[data-look="bright"] .need{border-left-color:var(--acc)}
html[data-look="bright"] .card:hover,html[data-look="daylight"] .card:hover{border-color:var(--acc);box-shadow:0 10px 30px rgba(0,0,0,.25)}
html[data-look="daylight"] body{background:var(--bg)}
html[data-look="daylight"] .card,html[data-look="daylight"] .unit,html[data-look="daylight"] .piece,html[data-look="daylight"] .reader,html[data-look="daylight"] #found,html[data-look="daylight"] #resume,html[data-look="daylight"] .navlist,html[data-look="daylight"] .shero{box-shadow:0 1px 2px rgba(20,25,38,.06),0 8px 24px rgba(20,25,38,.06)}
html[data-look="daylight"] .hero img{filter:saturate(1.05) brightness(.6)}
html[data-look="daylight"] .hero,html[data-look="daylight"] .hero h1,html[data-look="daylight"] .hero p,html[data-look="daylight"] .hero .dom,html[data-look="daylight"] .hero summary,html[data-look="daylight"] .hero li{color:#fff}
html[data-look="daylight"] .hero .src,html[data-look="daylight"] .hero .src a,html[data-look="daylight"] .hero a{color:#dfe6ff}
html[data-look="daylight"] .hero .lv span,html[data-look="daylight"] .hero span{color:#fff}
html[data-look="daylight"] .area{color:#fff}html[data-look="daylight"] .area small{color:#e8ecf7}
html[data-look="daylight"] .area img{filter:grayscale(.5) brightness(.5)}html[data-look="daylight"] .area.has img{filter:saturate(1.1) brightness(.62)}
html[data-look="daylight"] .draft{background:#fff7e0;border-color:#e2c56e;color:#7a5200}
html[data-look="daylight"] .need{background:#fff8e6;border-left-color:#e0a100;color:#2a2410}
html[data-look="daylight"] .pair .warn,html[data-look="daylight"] .reader .warn{background:#fff0f1;border-color:#f0b9bd;color:#7a1c24}html[data-look="daylight"] .pair .warn a,html[data-look="daylight"] .reader .warn a{color:#a3162a}
html[data-look="daylight"] .pair .old p{color:#5a6377}
html[data-look="daylight"] .unit.isdone .donebtn,html[data-look="daylight"] .donecount,html[data-look="daylight"] .card .prog,html[data-look="daylight"] .wrap nav a.isdone span::after{color:#1b7a43;border-color:#8fd0a8}
html[data-look="daylight"] header.top{box-shadow:0 1px 0 var(--line)}
html[data-look="daylight"] .quiz{background:#f1f4fa}html[data-look="daylight"] .qa blockquote{color:#2f3647;border-left-color:#c5cbdc}html[data-look="daylight"] .qc button.right{border-color:#1b7a43;color:#1b7a43}html[data-look="daylight"] .qc button.wrong{border-color:#b3261e;color:#b3261e}html[data-look="daylight"] .qr.ok{color:#1b7a43}html[data-look="daylight"] .qr.no,html[data-look="daylight"] .qh{color:#b3261e}
html[data-look="daylight"] .r-read{background:#fff1d6;color:#7a5200}html[data-look="daylight"] .r-listen{background:#f1e6ff;color:#5b2a9a}html[data-look="daylight"] .r-watch{background:#e3edff;color:#1f55e6}html[data-look="daylight"] .do{background:#ecf8f0;border-color:#b9e2c7}html[data-look="daylight"] .sc-dots button{background:#c9d0e2}html[data-look="daylight"] .sc-dots button.on{background:var(--acc)}html[data-look="daylight"] .uses a{background:#fdeaf1;border-color:#f2b6cd}
html[data-look="daylight"] .hero::after{background:linear-gradient(180deg,rgba(11,18,32,.25) 0%,rgba(11,18,32,.72) 100%)}
html[data-look="daylight"] .hero .dom{color:#ffd98a}
html[data-look="daylight"] .arrow{background:#fff;color:#141926;border-color:var(--line);box-shadow:0 4px 14px rgba(20,25,38,.18)}
html[data-look="bright"] .hero::after{background:linear-gradient(180deg,rgba(7,8,12,.1) 0%,rgba(7,8,12,.6) 60%,var(--bg) 100%)}
html[data-look="bright"] header.top{background:rgba(7,8,12,.88);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
html[data-look="bright"] .crest svg path:first-child{fill:#10131f;stroke:var(--acc)}html[data-look="bright"] .crest svg path{stroke:var(--acc)}html[data-look="bright"] .crest svg circle{stroke:var(--pink)}
html[data-look="bright"] .card,html[data-look="bright"] .unit{box-shadow:var(--lift1),var(--inset)}html[data-look="bright"] .card:hover{box-shadow:var(--lift2),var(--inset)}
html[data-look="bright"] .unit{border-top:3px solid var(--area);background:linear-gradient(180deg,color-mix(in srgb,var(--area) 9%,var(--panel)) 0,var(--panel) 240px)}
html[data-look="bright"] .uh .n{color:var(--area);text-shadow:0 0 18px color-mix(in srgb,var(--area) 55%,transparent)}
html[data-look="bright"] .piece,html[data-look="bright"] .quiz,html[data-look="bright"] .sc,html[data-look="bright"] .lab,html[data-look="bright"] .cx,html[data-look="bright"] .scale{box-shadow:var(--inset),0 4px 14px rgba(0,0,0,.4)}
html[data-look="bright"] .quiz{background:var(--panel2)}
html[data-look="bright"] .need{background:color-mix(in srgb,var(--gold) 10%,var(--panel2));color:var(--soft);border-left-color:var(--gold)}
html[data-look="bright"] .lab{border-color:color-mix(in srgb,var(--area) 45%,transparent)}
html[data-look="bright"] .sc-stage,html[data-look="bright"] .cx-stage{background:radial-gradient(ellipse at center,color-mix(in srgb,var(--area) 11%,#0a0c14) 0%,#05060a 75%)}
html[data-look="bright"] .hero:not(#colhost .hero){background:radial-gradient(90% 150% at 0% 0%,color-mix(in srgb,var(--area) 24%,transparent),transparent 62%),radial-gradient(70% 120% at 100% 100%,color-mix(in srgb,var(--pink) 12%,transparent),transparent 60%),var(--panel);box-shadow:var(--lift1),var(--inset);border-top:3px solid var(--area)}
html[data-look="bright"] .hero:not(#colhost .hero) .dom{color:var(--area)}
html[data-look="bright"] .row>h2>span::before{content:'';display:inline-block;width:6px;height:.85em;border-radius:3px;margin-right:12px;vertical-align:-.05em;background:var(--area);box-shadow:0 0 14px var(--area)}
html[data-look="bright"] .card.course{border-top:3px solid var(--area)}html[data-look="bright"] .card small{color:var(--area)}
html[data-look="bright"] .card .ph.face{display:flex;align-items:flex-end;aspect-ratio:3/2;padding:18px;background:radial-gradient(120% 100% at 15% 0%,color-mix(in srgb,var(--area) 42%,transparent),transparent 62%),radial-gradient(90% 90% at 100% 100%,color-mix(in srgb,var(--pink) 20%,transparent),transparent 60%),var(--deep)}
html[data-look="bright"] .card .ph.face span{font-family:var(--head);font-weight:800;font-size:21px;line-height:1.18;letter-spacing:-.01em;color:var(--fg);text-shadow:0 2px 14px rgba(0,0,0,.6)}
html[data-look="bright"] .card.mini{border-left:3px solid var(--area)}
html[data-look="bright"] .area{background:radial-gradient(120% 120% at 10% 0%,color-mix(in srgb,var(--area) 45%,transparent),transparent 65%),var(--panel);border-top:3px solid var(--area);box-shadow:var(--lift1),var(--inset)}
html[data-look="bright"] .qc button,html[data-look="bright"] .chap button,html[data-look="bright"] .donebtn,html[data-look="bright"] .qt{background:linear-gradient(180deg,#1b2233,#131826);border-color:var(--line2)}html[data-look="bright"] .qc button:hover:not(:disabled),html[data-look="bright"] .chap button:hover,html[data-look="bright"] .donebtn:hover,html[data-look="bright"] .qt:hover{border-color:var(--acc);box-shadow:0 0 16px rgba(95,212,255,.22)}
html[data-look="bright"] .navlist{background:var(--panel2);box-shadow:var(--lift2),var(--inset)}
.sc-stage{max-height:calc(100vh - var(--hh,64px) - 190px)}.cx-stage{height:min(360px,calc(100vh - var(--hh,64px) - 190px))}
`;
// Install on a phone or tablet (Bryan, 19 Nov 2026: "the whole pwa"; "Yes, do it here"). Every page names the manifest and the
// home-screen icons (img/, drawn by make-icons.js), so iPhone and iPad Safari add it as an app with the crest, and Chrome and
// Edge can offer to install it. The Install button in the header (INSTALL below) shows the steps on iPhone and iPad, which have
// no install prompt of their own. sw.js only shows an offline note with a Try again button; nothing is cached.
const APPHEAD = '<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" type="image/png" sizes="192x192" href="/img/icon-192.png"><link rel="apple-touch-icon" href="/img/apple-touch-icon.png"><meta name="theme-color" content="#07080c"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Void University"><meta name="apple-mobile-web-app-status-bar-style" content="black">';
const MANIFEST = { name: 'Void University', short_name: 'Void University', description: 'Free courses in plain words: learn from people who did it.', start_url: '/', scope: '/', display: 'standalone', background_color: '#0b0c12', theme_color: '#07080c',
  icons: [{ src: '/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/img/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/img/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
const APPICONS = ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
const SW = "self.addEventListener('install',()=>self.skipWaiting());\nself.addEventListener('activate',(e)=>e.waitUntil(self.clients.claim()));\nself.addEventListener('fetch',(e)=>{if(e.request.mode!=='navigate')return;e.respondWith(fetch(e.request).catch(()=>new Response('<!doctype html><meta name=viewport content=\"width=device-width\"><body style=\"background:#0b0c12;color:#f6f7fb;font-family:sans-serif;padding:24px\"><h1>Void University</h1><p>You are offline. Connect to the internet, then press Try again.</p><p><button onclick=\"location.reload()\" style=\"font:inherit;font-size:16px;padding:10px 20px;border-radius:999px;border:1px solid #5fd4ff;background:transparent;color:#5fd4ff;cursor:pointer\">Try again</button></p>',{headers:{'content-type':'text/html; charset=utf-8'}})))});\n";
const INSTALL = '<button type="button" class="inst" id="inst" hidden>Install</button><div class="instnote" id="instnote" hidden><b>Add Void University to your home screen</b><p>Tap the Share button <span aria-hidden="true">(the square with an arrow)</span>, then <b>Add to Home Screen</b>.</p><button type="button" id="instok">Got it</button></div>'
  + '<script>(function(){var b=document.getElementById("inst"),n=document.getElementById("instnote"),P=null;'
  + 'var ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);'
  + 'var done=function(){return matchMedia("(display-mode: standalone)").matches||navigator.standalone===true};'
  + 'var show=function(){b.hidden=done()||!(P||ios)};'
  + 'addEventListener("beforeinstallprompt",function(e){e.preventDefault();P=e;show()});addEventListener("appinstalled",function(){P=null;show()});'
  + 'b.onclick=function(){if(P){P.prompt();P.userChoice.then(function(){P=null;show()},function(){});return}n.hidden=!n.hidden};'
  + 'document.getElementById("instok").onclick=function(){n.hidden=true};show();'
  + 'if("serviceWorker" in navigator&&location.protocol==="https:")addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})})()</script>';
// Type (B, 19 Nov 2026: no AI-built look; Inter is the face every machine-made page uses). profile.json "type" names
// the faces the site is built with; the preview has a Type picker beside the Look picker so they can be judged on the
// real pages. The public copy loads only the faces it uses.
const TYPE = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'profile.json'), 'utf8')).type || 'inter'; } catch (e) { return 'inter'; } })();
const TYPES = {
  inter: { name: 'Inter (as it was)', href: 'fonts/inter.css' },
  hyper: { name: 'Atkinson Hyperlegible, made for easy reading', href: 'fonts/hyper.css' },
  literata: { name: 'Literata, a book face', href: 'fonts/literata.css' },
};
// The typefaces are kept on the site (fonts/, each under the SIL Open Font License), so no visit asks Google for anything.
const FONTS = (LIVE ? [TYPE] : Object.keys(TYPES)).map((k) => '<link href="' + (TYPES[k] || TYPES.inter).href + '" rel="stylesheet">').join('');
const TYPECSS = `
html[data-type="hyper"]{--body:"Atkinson Hyperlegible Next","Atkinson Hyperlegible",Verdana,sans-serif;--head:"Bricolage Grotesque","Atkinson Hyperlegible Next",Verdana,sans-serif}
html[data-type="literata"]{--body:Literata,"Iowan Old Style",Palatino,serif;--head:"Schibsted Grotesk",Verdana,sans-serif}
html[data-type="literata"] body{font-size:17px}
`;
const CARDCSS = `.card{flex:0 0 auto;display:flex;flex-direction:column;border-radius:8px;overflow:hidden;background:var(--panel);border:1px solid var(--line);text-decoration:none;color:var(--fg);transition:transform .18s ease,border-color .18s ease}
.card:hover,.card:focus-visible{transform:translateY(-3px);border-color:var(--gold);outline:none}
.card .ph{background:var(--deep);overflow:hidden}.card .ph img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease}.card:hover .ph img{transform:scale(1.04)}
.card .t{padding:14px 16px 16px;display:flex;flex-direction:column;gap:4px}
.card small{font-size:14px;color:var(--gold)}
.card b{font-family:var(--head);font-weight:600;line-height:1.2}
.card span{color:var(--soft);font-size:14px;line-height:1.45}
.course{width:340px}.course .ph{aspect-ratio:16/10}.course b{font-size:24px}
.mini{width:220px}.mini .ph{aspect-ratio:4/3}.mini b{font-size:18px}.mini span{font-size:13px}
.chan{width:300px}.chan .ph{aspect-ratio:16/9}.chan b{font-size:19px}.chan span{font-size:13px}`;
const BASE = `:root{--bg:#0b1220;--panel:#111a2c;--panel2:#17223a;--line:#24304a;--fg:#efe9dc;--dim:#9aa3b5;--acc:#d4b06a;--gold:#d4b06a;--pink:#e08a8f;--ink:#0b1220;--soft:#cfd2dc;--line2:#2c3550;--panel3:#141c2e;--dim2:#aab0c2;--chip:#1c2a33;--deep:#0a101c;--head:Fraunces,Georgia,serif;--body:Inter,system-ui,Segoe UI,Roboto,sans-serif;--radius:8px}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:calc(var(--hh,64px) + 14px)}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 var(--body)}a{color:var(--acc)}
.serif{font-family:var(--head)}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{transition-duration:.01ms !important;animation-duration:.01ms !important;animation-iteration-count:1 !important}.card:hover,.card:focus-visible{transform:none}.card:hover .ph img{transform:none}}
header.top{display:flex;flex-wrap:nowrap;align-items:center;gap:10px 18px;padding:10px 32px;border-bottom:1px solid var(--line);background:var(--deep);position:sticky;top:0;z-index:50}
.crest{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--fg)}
.crest svg{width:34px;height:34px;flex:none}
.crest span{white-space:nowrap}.crest b{font-family:var(--head);font-weight:700;font-size:19px;letter-spacing:.14em;text-transform:uppercase}
.crest small{display:block;font-size:12px;color:var(--gold);margin-top:1px}
.nav{display:flex;gap:4px;flex-wrap:nowrap;margin-left:auto;position:static;align-items:center;min-width:0}.nav>a{white-space:nowrap}.nav a.here{overflow:hidden;text-overflow:ellipsis;min-width:0;max-width:34vw}.navtools{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding-top:12px;border-top:1px solid var(--line)}.navtools:empty{display:none}.navtools .navrules{color:var(--gold);text-decoration:none;font-weight:600;padding:6px 0}.navtools .navrules:hover{text-decoration:underline}.navtools .instnote{position:static;width:auto}@media (max-width:900px){.crest small{display:none}}
.navall{position:relative}.navall summary{cursor:pointer;list-style:none;font-size:14px;padding:6px 12px;border-radius:6px;color:var(--fg);border:1px solid var(--line)}.navall summary::-webkit-details-marker{display:none}.navall summary:hover{border-color:var(--gold)}
.navlist{position:absolute;right:0;top:calc(100% + 8px);z-index:30;width:min(640px,calc(100vw - 40px));max-height:70vh;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px 18px;padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 18px 40px rgba(0,0,0,.5)}
@media (max-width:1000px){header.top{padding:8px 20px;gap:6px 14px}.navall{position:static}.navlist{left:20px;right:20px;width:auto}}
.navlist h5{margin:0 0 4px;font-size:14px;color:var(--acc)}.navlist a,.navlist b{display:block;padding:4px 0;font-size:14px}
.nav a,.nav b{font-size:14px;padding:6px 12px;border-radius:6px;text-decoration:none;color:var(--dim)}
.nav a:hover{color:var(--fg);background:var(--panel2)}.nav b{color:var(--gold);font-weight:600}
.lookpick{font-size:12px;color:var(--dim);display:flex;align-items:center;gap:6px}.lookpick select{font:inherit;font-size:12px;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:999px;padding:3px 8px}
.draft{font-size:12px;color:var(--gold);border:1px solid #5a4a24;padding:3px 9px;border-radius:999px}
.inst{font:inherit;font-size:14px;padding:6px 14px;border-radius:999px;border:1px solid var(--gold);background:transparent;color:var(--gold);cursor:pointer}.inst:hover{background:var(--panel2)}
.instnote{position:absolute;right:16px;top:calc(100% + 8px);z-index:40;width:min(340px,calc(100vw - 32px));padding:16px 18px;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 18px 40px rgba(0,0,0,.5);font-size:15px}.instnote p{margin:8px 0 12px;color:var(--soft)}
.instnote button{font:inherit;font-size:14px;padding:6px 14px;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer}
.nav a.here{color:var(--gold);font-weight:600}
html:not([data-look="bright"]) .vatm{display:none}
.vatm~*:where(:not(.vatm)){position:relative;z-index:1}
#colhost{position:relative;z-index:1;overflow:clip}
html[data-look="bright"] #colhost .hero{border-bottom:0}html[data-look="bright"] #colhost .hero>img{display:none}html[data-look="bright"] #colhost .hero::after{background:linear-gradient(90deg,rgba(7,8,12,.9) 0%,rgba(7,8,12,.78) 42%,rgba(7,8,12,.2) 78%,rgba(7,8,12,.1) 100%)}
html[data-look="bright"] #colhost main>h2,html[data-look="bright"] #colhost .row>h2,html[data-look="bright"] #colhost .who{text-shadow:0 1px 10px rgba(7,8,12,.95),0 0 3px rgba(7,8,12,.9)}html[data-look="bright"] #colhost h2 small,html[data-look="bright"] #colhost .who small{color:var(--soft)}
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
  return `<!doctype html><html lang="en" data-look="${LOOK}" data-type="${TYPE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${APPHEAD}<title>${esc(b.title)} | Void University</title>${FONTS}<style>${BASE}
.swrap{display:grid;grid-template-columns:250px minmax(0,1fr);gap:34px;max-width:1500px;margin:0 auto;padding:26px 32px 60px}
.swrap nav{position:sticky;top:calc(var(--hh,64px) + 16px);align-self:start;max-height:calc(100vh - var(--hh,64px) - 36px);overflow:auto;display:flex;flex-direction:column;gap:2px}
.swrap nav h4{margin:0 0 8px;font-size:14px;color:var(--dim)}
.swrap nav a{display:flex;gap:10px;padding:7px 10px;border-radius:6px;color:var(--fg);text-decoration:none;font-size:15px}
.swrap nav a:hover{background:var(--panel)}.swrap nav a span{color:var(--acc);min-width:18px}
.shero{padding:26px 30px;border:1px solid var(--line);border-radius:10px;background:var(--panel);margin-bottom:26px}
.shero .dom{font-size:14px;color:var(--acc)}
.shero h1{font-family:var(--head);font-size:40px;margin:8px 0 6px;line-height:1.1}.shero p{margin:6px 0;color:var(--soft);font-size:17px;max-width:900px}.shero .src{font-size:14px;color:var(--dim)}.shero a{color:var(--acc)}
.shero .caution{color:var(--gold);font-size:15px;border-left:3px solid var(--gold);padding-left:12px}
.shero .both button{font:inherit;font-size:14px;margin-top:10px;padding:7px 14px;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer}
.chap{margin:0 0 34px}.chap h2{font-family:var(--head);font-size:28px;margin:0 0 6px;display:flex;gap:12px;align-items:baseline}.chap h2 .n{color:var(--acc);font-size:20px}
.chap .why{color:var(--dim);margin:0 0 14px;font-size:16px}
.pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:26px;padding:14px 0;border-top:1px solid var(--line);align-items:start}
.pair .plain p{margin:0;font-size:18px;line-height:1.6}
.pair .warn{margin-top:10px !important;font-size:15px !important;padding:10px 12px;border:1px solid #6b3a3d;background:#221316;border-radius:8px;color:#f0c9cb}.pair .warn a{color:var(--pink)}
.pair .old summary{cursor:pointer;color:var(--dim);font-size:14px}
.pair .old p{margin:8px 0 0;font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#a9afbf}
@media (max-width:1000px){.swrap{grid-template-columns:1fr;padding:18px 20px 50px}.swrap nav{position:static;flex-direction:row;flex-wrap:wrap;max-height:none}.swrap nav h4{width:100%}.pair{grid-template-columns:1fr;gap:8px}.shero h1{font-size:30px}}
${LOOKCSS}${TYPECSS}</style></head><body>
${top(b.slug, all)}
<div class="swrap"><nav><h4>Chapters</h4>${toc}</nav><main>
<div class="shero"><div class="dom">${esc(b.area)}, an old book in plain English</div><h1>${esc(b.title)}</h1><p>${esc(b.needIt)}</p>${b.caution ? '<p class="caution">' + esc(b.caution) + '</p>' : ''}
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
  // Home and the page's own name stay in reach while you read (the header is sticky): Home goes to the front page, the
  // name goes back to the start of the page. The installed app has no browser Back, so this is the way out.
  const home = current === 'home' ? '<a href="index.html" aria-current="page">Home</a>' : '<a href="index.html" title="Back to the front page">&#8592; Home</a>';
  const hereLink = (o) => '<a class="here" href="#top" title="Back to the start of this page">&#8593; ' + esc(o.name) + '</a>';
  const link = (o) => (o.slug === current ? hereLink(o) : '<a href="' + esc(o.slug) + '.html">' + esc(o.name) + '</a>');
  const everything = all.concat(SHELFBOOKS);
  let links;
  {
    const here = everything.find((o) => o.slug === current);
    const areas = [...new Set(all.map((o) => o.domain))];
    const groups = areas.map((a) => '<div><h5>' + esc(a) + '</h5>' + all.filter((o) => o.domain === a).map(link).join('') + '</div>').join('')
      + (SHELFBOOKS.length ? '<div><h5>Old books in plain English</h5>' + SHELFBOOKS.map(link).join('') + '</div>' : '');
    links = home + (here ? hereLink(here) : '') + '<details class="navall"><summary title="Every course, by area">Courses</summary><div class="navlist">' + groups + '<div class="navtools"><a class="navrules" href="index.html#tools" title="Tools to learn by doing: study together, the explainers, If this, then that">Tools</a><a class="navrules" href="study.html" title="One shared screen and everyone\'s phones">Study together</a>' + (RULES ? '<a class="navrules" href="ifttt.html" title="Every If this, then that rule in the University, by area">If this, then that: every rule</a>' : '') + INSTALL + DRAFT + '</div></div></details>';
  }
  // The background (B, 19 Nov 2026: "i want these used in the same ways as as vtv. the way the bg moves", "make the background drift on
  // my tablet too"; 22 Nov 2026: "i want the bg sittuation to be fixed on all pages") is the one every Void area shares,
  // voidtv.net's assets/brand/atmos/atmos.js, loaded from there as the menu is, so a fix reaches this site with no rebuild. It gets this
  // site's own pictures: all four in turn on the front page, the academy behind a course, the hall behind every other page.
  const far = current === 'home' ? 'hall.jpg,academy.jpg,archives.jpg,desk.jpg' : all.some((o) => o.slug === current) ? 'academy.jpg' : 'hall.jpg';
  const atmos = '<script src="https://voidtv.net/assets/brand/atmos/atmos.js?v=' + require('../../scripts/lib/areas-v')('atmos/atmos.js') + '" defer data-base="img/bg/" data-far="' + far + '"' + (current === 'home' ? '' : ' data-fit="cover"') + '></script>';
  // Every voidtv.net area (Bryan, 20 Nov 2026, M1): the hamburger drawer from voidtv.net's one list. The menu only, no
  // card: Open Yale's terms (oyc.yale.edu/terms) say no ads on the University while it uses Yale material.
  const AREAS = '<script src="https://voidtv.net/assets/brand/areas/areas.js?v=' + require('../../scripts/lib/areas-v')() + '" defer data-site="university" data-here="university" data-ads="off"></script>';
  return atmos + AREAS + '<header class="top"><span data-void-areas-menu></span><a class="crest" href="index.html">' + CREST + '<span><b>Void University</b><small>Learn from people who did it</small></span></a><nav class="nav">' + links + '</nav></header>'
    + '<script>(function(){var h=document.querySelector("header.top"),s=function(){document.documentElement.style.setProperty("--hh",h.offsetHeight+"px")};s();addEventListener("load",s);if(window.ResizeObserver)new ResizeObserver(s).observe(h);else addEventListener("resize",s)})()</script>';
}
const IMG = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'img', 'images.json'), 'utf8')); } catch (e) { return {}; } })();
// Only our own pictures are shown (Bryan, 21 Nov 2026: "the stale stco images in university"; 22 Nov: "I'm wanting younger
// modern images that go with the edgy voidtv aesthetic"). The stock photos gathered on 15 Nov stay in img/ and images.json
// until each is replaced, but no page shows them and the public copy does not carry them.
const img = (name) => (IMG[name] && /^our own/i.test(IMG[name].license || '') ? IMG[name].file : '');
// One hue for each area, so Money, Body, Mind and the rest differ at a glance: the unit's top edge and number, the row's
// mark, the glow on a card with no picture yet.
const AREAHUE = { Money: '#f2a93b', Food: '#ff8a3d', Home: '#ffd166', Body: '#ff6b8b', Mind: '#5fd4ff', Words: '#7ee0c3', 'Law and rights': '#8fa8ff', 'Work and trades': '#f59e6c', Machines: '#9ad1ff', Making: '#c4f06a', Land: '#5fe39a', 'Civics and history': '#e6c067', 'Faith and philosophy': '#a78bfa', Family: '#ff8fd0', Emergencies: '#ff5c5c', 'Earth and climate': '#19c6b0' };
const hue = (area) => AREAHUE[area] || '#5fd4ff';
// The top of a card: its own picture, or its own words on the area's colour.
const ph = (pic, words, lazy) => (pic ? '<div class="ph"><img' + (lazy ? ' loading="lazy"' : '') + ' src="' + pic + '" alt=""></div>' : '<div class="ph face"><span>' + esc(words || '') + '</span></div>');
// A course in one line of its own: the everyday thing its first lesson teaches with.
const like = (c) => { const u = (c.units || []).find((x) => x.scene && x.scene.analogy); if (!u) return ''; const a = String(u.scene.analogy); return 'Like ' + (/^[A-Z][a-z ]/.test(a) ? a[0].toLowerCase() + a.slice(1) : a); };
// Open Yale's terms (read 15 Nov 2026 at oyc.yale.edu/terms): credit the teacher and Yale, link the course page, and
// include the Creative Commons licence. So every CC licence on a page links to its own deed.
const licence = (l) => { const m = /CC (BY(?:-NC)?(?:-SA|-ND)?) (\d\.\d)/.exec(String(l || '')); return m ? '<a href="https://creativecommons.org/licenses/' + m[1].toLowerCase() + '/' + m[2] + '/" target="_blank" rel="noopener license">' + esc(l) + '</a>' : esc(l); };
const LEVELNAME = { 'high school': 'High school', 'young adults': 'Young adults', everyday: 'Everyday life' };
const LEVELS = (c) => (c.levels || []).map((l) => '<span>' + esc(LEVELNAME[l] || l) + '</span>').join('');
const FOOT = () => `<footer>Free, no account. Lessons play from the Internet Archive; each piece names its source and licence. <a href="credits.html">Picture and type credits</a>.<br>
If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world. <a href="${DONATE}" target="_blank" rel="noopener">Donate to CASH</a></footer>`;
function chan(x) {
  return '<a class="card chan" href="' + esc(x.url) + '" target="_blank" rel="noopener"><div class="ph"><img loading="lazy" src="' + esc(x.thumb) + '" alt=""></div><div class="t"><small>Channel, ' + esc(x.count) + '</small><b>' + esc(x.name) + '</b><span>' + esc(x.what) + '</span></div></a>';
}
function home(all, list) {
  const full = all.filter((c) => c.shelf !== 'supplement');
  const sup = all.filter((c) => c.shelf === 'supplement');
  const card = (c) => '<a class="card course" data-slug="' + esc(c.slug) + '" data-units="' + c.units.length + '" data-lv="' + esc((c.levels || []).join('|')) + '" href="' + esc(c.slug) + '.html">' + ph(img('c-' + c.slug) || img('a-' + c.domain.toLowerCase().replace(/[^a-z0-9]+/g, '-')), like(c)) + '<div class="t"><small>' + esc(c.domain) + ', ' + (c.planned > c.units.length ? c.units.length + ' of ' + c.planned + ' units' : c.units.length + (c.units.length === 1 ? ' unit' : ' units')) + '</small><b>' + esc(c.name) + '</b><span>' + esc(String(c.why).split('. ')[0].replace(/\.$/, '')) + '.</span></div></a>';
  const mini = (c, u) => '<a class="card mini" href="' + esc(c.slug) + '.html#u' + u.n + '">' + (img('m' + u.n) ? ph(img('m' + u.n), '', true) : '') + '<div class="t"><b>' + esc(u.title) + '</b><span>' + esc(u.scene ? u.scene.analogy : '') + '</span></div></a>';
  const row = (title, note, cards, id, area) => '<section class="row"' + (id ? ' id="' + id + '"' : '') + (area ? ' style="--area:' + hue(area) + '"' : '') + '><h2><span>' + esc(title) + '</span>' + (note ? '<small>' + esc(note) + '</small>' : '') + '</h2><div class="rowwrap"><button class="arrow l" aria-label="Back">&#8249;</button><div class="track">' + cards + '</div><button class="arrow r" aria-label="More">&#8250;</button></div></section>';
  // A practice site sits in its area's row as one more card, for every level, and opens in a new tab.
  const gymCard = (g) => '<a class="card course" data-lv="high school|young adults|everyday" href="' + esc(g.url) + '" target="_blank" rel="noopener">' + ph(img('a-' + g.area.toLowerCase().replace(/[^a-z0-9]+/g, '-')), g.rooms.length + ' ' + (g.word || 'room') + 's to practise in') + '<div class="t"><small>' + esc(g.area) + ', practice, ' + g.rooms.length + ' rooms</small><b>' + esc(g.name) + '</b><span>' + esc(g.what) + '</span></div></a>';
  const areaId = (t) => 'area-' + t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const seen = new Set();
  const chans = (cs) => cs.flatMap((c) => c.channels || []).filter((x) => !seen.has(x.url) && seen.add(x.url));
  const rows = list.types.map((t) => {
    const cs = full.filter((c) => c.domain === t);
    if (!cs.length) return '';
    const ss = t === 'Mind' ? sup : [];
    const ch = chans(cs.concat(ss));
    const gyms = PRACTICE.filter((g) => g.live && g.area === t);
    return row(t, cs.length + (cs.length === 1 ? ' course' : ' courses'), cs.map(card).join('') + gyms.map(gymCard).join(''), areaId(t), t)
      + ss.map((c) => row(c.name, 'short pieces any course can use', c.units.map((u) => mini(c, u)).join(''), '', t)).join('')
      + (ch.length ? row('Channels for ' + t, 'whole series on the Internet Archive that go with these courses', ch.map(chan).join(''), '', t) : '');
  }).join('');
  const shelfRow = SHELFBOOKS.length ? row('Old books in plain English', 'useful old how-to, with the printed words beside it', SHELFBOOKS.map((b) => '<a class="card course" data-lv="' + esc((b.levels || []).join('|')) + '" href="' + esc(b.slug) + '.html">' + ph(img('a-' + String(b.area).toLowerCase().replace(/[^a-z0-9]+/g, '-')), 'An old book, in plain English') + '<div class="t"><small>' + esc(b.area) + ', printed ' + esc(String(b.year)) + ', ' + b.chapters.length + ' chapters</small><b>' + esc(b.title) + '</b><span>' + esc(b.needIt) + '</span></div></a>').join('')) : '';
  // One tile for each area that has a course, and the tile opens that area's row. An area with nothing in it yet is
  // not shown: a tile that leads nowhere is a placeholder.
  const tiles = list.types.map((t) => {
    const n = full.filter((c) => c.domain === t).length; // same count as the row: the mechanisms shelf is not a course
    return n ? '<a class="area has" style="--area:' + hue(t) + '" href="#' + areaId(t) + '">' + (img('a-' + t.toLowerCase().replace(/[^a-z0-9]+/g, '-')) ? '<img loading="lazy" src="' + img('a-' + t.toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '" alt="">' : '') + '<div><b>' + esc(t) + '</b><small>' + n + (n === 1 ? ' course' : ' courses') + '</small></div></a>' : '';
  }).join('');
  return `<!doctype html><html lang="en" data-look="${LOOK}" data-type="${TYPE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${APPHEAD}
<title>Void University</title>
${FONTS}
<style>
${BASE}
.hero{position:relative;min-height:340px;display:flex;align-items:flex-end;border-bottom:1px solid var(--line);overflow:hidden}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.75) brightness(.55)}
.hero::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,18,32,.15) 0%,rgba(11,18,32,.65) 60%,var(--bg) 100%)}
.hero div{position:relative;z-index:1;max-width:1400px;width:100%;margin:0 auto;padding:40px 32px 34px}
.hero h1{font-family:var(--head);font-weight:700;font-size:48px;line-height:1.08;margin:0 0 12px;max-width:820px}
.hero p{margin:0;color:#e4ddcc;font-size:19px;max-width:680px}
main{max-width:1400px;margin:0 auto;padding:6px 12px 28px}
h2{margin:34px 20px 12px;display:flex;align-items:baseline;gap:14px;border-bottom:1px solid var(--line);padding-bottom:8px}
h2 span{font-family:var(--head);font-weight:600;font-size:24px}h2 small{color:var(--dim);font-size:14px;font-weight:400}
.rowwrap{position:relative;padding:0 20px}
.track{display:flex;gap:18px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;padding:6px 4px 14px;scrollbar-width:none;scroll-behavior:smooth}.track::-webkit-scrollbar{display:none}
${CARDCSS}
.arrow{position:absolute;top:42%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:1px solid var(--gold);background:rgba(11,18,32,.92);color:var(--gold);font-size:28px;line-height:40px;padding:0;cursor:pointer;z-index:2;box-shadow:0 2px 12px rgba(0,0,0,.6)}
.arrow.l{left:-2px}.arrow.r{right:-2px}.arrow:hover{background:var(--gold);color:var(--ink)}.arrow[hidden]{display:none}
@media(hover:none){.arrow{display:none}}
.who{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:26px 20px 0}.who>span{font-family:var(--head);font-size:18px;margin-right:6px}
.who button{font:inherit;font-size:14px;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:999px;padding:7px 14px;cursor:pointer}.who button.on{border-color:var(--gold);color:var(--gold)}
.who small{flex-basis:100%;color:var(--dim);font-size:13px}
#find{font:inherit;font-size:15px;margin-left:auto;min-width:260px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--fg)}#find:focus{outline:none;border-color:var(--gold)}
#found,#resume{margin:14px 20px 0;padding:12px 16px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
#found a{display:block;padding:6px 0;color:var(--fg);text-decoration:none;border-bottom:1px solid var(--line)}#found a:last-child{border-bottom:0}#found a small{color:var(--acc);margin-right:10px}#found a:hover b{color:var(--gold)}#found p{margin:0;color:var(--dim)}
#resume{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline}#resume[hidden]{display:none}#resume span{color:var(--dim);font-size:14px}#resume a{color:var(--gold);font-family:var(--head);font-size:18px;text-decoration:none}
.card .prog{font-style:normal;font-size:12px;color:#8fd6aa}
@media (max-width:1000px){#find{margin-left:0;flex-basis:100%}}
.course.off{display:none}
.door{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:18px;max-width:1400px;margin:0 auto;padding:22px 32px 6px}
.door .kick{font-size:14px;font-weight:700;color:var(--acc)}
.ask{background:linear-gradient(135deg,rgba(255,79,139,.13),rgba(95,212,255,.07)),var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px 28px;box-shadow:0 14px 40px rgba(0,0,0,.35)}
.ask h1{font-family:var(--head);font-size:34px;line-height:1.14;margin:8px 0 16px;max-width:none}
.ask .opts{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 12px}.ask .opts button,.mem .mc button,.mem .nextq{font:inherit;font-size:16px;padding:10px 16px;border-radius:10px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer}
.ask .opts button:hover:not(:disabled),.mem .mc button:hover:not(:disabled){border-color:var(--acc)}.ask .opts button.real,.mem .mc button.real{border-color:#5fe39a;color:#5fe39a}.ask .opts button.mine:not(.real),.mem .mc button.mine{border-color:#ff8f96;color:#ff8f96}
.ask .said{margin:0 0 12px;font-size:17px;padding:10px 14px;border-left:3px solid var(--gold);background:rgba(0,0,0,.25);border-radius:0 8px 8px 0}.ask .go{display:inline-block;margin:0 0 10px;padding:10px 18px;border-radius:10px;background:#ff4f8b;color:#fff;font-weight:700;text-decoration:none}.ask .how{margin:0;color:var(--soft);font-size:15px}.ask .go:not([hidden])~.how{display:none}.ask .go[hidden]{display:none}
.doorside{display:flex;flex-direction:column;gap:14px}.doorside>div{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 18px}.doorside.known .welcome{display:none}.welcome b{font-family:var(--head);font-size:21px}.welcome p{margin:8px 0 0;color:var(--soft);font-size:15px}
.mem b{display:block;font-family:var(--head);font-size:19px;margin:2px 0 6px}.mem .kick{color:var(--gold)}.mem small{display:block;color:var(--dim);font-size:13px}.mem .mq{margin:4px 0 8px;font-size:16px}.mem .mc{display:flex;flex-direction:column;gap:6px}.mem .mc button{text-align:left;font-size:15px;padding:8px 12px}.mem .ok{color:#5fe39a}.mem .no{color:#ffb3b8}.mem p{font-size:15px}.mem .nextq{margin-top:4px;font-size:14px;padding:7px 14px}
.you .line{margin:0 0 6px;font-size:16px}.you #resume{margin:0;padding:0;border:0;background:none}
.tools{max-width:1400px;margin:0 auto}.tools h2{margin-top:22px}.toolrow{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;padding:0 20px}\n.tool{display:grid;grid-template-columns:52px 1fr;gap:3px 14px;align-items:start;padding:16px 18px;border-radius:14px;background:var(--panel);border:1px solid var(--line);color:var(--fg);text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.3)}.tool:hover{border-color:var(--acc)}.tool .mark{grid-row:1 / span 3;width:52px;height:52px;border-radius:14px;border:1px solid var(--line)}.tool b{font-family:var(--head);font-size:19px}.tool span:not(.mark){color:var(--soft);font-size:14px}.tool i{font-style:normal;color:var(--acc);font-size:13px;font-weight:600}\n.m-study{background:repeating-linear-gradient(90deg,#fff 0 6px,#0b0d14 6px 9px),repeating-linear-gradient(0deg,#fff 0 6px,#0b0d14 6px 9px);background-blend-mode:multiply}.m-earth{background:url(img/explain/earth.jpg) 30% 40%/240% auto;border-radius:50%!important}.m-rules{background:linear-gradient(135deg,#ff4f8b 0 48%,transparent 48% 52%,#5fd4ff 52%)}.m-practice{background:radial-gradient(circle at 50% 40%,#ffc44d,#ff4f8b 60%,#6a2c8a)}\n.wrong{max-width:1400px;margin:0 auto}.wrong h2{margin-top:22px}.qrow{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;padding:0 20px}
.qcard{display:flex;flex-direction:column;gap:8px;min-height:140px;padding:16px 18px;border-radius:14px;background:var(--panel);border:1px solid var(--line);border-top:3px solid var(--area);color:var(--fg);text-decoration:none}.qcard:hover{border-color:var(--area)}.qcard small{color:var(--dim);font-size:13px}.qcard b{font-family:var(--head);font-size:19px;line-height:1.22;flex:1}.qcard i{font-style:normal;color:var(--area);font-size:14px;font-weight:600}
.together{display:flex;flex-wrap:wrap;gap:4px 16px;align-items:baseline;max-width:1360px;margin:16px auto 0;padding:14px 18px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--fg);text-decoration:none}.together b{font-family:var(--head);font-size:19px}.together span{color:var(--soft);font-size:15px;flex:1 1 420px}.together em{font-style:normal;color:var(--acc);font-weight:600}.together:hover{border-color:var(--acc)}
@media (max-height:600px) and (min-width:901px){.ask{padding:18px 24px}.ask h1{font-size:26px;margin:6px 0 12px}.ask .opts button{padding:8px 14px;font-size:15px}}
@media (max-width:900px){.door{grid-template-columns:1fr;padding:16px 16px 4px}.ask h1{font-size:27px}.together{margin:16px 16px 0}}
.ruleslink{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;margin:18px 20px 0;padding:14px 18px;border:1px solid var(--gold);border-radius:12px;background:var(--panel);color:var(--fg);text-decoration:none}.ruleslink b{font-family:var(--head);font-size:22px;color:var(--gold)}.ruleslink span{color:var(--soft);font-size:15px}.ruleslink:hover{background:var(--panel2)}
.areas{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;padding:0 20px}
.area{display:block;color:var(--fg);text-decoration:none;position:relative;border-radius:8px;overflow:hidden;aspect-ratio:16/10;border:1px solid var(--line)}
.area img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:grayscale(1) brightness(.45)}
.area.has img{filter:saturate(.85) brightness(.6)}.area.has{border-color:var(--gold)}.area.has:hover img,.area.has:focus-visible img{filter:saturate(1) brightness(.75)}
.area div{position:absolute;left:0;right:0;bottom:0;padding:12px 14px;background:linear-gradient(0deg,rgba(11,18,32,.92),rgba(11,18,32,0))}
.area b{display:block;font-family:var(--head);font-size:19px;font-weight:600}.area small{color:var(--dim);font-size:13px}.area.has small{color:var(--gold)}
@media(max-width:900px){.hero h1{font-size:36px}.course{width:290px}}
${LOOKCSS}${TYPECSS}</style></head><body>
${top('home', all)}
<div id="colhost"><div class="door"><div class="ask" id="door"><h1>Big ideas, shown with everyday things.</h1><div class="opts"></div><p class="said" hidden aria-live="polite"></p><a class="go" hidden></a><p class="how">Today's question. Guess first, then see it happen, with the measured numbers.</p></div><div class="doorside" id="doorside"><div class="welcome"><b>Big ideas, shown with everyday things.</b><p>Each lesson starts from something you already know, then shows you the bigger idea working the same way. Every course is free, and there is no account to make.</p></div><div class="mem" id="mem" hidden><b></b><div class="body"></div></div><div class="you" id="you" hidden><div id="resume" hidden></div></div></div></div>${toolsRow(all)}${(() => { const h = hooksOf(all); return h.length ? '<section class="wrong"><h2><span>Things people get wrong</span><small>start from the question</small></h2><div class="qrow">' + h.map((x) => '<a class="qcard" style="--area:' + hue(x.area) + '" href="' + esc(x.href) + '" title="Open: ' + esc(x.where) + '"><small>' + esc(x.area) + '</small><b>' + esc(x.hook) + '</b><i>' + esc(x.where) + '</i></a>').join('') + '</div></section>' : ''; })()}${(() => { const c = all.find((o) => o.units.some(shipsAnswer)); const u = c && c.units.find(shipsAnswer); return u ? '<a class="together" href="' + esc(c.slug) + '.html#u' + u.n + '" title="Open a lecture you can take together"><b>Learn together</b><span>Play a lecture on a big screen; everyone answers on their own phone, with no account. For a class, a family or a community night. Open a lecture and press Answer on your phones.</span><em>Start with ' + esc(c.name) + '</em></a>' : ''; })()}
<main><div class="who"><span>Who is it for?</span><button class="on" data-lv="">Everyone</button><button data-lv="high school">High school</button><button data-lv="young adults">Young adults</button><button data-lv="everyday">Everyday life</button><input type="search" id="find" placeholder="Find a course or a lesson" aria-label="Find a course or a lesson"><small>Everyday life: not for a job in the field, just useful for living, deciding and understanding people.</small></div>
<div id="found" hidden></div>
${RULES ? '<a class="ruleslink" href="ifttt.html" title="Every If this, then that rule in the University, by area"><b>If this, then that</b><span>' + RULES + ' rules across ' + new Set(rulesOf(all).map((r) => r.area)).size + ' areas. Make each one happen yourself, then see them all in one place.</span></a>' : ''}
${rows}
${shelfRow}
<h2><span>Jump to an area</span></h2><div class="areas">${tiles}</div></main></div>
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
var DOORQ = ${JSON.stringify(doorQuestions(all)).replace(/</g, '\\u003c')}, RULESN = ${RULES};
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
(function () {
  var Q = DOORQ, box = document.getElementById('door'); if (!box || !Q.length) return;
  var day = Math.floor(Date.now() / 864e5), q = Q[day % Q.length];
  var t = function (tag, cls, s) { var e = document.createElement(tag); if (cls) e.className = cls; if (s != null) e.textContent = s; return e; };
  box.querySelector('h1').textContent = q.q;
  var opts = box.querySelector('.opts'), said = box.querySelector('.said'), go = box.querySelector('.go');
  q.options.forEach(function (o, i) {
    var b = t('button', null, o); b.type = 'button'; b.title = 'Choose this answer';
    b.onclick = function () {
      opts.querySelectorAll('button').forEach(function (x, j) { x.disabled = true; x.classList.toggle('mine', j === i); x.classList.toggle('real', j === q.answer); });
      said.textContent = 'You said: ' + o.toLowerCase() + '. ' + q.after; said.hidden = false; go.hidden = false;
    };
    opts.appendChild(b);
  });
  go.href = q.href; go.textContent = q.go; go.title = 'Open the lesson where you can see this happen';
})();
(function () {
  var get = function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  var put = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  var done = get('vu:done', {}), at = get('vu:doneAt', {}), plan = get('vu:recall', {}), found = get('vu:found', []);
  var units = []; Object.keys(done).forEach(function (s) { (done[s] || []).forEach(function (n) { units.push(s + '/' + n); }); });
  var side = document.getElementById('doorside'), you = document.getElementById('you'), mem = document.getElementById('mem');
  var t = function (tag, cls, s) { var e = document.createElement(tag); if (cls) e.className = cls; if (s != null) e.textContent = s; return e; };
  // one plain line of what you know
  var bits = [];
  if (units.length) bits.push('You have finished ' + units.length + (units.length === 1 ? ' lesson' : ' lessons'));
  if (found.length) bits.push((bits.length ? 'found ' : 'You have found ') + found.length + ' of ' + RULESN + ' rules');
  if (bits.length) { you.insertBefore(t('p', 'line', bits.join(' and ') + '.'), you.firstChild); you.hidden = false; side.classList.add('known'); }
  if (!document.getElementById('resume').hidden) { you.hidden = false; side.classList.add('known'); }
  if (!units.length) return;
  var DAY = 864e5, STEPS = [1, 3, 7, 21], now = Date.now();
  fetch('recall.json').then(function (r) { return r.json(); }).then(function (bank) {
    var due = [], next = Infinity;
    units.forEach(function (u) {
      var b = bank[u]; if (!b) return;
      b.q.forEach(function (q, i) {
        var k = u + '/' + i, p = plan[k];
        if (!p) { p = plan[k] = { step: 0, due: (at[u] || now) + DAY }; }
        if (p.due <= now) due.push({ k: k, u: u, i: i, q: q, b: b }); else next = Math.min(next, p.due);
      });
    });
    put('vu:recall', plan);
    // mixed: take one from each lesson in turn
    var by = {}; due.forEach(function (d) { (by[d.u] = by[d.u] || []).push(d); });
    var mix = [], keys = Object.keys(by), r = 0;
    while (mix.length < 3 && keys.some(function (k) { return by[k].length; })) { var k = keys[r++ % keys.length]; if (by[k].length) mix.push(by[k].shift()); }
    mem.hidden = false; side.classList.add('known');
    var head = mem.querySelector('b'), body = mem.querySelector('.body');
    if (!mix.length) { head.textContent = 'Remember it: your questions come back ' + new Date(next).toLocaleDateString(undefined, { weekday: 'long' }); body.appendChild(t('p', null, 'Each one returns a day, three days, a week and three weeks after you finish a lesson. Pulling it back out is what makes it stay.')); return; }
    head.textContent = 'Remember it: ' + mix.length + (mix.length === 1 ? ' question is' : ' questions are') + ' ready';
    var i = 0;
    function show() {
      body.textContent = '';
      if (i >= mix.length) { body.appendChild(t('p', null, 'That is all for today. They come back again, further apart each time you get one.')); return; }
      var d = mix[i], q = d.q;
      body.appendChild(t('small', null, d.b.course + ': ' + d.b.title));
      body.appendChild(t('p', 'mq', q.q));
      var c = t('div', 'mc'); body.appendChild(c);
      q.choices.forEach(function (ch, j) {
        var b = t('button', null, ch); b.type = 'button'; b.title = 'Choose this answer';
        b.onclick = function () {
          c.querySelectorAll('button').forEach(function (x, m) { x.disabled = true; x.classList.toggle('real', m === q.a); x.classList.toggle('mine', m === j && j !== q.a); });
          var p = plan[d.k], right = j === q.a;
          p.step = right ? Math.min(p.step + 1, STEPS.length - 1) : 0; p.due = Date.now() + STEPS[p.step] * DAY; put('vu:recall', plan);
          body.appendChild(t('p', right ? 'ok' : 'no', (right ? 'Right. It comes back in ' : 'Not this time. It comes back tomorrow, and ') + (right ? STEPS[p.step] + ' days.' : 'again after that.') + ' ' + q.why));
          var more = t('button', 'nextq', i + 1 < mix.length ? 'Next question' : 'Done'); more.type = 'button'; more.title = 'Go on'; more.onclick = function () { i++; show(); }; body.appendChild(more);
        };
        c.appendChild(b);
      });
    }
    show();
  }).catch(function () {});
})();

</script>
</body></html>`;
}
function credits(all) {
  const rows = Object.keys(IMG).filter((k) => img(k)).map((k) => { const x = IMG[k]; return '<tr><td><img src="' + esc(x.file) + '" alt=""></td><td>' + esc(x.title || 'Untitled') + '</td><td>' + esc(x.creator || 'unknown') + '</td><td>' + esc(x.license) + '</td><td><a href="' + esc(x.page) + '" target="_blank" rel="noopener">' + esc(x.source) + '</a></td></tr>'; }).join('');
  return `<!doctype html><html lang="en" data-look="${LOOK}" data-type="${TYPE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${APPHEAD}<title>Photo credits | Void University</title>${FONTS}<style>${BASE}
main{max-width:1100px;margin:0 auto;padding:30px 32px}h1{font-family:var(--head)}table{width:100%;border-collapse:collapse;font-size:14px}td{border-bottom:1px solid var(--line);padding:8px;vertical-align:middle}td img{width:96px;height:60px;object-fit:cover;border-radius:4px;display:block}${LOOKCSS}${TYPECSS}</style></head><body>
${top('credits', all)}<main><h1>Picture credits</h1><p>The pictures on this site are our own. The Body picture is the whole body standing in Body Atlas, and its body parts are BodyParts3D (CC BY 4.0).</p><table>${rows}</table><h1>Backgrounds</h1><p>The pictures of the classroom and the archive room behind the pages are our own, made for Void University. The lightning, the static and the film grain over them are Void TV's own.</p><h1>Phones</h1><p>The QR code maker and the relay that passes questions between a screen and its phones are Void TV PLAY's own.</p><h1>Typefaces</h1><p>Atkinson Hyperlegible Next (Braille Institute), Bricolage Grotesque, Inter, Fraunces, Literata and Schibsted Grotesk are used under the SIL Open Font License and are served from this site.</p>${all.some((c) => c.units.some(shipsLab)) ? '<h1>Lab physics</h1><p>Things in the labs fall, roll and bounce using Planck.js by Erin Catto and Ali Shakiba, free to use under the <a href="planck-LICENSE.txt">MIT licence</a>. The labs themselves are our own work.</p>' : ''}${all.some((c) => c.units.some(shipsExplain)) ? '<h1>The Earth</h1><p>The Earth in the explainers is NASA Earth Observatory\'s Blue Marble Next Generation with topography and bathymetry, by Reto Stockli; NASA imagery is free to use with credit. Land and sea are told apart with Natural Earth\'s map data, which is in the public domain. The explainers are drawn with three.js (<a href="three-LICENSE.txt">MIT licence</a>) and are our own work; each names the papers and agencies its numbers come from.</p>' : ''}${all.some((c) => c.units.some(shipsScale)) ? '<h1>3D stages</h1><p>The 3D scale stages are drawn with three.js by the three.js authors, free to use under the <a href="three-LICENSE.txt">MIT licence</a>. The stages and what they show are our own work; each one names the papers its numbers come from.</p>' : ''}</main>${FOOT()}</body></html>`;
}

// A wrong address: wrangler.jsonc serves 404.html for it. Links start from the site root, since the wrong address can be
// any depth.
function notFound(all) {
  const list = all.filter((c) => c.shelf !== 'supplement').map((c) => '<a href="' + esc(c.slug) + '.html">' + esc(c.name) + '</a>').join('');
  return `<!doctype html><html lang="en" data-look="${LOOK}" data-type="${TYPE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/">${APPHEAD}<title>Page not found | Void University</title>${FONTS}<style>${BASE}
main{max-width:760px;margin:0 auto;padding:48px 32px 60px}h1{font-family:var(--head);font-size:36px;margin:0 0 10px}main p{color:var(--soft);font-size:17px}
.go{display:inline-block;margin:10px 0 26px;padding:10px 20px;border-radius:999px;border:1px solid var(--gold);color:var(--gold);text-decoration:none;font-size:16px}.go:hover{background:var(--panel2)}
.all{display:flex;flex-direction:column;gap:2px}.all a{padding:10px 12px;border-radius:8px;color:var(--fg);text-decoration:none;border:1px solid var(--line);background:var(--panel);font-size:16px}.all a:hover{border-color:var(--gold)}${LOOKCSS}${TYPECSS}</style></head><body>
${top('404', all)}<main><h1>That page is not here</h1><p>The address may be old or mistyped. Everything on Void University starts from the front page.</p><a class="go" href="index.html">&#8592; Front page</a><div class="all">${list}</div></main>${FOOT()}</body></html>`;
}

// The public copies of our own scripts carry the code only, never the working notes above it (B, 19 Nov 2026: no names
// in public pages or comments). The preview gets the same files, so what is checked is what ships.
const shipJs = (from, to) => fs.writeFileSync(to, fs.readFileSync(from, 'utf8').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n'));

// Start from an empty folder: a page left from an earlier build (a course since taken off Live) would otherwise deploy.
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
shipJs(path.join(DIR, 'crystal.js'), path.join(OUT, 'crystal.js'));
shipJs(path.join(DIR, 'scene.js'), path.join(OUT, 'scene.js'));
// A lab is on a page when the unit has one; the public copy carries only labs marked live.
const shipsLab = (u) => !!(u.lab && (!LIVE || u.lab.live));
const shipsScale = (u) => scalesOf(u).some((sc) => !LIVE || sc.live);
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
  for (const f of fs.readdirSync(DIR).filter((f) => used.has(f))) shipJs(path.join(DIR, f), path.join(OUT, f));
  for (const f of ['planck.min.js', 'planck-LICENSE.txt']) fs.copyFileSync(path.join(DIR, 'vendor', f), path.join(OUT, f));
}
// The scale stage and its drawing library go along only when a page shows a scale.
if (loaded.some((c) => c.units.some(shipsScale))) {
  shipJs(path.join(DIR, 'scale.js'), path.join(OUT, 'scale.js'));
  fs.copyFileSync(path.join(DIR, 'vendor', 'three.module.min.js'), path.join(OUT, 'three.module.min.js'));
  fs.copyFileSync(path.join(DIR, 'vendor', 'three-LICENSE.txt'), path.join(OUT, 'three-LICENSE.txt'));
}
// The explainer, its model, the drawing library and the Earth pictures go along only when a page shows one.
if (loaded.some((c) => c.units.some(shipsExplain))) {
  shipJs(path.join(DIR, 'explain.js'), path.join(OUT, 'explain.js'));
  shipJs(path.join(DIR, 'explain-model.js'), path.join(OUT, 'explain-model.js'));
  fs.copyFileSync(path.join(DIR, 'vendor', 'three.module.min.js'), path.join(OUT, 'three.module.min.js'));
  fs.copyFileSync(path.join(DIR, 'vendor', 'three-LICENSE.txt'), path.join(OUT, 'three-LICENSE.txt'));
  fs.cpSync(path.join(DIR, 'img', 'explain'), path.join(OUT, 'img', 'explain'), { recursive: true });
}
// Answer on your phones, in the public copy (Bryan, 21 Nov 2026: "Yes, build it"): the screen's script, PLAY's own QR
// maker, and the phone page at /join, which is where the relay on voidtv.net sends a phone that scans the code.
// Making questions stays in the preview on Bryan's PC: it writes course files, and the live site has nowhere to write.
if (LIVE) { // the study room needs the phone page and the QR maker in every public copy
  shipJs(path.join(DIR, 'make', 'answer-screen.js'), path.join(OUT, 'answer.js'));
  shipJs(path.join(DIR, '..', '..', 'play', 'src', 'qr.js'), path.join(OUT, 'qr.js'));
  const give = 'If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world. <a href="' + DONATE + '" target="_blank" rel="noopener">Donate to CASH</a>';
  fs.writeFileSync(path.join(OUT, 'join.html'), fs.readFileSync(path.join(DIR, 'make', 'phone.html'), 'utf8').replace('<!--give-->', () => give).replace('<!--home-->', '<p><a href="index.html" title="Go to the Void University front page">← Void University</a></p>'));
}
MECH = loaded.find((c) => c.shelf === 'supplement') || null;
RULES = rulesOf(loaded).length;
for (const c of loaded) if (c.shelf !== 'supplement') for (const u of c.units) for (const n of u.mechanisms || []) (USED[n] = USED[n] || []).push({ slug: c.slug, course: c.name, n: u.n, title: u.title });
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
for (const k of Object.keys(IMG)) if (img(k)) fs.copyFileSync(path.join(DIR, IMG[k].file), path.join(OUT, IMG[k].file)); // our own pictures only
// The font sheets and the files they name: every typeface in the preview (it has the picker), only the chosen one in the public copy.
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
for (const k of (LIVE ? [TYPES[TYPE] ? TYPE : 'inter'] : Object.keys(TYPES))) {
  const sheet = fs.readFileSync(path.join(DIR, 'fonts', k + '.css'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'fonts', k + '.css'), sheet);
  for (const m of sheet.matchAll(/url\(([a-z0-9-]+\.woff2)\)/g)) fs.copyFileSync(path.join(DIR, 'fonts', m[1]), path.join(OUT, 'fonts', m[1]));
}
fs.mkdirSync(path.join(OUT, 'img', 'bg'), { recursive: true });
for (const f of fs.readdirSync(path.join(DIR, 'img', 'bg')).filter((x) => /\.(jpg|png)$/.test(x))) fs.copyFileSync(path.join(DIR, 'img', 'bg', f), path.join(OUT, 'img', 'bg', f)); // the moving backgrounds
for (const f of APPICONS) fs.copyFileSync(path.join(DIR, 'img', f), path.join(OUT, 'img', f)); // home-screen icons (make-icons.js)
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify(MANIFEST));
fs.writeFileSync(path.join(OUT, 'sw.js'), SW);
fs.writeFileSync(path.join(OUT, 'credits.html'), credits(loaded));
fs.writeFileSync(path.join(OUT, 'recall.json'), JSON.stringify(recallBank(loaded)));
fs.writeFileSync(path.join(OUT, 'study.html'), studyPage(loaded));
shipJs(path.join(DIR, 'study.js'), path.join(OUT, 'study.js'));
if (RULES) fs.writeFileSync(path.join(OUT, 'ifttt.html'), iftttPage(loaded, JSON.parse(fs.readFileSync(path.join(DIR, 'list.json'), 'utf8'))));
fs.writeFileSync(path.join(OUT, '404.html'), notFound(loaded));
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
