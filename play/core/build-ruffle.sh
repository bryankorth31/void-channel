#!/usr/bin/env bash
# VoidTV PLAY: build Ruffle (the Flash engine) from its own source and place it in play/engine/ruffle/.
# Licence of this script: GPL-2.0-or-later (play/LICENSE). Ruffle itself: MIT or Apache-2.0 (its LICENSE.md).
#   RUFFLE=<your ruffle folder> bash play/core/build-ruffle.sh
# Needs: Rust (stable, with the wasm32-unknown-unknown target), wasm-bindgen-cli at the version Ruffle's Cargo.toml
# pins (0.2.127 for our commit), Java (Ruffle builds its ActionScript 3 library with it), Node.js 24, and Binaryen's
# wasm-opt on the PATH (the Emscripten SDK has one in upstream/bin). On Windows, use Rust's MSVC toolchain
# (RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc): the GNU one lacks dlltool. The exact record is play/core/ruffle.txt.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../engine/ruffle"
COMMIT="$(sed -n 's/^commit: //p' "$HERE/ruffle.txt")"
: "${RUFFLE:?set RUFFLE to your ruffle source folder}"
HAVE="$(git -C "$RUFFLE" rev-parse HEAD)"
if [ "$HAVE" != "$COMMIT" ]; then echo "Ruffle is at $HAVE, not $COMMIT (play/core/ruffle.txt). git checkout $COMMIT first." >&2; exit 1; fi
if [ "${SKIP_BUILD:-}" != 1 ]; then
  (cd "$RUFFLE/web" && npm ci --no-audit --no-fund && npm run build --workspace=ruffle-core && npm run build --workspace=ruffle-selfhosted)
fi
DIST="$RUFFLE/web/packages/selfhosted/dist"
rm -rf "$OUT" && mkdir -p "$OUT"
# The one-line notice every PLAY engine opens with, then Ruffle's own script unchanged.
{ printf '/* Ruffle 0.8.0 (Flash Player emulator), MIT or Apache-2.0, source: https://github.com/ruffle-rs/ruffle/tree/%s (built by VoidTV PLAY, play/core/ruffle.txt) */\n' "$COMMIT"; cat "$DIST/ruffle.js"; } > "$OUT/ruffle.js"
cp "$DIST"/ruffle_web_bg.*.wasm "$OUT/"
cp "$RUFFLE/LICENSE.md" "$OUT/LICENSE.md"
ls -la "$OUT"
