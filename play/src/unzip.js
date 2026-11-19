// VoidTV PLAY: a small zip reader. Licence: GPL-2.0-or-later (play/LICENSE).
// Archive DOS games come as one zip. The core starts a program by itself only when it is handed the program file, so
// the host unpacks the zip into the core's memory disk first. Reads the zip's own table of contents (the central
// directory at the end), then each file: stored as is, or deflated (the browser's own DecompressionStream inflates).
// Limits, fine for hand-picked cards: no ZIP64 (zips over 4 GB or 65535 files) and no cap on the unpacked size.
// Both need adding before cards come from Archive metadata in bulk (plan T14).
(function (root) {
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  function entries(bytes) {
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('This file is not a zip');
    const count = u16(bytes, end + 10);
    let at = u32(bytes, end + 16);
    const out = [];
    for (let n = 0; n < count; n++) {
      if (u32(bytes, at) !== 0x02014b50) throw new Error('The zip table of contents is damaged');
      const method = u16(bytes, at + 10), size = u32(bytes, at + 20), usize = u32(bytes, at + 24);
      const nameLen = u16(bytes, at + 28), extraLen = u16(bytes, at + 30), commentLen = u16(bytes, at + 32);
      const local = u32(bytes, at + 42);
      const name = new TextDecoder('latin1').decode(bytes.subarray(at + 46, at + 46 + nameLen)).replace(/\\/g, '/');
      out.push({ name, method, size, usize, local, dir: name.endsWith('/') });
      at += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  // The bytes of one entry, unpacked.
  async function read(bytes, e) {
    const at = e.local + 30 + u16(bytes, e.local + 26) + u16(bytes, e.local + 28);
    const raw = bytes.subarray(at, at + e.size);
    if (e.method === 0) return raw.slice();
    if (e.method !== 8) throw new Error('This zip packs ' + e.name + ' in a way we do not read yet');
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // A safe path inside the target folder: no "..", no drive letters, no leading slash.
  function safe(name) {
    const parts = name.split('/').filter((p) => p && p !== '.');
    if (parts.some((p) => p === '..' || /:/.test(p))) return null;
    return parts.join('/');
  }

  const api = { entries, read, safe };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayUnzip = api;
})(typeof self !== 'undefined' ? self : this);
