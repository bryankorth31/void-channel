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
- **Report only, never acted on:** hitches, A/V lag, the pictures a second (file, decoded, shown, dropped share),
  and throttled stretches. They change nothing (no seek, no speed change, no hop, no switch) and only count while
  the picture plays steadily. See "Picture and sound out of step" below.

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

## Picture and sound out of step (audit ask A-022)

What a viewer sees: the picture stops for a moment while the sound goes on, then jumps ahead; or the words do not
match the lips. Bryan saw it on Marco Polo S1E1 during the 2-hour soak while the lab showed 0 freezes, 0 drifts and
0 stalls. The freeze and drift checks were doing their job; they were built for something else, and this section is
what was added so the soak sees this too.

### Why the old measures missed it

1. **A freeze needs 1.5 s** with no new picture while the sound runs. A hitch of 0.3 to 1.4 s never counted. After
   one, the browser drops the late frames to catch up, so by the time frames flow again the gap is near zero.
2. **Drift needs the picture 0.45 s behind for six frames in a row.** Lip-sync errors between about 0.1 s and 0.45 s
   are plain to a person and sit under that line.
3. **An offset built into the file plays "on time" by the file's own clock.** If the audio and video timestamps
   disagree, or one track is slightly longer so the gap grows over the episode, the page's media time and the
   playhead agree while the lips are off. No measure inside the page can see that.

### What each new measure catches (and what it does not)

All of them only count **while the picture plays steadily**: not paused, seeking, waiting for data, hidden or off
screen, in picture-in-picture, settling after play, a seek, a hop or a resume, not in the first 2 s of steady
playing (`STEADY_MS`), only at speed 1, and with the page drawing. They only measure and report. Where the browser
has no `requestVideoFrameCallback` the sync, hitch and shown-rate figures say "no measure" (null in the summary, "n/a"
in the lab), never zero.

| Measure | In plain words | Fires when | Catches | Cannot catch |
|---|---|---|---|---|
| `hitch` | the picture stood still for a moment and caught up | a shown frame arrives 250 ms or more after the last (and more than 3 frames of the file's own pace), while the sound ran, under 1 s | the 0.3 to 1 s stutters the freeze check never sees | a stop over 1 s is a throttled stretch (below), over 1.5 s the freeze check takes it |
| `avlag` | picture and sound apart for a while | the gap over 0.25 s for 1 s without a break, counted again at most every 10 s while it lasts; `maxAvGapMs` is the largest single reading | the decoder falling behind: lips off by 0.25 to 0.45 s, under the 0.45 s drift level that acts | **an offset baked into the file**: the gap is measured against the file's own clock, so it reads 0 while the lips are off |
| `lowfps` | the page shows far fewer pictures a second than the file holds | shown frames a second under 60 percent of the file's rate for 10 s of steady play, once | a machine that cannot keep up | which side is at fault: read it with the next three numbers |
| `lowsourcefps` | the file itself has too few pictures | the file's rate under 15 a second, while the browser makes about as many frames as the file claims and drops few | a bad derive (a catalog problem: pick another copy), not the player | |
| `decodelag` | the browser is falling behind | more than 10 percent of its frames dropped over the window, for 10 s of steady play, once | a weak or throttled decoder | |
| `throttle` | the browser stopped asking for frames while the sound ran on a visible page | no frame callback for over 1 s while the sound moved and the page was on screen; says whether the page's own drawing stopped too | Edge efficiency mode, power throttling of the process, a covered window the browser still calls visible | |
| Out of sync? | the viewer says so | a press of the button (below) | **the offset built into the file**, and anything else a person notices | |

The gap is read with the frame's `expectedDisplayTime` taken into account: the playhead is read when the page is
called for a frame, the frame is shown a moment later, so the normal one-frame offset (more on a slow machine) is
not lag. Without `expectedDisplayTime` the plain difference is all there is.

**The honest limit.** A file whose audio and video timestamps disagree (or whose tracks differ in length) is caught
only by a person (the button) or by an offline look at the file's audio and video start times and durations with
ffprobe. A proposal for Bryan, not built: one small header read per suspect file, which is an Archive call and needs
his OK.

### Reading the four numbers: the file, the decoder, the screen, and the drops

| File (frames a second the file holds) | Decoded (frames the browser makes a second) | Shown (frames the page presents a second) | Dropped share | Reading |
|---|---|---|---|---|
| about 24 | about 24 | about 24 | near 0 | the player keeps up. If the lips are still off, the offset is in the file: use the button, check the file offline |
| about 24 | far under 24 (under 90 percent) | far under | over 10 percent | the playback side on that machine is falling behind (decoder, power saving, throttling, a covered window), not the file. `decodelag`, `lowfps` |
| about 24 | about 24 | far under | high | made but not shown in time: the display path (compositor, GPU, a slow screen) |
| about 7 | about 7 | about 7 | near 0 | the file has too few pictures (`lowsourcefps`): a catalog problem, pick another copy or the original |
| about 24 | far under | far under | low, with throttled stretches in the log | the browser was held back (Edge efficiency mode, sleeping tabs, Windows power throttling): see the throttle log |

The file's own rate is read from the media-time step between consecutive shown frames (`SRC_MIN_STEPS` = 24 steps
before it is reported). A browser that falls behind shows only some of the frames, so many steps are 2, 3, 4 frames
long; the file's step is the smallest one that keeps turning up (at least 3 steps, and 2 percent of them, within 12
percent of each other). A test feeds steps of 50/1199 s with two of every three frames missing at random and reads
23.98. The limit: if the browser drops frames in a perfectly regular pattern (every third frame, always), every step
is 3 frames long and nothing in the steps says otherwise; the estimate reads a third of the real rate. That is why
`lowsourcefps` is withheld while the dropped share is over 10 percent or the decoded rate is under the file's.

**Marco Polo S1E1 (19 Oct 2026).** The file is clean: h264 Main 960x480, progressive, 23.98 frames a second (1199/50),
73,020 frames over 3,045.04 s, audio and video both starting at 0.000 (header probe). In the soak the browser decoded
about 2.8 frames a second over 206 s and dropped a third of them, with hardware decode confirmed on (the NVIDIA card,
Direct Composition and overlays on). The old measures said nothing because the sound never stopped and the gap stayed
under 0.45 s. With these numbers the lab reads: file 23.98, decoded far under it, dropped 30 percent and more: the
playback side of that PC, not the file.

### Throttled and hidden time

The lab keeps two logs, apart from every counted measure. **Hidden:** every change of `document.visibilityState`
with its time and length. **Throttled:** the core logs a stretch whenever no frame callback arrived for over 1 s
(`THROTTLE_MS`) while the sound moved and the page was on screen, and whether `requestAnimationFrame` was also paused
in that stretch (a page-wide throttle) or not (video only). Time hidden or throttled is left out of hitch, lag and
dropped-frame figures: the windows start again afterwards. While a stretch is going on the lab shows "throttled" next
to the pictures-a-second readout. (A video that is simply dropping every frame also stops calling back; the
dropped share and the decoded rate tell that apart from a throttle.)

### The "Out of sync?" control

The player has no menu, so the item is one button in the control row (`data-a="avsync"`, no class of its own, so
nothing outside the `vpx-` prefix), reached by Tab like the other controls and by Left and Right on a TV remote. A press
only records: it stamps the moment (position, copy and server, frames and dropped, file / decoded / shown rates, the
dropped share, the last 30 gap readings, the last hitches and throttled stretches) and emits one `user-avsync` event.
Pressed again within 10 s it stamps once (the status line still says "Noted"). It never seeks, reloads, hops or changes
the speed. Because the control bar has no room on a phone and `player.css` hides the speed and picture-in-picture
buttons at that size, the button hides when the player is narrower than 720 px; a host can leave it out with
`outOfSync: false`. Pressing it counts in the summary (`outOfSyncPresses`).

### The new settings (the top of `core.js`)

| Name | Value | Meaning |
|---|---|---|
| `HITCH_MS` / `HITCH_SRC_FRAMES` | 250 / 3 | a shown-frame interval over both = a hitch (the second keeps a slow file from being all hitches) |
| `HITCH_EMIT_MS` / `HITCH_EMIT_MAX` | 1000 / 20 | one hitch event a second, 20 an episode; every hitch is still counted |
| `AVLAG_S` / `AVLAG_HOLD_MS` / `AVLAG_EVERY_MS` | 0.25 / 1000 / 10000 | the gap, how long it must hold, and how often a lasting lag is counted again |
| `GAP_SAMPLE_MS` | 500 | one gap reading kept per this long (30 are kept) |
| `STEADY_MS` | 2000 | the measures start this long after play, seek, hop or resume |
| `RATE_WINDOW_MS` / `RATE_MIN_MS` / `RATE_MIN_FRAMES` | 10000 / 3000 / 10 | the rolling window for decoded, shown and dropped, and what it needs before it reports |
| `SRC_MIN_STEPS` | 24 | steps before the file's frame rate is reported |
| `LOWFPS_RATIO` / `LOWFPS_MS` | 0.6 / 10000 | shown under this share of the file's rate for this long = `lowfps` |
| `LOWSRC_FPS` | 15 | a file under this is a file problem |
| `DECODELAG_SHARE` / `DECODELAG_MS` | 0.1 / 10000 | dropped over this share for this long = `decodelag` |
| `BEHIND_RATIO` | 0.9 | a steady minute with decoded frames a second under this share of the file's rate counts as a minute behind |
| `THROTTLE_MS` / `THROTTLE_EMIT_MAX` | 1000 / 50 | no callbacks this long = a throttled stretch; events an episode |

The per-frame path allocates nothing: counters and rings made once (a rolling window of 64 samples, 240 media-time
steps, 30 gap readings, 8 hitches, 10 throttled stretches). Events are made only when something fires.

### Reading it on the lab (and `soak.json`)

The live readout "Pictures a second" shows `file N / decoded N / shown N, dropped N%`, with BEHIND when decoded is
under 90 percent of the file's rate and THROTTLED while a stretch is going on. Session results gains Presented fps,
File fps, Decoded fps, Dropped, Minutes behind, Hitches, Longest hitch, A/V lag events, Max A/V gap, Out-of-sync presses,
Hidden time and Throttled time (episode averages for the rates, "n/a" where the browser gives no per-frame timing).
Copy all also holds the visibility and throttle logs. **Copy soak.json** copies, for the launch check, the soak of
this page load (reloading the lab starts a new one):

```
{ "at": start of the first episode (ISO), "durationMs": watched time, "longestPauseMs", "stalls", "freezes", "drifts",
  "hitches", "avlags", "maxAvGapMs", "presentedFps", "sourceFps", "outOfSyncPresses",
  "decodedFps", "droppedShare", "minutesBehind", "minutesMeasured", "hiddenMs", "throttledMs", "throttles",
  "throttlesPageWide", "hiddenPeriods": [{ at, ms }], "throttlePeriods": [{ at, episode, ms, pageDrawing }],
  "visibility": [{ state, at, ms }],
  "episodes": [ { id, title, startedAt, watchMs, startupMs, longestPauseMs, stalls, freezes, drifts, hitches, longestHitchMs,
                  avlags, maxAvGapMs, presentedFps, sourceFps, decodedFps, droppedShare, minutesBehind, minutesMeasured,
                  outOfSyncPresses, hiddenMs, throttledMs, throttles, throttlesPageWide, end, source } ] }
```

Counts and times are sums over the episodes, the largest values are maxima, the frame rates and the dropped share are
means weighted by watched time. A value is null when no episode could measure it (a browser without per-frame timing).

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
| the first copy's server lookup failed | `act` `pq:lookup-failed` | none |
| Report on the failure card | `report` | x = `fail:<cause>:<reason> <item>` |
| a lag the viewer could see: picture and sound apart for a second (at most 5 an episode) | `act` `pq:avlag` | n = the gap in ms |
| a hitch (at most 5 an episode) | `act` `pq:hitch` | n = its length in ms |
| shown frames far under the file's rate (once) | `act` `pq:lowfps` | n = shown a second x 10, pos = file rate x 10 |
| the file holds too few pictures (once) | `act` `pq:lowsourcefps` | n = file rate x 10 |
| the browser dropping its frames (once) | `act` `pq:decodelag` | n = dropped share x 1000, pos = decoded a second x 10, dur = file rate x 10 |
| the viewer pressed Out of sync? (at most 3 an episode), and a Sentry message "Viewer saw sound out of sync: <slug>" with the stamp and the diagnostics | `act` `pq:user-avsync` | pos = seconds into the episode, n = file rate x 10, dur = shown a second x 10 |

The Out of sync? Sentry message and the Sentry trouble report only exist where Sentry loads (voidtv.net); the kids build
has no Sentry and its intake keeps only the event name and the show and episode key, so there a press is a count and
nothing else. `vpTrouble` counts any lag, more than 2 hitches, `lowfps`, `lowsourcefps` and `decodelag` like a freeze.
Throttled and hidden stretches are not sent anywhere; they live in the lab.

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

The viewer waits for one lookup only, the first copy's. That copy starts on its primary server as soon as
the answer arrives (before, `load()` waited for every copy's lookup, so one slow call held the picture back
by up to 2.5 s). Copies 2 and up use a lookup that is already in the session cache; otherwise they are
listed with only the Archive's own link, marked lazy, and their servers are looked up the first time the core
moves onto the copy (a decode error, a copy that starves, a slow start): the player drops the source being
left, looks the copy up within the same 2.5 s limit (and the same hour of `sessionStorage` cache), hands the
servers to the core (`core.expand`, which puts them in front of the copy's Archive link and moves onto the
first, the old order: primary, backup, link) and starts on the copy's primary server. A failed or slow lookup
keeps the Archive link and sends `lookup-failed`. The copy is marked done before the wait, so it is looked
up once and never in a loop; a load replaced, a player destroyed, or a core that has moved on while the
lookup runs starts nothing. During the wait the core is told the page is not paused (it is between
sources), so the pause measurement stays whole. If the first copy's lookup fails or times out, the player
starts on the Archive link and sends `lookup-failed` (the page logs it as `pq:lookup-failed`). A `load()` that a newer
`load()` or `destroy()` replaced while it waited says nothing and starts nothing; `destroy()` bumps the
token for exactly that reason (a player destroyed during the lookup once set a source and played on its
detached video). `load()` also ends an unfinished "Up next" countdown, so a reused player cannot skip the
episode that was just chosen. A player that is reused sends the replaced episode's summary as the next one
loads, and not for an episode whose lookup was still pending: the core holds that episode's figures only
once its source list is built.

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

- `node --test player/test/core.test.js`: 90 scenarios: healthy play, short buffering left alone,
  freeze nudged and recovered, repeated freezes escalate to the backup server, drift caught, natural lag
  ignored, long stall ladder, network error retry then switch then fail, decode error switches at once,
  slow start, paused viewer untouched, hidden tab, browsers without frame timing, viewer seeking, Retry,
  no sources, summary maths, starved stalls and server cycling; and since fix batch B: the cause of every
  kind of failure, a lone server reloaded once, the buffer watch (fires on a flat buffer while playing;
  silent while paused, seeking, ended, growing, idle, complete or unmeasured; its clock starts when the
  settle time ends; a backup that needs 5 s to send is left alone; it never ends playback, over four
  separate healed hangs on a pair or two on a lone source; the allowance refills after two minutes) and the
  pause maths across hops, and the servers of a later copy handed to the core when it first moves onto it
  (`core.expand`: in front of the Archive link, only for its own copy, then the copy cycles its servers); and since A-022
  a playback model with real frames (the file's frame step, a display queue, frames shown, dropped or never made,
  switches for hidden, off screen, picture-in-picture, a stopped page, waiting, speed, no callbacks): the file's rate
  from steps of 50/1199 s with two of three frames missing reads 23.98; `lowfps`, `lowsourcefps` (and withheld when the
  browser drops frames), `decodelag` (34 percent fires once, 0.8 percent never), `avlag` (held 1 s, the display delay
  allowed for, nothing done about it), `hitch` (the clock must move, a slow file is not all hitches, events limited),
  minutes behind, "no measure" without per-frame timing, the Out of sync? count, throttled stretches (page drawing or
  not, away marks, a gap no sample saw), and each exclusion (a bad stretch while hidden, off screen, in
  picture-in-picture, not drawing, waiting, at speed 1.5, in the first seconds, after a seek or a resume leaves no mark,
  with a control that fires without the excuse).
- `node --test player/test/player.test.js`: 28 scenarios on the page side (the real `player.js` in a bare
  vm with a fake page, no video, no network): the first source starts on the first copy's lookup alone, a
  cached later copy keeps its servers, a failed lookup is reported once, a destroyed or replaced load says
  nothing and starts nothing, a pending "Up next" ends when an episode loads, the end-of-play summary of a
  reused player is sent once per episode, under that episode, with its own figures; and the lazy lookup of
  a later copy on the first switch to it: a fast answer starts on its primary server, a slow one is given
  up at the time limit, a failed one keeps the Archive link and is never asked twice, a destroyed player or
  a replaced or moved-on load starts nothing, and the core is told the page is not paused meanwhile; and since A-022 the
  Out of sync? button (present in the control row, left out on request, stamps once, twice within 10 s once, changes
  nothing about playback, hides on a narrow player), the frame feed (one callback at a time, the display time and the
  drawing beat passed on, stopped on replace, ended and destroy, started again on play) and what the sample tells the core.
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
