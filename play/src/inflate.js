// VoidTV PLAY: a small synchronous DEFLATE decoder (plan T21). Licence: GPL-2.0-or-later (play/LICENSE).
// Written from the format's own description (RFC 1951); no code taken from any other decoder. The browser's own
// DecompressionStream only answers asynchronously, and a file the game engine reads must be there at once, so the
// lazy game files (lazyzip.js) unpack with this. Raw deflate only (no zlib or gzip wrapper), the way zips store it.
(function (root) {
  'use strict';
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073,
    4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  const FAST = 9;                              // codes up to this many bits decode with one table look-up

  // A canonical Huffman code from its code lengths: a fast table for short codes, counts and symbols for the rest.
  function table(lengths) {
    const count = new Uint16Array(16), sym = new Uint16Array(lengths.length), offs = new Uint16Array(16);
    for (const l of lengths) count[l]++;
    count[0] = 0;
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
    for (let i = 0; i < lengths.length; i++) if (lengths[i]) sym[offs[lengths[i]]++] = i;
    // fast[bits read so far, least significant first] = symbol << 4 | length, or 0 when the code is longer than FAST.
    const fast = new Uint16Array(1 << FAST);
    let code = 0, k = 0;
    for (let len = 1; len <= FAST; len++) {
      for (let n = 0; n < count[len]; n++, k++, code++) {
        let rev = 0;
        for (let b = 0; b < len; b++) rev |= ((code >> b) & 1) << (len - 1 - b);
        for (let fill = rev; fill < (1 << FAST); fill += 1 << len) fast[fill] = (sym[k] << 4) | len;
      }
      code <<= 1;
    }
    return { count, sym, fast };
  }

  let FIXED_L = null, FIXED_D = null;
  function fixed() {
    if (!FIXED_L) {
      const l = new Uint8Array(288);
      l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
      FIXED_L = table(l); FIXED_D = table(new Uint8Array(30).fill(5));
    }
    return [FIXED_L, FIXED_D];
  }

  // src: the raw deflate bytes; size: the unpacked size the zip states (the output is stopped there: a zip can lie).
  function inflateRaw(src, size) {
    const out = new Uint8Array(size);
    let op = 0, ip = 0, buf = 0, cnt = 0;
    const fill = (n) => { while (cnt < n) { buf |= (ip < src.length ? src[ip] : 0) << cnt; ip++; cnt += 8; } };
    const bits = (n) => { fill(n); const v = buf & ((1 << n) - 1); buf >>>= n; cnt -= n; return v; };
    function decode(t) {
      fill(FAST);
      const f = t.fast[buf & ((1 << FAST) - 1)];
      if (f) { const len = f & 15; buf >>>= len; cnt -= len; return f >> 4; }
      // Longer codes, one bit at a time (most significant bit of the code first).
      let code = 0, first = 0, index = 0;
      for (let len = 1; len <= 15; len++) {
        code |= bits(1);
        const c = t.count[len];
        if (code - c < first) return t.sym[index + (code - first)];
        index += c; first += c; first <<= 1; code <<= 1;
      }
      throw new Error('The game file is damaged (a bad code)');
    }
    for (let last = 0; !last;) {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        buf = 0; cnt = 0;                      // a stored block starts on the next whole byte
        if (ip + 4 > src.length) throw new Error('The game file is cut short');
        const len = src[ip] | (src[ip + 1] << 8), nlen = src[ip + 2] | (src[ip + 3] << 8);
        if ((len ^ 0xffff) !== nlen) throw new Error('The game file is damaged (a bad stored block)');
        ip += 4;
        if (ip + len > src.length || op + len > size) throw new Error('The game file is damaged (bigger than it says)');
        out.set(src.subarray(ip, ip + len), op); ip += len; op += len;
        continue;
      }
      let lt, dt;
      if (type === 1) [lt, dt] = fixed();
      else if (type === 2) {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) cl[ORDER[i]] = bits(3);
        const ct = table(cl), lens = new Uint8Array(hlit + hdist);
        for (let i = 0; i < hlit + hdist;) {
          const s = decode(ct);
          if (s < 16) lens[i++] = s;
          else {
            let rep, val = 0;
            if (s === 16) { if (!i) throw new Error('The game file is damaged (a bad table)'); val = lens[i - 1]; rep = 3 + bits(2); }
            else if (s === 17) rep = 3 + bits(3);
            else rep = 11 + bits(7);
            if (i + rep > lens.length) throw new Error('The game file is damaged (a bad table)');
            lens.fill(val, i, i + rep); i += rep;
          }
        }
        lt = table(lens.subarray(0, hlit)); dt = table(lens.subarray(hlit));
      } else throw new Error('The game file is damaged (a bad block)');
      for (;;) {
        const s = decode(lt);
        if (s < 256) { if (op >= size) throw new Error('The game file is damaged (bigger than it says)'); out[op++] = s; continue; }
        if (s === 256) break;
        const li = s - 257;
        if (li >= 29) throw new Error('The game file is damaged (a bad length)');
        const len = LBASE[li] + bits(LEXT[li]);
        const ds = decode(dt);
        if (ds >= 30) throw new Error('The game file is damaged (a bad distance)');
        const dist = DBASE[ds] + bits(DEXT[ds]);
        if (dist > op) throw new Error('The game file is damaged (it reaches back too far)');
        if (op + len > size) throw new Error('The game file is damaged (bigger than it says)');
        for (let k = 0; k < len; k++, op++) out[op] = out[op - dist];
      }
      if (ip > src.length + 4) throw new Error('The game file is cut short');
    }
    if (op !== size) throw new Error('The game file is damaged (smaller than it says)');
    return out;
  }

  const api = { inflateRaw };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayInflate = api;
})(typeof self !== 'undefined' ? self : this);
