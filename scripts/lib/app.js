// The VOIDtv page, shared by the local preview (everything inline in one file) and the deployable
// site (an app shell + small data files + real /show/<slug> addresses). assemble() builds the data
// from the catalog; page() renders the HTML shell for either mode.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SITE_NAME = 'VOIDtv';
const DONATE_URL = 'https://square.link/u/dJioBmlW';
const CREDIT = `<a href="/about" onclick="go('about');return false">About VOIDtv</a> · A project of the <a href="https://cashvalues.org" target="_blank" rel="noopener">Church of American Strength &amp; Hope</a>, a 501(c)(3) that works on ways for people to have good things that fit a busy life and a stretched budget. Free to use, no set amount, never required; <a href="${DONATE_URL}" target="_blank" rel="noopener">give back to CASH</a> if the work is worth supporting.<br>Shows stream from the Internet Archive. Artwork and metadata from TMDB; this product uses the TMDB API but is not endorsed or certified by TMDB.`;

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; } }

// ---- data ---------------------------------------------------------------------------------
// TV WORLD. Channels are the networks, rows and collections; each carries a fixed lineup of every
// playable episode it holds, interleaved in ~45-minute blocks so it feels like a schedule rather than
// one show on repeat. "Now playing" is pure arithmetic on the clock (see TV_EPOCH in the page), so
// every visitor sees the same thing at the same moment with no server.
const slugify = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function buildChannels(shows, types) {
  const isAdultShow = (s) => s.type === 'Late Night' || (s.tags || []).includes('Late Night') || !!s.adult;
  const adultList = shows.filter((s) => isAdultShow(s) && !s.slug.startsWith('movie-'));
  shows = shows.filter((s) => !isAdultShow(s)); // every other channel stays clean; Late Night is its own door
  const series = shows.filter((s) => !s.slug.startsWith('movie-'));
  const movies = shows.filter((s) => s.slug.startsWith('movie-'));
  const idx = new Map(shows.map((s, i) => [s.slug, i]));
  const chans = [];
  const make = (id, name, kind, list) => {
    const eps = list.reduce((n, s) => n + s.eps, 0);
    if (!list.length || eps < 12) return;
    const queues = list.slice().sort((a, b) => b.eps - a.eps)
      .map((s) => ({ q: s.seasons.flatMap((se) => se.episodes.map((e) => [idx.get(s.slug), se.season, e.n, Math.max(1, e.min || s.runtime || 30)])) }));
    const items = [];
    let active = queues.filter((x) => x.q.length);
    while (active.length) {
      for (const x of active) { let m = 0; while (x.q.length && m < 44) { const it = x.q.shift(); items.push(it); m += it[3]; } }
      active = active.filter((x) => x.q.length);
    }
    chans.push({ id, name, kind, shows: list.length, eps, total: items.reduce((n, it) => n + it[3], 0), items });
  };
  make('void', 'The Void', 'all', series);
  for (const t of types) make('row-' + slugify(t), t, 'row', series.filter((s) => s.type === t));
  const tags = {}; for (const s of series) for (const t of s.tags || []) (tags[t] = tags[t] || []).push(s);
  for (const [t, list] of Object.entries(tags)) make('tag-' + slugify(t), t, 'collection', list);
  const nets = {}; for (const s of series) if (s.network) (nets[s.network] = nets[s.network] || []).push(s);
  for (const [n, list] of Object.entries(nets).sort((a, b) => b[1].length - a[1].length)) if (list.length >= 2) make('net-' + slugify(n), n, 'network', list);
  if (movies.length) make('movies', 'TV Movies and Specials', 'row', movies);
  if (adultList.length) { make('row-late-night', 'Late Night', 'row', adultList); const c = chans.find((x) => x.id === 'row-late-night'); if (c) c.adult = true; }
  return chans;
}

function assemble() {
  const LIST = readJson(path.join(ROOT, 'scripts', 'show-list.json'), { types: [], shows: [] });
  const ART = readJson(path.join(ROOT, 'catalog', 'art.json'), {});
  const GRAPH = readJson(path.join(ROOT, 'catalog', 'graph.json'), { people: {}, showLinks: {} });
  const SHOWS_DIR = path.join(ROOT, 'catalog', 'shows');
  const PEOPLE_DIR = path.join(ROOT, 'catalog', 'people');
  const BIO_DIR = path.join(ROOT, 'catalog', 'people-bios');
  const MOV_DIR = path.join(ROOT, 'catalog', 'movies');
  const TVM = readJson(path.join(ROOT, 'catalog', 'tvmovies-list.json'), { items: [] });
  const TVM_BY_ID = Object.fromEntries(TVM.items.map((m) => [m.tmdbId, m]));
  const byName = Object.fromEntries(LIST.shows.map((s) => [s.name, s]));

  const shows = (fs.existsSync(SHOWS_DIR) ? fs.readdirSync(SHOWS_DIR) : []).filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(SHOWS_DIR, f), null)).filter((s) => s && s.seasons)
    .map((s) => {
      const a = ART[s.slug] || {};
      const entry = byName[s.show] || {};
      const p = readJson(path.join(PEOPLE_DIR, s.slug + '.json'), null);
      return {
        show: s.show, slug: s.slug, type: s.type, network: s.network, year: (s.tvmaze.premiered || a.year || '').slice(0, 4), runtime: s.tvmaze.runtime, tags: entry.tags || [],
        poster: a.poster || null, backdrop: a.backdrop || null, overview: a.overview || '', genres: a.genres || [], rating: a.rating || null, country: a.country || null, matchedAt: s.matchedAt,
        seasons: s.seasons.map((se) => ({ season: se.season, episodes: se.episodes.filter((e) => e.file && e.file.playable && !e.file.langRisk).map((e) => ({ n: e.number, name: e.name, state: e.state, url: e.file.url, min: Math.round(e.file.seconds / 60), item: e.file.item })) })).filter((se) => se.episodes.length),
        cast: p ? p.cast.slice(0, 14).map((c) => ({ id: c.id, name: c.name, photo: c.photo, as: c.character, eps: c.episodes })) : [],
        crew: p ? p.crew.slice(0, 6).map((c) => ({ id: c.id, name: c.name, photo: c.photo, as: c.jobs.join(', ') })) : [],
        credits: p && p.episodes ? p.episodes : {},
      };
    })
    .filter((s) => s.seasons.length)
    .map((s) => ({ ...s, eps: s.seasons.reduce((n, se) => n + se.episodes.length, 0) }))
    .sort((a, b) => b.eps - a.eps);

  // TV movies and specials: one-episode shows in their own rows; Hallmark and faith studios tag themselves.
  for (const f of (fs.existsSync(MOV_DIR) ? fs.readdirSync(MOV_DIR) : [])) {
    if (!f.endsWith('.json')) continue;
    const m = readJson(path.join(MOV_DIR, f), null);
    if (!m || !m.file || !m.file.playable || m.state === 'MISSING') continue;
    const ref = TVM_BY_ID[m.tmdbId] || {};
    const companies = (ref.companies || []).join(' ');
    const tags = [];
    if (/hallmark/i.test(companies)) tags.push('Family & Hallmark');
    if (/pure ?flix|affirm|kingdom story|crossflix|trinity broadcasting|tbn/i.test(companies)) tags.push('Christian');
    shows.push({
      show: m.title, slug: 'movie-' + m.tmdbId, type: m.kind === 'special' ? 'Specials' : 'TV Movies', network: (ref.companies || [])[0] || (m.kind === 'special' ? 'Special' : 'TV Movie'), tags,
      year: m.year, runtime: m.runtime, poster: m.poster, backdrop: m.backdrop, overview: m.overview, genres: [], rating: m.rating, country: null, matchedAt: m.huntedAt,
      seasons: [{ season: 1, episodes: [{ n: 1, name: m.title + (m.year ? ' (' + m.year + ')' : ''), state: m.state, url: m.file.url, min: Math.round(m.file.seconds / 60), item: m.file.item }] }],
      eps: 1, cast: [], crew: [], credits: {}, adult: !!ref.adult,
    });
  }

  // Graph trimmed to the shows that play here.
  const onPage = new Set(shows.map((s) => s.slug));
  const people = {};
  for (const [id, p] of Object.entries(GRAPH.people || {})) {
    const here = Object.fromEntries(Object.entries(p.shows).filter(([sl]) => onPage.has(sl)));
    if (Object.keys(here).length) people[id] = { name: p.name, photo: p.photo, shows: here };
  }
  const links = {};
  for (const [a, l] of Object.entries(GRAPH.showLinks || {})) {
    if (!onPage.has(a)) continue;
    for (const [b, ids] of Object.entries(l)) if (onPage.has(b)) (links[a] = links[a] || {})[b] = ids;
  }
  // Bios ride along only for people who connect shows here (the person pages).
  const bios = {};
  for (const id of Object.keys(people)) { const b = readJson(path.join(BIO_DIR, id + '.json'), null); if (b) bios[id] = b; }
  const types = [...LIST.types, 'TV Movies', 'Specials'];
  // HOME ORDER (B 2026-10-14: "more aligned with the popular and eras we originally spoke of; I don't
  // want game shows and talk variety to show before the absurd or animation or sitcoms"). Rows and
  // collections interleave in one list: the eras and the popular shelves first, documentary and the
  // door-adjacent shelves last. Anything not named here (a new collection) follows, biggest first.
  const HOME_ORDER = [
    ['type', '90s Sitcoms'], ['type', '2000s and Later Sitcoms'], ['type', 'Animated'], ['type', 'Adult Swim'],
    ['tag', 'Awkward & Absurd'], ['type', 'Drama'], ['type', 'Sci-Fi, Fantasy and Horror'], ['type', 'Streaming Era'],
    ['type', 'British and Beyond'], ['type', 'TV Movies'], ['type', 'Sketch and Comedy'], ['type', 'Internet Comedy'],
    ['tag', 'Historical & Period'], ['type', 'MTV'], ['type', 'Anime'], ['tag', 'Black Programming'],
    ['tag', 'Family & Hallmark'], ['tag', 'Christian'], ['type', 'Documentary & Geographic'], ['tag', 'Nature & Science'],
    ['tag', 'History'], ['tag', 'Travel & Adventure'], ['tag', 'History Channel Classic'], ['tag', 'Early Discovery'], ['tag', 'Early TLC'],
    ['type', 'World TV'], ['type', 'Specials'], ['type', 'Reality & Talk'], ['tag', 'Variety & Talk'], ['tag', 'Game Shows'],
    ['type', 'Classic TV'], ['tag', 'Late Night Classics'], ['type', 'Late Night'],
  ];
  const channels = buildChannels(shows, types);
  return { shows, people, links, types, bios, channels, homeOrder: HOME_ORDER };
}

// The index entry: everything the browse page needs; seasons and cast load per show in split mode.
const indexEntry = (s) => ({ show: s.show, slug: s.slug, type: s.type, people: (s.cast || []).slice(0, 8).map((c) => c.name).join(', ') || undefined, adult: (s.type === 'Late Night' || (s.tags || []).includes('Late Night') || s.adult) ? 1 : undefined, network: s.network, year: s.year, runtime: s.runtime, tags: s.tags, poster: s.poster, backdrop: s.backdrop, overview: s.overview, genres: s.genres, rating: s.rating, matchedAt: s.matchedAt, eps: s.eps, seasonCount: s.seasons.length });
const showFile = (s, data) => {
  const links = (data && data.links && data.links[s.slug]) || {};
  const ids = new Set([...s.cast, ...s.crew].map((c) => c.id));
  for (const arr of Object.values(links)) for (const id of arr) ids.add(id);
  const people = {};
  if (data && data.people) for (const id of ids) if (data.people[id]) people[id] = data.people[id];
  return { slug: s.slug, seasons: s.seasons, cast: s.cast, crew: s.crew, credits: s.credits || {}, links, people };
};

// ---- page --------------------------------------------------------------------------------
const CSS = `
:root{--bg:#07080c;--panel:#0f1118;--panel2:#161926;--line:#1d2130;--fg:#e8e8ee;--dim:#8a8fa3;--acc:#5fd4ff;--gold:#f2a93b;--rev:#f3c969}
*{box-sizing:border-box}html,body{overflow-x:hidden;max-width:100%}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,Segoe UI,Roboto,sans-serif}
a{color:inherit;text-decoration:none}button,select,input{font:inherit}
header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:16px;padding:10px 20px;background:rgba(7,8,12,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
header .logo{font-size:22px;font-weight:700;letter-spacing:.04em;cursor:pointer;display:flex;align-items:center}header .logo span{color:var(--acc)}header .logo img.mark{width:34px;height:34px;display:block;margin-right:9px;border-radius:50%}header .logo .name{font-size:20px}
header input{flex:1 1 120px;min-width:0;width:0;max-width:420px;background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:8px 12px;border-radius:8px;outline:none}
header input:focus{border-color:var(--acc)}
header .donate{margin-left:auto;color:#07080c;background:var(--gold);font-size:14px;font-weight:600;border-radius:999px;padding:8px 16px;white-space:nowrap}header .donate:hover{filter:brightness(1.12)}
.support{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin:12px 20px 0;padding:12px 16px;border:1px solid var(--line);border-left:4px solid var(--acc);border-radius:10px;background:var(--panel);font-size:14px}
.support b{color:var(--acc)}.support .sp{flex:1;min-width:240px}.support .acts{display:flex;gap:8px;flex-wrap:wrap}.support a.btn{border:1px solid var(--acc);color:var(--acc);font-weight:600}.support a.btn:last-child{background:var(--gold);border-color:var(--gold);color:#07080c}
footer a{color:var(--acc)}
@media(max-width:600px){header{gap:10px;padding:10px 12px}header .logo{font-size:19px}header .logo img.mark{width:28px;height:28px;margin-right:7px}header .logo .name{font-size:17px}header .donate{padding:7px 11px;font-size:13px}header .donate .long{display:none}header .mine-link{padding:6px 8px;font-size:13px}header .mine-link .long{display:none}}
header .mine-link{cursor:pointer;color:var(--fg);font-size:14px;padding:7px 12px;border:1px solid var(--line);border-radius:999px;white-space:nowrap}header .mine-link:hover{border-color:var(--acc);color:var(--acc)}
.btn.on{border-color:var(--acc);color:var(--acc)}.mine{display:contents}.acts.mine{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.me{padding:0 20px 20px}.me h1{margin:10px 0 4px;font-size:26px}.me .g{color:var(--dim)}.me>.acts{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px}.me h2 small{color:var(--dim);font-weight:400;font-size:13px;margin-left:8px}
.inep{margin-top:6px}.inep .by{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--dim);margin-bottom:6px}.inep .by span{color:var(--fg);cursor:pointer;border-bottom:1px dotted var(--line)}.inep .by span:hover{color:var(--acc);border-color:var(--acc)}
.deg input{width:100%;max-width:420px;background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:8px 12px;border-radius:8px;outline:none}.deg input:focus{border-color:var(--acc)}.deg .sug{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.deg .g{color:var(--dim);font-size:13px}
.path{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px;font-size:14px}.path .s{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer}.path .s:hover{border-color:var(--acc)}.path .v{color:var(--acc);font-size:12px;cursor:pointer}.path .v:hover{text-decoration:underline}
.person .more{color:var(--acc);cursor:pointer;font-size:12px;margin-left:8px;font-weight:400}.person .bio{font-size:13px;line-height:1.45;margin-top:6px;color:var(--fg)}
.ppage{padding:0 20px 20px}.ppage .head{display:flex;gap:18px;align-items:flex-start;margin:6px 0 14px}.ppage .head img{width:120px;height:120px;border-radius:50%;object-fit:cover;flex:none}.ppage .head b{font-size:24px}.ppage .bio{max-width:760px;line-height:1.5;margin-top:8px}.ppage .g{color:var(--dim);font-size:13px}.pcard small.role{display:block;color:var(--acc);font-size:12px;padding:4px 2px 0}
.tv{padding:0 20px 20px}.tv .screen{position:relative;background:#000;border-radius:10px;overflow:hidden}.tv video{width:100%;aspect-ratio:16/9;max-height:70vh;display:block;background:#000}
.tv .on{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);width:170px;height:54px;background:var(--acc);color:#07080c;border:0;border-radius:999px;font:inherit;font-weight:600;font-size:16px;cursor:pointer}
.osd{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:10px 12px;background:var(--panel);font-size:14px;min-height:44px}.osd b{color:var(--acc)}.osd .g{color:var(--dim)}.osd .acts{margin-left:auto;display:flex;gap:6px}
.guide{margin-top:12px;border:1px solid var(--line);border-radius:10px;overflow:hidden}.ch{display:grid;grid-template-columns:minmax(150px,1fr) 2fr;gap:10px;padding:9px 12px;border-bottom:1px solid var(--line);cursor:pointer;font-size:14px}.ch:last-child{border-bottom:0}.ch:hover,.ch.on{background:var(--panel2)}.ch.on .cn{color:var(--acc)}.ch small{display:block;color:var(--dim);font-size:11px}
@media(max-width:600px){.ch{grid-template-columns:1fr;gap:2px}.osd .acts{margin-left:0;width:100%}}
.hero-home{position:relative;margin:0 0 6px;height:min(62vh,560px);min-height:380px;overflow:hidden;background:#000}
.hero-home .slides{position:absolute;inset:0;background:#000}.hero-home .s{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity 1.6s ease;transform:scale(1.04)}.hero-home .s.on{opacity:.8;animation:kb 10s linear forwards}@keyframes kb{from{transform:scale(1.04)}to{transform:scale(1.1)}}
.hero-home .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,8,12,.12) 0%,rgba(7,8,12,.22) 45%,rgba(7,8,12,.98) 100%),linear-gradient(90deg,rgba(7,8,12,.55) 0%,rgba(7,8,12,0) 60%)}
.hero-home .copy{position:absolute;left:76px;right:76px;bottom:22px;max-width:760px}
.hero-home .wm{width:min(380px,62vw);display:block;filter:drop-shadow(0 2px 14px rgba(0,0,0,.65))}
.hero-home .tag{margin:10px 0 0;color:var(--fg);font-size:17px;text-shadow:0 1px 8px rgba(0,0,0,.75)}
.hero-home .nowon{margin:10px 0 0;color:var(--dim);font-size:14px;min-height:20px}.hero-home .nowon b{color:var(--fg)}
.live{display:inline-block;background:var(--gold);color:#07080c;font-size:10px;font-weight:700;letter-spacing:.08em;padding:2px 6px;border-radius:4px;margin-right:6px;vertical-align:1px}
.hero-home .acts{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.hero-home .copy{transition:opacity .35s ease}.hero-home .tag{font-size:13px;color:var(--dim);margin:0 0 8px;text-shadow:none}.hero-home .kicker{display:block;color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}
.hero-home h1{font-size:clamp(28px,4.2vw,56px);line-height:1.04;margin:4px 0 10px;text-shadow:0 2px 14px rgba(0,0,0,.75)}.hero-home .ov{max-width:640px;font-size:15px;line-height:1.45;color:var(--fg);text-shadow:0 1px 8px rgba(0,0,0,.85);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin:0}.hero-home .meta{color:var(--dim);font-size:13px;margin-top:8px}
.hero-home .harrow{position:absolute;top:50%;margin-top:-22px;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(7,8,12,.55);color:#fff;font-size:26px;line-height:1;cursor:pointer;z-index:2}.hero-home .harrow:hover{border-color:var(--acc);color:var(--acc)}.hero-home .harrow.l{left:14px}.hero-home .harrow.r{right:14px}@media(hover:none){.hero-home .harrow{display:none}.hero-home .copy{left:16px;right:16px}}
.hero-home .hcount{position:absolute;right:18px;bottom:14px;color:var(--dim);font-size:12px}
.finder{margin:0 20px 6px;padding:4px 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.frow{display:flex;align-items:flex-start;gap:12px;padding:9px 0}.frow+.frow{border-top:1px solid var(--line)}.frow .lbl{flex:none;width:68px;color:var(--dim);font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding-top:7px}.frow .pills{display:flex;flex-wrap:wrap;gap:6px}.frow .chip small{color:var(--dim);margin-left:5px;font-size:11px}.frow .chip:hover{border-color:var(--acc);color:var(--acc)}
@media(max-width:600px){.finder{margin:0 12px 6px}.frow{flex-direction:column;gap:6px}.frow .lbl{width:auto;padding-top:0}}
.btn.gold{background:var(--gold);border-color:var(--gold);color:#07080c;font-weight:600}.btn.ghost{background:rgba(7,8,12,.5);backdrop-filter:blur(6px)}
@media(max-width:600px){.hero-home{height:66vh;min-height:420px}.hero-home h1{font-size:30px}.hero-home .ov{-webkit-line-clamp:3;font-size:14px}.hero-home .copy{left:16px;right:16px;bottom:16px}.hero-home .tag{font-size:15px}}
.card{transition:transform .18s ease,outline-color .18s ease}.card:hover{transform:translateY(-3px)}.card:focus-visible{outline-color:var(--acc)}
.card .p.gen{flex-direction:column;gap:6px;background:linear-gradient(160deg,hsl(var(--h) 42% 24%),#0b0d14 72%);color:var(--fg);padding:12px}.card .p.gen b{font-size:44px;line-height:1;font-weight:700;letter-spacing:-.02em;opacity:.95;text-shadow:0 2px 10px rgba(0,0,0,.5)}.card .p.gen span{font-size:12px;line-height:1.25;max-height:3.75em;overflow:hidden}.card .p.gen small{color:var(--dim);font-size:11px}
.support{border:1px solid rgba(242,169,59,.5);border-left:5px solid var(--gold);background:linear-gradient(90deg,rgba(242,169,59,.14),rgba(12,14,20,.75) 55%);font-size:15px;line-height:1.5;color:var(--fg);padding:14px 18px;margin-top:12px;box-shadow:0 0 24px rgba(242,169,59,.12)}.support b{color:var(--gold);font-size:17px}.support .cross{width:46px;height:auto;flex:none;filter:drop-shadow(0 0 8px rgba(242,169,59,.5))}.support .acts .btn{font-size:15px;padding:10px 16px}
.tv video.idle{width:100%;aspect-ratio:16/9;max-height:70vh;object-fit:cover;display:block;background:#000}
.ch.on .cn::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--gold);margin-right:8px;box-shadow:0 0 8px var(--gold)}
main{position:relative;z-index:1}
.bgimg{position:fixed;inset:0;z-index:0;pointer-events:none;background:#07080c center/cover no-repeat;opacity:0;transition:opacity .8s ease,background-image 0s}
.bgvid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;opacity:0;transition:opacity 1.2s ease}body[data-view=home] .bgvid.on{display:block;opacity:.6}
@media(max-width:700px),(prefers-reduced-motion:reduce){.bgvid{display:none!important}}
.bgimg::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,8,12,.55) 0%,rgba(7,8,12,.78) 45%,rgba(7,8,12,.96) 100%)}
body[data-view=home] .bgimg{background-image:url(/assets/brand/bg/static-dark.jpg);opacity:.9}
body[data-view=show] .bgimg,body[data-view=person] .bgimg{background-image:url(/assets/brand/bg/static-glitch.jpg);opacity:.55}
body[data-view=tv] .bgimg{background-image:url(/assets/brand/bg/wall.jpg);opacity:.85}
body[data-view=me] .bgimg{background-image:url(/assets/brand/bg/watcher-purple.jpg);opacity:.8}
body[data-view=grid] .bgimg{background-image:url(/assets/brand/bg/static-bolt.jpg);opacity:.5}
body:not([data-view=home]) .void{display:none}
@media(max-width:700px){body[data-view=home] .bgimg{background-image:url(/assets/brand/bg/static-dark-m.jpg)}body[data-view=show] .bgimg,body[data-view=person] .bgimg{background-image:url(/assets/brand/bg/static-glitch-m.jpg)}body[data-view=tv] .bgimg{background-image:url(/assets/brand/bg/wall-m.jpg)}body[data-view=me] .bgimg{background-image:url(/assets/brand/bg/watcher-purple-m.jpg)}body[data-view=grid] .bgimg{background-image:url(/assets/brand/bg/static-bolt-m.jpg)}}
.finder,.guide,.eps,.xray .person,.support,.me>.acts,.dd .panel{backdrop-filter:blur(2px)}
.grain{position:fixed;left:-50%;top:-50%;width:200%;height:200%;pointer-events:none;z-index:1000;opacity:.045;background:url(/assets/brand/noise.png) repeat;background-size:160px 160px;mix-blend-mode:screen;animation:grain .6s steps(6) infinite;will-change:transform}
@keyframes grain{0%{transform:translate(0,0)}20%{transform:translate(-4%,-8%)}40%{transform:translate(-12%,4%)}60%{transform:translate(6%,-18%)}80%{transform:translate(-4%,18%)}100%{transform:translate(9%,0)}}
.void{position:fixed;right:-18vw;bottom:-22vw;width:64vw;height:64vw;max-width:900px;max-height:900px;pointer-events:none;z-index:0;opacity:.07;will-change:transform}.void i{position:absolute;inset:0;display:block;background:url(/assets/brand/void-soft.webp) center/contain no-repeat;animation:spin 240s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.blip{position:absolute;inset:0;pointer-events:none;z-index:40;background:url(/assets/brand/static.png) repeat;background-size:320px 320px;opacity:.55;mix-blend-mode:screen;animation:blipfade .16s steps(3) forwards}.blip::after{content:'';position:absolute;left:0;right:0;top:38%;height:9%;background:rgba(255,255,255,.22);box-shadow:0 0 30px rgba(95,212,255,.35);animation:band .16s linear forwards}
@keyframes blipfade{to{opacity:0}}@keyframes band{from{transform:translateY(-120%)}to{transform:translateY(380%)}}
.loading{position:relative;min-height:160px;color:var(--dim)}.loading::before{content:'';position:absolute;left:20px;top:0;width:min(420px,80%);height:120px;border-radius:8px;background:url(/assets/brand/static.png) repeat;background-size:320px 320px;opacity:.28;animation:grain .5s steps(5) infinite}.loading span{position:relative;display:block;padding-top:132px}
.card::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:0;background:repeating-linear-gradient(180deg,rgba(255,255,255,0) 0 3px,rgba(95,212,255,.09) 3px 4px);transition:opacity .25s}.card:hover::after{opacity:1}
.hero-home{position:relative}.hero-home .shade::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(0,0,0,0) 0 3px,rgba(0,0,0,.16) 3px 4px);opacity:.5}
@media(prefers-reduced-motion:reduce){.grain,.void,.loading::before{animation:none}.blip{display:none}}
:root{--glass:linear-gradient(180deg,#1a242b 0%,#121a1f 100%);--glass-gold:linear-gradient(180deg,#2e2316 0%,#221a11 100%);--edge:rgba(95,212,255,.55);--edge-gold:rgba(242,169,59,.8)}
.btn,.dd>button,.chip,.bar .clear,.sehead select{background:var(--glass);border:1px solid var(--edge);color:var(--fg);box-shadow:inset 0 1px 0 rgba(255,255,255,.04);transition:border-color .15s,box-shadow .15s,background .15s,color .15s,transform .1s}
.btn:hover,.dd>button:hover,.dd.open>button,.chip:hover,.bar .clear:hover{border-color:#7adcf5;color:var(--fg);box-shadow:0 0 12px rgba(95,212,255,.35),0 0 0 1px rgba(95,212,255,.18),inset 0 1px 0 rgba(255,255,255,.05)}
.btn:active{transform:translateY(1px)}.btn.on,.chip.on{background:var(--glass);border-color:#55d4ff;color:#9fe6ff;box-shadow:0 0 14px rgba(95,212,255,.45),inset 0 0 0 1px rgba(95,212,255,.35)}
.btn:disabled,.btn[aria-disabled=true]{border-color:#2a3137;color:var(--dim);box-shadow:none;cursor:default}
.btn:focus-visible,.dd>button:focus-visible,.chip:focus-visible,.harrow:focus-visible,.arrow:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.btn.gold{background:var(--glass-gold);border-color:var(--edge-gold);color:#ffd27a;font-weight:600;box-shadow:0 0 10px rgba(242,169,59,.25),inset 0 1px 0 rgba(255,255,255,.04)}.btn.gold:hover{border-color:#ffc35c;box-shadow:0 0 16px rgba(242,169,59,.5),0 0 0 1px rgba(242,169,59,.25)}
.btn.ghost{background:rgba(7,8,12,.35);border-color:rgba(95,212,255,.45);backdrop-filter:blur(6px)}
.dd.set>button{background:var(--glass-gold);border-color:var(--edge-gold);color:#ffd27a;box-shadow:0 0 10px rgba(242,169,59,.25)}.dd.set>button i{color:#ffd27a}
.arrow,.hero-home .harrow,.card .more,.tv .on{background:var(--glass)!important;border:1px solid var(--edge)!important;color:var(--fg)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}.arrow:hover,.hero-home .harrow:hover,.card .more:hover,.card.open .more{border-color:#7adcf5!important;color:#9fe6ff!important;box-shadow:0 0 14px rgba(95,212,255,.45)}
.tv .on{background:var(--glass-gold)!important;border-color:var(--edge-gold)!important;color:#ffd27a!important;box-shadow:0 0 18px rgba(242,169,59,.35)}.tv .on:hover{box-shadow:0 0 26px rgba(242,169,59,.6)}
header .donate{background:var(--gold);border:1px solid #ffc35c;color:#07080c;box-shadow:0 0 14px rgba(242,169,59,.45)}header .donate:hover{filter:none;box-shadow:0 0 22px rgba(242,169,59,.7)}
header .mine-link{background:var(--glass);border-color:var(--edge)}header .mine-link:hover{border-color:#7adcf5;box-shadow:0 0 12px rgba(95,212,255,.35)}
header input,.deg input{background:var(--glass);border:1px solid rgba(95,212,255,.35)}header input:focus,.deg input:focus{border-color:#7adcf5;box-shadow:0 0 12px rgba(95,212,255,.3)}
.dd .panel,.person,.detail,.support,.finder{border-color:rgba(95,212,255,.22)}.dd .opt.on{color:#9fe6ff}
.ico{display:inline-block;width:18px;height:18px;vertical-align:-4px;background:currentColor;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat;flex:none}.ico.sm{width:14px;height:14px;vertical-align:-2px}.ico.lg{width:24px;height:24px;vertical-align:-6px}
.ico.play{--m:url(/assets/brand/ui/icons/play.png)}.ico.pause{--m:url(/assets/brand/ui/icons/pause.png)}.ico.next{--m:url(/assets/brand/ui/icons/next.png)}.ico.prev{--m:url(/assets/brand/ui/icons/prev.png)}.ico.fullscreen{--m:url(/assets/brand/ui/icons/fullscreen.png)}.ico.search{--m:url(/assets/brand/ui/icons/search.png)}.ico.close{--m:url(/assets/brand/ui/icons/close.png)}.ico.chevron-left{--m:url(/assets/brand/ui/icons/chevron-left.png)}.ico.chevron-right{--m:url(/assets/brand/ui/icons/chevron-right.png)}.ico.chevron-down{--m:url(/assets/brand/ui/icons/chevron-down.png)}.ico.back{--m:url(/assets/brand/ui/icons/back.png)}.ico.heart{--m:url(/assets/brand/ui/icons/heart.png)}.ico.thumbs-up{--m:url(/assets/brand/ui/icons/thumbs-up.png)}.ico.thumbs-down{--m:url(/assets/brand/ui/icons/thumbs-down.png)}.ico.flag{--m:url(/assets/brand/ui/icons/flag.png)}.ico.bookmark{--m:url(/assets/brand/ui/icons/bookmark.png)}.ico.check{--m:url(/assets/brand/ui/icons/check.png)}.ico.plus{--m:url(/assets/brand/ui/icons/plus.png)}.ico.tv{--m:url(/assets/brand/ui/icons/tv.png)}.ico.live{--m:url(/assets/brand/ui/icons/live.png)}.ico.person{--m:url(/assets/brand/ui/icons/person.png)}.ico.people{--m:url(/assets/brand/ui/icons/people.png)}.ico.history{--m:url(/assets/brand/ui/icons/history.png)}.ico.lock{--m:url(/assets/brand/ui/icons/lock.png)}.ico.list{--m:url(/assets/brand/ui/icons/list.png)}.ico.grid{--m:url(/assets/brand/ui/icons/grid.png)}.ico.filter{--m:url(/assets/brand/ui/icons/filter.png)}.ico.sort{--m:url(/assets/brand/ui/icons/sort.png)}.ico.menu{--m:url(/assets/brand/ui/icons/menu.png)}.ico.clapper{--m:url(/assets/brand/ui/icons/clapper.png)}.ico.shuffle{--m:url(/assets/brand/ui/icons/shuffle.png)}.ico.arrow-up{--m:url(/assets/brand/ui/icons/arrow-up.png)}.ico.arrow-down{--m:url(/assets/brand/ui/icons/arrow-down.png)}.ico.history{--m:url(/assets/brand/ui/icons/history.png)}
.btn .ico{margin-right:7px}.btn .ico:last-child{margin-right:0}.dd>button .ico{margin-left:2px;opacity:.8}
.signal{display:inline-block;width:64px;height:64px;background:url(/assets/brand/ui/signal/strip.png) 0 0/auto 100% no-repeat;animation:signal 1.1s steps(9) infinite}@keyframes signal{to{background-position:-576px 0}}
.loading::before{display:none}.loading{display:flex;align-items:center;gap:16px;padding:40px 20px}.loading span{padding:0}
.door{width:72px;height:72px;flex:none;filter:drop-shadow(0 0 10px rgba(95,212,255,.35))}.pagehead{display:flex;align-items:center;gap:16px;padding:14px 20px 4px}.pagehead h1{margin:0;font-size:26px}.pagehead .g{color:var(--dim);font-size:13px}
@media(prefers-reduced-motion:reduce){.signal{animation:none}}
#gate{position:fixed;inset:0;z-index:2000;background:rgba(7,8,12,.82);display:grid;place-items:center;backdrop-filter:blur(8px)}.gatebox{max-width:460px;margin:20px;background:var(--panel);border:1px solid var(--edge-gold);border-radius:16px;padding:26px 28px;text-align:center;box-shadow:0 0 40px rgba(242,169,59,.2)}.gatebox img{width:110px;height:110px}.gatebox b{display:block;font-size:24px;margin-top:8px}.gatebox p{color:var(--dim);font-size:14px;line-height:1.5;margin:10px 0 16px}.gatebox .acts{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.doorcard{display:flex;align-items:center;gap:18px;margin:22px 20px;padding:16px 20px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}.doorcard img{width:72px;height:72px;flex:none}.doorcard b{font-size:18px}.doorcard p{color:var(--dim);font-size:13px;margin:4px 0 0}.doorcard .btn{margin-left:auto}.leave{color:var(--dim);font-size:13px;margin:10px 20px}.leave span{color:var(--acc);cursor:pointer}
.rowmark{width:28px;height:28px;margin-right:8px;vertical-align:-7px}
.about{padding:0 20px 30px;max-width:820px}.about h2{margin:22px 0 6px;padding:0;font-size:17px}.about p{color:var(--fg);line-height:1.6;font-size:15px;margin:0}.about a,.about .lnk{color:var(--acc);cursor:pointer}
body[data-era=classic] .bgimg{filter:sepia(.55) saturate(.55) brightness(.9)}body[data-era=classic] .card .p img,body[data-era=classic] .hero img{filter:sepia(.22) contrast(1.04)}body[data-era=classic] h2,body[data-era=classic] .hero .t b,body[data-era=classic] .bar .count{font-family:Georgia,'Times New Roman',serif}body[data-era=classic] .dd.set>button,body[data-era=classic] .chip.on{border-color:var(--edge-gold);color:#ffd27a}
.bgimg{inset:-12% 0 -12% 0;will-change:transform}.void{will-change:transform}.dust{position:fixed;left:-10%;top:-20%;width:120%;height:140%;pointer-events:none;z-index:0;background:url(/assets/brand/ui/icons/live.png) 0 0/0 0 no-repeat;opacity:0}
.dust{background:radial-gradient(circle at 12% 18%,rgba(95,212,255,.35) 0 1px,transparent 2px),radial-gradient(circle at 78% 32%,rgba(242,169,59,.3) 0 1px,transparent 2px),radial-gradient(circle at 40% 70%,rgba(95,212,255,.28) 0 1px,transparent 2px),radial-gradient(circle at 88% 82%,rgba(255,255,255,.22) 0 1px,transparent 2px),radial-gradient(circle at 22% 52%,rgba(63,207,90,.22) 0 1px,transparent 2px),radial-gradient(circle at 60% 10%,rgba(255,255,255,.18) 0 1px,transparent 2px),radial-gradient(circle at 70% 58%,rgba(95,212,255,.2) 0 1px,transparent 2px),radial-gradient(circle at 5% 90%,rgba(242,169,59,.2) 0 1px,transparent 2px);background-size:900px 700px,1100px 800px,700px 900px,1300px 1000px,800px 600px,1000px 1100px,1200px 900px,900px 1000px;background-position:0 var(--dy,0px);opacity:.9;will-change:transform,background-position}
@media(prefers-reduced-motion:reduce){.dust{display:none}}
.field{position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:hidden}.field i{position:absolute;display:block;will-change:transform}
.field i{animation:kb var(--kbd,50s) ease-in-out infinite alternate}@keyframes kb{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(var(--kbx,0),var(--kby,0),0) scale(var(--kbs,1.12))}}
.fv{-webkit-mask:radial-gradient(circle,#000 12%,transparent 56%);mask:radial-gradient(circle,#000 12%,transparent 56%)}.fv::before{content:'';position:absolute;inset:0;background:url(/assets/brand/void-soft.webp) center/contain no-repeat;animation:spin var(--spin,200s) linear infinite var(--dir,normal)}
.fs{border-radius:50%;background-size:cover;background-position:center;-webkit-mask:radial-gradient(ellipse at center,#000 4%,transparent 52%);mask:radial-gradient(ellipse at center,#000 4%,transparent 52%);mix-blend-mode:screen}
.fg{border-radius:50%;mix-blend-mode:screen;filter:blur(60px)}
.fn{border-radius:45%;background-size:cover;background-position:center;-webkit-mask:radial-gradient(ellipse at center,#000 6%,transparent 54%);mask:radial-gradient(ellipse at center,#000 6%,transparent 54%)}
.fb{left:0;right:0;height:220px;opacity:.5;background:repeating-linear-gradient(180deg,rgba(255,255,255,0) 0 3px,rgba(95,212,255,.16) 3px 4px);-webkit-mask:radial-gradient(ellipse at center,#000 10%,transparent 60%);mask:radial-gradient(ellipse at center,#000 10%,transparent 60%)}
@media(prefers-reduced-motion:reduce){.field i,.fv::before{animation:none}}
@media(max-width:700px){.finder,.guide,.eps,.xray .person,.support,.me>.acts,.dd .panel,.btn.ghost{backdrop-filter:none}.fg{filter:none}.field i{animation:none}}
.tv img.idle{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}
.hist .row{display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line);font-size:14px}.hist .row span{flex:1;cursor:pointer}.hist small{color:var(--dim)}.hist .x{background:none;border:0;color:var(--dim);cursor:pointer;font-size:14px}
.bar{display:flex;flex-wrap:wrap;gap:8px;padding:12px 20px;align-items:center;position:relative;z-index:6}
.dd{position:relative}.dd>button{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:9px 12px 9px 14px;border-radius:999px;font:inherit;font-size:14px;cursor:pointer;white-space:nowrap}.dd>button i{font-style:normal;color:var(--dim);font-size:11px}.dd>button small{color:var(--dim);font-size:12px}.dd>button:hover,.dd.open>button{border-color:var(--acc)}.dd.set>button{border-color:var(--gold);color:var(--gold)}.dd.set>button i{color:var(--gold)}
.dd .panel{position:absolute;top:calc(100% + 6px);left:0;z-index:30;min-width:250px;max-width:min(92vw,360px);max-height:380px;overflow:auto;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:6px;box-shadow:0 14px 40px rgba(0,0,0,.55);animation:drop .14s ease-out}.dd .opt{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:14px}.dd .opt:hover{background:var(--panel)}.dd .opt.on{color:var(--acc)}.dd .opt.on::after{content:'✓';font-size:12px}.dd .opt small{color:var(--dim);font-size:12px;margin-left:auto}.dd .opt.on small{display:none}
.bar .clear{background:none;border:1px solid var(--line);color:var(--dim);padding:8px 12px;border-radius:999px;font:inherit;font-size:13px;cursor:pointer}.bar .clear:hover{color:var(--fg);border-color:var(--fg)}
@media(max-width:600px){.bar{padding:10px 12px;gap:6px}.dd>button{padding:8px 10px 8px 12px;font-size:13px}.dd .panel{position:fixed;left:12px;right:12px;top:auto;bottom:12px;max-width:none;max-height:60vh}}
.bar select{background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:7px 10px;border-radius:8px}
.bar .count{color:var(--dim);margin-left:auto;font-size:13px}
.chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 20px 8px}
.chip{background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:4px 10px;border-radius:999px;font-size:13px;cursor:pointer}
.chip.on{border-color:var(--acc);color:var(--acc)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;padding:6px 20px 24px}
.card{position:relative;cursor:pointer;border-radius:8px;overflow:hidden;background:var(--panel);outline:2px solid transparent}
.card:hover,.card:focus{outline-color:var(--acc)}
.card .p{aspect-ratio:2/3;background:var(--panel2);display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:12px;text-align:center;padding:8px}
.card img{width:100%;height:100%;object-fit:cover;display:block}
.card .t{padding:8px 10px 10px}.card b{display:block;font-size:14px;line-height:1.25}.card small{color:var(--dim);display:block;margin-top:3px}
.card .more{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;border:1px solid var(--line);background:rgba(7,8,12,.75);color:var(--fg);cursor:pointer;font-size:13px;line-height:24px;text-align:center}
.card .more:hover,.card.open .more{border-color:var(--acc);color:var(--acc)}
h2{margin:18px 20px 8px;font-size:18px;display:flex;align-items:baseline;gap:10px}h2 small{color:var(--dim);font-weight:400;font-size:13px}h2 .all{margin-left:auto;color:var(--acc);font-size:13px;font-weight:400;cursor:pointer}
.rowwrap{position:relative;padding:0 20px}
.track{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x proximity;overscroll-behavior-x:contain;scroll-behavior:smooth;padding:4px 2px 10px;scrollbar-width:none}.track::-webkit-scrollbar{display:none}
.track .card{flex:0 0 156px;scroll-snap-align:start}
.arrow{position:absolute;top:50%;transform:translateY(-60%);width:44px;height:44px;border-radius:50%;border:2px solid var(--acc);background:rgba(7,8,12,.92);color:var(--acc);font-size:30px;line-height:38px;padding:0;cursor:pointer;z-index:2;box-shadow:0 2px 12px rgba(0,0,0,.6)}
.arrow.l{left:-2px}.arrow.r{right:-2px}.arrow:hover{background:var(--acc);color:#07080c}
@media(hover:none){.arrow{display:none}}
.detail{margin:0 20px 16px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:14px 16px;display:grid;grid-template-columns:90px 1fr;gap:14px;animation:drop .18s ease-out}
@keyframes drop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.detail img{width:90px;border-radius:6px;display:block}.detail b{font-size:17px}.detail p{margin:6px 0;font-size:14px;max-width:820px}.detail .g{color:var(--dim);font-size:12px}
.detail .acts{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}
.grid .card.open .indetail{display:block}.indetail{display:none;padding:0 10px 10px;font-size:13px;color:var(--fg)}.indetail p{margin:4px 0}
.genres{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;padding:0 20px 24px}
.genres button{background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:16px 10px;border-radius:10px;cursor:pointer}
.genres button:hover{border-color:var(--acc)}.genres small{display:block;color:var(--dim);margin-top:3px}
.show{padding:0 20px 24px}
.back{background:none;border:0;color:var(--acc);cursor:pointer;padding:12px 0}
.hero{position:relative;border-radius:10px;overflow:hidden;background:var(--panel);min-height:160px}
.hero img{width:100%;max-height:300px;object-fit:cover;display:block;opacity:.5}
.hero .t{position:absolute;left:20px;bottom:16px;right:20px}.hero .t b{font-size:28px}.hero .t p{margin:6px 0 0;max-width:760px;font-size:14px}.hero .g{color:var(--dim);font-size:12px;margin-top:4px}
.player{display:grid;grid-template-columns:1fr 340px;gap:16px;margin-top:14px}
video{width:100%;max-height:70vh;background:#000;border-radius:8px;outline:none}
.now{display:flex;justify-content:space-between;align-items:center;margin:10px 0 0;gap:10px}.now b{font-size:17px}
.btn{background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:8px 14px;border-radius:8px;cursor:pointer;white-space:nowrap}
.eps{max-height:76vh;overflow:auto;background:var(--panel);border-radius:8px;padding:6px}
.eps h3{margin:10px 8px 4px;color:var(--dim);font-weight:600;letter-spacing:.06em;font-size:11px}
.sehead{display:flex;align-items:center;gap:10px;padding:4px 4px 8px}.sehead select{flex:1;background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:9px 12px;border-radius:8px;font:inherit;font-weight:600}.sehead small{color:var(--dim);white-space:nowrap}
.ep{display:flex;gap:8px;align-items:center;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:14px}.ep:hover,.ep.on{background:var(--panel2)}
.ep .n{color:var(--dim);width:34px;flex:none}.ep .m{color:var(--dim);margin-left:auto;flex:none}.ep .rv{color:var(--rev);font-size:11px;border:1px solid var(--rev);border-radius:4px;padding:0 4px}
.hint{color:var(--dim);font-size:13px;margin-top:12px}
.xray h3,.inep h3{margin:22px 0 8px;font-size:15px;letter-spacing:.04em;color:var(--dim);font-weight:600}
.faces{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 10px;scrollbar-width:thin}
.face{flex:0 0 96px;cursor:pointer;text-align:center;border-radius:8px;padding:6px 4px;outline:2px solid transparent}.face:hover,.face.on{background:var(--panel);outline-color:var(--acc)}
.face img,.face .ph{width:72px;height:72px;border-radius:50%;object-fit:cover;background:var(--panel2);display:block;margin:0 auto 6px}
.face b{display:block;font-size:12px;line-height:1.2}.face small{display:block;color:var(--dim);font-size:11px;line-height:1.2;margin-top:2px;max-height:2.4em;overflow:hidden}
.person{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:4px 0 10px;display:grid;grid-template-columns:72px 1fr;gap:14px;animation:drop .18s ease-out}
.person img{width:72px;height:72px;border-radius:50%;object-fit:cover}.person b{font-size:16px}.person .g{color:var(--dim);font-size:12px;margin-top:2px}
.person .links{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.plink{display:flex;gap:8px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 10px 6px 6px;cursor:pointer;font-size:13px}.plink:hover{border-color:var(--acc)}
.plink img{width:28px;height:42px;object-fit:cover;border-radius:4px}.plink small{display:block;color:var(--dim);font-size:11px}
.conn{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 10px;scrollbar-width:thin}
.conn .card{flex:0 0 140px}.conn .card .via{display:block;color:var(--acc);font-size:11px;margin-top:3px;line-height:1.2}
.loading{padding:40px 20px;color:var(--dim)}
footer{color:var(--fg);font-size:13px;padding:20px;border-top:1px solid var(--line);margin-top:20px}
@media(max-width:860px){.player{grid-template-columns:1fr}.eps{max-height:40vh}.hero .t b{font-size:22px}}
`;

// Browser code. MODE 'embed': all data inline. MODE 'split': index inline, shows + graph fetched from BASE.
// ROUTES 'hash' (#slug) or 'path' (/show/slug, needs a host that serves index.html for unknown paths).
const JS = `
const BY_SLUG=Object.fromEntries(SHOWS.map(s=>[s.slug,s]));
const state={q:'',type:'',genre:'',network:'',decade:'',tag:'',sort:'eps',show:null,se:0,e:0,open:null,openCtx:null,person:null,view:'',personId:null,chan:'void',tvOn:false,menu:null};
const $=(id)=>document.getElementById(id);
const esc=(s)=>String(s==null?'':s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const decade=(y)=>y?Math.floor(+y/10)*10+'s':'';
// MINE: list, likes, history and reports live in one blob (voidtv:me) so a later sync code can move it whole.
const ME=(()=>{let m=null;try{m=JSON.parse(localStorage.getItem('voidtv:me')||'null')}catch(_){}if(!m||m.v!==1)m={v:1,list:{},likes:{},history:{},reports:{}};
 try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('voidtv:')&&k!=='voidtv:me'){const sl=k.slice(7);if(!m.history[sl]){const r=JSON.parse(localStorage.getItem(k)||'null');if(r&&r.se!=null)m.history[sl]={se:r.se,e:r.e,at:0,pos:0}}}}}catch(_){}
 return m})();
function saveMe(){try{localStorage.setItem('voidtv:me',JSON.stringify(ME))}catch(_){}}
const hidden=(s)=>ME.likes[s.slug]===-1;
const isAdult=(s)=>!!(s&&(s.adult||s.type==='Late Night'||(s.tags||[]).includes('Late Night')));
const gated=(s)=>isAdult(s)&&!ME.adult;
function adultGate(then){const old=$('gate');if(old)old.remove();const g=document.createElement('div');g.id='gate';g.innerHTML='<div class="gatebox"><img src="'+BASE+'assets/brand/ui/doors/latenight.png" alt=""><b>Late Night</b><p>The after-dark shelf: HBO and Showtime documentary series, Cinemax, the Playboy years. Adults only. By entering you confirm you are 18 or older.</p><div class="acts"><button class="btn gold" id="gate-yes">I am 18 or older, enter</button><button class="btn ghost" id="gate-no">Not now</button></div></div>';document.body.appendChild(g);
 $('gate-yes').onclick=()=>{ME.adult=Date.now();saveMe();g.remove();then&&then()};$('gate-no').onclick=()=>{g.remove();if(state.show&&gated(state.show))go('')};g.onclick=(e)=>{if(e.target===g)$('gate-no').click()}}
function leaveAdult(){ME.adult=0;saveMe();state.type=state.type==='Late Night'?'':state.type;go('')}
const VIS=()=>SHOWS.filter(s=>!hidden(s)&&!gated(s));
const histShows=()=>Object.entries(ME.history).sort((a,b)=>(b[1].at||0)-(a[1].at||0)).map(([sl])=>BY_SLUG[sl]).filter(Boolean);
const listShows=()=>Object.entries(ME.list).sort((a,b)=>b[1]-a[1]).map(([sl])=>BY_SLUG[sl]).filter(Boolean);
const likedShows=()=>Object.keys(ME.likes).filter(k=>ME.likes[k]===1).map(k=>BY_SLUG[k]).filter(Boolean);
function afterMe(slug){if(state.show){document.querySelectorAll('.mine[data-slug="'+slug+'"]').forEach(e=>{e.innerHTML=acts(BY_SLUG[slug])})}else render()}
function like(slug,v){ME.likes[slug]=ME.likes[slug]===v?0:v;saveMe();afterMe(slug)}
function listToggle(slug){if(ME.list[slug])delete ME.list[slug];else ME.list[slug]=Date.now();saveMe();afterMe(slug)}
function acts(s){const l=ME.likes[s.slug]||0;return '<button class="btn'+(ME.list[s.slug]?' on':'')+'" onclick="event.stopPropagation();listToggle(\\''+s.slug+'\\')">'+(ME.list[s.slug]?'<i class="ico check"></i>In My List':'<i class="ico plus"></i>My List')+'</button><button class="btn'+(l===1?' on':'')+'" title="Like" onclick="event.stopPropagation();like(\\''+s.slug+'\\',1)"><i class="ico thumbs-up"></i>'+(l===1?'Liked':'Like')+'</button><button class="btn'+(l===-1?' on':'')+'" title="Not for me: hides it from the rows (search still finds it)" onclick="event.stopPropagation();like(\\''+s.slug+'\\',-1)"><i class="ico thumbs-down"></i>'+(l===-1?'Hidden':'Not for me')+'</button>'}
const repKey=(s,se,ep)=>s.slug+'/'+se.season+'/'+ep.n;
function repBtn(s,se,ep){const on=!!ME.reports[repKey(s,se,ep)];return '<button class="btn'+(on?' on':'')+'" id="rep" title="Tell the builder this file is the wrong episode or will not play" onclick="report()"><i class="ico flag"></i>'+(on?'Reported':'Wrong file?')+'</button>'}
function shareMoment(){const s=state.show,se=s.seasons[state.se],ep=se.episodes[state.e],v=$('v');const t=v?Math.floor(v.currentTime):0;const u=location.origin+urlFor(s.slug)+'?s='+se.season+'&e='+ep.n+(t>5?'&t='+t:'');const done=()=>{const b=$('share');if(b){b.innerHTML='<i class="ico check"></i>Link copied';setTimeout(()=>{if($('share'))$('share').innerHTML='<i class="ico arrow-up"></i>Share this moment'},2200)}};if(navigator.clipboard)navigator.clipboard.writeText(u).then(done,()=>prompt('Copy this link',u));else prompt('Copy this link',u)}
function report(){const s=state.show,se=s.seasons[state.se],ep=se.episodes[state.e],k=repKey(s,se,ep);if(ME.reports[k])delete ME.reports[k];else ME.reports[k]={show:s.show,season:se.season,ep:ep.n,name:ep.name,item:ep.item,url:ep.url,at:Date.now()};saveMe();const b=$('rep');if(b)b.outerHTML=repBtn(s,se,ep)}
function exportMe(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(ME,null,1)],{type:'application/json'}));a.download='voidtv-mine.json';a.click()}
function importMe(f){if(!f)return;f.text().then(t=>{const m=JSON.parse(t);if(!m||m.v!==1)throw 0;for(const k of ['list','likes','history','reports'])Object.assign(ME[k],m[k]||{});saveMe();render()}).catch(()=>alert('That file is not a VOIDtv export.'))}
function clearMe(){ME.list={};ME.likes={};ME.history={};ME.reports={};saveMe();render()}
function mePage(){const cont=histShows(),mine=listShows(),liked=likedShows(),hid=Object.keys(ME.likes).filter(k=>ME.likes[k]===-1).map(k=>BY_SLUG[k]).filter(Boolean),reps=Object.entries(ME.reports).sort((a,b)=>b[1].at-a[1].at);
 let h='<div class="me"><button class="back" onclick="go(\\'\\')"><i class="ico back"></i> Browse</button><div class="pagehead" style="padding-left:0"><img class="door" src="'+BASE+'assets/brand/ui/doors/mine.png" alt=""><div><h1>Mine</h1></div></div><p class="g">Your list, likes and watch history live in this browser only for now. Export to move them to another device; a sync code is coming.</p><div class="acts"><button class="btn" onclick="exportMe()">Export</button><label class="btn">Import<input type="file" accept="application/json,.json" style="display:none" onchange="importMe(this.files[0])"></label><button class="btn" onclick="if(confirm(\\'Clear your list, likes and history on this device?\\'))clearMe()">Clear</button></div>';
 if(cont.length)h+=shelf('Continue watching',cont,'continue');
 if(mine.length)h+=shelf('My List',mine,'list');
 if(liked.length)h+=shelf('Liked',liked,'liked');
 if(hid.length)h+='<h2>Not for me<small>'+hid.length+' hidden from the rows</small></h2><div class="chips">'+hid.map(s=>'<span class="chip" title="Show it again" onclick="like(\\''+s.slug+'\\',-1)">'+esc(s.show)+' ✕</span>').join('')+'</div>';
 if(cont.length)h+='<h2>History</h2><div class="hist">'+cont.slice(0,100).map(s=>{const r=ME.history[s.slug];return '<div class="row"><span onclick="go(\\''+s.slug+'\\')">'+esc(s.show)+'</span><small>'+(r.at?new Date(r.at).toLocaleDateString():'')+'</small><button class="x" title="Forget" onclick="delete ME.history[\\''+s.slug+'\\'];saveMe();render()">✕</button></div>'}).join('')+'</div>';
 if(reps.length)h+='<h2>Reported files<small>'+reps.length+'</small></h2><div class="hist">'+reps.map(([k,r])=>'<div class="row"><span>'+esc(r.show)+' S'+r.season+'E'+r.ep+' · '+esc(r.name)+'</span><small>'+esc(r.item||'')+'</small><button class="x" title="Forget" onclick="delete ME.reports[\\''+k+'\\'];saveMe();render()">✕</button></div>').join('')+'</div>';
 if(!cont.length&&!mine.length&&!liked.length)h+='<p class="g">Nothing here yet. Play something, or add shows to My List from the ▾ on any card.</p>';
 $('main').innerHTML=h+'</div>'}
function counts(key){const m={};for(const s of SHOWS){const v=(key==='genres'||key==='tags')?(s[key]||[]):[s[key]];for(const x of v)if(x)m[x]=(m[x]||0)+1}return Object.entries(m).sort((a,b)=>b[1]-a[1])}
function filtered(){const q=state.q.trim().toLowerCase();let r=SHOWS.filter(s=>!gated(s)&&(!state.type||s.type===state.type)&&(!state.genre||s.genres.includes(state.genre))&&(!state.network||s.network===state.network)&&(!state.decade||decade(s.year)===state.decade)&&(!state.tag||(s.tags||[]).includes(state.tag))&&(!q||s.show.toLowerCase().includes(q)||s.genres.join(' ').toLowerCase().includes(q)||(s.network||'').toLowerCase().includes(q)||(s.tags||[]).join(' ').toLowerCase().includes(q)||(s.people||'').toLowerCase().includes(q)));
 const by={eps:(a,b)=>b.eps-a.eps,rating:(a,b)=>(b.rating||0)-(a.rating||0)||b.eps-a.eps,year:(a,b)=>(+b.year||0)-(+a.year||0),old:(a,b)=>(+a.year||9999)-(+b.year||9999),az:(a,b)=>a.show.localeCompare(b.show),added:(a,b)=>(b.matchedAt||'').localeCompare(a.matchedAt||'')};return r.sort(by[state.sort]||by.eps)}
function sel(key,label,opts){return '<select onchange="state.'+key+'=this.value;render()"><option value="">'+label+'</option>'+opts.map(([v,n])=>'<option value="'+esc(v)+'"'+(state[key]===v?' selected':'')+'>'+esc(v)+(n?' ('+n+')':'')+'</option>').join('')+'</select>'}
function meta(s){return [s.network,s.year,s.genres.join(' · '),s.rating?'★ '+s.rating:'',s.eps+' episode'+(s.eps===1?'':'s'),s.runtime?s.runtime+' min':''].filter(Boolean).join('  ·  ')}
function hue(str){let h=0;for(const c of String(str))h=(h*31+c.charCodeAt(0))%360;return h}
function genPoster(s){const words=s.show.replace(/^(the|a|an) /i,'').split(/\\s+/);const ini=words.slice(0,2).map(w=>w[0]||'').join('').toUpperCase();return '<div class="p gen" style="--h:'+hue(s.network||s.show)+'"><b>'+esc(ini)+'</b><span>'+esc(s.show)+'</span><small>'+esc([s.network,s.year].filter(Boolean).join(' · '))+'</small></div>'}
function card(s,ctx){const total=s.eps;const open=state.open===s.slug;return '<div class="card'+(open?' open':'')+'" data-slug="'+s.slug+'" tabindex="0" onclick="go(\\''+s.slug+'\\')" onkeydown="if(event.key===\\'Enter\\')go(\\''+s.slug+'\\')">'
 +'<button class="more" title="Details" onclick="event.stopPropagation();toggle(\\''+s.slug+'\\',\\''+ctx+'\\')">'+(open?'<i class="ico arrow-up sm"></i>':'<i class="ico chevron-down sm"></i>')+'</button>'
 +(s.poster?'<div class="p"><img loading="lazy" src="'+s.poster+'" alt=""></div>':genPoster(s))+'<div class="t"><b>'+esc(s.show)+'</b><small>'+esc(s.network||'')+(s.year?' · '+s.year:'')+' · '+total+' ep'+(total===1?'':'s')+(s.rating?' · ★ '+s.rating:'')+'</small></div>'
 +(ctx==='grid'?'<div class="indetail"><p>'+esc(s.overview||'No description yet.')+'</p><p class="g">'+esc(meta(s))+'</p></div>':'')+'</div>'}
function detail(s){return '<div class="detail">'+(s.poster?'<img src="'+s.poster+'" alt="">':'<div></div>')+'<div><b>'+esc(s.show)+'</b><p>'+esc(s.overview||'No description yet.')+'</p><div class="g">'+esc(meta(s))+'</div><div class="acts"><button class="btn" onclick="go(\\''+s.slug+'\\')"><i class="ico play"></i>Play</button><button class="btn" onclick="state.open=null;render()"><i class="ico close sm"></i>Close</button><span class="mine" data-slug="'+s.slug+'">'+acts(s)+'</span></div></div></div>'}
function toggle(slug,ctx){state.open=state.open===slug?null:slug;state.openCtx=ctx;render();if(state.open&&ctx!=='grid'){const d=document.querySelector('.detail');if(d)d.scrollIntoView({block:'nearest',behavior:'smooth'})}}
function shelf(title,list,key){const id='t-'+key.replace(/[^a-z0-9]+/gi,'-').toLowerCase();const openHere=state.open&&state.openCtx===key&&list.some(s=>s.slug===state.open);
 return '<h2>'+(key==='type:Classic TV'?'<img class="rowmark" src="'+BASE+'assets/brand/ui/doors/classic.png" alt="">':key==='type:Late Night'?'<img class="rowmark" src="'+BASE+'assets/brand/ui/doors/latenight.png" alt="">':'')+esc(title)+'<small>'+list.length+' shows</small>'+(key.startsWith('type:')?'<span class="all" onclick="state.type=\\''+esc(title)+'\\';render();window.scrollTo(0,0)">See all ›</span>':key.startsWith('tag:')?'<span class="all" onclick="state.tag=\\''+esc(title)+'\\';render();window.scrollTo(0,0)">See all ›</span>':'')+'</h2>'
 +'<div class="rowwrap"><button class="arrow l" onclick="slide(\\''+id+'\\',-1)"><i class="ico chevron-left"></i></button><div class="track" id="'+id+'">'+list.map(s=>card(s,key)).join('')+'</div><button class="arrow r" onclick="slide(\\''+id+'\\',1)"><i class="ico chevron-right"></i></button></div>'
 +(openHere?detail(list.find(s=>s.slug===state.open)):'')}
function slide(id,dir){const t=$(id);if(!t)return;const step=168;t.scrollBy({left:dir*Math.max(step,Math.floor((t.clientWidth-120)/step)*step),behavior:'smooth'})}
// Re-rendering replaces the whole page, so remember where each shelf was scrolled and put it back (no animation).
function blip(host){const h=host||$('main');if(!h||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const b=document.createElement('div');b.className='blip';h.appendChild(b);setTimeout(()=>b.remove(),200)}
function field(){const main=$('main');if(!main)return;const old=main.querySelector('.field');if(old)old.remove();const H=main.scrollHeight;if(H<1400)return;const f=document.createElement('div');f.className='field';let seed=4242;const rnd=()=>{seed=(seed*9301+49297)%233280;return seed/233280};
 const tints=['95,212,255','242,169,59','212,80,160','63,207,90','95,212,255'];const neon=['sign-pink','wall','watcher-purple','sign-orange','watcher-orange'];const stat=['static-dark','static-bolt','static-glitch'];
 const kb=()=>'--kbd:'+(36+rnd()*44|0)+'s;--kbx:'+((rnd()*6-3)|0)+'%;--kby:-'+(2+rnd()*6|0)+'%;--kbs:'+(1.06+rnd()*0.16).toFixed(2)+';animation-delay:-'+(rnd()*40|0)+'s;';
 const xs=['-14%','8%','30%','52%','72%'];const W=main.clientWidth||1200;
 const piece=(kind,y,xi,fade)=>{const x=xs[xi%xs.length];const op=(0.018+rnd()*0.03)*fade;
  if(kind==='v'){const sz=560+rnd()*760|0;return '<i class="fv" style="top:'+(y-sz/2|0)+'px;left:calc('+x+' - '+(sz/4|0)+'px);width:'+sz+'px;height:'+sz+'px;opacity:'+op.toFixed(3)+';--spin:'+(150+rnd()*220|0)+'s;--dir:'+(rnd()<0.5?'normal':'reverse')+';'+kb()+'"></i>'}
  if(kind==='s'){const w=820+rnd()*900|0,hh=380+rnd()*420|0;return '<i class="fs" style="top:'+(y-hh/2|0)+'px;left:calc('+x+' - '+(w/4|0)+'px);width:'+w+'px;height:'+hh+'px;opacity:'+(op*1.4).toFixed(3)+';background-image:url('+BASE+'assets/brand/bg/'+stat[rnd()*stat.length|0]+'-m.jpg);'+kb()+'"></i>'}
  if(kind==='n'){const w=1000+rnd()*640|0,hh=560+rnd()*320|0;return '<i class="fn" style="top:'+(y-hh/2|0)+'px;left:calc('+x+' - '+(w/4|0)+'px);width:'+w+'px;height:'+hh+'px;opacity:'+(0.06+rnd()*0.05).toFixed(3)+';background-image:url('+BASE+'assets/brand/bg/'+neon[rnd()*neon.length|0]+'-m.jpg);'+kb()+'"></i>'}
  if(kind==='g'){const c=tints[rnd()*tints.length|0];const sz=640+rnd()*760|0;return '<i class="fg" style="top:'+(y-sz/2|0)+'px;left:calc('+x+' - '+(sz/4|0)+'px);width:'+sz+'px;height:'+sz+'px;opacity:'+(op*1.8).toFixed(3)+';background:radial-gradient(circle,rgba('+c+',.8) 0%,rgba('+c+',.16) 30%,rgba(0,0,0,0) 64%);'+kb()+'"></i>'}
  return '<i class="fb" style="top:'+(y-110)+'px;opacity:'+(op*1.1).toFixed(3)+';'+kb()+'"></i>'};
 // a slot every ~700 px, always filled; kinds cycle so each one recurs; a second piece in every other slot for the combos
 const cycleTop=['v','g','v','g','b'],cycleMid=['g','s','v','n','g','s','b'],cycleLow=['n','g','v','n','s','g','v','b'];
 let y=520,k=0,h='',xi=rnd()*5|0;
 while(y<H-250){const pos=y/H;const fade=1-0.3*pos;const cyc=pos<0.3?cycleTop:pos<0.55?cycleMid:cycleLow;const kind=cyc[k%cyc.length];
  h+=piece(kind,y,xi,fade);xi=(xi+2+(rnd()*2|0))%5;
  if(k%2===1){const second=kind==='g'?'v':'g';h+=piece(second,y+260+(rnd()*200|0),(xi+2)%5,fade*0.9)}
  y+=620+rnd()*200|0;k++}
 f.innerHTML=h;main.appendChild(f)}
function keepTracks(fn){const pos={};document.querySelectorAll('.track').forEach(t=>{pos[t.id]=t.scrollLeft});const y=window.scrollY;fn();document.querySelectorAll('.track').forEach(t=>{if(pos[t.id]){t.style.scrollBehavior='auto';t.scrollLeft=pos[t.id];t.style.scrollBehavior=''}});window.scrollTo(0,y)}
function browse(){let list=filtered();if(!state.q)list=list.filter(s=>!hidden(s));const any=state.type||state.genre||state.network||state.decade||state.tag||state.q;
 const bar=filterBar(list);
 let h='';
 if(any){
  h=bar+'<div class="chips">'+[['type',state.type],['tag',state.tag],['genre',state.genre],['network',state.network],['decade',state.decade]].filter(x=>x[1]).map(([k,v])=>'<span class="chip on" onclick="state.'+k+'=\\'\\';render()">'+esc(v)+' ✕</span>').join('')+(state.q?'<span class="chip on" onclick="state.q=\\'\\';$(\\'q\\').value=\\'\\';render()">“'+esc(state.q)+'” ✕</span>':'')+'</div>';
  h+='<div class="grid">'+list.map(s=>card(s,'grid')).join('')+'</div>';
 } else {
  // 1. the featured wall: one show at a time, varied and endless, with its description and a way in
  h+='<section class="hero-home"><div class="bg slides"><img class="s a" alt=""><img class="s b" alt=""></div><div class="shade"></div><button class="harrow l" onclick="heroStep(-1)" aria-label="previous"><i class="ico chevron-left"></i></button><button class="harrow r" onclick="heroStep(1)" aria-label="next"><i class="ico chevron-right"></i></button><div class="copy" id="herocopy"></div><span class="hcount" id="herocount"></span></section>';
  h+='<div class="support"><img class="cross" src="'+BASE+'assets/brand/cash-cross.png" alt=""><span class="sp"><b>VOIDtv is free and stays free.</b> The shows belong to the Internet Archive; what we add is a better way to find and watch them. That is the work of CASH, the Church of American Strength &amp; Hope: finding ways for people to have good things that fit a busy life and a budget stretched to the max. No set amount, never required. If that is work worth supporting, give back and be part of it.</span><span class="acts"><a class="btn" href="https://cashvalues.org" target="_blank" rel="noopener">About CASH</a><a class="btn" href="'+DONATE+'" target="_blank" rel="noopener">♥ Donate to CASH</a></span></div>';
  // 2. yours
  const cont=histShows().slice(0,30);if(cont.length)h+=shelf('Continue watching',cont,'continue');
  const mine=listShows();if(mine.length)h+=shelf('My List',mine,'list');
  // 3. genres and filters
  h+='<h2>Find something<small>pick a genre, a network, a row or a collection</small></h2>'+bar;
  // 4. the rows, in all their splendor
  const recent=VIS().sort((a,b)=>(b.matchedAt||'').localeCompare(a.matchedAt||'')).slice(0,30);
  h+=shelf('Recently added',recent,'recent');
  const top=VIS().filter(s=>s.rating).sort((a,b)=>b.rating-a.rating||b.eps-a.eps).slice(0,30);
  h+=shelf('Top rated',top,'top');
  const done=new Set();const put=(kind,name)=>{const key=kind+':'+name;if(done.has(key))return;done.add(key);const rows=list.filter(s=>kind==='tag'?(s.tags||[]).includes(name):s.type===name);if(rows.length)h+=shelf(name,rows,key)};
  for(const [kind,name] of HOME_ORDER)put(kind,name);
  for(const [tag] of counts('tags'))put('tag',tag);
  for(const t of TYPES)put('type',t);
  if(!ME.adult&&SHOWS.some(isAdult))h+='<section class="doorcard"><img src="'+BASE+'assets/brand/ui/doors/latenight.png" alt=""><div><b>Late Night</b><p>The after-dark shelf. Adults only, behind its own door.</p></div><button class="btn gold" onclick="adultGate(()=>{state.type=\\'Late Night\\';render();window.scrollTo(0,0)})">Enter 18+</button></section>';
  else if(ME.adult)h+='<p class="leave">Late Night is open on this browser. <span onclick="leaveAdult()">Close the door</span></p>';
 }
 $('main').innerHTML=h;if(!any)heroStart()}
// The featured pool: the best-rated, the cult favourites (long runs that never got the ratings), and
// a few from every row and collection, shuffled with the day as the seed so it reads differently
// tomorrow but the same for everyone today.
const SKIP_GENRES=new Set(['Kids','TV Movie','News']);
const SORTS=[['eps','Most episodes'],['rating','Top rated'],['year','Newest'],['old','Oldest'],['added','Recently added'],['az','A to Z']];
function menuToggle(k,ev){if(ev)ev.stopPropagation();state.menu=state.menu===k?null:k;render()}
function pick(k,v,ev){if(ev)ev.stopPropagation();state[k]=v;state.menu=null;render();if(k!=='sort')window.scrollTo(0,0)}
document.addEventListener('click',()=>{if(state.menu){state.menu=null;render()}});
function dd(key,label,opts,current,isSort){const open=state.menu===key;const cur=opts.find(o=>o[0]===current);
 return '<div class="dd'+(open?' open':'')+(current&&!isSort?' set':'')+'"><button type="button" onclick="menuToggle(\\''+key+'\\',event)">'+(isSort?'<small>Sort</small> ':'')+esc(cur?(cur[2]||cur[0]):label)+'<i class="ico chevron-down sm"></i></button>'
 +(open?'<div class="panel" onclick="event.stopPropagation()">'+(!isSort?'<div class="opt'+(current?'':' on')+'" onclick="pick(\\''+key+'\\',\\'\\',event)">'+esc(label)+'</div>':'')+opts.map(([v,n,txt])=>'<div class="opt'+(current===v?' on':'')+'" onclick="pick(\\''+key+'\\',\\''+esc(v)+'\\',event)"><span>'+esc(txt||v)+'</span>'+(n!=null?'<small>'+n+'</small>':'')+'</div>').join('')+'</div>':'')+'</div>'}
function filterBar(list){const series=SHOWS.filter(t=>!t.slug.startsWith('movie-')&&!hidden(t)&&!gated(t));const tally=(key,src)=>{const m={};for(const t of src){const v=key==='genres'||key==='tags'?(t[key]||[]):[t[key]];for(const x of v)if(x)m[x]=(m[x]||0)+1}return Object.entries(m).sort((a,b)=>b[1]-a[1])};
 const rows=TYPES.map(t=>[t,SHOWS.filter(s=>s.type===t&&!hidden(s)&&!gated(s)).length]).filter(x=>x[1]);
 const genres=tally('genres',series).filter(([g])=>!SKIP_GENRES.has(g));
 const nets=tally('network',series).filter(([,c])=>c>=2).slice(0,40);
 const decs=[['1950s'],['1960s'],['1970s'],['1980s'],['1990s'],['2000s'],['2010s'],['2020s']].map(([d])=>[d,series.filter(t=>decade(t.year)===d).length]).filter(x=>x[1]);
 const any=state.type||state.genre||state.network||state.decade||state.tag||state.q;
 return '<div class="bar">'+dd('type','All rows',rows,state.type)+dd('tag','All collections',tally('tags',series),state.tag)+dd('genre','All genres',genres,state.genre)+dd('network','All networks',nets,state.network)+dd('decade','All decades',decs,state.decade)+dd('sort','Sort',SORTS.map(([v,n])=>[v,null,n]),state.sort,true)
 +(any?'<button type="button" class="clear" onclick="state.type=state.genre=state.network=state.decade=state.tag=\\'\\';state.q=\\'\\';if($(\\'q\\'))$(\\'q\\').value=\\'\\';render()"><i class="ico close sm"></i>Clear</button>':'')+'<span class="count">'+list.length+' shows · '+list.reduce((n,s)=>n+s.eps,0)+' episodes</span></div>'}
function finder(){const series=VIS().filter(t=>!t.slug.startsWith('movie-'));const tally=(key)=>{const m={};for(const t of series){const v=key==='genres'?(t.genres||[]):[t[key]];for(const x of v)if(x)m[x]=(m[x]||0)+1}return Object.entries(m).sort((a,b)=>b[1]-a[1])};
 const pills=(key,list)=>'<span class="pills">'+list.map(([v,c])=>'<span class="chip'+(state[key]===v?' on':'')+'" onclick="state.'+key+'=\\''+esc(v)+'\\';render();window.scrollTo(0,0)">'+esc(v)+(c?'<small>'+c+'</small>':'')+'</span>').join('')+'</span>';
 const genres=tally('genres').filter(([g])=>!SKIP_GENRES.has(g)).slice(0,14);const nets=tally('network').filter(([,c])=>c>=4).slice(0,16);const decs=[['1950s'],['1960s'],['1970s'],['1980s'],['1990s'],['2000s'],['2010s'],['2020s']].map(([d])=>[d,series.filter(t=>decade(t.year)===d).length]).filter(x=>x[1]);
 return '<div class="finder"><div class="frow"><span class="lbl">Genre</span>'+pills('genre',genres)+'</div><div class="frow"><span class="lbl">Network</span>'+pills('network',nets)+'</div><div class="frow"><span class="lbl">Decade</span>'+pills('decade',decs)+'</div></div>'}
function heroPool(){if(state.heroPool)return state.heroPool;const ok=SHOWS.filter(t=>t.backdrop&&t.overview&&!t.slug.startsWith('movie-')&&!hidden(t)&&!gated(t)&&t.eps>=6);
 // three decks: the well-known (rated and deep), the cult (deep but under-rated), the shelves (two from every row and collection); dealt popular-first, then interleaved
 const QUIET=new Set(['World TV','Anime','Reality & Talk','Late Night','Internet Comedy','Classic TV']);const main=ok.filter(t=>!QUIET.has(t.type));
 const byR=main.filter(t=>t.rating>=7&&t.eps>=10).sort((a,b)=>b.rating-a.rating||b.eps-a.eps);const popular=byR.slice(0,80);const pop=new Set(popular);
 const cult=main.filter(t=>t.eps>=20&&!pop.has(t)).sort((a,b)=>b.eps-a.eps).slice(0,50);const cul=new Set(cult);
 const groups={};for(const t of ok){(groups[t.type]=groups[t.type]||[]).push(t);for(const g of t.tags||[])(groups['#'+g]=groups['#'+g]||[]).push(t)}
 const shelf=[];for(const arr of Object.values(groups))for(const t of arr.sort((a,b)=>(b.rating||0)-(a.rating||0)).slice(0,2))if(!pop.has(t)&&!cul.has(t)&&!shelf.includes(t))shelf.push(t);
 let seed=Math.floor(Date.now()/864e5)*7919+13;const rnd=()=>{seed=(seed*9301+49297)%233280;return seed/233280};const shuf=(a)=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
 const P=shuf(popular.slice()),C=shuf(cult.slice()),S=shuf(shelf);const arr=[];
 // pattern per six: popular, popular, cult, popular, shelf, cult — the known faces carry it, the finds keep it alive
 const pattern=[P,P,C,P,S,C];let k=0;while(P.length||C.length||S.length){const d=pattern[k%6];const t=(d.length?d:(P.length?P:(C.length?C:S))).shift();if(t)arr.push(t);k++}
 state.heroPool=arr;if(state.heroI==null)state.heroI=0;return arr}
function heroStart(manual){if(state.heroTimer){clearInterval(state.heroTimer);state.heroTimer=null}const pool=heroPool();if(!pool.length)return;heroRender(!manual);state.heroTimer=setInterval(()=>{if(!document.getElementById('herocopy')){clearInterval(state.heroTimer);state.heroTimer=null;return}state.heroI=(state.heroI+1)%pool.length;heroRender(false)},9000)}
function heroStep(d){const pool=heroPool();if(!pool.length)return;state.heroI=(state.heroI+d+pool.length)%pool.length;heroStart(true)}
function heroRender(first){const pool=heroPool();const t=pool[state.heroI];const copy=$('herocopy');if(!t||!copy)return;const a=document.querySelector('.hero-home .s.a'),b=document.querySelector('.hero-home .s.b');
 const front=a.classList.contains('on')?a:(b.classList.contains('on')?b:null);const back=front===a?b:a;
 if(first&&!front){a.src=t.backdrop;a.classList.add('on')}else{back.src=t.backdrop;back.onload=()=>{back.classList.add('on');if(front)front.classList.remove('on')}}
 const kick=(t.tags&&t.tags[0])||t.type;const ov=t.overview.length>260?t.overview.slice(0,260).replace(/\\s+\\S*$/,'')+'…':t.overview;
 copy.style.opacity=0;if(!first)blip(document.querySelector('.hero-home'));setTimeout(()=>{copy.innerHTML='<p class="tag">before AI slop, there was human creativity</p><small class="kicker">'+esc(kick)+(t.network?' · '+esc(t.network):'')+(t.year?' · '+t.year:'')+'</small><h1>'+esc(t.show)+'</h1><p class="ov">'+esc(ov)+'</p><div class="meta">'+[(t.genres||[]).slice(0,3).join(' · '),t.rating?'★ '+t.rating:'',t.eps+' episode'+(t.eps===1?'':'s')].filter(Boolean).join('  ·  ')+'</div><div class="acts"><button class="btn gold" onclick="watch(\\''+t.slug+'\\')"><i class="ico play"></i>Play</button><button class="btn ghost" onclick="go(\\''+t.slug+'\\')">About this show</button><button class="btn ghost" onclick="go(\\'tv\\')"><i class="ico tv"></i>Live TV</button></div>';copy.style.opacity=1;const c=$('herocount');if(c)c.textContent=(state.heroI+1)+' / '+pool.length},first?0:220)}
async function watch(slug){await go(slug);const s=state.show;if(s&&s.seasons){const r=resume(s);play(r.se,r.e)}}
function showView(autoplay){const s=state.show;if(!s.seasons){$('main').innerHTML='<div class="loading"><span class="signal"></span><span>Searching the Void for '+esc(s.show)+'…</span></div>';return}const se=s.seasons[state.se];const ep=se.episodes[state.e];
 let h='<div class="show"><button class="back" onclick="go(\\'\\')">← Browse</button>';
 if(!autoplay)h+='<div class="hero">'+(s.backdrop?'<img src="'+s.backdrop+'" alt="">':'')+'<div class="t"><b>'+esc(s.show)+'</b>'+(s.overview?'<p>'+esc(s.overview.slice(0,260))+(s.overview.length>260?'…':'')+'</p>':'')+'<div class="g">'+[s.network,s.year,s.genres.join(' · '),s.rating?'★ '+s.rating:'',s.eps+' episodes'].filter(Boolean).join('  ·  ')+'</div></div></div>';
 h+='<div class="player"><div><video id="v" controls '+(autoplay?'autoplay':'')+' src="'+ep.url+'"></video><div class="now"><div><b>S'+String(se.season).padStart(2,'0')+'E'+String(ep.n).padStart(2,'0')+'</b> · '+esc(ep.name)+(ep.state==='REVIEW'?' <span class="rv">review</span>':'')+'</div><button class="btn" onclick="next()">Next episode <i class="ico next"></i></button></div><p class="hint">Space / K play-pause · N next · F fullscreen · ← → skip 10s. "review" = the builder is not sure this file is this episode.</p><div class="acts mine" data-slug="'+s.slug+'">'+acts(s)+repBtn(s,se,ep)+'<button class="btn" id="share" title="Copy a link to this episode at the current time" onclick="shareMoment()"><i class="ico arrow-up"></i>Share this moment</button></div>'+epXray(s,se,ep)+'</div>';
 const si=state.seView==null?state.se:Math.min(state.seView,s.seasons.length-1);const x=s.seasons[si];
 h+='<div class="eps"><div class="sehead"><select onchange="state.seView=+this.value;render()">'+s.seasons.map((z,i)=>'<option value="'+i+'"'+(i===si?' selected':'')+'>Season '+z.season+' · '+z.episodes.length+' episode'+(z.episodes.length===1?'':'s')+'</option>').join('')+'</select><small>'+s.seasons.length+' season'+(s.seasons.length===1?'':'s')+'</small></div>'
 +x.episodes.map((y,ei)=>'<div class="ep '+(si===state.se&&ei===state.e?'on':'')+'" onclick="play('+si+','+ei+')"><span class="n">E'+y.n+'</span><span>'+esc(y.name)+'</span>'+(y.state==='REVIEW'?'<span class="rv">review</span>':'')+'<span class="m">'+y.min+'m</span></div>').join('')+'</div></div>';
 h+=xray(s)+'</div>';
 $('main').innerHTML=h;const v=$('v');v.onended=next;const hr=ME.history[s.slug];if(state.seekTo){const to=state.seekTo;state.seekTo=0;v.addEventListener('loadedmetadata',()=>{if(v.duration&&to<v.duration-5)v.currentTime=to},{once:true})}else if(hr&&hr.se===state.se&&hr.e===state.e&&hr.pos>20)v.addEventListener('loadedmetadata',()=>{if(v.duration&&hr.pos<v.duration-30)v.currentTime=hr.pos},{once:true});v.onplay=()=>{const r=ME.history[s.slug];if(!r||r.se!==state.se||r.e!==state.e)remember()};let lastSave=0;v.ontimeupdate=()=>{const t=Date.now();if(t-lastSave>5000){lastSave=t;const r=ME.history[s.slug];if(r&&r.se===state.se&&r.e===state.e){r.pos=Math.floor(v.currentTime);r.at=t;saveMe()}}};v.onerror=()=>{v.insertAdjacentHTML('afterend','<p style="color:#f66">This file would not play. Next episode in 3s…</p>');setTimeout(next,3000)}}
function face(p){const open=state.person===p.id;return '<div class="face'+(open?' on':'')+'" onclick="person('+p.id+')">'+(p.photo?'<img loading="lazy" src="'+p.photo+'" alt="">':'<div class="ph"></div>')+'<b>'+esc(p.name)+'</b><small>'+esc(p.as||'')+'</small></div>'}
function findPerson(s,id){const pool=[...(s.cast||[]),...(s.crew||[])];for(const c of Object.values(s.credits||{}))pool.push(...c.d,...c.w,...c.g);return pool.find(x=>x.id===id)||{name:'',photo:null}}
function bioFor(id){if(BIO[id]!==undefined)return BIO[id];BIO[id]=null;fetch(BASE+'data/people/'+id+'.json').then(r=>r.ok?r.json():null).then(b=>{BIO[id]=b||false;const el=document.querySelector('.person');if(el&&state.show&&state.person===id)el.outerHTML=personPanel(id,findPerson(state.show,id));if(state.view==='person'&&state.personId===id)render()}).catch(()=>{BIO[id]=false});return null}
function epXray(s,se,ep){const c=(s.credits||{})[se.season+'x'+ep.n];if(!c)return '';const chips=(arr)=>arr.map(p=>'<span onclick="person('+p.id+')">'+esc(p.name)+'</span>').join(', ');
 return '<div class="inep"><h3>IN THIS EPISODE</h3>'+((c.d.length||c.w.length)?'<div class="by">'+(c.d.length?'<div>Directed by '+chips(c.d)+'</div>':'')+(c.w.length?'<div>Written by '+chips(c.w)+'</div>':'')+'</div>':'')+(c.g.length?'<div class="faces">'+c.g.map(p=>face({id:p.id,name:p.name,photo:p.photo,as:p.as?'as '+p.as:'Guest'})).join('')+'</div>':'')+'</div>'}
function degSuggest(q){const el=$('degs');if(!el)return;q=q.trim().toLowerCase();if(q.length<2){el.innerHTML='';return}const m=SHOWS.filter(t=>t.slug!==state.show.slug&&t.show.toLowerCase().includes(q)).slice(0,8);el.innerHTML=m.map(t=>'<span class="chip" onclick="degPath(\\''+t.slug+'\\')">'+esc(t.show)+'</span>').join('')||'<span class="g">No show by that name here.</span>'}
async function degPath(target){if(!GRAPH_LOADED){const out=$('degp');if(out)out.innerHTML='<div class="path"><span class="signal" style="width:28px;height:28px"></span> Loading the connections…</div>';await ensureGraph();if(!GRAPH_LOADED){if(out)out.innerHTML='';return}}const from=state.show.slug;const prev={};prev[from]=null;const via={};const q=[from];let found=from===target;while(q.length&&!found){const a=q.shift();for(const [b,ids] of Object.entries(LINKS[a]||{})){if(prev[b]!==undefined)continue;prev[b]=a;via[b]=ids[0];if(b===target){found=true;break}q.push(b)}}
 const out=$('degp');if($('degs'))$('degs').innerHTML='';if($('degq'))$('degq').value='';if(!found){out.innerHTML='<div class="path">No path to '+esc(BY_SLUG[target].show)+' through the people here (yet).</div>';return}
 const chain=[];for(let c=target;c;c=prev[c])chain.unshift(c);let h='<div class="path">';chain.forEach((sl,i)=>{if(i){const id=via[sl];const p=PEOPLE[id];h+='<span class="v" onclick="person('+id+')">— '+esc(p?p.name:'?')+' —</span>'}h+='<span class="s" onclick="go(\\''+sl+'\\')">'+esc(BY_SLUG[sl].show)+'</span>'});h+='</div><div class="g" style="color:var(--dim);font-size:12px;margin-top:4px">'+(chain.length-1)+' hop'+(chain.length===2?'':'s')+' · every show on the path plays here</div>';out.innerHTML=h}
const TV_EPOCH=Date.UTC(2026,0,1)/1000;let TV_TOKEN=0;
async function ensureTV(){if(TV)return TV;const r=await fetch(BASE+'data/tv.json');TV=(await r.json()).channels;return TV}
function chanNow(c,at){if(!c.pre){let a=0;c.pre=c.items.map(it=>(a+=it[3]*60))}const T=c.pre[c.pre.length-1];const t=((((at||Date.now())/1000-TV_EPOCH)%T)+T)%T;let lo=0,hi=c.pre.length-1;while(lo<hi){const m=(lo+hi)>>1;if(c.pre[m]>t)hi=m;else lo=m+1}const start=lo?c.pre[lo-1]:0;return{i:lo,offset:t-start,remain:c.pre[lo]-t}}
const mmss=(sec)=>{sec=Math.max(0,Math.round(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60);return h?h+'h '+String(m).padStart(2,'0')+'m':m+' min'};
const kindName={all:'every show',row:'row',collection:'collection',network:'network'};
const code=(it)=>'S'+String(it[1]).padStart(2,'0')+'E'+String(it[2]).padStart(2,'0');
function tune(id){state.chan=id;state.tvOn=true;history.replaceState(null,'',urlFor('tv/'+id));render();window.scrollTo(0,0)}
function surf(dir){if(!TV)return;const list=TV.filter(c=>!c.adult||ME.adult);const i=list.findIndex(c=>c.id===state.chan);tune(list[(i+dir+list.length)%list.length].id)}
function osd(c,i,s,ep){const el=document.querySelector('.osd');if(!el)return;const it=c.items[i];const n=chanNow(c);const nx=SHOWS[c.items[(i+1)%c.items.length][0]];
 el.innerHTML='<b>'+esc(c.name)+'</b><span>'+esc(s.show)+' · '+code(it)+(ep?' · '+esc(ep.name):'')+'</span><span class="g">'+(n.i===i?mmss(n.remain)+' left · ':'')+'next: '+esc(nx?nx.show:'')+'</span><span class="acts"><button class="btn" onclick="surf(-1)"><i class="ico chevron-left"></i>Ch</button><button class="btn" onclick="surf(1)">Ch<i class="ico chevron-right"></i></button><button class="btn" onclick="go(\\''+s.slug+'\\')">Open show</button></span>'}
async function tvPlay(c,i,offset){const it=c.items[i];const s=SHOWS[it[0]];const v=$('v');if(!v||!s)return;const token=++TV_TOKEN;await ensure(s);if(token!==TV_TOKEN||state.view!=='tv')return;
 const se=(s.seasons||[]).find(x=>x.season===it[1]);const ep=se&&se.episodes.find(e=>e.n===it[2]);if(!ep){tvPlay(c,(i+1)%c.items.length,0);return}
 osd(c,i,s,ep);v.src=ep.url;v.onloadedmetadata=()=>{if(offset>5&&offset<v.duration-5)v.currentTime=offset};v.onended=()=>{const n=chanNow(c);tvPlay(c,n.i,n.offset)};v.onerror=()=>{tvPlay(c,(i+1)%c.items.length,0)};if(state.tvOn)v.play().catch(()=>{})}
async function tvPage(){const main=$('main');if(!TV){main.innerHTML='<div class="loading"><span class="signal"></span><span>Searching the Void for a signal…</span></div>';try{await ensureTV()}catch(_){main.innerHTML='<div class="loading">The channels did not load.</div>';return}if(state.view!=='tv')return}
 const chans=TV.filter(c=>!c.adult||ME.adult);const cur=chans.find(c=>c.id===state.chan)||chans[0];state.chan=cur.id;const now=chanNow(cur);const it=cur.items[now.i];const s=SHOWS[it[0]];
 let h='<div class="tv"><div class="pagehead"><img class="door" src="'+BASE+'assets/brand/ui/doors/live.png" alt=""><div><h1>Live TV</h1><div class="g">'+chans.length+' channels, always on, the same for everyone</div></div></div><div class="screen">'+(state.tvOn?'<video id="v" controls playsinline></video>':(innerWidth>700?'<video class="idle" autoplay muted loop playsinline poster="'+BASE+'assets/brand/set-static.jpg"><source src="'+BASE+'assets/brand/video/set.mp4" type="video/mp4"></video>':'<img class="idle" src="'+BASE+'assets/brand/set-poster.jpg" alt="">')+'<button class="on" onclick="state.tvOn=true;render()"><i class="ico play"></i>Turn on</button>')+'<div class="osd"></div></div>';
 h+='<p class="hint">Always on, same for everyone: the clock decides what is playing. ↑ ↓ to surf. Nothing here is recorded in Mine unless you open the show.</p>';
 h+='<div class="guide">'+chans.map(c=>{const n=chanNow(c);const ci=c.items[n.i];const cs=SHOWS[ci[0]];return '<div class="ch'+(c.id===cur.id?' on':'')+'" onclick="tune(\\''+c.id+'\\')"><span class="cn">'+esc(c.name)+'<small>'+c.shows+' show'+(c.shows===1?'':'s')+' · '+c.eps+' episodes · '+kindName[c.kind]+'</small></span><span class="np">'+esc(cs?cs.show:'')+' <small>'+code(ci)+' · '+mmss(n.remain)+' left</small></span></div>'}).join('')+'</div></div>';
 main.innerHTML=h;document.title=cur.name+' · '+SITE;osd(cur,now.i,s,null);if(state.tvOn)tvPlay(cur,now.i,now.offset)}
function aboutPage(){$('main').innerHTML='<div class="about"><button class="back" onclick="go(\\'\\')"><i class="ico back"></i> Browse</button>'
 +'<div class="pagehead" style="padding-left:0"><img class="door" src="'+BASE+'assets/brand/icon-192.png" alt=""><div><h1>About VOIDtv</h1><div class="g">before AI slop, there was human creativity</div></div></div>'
 +'<h2>What this is</h2><p>VOIDtv is a better way to find and watch the television that already lives on the <a href="https://archive.org" target="_blank" rel="noopener">Internet Archive</a>: shows from 1990 to now, the classics behind their own door, TV movies and specials, every episode in order, every one of them playable, with the people and connections that tie them together. We host nothing. Every video plays from archive.org; what we add is the catalog, the order, the player and the care.</p>'
 +'<h2>Who makes it</h2><p>VOIDtv is a project of <a href="https://cashvalues.org" target="_blank" rel="noopener">CASH, the Church of American Strength &amp; Hope</a>, a 501(c)(3). CASH works on ways for people to have good things that fit a busy life and a budget stretched to the max. VOIDtv is free and stays free: no paywall, no ads, no accounts required. If the work is worth something to you, <a href="'+DONATE+'" target="_blank" rel="noopener">give back and be part of it</a>. No set amount, never required.</p>'
 +'<h2>Rights</h2><p>The files belong to the Internet Archive and its uploaders. If you hold rights to something listed here, the Archive has a <a href="https://archive.org/about/terms.php" target="_blank" rel="noopener">takedown process</a> for the files themselves; tell us too, through <a href="https://cashvalues.org" target="_blank" rel="noopener">cashvalues.org</a>, and we will pull the listing.</p>'
 +'<h2>Credits</h2><p>Show and person data and artwork from <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a> and <a href="https://www.tvmaze.com" target="_blank" rel="noopener">TVmaze</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>'
 +'<h2>Yours stays yours</h2><p>Your list, likes and watch history live in your browser (see <span class="lnk" onclick="go(\\'me\\')">Mine</span>); nothing is sent anywhere. Late Night sits behind an 18+ door you open yourself.</p></div>';document.title='About · '+SITE}
function personPage(){const id=state.personId;const g=PEOPLE[id];const b=bioFor(id);const from=state.personFrom&&BY_SLUG[state.personFrom];const fp=from?findPerson(from,id):{name:'',photo:null};const name=(b&&b.name)||(g&&g.name)||fp.name||'…';const photo=(b&&b.photo)||(g&&g.photo)||fp.photo;const shows=g?Object.entries(g.shows).map(([sl,role])=>[BY_SLUG[sl],role]).filter(x=>x[0]):[];if(!shows.length&&from)shows.push([from,fp.as||'Credited']);
 const facts=b?[b.dept,b.born?'born '+b.born+(b.died?', died '+b.died:''):'',b.place].filter(Boolean).join(' · '):'';
 let h='<div class="ppage"><button class="back" onclick="history.length>1?history.back():go(\\'\\')"><i class="ico back"></i> Back</button><div class="head">'+(photo?'<img src="'+photo+'" alt="">':'')+'<div><b>'+esc(name)+'</b><div class="g">'+esc(facts)+(shows.length?(facts?' · ':'')+shows.length+' show'+(shows.length===1?'':'s')+' on VOIDtv':'')+'</div>'+(b&&b.bio?'<div class="bio">'+esc(b.bio)+'</div>':(b===null?'<div class="g">Loading…</div>':''))+'</div></div>';
 if(shows.length)h+='<h2>On VOIDtv</h2><div class="grid">'+shows.map(([t,role])=>'<div class="pcard">'+card(t,'person')+'<small class="role">'+esc(role)+'</small></div>').join('')+'</div>';
 else if(GRAPH_LOADED)h+='<p class="g">Only one show here so far; open it from the X-Ray panel.</p>';
 $('main').innerHTML=h+'</div>';document.title=name+' · '+SITE}
function personPanel(id,fallback){const g=PEOPLE[id];const b=bioFor(id);const name=(b&&b.name)||(g?g.name:fallback.name),photo=(g&&g.photo)||fallback.photo||(b&&b.photo);const others=g?Object.entries(g.shows).filter(([sl])=>sl!==state.show.slug&&BY_SLUG[sl]):[];
 const facts=b?[b.dept,b.born?'born '+b.born.slice(0,4)+(b.died?'–'+b.died.slice(0,4):''):'',b.place].filter(Boolean).join(' · '):'';
 return '<div class="person">'+(photo?'<img src="'+photo+'" alt="">':'<div></div>')+'<div><b>'+esc(name)+'</b><span class="more" onclick="state.personFrom=state.show.slug;go(\\'person/'+id+'\\')">Open page <i class="ico chevron-right sm"></i></span><div class="g">'+(facts?esc(facts)+' · ':'')+(others.length?'Also on VOIDtv in '+others.length+' other show'+(others.length===1?'':'s'):'No other VOIDtv shows yet')+'</div>'+(b&&b.bio?'<div class="bio">'+esc(b.bio.length>320?b.bio.slice(0,320).replace(/\\s+\\S*$/,'')+'…':b.bio)+'</div>':'')
 +(others.length?'<div class="links">'+others.map(([sl,role])=>{const t=BY_SLUG[sl];return '<div class="plink" onclick="go(\\''+sl+'\\')">'+(t.poster?'<img src="'+t.poster+'" alt="">':'')+'<span>'+esc(t.show)+'<small>'+esc(role)+'</small></span></div>'}).join('')+'</div>':'')+'</div></div>'}
function xray(s){const links=LINKS[s.slug]||{};const conn=Object.entries(links).map(([sl,ids])=>({t:BY_SLUG[sl],via:ids.map(i=>PEOPLE[i]&&PEOPLE[i].name).filter(Boolean)})).filter(c=>c.t).sort((a,b)=>b.via.length-a.via.length).slice(0,24);
 const cast=s.cast||[],crew=s.crew||[];if(!cast.length&&!crew.length&&!conn.length&&state.person==null)return '';
 let h='<div class="xray">';
 if(cast.length){h+='<h3>CAST</h3><div class="faces">'+cast.map(face).join('')+'</div>';}
 if(crew.length){h+='<h3>MADE BY</h3><div class="faces">'+crew.map(face).join('')+'</div>';}
 if(state.person!=null){h+=personPanel(state.person,findPerson(s,state.person));}
 if(conn.length){h+='<h3>CONNECTED SHOWS <small style="color:var(--dim);font-weight:400">· through the people above</small></h3><div class="conn">'+conn.map(c=>'<div class="card" onclick="go(\\''+c.t.slug+'\\')">'+(c.t.poster?'<div class="p"><img loading="lazy" src="'+c.t.poster+'" alt=""></div>':genPoster(c.t))+'<div class="t"><b>'+esc(c.t.show)+'</b><span class="via">via '+esc(c.via.slice(0,2).join(', '))+(c.via.length>2?' +'+(c.via.length-2):'')+'</span></div></div>').join('')+'</div>';}
 if(Object.keys(LINKS).length)h+='<h3>SIX DEGREES</h3><div class="deg"><input id="degq" placeholder="Connect '+esc(s.show).replace(/"/g,'')+' to… (type a show)" oninput="degSuggest(this.value)" autocomplete="off"><div class="sug" id="degs"></div><div id="degp"></div></div>';
 return h+'</div>'}
function person(id){state.person=state.person===id?null:id;const xr=document.querySelector('.xray');if(xr)xr.outerHTML=xray(state.show);else showView(false);const el=document.querySelector('.person');if(el)el.scrollIntoView({block:'nearest',behavior:'smooth'})}
function urlFor(slug){if(slug==='about')return ROUTES==='path'?'/about':'#about';if(slug==='tv'||(slug&&slug.startsWith('tv/')))return ROUTES==='path'?'/'+slug:'#'+slug;if(slug&&slug.startsWith('person/'))return ROUTES==='path'?'/'+slug:'#'+slug;if(slug==='me')return ROUTES==='path'?'/me':'#me';return ROUTES==='path'?(slug?'/show/'+slug:'/'):(slug?'#'+slug:'#')}
function slugFromUrl(){if(ROUTES==='path'){if(location.pathname==='/me'||location.pathname==='/me/')return 'me';if(location.pathname==='/about'||location.pathname==='/about/')return 'about';const pm=location.pathname.match(/^\\/person\\/(\\d+)/);if(pm)return 'person/'+pm[1];const tm=location.pathname.match(/^\\/tv(?:\\/([^/]+))?\\/?$/);if(tm)return tm[1]?'tv/'+tm[1]:'tv';const m=location.pathname.match(/^\\/show\\/([^/]+)/);if(m)return decodeURIComponent(m[1]);}return location.hash.length>1?location.hash.slice(1):''}
async function ensureGraph(){if(GRAPH_LOADED)return;GRAPH_LOADED=true;try{const g=await (await fetch(BASE+'data/graph.json')).json();Object.assign(PEOPLE,g.people);Object.assign(LINKS,g.links);}catch(_){GRAPH_LOADED=false}}
async function ensure(s){if(s.seasons)return s;const r=await fetch(BASE+'data/shows/'+s.slug+'.json');const d=await r.json();if(d.people)for(const [id,p] of Object.entries(d.people))if(!PEOPLE[id])PEOPLE[id]=p;if(d.links&&!LINKS[s.slug])LINKS[s.slug]=d.links;delete d.people;delete d.links;Object.assign(s,d);return s}
async function go(slug,replace){state.person=null;const qs0=new URLSearchParams(location.search);if(slug==='about'){state.show=null;state.view='about';history[replace?'replaceState':'pushState'](null,'',urlFor('about'));document.title='About · '+SITE;render();window.scrollTo(0,0);return}if(slug==='tv'||(slug&&slug.startsWith('tv/'))){state.show=null;state.view='tv';if(slug.length>3)state.chan=decodeURIComponent(slug.slice(3));history[replace?'replaceState':'pushState'](null,'',urlFor(slug));render();window.scrollTo(0,0);return}if(slug&&slug.startsWith('person/')){state.show=null;state.view='person';state.personId=+slug.slice(7);history[replace?'replaceState':'pushState'](null,'',urlFor(slug));render();window.scrollTo(0,0);if(!GRAPH_LOADED){await ensureGraph();render()}return}if(slug==='me'&&!BY_SLUG.me){state.show=null;state.view='me';history[replace?'replaceState':'pushState'](null,'',urlFor('me'));document.title='Mine · '+SITE;render();window.scrollTo(0,0);return}state.view='';if(!slug){state.show=null;history[replace?'replaceState':'pushState'](null,'',urlFor(''));document.title=SITE;render();if(!replace)blip();return}const s=BY_SLUG[slug];if(!s)return;if(gated(s)){adultGate(()=>go(slug,replace));return}state.show=s;history[replace?'replaceState':'pushState'](null,'',urlFor(slug));document.title=s.show+' · '+SITE;render();window.scrollTo(0,0);await ensure(s);if(state.show!==s)return;const r=resume(s);state.se=r.se;state.e=r.e;const qs=qs0;if(qs.get('s')&&qs.get('e')){const si=s.seasons.findIndex(x=>x.season===+qs.get('s'));const ei=si>=0?s.seasons[si].episodes.findIndex(x=>x.n===+qs.get('e')):-1;if(si>=0&&ei>=0){state.se=si;state.e=ei;state.seekTo=+qs.get('t')||0}history.replaceState(null,'',urlFor(slug))}state.seView=null;render();if(!replace)blip()}
function play(se,e){state.se=se;state.e=e;state.seView=se;remember();showView(true)}
function next(){const s=state.show;if(state.e+1<s.seasons[state.se].episodes.length)play(state.se,state.e+1);else if(state.se+1<s.seasons.length)play(state.se+1,0)}
function remember(){const s=state.show;const r=ME.history[s.slug];ME.history[s.slug]={se:state.se,e:state.e,at:Date.now(),pos:(r&&r.se===state.se&&r.e===state.e)?(r.pos||0):0};saveMe()}
function resume(s){const r=ME.history[s.slug];if(r&&s.seasons[r.se]&&s.seasons[r.se].episodes[r.e])return r;return{se:0,e:0}}
function bgReel(view){const v=document.querySelector('.bgvid');if(!v)return;const want=view==='home'&&innerWidth>700&&!matchMedia('(prefers-reduced-motion: reduce)').matches;if(want){if(!v.getAttribute('src')){v.src=BASE+'assets/brand/video/reel.mp4';v.load()}v.classList.add('on');v.play().catch(()=>{})}else{v.classList.remove('on');if(!v.paused)v.pause()}}
function render(){const any=state.type||state.genre||state.network||state.decade||state.tag||state.q;document.body.dataset.view=state.show?'show':state.view==='me'?'me':state.view==='person'?'person':state.view==='tv'?'tv':any?'grid':'home';bgReel(document.body.dataset.view);document.body.dataset.era=(state.show?state.show.type:state.type)==='Classic TV'?'classic':'';if(state.show)showView(false);else if(state.view==='me')keepTracks(mePage);else if(state.view==='person')keepTracks(personPage);else if(state.view==='tv')tvPage();else if(state.view==='about')keepTracks(aboutPage);else keepTracks(browse);setTimeout(field,0)}
document.addEventListener('keydown',(k)=>{if(k.target.tagName==='INPUT'||k.target.tagName==='SELECT')return;const v=$('v');if(k.key==='/'){k.preventDefault();$('q').focus();return}if(state.view==='tv'&&(k.key==='ArrowUp'||k.key==='ArrowDown')){k.preventDefault();surf(k.key==='ArrowUp'?-1:1);return}if(!v)return;if(k.key===' '||k.key==='k'){k.preventDefault();v.paused?v.play():v.pause()}if(k.key==='n')next();if(k.key==='f')v.requestFullscreen&&v.requestFullscreen();if(k.key==='ArrowRight')v.currentTime+=10;if(k.key==='ArrowLeft')v.currentTime-=10;if(k.key==='Escape')go('')});
window.addEventListener('popstate',()=>go(slugFromUrl(),true));
// Parallax depth: the far image drifts slowest and grows, the void turns and sinks, the dust nearest; content rides on top at full speed.
(function(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const bg=document.querySelector('.bgimg'),vd=document.querySelector('.void'),du=document.querySelector('.dust');let t=false;function frame(){t=false;const y=window.scrollY,h=Math.max(1,document.documentElement.scrollHeight-innerHeight),f=Math.min(1,y/h);const w=Math.sin(y/700),w2=Math.sin(y/430);if(bg)bg.style.transform='translate3d(0,'+(-f*60+w*22)+'px,0) scale('+(1.06+f*0.05+w2*0.015)+')';if(vd)vd.style.transform='translate3d('+(w2*60)+'px,'+(-f*120+w*90)+'px,0) rotate('+(y*0.06)+'deg) scale('+(1.05+w2*0.12)+')';const fd=document.querySelector('.field');if(fd)fd.style.transform='translate3d(0,'+(y*0.1)+'px,0)';if(du){du.style.setProperty('--dy',(-y*0.55)+'px');du.style.transform='translate3d('+(w*30)+'px,0,0) scale('+(1.02+0.05*w2)+')'}}let last=-1;(function loop(){const y=window.scrollY;if(y!==last){last=y;frame()}requestAnimationFrame(loop)})();window.addEventListener('resize',()=>{last=-1});window.__parallax=frame})();
document.addEventListener('visibilitychange',()=>{document.querySelectorAll('.grain,.void').forEach(e=>{e.style.animationPlayState=document.hidden?'paused':'running'});const v=document.querySelector('.bgvid');if(v&&v.classList.contains('on')){document.hidden?v.pause():v.play().catch(()=>{})}});
go(slugFromUrl(),true);
`;

function page({ data, mode = 'embed', routes = 'hash', base = '/', meta = {} }) {
  const { shows, people, links, types, bios = {}, channels = [], homeOrder = [] } = data;
  // Split mode keeps the browse index in one shared, cacheable file (data/index.js) so the hundreds
  // of per-show share pages stay tiny; embed mode inlines everything for the single-file preview.
  const inline = mode === 'embed'
    ? `const SHOWS=${JSON.stringify(shows)};const PEOPLE=${JSON.stringify(people)};const LINKS=${JSON.stringify(links)};const BIO=${JSON.stringify(bios)};let TV=${JSON.stringify(channels)};let GRAPH_LOADED=true;`
    : `const PEOPLE={};const LINKS={};const BIO={};let TV=null;let GRAPH_LOADED=false;`;
  const indexScript = mode === 'embed' ? '' : `<script src="${base}data/index.js"></script>`;
  const title = meta.title ? `${meta.title} · ${SITE_NAME}` : SITE_NAME;
  const desc = meta.description || 'TV shows from 1990 to now, and the classics behind one door: every episode in order, every one of them plays. From the Internet Archive.';
  const ogImg = meta.image || (meta.url ? new URL(meta.url).origin + '/assets/brand/og.jpg' : '');
  const og = [
    ['og:type', 'video.other'], ['og:site_name', SITE_NAME], ['og:title', meta.title || SITE_NAME], ['og:description', desc],
    ...(ogImg ? [['og:image', ogImg]] : []), ...(meta.url ? [['og:url', meta.url]] : []), ['twitter:card', ogImg ? 'summary_large_image' : 'summary'],
  ].map(([k, v]) => `<meta property="${k}" content="${String(v).replace(/"/g, '&quot;')}">`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://image.tmdb.org"><link rel="preconnect" href="https://archive.org"><link rel="dns-prefetch" href="https://archive.org">
<link rel="icon" href="${base}assets/brand/favicon.png"><link rel="apple-touch-icon" href="${base}assets/brand/apple-touch-icon.png"><meta name="theme-color" content="#07080c">
<meta name="description" content="${desc.replace(/"/g, '&quot;')}">
${og}
<style>${CSS}</style></head><body>
<header><div class="logo" onclick="go('')"><img class="mark" src="${base}assets/brand/icon-192.png" alt="" onerror="this.remove()"><span class="name">VOID<span>tv</span></span></div><input id="q" placeholder="Search shows…" oninput="state.q=this.value;render()"><a class="mine-link" onclick="go('tv')" title="Live channels, always on"><i class="ico tv"></i><span class="long"> TV</span></a><a class="mine-link" onclick="go('me')" title="My List, likes and watch history"><i class="ico bookmark"></i><span class="long"> Mine</span></a><a class="donate" href="${DONATE_URL}" target="_blank" rel="noopener" title="Donate to the Church of American Strength &amp; Hope"><i class="ico heart sm"></i> Donate<span class="long"> to CASH</span></a></header>
<div class="bgimg" aria-hidden="true"><video class="bgvid" muted loop playsinline preload="none"></video></div><div class="void" aria-hidden="true"><i></i></div><div class="dust" aria-hidden="true"></div><main id="main"></main><div class="grain" aria-hidden="true"></div>
<footer>${CREDIT}</footer>
${indexScript}
<script>
const SITE=${JSON.stringify(SITE_NAME)};const DONATE=${JSON.stringify(DONATE_URL)};const MODE=${JSON.stringify(mode)};const ROUTES=${JSON.stringify(routes)};const BASE=${JSON.stringify(base)};
const TYPES=${JSON.stringify(types)};
const HOME_ORDER=${JSON.stringify(homeOrder)};
${inline}
${JS}
</script></body></html>`;
}

module.exports = { assemble, page, indexEntry, showFile, SITE_NAME };
