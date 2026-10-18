# Motion and Promos: ads, the HQ editor, and promos on voidtv.net

Handoff for the next session. State as of 18 Oct 2026. Built in the "Void TVC motion hyper frame" chat,
alongside the "Voidtv" chat (which owns the rest of the motion kit, the stings in `videos/` and the player).

## What exists

**Seven ads, each in three shapes:** 16:9 1920x1080, 9:16 1080x1920 (`-vertical`) and 4:5 1080x1350 (`-feed`).
21 MP4s, 30 fps, H.264, no audio. All pass `hyperframes@0.8.168 check`.

| Piece | Message | Length |
|---|---|---|
| `spot-30` | Full spot: Free TV beats, library count-up, search, press play, manifesto, giving, neon sign | 29.6 s |
| `ad-free` | "Free TV. No ads. No account." | 9.2 s |
| `ad-library` | 4,600+ shows and 50,000+ episodes count up; "Find the show you forgot you loved." | 10 s |
| `ad-search` | A search types itself; results; "Search every show, every episode, instantly." | 9 s |
| `ad-speed` | Play button pressed; "It plays. Starts in seconds." | 8.2 s |
| `ad-manifesto` | "Before AI slop, there was human creativity." | 8.8 s |
| `ad-give` | "Free because people give." CASH 501(c)(3), donation-supported, never required | 8.8 s |

Every ad ends on the neon-sign lockup (wall.jpg in 16:9, sign-pink.jpg in the tall shapes) with a call to action.

## Where things live

| Path | What |
|---|---|
| `motion/` | The Motion Pack Kit for voidtv.net, made with `studio-tools/motion-pack-kit/new-kit.mjs` (port 8221) |
| `motion/pack/ads.mjs` | **The ads.** Reusable scenes (free, stats, search, speed, manifesto, give, lockup) chained into ads; one build function serves all three shapes. Copy and wording defaults live here |
| `motion/pack/build-pack.mjs` | Kit core. Merges `AD_PIECES`/`AD_BUILD` (and the Voidtv chat's `NEON_*` from `neon.mjs`) into `PIECES`/`BUILD` |
| `motion/pack/content.json` | Every edited word and colour (the editor writes it) |
| `motion/pack/<piece>/` | Generated HyperFrames project per piece (gitignored, rebuilt by `node build-pack.mjs <piece>`) |
| `motion/pack/renders/` | Finished MP4s, named `voidtv-net-<piece>-<YYYYMMDD-HHMMSS>.mp4` (gitignored, about 220 MB, on this PC only) |
| `motion/hq/server.mjs` | The motion editor (http://127.0.0.1:8221). Imports build-pack once, so new pieces need a restart |
| `scripts/lib/promos.js` | HQ's bridge: render library, web/gate encoding, placements, share copies, go live, starting the editor |
| `scripts/hq.js` | Routes `/api/motion*`, `/api/promos*`, `/media` (Range streaming for previews) |
| `scripts/hq/index.html` | The **Motion** and **Promos** tabs, plus a Help paragraph |
| `scripts/lib/app.js` | Site: `/promos` page, home banner slot `#promohome`, About link "Spread the word" |
| `functions/_middleware.js` | Gate page: a muted loop behind the password box |
| `assets/brand/promos/` | Site copies plus `promos.json` (placements). **Untracked until Go live** |
| `C:\Users\bryan\Videos\voidtv.net\` | Share copies (full quality, faststart), made from HQ |

## How it works

1. **Make:** HQ > Motion shows the editor in an iframe. HQ starts it detached if it is not running (log:
   `catalog/cache/motion-server.log`), with HyperFrames telemetry off. "Restart editor" reloads new pieces.
2. **Send:** HQ > Promos lists every render (`motion/pack/renders` and `videos/<name>/renders`,
   `videos/<name>/vertical/renders`). "Send to voidtv.net" encodes:
   - Promos page / home banner: H.264 + faststart, crf 23, max 3.5 Mbps, at most 1920 on the long side,
     poster at 85% of the length, kept under 24 MB (Pages refuses files over 25 MiB).
   - Gate: two-pass, silent, at most 1280 on the long side, under 1.4 MB. Refused for anything over about
     20 s. Wide and tall copies; the gate picks by screen shape.
3. **Placements** live in `assets/brand/promos/promos.json`, fetched by the site at runtime, so a promo
   change is files plus a push with no code regeneration. Slots: `gate`, `home`, `promos` (ordered list);
   `ident` and `bumper` are reserved and **not wired into the player** (as-aired backlog item 10).
4. **Go live** is its own button. It commits only `assets/brand/promos` (`git commit -- <folder>`) and pushes
   master. The confirm dialog lists any other unpushed commits that would go with it. The scheduled publish
   (`publish.js`) never adds that folder.
5. **Share copy** writes `voidtv.net - <title> (16x9|4x5|9x16).mp4` to Videos\voidtv.net.

On the site: `/promos` lets visitors watch, switch shape and download. The home banner is a poster that
plays only when tapped (no autoplay on browse). The gate loop starts after page load and is skipped for
reduced motion and data saver. With no `promos.json` (Pages answers a missing file with index.html and a 200),
all three degrade to nothing; checked against the live deploy cf688b09e.

## Current state

- The code is live (commit 63d7c0967, pushed with cf688b09e). No promos are on the site yet.
- A test set waits in HQ > Promos for Bryan's Go live: Free TV in all three shapes on the promos page and as
  the home banner; the tvwall sting as the gate loop (1.39 MB copies).
- The editor on 8221 is HQ's detached copy, not tied to any chat.

## Rules (from brand-kit/ads/README.md and docs/TOMORROW.md §8b)

- The name is always **voidtv.net** (pink "voidtv", blue ".net"). Unbounded type, neon palette on #07080c.
- No show or studio artwork. No Internet Archive logo. No PBS or other brands in Kids pieces. The CASH
  cross stays small (it is a 120 px file).
- "Starts in seconds", never an exact number until real viewer data exists. Donations: "donation-supported,
  never required"; no tax-deduction promises.
- At most 3 flashes a second. A still frame for reduced motion. No autoplaying video on the browse page.
- The background art (assets/brand/bg, the neon alley set) is Bryan's own generated images.

## Open items

- **Go live** on the test set, or change it first (Bryan's click).
- **Sound:** the ads are silent. A music bed or the sound logo (§8b piece 14) would need adding.
- **HEVC:** site copies are H.264 only. An HEVC source with H.264 fallback was offered and not chosen.
- **Ident and bumpers** in the player: needs the as-aired work (Voidtv backlog item 10).
- **Animation plan:** `C:\Users\bryan\sprite-forge\LOCAL-ANIMATION-PLAN.md` §7 lists what VOID wants from
  the local model (character ident, bumpers, Kids sting). Finished MP4s dropped in
  `videos/<name>/renders/` appear in HQ > Promos automatically.

## Commands

```
node motion/pack/build-pack.mjs <piece>                  regenerate one piece (or all, with no argument)
cd motion/pack/<piece> && npx --yes hyperframes@0.8.168 check .
npx --yes hyperframes@0.8.168 snapshot motion/pack/<piece> --at 1,5 --no-end --describe false
node scripts/hq.js --port 8783                           a test HQ beside the real one (8780)
```
Set `HYPERFRAMES_NO_TELEMETRY=1` and `DO_NOT_TRACK=1` for any HyperFrames command.
