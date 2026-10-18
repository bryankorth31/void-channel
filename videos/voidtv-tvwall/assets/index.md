# assets: voidtv-tvwall

All files are copied from the VOIDtv brand folders. Nothing is fetched from the network, so `asset_needs` is empty and the Source step was skipped.

| Path | From | Size | Used for | Load in render? |
|---|---|---|---|---|
| `fonts/unbounded-latin.woff2` | `assets/brand/fonts/unbounded-latin.woff2` | 50.9 KB, variable 200-900 | The "voidtv.net" wordmark, via `@font-face { font-family: "Unbounded"; src: url(assets/fonts/unbounded-latin.woff2) format("woff2"); font-weight: 200 900; font-display: block; }`, weight 700 | yes |
| `textures/noise.png` | `assets/brand/noise.png` | 160x160 greyscale tile | Film-grain overlay over the whole frame at about 5% (blend `overlay`). Its `background-position` is stepped by a seeded LCG every 2 frames. | yes |
| `textures/static.png` | `assets/brand/static.png` | 320x320 greyscale tile, about 4 px cells | **Fallback only.** Use it for the screen static if the `feTurbulence` static renders too slowly. Step `background-position` with seeded offsets once per frame. | only if needed |
| `ref/wall.jpg` | `assets/brand/bg/wall.jpg` | 1920x1072 | **Reference only.** Shows the look to match: the cabinet colours, the blue and violet static tints, the haze and the neon light. It has a "voidtv.net" sign and another neon sign baked in, so it must never appear in the film. | **no** |

Not used, by decision:

- `brand-kit/marks/mark-neon-proposal.svg` is still only a proposal. This sting is led by the name, so the end lockup is the "voidtv.net" wordmark alone.
- `sign-pink.jpg`, `sign-orange.jpg` and `static-*.jpg` are photo plates that don't fit a procedural wall. The pink sign also uses the reversed colours ("voidtv" in cyan).
