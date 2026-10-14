# Later

B's divergences, parked on purpose. The build order stays: hunt -> site -> control room -> nightly -> swap.
When a step lands, pull the next idea from here. Nothing in this file is forgotten; nothing in it
jumps the queue.

## Pull when the site (step 2) starts
- **The TV world.** Channels = the networks shows aired on, always playing on a computed schedule,
  surf with channel up/down and a guide, static between stations, change the episode when a show
  is on and the channel remembers your pick and position per channel per show. Proposed as the
  home page, with the library one click behind it. (2026-10-13)
- **Smart video player.** In-browser remux of .mkv, AC3/DTS audio decoded on the viewer's machine,
  HEVC via device hardware. For the classics that exist only in formats browsers will not play.
  Never a server. (2026-10-13, after SG-1 played silent)
- **Explore by Genre grid** below the rows; Trending / Popular / Top Rated tabs ranked over OUR
  catalog so they mean "best that actually plays". (2026-10-13)
- **X-Ray, trivia and connections.** PULLED FORWARD by B on 2026-10-13 ("it fits the brand"): people
  layer and the library-restricted connections graph are being built now (scripts/people.js); the
  pop-up from the player and the show-page explorer follow. Original note kept below.
  Factual X-Ray from TVmaze/TMDB per-episode credits
  (cast and guest stars with headshots, characters, writer, director, air date) shown in a player
  tab; trivia distilled by Claude from Wikipedia episode/show articles with a source line under
  each item, cached in the builder. No invented facts, no scene-level X-Ray until we can read the
  video. (2026-10-13)
- **Sharing and social (B's couch-view research, 2026-10-13).** In order of cheapness:
  (1) share links that carry the moment: `/s/<show>/s4e11?t=12m40s` with a poster card and
  episode title; (2) a clip button: in/out points become a link that plays only that span (no
  file made, nothing hosted), later an in-browser export for shorts; (3) watch together: room
  link, synced play, chat strip; (4) "pick for me" and "put something on" (one card, shuffle,
  what's-on-now) for the seven-minute-scroll problem; (5) shareable lists ("my 90s starter pack");
  (6) a "Not streaming anywhere else" shelf; (7) spoiler-safe cards by default.
- **The connoisseur (B 2026-10-13: "a small model... a movie/show connoisseur and expert").**
  (1) Builder pass: per-show expert notes written once from our own metadata (why-this, next-three
  on VoidTV, mood tags, best starting episode, primer for obscure shows), static, style set by B;
  (2) live "ask the curator" via a tiny Cloudflare Worker that retrieves catalog rows and only
  recommends what plays here (key stays server-side); (3) an optional in-browser small model for
  privacy, later. The voice is the site's voice.
- **One sourcing line** in the footer (Internet Archive + the TMDB credit), never per card. (2026-10-13)

## Pull after the site is live
- **Interactive episodes.** Choose-your-own-adventure stories generated in the builder from each
  show's metadata (premise, episode synopses, characters, stills), shipped as small story files,
  played inline on a channel, choices remembered. Presented as fan fiction. Prove on one show B
  picks. (2026-10-13)
- **READ mode.** B has prior work on a smart reader for books and comics. Reuse the player shell;
  ask to see his work before building. (2026-10-13)
- **PLAY mode.** Rework the Archive's games with current tech: emulator cores in WebAssembly,
  gamepad and touch, save states, upscaling, couch mode. (2026-10-13)
- **Godot "TV room".** An optional immersive mode (a den with a set, a wall of TVs) drawn over the
  same HTML video. Godot for this and the games, never for the site itself. (2026-10-13)
- **Second TV-movie pass** with hand-made episode lists where TVmaze has none (NTSF, Eltingville)
  and search hints for generic names (Martin, ER, Lost, Oz, Review, Legit, Autopsy).
- **Name collisions** needing per-show search/TVmaze overrides: The Office (UK), Shameless (UK),
  CBC's The Newsroom, AU Wilfred and Review. Also Password (list says CBS 1961; TVmaze matched the
  2022 NBC revival) and the 1980 Shōgun / 1981 Borgias, held out of the Historical collection for this.
  TMDB-side too: "The Clone" (the Brazilian novela) got Star Wars: The Clone Wars' record, so George
  Lucas shows up as its creator in X-Ray; art.js needs a year/network check, not just a title search.
- **TV apps: Fire Stick and Roku (B 2026-10-13).** The static catalog makes this cheap: every client
  reads the same data/index.js + per-show JSON and plays the same archive.org MP4 URLs. Order: (1) a
  TV mode of the web app (D-pad focus, bigger cards, no hover) so Fire TV's Silk browser works today;
  (2) a sideloadable Android TV APK (WebView wrapper) for Fire Stick; (3) a small Roku SceneGraph
  channel reading the same JSON (Roku has no browser; sideload in developer mode per device, since
  Roku ended public non-certified channels and store certification would fail on content grounds).
- **Void University (B 2026-10-13: "YouTube university, IRC and the Archive's books were a huge part
  of my life").** A courses section fed by KNOWN bodies rather than fuzzy hunting: UC Berkeley's
  ~20,000 webcast lectures (pulled from YouTube in 2017, preserved on the Archive), MIT OpenCourseWare
  and Yale Open Courses (CC BY-NC-SA, structured course lists to match against), Khan Academy,
  Computer Chronicles / Net Cafe (Archive collections), The Great Courses uploads (whatever the Archive
  has), YouTube-university channels mirrored as youtube-* items (3Blue1Brown, Computerphile, Crash
  Course...), plus LibriVox / Open Library / Project Gutenberg for the reader. Shape: course ->
  lectures, same player, same X-Ray (lecturer -> other courses). Collection-scoped Archive queries
  are precise, so this hunt is easier than TV. IRC-style study hall is the social piece, later.

## Not VoidTV, but B wants them kept
- **Godot / Althalus game.** Godot 4.7.2 is installed; first project not yet created (needs a folder).
- **Jaynes and CASH doctrine.** B's reading of consciousness; read the doctrine files when he points at them.
