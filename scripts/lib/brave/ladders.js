// BRAVE STEPS (profiles/kids/docs/BRAVE-STEPS.md; Bryan, 18 Nov 2026: "Yes, build it"). Everyday worries, each with a
// ladder of small steps from easy to harder, done with a grown-up. The child stays with each step until the worry gets
// a little smaller: facing a fear in small steps is how fear shrinks (graded exposure, the core of the best-tested
// treatments for fears), and a grown-up who supports instead of rescuing helps as much as treating the child (SPACE,
// Lebowitz and colleagues, JAACAP 2020). This teaches everyday bravery; it is not therapy, and every ladder says so.
// A step's village: the Void Village place where it can be practised first (/village/#<place>).

const METER = ['Calm', 'A little worried', 'Worried', 'Very worried', 'Too worried'];

const LADDERS = [
  { id: 'dark', name: 'The dark', color: '#4cc9f0', hello: 'Lots of people feel worried in the dark. Let\'s get brave, one small step at a time.',
    steps: [
      'Sit with your grown-up in a room with the lights low.',
      'Turn the light off together, and count to ten.',
      'Walk into a dark room with a flashlight. Your grown-up waits at the door.',
      'Fetch a toy from a dim room by yourself. Your grown-up is close by.',
      'Go to sleep with just a night light on.',
    ] },
  { id: 'dogs', name: 'Dogs', color: '#ffd23f', hello: 'Some dogs are big and loud. Most dogs are friendly. Always ask the owner first.',
    steps: [
      { say: 'Practice in Void Village: help with the dog next door.', village: 'pethouse' },
      'Look at a dog on a leash from across the street.',
      'Stand a little closer, while the owner holds the leash.',
      'Ask the owner if you may say hello. Let a calm dog sniff your hand.',
      'Pet a calm dog gently on its back, with the owner right there.',
    ] },
  { id: 'doctor', name: 'The doctor', color: '#2ec4b6', hello: 'Doctors and nurses help us stay well. Knowing what happens makes it less worrying.',
    steps: [
      'Play doctor at home: give a teddy a checkup.',
      { say: 'Practice in Void Village: go for a checkup at the clinic.', village: 'clinic' },
      'Talk with your grown-up about what happens at a checkup.',
      'Sit in the waiting room and look around.',
      'Have your checkup, and ask the nurse one question.',
    ] },
  { id: 'talking', name: 'Talking to someone new', color: '#ff5fa2', hello: 'Saying hello to someone new can feel big. Little hellos make it easier.',
    steps: [
      'Practice saying hello to a grown-up you know well.',
      'Wave hello to a neighbor.',
      'Say thank you to a shop worker.',
      { say: 'Practice in Void Village: shop for your list at the market.', village: 'market' },
      'Ask a shop worker where something is, or order your own food at the counter.',
    ] },
  { id: 'food', name: 'A new food', color: '#9be15d', hello: 'New foods can look strange. Getting to know a food, a little at a time, helps.',
    steps: [
      'Let the new food sit on the table at mealtime.',
      'Put a little of it on your plate.',
      'Smell it, and touch it.',
      'Lick it, or take one tiny taste.',
      'Eat one small bite.',
    ] },
  { id: 'apart', name: 'Being apart from your grown-up', color: '#c7a6ff', hello: 'Missing your grown-up is normal. They always come back.',
    steps: [
      'Play in another room for a few minutes.',
      'Your grown-up goes for a short walk, and comes back.',
      'Stay with a family friend for a little while.',
      'Go to a friend\'s house to play.',
      'Spend a whole morning at school or camp.',
    ] },
];

const LINES = {
  title: 'Brave steps',
  hello: 'Being brave is doing something even when you feel a little worried. Pick a worry to work on with your grown-up.',
  own: 'Your own worry',
  ownHello: 'Grown-up: write the worry and up to five small steps, from easy to harder. They stay on this device only.',
  ladder: 'Start at the bottom step. Go up one step at a time, when you are ready.',
  before: 'Before you try: how big is the worry? Tap a face.',
  go: 'Now try it, with your grown-up. Stay with it until the worry gets a little smaller.',
  tried: 'We tried it',
  after: 'How big is the worry now? Tap a face.',
  calm: 'Calm all the way. That step is done!',
  same: 'Worries sometimes take a few tries. You were brave to try. Try this step again another day.',
  top: 'You climbed the whole ladder! That worry is smaller now. You can pick another one any time.',
};
// "Your worry went from A to B" for every pair where it got smaller, so each one can be spoken.
function smaller(a, b) { return 'Your worry went from ' + METER[a].toLowerCase() + ' to ' + METER[b].toLowerCase() + '. Staying made it smaller. That is brave!'; }

// For grown-ups (SPACE): support, do not rescue; let the child set the pace; when to get help.
const GROWNUP = [
  'Say it warmly: I know this is hard, and I know you can handle it.',
  'Let your child pick the next step. Do not skip ahead, and do not do the scary part for them.',
  'Praise the trying, not only the doing.',
  'If a fear keeps your child from everyday life, or comes from something that hurt them, talk with your child\'s doctor or a counselor.',
];

const stepText = (s) => (typeof s === 'string' ? s : s.say);

function allLines() {
  const out = [LINES.title, LINES.hello, LINES.own, LINES.ladder, LINES.before, LINES.go, LINES.after, LINES.calm, LINES.same, LINES.top, ...METER, ...GROWNUP];
  for (const l of LADDERS) { out.push(l.name, l.hello); for (const s of l.steps) out.push(stepText(s)); }
  for (let a = 1; a < METER.length; a++) for (let b = 0; b < a; b++) out.push(smaller(a, b));
  return out;
}

module.exports = { METER, LADDERS, LINES, GROWNUP, smaller, stepText, allLines };
