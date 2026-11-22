// HQ > Void TV > Moments (Bryan, 22 Nov 2026: reorganize around what is in the news). Server side: scripts/lib/momentshq.js;
// the rules: assets/brand/moments/moments.js. Loaded by scripts/hq/index.html before its own script; these functions use its
// helpers (api, esc, jq, $, toast, render) when they run. Everything here works with no AI: type, press Preview, press Save,
// then Publish now at the top sends it to voidtv.net.
let MOMENTS = null, MOMENT_EDIT = null;
const MOMENT_FIELDS = [['items', 'Archive items', 'one a line, the part after archive.org/details/'], ['titles', 'Title words', 'one a line; whole words, so "auto" does not catch "Autobahn"'],
  ['wikidata', 'Wikidata ids', 'one a line, like Q94501'], ['people', 'People', 'one a line'], ['series', 'Series', 'one a line'],
  ['genres', 'Only these genres', 'one a line; empty = any'], ['systems', 'Only these machines (PLAY)', 'one a line, like dos, gba, snes; empty = any'], ['not', 'Never these', 'one a line: items to leave out']];
const AREA_NAMES = { play: 'PLAY games', shows: 'On Demand shows', movies: 'On Demand movies', live: 'Live TV', trivia: 'Trivia', uni: 'University' };

async function moments(m) {
  MOMENTS = await api('/api/moments');
  const rows = MOMENTS.moments.map((x, i) => {
    const pk = Object.entries(x.picks || {}).map(([a, p]) => esc(AREA_NAMES[a] || a) + ': ' + (p == null ? '<span class="dim">not wired yet</span>' : p.shows ? '<span class="green">' + p.count + ' picked</span>' : '<span class="gold">' + p.count + ' picked, row needs ' + p.min + '</span>')).join('<br>');
    const st = x.status === 'showing' ? 'green' : x.status === 'switched off' || x.status === 'over' ? 'dim' : 'gold';
    return '<tr><td><b>' + esc(x.name) + '</b><br><small class="dim">' + esc(x.id) + (x.kids ? ' · also on Kids' : '') + '</small>' + (x.problems.length ? '<br><small class="red">' + esc(x.problems.join(' ')) + '</small>' : '') + '</td>'
      + '<td>' + esc(x.start) + ' to ' + esc(x.end) + (x.peak ? '<br><small class="dim">peak ' + esc(x.peak) + '</small>' : '') + '</td>'
      + '<td class="' + st + '">' + esc(x.status) + '</td><td>' + pk + '</td><td>' + (x.ad && x.ad.line ? esc(x.ad.line) : '<span class="dim">none</span>') + '</td>'
      + '<td style="white-space:nowrap"><button class="sm" onclick="momentSwitch(' + i + ')">' + (x.on ? 'Switch off' : 'Switch on') + '</button> <button class="sm" onclick="momentEdit(' + i + ')">Edit</button> <button class="sm red" onclick="momentRemove(' + i + ')">Remove</button></td></tr>';
  }).join('');
  m.innerHTML = '<h2 style="margin-top:0">Moments <small>what is in the news, and the rows and ad line each area shows for it</small></h2>'
    + '<p class="dim" style="max-width:860px">A moment shows on voidtv.net while it is switched on and today is from its start to its end; it turns itself on and off by those dates. Each area picks from its own catalogue by the rule you give it. After a change, press <b>Publish now</b> at the top to send it to the site.</p>'
    + '<div class="row"><button class="gold" onclick="momentEdit(-1)">New moment</button></div>'
    + (rows ? '<table><tr><th>Moment</th><th>Dates</th><th>Now</th><th>What it picks today</th><th>Ad line</th><th></th></tr>' + rows + '</table>' : '<p class="dim">No moments yet.</p>')
    + '<div id="medit"></div>';
  if (MOMENT_EDIT) momentForm(MOMENT_EDIT);
}

function momentEdit(i) {
  const today = new Date().toISOString().slice(0, 10);
  MOMENT_EDIT = i >= 0 ? JSON.parse(JSON.stringify(MOMENTS.moments[i])) : { id: '', name: '', on: false, approved: '', start: today, end: '', why: '', kids: false, ad: { line: '', go: '', area: 'play' }, areas: { play: { title: '', match: {} } } };
  MOMENT_EDIT.was = i >= 0 ? MOMENT_EDIT.id : '';
  momentForm(MOMENT_EDIT);
  $('#medit').scrollIntoView({ behavior: 'smooth' });
}

function momentForm(x) {
  const v = (s) => esc(s == null ? '' : s), ls = (a) => esc((Array.isArray(a) ? a : []).join('\n'));
  const areaBox = (a) => {
    const r = x.areas[a] || {}, mm = r.match || {}, y = mm.years || [];
    return '<div class="panel" style="margin:10px 0" data-area="' + a + '"><div class="row" style="margin-top:0"><b>' + esc(AREA_NAMES[a] || a) + '</b>'
      + (MOMENTS.wired.includes(a) ? '' : '<span class="gold">this area does not read moments yet; the rule is kept for when it does</span>')
      + '<button class="sm red" style="margin-left:auto" onclick="momentAreaOff(' + jq(a) + ')">Remove this area</button></div>'
      + '<div class="row"><label>Row title <input data-k="title" value="' + v(r.title) + '" style="width:340px"></label><label>Show at least <input data-k="min" type="number" min="1" max="50" value="' + v(r.min == null ? 2 : r.min) + '" style="width:70px"> items</label>'
      + '<label>Then sort by <select data-k="sort">' + [['year', 'year, oldest first'], ['plays', 'most played'], ['title', 'name']].map(([k, n]) => '<option value="' + k + '"' + (r.sort === k ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label></div>'
      + '<div class="row"><label style="flex:1">About this row <input data-k="about" value="' + v(r.about) + '" style="width:100%"></label></div>'
      + '<div class="row"><label>Years from <input data-k="y0" type="number" value="' + v(y[0]) + '" style="width:90px"></label><label>to <input data-k="y1" type="number" value="' + v(y[1]) + '" style="width:90px"></label><span class="dim">empty = any year</span></div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px">'
      + MOMENT_FIELDS.map(([k, n, hint]) => '<label><small><b>' + n + '</b><br><span class="dim">' + hint + '</span></small><textarea data-m="' + k + '" rows="4" style="width:100%">' + ls(mm[k]) + '</textarea></label>').join('')
      + '<label><small><b>Put these first</b><br><span class="dim">one a line, in the order to show them</span></small><textarea data-k="order" rows="4" style="width:100%">' + ls(r.order) + '</textarea></label>'
      + '</div><div class="mprev dim" style="margin-top:8px"></div></div>';
  };
  const missing = MOMENTS.areas.filter((a) => !x.areas[a]);
  $('#medit').innerHTML = '<h2>' + (x.was ? 'Edit: ' + esc(x.name) : 'New moment') + '</h2><div class="panel">'
    + '<div class="row" style="margin-top:0"><label>Name <input id="m-name" value="' + v(x.name) + '" style="width:320px" placeholder="A new Grand Theft Auto"></label><label>Short id <input id="m-id" value="' + v(x.id) + '" style="width:140px" placeholder="gta"></label></div>'
    + '<div class="row"><label>Starts <input id="m-start" type="date" value="' + v(x.start) + '"></label><label>Peak <input id="m-peak" type="date" value="' + v(x.peak) + '"></label><label>Ends <input id="m-end" type="date" value="' + v(x.end) + '"></label></div>'
    + '<div class="row"><label style="flex:1">Why it matters <input id="m-why" value="' + v(x.why) + '" style="width:100%"></label></div>'
    + '<div class="row"><label><input id="m-on" type="checkbox"' + (x.on ? ' checked' : '') + '> Switched on</label><label><input id="m-ok" type="checkbox"' + (x.approved ? ' checked' : '') + '> Approved by me' + (x.approved ? ' <span class="dim">(' + esc(x.approved) + ')</span>' : '') + '</label><label><input id="m-kids" type="checkbox"' + (x.kids ? ' checked' : '') + '> Also on Kids <span class="dim">(Kids still checks every item by its own rules)</span></label></div>'
    + '<div class="row"><label>Ad line <input id="m-ad" value="' + v(x.ad && x.ad.line) + '" style="width:360px" placeholder="Before the world only played 1 game..."></label><label>Button <input id="m-go" value="' + v(x.ad && x.ad.go) + '" style="width:180px" placeholder="Play the first ones"></label>'
    + '<label>In <select id="m-adarea">' + MOMENTS.areas.map((a) => '<option value="' + a + '"' + (x.ad && x.ad.area === a ? ' selected' : '') + '>' + esc(AREA_NAMES[a]) + '</option>').join('') + '</select></label></div>'
    + Object.keys(x.areas).map(areaBox).join('')
    + (missing.length ? '<div class="row"><select id="m-addarea">' + missing.map((a) => '<option value="' + a + '">' + esc(AREA_NAMES[a]) + '</option>').join('') + '</select><button class="sm" onclick="momentAreaOn()">Add this area</button></div>' : '')
    + '<div class="row"><button onclick="momentPreview()">Preview what it picks</button><button class="gold" onclick="momentSave()">Save</button><button onclick="MOMENT_EDIT=null;$(\'#medit\').innerHTML=\'\'">Cancel</button><span id="m-msg" class="red"></span></div>'
    + '</div>';
}

// The form as a moment record (momentshq.clean() on the server does the rest).
function momentRead() {
  const x = MOMENT_EDIT, val = (id) => $(id).value.trim();
  const out = { was: x.was || '', id: val('#m-id'), name: val('#m-name'), start: val('#m-start'), peak: val('#m-peak'), end: val('#m-end'), why: val('#m-why'),
    on: $('#m-on').checked, approved: $('#m-ok').checked ? (x.approved || true) : '', kids: $('#m-kids').checked,
    ad: { line: val('#m-ad'), go: val('#m-go'), area: $('#m-adarea').value }, areas: {} };
  for (const box of document.querySelectorAll('#medit [data-area]')) {
    const k = (n) => box.querySelector('[data-k="' + n + '"]').value, match = {};
    for (const t of box.querySelectorAll('[data-m]')) match[t.dataset.m] = t.value;
    match.years = [k('y0'), k('y1')];
    out.areas[box.dataset.area] = { title: k('title'), about: k('about'), min: k('min'), sort: k('sort'), order: k('order'), match };
  }
  return out;
}
function momentKeep() { const r = momentRead(); MOMENT_EDIT = { ...r, approved: MOMENT_EDIT.approved, was: MOMENT_EDIT.was }; for (const a of Object.keys(r.areas)) { const z = r.areas[a]; MOMENT_EDIT.areas[a] = { ...z, order: z.order.split('\n'), match: Object.fromEntries(Object.entries(z.match).map(([q, w]) => [q, Array.isArray(w) ? w : String(w).split('\n')])) }; } }
function momentAreaOn() { momentKeep(); MOMENT_EDIT.areas[$('#m-addarea').value] = { title: '', match: {} }; momentForm(MOMENT_EDIT); }
function momentAreaOff(a) { momentKeep(); delete MOMENT_EDIT.areas[a]; momentForm(MOMENT_EDIT); }

async function momentPreview() {
  $('#m-msg').textContent = '';
  try {
    const d = await api('/api/moments/preview', momentRead());
    for (const box of document.querySelectorAll('#medit [data-area]')) {
      const p = d.picks[box.dataset.area], el = box.querySelector('.mprev');
      el.innerHTML = p == null ? 'This area does not read moments yet.' : '<b class="' + (p.shows ? 'green' : 'gold') + '">' + p.count + ' picked' + (p.shows ? '' : ', the row needs ' + p.min) + '</b>' + (p.first.length ? ': ' + p.first.map((g) => esc(g.title) + ' <span class="dim">(' + esc([g.system, g.year].filter(Boolean).join(', ')) + ')</span>').join(' · ') : '');
    }
    if (d.problems.length) $('#m-msg').textContent = d.problems.join(' ');
  } catch (e) { $('#m-msg').textContent = e.message; }
}
async function momentSave() {
  $('#m-msg').textContent = '';
  try { await api('/api/moments', momentRead()); MOMENT_EDIT = null; toast('Moment saved. Press Publish now to send it to voidtv.net.'); render(); } catch (e) { $('#m-msg').textContent = e.message; }
}
async function momentSwitch(i) { const x = MOMENTS.moments[i]; try { await api('/api/moments/switch', { id: x.id, on: !x.on }); toast((x.on ? 'Switched off: ' : 'Switched on: ') + x.name + '. Press Publish now to send it.'); render(); } catch (e) { toast(e.message); } }
async function momentRemove(i) { const x = MOMENTS.moments[i]; if (!confirm('Remove the moment "' + x.name + '"? Switching it off keeps it for next time.')) return; try { await api('/api/moments/remove', { id: x.id }); toast('Removed: ' + x.name); render(); } catch (e) { toast(e.message); } }
