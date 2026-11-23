# VoidTV cards: the card system

Bryan, 22 Nov 2026: "i want to creaqte card and party games that ppl canm 'play' using therephones as we have with qr",
and "build the card system and we can then create any gsame using cards fromit".

One engine, and each game is a rule file on top of it. A big screen shows the table; each phone holds one private hand.

## What is here

| File | What it is |
|---|---|
| `src/cards.js` | The card blocks: the standard pack (jokers, more packs, cards left out), the shuffle, and a hand kept in its player's own order (drag one card anywhere, Group suits, By number). |
| `src/table.js` | The table engine: zones, turns, moves, views and events. |
| `games/crazy-eights.js` | Crazy Eights, 2 to 7 players. |
| `games/hearts.js` | Hearts, 3 to 5 players. Here to prove the engine is not built for one game. |
| `test/` | `node --test "cards/test/*.test.js"` |

Also built: the phone's hand page (`hand.html`, `src/hand.js`), the big-screen table page (`index.html`, `src/screen.js`) and
the dealer that carries a table over the phone relay (`src/dealer.js`, `play/rooms/`). Their looks are Bryan's picks from
pictures: hand B (the rows) and table A (the round table). `games/` also holds Go Fish, Spades, Rummy and Conquian.

The motion on the big screen is `src/motion.js`: after each change, every card the change's events moved flies from where it
was to where it went (dealt, drawn, played, laid down, given, taken), face down unless its event carried its face, and a
trick that was taken goes to its taker after its moment on the table. The phone's motion is in `src/hand.js` (new cards
drop in, a card that leaves lifts away, a gold light on the bar for your turn). Both are CSS only, nothing flashes, and
nothing moves on a device that asks for reduced motion (decision B9).

## The privacy rule

A hand must stay private. So no screen is ever drawn from the game's state. Each is drawn from a view:

- `Table.view(game, state, null)` is the table as everyone may see it. The big screen gets this and nothing else.
- `Table.mine(game, state, p)` is what player `p` alone may see: their hand and what they may do now. It goes to that
  one phone.
- An event (what just happened) carries a card's face only when everyone could see the card before the move or can
  after it.

`test/games.test.js` plays whole games by chance and holds every view and event against this rule.

## Writing a game

A game is one object. The engine does the rest.

```js
{
  id: 'my-game', name: 'My Game', players: { min: 2, max: 6 },
  options: { },                       // the game's own settings, with their usual values
  zones: {                            // every place a card can be, and who sees its face
    draw: { see: 'none' },            // 'all', 'top' (the top card only), 'owner', 'none', or a function
    discard: { see: 'top' },
    hand: { each: true, see: 'owner' },   // each: one of these for every player ("hand:0", "hand:1")
  },
  pack: (s) => Cards.standard(),      // every card in the game; the whole pack starts in the first zone listed
  setup(t) { t.shuffle('draw'); t.deal('draw', 'hand', 5); t.turn(0); },
  moves: {
    play: {
      uses: 'hand', count: [1, 1],    // the engine checks the player holds the cards named in m.cards
      can(s, p, m) { return null; },  // null when allowed, or the reason in words a player can read
      run(t, p, m) { t.move(m.cards, 'hand:' + p, 'discard', { by: p }); t.next(); },
    },
  },
  hints(s, p) { return { play: { type: 'play', label: 'Play', cards: [], min: 1, max: 1, choose: null }, buttons: [] }; },
  status(s) { return 'One line for the big screen.'; },
}
```

- The engine refuses a move out of turn (unless the move says `anytime: true`), an unknown move, and a card the player
  does not hold. `can` refuses everything else.
- `run` works through the tools `t`: `t.move`, `t.deal`, `t.shuffle`, `t.top`, `t.turn` (one player or several at once),
  `t.next`, `t.say` (a public event of the game's own), `t.end`.
- What everyone may know goes in `s.pub`. What one player alone may know goes in `s.own[p]`. Never put a hidden card's
  id in `s.pub` or in `t.say`.
- If `run` throws or loses a card, the move is thrown away and the game goes on from the state before it.
- `hints` tells a phone which cards may be played, how many to pick, any extra choice (an eight's suit) and which
  buttons to show, so one hand page can serve every game.

## What a phone is told it may do

`hints(s, p)` answers for a player who may act now. One hand page serves every game from this:

```js
{ play: { type, label, cards, min, max, choose } | null, buttons: [{ type, label }] }
```

- `play` is the move made with cards: `cards` are the ones that may be picked now, `min` and `max` how many, `label`
  the words on the button. `null` when the only moves now are buttons.
- `choose` is one more choice the move needs, or `null`: `{ cards, field, from, kind, title }`.
  `cards`: the choice is asked only when one of these is picked (`null`: always). `field`: where the answer goes in the
  move. `from`: the answers, each a plain value or `{ v, label }`. `kind`: `'suit'`, `'player'`, `'rank'` or
  `'option'`, so the phone can draw it well. `title`: the question. For `'player'`, `v` is the player's place and the
  phone shows that player's own name (a rule file never knows names).
- `buttons` are moves with no cards (Draw a card, Pass, Knock). A button may carry a `choose` of its own, of the same
  shape without `cards`, when its move needs an answer (a bid: `{ type: 'bid', label: 'Bid', choose: { field: 'n',
  from: [...], kind: 'option', title: 'How many books?' } }`).
- `plays` is a list of more moves made with cards, each of the same shape as `play` and each with a button of its own,
  for a turn that offers several (Rummy: Lay down, Lay off, Discard). Leave it out when the turn offers one.
- Where a pick must also fit a pattern (a run in Rummy), list every card that could be part of one; `can` has the last
  word and says why not.

## Names the pages go by

The table page and the hand page draw any game that keeps to these names:

- Zones: `draw` (the pack, face down), `discard` (the pile, its top card showing), `hand` (each player's private
  hand), `trick` (cards played to a trick, in the order played from `s.pub.led`), `won` (each player's taken cards,
  face down), `laid` (each player's cards laid face up: books, sets, runs).
- `s.pub.scores`: one number for each player, when the game keeps score (partners each show their side's score).
- `s.pub.teams`: each player's side, as a number, when the game has partners (`[0, 1, 0, 1]`: partners sit across).
- `s.pub.notes`: one short line for each player's seat ("Bid 3, took 2"), when the game has something to say there.
- `s.pub.cuts`: for a zone that holds several groups (sets and runs laid on the table), the size of each group in
  order, by zone id: `{ melds: [3, 4, 3] }` means the zone's first 3 cards are one group, the next 4 another. The
  cards themselves stay in the zone, so the public table stays small.
- `t.say({ ev: 'trick', won, led })` when a trick is taken (`won`: the taker, `led`: who led it). The table page then keeps the
  four cards in front of their seats for a moment and shows who takes them. The cards come from the move that carries the trick
  to the taker, which names them because a trick lies face up. Spades and Hearts say it.
- A card's id may be in `s.pub` only while that card lies face up on the table. What one player alone must remember
  (the card they took and may not throw straight back) goes in `s.own[p]`, even if everyone saw it happen.
- `game.labels`: words for a zone a phone should name, such as `{ pass: 'Your pass' }`.
- `t.end({ winners: [players], note })`: `winners` always; `note` is one optional line for the screen
  ("Sam is the Old Maid").
- Every message to a phone must fit in 1,000 bytes, so keep `s.pub` small: numbers and short words, never a history.

## Testing a game

Each game has its own test file, `test/<game id>.test.js`, using the kit in `test/helper.js`:

- `rig(game, players, zones, more)` sets a table by hand; `yes(game, s, p, move)` and `no(game, s, p, move, /why/)` make
  one move that must be allowed or refused.
- `playOut(game, players, seed, opts, spec)` plays a whole game by chance and holds every view and event against the
  privacy rule. `spec` is written by the game's own test, apart from the engine: `secret(s, viewer)` lists every card the
  viewer may not see, `open(s)` every card face up for all, and `faceUp` names the zone a card is laid in for all to see.

A game is done when its own rules are each tested by hand-set tables, and whole games by chance pass for every number
of players it takes.

## The wire

`src/dealer.js` carries a table over the phone relay (`play/rooms/`, kind `cards`); the messages are listed at its top.
`serve.js` runs it all on this computer: `node cards/serve.js`, then open `http://127.0.0.1:8791/cards/`.

Games must be traditional or our own. Never a copy of a commercial game's name, cards, art or wording.
