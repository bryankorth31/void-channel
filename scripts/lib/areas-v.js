// The area list's version for its ?v= (assets/brand/areas/areas.js): a hash of the file itself, so a change to the list
// reaches visitors at once. With a fixed ?v=1, Cloudflare kept serving the old list for up to a day from its edge cache
// (21 Nov 2026: lexROM was deployed but the menu still showed the old copy). Used by the voidtv.net page (app.js), the
// PLAY page (site.js) and University (its build.js). Line endings are set aside so a Windows checkout hashes like the build.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
module.exports = function areasV() {
  try {
    const s = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'brand', 'areas', 'areas.js'), 'utf8').replace(/\r\n/g, '\n');
    return crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
  } catch (e) { return '1'; }
};
