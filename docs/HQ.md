# HQ: the admin, and analytics

B, 2026-10-14: "a complete HQ admin built that I can operate this now without LM assistance for many
of the things. Also analytics fully done so I can learn and see who is watching."

## Two decisions

**HQ runs on B's PC**, not on the web. `node scripts/hq.js` opens http://localhost:8780. The builder
(hunts, matcher, art, people, publish) already lives on this PC and the catalog is files in this repo,
so the admin is the natural front for them: no hosting, no login, no secrets on the site. Publishing
from HQ is the same `publish.js` commit-and-push the scheduler runs. A hosted, read-only slice (or a
phone remote) can come later if B wants to act from outside the house.

**Analytics are first-party and anonymous.** The site posts small events to a Pages Function
(`/api/e`), which stamps them with what Cloudflare already knows about the request (country, region,
city, device, browser) and writes them to a Workers Analytics Engine dataset. No cookies for tracking,
no names, no IPs stored; an anonymous session id lives in the visitor's own browser and rotates
monthly, so uniques and sessions can be counted without identifying anyone. HQ reads the dataset
through Cloudflare's SQL API with a token kept in `backend/.env`. "Who is watching" therefore means:
where they are, on what device, when, what they open, what they play and for how long, what they
search, what fails. Cloudflare's own Web Analytics (free, one toggle) can sit alongside for a second
opinion on raw traffic.

## The desktop app

B (2026-10-14): "build the HQ as an actual app." `hq-app/` is an Electron shell: it starts
`scripts/hq.js` inside its own process and shows it in a window titled VOIDtv HQ, with a tray icon
(Open HQ, Open in browser, Open player lab, Start with Windows, Quit). Closing the window hides it to the tray; jobs it
started keep running even after Quit. It remembers where the repo is (app config), so a `git pull`
updates HQ without reinstalling.

- **The player lab is built in** (B, 19 Oct 2026; app 1.1.0). The **Player lab** button in the HQ header, or the tray's
  **Open player lab**, opens `player/lab/` in its own window. HQ serves the `player/` folder on `127.0.0.1:8792`, the
  same address `player\LAB.cmd` uses, from the moment it starts, so the lab address also works in Edge without LAB.cmd.
  If LAB.cmd's server already holds the port, HQ uses it; if LAB.cmd is closed later, HQ takes the port over the next
  time the lab is opened from HQ (until then the Edge address is dead). The button and the tray item bring an open lab
  window forward at once and never reload a live page, so a running soak is safe; only a lab page that failed to load
  is loaded again. The lab window is set
  not to slow its timers and drawing when it sits behind other windows (Electron's backgroundThrottling off). That is a
  setting, not yet a measurement: before trusting a long soak, cover the lab window for 5 to 10 minutes and check that
  the Live panel keeps counting frames and never says hidden. It is Chromium, not Edge: a drift that shows in Edge and
  not here points at Edge's own power features. The server answers only this PC's own names (127.0.0.1, localhost),
  reads only inside `player/` and never lists folders. Code: `hq-app/lab.js`; tests: `tests/hq-lab.test.js`.
- The header button needs the 1.1.0 app or LAB.cmd: with only `node scripts/hq.js` or `HQ.cmd` running, nothing serves
  8792, so start `player\LAB.cmd` first.
- The app's icon is the site's own artwork (`assets/brand`, crops of Bryan's 19 Oct favicon sheet), made by
  `audit/drafts/favicon/hq_icons_site.py`: `hq-app/build/icon.ico` holds the site's favicon frames at 16, 32 and 48 px
  (the glowing "vt" TV, the same as the browser tab), 24 px from the 48, and the glowing "voidtv" TV from
  `icon-512.png` at 64, 128 and 256 px; `icon.png` is that TV at 512 px. The windows and the tray use the .ico on
  Windows. If Windows still shows the old icon after installing, restart Explorer (its icon cache).
- Installed at `%LOCALAPPDATA%\Programs\VOIDtv HQ\VOIDtv HQ.exe`; Start Menu entry "VOIDtv HQ".
- Installer: `hq-app/dist/VOIDtv HQ Setup 1.1.0.exe` (not in git). Rebuild with
  `cd hq-app && npm install && npm run dist`. Quit HQ from the tray before installing over it.
- Only one copy runs at a time; launching it again just brings the window forward.
- The plain `node scripts/hq.js` and `HQ.cmd` still work and serve the same page.

## HQ v1, in build order

1. **Overview**: catalog counts (shows live / review / missing, episodes, per row and collection),
   builder status (which jobs are running, from `catalog/cache/*.lock`), last publish and nightly
   results, log tails.
2. **Shows**: searchable table (row, collection, state, coverage); a show page with the season-by-
   episode grid (LIVE / REVIEW / MISSING), each episode's file and alternates with a preview player,
   and the actions B does today by asking: accept a REVIEW file (-> LIVE), reject a file (excluded,
   matcher re-picks), add an alias, exclude an Archive item, set the TVmaze / TMDB id or the search
   name, hide the show, re-hunt or re-match this show now. All of it writes `catalog/overrides.json`
   (B's edits layer; the builder reads it, never writes it).
3. **Jobs**: start and stop hunts (balanced, by row, by collection, one show), the TV-movie hunt, art,
   people, matcher, scout, network sweep; live log; the two scheduled tasks' last runs.
4. **Publish**: one button = `publish.js`; shows the commit and a link to the Cloudflare deployment.
5. **Reports**: "Wrong file?" reports now arrive as analytics events, so they queue here with the
   show, episode and file; resolve by rejecting the file or dismissing.
6. **Add shows**: a form (name, row, network, collections) with TMDB / TVmaze lookup, and a paste box
   for a list; writes `scripts/show-list.json`.
7. **Rows and collections**: home order (drag), rename, the hunt priority (`--first`).
8. **Analytics**: visitors and sessions by day; countries, regions and cities; devices and browsers;
   top shows and episodes by plays and by hours watched; completion; Live TV tunes by channel;
   searches (with no-result searches surfaced as hunt leads); errors and unplayable files; referrers;
   date range; CSV export.

## Hidden: what the site keeps off, sorted by hand

B, 25 Oct 2026: "I'd like the ability to in the future sort these and assign these episodes names. I want all of the hidden things able
to be worked." The **Hidden** tab lists the two kinds of things voidtv.net keeps off the site (a wrong episode is worse than a missing one):

- **Guessed episodes**: files the matcher placed by position, the Nth file of a disc rip taken as episode N (`epNoGuess` in
  `scripts/lib/app.js` hides them). One row per show, most guesses first; opening one shows only its guesses, with the preview player.
  Per file: **Place** on the right season and episode, **Accept** where it is, **Reject**, or **Name** (the episode name the site shows).
  Each choice re-matches that show, as every decision on a show page does.
- **Unsure TV movies**: REVIEW films (`movieShips` hides them). **Approve**, **Un-approve**, **Not this film**; no re-match.

What each button writes in `catalog/overrides.json` (the file key is `<Archive item>|<file name>` as the grid prints them):

| Button | Entry | Read by |
|---|---|---|
| Place | `"<slug>": { "placeFiles": { "<item>\|<name>": "2x5" } }` | scripts/match.js: the file takes that episode, LIVE, ahead of any other file; a slot not on the guide places nothing |
| Name | `"<slug>": { "fileTitles": { "<item>\|<name>": "The Title" } }` | scripts/match.js: the episode playing that file shows the name; the guide's name stays as `guideName` |
| Accept / Reject | `acceptFiles` / `rejectFiles` (as on the show page) | scripts/match.js |
| Approve / Un-approve | `"movie-<id>": { "approved": true }` / entry removed | movieShips in scripts/lib/app.js |
| Not this film | `"movie-<id>": { "rejected": true }` | HQ only (the movie was hidden already); it leaves the to-do list |

The lists come from `scripts/lib/hidden.js` (`GET /api/hidden/episodes`, `GET /api/hidden/movies`); the two keyed lists are written with
`POST /api/override/<slug>` and `{ "map": { "placeFiles": { "<key>": "2x5" } } }` (null removes an entry; a placement must be season x
episode, a title one line). The runbook rows `episodes:guess-hidden` and `movies:review-hidden` give the same steps by hand.
Tests: `node --test tests/hidden-work.test.js`.

## Events the site sends

`view` (page, slug) · `play` (slug, season x episode, file) · `tick` every 60 s while playing (position,
duration) · `search` (query, result count) · `tune` (channel) · `act` (like / list / hide) · `report`
(slug, episode, file) · `error` (slug, episode, file, code). Each point also carries country, region,
city, device, browser, referrer host and the anonymous session id.

## What B does once in the Cloudflare dashboard

- Pages project `voidtvsite` -> Settings -> Bindings -> Add -> Analytics Engine: variable
  `VOIDTV_EVENTS`, dataset `voidtv_events`. Until this exists the function accepts events and drops
  them, so nothing breaks.
- An API token with "Account Analytics: Read", pasted into `backend/.env` as `CF_ANALYTICS_TOKEN`
  (account id `CF_ACCOUNT_ID` is the long hex in the dashboard URL). Only HQ on this PC uses it.
