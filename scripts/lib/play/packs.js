// PLAY AND LEARN content packs (profiles/kids/docs/PLAN-kids-play.md, P4). Content is data: the four engines in
// engines.js read these and nothing else, so a new pack is a new entry here (later: editable in HQ).
//
// A pack: { id, name, say (spoken when it is picked), pairs (Match pairs board size; 3 when not set), tile (the picture on its button), engines (which games it fits),
//   items: [{ id, show (what is drawn: { art } or { text }), name (spoken "That is the ..."), ask (Listen and tap),
//            yes (spoken when found: the name plus one true, everyday fact), pair (Match pairs: the other card's look) }],
//   sorts: [{ ask, bins: [{ label, art, yes }], items: { itemId: binIndex } }]   (Sort it; only listed items are sorted),
//   trace: [{ id, show, say, done, strokes }]   (Trace: strokes in a 100 x 100 box, in the order they are written;
//            "M x y L x y ..." for lines, "C cx cy rx ry from to" for a curve, angles in degrees, y pointing down).
// Facts are plain and true (Fable checked them, 15 Nov 2026). Words are short and spoken; a child need not read.

const L = (ch, word, line) => ({ id: 'L' + ch, show: { text: ch }, pair: { text: ch.toLowerCase() }, name: 'That is ' + ch + '.', ask: 'Find the letter ' + ch + '.', yes: 'Yes! That is ' + ch + '. ' + (line || ch + ' is for ' + word + '.') });
const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const N = (n) => ({ id: 'N' + n, show: { text: String(n) }, pair: { dots: n }, name: 'That is ' + NUM_WORDS[n] + '.', ask: 'Find the number ' + NUM_WORDS[n] + '.', yes: 'Yes! That is ' + NUM_WORDS[n] + '.' + (n > 1 ? ' Count with me: ' + NUM_WORDS.slice(1, n + 1).join(', ') + '.' : ' Just one.') });
const an = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w; // "an oval", "an owl" (audit, 19 Nov 2026: "That is a oval")
const S = (id, name, fact) => ({ id, show: { art: id }, pair: { art: id }, name: 'That is ' + an(name) + '.', ask: 'Find the ' + name + '.', yes: 'Yes! That is ' + an(name) + '. ' + fact });
const A = (id, name, fact) => ({ id, show: { art: id }, pair: { art: id }, name: 'That is ' + an(name) + '.', ask: 'Where is the ' + name + '?', yes: 'Yes! You found the ' + name + '. ' + fact });

const PACKS = [
  {
    id: 'animals', name: 'Animals', say: 'Animals.', tile: { art: 'cat' }, engines: ['listen', 'match', 'sort'],
    items: [
      A('cat', 'cat', 'Cats say meow.'), A('dog', 'dog', 'Dogs say woof.'), A('cow', 'cow', 'Cows say moo.'),
      A('pig', 'pig', 'Pigs say oink.'), A('sheep', 'sheep', 'Sheep say baa.'), A('duck', 'duck', 'Ducks say quack.'),
      A('frog', 'frog', 'Frogs say ribbit.'), A('fish', 'fish', 'Fish swim in water.'), A('bird', 'bird', 'Birds sing tweet tweet.'),
      A('bee', 'bee', 'Bees say buzz.'),
    ],
    sorts: [
      { ask: 'Can it fly? Yes, or no?', bins: [{ label: 'Yes', art: 'yes', yes: 'Yes. It can fly.' }, { label: 'No', art: 'no', yes: 'That is right. It can not fly.' }],
        items: { bird: 0, bee: 0, duck: 0, cat: 1, dog: 1, cow: 1, pig: 1, sheep: 1, fish: 1, frog: 1 } },
      { ask: 'Does it have four legs? Yes, or no?', bins: [{ label: 'Yes', art: 'yes', yes: 'Yes. It has four legs.' }, { label: 'No', art: 'no', yes: 'That is right. It does not have four legs.' }],
        items: { cat: 0, dog: 0, cow: 0, pig: 0, sheep: 0, frog: 0, duck: 1, bird: 1, fish: 1, bee: 1 } },
    ],
    trace: [],
  },
  {
    id: 'shapes', name: 'Shapes', say: 'Shapes.', tile: { art: 'triangle' }, engines: ['listen', 'match', 'sort', 'trace'],
    items: [
      S('circle', 'circle', 'A circle is round, like a ball.'), S('square', 'square', 'A square has four sides, all the same.'),
      S('triangle', 'triangle', 'A triangle has three sides.'), S('rectangle', 'rectangle', 'A rectangle has four sides, like a door.'),
      S('star', 'star', 'This star has five points.'), S('heart', 'heart', 'A heart can mean love.'),
      S('oval', 'oval', 'An oval is round and long, like an egg.'), S('diamond', 'diamond', 'A diamond has four sides and stands on a point.'),
    ],
    sorts: [
      { ask: 'Is it round, or does it have corners?', bins: [{ label: 'Round', art: 'circle', yes: 'Yes. It is round.' }, { label: 'Corners', art: 'square', yes: 'Yes. It has corners.' }],
        items: { circle: 0, oval: 0, square: 1, triangle: 1, rectangle: 1, star: 1, diamond: 1 } },
    ],
    trace: [
      { id: 't-circle', show: { art: 'circle' }, say: 'Trace the circle. Start at the dot, and go around.', done: 'You traced a circle!', strokes: ['C 50 52 34 34 -90 -450'] },
      { id: 't-square', show: { art: 'square' }, say: 'Trace the square. Start at the dot.', done: 'You traced a square! Four sides.', strokes: ['M 22 22 L 78 22 L 78 78 L 22 78 L 22 22'] },
      { id: 't-triangle', show: { art: 'triangle' }, say: 'Trace the triangle. Start at the dot.', done: 'You traced a triangle! Three sides.', strokes: ['M 50 14 L 84 84 L 16 84 L 50 14'] },
    ],
  },
  {
    id: 'numbers', name: 'Numbers', say: 'Numbers.', pairs: 4, tile: { text: '3' }, engines: ['listen', 'match', 'sort', 'trace'],
    items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(N),
    sorts: [
      { ask: 'Is it less than five, or more than five?', bins: [{ label: 'Less than 5', dots: 2, yes: 'Yes. It is less than five.' }, { label: 'More than 5', dots: 8, yes: 'Yes. It is more than five.' }],
        items: { N1: 0, N2: 0, N3: 0, N4: 0, N6: 1, N7: 1, N8: 1, N9: 1, N10: 1 } },
    ],
    trace: [
      { id: 't-1', show: { text: '1' }, say: 'Trace the number one. Start at the top dot.', done: 'You traced one!', strokes: ['M 50 10 L 50 90'] },
      { id: 't-4', show: { text: '4' }, say: 'Trace the number four. Start at the dot.', done: 'You traced four!', strokes: ['M 56 10 L 26 62 L 76 62', 'M 60 34 L 60 90'] },
      { id: 't-7', show: { text: '7' }, say: 'Trace the number seven. Start at the dot.', done: 'You traced seven!', strokes: ['M 26 12 L 74 12 L 42 90'] },
      { id: 't-0', show: { text: '0' }, say: 'Trace the number zero. Start at the top, and go around.', done: 'You traced zero!', strokes: ['C 50 50 26 40 -90 -450'] },
    ],
  },
  {
    id: 'letters', name: 'Letters', say: 'Letters.', pairs: 4, tile: { text: 'A' }, engines: ['listen', 'match', 'sort', 'trace'],
    items: [L('A', 'apple'), L('B', 'ball'), L('C', 'cat'), L('D', 'dog'), L('E', 'egg'), L('F', 'fish'), L('G', 'goat'), L('H', 'hat'), L('I', 'igloo'),
      L('J', 'jam'), L('K', 'kite'), L('L', 'leaf'), L('M', 'moon'), L('N', 'nest'), L('O', 'octopus'), L('P', 'pig'), L('Q', 'queen'), L('R', 'rain'),
      L('S', 'sun'), L('T', 'tree'), L('U', 'up'), L('V', 'van'), L('W', 'water'), L('X', '', 'You hear X at the end of fox.'), L('Y', 'yellow'), L('Z', 'zoo')],
    sorts: [
      { ask: 'Is it all straight lines, or does it curve?', bins: [{ label: 'Straight', art: 'straight', yes: 'Yes. All straight lines.' }, { label: 'Curvy', art: 'curvy', yes: 'Yes. It curves.' }],
        items: { LA: 0, LE: 0, LF: 0, LH: 0, LI: 0, LL: 0, LT: 0, LV: 0, LX: 0, LZ: 0, LC: 1, LO: 1, LS: 1 } },
    ],
    trace: [
      { id: 't-A', show: { text: 'A' }, say: 'Trace the letter A. Start at the dot.', done: 'You traced A! A is for apple.', strokes: ['M 50 10 L 26 90', 'M 50 10 L 74 90', 'M 36 60 L 64 60'] },
      { id: 't-C', show: { text: 'C' }, say: 'Trace the letter C. Start at the dot, and curve around.', done: 'You traced C! C is for cat.', strokes: ['C 54 50 32 40 -45 -315'] },
      { id: 't-E', show: { text: 'E' }, say: 'Trace the letter E. Start at the dot.', done: 'You traced E! E is for egg.', strokes: ['M 32 10 L 32 90', 'M 32 10 L 72 10', 'M 32 50 L 64 50', 'M 32 90 L 72 90'] },
      { id: 't-H', show: { text: 'H' }, say: 'Trace the letter H. Start at the dot.', done: 'You traced H! H is for hat.', strokes: ['M 28 10 L 28 90', 'M 72 10 L 72 90', 'M 28 50 L 72 50'] },
      { id: 't-I', show: { text: 'I' }, say: 'Trace the letter I. Start at the dot.', done: 'You traced I!', strokes: ['M 50 10 L 50 90', 'M 34 10 L 66 10', 'M 34 90 L 66 90'] },
      { id: 't-L', show: { text: 'L' }, say: 'Trace the letter L. Start at the dot, go down, then across.', done: 'You traced L! L is for leaf.', strokes: ['M 34 10 L 34 90 L 72 90'] },
      { id: 't-O', show: { text: 'O' }, say: 'Trace the letter O. Start at the top, and go around.', done: 'You traced O!', strokes: ['C 50 50 32 40 -90 -450'] },
      { id: 't-T', show: { text: 'T' }, say: 'Trace the letter T. Start at the dot.', done: 'You traced T! T is for tree.', strokes: ['M 24 12 L 76 12', 'M 50 12 L 50 90'] },
      { id: 't-V', show: { text: 'V' }, say: 'Trace the letter V. Start at the dot, go down, and back up.', done: 'You traced V! V is for van.', strokes: ['M 26 10 L 50 90 L 74 10'] },
      { id: 't-X', show: { text: 'X' }, say: 'Trace the letter X. Start at the dot.', done: 'You traced X!', strokes: ['M 28 10 L 72 90', 'M 72 10 L 28 90'] },
    ],
  },
];

// The fixed words around the games: game names, the pick-a-topic line, the gentle lines. Kept here so every spoken
// line lives in one file and gets a voice clip.
const WORDS = {
  games: {
    listen: { name: 'Listen and tap', say: 'Listen and tap. What do you want to play with?' },
    match: { name: 'Match pairs', say: 'Match pairs. What do you want to play with?' },
    sort: { name: 'Sort it', say: 'Sort it. What do you want to play with?' },
    trace: { name: 'Trace', say: 'Trace. What do you want to trace?' },
  },
  hello: 'Hi! Pick a game.',
  lookAgain: 'Look again.',
  thinkAgain: 'Hmm. Think about it again.',
  matchStart: 'Find two that match. Tap a card to turn it over.',
  matchYes: 'A match!',
  traceStart: 'Put your finger on the dot.',
  setDone: 'You did it! You kept trying, and you learned something. Show a grown-up!',
  allDone: 'All done for now. Time to go play!',
};

module.exports = { PACKS, WORDS, NUM_WORDS };
