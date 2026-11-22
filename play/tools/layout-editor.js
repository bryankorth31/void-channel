// VoidTV PLAY: the controller layout editor (play/tools/layout.html). Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 21 Nov 2026: "i want a mock up of the controllers created for me with all parts moveaple ie dpad , button areas
// etc so that i can finetune this layout onece and for all since it is now more janky."
// The frame holds the real pad page at a real phone's size; this script lays a handle over each of its parts. Moving a
// handle writes that part's entry (src/padlayout.js) and has the real page place itself from it at once, so the picture
// is never a copy of the pad: it is the pad. Save sends the layout to the local server, which writes play/layouts.json.
(function (root) {
  'use strict';
  const L = root.PlayPadLayout || (typeof module === 'object' && module.exports ? require('../src/padlayout.js') : null);
  const NAMES = { dpad: 'D-pad', face: 'Buttons', l: 'L', r: 'R', select: 'Select', start: 'Start', menu: 'Menu', info: 'Top line',
    rewind: 'Rewind', cheats: 'Cheats' };
  const PARTNER = { dpad: 'face', face: 'dpad', l: 'r', r: 'l', select: 'start', start: 'select' };
  // The phones the frame can show (their screens in CSS pixels, long side first), and the widest shape any of them has.
  const PHONES = [['iPhone 14 and 15', 844, 390], ['iPhone Pro Max', 932, 430], ['iPhone SE and 8', 667, 375], ['Small phone', 568, 320], ['Android, tall', 915, 412], ['Tablet', 1024, 768]];
  const WIDEST = 2.4;

  // Pure (tested): the entry that puts a part where its partner is, on the other side: same size, same gaps.
  const mirror = (p) => ({ ax: p.ax === 'l' ? 'r' : p.ax === 'r' ? 'l' : 'c', ay: p.ay, x: p.ax === 'c' ? -p.x : p.x, y: p.y, w: p.w, h: p.h });
  // Pure (tested): a box being dragged, pulled onto the nearest line of the other parts and of the screen (edges and
  // middles) when it is within near pixels of one. Answers the box and the lines it caught, to draw them.
  function snap(box, others, W, H, near) {
    const out = { x: box.x, y: box.y, w: box.w, h: box.h }, lines = [];
    const xs = [0, W / 2, W], ys = [0, H / 2, H];
    for (const o of others) { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h); }
    const pull = (pos, size, marks) => {
      let best = null;
      for (const m of marks) for (const [off, at] of [[0, pos], [size / 2, pos + size / 2], [size, pos + size]]) {
        const d = m - at;
        if (Math.abs(d) <= near && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, m, off };
      }
      return best;
    };
    const bx = pull(box.x, box.w, xs), by = pull(box.y, box.h, ys);
    if (bx) { out.x = bx.m - bx.off; lines.push({ v: bx.m }); }
    if (by) { out.y = by.m - by.off; lines.push({ h: by.m }); }
    return { box: out, lines };
  }
  // Pure (tested): a box kept on the screen and no smaller than a thumb can find.
  function hold(box, W, H, square) {
    let w = Math.max(24, Math.min(box.w, W)), h = Math.max(24, Math.min(box.h, H));
    if (square) w = h = Math.min(w, h, W, H);
    return { x: Math.max(0, Math.min(box.x, W - w)), y: Math.max(0, Math.min(box.y, H - h)), w, h };
  }
  // Pure (tested): what is wrong, in words.
  const words = (p) => (p.kind === 'off' ? (NAMES[p.a] || p.a) + ' is off the screen' : (NAMES[p.a] || p.a) + ' and ' + (NAMES[p.b] || p.b) + ' touch');
  // Pure (tested): how a saved layout sits on each phone: as set, a little smaller, or with something wrong.
  function fits(parts, tall) {
    const fit = L.fitOf(parts, WIDEST, tall);
    return PHONES.map(([name, long, short]) => {
      const W = tall ? short : long, H = tall ? long : short, set = { parts, fit }, k = L.shrink(set, W, H);
      const bad = L.problems(L.boxes(set, W, H), W, H);
      return { name, size: W + ' x ' + H, k, bad: bad.map(words) };
    });
  }

  const api = { NAMES, PARTNER, PHONES, WIDEST, mirror, snap, hold, words, fits };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.PlayLayoutEditor = api;

  // ---- The page ----
  const $ = (id) => document.getElementById(id);
  // Each controller that can be set: the page that draws it, its door for the editor, and how a game's card becomes
  // what that page draws.
  const PADS = {
    phone: { name: 'Phone as the game pad', src: '../pad.html?edit=1', door: (w) => w.PlayPhonePad && w.PlayPhonePad.editor,
      card: (c) => root.PlayPhones.cardFor(c, root.PlayCards.gamepadMap(c), (code) => root.PlayCards.actionFor(c, code) || '') },
  };
  const GAMES = [['Super Nintendo: four buttons, L and R', 'donkey-kong-country-snes'], ['Nintendo: B and A', 'big-birds-hide-and-speak-nes'],
    ['Genesis: A, B and C', 'aladdin-genesis'], ['Game Boy Advance: B, A, L and R', 'curious-george-gba'], ['Atari 2600: one button', 'checkers-2600'],
    ['Arcade: two buttons, Coin, Start', '1941-counter-attack-arcade'], ['PC game: three keys', 'a-j-s-world-of-discovery-1992']];
  const st = { file: L.clean(null), pad: 'phone', way: 'side', phone: 0, game: 0, sel: null, snap: true, door: null, parts: [], area: null, scale: 1, works: {}, cards: {} };
  const key = () => st.pad + '.' + st.way;
  // The layout being worked on for this pad and this way of holding it: set (null: the built-in one), what was undone, whether it differs from the file.
  function work() {
    if (!st.works[key()]) { const saved = st.file[st.pad] && st.file[st.pad][st.way]; st.works[key()] = { set: saved ? { parts: JSON.parse(JSON.stringify(saved.parts)), fit: 1 } : null, undo: [], dirty: false }; }
    return st.works[key()];
  }
  const say = (text, kind) => { $('say').textContent = text; $('say').className = kind || ''; };
  const size = () => { const [, long, short] = PHONES[st.phone]; return st.way === 'side' ? [long, short] : [short, long]; };

  // The frame at the phone's own size, drawn smaller when the window is: what you see keeps its true shape.
  function frame() {
    const [W, H] = size(), stage = $('stage').getBoundingClientRect();
    st.scale = st.full ? 1 : Math.min(1, (stage.width - 28) / (W + 20), (stage.height - 28) / (H + 20));
    $('stage').classList.toggle('full', !!st.full); $('zoom').className = st.full ? 'on' : '';
    $('phone').style.width = W + 20 + 'px'; $('phone').style.height = H + 20 + 'px'; $('phone').style.transform = 'scale(' + st.scale + ')';
    $('fit').style.width = (W + 20) * st.scale + 'px'; $('fit').style.height = (H + 20) * st.scale + 'px';
  }
  // The real page places itself from the layout, then says where every part is; a part on the pad that the layout has
  // no entry for yet is taken in where it stands.
  function sync() {
    if (!st.door) return;
    const w = work();
    st.door.show(w.set);
    st.area = st.door.area(); st.parts = st.door.parts();
    if (w.set) {
      let added = false;
      for (const p of st.parts) if (!w.set.parts[p.id]) { w.set.parts[p.id] = L.toEntry(p.box, st.area.w, st.area.h); added = true; }
      if (added) { st.door.show(w.set); st.parts = st.door.parts(); }
    }
    if (st.sel && !st.parts.some((p) => p.id === st.sel)) st.sel = null;
    draw();
  }
  // After the frame changes size or draws other buttons, the pad page needs a moment to lay itself out before it is read.
  const later = (f) => setTimeout(f, 60);

  // ---- Drawing: a handle over each part, the list, the numbers, the phones it fits ----
  const handles = new Map();
  function draw() {
    const w = work(), over = $('over'), a = st.area;
    const bad = w.set ? L.problems(Object.fromEntries(st.parts.map((p) => [p.id, p.box])), a.w, a.h) : [];
    const wrong = new Set(bad.flatMap((b) => [b.a, b.b]).filter(Boolean));
    for (const [id, el] of handles) if (!st.parts.some((p) => p.id === id)) { el.remove(); handles.delete(id); }
    for (const p of st.parts) {
      let el = handles.get(p.id);
      if (!el) {
        el = document.createElement('div'); el.className = 'h'; el.dataset.id = p.id;
        el.title = p.name + ': drag to move it. Drag the round corner to make it bigger or smaller.';
        const b = document.createElement('b'); b.textContent = p.name; el.appendChild(b);
        const grip = document.createElement('i'); grip.title = 'Drag to resize ' + p.name; el.appendChild(grip);
        over.appendChild(el); handles.set(p.id, el); grab(el, p.id);
      }
      el.className = 'h' + (p.square ? ' round' : '') + (st.sel === p.id ? ' sel' : '') + (wrong.has(p.id) ? ' bad' : '') + (p.box.y < 18 ? ' low' : '');
      el.style.left = a.x + p.box.x + 'px'; el.style.top = a.y + p.box.y + 'px'; el.style.width = p.box.w + 'px'; el.style.height = p.box.h + 'px';
    }
    // The list of parts.
    const list = $('parts'); list.textContent = '';
    for (const p of st.parts) {
      const b = document.createElement('button'); b.textContent = p.name; b.title = 'Choose ' + p.name + ' to move it with the arrow keys or set its numbers';
      b.className = (st.sel === p.id ? 'on' : '') + (wrong.has(p.id) ? ' bad' : ''); b.onclick = () => { st.sel = p.id; draw(); };
      list.appendChild(b);
    }
    // The chosen part's numbers, in pixels on the phone shown.
    const p = st.parts.find((x) => x.id === st.sel), u = Math.min(a.w, a.h);
    for (const id of ['n-x', 'n-y', 'n-w', 'n-h', 'mirror', 'center']) $(id).disabled = !p;
    $('sel-name').textContent = p ? p.name : 'No part chosen';
    if (p) {
      const e = L.toEntry(p.box, a.w, a.h);
      $('l-x').textContent = e.ax === 'l' ? 'From the left' : e.ax === 'r' ? 'From the right' : 'Right of middle';
      $('l-y').textContent = e.ay === 't' ? 'From the top' : e.ay === 'b' ? 'From the bottom' : 'Below middle';
      $('n-x').value = Math.round(e.x * u); $('n-y').value = Math.round(e.y * u); $('n-w').value = Math.round(p.box.w); $('n-h').value = Math.round(p.box.h);
      $('n-h').disabled = p.square; $('mirror').disabled = !PARTNER[p.id] || !st.parts.some((x) => x.id === PARTNER[p.id]);
    } else for (const id of ['n-x', 'n-y', 'n-w', 'n-h']) $(id).value = '';
    // The phones.
    const ul = $('fits'); ul.textContent = '';
    if (!w.set) { const li = document.createElement('li'); li.textContent = 'The built-in layout. Move any part to start your own.'; ul.appendChild(li); }
    else for (const f of fits(w.set.parts, st.way === 'up')) {
      const li = document.createElement('li'), l = document.createElement('span'), r = document.createElement('span');
      l.textContent = f.name; r.textContent = f.bad.length ? f.bad[0] : f.k < 1 ? Math.round(f.k * 100) + '% size' : 'fits';
      r.className = f.bad.length ? 'bad' : 'ok'; li.title = f.size + (f.bad.length ? ': ' + f.bad.join('; ') : f.k < 1 ? ': a squarer screen, so every part is drawn a little smaller' : ': as you set it');
      li.append(l, r); ul.appendChild(li);
    }
    $('undo').disabled = !w.undo.length;
    const dirty = Object.values(st.works).some((x) => x.dirty);
    $('save').disabled = !dirty;
    $('way-side').className = st.way === 'side' ? 'on' : ''; $('way-up').className = st.way === 'up' ? 'on' : '';
    if (dirty && !$('say').classList.contains('bad')) say(bad.length ? words(bad[0]) + '. Not saved yet.' : 'Not saved yet.', bad.length ? 'bad' : '');
  }
  function guides(lines) {
    for (const g of [...$('over').querySelectorAll('.g')]) g.remove();
    for (const l of lines || []) {
      const g = document.createElement('div'); g.className = 'g ' + ('v' in l ? 'v' : 'hz');
      if ('v' in l) g.style.left = st.area.x + l.v + 'px'; else g.style.top = st.area.y + l.h + 'px';
      $('over').appendChild(g);
    }
  }

  // ---- Changing the layout ----
  // The first change takes the built-in layout in as it stands, every part of it, so nothing jumps.
  function begin() {
    const w = work();
    w.undo.push(JSON.stringify(w.set)); if (w.undo.length > 200) w.undo.shift();
    if (!w.set) { w.set = { parts: {}, fit: 1 }; for (const p of st.parts) w.set.parts[p.id] = L.toEntry(p.box, st.area.w, st.area.h); }
  }
  function put(id, box) {
    const w = work(), p = st.parts.find((x) => x.id === id);
    w.set.parts[id] = L.toEntry(hold(box, st.area.w, st.area.h, p && p.square), st.area.w, st.area.h);
    w.dirty = true; $('say').className = '';
    sync();
  }
  function grab(el, id) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      st.sel = id;
      const p = st.parts.find((x) => x.id === id), b0 = Object.assign({}, p.box), resize = e.target.tagName === 'I';
      const sx = e.clientX, sy = e.clientY;
      let moved = false;
      const move = (m) => {
        const dx = (m.clientX - sx) / st.scale, dy = (m.clientY - sy) / st.scale;
        if (!moved && Math.hypot(dx, dy) < 2) return;
        if (!moved) { moved = true; begin(); }
        const others = st.parts.filter((x) => x.id !== id).map((x) => x.box);
        let nb, lines = [];
        if (resize) {
          const d = p.square ? Math.max(dx, dy) : 0;
          nb = { x: b0.x, y: b0.y, w: b0.w + (p.square ? d : dx), h: b0.h + (p.square ? d : dy) };
          // A resized part takes its partner's size when it is nearly that already: the two sides then match.
          const mate = st.parts.find((x) => x.id === PARTNER[id]);
          if (st.snap && mate && Math.abs(nb.w - mate.box.w) <= 6 && Math.abs(nb.h - mate.box.h) <= 6) { nb.w = mate.box.w; nb.h = mate.box.h; }
        } else {
          nb = { x: b0.x + dx, y: b0.y + dy, w: b0.w, h: b0.h };
          if (st.snap && !m.altKey) { const s = snap(nb, others, st.area.w, st.area.h, 5 / st.scale); nb = s.box; lines = s.lines; }
        }
        put(id, nb); guides(lines);
      };
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); guides(); draw(); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      draw();
    });
  }
  function nudge(dx, dy) {
    const p = st.parts.find((x) => x.id === st.sel); if (!p) return;
    begin(); put(p.id, { x: p.box.x + dx, y: p.box.y + dy, w: p.box.w, h: p.box.h });
  }
  // The numbers: typed gaps and sizes, in pixels on the phone shown, kept to the edges the part already keeps to.
  function typed() {
    const p = st.parts.find((x) => x.id === st.sel); if (!p) return;
    const a = st.area, u = Math.min(a.w, a.h), e = L.toEntry(p.box, a.w, a.h), n = (id, was) => { const v = parseFloat($(id).value); return isFinite(v) ? v : was; };
    const w = n('n-w', p.box.w), h = p.square ? w : n('n-h', p.box.h);
    const b = L.toBox({ ax: e.ax, ay: e.ay, x: n('n-x', e.x * u) / u, y: n('n-y', e.y * u) / u, w: w / u, h: h / u }, a.w, a.h, 1);
    begin(); put(p.id, b);
  }
  for (const id of ['n-x', 'n-y', 'n-w', 'n-h']) $(id).addEventListener('change', typed);
  $('mirror').onclick = () => {
    const w = work(), mate = PARTNER[st.sel]; if (!mate) return;
    begin(); w.set.parts[st.sel] = mirror(w.set.parts[mate]); w.dirty = true; sync();
  };
  $('center').onclick = () => { const p = st.parts.find((x) => x.id === st.sel); if (p) { begin(); put(p.id, { x: (st.area.w - p.box.w) / 2, y: p.box.y, w: p.box.w, h: p.box.h }); } };
  $('snap').onclick = () => { st.snap = !st.snap; $('snap').className = st.snap ? 'on' : ''; $('snap').textContent = 'Line up: ' + (st.snap ? 'on' : 'off'); };
  $('builtin').onclick = () => { const w = work(); w.undo.push(JSON.stringify(w.set)); w.set = null; w.dirty = !!(st.file[st.pad] && st.file[st.pad][st.way]); st.sel = null; say(w.dirty ? 'Back to the built-in layout. Not saved yet.' : 'The built-in layout.'); sync(); };
  function undo() { const w = work(); if (!w.undo.length) return; w.set = JSON.parse(w.undo.pop()); w.dirty = true; sync(); }
  $('undo').onclick = undo;
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d && st.sel) { e.preventDefault(); nudge(d[0] * (e.shiftKey ? 10 : 1), d[1] * (e.shiftKey ? 10 : 1)); }
    if (e.key === 'Escape') { st.sel = null; draw(); }
  });
  $('over').addEventListener('pointerdown', (e) => { if (e.target === $('over')) { st.sel = null; draw(); } });

  // ---- Save: the local server writes play/layouts.json, the file the real pads read ----
  $('save').onclick = async () => {
    $('save').disabled = true;
    try {
      for (const [k, w] of Object.entries(st.works)) {
        if (!w.dirty) continue;
        const [pad, way] = k.split('.');
        const set = w.set ? { parts: w.set.parts, fit: L.fitOf(w.set.parts, WIDEST, way === 'up') } : null;
        const r = await fetch('/api/layout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pad, way, set }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'the server said ' + r.status);
        st.file = L.clean(j.file); w.dirty = false;
      }
      say('Saved to play/layouts.json. Players get it after the next push.', 'ok');
    } catch (e) {
      say('Not saved: ' + (/^(127\.0\.0\.1|localhost)$/.test(location.hostname) ? e.message : 'Save works on this PC only, from the local PLAY server (node play/serve.js).'), 'bad');
    }
    draw();
  };
  addEventListener('beforeunload', (e) => { if (Object.values(st.works).some((w) => w.dirty)) { e.preventDefault(); e.returnValue = ''; } });

  // ---- Choosing what to look at ----
  async function game() {
    const id = GAMES[st.game][1];
    if (!st.cards[id]) st.cards[id] = await (await fetch('../cards/' + id + '.json')).json();
    st.door.draw(PADS[st.pad].card(st.cards[id]));
    later(sync);
  }
  function open() {
    st.door = null; for (const el of handles.values()) el.remove(); handles.clear();
    $('frame').onload = () => { st.door = PADS[st.pad].door($('frame').contentWindow); if (st.door) game(); else say('The pad page did not open its door to the editor.', 'bad'); };
    $('frame').src = PADS[st.pad].src;
  }
  function turn(way) { st.way = way; st.sel = null; frame(); later(() => { sync(); low(); }); }
  // At true size an upright phone is taller than the window: start at its lower half, where the parts are.
  const low = () => { if (st.full) $('stage').scrollTop = st.way === 'up' ? $('stage').scrollHeight : 0; };
  $('zoom').onclick = () => { st.full = !st.full; frame(); later(() => { sync(); low(); }); };
  $('way-side').onclick = () => turn('side'); $('way-up').onclick = () => turn('up');
  for (const [id, p] of Object.entries(PADS)) $('pad').add(new Option(p.name, id));
  $('pad').onchange = () => { st.pad = $('pad').value; st.sel = null; open(); };
  PHONES.forEach(([name, long, short], i) => $('phone-size').add(new Option(name + ' (' + long + ' x ' + short + ')', i)));
  $('phone-size').onchange = () => { st.phone = +$('phone-size').value; frame(); later(sync); };
  GAMES.forEach(([name], i) => $('game').add(new Option(name, i)));
  $('game').onchange = () => { st.game = +$('game').value; game(); };
  addEventListener('resize', () => { frame(); later(sync); });
  $('where').textContent = 'Save writes play/layouts.json on this PC. A pad with no saved layout keeps its built-in one.';
  fetch('../layouts.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((f) => { st.file = L.clean(f); frame(); open(); });
})(typeof self !== 'undefined' ? self : this);
