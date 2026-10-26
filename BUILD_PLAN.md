# VOIDtv — Build Plan / Session Handoff

> **READ ORDER FOR NEW SESSIONS:** strategy and build order live in
> **[THE_VOID_BUILD_PLAN.md](THE_VOID_BUILD_PLAN.md)** (v1.1, the single source of truth for
> the four-mode expansion: Watch/Listen/Play/Read, the Archive Spine, JOBs 0-12). THIS file is
> the **Void Channel operational log**: deploy gotchas, content-treatment rules, shipped-session
> history. Read the strategy plan first, then this, then `/docs/handoffs/`. Shipped work
> recorded here OUTRANKS the strategy plan where they conflict (its §10 says the same).

> Self-contained handoff for a fresh session. The app is **live in production** and all work
> below is **pushed to `master`** (which auto-deploys). Last commit at handoff: **`7a41f75`**.
> **Latest work: see [§17 — Session 2026-06-28/29](#17-session-2026-06-2829--filters-signal-removal-csa-block-wall-render-fix-up-next-era-lean) (newest, read first).**

---

## 17. SESSION 2026-06-28/29 — filters, signal removal, CSA block, wall-render fix, UP NEXT era-lean

All pushed to `master` (auto-deployed). Commit range this session: `…1e644a7 → 7a41f75`. MD5 lock
relocked after every commit. The big through-line: a long fight with "the wall keeps going
empty / only N rows," which turned out to be **several distinct causes**, all now fixed.

### What shipped (grouped)

**A. Curated-surface junk/quality filters** (`backend/archive.js`; wall rows + related rail only — SEARCH STAYS RAW)
- `JUNK_TITLE_RE` extended: "<name> videos" personal dumps, bare spam-domains, `Ending/Opening/Closing/End Credits` fragments, wrapped `*Prototype*` dumps. `dropJunk` now runs on ALL wall rows (was downloads-sorted only).
- `BROADCAST_TITLE_RE` extended: month-name ranges (`Feb23-March 3 2026`) + numeric `D/M/Y`/`M/D/Y` (livestream/WoE captures).
- `dropLiveStreams` (new): drops bare-`LIVE` streams (livestream/`LIVE NOW`/🔴, creator channels ending caps `LIVE`) but KEEPS music/concert context (`Live at`, `(Live)`, `Metallica LIVE`, Music City, etc.).
- `cleanRail` (new) = the full junk chain; now applied to the related/autoplay rail (`getRelated`), which previously only screened `!`-junk.

**B. SIGNAL MECHANICS REMOVED → one "VOID" identity** (B: "remove the entire signal mechanics and lean newer in all as default, the rest is searchable in void hunting")
- `mobile/src/data/generations.js`: collapsed boomer/millennial/genz → a single `VOID` profile (amber, capitalized voice, newest-leaning `categoryPriority`, merged vibe labels). The 3 old keys alias VOID.
- `backend/archive.js`: added `GENERATION_ERAS.void` (newest-first, year-desc 2008-2025, floor 1970); `applyEraLean` ALWAYS uses void regardless of `gen`.
- `backend/server.js`: `'void'` allowed in `VALID_GENS`; always lean; collapsed per-gen processed-wall cache to ONE key per tier (`all_categories:all:<tier>:<bucket>`) + one shared `lastGoodWall.all`.
- Picker UI removed from `DrawerMenu.js` + `SignalScreen.js` (the Signal *community tab* stays). `GenerationContext` no longer restores a legacy stored gen (migrates it to `void`) — that restore was flipping the wall onto a stale per-gen cache after first paint.
- Dead-ref cleanup + em-dash scrub of comments. (Memory `voidtv-generational-era-lean` marked SUPERSEDED.)

**C. CSA / child-exploitation HARD BLOCK** (`backend/archive.js`, B flagged `børneporno` + `Viols d'Enfants` on the wall)
- `CSA_BLOCK_RE` + `isCSATitle`, folded into `dropExcluded` → drops on EVERY surface INCLUDING search (unlike junk filters) + `getItem` direct links. Legal/safety line, the deliberate EXCEPTION to the rights-posture (memory updated). High-precision terms; verified it doesn't touch legit child/kids content.

**D. Wall resilience / the "empty wall" saga** (the recurring pain)
- `eab83ae` client: refetch immediately when the CACHED wall is thin (don't wait out the 10-min staleness window).
- `ac4c828` backend: persist last-good wall to Redis + restore on boot → a freshly-restarted server serves the full wall instantly (kills the deploy warm-window thin wall). Cold-boot fallback in the thin-guard reads it.
- `a8ba131` backend: harden `/api/categories` so a fetch throw degrades to last-good instead of returning `{error}` (that `{error}` was a real outage — wall blanked).
- `75a196f` client: stop restoring the legacy stored generation (the "rows show on load then disappear" cache-flip).
- `034df9d` client: **the actual "rows missing" bug** — the wall `FlatList` kept `initialNumToRender=5/windowSize=7` from the ~80-row era; on the tight ~10-row wall the full-height hero ate the window and off-screen rows collapsed to 0 height (couldn't scroll to them) → only ~4 of 10 rendered. Now renders all rows up front (`initialNumToRender=30`, `windowSize=31`, `removeClippedSubviews={false}`). **Diagnosed via live DOM inspection through the Chrome extension** (cache had 10, DOM had 4).

**E. Wall composition** — removed `music_video` (Music Videos & Concerts) from `WALL_IDS` (still searchable + in the Vault). Wall is now 10 rows.

**F. UP NEXT / autoplay era-lean** (`getRelated`, B: an 80s trailer's "next" was 1900s-1920s silent films; then "can we not have the same era as playing?")
- `dropOld(items, baseYear)`: recency floor RELATIVE to the watched item's year (`baseYear - 15`); newer always fine; unknown item-year → absolute 1965 fallback. So '85 item → ~1970+, 2010 → ~1995+, a genuinely-old 1955 item still gets its own era.

**G. No-em-dash sweep** — scrubbed AI-slop-tell em dashes from user-facing copy (30 `archive.js` subtitle/name values + donate/share/hint/Archivist/admin/auth/Archivist-reply strings). Left placeholders (`'—'`), ` — VOIDtv` title separators, code comments, server logs.

### Open / pending (Bryan's call — NOT done)
- **Render Build Filter** (his dashboard): set Ignored Paths `mobile/**`, `docs/**` so frontend/doc pushes stop restarting the API (the warm-window root cause). The persist-wall fix mitigates it; the Build Filter eliminates it.
- **Graphic-death footage** (e.g. `R. Budd Dwyer Suicide`) — block? Separate category from CSA, his call.
- **Widen the mature corral** — ecchi/adult leaked onto the wall (`Sexy Cosplay Doll`, `Pink Detectives Aphrodisiac`, incubus/succubus); `MATURE_TITLE_RE` misses these. The server.js wall-tier mature-title screen exists (`tier==='wall'`) but the regex needs widening.
- **UP NEXT window** — currently ±0 newer cap, 15-yr lookback; tighten to same-decade or cap newer if wanted; exempt same-collection tier for old-series continuity if wanted.
- **Supabase Anonymous Sign-Ins** still OFF (pre-existing, §2).

## 18. SESSION 2026-06-28/29 (cont.) — Modern as DEFAULT, de-gate, After Dark, Ideas, promote-prep

Big arc: VOIDtv reoriented from "weird-old-TV wall" into a **modern shows & movies app by default**,
with the weird/adult/deep content moved into clearly-labeled lanes. Commit range `…3013c71 → 3759340`.

### The new shape (what a visitor gets)
- **Entry disclaimer** (`VoidIntro.js`): the humanity-window / 18+ notice, "ENTER THE VOID". Entering = acknowledgment.
- **MODERN is the DEFAULT** (`ModernModeContext`, defaults on; `@void_mode`); **Void** is the opt-in drawer toggle. Modern wall = `tier=modern`: curated genre rows (`MODERN_IDS` + `MODERN_LABELS`: Movies, Sitcoms, Cartoons, Anime, Comedy, Documentaries), **recency floor 1985**, clean names.
- **Premium from the Past** row pinned on top (`PREMIUM_QUERY`, live-fetched, **robust** via `lastGoodPremium` + Redis so it never blinks out).
- **Ideas & Lectures** row appended (`IDEAS_QUERY`: Vaknin/Žižek/Chomsky/Watts/etc.) — the thinkers' lane, live-fetched so it bypasses the talking-head filter, robust like Premium.
- **After Dark** = drawer door → one-time 18+ confirm (no PIN/account) → `SectionScreen` `tier=adult` (needs `adult=1`; `matureOk` now accepts it). Titled **"Porn Through the Ages"**: era journey (Stag Era → Burlesque & Pin-Up → Nudie Cuties → Sexploitation → Adult Films → Erotica & Art) via `ADULT_ROWS`, de-flooded (`diversify`). The "3rd lane" (B): human sexuality as record; **legitimate adult media incl. hardcore stays**, NOT sliced by act; off the commercial wall.
- **The Stacks** (`tier=vault`): relabeled "THE STACKS · DEEP ARCHIVE" + an on-page explainer (SectionScreen `subtitle`). Kept separate from the wall by design (lean front vs full archive).
- **Hero** is now SCORED (`pickHero`): marquee genre + has-art + popularity + real title, rotates among the top 8 (was random → kept landing on conspiracy/obscure).

### Filtering this session (curated wall only; SEARCH stays raw)
- **No cross-row repeats** (`dedupeRows` in server.js): a video shows in at most one row.
- **No news / no streaming-bs** (`NEWS_NOISE_RE`): broadcast news, network brands, livestream/VOD/twitch/subathon.
- **No talking-head** (`TALKINGHEAD_RE`, title+creator): Vaknin/GigaohmBiological lectures, "information brief", "[video version]" podcasts, Comedy Bang Bang — OFF entertainment rows but KEPT in search + the Ideas row.
- **Void Snacks removed** from the wall.
- **CSA block tightened**: added `child molest*` (caught "The Child Molester (1964)").
- **Mature corral widened then TRIMMED** per B's no-hedge rule: dropped `incubus`/`succubus`/`fanservice` (were hiding legit films like the 1966 Incubus); kept genuinely-explicit terms.

### Removed
- **VOIDtv KIDS** (drawer entry; not a kids platform). **The Archivist** (FAB removed; component+backend dead-but-harmless). The old PIN/members 18+ gate (replaced by the disclaimer + 18+ confirm).

### Posture locked (memory: voidtv-rights-posture)
NO copyright/rights filtering (no ripped/branded filter). The ONLY gates: **CSA** + **hate/extremist** (B's two lines) + his kill list + mature behind the After Dark door + the quality/junk + no-news cuts. "Humanity window, won't limit out of hedging fear." Verified there's no copyright filter; the piracy-SPAM markers in JUNK_TITLE_RE (iptv/crack/keygen/etc.) remain and B can pull them if he wants.

### OPEN / pending
- **Render Build Filter** (B's dashboard, Ignored Paths `mobile/**` + `docs/**`): THE remaining blocker — Render auto-deploy lags badly all session, so backend changes take 10-18 min or need a Manual Deploy. This is now the #1 promote item.
- **Social/OG meta cards** — none exist; a shared voidtv.net link previews bare. Needs the proper Expo-web (SDK54, metro single-output) head mechanism — a clean pass, not a guess. Promote-nice-to-have.
- **Mobile once-over**; **graphic-death** (Dwyer) block is still B's call; Supabase anon sign-ins now largely moot (Archivist gone).

## 0. What VOIDtv is
A discovery-first front-end for the **Internet Archive's** public-domain video, styled as
channel-surfing weird old TV. Tagline: *"before AI slop, there was human creativity."* Operated
by **Church of American Strength & Hope** (501c3), donation-supported. React Native / Expo SDK 54
(web + mobile). The vibe is **analog static / "the void"** — content materializes out of TV static.

---

## 1. Where things live / how to deploy
- **Project root:** `C:\Users\bryan\Downloads\void-channel-extracted\void-channel`
- **Backend** (`backend/`, Express): deploys to **Render** → `https://api.voidtv.net`
- **Frontend** (`mobile/`, Expo web): deploys to **Vercel** → `voidtv.net` (308-redirects to `www.voidtv.net`)
- **GitHub:** `github.com/bryankorth31/void-channel`, branch **`master`**. **Push to master = auto-deploy** (Vercel + Render).
- **Dev:** backend `cd backend && node server.js` (port 3001); web `cd mobile && npx expo start --web` (port 8081).
- **Verify a build compiles** before pushing: `curl -s "http://localhost:8081/index.bundle?platform=web&dev=true" | head -c 40` → should start `var __BUNDLE_START_TIME__`. (The **Claude Preview tool is unreliable** with this RN-Web app — DPR quirk renders ~577px logical regardless of viewport, can't show desktop layout >900px, and hangs on external navigation. Verify via Metro bundle + curl + the live site instead.)

## 2. Config / accounts / secrets (all set unless noted)
- **Supabase project:** `sawuxdquewomjrgtmgtb`. ⚠️ **PENDING USER ACTION:** *Anonymous Sign-Ins* must be enabled (Authentication → Providers / Settings). It's currently **off**, which (a) blocks anonymous users from the Archivist (it requires a session) and (b) caused the recurring `/api/auth/refresh 401` nag.
- **`backend/.env`** (gitignored): `ANTHROPIC_API_KEY` ✅, `SUPABASE_URL/SERVICE_KEY/ANON_KEY` ✅, `UPSTASH_REDIS_REST_URL/TOKEN` ✅ (durable cache active). Also set the same on **Render → Environment**.
- **Archivist model:** `claude-haiku-4-5-20251001` (default in `archivist.js`; `claude-3-5-haiku-latest` is retired).
- **Admin emails** (`backend/admin.js` ADMIN_EMAILS): `bryankorth31@gmail.com`, `preacherb@cashvalues.org` → unlimited Archivist via `isAdmin()`. **Must be signed in with that email** for it to apply.
- **DONATE_URL:** `https://square.link/u/dJioBmlW`
- **SQL already run** in Supabase (`backend/schema-archivist.sql`): `archivist_usage`, `profiles.supporter_until`, `profiles.archivist_credits`.

## 3. The void stream — RE-EXPORTED + WIRED (was the biggest pending action)
✅ **DONE by user:** the void stream is re-encoded and split into two renditions, both in
`backend/public/static/`:
- **`void-stream.mp4`** = the **lo** rendition (now **14 MB**, down from the 67 MB HEVC) — used by the loaders.
- **`void-stream-hi.mp4`** = the **hi** rendition (**35 MB**) — used by the intro on desktop.
  *(Was uploaded as `void-stream-hi..mp4` — double-dot typo — now renamed.)*
- The 4 random AI dissolve clips are retired to `public/static/_disabled/` — loaders no longer use them.

✅ **DONE (wiring, this session):**
- `VoidLoader.js` → `getRandomClip()` now returns the single `/static/void-stream.mp4` (the lo) for
  ALL loaders. No random pick, no seek (respects the ~8-second scene cuts); per-instance brightness
  keeps the "wall of TVs" look; 404 → graceful fallback to the pulsing VOID.
- `VoidIntro.js` → plays `void-stream-hi.mp4` when `window.innerWidth > 900` (desktop showcase),
  else `void-stream.mp4` (mobile). First tap unmutes — this is where the audio edit comes alive.

**⚠️ STILL VERIFY:** that the re-encodes are actually **H.264 + fast-start** (the old file was H.265/HEVC,
which Chrome/Firefox can't play → would fall back to the pulse). Check top atoms `ftyp … moov …` (good)
vs `ftyp … mdat …` (bad). And these assets must be **committed** so Render serves them in prod.

**Still TODO:** the **Now Playing channels** (§2) can reuse the same stream once built.

---

## 4. Queued features (user said "yes")
1. ✅ **Audio intro** — `mobile/src/components/VoidIntro.js`, mounted in `App.js` after `<Navigation/>`.
   Once-per-session full-screen "▶ TAP TO ENTER THE VOID"; first tap unmutes the stream (audio gesture)
   and fades into the app. **DONE & deployed.** (Toggle to first-visit-only via localStorage if it feels heavy.)
2. ⬜ **"Now Playing" channels** — the *honest* Prime-style "Live TV picks / ON NOW + progress" row.
   Each channel card shows the item currently "on" + a progress bar; tap = tune in to that channel's queue.
   NOT a fake "LIVE" badge — make it a real synchronized/continuous channel (position derived from time so
   everyone's in sync, OR just "tune in" with progress becoming real once watching). Reuse the existing
   `channelDefs` + `handleChannelPress` (still in `HomeScreen.js` as now-dead code after the LIVE row was removed).
3. ⬜ **Founding-member tier** — **voluntary** $5/yr membership (NOT a hard paywall — decided; cleaner for a
   501c3 + better reach). 7-day trial via a new `profiles.trial_ends_at`; `supporter_until` already = membership.
   Soft "become a founding member" nudge after trial (not a wall). Perks: bigger Archivist allowance + Hall of Fame +
   flair. **Hard part = donation→`supporter_until` attribution** (Square webhook + a reference carrying the user id,
   or a redeem-code flow). Run the final donation-vs-fee shape past the church's accountant.
4. ⬜ **Rating / quality-weighting system** — explicit ratings to weight videos *correctly* (today we only have
   passive views + binary hearts). Theme it as **"SIGNAL STRENGTH" (1–5 bars)** to fit the analog/void aesthetic.
   - **Backend:** `ratings(user_id, item_id, value SMALLINT 1-5, created_at)` table (one row per user/item, upsert).
     Aggregate avg + count per item. Endpoints: `POST /api/ratings/:id` (set/update), `GET /api/ratings/:id` (avg+count+mine).
   - **Weight it correctly (the key):** use a **Bayesian average** = `(C*m + sum) / (C + count)` where `m` = global
     mean rating, `C` ≈ 10 (confidence). Stops a single 5★ from outranking a well-reviewed 4★. This is THE thing
     that makes weighting honest.
   - **Composite rank score:** blend the Bayesian rating (quality) + views (popularity) + hearts (love) + recency →
     one score that powers a **"Top Rated"** row, recommendations, search ranking, and demoting junk. This is the
     "better system" foundation — once ratings exist, recs/ranking get dramatically better.
   - **Frontend:** a signal-bars rate control on `PlayerScreen`; show the score on cards (`MediaCard`) + player.
     +XP for rating (ties into `GameContext`).

---

## 5. The "void" aesthetic redesign (current creative direction)
Reference: **Amazon Prime Video** layout, but **smaller hero** (our archive thumbs are low-res) and
re-skinned as **"the void"** — content **materializes out of dark TV static**, not clean cards.

**Already built (the foundation):**
- `MediaCard` is already the Prime card: **16:9 (300px desktop / 198px mobile)**, thumbnail-cover + gradient +
  title overlay + **hover-to-expand** (desc/meta/play).
- `FastImage` already **dissolves each thumbnail in from TV static** (SVG feTurbulence noise → resolve).
- **Hero shrunk** (`HomeScreen.js`): `IS_DESKTOP ? min(contentW*0.30, 380) : contentW*0.52` (was 0.62 → ~895px).
- **Loader video** (`VoidLoader.js` StaticVideo): plays the void stream (no random seek — respects the user's
  8-second scene cuts), CRT power-on/off blink, **opacity ramps 60→75→85→100% over 40s** (voidOpacityRamp), object-fit cover.

**NEXT (in-progress idea, NOT yet built):** make the whole background a **living static void** so everything
feels suspended in it. Plan: in `App.js` `injectRetroCss()`, add a faint fixed `body::after` static film:
```js
// define near top of injectRetroCss:
var noiseUri = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='vn'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23vn)'/%3E%3C/svg%3E";
// add to the CSS array (before ].join):
'@keyframes voidGrain{0%{background-position:0 0}25%{background-position:-30px 18px}50%{background-position:22px -28px}75%{background-position:-14px 26px}100%{background-position:18px -12px}}',
'body::after{content:"";position:fixed;inset:0;z-index:100;pointer-events:none;background-image:url("' + noiseUri + '");background-repeat:repeat;opacity:0.05;mix-blend-mode:screen;animation:voidGrain 0.45s steps(4) infinite;}',
```
Then refine: **static at card edges** + **scroll-focus** (content blurs at viewport edges, sharpens center, so
videos "come in and out of focus from the void"). Keep it lightweight — user said sprites/low-detail are fine.
Also TBD: the colorful **vibe tags** (CURSED/WEIRD) on cards — keep / tone-down / hover-only for a cleaner look.

---

## 6. Recurring gotchas
- **Mobile cache:** the user repeatedly sees stale bundles. After every deploy, test in an **incognito/private tab**
  or clear site data. Expo web registers a service worker that clings to the old version.
- **Thumbnails** proxy through `GET /api/thumb/:id` (`server.js`) → fetches archive.org, in-memory cache (6h) +
  30d immutable headers (Cloudflare/browser cache). `FastImage` rewrites `archive.org/services/img/*` → the proxy.
  Fixes ORB cross-origin blocks + speeds mobile. (Optional: add a Cloudflare Cache Rule for `/api/thumb/*` → edge cache.)
- **Categories:** never call `/api/categories?refresh=true` from the client — it does ~47 live Archive fetches, can
  exceed Cloudflare's 100s timeout → 524 with no CORS header → browser reports "CORS error." Use the cached endpoint;
  backend self-warms + keeps a **last-known-good** payload (never caches/serves empty). Client reshuffles for variety.
- **iOS:** videos need `playsinline`/`webkit-playsinline` (set on the player's `<video>` in `VideoPlayer.js`) or iOS
  forces fullscreen. Web autoplay must start **muted**; sound restores on first trusted gesture (sticky activation).
- **Player layout (desktop):** explicit widths from `useWindowDimensions` (the Player Stack scene doesn't stretch on
  web, so `flex:1` collapses). Video column is now the DOMINANT ~62%, related rail ~36% (was backwards). Tunable in `PlayerScreen.js`.
- **⚠️ `flex:1` + explicit `width` = collapse (RN-Web).** `flex:1` sets `flex-basis:0%`; with `flexGrow:0` that 0% beats an
  explicit `width`, so the element collapses to ~0. If you set an explicit `width` on a flex child, do NOT also give it
  `flex:1` in its style (bit us: desktop video column rendered tiny inside the related grid).
- **⚠️ Full-screen `mix-blend-mode` overlays KILL `<video>` picture.** A permanent fixed full-screen blend layer (even
  `opacity:0`) knocks `<video>` out of hardware compositing on Chromium → black picture, audio still plays, app-wide.
  Void overlays (VoidStatic etc.) must be `display:none` except while actively animating, and never sit over the player.

## 7. Monetization model (decided)
**Free app.** Voluntary **$5/yr "Member/Patron"** (not a wall). Archivist **top-ups** ~$1/wk / pay-what-you-want.
Keep perks insubstantial (cosmetic/recognition) so donations stay tax-deductible for the 501c3 — confirm with accountant.

## 9-B. CONTENT DIRECTION UPDATE (Bryan, 2026-06-11 — supersedes the default-era texture below)
- **Recency-first overall:** "way less interested in older than 50 years" as the DEFAULT texture
  across surfaces. The pre-~1975 layer earns its place only as CURATED shorter lists: "classic
  gems and cult." This generalizes the snacks post-1975 lean to the whole product. Era-lean
  windows, crate sorts, and pool sampling should bias recent; the old stuff concentrates into
  deliberate gem/cult crates instead of being the ambient default.
- **Surface the hunt:** VHS, comics/graphic novels, cartoons — people "have been corralled into
  not seeing this process of hunting as good or needed." The dig itself is the product.
- **Hentai / adult animation:** include as findable content UNDER THE EXISTING MATURE CORRAL
  (members-only 18+ gate, off the default wall — Bryan's standing "corral, not censorship"
  ruling). Note for counsel review alongside the rest of the mature surface: adult content on a
  501(c)(3) church app is a counsel-worthy optic even when gated; the gate design already exists.
- **Aesthetic remodel queued:** "the coloring / aesthetic needs remodel. this we will do." Not
  yet specced; expect a dedicated pass.
- **Incoming:** Bryan is bringing a list of new APIs + lessons from others in the space; discuss
  before building further on this section.

## 9. Content treatment — "generational variety" (STANDING SPEC, in progress)
The default texture should feel **generational**, not antique: every broad row should span the
**decades + recognizable series** (X-Men '90s, Transformers '80s, 2000s cartoons … *and* a Betty
Boop), never a single-era/single-show dump. Applies **throughout EXCEPT category specifics**
(decade rows, The Silent Era, the dedicated show rows, mature) which stay narrow on purpose.

**Philosophy — the junk is a FEATURE, not a bug.** Keep the "stream of noise" (amateur fan
uploads, etc.) **searchable** — the recognizable-bias + junk-filtering applies ONLY to curated
BROWSE rows. **Search stays raw.** That noise is the raw material people earn XP curating
(add metadata = points), and the long game is humans making the Archive useful "to humanity, not
just LM" training fodder. Do **not** filter global search. **NSFW is already handled** (NSFW_EXCLUDE
+ isolated mature categories) — do not re-architect it.

**Mechanism (in `backend/archive.js`):**
- `diversify(items, maxPerKey=2)` — caps how many items share a series/creator (key = creator,
  else normalized title root) so one show can't flood a row. Opt-in via **`diversify: true`** on
  a category (over-fetches 2× then trims) so it never starves a single-source row.
- **Per-category blend bias** — `searchBlended(query, rows, opts)`. Default = 30% popular / 70%
  deep-obscure (gold for weird-film rows). **`recognizable: true`** on a category → `RECOGNIZABLE_BLEND`
  (65% popular, shallow pages, non-anchor portion ALSO from quality sorts) so known series surface
  instead of fan junk. The "60% obscure" ethos is **not** one-size-fits-all.
- **`cartoons` ("The Animation Vault")** is the proven first application: retargeted off the
  Betty-Boop-heavy `classic_cartoons` to `animationandcartoons` + recognizable cross-decade series,
  excluding the dedicated shows, `map`/`pmv` fan-junk filtered, `diversify:true` + `recognizable:true`.
  Verified: consistent 1910s→2010s spread (X-Men/Gargoyles/DuckTales/He-Man/Transformers/Fleischer), no junk.

**⚠️ CLAUSE BUDGET GOTCHA:** `getCategoryItems`/`getAllCategories` auto-append `NSFW_EXCLUDE` +
`NEWS_POLITICS_EXCLUDE` to ENTERTAINMENT_IDS categories. If the combined query gets too long,
Archive returns **ZERO** (silent). Keep category queries lean (the broad cartoon query had to be
trimmed). Also: apostrophes in `title:("dexter's …")` break the Lucene parser → 0. Avoid them.

**TODO — rollout:** add `recognizable: true` (+ usually `diversify: true`) to the other nostalgia
`type` rows (e.g. Saturday Morning, Most Popular, Comedy Gold, Horror, Sci-Fi, Western); leave the
weird/deep rows (Lost Reels, The Weird Shelf, deep cuts) on the default deep-obscure blend.

**⚠️ "SNACKS"/SHORTS BUG (found, NOT fixed):** `/api/shorts` filters `runtime:[1 TO 120]`, but
Archive's `runtime` is a **display string** ("11:03") so the range is a broken lexical compare —
it returns ~10-min films and drops real <2-min clips. True duration filtering isn't possible via
Archive search. **Fix = query short-BY-NATURE collections** (commercials / trailers / cartoon
shorts / newsreels), then client-filter by parsed `runtime`. (Confirm whether "snacks" == shorts.)

## 10. Session bug-fix batch (DONE + web bundle compiles clean — NOT yet pushed)
Frontend (`mobile/src`): (1) search grid right-column clip → `MediaCard` responsive `width` +
`SearchScreen` computes exact `CARD_W`; (2) unified year/duration badge styling; (5) clip-drag was
finicky (effect re-bound listeners every move via 300ms debounce) → bind once, read live via ref;
(6) clip PREVIEW now polls + pauses at clipEnd (added `play`/`pause` to VideoPlayer ref handle);
(7) FB/X share hijacked by mobile apps → `shareTo()` uses `navigator.share` on mobile web, web
composer in new tab on desktop; (9) tapping a video then it SWITCHING → `handleVideoError` no longer
skips to a related video while metadata is still loading (waits for confirmed URL).
Backend: (8) rabbit hole "first 3 identical" → `getRelated` dedupes by BASE id (strips `:N` segments)
+ drops current item. Audio (3,4) = asset/browser-constrained (HEVC void-stream re-encode + genuinely
silent sources), flagged not code-fixed.

## 8. Recent commit trail (this session, newest first)
`b2b8010` VoidIntro · `f19dbb1` loader opacity ramp · `81081a7` loader no-seek (8s cuts) ·
`9f1b0d5` loader seek/fill · `68b3636` shrink hero · `587922e` CORS+rubberband ·
`fd8cc92` mobile playsinline + desktop player resize · `cec8fba` remove LIVE channels ·
`a752f0e` thumbnail proxy · `6d40083` void-stream video · `5ef4a8f` admin-unlimited Archivist ·
`7aaf294` big batch (mobile content fix, autoplay, Archivist, layout, auth, title cap).

## 11. Mobile testing backlog — Bryan's on-device notes (PENDING)
Done in this note-batch: **ffmpeg installed** (User PATH → `C:\Users\bryan\ffmpeg\ffmpeg-…-full_build\bin`);
both void-stream renditions **fast-started losslessly** (`-c copy -movflags +faststart`, moov→front, AAC
audio kept). Audio tracks CONFIRMED present in both `void-stream.mp4` (lo) + `void-stream-hi.mp4` (hi).

Still TODO:
1. **Banned category** — new "Banned" channel: banned/censored films across eras (archive.js category). On-vibe.
2. **Channel options ABOVE their content** — filter/channel chips must sit above the area they populate
   (currently below). Confirm screen (Player channel sidebar vs Search filter row).
3. **More card options (Amazon ref)** — MediaCard hover-expand needs the fuller Prime action row
   (play, +My Void, more info, mute) AND cards must visibly emerge from the void (FastImage resolve is in;
   the §5 scroll-focus "in/out of the void" — the "out" — still TODO).
4. **Opening video audio** — intro must carry sound. Track present; browser needs the tap gesture (VoidIntro
   has it). Re-verify after the H.264 deploy + hard cache clear.
5. **Audio-on-show / mute-on-hover** — videos play audio WHEN SHOWN, mute when hovered elsewhere (void's
   ambient sound; hovering a card quiets it). Needs gesture unlock first. CLARIFY exact scope/contexts.
6. **TV category — medical junk on main** — surgical/inappropriate medical content leaking into TV main →
   add medical/NSFW fencing to the TV query.
7. **TV category — real episodes across eras** — tighten to ACTUAL tv episodes spanning decades (not just PD
   oldies); apply the generational `recognizable`+`diversify` treatment (same as cartoons).
8. **Mobile fullscreen bug** — fullscreen + rotate phone → WHITE SCREEN; "still seeing old options" = partly
   stale service-worker cache. Investigate VideoPlayer native fullscreen + orientation on mobile web.

## 12. Layout vision — "the void sea" (Bryan, this session)
Browse = Amazon-Prime structure, skinned as the void. Ref: `Videos\Screen Recordings\Screen Recording
2026-06-09 213729.mp4` (= Prime home — horizontal rows, 16:9 cards, "See more ›", hover-expand w/ actions).
`CategoryRow` already IS the Prime row (header + See More + hover-arrows + horizontal cards + pagination).

- **A lot of category rows, scroll down → massive variety** (NOT technically endless — just render many of the
  ~80 existing categories: type + deep + decade + show, + facet/blended variety rows). recognizable+diversify
  already varies each row internally. Virtualize the vertical list; lazy-load each row's items as it nears view.
- **Each row scrolls horizontally** (CategoryRow — done).
- **Scattered void-stream TVs**: between sections, drop `VoidLoader` static-video bands at SEEDED-random
  intervals (seed by feed index so they don't reshuffle on re-render) — the "wall of TVs" you surf past; each
  CRT-blinks on as it scrolls in, per-instance brightness. Reuses VoidLoader (now plays `void-stream.mp4`).
- **"See More" → faceted category page** (NEW `CategoryScreen`): one category exploded into a vertical stack of
  horizontal rows — decades / sub-genres / deep cuts / most-hearted — each a `CategoryRow`. Re-point
  `handleSeeMore` (currently → Search grid). Needs a small backend facet helper (category query + buckets).
- **Card expand must work on MOBILE** (tap/long-press, not hover-only): Prime info-popup + action row
  (▶ Play · ＋ My Void · ♥ · ⓘ More).
- **No "ON NOW".**

Build order (rising risk): ① mobile-native card expand → ② faceted See-More page → ③ the variety sea +
scattered void-TVs. ① and ② don't endanger the 1,805-line HomeScreen.

## 13. The Archivist as "the only algorithm" — conversational profile-building (Bryan, this session)
**Thesis inversion (the whole point):** VOIDtv has NO surveillance recommendation engine. The ONLY
"algorithm" on the app is one the user **deliberately authors by talking to the Archivist** —
transparent, consensual, human-shaped. Where every other platform's algorithm is done *to* you, yours
is something *you build*. This is "before AI slop, human creativity" applied to personalization itself.
The Archivist stops being a search filter and becomes the instrument you tune your own signal with.

**Baked into the Archivist (core, not optional):**
- Every Archivist conversation **adds/subtracts likes & interests** → persists to the user's taste profile.
- **Each opening conversation asks a couple of questions** (like this / not that / into this?) that add or
  subtract from the profile.
- The profile is **visible** and **drives a personal row** ("your row") shown where appropriate + reflected
  in the user profile screen.
- It's the **singular** personalization — reframes the current passive "For You"/recommendations.
  Community signals (trending, hearts) stay — those aren't *your* algorithm.
- **Access = value = donation reason:** more Archivist access (member / `archivist_credits`) → more
  profile-building → a richer row. The donation ask becomes "fund *your* sharper signal," not a paywall.

**Maps to existing infra:**
- `backend/archivist.js` (Claude Haiku `claude-haiku-4-5-20251001`) — extend to EXTRACT + PERSIST
  likes/interests each turn (structured output / tool use) and generate the opening questions.
- `profiles` table — add taste fields (likes / dislikes / interests as weighted JSON).
  `archivist_usage`, `supporter_until`, `archivist_credits` already exist.
- Personal-row endpoint — build a row weighted by the taste profile (liked subjects / genres / eras /
  creators); served as "your row".
- Frontend `TheArchivist.js` — opening-question flow + conversational profile updates; a "Your Row" on
  Home from the profile; profile screen SHOWS + lets you edit your likes (transparency = trust).

Status: SPEC captured. Big build — slot into a rollout (likely its own, after/with the void-sea layout).

## 14. "Before they disappear forever" — lean into ephemerality (Bryan, this session)
Turn the Archive's content DECAY into the feature, not the bug. Items get restricted/removed over time
(copyright, IA's legal compliance, dead mirrors). Instead of only HIDING the dead ones, SURFACE the
at-risk ones with urgency: *watch it before it's gone forever.* The thesis at its sharpest — witnessing
human creativity before it vanishes (to restriction, to decay, to AI slop).

- **Already-gone** (401 / private / restricted) → HIDDEN. Done (`RESTRICTED_EXCLUDE`, this session).
- **At-risk** → the new feature: a **"Fading Signals" / "Before They Vanish"** row of the rarest /
  least-downloaded / most-fragile items, framed with urgency. The least-seen content is the most likely
  to disappear (nobody preserving what nobody found) — which is exactly the existing deep-cut /
  `downloads asc` ethos, reframed with stakes.
- **Aesthetic**: the rarer an item, the harder it dissolves out of the static — a "weak signal /
  endangered" treatment. Ties directly to the SIGNAL STRENGTH idea (§4).
- **Mechanic**: a "witnessed" log — *things you watched before they vanished* — +XP and a Hall of Fame
  for catching a rare signal before it died. Plugs into the Archivist profile (§13) + GameContext.
- **Copy**: "before AI slop, human creativity — and it's disappearing. watch while you can."
- **PRIME TARGET = branded / newish / full-length** (Bryan): copyrighted shows + branded content are
  what gets taken down — so the "Before They Vanish Into The Void" row surfaces the branded/recent
  full-length titles that are STILL viewable, with urgency. Data backs the pattern: the
  `access-restricted-item:true` pool (4.45M movies) is full of already-locked recent branded
  broadcasts (e.g. C-SPAN) that 403 for anon — proof that branded/recent content is exactly what
  gets pulled over time. PD/old = the stable spine; branded/newish = the candle burning down.
- **Definitions in code:** "already locked" (hidden) = `access-restricted-item:true` + private-mirror
  collections (`RESTRICTED_EXCLUDE`, shipped). "Still-viewable but at-risk" (the Vanish row) = branded/
  recent full-length not yet restricted (heuristic: feature-length + recent year + branded source/collection).

Status: SPEC captured. Slots with the Archivist / ratings (SIGNAL STRENGTH) rollout.

## 15. SESSION HANDOFF → next chat = full debug + surgical-fix pass (this session)
A LOT shipped fast today, push-to-master each time. Live on `master` @ `926aa37`. The next chat should
be a careful, surgical debug/fix pass over all of it. **Hard cache-clear (Empty-Cache-and-Hard-Reload /
unregister SW) before testing — the sticky service worker masked nearly everything this session.**

**Shipped today (newest → oldest):**
- **Player polish:** related rail → **single column** (full width — titles/creator/views read fully, no
  more "!"/"198 O"); action strip → explicit **"Add to Playlist"** + **Void Page folded into the Share
  drawer** (one fewer redundant button); SearchScreen grid no longer crashes on resize (`key` on the
  `numColumns` FlatList — RN forbids changing it live).
- **Desktop player fixed (3 stacked bugs):** clean `/watch/:id` URLs (`getPathFromState`); VoidStatic
  blend-overlay no longer kills `<video>` picture; desktop video column no longer collapses (`flex:1`
  vs explicit width) — video is now the dominant ~62%, related rail ~36%. (See §6 gotchas.)
- **Mobile/desktop "wall":** every category as a vertical scroll of horizontal rows; chip bar gone on
  mobile; "All" = the full wall. Subtle per-row coloration. Void-stream fills loading/empty rows.
  Scattered void-stream TV bands (~1/6 rows, channel-surfed to different ~7s scenes). **Void Snacks**
  row every 3 rows (rotated for variety).
- **Void effects:** VoidStatic occasional static (now `display:none` except during a burst). Loaders +
  intro play the fast-started void-stream (audio confirmed).
- **Content treatment:** recognizable+diversify on all genre rows; "The TV Set" (real episodes, medical
  fenced); "Banned" (cult cinema, extremist-fenced).
- **Backend resilience:** `archive.search` degrades to `[]` on Archive 5xx (no more 500s on
  /api/shorts & /api/search); shorts/search don't cache an empty blip.
- **`RESTRICTED_EXCLUDE` is currently OFF** (re-test, below).

**DEBUG / SURGICAL-FIX AGENDA (next chat):**
1. **Restricted re-test:** filter is OFF so Bryan can see which previously-blocked videos actually play.
   Verified: funny_or_die files `private:true`→401; access-restricted movies 403 for anon (C-SPAN sample)
   → most are genuinely dead. Decide: re-enable `RESTRICTED_EXCLUDE`, OR build a **resolve-time playable
   check** (HEAD the resolved URL in `getItem`, mark unviewable) — that's the right fix vs. wholesale
   collection excludes.
2. ✅ **DONE — related rail is single-column now** (full width; titles/creator/views read fully).
   Remaining nicety (optional): bigger thumbnails in the now-wider single-column cards.
3. **"!" titles:** many related cards show a bare "!" — `cleanTitle` likely strips a leading date/prefix
   and leaves the "!". Fix in `PlayerScreen.cleanTitle`.
4. **Clip slider:** drag was rewritten (rebind bug) — confirm it works on the FRESH build; if not, dig in.
5. **Mobile fullscreen → white screen on rotate** (still open, §11.8).
6. **Perf:** the wall (~30 rows, non-virtualized `ScrollView`) + scattered `<video>` TVs + snacks rows —
   check mobile perf; **virtualize the vertical list (`FlatList`)** if sluggish.
7. **Audio-on-show / mute-on-hover** (§11.5) — still needs the exact-scope decision.
8. Verify the desktop player end-to-end on a fresh build (big video left, related right, plays).
9. **Gen Z Signal — gate the old-old content (Bryan):** when `generationId === 'genz'`, the Signal feed's
   TOP cards must NOT surface very-old content — a Gen Z shouldn't open Signal to 1930s–50s reels. Gate
   hard by year (e.g. drop year < ~1980, or weight strongly toward recent) in `SignalScreen` (it reads
   GenerationContext). Confirm the exact threshold + which rows count as "top cards" with Bryan. (Boomer
   = opposite lean; Millennial = nostalgic middle. This is the generational content treatment applied to
   Signal, not just copy.)
10. **Favicon 404:** the site has no `favicon.ico` (404 in console) — add one (cosmetic, ~5 min).

**Still spec'd, not built:** void-sea polish (§12), Archivist-as-the-only-algorithm (§13), "Before They
Vanish Into The Void" — branded/newish full-length (§14).

**Today's commits (newest first):** `1e3a241` add-to-playlist + void-page→share · `7208606` numColumns
crash fix · `246c037` single-col related rail · `5ed0f95` genz-signal note · `926aa37` desktop video
collapse · `aa4eb9c` VoidStatic video fix ·
`00cc0ea` player video-dominant · `6ac2ae6` hide unviewable · `85f9e76` void snacks · `0ce7975` scattered
TVs + clean URLs · `ac08422` row coloration + void-fill · `3a060ca` wall desktop + channel-surf ·
`4e4cd31` mobile wall + search resilience · `ac9b4c5` content rollout (TV/Banned/genre treatment) ·
`d212d50` fast-start videos · `01e96b9` VoidStatic · `410298b` generational treatment + mobile bug batch.

## 16. SESSION HANDOFF #2 (the big debug+feature session — read this first)
Live on `master` @ **`68c7e92`**, pushed (tree clean). A LOT shipped + we **caused & recovered a ~40-min
prod outage**. The hard-won nuances below are the real value — a fresh session would miss them.

### ⚠️ DEPLOY / INFRA NUANCES (these bit us hard)
- **Render auto-deploy OFTEN doesn't cut over.** It shows "Deploy live for <sha>" but the OLD process keeps
  serving (check `/health` uptime — if it keeps climbing, it never restarted). **Fix: Render → Manual Deploy →
  "Deploy latest commit"** (or **Suspend → Resume** if a restart won't take). Always manual-deploy backend changes
  and confirm uptime resets to ~0. This cost us ~40 min of confusion mid-outage.
- **Archive.org rate-limits Render's IP if you hammer it.** A 5×-per-gen category warm (the original era-lean)
  throttled Archive → every gen request timed out (120s+) → home wall down for everyone. **DON'T multiply
  Archive fetching** (no per-gen full-category fetches, no aggressive warm). A **circuit-breaker** now guards
  `archive.search` (6 consecutive fails → return [] for 60s, no Archive call) — keep it.
- **Static videos** (loaders) live in `backend/public/static/` → served by **Render** (need a backend deploy to
  appear). Must be **H.264 + AAC + fast-start**: `ffmpeg -i src -c copy -movflags +faststart out.mp4` (moov→front).
  ffmpeg is at `C:\Users\bryan\ffmpeg\ffmpeg-2026-06-08-git-...full_build\bin`. (`search-loading.mp4` was added
  this way — **needs a Render manual-deploy to serve**, else it 404s.)
- **Frontend = Vercel (auto-deploys on push, cutover reliable). Backend = Render (manual-deploy reliable).**
- **Claude Preview tool can't render this app's desktop (>900px).** Verify via the Metro bundle instead:
  `curl -s "http://localhost:8081/index.bundle?platform=web&dev=true" | head -c 40` → starts `var __BUNDLE_START_TIME__`.
  Bryan's Metro usually runs on :8081. Desktop visual changes = Bryan verifies on the live site.

### What shipped (grouped)
- **Generational era-lean** (the "signal" default, on the **Browse wall** — NOT SignalScreen which is profile):
  boomer leads **'60s**, millennial mid→up, genz recent→**'70s** floor. **HOME lean = cheap in-memory reorder
  (`archive.applyEraLean`) of ONE shared base payload** — see [[voidtv-generational-era-lean]]. Deep lean per
  category in `searchBlended(opts.era)`. `reshuffleCats` must SKIP recognizable rows (else it scrambles the order).
- **Mature content**: SEQUESTERED off the default wall (`typeCats` drops `c.mature`), reachable via the **18+ chip
  (desktop) / drawer toggle (mobile)**, **MEMBERS-ONLY** (gate on `isAuthenticated && !isAnonymous` — anonymous
  sign-in IS enabled). Bryan's stance: **not censorship — corral + accessible**. See [[voidtv-social-mirror-junk]].
- **Search**: 50 rows + LOAD MORE (append) + infinite scroll + RE-ROLL (`?sort=` whitelist). Loader = the big
  `search-loading.mp4` clip. The `runtime` duration filter is still the broken lexical compare (§9 SNACKS bug).
- **Player**: top-left **VOIDtv logo = return to wall + end viewing**; **blur+unmount listener pauses video on
  EVERY exit** (expo-video doesn't release `<video>` on web — fixed the "audio keeps playing"); always-visible exit.
- **Removed `VoidStatic`** — its app-wide `mixBlendMode` overlay was blacking out `<video>` in fullscreen (§6 killer).
- **Wall top cleanup**: Trending Now + For You removed; **Void Snacks now after row 1 then every 3** (`idx%3===0`);
  **Continue Watching** compact row under the first snacks (loads history on focus; re-opens from start — no resume yet).
- **DONATE** button replaced SURPRISE ME (header). **Crispness** theme pass (deeper bg, brighter/cleaner edges).
- **Void TVs stagger 10s apart** by mount order (VoidLoader `_staticVideoSeq`).
- §15.3 **"!" related cards** fixed (`hasRealTitle` drops zero-alphanumeric social-mirror junk; Unicode-aware).

### ✅ DESKTOP FILTER CHIP BAR REMOVED (Bryan: "categories back up top — please correct")
It was never re-ADDED — it survived from pre-session code (mobile lost chips earlier; desktop kept
them) and became prominent once the sidebar died + content went full-width. Now gone everywhere:
chip-bar JSX + FILTER_CHIPS/CHIP_ORDER consts + sortedChips/scroll helpers + styles deleted from
HomeScreen. The chip MECHANISM stays (activeChip 'all'|'mature' only) — it powers the drawer's
18+ / Browse routing and the mature sequestration. Verified at 2200px: no chip row, TopBar+wall fine.

### 🎮 VIDEOPLAYER v2 — gesture layer SHIPPED (local); engine swap CAPTURED for the native migration
Bryan's research doc (rn-video v6/v7, Jellyfin/Stremio/YouTube/Video.js patterns) — REALITY CHECK:
VOIDtv ships as RN-WEB (Vercel + mobile browsers); `react-native-video` is iOS/Android-native ONLY.
The engine swap (PiP/preload/DRM natively, v7 player-view split) belongs to the FUTURE dev-client
migration shared with VOID RADIO's react-native-track-player — one door, several upgrades. Web path
if/when needed = Video.js (@videojs/react) or MSE. CAPTURED, NOT BUILT: queue-awareness ("Next up"
overlay last 15s + preload — ⚠️ preloading Archive MEDIA doubles bandwidth/view, rate-limit risk;
metadata+thumb prefetch is the safe version), Stremio/Raffi-style stream-info chip (res/era/format —
Archive quality varies wildly and the player should SAY it), Jellyfin lesson (continue-watching/next-up
as first-class), volume/brightness swipe zones (iOS web ignores programmatic volume; brightness = fake
dim overlay on web).
SHIPPED NOW (VideoPlayer.js, web-compatible, VERIFIED by DOM probes):
- **Double-tap zones**: touch = left −10s / right +30s (YouTube-mobile vocabulary); fine pointer =
  double-click fullscreen (desktop muscle memory). `IS_TOUCH` via `(pointer: coarse)`.
- **Hold-for-2×** (TikTok pattern): long-press either zone → 2× while held → release restores the
  USER'S chosen rate (verified 2.0 during hold → 1.5 after release). Replaced the old long-press
  FF/RW interval machinery (seekDirection/startSeek/stopSeek removed).
- **Playback-rate cycle button** in the progress bar: 1 → 1.25 → 1.5 → 2 → 0.5 (verified on the
  real <video>: 1 → 1.25 → 1.5). Amber when ≠ 1×.
- **PiP button** (top bar, web where supported; Safari webkitSetPresentationMode fallback).
- **Chrome reduction**: center 10/30 skip buttons REMOVED (gestures + arrow keys cover it; play
  circle stays). Keyboard lean-back set already existed: space/←→/f/m/↑↓.
- Cosmetic TODO: the "2× SPEED" hold badge didn't render in the synthetic probe — eyeball on-device.

### ✅ VOID SNACKS REBUILT — §9 SNACKS BUG RESOLVED (post-1975 lean, audited; local-only)
`/api/shorts` no longer uses the broken `runtime:[1 TO 120]` lexical range. New design (server.js):
three short-BY-NATURE pools — `classic_tv_commercials` (5.8k ≥1975) + `movie_trailers` (50k ≥1975),
both year-clause-bound `year:[1975 TO 9999]` (Bryan: "heavily leaned after 1975"), + `universal_newsreels`
(~600, all 1940s-60s) as the VINTAGE GARNISH hard-capped at ~10%/serving (Bryan tuned 20→10). Real duration filter via new
`archive.parseRuntimeSeconds()` ("11:03"→663s; ≤180s kept, unknown kept — pools are short by nature).
TITLE HEURISTICS carry the load (23/24 items have NO runtime metadata): trailers REQUIRE
trailer/teaser/spot in title (kills full movies mislabeled into the collection); commercials REQUIRE
singular "Commercial"-ish signal AND NOT plural "Commercials" (plural = hour-long compilation tapes);
COMPILATION_RE also blocks W/O/C full broadcasts, airchecks, "commercial breaks", "all trailers";
NSFW title backstop (emmanuelle/etc — subject-based NSFW_EXCLUDE alone leaked). AUDITED: 83% post-1975 /
17% garnish / 0 over-3min / 0 compilations / 0 NSFW. UI copy → "ads, trailers & reels under 3 minutes".
⚠️ pool collection names VALIDATED against Archive (Drive-in_Ads, newsreels, prelinger_ads DON'T exist).

### ✅ UNPROMPTED VIDEO-JUMP FIXED + fullscreen fix-plan completed (VERIFIED by repro)
Bryan: "a selected video starts playing and then it jumps to another, unprompted" (also re-broke his
fullscreen — the hop unmounts the player mid-FS). Fix in `PlayerScreen.handleVideoError`: if
`videoRef.getCurrentTime() > 1.5s` and NOT in a channel, a media error returns early → the player's
"tap to retry" overlay, NO source-swap, NO auto-advance. Channels keep auto-advance (doom-scroll never
sticks); pre-play failures keep the optimistic→confirmed→HQ→skip recovery chain. VERIFIED: dispatched
`error` at t=30 → URL stayed `/watch/Zydereen…`, retry overlay shown (previously navigated to a
different film). ALSO shipped: iOS Safari fullscreen fallback (`video.webkitEnterFullscreen()` when
element-FS API is missing — closes "some mobile FS works, some doesn't") and ghost-audio hardening
(VideoPlayer pauses the outgoing expo player on swap/unmount; expo-video doesn't release <video> on
web). NOTE for live testing: Bryan's tab had a stale half-HMR bundle (phantom "Pressable is not
defined" + "no screen named Search" + "unknown module 880") — those are NOT in current source; a
hard refresh clears them. Current source verified booting clean.

### ✅ SEARCH MOVED INTO THE TOPBAR (Bryan) — one input, no second screen-with-input, no chips
TopBar now holds a REAL search input (desktop: centered pill TextInput; mobile: the search icon
expands the bar into back·input·go). Submit → `navigate('Search', { q, _ts })`. SearchScreen is now
purely the RESULTS surface: its own SearchBar + category filter chips + duration chips are REMOVED
("remove the seen filters"); a `q` param branch in the route-params effect runs the search directly;
the context banner now also covers See-More categories (COLLECTION/CREATOR/CATEGORY + ✕). Search moved
OUT of the mobile bottom tabs (now Browse/Signal/My Void) into a Stack screen; linking `search` path
is root-level (deep links `/search?q=…` + `/search?categoryId=…` VERIFIED working → 50 results, banner
correct); DrawerMenu SEARCH item removed. LOAD MORE + RE-ROLL + infinite scroll kept. doSearch still
honors filtersRef/duration internally (pinned EVERYTHING/ANY — See-More scoping still works through it).

### ✅ MOBILE PLAYER ACTION STRIP FIXED (Bryan: "most buttons below the player don't work") —
measured: the 6 labeled row-buttons spanned 491px in a 390px viewport with `overflow-x: hidden`
(Share half-clipped, Download fully OFF-SCREEN, rest cramped → mis-taps). ActionIcon is now compact
on mobile (icon above tiny label, flex:1 each — all six fit 18→372px, verified) and "Add to
Playlist"→"Playlist". Handlers themselves verified firing (synthetic dispatch opened the share
drawer). Caveat: Love/hearts are auth-gated server-side — anonymous taps silently no-op (UX nudge TBD).

### ✅ FOLLOW TAGS REMOVED (Bryan) — CategoryRow follow/following chip + HomeScreen's
subscribedIds/handleSubscribe wiring deleted (the only consumers). The "From Your Subscriptions" feed
row still renders for accounts with existing follows; there's just no follow/unfollow UI anymore.

### ✅ WALL VIRTUALIZED — gen-switch freeze FIXED (§15.6/§12 item, was mandatory)
Bryan: "signal changing to genz just locked me on dt" (persisted on a fresh tab). Reproduced at desktop
width in the preview (explicit `preview_resize` 2200×1100 DOES render the desktop layout — the old
"preview can't do desktop" note is wrong for explicit sizes): returning to the wall after a gen switch
ran the full non-virtualized re-render → long tasks **2059ms + 1729ms + 819ms…** ≈ 5.5s frozen, 8,967
DOM nodes, 5 mounted void-TV videos. **Fix:** the wall's vertical list is now `Animated.FlatList`
(HomeScreen): `wallData` memo interleaves cat/snack/continue/TV-band entries (same layout rules),
hero→spotlight = ListHeaderComponent, CTA+footer = ListFooterComponent, initialNumToRender 5 /
maxToRenderPerBatch 3 / windowSize 7; FAB scrollTo → scrollToOffset. **After:** longest task 656ms,
rest 100–300ms batches; pill-press 248→73ms; ~2,700 DOM nodes; 1 video. Rows mount on approach; far
rows unmount (void TVs CRT-blink on re-entry — on-vibe). Also benefits the upcoming accumulate-only
deeper rows. Bundle compiles; Bryan verifies feel on dt.

### ✅ FULLSCREEN STUTTER — FIXED (VideoPlayer render churn; Bryan verifies feel)
"FS works but oddly stuttered/glitchy." Three compounding web-side causes in `VideoPlayer.js`, all fixed:
(1) the 250ms progress tick re-rendered the WHOLE player 4×/s even with controls hidden → tick now
re-renders only while controls are shown (the buffer-underrun watchdog still runs on refs — keep it);
(2) EVERY mousemove spawned a new JS-driven `Animated.timing` → `showControls` now just resets the hide
timer when already visible; (3) the controls layer stayed mounted at opacity 0 OVER the video (the §6
compositing lesson) → it now UNMOUNTS after the fade (`controlsShown` state; remounts on mousemove/tap
with a fresh tick so the bar isn't stale). Bare <video> composites alone when controls are hidden.
NOTE: dev bundle adds its own jank — judge final smoothness on a prod build/live. Headless preview can't
verify (fullscreen denied + autoplay won't stick); bundle compiles clean.

### 🔬 FULLSCREEN — DIAGNOSED (root causes confirmed by live repro; fixes pending Bryan's go)
Bryan: fullscreen "starts on dt, then glitches and the audio keeps playing"; mobile inconsistent. REPRO'D
in the local preview: dispatching ONE transient `error` on the playing `<video>` made the app
**navigation.replace to a DIFFERENT video** (`/watch/Zydereen…` → `/watch/turner_video_107180`).
**Chain = the dt glitch:** stream hiccup → `PlayerScreen.handleVideoError` unrecoverable branch →
autoplay hops to related → PlayerScreen (and the fullscreened `[data-vpcontainer]` node) unmounts →
browser force-exits fullscreen → expo-video doesn't release the old `<video>` on web (§16) → **audio
keeps playing**. Same root as §16's "click video → it switches" pending bug. **Mobile split:** iOS
Safari has NO element-fullscreen API — `container.requestFullscreen` is undefined → silent no-op
(toggleFullscreen `VideoPlayer.js:258`); works on Android. iOS needs `video.webkitEnterFullscreen()`.
**Fix plan (not yet applied):** (1) mid-play errors (videoRef.getCurrentTime() > ~3s) must NOT hop —
show the existing retry overlay; keep auto-advance for channels + pre-play failures; (2) iOS fallback
to `webkitEnterFullscreen` on the inner `<video>`; (3) harden VideoPlayer unmount: explicitly pause
the DOM `<video>` (belt+braces for the §16 non-release); (4) scope the fullscreen target per-instance
(today `querySelector('[data-vpcontainer="1"]')` is global; single instance currently, fine). NOTE:
the Claude preview context DENIES fullscreen permissions (headless) — engage-tests must be on a real
browser. ✅ FIXED this session: TopBar rendered over the Player on deep-link/refresh (initial route
never hit onStateChange) → `onReady` now syncs `activeRoute` (navigation/index.js); verified.

### ✅ ERA-LEAN v2 — "heavier lean for all" (IMPLEMENTED, verified locally; pending commit/push + Render manual deploy)
Bryan: wall skewed old-old even on genz + variety frozen. Diagnosis: NO gates were up (RESTRICTED_EXCLUDE
still off; v1 lean verified working in prod) — the skew was (1) local backend not running → stale client
cache (start `backend && node server.js` before judging localhost!), (2) lean only touched 22/81
recognizable rows while the un-leaned weird/deep rows (8/10 pre-1970 faces) dominated, (3) the shared
payload often has no 2005+ items to lead with. Variety frozen = reshuffleCats skipped recognizable rows
(the anti-scramble fix) + 20-min server bucket.
**v2 (this session):** `archive.js` — `eraExempt()` (decade/show/mature/`sort`-ranked/silent_film stay
authored), `eraFor` broadened to ALL non-exempt rows (See-More/pagination leans too), `applyEraLean` v2:
PURE_HEAD=6 in-era face, WEAVE_EVERY=4, off-era ranked by proximity-to-window, genz 1970 floor wall-wide
(never-blank guard kept), + ROW-ORDER lean (rows scored by face-affinity; decade rows drift to their gen).
`HomeScreen.js` — reshuffleCats → BANDED shuffle (rows & items in bands of 4): per-visit variety without
scrambling the lean; replaces the recognizable-skip. **Verified local:** genz first-10 rows all lead
2005–2026 (1930s row sinks to #78/81), boomer leads d1960s/d1970s/d1980s + '60s deep cuts; most_popular/
silent_film/all decade rows item-identical to base. Still in-memory only — no per-gen Archive fetching
(outage-safe). Future thickener if rows feel thin on genz (floor shrinks them): add a small recent slice
to the warm per row (bounded), see "option d". NOTE: local backend/.env has no Redis creds ("[cache] No
Redis credentials — L1 only") — prod Render env has its own; restore locally if durable cache wanted.

### ✅ header/hamburger refactor — IMPLEMENTED (web bundle compiles clean; pending Bryan live-verify + commit/push)
**DONE this session (uncommitted in the working tree):** new `mobile/src/components/TopBar.js` (`☰ · logo · centered
search · user · ♥ DONATE`, fixed/absolute, hamburger on both platforms) + `mobile/src/components/DrawerMenu.js`
(extracted out of HomeScreen, opened from the bar; sources gen/auth from context; 18+/Browse route a `chip` param to
HomeScreen). `SidebarContext` repurposed → `{ drawerOpen, openDrawer, closeDrawer, headerH }` (same provider/hook
names). `navigation/index.js` renders TopBar + DrawerMenu OUTSIDE the Stack on BOTH platforms via a `makeNav`
bridge, and hides them when `route === 'Player'`. Every screen swapped `marginLeft: sidebarWidth+CONTENT_GAP` →
`paddingTop: insets.top + headerH`, content full-width; Player is full-bleed (`NAV_MARGIN = 0`). `DesktopSidebar.js`
DELETED. Mobile keeps bottom tabs **and** the bar (Bryan's call). Verified: `index.bundle?platform=web` → HTTP 200,
`var __BUNDLE_START_TIME__`. **Still needs:** Bryan live-verify (desktop especially — Preview tool can't do >900px),
then commit + push to `master`.

Original spec ↓ (kept for reference)
### ⚠️ header/hamburger refactor — the spec
A persistent **full-width** top bar on EVERY screen, **hidden in fullscreen**: `☰ hamburger · VOIDtv logo(=back/wall)
· centered search · user · ♥ Donate`. The **hamburger opens the nav** (reuse the existing `DrawerMenu`), and the
**left sidebar + its collapse-arrow are REMOVED**, content goes full-width. (Bryan flip-flopped then confirmed:
**hamburger YES, arrow GONE.**) It's all-or-nothing — removing the sidebar means the header must carry nav
everywhere — so build it as ONE cohesive pass + Bryan verifies live. NOTE: `SidebarContext.sidebarWidth` is
currently pinned to `EXPANDED_W` (a stop-the-reflow stopgap) and `DesktopSidebar` self-sizes from `collapsed`;
the refactor supersedes both.

### B's ruling 2026-06-12: VOID TICS + VOID SNACKS, one pool
Clips are 100% the Void Tics fuel. Tics and Void Snacks draw from the SAME pool, and both
surfaces are FOREVER SCROLLABLE (infinite feed, never a dead end) and EMOTABLE (reaction
interactions on each clip). Emote state needs Supabase, so the build slots into the Move 3
lane (Edit Layer prereqs are built; waits on B running the schema SQL). Design implication
recorded now so the clip pipeline is sized for it: every clip cut lands in the shared
tics/snacks pool, not a per-surface stash.

### Pending queue (besides the header)
- **Rabbit-hole**: first-3-identical + duplicates → stronger dedupe (Archive ships the same film under different
  identifiers; base-id dedupe isn't enough — use title-root). + **exclude already-watched** (filter against local history).
- **Player**: "click video → it switches a couple times" (`handleVideoError` skipping mid-load). **Fullscreen won't
  *engage*** (dt+mobile) — re-test now VoidStatic's gone; the black-screen was that overlay, the not-entering is separate.
- **Gating leak (Bryan: important)**: mature must NOT appear in **popular/most-watched/community** rows
  (`views`/`hearts`/`trending` store items with no mature flag). Plan: client flags mature on record → backend filters.
  Also: **Community Loves / Subscriptions / Spotlight** are still above the genre wall — Bryan may want them gone too.
- **"Graphic" = catch-all category for medical + violence** (corral + fence off the wall, same pattern as mature).
- **Comment username** shows the default (`void_xxxx`) when signed in — resolve the profile username.
- Continue Watching **resume-from-position**. Search **chips rotate** per visit. Remove the now-dead **trending/forYou
  fetches** (still fetched, not rendered). Boomer/genz era windows are tunable (`GENERATION_ERAS`).

**This session's commits (newest→oldest):** `68c7e92` search-loading video · `0fa18da` continue-watching ·
`ef98f72` wall-top cleanup + snacks reorder · `c9011bd` donate button · `669ed66` audio-stops-on-navigate ·
`32fe846` search void-TV wall · `479fb40` sidebar no-reflow · `f5c9aeb` VOIDtv exit logo · `abba016` crispness +
mature-sequester + remove-VoidStatic · `c736ec1` circuit-breaker (outage recovery) · `27a95db` redeploy ·
`cfe1700` in-memory era-lean hotfix · `3cd7ccd` era-lean + search load-more/re-roll + snacks arrows + "!" fix.
