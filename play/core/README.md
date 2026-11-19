# The PLAY core: DOSBox Pure, built by voidtv.net

`play/engine/dosbox-pure.js` and `play/engine/dosbox-pure.wasm` are the DOSBox Pure core, built to WebAssembly on
Bryan Korth's PC with the official Emscripten SDK. voidtv.net serves these two files and nothing else of the game
world: every game comes from the Internet Archive when you press Play.

## What it is

| | |
|---|---|
| Core | DOSBox Pure, the libretro DOS core |
| Licence | GNU GPL version 2 (see [../LICENSE](../LICENSE)) |
| Source | https://github.com/libretro/dosbox-pure |
| Exact commit we built | in [dosbox-pure.txt](dosbox-pure.txt) |
| Changes to DOSBox Pure | none; we build its own files as they are |
| Our side of the build | [host.c](host.c), the host's C half, and [build.sh](build.sh), the build script |
| Compiler | Emscripten SDK, commit in [dosbox-pure.txt](dosbox-pure.txt) |

## Get the source

The GPL lets you have the source of the core we serve. It is all public:

1. DOSBox Pure at the commit we built:
   `git clone https://github.com/libretro/dosbox-pure` then `git checkout <commit from dosbox-pure.txt>`
2. Our host and build script: this folder, `play/core/`, in https://github.com/bryankorth31/void-channel
3. The rest of the player (the page side of the host): `play/src/` in the same repo.

If a link ever stops working, ask through voidtv.net and we will send the source.

## Build it yourself

You need Git, Bash (Git Bash works on Windows) and about 2 GB of disk space.

1. Get Emscripten: `git clone https://github.com/emscripten-core/emsdk`, then in that folder
   `./emsdk install latest` and `./emsdk activate latest`.
2. Get DOSBox Pure at our commit (step 1 above).
3. From the void-channel folder:
   `EMSDK=<your emsdk folder> DBP=<your dosbox-pure folder> bash play/core/build.sh`

The script stops if DOSBox Pure is not at the commit in `dosbox-pure.txt`, so the build always matches what we
serve. It writes `play/engine/dosbox-pure.js` and `play/engine/dosbox-pure.wasm`.

## When the core changes

A new build means a new commit. Update `dosbox-pure.txt` (the commit, and the Emscripten commit if that changed) in
the same change as the new engine files, so the published source always matches the served core.
