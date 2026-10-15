// Local watch/browse page: the whole site in one file, everything inline, served from catalog/.
// Usage: node scripts/preview.js -> catalog/preview.html  (open http://127.0.0.1:8765/preview.html)
const fs = require('fs');
const path = require('path');
const { assemble, page } = require('./lib/app');

const ROOT = path.join(__dirname, '..');
const PROFILE = require('./lib/profile');
const OUT = path.join(PROFILE.catalogDir, 'preview.html');
const data = assemble();
fs.writeFileSync(OUT, page({ data, mode: 'embed', routes: 'hash' }));
console.log(`${data.shows.length} shows, ${data.shows.reduce((n, s) => n + s.eps, 0)} playable episodes -> ${path.relative(ROOT, OUT)}`);
