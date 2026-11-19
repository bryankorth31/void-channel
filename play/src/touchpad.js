// VoidTV PLAY: the on-screen touch pad, drawn from the game's card. Licence: GPL-2.0-or-later (play/LICENSE).
// Ideas studied, no code taken (play/SOURCES.md): RetroArch overlays (zones at the screen edges), nipplejs (a pad you
// can slide across), js-dos (keys a DOS game needs, and a keyboard that pops up only when you type).
// Every press goes to the input hub as a key; nothing here talks to the game.
(function (root) {
  const LABELS = { Enter: 'Enter', Space: 'Space', Escape: 'Esc', Backspace: '⌫', ShiftLeft: 'Shift',
    ArrowUp: '▲', ArrowDown: '▼', ArrowLeft: '◀', ArrowRight: '▶', Tab: 'Tab' };
  const label = (code) => LABELS[code] || code.replace(/^Key|^Digit/, '');
  const QWERTY = [['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'],
    'QWERTYUIOP'.split('').map((c) => 'Key' + c), 'ASDFGHJKL'.split('').map((c) => 'Key' + c),
    ['ShiftLeft', ...'ZXCVBNM'.split('').map((c) => 'Key' + c), 'Backspace'], ['Space', 'Enter']];

  // Keep a finger's events on the button it started on (never throws, even for a pointer the browser does not track).
  const capture = (node, e) => { try { node.setPointerCapture(e.pointerId); } catch (err) { /* nothing to capture */ } };
  // A small buzz under the thumb, only after a real tap (browsers refuse it before one).
  const tick = () => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(8); } catch (e) { /* no haptics here */ } };

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  // A plain key: down while a finger is on it, up when the finger lifts or slides away.
  function keyButton(code, hub, cls) {
    const b = el('button', 'pk ' + (cls || ''), label(code));
    b.type = 'button'; b.dataset.code = code; b.setAttribute('aria-label', code);
    const up = (e) => { if (b.dataset.down) { delete b.dataset.down; hub.touch(code, false, e.pointerId); } };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); capture(b, e); b.dataset.down = '1'; tick(); hub.touch(code, true, e.pointerId); });
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  // The arrow pad: one round pad, the finger can slide between directions (and diagonals) without lifting.
  function dpad(hub) {
    const pad = el('div', 'pdpad'); pad.setAttribute('aria-label', 'Arrow keys');
    for (const c of ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown']) pad.appendChild(el('span', 'pdir ' + c, label(c)));
    const held = new Map(); // pointerId -> Set of codes
    function aim(e) {
      const r = pad.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
      const now = new Set();
      if (Math.hypot(dx, dy) > 0.12) {
        const a = Math.atan2(dy, dx) * 180 / Math.PI; // 0 = right, 90 = down
        if (a > -67.5 && a < 67.5) now.add('ArrowRight');
        if (a > 22.5 && a < 157.5) now.add('ArrowDown');
        if (a > 112.5 || a < -112.5) now.add('ArrowLeft');
        if (a > -157.5 && a < -22.5) now.add('ArrowUp');
      }
      const before = held.get(e.pointerId) || new Set();
      for (const c of before) if (!now.has(c)) hub.touch(c, false, e.pointerId);
      for (const c of now) if (!before.has(c)) { hub.touch(c, true, e.pointerId); tick(); }
      held.set(e.pointerId, now);
      for (const s of pad.children) s.classList.toggle('on', [...held.values()].some((set) => set.has(s.classList[1])));
    }
    function lift(e) { for (const c of held.get(e.pointerId) || []) hub.touch(c, false, e.pointerId); held.delete(e.pointerId); for (const s of pad.children) s.classList.remove('on'); }
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); capture(pad, e); aim(e); });
    pad.addEventListener('pointermove', (e) => { if (held.has(e.pointerId)) aim(e); });
    pad.addEventListener('pointerup', lift); pad.addEventListener('pointercancel', lift);
    return pad;
  }

  // The pop-up keyboard, for typing names and answers. It slides up over the pad, never over the picture in portrait.
  function keyboard(hub, onClose) {
    const box = el('div', 'pkeyboard'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Keyboard');
    for (const row of QWERTY) {
      const r = el('div', 'pkrow');
      for (const code of row) r.appendChild(keyButton(code, hub, code === 'Space' ? 'wide' : code === 'Enter' ? 'wide go' : ''));
      box.appendChild(r);
    }
    const close = el('button', 'pk pkclose', 'Hide keyboard'); close.type = 'button';
    close.addEventListener('click', onClose);
    box.appendChild(close);
    return box;
  }

  // Build the pad for this card into the zones the layout gave us.
  function build(zones, card, hub) {
    const c = (card && card.controls) || {};
    for (const z of Object.values(zones)) z.textContent = '';
    const kb = keyboard(hub, () => kb.classList.remove('open'));
    const kbButton = el('button', 'pk pkbd', 'Keyboard'); kbButton.type = 'button';
    kbButton.addEventListener('click', () => { kb.classList.toggle('open'); tick(); });
    const nums = el('div', 'pnums');
    for (const code of c.numbers || []) nums.appendChild(keyButton(code, hub));
    const keys = el('div', 'pkeys');
    for (const code of c.keys || []) keys.appendChild(keyButton(code, hub, code === 'Enter' ? 'go' : ''));
    const left = el('div', 'pzone'), right = el('div', 'pzone');
    if (c.dpad) left.appendChild(dpad(hub));
    right.appendChild(nums); right.appendChild(keys);
    if (c.keyboard) left.appendChild(kbButton);
    if (zones.pad) { const row = el('div', 'prow'); row.appendChild(left); row.appendChild(right); zones.pad.appendChild(row); zones.pad.appendChild(kb); }
    else { zones.left.appendChild(left); zones.right.appendChild(right); zones.right.appendChild(kb); }
    return { keyboard: kb, openKeyboard: () => kb.classList.add('open') };
  }

  const api = { build, label, QWERTY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayTouch = api;
})(typeof self !== 'undefined' ? self : this);
