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

## Bryan's direction (17 October)

- **Old school and classic through current PBS Kids**, with Sesame Street and Mister Rogers at the heart.
- **Play it safe** about inappropriate or badly named uploads, **but build a bigger collection.**

Both fit: the collection grows by hunting many more shows; safety comes from how strictly each show's files
are checked, not from keeping the list short. Sections 2a and 3a below are the plan for exactly this.

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

## 2a. The lineup: classic to current PBS Kids (Archive uploads by title, 17 Oct)

Counts are items whose title contains the name; "Arthur" and "Zoom" are inflated by unrelated uses.

| Era | Show (first aired) | Archive items |
|---|---|---|
| Classic | Captain Kangaroo (1955) | 12 |
| | Mister Rogers' Neighborhood (1968) | 80 |
| | Sesame Street (1969) | 6,205 |
| | The Electric Company (1971) | 88 |
| | ZOOM (1972) | inflated |
| | Schoolhouse Rock (1973) | 100 |
| | 3-2-1 Contact (1980) | 69 |
| | Reading Rainbow (1983) | 244 |
| | Thomas the Tank Engine (1984) | 745 |
| | Square One TV (1987) | 76 |
| | Shining Time Station (1989) | 160 |
| 1990s PBS | Barney & Friends (1992) | 395 |
| | Lamb Chop's Play-Along (1992) | 29 |
| | Ghostwriter (1992) | 59 |
| | The Big Comfy Couch (1992) | 48 |
| | Bill Nye the Science Guy (1993) | 266 |
| | The Magic School Bus (1994) | 227 |
| | Wishbone (1995) | 102 |
| | Arthur (1996) | inflated (3,250) |
| | Kratts' Creatures (1996) | 16 |
| | Teletubbies (1998) | 1,584 |
| | Zoboomafoo (1999) | 141 |
| | Dragon Tales (1999) | 196 |
| 2000s PBS | Between the Lions (2000) | 106 |
| | Clifford the Big Red Dog (2000) | 722 |
| | Caillou (2000) | 1,665 (64% memes, see 3a) |
| | Cyberchase (2002) | 231 |
| | Liberty's Kids (2002) | 22 |
| | Curious George (2006) | 268 |
| | Super Why! (2007) | 122 |
| | WordGirl (2007) | 69 |
| | Martha Speaks (2008) | 60 |
| | Sid the Science Kid (2008) | 268 |
| | Dinosaur Train (2009) | 30 |
| Current PBS | Wild Kratts (2011) | 37 |
| | Daniel Tiger's Neighborhood (2012) | 27 |
| | Peg + Cat (2013) | 35 |
| | Odd Squad (2014) | 65 |
| | Nature Cat (2015) | 71 |
| | Molly of Denali (2019) | 12 |

Plus what already plays (Captain Planet, Carmen Sandiego, Bill Nye, DuckTales, Darkwing Duck...) and the
Saturday-morning cartoons of section 2. If even half of these 40 titles land with a few dozen clean episodes
each, the kids library plausibly doubles or triples from its ~2,400 episodes. That is an estimate until the
hunt runs.

**Current PBS shows** are a different case from commercial franchises. Recommended: include PBS titles of
every era (public, educational, and thinly uploaded anyway), keep commercial franchises out (Bluey, Paw
Patrol, Peppa Pig, Cocomelon, current Disney Junior). Confirm with the legal review, since current PBS shows
are still owned by their producers.

## 3a. Safety against badly named uploads, measured

Uploads carrying a kids show's name but flagged in title, subject or description as memes, parodies or
horror edits ("YouTube Poop", "G Major" effects, "gets grounded", GoAnimate, fake "lost episodes", .EXE,
creepypasta, "sped up", ear-rape...):

| Name | Uploads | Flagged junk | Share |
|---|---|---|---|
| Caillou | 1,665 | 1,078 | 64% |
| Peppa Pig | 567 | 100 | 17% |
| SpongeBob | 4,025 | 568 | 14% |
| Sesame Street | 6,205 | 331 | 5% |
| Arthur | 3,250 | 163 | 5% |
| Barney | 2,652 | 116 | 4% |
| Thomas the Tank Engine | 745 | 32 | 4% |
| Teletubbies | 1,584 | 63 | 3% |
| Mister Rogers | 80 | 2 | 2% |

Words only catch junk that labels itself, so the kids builder stacks independent checks. A file must pass
all of them:

1. **Word filter** on title, subject, description and filename (the vocabulary above, kept as a list in
   the kids profile and extended whenever something slips past).
2. **Episode match** to the show's official episode list (TVmaze) by season/episode, title or air date.
   No guessed order, no self-listing.
3. **Runtime check** against the show's real runtime. Memes and edits are mostly 1-5 minutes; a Sesame
   Street episode is ~55, a PBS half-hour ~25.
4. **Source reputation:** prefer broadcast recordings and complete-season uploads; an uploader whose other
   items are flagged junk is denied entirely.
5. **Junk-heavy names get stricter treatment:** where more than 20% of a name's uploads are flagged (Caillou,
   Peppa, SpongeBob), every item needs a person's approval, not just the show.
6. **Frame review in HQ:** a contact sheet of frames from three random episodes per show, from the Archive's
   own thumbnails, before the show goes live; new seasons get the same check.
7. **One report pulls the episode** from the kids site until a person has looked.

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
- **Play all instead of live channels** (Bryan, 17 Oct: less interested in Live TV). Each show and each row
  gets a big "Play all" that keeps going episode after episode, starting where the child left off. Same
  press-one-button ease for little ones, but on demand, so nothing is missed or mid-episode. No kids live
  channels are planned.
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
| 4. Experience | Kids home, Play all, grown-up controls, time limits, kids player settings | 2 sessions |
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
