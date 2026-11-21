// PLAY AND LEARN engine cores (PLAN-kids-play P3): the rules of the four games with no page in them, so node tests can
// run them and the page (ui.js) only draws. build.js puts this file's text into the page as-is.
//   Listen and tap  round(pack, rand): one item to find among three, never the same answer twice in a row.
//   Match pairs     board(pack, pairs, rand): face-down cards, each item twice (its look and its pair look).
//   Sort it         sortQueue(pack, sort, n, rand): items from one sort, both bins represented.
//   Trace           strokes(def) -> points; traceMove(state, x, y) moves along the current stroke when the finger is near.
// A set is a few of these; after SETS_BEFORE_REST sets the page rests (gentle stopping, as in the player).

const SET_SIZE = { listen: 4, match: 1, sort: 6, trace: 3 };
const SETS_BEFORE_REST = 3;
const NEAR = 13;   // how close (in the 100-box) the finger must be to the line to move along it: forgiving for small hands
const START = 16;  // how close to the start dot a stroke must begin

// A small seeded random (mulberry32) so tests can repeat a game; the page seeds it from the clock.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(arr, rand) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Which packs fit which game (a pack lists its engines; trace needs trace entries, sort needs sorts).
function packsFor(packs, game) { return packs.filter((p) => p.engines.includes(game) && (game !== 'trace' || p.trace.length) && (game !== 'sort' || p.sorts.length)); }

// Listen and tap: a set of `n` rounds, each { answer, choices[3] }. Answers do not repeat within the set.
function listenSet(pack, n, rand) {
  const answers = shuffle(pack.items, rand).slice(0, n);
  return answers.map((answer) => ({ answer: answer.id, choices: shuffle([answer, ...shuffle(pack.items.filter((x) => x.id !== answer.id), rand).slice(0, 2)], rand).map((x) => x.id) }));
}

// Match pairs: `pairs` items, each as two cards: { key, item, face: 'show'|'pair' }, shuffled.
function board(pack, pairs, rand) {
  const items = shuffle(pack.items, rand).slice(0, pairs);
  return shuffle(items.flatMap((it) => [{ key: it.id + ':s', item: it.id, face: 'show' }, { key: it.id + ':p', item: it.id, face: 'pair' }]), rand);
}
// The match rule: two different cards of the same item.
function isMatch(a, b) { return !!a && !!b && a.key !== b.key && a.item === b.item; }

// Sort it: one sort, `n` items drawn so both bins appear; returns { sort: index, queue: [{ item, bin }] }.
function sortSet(pack, n, rand) {
  const si = Math.floor(rand() * pack.sorts.length), s = pack.sorts[si];
  const byBin = s.bins.map((_, b) => shuffle(Object.keys(s.items).filter((id) => s.items[id] === b), rand));
  const take = [];
  for (let i = 0; take.length < n && byBin.some((l) => l.length); i++) { const l = byBin[i % byBin.length]; if (l.length) take.push(l.shift()); }
  return { sort: si, queue: shuffle(take, rand).map((item) => ({ item, bin: s.items[item] })) };
}

// Trace: turn a stroke string into points about 2 units apart.
function strokePoints(def) {
  const t = def.trim().split(/\s+/), pts = [];
  const push = (x, y) => { const last = pts[pts.length - 1]; if (!last) { pts.push([x, y]); return; } const d = Math.hypot(x - last[0], y - last[1]), k = Math.max(1, Math.ceil(d / 2)); for (let i = 1; i <= k; i++) pts.push([last[0] + (x - last[0]) * i / k, last[1] + (y - last[1]) * i / k]); };
  for (let i = 0; i < t.length;) {
    const c = t[i];
    if (c === 'M' || c === 'L') { push(+t[i + 1], +t[i + 2]); i += 3; }
    else if (c === 'C') { const [cx, cy, rx, ry, a0, a1] = t.slice(i + 1, i + 7).map(Number); const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 5)); for (let s = 0; s <= steps; s++) { const a = (a0 + (a1 - a0) * s / steps) * Math.PI / 180; push(cx + rx * Math.cos(a), cy + ry * Math.sin(a)); } i += 7; }
    else throw new Error('stroke: unknown "' + c + '" in "' + def + '"');
  }
  return pts;
}
// Trace state: { strokes: [[x,y]...], s (current stroke), i (points done in it), on (finger down on the line) }.
function traceStart(def) { return { strokes: def.strokes.map(strokePoints), s: 0, i: 0, on: false, done: false }; }
// Finger down: it counts only near where the current stroke has reached (its start dot, or where the child lifted).
function traceDown(st, x, y) { if (st.done) return st; const p = st.strokes[st.s][st.i]; st.on = Math.hypot(x - p[0], y - p[1]) <= (st.i ? NEAR : START); return st; }
// Finger moves: walk forward along the stroke while the finger is near the next points (it may skip ahead a little,
// never backward); at the end of a stroke the next one starts at its own dot.
function traceMove(st, x, y) {
  if (st.done || !st.on) return st;
  const P = st.strokes[st.s];
  let best = -1;
  for (let k = st.i + 1; k < Math.min(P.length, st.i + 8); k++) if (Math.hypot(x - P[k][0], y - P[k][1]) <= NEAR) best = k;
  if (best > st.i) st.i = best;
  if (st.i >= P.length - 1) { st.s++; st.i = 0; st.on = false; if (st.s >= st.strokes.length) st.done = true; }
  return st;
}
function traceUp(st) { st.on = false; return st; }

// Gentle stopping: after this many finished sets in one visit, the page rests.
function shouldRest(setsDone) { return setsDone >= SETS_BEFORE_REST; }

// The voice: every spoken line is looked up by a short hash of its words, so the page and the clip maker agree
// without a list kept by hand (FNV-1a, 32 bits, hex).
function voiceKey(text) { let h = 2166136261; for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h.toString(16).padStart(8, '0'); }

module.exports = { SET_SIZE, SETS_BEFORE_REST, NEAR, START, rng, shuffle, packsFor, listenSet, board, isMatch, sortSet, strokePoints, traceStart, traceDown, traceMove, traceUp, shouldRest, voiceKey };
