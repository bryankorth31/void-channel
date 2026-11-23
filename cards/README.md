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

Not built yet: the phone's hand page, the big-screen table page, and the part that carries a table over the phone relay
(`play/rooms/`). The pages wait on Bryan's pick from the pictures.

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

Games must be traditional or our own. Never a copy of a commercial game's name, cards, art or wording.
