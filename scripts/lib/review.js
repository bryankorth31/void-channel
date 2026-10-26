// THE SHOW REVIEW ENGINE (B, 26 Oct 2026: "rate every one for me with impact and public love/sentiment ... and its
// entertainment rating and the quality ... either keep or go"; plan: chief-of-staff/plans/PLAN-voidtv-show-review.md).
// Pure rules over facts, no AI: each show gets four scores from 0 to 100 and a call, Keep (stays on Live TV) or Go (off Live
// TV, still on demand).
//   Entertainment  how good people say it is: TMDB's average, pulled toward the catalog's mean when few voted, and TVmaze's rating
//   Love           how many people care: TMDB votes and popularity, TVmaze weight, Wikipedia views (12 months), and
//                  voidtv.net's own viewers (minutes watched, people watching; 90 days)
//   Impact         the mark it left: years on air, seasons, Wikidata awards and nominations, how many Wikipedias cover it
//   Quality        how well voidtv.net serves it: share of the guide's episodes here, files that play, picture (MB a minute),
//                  how much of its Live TV slot it fills
// Entertainment, Love and Impact rank a show against the others (a percentile); Quality is measured on its own scale and
// ranks like the others inside the blend (its own value is what the floor reads).
// The blend weighs them by catalog/review-settings.json, and the call follows its lines. B's own call always wins.
const DEFAULTS = {
  weights: { entertainment: 30, love: 30, impact: 15, quality: 25 },
  loveOwnViewers: 0.5, // how much our own viewers count inside Love, against 1 for each outside source (raise it as the audience grows)
  goBelow: 40, // a blend below this drops off Live TV (B, 26 Oct: Live TV is a healthy selection of the better shows)
  qualityFloor: 20, // Quality below this drops whatever the rest says: it does not play well here
  minSources: 2, // fewer outside sources than this and the show drops: barely known, nobody rates it
  minEpisodes: 4, // a stub drops: fewer episodes here than this, and under half the show (Seinfeld had 1 of 180; a whole 3-part documentary stays)
  bayesVotes: 50, // TMDB votes it takes for a show's own average to count as much as the catalog's mean
};

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const wmean = (pairs) => { let s = 0, w = 0; for (const [x, k] of pairs) if (x != null && k > 0) { s += x * k; w += k; } return w ? s / w : null; };
const log = (x) => (x == null ? null : Math.log10(1 + Math.max(0, x)));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Percentile ranks (0 to 100) of a list of numbers or nulls; ties share their middle rank; nulls stay null.
function ranks(values) {
  const idx = values.map((v, i) => [v, i]).filter((p) => p[0] != null).sort((a, b) => a[0] - b[0]);
  const out = values.map(() => null), n = idx.length;
  for (let a = 0; a < n;) {
    let b = a; while (b + 1 < n && idx[b + 1][0] === idx[a][0]) b++;
    const r = n === 1 ? 50 : (100 * ((a + b) / 2)) / (n - 1);
    for (let k = a; k <= b; k++) out[idx[k][1]] = r;
    a = b + 1;
  }
  return out;
}

const yearOf = (d) => { const y = parseInt(String(d || '').slice(0, 4), 10); return y > 1900 ? y : null; };

// The raw facts of one show, from its inputs: { tmdb, tvmaze, wiki, views, ours, files } (any may be missing).
function facts(x, now) {
  const t = x.tmdb && !x.tmdb.missing ? x.tmdb : null, m = x.tvmaze && !x.tvmaze.missing ? x.tvmaze : null;
  const w = x.wiki && !x.wiki.missing ? x.wiki : null, v = x.views || null, o = x.ours || {}, f = x.files || {};
  const first = yearOf((t && t.first) || (m && m.premiered)), lastRaw = yearOf((t && t.last) || (m && m.ended));
  const running = (t && /returning|production/i.test(t.status || '')) || (m && !m.ended && m.premiered);
  const last = running ? yearOf(now) : lastRaw || first;
  return {
    tmdbAvg: t && t.vc > 0 ? num(t.va) : null, tmdbVotes: t ? num(t.vc) : null, tmdbPop: t ? num(t.pop) : null,
    seasons: t && t.seasons > 0 ? t.seasons : null,
    tvmRating: m ? num(m.rating) : null, tvmWeight: m ? num(m.weight) : null,
    years: first && last ? Math.max(1, last - first + 1) : null,
    awards: w ? (w.won || 0) * 2 + (w.noms || 0) : null, wikis: w ? num(w.links) : null,
    views: v && v.months ? num(v.views) : null,
    minutes: num(o.minutes) || 0, watchers: num(o.watchers) || 0,
    coverage: num(f.coverage), playable: num(f.playable), mbMin: num(f.mbMin), slotFill: num(f.slotFill), siteEps: num(f.siteEps),
    sources: (t ? 1 : 0) + (m ? 1 : 0) + (w ? 1 : 0) + (v && v.months ? 1 : 0),
  };
}

// Quality on its own scale: 40 for the share of the guide's episodes here, 20 for files that play, 20 for the picture
// (2 MB a minute or less scores nothing, 8 or more scores all), 20 for how much of its slot an episode fills.
function quality(F) {
  const parts = [[F.coverage == null ? null : clamp(F.coverage, 0, 1), 40], [F.playable, 20],
    [F.mbMin == null ? null : clamp((F.mbMin - 2) / 6, 0, 1), 20], [F.slotFill == null ? null : clamp((F.slotFill - 0.5) / 0.45, 0, 1), 20]];
  const q = wmean(parts.map(([x, k]) => [x, k]));
  return q == null ? null : Math.round(100 * q);
}

// The scores for every show: shows = [{ slug, ...inputs }], calls = B's calls { slug: { call: 'keep' | 'go' } }.
function score(shows, settings, calls, now) {
  const S = Object.assign({}, DEFAULTS, settings || {}, { weights: Object.assign({}, DEFAULTS.weights, (settings || {}).weights || {}) });
  const F = shows.map((x) => facts(x, now || new Date().toISOString()));
  // Entertainment: TMDB's average pulled toward the catalog mean by the votes it lacks, then TVmaze's rating beside it.
  const vals = F.filter((f) => f.tmdbAvg != null);
  const C = vals.length ? vals.reduce((a, f) => a + f.tmdbAvg, 0) / vals.length : 7; // the plain mean: a vote-weighted one leans on the hits
  const ent = F.map((f) => wmean([[f.tmdbAvg == null ? null : (f.tmdbVotes * f.tmdbAvg + S.bayesVotes * C) / (f.tmdbVotes + S.bayesVotes), 1],
    [f.tvmRating, f.tvmWeight == null ? 0.5 : 0.25 + 0.5 * (f.tvmWeight / 100)]]));
  const own = F.map((f) => (f.minutes || f.watchers ? f.minutes + 30 * f.watchers : null));
  // Our viewers rank against every show, unwatched ones as none, so a watched show ranks up.
  const R = { ent: ranks(ent), votes: ranks(F.map((f) => log(f.tmdbVotes))), pop: ranks(F.map((f) => log(f.tmdbPop))), weight: ranks(F.map((f) => f.tvmWeight)),
    views: ranks(F.map((f) => log(f.views))), own: ranks(own.map((x) => log(x || 0))), years: ranks(F.map((f) => f.years)), seasons: ranks(F.map((f) => f.seasons)),
    awards: ranks(F.map((f) => log(f.awards))), wikis: ranks(F.map((f) => f.wikis)) };
  const Q = F.map(quality), qRank = ranks(Q); // Quality ranks too in the blend; its own value is kept for the floor
  return shows.map((x, i) => {
    const f = F[i];
    const e = R.ent[i];
    // A show nobody outside watched on voidtv.net yet is not penalised for it: only those with viewers add our signal.
    const l = wmean([[R.votes[i], 1], [R.pop[i], 1], [R.weight[i], 1], [R.views[i], 1], [own[i] == null ? null : R.own[i], S.loveOwnViewers]]);
    const im = wmean([[R.years[i], 1], [R.seasons[i], 1], [R.awards[i], 1], [R.wikis[i], 1]]);
    const q = Q[i];
    const W = S.weights;
    // No overall score from Quality alone: it needs at least two of the three outside scores.
    const outside = [e, l, im].filter((v) => v != null).length;
    const blend = outside >= 2 ? wmean([[e, W.entertainment], [l, W.love], [im, W.impact], [qRank[i], W.quality]]) : null;
    const sc = { entertainment: rnd(e), love: rnd(l), impact: rnd(im), quality: q, blend: rnd(blend) };
    // Two calls only (B, 26 Oct: 'either keep or go'): a show stays on Live TV unless it plays poorly here, is barely known,
    // or its blend is below the line.
    const few = f.siteEps != null && f.siteEps < S.minEpisodes && (f.coverage == null || f.coverage < 0.5);
    const auto = few || (q != null && q < S.qualityFloor) || f.sources < S.minSources || blend == null || blend < S.goBelow ? 'go' : 'keep';
    const mine = calls && calls[x.slug] && /^(keep|go)$/.test(calls[x.slug].call) ? calls[x.slug].call : null;
    return { slug: x.slug, scores: sc, facts: f, auto, call: mine || auto, byB: !!mine, reason: reason(sc, f, S, auto) };
  });
}
const rnd = (x) => (x == null ? null : Math.round(x));

// One line on why: the strongest and the weakest of the four, in plain words, plus a fact that explains a low Quality.
const WORDS = { entertainment: ['well rated', 'poorly rated'], love: ['widely loved', 'little known'], impact: ['a big mark left', 'a small mark left'], quality: ['plays well here', 'plays poorly here'] };
function reason(sc, f, S, auto) {
  if (f.siteEps != null && f.siteEps < S.minEpisodes && (f.coverage == null || f.coverage < 0.5)) return 'Only ' + f.siteEps + ' episode' + (f.siteEps === 1 ? '' : 's') + ' here: Live TV would repeat ' + (f.siteEps === 1 ? 'it' : 'them');
  if (f.sources < S.minSources) return 'Barely known: hardly rated or written about anywhere';
  const have = Object.keys(WORDS).filter((k) => sc[k] != null);
  if (!have.length) return 'No scores yet';
  const hi = have.reduce((a, k) => (sc[k] > sc[a] ? k : a)), lo = have.reduce((a, k) => (sc[k] < sc[a] ? k : a));
  const out = [];
  if (sc[hi] >= 55) out.push(cap(WORDS[hi][0]));
  if (sc[lo] < 45 && lo !== hi) out.push((out.length ? 'but ' : '') + WORDS[lo][1]);
  if (sc.quality != null && sc.quality < 50) {
    if (f.coverage != null && f.coverage < 0.5 && f.siteEps != null) out.push((out.length ? 'and ' : '') + 'only ' + Math.round(100 * f.coverage) + '% of its episodes here');
    else if (f.mbMin != null && f.mbMin < 3) out.push((out.length ? 'and ' : '') + 'a soft picture');
    else if (f.slotFill != null && f.slotFill < 0.7) out.push((out.length ? 'and ' : '') + 'leaves gaps in its slots');
  }
  return out.length ? cap(out.join(' ')) : 'Middle of the pack';
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// File facts for one show from its site entry (the episodes that play) and its grid (the guide's full list).
function fileFacts(site, grid) {
  const guide = [];
  for (const se of (grid && grid.seasons) || []) for (const e of se.episodes || []) if ((se.number || se.season || 1) > 0) guide.push(e);
  const withFile = guide.filter((e) => e.file);
  const siteEps = site ? site.eps || 0 : 0;
  const mins = [], mb = [];
  for (const se of (site && site.seasons) || []) for (const e of se.episodes || []) if (e.min) mins.push(e.min);
  for (const e of withFile) if (e.file.sizeMB && e.file.seconds > 60) mb.push(e.file.sizeMB / (e.file.seconds / 60));
  const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const m = med(mins);
  return {
    siteEps, guideEps: guide.length,
    coverage: guide.length ? Math.min(1, siteEps / guide.length) : null,
    playable: withFile.length ? withFile.filter((e) => e.file.playable).length / withFile.length : null,
    mbMin: med(mb),
    slotFill: m ? m / (Math.ceil(m / 30) * 30) : null,
  };
}

module.exports = { DEFAULTS, score, facts, quality, ranks, fileFacts, reason };
