# VOID player

The new video player, built apart from VOIDtv. It finds and fixes the playback situations that ruin
watching (frozen picture, picture behind the sound, stalls, dead files and servers), and tells you every
time it does. See `DESIGN.md` for how and why.

## Try it

Double-click **`player\LAB.cmd`**. It starts a small local server and opens the lab in your browser:

1. Pick an episode on the left. It plays in the new player.
2. **Live** shows what the player sees: which copy and which Archive server, buffer, dropped frames,
   stalls, freezes, drifts, fixes, switches, and the pictures a second (file / decoded / shown, dropped share,
   with BEHIND and THROTTLED flags), hitches, A/V lag, hidden and throttled time.
3. **Decisions and events** lists every decision as it happens.
4. **Try to break it** provokes failures on purpose so you can watch each recovery work.
5. **Soak test** plays the list back to back. Leave it running on the TV PC to catch real freezes.
6. **Session results** keeps a row per episode. **Copy all** puts them (and the hidden and throttled logs) on the
   clipboard to send me or compare between devices. **Copy soak.json** copies this soak's totals and a row per
   episode for the launch check. **Copy diagnostics** captures one moment in detail.
7. **Out of sync?** is a button in the player's control row (shown when the player is 720 px wide or more). Press it
   when the picture and sound do not match: it stamps that moment and counts it, and changes nothing about playback.

After "Both servers dead", reload the lab page; that test poisons the server cache for the session.

## Commands

```
node --test "player/test/*.test.js"             run the core and page-side scenarios (no browser, no network)
node player/tools/rank-sources.js --lab        rebuild the lab's episode sample from the catalog
node player/tools/rank-sources.js --stats      how the ranking would change the live catalog
node player/tools/build-icons.js               refresh icons after editing brand-kit/icons/ui
```

VOIDtv bundles `src/` into `assets/player/voidplayer.js` at build time (`scripts/site.js`).

## Class names

Every class the player puts on the page starts with `vpx-` (states too: `vpx-show`, `vpx-wait`, `vpx-fs`,
`vpx-recovering`, `vpx-on`...), so the host page's CSS can't reach inside. Short names leaked once:
VOIDtv's decorative `.fs` rule put a dark radial vignette on the fullscreen video (17 Oct 2026).
The one exception is `paused` on the root, which VOIDtv reads on purpose (`.vpx:not(.paused)` pauses the
background effects while a video plays). Keep new classes prefixed. (The Out of sync? button has no class at all: it is found by `data-a="avsync"`.)
