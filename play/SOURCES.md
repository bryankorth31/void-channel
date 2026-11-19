# PLAY: what we studied and what we wrote

VoidTV PLAY is VoidTV's own code. We studied how other projects solve the same problems, then wrote our own.
No code was copied from anything on the "studied" list. This file keeps the record (plan T11, 19 Nov 2026).

## Licence of PLAY

Everything in `play/` that we wrote is under the GNU General Public License, version 2 or (at your option) any
later version. The full text is in [LICENSE](LICENSE). The player page loads our code and the DOSBox Pure core into
one page and calls the core directly every frame, so we treat the player as one GPL work and publish all of it.
The games are not part of it: each one is fetched from the Internet Archive when you press Play and is never kept
or served by voidtv.net.

## Built in (part of what voidtv.net serves)

| Part | What it is | Licence | Source |
|---|---|---|---|
| DOSBox Pure | the DOS PC core, built to WebAssembly by us, unchanged | GPL-2.0 | https://github.com/libretro/dosbox-pure (the exact commit is in [core/dosbox-pure.txt](core/dosbox-pure.txt)) |
| libretro.h | the libretro core contract, read by our host (`core/host.c`) | MIT | https://github.com/libretro/libretro-common (inside DOSBox Pure's source) |
| Emscripten | the compiler that builds the core and adds its small runtime to `engine/dosbox-pure.js` | MIT or University of Illinois/NCSA | https://github.com/emscripten-core/emscripten |

How to rebuild the core yourself: [core/README.md](core/README.md).

## Our own work it grows from

| Part | What we took |
|---|---|
| Couch Craft (Bryan Korth's own couch co-op system: `libretro_host.py`, `input_hub.py`, `library.py`) | the layers (card, input hub, runner), the core contract, and the rule that a game never sees a raw controller, translated from Python to the browser |
| VoidTV (this repo) | the look, the donation setting, the takedown page, and the rule that content plays straight from the Internet Archive |

## Studied, no code taken

| Project | Licence | Link | What we learned from it |
|---|---|---|---|
| EmulatorJS | GPL-3.0 | https://github.com/EmulatorJS/EmulatorJS | libretro cores in a browser page with an on-screen pad; how a page hands a core its game |
| js-dos | GPL-2.0 | https://github.com/caiiiycuk/js-dos | DOS in a browser: which keys a DOS game needs on touch, and a keyboard that pops up only to type |
| RetroArch touch overlays | RetroArch GPL-3.0; overlay art CC-BY-4.0 | https://github.com/libretro/RetroArch, https://github.com/libretro/common-overlays | controls as zones at the screen edges, thumbs in the corners |
| nipplejs | MIT | https://github.com/yoannmoinet/nipplejs | a direction pad you can slide across without lifting your thumb |
| Emularity and the Archive's emulator engines | GPL-3.0 | https://github.com/db48x/emularity, archive.org item `emularity_engine_v1` | how the Internet Archive runs its own emulators in a page; tested in our findings (audit/play-mode, 19 Nov 2026) |
| d2-web | AGPL-3.0 | https://github.com/Virtastic/d2-web | a plain "can't run here" screen that names the cause, game files read in pieces on demand, phone fullscreen and wake lock, a second gamepad bank on a held trigger |
| Halcyon Video | GPL-3.0 | https://github.com/halcyon-video/halcyon-video | a shelf of boxes shaped per system, TV remote handling (Back pauses instead of leaving), who owns the keyboard when a text box is open |
| Awesome Decomp Games | list CC0, scripts MIT | https://github.com/submitgame/awesome-decomp-games | how rebuilt games reach a browser tab; a daily check that drops dead links |

Studying a GPL or AGPL project means reading how it works. Writing our own code from that understanding is not
copying, and nothing above is pasted, translated line by line, or bundled into PLAY.
