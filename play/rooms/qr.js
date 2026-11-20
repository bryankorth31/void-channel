// VoidTV rooms: a QR code maker, written from the QR standard (ISO/IEC 18004) for the join address on the big screen.
// Licence: GPL-2.0-or-later (play/LICENSE). Byte mode, error correction level M (about 15% of the code can be dirty or
// covered), versions 1 to 10 (up to 213 bytes). Checked against OpenCV's reader in play/test/rooms.test.js.
(function (root) {
  'use strict';
  // Level M, per version: [error codewords per block, [blocks, data codewords per block], ...]
  const BLOCKS = [null,
    [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
    [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  // GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function ecc(data, n) {
    let gen = [1];   // the product of (x - 2^i), i < n, highest power first
    for (let i = 0; i < n; i++) { const next = new Array(gen.length + 1).fill(0); for (let j = 0; j < gen.length; j++) { next[j] ^= gen[j]; next[j + 1] ^= mul(gen[j], EXP[i]); } gen = next; }
    const rem = new Array(n).fill(0);
    for (const d of data) { const f = d ^ rem.shift(); rem.push(0); for (let j = 0; j < n; j++) rem[j] ^= mul(gen[j + 1], f); }
    return rem;
  }

  const capacity = (v) => BLOCKS[v].slice(1).reduce((s, [b, d]) => s + b * d, 0);

  function codewords(bytes, v) {
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
    const cap = capacity(v) * 8;
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    for (let p = 0; data.length < capacity(v); p++) data.push(p % 2 ? 0x11 : 0xec);
    // Split into blocks, add each block's error codewords, then interleave.
    const [n, ...groups] = BLOCKS[v], blocks = [];
    let at = 0;
    for (const [count, size] of groups) for (let i = 0; i < count; i++) { const d = data.slice(at, at + size); at += size; blocks.push({ d, e: ecc(d, n) }); }
    const out = [];
    const longest = Math.max(...blocks.map((b) => b.d.length));
    for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
    for (let i = 0; i < n; i++) for (const b of blocks) out.push(b.e[i]);
    return out;
  }

  const MASKS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];

  function matrix(v, words, mask) {
    const size = 17 + 4 * v;
    const m = Array.from({ length: size }, () => new Array(size).fill(false));
    const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (r, c, dark) => { m[r][c] = dark; fixed[r][c] = true; };
    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        set(rr, cc, ring !== 2 && ring !== 4);
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const A = ALIGN[v], last = A.length - 1;
    for (let a = 0; a <= last; a++) for (let b = 0; b <= last; b++) {
      if ((a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0)) continue;   // the three finder corners
      const r = A[a], c = A[b];
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
    // Format information (level M = 00, then the mask), BCH(15,5), masked with 101010000010010.
    let f = mask << 10;
    for (let i = 14; i >= 10; i--) if (f & (1 << i)) f ^= 0x537 << (i - 10);
    const fmt = ((mask << 10) | f) ^ 0x5412, bit = (i) => ((fmt >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(i, 8, bit(i));
    set(7, 8, bit(6)); set(8, 8, bit(7)); set(8, 7, bit(8));
    for (let i = 9; i < 15; i++) set(8, 14 - i, bit(i));
    for (let i = 0; i < 8; i++) set(8, size - 1 - i, bit(i));
    for (let i = 8; i < 15; i++) set(size - 15 + i, 8, bit(i));
    set(size - 8, 8, true);   // the one dark module
    if (v >= 7) {
      let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (v << 12) | rem;
      for (let i = 0; i < 18; i++) { const d = ((bits >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, d); set(b, a, d); }
    }
    // The data, two columns at a time from the bottom right, up then down, skipping the timing column.
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let k = 0; k < size; k++) for (let j = 0; j < 2; j++) {
        const c = right - j, up = ((right + 1) & 2) === 0, r = up ? size - 1 - k : k;
        if (fixed[r][c]) continue;
        const dark = i < words.length * 8 ? ((words[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false;
        i++;
        m[r][c] = dark !== MASKS[mask](r, c);
      }
    }
    return m;
  }

  // The standard's four penalties; the mask with the lowest score reads best.
  function penalty(m) {
    const n = m.length; let p = 0, dark = 0;
    const lines = [];
    for (let r = 0; r < n; r++) { lines.push(m[r]); lines.push(m.map((row) => row[r])); }
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= n; i++) { if (i < n && line[i] === line[i - 1]) run++; else { if (run >= 5) p += run - 2; run = 1; } }
      const s = line.map((x) => (x ? 1 : 0)).join('');
      for (const pat of ['10111010000', '00001011101']) for (let k = s.indexOf(pat); k !== -1; k = s.indexOf(pat, k + 1)) p += 40;
    }
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const x = m[r][c]; if (x === m[r][c + 1] && x === m[r + 1][c] && x === m[r + 1][c + 1]) p += 3; }
    for (const row of m) for (const x of row) if (x) dark++;
    return p + 10 * Math.floor(Math.abs(dark * 20 / (n * n) - 10));
  }

  // The modules of a QR code for a text (true = dark), or an error if it is too long.
  function encode(text) {
    const bytes = [...new TextEncoder().encode(String(text))];
    let v = 1;
    while (v <= 10 && capacity(v) < bytes.length + (v < 10 ? 2 : 3)) v++;
    if (v > 10) throw new Error('Too long for a QR code here');
    const words = codewords(bytes, v);
    let best = null, score = Infinity;
    for (let k = 0; k < 8; k++) { const m = matrix(v, words, k), s = penalty(m); if (s < score) { score = s; best = m; } }
    return best;
  }

  // An SVG picture of the code with its quiet margin; dark on light, as phone cameras read best.
  function svg(text, px = 8) {
    const m = encode(text), n = m.length, q = 4, size = (n + 2 * q) * px;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += 'M' + (c + q) * px + ' ' + (r + q) * px + 'h' + px + 'v' + px + 'h-' + px + 'z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges">'
      + '<rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  const api = { encode, svg };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayQR = api;
})(typeof self !== 'undefined' ? self : this);
