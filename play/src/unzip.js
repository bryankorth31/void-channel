// VoidTV PLAY: a small zip reader. Licence: GPL-2.0-or-later (play/LICENSE).
// Archive DOS games come as one zip. The core starts a program by itself only when it is handed the program file, so
// the host unpacks the zip into the core's memory disk first. Reads the zip's own table of contents (the central
// directory at the end), then each file: stored as is, or deflated (the browser's own DecompressionStream inflates).
// Big zips: ZIP64 tables (over 65535 files, or sizes and places past 4 GB) are read too. Limits that keep a phone safe:
// at most MAX_FILES files and MAX_BYTES unpacked in all (the core's memory disk lives in the page's memory, beside the
// engine's own); a bigger game is refused with a plain sentence before anything is unpacked, and a file that inflates
// past the size the zip states for it is stopped there (a zip can lie about its sizes).
(function (root) {
  const MAX_FILES = 20000;
  const MAX_BYTES = 256 * 1024 * 1024; // until big games stream in pieces (plan T21)
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 4294967296; // exact up to 2^53, far past any game
  const FULL16 = 0xffff, FULL32 = 0xffffffff;

  function entries(bytes) {
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('This file is not a zip');
    let count = u16(bytes, end + 10);
    let at = u32(bytes, end + 16);
    // A ZIP64 zip keeps its real count and table place in a second record, pointed to just before the first one.
    if ((count === FULL16 || at === FULL32) && end >= 20 && u32(bytes, end - 20) === 0x07064b50) {
      const z = u64(bytes, end - 20 + 8);
      if (u32(bytes, z) !== 0x06064b50) throw new Error('The zip table of contents is damaged');
      count = u64(bytes, z + 32);
      at = u64(bytes, z + 48);
    }
    if (count > MAX_FILES) throw new Error('This game has more files (' + count + ') than PLAY can unpack in a browser');
    const out = [];
    let total = 0;
    for (let n = 0; n < count; n++) {
      if (u32(bytes, at) !== 0x02014b50) throw new Error('The zip table of contents is damaged');
      const method = u16(bytes, at + 10);
      let size = u32(bytes, at + 20), usize = u32(bytes, at + 24);
      const nameLen = u16(bytes, at + 28), extraLen = u16(bytes, at + 30), commentLen = u16(bytes, at + 32);
      let local = u32(bytes, at + 42);
      // ZIP64 sizes and place live in the extra field (id 1), in this order, only for the ones marked full.
      if (usize === FULL32 || size === FULL32 || local === FULL32) {
        for (let x = at + 46 + nameLen, stop = x + extraLen; x + 4 <= stop;) {
          const id = u16(bytes, x), len = u16(bytes, x + 2);
          if (id === 1) {
            let o = x + 4;
            if (usize === FULL32) { usize = u64(bytes, o); o += 8; }
            if (size === FULL32) { size = u64(bytes, o); o += 8; }
            if (local === FULL32) { local = u64(bytes, o); }
            break;
          }
          x += 4 + len;
        }
      }
      const name = new TextDecoder('latin1').decode(bytes.subarray(at + 46, at + 46 + nameLen)).replace(/\\/g, '/');
      total += usize;
      out.push({ name, method, size, usize, local, dir: name.endsWith('/') });
      at += 46 + nameLen + extraLen + commentLen;
    }
    if (total > MAX_BYTES) throw new Error('This game unpacks to ' + Math.round(total / 1048576) + ' MB, more than PLAY can hold in a browser');
    return out;
  }

  // The bytes of one entry, unpacked.
  async function read(bytes, e) {
    const at = e.local + 30 + u16(bytes, e.local + 26) + u16(bytes, e.local + 28);
    const raw = bytes.subarray(at, at + e.size);
    if (e.method === 0) return raw.slice();
    if (e.method !== 8) throw new Error('This zip packs ' + e.name + ' in a way we do not read yet');
    const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const out = new Uint8Array(e.usize);
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (got + value.length > e.usize) { reader.cancel(); throw new Error('The game zip is damaged (' + e.name + ' is bigger than it says)'); }
      out.set(value, got); got += value.length;
    }
    return got === e.usize ? out : out.slice(0, got);
  }

  // A safe path inside the target folder: no "..", no drive letters, no leading slash.
  function safe(name) {
    const parts = name.split('/').filter((p) => p && p !== '.');
    if (parts.some((p) => p === '..' || /:/.test(p))) return null;
    return parts.join('/');
  }

  const api = { entries, read, safe, MAX_FILES, MAX_BYTES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayUnzip = api;
})(typeof self !== 'undefined' ? self : this);
