# VOIDtv backlog

Issues and ideas Bryan logs between working sessions. Newest first. Each item says what is already known,
so a session can start on the work instead of the digging.

## Logged 17 October 2026 (for the session on 18 October)

### 1. The Parkers is mostly not The Parkers (catalog quality)
- 828 of its 830 "episodes" are children's videos: "All Kids Videos Collection #3 / #4" (Care Bears and
  similar, 798 files), "Parker's Puzzle" (27) and "Jame Dude, Parkers Place" (2). Only one file is the
  real show, a WSBK broadcast recording from 10 September 2001.
- Cause: the matcher's self-list fallback (`scripts/match.js` around lines 236-243 and 277). When the strict
  matcher rightly rejects everything, a looser pass lists any 20+ files whose titles start with the show's
  name. Same flaw as Fullmetal Alchemist's 39 PS2 game walkthroughs. 109 grids came from this fallback
  (`tvmazeWeak`), 229 are self-listed in total. See `docs/SYSTEM-AUDIT.md`, catalog item 5.
- Fix at the root (the fallback rule), then re-match, rather than hiding single shows. Ties into item 5.

### 2. Logo colours should match the neon in the background art
Sampled from the hot cores of the glowing tubes in `assets/brand/bg/`:

| Colour | sign-pink.jpg | wall.jpg |
|---|---|---|
| Hot pink / magenta | `#dd249d` | `#dc20a9` |
| Neon blue | `#0ebbd5` | `#0ac1e0` |
| Violet accent | `#b255dc` | `#a954e3` |

The mark today is blue `#29a3f2`, orange `#f7960f`, green `#2cf01a`; the site's UI cyan is `#5fd4ff`.
Bryan is redrawing the artwork (pack in `brand-kit/VOIDtv-artwork-pack.zip`); new marks go into
`brand-kit/marks/` and `python brand-kit/tools/make_app_icons.py` rebuilds every icon size. Decide whether
the UI cyan moves to the neon blue too.

### 3. Streaming pauses and audio stutter, continue debugging
- State on 17 Oct: the new player is live. It switches Archive server 3 s into a stall with an empty buffer
  and cycles servers; Bryan reports Marco Polo 1x1 pauses are less dramatic but still there.
- Evidence so far: the Archive's storage servers hang intermittently and in bursts (3 of 6 requests failed or
  crawled within a minute; then 76 of 76 were healthy over 15 minutes). Browsers buffer only ~20-40 s and
  never retry a hung request elsewhere. The servers do not allow pages to read video bytes (no CORS).
- New data to read first: Sentry issues "Playback trouble: <show>" (org church-of-american-strength-ho,
  project voidtv). Each carries the timeline: stall/freeze/drift times, buffer ahead, server switches.
  Shift+D in the player shows live stats with a copy button. `player\LAB.cmd` runs soak tests.
- "Audio stutter" is a separate symptom from the picture freezing; check whether it lines up with starved
  stalls, server switches (each switch is a brief cut) or the browser itself.
- Open decision: a pass-through relay (about €4-6/month on a small server; Cloudflare Workers is risky under
  their video terms) would hide server hangs entirely. Needs a legal view first; wait for Sentry data.

### 4. Advertise how fast streaming starts
- Testers say it is noticeably fast. Back the claim with real numbers before using it.
- Measured in tests: first picture 0.1 to 2.7 s from the Archive's storage server directly.
- Real-viewer numbers need the Cloudflare Analytics Engine binding (`VOIDTV_EVENTS`), still not added; the
  player already sends startup time (`started` events) and stall totals.
- Ideas: a line on the gate/home ("starts in under 3 seconds, no ads, no account"), the about page, merch.

### 5. A higher standard for the whole library
- Goal: filter the large library down to actual titles with a better standard across the board, and see
  whether a good selection remains. Keep building other areas (VOID University etc.) alongside.
- Do it as a dry run first: a filter that reports, per home row, what survives, without deleting anything.
- Candidate rules to agree on: matched to a real TVmaze listing (not self-listed); at least N confident
  episodes; coverage %; no reaction/review/walkthrough/kids-compilation uploads; picture and bitrate floor;
  no wrong-language versions; playable in mainstream browsers.
- Tools that already exist: `scripts/match.js` (rules), `player/tools/rank-sources.js --stats` (file quality
  per episode), HQ overrides (hide), `docs/SYSTEM-AUDIT.md` (known catalog flaws).

### 6. VOIDtv Kids
- Plan written: `docs/KIDS.md` (separate kit profile; allowlist with official TMDB age ratings, strict
  matching, HQ review with frame contact sheets; no personal data; ~54 shows / 2,400 episodes play today in
  kids bands, preschool is the gap). Needs Bryan's answers to the four questions at the end, and a legal
  view on the COPPA posture, before building.

### 7. Keep watching while browsing (mini player)
- Wanted: when a viewer goes back to browse, the show keeps playing in a small window with close,
  play/pause, back/forward and expand (expand returns to the show page at the same moment).
- How it fits the new player: today every page change shuts the player down (`killPlayer()`, added when the
  player was connected). Instead, if it is playing, move the player into a small fixed "dock" in the corner.
  Moving the element in one step does not interrupt playback. The dock gets its own compact controls; expand
  re-opens the show page and re-attaches the same player, so nothing reloads.
- The browser's own picture-in-picture (the PiP button) already shows play/pause and, through Media Session,
  skip and next buttons in its floating window, and can float over other apps. Chrome and Edge 116+ also
  offer "Document Picture-in-Picture", which can hold our own controls including expand. Firefox and Safari
  only do the basic version.
- Truly automatic browser PiP (floating over other apps without a click) is limited by browsers to special
  cases, so the in-page dock is the dependable "automatic" behaviour; the PiP button stays for floating
  outside the site.
- Decide: does Live TV also dock, or stop, when leaving the TV page? (Probably dock, labelled with the channel.)

### 8. Remove the "review" label from episodes
- 31,215 of 50,820 shown episodes (61%) carry it, mostly (20,605) from shows with no TVmaze episode list,
  where titles and order come from the files. On 6 in 10 episodes the label means nothing to a viewer.
- What it is for: the builder's "not sure this file is that episode". That need is internal: HQ's review
  queue, the kids site (review episodes never appear there), and item 5's library standard (shows that are
  mostly review are the first to fix or filter). Viewers keep the "Wrong file?" button.
- Do: hide the label and its hint text on the site; keep the state in the data. Also find out why 4,570
  episodes matched by "S/E in filename + title match" (normally a confident match) still ended up in review.

## Still open from earlier
- Cloudflare: add Analytics Engine binding `VOIDTV_EVENTS` (dataset `voidtv_events`) on the voidtvsite
  Pages project and retry the deployment; optionally `CF_ACCOUNT_ID` / `CF_ANALYTICS_TOKEN` in backend/.env.
- Beta app: recreate any tester invites made before 16 Oct (an audit cleanup removed all testers).
- Delivery risks from the audit (site down at 100k Function calls/day; file count near 20,000; publish churn).
