#!/usr/bin/env bash
# Builds the DOSBox Pure core into VoidTV PLAY's engine files: play/engine/dosbox-pure.js and .wasm.
# Licence: GPL-2.0-or-later (see play/LICENSE). Anyone can repeat this build from the published sources.
#
#   1. Emscripten (official SDK): git clone https://github.com/emscripten-core/emsdk ; emsdk install latest ; emsdk activate latest
#   2. DOSBox Pure source:        git clone https://github.com/libretro/dosbox-pure ; git checkout <the commit in dosbox-pure.txt>
#   3. EMSDK=<emsdk folder> DBP=<dosbox-pure folder> bash play/core/build.sh
#
# No change is made to DOSBox Pure's own files. Our side is play/core/host.c (the host's C half).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
EMSDK="${EMSDK:-C:/Users/bryan/play-build/emsdk}"
DBP="${DBP:-C:/Users/bryan/play-build/dosbox-pure}"
OUT="$HERE/../engine"
OBJ="${OBJ:-$DBP/build/wasm}"
EMXX="$EMSDK/upstream/emscripten/em++"
[ -x "$EMXX" ] || EMXX="$EMXX.exe"
[ -x "$EMXX" ] || EMXX="$EMSDK/upstream/emscripten/em++.bat"
export EM_CONFIG="$EMSDK/.emscripten"
export PATH="$EMSDK/node/$(ls "$EMSDK/node" | head -1)/bin:$EMSDK/upstream/bin:$PATH"
WANT="$(sed -n 's/^commit: *//p' "$HERE/dosbox-pure.txt")"
HAVE="$(git -C "$DBP" rev-parse HEAD)"
[ "$WANT" = "$HAVE" ] || { echo "DOSBox Pure is at $HAVE but dosbox-pure.txt names $WANT"; exit 1; }

# The flags DOSBox Pure's own Makefile uses for a release build, plus what a browser needs:
# no dynamic recompiler (WebAssembly cannot write and run new machine code), real threads (the core runs the PC on its own thread).
CFLAGS="-DNDEBUG -O2 -std=gnu++11 -fexceptions -Wno-address-of-packed-member -Wno-format -Wno-switch \
  -D__LIBRETRO__ -DDISABLE_DYNAREC=1 -DC_DYNAMIC_X86=0 -DC_DYNREC=0 -D_FILE_OFFSET_BITS=64 -I$DBP/include -pthread -include new"
mkdir -p "$OBJ" "$OUT"
cd "$DBP"
SOURCES=$(ls *.cpp src/*.cpp src/*/*.cpp src/*/*/*.cpp 2>/dev/null)
echo "compiling $(echo "$SOURCES" | wc -l) files"
echo "$SOURCES" | xargs -P "${JOBS:-12}" -I{} bash -c '
  o="$0/$(echo {} | tr / _).o"
  if [ ! -f "$o" ] || [ {} -nt "$o" ]; then "$1" $2 -c {} -o "$o" || { echo "FAILED {}"; exit 255; }; fi' "$OBJ" "$EMXX" "$CFLAGS"
"${EMXX/em++/emcc}" -O2 -I"$DBP/libretro-common/include" -pthread -c "$HERE/host.c" -o "$OBJ/host.o"

# Link: one module that runs inside a Web Worker (play/src/core-worker.js), with a pool of threads made up front
# so the core can start its PC thread without waiting on the page.
"$EMXX" -O2 -pthread -fexceptions "$OBJ"/*.o -o "$OUT/dosbox-pure.js" \
  -sMODULARIZE=1 -sEXPORT_NAME=DosboxPure -sENVIRONMENT=worker \
  -sPTHREAD_POOL_SIZE=3 -sSTACK_SIZE=1048576 -sDEFAULT_PTHREAD_STACK_SIZE=2097152 \
  -sINITIAL_MEMORY=268435456 -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=1073741824 \
  -sEXPORTED_RUNTIME_METHODS=FS,HEAPU8,HEAP16,HEAPU32,stringToUTF8,lengthBytesUTF8 \
  -sEXPORTED_FUNCTIONS=_malloc,_free \
  -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0
ls -la "$OUT"
