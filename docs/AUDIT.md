# Audit 2026-10-14/15

Ten independent readers over the whole app, then adversarial checks (stopped early to save usage: 35 of 68 fully judged, every judged finding survived). All 68 addressed over three rounds; the table is the record. Items marked design note were handled by a narrower change than suggested (noted inline).

| # | Sev | Where | Finding | Status |
|---|---|---|---|---|
| 1 | high | lib/app.js:26 | TV channel items index into a de-adulted show list: 19% of items play the wrong show, whole channels are 100% wrong, Late Night channel is dead | FIXED |
| 2 | high | lib/app.js:624 | go() renders the show view before resetting state.se/state.e; stale indices from the previous show throw inside showView when the target's seasons are already loaded | FIXED |
| 3 | high | lib/app.js:662 | Header search is dead on show/TV/Mine/person/about/cash views and rebuilds the player (or restarts the live stream) on every keystroke | FIXED |
| 9 | high | lib/app.js:554 | Season dropdown and header search call render(), which rebuilds the whole player and stops playback | FIXED |
| 11 | high | lib/app.js:525 | Desktop double-click toggles play twice before going fullscreen | FIXED |
| 18 | high | lib/app.js:48 | Late Night channel has null show indexes for every item; opening it blanks the TV page (osd throws on s.show) | FIXED |
| 19 | high | lib/app.js:380 | afterMe() wipes the Wrong file?, Share this moment and Download buttons on the show page after any Like / My List click | FIXED |
| 25 | high | site.js:51 | /show/* rewrite shadows the 2,705 prerendered share pages on Cloudflare Pages | FIXED |
| 31 | high | hunt.js:90 | TVmaze similarity guard references undefined `ov`; every uncached TVmaze lookup now returns null | FIXED |
| 32 | high | hq.js:32 | HQ slugifies show names differently from the builder, so 848 shows are invisible to HQ and their overrides land under a key match.js never reads | FIXED |
| 33 | high | match.js:155 | "Names another show" penalty fires on ordinary episode-title words now that the list has 12,065 qualifying titles; 3,041 correctly named files are demoted or dropped | FIXED |
| 34 | high | hunt.js:87 | The tvmazeId override is never used to fetch episodes; HQ tells B to "re-hunt to apply" an id that nothing consumes | FIXED |
| 37 | high | hq.js:130 | HQ's argument sanitiser drops show names containing ! ? / or non-ASCII, turning a one-show rematch into a full 12,746-show match | FIXED |
| 44 | high | hq.js:223 | Per-show rematch/rehunt passes the title and the scripts filter by substring, so 'ER' re-matches 2,904 shows | FIXED |
| 45 | high | hq/index.html:94 | onclick handlers break (and allow JS injection) for any file, title or alias containing an apostrophe | FIXED |
| 46 | high | hq.js:207 | No Origin/Host/content-type check: any web page in the owner's browser can run publish, hunt, taskkill and rewrite overrides via cross-site POST | FIXED |
| 4 | medium | lib/app.js:374 | Declining the 18+ gate on a deep-linked Late Night show leaves main empty | FIXED |
| 5 | medium | lib/app.js:537 | The 'Up next' countdown interval is never cleared on navigation; it calls next() against whatever is playing ten seconds later | FIXED |
| 6 | medium | lib/app.js:495 | Closing the 18+ door does not remove Late Night shows from the hero wall, Continue watching, My List, X-Ray or person pages | FIXED |
| 7 | medium | lib/app.js:418 | state.open/openCtx persist across views, so a card's detail panel reappears after returning home or changing filters | FIXED |
| 8 | medium | lib/app.js:441 | keepTracks restores the previous view's scrollY when navigating home, so '← Browse' lands mid-page | FIXED |
| 10 | medium | lib/app.js:631 | Document keydown handler assumes a show player whenever #v exists and loses shortcuts after scrubbing | FIXED |
| 14 | medium | lib/app.js:471 | Every home re-render restarts the featured wall: hero fades from black, Ken Burns and the 9s timer reset | FIXED |
| 15 | medium | lib/app.js:483 | Collection/network/decade dropdown counts exclude the ~2000 TV movies that the filter itself includes | FIXED |
| 16 | medium | lib/app.js:460 | 'Recently added' shelf and the 'Recently added' sort are meaningless: matchedAt is re-stamped on every match run | FIXED |
| 20 | medium | lib/app.js:394 | importMe persists an unvalidated blob: null entries brick the home and Mine pages on every load; no size cap; __proto__ merge | FIXED |
| 21 | medium | lib/app.js:579 | tvPlay error handling: v.onerror and !ep advance forever with no cap or clock resync, and a failed ensure() rejects silently | FIXED |
| 26 | medium | lib/app.js:141 | Overview truncation regex is missing its backslashes, so cuts land mid-word and eat trailing s/S | FIXED |
| 27 | medium | publish.js:15 | publish.js never commits scripts/show-list.json, which HQ edits and the site build depends on | FIXED |
| 35 | medium | match.js:124 | Shows whose TVmaze record has runtime null get zero coverage: re-banding is skipped and generic bands are then ignored | FIXED |
| 36 | medium | match.js:172 | Sequence fallback bypasses the REACT, foreign-language and other-show checks, so dubbed uploads reach the site | FIXED |
| 38 | medium | match.js:96 | Overrides are read once per process and grids are written per show without a lock: a full match in flight overwrites an HQ rematch with stale decisions | FIXED |
| 39 | medium | match.js:101 | Candidate and TVmaze files are parsed without try/catch inside the per-show loop; a half-written file aborts the whole full match | FIXED |
| 40 | medium | hunt.js:58 | The scrape and TVmaze caches never expire, so re-hunts can only ever see the Archive and episode lists as they were on first contact | FIXED |
| 41 | medium | hunt.js:350 | --refresh runs a full match.js + db.js + preview.js after every hunted show; in the nightly that is minutes of CPU per show | FIXED |
| 47 | medium | hq/index.html:101 | 'Use this' on an alternate never wins while an earlier accepted file for the same episode remains in acceptFiles | FIXED |
| 48 | medium | hq.js:219 | Path traversal in /api/show/:slug reads any .json file on the disk | FIXED |
| 49 | medium | hq-app/main.js:56 | 'Start with Windows' checkbox always reads unchecked because getLoginItemSettings() is called without the args used in setLoginItemSettings | FIXED |
| 50 | medium | hq.js:166 | patchList files a show under types[0] ('90s Sitcoms') whenever the given row name is not an exact type | FIXED |
| 56 | medium | functions/_middleware.js:34 | Password gate 303 builds Location from the raw request path: open redirect via //host paths | FIXED |
| 57 | medium | lib/app.js:598 | About page says 'nothing is sent anywhere' while likes, list changes, watch position and reports are posted to /api/e with a month-long session id | FIXED |
| 58 | medium | functions/api/e.js:23 | /api/e accepts unbounded, unauthenticated, unthrottled writes: body parsed before any size check, no same-origin check, 25 data points per request | FIXED |
| 59 | medium | functions/_middleware.js:22 | Middleware runs on every request (no _routes.json), also after the gate is turned off, so all site traffic counts against the Pages Functions daily request quota | FIXED |
| 62 | medium | lib/app.js:271 | Phone overrides for the card Details button (34 px), card width (138 px) and track gap are dead: later same-specificity base rules win | FIXED |
| 63 | medium | lib/app.js:157 | Search box, Six-Degrees input and the season <select> are 15 px, which makes iOS Safari zoom the page on focus | FIXED |
| 64 | medium | lib/app.js:191 | Featured wall auto-advances every 9 s with no user control on touch devices and ignores prefers-reduced-motion; the swap also destroys keyboard focus | FIXED |
| 67 | medium | art.js:97 | art.js writes art.json only after the whole loop, so the nightly 30-minute cap throws away every fetch of the run | FIXED |
| 12 | low | lib/app.js:540 | readyState===0 is treated as 'the Archive did not answer' even when the browser cannot demux the file | FIXED |
| 13 | low | lib/app.js:518 | Subtitle file loader assumes UTF-8 and two-digit hours | FIXED |
| 17 | low | lib/app.js:434 | Background column: dozens of full-width animated/blended tiles become compositor layers, and the column is never resized after layout changes | FIXED |
| 22 | low | lib/app.js:367 | Legacy voidtv:<slug> migration re-runs on every load, resurrecting history after Clear or Forget | FIXED |
| 23 | low | lib/app.js:560 | bioFor/ensureGraph races: failed bio fetch leaves 'Loading…' forever; GRAPH_LOADED is set before the graph arrives | FIXED |
| 24 | low | lib/app.js:602 | Person page cards' Details button does nothing (toggle sets state.open but personPage never renders a detail panel) | FIXED |
| 28 | low | lib/app.js:656 | page() head interpolates show names unescaped; only double quotes are escaped in meta content; embed mode inlines JSON into <script> raw | FIXED |
| 29 | low | lib/app.js:136 | home-order.json is accepted with only an array check; a malformed entry crashes the home page render | FIXED |
| 30 | low | lib/app.js:53 | assemble() silently builds and publishes an empty or art-less site when show-list.json or art.json fail to parse | FIXED |
| 42 | low | match.js:162 | An accepted file that no longer reaches REVIEW is silently ignored; HQ keeps showing the decision as applied | FIXED |
| 43 | low | art.js:48 | A TMDB id set in HQ never takes effect for a show that already has art or a cached TMDB lookup | FIXED |
| 51 | low | hq.js:116 | Running-now start time renders as '/Date(1791815' because Windows PowerShell serialises CreationDate as \/Date(ms)\/ | FIXED |
| 52 | low | hq.js:150 | Non-numeric TVmaze/TMDB ids are coerced to NaN and persisted as null keys in overrides.json | FIXED |
| 53 | low | hq-app/main.js:46 | Window-open handler forwards any URL scheme to shell.openExternal and navigation is unrestricted | FIXED |
| 54 | low | hq.js:125 | JOBS is in-memory: after an HQ restart running jobs lose their log view and status | FIXED |
| 55 | low | hq.js:108 | scheduledTasks returns nothing for both tasks when the second schtasks query fails | FIXED |
| 60 | low | functions/_middleware.js:6 | Gate cookie is an unsalted truncated SHA-256 of the password shared by every visitor, with no revocation and no brute-force throttling | FIXED |
| 61 | low | backend/maturegate.js:14 | Legacy backend ships dev fallback secrets in the repo (mature-gate HMAC key and spine admin key) | FIXED |
| 65 | low | lib/app.js:332 | Several phone tap targets are well under 40 px: 18 px seek bar, 32-34 px player buttons, 26 px Details button, 28 px chips, ~20 px history ✕ | FIXED |
| 66 | low | lib/app.js:263 | `@keyframes kb` is defined twice; the second definition wins, so each hero slide snaps from scale(1.04) to scale(1) and then zooms to 1.12 | FIXED |
| 68 | low | match.js:227 | Regexes that lost their backslashes: /(.*?)/g parenthetical strip is a no-op and JUNK 'top d+' never matches 'Top 10' | FIXED |

## Notes on the narrower fixes

- #17 background column: only the first six scene tiles animate; the blend stays (it is the look). Revisit if phones stutter.
- #40 cache expiry: a --refetch flag on hunt.js ignores scrape pages older than 14 days; TVmaze caches refresh when an id override changes.
- #60 gate cookie: set a GATE_KEY variable on the Pages project to switch the cookie to a keyed HMAC that can be rotated; without it the old derivation stays.
- #61 legacy backend: it now refuses to start without its secrets instead of using the dev fallbacks; the backend itself is retired.
