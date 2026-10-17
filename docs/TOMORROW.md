# Work plan for 18 October 2026 (Fable, ultracode)

Ordered for the most benefit to viewers first. Each package says what "done" means, which parts suit parallel
agents, and what needs Bryan. Background for every item: `docs/BACKLOG.md`, `docs/SYSTEM-AUDIT.md`,
`docs/KIDS.md`, `player/DESIGN.md`.

## 0. First 20 minutes (one thread, before any agents)

1. Read `docs/BACKLOG.md` (items 1-10) and this file.
2. Pull the evidence that arrived overnight:
   - Sentry, org `church-of-american-strength-ho`, project `voidtv`: every "Playback trouble: <show>" issue
     since 17 Oct (each has a timeline: stalls with buffer level, freezes, drifts, server switches, fixes).
   - `version.txt` on voidtv.net matches `git log -1` (the deploy is current).
   - Whether Bryan added the Cloudflare Analytics Engine binding (`VOIDTV_EVENTS`); if yes, HQ > Analytics.
3. Ask Bryan the open decisions in one message (section 9), then start packages 1 and 2 in parallel.

## 1. Streaming pauses and audio stutter (highest viewer impact)

Goal: no visible pause longer than about 3 s, and no audio stutter, on any device testers use.

- **Classify the evidence.** For each Sentry timeline: starved stall (buffer empty), buffered stall, frozen
  picture, drift, silent copy. Count by cause, show, server, browser and device. *Parallel:* one agent per
  batch of Sentry issues, then one agent to merge.
- **Audio stutter is a separate symptom.** Hypotheses to test against the timelines: each server switch or
  catch-up jump cuts the sound for a moment; Chromium's audio renderer under-runs on HDMI/TV output; dropped
  frames under load. *Parallel:* a research agent on Chromium/WebKit media pipeline behaviour (underflow,
  seeking, audio renderer), adversarially checked by a second agent.
- **Candidate fix to evaluate:** a hot-standby switch. When the buffer runs thin, preload the same moment
  from the other Archive server in a hidden second video, then swap with no gap, instead of reloading the
  one video. Prototype in `player/` with core tests first, then the lab.
- **Done when:** a cause table in `player/DESIGN.md`; any fix covered by `node --test player/test/core.test.js`;
  a 2-hour lab soak (`player\LAB.cmd`, Soak test) shows no pause over 3 s; deployed; Sentry trouble rate
  watched for a day.
- **Do not** build the relay server: that needs Bryan's legal decision (section 9).

## 2. Catalog quality engine (the Parkers, Fullmetal Alchemist, "review")

Goal: wrong-show files never reach the site, and the library meets a standard Bryan can see.

- **Fix the self-list fallback** in `scripts/match.js` (around lines 236-243 and 277; see audit catalog item 5):
  never fall back when the strict matcher rejected files as wrong show or type; require positive episode-shaped
  evidence. Re-match and check: The Parkers shows only real episodes (or nothing), Fullmetal Alchemist has no
  walkthroughs.
- **Find why 4,570 "S/E in filename + title match" episodes are still REVIEW.**
- **Library standard, dry run** (backlog item 5): a report `docs/LIBRARY-STANDARD.md` listing, per home row,
  what survives candidate rules (TVmaze-matched, minimum confident episodes, coverage, no junk uploads, playable
  in mainstream browsers). Delete nothing.
- **Stop catalog churn:** write a grid only when its content changed (ignore `matchedAt`), so publishes stop
  rewriting ~2,000 files and burning Cloudflare builds.
- **Dead files:** run the match step in the nightly after `linkcheck`, so retired links leave the site.
- *Parallel:* verifier agents over samples of shows (say 40 shows each) that look at picks' filenames and Archive
  metadata for wrong-show or junk content; findings merged and deduped; a regression check on the 100 most
  played shows (picks must not get worse).
- **Done when:** fallback fixed with before/after counts; the Parkers and Fullmetal Alchemist verified; standard
  report written; churn fix shows a publish touching only changed grids.

## 3. Quick, visible wins (one thread, after 2's matcher change is in)

- **Hide the "review" label and its hint** on the site; keep the state in the data (backlog item 8).
- **New tags and rows** (backlog item 9): "Conspiracies & the Unexplained" (Ancient Aliens and similar leave
  History/Discovery/Science), "420 & Stoner Comedy", "Satire". Candidates: `node scripts/tag-candidates.js`.
  Bryan confirms the satire list; title-only conspiracy matches need a look (Ancient Rome is real history).
- **Done when:** a local build shows Ancient Aliens outside every history row, the three rows exist, no review
  labels; deployed.

## 4. Keep watching while browsing (mini player)

- Backlog item 7. Instead of `killPlayer()` on every page change, a playing show moves into a small corner dock
  with close, play/pause, back/forward and expand (expand re-attaches the same player on the show page).
  Live TV is out of scope (it just stops).
- **Done when:** core/player tests for the dock; local build checks: browse while playing, expand back, close,
  next episode from the dock, phone width; deployed.

## 5. Delivery safety before opening day (audit section 4; suits parallel agents)

- Gate and Functions routing from one switch, so pages stop costing Function calls once the password is off
  (today every request counts against the 100k/day free limit); rate limit on `/api/e`; file-count guard
  (14,750 of 20,000 per deploy); refuse a catalog that shrank more than ~10%; publish retries a failed push.
- **Done when:** each has a test or a doctor check, and DEPLOY.md's opening-day steps are right.

## 6. VOIDtv Kids foundations (build the machinery, not the site)

Bryan's direction is in `docs/KIDS.md`: classic to current PBS Kids, Hanna-Barbera and the colour era, commercial
classics, strict safety. Before the site exists:

- **Kit seams:** per-profile logo, colours, copy, and feature switches (downloads, CASH strip, people pages,
  search scope, analytics "no identifiers" mode, self-hosted artwork).
- **Ratings in the builder:** fold the TMDB rating fetch (`catalog/cache/tmdb-ratings.json`) into `scripts/art.js`.
- **Strict-match profile flag** and the junk vocabulary as data (`profiles/kids/`), including the runtime rule
  measured against each show's own runtime (theatrical shorts are 6-8 minutes).
- **Candidate list:** the 40 PBS-era titles, the 38 classic cartoons and commercial classics from `docs/KIDS.md`,
  with ratings; the hunt itself is Archive-facing (two jobs at most, see rules).
- **Done when:** a `kids` profile builds a small local site from approved shows only, with VOIDtv branding gone.

## 7. "As aired" network blocks on VOIDtv

- Backlog item 10: a new catalog kind for broadcast blocks (network, date aired, block, length), a scout that lists
  Saturday-morning, Nickelodeon, Cartoon Network/Toonami, Fox Kids, Kids' WB, SNICK recordings, and rows ordered
  by air date. Prototype locally; deploy when Bryan has seen it.

## 8. Brand colours (needs Bryan's artwork, or propose)

- Neon palette from the backgrounds: pink `#dd249d`/`#dc20a9`, blue `#0ebbd5`/`#0ac1e0`, violet `#a954e3`.
  If Bryan's new mark is not in yet, make a side-by-side proposal (current vs neon) with
  `brand-kit/tools/make_app_icons.py`; do not deploy brand changes without him.

## 9. Decisions to ask Bryan at the start (one message)

1. Kids domain: which name (`voidtvkids.com`, `voidtvkids.net`, `voidkidstv.com`, `voidkids.tv`, `voidtv.kids`)?
2. Kids commercial tiers: current clean shows (Bluey, Blue's Clues, Dora...) after a legal view; junk-heavy
   (Paw Patrol, Peppa, Cocomelon) in with per-file approval, or out?
3. Relay server for zero pauses (about €4-6/month): get a legal view first, or not now?
4. Live TV: keep as is, hide, or remove?
5. Satire row: approve the candidate list together, or Bryan picks from it later?

## House rules for every agent

- Never type, print or store the site password; the password gate stays on until Bryan says otherwise.
- Tokens live only in `backend/.env` (gitignored); never in code, commits or chat.
- At most **two** jobs talking to the Internet Archive at once (hunts, scouts, link checks).
- No downloading video files to this PC; brief **muted** playback probes only when debugging a reported failure.
- Don't run the full site build for small fixes (Cloudflare builds on push); do run it before deploying anything
  that changes `scripts/lib/app.js` or `scripts/site.js` broadly, because its checks catch broken pages.
- Every player change keeps `node --test player/test/core.test.js` green and adds a test for the new behaviour.
- Commit with the attribution line; push only verified work; confirm `version.txt` after each deploy.
- Bryan wants root causes, not band-aids: if a fix only hides a symptom, say so and propose the real fix.
