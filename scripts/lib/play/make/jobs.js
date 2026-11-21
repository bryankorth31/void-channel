// MAKE IT jobs (PLAN-kids-make-it T7): each job is data. room = things already in place (the child cannot move them),
// tray = what the child may place ("with what you have"), goal = which thing must end up in which, say = spoken lines.
// works = one build that is proven to work (by scripts/test/make.test.js), so every job can be finished.
// These two are the engine proof (T3); the first three jobs B picks replace or join them.
const WALLS = [{ thing: 'floor', x: 8, y: 0.2 }, { thing: 'wall', x: -0.2, y: 5 }, { thing: 'wall', x: 16.2, y: 5 }];

const JOBS = [
  {
    id: 'marble-cup', goal: { thing: 'marble', into: 'cup' }, goalX: 13,
    say: { job: 'Get the marble into the cup.', done: 'It worked! The marble rolled into the cup.', idea: 'The books were ramps. Things roll down a slope.' },
    room: [...WALLS, { thing: 'shelf', x: 2, y: 7 }, { thing: 'marble', x: 1, y: 7.5, push: [1.5, 0] }, { thing: 'cup', x: 13, y: 1.05 }],
    tray: ['book', 'book'],
    works: [{ thing: 'book', x: 5.6, y: 5.6, angle: -12 }, { thing: 'book', x: 9.4, y: 3.4, angle: -12 }],
  },
  {
    id: 'domino-ball', goal: { thing: 'ball', into: 'cup' }, goalX: 15,
    say: { job: 'Get the ball into the cup. The toy car is ready to go.', done: 'It worked! The dominoes pushed the ball into the cup.', idea: 'Each domino passed the push to the next one.' },
    room: [...WALLS, { thing: 'shelf', x: 8, y: 3 }, { thing: 'shelf', x: 11.6, y: 3 }, { thing: 'car', x: 6.6, y: 3.38, push: [3, 0] }, { thing: 'ball', x: 13.3, y: 3.6 }, { thing: 'cup', x: 15, y: 1.05 }],
    tray: ['domino', 'domino', 'domino', 'domino', 'domino', 'domino', 'domino'],
    works: [8, 8.8, 9.6, 10.4, 11.2, 12, 12.8].map((x) => ({ thing: 'domino', x, y: 3.7 })),
  },
  // More machines (B, 15 Nov 2026: "As well as more machines"). Each works build was found by running the engine,
  // then picked to be one a child would recognise; there are other ways too.
  {
    id: 'bridge', goal: { thing: 'marble', into: 'cup' }, goalX: 15,
    say: { job: 'There is a gap between the shelves. Get the marble across and into the cup.', done: 'It worked! The marble rolled across your bridge and into the cup.', idea: 'A bridge is a path over a gap. It has to reach all the way across.' },
    room: [...WALLS, { thing: 'shelf', x: 2, y: 4 }, { thing: 'shelf', x: 12, y: 4 }, { thing: 'marble', x: 0.8, y: 4.45, push: [2.2, 0] }, { thing: 'cup', x: 15, y: 1.05 }],
    tray: ['book', 'book'],
    works: [{ thing: 'book', x: 5.5, y: 4, angle: 0 }, { thing: 'book', x: 8.5, y: 4, angle: 0 }],
  },
  {
    id: 'zigzag', goal: { thing: 'marble', into: 'cup' }, goalX: 3,
    say: { job: 'The cup is far down on the other side. Use the rulers to guide the marble down to it.', done: 'It worked! The marble zigzagged down your rulers into the cup.', idea: 'Each ruler was a slope. A path can turn back and forth and still go down.' },
    room: [...WALLS, { thing: 'shelf', x: 14, y: 8.6 }, { thing: 'marble', x: 15.2, y: 9.1, push: [-1.2, 0] }, { thing: 'cup', x: 3, y: 1.05 }],
    tray: ['ruler', 'ruler', 'ruler'],
    works: [{ thing: 'ruler', x: 11, y: 7.6, angle: 12 }, { thing: 'ruler', x: 8, y: 4.4, angle: -12 }, { thing: 'ruler', x: 5.8, y: 2.6, angle: 6 }],
  },
  {
    id: 'bounce', goal: { thing: 'ball', into: 'cup' }, goalX: 12,
    say: { job: 'This ball is very bouncy. Get it into the cup.', done: 'It worked! The ball landed in the cup.', idea: 'A soft pillow soaks up a bounce, and a slope sends the ball where you want it.' },
    room: [...WALLS, { thing: 'shelf', x: 3, y: 8 }, { thing: 'ball', x: 1.2, y: 8.6, push: [3.2, 0] }, { thing: 'cup', x: 12, y: 1.05 }],
    tray: ['pillow', 'book'],
    works: [{ thing: 'pillow', x: 13.6, y: 2.8, angle: 30 }, { thing: 'book', x: 6.3, y: 2.9, angle: -6 }],
  },
];

module.exports = { JOBS };
