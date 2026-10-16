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

### What the core watches (sampled every 250 ms, plus every presented frame)

- **Stall:** the playhead stops while playing. Normal buffering is left alone for 6 s.
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
   browser", with Try again, Download, Next episode and Report. Never an endless spinner.

After every action it waits 2.5 s before judging again, and only reports "recovered" after 5 s of clean
playback.

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

- `node --test player/test/core.test.js` — 17 scenarios: healthy play, short buffering left alone,
  freeze nudged and recovered, repeated freezes escalate to the backup server, drift caught, natural lag
  ignored, long stall ladder, network error retry then switch then fail, decode error switches at once,
  slow start, paused viewer untouched, hidden tab, browsers without frame timing, viewer seeking, Retry,
  no sources, summary maths.
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
