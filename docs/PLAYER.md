# The VOIDtv player

B, 2026-10-14: "we had discussed our own player to deal with issues... learn from others before us
with remotes, captions, library we may be able to offer with our own player and a few other useful
options that this being custom would allow. look at open source of course and let me know if this will
be clunky and how to build without the clunk."

## Why

About 940 of the ~36,000 files the builder has picked will not play in a browser: 425 MKV
containers, ~190 x265/HEVC, 218 FLAC audio, ~85 AC3/DTS/Dolby audio, 17 XviD. These are the DVD and
Blu-ray rips, often the only copy of a show. No server on our side by design, so the fix has to run in
the viewer's browser. Since 2026-10-14 those episodes show as "download only" rows; the player makes
them play.

## What the open-source world has (checked 2026-10-14)

**Engine: Mediabunny** (MPL-2.0, v1.61). Pure TypeScript, zero dependencies, tree-shakable. Reads and
writes MP4, Matroska/MKV, WebM, MPEG-TS, Ogg, FLAC, MP3, ADTS and writes segmented MP4 (CMAF), which is
what Media Source Extensions want. Conversion copies streams when it can (transmux, no re-encode),
decodes through WebCodecs when it must, and has `registerDecoder` for custom decoders. First-party
extensions `@mediabunny/ac3` and `@mediabunny/dts` decode AC-3, E-AC-3 and DTS; FLAC and AAC decode
through the browser's WebCodecs. Streaming input over HTTP range requests. This is the whole remux
problem in one library.

**Fallback decoders: libav.js** (FFmpeg in WebAssembly, LGPL) with `libavjs-webcodecs-polyfill`.
Custom variants can be built with only chosen decoders (an empty build is ~180 KB; full ones 1.5 to
3 MB). Only needed if Mediabunny's extensions miss something; XviD (MPEG-4 ASP) would need a video
decoder in wasm, which is slow, and it is 17 files, so XviD stays download-only.

**UI shell.** The field is consolidating: Mux's January 2026 post says Vidstack, Media Chrome and
Plyr are merging into Video.js v10 (modular, framework-native, skin-your-own), still alpha. Media
Chrome (MIT, web components, wraps a plain `<video>`) is the HTML-first option available today;
Video.js 8 is the mature one with the strongest documented captions and ARIA history but heavy.
Decision: **no shell.** Our UI is small and ours (play, seek, volume, captions, speed, next, X-Ray,
share) and the TV remote work needs focus control none of them do. We keep the native `<video>`
element as the engine, drive it with MSE when a file needs remuxing, and draw our own controls.

**Remotes: Norigin Spatial Navigation core** (MIT, framework-agnostic, 190 KB unpacked, in use on
Tizen, webOS, VIDAA, Vizio, Titan). Directional focus from element positions; no hand-wiring. The
same library runs the whole site in TV mode, not just the player.

**Captions.** Three layers, in order: (1) subtitle files already inside the Archive upload (.srt/.vtt
sit next to the video in many items; the hunter can list them), (2) OpenSubtitles REST API (free
developer key; community reports of 5 to 200 downloads per day per key depending on login, so cache
hard and fetch on demand only), with SubSource's public API as a second source, (3) browser speech
recognition later (Whisper in the browser via transformers.js) for the many 90s uploads nobody
subtitled. Rendering is ours: WebVTT through the `<track>` element, SRT converted on the fly, sized
for a TV at ten feet.

## The design, and why it will not be clunky

Clunk comes from three places: loading a 500 KB player framework before the first frame, re-encoding
video in JavaScript, and fighting a framework's focus model with a remote. We avoid all three.

1. **Native first.** An MP4 with H.264 and AAC plays exactly as today: `<video src>`, zero extra code
   on the path. The player only becomes a remuxer when the file needs it.
2. **Decide before downloading.** The builder already knows each file's container and codecs. The
   page asks `MediaSource.isTypeSupported` and `MediaCapabilities` on the viewer's device and picks a
   path: direct, remux (MKV with H.264/AAC: copy both streams into CMAF segments), remux plus audio
   decode (AC-3/DTS/FLAC decoded to PCM then encoded to AAC or fed as raw audio), or download-only.
   HEVC plays where the device decodes it (Edge and Chrome on most Windows PCs, Macs, Fire Sticks).
3. **Streaming pipeline in a worker.** Range-fetch the file in 2 to 4 MB windows, demux, package
   segments, post them to the main thread, append to the SourceBuffer. Playback starts after the first
   segment, seeking re-anchors the window from the Matroska cue index. Memory stays flat.
4. **Load on demand.** Mediabunny (tree-shaken, tens of KB for the Matroska reader plus the MP4
   writer) and the AC3/DTS extensions load only when a file needs them. The home page never pays.
5. **One focus system.** Spatial navigation drives every control, including the episode list and
   X-Ray, so the remote experience is designed, not retrofitted.

## What custom buys, beyond playing the rips

- Resume on every device, next-episode countdown with the chip to cancel, skip 10/30, speed 0.75-2x.
- Captions with font, size and background set for the room; a captions library per episode.
- X-Ray inside the player (who is in this scene, from the credits), share-this-moment, chapters when
  the file carries them, audio track choice when the file has more than one.
- Live TV surfing with up/down, an on-screen guide, and the "always on" feeling.
- Picture-in-picture, theatre mode, a sleep timer, keyboard shortcuts on a help overlay.
- Playback telemetry we already collect (play, tick, end, error) now tells us which path each file
  took, so the builder learns which copies really play.

## Build order

1. Player skeleton: our controls over the native video, keyboard and spatial-nav focus, captions
   from `<track>`, resume and next. Replaces the stock player everywhere. (Also the base of TV mode.)
2. Remux path: MKV with H.264/AAC through Mediabunny to MSE in a worker. Flip those 425 files.
3. Audio decode path: AC-3/E-AC-3/DTS via the Mediabunny extensions, FLAC via WebCodecs. Flip the
   next ~300.
4. HEVC pass-through where supported; honest message where not.
5. Captions library: Archive-side subtitle files first, then OpenSubtitles with caching.
6. Telemetry feedback into the builder: "played / failed on device X" per file.

Hard rules kept: nothing transcodes on a server, nothing of ours touches the video bytes except in
the viewer's own browser, and every file still streams from archive.org.
