// Void Village (PLAN-void-village T5): the task rules, and the places build.
// Run: node --test scripts/test/village.test.js
const test = require('node:test');
const assert = require('node:assert');
const T = require('../lib/village/tasks');
const W = require('../lib/village/world');

const task = T.TASKS['tidy-room'];

test('tidying the room: pick a thing, tap where it lives, and it goes home; the bed is made with one tap', () => {
  let st = T.fresh(), r;
  r = T.tap(task, st, 'book1'); assert.strictEqual(r.lift, 'book1'); st = r.state;
  r = T.tap(task, st, 'shelf'); assert.deepStrictEqual(r.move, { item: 'book1', to: task.steps[0].to }); st = r.state;
  for (const [item, home] of [['book2', 'shelf'], ['book3', 'shelf'], ['ball', 'toybox']]) { st = T.tap(task, st, item).state; st = T.tap(task, st, home).state; }
  r = T.tap(task, st, 'bed'); assert.strictEqual(r.swap, 'bed'); assert.ok(r.finished); assert.ok(T.isDone(task, r.state));
});

test('a wrong place is a first try: it says where the thing lives and shows it, and nothing is lost', () => {
  let st = T.tap(task, T.fresh(), 'ball').state;
  const r = T.tap(task, st, 'shelf');
  assert.strictEqual(r.glow, 'toybox'); assert.match(r.say, /toy box/); assert.strictEqual(r.state.holding, 'ball'); assert.ok(!r.state.done.ball);
  st = T.tap(task, r.state, 'toybox').state; assert.ok(st.done.ball);
});

test('changing your mind is fine: tap another thing and you are holding that one', () => {
  const st = T.tap(task, T.fresh(), 'book1').state;
  const r = T.tap(task, st, 'ball'); assert.strictEqual(r.state.holding, 'ball'); assert.strictEqual(r.drop, 'book1');
});

test('the tap never changes the state it was given, and a tidy room stays tidy (never gets worse)', () => {
  const st = T.fresh(); const before = JSON.stringify(st);
  T.tap(task, st, 'book1'); assert.strictEqual(JSON.stringify(st), before);
  const saved = { done: { book1: true, ball: true, nonsense: true }, holding: 'book2' };
  const r = T.restore(task, saved); assert.deepStrictEqual(r.done, { book1: true, ball: true }); assert.strictEqual(r.holding, null);
  const after = T.tap(task, r, 'desk'); assert.deepStrictEqual(after.state.done, r.done);
});

test('no points, prizes or hurry words in anything the village says', () => {
  const words = T.lines().join(' ').toLowerCase();
  for (const bad of ['point', 'coin', 'prize', 'reward', 'level', 'streak', 'hurry', 'wrong', 'fail', 'lose']) assert.ok(!new RegExp('\\b' + bad + 's?\\b').test(words), bad);
  assert.ok(!/\u2014/.test(words));
});

test('every task step points at things that exist in its place', () => {
  for (const t of Object.values(T.TASKS)) {
    const ids = new Set(W.PLACES[t.place].things().map((x) => x.id));
    for (const s of t.steps) for (const id of [s.item, s.home, s.tap, ...(s.show || []), ...(s.hide || [])].filter(Boolean)) assert.ok(ids.has(id), t.id + ': ' + id);
  }
});

test('washing hands goes in the CDC order: wet, tap off, soap, scrub, rinse, tap off, dry; out of order is a first try', () => {
  const w = T.TASKS['wash-hands'];
  assert.deepStrictEqual(w.steps.map((s) => s.tap), ['faucet', 'faucet', 'soap', 'hands', 'faucet', 'faucet', 'towel']);
  let st = T.fresh(), r = T.tap(w, st, 'soap');
  assert.strictEqual(r.glow, 'faucet'); assert.match(r.say, /^Not that one yet/); assert.deepStrictEqual(r.state.done, {});
  r = T.tap(w, st, 'faucet'); assert.deepStrictEqual(r.show, ['stream']); st = r.state;
  for (const id of ['faucet', 'soap', 'hands', 'faucet', 'faucet']) st = T.tap(w, st, id).state;
  r = T.tap(w, st, 'towel'); assert.ok(r.finished); assert.match(r.say, /Clean hands/);
  assert.match(w.steps[3].done, /20/); assert.match(w.steps[3].done, /between your fingers/);
});

test('brushing teeth follows the ADA advice: a pea-sized blob, gentle circles, spit it out, a grown-up helps until about 6', () => {
  const b = T.TASKS['brush-teeth'];
  assert.deepStrictEqual(b.steps.map((s) => s.tap), ['brushcup', 'paste', 'smile', 'smile', 'smile', 'vanity', 'faucet', 'faucet', 'cup']);
  const all = JSON.stringify(b);
  for (const must of [/pea/, /circles/, /Spit it out/, /two times a day/, /about 6/]) assert.match(all, must);
  assert.doesNotMatch(all, /rinse your mouth/i);
  let st = T.fresh(); for (const s of b.steps.slice(0, -1)) st = T.tap(b, st, s.tap).state;
  const r = T.tap(b, st, 'cup'); assert.ok(r.finished); assert.deepStrictEqual(r.show, ['brushcup']);
  assert.match(T.tap(b, T.fresh(), 'brushcup2').say, /own/);
});

test('where food comes from: four from plants, four from animals, each with a true one-line fact; a wrong basket says why', () => {
  const f = T.TASKS['food-from'];
  const by = { plants: [], animals: [] }; for (const s of f.steps) by[s.home].push(s.item);
  assert.deepStrictEqual(by.plants.sort(), ['apple', 'bread', 'carrot', 'pasta']); assert.deepStrictEqual(by.animals.sort(), ['cheese', 'egg', 'honey', 'milk']);
  let st = T.tap(f, T.fresh(), 'cheese').state; const r = T.tap(f, st, 'plants');
  assert.match(r.say, /milk comes from cows/); assert.strictEqual(r.glow, 'animals');
  st = T.fresh(); const spots = [];
  for (const s of f.steps) { st = T.tap(f, st, s.item).state; const m = T.tap(f, st, s.home); spots.push(m.move.to.join()); st = m.state; }
  assert.strictEqual(new Set(spots).size, spots.length, 'every food gets its own spot in its basket');
  assert.ok(T.isDone(f, st));
});

test('each home place holds its tasks', () => {
  assert.deepStrictEqual(W.PLACES.kitchen.tasks, ['wash-hands', 'food-from', 'sandwich', 'set-table', 'groceries']);
  assert.deepStrictEqual(W.PLACES.room.tasks, ['tidy-room', 'dress-weather', 'pack-bag']);
  assert.deepStrictEqual(W.PLACES.bathroom.tasks, ['brush-teeth', 'wash-face', 'tidy-bath']);
});

const run = (task, pairs) => { let st = T.fresh(), r; for (const [a, b] of pairs) { r = T.tap(task, st, a); st = r.state; if (b) { r = T.tap(task, st, b); st = r.state; } } return { st, r }; };
test('setting the table: fork left of the plate, knife then spoon right, cup above the knife; a wrong spot says where it goes', () => {
  const k = T.TASKS['set-table'], at = (id) => k.steps.find((s) => s.id === id).to;
  assert.ok(at('fork')[0] < at('plate')[0] && at('knife')[0] > at('plate')[0] + 1 && at('spoon')[0] > at('knife')[0]);
  assert.ok(Math.abs(at('cup')[0] - at('knife')[0]) < 0.2 && at('cup')[2] < at('knife')[2]);
  let st = T.tap(k, T.fresh(), 'tfork').state; const r = T.tap(k, st, 'spotknife'); assert.match(r.say, /fork goes on the left/); assert.strictEqual(r.glow, 'spotfork');
  const { r: end } = run(k, [['tplate', 'spotplate'], ['tfork', 'spotfork'], ['tknife', 'spotknife'], ['tspoon', 'spotspoon'], ['tcup', 'spotcup']]); assert.ok(end.finished);
});
test('putting the shopping away: milk, eggs and cheese in the fridge; pasta, cereal and the can in the cupboard', () => {
  const g = T.TASKS.groceries;
  for (const s of g.steps) assert.strictEqual(s.home, /milk|eggs|cheese/.test(s.id) ? 'fridge' : 'pantry', s.id);
  assert.match(T.tap(g, T.tap(g, T.fresh(), 'gmilk').state, 'pantry').say, /fridge/);
  assert.ok(run(g, g.steps.map((s) => [s.item, s.home])).r.finished);
});
test('dressing for the weather: rain at the window; the sun hat and sandals say why not today; coat, boots and umbrella go on you', () => {
  const d = T.TASKS['dress-weather'];
  assert.deepStrictEqual(d.setup.show, ['rain']);
  for (const x of d.decoys) { const r = T.tap(d, T.fresh(), x); assert.match(r.say, /sunny/); assert.deepStrictEqual(r.state.done, {}); }
  for (const s of d.steps) assert.strictEqual(s.home, 'me');
  assert.ok(run(d, d.steps.map((s) => [s.item, 'me'])).r.finished);
});
test('packing the backpack: the toy car stays home; it zips only once everything is in', () => {
  const p = T.TASKS['pack-bag'];
  assert.match(T.tap(p, T.fresh(), 'toycar').say, /toys stay home/);
  assert.match(T.tap(p, T.fresh(), 'backpack').say, /First, put everything/);
  const { st, r } = run(p, [['folder', 'backpack'], ['pencils', 'backpack'], ['lunch', 'backpack'], ['bottle', 'backpack']]);
  assert.match(r.say, /Zip it up/); const z = T.tap(p, st, 'backpack'); assert.ok(z.finished); assert.strictEqual(z.swap, 'backpack');
});
test('washing your face: warm water, not hot; face wash on your fingertips; rinse; pat dry', () => {
  const f = T.TASKS['wash-face'];
  assert.deepStrictEqual(f.steps.map((s) => s.tap), ['faucet', 'smile', 'facewash', 'smile', 'faucet', 'towel']);
  assert.match(f.steps[0].done, /not hot/); assert.match(f.steps[2].done, /fingertips/); assert.match(f.steps[5].done, /Pat/);
  assert.match(T.tap(f, T.fresh(), 'towel').say, /^Not that one yet/);
});
test('tidying the bathroom: towel hung up, clothes in the basket, the wet floor wiped, then the light goes off last', () => {
  const b = T.TASKS['tidy-bath'];
  assert.match(T.tap(b, T.fresh(), 'switch').say, /First, tidy everything up/);
  const { st, r } = run(b, [['floortowel', 'bar'], ['clothes', 'hamper'], ['puddle']]);
  assert.match(r.say, /slippery.*Tap the light switch/);
  const end = T.tap(b, st, 'switch'); assert.ok(end.finished); assert.strictEqual(end.swap, 'switch');
});
test('every line the village can say has a voice line key (lines() covers the new tasks)', () => {
  const L = new Set(T.lines());
  for (const t of ['set-table', 'groceries', 'dress-weather', 'pack-bag', 'wash-face', 'tidy-bath']) { const k = T.TASKS[t]; for (const x of [k.start, k.finish, k.real]) assert.ok(L.has(x), x); }
  for (const x of ['First, put everything you need in the backpack.', 'Water bottle in. Sips of water help you feel good all day. Everything is in. Zip it up: tap the backpack.', 'Wiped up. Water on the floor is slippery, so wipe it up right away. All tidy. Last thing: turn off the light when you leave. Tap the light switch.', T.NAMES.sunhat]) assert.ok(L.has(x), x);
});

test('making a sandwich: in order, the lettuce is rinsed before it goes on, and the butter goes back in the fridge', () => {
  const m = T.TASKS.sandwich;
  const taps = m.steps.map((s) => s.tap);
  assert.ok(taps.indexOf('faucet') > taps.indexOf('lettuce') && m.steps.find((s) => (s.show || []).includes('leaf')).id === 'off', 'the leaf goes on only after rinsing');
  assert.strictEqual(m.steps[m.steps.length - 1].tap, 'fridge');
  assert.match(JSON.stringify(m), /not sharp/);
  let st = T.fresh(); for (const s of m.steps.slice(0, -1)) st = T.tap(m, st, s.tap).state;
  assert.ok(T.tap(m, st, 'fridge').finished);
});

test('growing a bean: dig, seed, cover, water, then days pass; the weed is pulled; facts match the extension services', () => {
  const g = T.TASKS['grow-bean'];
  assert.deepStrictEqual(g.steps.map((s) => s.tap), ['trowel', 'seeds', 'trowel', 'can', 'sun', 'weed', 'can', 'sun', 'sun', 'sun']);
  const all = JSON.stringify(g);
  for (const must of [/one inch deep/, /one or two weeks/i, /two months/]) assert.match(all, must);
  let st = T.fresh(); for (const s of g.steps.slice(0, -1)) st = T.tap(g, st, s.tap).state;
  const r = T.tap(g, st, 'sun'); assert.ok(r.finished); assert.deepStrictEqual(r.show, ['pods']);
  assert.match(T.tap(g, T.fresh(), 'sun').say, /^Not that one yet/);
});

test('the workshop: safety glasses come first, then each job takes its own tool; the wrong tool says what it is for', () => {
  const f = T.TASKS['fix-it'];
  let r = T.tap(f, T.fresh(), 'hammer'); assert.match(r.say, /safety glasses/i); assert.strictEqual(r.glow, 'goggles'); assert.deepStrictEqual(r.state.done, {});
  r = T.tap(f, r.state, 'goggles'); assert.ok(r.state.done.goggles); assert.deepStrictEqual(r.hide, ['goggles']);
  let st = T.tap(f, r.state, 'hammer').state; r = T.tap(f, st, 'chair');
  assert.match(r.say, /hammer is for nails/); assert.strictEqual(r.glow, 'plank');
  r = T.tap(f, r.state, 'plank'); assert.deepStrictEqual(r.show, ['naildown']); assert.deepStrictEqual(r.hide, ['nailup']);
  st = r.state; for (const [tool, job] of [['screwdriver', 'chair'], ['tape', 'board'], ['wrench', 'wagon']]) { st = T.tap(f, st, tool).state; r = T.tap(f, st, job); st = r.state; }
  assert.ok(r.finished); assert.match(JSON.stringify(f), /righty tighty/); assert.match(JSON.stringify(f), /grown-up/);
});

test('the street: every door is a thing you can tap and leads to a real place; crossing the road means looking both ways', () => {
  const st = W.PLACES.street, ids = new Set(st.things().map((t) => t.id));
  assert.ok(st.hub); assert.ok(ids.has('walker'));
  for (const [id, d] of Object.entries(st.doors)) { assert.ok(ids.has(id), id); assert.ok(W.PLACES[d.place], d.place); assert.ok(['N', 'S', 'W', 'E'].includes(d.edge), id); }
  assert.ok(T.STREET_LINES.some((l) => /Look left, look right, and look left again/.test(l)));
  assert.ok(T.lines().includes(T.STREET_LINES[1]) && T.lines().includes(T.STREET_LINES[2]));
});

test('the town: a crossroads with four corners; every door opens onto the sidewalk of its edge, in the right corner, on the map', () => {
  const st = W.PLACES.street, T0 = st.town, things = Object.fromEntries(st.things().map((t) => [t.id, t]));
  assert.ok(T0 && T0.w >= 60 && T0.d >= 50, 'a town, not a strip');
  const corners = new Set();
  for (const [id, d] of Object.entries(st.doors)) {
    const [x, z] = d.at; assert.ok(x > 0 && x < T0.w && z > 0 && z < T0.d, id + ' on the map');
    const q = (x < 31.5 ? 'W' : 'E') + (z < 24.5 ? 'N' : 'S'); corners.add(q);
    if (d.edge === 'N') assert.ok(z < T0.walk.N && T0.walk.N - z < 3, id); if (d.edge === 'S') assert.ok(z > T0.walk.S && z - T0.walk.S < 3, id);
    if (d.edge === 'W') assert.ok(x < T0.walk.W && T0.walk.W - x < 3, id); if (d.edge === 'E') assert.ok(x > T0.walk.E && x - T0.walk.E < 3, id);
    assert.ok(things[id], id);
  }
  assert.equal(corners.size, 4, 'places on all four corners');
  // every walk, from the start and from every door to every door: straight lines along sidewalks, roads crossed only at
  // the crosswalks (corner to corner), and a stop at the curb with the look-both-ways line before each crossing
  const W0 = T0.walk, onRoad = (x, z) => (z > T0.ew[0] && z < T0.ew[1] + 1) || (x > T0.ns[0] && x < T0.ns[1] + 1);
  const starts = [[5, W0.N], ...Object.values(st.doors).map((d) => T.onWalk(T0, d))];
  for (const s of starts) for (const [id, d] of Object.entries(st.doors)) {
    const r = T.townRoute(T0, s, d); let p = s, crossings = 0;
    for (const pt of r) {
      assert.ok(pt[0] === p[0] || pt[1] === p[1], id + ': a straight step from ' + p + ' to ' + pt);
      const mid = [(p[0] + pt[0]) / 2, (p[1] + pt[1]) / 2];
      if (onRoad(mid[0], mid[1])) { crossings++; assert.ok(p[2] === T.STREET_LINES[1] || p[2] === T.STREET_LINES[2], id + ': crossed at ' + mid + ' without stopping to look'); }
      p = pt;
    }
    assert.deepEqual(r[r.length - 1], d.at, id + ': ends at the door');
    assert.ok(crossings <= 2);
  }
  // nothing is built on a road
  for (const t of st.things()) if (t.id !== 'walker' && t.id !== 'busstop') { const [x, , z] = t.at; assert.ok(!(z >= 24 && z < 26) && !(x >= 31 && x < 33), t.id + ' off the road'); }
});

test('the market: what is on the list goes in the basket, candy and toys are wants, then pay and count the change (10 take away 6 is 4)', () => {
  const m = T.TASKS['shop-list'];
  let r = T.tap(m, T.fresh(), 'register'); assert.match(r.say, /First, find everything on your list/); assert.deepStrictEqual(r.state.done, {});
  assert.match(T.tap(m, T.fresh(), 'candy').say, /want, not a need/);
  let st = T.fresh(); for (const id of ['bread', 'apples', 'milk']) { st = T.tap(m, st, id).state; r = T.tap(m, st, 'basket'); st = r.state; }
  assert.match(r.say, /Tap the register/);
  assert.match(T.tap(m, st, 'bill').say, /^Not that one yet/);
  st = T.tap(m, st, 'register').state; r = T.tap(m, st, 'bill');
  assert.ok(r.finished); assert.match(r.say, /10 take away 6 is 4/);
  const prices = { bread: 2, apples: 3, milk: 1 }; let sum = 0; for (const s of m.steps.filter((x) => !x.after)) sum += prices[s.id];
  assert.strictEqual(sum, 6); assert.match(m.steps.find((s) => s.id === 'pay').done, /6 dollars/);
});

test('the fire station: emergencies go to Call 9-1-1, a lost toy and a hard puzzle to Ask a grown-up; then a pretend 9-1-1; the fire escape follows the fire service order', () => {
  const c = T.TASKS['call-help'];
  for (const s of c.steps.filter((x) => !x.after)) assert.strictEqual(s.home, /fire|hurt/.test(s.id) ? 'callbin' : 'grownbin', s.id);
  assert.deepStrictEqual(c.steps.filter((x) => x.after).map((x) => x.item), ['k9', 'k1', 'k1']);
  assert.match(T.tap(c, T.fresh(), 'k9').say, /sort all the picture cards/);
  assert.match(JSON.stringify(c), /pretend phone/); assert.match(c.finish, /Never call it to play/);
  const f = T.TASKS['fire-escape'];
  assert.deepStrictEqual(f.steps.map((s) => s.tap), ['alarm', 'crawl', 'door', 'meet', 'phone']);
  for (const must of [/Get low and go/, /meeting place/, /from outside/, /firefighter says it is safe/, /every month/]) assert.match(JSON.stringify(f), must);
  assert.deepStrictEqual(W.PLACES.station.tasks, ['call-help', 'fire-escape']);
  assert.ok(W.PLACES.street.doors.firehouse);
});

test('the library: check a claim in the right book; tell a story or teaching from something trying to sell', () => {
  const c = T.TASKS['check-it'];
  const books = { spider: 'bugbook', sunstar: 'spacebook', penguin: 'birdbook', bat: 'animalbook' };
  for (const s of c.steps) assert.strictEqual(s.home, books[s.id], s.id);
  assert.match(c.steps.find((s) => s.id === 'penguin').done, /Not true/); assert.match(c.steps.find((s) => s.id === 'bat').done, /mammals/);
  let st = T.tap(c, T.fresh(), 'spider').state; const r = T.tap(c, st, 'spacebook'); assert.strictEqual(r.glow, 'bugbook');
  const w = T.TASKS['who-made'];
  for (const s of w.steps) assert.strictEqual(s.home, /cereal|tvad/.test(s.id) ? 'sellbin' : 'storybin', s.id);
  assert.deepStrictEqual(W.PLACES.library.tasks, ['check-it', 'who-made']); assert.ok(W.PLACES.street.doors.libraryhouse);
});

test('the post office and the park: a letter addressed the postal way, what is OK to share, five park neighbors', () => {
  const l = T.TASKS.letter;
  assert.deepStrictEqual(l.steps.map((s) => s.tap), ['paper', 'pencil', 'envelope', 'letter', 'stamps', 'mailbox']);
  assert.match(JSON.stringify(l), /middle/); assert.match(JSON.stringify(l), /top left corner/); assert.match(JSON.stringify(l), /top right corner/);
  const sh = T.TASKS['share-safe'];
  for (const s of sh.steps) assert.strictEqual(s.home, /homeaddr|password/.test(s.id) ? 'askbin' : 'okbin', s.id);
  const p = T.TASKS['who-lives'];
  let st = T.fresh(), r; for (const s of p.steps) { r = T.tap(p, st, s.item); st = r.state; }
  assert.ok(r.finished); assert.match(T.tap(p, T.fresh(), 'pond2').say, /Stay back from the edge/);
  assert.ok(W.PLACES.street.doors.posthouse && W.PLACES.street.doors.parkgate);
});

test('the repair cafe and the town square: sew a button, pump a tire the bike shop way, five kindnesses', () => {
  const sb = T.TASKS['sew-button']; assert.deepStrictEqual(sb.steps.map((s) => s.tap), ['spool', 'button', 'needle', 'scissors']); assert.match(JSON.stringify(sb), /grown-up snips/);
  const pt = T.TASKS['pump-tire']; assert.deepStrictEqual(pt.steps.map((s) => s.tap), ['cap', 'pump', 'pump', 'pump', 'tirefull', 'valve']); assert.match(JSON.stringify(pt), /printed on the side of the tire/);
  const gn = T.TASKS['good-neighbor']; let st = T.fresh(), r; for (const s of gn.steps) { r = T.tap(gn, st, s.item); st = r.state; } assert.ok(r.finished);
  assert.match(JSON.stringify(gn), /ask first/i);
  assert.ok(W.PLACES.street.doors.cafehouse && W.PLACES.street.doors.squaregate);
});

// Bryan, 17 Nov 2026: "There's just not enough detail ... make them bigger so we can make the pieces more accurate".
// Every thing a task asks a child to find, tap or move is drawn fine enough to recognize: its cubes are at most 1/14 of a
// block (the new scale is 1/32), unless it is big furniture (2 blocks or more across) that no one can miss.
// The places listed here have been moved to the new scale; the list grows until it is every place.
const DETAILED = ['bathroom', 'yard', 'room', 'kitchen', 'shop', 'market', 'station', 'library', 'post', 'park', 'cafe', 'square', 'school', 'busstop', 'clinic', 'bakery', 'farmstand', 'pethouse', 'laundry'];
test('the things children look for are drawn in fine detail (new scale): ' + DETAILED.join(', '), () => {
  for (const pid of DETAILED) {
    const place = W.PLACES[pid], defs = Object.fromEntries(place.things().map((t) => [t.id, t]));
    for (const tid of place.tasks || [place.task]) {
      const ids = new Set(); for (const s of T.TASKS[tid].steps) for (const k of ['tap', 'item', 'home']) if (s[k]) ids.add(s[k]); for (const s of T.TASKS[tid].steps) for (const k of s.show || []) ids.add(k);
      for (const id of ids) {
        const d = defs[id]; assert.ok(d, pid + ': ' + id + ' exists');
        const raw = W.MODELS[d.model](d.opts || {}), cube = (d.scale || 1) / (raw.res || 8);
        let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const v of raw) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], v[i]); hi[i] = Math.max(hi[i], v[i] + 1); }
        const across = Math.max(...hi.map((h, i) => (h - lo[i]) * cube));
        assert.ok(cube <= 1 / 14 || across >= 2, pid + ': ' + id + ' (' + d.model + ') is drawn too coarse: cubes of ' + cube.toFixed(3) + ' block, ' + across.toFixed(2) + ' blocks across');
      }
    }
  }
});

test('the school and its bus stop: both open from the town, and both tasks play through (NHTSA bus advice)', () => {
  const st = W.PLACES.street; assert.equal(st.doors.school.place, 'school'); assert.equal(st.doors.busstop.place, 'busstop');
  for (const id of ['bus-stop', 'ready-class']) {
    const k = T.TASKS[id]; let s = T.fresh(), r;
    for (const x of k.steps) { r = T.tap(k, s, k.kind === 'order' ? x.tap : x.item); s = r.state; if (x.kind === 'move') { r = T.tap(k, s, x.home); s = r.state; } }
    assert.ok(r.finished, id);
    for (const l of [k.start, k.finish, k.real]) assert.ok(T.lines().includes(l));
  }
  const bus = JSON.stringify(T.TASKS['bus-stop']); assert.match(bus, /three giant steps/i); assert.match(bus, /driver/); assert.match(bus, /never reach/i);
  // sitting down waits until everything is put away
  const rc = T.TASKS['ready-class']; assert.equal(T.tap(rc, T.fresh(), 'mydesk').say, rc.notYet);
});

test('the clinic: a small cut (Mayo Clinic first aid) and a checkup, both play through; the clinic opens from the town', () => {
  assert.equal(W.PLACES.street.doors.clinic.place, 'clinic');
  for (const id of ['small-cut', 'checkup']) { const k = T.TASKS[id]; let s = T.fresh(), r; for (const x of k.steps) { r = T.tap(k, s, x.tap); s = r.state; } assert.ok(r.finished, id); }
  const cut = T.TASKS['small-cut'].steps.map((s) => s.id); assert.deepEqual(cut, ['tell', 'wash', 'press', 'rinse', 'cover']); // a grown-up first, clean hands before the cut
  assert.match(JSON.stringify(T.TASKS['small-cut']), /not in it/); assert.match(T.TASKS['small-cut'].real, /doctor/);
});

test('the bakery: bake muffins (no tasting raw batter; the grown-up runs the oven) and share eight cookies fairly, two each', () => {
  assert.equal(W.PLACES.street.doors.bakery.place, 'bakery');
  for (const id of ['bake-muffins', 'share-fair']) { const k = T.TASKS[id]; let s = T.fresh(), r; for (const x of k.steps) { r = T.tap(k, s, x.tap); s = r.state; } assert.ok(r.finished, id); }
  const b = JSON.stringify(T.TASKS['bake-muffins']); assert.match(b, /Raw batter/); assert.match(T.TASKS['bake-muffins'].steps.find((s) => s.id === 'oven').ask, /baker/);
  const share = T.TASKS['share-fair'].steps; const per = {}; for (const s of share) per[s.tap] = (per[s.tap] || 0) + 1;
  assert.deepEqual(Object.values(per), [2, 2, 2, 2]); // fair: two each
  const things = new Set(W.PLACES.bakery.things().map((t) => t.id)); for (const s of share) for (const c of s.show) assert.ok(things.has(c), c);
});

test('the farm stand: sort foods by the part of the plant (roots, leaves, fruits with seeds) and wash fresh food (FDA: running water, no soap)', () => {
  assert.equal(W.PLACES.street.doors.farmstand.place, 'farmstand');
  const pp = T.TASKS['plant-parts']; let s = T.fresh(), r; for (const x of pp.steps) { r = T.tap(pp, s, x.item); s = r.state; r = T.tap(pp, s, x.home); s = r.state; } assert.ok(r.finished);
  const where = Object.fromEntries(pp.steps.map((x) => [x.item, x.home])); assert.equal(where.carrot, 'rootbin'); assert.equal(where.cabbage, 'leafbin'); assert.equal(where.tomato, 'fruitbin');
  const wp = T.TASKS['wash-produce']; s = T.fresh(); for (const x of wp.steps) { r = T.tap(wp, s, x.tap); s = r.state; } assert.ok(r.finished); assert.match(JSON.stringify(wp), /No soap/);
});

test('the neighbors on Home Lane: help with the dog (ask first, AVMA), sort the laundry and match the socks; both houses open from the town', () => {
  const d = W.PLACES.street.doors; assert.equal(d.house3.place, 'pethouse'); assert.equal(d.house4.place, 'laundry');
  const pc = T.TASKS['pet-care']; let s = T.fresh(), r; for (const x of pc.steps) { r = T.tap(pc, s, x.tap); s = r.state; } assert.ok(r.finished);
  assert.equal(pc.steps[0].tap, 'neighbor2'); assert.equal(pc.steps[1].tap, 'dog'); // ask the owner before petting
  for (const id of ['sort-laundry', 'match-socks']) { const k = T.TASKS[id]; s = T.fresh(); for (const x of k.steps) { r = T.tap(k, s, x.item); s = r.state; if (x.kind === 'move') { r = T.tap(k, s, x.home); s = r.state; } } assert.ok(r.finished, id); }
  const sl = T.TASKS['sort-laundry']; assert.equal(T.tap(sl, T.fresh(), 'washer').say, sl.notYet);
});

test('the feelings corner at the school: notice, name the feeling (a first try says what that face means), the turtle, ask first, help', () => {
  const k = T.TASKS['big-feeling']; assert.deepEqual(W.PLACES.school.tasks, ['ready-class', 'big-feeling']);
  assert.deepEqual(k.steps.map((x) => x.tap), ['pal', 'facesad', 'turtle', 'pal', 'blocksdown', 'facehappy']);
  let s = T.fresh(), r = T.tap(k, s, 'pal'); s = r.state;
  r = T.tap(k, s, 'facemad'); assert.match(r.say, /^Mad is when/); assert.equal(r.glow, null); s = r.state;
  r = T.tap(k, s, 'facescared'); assert.equal(r.glow, 'facesad'); s = r.state; // after two tries the answer is shown
  for (const x of k.steps.slice(1)) { r = T.tap(k, s, x.tap); s = r.state; } assert.ok(r.finished);
  const lines = T.lines(); for (const n of Object.values(k.steps[1].not)) assert.ok(lines.includes(n + ' ' + k.steps[1].ask));
  const ids = new Set(W.PLACES.school.things().map((x) => x.id)); for (const x of ['pal', 'palhappy', 'blocksdown', 'towerup', 'turtle', 'facehappy', 'facesad', 'facemad', 'facescared']) assert.ok(ids.has(x), x);
});
