# VOIDtv Kids — plan

Written 17 October 2026 from the live catalog, TMDB's official TV ratings and Internet Archive counts.
Nothing is built yet. This is the plan to agree before building.

## The short version

VOIDtv Kids should be a **separate site built by the same system** (a kit profile on its own domain; see section 8a),
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
| 1980s toy-line cartoons (Care Bears, My Little Pony, He-Man, ThunderCats, Smurfs) | 2,148 | the core of a "Saturday morning" row |
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

**Decided (Bryan, 17 Oct): all of PBS, every era.** Confirm with the legal review, since current PBS shows
are still owned by their producers.

## 2b. Commercial kids shows: "if we can" (Archive uploads and junk share, 17 Oct)

Bryan sees value in the commercial shows too. They split into three tiers by risk:

| Tier | Shows (uploads, junk share) | Why this tier | Rule |
|---|---|---|---|
| A. Commercial classics | Care Bears (286, 2%), The Smurfs (266, 3%), He-Man (229, 6%), Muppet Babies (111, 6%), My Little Pony (1,016, 9%), Rugrats (600, 21%) | Same risk class as what VOIDtv already carries (DuckTales, Darkwing Duck, Animaniacs) | Include with the standard seven checks; Rugrats gets per-file approval (over 20% junk) |
| B. Current, mostly clean | Blue's Clues (777, 6%), Dora (496, 6%), Bubble Guppies (90, 6%), Bluey (584, 8%), Mickey Mouse Clubhouse (166, 10%), PJ Masks (90, 10%), Doc McStuffins (17, 0%) | Owned by the most active enforcers (Disney, Paramount/Nickelodeon, BBC Studios, eOne); uploads get taken down | Only after the legal review says yes; daily link checks for this tier; be ready to pull a brand within a day of any request |
| C. Current, junk-heavy | Paw Patrol (217, 21%), Peppa Pig (567, 21%), Cocomelon (125, 45%) | Active enforcers **and** heavy meme/toy-video junk; Cocomelon uploads are mostly nursery-rhyme compilations | Recommend leaving out; if included, every file approved by a person |

"Junk share" counts uploads flagged in title, subject or description (memes, parodies, horror edits, toy
unboxings, "surprise eggs", nursery-rhyme compilations). Unlabelled junk is caught by the other checks.

Whatever the tier, a public takedown contact on the kids site is worth having: a rights holder who can ask
VOIDtv directly is less likely to escalate.

## 2c. Classic cartoons: Hanna-Barbera and the colour era through Saturday morning (Bryan, 17 Oct)

Almost none of these are in VOIDtv's show list today (it was built from 1990-onward TV listings with kids'
shows excluded); of 38 checked, only TMNT, Underdog, G.I. Joe, ThunderCats and Inspector Gadget are listed,
and four of those have never been hunted. This whole era is new ground, and the Archive is rich in it and
mostly clean. Uploads and junk share, 17 Oct:

| Group | Titles (uploads, junk share) |
|---|---|
| Hanna-Barbera, 1958-1970 | Scooby-Doo (1,710, 4%), The Flintstones (331, 11%), The Jetsons (157, 5%), Yogi Bear (93, 3%), Top Cat (93, 5%), Space Ghost (81, 1%), Wacky Races (55, 3%), The Herculoids (51, 0%), Huckleberry Hound (42, 2%), Jonny Quest (37, 2%), Josie and the Pussycats (29, 3%) |
| Hanna-Barbera, 1970s | Laff-a-Lympics (32, 0%), Super Friends (24, 0%), Hong Kong Phooey (17, 5%), Captain Caveman (12, 0%), Speed Buggy (8, 0%) |
| Theatrical classics on TV | Looney Tunes (1,445, 2%), Tom and Jerry (989, 2%), Popeye (718, 2%), Bugs Bunny (456, 3%), The Pink Panther (278, 1%), Woody Woodpecker (195, 9%), Mighty Mouse (121, 2%) |
| Other 1960s TV | Underdog (230, 5%), Rocky and Bullwinkle (110, 2%) |
| Saturday morning, 1970s-80s | The Smurfs (518, 4%), Alvin and the Chipmunks (339, 3%), Muppet Babies (111, 4%), Snorks (89, 1%), Garfield and Friends (85, 1%), Fat Albert (65, 10%) |
| Action, 1980s | TMNT (605, 3%), G.I. Joe (200, 11%), Inspector Gadget (176, 3%), ThunderCats (108, 8%), The Real Ghostbusters (56, **26%**); Transformers and Pac-Man counts are inflated by films and games |
| Broadcast recordings | "saturday morning" (2,561, 1%): whole mornings as aired |

Two cautions specific to this era:

1. **Dated content.** Some classic shorts carry racial caricature or wartime propaganda: the Looney Tunes
   "Censored Eleven", WWII-era Popeye and Bugs Bunny shorts, Tom and Jerry's original Mammy Two-Shoes
   scenes, some early Hanna-Barbera gags. Ratings rarely exist for these old shows, so a person decides
   anyway: the HQ review gets a "dated content" flag, and a known-problem list of titles is denied up front.
   The 1990s-2000s edited TV versions (the ones broadcast on Cartoon Network and Boomerang) are usually the
   safer uploads to prefer.
2. **Shorts are short.** Theatrical cartoons run 6-8 minutes, so the runtime check compares against each
   show's own official runtime rather than a fixed minimum; otherwise real shorts would be thrown out with
   the memes.

**Saturday-morning broadcast recordings** (whole mornings with the original cereal and toy ads) are wonderful
nostalgia for grown-ups but are full of advertising aimed at children. Recommend: put them on **VOIDtv** as a
"Saturday Morning, as aired" row for adults, and give **VOIDtv Kids** the episodes only.

The same hunt feeds both sites: VOIDtv gains a classic-cartoon library for nostalgic adults, and the kids
site takes the approved, strictly matched subset.

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
   show (or the Play all list), larger controls, captions on by default if present.
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
  Archive hosts) stays the same. All of PBS is in; commercial shows follow the tiers in section 2b (classics
  yes, current clean ones only after the legal review, junk-heavy ones recommended out). Keep a takedown
  contact and pull a brand within a day of a request.
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
| Takedown pressure on kids brands | commercial tiers (2b); legal review before tier B; takedown contact; daily link checks; pull a brand within a day |
| A child wanders into VOIDtv | separate site; grown-up check to leave |
| Archive hangs pause playback | same player and server switching as VOIDtv; the relay decision applies to both |

## 8a. Its own domain (recommended)

A separate domain for VOIDtv Kids makes sense, more than a kids.voidtv.net subdomain:

- **Reputation and filters.** Parental controls, school filters and safe-search classify sites largely by
  domain. voidtv.net carries adult animation, late-night TV and rough reality shows; a kids subdomain
  inherits that classification and any complaint against the main site. A separate domain can be classified
  as a children's and education site on its own merits.
- **A clean privacy story.** Its own privacy policy, its own analytics settings (no identifiers), and no
  cookies shared with VOIDtv: today's password-gate cookie is set for all of voidtv.net, subdomains included.
- **Parents remember a plain name**, and a child cannot click their way from it to the grown-up site.
- **Cost:** a domain at roughly $10-20 a year; hosting stays free on Cloudflare Pages as its own project. The
  kit already builds a profile into its own folder, so a second site is little extra upkeep.
- **Keep the family name** ("VOIDtv Kids") and point kids.voidtv.net at the new domain.

Names checked on 17 Oct that show no DNS records yet (a quick sign, not proof; confirm at a registrar):
`voidtvkids.com`, `voidtvkids.net`, `voidkidstv.com`, `voidkids.tv`, `kidsvoid.tv`, and `voidtv.kids`.
`voidkids.com` is taken. The `.kids` ending is run with its own child-safety content rules; read its
requirements before choosing it, since they may suit the site well but add conditions.

One naming thought: "void" reads as dark or empty to some parents. "VOIDtv Kids" keeps the brand; the
logo and colours (bright, friendly, not late-night neon) do most of the softening.

## 9. Questions for Bryan

1. ~~Separate site or a section?~~ Separate site on its own domain (section 8a). Which name?
2. Ages: both bands, or start with Big kids only (where most of the library is) and add Little after the hunt?
3. Family sitcoms rated TV-G (Full House, ALF, Punky Brewster): Kids, or keep them on VOIDtv only?
4. Who approves shows: you alone, or trusted testers with HQ access?
5. Commercial shows: tier A (classics) in; tier B (current, mostly clean) after the legal review; tier C (Paw Patrol, Peppa Pig, Cocomelon) out, or in with per-file approval?
6. Saturday-morning broadcast recordings (with original ads): on VOIDtv as an "as aired" row for adults, and episodes only on Kids?
