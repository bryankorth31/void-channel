#!/usr/bin/env bash
# Builds ScummVM's libretro core into VoidTV PLAY's engine files: play/engine/scummvm.js and .wasm.
# Licence of this script: GPL-2.0-or-later (play/LICENSE). ScummVM itself: GPL-3.0-or-later (its COPYING).
# Bryan, 20 Nov 2026: CD-ROM kids games through ScummVM, "Yes, build slice 1".
#
#   1. Emscripten (official SDK), as for the other cores: emsdk install 7.0.0 ; emsdk activate 7.0.0
#   2. ScummVM source at the release in scummvm.txt:  git clone --branch v2026.4.0 https://github.com/scummvm/scummvm
#   3. GNU make (any 4.x), Bash, Python 3, Git (ScummVM's libretro build fetches its pinned libraries with git).
#   4. EMSDK=<emsdk> SCUMMVM=<scummvm folder> MAKE=<gnu make> bash play/core/build-scummvm.sh
#
# Only the engines kids games need are built, through ScummVM's own "lite" switch: SCUMM with its Humongous part (HE:
# Putt-Putt, Freddi Fish, Pajama Sam, Spy Fox, Blue's Clues) and Mohawk (Living Books). The lite list is a file in
# ScummVM's tree; this script swaps in ours for the build and puts theirs back after, so ScummVM's files end unchanged.
# Its coroutine library is off for the browser (ScummVM's own emscripten setting), so ScummVM runs on a second thread,
# as DOSBox Pure does. Our side is play/core/host.c, the same host every libretro core in PLAY uses.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
EMSDK="${EMSDK:-C:/Users/bryan/play-build/emsdk}"
SCUMMVM="${SCUMMVM:-C:/Users/bryan/play-build/scummvm}"
MAKE="${MAKE:-C:/Users/bryan/play-build/gnu-make/make-4.4.1/WinRel/gnumake.exe}"
OUT="$HERE/../engine"
E="$EMSDK/upstream/emscripten"
export EM_CONFIG="$EMSDK/.emscripten" EMSCRIPTEN="$E" EMSDK
export PATH="$EMSDK/node/$(ls "$EMSDK/node" | head -1)/bin:$E:$EMSDK/upstream/bin:$PATH"
EXE=""; [ -x "$E/emcc.exe" ] && EXE=".exe"
WANT="$(sed -n 's/^commit: *//p' "$HERE/scummvm.txt")"
HAVE="$(git -C "$SCUMMVM" rev-parse HEAD)"
[ "$WANT" = "$HAVE" ] || { echo "ScummVM is at $HAVE but scummvm.txt names $WANT"; exit 1; }

LR="$SCUMMVM/backends/platform/libretro"
cp "$LR/lite_engines.list" "$LR/lite_engines.list.theirs"
trap 'mv -f "$LR/lite_engines.list.theirs" "$LR/lite_engines.list"' EXIT
printf 'scumm\nhe\nmohawk\n' > "$LR/lite_engines.list"

# -pthread on every compile: ScummVM's thread and the host's share one memory (EMCC_CFLAGS reaches every emcc call).
export EMCC_CFLAGS="-pthread"
cd "$LR"
# Off, through ScummVM's own make switches: MP3 (libmad; its folder holds a plain file named "version" that hides the
# C++ <version> header from the compiler), FluidSynth and MT-32 music, and the debug overlay (imgui). The Humongous
# and Living Books games use none of them.
# LINK_ONLY=1 skips make (its engine setup takes minutes on Windows) and links the library already made.
[ "${LINK_ONLY:-}" = 1 ] || "$MAKE" -j"${JOBS:-12}" platform=emscripten LITE=1 NO_WIP=1 USE_MAD=0 USE_FLUIDSYNTH=0 USE_MT32EMU=0 USE_IMGUI=0 \
  CC="$E/emcc$EXE" CXX="$E/em++$EXE" AR_ALONE="$E/emar$EXE" AR="$E/emar$EXE rcs" RANLIB="$E/emranlib$EXE"
LIB="$LR/scummvm_libretro_emscripten.bc"
[ -f "$LIB" ] || { echo "the ScummVM core library was not made"; exit 1; }

# The host's C half, then one module that runs inside PLAY's Web Worker (play/src/core-worker.js), with threads made
# up front so ScummVM can start its own at once.
OBJ="$LR/playhost"; mkdir -p "$OBJ" "$OUT"
"$E/emcc$EXE" -O2 -pthread -DHOST_VARS_AT_START -I"$LR/deps/libretro-common/include" -c "$HERE/host.c" -o "$OBJ/host.o"
# A statically linked core leaves three small libretro-common helpers to the program around it (ScummVM's own
# dependencies.mk); our host is that program, so they are built here from ScummVM's bundled libretro-common, unchanged.
LC="$LR/deps/libretro-common"
for f in compat/compat_strl.c compat/fopen_utf8.c encodings/encoding_utf.c; do
  "$E/emcc$EXE" -O2 -pthread -I"$LC/include" -c "$LC/$f" -o "$OBJ/$(basename "$f" .c).o"
done
unset EMCC_CFLAGS
# ScummVM's make names its library .bc, but it is an archive of objects; the linker goes by the name, so it links as .a.
cp "$LIB" "$OBJ/libscummvm.a"
"$E/em++$EXE" -O2 -pthread "$OBJ/host.o" "$OBJ/compat_strl.o" "$OBJ/fopen_utf8.o" "$OBJ/encoding_utf.o" "$OBJ/libscummvm.a" -o "$OUT/scummvm.js" \
  -sMODULARIZE=1 -sEXPORT_NAME=PlayCore -sENVIRONMENT=worker \
  -sPTHREAD_POOL_SIZE=4 -sSTACK_SIZE=4194304 -sDEFAULT_PTHREAD_STACK_SIZE=8388608 \
  -sINITIAL_MEMORY=268435456 -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=1073741824 \
  -sEXPORTED_RUNTIME_METHODS=FS,HEAPU8,HEAP16,HEAPU32,stringToUTF8,lengthBytesUTF8 \
  -sEXPORTED_FUNCTIONS=_malloc,_free -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0
printf '/* ScummVM %s (SCUMM with Humongous, and Mohawk for Living Books), its libretro core built unchanged by voidtv.net with Emscripten 7.0.0. Licence: GPL-3.0-or-later. Source: https://github.com/scummvm/scummvm/tree/%s . Our host: play/core/host.c, GPL-2.0-or-later. */\n' \
  "$(sed -n 's/^version: *\([^ ]*\).*/\1/p' "$HERE/scummvm.txt")" "$WANT" | cat - "$OUT/scummvm.js" > "$OUT/scummvm.js.tmp" && mv "$OUT/scummvm.js.tmp" "$OUT/scummvm.js"
cp "$SCUMMVM/COPYING" "$OUT/scummvm.LICENSE.txt"
ls -la "$OUT"/scummvm.*
