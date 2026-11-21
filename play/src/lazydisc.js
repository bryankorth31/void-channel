// VoidTV PLAY: a CD-ROM game's disc read in pieces, only the bytes the game asks for. Licence: GPL-2.0-or-later
// (play/LICENSE). Bryan, 20 Nov 2026: CD-ROM kids games through ScummVM, "Yes, build slice 1".
// The Internet Archive keeps these games as whole disc images (Putt-Putt Saves the Zoo is one 628 MB ISO), but a game
// reads only parts of a few files. The voidtv.net pass-through (functions/api/piece.js) hands out 8 MB pieces of the
// image; this reads the disc's own table of files (ISO 9660, with Joliet long names when the disc has them) and puts
// every file on the engine's memory disk with a read of its own, so each read the game makes fetches only the pieces
// it touches. A raw disc image (BIN, 2352-byte sectors) reads the same way with each sector's edges left out.
// Everything is synchronous: the engine's reads must be answered at once, so pieces come by synchronous requests
// (allowed in a worker), as lazyzip.js does for big zips.
(function (root) {
  'use strict';
  const PIECE = 8 * 1024 * 1024;
  const KEEP = 6;                              // recent pieces kept: 48 MB, enough for a game moving around one big file
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const SYNC = [0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0];

  // size: the image's length in bytes; getPiece(n): piece n, synchronously.
  function open(size, getPiece) {
    const cache = new Map();
    let fetched = 0;
    function piece(n) {
      if (cache.has(n)) { const v = cache.get(n); cache.delete(n); cache.set(n, v); return v; }
      const v = getPiece(n);
      if (!v || v.length !== Math.min(PIECE, size - n * PIECE)) throw new Error('A piece of the disc came back the wrong size');
      fetched += v.length;
      cache.set(n, v);
      while (cache.size > KEEP) cache.delete(cache.keys().next().value);
      return v;
    }
    // Bytes a..b of the image itself, into out at at0.
    function raw(a, b, out, at0) {
      if (a < 0 || b > size || a > b) throw new Error('The disc is damaged (it points outside itself)');
      for (let at = a; at < b;) {
        const n = Math.floor(at / PIECE), p = piece(n), off = at - n * PIECE, take = Math.min(p.length - off, b - at);
        out.set(p.subarray(off, off + take), at0 + at - a); at += take;
      }
    }
    // The disc's own layout: 2048 bytes a sector (ISO), or 2352 with a 16-byte (Mode 1) or 24-byte (Mode 2) head.
    const head = new Uint8Array(16);
    raw(0, Math.min(16, size), head, 0);
    const rawDisc = SYNC.every((v, i) => head[i] === v);
    const sector = rawDisc ? 2352 : 2048, skip = rawDisc ? (head[15] === 2 ? 24 : 16) : 0;
    // Logical bytes a..b of the disc (2048 to a sector), wherever they sit in the image.
    function range(a, b) {
      const out = new Uint8Array(Math.max(0, b - a));
      if (!rawDisc) { raw(a, b, out, 0); return out; }
      for (let at = a; at < b;) {
        const s = Math.floor(at / 2048), off = at - s * 2048, take = Math.min(2048 - off, b - at);
        const from = s * sector + skip + off;
        raw(from, from + take, out, at - a); at += take;
      }
      return out;
    }

    // The volume descriptors, from sector 16: the primary one (8.3 names) and Joliet's (long names), if any.
    let primary = null, joliet = null;
    for (let s = 16; s < 64; s++) {
      const d = range(s * 2048, s * 2048 + 2048);
      if (String.fromCharCode(d[1], d[2], d[3], d[4], d[5]) !== 'CD001') throw new Error('This disc image is not one PLAY can read (no ISO 9660 table)');
      if (d[0] === 255) break;
      if (d[0] === 1 && !primary) primary = d;
      if (d[0] === 2 && d[88] === 0x25 && d[89] === 0x2f && [0x40, 0x43, 0x45].includes(d[90])) joliet = d;
    }
    if (!primary) throw new Error('This disc image has no table of files');
    const vd = joliet || primary, wide = !!joliet;
    const block = u16(vd, 128) || 2048;
    const nameOf = (b, o, n) => {
      let s = '';
      if (wide) for (let i = 0; i + 1 < n; i += 2) s += String.fromCharCode((b[o + i] << 8) | b[o + i + 1]);
      else for (let i = 0; i < n; i++) s += String.fromCharCode(b[o + i]);
      return s.replace(/;\d+$/, '').replace(/\.$/, '');
    };
    const entries = [], seen = new Set();
    function walk(lba, len, prefix, depth) {
      if (depth > 16 || seen.has(lba)) return;
      seen.add(lba);
      const d = range(lba * block, lba * block + len);
      for (let o = 0; o < d.length;) {
        const n = d[o];
        if (!n) { o = (Math.floor(o / 2048) + 1) * 2048; continue; }   // records never cross a sector; zero pads the rest
        const at = u32(d, o + 2), length = u32(d, o + 10), flags = d[o + 25], nl = d[o + 32];
        const id = d.subarray(o + 33, o + 33 + nl);
        if (!(nl === 1 && (id[0] === 0 || id[0] === 1))) {               // not "." or ".."
          const name = nameOf(d, o + 33, nl);
          if (name && !/[\\/]|^\.\.?$/.test(name)) {
            const path = prefix + name;
            if (flags & 2) walk(at, length, path + '/', depth + 1);
            else if (!(flags & 1)) entries.push({ name: path, start: at * block, size: length });
          }
        }
        o += n;
      }
    }
    walk(u32(vd, 156 + 2), u32(vd, 156 + 10), '', 0);
    // A read of a file's bytes from..from+n (clipped to the file).
    const read = (e, from, n) => range(e.start + from, e.start + Math.min(e.size, from + n));
    return { entries, read, raw: rawDisc, fetched: () => fetched, pieces: () => [...cache.keys()] };
  }

  // Each file of the disc becomes a read-only file on the engine's memory disk whose reads go to the disc, a few
  // bytes at a time if that is all the game asks for. Emscripten's memory files read through their stream_ops, so a
  // file keeps every one of them but read; its size comes from usedBytes. onRead(rel, bytes) hears each read.
  function mount(FS, disc, dir, onRead) {
    const files = [];
    for (const e of disc.entries) {
      const full = dir + '/' + e.name, parent = full.slice(0, full.lastIndexOf('/'));
      FS.mkdirTree(parent);
      const node = FS.createFile(parent, full.slice(parent.length + 1), null, true, false);
      node.usedBytes = e.size;
      node.contents = null;
      node.stream_ops = Object.assign({}, node.stream_ops, {
        read(stream, buffer, offset, length, position) {
          if (position >= e.size) return 0;
          const bytes = disc.read(e, position, length);
          buffer.set(bytes, offset);
          if (onRead) onRead(e.name, bytes.length);
          return bytes.length;
        },
        write() { throw new FS.ErrnoError(63); },   // EROFS: a disc is read-only
      });
      files.push(full);
    }
    return files;
  }

  const api = { open, mount, PIECE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayLazyDisc = api;
})(typeof self !== 'undefined' ? self : this);
