// The area list's version for its ?v= (assets/brand/areas/areas.js): a hash of the file itself, so a change to the list
// reaches visitors at once. With a fixed ?v=1, Cloudflare kept serving the old list for up to a day from its edge cache
// (21 Nov 2026: lexROM was deployed but the menu still showed the old copy). Used by the voidtv.net page (app.js), the
// PLAY page (site.js) and University (its build.js). Line endings are set aside so a Windows checkout hashes like the build.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// With a file named (a path under assets/brand, such as 'atmos/atmos.js', the shared background), that file's version instead.
module.exports = function areasV(file) {
  try {
    const s = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'brand', ...String(file || 'areas/areas.js').split('/')), 'utf8').replace(/\r\n/g, '\n');
    return crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
  } catch (e) { return '1'; }
};
// The rooms' names, read from the same list (voidverse join J3, one name per room; Bryan, 24 Nov 2026: "Yes, those four", then
// "B, PLAY"): wherever voidtv.net's own page names another room (the header button, the Play together tiles), the word comes from
// here, so the header cannot say "Games" while the menu and the room say "PLAY". The list is a browser file, so it is run the way
// tests/areas.test.js runs it. A small copy of the build that does not carry the list (the tests make some) gets the three names
// below; tests/areas.test.js fails when they differ from the list.
const NAMES_WITHOUT_LIST = { play: 'PLAY', trivia: 'Trivia Night', cards: 'Card games' };
module.exports.NAMES_WITHOUT_LIST = NAMES_WITHOUT_LIST;
module.exports.names = function areaNames() {
  const out = Object.assign({}, NAMES_WITHOUT_LIST);
  try {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'brand', 'areas', 'areas.js'), 'utf8');
    const window = {};
    require('vm').runInNewContext(src, { window, location: { hostname: 'voidtv.net', pathname: '/' }, Math,
      document: { currentScript: null, readyState: 'loading', addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} } });
    for (const a of window.VoidAreas.areas) if (a && a.id && a.name) out[a.id] = String(a.name);
  } catch (e) { /* no list in this copy of the build: the three names above */ }
  return out;
};
