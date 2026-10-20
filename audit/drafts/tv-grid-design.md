# Live TV as a real schedule: design (Step A)

## Report (21 Oct 2026)

**Branch** `worktree-agent-a6027475de8d91c4a` (cut from master 0bb967e5c). Nothing merged, nothing pushed. Five commits:

| Step | Commit | What |
|---|---|---|
| A | 4498b9eb9 | this design note |
| B | 8ca504601 | `scripts/lib/tvgrid.js`: the schedule builder and the pure schedule, `tests/tvgrid.test.js` |
| C | 62ae4b268 | the page plays the schedule (tune in, end of item, failure retry, tune/tuneHere), `data/tv.json` v2, tv-switch tests rewritten |
| D | 20eff78cf | the guide grid (coordinator's 20 Oct change to step D), `player/test/tv-guide.test.js` |
| note | the commit after D that adds this report | |

**Done.** Every channel (same 93, same ids) now has a 24 hour schedule computed on the viewer's own clock: six dayparts, Saturday
morning cartoons to noon, kids and cartoons in the morning, the best rated shows and a nightly movie in prime time, late shows at
night, strips that move one episode per airing and rotate to new shows each week (movies daily), a cap per show per day, real
start times (an elastic chain re-anchored at each daypart). The guide on the Live TV page is a full grid: sticky channels and time
ruler, a block per airing as wide as it is long, a clock line, past dimmed, Now / Tonight 8 pm / Tomorrow / the next 7 days,
filters (kind, text, On now), a card per block with Watch and Open show, arrow keys and a remote (G jumps to the guide), 10 foot
sizes at 1900 px, a one-channel list under 700 px, only the visible rows and time in the page. Playback and the guide call the same
functions (`chanNow`, `airingsBetween`, `nextAiring`), and a test checks the block on the clock against what playback joins.
Kept: the failed-episode memory (now per channel and episode, still an hour), the player kept across channel changes
(fullscreen survives), onEnded never stepping back, tune/surf/Up-Down surfing.

**Size.** `data/tv.json`: 2,046,131 bytes before, 144,278 after (7 percent of it; the shared library of typical minutes and episode
runs is 80,333 of that). `site/index.html` grew 149,411 to 178,203 bytes because the schedule code and the guide are inlined in the
page; the 1.9 MB saving is paid by anyone who opens Live TV. `node scripts/site.js` builds in about 20 s here (the 1 min 47 s I saw
once was a cold run).

**Tests.** `node --test tests/*.test.js`: 373 pass (352 before; +21 in `tests/tvgrid.test.js`). `node --test player/test/*.test.js`:
157 pass (137 before; tv-switch 9 to 16, new tv-guide 13). The other test files that copy `scripts/lib/*.js` into temp folders
(brand, backup-cache, publish, site-build) now copy `tvgrid.js` too. Also checked in the Browser pane on a real build at desktop,
1920 wide and phone sizes: grid, card, keys, filters and the phone list work.

**Not done / known.**
* No filler or "up next" cards (Q2). A short episode makes the next one start early, a long one is joined where the clock is.
* A viewer who stays on one channel for hours can drift a few minutes ahead of the guide; any channel change or reload resets it.
* Daylight saving: one airing in the overnight window is an hour off on the two switch nights.
* Gaps: about 1 in 4 daypart changes ends with an unfilled stretch (median 10 minutes, 90th percentile 14, worst 94 on channels whose
  episodes are 2 hours long, such as Dropout, TNT, ITV). In that stretch the next daypart's first show starts early.
* Kids and cartoons are a genre guess. The Void (all shows) also airs shows nobody marked adult in late night (for example The Jerry
  Springer Show, The Dark Side of Porn) and Oz in the daytime. Membership of channels is unchanged from before.
* Not tried: a real TV browser or remote, Safari, Firefox; the single-file preview (`scripts/preview.js`, embed mode) was not opened.
* `docs/BASELINE.md5` is not relocked (run `node scripts/lock.js relock` after merging). `audit/` is git-ignored here, so this file was
  added with `git add -f`. `player/tools/connect-voidtv.js` (an old patcher that matches old page text) is untouched. The old `.ch`
  list rules in the page CSS are unused now and left in.

**Open questions for Bryan** (the same ten as section 8 below, short form):
1. Real start times (8:00, 8:24, 8:48) or a strict :00/:30 grid with dead air or filler? I chose real times.
2. If strict: what fills the gaps (stings, promos, "coming up" cards)? Do you want short "up next" cards made?
3. Is "kids and cartoons" right as a genre guess (action cartoons like Batman and Samurai Jack in Saturday morning, not Adult Swim or MTV)?
4. The day starts at 6 am, prime time is 8 to 11 pm, late night 11 pm to 2 am. Right?
5. A movie at 8 pm every night on channels with 4 or more movies, or only Friday to Sunday?
6. Day chips and "Tomorrow" land on 8 pm and 8 am. Different landing times?
7. "On now" means only channels whose airing right now matches the other filters. Something else?
8. Should Adult Swim (not marked adult in the catalog) wait behind the 18+ door, and should The Void's late night be cleaned of shows like The Jerry Springer Show?
9. Everyone in the same time zone sees the same schedule, other zones differ (like regional feeds). Right?
10. Places change shows weekly. Faster or slower?

---

Goal (Bryan, 20 Oct 2026): voidtv.net Live TV should feel like real TV, not "chunks of the same in order".
Today every channel is one fixed list dealt round robin in 44 minute blocks and looped forever, so "what is on" is
the clock modulo one long list. This design replaces that with a 24 hour schedule per channel, computed from the
viewer's local clock with plain arithmetic (no server, no per-day file), plus a full TV guide grid (added by the
coordinating chat on 20 Oct: "like DirecTV, blocks, go forward in time, filterable, understandable").

## 1. What the data forces (measured on the catalog, 20 Oct 2026)

* 93 channels (1 all-shows, 17 rows, 13 collections, 60 networks with 2+ shows, TV Movies and Specials, Late Night).
  `data/tv.json` is 2,046,131 bytes today (it lists every episode of every channel, so a show on four channels is
  written four times).
* Episode lengths cluster at 22 to 25 minutes (about 58 percent) and 43 to 50 minutes (about 21 percent). TVmaze
  "runtime" says 30 or 60 (the broadcast slot with ads), the files are 22 and 44. A strict :00/:30 grid would leave
  about 8 minutes of dead air in every half hour. We have no ads to put there.
* Genres on the index: Kids 56 shows, Family 116, Animation 318. There are no TV-Y or TV-14 ratings, so "kids" is a
  genre guess. Ratings exist for 95 percent of shows (used to find the strongest shows).
* Channel sizes run from 2 shows and 1 hour of content (Channel 101) to 1,302 shows (The Void). Small channels cannot
  fill 24 hours without repeating, big ones never need to repeat.

## 2. The model in plain words

**The guide is the truth.** Every channel has a schedule for every broadcast day. A broadcast day runs 6:00 am to
6:00 am in the viewer's local time (so a late show at 1 am belongs to the evening before, as in a TV listing).
Everyone in the same time zone computes the same schedule from the clock, so the guide and what plays always agree.

* **Dayparts** fill the day in order: Morning 6 to 9, Daytime 9 to 5, Early evening 5 to 8, Prime time 8 to 11,
  Late night 11 pm to 2 am, Overnight 2 to 6. On Saturday the Morning block runs to noon (Saturday morning
  cartoons) and Daytime starts at noon.
* **Strips.** In a week, each place in a daytime holds one show for Monday to Friday and the show moves forward one
  episode per airing. The next week the places rotate to the next shows in that daypart's pool, so no show owns a
  place for ever. Saturday and Sunday use their own offsets into the pools, so weekends look different.
* **Pools.** The builder gives each daypart a pool of shows in priority order. Kids and cartoons feed Morning when
  the channel has at least 3. Shows that lean late (Adult Swim, MTV, sketch, talk, "Late Night Classics", "Awkward
  and Absurd") feed Late night. The strongest shows (rating, then episode count) feed Prime time. Movies and
  specials, where the channel has 4 or more, get a movie slot at the start of Prime time (one different movie each
  night: movies rotate daily, series rotate weekly). Everything else spreads over Daytime, Early evening and
  Overnight. A pool that is too small for its window is topped up from the best of the rest. A channel with fewer
  shows than it needs simply repeats them.
* **Variety.** A show may air at most `cap` times a day on a channel, `cap = max(2, ceil(1.2 * 1440 / typical minutes / shows))`
  (so a two show channel of 5 minute shows can repeat them as often as the day needs), and a show can fill at most one place per
  daypart pass. On a big channel that means at most 2 airings a day (a morning or daytime one and a late repeat only if the
  pools overlap), on The Void usually 1. The kids pool is never topped up with other shows when it has 3 or more, so Saturday
  morning is cartoons even when the channel has only 8 of them (they repeat).
* **Episode picked.** Show `s`, airing number `j` on that day, week `w`: `episode = (w * airingsPerWeek + airingsEarlierThisWeek + j + offset(s)) mod episodes(s)`.
  A show that holds the same place every week moves exactly one episode per airing, forever, and wraps at the end of
  the show. A show that rotates out and back simply continues where the arithmetic says. `offset(s)` is a fixed
  integer hash so different shows do not all start at episode 1.

### Time, slack and the "grid"

Decision: **elastic chain, not a rigid :00/:30 grid.** An airing starts when the previous one ends, with hard anchors
at the start of each daypart (6, 9, 17, 20, 23, 2). The builder-side planner (the same code runs in the page) adds
airings to a daypart until the next one would overshoot the window by more than 8 minutes (30 on a second pass
if more than 14 minutes would stay empty), looking at the next 6 candidates in the pool for one that fits. So the
day lands within a few minutes of each anchor, prime time starts at 8:00, and the end of a daypart that runs over
makes the next daypart start a little late ("the slot runs over, the grid catches up": the next daypart fits fewer
airings). Start times in the guide are real (8:00, 8:24, 8:48), shown to the minute.

Why not a half hour grid: 22 minute shows in 30 minute slots leave about 8 minutes of nothing every half hour. The
three ways to deal with it (dead air, filler, or letting a continuous viewer drift ahead of the guide a few minutes
every show) are all worse than a chain that is honest about its times. The brief's "next item starts early" is
kept for the small differences between a show's typical length and the file in front of you (below).

Planned length of an airing = the show's typical length (median of its episode minutes, stored once per show). The
real file can differ by a few minutes:

* Tune in or change channel: find the airing that contains now, play it from the clock offset (as today, a start
  within 5 seconds plays from zero). If that episode's file has already ended (shorter than planned), play the next
  airing from its start (early start).
* An item ends (`onEnded`): ask the clock. If the clock is in a later airing than the one that just ended, catch up
  to it (join it where the clock is, but start from zero when the clock is less than 3 minutes into it). If the clock
  is still in the same airing (the file was short) or behind, go on to the next airing from its start. Never step
  back (kept from the 20 Oct loop fix).
* Failure: unchanged. The failing episode is remembered for an hour per channel (`TV_DEAD`, now keyed by channel and
  episode, since airings no longer have a list position) and the retry and the end of an item skip it
  (`tvNextGood` walks forward through the schedule).
* A viewer who watches one channel for hours can drift a few minutes ahead of the guide (short files, the small gap
  before a daypart anchor). Any channel change or reload puts them back on the clock. Known and accepted.
* Short filler from the brand stings (`videos/voidtv-*`) is not used: it would be dead air with a logo. Open question
  Q3 below.

Daylight saving: the schedule is in local wall-clock minutes; a plan minute maps to a real instant through the
viewer's offset at that time. On the two switch nights one airing in the overnight window is an hour off. Accepted.

## 3. Data shape (`data/tv.json`)

```
{ "v": 2,
  "rt":  [22, 0, 44, ...],              // typical minutes per show, aligned with the SHOWS index (0 = not on any channel)
  "lib": [[1,1,24, 2,1,22], 0, ...],    // per show, runs of [season, first episode number, count], same index
  "channels": [
    { "id", "name", "kind", "shows", "eps", "adult"?, "mv"?,   // as before (mv: percent of the shows that are movies)
      "cap": 2,
      "p":  { "m":[idx...], "d":[...], "e":[...], "p":[...], "l":[...], "o":[...], "v":[...] },   // pools, priority order
      "sn": { "m":7, "d":19, ... },     // airings a daypart holds on a weekday; the weekly (or daily) rotation step
      "rd": "v"                         // pools that rotate daily instead of weekly
    } ] }
```

Episode lists are not repeated per channel, and episode titles are not in the file at all: the page already loads a
show's own file when it plays it. `lib` is only there so the guide can show S02E05 for an airing of a show that has
not been opened. The size before and after is reported at the end (before: 2,046,131 bytes).

## 4. The math (all integer, same code in builder tests and page)

* `off(ms)` = viewer's UTC offset at that instant (default from `Date`, injectable for tests).
* local milliseconds `L = ms + off(ms)`; broadcast day `bd = floor((L - 6h) / 24h)` (a day count since 1970),
  weekday `dow = (bd + 4) mod 7` (0 = Sunday), week `w = floor((bd + 4) / 7)`.
* a plan minute `W` (360 = 6:00 am of `bd` up to 1800 = 6:00 am next day) is the instant `toAbs(bd * 864e5 + W * 6e4)`.
* `weekPlan(channel, w)` plans the 7 days of week `w` once (cached per channel and week), then counts each show's
  airings per week and before each weekday so `episode` above is exact.
* `dayPlan` for one day: walk the dayparts, `t = max(t, anchor)`, fill as described in section 2, rotate pool
  position by `(w * sn[q] + dayShift) mod pool length` (weekly pools; `dayShift` is 0 Monday to Friday, a third of the
  pool on Saturday, two thirds on Sunday) or `(bd * sn[q]) mod pool length` (daily pools).
* airings tile the day: an airing ends where the next starts; the last one ends at 6:00 am (or where it really ends if
  it runs over, then the next day's first airing is still scheduled at 6:00 am sharp, nobody watching is cut off).
* `chanNow(channel, at)` returns the airing, the offset into it and the time left. `airingsBetween(channel, t0, t1)` is
  what the guide draws. Playback and guide call the same function, so they cannot disagree.

## 5. What changes in the code

* New `scripts/lib/tvgrid.js`: the pure logic as one function factory so the page can inline its source
  (the pattern `app-fetch.js` and `app-me.js` already use) and tests run the same text. Exports the builder
  (`buildChannelPlans`) used by `buildChannels`.
* `scripts/lib/app.js`: `buildChannels` keeps the same channel list and ids and now returns pool plans instead of item
  lists; `assemble()` also returns the shared `rt` and `lib`. The page's Live TV section loses `TV_EPOCH` and
  `c.items`: `chanNow`, `tvPlay(c, airing, offset)`, `onEnded`, `tvNextGood`, `tuneHere`, `osd`, `guideRows` use the
  schedule. `tune`/`tuneHere` (player kept, fullscreen kept) and the failure memory are kept.
* `scripts/site.js`: writes the v2 `tv.json`, prints its size. `scripts/doctor.js`: its "items point at no show" check
  becomes "pool entries point at no show".
* Tests: new `tests/tvgrid.test.js` (builder and schedule, fixed zone), `player/test/tv-switch.test.js` rewritten on the
  new shape (same intents, plus the early start and end of item cases), new `player/test/tv-guide.test.js` (grid math
  against playback, filters, keyboard, window rendering). `tests/site-build.test.js` copies the new file.

## 6. The guide grid (Step D, as asked 20 Oct)

Replaces the channel list under the player on Live TV.

* **Layout.** Channels down the left (sticky), time across the top in half hours (sticky ruler), each airing a block
  as wide as it is long (5 px a minute, 7 on screens 1900 px and wider), show title and S/E code in the block, a red
  "now" line, blocks before now dimmed, the block that is playing right now outlined. A week of time (7 days) is one
  scrollable area; only the rows and blocks in view (plus one screen of margin) are in the page.
* **Moving in time.** Scroll, or the buttons: Now, Tonight (8 pm), Tomorrow (8 am), and a chip for each of the next 7
  days (lands on 8 pm that day). The ruler shows the day and date at midnight and at each jump.
* **Filters** (one row above the grid): kind (All, Rows and genres, Collections, Networks, Movies), a text box (channel
  name or show name: a channel stays when its name matches or it carries a matching show, and matching blocks are
  highlighted), and "On now" (keeps only channels whose current airing matches the other filters, and jumps to now).
  Late Night appears only when the viewer has opened the 18+ door, as today.
* **A block opens a card**: show, S/E and episode name (loaded when the card opens), start to end time, the show's
  description, `Watch` when it is on now (tunes the channel on the same player), `Open show` always.
* **Ten feet and a remote.** The grid is focusable. Left and Right move to the previous or next airing on the channel,
  Up and Down to the channel above or below at the same time, Enter opens the card (Enter again on a "Watch" button
  watches), Escape closes the card, PageUp and PageDown move 3 hours, Home goes to now. Type sizes grow on 1900 px
  screens. The existing Up/Down channel surfing stays when the grid does not have focus.
* **Phones** (under 700 px): one channel at a time. A channel picker (with the same filters) and a list of that
  channel's airings for the chosen day, with day chips and the "now" row marked. Tap a row for the same card.

## 7. Steps and commits

A. this file. B. `tvgrid.js` with the builder, the schedule and `tests/tvgrid.test.js`. C. page side (`chanNow`, play,
end of item, failure, tune) with the rewritten `tv-switch` tests and `tv.json` v2. D. the guide grid with its tests.

## 8. Open questions for Bryan

1. **Real start times or a strict :00/:30 grid?** This design lets a show start when the last one ends (8:00, 8:24,
   8:48) because most files are 22 or 44 minutes and the alternative is 8 empty minutes in every half hour. Do you
   want that, or a strict half hour grid with something in the gaps?
2. **What fills a gap, if you want the strict grid?** Stings from `videos/voidtv-*` look like dead air with a logo.
   Real TV fills it with promos, "coming up" cards and station IDs. Do you want short "up next" cards made (motion
   is not touched by this work)?
3. **Kids and cartoons are a genre guess** (Kids, or Family with Animation, or Animation with Action or Sci-Fi; not
   Adult Swim or MTV). The catalog has no age ratings. Are Batman or Samurai Jack fine for Saturday morning, or should
   only the Kids/Family tagged shows go there?
4. **The day starts at 6:00 am** (a 1 am show is "last night"). Prime time is 8 to 11 pm, late night 11 pm to 2 am.
   Those are my picks; tell me the ones you want.
5. **Movie night at 8 pm** on channels with 4 or more movies. One different movie a night, then series. Wanted on
   weekdays too, or only Friday to Sunday?
6. **Day chips and "Tomorrow"** land on 8 pm and 8 am. Different landing times?
7. **"On now"** here means "only channels whose current airing matches my other filters". Did you mean something else
   (for example, hide everything that is not playing right now, or only shows that are in their first minutes)?
8. **Adult content in the grid:** Late Night rows stay behind the 18+ door as today. Should Adult Swim (not marked
   adult in the catalog) also wait behind it? Today it does not. Also, The Void (all shows) puts shows nobody marked adult
   (for example The Jerry Springer Show, The Dark Side of Porn) into its late night hours; should they be kept out?
9. **Same for everyone only within a time zone.** Everyone in the same zone sees the same schedule; a viewer in Los
   Angeles and one in New York see different things at the same clock moment (like regional feeds). Right?
10. **Rotation speed:** a place changes shows weekly. Faster (every few days) or slower (monthly)?
