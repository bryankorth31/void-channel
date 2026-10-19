# VOID player — design

Built apart from VOIDtv on purpose: nothing in the live site loads it yet. It connects later through the
contract at the bottom of this file.

## The problem it exists to solve

Testers' number one complaint: the picture freezes for a second or two while the sound keeps going, then
comes back behind the sound and stays out of sync until a reload. The 16 October audit
(`docs/SYSTEM-AUDIT.md`) found the files themselves are sound, and traced the problem to how the
system delivers and plays them:

| Cause | Where it lived | What the player does now |
|---|---|---|
| Heaviest copy chosen on ties; originals preferred over the Archive's light re-encodes | `scripts/match.js`, `scripts/hunt.js` | `tools/rank-sources.js` ranks copies lightest-clean-first among equally trusted ones |
| Each piece of an episode can come from a different Archive server | archive.org redirects | Plays straight from the item's primary storage server, with the backup server next |
| No fallback when a file stalls or fails | the site ships one link per episode | Every episode carries a ranked try-list: copies × servers × the Archive's normal link |
| "Backups" that are other episodes | `match.js` alternates | Only same-episode backups by a hard signal, cross-checked with the filename's episode code |
| Old videos abandoned, not shut down, on every episode change | `showView` rebuilds the page | One `<video>` for the player's life; each switch pauses, empties and reloads it |
| Freezes and drift invisible to every monitor | no error is raised | Every stall, freeze, drift, fix and switch is an event the host can send to analytics and Sentry |
| TV channels had no protection at all | browser built-in controls | One player for every page |

## Shape

```
core.js     the brain. No DOM. Samples in, decisions out. Fully unit-tested (test/core.test.js).
player.js   the body. One <video>, the controls, server lookup, carrying out the core's decisions.
player.css  scoped under .vpx; brand colours as custom properties.
icons.js    generated from brand-kit/icons/ui by tools/build-icons.js.
```

### What the Archive actually does (measured 17 October)

Range requests straight to an item's two storage servers usually answer in under 0.6 s at 0.6-1.6 MB/s,
far above the 0.1 MB/s an episode needs. But intermittently a server takes 3.5 s to start sending, or sends
nothing for over 20 s; once, both servers of Marco Polo hung at the same moment. Those hangs hit every
viewer alike. The browser keeps only about 20-40 s of an episode buffered (Chromium aims for roughly
10-20 s or 2-4 MB ahead for progressive files; we cannot raise it), and it never retries a hung request on
another server. A hang longer than the buffer is a pause on screen. The storage servers do not allow pages
to read video bytes (no CORS on 200/206, OPTIONS 405), so a player that keeps its own large buffer would
need a relay in between; that is a separate decision (Cloudflare terms and cost).

### What the core watches (sampled every 250 ms, plus every presented frame)

- **Buffer watch (hop before the picture stops):** the buffered end has not moved for 4 s while less than
  10 s is buffered ahead, and the picture is still playing (or has just stopped with under 1 s left). The
  download has stalled, so the core opens a fresh connection to the item's other server now, instead of
  waiting for the picture to stop and then 3.6 s more. It may only move (another server, the next copy);
  it never ends playback. See "The buffer watch" below.
- **Starved stall:** the playhead stops with under 1 s buffered: the server stopped sending. After 3 s the
  player opens a fresh connection to the item's other server at the same moment; if that starves too, it
  keeps cycling (the first may have recovered), and after two full passes it tries the next copy. A copy
  with one server only (the lookup failed) has nowhere to hop: if it is the last source it is reloaded once,
  once the picture has stopped, before the player gives up (the Archive link may redirect to another server),
  and never more than once per hang (the allowance refills after two minutes of playing).
- **Buffered stall:** the playhead stops with video still buffered (a browser hiccup). Left alone for 6 s,
  then the nudge / reload / switch ladder below.
- **Freeze:** the sound clock moves but no new frames arrive for 1.5 s, *while the page is actually being
  drawn*. Pages that report "visible" but draw nothing (hidden embedded views, covered windows, some TV
  browsers) get no frames for innocent reasons; the player checks the browser's drawing heartbeat
  (`requestAnimationFrame`) before believing a freeze. The lab caught this: without the check, a hidden
  page produced nine false freezes in 30 seconds.
- **Drift:** frames arrive but behind the sound by more than 0.45 s for six frames in a row
  (`requestVideoFrameCallback` media time against the playhead). 0.1 s of natural lag is ignored.
- **Errors:** network errors and never-loaded sources get one retry; decode and format errors do not.
- **Slow start:** nothing plays within 15 s of asking.

### What it does, per source, escalating if trouble repeats within two minutes

1. **Nudge:** jump to where the sound is. This flushes the decoders and re-aligns picture and sound,
   which is what a reload did for testers, without the reload. Nothing repeats, nothing is skipped.
2. **Reload** the same source at the same moment.
3. **Switch** to the next source: same copy on the backup server, then the Archive's normal link, then the
   next copy. Position is kept.
4. **Fail** honestly: "The Archive is not sending this episode right now" or "will not play in this
   browser", with Try again, Download, Next episode and Report. Never an endless spinner. Which text is
   shown is decided by the cause the core attaches to the failure, never by the page (next section).

After every action it waits 2.5 s before judging again, and only reports "recovered" after 5 s of clean
playback.

### Why it failed: the cause table

The `failed` event and the `show-failure` action carry `cause`: `network`, `format` or `playback`, plus
`reason` (what the last trouble was) and `code` (the last media error code, if any). The card text, the
analytics code and the Sentry title all follow the cause. Before this table the page guessed from the reason
text with a regex, so an Archive hang that ended as `starved` was shown as "will not play in this browser",
told the viewer to download the file, and was logged as "format not supported" (finding SP-019).
The last trouble decides the cause when an episode ends after mixed trouble. In the table, "`error` event"
means the analytics event of that name (blob1 = `error`, the number in n), not an event inside the core; the `pq:`
names are the `x` of an `act` event (step before kind: `pq:action:<step>:<kind>`).

| Reason | Cause | Viewer sees | Logged | Core does next |
|---|---|---|---|---|
| `starved` (picture stopped with under 1 s buffered, or the buffer watch fired) | network | "Reconnecting..." then "Switching to a backup copy..."; if everything fails: "The Archive is not sending this episode right now" with Try again, Download, Next, Report | `pq:stall` (pos = seconds buffered), `pq:action:switch:starved`, `pq:switch>copy1@backup`; on failure an `error` event with n = 2 and Sentry "Playback failed (network)" | hop to the copy's other server, cycling twice, then the next copy; a lone last server is reloaded once (`pq:action:retry:starved`); then fail |
| `stall` (picture stopped with video buffered) | network | "Catching up...", "Reconnecting...", then the same card | `pq:stall`, `pq:action:nudge:stall`, `pq:action:reload:stall`, `pq:action:switch:stall` | nudge at 6 s, reload at 12 s, switch at 18 s; after the last source, fail |
| `slow-start` (nothing plays within 15 s) | network | "Reconnecting...", the same card at the end | `pq:action:switch:slow-start` | next source at once, each gets its own 15 s |
| `error-net` (media error 2, or a source that never loaded) | network | "Reconnecting...", the same card at the end | `error` event n = 2, `pq:action:reload:error-net` then `pq:action:switch:error-net` | reload once after 1.5 s, then the next source, then fail |
| `error-fatal` with code 3 (decode error) | format | "This episode will not play in this browser", with Download, Next, Report | `error` event n = 3, Sentry "Playback failed (decode)" | skip to the next copy at once (another server of the same file cannot help); then fail |
| `error-fatal` with code 4 (not supported) | format | the same card | `error` event n = 4, Sentry "(format not supported)" | the same |
| `error-fatal` with code 1 (aborted) | playback | the same card | `error` event n = 1, Sentry "(aborted)" | the same |
| `freeze`, `drift` (repeated until the ladder ends) | playback | nothing at first, then "Switching to a backup copy..."; the same card at the end | `pq:freeze`, `pq:drift`, `pq:action:*`; on failure an `error` event with n = 0 | nudge, reload, switch, then fail |
| `silent` (no sound decoded) | playback | "Switching to a backup copy..."; on the last copy the notice "No sound for this episode in this browser", and it keeps playing | `pq:silent`, `pq:silent-final`; no `error` event | next copy; the last copy keeps playing with the notice |
| `no-sources` (no copy this browser can play) | format | "This episode will not play in this browser" | `error` event n = 4 | fail at once |

There is no separate `error-decode` or `error-format` reason in the core: both are `error-fatal`, told apart
by `code`. A decode error keeps its own number (3) in the logs so Sentry can tell it from a file type the
browser does not support (4). The report sent from the failure card carries `cause`, `reason` and `code`.

### The buffer watch

Every earlier trigger waited for the picture to stop, so the best case was about 4 s of stopped picture
plus the new connection (measured 0.1 to 3.5 s), and a "no pause over 3 seconds" goal was out of reach
(finding SP-021). The browser keeps 10 to 40 s of video ahead, so a hang shorter than that never shows
until the buffer is gone. The core now also watches where the buffered range ends:

- **When it fires:** the buffered end has not advanced by more than 0.05 s for 4 s (`BUFFER_STALL_MS`) and
  less than 10 s (`BUFFER_LOW_S`) is buffered ahead, while the picture plays (or has stopped with under 1 s
  buffered). It counts as a starving stall: one `stall` event (with `trigger: "buffer"`, `ahead`, `flatMs`
  and `grewS`, the seconds of video the buffer gained in the last 10 s or so) and then the same hop to the
  other server. The hop discards what was buffered (one reused `<video>`), so the pause the viewer sees is
  the new connection's start, not 4 s of waiting plus that. The 4 s clock runs from the end of the 2.5 s
  settle after the last hop, so a fresh connection gets about 6.5 s to send its first byte before the core
  tries another (without the watch, about 6 s); a hop that starts the clock at the hop itself gave it only 4.
- **It never ends playback:** the watch only moves: to another server of the copy, or to the next copy. When
  the only move left would be to fail (the last copy with its server passes spent) or to reload a lone server
  (a reload throws away the 4 to 9 s still buffered), it does nothing and leaves it to the stopped-picture
  path, which fails honestly once the picture has really stopped. This is decided before the stall event is
  sent, so a declining watch makes no noise. Without it, four 6 s hangs that each healed on their own ended in
  the failure card with 9 s still buffered.
- **The hop allowance is per hang:** the server passes and the lone reload come back after two minutes
  (`REPEAT_WINDOW_MS`) of playing with no hop or reload.
- **When it never fires:** while the viewer has paused, is seeking, or the episode has ended (each also
  restarts the 4 s clock); while the buffer is still growing, however slowly (a slow line is not a hung
  server); while the browser itself paused the download (`networkState` idle, the browser decided it had
  enough); when the whole file is buffered (a flat buffer at the end of the file); when the file length is
  not known; when the playhead is stuck with video buffered (a browser hiccup, the gentle ladder's job);
  and not during the 2.5 s settle after any action.
- **Pause maths:** the stopped time the summary reports (`stallMs`, `rebufferRatio`, `longestPauseMs`) now
  runs from the moment the picture stopped, or the hop, to the picture coming back, across hops. Before,
  a hop reset the clock and the pauses that matter most were not counted.
- **Known risk to watch in the soak test:** if some browser keeps `networkState` at "loading" while it holds
  its download back on purpose, a healthy session shows `stall` events with `trigger: "buffer"` and
  needless hops. Healthy play must show none; if it does, raise `BUFFER_STALL_MS` or lower `BUFFER_LOW_S`
  in the config block at the top of `core.js`.

### What the 3 second goal needs, and what it costs (plainly)

The goal is "no pause over 3 seconds". The buffer watch reaches it only in good conditions:

- **It holds while video is still buffered when the download stops, and the new server answers within about
  2.7 s.** The hop happens 4 s after the download stops, with video still left to play, so the viewer sees
  only the new connection's start. Measured on the lab's made-up clock: with 5 s or more buffered and a first
  byte after 1.2 s the picture stands still for about 1.3 s; after 2.7 s, about 2.8 s; after 3.5 s, about
  3.5 s, which just misses. The first-picture time on the Archive is 0.1 to 2.7 s on a good day and
  sometimes 3.5 s.
- **It does not hold when the buffer is thin or empty** (under about 2 s: a slow line, just after a seek,
  early in an episode). The watch still needs 4 s of flat buffer, so the picture stops and the old
  stopped-picture ladder decides: about 4 s of waiting plus the reconnect, a fraction of a second better than
  before and still over 3 s. Only a shorter watch for a thin buffer, or the hot standby (a second hidden
  connection ready to take over, SP-021 step 2), would change that. It is to be built only if Sentry still
  shows pauses over 3 s.
- **Hangs that would have healed inside the buffer now cost a pause.** The hop throws the buffered video
  away, so a hang that the buffer would have carried through unseen (the server comes back after 5 to 15 s)
  now shows a pause of about 1 to 3 s (the new connection's start), where before the viewer saw nothing.
  That is the price of the watch. If the soak or Sentry show too many of these, raise `BUFFER_STALL_MS`
  (4000) to 6000 or 8000: fewer needless pauses, a longer wait on a real hang.
- **A playhead stuck on buffered data** (a browser hiccup, not a hang) still waits 6 s per rung of the
  nudge, reload, switch ladder. The watch does not touch it.

### What leaves the page

Everything goes through the host's `onEvent`. VOIDtv's `vpEvent` (in `scripts/lib/app.js`) sends, through
the existing `/api/e` intake (no server change; `pos`, `dur` and `n` are stored as numbers):

| Event | Sent as | Numbers |
|---|---|---|
| first picture | `act` `pq:started` | n = start time in ms |
| a stall | `act` `pq:stall` | pos = seconds buffered when it began |
| trouble and fixes | `act` `pq:<event>[:<step>][:<kind>][><to>]`, for example `pq:freeze`, `pq:drift`, `pq:action:nudge:freeze`, `pq:switch>copy1@backup`, `pq:recovered:switch:starved`, `pq:silent` | none |
| end of play (once per episode: on ended, on leaving the page, on pagehide, or when the same player loads the next episode, whichever is first; only if something played; the event names the episode it is about, so a reused player such as Live TV reports each one under its own show; n is left out when the frame count is unknown) | `act` `pq:summary` | pos = rebuffer ratio x 1000, dur = watch time in ms, n = dropped frames x 1000 / frames |
| failure | `error` | n = 2 network, 3 decode, 4 format, otherwise the media error code (0 if none) |
| Report on the failure card | `report` | x = `fail:<cause>:<reason> <item>` |

The summary is flushed at once (the page's own pagehide handler runs before the player's and would
otherwise have missed it). Sentry gets the same trouble reports as before, now also sent on pagehide
because the lazy SDK is loaded (`Sentry.forceLoad()`) when the first picture appears; nothing is added that
identifies a viewer (`sendDefaultPii` stays false).

Reading it without any AI (Cloudflare dashboard, Analytics Engine SQL, dataset `voidtv_events`):

```
-- median and slowest-tenth start time, in ms, and how many plays
SELECT quantileWeighted(0.5)(double3, _sample_interval) AS median_ms, quantileWeighted(0.9)(double3, _sample_interval) AS p90_ms, SUM(_sample_interval) AS plays
FROM voidtv_events WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 = 'act' AND blob14 = 'pq:started'

-- plays, average rebuffer ratio (per mille) and average dropped frames (per mille), split by device and browser
SELECT blob8 AS device, blob9 AS browser, SUM(_sample_interval) AS plays, SUM(double1 * _sample_interval) / SUM(_sample_interval) AS rebuffer_permille, SUM(double3 * _sample_interval) / SUM(_sample_interval) AS dropped_permille
FROM voidtv_events WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 = 'act' AND blob14 = 'pq:summary' GROUP BY device, browser ORDER BY plays DESC
```

### Server lookup

`https://archive.org/metadata/<item>/workable_servers` and `/dir` (about 100 bytes together, CORS-open)
give the item's primary and backup storage servers. Results are cached in memory and in
`sessionStorage` for an hour; a 2.5 s timeout falls back to the Archive's normal link. Measured on Marco
Polo: two servers, both serving at several times the 0.1 MB/s the episode needs.

### Experience

- Real `<button>`s with labels; the slider has a spoken value; focus is always visible and large on TVs.
- Shortcuts follow YouTube's habits (K/space, J/L, F, M, C, N, 0-9) and never fire with Ctrl, Alt or ⌘,
  so browser shortcuts keep working. Left/Right move between controls when a control has focus
  (TV remotes); otherwise they skip.
- Lock-screen, headphone and keyboard media keys through Media Session.
- Double-tap the sides to skip on phones; tap to show controls.
- Volume remembered; captions from the file or from a picked .srt/.vtt; speed; picture-in-picture;
  fullscreen with the correct shape on phones and TVs.
- Up-next card with countdown that does not steal focus every second.
- Matroska copies only offered where the browser plays them; Ogg only where Theora plays.

## Testing

- `node --test player/test/core.test.js`: 55 scenarios: healthy play, short buffering left alone,
  freeze nudged and recovered, repeated freezes escalate to the backup server, drift caught, natural lag
  ignored, long stall ladder, network error retry then switch then fail, decode error switches at once,
  slow start, paused viewer untouched, hidden tab, browsers without frame timing, viewer seeking, Retry,
  no sources, summary maths, starved stalls and server cycling; and since fix batch B: the cause of every
  kind of failure, a lone server reloaded once, the buffer watch (fires on a flat buffer while playing;
  silent while paused, seeking, ended, growing, idle, complete or unmeasured; its clock starts when the
  settle time ends; a backup that needs 5 s to send is left alone; it never ends playback, over four
  separate healed hangs on a pair or two on a lone source; the allowance refills after two minutes) and the
  pause maths across hops.
- `player/lab/hop.html`: the same core driven by invented samples on a made-up clock: no video, nothing
  downloaded. It shows, with and without the buffer watch, how long after the download stops the core
  hops, how long the picture stays stopped, and the cause of a final failure. Seven cases carry an "as
  designed" badge. Open it from the lab's header link, or double-click `player\LAB.cmd` and go to `/lab/hop.html`.
- `player/lab/states.html`: every card and motion state frozen on a real player, no video: tuning in,
  recovering, the network failure card, the format failure card, up next.
- `player/lab/` — the real thing against real Archive episodes, with live diagnostics and fault buttons.
  Verified 16 October: plays from the primary server (2.7 s to first frame, 56 s buffered); a network
  error reloads in place then moves to the backup server keeping position; a dead first copy moves to the
  next copy; both servers dead falls back to the Archive link; nothing playable shows the failure card;
  40 s of clean play in a hidden page produced no false actions.
- Not yet verified: a real freeze on a visible screen being caught and fixed. That needs the lab running
  on a screen where it happens (the TV PC, testers' devices). The lab records every episode's result for
  exactly that.

## Status: connected to VOIDtv on 16 October 2026

`player/tools/connect-voidtv.js` applied the contract below to `scripts/lib/app.js` and `scripts/site.js`
(every anchor checked, old player removed entirely: `vpMarkup`, `vpInit`, `vpSync`, `vpFlash`, `vpCaptions`,
the TV page's built-in-controls video and the site's playback keys). Verified on a local build before going
live: show page plays from the primary server; N moves to the next episode in a fresh player and the old
video is emptied; leaving the show leaves no video playing; Live TV tunes in at the live point and ↑/↓
surfing replaces the player cleanly; resume picks up at the saved position; K, ←/→ and Ctrl+C behave;
phone width fits; an unstarted episode shows a play button, not a spinner.

To undo: `git revert` the connecting commit; the player folder stays as it was.

## Connecting it to VOIDtv (the contract)

1. **Data.** Each episode needs `files`: the output of `rankEpisode(ep)` from `tools/rank-sources.js`
   (`url`, `item`, `path`, `format`, `mbps`, `needs`, `conf`). `scripts/site.js` would write these into the
   per-show JSON instead of the single `url`. About 5,800 episodes gain a same-episode backup copy; 2,098
   change their first choice, 1,971 of them to a lighter file.
2. **Page.** Load `core.js`, `icons.js`, `player.js`, `player.css` once. Create one player for the whole
   session and call `load()` for each episode and each channel slot, instead of rebuilding the page.
3. **Callbacks.** `onNext` / `onPrev` (episode order), `onEnded` (autoplay next via `upNext()`),
   `onReport` (gets `diagnostics()`), `onEvent` (forward `started`, `stall`, `freeze`, `drift`, `action`,
   `recovered`, `switch`, `error`, `failed`, `quality`, `summary` to `track()` and Sentry).
4. **Resume.** The host keeps history; pass `startAt` to `load()` and read `currentTime` to save.
5. **Retire** `vpMarkup`, `vpInit`, `vpSync` and the TV page's built-in-controls video.
