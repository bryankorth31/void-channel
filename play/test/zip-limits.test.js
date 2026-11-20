// PLAY zip reader: ZIP64 tables are read, and a game too big for a browser is refused before anything is unpacked.
// The zips here are built byte by byte in the test (stored, no compression), so nothing is downloaded.
// Run: node --test "play/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Unzip = require('../src/unzip.js');

const le = (n, bytes) => { const b = Buffer.alloc(bytes); if (bytes === 8) { b.writeUInt32LE(n % 4294967296, 0); b.writeUInt32LE(Math.floor(n / 4294967296), 4); } else if (bytes === 4) b.writeUInt32LE(n >>> 0, 0); else b.writeUInt16LE(n, 0); return b; };

// files: [{ name, data, usize? }]; zip64: write the table the ZIP64 way (full markers, real numbers in the extra field
// and in the ZIP64 end records).
function makeZip(files, zip64) {
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), data = Buffer.from(f.data), usize = f.usize === undefined ? data.length : f.usize;
    const local = Buffer.concat([le(0x04034b50, 4), le(20, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4),
      le(data.length, 4), le(Math.min(usize, 0xfffffffe), 4), le(name.length, 2), le(0, 2), name, data]);
    const extra = zip64 ? Buffer.concat([le(1, 2), le(24, 2), le(usize, 8), le(data.length, 8), le(off, 8)]) : Buffer.alloc(0);
    central.push(Buffer.concat([le(0x02014b50, 4), le(45, 2), le(45, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4),
      le(zip64 ? 0xffffffff : data.length, 4), le(zip64 ? 0xffffffff : usize, 4), le(name.length, 2), le(extra.length, 2),
      le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(zip64 ? 0xffffffff : off, 4), name, extra]));
    parts.push(local); off += local.length;
  }
  const cd = Buffer.concat(central), cdAt = off;
  const tail = [];
  if (zip64) {
    const z64At = cdAt + cd.length;
    tail.push(Buffer.concat([le(0x06064b50, 4), le(44, 8), le(45, 2), le(45, 2), le(0, 4), le(0, 4),
      le(files.length, 8), le(files.length, 8), le(cd.length, 8), le(cdAt, 8)]));
    tail.push(Buffer.concat([le(0x07064b50, 4), le(0, 4), le(z64At, 8), le(1, 4)]));
  }
  tail.push(Buffer.concat([le(0x06054b50, 4), le(0, 2), le(0, 2), le(zip64 ? 0xffff : files.length, 2),
    le(zip64 ? 0xffff : files.length, 2), le(cd.length, 4), le(zip64 ? 0xffffffff : cdAt, 4), le(0, 2)]));
  return new Uint8Array(Buffer.concat([...parts, cd, ...tail]));
}

test('a ZIP64 zip: the count, sizes and places come from the ZIP64 records', async () => {
  const zip = makeZip([{ name: 'GAME/PLAY.EXE', data: 'MZ-voidtv' }, { name: 'GAME/README.TXT', data: 'hello' }], true);
  const list = Unzip.entries(zip);
  assert.deepEqual(list.map((e) => [e.name, e.size, e.usize]), [['GAME/PLAY.EXE', 9, 9], ['GAME/README.TXT', 5, 5]]);
  assert.equal(Buffer.from(await Unzip.read(zip, list[1])).toString(), 'hello');
  assert.equal(Buffer.from(await Unzip.read(zip, list[0])).toString(), 'MZ-voidtv');
});

test('a plain zip still reads the same way', async () => {
  const zip = makeZip([{ name: 'A.COM', data: 'abc' }], false);
  const [e] = Unzip.entries(zip);
  assert.equal(e.name, 'A.COM');
  assert.equal(Buffer.from(await Unzip.read(zip, e)).toString(), 'abc');
});

test('a game that unpacks past the cap is refused in a plain sentence, before anything is unpacked', () => {
  const big = makeZip([{ name: 'CD.ISO', data: 'x', usize: Unzip.MAX_BYTES + 1 }], true);
  assert.throws(() => Unzip.entries(big), /unpacks to \d+ MB, more than PLAY can hold in a browser/);
});

test('the cap is a quarter gigabyte and twenty thousand files', () => {
  assert.equal(Unzip.MAX_BYTES, 256 * 1024 * 1024);
  assert.equal(Unzip.MAX_FILES, 20000);
});
