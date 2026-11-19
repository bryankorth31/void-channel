// VoidTV PLAY: one table of PC keys. Licence: GPL-2.0-or-later (play/LICENSE).
// The browser names a key by KeyboardEvent.code ("KeyA", "Enter"); the core names it by the libretro number
// (RETROK_a = 97, RETROK_RETURN = 13). Everything that presses a key (the keyboard, a gamepad through the hub, a touch
// button, the pop-up keyboard) goes through this one table, so a key means the same thing from every source.
(function (root) {
  const RETROK = {
    Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Space: 32, Quote: 39, Comma: 44, Minus: 45, Period: 46, Slash: 47,
    Semicolon: 59, Equal: 61, BracketLeft: 91, Backslash: 92, BracketRight: 93, Backquote: 96, Delete: 127,
    Numpad0: 256, Numpad1: 257, Numpad2: 258, Numpad3: 259, Numpad4: 260, Numpad5: 261, Numpad6: 262, Numpad7: 263,
    Numpad8: 264, Numpad9: 265, NumpadDecimal: 266, NumpadDivide: 267, NumpadMultiply: 268, NumpadSubtract: 269,
    NumpadAdd: 270, NumpadEnter: 271, ArrowUp: 273, ArrowDown: 274, ArrowRight: 275, ArrowLeft: 276, Insert: 277,
    Home: 278, End: 279, PageUp: 280, PageDown: 281, CapsLock: 301, ShiftRight: 303, ShiftLeft: 304,
    ControlRight: 305, ControlLeft: 306, AltRight: 307, AltLeft: 308,
  };
  for (let i = 0; i < 10; i++) RETROK['Digit' + i] = 48 + i;
  for (let i = 0; i < 26; i++) RETROK['Key' + String.fromCharCode(65 + i)] = 97 + i;
  for (let i = 1; i <= 12; i++) RETROK['F' + i] = 281 + i;

  // The character a key types (no Shift), so the core's keyboard callback gets the letter as well as the key.
  function charOf(code, shift) {
    if (/^Key[A-Z]$/.test(code)) return (shift ? code[3] : code[3].toLowerCase()).charCodeAt(0);
    if (/^Digit\d$/.test(code)) return code.charCodeAt(5);
    if (code === 'Space') return 32;
    if (code === 'Enter' || code === 'NumpadEnter') return 13;
    if (code === 'Backspace') return 8;
    const plain = { Comma: ',', Period: '.', Minus: '-', Equal: '=', Slash: '/', Semicolon: ';', Quote: "'" };
    return plain[code] ? plain[code].charCodeAt(0) : 0;
  }

  // Shift 1, Control 2, Alt 4: the libretro modifier bits.
  function modsOf(held) {
    return (held.has('ShiftLeft') || held.has('ShiftRight') ? 1 : 0) |
      (held.has('ControlLeft') || held.has('ControlRight') ? 2 : 0) |
      (held.has('AltLeft') || held.has('AltRight') ? 4 : 0);
  }

  const api = { RETROK, charOf, modsOf, known: (code) => code in RETROK };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayKeys = api;
})(typeof self !== 'undefined' ? self : this);
