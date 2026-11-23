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
7. **Out of sync?** is a button in the control row that the lab turns on (`syncButton: true`; on the real site it appears with
   `?dbg=1`, and for viewers it is off). Press it when the picture and sound do not match: it stamps that moment and counts
   it, and changes nothing about playback. Viewers get a "Picture out of sync" choice on the failure card instead.

After "Both servers dead", reload the lab page; that test poisons the server cache for the session.

## Pop out

Bryan, 22 Nov 2026: "in the same way id like the playr from vtv to b e treated the same so i can bring it along in the corner
up front as i use the web", "my shows can be playing while i work as a pop". The picture-in-picture button and **P** pop the
picture out into a small window that floats over every other window (`popOut()` in `src/player.js`).

- First choice: the video's own picture-in-picture. Only the moving picture, and the browser keeps the window at the picture's
  shape (Chrome: 380x286 for 4:3, 512x288 for 16:9). It is the same `<video>`, so a channel change, Back to live, the next
  episode and the phone remote all carry on in it.
- With captions showing, or in a Live TV break (no picture to hand over), the whole screen moves instead (`src/popout.js`,
  Document Picture-in-Picture, Chrome and Edge only, https or localhost): captions, the break cards and the control bar on hover.
  Its place on the page keeps a box with Bring it back. Live TV finds a popped-out player through `vpIn()` in
  `scripts/lib/app.js`.
- Measured in Edge 157 with the tab hidden: with sound, the window stayed open and playing for 9 minutes and more. Muted or
  silent, the browser closed it and paused the video within 8 to 43 seconds. So a pop-out left muted does not last behind
  other windows.
- Firefox gives pages no way to ask: the button is hidden there (`vpx-nopop`); Firefox's own button on the video still works.

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
Live TV adds `vpx-tv` (on the root), `vpx-ch` (the two channel buttons in the control row, `data-a="chprev"` and
`data-a="chnext"`) and `vpx-chname` (the channel-name flash); see DESIGN.md, "Live TV: channel buttons".
The one exception is `paused` on the root, which VOIDtv reads on purpose (`.vpx:not(.paused)` pauses the
background effects while a video plays). Keep new classes prefixed. (The Out of sync? button has no class at all: it is found by `data-a="avsync"`.)
