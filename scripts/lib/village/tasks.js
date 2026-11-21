// VOID VILLAGE tasks (PLAN-void-village T5): the rules of a helping task, with no page in them, so tests can run
// them. A task is steps; each step is a thing to pick up and the place it belongs (or a thing to tap, like making the
// bed). The child taps a thing, then taps where it goes. A wrong place is a first try: the voice says where that thing
// lives, and the right place glows. No points, no timer; the room stays tidy once tidied (B: never gets worse).
//
// Task: { id, place, title, start, steps: [{ id, item, home, kind: 'move'|'tap', pick, miss, done, to }], finish, real }
//   item  the thing to pick up (an entity id in the place); home  the entity to tap to put it away
//   to    where the item ends up ([x, y, z] in blocks), for the page to move it there
// State: { holding: step id or null, done: { stepId: true }, misses: { stepId: n } }

const TASKS = {
  'tidy-room': {
    id: 'tidy-room', place: 'room', title: 'Tidy your room', focus: [4.8, 1.8, 4.2], view: { angle: 26, tilt: 40, dist: 15 },
    start: 'Your room is messy. Can you put things where they belong? Tap something on the floor.',
    steps: [
      { id: 'book1', item: 'book1', home: 'shelf', kind: 'move', to: [2.825, 3.725, 1.0], stack: 'shelf', pick: 'A book. Where do books live?', miss: 'Books live on the shelf. Try the shelf.', done: 'The book is on the shelf.' },
      { id: 'book2', item: 'book2', home: 'shelf', kind: 'move', to: [2.825, 3.725, 1.0], stack: 'shelf', pick: 'Another book. Where does it go?', miss: 'Books live on the shelf. Try the shelf.', done: 'Two books on the shelf.' },
      { id: 'book3', item: 'book3', home: 'shelf', kind: 'move', to: [2.825, 3.725, 1.0], stack: 'shelf', pick: 'One more book.', miss: 'Books live on the shelf. Try the shelf.', done: 'All the books are home.' },
      { id: 'ball', item: 'ball', home: 'toybox', kind: 'move', to: [1.6625, 1.125, 6.7875], pick: 'The ball. Where do toys go?', miss: 'Toys go in the toy box.', done: 'The ball is in the toy box.' },
      { id: 'bed', item: 'bed', home: 'bed', kind: 'tap', pick: '', miss: '', done: 'You made the bed. Pull the blanket up, smooth it flat.' },
    ],
    finish: 'Your room is tidy! A place for everything, and everything in its place.',
    real: 'Now try it for real: put three things away in your own room. Then show a grown-up.',
    again: 'Make it messy to practice again',
  },
  // Steps in order (kind 'order'), from the CDC's five steps: wet, lather, scrub for about 20 seconds, rinse, dry
  // (cdc.gov/clean-hands, checked 15 Nov 2026). Each step: tap the thing, and show or hide things (water, bubbles).
  'wash-hands': {
    id: 'wash-hands', close: 5, place: 'kitchen', title: 'Wash your hands', kind: 'order', focus: [5.5, 2.75, 2.0], view: { angle: 12, tilt: 24, dist: 8 },
    start: 'Time to wash your hands before we cook. Tap the tap to turn on the water.',
    steps: [
      { id: 'wet', tap: 'faucet', show: ['stream'], ask: 'Tap the tap to turn on the water.', done: 'Wet your hands with clean, running water.' },
      { id: 'off1', tap: 'faucet', hide: ['stream'], ask: 'Now turn off the tap while you soap up. It saves water.', done: 'Tap off. Good thinking: that saves water.' },
      { id: 'soap', tap: 'soap', show: ['bubbles'], ask: 'Next, the soap. Tap the soap.', done: 'Soap on.' },
      { id: 'scrub', tap: 'hands', ask: 'Now scrub. Tap your hands.', done: 'Scrub the backs of your hands, between your fingers, and under your nails. Count to 20 with me: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20.' },
      { id: 'rinse', tap: 'faucet', show: ['stream'], hide: ['bubbles'], ask: 'Rinse the soap away. Turn the water back on.', done: 'Rinse under the running water. The soap and the germs wash away.' },
      { id: 'off2', tap: 'faucet', hide: ['stream'], ask: 'Turn off the tap.', done: 'Tap off.' },
      { id: 'dry', tap: 'towel', ask: 'Last, dry your hands. Tap the towel.', done: 'Dry your hands on a clean towel.' },
    ],
    finish: 'Clean hands! Soap and water wash away germs that can make you sick.',
    real: 'Now do it for real: wash your hands with soap and count to 20 while you scrub. Then show a grown-up.',
    again: 'Wash again',
  },
  // Steps in order, from the American Dental Association's advice for children (mouthhealthy.org, checked 15 Nov 2026):
  // a pea-sized amount of fluoride toothpaste, brush gently for two minutes, twice a day, spit the toothpaste out, and
  // a grown-up helps until about age 6. Rinsing the mouth is left out on purpose: sources differ on it.
  'brush-teeth': {
    id: 'brush-teeth', close: 5, place: 'bathroom', title: 'Brush your teeth', kind: 'order', focus: [6.2, 3.85, 1.9], view: { angle: 14, tilt: 14, dist: 8.6 },
    start: 'Time to brush your teeth. Tap your toothbrush in the cup.',
    steps: [
      { id: 'pick', tap: 'brushcup', hide: ['brushcup'], show: ['brush'], ask: 'Tap your toothbrush in the cup.', done: 'Toothbrush ready.' },
      { id: 'paste', tap: 'paste', show: ['blob'], ask: 'Now the toothpaste. Tap it.', done: 'Just a blob the size of a pea. That is all you need.' },
      { id: 'top', close: 7, tap: 'smile', show: ['foam'], hide: ['blob'], ask: 'Brush your top teeth. Tap your smile in the mirror.', done: 'Top teeth: small, gentle circles, front and back.' },
      { id: 'bottom', close: 7, tap: 'smile', ask: 'Now the bottom teeth. Tap your smile again.', done: 'Bottom teeth: small circles, front and back.' },
      { id: 'chew', close: 7, tap: 'smile', ask: 'And the tops of your back teeth, where you chew. Tap your smile.', done: 'The chewing tops, back and forth. Two minutes in all, that is a long time!' },
      { id: 'spit', tap: 'vanity', hide: ['foam'], ask: 'Spit the toothpaste out. Tap the sink.', done: 'Spit it out. Do not swallow toothpaste.' },
      { id: 'rinse', tap: 'faucet', show: ['stream'], ask: 'Rinse your toothbrush. Tap the tap.', done: 'Rinse the brush under the water.' },
      { id: 'off', tap: 'faucet', hide: ['stream'], ask: 'Turn off the tap.', done: 'Tap off.' },
      { id: 'back', tap: 'cup', hide: ['brush'], show: ['brushcup'], ask: 'Put your toothbrush back in its cup.', done: 'Back in the cup, standing up to dry.' },
    ],
    finish: 'Sparkly teeth! Brushing two times a day, in the morning and at night, keeps your teeth strong.',
    real: 'Now brush for real, for two whole minutes. Grown-ups help until you are about 6. Then show a grown-up your smile.',
    again: 'Brush again',
  },
  // Sorting foods by where they come from. Facts checked 15 Nov 2026 (honey: bees make it from flower nectar; dry
  // pasta: durum wheat and water; carrots are taproots). Why this one: a 2013 British Nutrition Foundation survey of
  // 27,500 UK children found 29% of primary pupils thought cheese comes from plants (LIFE-SKILLS-GAPS.md).
  'food-from': {
    id: 'food-from', place: 'kitchen', title: 'Where does food come from?', focus: [5.3, 1.9, 5.6], view: { angle: 14, tilt: 40, dist: 10 },
    start: 'All this food came from somewhere. Did it come from a plant, or an animal? Tap a food on the table.',
    steps: [
      { id: 'cheese', item: 'cheese', home: 'animals', kind: 'move', to: [7.05, 1.125, 6.7], stack: 'animals', grid: true, pick: 'Cheese. Did it come from a plant, or an animal?', miss: 'Cheese is made from milk, and milk comes from cows, goats or sheep. Try the animal basket.', done: 'Cheese is made from milk, and milk comes from cows, goats or sheep. Into the animal basket.' },
      { id: 'milk', item: 'milk', home: 'animals', kind: 'move', to: [7.05, 1.125, 6.7], stack: 'animals', grid: true, pick: 'Milk. Plant, or animal?', miss: 'Milk comes from cows, and from goats and sheep too. Try the animal basket.', done: 'Milk comes from cows, and from goats and sheep too. Into the animal basket.' },
      { id: 'egg', item: 'egg', home: 'animals', kind: 'move', to: [7.05, 1.125, 6.7], stack: 'animals', grid: true, pick: 'An egg. Plant, or animal?', miss: 'Eggs come from hens. Try the animal basket.', done: 'Eggs come from hens. Into the animal basket.' },
      { id: 'honey', item: 'honey', home: 'animals', kind: 'move', to: [7.05, 1.125, 6.7], stack: 'animals', grid: true, pick: 'Honey. Plant, or animal?', miss: 'Bees make honey from the nectar of flowers. Try the animal basket.', done: 'Bees make honey from the nectar of flowers. Into the animal basket.' },
      { id: 'bread', item: 'bread', home: 'plants', kind: 'move', to: [2.85, 1.125, 6.7], stack: 'plants', grid: true, pick: 'Bread. Plant, or animal?', miss: 'Bread is made from flour, and flour is ground-up wheat, a plant. Try the plant basket.', done: 'Bread is made from flour, and flour is ground-up wheat, a plant. Into the plant basket.' },
      { id: 'pasta', item: 'pasta', home: 'plants', kind: 'move', to: [2.85, 1.125, 6.7], stack: 'plants', grid: true, pick: 'Pasta. Plant, or animal?', miss: 'Dry pasta is made from wheat and water. Try the plant basket.', done: 'Dry pasta is made from wheat and water. Into the plant basket.' },
      { id: 'apple', item: 'apple', home: 'plants', kind: 'move', to: [2.85, 1.125, 6.7], stack: 'plants', grid: true, pick: 'An apple. Plant, or animal?', miss: 'Apples grow on apple trees. Try the plant basket.', done: 'Apples grow on apple trees. Into the plant basket.' },
      { id: 'carrot', item: 'carrot', home: 'plants', kind: 'move', to: [2.85, 1.125, 6.7], stack: 'plants', grid: true, pick: 'A carrot. Plant, or animal?', miss: 'A carrot is a root. It grows under the ground. Try the plant basket.', done: 'A carrot is a root. It grows under the ground. Into the plant basket.' },
    ],
    finish: 'Every food comes from a plant or an animal, from a farm, a field, a tree or a hive.',
    real: 'Now look in your own kitchen with a grown-up. Find one food from a plant and one from an animal.',
    again: 'Sort again',
  },
  // A sandwich with no cooking and no sharp knife: bread, butter spread with a butter knife, washed lettuce, cheese.
  // It teaches the order of a recipe, washing vegetables before eating them, and cleaning up (butter back in the fridge).
  'sandwich': {
    id: 'sandwich', close: 5.2, place: 'kitchen', title: 'Make a sandwich', kind: 'order', focus: [2.6, 2.4, 3.6], view: { angle: 18, tilt: 40, dist: 7.5 },
    start: 'Let us make a sandwich. Clean hands first, then everything in order. Take a plate. Tap the plates.',
    steps: [
      { id: 'plate', tap: 'plates', show: ['plate'], ask: 'Take a plate. Tap the plates.', done: 'A clean plate.' },
      { id: 'bread1', tap: 'breadbag', show: ['slice1'], ask: 'Now a slice of bread. Tap the bread.', done: 'One slice of bread.' },
      { id: 'butter', tap: 'butter', show: ['butterlayer'], ask: 'Spread some butter. Tap the butter.', done: 'Spread a little butter with a butter knife. Butter knives are not sharp.' },
      { id: 'lettuce', tap: 'lettuce', ask: 'Next, the lettuce. Tap it.', done: 'Wash vegetables before you eat them.' },
      { id: 'rinse', tap: 'faucet', show: ['stream'], ask: 'Rinse the lettuce under the tap. Tap the tap.', done: 'Rinse it under cold, running water.' },
      { id: 'off', tap: 'faucet', hide: ['stream'], show: ['leaf'], ask: 'Turn off the tap.', done: 'Tap off. A clean lettuce leaf goes on.' },
      { id: 'cheese', tap: 'cheeseslices', show: ['cheeseon'], ask: 'Now a slice of cheese. Tap the cheese.', done: 'Cheese on.' },
      { id: 'bread2', tap: 'breadbag', show: ['slice2'], ask: 'Last, the top slice of bread. Tap the bread.', done: 'Top slice on. A sandwich!' },
      { id: 'tidy', tap: 'fridge', hide: ['butter'], ask: 'Clean up as you go: the butter goes back in the fridge. Tap the fridge.', done: 'Butter back in the fridge. Cold keeps it fresh.' },
    ],
    finish: 'You made a sandwich yourself! Bread from wheat, butter and cheese from milk, lettuce from a plant.',
    real: 'Make one for real with a grown-up. Wash your hands first, and clean up after: put things away and wipe the counter.',
    again: 'Make another',
  },
  // Growing a bush bean, with days passing in seconds (time you can see). Facts from US extension services, checked
  // 15 Nov 2026: plant about 1 inch deep; it sprouts in about one to two weeks; bush beans are ready in about two
  // months (50 to 65 days). The plant never wilts while a child is away (never worse).
  'grow-bean': {
    id: 'grow-bean', close: 6.5, work: 'hole', closeTilt: 46, place: 'yard', title: 'Grow a bean', kind: 'order', focus: [7.3, 2.3, 6.4], view: { angle: 12, tilt: 30, dist: 10.5 },
    start: 'Let us grow a bean plant from one little seed. First, dig a hole. Tap the trowel.',
    steps: [
      { id: 'dig', tap: 'trowel', show: ['hole'], ask: 'Dig a little hole. Tap the trowel.', done: 'A small hole, about one inch deep. That is about as deep as the tip of your finger.' },
      { id: 'seed', tap: 'seeds', show: ['beanseed'], ask: 'Drop in a bean seed. Tap the seed packet.', done: 'One bean seed, in the hole.' },
      { id: 'cover', tap: 'trowel', hide: ['hole', 'beanseed'], show: ['mound'], ask: 'Cover it with soil. Tap the trowel.', done: 'Cover it gently with soil.' },
      { id: 'water', tap: 'can', show: ['drops'], ask: 'Give it water. Tap the watering can.', done: 'Water helps the seed wake up and start to grow.' },
      { id: 'days1', look: 'plant', tap: 'sun', hide: ['drops'], show: ['sprout', 'weed'], ask: 'Now it needs time and warm sun. Tap the sun to let the days go by.', done: 'One or two weeks go by. A sprout pokes up! But look, a weed is growing too.' },
      { id: 'weed', tap: 'weed', hide: ['weed'], ask: 'Pull out the weed. Tap it.', done: 'Weeds take the water and food your plant needs. Out it comes.' },
      { id: 'water2', tap: 'can', show: ['drops'], ask: 'Water again when the soil feels dry. Tap the watering can.', done: 'A good drink of water.' },
      { id: 'days2', look: 'plant', tap: 'sun', hide: ['drops', 'sprout'], show: ['plant'], ask: 'Let more days go by. Tap the sun.', done: 'A few weeks later: a strong stem and big leaves. Leaves use sunlight to make food for the plant.' },
      { id: 'days3', look: 'plant', tap: 'sun', show: ['flowers'], ask: 'Tap the sun again.', done: 'Little flowers bloom.' },
      { id: 'days4', look: 'plant', tap: 'sun', hide: ['flowers'], show: ['pods'], ask: 'One more time. Tap the sun.', done: 'The flowers turn into bean pods. About two months after planting, there are beans to eat!' },
    ],
    finish: 'You grew a bean plant from one seed, with soil, water, sun and time.',
    real: 'Grow one for real with a grown-up: a dry bean in a cup of soil by a sunny window. Water it when the soil feels dry, and look at it every day.',
    again: 'Plant again',
  },
  // The right tool for the job. Safety from woodworking-with-children guides (checked 15 Nov 2026): safety glasses
  // first, every time; small, steady hammer taps with fingers clear; a grown-up close by; sharp tools only with one.
  'fix-it': {
    id: 'fix-it', place: 'shop', title: 'Fix it with the right tool', focus: [4.9, 1.7, 3.2], view: { angle: 16, tilt: 40, dist: 10.5 },
    start: 'Some things in the workshop need fixing. Safety first: put on your safety glasses. Tap them.',
    steps: [
      { id: 'goggles', item: 'goggles', home: 'goggles', kind: 'tap', first: true, ask: 'Safety first: put on your safety glasses. Tap them.', done: 'Safety glasses on. They keep your eyes safe from bits that fly. Now pick a tool from the bench.', hide: ['goggles'] },
      { id: 'screw', item: 'screwdriver', home: 'chair', kind: 'move', to: [2.0, 1, 5.6], pick: 'A screwdriver. It turns screws.', miss: 'A screwdriver turns screws. Find the screw sticking out.', done: 'Turn the screwdriver to the right to tighten it: righty tighty. The chair does not wobble now.', hide: ['screwout'] },
      { id: 'nail', item: 'hammer', home: 'plank', kind: 'move', to: [3.8, 1, 5.5], pick: 'A hammer. It knocks nails in.', miss: 'A hammer is for nails. Find the nail sticking up.', done: 'Small, steady taps, and keep your fingers clear. The nail is down flat.', hide: ['nailup'], show: ['naildown'] },
      { id: 'measure', item: 'tape', home: 'board', kind: 'move', to: [6.1, 1, 5.4], pick: 'A tape measure. It tells you how long things are.', miss: 'A tape measure is for measuring. Find the board.', done: 'Measured and marked with a pencil line. Measure twice, cut once.', show: ['mark'] },
      { id: 'bolt', item: 'wrench', home: 'wagon', kind: 'move', to: [8.0, 1, 5.5], pick: 'A wrench. It turns nuts and bolts.', miss: 'A wrench turns nuts and bolts. Find the loose bolt on the wagon.', done: 'Turn the wrench to the right: righty tighty. The wagon wheel is on tight.', hide: ['boltloose'] },
    ],
    finish: 'Everything is fixed! The right tool makes the job easy, and safety glasses keep you safe.',
    real: 'With a grown-up, find something at home that needs a screw tightened. A grown-up stays close whenever you use real tools.',
    again: 'Fix again',
  },
  // Shopping with a list: what is on the list is what we need; candy and toys are wants. Then paying and counting
  // change (10 take away 6 is 4). Prices are simple whole dollars on purpose.
  'shop-list': {
    id: 'shop-list', place: 'market', title: 'Shop with a list', focus: [4.6, 1.8, 3.4], view: { angle: 18, tilt: 38, dist: 12 },
    start: 'Here is your shopping list: bread, apples and milk. Find each one and put it in your basket.',
    steps: [
      { id: 'bread', item: 'bread', home: 'basket', kind: 'move', to: [2.95, 1.05, 5.3], stack: 'basket', grid: true, pick: 'Bread: 2 dollars. It is on your list.', miss: 'Food goes in your shopping basket.', done: 'Bread in the basket.' },
      { id: 'apples', item: 'apples', home: 'basket', kind: 'move', to: [2.95, 1.05, 5.3], stack: 'basket', grid: true, pick: 'Apples: 3 dollars. On your list.', miss: 'Food goes in your shopping basket.', done: 'Apples in the basket.' },
      { id: 'milk', item: 'milk', home: 'basket', kind: 'move', to: [2.95, 1.05, 5.3], stack: 'basket', grid: true, pick: 'Milk: 1 dollar. On your list.', miss: 'Food goes in your shopping basket.', done: 'Milk in the basket.' },
      { id: 'pay', item: 'register', home: 'register', kind: 'tap', after: true, ask: 'Everything on your list! Now take it to the counter. Tap the register.', done: 'Bread is 2, apples are 3, milk is 1. That is 6 dollars in all.' },
      { id: 'money', item: 'bill', home: 'bill', kind: 'tap', after: true, ask: 'Pay with your 10-dollar bill. Tap it.', done: 'You paid 10 dollars. The cashier gives you 4 dollars back, because 10 take away 6 is 4. That is your change. Count it: 1, 2, 3, 4.', hide: ['bill'] },
    ],
    finish: 'You shopped with a list, got what you needed, and counted your change. Thank you, says the cashier!',
    real: 'Next time you go shopping with a grown-up, help make the list, and count the change together.',
    again: 'Shop again',
  },
  // When to call 9-1-1 (children's health and 9-1-1 centre guidance, checked 15 Nov 2026): fire, someone hurt who will
  // not wake up, choking; not a lost toy or homework; never as a joke; say what is wrong and where you are; practise
  // only on a pretend phone. This phone is pretend: nothing dials.
  'call-help': {
    id: 'call-help', place: 'station', focus: [2.6, 1.9, 5.3], view: { angle: 12, tilt: 36, dist: 8.5 }, title: 'When to call 9-1-1', notYet: 'First, sort all the picture cards.',
    start: 'Some things are emergencies, and some are not. Sort the picture cards: Call 9-1-1, or Ask a grown-up. Tap a card.',
    steps: [
      { id: 'cardfire', item: 'cardfire', home: 'callbin', kind: 'move', to: [1.35, 1.2, 6.75], stack: 'callbin', grid: true, pick: 'A house is on fire. Call 9-1-1, or ask a grown-up?', miss: 'Fire is an emergency. Get out first, then call 9-1-1. Try the Call 9-1-1 bin.', done: 'Fire is an emergency. Get out first, then call 9-1-1.' },
      { id: 'cardhurt', item: 'cardhurt', home: 'callbin', kind: 'move', to: [1.35, 1.2, 6.75], stack: 'callbin', grid: true, pick: 'Someone fell and will not wake up. Call 9-1-1, or ask a grown-up?', miss: 'Someone hurt who will not wake up is an emergency. Call 9-1-1. Try the Call 9-1-1 bin.', done: 'Someone hurt who will not wake up is an emergency. Call 9-1-1.' },
      { id: 'cardtoy', item: 'cardtoy', home: 'grownbin', kind: 'move', to: [3.15, 1.2, 6.75], stack: 'grownbin', grid: true, pick: 'You lost your teddy bear. Call 9-1-1, or ask a grown-up?', miss: 'A lost toy is sad, but it is not an emergency. Ask a grown-up to help you look. Try the Ask a grown-up bin.', done: 'A lost toy is sad, but it is not an emergency. Ask a grown-up to help you look.' },
      { id: 'cardpuzzle', item: 'cardpuzzle', home: 'grownbin', kind: 'move', to: [3.15, 1.2, 6.75], stack: 'grownbin', grid: true, pick: 'A puzzle is too hard. Call 9-1-1, or ask a grown-up?', miss: 'A hard puzzle is not an emergency. Ask a grown-up for help. Try the Ask a grown-up bin.', done: 'A hard puzzle is not an emergency. Ask a grown-up for help.' },
      { id: 'dial9', item: 'k9', home: 'k9', kind: 'tap', after: true, ask: 'Now practice on the pretend phone. Tap the 9.', done: 'Nine.' },
      { id: 'dial1', item: 'k1', home: 'k1', kind: 'tap', after: true, ask: 'Tap the 1.', done: 'One.' },
      { id: 'dial1b', item: 'k1', home: 'k1', kind: 'tap', after: true, ask: 'Tap the 1 again.', done: 'One. 9-1-1. On a real call, stay calm, say what happened, and say where you are. The helper on the phone will tell you what to do.' },
    ],
    finish: 'You know when to call 9-1-1, and how. Never call it to play: the helpers must be free for real emergencies.',
    real: 'With a grown-up, practice saying your name and where you live. Learn it like a song. Never call 9-1-1 for practice: use a pretend phone.',
    again: 'Sort again',
  },
  // A fire escape (fire service guidance for children, checked 15 Nov 2026): when the smoke alarm sounds, get low and
  // go under the smoke, get out and stay out, go to the family meeting place, call 9-1-1 from outside, and only go back
  // in when a firefighter says it is safe. Grown-ups test smoke alarms every month.
  'fire-escape': {
    id: 'fire-escape', place: 'station', title: 'Practice a fire escape', kind: 'order', focus: [9.6, 2.2, 6.0], view: { angle: 30, tilt: 30, dist: 16 },
    start: 'Firefighters practice, and so can you. This is a practice house. Tap the smoke alarm.',
    steps: [
      { id: 'alarm', tap: 'alarm', show: ['smoke'], ask: 'Tap the smoke alarm.', done: 'Beep, beep, beep! That is the smoke alarm. It means get out, fast.' },
      { id: 'low', tap: 'crawl', ask: 'Smoke rises up high. Get low and go. Tap the floor to crawl.', done: 'Low under the smoke, where the air is clearer.' },
      { id: 'out', tap: 'door', ask: 'Crawl to the door and get out. Tap the door.', done: 'Out you go. Leave your toys: you are what matters.' },
      { id: 'meet', tap: 'meet', ask: 'Go to your family meeting place outside. Ours is the tree. Tap it.', done: 'Wait at the meeting place, so your family knows you are safe.' },
      { id: 'call', tap: 'phone', hide: ['smoke'], ask: 'Now call 9-1-1 from outside. Tap the phone.', done: 'Call 9-1-1 from outside. Then stay out. Only go back in when a firefighter says it is safe.' },
    ],
    finish: 'You got out and stayed out. That is a fire escape plan!',
    real: 'Make a fire escape plan with your grown-ups: two ways out of every room, and a meeting place outside. Test the smoke alarms together every month.',
    again: 'Practice again',
  },
  // Checking a claim in the right book (LESSONS-NOT-TAUGHT.md: Is it true?). The child picks which book can check it:
  // finding the right source is the skill. Facts checked 15 Nov 2026.
  'check-it': {
    id: 'check-it', place: 'library', focus: [6.4, 1.9, 4.3], view: { angle: 10, tilt: 38, dist: 10 }, title: 'Is it true? Check it',
    start: 'People say all kinds of things. Before you believe it, check it. Tap a card on the rug.',
    steps: [
      { id: 'spider', item: 'spider', home: 'bugbook', kind: 'move', to: [1.55, 2.55, 3.25], stack: 'true', grid: true, pick: 'Someone says: a spider has eight legs. Is it true? Check it in a book.', miss: 'Which book is about that? Try another.', done: 'The bug book says: spiders have eight legs. True! It goes on the True board.' },
      { id: 'sunstar', item: 'sunstar', home: 'spacebook', kind: 'move', to: [1.55, 2.55, 3.25], stack: 'true', grid: true, pick: 'Someone says: the Sun is a star. Is it true? Check it in a book.', miss: 'Which book is about that? Try another.', done: 'The space book says: the Sun is a star, the closest star to us. True!' },
      { id: 'penguin', item: 'penguin', home: 'birdbook', kind: 'move', to: [4.75, 2.55, 3.25], stack: 'not', grid: true, pick: 'Someone says: penguins live at the North Pole. Is it true? Check it in a book.', miss: 'Which book is about that? Try another.', done: 'The bird book says: penguins live in the southern half of the world, not at the North Pole. Not true!' },
      { id: 'bat', item: 'bat', home: 'animalbook', kind: 'move', to: [4.75, 2.55, 3.25], stack: 'not', grid: true, pick: 'Someone says: bats are birds. Is it true? Check it in a book.', miss: 'Which book is about that? Try another.', done: 'The animal book says: bats have fur and feed their babies milk. They are mammals, not birds. Not true!' },
    ],
    finish: 'You checked each one in a book before deciding. Good thinkers check first.',
    real: 'Next time someone tells you something surprising, ask a grown-up to help you check it in a book.',
    again: 'Check again',
  },
  // Who made this, and why? (LESSONS-NOT-TAUGHT.md: telling ads from shows.) Children under about 7 or 8 often do not
  // see that an ad is trying to sell to them (American Psychological Association task force).
  'who-made': {
    id: 'who-made', place: 'library', focus: [7.9, 1.5, 6.3], view: { angle: 12, tilt: 36, dist: 7.5 }, title: 'Who made this, and why?',
    start: 'Everything was made by someone, for a reason. Is it telling a story, teaching you, or trying to sell you something? Tap one.',
    steps: [
      { id: 'cereal', item: 'cereal', home: 'sellbin', kind: 'move', to: [8.75, 1.15, 7.15], stack: 'sellbin', grid: true, pick: 'A cereal box with bright colors and a happy cartoon. Telling a story, or trying to sell you something?', miss: 'Think about it: who made this, and why? Try the other bin.', done: 'Trying to sell you something. Bright colors and big promises are there to make you want it.' },
      { id: 'tvad', item: 'tvad', home: 'sellbin', kind: 'move', to: [8.75, 1.15, 7.15], stack: 'sellbin', grid: true, pick: 'An advert for a toy, on TV. Telling a story, or trying to sell you something?', miss: 'Think about it: who made this, and why? Try the other bin.', done: 'Trying to sell you something. An advert is made so you will want to buy it.' },
      { id: 'storybook', item: 'storybook', home: 'storybin', kind: 'move', to: [7.05, 1.15, 7.15], stack: 'storybin', grid: true, pick: 'A storybook. Telling a story, or trying to sell you something?', miss: 'Think about it: who made this, and why? Try the other bin.', done: 'Telling a story. It was made for you to read and enjoy.' },
      { id: 'atlas', item: 'atlas', home: 'storybin', kind: 'move', to: [7.05, 1.15, 7.15], stack: 'storybin', grid: true, pick: 'A book of maps. Teaching you, or trying to sell you something?', miss: 'Think about it: who made this, and why? Try the other bin.', done: 'Teaching you. It was made to show you the world.' },
    ],
    finish: 'You can tell a story from an advert. When something is trying to sell, you can ask: do I need it?',
    real: 'With a grown-up, look at a box in your kitchen. Find the bright colors and big words: what are they trying to make you want?',
    again: 'Sort again',
  },
  // A thank-you letter, addressed the US Postal Service way (checked 15 Nov 2026): their address in the middle, your
  // address in the top left corner, the stamp in the top right corner.
  'letter': {
    id: 'letter', close: 5, place: 'post', title: 'Send a thank-you letter', kind: 'order', focus: [2.4, 2.2, 3.8], view: { angle: 14, tilt: 44, dist: 7.5 },
    start: 'Someone did something kind for you. Let us send them a thank-you letter. Tap the paper.',
    steps: [
      { id: 'paper', tap: 'paper', ask: 'Tap the paper.', done: 'A clean sheet of paper.' },
      { id: 'write', tap: 'pencil', show: ['writing'], ask: 'Now write your note. Tap the pencil.', done: 'Dear Grandma, thank you for the books. I love them. Love, me. A thank-you tells someone you noticed their kindness.' },
      { id: 'fold', tap: 'envelope', hide: ['paper', 'writing'], show: ['letter'], ask: 'Fold it and put it in the envelope. Tap the envelope.', done: 'Folded, and into the envelope.' },
      { id: 'address', tap: 'letter', show: ['address'], ask: 'Now the address. Tap the envelope.', done: 'Their name and address go in the middle. Your own address goes in the top left corner, so it can come back if it gets lost.' },
      { id: 'stamp', tap: 'stamps', show: ['stampon'], ask: 'Every letter needs a stamp. Tap the stamps.', done: 'The stamp goes in the top right corner. It pays for the trip.' },
      { id: 'send', tap: 'mailbox', hide: ['letter', 'address', 'stampon'], ask: 'Now mail it. Tap the mailbox.', done: 'Into the mailbox. A mail carrier will take it all the way to Grandma.' },
    ],
    finish: 'Your letter is on its way!',
    real: 'Write a real thank-you note with a grown-up, to someone who did something kind for you.',
    again: 'Write another',
  },
  // What is OK to share online (LESSONS-NOT-TAUGHT.md): 5 to 7-year-olds often do not see that online, many people can
  // see what you share.
  'share-safe': {
    id: 'share-safe', place: 'post', focus: [2.8, 1.4, 5.8], view: { angle: 10, tilt: 40, dist: 8 }, title: 'Is it OK to share?',
    start: 'Online, lots of people can see what you share. Some things are fine to share, and some you ask a grown-up about first. Tap a card.',
    steps: [
      { id: 'favcolor', item: 'favcolor', home: 'okbin', kind: 'move', to: [1.75, 1.15, 6.65], stack: 'okbin', grid: true, pick: 'Your favorite color. OK to share, or ask a grown-up first?', miss: 'Think about it: could a stranger use this to find you, or get into your things? Try the other bin.', done: 'Your favorite color is fine to share. It cannot help anyone find you.' },
      { id: 'petname', item: 'petname', home: 'okbin', kind: 'move', to: [1.75, 1.15, 6.65], stack: 'okbin', grid: true, pick: 'Your favorite animal. OK to share, or ask a grown-up first?', miss: 'Think about it: could a stranger use this to find you, or get into your things? Try the other bin.', done: 'Your favorite animal is fine to share.' },
      { id: 'homeaddr', item: 'homeaddr', home: 'askbin', kind: 'move', to: [3.75, 1.15, 6.65], stack: 'askbin', grid: true, pick: 'Where you live. OK to share, or ask a grown-up first?', miss: 'Think about it: could a stranger use this to find you, or get into your things? Try the other bin.', done: 'Where you live: ask a grown-up first. Online, many people you do not know can see it.' },
      { id: 'password', item: 'password', home: 'askbin', kind: 'move', to: [3.75, 1.15, 6.65], stack: 'askbin', grid: true, pick: 'Your password. OK to share, or ask a grown-up first?', miss: 'Think about it: could a stranger use this to find you, or get into your things? Try the other bin.', done: 'A password is a secret. Only you and your grown-up should know it.' },
    ],
    finish: 'Your favorite things are fine to share. Where you live and your passwords stay safe with your grown-ups.',
    real: 'Before you share anything online, ask a grown-up first. You can always ask.',
    again: 'Sort again',
  },
  // Who lives in the park? Find five neighbors (facts checked 15 Nov 2026). Water safety at the pond.
  'who-lives': {
    id: 'who-lives', place: 'park', focus: [6.2, 1.6, 4.4], view: { angle: 14, tilt: 34, dist: 12 }, title: 'Who lives in the park?',
    start: 'Lots of animals live in the park. Look closely. Can you find five? Tap one when you see it.',
    steps: [
      { id: 'robin', item: 'robin', home: 'robin', kind: 'tap', done: 'A robin! Robins eat worms, bugs and berries, and they sing in the morning.' },
      { id: 'squirrel', item: 'squirrel', home: 'squirrel', kind: 'tap', done: 'A squirrel! Squirrels bury nuts to eat in winter. They forget some, and those can grow into trees.' },
      { id: 'bee', item: 'bee', home: 'bee', kind: 'tap', done: 'A bee! Bees carry pollen from flower to flower. That helps plants make seeds and fruit.' },
      { id: 'ladybug', item: 'ladybug', home: 'ladybug', kind: 'tap', done: 'A ladybug! Ladybugs eat aphids, tiny bugs that hurt plants. Gardeners love them.' },
      { id: 'frog', item: 'frog', home: 'frog', kind: 'tap', done: 'A frog! Frogs start life as tadpoles, swimming in the water.' },
    ],
    finish: 'You found five neighbors who live in the park!',
    real: 'Next time you visit a park with a grown-up, look and listen. How many animals can you find? Look, but do not touch.',
    again: 'Look again',
  },
  // Sewing a button back on (a big blunt practice needle; a grown-up snips the thread).
  'sew-button': {
    id: 'sew-button', close: 5, work: 'buttonon', place: 'cafe', title: 'Sew a button', kind: 'order', focus: [2.5, 2.2, 3.5], view: { angle: 14, tilt: 46, dist: 7 },
    start: 'At the repair cafe, neighbors fix things together. This shirt lost a button. Let us sew it back on. Tap the thread.',
    steps: [
      { id: 'thread', tap: 'spool', ask: 'Tap the thread.', done: 'Push the thread through the little hole in the needle, called the eye. Tie a knot at the end.' },
      { id: 'place', tap: 'button', hide: ['button'], show: ['buttonon'], ask: 'Put the button where it goes on the shirt. Tap the button.', done: 'The button sits where the others are, in a line.' },
      { id: 'sew', tap: 'needle', show: ['thread'], ask: 'Now sew. Tap the needle.', done: 'Up through one hole, down through the other. Go around five or six times, so it holds tight.' },
      { id: 'knot', tap: 'scissors', ask: 'Finish it off. Tap the scissors.', done: 'Tie a knot on the back. A grown-up snips the thread: scissors are sharp.' },
    ],
    finish: 'The button is back on! When we fix things, we can keep using them.',
    real: 'Ask a grown-up to show you how to sew a button. Practice with a big, blunt needle.',
    again: 'Sew again',
  },
  // Pumping up a bike tire (bike shop guidance, checked 15 Nov 2026): cap off the valve, pump on, pump, check the
  // pressure printed on the side of the tire, cap back on.
  'pump-tire': {
    id: 'pump-tire', close: 5.2, place: 'cafe', title: 'Pump up a bike tire', kind: 'order', focus: [7.6, 1.8, 3.6], view: { angle: 16, tilt: 26, dist: 7.5 },
    start: 'This bike has a flat tire. Let us pump it up. First, tap the little cap on the valve.',
    steps: [
      { id: 'cap', tap: 'cap', hide: ['cap'], ask: 'Tap the little cap on the valve.', done: 'Unscrew the cap and keep it safe. It keeps dirt out of the valve.' },
      { id: 'on', tap: 'pump', ask: 'Now the pump. Tap it.', done: 'Press the pump onto the valve, firm and straight.' },
      { id: 'pump1', tap: 'pump', ask: 'Pump! Tap the pump.', done: 'Push down, and up. Push down, and up. Smooth and steady.' },
      { id: 'pump2', tap: 'pump', hide: ['tireflat'], show: ['tirefull'], ask: 'Keep pumping. Tap the pump again.', done: 'The tire is round again.' },
      { id: 'check', tap: 'tirefull', ask: 'Is it firm enough? Squeeze the tire. Tap it.', done: 'It feels firm. The right amount of air is printed on the side of the tire. A grown-up can check it with a gauge.' },
      { id: 'capback', tap: 'valve', show: ['cap'], ask: 'Last, put the cap back on. Tap the valve.', done: 'Cap back on. Ready to ride!' },
    ],
    finish: 'You pumped up a tire! Now the bike rolls easily again.',
    real: 'With a grown-up, check the tires on a bike or a scooter. Squeeze them: are they firm?',
    again: 'Pump again',
  },
  // Being a good neighbor in the town square: five small kindnesses, in any order.
  'good-neighbor': {
    id: 'good-neighbor', place: 'square', focus: [5.6, 2.2, 4.8], view: { angle: 10, tilt: 30, dist: 16 }, title: 'Be a good neighbor',
    start: 'The town square is full of neighbors. Some could use a kind word or a hand. Look around and tap someone.',
    steps: [
      { id: 'spill', item: 'shopper', home: 'shopper', kind: 'tap', hide: ['spill'], done: 'Oh no, their apples spilled! You help pick them up. Thank you, they say.' },
      { id: 'newkid', item: 'newkid', home: 'newkid', kind: 'tap', done: 'This child is new here, and alone. You say: Hi! I am glad you are here. Do you want to play?' },
      { id: 'sadkid', item: 'sadkid', home: 'sadkid', kind: 'tap', done: 'Someone looks sad. You sit nearby and ask: Are you OK? Sometimes just listening is the best help.' },
      { id: 'swing', item: 'swingkids', home: 'swingkids', kind: 'tap', done: 'Two of you want the same swing. Take turns: you go first, then me. Fair is fun.' },
      { id: 'elder', item: 'elder', home: 'elder', kind: 'tap', done: 'Your neighbor has a heavy bag. You ask first: May I help you carry it? Asking first is polite.' },
    ],
    finish: 'You were a good neighbor today. Kindness makes the whole village better.',
    real: 'Today, find one small way to help someone at home or at school. Notice how it feels.',
    again: 'Do it again',
  },
  // ---- more to do at home (17 Nov 2026) ----
  // Setting a table, the plain American way: plate in the middle, fork on the left, knife on the right with its blade
  // facing the plate, spoon to the right of the knife, cup above the knife. "Fork" and "left" have four letters each,
  // "knife" and "right" five: the old way children remember it.
  'set-table': {
    id: 'set-table', place: 'kitchen', title: 'Set the table', focus: [11.5, 2.4, 5.2], view: { angle: 8, tilt: 50, dist: 7.5 },
    start: 'Dinner is soon. Can you set the table? Tap something on the table.',
    steps: [
      { id: 'plate', item: 'tplate', home: 'spotplate', kind: 'move', to: [10.95, 2.44, 5.75], pick: 'A plate. Where does it go?', miss: 'The plate goes in the middle, in front of where you sit. Look for its shape on the mat.', done: 'The plate goes in the middle.' },
      { id: 'fork', item: 'tfork', home: 'spotfork', kind: 'move', to: [10.55, 2.44, 5.85], pick: 'A fork. Left of the plate, or right?', miss: 'The fork goes on the left of the plate. Fork and left both have four letters.', done: 'Fork on the left. Fork and left both have four letters.' },
      { id: 'knife', item: 'tknife', home: 'spotknife', kind: 'move', to: [12.3, 2.44, 5.85], pick: 'A knife. Left of the plate, or right?', miss: 'The knife goes on the right of the plate, with the blade facing the plate. Knife and right both have five letters.', done: 'Knife on the right, blade facing the plate. Knife and right both have five letters.' },
      { id: 'spoon', item: 'tspoon', home: 'spotspoon', kind: 'move', to: [12.58, 2.44, 5.85], pick: 'A spoon. Where does it go?', miss: 'The spoon goes on the right too, next to the knife.', done: 'Spoon on the right, next to the knife.' },
      { id: 'cup', item: 'tcup', home: 'spotcup', kind: 'move', to: [12.25, 2.44, 5.3], pick: 'A cup. Where does it go?', miss: 'The cup goes at the top right, above the knife.', done: 'Cup at the top right, above the knife.' },
    ],
    finish: 'The table is set! Plate in the middle, fork on the left, knife and spoon on the right, cup at the top.',
    real: 'Help set the table at your next meal. Count how many people are eating first, then set a place for each one.',
    again: 'Set it again',
  },
  // Cold food in the fridge, dry food in the cupboard (USDA food safety: milk, eggs and cheese are kept cold; dry pasta,
  // cereal and unopened cans keep in a cool, dry cupboard; leftovers from an opened can go in the fridge).
  'groceries': {
    id: 'groceries', place: 'kitchen', title: 'Put the shopping away', focus: [5.6, 2.0, 5.0], view: { angle: 4, tilt: 32, dist: 19 },
    start: 'We just got back from the market. Help put the shopping away. Tap something by the bag.',
    steps: [
      { id: 'milk', item: 'gmilk', home: 'fridge', kind: 'move', to: [1.4, 2.0, 2.3], hide: ['gmilk'], pick: 'Milk. Fridge, or cupboard?', miss: 'Milk goes bad if it gets warm. It goes in the fridge.', done: 'Milk in the fridge, to keep it cold.' },
      { id: 'eggs', item: 'geggs', home: 'fridge', kind: 'move', to: [1.4, 2.0, 2.3], hide: ['geggs'], pick: 'Eggs. Fridge, or cupboard?', miss: 'Eggs need to stay cold too. They go in the fridge.', done: 'Eggs in the fridge.' },
      { id: 'cheese', item: 'gcheese', home: 'fridge', kind: 'move', to: [1.4, 2.0, 2.3], hide: ['gcheese'], pick: 'Cheese. Fridge, or cupboard?', miss: 'Cheese is made from milk. It stays cold in the fridge.', done: 'Cheese in the fridge.' },
      { id: 'pasta', item: 'gpasta', home: 'pantry', kind: 'move', to: [10.45, 1.125, 1.6], pick: 'Dry pasta. Fridge, or cupboard?', miss: 'Dry pasta keeps for a long time in a dry cupboard. Try the cupboard.', done: 'Pasta in the cupboard. It stays dry there.' },
      { id: 'cereal', item: 'gcereal', home: 'pantry', kind: 'move', to: [9.75, 1.125, 1.45], pick: 'Cereal. Fridge, or cupboard?', miss: 'Cereal stays crunchy in a dry cupboard. Try the cupboard.', done: 'Cereal in the cupboard, to stay crunchy.' },
      { id: 'beans', item: 'gbeans', home: 'pantry', kind: 'move', to: [10.45, 2.375, 1.4], pick: 'A can of beans. Fridge, or cupboard?', miss: 'Food in a closed can keeps for a long time. It goes in the cupboard.', done: 'The can goes in the cupboard. Once it is open, leftovers go in the fridge.' },
    ],
    finish: 'All put away! Cold things in the fridge, dry things in the cupboard.',
    real: 'Next time your family gets groceries, help put them away. Ask: does this go in the fridge, or the cupboard?',
    again: 'Put it away again',
  },
  // Look outside first, then dress for it. The sun hat and the sandals are good things on another day: tapping them
  // says why they are not for today.
  'dress-weather': {
    id: 'dress-weather', place: 'room', title: 'Dress for the weather', focus: [11.2, 2.6, 3.0], view: { angle: 10, tilt: 18, dist: 10.5 },
    setup: { show: ['rain'] }, decoys: ['sunhat', 'sandals'],
    start: 'Look out the window: it is raining! What should you wear outside today? Tap something on the rack.',
    steps: [
      { id: 'coat', item: 'raincoat', home: 'me', kind: 'move', to: [9.9, 2.0, 4.3], hide: ['raincoat'], show: ['coaton'], pick: 'A raincoat. It keeps the rain off. Put it on: tap yourself.', miss: 'Put it on you. Tap yourself, standing by the window.', done: 'Raincoat on, hood up. The rain runs right off.' },
      { id: 'boots', item: 'boots', home: 'me', kind: 'move', to: [9.9, 1.2, 4.3], hide: ['boots'], show: ['bootson'], pick: 'Rain boots. They keep your feet dry. Put them on: tap yourself.', miss: 'Put them on you. Tap yourself, standing by the window.', done: 'Rain boots on. Now you can splash in puddles!' },
      { id: 'umbrella', item: 'umbrella', home: 'me', kind: 'move', to: [9.9, 2.0, 4.3], hide: ['umbrella'], show: ['umbrellaon'], pick: 'An umbrella. Take it with you: tap yourself.', miss: 'Give it to you. Tap yourself, standing by the window.', done: 'Umbrella open. It keeps your head dry.' },
    ],
    finish: 'Ready for the rain: a raincoat, rain boots and an umbrella. You will stay warm and dry.',
    real: 'Tomorrow morning, look out the window before you get dressed. Is it sunny, rainy, hot or cold? Pick clothes to match.',
    again: 'Dress again',
  },
  // Packing the night before: everything for school in the bag, the toy stays home, then zip it.
  'pack-bag': {
    id: 'pack-bag', place: 'room', title: 'Pack your backpack', focus: [10.4, 1.7, 5.4], view: { angle: 14, tilt: 46, dist: 13.5 },
    decoys: ['toycar'], notYet: 'First, put everything you need in the backpack.',
    start: 'Tomorrow is a school day. Pack your backpack tonight, so the morning is easy. Tap something you need.',
    steps: [
      { id: 'folder', item: 'folder', home: 'backpack', kind: 'move', to: [11.6, 2.2, 7.9], hide: ['folder'], pick: 'Your homework folder. You need it at school. Where does it go?', miss: 'Put it in your backpack. Tap the backpack.', done: 'Homework folder in the backpack.' },
      { id: 'pencils', item: 'pencils', home: 'backpack', kind: 'move', to: [11.6, 2.2, 7.9], hide: ['pencils'], pick: 'Your pencil case. You need it at school.', miss: 'Put it in your backpack. Tap the backpack.', done: 'Pencil case in.' },
      { id: 'lunch', item: 'lunch', home: 'backpack', kind: 'move', to: [11.6, 2.2, 7.9], hide: ['lunch'], pick: 'Your lunch box.', miss: 'Put it in your backpack. Tap the backpack.', done: 'Lunch box in.' },
      { id: 'bottle', item: 'bottle', home: 'backpack', kind: 'move', to: [11.6, 2.2, 7.9], hide: ['bottle'], pick: 'Your water bottle.', miss: 'Put it in your backpack. Tap the backpack.', done: 'Water bottle in. Sips of water help you feel good all day.' },
      { id: 'zip', item: 'backpack', kind: 'tap', after: true, ask: 'Everything is in. Zip it up: tap the backpack.', done: 'Zipped up, so nothing falls out.' },
    ],
    finish: 'All packed! Packing the night before makes the morning calm.',
    real: 'Tonight, pack your own bag for tomorrow with a grown-up. Then put it by the door.',
    again: 'Pack again',
  },
  // The school bus, from NHTSA's school bus safety advice (checked 17 Nov 2026): be at the stop early, wait three giant
  // steps (6 feet) back from the curb, wait until the bus stops and the driver says it is OK, hold the handrail, sit and
  // face the front; if you drop something near the bus, tell the driver and never reach for it.
  'bus-stop': {
    id: 'bus-stop', place: 'busstop', title: 'Wait for the school bus', kind: 'order', focus: [6.4, 1.6, 4.6], view: { angle: 16, tilt: 32, dist: 15 },
    start: 'You are at the bus stop five minutes early, so you never have to run for the bus. Where do you wait? Tap the yellow square.',
    steps: [
      { id: 'back', tap: 'safespot', hide: ['mestart'], show: ['mewait', 'bus', 'driver', 'rail'], ask: 'Wait three giant steps back from the curb. Tap the yellow square.', done: 'Three giant steps back, about 6 feet. The bus cannot reach you here. Here it comes! You stay on your square until it stops and the door opens.' },
      { id: 'ok', tap: 'driver', ask: 'The bus stopped. Now wait for the driver to say it is OK. Tap the driver.', done: 'The driver smiles and waves you on: OK! Say good morning.' },
      { id: 'rail', tap: 'rail', hide: ['mewait'], ask: 'Hold the handrail and go up the steps. Tap the handrail.', done: 'Hand on the rail, one step at a time.' },
      { id: 'sit', tap: 'bus', ask: 'Find a seat, sit down, and face the front. Tap the bus.', done: 'Sitting down, facing the front, your bag on your lap.' },
    ],
    finish: 'You are on the bus, safe and ready for school!',
    real: 'With a grown-up, visit your bus stop and count three giant steps back from the curb together. If you drop something near the bus, tell the driver. Never reach for it.',
    again: 'Wait again',
  },
  // Ready to learn: put your things away and sit down (B, 17 Nov 2026: "School and bus stop").
  'ready-class': {
    id: 'ready-class', place: 'school', title: 'Get ready to learn', focus: [5.4, 1.9, 4.0], view: { angle: 22, tilt: 38, dist: 15 },
    notYet: 'First, put all your things away.',
    start: 'Good morning! Before class starts, put your things away. Tap something you brought.',
    steps: [
      { id: 'backpack', item: 'backpack', home: 'hooks', kind: 'move', to: [1.5, 2.35, 1.2], pick: 'Your backpack. Where does it go?', miss: 'Backpacks hang on the hooks. Tap the hooks.', done: 'Backpack on its hook, out of the way.' },
      { id: 'coat', item: 'coat', home: 'hooks', kind: 'move', to: [2.65, 1.6, 1.2], pick: 'Your coat. Where does it go?', miss: 'Coats hang on the hooks too. Tap the hooks.', done: 'Coat hung up, so it stays clean and dry.' },
      { id: 'lunch', item: 'lunch', home: 'cubby', kind: 'move', to: [9.15, 1.07, 1.25], pick: 'Your lunch box. Where does it go?', miss: 'Lunch goes in your cubby until lunch time. Tap the cubbies.', done: 'Lunch in your cubby.' },
      { id: 'folder', item: 'folder', home: 'tray', kind: 'move', to: [9.65, 2.16, 3.6], pick: 'Your homework folder. Who needs it?', miss: 'Homework goes in the teacher\'s tray. Tap the tray.', done: 'Homework handed in. Your teacher will read it.' },
      { id: 'sit', item: 'mydesk', kind: 'tap', after: true, ask: 'Everything is put away. Now sit at your desk: tap your desk.', done: 'Sitting at your desk, ready to learn. Say good morning to your teacher!' },
    ],
    finish: 'Ready to learn! Your things are put away, and your hands and mind are free.',
    real: 'At school tomorrow, put your things away first, then say good morning to your teacher.',
    again: 'Start the day again',
  },
  // The feelings corner (PEOPLE-SKILLS.md #1): notice a big feeling, name it, calm down, then help. From the social and
  // emotional learning research (Durlak and colleagues 2011: steps in order, practised by doing, named plainly), the PATHS
  // "turtle" (stop, go in your shell, breathe, think) and Gottman's emotion coaching (name the feeling before solving it).
  'big-feeling': {
    id: 'big-feeling', place: 'school', title: 'A big feeling', kind: 'order', focus: [9.6, 1.6, 6.6], view: { angle: 18, tilt: 30, dist: 9 },
    start: 'Oh no! Your friend\'s block tower fell down. Tap your friend.',
    steps: [
      { id: 'notice', tap: 'pal', ask: 'Your friend\'s block tower fell down. Tap your friend.', done: 'Your friend is crying.' },
      { id: 'name', tap: 'facesad', ask: 'How does she feel? Tap the face that matches.', not: {
        facehappy: 'Happy is a smile. Look again: she is crying.',
        facemad: 'Mad is when something feels unfair. Look again: she is crying, not shouting.',
        facescared: 'Scared is when something might hurt you. Her tower fell, and nothing is chasing her.',
      }, done: 'Sad. You named the feeling. Saying it out loud can make a big feeling a little smaller.' },
      { id: 'turtle', tap: 'turtle', ask: 'When a feeling is big, do the turtle. Tap the turtle.', done: 'Stop, like a turtle in its shell. Take a slow breath in, and let it out. Now think: what could help?' },
      { id: 'ask', tap: 'pal', ask: 'Ask your friend first: do you want help? Tap your friend.', done: 'Your friend says: yes, please.' },
      { id: 'build', tap: 'blocksdown', hide: ['blocksdown', 'pal'], show: ['towerup', 'palhappy'], ask: 'Build the tower again, together. Tap the blocks.', done: 'Block by block, together. The new tower is even taller.' },
      { id: 'again', tap: 'facehappy', ask: 'Look at your friend now. How does she feel? Tap the face.', not: {
        facesad: 'She was sad before. Look at her now: a big smile.',
        facemad: 'Mad has a frown. Look at her now: a big smile.',
        facescared: 'Scared has big round eyes. Look at her now: a big smile.',
      }, done: 'Happy! Feelings change. Even big ones pass.' },
    ],
    finish: 'You noticed a big feeling, named it, calmed down with the turtle, and helped your friend. That is being a good friend.',
    real: 'At home, when a feeling is big, try the turtle with a grown-up: stop, take a slow breath, and think. Then say the feeling out loud: I feel sad.',
    again: 'Help again',
  },
  // A small cut, from the Mayo Clinic's first aid for cuts and scrapes (checked 17 Nov 2026), told for a child: tell a
  // grown-up first; wash your hands; press gently with a clean cloth until it stops bleeding; rinse under clean running
  // water, with no soap in the cut; cover it with a bandage. A cut that will not stop bleeding needs a grown-up and a doctor.
  'small-cut': {
    id: 'small-cut', place: 'clinic', title: 'Take care of a small cut', kind: 'order', close: 6, focus: [3.4, 1.9, 2.6], view: { angle: 18, tilt: 28, dist: 12 },
    start: 'Ouch! You scraped your knee. It is small, and you know what to do. First, tell a grown-up. Tap the nurse.',
    steps: [
      { id: 'tell', tap: 'nurse', look: [4.9, 1.7, 3.0], close: 9.5, ask: 'First, tell a grown-up. Tap the nurse.', done: 'Telling a grown-up is always the first step. They will help you.' },
      { id: 'wash', tap: 'faucet', show: ['stream'], ask: 'Wash your hands with soap and water. Tap the tap.', done: 'Clean hands, so no germs get into the cut.' },
      { id: 'press', tap: 'cloth', hide: ['stream'], ask: 'Press gently on the cut with a clean cloth. Tap the cloth.', done: 'Press gently until the bleeding stops. Small cuts stop soon.' },
      { id: 'rinse', tap: 'faucet', show: ['stream'], ask: 'Rinse the cut under clean running water. Tap the tap.', done: 'Clean water washes the dirt away. Soap goes around the cut, not in it.' },
      { id: 'cover', tap: 'bandages', hide: ['stream', 'scrape'], show: ['bandageon'], ask: 'Cover it with a bandage. Tap the bandages.', done: 'A bandage keeps it clean while it heals. Change it every day, or when it gets wet or dirty.' },
    ],
    finish: 'All taken care of! Your knee will heal.',
    real: 'Ask a grown-up to show you where your family keeps bandages. A cut that will not stop bleeding, or a big or deep one, needs a grown-up and a doctor right away.',
    again: 'Practice again',
  },
  // A checkup: what happens, so it is not scary. Children have one about once a year (AAP Bright Futures schedule).
  'checkup': {
    id: 'checkup', place: 'clinic', title: 'Go for a checkup', kind: 'order', focus: [9.2, 2.0, 2.4], view: { angle: 16, tilt: 28, dist: 12 },
    start: 'Time for your checkup! The doctor helps you stay healthy as you grow. First, how tall are you? Tap the height chart.',
    steps: [
      { id: 'tall', tap: 'chart', ask: 'Stand tall by the height chart. Tap the chart.', done: 'Look how tall you are! You grow a little more every year.' },
      { id: 'weigh', tap: 'scale', ask: 'Step on the scale. Tap the scale.', done: 'The scale shows how you are growing. Every body grows in its own way.' },
      { id: 'heart', tap: 'steth', ask: 'The doctor listens to your heart. Tap the stethoscope.', done: 'Thump-thump, thump-thump. It is only listening. It does not hurt.' },
      { id: 'ears', tap: 'earlight', ask: 'Next, a little light to look in your ears. Tap the ear light.', done: 'Hold still for a moment. A quick look, and it does not hurt.' },
      { id: 'ask', tap: 'doctor', ask: 'Now you can ask the doctor a question. Tap the doctor.', done: 'Asking questions is smart. Doctors like to answer them.' },
    ],
    finish: 'Checkup done! You are growing well.',
    real: 'Before your next checkup, think of one question to ask your doctor. A grown-up can help you write it down.',
    again: 'Do another checkup',
  },
  // Baking muffins: measuring, mixing, and kitchen safety. The CDC's "Say No to Raw Dough" (as reported, checked 17 Nov
  // 2026): raw flour and raw eggs can carry germs (E. coli, Salmonella), so never eat raw dough or batter; cooking makes it safe.
  'bake-muffins': {
    id: 'bake-muffins', place: 'bakery', title: 'Bake muffins', kind: 'order', close: 6.5, focus: [3.0, 2.3, 3.4], view: { angle: 18, tilt: 32, dist: 12 },
    start: 'Let us bake muffins with the baker! Bakers start with clean hands. Tap the tap.',
    steps: [
      { id: 'wash', tap: 'faucet', show: ['stream'], ask: 'Wash your hands first. Tap the tap.', done: 'Clean hands for clean food.' },
      { id: 'flour', tap: 'flour', hide: ['stream'], show: ['flourin'], ask: 'Measure one cup of flour. Tap the flour.', done: 'One cup of flour. Scoop it, then scrape the top flat, so it is just the right amount.' },
      { id: 'egg', tap: 'eggs', hide: ['flourin'], show: ['eggin'], ask: 'Add one egg. Tap the eggs.', done: 'Crack! One egg in the bowl.' },
      { id: 'milk', tap: 'milk', ask: 'Pour in some milk. Tap the milk.', done: 'Half a cup of milk. Measuring right makes muffins come out right.' },
      { id: 'stir', tap: 'spoon', hide: ['eggin'], show: ['batter'], ask: 'Stir it all together. Tap the spoon.', done: 'Stir, stir, stir, until it is smooth batter.' },
      { id: 'pan', tap: 'pan', hide: ['batter'], show: ['panfull'], ask: 'Spoon the batter into the muffin cups. Tap the pan.', done: 'Batter in every cup. No tasting yet! Raw batter can have germs that make you sick.' },
      { id: 'oven', tap: 'baker', hide: ['panfull', 'pan'], show: ['muffins'], ask: 'The oven is very hot, so the baker puts the pan in. Tap the baker.', done: 'The baker uses oven mitts. The heat bakes them, and baking makes them safe to eat. Let them cool a little first.' },
    ],
    finish: 'Muffins! You measured, mixed, and waited. That is baking.',
    real: 'Bake something with a grown-up. You measure and stir; the grown-up handles the hot oven. Never eat raw dough or batter.',
    again: 'Bake again',
  },
  // Sharing fairly: deal eight cookies out to four friends, one at a time, and everyone gets the same (early division).
  'share-fair': {
    id: 'share-fair', place: 'bakery', title: 'Share fairly', kind: 'order', focus: [8.6, 2.3, 5.4], view: { angle: 12, tilt: 36, dist: 9 },
    start: 'Eight cookies, four friends. Share them fairly: give them out one at a time. Tap the first plate.',
    steps: [1, 2, 3, 4, 1, 2, 3, 4].map((p, i) => {
      const n = ['first', 'second', 'third', 'fourth'][p - 1], round = i < 4 ? 1 : 2;
      return { id: 'give' + (i + 1), tap: 'plate' + p, show: ['c' + p + round], ask: (i === 4 ? 'Everyone has one. Round again! ' : '') + 'Tap the ' + n + ' plate.', done: i < 4 ? 'One for the ' + n + ' friend.' : 'Two for the ' + n + ' friend.' };
    }),
    finish: 'Eight cookies, four friends: two each. Fair! Sharing into equal parts is called dividing.',
    real: 'Next time you share a snack, give it out one at a time, so everyone gets the same.',
    again: 'Share again',
  },
  // Which part of the plant do we eat? Carrots and beets are roots; lettuce and cabbage are leaves; tomatoes and
  // pumpkins are fruits, the part that holds the seeds (plant science, as taught in school gardens).
  'plant-parts': {
    id: 'plant-parts', place: 'farmstand', title: 'Which part do we eat?', focus: [3.3, 1.8, 5.0], view: { angle: 12, tilt: 40, dist: 11 },
    start: 'All this food grew on plants. But which part of the plant do we eat? Tap a food on the cart.',
    steps: [
      { id: 'carrot', item: 'carrot', home: 'rootbin', kind: 'move', to: [1.15, 1.1, 6.25], stack: 'root', grid: true, pick: 'A carrot. Which part of the plant is it?', miss: 'A carrot grows under the ground. It is a root. Tap the root crate.', done: 'A carrot is a root. Roots drink water from the soil.' },
      { id: 'beet', item: 'beet', home: 'rootbin', kind: 'move', to: [1.15, 1.1, 6.25], stack: 'root', grid: true, pick: 'A beet. Which part of the plant is it?', miss: 'A beet grows under the ground too. Tap the root crate.', done: 'A beet is a root too.' },
      { id: 'lettuce', item: 'lettuce', home: 'leafbin', kind: 'move', to: [2.95, 1.1, 6.25], stack: 'leaf', grid: true, pick: 'Lettuce. Which part of the plant is it?', miss: 'Lettuce is a bunch of leaves. Tap the leaf crate.', done: 'Lettuce is leaves. Leaves catch sunlight to make the plant\'s food.' },
      { id: 'cabbage', item: 'cabbage', home: 'leafbin', kind: 'move', to: [2.95, 1.1, 6.25], stack: 'leaf', grid: true, pick: 'A cabbage. Which part of the plant is it?', miss: 'A cabbage is leaves wrapped tight in a ball. Tap the leaf crate.', done: 'A cabbage is leaves, wrapped up tight.' },
      { id: 'tomato', item: 'tomato', home: 'fruitbin', kind: 'move', to: [4.75, 1.1, 6.25], stack: 'fruit', grid: true, pick: 'A tomato. Which part of the plant is it?', miss: 'A tomato has seeds inside, so it is a fruit. Tap the fruit crate.', done: 'A tomato is a fruit! A fruit is the part that holds the seeds.' },
      { id: 'pumpkin', item: 'pumpkin', home: 'fruitbin', kind: 'move', to: [4.75, 1.1, 6.25], stack: 'fruit', grid: true, pick: 'A pumpkin. Which part of the plant is it?', miss: 'A pumpkin is full of seeds, so it is a fruit. Tap the fruit crate.', done: 'A pumpkin is a fruit too, full of seeds.' },
    ],
    finish: 'Roots, leaves and fruits: you sorted them all!',
    real: 'At dinner, look at your vegetables with a grown-up. Is it a root, a leaf, or a fruit with seeds?',
    again: 'Sort again',
  },
  // Washing fresh food, from the FDA's tips for cleaning fruits and vegetables (as reported, checked 17 Nov 2026): rinse
  // under running water; no soap; scrub firm produce with a clean brush; dry with a clean cloth.
  'wash-produce': {
    id: 'wash-produce', place: 'farmstand', title: 'Wash fresh food', kind: 'order', close: 6, work: 'carrots', focus: [9.2, 1.8, 5.2], view: { angle: 16, tilt: 34, dist: 10 },
    start: 'These carrots just came out of the ground. Wash them before you eat them. Tap the carrots.',
    steps: [
      { id: 'pick', tap: 'carrots', ask: 'Tap the muddy carrots.', done: 'Dirt and germs can ride along from the farm.' },
      { id: 'rinse', tap: 'spigot', show: ['stream'], ask: 'Rinse them under running water. Tap the tap.', done: 'Cool running water. No soap: soap is for hands, not for food.' },
      { id: 'scrub', tap: 'brush', ask: 'Carrots are firm, so give them a scrub. Tap the brush.', done: 'Scrub, scrub, with a clean brush.' },
      { id: 'dry', tap: 'cloth', hide: ['stream', 'carrots'], show: ['carrotsclean'], ask: 'Pat them dry. Tap the clean cloth.', done: 'Pat, pat, dry.' },
    ],
    finish: 'Clean carrots, ready to eat!',
    real: 'Help a grown-up wash fruits and vegetables: running water, a scrub for firm ones, and no soap.',
    again: 'Wash again',
  },
  // Helping a neighbor with their dog. Dog safety from the AVMA's bite prevention advice (as reported, checked 17 Nov
  // 2026): ask the owner before petting, even a dog you know; let the dog sniff you first; pet gently on the back, not the
  // face, ears or tail. Then the care: fresh water, the right amount of food, a leash, bags to pick up after it.
  'pet-care': {
    id: 'pet-care', place: 'pethouse', title: 'Help with the dog', kind: 'order', close: 6.5, focus: [6.2, 1.8, 3.4], view: { angle: 16, tilt: 32, dist: 11 },
    start: 'Your neighbor asked you to help with their dog today. Before you pet any dog, ask the owner first. Tap your neighbor.',
    steps: [
      { id: 'ask', tap: 'neighbor2', look: [5.6, 2.0, 3.0], close: 7.5, ask: 'Ask the owner first. Tap your neighbor.', done: 'Your neighbor says yes. Always ask first, even for a dog you know.' },
      { id: 'pet', tap: 'dog', ask: 'Now say hello to the dog. Tap the dog.', done: 'Hold out your hand and let the dog sniff it. Then pet gently on the back, not the face, ears or tail.' },
      { id: 'water', tap: 'waterbowl', show: ['water'], ask: 'Give the dog fresh water. Tap the water bowl.', done: 'Fresh, clean water. Dogs need it every day.' },
      { id: 'food', tap: 'foodbag', show: ['kibble'], ask: 'Feed the dog. Tap the food bag.', done: 'One scoop, the amount your neighbor showed you. Too much food is not good for a dog.' },
      { id: 'leash', tap: 'leash', show: ['leashon'], hide: ['leash'], ask: 'Time for a walk. Tap the leash.', done: 'Leash on, so the dog stays safe and close.' },
      { id: 'bags', tap: 'bags', ask: 'Take bags for the walk. Tap the green bags.', done: 'Pick up after the dog with a bag, then wash your hands at home.' },
    ],
    finish: 'The dog is happy, fed, and ready for a walk with your neighbor!',
    real: 'Always ask before you pet a dog, even one you know. Let it sniff your hand first, and pet gently on the back.',
    again: 'Help again',
  },
  // Laundry, from the life skills list (LIFE-SKILLS-GAPS.md: sort colors, match socks): lights and darks wash apart, so
  // dark dye cannot tint the light clothes; a grown-up runs the machine.
  'sort-laundry': {
    id: 'sort-laundry', place: 'laundry', title: 'Sort the laundry', focus: [5.0, 1.6, 3.4], view: { angle: 14, tilt: 42, dist: 11 },
    notYet: 'First, sort all the clothes.',
    start: 'Your neighbor is doing laundry. Help sort it: light colors in one basket, dark colors in the other. Tap a piece of clothing.',
    steps: [
      { id: 'whiteshirt', item: 'whiteshirt', home: 'lightbasket', kind: 'move', to: [4.5, 1.3, 1.6], hide: ['whiteshirt'], pick: 'A white shirt. Light or dark?', miss: 'White is a light color. Tap the basket with the light square.', done: 'White goes with the lights.' },
      { id: 'creamtowel', item: 'creamtowel', home: 'lightbasket', kind: 'move', to: [4.5, 1.3, 1.6], hide: ['creamtowel'], pick: 'A cream towel. Light or dark?', miss: 'Cream is a light color. Tap the basket with the light square.', done: 'Cream is light too.' },
      { id: 'yellowshirt', item: 'yellowshirt', home: 'lightbasket', kind: 'move', to: [4.5, 1.3, 1.6], hide: ['yellowshirt'], pick: 'A yellow shirt. Light or dark?', miss: 'Yellow is a light color. Tap the basket with the light square.', done: 'Yellow goes with the lights.' },
      { id: 'jeans', item: 'jeans', home: 'darkbasket', kind: 'move', to: [6.1, 1.3, 1.6], hide: ['jeans'], pick: 'Blue jeans. Light or dark?', miss: 'Jeans are a dark color. Tap the basket with the dark square.', done: 'Jeans go with the darks. Their blue dye could tint light clothes.' },
      { id: 'blackshirt', item: 'blackshirt', home: 'darkbasket', kind: 'move', to: [6.1, 1.3, 1.6], hide: ['blackshirt'], pick: 'A black shirt. Light or dark?', miss: 'Black is a dark color. Tap the basket with the dark square.', done: 'Black goes with the darks.' },
      { id: 'navytowel', item: 'navytowel', home: 'darkbasket', kind: 'move', to: [6.1, 1.3, 1.6], hide: ['navytowel'], pick: 'A navy towel. Light or dark?', miss: 'Navy is a dark blue. Tap the basket with the dark square.', done: 'Navy is dark.' },
      { id: 'wash', item: 'washer', kind: 'tap', after: true, ask: 'All sorted! A grown-up starts the washer. Tap the washer.', done: 'Your neighbor starts the wash. Lights first, then darks.' },
    ],
    finish: 'Sorted and washing! Lights with lights, darks with darks.',
    real: 'Next laundry day, help sort the clothes: lights in one pile, darks in the other. A grown-up runs the machine.',
    again: 'Sort again',
  },
  'match-socks': {
    id: 'match-socks', place: 'laundry', title: 'Match the socks', focus: [6.4, 1.8, 6.1], view: { angle: 6, tilt: 50, dist: 11 },
    start: 'Socks come in pairs. Find each sock\'s match. Tap a sock on the floor.',
    steps: [
      { id: 'red', item: 'redsock2', home: 'redsock1', kind: 'move', to: [7.8, 2.19, 6.47], pick: 'A red sock. Where is the other red one?', miss: 'Look for the other red sock on the table, and tap it.', done: 'A red pair!' },
      { id: 'blue', item: 'bluesock2', home: 'bluesock1', kind: 'move', to: [8.6, 2.19, 6.47], pick: 'A blue sock. Where is its match?', miss: 'Look for the other blue sock on the table, and tap it.', done: 'A blue pair!' },
      { id: 'stripe', item: 'stripesock2', home: 'stripesock1', kind: 'move', to: [9.4, 2.19, 6.47], pick: 'A striped sock. Find the one with the same stripes.', miss: 'Same color, same stripes. Look on the table, and tap it.', done: 'A striped pair! Same color, same pattern.' },
    ],
    finish: 'Three pairs, all matched!',
    real: 'After the wash at home, help match the socks: look for the same color and the same pattern.',
    again: 'Match again',
  },
  // Washing your face, from the American Academy of Dermatology's advice as reported (HealthDay, checked 17 Nov 2026):
  // warm water, not hot; a gentle face wash on your fingertips; rinse; pat dry with a clean towel; no more than twice a
  // day, and after sweating.
  'wash-face': {
    id: 'wash-face', close: 5, place: 'bathroom', title: 'Wash your face', kind: 'order', focus: [6.2, 3.85, 1.9], view: { angle: 14, tilt: 14, dist: 8.6 },
    start: 'Time to wash your face. Turn on the water. Tap the tap.',
    steps: [
      { id: 'warm', tap: 'faucet', show: ['stream'], ask: 'Turn on the water. Tap the tap.', done: 'Warm water, not hot. Hot water dries out your skin.' },
      { id: 'wet', close: 7, tap: 'smile', show: ['facedrops'], ask: 'Splash water on your face. Tap your face in the mirror.', done: 'Splash! Your face is wet.' },
      { id: 'soap', tap: 'facewash', hide: ['facedrops'], show: ['facesuds'], ask: 'Now a little gentle face wash. Tap the face wash.', done: 'Rub it on with your fingertips, in small, gentle circles. Keep it away from your eyes.' },
      { id: 'rinse', close: 7, tap: 'smile', hide: ['facesuds'], show: ['facedrops'], ask: 'Rinse the soap away. Tap your face.', done: 'Rinse with warm water until all the soap is gone.' },
      { id: 'off', tap: 'faucet', hide: ['stream'], ask: 'Turn off the tap.', done: 'Tap off.' },
      { id: 'dry', tap: 'towel', hide: ['facedrops'], ask: 'Pat your face dry. Tap the towel.', done: 'Pat, pat, with a clean towel. No rubbing.' },
    ],
    finish: 'A fresh, clean face! Wash it in the morning and at night, and after you get sweaty.',
    real: 'Wash your face for real tonight, with warm water and a gentle face wash. A grown-up can help.',
    again: 'Wash again',
  },
  // Leaving the bathroom tidy and safe: towel hung up to dry, clothes in the laundry, the wet floor wiped (falls caused 81%
  // of bathroom injuries in a CDC study, MMWR 2011), and the light off when you leave.
  'tidy-bath': {
    id: 'tidy-bath', place: 'bathroom', title: 'Tidy the bathroom', focus: [6.6, 2.0, 4.8], view: { angle: 8, tilt: 38, dist: 19 },
    notYet: 'First, tidy everything up. Then the light.',
    start: 'Someone left the bathroom messy. Let us tidy it up. Tap something out of place.',
    steps: [
      { id: 'towel', item: 'floortowel', home: 'bar', kind: 'move', to: [1.6, 1.6, 1.02], hide: ['floortowel'], show: ['towelhung'], pick: 'A wet towel on the floor. Where does it go?', miss: 'Hang it on the towel bar, so it can dry. Tap the towel bar.', done: 'Hung up to dry. A wet towel left in a heap stays damp and smelly.' },
      { id: 'clothes', item: 'clothes', home: 'hamper', kind: 'move', to: [9.8, 2.0, 6.4], pick: 'Dirty clothes. Where do they go?', miss: 'Dirty clothes go in the laundry basket. Tap the basket.', done: 'In the laundry basket, ready for wash day.' },
      { id: 'puddle', item: 'puddle', kind: 'tap', hide: ['puddle'], done: 'Wiped up. Water on the floor is slippery, so wipe it up right away.' },
      { id: 'light', item: 'switch', kind: 'tap', after: true, ask: 'All tidy. Last thing: turn off the light when you leave. Tap the light switch.', done: 'Light off. That saves energy.' },
    ],
    finish: 'Tidy and safe! The towel can dry, the clothes are ready to wash, and nobody will slip.',
    real: 'After your next bath, hang up your towel, put your clothes in the laundry basket, and wipe up any splashes.',
    again: 'Make it messy to practice again',
  },
};

const NAMES = { feelrug: 'The feelings rug.', facehappy: 'A happy face.', facesad: 'A sad face.', facemad: 'A mad face.', facescared: 'A scared face.', turtle: 'The calm-down turtle.', towerup: 'Your new tower.', palhappy: 'Your friend, smiling again.', mestart: 'That is you, on the sidewalk.', buskid: 'Your neighbor, waiting for the bus too.', busgrown: 'Her grown-up, waiting with her.', neighbor2: 'Your neighbor, who owns the dog.', neighbor3: 'Your neighbor, doing the laundry.', couch: 'The couch.', water: 'Fresh water.', kibble: 'Dog food.', foodbowl: 'The food bowl.', dryer: 'The dryer.', lightbasket: 'The basket for light colors.', darkbasket: 'The basket for dark colors.', foldtable: 'The folding table.', redsock1: 'A red sock.', bluesock1: 'A blue sock.', stripesock1: 'A striped sock.', farmer: 'The farmer grew all this food.', cart: 'The cart.', rootbin: 'The root crate.', leafbin: 'The leaf crate.', fruitbin: 'The fruit crate: fruits hold the seeds.', tub: 'The washing tub.', washstand: 'A little table.', baker: 'The baker.', oven: 'The oven gets very hot. Only grown-ups use it.', loaves: 'Fresh loaves of bread.', island: 'The work table.', bowl: 'A big mixing bowl.', sharetable: 'The table.', friend1: 'A friend.', friend2: 'A friend.', friend3: 'A friend.', friend4: 'A friend.', kit: 'The first aid kit.', examtable: 'The exam table.', nurse: 'The nurse. Nurses help you feel better.', doctor: 'The doctor.', stopsign: 'The bus stop sign. The bus stops here.', mewait: 'That is you, waiting safely.', bus: 'The school bus.', driver: 'The bus driver. Say good morning!', teacher: 'Your teacher. Say good morning!', whiteboard: 'The whiteboard: today\'s morning message.', hooks: 'The hooks, for coats and backpacks.', cubby: 'The cubbies, one for each child.', tray: 'The homework tray.', tdesk: 'The teacher\'s desk.', mydesk: 'Your desk.', desk2: 'A friend\'s desk.', desk3: 'A friend\'s desk.', desk4: 'A friend\'s desk.', cbench: 'A bench by the door.', tplate: 'A plate.', mat3: 'A place mat. The shapes show where each thing goes.', spotplate: 'This shape shows where the plate goes.', spotfork: 'This shape shows where the fork goes.', spotknife: 'This shape shows where the knife goes.', spotspoon: 'This shape shows where the spoon goes.', spotcup: 'This shape shows where the cup goes.', dtable: 'The dining table.', dstool: 'A stool.', pantry: 'The cupboard, for food that keeps without the cold.', gbag: 'The shopping bag.', me: 'That is you, getting ready for the day.', rack: 'The clothes rack.', window2: 'Look outside: it is raining today.', rain: 'Rain! Everything outside is wet.', sunhat: 'A sun hat keeps the hot sun off your face. Today it is raining, so it can wait for a sunny day.', sandals: 'Sandals are for warm, sunny days. In the rain your feet would get wet and cold.', toycar: 'A toy car is fun, but toys stay home on school days. They can get lost or broken.', backpack: 'Your backpack.', facewash: 'Gentle face wash.', bar: 'The towel bar.', hamper: 'The laundry basket.', switch: 'The light switch.', towelhung: 'Your towel, drying.', helper: 'A neighbor who loves fixing things.', sewtable: 'The sewing table.', shirt: 'A shirt with a missing button.', bike: 'A bike on a stand.', tireflat: 'A flat tire. Squeeze it: squishy!', fountain: 'The fountain.', swing: 'The swings.', treeA: 'A tree.', treeB: 'A tree.', benchA: 'A bench.', spill: 'Spilled apples.', bag: 'A heavy bag.', pond2: 'The pond. Stay back from the edge unless a grown-up is right with you.', tree1: 'A big tree.', tree2: 'A tree.', flowers: 'Flowers. Look closely: who is visiting them?', bench2: 'A bench.', sign: 'The park sign.', clerk: 'The postal clerk. Say hello!', slots: 'Mail slots, sorted by street.', counter3: 'The post office counter.', writetable: 'A table for writing letters.', okbin: 'The OK to share bin.', askbin: 'The Ask a grown-up first bin.', librarian: 'The librarian. Librarians help you find books.', desk: 'The desk, with four big books.', case1: 'Shelves full of books.', case2: 'Shelves full of books.', globe: 'A globe: the whole world, round like a ball.', beanbag: 'A comfy beanbag for reading.', trueboard: 'The True board.', notboard: 'The Not true board.', storybin: 'The Story or teaching bin.', sellbin: 'The Trying to sell bin.', bugbook: 'The bug book.', spacebook: 'The space book.', birdbook: 'The bird book.', animalbook: 'The animal book.', rug2: 'The reading rug.', truck: 'A fire truck. Its ladder reaches high windows.', firefighter: 'A firefighter. Firefighters are helpers. Say hello!', table: 'Picture cards to sort.', callbin: 'The Call 9-1-1 bin.', grownbin: 'The Ask a grown-up bin.', phone: 'A pretend phone. It does not really call anyone.', practice: 'A practice house.', meet: 'The meeting place: a tree outside.', candy: 'Candy. It looks good, but it is a want, not a need, and it is not on your list.', toyshelf: 'Toys are fun, but they are a want, not a need. They are not on your list today.', cashier: 'The cashier. Say hello!', crate: 'A crate of apples. Take a bag.', cooler: 'The cooler keeps milk cold.', stand1: 'A fruit stand.', stand2: 'The bread shelf.', counter2: 'The counter, where you pay.', workbench: 'The workbench, with a vise to hold wood still.', pegboard: 'Tools hang here. The saw is sharp: only with a grown-up.', chair: 'A chair. Is it wobbly?', screwout: 'A screw sticking out.', plank: 'A plank of wood.', nailup: 'A nail sticking up. Ouch!', board: 'A board to measure.', wagon: 'A wagon. One wheel is loose.', boltloose: 'A loose bolt.', bed: 'A raised garden bed, full of soil.', bench: 'A bench.', tree: 'A tree.', fence1: 'The fence.', fence2: 'The fence.', plant: 'Your bean plant.', sprout: 'Your sprout.', pods: 'Bean pods.', mound: 'Your seed is under here.', island: 'The kitchen island: a counter to work on.', plates: 'Clean plates.', breadbag: 'A loaf of bread.', butter: 'Butter and a butter knife.', lettuce: 'A lettuce.', cheeseslices: 'Slices of cheese.', plate: 'Your plate.', slice1: 'Your sandwich.', slice2: 'Your sandwich.', leaf: 'Your sandwich.', cheeseon: 'Your sandwich.', butterlayer: 'Your sandwich.', plants: 'The plant basket.', animals: 'The animal basket.', tub: 'The bathtub.', mat: 'The bath mat.', mirror: 'The mirror.', brushcup2: 'Someone else\'s toothbrush. We each use our own.', fridge: 'The fridge keeps food cold.', stove: 'The stove gets hot. Only with a grown-up.', table: 'The kitchen table.', counter: 'The counter.', stool1: 'A stool.', stool2: 'A stool.', desk: 'Your desk.', chair: 'Your chair.', window: 'The window.', plant: 'A plant. It needs water and light.', rug: 'The rug.', lamp: 'Your lamp.' };

function fresh() { return { holding: null, done: {}, misses: {} }; }
function stepOf(task, id) { return task.steps.find((s) => s.id === id); }
function isDone(task, state) { return task.steps.every((s) => state.done[s.id]); }

// One tap. Returns { state, say, move?, glow?, lift?, finished? } and never changes the state passed in.
function tap(task, state0, thing) {
  const state = { holding: state0.holding, done: { ...state0.done }, misses: { ...state0.misses } };
  if (isDone(task, state)) return { state, say: task.finish };
  const first = task.steps.find((s) => s.first && !state.done[s.id]);
  const before = task.steps.filter((s) => !s.after), afters = task.steps.filter((s) => s.after);
  if (afters.length && afters.some((s) => s.item === thing) && !state.holding) {
    if (!before.every((s) => state.done[s.id])) return { state, say: task.notYet || 'First, find everything on your list.', glow: (before.find((s) => !state.done[s.id]) || {}).item };
    const nx = afters.find((s) => !state.done[s.id]);
    if (nx && nx.item !== thing) return { state, say: 'Not that one yet. ' + nx.ask, glow: nx.item };
    if (nx) { state.done[nx.id] = true; const nn = afters.find((s) => !state.done[s.id]); return finishIf(task, state, { state, say: nx.done + (nn ? ' ' + nn.ask : ''), swap: nx.kind === 'tap' ? nx.item : undefined, show: nx.show || [], hide: nx.hide || [] }); }
  }
  if (first && thing !== first.item) return { state, say: first.ask, glow: first.item };
  if (task.kind === 'order') {
    const i = task.steps.findIndex((s) => !state.done[s.id]), s = task.steps[i];
    if (s.not && s.not[thing]) { state.misses[s.id] = (state.misses[s.id] || 0) + 1; return { state, say: s.not[thing] + ' ' + s.ask, glow: state.misses[s.id] > 1 ? s.tap : null }; } // a first try: say what that one means
    if (thing === s.tap) { state.done[s.id] = true; const nx = task.steps[i + 1]; return finishIf(task, state, { state, say: s.done + (nx ? ' ' + nx.ask : ''), show: s.show || [], hide: s.hide || [] }); }
    if (task.steps.some((x) => x.tap === thing)) { state.misses[s.id] = (state.misses[s.id] || 0) + 1; return { state, say: 'Not that one yet. ' + s.ask, glow: s.tap }; } // a first try: say what comes next, and show it
    return { state, say: NAMES[thing] || '' };
  }
  if (task.decoys && task.decoys.includes(thing)) return { state, say: NAMES[thing] || '' }; // not for today: it says why
  // making the bed, or any one-tap step
  const t = task.steps.find((s) => s.kind === 'tap' && s.item === thing && !state.done[s.id]);
  if (t && !state.holding) { state.done[t.id] = true; const af = before.every((q) => state.done[q.id]) && afters.find((q) => !state.done[q.id]); return finishIf(task, state, { state, say: t.done + (af ? ' ' + af.ask : ''), swap: t.item, show: t.show || [], hide: t.hide || [] }); }
  if (state.holding) {
    const s = stepOf(task, state.holding);
    if (thing === s.home) { const to = landing(task, state, s); state.done[s.id] = true; state.holding = null; const af = task.steps.filter((q) => !q.after).every((q) => state.done[q.id]) && task.steps.find((q) => q.after && !state.done[q.id]); return finishIf(task, state, { state, say: s.done + (af ? ' ' + af.ask : ''), move: { item: s.item, to }, show: s.show || [], hide: s.hide || [] }); }
    if (thing === s.item) return { state, say: s.pick, lift: s.item, glow: state.misses[s.id] ? s.home : null };
    const other = task.steps.find((x) => x.item === thing && x.kind === 'move' && !state.done[x.id]);
    if (other) { state.holding = other.id; return { state, say: other.pick, lift: other.item, drop: s.item, glow: state.misses[other.id] ? other.home : null }; } // picked something else instead: fine
    state.misses[s.id] = (state.misses[s.id] || 0) + 1;
    return { state, say: s.miss, glow: s.home }; // a first try: say where it lives, and show it
  }
  const s = task.steps.find((x) => x.item === thing && x.kind === 'move' && !state.done[x.id]);
  if (s) { state.holding = s.id; return { state, say: s.pick, lift: s.item, glow: state.misses[s.id] ? s.home : null }; }
  return { state, say: NAMES[thing] || '' };
}
// Where a thing lands: things that share a stack (books on the shelf) pile up, one on top of the last.
function landing(task, state, s) { if (!s.stack) return s.to; const n = task.steps.filter((x) => x.stack === s.stack && state.done[x.id]).length; if (s.grid) return [s.to[0] + (n % 2) * 0.6, s.to[1], s.to[2] + (n >> 1) * 0.5]; return [s.to[0], s.to[1] + n / 8, s.to[2]]; }
function finishIf(task, state, r) { if (isDone(task, state)) { r.finished = true; r.say = r.say + ' ' + task.finish; } return r; }

// Saved state from the device is trusted only as far as it fits the task: unknown steps are dropped, nothing is undone.
function restore(task, saved) { const st = fresh(); if (saved && saved.done) for (const s of task.steps) if (saved.done[s.id] === true) st.done[s.id] = true; return st; }

// Every line a task can say, for the voice clips.
// The street's own lines (the walk between places).
const MARKET_LINES = ['First, sort all the picture cards.', 'Not that one yet. Now practice on the pretend phone. Tap the 9.', 'Not that one yet. Tap the 1.', 'Not that one yet. Tap the 1 again.', 'Nine. Tap the 1.', 'One. Tap the 1 again.', 'A hard puzzle is not an emergency. Ask a grown-up for help. Now practice on the pretend phone. Tap the 9.', 'Someone hurt who will not wake up is an emergency. Call 9-1-1. Now practice on the pretend phone. Tap the 9.', 'Fire is an emergency. Get out first, then call 9-1-1. Now practice on the pretend phone. Tap the 9.', 'A lost toy is sad, but it is not an emergency. Ask a grown-up to help you look. Now practice on the pretend phone. Tap the 9.', 'First, find everything on your list.', 'Not that one yet. Pay with your 10-dollar bill. Tap it.', 'Not that one yet. Everything on your list! Now take it to the counter. Tap the register.', 'Milk in the basket. Everything on your list! Now take it to the counter. Tap the register.', 'Apples in the basket. Everything on your list! Now take it to the counter. Tap the register.', 'Bread in the basket. Everything on your list! Now take it to the counter. Tap the register.', 'Bread is 2, apples are 3, milk is 1. That is 6 dollars in all. Pay with your 10-dollar bill. Tap it.'];
// [0] hello, [1] the first crossing, [2] a second crossing on the same walk (view.js townRoute), then the walks.
const STREET_LINES = ['Welcome to Void Village! Tap a place to walk there. Slide the map to look around.', 'Stop at the curb. Look left, look right, and look left again. All clear. Now we can cross.', 'Stop at the curb again. Look left, right, and left. All clear.', 'Off to your house!', 'Off to the kitchen next door!', 'Off to the workshop!', 'Off to the garden!', 'Off to the market!', 'Off to the fire station!', 'Off to the library!', 'Off to the post office!', 'Off to the park!', 'Off to the repair cafe!', 'Off to the town square!'];
function lines() {
  const o = new Set(); for (const k of Object.values(TASKS)) if (k.kind === 'order') { o.add(k.start); o.add(k.finish); o.add(k.real); k.steps.forEach((s, i) => { const nx = k.steps[i + 1]; o.add(s.done + (nx ? ' ' + nx.ask : '')); o.add('Not that one yet. ' + s.ask); o.add(s.ask); for (const n of Object.values(s.not || {})) o.add(n + ' ' + s.ask); }); const last = k.steps[k.steps.length - 1]; o.add(last.done + ' ' + k.finish); }
  return [...o, ...movesLines(), ...STREET_LINES, ...MARKET_LINES].filter(Boolean);
}
function movesLines() { const t = new Set(Object.values(NAMES)); for (const k of Object.values(TASKS)) { if (k.kind === 'order') continue; t.add(k.start); t.add(k.finish); t.add(k.real); for (const s of k.steps) { for (const x of [s.pick, s.miss, s.done, s.ask]) if (x) t.add(x); } for (const s of k.steps) if (s.kind === 'tap') t.add(s.done + ' ' + k.finish); for (const s of k.steps) t.add(s.done + ' ' + k.finish); t.add(k.notYet);
    const afters = k.steps.filter((s) => s.after); if (afters.length) { for (const s of k.steps.filter((x) => !x.after)) t.add(s.done + ' ' + afters[0].ask); afters.forEach((a, i) => { const nn = afters[i + 1]; t.add(a.done + (nn ? ' ' + nn.ask : '')); t.add('Not that one yet. ' + a.ask); }); } } return [...t].filter(Boolean); }

// Walking the town (world.js TOWN): sidewalks only, and a road is crossed only at the crosswalks by the crossroads,
// stopping at the curb to look first (the first crossing on a walk says it all; a second says it short). A route is a
// list of [x, z] points, some with a line to say there; it ends at the door.
function corners(town) { // which corner a point is in: W or E of Mill Road, N or S of Main Street
  const mx = (town.ns[0] + town.ns[1] + 1) / 2, mz = (town.ew[0] + town.ew[1] + 1) / 2;
  return (x, z) => (x < mx ? 'W' : 'E') + (z < mz ? 'N' : 'S');
}
function onWalk(town, door) { const W = town.walk; return door.edge === 'N' ? [door.at[0], W.N] : door.edge === 'S' ? [door.at[0], W.S] : door.edge === 'W' ? [W.W, door.at[1]] : [W.E, door.at[1]]; }
function townRoute(town, from, door) {
  const W = town.walk, quad = corners(town), corner = (q) => [q[0] === 'W' ? W.W : W.E, q[1] === 'N' ? W.N : W.S];
  const here = quad(from[0], from[1]), there = quad(door.at[0], door.at[1]);
  const edgeOf = (x, z) => Math.abs(z - W.N) < 0.3 ? 'N' : Math.abs(z - W.S) < 0.3 ? 'S' : Math.abs(x - W.W) < 0.3 ? 'W' : 'E';
  const q = []; let crossed = 0, q0 = here;
  const cross = (q1) => { const a = corner(q0), b = corner(q1), c = [a[0] + Math.sign(b[0] - a[0]) * 0.35, a[1] + Math.sign(b[1] - a[1]) * 0.35];
    q.push([c[0], c[1], crossed ? STREET_LINES[2] : STREET_LINES[1]], b); crossed++; q0 = q1; };
  if (here !== there || edgeOf(from[0], from[1]) !== door.edge) q.push(corner(here));
  if (q0[0] !== there[0]) cross(there[0] + q0[1]); // over Mill Road
  if (q0[1] !== there[1]) cross(q0[0] + there[1]); // over Main Street
  q.push(onWalk(town, door), door.at);
  return q;
}

module.exports = { STREET_LINES, TASKS, NAMES, fresh, tap, isDone, restore, lines, landing, onWalk, townRoute };
