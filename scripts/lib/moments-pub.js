// Moments for the site (catalog/moments.json, kept in HQ > Moments; the engine is assets/brand/moments/moments.js).
// The build publishes only what a visitor's page needs: moments that are on and approved and not over yet, with the fields
// the engine reads (a moment's source notes stay home). The version is a hash of the engine and that list together, so a
// switch pressed in HQ reaches visitors at once instead of waiting out Cloudflare's day-long cache on /assets.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const M = require('../../assets/brand/moments/moments.js');

const ROOT = path.join(__dirname, '..', '..');
const ENGINE = path.join(ROOT, 'assets', 'brand', 'moments', 'moments.js');
const KEEP = ['id', 'name', 'on', 'approved', 'start', 'peak', 'end', 'kids', 'ad', 'areas'];

function publicMoments(file, now) {
  let d = null;
  try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { moments: [] }; }
  const day = M.today(now);
  const moments = (d && Array.isArray(d.moments) ? d.moments : [])
    .filter((m) => m && m.on === true && m.approved && M.problems(m).length === 0 && String(m.end) >= day)
    .map((m) => Object.fromEntries(KEEP.filter((k) => m[k] !== undefined).map((k) => [k, m[k]])));
  return { moments };
}

function version(pub) {
  let src = '';
  try { src = fs.readFileSync(ENGINE, 'utf8').replace(/\r\n/g, '\n'); } catch (e) { /* no engine: hash the list alone */ }
  return crypto.createHash('sha1').update(src + '\n' + JSON.stringify(pub)).digest('hex').slice(0, 10);
}

// Stamp the engine's script tag in a page with the version (a page without the tag is left as it is).
const stamp = (html, v) => html.replace('src="/assets/brand/moments/moments.js"', 'src="/assets/brand/moments/moments.js?v=' + v + '"');

module.exports = { publicMoments, version, stamp, ENGINE };
