// Ranks the Archive copies of each episode for the VOID player, best first.
//
// The current builder (scripts/match.js) breaks ties by picking the BIGGEST file and keeps "alternates"
// that are sometimes other episodes. This module does neither:
//   1. Only copies that are the same episode by a hard signal (season/episode in the filename, absolute
//      episode number, or airdate) are kept as backups, and a filename episode code that disagrees with the
//      pick removes them.
//   2. Among copies the matcher trusts about equally, the lightest well-formed one plays first:
//      Archive h.264 re-encodes, then MP4 originals, then Matroska (Chromium-only), then Ogg (no Safari).
//   3. Each copy carries what the player needs to decide at play time: bitrate, format, codec-risk hints,
//      and whether it needs Matroska support.
//
// It reads catalog/shows/*.json and changes nothing. Used two ways:
//   node player/tools/rank-sources.js --lab        writes player/lab/episodes.json (a test sample)
//   node player/tools/rank-sources.js --stats      prints how the ranking would change the live catalog
//   require('./rank-sources').rankEpisode(ep)      for the later VOIDtv build integration
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SHOWS = path.join(ROOT, 'catalog', 'shows');

const TIER = { 'h.264': 0, 'h.264 IA': 0, 'MPEG4': 1, 'Matroska': 2, 'QuickTime': 2, 'Ogg Video': 4 };
const SAME_EP = /^(S\/E in filename|absolute episode number|airdate in filename)/;
const VRISK = /\b(x265|h\.?265|hevc|10.?bit|av1|xvid|divx)\b/i;
const ARISK = /\b(ac-?3|e-?ac-?3|ddp?\s?5\.1|dd\+?|dts(-hd)?|truehd|flac|opus)\b/i;

function epCode(name) {
  const s = String(name || '');
  let m = s.match(/s(\d{1,2})[ ._-]*e(\d{1,3})/i); if (m) return +m[1] + 'x' + +m[2];
  m = s.match(/\b(\d{1,2})x(\d{2,3})\b/); if (m) return +m[1] + 'x' + +m[2];
  m = s.match(/(?:^|\/)(\d)(\d{2})\s*-/); if (m) return +m[1] + 'x' + +m[2];
  return null;
}

function describe(f, pickConf) {
  const mbps = f.sizeMB && f.seconds ? (f.sizeMB * 8) / f.seconds : null;
  const name = f.file || f.name || '';
  const derivative = f.format === 'h.264' || f.format === 'h.264 IA';
  // A filename's codec words describe the uploader's release, not an Archive re-encode of it.
  const risk = derivative ? '' : [VRISK.test(name) && 'video', ARISK.test(name) && 'audio'].filter(Boolean).join('+');
  const tier = (TIER[f.format] != null ? TIER[f.format] : 3) + (risk.includes('video') ? 2 : 0) + (risk.includes('audio') ? 1 : 0);
  const tail = (f.url || '').split('/download/')[1] || '';
  return {
    item: f.item, path: tail.split('/').slice(1).join('/'), url: f.url, format: f.format || '', mbps: mbps && Math.round(mbps * 100) / 100,
    seconds: f.seconds || null, risk, needs: f.format === 'Matroska' ? 'mkv' : f.format === 'Ogg Video' ? 'ogg' : '',
    conf: typeof f.conf === 'number' ? f.conf : pickConf, why: f.why || '', tier,
  };
}

// Returns the ranked copies for one catalog episode (empty when nothing is playable).
function rankEpisode(ep) {
  if (!ep || !ep.file) return [];
  const pick = ep.file;
  const code = epCode(pick.file || pick.name);
  const same = (ep.alternates || []).filter((a) => {
    if (!a || !a.url || a.url === pick.url) return false;
    if (!SAME_EP.test(a.why || '')) return false;
    const c = epCode(a.file || a.name);
    return !(code && c && c !== code);
  });
  const all = [pick, ...same].filter((f) => f.playable !== false || f.format === 'Matroska');
  const seen = new Set();
  const list = all.map((f) => describe(f, pick.conf)).filter((d) => !seen.has(d.url) && seen.add(d.url));
  // Trust first (in 0.1 steps, so near-equal confidence counts as equal), then the lighter, cleaner copy.
  list.sort((a, b) => (Math.round(b.conf * 10) - Math.round(a.conf * 10)) || (a.tier - b.tier) || ((a.mbps || 3) - (b.mbps || 3)));
  return list;
}

function* episodes() {
  for (const f of fs.readdirSync(SHOWS)) {
    if (!f.endsWith('.json')) continue;
    let j; try { j = JSON.parse(fs.readFileSync(path.join(SHOWS, f), 'utf8')); } catch (e) { continue; }
    for (const se of j.seasons || []) for (const e of se.episodes || []) if (e.file) yield { show: j, se, ep: e };
  }
}

function toLab({ show, se, ep }) {
  const files = rankEpisode(ep);
  return { id: show.slug + '/' + se.season + 'x' + ep.number, show: show.show, slug: show.slug, title: ep.name, season: se.season, n: ep.number, state: ep.state, files };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--stats')) {
    let n = 0, changed = 0, lighter = 0, droppedWrong = 0, saved = 0, withBackup = 0;
    for (const x of episodes()) {
      const r = rankEpisode(x.ep); if (!r.length) continue; n++;
      if (r.length > 1) withBackup++;
      droppedWrong += (x.ep.alternates || []).filter((a) => a && !SAME_EP.test(a.why || '')).length;
      if (r[0].url !== x.ep.file.url) { changed++; const was = describe(x.ep.file, x.ep.file.conf); if (r[0].mbps && was.mbps && r[0].mbps < was.mbps) { lighter++; saved += was.mbps - r[0].mbps; } }
    }
    console.log(JSON.stringify({ episodes: n, firstChoiceChanges: changed, lighterFirstChoice: lighter, avgMbpsSavedWhenLighter: lighter ? Math.round(saved / lighter * 100) / 100 : 0, episodesWithSameEpisodeBackup: withBackup, unreliableBackupsDropped: droppedWrong }, null, 1));
  }
  if (args.includes('--lab')) {
    const all = [...episodes()];
    const pick = new Map();
    const add = (x, why) => { const e = toLab(x); if (e.files.length && !pick.has(e.id)) pick.set(e.id, Object.assign(e, { why })); };
    // A deliberate spread of the situations that hurt viewers.
    all.filter((x) => x.show.slug === 'marco-polo').slice(0, 4).forEach((x) => add(x, 'Reported: freezes and drifts out of sync'));
    all.filter((x) => x.show.slug === 'baywatch').slice(0, 2).forEach((x) => add(x, 'Heavy remaster picked over a light original'));
    all.filter((x) => x.ep.file.sizeMB && x.ep.file.seconds && x.ep.file.sizeMB * 8 / x.ep.file.seconds > 8).sort((a, b) => b.ep.file.sizeMB / b.ep.file.seconds - a.ep.file.sizeMB / a.ep.file.seconds).slice(0, 4).forEach((x) => add(x, 'Very high bitrate (over 8 Mbps)'));
    all.filter((x) => rankEpisode(x.ep).length >= 3).slice(0, 4).forEach((x) => add(x, 'Has two or more same-episode backups'));
    all.filter((x) => x.ep.file.format === 'Matroska').slice(0, 2).forEach((x) => add(x, 'Matroska (Chromium/Edge only)'));
    all.filter((x) => x.ep.file.format === 'Ogg Video').slice(0, 2).forEach((x) => add(x, 'Ogg Theora (no Safari / iPhone)'));
    all.filter((x) => x.ep.file.format === 'MPEG4' && x.ep.file.playable).slice(0, 3).forEach((x) => add(x, 'MP4 original of unknown codec'));
    all.filter((x) => /self-listed/.test(x.ep.file.why || '')).filter((_, i) => i % 997 === 0).slice(0, 4).forEach((x) => add(x, 'Self-listed (no TVmaze)'));
    ['cheers', '30-rock', 'the-twilight-zone', 'i-love-lucy', 'twin-peaks'].forEach((sl) => all.filter((x) => x.show.slug === sl).slice(0, 2).forEach((x) => add(x, 'Popular classic, control case')));
    const out = path.join(__dirname, '..', 'lab', 'episodes.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify([...pick.values()], null, 1));
    console.log(pick.size, 'lab episodes ->', path.relative(ROOT, out));
  }
}

module.exports = { rankEpisode, epCode, describe };
