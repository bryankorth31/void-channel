# VOIDtv Kids — plan

Written 17 October 2026 from the live catalog, TMDB's official TV ratings and Internet Archive counts.
Nothing is built yet. This is the plan to agree before building.

## The short version

VOIDtv Kids should be a **separate site built by the same system** (a kit profile, e.g. kids.voidtv.net),
not a filter on VOIDtv. Every show on it is **approved by a person**, backed by an **official age rating**,
and matched **strictly** (no guessed episodes). It collects **no personal data**, links nowhere outside
itself, and needs a grown-up to leave it. It shares the new player and the catalog builder.

There is enough to open with: about **54 shows and 2,400 episodes** play today in the Little, Big-kids and
All-ages bands, before hunting a single new show. Preschool is the gap (3 shows), and the Archive can fill it.

## 1. What VOIDtv already has

TMDB content ratings were fetched for all 1,687 animated, family and kids shows in our list (cached in
`catalog/cache/tmdb-ratings.json`). Counting only confident, strictly matched episodes (no self-listed shows):

| Band | Rule | Shows rated | Playing today | Episodes | Examples |
|---|---|---|---|---|---|
| Little kids (2-6) | US TV-Y | 53 | 3 | 87 | Bill Nye, ChalkZone, Eek! the Cat |
| Big kids (7-11) | US TV-Y7 | 232 | 30 | 1,122 | Captain Planet, Darkwing Duck, DuckTales, Foster's Home, Kids Next Door |
| All ages | US TV-G, or UK U with no US rating | 161 | 21 | 1,195 | The Joy of Painting, Mister Ed, Punky Brewster, ALF, Full House |
| Needs a person | no rating at all | 382 | 17 | 455 | Carmen Sandiego (284 eps) **and** MTV adult cartoons (3 South, Spy Groove) |
| Not on Kids | TV-PG and older | 859 | — | — | Regular Show and Cosby (PG); Aqua Teen, The Boondocks (older) |

What this tells us:
- **Ratings work as the first gate.** Highlander, which TMDB's "Kids" genre wrongly includes, has no rating;
  The Simpsons and Family Guy come back TV-14. Genre alone is not safe.
- **"No rating" must mean "a person decides".** The unrated pile holds both Carmen Sandiego and adult MTV
  animation.
- **Strict matching is non-negotiable.** The Parkers (TV-PG sitcom) currently lists 828 children's
  compilation videos as its episodes because of the builder's self-list fallback. On a kids site that
  failure is unacceptable in either direction. Kids shows use strict matching only.

## 2. What the Internet Archive holds (to hunt)

| Programming | Archive items | Notes |
|---|---|---|
| Sesame Street | 6,205 | many are clips and songs, not episodes |
| 1980s toy-line cartoons (Care Bears, My Little Pony, He-Man, ThunderCats, Smurfs) | 2,148 | the core of a "Saturday morning" channel |
| Cartoon uploads shaped like episodes | 2,020 | needs strict matching |
| Current franchises (Bluey, Paw Patrol, Peppa Pig, Cocomelon) | 1,490 | **leave out**: see section 6 |
| Tagged "saturday morning cartoons" | 361 | |
| Reading Rainbow | 244 | |
| Mister Rogers' Neighborhood | 142 | |
| Schoolhouse Rock | 100 | |
| `classic_cartoons` collection (public-domain era) | 81 | safest rights position |
| PBS-era learning shows (3-2-1 Contact, Square One TV, Ghostwriter, ZOOM) | 5,455 | overcounted: "zoom" also matches meeting recordings |

A first hunt of 60-100 preschool and learning titles (Mister Rogers, Reading Rainbow, Sesame Street,
Schoolhouse Rock, 3-2-1 Contact, Square One, Ghostwriter, Shining Time Station, Lamb Chop's Play-Along,
Barney, Arthur, Magic School Bus...) would close the Little-kids gap.

## 3. Non-negotiables

1. **Allowlist only.** Nothing reaches the kids site unless a person approved the show in HQ. No automatic
   additions, ever.
2. **Strict matches only.** Episodes must match a real episode list; review-state files never appear; the
   self-list fallback is off; compilations, "kids videos collection", reaction, unboxing and YouTuber
   uploads are rejected outright.
3. **No path out to the grown-up site** or to archive.org without a grown-up check. No download links, no
   people pages, no Six Degrees, no external links.
4. **No personal data.** No session IDs, no device fingerprinting, no Sentry user context, no third-party
   requests a child's device makes beyond the video itself (artwork self-hosted, not loaded from TMDB).
5. **No asks of children.** No donation strip, no merch, no "share", no sign-ups.
6. **One reported problem pulls the episode** until a person looks at it.

## 4. How our system builds it

The kit already separates catalogs by profile (`VOID_PROFILE`), each with its own list, catalog, reports and
site folder (fixed 16 Oct so profiles never write into VOIDtv's files).

1. **Profile `kids`** under `profiles/kids/` with its own `list.json` of approved shows and its own HQ port.
2. **Ratings in the builder.** Fold the TMDB rating fetch into `scripts/art.js` so every show carries
   `ratingUS` / `ratingGB`; the kids list is drawn from TV-Y, TV-Y7, TV-G (and UK U) plus approved unrated.
3. **Strict mode in the matcher.** A profile flag that disables the self-list fallback and REVIEW picks and
   adds the kids rejection words (compilation, collection, unboxing, reaction, "for kids" channel uploads).
4. **HQ > Kids review.** For each candidate: rating, episode count, and a **contact sheet of frames** from
   three random episodes, using the thumbnails the Archive already makes for every video (seen on the Marco
   Polo item). Approve, deny or approve-with-exceptions in seconds, without watching.
5. **Kit seams to close first** (they are VOIDtv-specific today): logo and colours per profile, the CASH
   strip and donate button off, feature switches (downloads, people pages, Six Degrees, search scope),
   analytics mode, copy and page titles. This also finishes the white-label work the public-access demo
   exposed.
6. **The same player**, with a kids setting: no download or Archive links, autoplay only within the same
   show (or the approved channel), larger controls, captions on by default if present.
7. **Ongoing upkeep.** Link checks and nightly re-matches as for VOIDtv; a kids-specific doctor light that
   fails if any episode on the kids site is unapproved, unrated or REVIEW-state.

## 5. The experience

- **Who:** children about 2-11 and the grown-up who sets it up. Two age bands chosen once by the grown-up:
  Little (TV-Y) and Big (adds TV-Y7 and TV-G).
- **Home:** big poster tiles, few words. Rows like *Saturday Morning*, *Learn Something* (Bill Nye, Carmen
  Sandiego, Reading Rainbow), *Classic Cartoons*, *Favourites* (on this device only).
- **Kids TV:** two or three always-on channels (Saturday Morning, Learning, Cartoon Classics) using the same
  live-schedule system as VOIDtv's Live TV. The best fit for little ones: press one button, it plays.
- **Grown-up controls,** behind a grown-up check (hold a button for three seconds, then answer a simple
  question): age band, daily time limit, a bedtime that ends playback after the current episode, and the
  way back to VOIDtv. All stored on the device; no account.
- **Calm by design:** none of VOIDtv's grain, flicker or neon motion (photosensitivity), reduced motion by
  default, high contrast, remote-friendly focus for TVs.
- **Brand:** a VOIDtv Kids mark from the same family (the brand kit's tools make every icon size from one
  SVG), friendly and bright rather than late-night neon.

## 6. Privacy and legal (not legal advice; get a lawyer's view before launch)

- **COPPA (US).** A site directed at children under 13 may not collect personal information, which includes
  persistent identifiers used to track a child, without verifiable parental consent. There is a narrow
  exception for supporting the site's internal operations. The safe design is to collect nothing personal:
  no session IDs, aggregate counts only (for example "episode X played N times today"), no IP storage, no
  third-party scripts. The UK Age Appropriate Design Code points the same way for UK visitors.
- **Copyright.** Kids brands are among the most actively enforced. VOIDtv's model (linking to files the
  Archive hosts) stays the same, but leave out current franchises (Bluey, Paw Patrol, Peppa Pig, Cocomelon,
  current Disney Junior) entirely: they are widely available legally and most likely to draw takedowns.
  Favour pre-2010 classics, public-domain cartoons and educational public television.
- **The password gate** stays on the kids site during testing, like VOIDtv.

## 7. Phases

| Phase | What | Rough effort |
|---|---|---|
| 0. Decide | Name and domain; age bands; legal review of COPPA posture and the content rules above | Bryan + counsel |
| 1. Kit seams | Per-profile branding and feature switches; analytics "no identifiers" mode; self-hosted art | 1-2 sessions |
| 2. Catalog | Ratings in the builder; strict-match profile flag; HQ Kids review with contact sheets; approve the ~54 shows that play today plus Carmen Sandiego and other unrated wins | 2 sessions |
| 3. Hunt | Preschool and learning titles from section 2; strict match; review | 1 session plus the hunt's run time |
| 4. Experience | Kids home, kids channels, grown-up controls, time limits, kids player settings | 2 sessions |
| 5. Pilot | Testers with children via the beta app; fix; then a "Kids" door on VOIDtv | ongoing |

## 8. Risks

| Risk | Mitigation |
|---|---|
| A wrong file reaches a child (the Parkers failure) | allowlist, strict matching, contact-sheet review, one-report pulls the episode, doctor light |
| Unrated adult animation slips in | "no rating" always needs a person; MTV/Adult Swim networks auto-denied |
| Collecting children's data by accident | no identifiers by design; no third-party requests; audit before launch |
| Takedown pressure on kids brands | leave out current franchises; prefer classics and public domain |
| A child wanders into VOIDtv | separate site; grown-up check to leave |
| Archive hangs pause playback | same player and server switching as VOIDtv; the relay decision applies to both |

## 9. Questions for Bryan

1. Separate site (recommended) or a locked section inside voidtv.net?
2. Ages: both bands, or start with Big kids only (where most of the library is) and add Little after the hunt?
3. Family sitcoms rated TV-G (Full House, ALF, Punky Brewster): Kids, or keep them on VOIDtv only?
4. Who approves shows: you alone, or trusted testers with HQ access?
