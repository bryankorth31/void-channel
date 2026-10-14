# VOIDtv brand video brief — what to generate, and the specs that make it usable

The June footage (`backend/public/static/void-stream*.mp4`) set the direction: a vintage set in the
dark, channels cycling, before-AI-slop texture. Generate the next set to this brief and every clip
drops straight into the site without editing.

## Rules for every clip

- **16:9, 1920×1080, 24 or 30 fps, H.264 MP4**, plus a **9:16 1080×1920** version of the hero loop
  for phones. Keep each file under 15 MB after export (Pages caps at 25 MB; we re-encode anyway).
- **8–15 seconds, seamless loop** (end frame matches start, or a slow fade through black). The
  site loops them forever; a visible cut is the one thing viewers notice.
- **No text, no logos, no watermark** burned in. Words go on top in the page where they stay
  sharp and editable. Export from a plan that removes the generator's corner mark.
- **Slow.** Camera drift, not moves; motion inside the screen, not around it. These sit *behind*
  rows of posters and a player; anything fast fights the UI.
- **Dark edges.** The frame should fall to near-black at the sides and bottom so the page can
  fade it into `#07080c` and lay text on the lower third.
- **Palette**: the set's glow in cyan `#5fd4ff` and the wordmark's gold; green only as a small
  "signal" cue. Avoid pure white screens (they flash on dark pages).
- **No faces that read as a real person** on the screen within the set (rights, and the uncanny
  problem). Cartoons, test patterns, static, title cards, silhouettes, crowds in grain are fine.

## The clips

1. **Hero loop (home page).** A wall of old sets of mixed sizes in a dark room, each showing
   different grainy footage — a cartoon, a sitcom living room from far away, a western, static,
   a test pattern — flickering out of sync. Slow dolly in or lateral drift. The one that says
   "every channel ever, still on."
2. **Single-set loop (TV page, before Turn on).** One vintage set, close, screen cycling channels
   every 2–3 s with a channel-change blip of static between; knobs and wood grain catch the glow.
   This is the June shot, cleaner and longer.
3. **Static → signal (loading state).** Pure analog static that resolves into a stable picture
   (a test pattern or a cartoon) over 6–8 s, then holds. No text — "Searching the Void for your
   TV" is laid on by the page.
4. **Classic TV door.** Same set language in **black and white**, warmer lamp light, rabbit ears,
   a 1950s living-room edge in frame. Signals the era change the moment you step through.
5. **Late Night door (18+ interstitial).** A set in a dark room, screen glow only, neon sign
   out of focus in the window, slow. Moody, not lurid.
6. **Void University (later).** A set among bookshelves and a chalkboard; the screen shows a
   lecture hall from far away, then a diagram. Same darkness, warmer.
7. **Logo sting (3–4 s, optional).** Static snaps to the wordmark's glow. If generating this is a
   fight, I build it as motion graphics from the wordmark PNG instead.

## Prompt scaffold

"Cinematic, dark room, [subject], analog CRT glow, film grain, slow [drift/dolly], shallow depth
of field, no text, no logos, no people's faces, colour palette cyan and amber on black, seamless
loop, 1080p, 24fps."

Swap the bracketed parts per clip above. Ask for 3–4 variations each and keep the calmest one.

## Delivery

Drop files in `assets/brand/video/` named `hero-16x9.mp4`, `hero-9x16.mp4`, `set.mp4`,
`loading.mp4`, `classic.mp4`, `latenight.mp4`. I re-encode (720p for the page, 480p for phones),
cut the loops clean and wire them in.
