// VoidTV PLAY: the input hub. Licence: GPL-2.0-or-later (play/LICENSE).
// Couch Craft's rule, for the web: a game never sees a raw controller. Every source (the PC keyboard, each gamepad,
// the touch pad, the pop-up keyboard) tells the hub what it holds; the hub hands the game one clean set of keys.
// A key goes down when the first source holds it and up only when the last one lets go, so a thumb on the touch
// pad and a gamepad button on the same key never cancel each other.
(function (root) {
  // Standard gamepad buttons (the browser's "standard" mapping, the Xbox layout)
  const BUTTONS = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, L3: 10, R3: 11,
    Up: 12, Down: 13, Left: 14, Right: 15, Home: 16 };
  const STICK = 0.5;   // how far a stick must lean to count as a direction

  function createHub(opts) {
    const send = opts.send;                    // send(code, down): to the game
    const onAction = opts.onAction || (() => {}); // our own buttons: 'menu' (the same on every pad), 'keyboard', 'rewind'
    const onRelease = opts.onRelease || (() => {});
    let map = {};                              // gamepad button name -> key code or '@action'
    const holders = new Map();                 // key code -> Set of sources holding it
    const padHeld = new Map();                 // gamepad index -> Set of codes it holds now
    const padActions = new Map();              // gamepad index -> Set of actions held (fire once per press)

    function hold(source, code, down) {
      // An action of ours: onAction hears the press; onRelease the letting go (a held one, like rewind, needs both).
      if (code[0] === '@') { if (down) onAction(code.slice(1), source); else onRelease(code.slice(1), source); return; }
      let set = holders.get(code);
      if (!set) holders.set(code, (set = new Set()));
      const was = set.size > 0;
      if (down) set.add(source); else set.delete(source);
      const now = set.size > 0;
      if (now !== was) send(code, now);
    }

    // full: the whole map from PlayCards.gamepadMap(card) (console cards get their usual seats); else the card's own.
    // shift (plan T23): a card may name a button that, while held, switches the pad to a second set
    // (card.gamepadShift = { on: 'LT', map: { Up: 'Digit4', ... } }), so a pad reaches more keys than it has buttons.
    let shift = null;
    let players = 1;
    function setCard(card, full) {
      map = Object.assign({ Start: '@menu' }, full || (card && card.gamepad) || {});
      shift = (card && card.gamepadShift && card.gamepadShift.on && card.gamepadShift.map) ? card.gamepadShift : null;
      players = Math.max(1, Math.min(4, (card && card.players) || 1));
    }

    // Couch mode (plan T18): each pad keeps its seat. A pad takes the lowest free seat the first time the browser shows
    // it, and keeps it while it is connected, whatever other pads do. A pad that drops (a flat battery) leaves its seat
    // held for it; the same kind of pad coming back takes that seat again, even at a new index. When every seat is
    // taken, an extra pad plays as player 1 alongside (so any pad can play a one-player game).
    const seatOf = new Map();                  // gamepad index -> seat (1 to 4)
    const away = new Map();                    // seat -> the id of the pad that dropped from it
    const onSeat = opts.onSeat || (() => {});  // onSeat(seat, 'joined' | 'back' | 'away')
    const padId = new Map();                   // gamepad index -> its id, to know the same pad when it comes back
    function takeSeat(pad) {
      const used = new Set(seatOf.values());
      for (const [s, id] of [...away].sort((a, b) => a[0] - b[0])) {
        if (id === pad.id && !used.has(s)) { away.delete(s); seatOf.set(pad.index, s); onSeat(s, 'back'); return s; }
      }
      for (let s = 1; s <= players; s++) {
        if (!used.has(s) && !away.has(s)) { seatOf.set(pad.index, s); onSeat(s, 'joined'); return s; }
      }
      // No free seat, but one held for a pad that dropped: a different pad picked up in its place takes it.
      const held = [...away.keys()].filter((s) => s <= players && !used.has(s)).sort((a, b) => a - b)[0];
      if (held) { away.delete(held); seatOf.set(pad.index, held); onSeat(held, 'joined'); return held; }
      seatOf.set(pad.index, 1);
      return 1;
    }
    function leaveSeat(index, id) {
      const s = seatOf.get(index);
      seatOf.delete(index);
      // Only a pad that had a seat of its own leaves it held; an extra player 1 just goes.
      if (s && ![...seatOf.values()].includes(s)) { away.set(s, id || ''); onSeat(s, 'away'); }
    }

    // What one gamepad holds right now, as key codes, from its buttons and its left stick.
    // A console button for player 1 (P1:A) becomes the same button for whichever player holds this pad: the first
    // pad is player 1, the second player 2, so two people on the couch each get their own seat.
    function padCodes(pad, player) {
      const codes = new Set();
      const seat = (c) => (player > 1 ? c.replace(/^P1:/, 'P' + player + ':') : c);
      // Back and Start held together open the menu on every pad, on every game (a console game keeps Start for itself,
      // and many pads never report their Home button to a browser). While held, neither reaches the game.
      const on = (i) => !!(pad.buttons && pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
      if (on(BUTTONS.Back) && on(BUTTONS.Start)) { codes.add('@menu'); return codes; }
      // While the shift button is held, the second set answers and the shift button itself sends nothing.
      const m = shift && on(BUTTONS[shift.on]) ? shift.map : map;
      for (const [name, idx] of Object.entries(BUTTONS)) {
        if (shift && name === shift.on) continue;
        const b = pad.buttons && pad.buttons[idx];
        if (b && (b.pressed || b.value > 0.5) && m[name]) codes.add(seat(m[name]));
      }
      const ax = (pad.axes && pad.axes[0]) || 0, ay = (pad.axes && pad.axes[1]) || 0;
      if (m.Stick !== 'none') {
        if (ax < -STICK && m.Left) codes.add(seat(m.Left));
        if (ax > STICK && m.Right) codes.add(seat(m.Right));
        if (ay < -STICK && m.Up) codes.add(seat(m.Up));
        if (ay > STICK && m.Down) codes.add(seat(m.Down));
      }
      return codes;
    }

    // Called once a frame with navigator.getGamepads(); only "standard" pads are read.
    function pollPads(pads) {
      const seen = new Set();
      for (const pad of pads || []) {
        if (!pad || pad.mapping !== 'standard') continue;
        seen.add(pad.index);
        if (padId.has(pad.index) && padId.get(pad.index) !== pad.id) { leaveSeat(pad.index, padId.get(pad.index)); }
        padId.set(pad.index, pad.id);
        const s = seatOf.get(pad.index) || takeSeat(pad);
        const now = padCodes(pad, s), before = padHeld.get(pad.index) || new Set();
        const actNow = new Set([...now].filter((c) => c[0] === '@')), actBefore = padActions.get(pad.index) || new Set();
        for (const a of actNow) if (!actBefore.has(a)) hold('pad' + pad.index, a, true);
        for (const a of actBefore) if (!actNow.has(a)) hold('pad' + pad.index, a, false);
        padActions.set(pad.index, actNow);
        const keysNow = new Set([...now].filter((c) => c[0] !== '@'));
        for (const c of before) if (!keysNow.has(c)) hold('pad' + pad.index, c, false);
        for (const c of keysNow) if (!before.has(c)) hold('pad' + pad.index, c, true);
        padHeld.set(pad.index, keysNow);
      }
      for (const [idx, codes] of padHeld) if (!seen.has(idx)) { for (const c of codes) hold('pad' + idx, c, false); padHeld.delete(idx); }
      for (const idx of [...seatOf.keys()]) if (!seen.has(idx)) { leaveSeat(idx, padId.get(idx)); padId.delete(idx); padActions.delete(idx); }
    }

    // Let go of everything (the page lost focus, the game paused): no key is left stuck down.
    function releaseAll() {
      for (const [code, set] of holders) if (set.size) { set.clear(); send(code, false); }
      padHeld.clear(); padActions.clear();
    }

    return {
      setCard, pollPads, releaseAll,
      keyboard: (code, down) => hold('keyboard', code, down),
      touch: (code, down, finger) => hold('touch' + (finger === undefined ? '' : finger), code, down),
      held: () => [...holders].filter(([, s]) => s.size).map(([c]) => c).sort(),
      seat: (index) => seatOf.get(index),        // the seat a pad holds (phone gamepads tell their phone which player it is)
    };
  }

  const api = { createHub, BUTTONS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayHub = api;
})(typeof self !== 'undefined' ? self : this);
