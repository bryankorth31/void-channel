// VoidTV cards: the dealer. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 22 Nov 2026: "my hand is on my phone". The big screen's page is the dealer: it holds the pack and every hand in
// its own memory and carries the table over VoidTV's phone relay (play/rooms/, kind "cards"). The relay passes messages
// and keeps nothing, so the privacy of a hand is decided here, by three rules:
// 1. What goes to everyone ('all') is made from the public view alone (table.js view with no viewer).
// 2. A hand goes to one seat, and only after the phone in that seat has said who it is with its own player key. A hand
//    belongs to the key, never to the seat number: the relay gives a seat left for a minute to the next phone that joins.
// 3. The big screen is given snapshot(), which holds the public view too. The state itself never leaves this file.
// Pure: no page, no socket, no clock. The table's page gives send(to, msg) and passes in what the relay says.
//
// Phone to table:  c-hi { key, name? }   c-name { name }   c-move { move }
// Table to phone:  c-you (who you are)   c-hand (your cards and what you may do)   c-no (why a move was refused)
//                  c-moved (this player is now on another phone or tab)
// Table to all:    c-roster (who is playing)   c-table (the public table)
(function (root) {
  'use strict';
  const C = root.VoidCards || require('./cards.js');
  const T = root.VoidTable || require('./table.js');
  const goodKey = (k) => typeof k === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(k);
  const MAX = 1000;     // the relay takes 1,024 bytes a message, and wraps each one in a small envelope
  const PEOPLE = 64;    // players remembered in one room, here or away

  function create(opts) {
    const o = opts || {}, games = o.games || {}, rand = o.rand || C.secure;
    // A name typed on a phone, as the big screen may show it, or null. The table's page passes Trivia's own filter.
    const cleanName = o.cleanName || ((raw) => String(raw || '').replace(/[^\p{L}\p{N} .'!?&-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim() || null);
    const people = new Map();   // player key -> { key, name, n: the order they joined in, seat: where their phone is now, p: their place in the game on now }
    const seats = new Map();    // relay seat -> player key, once the phone there has said who it is
    let game = games[o.game] || games[Object.keys(games)[0]];
    let phase = 'lobby', state = null, joined = 0, dealt = 0;

    const inOrder = () => [...people.values()].sort((a, b) => a.n - b.n);
    const nameOf = (x) => x.name || 'Player ' + x.n;
    // Who the table shows: in the lobby everyone whose phone is here; in a game the players, in their places.
    const players = () => (phase === 'lobby' ? inOrder().filter((x) => x.seat !== null) : inOrder().filter((x) => x.p !== null).sort((a, b) => a.p - b.p));
    const waiting = () => (phase === 'lobby' ? 0 : inOrder().filter((x) => x.p === null && x.seat !== null).length);
    function post(to, msg) {
      if (to === null || to === undefined) return;
      if (JSON.stringify(msg).length > MAX) { if (o.warn) o.warn('A ' + msg.type + ' message was too big for the relay and was not sent'); return; }
      o.send(to, msg);
    }
    const rosterMsg = () => ({ type: 'c-roster', phase, game: game.id, title: game.name, players: players().map((x) => ({ name: nameOf(x), here: x.seat !== null })), waiting: waiting() });
    const tableMsg = () => ({ type: 'c-table', v: T.view(game, state, null), status: game.status ? game.status(state) : '' });
    const tellYou = (x, more) => post(x.seat, Object.assign({ type: 'c-you', me: x.p, name: nameOf(x), named: !!x.name, phase }, more));
    // A player's own cards and what they may do now, to their own phone, when it has changed.
    function tellHand(x, force) {
      if (x.seat === null || x.p === null || !state) return;
      const m = T.mine(game, state, x.p), body = JSON.stringify([m.zones, m.own, m.hints]);
      if (!force && body === x.sent) return;
      x.sent = body;
      post(x.seat, { type: 'c-hand', m });
    }
    function tellEveryone() {
      post('all', rosterMsg());
      if (state) post('all', tableMsg());
      for (const x of people.values()) if (x.seat !== null) { tellYou(x); tellHand(x, true); }
    }
    const changed = (events) => { if (o.onChange) o.onChange(events || []); };
    // The phone in a seat is no longer known to be anyone: nothing of anyone's own goes to that seat from now on.
    function unseat(seat) {
      const x = people.get(seats.get(seat));
      seats.delete(seat);
      if (!x || x.seat !== seat) return null;
      x.seat = null; x.sent = '';
      return x;
    }
    function setName(x, raw) { const clean = cleanName(raw); if (clean) x.name = clean; return !clean && !!String(raw || '').trim(); }

    function hi(seat, msg) {
      if (!goodKey(msg.key)) return;
      let x = people.get(msg.key);
      if (!x) {
        if (people.size >= PEOPLE) return;
        x = { key: msg.key, name: null, n: ++joined, seat: null, p: null, sent: '' };
        people.set(msg.key, x);
      }
      // The same player from another seat (a second tab, or back after their seat was given away): the new seat is theirs.
      if (x.seat !== null && x.seat !== seat) { post(x.seat, { type: 'c-moved' }); seats.delete(x.seat); }
      unseat(seat);
      seats.set(seat, x.key); x.seat = seat; x.sent = '';
      const refused = msg.name !== undefined && msg.name !== null ? setName(x, msg.name) : false;
      tellYou(x, refused ? { refused: true } : null);
      post('all', rosterMsg());
      if (state) { post(seat, tableMsg()); tellHand(x, true); }
      changed();
    }
    function moveBy(x, m) {
      if (phase !== 'play' || x.p === null) return post(x.seat, { type: 'c-no', error: phase === 'lobby' ? 'No game is on yet.' : x.p === null ? 'You are in the next game.' : 'The game is over.' });
      const r = T.move(game, state, x.p, m, rand);
      if (!r.ok) { if (r.bug && o.warn) o.warn('Rule file fault in ' + game.id + ': ' + r.bug); return post(x.seat, { type: 'c-no', error: r.error }); }
      state = r.state;
      if (state.over) { phase = 'over'; post('all', rosterMsg()); }
      post('all', tableMsg());
      for (const y of people.values()) tellHand(y);
      changed(r.events);
    }

    const api = {
      // The relay says a phone took a seat. It is nobody until it says who it is (c-hi).
      join(seat) { if (unseat(seat)) { post('all', rosterMsg()); changed(); } },
      leave(seat) { if (unseat(seat)) { post('all', rosterMsg()); changed(); } },
      // A message from the phone in a seat. A phone that has not said who it is can only say who it is.
      hear(seat, msg) {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'c-hi') return hi(seat, msg);
        const x = people.get(seats.get(seat));
        if (!x) return;
        if (msg.type === 'c-name') { const refused = setName(x, msg.name); tellYou(x, refused ? { refused: true } : null); post('all', rosterMsg()); changed(); return; }
        if (msg.type === 'c-move') moveBy(x, msg.move);
      },
      // One message from the relay to the table's page: true when it was the dealer's to handle.
      relay(m) {
        if (!m || typeof m !== 'object') return false;
        if (m.type === 'join') { api.join(m.from); return true; }
        if (m.type === 'leave') { api.leave(m.from); return true; }
        if (m.from !== undefined && m.msg) { api.hear(m.from, m.msg); return true; }
        return false;
      },
      // In the lobby: which game is played next.
      pick(id) { if (phase === 'play' || !Object.prototype.hasOwnProperty.call(games, id)) return false; game = games[id]; post('all', rosterMsg()); changed(); return true; },
      // Deal. Everyone whose phone is here plays, in the order they joined; past the game's limit the rest wait for the
      // next game. Answers null, or the reason in words when it cannot start. Who goes first moves on a seat each game.
      start() {
        if (phase === 'play') return 'A game is already on.';
        const here = inOrder().filter((x) => x.seat !== null);
        if (here.length < game.players.min) return game.name + ' needs at least ' + game.players.min + ' players.';
        const playing = here.slice(0, game.players.max);
        for (const x of people.values()) { x.p = null; x.sent = ''; }
        playing.forEach((x, i) => { x.p = i; });
        const made = T.create(game, { players: playing.length, rand, opts: Object.assign({}, o.opts, { first: dealt % playing.length }) });
        state = made.state; phase = 'play'; dealt++;
        tellEveryone();
        changed(made.events);
        return null;
      },
      // Back to the lobby: the game on now is put away.
      stop() {
        phase = 'lobby'; state = null;
        for (const x of people.values()) { x.p = null; x.sent = ''; }
        tellEveryone();
        changed();
      },
      // What the big screen may draw: the public view, the names, and no more.
      snapshot: () => ({ phase, game: { id: game.id, name: game.name, min: game.players.min, max: game.players.max },
        games: Object.keys(games).map((id) => ({ id, name: games[id].name })),
        players: players().map((x) => ({ name: nameOf(x), here: x.seat !== null, seat: x.seat })), waiting: waiting(),
        view: state ? T.view(game, state, null) : null, status: state && game.status ? game.status(state) : '' }),
    };
    return api;
  }

  const api = { create, MAX };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoidDealer = api;
})(typeof self !== 'undefined' ? self : this);
