// A list on the home page has its own address (audit of 20 Nov 2026, A4, the old SP-015).
//
// Why it exists: "See all", the filter menus and the search box changed what the page showed but not the address,
// and added nothing to the browser's history. So Back left voidtv.net, and a list could not be bookmarked or shared.
// Now the filters ride in the address as a query string, for example /?type=Sitcoms&decade=1990s or /?q=roseanne.
//
// listQuery(state) writes the query string from the page's filters ('' when there are none). The sort is written
// only beside a filter: the home page with its rows has no order to keep, so its address stays plain.
// listRead(search, sorts) reads one back: every key is always present, unknown keys are ignored, a value is cut at
// 80 letters, and a sort that is not in the list of sorts falls back to the default ('eps').
// Neither knows a show or a row by name: a value nobody has (a made-up row) simply finds nothing, and the page
// then prints its "No shows fit this filter" line. The page escapes the values wherever it prints them.
//
// app.js inlines listSource into the page, so the same code runs in the browser and in tests/app-list.test.js.
// Each must stay a self-contained function: no outside names, and no line comments after code (scripts/site.js
// refuses a page whose script has them).
function listQuery(st) {
  const keys = ['type', 'tag', 'genre', 'network', 'decade', 'q', 'sort'];
  const out = [];
  for (const k of keys) {
    const v = String((st && st[k]) || '').trim();
    if (!v || (k === 'sort' && (v === 'eps' || !out.length))) continue;
    out.push(k + '=' + encodeURIComponent(v).replace(/%20/g, '+').replace(/\x27/g, '%27'));
  }
  return out.length ? '?' + out.join('&') : '';
}

function listRead(search, sorts) {
  const out = { type: '', tag: '', genre: '', network: '', decade: '', q: '', sort: 'eps' };
  let p = null;
  try { p = new URLSearchParams(search || ''); } catch (e) { return out; }
  for (const k of Object.keys(out)) {
    const v = p.get(k);
    if (v == null) continue;
    const t = String(v).slice(0, 80).trim();
    if (!t) continue;
    if (k === 'sort') { if (sorts && sorts.indexOf(t) >= 0) out.sort = t; } else out[k] = t;
  }
  return out;
}

const src = (f) => f.toString().replace(/\r\n/g, '\n');
module.exports = { listQuery, listRead, listSource: src(listQuery) + '\n' + src(listRead) };
