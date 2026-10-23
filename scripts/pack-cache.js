// PACK CACHE: gzip the Archive search pages already in catalog/cache (scrape-*, mscrape-*, scout-* .json) the way the hunters now
// save new ones (scripts/lib/cachefile.js). Lossless: each page is read back from the gzip and compared byte for byte before the
// plain file is removed. About 40 GB became about 12 GB on 23 Oct 2026 (sampled ratio 30%).
// It refuses to run while a hunt or the scout is running, because a hunt started before cachefile.js only knows the plain names.
// Hunts started after it read either name and look again when a page moves under them, so --force is safe once every running
// job was started after cachefile.js (check the start times in HQ > Jobs).
// Usage: node scripts/pack-cache.js [--dry] [--force]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
const PROFILE = require('./lib/profile');
const { PACKED } = require('./lib/cachefile');

const CACHE = path.join(PROFILE.catalogDir, 'cache');
const args = process.argv.slice(2);
const DRY = args.includes('--dry'), FORCE = args.includes('--force');
const unknown = args.filter((a) => a !== '--dry' && a !== '--force');
if (unknown.length) { console.error('Unknown option: ' + unknown.join(' ') + ' (known: --dry, --force)'); process.exit(2); }

function jobsRunning() {
  try {
    const out = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Select-Object -ExpandProperty CommandLine"', { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return (out.match(/hunt(-movies)?\.js|scout\.js/g) || []).length;
  } catch (_) { return 0; }
}

function main() {
  const running = jobsRunning();
  if (running && !FORCE && !DRY) { console.log(`${running} hunt or scout job(s) running: stop them or wait (HQ > Jobs), then run this again.`); return 1; }
  const files = fs.readdirSync(CACHE).filter((f) => PACKED.test(f) && f.endsWith('.json'));
  let done = 0, before = 0, after = 0, failed = 0;
  for (const f of files) {
    const p = path.join(CACHE, f);
    try {
      const raw = fs.readFileSync(p);
      const gz = zlib.gzipSync(raw);
      if (!zlib.gunzipSync(gz).equals(raw)) throw new Error('read-back differs');
      before += raw.length; after += gz.length; done++;
      if (DRY) continue;
      fs.writeFileSync(p + '.gz.tmp', gz);
      fs.renameSync(p + '.gz.tmp', p + '.gz');
      if (!zlib.gunzipSync(fs.readFileSync(p + '.gz')).equals(raw)) throw new Error('gzip on disk differs');
      fs.unlinkSync(p);
    } catch (e) { failed++; console.log(`  ${f}: ${e.message} (plain file kept)`); try { fs.unlinkSync(p + '.gz.tmp'); } catch (_) { /* none */ } }
    if (done % 2000 === 0 && done) console.log(`  ${done} of ${files.length}`);
  }
  console.log(`${DRY ? 'dry: would pack' : 'packed'} ${done} of ${files.length} pages: ${(before / 1e9).toFixed(1)} GB to ${(after / 1e9).toFixed(1)} GB${failed ? `, ${failed} failed and kept plain` : ''}`);
  return failed ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { main };
