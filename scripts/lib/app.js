// The VOIDtv page, shared by the local preview (everything inline in one file) and the deployable
// site (an app shell + small data files + real /show/<slug> addresses). assemble() builds the data
// from the catalog; page() renders the HTML shell for either mode.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PROFILE = require('./profile');
const { rankEpisode } = require('../../player/tools/rank-sources');
// Two helpers the browser code inlines as plain functions, so the page and the tests run the same code:
// the one JSON loader (SP-006) and the pure parts of saving and importing Mine (SP-012).
const { fetchJsonSource: FETCH_JSON_SRC } = require('./app-fetch');
const { meSource: ME_SRC } = require('./app-me');
// Builds what the browser gets per episode: the best copy (url/item/p/f/m) plus same-episode backups (alt),
// ranked by player/tools/rank-sources.js (lighter clean copies first; wrong-episode "alternates" dropped).
function epOut(e) {
  const r = rankEpisode(e);
  const first = r.find((x) => !x.needs) || r[0];
  const oldRisk = e.file.codecRisk ? e.file.codecRisk.replace(/^(video|audio|container) /, '').replace(/[()]/g, '') : undefined;
  const out = { n: e.number, name: e.name, state: e.state, url: first ? first.url : e.file.url, min: Math.round(((first && first.seconds) || e.file.seconds) / 60), item: first ? first.item : e.file.item,
    r: !first || first.url === e.file.url ? oldRisk : (first.risk || undefined) };
  if (first) {
    out.p = first.path; out.f = first.format; if (first.mbps) out.m = first.mbps; if (first.needs) out.nd = first.needs;
    const rest = r.filter((x) => x !== first);
    if (rest.length) out.alt = rest.map((x) => ({ i: x.item, p: x.path, f: x.format, m: x.mbps || undefined, n: x.needs || undefined }));
  }
  return out;
}
// Player files are versioned by the deploy so a new player and new data always arrive together.
const PLAYER_V = (process.env.CF_PAGES_COMMIT_SHA || String(Date.now())).slice(0, 9);
// Sentry (errors and playback failures): public browser key, VOIDtv only. Loaded lazily on voidtv.net, no replay, no personal data.
const SENTRY_KEY = PROFILE.name === 'voidtv' ? '0815c01e7f05676328efcf5dba6edc00' : '';
const SENTRY_REL = (process.env.CF_PAGES_COMMIT_SHA || 'local').slice(0, 9);
const SITE_NAME = PROFILE.siteName;
// The name as the copy spells it: always voidtv.net, lowercase (R-008). SITE_NAME is the profile's name (page titles, share cards,
// the web manifest); BRAND is for the sentences, so a later rename is one line here. Header: pink "voidtv", blue ".net".
const BRAND = 'voidtv.net';
const CONTACT = 'preacherb@cashvalues.org'; // privacy, takedown and corrections (the /privacy and /takedown pages)
const DONATE_URL = 'https://square.link/u/bJl9PGAC';
const CREDIT = `<a href="/about" onclick="go('about');return false">About ${BRAND}</a> · <a href="/privacy" onclick="go('privacy');return false">Privacy</a> · <a href="/takedown" onclick="go('takedown');return false">Takedown and corrections</a> · A project of the <a href="https://cashvalues.org" target="_blank" rel="noopener">Church of American Strength &amp; Hope</a>, a 501(c)(3) that works on ways for people to have good things that fit a busy life and a stretched budget. Free to use, no set amount, never required; <a href="${DONATE_URL}" target="_blank" rel="noopener">give back to CASH</a> if the work is worth supporting.<br>Shows stream from the Internet Archive. Artwork and metadata from TMDB; this product uses the TMDB API but is not endorsed or certified by TMDB.`;

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
  const idx = new Map(shows.map((s, i) => [s.slug, i])); // against the FULL list the page indexes; filtering first put every item after an adult show off by one
  shows = shows.filter((s) => !isAdultShow(s)); // every other channel stays clean; Late Night is its own door
  const series = shows.filter((s) => !s.slug.startsWith('movie-'));
  const movies = shows.filter((s) => s.slug.startsWith('movie-'));
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
  const LIST = readJson(PROFILE.listFile, { types: [], shows: [] });
  const ART = readJson(path.join(PROFILE.catalogDir, 'art.json'), {});
  const GRAPH = readJson(path.join(PROFILE.catalogDir, 'graph.json'), { people: {}, showLinks: {} });
  const SHOWS_DIR = path.join(PROFILE.catalogDir, 'shows');
  const PEOPLE_DIR = path.join(PROFILE.catalogDir, 'people');
  const BIO_DIR = path.join(PROFILE.catalogDir, 'people-bios');
  const MOV_DIR = path.join(PROFILE.catalogDir, 'movies');
  const TVM = readJson(path.join(PROFILE.catalogDir, 'tvmovies-list.json'), { items: [] });
  const OV = readJson(path.join(PROFILE.catalogDir, 'overrides.json'), {}); // B's edits layer (HQ writes it): hidden shows stay off the site
  const TVM_BY_ID = Object.fromEntries(TVM.items.map((m) => [m.tmdbId, m]));
  const byName = Object.fromEntries(LIST.shows.map((s) => [s.name, s]));

  const shows = (fs.existsSync(SHOWS_DIR) ? fs.readdirSync(SHOWS_DIR) : []).filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(SHOWS_DIR, f), null)).filter((s) => s && s.seasons && !(OV[s.slug] && OV[s.slug].hidden))
    .map((s) => {
      const a = ART[s.slug] || {};
      const entry = byName[s.show] || {};
      const p = readJson(path.join(PEOPLE_DIR, s.slug + '.json'), null);
      return {
        show: s.show, slug: s.slug, type: s.type, network: s.network, year: (s.tvmaze.premiered || a.year || '').slice(0, 4), runtime: s.tvmaze.runtime, tags: entry.tags || [],
        poster: a.poster || null, backdrop: a.backdrop || null, overview: a.overview || '', genres: a.genres || [], rating: a.rating || null, country: a.country || null, matchedAt: s.matchedAt, addedAt: s.addedAt,
        seasons: s.seasons.map((se) => ({ season: se.season, episodes: se.episodes.filter((e) => e.file && e.file.playable && !e.file.langRisk).map((e) => epOut(e)) })).filter((se) => se.episodes.length),
        vault: s.seasons.flatMap((se) => se.episodes.filter((e) => e.file && !e.file.playable && !e.file.langRisk).map((e) => ({ season: se.season, n: e.number, name: e.name, url: e.file.url, min: Math.round(e.file.seconds / 60), risk: (e.file.codecRisk || 'format').replace(/^(video|audio|container) /, '').replace(/[()]/g, '') }))),
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
  // HQ can rewrite the order into catalog/home-order.json; the list above is the fallback.
  const fileOrder = readJson(path.join(PROFILE.catalogDir, 'home-order.json'), null);
  const known = new Set([...types.map((t) => 'type:' + t), ...shows.flatMap((s) => (s.tags || []).map((t) => 'tag:' + t))]);
  const cleanOrder = Array.isArray(fileOrder) ? fileOrder.filter((e) => Array.isArray(e) && (e[0] === 'type' || e[0] === 'tag') && typeof e[1] === 'string' && known.has(e[0] + ':' + e[1])) : [];
  const homeOrder = cleanOrder.length ? cleanOrder : HOME_ORDER;
  return { shows, people, links, types, bios, channels, homeOrder };
}

// The index entry: everything the browse page needs; seasons and cast load per show in split mode.
const indexEntry = (s) => ({ show: s.show, slug: s.slug, type: s.type, people: (s.cast || []).slice(0, 8).map((c) => c.name).join(', ') || undefined, adult: (s.type === 'Late Night' || (s.tags || []).includes('Late Night') || s.adult) ? 1 : undefined, network: s.network, year: s.year, runtime: s.runtime, tags: s.tags, poster: s.poster, backdrop: s.backdrop, overview: s.overview && s.overview.length > 380 ? s.overview.slice(0, 380).replace(/\s+\S*$/, '') + '…' : s.overview, genres: s.genres, rating: s.rating, matchedAt: s.matchedAt && s.matchedAt.slice(0, 10), added: ((s.addedAt || s.matchedAt) || '').slice(0, 10) || undefined, eps: s.eps, seasonCount: s.seasons.length });
const showFile = (s, data) => {
  const links = (data && data.links && data.links[s.slug]) || {};
  const ids = new Set([...s.cast, ...s.crew].map((c) => c.id));
  for (const arr of Object.values(links)) for (const id of arr) ids.add(id);
  const people = {};
  if (data && data.people) for (const id of ids) if (data.people[id]) people[id] = data.people[id];
  return { slug: s.slug, seasons: s.seasons, vault: s.vault && s.vault.length ? s.vault : undefined, cast: s.cast, crew: s.crew, credits: s.credits || {}, links, people };
};

// ---- page --------------------------------------------------------------------------------
const CSS = `
:root{--bg:#07080c;--panel:#0f1118;--panel2:#161926;--line:#1d2130;--fg:#e8e8ee;--dim:#8a8fa3;--acc:#5fd4ff;--gold:#f2a93b;--rev:#f3c969;--brand-pink:#ff4fc8;--brand-blue:#5fe3ff}
@font-face{font-family:'Unbounded';font-style:normal;font-weight:200 900;font-display:swap;src:url(/assets/brand/fonts/unbounded-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:'Unbounded';font-style:normal;font-weight:200 900;font-display:swap;src:url(/assets/brand/fonts/unbounded-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
*{box-sizing:border-box}html,body{overflow-x:clip;max-width:100%}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,Segoe UI,Roboto,sans-serif}
a{color:inherit;text-decoration:none}button,select,input{font:inherit}
header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:16px;padding:10px 20px;background:rgba(7,8,12,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
header .logo{font-size:22px;font-weight:700;letter-spacing:.04em;cursor:pointer;display:flex;align-items:center}header .logo img.mark{width:34px;height:34px;display:block;margin-right:9px;border-radius:50%}header .logo .name{font-size:19px;font-family:Unbounded,system-ui,sans-serif;font-weight:700;letter-spacing:0;white-space:nowrap}header .logo .name .v{color:var(--brand-pink)}header .logo .name .n{color:var(--brand-blue)}
header input{flex:1 1 120px;min-width:0;width:0;max-width:420px;background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:8px 12px;border-radius:8px;outline:none}
header input:focus{border-color:var(--acc)}
header .donate{margin-left:auto;color:#07080c;background:var(--gold);font-size:14px;font-weight:600;border-radius:999px;padding:8px 16px;white-space:nowrap}header .donate:hover{filter:brightness(1.12)}
.support{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin:12px 20px 0;padding:12px 16px;border:1px solid var(--line);border-left:4px solid var(--acc);border-radius:10px;background:var(--panel);font-size:14px}
.support b{color:var(--acc)}.support .sp{flex:1;min-width:240px}.support .acts{display:flex;gap:8px;flex-wrap:wrap}.support a.btn{border:1px solid var(--acc);color:var(--acc);font-weight:600}.support a.btn:last-child{background:var(--gold);border-color:var(--gold);color:#07080c}
footer a{color:var(--acc)}
@media(max-width:760px){header .logo .name{font-size:15px}header .mine-link .long{display:none}}
@media(max-width:600px){header{gap:10px;column-gap:6px;row-gap:8px;padding:8px 12px;flex-wrap:wrap}header input{order:9;flex:1 0 100%;max-width:none;padding:7px 12px}header .logo{font-size:19px}header .logo img.mark{width:24px;height:24px;margin-right:6px}header .logo .name{font-size:14px}header .donate{padding:7px 11px;font-size:13px}header .donate .long{display:none}header .mine-link{padding:6px 8px;font-size:13px}header .mine-link .long{display:none}}
header .mine-link{cursor:pointer;color:var(--fg);font-size:14px;padding:7px 12px;border:1px solid var(--line);border-radius:999px;white-space:nowrap}header .mine-link:hover{border-color:var(--acc);color:var(--acc)}
.btn.on{border-color:var(--acc);color:var(--acc)}.mine{display:contents}.acts.mine-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.acts.mine{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.me{padding:0 20px 20px}.me h1{margin:10px 0 4px;font-size:26px}.me .g{color:var(--dim)}.me>.acts{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px}.me h2 small{color:var(--dim);font-weight:400;font-size:13px;margin-left:8px}
.inep{margin-top:6px}.inep .by{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--dim);margin-bottom:6px}.inep .by span{color:var(--fg);cursor:pointer;border-bottom:1px dotted var(--line)}.inep .by span:hover{color:var(--acc);border-color:var(--acc)}
.deg input{width:100%;max-width:420px;background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:8px 12px;border-radius:8px;outline:none}.deg input:focus{border-color:var(--acc)}.deg .sug{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.deg .g{color:var(--dim);font-size:13px}
.path{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px;font-size:14px}.path .s{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer}.path .s:hover{border-color:var(--acc)}.path .v{color:var(--acc);font-size:12px;cursor:pointer}.path .v:hover{text-decoration:underline}
.person .more{color:var(--acc);cursor:pointer;font-size:12px;margin-left:8px;font-weight:400}.person .bio{font-size:13px;line-height:1.45;margin-top:6px;color:var(--fg)}
.ppage{padding:0 20px 20px}.ppage .head{display:flex;gap:18px;align-items:flex-start;margin:6px 0 14px}.ppage .head img{width:120px;height:120px;border-radius:50%;object-fit:cover;flex:none}.ppage .head b{font-size:22px;font-family:Unbounded,system-ui,sans-serif;font-weight:700}.ppage .bio{max-width:760px;line-height:1.5;margin-top:8px}.ppage .g{color:var(--dim);font-size:13px}.pcard small.role{display:block;color:var(--acc);font-size:12px;padding:4px 2px 0}
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
.hero-home h1{font-family:Unbounded,system-ui,sans-serif;font-weight:800;font-size:clamp(24px,3.6vw,48px);line-height:1.08;margin:4px 0 10px;text-shadow:0 2px 14px rgba(0,0,0,.75)}.hero-home .ov{max-width:640px;font-size:15px;line-height:1.45;color:var(--fg);text-shadow:0 1px 8px rgba(0,0,0,.85);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin:0}.hero-home .meta{color:var(--dim);font-size:13px;margin-top:8px}
.hero-home .harrow{position:absolute;top:50%;margin-top:-22px;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(7,8,12,.55);color:#fff;font-size:26px;line-height:1;cursor:pointer;z-index:2}.hero-home .harrow:hover{border-color:var(--acc);color:var(--acc)}.hero-home .harrow.l{left:14px}.hero-home .harrow.r{right:14px}@media(hover:none){.hero-home .harrow{width:38px;height:38px;font-size:22px;opacity:.85}.hero-home .copy{left:16px;right:16px}}
.hero-home .hcount{position:absolute;right:18px;bottom:14px;color:var(--dim);font-size:12px}
.finder{margin:0 20px 6px;padding:4px 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.frow{display:flex;align-items:flex-start;gap:12px;padding:9px 0}.frow+.frow{border-top:1px solid var(--line)}.frow .lbl{flex:none;width:68px;color:var(--dim);font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding-top:7px}.frow .pills{display:flex;flex-wrap:wrap;gap:6px}.frow .chip small{color:var(--dim);margin-left:5px;font-size:11px}.frow .chip:hover{border-color:var(--acc);color:var(--acc)}
@media(max-width:600px){.show{padding:0 12px 24px}.finder{margin:0 12px 6px}.frow{flex-direction:column;gap:6px}.frow .lbl{width:auto;padding-top:0}}
.btn.gold{background:var(--gold);border-color:var(--gold);color:#07080c;font-weight:600}.btn.ghost{background:rgba(7,8,12,.5);backdrop-filter:blur(6px)}
@media(max-width:600px){.hero-home{height:66vh;min-height:420px}.hero-home h1{font-size:26px}.hero-home .ov{-webkit-line-clamp:3;font-size:14px}.hero-home .copy{left:16px;right:16px;bottom:16px}.hero-home .tag{font-size:15px}}
.card{transition:transform .18s ease,outline-color .18s ease}.card:hover{transform:translateY(-3px)}.card:focus-visible{outline-color:var(--acc)}
.card .p.gen{flex-direction:column;gap:6px;background:linear-gradient(160deg,hsl(var(--h) 42% 24%),#0b0d14 72%);color:var(--fg);padding:12px}.card .p.gen b{font-size:44px;line-height:1;font-weight:700;letter-spacing:-.02em;opacity:.95;text-shadow:0 2px 10px rgba(0,0,0,.5)}.card .p.gen span{font-size:12px;line-height:1.25;max-height:3.75em;overflow:hidden}.card .p.gen small{color:var(--dim);font-size:11px}
.support{border:1px solid rgba(242,169,59,.5);border-left:5px solid var(--gold);background:linear-gradient(90deg,rgba(242,169,59,.14),rgba(12,14,20,.75) 55%);font-size:15px;line-height:1.5;color:var(--fg);padding:14px 18px;margin-top:12px;box-shadow:0 0 24px rgba(242,169,59,.12)}.support b{color:var(--gold);font-size:17px}.support .cross{width:46px;height:auto;flex:none;filter:drop-shadow(0 0 8px rgba(242,169,59,.5))}.support .acts .btn{font-size:15px;padding:10px 16px}
.tv video.idle{width:100%;aspect-ratio:16/9;max-height:70vh;object-fit:cover;display:block;background:#000}
.ch.on .cn::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--gold);margin-right:8px;box-shadow:0 0 8px var(--gold)}
main{position:relative;z-index:1}
.atmos{position:fixed;inset:0;overflow:hidden;pointer-events:none}.atmos.lo{z-index:0}.atmos.hi{z-index:1000}.atmos>.bgimg,.atmos>.void,.atmos>.dust,.atmos>.grain{position:absolute}
html{overscroll-behavior-x:none}body{position:relative}
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
.grain{position:fixed;left:-50%;top:-50%;width:200%;height:200%;pointer-events:none;z-index:1000;opacity:.045;background:url(/assets/brand/noise.png) repeat;background-size:160px 160px;mix-blend-mode:screen;animation:grain .6s steps(6) infinite;will-change:transform}html:has(.vpx:not(.paused)) .grain,html:has(.vpx:not(.paused)) .fg{display:none}html:has(.vpx:not(.paused)) .column .neon,html:has(.vpx:not(.paused)) .field i{animation-play-state:paused}html:has(.vpx:not(.paused)) *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
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
.promo-home{margin:16px 20px 4px;text-align:center}.promo-home .ph,.promo-home video{position:relative;display:block;width:100%;margin:0 auto;padding:0;border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;background:#000;cursor:pointer}.promo-home .ph img{width:100%;height:100%;object-fit:cover;display:block}.promo-home .pp{position:absolute;left:50%;top:50%;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;background:rgba(7,8,12,.6);border:2px solid #fff;display:grid;place-items:center;font-size:28px;color:#fff;box-shadow:0 0 30px rgba(220,32,169,.6)}.promo-home .phmore{display:inline-block;margin-top:8px;color:var(--acc);cursor:pointer;font-size:14px}
.promos .promo{margin:22px 0 30px}.promos .pv{width:100%;margin:8px 0 10px;border-radius:12px;overflow:hidden;background:#000;border:1px solid rgba(255,255,255,.08)}.promos .pv video{width:100%;height:100%;display:block;object-fit:contain;background:#000}
.door{width:72px;height:72px;flex:none;filter:drop-shadow(0 0 10px rgba(95,212,255,.35))}.pagehead{display:flex;align-items:center;gap:16px;padding:14px 20px 4px}.pagehead h1{margin:0;font-size:26px}.pagehead .g{color:var(--dim);font-size:13px}
@media(prefers-reduced-motion:reduce){.signal{animation:none}}
#gate{position:fixed;inset:0;z-index:2000;background:rgba(7,8,12,.82);display:grid;place-items:center;backdrop-filter:blur(8px)}.gatebox{max-width:460px;margin:20px;background:var(--panel);border:1px solid var(--edge-gold);border-radius:16px;padding:26px 28px;text-align:center;box-shadow:0 0 40px rgba(242,169,59,.2)}.gatebox img{width:110px;height:110px}.gatebox b{display:block;font-size:24px;margin-top:8px}.gatebox p{color:var(--dim);font-size:14px;line-height:1.5;margin:10px 0 16px}.gatebox .acts{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.doorcard{display:flex;align-items:center;gap:18px;margin:22px 20px;padding:16px 20px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}.doorcard img{width:72px;height:72px;flex:none}.doorcard b{font-size:18px}.doorcard p{color:var(--dim);font-size:13px;margin:4px 0 0}.doorcard .btn{margin-left:auto}.leave{color:var(--dim);font-size:13px;margin:10px 20px}.leave span{color:var(--acc);cursor:pointer}
.rowmark{width:28px;height:28px;margin-right:8px;vertical-align:-7px}
.about{padding:0 20px 30px;max-width:820px}.about h2{margin:22px 0 6px;padding:0;font-size:17px}.about p{color:var(--fg);line-height:1.6;font-size:15px;margin:0}.about a,.about .lnk{color:var(--acc);cursor:pointer}.about ul,.about ol{margin:8px 0 0;padding-left:22px;line-height:1.6;font-size:15px}.about li{margin:6px 0}
body[data-era=classic] .bgimg{filter:sepia(.55) saturate(.55) brightness(.9)}body[data-era=classic] .card .p img,body[data-era=classic] .hero img{filter:sepia(.22) contrast(1.04)}body[data-era=classic] h2,body[data-era=classic] .hero .t b,body[data-era=classic] .bar .count{font-family:Georgia,'Times New Roman',serif}body[data-era=classic] .dd.set>button,body[data-era=classic] .chip.on{border-color:var(--edge-gold);color:#ffd27a}
.bgimg{inset:-12% 0 -12% 0;will-change:transform}.void{will-change:transform}.dust{position:fixed;left:-10%;top:-20%;width:120%;height:140%;pointer-events:none;z-index:0;background:url(/assets/brand/ui/icons/live.png) 0 0/0 0 no-repeat;opacity:0}
.dust{background:radial-gradient(circle at 12% 18%,rgba(95,212,255,.35) 0 1px,transparent 2px),radial-gradient(circle at 78% 32%,rgba(242,169,59,.3) 0 1px,transparent 2px),radial-gradient(circle at 40% 70%,rgba(95,212,255,.28) 0 1px,transparent 2px),radial-gradient(circle at 88% 82%,rgba(255,255,255,.22) 0 1px,transparent 2px),radial-gradient(circle at 22% 52%,rgba(63,207,90,.22) 0 1px,transparent 2px),radial-gradient(circle at 60% 10%,rgba(255,255,255,.18) 0 1px,transparent 2px),radial-gradient(circle at 70% 58%,rgba(95,212,255,.2) 0 1px,transparent 2px),radial-gradient(circle at 5% 90%,rgba(242,169,59,.2) 0 1px,transparent 2px);background-size:900px 700px,1100px 800px,700px 900px,1300px 1000px,800px 600px,1000px 1100px,1200px 900px,900px 1000px;background-position:0 var(--dy,0px);opacity:.9;will-change:transform,background-position}
@media(prefers-reduced-motion:reduce){.dust{display:none}}
.column{position:absolute;left:0;right:0;top:0;z-index:-1;pointer-events:none;overflow:hidden;will-change:transform}.column i{position:absolute;left:0;width:100%;display:block;background-size:cover;background-position:center}
.column .neon{opacity:.7;-webkit-mask:linear-gradient(180deg,transparent,#000 10%,#000 90%,transparent);mask:linear-gradient(180deg,transparent,#000 10%,#000 90%,transparent);transform-origin:center}
.column .stat{opacity:.4;mix-blend-mode:screen;-webkit-mask:linear-gradient(180deg,transparent,#000 28%,#000 72%,transparent);mask:linear-gradient(180deg,transparent,#000 28%,#000 72%,transparent)}
@media(min-width:701px) and (prefers-reduced-motion:no-preference){.column .neon:nth-child(-n+6){animation:colkb var(--kbd,70s) ease-in-out infinite alternate}}@keyframes colkb{from{transform:scale(1)}to{transform:scale(1.07)}}
main{overflow:clip}body[data-view=home] .bgimg,body[data-view=grid] .bgimg,body[data-view=me] .bgimg,body[data-view=about] .bgimg{background-image:none}
.field{position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:hidden}.field i{position:absolute;display:block;will-change:transform}
.field i{animation:kbf var(--kbd,50s) ease-in-out infinite alternate}@keyframes kbf{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(var(--kbx,0),var(--kby,0),0) scale(var(--kbs,1.12))}}
.fv{-webkit-mask:radial-gradient(circle,#000 12%,transparent 56%);mask:radial-gradient(circle,#000 12%,transparent 56%)}.fv::before{content:'';position:absolute;inset:0;background:url(/assets/brand/void-soft.webp) center/contain no-repeat;animation:spin var(--spin,200s) linear infinite var(--dir,normal)}
.fs{border-radius:50%;background-size:cover;background-position:center;-webkit-mask:radial-gradient(ellipse at center,#000 4%,transparent 52%);mask:radial-gradient(ellipse at center,#000 4%,transparent 52%);mix-blend-mode:screen}
.fg{border-radius:50%;mix-blend-mode:screen;filter:blur(60px)}
.fn{border-radius:45%;background-size:cover;background-position:center;-webkit-mask:radial-gradient(ellipse at center,#000 6%,transparent 54%);mask:radial-gradient(ellipse at center,#000 6%,transparent 54%)}
.fb{left:0;right:0;height:220px;opacity:.5;background:repeating-linear-gradient(180deg,rgba(255,255,255,0) 0 3px,rgba(95,212,255,.16) 3px 4px);-webkit-mask:radial-gradient(ellipse at center,#000 10%,transparent 60%);mask:radial-gradient(ellipse at center,#000 10%,transparent 60%)}
@media(prefers-reduced-motion:reduce){.field i,.fv::before{animation:none}}
@media(max-width:700px){.finder,.guide,.eps,.xray .person,.support,.me>.acts,.dd .panel,.btn.ghost{backdrop-filter:none}.fg{filter:none}.field i{animation:none}}
@media(max-width:700px){.grain{animation:none;left:0;top:0;width:100%;height:100%}.dust,.blip{display:none}.card .more{width:34px;height:34px;line-height:32px;font-size:15px}h2 .all{padding:8px 0 8px 10px}.track{scroll-snap-type:none;gap:10px}.track .card{flex-basis:138px}}
@media(hover:none){.card:hover{transform:none}.card::after{display:none}}
html{-webkit-tap-highlight-color:transparent}
.track:not(.filled){min-height:300px}.card.endcard .p{flex-direction:column;gap:4px;background:var(--glass);color:var(--acc)}.card.endcard b{font-size:30px}.card.endcard span{font-size:13px;color:var(--fg)}.moreline{text-align:center;padding:12px 20px 28px}
.support{padding:10px 16px;gap:8px 14px;font-size:15px}.support .sp{line-height:1.45}.support .l2{color:var(--fg)}.support .more{display:none;margin-top:8px;color:var(--dim);font-size:14px}.support.open .more{display:block}.support .more a{color:var(--acc);cursor:pointer}.support .acts .btn.sm{font-size:13px;padding:8px 12px}
.support a.btn.donate{background:linear-gradient(90deg,#ffd166,#ff8f2b);border-color:#ffb340;color:#07080c;font-weight:700;font-size:15px;padding:10px 18px;box-shadow:0 0 20px rgba(255,160,50,.45)}.support a.btn.donate:hover{filter:brightness(1.08)}
@media(max-width:600px){.support{margin:10px 12px 0;padding:10px 12px;font-size:14px}.support .cross{display:none}.support .sp{flex:1 1 100%}.support .sp b{display:block;font-size:16px}.support .acts{width:100%}.support a.btn.donate{flex:1;text-align:center}}
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
h2{margin:18px 20px 8px;font-size:17px;font-family:Unbounded,system-ui,sans-serif;font-weight:500;display:flex;align-items:baseline;gap:10px}h2 small{color:var(--dim);font-weight:400;font-size:13px;font-family:system-ui,Segoe UI,Roboto,sans-serif;letter-spacing:0}h2 .all{margin-left:auto;color:var(--acc);font-size:13px;font-weight:400;cursor:pointer}
.rowwrap{position:relative;padding:0 20px}
.track{display:flex;gap:12px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;touch-action:pan-x pan-y;padding:4px 2px 10px;scrollbar-width:none}.track::-webkit-scrollbar{display:none}
.track .card{flex:0 0 156px}
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
.hero .t{position:absolute;left:20px;bottom:16px;right:20px}.hero .t b{font-family:Unbounded,system-ui,sans-serif;font-weight:800;font-size:24px;line-height:1.1;display:block}.hero .t p{margin:6px 0 0;max-width:760px;font-size:14px}.hero .g{color:var(--dim);font-size:12px;margin-top:4px}
.player{display:grid;grid-template-columns:1fr 340px;grid-template-rows:auto 1fr;gap:16px;margin-top:14px}.player>*{min-width:0}video{max-width:100%}.player>.vcol{grid-column:1;grid-row:1}.player>.eps{grid-column:2;grid-row:1/3}.player>.inep{grid-column:1;grid-row:2;margin-top:0}
video:fullscreen,video:-webkit-full-screen{width:100%;height:100%;max-height:none;aspect-ratio:auto;object-fit:contain;border-radius:0;background:#000}
.now{flex-wrap:wrap}@media(hover:none){.hint{display:none}}
video{width:100%;max-height:70vh;background:#000;border-radius:8px;outline:none}
.now{display:flex;justify-content:space-between;align-items:center;margin:10px 0 0;gap:10px}.now b{font-size:17px}
.now .wf{flex:1 0 100%;display:flex;flex-wrap:wrap;align-items:center;gap:2px 14px;font-size:13px;color:var(--dim)}.now .wfhint{flex:1 0 100%;margin:0 0 2px}
.now .wfchip{display:inline-block;margin-left:4px;padding:0 5px;border:1px solid var(--rev);border-radius:4px;color:var(--rev);font-size:11px;line-height:1.6;vertical-align:1px;cursor:pointer;white-space:nowrap}.now .wfchip:hover,.now .wfchip:focus-visible{background:rgba(243,201,105,.14);outline:none}.now .wfchip:focus-visible{box-shadow:0 0 0 2px var(--acc)}
.now .wfbox{display:inline-flex;align-items:center;gap:8px;min-height:32px;color:var(--fg);cursor:pointer}.now .wfbox input{width:18px;height:18px;margin:0;accent-color:var(--acc);cursor:pointer}.now .wfthanks{color:var(--acc)}
@media(hover:none){.now .wfbox{min-height:44px}.now .wfchip{padding:2px 7px;font-size:12px}}
.btn{background:var(--panel);border:1px solid var(--line);color:var(--fg);padding:8px 14px;border-radius:8px;cursor:pointer;white-space:nowrap}
.eps{max-height:76vh;overflow:auto;background:var(--panel);border-radius:8px;padding:6px}
.eps h3{margin:10px 8px 4px;color:var(--dim);font-weight:600;letter-spacing:.06em;font-size:11px}
.sehead{display:flex;align-items:center;gap:10px;padding:4px 4px 8px}.sehead select{flex:1;background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:9px 12px;border-radius:8px;font:inherit;font-weight:600}.sehead small{color:var(--dim);white-space:nowrap}
.ep{display:flex;gap:8px;align-items:center;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:14px}.ep:hover,.ep.on{background:var(--panel2)}
.vp{position:relative;background:#000;border-radius:8px;overflow:hidden;outline:none;max-height:70vh;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center}.vp video{width:100%;height:100%;max-height:70vh;border-radius:0;display:block;background:#000;object-fit:contain}
.vp:fullscreen{max-height:none;aspect-ratio:auto;border-radius:0;width:100vw;height:100vh}.vp:fullscreen video{max-height:none;height:100%}
.vp-ui{position:absolute;left:0;right:0;bottom:0;padding:26px 12px 8px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.8));opacity:0;transition:opacity .2s;pointer-events:none}.vp.show .vp-ui,.vp.paused .vp-ui{opacity:1;pointer-events:auto}
.vp-row{display:flex;align-items:center;gap:2px;color:#fff;flex-wrap:nowrap}.vp-row button{background:none;border:0;color:#fff;font:inherit;font-size:13px;font-weight:600;padding:8px 9px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:3px;min-width:38px;justify-content:center;white-space:nowrap}.vp-row button:hover,.vp-row button:focus-visible{background:rgba(255,255,255,.14);outline:none}.vp-row button.on{color:var(--acc)}.vp-dlink{color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:8px 9px;border-radius:8px;display:inline-flex;align-items:center;gap:3px;white-space:nowrap}.vp-dlink:hover{background:rgba(255,255,255,.14)}.vp-row button.has{text-decoration:underline}.vp-time{font-size:13px;font-variant-numeric:tabular-nums;margin:0 8px;color:#ddd;white-space:nowrap}.vp-sp{flex:1}.vp-vol{width:84px;margin:0 6px 0 0;accent-color:var(--acc);cursor:pointer;height:18px}@media(max-width:600px){.vp-vol{display:none}}
.vp-seek{position:relative;height:18px;display:flex;align-items:center;margin-bottom:2px}.vp-seek::before{content:'';position:absolute;left:0;right:0;height:4px;background:rgba(255,255,255,.25);border-radius:2px}.vp-seek input{position:absolute;left:0;right:0;width:100%;margin:0;height:18px;opacity:0;cursor:pointer}.vp-seek .vp-buf,.vp-seek .vp-played{position:absolute;left:0;height:4px;border-radius:2px;pointer-events:none}.vp-buf{background:rgba(255,255,255,.35);width:0}.vp-played{background:var(--acc);width:0;box-shadow:0 0 8px rgba(95,212,255,.6)}
.vp-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}.vp-big{pointer-events:auto;width:72px;height:72px;border-radius:50%;border:0;background:rgba(7,8,12,.6);color:#fff;cursor:pointer;display:none;align-items:center;justify-content:center;backdrop-filter:blur(4px)}.vp.paused .vp-big{display:flex}.vp-big .ico{width:30px;height:30px;margin-left:4px}.vp.wait::after{content:'';position:absolute;top:50%;left:50%;width:44px;height:44px;margin:-22px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:var(--acc);animation:vpspin .9s linear infinite}@keyframes vpspin{to{transform:rotate(360deg)}}
.vp-msg,.vp-next{position:absolute;display:none;background:rgba(7,8,12,.92);border:1px solid var(--line);border-radius:10px;padding:14px 16px;color:var(--fg);font-size:14px;z-index:2}.vp-msg{left:50%;top:50%;transform:translate(-50%,-50%);max-width:min(440px,90%)}.vp-next{right:14px;bottom:62px;max-width:300px}.vp-msg.on,.vp-next.on{display:block}.vp-msg .row,.vp-next .row{margin:10px 0 0;gap:8px}.vp-msg p{margin:6px 0 0}
.vp video::cue{background:rgba(0,0,0,.65);color:#fff;font-size:1.05em;line-height:1.3}
@media(hover:none){.vp-row button{padding:10px 7px;min-height:40px}.vp-seek,.vp-seek input{height:34px}.chip{padding:7px 12px}}@media(max-width:600px){.vp-time{font-size:12px;margin:0 4px}.vp-row button{min-width:32px;padding:8px 5px;font-size:12px}.vp-row [data-a=pip],.vp-dlink{display:none}.vp-row [data-a=next]{font-size:0;gap:0;min-width:30px}.vp-row [data-a=next] .ico{width:16px;height:16px}.vp-row [data-a=back],.vp-row [data-a=fwd]{display:none}}.vp-flash{position:absolute;top:50%;transform:translateY(-50%);padding:10px 14px;border-radius:999px;background:rgba(7,8,12,.7);color:#fff;font-weight:600;pointer-events:none;animation:vpflash .7s ease-out forwards}.vp-flash.l{left:12%}.vp-flash.r{right:12%}@keyframes vpflash{from{opacity:1}to{opacity:0}}
@media(max-width:700px){.track .card{flex:0 0 138px}.card .more{width:34px;height:34px;line-height:32px;font-size:15px}.track{gap:10px}}@media(hover:none){header input,.deg input,.sehead select{font-size:16px}}
.ep.off{opacity:.62;text-decoration:none;color:inherit}.ep.off:hover{opacity:.9;background:var(--panel2)}.ep .rv.dl{color:var(--dim);border-color:var(--line)}.vaultnote{padding:8px;font-size:13px;color:var(--dim)}.vaultnote span{display:block;margin:4px 0}.vaultnote a{color:var(--acc)}
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
@media(max-width:860px){.player{grid-template-columns:1fr;grid-template-rows:none}.player>.vcol,.player>.eps,.player>.inep{grid-column:auto;grid-row:auto}.player>.inep{order:3;margin-top:4px}.eps{max-height:48vh}.hero .t b{font-size:19px}}
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
// A save writes what this tab CHANGED onto what is stored right now (see scripts/lib/app-me.js), so a tab that only
// plays a video cannot erase a like or a list entry saved in another tab. Nothing identifies a tab: ME_WROTE (memory only,
// gone with the page, never stored or exported) holds the time of the history record this tab last wrote for each show.
const ME_KEY='voidtv:me';
let ME_BASE=null,ME_RAW=null;
${ME_SRC}
const ME_WROTE={};
const ME=(()=>{let raw=null,m=null;try{raw=localStorage.getItem(ME_KEY);m=JSON.parse(raw||'null')}catch(_){}ME_RAW=raw;m=meClean(m);ME_BASE=meCopy(m);
 try{const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('voidtv:')&&!['voidtv:me','voidtv:sid','voidtv:vol'].includes(k))keys.push(k)}for(const k of keys){const sl=k.slice(7);try{if(!m.history[sl]){const r=JSON.parse(localStorage.getItem(k)||'null');if(r&&r.se!=null)m.history[sl]={se:r.se,e:r.e,at:0,pos:0}}}catch(e){}localStorage.removeItem(k)}}catch(_){}
 return m})();
function mePlaying(slug,se,e){const c=VP&&VP._cur;return !!(c&&c.slug===slug&&c.se===se&&c.e===e&&VP.v&&!VP.v.paused)}
function meSync(){let raw=null;try{raw=localStorage.getItem(ME_KEY)}catch(_){return false}
 const ops=meDiff(ME_BASE,ME);if(!ops.length&&raw===ME_RAW)return false;
 let st=null;try{st=JSON.parse(raw||'null')}catch(_){}
 const merged=meApply(meClean(st),ops,{wrote:ME_WROTE,now:Date.now(),playing:mePlaying});let out=raw;
 if(ops.length||(raw!=null&&st===null)){try{out=JSON.stringify(merged);localStorage.setItem(ME_KEY,out)}catch(_){return false}}
 const changed=meDiff(ME,merged).length>0;for(const k of Object.keys(ME))delete ME[k];Object.assign(ME,merged);ME_BASE=meCopy(merged);ME_RAW=out;return changed}
function saveMe(){meSync()}
function meChanged(){if(state.view==='me')render();else if(state.show)document.querySelectorAll('.mine[data-slug="'+state.show.slug+'"]').forEach(e=>{e.innerHTML=acts(state.show)})}
window.addEventListener('storage',(ev)=>{if(ev.key&&ev.key!==ME_KEY)return;if(meSync())meChanged()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&meSync())meChanged()});
meSync();
const hidden=(s)=>ME.likes[s.slug]===-1;
const isAdult=(s)=>!!(s&&(s.adult||s.type==='Late Night'||(s.tags||[]).includes('Late Night')));
const gated=(s)=>isAdult(s)&&!ME.adult;
function adultGate(then){const then0=then;then=()=>{state.heroPool=null;state.heroI=0;then0()};const old=$('gate');if(old)old.remove();const g=document.createElement('div');g.id='gate';g.innerHTML='<div class="gatebox"><img src="'+BASE+'assets/brand/ui/doors/latenight.png" alt=""><b>Late Night</b><p>The after-dark shelf: HBO and Showtime documentary series, Cinemax, the Playboy years. Adults only. By entering you confirm you are 18 or older.</p><div class="acts"><button class="btn gold" id="gate-yes">I am 18 or older, enter</button><button class="btn ghost" id="gate-no">Not now</button></div></div>';document.body.appendChild(g);
 $('gate-yes').onclick=()=>{ME.adult=Date.now();saveMe();g.remove();then&&then()};$('gate-no').onclick=()=>{if(!$('main').firstChild||(state.show&&gated(state.show))){state.show=null;go('',true)}g.remove();if(state.show&&gated(state.show))go('')};g.onclick=(e)=>{if(e.target===g)$('gate-no').click()}}
function leaveAdult(){state.heroPool=null;state.heroI=0;ME.adult=0;saveMe();state.type=state.type==='Late Night'?'':state.type;go('')}
const VIS=()=>SHOWS.filter(s=>!hidden(s)&&!gated(s));
const histShows=()=>Object.entries(ME.history).sort((a,b)=>(b[1].at||0)-(a[1].at||0)).map(([sl])=>BY_SLUG[sl]).filter(s=>s&&!gated(s));
const listShows=()=>Object.entries(ME.list).sort((a,b)=>b[1]-a[1]).map(([sl])=>BY_SLUG[sl]).filter(s=>s&&!gated(s));
const likedShows=()=>Object.keys(ME.likes).filter(k=>ME.likes[k]===1).map(k=>BY_SLUG[k]).filter(s=>s&&!gated(s));
function afterMe(slug){if(state.show){document.querySelectorAll('.mine[data-slug="'+slug+'"]').forEach(e=>{e.innerHTML=acts(BY_SLUG[slug])})}else render()}
if('${SENTRY_KEY}'){const h=location.hostname;if(h==='voidtv.net'||h.endsWith('.voidtv.net')){window.sentryOnLoad=function(){Sentry.init({environment:'production',release:'voidtv@${SENTRY_REL}',sendDefaultPii:false,normalizeDepth:6,maxValueLength:8000,ignoreErrors:['ResizeObserver loop','Non-Error promise rejection','The play() request was interrupted','NotAllowedError','AbortError'],denyUrls:['chrome-extension://','moz-extension://','safari-extension://','safari-web-extension://']})};const sc=document.createElement('script');sc.src='https://js.sentry-cdn.com/${SENTRY_KEY}.min.js';sc.crossOrigin='anonymous';document.head.appendChild(sc)}}
const SID=(()=>{try{const k='voidtv:sid',m=new Date().toISOString().slice(0,7);let v=JSON.parse(localStorage.getItem(k)||'null');if(!v||v.m!==m){v={m,id:Math.random().toString(36).slice(2,10)+Math.random().toString(36).slice(2,10)};localStorage.setItem(k,JSON.stringify(v))}return v.id}catch(e){return 'anon'}})();
const EV=[];let evT=null;
function dropX(v){try{const q=v.getVideoPlaybackQuality&&v.getVideoPlaybackQuality();if(q&&q.totalVideoFrames>0)return 'drop:'+Math.round(q.droppedVideoFrames*1000/q.totalVideoFrames)/10}catch(e){}return ''}function sentryNote(t,d){try{const S=window.Sentry;if(!S||!S.captureMessage)return;if(t==='warm'){if(S.forceLoad&&!sentryNote.w){sentryNote.w=1;S.forceLoad()}return}if(t==='error'&&String(d.x||'').indexOf('show-load:')===0){if(d.cause==='gate'){if(S.addBreadcrumb)S.addBreadcrumb({category:'voidtv.show-load',message:[d.slug,d.x].filter(Boolean).join(' ')});return}S.captureMessage('Show did not load: '+(d.slug||'?'),{level:'warning',tags:{show:d.slug||'',page:document.body.dataset.view||'',load_error:d.cause||'',status:String(d.x).split(':')[2]||''},extra:{x:d.x},fingerprint:['show-load',d.cause||'']});return}const tags={show:d.slug||'',episode:d.ep||'',page:document.body.dataset.view||''};if(t==='error'){const why={0:'playback',1:'aborted',2:'network',3:'decode',4:'format not supported',9:'no sound'}[d.n]||('code '+d.n);tags.media_error=why;tags.cause=d.cause||'';tags.reason=d.reason||'';S.captureMessage('Playback failed ('+why+'): '+(d.slug||'?'),{level:'warning',tags:tags,extra:{file:d.x||'',reason:d.reason||''},fingerprint:['playback',why,d.slug||'']})}else if(t==='report'){if(d.diag){tags.report='failure';tags.cause=d.cause||'';S.captureMessage('Viewer report: '+(d.slug||'?'),{level:'info',tags:tags,extra:Object.assign({file:d.x||''},d.diag),fingerprint:['report-failure',d.cause||'',d.slug||'',d.ep||'']})}else S.captureMessage('Viewer report: '+(d.slug||'?'),{level:'info',tags:tags,extra:{file:d.x||''},fingerprint:['report',d.slug||'',d.ep||'']})}else if(S.addBreadcrumb)S.addBreadcrumb({category:'voidtv.'+t,message:[d.slug,d.ep,d.x].filter(Boolean).join(' ')})}catch(e){}}
function track(t,d){sentryNote(t,d||{});const e=Object.assign({t,sid:SID,page:document.body.dataset.view||''},d||{});delete e.diag;delete e.cause;delete e.reason;if(document.referrer&&!EV.refd){EV.refd=1;try{const h=new URL(document.referrer).host;if(h&&h!==location.host)e.ref=h}catch(x){}}EV.push(e);if(EV.length>=20)flushEv();else if(!evT)evT=setTimeout(flushEv,15000)}
function flushEv(){clearTimeout(evT);evT=null;if(!EV.length)return;const body=JSON.stringify(EV.splice(0,25)),url=BASE+'api/e';let ok=false;try{ok=navigator.sendBeacon&&navigator.sendBeacon(url,new Blob([body],{type:'text/plain'}))}catch(e){}if(!ok)fetch(url,{method:'POST',body,keepalive:true}).catch(()=>{})}
document.addEventListener('visibilitychange',()=>{if(document.hidden)flushEv()});window.addEventListener('pagehide',flushEv);
function like(slug,v){ME.likes[slug]=ME.likes[slug]===v?0:v;saveMe();afterMe(slug);track('act',{slug,x:ME.likes[slug]>0?'like':ME.likes[slug]<0?'hide':'unlike'})}
function listToggle(slug){if(ME.list[slug])delete ME.list[slug];else ME.list[slug]=Date.now();saveMe();afterMe(slug);track('act',{slug,x:ME.list[slug]?'list':'unlist'})}
function acts(s){const l=ME.likes[s.slug]||0;return '<button class="btn'+(ME.list[s.slug]?' on':'')+'" onclick="event.stopPropagation();listToggle(\\''+s.slug+'\\')">'+(ME.list[s.slug]?'<i class="ico check"></i>In My List':'<i class="ico plus"></i>My List')+'</button><button class="btn'+(l===1?' on':'')+'" title="Like" onclick="event.stopPropagation();like(\\''+s.slug+'\\',1)"><i class="ico thumbs-up"></i>'+(l===1?'Liked':'Like')+'</button><button class="btn'+(l===-1?' on':'')+'" title="Not for me: hides it from the rows (search still finds it)" onclick="event.stopPropagation();like(\\''+s.slug+'\\',-1)"><i class="ico thumbs-down"></i>'+(l===-1?'Hidden':'Not for me')+'</button>'}
const repKey=(s,se,ep)=>s.slug+'/'+se.season+'/'+ep.n;
function repBtn(s,se,ep){const on=!!ME.reports[repKey(s,se,ep)];return '<button class="btn'+(on?' on':'')+'" id="rep" title="Tell the builder this file is the wrong episode or will not play" onclick="report()"><i class="ico flag"></i>'+(on?'Reported':'Wrong file?')+'</button>'}
function shareMoment(){const s=state.show,se=s.seasons[state.se],ep=se.episodes[state.e];const t=VP?Math.floor(VP.currentTime):0;const u=location.origin+urlFor(s.slug)+'?s='+se.season+'&e='+ep.n+(t>5?'&t='+t:'');const done=()=>{const b=$('share');if(b){b.innerHTML='<i class="ico check"></i>Link copied';setTimeout(()=>{if($('share'))$('share').innerHTML='<i class="ico arrow-up"></i>Share this moment'},2200)}};if(navigator.clipboard)navigator.clipboard.writeText(u).then(done,()=>prompt('Copy this link',u));else prompt('Copy this link',u)}
function report(){const s=state.show,se=s.seasons[state.se],ep=se.episodes[state.e],k=repKey(s,se,ep);if(ME.reports[k])delete ME.reports[k];else{ME.reports[k]={show:s.show,season:se.season,ep:ep.n,name:ep.name,item:ep.item,url:ep.url,at:Date.now()};track('report',{slug:s.slug,ep:se.season+'x'+ep.n,x:(ep.item||'')+' '+(ep.url||'').slice(-90)})}saveMe();const b=$('rep');if(b)b.outerHTML=repBtn(s,se,ep)}
// TV movies the builder could not confirm (state REVIEW, slug movie-<tmdb id>): a plain label on the now-playing row and one box to
// say it is not the right film. Ticking sends ONE report (q 'wrongfilm', x = Archive item, a space, file name) and is remembered per
// film in ME.wf (the saved blob, so every storage call is already guarded); a second tick sends nothing. It never hides a film
// and never touches playback. Series episodes and LIVE movies get none of this.
const WF_NOTE='We matched this film by its name on the Internet Archive and could not confirm it is the right one.';
function wfInfo(s,ep){const m=s&&ep&&ep.state==='REVIEW'?/^movie-([0-9]{1,9})$/.exec(s.slug||''):null;if(!m)return null;
 const it=String(ep.item||'').slice(0,199);let f=String(ep.url||'').split(/[?#]/)[0].split('/').pop()||'';try{f=decodeURIComponent(f)}catch(e){}
 return {id:m[1],x:it+' '+f.slice(0,199-it.length)}}
function wfMap(){return ME.wf&&typeof ME.wf==='object'&&!Array.isArray(ME.wf)?ME.wf:{}}
function wfDone(id){return meHas(wfMap(),id)}
function wfChip(){return ' <span class="rv wfchip" role="button" tabindex="0" aria-expanded="false" aria-controls="wf-hint" title="'+WF_NOTE+'" onclick="wfHint(this)" onkeydown="wfKey(event,this)">Unconfirmed match</span>'}
function wfRow(s,ep){const w=wfInfo(s,ep);if(!w)return '';const on=wfDone(w.id);
 return '<div class="wf"><p class="wfhint" id="wf-hint" hidden>'+WF_NOTE+'</p><label class="wfbox"><input type="checkbox" id="wf-box"'+(on?' checked':'')+' onchange="wrongFilm(this)"> Not the right film</label><span class="wfthanks" id="wf-thanks" role="status">'+(on?'Thanks, we will check it.':'')+'</span></div>'}
function wfHint(b){const h=$('wf-hint');if(!h)return;h.hidden=!h.hidden;b.setAttribute('aria-expanded',h.hidden?'false':'true')}
function wfKey(e,b){if(e.key==='Enter'||e.key===' '){e.preventDefault();wfHint(b)}}
function wrongFilm(el){const s=state.show,se=s&&s.seasons&&s.seasons[state.se],ep=se&&se.episodes[state.e],w=wfInfo(s,ep);if(!w)return;
 el.checked=true;try{meSync()}catch(e){}
 if(!wfDone(w.id)){ME.wf=Object.assign({},wfMap(),{[w.id]:Date.now()});try{saveMe()}catch(e){}track('report',{slug:s.slug,ep:se.season+'x'+ep.n,q:'wrongfilm',x:w.x})}
 const t=$('wf-thanks');if(t)t.textContent='Thanks, we will check it.'}
function exportMe(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(ME,null,1)],{type:'application/json'}));a.download='voidtv-mine.json';a.click()}
// An import is merged, never laid over: per entry the newest time wins, every entry is checked (numbers where numbers
// belong), and a reported file's key (show/season/episode, with slashes) has its own pattern. See meImportMerge.
function importMe(f){if(!f)return;f.text().then(t=>{if(t.length>2e6)throw 0;meImportMerge(ME,JSON.parse(t))}).then(()=>{saveMe();render()},()=>alert('That file is not a ${BRAND} export.'))}
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
 killPlayer();$('main').innerHTML=h+'</div>'}
function counts(key){const m={};for(const s of SHOWS){const v=(key==='genres'||key==='tags')?(s[key]||[]):[s[key]];for(const x of v)if(x)m[x]=(m[x]||0)+1}return Object.entries(m).sort((a,b)=>b[1]-a[1])}
function filtered(){const q=state.q.trim().toLowerCase();let r=SHOWS.filter(s=>!gated(s)&&(!state.type||s.type===state.type)&&(!state.genre||s.genres.includes(state.genre))&&(!state.network||s.network===state.network)&&(!state.decade||decade(s.year)===state.decade)&&(!state.tag||(s.tags||[]).includes(state.tag))&&(!q||s.show.toLowerCase().includes(q)||s.genres.join(' ').toLowerCase().includes(q)||(s.network||'').toLowerCase().includes(q)||(s.tags||[]).join(' ').toLowerCase().includes(q)||(s.people||'').toLowerCase().includes(q)));
 const by={eps:(a,b)=>b.eps-a.eps,rating:(a,b)=>(b.rating||0)-(a.rating||0)||b.eps-a.eps,year:(a,b)=>(+b.year||0)-(+a.year||0),old:(a,b)=>(+a.year||9999)-(+b.year||9999),az:(a,b)=>a.show.localeCompare(b.show),added:(a,b)=>(b.added||'').localeCompare(a.added||'')};return r.sort(by[state.sort]||by.eps)}
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
function shelf(title,list,key,total){const id='t-'+key.replace(/[^a-z0-9]+/gi,'-').toLowerCase();const openHere=state.open&&state.openCtx===key&&list.some(s=>s.slug===state.open);TRACKS[key]=list;const full=FILLED.has(key)||list.length<=8;
 return '<h2>'+(key==='type:Classic TV'?'<img class="rowmark" src="'+BASE+'assets/brand/ui/doors/classic.png" alt="">':key==='type:Late Night'?'<img class="rowmark" src="'+BASE+'assets/brand/ui/doors/latenight.png" alt="">':'')+esc(title)+'<small>'+(total||list.length)+' shows</small>'+(key.startsWith('type:')?'<span class="all" onclick="state.type=\\''+esc(title)+'\\';render();window.scrollTo(0,0)">See all ›</span>':key.startsWith('tag:')?'<span class="all" onclick="state.tag=\\''+esc(title)+'\\';render();window.scrollTo(0,0)">See all ›</span>':'')+'</h2>'
 +'<div class="rowwrap"><button class="arrow l" onclick="slide(\\''+id+'\\',-1)"><i class="ico chevron-left"></i></button><div class="track'+(full?' filled':'')+'" id="'+id+'" data-key="'+esc(key)+'">'+(full?cards(list,key):'')+'</div><button class="arrow r" onclick="slide(\\''+id+'\\',1)"><i class="ico chevron-right"></i></button></div>'
 +(openHere?detail(list.find(s=>s.slug===state.open)):'')}
const TRACKS={},FILLED=new Set(),SHELF_CAP=36;
function cards(list,key){const cap=key.indexOf(':')>0?SHELF_CAP:list.length;let h=list.slice(0,cap).map(s=>card(s,key)).join('');if(list.length>cap)h+='<div class="card endcard" tabindex="0" onclick="seeAll(\\''+esc(key)+'\\')"><div class="p"><b>+'+(list.length-cap)+'</b><span>See all '+list.length+'</span></div></div>';return h}
function seeAll(key){const i=key.indexOf(':');const k=key.slice(0,i),v=key.slice(i+1);if(k==='type')state.type=v;else if(k==='tag')state.tag=v;else return;render();window.scrollTo(0,0)}
function fillTrack(t){const key=t.dataset.key,list=TRACKS[key];if(!list)return;t.innerHTML=cards(list,key);t.classList.add('filled');FILLED.add(key)}
const trackIO=window.IntersectionObserver?new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){trackIO.unobserve(e.target);fillTrack(e.target)}},{rootMargin:'600px 0px'}):null;
function fillNear(){const vh=innerHeight;document.querySelectorAll('.track:not(.filled)').forEach(t=>{const r=t.getBoundingClientRect();if(r.top<vh+600&&r.bottom>-600)fillTrack(t)})}
function watchTracks(){document.querySelectorAll('.track:not(.filled)').forEach(t=>trackIO?trackIO.observe(t):fillTrack(t));fillNear()}
window.addEventListener('scroll',()=>{if(state.fillT)return;state.fillT=setTimeout(()=>{state.fillT=null;fillNear()},120)},{passive:true});
function slide(id,dir){const t=$(id);if(!t)return;const step=168;t.scrollBy({left:dir*Math.max(step,Math.floor((t.clientWidth-120)/step)*step),behavior:'smooth'})}
// Re-rendering replaces the whole page, so remember where each shelf was scrolled and put it back (no animation).
function blip(host){const h=host||$('main');if(!h||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const b=document.createElement('div');b.className='blip';h.appendChild(b);setTimeout(()=>b.remove(),200)}
function column(){const main=$('main');if(!main)return;const old=main.querySelector('.column');if(old)old.remove();const v=document.body.dataset.view;if(v==='show'||v==='tv')return;const H=main.scrollHeight;if(H<1200)return;const W=main.clientWidth||innerWidth;const phone=innerWidth<=700;const T=Math.round(W*(phone?1.25:0.558));if(!(T>=50)){column.tries=(column.tries||0)+1;if(column.tries<=20)setTimeout(field,500);return}column.tries=0;
 const neon=['wall','sign-pink','watcher-purple','sign-orange','watcher-orange'],stat=['static-glitch','static-bolt','static-dark'],sfx=phone?'-m':'';
 const c=document.createElement('div');c.className='column';c.style.height=H+'px';let h='';const n=Math.min(Math.ceil(H/T)+1,400);
 for(let i=0;i<n;i++)h+='<i class="neon" style="top:'+(i*T)+'px;height:'+T+'px;background-image:url('+BASE+'assets/brand/bg/col/'+neon[i%neon.length]+sfx+'.jpg);--kbd:'+(64+(i%4)*11)+'s;animation-delay:-'+((i*19)%64)+'s"></i>';
 for(let i=0;i<n;i++)h+='<i class="stat" style="top:'+Math.round((i+1)*T-T/2)+'px;height:'+T+'px;background-image:url('+BASE+'assets/brand/bg/col/'+stat[i%stat.length]+sfx+'.jpg)"></i>';
 c.innerHTML=h;main.appendChild(c)}
const field=column;
function keepTracks(fn){const pos={};document.querySelectorAll('.track').forEach(t=>{pos[t.id]=t.scrollLeft});const y=window.scrollY;fn();document.querySelectorAll('.track').forEach(t=>{if(pos[t.id]){t.style.scrollBehavior='auto';t.scrollLeft=pos[t.id];t.style.scrollBehavior=''}});window.scrollTo(0,y)}
function browse(){let list=filtered();if(!state.q)list=list.filter(s=>!hidden(s));const any=state.type||state.genre||state.network||state.decade||state.tag||state.q;
 const bar=filterBar(list);
 let h='';
 if(any){
  if(state.q&&state.q.length>=3&&state.q!==state.lastQ){clearTimeout(state.qT);const q=state.q,n=list.length;state.qT=setTimeout(()=>{state.lastQ=q;track('search',{q,n})},1200)}
  h=bar+'<div class="chips">'+[['type',state.type],['tag',state.tag],['genre',state.genre],['network',state.network],['decade',state.decade]].filter(x=>x[1]).map(([k,v])=>'<span class="chip on" onclick="state.'+k+'=\\'\\';render()">'+esc(v)+' ✕</span>').join('')+(state.q?'<span class="chip on" onclick="state.q=\\'\\';$(\\'q\\').value=\\'\\';render()">“'+esc(state.q)+'” ✕</span>':'')+'</div>';
  const sig=[state.type,state.tag,state.genre,state.network,state.decade,state.q,state.sort].join('|');if(sig!==state.gridSig){state.gridSig=sig;state.gridN=0}const N=state.gridN||60;
  h+='<div class="grid">'+list.slice(0,N).map(s=>card(s,'grid')).join('')+'</div>'+(list.length>N?'<p class="moreline"><button class="btn" onclick="state.gridN='+(N+60)+';render()">Show '+Math.min(60,list.length-N)+' more of '+list.length+'</button></p>':'');
 } else {
  // 1. the featured wall: one show at a time, varied and endless, with its description and a way in
  h+='<section class="hero-home"><div class="bg slides"><img class="s a" alt=""><img class="s b" alt=""></div><div class="shade"></div><button class="harrow l" onclick="heroStep(-1)" aria-label="previous"><i class="ico chevron-left"></i></button><button class="harrow r" onclick="heroStep(1)" aria-label="next"><i class="ico chevron-right"></i></button><div class="copy" id="herocopy"></div><span class="hcount" id="herocount"></span></section>';
  h+='<div class="support'+(state.supportOpen?' open':'')+'"><img class="cross" src="'+BASE+'assets/brand/cash-cross.png" alt=""><div class="sp"><b>${BRAND} is free and stays free.</b> <span class="l2">Donations fund the real-world work of CASH.</span><div class="more">The shows belong to the Internet Archive; what we add is a better way to find and watch them. That is CASH\\'s work: finding ways for people to have good things that fit a busy life and a budget stretched to the max. No set amount, never required. If that is work worth supporting, give back and be part of it. <a onclick="go(\\'cash\\')">Our work in the community →</a> · <a href="https://cashvalues.org" target="_blank" rel="noopener">cashvalues.org ↗</a></div></div><span class="acts"><a class="btn donate" href="'+DONATE+'" target="_blank" rel="noopener">♥ Donate to CASH</a><button class="btn ghost sm" onclick="state.supportOpen=!state.supportOpen;render()">'+(state.supportOpen?'Less':'More')+'</button></span></div>';
  h+='<div id="promohome"></div>';
  // 2. yours
  const cont=histShows().slice(0,30);if(cont.length)h+=shelf('Continue watching',cont,'continue');
  const mine=listShows();if(mine.length)h+=shelf('My List',mine,'list');
  // 3. genres and filters
  h+='<h2>Find something<small>pick a genre, a network, a row or a collection</small></h2>'+bar;
  // 4. the rows, in all their splendor
  const recent=VIS().filter(s=>s.poster).sort((a,b)=>(b.added||'').localeCompare(a.added||'')).slice(0,30);
  h+=shelf('Recently added',recent,'recent');
  const top=VIS().filter(s=>s.rating&&s.poster).sort((a,b)=>b.rating-a.rating||b.eps-a.eps).slice(0,30);
  h+=shelf('Top rated',top,'top');
  const done=new Set();const put=(kind,name)=>{const key=kind+':'+name;if(done.has(key))return;done.add(key);const rows=list.filter(s=>kind==='tag'?(s.tags||[]).includes(name):s.type===name);const art=rows.filter(s=>s.poster);if(art.length)h+=shelf(name,art,key,rows.length)};
  for(const [kind,name] of HOME_ORDER)put(kind,name);
  for(const [tag] of counts('tags'))put('tag',tag);
  for(const t of TYPES)put('type',t);
  if(!ME.adult&&SHOWS.some(isAdult))h+='<section class="doorcard"><img src="'+BASE+'assets/brand/ui/doors/latenight.png" alt=""><div><b>Late Night</b><p>The after-dark shelf. Adults only, behind its own door.</p></div><button class="btn gold" onclick="adultGate(()=>{state.type=\\'Late Night\\';render();window.scrollTo(0,0)})">Enter 18+</button></section>';
  else if(ME.adult)h+='<p class="leave">Late Night is open on this browser. <span onclick="leaveAdult()">Close the door</span></p>';
 }
 const oldHero=(!any&&state.heroTimer)?document.querySelector('.hero-home'):null;killPlayer();$('main').innerHTML=h;if(!any){const nh=document.querySelector('.hero-home');if(oldHero&&nh)nh.replaceWith(oldHero);else heroStart()}}
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
function filterBar(list){const series=SHOWS.filter(t=>!t.slug.startsWith('movie-')&&!hidden(t)&&!gated(t));const pop=VIS();const tally=(key,src)=>{const m={};for(const t of src){const v=key==='genres'||key==='tags'?(t[key]||[]):[t[key]];for(const x of v)if(x)m[x]=(m[x]||0)+1}return Object.entries(m).sort((a,b)=>b[1]-a[1])};
 const rows=TYPES.map(t=>[t,SHOWS.filter(s=>s.type===t&&!hidden(s)&&!gated(s)).length]).filter(x=>x[1]);
 const genres=tally('genres',pop).filter(([g])=>!SKIP_GENRES.has(g));
 const nets=tally('network',pop).filter(([,c])=>c>=2).slice(0,40);
 const decs=[['1950s'],['1960s'],['1970s'],['1980s'],['1990s'],['2000s'],['2010s'],['2020s']].map(([d])=>[d,series.filter(t=>decade(t.year)===d).length]).filter(x=>x[1]);
 const any=state.type||state.genre||state.network||state.decade||state.tag||state.q;
 return '<div class="bar">'+dd('type','All rows',rows,state.type)+dd('tag','All collections',tally('tags',pop),state.tag)+dd('genre','All genres',genres,state.genre)+dd('network','All networks',nets,state.network)+dd('decade','All decades',decs,state.decade)+dd('sort','Sort',SORTS.map(([v,n])=>[v,null,n]),state.sort,true)
 +(any?'<button type="button" class="clear" onclick="state.type=state.genre=state.network=state.decade=state.tag=\\'\\';state.q=\\'\\';if($(\\'q\\'))$(\\'q\\').value=\\'\\';render()"><i class="ico close sm"></i>Clear</button>':'')+'<span class="count">'+list.length+' shows · '+list.reduce((n,s)=>n+s.eps,0)+' episodes</span></div>'}
function finder(){const series=VIS().filter(t=>!t.slug.startsWith('movie-'));const tally=(key)=>{const m={};for(const t of series){const v=key==='genres'?(t.genres||[]):[t[key]];for(const x of v)if(x)m[x]=(m[x]||0)+1}return Object.entries(m).sort((a,b)=>b[1]-a[1])};
 const pills=(key,list)=>'<span class="pills">'+list.map(([v,c])=>'<span class="chip'+(state[key]===v?' on':'')+'" onclick="state.'+key+'=\\''+esc(v)+'\\';render();window.scrollTo(0,0)">'+esc(v)+(c?'<small>'+c+'</small>':'')+'</span>').join('')+'</span>';
 const genres=tally('genres').filter(([g])=>!SKIP_GENRES.has(g)).slice(0,14);const nets=tally('network').filter(([,c])=>c>=4).slice(0,16);const decs=[['1950s'],['1960s'],['1970s'],['1980s'],['1990s'],['2000s'],['2010s'],['2020s']].map(([d])=>[d,series.filter(t=>decade(t.year)===d).length]).filter(x=>x[1]);
 return '<div class="finder"><div class="frow"><span class="lbl">Genre</span>'+pills('genre',genres)+'</div><div class="frow"><span class="lbl">Network</span>'+pills('network',nets)+'</div><div class="frow"><span class="lbl">Decade</span>'+pills('decade',decs)+'</div></div>'}
function heroPool(){if(state.heroPool)return state.heroPool;const ok=SHOWS.filter(t=>t.backdrop&&t.overview&&!t.slug.startsWith('movie-')&&!hidden(t)&&!gated(t)&&t.eps>=6&&t.type!=='Classic TV'&&!(parseInt(t.year,10)<1980));
 // no oldies in the showcase (Bryan, 19 Oct 2026): the Classic TV row and shows that started before 1980 stay out of all three decks; they keep their own rows
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
function heroStart(manual){if(state.heroTimer){clearInterval(state.heroTimer);state.heroTimer=null}const pool=heroPool();if(!pool.length)return;heroRender(!manual);if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;state.heroTimer=setInterval(()=>{if(!document.getElementById('herocopy')){clearInterval(state.heroTimer);state.heroTimer=null;return}state.heroI=(state.heroI+1)%pool.length;heroRender(false)},9000)}
function heroStep(d){const pool=heroPool();if(!pool.length)return;state.heroI=(state.heroI+d+pool.length)%pool.length;heroStart(true)}
function heroRender(first){const pool=heroPool();const t=pool[state.heroI];const hb=x=>innerWidth<=700?x.backdrop.replace('/w1280/','/w780/'):x.backdrop;const copy=$('herocopy');if(!t||!copy)return;const a=document.querySelector('.hero-home .s.a'),b=document.querySelector('.hero-home .s.b');
 const front=a.classList.contains('on')?a:(b.classList.contains('on')?b:null);const back=front===a?b:a;
 if(first&&!front){a.src=hb(t);a.classList.add('on')}else{back.src=hb(t);back.onload=()=>{back.classList.add('on');if(front)front.classList.remove('on')}}
 const kick=(t.tags&&t.tags[0])||t.type;const ov=t.overview.length>260?t.overview.slice(0,260).replace(/\\s+\\S*$/,'')+'…':t.overview;
 copy.style.opacity=0;if(!first)blip(document.querySelector('.hero-home'));setTimeout(()=>{copy.innerHTML='<p class="tag">${PROFILE.tagline}</p><small class="kicker">'+esc(kick)+(t.network?' · '+esc(t.network):'')+(t.year?' · '+t.year:'')+'</small><h1>'+esc(t.show)+'</h1><p class="ov">'+esc(ov)+'</p><div class="meta">'+[(t.genres||[]).slice(0,3).join(' · '),t.rating?'★ '+t.rating:'',t.eps+' episode'+(t.eps===1?'':'s')].filter(Boolean).join('  ·  ')+'</div><div class="acts"><button class="btn gold" onclick="watch(\\''+t.slug+'\\')"><i class="ico play"></i>Play</button><button class="btn ghost" onclick="go(\\''+t.slug+'\\')">About this show</button><button class="btn ghost" onclick="go(\\'tv\\')"><i class="ico tv"></i>Live TV</button></div>';copy.style.opacity=1;const c=$('herocount');if(c)c.textContent=(state.heroI+1)+' / '+pool.length},first?0:220)}
async function watch(slug){await go(slug);const s=state.show;if(s&&s.slug===slug&&s.seasons){const r=resume(s);play(r.se,r.e)}}
let VP=null,TVCUR=null;
// Bumping the load token first makes a load() that is still waiting for the Archive lookup give up when it wakes, so a viewer
// who presses Play and leaves the page cannot leave a detached video that starts by itself (destroy() alone does not stop it).
function killPlayer(){if(VP){const p=VP;VP=null;p._token=(p._token||0)+1;try{p.destroy()}catch(e){}}}
function filesFor(ep){const out=[];const add=(item,p,url,f,m,nd)=>{if(!url&&item&&p)url='https://archive.org/download/'+item+'/'+p;if(!url)return;if(!item||!p){const t=url.split('/download/')[1]||'';const k=t.indexOf('/');if(k>0){item=item||t.slice(0,k);p=p||t.slice(k+1)}}out.push({url:url,item:item,path:p,format:f||'',mbps:m||null,needs:nd||(url.toLowerCase().endsWith('.mkv')?'mkv':'')})};add(ep.item,ep.p,ep.url,ep.f,ep.m,ep.nd);(ep.alt||[]).forEach(a=>add(a.i,a.p,'',a.f,a.m,a.n));return out}
function vpEvent(e,p){const c=(e.type==='summary'&&e.ctx)||(p&&p._ctx)||{};const base={slug:c.slug,ep:c.ep};if(e.type==='started'){sentryNote('warm',{});vpMetric('started',e,base)}if(e.type==='stall'||e.type==='freeze'||e.type==='drift'||e.type==='action'||e.type==='switch'||e.type==='recovered'||e.type==='silent'||e.type==='silent-final')track('act',Object.assign({x:'pq:'+e.type+(e.step?':'+e.step:'')+(e.kind?':'+e.kind:'')+(e.to?'>'+e.to:'')},base,e.type==='stall'?{pos:Math.round((e.ahead||0)*10)/10}:null));if(e.type==='load'&&p)p._pqn=null;const pq=e.type==='avlag'?{n:Math.round(Math.abs(e.gap||0)*1000)}:e.type==='hitch'?{n:Math.round(e.ms||0)}:e.type==='lowfps'?{n:Math.round((e.presentedFps||0)*10),pos:Math.round((e.sourceFps||0)*10)}:e.type==='decodelag'?{n:Math.round((e.droppedShare||0)*1000),pos:Math.round((e.decodedFps||0)*10),dur:Math.round((e.sourceFps||0)*10)}:e.type==='user-avsync'?{pos:Math.round(e.position||0),n:Math.round((e.sourceFps||0)*10),dur:Math.round((e.presentedFps||0)*10)}:null;if(pq){const k=p?(p._pqn||(p._pqn={})):{};k[e.type]=(k[e.type]||0)+1;if(k[e.type]<=(e.type==='avlag'||e.type==='hitch'?5:e.type==='user-avsync'?3:2))track('act',Object.assign({x:'pq:'+e.type},base,pq))}if(e.type==='user-avsync'&&p){try{const S=window.Sentry;if(S&&S.captureMessage&&(p._avs=(p._avs||0)+1)<=3)S.captureMessage('Viewer saw sound out of sync: '+(c.slug||'?'),{level:'info',tags:{show:c.slug||'',episode:c.ep||'',server:e.server||'',source:e.source||'',file_fps_estimate:String(e.sourceFps==null?'':e.sourceFps)},extra:Object.assign({stamp:e},vpExtra(p.diagnostics())),fingerprint:['avsync',c.slug||'']})}catch(x){}}if(e.type==='lookup-failed')track('act',Object.assign({x:'pq:lookup-failed'},base));if(e.type==='failed')track('error',Object.assign({x:c.item||'',n:e.cause==='network'?2:e.cause==='format'?(e.code===3?3:4):(e.code||0),cause:e.cause||'',reason:e.reason||''},base));if(e.type==='recovered'&&p&&!p._tq)p._tq=setTimeout(()=>vpTrouble(p,'during'),30000);if(e.type==='summary'){vpTrouble(p,'end',c);vpMetric('summary',e,base)}}
function vpMetric(k,e,base){try{if(k==='started'){track('act',Object.assign({x:'pq:started',n:Math.round(e.ms)||0},base));return}const m=e.summary||{};if(m.startupMs==null&&!(m.watchMs>0))return;const f=e.frames||{};const o={x:'pq:summary',pos:Math.round((m.rebufferRatio||0)*1000),dur:Math.round(m.watchMs||0)};if(f.total>0)o.n=Math.round((f.dropped||0)*1000/f.total);track('act',Object.assign(o,base));flushEv()}catch(x){}}
function vpExtra(d){return{timeline:d.decisions,recent:(d.events||[]).slice(-25),summary:d.summary,failure:d.failure,env:d.env,source:d.source,size:d.size,frames:d.frames,pageDrawing:d.pageDrawing,time:d.time,ahead:d.ahead,readyState:d.readyState,networkState:d.networkState,error:d.error,ua:d.ua}}
function vpTrouble(p,why,ctx){try{if(!p||!window.Sentry||!Sentry.captureMessage)return;const d=p.diagnostics(),m=d.summary||{};if(!(m.freezes||m.drifts||m.switches||m.actions||m.stalls>2||m.avlags||m.hitches>2||m.lowfps||m.decodelags))return;p._sent=(p._sent||0)+1;if(p._sent>2)return;const c=ctx||p._ctx||{};Sentry.captureMessage('Playback trouble: '+(c.slug||'?'),{level:'warning',tags:{show:c.slug||'',episode:c.ep||'',when:why,freezes:String(m.freezes),drifts:String(m.drifts),stalls:String(m.stalls),avlags:String(m.avlags||0),hitches:String(m.hitches||0),lowfps:String(m.lowfps||0),decodelag:String(m.decodelags||0),file_fps_estimate:String(m.sourceFps==null?'':m.sourceFps),fixes:String(m.actions),worked:String(m.recovered),switches:String(m.switches),server:d.source?d.source.url.split('/')[2]:''},extra:vpExtra(d),fingerprint:['trouble',c.slug||'']})}catch(x){}}
function vpReport(d,p,kind){try{if(!p)return;if(kind==='avsync'){const a=d&&d.avsync;if(!a||p._repAv===String(a.at))return;p._repAv=String(a.at);vpEvent(Object.assign({},a,{type:'user-avsync'}),p);return}const f=(d&&d.failure)||{},key=String(f.at||0);if(p._rep===key)return;p._rep=key;const c=p._ctx||{};track('report',{slug:c.slug,ep:c.ep,x:'fail:'+(f.cause||'?')+':'+(f.reason||'?')+' '+(c.item||''),cause:f.cause||'',diag:vpExtra(d||{})})}catch(x){}}
function mkPlayer(host,o){if(!window.VoidPlayer){host.innerHTML='<div class="loading">The player did not load. Refresh the page.</div>';return null}return VoidPlayer.create(host,Object.assign({globalKeys:true,storageKey:'voidtv',onEvent:vpEvent,syncButton:!!state.dbg},o||{}))}
function nextEp(){const s=state.show;if(!s||!s.seasons||!s.seasons[state.se])return null;const se=s.seasons[state.se];if(state.e+1<se.episodes.length)return se.episodes[state.e+1];return s.seasons[state.se+1]?s.seasons[state.se+1].episodes[0]:null}
function prevEp(){const s=state.show;if(!s||!s.seasons)return;if(state.e>0)play(state.se,state.e-1);else if(state.se>0)play(state.se-1,s.seasons[state.se-1].episodes.length-1)}
function mountShow(s,se,ep,autoplay){const host=$('vph');if(!host)return null;
 VP=mkPlayer(host,{onNext:()=>{if(nextEp())next()},onPrev:()=>prevEp(),onReport:vpReport,onEnded:async(p)=>{const nx=nextEp(),cur=p._cur;if(nx&&await p.upNext(nx.name,10)&&VP===p&&p._cur===cur)next()}});
 if(!VP)return null;
 VP._show=s.slug;bindEpisodeEvents(VP);
 const at=startAtFor(s,ep);
 if(autoplay)loadEp(VP,s,se,ep,{at});else idleEp(VP,s,se,ep,at);
 return VP.v}
// One player per visit to a show (SP-020; DESIGN.md step 2 of the contract: create once, load() per episode). Next, previous
// and a click in the episode list swap the episode inside the player that is already there (swapEpisode), so the player
// element stays in the page and a viewer in fullscreen stays in fullscreen. Only a different show, or another page,
// builds a new player. p._cur names the episode that is loaded right now; every listener reads it when the event
// happens, so play, tick, end and the resume position never name the wrong episode.
// Opening a show page does not touch the Archive (SP-026): the player waits, with the show's picture as its poster,
// until the viewer presses play (or picks an episode, or presses Play on a card). Only then does it look up servers and start.
function startAtFor(s,ep){if(state.seekTo){const t=state.seekTo;state.seekTo=0;return t}const hr=ME.history[s.slug];return hr&&hr.se===state.se&&hr.e===state.e&&hr.pos>20&&(!ep.min||hr.pos<ep.min*60-30)?hr.pos:0}
function loadEp(p,s,se,ep,o){const epk=se.season+'x'+ep.n,v=p.v;
 if(p.ep&&p._cur&&!v.ended){try{if(typeof p._emitSummary==='function')p._emitSummary();else p._emit({type:'summary',summary:p.core.summary(),at:performance.now()})}catch(x){}}
 const up=p.ui&&p.ui.card&&!p.ui.card.hidden&&p.ui.card.classList.contains('upnext')?p.ui.card.querySelector('[data-c=stop]'):null;if(up)up.click();
 clearTimeout(p._tq);p._tq=0;p._sent=0;
 p._cur={slug:s.slug,se:state.se,e:state.e,epk,file:(ep.item||'')+' '+(ep.url||'').slice(-90)};
 p._ctx={slug:s.slug,ep:epk,item:ep.item||''};p._lastSave=Date.now();
 delete v.dataset.tr;delete v.dataset.lt;
 v.addEventListener('loadeddata',()=>v.removeAttribute('poster'),{once:true});
 const n=p._loadN=(p._loadN||0)+1;p.play=function(){};
 const r=Promise.resolve(p.load({id:s.slug+'/'+epk,title:'S'+String(se.season).padStart(2,'0')+'E'+String(ep.n).padStart(2,'0')+' · '+ep.name,show:s.show,files:filesFor(ep),artwork:s.poster||''},{startAt:o.at||0,autoplay:true}));
 const done=()=>{if(p._loadN===n&&Object.prototype.hasOwnProperty.call(p,'play'))delete p.play};r.then(done,(e)=>{done();throw e});
 if(o.feel&&typeof p._status==='function')p._status('Starting…',8000);
 return r}
function idleEp(p,s,se,ep,at){try{p.v.poster=s.backdrop||s.poster||''}catch(e){}
 p._ctx={slug:s.slug,ep:se.season+'x'+ep.n,item:ep.item||''};
 p.play=function(){loadEp(p,s,se,ep,{at,feel:true})}}
function bindEpisodeEvents(p){const v=p.v;
 v.addEventListener('play',()=>{const c=p._cur;if(!c||v.dataset.tr)return;v.dataset.tr=1;v.dataset.lt=Date.now();track('play',{slug:c.slug,ep:c.epk,x:c.file})});
 v.addEventListener('timeupdate',()=>{const c=p._cur,now=Date.now();if(c&&v.dataset.tr&&now-(+v.dataset.lt||0)>=60000){v.dataset.lt=now;track('tick',{slug:c.slug,ep:c.epk,pos:v.currentTime,dur:v.duration||0,x:dropX(v)})}});
 v.addEventListener('ended',()=>{const c=p._cur;if(c)track('end',{slug:c.slug,ep:c.epk,pos:v.currentTime,dur:v.duration||0})});
 v.addEventListener('play',()=>{const c=p._cur;if(!c||!state.show||state.show.slug!==c.slug||state.se!==c.se||state.e!==c.e)return;const r=ME.history[c.slug];if(!r||r.se!==c.se||r.e!==c.e)remember()});
 v.addEventListener('timeupdate',()=>{const c=p._cur;if(!c)return;const t=Date.now();if(t-(p._lastSave||0)>5000){p._lastSave=t;const r=ME.history[c.slug];if(r&&r.se===c.se&&r.e===c.e&&v.readyState>=2){r.pos=Math.floor(v.currentTime);r.at=t;saveMe()}}})}
function canReuse(s){const h=$('vph');return !!(VP&&VP._show===s.slug&&h&&VP.root&&h.contains(VP.root)&&document.querySelector('.show .player .vcol'))}
function swapEpisode(s,se,ep){const sh=document.querySelector('.show'),hero=sh.querySelector('.hero');if(hero)hero.remove();
 const had=document.activeElement&&document.activeElement.closest&&document.activeElement.closest('.now');
 const now=sh.querySelector('.now');if(now)now.outerHTML=nowRow(se,ep,s);
 const row=sh.querySelector('.mine-row');if(row)row.outerHTML=mineRow(s,se,ep);
 const old=sh.querySelector('.inep'),x=epXray(s,se,ep);
 if(old){if(x)old.outerHTML=x;else old.remove()}else if(x){const eps=sh.querySelector('.eps');if(eps)eps.insertAdjacentHTML('beforebegin',x)}
 const el=sh.querySelector('.eps');
 if(el){const top=el.scrollTop;el.outerHTML=epsMarkup(s);const n=sh.querySelector('.eps');if(n){n.scrollTop=top;const on=n.querySelector('.ep.on');if(on){const a=on.getBoundingClientRect(),b=n.getBoundingClientRect();if(a.top<b.top||a.bottom>b.bottom)n.scrollTop+=(a.top-b.top)-(b.height-a.height)/2}}}
 if(had){const b=sh.querySelector('.now button');if(b)b.focus({preventScroll:true})}
 loadEp(VP,s,se,ep,{at:startAtFor(s,ep)})}
function epsMarkup(s){const si=state.seView==null?state.se:Math.min(state.seView,s.seasons.length-1);const x=s.seasons[si];
 let h='<div class="eps"><div class="sehead"><select onchange="state.seView=+this.value;epsRefresh()">'+s.seasons.map((z,i)=>'<option value="'+i+'"'+(i===si?' selected':'')+'>Season '+z.season+' · '+z.episodes.length+' episode'+(z.episodes.length===1?'':'s')+((s.vault||[]).filter(v=>v.season===z.season).length?' · '+(s.vault||[]).filter(v=>v.season===z.season).length+' download only':'')+'</option>').join('')+'</select><small>'+s.seasons.length+' season'+(s.seasons.length===1?'':'s')+'</small></div>'
 +epRows(s,x,si)+'</div>';return h}
function epsRefresh(){const s=state.show;const el=document.querySelector('.eps');if(!s||!s.seasons||!el)return;el.outerHTML=epsMarkup(s)}
function epRows(s,x,si){const have=new Set(x.episodes.map(y=>y.n));const vault=(s.vault||[]).filter(v=>v.season===x.season&&!have.has(v.n));
 const rows=[...x.episodes.map((y,ei)=>({n:y.n,h:'<div class="ep '+(si===state.se&&ei===state.e?'on':'')+'" onclick="play('+si+','+ei+')"><span class="n">E'+y.n+'</span><span>'+esc(y.name)+'</span>'+(y.state==='REVIEW'?'<span class="rv">review</span>':'')+(y.r?'<span class="rv dl" title="May not play in every browser">'+esc(y.r)+'</span>':'')+'<span class="m">'+y.min+'m</span></div>'})),
  ...vault.map(v=>({n:v.n,h:'<a class="ep off" href="'+esc(v.url)+'" target="_blank" rel="noopener" title="This copy is '+esc(v.risk)+', which browsers cannot play yet. Download it and open it in VLC."><span class="n">E'+v.n+'</span><span>'+esc(v.name)+'</span><span class="rv dl">download only · '+esc(v.risk)+'</span><span class="m">'+v.min+'m</span></a>'}))].sort((a,b)=>a.n-b.n);
 const other=(s.vault||[]).filter(v=>!s.seasons.some(z=>z.season===v.season));const bySe={};for(const v of other)(bySe[v.season]=bySe[v.season]||[]).push(v);
 const extra=Object.keys(bySe).length?'<div class="vaultnote">'+Object.entries(bySe).map(([se,list])=>'<span>Season '+se+': '+list.length+' episode'+(list.length===1?'':'s')+' on the Archive, download only · <a href="https://archive.org/details/'+esc(list[0].url.split('/download/')[1].split('/')[0])+'" target="_blank" rel="noopener">open the upload ↗</a></span>').join('')+'</div>':'';
 return rows.map(r=>r.h).join('')+extra}
function showView(autoplay){const s=state.show;if(!s.seasons){killPlayer();$('main').innerHTML=(state.loadErr&&state.loadErr.slug===s.slug)?loadFailCard(state.loadErr):'<div class="loading"><span class="signal"></span><span>Searching the Void for '+esc(s.show)+'…</span></div>';return}if(!s.seasons[state.se]){state.se=0;state.e=0}if(!s.seasons[state.se].episodes[state.e])state.e=0;const se=s.seasons[state.se];const ep=se.episodes[state.e];
 if(autoplay&&canReuse(s)){swapEpisode(s,se,ep);return}
 let h='<div class="show"><button class="back" onclick="go(\\'\\')">← Browse</button>';
 if(!autoplay)h+='<div class="hero">'+(s.backdrop?'<img src="'+s.backdrop+'" alt="">':'')+'<div class="t"><b>'+esc(s.show)+'</b>'+(s.overview?'<p>'+esc(s.overview.slice(0,260))+(s.overview.length>260?'…':'')+'</p>':'')+'<div class="g">'+[s.network,s.year,s.genres.join(' · '),s.rating?'★ '+s.rating:'',s.eps+' episodes'].filter(Boolean).join('  ·  ')+'</div></div></div>';
 h+='<div class="player"><div class="vcol"><div class="vpx-host" id="vph"></div>'+nowRow(se,ep,s)+'<p class="hint">Space / K play-pause · ← → 10s · J / L −10 / +30s · N next · F fullscreen · C captions. "review" = the builder is not sure this file is this episode.</p>'+mineRow(s,se,ep)+'</div>'+epXray(s,se,ep);
 h+=epsMarkup(s)+'</div>';
 h+=xray(s)+'</div>';
 killPlayer();$('main').innerHTML=h;mountShow(s,se,ep,autoplay)}
function nowRow(se,ep,s){return '<div class="now"><div><b>S'+String(se.season).padStart(2,'0')+'E'+String(ep.n).padStart(2,'0')+'</b> · '+esc(ep.name)+(ep.state==='REVIEW'?(wfInfo(s,ep)?wfChip():' <span class="rv">review</span>'):'')+'</div><button class="btn" onclick="next()">Next episode <i class="ico next"></i></button>'+wfRow(s,ep)+'</div>'}
function mineRow(s,se,ep){return '<div class="acts mine-row"><span class="mine" data-slug="'+s.slug+'">'+acts(s)+'</span>'+repBtn(s,se,ep)+'<button class="btn" id="share" title="Copy a link to this episode at the current time" onclick="shareMoment()"><i class="ico arrow-up"></i>Share this moment</button><a class="btn" href="'+ep.url+'" target="_blank" rel="noopener" download title="The original file from the Archive, for VLC, a USB stick or a flight" data-t="act" data-x="download" onclick="track(this.dataset.t,{slug:state.show.slug,x:this.dataset.x})"><i class="ico arrow-down sm"></i>Download</a></div>'}
function face(p){const open=state.person===p.id;return '<div class="face'+(open?' on':'')+'" onclick="person('+p.id+')">'+(p.photo?'<img loading="lazy" src="'+p.photo+'" alt="">':'<div class="ph"></div>')+'<b>'+esc(p.name)+'</b><small>'+esc(p.as||'')+'</small></div>'}
function findPerson(s,id){const pool=[...(s.cast||[]),...(s.crew||[])];for(const c of Object.values(s.credits||{}))pool.push(...c.d,...c.w,...c.g);return pool.find(x=>x.id===id)||{name:'',photo:null}}
function bioFor(id){if(BIO[id]!==undefined)return BIO[id];BIO[id]=null;fetch(BASE+'data/people/'+id+'.json').then(r=>r.ok?r.json():null).then(b=>{BIO[id]=b||false;const el=document.querySelector('.person');if(el&&state.show&&state.person===id)el.outerHTML=personPanel(id,findPerson(state.show,id));if(state.view==='person'&&state.personId===id)render()}).catch(()=>{BIO[id]=false;const el=document.querySelector('.person');if(el&&state.show&&state.person===id)el.outerHTML=personPanel(id,findPerson(state.show,id));if(state.view==='person'&&state.personId===id)render()});return null}
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
// The guide rows, one per channel, as tvPage has always drawn them (also redrawn in place by tuneHere).
function guideRows(chans,cur){return chans.map(c=>{const n=chanNow(c);const ci=c.items[n.i];const cs=SHOWS[ci[0]];return '<div class="ch'+(c.id===cur.id?' on':'')+'" onclick="tune(\\''+c.id+'\\')"><span class="cn">'+esc(c.name)+'<small>'+c.shows+' show'+(c.shows===1?'':'s')+' · '+c.eps+' episodes · '+kindName[c.kind]+'</small></span><span class="np">'+esc(cs?cs.show:'')+' <small>'+code(ci)+' · '+mmss(n.remain)+' left</small></span></div>'}).join('')}
// Change channel on the player that is already on the page: same player, same video, same fullscreen, no render(). The page
// pieces tvPage draws around it (guide, title, the bar under the video) are updated in place; what plays and when is tvPlay's, as always.
// False when there is no player on the Live TV page to switch (not turned on yet, other page): tune then falls back to render().
function tuneHere(id){const host=$('vph'),g=document.querySelector('.guide');if(state.view!=='tv'||!TV||!VP||!host||!g||!host.contains(VP.root))return false;
 const chans=TV.filter(c=>!c.adult||ME.adult),cur=chans.find(c=>c.id===id);if(!cur)return false;const now=chanNow(cur),s=SHOWS[cur.items[now.i][0]];
 g.innerHTML=guideRows(chans,cur);document.title=cur.name+' · '+SITE;osd(cur,now.i,s,null);if(VP.flashChannel)VP.flashChannel(cur.name);tvPlay(cur,now.i,now.offset);return true}
function tune(id){track('tune',{slug:id});state.chan=id;state.tvOn=true;history.replaceState(null,'',urlFor('tv/'+id));if(!tuneHere(id))render();window.scrollTo(0,0)}
function surf(dir){if(!TV)return;const list=TV.filter(c=>!c.adult||ME.adult);const i=list.findIndex(c=>c.id===state.chan);tune(list[(i+dir+list.length)%list.length].id)}
function osd(c,i,s,ep){const el=document.querySelector('.osd');if(!el)return;const it=c.items[i];const n=chanNow(c);const nx=SHOWS[c.items[(i+1)%c.items.length][0]];
 el.innerHTML='<b>'+esc(c.name)+'</b><span>'+esc(s.show)+' · '+code(it)+(ep?' · '+esc(ep.name):'')+'</span><span class="g">'+(n.i===i?mmss(n.remain)+' left · ':'')+'next: '+esc(nx?nx.show:'')+'</span><span class="acts"><button class="btn" onclick="surf(-1)"><i class="ico chevron-left"></i>Ch</button><button class="btn" onclick="surf(1)">Ch<i class="ico chevron-right"></i></button><button class="btn" onclick="go(\\''+s.slug+'\\')">Open show</button></span>'}
async function tvPlay(c,i,offset){const it=c.items[i];const s=SHOWS[it[0]];const host=$('vph');if(!host||!s)return;const token=++TV_TOKEN;await ensure(s);if(token!==TV_TOKEN||state.view!=='tv')return;const se=(s.seasons||[]).find(x=>x.season===it[1]);const ep=se&&se.episodes.find(e=>e.n===it[2]);if(!ep){tvPlay(c,(i+1)%c.items.length,0);return}osd(c,i,s,ep);track('tvplay',{slug:c.id,x:s.slug+' '+se.season+'x'+ep.n});TVCUR={c,i};if(!VP||!host.contains(VP.root))VP=mkPlayer(host,{volumeKeys:false,onNext:()=>surf(1),onPrev:()=>surf(-1),channelButtons:{onNext:()=>surf(1),onPrev:()=>surf(-1)},onEnded:()=>{const n=chanNow(TVCUR.c);const j=n.i===TVCUR.i?(TVCUR.i+1)%TVCUR.c.items.length:n.i;tvPlay(TVCUR.c,j,n.i===TVCUR.i?0:n.offset)},onEvent:(e,p)=>{vpEvent(e,p);if(e.type==='started')state.tvFails=0;if(e.type==='failed'){state.tvFails=(state.tvFails||0)+1;if(state.tvFails>6){state.tvFails=0;const o=document.querySelector('.osd');if(o)o.insertAdjacentHTML('beforeend','<p class="dim">Signal lost on this channel for now. Try another one.</p>');return}const tk=TV_TOKEN;setTimeout(()=>{if(VP!==p||!TVCUR||tk!==TV_TOKEN)return;const n=chanNow(TVCUR.c);tvPlay(TVCUR.c,(n.i+1)%TVCUR.c.items.length,0)},1500)}}});if(!VP)return;VP._ctx={slug:s.slug,ep:se.season+'x'+ep.n,item:ep.item||''};VP.load({id:c.id+'/'+s.slug+'/'+se.season+'x'+ep.n,title:s.show+' · '+ep.name,show:c.name,files:filesFor(ep),artwork:s.poster||''},{startAt:offset>5?offset:0,autoplay:!!state.tvOn})}
async function tvPage(){const main=$('main');if(!TV){killPlayer();main.innerHTML='<div class="loading"><span class="signal"></span><span>Searching the Void for a signal…</span></div>';try{await ensureTV()}catch(_){killPlayer();main.innerHTML='<div class="loading">The channels did not load.</div>';return}if(state.view!=='tv')return}
 const chans=TV.filter(c=>!c.adult||ME.adult);const cur=chans.find(c=>c.id===state.chan)||chans[0];state.chan=cur.id;const now=chanNow(cur);const it=cur.items[now.i];const s=SHOWS[it[0]];
 let h='<div class="tv"><div class="pagehead"><img class="door" src="'+BASE+'assets/brand/ui/doors/live.png" alt=""><div><h1>Live TV</h1><div class="g">'+chans.length+' channels, always on, the same for everyone</div></div></div><div class="screen">'+(state.tvOn?'<div class="vpx-host" id="vph"></div>':(innerWidth>700?'<video class="idle" autoplay muted loop playsinline poster="'+BASE+'assets/brand/set-static.jpg"><source src="'+BASE+'assets/brand/video/set.mp4" type="video/mp4"></video>':'<img class="idle" src="'+BASE+'assets/brand/set-poster.jpg" alt="">')+'<button class="on" onclick="state.tvOn=true;render()"><i class="ico play"></i>Turn on</button>')+'<div class="osd"></div></div>';
 h+='<p class="hint">Always on, same for everyone: the clock decides what is playing. ↑ ↓ to surf. Nothing here is recorded in Mine unless you open the show.</p>';
 h+='<div class="guide">'+guideRows(chans,cur)+'</div></div>';
 killPlayer();main.innerHTML=h;document.title=cur.name+' · '+SITE;osd(cur,now.i,s,null);if(state.tvOn)tvPlay(cur,now.i,now.offset)}
function cashPage(){killPlayer();$('main').innerHTML='<div class="about"><button class="back" onclick="go(\\'\\')"><i class="ico back"></i> Browse</button>'
 +'<div class="pagehead" style="padding-left:0"><img class="door" src="'+BASE+'assets/brand/cash-cross.png" alt="" style="object-fit:contain;padding:10px"><div><h1>CASH</h1><div class="g">the Church of American Strength &amp; Hope · a 501(c)(3)</div></div></div>'
 +'<h2>What CASH does</h2><p>CASH works on ways for people to have good things that fit a busy life and a budget stretched to the max. Some of that work is in person, in the community. Some of it is projects like this one: ${BRAND} is free, stays free, carries no ads and asks for no account, and it exists because the work of building it was worth doing.</p>'
 +'<h2>What a donation does</h2><p>Donations are not a price for the videos; the shows belong to the Internet Archive and play from there. Donations pay for CASH\\'s real-world work: events people can come to, help that reaches people where they are, and more projects built the way this one was. No set amount, never required. If the work is worth something to you, giving back makes you part of it.</p>'
 +'<div class="acts" style="margin:14px 0 20px"><a class="btn gold" href="'+DONATE+'" target="_blank" rel="noopener">♥ Donate to CASH</a><a class="btn" href="https://cashvalues.org" target="_blank" rel="noopener">cashvalues.org ↗</a><button class="btn" onclick="go(\\'about\\')">About ${BRAND}</button></div>'
 +'<h2>Where to find CASH</h2><p><a href="https://cashvalues.org" target="_blank" rel="noopener">cashvalues.org</a> has the programs, the events and the people. Questions, ideas or a hand to lend: reach out there.</p></div>'}
let PROMOS=null,PROMOS_P=null;const SHAPE_NAME={wide:'16:9',square:'1:1',feed:'4:5',tall:'9:16'};
function promosLoad(){if(!PROMOS_P)PROMOS_P=fetch(BASE+'assets/brand/promos/promos.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null).then(j=>{PROMOS=j&&j.items?j:{items:{},slots:{}};return PROMOS});return PROMOS_P}
function promoUrl(f){return BASE+'assets/brand/promos/'+encodeURIComponent(f)}
function promoPick(it,want){const sh=(it&&it.shapes)||{};if(want&&sh[want])return Object.assign({k:want},sh[want]);const order=innerHeight>innerWidth*1.1?['feed','tall','square','wide']:['wide','square','feed','tall'];for(const k of order)if(sh[k])return Object.assign({k},sh[k]);return null}
function promoBox(x,vh){return 'aspect-ratio:'+x.w+'/'+x.h+';max-width:min(100%,calc('+vh+'vh * '+x.w+' / '+x.h+'))'}
function promoFill(){if(!$('promohome'))return;promosLoad().then(P=>{const el=$('promohome');const b=P.slots&&P.slots.home,it=b&&P.items[b],x=promoPick(it);if(!el)return;if(!x){el.innerHTML='';return}el.innerHTML='<section class="promo-home"><button class="ph" style="'+promoBox(x,60)+'" onclick="promoPlay(this)" data-src="'+esc(promoUrl(x.src))+'" aria-label="Play: '+esc(it.title||'voidtv.net')+'"><img src="'+esc(promoUrl(x.poster))+'" alt="" loading="lazy"><span class="pp"><i class="ico play"></i></span></button><a class="phmore" onclick="go(\\'promos\\')">More to watch and share →</a></section>'})}
function promoPlay(b){const v=document.createElement('video');v.src=b.dataset.src;v.controls=true;v.autoplay=true;v.playsInline=true;v.setAttribute('playsinline','');v.setAttribute('style',b.getAttribute('style'));b.replaceWith(v);v.play().catch(()=>{})}
function promoCard(b,it,want){const x=promoPick(it,want);if(!x)return '';const n=SHAPE_NAME[x.k]||x.k;return '<div class="promo" id="pc-'+esc(b)+'"><h2>'+esc(it.title||b)+'</h2><div class="pv" style="'+promoBox(x,72)+'"><video controls playsinline preload="none" poster="'+esc(promoUrl(x.poster))+'" src="'+esc(promoUrl(x.src))+'"></video></div><div class="acts">'+Object.keys(it.shapes).map(s=>'<button class="btn'+(s===x.k?' on':' ghost')+' sm" onclick="promoShape(\\''+esc(b)+'\\',\\''+s+'\\')">'+(SHAPE_NAME[s]||s)+'</button>').join('')+'<a class="btn gold" href="'+esc(promoUrl(x.src))+'" download="voidtv.net-'+esc(b)+'-'+n.replace(':','x')+'.mp4">Download '+n+' · '+(x.bytes/1048576).toFixed(1)+' MB</a></div></div>'}
function promoShape(b,k){const el=document.getElementById('pc-'+b);if(el&&PROMOS&&PROMOS.items[b])el.outerHTML=promoCard(b,PROMOS.items[b],k)}
function promosPage(){killPlayer();$('main').innerHTML='<div class="about promos"><button class="back" onclick="go(\\'\\')"><i class="ico back"></i> Browse</button><div class="pagehead" style="padding-left:0"><img class="door" src="'+BASE+'assets/brand/icon-192.png?v=2" alt=""><div><h1>Promos</h1><div class="g">watch them, download them, post them anywhere</div></div></div><div id="promolist"><p class="g">Loading…</p></div></div>';promosLoad().then(P=>{const el=$('promolist');if(!el)return;const list=((P.slots&&P.slots.promos)||[]).filter(b=>P.items[b]);el.innerHTML=list.length?'<p>Free to share: post them, send them, play them before movie night. Each one comes in the shapes shown under it.</p>'+list.map(b=>promoCard(b,P.items[b])).join(''):'<p>No promos yet.</p>'})}
function aboutPage(){killPlayer();$('main').innerHTML='<div class="about"><button class="back" onclick="go(\\'\\')"><i class="ico back"></i> Browse</button>'
 +'<div class="pagehead" style="padding-left:0"><img class="door" src="'+BASE+'assets/brand/icon-192.png?v=2" alt=""><div><h1>About ${BRAND}</h1><div class="g">${PROFILE.tagline}</div></div></div>'
 +'<h2>What this is</h2><p>${BRAND} is a better way to find and watch the television that already lives on the <a href="https://archive.org" target="_blank" rel="noopener">Internet Archive</a>: shows from 1990 to now, the classics behind their own door, TV movies and specials, every episode in order, every one of them playable, with the people and connections that tie them together. We host nothing. Every video plays from archive.org; what we add is the catalog, the order, the player and the care.</p>'
 +'<h2>Who makes it</h2><p>${BRAND} is a project of <a href="https://cashvalues.org" target="_blank" rel="noopener">CASH, the Church of American Strength &amp; Hope</a>, a 501(c)(3). CASH works on ways for people to have good things that fit a busy life and a budget stretched to the max. ${BRAND} is free and stays free: no paywall, no ads, no accounts required. If the work is worth something to you, <a href="'+DONATE+'" target="_blank" rel="noopener">give back and be part of it</a>. No set amount, never required.</p>'
 +'<h2>Spread the word</h2><p>Short promos to watch, download and post anywhere: <span class="lnk" onclick="go(\\'promos\\')">voidtv.net/promos</span>.</p>'
 +'<h2>Rights</h2><p>The files belong to the Internet Archive and its uploaders. If you hold rights to something listed here, the Archive has a <a href="https://archive.org/about/terms.php" target="_blank" rel="noopener">takedown process</a> for the files themselves; tell us too, through <a href="https://cashvalues.org" target="_blank" rel="noopener">cashvalues.org</a>, and we will pull the listing. <span class="lnk" onclick="go(\\'takedown\\')">Takedown and corrections →</span></p>'
 +'<h2>Credits</h2><p>Show and person data and artwork from <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a> and <a href="https://www.tvmaze.com" target="_blank" rel="noopener">TVmaze</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>'
 +'<h2>Yours stays yours</h2><p>Your list, likes and watch history live in your browser (see <span class="lnk" onclick="go(\\'me\\')">Mine</span>); nothing of that leaves it. The site does record anonymous usage (which pages and episodes are opened, how far they play, what is searched, the device type and a rough location from Cloudflare) so we can see what works and what fails; no names, no accounts, no ads, no selling. Late Night sits behind an 18+ door you open yourself. <span class="lnk" onclick="go(\\'privacy\\')">Privacy →</span></p></div>';document.title='About · '+SITE}
// The two public notices, /privacy and /takedown: plain text in the About layout. The words are the approved draft (audit launch item 7);
// the one address is CONTACT and the one outside link is the Internet Archive's Terms of Use (route 1 on /takedown). No placeholder is left.
function textPage(h1,body){killPlayer();$('main').innerHTML='<div class="about"><button class="back" onclick="go(\\'\\')"><i class="ico back"></i> Browse</button><div class="pagehead" style="padding-left:0"><img class="door" src="'+BASE+'assets/brand/icon-192.png?v=2" alt=""><div><h1>'+h1+'</h1></div></div>'+body+'</div>'}
function privacyPage(){textPage('About ${BRAND} and your privacy',
 '<h2>What ${BRAND} is</h2><p>${BRAND} is a viewer for video that other people have uploaded to the Internet Archive (archive.org). We host no video. Every episode you watch streams from the Archive\\'s own servers, under the Archive\\'s own terms. ${BRAND} adds a guide: show pages, episode lists, search, and rows to browse. It is a project of CASH, a 501(c)(3) nonprofit, with no ads, no accounts and no fees.</p>'
 +'<h2>What we collect</h2><p>Very little, and nothing that names you.</p><ul>'
 +'<li>No account, no sign-up, no email.</li>'
 +'<li>One cookie, only while the site is in testing, that remembers you entered the test password. It is no longer set when the site opens to the public, and copies already in browsers expire within 30 days.</li>'
 +'<li>Anonymous usage counts: when a page is opened, when a show is played and for how long, when a search is made (with the search words, up to 80 characters), and when playback has trouble. Each count carries a random session id that lives only in your browser and changes every month, plus your country, region, city, time zone and the data center that answered you, as reported by our hosting provider. It also carries your browser, operating system and device type, and the name of the site you came from, if any. Our own usage counts store no IP address. Nothing is sold or shared.</li>'
 +'<li>Your Mine page (list, likes, watch history) is kept in your own browser, and we do not receive it as a list. We do count the actions, as anonymous usage counts like the rest: when you like or hide a show, add it to your list or play an episode. A file you report with "Wrong file?" is sent to us, with the show and episode. Ticking "Not the right film" on a movie likewise sends us the movie and its file.</li>'
 +'<li>Errors and playback trouble are reported to an error service (Sentry) with the show, the episode and what the player measured, so we can fix stalls. Those reports carry no name and no account. The Sentry script (js.sentry-cdn.com) loads on every page view, so your browser contacts Sentry whenever you open the site.</li>'
 +'<li>Posters and photos load from The Movie Database (TMDB), so your browser contacts their servers for images.</li></ul>'
 +'<h2>What we do not do</h2><p>No advertising, no tracking across sites, no selling of data, no profiles.</p>'
 +'<h2>Children</h2><p>${BRAND} carries programming for grown-ups, including late-night comedy and adult animation. A separate site for children, ${BRAND} kids, is being built with its own rules and no identifiers at all.</p>'
 +'<h2>Contact</h2><p><a href="mailto:${CONTACT}">${CONTACT}</a></p>');document.title='Privacy · '+SITE}
function takedownPage(){textPage('Takedown and corrections',
 '<h2>Where the video comes from</h2><p>Every file playable on ${BRAND} is hosted by the Internet Archive and was uploaded there by an Archive user. ${BRAND} does not store, copy or re-host any of it.</p>'
 +'<h2>If you hold rights to something you see here</h2><p>Two routes, and you may use both:</p><ol>'
 +'<li><b>The Internet Archive.</b> The Archive handles removal of the files it hosts. Their process is in <a href="https://archive.org/about/terms.php" target="_blank" rel="noopener">the Internet Archive\\'s Terms of Use, which include its copyright policy and how to request removal</a>. When a file is removed there, it stops playing on ${BRAND}; our link check tests a sample of files each night and retires the ones that no longer play, as it finds them.</li>'
 +'<li><b>${BRAND}.</b> Write to <a href="mailto:${CONTACT}">${CONTACT}</a> with the show and episode (the address bar of the page is enough). We remove the listing from ${BRAND} within two business days whether or not the Archive has acted, and we tell you when it is done.</li></ol>'
 +'<h2>Wrong file, wrong show, wrong episode</h2><p>Every episode page has a "Wrong file?" button. Press it and the file is flagged and queued for a person to look at, and the report shows on your Mine page. You can also write to <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>'
 +'<h2>Who we are</h2><p>${BRAND} is a project of CASH, a 501(c)(3) nonprofit.</p>');document.title='Takedown and corrections · '+SITE}
function personPage(){const id=state.personId;const g=PEOPLE[id];const b=bioFor(id);const from=state.personFrom&&BY_SLUG[state.personFrom];const fp=from?findPerson(from,id):{name:'',photo:null};const name=(b&&b.name)||(g&&g.name)||fp.name||'…';const photo=(b&&b.photo)||(g&&g.photo)||fp.photo;const shows=g?Object.entries(g.shows).map(([sl,role])=>[BY_SLUG[sl],role]).filter(x=>x[0]):[];if(!shows.length&&from)shows.push([from,fp.as||'Credited']);
 const facts=b?[b.dept,b.born?'born '+b.born+(b.died?', died '+b.died:''):'',b.place].filter(Boolean).join(' · '):'';
 let h='<div class="ppage"><button class="back" onclick="history.length>1?history.back():go(\\'\\')"><i class="ico back"></i> Back</button><div class="head">'+(photo?'<img src="'+photo+'" alt="">':'')+'<div><b>'+esc(name)+'</b><div class="g">'+esc(facts)+(shows.length?(facts?' · ':'')+shows.length+' show'+(shows.length===1?'':'s')+' on ${BRAND}':'')+'</div>'+(b&&b.bio?'<div class="bio">'+esc(b.bio)+'</div>':(b===null?'<div class="g">Loading…</div>':''))+'</div></div>';
 if(shows.length)h+='<h2>On ${BRAND}</h2><div class="grid">'+shows.map(([t,role])=>'<div class="pcard">'+card(t,'grid')+'<small class="role">'+esc(role)+'</small></div>').join('')+'</div>';
 else if(GRAPH_LOADED)h+='<p class="g">Only one show here so far; open it from the X-Ray panel.</p>';
 killPlayer();$('main').innerHTML=h+'</div>';document.title=name+' · '+SITE}
function personPanel(id,fallback){const g=PEOPLE[id];const b=bioFor(id);const name=(b&&b.name)||(g?g.name:fallback.name),photo=(g&&g.photo)||fallback.photo||(b&&b.photo);const others=g?Object.entries(g.shows).filter(([sl])=>sl!==state.show.slug&&BY_SLUG[sl]):[];
 const facts=b?[b.dept,b.born?'born '+b.born.slice(0,4)+(b.died?'–'+b.died.slice(0,4):''):'',b.place].filter(Boolean).join(' · '):'';
 return '<div class="person">'+(photo?'<img src="'+photo+'" alt="">':'<div></div>')+'<div><b>'+esc(name)+'</b><span class="more" onclick="state.personFrom=state.show.slug;go(\\'person/'+id+'\\')">Open page <i class="ico chevron-right sm"></i></span><div class="g">'+(facts?esc(facts)+' · ':'')+(others.length?'Also on ${BRAND} in '+others.length+' other show'+(others.length===1?'':'s'):'No other ${BRAND} shows yet')+'</div>'+(b&&b.bio?'<div class="bio">'+esc(b.bio.length>320?b.bio.slice(0,320).replace(/\\s+\\S*$/,'')+'…':b.bio)+'</div>':'')
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
function urlFor(slug){if(slug==='about')return ROUTES==='path'?'/about':'#about';if(slug==='promos')return ROUTES==='path'?'/promos':'#promos';if(slug==='cash')return ROUTES==='path'?'/cash':'#cash';if(slug==='privacy')return ROUTES==='path'?'/privacy':'#privacy';if(slug==='takedown')return ROUTES==='path'?'/takedown':'#takedown';if(slug==='tv'||(slug&&slug.startsWith('tv/')))return ROUTES==='path'?'/'+slug:'#'+slug;if(slug&&slug.startsWith('person/'))return ROUTES==='path'?'/'+slug:'#'+slug;if(slug==='me')return ROUTES==='path'?'/me':'#me';return ROUTES==='path'?(slug?'/show/'+slug:'/'):(slug?'#'+slug:'#')}
function safeDecode(x){try{return decodeURIComponent(x)}catch(_){return x}}
function slugFromUrl(){if(ROUTES==='path'){if(location.pathname==='/me'||location.pathname==='/me/')return 'me';if(location.pathname==='/about'||location.pathname==='/about/')return 'about';if(location.pathname==='/promos'||location.pathname==='/promos/')return 'promos';if(location.pathname==='/cash'||location.pathname==='/cash/')return 'cash';if(location.pathname==='/privacy'||location.pathname==='/privacy/')return 'privacy';if(location.pathname==='/takedown'||location.pathname==='/takedown/')return 'takedown';const pm=location.pathname.match(/^\\/person\\/(\\d+)/);if(pm)return 'person/'+pm[1];const tm=location.pathname.match(/^\\/tv(?:\\/([^/]+))?\\/?$/);if(tm)return tm[1]?'tv/'+tm[1]:'tv';const m=location.pathname.match(/^\\/show\\/([^/]+)/);if(m)return safeDecode(m[1]);}return location.hash.length>1?location.hash.slice(1):''}
let GRAPH_P=null;async function ensureGraph(){if(GRAPH_LOADED)return;if(!GRAPH_P)GRAPH_P=(async()=>{try{const g=await (await fetch(BASE+'data/graph.json')).json();Object.assign(PEOPLE,g.people);Object.assign(LINKS,g.links);GRAPH_LOADED=true}catch(_){GRAPH_P=null}})();await GRAPH_P;}
function adoptVault(d){if(!d.vault||!d.vault.length)return;const can=document.createElement('video').canPlayType('video/x-matroska; codecs="avc1.640028, mp4a.40.2"');if(!can)return;for(const v of d.vault){let se=d.seasons.find(z=>z.season===v.season);if(!se){se={season:v.season,episodes:[]};d.seasons.push(se);d.seasons.sort((a,b)=>a.season-b.season)}if(se.episodes.some(e=>e.n===v.n))continue;se.episodes.push({n:v.n,name:v.name,state:'REVIEW',url:v.url,min:v.min,item:'',r:v.risk,tryc:1});se.episodes.sort((a,b)=>a.n-b.n)}d.vault=[]}
${FETCH_JSON_SRC}
// A show's data. The host answers a file it does not have with the home page and status 200, and the password gate
// answers everything with its own page once the cookie runs out, so fetchJson checks what came back (SP-006, SP-043).
// A reply with no seasons, or a season with no episodes, would break the show page, so that counts as a failed load.
async function ensure(s){if(s.seasons)return s;const d=await fetchJson(BASE+'data/shows/'+s.slug+'.json',{check:(x)=>!!x&&typeof x==='object'&&Array.isArray(x.seasons)&&x.seasons.length>0&&x.seasons.every(z=>!!z&&Array.isArray(z.episodes)&&z.episodes.length>0)});adoptVault(d);if(d.people)for(const [id,p] of Object.entries(d.people))if(!PEOPLE[id])PEOPLE[id]=p;if(d.links&&!LINKS[s.slug])LINKS[s.slug]=d.links;delete d.people;delete d.links;Object.assign(s,d);return s}
// A show that did not load gets a plain card instead of the loading card for good. kind 'html' with gate set means the
// password cookie ran out: only a reload (which shows the password page again) helps. showView draws this from state.loadErr.
function loadFailCard(e){const bar='<div class="acts" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">';
 if(e.kind==='html'&&e.gate)return '<div class="loading" role="alert"><div><p><b style="color:var(--fg)">Your session ended.</b> Reload the page.</p>'+bar+'<button class="btn gold" onclick="location.reload()">Reload</button></div></div></div>';
 return '<div class="loading" role="alert"><div><p><b style="color:var(--fg)">This show did not load.</b></p><p class="g">'+(e.kind==='network'?'Check your connection, then try again.':'What came back was not the show. Trying again usually fixes it.')+'</p>'+bar+'<button class="btn gold" onclick="retryShow()">Try again</button><button class="btn" onclick="go(\\'\\')">Back to browse</button></div></div></div>'}
function retryShow(){const s=state.show;if(s)go(s.slug,true)}
// An address for a show this site does not list (a removed show, a stale link, a mangled address): the home page and one line.
function missingShow(slug){state.show=null;state.view='';state.seView=null;history.replaceState(null,'',urlFor(''));document.title=SITE;render();window.scrollTo(0,0);const m=$('main');if(m)m.insertAdjacentHTML('afterbegin','<p class="g" role="status" style="margin:0;padding:16px 20px 0">That show is not here any more.</p>');track('act',{x:'show-missing:'+String(slug).slice(0,60)})}
async function go(slug,replace){state.person=null;state.open=null;state.menu=null;const qs0=new URLSearchParams(location.search);if(qs0.has('dbg'))state.dbg=true;if(slug==='about'){state.show=null;state.view='about';history[replace?'replaceState':'pushState'](null,'',urlFor('about'));document.title='About · '+SITE;render();window.scrollTo(0,0);return}if(slug==='promos'){state.show=null;state.view='promos';history[replace?'replaceState':'pushState'](null,'',urlFor('promos'));document.title='Promos · '+SITE;render();window.scrollTo(0,0);return}if(slug==='cash'){state.show=null;state.view='cash';history[replace?'replaceState':'pushState'](null,'',urlFor('cash'));document.title='CASH · '+SITE;render();window.scrollTo(0,0);return}if(slug==='privacy'){state.show=null;state.view='privacy';history[replace?'replaceState':'pushState'](null,'',urlFor('privacy'));document.title='Privacy · '+SITE;render();window.scrollTo(0,0);return}if(slug==='takedown'){state.show=null;state.view='takedown';history[replace?'replaceState':'pushState'](null,'',urlFor('takedown'));document.title='Takedown and corrections · '+SITE;render();window.scrollTo(0,0);return}if(slug==='tv'||(slug&&slug.startsWith('tv/'))){state.show=null;state.view='tv';if(slug.length>3)state.chan=safeDecode(slug.slice(3));history[replace?'replaceState':'pushState'](null,'',urlFor(slug));render();window.scrollTo(0,0);return}if(slug&&slug.startsWith('person/')){state.show=null;state.view='person';state.personId=+slug.slice(7);history[replace?'replaceState':'pushState'](null,'',urlFor(slug));render();window.scrollTo(0,0);if(!GRAPH_LOADED){await ensureGraph();render()}return}if(slug==='me'&&!BY_SLUG.me){state.show=null;state.view='me';history[replace?'replaceState':'pushState'](null,'',urlFor('me'));document.title='Mine · '+SITE;render();window.scrollTo(0,0);return}state.view='';if(!slug){state.show=null;history[replace?'replaceState':'pushState'](null,'',urlFor(''));document.title=SITE;render();if(!replace){window.scrollTo(0,0);blip()}return}const s=Object.prototype.hasOwnProperty.call(BY_SLUG,slug)?BY_SLUG[slug]:null;if(!s){missingShow(slug);return}if(gated(s)){adultGate(()=>go(slug,replace));return}state.show=s;state.seView=null;state.loadErr=null;if(s.seasons){const r0=resume(s);state.se=r0.se;state.e=r0.e}else{state.se=0;state.e=0}history[replace?'replaceState':'pushState'](null,'',urlFor(slug));document.title=s.show+' · '+SITE;render();window.scrollTo(0,0);try{await ensure(s)}catch(err){if(state.show===s){state.loadErr={slug:s.slug,kind:(err&&err.kind)||'network',gate:!!(err&&err.gate)};track('error',{slug:s.slug,x:'show-load:'+state.loadErr.kind+(err&&err.status?':'+err.status:''),cause:state.loadErr.gate?'gate':state.loadErr.kind});render()}return}if(state.show!==s)return;const r=resume(s);state.se=r.se;state.e=r.e;const qs=qs0;if(qs.get('s')&&qs.get('e')){const si=s.seasons.findIndex(x=>x.season===+qs.get('s'));const ei=si>=0?s.seasons[si].episodes.findIndex(x=>x.n===+qs.get('e')):-1;if(si>=0&&ei>=0){state.se=si;state.e=ei;state.seekTo=+qs.get('t')||0}history.replaceState(null,'',urlFor(slug))}state.seView=null;render();if(!replace)blip()}
function play(se,e){state.se=se;state.e=e;state.seView=se;remember();showView(true)}
function next(){const s=state.show;if(!s||!s.seasons||!s.seasons[state.se])return;if(state.e+1<s.seasons[state.se].episodes.length)play(state.se,state.e+1);else if(state.se+1<s.seasons.length)play(state.se+1,0)}
function remember(){const s=state.show;const r=ME.history[s.slug];ME.history[s.slug]={se:state.se,e:state.e,at:Date.now(),pos:(r&&r.se===state.se&&r.e===state.e)?(r.pos||0):0};saveMe()}
function resume(s){meSync();const r=ME.history[s.slug];if(r&&s.seasons[r.se]&&s.seasons[r.se].episodes[r.e])return r;return{se:0,e:0}}
function bgReel(view){const v=document.querySelector('.bgvid');if(!v)return;const want=false;if(want){if(!v.getAttribute('src')){v.src=BASE+'assets/brand/video/reel.mp4';v.load()}v.classList.add('on');v.play().catch(()=>{})}else{v.classList.remove('on');if(!v.paused)v.pause()}}
function render(){const any=state.type||state.genre||state.network||state.decade||state.tag||state.q;document.body.dataset.view=state.show?'show':state.view==='me'?'me':state.view==='person'?'person':state.view==='tv'?'tv':any?'grid':'home';bgReel(document.body.dataset.view);document.body.dataset.era=(state.show?state.show.type:state.type)==='Classic TV'?'classic':'';if(state.show)showView(false);else if(state.view==='me')keepTracks(mePage);else if(state.view==='person')keepTracks(personPage);else if(state.view==='tv')tvPage();else if(state.view==='about')keepTracks(aboutPage);else if(state.view==='cash')keepTracks(cashPage);else if(state.view==='privacy')keepTracks(privacyPage);else if(state.view==='takedown')keepTracks(takedownPage);else if(state.view==='promos')keepTracks(promosPage);else keepTracks(browse);watchTracks();promoFill();setTimeout(field,0);const rk=location.pathname+'|'+document.body.dataset.view;if(rk!==state.lastRk){state.lastRk=rk;track('view',{slug:state.show?state.show.slug:(state.view==='person'?'p'+state.personId:''),x:state.type||state.tag||''})}}
document.addEventListener('keydown',(k)=>{if(k.ctrlKey||k.metaKey||k.altKey)return;if(k.target.matches&&k.target.matches('input:not([type=range]),select,textarea,[contenteditable]'))return;if(k.key==='/'){k.preventDefault();$('q').focus();return}if(state.view==='tv'&&(k.key==='ArrowUp'||k.key==='ArrowDown')){k.preventDefault();surf(k.key==='ArrowUp'?-1:1);return}if(k.key==='Escape'&&state.show&&!document.fullscreenElement)go('')});
window.addEventListener('popstate',()=>go(slugFromUrl(),true));
// Parallax depth: the far image drifts slowest and grows, the void turns and sinks, the dust nearest; content rides on top at full speed.
(function(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const light=innerWidth<=700||matchMedia('(pointer: coarse)').matches;const bg=document.querySelector('.bgimg'),vd=document.querySelector('.void'),du=document.querySelector('.dust');let t=false;function frame(){t=false;if(document.querySelector('.vpx:not(.paused)'))return;const y=window.scrollY,h=Math.max(1,document.documentElement.scrollHeight-innerHeight),f=Math.min(1,y/h);const w=Math.sin(y/700),w2=Math.sin(y/430);const col=document.querySelector('.column');if(col)col.style.transform='translate3d(0,'+(y*0.35)+'px,0)';if(light)return;if(bg)bg.style.transform='translate3d(0,'+(-f*60+w*22)+'px,0) scale('+(1.06+f*0.05+w2*0.015)+')';if(vd)vd.style.transform='translate3d('+(w2*60)+'px,'+(-f*120+w*90)+'px,0) rotate('+(y*0.06)+'deg) scale('+(1.05+w2*0.12)+')';if(du){du.style.setProperty('--dy',(-y*0.55)+'px');du.style.transform='translate3d('+(w*30)+'px,0,0) scale('+(1.02+0.05*w2)+')'}}let last=-1;(function loop(){const y=window.scrollY;if(y!==last){last=y;frame()}requestAnimationFrame(loop)})();window.addEventListener('resize',()=>{last=-1});window.__parallax=frame})();
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
  const indexScript = `<script src="${base}assets/player/voidplayer.js?v=${PLAYER_V}"></script>` + (mode === 'embed' ? '' : `<script src="${base}data/index.js"></script>`);
  const hx = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const title = hx(meta.title ? `${meta.title} · ${SITE_NAME}` : SITE_NAME);
  const desc = meta.description || 'TV shows from 1990 to now, and the classics behind one door: every episode in order, every one of them plays. From the Internet Archive.';
  const ogImg = meta.image || (meta.url ? new URL(meta.url).origin + '/assets/brand/og.jpg' : '');
  const og = [
    ['og:type', 'video.other'], ['og:site_name', SITE_NAME], ['og:title', meta.title || SITE_NAME], ['og:description', desc],
    ...(ogImg ? [['og:image', ogImg]] : []), ...(meta.url ? [['og:url', meta.url]] : []), ['twitter:card', ogImg ? 'summary_large_image' : 'summary'],
  ].map(([k, v]) => `<meta property="${k}" content="${hx(v)}">`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://image.tmdb.org"><link rel="preconnect" href="https://archive.org"><link rel="stylesheet" href="${base}assets/player/player.css?v=${PLAYER_V}"><link rel="dns-prefetch" href="https://archive.org">
<link rel="icon" href="${base}assets/brand/favicon.png?v=2"><link rel="apple-touch-icon" href="${base}assets/brand/apple-touch-icon.png?v=2"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#07080c">
<meta name="description" content="${desc.replace(/"/g, '&quot;')}">
${og}
<style>${CSS}</style></head><body>
<header><div class="logo" onclick="go('')"><img class="mark" src="${base}assets/brand/icon-192.png?v=2" alt="" onerror="this.remove()"><span class="name"><span class="v">voidtv</span><span class="n">.net</span></span></div><input id="q" placeholder="Search shows…" oninput="state.q=this.value;if(state.show||state.view)go('',true);else render()"><a class="mine-link" onclick="go('tv')" title="Live channels, always on"><i class="ico tv"></i><span class="long"> TV</span></a><a class="mine-link" onclick="go('me')" title="My List, likes and watch history"><i class="ico bookmark"></i><span class="long"> Mine</span></a><a class="donate" href="${DONATE_URL}" target="_blank" rel="noopener" title="Donate to the Church of American Strength &amp; Hope"><i class="ico heart sm"></i> Donate<span class="long"> to CASH</span></a></header>
<div class="atmos lo" aria-hidden="true"><div class="bgimg"><video class="bgvid" muted loop playsinline preload="none"></video></div><div class="void"><i></i></div><div class="dust"></div></div><main id="main"></main><div class="atmos hi" aria-hidden="true"><div class="grain"></div></div>
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

module.exports = { assemble, page, indexEntry, showFile, SITE_NAME, BRAND };
