// VoidTV PLAY: game cards. Licence: GPL-2.0-or-later (play/LICENSE).
// One small JSON per game (Couch Craft's card, translated): which Archive item and file, which core, which program to
// start, the controls the touch pad draws, and the gamepad map the hub uses. The game file is always fetched from the
// Internet Archive at play time; voidtv.net never keeps it.
(function (root) {
  // Which systems each core plays. Every engine file is built by play/core (build.sh for DOSBox Pure, build-core.js for
  // the rest) from the exact source named there.
  const CORES = {
    // name, licence and source are what the player page shows under every game; terms is the licence text that must
    // travel with a non-GPL core (served beside its engine). noDonation: the core's licence forbids commercial use, so
    // its games carry no donation line anywhere (B, 19 Nov 2026: "Leave it off those").
    'dosbox-pure': { engine: 'engine/dosbox-pure.js', systems: ['dos'], name: 'DOSBox Pure', licence: 'GPL-2.0',
      source: 'https://github.com/libretro/dosbox-pure/tree/e39497e7c2a32c67c26e6598dd14f6d58c384bfd' },
    'genesis-plus-gx': { engine: 'engine/genesis-plus-gx.js', systems: ['genesis', 'sms', 'gamegear'], name: 'Genesis Plus GX',
      licence: 'non-commercial licence', source: 'https://github.com/libretro/Genesis-Plus-GX/tree/b9c2316441978d4015ba30e9a95d9b0e6f8ee981',
      terms: 'engine/genesis-plus-gx.LICENSE.txt', noDonation: true },
    snes9x: { engine: 'engine/snes9x.js', systems: ['snes'], name: 'Snes9x', licence: 'non-commercial licence',
      source: 'https://github.com/libretro/snes9x/tree/204ea1c0b851f960cbf223075eb1c25641cb483c', terms: 'engine/snes9x.LICENSE.txt', noDonation: true },
    fceumm: { engine: 'engine/fceumm.js', systems: ['nes'], name: 'FCEUmm', licence: 'GPL-2.0',
      source: 'https://github.com/libretro/libretro-fceumm/tree/77468e568d9fe9c48d684ca911f1a3fe7259fdf7' },
    gambatte: { engine: 'engine/gambatte.js', systems: ['gameboy', 'gbcolor'], name: 'Gambatte', licence: 'GPL-2.0',
      source: 'https://github.com/libretro/gambatte-libretro/tree/77f2567d718b8973d02caa2daa8dce4953faf811' },
    stella2014: { engine: 'engine/stella2014.js', systems: ['a2600'], name: 'Stella 2014', licence: 'GPL-2.0',
      source: 'https://github.com/libretro/stella2014-libretro/tree/7d1361e407e63f29e52892655069e5fb4096e691' },
    // Batch 2: open licences that allow any use, so their games keep the donation line; each licence travels beside it.
    mgba: { engine: 'engine/mgba.js', systems: ['gba'], name: 'mGBA', licence: 'MPL-2.0',
      source: 'https://github.com/libretro/mgba/tree/7a12d6d4b9acb14c0ae62c9166b6a2f3d08007f6', terms: 'engine/mgba.LICENSE.txt' },
    handy: { engine: 'engine/handy.js', systems: ['lynx'], name: 'Handy', licence: 'zlib licence',
      source: 'https://github.com/libretro/libretro-handy/tree/bc55d462f0b2d6b073ea93dc552ebd73cec60fd1', terms: 'engine/handy.LICENSE.txt' },
    // Arcade (B, 20 Nov 2026: "Current MAME", "No line"): MAME's own web build, one engine per MAME source family
    // (classics plays Joust and the other early machines; audit AR5, A10), run by
    // arcade-runner.js (kind 'mame'). Its licence would allow the donation line; Bryan chose none on arcade games.
    mame: { kind: 'mame', engine: 'engine/mame/{engine}.js', systems: ['arcade'], name: 'MAME 0.289', licence: 'GPL-2.0',
      source: 'https://github.com/mamedev/mame/tree/f09e0805da149cb15bd1cd777fbbcc65640d7866', terms: 'engine/mame/COPYING', noDonation: true },
  };

  // A console card ("controls.kind": "pad") presses the console's own buttons, named P1:A, P1:Start and so on (P2: for
  // the second player). These are the usual seats for them; a card only lists what differs.
  const PAD_GAMEPAD = { A: 'P1:B', B: 'P1:A', X: 'P1:Y', Y: 'P1:X', LB: 'P1:L', RB: 'P1:R', Back: 'P1:Select',
    Start: 'P1:Start', Up: 'P1:Up', Down: 'P1:Down', Left: 'P1:Left', Right: 'P1:Right', Home: '@menu', LT: '@rewind' };
  const PAD_KEYBOARD = { ArrowUp: 'P1:Up', ArrowDown: 'P1:Down', ArrowLeft: 'P1:Left', ArrowRight: 'P1:Right',
    KeyZ: 'P1:B', KeyX: 'P1:A', KeyA: 'P1:Y', KeyS: 'P1:X', KeyQ: 'P1:L', KeyW: 'P1:R', Enter: 'P1:Start',
    ShiftRight: 'P1:Select', Escape: '@menu', KeyR: '@rewind' };
  const isPad = (card) => !!(card && card.controls && card.controls.kind === 'pad');
  const gamepadMap = (card) => Object.assign({}, isPad(card) ? PAD_GAMEPAD : {}, (card && card.gamepad) || {});
  // What a PC key does in this game: itself in a DOS game, a console button (or nothing) in a console game.
  const keyMap = (card) => (isPad(card) ? Object.assign({}, PAD_KEYBOARD, card.keyboard || {}) : null);

  function check(card) {
    const bad = [];
    if (!card || typeof card !== 'object') return ['not a card'];
    if (!/^[a-z0-9-]+$/.test(card.id || '')) bad.push('id');
    if (!card.title) bad.push('title');
    const a = card.archive || {};
    if (!/^[A-Za-z0-9._-]+$/.test(a.item || '')) bad.push('archive.item');
    if (!a.file || /(^|\/)\.\.(\/|$)/.test(a.file)) bad.push('archive.file');
    const core = CORES[card.core];
    if (!core) bad.push('core');
    else if (core.kind === 'mame' && !/^[a-z0-9_]+$/.test(a.driver || '')) bad.push('archive.driver');
    else if (core.kind === 'mame' && !/^[a-z0-9_]+$/.test(a.engine || '')) bad.push('archive.engine');
    else if (!core.systems.includes(card.system)) bad.push('system');
    if (!card.controls || !card.controls.kind) bad.push('controls');
    return bad;
  }

  // Through archive.org/cors/: the one Archive address a page on another site may read (FINDINGS 19 Nov 2026).
  function gameUrl(card) {
    return 'https://archive.org/cors/' + card.archive.item + '/' + card.archive.file.split('/').map(encodeURIComponent).join('/');
  }
  const itemPage = (card) => 'https://archive.org/details/' + card.archive.item;
  // archive.as: the name the core sees (Sega's Master System and Game Gear files on the Archive end in .bin, and the
  // core tells the machines apart by the ending).
  const gameFile = (card) => card.archive.as || card.archive.file.split('/').pop();
  // MAME has one engine per family of arcade machines: engine/mame/{engine}.js; the card names its family and its driver.
  const engineOf = (card) => CORES[card.core].engine.replace('{engine}', (card.archive && card.archive.engine) || '');

  // Actions (audit batch 4, block A): what the game's buttons DO, in the game's own words. A card lists three to six,
  // the ones a newcomer needs first: { do: 'Jump', press: 'P1:B' }, press may be a list (any of them: the arrows) or a
  // range (press: 'Digit1', to: 'Digit9'), or '@keyboard' (the pop-up keyboard). Every help line, the start screen and the
  // touch keys' small words are drawn from it, so a game is described once and every input speaks its words:
  // "Jump: A on a gamepad, Z on the keyboard, B on screen".
  function warnings(card) {
    const w = [];
    if (!Array.isArray(card.actions) || card.actions.length < 3) w.push('actions: list the three to six things a newcomer needs first');
    return w;
  }
  const DIGIT = /^Digit(\d)$/;
  function codesOf(a) {
    const list = [].concat(a.press);
    if (a.to && DIGIT.test(list[0]) && DIGIT.test(a.to)) {
      const from = +list[0].slice(5), to = +a.to.slice(5); const out = [];
      for (let n = from; n <= to; n++) out.push('Digit' + n);
      return out;
    }
    return list;
  }
  const KEY_NAMES = { ArrowUp: 'Up arrow', ArrowDown: 'Down arrow', ArrowLeft: 'Left arrow', ArrowRight: 'Right arrow',
    Enter: 'Enter', Space: 'Space', Escape: 'Esc', ShiftLeft: 'Shift', ShiftRight: 'right Shift', Backspace: 'Backspace',
    ControlLeft: 'left Ctrl', AltLeft: 'left Alt' };
  const keyName = (k) => KEY_NAMES[k] || k.replace(/^Key|^Digit/, '');
  const DIRS = ['Up', 'Down', 'Left', 'Right'];
  // Buttons by their place on the pad, the letter after it: a Nintendo-style pad has B at the bottom and a PlayStation
  // pad shows shapes, but every pad has a bottom button.
  const PLACES = { A: 'the bottom button (A)', B: 'the right button (B)', X: 'the left button (X)', Y: 'the top button (Y)' };
  // Directions named from what they are: all four is "the d-pad", fewer are named ("d-pad Down", "d-pad Left or Right").
  const dirWords = (set) => (set.size >= 4 ? 'the d-pad' : 'd-pad ' + DIRS.filter((d) => set.has(d)).join(' or '));
  const join = (xs) => (xs.length < 3 ? xs.join(' or ') : xs.slice(0, -1).join(', ') + ' or ' + xs[xs.length - 1]);
  // How to do one action on each kind of input: { pad, keyboard, touch } in plain words ('' when that input cannot).
  function seatsOf(card, a) {
    const codes = codesOf(a);
    const range = a.to ? keyName(codes[0]) + ' to ' + keyName(codes[codes.length - 1]) : null;
    if (codes[0] === '@keyboard') return { pad: PLACES.Y, keyboard: 'type', touch: 'Keyboard' };
    const map = gamepadMap(card), keys = keyMap(card);
    const pad = [], dirs = new Set();
    for (const [btn, code] of Object.entries(map)) if (codes.includes(code)) (DIRS.includes(btn) ? dirs.add(btn) : pad.push(btn));
    const padWords = pad.map((b) => PLACES[b] || b);
    if (dirs.size) padWords.unshift(dirWords(dirs));
    const kb = keys ? Object.entries(keys).filter(([, v]) => codes.includes(v)).map(([k]) => keyName(k)) : codes.map(keyName);
    const labels = (card.controls && card.controls.labels) || {};
    const touchKeys = new Set([...(card.controls.keys || []), ...(card.controls.numbers || [])]);
    const onScreen = codes.filter((c) => touchKeys.has(c)).map((c) => labels[c] || keyName(c.replace(/^P[1-4]:/, '')));
    const dpadOnScreen = card.controls.dpad && codes.some((c) => /^(P[1-4]:)?(Up|Down|Left|Right)$|^Arrow/.test(c));
    // Arrow keys read as one: "the arrow keys", "Left or Right arrow".
    const arrows = kb.filter((k) => / arrow$/.test(k));
    const kbWords = arrows.length > 2 && arrows.length === kb.length ? ['the arrow keys']
      : arrows.length === 2 && kb.length === 2 ? [arrows[0].replace(/ arrow$/, '') + ' or ' + arrows[1]] : kb;
    // A gamepad reaches only part of a range (four shoulder buttons for nine numbers): say which part.
    const padReach = range && pad.length ? ' (' + keyName(map[pad[0]]) + ' to ' + keyName(map[pad[pad.length - 1]]) + ')' : '';
    // On screen: the d-pad's own directions, named the same way.
    const screenDirs = new Set(codes.map((c) => (/^(?:P[1-4]:)?(Up|Down|Left|Right)$/.exec(c) || /^Arrow(Up|Down|Left|Right)$/.exec(c) || [])[1]).filter(Boolean));
    // The second set (plan T23): "hold LT with the d-pad, LB or RB (4 to 9)".
    let shiftWords = '';
    const sh = card.gamepadShift;
    if (sh && sh.map) {
      const sp = [], sd = new Set();
      for (const [b, c] of Object.entries(sh.map)) if (codes.includes(c)) (DIRS.includes(b) ? sd.add(b) : sp.push(b));
      if (sp.length || sd.size) {
        const vals = codes.filter((c) => Object.values(sh.map).includes(c));
        const reach = range ? ' (' + keyName(vals[0]) + ' to ' + keyName(vals[vals.length - 1]) + ')' : '';
        shiftWords = 'hold ' + sh.on + ' with ' + join([...(sd.size ? [sd.size >= 4 ? 'the d-pad' : dirWords(sd)] : []), ...sp.map((b) => PLACES[b] || b)]) + reach;
      }
    }
    return {
      pad: [padWords.length ? join(padWords) + padReach : '', shiftWords].filter(Boolean).join('; '),
      keyboard: range && !keys ? range : kbWords.length === 1 ? kbWords[0] : join(kbWords),
      touch: range ? range : dpadOnScreen && !onScreen.length ? dirWords(screenDirs) : join(onScreen),
    };
  }
  // One line per action: "Jump: A on a gamepad, Z on the keyboard, B on screen". device narrows it to one input.
  function actionLines(card, device) {
    return (card.actions || []).map((a) => {
      const s = seatsOf(card, a);
      const parts = device ? [s[device]].filter(Boolean)
        : [s.pad && s.pad + ' on a gamepad', s.keyboard && s.keyboard + ' on the keyboard', s.touch && s.touch + ' on screen'].filter(Boolean);
      return { do: a.do, how: parts.join(', ') };
    }).filter((l) => l.how);
  }
  // The small word under a touch key: the action that key does, if the card names one.
  function actionFor(card, code) {
    const a = (card.actions || []).find((x) => codesOf(x).includes(code));
    return a ? a.do : '';
  }

  // A console game the Archive keeps inside a .zip (the assistant, 20 Nov 2026: Pokemon FireRed's zip was refused by
  // mGBA): the player unpacks it and hands the core the one file with the machine's own ending.
  const ROM_EXTS = { nes: ['nes', 'unf', 'fds'], snes: ['sfc', 'smc', 'fig', 'swc'], genesis: ['md', 'gen', 'bin', 'smd'],
    sms: ['sms'], gamegear: ['gg'], gameboy: ['gb', 'gbc'], gbcolor: ['gbc', 'gb'], gba: ['gba'], a2600: ['a26', 'bin'],
    lynx: ['lnx', 'lyx', 'o'] };
  const romExts = (card) => (card && !(card.archive || {}).start && ROM_EXTS[card.system]) || [];

  const api = { check, warnings, gameUrl, itemPage, gameFile, engineOf, CORES, isPad, gamepadMap, keyMap, PAD_GAMEPAD, PAD_KEYBOARD,
    codesOf, seatsOf, actionLines, actionFor, ROM_EXTS, romExts };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayCards = api;
})(typeof self !== 'undefined' ? self : this);
