// PROFILE: the one place a catalog says what it is. A profile is a folder under profiles/<name>/ with
// profile.json (and usually list.json). The builder, HQ, the doctor and the site build all read this
// module, so the same code runs any catalog: TV from the Archive, public-access television, old-time
// radio, a lecture archive. Pick one with the VOID_PROFILE environment variable; the default is voidtv,
// which keeps every path exactly where it has always been.
//
// Fields (all optional; defaults are VOIDtv's):
//   siteName, tagline, domain       branding and the production origin
//   listFile                        the list of what you want (name, type/row, network, tags)
//   catalogDir, siteDir             where the builder writes and where the site build lands
//   docsDir                         where reports go (HUNT.md, COVERAGE.md…): docs/ for voidtv, profiles/<name>/docs otherwise
//   reference                       'tvmaze' (episode lists from TVmaze) or 'none' (list shows from their own files)
//   mediatype                       Archive mediatype to hunt: 'movies' (video) or 'audio'
//   rows                            row names in display order (otherwise the list file's types)
//   taskPrefix                      Windows scheduled task names: "<prefix> Publish" and "<prefix> Nightly"
//   port                            HQ port (8780)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const name = process.env.VOID_PROFILE || 'voidtv';
const defaults = {
  name: 'voidtv', siteName: 'voidtv.net', tagline: 'before AI slop, there was human creativity', domain: 'https://voidtv.net',
  listFile: 'scripts/show-list.json', catalogDir: 'catalog', siteDir: 'site', docsDir: 'docs', reference: 'tvmaze', mediatype: 'movies',
  rows: null, taskPrefix: 'VoidTV', port: 8780,
};
const file = path.join(ROOT, 'profiles', name, 'profile.json');
let p = { ...defaults };
if (fs.existsSync(file)) { try { p = { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')), name }; } catch (e) { throw new Error('profile ' + name + ' is not valid JSON: ' + file); } }
else if (name !== 'voidtv') throw new Error('profile "' + name + '" not found: expected ' + file);
if (name !== 'voidtv' && !(fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).docsDir)) p.docsDir = path.join('profiles', name, 'docs');
if (!p.taskPrefix || p.taskPrefix === defaults.taskPrefix && name !== 'voidtv') p.taskPrefix = p.siteName.replace(/[^A-Za-z0-9]/g, '');
fs.mkdirSync(path.resolve(ROOT, p.docsDir), { recursive: true });
module.exports = {
  ROOT, name: p.name, siteName: p.siteName, tagline: p.tagline, domain: p.domain, reference: p.reference, mediatype: p.mediatype,
  rows: p.rows, taskPrefix: p.taskPrefix, port: +p.port || 8780,
  listFile: path.resolve(ROOT, p.listFile), catalogDir: path.resolve(ROOT, p.catalogDir), siteDir: path.resolve(ROOT, p.siteDir), docsDir: path.resolve(ROOT, p.docsDir),
  dir: path.join(ROOT, 'profiles', name),
};
