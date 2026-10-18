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
3. Ask Bryan the open decisions in one message (section 9).
4. Freeze the audit baseline and run the machine checks (section 10, ground rules 1-2).
5. Start packages 1 and 2 in the real tree, and package 10's phases A-D in the audit worktree; those phases edit
   nothing. Packages 1, 2 and 5 log their findings in the shared `docs/audit/findings.json`.

Realistic scope: package 10 runs over several days (see its schedule). Today's priority is 0, 1, 2 and 10's
phases A-D; packages 3 and 4 if time allows; 6, 7, 8 and the logo-led motion pieces wait unless they block launch.

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

*Now runs inside package 10:* its Cloudflare inspector covers these items, and they are on the launch criteria
(10H). The list stays here as the known starting findings.

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

**Built overnight 17-18 Oct (the Voidtv chat).**
- **The name:** "voidtv.net kids" (Bryan's naming rule).
- **Where it lives:**
  - data in `profiles/kids/` (untracked; excluded in `.git/info/exclude` until reviewed);
  - code on branch `kids` in the worktree `C:\Users\bryan\void-kids`, committed locally as f6947bf2d. It is not
    pushed or merged; review it with `git diff master...kids`.
  - backup of the data: `C:\Users\bryan\void-channel-backups\voidtv-kids-data-2026-10-18.zip`.
- **Done so far:**
  - the lineup of 121 shows, TVmaze-pinned and rated;
  - Archive hunts, run all night;
  - strict matching (`scripts/lib/strict.js`), with VOIDtv output proven identical;
  - the kids site build: approved-only plus `--preview`, feature switches, kids theme, Play all;
  - the kids gate (`GATE_BRAND=kids`) and the COPPA-safe analytics switch (`ANALYTICS_MODE=aggregate`);
  - self-hosted posters (115) and descriptions (119);
  - the review sheet and `approve.js`, `HQ-KIDS.cmd` (port 8782), and the domain steps.
- **Start here:** `profiles/kids/docs/OVERNIGHT.md`, then `DEPLOY-KIDS.md` and `REVIEW.html`.
- **Also fixed in the branch:** hunts treated slow connection timeouts on this PC as Archive refusals and waited
  minutes each; they now retry in seconds.
- **Bryan's direction (18 Oct, about 3 AM):**
  - Build voidtv.net kids from what worked on voidtv.net and the lessons learned there (`profiles/kids/docs/FROM-VOIDTV.md`).
  - Put it on its own domain.
  - Link the two sites to each other through a "portal" area, the start of a VOID universe of sites. The kids side
    keeps a grown-up check before any way out.

## 7. "As aired" network blocks on VOIDtv

- Backlog item 10: a new catalog kind for broadcast blocks (network, date aired, block, length), a scout that lists
  Saturday-morning, Nickelodeon, Cartoon Network/Toonami, Fox Kids, Kids' WB, SNICK recordings, and rows ordered
  by air date. Prototype locally; deploy when Bryan has seen it.

## 8. Brand colours (needs Bryan's artwork, or propose)

- Neon palette from the backgrounds: pink `#dd249d`/`#dc20a9`, blue `#0ebbd5`/`#0ac1e0`, violet `#a954e3`.
  If Bryan's new mark is not in yet, make a side-by-side proposal (current vs neon) with
  `brand-kit/tools/make_app_icons.py`; do not deploy brand changes without him.

## 8b. Motion graphics kit: stings for every place VOID needs motion

Bryan wants a full motion package. Build it as a kit in `brand-kit/motion/` with the HyperFrames skills
(`/motion-graphics` for each sting; renders MP4 and transparent WebM/MOV). Existing pieces to replace or reuse:
`assets/brand/video/sting.mp4`, `reel.mp4`, `set.mp4`.

**Depends on:** Bryan's redrawn mark (or the vector marks in `brand-kit/marks/`) and the neon colour decision
(item 8). Start with the pieces marked *no logo needed*; make the logo-led ones once the mark is settled.

**Status 17 Oct:** pieces 3, 4, 5 and 6 are **done and live** in the player (signal "tuning in", gold recovery
sweep with its reason, no-signal static card, up-next ring); preview all four at `player/lab/states.html`.
Editable HyperFrames sources already exist for the logo sting (`videos/voidtv-sting`, 4 s, 1080p, no sound),
the reel (`videos/voidtv-reel`, 40 s, 720p) and the TV-set loop (`videos/voidtv-set`, 13 s): derive pieces 1,
2, 7-13 from them with the new mark and colours rather than starting over. Piece 14 (sound logo) is new.

**Later on 17 Oct:**
- **TV-and-static stings, rendered in 16:9 and 9:16 (no sound yet):** each lives in `videos/<name>/`, with its
  renders in `renders/`:
  - `voidtv-tvwall`, the TV wall (Bryan approved this style);
  - `voidtv-tunein`, an intro;
  - `voidtv-hold`, an ident;
  - `voidtv-poweroff`, an outro whose dot becomes the "." in voidtv.net;
  - `voidtv-stack`, the "free tv · no ads · no account" ad.
- **The motion editor kit** is in `motion/` (`Start-HQ.cmd`, port 8221): 4 base pieces plus 21 ads in 16:9,
  9:16 and 4:5.
- **HQ** gained Motion and Promos tabs (`scripts/lib/promos.js`): send renders to slots on voidtv.net (gate,
  home, /promos), make share copies, and a separate "Go live" commit. It was committed as `63d7c0967`; on the
  night of 17 Oct master was 3 commits ahead of origin (not pushed), and `motion/` and `videos/voidtv-*` were
  untracked.

| # | Place | Piece | Length | Format | Notes |
|---|---|---|---|---|---|
| 1 | Brand master | Logo sting: static resolving into the mark, with a short sound logo | 3-4 s | 1080p and 4K MP4 + transparent WebM/MOV | Every other sting derives from this one |
| 2 | Gate page | Seamless wordmark/neon loop behind the password box | 8 s loop | muted WebM/MP4 under 1.5 MB, plus a still | Must not slow the gate; still frame for reduced motion |
| 3 | Player loading | "Tuning in" signal animation, replacing the spinner | 1.5-2 s loop | Lottie or CSS/SVG (no video) | *No logo needed.* A video can't play while a video loads |
| 4 | Player recovery | "Reconnecting / switching servers" static-to-signal flicker | 1-2 s loop | Lottie or CSS/SVG | *No logo needed.* Calm, not alarming |
| 5 | Player failure | "No signal" card with gentle static | 2-4 s loop | Lottie or CSS/SVG | *No logo needed* |
| 6 | Up next | Countdown ring and title slide-in | 10 s | CSS (the player's card) | *No logo needed* |
| 7 | Play all / As aired | "You're watching VOIDtv" ident between episodes or blocks | 3 s | MP4 + WebM | Optional per viewer; never delays a first play |
| 8 | As aired blocks | Retro "We'll be right back" and "Now back to..." bumpers, 1980s-90s look | 3-5 s each | MP4 | Fits the Saturday-morning rows |
| 9 | VOIDtv Kids | Bright, friendly sting and loading loop | 3 s, 2 s loop | MP4 + Lottie | No flashing, no fast flicker (section on safety) |
| 10 | Social | Vertical 9:16 and square 1:1 stings; YouTube intro and 20 s end screen | 3-6 s, 20 s | MP4 | Safe areas for captions and platform buttons |
| 11 | TV apps | Fire TV / Android TV splash | 3-5 s | 1920×1080 MP4 | Matches the banners in `brand-kit/app-icons/tv/` |
| 12 | HQ and beta apps | Small splash or loading mark | 1-2 s | Lottie/CSS or animated PNG | Gold HQ tile, beta badge |
| 13 | QR scans | Short splash when a merch QR opens the site | 1-2 s | CSS/Lottie | Only once per visit |
| 14 | Sound | Sound logo on its own and as stems | 2-3 s | WAV + MP3 | Loudness-normalised for web and social |

**Rules for every piece:**
- **Photosensitivity:** no more than three flashes a second (WCAG 2.3.1); the static effect must respect it.
- **Reduced motion:** when a viewer's device asks for less motion, the site shows a still frame instead.
- **Weight:** anything shown on the site stays small; UI animations are Lottie/CSS, not video.
- **Colours:** the agreed neon palette (item 8); cyan, gold and pink as accents.
- **Masters:** keep the HyperFrames source for every sting so later colour or logo changes re-render the set.

**Done when:** pieces 3-6 are live in the player (they need no logo); the logo-led pieces are rendered from the
settled mark, previewed with Bryan, then wired in; everything lives in `brand-kit/motion/` with a README of
sizes and uses.

## 9. Decisions to ask Bryan at the start (one message)

1. Kids domain: which name (`voidtvkids.com`, `voidtvkids.net`, `voidkidstv.com`, `voidkids.tv`, `voidtv.kids`)?
2. Kids commercial tiers: current clean shows (Bluey, Blue's Clues, Dora...) after a legal view; junk-heavy
   (Paw Patrol, Peppa, Cocomelon) in with per-file approval, or out?
3. Relay server for zero pauses (about €4-6/month): get a legal view first, or not now?
4. Live TV: keep as is, hide, or remove?
5. Satire row: approve the candidate list together, or Bryan picks from it later?
6. Motion graphics: approve the 14-piece shot list (section 8b) and say which pieces matter most first.
7. Rollout (section 10, phase H): does "publish to the greater world" mean opening voidtv.net to the public
   (password gate off) once the audit's critical fixes are in, and does it include starting the ads?
8. Audit baseline: commit or set aside today's untracked work (`motion/`, `videos/voidtv-*`,
   `profiles/publicaccess/*`), push the 3 local commits, and relock `docs/BASELINE.md5` at the audit tag?
   The lock dates from 30 Jun and is missing most of today's files.
9. *(from the Low Celly chat)* Low Celly Times has the same audit planned for 18 Oct
   (`lowcountry-cells/docs/FABLE-TOMORROW.txt`). Run both on the same days, or one first? Both need Bryan's
   checkpoints.

## 10. Careful whole-system audit, then HQ manual mode and rollout

Bryan's ask (17 Oct), in short:
- A slow, careful audit of the whole build: debugging code, correct functionality, every connection, and every
  security weakness.
- It is led by an agent that knows everything he has asked for and every solution he chose.
- After the passive inspection, solutions compete to find the best real-world fix.
- The fixes are built into the HQ admin app so he can run them by hand when no AI is available.
- He gets a full walkthrough, then everything is finished and published for the public rollout.

**This is a multi-day package.** Careful beats fast, and every claim carries a file:line or a reproduction. The
rules below keep it careful *and* affordable.

### Ground rules (they make it efficient)

1. **Audit a frozen copy.**
   - First commit or set aside today's loose work (`git status`):
     - 3 local commits are not pushed;
     - `motion/`, `videos/voidtv-*` and `profiles/publicaccess/*` are untracked.
   - Then tag `audit-base-2026-10-18` and give the inspectors a separate worktree at that tag
     (`git worktree add ../void-audit audit-base-2026-10-18`). Packages 1 and 2 keep editing the real tree,
     and the ground never moves under the inspectors.
   - Before a fix, its finding is re-checked against the latest code.
2. **Machines before agents.** Run the existing checks first and give their output to every inspector. They are
   cheap, objective, and they point the agents at real problems:
   - `node scripts/doctor.js`;
   - `node --test player/test/core.test.js`;
   - `node scripts/lock.js verify`;
   - `npm audit` in each package;
   - a secret-pattern scan of git history;
   - the local site build's checks;
   - a 200-show linkcheck sample;
   - the Sentry trouble export.
3. **One findings file.** All findings go into `docs/audit/findings.json`, including the known ones from packages
   1, 2 and 5. Duplicates are merged by code, not by agents, and `docs/AUDIT-2026-10-18.md` is generated from
   it. Nothing gets fixed twice in two different ways.
4. **Effort matches severity:**
   - **Critical:** data or secret exposure, site down, or deploy broken.
   - **High:** viewers see it (pauses, wrong show, broken page) or money is at risk.
   - Only critical and high get 3-way adversarial verification and 3 competing solutions.
   - Medium and low get one check and one proposal, reviewed in batches.
5. **The right model per stage.** Use a cheaper model for mechanical sweeps (inventories, grep-style searches,
   extraction). Use the strongest model for security, judging, and the keeper. Cap each phase's agent count and
   report what was skipped.
6. **One owner per file at a time.** Two chats collided today. The keeper keeps `docs/audit/OWNERS.md`, which says
   who is editing what, and agents check it before editing.
7. **Bryan's time:** one message for decisions at the start, then two approval checkpoints per day (midday, end of
   day). Each checkpoint is a short list with a recommendation per item.

### A. The asks ledger and its keeper

- **Don't have agents read the raw chats.**
  - There are 71 VoidTV chats since early September, about 1.6 GB of transcripts in 38 folders under
    `~/.claude/projects/`. This chat alone is about 100 MB.
  - A small script extracts only Bryan's own typed messages, with date and chat id, into a file **outside git**
    (it is private conversation). Agent replies and tool output are left out.
  - The script blanks secrets before any model sees them: the values in `backend/.env` and anything shaped like
    a token or key become "[secret]".
  - The script is `scripts/asks-extract.js`, and it stays in HQ so the ledger can be refreshed without AI.
- **The ledger agent:** works from that extract plus `docs/BACKLOG.md`, `docs/KIDS.md`, this file and
  `docs/SYSTEM-AUDIT.md`. It writes `docs/ASKS.md`, listing every request and solution choice with:
  - the date;
  - Bryan's words in short;
  - the status: done, open, changed his mind, or superseded;
  - where it lives in the code;
  - his standing rules: the house rules below, the name always "voidtv.net", root causes not band-aids, no full
    rebuilds for small fixes, the nonprofit ecosystem, kids safety, commercial classics in, Live TV a low
    priority.
- **Bryan reads `docs/ASKS.md` before it is committed.** It quotes him, and the repo is on GitHub.
- **Project items only** *(from the Low Celly chat)*. The chats also hold Bryan's private life: health, money,
  legal matters and family. None of that goes into `docs/ASKS.md`, and the keeper never repeats it to other
  agents.
- **The keeper (the same agent, kept on):**
  - answers "did Bryan want X?" questions;
  - checks every proposed solution against the ledger before it reaches Bryan;
  - brings conflicting asks to Bryan rather than settling them silently.

### B. Passive inspection (read-only, in the audit worktree)

**Areas (one inspector each, each given the ledger and the machine results):**
- **Site:** `scripts/site.js`, `scripts/lib/app.js` and the player bundle, plus the live site.
- **Player:** `player/`, meaning the core, the connect layer and Sentry reporting.
- **Catalog pipeline:** match, hunt, scout, linkcheck, art and publish, plus the nightly and scheduled tasks.
- **Cloudflare:** `functions/`, `site/_routes.json`, the limits (100k Function calls a day, 20,000 files,
  25 MiB per file), the domain and analytics. This absorbs package 5.
- **HQ:**
  - `scripts/hq.js`, `scripts/hq/index.html` and `hq-app/main.js`;
  - `scripts/lib/promos.js`, with the Motion and Promos tabs;
  - `scripts/doctor.js`;
  - `scripts/lock.js`. Its `docs/BASELINE.md5` dates from 30 Jun and lacks most of today's files; Bryan decides
    whether to relock at the audit base.
- **Also:** the beta app (`beta/`), `backend/`, `motion/` and `videos/`.

**Journeys (tracers that cross the areas).** Most breakages live at the seams between parts, which is Bryan's
"all connections connecting". Trace each journey end to end and check every hand-off:
- **Visitor:** gate → browse → play → server hop → next episode → (mini player).
- **Nightly:** hunt → match → publish → Cloudflare build → live → linkcheck → doctor.
- **HQ button:** click → script → git → deploy → `version.txt`.
- **Tester:** invite → beta app → report → admin.
- **Promo:** Motion → render → Promos → Go live → gate, home and `/promos` on the site.

**Connections map:** written to `docs/CONNECTIONS.md`, with a diagram. Record:
- every caller → callee link;
- every port;
- the files each part reads and writes;
- every outside service: Internet Archive, TMDB, TVmaze, Sentry, Cloudflare, GitHub, jsDelivr.

**House rules apply:** muted probes only, at most two Archive-facing jobs, no Play clicks.

### C. Security review (own inspectors, read-only)

- **Known finding (18 Oct, 3:40 AM): third-party emails in the public repo.**
  - **What:** 2,478 of 2,850 committed `catalog/candidates/*.json` files carry Internet Archive uploaders' email
    addresses (the `uploader` field). They are republished in a public GitHub repo.
  - **Not needed:** the site builds from `catalog/shows`, which carries none. The kids branch already keeps every
    profile's candidates out of git and masks emails in its reports.
  - **Options to decide:**
    - stop committing candidates;
    - or store a short hash instead of the address;
    - and whether to scrub history, which is Bryan's call because it rewrites published history.
- **Secrets:**
  - how `backend/.env` is handled;
  - leaked keys or tokens in git history;
  - what the built site exposes (source maps, keys in bundles). The Sentry DSN is public by design.
- **Functions:**
  - every gate bypass path (`/assets/brand/`, `/q/`, `version.txt`, `qr.json`);
  - cookie flags and rate limits;
  - abuse of `/api/e` and bot handling;
  - security headers (CSP, framing, referrer).
- **XSS:** every place Archive or TMDB text reaches HTML in `app.js`, HQ and the promos page.
- **Local servers:** HQ (8780) and the motion editor (8221) bind to 127.0.0.1, which is good. Still check:
  - path traversal in `/media` and `/preview`;
  - command injection where they spawn processes (the motion server uses `shell: true`);
  - cross-site requests, since any web page can POST to 127.0.0.1.
- **Shared code, two projects** *(from the Low Celly chat)*. The Low Celly Motion HQ
  (`lowcountry-cells/motion`, port 8222) was built from this motion kit on 17 Oct. A finding in the shared parts
  (process spawning, the `/preview` and `/files` paths, POSTs without an Origin check) is fixed in both projects.
  Low Celly's copy already refuses POSTs from any page but its own (lowcountry-cells commit `5dff091`). The same
  check suits HQ 8780 and the motion editor 8221.
- **Electron:** `contextIsolation`, `nodeIntegration`, navigation limits.
- **Beta app:** admin auth, KV access, invite codes, tester data.
- **Supply chain:** dependencies, pinned versions, and integrity hashes for CDN scripts.

### D. Verify

- Each critical or high finding gets three agents trying to refute it: does it reproduce, and is it already
  handled? Medium and low findings are batch-checked.
- **Every confirmed finding gets one reproduction**, written once and used three times:
  - the proof;
  - the regression test that must fail before the fix and pass after;
  - when it is operational, the HQ check.

### E. Competing solutions (critical and high only)

- Three independent proposals: the smallest correct fix, a root-cause redesign, and an operational fix run from
  HQ.
- Judge them on:
  - whether they fix the root cause;
  - real-world reliability for viewers;
  - cost in money and usage;
  - risk to what already works;
  - whether Bryan can run or see them in HQ without AI;
  - how easily it can be undone *(from the Low Celly chat)*;
  - fit with the ledger.
- Keep the losing proposals and the reason each lost in `findings.json`, so a later session doesn't propose them
  again *(from the Low Celly chat)*.
- Build the winner with the best parts of the runners-up. The keeper checks it, then Bryan approves at a
  checkpoint.

### F. Manual mode in HQ (works with no AI at all)

- **Extend the doctor; don't build a new system.**
  - `scripts/doctor.js` already writes checks as `{id, level, msg, fix}` to `catalog/cache/health.json`, and
    HQ's Overview shows them as lights.
  - Add a **System check** page that lists every check, with:
    - the plain-language result;
    - what it means;
    - a button for the safe fix, or numbered manual steps.
  - The same code runs from the button and from `node scripts/doctor.js --check <id>`.
- **Build this frame on day 1, before any fix.** Each fix then adds its check as it lands.
- **Generate `docs/RUNBOOK.md` from the check list,** so the manual can't drift from HQ. HQ Help links to it.
- **At least these checks:**
  - the deploy is current;
  - Functions use against the limit;
  - file count and the catalog-shrink guard;
  - dead links and wrong-show picks;
  - player trouble rate;
  - lock drift;
  - secret exposure and dependency warnings;
  - local servers (8780, 8221);
  - the beta app;
  - refreshing the asks ledger.

### G. Walkthrough with Bryan, in slices

- Show each group of checks as it lands, not all at the end.
- Finish with a **fire drill**: safely simulate the common failures (stale deploy, dead links, motion editor
  down, failed publish) and have Bryan fix each one in HQ with no AI.

### H. Solve, publish, roll out

- **Write the launch criteria first** (go/no-go list, approved by Bryan) and rank all audit work against them:
  - no open critical findings;
  - the playback pause rate in Sentry under the target from package 1;
  - Functions routing ready for the gate to come off (package 5's items);
  - the catalog standard met;
  - the System check all green.
- **Fixes:** small verified commits, deployed, `version.txt` confirmed, Sentry watched.
- **Staged rollout:**
  1. the gate comes off (only when Bryan says, decision 7) with no ads;
  2. watch for 48 hours;
  3. start the ads.
- **Rollback:** Cloudflare Pages lets you return to an earlier deployment. Put the steps in HQ.

### Schedule and shape

**Days:**
- **Day 1 (18 Oct):** ground rules 1-2 (baseline and machine checks), then A, B, C and D. Packages 1 and 2 continue
  in the real tree. The HQ System check frame is built in the afternoon.
- **Day 2:** E with Bryan's approvals; the launch criteria; the first critical and high fixes, each with its HQ
  check.
- **Day 3 on:** the remaining fixes, the walkthrough slices, the fire drill, then the rollout.
- **Later:** packages 6, 7, 8 and the logo-led motion pieces wait unless they block the launch criteria.

**Ultracode shape:** one workflow per phase (A → B and C → D → E → F/H, with G in slices), so Fable and Bryan stay
in the loop between phases.

**Done when:**
- `docs/ASKS.md` (read by Bryan), `docs/CONNECTIONS.md`, `docs/audit/findings.json` and
  `docs/AUDIT-2026-10-18.md` exist;
- every confirmed critical and high finding is fixed with a test and an HQ check, or has Bryan's decision;
- the fire drill passed with no AI;
- the launch criteria are met;
- the rollout has started, or Bryan has chosen its date.

## 11. The VOID universe: Void University and Void School on their own domain (Bryan, 18 Oct)

Bryan, about 3 AM: look at Void University and a Void School / home-school site with Fable. It goes on **its own
domain** and links to voidtv.net and voidtv.net kids through the shared "portal" area. Diversify the sources beyond
Gutenberg and LibriVox, then build a system that turns free-use material into lesson plans with **a local model on
his PC**.
- **Read first:** `docs/VOID_UNIVERSITY.md`. Its "18 Oct additions" section has the new sources, the licence
  rules, the local lesson-plan builder and the first slice. Its 13 Oct sections already cover the course machine,
  the open curricula (Core Knowledge, EngageNY, CK-12, OpenStax) and Void School.
- **Reuse:** the kit profile system, as voidtv.net kids did (`profiles/kids/` is the template). Lessons follow the
  same allowlist rule: a person approves before anything publishes.
- **First slice:** three public-domain books into reviewed lessons with LibriVox read-along, built locally. Plus a
  sources table with licences.
- **Decisions for Bryan:**
  1. Name and domain for University and School. They're one site or two; follow the naming rule.
  2. Audience first: home-school families K-8, adult learners, or both.
  3. Who reviews lessons.
  4. Which local model, after a quick test of two on his card.

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
