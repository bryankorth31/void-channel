/**
 * Void Channel — Caching Proxy Server
 * 
 * Architecture Step 1: The app never talks to archive.org directly.
 * This proxy handles all Archive API calls, caches responses,
 * and serves normalized data to the mobile client.
 * 
 * Cache TTLs:
 *   - Category listings: 1 hour (content doesn't change fast)
 *   - Item metadata:     6 hours (static once ingested)
 *   - Search results:    30 min (balance freshness vs load)
 *   - All categories:    1 hour (the big initial payload)
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Cache = require("./cache");
const archive = require("./archive");
const hearts = require("./hearts");
const views = require("./views");
const { optionalAuth } = require("./supabase");

// Admin kill list: poll Supabase hard_excludes every 60s and feed archive's exclude filter (the
// spine has no Supabase; enforcement runs in the backend's spine-transport dropExcluded wrappers).
// Items inserted into the table (via the admin panel OR directly) vanish from every surface in 60s.
const { supabase: _adminSb } = require("./supabase");
async function refreshHardExcludes() {
  if (!_adminSb) return;
  try {
    const { data, error } = await _adminSb.from("hard_excludes").select("ia_id");
    if (!error && Array.isArray(data)) archive.setExtraExcludes(data.map((r) => r.ia_id));
  } catch (e) { /* keep last good list */ }
}
refreshHardExcludes();
setInterval(refreshHardExcludes, 60 * 1000);
const authRoutes = require("./auth");
const syncRoutes = require("./sync");
const { router: matureGateRoutes, gateVerified } = require("./maturegate");
const rateLimit = require("express-rate-limit");
const xrayRoutes = require("./contributions");
const embedRoutes = require("./embed");
const playlistRoutes = require("./playlists");
const subscriptionRoutes = require("./subscriptions");
const trendingRoutes = require("./trending");
const adminRoutes = require("./admin");
const commentRoutes = require("./comments");

const app = express();
const cache = new Cache(1200); // 20min default TTL (was 1hr — rotate content faster)

const PORT = process.env.PORT || 3001;

// ── Last-known-good categories ───────────────────────────────
// Archive.org occasionally throttles or errors, returning categories with empty items.
// Caching/serving that blanks the whole app for everyone for 20 min. We keep the last
// payload that actually had content and (a) never cache an empty result, (b) serve the
// last-good payload if a fresh fetch comes back empty.
// Keyed by generation ('boomer'/'millennial'/'genz'/'none') — each era-lean keeps its own last-good.
let lastGoodCategories = {};
// Healthy WALLS only (>= WALL_MIN_ROWS rows with items), per gen. Fallback for when a deploy /
// spine-warm blip yields a thin wall, so a thin payload is never cached or served (B: "wall only
// has 2/4 rows" was a thin payload that had poisoned the server + Cloudflare edge cache for 20m).
let lastGoodWall = {};
const WALL_MIN_ROWS = 8;
const rowsWithItems = (arr) => (Array.isArray(arr) ? arr : []).filter((c) => c && (c.items || []).length > 0).length;
// No cross-row repeats (B 2026-06-28): a film tagged in two genres (or pulled into Most Popular)
// would otherwise show in two rows. Walk rows in DISPLAY order - first row to show an item keeps it,
// later rows drop it; rows emptied by dedup fall away. Keyed by base id (strip :N segment suffixes).
function dedupeRows(cats) {
  if (!Array.isArray(cats)) return cats;
  const seen = new Set();
  const out = [];
  for (const c of cats) {
    if (!c || !Array.isArray(c.items)) { if (c) out.push(c); continue; }
    const items = [];
    for (const it of c.items) {
      const b = String((it && it.id) || '').replace(/:\d+$/, '');
      if (!b || seen.has(b)) continue;
      seen.add(b);
      items.push(it);
    }
    if (items.length > 0) out.push({ ...c, items });
  }
  return out;
}
// Persist the last full wall across restarts. In-memory lastGoodWall is empty on a fresh deploy/
// restart, so the warm-up rebuilds thin for ~60s (B's recurring "where did the rows go" = the
// deploy warm window). Saved to Redis (L2) on every healthy wall + restored on boot, the thin-guard
// can serve the full 11 the instant the server comes back, killing the warm-window thin wall.
const LASTGOOD_WALL_KEY = 'lastgood:wall:all';
const LASTGOOD_BASE_KEY = 'lastgood:base:none';
(async () => {
  try {
    const w = await cache.get(LASTGOOD_WALL_KEY);
    if (w && rowsWithItems(w) >= WALL_MIN_ROWS) { lastGoodWall.all = w; console.log(`[wall] restored last-good wall from cache (${rowsWithItems(w)} rows)`); }
  } catch (e) { /* cold cache / no redis — the warm-up will fill it */ }
  try {
    const b = await cache.get(LASTGOOD_BASE_KEY);
    if (Array.isArray(b) && b.length && rowsWithItems(b) > 0) { lastGoodCategories['none'] = b; console.log(`[wall] restored last-good base from cache (${b.length} cats)`); }
  } catch (e) { /* cold cache / no redis */ }
  try {
    const p = await cache.get(LASTGOOD_PREMIUM_KEY);
    if (Array.isArray(p) && p.length >= 3) { lastGoodPremium = p; }
  } catch (e) { /* cold cache / no redis */ }
  try {
    const ix = await cache.get(LASTGOOD_IDEAS_KEY);
    if (Array.isArray(ix) && ix.length >= 3) { lastGoodIdeas = ix; }
  } catch (e) { /* cold cache / no redis */ }
})();
// Premium + Ideas are LIVE fetches (IA buries them in search), so a cold archive / open breaker right
// after a restart returns too few and the draw row blinks out. Keep the last good set in memory +
// Redis and fall back to it, so these rows never vanish once we've seen them.
let lastGoodPremium = [];
const LASTGOOD_PREMIUM_KEY = 'lastgood:premium';
let lastGoodIdeas = [];
const LASTGOOD_IDEAS_KEY = 'lastgood:ideas';
const VALID_GENS = ['void', 'boomer', 'millennial', 'genz']; // legacy gens still parse; all lean the same (VOID) now
function parseGen(q) { return VALID_GENS.includes(q) ? q : null; }
// Sorts the client may request via ?sort= — powers search "re-roll" (a genuinely different set for
// the same query). Whitelisted so a bad value can't break the Archive query; unknown → ignored.
const SEARCH_SORTS = new Set([
  'downloads desc', 'downloads asc', 'addeddate desc', 'publicdate desc',
  'year desc', 'year asc', 'avg_rating desc', 'week desc', 'month desc',
]);
function categoriesHaveContent(cats) {
  if (!Array.isArray(cats) || cats.length === 0) return false;
  const populated = cats.filter((c) => c && Array.isArray(c.items) && c.items.length > 0).length;
  return populated >= Math.ceil(cats.length * 0.5); // require >=50% of categories populated
}

// ── Middleware ──────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ── Per-IP rate limiting (slice 16, the Move 3 prerequisite). Behind Cloudflare/Render the
// client IP arrives via X-Forwarded-For, hence trust proxy. Budgets are generous for real
// use and hostile to scrapers/relay-hammering; the watchlist's "protect the bill and the
// Archive relationship" item. 429s carry standard headers.
app.set("trust proxy", 1);
app.use("/api/", rateLimit({
  windowMs: 5 * 60 * 1000, max: 600,
  standardHeaders: true, legacyHeaders: false,
}));
app.use("/api/search", rateLimit({
  windowMs: 5 * 60 * 1000, max: 120,
  standardHeaders: true, legacyHeaders: false,
}));
app.use("/api/auth", rateLimit({
  windowMs: 5 * 60 * 1000, max: 40,
  standardHeaders: true, legacyHeaders: false,
}));

// ── Static assets (TV static loading videos etc.) ─────────
// Serve /static/* from backend/public/static with aggressive CDN caching
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const STATIC_DIR = path.join(__dirname, "public", "static");
app.use("/static", express.static(STATIC_DIR, {
  maxAge: "30d",                     // browser cache: 30 days (immutable assets)
  setHeaders: (res) => {
    res.set("Cache-Control", "public, max-age=2592000, immutable");
    res.set("Access-Control-Allow-Origin", "*");
  },
}));

// Loader-clip manifest — auto-discovers every .mp4 in public/static so the app can
// pick a random loading filler. Drop in any number of clips, no code change needed.
let _loaderClipsCache = null;
let _loaderClipsCacheAt = 0;
app.get("/api/loaders", (req, res) => {
  try {
    // Re-scan at most once a minute (cheap, but no need to hit disk on every request)
    if (!_loaderClipsCache || Date.now() - _loaderClipsCacheAt > 60000) {
      const files = fs.existsSync(STATIC_DIR) ? fs.readdirSync(STATIC_DIR) : [];
      _loaderClipsCache = files
        .filter((f) => /\.(mp4|webm)$/i.test(f))
        .sort()
        .map((f) => `/static/${f}`);
      _loaderClipsCacheAt = Date.now();
    }
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    res.json({ clips: _loaderClipsCache });
  } catch (err) {
    console.error("[/api/loaders]", err);
    res.json({ clips: [] });
  }
});

// ── Thumbnail proxy + cache ───────────────────────────────
// Archive.org thumbnails are slow and frequently blocked cross-origin (ORB) or reset.
// We proxy them through our own origin (api.voidtv.net) with long immutable cache headers,
// so they're cacheable at the Cloudflare edge + browser, and never hit cross-origin blocks.
// On any failure we 302-redirect to the original Archive URL — graceful degradation.
const _thumbCache = new Map();           // cleanId -> { buf, ct, exp }
const THUMB_TTL = 6 * 60 * 60 * 1000;    // 6h in memory
const THUMB_MAX = 600;                    // cap memory (~600 thumbs)
// Image transform for the thumbnail proxy: convert IA thumbnails to webp + cap size (sharp =
// libvips, fast + memory-efficient). Loaded defensively so a missing/broken native binary degrades
// to serving the originals instead of breaking thumbnails.
let _sharp = null;
try { _sharp = require("sharp"); } catch (e) { console.warn("[thumb] sharp unavailable, serving original thumbnails:", e.message); }

app.get("/api/thumb/:id", async (req, res) => {
  const cleanId = String(req.params.id)
    .replace(/:\d+$/, "")
    .replace(/\.(jpe?g|png|webp|gif)$/i, "");
  const sendImg = (buf, ct) => {
    res.set("Content-Type", ct || "image/jpeg");
    res.set("Cache-Control", "public, max-age=2592000, immutable"); // 30d — Cloudflare + browser cache
    res.set("Access-Control-Allow-Origin", "*");
    res.send(buf);
  };

  // Serve from memory if we've already fetched this thumb (don't re-hit Archive → no throttling)
  const hit = _thumbCache.get(cleanId);
  if (hit && hit.exp > Date.now()) return sendImg(hit.buf, hit.ct);

  const src = `https://archive.org/services/img/${cleanId}`;
  try {
    const r = await fetch(src, {
      headers: { "User-Agent": "VoidChannel/0.3 (+https://voidtv.net)" },
      timeout: 8000,
      redirect: "follow",
    });
    if (!r.ok) return res.redirect(302, src);
    let buf = Buffer.from(await r.arrayBuffer());
    let ct = r.headers.get("content-type") || "image/jpeg";
    // webp + size cap = the efficiency win: smaller bytes, less client memory. Falls back to the
    // original buffer on any sharp error (animated gif, odd format, decode failure).
    if (_sharp) {
      try {
        buf = await _sharp(buf).rotate().resize({ width: 512, withoutEnlargement: true }).webp({ quality: 74 }).toBuffer();
        ct = "image/webp";
      } catch (e) { /* keep the original buf/ct */ }
    }
    _thumbCache.set(cleanId, { buf, ct, exp: Date.now() + THUMB_TTL });
    if (_thumbCache.size > THUMB_MAX) _thumbCache.delete(_thumbCache.keys().next().value); // evict oldest
    return sendImg(buf, ct);
  } catch (err) {
    return res.redirect(302, src); // archive.org slow/blocked → fall back to direct
  }
});

// ── Captions (layer 1) ────────────────────────────────────
// Serve a video's sidecar subtitle file as WebVTT, SAME-ORIGIN. The web app fetches this,
// wraps it in a blob: URL, and feeds a <track> — so we sidestep the cross-origin <track>/CORS
// landmine (adding `crossorigin` to the <video> would risk tainting IA playback). SRT is
// converted to VTT (comma→dot on the ms separator + a WEBVTT header); .vtt passes through.
const _vttCache = new Map();
const VTT_TTL = 1000 * 60 * 60 * 24 * 7; // 7d — captions are immutable
const VTT_MAX = 500;
function srtToVtt(srt) {
  let s = String(srt).replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return "WEBVTT\n\n" + s.trim() + "\n";
}
function ensureVttHeader(vtt) {
  const s = String(vtt).replace(/^﻿/, "");
  return /^\s*WEBVTT/.test(s) ? s : "WEBVTT\n\n" + s.trim() + "\n";
}
app.get("/api/captions/:identifier", async (req, res) => {
  const cleanId = String(req.params.identifier).replace(/:\d+$/, "");
  const file = String(req.query.file || "");
  // Path-traversal guard: only the sidecar subtitle files we advertised, no parent-dir escapes.
  if (!file || file.includes("..") || !/\.(srt|vtt)$/i.test(file)) {
    return res.status(400).send("bad caption file");
  }
  const sendVtt = (text) => {
    res.set("Content-Type", "text/vtt; charset=utf-8");
    res.set("Cache-Control", "public, max-age=604800, immutable");
    res.set("Access-Control-Allow-Origin", "*");
    res.send(text);
  };
  const cacheKey = `${cleanId}/${file}`;
  const hit = _vttCache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return sendVtt(hit.text);

  const src = `https://archive.org/download/${encodeURIComponent(cleanId)}/${file.split("/").map(encodeURIComponent).join("/")}`;
  try {
    const r = await fetch(src, {
      headers: { "User-Agent": "VoidChannel/0.3 (+https://voidtv.net)" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!r.ok) return res.status(502).send("caption fetch failed");
    let text = await r.text();
    text = /\.srt$/i.test(file) ? srtToVtt(text) : ensureVttHeader(text);
    _vttCache.set(cacheKey, { text, exp: Date.now() + VTT_TTL });
    if (_vttCache.size > VTT_MAX) _vttCache.delete(_vttCache.keys().next().value);
    return sendVtt(text);
  } catch (err) {
    return res.status(502).send("caption error");
  }
});

// ── Cloudflare CDN edge-cache headers ─────────────────────
// s-maxage = edge (CDN) cache TTL; max-age=0 = browsers always revalidate via CDN
// stale-while-revalidate = CDN serves stale content while fetching fresh in background
// Routes not listed here get no Cache-Control → Cloudflare passes through uncached
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const seg = req.path.split('/');
  const route = seg[2]; // /api/<route>/...
  const sub = seg[3];
  const edge = (ttl) => res.set('Cache-Control', `public, max-age=0, ${ttl}`);

  if      (route === 'item' && sub)                              edge('s-maxage=21600, stale-while-revalidate=3600'); // 6h — static metadata
  else if (route === 'categories' || route === 'category')       edge('s-maxage=1200, stale-while-revalidate=600');   // 20m — matches server cache
  else if (route === 'search')                                   edge('s-maxage=1800, stale-while-revalidate=600');   // 30m
  else if (route === 'shorts')                                   edge('s-maxage=1800, stale-while-revalidate=600');   // 30m
  else if (route === 'channel')                                   edge('s-maxage=1800, stale-while-revalidate=600');   // 30m — channel queues
  else if (route === 'related')                                  edge('s-maxage=3600, stale-while-revalidate=600');   // 1h
  else if (route === 'trending')                                 edge('s-maxage=300, stale-while-revalidate=120');    // 5m — fast-changing
  else if ((route === 'hearts' || route === 'views') && sub === 'top')
                                                                 edge('s-maxage=300, stale-while-revalidate=120');    // 5m
  else if ((route === 'hearts' || route === 'views') && (sub === 'count' || sub === 'stats'))
                                                                 edge('s-maxage=300, stale-while-revalidate=60');     // 5m
  else if (route === 'banner')                                   edge('s-maxage=60');                                 // 1m
  else if (route === 'theme')                                    edge('s-maxage=300, stale-while-revalidate=60');     // 5m — editorial window
  else if (route === 'library')                                  edge('s-maxage=1200, stale-while-revalidate=600');   // 20m — pool-backed, matches categories
  else if (route === 'catalog')                                  edge('s-maxage=1200, stale-while-revalidate=600');   // 20m — the verified catalog
  else if (route === 'random')                                   res.set('Cache-Control', 'no-store');                // never cache

  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const cached = res.getHeader("X-Cache") || "MISS";
    console.log(`[${req.method}] ${req.path} → ${res.statusCode} (${ms}ms) [${cached}]`);
  });
  next();
});

// ── Auth & Sync ───────────────────────────────────────────

app.use("/api/auth", authRoutes);
app.use("/api/sync", syncRoutes);
app.use(matureGateRoutes); // slice 16: PIN set/verify for the mature gate
app.use("/api/xray", xrayRoutes);

// Embed / OG-meta pages (served at root, not /api)
app.use(embedRoutes);

// Optional auth on all remaining routes — sets req.user if token present
app.use(optionalAuth);

// JOB_14: editorial theme window (config-file driven, B edits without deploys)
app.use(require("./themes"));

// Phase 2: Playlists, Subscriptions, Trending, Recommendations
app.use("/api/playlists", playlistRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api", trendingRoutes);

// The Archivist — AI rabbit-hole guide (Claude Haiku). Account-gated + weekly quota.
app.use("/api/archivist", require("./archivist"));

// Comments — public read, auth required for write
app.use("/api", commentRoutes);

// Admin routes — inject cache reference for flush control
app.use("/api/admin", (req, res, next) => { req._cache = cache; next(); }, adminRoutes);

// Public banner endpoint — anyone can read the current site banner
app.get("/api/banner", (req, res) => {
  res.json(adminRoutes.getBanner ? adminRoutes.getBanner() : null);
});

// ── Routes ─────────────────────────────────────────────────

/**
 * GET /api/categories
 * Returns all categories with items — the big initial payload.
 * This is what populates the home screen.
 */
// VOIDtv KIDS (slice 13): the hard gate is an ALLOWLIST, fail closed. With ?kids=1 the
// payload contains ONLY these crates; everything else does not exist for the client.
// Conservative on purpose: machine-picked pools cannot promise <=11-safe (the Censored
// Eleven class lives in PD cartoon pools), so Betty Boop and Looney Tunes stay out until
// the curation commons' human kid-verified tag exists. B reviews and tunes this list.
// B's revision 2026-06-11: kids = MODERN only ("modern kids cant even see the black and
// white"). Classic show crates are out; Archive crates carry a hard 1980+ item floor where
// unknown years DROP (fail closed). NASA and Commons skip the floor: inherently modern.
// v4 (B: "nature and other things bleeding"): the broad MACHINE crates leak — nature_wildlife
// carries predation/mating/death, cartoons=animationandcartoons is ALL animation (adult/anime
// included). Neither is kid-safe by construction. Kids now stands on the DEFENSIBLE sources
// only: pbs_kids (creator:"PBS Kids", kid-targeted by the tag), saturday_morning (kid-broadcast
// query), and the vouched lanes (kids_picks, kids_channel) where B's judgment is the gate.
// v5 (B: "fix"): maximum safety. saturday_morning dropped too — even kid-broadcast queries
// are machine-broad. Kids stands ONLY on pbs_kids (creator:"PBS Kids", the one defensible
// machine source) and the vouched lanes (kids_picks, kids_channel) where B's judgment gates.
// B: "keep what we have found is good in our accepted" — pbs_kids + saturday_morning stay
// as accepted machine crates, ALONGSIDE the vouched lanes (network channels, picks, sources).
const KIDS_ALLOWLIST = new Set([
  'pbs_kids', 'saturday_morning', 'kids_picks',
]);

// B's Safe Shelf (kids-picks.json): hand-vouched identifiers resolved into a kids crate.
// Config re-read on TTL like the theme desk; resolution leans on getItem's own 6h cache.
const KIDS_PICKS_PATH = require("path").join(__dirname, "kids-picks.json");
let _kidsPicks = { t: 0, cat: null };
// Resolve ONE Safe Shelf entry: try it as an Archive identifier first; if that does not
// resolve, treat it as a TITLE (B said "links OR names") and take the top search hit.
// A name only resolves to a title that ACTUALLY MATCHES it. Without this, "Bill Nye Outer
// Space" grabbed Filmation's Ghostbusters and "Berenstain Bears" grabbed Unus Annus (adult)
// off the top-downloaded hit. On a kids shelf that is a catastrophe; require token overlap.
// Wiki backstop: drop any resolved kids item that Wikidata FLAGS as a never-kids class
// (YouTube channel, adult). Uses the 24h-cached signal; fails OPEN (unknown/error serves,
// since B's vouch is the gate) so a Wikidata outage never blanks the kids wall.
const { wikiSignalBest, cachedSignalBest } = require("./wikigate");
// Serve backstop: CACHED verdicts only (no network) so it never fails open under load. It
// drops anything Wikidata has ALREADY flagged (durable on disk). /check does the live lookups
// and warms the cache, so running it on new content arms this gate permanently.
// B's blocklist (2026-06-12): YouTube mirror accounts are never kid-vouchable — the account
// name says nothing about what's inside. Matched against id, creator AND title so the cut
// holds however the item surfaces. Extend the list as B flags more.
const KIDS_BLOCK = /supercookie|actinf/i; // actinf: ML lecture streams riding the saturday_morning crate (B kill, 2026-06-12)
function dropWikiFlagged(items) {
  return (items || []).filter((it) => {
    if (KIDS_BLOCK.test(it.id) || KIDS_BLOCK.test(String(it.creator || "")) || KIDS_BLOCK.test(String(it.title || ""))) {
      console.warn("[kids] blocklisted, dropped:", it.id);
      return false;
    }
    if (cachedSignalBest(it.title) === "flagged") { console.warn("[kids] wiki-flagged, dropped:", it.title); return false; }
    return true;
  });
}

function titleMatches(query, title) {
  const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const q = norm(query);
  if (!q.length) return true;
  const t = new Set(norm(title));
  const hit = q.filter((w) => t.has(w)).length;
  return hit / q.length >= 0.6; // a strong majority of the name's words must be in the title
}

async function resolvePick(entry) {
  const s = String(entry || "").trim();
  if (!s) return null;
  // An EXACT identifier (no spaces) is a precise vouch and resolves directly. A NAME must
  // verify: take the first PLAYABLE ranked hit whose title actually matches. No match =
  // nothing (an empty slot beats the wrong item, and a kid must never get Unus Annus).
  // skipVet: vouched kids content is B-APPROVED already. The slice-36 playability vet adds
  // a ranged GET per uncached file; a 10-channel build fired ~480 IA requests at once,
  // tripped rate-limiting, and the empty result got cached for 10m (P1, the missing kids
  // wall). Vouched content trusts B's curation; the player graceful-skip + BAD_ENCODE/DEAD_T
  // heuristics remain the safety net for the rare dead vouched tape.
  if (!/\s/.test(s)) {
    const direct = await archive.getItem(s, { skipVet: true }).catch(() => null);
    return (direct && direct.videoUrl) ? direct : null;
  }
  const hits = await archive.search(s, 8, 1, "downloads desc").catch(() => null);
  for (const h of (Array.isArray(hits) ? hits : [])) {
    if (!h || !h.id || !titleMatches(s, h.title)) continue;
    const full = await archive.getItem(h.id, { skipVet: true }).catch(() => null);
    if (full && full.videoUrl) return full;
  }
  return null;
}

async function kidsPicksCategory() {
  if (Date.now() - _kidsPicks.t < 60 * 1000) return _kidsPicks.cat;
  _kidsPicks.t = Date.now();
  try {
    const cfg = JSON.parse(require("fs").readFileSync(KIDS_PICKS_PATH, "utf8"));
    const entries = (cfg.ids || []).slice(0, 100);
    if (!entries.length) { _kidsPicks.cat = null; return null; }
    const items = await dropWikiFlagged((await Promise.all(entries.map((e) => resolvePick(e).catch(() => null)))).filter(Boolean));
    _kidsPicks.cat = items.length ? {
      id: "kids_picks", group: "type", mature: false,
      name: cfg.name || "THE SAFE SHELF",
      subtitle: cfg.subtitle || "picked by hand",
      items,
    } : null;
  } catch (e) { /* keep last good */ }
  return _kidsPicks.cat;
}
const KIDS_NO_FLOOR = new Set([]);
const KIDS_YEAR_FLOOR = 1980;
const kidsFilter = (cats) => (Array.isArray(cats) ? cats : [])
  .filter((c) => c && KIDS_ALLOWLIST.has(c.id) && !c.mature)
  // dropWikiFlagged here too: the machine crates were the one kids lane that skipped the
  // backstop (blocklist + cached wiki verdicts) — SupercookieArchives leaked through it.
  .map((c) => KIDS_NO_FLOOR.has(c.id) ? ({ ...c, items: dropWikiFlagged(c.items) }) : ({
    ...c,
    items: dropWikiFlagged((c.items || []).filter((it) => it && it.year && it.year >= KIDS_YEAR_FLOOR)),
  }))
  .filter((c) => (c.items || []).length > 0);
// B's vouched picks lead the kids wall when present (async resolve, never blocks)
// KIDS time-travel TV (slice 17): the vouched Saturday-morning blocks as one "live" channel.
const KIDS_SAT_PATH = require("path").join(__dirname, "kids-saturday.json");
// One tape per channel per day, played AS IF live. We resolve ONLY the day-rotated block
// (not all 231 tapes), so each channel costs ~1 getItem. The full block list lives in
// kids-saturday.json; the day rotation keeps everyone synced and changes the airing daily.
// Resolve a channel's tapes into a browse row (B: "load the rest into the rows"). Capped,
// parallel, wiki-backstopped. getItem is cached (6h) so repeat builds are cheap.
// Resolve an array through `fn` at most `limit` at a time. Full Promise.all over 240 kids
// ids (10 channels x 24) stormed IA into rate-limiting and blanked the wall (P1). A small
// concurrency cap keeps peak IA load gentle so every channel resolves.
async function mapLimit(arr, limit, fn) {
  const out = new Array(arr.length);
  let i = 0;
  async function worker() {
    while (i < arr.length) {
      const idx = i++;
      out[idx] = await fn(arr[idx], idx).catch(() => null);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, worker));
  return out;
}

async function resolveChannelBlocks(blocks, cap) {
  // Resolve extra so cutting still fills the row. B: cut anything "seconds long" (commercials,
  // bumpers, launch spots that got harvested) -> keep only real broadcasts. Dedupe by id
  // (was throwing React duplicate-key warnings when a tape appeared twice).
  const ids = (Array.isArray(blocks) ? blocks : []).slice(0, (cap || 12) * 2);
  const items = (await mapLimit(ids, 5, (id) => resolvePick(id))).filter(Boolean);
  // Runtime metadata is usually missing on IA, so a title heuristic carries the load: cut the
  // seconds-long ephemera (commercials, promos, bumpers, launch spots) UNLESS the title also
  // signals a long broadcast ("full episodes", "broadcast", "morning"...).
  const SHORT_T = /\b(commercials?|promos?|bumpers?|launch|tv ?spots?|idents?|teasers?|adverts?|station ?id|intro|opening|credits)\b/i;
  const LONG_T = /\b(full|broadcast|episodes?|marathon|block|morning|hour|complete|stream|hours?)\b/i;
  // Uploader re-encodes (codec tags in the id) that IA has no playable derivative for and
  // that throw NotSupportedError. The real broadcast tapes carry no codec tags. Cut by id.
  const BAD_ENCODE = /(h-?264|x-?26[45]|hevc|pdtv|hdtv|web-?dl|bd-?rip|dvd-?rip|\d{3,4}p|\d+fps|\d+kbit|aac-sx|videoplayback)/i;
  // Dead/empty DVD-rip artifacts that resolve a URL but hang the player (B: "the intro to the
  // dvd rips and such that are empty but hang the media if selected"). Cut unconditionally.
  const DEAD_T = /\b(dvd ?menu|main ?menu|disc ?menu|fbi ?warning|previews?|trailers? ?reel|opening ?logos?|disc ?\d|menu ?screen|interlaced ?\d)\b/i;
  const seen = new Set();
  const kept = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    if (BAD_ENCODE.test(it.id)) continue; // re-encode with no playable derivative
    const t = String(it.title || '');
    if (DEAD_T.test(t)) continue; // empty menu/intro that hangs the player
    const tooShort = (it.runtime != null && it.runtime > 0 && it.runtime < 180) || (SHORT_T.test(t) && !LONG_T.test(t));
    if (tooShort) continue;
    kept.push(it);
    if (kept.length >= (cap || 12)) break;
  }
  return dropWikiFlagged(kept);
}

let _kidsSat = { t: 0, cats: [], building: false };
// The channel build resolves ~240 tapes live from IA (~90s cold) — FAR too slow to block a
// request on. Blocking it made every kids request time out, and with no in-flight dedup
// concurrent requests started competing builds that starved each other (the "kids won't
// populate / won't select" bug). So the build runs in the BACKGROUND: requests get whatever
// is cached right now (the fast pool crates + picks render immediately even with zero
// channels yet), and channels fill in over the next minute, appearing on refresh.
async function buildKidsSatChannels() {
  if (_kidsSat.building) return;            // in-flight dedup: one build at a time
  _kidsSat.building = true;
  try {
    const cfg = JSON.parse(require("fs").readFileSync(KIDS_SAT_PATH, "utf8"));
    const channels = Array.isArray(cfg.channels) ? cfg.channels
      : (Array.isArray(cfg.blocks) && cfg.blocks.length ? [{ name: cfg.name || "SATURDAY MORNING", blocks: cfg.blocks }] : []);
    const out = [];
    for (const ch of channels) {
      const items = await resolveChannelBlocks(ch.blocks, 12);
      if (items.length) out.push({
        id: "kids_channel_" + String(ch.name).replace(/[^a-z0-9]+/gi, "_").toLowerCase(),
        group: "type", mature: false, live: true, name: ch.name, subtitle: "time travel TV", items,
      });
      // Publish progress per channel so they appear on refresh as they resolve (and a
      // never-finishing build still surfaces what it got). Never regress a fuller cache.
      if (out.length >= _kidsSat.cats.length) _kidsSat.cats = out.slice();
    }
    if (out.length && out.length >= channels.length) _kidsSat.t = Date.now(); // full build → 10m lock
  } catch (e) { /* keep last good */ }
  finally { _kidsSat.building = false; }
}
// Non-blocking accessor: serve the cache, kick a background build when stale. NEVER awaits.
function kidsSaturdayChannels() {
  const fresh = Date.now() - _kidsSat.t < 10 * 60 * 1000 && _kidsSat.cats.length;
  if (!fresh) buildKidsSatChannels(); // fire-and-forget; returns immediately below
  return _kidsSat.cats;
}

// KIDS SOURCES (B's drop-folder): each backend/kids-sources/*.json is a vouched IA page
// turned into its own kids row. Handles raw Advanced-Search JSON, {identifiers:[]}, {ids:[]},
// or a bare array. Resolution + the titleMatches/playable guards are shared with resolvePick.
const KIDS_SOURCES_DIR = require("path").join(__dirname, "kids-sources");
function extractSourceIds(json) {
  if (Array.isArray(json)) return json.map((x) => (typeof x === "string" ? x : (x && (x.identifier || x.id)))).filter(Boolean);
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json.identifiers)) return json.identifiers;
  if (Array.isArray(json.ids)) return json.ids;
  if (json.response && Array.isArray(json.response.docs)) return json.response.docs.map((d) => d.identifier).filter(Boolean);
  if (Array.isArray(json.docs)) return json.docs.map((d) => d && (d.identifier || d.id)).filter(Boolean);
  return [];
}
function slugFile(name) { return "kidsrc_" + String(name).replace(/\.json$/i, "").replace(/[^a-z0-9]+/gi, "_").toLowerCase(); }

async function readKidsSourceFiles() {
  const fs = require("fs");
  let files = [];
  try { files = fs.readdirSync(KIDS_SOURCES_DIR).filter((f) => /\.json$/i.test(f) && !f.startsWith("_")); } catch (e) { return []; }
  return files.map((f) => {
    try {
      const json = JSON.parse(fs.readFileSync(require("path").join(KIDS_SOURCES_DIR, f), "utf8"));
      return { file: f, name: (json && json.name) || f.replace(/\.json$/i, ""), subtitle: (json && json.subtitle) || "", ids: extractSourceIds(json).slice(0, 80) };
    } catch (e) { return { file: f, name: f, subtitle: "", ids: [], error: e.message }; }
  });
}

let _kidsSrc = { t: 0, cats: [] };
async function kidsSourceCategories() {
  if (Date.now() - _kidsSrc.t < 60 * 1000) return _kidsSrc.cats;
  _kidsSrc.t = Date.now();
  try {
    const files = await readKidsSourceFiles();
    const cats = [];
    for (const f of files) {
      if (!f.ids.length) continue;
      const items = await dropWikiFlagged((await Promise.all(f.ids.map((id) => resolvePick(id).catch(() => null)))).filter(Boolean));
      if (items.length) cats.push({ id: slugFile(f.file), group: "type", mature: false, name: f.name, subtitle: f.subtitle, items });
    }
    _kidsSrc.cats = cats;
  } catch (e) { /* keep last good */ }
  return _kidsSrc.cats;
}

async function kidsShape(cats) {
  const base = kidsFilter(cats);
  // kids-sources/ is a PURE INBOX (B's ruling 2026-06-12): his extension drops EVERY batch
  // there — kids, normal, adult alike — so the folder must never auto-serve to the kids
  // wall. Worked batches move into kids-saturday.json (or their lane) and _raw/. The /check
  // endpoint still reads the folder; it is the inbox's vetting tool.
  const [picks, channels] = await Promise.all([kidsPicksCategory(), kidsSaturdayChannels()]);
  // network channels lead (the marquee), then B's hand picks, then pools
  return [...(channels || []), picks, ...base].filter(Boolean);
}

// CHECK a kids-source page before trusting it: per file, what resolved (eyeball the titles
// for safety) and what failed. B runs this to confirm a page is kid-safe AND playable.
app.get("/api/kids-sources/check", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const files = await readKidsSourceFiles();
    const report = [];
    for (const f of files) {
      const resolved = [];
      const failed = [];
      for (const id of f.ids) {
        const item = await resolvePick(id).catch(() => null);
        if (item && item.videoUrl) {
          const wiki = await wikiSignalBest(item.title).catch(() => ({ signal: "unknown" }));
          resolved.push({ id, title: item.title, wiki: wiki.signal }); // confirmed | flagged | unknown
        } else failed.push(id);
      }
      const counts = resolved.reduce((a, r) => (a[r.wiki] = (a[r.wiki] || 0) + 1, a), {});
      report.push({ file: f.file, name: f.name, total: f.ids.length, wikiCounts: counts, resolved, failed, parseError: f.error || null });
    }
    res.json({ dir: "backend/kids-sources", files: report });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err).slice(0, 200) });
  }
});

app.get("/api/categories", async (req, res) => {
  try {
    const shuffle = req.query.shuffle === "true";
    const refresh = req.query.refresh === "true";
    const kids = req.query.kids === "1";
    // Slice 16 ENFORCEMENT: mature categories ride the payload ONLY with a PIN-verified
    // gate token. Until now the client politely hid them; now the server withholds them.
    const matureOk = gateVerified(req) || req.query.adult === '1';  // 18+ acknowledged (After Dark) - no PIN required
    // A gated (mature-bearing) response must NEVER land in the shared edge cache: same URL,
    // different audience. Private + no-store overrides the CDN header middleware.
    if (matureOk) res.set("Cache-Control", "private, no-store");
    const shape = async (cats) => {
      const base = Array.isArray(cats) ? cats : [];
      if (kids) return kidsShape(base); // allowlist + floor + B's Safe Shelf on top
      return matureOk ? base : base.filter((c) => c && !c.mature);
    };
    const gen = parseGen(req.query.gen);   // generational era-lean (null = no lean / legacy clients)

    // The heavy fetch is GEN-AGNOSTIC — ONE shared payload (warmed). The per-gen era-lean is a cheap
    // in-memory reorder of it (archive.applyEraLean), so we never fetch all ~80 categories once per
    // generation — that overwhelmed Archive.org and timed out every real (gen-bearing) request.
    const timeBucket = Math.floor(Date.now() / (20 * 60 * 1000));
    // Tight home wall vs the Vault (everything else). tier rides the processed-payload cache key
    // (the raw baseKey stays tier-agnostic — one fetch feeds both tiers).
    const tier = ['vault', 'hindi', 'modern', 'adult'].includes(req.query.tier) ? req.query.tier : 'wall';
    const baseKey = `all_categories:none:${timeBucket}`;
    // One identity now (VOID): the lean is uniform for everyone, so the processed wall is shared
    // across all clients — one cache entry per tier (no per-gen fan-out, which fed the genKey churn).
    const genKey = `all_categories:all:${tier}:${timeBucket}`;

    // Fast path: already-computed per-gen (or base) payload
    if (!shuffle && !refresh) {
      const cached = await cache.get(genKey);
      if (cached) { res.set("X-Cache", "HIT"); return res.json(await shape(cached)); }
    }

    // HINDI tier serves LIVE from IA, not the spine's pool-based wall. The pool holds ~no
    // Hindi-language content (it was synced from the English-centric category queries, and the
    // foreign-gate pushes non-Latin out), so the pool wall returns an empty Hindi section. Fetch
    // the hindi category queries live instead (cached 20 min so it pokes IA at most once a bucket).
    if (tier === 'hindi') {
      const hindiCats = archive.CATEGORIES.filter((c) => c.group === 'hindi');
      const rows = await Promise.all(hindiCats.map(async (c) => {
        let items = [];
        try { items = await archive.search(c.query + archive.NSFW_EXCLUDE, 22, 1, c.sort || 'downloads desc'); } catch (e) {}
        return { ...c, items: Array.isArray(items) ? items : [] };
      }));
      if (!shuffle && rows.some((r) => r.items.length)) cache.set(genKey, rows, 1200);
      res.set("X-Cache", "MISS");
      return res.json(await shape(rows));
    }

    // Get the shared base payload: cache → fetch once → last-known-good (never blank the app).
    let base = (!shuffle && !refresh) ? await cache.get(baseKey) : null;
    if (!base) {
      // Wrap the rebuild fetch: getAllCategories THROWING (an Archive/spine hiccup when the 20-min
      // cache expires) must NOT blow past this graceful fallback into the {error} catch and blank the
      // wall (B 2026-06-28 outage: /api/categories returned {"error"} ~45 min after deploy, once the
      // cache expired and the rebuild threw). On throw OR empty, fall back to last-good: in-memory
      // first, then the Redis-persisted copy (survives restarts).
      let fetched = [];
      try { fetched = await archive.getAllCategories(15, shuffle); }
      catch (e) { console.error('[categories] getAllCategories threw, falling back to last-good:', e.message); }
      if (categoriesHaveContent(fetched)) {
        base = fetched;
        lastGoodCategories['none'] = fetched;
        if (!shuffle) { cache.set(baseKey, fetched, 1200); cache.set(LASTGOOD_BASE_KEY, fetched, 86400).catch(() => {}); }
      } else {
        base = lastGoodCategories['none'] || null; // Archive threw/empty: fall back to in-memory last-good
        if (!base) { // cold restart with no in-memory copy yet: try the persisted one
          try { const persisted = await cache.get(LASTGOOD_BASE_KEY); if (categoriesHaveContent(persisted)) { base = persisted; lastGoodCategories['none'] = persisted; } } catch {}
        }
      }
    }

    if (base && categoriesHaveContent(base)) {
      const wallIds = new Set(archive.CATEGORIES.filter((c) => c.wall).map((c) => c.id));
      // MOST POPULAR = the most-downloaded items ACROSS our curated WALL cats (B: "most watched /
      // popular within our current filtered cats"), deduped. Derived from the already-fetched +
      // already junk-screened category items, so no extra IA load. Beats a raw IA download query
      // (which is ~80% templates/test-files/batch-dumps); the feature_films query is the fallback.
      const mpCat = base.find((c) => c && c.id === 'most_popular');
      if (mpCat) {
        const seen = new Set();
        const cross = [];
        for (const c of base) {
          if (!c || c.id === 'most_popular' || c.mature || !wallIds.has(c.id)) continue;
          for (const it of (c.items || [])) {
            if (it && it.id && !seen.has(it.id)) { seen.add(it.id); cross.push(it); }
          }
        }
        cross.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        if (cross.length >= 10) mpCat.items = cross.slice(0, 25);
      }
      // TIER the one shared payload (B 2026-06-15): the tight home wall (11 rows) vs the Vault
      // (everything else, still fully searchable). Read the wall flag from the canonical CATEGORIES
      // so it survives the spine-wall transport. FAIL OPEN on the wall — if the tier data is missing,
      // never blank it; serve the full payload. The color-era recency floor applies to the wall only.
      let tiered;
      if (tier === 'hindi') {
        tiered = base.filter((c) => c && c.group === 'hindi');                        // the Hindi section
      } else if (tier === 'vault') {
        tiered = base.filter((c) => c && !wallIds.has(c.id) && c.group !== 'hindi');  // everything else
      } else if (tier === 'adult') {
        // After Dark (B 2026-06-28): the adult section on its OWN page, off the commercial wall, gated
        // only by the one-time 18+ acknowledgment (adult=1 -> matureOk). The "3rd lane": human
        // sexuality as record, not a porn feed. Curated vintage-adult-cinema rows (live, like Premium)
        // lead; the existing mature cats trail. Everything de-flooded (diversify caps the spam dumps);
        // CSA/hate are still hard-blocked because archive.search runs dropExcluded.
        const adultRows = await Promise.all(archive.ADULT_ROWS.map(async (r) => {
          let items = [];
          try { items = await archive.search(r.query, 24, 1, 'downloads desc'); } catch (e) {}
          return { id: r.id, name: r.name, subtitle: r.subtitle, sort: 'downloads desc', items: archive.diversify(Array.isArray(items) ? items : [], 2) };
        }));
        const matureCats = base.filter((c) => c && c.mature).map((c) => ({ ...c, items: archive.diversify(c.items || [], 2) }));
        tiered = [...adultRows.filter((r) => (r.items || []).length >= 3), ...matureCats];
      } else if (tier === 'modern') {
        // MODERN MODE (B 2026-06-28): the "modern shows & movies app" face. Curated genre/format rows
        // (archive.MODERN_IDS), recency-floored to 1990 so it reads as a current streaming catalog.
        // Same skin/player/search; just a cleaner content lens. fail-open if the set somehow misses.
        tiered = base.filter((c) => c && archive.MODERN_IDS.has(c.id))
          .map((c) => archive.MODERN_LABELS[c.id] ? { ...c, ...archive.MODERN_LABELS[c.id] } : c);  // clean genre names
        if (tiered.length < 4) tiered = base.filter((c) => c && wallIds.has(c.id));  // guard: never blank
        tiered = archive.applyWallRecencyFloor(tiered, 1985);  // mid-80s -> current (fuller, captures the 80s/90s entertainment IA actually has)
        // Premium from the Past — HBO/Showtime-era prestige TV, surfaced via a tuned title query
        // (IA buries it in search ranking). ROBUST: a cold archive / open breaker right after a deploy
        // returns too few, so fall back to the last good set (memory + Redis) - the draw never blinks
        // out. sort:'downloads desc' = floor-exempt + ranked. Fetch failure never blocks the wall.
        const premRow = (items) => ({ id: 'premium_past', name: 'Premium from the Past', subtitle: 'HBO, Showtime & premium-cable series', sort: 'downloads desc', items });
        try {
          let prem = await archive.search(archive.PREMIUM_QUERY, 24, 1, 'downloads desc');
          if (Array.isArray(prem) && prem.length >= 3) { lastGoodPremium = prem; cache.set(LASTGOOD_PREMIUM_KEY, prem, 86400).catch(() => {}); }
          else { prem = lastGoodPremium; }
          if (Array.isArray(prem) && prem.length >= 3) tiered = [premRow(prem), ...tiered];
        } catch (e) {
          if (Array.isArray(lastGoodPremium) && lastGoodPremium.length >= 3) tiered = [premRow(lastGoodPremium), ...tiered];
        }
        // Ideas & Lectures — the thinkers' lane (Vaknin, Žižek, Chomsky...). Live-fetched, so it
        // bypasses the talking-head filter that (rightly) keeps these OFF the entertainment rows.
        // Appended (trails the entertainment rows). Robust like Premium; CSA/kill still screened.
        const ideasRow = (items) => ({ id: 'ideas_lectures', name: 'Ideas & Lectures', subtitle: 'Big minds and talks: Vaknin, Žižek, Chomsky, and thinkers worth the time', sort: 'downloads desc', items });
        try {
          let idea = await archive.search(archive.IDEAS_QUERY, 24, 1, 'downloads desc');
          if (Array.isArray(idea) && idea.length >= 3) { lastGoodIdeas = idea; cache.set(LASTGOOD_IDEAS_KEY, idea, 86400).catch(() => {}); }
          else { idea = lastGoodIdeas; }
          if (Array.isArray(idea) && idea.length >= 3) tiered = [...tiered, ideasRow(idea)];
        } catch (e) {
          if (Array.isArray(lastGoodIdeas) && lastGoodIdeas.length >= 3) tiered = [...tiered, ideasRow(lastGoodIdeas)];
        }
      } else {
        tiered = base.filter((c) => c && wallIds.has(c.id));                          // the tight wall
        if (tiered.length < 5) tiered = base;                                         // guard: never blank the wall
        tiered = archive.applyWallRecencyFloor(tiered);                               // color-era floor
      }
      let out = archive.applyEraLean(tiered, gen); // always the VOID newest lean now (gen ignored inside)
      // MATURE-BY-TITLE CORRAL (B 2026-06-28): the wall drops mature CATEGORIES, but an adult-TITLED
      // upload can ride inside a SAFE category (an NSFW clip in the anime collection). Screen those
      // off the wall tier. The wall's cats are all non-mature and the gated 18+ view uses a different
      // path, so this never touches it. Corral not censor: items stay in search + behind the gate.
      if (tier === 'wall' || tier === 'modern') {
        for (const c of out) {
          if (!c || !Array.isArray(c.items)) continue;
          c.items = c.items.filter((it) => {
            const t = Array.isArray(it && it.title) ? it.title[0] : (it && it.title);
            return !(t && archive.MATURE_TITLE_RE.test(String(t)));
          });
        }
      }
      out = dedupeRows(out); // no cross-row repeats: a video shows in at most one row
      // THIN-WALL GUARD: never cache (server OR Cloudflare edge) a thin wall from a warm/blip; that
      // 20-min poisoning is what showed "2/4 rows". Serve the last full wall instead when thin.
      // One shared last-good bucket now (uniform lean): a thin request falls back to ANY client's
      // last full wall, not just one keyed to its own gen.
      if (tier === 'wall' && rowsWithItems(out) < WALL_MIN_ROWS) {
        let lg = lastGoodWall.all;
        // Cold-boot fallback: if in-memory last-good isn't populated yet (just restarted), pull the
        // persisted full wall from Redis so a warm-window request serves 11, not thin.
        if (!lg || rowsWithItems(lg) < WALL_MIN_ROWS) {
          try { const cached = await cache.get(LASTGOOD_WALL_KEY); if (cached && rowsWithItems(cached) > rowsWithItems(lg || [])) { lg = cached; lastGoodWall.all = cached; } } catch {}
        }
        res.set("Cache-Control", "no-store");
        res.set("X-Cache", "THIN");
        return res.json(await shape(lg && rowsWithItems(lg) > rowsWithItems(out) ? lg : out));
      }
      // Remember a healthy wall in memory AND Redis (so it survives the next restart, 1-day TTL).
      if (tier === 'wall') { lastGoodWall.all = out; cache.set(LASTGOOD_WALL_KEY, out, 86400).catch(() => {}); }
      if (gen && !shuffle && tier === 'wall') lastGoodCategories[gen] = out;
      if (!shuffle) cache.set(genKey, out, 1200);
      res.set("X-Cache", shuffle ? "BYPASS" : "MISS");
      if (shuffle) res.set("Cache-Control", "no-store"); // bypass CDN for shuffled results
      return res.json(await shape(out));
    }

    res.set("X-Cache", "EMPTY");
    res.set("Cache-Control", "no-store");
    res.json([]);
  } catch (err) {
    console.error("[/api/categories]", err);
    // SAFETY NET: never hard-fail the wall with {error} (that blanked it for users, B 2026-06-28).
    // Serve the last-good wall if we have one (memory, else persisted), else an empty array the
    // client tolerates by keeping its own cache. Always 200 + no-store so nothing caches the miss.
    // shape()/kids/matureOk are scoped inside the try, so we re-derive minimally here: fail CLOSED
    // for kids (empty), and drop mature inline for everyone else.
    res.set("Cache-Control", "no-store");
    if (req.query.kids === "1") { res.set("X-Cache", "ERROR-EMPTY"); return res.json([]); }
    try {
      let lg = lastGoodWall.all;
      if (!lg || rowsWithItems(lg) < WALL_MIN_ROWS) { const p = await cache.get(LASTGOOD_WALL_KEY); if (p && rowsWithItems(p) >= WALL_MIN_ROWS) lg = p; }
      if (Array.isArray(lg) && rowsWithItems(lg) > 0) { res.set("X-Cache", "ERROR-LASTGOOD"); return res.json(lg.filter((c) => c && !c.mature)); }
    } catch (e2) { console.error("[/api/categories] last-good fallback also failed:", e2.message); }
    res.set("X-Cache", "ERROR-EMPTY");
    res.json([]);
  }
});

/**
 * GET /api/category/:id
 * Returns items for a single category.
 * Supports pagination via ?page=N&rows=N
 */
app.get("/api/category/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const rows = Math.min(parseInt(req.query.rows) || 25, 50);
    const gen = parseGen(req.query.gen);   // generational era-lean (page 1 blend only)
    const cacheKey = `cat:${id}:${gen || 'none'}:${page}:${rows}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const result = await archive.getCategoryItems(id, rows, page, false, gen);
    if (result.error) return res.status(404).json(result);

    cache.set(cacheKey, result, 1200); // 20 min (was 1hr)
    res.set("X-Cache", "MISS");
    res.json(result);
  } catch (err) {
    console.error(`[/api/category/${req.params.id}]`, err);
    res.status(500).json({ error: "Failed to fetch category" });
  }
});

/**
 * GET /api/channel/queue?cats=horror,deep_creature,deep_vampire&rows=200&page=1
 * Builds a deep mixed queue from multiple categories for continuous channel playback.
 * Instead of relying on the shallow 15-items-per-category home cache, this fetches
 * 50+ items per category directly from Archive.org and mixes them round-robin.
 * Result: 200+ unique items per channel — hours of continuous viewing.
 */
app.get("/api/channel/queue", async (req, res) => {
  try {
    const catIds = (req.query.cats || "").split(",").filter(Boolean);
    if (catIds.length === 0) {
      return res.status(400).json({ error: "cats parameter required (comma-separated category IDs)" });
    }

    const totalRows = Math.min(parseInt(req.query.rows) || 200, 500);
    const page = parseInt(req.query.page) || 1;
    // Fetch enough per category so mixing produces totalRows items
    const rowsPerCat = Math.ceil(totalRows / catIds.length) + 10;

    // Time bucket gives variety on repeat visits (rotates every 30 min)
    const timeBucket = Math.floor(Date.now() / (30 * 60 * 1000));
    const cacheKey = `channel:${catIds.sort().join(",")}:${totalRows}:${page}:${timeBucket}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    // Fetch items from each category in parallel — shuffle=true for variety
    const results = await Promise.allSettled(
      catIds.map((catId) => archive.getCategoryItems(catId, rowsPerCat, page, true))
    );

    // Collect successful results
    const allCatItems = results
      .filter((r) => r.status === "fulfilled" && r.value && !r.value.error)
      .map((r) => r.value.items || []);

    // Mix items round-robin from all categories, deduped
    const seen = new Set();
    const mixed = [];
    const maxRounds = rowsPerCat;
    for (let round = 0; round < maxRounds && mixed.length < totalRows; round++) {
      for (const items of allCatItems) {
        const item = items[round];
        if (item && !seen.has(item.id)) {
          seen.add(item.id);
          mixed.push(item);
          if (mixed.length >= totalRows) break;
        }
      }
    }

    const result = { items: mixed, total: mixed.length, page, cats: catIds };
    cache.set(cacheKey, result, 1800); // 30 min cache
    res.set("X-Cache", "MISS");
    console.log(`[/api/channel/queue] ${catIds.length} cats → ${mixed.length} items (${totalRows} requested)`);
    res.json(result);
  } catch (err) {
    console.error("[/api/channel/queue]", err);
    res.status(500).json({ error: "Failed to build channel queue" });
  }
});

/**
 * GET /api/search?q=...&page=N&rows=N
 * Full-text search across the Archive, filtered to video.
 */
app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const categoryId = req.query.category;
    const collectionId = req.query.collection; // raw Archive.org collection (e.g. betty_boop_cartoons)
    const creatorQuery = req.query.creator;    // creator/studio name
    const hasQ = q.length >= 2;

    // Need at least a query, category, collection, or creator
    if (!hasQ && !categoryId && !collectionId && !creatorQuery) {
      return res.status(400).json({ error: "Query, category, collection, or creator required" });
    }

    const page = parseInt(req.query.page) || 1;
    const rows = Math.min(parseInt(req.query.rows) || 25, 50);
    const minDuration = parseInt(req.query.minDuration) || 0; // seconds
    const maxDuration = parseInt(req.query.maxDuration) || 0; // seconds, 0 = no max
    // Optional explicit sort (the "re-roll" button); whitelist-validated, else ignored. In the key
    // so each re-roll is its own cache entry instead of serving the previous sort's results.
    const reqSort = SEARCH_SORTS.has(req.query.sort) ? req.query.sort : null;
    // P4 (B: "stale search results"): a plain text query used a FIXED downloads-desc sort, so
    // searching "X" returned the identical top forever. Rotate the default sort over a 6h
    // bucket keyed by the query — stable within a session (pagination stays consistent),
    // fresh across time. Quality-biased sorts only (no recency/year, which surface fresh
    // junk); relevance is preserved because the query still constrains every result. Explicit
    // ?sort (re-roll) and category/collection/creator browsing keep their intended order.
    const SEARCH_ROT = ['downloads desc', 'week desc', 'month desc', 'avg_rating desc'];
    let qRotSort = null;
    if (!reqSort && hasQ && !categoryId && !collectionId && !creatorQuery) {
      const bucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
      let h = bucket >>> 0;
      for (const ch of q) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
      qRotSort = SEARCH_ROT[h % SEARCH_ROT.length];
    }
    const cacheKey = `search:${q}:${categoryId || ""}:${collectionId || ""}:${creatorQuery || ""}:${page}:${rows}:${minDuration}:${maxDuration}:${reqSort || qRotSort || ""}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    // Build Lucene query
    let lucene;
    if (collectionId) {
      // Raw collection browsing — "more from this show/series"
      lucene = hasQ ? `collection:(${collectionId}) AND (${q})` : `collection:(${collectionId})`;
    } else if (creatorQuery) {
      // Creator search — "more by this studio/director"
      lucene = hasQ ? `creator:(${JSON.stringify(creatorQuery)}) AND (${q})` : `creator:(${JSON.stringify(creatorQuery)})`;
    } else if (categoryId) {
      const cat = archive.CATEGORIES.find((c) => c.id === categoryId);
      if (!cat) return res.status(400).json({ error: "Unknown category" });
      // Strip the trailing mediatype clause from the category's query — we add it once at the end
      const catFilter = cat.query.replace(/\s*AND\s*mediatype:\([^)]+\)/i, "").trim();
      lucene = hasQ ? `(${catFilter}) AND (${q})` : `(${catFilter})`;
    } else {
      lucene = `(${q})`;
    }
    // Append NSFW exclusion unless the user explicitly opted into mature content
    const mature = req.query.mature === "true";
    const nsfwFilter = mature ? "" : " " + archive.NSFW_EXCLUDE;
    // Duration filter — Archive.org `runtime` is in seconds (as a string number)
    let durationFilter = "";
    if (minDuration > 0 && maxDuration > 0) {
      durationFilter = ` AND runtime:[${minDuration} TO ${maxDuration}]`;
    } else if (minDuration > 0) {
      durationFilter = ` AND runtime:[${minDuration} TO 999999]`;
    } else if (maxDuration > 0) {
      durationFilter = ` AND runtime:[0 TO ${maxDuration}]`;
    }
    const searchQuery = `${lucene} AND mediatype:(movies)${nsfwFilter}${durationFilter}`;

    // Determine sort order: an explicit ?sort (re-roll) wins; else collection/creator → downloads,
    // category may override, else the search() default (downloads desc) for a plain query.
    let sortOrder = reqSort || undefined;
    if (!sortOrder && (collectionId || creatorQuery)) {
      sortOrder = 'downloads desc';
    } else if (!sortOrder && categoryId) {
      const cat = archive.CATEGORIES.find((c) => c.id === categoryId);
      sortOrder = cat?.sort || 'downloads desc';
    } else if (!sortOrder && qRotSort) {
      sortOrder = qRotSort; // P4 rotated default for plain text queries
    }

    const items = await archive.search(searchQuery, rows, page, sortOrder);
    const result = { query: q, category: categoryId || null, collection: collectionId || null, creator: creatorQuery || null, page, rows, items };

    if (items.length) cache.set(cacheKey, result, 1800); // 30 min (never cache an empty blip)
    res.set("X-Cache", "MISS");
    res.json(result);
  } catch (err) {
    console.error(`[/api/search]`, err);
    res.status(500).json({ error: "Search failed" });
  }
});

/**
 * GET /api/shorts
 * Short-form content — videos under 2 minutes from the Archive.
 * YouTube Shorts equivalent for public domain clips, trailers, newsreels.
 */
app.get("/api/shorts", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const timeBucket = Math.floor(Date.now() / (30 * 60 * 1000)); // 30min rotation
    const cacheKey = `shorts:${limit}:${timeBucket}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    // Void Snacks — short-BY-NATURE pools (vintage TV commercials / movie trailers / newsreels)
    // with a REAL duration filter on the parsed runtime. The old `runtime:[1 TO 120]` range was a
    // broken LEXICAL compare on Archive's display-string runtime — it let ~10-min films through
    // and dropped genuine <2-min clips (BUILD_PLAN §9).
    const SNACK_MAX_SEC = 180;
    // Most pool items ship with NO runtime metadata, so title heuristics carry real weight:
    // the pools contain hour-long COMPILATION tapes ("...Commercial Collection", "Bumpers"),
    // full movies mislabeled as trailers, and multi-part episodes — none of which are snacks.
    const COMPILATION_RE = /compilation|collection|complete|full[ -](movie|film|show|episode)|marathon|season|episodes?\b|\b\d+\s*-?\s*parter\b|bumpers|supercut|mixtape|hours? of|w\/o\/c|original commercials|aircheck|off[- ]air|broadcast|recording|commercial breaks|all trailers/i;
    // Adult-BRAND + marker screen (P2: "Playboy TV Promo" slipped onto the ungated wall via
    // the commercials pool's \bpromo\b keep — the old generic-word regex missed brand names).
    // Shared corral screen; items stay findable in search + behind the 18+ gate.
    const NSFW_TITLE_RE = archive.MATURE_TITLE_RE;
    // 1980 FLOOR (B 2026-06-15: "1980s as oldest", to keep Snacks from feeling like all old shit).
    // The two MAIN pools are year-clause-bound >=1980 (4-digit years compare correctly even as
    // strings; items missing `year` drop out of the mains, intended). The pre-1968 Universal-
    // Newsreel "vintage garnish" pool was removed for the same reason.
    const SNACK_POOLS = [
      { // TV commercials — the collection ALSO hosts full taped broadcasts ("Raiders... W/O/C")
        // and compilation tapes. Singles say "Commercial" (SINGULAR); compilations say
        // "Commercials" — require the positive single-ad signal.
        q: 'collection:(classic_tv_commercials) AND mediatype:(movies) AND year:[1980 TO 9999]', pages: 12,
        keep: (t) => /\bcommercial\b|\bspot\b|\bpsa\b|public service|\bpromo\b|jingle|\bad\b/i.test(t)
          && !/commercials\b/i.test(t) && !COMPILATION_RE.test(t),
      },
      { // movie trailers — full films get uploaded here mislabeled; require trailer-ish title
        q: 'collection:(movie_trailers) AND mediatype:(movies) AND year:[1980 TO 9999]', pages: 40,
        keep: (t) => /trailer|teaser|preview|tv spot/i.test(t) && !COMPILATION_RE.test(t),
      },
    ];
    const SNACK_SORTS = ['downloads desc', 'addeddate desc', 'week desc'];
    const pools = await Promise.all(SNACK_POOLS.map((pool, i) => {
      const page = Math.floor(Math.random() * pool.pages) + 1;
      const sort = SNACK_SORTS[(timeBucket + i) % SNACK_SORTS.length];
      return archive.search(pool.q + archive.NSFW_EXCLUDE, limit * 2, page, sort)
        .then((rows) => rows.filter((it) => {
          const title = String((it && it.title) || '');
          return pool.keep(title) && !NSFW_TITLE_RE.test(title);
        }))
        .catch(() => []);
    }));
    // Round-robin interleave so neither pool (1980+ ads / trailers) dominates the row.
    const merged = [];
    const maxLen = Math.max(...pools.map((p) => p.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const p of pools) if (p[i]) merged.push(p[i]);
    }
    // Keep true shorts: parsed runtime ≤ 3 min. Unknown runtime is KEPT — these pools are short
    // by nature (post title-filtering), and commercials often ship without runtime metadata.
    const fit = merged.filter((it) => {
      const sec = archive.parseRuntimeSeconds(it && it.runtime);
      return sec == null || (sec > 0 && sec <= SNACK_MAX_SEC);
    });
    const items = archive.diversify(fit, 2).slice(0, limit);

    if (items.length) cache.set(cacheKey, items, 1800); // 30 min cache (never cache an empty blip)
    res.set("X-Cache", "MISS");
    res.json(items);
  } catch (err) {
    console.error("[/api/shorts]", err);
    res.status(500).json({ error: "Failed to fetch shorts" });
  }
});

/**
 * GET /api/item/:identifier
 * Full item details including resolved video URL.
 * This is the expensive call — hits the Archive metadata API
 * to find the best MP4 stream URL.
 */
app.get("/api/item/:identifier", async (req, res) => {
  try {
    const { identifier } = req.params;
    const cacheKey = `item:${identifier}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const item = await archive.getItem(identifier);
    // Fallbacks (metadata fetch flaked) heal in 60s; real metadata is static, 6h.
    cache.set(cacheKey, item, item.fallback ? 60 : 21600);
    // THE HUNT FEEDS THE CATALOG: every successfully opened item gets pooled + grouped in
    // the spine (fire-and-forget). Opening is the curation signal — raw search results are
    // never ingested wholesale.
    if (process.env.SPINE_URL && !item.fallback && item.videoUrl) {
      fetch(`${process.env.SPINE_URL}/catalog/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-spine-key": process.env.SPINE_ADMIN_KEY || (() => { throw new Error("SPINE_ADMIN_KEY is not set"); })() },
        body: JSON.stringify({ item: {
          id: item.id, title: item.title, description: item.description, year: item.year,
          creator: item.creator, downloads: item.downloads, runtime: item.duration, subjects: item.subjects,
        } }),
      }).catch(() => {});
    }
    res.set("X-Cache", "MISS");
    res.json(item);
  } catch (err) {
    console.error(`[/api/item/${req.params.identifier}]`, err);
    res.status(500).json({ error: "Failed to fetch item" });
  }
});

/**
 * GET /api/item/:identifier/series — player rail "more of this show": the verified series
 * this item belongs to (spine grouping, conf >= 0.85) plus its episodes in broadcast order.
 * { series: null } when unknown or the spine is down — the rail simply doesn't render.
 */
app.get("/api/item/:identifier/series", async (req, res) => {
  try {
    const { identifier } = req.params;
    const cacheKey = `itemseries:${identifier}`;
    const cached = await cache.get(cacheKey);
    if (cached) { res.set("X-Cache", "HIT"); return res.json(cached); }
    let data = { series: null };
    if (process.env.SPINE_URL) {
      const r = await fetch(`${process.env.SPINE_URL}/catalog/item/${encodeURIComponent(identifier)}/series`);
      if (r.ok) data = await r.json();
    }
    cache.set(cacheKey, data, 3600); // 1h — grouping changes at sync cadence
    res.set("X-Cache", "MISS");
    res.json(data);
  } catch (err) {
    res.json({ series: null }); // rail is optional; never break the player
  }
});

/**
 * GET /api/related/:identifier
 * Rabbit hole — items adjacent to the one the user just watched.
 * Uses the item's subjects + collection to surface similar-but-different content.
 */
app.get("/api/related/:identifier", async (req, res) => {
  try {
    const { identifier } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 15, 30);
    const cacheKey = `related:${identifier}:${limit}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const items = await archive.getRelated(identifier, limit);
    cache.set(cacheKey, items, 3600); // 1 hour
    res.set("X-Cache", "MISS");
    res.json(items);
  } catch (err) {
    console.error(`[/api/related/${req.params.identifier}]`, err);
    res.status(500).json({ error: "Failed to find related items" });
  }
});

/**
 * GET /api/random
 * Random pick from a random category.
 */
app.get("/api/random", async (req, res) => {
  try {
    const cats = archive.CATEGORIES.filter((c) => !c.mature);
    const cat = cats[Math.floor(Math.random() * cats.length)];
    const page = Math.floor(Math.random() * 5) + 1;
    const items = await archive.search(cat.query, 20, page);

    if (items.length === 0) {
      return res.status(404).json({ error: "No results" });
    }

    const pick = items[Math.floor(Math.random() * items.length)];
    // Resolve the video URL for the random pick
    const full = await archive.getItem(pick.id);
    res.json(full);
  } catch (err) {
    console.error("[/api/random]", err);
    res.status(500).json({ error: "Failed to get random item" });
  }
});

/**
 * GET /api/cache/stats
 * Debug endpoint — cache health check.
 */
app.get("/api/cache/stats", (req, res) => {
  res.json(cache.stats());
});

// ── Hearts ─────────────────────────────────────────────────

/** POST /api/hearts/:id  — body: { title, thumbnail, creator?, year? } */
app.post("/api/hearts/:id", (req, res) => {
  const { id } = req.params;
  const item = { id, ...req.body };
  const result = hearts.heart(item);
  res.json(result || { error: "Invalid id" });
});

/** DELETE /api/hearts/:id — decrement count */
app.delete("/api/hearts/:id", (req, res) => {
  const result = hearts.unheart(req.params.id);
  res.json(result || { ok: true });
});

/** GET /api/hearts/top?limit=N — community library */
app.get("/api/hearts/top", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  res.json(hearts.getTop(limit));
});

/** GET /api/hearts/count/:id — heart count for a single item */
app.get("/api/hearts/count/:id", (req, res) => {
  res.json({ id: req.params.id, hearts: hearts.getCount(req.params.id) });
});

// ── Views ─────────────────────────────────────────────────

/** POST /api/views/:id — record a view (fire from player on load) */
app.post("/api/views/:id", (req, res) => {
  const count = views.recordView(req.params.id, req.body);
  res.json({ id: req.params.id, views: count });
});

/** GET /api/views/:id — get view count */
app.get("/api/views/count/:id", (req, res) => {
  res.json({ id: req.params.id, views: views.getCount(req.params.id) });
});

/** GET /api/views/top — most-viewed on Void Channel */
app.get("/api/views/top", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  res.json(views.getTop(limit));
});

/** GET /api/views/stats — total views across all items */
app.get("/api/views/stats", (req, res) => {
  res.json({ totalViews: views.getTotalViews() });
});

// ── Health Check ───────────────────────────────────────────

// Health now reports SPINE REACHABILITY (P8): the spine dying silently blanked the whole
// wall + search because spineGet degrades to empty with no signal. A 1.5s ping surfaces it
// so monitoring (and the loop/babysit flows) catch a dead spine immediately instead of via
// a blank wall. degraded=true when a configured spine is unreachable.
app.get("/health", async (req, res) => {
  let spine = null;
  if (process.env.SPINE_URL) {
    spine = "down";
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch(`${process.env.SPINE_URL}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) spine = "up";
    } catch (e) { spine = "down"; }
  }
  res.json({ status: "ok", uptime: process.uptime(), spine, degraded: spine === "down" });
});

// THE LIBRARY (slice 11): instant filtered browse over the Spine pools. When the Spine is
// not wired (prod before cutover), reply with a fallback flag so the client quietly uses
// the live composed search instead — clunkier but never broken.
app.get("/api/library", async (req, res) => {
  const spineUrl = process.env.SPINE_URL;
  if (!spineUrl) return res.json({ fallback: "live", total: 0, items: [] });
  try {
    const qs = new URLSearchParams(req.query).toString();
    const r = await fetch(`${spineUrl.replace(/\/$/, "")}/library?${qs}`);
    if (!r.ok) throw new Error(`spine ${r.status}`);
    res.json(await r.json());
  } catch (err) {
    console.warn("[/api/library]", err.message);
    res.json({ fallback: "live", total: 0, items: [] });
  }
});

// THE CATALOG (slice 12): movies/series destinations, same Spine proxy + fallback shape.
app.get("/api/catalog/*", async (req, res) => {
  const spineUrl = process.env.SPINE_URL;
  if (!spineUrl) return res.json({ fallback: "live", total: 0, items: [] });
  try {
    const path = req.path.replace(/^\/api/, "");
    const qs = new URLSearchParams(req.query).toString();
    const r = await fetch(`${spineUrl.replace(/\/$/, "")}${path}${qs ? "?" + qs : ""}`);
    if (!r.ok) throw new Error(`spine ${r.status}`);
    res.json(await r.json());
  } catch (err) {
    console.warn("[/api/catalog]", err.message);
    res.json({ fallback: "live", total: 0, items: [] });
  }
});

// JOB_19 version handshake: the value changes on every deploy/restart, the client polls it
// and offers "new version, tap to refresh" — killing the stale-bundle bug class for users.
const SERVER_VERSION = `${require("./package.json").version}+${Date.now()}`;
app.get("/api/version", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ version: SERVER_VERSION });
});

// ── Self-warming category cache ──────────────────────────────
// Cloudflare has a hard 100s origin timeout. Fetching all 78 categories
// from Archive.org takes >100s on a cold cache → 524 error. The cache
// can never re-warm through user requests once Cloudflare is in front.
// Fix: pre-warm on startup and every 15 min so user requests always hit cache.

async function warmCategories() {
  const bucketMs = 20 * 60 * 1000;
  const currentBucket = Math.floor(Date.now() / bucketMs);
  const nextBucket = currentBucket + 1;

  // Only the GEN-AGNOSTIC base payload is heavy, so that's all we warm (current + next bucket). The
  // per-generation era-lean is a cheap in-memory reorder of this base at request time (see the
  // /api/categories route), so it never needs its own warm or Archive fetch.
  for (const bucket of [currentBucket, nextBucket]) {
    const cacheKey = `all_categories:none:${bucket}`;
    const existing = await cache.get(cacheKey);
    if (existing) {
      console.log(`  ✓ Cache warm: ${cacheKey} (${existing.length} cats)`);
      continue;
    }
    console.log(`  → Warming: ${cacheKey} (fetching from Archive.org)...`);
    try {
      const categories = await archive.getAllCategories(15, false); // gen-agnostic base
      if (categoriesHaveContent(categories)) {
        lastGoodCategories['none'] = categories;
        cache.set(cacheKey, categories, 1200);
        console.log(`  ✓ Warmed: ${categories.length} categories cached`);
      } else {
        // Archive throttled/errored — do NOT poison the cache with empty content.
        console.warn(`  ⚠ Warm skipped: Archive returned sparse content, keeping previous cache`);
      }
    } catch (err) {
      console.error(`  ✗ Warm failed: ${err.message}`);
    }
  }
}

// ── Start ──────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`\n  ⚡ VOID CHANNEL PROXY`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Cache TTL: categories=20m, items=6h, search=30m`);
  console.log(`  → Self-warming: every 15 min (current + next bucket)\n`);

  // Warm category cache on startup (runs in background, doesn't block server start)
  warmCategories();
  // Re-warm every 15 minutes — pre-fetches both current and next time bucket
  // so the cache is never cold when a user request arrives
  setInterval(warmCategories, 15 * 60 * 1000);

  // Warm the KIDS channels off the request path (P1/P5): the cold build resolves ~240 tapes
  // and used to run synchronously on the first kid's request (150s+ blank wall). Doing it at
  // boot + every 10m means a kid always meets a pre-resolved wall. Staggered after categories.
  setTimeout(() => { buildKidsSatChannels().then(() => console.log(`  ✓ kids channels warmed: ${_kidsSat.cats.length}`)).catch(() => {}); kidsPicksCategory().catch(() => {}); }, 3000);
  setInterval(() => { buildKidsSatChannels().catch(() => {}); }, 10 * 60 * 1000);

  // Backfill usernames for profiles that have none (one-time on startup)
  try {
    const { supabase } = require("./supabase");
    if (supabase) {
      const { data: nullProfiles } = await supabase
        .from("profiles")
        .select("id")
        .is("username", null)
        .limit(500);
      if (nullProfiles && nullProfiles.length > 0) {
        let patched = 0;
        for (const p of nullProfiles) {
          const clean = p.id.replace(/-/g, '');
          const username = 'void_' + clean.slice(0, 8);
          const { error } = await supabase
            .from("profiles")
            .update({ username })
            .eq("id", p.id)
            .is("username", null); // guard: only if still null
          if (!error) patched++;
        }
        if (patched > 0) console.log(`  → Backfilled ${patched} profile usernames`);
      }
    }
  } catch (err) {
    // Non-fatal — backfill is best-effort
    console.warn("  → Username backfill skipped:", err.message);
  }
});

module.exports = app;
