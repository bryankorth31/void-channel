// VoidTV PLAY: a big game's zip read in pieces, one file at a time. Licence: GPL-2.0-or-later (play/LICENSE).
// Plan T21; Bryan, 20 Nov 2026: "Build it".
// The voidtv.net pass-through (functions/api/piece.js) hands out 8 MB pieces of an Archive zip. This reads the zip's
// table of contents from its end, then unpacks a file only when the game first opens it, so a game made of many files
// starts once the few it needs have arrived (Master of Orion II's 425 files, Tomb Raider's films). A game built on one
// big file gains nothing, and keeps the plain download. Everything here is synchronous: the engine's file reads must
// be answered at once, so pieces come by synchronous requests (allowed in a worker) and inflate.js unpacks.
(function (root) {
  'use strict';
  const PIECE = 8 * 1024 * 1024;
  const KEEP = 4;                              // recent pieces kept, so neighbouring files cost no second request
  const HELD = 256 * 1024 * 1024;              // unpacked bytes held at once, the same limit as a whole download
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  // size: the zip's length; getPiece(n): piece n's bytes, synchronously. deps: { entries, safe, inflateRaw }.
  function open(size, getPiece, deps) {
    const cache = new Map();
    function piece(n) {
      if (cache.has(n)) { const v = cache.get(n); cache.delete(n); cache.set(n, v); return v; }
      const v = getPiece(n);
      if (!v || v.length !== Math.min(PIECE, size - n * PIECE)) throw new Error('A piece of the game came back the wrong size');
      cache.set(n, v);
      while (cache.size > KEEP) cache.delete(cache.keys().next().value);
      return v;
    }
    function range(a, b) {
      if (a < 0 || b > size || a > b) throw new Error('The game zip is damaged (it points outside itself)');
      const out = new Uint8Array(b - a);
      for (let at = a; at < b;) {
        const n = Math.floor(at / PIECE), p = piece(n), off = at - n * PIECE, take = Math.min(p.length - off, b - at);
        out.set(p.subarray(off, off + take), at - a); at += take;
      }
      return out;
    }
    // The table of contents: its place is in the end record (or the ZIP64 one); read from there to the end.
    const tailFrom = Math.max(0, size - 65557 - 20);
    const tail = range(tailFrom, size);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('This file is not a zip');
    let cd = u32(tail, end + 16);
    if (cd === 0xffffffff && end >= 20 && u32(tail, end - 20) === 0x07064b50) {
      const z = u32(tail, end - 20 + 8) + u32(tail, end - 20 + 12) * 4294967296;
      const rec = range(z, z + 56);
      cd = u32(rec, 48) + u32(rec, 52) * 4294967296;
    }
    const list = deps.entries(range(cd, size), { base: cd, maxBytes: 4 * 1024 * 1024 * 1024 });
    let held = 0;
    function read(e) {
      const h = range(e.local, e.local + 30);
      if (u32(h, 0) !== 0x04034b50) throw new Error('The game zip is damaged (' + e.name + ')');
      const at = e.local + 30 + u16(h, 26) + u16(h, 28);
      if (held + e.usize > HELD) throw new Error('This game has opened more than ' + HELD / 1048576 + ' MB of files, more than PLAY can hold in a browser yet');
      const raw = range(at, at + e.size);
      let out;
      if (e.method === 0) out = raw;
      else if (e.method === 8) out = deps.inflateRaw(raw, e.usize);
      else throw new Error('This zip packs ' + e.name + ' in a way we do not read yet');
      held += out.length;
      return out;
    }
    return { entries: list, read, held: () => held, pieces: () => [...cache.keys()] };
  }

  // Each file of the zip becomes a file in the engine's memory disk that unpacks itself the first time it is read.
  // Emscripten's memory files go through node.contents and node.usedBytes only, so those two are all a stand-in needs
  // (Emscripten's own lazy files do the same). A file the game writes to is loaded first, then behaves as usual.
  function mount(FS, zip, dir, deps, onLoad) {
    const files = [];
    for (const e of zip.entries) {
      const rel = deps.safe(e.name);
      if (!rel || e.dir) continue;
      const full = dir + '/' + rel, parent = full.slice(0, full.lastIndexOf('/'));
      FS.mkdirTree(parent);
      const node = FS.createFile(parent, full.slice(parent.length + 1), null, true, true);
      let data = null, used = e.usize;
      Object.defineProperties(node, {
        contents: { configurable: true, get() { if (!data) { data = zip.read(e); used = data.length; if (onLoad) onLoad(rel, data.length); } return data; }, set(v) { data = v; } },
        usedBytes: { configurable: true, get() { return used; }, set(v) { used = v; } },
      });
      files.push(full);
    }
    return files;
  }

  const api = { open, mount, PIECE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayLazyZip = api;
})(typeof self !== 'undefined' ? self : this);
