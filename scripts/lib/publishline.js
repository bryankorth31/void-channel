// PUBLISH LINE: the words HQ shows about publishing (audit 19 Nov 2026, V1, H5 and H10). Two pure functions, no git and
// no files, so the tests can feed them every case. scripts/hq.js gathers the facts and the page shows the result as it is.
//
//   line(facts)        the standing line at the top of HQ: what waits on this PC, and whether Publish will hold
//   outcome(log, code) how one publish run ended, read from the dated line scripts/publish.js ends every run with
//
// The judge of what gets pushed is scripts/publish.js, never this file. A commit is publish's own when its subject starts
// with "Catalog: " (OWN below, the same test as OWN in publish.js; publish also looks at the commit's files, so a rare
// "Catalog:" commit that touches other files is counted as its own here and as another's there). Any other commit waiting
// on master makes publish commit the catalog and hold the push, which is the state Bryan could not see: the line said
// "nothing to publish" while 31 commits waited, and a failed git check read the same.
//
// Levels: 'ok' (nothing needs him), 'wait' (something is waiting or held), 'bad' (refused, failed, or not known).
const OWN = /^Catalog: /;

const n = (count, one, many) => count + ' ' + (count === 1 ? one : many || one + 's');

// subjects: the subject lines of the commits in origin/master..master, newest first.
function waiting(subjects) {
  const list = (subjects || []).filter(Boolean);
  const own = list.filter((s) => OWN.test(s)).length;
  return { own, others: list.length - own, subjects: list };
}

// facts: { site, error, dirty, own, others, head, last } where `last` is outcome() of the newest publish.log lines (or null).
function line(facts) {
  const f = facts || {};
  const site = f.site ? f.site + ': ' : '';
  if (f.error) {
    return {
      level: 'bad',
      text: site + 'could not read git',
      title: 'The git check failed, so HQ does not know what is waiting to be published (' + String(f.error).slice(0, 200) + '). '
        + 'Open Jobs, then publish.log; by hand, run git status in the project folder.',
    };
  }
  const own = +f.own || 0, others = +f.others || 0, dirty = +f.dirty || 0;
  const parts = [], tips = [];
  let level = 'ok';
  if (f.last && (f.last.kind === 'refused' || f.last.kind === 'failed')) {
    level = 'bad';
    parts.push(f.last.kind === 'refused' ? 'the last Publish was refused' : 'the last Publish failed');
    tips.push(f.last.text);
  }
  if (others) {
    if (level === 'ok') level = 'wait';
    parts.push(n(own + others, 'commit') + ' waiting, Publish is holding');
    tips.push(n(others, 'commit') + ' from other work ' + (others === 1 ? 'waits' : 'wait') + ' on this PC'
      + (own ? ', with ' + n(own, 'catalog commit') : '') + '. Publish commits the catalog and holds the push until they have gone. '
      + 'Push live tests them and sends them. Push with other commits (under More) sends them together with the catalog.');
  } else if (own) {
    if (level === 'ok') level = 'wait';
    parts.push(n(own, 'catalog commit') + ' waiting to go out');
    tips.push(n(own, 'catalog commit') + ' made on this PC ' + (own === 1 ? 'has' : 'have') + ' not reached GitHub. Publish now sends ' + (own === 1 ? 'it' : 'them') + '.');
  }
  if (dirty) {
    parts.push(n(dirty, 'unpublished file'));
    tips.push(n(dirty, 'catalog or doc file') + ' changed since the last publish. Publish now commits and sends ' + (dirty === 1 ? 'it' : 'them') + '.');
  }
  if (!parts.length) parts.push('nothing to publish');
  const head = f.head ? String(f.head) : '';
  return {
    level,
    text: site + parts.join(', ') + (head ? '. Last: ' + head : ''),
    title: (tips.length ? tips.join(' ') + ' ' : 'Nothing is waiting on this PC. ') + (head ? 'Last commit: ' + head : ''),
  };
}

// The dated lines publish.js writes: "<ISO time> [dry: ]<message>". Only these openings end a run.
const DATED = /^\d{4}-\d\d-\d\dT[\d:.]+Z (?:dry: )?(.*)$/;
const ENDS = [
  ['pushed', /^pushed (\S+): (.*)$/],
  ['held', /^held: (\d+) other commits? waiting/],
  ['refused', /^refused: (.*)$/],
  ['failed', /^FAILED: (.*)$/],
  ['nothing', /^nothing new$/],
  ['dry', /^would (?:push|commit) /],
];

// log: the text of a publish run (HQ's own job log) or the end of publish.log. code: the job's exit code when known.
// Returns null when the text holds no outcome line and no exit code was given.
function outcome(log, code) {
  let found = null;
  for (const raw of String(log || '').split('\n')) {
    const m = DATED.exec(raw.trim());
    if (!m) continue;
    for (const [kind, re] of ENDS) { const hit = re.exec(m[1]); if (hit) { found = { kind, hit, message: m[1] }; break; } }
  }
  if (!found) {
    if (code == null) return null;
    return code === 0
      ? { kind: 'unknown', level: 'wait', text: 'Publish ended without saying how. Open Jobs, then publish.log, and read the last dated line.' }
      : { kind: 'unknown', level: 'bad', text: 'Publish stopped early (exit ' + code + ') without saying why. Open Jobs, then publish.log, and read the last dated line.' };
  }
  const { kind, hit, message } = found;
  if (kind === 'pushed') return { kind, level: 'ok', text: 'Pushed ' + hit[1] + '. Cloudflare rebuilds the site in about a minute.', detail: message };
  if (kind === 'nothing') return { kind, level: 'ok', text: 'Nothing new to publish: the catalog and docs are as they were at the last publish.', detail: message };
  if (kind === 'dry') return { kind, level: 'ok', text: 'Dry run: nothing was committed or pushed.', detail: message };
  if (kind === 'held') {
    return {
      kind, level: 'wait', detail: message,
      text: 'Held. The catalog is committed on this PC and was not pushed, because ' + n(+hit[1], 'other commit') + ' ' + (+hit[1] === 1 ? 'waits' : 'wait')
        + ' here. Press Push live to test and send them, or Push with other commits (under More) to send them together with the catalog.',
    };
  }
  if (kind === 'refused') {
    const shrink = /^shrink: /.test(hit[1]);
    return {
      kind, level: 'bad', detail: message,
      text: 'Refused. Nothing was pushed: ' + hit[1].replace(/\s*\(run with --allow-shrink[^)]*\)/, '').slice(0, 300) + '.'
        + (shrink ? ' Find out what emptied the catalog first. Only when the drop is meant, press Publish anyway (shrink), under More.' : ' Fix what the line names, then press Publish now again.'),
    };
  }
  return { kind: 'failed', level: 'bad', detail: message, text: 'Failed: ' + hit[1].slice(0, 300) + '. The whole line is in Jobs, publish.log.' };
}

module.exports = { OWN, waiting, line, outcome };
