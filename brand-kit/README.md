# VOIDtv brand kit

Everything VOIDtv looks like, in one place, for redesigning. Nothing here is wired into the site, HQ or the
beta app yet. They still use `assets/brand/`. Swap files in only when you are happy with a redo.

## What is in the artwork pack

| Folder | What | Notes |
|---|---|---|
| `original/mark` | The current V/T vortex mark (904 px PNG) and the layered sheets it came from | The master is raster only. A redo should end up as a vector file (SVG, AI or PDF). |
| `original/wordmark` | VOIDtv wordmark PNGs (site, @2x, mobile, merch 6000 px) | Set in Unbounded (ExtraBold "VOID" + Medium "tv") |
| `original/backgrounds` | Neon sign, static and wall scenes, desktop and phone crops, plus the source images | Phone crops end in `-m` |
| `original/ui-sheets` | Button, nav and mark sheets used to cut the UI art | |
| `original/textures` | Static, noise and soft-void textures, poster stills, the social card | |
| `original/video` | Logo sting, reel and set loops (MP4) | |
| `original/merch` | Print designs and tracked QR codes | See the merch README |
| `vector-marks` (in the kit: `marks/`) | My vector rebuild of the mark: full, small (favicon), one-colour white and black, HQ tile, beta | Editable SVG starting points: open in Illustrator, Figma, Inkscape or Affinity |
| `icons/ui` | 94 new UI icons (SVG) | 24 px grid, 2 px round stroke, `currentColor` |
| `app-icons` | Every platform size, made from the vector marks | Regenerate after a redo (see below) |
| `fonts` | Unbounded (web font files) | Free, SIL Open Font License. Desktop TTF/OTF: Google Fonts, "Unbounded" |

## Colours

| Name | Hex | Used for |
|---|---|---|
| Void black | `#07080c` | Backgrounds, app-icon fills |
| Ink | `#000000` | Mark disc and outlines |
| Cream | `#e8e8ee` | Text, wordmark "VOID" |
| Cyan | `#5fd4ff` | Wordmark "tv", links, focus, primary buttons |
| Gold | `#f2a93b` | Donate, beta, HQ tile, highlights |
| Mark blue | `#29a3f2` | The V |
| Mark orange | `#f7960f` | The T |
| Mark green | `#2cf01a` | The vortex rings |

## Sizes and where each one goes

**Rule of thumb:** use the *small* mark at 48 px and below. The swirl turns to mud there. Use the *full* mark at 64 px and up.

### VOIDtv site (web and installable app)
| File | Size | Where |
|---|---|---|
| `favicon.svg` | vector | Modern browser tabs (crisp at any zoom) |
| `favicon.ico` | 16, 32, 48 | Older browsers, Windows shortcuts |
| `apple-touch-icon-180.png` | 180 x 180, opaque | iPhone/iPad home screen (iOS rounds the corners itself) |
| `icon-192.png`, `icon-512.png` | 192, 512 | Android home screen, install prompt, splash |
| `icon-maskable-192/512.png` | 192, 512, opaque | Android adaptive icons. The mark sits inside the 80% safe circle. |
| `social-avatar-400.png` | 400 x 400 | Social profile pictures |
| Social share card | 1200 x 630 | Link previews (current: `assets/brand/og.jpg`) |

### HQ (desktop admin app, Windows)
| File | Size | Where |
|---|---|---|
| `hq.ico` | 16, 24, 32, 48, 64, 128, 256 | The .exe, taskbar, Start menu, title bar |
| `hq-256/512/1024.png` | | Installer art, Electron `build/icon.png` |

HQ is a gold tile on purpose, so it never looks like the viewer site in the taskbar.

### Beta testers' app
Same set as the site (`favicon.ico`, `apple-touch-icon-180`, `icon-192/512`, maskable 512). The gold beta badge marks it.

### TV apps (Fire TV / Android TV)
| File | Size | Where |
|---|---|---|
| `android-tv-banner-320x180.png` | 320 x 180 | Android TV launcher banner (must include the name) |
| `fire-tv-1280x720.png` | 1280 x 720 | Fire TV app tile and background |
| `store-icon-512.png` | 512 x 512 | Amazon Appstore / Play Store icon |
| `fire-tv-small-114.png` | 114 x 114 | Fire TV small icon |
| `tv-splash-1920x1080.png` | 1920 x 1080 | Launch screen |

### UI icons
| Size | Use |
|---|---|
| 16 px | Inline with small text (labels, chips, table rows) |
| 20 px | Dense lists, HQ tables, menus |
| 24 px | Default: buttons, the player bar, navigation |
| 32 px | Phone player controls, TV-style menus |
| 48 px | The big play button, TV (10-foot) focus states |

Tap targets stay at least 44 x 44 px even when the icon is smaller. Use outline icons by default and the
`-filled` versions only for "on" states (favourited, on watchlist, rated). Colour comes from the text colour,
so one file works on dark and light.

## Regenerating after a redo

Save your new mark as an SVG with a 512 x 512 viewBox into `brand-kit/marks/`, using the same file name
(`mark-full.svg`, `mark-small.svg`, `hq.svg`, `beta.svg`...), then run:

```
python brand-kit/tools/make_app_icons.py
python brand-kit/tools/make_preview.py
```

Every size in `app-icons` is rebuilt, and `preview.html` shows them all.
