# VOIDtv categories — everything B has asked for, in one place

Two kinds of structure. **Rows** (the `type` in `scripts/show-list.json`) are what the home page is
made of; every show has exactly one. **Collections** (`tags`) cut across rows; a show can carry
several. Visitors see a collection as its own shelf and as a filter. Counts are from the list on
2026-10-13 evening; "play" = series with at least one playable episode on the site right now. The
hunts are still running, so "play" only goes up.

## The frame (decided, not up for re-litigating)

- **TV, 1990 to now, whatever the Internet Archive has, regardless of copyright.** The site is a
  better way to find and watch what the Archive already hosts; it hosts nothing itself.
- **Adult app.** No kids ROW and no live-action kids shows. The cartoons adults grew up on
  (Nicktoons, Animaniacs, SpongeBob, Avatar) stay as nostalgia. Kids TV *movies* are fine.
- **Older than 1990 lives behind the Classic TV door**, not on the front page. "Older" meant the
  black-and-white era, not the 90s; the 90s are the front page.
- **Mature material (Late Night) sits behind the 18+ entry gate** like everything else; hard
  excludes everywhere: hate/extremist, politics/government/news.
- **Nothing gets dropped.** The TMDB popular/top-rated lists were taken whole (every language and
  genre; the only gates are 1990+ and no kids) as a device to get outside B's own range.

## Rows (home page shelves)

| Row | B's words | On list | Play |
|---|---|---|---|
| 90s Sitcoms | "90s through the most current... series of sitcoms from the 90s" | 53 | 34 |
| 2000s and Later Sitcoms | same ask, continued; Sunny-adjacent shows live here as ordinary entries | 87 | 24 |
| Animated | adult animation + the Nicktoons | 121 | 23 |
| Adult Swim | "I love the early and classic Adult Swim... as many as we can find" (Williams Street 2001–2012 is the heart) | 70 | 34 |
| Drama | HBO/Showtime/FX/AMC and network drama | 149 | 32 |
| Sci-Fi, Fantasy and Horror | "scifi, wb, cw, fx, hbo, showtime etc" | 46 | 33 |
| Sketch and Comedy | Mr. Show, Kids in the Hall, Chappelle... | 17 | 6 |
| Late Night | "Real Sex, Taxicab Confessions etc" — the HBO/Showtime/Cinemax/Playboy after-dark genre | 38 | 10 |
| MTV | "I don't see MTV shows and cartoons" | 62 | 1 |
| British and Beyond | "British shows and other foreign but English over the same times" (UK, Ireland, Canada, Australia, NZ) | 189 | 35 |
| Internet Comedy | "what do we have for internet comedy shows" (Channel 101, RvB, Homestar, CollegeHumor, Dropout, RLM, GMM...) — youtube-* Archive mirrors ARE the content here | 68 | 0 (not hunted yet) |
| Streaming Era | from the voidtv.org page B pasted as a shopping list: 2010+ streaming originals; expect thin Archive coverage, hunt anyway | 370 | 9 |
| Documentary & Geographic | "documentary and geographic" | 247 | 0 (not hunted yet) |
| Reality & Talk | from the whole-list ruling | 157 | 0 (not hunted yet) |
| Anime | from the whole-list ruling | 309 | 0 (last in the order) |
| World TV | non-English, from the whole-list ruling | 279 | 1 |
| Classic TV | the door, added for B's dad: 50s–80s US network TV + classic British | 275 | 120 |
| TV Movies / Specials | "tv films": made-for-TV movies and specials 1990+ from a 13,588-title TMDB reference list, hunted by vote count | 2,747 in this pass | ~520 |

## Home page order (rows and collections interleaved)

B (2026-10-14): "more aligned with the popular and eras we originally spoke of; I don't want game shows
and talk variety to show before the absurd or animation or sitcoms." One list (HOME_ORDER in
scripts/lib/app.js) now sets the shelf order after Recently added and Top rated:

90s Sitcoms, 2000s and Later Sitcoms, Animated, Adult Swim, Awkward & Absurd, Drama, Sci-Fi/Fantasy/Horror,
Streaming Era, British and Beyond, TV Movies, Sketch and Comedy, Internet Comedy, Historical & Period, MTV,
Anime, Black Programming, Family & Hallmark, Christian, Documentary & Geographic, Nature & Science, History,
Travel & Adventure, History Channel Classic, Early Discovery, Early TLC, World TV, Specials, Reality & Talk,
Variety & Talk, Game Shows, Classic TV, Late Night Classics, Late Night.

A collection not named there follows the list, biggest first. Previously every collection came before
every row, sorted by size, which is what put Variety & Talk and Game Shows ahead of the sitcoms.

## Collections (cross-row shelves)

| Collection | B's words / origin | On list | Play |
|---|---|---|---|
| Awkward & Absurd | "media in the style or vein of The Room / Disaster Artist, Beau Is Afraid, The Lobster, Moon Garden — awkward satire, dry, intellectual" (my name for it; rename freely) | 188 | 58 |
| Historical & Period | "historical period pieces from Highlander to Medici to Borgias to Roman, Renaissance etc, series and films" — films covered via TMDB History genre (36) hunted first | 146 | 42 |
| Black Programming | "what can we separate, filter or find for black programming?" | 83 | 18 |
| Christian | "christian programming" (for his dad) | 22 | 4 |
| Family & Hallmark | "hallmark style content for families"; Hallmark TV movies tag themselves by production company | 33 | 13 |
| Late Night Classics | "old original late night: Carson, Paar, Amos and Andy, Ed Sullivan" | 22 | 3 |
| Game Shows | "old game shows, Joe Pyne..." | 39 | 2 |
| Variety & Talk | the Sullivan/Benny/Hee Haw/Muppet Show lineage | 59 | 3 |
| Early TLC | "TLC and Discovery and History Channel before they were turned to slop" | 35 | 0 |
| Early Discovery | same | 43 | 0 |
| History Channel Classic | same | 55 | 0 |
| History / Nature & Science / Travel & Adventure | the documentary row split by subject | 48 / 44 / 36 | 0 |

The "0 play" collections are simply behind the Documentary row in the hunt order; the widget in chat
can move them up.

## Asked for, not built as a category (and why)

- **Cult / theatrical films** (The Room, Beau Is Afraid, The Lobster, Moon Garden): these are movies,
  outside the TV frame. Opening a film door is a scope decision, not a slip; parked in LATER.md.
- **Name collisions**: The Office (UK), Shameless (UK), CBC's The Newsroom, AU Wilfred/Review,
  Password (1961 vs 2022), Shōgun 1980 and The Borgias 1981 wait for per-show search/TVmaze
  overrides in the hunter. TMDB side: "The Clone" got Clone Wars' record.
- **Always Sunny** was an aside about taste, not a tier. Nothing leads the page because of it.
- **Kids row**: no. Kids TV movies: yes (in the movie shelf).

## Finding more (the three scouts)

- **`node scripts/networks.js`** — TMDB, no Archive calls: every series from 1990 on across ~45
  networks we care about (HBO to Hallmark, Adult Swim to Channel 4), minus what is on the list,
  grouped by network with a suggested row, plus a tally of genres we see a lot of and have no row
  for. `--add` puts all of them on the list. Report: `docs/NETWORKS.md`.
- **`node scripts/scout.js`** — the Archive, worked backwards: uploads whose titles read like series
  rips, plus everything else our trusted uploaders (the ones behind files we accepted) have put up;
  grouped by inferred title, confirmed against TVmaze, with the episode-shaped file count of the
  best upload and the Archive subjects uploaders actually use — public access, web series and
  compilations show up here as leads TVmaze does not know. One polite Archive job; waits its turn
  behind the two hunts. Report: `docs/SCOUT.md`.
- **`node scripts/candidates.js`** — TMDB popular / top-rated / trending, the original list builder.

All three run in the nightly pass. Nothing is added to the list by a scout on its own: B (or I, on
his word) moves names from the reports into `show-list.json`, and the hunt takes it from there.

## How a new category gets added

1. Add the shows to `scripts/show-list.json` (type = row, `tags` = collections).
2. `node scripts/hunt.js --priority --first "New Collection"` puts it at the front of the line
   (comma-list for several). `node scripts/art.js` and `node scripts/people.js --episodes` fill
   posters and X-Ray for the newcomers.
3. The collection appears on the site by itself as soon as one show plays; the two-hour publish
   carries it live. No site code changes needed.

Related: `docs/LATER.md` (parked directions), `docs/VOID_UNIVERSITY.md` (the learning side).
