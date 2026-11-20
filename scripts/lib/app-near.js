// The nearest titles for a search that found nothing (audit of 20 Nov 2026, A10).
//
// Why it exists: the search box only finds text that is inside a title, a genre, a network, a tag or a name, so one
// wrong letter ("rosanne" for Roseanne) left a page that said "0 shows" and nothing else. This function takes what
// was typed and the list of titles and returns the places (indexes) of the few titles that are a typing slip away.
//
// How it decides: both sides are lowercased, apostrophes dropped and other marks turned into spaces. What was typed
// is compared with the whole title and with every run of as many words in the title as were typed, counting the
// letters that must be added, dropped, swapped or changed. One slip is allowed up to 7 letters, two up to 12, three
// beyond that. Fewer than 3 letters is never guessed at. Ties keep the order of the list (the page passes the
// shows with the most episodes first).
//
// app.js inlines nearSource into the page, so the same code runs in the browser and in tests/app-near.test.js.
// It must stay one self-contained function: no outside names, and no line comments after code (scripts/site.js
// refuses a page whose script has them).
function nearTitles(q, titles, max) {
  const norm = (t) => String(t || '').toLowerCase().replace(/['’]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  const dist = (a, b, cap) => {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > cap) return cap + 1;
    let prev2 = null, prev = [];
    for (let j = 0; j <= lb; j++) prev.push(j);
    for (let i = 1; i <= la; i++) {
      const cur = [i];
      let low = i;
      for (let j = 1; j <= lb; j++) {
        const same = a.charCodeAt(i - 1) === b.charCodeAt(j - 1);
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (same ? 0 : 1));
        if (prev2 && i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, prev2[j - 2] + 1);
        cur.push(v);
        if (v < low) low = v;
      }
      if (low > cap) return cap + 1;
      prev2 = prev; prev = cur;
    }
    return prev[lb];
  };
  const want = norm(q);
  if (want.length < 3) return [];
  const cap = want.length <= 7 ? 1 : want.length <= 12 ? 2 : 3;
  const k = want.split(' ').length;
  const hits = [];
  for (let i = 0; i < titles.length; i++) {
    const t = norm(titles[i]);
    if (!t) continue;
    let best = dist(want, t, cap);
    const words = t.split(' ');
    if (want.length >= 4) for (let s = 0; s + k <= words.length && best > 0; s++) {
      const d = dist(want, words.slice(s, s + k).join(' '), cap);
      if (d < best) best = d;
    }
    if (best <= cap) hits.push([best, i]);
  }
  hits.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return hits.slice(0, max || 6).map((h) => h[1]);
}

module.exports = { nearTitles, nearSource: nearTitles.toString().replace(/\r\n/g, '\n') };
