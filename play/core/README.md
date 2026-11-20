# The PLAY cores: emulators built by voidtv.net

`play/engine/` holds the emulator cores, each built to WebAssembly on Bryan Korth's PC with the official Emscripten
SDK. voidtv.net serves these files and nothing else of the game world: every game comes from the Internet Archive
when you press Play. Each core is built from its own published source, unchanged. A game page runs one core.

## The cores

| Core | Plays | Licence | Source | Exact commit we built |
|---|---|---|---|---|
| DOSBox Pure | DOS PCs | GNU GPL version 2 | https://github.com/libretro/dosbox-pure | in [dosbox-pure.txt](dosbox-pure.txt) |
| Genesis Plus GX | Sega Genesis, Master System, Game Gear | Genesis Plus GX licence: free, not for sale or commercial use (not GPL); some parts under their own free licences | https://github.com/libretro/Genesis-Plus-GX | `b9c2316441978d4015ba30e9a95d9b0e6f8ee981` |
| Snes9x | Super Nintendo | Snes9x licence: free for non-commercial use (not GPL); some parts under their own free licences | https://github.com/libretro/snes9x | `204ea1c0b851f960cbf223075eb1c25641cb483c` |
| FCEUmm | Nintendo (NES) | GNU GPL version 2 | https://github.com/libretro/libretro-fceumm | `77468e568d9fe9c48d684ca911f1a3fe7259fdf7` |
| Gambatte | Game Boy, Game Boy Color | GNU GPL version 2 | https://github.com/libretro/gambatte-libretro | `77f2567d718b8973d02caa2daa8dce4953faf811` |
| Stella 2014 | Atari 2600 | GNU GPL version 2 | https://github.com/libretro/stella2014-libretro | `7d1361e407e63f29e52892655069e5fb4096e691` |

The commits for the last five also live in [cores.js](cores.js), which is the one place the build reads them from.
Every core was built with Emscripten 7.0.0 (emcc `777e6e5db7b4990bcaeb1b9998ed642cc84e6629`), installed by the
Emscripten SDK at commit `708dcbcc9ee23bc7d2dad44fc90db377e38b771c`.

Each engine file, `play/engine/<core>.js`, opens with a one-line notice naming the core, its licence and its exact
source. The build scripts write that line, so every served copy says what it is and where its source is.

Each core's full licence is in its own source, at the commit above (`LICENSE.txt` for Genesis Plus GX, `LICENSE` for
Snes9x, `Copying` for FCEUmm, `COPYING` for Gambatte, `stella/license.txt` for Stella 2014, `LICENSE` for DOSBox
Pure). The two non-GPL licences ask for their notice to travel with every copy, so each also sits unchanged beside
its engine: [genesis-plus-gx.LICENSE.txt](../engine/genesis-plus-gx.LICENSE.txt) and
[snes9x.LICENSE.txt](../engine/snes9x.LICENSE.txt). Parts inside the two non-GPL cores keep their own terms, listed in
those files: for example the Nuked OPN2
sound chip and Shay Green's sound and video filters (GNU LGPL 2.1 or later), minimp3 (CC0), zlib (zlib licence) and
the libretro common code (MIT).

## Get the source

All of it is public, and you are welcome to it:

1. A core at the commit we built: `git clone <its source>` then `git checkout <its commit>`.
2. Our host and the build scripts: this folder, `play/core/`, in https://github.com/bryankorth31/void-channel
3. The rest of the player (the page side of the host): `play/src/` in the same repo.

If a link ever stops working, ask through voidtv.net and we will send the source.

## Build them yourself

You need Git, Node.js and about 2 GB of disk space (Bash too, for DOSBox Pure; Git Bash works on Windows).

1. Get Emscripten: `git clone https://github.com/emscripten-core/emsdk`, then in that folder
   `./emsdk install 7.0.0` and `./emsdk activate 7.0.0` (the version we built with).
2. Get the core's source at our commit (step 1 above).
3. From the void-channel folder:
   - DOSBox Pure: `EMSDK=<your emsdk folder> DBP=<your dosbox-pure folder> bash play/core/build.sh`
   - Any other core: `EMSDK=<your emsdk folder> SRC=<the core's folder> node play/core/build-core.js <name>`,
     where `<name>` is one of `genesis-plus-gx`, `snes9x`, `fceumm`, `gambatte`, `stella2014`.

`build-core.js` reads the core's recipe from [cores.js](cores.js): the same files and settings as the core's own
release Makefile, with no `make` needed. Both scripts stop if the source is not at the commit we name, so a build
always matches what we serve. They write `play/engine/<name>.js` and `play/engine/<name>.wasm`.

Our side of every build is [host.c](host.c), the host's C half, which answers the core's questions through the
libretro contract (`libretro.h`, MIT licence, from the core's own source).

## When a core changes

A new build means a new commit. Change the commit (in `cores.js`, or `dosbox-pure.txt` for DOSBox Pure) in the same
change as the new engine files, so the published source always matches the served core.
