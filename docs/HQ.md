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
(Open HQ, Open in browser, Start with Windows, Quit). Closing the window hides it to the tray; jobs it
started keep running even after Quit. It remembers where the repo is (app config), so a `git pull`
updates HQ without reinstalling.

- Installed at `%LOCALAPPDATA%ProgramsVOIDtv HQVOIDtv HQ.exe`; Start Menu entry "VOIDtv HQ".
- Installer: `hq-app/dist/VOIDtv HQ Setup 1.0.0.exe` (not in git). Rebuild with
  `cd hq-app && npm install && npm run dist`.
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
