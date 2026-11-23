# Moments: VoidTV around what is in the news

Bryan, 22 Nov 2026: "id like a way to capitolizer off oid current events and allow reorganizing around them ie gta how we
are doing etc. fior movies and tv and all things. we havre the archive of history to use to build relevent row or pages , ads".

A **moment** is something in the public eye: a new Grand Theft Auto, an anniversary, a film remake, a holiday, a final.
While it is on, each area of voidtv.net that reads moments shows a row of what VoidTV already carries for it, with an ad line.

## Making one by hand (no AI needed)

1. Open HQ (double-click `HQ.cmd`), Void TV, the **Moments** tab.
2. Press **New moment**. Fill in:
   - **Name** and a **short id** (small letters and dashes, like `gta`).
   - **Starts**, **Peak**, **Ends**. It shows from the start day to the end day, by the visitor's own date, and stops by
     itself. With two moments on, the one nearer its peak comes first. At most two show on a page.
   - **Why it matters**: one line, for you.
   - **Switched on** and **Approved by me**. Nothing shows without both.
   - **Also on Kids**: off unless the moment is right for children. Kids still checks every item by its own rules.
   - **Ad line** and its **Button**, and the area it belongs to.
3. For each area (PLAY games first; more areas come later), give the **Row title** and what to pick. An item is picked when
   it matches any of: Archive items (the part after archive.org/details/), title words (whole words), Wikidata ids,
   people, series. Then it must pass all of: years from and to, only these genres, only these machines. **Never these**
   takes items out. **Put these first** sets the order; the rest follow by year, most played, or name.
4. Press **Preview what it picks**. A row needs at least its number of items (2 unless set), so a moment never shows
   one lonely box. If the preview says 0 or 1, add Archive items or title words.
5. Press **Save**, then **Publish now** at the top. The change reaches visitors on the next build, at once (the engine's
   address carries a version made from the moments, so Cloudflare's cache does not hold the old ones).

**Switch off** takes a moment down and keeps it. **Remove** deletes it.

## House lines a moment keeps

- No adult content. Never on Kids unless ticked, and then Kids' own check still applies.
- No other company's art, logo or lettering in VoidTV's own rows or ads: name the game, show or film plainly.
- No long dashes in any of its words (HQ refuses them).
- The CASH donation line stays the only ask; an ad line never gates anything.

## Where things are

| What | File |
|---|---|
| The moments | `catalog/moments.json` (HQ writes it; Publish now sends it) |
| The rules (one engine, every area) | `assets/brand/moments/moments.js` |
| What the site build publishes | `scripts/lib/moments-pub.js` (only moments on, approved, sound and not over) |
| HQ's tab | `scripts/lib/momentshq.js`, `scripts/hq/moments.js` |
| Tests | `tests/moments.test.js` |

## Areas

| Area | Reads moments |
|---|---|
| PLAY games | live since 22 Nov 2026: the banner opens on the moment (our own look, the ad line large, a button to the row), then the row first under it (Bryan's layout B) |
| On Demand shows and movies | the voidtv.net home page (Bryan's layout B): a gold card with the ad line right under Live TV, which stays first, then the row. The card's button and the row's See all open the moment's own list, /?moment=<id>, which the other filters can narrow. The shows rule picks from the series, the movies rule from the films; one row draws on both. Never the 18+ shelf, never a show the viewer turned down, never on Kids |
| Live TV, Trivia, University | not yet: their rules can be written and are kept for when they do |

HQ's Preview counts On Demand picks from the list visitors get (voidtv.net/data/index.js, the same file the home page reads), or
the last local build when the site cannot be reached; it reads that list once every 10 minutes at most.

**Christmas** is saved switched off (Bryan, 22 Nov 2026: "engine only, no moment"), 1 to 31 December, peak the 25th, with his line
"Before streaming, there was Christmas TV." Its rule picks titles with Christmas, Santa, Rudolph, Frosty, Grinch, Scrooge,
Nutcracker, Mistletoe or Yuletide, and leaves out Noel's House Party by name (a BBC show, not a Christmas one). Switching it on in
HQ is his yes; Publish now sends it, and it shows from 1 December by itself.

Finding moments (news, anniversaries from Wikidata, release calendars) is a later, optional step: suggestions will wait in
HQ for Bryan's yes and never show before it.
