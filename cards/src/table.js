// VoidTV cards: the table engine. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 22 Nov 2026: "build the card system and we can then create any gsame using cards fromit". One engine; a game
// is a rule file on top (cards/games/, how to write one: cards/README.md). The engine knows only these blocks:
//   zone    a named pile of cards, the table's own (the pack, the pile) or one for each player (a hand), with a rule
//           for who may see its faces: 'all', 'top' (the top card only), 'owner', 'none', or a function.
//   turn    the players who may act now. One for most games; several when everyone picks at once.
//   move    what a player asks to do. The rule file says whether it may (can) and what it does (run).
//   view    what a screen is given: the table everyone may see, and what one player alone may see. A hand must stay
//           private, so every screen is drawn from a view and never from the state itself.
//   event   what just happened, for the screens to show. A card's face is in it only when everyone could see that card
//           before the move or can after it.
// The state is plain data (it can be saved and sent to a test as it is). A move never changes the state it was given:
// it answers with a new one, or with the old one and the reason. Pure: no page and no clock.
(function (root) {
  'use strict';
  const C = root.VoidCards || (typeof require === 'function' ? require('./cards.js') : null);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const zid = (name, p) => name + ':' + p;

  // Every zone of a game with n players: [id, name, owner]. owner is a player, or null for the table's own zones.
  function zonesOf(game, n) {
    const out = [];
    for (const name of Object.keys(game.zones)) {
      if (game.zones[name].each) for (let p = 0; p < n; p++) out.push([zid(name, p), name, p]);
      else out.push([name, name, null]);
    }
    return out;
  }
  const parts = (game, id) => { if (own(game.zones, id)) return [id, null]; const i = id.lastIndexOf(':'); return [id.slice(0, i), +id.slice(i + 1)]; };

  // What a viewer gets of one zone: 'all' its cards, 'top' its top card, or 'none' (how many, and no more).
  // viewer is a player, or null for the big screen and for anyone at all.
  function sight(game, state, name, owner, viewer) {
    const see = game.zones[name].see;
    const v = typeof see === 'function' ? see(viewer, owner, state) : see;
    if (v === 'all' || v === true) return 'all';
    if (v === 'top') return 'top';
    if (v === 'owner') return viewer !== null && viewer === owner ? 'all' : 'none';
    return 'none';
  }
  const shown = (cards, how) => (how === 'all' ? { n: cards.length, cards: cards.slice() }
    : how === 'top' && cards.length ? { n: cards.length, top: cards[cards.length - 1] } : { n: cards.length });

  // The view. With no viewer: the table as everyone may see it, which is all the big screen is ever given.
  // With a player: the same, with that player's own cards and own notes added.
  function view(game, state, viewer) {
    const v = viewer === undefined ? null : viewer, zones = {};
    for (const [id, name, owner] of zonesOf(game, state.n)) zones[id] = shown(state.zones[id], sight(game, state, name, owner, v));
    const out = { game: state.game, n: state.n, seq: state.seq, phase: state.phase, turn: state.turn.slice(), dir: state.dir,
      opts: clone(state.opts), pub: clone(state.pub), over: clone(state.over), zones };
    if (v !== null) out.own = clone(state.own[v] || {});
    return out;
  }
  // Only what one player sees beyond the public table: their hand, their own notes, and what they may do now.
  // The public view goes to everyone in one message; this goes to that player's phone alone.
  function mine(game, state, p) {
    const zones = {};
    for (const [id, name, owner] of zonesOf(game, state.n)) {
      const a = sight(game, state, name, owner, p);
      if (a !== sight(game, state, name, owner, null)) zones[id] = shown(state.zones[id], a);
    }
    return { seq: state.seq, zones, own: clone(state.own[p] || {}), hints: hints(game, state, p) };
  }
  // Every card whose face a viewer may not see now. The tests hold every view and message against this list.
  function hidden(game, state, viewer) {
    const v = viewer === undefined ? null : viewer, out = [];
    for (const [id, name, owner] of zonesOf(game, state.n)) {
      const how = sight(game, state, name, owner, v), cards = state.zones[id];
      if (how === 'top') out.push(...cards.slice(0, -1)); else if (how !== 'all') out.push(...cards);
    }
    return out;
  }
  // What a player may do now, as the rule file tells it (which cards may be played, how many, which buttons), or null.
  function hints(game, state, p) {
    if (state.over || !game.hints || !state.turn.includes(p)) return null;
    return game.hints(state, p) || null;
  }

  // The hands a rule file works with: they change the draft state and note what happened.
  function tools(game, s, rand) {
    const events = [];
    const how = (id) => { const [name, owner] = parts(game, id); return sight(game, s, name, owner, null); };
    const t = {
      s, n: s.n, rand, events, z: zid,
      zone(id) { if (!own(s.zones, id)) throw new Error('No zone ' + id); return s.zones[id]; },
      // The top k cards of a zone, the top one first. Nothing moves.
      top(id, k) { const z = t.zone(id); return z.slice(Math.max(0, z.length - (k || 1))).reverse(); },
      // Cards go from one zone onto the top of another (opt.bottom: under it). opt.by: the player who did it.
      move(cards, from, to, opt) {
        const list = [].concat(cards), a = t.zone(from), b = t.zone(to), o = opt || {};
        if (from === to) throw new Error('A card cannot move to the zone it is in');
        const before = how(from), wasTop = a[a.length - 1];
        const open = list.map((c) => before === 'all' || (before === 'top' && c === wasTop));
        for (const c of list) { const i = a.indexOf(c); if (i < 0) throw new Error('Card ' + c + ' is not in ' + from); a.splice(i, 1); }
        if (o.bottom) b.unshift(...list); else b.push(...list);
        const after = how(to), nowTop = b[b.length - 1];
        const e = { ev: 'move', from, to, n: list.length };
        if (list.every((c, i) => open[i] || after === 'all' || (after === 'top' && c === nowTop))) e.cards = list.slice();
        if (o.by !== undefined) e.by = o.by;
        events.push(e);
      },
      // k cards to each player's zone of that name, one at a time round the table.
      deal(from, name, k) {
        const z = t.zone(from);
        for (let i = 0; i < k; i++) for (let p = 0; p < s.n; p++) { if (!z.length) throw new Error('Not enough cards to deal'); t.zone(zid(name, p)).push(z.pop()); }
        events.push({ ev: 'deal', from, to: name, n: k });
      },
      shuffle(id) { const z = t.zone(id), mixed = C.shuffle(z, rand); z.length = 0; z.push(...mixed); events.push({ ev: 'shuffle', zone: id }); },
      // Who may act now: one player, or several at once.
      turn(who) { s.turn = [].concat(who); },
      // The turn passes round the table, the way play is going (s.dir), by so many seats.
      next(steps) { const cur = s.turn.length ? s.turn[0] : 0, k = steps === undefined ? 1 : steps; s.turn = [(((cur + k * s.dir) % s.n) + s.n) % s.n]; },
      // Something of the game's own for the screens to show. Public: never put a hidden card in it.
      say(ev) { events.push(ev); },
      end(result) { s.over = result || {}; s.turn = []; events.push({ ev: 'over' }); },
    };
    return t;
  }

  // Every card of the pack is in exactly one zone, and whoever may act is a player. A rule file that breaks this has a
  // fault, and the move it made is thrown away.
  function check(game, s) {
    const seen = new Set();
    let count = 0;
    for (const id of Object.keys(s.zones)) for (const c of s.zones[id]) { if (seen.has(c)) throw new Error('Card ' + c + ' is in two places'); seen.add(c); count++; }
    if (count !== s.pack.length) throw new Error('The table holds ' + count + ' cards of ' + s.pack.length);
    for (const c of s.pack) if (!seen.has(c)) throw new Error('Card ' + c + ' is nowhere');
    for (const p of s.turn) if (!Number.isInteger(p) || p < 0 || p >= s.n) throw new Error('The turn names a player who is not here');
  }

  // A new table: players is how many sit down; opts are the game's own settings; rand deals (a test passes a seeded one).
  function create(game, setup) {
    const o = setup || {}, n = o.players;
    if (!Number.isInteger(n) || n < game.players.min || n > game.players.max) throw new Error(game.name + ' takes ' + game.players.min + ' to ' + game.players.max + ' players');
    for (const name of Object.keys(game.zones)) if (name.includes(':')) throw new Error('A zone name cannot hold a colon');
    const s = { game: game.id, n, seq: 0, phase: '', turn: [], dir: 1, opts: Object.assign({}, game.options, o.opts), pub: {},
      own: Array.from({ length: n }, () => ({})), over: null, zones: {}, pack: [] };
    for (const [id] of zonesOf(game, n)) s.zones[id] = [];
    s.pack = game.pack(s);
    // The whole pack starts in one zone of the table (game.start, or the first zone the game lists).
    const start = game.start || Object.keys(game.zones)[0];
    if (!own(s.zones, start)) throw new Error('The pack must start in a zone of the table');
    s.zones[start] = s.pack.slice();
    const t = tools(game, s, o.rand || C.secure);
    game.setup(t);
    check(game, s);
    return { state: s, events: t.events };
  }

  // A player asks to make a move. Answers { ok, state, events } or { ok: false, error, state } with the state as it was.
  // The engine itself refuses what no game allows: a move out of turn (unless the move says anytime), a move the game
  // does not have, and a card the player does not hold. The rule file refuses the rest, in words a player can read.
  function move(game, state, p, m, rand) {
    const no = (error, bug) => (bug ? { ok: false, error, bug, state, events: [] } : { ok: false, error, state, events: [] });
    if (state.over) return no('The game is over.');
    if (!Number.isInteger(p) || p < 0 || p >= state.n) return no('That is not a player in this game.');
    if (!m || typeof m !== 'object' || typeof m.type !== 'string' || !own(game.moves, m.type)) return no('That move is not part of this game.');
    const def = game.moves[m.type];
    if (!def.anytime && !state.turn.includes(p)) return no('It is not your turn.');
    if (def.uses) {
      const held = state.zones[zid(def.uses, p)], c = m.cards, min = (def.count || [1, 1])[0], max = (def.count || [1, 1])[1];
      if (!Array.isArray(c) || c.length < min || c.length > max) return no(min === max ? 'Pick ' + min + (min === 1 ? ' card.' : ' cards.') : 'Pick ' + min + ' to ' + max + ' cards.');
      if (new Set(c).size !== c.length || !c.every((x) => typeof x === 'string' && held.includes(x))) return no('You do not hold that card.');
    }
    let draft, t;
    try {
      const why = def.can ? def.can(state, p, m) : null;
      if (why) return no(String(why));
      draft = clone(state);
      t = tools(game, draft, rand || C.secure);
      def.run(t, p, m);
      draft.seq = state.seq + 1;
      check(game, draft);
    } catch (e) { return no('That move could not be made.', String((e && e.message) || e)); }
    return { ok: true, state: draft, events: t.events };
  }

  const api = { create, move, view, mine, hidden, hints, zonesOf, zid };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoidTable = api;
})(typeof self !== 'undefined' ? self : this);
