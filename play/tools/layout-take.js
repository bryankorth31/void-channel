// VoidTV PLAY: a layout set on a phone, put into the file every player gets. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 24 Nov 2026: "recreate the layout mover I can operate on this iPhone so I can choose the correct spacing".
// The mover on the phone (pad.html?move=1, src/padmove.js) keeps his layout on that phone and hands him a text that
// starts "VOIDTV PAD LAYOUT". A phone cannot write this PC's files, so that text is brought here:
//
//   node play/tools/layout-take.js "VOIDTV PAD LAYOUT {...}"      the text as one argument
//   node play/tools/layout-take.js < text.txt                     or on standard input (a whole message will do)
//   node play/tools/layout-take.js --look "VOIDTV PAD LAYOUT {...}"   say what would change, write nothing
//
// It writes play/layouts.json: each pad and way of holding the phone that the text holds replaces the file's; the rest
// of the file stays. Only what src/padlayout.js clean() lets through is written. Players get it after the next push.
// Nothing here needs AI to run (HQ manual mode).
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../src/padlayout.js');
const M = require('../src/padmove.js');
const FILE = process.env.PLAY_LAYOUTS || path.join(__dirname, '..', 'layouts.json');   // PLAY_LAYOUTS: another file, for a trial

// Pure (tested): the file with the sent layouts laid into it, and what changed, in words.
function take(file, text) {
  const sent = M.read(text);
  if (!sent) return { error: 'No layout found. The text starts with "' + M.MARK + '" and holds one pair of braces.' };
  const before = L.clean(file), after = L.merge(before, sent), changes = [];
  for (const pad of L.PADS) for (const way of L.WAYS) {
    const a = before[pad] && before[pad][way], b = after[pad] && after[pad][way];
    if (JSON.stringify(a || null) === JSON.stringify(b || null)) continue;
    const moved = b ? Object.keys(b.parts).filter((id) => !a || JSON.stringify(a.parts[id]) !== JSON.stringify(b.parts[id])) : [];
    changes.push(pad + ', ' + (way === 'side' ? 'sideways' : 'upright') + ': ' + (a ? moved.length + ' of ' + Object.keys(b.parts).length + ' parts changed (' + moved.join(', ') + ')' : 'a new layout of ' + Object.keys(b.parts).length + ' parts'));
  }
  return { file: after, changes };
}

module.exports = { take };
if (require.main === module) {
  const args = process.argv.slice(2), look = args.includes('--look'), given = args.filter((a) => a !== '--look').join(' ');
  const text = given || fs.readFileSync(0, 'utf8');
  let file = {}; try { file = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { /* none yet */ }
  const r = take(file, text);
  if (r.error) { console.error(r.error); process.exit(1); }
  if (!r.changes.length) { console.log('Nothing to change: the file already holds this layout.'); process.exit(0); }
  for (const c of r.changes) console.log(c);
  if (look) { console.log('Looked only: nothing written.'); process.exit(0); }
  fs.writeFileSync(FILE, JSON.stringify(r.file, null, 2) + '\n');
  console.log('Written to ' + path.relative(process.cwd(), FILE) + '. Players get it after the next push.');
}
