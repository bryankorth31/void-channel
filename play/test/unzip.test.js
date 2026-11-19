// VoidTV PLAY: tests for the small zip reader. Licence: GPL-2.0-or-later (play/LICENSE).
// The zips here are made by the test itself (a few lines below), so nothing is fetched and no game is stored.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const zlib = require('node:zlib');

const Unzip = require(path.join(__dirname, '..', 'src', 'unzip.js'));

// Make a zip from [{ name, data, deflate }]: local headers, then the central directory, then its end record.
function makeZip(files, comment) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'latin1');
    const plain = Buffer.from(f.data || '', 'latin1');
    const packed = f.deflate ? zlib.deflateRawSync(plain) : plain;
    const method = f.deflate ? 8 : 0;
    const extra = Buffer.from(f.localExtra || '');      // a local extra field the central one does not have
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(packed.length, 18); lh.writeUInt32LE(plain.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(extra.length, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(packed.length, 20); ch.writeUInt32LE(plain.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    const local = Buffer.concat([lh, name, extra, packed]);
    locals.push(local); centrals.push(Buffer.concat([ch, name]));
    offset += local.length;
  }
  const dir = Buffer.concat(centrals);
  const note = Buffer.from(comment || '');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(note.length, 20);
  return new Uint8Array(Buffer.concat([...locals, dir, end, note]));
}

const text = (bytes) => Buffer.from(bytes).toString('latin1');

test('entries lists every file and folder with its sizes', () => {
  const zip = makeZip([
    { name: 'oregont/' },
    { name: 'oregont/OREGON.EXE', data: 'MZ program' },
    { name: 'oregont/SONGS.TXT', data: 'a song '.repeat(200), deflate: true },
  ]);
  const list = Unzip.entries(zip);
  assert.deepEqual(list.map((e) => e.name), ['oregont/', 'oregont/OREGON.EXE', 'oregont/SONGS.TXT']);
  assert.deepEqual(list.map((e) => e.dir), [true, false, false]);
  assert.equal(list[1].method, 0);
  assert.equal(list[1].usize, 10);
  assert.equal(list[2].method, 8);
  assert.equal(list[2].usize, 1400);
  assert.ok(list[2].size < list[2].usize, 'packed smaller');
});

test('read gives back stored and deflated files byte for byte', async () => {
  const song = 'Shenandoah, I long to see you. '.repeat(50);
  const zip = makeZip([{ name: 'A.EXE', data: 'MZ\x00\x01\xff' }, { name: 'SONGS.TXT', data: song, deflate: true }]);
  const [a, s] = Unzip.entries(zip);
  assert.equal(text(await Unzip.read(zip, a)), 'MZ\x00\x01\xff');
  assert.equal(text(await Unzip.read(zip, s)), song);
});

test('read uses the local header lengths, which can differ from the table of contents', async () => {
  const zip = makeZip([{ name: 'X.DAT', data: 'right bytes', localExtra: 'EXTRA-FIELD!' }]);
  assert.equal(text(await Unzip.read(zip, Unzip.entries(zip)[0])), 'right bytes');
});

test('a stored file read twice is its own copy, not a window into the zip', async () => {
  const zip = makeZip([{ name: 'A', data: 'abc' }]);
  const out = await Unzip.read(zip, Unzip.entries(zip)[0]);
  out[0] = 0;
  assert.equal(text(await Unzip.read(zip, Unzip.entries(zip)[0])), 'abc');
});

test('a zip with a comment at the end is still found', () => {
  const zip = makeZip([{ name: 'A', data: 'x' }], 'Uploaded to the Internet Archive '.repeat(20));
  assert.deepEqual(Unzip.entries(zip).map((e) => e.name), ['A']);
});

test('DOS backslash names become forward slashes', () => {
  const zip = makeZip([{ name: 'oregont\\OREGON.EXE', data: 'MZ' }]);
  assert.equal(Unzip.entries(zip)[0].name, 'oregont/OREGON.EXE');
});

test('an empty zip has no entries', () => {
  assert.deepEqual(Unzip.entries(makeZip([])), []);
});

test('not a zip, or a damaged one, says so in plain words', () => {
  assert.throws(() => Unzip.entries(new Uint8Array(100)), /not a zip/);
  assert.throws(() => Unzip.entries(new Uint8Array(0)), /not a zip/);
  const zip = makeZip([{ name: 'A', data: 'x' }]);
  const broken = zip.slice();
  const dirAt = broken.length - 22 - 47;     // the one table of contents entry (46 + a 1 letter name)
  broken[dirAt] = 0;
  assert.throws(() => Unzip.entries(broken), /damaged/);
});

test('a packing the reader does not know is refused by name', async () => {
  const zip = makeZip([{ name: 'B.ZIP', data: 'x' }]);
  const e = Object.assign({}, Unzip.entries(zip)[0], { method: 14 });   // 14 is LZMA
  await assert.rejects(() => Unzip.read(zip, e), /B\.ZIP/);
});

test('safe keeps paths inside the game folder', () => {
  assert.equal(Unzip.safe('oregont/OREGON.EXE'), 'oregont/OREGON.EXE');
  assert.equal(Unzip.safe('/oregont/OREGON.EXE'), 'oregont/OREGON.EXE');
  assert.equal(Unzip.safe('./oregont//OREGON.EXE'), 'oregont/OREGON.EXE');
  assert.equal(Unzip.safe('GAME.DAT'), 'GAME.DAT');
  assert.equal(Unzip.safe('...TXT'), '...TXT', 'dots in a name are fine');
});

test('safe refuses a way out of the game folder', () => {
  assert.equal(Unzip.safe('../evil.js'), null);
  assert.equal(Unzip.safe('oregont/../../evil'), null);
  assert.equal(Unzip.safe('..'), null);
  assert.equal(Unzip.safe('C:/AUTOEXEC.BAT'), null);
  assert.equal(Unzip.safe('C:AUTOEXEC.BAT'), null);
});

test('safe of a name with nothing in it is empty, which the worker skips', () => {
  assert.equal(Unzip.safe(''), '');
  assert.equal(Unzip.safe('/'), '');
  assert.equal(Unzip.safe('./'), '');
});
