// SETUP: one command that makes a fresh PC into a running catalog builder for a profile.
//   node scripts/setup.js                 (profile from VOID_PROFILE, default voidtv)
//   node scripts/setup.js --no-tasks      (skip the Windows scheduled tasks)
// Checks Node, the profile and its list, writes backend/.env from the example if missing, creates the
// scheduled tasks, runs the doctor in quick mode, and prints what to do next. Safe to run again.
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const PROFILE = require('./lib/profile');
const { createTasks, taskNames } = require('./lib/tasks');

const ok = (m) => console.log('  ok   ' + m), warn = (m) => console.log('  !!   ' + m);
console.log(`\nVOID kit setup: profile "${PROFILE.name}" (${PROFILE.siteName})\n`);

const [major] = process.versions.node.split('.').map(Number);
if (major < 20) { warn(`Node ${process.versions.node} is too old; install Node 20 or newer`); process.exit(1); }
ok(`Node ${process.versions.node}`);

if (!fs.existsSync(PROFILE.listFile)) { warn(`no list at ${PROFILE.listFile}; create it (see docs/KIT.md) and run setup again`); process.exit(1); }
const list = JSON.parse(fs.readFileSync(PROFILE.listFile, 'utf8'));
ok(`list: ${list.shows.length} titles in ${list.types.length} rows`);
for (const d of ['shows', 'candidates', 'cache', 'people', 'people-bios', 'movies']) fs.mkdirSync(path.join(PROFILE.catalogDir, d), { recursive: true });
const ovFile = path.join(PROFILE.catalogDir, 'overrides.json');
if (!fs.existsSync(ovFile)) fs.writeFileSync(ovFile, JSON.stringify({ _readme: 'Your decisions (HQ writes them, the builder only reads them): excludeItems, aliases, tvmazeId, tmdbId, searchName, acceptFiles, rejectFiles, hidden, note' }, null, 2));
ok(`catalog folder: ${path.relative(PROFILE.ROOT, PROFILE.catalogDir) || '.'}`);

const envFile = path.join(PROFILE.ROOT, 'backend', '.env');
if (!fs.existsSync(envFile)) {
  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  fs.writeFileSync(envFile, '# Keys stay here, never in git.\n# TMDB read token (free, themoviedb.org > settings > API): posters, backdrops, cast\nTMDB_READ_TOKEN=\n# Cloudflare analytics for HQ (optional): account id and an "Account Analytics: Read" token\nCF_ACCOUNT_ID=\nCF_ANALYTICS_TOKEN=\n');
  warn('backend/.env created; put your TMDB token in it for art and people');
} else ok('backend/.env present');

if (!process.argv.includes('--no-tasks')) {
  try { const made = createTasks(process.execPath); ok('scheduled tasks: ' + made.join(', ')); }
  catch (e) { warn('could not create scheduled tasks (' + (e.stderr ? e.stderr.toString().trim() : e.message).slice(0, 120) + '); HQ > Overview can retry'); }
} else ok('tasks skipped (' + taskNames().join(', ') + ')');

const d = spawnSync(process.execPath, [path.join(__dirname, 'doctor.js'), '--quick'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
console.log('\n' + (d.stdout || '').toString().trim().split('\n').map((l) => '  ' + l).join('\n'));

console.log(`
Next:
  1. First hunt (polite to the Archive; hours for a long list):   node scripts/hunt.js --priority --open 8 --pause 2500 --budget 20000
  2. Match files to episodes:                                      node scripts/match.js
  3. Art and people (needs the TMDB token):                        node scripts/art.js && node scripts/people.js
  4. Build and look at the site locally:                           node scripts/site.js --base http://127.0.0.1:8766 && python -m http.server 8766 --bind 127.0.0.1 --directory ${path.relative(PROFILE.ROOT, PROFILE.siteDir)}
  5. Open HQ:                                                      node scripts/hq.js --open      (or the VOIDtv HQ desktop app)
  6. Publish: docs/DEPLOY.md has the Cloudflare Pages steps (free, no server). Build command: node scripts/site.js --base ${PROFILE.domain}
Daily care: docs/RUNBOOK.md. The scheduled tasks publish every two hours and run the full pass nightly at 3:30.
`);
