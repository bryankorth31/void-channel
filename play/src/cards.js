// VoidTV PLAY: game cards. Licence: GPL-2.0-or-later (play/LICENSE).
// One small JSON per game (Couch Craft's card, translated): which Archive item and file, which core, which program to
// start, the controls the touch pad draws, and the gamepad map the hub uses. The game file is always fetched from the
// Internet Archive at play time; voidtv.net never keeps it.
(function (root) {
  // Which systems each core plays. Every engine file is built by play/core (build.sh for DOSBox Pure, build-core.js for
  // the rest) from the exact source named there.
  const CORES = {
    // name, licence and source are what the player page shows under every game; terms is the licence text that must
    // travel with a non-GPL core (served beside its engine).
    'dosbox-pure': { engine: 'engine/dosbox-pure.js', systems: ['dos'], name: 'DOSBox Pure', licence: 'GPL-2.0',
      source: 'https://github.com/libretro/dosbox-pure/tree/e39497e7c2a32c67c26e6598dd14f6d58c384bfd' },
    'genesis-plus-gx': { engine: 'engine/genesis-plus-gx.js', systems: ['genesis', 'sms', 'gamegear'], name: 'Genesis Plus GX',
      licence: 'non-commercial licence', source: 'https://github.com/libretro/Genesis-Plus-GX/tree/b9c2316441978d4015ba30e9a95d9b0e6f8ee981',
      terms: 'engine/genesis-plus-gx.LICENSE.txt' },
    snes9x: { engine: 'engine/snes9x.js', systems: ['snes'], name: 'Snes9x', licence: 'non-commercial licence',
      source: 'https://github.com/libretro/snes9x/tree/204ea1c0b851f960cbf223075eb1c25641cb483c', terms: 'engine/snes9x.LICENSE.txt' },
    fceumm: { engine: 'engine/fceumm.js', systems: ['nes'], name: 'FCEUmm', licence: 'GPL-2.0',
      source: 'https://github.com/libretro/libretro-fceumm/tree/77468e568d9fe9c48d684ca911f1a3fe7259fdf7' },
    gambatte: { engine: 'engine/gambatte.js', systems: ['gameboy', 'gbcolor'], name: 'Gambatte', licence: 'GPL-2.0',
      source: 'https://github.com/libretro/gambatte-libretro/tree/77f2567d718b8973d02caa2daa8dce4953faf811' },
    stella2014: { engine: 'engine/stella2014.js', systems: ['a2600'], name: 'Stella 2014', licence: 'GPL-2.0',
      source: 'https://github.com/libretro/stella2014-libretro/tree/7d1361e407e63f29e52892655069e5fb4096e691' },
  };

  // A console card ("controls.kind": "pad") presses the console's own buttons, named P1:A, P1:Start and so on (P2: for
  // the second player). These are the usual seats for them; a card only lists what differs.
  const PAD_GAMEPAD = { A: 'P1:B', B: 'P1:A', X: 'P1:Y', Y: 'P1:X', LB: 'P1:L', RB: 'P1:R', Back: 'P1:Select',
    Start: 'P1:Start', Up: 'P1:Up', Down: 'P1:Down', Left: 'P1:Left', Right: 'P1:Right', Home: '@menu' };
  const PAD_KEYBOARD = { ArrowUp: 'P1:Up', ArrowDown: 'P1:Down', ArrowLeft: 'P1:Left', ArrowRight: 'P1:Right',
    KeyZ: 'P1:B', KeyX: 'P1:A', KeyA: 'P1:Y', KeyS: 'P1:X', KeyQ: 'P1:L', KeyW: 'P1:R', Enter: 'P1:Start',
    ShiftRight: 'P1:Select', Escape: '@menu' };
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
  const engineOf = (card) => CORES[card.core].engine;

  const api = { check, gameUrl, itemPage, gameFile, engineOf, CORES, isPad, gamepadMap, keyMap, PAD_GAMEPAD, PAD_KEYBOARD };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayCards = api;
})(typeof self !== 'undefined' ? self : this);
