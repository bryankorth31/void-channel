// Home-screen icons for Void University (Bryan, 19 Nov 2026: "the whole pwa"; "Yes, do it here"). Draws the crest from
// build.js on the Bright night background and saves the PNGs the manifest and iPhone use into img/:
//   apple-touch-icon.png 180 (iPhone and iPad; iOS rounds the corners itself), icon-192.png, icon-512.png and
//   icon-512-maskable.png (Android crops that one to a circle, so the crest sits inside the middle 60%).
// Run once after the crest changes: node profiles/university/make-icons.js. Uses Edge in headless mode, no packages.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = __dirname;
const src = fs.readFileSync(path.join(DIR, 'build.js'), 'utf8');
const CREST = (/const CREST = '(<svg[\s\S]*?<\/svg>)';/.exec(src) || [])[1];
if (!CREST) { console.error('could not find const CREST in build.js'); process.exit(1); }
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('Microsoft Edge not found'); process.exit(1); }

const BG = '#0b0c12';
const jobs = [
  { file: 'apple-touch-icon.png', size: 180, share: 0.7 },
  { file: 'icon-192.png', size: 192, share: 0.7 },
  { file: 'icon-512.png', size: 512, share: 0.7 },
  { file: 'icon-512-maskable.png', size: 512, share: 0.56 },
];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vu-icons-'));
for (const j of jobs) {
  const px = Math.round(j.size * j.share);
  const html = `<!doctype html><html><body style="margin:0;width:${j.size}px;height:${j.size}px;background:${BG};display:flex;align-items:center;justify-content:center;overflow:hidden">`
    + CREST.replace('<svg ', `<svg width="${px}" height="${px}" `) + '</body></html>';
  const page = path.join(tmp, j.file + '.html'), out = path.join(DIR, 'img', j.file);
  fs.writeFileSync(page, html);
  const r = spawnSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${path.join(tmp, 'profile')}`,
    `--window-size=${j.size},${j.size}`, `--screenshot=${out}`, 'file:///' + page.replace(/\\/g, '/')], { timeout: 60000, windowsHide: true });
  if (r.status !== 0 || !fs.existsSync(out)) { console.error('Edge could not draw ' + j.file); process.exit(1); }
  console.log('img/' + j.file + ' ' + j.size + 'px');
}
fs.rmSync(tmp, { recursive: true, force: true });
