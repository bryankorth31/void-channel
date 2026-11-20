# PLAY: what we studied and what we wrote

VoidTV PLAY is VoidTV's own code. We studied how other projects solve the same problems, then wrote our own.
No code was copied from anything on the "studied" list. This file keeps the record (plan T11, 19 Nov 2026).

## Licence of PLAY

Everything in `play/` that we wrote stays under the GNU General Public License, version 2 or (at your option) any
later version. The full text is in [LICENSE](LICENSE). The games are not part of it: each one is fetched from the
Internet Archive when you press Play and is never kept or served by voidtv.net.

The emulator cores are not ours. Each core is a separate program under its own licence, which it keeps: we serve it
unchanged, built from its published source, with a link to the exact commit we built. A game page runs one core.

- DOSBox Pure, FCEUmm, Gambatte and Stella 2014 are under the GPL, version 2. A page with one of these loads our code
  and the core together and calls the core every frame, so we treat that page as one GPL work and publish all of it.
- Genesis Plus GX and Snes9x are not GPL. Their own licences let anyone copy and share them free of charge, never
  for sale or for commercial use, as long as their copyright notice and terms travel with every copy. They are
  served under those terms, not under the GPL, and nothing in PLAY changes them.
- mGBA (Mozilla Public License 2.0) and Handy (zlib licence) are open licences that allow any use, sharing included,
  and sit beside GPL code without trouble. We serve each with its licence beside it and a link to its exact source, as
  the MPL asks. Both run games without a console start-up chip (BIOS), so none is served.
- MAME (arcade) is under the GPL, version 2, as a whole. A page with an arcade game loads our code and MAME together,
  so we treat it as one GPL work, like the GPL cores above. Its games carry no CASH donation line: Bryan's choice
  ("no line . current mame", then "No line", 20 Nov 2026), not something its licence asks.

## Built in (part of what voidtv.net serves)

| Part | What it is | Licence | Source |
|---|---|---|---|
| DOSBox Pure | the DOS PC core | GPL-2.0 | https://github.com/libretro/dosbox-pure |
| Genesis Plus GX | the Sega Genesis, Master System and Game Gear core | its own licence: free, non-commercial only (not GPL); parts under LGPL-2.1+, CC0, zlib | https://github.com/libretro/Genesis-Plus-GX |
| Snes9x | the Super Nintendo core | its own licence: free, non-commercial only (not GPL); parts under LGPL-2.1+ | https://github.com/libretro/snes9x |
| FCEUmm | the Nintendo (NES) core | GPL-2.0 | https://github.com/libretro/libretro-fceumm |
| Gambatte | the Game Boy and Game Boy Color core | GPL-2.0 | https://github.com/libretro/gambatte-libretro |
| Stella 2014 | the Atari 2600 core | GPL-2.0 | https://github.com/libretro/stella2014-libretro |
| mGBA | the Game Boy Advance core | MPL-2.0 | https://github.com/libretro/mgba |
| Handy | the Atari Lynx core | zlib | https://github.com/libretro/libretro-handy |
| MAME | the arcade engine, MAME's own web build, one per machine family | GPL-2.0 (single files BSD-3-Clause and other GPL-compatible licences) | https://github.com/mamedev/mame |
| SDL 3 | the display, sound and input library inside the MAME web build, fetched by Emscripten | zlib | https://github.com/libsdl-org/SDL |
| libretro.h and libretro common code | the core contract our host (`core/host.c`) speaks, and small helpers inside each core | MIT | https://github.com/libretro/libretro-common (inside each core's source) |
| Emscripten | the compiler that builds each core and adds its small runtime to `engine/<core>.js` | MIT or University of Illinois/NCSA | https://github.com/emscripten-core/emscripten |

The exact commit of each core, its licence file and how to rebuild it yourself: [core/README.md](core/README.md).

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
