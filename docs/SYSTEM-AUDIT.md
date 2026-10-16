# VOIDtv system audit — 16 October 2026

A passive read of the whole system: the player, the rest of the site, the catalog builder, delivery and
the edge functions, HQ, the beta app and day-to-day operations. Nothing was changed while reading.
"Confirmed" means traced in the code or measured in the catalog. "Suspected" means likely but not proven.

The short version: the system works, and its safety rails are good. Its weak points share one pattern.
Each part was built to work on the happy path, and very little of it tells you, or recovers, when the
happy path fails. That is also the story of the number one issue.

---

## 1. Playback (the number one issue)

**What testers see:** the picture freezes for a second or two while the sound carries on, then the
picture comes back behind the sound and stays behind until a reload.

**What it is not:** a broken file. Marco Polo episode 1 was scanned at three points (minutes 4-7, 25
and the full header). Every frame and every slice of sound is in order, picture and sound are tightly
interleaved (within a quarter second), and keyframes are at most 10 seconds apart. A broken file would
also fail at the same spot every time, and a reload would not fix it.

**What it is:** the browser's picture pipeline stalling while its sound pipeline keeps the clock, then
failing to catch the picture back up. Four things in our system make that stall more likely, and three
make it invisible or unrecoverable.

### What makes stalls likely
1. **Some chosen files are much heavier than they need to be.** (Confirmed.) When two copies of an
   episode tie, the builder picks the bigger one (`match.js:221`, `b.sizeMB - a.sizeMB`), and it prefers
   the uploader's original over the Archive's own lighter re-encode (`hunt.js:227`).
   - 3,703 chosen episodes stream at 3 Mbps or more; 497 at 8 Mbps or more.
   - 2,051 episodes passed over an equally trusted copy at under 60% of the bitrate.
   - Example: Baywatch 1x1 plays a 1,520 MB "remastered" file (4.7 Mbps) while a 365 MB original
     (1.1 Mbps) of the same episode sits unused.
   - This is a real contributor, not the whole story: 80% of picks are under 1.5 Mbps, and Marco Polo
     (under 1 Mbps) froze too.
2. **Delivery wanders between Archive servers.** (Confirmed.) Every piece of an episode is requested
   through archive.org, which redirects each request to a storage server. Two pieces of the same episode
   came from two different servers minutes apart. A slow server mid-episode starves the picture.
3. **The show page abandons old videos instead of shutting them down.** (Confirmed.) Each episode
   change rebuilds the whole page (`showView`, `$('main').innerHTML=...`). The old video is detached but
   never paused-and-emptied, so its decoder and buffered data linger until the browser frees them.
   Over a binge this stacks memory and decoder load.
4. **The viewing device itself.** (Confirmed on your PC.) The TV PC had 1.2 GB of memory free out of
   31 GB: Edge held about 30 GB across 124 open pages, plus 54 leftover background windows from my icon
   renders (now closed; 22.8 GB free afterwards). A browser that short on memory stalls its decoders.

### What makes stalls invisible
5. **The freeze raises no error.** Sentry only hears about hard failures, so the number one issue has
   never reached it. (Confirmed.)
6. **The analytics store is not connected.** The player already sends re-sync events and dropped-frame
   percentages, but `functions/api/e.js:31` answers "fine" and throws every event away when the
   Analytics Engine binding is missing, which it is. (Confirmed.) We have no numbers on any of this.

### What makes stalls unrecoverable
7. **There is no fallback copy.** The catalog holds a playable backup file for 8,578 episodes (17.7%),
   but the site build ships one URL per episode (`app.js` line 78 ships `url, min, item, r`). When a file
   stalls or fails there is nothing to switch to. (Confirmed.) Note also that some stored "alternates"
   are other episodes (Baywatch 1x1 lists "Deep Trouble" and "Gold From The Deep"), so they need
   cleaning before a player can trust them (`match.js:228`).
8. **Two players, one of them bare.** Show pages use our own player with the re-sync watchdog. TV
   channels use the browser's built-in controls (`<video id="v" controls>`), with no stall handling,
   no watchdog and no failover. (Confirmed.)

### Solutions, root cause first
1. **Measure:** connect the analytics store in Cloudflare (your two-minute step), and send freezes and
   re-syncs to Sentry with device, browser and show. Two weeks of this says which of 1-4 dominates.
2. **Choose lighter, cleaner files at build time:** rank copies by cost (Archive re-encode first, then
   lowest bitrate, then resolution) instead of "bigger wins"; keep codec risk as a penalty, not a
   badge; keep only same-episode alternates.
3. **One player for the whole site,** created once and reused across episodes and channels, with proper
   teardown, stall detection, failover to a clean alternate at the same moment, and the watchdog as a
   built-in safety net.
4. **Steadier delivery:** resolve the Archive redirect once per episode and stay on that server, falling
   back to the normal link if it fails.

---

## 2. Catalog builder (which file plays)

1. **Heaviest-file tie-break and original-over-derivative preference** (see playback above). Confirmed.
2. **Codec risk is a filename guess and does not affect ranking.** `match.js:70-83`, `:225`. About
   1,837 shipped picks carry a risk note; some are false alarms (an Archive h.264 file named "AC3"),
   and real risks with clean names are missed. A Top Gear episode picked the AC3-tagged copy over a
   clean one by 1 MB. Confirmed.
3. **Playability is decided by the container label.** `hunt.js:37`. "MPEG4" originals of unknown codec
   pass; 16 picks are Ogg Theora, which Safari and iPhones cannot play; 510 episodes are hidden in the
   download-only vault that Chromium could have played. Confirmed.
4. **Dead files are detected but never removed from the live site.** `linkcheck.js` writes
   dead-files.json, but the nightly never runs a full match, so dead URLs keep being served until
   someone clicks Re-match in HQ. At 150 checks a night, a full pass takes about 340 days, and
   alternates are never checked. Confirmed.
5. **The self-list fallback can resurrect junk.** When the strict matcher correctly rejects everything,
   a looser pass lists any 20 files. 109 grids came from it; Fullmetal Alchemist's 39 "episodes" are
   PS2 game walkthroughs, shipped in review state. Confirmed output; exact bypass suspected
   (`match.js:236-243`, `:277`).
6. **A TVmaze hiccup is cached forever as "no episodes."** `hunt.js:96`. Nine shows are stuck that way
   now (Babylon 5, The Rockford Files, Highway to Heaven…). Confirmed.

---

## 3. The site (everything except the player)

1. **A show page can hang on "Searching the Void…" forever.** `ensure()` never checks that the show
   file loaded, and nothing catches the failure; a shared link to a removed show renders a blank page.
   `tvPlay` has the same gap. Confirmed.
2. **Every click rebuilds the entire page.** Opening a menu, liking a show, each search keystroke
   (no debounce): about 40 filter passes over 4,600 shows, every shelf and dozens of background layers
   rebuilt, keyboard focus lost each time. This is the main cause of sluggishness on phones. Confirmed.
3. **Heavy downloads, and one point of failure.** `data/index.js` is 2.9 MB and blocks the page; if it
   fails, the page is blank. Six Degrees fetches 7.8 MB; Live TV fetches 1.9 MB with every episode
   repeated per channel. Confirmed.
4. **Live TV points at shows by list position.** A cached index plus a fresh TV file (5-minute window
   after a deploy) plays the wrong shows, and every catalog deploy reshuffles the lineup. Confirmed.
5. **Keyboard shortcuts ignore Ctrl/Alt.** Ctrl+C opens a file picker on a show page, Ctrl+F toggles
   fullscreen, Escape leaves the show. Confirmed.
6. **Keyboard and screen-reader access is mostly missing.** Genre pickers, episode rows, channel rows
   and several header links are not focusable; the home page has about 2,500 tab stops. Confirmed.
7. **Personal lists are overwritten across tabs.** A playing tab rewrites saved state every 5 seconds,
   erasing changes made in another tab; importing an older export overwrites newer history, and
   reported files are dropped on import. Confirmed.
8. **Live TV end-of-episode glitch:** a short file replays its last seconds from the start; the guide
   never refreshes. Confirmed.
9. **The home banner keeps downloading in a background tab** (about 1 MB a minute). Confirmed.
10. **Filters and search are not in the address,** so Back on a phone leaves the site. Confirmed.

---

## 4. Delivery, edge functions, HQ, beta, operations

1. **Every request runs through a Cloudflare Function, now and after opening day.** `site.js:70` sends
   all routes through the gate function unless built with `--open`, and the opening-day steps in
   DEPLOY.md don't add it. The free tier is 100,000 Function calls a day; past it the whole site errors,
   not just analytics. Building with `--open` while the password is still set would silently remove the
   gate. Confirmed.
2. **The analytics endpoint can be flooded** by any script (no rate limit; the browser-origin check is
   skipped when the header is absent), and each viewer sends about one call a minute while watching.
   Confirmed (the exact free data allowance is unverified).
3. **Every publish rewrites about half the catalog** because each grid stores a fresh "matched at"
   time (`match.js:247`, `:302`). Roughly 12 Cloudflare builds a day against a 500-a-month free cap,
   and a fast-growing repository. Confirmed.
4. **The site is at 14,750 files against Cloudflare's 20,000 per deploy,** with no warning before the
   limit; at the limit builds fail and the old site stays up. Confirmed.
5. **The bad-catalog guard is loose:** a catalog that shrank from 4,645 shows to 150 would still ship.
   Unreadable grid files are silently skipped, and publish can commit a half-written file. Confirmed.
6. **A failed push is never retried,** and the doctor's light hides it. Confirmed.
7. **Caching can mix old and new files** for up to 5 minutes after a deploy (pages, data and TV lineup
   are cached separately and unversioned); the main site sends no security headers. Confirmed.
8. **Password gate:** unlimited guesses; without the GATE_KEY setting the cookie is a plain hash of the
   password. Suspected risk, low while testing.
9. **Beta app:** two quick reports from one tester can race; each report costs 3-4 storage writes, so
   250-330 reports a day hit the free limit and errors aren't handled. Confirmed.
10. **HQ:** any program on the PC can drive it (no token); after a restart, Stop can kill an unrelated
    process that reused an old process number. Suspected, local only.
11. **One PC runs everything,** including the doctor that would report the PC being down; the keys in
    backend/.env exist only on that PC. Confirmed.

No secrets were found in git (the search could not cover full history).

---

## 5. What is solid — keep it

- Build guards: the page script is parse-checked, trailing comments are rejected, and a failed
  Cloudflare build leaves the previous site live.
- The matcher's defences against reaction videos and other shows, the overrides, and the premiere-date
  rule. Marco Polo and 30 Rock show clean, consistent picks.
- HQ's browser defences (host allowlist, origin check, JSON-only posts, a fixed list of allowed jobs,
  no shell), escaping in every admin and tester view, and the gate's open-redirect protection.
- Lazy shelves, batched analytics with beacons, consistent output escaping, thoughtful mobile and
  reduced-motion CSS, and the per-show data split.

---

## 6. Suggested order

1. **Measure** (connect analytics; freezes and re-syncs to Sentry).
2. **Delivery safety** (routes and gate from one switch; rate limit the analytics endpoint; publish only
   real changes; file-count and catalog-shrink guards). These protect the site from going down.
3. **File choice in the builder** (lighter clean copies, real codec data, same-episode alternates,
   dead files removed nightly).
4. **One player** (shared by shows and TV, teardown, failover, stall handling, watchdog inside).
5. **The site's structure** (update only what changed, smaller index, load errors handled, real
   buttons and links, state in the address, tab-safe saving).
