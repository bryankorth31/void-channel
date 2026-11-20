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
    const onAction = opts.onAction || (() => {}); // our own buttons: 'menu' (the same on every pad), 'keyboard'
    let map = {};                              // gamepad button name -> key code or '@action'
    const holders = new Map();                 // key code -> Set of sources holding it
    const padHeld = new Map();                 // gamepad index -> Set of codes it holds now
    const padActions = new Map();              // gamepad index -> Set of actions held (fire once per press)

    function hold(source, code, down) {
      if (code[0] === '@') { if (down) onAction(code.slice(1), source); return; }
      let set = holders.get(code);
      if (!set) holders.set(code, (set = new Set()));
      const was = set.size > 0;
      if (down) set.add(source); else set.delete(source);
      const now = set.size > 0;
      if (now !== was) send(code, now);
    }

    // full: the whole map from PlayCards.gamepadMap(card) (console cards get their usual seats); else the card's own.
    function setCard(card, full) { map = Object.assign({ Start: '@menu' }, full || (card && card.gamepad) || {}); }

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
      for (const [name, idx] of Object.entries(BUTTONS)) {
        const b = pad.buttons && pad.buttons[idx];
        if (b && (b.pressed || b.value > 0.5) && map[name]) codes.add(seat(map[name]));
      }
      const ax = (pad.axes && pad.axes[0]) || 0, ay = (pad.axes && pad.axes[1]) || 0;
      if (map.Stick !== 'none') {
        if (ax < -STICK && map.Left) codes.add(seat(map.Left));
        if (ax > STICK && map.Right) codes.add(seat(map.Right));
        if (ay < -STICK && map.Up) codes.add(seat(map.Up));
        if (ay > STICK && map.Down) codes.add(seat(map.Down));
      }
      return codes;
    }

    // Called once a frame with navigator.getGamepads(); only "standard" pads are read.
    function pollPads(pads) {
      const seen = new Set();
      const order = (pads || []).filter((p) => p && p.mapping === 'standard').map((p) => p.index).sort((a, b) => a - b);
      for (const pad of pads || []) {
        if (!pad || pad.mapping !== 'standard') continue;
        seen.add(pad.index);
        const now = padCodes(pad, Math.min(4, order.indexOf(pad.index) + 1)), before = padHeld.get(pad.index) || new Set();
        const actNow = new Set([...now].filter((c) => c[0] === '@')), actBefore = padActions.get(pad.index) || new Set();
        for (const a of actNow) if (!actBefore.has(a)) hold('pad' + pad.index, a, true);
        padActions.set(pad.index, actNow);
        const keysNow = new Set([...now].filter((c) => c[0] !== '@'));
        for (const c of before) if (!keysNow.has(c)) hold('pad' + pad.index, c, false);
        for (const c of keysNow) if (!before.has(c)) hold('pad' + pad.index, c, true);
        padHeld.set(pad.index, keysNow);
      }
      for (const [idx, codes] of padHeld) if (!seen.has(idx)) { for (const c of codes) hold('pad' + idx, c, false); padHeld.delete(idx); }
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
    };
  }

  const api = { createHub, BUTTONS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayHub = api;
})(typeof self !== 'undefined' ? self : this);
