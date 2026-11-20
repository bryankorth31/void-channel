// VoidTV PLAY: the on-screen touch pad, drawn from the game's card. Licence: GPL-2.0-or-later (play/LICENSE).
// Ideas studied, no code taken (play/SOURCES.md): RetroArch overlays (zones at the screen edges), nipplejs (a pad you
// can slide across), js-dos (keys a DOS game needs, and a keyboard that pops up only when you type).
// Bryan, 19 Nov 2026: "use the space better": big keys fill the room beside or under the picture, no empty corners.
// Every press goes to the input hub as a key; nothing here talks to the game.
(function (root) {
  const LABELS = { Enter: 'Enter', Space: 'Space', Escape: 'Esc', Backspace: '⌫', ShiftLeft: 'Shift',
    ArrowUp: '▲', ArrowDown: '▼', ArrowLeft: '◀', ArrowRight: '▶', Tab: 'Tab',
    ControlLeft: 'Ctrl', AltLeft: 'Alt' };
  // A console button (P1:A) shows its own letter; a card can rename any key (Genesis A B C, the 2600's Fire and Reset).
  let names = {};
  const label = (code) => names[code] || LABELS[code] || code.replace(/^P[1-4]:/, '').replace(/^Key|^Digit/, '');
  LABELS['@rewind'] = '◀◀';
  LABELS['@click'] = 'L click'; LABELS['@rclick'] = 'R click';   // a DOS game's mouse buttons (plan T21b)
  const QWERTY = [['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'],
    'QWERTYUIOP'.split('').map((c) => 'Key' + c), 'ASDFGHJKL'.split('').map((c) => 'Key' + c),
    ['ShiftLeft', ...'ZXCVBNM'.split('').map((c) => 'Key' + c), 'Backspace'], ['Space', 'Enter']];

  // Everything the touch layer holds can be let go at once (the audit, Bryan: "3 of the directional buttons locked down"
  // when Safari took the touch for a zoom and the finger's own lift never came). Each key and pad adds its own here.
  let letGo = [];
  function releaseAll() { for (const f of letGo) { try { f(); } catch (e) { /* a key already gone */ } } }

  // Keep a finger's events on the button it started on (never throws, even for a pointer the browser does not track).
  const capture = (node, e) => { try { node.setPointerCapture(e.pointerId); } catch (err) { /* nothing to capture */ } };
  // A small buzz under the thumb, only after a real tap (browsers refuse it before one).
  const tick = () => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(8); } catch (e) { /* no haptics here */ } };

  // The keys sit in a box that play.css measures (container queries); the pop-up keyboard stays outside it, so it can
  // still cover the bottom of the screen.
  const sizer = (inner) => { const b = el('div', 'pbox'); b.appendChild(inner); return b; };

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  // A plain key: down while a finger is on it, up when the finger lifts or slides away.
  function keyButton(code, hub, cls) {
    const b = el('button', 'pk ' + (cls || ''), label(code));
    b.type = 'button'; b.dataset.code = code; b.setAttribute('aria-label', code);
    const up = (e) => { if (b.dataset.down) { delete b.dataset.down; hub.touch(code, false, e.pointerId); } };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); capture(b, e); b.dataset.down = String(e.pointerId); tick(); hub.touch(code, true, e.pointerId); });
    letGo.push(() => { if (b.dataset.down) { const id = Number(b.dataset.down); delete b.dataset.down; hub.touch(code, false, id); } });
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  // The arrow pad: one round pad, the finger can slide between directions (and diagonals) without lifting.
  // codes: what each direction presses: the arrow keys for a PC game, the console's own d-pad for a console game.
  const ARROWS = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
  const PAD_DIRS = { ArrowUp: 'P1:Up', ArrowDown: 'P1:Down', ArrowLeft: 'P1:Left', ArrowRight: 'P1:Right' };
  function dpad(hub, codes) {
    codes = codes || ARROWS;
    const pad = el('div', 'pdpad'); pad.setAttribute('aria-label', 'Arrow keys');
    for (const c of ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown']) pad.appendChild(el('span', 'pdir ' + c, label(c)));
    const held = new Map(); // pointerId -> Set of codes
    function aim(e) {
      const r = pad.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
      const now = new Set();
      if (Math.hypot(dx, dy) > 0.12) {
        const a = Math.atan2(dy, dx) * 180 / Math.PI; // 0 = right, 90 = down
        if (a > -67.5 && a < 67.5) now.add(codes.ArrowRight);
        if (a > 22.5 && a < 157.5) now.add(codes.ArrowDown);
        if (a > 112.5 || a < -112.5) now.add(codes.ArrowLeft);
        if (a > -157.5 && a < -22.5) now.add(codes.ArrowUp);
      }
      const before = held.get(e.pointerId) || new Set();
      for (const c of before) if (!now.has(c)) hub.touch(c, false, e.pointerId);
      for (const c of now) if (!before.has(c)) { hub.touch(c, true, e.pointerId); tick(); }
      held.set(e.pointerId, now);
      for (const s of pad.children) s.classList.toggle('on', [...held.values()].some((set) => set.has(codes[s.classList[1]])));
    }
    // A finger lifting (or the browser taking it away) lets go of only its own directions; the others stay lit.
    function lift(e) { for (const c of held.get(e.pointerId) || []) hub.touch(c, false, e.pointerId); held.delete(e.pointerId); for (const s of pad.children) s.classList.toggle('on', [...held.values()].some((set) => set.has(codes[s.classList[1]]))); }
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); capture(pad, e); aim(e); });
    pad.addEventListener('pointermove', (e) => { if (held.has(e.pointerId)) aim(e); });
    pad.addEventListener('pointerup', lift); pad.addEventListener('pointercancel', lift); pad.addEventListener('lostpointercapture', lift);
    letGo.push(() => { for (const id of [...held.keys()]) lift({ pointerId: id }); });
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

  // Which keys go where, from the card alone (no screen sizes here; play.css and layout.js size them).
  // Sideways: the right thumb gets the numbers and Enter (pick a number, then Enter); the left thumb gets the arrows,
  // Space and the rest. A card with no numbers is a game pad: arrows on the left, every key on the right.
  // Upright: the numbers in one row (two on a narrow phone), then Space and Enter, then the arrows beside the rest.
  function plan(c) {
    const numbers = c.numbers || [], keys = (c.keys || []).concat(c.mouse ? ['@click', '@rclick'] : []);
    const go = ['Space', 'Enter'].filter((k) => keys.includes(k));
    const rest = keys.filter((k) => !go.includes(k));
    const sideways = numbers.length
      ? { right: [...numbers, ...(keys.includes('Enter') ? ['Enter'] : [])], left: keys.filter((k) => k !== 'Enter') }
      : { right: keys, left: [] };
    // Space first and full width on the left: it is the key the game asks for most.
    sideways.left.sort((a, b) => (b === 'Space') - (a === 'Space'));
    return { numbers, go, rest, sideways, keyboard: !!c.keyboard, dpad: !!c.dpad };
  }

  // Console pads shaped like the machine's own (audit batch 4, block D): one shape per system, rules not per-game code.
  // Each shape places the face buttons on a small grid [code, row, column]; L and R sit at the top of their side, Select
  // and Start small underneath. A button shows its letter big and its action word small (from the card's actions).
  const SHAPES = {
    diamond: { cols: 3, rows: 3, face: [['P1:X', 1, 2], ['P1:Y', 2, 1], ['P1:A', 2, 3], ['P1:B', 3, 2]] },
    abc: { cols: 3, rows: 3, face: [['P1:Y', 3, 1], ['P1:B', 2, 2], ['P1:A', 1, 3]] },
    pair: { cols: 2, rows: 2, face: [['P1:B', 2, 1], ['P1:A', 1, 2]] },
    one: { cols: 1, rows: 1, face: [['P1:B', 1, 1]] },
  };
  const SYSTEM_SHAPE = { snes: 'diamond', genesis: 'abc', nes: 'pair', gameboy: 'pair', gbcolor: 'pair', sms: 'pair', gamegear: 'pair', gba: 'pair', lynx: 'pair', a2600: 'one' };
  const shapeOf = (card) => SHAPES[SYSTEM_SHAPE[card && card.system] || 'pair'];
  // How many key columns a side needs at least: a three-wide shape asks the layout for wider sides.
  // The console pad now floats over the stage (B: "Keep the big picture"), so no shape asks for wider side columns.
  const minCols = () => 2;

  function consoleKey(code, hub, card, cls) {
    const b = keyButton(code, hub, cls);
    const word = code === '@rewind' ? 'Rewind' : (root.PlayCards && root.PlayCards.actionFor(card, code)) || '';
    b.textContent = '';
    b.append(el('span', 'big', label(code)));
    // D2: no word when it only repeats the letter (Start on Start).
    if (word && word.toLowerCase() !== label(code).toLowerCase()) b.append(el('span', 'small', word));
    b.setAttribute('aria-label', label(code) + (word ? ', ' + word : ''));
    return b;
  }

  // B, 20 Nov 2026: "Keep the big picture" and "larger controls spread to right positions", "Yes, build as drawn".
  // A console pad is one layer over the stage, with each control where a thumb sits on a real pad: the d-pad big and
  // low on the left edge, the face buttons big and low on the right edge in the machine's own shape, L and R at the top
  // corners, Select, Start and rewind small near the top. Sideways the picture keeps its size and the big keys may cross
  // its edge, see-through; upright the layer is the room under the picture, so nothing covers it.
  function buildConsole(zones, card, hub) {
    const keys = card.controls.keys || [];
    const shape = shapeOf(card);
    const layer = el('div', 'cpad ' + (zones.mode === 'portrait' ? 'up' : 'side'));
    layer.style.setProperty('--cols', shape.cols); layer.style.setProperty('--rows', shape.rows); // L and R sit above the taller side
    const face = el('div', 'cface');
    face.style.setProperty('--cols', shape.cols); face.style.setProperty('--rows', shape.rows);
    if (shape === SHAPES.one) face.classList.add('one');
    for (const [code, r, col] of shape.face) {
      if (!keys.includes(code)) continue;
      const k = consoleKey(code, hub, card); k.style.gridRow = r; k.style.gridColumn = col; face.appendChild(k);
    }
    const pad = el('div', 'cdpad'); if (card.controls.dpad) pad.appendChild(dpad(hub, PAD_DIRS));
    layer.append(pad, face);
    const put = (code, cls) => { if (code[0] === '@' || keys.includes(code)) layer.appendChild(consoleKey(code, hub, card, cls)); };
    put('P1:L', 'cshoulder csl'); put('P1:R', 'cshoulder csr');
    put('P1:Select', 'pill cselect'); put('P1:Start', 'pill cstart'); put('@rewind', 'pill crewind');
    zones.over.appendChild(layer);
    return { keyboard: el('div'), openKeyboard: () => {} };
  }

  // Build the pad for this card into the zones the layout gave us.
  function build(zones, card, hub) {
    letGo = [];
    const c = (card && card.controls) || {};
    if (c.kind === 'pad') {
      for (const z of Object.values(zones)) z.textContent = '';
      names = c.labels || {};
      return buildConsole(zones, card, hub);
    }
    const p = plan(c);
    names = c.labels || {};
    const dirs = c.kind === 'pad' ? PAD_DIRS : ARROWS;
    for (const z of Object.values(zones)) z.textContent = '';
    const kb = keyboard(hub, () => kb.classList.remove('open'));
    const kbButton = (text) => {
      const b = el('button', 'pk pkbd', text); b.type = 'button'; b.setAttribute('aria-label', 'Keyboard');
      b.addEventListener('click', () => { kb.classList.toggle('open'); tick(); });
      return b;
    };
    const key = (code, extra) => keyButton(code, hub, [code === 'Enter' ? 'go' : '', extra || ''].join(' ').trim());

    if (zones.pad) {
      const pp = el('div', 'pp');
      const section = (cls, rows, cols) => {
        const s = el('div', 'psec ' + cls); s.style.setProperty('--r', rows); s.style.setProperty('--nc', cols); pp.appendChild(s); return s;
      };
      if (p.numbers.length) {
        const s = section('pnums', 1, p.numbers.length);
        s.style.setProperty('--nc2', Math.ceil(p.numbers.length / 2));
        for (const code of p.numbers) s.appendChild(key(code));
      }
      if (p.go.length) { const s = section('pgo', 1, p.go.length); for (const code of p.go) s.appendChild(key(code)); }
      const rest = p.rest.map((code) => key(code));
      if (p.keyboard) rest.push(kbButton('Keyboard'));
      if (p.dpad || rest.length) {
        const perRow = p.dpad ? 2 : 5;
        const rows = Math.max(p.dpad ? 2 : 1, Math.ceil(rest.length / perRow));
        // A console pad with many buttons: on a narrow phone the d-pad takes its own row (play.css), or it would push
        // the buttons off the screen.
        const s = section('pblock' + (p.dpad ? ' with-dpad' : '') + (p.dpad && rest.length > 4 ? ' many' : ''), rows, 1);
        if (p.dpad) s.appendChild(dpad(hub, dirs));
        if (rest.length) {
          const g = el('div', 'prest'); g.style.setProperty('--nc', Math.min(perRow, rest.length));
          for (const b of rest) g.appendChild(b);
          s.appendChild(g);
        }
      }
      zones.pad.appendChild(sizer(pp)); zones.pad.appendChild(kb);
    } else {
      const left = el('div', 'pcol'), right = el('div', 'pcol');
      for (const code of p.sideways.left) left.appendChild(key(code, code === 'Space' ? 'span' : ''));
      if (p.keyboard) left.appendChild(kbButton('ABC'));
      if (p.dpad) { const w = el('div', 'pdwrap'); w.appendChild(dpad(hub, dirs)); left.appendChild(w); }   // the wrap keeps the pad round
      for (const code of p.sideways.right) right.appendChild(key(code));
      zones.left.appendChild(sizer(left)); zones.right.appendChild(sizer(right)); zones.right.appendChild(kb);
    }
    return { keyboard: kb, openKeyboard: () => kb.classList.add('open') };
  }

  const api = { build, releaseAll, plan, label, QWERTY, SHAPES, SYSTEM_SHAPE, shapeOf, minCols };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayTouch = api;
})(typeof self !== 'undefined' ? self : this);
