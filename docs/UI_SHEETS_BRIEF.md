# VOIDtv UI sheets — prompts for buttons, tabs, cards and icons

The backgrounds set the look: orange-and-teal static, neon on wet brick, old sets in the dark.
The UI must sit *on* that without fighting it — so these sheets are quieter than the backgrounds:
dark glass, thin neon edges, cyan `#5fd4ff` and gold `#f2a93b` as the only two lights, grain
instead of gloss. Generate on a flat background colour I can key out (`#00ff00` green or pure
black as noted), 2K, one sheet per prompt, same style across all of them. Three or four tries each;
keep the calmest set.

## Style line (paste at the start of every prompt)

> VOIDtv interface style: dark smoked glass panels on near-black, hairline neon edges in cyan
> (#5fd4ff) and amber gold (#f2a93b), soft CRT phosphor glow, subtle film grain, flat front-on view,
> no perspective, no text, consistent 2 px stroke weight, crisp edges, product-design sheet laid out
> on a grid with generous spacing, 2K.

## 1. Buttons sheet (background: pure black)

> [style line] A sheet of UI buttons for a streaming site, laid out in rows. Row 1: pill buttons,
> five states left to right — default (dark glass, cyan hairline), hover (edge brightens, faint cyan
> glow), active/pressed (filled cyan, dark inside), disabled (grey hairline, no glow), focused (gold
> ring). Row 2: the same five states for a GOLD primary pill (filled amber gold, dark inside).
> Row 3: ghost buttons (no fill, hairline only) in the same five states. Row 4: round icon buttons
> 44 px in the same states, empty centres (icons added separately). Row 5: a small square toggle
> (on = cyan, off = grey) and a slider knob and track. No labels, no words, empty button faces.

## 2. Tabs and menus sheet (background: pure black)

> [style line] A sheet of navigation pieces: Row 1: a horizontal tab bar with five empty tabs, the
> middle one selected — selected tab has a thin cyan underline that glows and slightly brighter
> glass; others dim. Row 2: the same tab bar in a compact mobile size. Row 3: a dropdown menu
> button (dark glass pill with a small chevron) in closed and open states, and below it an open
> menu panel: dark glass, hairline edge, five empty rows, one row highlighted cyan, soft drop
> shadow. Row 4: filter chips — default, selected (cyan edge + check mark), selected gold variant,
> with an × on the right. Row 5: a bottom sheet handle and a segmented control with three empty
> segments, middle selected.

## 3. Cards and frames sheet (background: #00ff00 green for keying)

> [style line] A sheet of empty media card frames for TV show posters, 2:3 portrait. Frame A: the
> plain card — dark glass, 8 px radius, hairline edge, soft shadow. Frame B: hover state — lifted,
> cyan hairline glow. Frame C: "now playing" — gold hairline with a small gold dot top-left.
> Frame D: an old CRT bezel frame around the poster area, dark plastic, rounded screen corners,
> slight inner shadow, for the Classic TV door. Frame E: a wide 16:9 version of A and B for
> backdrops. Also: three small badges as empty rounded tags (one cyan, one gold, one grey), a
> progress bar track with a cyan fill at 40 %, and a thin "LIVE" style dot with glow. Poster areas
> left empty and flat (#111318).

## 4. Icons sheet (background: pure black; flat, single-weight line icons)

> [style line] A grid of 40 line icons for a TV streaming interface, white strokes 2 px on black,
> 24 px optical size drawn large, rounded caps, consistent weight, no fills except where noted:
> play, pause, stop, next track, previous track, skip forward 10, skip back 10, fullscreen, exit
> fullscreen, volume, mute, captions, search, close ×, chevron left, chevron right, chevron down,
> arrow up, arrow down, back arrow, menu (three lines), filter (funnel), sort, grid view, list
> view, plus, check, heart (donate), thumbs up, thumbs down, flag (report), bookmark/My List,
> history (clock with arrow), television set (old CRT with antenna), live signal dot with rings,
> person silhouette, group of people (cast), film clapper, book (reader), graduation cap
> (university), eye (watching), shuffle, lock (18+). Each icon in its own cell with even spacing,
> no labels.

## 5. Door marks sheet (background: pure black) — optional

> [style line] Five circular emblems 256 px for the doors of VOIDtv: Live TV (a small CRT with a
> glowing screen), Classic TV (a 1950s set with rabbit ears, warmer gold glow), Late Night (a moon
> over a neon window), University (an open book under a desk lamp), Mine (a star in a thin ring).
> Same ring weight, same glow, no text.

## 6. States of the signal (background: pure black) — small loop frames for loading

> [style line] Twelve frames in a row of a round 64 px "signal" indicator: a ring that fills with
> analog static noise and resolves clockwise into a solid cyan ring with a soft glow, for a loading
> animation. Each frame identical in position; only the fill progresses.

## Delivery and how I use them

- Drop the sheets in `assets/brand/sheets/` named `buttons.png`, `tabs.png`, `cards.png`,
  `icons.png`, `doors.png`, `signal.png`. I key the backgrounds, slice them, and (for icons) trace
  to SVG so they stay crisp and recolourable; the site's CSS is already built on the same two
  lights, so the sheets drop in as textures and references rather than a rebuild.
- Generators cheat on consistency across rows; if a sheet comes back with mixed stroke weights,
  regenerate the row rather than the sheet. If text appears anywhere, it was not following the
  prompt — regenerate.
